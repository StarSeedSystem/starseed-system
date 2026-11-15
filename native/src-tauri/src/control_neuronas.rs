//! (ORD1114Q) Control entre mis neuronas · el lado NATIVO del aparato controlado: sesión, indicador,
//! parada y registro encadenado. Contrato: architecture/control-remoto-entre-neuronas.md §1 caso H y §2.4.
//!
//! · La sesión la guarda Rust (`control_neuronas_logica::Control`). La página la pide abrir y Rust solo la
//!   abre si puede enseñar el indicador; antes de ejecutar CADA orden la página pide permiso
//!   (`control_neuronas_orden`) y Rust lo anota. Sin sesión en Rust, la orden no se ejecuta.
//! · Indicador (escritorio): icono propio en la barra de menús/bandeja con el título «● Controlada por …» y
//!   el menú «Terminar el control ahora», atendido en Rust: para aunque la página esté colgada. La página no
//!   tiene `core:tray`/`core:menu` (SEG1111U), así que no lo puede quitar.
//! · (ORD1114T) macOS además: borde rojo siempre encima en cada pantalla, atajo global fijo ⌃⌥⌘. que para, y
//!   cualquier tecla, clic o movimiento local pausa al instante (`control_neuronas_macos.rs`); «Reanudar el
//!   control» solo desde el menú del indicador.
//! · (ORD1114T) Android: notificación en curso del servicio en primer plano con «Terminar» + superposición
//!   (borde y pastilla), todo en Kotlin; la sesión y el registro siguen aquí (`control_neuronas_android.rs`).
//!   Sin interruptor nativo, notificaciones o superposición, se niega con «sin-indicador-nativo».
//! · (ORD1114T) Windows, Linux e iOS: falta el borde, el atajo o la pausa local que pide §2.4, así que allí la
//!   sesión se NIEGA («sin-indicador-nativo»): no se rebaja la condición.
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
/// (ORD1114T) Pausa o reanudación local (para que la página lo diga; no decide nada).
#[allow(dead_code)] // ORD1114T: lo usan macOS y Android, no Windows/Linux
pub const EVENTO_PAUSA: &str = "control-neuronas:pausa";
#[cfg(desktop)]
const ID_BANDEJA: &str = "starseed-control-neuronas";
#[cfg(desktop)]
#[allow(dead_code)]
const MENU_TERMINAR: &str = "ss-control-terminar";
#[cfg(desktop)]
#[allow(dead_code)]
const MENU_REANUDAR: &str = "ss-control-reanudar"; // ORD1114T

/// (ORD1114T) El AppHandle para quien no lo recibe (el atajo global de Carbon).
pub(crate) static APP: OnceLock<AppHandle> = OnceLock::new();

fn control() -> MutexGuard<'static, l::Control> {
    static C: OnceLock<Mutex<l::Control>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(l::Control::default())).lock().unwrap_or_else(|e| e.into_inner())
}

fn cerrojo_registro() -> MutexGuard<'static, ()> {
    static C: OnceLock<Mutex<()>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(())).lock().unwrap_or_else(|e| e.into_inner())
}

pub(crate) fn mono_ms() -> u64 {
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
    /// (ORD1114T) Pausada por una acción local; la reanuda la persona desde el indicador.
    pub pausada: bool,
    /// (ORD1114T) Lo que falta para poder enseñar el indicador aquí, en palabras cortas.
    pub falta: Vec<String>,
    /// (ORD1114T) Primera línea rota del registro encadenado (None si está íntegro o no existe).
    pub registro_roto_en: Option<usize>,
}

fn estado(app: &AppHandle) -> EstadoControl {
    let posible = indicador_posible(app);
    let falta = if posible { Vec::new() } else { falta_indicador(app) };
    let roto = ruta_registro(app).and_then(|r| std::fs::read_to_string(r).ok()).and_then(|t| l::verificar_registro(&t).err());
    let c = control();
    let s = c.activa();
    EstadoControl {
        indicador_posible: posible,
        pausada: c.pausada(),
        falta,
        registro_roto_en: roto,
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
    // ORD1114T: una cadena rota se DETECTA y queda dicha en la propia cadena (y en el estado); no se tapa.
    if let Some(n) = ruta_registro(&app).and_then(|r| std::fs::read_to_string(r).ok()).and_then(|t| l::verificar_registro(&t).err()) {
        anotar(&app, "registro-roto", &format!("primera-linea-rota={n}"));
    }
    let posible = indicador_posible(&app);
    if !posible {
        // ORD1114T: en Android se PIDE a Kotlin el diálogo nativo (la persona decide allí; nada se enciende solo).
        pedir_preparar(&app);
    }
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
    sondear_plataforma(&app); // ORD1114T: lo que dijo Kotlin (terminar, pausa) manda antes de cada orden
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

/// (ORD1114T) La persona enciende «dejar que me controlen» en ESTE aparato: en Android, Kotlin enseña su
/// diálogo nativo y, con su «Sí», pide los permisos con los diálogos del sistema. En el resto, nada que pedir.
#[tauri::command]
pub fn control_neuronas_preparar(app: AppHandle, webview: tauri::Webview) -> Result<EstadoControl, String> {
    exigir_pagina(&app, &webview)?;
    pedir_preparar(&app);
    Ok(estado(&app))
}

/// (ORD1114T) Pausa local (macOS: tecla/ratón; Android: toque fuera de la pastilla). Devuelve si pausó.
#[allow(dead_code)] // ORD1114T: lo usan macOS y Android, no Windows/Linux
pub(crate) fn pausa_local(app: &AppHandle, entrada_ms: u64) {
    let pauso = control().entrada_local(entrada_ms);
    if pauso {
        anotar(app, "pausa-local", "una accion local pauso el control");
        marcar_pausa_indicador(app, true);
        let _ = app.emit(EVENTO_PAUSA, serde_json::json!({ "pausada": true }));
    }
}

/// (ORD1114T) Para el vigía de entrada local: ¿hay sesión y no está ya en pausa?
#[allow(dead_code)]
pub(crate) fn sesion_viva_sin_pausa() -> bool {
    let c = control();
    c.activa().is_some() && !c.pausada()
}

/// (ORD1114T) Solo desde el indicador nativo.
#[allow(dead_code)] // ORD1114T: lo usan macOS y Android, no Windows/Linux
pub(crate) fn reanudar(app: &AppHandle, desde: &str) {
    if control().reanudar(mono_ms()) {
        anotar(app, "reanudada", desde);
        marcar_pausa_indicador(app, false);
        let _ = app.emit(EVENTO_PAUSA, serde_json::json!({ "pausada": false }));
    }
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
    let _ = APP.set(app.clone()); // ORD1114T
    #[cfg(target_os = "macos")]
    crate::control_neuronas_macos::vigilar_entrada_local(app); // ORD1114T: tecla/ratón local → pausa
    let h = app.clone();
    let _ = std::thread::Builder::new().name("starseed-control-neuronas".into()).spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(1));
        let activa = control().activa().is_some();
        if !activa {
            continue;
        }
        sondear_plataforma(&h); // ORD1114T
        if control().activa().is_none() {
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
// (ORD1114T) Solo donde se cumple TODO §2.4 hay indicador posible: macOS (barra + borde + atajo + pausa local)
// y Android (notificación en curso + superposición + pausa por toque). En el resto, no.

#[cfg(target_os = "macos")]
fn indicador_posible(app: &AppHandle) -> bool {
    crate::nativa::es_starseed_os(app) && crate::segundo_plano::bandeja_posible()
}

#[cfg(target_os = "android")]
fn indicador_posible(app: &AppHandle) -> bool {
    crate::nativa::es_starseed_os(app) && crate::control_neuronas_android::posible(crate::control_neuronas_android::es::estado(app).as_ref())
}

#[cfg(not(any(target_os = "macos", target_os = "android")))]
fn indicador_posible(_app: &AppHandle) -> bool {
    false
}

#[cfg(target_os = "android")]
fn falta_indicador(app: &AppHandle) -> Vec<String> {
    match crate::control_neuronas_android::es::estado(app) {
        Some(e) if !e.falta.is_empty() => e.falta,
        Some(_) => vec!["indicador".into()],
        None => vec!["sin-parte-android".into()],
    }
}

#[cfg(not(target_os = "android"))]
fn falta_indicador(app: &AppHandle) -> Vec<String> {
    if cfg!(target_os = "macos") {
        if crate::nativa::es_starseed_os(app) { vec!["bandeja".into()] } else { vec!["no-aplica".into()] }
    } else {
        // Windows/Linux/iOS: sin borde siempre encima, atajo global y pausa local en Rust (§2.4).
        vec!["plataforma-sin-borde-atajo-ni-pausa".into()]
    }
}

/// Android: id de la sesión del indicador que Kotlin enseña (no es el token de las órdenes).
#[cfg(target_os = "android")]
fn sesion_indicador() -> MutexGuard<'static, Option<String>> {
    static S: OnceLock<Mutex<Option<String>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(None)).lock().unwrap_or_else(|e| e.into_inner())
}

#[cfg(target_os = "macos")]
fn indicador_visible(app: &AppHandle) -> bool {
    app.tray_by_id(ID_BANDEJA).is_some() && crate::control_neuronas_macos::borde_visible()
}

#[cfg(target_os = "android")]
fn indicador_visible(app: &AppHandle) -> bool {
    let Some(id) = sesion_indicador().clone() else { return false };
    crate::control_neuronas_android::visible(crate::control_neuronas_android::es::estado(app).as_ref(), &id, pared_ms())
}

#[cfg(not(any(target_os = "macos", target_os = "android")))]
fn indicador_visible(_app: &AppHandle) -> bool {
    false
}

/// Lo que dijo la plataforma desde la última vez (Android: terminar/pausa/reanudar de Kotlin). Sin página.
#[cfg(target_os = "android")]
fn sondear_plataforma(app: &AppHandle) {
    use crate::control_neuronas_android::{self as a, Cambio};
    let Some(id) = sesion_indicador().clone() else { return };
    let e = a::es::estado(app);
    let antes = control().activa().map(|s| s.de.chars().take(8).collect::<String>());
    let cambio = a::sincronizar(&mut control(), e.as_ref(), &id, pared_ms(), mono_ms());
    match cambio {
        Cambio::Parar(m) => {
            quitar_indicador(app);
            anotar(app, "sesion-parada", &format!("de={} motivo={m}", antes.unwrap_or_default()));
            let _ = app.emit(EVENTO_PARADA, serde_json::json!({ "motivo": m }));
        }
        Cambio::Pausada => {
            anotar(app, "pausa-local", "un toque local pauso el control");
            let _ = app.emit(EVENTO_PAUSA, serde_json::json!({ "pausada": true }));
        }
        Cambio::Reanudada => {
            anotar(app, "reanudada", "la-persona-desde-la-notificacion");
            let _ = app.emit(EVENTO_PAUSA, serde_json::json!({ "pausada": false }));
        }
        Cambio::Nada => {}
    }
}

#[cfg(not(target_os = "android"))]
fn sondear_plataforma(_app: &AppHandle) {}

#[cfg(target_os = "android")]
fn pedir_preparar(app: &AppHandle) {
    let _ = crate::control_neuronas_android::es::pedir(app, "preparar", "", "");
}

#[cfg(not(target_os = "android"))]
fn pedir_preparar(_app: &AppHandle) {}

#[cfg(desktop)]
#[allow(dead_code)] // ORD1114T: lo usan macOS y Android, no Windows/Linux
fn marcar_pausa_indicador(app: &AppHandle, pausada: bool) {
    if let Some(t) = app.tray_by_id(ID_BANDEJA) {
        let nombre = control().activa().map(|s| s.nombre.clone()).unwrap_or_default();
        let _ = t.set_title(Some(if pausada { "‖ Control en pausa · menú para reanudar".to_string() } else { format!("● Controlada por {nombre}") }));
    }
}

#[cfg(not(desktop))]
fn marcar_pausa_indicador(_app: &AppHandle, _pausada: bool) {}

#[cfg(target_os = "macos")]
fn poner_indicador(app: &AppHandle, nombre: &str) -> Result<(), String> {
    poner_bandeja(app, nombre).map_err(|e| e.to_string())?;
    // Borde siempre encima y atajo global: sin cualquiera de los dos, no hay indicador completo (§2.4).
    if !crate::control_neuronas_macos::poner_borde(app, nombre) || !crate::control_neuronas_macos::registrar_atajo(app) {
        quitar_indicador(app);
        return Err("indicador-incompleto".into());
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn poner_bandeja(app: &AppHandle, nombre: &str) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
    use tauri::tray::TrayIconBuilder;
    if app.tray_by_id(ID_BANDEJA).is_none() {
        let info = MenuItem::with_id(app, "ss-control-info", format!("{nombre} manda órdenes a esta neurona"), false, None::<&str>)?;
        let nota = MenuItem::with_id(app, "ss-control-nota", "Cada orden queda en el registro de este aparato", false, None::<&str>)?;
        let atajo = MenuItem::with_id(app, "ss-control-atajo", "⌃⌥⌘. termina · tocar el teclado o el ratón pausa", false, None::<&str>)?;
        let sep = PredefinedMenuItem::separator(app)?;
        let reanudar_i = MenuItem::with_id(app, MENU_REANUDAR, "Reanudar el control", true, None::<&str>)?;
        let terminar = MenuItem::with_id(app, MENU_TERMINAR, "Terminar el control ahora", true, None::<&str>)?;
        let menu = Menu::with_items(app, &[&info, &nota, &atajo, &sep, &reanudar_i, &terminar])?;
        let mut b = TrayIconBuilder::with_id(ID_BANDEJA)
            .menu(&menu)
            .tooltip("Otra neurona de tu cuenta controla esta (StarSeed OS)")
            .title(format!("● Controlada por {nombre}"))
            .show_menu_on_left_click(true)
            // Atendido en Rust: aunque la página esté colgada o comprometida, terminar funciona.
            .on_menu_event(|app, ev| match ev.id().as_ref() {
                MENU_TERMINAR => parar(app, "la-persona-desde-el-indicador"),
                MENU_REANUDAR => reanudar(app, "la-persona-desde-el-indicador"),
                _ => {}
            });
        if let Some(icono) = app.default_window_icon() {
            b = b.icon(icono.clone());
        }
        b.build(app)?;
    } else if let Some(t) = app.tray_by_id(ID_BANDEJA) {
        let _ = t.set_title(Some(format!("● Controlada por {nombre}")));
    }
    Ok(())
}

#[cfg(target_os = "android")]
fn poner_indicador(app: &AppHandle, nombre: &str) -> Result<(), String> {
    use crate::control_neuronas_android as a;
    let id = token_nuevo();
    *sesion_indicador() = Some(id.clone());
    if !a::es::pedir(app, "mostrar", &id, nombre) {
        *sesion_indicador() = None;
        return Err("sin-indicador-nativo".into());
    }
    // Kotlin confirma con su latido: hasta 4 s (arrancar el servicio y poner la superposición).
    for _ in 0..40 {
        std::thread::sleep(std::time::Duration::from_millis(100));
        if a::visible(a::es::estado(app).as_ref(), &id, pared_ms()) {
            return Ok(());
        }
    }
    quitar_indicador(app);
    Err("sin-indicador-nativo".into())
}

#[cfg(not(any(target_os = "macos", target_os = "android")))]
fn poner_indicador(_app: &AppHandle, _nombre: &str) -> Result<(), String> {
    Err("sin-indicador-nativo".into())
}

#[cfg(desktop)]
fn quitar_indicador(app: &AppHandle) {
    let _ = app.remove_tray_by_id(ID_BANDEJA);
    #[cfg(target_os = "macos")]
    {
        crate::control_neuronas_macos::quitar_borde(app);
        crate::control_neuronas_macos::quitar_atajo(app);
    }
}

#[cfg(target_os = "android")]
fn quitar_indicador(app: &AppHandle) {
    if let Some(id) = sesion_indicador().take() {
        let _ = crate::control_neuronas_android::es::pedir(app, "quitar", &id, "");
    }
}

#[cfg(not(any(desktop, target_os = "android")))]
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
