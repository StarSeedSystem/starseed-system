//! (ORD1114Q) Control entre mis neuronas · el lado NATIVO del aparato controlado: sesión, indicador,
//! parada y registro encadenado. Contrato: architecture/control-remoto-entre-neuronas.md §1 caso H y §2.4.
//!
//! · La sesión la guarda Rust (`control_neuronas_logica::Control`). La página la pide abrir y Rust solo la
//!   abre si puede enseñar el indicador; antes de ejecutar CADA orden la página pide permiso
//!   (`control_neuronas_orden`) y Rust lo anota. Sin sesión en Rust, la orden no se ejecuta.
//! · Indicador (escritorio): icono propio en la barra de menús/bandeja con el título «● Controlada por …» y
//!   el menú «Terminar el control ahora», atendido en Rust: para aunque la página esté colgada. La página no
//!   tiene `core:tray`/`core:menu` (SEG1111U), así que no lo puede quitar.
//! · Android/iOS: este pase NO trae indicador nativo (notificación en curso de Kotlin): sin indicador no hay
//!   control, así que allí la sesión se niega con «sin-indicador-nativo». Lo dice el informe de ORD1114Q.
//! · Vigía: cada segundo cierra la sesión vencida (1 h) o inactiva (2 min) y quita el indicador.
//! · Registro: `control-neuronas.log` (macOS: ~/Library/Logs/app.starseed.os; otros: datos de la app),
//!   solo-añadir y encadenado por SHA-256; guarda nombre de orden, aparato (8) y resultado, nunca contenido.

use crate::control_neuronas_logica as l;
use serde::Serialize;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

pub const EVENTO_PARADA: &str = "control-neuronas:parada";
#[cfg(desktop)]
const ID_BANDEJA: &str = "starseed-control-neuronas";
#[cfg(desktop)]
const MENU_TERMINAR: &str = "ss-control-terminar";

fn control() -> MutexGuard<'static, l::Control> {
    static C: OnceLock<Mutex<l::Control>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(l::Control::default())).lock().unwrap_or_else(|e| e.into_inner())
}

fn cerrojo_registro() -> MutexGuard<'static, ()> {
    static C: OnceLock<Mutex<()>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(())).lock().unwrap_or_else(|e| e.into_inner())
}

fn mono_ms() -> u64 {
    static A: OnceLock<Instant> = OnceLock::new();
    A.get_or_init(Instant::now).elapsed().as_millis() as u64
}

fn pared_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn token_nuevo() -> String {
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hasher};
    use std::sync::atomic::AtomicU64;
    static CONTADOR: AtomicU64 = AtomicU64::new(0);
    let n = CONTADOR.fetch_add(1, Ordering::Relaxed);
    let mut partes = [0u64; 2];
    for (i, p) in partes.iter_mut().enumerate() {
        let mut h = RandomState::new().build_hasher();
        h.write_u64(n);
        h.write_u64(i as u64);
        h.write_u64(pared_ms());
        h.write_u64(mono_ms());
        *p = h.finish();
    }
    format!("{:016x}{:016x}", partes[0], partes[1])
}

#[derive(Serialize, Clone)]
pub struct EstadoControl {
    /// ¿Este aparato puede enseñar el indicador nativo? Sin él no hay control.
    pub indicador_posible: bool,
    pub activa: bool,
    pub de: Option<String>,
    pub nombre: Option<String>,
    pub nivel: Option<String>,
    pub desde: Option<String>,
    pub ultima_parada: Option<String>,
    pub ultima_parada_motivo: Option<String>,
    pub registro_integro: Option<bool>,
}

fn estado(app: &AppHandle) -> EstadoControl {
    let c = control();
    let s = c.activa();
    EstadoControl {
        indicador_posible: indicador_posible(app),
        activa: s.is_some(),
        de: s.map(|s| s.de.chars().take(8).collect()),
        nombre: s.map(|s| s.nombre.clone()),
        nivel: s.map(|s| s.nivel.clone()),
        desde: s.map(|s| crate::ble::iso_utc(pared_ms().saturating_sub(mono_ms().saturating_sub(s.inicio_ms)))),
        ultima_parada: c.ultima_parada.as_ref().map(|(t, _)| crate::ble::iso_utc(pared_ms().saturating_sub(mono_ms().saturating_sub(*t)))),
        ultima_parada_motivo: c.ultima_parada.as_ref().map(|(_, m)| m.clone()),
        registro_integro: ruta_registro(app).and_then(|r| std::fs::read_to_string(r).ok()).map(|t| l::verificar_registro(&t).is_ok()),
    }
}

/// La página que pide algo: ventana principal y StarSeed OS. (El origen lo acota la capability.)
fn exigir_pagina(app: &AppHandle, webview: &tauri::Webview) -> Result<(), String> {
    if !crate::nativa::es_starseed_os(app) || webview.label() != "main" {
        return Err("no-aplica".into());
    }
    Ok(())
}

// ─────────────────────────── Comandos ───────────────────────────

/// Abre la sesión de control (la pide la página al aceptar «abrir-sesion»). Pone el indicador ANTES de
/// abrirla; si no puede, no hay sesión. Devuelve el token que la página pondrá en cada orden.
#[tauri::command]
pub fn control_neuronas_abrir(app: AppHandle, webview: tauri::Webview, de: String, nombre: String, nivel: String) -> Result<String, String> {
    exigir_pagina(&app, &webview)?;
    let posible = indicador_posible(&app);
    let visible = posible && poner_indicador(&app, &l::nombre_limpio(&nombre)).is_ok();
    let token = token_nuevo();
    let r = control().abrir(&token, &de, &nombre, &nivel, mono_ms(), visible).map(|s| (s.de.chars().take(8).collect::<String>(), s.nivel.clone()));
    match r {
        Ok((de8, nivel)) => {
            anotar(&app, "sesion-abierta", &format!("de={de8} nivel={nivel}"));
            Ok(token)
        }
        Err(e) => {
            if control().activa().is_none() {
                quitar_indicador(&app);
            }
            anotar(&app, "sesion-rechazada", &format!("de={} motivo={}", de.chars().take(8).collect::<String>(), e.codigo()));
            Err(e.codigo().into())
        }
    }
}

/// Antes de ejecutar CADA orden. Sin sesión viva en Rust (parada, caducada, indicador perdido), no.
#[tauri::command]
pub fn control_neuronas_orden(app: AppHandle, webview: tauri::Webview, token: String, nombre: String) -> Result<(), String> {
    exigir_pagina(&app, &webview)?;
    let visible = indicador_visible(&app);
    let r = control().orden(&token, &nombre, mono_ms(), visible).map(|s| s.de.chars().take(8).collect::<String>());
    match r {
        Ok(de8) => {
            anotar(&app, "orden", &format!("{nombre} de={de8} resultado=autorizada"));
            Ok(())
        }
        Err(e) => {
            anotar(&app, "orden", &format!("{nombre} resultado=rechazo:{}", e.codigo()));
            if control().activa().is_none() {
                quitar_indicador(&app);
            }
            Err(e.codigo().into())
        }
    }
}

/// La puerta de la página rechazó una orden: Rust lo anota en la cadena (no concede nada).
#[tauri::command]
pub fn control_neuronas_anotar(app: AppHandle, webview: tauri::Webview, nombre: String, de: String, resultado: String) -> Result<(), String> {
    exigir_pagina(&app, &webview)?;
    let nombre = if l::nombre_orden_valido(&nombre) { nombre } else { "?".into() };
    let de: String = de.chars().filter(|c| c.is_ascii_hexdigit()).take(8).collect();
    let resultado: String = resultado.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == ':').take(40).collect();
    anotar(&app, "orden", &format!("{nombre} de={de} resultado={resultado}"));
    Ok(())
}

/// Parar desde la página (botón de la banda). Parar SIEMPRE se puede.
#[tauri::command]
pub fn control_neuronas_parar(app: AppHandle, motivo: String) -> EstadoControl {
    let m: String = motivo.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').take(30).collect();
    parar(&app, if m.is_empty() { "pagina" } else { &m });
    estado(&app)
}

#[tauri::command]
pub fn control_neuronas_estado(app: AppHandle) -> EstadoControl {
    estado(&app)
}

/// Cierra la sesión en Rust, quita el indicador, lo anota y avisa a la página (si vive).
pub fn parar(app: &AppHandle, motivo: &str) {
    let s = control().parar(mono_ms(), motivo);
    quitar_indicador(app);
    if let Some(s) = s {
        anotar(app, "sesion-parada", &format!("de={} motivo={motivo}", s.de.chars().take(8).collect::<String>()));
        let _ = app.emit(EVENTO_PARADA, serde_json::json!({ "motivo": motivo }));
    }
}

/// Vigía de caducidad (1 h, 2 min sin órdenes) e indicador perdido. Una vez por proceso.
pub fn iniciar(app: &AppHandle) {
    static EN_MARCHA: AtomicBool = AtomicBool::new(false);
    if EN_MARCHA.swap(true, Ordering::SeqCst) {
        return;
    }
    let h = app.clone();
    let _ = std::thread::Builder::new().name("starseed-control-neuronas".into()).spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(1));
        let activa = control().activa().is_some();
        if !activa {
            continue;
        }
        if !indicador_visible(&h) {
            parar(&h, "sin-indicador");
            continue;
        }
        let cerrada = control().caducar(mono_ms());
        if let Some(s) = cerrada {
            quitar_indicador(&h);
            anotar(&h, "sesion-parada", &format!("de={} motivo=caducada", s.de.chars().take(8).collect::<String>()));
            let _ = h.emit(EVENTO_PARADA, serde_json::json!({ "motivo": "caducada" }));
        }
    });
}

// ─────────────────────────── Indicador ───────────────────────────

#[cfg(desktop)]
fn indicador_posible(app: &AppHandle) -> bool {
    crate::nativa::es_starseed_os(app) && crate::segundo_plano::bandeja_posible()
}

#[cfg(not(desktop))]
fn indicador_posible(_app: &AppHandle) -> bool {
    false
}

#[cfg(desktop)]
fn indicador_visible(app: &AppHandle) -> bool {
    app.tray_by_id(ID_BANDEJA).is_some()
}

#[cfg(not(desktop))]
fn indicador_visible(_app: &AppHandle) -> bool {
    false
}

#[cfg(desktop)]
fn poner_indicador(app: &AppHandle, nombre: &str) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
    use tauri::tray::TrayIconBuilder;
    if let Some(t) = app.tray_by_id(ID_BANDEJA) {
        let _ = t.set_title(Some(format!("● Controlada por {nombre}")));
        return Ok(());
    }
    let info = MenuItem::with_id(app, "ss-control-info", format!("{nombre} manda órdenes a esta neurona"), false, None::<&str>)?;
    let nota = MenuItem::with_id(app, "ss-control-nota", "Cada orden queda en el registro de este aparato", false, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let terminar = MenuItem::with_id(app, MENU_TERMINAR, "Terminar el control ahora", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&info, &nota, &sep, &terminar])?;
    let mut b = TrayIconBuilder::with_id(ID_BANDEJA)
        .menu(&menu)
        .tooltip("Otra neurona de tu cuenta controla esta (StarSeed OS)")
        .title(format!("● Controlada por {nombre}"))
        .show_menu_on_left_click(true)
        // Atendido en Rust: aunque la página esté colgada o comprometida, terminar funciona.
        .on_menu_event(|app, ev| {
            if ev.id().as_ref() == MENU_TERMINAR {
                parar(app, "la-persona-desde-el-indicador");
            }
        });
    if let Some(icono) = app.default_window_icon() {
        b = b.icon(icono.clone());
    }
    b.build(app)?;
    Ok(())
}

#[cfg(not(desktop))]
fn poner_indicador(_app: &AppHandle, _nombre: &str) -> Result<(), String> {
    Err("sin-indicador-nativo".into())
}

#[cfg(desktop)]
fn quitar_indicador(app: &AppHandle) {
    let _ = app.remove_tray_by_id(ID_BANDEJA);
}

#[cfg(not(desktop))]
fn quitar_indicador(_app: &AppHandle) {}

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

fn anotar(app: &AppHandle, evento: &str, detalle: &str) {
    let Some(ruta) = ruta_registro(app) else { return };
    let _c = cerrojo_registro();
    if let Some(d) = ruta.parent() {
        let _ = std::fs::create_dir_all(d);
    }
    let anterior = std::fs::read_to_string(&ruta).map(|t| l::ultimo_hash(&t)).unwrap_or_else(|_| l::INICIO_CADENA.to_string());
    let linea = l::linea_registro(&anterior, &crate::ble::iso_utc(pared_ms()), evento, detalle);
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&ruta) {
        let _ = writeln!(f, "{linea}");
    }
}
