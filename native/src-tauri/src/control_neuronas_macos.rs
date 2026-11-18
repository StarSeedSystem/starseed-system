//! (ORD1114T) Control entre mis neuronas · el borde macOS del indicador (contrato
//! architecture/control-remoto-entre-neuronas.md §2.4 y permisos-y-control-del-dispositivo.md §4 regla 3).
//!
//! Lo que §2.4 pide en escritorio además del icono de la barra (que sigue en `control_neuronas.rs`):
//!   · **Borde de color siempre encima**: una ventana AppKit sin marco por pantalla, transparente, que no
//!     recibe clics (`ignoresMouseEvents`), en el nivel del salvapantallas, en todos los Espacios y sobre las
//!     apps a pantalla completa, con un borde rojo de 6 pt y una franja «Controlada por … · ⌃⌥⌘. termina».
//!     La crea Rust: la página no tiene `core:window` para quitarla.
//!   · **Atajo global fijo ⌃⌥⌘.** (PER1111S §4 regla 3) con `RegisterEventHotKey` de Carbon: no necesita
//!     Accesibilidad ni Monitorización de entrada y lo atiende Rust en el hilo principal → para la sesión
//!     aunque la página esté colgada. Solo está registrado mientras hay sesión.
//!   · **Cualquier tecla o movimiento local pausa**: `CGEventSourceSecondsSinceLastEventType` (estado HID del
//!     sistema, cualquier tipo de entrada) cada 150 ms. No lee QUÉ se tecleó ni dónde: solo cuándo hubo
//!     entrada. En fase 1 la app no inyecta teclas ni clics, así que toda entrada es de la persona; la fase 3
//!     (enigo) tendrá que descontar la suya.
//! Todo lo de AppKit/Carbon corre en el hilo principal (`en_principal`).

use crate::control_neuronas as cn;
use objc2::encode::{Encode, Encoding};
use objc2::runtime::{AnyClass, AnyObject, Bool};
use objc2::msg_send;
use std::cell::RefCell;
use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::time::Duration;
use tauri::AppHandle;

const BORDE_PT: f64 = 6.0;
const FRANJA_ALTO: f64 = 24.0;
/// NSScreenSaverWindowLevel: por encima de las ventanas normales, los paneles y la barra de menús.
const NIVEL: isize = 1000;
/// canJoinAllSpaces | stationary | ignoresCycle | fullScreenAuxiliary.
const COMPORTAMIENTO: usize = 1 | (1 << 4) | (1 << 6) | (1 << 8);
/// Firma del atajo («SSct») e id.
const FIRMA: u32 = u32::from_be_bytes(*b"SSct");
const ID_ATAJO: u32 = 1;
/// kVK_ANSI_Period y ⌃⌥⌘ (controlKey | optionKey | cmdKey).
const TECLA_PUNTO: u32 = 0x2F;
const MODIFICADORES: u32 = 0x1000 | 0x0800 | 0x0100;

#[repr(C)]
#[derive(Clone, Copy)]
struct Punto {
    x: f64,
    y: f64,
}
#[repr(C)]
#[derive(Clone, Copy)]
struct Tam {
    w: f64,
    h: f64,
}
#[repr(C)]
#[derive(Clone, Copy)]
struct Rect {
    o: Punto,
    t: Tam,
}
unsafe impl Encode for Punto {
    const ENCODING: Encoding = Encoding::Struct("CGPoint", &[f64::ENCODING, f64::ENCODING]);
}
unsafe impl Encode for Tam {
    const ENCODING: Encoding = Encoding::Struct("CGSize", &[f64::ENCODING, f64::ENCODING]);
}
unsafe impl Encode for Rect {
    const ENCODING: Encoding = Encoding::Struct("CGRect", &[Punto::ENCODING, Tam::ENCODING]);
}

#[repr(transparent)]
#[derive(Clone, Copy)]
struct ColorCG(*const c_void);
unsafe impl Encode for ColorCG {
    const ENCODING: Encoding = Encoding::Pointer(&Encoding::Struct("CGColor", &[]));
}

#[repr(C)]
#[derive(Clone, Copy, Default)]
struct IdAtajo {
    firma: u32,
    id: u32,
}
#[repr(C)]
struct TipoEvento {
    clase: u32,
    tipo: u32,
}

type Manejador = extern "C" fn(*mut c_void, *mut c_void, *mut c_void) -> i32;

#[link(name = "Carbon", kind = "framework")]
extern "C" {
    fn GetApplicationEventTarget() -> *mut c_void;
    fn InstallEventHandler(target: *mut c_void, h: Manejador, n: u32, lista: *const TipoEvento, datos: *mut c_void, out: *mut *mut c_void) -> i32;
    fn RegisterEventHotKey(codigo: u32, mods: u32, id: IdAtajo, target: *mut c_void, opciones: u32, out: *mut *mut c_void) -> i32;
    fn UnregisterEventHotKey(r: *mut c_void) -> i32;
    fn GetEventParameter(ev: *mut c_void, nombre: u32, tipo: u32, real: *mut u32, tam: usize, tam_real: *mut usize, datos: *mut c_void) -> i32;
}

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    #[allow(dead_code)] // CTL1117M
    fn CGEventSourceSecondsSinceLastEventType(estado: i32, tipo: u32) -> f64;
}

thread_local! {
    /// Ventanas del borde (solo se tocan en el hilo principal).
    static VENTANAS: RefCell<Vec<*mut AnyObject>> = const { RefCell::new(Vec::new()) };
}
static BORDE_VISIBLE: AtomicBool = AtomicBool::new(false);
static ATAJO: AtomicUsize = AtomicUsize::new(0);
static MANEJADOR_PUESTO: AtomicBool = AtomicBool::new(false);

/// Corre `f` en el hilo principal y espera su resultado (3 s como mucho).
fn en_principal<R: Send + 'static>(app: &AppHandle, f: impl FnOnce() -> R + Send + 'static) -> Option<R> {
    if objc2::MainThreadMarker::new().is_some() {
        return Some(f());
    }
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let _ = tx.send(f());
    })
    .ok()?;
    rx.recv_timeout(Duration::from_secs(3)).ok()
}

fn clase(n: &str) -> Option<&'static AnyClass> {
    AnyClass::get(&std::ffi::CString::new(n).ok()?)
}

pub fn borde_visible() -> bool {
    BORDE_VISIBLE.load(Ordering::SeqCst)
}

/// Pone el borde en cada pantalla. true si quedó al menos una ventana a la vista.
pub fn poner_borde(app: &AppHandle, nombre: &str) -> bool {
    let texto = format!("  ● Controlada por {nombre} · ⌃⌥⌘. termina · tocar el teclado o el ratón pausa  ");
    en_principal(app, move || unsafe { crear_bordes(&texto) }).unwrap_or(false)
}

unsafe fn crear_bordes(texto: &str) -> bool {
    quitar_en_principal();
    let (Some(c_pantalla), Some(c_ventana), Some(c_color), Some(c_campo)) = (clase("NSScreen"), clase("NSWindow"), clase("NSColor"), clase("NSTextField")) else {
        return false;
    };
    let pantallas: *mut AnyObject = msg_send![c_pantalla, screens];
    if pantallas.is_null() {
        return false;
    }
    let n: usize = msg_send![pantallas, count];
    let rojo: *mut AnyObject = msg_send![c_color, systemRedColor];
    let claro: *mut AnyObject = msg_send![c_color, clearColor];
    let blanco: *mut AnyObject = msg_send![c_color, whiteColor];
    let rojo_cg: ColorCG = msg_send![rojo, CGColor];
    let ns_texto = objc2_foundation::NSString::from_str(texto);
    let mut hechas = Vec::new();
    for i in 0..n {
        let p: *mut AnyObject = msg_send![pantallas, objectAtIndex: i];
        let marco: Rect = msg_send![p, frame];
        let w: *mut AnyObject = msg_send![c_ventana, alloc];
        let w: *mut AnyObject = msg_send![w, initWithContentRect: marco, styleMask: 0usize, backing: 2usize, defer: Bool::NO];
        if w.is_null() {
            continue;
        }
        let _: () = msg_send![w, setReleasedWhenClosed: Bool::YES];
        let _: () = msg_send![w, setOpaque: Bool::NO];
        let _: () = msg_send![w, setHasShadow: Bool::NO];
        let _: () = msg_send![w, setBackgroundColor: claro];
        let _: () = msg_send![w, setIgnoresMouseEvents: Bool::YES];
        let _: () = msg_send![w, setLevel: NIVEL];
        let _: () = msg_send![w, setCollectionBehavior: COMPORTAMIENTO];
        let v: *mut AnyObject = msg_send![w, contentView];
        let _: () = msg_send![v, setWantsLayer: Bool::YES];
        let capa: *mut AnyObject = msg_send![v, layer];
        if !capa.is_null() {
            let _: () = msg_send![capa, setBorderWidth: BORDE_PT];
            let _: () = msg_send![capa, setBorderColor: rojo_cg];
        }
        // Franja arriba en el centro con quién controla y cómo parar.
        let campo: *mut AnyObject = msg_send![c_campo, labelWithString: &*ns_texto];
        if !campo.is_null() {
            let _: () = msg_send![campo, sizeToFit];
            let f: Rect = msg_send![campo, frame];
            let ancho = f.t.w.min(marco.t.w - 2.0 * BORDE_PT);
            let r = Rect { o: Punto { x: (marco.t.w - ancho) / 2.0, y: marco.t.h - FRANJA_ALTO - BORDE_PT }, t: Tam { w: ancho, h: FRANJA_ALTO } };
            let _: () = msg_send![campo, setFrame: r];
            let _: () = msg_send![campo, setTextColor: blanco];
            let _: () = msg_send![campo, setBackgroundColor: rojo];
            let _: () = msg_send![campo, setDrawsBackground: Bool::YES];
            let _: () = msg_send![v, addSubview: campo];
        }
        let _: () = msg_send![w, orderFrontRegardless];
        let visible: Bool = msg_send![w, isVisible];
        if visible.as_bool() {
            hechas.push(w);
        } else {
            let _: () = msg_send![w, close];
        }
    }
    let alguna = !hechas.is_empty();
    VENTANAS.with(|v| *v.borrow_mut() = hechas);
    BORDE_VISIBLE.store(alguna, Ordering::SeqCst);
    alguna
}

fn quitar_en_principal() {
    VENTANAS.with(|v| {
        for w in v.borrow_mut().drain(..) {
            unsafe {
                let _: () = msg_send![w, orderOut: std::ptr::null_mut::<AnyObject>()];
                let _: () = msg_send![w, close];
            }
        }
    });
    BORDE_VISIBLE.store(false, Ordering::SeqCst);
}

pub fn quitar_borde(app: &AppHandle) {
    BORDE_VISIBLE.store(false, Ordering::SeqCst);
    let _ = en_principal(app, quitar_en_principal);
}

extern "C" fn al_atajo(_siguiente: *mut c_void, ev: *mut c_void, _datos: *mut c_void) -> i32 {
    let mut id = IdAtajo::default();
    let r = unsafe {
        GetEventParameter(
            ev,
            u32::from_be_bytes(*b"----"),
            u32::from_be_bytes(*b"hkid"),
            std::ptr::null_mut(),
            std::mem::size_of::<IdAtajo>(),
            std::ptr::null_mut(),
            &mut id as *mut IdAtajo as *mut c_void,
        )
    };
    if r != 0 || id.firma != FIRMA || id.id != ID_ATAJO {
        return -9874; // eventNotHandledErr: no es nuestro
    }
    if let Some(app) = cn::APP.get() {
        cn::parar(app, "atajo-global");
    }
    0
}

/// Registra ⌃⌥⌘. mientras dura la sesión. true si quedó registrado.
pub fn registrar_atajo(app: &AppHandle) -> bool {
    if ATAJO.load(Ordering::SeqCst) != 0 {
        return true;
    }
    en_principal(app, || unsafe {
        let destino = GetApplicationEventTarget();
        if !MANEJADOR_PUESTO.load(Ordering::SeqCst) {
            let tipo = TipoEvento { clase: u32::from_be_bytes(*b"keyb"), tipo: 5 };
            let mut h: *mut c_void = std::ptr::null_mut();
            if InstallEventHandler(destino, al_atajo, 1, &tipo, std::ptr::null_mut(), &mut h) != 0 {
                return false;
            }
            MANEJADOR_PUESTO.store(true, Ordering::SeqCst);
        }
        let mut r: *mut c_void = std::ptr::null_mut();
        if RegisterEventHotKey(TECLA_PUNTO, MODIFICADORES, IdAtajo { firma: FIRMA, id: ID_ATAJO }, destino, 0, &mut r) != 0 || r.is_null() {
            return false;
        }
        ATAJO.store(r as usize, Ordering::SeqCst);
        true
    })
    .unwrap_or(false)
}

pub fn quitar_atajo(app: &AppHandle) {
    let r = ATAJO.swap(0, Ordering::SeqCst);
    if r != 0 {
        let _ = en_principal(app, move || unsafe { UnregisterEventHotKey(r as *mut c_void) });
    }
}

/// Cada 150 ms, con sesión viva y sin pausa: ¿hubo entrada local? → pausa al instante.
pub fn vigilar_entrada_local(app: &AppHandle) {
    let h = app.clone();
    let _ = std::thread::Builder::new().name("starseed-control-entrada-local".into()).spawn(move || loop {
        std::thread::sleep(Duration::from_millis(150));
        if !cn::sesion_viva_sin_pausa() {
            continue;
        }
        // CTL1117M: lo que inyecta el propio control (enigo, a nivel HID) no cuenta; una mano real, sí. Ver `control_entrada_macos::mano_real`.
        let Some(entrada) = crate::control_entrada_macos::mano_real() else { continue };
        crate::control_entrada_macos::al_pausar(); // suelta el botón o la tecla que el control hubiera dejado pulsado
        cn::pausa_local(&h, entrada);
    });
}
