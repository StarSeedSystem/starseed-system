
// ═══════════════════════════════════════════════════════════════════════════
// ble_linux — la radio Bluetooth de Linux (BlueZ por D-Bus) para el núcleo de `ble.rs` (LNX1109B · 2026-11-09).
// ---------------------------------------------------------------------------
// Contrato: architecture/bluetooth-directo.md §16. Lo puro (rutas, direcciones, PSM, errores) está probado en
// `ble_linux_logica.rs`. Mismo protocolo que macOS y Android (nada paralelo): servicio y características
// `53530001/2/3/4-b1e0-4d2a-9c3e-537461727365`, anuncio con el UUID rotatorio, trama y paquetes de `ble_trama`, PSM del
// canal L2CAP en la característica `…0004` y marco `[largo u16 BE][paquete ≤ 4096]` de `ble_l2cap`.
//
//   · CENTRAL: `Adapter1.StartDiscovery` (LE, sin filtro de UUID: BlueZ no admite máscaras) y, cada segundo, se lee el
//     estado de BlueZ (`GetManagedObjects`) para ver los anuncios StarSeed; `Device1.Connect`, GATT cliente
//     (`AcquireNotify` de SALIDA: un fd por enlace, con su MTU; `WriteValue` «command» a ENTRADA) y lectura de PSM.
//   · PERIFÉRICO: aplicación GATT propia en el bus (`GattManager1.RegisterApplication`; ObjectManager + servicio +
//     ENTRADA/SALIDA/PSM con zbus) y anuncio LE (`LEAdvertisingManager1`, `Type=peripheral`, solo el UUID rotatorio).
//     SALIDA se sirve con `AcquireNotify` (BlueZ da el dispositivo y el MTU: un enlace por central) y, si BlueZ usa
//     `StartNotify`, con una difusión al único central conectado que aún no tiene enlace.
//   · `ble-l2cap`: socket `AF_BLUETOOTH`/`SOCK_STREAM`/`BTPROTO_L2CAP` (LE CoC, sin cifrar por el aire: el cifrado va por
//     encima, CIF1108A). Periférico: escucha con PSM 0 (el núcleo asigna uno dinámico 128–255) y lo publica; central: lo lee y
//     conecta. Un hilo por canal con `poll` cada 5 ms y escrituras parciales (`ble_l2cap::Salida`).
//
// Todo lo de D-Bus corre en hilos propios (el núcleo nunca espera por la radio). Interruptor de emergencia:
// `STARSEED_SIN_BLE_LINUX=1`. Los errores se traducen en un `motivo` legible (sin BlueZ, sin adaptador, apagado, sin permiso).
// ═══════════════════════════════════════════════════════════════════════════

use crate::ble::{self as nucleo, Radio};
use crate::ble_l2cap as l2;
use crate::ble_linux_logica as lg;
use crate::ble_trama as bt;
use std::collections::HashMap;
use std::os::fd::{AsRawFd, FromRawFd, IntoRawFd, OwnedFd};
use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use zbus::blocking::{fdo::ObjectManagerProxy, Connection, Proxy};
use zbus::zvariant::{ObjectPath, OwnedObjectPath, OwnedValue, Value};

pub struct RadioLinux;

type Props = HashMap<String, OwnedValue>;
type Objetos = HashMap<OwnedObjectPath, HashMap<zbus::names::OwnedInterfaceName, Props>>;

// ───────────────────────────── Estado compartido ─────────────────────────────

enum Orden {
    Arrancar,
    Anunciar(String),
    Conectar(String),
    Parar,
}

enum Cmd {
    Datos,
    Cerrar,
}

/// Cómo se escribe hacia el otro por GATT.
enum Salida {
    /// Periférico con `AcquireNotify`: nuestro extremo del socketpair (cada paquete es una notificación).
    Fd(OwnedFd),
    /// Periférico con `StartNotify`: se difunde por `PropertiesChanged(Value)` de SALIDA.
    Difusion,
    /// Central: `WriteValue` («command») a la ENTRADA del otro.
    Central { entrada: String },
}

struct Enlace {
    direccion: String,
    central: bool,
    tx: Sender<Cmd>,
    parar: Arc<AtomicBool>,
    /// Canal L2CAP abierto (su indicador de parada).
    canal: Option<Arc<AtomicBool>>,
}

static ENLACES: Mutex<Option<HashMap<String, Enlace>>> = Mutex::new(None);
static CONEXION: OnceLock<Connection> = OnceLock::new();
static ORDENES: OnceLock<Mutex<Sender<Orden>>> = OnceLock::new();
static UUID_ANUNCIO: Mutex<String> = Mutex::new(String::new());
static PSM_PUBLICADO: AtomicU16 = AtomicU16::new(0);

fn enlaces<T>(f: impl FnOnce(&mut HashMap<String, Enlace>) -> T) -> T {
    let mut g = ENLACES.lock().unwrap_or_else(|e| e.into_inner());
    f(g.get_or_insert_with(HashMap::new))
}

fn ordenar(o: Orden) {
    if cfg!(test) {
        return;
    }
    iniciar_hilo();
    if let Some(tx) = ORDENES.get() {
        let _ = tx.lock().unwrap_or_else(|e| e.into_inner()).send(o);
    }
}

fn txt(e: impl std::fmt::Display) -> String {
    e.to_string()
}

/// Un error de zbus → (estado de radio, motivo).
fn clasificar(e: &zbus::Error) -> (&'static str, String) {
    lg::clasificar_error(&format!("{e:?}"), &e.to_string())
}

// ───────────────────────────── Ayudas de D-Bus ─────────────────────────────

fn proxy(c: &Connection, ruta: &str, interfaz: &str) -> Result<Proxy<'static>, zbus::Error> {
    Proxy::new(c, lg::BLUEZ.to_string(), ruta.to_string(), interfaz.to_string())
}

fn objetos(c: &Connection) -> Result<Objetos, String> {
    let p = ObjectManagerProxy::builder(c).destination(lg::BLUEZ).map_err(txt)?.path("/").map_err(txt)?.build().map_err(txt)?;
    p.get_managed_objects().map_err(txt)
}

fn prop<'a>(o: &'a Objetos, ruta: &str, interfaz: &str) -> Option<&'a Props> {
    o.iter().find(|(r, _)| r.as_str() == ruta).and_then(|(_, ifs)| ifs.iter().find(|(i, _)| i.as_str() == interfaz).map(|(_, p)| p))
}

fn v_texto(p: &Props, k: &str) -> Option<String> {
    p.get(k).and_then(|v| v.downcast_ref::<&str>().ok()).map(String::from)
}

fn v_bool(p: &Props, k: &str) -> Option<bool> {
    p.get(k).and_then(|v| v.downcast_ref::<bool>().ok())
}

fn v_i16(p: &Props, k: &str) -> Option<i16> {
    p.get(k).and_then(|v| v.downcast_ref::<i16>().ok())
}

fn v_u16(p: &Props, k: &str) -> Option<u16> {
    p.get(k).and_then(|v| v.downcast_ref::<u16>().ok())
}

fn v_textos(p: &Props, k: &str) -> Vec<String> {
    let Some(v) = p.get(k) else { return Vec::new() };
    let Ok(a) = v.downcast_ref::<&zbus::zvariant::Array>() else { return Vec::new() };
    a.iter().filter_map(|x| x.downcast_ref::<&str>().ok().map(String::from)).collect()
}

fn sin_opciones() -> HashMap<&'static str, Value<'static>> {
    HashMap::new()
}

// ───────────────────────────── La radio (lo que llama el núcleo) ─────────────────────────────

impl Radio for RadioLinux {
    fn disponible(&self) -> bool {
        // En las pruebas no hay radio (como antes de LNX1109B): el núcleo se prueba solo, sin hilos de D-Bus.
        cfg!(not(test)) && !lg::apagado(std::env::var(lg::VARIABLE_APAGADO).ok().as_deref())
    }
    fn arrancar(&self) {
        ordenar(Orden::Arrancar);
    }
    fn anunciar(&self, uuid: &str) {
        ordenar(Orden::Anunciar(uuid.to_string()));
    }
    fn conectar(&self, direccion: &str) {
        ordenar(Orden::Conectar(direccion.to_string()));
    }
    fn desconectar(&self, plataforma: &str) {
        cerrar_enlace(plataforma, false);
    }
    fn hay_datos(&self, plataforma: &str) {
        enlaces(|e| {
            if let Some(l) = e.get(plataforma) {
                let _ = l.tx.send(Cmd::Datos);
            }
        });
    }
    fn pedir_permiso(&self) {
        // Linux no pregunta nada: se reintenta (por si el usuario acaba de encender el Bluetooth o de entrar en el grupo).
        ordenar(Orden::Arrancar);
    }
    fn parar(&self) {
        ordenar(Orden::Parar);
    }
    fn abrir_l2cap(&self, plataforma: &str, psm: u16) {
        let Some(direccion) = enlaces(|e| e.get(plataforma).filter(|l| l.central).map(|l| l.direccion.clone())) else { return };
        if !l2::psm_valido(psm) {
            nucleo::al_l2cap_cerrado(plataforma, "PSM no válido");
            return;
        }
        let p = plataforma.to_string();
        let _ = std::thread::Builder::new().name("starseed-ble-l2cap".into()).spawn(move || match conectar_l2cap(&direccion, psm) {
            Ok(fd) => lanzar_canal(&p, fd, Some(psm)),
            Err(m) => nucleo::al_l2cap_cerrado(&p, &m),
        });
    }
    fn cerrar_l2cap(&self, plataforma: &str) {
        enlaces(|e| {
            if let Some(l) = e.get_mut(plataforma) {
                if let Some(c) = l.canal.take() {
                    c.store(true, Ordering::SeqCst);
                }
            }
        });
    }
}

/// Cierra el enlace (hilos, fds y, si era central, la conexión de BlueZ). `avisar`: llamar a `al_desconectar`.
fn cerrar_enlace(plataforma: &str, avisar: bool) {
    let l = enlaces(|e| e.remove(plataforma));
    if let Some(l) = l {
        l.parar.store(true, Ordering::SeqCst);
        if let Some(c) = &l.canal {
            c.store(true, Ordering::SeqCst);
        }
        let _ = l.tx.send(Cmd::Cerrar);
        if l.central {
            if let (Some(c), Some(ad)) = (CONEXION.get(), adaptador_actual()) {
                if let Some(ruta) = lg::ruta_dispositivo(&ad, &l.direccion) {
                    let c = c.clone();
                    let _ = std::thread::Builder::new().name("starseed-ble-desconectar".into()).spawn(move || {
                        if let Ok(p) = proxy(&c, &ruta, lg::IF_DISPOSITIVO) {
                            let _ = p.call::<_, _, ()>("Disconnect", &());
                        }
                    });
                }
            }
        }
    }
    if avisar {
        nucleo::al_desconectar(plataforma, "el otro aparato se desconectó");
    }
}

static ADAPTADOR: Mutex<Option<String>> = Mutex::new(None);

fn adaptador_actual() -> Option<String> {
    ADAPTADOR.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

// ───────────────────────────── Aplicación GATT propia (periférico) ─────────────────────────────

#[derive(Clone, Copy, PartialEq, Eq)]
enum TipoCar {
    Entrada,
    Salida,
    Psm,
}

struct Servicio;

#[zbus::interface(name = "org.bluez.GattService1")]
impl Servicio {
    #[zbus(property, name = "UUID")]
    fn uuid(&self) -> String {
        bt::SERVICIO.to_string()
    }
    #[zbus(property, name = "Primary")]
    fn primary(&self) -> bool {
        true
    }
}

struct Caracteristica {
    tipo: TipoCar,
}

fn dispositivo_de(opciones: &HashMap<String, OwnedValue>) -> Option<String> {
    let v = opciones.get("device")?;
    let r = v.downcast_ref::<&ObjectPath>().ok()?;
    lg::direccion_de_ruta(r.as_str())
}

#[zbus::interface(name = "org.bluez.GattCharacteristic1")]
impl Caracteristica {
    #[zbus(property, name = "UUID")]
    fn uuid(&self) -> String {
        match self.tipo {
            TipoCar::Entrada => bt::ENTRADA,
            TipoCar::Salida => bt::SALIDA,
            TipoCar::Psm => l2::PSM,
        }
        .to_string()
    }
    #[zbus(property, name = "Service")]
    fn service(&self) -> OwnedObjectPath {
        OwnedObjectPath::try_from(lg::RUTA_SERVICIO).expect("ruta fija")
    }
    #[zbus(property, name = "Flags")]
    fn flags(&self) -> Vec<String> {
        match self.tipo {
            TipoCar::Entrada => vec!["write".into(), "write-without-response".into()],
            TipoCar::Salida => vec!["notify".into()],
            TipoCar::Psm => vec!["read".into()],
        }
    }

    fn read_value(&self, _opciones: HashMap<String, OwnedValue>) -> zbus::fdo::Result<Vec<u8>> {
        if self.tipo != TipoCar::Psm {
            return Err(zbus::fdo::Error::Failed("org.bluez.Error.NotPermitted".into()));
        }
        let psm = PSM_PUBLICADO.load(Ordering::SeqCst);
        Ok(lg::psm_publicable((psm != 0).then_some(psm)).to_vec())
    }

    fn write_value(&self, valor: Vec<u8>, opciones: HashMap<String, OwnedValue>) -> zbus::fdo::Result<()> {
        if self.tipo != TipoCar::Entrada {
            return Err(zbus::fdo::Error::Failed("org.bluez.Error.NotPermitted".into()));
        }
        // BlueZ ≥ 5.42 dice el dispositivo en las opciones; sin él, el único enlace periférico que haya.
        let dir = dispositivo_de(&opciones).or_else(|| {
            enlaces(|e| {
                let mut ps = e.values().filter(|l| !l.central);
                match (ps.next(), ps.next()) {
                    (Some(l), None) => Some(l.direccion.clone()),
                    _ => None,
                }
            })
        });
        if let Some(plat) = dir.and_then(|d| lg::plataforma('p', &d)) {
            nucleo::al_recibir(&plat, &valor);
        }
        Ok(())
    }

    /// Un fd por central (con su MTU): las notificaciones de SALIDA se escriben ahí.
    fn acquire_notify(&self, opciones: HashMap<String, OwnedValue>) -> zbus::fdo::Result<(zbus::zvariant::OwnedFd, u16)> {
        if self.tipo != TipoCar::Salida {
            return Err(zbus::fdo::Error::Failed("org.bluez.Error.NotSupported".into()));
        }
        let dir = dispositivo_de(&opciones).ok_or_else(|| zbus::fdo::Error::Failed("sin dispositivo en las opciones".into()))?;
        let plat = lg::plataforma('p', &dir).ok_or_else(|| zbus::fdo::Error::Failed("dirección no válida".into()))?;
        let mtu = opciones.get("mtu").and_then(|v| v.downcast_ref::<u16>().ok()).unwrap_or(23);
        let (ours, theirs) = par_de_sockets().map_err(|e| zbus::fdo::Error::Failed(e))?;
        abrir_enlace_periferico(&plat, &dir, lg::paquete_de_mtu(Some(mtu)), Salida::Fd(ours));
        Ok((theirs.into(), mtu))
    }

    /// Respaldo (BlueZ sin AcquireNotify): difusión al único central conectado que aún no tiene enlace.
    fn start_notify(&self) -> zbus::fdo::Result<()> {
        if self.tipo != TipoCar::Salida {
            return Err(zbus::fdo::Error::Failed("org.bluez.Error.NotSupported".into()));
        }
        let (Some(c), Some(ad)) = (CONEXION.get(), adaptador_actual()) else { return Ok(()) };
        let o = objetos(c).map_err(zbus::fdo::Error::Failed)?;
        let nuevos: Vec<String> = o
            .iter()
            .filter(|(r, _)| r.as_str().starts_with(&ad) && lg::direccion_de_ruta(r.as_str()).is_some() && lg::ruta_dispositivo_de(r.as_str()).as_deref() == Some(r.as_str()))
            .filter(|(_, ifs)| ifs.iter().any(|(i, p)| i.as_str() == lg::IF_DISPOSITIVO && v_bool(p, "Connected") == Some(true)))
            .filter_map(|(r, _)| lg::direccion_de_ruta(r.as_str()))
            .filter(|d| lg::plataforma('c', d).map(|p| !enlaces(|e| e.contains_key(&p))).unwrap_or(false))
            .filter(|d| lg::plataforma('p', d).map(|p| !enlaces(|e| e.contains_key(&p))).unwrap_or(false))
            .collect();
        if let [dir] = nuevos.as_slice() {
            if let Some(plat) = lg::plataforma('p', dir) {
                abrir_enlace_periferico(&plat, dir, bt::PAQUETE_MIN, Salida::Difusion);
            }
        }
        Ok(())
    }

    fn stop_notify(&self) {}
}

struct Anuncio;

#[zbus::interface(name = "org.bluez.LEAdvertisement1")]
impl Anuncio {
    #[zbus(property, name = "Type")]
    fn tipo(&self) -> String {
        "peripheral".into()
    }
    #[zbus(property, name = "ServiceUUIDs")]
    fn service_uuids(&self) -> Vec<String> {
        let u = UUID_ANUNCIO.lock().unwrap_or_else(|e| e.into_inner()).clone();
        if u.is_empty() {
            Vec::new()
        } else {
            vec![u]
        }
    }
    fn release(&self) {}
}

/// Un par de sockets `AF_UNIX`/`SOCK_SEQPACKET`: cada `send` es un paquete (una notificación).
fn par_de_sockets() -> Result<(OwnedFd, OwnedFd), String> {
    let mut fds = [0i32; 2];
    // SAFETY: `fds` tiene sitio para los 2 descriptores que escribe `socketpair`.
    let r = unsafe { libc::socketpair(libc::AF_UNIX, libc::SOCK_SEQPACKET | libc::SOCK_CLOEXEC, 0, fds.as_mut_ptr()) };
    if r != 0 {
        return Err(format!("socketpair: {}", std::io::Error::last_os_error()));
    }
    // SAFETY: descriptores recién creados y de nadie más.
    Ok(unsafe { (OwnedFd::from_raw_fd(fds[0]), OwnedFd::from_raw_fd(fds[1])) })
}

fn registrar_aplicacion(c: &Connection) -> Result<(), String> {
    let s = c.object_server();
    s.at(lg::RAIZ_APP, zbus::fdo::ObjectManager).map_err(txt)?;
    s.at(lg::RUTA_SERVICIO, Servicio).map_err(txt)?;
    s.at(lg::RUTA_ENTRADA, Caracteristica { tipo: TipoCar::Entrada }).map_err(txt)?;
    s.at(lg::RUTA_SALIDA, Caracteristica { tipo: TipoCar::Salida }).map_err(txt)?;
    s.at(lg::RUTA_PSM, Caracteristica { tipo: TipoCar::Psm }).map_err(txt)?;
    s.at(lg::RUTA_ANUNCIO, Anuncio).map_err(txt)?;
    Ok(())
}

fn registrar_gatt(c: &Connection, ad: &str) -> Result<(), zbus::Error> {
    let p = proxy(c, ad, lg::IF_GESTOR_GATT)?;
    p.call::<_, _, ()>("RegisterApplication", &(ObjectPath::try_from(lg::RAIZ_APP).expect("ruta fija"), sin_opciones()))
}

fn registrar_anuncio(c: &Connection, ad: &str) -> Result<(), zbus::Error> {
    let p = proxy(c, ad, lg::IF_GESTOR_ANUNCIOS)?;
    p.call::<_, _, ()>("RegisterAdvertisement", &(ObjectPath::try_from(lg::RUTA_ANUNCIO).expect("ruta fija"), sin_opciones()))
}

fn quitar_anuncio(c: &Connection, ad: &str) {
    if let Ok(p) = proxy(c, ad, lg::IF_GESTOR_ANUNCIOS) {
        let _ = p.call::<_, _, ()>("UnregisterAdvertisement", &(ObjectPath::try_from(lg::RUTA_ANUNCIO).expect("ruta fija"),));
    }
}

// ───────────────────────────── Enlaces ─────────────────────────────

/// Alta de un enlace con sus hilos: el que escribe hacia el otro y el que lo vigila (colgado / datos).
fn crear_enlace(plat: &str, dir: &str, central: bool, salida: Salida, lectura: Option<OwnedFd>) {
    let (tx, rx) = mpsc::channel::<Cmd>();
    let parar = Arc::new(AtomicBool::new(false));
    enlaces(|e| {
        e.insert(plat.to_string(), Enlace { direccion: dir.to_string(), central, tx, parar: parar.clone(), canal: None });
    });
    let (p1, s1) = (plat.to_string(), parar.clone());
    let _ = std::thread::Builder::new().name("starseed-ble-escribe".into()).spawn(move || hilo_escritor(&p1, rx, salida, &s1));
    let (p2, s2) = (plat.to_string(), parar);
    let _ = std::thread::Builder::new().name("starseed-ble-lee".into()).spawn(move || hilo_lector(&p2, lectura, central, &s2));
}

fn abrir_enlace_periferico(plat: &str, dir: &str, paquete: usize, salida: Salida) {
    // El lector vigila el extremo propio del socketpair: si BlueZ lo cierra (el central se desuscribió), el enlace cae.
    let lectura = match &salida {
        Salida::Fd(fd) => fd.try_clone().ok(),
        _ => None,
    };
    crear_enlace(plat, dir, false, salida, lectura);
    nucleo::al_conectar(plat, "periferico", Some(dir), paquete);
}

fn hilo_escritor(plat: &str, rx: Receiver<Cmd>, salida: Salida, parar: &AtomicBool) {
    loop {
        match rx.recv_timeout(Duration::from_millis(100)) {
            Ok(Cmd::Cerrar) | Err(mpsc::RecvTimeoutError::Disconnected) => return,
            Ok(Cmd::Datos) | Err(mpsc::RecvTimeoutError::Timeout) => {}
        }
        if parar.load(Ordering::SeqCst) {
            return;
        }
        while let Some(p) = nucleo::siguiente_paquete(plat) {
            if let Err(m) = escribir(&salida, &p) {
                parar.store(true, Ordering::SeqCst);
                cerrar_enlace(plat, false);
                nucleo::al_desconectar(plat, &m);
                return;
            }
            if parar.load(Ordering::SeqCst) {
                return;
            }
        }
    }
}

fn escribir(salida: &Salida, p: &[u8]) -> Result<(), String> {
    match salida {
        Salida::Fd(fd) => {
            // SAFETY: `fd` es un socket propio y vivo; `p` es un búfer válido de `p.len()` bytes.
            let n = unsafe { libc::send(fd.as_raw_fd(), p.as_ptr().cast(), p.len(), libc::MSG_NOSIGNAL) };
            if n < 0 {
                return Err(format!("el central cerró las notificaciones ({})", std::io::Error::last_os_error()));
            }
            Ok(())
        }
        Salida::Difusion => {
            let c = CONEXION.get().ok_or("sin conexión con BlueZ")?;
            let mut cambios: HashMap<&str, Value> = HashMap::new();
            cambios.insert("Value", Value::from(p.to_vec()));
            c.emit_signal(
                None::<&str>,
                lg::RUTA_SALIDA,
                "org.freedesktop.DBus.Properties",
                "PropertiesChanged",
                &(lg::IF_CARACTERISTICA, cambios, Vec::<&str>::new()),
            )
            .map_err(txt)
        }
        Salida::Central { entrada } => {
            let c = CONEXION.get().ok_or("sin conexión con BlueZ")?;
            let car = proxy(c, entrada, lg::IF_CARACTERISTICA).map_err(txt)?;
            let mut op: HashMap<&str, Value> = HashMap::new();
            op.insert("type", Value::from("command"));
            car.call::<_, _, ()>("WriteValue", &(p.to_vec(), op)).map_err(|e| format!("no se pudo escribir en el otro aparato: {e}"))
        }
    }
}

/// Lee notificaciones (central) o vigila el cierre (periférico) con `poll`.
fn hilo_lector(plat: &str, fd: Option<OwnedFd>, central: bool, parar: &AtomicBool) {
    let Some(fd) = fd else { return };
    let mut buf = [0u8; 1024];
    while !parar.load(Ordering::SeqCst) {
        let mut pfd = libc::pollfd { fd: fd.as_raw_fd(), events: libc::POLLIN, revents: 0 };
        // SAFETY: un solo `pollfd` válido en la pila.
        let r = unsafe { libc::poll(&mut pfd, 1, 200) };
        if r <= 0 {
            continue;
        }
        if pfd.revents & libc::POLLIN != 0 {
            // SAFETY: `buf` es un búfer propio de `buf.len()` bytes.
            let n = unsafe { libc::recv(fd.as_raw_fd(), buf.as_mut_ptr().cast(), buf.len(), 0) };
            if n > 0 {
                if central {
                    nucleo::al_recibir(plat, &buf[..n as usize]);
                }
                continue;
            }
            if n < 0 && std::io::Error::last_os_error().kind() == std::io::ErrorKind::WouldBlock {
                continue;
            }
        }
        // EOF, error o colgado: el otro cerró las notificaciones.
        if !parar.swap(true, Ordering::SeqCst) {
            let hay = enlaces(|e| e.contains_key(plat));
            if hay {
                cerrar_enlace(plat, true);
            }
        }
        return;
    }
}

/// Central: conectar, descubrir, suscribirse a SALIDA con `AcquireNotify` y leer el PSM.
fn conectar_central(c: &Connection, ad: &str, dir: &str) -> Result<(), String> {
    let plat = lg::plataforma('c', dir).ok_or("dirección no válida")?;
    if enlaces(|e| e.contains_key(&plat)) {
        return Ok(());
    }
    let ruta = lg::ruta_dispositivo(ad, dir).ok_or("dirección no válida")?;
    let dev = proxy(c, &ruta, lg::IF_DISPOSITIVO).map_err(txt)?;
    dev.call::<_, _, ()>("Connect", &()).map_err(|e| format!("no se pudo conectar: {e}"))?;
    let limite = Instant::now() + Duration::from_secs(10);
    loop {
        let o = objetos(c)?;
        if prop(&o, &ruta, lg::IF_DISPOSITIVO).and_then(|p| v_bool(p, "ServicesResolved")) == Some(true) {
            break;
        }
        if Instant::now() > limite {
            let _ = dev.call::<_, _, ()>("Disconnect", &());
            return Err("BlueZ no terminó de descubrir los servicios del otro aparato".into());
        }
        std::thread::sleep(Duration::from_millis(150));
    }
    let o = objetos(c)?;
    let (mut entrada, mut salida, mut psm_car) = (None, None, None);
    for (r, ifs) in &o {
        if !r.as_str().starts_with(&format!("{ruta}/")) {
            continue;
        }
        let Some(p) = ifs.iter().find(|(i, _)| i.as_str() == lg::IF_CARACTERISTICA).map(|(_, p)| p) else { continue };
        let Some(u) = v_texto(p, "UUID") else { continue };
        if lg::mismo_uuid(&u, bt::ENTRADA) {
            entrada = Some(r.as_str().to_string());
        } else if lg::mismo_uuid(&u, bt::SALIDA) {
            salida = Some((r.as_str().to_string(), v_u16(p, "MTU")));
        } else if lg::mismo_uuid(&u, l2::PSM) {
            psm_car = Some(r.as_str().to_string());
        }
    }
    nucleo::nota(Some(&plat), "servicios-descubiertos", &format!("entrada={} salida={} psm={}", entrada.is_some(), salida.is_some(), psm_car.is_some()));
    let (Some(entrada), Some((salida, mtu_prop))) = (entrada, salida) else {
        let _ = dev.call::<_, _, ()>("Disconnect", &());
        return Err("el otro aparato no ofrece el servicio StarSeed".into());
    };
    let psm = psm_car.and_then(|r| {
        let car = proxy(c, &r, lg::IF_CARACTERISTICA).ok()?;
        let v: Vec<u8> = car.call("ReadValue", &(sin_opciones(),)).ok()?;
        lg::psm_leido(&v)
    });
    let car = proxy(c, &salida, lg::IF_CARACTERISTICA).map_err(txt)?;
    let (fd, mtu): (zbus::zvariant::OwnedFd, u16) = match car.call("AcquireNotify", &(sin_opciones(),)) {
        Ok(r) => r,
        Err(e) => {
            nucleo::nota(Some(&plat), "sin-suscripcion", &format!("AcquireNotify falló ({e}); hace falta BlueZ ≥ 5.46"));
            let _ = dev.call::<_, _, ()>("Disconnect", &());
            return Err(format!("no se pudo suscribir a SALIDA: {e}"));
        }
    };
    let lectura: OwnedFd = fd.into();
    nucleo::nota(Some(&plat), "suscrito", &format!("mtu={mtu}"));
    let paquete = lg::paquete_de_mtu(Some(if mtu > 0 { mtu } else { mtu_prop.unwrap_or(23) }));
    crear_enlace(&plat, dir, true, Salida::Central { entrada }, Some(lectura));
    nucleo::al_conectar(&plat, "central", Some(dir), paquete);
    if let Some(p) = psm {
        nucleo::al_psm(&plat, p);
    }
    Ok(())
}

// ───────────────────────────── L2CAP (carril rápido) ─────────────────────────────

const AF_BLUETOOTH: i32 = 31;
const BTPROTO_L2CAP: i32 = 0;
const SOL_BLUETOOTH: i32 = 274;
const BT_RCVMTU: i32 = 13;

fn socket_l2cap() -> Result<OwnedFd, String> {
    // SAFETY: llamada simple a `socket`; el resultado se comprueba.
    let fd = unsafe { libc::socket(AF_BLUETOOTH, libc::SOCK_STREAM | libc::SOCK_CLOEXEC, BTPROTO_L2CAP) };
    if fd < 0 {
        return Err(format!("este kernel no ofrece sockets L2CAP de Bluetooth ({})", std::io::Error::last_os_error()));
    }
    // SAFETY: descriptor recién creado.
    let fd = unsafe { OwnedFd::from_raw_fd(fd) };
    let mtu: u16 = 8192;
    // SAFETY: opción de 2 bytes; es de mejor esfuerzo (el error se ignora).
    unsafe { libc::setsockopt(fd.as_raw_fd(), SOL_BLUETOOTH, BT_RCVMTU, (&mtu as *const u16).cast(), 2) };
    Ok(fd)
}

fn enlazar(fd: &OwnedFd, psm: u16, dir: Option<[u8; 6]>, tipo: u8) -> Result<(), String> {
    let sa = lg::sockaddr_l2(psm, dir, tipo);
    // SAFETY: `sa` es un `sockaddr_l2` de 14 bytes.
    let r = unsafe { libc::bind(fd.as_raw_fd(), sa.as_ptr().cast(), sa.len() as u32) };
    if r != 0 {
        return Err(format!("bind L2CAP: {}", std::io::Error::last_os_error()));
    }
    Ok(())
}

fn conectar_l2cap(direccion: &str, psm: u16) -> Result<OwnedFd, String> {
    let bd = lg::bdaddr(direccion).ok_or("dirección no válida")?;
    // El tipo (público/aleatorio) lo dice BlueZ en `AddressType` del dispositivo.
    let tipo = (|| {
        let c = CONEXION.get()?;
        let ad = adaptador_actual()?;
        let ruta = lg::ruta_dispositivo(&ad, direccion)?;
        let o = objetos(c).ok()?;
        prop(&o, &ruta, lg::IF_DISPOSITIVO).and_then(|p| v_texto(p, "AddressType")).map(|t| lg::tipo_direccion(&t))
    })()
    .unwrap_or(lg::BDADDR_LE_PUBLIC);
    let fd = socket_l2cap()?;
    enlazar(&fd, 0, None, lg::BDADDR_LE_PUBLIC)?;
    // Plazo de apertura (el mismo que macOS y Android).
    let tv = libc::timeval { tv_sec: (l2::PLAZO_ABRIR_MS / 1000) as _, tv_usec: 0 };
    // SAFETY: `timeval` válido.
    unsafe { libc::setsockopt(fd.as_raw_fd(), libc::SOL_SOCKET, libc::SO_SNDTIMEO, (&tv as *const libc::timeval).cast(), std::mem::size_of::<libc::timeval>() as u32) };
    let sa = lg::sockaddr_l2(psm, Some(bd), tipo);
    // SAFETY: `sa` es un `sockaddr_l2` de 14 bytes.
    let r = unsafe { libc::connect(fd.as_raw_fd(), sa.as_ptr().cast(), sa.len() as u32) };
    if r != 0 {
        return Err(format!("no se pudo abrir el canal L2CAP (psm {psm}): {}", std::io::Error::last_os_error()));
    }
    Ok(fd)
}

/// Pone el socket en no bloqueante y arranca su hilo; avisa al núcleo de que el canal abrió.
fn lanzar_canal(plat: &str, fd: OwnedFd, psm: Option<u16>) {
    // SAFETY: banderas del descriptor propio.
    unsafe {
        let f = libc::fcntl(fd.as_raw_fd(), libc::F_GETFL);
        libc::fcntl(fd.as_raw_fd(), libc::F_SETFL, f | libc::O_NONBLOCK);
    }
    let parar = Arc::new(AtomicBool::new(false));
    let ok = enlaces(|e| match e.get_mut(plat) {
        Some(l) => {
            if let Some(v) = l.canal.replace(parar.clone()) {
                v.store(true, Ordering::SeqCst);
            }
            true
        }
        None => false,
    });
    if !ok {
        return;
    }
    nucleo::al_l2cap_abierto(plat, psm);
    let p = plat.to_string();
    let _ = std::thread::Builder::new().name("starseed-ble-canal".into()).spawn(move || {
        let motivo = bucle_canal(&p, &fd, &parar);
        drop(fd);
        if !parar.load(Ordering::SeqCst) {
            nucleo::al_l2cap_cerrado(&p, &motivo);
        }
    });
}

fn bucle_canal(plat: &str, fd: &OwnedFd, parar: &AtomicBool) -> String {
    let mut salida = l2::Salida::nueva();
    let mut buf = vec![0u8; 16 * 1024];
    while !parar.load(Ordering::SeqCst) {
        if salida.vacia() {
            if let Some(t) = nucleo::siguiente_trama_rapida(plat, bt::PAQUETE_RAPIDO) {
                salida.cargar(&t);
            }
        }
        let mut pfd = libc::pollfd { fd: fd.as_raw_fd(), events: libc::POLLIN | if salida.vacia() { 0 } else { libc::POLLOUT }, revents: 0 };
        // SAFETY: un solo `pollfd` válido en la pila.
        let r = unsafe { libc::poll(&mut pfd, 1, 5) };
        if r < 0 && std::io::Error::last_os_error().kind() != std::io::ErrorKind::Interrupted {
            return format!("poll: {}", std::io::Error::last_os_error());
        }
        if pfd.revents & libc::POLLIN != 0 {
            // SAFETY: `buf` es propio y de `buf.len()` bytes.
            let n = unsafe { libc::recv(fd.as_raw_fd(), buf.as_mut_ptr().cast(), buf.len(), 0) };
            if n > 0 {
                nucleo::al_l2cap_datos(plat, &buf[..n as usize]);
            } else if n == 0 {
                return "el otro aparato cerró el canal".into();
            } else if std::io::Error::last_os_error().kind() != std::io::ErrorKind::WouldBlock {
                return format!("recv: {}", std::io::Error::last_os_error());
            }
        }
        if pfd.revents & (libc::POLLERR | libc::POLLHUP) != 0 && pfd.revents & libc::POLLIN == 0 {
            return "el canal L2CAP se cayó".into();
        }
        if pfd.revents & libc::POLLOUT != 0 && !salida.vacia() {
            let p = salida.pendiente();
            // SAFETY: `p` es un búfer válido de `p.len()` bytes.
            let n = unsafe { libc::send(fd.as_raw_fd(), p.as_ptr().cast(), p.len(), libc::MSG_NOSIGNAL | libc::MSG_DONTWAIT) };
            if n > 0 {
                salida.avanzar(n as usize);
            } else if n < 0 && std::io::Error::last_os_error().kind() != std::io::ErrorKind::WouldBlock {
                return format!("send: {}", std::io::Error::last_os_error());
            }
        }
    }
    "cerrado desde esta app".into()
}

/// Periférico: escucha con PSM 0 (el núcleo asigna uno dinámico), lo publica y acepta al central que ya tiene enlace GATT.
fn escuchar_l2cap() -> Result<(), String> {
    let fd = socket_l2cap()?;
    enlazar(&fd, 0, None, lg::BDADDR_LE_PUBLIC)?;
    // SAFETY: `fd` es un socket vivo; backlog pequeño.
    if unsafe { libc::listen(fd.as_raw_fd(), 4) } != 0 {
        return Err(format!("listen L2CAP: {}", std::io::Error::last_os_error()));
    }
    let mut sa = [0u8; 14];
    let mut largo: u32 = sa.len() as u32;
    // SAFETY: `sa` tiene 14 bytes y `largo` los declara.
    if unsafe { libc::getsockname(fd.as_raw_fd(), sa.as_mut_ptr().cast(), &mut largo) } != 0 {
        return Err(format!("getsockname L2CAP: {}", std::io::Error::last_os_error()));
    }
    let psm = lg::psm_asignado(&sa).ok_or("el kernel no dio un PSM LE válido al canal")?;
    PSM_PUBLICADO.store(psm, Ordering::SeqCst);
    let raw = fd.into_raw_fd();
    let _ = std::thread::Builder::new().name("starseed-ble-acepta".into()).spawn(move || {
        // SAFETY: `raw` viene de `into_raw_fd` y solo lo usa este hilo.
        let fd = unsafe { OwnedFd::from_raw_fd(raw) };
        loop {
            let mut pfd = libc::pollfd { fd: fd.as_raw_fd(), events: libc::POLLIN, revents: 0 };
            // SAFETY: un solo `pollfd` válido en la pila.
            if unsafe { libc::poll(&mut pfd, 1, 500) } <= 0 {
                continue;
            }
            let mut peer = [0u8; 14];
            let mut l: u32 = peer.len() as u32;
            // SAFETY: `peer` tiene 14 bytes y `l` los declara.
            let a = unsafe { libc::accept4(fd.as_raw_fd(), peer.as_mut_ptr().cast(), &mut l, libc::SOCK_CLOEXEC) };
            if a < 0 {
                continue;
            }
            // SAFETY: descriptor recién aceptado.
            let canal = unsafe { OwnedFd::from_raw_fd(a) };
            let mut b = [0u8; 6];
            b.copy_from_slice(&peer[4..10]);
            let dir = lg::direccion_de_bdaddr(&b);
            // Solo al central que ya tiene el enlace GATT abierto (si la dirección rota, el único periférico sin canal).
            let plat = enlaces(|e| {
                lg::plataforma('p', &dir).filter(|p| e.contains_key(p)).or_else(|| {
                    let mut c = e.iter().filter(|(_, l)| !l.central && l.canal.is_none());
                    match (c.next(), c.next()) {
                        (Some((p, _)), None) => Some(p.clone()),
                        _ => None,
                    }
                })
            });
            match plat {
                Some(p) => lanzar_canal(&p, canal, Some(psm)),
                None => drop(canal),
            }
        }
    });
    Ok(())
}

// ───────────────────────────── Hilo principal ─────────────────────────────

fn iniciar_hilo() {
    static UNA: std::sync::Once = std::sync::Once::new();
    UNA.call_once(|| {
        let (tx, rx) = mpsc::channel::<Orden>();
        let _ = ORDENES.set(Mutex::new(tx));
        let _ = std::thread::Builder::new().name("starseed-ble-linux".into()).spawn(move || hilo_principal(rx));
    });
}

fn informar(estado: &str, motivo: &str) {
    nucleo::al_radio(estado, motivo);
}

fn adaptador_de(o: &Objetos) -> Option<(String, bool)> {
    let mut rutas: Vec<(&OwnedObjectPath, &Props)> = o
        .iter()
        .filter(|(r, _)| lg::es_adaptador(r.as_str()))
        .filter_map(|(r, ifs)| ifs.iter().find(|(i, _)| i.as_str() == lg::IF_ADAPTADOR).map(|(_, p)| (r, p)))
        .collect();
    rutas.sort_by(|a, b| a.0.as_str().cmp(b.0.as_str()));
    // Prefiere uno encendido.
    let elegido = rutas.iter().find(|(_, p)| v_bool(p, "Powered") == Some(true)).or_else(|| rutas.first())?;
    Some((elegido.0.as_str().to_string(), v_bool(elegido.1, "Powered") == Some(true)))
}

struct Marcha {
    conn: Connection,
    adaptador: String,
    encendido: bool,
    gatt: bool,
    anunciando: bool,
    escucha_l2cap: bool,
    descubriendo: bool,
}

fn hilo_principal(rx: Receiver<Orden>) {
    let mut activo = false;
    let mut marcha: Option<Marcha> = None;
    let mut ultimo_error = String::new();
    let mut proximo_intento = Instant::now();
    loop {
        // Órdenes (cada segundo como mucho se mira también el estado de BlueZ).
        match rx.recv_timeout(Duration::from_millis(1000)) {
            Ok(Orden::Arrancar) => {
                activo = true;
                proximo_intento = Instant::now();
            }
            Ok(Orden::Parar) => {
                activo = false;
                if let Some(m) = marcha.as_mut() {
                    parar_marcha(m);
                }
            }
            Ok(Orden::Anunciar(u)) => {
                *UUID_ANUNCIO.lock().unwrap_or_else(|e| e.into_inner()) = u;
                if let Some(m) = marcha.as_mut() {
                    quitar_anuncio(&m.conn, &m.adaptador);
                    m.anunciando = false;
                }
            }
            Ok(Orden::Conectar(dir)) => {
                if let (true, Some(m)) = (activo, marcha.as_ref()) {
                    let (c, ad) = (m.conn.clone(), m.adaptador.clone());
                    let _ = std::thread::Builder::new().name("starseed-ble-conecta".into()).spawn(move || {
                        if let Err(e) = conectar_central(&c, &ad, &dir) {
                            eprintln!("[ble-linux] conectar {dir}: {e}");
                            if let Some(p) = lg::plataforma('c', &dir) {
                                nucleo::nota(Some(&p), "sin-suscripcion", &e);
                            }
                        }
                    });
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => return,
        }
        if !activo {
            continue;
        }
        // 1. Conexión con el bus de sistema y con BlueZ.
        if marcha.is_none() && Instant::now() >= proximo_intento {
            match arrancar_marcha() {
                Ok(m) => {
                    ultimo_error.clear();
                    marcha = Some(m);
                }
                Err((estado, motivo)) => {
                    if motivo != ultimo_error {
                        informar(estado, &motivo);
                        ultimo_error = motivo;
                    }
                    proximo_intento = Instant::now() + Duration::from_secs(5);
                }
            }
        }
        let Some(m) = marcha.as_mut() else { continue };
        // 2. Vigilar BlueZ (adaptador, anuncio, vecinos, enlaces caídos).
        if let Err(e) = vigilar(m) {
            let (estado, motivo) = lg::clasificar_error("", &e);
            if motivo != ultimo_error {
                informar(estado, &motivo);
                ultimo_error = motivo;
            }
            parar_marcha(m);
            marcha = None;
            proximo_intento = Instant::now() + Duration::from_secs(5);
        }
    }
}

fn arrancar_marcha() -> Result<Marcha, (&'static str, String)> {
    let conn = match CONEXION.get() {
        Some(c) => c.clone(),
        None => {
            let c = Connection::system().map_err(|e| clasificar(&e))?;
            let _ = CONEXION.set(c.clone());
            registrar_aplicacion(&c).map_err(|e| ("no-disponible", format!("No se pudo preparar el servicio GATT propio: {e}")))?;
            c
        }
    };
    let o = objetos(&conn).map_err(|e| lg::clasificar_error("", &e))?;
    let Some((ad, encendido)) = adaptador_de(&o) else { return Err(lg::estado_adaptador(false, false)) };
    *ADAPTADOR.lock().unwrap_or_else(|e| e.into_inner()) = Some(ad.clone());
    let (estado, motivo) = lg::estado_adaptador(true, encendido);
    informar(estado, &motivo);
    Ok(Marcha { conn, adaptador: ad, encendido, gatt: false, anunciando: false, escucha_l2cap: false, descubriendo: false })
}

fn parar_marcha(m: &mut Marcha) {
    quitar_anuncio(&m.conn, &m.adaptador);
    if m.descubriendo {
        if let Ok(p) = proxy(&m.conn, &m.adaptador, lg::IF_ADAPTADOR) {
            let _ = p.call::<_, _, ()>("StopDiscovery", &());
        }
    }
    m.anunciando = false;
    m.descubriendo = false;
    let todos: Vec<String> = enlaces(|e| e.keys().cloned().collect());
    for p in todos {
        cerrar_enlace(&p, false);
    }
}

fn vigilar(m: &mut Marcha) -> Result<(), String> {
    let o = objetos(&m.conn)?;
    let Some(p) = prop(&o, &m.adaptador, lg::IF_ADAPTADOR) else {
        return Err("org.freedesktop.DBus.Error.ServiceUnknown: el adaptador Bluetooth desapareció".into());
    };
    let enc = v_bool(p, "Powered") == Some(true);
    if enc != m.encendido {
        m.encendido = enc;
        let (estado, motivo) = lg::estado_adaptador(true, enc);
        informar(estado, &motivo);
        m.anunciando = false;
        m.descubriendo = false;
        m.gatt = false;
    }
    if !m.encendido {
        return Ok(());
    }
    // La aplicación GATT y el canal L2CAP, una vez.
    if !m.gatt {
        if !m.escucha_l2cap {
            match escuchar_l2cap() {
                Ok(()) => m.escucha_l2cap = true,
                Err(e) => {
                    m.escucha_l2cap = true; // no se reintenta cada segundo: se sigue por GATT
                    nucleo::nota(None, "suscrito", &format!("sin canal L2CAP propio: {e}"));
                }
            }
        }
        match registrar_gatt(&m.conn, &m.adaptador) {
            Ok(()) => m.gatt = true,
            Err(e) if format!("{e:?}").contains("AlreadyExists") => m.gatt = true,
            Err(e) => {
                let (estado, motivo) = clasificar(&e);
                informar(estado, &format!("{motivo} (RegisterApplication: {e})"));
                return Ok(());
            }
        }
    }
    // El anuncio (rota con `anunciar`).
    if !m.anunciando && !UUID_ANUNCIO.lock().unwrap_or_else(|e| e.into_inner()).is_empty() {
        match registrar_anuncio(&m.conn, &m.adaptador) {
            Ok(()) => m.anunciando = true,
            Err(e) if format!("{e:?}").contains("AlreadyExists") => m.anunciando = true,
            Err(e) => eprintln!("[ble-linux] RegisterAdvertisement: {e}"),
        }
    }
    // Escaneo LE.
    if !m.descubriendo {
        let a = proxy(&m.conn, &m.adaptador, lg::IF_ADAPTADOR).map_err(txt)?;
        let mut filtro: HashMap<&str, Value> = HashMap::new();
        filtro.insert("Transport", Value::from("le"));
        filtro.insert("DuplicateData", Value::from(true));
        let _ = a.call::<_, _, ()>("SetDiscoveryFilter", &(filtro,));
        match a.call::<_, _, ()>("StartDiscovery", &()) {
            Ok(()) => m.descubriendo = true,
            Err(e) if format!("{e:?}").contains("InProgress") => m.descubriendo = true,
            Err(e) => {
                let (estado, motivo) = clasificar(&e);
                informar(estado, &motivo);
            }
        }
    }
    // Vecinos y enlaces caídos.
    for (r, ifs) in &o {
        let Some(d) = ifs.iter().find(|(i, _)| i.as_str() == lg::IF_DISPOSITIVO).map(|(_, p)| p) else { continue };
        let Some(dir) = lg::direccion_de_ruta(r.as_str()) else { continue };
        if let (Some(uuid), Some(rssi)) = (lg::uuid_de_anuncio(&v_textos(d, "UUIDs")), v_i16(d, "RSSI")) {
            nucleo::al_ver(&dir, &uuid, rssi);
        }
        if v_bool(d, "Connected") == Some(false) {
            for rol in ['c', 'p'] {
                if let Some(p) = lg::plataforma(rol, &dir) {
                    if enlaces(|e| e.contains_key(&p)) {
                        cerrar_enlace(&p, true);
                    }
                }
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod pruebas {
    use super::*;

    /// Con un bus de sesión (p. ej. `dbus-run-session -- cargo test`), la aplicación GATT propia se ve como la espera BlueZ:
    /// ObjectManager con el servicio y sus 3 características (UUID, flags, servicio) y el PSM leíble. Sin bus: no hace nada.
    #[test]
    fn la_app_gatt_se_ve_como_la_espera_bluez() {
        if std::env::var_os("DBUS_SESSION_BUS_ADDRESS").is_none() {
            return;
        }
        let c = Connection::session().expect("bus de sesión");
        registrar_aplicacion(&c).expect("registrar");
        let nombre = c.unique_name().expect("nombre").to_string();
        let c2 = Connection::session().expect("segundo cliente");
        let om = ObjectManagerProxy::builder(&c2).destination(nombre.clone()).unwrap().path(lg::RAIZ_APP).unwrap().build().unwrap();
        let o = om.get_managed_objects().expect("GetManagedObjects");
        let uuid_de = |ruta: &str| prop(&o, ruta, lg::IF_CARACTERISTICA).and_then(|p| v_texto(p, "UUID"));
        assert_eq!(uuid_de(lg::RUTA_ENTRADA).as_deref(), Some(bt::ENTRADA));
        assert_eq!(uuid_de(lg::RUTA_SALIDA).as_deref(), Some(bt::SALIDA));
        assert_eq!(uuid_de(lg::RUTA_PSM).as_deref(), Some(l2::PSM));
        assert_eq!(prop(&o, lg::RUTA_SERVICIO, lg::IF_SERVICIO).and_then(|p| v_texto(p, "UUID")).as_deref(), Some(bt::SERVICIO));
        assert_eq!(prop(&o, lg::RUTA_SERVICIO, lg::IF_SERVICIO).and_then(|p| v_bool(p, "Primary")), Some(true));
        assert_eq!(prop(&o, lg::RUTA_SALIDA, lg::IF_CARACTERISTICA).map(|p| v_textos(p, "Flags")), Some(vec!["notify".to_string()]));
        assert_eq!(prop(&o, lg::RUTA_ENTRADA, lg::IF_CARACTERISTICA).map(|p| v_textos(p, "Flags")), Some(vec!["write".to_string(), "write-without-response".to_string()]));
        assert_eq!(prop(&o, lg::RUTA_PSM, lg::IF_CARACTERISTICA).map(|p| v_textos(p, "Flags")), Some(vec!["read".to_string()]));
        // El PSM sin canal publicado se lee como «0» (sin soporte), igual que en macOS.
        PSM_PUBLICADO.store(0, Ordering::SeqCst);
        let car = Proxy::new(&c2, nombre.clone(), lg::RUTA_PSM.to_string(), lg::IF_CARACTERISTICA.to_string()).unwrap();
        let v: Vec<u8> = car.call("ReadValue", &(sin_opciones(),)).expect("ReadValue");
        assert_eq!(v, vec![0, 0]);
        PSM_PUBLICADO.store(0x81, Ordering::SeqCst);
        let v: Vec<u8> = car.call("ReadValue", &(sin_opciones(),)).expect("ReadValue");
        assert_eq!(v, vec![0, 0x81]);
        PSM_PUBLICADO.store(0, Ordering::SeqCst);
        // El anuncio lleva solo el UUID rotatorio.
        *UUID_ANUNCIO.lock().unwrap() = "5353b1aa-0000-4000-8000-000000000001".to_string();
        let an = Proxy::new(&c2, nombre, lg::RUTA_ANUNCIO.to_string(), lg::IF_ANUNCIO.to_string()).unwrap();
        let u: Vec<String> = an.get_property("ServiceUUIDs").expect("ServiceUUIDs");
        assert_eq!(u, vec!["5353b1aa-0000-4000-8000-000000000001".to_string()]);
        assert_eq!(an.get_property::<String>("Type").expect("Type"), "peripheral");
        *UUID_ANUNCIO.lock().unwrap() = String::new();
    }

    #[test]
    fn el_par_de_sockets_lleva_un_paquete_por_envio() {
        let (a, b) = par_de_sockets().unwrap();
        let p = [1u8, 2, 3, 4, 5];
        assert!(escribir(&Salida::Fd(a), &p).is_ok());
        let mut buf = [0u8; 64];
        // SAFETY: búfer propio.
        let n = unsafe { libc::recv(b.as_raw_fd(), buf.as_mut_ptr().cast(), buf.len(), 0) };
        assert_eq!(&buf[..n as usize], &p);
    }
}
