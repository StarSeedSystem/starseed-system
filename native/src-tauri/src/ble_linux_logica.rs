
// ═══════════════════════════════════════════════════════════════════════════
// ble_linux_logica — lo PURO del Bluetooth directo en Linux (BlueZ por D-Bus) (LNX1109B · 2026-11-09).
// Contrato: architecture/bluetooth-directo.md §16. Solo std: se prueba en cualquier sistema.
// ---------------------------------------------------------------------------
// La radio (`ble_linux.rs`, solo Linux) habla con BlueZ; aquí está lo que no necesita radio:
//   · rutas de objeto de D-Bus (adaptador, dispositivo, la aplicación GATT propia) y su traducción a la
//     dirección Bluetooth y al id de plataforma («c:…» / «p:…») que usa el núcleo `ble.rs`;
//   · direcciones `AA:BB:CC:DD:EE:FF` ↔ `bdaddr_t` (6 bytes, el último primero) y la dirección de `sockaddr_l2`
//     del canal L2CAP LE (carril rápido), con el MISMO PSM y marco que `ble_l2cap.rs`;
//   · qué UUID de anuncio hay en la lista de UUID de un dispositivo, y cómo se traduce un error de D-Bus a
//     un estado de radio con su `motivo` en cristiano (sin BlueZ, sin adaptador, apagado, sin permiso);
//   · el interruptor de emergencia `STARSEED_SIN_BLE_LINUX=1`.
// ═══════════════════════════════════════════════════════════════════════════

#![allow(dead_code)]

use crate::ble_l2cap as l2;
use crate::ble_trama as bt;

pub const VARIABLE_APAGADO: &str = "STARSEED_SIN_BLE_LINUX";

/// `STARSEED_SIN_BLE_LINUX`: cualquier valor salvo vacío, «0» o «false» lo apaga (igual que el de la puerta).
pub fn apagado(valor: Option<&str>) -> bool {
    crate::puerta_proxy_logica::apagado(valor)
}

// ─────────────────────────────── Nombres de BlueZ ───────────────────────────────

pub const BLUEZ: &str = "org.bluez";
pub const IF_ADAPTADOR: &str = "org.bluez.Adapter1";
pub const IF_DISPOSITIVO: &str = "org.bluez.Device1";
pub const IF_SERVICIO: &str = "org.bluez.GattService1";
pub const IF_CARACTERISTICA: &str = "org.bluez.GattCharacteristic1";
pub const IF_GESTOR_GATT: &str = "org.bluez.GattManager1";
pub const IF_GESTOR_ANUNCIOS: &str = "org.bluez.LEAdvertisingManager1";
pub const IF_ANUNCIO: &str = "org.bluez.LEAdvertisement1";

/// La aplicación GATT propia (un servicio con ENTRADA, SALIDA y PSM) y el anuncio.
pub const RAIZ_APP: &str = "/app/starseed/ble";
pub const RUTA_SERVICIO: &str = "/app/starseed/ble/servicio0";
pub const RUTA_ENTRADA: &str = "/app/starseed/ble/servicio0/entrada";
pub const RUTA_SALIDA: &str = "/app/starseed/ble/servicio0/salida";
pub const RUTA_PSM: &str = "/app/starseed/ble/servicio0/psm";
pub const RUTA_ANUNCIO: &str = "/app/starseed/ble/anuncio0";

/// `bdaddr_type` de `sockaddr_l2` (BlueZ, `l2cap.h`).
pub const BDADDR_LE_PUBLIC: u8 = 1;
pub const BDADDR_LE_RANDOM: u8 = 2;

// ─────────────────────────────── Direcciones y rutas ───────────────────────────────

/// `aa:bb:cc:dd:ee:ff` → `AA:BB:CC:DD:EE:FF`; cualquier otra cosa → None.
pub fn direccion_normal(t: &str) -> Option<String> {
    let t = t.trim();
    let partes: Vec<&str> = t.split(':').collect();
    if partes.len() != 6 || !partes.iter().all(|p| p.len() == 2 && p.bytes().all(|b| b.is_ascii_hexdigit())) {
        return None;
    }
    Some(t.to_ascii_uppercase())
}

/// `bdaddr_t` de BlueZ: los 6 bytes de la dirección en orden inverso (el último octeto primero).
pub fn bdaddr(t: &str) -> Option<[u8; 6]> {
    let n = direccion_normal(t)?;
    let mut b = [0u8; 6];
    for (i, p) in n.split(':').enumerate() {
        b[5 - i] = u8::from_str_radix(p, 16).ok()?;
    }
    Some(b)
}

pub fn direccion_de_bdaddr(b: &[u8; 6]) -> String {
    format!("{:02X}:{:02X}:{:02X}:{:02X}:{:02X}:{:02X}", b[5], b[4], b[3], b[2], b[1], b[0])
}

/// `/org/bluez/hci0` + `AA:BB:…` → `/org/bluez/hci0/dev_AA_BB_…`
pub fn ruta_dispositivo(adaptador: &str, direccion: &str) -> Option<String> {
    let d = direccion_normal(direccion)?;
    Some(format!("{}/dev_{}", adaptador.trim_end_matches('/'), d.replace(':', "_")))
}

/// La dirección de una ruta de dispositivo (o de sus servicios/características): `…/dev_AA_BB_CC_DD_EE_FF[/…]`.
pub fn direccion_de_ruta(ruta: &str) -> Option<String> {
    let seg = ruta.split('/').find(|s| s.starts_with("dev_"))?;
    direccion_normal(&seg[4..].replace('_', ":"))
}

/// `/org/bluez/hci0/dev_…/service000a/char000b` → `/org/bluez/hci0/dev_…`
pub fn ruta_dispositivo_de(ruta: &str) -> Option<String> {
    let mut fuera = String::new();
    for seg in ruta.split('/').filter(|s| !s.is_empty()) {
        fuera.push('/');
        fuera.push_str(seg);
        if seg.starts_with("dev_") {
            return Some(fuera);
        }
    }
    None
}

/// ¿Es la ruta de un adaptador (`/org/bluez/hci0`)?
pub fn es_adaptador(ruta: &str) -> bool {
    ruta.strip_prefix("/org/bluez/hci").map(|n| !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit())).unwrap_or(false)
}

/// El id de plataforma del núcleo: «c:» (este aparato conectó) o «p:» (el otro conectó) + la dirección sin «:»
/// en minúsculas. Siempre cumple `ble::plataforma_valida`.
pub fn plataforma(rol: char, direccion: &str) -> Option<String> {
    let d = direccion_normal(direccion)?;
    (rol == 'c' || rol == 'p').then(|| format!("{rol}:{}", d.replace(':', "").to_ascii_lowercase()))
}

/// «c:aabbccddeeff» → `AA:BB:CC:DD:EE:FF`.
pub fn direccion_de_plataforma(p: &str) -> Option<String> {
    let h = p.get(2..)?;
    if h.len() != 12 || !h.bytes().all(|b| b.is_ascii_hexdigit()) || !(p.starts_with("c:") || p.starts_with("p:")) {
        return None;
    }
    let h = h.to_ascii_uppercase();
    Some((0..6).map(|i| &h[i * 2..i * 2 + 2]).collect::<Vec<_>>().join(":"))
}

/// `AddressType` de `Device1` («public» | «random») → `bdaddr_type` LE de `sockaddr_l2`.
pub fn tipo_direccion(t: &str) -> u8 {
    if t.eq_ignore_ascii_case("random") {
        BDADDR_LE_RANDOM
    } else {
        BDADDR_LE_PUBLIC
    }
}

// ─────────────────────────────── Anuncio, MTU y PSM ───────────────────────────────

/// El UUID de anuncio StarSeed (prefijo «SS·B1») entre los UUID de servicio que BlueZ lista de un dispositivo.
pub fn uuid_de_anuncio(uuids: &[String]) -> Option<[u8; 16]> {
    uuids.iter().filter_map(|u| bt::uuid_bytes(u)).find(|b| bt::es_anuncio(b))
}

/// ¿Es ese UUID el de una característica concreta? (BlueZ los da en minúsculas; se compara sin mayúsculas).
pub fn mismo_uuid(a: &str, b: &str) -> bool {
    a.trim().eq_ignore_ascii_case(b.trim())
}

/// Bytes por paquete GATT: MTU de ATT − 3. Sin MTU conocido (BlueZ < 5.62 no lo publica): el mínimo seguro.
pub fn paquete_de_mtu(mtu: Option<u16>) -> usize {
    match mtu {
        Some(m) => (m as usize).saturating_sub(3).clamp(bt::PAQUETE_MIN, bt::PAQUETE_MAX),
        None => bt::PAQUETE_MIN,
    }
}

/// Lo que se lee de la característica PSM del otro: el mismo valor que en macOS y Android (`ble_l2cap::leer_psm`).
pub fn psm_leido(b: &[u8]) -> Option<u16> {
    l2::leer_psm(b)
}

/// Lo que publica esta app en la característica PSM (2 bytes BE; 0 = sin canal rápido).
pub fn psm_publicable(psm: Option<u16>) -> [u8; 2] {
    l2::bytes_psm(psm)
}

/// `struct sockaddr_l2` de Linux (`bluetooth/l2cap.h`): familia (u16 host), PSM (u16 **little-endian**, a diferencia de
/// la característica), bdaddr (6), CID (u16) y tipo de dirección (u8) → 14 bytes (+ 1 de relleno). Se arma a mano
/// para poder probar el diseño sin sockets. `psm` 0 = que el núcleo lo asigne (dinámico, 128–255 en LE).
pub fn sockaddr_l2(psm: u16, direccion: Option<[u8; 6]>, tipo: u8) -> [u8; 14] {
    const AF_BLUETOOTH: u16 = 31;
    let mut s = [0u8; 14];
    s[0..2].copy_from_slice(&AF_BLUETOOTH.to_ne_bytes());
    s[2..4].copy_from_slice(&psm.to_le_bytes());
    s[4..10].copy_from_slice(&direccion.unwrap_or([0; 6]));
    // cid (10..12) = 0; tipo de dirección:
    s[12] = tipo;
    s
}

/// El PSM que BlueZ/el núcleo asignó al canal que escucha (leído con `getsockname`) y que se publica: solo si es LE válido.
pub fn psm_asignado(sockaddr: &[u8]) -> Option<u16> {
    if sockaddr.len() < 4 {
        return None;
    }
    let p = u16::from_le_bytes([sockaddr[2], sockaddr[3]]);
    l2::psm_valido(p).then_some(p)
}

// ─────────────────────────────── Errores y estado de la radio ───────────────────────────────

/// Un error de D-Bus (nombre + mensaje) → estado de radio del núcleo y su `motivo`.
/// Estados: «no-disponible» | «apagada» | «sin-permiso» (los de `ble::EventoRadio::Radio`).
pub fn clasificar_error(nombre: &str, mensaje: &str) -> (&'static str, String) {
    let n = nombre.to_ascii_lowercase();
    let m = mensaje.to_ascii_lowercase();
    if n.contains("serviceunknown") || n.contains("namehasnoowner") || m.contains("not provided by any .service") {
        return (
            "no-disponible",
            "BlueZ (el servicio «bluetooth» de Linux) no está en marcha o no está instalado: instala «bluez» y ejecuta `sudo systemctl enable --now bluetooth`.".into(),
        );
    }
    if n.contains("accessdenied") || n.contains("notauthorized") || n.contains("authorizationrequired") || m.contains("permission denied") || m.contains("not permitted") {
        return (
            "sin-permiso",
            "BlueZ no deja usar el Bluetooth a este usuario (D-Bus/polkit): entra en una sesión de escritorio local o añade tu usuario al grupo «bluetooth» (`sudo usermod -aG bluetooth $USER` y vuelve a iniciar sesión).".into(),
        );
    }
    if n.contains("notready") || n.contains("rfkill") || m.contains("rf-kill") || m.contains("blocked") || m.contains("not powered") {
        return ("apagada", "El Bluetooth de este aparato está apagado o bloqueado: enciéndelo (`rfkill unblock bluetooth` o el ajuste de Bluetooth del escritorio).".into());
    }
    if n.contains("noreply") || n.contains("timeout") || n.contains("timedout") {
        return ("no-disponible", "BlueZ no contestó a tiempo: reinicia el servicio con `sudo systemctl restart bluetooth`.".into());
    }
    if n.contains("filenotfound") || n.contains("connectionrefused") || m.contains("no such file") || m.contains("connection refused") {
        return ("no-disponible", "No hay bus de sistema de D-Bus al alcance de la app (¿Flatpak/Snap sin permiso para hablar con org.bluez?).".into());
    }
    ("no-disponible", format!("No se pudo hablar con BlueZ: {}", mensaje.chars().take(160).collect::<String>()))
}

/// Estado según el adaptador: ¿hay uno? ¿está encendido?
pub fn estado_adaptador(hay: bool, encendido: bool) -> (&'static str, String) {
    if !hay {
        return ("no-disponible", "Este aparato no tiene adaptador Bluetooth de baja energía (BlueZ no ve ningún controlador).".into());
    }
    if !encendido {
        return ("apagada", "El Bluetooth de este aparato está apagado: enciéndelo (`bluetoothctl power on` o el ajuste del escritorio).".into());
    }
    ("encendida", String::new())
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn rutas_y_direcciones() {
        assert_eq!(direccion_normal("aa:bb:cc:dd:ee:0f").as_deref(), Some("AA:BB:CC:DD:EE:0F"));
        for malo in ["", "aa:bb:cc", "aa:bb:cc:dd:ee:gg", "aabbccddeeff", "aa:bb:cc:dd:ee:ff:00", "a:bb:cc:dd:ee:ff"] {
            assert_eq!(direccion_normal(malo), None, "{malo}");
        }
        let r = ruta_dispositivo("/org/bluez/hci0", "aa:bb:cc:dd:ee:0f").unwrap();
        assert_eq!(r, "/org/bluez/hci0/dev_AA_BB_CC_DD_EE_0F");
        assert_eq!(direccion_de_ruta(&r).as_deref(), Some("AA:BB:CC:DD:EE:0F"));
        let car = format!("{r}/service000a/char000b");
        assert_eq!(direccion_de_ruta(&car).as_deref(), Some("AA:BB:CC:DD:EE:0F"));
        assert_eq!(ruta_dispositivo_de(&car).as_deref(), Some(r.as_str()));
        assert_eq!(ruta_dispositivo_de("/org/bluez/hci0"), None);
        assert_eq!(direccion_de_ruta("/org/bluez/hci0"), None);
        assert!(es_adaptador("/org/bluez/hci0") && es_adaptador("/org/bluez/hci12"));
        assert!(!es_adaptador("/org/bluez/hci0/dev_AA") && !es_adaptador("/org/bluez/hci") && !es_adaptador("/org/bluez"));
        assert_eq!(ruta_dispositivo("/org/bluez/hci0", "nada"), None);
    }

    #[test]
    fn bdaddr_va_al_reves() {
        let b = bdaddr("01:02:03:04:05:06").unwrap();
        assert_eq!(b, [6, 5, 4, 3, 2, 1]);
        assert_eq!(direccion_de_bdaddr(&b), "01:02:03:04:05:06");
        assert_eq!(bdaddr("zz"), None);
    }

    #[test]
    fn ids_de_plataforma_validos_para_el_nucleo() {
        let c = plataforma('c', "AA:bb:CC:dd:EE:ff").unwrap();
        assert_eq!(c, "c:aabbccddeeff");
        assert!(crate::ble::plataforma_valida(&c));
        let p = plataforma('p', "AA:BB:CC:DD:EE:FF").unwrap();
        assert!(p.starts_with("p:") && crate::ble::plataforma_valida(&p));
        assert_eq!(plataforma('x', "AA:BB:CC:DD:EE:FF"), None);
        assert_eq!(plataforma('c', "no"), None);
        assert_eq!(direccion_de_plataforma(&c).as_deref(), Some("AA:BB:CC:DD:EE:FF"));
        assert_eq!(direccion_de_plataforma("c:aabb"), None);
        assert_eq!(direccion_de_plataforma("x:aabbccddeeff"), None);
        assert_eq!(tipo_direccion("random"), BDADDR_LE_RANDOM);
        assert_eq!(tipo_direccion("public"), BDADDR_LE_PUBLIC);
        assert_eq!(tipo_direccion("???"), BDADDR_LE_PUBLIC);
    }

    #[test]
    fn el_uuid_de_anuncio_se_encuentra_entre_los_demas() {
        let mut anuncio = [0u8; 16];
        anuncio[..3].copy_from_slice(&bt::PREFIJO_ANUNCIO);
        anuncio[3] = 0x42;
        let lista = vec!["0000180f-0000-1000-8000-00805f9b34fb".to_string(), bt::uuid_texto(&anuncio), bt::SERVICIO.to_string()];
        assert_eq!(uuid_de_anuncio(&lista), Some(anuncio));
        assert_eq!(uuid_de_anuncio(&lista[..1]), None);
        assert_eq!(uuid_de_anuncio(&["basura".to_string()]), None);
        assert!(mismo_uuid(" 53530002-B1E0-4D2A-9C3E-537461727365", bt::ENTRADA));
        assert!(!mismo_uuid(bt::ENTRADA, bt::SALIDA));
    }

    #[test]
    fn el_paquete_sale_del_mtu() {
        assert_eq!(paquete_de_mtu(Some(247)), 244);
        assert_eq!(paquete_de_mtu(Some(517)), 512);
        assert_eq!(paquete_de_mtu(Some(23)), 20);
        assert_eq!(paquete_de_mtu(Some(1)), bt::PAQUETE_MIN);
        assert_eq!(paquete_de_mtu(Some(u16::MAX)), bt::PAQUETE_MAX);
        assert_eq!(paquete_de_mtu(None), bt::PAQUETE_MIN);
    }

    #[test]
    fn el_psm_es_el_mismo_que_en_mac_y_android() {
        // Característica: 2 bytes BE; 0 o fuera de 1–255 = sin canal rápido.
        assert_eq!(psm_publicable(Some(0x00C5)), [0x00, 0xC5]);
        assert_eq!(psm_publicable(None), [0, 0]);
        assert_eq!(psm_publicable(Some(0x1001)), [0, 0], "un PSM de BR/EDR no se publica");
        assert_eq!(psm_leido(&[0x00, 0x81]), Some(0x81));
        assert_eq!(psm_leido(&[0, 0]), None);
        assert_eq!(psm_leido(&[0x01, 0x00]), None);
        assert_eq!(psm_leido(&[0x81]), None);
        assert_eq!(l2::PSM, "53530004-b1e0-4d2a-9c3e-537461727365");
    }

    #[test]
    fn sockaddr_l2_de_le() {
        let s = sockaddr_l2(0x0081, bdaddr("01:02:03:04:05:06"), BDADDR_LE_RANDOM);
        assert_eq!(&s[0..2], &31u16.to_ne_bytes(), "AF_BLUETOOTH");
        assert_eq!(&s[2..4], &[0x81, 0x00], "el PSM del socket va en little-endian");
        assert_eq!(&s[4..10], &[6, 5, 4, 3, 2, 1]);
        assert_eq!(s[12], BDADDR_LE_RANDOM);
        assert_eq!(psm_asignado(&s), Some(0x81));
        let escucha = sockaddr_l2(0, None, BDADDR_LE_PUBLIC);
        assert_eq!(psm_asignado(&escucha), None, "PSM 0: aún sin asignar");
        assert_eq!(psm_asignado(&[1, 2]), None);
    }

    #[test]
    fn errores_de_dbus_con_su_motivo() {
        let (e, m) = clasificar_error("org.freedesktop.DBus.Error.ServiceUnknown", "The name org.bluez was not provided by any .service files");
        assert_eq!(e, "no-disponible");
        assert!(m.contains("bluez") && m.contains("systemctl"));
        let (e, m) = clasificar_error("org.freedesktop.DBus.Error.AccessDenied", "Rejected send message");
        assert_eq!(e, "sin-permiso");
        assert!(m.contains("bluetooth") && m.contains("polkit"));
        let (e, _) = clasificar_error("org.bluez.Error.NotReady", "Resource Not Ready");
        assert_eq!(e, "apagada");
        let (e, _) = clasificar_error("org.freedesktop.DBus.Error.NoReply", "");
        assert_eq!(e, "no-disponible");
        let (e, m) = clasificar_error("otra", "cosa rara");
        assert_eq!(e, "no-disponible");
        assert!(m.contains("cosa rara"));
    }

    #[test]
    fn estado_segun_el_adaptador() {
        assert_eq!(estado_adaptador(false, false).0, "no-disponible");
        assert_eq!(estado_adaptador(true, false).0, "apagada");
        assert_eq!(estado_adaptador(true, true), ("encendida", String::new()));
    }

    #[test]
    fn interruptor_de_emergencia() {
        assert!(apagado(Some("1")));
        assert!(!apagado(Some("0")) && !apagado(Some("")) && !apagado(None));
        assert_eq!(VARIABLE_APAGADO, "STARSEED_SIN_BLE_LINUX");
    }

    #[test]
    fn la_app_gatt_cuelga_de_una_sola_raiz() {
        for r in [RUTA_SERVICIO, RUTA_ENTRADA, RUTA_SALIDA, RUTA_PSM, RUTA_ANUNCIO] {
            assert!(r.starts_with(RAIZ_APP), "{r}");
        }
        assert!(RUTA_ENTRADA.starts_with(RUTA_SERVICIO) && RUTA_SALIDA.starts_with(RUTA_SERVICIO) && RUTA_PSM.starts_with(RUTA_SERVICIO));
    }
}
