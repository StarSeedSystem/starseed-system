// ═══════════════════════════════════════════════════════════════════════════
// enlace_wifi_macos — el Mac se une a la red directa del Android y vuelve a la suya (WFD1108A).
// Contrato: architecture/wifi-directo.md §4.2. SOLO macOS.
// ---------------------------------------------------------------------------
// macOS no da a las apps Wi-Fi Direct ni API para levantar un punto de acceso: el Mac siempre es el
// CLIENTE. Con CoreWLAN (objc2 0.6, ya en el árbol por tauri/wry; sin Swift ni crates nuevas):
//   · `CWWiFiClient.sharedWiFiClient.interface` → `scanForNetworksWithName:error:` →
//     `associateToNetwork:password:error:`. Desde macOS 14 CoreWLAN no da nombres de red sin la
//     autorización de «Ubicación» (`CLLocationManager requestWhenInUseAuthorization`, con
//     NSLocationWhenInUseUsageDescription en Info.plist): sin ella, o si la red no aparece, se pasa a la
//     vía GUIADA (la persona se une desde el menú Wi-Fi con el nombre y la contraseña en pantalla; la web
//     detecta que ya está dentro con `enlace_wifi_comprobar`).
//   · Una sola radio: mientras dura, el Mac deja su red de casa. Al cerrar: `disassociate`, se espera a
//     que macOS vuelva solo a una red conocida y, si no, se intenta la de antes (sin contraseña: la pone
//     el llavero del sistema) y por último apagar y encender el Wi-Fi (macOS se une a sus redes conocidas).
//     La contraseña de la red de casa NUNCA se lee ni se guarda.
// Cada selector se comprueba con `respondsToSelector:` antes de llamarlo: una excepción de Objective-C
// no puede cruzar Rust.
// ═══════════════════════════════════════════════════════════════════════════

use crate::enlace_wifi::{ahora_ms, ip_local_hacia, VERSION};
use crate::enlace_wifi_logica::{self as logica, CapacidadesWifi, EstadoEnlaceWifi, Ubicacion};
use objc2::rc::{autoreleasepool, Retained};
use objc2::runtime::{AnyClass, AnyObject, NSObject, Sel};
use objc2::{msg_send, sel};
use objc2_foundation::NSString;
use std::net::Ipv4Addr;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::AppHandle;

#[link(name = "CoreWLAN", kind = "framework")]
extern "C" {}
#[link(name = "CoreLocation", kind = "framework")]
extern "C" {}

static ESTADO: Mutex<Option<EstadoEnlaceWifi>> = Mutex::new(None);
/// Hay un hilo de unión o de vuelta en marcha.
static OCUPADO: AtomicBool = AtomicBool::new(false);
/// Se pidió cerrar mientras se unía.
static CANCELAR: AtomicBool = AtomicBool::new(false);
/// El `CLLocationManager` que pidió la autorización (vivo mientras dure el proceso; uno solo).
static GESTOR_UBICACION: AtomicUsize = AtomicUsize::new(0);

pub fn estado() -> EstadoEnlaceWifi {
    ESTADO.lock().ok().and_then(|g| g.clone()).unwrap_or_default()
}

fn poner(e: EstadoEnlaceWifi) {
    if let Ok(mut g) = ESTADO.lock() {
        *g = Some(EstadoEnlaceWifi { t: ahora_ms(), ..e });
    }
    VERSION.fetch_add(1, Ordering::Relaxed);
}

fn cambiar(f: impl FnOnce(&mut EstadoEnlaceWifi)) {
    let mut e = estado();
    f(&mut e);
    poner(e);
}

// ─────────────────────────────── Objective-C ───────────────────────────────

fn responde(obj: &AnyObject, s: Sel) -> bool {
    unsafe { msg_send![obj, respondsToSelector: s] }
}

fn texto(s: Option<Retained<NSString>>) -> Option<String> {
    s.map(|s| s.to_string()).filter(|s| !s.is_empty())
}

fn descripcion(err: &NSObject) -> String {
    let d: Option<Retained<NSString>> = unsafe { msg_send![err, localizedDescription] };
    texto(d).unwrap_or_else(|| "error de CoreWLAN".into())
}

/// La interfaz Wi-Fi por defecto (None si CoreWLAN no está o el Mac no tiene Wi-Fi).
fn interfaz() -> Option<Retained<AnyObject>> {
    let cls = AnyClass::get(c"CWWiFiClient")?;
    let cliente: Option<Retained<AnyObject>> = unsafe { msg_send![cls, sharedWiFiClient] };
    let cliente = cliente?;
    if !responde(&cliente, sel!(interface)) {
        return None;
    }
    unsafe { msg_send![&*cliente, interface] }
}

fn ssid_actual(iface: &AnyObject) -> Option<String> {
    if !responde(iface, sel!(ssid)) {
        return None;
    }
    let s: Option<Retained<NSString>> = unsafe { msg_send![iface, ssid] };
    texto(s)
}

fn encendida(iface: &AnyObject) -> bool {
    responde(iface, sel!(powerOn)) && unsafe { msg_send![iface, powerOn] }
}

fn velocidad(iface: &AnyObject) -> Option<f64> {
    if !responde(iface, sel!(transmitRate)) {
        return None;
    }
    let r: f64 = unsafe { msg_send![iface, transmitRate] };
    (r.is_finite() && r > 0.0).then_some(r)
}

fn banda(iface: &AnyObject) -> Option<String> {
    if !responde(iface, sel!(wlanChannel)) {
        return None;
    }
    let canal: Option<Retained<AnyObject>> = unsafe { msg_send![iface, wlanChannel] };
    let canal = canal?;
    if !responde(&canal, sel!(channelBand)) {
        return None;
    }
    let b: isize = unsafe { msg_send![&*canal, channelBand] };
    logica::banda_de_corewlan(b as i64).map(|s| s.to_string())
}

/// Busca la red por su nombre. Ok(None): no aparece (o macOS oculta los nombres sin Ubicación).
fn buscar(iface: &AnyObject, ssid: &str) -> Result<Option<Retained<AnyObject>>, String> {
    if !responde(iface, sel!(scanForNetworksWithName:error:)) {
        return Err("Este macOS no deja buscar redes con CoreWLAN.".into());
    }
    let nombre = NSString::from_str(ssid);
    let r: Result<Retained<AnyObject>, Retained<NSObject>> = unsafe { msg_send![iface, scanForNetworksWithName: &*nombre, error: _] };
    match r {
        Ok(conjunto) => {
            let red: Option<Retained<AnyObject>> = unsafe { msg_send![&*conjunto, anyObject] };
            Ok(red)
        }
        Err(e) => Err(descripcion(&e)),
    }
}

fn asociar(iface: &AnyObject, red: &AnyObject, clave: Option<&str>) -> Result<(), String> {
    if !responde(iface, sel!(associateToNetwork:password:error:)) {
        return Err("Este macOS no deja unirse a redes con CoreWLAN.".into());
    }
    let clave = clave.map(NSString::from_str);
    let r: Result<(), Retained<NSObject>> = unsafe { msg_send![iface, associateToNetwork: red, password: clave.as_deref(), error: _] };
    r.map_err(|e| descripcion(&e))
}

fn desasociar(iface: &AnyObject) {
    if responde(iface, sel!(disassociate)) {
        let _: () = unsafe { msg_send![iface, disassociate] };
    }
}

fn encender(iface: &AnyObject, si: bool) -> bool {
    if !responde(iface, sel!(setPower:error:)) {
        return false;
    }
    let r: Result<(), Retained<NSObject>> = unsafe { msg_send![iface, setPower: si, error: _] };
    r.is_ok()
}

// ─────────────────────────────── Ubicación ───────────────────────────────

pub fn ubicacion() -> Ubicacion {
    let Some(cls) = AnyClass::get(c"CLLocationManager") else { return Ubicacion::Denegada };
    // El método de clase existe en todas las versiones (en macOS 11+ también la propiedad de instancia).
    let ok: bool = unsafe { msg_send![cls, respondsToSelector: sel!(authorizationStatus)] };
    if !ok {
        return Ubicacion::SinPreguntar;
    }
    let s: i32 = unsafe { msg_send![cls, authorizationStatus] };
    logica::ubicacion_de(s as i64)
}

/// Pide «Ubicación» (macOS enseña su aviso una vez). En el hilo principal, y el gestor queda vivo.
pub fn pedir_ubicacion(app: &AppHandle) {
    if ubicacion() != Ubicacion::SinPreguntar {
        return;
    }
    let _ = app.run_on_main_thread(|| {
        autoreleasepool(|_| {
            if GESTOR_UBICACION.load(Ordering::SeqCst) != 0 {
                return;
            }
            let Some(cls) = AnyClass::get(c"CLLocationManager") else { return };
            let gestor: Option<Retained<AnyObject>> = unsafe { msg_send![cls, new] };
            let Some(gestor) = gestor else { return };
            if responde(&gestor, sel!(requestWhenInUseAuthorization)) {
                let _: () = unsafe { msg_send![&*gestor, requestWhenInUseAuthorization] };
            }
            // Se queda vivo (adrede, uno por proceso): si se suelta, macOS no enseña el aviso.
            GESTOR_UBICACION.store(Retained::into_raw(gestor) as usize, Ordering::SeqCst);
        })
    });
}

// ─────────────────────────────── Capacidades ───────────────────────────────

pub fn capacidades() -> CapacidadesWifi {
    autoreleasepool(|_| {
        let iface = interfaz();
        let wifi = iface.as_deref().map(encendida).unwrap_or(false);
        logica::capacidades_macos(iface.is_some(), ubicacion(), wifi)
    })
}

// ─────────────────────────────── Unirse ───────────────────────────────

/// IP del Mac en la red directa: la que usa para llegar al punto de acceso (o a cualquier sitio, si el
/// punto de acceso no dijo su IP: la red directa es la única que hay).
fn ip_en_red(ip_ap: Option<Ipv4Addr>) -> Option<Ipv4Addr> {
    match ip_ap {
        Some(ap) => ip_local_hacia(ap, logica::PUERTO_CANAL).filter(|l| logica::misma_subred(*l, ap)),
        None => ip_local_hacia(Ipv4Addr::new(192, 0, 2, 1), 9).filter(|l| crate::malla_local_trama::ip_local(&l.to_string()).is_some()),
    }
}

fn guiado(ssid: &str, motivo: &str) {
    cambiar(|e| {
        e.fase = "guiado".into();
        e.codigo = None;
        e.mensaje = format!("{motivo} Únete a la red «{ssid}» desde el menú Wi-Fi con la contraseña que se enseña: StarSeed detecta solo cuando estés dentro.");
    });
}

fn error(codigo: &str, mensaje: String) {
    cambiar(|e| {
        e.fase = "error".into();
        e.codigo = Some(codigo.into());
        e.mensaje = mensaje;
    });
}

/// Se une a la red directa en un hilo propio (CoreWLAN bloquea varios segundos). Devuelve enseguida.
pub fn unirse(_app: &AppHandle, sesion: String, metodo: String, ssid: String, clave: String, ip_ap: Option<String>) -> EstadoEnlaceWifi {
    if OCUPADO.swap(true, Ordering::SeqCst) {
        return logica::estado_error(Some(&sesion), "fallo-nativo", "Ya hay una unión o una vuelta de red en marcha.", ahora_ms());
    }
    CANCELAR.store(false, Ordering::SeqCst);
    let anterior = autoreleasepool(|_| interfaz().as_deref().and_then(ssid_actual));
    poner(EstadoEnlaceWifi {
        sesion: Some(sesion.clone()),
        fase: "uniendo".into(),
        rol: Some("cliente".into()),
        metodo: Some(metodo.clone()),
        ssid: Some(ssid.clone()),
        ip_ap: ip_ap.clone(),
        red_anterior: anterior.filter(|a| *a != ssid),
        mensaje: "Uniéndose a la red directa de la otra neurona (el Mac deja su red mientras dure)…".into(),
        ..Default::default()
    });
    if metodo != "corewlan" {
        guiado(&ssid, "Este Mac se une a mano.");
        OCUPADO.store(false, Ordering::SeqCst);
        return estado();
    }
    let ip_ap4 = ip_ap.as_deref().and_then(crate::malla_local_trama::ip_local);
    let _ = std::thread::Builder::new().name("starseed-enlace-wifi-mac".into()).spawn(move || {
        unirse_en_hilo(&ssid, &clave, ip_ap4);
        OCUPADO.store(false, Ordering::SeqCst);
    });
    estado()
}

fn unirse_en_hilo(ssid: &str, clave: &str, ip_ap: Option<Ipv4Addr>) {
    // Sin decidir «Ubicación»: se espera un poco a que la persona conteste el aviso de macOS.
    let t0 = Instant::now();
    while ubicacion() == Ubicacion::SinPreguntar && t0.elapsed() < Duration::from_secs(20) && !CANCELAR.load(Ordering::SeqCst) {
        std::thread::sleep(Duration::from_millis(500));
    }
    let mut red = None;
    for intento in 0..5 {
        if CANCELAR.load(Ordering::SeqCst) {
            return;
        }
        let r = autoreleasepool(|_| {
            let Some(iface) = interfaz() else { return Err("Este Mac no tiene Wi-Fi (o CoreWLAN no está).".to_string()) };
            if !encendida(&iface) {
                return Err("El Wi-Fi del Mac está apagado: enciéndelo.".to_string());
            }
            buscar(&iface, ssid).map(|x| x.is_some())
        });
        match r {
            Ok(true) => {
                red = Some(());
                break;
            }
            Ok(false) => {}
            Err(m) => return error("fallo-nativo", m),
        }
        // El punto de acceso del Android tarda unos segundos en emitir.
        if intento < 4 {
            std::thread::sleep(Duration::from_secs(2));
        }
    }
    if red.is_none() {
        if ubicacion() != Ubicacion::Concedida {
            return guiado(ssid, "macOS no deja ver el nombre de la red sin «Ubicación» para StarSeed.");
        }
        return error("no-encontrada", format!("La red «{ssid}» no aparece desde este Mac (¿demasiado lejos?)."));
    }
    if CANCELAR.load(Ordering::SeqCst) {
        return;
    }
    let asociado = autoreleasepool(|_| {
        let iface = interfaz().ok_or_else(|| "Este Mac no tiene Wi-Fi.".to_string())?;
        // Se vuelve a buscar dentro del mismo pool: el objeto de la red no sale de él.
        let red = buscar(&iface, ssid)?.ok_or_else(|| format!("La red «{ssid}» dejó de verse."))?;
        asociar(&iface, &red, Some(clave))
    });
    if let Err(m) = asociado {
        return error("fallo-nativo", format!("macOS no pudo unirse a «{ssid}»: {m}"));
    }
    // Dentro: se espera la IP (DHCP del Android) hasta 15 s.
    let t1 = Instant::now();
    while t1.elapsed() < Duration::from_secs(15) {
        if CANCELAR.load(Ordering::SeqCst) {
            return;
        }
        if let Some(ip) = ip_en_red(ip_ap) {
            let (mbps, b) = autoreleasepool(|_| interfaz().map(|i| (velocidad(&i), banda(&i))).unwrap_or((None, None)));
            return cambiar(|e| {
                e.fase = "unida".into();
                e.ip_propia = Some(ip.to_string());
                e.mbps = mbps;
                e.banda = b;
                e.codigo = None;
                e.mensaje = "Dentro de la red directa del Android (sin router).".into();
            });
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    error("fallo-nativo", format!("Unido a «{ssid}», pero el Android no dio dirección IP a este Mac."))
}

// ─────────────────────────────── Cerrar y volver ───────────────────────────────

/// ¿El Mac ya está en otra red (no la directa)? Por su nombre si se ve; si no, por su IP.
fn de_vuelta(directa: &str, ip_directa: Option<Ipv4Addr>) -> bool {
    let ssid = autoreleasepool(|_| interfaz().as_deref().and_then(ssid_actual));
    if let Some(s) = ssid {
        return s != directa;
    }
    match ip_local_hacia(Ipv4Addr::new(192, 0, 2, 1), 9) {
        Some(l) => ip_directa.map(|d| !logica::misma_subred(l, d)).unwrap_or(true),
        None => false,
    }
}

fn esperar_vuelta(directa: &str, ip_directa: Option<Ipv4Addr>, segundos: u64) -> bool {
    let t0 = Instant::now();
    while t0.elapsed() < Duration::from_secs(segundos) {
        if de_vuelta(directa, ip_directa) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(700));
    }
    false
}

/// Deja la red directa y vuelve a la de antes (en un hilo: puede tardar). Devuelve enseguida.
pub fn cerrar(_app: &AppHandle, sesion: String) -> EstadoEnlaceWifi {
    let e = estado();
    if e.sesion.as_deref().is_some_and(|s| s != sesion) {
        return e;
    }
    CANCELAR.store(true, Ordering::SeqCst);
    let unida = e.fase == "unida" || e.fase == "uniendo";
    let directa = e.ssid.clone().unwrap_or_default();
    let anterior = e.red_anterior.clone();
    let ip_directa = e.ip_propia.as_deref().and_then(crate::malla_local_trama::ip_local);
    if !unida || e.metodo.as_deref() != Some("corewlan") {
        // Guiado o sin unir: la persona vuelve a su red como entró (o no hubo cambio de red).
        cambiar(|x| {
            x.fase = "cerrado".into();
            x.mensaje = if e.metodo.as_deref() == Some("guiado") && e.fase != "inactivo" {
                match &anterior {
                    Some(a) => format!("Enlace cerrado: vuelve a «{a}» desde el menú Wi-Fi si el Mac no lo hace solo."),
                    None => "Enlace cerrado: vuelve a tu red desde el menú Wi-Fi si el Mac no lo hace solo.".into(),
                }
            } else {
                "Enlace cerrado.".into()
            };
        });
        return estado();
    }
    cambiar(|x| {
        x.fase = "cerrando".into();
        x.mensaje = "Dejando la red directa y volviendo a tu red…".into();
    });
    let _ = std::thread::Builder::new().name("starseed-enlace-wifi-vuelta".into()).spawn(move || {
        // Espera a que acabe una unión en curso (que ya vio CANCELAR) antes de tocar la radio.
        let t0 = Instant::now();
        while OCUPADO.load(Ordering::SeqCst) && t0.elapsed() < Duration::from_secs(10) {
            std::thread::sleep(Duration::from_millis(200));
        }
        OCUPADO.store(true, Ordering::SeqCst);
        autoreleasepool(|_| {
            if let Some(i) = interfaz() {
                desasociar(&i);
            }
        });
        // 1) macOS suele volver solo a una red conocida.
        let mut ok = esperar_vuelta(&directa, ip_directa, 8);
        // 2) La de antes, sin contraseña (si es conocida, la pone el llavero del sistema).
        if !ok {
            if let Some(a) = &anterior {
                let _ = autoreleasepool(|_| -> Result<(), String> {
                    let iface = interfaz().ok_or("sin Wi-Fi")?;
                    let red = buscar(&iface, a)?.ok_or("no aparece")?;
                    asociar(&iface, &red, None)
                });
                ok = esperar_vuelta(&directa, ip_directa, 8);
            }
        }
        // 3) Apagar y encender el Wi-Fi: macOS se une a sus redes conocidas.
        if !ok {
            autoreleasepool(|_| {
                if let Some(i) = interfaz() {
                    if encender(&i, false) {
                        std::thread::sleep(Duration::from_secs(1));
                        let _ = encender(&i, true);
                    }
                }
            });
            ok = esperar_vuelta(&directa, ip_directa, 15);
        }
        cambiar(|x| {
            x.fase = "cerrado".into();
            x.ip_propia = None;
            x.mbps = None;
            x.mensaje = match (ok, &anterior) {
                (true, Some(a)) => format!("Enlace cerrado: el Mac volvió a «{a}»."),
                (true, None) => "Enlace cerrado: el Mac volvió a tu red.".into(),
                (false, Some(a)) => format!("Enlace cerrado, pero el Mac no volvió solo a «{a}»: elígela en el menú Wi-Fi."),
                (false, None) => "Enlace cerrado, pero el Mac no volvió solo a tu red: elígela en el menú Wi-Fi.".into(),
            };
        });
        OCUPADO.store(false, Ordering::SeqCst);
    });
    estado()
}
