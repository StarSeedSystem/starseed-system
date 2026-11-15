// ═══════════════════════════════════════════════════════════════════════════
// ubicacion_macos — la posición del Mac con CoreLocation (UBI1114K, 2026-11-14). SOLO macOS.
// Contrato: architecture/ubicacion-nativa.md.
// ---------------------------------------------------------------------------
// Un único `CLLocationManager` (vivo mientras dure el proceso) creado y usado en el HILO PRINCIPAL, como
// exige CoreLocation. Sin delegado: el estado de autorización y `location` se LEEN (sondeo corto) en vez de
// esperar a un callback; así no hace falta declarar una clase de Objective-C. El aviso del sistema lo
// enseña `requestWhenInUseAuthorization` UNA vez, y solo cuando la persona lo pide (`pedir`). La app no
// escribe nada en las bases de permisos del sistema.
// Cada selector se comprueba con `respondsToSelector:` antes de llamarlo: una excepción de Objective-C no
// puede cruzar Rust.
// ═══════════════════════════════════════════════════════════════════════════

use crate::ubicacion_logica::{self as logica, Codigo, Fix, Permiso, RespuestaFix};
use objc2::encode::{Encode, Encoding};
use objc2::rc::{autoreleasepool, Retained};
use objc2::runtime::{AnyClass, AnyObject, Sel};
use objc2::{msg_send, sel};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::mpsc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

#[link(name = "CoreLocation", kind = "framework")]
extern "C" {}

/// El gestor (uno por proceso; se guarda como número para poder compartirlo entre hilos).
static GESTOR: AtomicUsize = AtomicUsize::new(0);
/// `startUpdatingLocation` en marcha.
static ACTUALIZANDO: AtomicBool = AtomicBool::new(false);
/// La web pidió vigilar (si no, se para al terminar una medida suelta).
static VIGILANDO: AtomicBool = AtomicBool::new(false);

/// Cuánto esperar el aviso del sistema, y la primera medida.
const ESPERA_AVISO: Duration = Duration::from_secs(90);
const ESPERA_MEDIDA: Duration = Duration::from_secs(25);
/// Una medida con más de esto no sirve como «la de ahora».
const MAX_EDAD_MS: u64 = 60_000;

#[repr(C)]
#[derive(Clone, Copy)]
struct Coordenada {
    lat: f64,
    lon: f64,
}

// SAFETY: `CLLocationCoordinate2D` es `{ double latitude; double longitude; }`.
unsafe impl Encode for Coordenada {
    const ENCODING: Encoding = Encoding::Struct("CLLocationCoordinate2D", &[Encoding::Double, Encoding::Double]);
}

fn ahora_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn responde(obj: &AnyObject, s: Sel) -> bool {
    unsafe { msg_send![obj, respondsToSelector: s] }
}

/// Ejecuta `f` en el hilo principal y espera su resultado (None si no contesta a tiempo).
fn en_principal<T: Send + 'static>(app: &AppHandle, f: impl FnOnce() -> T + Send + 'static) -> Option<T> {
    let (tx, rx) = mpsc::channel();
    app.run_on_main_thread(move || {
        let _ = tx.send(autoreleasepool(|_| f()));
    })
    .ok()?;
    rx.recv_timeout(Duration::from_secs(3)).ok()
}

/// El gestor, creado la primera vez. SOLO en el hilo principal.
fn gestor() -> Option<&'static AnyObject> {
    let p = GESTOR.load(Ordering::SeqCst);
    if p != 0 {
        return Some(unsafe { &*(p as *const AnyObject) });
    }
    let cls = AnyClass::get(c"CLLocationManager")?;
    let g: Option<Retained<AnyObject>> = unsafe { msg_send![cls, new] };
    let g = g?;
    // Máxima precisión (kCLLocationAccuracyBest = -1.0) y sin filtro de distancia: lo que el sistema dé, tal cual.
    if responde(&g, sel!(setDesiredAccuracy:)) {
        let _: () = unsafe { msg_send![&*g, setDesiredAccuracy: -1.0f64] };
    }
    if responde(&g, sel!(setDistanceFilter:)) {
        let _: () = unsafe { msg_send![&*g, setDistanceFilter: -1.0f64] };
    }
    let crudo = Retained::into_raw(g);
    GESTOR.store(crudo as usize, Ordering::SeqCst);
    Some(unsafe { &*crudo })
}

fn estado_crudo() -> i64 {
    let Some(cls) = AnyClass::get(c"CLLocationManager") else { return -1 };
    let ok: bool = unsafe { msg_send![cls, respondsToSelector: sel!(authorizationStatus)] };
    if !ok {
        return 0;
    }
    let s: i32 = unsafe { msg_send![cls, authorizationStatus] };
    s as i64
}

fn permiso() -> Permiso {
    if AnyClass::get(c"CLLocationManager").is_none() {
        return Permiso::NoDisponible;
    }
    logica::permiso_de_cl(estado_crudo())
}

/// Interruptor general «Servicios de localización».
fn servicios_activos() -> Option<bool> {
    let cls = AnyClass::get(c"CLLocationManager")?;
    let ok: bool = unsafe { msg_send![cls, respondsToSelector: sel!(locationServicesEnabled)] };
    if !ok {
        return None;
    }
    Some(unsafe { msg_send![cls, locationServicesEnabled] })
}

/// Lee la última posición del gestor. SOLO en el hilo principal.
fn leer_fix() -> Option<Fix> {
    let g = gestor()?;
    let loc: Option<Retained<AnyObject>> = unsafe { msg_send![g, location] };
    let loc = loc?;
    let c: Coordenada = unsafe { msg_send![&*loc, coordinate] };
    let h: f64 = unsafe { msg_send![&*loc, horizontalAccuracy] };
    let alt: f64 = unsafe { msg_send![&*loc, altitude] };
    let v: f64 = unsafe { msg_send![&*loc, verticalAccuracy] };
    let rumbo: f64 = unsafe { msg_send![&*loc, course] };
    let vel: f64 = unsafe { msg_send![&*loc, speed] };
    let ts: Option<Retained<AnyObject>> = unsafe { msg_send![&*loc, timestamp] };
    let t: f64 = unsafe { msg_send![&*ts?, timeIntervalSince1970] };
    logica::fix_de_cl(c.lat, c.lon, h, alt, v, rumbo, vel, t)
}

fn empezar() {
    if ACTUALIZANDO.swap(true, Ordering::SeqCst) {
        return;
    }
    if let Some(g) = gestor() {
        if responde(g, sel!(startUpdatingLocation)) {
            let _: () = unsafe { msg_send![g, startUpdatingLocation] };
        }
    }
}

fn parar_gestor() {
    if !ACTUALIZANDO.swap(false, Ordering::SeqCst) {
        return;
    }
    if let Some(g) = gestor() {
        if responde(g, sel!(stopUpdatingLocation)) {
            let _: () = unsafe { msg_send![g, stopUpdatingLocation] };
        }
    }
}

// ─────────────────────────────── API para ubicacion.rs ───────────────────────────────

pub fn estado(app: &AppHandle) -> (Permiso, Option<bool>) {
    let r = en_principal(app, || (permiso(), servicios_activos()));
    r.unwrap_or((Permiso::NoDisponible, None))
}

pub fn vigilando() -> bool {
    VIGILANDO.load(Ordering::SeqCst)
}

/// Una medida de ahora. Bloquea hasta `ESPERA_AVISO + ESPERA_MEDIDA` como mucho (llamar desde un hilo de trabajo).
pub fn ahora(app: &AppHandle, pedir: bool) -> RespuestaFix {
    let (mut p, servicios) = estado(app);
    if servicios == Some(false) && !matches!(p, Permiso::Denegado | Permiso::Restringido) {
        return RespuestaFix::fallo(Codigo::ServiciosApagados, "macos");
    }
    if p == Permiso::SinPreguntar && pedir {
        // El aviso del sistema, una sola vez y solo porque la persona acaba de pedirlo.
        let _ = en_principal(app, || {
            if let Some(g) = gestor() {
                if responde(g, sel!(requestWhenInUseAuthorization)) {
                    let _: () = unsafe { msg_send![g, requestWhenInUseAuthorization] };
                }
            }
        });
        let t0 = Instant::now();
        while p == Permiso::SinPreguntar && t0.elapsed() < ESPERA_AVISO {
            std::thread::sleep(Duration::from_millis(300));
            p = estado(app).0;
        }
    }
    if let Some(c) = logica::error_de_permiso(p, pedir) {
        return RespuestaFix::fallo(c, "macos");
    }
    if p == Permiso::SinPreguntar {
        // La persona no contestó al aviso a tiempo: se queda sin preguntar, no es una negativa.
        return RespuestaFix::fallo(Codigo::SinPreguntar, "macos");
    }
    let _ = en_principal(app, empezar);
    let t0 = Instant::now();
    let mut mejor: Option<Fix> = None;
    while t0.elapsed() < ESPERA_MEDIDA {
        if let Some(Some(f)) = en_principal(app, leer_fix) {
            if logica::es_reciente(&f, ahora_ms(), MAX_EDAD_MS) {
                mejor = Some(f);
                break;
            }
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    if !VIGILANDO.load(Ordering::SeqCst) {
        let _ = en_principal(app, parar_gestor);
    }
    match mejor {
        Some(f) => RespuestaFix::con(f),
        None => RespuestaFix::fallo(Codigo::SinFijar, "macos"),
    }
}

/// Empieza a vigilar (no pregunta nada: si falta el permiso, se dice por `ultima`).
pub fn vigilar(app: &AppHandle) {
    VIGILANDO.store(true, Ordering::SeqCst);
    if matches!(permiso(), Permiso::Concedido) {
        let _ = en_principal(app, empezar);
    }
}

pub fn parar(app: &AppHandle) {
    VIGILANDO.store(false, Ordering::SeqCst);
    let _ = en_principal(app, parar_gestor);
}

/// Lo último que midió el gestor, sin esperar.
pub fn ultima(app: &AppHandle) -> RespuestaFix {
    let (p, servicios) = estado(app);
    if let Some(c) = logica::error_de_permiso(p, false) {
        return RespuestaFix::fallo(c, "macos");
    }
    if servicios == Some(false) {
        return RespuestaFix::fallo(Codigo::ServiciosApagados, "macos");
    }
    if VIGILANDO.load(Ordering::SeqCst) && !ACTUALIZANDO.load(Ordering::SeqCst) {
        let _ = en_principal(app, empezar);
    }
    match en_principal(app, leer_fix).flatten() {
        Some(f) => RespuestaFix::con(f),
        None => RespuestaFix::fallo(Codigo::SinFijar, "macos"),
    }
}
