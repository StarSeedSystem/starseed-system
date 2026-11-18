//! (CTL1117M) Control entre mis neuronas · el Mac como aparato CONTROLADO: la ENTRADA (ratón y teclado con enigo) y lo
//! común de los comandos de capacidades, ajustes y estado. Solo macOS; la decisión pura vive en
//! `control_entrada_macos_logica.rs` y el contrato de los comandos en `control-fase23-costuras.md` (seams 1 y 2).
//!
//! · `control_entrada` comprueba en Rust, ANTES de inyectar nada: sobre firmado por un controlador que la persona aceptó en
//!   el diálogo nativo de ESTE Mac (`control_aceptados_macos`), el mismo controlador que abrió la sesión (y que la apertura
//!   verificó), sesión viva con indicador y nivel `controlar`, y el límite de 60 por segundo (`control_entrada_logica`).
//! · Después: pantalla no bloqueada, `alcance` (S2: `total` por defecto) y el permiso de «Accesibilidad» ya dado por la
//!   persona. Nada de aquí pide, concede ni contesta un permiso del sistema: `AXIsProcessTrusted` solo MIRA, y enigo se abre
//!   con `open_prompt_to_get_permissions = false`.
//! · Los eventos propios se marcan (`Propias`) para que la pausa local no los tome por una mano (`mano_real`).
//! · Nada se anota por orden ni por fotograma, y nunca contenido (ni texto escrito ni coordenadas).

use crate::control_entrada_logica as l;
use crate::control_entrada_macos_logica as m;
use enigo::{Axis, Button, Coordinate, Direction, Enigo, Key, Keyboard, Mouse, Settings};
use objc2::msg_send;
use objc2::runtime::{AnyClass, AnyObject};
use serde_json::{json, Value};
use std::ffi::c_void;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard, OnceLock};
use tauri::AppHandle;

/// Marca (`EVENT_SOURCE_USER_DATA`) que enigo pone en TODO evento que inyecta: «SSct».
const MARCA_EVENTO: i64 = 0x5353_6374;

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrusted() -> u8;
}

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGPreflightScreenCaptureAccess() -> u8;
    fn CGEventSourceSecondsSinceLastEventType(estado: i32, tipo: u32) -> f64;
    fn CGEventCreate(fuente: *const c_void) -> *mut c_void;
    fn CGEventGetLocation(e: *mut c_void) -> Punto;
}

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFRelease(r: *const c_void);
}

#[repr(C)]
#[derive(Clone, Copy)]
struct Punto {
    x: f64,
    y: f64,
}

// ─────────────────────────── Lo que el sistema dice (solo se MIRA) ───────────────────────────

/// ¿La persona dio «Accesibilidad» a StarSeed en este Mac? No abre ningún diálogo.
pub fn accesibilidad_ok() -> bool {
    unsafe { AXIsProcessTrusted() != 0 }
}

/// ¿La persona dio «Grabación de pantalla»? No abre ningún diálogo (`CGPreflightScreenCaptureAccess`, no `Request`).
pub fn grabacion_ok() -> bool {
    unsafe { CGPreflightScreenCaptureAccess() != 0 }
}

pub fn bloqueada() -> bool {
    crate::prestamo_ventana::sistema::pantalla_bloqueada()
}

fn entrada_segura() -> bool {
    crate::prestamo_ventana::sistema::entrada_segura()
}

/// El paquete de la app que está al frente (`NSWorkspace.frontmostApplication.bundleIdentifier`).
fn app_al_frente() -> Option<String> {
    unsafe {
        let clase = AnyClass::get(c"NSWorkspace")?;
        let ws: *mut AnyObject = msg_send![clase, sharedWorkspace];
        if ws.is_null() {
            return None;
        }
        let app: *mut AnyObject = msg_send![ws, frontmostApplication];
        if app.is_null() {
            return None;
        }
        let id: *mut AnyObject = msg_send![app, bundleIdentifier];
        if id.is_null() {
            return None;
        }
        let ns = &*(id as *const objc2_foundation::NSString);
        Some(ns.to_string())
    }
}

/// El alcance de ESTE Mac (`control-ajustes.json`, junto a `indicador` y `ver_toques`). Falta → `total`.
pub fn alcance(app: &AppHandle) -> m::Alcance {
    use tauri::Manager;
    app.path()
        .app_data_dir()
        .ok()
        .and_then(|d| std::fs::read_to_string(d.join("control-ajustes.json")).ok())
        .map(|t| m::leer_alcance(&t))
        .unwrap_or(m::Alcance::Total)
}

// ─────────────────────────── Estado de la inyección ───────────────────────────

struct Mundo {
    enigo: Option<Enigo>,
    mano: m::Mano,
    propias: m::Propias,
    /// Dónde dejamos el puntero (puntos), para saber si una mano lo apartó.
    dejado: Option<(f64, f64)>,
    descontadas: u64,
    pausas_de_mano: u64,
}

fn mundo() -> MutexGuard<'static, Mundo> {
    static M: OnceLock<Mutex<Mundo>> = OnceLock::new();
    M.get_or_init(|| Mutex::new(Mundo { enigo: None, mano: m::Mano::default(), propias: m::Propias::default(), dejado: None, descontadas: 0, pausas_de_mano: 0 }))
        .lock()
        .unwrap_or_else(|e| e.into_inner())
}

static INICIO_ANOTADO: AtomicU64 = AtomicU64::new(0);

fn abrir_enigo() -> Result<Enigo, &'static str> {
    // `open_prompt_to_get_permissions: false`: si faltara el permiso, enigo falla; NUNCA abre el aviso del sistema.
    let ajustes = Settings { open_prompt_to_get_permissions: false, event_source_user_data: Some(MARCA_EVENTO), release_keys_when_dropped: true, ..Settings::default() };
    Enigo::new(&ajustes).map_err(|_| "sin-servicio")
}

fn ahora() -> u64 {
    crate::control_neuronas::mono_k()
}

/// Lo que se hace con el mundo ya abierto: marca antes y después de cada evento propio.
fn inyectar(w: &mut Mundo, clase: m::Clase, f: impl FnOnce(&mut Enigo) -> Result<(), enigo::InputError>) -> Result<(), &'static str> {
    w.propias.marcar(clase, ahora());
    let r = f(w.enigo.as_mut().ok_or("sin-servicio")?);
    w.propias.marcar(clase, ahora());
    r.map_err(|_| "sin-servicio")
}

fn aplicar(w: &mut Mundo, a: &m::Accion, ancho: f64, alto: f64) -> Result<(), &'static str> {
    use m::Accion::*;
    match a {
        Mover(x, y) => {
            let (px, py) = ((x * (ancho - 1.0)).round(), (y * (alto - 1.0)).round());
            inyectar(w, m::Clase::Raton, |e| e.move_mouse(px as i32, py as i32, Coordinate::Abs))?;
            w.dejado = Some((px, py));
        }
        Pulsar => inyectar(w, m::Clase::Boton, |e| e.button(Button::Left, Direction::Press))?,
        Soltar => inyectar(w, m::Clase::Boton, |e| e.button(Button::Left, Direction::Release))?,
        ClicIzq => inyectar(w, m::Clase::Boton, |e| e.button(Button::Left, Direction::Click))?,
        ClicDer => inyectar(w, m::Clase::Boton, |e| e.button(Button::Right, Direction::Click))?,
        Rueda { v, h } => {
            if *v != 0 {
                inyectar(w, m::Clase::Rueda, |e| e.scroll(*v, Axis::Vertical))?;
            }
            if *h != 0 {
                inyectar(w, m::Clase::Rueda, |e| e.scroll(*h, Axis::Horizontal))?;
            }
        }
    }
    Ok(())
}

fn tecla(w: &mut Mundo, t: m::TeclaMac) -> Result<(), &'static str> {
    use m::TeclaMac::*;
    match t {
        Recientes => inyectar(w, m::Clase::Tecla, |e| e.key(Key::MissionControl, Direction::Click)),
        VolumenSubir => inyectar(w, m::Clase::Tecla, |e| e.key(Key::VolumeUp, Direction::Click)),
        VolumenBajar => inyectar(w, m::Clase::Tecla, |e| e.key(Key::VolumeDown, Direction::Click)),
        Silencio => inyectar(w, m::Clase::Tecla, |e| e.key(Key::VolumeMute, Direction::Click)),
        // ⌃⌘Q: bloquear la pantalla. Se sueltan siempre las dos modificadoras aunque la «q» falle.
        Bloquear => {
            inyectar(w, m::Clase::Tecla, |e| e.key(Key::Control, Direction::Press))?;
            let r = inyectar(w, m::Clase::Tecla, |e| e.key(Key::Meta, Direction::Press)).and_then(|_| inyectar(w, m::Clase::Tecla, |e| e.key(Key::Unicode('q'), Direction::Click)));
            let _ = inyectar(w, m::Clase::Tecla, |e| e.key(Key::Meta, Direction::Release));
            let _ = inyectar(w, m::Clase::Tecla, |e| e.key(Key::Control, Direction::Release));
            r
        }
    }
}

fn texto(w: &mut Mundo, t: &str) -> Result<(), &'static str> {
    for p in m::partir_texto(t) {
        match p {
            m::ParteTexto::Texto(s) => inyectar(w, m::Clase::Tecla, |e| e.text(&s))?,
            m::ParteTexto::Intro => inyectar(w, m::Clase::Tecla, |e| e.key(Key::Return, Direction::Click))?,
            m::ParteTexto::Tabulador => inyectar(w, m::Clase::Tecla, |e| e.key(Key::Tab, Direction::Click))?,
            m::ParteTexto::Borrar => inyectar(w, m::Clase::Tecla, |e| e.key(Key::Backspace, Direction::Click))?,
            m::ParteTexto::Escape => inyectar(w, m::Clase::Tecla, |e| e.key(Key::Escape, Direction::Click))?,
        }
    }
    Ok(())
}

/// Suelta lo que hubiera pulsado (pausa, parada, cambio de modo). Nunca falla hacia fuera.
pub fn soltar_todo() {
    let mut w = mundo();
    let acciones = w.mano.soltar_todo();
    if w.enigo.is_some() {
        for a in &acciones {
            let _ = aplicar(&mut w, a, 1.0, 1.0);
        }
    }
    w.dejado = None;
}

// ─────────────────────────── control_entrada ───────────────────────────

fn rechazo(m: l::Motivo) -> Value {
    json!({ "ok": false, "motivo": m.codigo() })
}

fn vistos() -> MutexGuard<'static, l::Vistos> {
    static V: OnceLock<Mutex<l::Vistos>> = OnceLock::new();
    V.get_or_init(|| Mutex::new(l::Vistos::default())).lock().unwrap_or_else(|e| e.into_inner())
}

pub fn contadores() -> MutexGuard<'static, Option<l::Contadores>> {
    static C: OnceLock<Mutex<Option<l::Contadores>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(None)).lock().unwrap_or_else(|e| e.into_inner())
}

fn anotar_resultado(app: &AppHandle, sesion: &str, r: Result<(), l::Motivo>) {
    let mut c = contadores();
    if c.as_ref().is_none_or(|c| !sesion.starts_with(&c.sesion)) {
        crate::ble::nota(None, "control-entrada", &m::linea_inicio_entrada(sesion, alcance(app)));
        *c = Some(l::Contadores::nueva(sesion));
    }
    if let Some(c) = c.as_mut() {
        c.anotar(r);
    }
}

/// Seam 1 en macOS. Todo lo que puede decir que no lo dice ANTES de tocar el sistema.
pub fn entrada(app: &AppHandle, sesion: &str, sobre: &Value) -> Value {
    use crate::control_neuronas::{puerta_sesion, ModoPuerta};
    let Ok(nivel) = puerta_sesion(app, sesion, ModoPuerta::Lectura) else { return rechazo(l::Motivo::Sesion) };
    let aceptados = crate::control_aceptados_macos::leer(app);
    let ahora_ms = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0);
    let v = l::verificar_sobre(sobre, &aceptados, sesion, &nivel, ahora_ms, &mut vistos());
    // La orden la firma el MISMO controlador que abrió la sesión, y esa apertura se verificó aquí (no solo la página).
    let v = v.and_then(|o| {
        if crate::control_neuronas::de_de_sesion(sesion).as_deref() == Some(o.de.as_str()) && crate::control_aceptados_macos::sesion_verificada(&o.de) {
            Ok(o)
        } else {
            Err((l::Motivo::NoAutorizado, "otro-controlador"))
        }
    });
    let orden = match v {
        Ok(o) => o,
        Err((mo, _)) => {
            anotar_resultado(app, sesion, Err(mo));
            return rechazo(mo);
        }
    };
    if let Err(mo) = puerta_sesion(app, sesion, ModoPuerta::Orden) {
        let mo = if mo == "pausa-local" { l::Motivo::PausaLocal } else { l::Motivo::Sesion };
        anotar_resultado(app, sesion, Err(mo));
        return rechazo(mo);
    }
    match ejecutar(app, &orden) {
        Ok(()) => {
            anotar_resultado(app, sesion, Ok(()));
            json!({ "ok": true })
        }
        Err((mo, falta)) => {
            anotar_resultado(app, sesion, Err(mo));
            let mut o = json!({ "ok": false, "motivo": mo.codigo() });
            if let Some(f) = falta {
                o["falta"] = json!([f]);
            }
            o
        }
    }
}

fn ejecutar(app: &AppHandle, o: &l::OrdenEntrada) -> Result<(), (l::Motivo, Option<&'static str>)> {
    // Un Mac bloqueado no recibe nada, en ningún alcance.
    if bloqueada() {
        return Err((l::Motivo::ReglaG, None));
    }
    if !accesibilidad_ok() {
        return Err((l::Motivo::SinServicio, Some(m::FALTA_ACCESIBILIDAD)));
    }
    let es_texto = o.nombre == "texto";
    if let Err(_porque) = m::permite(alcance(app), app_al_frente().as_deref(), entrada_segura(), es_texto) {
        return Err((l::Motivo::ReglaG, None));
    }
    let mut w = mundo();
    if w.enigo.is_none() {
        w.enigo = Some(abrir_enigo().map_err(|_| (l::Motivo::SinServicio, Some(m::FALTA_ACCESIBILIDAD)))?);
    }
    let (ancho, alto) = w.enigo.as_ref().and_then(|e| e.main_display().ok()).map(|(a, b)| (f64::from(a), f64::from(b))).unwrap_or((0.0, 0.0));
    if ancho < 2.0 || alto < 2.0 {
        return Err((l::Motivo::SinServicio, None));
    }
    let r = match o.nombre.as_str() {
        "gesto" => {
            let g = m::leer_gesto(&o.args).ok_or((l::Motivo::SinServicio, None))?;
            let acciones = w.mano.avanzar(&g, ancho, alto);
            let mut r = Ok(());
            for a in &acciones {
                r = aplicar(&mut w, a, ancho, alto);
                if r.is_err() {
                    break;
                }
            }
            r
        }
        "tecla" => {
            let t = o.args.get("cual").and_then(|c| c.as_str()).and_then(m::tecla_de).ok_or((l::Motivo::SinServicio, None))?;
            tecla(&mut w, t)
        }
        "texto" => texto(&mut w, o.args.get("texto").and_then(|t| t.as_str()).unwrap_or("")),
        // Volumen y brillo por nivel no se prometen en un Mac (ver `capacidades_mac`): se dice la verdad.
        _ => return Err((l::Motivo::SinServicio, None)),
    };
    r.map_err(|_| (l::Motivo::SinServicio, None))
}

// ─────────────────────────── Pausa local: descontar lo propio ───────────────────────────

/// Los últimos eventos del sistema por clase, hace cuántos ms.
fn hace_ms_por_clase() -> [Option<u64>; 4] {
    let mut salida = [None; 4];
    for c in m::CLASES {
        let mut mejor: Option<f64> = None;
        for t in m::tipos_de(c) {
            // kCGEventSourceStateHIDSystemState = 1.
            let s = unsafe { CGEventSourceSecondsSinceLastEventType(1, *t) };
            if s.is_finite() && s >= 0.0 {
                mejor = Some(mejor.map_or(s, |x: f64| x.min(s)));
            }
        }
        salida[c as usize] = mejor.map(|s| (s * 1000.0) as u64);
    }
    salida
}

fn puntero_actual() -> Option<(f64, f64)> {
    unsafe {
        let e = CGEventCreate(std::ptr::null());
        if e.is_null() {
            return None;
        }
        let p = CGEventGetLocation(e);
        CFRelease(e as *const c_void);
        Some((p.x, p.y))
    }
}

/// ¿Hubo una MANO en el teclado o el ratón? Devuelve el instante (ms monótonos) del evento que no es nuestro.
/// Los eventos propios (marcados antes y después de cada inyección) no cuentan; un puntero que se apartó de donde lo
/// dejamos, ya asentado, sí.
pub fn mano_real() -> Option<u64> {
    let ahora_ms = ahora();
    let hace = hace_ms_por_clase();
    let mut w = mundo();
    if w.enigo.is_none() && w.propias.ultima_ms() == 0 {
        // Aún no hemos inyectado nada en esta sesión: todo lo que el sistema vea es de una mano.
        return m::evento_de_mano(&m::Propias::default(), ahora_ms, hace);
    }
    let propias = w.propias.clone();
    let mut real = m::evento_de_mano(&propias, ahora_ms, hace);
    if real.is_none() {
        if let Some(p) = puntero_actual() {
            if m::puntero_movido_por_mano(w.dejado, p, propias.ultima_ms(), ahora_ms) {
                real = Some(ahora_ms);
            }
        }
    }
    if real.is_some() {
        w.pausas_de_mano += 1;
    } else if hace.iter().flatten().any(|h| *h <= m::RECIENTE_MS) {
        w.descontadas += 1;
    }
    real
}

/// Al pausar o terminar: se suelta lo pulsado y se olvida dónde estaba el puntero.
pub fn al_pausar() {
    soltar_todo();
}

/// Al cerrarse la sesión (cualquier motivo): suelta todo, una línea de resumen, y se olvida lo visto.
pub fn al_cerrar(app: &AppHandle) {
    soltar_todo();
    let (descontadas, de_mano) = {
        let mut w = mundo();
        let r = (w.descontadas, w.pausas_de_mano);
        w.descontadas = 0;
        w.pausas_de_mano = 0;
        w.propias = m::Propias::default();
        w.enigo = None; // suelta teclas que quedaran (release_keys_when_dropped)
        r
    };
    if let Some(c) = contadores().take() {
        let linea = m::linea_fin_entrada(&c, descontadas, de_mano);
        crate::ble::nota(None, "control-entrada", &linea);
        crate::control_neuronas::anotar_k(app, "entrada-resumen", &linea);
    }
    vistos().olvidar();
    INICIO_ANOTADO.store(0, Ordering::SeqCst);
}

// ─────────────────────────── Capacidades, ajustes y estado ───────────────────────────

pub fn capacidades(app: &AppHandle) -> Value {
    m::capacidades_mac(grabacion_ok(), accesibilidad_ok(), alcance(app))
}

/// Abre el panel de Privacidad donde la PERSONA da el permiso. No concede nada.
pub fn abrir_ajuste(cual: &str) -> Value {
    let Some(url) = m::url_ajuste(cual) else { return json!({ "ok": false, "motivo": "ajuste-desconocido" }) };
    match std::process::Command::new("/usr/bin/open").arg(url).status() {
        Ok(s) if s.success() => json!({ "ok": true }),
        _ => json!({ "ok": false, "motivo": "sin-servicio" }),
    }
}

/// `control_estado_aparato` en macOS: solo lo que se sabe de verdad (pantalla y bloqueo); volumen, brillo y batería no se inventan.
pub fn estado_aparato() -> Value {
    let (ancho, alto) = crate::control_pantalla_macos::tamano_principal().unwrap_or((0, 0));
    json!({ "ok": true, "pantalla": { "ancho": ancho, "alto": alto, "giro": 0, "encendida": true, "bloqueada": bloqueada() }, "plataforma": "macos" })
}
