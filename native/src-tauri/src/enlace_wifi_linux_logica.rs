
// ═══════════════════════════════════════════════════════════════════════════
// enlace_wifi_linux_logica — lo PURO del Wi-Fi Direct en Linux (LNX1109B · 2026-11-09).
// Contrato: architecture/wifi-directo.md §0.9. Solo std + enlace_wifi_logica: se prueba en cualquier sistema.
// ---------------------------------------------------------------------------
// La parte de Linux (`enlace_wifi_linux.rs`) habla por D-Bus con wpa_supplicant (grupo P2P propio, «GO») y con
// NetworkManager (unirse como cliente a la red del otro SIN dejar el Wi-Fi de casa). Aquí está lo que no necesita
// D-Bus: sondeo → capacidades (con su `motivo`), el nombre de red del grupo (`DIRECT-xy-StarSeed`), la elección del
// dispositivo Wi-Fi con el que unirse, validación de credenciales e IP, y la lectura de `ip -4 -o addr`.
//
// REGLA de Alex: «directo» = sin router y sin punto de acceso que haga salir a un aparato de su Wi-Fi. Por eso:
//   · como GO solo se ofrece si wpa_supplicant levanta el grupo en una interfaz virtual aparte (`p2p-wlanX-N`,
//     concurrente con el Wi-Fi de casa);
//   · como cliente solo se une con un dispositivo Wi-Fi que NO esté conectado a otra red (segunda tarjeta o USB).
//   Si no se cumple, la capacidad queda vacía y el `motivo` dice por qué (nunca se tira la red de casa).
// ═══════════════════════════════════════════════════════════════════════════

#![allow(dead_code)]

use crate::enlace_wifi_logica::{clave_valida, ssid_valido, CapacidadesWifi, CredencialesNativas};
use std::net::Ipv4Addr;

pub const VARIABLE_APAGADO: &str = "STARSEED_SIN_WIFI_DIRECT_LINUX";
/// Sufijo del nombre del grupo: `DIRECT-<xy>-StarSeed`.
pub const POSTFIJO_SSID: &str = "StarSeed";
/// IP del propietario del grupo cuando el sistema no dice otra (la de Android: 192.168.49.1/24).
pub const IP_GO_POR_DEFECTO: &str = "192.168.49.1";

pub fn apagado(valor: Option<&str>) -> bool {
    crate::puerta_proxy_logica::apagado(valor)
}

// ─────────────────────────────── NetworkManager / wpa_supplicant ───────────────────────────────

/// `NMDeviceType`
pub const NM_TIPO_WIFI: u32 = 2;
pub const NM_TIPO_WIFI_P2P: u32 = 30;
/// `NMDeviceState`
pub const NM_ESTADO_NO_GESTIONADO: u32 = 10;
pub const NM_ESTADO_NO_DISPONIBLE: u32 = 20;
pub const NM_ESTADO_DESCONECTADO: u32 = 30;
pub const NM_ESTADO_ACTIVADO: u32 = 100;
/// `NMActiveConnectionState` activada.
pub const NM_CONEXION_ACTIVADA: u32 = 2;

/// Un dispositivo Wi-Fi tal como lo ve NetworkManager.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DispositivoWifi {
    pub ruta: String,
    pub interfaz: String,
    pub estado: u32,
}

/// ¿Qué dispositivo Wi-Fi sirve para unirse a la red del otro sin soltar la de casa?
/// Solo uno desconectado y gestionado (30): si el único está activado (en la red de casa), unirse la dejaría.
pub fn dispositivo_para_unirse(dispositivos: &[DispositivoWifi]) -> Option<&DispositivoWifi> {
    dispositivos.iter().find(|d| d.estado == NM_ESTADO_DESCONECTADO && !es_interfaz_p2p(&d.interfaz))
}

/// El porqué de que no haya dispositivo para unirse (para el estado de error y para Ajustes).
pub fn motivo_sin_dispositivo(dispositivos: &[DispositivoWifi]) -> String {
    let reales: Vec<&DispositivoWifi> = dispositivos.iter().filter(|d| !es_interfaz_p2p(&d.interfaz)).collect();
    if reales.is_empty() {
        return "Este aparato no tiene una tarjeta Wi-Fi que NetworkManager gestione.".into();
    }
    if reales.iter().all(|d| d.estado == NM_ESTADO_ACTIVADO) {
        return "Para unirse a la red directa habría que dejar tu Wi-Fi de casa (solo hay una tarjeta Wi-Fi en uso): se necesita una segunda tarjeta o un adaptador USB Wi-Fi libre. No se toca tu red.".into();
    }
    if reales.iter().all(|d| d.estado <= NM_ESTADO_NO_DISPONIBLE) {
        return "La tarjeta Wi-Fi está apagada, bloqueada (rfkill) o no la gestiona NetworkManager.".into();
    }
    "Ninguna tarjeta Wi-Fi está libre ahora mismo para unirse a la red directa.".into()
}

/// `p2p-dev-wlan0`: la interfaz virtual donde wpa_supplicant tiene el dispositivo P2P.
pub fn es_interfaz_p2p_dev(nombre: &str) -> bool {
    nombre.strip_prefix("p2p-dev-").map(|r| !r.is_empty()).unwrap_or(false)
}

/// `p2p-wlan0-3`: la interfaz virtual del grupo P2P (propietario o cliente), concurrente con la principal.
pub fn es_interfaz_grupo_p2p(nombre: &str) -> bool {
    !es_interfaz_p2p_dev(nombre) && nombre.strip_prefix("p2p-").map(|r| r.contains('-') && !r.starts_with('-') && !r.ends_with('-')).unwrap_or(false)
}

pub fn es_interfaz_p2p(nombre: &str) -> bool {
    es_interfaz_p2p_dev(nombre) || es_interfaz_grupo_p2p(nombre)
}

/// Lo que se averigua de este PC (por D-Bus y /sys/class/net) antes de decir qué puede.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Sondeo {
    /// NetworkManager está en el bus de sistema.
    pub nm: bool,
    /// NetworkManager trae un dispositivo Wi-Fi P2P (`DeviceType` 30): solo descubrimiento de pares.
    pub nm_p2p: bool,
    /// wpa_supplicant está en el bus de sistema.
    pub wpa: bool,
    /// Alguna interfaz de wpa_supplicant implementa `fi.w1.wpa_supplicant1.Interface.P2PDevice`.
    pub wpa_p2p: bool,
    /// Dispositivos Wi-Fi (NetworkManager).
    pub dispositivos: Vec<DispositivoWifi>,
    /// Nombres de /sys/class/net.
    pub interfaces: Vec<String>,
}

/// ¿Puede el grupo P2P convivir con el Wi-Fi de casa? Sí si el dispositivo P2P es una interfaz virtual aparte
/// (`p2p-dev-*`: así lo crea wpa_supplicant cuando el controlador admite STA + P2P a la vez).
pub fn concurrente(s: &Sondeo) -> bool {
    s.interfaces.iter().any(|i| es_interfaz_p2p_dev(i)) || s.interfaces.iter().any(|i| es_interfaz_grupo_p2p(i))
}

/// Capacidades de este PC para la web (`enlace_wifi_capacidades`).
pub fn capacidades_de(s: &Sondeo, apagado_por_entorno: bool) -> CapacidadesWifi {
    let sin = |motivo: &str| CapacidadesWifi {
        plataforma: "linux".into(),
        ap: Vec::new(),
        cliente: Vec::new(),
        permiso: "no-aplica".into(),
        radio_unica: false,
        wifi: !s.dispositivos.is_empty(),
        motivo: motivo.into(),
        lanas: Vec::new(),
    };
    if apagado_por_entorno {
        return sin("El Wi-Fi Direct de Linux está apagado en esta instalación (STARSEED_SIN_WIFI_DIRECT_LINUX).");
    }
    if !s.nm && !s.wpa {
        return sin("No hay NetworkManager ni wpa_supplicant en el bus de sistema: sin ellos esta app no puede abrir Wi-Fi Direct (instala NetworkManager y wpa_supplicant).");
    }
    let conc = concurrente(s);
    let ap = s.wpa_p2p && conc;
    let cliente = s.nm && dispositivo_para_unirse(&s.dispositivos).is_some();
    let mut c = CapacidadesWifi {
        plataforma: "linux".into(),
        ap: if ap { vec!["wifi-direct".into()] } else { Vec::new() },
        cliente: if cliente { vec!["wifi-direct".into()] } else { Vec::new() },
        permiso: "concedido".into(),
        radio_unica: !conc && !cliente,
        wifi: !s.dispositivos.is_empty() || s.wpa_p2p,
        motivo: String::new(),
        lanas: Vec::new(),
    };
    // `wifi-direct-concurrente`: lo que el contrato llama «Wi-Fi Direct sin dejar el Wi-Fi de casa».
    // INT1109C: el mismo vocabulario que Windows: `wifi-direct` (el estándar, interoperable) y su variante concurrente.
    if ap || cliente {
        c.lanas.push("wifi-direct".to_string());
        c.lanas.push(crate::wifi_p2p_logica::LANA_DIRECT_CONCURRENTE.to_string());
    }
    c.motivo = if ap && cliente {
        "Wi-Fi Direct sin router ni hotspot y sin dejar tu Wi-Fi de casa: como propietario del grupo (wpa_supplicant, interfaz virtual) y como cliente (segunda tarjeta Wi-Fi libre).".into()
    } else if ap {
        "Wi-Fi Direct como propietario del grupo (wpa_supplicant levanta una interfaz virtual: tu Wi-Fi de casa sigue conectado). Para unirte tú a la red de otro hace falta una segunda tarjeta Wi-Fi libre.".into()
    } else if cliente {
        "Te puedes unir a la red Wi-Fi Direct de otro con la tarjeta Wi-Fi libre, sin dejar tu Wi-Fi de casa. Para abrir un grupo propio, wpa_supplicant tiene que ofrecer P2P en una interfaz virtual (controlador con STA + P2P a la vez).".into()
    } else if !s.wpa_p2p && s.nm_p2p {
        "NetworkManager ve pares Wi-Fi Direct, pero no abre grupos con contraseña, y wpa_supplicant no ofrece P2P por D-Bus (arráncalo con -Dnl80211 y `p2p_disabled=0`).".into()
    } else if !s.wpa_p2p {
        "wpa_supplicant no ofrece P2P por D-Bus en este PC (tarjeta o controlador sin Wi-Fi Direct, o P2P desactivado).".into()
    } else {
        let extra = motivo_sin_dispositivo(&s.dispositivos);
        format!("Wi-Fi Direct no es posible sin dejar tu Wi-Fi de casa: el controlador no abre el grupo en una interfaz virtual y {}", extra.to_lowercase().trim_end_matches('.'))
    };
    c
}

// ─────────────────────────────── Red del grupo ───────────────────────────────

/// `DIRECT-xy-Sufijo`: `xy` son 2 caracteres alfanuméricos (Wi-Fi Direct), sufijo opcional de hasta 22; 32 bytes como mucho.
pub fn ssid_de_grupo_valido(ssid: &str) -> bool {
    let Some(resto) = ssid.strip_prefix("DIRECT-") else { return false };
    let b = resto.as_bytes();
    ssid_valido(ssid) && b.len() >= 2 && b[..2].iter().all(|c| c.is_ascii_alphanumeric()) && (b.len() == 2 || (b[2] == b'-' && b.len() <= 3 + 22))
}

/// SSID en bytes (wpa_supplicant lo da como `ay`) → texto; solo si es UTF-8 y un SSID válido.
pub fn ssid_de_bytes(b: &[u8]) -> Option<String> {
    let s = std::str::from_utf8(b).ok()?;
    ssid_valido(s).then(|| s.to_string())
}

/// Credenciales del grupo recién abierto: el SSID tiene que ser de un grupo P2P y la contraseña WPA2 válida.
pub fn credenciales_de_grupo(ssid: &[u8], clave: Option<&str>, banda: Option<&str>, ip: Option<&str>) -> Result<CredencialesNativas, String> {
    let ssid = ssid_de_bytes(ssid).ok_or("wpa_supplicant dio un nombre de red que no es válido.")?;
    if !ssid_de_grupo_valido(&ssid) {
        return Err(format!("El nombre de la red del grupo («{ssid}») no tiene la forma DIRECT-xy-…: no se ofrece."));
    }
    let clave = clave.ok_or("wpa_supplicant no dio la contraseña del grupo (hace falta una versión reciente: ≥ 2.6).")?;
    if !clave_valida(clave) {
        return Err("La contraseña del grupo no es una WPA2 válida (8–63 caracteres ASCII).".into());
    }
    Ok(CredencialesNativas { ssid, clave: clave.to_string(), banda: banda.map(String::from), ip: ip.map(String::from) })
}

/// Una IP del propietario del grupo que se puede dar como pista al canal TCP: IPv4 privada y de enlace, nunca
/// la de bucle local, la de difusión ni la no especificada.
pub fn ip_directa_valida(ip: &str) -> Option<Ipv4Addr> {
    let a: Ipv4Addr = ip.trim().parse().ok()?;
    (a.is_private() && !a.is_loopback() && !a.is_unspecified() && !a.is_broadcast()).then_some(a)
}

/// La pista de IP del otro (el propietario) para el canal TCP 47071: la pasarela que dio la red; si no, la de siempre.
pub fn pista_ip_ap(pasarela: Option<&str>) -> String {
    pasarela.and_then(ip_directa_valida).map(|a| a.to_string()).unwrap_or_else(|| IP_GO_POR_DEFECTO.to_string())
}

/// La dirección IPv4 (y el prefijo) de `ip -4 -o addr show dev <if>`:
/// `5: p2p-wlan0-0    inet 192.168.49.1/24 brd 192.168.49.255 scope global p2p-wlan0-0\ …`
pub fn ipv4_de_ip_addr(salida: &str) -> Option<(Ipv4Addr, u8)> {
    for linea in salida.lines() {
        let mut it = linea.split_whitespace();
        while let Some(t) = it.next() {
            if t == "inet" {
                let (ip, pre) = it.next()?.split_once('/')?;
                let (ip, pre): (Ipv4Addr, u8) = (ip.parse().ok()?, pre.parse().ok()?);
                if pre <= 32 && !ip.is_loopback() {
                    return Some((ip, pre));
                }
            }
        }
    }
    None
}

/// Banda de la frecuencia (MHz) que dice el grupo.
pub fn banda_de(mhz: u32) -> Option<&'static str> {
    crate::enlace_wifi_logica::banda_de_frecuencia(mhz)
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn disp(i: &str, estado: u32) -> DispositivoWifi {
        DispositivoWifi { ruta: format!("/org/freedesktop/NetworkManager/Devices/{i}"), interfaz: i.into(), estado }
    }

    fn sondeo(wpa_p2p: bool, interfaces: &[&str], dispositivos: Vec<DispositivoWifi>) -> Sondeo {
        Sondeo { nm: true, nm_p2p: false, wpa: true, wpa_p2p, dispositivos, interfaces: interfaces.iter().map(|s| s.to_string()).collect() }
    }

    #[test]
    fn nombres_de_interfaz_p2p() {
        assert!(es_interfaz_p2p_dev("p2p-dev-wlan0"));
        assert!(!es_interfaz_p2p_dev("p2p-dev-") && !es_interfaz_p2p_dev("wlan0"));
        assert!(es_interfaz_grupo_p2p("p2p-wlan0-0") && es_interfaz_grupo_p2p("p2p-wlp3s0-12"));
        assert!(!es_interfaz_grupo_p2p("p2p-dev-wlan0") && !es_interfaz_grupo_p2p("p2p-wlan0") && !es_interfaz_grupo_p2p("wlan0"));
        assert!(es_interfaz_p2p("p2p-dev-wlan0") && es_interfaz_p2p("p2p-wlan0-0") && !es_interfaz_p2p("enp0s31f6"));
    }

    #[test]
    fn solo_se_une_con_una_tarjeta_libre() {
        let casa = vec![disp("wlan0", NM_ESTADO_ACTIVADO)];
        assert_eq!(dispositivo_para_unirse(&casa), None, "la única tarjeta está en el Wi-Fi de casa: no se toca");
        assert!(motivo_sin_dispositivo(&casa).contains("Wi-Fi de casa"));
        let dos = vec![disp("wlan0", NM_ESTADO_ACTIVADO), disp("wlan1", NM_ESTADO_DESCONECTADO)];
        assert_eq!(dispositivo_para_unirse(&dos).map(|d| d.interfaz.as_str()), Some("wlan1"));
        let virt = vec![disp("p2p-dev-wlan0", NM_ESTADO_DESCONECTADO)];
        assert_eq!(dispositivo_para_unirse(&virt), None, "la interfaz P2P virtual no es una tarjeta para unirse");
        assert!(motivo_sin_dispositivo(&[]).contains("no tiene una tarjeta"));
        assert!(motivo_sin_dispositivo(&[disp("wlan0", NM_ESTADO_NO_DISPONIBLE)]).contains("rfkill"));
    }

    #[test]
    fn capacidades_con_grupo_concurrente() {
        let c = capacidades_de(&sondeo(true, &["lo", "wlan0", "p2p-dev-wlan0"], vec![disp("wlan0", NM_ESTADO_ACTIVADO)]), false);
        assert_eq!(c.plataforma, "linux");
        assert_eq!(c.ap, vec!["wifi-direct"]);
        assert!(c.cliente.is_empty(), "una sola tarjeta en uso: no se une como cliente");
        assert_eq!(c.lanas, vec!["wifi-direct", "wifi-direct-concurrente"]);
        assert_eq!(c.permiso, "concedido");
        assert!(!c.radio_unica);
        assert!(c.motivo.contains("Wi-Fi de casa sigue conectado"));
    }

    #[test]
    fn capacidades_con_segunda_tarjeta() {
        let c = capacidades_de(&sondeo(true, &["wlan0", "wlan1", "p2p-dev-wlan0"], vec![disp("wlan0", NM_ESTADO_ACTIVADO), disp("wlan1", NM_ESTADO_DESCONECTADO)]), false);
        assert_eq!((c.ap.len(), c.cliente.len()), (1, 1));
        assert!(c.motivo.starts_with("Wi-Fi Direct sin router"));
        let solo_cliente = capacidades_de(&sondeo(false, &["wlan0", "wlan1"], vec![disp("wlan0", NM_ESTADO_ACTIVADO), disp("wlan1", NM_ESTADO_DESCONECTADO)]), false);
        assert!(solo_cliente.ap.is_empty() && solo_cliente.cliente == vec!["wifi-direct"]);
    }

    #[test]
    fn capacidades_sin_nada_dicen_por_que() {
        let sin_bus = capacidades_de(&Sondeo::default(), false);
        assert!(sin_bus.ap.is_empty() && sin_bus.cliente.is_empty());
        assert_eq!(sin_bus.permiso, "no-aplica");
        assert!(sin_bus.motivo.contains("NetworkManager"));
        let sin_p2p = capacidades_de(&sondeo(false, &["wlan0"], vec![disp("wlan0", NM_ESTADO_ACTIVADO)]), false);
        assert!(sin_p2p.ap.is_empty() && sin_p2p.cliente.is_empty() && sin_p2p.lanas.is_empty());
        assert!(sin_p2p.motivo.contains("wpa_supplicant"));
        let mut solo_nm = sondeo(false, &["wlan0"], vec![disp("wlan0", NM_ESTADO_ACTIVADO)]);
        solo_nm.nm_p2p = true;
        assert!(capacidades_de(&solo_nm, false).motivo.contains("NetworkManager ve pares"));
        // GO posible en teoría pero sin interfaz virtual: la red de casa caería, no se ofrece.
        let sin_virtual = capacidades_de(&sondeo(true, &["wlan0"], vec![disp("wlan0", NM_ESTADO_ACTIVADO)]), false);
        assert!(sin_virtual.ap.is_empty() && sin_virtual.motivo.contains("dejar tu Wi-Fi de casa"), "{}", sin_virtual.motivo);
        assert!(capacidades_de(&sondeo(true, &["p2p-dev-wlan0"], vec![]), true).motivo.contains("STARSEED_SIN_WIFI_DIRECT_LINUX"));
    }

    #[test]
    fn la_capacidad_serializa_con_las_claves_de_siempre() {
        let c = capacidades_de(&sondeo(true, &["p2p-dev-wlan0"], vec![disp("wlan0", NM_ESTADO_ACTIVADO)]), false);
        let j = serde_json::to_value(&c).unwrap();
        for k in ["plataforma", "ap", "cliente", "permiso", "radio_unica", "wifi", "motivo", "lanas"] {
            assert!(j.get(k).is_some(), "falta {k}");
        }
        assert_eq!(j["lanas"][0], "wifi-direct");
        assert_eq!(j["lanas"][1], "wifi-direct-concurrente");
    }

    #[test]
    fn ssid_de_grupo() {
        for bueno in ["DIRECT-xy", "DIRECT-aB-StarSeed", "DIRECT-9z-Android_1234", "DIRECT-ab-0123456789012345678901"] {
            assert!(ssid_de_grupo_valido(bueno), "{bueno}");
        }
        for malo in ["", "DIRECT-", "DIRECT-x", "direct-xy-StarSeed", "DIRECT-x!-a", "DIRECT-xy_StarSeed", "DIRECT-xy-01234567890123456789012", "Casa-WiFi", "DIRECT-xy-\u{7}"] {
            assert!(!ssid_de_grupo_valido(malo), "{malo:?}");
        }
        assert_eq!(ssid_de_bytes(b"DIRECT-ab-StarSeed").as_deref(), Some("DIRECT-ab-StarSeed"));
        assert_eq!(ssid_de_bytes(&[0xff, 0xfe]), None);
        assert_eq!(ssid_de_bytes(b""), None);
    }

    #[test]
    fn credenciales_del_grupo() {
        let ok = credenciales_de_grupo(b"DIRECT-ab-StarSeed", Some("clave-de-prueba"), Some("5"), Some("192.168.49.1")).unwrap();
        assert_eq!((ok.ssid.as_str(), ok.clave.as_str(), ok.banda.as_deref(), ok.ip.as_deref()), ("DIRECT-ab-StarSeed", "clave-de-prueba", Some("5"), Some("192.168.49.1")));
        assert!(credenciales_de_grupo(b"Casa", Some("clave-de-prueba"), None, None).is_err());
        assert!(credenciales_de_grupo(b"DIRECT-ab-StarSeed", Some("corta"), None, None).is_err());
        assert!(credenciales_de_grupo(b"DIRECT-ab-StarSeed", None, None, None).unwrap_err().contains("contraseña"));
    }

    #[test]
    fn ips_y_pista() {
        assert!(ip_directa_valida("192.168.49.1").is_some());
        assert!(ip_directa_valida("10.0.0.7").is_some());
        for mala in ["127.0.0.1", "0.0.0.0", "8.8.8.8", "255.255.255.255", "fe80::1", "x", ""] {
            assert!(ip_directa_valida(mala).is_none(), "{mala}");
        }
        assert_eq!(pista_ip_ap(Some("192.168.43.1")), "192.168.43.1");
        assert_eq!(pista_ip_ap(Some("8.8.8.8")), IP_GO_POR_DEFECTO);
        assert_eq!(pista_ip_ap(None), "192.168.49.1");
    }

    #[test]
    fn lee_ip_addr() {
        let s = "5: p2p-wlan0-0    inet 192.168.49.1/24 brd 192.168.49.255 scope global p2p-wlan0-0\\       valid_lft forever preferred_lft forever\n";
        assert_eq!(ipv4_de_ip_addr(s), Some((Ipv4Addr::new(192, 168, 49, 1), 24)));
        assert_eq!(ipv4_de_ip_addr(""), None);
        assert_eq!(ipv4_de_ip_addr("2: wlan0    inet6 fe80::1/64 scope link"), None);
        assert_eq!(ipv4_de_ip_addr("1: lo    inet 127.0.0.1/8 scope host lo"), None);
        assert_eq!(ipv4_de_ip_addr("3: x    inet 10.0.0.2/40 scope global x"), None);
        assert_eq!(banda_de(5180), Some("5"));
    }

    #[test]
    fn interruptor() {
        assert!(apagado(Some("1")) && !apagado(None) && !apagado(Some("false")));
    }
}
