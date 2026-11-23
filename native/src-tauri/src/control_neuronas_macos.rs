//! (ORD1114T) Control entre mis neuronas · el borde macOS del indicador (contrato
//! architecture/control-remoto-entre-neuronas.md §2.4 y permisos-y-control-del-dispositivo.md §4 regla 3).
//!
//! Lo que §2.4 pide en escritorio además del icono de la barra (que sigue en `control_neuronas.rs`):
//!   · **Punto de color siempre encima** (CTL1118H; antes era un marco rojo alrededor de la pantalla): un punto del color de
//!     quien controla en la esquina de arriba a la derecha, en una ventana AppKit `NSPanel` que NO activa la app ni roba el foco
//!     (`NonactivatingPanel`, `becomesKeyOnlyIfNeeded`), en el nivel del salvapantallas, en todos los Espacios y sobre las apps a
//!     pantalla completa. Al pulsarlo se abre un panel con el nombre ENTERO de quien controla (hasta dos líneas), «Reanudar»
//!     (solo en pausa), «Terminar» y «Quitar permiso» (con confirmación). La lógica de posición, textos y confirmación es pura:
//!     `control_punto_logica.rs`. La crea Rust: la página no tiene `core:window` para quitarla.
//!   · **Atajo global fijo ⌃⌥⌘.** (PER1111S §4 regla 3) con `RegisterEventHotKey` de Carbon: no necesita
//!     Accesibilidad ni Monitorización de entrada y lo atiende Rust en el hilo principal → para la sesión
//!     aunque la página esté colgada. Solo está registrado mientras hay sesión.
//!   · **Cualquier tecla o movimiento local pausa**: `CGEventSourceSecondsSinceLastEventType` (estado HID del
//!     sistema, cualquier tipo de entrada) cada 150 ms. No lee QUÉ se tecleó ni dónde: solo cuándo hubo
//!     entrada. En fase 1 la app no inyecta teclas ni clics, así que toda entrada es de la persona; la fase 3
//!     (enigo) tendrá que descontar la suya.
//! Todo lo de AppKit/Carbon corre en el hilo principal (`en_principal`).

use crate::control_neuronas as cn;
use crate::control_punto_logica as p;
use objc2::encode::{Encode, Encoding};
use objc2::runtime::{AnyClass, AnyObject, Bool};
use objc2::msg_send;
use std::cell::RefCell;
use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::time::Duration;
use tauri::AppHandle;

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


/// Una acción de los botones del punto (se ejecuta en el hilo principal de AppKit).
#[derive(Clone, Copy)]
enum Accion {
    Punto,
    Terminar,
    Quitar,
    Reanudar,
}

/// Lo que se creó (solo se toca en el hilo principal).
struct Pieza {
    punto: *mut AnyObject,
    panel: *mut AnyObject,
    nombre: *mut AnyObject,
    estado: *mut AnyObject,
    reanudar: *mut AnyObject,
    quitar: *mut AnyObject,
    nivel: String,
}

thread_local! {
    static PIEZA: RefCell<Option<Pieza>> = const { RefCell::new(None) };
}
/// Se dibujó un punto (con `indicador=oculto` no, y entonces basta el icono de la barra).
static PUNTO_DIBUJADO: AtomicBool = AtomicBool::new(false);
static PUNTO_VISIBLE: AtomicBool = AtomicBool::new(false);
static PAUSADA: AtomicBool = AtomicBool::new(false);
static ATAJO: AtomicUsize = AtomicUsize::new(0);
static MANEJADOR_PUESTO: AtomicBool = AtomicBool::new(false);
/// Cada apertura del panel suma uno: el plegado por tiempo solo vale si nadie lo tocó desde entonces.
static GENERACION: AtomicU64 = AtomicU64::new(0);
static OBJETIVO: AtomicUsize = AtomicUsize::new(0);
fn confirmacion() -> std::sync::MutexGuard<'static, p::Confirmacion> {
    static C: std::sync::Mutex<p::Confirmacion> = std::sync::Mutex::new(p::Confirmacion::nueva());
    C.lock().unwrap_or_else(|e| e.into_inner())
}

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

/// El punto dibujado y a la vista, o no hay punto que dibujar (`indicador=oculto`).
pub fn punto_a_la_vista() -> bool {
    !PUNTO_DIBUJADO.load(Ordering::SeqCst) || PUNTO_VISIBLE.load(Ordering::SeqCst)
}

pub fn punto_dibujado() -> bool {
    PUNTO_DIBUJADO.load(Ordering::SeqCst)
}

fn ns(texto: &str) -> objc2::rc::Retained<objc2_foundation::NSString> {
    objc2_foundation::NSString::from_str(texto)
}

unsafe fn color(r: f64, g: f64, b: f64, a: f64) -> *mut AnyObject {
    let c: &AnyClass = clase("NSColor").expect("NSColor");
    msg_send![c, colorWithSRGBRed: r, green: g, blue: b, alpha: a]
}

/// Una ventana sin marco, transparente, siempre encima y que NO activa la app ni toma el foco.
unsafe fn ventana(marco: Rect) -> *mut AnyObject {
    let c: &AnyClass = clase("NSPanel").expect("NSPanel");
    let w: *mut AnyObject = msg_send![c, alloc];
    // borderless (0) | NonactivatingPanel (1 << 7)
    let w: *mut AnyObject = msg_send![w, initWithContentRect: marco, styleMask: 128usize, backing: 2usize, defer: Bool::NO];
    if w.is_null() {
        return w;
    }
    let claro = color(0.0, 0.0, 0.0, 0.0);
    let _: () = msg_send![w, setReleasedWhenClosed: Bool::YES];
    let _: () = msg_send![w, setFloatingPanel: Bool::YES];
    let _: () = msg_send![w, setHidesOnDeactivate: Bool::NO];
    let _: () = msg_send![w, setBecomesKeyOnlyIfNeeded: Bool::YES];
    let _: () = msg_send![w, setOpaque: Bool::NO];
    let _: () = msg_send![w, setHasShadow: Bool::NO];
    let _: () = msg_send![w, setBackgroundColor: claro];
    let _: () = msg_send![w, setLevel: NIVEL];
    let _: () = msg_send![w, setCollectionBehavior: COMPORTAMIENTO];
    w
}

unsafe fn estilo_capa(vista: *mut AnyObject, radio: f64, fondo: Option<*mut AnyObject>, borde: *mut AnyObject, ancho: f64) {
    let _: () = msg_send![vista, setWantsLayer: Bool::YES];
    let capa: *mut AnyObject = msg_send![vista, layer];
    if capa.is_null() {
        return;
    }
    let _: () = msg_send![capa, setCornerRadius: radio];
    if let Some(f) = fondo {
        let cg: ColorCG = msg_send![f, CGColor];
        let _: () = msg_send![capa, setBackgroundColor: cg];
    }
    let cb: ColorCG = msg_send![borde, CGColor];
    let _: () = msg_send![capa, setBorderColor: cb];
    let _: () = msg_send![capa, setBorderWidth: ancho];
}

/// La clase que recibe las pulsaciones (una sola, creada al primer uso). Cada acción pide su trabajo a un hilo aparte: no se
/// llama a `parar` dentro del manejador de AppKit (cierra las mismas ventanas que están manejando el clic).
fn objetivo() -> *mut AnyObject {
    let ya = OBJETIVO.load(Ordering::SeqCst);
    if ya != 0 {
        return ya as *mut AnyObject;
    }
    let Some(base) = clase("NSObject") else { return std::ptr::null_mut() };
    let nombre = std::ffi::CString::new("StarSeedControlPunto").unwrap_or_default();
    let cls: &'static AnyClass = match objc2::runtime::ClassBuilder::new(&nombre, base) {
        Some(mut b) => unsafe {
            b.add_method(objc2::sel!(ssPunto:), al_punto as unsafe extern "C" fn(*mut AnyObject, objc2::runtime::Sel, *mut AnyObject));
            b.add_method(objc2::sel!(ssTerminar:), al_terminar as unsafe extern "C" fn(*mut AnyObject, objc2::runtime::Sel, *mut AnyObject));
            b.add_method(objc2::sel!(ssQuitar:), al_quitar as unsafe extern "C" fn(*mut AnyObject, objc2::runtime::Sel, *mut AnyObject));
            b.add_method(objc2::sel!(ssReanudar:), al_reanudar as unsafe extern "C" fn(*mut AnyObject, objc2::runtime::Sel, *mut AnyObject));
            b.register()
        },
        None => match clase("StarSeedControlPunto") {
            Some(c) => c, // ya registrada por una creación anterior
            None => return std::ptr::null_mut(),
        },
    };
    let o: *mut AnyObject = unsafe { msg_send![cls, new] };
    OBJETIVO.store(o as usize, Ordering::SeqCst);
    o
}

unsafe extern "C" fn al_punto(_s: *mut AnyObject, _c: objc2::runtime::Sel, _e: *mut AnyObject) {
    hacer(Accion::Punto);
}
unsafe extern "C" fn al_terminar(_s: *mut AnyObject, _c: objc2::runtime::Sel, _e: *mut AnyObject) {
    hacer(Accion::Terminar);
}
unsafe extern "C" fn al_quitar(_s: *mut AnyObject, _c: objc2::runtime::Sel, _e: *mut AnyObject) {
    hacer(Accion::Quitar);
}
unsafe extern "C" fn al_reanudar(_s: *mut AnyObject, _c: objc2::runtime::Sel, _e: *mut AnyObject) {
    hacer(Accion::Reanudar);
}

fn aparte(f: impl FnOnce(&AppHandle) + Send + 'static) {
    if let Some(app) = cn::APP.get() {
        let h = app.clone();
        let _ = std::thread::Builder::new().name("starseed-control-punto".into()).spawn(move || f(&h));
    }
}

fn hacer(a: Accion) {
    match a {
        Accion::Punto => alternar_panel(),
        Accion::Terminar => aparte(|h| cn::parar(h, "la-persona-desde-el-indicador")),
        Accion::Reanudar => aparte(|h| cn::reanudar(h, "la-persona-desde-el-indicador")),
        Accion::Quitar => {
            let ejecutar = confirmacion().pulsar(cn::mono_k());
            if ejecutar {
                aparte(|h| cn::apagar_interruptor(h, "la-persona-quito-el-permiso"));
            } else {
                titulo_quitar();
                // A los 5 s se deshace sola si nadie confirmó.
                aparte(|h| {
                    std::thread::sleep(Duration::from_millis(p::CONFIRMAR_MS + 100));
                    let h2 = h.clone();
                    let _ = en_principal(&h2, || {
                        if !confirmacion().armada(cn::mono_k()) {
                            titulo_quitar();
                        }
                    });
                });
            }
        }
    }
}

/// Pone en «Quitar permiso» el texto que toca (con o sin la petición de confirmar). Hilo principal.
fn titulo_quitar() {
    let t = confirmacion().texto_boton(cn::mono_k());
    PIEZA.with(|p| {
        if let Some(z) = p.borrow().as_ref() {
            unsafe {
                let _: () = msg_send![z.quitar, setTitle: &*ns(t)];
            }
        }
    });
}

fn panel_visible(z: &Pieza) -> bool {
    let v: Bool = unsafe { msg_send![z.panel, isVisible] };
    v.as_bool()
}

fn alternar_panel() {
    let abrir = PIEZA.with(|p| p.borrow().as_ref().is_some_and(|z| !panel_visible(z)));
    PIEZA.with(|p| {
        if let Some(z) = p.borrow().as_ref() {
            unsafe {
                if abrir {
                    let _: () = msg_send![z.panel, orderFrontRegardless];
                } else {
                    let _: () = msg_send![z.panel, orderOut: std::ptr::null_mut::<AnyObject>()];
                }
            }
        }
    });
    confirmacion().deshacer();
    titulo_quitar();
    let g = GENERACION.fetch_add(1, Ordering::SeqCst) + 1;
    if abrir {
        // Se pliega solo a los 5 s si nadie lo ha vuelto a tocar.
        aparte(move |h| {
            std::thread::sleep(Duration::from_millis(p::PLEGAR_MS));
            if GENERACION.load(Ordering::SeqCst) != g {
                return;
            }
            let _ = en_principal(h, || {
                PIEZA.with(|p| {
                    if let Some(z) = p.borrow().as_ref() {
                        unsafe {
                            let _: () = msg_send![z.panel, orderOut: std::ptr::null_mut::<AnyObject>()];
                        }
                    }
                });
                confirmacion().deshacer();
                titulo_quitar();
            });
        });
    }
}

fn area_util() -> Rect {
    unsafe {
        let Some(c) = clase("NSScreen") else { return Rect { o: Punto { x: 0.0, y: 0.0 }, t: Tam { w: 1280.0, h: 800.0 } } };
        let pantallas: *mut AnyObject = msg_send![c, screens];
        let vacio = Rect { o: Punto { x: 0.0, y: 0.0 }, t: Tam { w: 1280.0, h: 800.0 } };
        if pantallas.is_null() {
            return vacio;
        }
        let n: usize = msg_send![pantallas, count];
        if n == 0 {
            return vacio;
        }
        let p0: *mut AnyObject = msg_send![pantallas, objectAtIndex: 0usize]; // la de la barra de menús
        msg_send![p0, visibleFrame]
    }
}

fn a_lib(r: Rect) -> p::Rect {
    p::Rect { x: r.o.x, y: r.o.y, w: r.t.w, h: r.t.h }
}
fn de_lib(r: p::Rect) -> Rect {
    Rect { o: Punto { x: r.x, y: r.y }, t: Tam { w: r.w, h: r.h } }
}

const PANEL_ALTO: f64 = 192.0;

/// Pone el indicador de AppKit: el punto del color de `color_hex` (si `indicador` no es «oculto») y su panel. `true` = completo.
pub fn poner_punto(app: &AppHandle, nombre: &str, color_hex: &str, nivel: &str, indicador: &str) -> bool {
    let (nombre, color_hex, nivel, indicador) = (nombre.to_string(), color_hex.to_string(), nivel.to_string(), indicador.to_string());
    en_principal(app, move || unsafe { crear_punto(&nombre, &color_hex, &nivel, &indicador) }).unwrap_or(false)
}

unsafe fn crear_punto(nombre: &str, color_hex: &str, nivel: &str, indicador: &str) -> bool {
    quitar_en_principal();
    PAUSADA.store(false, Ordering::SeqCst);
    // Con la barra de menús siempre hay otro aviso (el icono de `control_neuronas`): «oculto» quita el punto.
    let dibujar = p::dibujar_punto(indicador, true);
    PUNTO_DIBUJADO.store(dibujar, Ordering::SeqCst);
    if !dibujar {
        PUNTO_VISIBLE.store(false, Ordering::SeqCst);
        return true;
    }
    let (r, g, b) = p::color_rgb(color_hex);
    let del_controlador = color(r, g, b, 1.0);
    let blanco = color(1.0, 1.0, 1.0, 1.0);
    let objetivo = objetivo();
    if objetivo.is_null() {
        return false;
    }
    let area = a_lib(area_util());
    let rp = p::punto_en_esquina(area, p::Eje::YHaciaArriba);
    let rpanel = p::panel_junto_al_punto(rp, area, p::Eje::YHaciaArriba, PANEL_ALTO);

    // El punto.
    let punto = ventana(de_lib(rp));
    if punto.is_null() {
        return false;
    }
    let cv: *mut AnyObject = msg_send![punto, contentView];
    estilo_capa(cv, p::PUNTO / 2.0, Some(del_controlador), blanco, 2.0);
    let c_boton: &AnyClass = clase("NSButton").expect("NSButton");
    let boton: *mut AnyObject = msg_send![c_boton, alloc];
    let boton: *mut AnyObject = msg_send![boton, initWithFrame: Rect { o: Punto { x: 0.0, y: 0.0 }, t: Tam { w: p::PUNTO, h: p::PUNTO } }];
    let _: () = msg_send![boton, setBordered: Bool::NO];
    let _: () = msg_send![boton, setTitle: &*ns("")];
    let _: () = msg_send![boton, setTarget: objetivo];
    let _: () = msg_send![boton, setAction: objc2::sel!(ssPunto:)];
    let _: () = msg_send![cv, addSubview: boton];

    // El panel.
    let panel = ventana(de_lib(rpanel));
    if panel.is_null() {
        let _: () = msg_send![punto, close];
        return false;
    }
    let pv: *mut AnyObject = msg_send![panel, contentView];
    let fondo = color(24.0 / 255.0, 24.0 / 255.0, 32.0 / 255.0, 0.94);
    estilo_capa(pv, 12.0, Some(fondo), del_controlador, 2.0);
    let c_campo: &AnyClass = clase("NSTextField").expect("NSTextField");
    let c_fuente: &AnyClass = clase("NSFont").expect("NSFont");
    let ancho = p::PANEL_ANCHO - 24.0;
    // Nombre ENTERO, hasta tres líneas, explícitamente con autoresizing para que AppKit respete setFrame:.
    let titulo_nombre = format!("Controlada por:\n{nombre}");
    let n_campo: *mut AnyObject = msg_send![c_campo, wrappingLabelWithString: &*ns(&titulo_nombre)];
    let f_nombre: *mut AnyObject = msg_send![c_fuente, boldSystemFontOfSize: 13.0f64];
    let _: () = msg_send![n_campo, setTranslatesAutoresizingMaskIntoConstraints: Bool::YES];
    let _: () = msg_send![n_campo, setDrawsBackground: Bool::NO];
    let _: () = msg_send![n_campo, setBezeled: Bool::NO];
    let _: () = msg_send![n_campo, setEditable: Bool::NO];
    let _: () = msg_send![n_campo, setSelectable: Bool::NO];
    let _: () = msg_send![n_campo, setUsesSingleLineMode: Bool::NO];
    let _: () = msg_send![n_campo, setFont: f_nombre];
    let _: () = msg_send![n_campo, setTextColor: blanco];
    let _: () = msg_send![n_campo, setMaximumNumberOfLines: 3isize];
    let _: () = msg_send![n_campo, setLineBreakMode: 4usize];
    let _: () = msg_send![n_campo, setFrame: Rect { o: Punto { x: 12.0, y: 136.0 }, t: Tam { w: ancho, h: 44.0 } }];
    let _: () = msg_send![pv, addSubview: n_campo];
    // Estado.
    let e_campo: *mut AnyObject = msg_send![c_campo, labelWithString: &*ns(&p::texto_estado(nivel, false))];
    let f_chica: *mut AnyObject = msg_send![c_fuente, systemFontOfSize: 11.0f64];
    let gris = color(0.8, 0.8, 0.85, 1.0);
    let _: () = msg_send![e_campo, setTranslatesAutoresizingMaskIntoConstraints: Bool::YES];
    let _: () = msg_send![e_campo, setDrawsBackground: Bool::NO];
    let _: () = msg_send![e_campo, setBezeled: Bool::NO];
    let _: () = msg_send![e_campo, setEditable: Bool::NO];
    let _: () = msg_send![e_campo, setFont: f_chica];
    let _: () = msg_send![e_campo, setTextColor: gris];
    let _: () = msg_send![e_campo, setFrame: Rect { o: Punto { x: 12.0, y: 114.0 }, t: Tam { w: ancho, h: 18.0 } }];
    let _: () = msg_send![pv, addSubview: e_campo];
    // Botones: Reanudar (solo en pausa), Terminar, Quitar permiso.
    let crear_boton = |titulo: &str, accion: objc2::runtime::Sel, y: f64| -> *mut AnyObject {
        let b: *mut AnyObject = msg_send![c_boton, buttonWithTitle: &*ns(titulo), target: objetivo, action: accion];
        let _: () = msg_send![b, setTranslatesAutoresizingMaskIntoConstraints: Bool::YES];
        let _: () = msg_send![b, setFrame: Rect { o: Punto { x: 12.0, y }, t: Tam { w: ancho, h: 26.0 } }];
        let _: () = msg_send![pv, addSubview: b];
        b
    };
    let reanudar = crear_boton("Reanudar", objc2::sel!(ssReanudar:), 78.0);
    let _: () = msg_send![reanudar, setHidden: Bool::YES];
    let _terminar = crear_boton("Terminar (el permiso sigue)", objc2::sel!(ssTerminar:), 45.0);
    let quitar = crear_boton(p::TEXTO_QUITAR, objc2::sel!(ssQuitar:), 12.0);
    confirmacion().deshacer();

    let _: () = msg_send![punto, orderFrontRegardless];
    let visible: Bool = msg_send![punto, isVisible];
    if !visible.as_bool() {
        let _: () = msg_send![punto, close];
        let _: () = msg_send![panel, close];
        PUNTO_VISIBLE.store(false, Ordering::SeqCst);
        return false;
    }
    PUNTO_VISIBLE.store(true, Ordering::SeqCst);
    PIEZA.with(|z| *z.borrow_mut() = Some(Pieza { punto, panel, nombre: n_campo, estado: e_campo, reanudar, quitar, nivel: nivel.to_string() }));
    true
}

/// Actualiza el nombre visible en el panel del punto (p. ej. al sumarse o salir otro controlador).
pub fn actualizar_nombre(app: &AppHandle, nombre: &str) {
    let texto = format!("Controlada por:\n{nombre}");
    let _ = en_principal(app, move || {
        PIEZA.with(|z| {
            if let Some(pz) = z.borrow().as_ref() {
                unsafe {
                    let _: () = msg_send![pz.nombre, setStringValue: &*ns(&texto)];
                }
            }
        });
    });
}

fn quitar_en_principal() {
    PIEZA.with(|z| {
        if let Some(p) = z.borrow_mut().take() {
            unsafe {
                for w in [p.panel, p.punto] {
                    let _: () = msg_send![w, orderOut: std::ptr::null_mut::<AnyObject>()];
                    let _: () = msg_send![w, close];
                }
            }
        }
    });
    PUNTO_VISIBLE.store(false, Ordering::SeqCst);
    PUNTO_DIBUJADO.store(false, Ordering::SeqCst);
    GENERACION.fetch_add(1, Ordering::SeqCst);
}

pub fn quitar_punto(app: &AppHandle) {
    PUNTO_VISIBLE.store(false, Ordering::SeqCst);
    let _ = en_principal(app, quitar_en_principal);
}

/// La pausa local cambia el texto del panel, enseña «Reanudar» y baja la opacidad del punto.
pub fn marcar_pausa(app: &AppHandle, pausada: bool) {
    PAUSADA.store(pausada, Ordering::SeqCst);
    let _ = en_principal(app, move || {
        PIEZA.with(|z| {
            if let Some(pz) = z.borrow().as_ref() {
                unsafe {
                    let _: () = msg_send![pz.estado, setStringValue: &*ns(&p::texto_estado(&pz.nivel, pausada))];
                    let _: () = msg_send![pz.reanudar, setHidden: Bool::new(!pausada)];
                    let _: () = msg_send![pz.punto, setAlphaValue: if pausada { 0.45f64 } else { 1.0f64 }];
                }
            }
        });
    });
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

/// Cada 150 ms, con sesión viva: ¿hubo entrada local? → pausa al instante. (CTL1118P) Con la pausa ya puesta se sigue mirando: cada
/// actividad física nueva vuelve a empezar los 3 s (`cn::pausa_local` lo hace sin pausar otra vez).
pub fn vigilar_entrada_local(app: &AppHandle) {
    let h = app.clone();
    let _ = std::thread::Builder::new().name("starseed-control-entrada-local".into()).spawn(move || loop {
        std::thread::sleep(Duration::from_millis(150));
        if !cn::sesion_viva() {
            continue;
        }
        let ya_pausada = !cn::sesion_viva_sin_pausa();
        // CTL1117M: lo que inyecta el propio control (enigo, a nivel HID) no cuenta; una mano real, sí. Ver `control_entrada_macos::mano_real`.
        let Some(entrada) = crate::control_entrada_macos::mano_real() else { continue };
        if !ya_pausada {
            crate::control_entrada_macos::al_pausar(); // suelta el botón o la tecla que el control hubiera dejado pulsado
        }
        cn::pausa_local(&h, entrada);
    });
}
