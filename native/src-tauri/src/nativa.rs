// ═══════════════════════════════════════════════════════════════════════════
// nativa — los comandos que la web del OS llama en la app nativa (2026-10-10).
// Contrato: architecture/apps-nativas-segundo-plano.md §8 (tabla de comandos).
// ---------------------------------------------------------------------------
// Pegamento fino entre Tauri y los módulos puros (antenas, carpetas, disco, serie,
// android). Ningún comando finge: si algo no existe en esta plataforma, devuelve
// un error que lo dice en una frase. Envolturas tipadas: src/lib/nativa/puente.ts.
// ═══════════════════════════════════════════════════════════════════════════

use crate::antenas::{ConfigAntenas, EstadoAntenas, Guardian};
use crate::carpetas::{CarpetaConcedida, RegistroCarpetas};
use crate::disco::{self, CapaEnDisco, PeticionDescarga, Verificacion};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

pub const EVENTO_ANTENAS: &str = "starseed://antenas";
pub const EVENTO_SERIE: &str = "starseed://serie";
pub const EVENTO_SERIE_CERRADA: &str = "starseed://serie-cerrada";
pub const IDENTIFICADOR_OS: &str = "app.starseed.os";
/// Trozo máximo que sirve el NAS por llamada (contrato §5).
pub const NAS_TROZO_MAX: u32 = 256 * 1024;
const NAS_LISTA_MAX: usize = 2000;

pub struct EstadoNativo {
    dir: PathBuf,
    carpetas: Mutex<RegistroCarpetas>,
    serie: Mutex<Option<crate::serie::PuenteSerie>>,
}

fn ahora_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

pub fn es_starseed_os(app: &AppHandle) -> bool {
    app.config().identifier == IDENTIFICADOR_OS
}

fn estado_nativo(app: &AppHandle) -> Result<tauri::State<'_, EstadoNativo>, String> {
    app.try_state::<EstadoNativo>().ok_or_else(|| "La app nativa aún no terminó de arrancar.".to_string())
}

fn sin_guardian(app: &AppHandle) -> EstadoAntenas {
    if es_starseed_os(app) {
        EstadoAntenas::sin_guardian("El guardián de antenas no arrancó en este aparato.")
    } else {
        EstadoAntenas::sin_guardian("Este portal no lleva guardián de antenas: vive en StarSeed OS.")
    }
}

/// Arranque: registro de carpetas, alcance de archivos y (solo StarSeed OS) guardián.
pub fn iniciar(app: &AppHandle) {
    let base = app.path().app_data_dir().unwrap_or_else(|_| std::env::temp_dir().join("starseed-native"));
    #[cfg(target_os = "android")]
    let dir = crate::android::dir_datos().unwrap_or_else(|| base.join("starseed"));
    #[cfg(not(target_os = "android"))]
    let dir = base;
    let _ = std::fs::create_dir_all(&dir);
    let registro = RegistroCarpetas::cargar(&dir);
    #[cfg(desktop)]
    for c in &registro.carpetas {
        permitir_en_alcance(app, &c.ruta);
    }
    app.manage(EstadoNativo { dir: dir.clone(), carpetas: Mutex::new(registro), serie: Mutex::new(None) });
    if !es_starseed_os(app) {
        return;
    }
    let g = Guardian::iniciar(dir);
    let h = app.clone();
    g.al_cambiar(Arc::new(move |e: &EstadoAntenas| {
        let _ = h.emit(EVENTO_ANTENAS, e);
        #[cfg(desktop)]
        crate::segundo_plano::al_cambiar_antenas(&h, e);
    }));
}

// ───────────────────────────── Antenas ─────────────────────────────

#[tauri::command]
pub fn antenas_estado(app: AppHandle) -> EstadoAntenas {
    Guardian::actual().map(|g| g.estado()).unwrap_or_else(|| sin_guardian(&app))
}

/// Mide LoRa, Reticulum e Internet ahora (≤ ~4 s, fuera del hilo de la ventana).
#[tauri::command]
pub async fn antenas_medir(app: AppHandle) -> Result<EstadoAntenas, String> {
    let Some(g) = Guardian::actual() else { return Ok(sin_guardian(&app)) };
    tauri::async_runtime::spawn_blocking(move || {
        g.medir();
        g.estado()
    })
    .await
    .map_err(|e| e.to_string())
}

/// La configuración guardada (la web la lee, cambia un campo y la devuelve entera).
#[tauri::command]
pub fn antenas_config() -> Result<ConfigAntenas, String> {
    Guardian::actual().map(|g| g.config()).ok_or_else(|| "Esta app no lleva guardián de antenas.".to_string())
}

#[tauri::command]
pub fn antenas_configurar(config: ConfigAntenas) -> Result<EstadoAntenas, String> {
    let g = Guardian::actual().ok_or("Esta app no lleva guardián de antenas.")?;
    g.configurar(config)?;
    Ok(g.estado())
}

// ─────────────────────────── Segundo plano ───────────────────────────

#[derive(Serialize, Clone, Debug)]
pub struct EstadoFondo {
    pub plataforma: String,
    /// ¿Esta app PUEDE seguir viva con la ventana cerrada en este sistema?
    pub disponible: bool,
    /// La persona lo tiene encendido.
    pub activo: bool,
    /// Qué pasa al cerrar, en una frase.
    pub al_cerrar: String,
    /// La ventana está oculta ahora (escritorio).
    pub oculta: bool,
    /// Arranca con el sistema (None = no se pudo saber).
    pub arranque_con_sistema: Option<bool>,
    /// Lo que escribió el servicio de Android (None fuera de Android o si nunca corrió).
    pub servicio: Option<crate::android::ServicioAndroid>,
}

fn no_disponible(motivo: &str) -> EstadoFondo {
    EstadoFondo {
        plataforma: std::env::consts::OS.to_string(),
        disponible: false,
        activo: false,
        al_cerrar: motivo.to_string(),
        oculta: false,
        arranque_con_sistema: None,
        servicio: None,
    }
}

#[cfg(desktop)]
fn fondo(app: &AppHandle) -> EstadoFondo {
    use tauri_plugin_autostart::ManagerExt;
    if !es_starseed_os(app) {
        return no_disponible("Este portal se cierra del todo al cerrar la ventana.");
    }
    let e = crate::segundo_plano::estado(app);
    EstadoFondo {
        plataforma: e.plataforma,
        disponible: e.bandeja,
        activo: e.activo,
        al_cerrar: e.al_cerrar,
        oculta: e.oculta,
        arranque_con_sistema: app.autolaunch().is_enabled().ok(),
        servicio: None,
    }
}

#[cfg(target_os = "android")]
fn fondo(app: &AppHandle) -> EstadoFondo {
    if !es_starseed_os(app) {
        return no_disponible("Este portal no mantiene antenas en segundo plano.");
    }
    let Some(dir) = crate::android::dir_datos() else {
        return no_disponible("Este APK se compiló sin el servicio de antenas: al cerrar la app, Android la detiene.");
    };
    let pref = crate::android::leer_preferencia(&dir);
    let servicio = crate::android::leer_servicio(&dir);
    let al_cerrar = match (&servicio, pref.activo) {
        (_, false) => "Segundo plano apagado: al cerrar la app, Android la detiene.".to_string(),
        (Some(s), true) if s.vivo => "Las antenas siguen con la app cerrada (notificación «StarSeed · antenas»).".to_string(),
        (Some(s), true) => s.motivo.clone(),
        (None, true) => "El servicio aún no ha arrancado en este aparato.".to_string(),
    };
    EstadoFondo {
        plataforma: "android".into(),
        disponible: true,
        activo: pref.activo,
        al_cerrar,
        oculta: false,
        arranque_con_sistema: Some(pref.arranque),
        servicio,
    }
}

#[cfg(not(any(desktop, target_os = "android")))]
fn fondo(_app: &AppHandle) -> EstadoFondo {
    no_disponible("Este sistema no deja apps en segundo plano para las antenas.")
}

#[tauri::command]
pub fn fondo_estado(app: AppHandle) -> EstadoFondo {
    fondo(&app)
}

#[tauri::command]
pub fn fondo_fijar(app: AppHandle, activo: bool) -> Result<EstadoFondo, String> {
    if !es_starseed_os(&app) {
        return Err("Solo StarSeed OS mantiene antenas en segundo plano.".into());
    }
    #[cfg(desktop)]
    crate::segundo_plano::fijar(&app, activo)?;
    #[cfg(target_os = "android")]
    {
        let dir = crate::android::dir_datos().ok_or("Este APK no trae el servicio de antenas.")?;
        let mut p = crate::android::leer_preferencia(&dir);
        p.activo = activo;
        crate::android::guardar_preferencia(&dir, p)?;
    }
    #[cfg(not(any(desktop, target_os = "android")))]
    let _ = activo;
    Ok(fondo(&app))
}

#[tauri::command]
pub fn fondo_arranque(app: AppHandle, activo: bool) -> Result<EstadoFondo, String> {
    #[cfg(desktop)]
    {
        use tauri_plugin_autostart::ManagerExt;
        let r = if activo { app.autolaunch().enable() } else { app.autolaunch().disable() };
        r.map_err(|e| format!("El sistema no dejó cambiar el arranque: {e}"))?;
    }
    #[cfg(target_os = "android")]
    {
        let dir = crate::android::dir_datos().ok_or("Este APK no trae el servicio de antenas.")?;
        let mut p = crate::android::leer_preferencia(&dir);
        p.arranque = activo;
        crate::android::guardar_preferencia(&dir, p)?;
    }
    #[cfg(not(any(desktop, target_os = "android")))]
    let _ = activo;
    Ok(fondo(&app))
}

/// Android: abre el diálogo del sistema para excluir la app de la optimización de batería.
#[tauri::command]
pub fn fondo_pedir_bateria(app: AppHandle) -> Result<EstadoFondo, String> {
    #[cfg(target_os = "android")]
    {
        let dir = crate::android::dir_datos().ok_or("Este APK no trae el servicio de antenas.")?;
        crate::android::pedir(&dir, "bateria", ahora_ms())?;
        Ok(fondo(&app))
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Err("La exclusión de batería es solo de Android.".into())
    }
}

// ───────────────────────────── Carpetas ─────────────────────────────

#[cfg(desktop)]
fn permitir_en_alcance(app: &AppHandle, ruta: &str) {
    use tauri_plugin_fs::FsExt;
    if let Some(alcance) = app.try_fs_scope() {
        let _ = alcance.allow_directory(ruta, true);
    }
}

#[cfg(desktop)]
fn prohibir_en_alcance(app: &AppHandle, ruta: &str) {
    use tauri_plugin_fs::FsExt;
    if let Some(alcance) = app.try_fs_scope() {
        let _ = alcance.forbid_directory(ruta, true);
    }
}

#[tauri::command]
pub fn carpetas_listar(app: AppHandle) -> Result<Vec<CarpetaConcedida>, String> {
    let st = estado_nativo(&app)?;
    let r = st.carpetas.lock().map_err(|_| "registro de carpetas bloqueado")?;
    Ok(r.carpetas.clone())
}

/// Abre el selector NATIVO de carpetas: ese gesto es el permiso (la web no puede pasar rutas).
/// Devuelve None si la persona cierra el selector.
#[tauri::command]
pub async fn carpetas_conceder(app: AppHandle, modo: String) -> Result<Option<CarpetaConcedida>, String> {
    conceder(app, modo)
}

#[cfg(desktop)]
fn conceder(app: AppHandle, modo: String) -> Result<Option<CarpetaConcedida>, String> {
    use tauri_plugin_dialog::DialogExt;
    if modo != "lectura" && modo != "lectura-escritura" {
        return Err(format!("Modo «{modo}» desconocido (lectura o lectura-escritura)."));
    }
    let titulo = if modo == "lectura" {
        "StarSeed: elige una carpeta para LEER"
    } else {
        "StarSeed: elige una carpeta para leer y ESCRIBIR"
    };
    let Some(elegida) = app.dialog().file().set_title(titulo).blocking_pick_folder() else { return Ok(None) };
    let ruta = elegida
        .as_path()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or("El sistema devolvió una carpeta que no es una ruta local.")?;
    let personal = app.path().home_dir().ok();
    let st = estado_nativo(&app)?;
    let entrada = {
        let mut r = st.carpetas.lock().map_err(|_| "registro de carpetas bloqueado")?;
        let e = r.conceder(&ruta, &modo, ahora_ms(), personal.as_deref())?;
        r.guardar(&st.dir)?;
        e
    };
    permitir_en_alcance(&app, &entrada.ruta);
    Ok(Some(entrada))
}

#[cfg(not(desktop))]
fn conceder(_app: AppHandle, _modo: String) -> Result<Option<CarpetaConcedida>, String> {
    Err("En Android las carpetas llegarán con el selector del sistema (SAF) en la próxima versión; hoy, no.".into())
}

#[tauri::command]
pub fn carpetas_revocar(app: AppHandle, ruta: String) -> Result<Vec<CarpetaConcedida>, String> {
    let st = estado_nativo(&app)?;
    let lista = {
        let mut r = st.carpetas.lock().map_err(|_| "registro de carpetas bloqueado")?;
        if !r.revocar(&ruta) {
            return Err(format!("«{ruta}» no estaba concedida."));
        }
        r.guardar(&st.dir)?;
        r.carpetas.clone()
    };
    #[cfg(desktop)]
    prohibir_en_alcance(&app, &ruta);
    Ok(lista)
}

#[tauri::command]
pub fn carpetas_nas(app: AppHandle, ruta: String, activo: bool) -> Result<CarpetaConcedida, String> {
    let st = estado_nativo(&app)?;
    let mut r = st.carpetas.lock().map_err(|_| "registro de carpetas bloqueado")?;
    let e = r.compartir_nas(&ruta, activo)?;
    r.guardar(&st.dir)?;
    if let Some(g) = Guardian::actual() {
        // El faro anuncia «sirvo carpetas» solo si alguna está compartida.
        let algun_nas = r.carpetas.iter().any(|c| c.nas);
        let mut cfg = g.config();
        if cfg.nas != algun_nas {
            cfg.nas = algun_nas;
            let _ = g.configurar(cfg);
        }
    }
    Ok(e)
}

// ──────────────────────────── Puerto serie ────────────────────────────

#[derive(Serialize, Clone)]
struct DatosSerie {
    datos: Vec<u8>,
}

#[tauri::command]
pub fn serie_puertos() -> Vec<String> {
    crate::antenas::puertos_serie()
}

#[tauri::command]
pub fn serie_abrir(app: AppHandle, ruta: String, baudios: Option<u32>) -> Result<(), String> {
    let st = estado_nativo(&app)?;
    let candidatos = crate::antenas::puertos_serie();
    let h_datos = app.clone();
    let h_fin = app.clone();
    let ruta_fin = ruta.clone();
    let puente = crate::serie::PuenteSerie::abrir(
        &ruta,
        baudios.unwrap_or(115_200),
        &candidatos,
        Box::new(move |datos| {
            let _ = h_datos.emit(EVENTO_SERIE, DatosSerie { datos });
        }),
        Box::new(move || {
            let _ = h_fin.emit(EVENTO_SERIE_CERRADA, ruta_fin);
            if let Some(g) = Guardian::actual() {
                g.marcar_serie(None);
            }
        }),
    )?;
    {
        let mut s = st.serie.lock().map_err(|_| "puerto bloqueado")?;
        if let Some(viejo) = s.take() {
            viejo.cerrar();
        }
        *s = Some(puente);
    }
    if let Some(g) = Guardian::actual() {
        g.marcar_serie(Some(ruta));
        std::thread::spawn(move || g.medir());
    }
    Ok(())
}

#[tauri::command]
pub fn serie_escribir(app: AppHandle, datos: Vec<u8>) -> Result<(), String> {
    let st = estado_nativo(&app)?;
    let s = st.serie.lock().map_err(|_| "puerto bloqueado")?;
    s.as_ref().ok_or("No hay ninguna radio abierta.")?.escribir(&datos)
}

#[tauri::command]
pub fn serie_cerrar(app: AppHandle) -> Result<(), String> {
    let st = estado_nativo(&app)?;
    if let Some(p) = st.serie.lock().map_err(|_| "puerto bloqueado")?.take() {
        p.cerrar();
    }
    if let Some(g) = Guardian::actual() {
        g.marcar_serie(None);
        std::thread::spawn(move || g.medir());
    }
    Ok(())
}

// ───────────────────────────── Capas ─────────────────────────────

#[derive(Serialize, Clone, Debug)]
pub struct EstadoCapasDisco {
    pub dir: String,
    pub libre_bytes: Option<u64>,
    pub ocupado_bytes: u64,
    /// 15 % de (libre + ocupado), tope 8 GB. None si no se pudo medir el disco.
    pub presupuesto_bytes: Option<u64>,
    pub instaladas: Vec<CapaEnDisco>,
}

fn dir_capas(app: &AppHandle) -> Result<PathBuf, String> {
    let st = estado_nativo(app)?;
    let d = st.dir.join(disco::CARPETA_CAPAS);
    std::fs::create_dir_all(&d).map_err(|e| format!("No se pudo crear {}: {e}", d.display()))?;
    Ok(d)
}

fn medir_capas(dir: &Path) -> EstadoCapasDisco {
    let instaladas = disco::capas_instaladas(dir);
    let ocupado: u64 = instaladas.iter().map(|c| c.bytes).sum();
    let libre = disco::espacio_libre(dir);
    EstadoCapasDisco {
        dir: dir.to_string_lossy().to_string(),
        libre_bytes: libre,
        ocupado_bytes: ocupado,
        presupuesto_bytes: libre.map(|l| disco::presupuesto(l, ocupado)),
        instaladas,
    }
}

#[tauri::command]
pub async fn capas_estado(app: AppHandle) -> Result<EstadoCapasDisco, String> {
    let dir = dir_capas(&app)?;
    tauri::async_runtime::spawn_blocking(move || medir_capas(&dir)).await.map_err(|e| e.to_string())
}

/// Descarga una capa del catálogo, comprueba su SHA-256 y solo entonces la coloca.
#[tauri::command]
pub async fn capas_descargar(app: AppHandle, peticion: PeticionDescarga) -> Result<Verificacion, String> {
    let dir = dir_capas(&app)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<Verificacion, String> {
        let actual = medir_capas(&dir);
        let libre = actual.libre_bytes.ok_or("No se pudo medir el disco libre: no se descarga a ciegas.")?;
        let ocupado: u64 = actual.instaladas.iter().filter(|c| c.nombre != peticion.nombre).map(|c| c.bytes).sum();
        disco::validar_peticion(&peticion, libre, ocupado)?;
        disco::descargar(&peticion, &dir)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn capas_verificar(app: AppHandle, nombre: String, sha256: String) -> Result<Verificacion, String> {
    if !disco::nombre_seguro(&nombre) {
        return Err(format!("Nombre de archivo no válido: «{nombre}»."));
    }
    let ruta = dir_capas(&app)?.join(&nombre);
    tauri::async_runtime::spawn_blocking(move || disco::verificar(&ruta, &sha256)).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn capas_borrar(app: AppHandle, nombre: String) -> Result<bool, String> {
    if !disco::nombre_seguro(&nombre) {
        return Err(format!("Nombre de archivo no válido: «{nombre}»."));
    }
    let ruta = dir_capas(&app)?.join(&nombre);
    match std::fs::remove_file(&ruta) {
        Ok(()) => Ok(true),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(format!("No se pudo borrar {nombre}: {e}")),
    }
}

// ─────────────────────────────── NAS ───────────────────────────────

#[derive(Serialize, Clone, Debug)]
pub struct EntradaNas {
    pub nombre: String,
    pub ruta: String,
    pub carpeta: bool,
    pub bytes: u64,
    pub modificado_ms: u64,
}

/// Ruta canónica dentro de una carpeta compartida (NAS) o error. Segunda capa de permisos:
/// la web ya lo comprobó (src/lib/nativa/nas.ts), pero quien manda es el disco real.
fn ruta_nas(app: &AppHandle, ruta: &str) -> Result<PathBuf, String> {
    let canonica = std::fs::canonicalize(ruta).map_err(|e| format!("No se puede abrir «{ruta}»: {e}"))?;
    let st = estado_nativo(app)?;
    let r = st.carpetas.lock().map_err(|_| "registro de carpetas bloqueado")?;
    let canonizar = |p: &Path| std::fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf());
    if r.cubre_nas(&canonica, &canonizar).is_none() {
        return Err("Esa ruta no está dentro de ninguna carpeta compartida con tus neuronas (NAS).".into());
    }
    Ok(canonica)
}

#[tauri::command]
pub async fn nas_listar(app: AppHandle, ruta: String) -> Result<Vec<EntradaNas>, String> {
    let dir = ruta_nas(&app, &ruta)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<EntradaNas>, String> {
        let lector = std::fs::read_dir(&dir).map_err(|e| format!("No se pudo listar: {e}"))?;
        let mut v: Vec<EntradaNas> = lector
            .filter_map(|e| e.ok())
            .take(NAS_LISTA_MAX)
            .filter_map(|e| {
                let m = e.metadata().ok()?;
                let modificado_ms = m
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0);
                Some(EntradaNas {
                    nombre: e.file_name().to_string_lossy().to_string(),
                    ruta: e.path().to_string_lossy().to_string(),
                    carpeta: m.is_dir(),
                    bytes: if m.is_file() { m.len() } else { 0 },
                    modificado_ms,
                })
            })
            .collect();
        v.sort_by(|a, b| b.carpeta.cmp(&a.carpeta).then_with(|| a.nombre.to_lowercase().cmp(&b.nombre.to_lowercase())));
        Ok(v)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Lee un trozo (≤ 256 KiB) de un archivo compartido. Llega a la web como ArrayBuffer.
#[tauri::command]
pub async fn nas_leer(app: AppHandle, ruta: String, desde: u64, largo: u32) -> Result<tauri::ipc::Response, String> {
    let archivo = ruta_nas(&app, &ruta)?;
    let largo = largo.min(NAS_TROZO_MAX) as usize;
    let datos = tauri::async_runtime::spawn_blocking(move || -> Result<Vec<u8>, String> {
        use std::io::{Read, Seek, SeekFrom};
        let mut f = std::fs::File::open(&archivo).map_err(|e| format!("No se pudo abrir: {e}"))?;
        if !f.metadata().map(|m| m.is_file()).unwrap_or(false) {
            return Err("Solo se leen archivos, no carpetas.".into());
        }
        f.seek(SeekFrom::Start(desde)).map_err(|e| e.to_string())?;
        let mut buf = Vec::with_capacity(largo);
        f.take(largo as u64).read_to_end(&mut buf).map_err(|e| e.to_string())?;
        Ok(buf)
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(tauri::ipc::Response::new(datos))
}
