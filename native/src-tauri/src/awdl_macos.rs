// ═══════════════════════════════════════════════════════════════════════════
// awdl_macos — Wi-Fi P2P entre Mac por AWDL, sin router ni hotspot (WFA1109A, 2026-11-09).
// Contrato: architecture/wifi-directo.md §4.3. SOLO macOS (macOS 10.15+ para el API `nw_*` con peer-to-peer).
// ---------------------------------------------------------------------------
// AWDL (Apple Wireless Direct Link) es lo que usan AirDrop y AirPlay: dos Mac cercanos se hablan por una interfaz
// `awdl0` SIN soltar su Wi-Fi de casa. Apple solo lo expone a través de Network.framework: parámetros con
// `nw_parameters_set_include_peer_to_peer(true)` y un servicio Bonjour. Aquí:
//   · un `nw_listener` que anuncia `starseed-<huella>` de tipo `_starseed-p2p._tcp` (peer-to-peer);
//   · un `nw_browser` que descubre a los demás y los apunta como vecinos `awdl:<huella>`;
//   · una conexión por mensaje, como el canal TCP 47071: [preámbulo «AWDL1:<huella>\n»] + trama «SSM1…»
//     y el acuse de vuelta. La trama, el saludo firmado y el cifrado de sesión (CIF1108A) son los MISMOS: esto
//     solo transporta (el preámbulo es una etiqueta de encaminamiento; quién es lo prueba el saludo firmado).
// Los símbolos `nw_*` se buscan con `dlsym` en el momento de usarlos (como puerta_proxy.rs): un Mac anterior
// arranca igual y responde «no se puede». Los bloques de Objective-C vienen de block2 (ya en el árbol por objc2).
// Mac ↔ Android NO tiene AWDL (Android no lo habla): ahí, Bluetooth.
// ═══════════════════════════════════════════════════════════════════════════

use crate::malla_local;
use crate::malla_local_trama as trama;
use crate::wifi_p2p_logica::{self as l, Ensamblado, LecturaPreambulo, Vecinos};
use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::{AnyObject, Bool};
use std::collections::HashMap;
use std::ffi::{c_char, c_void, CStr, CString};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{mpsc, Arc, Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

#[link(name = "Network", kind = "framework")]
extern "C" {}

extern "C" {
    fn dlsym(handle: *mut c_void, simbolo: *const c_char) -> *mut c_void;
    fn dispatch_queue_create(etiqueta: *const c_char, atributos: *mut c_void) -> *mut AnyObject;
    fn dispatch_data_create(buffer: *const c_void, tam: usize, cola: *mut AnyObject, destructor: *const c_void) -> *mut AnyObject;
    fn dispatch_data_create_map(datos: *mut AnyObject, buffer: *mut *const c_void, tam: *mut usize) -> *mut AnyObject;
}
const RTLD_DEFAULT: *mut c_void = -2isize as *mut c_void;

/// `nw_connection_state_t`
const CONEXION_LISTA: i32 = 3;
const CONEXION_FALLO: i32 = 4;
const CONEXION_CANCELADA: i32 = 5;

const MAX_ENTRANTES: usize = 8;
const VIDA_ENTRANTE: Duration = Duration::from_secs(10);
const ESPERA_ENVIO: Duration = Duration::from_secs(6);
const EDAD_VECINO_MS: u64 = 60_000;

type P = *mut AnyObject;
type Pc = *const c_void;

/// Los puntos de entrada de Network.framework, buscados una vez. Todos o ninguno.
struct Api {
    param_tcp: unsafe extern "C" fn(Pc, Pc) -> P,
    param_p2p: unsafe extern "C" fn(P, bool),
    anuncio: unsafe extern "C" fn(*const c_char, *const c_char, *const c_char) -> P,
    busqueda: unsafe extern "C" fn(*const c_char, *const c_char) -> P,
    l_crear: unsafe extern "C" fn(P) -> P,
    l_cola: unsafe extern "C" fn(P, P),
    l_anunciar: unsafe extern "C" fn(P, P),
    l_nueva: unsafe extern "C" fn(P, Pc),
    l_estado: unsafe extern "C" fn(P, Pc),
    l_iniciar: unsafe extern "C" fn(P),
    l_cancelar: unsafe extern "C" fn(P),
    b_crear: unsafe extern "C" fn(P, P) -> P,
    b_cola: unsafe extern "C" fn(P, P),
    b_cambios: unsafe extern "C" fn(P, Pc),
    b_iniciar: unsafe extern "C" fn(P),
    b_cancelar: unsafe extern "C" fn(P),
    r_punto: unsafe extern "C" fn(P) -> P,
    p_nombre: unsafe extern "C" fn(P) -> *const c_char,
    c_crear: unsafe extern "C" fn(P, P) -> P,
    c_cola: unsafe extern "C" fn(P, P),
    c_estado: unsafe extern "C" fn(P, Pc),
    c_iniciar: unsafe extern "C" fn(P),
    c_cancelar: unsafe extern "C" fn(P),
    c_enviar: unsafe extern "C" fn(P, P, Pc, bool, Pc),
    c_recibir: unsafe extern "C" fn(P, u32, u32, Pc),
    /// `NW_CONNECTION_DEFAULT_MESSAGE_CONTEXT`
    contexto: Pc,
    /// `NW_PARAMETERS_DISABLE_PROTOCOL` y `NW_PARAMETERS_DEFAULT_CONFIGURATION` (bloques globales)
    sin_tls: Pc,
    por_defecto: Pc,
}

// SAFETY: son punteros a funciones y a constantes globales del sistema, inmutables.
unsafe impl Send for Api {}
unsafe impl Sync for Api {}

unsafe fn simbolo<T: Copy>(nombre: &str) -> Option<T> {
    let c = CString::new(nombre).ok()?;
    let p = unsafe { dlsym(RTLD_DEFAULT, c.as_ptr()) };
    if p.is_null() {
        return None;
    }
    // SAFETY: el símbolo tiene la firma documentada en Network.framework; `T` es un puntero a función.
    Some(unsafe { std::mem::transmute_copy::<*mut c_void, T>(&p) })
}

/// El valor de una constante global del tipo «puntero» (`extern const nw_..._t NOMBRE;`).
unsafe fn constante(nombre: &str) -> Option<Pc> {
    let p: *const Pc = unsafe { simbolo(nombre)? };
    let v = unsafe { *p };
    (!v.is_null()).then_some(v)
}

fn cargar() -> Option<Api> {
    // SAFETY: cada firma es la de su declaración en <Network/*.h>.
    unsafe {
        Some(Api {
            param_tcp: simbolo("nw_parameters_create_secure_tcp")?,
            param_p2p: simbolo("nw_parameters_set_include_peer_to_peer")?,
            anuncio: simbolo("nw_advertise_descriptor_create_bonjour_service")?,
            busqueda: simbolo("nw_browse_descriptor_create_bonjour_service")?,
            l_crear: simbolo("nw_listener_create")?,
            l_cola: simbolo("nw_listener_set_queue")?,
            l_anunciar: simbolo("nw_listener_set_advertise_descriptor")?,
            l_nueva: simbolo("nw_listener_set_new_connection_handler")?,
            l_estado: simbolo("nw_listener_set_state_changed_handler")?,
            l_iniciar: simbolo("nw_listener_start")?,
            l_cancelar: simbolo("nw_listener_cancel")?,
            b_crear: simbolo("nw_browser_create")?,
            b_cola: simbolo("nw_browser_set_queue")?,
            b_cambios: simbolo("nw_browser_set_browse_results_changed_handler")?,
            b_iniciar: simbolo("nw_browser_start")?,
            b_cancelar: simbolo("nw_browser_cancel")?,
            r_punto: simbolo("nw_browse_result_copy_endpoint")?,
            p_nombre: simbolo("nw_endpoint_get_bonjour_service_name")?,
            c_crear: simbolo("nw_connection_create")?,
            c_cola: simbolo("nw_connection_set_queue")?,
            c_estado: simbolo("nw_connection_set_state_changed_handler")?,
            c_iniciar: simbolo("nw_connection_start")?,
            c_cancelar: simbolo("nw_connection_cancel")?,
            c_enviar: simbolo("nw_connection_send")?,
            c_recibir: simbolo("nw_connection_receive")?,
            contexto: constante("_nw_content_context_default_message")?,
            sin_tls: constante("_nw_parameters_configure_protocol_disable")?,
            por_defecto: constante("_nw_parameters_configure_protocol_default_configuration")?,
        })
    }
}

fn api() -> Option<&'static Api> {
    static A: OnceLock<Option<Api>> = OnceLock::new();
    A.get_or_init(cargar).as_ref()
}

/// ¿Hay API peer-to-peer de Network.framework en este Mac?
pub fn disponible() -> bool {
    api().is_some()
}

fn version_macos() -> (u32, u32) {
    use objc2_foundation::NSProcessInfo;
    let v = NSProcessInfo::processInfo().operatingSystemVersion();
    (v.majorVersion as u32, v.minorVersion as u32)
}

/// Los carriles que anuncia este Mac: `awdl` si hay API, versión y no está el escape `STARSEED_SIN_AWDL`.
pub fn lanas() -> Vec<String> {
    let (ma, mi) = version_macos();
    l::lanas_macos(ma, mi, l::sin_awdl_en_entorno(), disponible())
}

// ─────────────────────────────── Objetos ───────────────────────────────

/// Un objeto de Network.framework (OS_object: cuenta de referencias de Objective-C) que puede viajar entre hilos.
struct Obj(Retained<AnyObject>);
// SAFETY: los objetos `nw_*` son seguros entre hilos (se usan siempre desde su cola o con sus funciones thread-safe).
unsafe impl Send for Obj {}
unsafe impl Sync for Obj {}

impl Obj {
    fn nuevo(p: P) -> Option<Obj> {
        // SAFETY: las funciones `create`/`copy` devuelven +1: `from_raw` lo adopta.
        unsafe { Retained::from_raw(p) }.map(Obj)
    }
    fn prestado(p: P) -> Option<Obj> {
        // SAFETY: un argumento de callback es +0 y vivo durante la llamada: se retiene.
        unsafe { Retained::retain(p) }.map(Obj)
    }
    fn p(&self) -> P {
        Retained::as_ptr(&self.0) as P
    }
}

fn ahora_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn bloque_ptr<T: ?Sized>(b: &RcBlock<T>) -> Pc {
    &**b as *const _ as Pc
}

struct Vivo {
    huella: String,
    cola: Obj,
    listener: Obj,
    browser: Obj,
}

static VIVO: Mutex<Option<Vivo>> = Mutex::new(None);
static MOTIVO: Mutex<String> = Mutex::new(String::new());
static ENTRANTES: AtomicUsize = AtomicUsize::new(0);

fn punto_de(dir: &str) -> Option<Obj> {
    let g = puntos().lock().ok()?;
    g.get(dir).and_then(|o| Obj::prestado(o.p()))
}

fn puntos() -> &'static Mutex<HashMap<String, Obj>> {
    static M: OnceLock<Mutex<HashMap<String, Obj>>> = OnceLock::new();
    M.get_or_init(|| Mutex::new(HashMap::new()))
}

fn vecinos_tabla() -> &'static Mutex<Vecinos> {
    static M: OnceLock<Mutex<Vecinos>> = OnceLock::new();
    M.get_or_init(|| Mutex::new(Vecinos::default()))
}

fn motivo(t: &str) {
    if let Ok(mut m) = MOTIVO.lock() {
        *m = t.to_string();
    }
}

/// Vecinos AWDL vistos ahora: (`awdl:<huella>`, hace cuántos segundos).
pub fn vecinos() -> Vec<(String, u64)> {
    if let Ok(mut t) = vecinos_tabla().lock() {
        t.purgar(ahora_ms(), EDAD_VECINO_MS);
        return t.lista(ahora_ms());
    }
    Vec::new()
}

pub fn activo() -> bool {
    VIVO.lock().map(|g| g.is_some()).unwrap_or(false)
}

pub fn texto_estado() -> String {
    MOTIVO.lock().map(|m| m.clone()).unwrap_or_default()
}

// ─────────────────────────────── Parámetros ───────────────────────────────

/// TCP sin TLS (la capa TS ya firma y cifra) con peer-to-peer: es lo que enciende AWDL.
fn parametros(a: &Api) -> Option<Obj> {
    // SAFETY: bloques globales del sistema, firmas de <Network/parameters.h>.
    let p = Obj::nuevo(unsafe { (a.param_tcp)(a.sin_tls, a.por_defecto) })?;
    unsafe { (a.param_p2p)(p.p(), true) };
    Some(p)
}

fn cstr(t: &str) -> Option<CString> {
    CString::new(t).ok()
}

// ─────────────────────────────── Recibir ───────────────────────────────

enum Seguir {
    Si,
    No,
}

/// Lo que se hace con los bytes acumulados cada vez que llega un trozo.
struct Rx {
    acum: Mutex<Vec<u8>>,
    cb: Box<dyn Fn(&mut Vec<u8>) -> Seguir + Send + Sync>,
}

fn bytes_de(datos: P) -> Vec<u8> {
    let mut p: *const c_void = std::ptr::null();
    let mut n: usize = 0;
    // SAFETY: `datos` es un dispatch_data_t vivo (argumento de callback); el mapa es un objeto nuevo (+1).
    let mapa = unsafe { Obj::nuevo(dispatch_data_create_map(datos, &mut p, &mut n)) };
    if p.is_null() || n == 0 {
        return Vec::new();
    }
    // SAFETY: `p` apunta a `n` bytes que viven mientras viva `mapa`.
    let v = unsafe { std::slice::from_raw_parts(p as *const u8, n) }.to_vec();
    drop(mapa);
    v
}

fn datos_de(a: &Api, cola: P, bytes: &[u8]) -> Option<Obj> {
    let _ = a;
    // SAFETY: copia los bytes (destructor por defecto = NULL).
    Obj::nuevo(unsafe { dispatch_data_create(bytes.as_ptr() as Pc, bytes.len(), cola, std::ptr::null()) })
}

fn recibir(a: &'static Api, conn: Arc<Obj>, rx: Arc<Rx>) {
    let c2 = conn.clone();
    let rx2 = rx.clone();
    let bloque = RcBlock::new(move |contenido: P, _ctx: P, completo: Bool, error: P| {
        if !contenido.is_null() {
            let b = bytes_de(contenido);
            if let Ok(mut g) = rx2.acum.lock() {
                g.extend_from_slice(&b);
            }
        }
        let seguir = match rx2.acum.lock() {
            Ok(mut g) => (rx2.cb)(&mut g),
            Err(_) => Seguir::No,
        };
        let fin = !error.is_null() || (completo.as_bool() && contenido.is_null());
        match (seguir, fin) {
            (Seguir::Si, false) => recibir(a, c2.clone(), rx2.clone()),
            _ => unsafe { (a.c_cancelar)(c2.p()) },
        }
    });
    // SAFETY: la conexión está viva (la sujeta `conn`); el sistema copia el bloque.
    unsafe { (a.c_recibir)(conn.p(), 1, 65_536, bloque_ptr(&bloque)) };
}

fn enviar_bytes(a: &'static Api, cola: P, conn: &Arc<Obj>, bytes: &[u8], alcabar: impl Fn(bool) + Send + Sync + 'static) {
    let Some(d) = datos_de(a, cola, bytes) else {
        alcabar(false);
        return;
    };
    let bloque = RcBlock::new(move |error: P| alcabar(error.is_null()));
    // SAFETY: conexión viva; `d` se retiene dentro de la llamada.
    unsafe { (a.c_enviar)(conn.p(), d.p(), a.contexto, true, bloque_ptr(&bloque)) };
}

// ─────────────────────────────── Entrante ───────────────────────────────

/// Una conexión que llegó por AWDL: preámbulo, trama, entrega al buzón del canal local y acuse.
fn atender(a: &'static Api, app: AppHandle, cola: P, conn: Obj) {
    if ENTRANTES.fetch_add(1, Ordering::SeqCst) >= MAX_ENTRANTES {
        ENTRANTES.fetch_sub(1, Ordering::SeqCst);
        unsafe { (a.c_cancelar)(conn.p()) };
        return;
    }
    let conn = Arc::new(conn);
    let etiqueta: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    let entregado = Arc::new(AtomicBool::new(false));
    // La plaza se devuelve al cancelarse la conexión (estado final) o a los 10 s.
    let c_estado = conn.clone();
    let c_cola = cola as usize;
    let rx_conn = conn.clone();
    let cb_conn = conn.clone();
    let cb_etiqueta = etiqueta.clone();
    let cb_entregado = entregado.clone();
    let rx = Arc::new(Rx {
        acum: Mutex::new(Vec::new()),
        cb: Box::new(move |acum: &mut Vec<u8>| {
            let mut et = match cb_etiqueta.lock() {
                Ok(g) => g,
                Err(_) => return Seguir::No,
            };
            if et.is_none() {
                match l::leer_preambulo(acum) {
                    LecturaPreambulo::Incompleto => return Seguir::Si,
                    LecturaPreambulo::Invalido => return Seguir::No,
                    LecturaPreambulo::Completo { huella } => {
                        acum.drain(..l::LARGO_PREAMBULO);
                        *et = Some(format!("awdl:{huella}"));
                    }
                }
            }
            match l::ensamblar(acum) {
                Ensamblado::Incompleto => Seguir::Si,
                Ensamblado::Invalido(_) => Seguir::No,
                Ensamblado::Completo { tipo, cuerpo, .. } => {
                    if tipo != trama::TipoTrama::Mensaje || cb_entregado.swap(true, Ordering::SeqCst) {
                        return Seguir::No;
                    }
                    let etiqueta = et.clone().unwrap_or_default();
                    if malla_local::entregar_externo(&app, &etiqueta, cuerpo) {
                        let c = cb_conn.clone();
                        // Acuse: la trama «acuse» de siempre. Al terminar de enviarlo, se cierra.
                        enviar_bytes(a, c_cola as P, &cb_conn, &l::trama_acuse(), move |_| unsafe { (a.c_cancelar)(c.p()) });
                    }
                    Seguir::No
                }
            }
        }),
    });
    let estado = RcBlock::new(move |s: i32, _e: P| match s {
        CONEXION_LISTA => recibir(a, rx_conn.clone(), rx.clone()),
        CONEXION_FALLO | CONEXION_CANCELADA => {
            ENTRANTES.fetch_sub(1, Ordering::SeqCst);
        }
        _ => {}
    });
    // SAFETY: conexión recién llegada (+1 retenido en `conn`); se le da cola antes de arrancarla.
    unsafe {
        (a.c_cola)(c_estado.p(), cola);
        (a.c_estado)(c_estado.p(), bloque_ptr(&estado));
        (a.c_iniciar)(c_estado.p());
    }
    // Quien no termina en 10 s se corta (y devuelve su plaza al pasar a «cancelada»).
    let corte = conn.clone();
    let _ = std::thread::Builder::new().name("starseed-awdl-corte".into()).spawn(move || {
        std::thread::sleep(VIDA_ENTRANTE);
        unsafe { (a.c_cancelar)(corte.p()) };
    });
}

// ─────────────────────────────── Saliente ───────────────────────────────

/// Envía un JSON a un vecino AWDL y espera su acuse (como `malla_local::enviar` por TCP). Devuelve los ms.
pub fn enviar(direccion: &str, json: &str) -> Result<u64, String> {
    let a = api().ok_or("Este macOS no trae el API peer-to-peer de Network.framework (hace falta macOS 10.15 o más nuevo).")?;
    let (huella, cola) = {
        let g = VIVO.lock().map_err(|_| "estado interno bloqueado")?;
        let v = g.as_ref().ok_or("AWDL no está activo en este Mac (¿en «Nunca»?).")?;
        (v.huella.clone(), Obj::prestado(v.cola.p()).ok_or("sin cola de despacho")?)
    };
    if trama::direccion_awdl(direccion).is_none() {
        return Err(format!("«{direccion}» no es una dirección AWDL."));
    }
    let punto = punto_de(direccion).ok_or_else(|| format!("{direccion} ya no está a la vista por AWDL."))?;
    let mut bytes = l::preambulo(&huella).ok_or("huella propia no válida")?;
    bytes.extend_from_slice(&l::trama_mensaje(json)?);
    let params = parametros(a).ok_or("no se pudieron crear los parámetros peer-to-peer")?;
    // SAFETY: punto y parámetros vivos; `create` devuelve +1.
    let conn = Arc::new(Obj::nuevo(unsafe { (a.c_crear)(punto.p(), params.p()) }).ok_or("no se pudo crear la conexión AWDL")?);
    let (tx, rx_canal) = mpsc::channel::<Result<(), String>>();
    let inicio = Instant::now();
    let tx_acuse = tx.clone();
    let rx = Arc::new(Rx {
        acum: Mutex::new(Vec::new()),
        cb: Box::new(move |acum: &mut Vec<u8>| match l::ensamblar(acum) {
            Ensamblado::Incompleto => Seguir::Si,
            Ensamblado::Completo { tipo: trama::TipoTrama::Acuse, .. } => {
                let _ = tx_acuse.send(Ok(()));
                Seguir::No
            }
            Ensamblado::Completo { .. } => {
                let _ = tx_acuse.send(Err("el vecino contestó otra cosa que un acuse".into()));
                Seguir::No
            }
            Ensamblado::Invalido(e) => {
                let _ = tx_acuse.send(Err(format!("respuesta no válida del vecino ({e})")));
                Seguir::No
            }
        }),
    });
    let c_estado = conn.clone();
    let tx_estado = tx.clone();
    let cola_p = cola.p() as usize;
    let estado = RcBlock::new(move |s: i32, _e: P| match s {
        CONEXION_LISTA => {
            let tx_envio = tx_estado.clone();
            enviar_bytes(a, cola_p as P, &c_estado, &bytes, move |ok| {
                if !ok {
                    let _ = tx_envio.send(Err("no se pudo escribir en la conexión AWDL".into()));
                }
            });
            recibir(a, c_estado.clone(), rx.clone());
        }
        CONEXION_FALLO | CONEXION_CANCELADA => {
            let _ = tx_estado.send(Err("la conexión AWDL falló o se cerró antes del acuse".into()));
        }
        _ => {}
    });
    // SAFETY: conexión viva; se le da cola antes de arrancarla.
    unsafe {
        (a.c_cola)(conn.p(), cola.p());
        (a.c_estado)(conn.p(), bloque_ptr(&estado));
        (a.c_iniciar)(conn.p());
    }
    let r = rx_canal.recv_timeout(ESPERA_ENVIO).unwrap_or_else(|_| Err("AWDL no contestó a tiempo".into()));
    unsafe { (a.c_cancelar)(conn.p()) };
    r.map(|_| inicio.elapsed().as_millis() as u64).map_err(|e| format!("{direccion}: {e}"))
}

// ─────────────────────────────── Arranque ───────────────────────────────

/// Anuncia esta neurona y busca a las demás por AWDL. Idempotente. `neurona` es el id (solo se usa su huella).
pub fn iniciar(app: &AppHandle, neurona: &str) -> Result<(), String> {
    if l::sin_awdl_en_entorno() {
        motivo("AWDL apagado (STARSEED_SIN_AWDL).");
        return Err("AWDL apagado por STARSEED_SIN_AWDL.".into());
    }
    if !l::id_neurona_valido(neurona) {
        return Err("Identificador de neurona no válido.".into());
    }
    let a = api().ok_or_else(|| {
        motivo("Este macOS no trae el API peer-to-peer de Network.framework.");
        "Este macOS no trae el API peer-to-peer de Network.framework (hace falta macOS 10.15 o más nuevo).".to_string()
    })?;
    let huella = l::huella_hex(neurona);
    {
        let g = VIVO.lock().map_err(|_| "estado interno bloqueado")?;
        if let Some(v) = g.as_ref() {
            if v.huella == huella {
                return Ok(());
            }
        }
    }
    detener();
    let etiqueta = cstr("app.starseed.awdl").ok_or("etiqueta")?;
    // SAFETY: cola serie nueva (+1).
    let cola = Obj::nuevo(unsafe { dispatch_queue_create(etiqueta.as_ptr(), std::ptr::null_mut()) }).ok_or("no se pudo crear la cola de despacho")?;
    let tipo = cstr(l::SERVICIO_BONJOUR).ok_or("tipo")?;
    let nombre = cstr(&l::nombre_servicio_bonjour(neurona)).ok_or("nombre")?;
    let propio = l::nombre_servicio_bonjour(neurona);

    // Oyente peer-to-peer con su anuncio Bonjour.
    let p_l = parametros(a).ok_or("no se pudieron crear los parámetros peer-to-peer")?;
    let listener = Obj::nuevo(unsafe { (a.l_crear)(p_l.p()) }).ok_or("no se pudo crear el oyente AWDL")?;
    let anuncio = Obj::nuevo(unsafe { (a.anuncio)(nombre.as_ptr(), tipo.as_ptr(), std::ptr::null()) }).ok_or("no se pudo crear el anuncio Bonjour")?;
    let app_l = app.clone();
    let cola_l = cola.p() as usize;
    let nueva = RcBlock::new(move |c: P| {
        if let Some(conn) = Obj::prestado(c) {
            atender(a, app_l.clone(), cola_l as P, conn);
        }
    });
    let estado_l = RcBlock::new(move |s: i32, _e: P| {
        // nw_listener_state_t: 0 inválido, 1 esperando, 2 listo, 3 fallo, 4 cancelado
        match s {
            2 => motivo("AWDL activo: anunciando esta neurona y buscando Mac cercanos (sin router ni hotspot)."),
            3 => motivo("El oyente AWDL falló."),
            4 => motivo("AWDL detenido."),
            _ => {}
        }
    });
    unsafe {
        (a.l_cola)(listener.p(), cola.p());
        (a.l_anunciar)(listener.p(), anuncio.p());
        (a.l_nueva)(listener.p(), bloque_ptr(&nueva));
        (a.l_estado)(listener.p(), bloque_ptr(&estado_l));
    }

    // Buscador peer-to-peer del mismo servicio.
    let p_b = parametros(a).ok_or("no se pudieron crear los parámetros peer-to-peer")?;
    let busq = Obj::nuevo(unsafe { (a.busqueda)(tipo.as_ptr(), std::ptr::null()) }).ok_or("no se pudo crear la búsqueda Bonjour")?;
    let browser = Obj::nuevo(unsafe { (a.b_crear)(busq.p(), p_b.p()) }).ok_or("no se pudo crear el buscador AWDL")?;
    let cambios = RcBlock::new(move |viejo: P, nuevo: P, _lote: Bool| {
        let nombre_de = |r: P| -> Option<String> {
            if r.is_null() {
                return None;
            }
            let ep = Obj::nuevo(unsafe { (a.r_punto)(r) })?;
            let c = unsafe { (a.p_nombre)(ep.p()) };
            if c.is_null() {
                return None;
            }
            Some((unsafe { CStr::from_ptr(c) }).to_string_lossy().into_owned())
        };
        if !nuevo.is_null() {
            let Some(ep) = Obj::nuevo(unsafe { (a.r_punto)(nuevo) }) else { return };
            let c = unsafe { (a.p_nombre)(ep.p()) };
            if c.is_null() {
                return;
            }
            let n = (unsafe { CStr::from_ptr(c) }).to_string_lossy().into_owned();
            if n == propio {
                return; // yo mismo
            }
            if let Some(dir) = l::direccion_de_servicio(&n) {
                if let Ok(mut m) = puntos().lock() {
                    m.insert(dir.clone(), ep);
                }
                if let Ok(mut t) = vecinos_tabla().lock() {
                    t.registrar(&dir, ahora_ms());
                }
            }
        } else if let Some(n) = nombre_de(viejo) {
            if let Some(dir) = l::direccion_de_servicio(&n) {
                if let Ok(mut m) = puntos().lock() {
                    m.remove(&dir);
                }
                if let Ok(mut t) = vecinos_tabla().lock() {
                    t.olvidar(&dir);
                }
            }
        }
    });
    unsafe {
        (a.b_cola)(browser.p(), cola.p());
        (a.b_cambios)(browser.p(), bloque_ptr(&cambios));
        (a.l_iniciar)(listener.p());
        (a.b_iniciar)(browser.p());
    }
    motivo("AWDL arrancando…");
    let mut g = VIVO.lock().map_err(|_| "estado interno bloqueado")?;
    *g = Some(Vivo { huella, cola, listener, browser });
    Ok(())
}

/// Deja de anunciar y de buscar (la Wi-Fi de casa no se toca nunca).
pub fn detener() {
    let Some(a) = api() else { return };
    let v = VIVO.lock().ok().and_then(|mut g| g.take());
    if let Some(v) = v {
        unsafe {
            (a.l_cancelar)(v.listener.p());
            (a.b_cancelar)(v.browser.p());
        }
        motivo("AWDL detenido.");
    }
    if let Ok(mut m) = puntos().lock() {
        m.clear();
    }
    if let Ok(mut t) = vecinos_tabla().lock() {
        *t = Vecinos::default();
    }
}
