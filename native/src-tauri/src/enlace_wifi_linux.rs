
// ═══════════════════════════════════════════════════════════════════════════
// enlace_wifi_linux — Wi-Fi Direct en Linux: grupo propio (GO) y unirse como cliente, SIN dejar el Wi-Fi de casa
// (LNX1109B · 2026-11-09). Contrato: architecture/wifi-directo.md §0.9. Lo puro está en `enlace_wifi_linux_logica.rs`.
// ---------------------------------------------------------------------------
// La negociación (oferta, respuesta, credenciales CIFRADAS con ECDH, cierre) es la misma de siempre y vive en la web
// (`enlace.wifi.*`); aquí solo se toca la radio, por D-Bus y sin privilegios (polkit de la sesión local):
//   · GO («ap», método `wifi-direct`): wpa_supplicant `fi.w1.wpa_supplicant1.Interface.P2PDevice`: `P2PDeviceConfig`
//     (`SsidPostfix` = StarSeed, GOIntent 15) y `GroupAdd` autónomo (sin persistente) → señal `GroupStarted` →
//     `Group.SSID`/`Group.Passphrase` (`DIRECT-xy-StarSeed` + contraseña WPA2 aleatoria de wpa_supplicant). El grupo
//     vive en una interfaz virtual `p2p-<if>-N`, EN PARALELO al Wi-Fi de casa. Android 10+ y Windows se unen por
//     nombre y contraseña (los GO admiten clientes WPA2 normales).
//   · CLIENTE («cliente», método `wifi-direct`): NetworkManager `AddAndActivateConnection` de una red WPA2 con ese
//     SSID/contraseña, SOLO en un dispositivo Wi-Fi libre (segunda tarjeta o USB): si el único está en el Wi-Fi de
//     casa NO se une (la regla de Alex: nada que haga salir al aparato de su red). `concurrente` se dice en las
//     capacidades (`lanas`: wifi-direct-concurrente).
//   · NetworkManager `Device.WifiP2P` (DeviceType 30) solo se sondea (pares): no abre grupos con contraseña.
// Las credenciales NUNCA van en el estado ni se registran: solo en `credenciales()` (una vez, para cifrarlas).
// Los comandos de Tauri son síncronos y corren en el hilo principal: aquí cada operación lenta va en un hilo y el
// estado se publica con `enlace_wifi::VERSION` (el vigía emite `enlace-wifi://estado`).
// Interruptor de emergencia: STARSEED_SIN_WIFI_DIRECT_LINUX=1.
// ═══════════════════════════════════════════════════════════════════════════

use crate::enlace_wifi::ahora_ms;
use crate::enlace_wifi_linux_logica as lg;
use crate::enlace_wifi_logica::{self as logica, CapacidadesWifi, CredencialesNativas, EstadoEnlaceWifi};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use zbus::blocking::{Connection, MessageIterator, Proxy};
use zbus::zvariant::{OwnedObjectPath, OwnedValue, Value};

const NM: &str = "org.freedesktop.NetworkManager";
const NM_RAIZ: &str = "/org/freedesktop/NetworkManager";
const WPA: &str = "fi.w1.wpa_supplicant1";
const WPA_RAIZ: &str = "/fi/w1/wpa_supplicant1";
const WPA_P2P: &str = "fi.w1.wpa_supplicant1.Interface.P2PDevice";

fn txt(e: impl std::fmt::Display) -> String {
    e.to_string()
}

fn conexion() -> Result<&'static Connection, String> {
    static C: OnceLock<Connection> = OnceLock::new();
    if let Some(c) = C.get() {
        return Ok(c);
    }
    let c = Connection::system().map_err(|e| format!("No hay bus de sistema de D-Bus al alcance: {e}"))?;
    Ok(C.get_or_init(|| c))
}

fn proxy(c: &Connection, dest: &str, ruta: &str, interfaz: &str) -> Result<Proxy<'static>, String> {
    Proxy::new(c, dest.to_string(), ruta.to_string(), interfaz.to_string()).map_err(txt)
}

fn existe_nombre(c: &Connection, nombre: &str) -> bool {
    proxy(c, "org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus")
        .and_then(|p| p.call::<_, _, bool>("NameHasOwner", &(nombre,)).map_err(txt))
        .unwrap_or(false)
}

fn escape() -> bool {
    lg::apagado(std::env::var(lg::VARIABLE_APAGADO).ok().as_deref())
}

// ───────────────────────────── Estado ─────────────────────────────

struct Interno {
    estado: EstadoEnlaceWifi,
    cred: Option<(String, CredencialesNativas)>,
    /// Pide a la operación en curso (GO) que cierre.
    cerrar: bool,
    /// Cliente: conexión activa y ajuste de NetworkManager que hay que quitar al cerrar.
    nm_activa: Option<(String, String)>,
}

fn interno() -> &'static Mutex<Interno> {
    static E: OnceLock<Mutex<Interno>> = OnceLock::new();
    E.get_or_init(|| Mutex::new(Interno { estado: EstadoEnlaceWifi::default(), cred: None, cerrar: false, nm_activa: None }))
}

fn con<T>(f: impl FnOnce(&mut Interno) -> T) -> T {
    f(&mut interno().lock().unwrap_or_else(|e| e.into_inner()))
}

fn publicar(f: impl FnOnce(&mut EstadoEnlaceWifi)) {
    con(|i| {
        f(&mut i.estado);
        i.estado.t = ahora_ms();
    });
    crate::enlace_wifi::VERSION.fetch_add(1, Ordering::Relaxed);
}

fn error_estado(sesion: &str, codigo: &str, mensaje: &str) {
    publicar(|e| *e = logica::estado_error(Some(sesion), codigo, mensaje, ahora_ms()));
}

pub fn estado() -> EstadoEnlaceWifi {
    con(|i| i.estado.clone())
}

pub fn credenciales(sesion: &str) -> Option<CredencialesNativas> {
    con(|i| i.cred.as_ref().filter(|(s, _)| s == sesion).map(|(_, c)| c.clone()))
}

// ───────────────────────────── Sondeo y capacidades ─────────────────────────────

fn sondear() -> Sondeo {
    let mut s = lg::Sondeo::default();
    if let Ok(rd) = std::fs::read_dir("/sys/class/net") {
        s.interfaces = rd.filter_map(|e| e.ok()).map(|e| e.file_name().to_string_lossy().into_owned()).collect();
    }
    let Ok(c) = conexion() else { return s };
    s.nm = existe_nombre(c, NM);
    s.wpa = existe_nombre(c, WPA);
    if s.nm {
        if let Ok(nm) = proxy(c, NM, NM_RAIZ, NM) {
            let devs: Vec<OwnedObjectPath> = nm.call("GetDevices", &()).unwrap_or_default();
            for d in devs {
                let Ok(p) = proxy(c, NM, d.as_str(), "org.freedesktop.NetworkManager.Device") else { continue };
                let tipo: u32 = p.get_property("DeviceType").unwrap_or(0);
                let interfaz: String = p.get_property("Interface").unwrap_or_default();
                let estado: u32 = p.get_property("State").unwrap_or(0);
                if tipo == lg::NM_TIPO_WIFI_P2P {
                    s.nm_p2p = true;
                } else if tipo == lg::NM_TIPO_WIFI {
                    s.dispositivos.push(lg::DispositivoWifi { ruta: d.as_str().to_string(), interfaz, estado });
                }
            }
        }
    }
    if s.wpa {
        s.wpa_p2p = interfaz_p2p_wpa(c).is_some();
    }
    s
}

use lg::Sondeo;

/// La interfaz de wpa_supplicant que implementa `P2PDevice` (la `p2p-dev-*` o la principal).
fn interfaz_p2p_wpa(c: &Connection) -> Option<String> {
    let raiz = proxy(c, WPA, WPA_RAIZ, WPA).ok()?;
    let ifs: Vec<OwnedObjectPath> = raiz.get_property("Interfaces").ok()?;
    let mut candidatas: Vec<(bool, String)> = Vec::new();
    for i in ifs {
        let Ok(p) = proxy(c, WPA, i.as_str(), WPA_P2P) else { continue };
        if p.get_property::<HashMap<String, OwnedValue>>("P2PDeviceConfig").is_ok() {
            let nombre: String = proxy(c, WPA, i.as_str(), "fi.w1.wpa_supplicant1.Interface").and_then(|q| q.get_property("Ifname").map_err(txt)).unwrap_or_default();
            candidatas.push((lg::es_interfaz_p2p_dev(&nombre), i.as_str().to_string()));
        }
    }
    // Mejor la virtual `p2p-dev-*` (el grupo sale concurrente).
    candidatas.sort_by_key(|(virt, _)| !*virt);
    candidatas.into_iter().next().map(|(_, r)| r)
}

pub fn capacidades() -> CapacidadesWifi {
    static CACHE: Mutex<Option<(Instant, CapacidadesWifi)>> = Mutex::new(None);
    let mut g = CACHE.lock().unwrap_or_else(|e| e.into_inner());
    if let Some((t, c)) = g.as_ref() {
        if t.elapsed() < Duration::from_secs(5) {
            return c.clone();
        }
    }
    let c = lg::capacidades_de(&sondear(), escape());
    *g = Some((Instant::now(), c.clone()));
    c
}

// ───────────────────────────── Grupo propio (GO) ─────────────────────────────

/// Señales de wpa_supplicant (`GroupStarted`, `GroupFinished`) de un solo hilo para todo el proceso.
type Senal = (String, HashMap<String, OwnedValue>);

fn senales() -> &'static Mutex<Receiver<Senal>> {
    static R: OnceLock<Mutex<Receiver<Senal>>> = OnceLock::new();
    R.get_or_init(|| {
        let (tx, rx): (Sender<Senal>, Receiver<Senal>) = mpsc::channel();
        let _ = std::thread::Builder::new().name("starseed-wifi-senales".into()).spawn(move || {
            let Ok(c) = conexion() else { return };
            let Ok(regla) = zbus::MatchRule::builder().msg_type(zbus::message::Type::Signal).interface(WPA_P2P).map(|b| b.build()) else { return };
            let Ok(it) = MessageIterator::for_match_rule(regla, c, Some(32)) else { return };
            for m in it.flatten() {
                let Some(miembro) = m.header().member().map(|x| x.to_string()) else { continue };
                if miembro != "GroupStarted" && miembro != "GroupFinished" {
                    continue;
                }
                let cuerpo: HashMap<String, OwnedValue> = m.body().deserialize().unwrap_or_default();
                if tx.send((miembro, cuerpo)).is_err() {
                    return;
                }
            }
        });
        Mutex::new(rx)
    })
}

fn texto_de(p: &HashMap<String, OwnedValue>, k: &str) -> Option<String> {
    p.get(k).and_then(|v| v.downcast_ref::<&str>().ok().map(String::from).or_else(|| v.downcast_ref::<&zbus::zvariant::ObjectPath>().ok().map(|o| o.as_str().to_string())))
}

fn ip_de_interfaz(interfaz: &str) -> Option<(std::net::Ipv4Addr, u8)> {
    let o = std::process::Command::new("ip").args(["-4", "-o", "addr", "show", "dev", interfaz]).output().ok()?;
    lg::ipv4_de_ip_addr(&String::from_utf8_lossy(&o.stdout))
}

/// `abrir_ap`: en un hilo (la web recibe «abriendo» y luego el evento con «red-lista» o el error).
pub fn abrir_ap(sesion: String, metodo: String) -> EstadoEnlaceWifi {
    if !logica::sesion_valida(&sesion) || !logica::metodo_ap_valido(&metodo) {
        return logica::estado_error(Some(&sesion), "sin-soporte", "Sesión o método no válidos.", ahora_ms());
    }
    if metodo != "wifi-direct" {
        return logica::estado_error(Some(&sesion), "sin-soporte", "En Linux solo se abre una red directa con Wi-Fi Direct (grupo P2P de wpa_supplicant).", ahora_ms());
    }
    let cap = capacidades();
    if cap.ap.is_empty() {
        return logica::estado_error(Some(&sesion), "sin-soporte", &cap.motivo, ahora_ms());
    }
    if con(|i| matches!(i.estado.fase.as_str(), "abriendo" | "red-lista" | "uniendo" | "unida") && i.estado.sesion.as_deref() != Some(&sesion)) {
        return logica::estado_error(Some(&sesion), "fallo-nativo", "Ya hay un enlace Wi-Fi directo abierto: ciérralo antes.", ahora_ms());
    }
    con(|i| {
        i.cerrar = false;
        i.cred = None;
    });
    publicar(|e| {
        *e = EstadoEnlaceWifi { sesion: Some(sesion.clone()), fase: "abriendo".into(), rol: Some("ap".into()), metodo: Some("wifi-direct".into()), mensaje: "Abriendo el grupo Wi-Fi Direct…".into(), ..Default::default() }
    });
    let s2 = sesion.clone();
    let _ = std::thread::Builder::new().name("starseed-wifi-go".into()).spawn(move || {
        if let Err((codigo, m)) = hilo_go(&s2) {
            error_estado(&s2, codigo, &m);
        }
    });
    estado()
}

fn hilo_go(sesion: &str) -> Result<(), (&'static str, String)> {
    let fallo = |m: String| ("fallo-nativo", m);
    let c = conexion().map_err(fallo)?;
    let ruta = interfaz_p2p_wpa(c).ok_or(("sin-soporte", "wpa_supplicant no ofrece P2P por D-Bus en este PC.".to_string()))?;
    let p2p = proxy(c, WPA, &ruta, WPA_P2P).map_err(fallo)?;
    // El nombre del grupo: DIRECT-xy-StarSeed (xy lo pone wpa_supplicant) y el propietario manda en el grupo.
    let mut cfg: HashMap<&str, Value> = HashMap::new();
    cfg.insert("SsidPostfix", Value::from(lg::POSTFIJO_SSID));
    cfg.insert("GOIntent", Value::from(15u32));
    let _ = p2p.set_property("P2PDeviceConfig", Value::from(zbus::zvariant::Dict::from(cfg)));
    // Las señales ANTES de pedir el grupo.
    let rx = senales().lock().unwrap_or_else(|e| e.into_inner());
    while rx.try_recv().is_ok() {}
    let mut args: HashMap<&str, Value> = HashMap::new();
    args.insert("persistent", Value::from(false));
    p2p.call::<_, _, ()>("GroupAdd", &(args,)).map_err(|e| fallo(format!("wpa_supplicant no abrió el grupo: {e}")))?;
    let limite = Instant::now() + Duration::from_secs(20);
    let datos = loop {
        if con(|i| i.cerrar) {
            return Ok(cerrado_go(&p2p, sesion));
        }
        match rx.recv_timeout(Duration::from_millis(500)) {
            Ok((m, d)) if m == "GroupStarted" => break d,
            Ok(_) => {}
            Err(_) if Instant::now() > limite => return Err(fallo("wpa_supplicant no confirmó el grupo a tiempo.".into())),
            Err(_) => {}
        }
    };
    let grupo = texto_de(&datos, "group_object").ok_or_else(|| fallo("wpa_supplicant no dijo qué grupo abrió.".into()))?;
    let interfaz_obj = texto_de(&datos, "interface_object");
    let gp = proxy(c, WPA, &grupo, "fi.w1.wpa_supplicant1.Group").map_err(fallo)?;
    let ssid: Vec<u8> = gp.get_property("SSID").map_err(|e| fallo(format!("No se pudo leer el nombre del grupo: {e}")))?;
    let clave: Option<String> = gp.get_property("Passphrase").ok();
    let mhz: Option<u32> = gp.get_property::<u16>("Frequency").ok().map(u32::from).or_else(|| gp.get_property::<u32>("Frequency").ok());
    let nombre_if: String = interfaz_obj
        .and_then(|o| proxy(c, WPA, &o, "fi.w1.wpa_supplicant1.Interface").ok())
        .and_then(|q| q.get_property("Ifname").ok())
        .unwrap_or_default();
    // La IP del propietario: la pone NetworkManager/systemd-networkd si gestionan la interfaz virtual; si no, se prueba a
    // ponerla (necesita permisos) y se espera un poco.
    let mut ip = None;
    let hasta = Instant::now() + Duration::from_secs(12);
    let mut probado = false;
    while Instant::now() < hasta && !nombre_if.is_empty() {
        if let Some((a, _)) = ip_de_interfaz(&nombre_if) {
            ip = Some(a);
            break;
        }
        if !probado && Instant::now() + Duration::from_secs(9) > hasta {
            probado = true;
            let _ = std::process::Command::new("ip").args(["addr", "add", &format!("{}/24", lg::IP_GO_POR_DEFECTO), "dev", &nombre_if]).output();
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    let Some(ip) = ip else {
        let _ = p2p.call::<_, _, ()>("Disconnect", &());
        return Err(("fallo-nativo", format!("El grupo se abrió pero la interfaz «{nombre_if}» no tiene IP: NetworkManager no la gestiona y esta sesión no puede configurarla (hace falta DHCP/IP en el propietario del grupo).")));
    };
    let banda = mhz.and_then(lg::banda_de);
    let cred = lg::credenciales_de_grupo(&ssid, clave.as_deref(), banda, Some(&ip.to_string())).map_err(|m| {
        let _ = p2p.call::<_, _, ()>("Disconnect", &());
        fallo(m)
    })?;
    con(|i| i.cred = Some((sesion.to_string(), cred.clone())));
    publicar(|e| {
        *e = EstadoEnlaceWifi {
            sesion: Some(sesion.to_string()),
            fase: "red-lista".into(),
            rol: Some("ap".into()),
            metodo: Some("wifi-direct".into()),
            ssid: Some(cred.ssid.clone()),
            ip_propia: Some(ip.to_string()),
            ip_ap: Some(ip.to_string()),
            banda: banda.map(String::from),
            mensaje: "Grupo Wi-Fi Direct abierto: tu Wi-Fi de casa sigue conectado.".into(),
            ..Default::default()
        }
    });
    // Se queda vivo hasta que la web cierre o wpa_supplicant termine el grupo.
    loop {
        if con(|i| i.cerrar) {
            return Ok(cerrado_go(&p2p, sesion));
        }
        if let Ok((m, _)) = rx.recv_timeout(Duration::from_millis(500)) {
            if m == "GroupFinished" {
                con(|i| i.cred = None);
                publicar(|e| {
                    *e = EstadoEnlaceWifi { sesion: Some(sesion.to_string()), fase: "cerrado".into(), mensaje: "wpa_supplicant cerró el grupo.".into(), ..Default::default() }
                });
                return Ok(());
            }
        }
    }
}

fn cerrado_go(p2p: &Proxy<'_>, sesion: &str) {
    let _ = p2p.call::<_, _, ()>("Disconnect", &());
    con(|i| i.cred = None);
    publicar(|e| *e = EstadoEnlaceWifi { sesion: Some(sesion.to_string()), fase: "cerrado".into(), mensaje: "Grupo Wi-Fi Direct cerrado.".into(), ..Default::default() });
}

// ───────────────────────────── Cliente (NetworkManager) ─────────────────────────────

pub fn unirse(sesion: String, metodo: String, ssid: String, clave: String, ip_ap: Option<String>) -> EstadoEnlaceWifi {
    if !logica::sesion_valida(&sesion) || !logica::ssid_valido(&ssid) || !logica::clave_valida(&clave) || !logica::metodo_cliente_valido(&metodo) {
        return logica::estado_error(Some(&sesion), "sin-soporte", "Sesión, método, nombre o contraseña no válidos: no se toca la radio.", ahora_ms());
    }
    if metodo != "wifi-direct" {
        return logica::estado_error(Some(&sesion), "sin-soporte", "En Linux se une con el método «wifi-direct» (red WPA2 del grupo, en una tarjeta libre).", ahora_ms());
    }
    let cap = capacidades();
    if cap.cliente.is_empty() {
        return logica::estado_error(Some(&sesion), "sin-soporte", &cap.motivo, ahora_ms());
    }
    publicar(|e| {
        *e = EstadoEnlaceWifi { sesion: Some(sesion.clone()), fase: "uniendo".into(), rol: Some("cliente".into()), metodo: Some("wifi-direct".into()), ssid: Some(ssid.clone()), mensaje: "Uniéndose a la red Wi-Fi Direct…".into(), ..Default::default() }
    });
    let s2 = sesion.clone();
    let _ = std::thread::Builder::new().name("starseed-wifi-cliente".into()).spawn(move || {
        if let Err((codigo, m)) = hilo_cliente(&s2, &ssid, &clave, ip_ap.as_deref()) {
            error_estado(&s2, codigo, &m);
        }
    });
    estado()
}

fn hilo_cliente(sesion: &str, ssid: &str, clave: &str, ip_ap: Option<&str>) -> Result<(), (&'static str, String)> {
    let fallo = |m: String| ("fallo-nativo", m);
    let c = conexion().map_err(fallo)?;
    let s = sondear();
    let Some(disp) = lg::dispositivo_para_unirse(&s.dispositivos) else {
        return Err(("sin-soporte", lg::motivo_sin_dispositivo(&s.dispositivos)));
    };
    // Que NetworkManager vea la red del otro (el grupo recién abierto aún puede no estar en su lista).
    if let Ok(w) = proxy(c, NM, &disp.ruta, "org.freedesktop.NetworkManager.Device.Wireless") {
        let vacio: HashMap<&str, Value> = HashMap::new();
        let _ = w.call::<_, _, ()>("RequestScan", &(vacio,));
        std::thread::sleep(Duration::from_millis(2500));
    }
    let mut con_id: HashMap<&str, Value> = HashMap::new();
    con_id.insert("id", Value::from("StarSeed Wi-Fi Direct"));
    con_id.insert("type", Value::from("802-11-wireless"));
    con_id.insert("autoconnect", Value::from(false));
    let mut radio: HashMap<&str, Value> = HashMap::new();
    radio.insert("ssid", Value::from(ssid.as_bytes().to_vec()));
    radio.insert("mode", Value::from("infrastructure"));
    let mut seg: HashMap<&str, Value> = HashMap::new();
    seg.insert("key-mgmt", Value::from("wpa-psk"));
    seg.insert("psk", Value::from(clave));
    let mut ip4: HashMap<&str, Value> = HashMap::new();
    ip4.insert("method", Value::from("auto"));
    let mut ip6: HashMap<&str, Value> = HashMap::new();
    ip6.insert("method", Value::from("ignore"));
    let mut ajustes: HashMap<&str, HashMap<&str, Value>> = HashMap::new();
    ajustes.insert("connection", con_id);
    ajustes.insert("802-11-wireless", radio);
    ajustes.insert("802-11-wireless-security", seg);
    ajustes.insert("ipv4", ip4);
    ajustes.insert("ipv6", ip6);
    let nm = proxy(c, NM, NM_RAIZ, NM).map_err(fallo)?;
    let (ajuste, activa): (OwnedObjectPath, OwnedObjectPath) = nm
        .call(
            "AddAndActivateConnection",
            &(ajustes, zbus::zvariant::ObjectPath::try_from(disp.ruta.clone()).map_err(|e| fallo(txt(e)))?, zbus::zvariant::ObjectPath::try_from("/").expect("ruta fija")),
        )
        .map_err(|e| fallo(format!("NetworkManager no pudo unirse a la red del grupo: {e}")))?;
    con(|i| i.nm_activa = Some((activa.as_str().to_string(), ajuste.as_str().to_string())));
    let limite = Instant::now() + Duration::from_secs(35);
    let ap = proxy(c, NM, activa.as_str(), "org.freedesktop.NetworkManager.Connection.Active").map_err(fallo)?;
    loop {
        if con(|i| i.nm_activa.is_none()) {
            return Ok(());
        }
        let estado: u32 = ap.get_property("State").unwrap_or(0);
        if estado == lg::NM_CONEXION_ACTIVADA {
            break;
        }
        if estado >= 3 || Instant::now() > limite {
            quitar_nm(c);
            return Err(("no-encontrada", format!("No se pudo entrar en la red «{ssid}»: ¿está a la vista, con la contraseña correcta y con el grupo abierto?")));
        }
        std::thread::sleep(Duration::from_millis(400));
    }
    // IP propia y pasarela.
    let mut ip_propia = None;
    let mut pasarela = None;
    let hasta = Instant::now() + Duration::from_secs(10);
    while Instant::now() < hasta {
        if let Ok(cfg) = ap.get_property::<OwnedObjectPath>("Ip4Config") {
            if cfg.as_str() != "/" {
                if let Ok(q) = proxy(c, NM, cfg.as_str(), "org.freedesktop.NetworkManager.IP4Config") {
                    pasarela = q.get_property::<String>("Gateway").ok().filter(|g| !g.is_empty());
                }
            }
        }
        if let Ok(disp_p) = proxy(c, NM, &disp.ruta, "org.freedesktop.NetworkManager.Device") {
            let nombre: String = disp_p.get_property("IpInterface").unwrap_or_else(|_| disp.interfaz.clone());
            ip_propia = ip_de_interfaz(&nombre).map(|(a, _)| a);
        }
        if ip_propia.is_some() {
            break;
        }
        std::thread::sleep(Duration::from_millis(400));
    }
    let Some(propia) = ip_propia else {
        quitar_nm(c);
        return Err(("fallo-nativo", "Se entró en la red pero el propietario no dio IP (DHCP).".into()));
    };
    // La pista de IP del otro para el canal TCP 47071: la pasarela; si no, la que dijo la web, y si no, la de siempre.
    let pista = lg::pista_ip_ap(pasarela.as_deref().or(ip_ap));
    publicar(|e| {
        *e = EstadoEnlaceWifi {
            sesion: Some(sesion.to_string()),
            fase: "unida".into(),
            rol: Some("cliente".into()),
            metodo: Some("wifi-direct".into()),
            ssid: Some(ssid.to_string()),
            ip_propia: Some(propia.to_string()),
            ip_ap: Some(pista),
            mensaje: "Dentro de la red Wi-Fi Direct (tu Wi-Fi de casa sigue en la otra tarjeta).".into(),
            ..Default::default()
        }
    });
    Ok(())
}

fn quitar_nm(c: &Connection) {
    let Some((activa, ajuste)) = con(|i| i.nm_activa.take()) else { return };
    if let Ok(nm) = proxy(c, NM, NM_RAIZ, NM) {
        if let Ok(a) = zbus::zvariant::ObjectPath::try_from(activa) {
            let _ = nm.call::<_, _, ()>("DeactivateConnection", &(a,));
        }
    }
    if let Ok(s) = proxy(c, NM, &ajuste, "org.freedesktop.NetworkManager.Settings.Connection") {
        let _ = s.call::<_, _, ()>("Delete", &());
    }
}

// ───────────────────────────── Cerrar ─────────────────────────────

pub fn cerrar(sesion: String) -> EstadoEnlaceWifi {
    let actual = estado();
    if actual.sesion.as_deref() != Some(&sesion) {
        return actual;
    }
    static CERRANDO: AtomicBool = AtomicBool::new(false);
    if CERRANDO.swap(true, Ordering::SeqCst) {
        return actual;
    }
    con(|i| {
        i.cerrar = true;
        i.cred = None;
    });
    if let Ok(c) = conexion() {
        quitar_nm(c);
    }
    publicar(|e| *e = EstadoEnlaceWifi { sesion: Some(sesion.clone()), fase: "cerrado".into(), mensaje: "Enlace Wi-Fi directo cerrado.".into(), ..Default::default() });
    CERRANDO.store(false, Ordering::SeqCst);
    estado()
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn rechaza_lo_invalido_sin_tocar_la_radio() {
        let e = abrir_ap("sesión con espacios".into(), "wifi-direct".into());
        assert_eq!(e.fase, "error");
        let e = unirse("wfd-1".into(), "wifi-direct".into(), "DIRECT-ab-StarSeed".into(), "corta".into(), None);
        assert_eq!(e.fase, "error");
        let e = unirse("wfd-1".into(), "corewlan".into(), "DIRECT-ab-StarSeed".into(), "clave-de-prueba".into(), None);
        assert_eq!(e.fase, "error");
        assert!(credenciales("wfd-1").is_none());
    }
}
