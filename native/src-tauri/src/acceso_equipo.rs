//! (SEG1111U) «Acceso al equipo» en el proceso nativo (solo escritorio y solo StarSeed OS): el diálogo
//! nativo que lo concede, el archivo donde se guarda (`<config de la app>/acceso-equipo.json`, nunca en
//! el almacenamiento web), el aviso «● Acceso al equipo» en la barra de menús/bandeja con «Quitar el
//! acceso al equipo ahora» (atendido en Rust, como el de prestar ventana), la confirmación de órdenes
//! una a una y el registro de solo-añadir encadenado por hash.
//!
//! Lo puro (estado, puerta, orígenes, clases de órdenes, cadena del registro) está en
//! `acceso_equipo_logica.rs`. Contrato: architecture/permisos-y-control-del-dispositivo.md §4.8.

use crate::acceso_equipo_logica as l;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

/// Id del icono propio del acceso en la barra de menús / bandeja.
pub const ID_BANDEJA: &str = "starseed-acceso";
const MENU_QUITAR: &str = "ss-acceso-quitar";

fn puerta() -> MutexGuard<'static, l::Puerta> {
    static P: OnceLock<Mutex<l::Puerta>> = OnceLock::new();
    P.get_or_init(|| Mutex::new(l::Puerta::default())).lock().unwrap_or_else(|e| e.into_inner())
}

/// Un solo escritor del archivo y del registro a la vez.
fn cerrojo() -> MutexGuard<'static, ()> {
    static C: OnceLock<Mutex<()>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(())).lock().unwrap_or_else(|e| e.into_inner())
}

/// Una confirmación de orden a la vez (una página no puede apilar diálogos).
static CONFIRMANDO: AtomicBool = AtomicBool::new(false);

fn mono_ms() -> u64 {
    static A: OnceLock<Instant> = OnceLock::new();
    A.get_or_init(Instant::now).elapsed().as_millis() as u64
}

fn pared_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

struct Archivo(Option<PathBuf>);

impl l::Almacen for Archivo {
    fn leer(&self) -> Option<String> {
        self.0.as_ref().and_then(|p| std::fs::read_to_string(p).ok())
    }
    fn escribir(&mut self, texto: &str) -> Result<(), String> {
        let ruta = self.0.as_ref().ok_or("sin carpeta de configuración")?;
        if let Some(d) = ruta.parent() {
            std::fs::create_dir_all(d).map_err(|e| e.to_string())?;
        }
        // Escritura atómica: un corte a medias deja el archivo viejo, nunca uno ilegible «encendido».
        let tmp = ruta.with_extension("json.tmp");
        std::fs::write(&tmp, texto).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp, ruta).map_err(|e| e.to_string())
    }
}

fn archivo(app: &AppHandle) -> Archivo {
    Archivo(app.path().app_config_dir().ok().map(|d| d.join(l::ARCHIVO)))
}

fn concesion(app: &AppHandle) -> l::Concesion {
    use l::Almacen;
    l::Concesion::leer(archivo(app).leer().as_deref())
}

/// Dónde se dice el aviso, para el texto del diálogo.
fn sitio_del_aviso() -> &'static str {
    if cfg!(target_os = "macos") {
        "la barra de menús (arriba a la derecha)"
    } else {
        "la bandeja del sistema"
    }
}

fn origen_de(webview: &tauri::Webview) -> String {
    crate::prestamo_ventana::origen_de_webview(webview)
}

fn indicador_visible(app: &AppHandle) -> bool {
    app.tray_by_id(ID_BANDEJA).is_some()
}

/// La puerta de cada comando que ejecuta programas: StarSeed OS, ventana principal, origen propio,
/// concesión dada en este aparato y aviso visible. Devuelve el origen (para el registro).
pub fn exigir(app: &AppHandle, webview: &tauri::Webview, que: &str) -> Result<String, String> {
    let origen = origen_de(webview);
    let r = if !crate::nativa::es_starseed_os(app) {
        Err(l::Rechazo::NoAplica)
    } else {
        l::autorizar(&concesion(app), webview.label(), &origen, indicador_visible(app))
    };
    match r {
        Ok(()) => Ok(origen),
        Err(e) => {
            anotar(app, "rechazada", &origen, &format!("{que} · {}", e.codigo()));
            Err(e.mensaje())
        }
    }
}

/// Diálogo nativo de sí/no (bloquea fuera del hilo del runtime). La página no puede contestarlo.
pub async fn dialogo(app: &AppHandle, titulo: &str, texto: String, si: &str, no: &str) -> bool {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
    let d = app
        .dialog()
        .message(texto)
        .title(titulo.to_string())
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom(si.into(), no.into()));
    tauri::async_runtime::spawn_blocking(move || d.blocking_show()).await.unwrap_or(false)
}

/// Confirma UNA orden con su texto y sus clases. Una a la vez; la página que navega mientras tanto
/// pierde la respuesta. Devuelve Ok si la persona dijo «sí».
pub async fn confirmar(app: &AppHandle, webview: &tauri::Webview, titulo: &str, texto: String, si: &str) -> Result<(), String> {
    if CONFIRMANDO.swap(true, Ordering::SeqCst) {
        return Err(l::Rechazo::Pendiente.mensaje());
    }
    let origen = origen_de(webview);
    let dijo = dialogo(app, titulo, texto, si, "No").await;
    CONFIRMANDO.store(false, Ordering::SeqCst);
    if dijo && origen_de(webview) == origen {
        Ok(())
    } else {
        Err(l::Rechazo::NoConfirmado.mensaje())
    }
}

/// Lo que la página puede saber: si está dado, desde cuándo, y si este aparato puede darlo.
#[derive(serde::Serialize, Clone)]
pub struct EstadoAcceso {
    pub activo: bool,
    pub desde_ms: u64,
    /// Este aparato y esta app pueden darlo (escritorio, StarSeed OS, con bandeja).
    pub disponible: bool,
    /// Por qué no está disponible, en una frase (vacío si lo está).
    pub motivo: String,
    /// La cadena del registro de este aparato está entera (ninguna línea cambiada ni quitada).
    pub registro_integro: bool,
}

fn estado(app: &AppHandle) -> EstadoAcceso {
    let c = concesion(app);
    let (disponible, motivo) = if !crate::nativa::es_starseed_os(app) {
        (false, "Solo StarSeed OS ejecuta programas; esta app no.".to_string())
    } else if !crate::segundo_plano::bandeja_posible() {
        (false, "Este sistema no puede enseñar el aviso en la bandeja (falta libayatana-appindicator3): sin aviso visible no se concede.".to_string())
    } else {
        (true, String::new())
    };
    let registro_integro = ruta_registro(app)
        .and_then(|r| std::fs::read_to_string(r).ok())
        .map(|t| l::verificar_registro(&t).is_ok())
        .unwrap_or(true);
    EstadoAcceso { activo: c.activo && indicador_visible(app), desde_ms: c.desde_ms, disponible, motivo, registro_integro }
}

#[tauri::command]
pub fn acceso_equipo_estado(app: AppHandle) -> EstadoAcceso {
    estado(&app)
}

/// Pide «acceso al equipo». Rust enseña el diálogo nativo; solo su «sí» lo enciende. `motivo` es el
/// nombre de la función que lo pide, tal como lo da la página (el diálogo lo marca así).
#[tauri::command]
pub async fn acceso_equipo_pedir(app: AppHandle, webview: tauri::Webview, motivo: String) -> Result<EstadoAcceso, String> {
    if !crate::nativa::es_starseed_os(&app) {
        return Err(l::Rechazo::NoAplica.mensaje());
    }
    if !crate::segundo_plano::bandeja_posible() {
        return Err(l::Rechazo::SinIndicador.mensaje());
    }
    let origen = origen_de(&webview);
    let ventana = webview.label().to_string();
    let texto = l::texto_concesion(&motivo, sitio_del_aviso());
    // El diálogo es asíncrono: la puerta se toma y se suelta fuera, y el «sí» se pasa a `pedir`.
    let ya = concesion(&app);
    if ya.activo {
        let _ = poner_indicador(&app, &ya);
        return Ok(estado(&app));
    }
    if ventana != "main" {
        return Err(l::Rechazo::Ventana.mensaje());
    }
    if !l::origen_permitido(&origen) {
        anotar(&app, "pedido rechazado", &origen, "origen");
        return Err(l::Rechazo::Origen.mensaje());
    }
    puerta().empezar(mono_ms()).map_err(|e| e.mensaje())?;
    anotar(&app, "pedida", &origen, &l::limpiar_motivo(&motivo));
    let si = dialogo(&app, "StarSeed OS · ¿Dar acceso al equipo?", texto, "Dar acceso", "No").await;
    let origen_tras = origen_de(&webview);
    puerta().terminar(true, mono_ms()); // la puerta de `pedir` decide el «no» de abajo
    let r = {
        let _c = cerrojo();
        let mut a = archivo(&app);
        let mut p = puerta();
        l::pedir(&mut a, &mut p, &ventana, &origen, pared_ms(), mono_ms(), || (si, origen_tras))
    };
    match r {
        Ok(c) => {
            if let Err(e) = poner_indicador(&app, &c) {
                // Falla cerrado: sin aviso visible, sin acceso.
                let _c = cerrojo();
                let _ = l::revocar(&mut archivo(&app));
                anotar(&app, "quitada", &origen, &format!("sin aviso visible: {e}"));
                return Err(l::Rechazo::SinIndicador.mensaje());
            }
            anotar(&app, "concedida", &origen, "diálogo nativo: «Dar acceso»");
            Ok(estado(&app))
        }
        Err(e) => {
            anotar(&app, "no concedida", &origen, &e.codigo());
            Err(e.mensaje())
        }
    }
}

/// Quita «acceso al equipo» (quitar siempre se puede, sin diálogo).
#[tauri::command]
pub fn acceso_equipo_revocar(app: AppHandle, webview: tauri::Webview) -> EstadoAcceso {
    quitar(&app, &format!("desde la página ({})", origen_de(&webview)));
    estado(&app)
}

fn quitar(app: &AppHandle, quien: &str) {
    let habia = {
        let _c = cerrojo();
        l::revocar(&mut archivo(app)).unwrap_or(false)
    };
    let _ = app.remove_tray_by_id(ID_BANDEJA);
    if habia {
        anotar(app, "quitada", "", quien);
    }
}

/// Al arrancar: si la concesión está dada, el aviso vuelve a la barra de menús/bandeja. Si no se puede
/// enseñar, los comandos se niegan (`SinIndicador`) hasta que se pueda: nunca acceso sin aviso.
pub fn iniciar(app: &AppHandle) {
    if !crate::nativa::es_starseed_os(app) {
        return;
    }
    let c = concesion(app);
    if c.activo && crate::segundo_plano::bandeja_posible() {
        if let Err(e) = poner_indicador(app, &c) {
            anotar(app, "sin aviso al arrancar", "", &e.to_string());
        }
    }
}

fn poner_indicador(app: &AppHandle, c: &l::Concesion) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
    use tauri::tray::TrayIconBuilder;
    if app.tray_by_id(ID_BANDEJA).is_some() {
        return Ok(());
    }
    let desde = crate::ble::iso_utc(c.desde_ms);
    let info = MenuItem::with_id(app, "ss-acceso-info", format!("Acceso al equipo dado ({} UTC)", desde.get(..16).unwrap_or(&desde)), false, None::<&str>)?;
    let nota = MenuItem::with_id(app, "ss-acceso-nota", "Las órdenes delicadas se confirman una a una", false, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quitar_item = MenuItem::with_id(app, MENU_QUITAR, "Quitar el acceso al equipo ahora", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&info, &nota, &sep, &quitar_item])?;
    let mut b = TrayIconBuilder::with_id(ID_BANDEJA)
        .menu(&menu)
        .tooltip("StarSeed OS tiene acceso al equipo en esta neurona")
        .title("● Acceso al equipo")
        .show_menu_on_left_click(true)
        // Atendido en Rust: aunque la página esté colgada o comprometida, quitar funciona.
        .on_menu_event(|app, ev| {
            if ev.id().as_ref() == MENU_QUITAR {
                quitar(app, "la persona, desde el menú del aviso");
            }
        });
    if let Some(icono) = app.default_window_icon() {
        b = b.icon(icono.clone());
    }
    b.build(app)?;
    Ok(())
}

// ─────────────────────────── Registro ───────────────────────────

fn ruta_registro(app: &AppHandle) -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        let _ = app;
        std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Library/Logs/app.starseed.os").join(l::REGISTRO))
    }
    #[cfg(not(target_os = "macos"))]
    {
        app.path().app_data_dir().ok().map(|d| d.join(l::REGISTRO))
    }
}

/// Apunta un suceso en el registro de solo-añadir (con la orden, si la hay: el registro es de la persona
/// y vive en su aparato) y una línea corta `[acceso]` en `enlaces.log` SIN la orden (ese registro se
/// comparte en las rondas de prueba).
pub fn anotar(app: &AppHandle, evento: &str, origen: &str, detalle: &str) {
    let t = crate::ble::iso_utc(pared_ms());
    if let Some(ruta) = ruta_registro(app) {
        let _c = cerrojo();
        if let Some(d) = ruta.parent() {
            let _ = std::fs::create_dir_all(d);
        }
        let anterior = std::fs::read_to_string(&ruta).map(|t| l::ultimo_hash(&t)).unwrap_or_else(|_| l::INICIO_CADENA.to_string());
        let linea = l::linea_registro(&anterior, &t, evento, origen, detalle);
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&ruta) {
            let _ = writeln!(f, "{linea}");
        }
    }
    anotar_enlaces(app, evento);
}

/// La línea corta de `enlaces.log` (mismo sitio y formato que `[prestamo]`), sin orden ni detalle.
fn anotar_enlaces(app: &AppHandle, evento: &str) {
    #[cfg(target_os = "macos")]
    let ruta = {
        let _ = app;
        std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Library/Logs/app.starseed.os/enlaces.log"))
    };
    #[cfg(not(target_os = "macos"))]
    let ruta = app.path().app_data_dir().ok().map(|d| d.join("enlaces.log"));
    let Some(ruta) = ruta else { return };
    let linea = format!("{} [acceso] {}", crate::ble::iso_utc(pared_ms()), crate::ble::linea_limpia(evento, 120));
    let _ = crate::ble::anexar_rotando(&ruta, &[linea], 4 * 1024 * 1024);
}
