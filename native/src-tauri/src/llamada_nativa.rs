
// ═══════════════════════════════════════════════════════════════════════════
// llamada_nativa — comandos de la integración de las llamadas con el teléfono (LLA1108D, 2026-11-08).
// Contrato: architecture/llamadas-telefonia.md § «Integración nativa». Lo puro (con pruebas) está en
// llamada_nativa_logica.rs.
// ---------------------------------------------------------------------------
//   · Android: Rust escribe una cola de peticiones y Kotlin (LlamadaNativaStarSeed.kt, inyectado por
//     build.rs) hace la llamada «de verdad» para el sistema: cuenta de teléfono autogestionada (Telecom),
//     aviso CallStyle con pantalla completa, servicio en primer plano `phoneCall`, rutas de audio y sensor
//     de proximidad. Lo que pase allí (contestar desde el aviso, un botón de los auriculares…) vuelve en
//     `estado.json` y aquí se emite a la web como `llamada-nativa://<evento>`.
//   · macOS: mientras hay una llamada activa el Mac no se duerme (`NSProcessInfo.beginActivity`).
//   · Windows y Linux: no hacen nada y lo dicen en `llamada_nativa_capacidades`.
// Comandos: `llamada_nativa_iniciar`, `llamada_nativa_estado`, `llamada_nativa_ruta_audio`,
// `llamada_nativa_proximidad`, `llamada_nativa_capacidades` y `llamada_nativa_permiso` (la usa el asistente
// de permisos del primer arranque). Eventos: `llamada-nativa://contestar|rechazar|colgar|silenciar|ruta|
// proximidad|espera`.
// ═══════════════════════════════════════════════════════════════════════════

use crate::llamada_nativa_logica as logica;
pub use logica::CapacidadesLlamada;
use serde::Serialize;
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

#[cfg(target_os = "android")]
use std::sync::atomic::{AtomicU64, Ordering};
#[cfg(target_os = "android")]
use std::time::Duration;

fn ahora_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// La llamada que sigue la parte nativa (una a la vez).
static SESION: Mutex<Option<logica::Sesion>> = Mutex::new(None);
#[cfg_attr(not(target_os = "android"), allow(dead_code))]
static VIGIA: AtomicBool = AtomicBool::new(false);

fn sesion() -> std::sync::MutexGuard<'static, Option<logica::Sesion>> {
    SESION.lock().unwrap_or_else(|e| e.into_inner())
}

/// Lo que devuelven `iniciar` y `estado`: la fase nativa de ahora (la web no necesita más).
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct EstadoNativo {
    pub id: String,
    pub estado: String,
    /// Android: la llamada va por Telecom (si no, solo aviso y servicio: suena igual, sin botones de auriculares).
    pub telecom: bool,
}

// ─────────────────────────────── Android ───────────────────────────────

#[cfg(target_os = "android")]
static DIR_APP: std::sync::OnceLock<std::path::PathBuf> = std::sync::OnceLock::new();
#[cfg(target_os = "android")]
static SECUENCIA: AtomicU64 = AtomicU64::new(0);

/// La carpeta que comparte con LlamadaNativaStarSeed.kt: la del guardián (si arrancó) o la de la app; la
/// primera que tenga el `estado.json` de Kotlin.
#[cfg(target_os = "android")]
fn dir_android() -> Option<std::path::PathBuf> {
    let candidatas: Vec<std::path::PathBuf> = crate::android::dir_datos()
        .map(|d| d.join(logica::CARPETA_ANDROID))
        .into_iter()
        .chain(DIR_APP.get().cloned())
        .collect();
    candidatas.iter().find(|d| d.join(logica::ESTADO).is_file()).cloned().or_else(|| candidatas.into_iter().next())
}

#[cfg(target_os = "android")]
fn dir_con_modulo() -> Result<std::path::PathBuf, String> {
    let d = dir_android().ok_or("La parte Android de StarSeed no arrancó (sin carpeta compartida).")?;
    if logica::leer_estado(&d).is_none() {
        return Err("Este APK no trae las llamadas nativas (llegaron con LLA1108D): actualízalo.".into());
    }
    Ok(d)
}

/// Mete una petición en la cola de Kotlin. Los números suben siempre (la hora en µs como base).
#[cfg(target_os = "android")]
fn pedir_android(texto: Result<String, String>) -> Result<(), String> {
    let d = dir_con_modulo()?;
    let base = ahora_ms().saturating_mul(1000);
    let previo = SECUENCIA.fetch_update(Ordering::SeqCst, Ordering::SeqCst, |a| Some(a.max(base.saturating_sub(1)) + 1)).unwrap_or(0);
    let n = previo.max(base.saturating_sub(1)) + 1;
    logica::escribir_peticion(&d, n, &texto?).map(|_| ())
}

/// Vigía: mientras haya una llamada, lee `estado.json` cada 200 ms y emite lo nuevo; sin llamada, duerme.
#[cfg(target_os = "android")]
fn vigilar(app: &AppHandle) {
    use tauri::Manager;
    if DIR_APP.get().is_none() {
        if let Ok(d) = app.path().app_data_dir() {
            let _ = DIR_APP.set(d.join("files").join("starseed").join(logica::CARPETA_ANDROID));
        }
    }
    if VIGIA.swap(true, Ordering::SeqCst) {
        return;
    }
    let h = app.clone();
    let _ = std::thread::Builder::new().name("starseed-llamada-nativa".into()).spawn(move || {
        let mut seg = logica::Seguimiento::default();
        loop {
            let hay = sesion().is_some();
            std::thread::sleep(Duration::from_millis(if hay { 200 } else { 1000 }));
            if !hay {
                continue;
            }
            let Some(estado) = dir_android().and_then(|d| logica::leer_estado(&d)) else { continue };
            for (nombre, carga) in logica::eventos_nuevos(&estado, &mut seg) {
                emitir_evento(&h, &nombre, &carga.id, carga.valor);
            }
        }
    });
}

#[cfg(not(target_os = "android"))]
fn vigilar(_app: &AppHandle) {}

// ─────────────────────────────── macOS: no dormir durante la llamada ───────────────────────────────

#[cfg(target_os = "macos")]
mod mac {
    use objc2::rc::Retained;
    use objc2::runtime::ProtocolObject;
    use objc2_foundation::{NSActivityOptions, NSObjectProtocol, NSProcessInfo, NSString};
    use std::sync::Mutex;

    struct Actividad(Retained<ProtocolObject<dyn NSObjectProtocol>>);
    // El token es un objeto de Foundation que solo se entrega de vuelta a `endActivity`.
    unsafe impl Send for Actividad {}

    static ACTUAL: Mutex<Option<Actividad>> = Mutex::new(None);

    /// Evita App Nap y la suspensión por inactividad mientras la llamada está activa.
    pub fn empezar() {
        let mut a = ACTUAL.lock().unwrap_or_else(|e| e.into_inner());
        if a.is_some() {
            return;
        }
        let info = NSProcessInfo::processInfo();
        let motivo = NSString::from_str("Llamada de StarSeed en curso");
        let token = info.beginActivityWithOptions_reason(NSActivityOptions::UserInitiated | NSActivityOptions::LatencyCritical, &motivo);
        *a = Some(Actividad(token));
    }

    pub fn terminar() {
        let mut a = ACTUAL.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(act) = a.take() {
            // SAFETY: es el token que devolvió `beginActivityWithOptions_reason` y se usa una sola vez.
            unsafe { NSProcessInfo::processInfo().endActivity(&act.0) };
        }
    }
}

/// Escritorio: no dormir mientras la llamada está activa (macOS); el resto no hace nada.
fn efecto_escritorio(fase: logica::Fase) {
    #[cfg(target_os = "macos")]
    {
        match fase {
            logica::Fase::Activa | logica::Fase::EnEspera => mac::empezar(),
            logica::Fase::Terminada => mac::terminar(),
            logica::Fase::Sonando => {}
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = fase;
    }
}

// ─────────────────────────────── Comandos ───────────────────────────────

/// Capacidades de este aparato en llamadas (qué hace la parte nativa y qué falta).
#[tauri::command]
pub fn llamada_nativa_capacidades(app: AppHandle) -> CapacidadesLlamada {
    vigilar(&app);
    capacidades_actuales()
}

#[cfg(target_os = "android")]
fn capacidades_actuales() -> CapacidadesLlamada {
    logica::capacidades_android(dir_android().and_then(|d| logica::leer_estado(&d)).as_ref())
}

#[cfg(target_os = "macos")]
fn capacidades_actuales() -> CapacidadesLlamada {
    logica::capacidades_macos()
}

#[cfg(not(any(target_os = "android", target_os = "macos")))]
fn capacidades_actuales() -> CapacidadesLlamada {
    logica::capacidades_sin_soporte(std::env::consts::OS, "Este sistema no tiene integración nativa de llamadas: la llamada vive en la ventana de StarSeed.")
}

#[cfg(target_os = "android")]
fn telecom_actual() -> bool {
    dir_android().and_then(|d| logica::leer_estado(&d)).map(|e| e.telecom).unwrap_or(false)
}

#[cfg(not(target_os = "android"))]
fn telecom_actual() -> bool {
    false
}

/// Empieza una llamada nativa (suena aquí o suena en el otro aparato). Una sola a la vez.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn llamada_nativa_iniciar(
    app: AppHandle,
    id: String,
    nombre: String,
    tipo: String,
    entrante: bool,
    iniciales: Option<String>,
    medio: Option<String>,
    uid: Option<String>,
    neurona: Option<String>,
    chat: Option<String>,
    silencio_hasta: Option<u64>,
) -> Result<EstadoNativo, String> {
    vigilar(&app);
    let extras = logica::ExtrasIniciar { iniciales: iniciales.clone(), medio: medio.clone(), uid: uid.clone(), neurona: neurona.clone(), chat: chat.clone(), silencio_hasta, via: None };
    let peticion = logica::peticion_iniciar_ext(&id, &nombre, &tipo, entrante, ahora_ms(), &extras)?;
    {
        let mut s = sesion();
        match logica::decidir_inicio(s.as_ref(), &id) {
            logica::Inicio::Ocupado(otra) => return Err(format!("Ya hay una llamada nativa en curso ({otra}).")),
            logica::Inicio::Repetida => return Ok(EstadoNativo { id, estado: s.as_ref().map(|x| x.fase.texto()).unwrap_or("sonando").into(), telecom: telecom_actual() }),
            logica::Inicio::Nueva => *s = Some(logica::Sesion { id: id.clone(), fase: logica::Fase::Sonando }),
        }
    }
    #[cfg(target_os = "android")]
    if let Err(e) = pedir_android(Ok(peticion)) {
        *sesion() = None;
        return Err(e);
    }
    #[cfg(not(target_os = "android"))]
    let _ = peticion;
    // (LLA1108F) Escritorio: la llamada que entra con la app fuera de vista abre su ventana siempre visible.
    if entrante && silencio_hasta.is_none() {
        let datos = crate::llamada_entrante_logica::DatosVentana {
            id: id.clone(),
            nombre: nombre.clone(),
            iniciales: iniciales.unwrap_or_default(),
            video: tipo == "video",
            medio: medio.unwrap_or_default(),
            uid,
            neurona,
            chat,
        };
        crate::llamada_entrante::abrir_ventana(&app, datos);
    }
    Ok(EstadoNativo { id, estado: "sonando".into(), telecom: telecom_actual() })
}

/// (LLA1108F) «Ignorar»: deja de sonar y de tapar la pantalla, pero la llamada sigue viva para quien llama (no ve
/// «rechazada») y queda como perdida cuando se acaba el tiempo. Android lo para en Kotlin; escritorio cierra su ventana.
#[tauri::command]
pub fn llamada_nativa_ignorar(app: AppHandle, id: String) -> Result<bool, String> {
    let peticion = logica::peticion_ignorar(&id, ahora_ms())?;
    crate::llamada_entrante::cerrar_ventana(&app, &id);
    #[cfg(target_os = "android")]
    {
        pedir_android(Ok(peticion))?;
    }
    #[cfg(not(target_os = "android"))]
    let _ = peticion;
    Ok(true)
}

/// (LLA1108F) Lo que Kotlin o la ventana de escritorio contaron en el último minuto y la web aún no vio (la app
/// estaba cerrada o arrancando): se entrega una vez. Así «Contestar» desde la pantalla de bloqueo con la app
/// cerrada no se pierde.
#[tauri::command]
pub fn llamada_nativa_recientes() -> Vec<EventoReciente> {
    let ahora = ahora_ms();
    let mut r = RECIENTES.lock().unwrap_or_else(|e| e.into_inner());
    let fuera: Vec<EventoReciente> = r.drain(..).filter(|e| ahora.saturating_sub(e.t) <= logica::VIDA_RECIENTE_MS).collect();
    fuera
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct EventoReciente {
    pub evento: String,
    pub id: String,
    pub valor: serde_json::Value,
    pub t: u64,
}

static RECIENTES: Mutex<Vec<EventoReciente>> = Mutex::new(Vec::new());

/// Apunta un evento para quien llegue tarde y lo emite a la web (la misma vía para Kotlin y la ventana de escritorio).
pub fn emitir_evento(app: &AppHandle, nombre: &str, id: &str, valor: serde_json::Value) {
    use tauri::Emitter;
    let corto = nombre.strip_prefix(logica::PREFIJO_EVENTO).unwrap_or(nombre).to_string();
    {
        let mut r = RECIENTES.lock().unwrap_or_else(|e| e.into_inner());
        r.push(EventoReciente { evento: corto, id: id.to_string(), valor: valor.clone(), t: ahora_ms() });
        let sobran = r.len().saturating_sub(logica::TOPE_EVENTOS);
        r.drain(..sobran);
    }
    let _ = app.emit(&format!("{}{}", logica::PREFIJO_EVENTO, nombre.strip_prefix(logica::PREFIJO_EVENTO).unwrap_or(nombre)), serde_json::json!({ "id": id, "valor": valor }));
}

/// ¿Esta llamada ya la tiene la parte nativa (la web la reclamó o el despertador la hizo sonar)?
pub fn sesion_es(id: &str) -> bool {
    sesion().as_ref().map(|s| s.id == id).unwrap_or(false)
}

/// La carpeta compartida con Kotlin (Android) o la de datos de la app (escritorio): ahí vive `silencios-llamadas.json`.
pub fn dir_compartido(app: &AppHandle) -> Option<std::path::PathBuf> {
    #[cfg(target_os = "android")]
    {
        let _ = app;
        dir_android()
    }
    #[cfg(not(target_os = "android"))]
    {
        use tauri::Manager;
        app.path().app_data_dir().ok()
    }
}

/// (LLA1108F) El despertador: una trama «timbre» verificada y la web no reclamó la llamada a tiempo. Android hace
/// sonar la llamada nativa sin WebView; al contestar abre la app y la web completa la llamada.
#[cfg(target_os = "android")]
pub fn sonar_desde_timbre(app: &AppHandle, t: &crate::llamada_entrante_logica::Timbre, silencio_hasta: Option<u64>) -> Result<(), String> {
    vigilar(app);
    let iniciales: String = t.nombre.split_whitespace().filter_map(|p| p.chars().next()).take(2).collect::<String>().to_uppercase();
    let extras = logica::ExtrasIniciar {
        iniciales: Some(iniciales),
        medio: Some(t.medio.clone()),
        neurona: Some(t.neurona.clone()),
        silencio_hasta,
        via: Some("timbre".into()),
        ..Default::default()
    };
    let peticion = logica::peticion_iniciar_ext(&t.id, &t.nombre, &t.tipo, true, ahora_ms(), &extras)?;
    {
        let mut s = sesion();
        match logica::decidir_inicio(s.as_ref(), &t.id) {
            logica::Inicio::Nueva => *s = Some(logica::Sesion { id: t.id.clone(), fase: logica::Fase::Sonando }),
            _ => return Ok(()),
        }
    }
    if let Err(e) = pedir_android(Ok(peticion)) {
        *sesion() = None;
        return Err(e);
    }
    Ok(())
}

/// Cambia el estado de la llamada: sonando, activa, en-espera o terminada. `silenciada` (opcional) pone al
/// día el texto del aviso («Silenciar»/«Activar micrófono»).
#[tauri::command]
pub fn llamada_nativa_estado(app: AppHandle, id: String, estado: String, silenciada: Option<bool>) -> Result<EstadoNativo, String> {
    let nueva = {
        let s = sesion();
        logica::aplicar_estado(s.as_ref(), &id, &estado)?
    };
    let peticion = logica::peticion_estado(&id, nueva, silenciada, ahora_ms())?;
    let era_la_actual = {
        let mut s = sesion();
        let coincide = s.as_ref().map(|x| x.id == id).unwrap_or(false);
        if coincide {
            if nueva == logica::Fase::Terminada {
                *s = None;
            } else if let Some(x) = s.as_mut() {
                x.fase = nueva;
            }
        }
        coincide
    };
    // (LLA1108F) Contestada, en espera o terminada: la ventana de escritorio sobra.
    crate::llamada_entrante::cerrar_por_estado(&app, &id, nueva.texto());
    if era_la_actual {
        efecto_escritorio(nueva);
        #[cfg(target_os = "android")]
        {
            // Si Kotlin no está (APK viejo) la llamada web sigue igual: el error solo se cuenta.
            pedir_android(Ok(peticion))?;
        }
        #[cfg(not(target_os = "android"))]
        let _ = peticion;
    }
    Ok(EstadoNativo { id, estado: nueva.texto().into(), telecom: telecom_actual() })
}

/// Pasa el audio a otra ruta: auricular, altavoz, cableado o bluetooth (Android; en escritorio, el sistema).
#[tauri::command]
pub fn llamada_nativa_ruta_audio(ruta: String) -> Result<bool, String> {
    let peticion = logica::peticion_ruta(&ruta, ahora_ms())?;
    #[cfg(target_os = "android")]
    {
        pedir_android(Ok(peticion))?;
        Ok(true)
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = peticion;
        Err("El audio de la llamada lo encamina el sistema en este aparato.".into())
    }
}

/// La web dice si quiere que el sensor de proximidad apague la pantalla (se apaga a propósito con vídeo o
/// altavoz). Kotlin solo lo sostiene en voz, con el auricular y llamada activa.
#[tauri::command]
pub fn llamada_nativa_proximidad(activa: bool) -> Result<bool, String> {
    let peticion = logica::peticion_proximidad(activa, ahora_ms());
    #[cfg(target_os = "android")]
    {
        pedir_android(Ok(peticion))?;
        Ok(activa)
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = peticion;
        Err("El sensor de proximidad es de los teléfonos Android.".into())
    }
}

/// Android 14+: abre los ajustes de «Notificaciones a pantalla completa» si la app aún no puede usarlas.
/// Devuelve las capacidades de ahora (el cambio se ve al volver a la app).
#[tauri::command]
pub fn llamada_nativa_permiso(app: AppHandle) -> CapacidadesLlamada {
    vigilar(&app);
    #[cfg(target_os = "android")]
    {
        let _ = pedir_android(Ok(logica::peticion_permiso(ahora_ms())));
    }
    capacidades_actuales()
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn el_estado_nativo_no_lleva_mas_de_lo_necesario() {
        let e = serde_json::to_value(EstadoNativo { id: "a".into(), estado: "activa".into(), telecom: false }).unwrap();
        let mut claves: Vec<&String> = e.as_object().unwrap().keys().collect();
        claves.sort();
        assert_eq!(claves, ["estado", "id", "telecom"]);
    }

    #[test]
    fn sin_android_la_cola_no_se_usa_y_los_efectos_no_fallan() {
        for f in [logica::Fase::Sonando, logica::Fase::Activa, logica::Fase::EnEspera, logica::Fase::Terminada] {
            efecto_escritorio(f);
        }
        assert!(!telecom_actual());
    }

    #[test]
    fn la_sesion_sigue_las_reglas_de_la_logica() {
        // El flujo completo del estado sin Tauri (los comandos solo lo envuelven).
        *sesion() = None;
        assert_eq!(logica::decidir_inicio(sesion().as_ref(), "a"), logica::Inicio::Nueva);
        *sesion() = Some(logica::Sesion { id: "a".into(), fase: logica::Fase::Sonando });
        assert_eq!(logica::decidir_inicio(sesion().as_ref(), "b"), logica::Inicio::Ocupado("a".into()));
        assert_eq!(logica::aplicar_estado(sesion().as_ref(), "a", "activa"), Ok(logica::Fase::Activa));
        *sesion() = None;
    }
}
