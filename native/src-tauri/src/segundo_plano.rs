// ═══════════════════════════════════════════════════════════════════════════
// segundo_plano — la app sigue viva al cerrar la ventana (ESCRITORIO), 2026-10-10.
// Contrato: architecture/apps-nativas-segundo-plano.md §2.2 (macOS, Windows, Linux).
// ---------------------------------------------------------------------------
//   · Cerrar la ventana la OCULTA (no sale) si «Segundo plano» está encendido y
//     hay por dónde volver: icono en la bandeja (Windows/Linux/macOS) o el Dock
//     (macOS). Si la bandeja no se pudo crear (p. ej. Linux sin appindicator),
//     cerrar SALE como siempre: nunca se deja una app viva sin forma de volver.
//   · La bandeja dice qué antenas están vivas y tiene «Abrir StarSeed» y «Salir
//     del todo».
//   · Al arrancar con el sistema (autostart con `--segundo-plano`) la ventana
//     empieza oculta: el guardián de antenas trabaja y la web no molesta.
//   · La primera vez que se oculta, un aviso dice dónde sigue y cómo salir.
// Preferencia en <app_config_dir>/segundo-plano.json. Solo `#[cfg(desktop)]`.
// ═══════════════════════════════════════════════════════════════════════════

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Window, WindowEvent, Wry};

use crate::antenas::{EstadoAntenas, Guardian};

pub const ARG_SEGUNDO_PLANO: &str = "--segundo-plano";
const ARCHIVO: &str = "segundo-plano.json";

#[derive(Serialize, Deserialize, Clone, Copy)]
struct Preferencia {
    activo: bool,
    avisado: bool,
}

impl Default for Preferencia {
    fn default() -> Self {
        // Encendido por defecto: es lo que pidió Alex (antenas vivas al cerrar).
        Preferencia { activo: true, avisado: false }
    }
}

pub struct EstadoEscritorio {
    activo: AtomicBool,
    avisado: AtomicBool,
    bandeja: AtomicBool,
    oculta: AtomicBool,
    item_antenas: Mutex<Option<MenuItem<Wry>>>,
    ultimo_texto: Mutex<String>,
}

#[derive(Serialize, Clone)]
pub struct EstadoSegundoPlano {
    pub plataforma: String,
    /// La persona lo tiene encendido.
    pub activo: bool,
    /// Hay icono en la bandeja (o Dock en macOS) para volver.
    pub bandeja: bool,
    /// La ventana está oculta ahora mismo (la app sigue en 2.º plano).
    pub oculta: bool,
    /// Qué pasa al cerrar la ventana, en una frase.
    pub al_cerrar: String,
}

fn leer_pref(app: &AppHandle) -> Preferencia {
    app.path()
        .app_config_dir()
        .ok()
        .and_then(|d| std::fs::read_to_string(d.join(ARCHIVO)).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

fn guardar_pref(app: &AppHandle, p: Preferencia) -> Result<(), String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join(ARCHIVO), serde_json::to_string(&p).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

fn puede_volver(e: &EstadoEscritorio) -> bool {
    e.bandeja.load(Ordering::Relaxed) || cfg!(target_os = "macos")
}

/// Muestra y enfoca la ventana principal.
pub fn mostrar(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
    if let Some(e) = app.try_state::<EstadoEscritorio>() {
        e.oculta.store(false, Ordering::Relaxed);
    }
    if let Some(g) = Guardian::actual() {
        g.marcar_segundo_plano(false);
    }
}

fn ocultar(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
    if let Some(e) = app.try_state::<EstadoEscritorio>() {
        e.oculta.store(true, Ordering::Relaxed);
    }
    if let Some(g) = Guardian::actual() {
        g.marcar_segundo_plano(true);
    }
}

/// Crea la bandeja, lee la preferencia y, si se arrancó con el sistema, oculta.
pub fn iniciar(app: &AppHandle) {
    let pref = leer_pref(app);
    let estado = EstadoEscritorio {
        activo: AtomicBool::new(pref.activo),
        avisado: AtomicBool::new(pref.avisado),
        bandeja: AtomicBool::new(false),
        oculta: AtomicBool::new(false),
        item_antenas: Mutex::new(None),
        ultimo_texto: Mutex::new(String::new()),
    };
    if bandeja_posible() {
        match crear_bandeja(app) {
            Ok(item) => {
                estado.bandeja.store(true, Ordering::Relaxed);
                if let Ok(mut i) = estado.item_antenas.lock() {
                    *i = Some(item);
                }
            }
            Err(e) => eprintln!("[starseed] sin bandeja del sistema: {e}"),
        }
    } else {
        eprintln!("[starseed] sin bandeja: falta libayatana-appindicator3; cerrar la ventana saldrá del todo.");
    }
    app.manage(estado);
    let arrancada_por_el_sistema = std::env::args().any(|a| a == ARG_SEGUNDO_PLANO);
    if arrancada_por_el_sistema && pref.activo {
        if let Some(e) = app.try_state::<EstadoEscritorio>() {
            if puede_volver(&e) {
                ocultar(app);
            }
        }
    }
}

/// En Linux, `tray-icon` ABORTA el proceso si no encuentra libayatana-appindicator3 (o
/// libappindicator3), y el perfil release lleva `panic = "abort"`: se mira antes de crearla.
/// El AppImage la trae y el .deb la declara; un Linux mínimo puede no tenerla.
#[cfg(target_os = "linux")]
pub fn bandeja_posible() -> bool {
    let mut dirs: Vec<std::path::PathBuf> = std::env::var_os("LD_LIBRARY_PATH")
        .map(|p| std::env::split_paths(&p).collect())
        .unwrap_or_default();
    for d in ["/usr/lib", "/usr/lib64", "/usr/lib/x86_64-linux-gnu", "/usr/lib/aarch64-linux-gnu", "/lib/x86_64-linux-gnu", "/lib/aarch64-linux-gnu", "/usr/local/lib"] {
        dirs.push(std::path::PathBuf::from(d));
    }
    if let Some(appdir) = std::env::var_os("APPDIR") {
        let a = std::path::PathBuf::from(appdir);
        dirs.push(a.join("usr/lib"));
        dirs.push(a.join("usr/lib/x86_64-linux-gnu"));
    }
    dirs.iter().any(|d| {
        std::fs::read_dir(d)
            .map(|it| {
                it.filter_map(|e| e.ok()).any(|e| {
                    let n = e.file_name().to_string_lossy().to_string();
                    n.starts_with("libayatana-appindicator3.so") || n.starts_with("libappindicator3.so")
                })
            })
            .unwrap_or(false)
    })
}

#[cfg(not(target_os = "linux"))]
pub fn bandeja_posible() -> bool {
    true
}

fn crear_bandeja(app: &AppHandle) -> tauri::Result<MenuItem<Wry>> {
    let abrir = MenuItem::with_id(app, "ss-abrir", "Abrir StarSeed", true, None::<&str>)?;
    let antenas = MenuItem::with_id(app, "ss-antenas", "Antenas: midiendo…", false, None::<&str>)?;
    let separador = PredefinedMenuItem::separator(app)?;
    let salir = MenuItem::with_id(app, "ss-salir", "Salir del todo (apaga las antenas)", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&abrir, &antenas, &separador, &salir])?;
    let mut b = TrayIconBuilder::with_id("starseed")
        .menu(&menu)
        .tooltip("StarSeed — antenas")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, ev| match ev.id().as_ref() {
            "ss-abrir" => mostrar(app),
            "ss-salir" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, ev| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = ev {
                mostrar(tray.app_handle());
            }
        });
    if let Some(icono) = app.default_window_icon() {
        b = b.icon(icono.clone());
    }
    b.build(app)?;
    Ok(antenas)
}

/// Llamar desde `on_window_event`: cerrar la principal la oculta si procede.
pub fn al_evento_de_ventana(window: &Window, event: &WindowEvent) {
    let WindowEvent::CloseRequested { api, .. } = event else { return };
    if window.label() != "main" {
        return;
    }
    let app = window.app_handle();
    let Some(e) = app.try_state::<EstadoEscritorio>() else { return };
    if !e.activo.load(Ordering::Relaxed) || !puede_volver(&e) {
        return; // se cierra como siempre
    }
    api.prevent_close();
    ocultar(app);
    if !e.avisado.swap(true, Ordering::Relaxed) {
        let _ = guardar_pref(app, Preferencia { activo: true, avisado: true });
        use tauri_plugin_notification::NotificationExt;
        let _ = app
            .notification()
            .builder()
            .title("StarSeed sigue en segundo plano")
            .body("Tus antenas siguen activas. Para salir del todo: icono de StarSeed en la bandeja → «Salir del todo». Se apaga en Ajustes → Antenas.")
            .show();
    }
}

/// Actualiza el texto de la bandeja con las antenas vivas. Llega desde los hilos del
/// guardián: el cambio se ENCOLA en el hilo principal (no se espera), así un guardián que
/// avisa nunca se queda bloqueado esperando a la ventana, ni al revés.
pub fn al_cambiar_antenas(app: &AppHandle, estado: &EstadoAntenas) {
    let Some(e) = app.try_state::<EstadoEscritorio>() else { return };
    let texto = crate::antenas::resumen(estado);
    if let Ok(mut ultimo) = e.ultimo_texto.lock() {
        if *ultimo == texto {
            return;
        }
        *ultimo = texto.clone();
    }
    let item = e.item_antenas.lock().ok().and_then(|i| i.clone());
    if let Some(item) = item {
        let _ = app.run_on_main_thread(move || {
            let _ = item.set_text(&texto);
        });
    }
}

pub fn estado(app: &AppHandle) -> EstadoSegundoPlano {
    let plataforma = std::env::consts::OS.to_string();
    let Some(e) = app.try_state::<EstadoEscritorio>() else {
        return EstadoSegundoPlano { plataforma, activo: false, bandeja: false, oculta: false, al_cerrar: "La app se cierra del todo.".into() };
    };
    let activo = e.activo.load(Ordering::Relaxed);
    let bandeja = puede_volver(&e);
    let al_cerrar = match (activo, bandeja) {
        (true, true) => "Cerrar la ventana la oculta: las antenas siguen; se sale desde la bandeja.".to_string(),
        (true, false) => "Este sistema no tiene bandeja disponible: cerrar la ventana sale del todo.".to_string(),
        (false, _) => "Segundo plano apagado: cerrar la ventana sale del todo.".to_string(),
    };
    EstadoSegundoPlano { plataforma, activo, bandeja, oculta: e.oculta.load(Ordering::Relaxed), al_cerrar }
}

pub fn fijar(app: &AppHandle, activo: bool) -> Result<EstadoSegundoPlano, String> {
    if let Some(e) = app.try_state::<EstadoEscritorio>() {
        e.activo.store(activo, Ordering::Relaxed);
        guardar_pref(app, Preferencia { activo, avisado: e.avisado.load(Ordering::Relaxed) })?;
    }
    Ok(estado(app))
}
