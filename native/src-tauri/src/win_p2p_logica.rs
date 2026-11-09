// ═══════════════════════════════════════════════════════════════════════════
// win_p2p_logica — lo PURO del P2P directo de Windows (WIN1109B · 2026-11-09).
// Contrato: architecture/bluetooth-directo.md §16 y architecture/wifi-directo.md §10.
// ---------------------------------------------------------------------------
// Solo std + serde: se prueba en cualquier sistema (el CI de Linux corre estas pruebas) mientras que la radio
// (WinRT) vive en `ble_windows.rs`, `enlace_wifi_windows.rs` y `puerta_proxy_windows.rs`, que solo compilan
// en Windows. Aquí:
//   · `ble`   : UUID ↔ bytes, direcciones, ids de enlace («c:<mac>», «p:<mac>»), paquete a partir del PDU y el
//               estado de la radio (apagada, sin permiso, sin adaptador, sin papel periférico…) con su `motivo`.
//   · `wifi`  : nombre y contraseña del grupo `DIRECT-xy-StarSeed`, elección de la IP del grupo, capacidades
//               (roles, concurrencia, permiso) y estados que entiende la web.
//   · `proxy` : argumentos del WebView2, lista de exclusión, análisis de la petición del proxy local y detección
//               de un proxy del sistema (para no pisarlo).
// ═══════════════════════════════════════════════════════════════════════════

#![allow(dead_code)]

// ─────────────────────────────── Bluetooth LE ───────────────────────────────

pub mod ble {
    use crate::ble_trama as bt;

    /// Interruptor de emergencia: con `1` la app no toca el Bluetooth de Windows.
    pub const ENTORNO_SIN_BLE: &str = "STARSEED_SIN_BLE_WINDOWS";

    pub fn apagado(valor: Option<&str>) -> bool {
        matches!(valor.map(|v| v.trim().to_ascii_lowercase()).as_deref(), Some("1" | "true" | "si" | "sí" | "yes"))
    }

    /// Un GUID de WinRT (`data1`, `data2`, `data3`, `data4`) → los 16 bytes en orden de red (el del texto del UUID).
    pub fn guid_a_bytes(d1: u32, d2: u16, d3: u16, d4: [u8; 8]) -> [u8; 16] {
        let mut b = [0u8; 16];
        b[0..4].copy_from_slice(&d1.to_be_bytes());
        b[4..6].copy_from_slice(&d2.to_be_bytes());
        b[6..8].copy_from_slice(&d3.to_be_bytes());
        b[8..16].copy_from_slice(&d4);
        b
    }

    /// Los 16 bytes del UUID → los campos del GUID de WinRT.
    pub fn bytes_a_guid(b: &[u8; 16]) -> (u32, u16, u16, [u8; 8]) {
        let d1 = u32::from_be_bytes([b[0], b[1], b[2], b[3]]);
        let d2 = u16::from_be_bytes([b[4], b[5]]);
        let d3 = u16::from_be_bytes([b[6], b[7]]);
        let mut d4 = [0u8; 8];
        d4.copy_from_slice(&b[8..16]);
        (d1, d2, d3, d4)
    }

    /// El texto de un UUID StarSeed («53530001-…», con o sin guiones) → campos de GUID.
    pub fn guid_de_texto(t: &str) -> Option<(u32, u16, u16, [u8; 8])> {
        bt::uuid_bytes(t).map(|b| bytes_a_guid(&b))
    }

    /// Dirección Bluetooth (48 bits) → 12 hex en minúsculas, sin separadores. Es la «dirección» que el núcleo ve.
    pub fn direccion_texto(a: u64) -> String {
        format!("{:012x}", a & 0xFFFF_FFFF_FFFF)
    }

    pub fn direccion_de_texto(t: &str) -> Option<u64> {
        let limpio: String = t.chars().filter(|c| *c != ':' && *c != '-').collect();
        if limpio.len() != 12 || !limpio.chars().all(|c| c.is_ascii_hexdigit()) {
            return None;
        }
        u64::from_str_radix(&limpio, 16).ok()
    }

    /// Id de plataforma de un enlace en el que ESTE aparato es central.
    pub fn plataforma_central(direccion: &str) -> String {
        format!("c:{direccion}")
    }

    /// Id de plataforma de un enlace en el que ESTE aparato es periférico (el otro se suscribió).
    pub fn plataforma_periferico(mac: &str) -> String {
        format!("p:{mac}")
    }

    /// De qué lado está un id de plataforma y su dirección.
    pub fn partir_plataforma(p: &str) -> Option<(&'static str, &str)> {
        if let Some(r) = p.strip_prefix("c:") {
            return Some(("central", r));
        }
        p.strip_prefix("p:").map(|r| ("periferico", r))
    }

    /// El id de dispositivo de WinRT de un cliente GATT (`BluetoothLE#BluetoothLE<adaptador>-<mac del cliente>`)
    /// → la MAC del cliente en 12 hex. Lo que cuelga tras el último «-» y tiene forma de dirección.
    pub fn mac_de_id_dispositivo(id: &str) -> Option<String> {
        let cola = id.rsplit('-').next()?;
        direccion_de_texto(cola).map(direccion_texto)
    }

    /// PDU máximo del enlace GATT (`GattSession.MaxPduSize`, MTU del ATT) → bytes por paquete (MTU − 3), acotado
    /// a lo que admite el núcleo. Si Windows no lo dice (0), el mínimo seguro.
    pub fn paquete_de_pdu(pdu: u16) -> usize {
        if pdu == 0 {
            return bt::PAQUETE_MIN;
        }
        (pdu as usize).saturating_sub(3).clamp(bt::PAQUETE_MIN, bt::PAQUETE_MAX)
    }

    /// Tamaño máximo de una notificación (`GattSubscribedClient.MaxNotificationSize`) → bytes por paquete.
    pub fn paquete_de_notificacion(max: u16) -> usize {
        if max == 0 {
            return bt::PAQUETE_MIN;
        }
        (max as usize).clamp(bt::PAQUETE_MIN, bt::PAQUETE_MAX)
    }

    /// Lo que se sabe del Bluetooth de este equipo (todo lo que WinRT deja preguntar, ya resumido).
    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    pub struct SondaBle {
        /// Hay un adaptador Bluetooth (`BluetoothAdapter.GetDefaultAsync` no vino vacío).
        pub adaptador: bool,
        /// El adaptador admite Bluetooth de baja energía.
        pub le: bool,
        pub rol_central: bool,
        pub rol_periferico: bool,
        pub radio: EstadoRadioWin,
    }

    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    pub enum EstadoRadioWin {
        Encendida,
        Apagada,
        /// `Radio.RequestAccessAsync` dijo DeniedByUser / DeniedBySystem: Privacidad de Windows.
        SinAcceso,
        Desconocida,
    }

    /// Estado de la radio para el núcleo («encendida» | «apagada» | «sin-permiso» | «no-disponible») + motivo.
    /// Sin el papel periférico el aparato sigue siendo útil como central: se dice en el motivo y se enciende.
    pub fn estado_radio(s: &SondaBle) -> (&'static str, String) {
        if !s.adaptador {
            return ("no-disponible", "Este equipo no tiene adaptador Bluetooth.".into());
        }
        if !s.le {
            return ("no-disponible", "El adaptador Bluetooth de este equipo no admite Bluetooth de baja energía (LE), que es el que usa StarSeed.".into());
        }
        match s.radio {
            EstadoRadioWin::SinAcceso => (
                "sin-permiso",
                "Windows no deja a StarSeed usar el Bluetooth: actívalo en Configuración › Privacidad y seguridad › Dispositivos de Bluetooth (o «Radios») y permite las apps de escritorio.".into(),
            ),
            EstadoRadioWin::Apagada => ("apagada", "El Bluetooth de este equipo está apagado: enciéndelo en Configuración › Bluetooth y dispositivos.".into()),
            EstadoRadioWin::Desconocida | EstadoRadioWin::Encendida => {
                if !s.rol_central && !s.rol_periferico {
                    ("no-disponible", "El adaptador Bluetooth de este equipo no admite ni el papel central ni el periférico de LE.".into())
                } else if !s.rol_periferico {
                    ("encendida", "Bluetooth directo encendido solo como central: el adaptador de este equipo no admite el papel periférico, así que no puede ser buscado, pero sí conecta a otras neuronas.".into())
                } else if !s.rol_central {
                    ("encendida", "Bluetooth directo encendido solo como periférico: el adaptador de este equipo no admite el papel central, así que otras neuronas lo encuentran pero él no las busca.".into())
                } else {
                    ("encendida", String::new())
                }
            }
        }
    }

    /// ¿Los roles que este equipo puede hacer? (para `ble_estado`/pruebas: «ble-gatt» central y periférico).
    pub fn roles(s: &SondaBle) -> Vec<&'static str> {
        let mut r = Vec::new();
        if s.rol_central {
            r.push("central");
        }
        if s.rol_periferico {
            r.push("periferico");
        }
        r
    }

    /// Texto cuando WinRT falla con un HRESULT conocido (acceso denegado, Bluetooth apagado, no disponible).
    pub fn motivo_hresult(hr: i32) -> Option<(&'static str, &'static str)> {
        match hr as u32 {
            // E_ACCESSDENIED
            0x8007_0005 => Some(("sin-permiso", "Windows negó el acceso al Bluetooth a la app (Configuración › Privacidad y seguridad).")),
            // ERROR_DEVICE_NOT_AVAILABLE / HRESULT_FROM_WIN32(ERROR_DEVICE_NOT_CONNECTED) / E_NOT_VALID_STATE
            0x8007_048F | 0x8007_0015 | 0x8007_139F => Some(("apagada", "El Bluetooth de este equipo no está listo (apagado o sin adaptador).")),
            _ => None,
        }
    }

    #[cfg(test)]
    mod pruebas {
        use super::*;

        fn sonda(radio: EstadoRadioWin) -> SondaBle {
            SondaBle { adaptador: true, le: true, rol_central: true, rol_periferico: true, radio }
        }

        #[test]
        fn guid_ida_y_vuelta_con_los_uuid_de_starseed() {
            for u in [bt::SERVICIO, bt::ENTRADA, bt::SALIDA, crate::ble_l2cap::PSM] {
                let (d1, d2, d3, d4) = guid_de_texto(u).expect("uuid válido");
                let b = guid_a_bytes(d1, d2, d3, d4);
                assert_eq!(bt::uuid_texto(&b), u, "el texto vuelve igual");
            }
            let (d1, d2, d3, d4) = guid_de_texto(bt::SERVICIO).unwrap();
            assert_eq!((d1, d2, d3), (0x5353_0001, 0xb1e0, 0x4d2a));
            assert_eq!(d4, [0x9c, 0x3e, 0x53, 0x74, 0x61, 0x72, 0x73, 0x65]);
        }

        #[test]
        fn el_anuncio_rotatorio_se_reconoce_desde_un_guid() {
            let a = bt::construir_anuncio(None, None, bt::TipoAparato::Escritorio, bt::FLAG_SERVIDOR, 1_700_000_000, [1, 2, 3, 4]);
            let (d1, d2, d3, d4) = bytes_a_guid(&a);
            let b = guid_a_bytes(d1, d2, d3, d4);
            assert!(bt::es_anuncio(&b));
            assert_eq!(b, a);
        }

        #[test]
        fn direcciones() {
            assert_eq!(direccion_texto(0x0011_2233_4455), "001122334455");
            assert_eq!(direccion_de_texto("00:11:22:33:44:55"), Some(0x0011_2233_4455));
            assert_eq!(direccion_de_texto("AA-BB-CC-DD-EE-FF"), Some(0xAABB_CCDD_EEFF));
            assert_eq!(direccion_de_texto("0011223344"), None);
            assert_eq!(direccion_de_texto("zz:11:22:33:44:55"), None);
            // La dirección es la clave del vecino: sin separadores y estable.
            assert_eq!(direccion_texto(direccion_de_texto("AA:BB:CC:DD:EE:FF").unwrap()), "aabbccddeeff");
        }

        #[test]
        fn ids_de_enlace_son_validos_para_el_nucleo() {
            let c = plataforma_central("aabbccddeeff");
            let p = plataforma_periferico("112233445566");
            assert!(crate::ble::plataforma_valida(&c));
            assert!(crate::ble::plataforma_valida(&p));
            assert_eq!(partir_plataforma(&c), Some(("central", "aabbccddeeff")));
            assert_eq!(partir_plataforma(&p), Some(("periferico", "112233445566")));
            assert_eq!(partir_plataforma("x:1"), None);
        }

        #[test]
        fn mac_del_cliente_desde_el_id_de_dispositivo_de_winrt() {
            assert_eq!(mac_de_id_dispositivo("BluetoothLE#BluetoothLE00:11:22:33:44:55-aa:bb:cc:dd:ee:ff").as_deref(), Some("aabbccddeeff"));
            assert_eq!(mac_de_id_dispositivo("aa:bb:cc:dd:ee:ff").as_deref(), Some("aabbccddeeff"));
            assert_eq!(mac_de_id_dispositivo("BluetoothLE#sin-direccion"), None);
            assert_eq!(mac_de_id_dispositivo(""), None);
        }

        #[test]
        fn paquete_a_partir_del_pdu() {
            assert_eq!(paquete_de_pdu(23), 20, "MTU por defecto de ATT: 20 B de datos");
            assert_eq!(paquete_de_pdu(247), 244);
            assert_eq!(paquete_de_pdu(517), 512, "tope del núcleo");
            assert_eq!(paquete_de_pdu(1000), bt::PAQUETE_MAX);
            assert_eq!(paquete_de_pdu(0), bt::PAQUETE_MIN);
            assert_eq!(paquete_de_pdu(5), bt::PAQUETE_MIN);
            assert_eq!(paquete_de_notificacion(244), 244);
            assert_eq!(paquete_de_notificacion(0), bt::PAQUETE_MIN);
            assert_eq!(paquete_de_notificacion(9999), bt::PAQUETE_MAX);
        }

        #[test]
        fn estados_de_la_radio_con_su_motivo() {
            assert_eq!(estado_radio(&sonda(EstadoRadioWin::Encendida)), ("encendida", String::new()));
            assert_eq!(estado_radio(&sonda(EstadoRadioWin::Desconocida)).0, "encendida");
            let (e, m) = estado_radio(&sonda(EstadoRadioWin::Apagada));
            assert_eq!(e, "apagada");
            assert!(m.contains("apagado"));
            let (e, m) = estado_radio(&sonda(EstadoRadioWin::SinAcceso));
            assert_eq!(e, "sin-permiso");
            assert!(m.contains("Privacidad"));
            let sin = SondaBle { adaptador: false, ..sonda(EstadoRadioWin::Encendida) };
            let (e, m) = estado_radio(&sin);
            assert_eq!(e, "no-disponible");
            assert!(m.contains("adaptador"));
            let sin_le = SondaBle { le: false, ..sonda(EstadoRadioWin::Encendida) };
            assert!(estado_radio(&sin_le).1.contains("LE"));
            // Sin papel periférico sigue encendida (solo central) y lo dice; sin ninguno, no hay Bluetooth directo.
            let solo_central = SondaBle { rol_periferico: false, ..sonda(EstadoRadioWin::Encendida) };
            let (e, m) = estado_radio(&solo_central);
            assert_eq!(e, "encendida");
            assert!(m.contains("solo como central"));
            let solo_perif = SondaBle { rol_central: false, ..sonda(EstadoRadioWin::Encendida) };
            assert!(estado_radio(&solo_perif).1.contains("solo como periférico"));
            let ninguno = SondaBle { rol_central: false, rol_periferico: false, ..sonda(EstadoRadioWin::Encendida) };
            assert_eq!(estado_radio(&ninguno).0, "no-disponible");
            // El texto del estado nunca es uno que el núcleo no conozca.
            for s in [EstadoRadioWin::Encendida, EstadoRadioWin::Apagada, EstadoRadioWin::SinAcceso, EstadoRadioWin::Desconocida] {
                assert!(["encendida", "apagada", "sin-permiso", "no-disponible"].contains(&estado_radio(&sonda(s)).0));
            }
        }

        #[test]
        fn roles_y_lanas_del_ble_windows() {
            assert_eq!(roles(&sonda(EstadoRadioWin::Encendida)), vec!["central", "periferico"]);
            let c = SondaBle { rol_periferico: false, ..sonda(EstadoRadioWin::Encendida) };
            assert_eq!(roles(&c), vec!["central"]);
        }

        #[test]
        fn hresult_conocidos() {
            assert_eq!(motivo_hresult(0x8007_0005u32 as i32).map(|x| x.0), Some("sin-permiso"));
            assert_eq!(motivo_hresult(0x8007_048Fu32 as i32).map(|x| x.0), Some("apagada"));
            assert_eq!(motivo_hresult(0x8000_4005u32 as i32), None);
        }

        #[test]
        fn interruptor() {
            assert!(!apagado(None));
            assert!(!apagado(Some("0")));
            assert!(apagado(Some("1")));
            assert!(apagado(Some(" TRUE ")));
        }
    }
}

// ─────────────────────────────── Wi-Fi Direct ───────────────────────────────

pub mod wifi {
    use crate::enlace_wifi_logica::{self as logica, CapacidadesWifi, EstadoEnlaceWifi};
    use std::net::Ipv4Addr;

    /// Interruptor de emergencia: con `1` Windows no abre ni se une a grupos Wi-Fi Direct.
    pub const ENTORNO_SIN_WIFI_DIRECT: &str = "STARSEED_SIN_WIFI_DIRECT_WINDOWS";
    /// El método que ya conocen la web y Android (roles «ap» = dueño del grupo / «cliente»).
    pub const METODO: &str = "wifi-direct";
    /// Carril «Wi-Fi Direct» de los contratos; el concurrente (Wi-Fi de casa intacta) es el que ya entiende la web.
    pub const LANA_DIRECT: &str = "wifi-direct";
    pub const LANA_DIRECT_CONCURRENTE: &str = crate::wifi_p2p_logica::LANA_DIRECT_CONCURRENTE;
    pub const PREFIJO_GRUPO: &str = "DIRECT-";
    pub const SUFIJO_GRUPO: &str = "StarSeed";
    pub const LARGO_CLAVE: usize = 16;
    /// Con Windows, el dueño del grupo suele tomar esta IP (la de «Conexión compartida»); Android usa 192.168.49.1.
    pub const IPS_DUENO: [Ipv4Addr; 2] = [Ipv4Addr::new(192, 168, 137, 1), Ipv4Addr::new(192, 168, 49, 1)];

    const ALFABETO: &[u8; 62] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    pub fn apagado(valor: Option<&str>) -> bool {
        super::ble::apagado(valor)
    }

    /// Un carácter del alfabeto sin sesgo: los bytes ≥ 248 (62 × 4) se descartan.
    fn caracter(b: u8) -> Option<char> {
        (b < 248).then(|| ALFABETO[(b % 62) as usize] as char)
    }

    /// `DIRECT-xy-StarSeed`: `xy` son dos caracteres alfanuméricos al azar (como los que pone Android).
    pub fn nombre_grupo(azar: [u8; 2]) -> String {
        // Un byte descartado cae en el primer carácter: el nombre no es secreto, no hace falta rechazar.
        let c = |b: u8| ALFABETO[(b % 62) as usize] as char;
        format!("{PREFIJO_GRUPO}{}{}-{SUFIJO_GRUPO}", c(azar[0]), c(azar[1]))
    }

    /// Contraseña WPA2 de 16 caracteres alfanuméricos a partir de bytes aleatorios del sistema (sin sesgo).
    /// `None` si no alcanzan: quien llama pide más bytes.
    pub fn clave_de_azar(azar: &[u8]) -> Option<String> {
        let s: String = azar.iter().filter_map(|b| caracter(*b)).take(LARGO_CLAVE).collect();
        (s.len() == LARGO_CLAVE).then_some(s)
    }

    /// ¿Es el nombre de un grupo Wi-Fi Direct (`DIRECT-xy-…`)?
    pub fn es_grupo_direct(ssid: &str) -> bool {
        let b = ssid.as_bytes();
        // «DIRECT-» + dos caracteres + «-» (+ nombre, que puede faltar).
        ssid.len() >= 10 && ssid.starts_with(PREFIJO_GRUPO) && b[7] != b'-' && b[8] != b'-' && b[9] == b'-' && ssid.len() <= 32 && logica::ssid_valido(ssid)
    }

    /// Un grupo que se puede crear: nombre y clave que pasan las mismas reglas que valida la web.
    pub fn grupo_valido(ssid: &str, clave: &str) -> bool {
        es_grupo_direct(ssid) && logica::clave_valida(clave)
    }

    /// La IP del dueño del grupo entre las IPv4 que tiene el equipo: la primera de `IPS_DUENO` que esté.
    pub fn ip_de_grupo(candidatas: &[Ipv4Addr]) -> Option<Ipv4Addr> {
        IPS_DUENO.iter().find(|ip| candidatas.contains(ip)).copied()
    }

    /// Dónde buscar al dueño del grupo al que nos unimos: su IP si la web la dio (y es de red local); si no, las
    /// habituales del dueño (Android y Windows).
    pub fn ips_a_probar(ip_ap: Option<&str>) -> Vec<Ipv4Addr> {
        match ip_ap.and_then(crate::malla_local_trama::ip_local) {
            Some(ip) => vec![ip],
            None => IPS_DUENO.to_vec(),
        }
    }

    /// Texto de una IPv4 de WinRT (`HostName.CanonicalName`) → IP, solo si es privada o de enlace local.
    pub fn ip_privada(texto: &str) -> Option<Ipv4Addr> {
        crate::malla_local_trama::ip_local(texto)
    }

    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    pub enum AccesoWifi {
        Concedido,
        Denegado,
        Desconocido,
    }

    /// Lo que se supo del equipo (lo calcula `enlace_wifi_windows` en un hilo aparte; aquí solo se interpreta).
    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    pub struct SondaWifi {
        /// Ya se miró (antes de eso no se anuncia nada).
        pub sondeado: bool,
        pub adaptadores: usize,
        pub acceso: AccesoWifi,
        /// La radio Wi-Fi está encendida.
        pub encendida: bool,
        /// El equipo está ahora conectado a un Wi-Fi de infraestructura (el de casa).
        pub con_wifi_de_casa: bool,
        /// Hay un adaptador distinto del que tiene la conexión de casa (el adaptador virtual de Wi-Fi Direct).
        pub adaptador_virtual: bool,
        pub desactivado: bool,
    }

    impl SondaWifi {
        pub fn sin_mirar(desactivado: bool) -> Self {
            SondaWifi { sondeado: false, adaptadores: 0, acceso: AccesoWifi::Desconocido, encendida: false, con_wifi_de_casa: false, adaptador_virtual: false, desactivado }
        }
    }

    /// Wi-Fi Direct de Windows convive con el Wi-Fi de infraestructura por el adaptador virtual: eso es lo que se
    /// anuncia (`concurrente`) mientras haya Wi-Fi encendido y no se haya visto lo contrario. Se confirma en aparato.
    pub fn concurrente(s: &SondaWifi) -> bool {
        s.sondeado && s.adaptadores > 0 && s.encendida && s.acceso != AccesoWifi::Denegado
    }

    /// Capacidades que ve la web (`enlace_wifi_capacidades`): roles `ap` (dueño del grupo) y `cliente`, el carril
    /// `wifi-direct` y, si conserva el Wi-Fi de casa, `wifi-direct-concurrente`.
    pub fn capacidades(s: &SondaWifi) -> CapacidadesWifi {
        let sin = |m: &str| logica::capacidades_sin_soporte("windows", m);
        if s.desactivado {
            return sin(&format!("Wi-Fi Direct apagado en esta instalación ({ENTORNO_SIN_WIFI_DIRECT})."));
        }
        if !s.sondeado {
            let mut c = sin("Comprobando el Wi-Fi Direct de este equipo…");
            c.permiso = "preguntar".into();
            return c;
        }
        if s.adaptadores == 0 {
            return sin("Este equipo no tiene adaptador Wi-Fi que admita Wi-Fi Direct.");
        }
        if s.acceso == AccesoWifi::Denegado {
            let mut c = sin("Windows no deja a StarSeed usar la radio Wi-Fi: actívalo en Configuración › Privacidad y seguridad (apps de escritorio).");
            c.permiso = "denegado".into();
            c.wifi = s.encendida;
            return c;
        }
        if !s.encendida {
            let mut c = sin("El Wi-Fi de este equipo está apagado: enciéndelo para abrir un enlace directo.");
            c.permiso = if s.acceso == AccesoWifi::Concedido { "concedido".into() } else { "preguntar".into() };
            return c;
        }
        let conc = concurrente(s);
        let mut lanas = vec![LANA_DIRECT.to_string()];
        if conc {
            lanas.push(LANA_DIRECT_CONCURRENTE.to_string());
        }
        let motivo = if conc && s.con_wifi_de_casa {
            "Wi-Fi Direct (dueño del grupo y cliente) por el adaptador virtual de Windows: el Wi-Fi de casa sigue conectado.".to_string()
        } else {
            "Wi-Fi Direct (dueño del grupo y cliente) por el adaptador virtual de Windows.".to_string()
        };
        CapacidadesWifi {
            plataforma: "windows".into(),
            ap: vec![METODO.into()],
            cliente: vec![METODO.into()],
            permiso: if s.acceso == AccesoWifi::Concedido { "concedido".into() } else { "preguntar".into() },
            radio_unica: !conc,
            wifi: s.encendida,
            motivo,
            lanas,
        }
    }

    // ───────── Estado que entiende la web (sin contraseña) ─────────

    #[derive(Clone, Debug, PartialEq, Eq)]
    pub enum Evento {
        AbriendoGrupo { sesion: String },
        GrupoListo { ssid: String, ip: Option<String> },
        Uniendo { sesion: String, ssid: String, ip_ap: Option<String> },
        Unida { ip_propia: String, ip_ap: Option<String> },
        Error { codigo: &'static str, mensaje: String },
        Cerrando,
        Cerrado { mensaje: String },
    }

    /// Aplica un evento al estado anterior. Nunca guarda la contraseña (no entra en ningún evento).
    pub fn aplicar(prev: &EstadoEnlaceWifi, ev: Evento, t: u64) -> EstadoEnlaceWifi {
        let mut e = prev.clone();
        e.t = t;
        match ev {
            Evento::AbriendoGrupo { sesion } => {
                e = EstadoEnlaceWifi { sesion: Some(sesion), fase: "abriendo".into(), rol: Some("ap".into()), metodo: Some(METODO.into()), t, ..Default::default() };
                e.mensaje = "Abriendo el grupo Wi-Fi Direct de este equipo (el Wi-Fi de casa se queda como está)…".into();
            }
            Evento::GrupoListo { ssid, ip } => {
                e.fase = "red-lista".into();
                e.ssid = Some(ssid);
                e.ip_ap = ip.clone();
                e.ip_propia = ip;
                e.codigo = None;
                e.mensaje = "Grupo Wi-Fi Direct abierto: esperando a la otra neurona.".into();
            }
            Evento::Uniendo { sesion, ssid, ip_ap } => {
                e = EstadoEnlaceWifi { sesion: Some(sesion), fase: "uniendo".into(), rol: Some("cliente".into()), metodo: Some(METODO.into()), ssid: Some(ssid), ip_ap, t, ..Default::default() };
                e.mensaje = "Uniéndose al grupo Wi-Fi Direct de la otra neurona (el Wi-Fi de casa se queda como está)…".into();
            }
            Evento::Unida { ip_propia, ip_ap } => {
                e.fase = "unida".into();
                e.ip_propia = Some(ip_propia);
                if ip_ap.is_some() {
                    e.ip_ap = ip_ap;
                }
                e.codigo = None;
                e.mensaje = "Dentro del grupo Wi-Fi Direct (sin router).".into();
            }
            Evento::Error { codigo, mensaje } => {
                e.fase = "error".into();
                e.codigo = Some(codigo.into());
                e.mensaje = mensaje;
            }
            Evento::Cerrando => {
                e.fase = "cerrando".into();
                e.mensaje = "Cerrando el enlace Wi-Fi Direct…".into();
            }
            Evento::Cerrado { mensaje } => {
                e.fase = "cerrado".into();
                e.ip_propia = None;
                e.mbps = None;
                e.mensaje = mensaje;
            }
        }
        e
    }

    /// Código de error del contrato a partir de un HRESULT de WinRT.
    pub fn codigo_de_hresult(hr: i32) -> &'static str {
        match hr as u32 {
            // E_ACCESSDENIED
            0x8007_0005 => "permiso-denegado",
            // E_NOTIMPL · ERROR_NOT_SUPPORTED · ERROR_CALL_NOT_IMPLEMENTED · E_NOINTERFACE
            0x8000_4001 | 0x8007_0032 | 0x8007_0078 | 0x8000_4002 => "sin-soporte",
            _ => "fallo-nativo",
        }
    }

    #[cfg(test)]
    mod pruebas {
        use super::*;

        fn sonda() -> SondaWifi {
            SondaWifi { sondeado: true, adaptadores: 2, acceso: AccesoWifi::Concedido, encendida: true, con_wifi_de_casa: true, adaptador_virtual: true, desactivado: false }
        }

        #[test]
        fn el_nombre_del_grupo_es_un_direct_valido() {
            for azar in [[0, 0], [61, 62], [255, 7], [130, 200]] {
                let n = nombre_grupo(azar);
                assert!(n.starts_with("DIRECT-") && n.ends_with("-StarSeed"), "{n}");
                assert_eq!(n.len(), "DIRECT-xy-StarSeed".len());
                assert!(es_grupo_direct(&n), "{n}");
                assert!(logica::ssid_valido(&n));
            }
            assert_eq!(nombre_grupo([0, 1]), "DIRECT-AB-StarSeed");
        }

        #[test]
        fn grupos_direct_reconocidos_y_no() {
            assert!(es_grupo_direct("DIRECT-ab-Android_1234"));
            assert!(es_grupo_direct("DIRECT-xy-StarSeed"));
            assert!(!es_grupo_direct("DIRECT-"));
            assert!(!es_grupo_direct("MiWifiDeCasa"));
            assert!(!es_grupo_direct("direct-ab-x"), "el prefijo exige mayúsculas, como el estándar");
            assert!(!es_grupo_direct("DIRECT-a\u{0007}-x"), "sin caracteres de control");
            assert!(!es_grupo_direct(&format!("DIRECT-ab-{}", "x".repeat(40))), "más de 32 bytes");
        }

        #[test]
        fn la_clave_son_16_alfanumericos_sin_sesgo() {
            let azar: Vec<u8> = (0..64u8).collect();
            let c = clave_de_azar(&azar).expect("alcanza");
            assert_eq!(c.len(), 16);
            assert!(c.chars().all(|x| x.is_ascii_alphanumeric()));
            assert!(logica::clave_valida(&c));
            // Los bytes ≥ 248 se descartan (sin sesgo): 16 de ellos no dan clave.
            assert_eq!(clave_de_azar(&[250u8; 16]), None);
            assert_eq!(clave_de_azar(&[1u8; 15]), None, "pocos bytes");
            // Mezcla: los descartados no cuentan.
            let mut v = vec![255u8; 5];
            v.extend((0..16u8).map(|i| i * 3));
            assert_eq!(clave_de_azar(&v).map(|c| c.len()), Some(16));
            // Determinista para los mismos bytes.
            assert_eq!(clave_de_azar(&azar), clave_de_azar(&azar));
        }

        #[test]
        fn grupo_valido_exige_nombre_y_clave() {
            assert!(grupo_valido("DIRECT-xy-StarSeed", "abcdEFGH12345678"));
            assert!(!grupo_valido("DIRECT-xy-StarSeed", "corta"));
            assert!(!grupo_valido("OtraRed", "abcdEFGH12345678"));
        }

        #[test]
        fn ip_del_grupo() {
            let a = Ipv4Addr::new(192, 168, 137, 1);
            let b = Ipv4Addr::new(192, 168, 49, 1);
            let casa = Ipv4Addr::new(192, 168, 1, 40);
            assert_eq!(ip_de_grupo(&[casa, a]), Some(a));
            assert_eq!(ip_de_grupo(&[b, casa]), Some(b));
            assert_eq!(ip_de_grupo(&[b, a]), Some(a), "Windows primero");
            assert_eq!(ip_de_grupo(&[casa]), None, "la IP de casa nunca se toma por la del grupo");
            assert_eq!(ip_de_grupo(&[]), None);
        }

        #[test]
        fn donde_buscar_al_dueno() {
            assert_eq!(ips_a_probar(Some("192.168.49.1")), vec![Ipv4Addr::new(192, 168, 49, 1)]);
            assert_eq!(ips_a_probar(None), IPS_DUENO.to_vec());
            assert_eq!(ips_a_probar(Some("8.8.8.8")), IPS_DUENO.to_vec(), "una IP pública no es de la red directa");
            assert_eq!(ips_a_probar(Some("basura")), IPS_DUENO.to_vec());
            assert_eq!(ip_privada("192.168.137.1"), Some(Ipv4Addr::new(192, 168, 137, 1)));
            assert_eq!(ip_privada("1.2.3.4"), None);
        }

        #[test]
        fn capacidades_con_wifi_direct() {
            let c = capacidades(&sonda());
            assert_eq!(c.plataforma, "windows");
            assert_eq!(c.ap, vec!["wifi-direct"]);
            assert_eq!(c.cliente, vec!["wifi-direct"]);
            assert_eq!(c.lanas, vec!["wifi-direct", "wifi-direct-concurrente"]);
            assert!(!c.radio_unica, "conserva el Wi-Fi de casa");
            assert_eq!(c.permiso, "concedido");
            assert!(c.wifi && c.motivo.contains("Wi-Fi de casa"));
            // Los métodos son los que la web ya valida.
            assert!(logica::metodo_ap_valido(&c.ap[0]) && logica::metodo_cliente_valido(&c.cliente[0]));
        }

        #[test]
        fn capacidades_sin_wifi_direct_dicen_por_que() {
            let apagado = capacidades(&SondaWifi { desactivado: true, ..sonda() });
            assert!(apagado.ap.is_empty() && apagado.cliente.is_empty() && apagado.lanas.is_empty());
            assert!(apagado.motivo.contains(ENTORNO_SIN_WIFI_DIRECT));
            let sin_mirar = capacidades(&SondaWifi::sin_mirar(false));
            assert!(sin_mirar.ap.is_empty());
            assert_eq!(sin_mirar.permiso, "preguntar");
            let sin_adaptador = capacidades(&SondaWifi { adaptadores: 0, ..sonda() });
            assert!(sin_adaptador.ap.is_empty() && sin_adaptador.motivo.contains("adaptador"));
            let denegado = capacidades(&SondaWifi { acceso: AccesoWifi::Denegado, ..sonda() });
            assert_eq!(denegado.permiso, "denegado");
            assert!(denegado.ap.is_empty() && denegado.motivo.contains("Privacidad"));
            let apagada = capacidades(&SondaWifi { encendida: false, ..sonda() });
            assert!(apagada.ap.is_empty() && apagada.cliente.is_empty() && apagada.motivo.contains("apagado"));
            assert!(apagada.lanas.is_empty(), "sin radio no hay carril ni concurrencia");
            assert!(!apagada.wifi);
        }

        #[test]
        fn el_json_de_capacidades_lleva_los_campos_de_siempre() {
            let j = serde_json::to_value(capacidades(&sonda())).unwrap();
            for k in ["plataforma", "ap", "cliente", "permiso", "radio_unica", "wifi", "motivo", "lanas"] {
                assert!(j.get(k).is_some(), "falta {k}");
            }
            assert_eq!(j["plataforma"], "windows");
        }

        #[test]
        fn estados_de_un_grupo_propio() {
            let t = 1000;
            let e0 = EstadoEnlaceWifi::default();
            let e1 = aplicar(&e0, Evento::AbriendoGrupo { sesion: "wfd-1".into() }, t);
            assert_eq!((e1.fase.as_str(), e1.rol.as_deref(), e1.metodo.as_deref()), ("abriendo", Some("ap"), Some("wifi-direct")));
            let e2 = aplicar(&e1, Evento::GrupoListo { ssid: "DIRECT-xy-StarSeed".into(), ip: Some("192.168.137.1".into()) }, t + 1);
            assert_eq!(e2.fase, "red-lista");
            assert_eq!(e2.sesion.as_deref(), Some("wfd-1"));
            assert_eq!(e2.ssid.as_deref(), Some("DIRECT-xy-StarSeed"));
            assert_eq!(e2.ip_ap.as_deref(), Some("192.168.137.1"));
            let e3 = aplicar(&e2, Evento::Cerrando, t + 2);
            assert_eq!(e3.fase, "cerrando");
            let e4 = aplicar(&e3, Evento::Cerrado { mensaje: "Enlace cerrado.".into() }, t + 3);
            assert_eq!((e4.fase.as_str(), e4.ip_propia.clone()), ("cerrado", None));
            assert_eq!(e4.t, t + 3);
        }

        #[test]
        fn estados_de_un_cliente_y_sus_errores() {
            let e0 = EstadoEnlaceWifi::default();
            let e1 = aplicar(&e0, Evento::Uniendo { sesion: "wfd-2".into(), ssid: "DIRECT-ab-Android".into(), ip_ap: Some("192.168.49.1".into()) }, 5);
            assert_eq!((e1.fase.as_str(), e1.rol.as_deref()), ("uniendo", Some("cliente")));
            let e2 = aplicar(&e1, Evento::Unida { ip_propia: "192.168.49.23".into(), ip_ap: None }, 6);
            assert_eq!(e2.fase, "unida");
            assert_eq!(e2.ip_propia.as_deref(), Some("192.168.49.23"));
            assert_eq!(e2.ip_ap.as_deref(), Some("192.168.49.1"), "no pisa la IP del dueño si no llega otra");
            let e3 = aplicar(&e1, Evento::Error { codigo: "no-encontrada", mensaje: "no aparece".into() }, 7);
            assert_eq!((e3.fase.as_str(), e3.codigo.as_deref()), ("error", Some("no-encontrada")));
        }

        #[test]
        fn el_estado_nunca_lleva_la_clave() {
            // Ningún evento recibe la contraseña, y el JSON del estado no tiene ningún campo para ella.
            let e = aplicar(&EstadoEnlaceWifi::default(), Evento::Uniendo { sesion: "s".into(), ssid: "DIRECT-ab-x".into(), ip_ap: None }, 1);
            let j = serde_json::to_string(&e).unwrap();
            assert!(!j.contains("clave") && !j.contains("pass") && !j.contains("contrase"));
        }

        #[test]
        fn codigos_de_error() {
            assert_eq!(codigo_de_hresult(0x8007_0005u32 as i32), "permiso-denegado");
            assert_eq!(codigo_de_hresult(0x8007_0032u32 as i32), "sin-soporte");
            assert_eq!(codigo_de_hresult(0x8000_4005u32 as i32), "fallo-nativo");
            for hr in [0x8007_0005u32, 0x8007_0032, 0x8000_4005] {
                assert!(["permiso-denegado", "sin-soporte", "fallo-nativo", "no-encontrada"].contains(&codigo_de_hresult(hr as i32)));
            }
        }
    }
}

// ─────────────────────────────── Proxy del WebView2 ───────────────────────────────

pub mod proxy {
    use std::net::{IpAddr, Ipv4Addr};

    /// Interruptor de emergencia: el mismo que ya apaga el proxy de la puerta en los demás sistemas.
    pub const ENTORNO_APAGADO: &str = "STARSEED_SIN_PROXY_PUERTA";
    /// Puerto FIJO de la pasarela local (127.0.0.1): WebView2 no tiene API de proxy en caliente, así que el
    /// proxy va en los argumentos del navegador al crear el entorno y NO puede cambiar de puerto después.
    pub const PUERTO_PASARELA: u16 = 47077;
    /// Variable de entorno de WebView2 con argumentos extra para el navegador. Vale para TODOS los webviews del
    /// proceso (la ventana principal y las de la app creadas después: WebView2 exige las mismas opciones a los que
    /// comparten carpeta de datos) y deja intactos los argumentos por defecto de wry.
    pub const VARIABLE_WEBVIEW2: &str = "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS";
    /// Direcciones que el navegador NUNCA manda por la pasarela: el servidor local de la propia app, `*.localhost`,
    /// las redes privadas y el enlace local (la red directa Wi-Fi Direct es una de ellas). `<-loopback>` quita la
    /// exclusión implícita de Chromium y las explícitas la vuelven a poner: así queda escrito, no sobrentendido.
    pub const EXCLUSIONES: [&str; 9] =
        ["<-loopback>", "localhost", "127.0.0.1", "[::1]", "*.localhost", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "169.254.0.0/16"];

    pub fn apagado(valor: Option<&str>) -> bool {
        super::ble::apagado(valor)
    }

    pub fn lista_exclusion() -> String {
        EXCLUSIONES.join(";")
    }

    /// Los argumentos de proxy del navegador de WebView2 (dos, separados por un espacio).
    pub fn argumentos_proxy(puerto: u16) -> String {
        format!("--proxy-server=http://127.0.0.1:{puerto} --proxy-bypass-list={}", lista_exclusion())
    }

    /// El valor que debe quedar en `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`: lo que la persona ya tuviera + la pasarela.
    /// `None` si ya trae su propio `--proxy-server` (no se pisa) o `--no-proxy-server`.
    pub fn valor_variable_webview2(actual: Option<&str>, puerto: u16) -> Option<String> {
        let previo = actual.map(str::trim).unwrap_or("");
        if previo.contains("--proxy-server") || previo.contains("--no-proxy-server") || previo.contains("--proxy-pac-url") {
            return None;
        }
        let ours = argumentos_proxy(puerto);
        Some(if previo.is_empty() { ours } else { format!("{previo} {ours}") })
    }

    // ───────── ¿Hay un proxy del sistema que no hay que pisar? ─────────

    /// Valor de `reg query … /v Nombre`: «    Nombre    REG_DWORD    0x1» o «… REG_SZ    http://…».
    pub fn valor_registro(salida: &str, nombre: &str) -> Option<String> {
        for linea in salida.lines() {
            let mut partes = linea.split_whitespace();
            if partes.next().is_some_and(|n| n.eq_ignore_ascii_case(nombre)) {
                let _tipo = partes.next()?;
                let resto: Vec<&str> = partes.collect();
                return Some(resto.join(" "));
            }
        }
        None
    }

    fn dword(texto: &str) -> Option<u32> {
        let t = texto.trim();
        match t.strip_prefix("0x").or_else(|| t.strip_prefix("0X")) {
            Some(h) => u32::from_str_radix(h, 16).ok(),
            None => t.parse().ok(),
        }
    }

    /// ¿La persona (o su empresa) configuró un proxy? Si sí, la pasarela NO se instala: forzar un proxy propio
    /// rompería su navegación (los proxies de empresa, las autenticaciones…). Cuenta: `ProxyEnable=1`, un
    /// `AutoConfigURL` (PAC) o las variables de proxy del entorno.
    pub fn proxy_configurado(proxy_enable: Option<&str>, auto_config: Option<&str>, entorno: &[(&str, &str)]) -> Option<&'static str> {
        if proxy_enable.and_then(dword).is_some_and(|v| v != 0) {
            return Some("tiene un proxy configurado en Windows");
        }
        if auto_config.is_some_and(|u| !u.trim().is_empty()) {
            return Some("tiene un script de proxy (PAC) configurado en Windows");
        }
        for (k, v) in entorno {
            let k = k.to_ascii_lowercase();
            if !v.trim().is_empty() && ["http_proxy", "https_proxy", "all_proxy"].contains(&k.as_str()) {
                return Some("tiene variables de proxy en el entorno");
            }
        }
        None
    }

    // ───────── Petición al proxy local ─────────

    #[derive(Clone, Debug, PartialEq, Eq)]
    pub enum Peticion {
        /// `CONNECT host:port` (HTTPS y cualquier túnel).
        Conectar { host: String, puerto: u16 },
        /// `GET http://host:port/ruta …` (HTTP plano).
        Http { host: String, puerto: u16, ruta: String },
    }

    #[derive(Clone, Debug, PartialEq, Eq)]
    pub enum Rechazo {
        Mal,
        Prohibido,
        NoSoportado,
    }

    /// El tope de la cabecera de una petición (más es un cliente roto o malicioso).
    pub const MAX_CABECERA: usize = 16 * 1024;

    /// Dónde acaba la cabecera (`\r\n\r\n`): el índice del primer byte después.
    pub fn fin_de_cabecera(b: &[u8]) -> Option<usize> {
        b.windows(4).position(|w| w == b"\r\n\r\n").map(|i| i + 4)
    }

    fn partir_host_puerto(t: &str, por_defecto: u16) -> Option<(String, u16)> {
        let t = t.trim();
        if t.is_empty() || t.contains(['/', '@', ' ']) {
            return None;
        }
        if let Some(r) = t.strip_prefix('[') {
            // IPv6 literal: [::1]:443
            let (ip, resto) = r.split_once(']')?;
            let puerto = match resto.strip_prefix(':') {
                Some(p) => p.parse().ok()?,
                None if resto.is_empty() => por_defecto,
                None => return None,
            };
            return Some((ip.to_string(), puerto)).filter(|(_, p)| *p != 0);
        }
        match t.rsplit_once(':') {
            Some((h, p)) if !h.contains(':') => {
                let p: u16 = p.parse().ok()?;
                (!h.is_empty() && p != 0).then(|| (h.to_string(), p))
            }
            Some(_) => None,
            None => Some((t.to_string(), por_defecto)),
        }
    }

    /// Analiza la primera línea de la petición. No acepta destinos locales (`destino_prohibido`).
    pub fn analizar_peticion(cabecera: &str) -> Result<Peticion, Rechazo> {
        analizar_peticion_con(cabecera, true)
    }

    /// Igual, con la opción de dejar pasar destinos locales (solo las pruebas de la pasarela, que hablan por 127.0.0.1).
    pub fn analizar_peticion_con(cabecera: &str, prohibir_locales: bool) -> Result<Peticion, Rechazo> {
        let linea = cabecera.lines().next().ok_or(Rechazo::Mal)?;
        let mut p = linea.split(' ');
        let (metodo, objetivo, version) = (p.next().ok_or(Rechazo::Mal)?, p.next().ok_or(Rechazo::Mal)?, p.next().ok_or(Rechazo::Mal)?);
        if !version.starts_with("HTTP/1.") || p.next().is_some() {
            return Err(Rechazo::Mal);
        }
        let peticion = if metodo.eq_ignore_ascii_case("CONNECT") {
            let (host, puerto) = partir_host_puerto(objetivo, 443).ok_or(Rechazo::Mal)?;
            Peticion::Conectar { host, puerto }
        } else {
            let resto = objetivo.strip_prefix("http://").ok_or(Rechazo::NoSoportado)?;
            let (autoridad, ruta) = match resto.find(['/', '?']) {
                Some(i) if resto.as_bytes()[i] == b'/' => (&resto[..i], resto[i..].to_string()),
                Some(i) => (&resto[..i], format!("/{}", &resto[i..])),
                None => (resto, "/".to_string()),
            };
            let (host, puerto) = partir_host_puerto(autoridad, 80).ok_or(Rechazo::Mal)?;
            Peticion::Http { host, puerto, ruta }
        };
        let (host, puerto) = match &peticion {
            Peticion::Conectar { host, puerto } | Peticion::Http { host, puerto, .. } => (host.as_str(), *puerto),
        };
        if (prohibir_locales && destino_prohibido(host)) || puerto == 0 {
            return Err(Rechazo::Prohibido);
        }
        Ok(peticion)
    }

    /// Reescribe la petición HTTP plana para hablar con el servidor de destino (forma de origen) y cerrar al acabar,
    /// o la deja con su URL completa para el siguiente proxy (`encadenada`). Sin `Proxy-Connection` ni
    /// `Proxy-Authorization`, y SIEMPRE con `Connection: close` (cada petición, su conexión).
    pub fn reescribir_http(cabecera: &str, ruta: &str, encadenada: bool) -> String {
        let mut lineas = cabecera.split("\r\n");
        let primera = lineas.next().unwrap_or_default();
        let mut p = primera.splitn(3, ' ');
        let metodo = p.next().unwrap_or("GET");
        let objetivo = p.next().unwrap_or("/");
        let version = p.next().unwrap_or("HTTP/1.1");
        let mut salida = format!("{metodo} {} {version}\r\n", if encadenada { objetivo } else { ruta });
        for l in lineas {
            if l.is_empty() {
                continue;
            }
            let nombre = l.split(':').next().unwrap_or("").trim().to_ascii_lowercase();
            if ["proxy-connection", "proxy-authorization", "connection", "keep-alive"].contains(&nombre.as_str()) {
                continue;
            }
            salida.push_str(l);
            salida.push_str("\r\n");
        }
        salida.push_str("Connection: close\r\n\r\n");
        salida
    }

    /// Loopback y sin dirección: la pasarela no es un puente hacia los servicios de este equipo.
    pub fn destino_prohibido(host: &str) -> bool {
        let h = host.trim_matches(['[', ']']).to_ascii_lowercase();
        if h == "localhost" || h.ends_with(".localhost") || h.is_empty() {
            return true;
        }
        match h.parse::<IpAddr>() {
            Ok(IpAddr::V4(ip)) => ip.is_loopback() || ip.is_unspecified(),
            Ok(IpAddr::V6(ip)) => ip.is_loopback() || ip.is_unspecified() || ip.to_ipv4_mapped().is_some_and(|v| v.is_loopback() || v.is_unspecified()),
            Err(_) => false,
        }
    }

    /// Redes privadas y de enlace local: siempre directas, aunque la puerta de internet esté abierta (el Android
    /// de la otra punta de un Wi-Fi Direct no es internet).
    pub fn destino_de_red_local(host: &str) -> bool {
        let h = host.trim_matches(['[', ']']);
        match h.parse::<IpAddr>() {
            Ok(IpAddr::V4(ip)) => ip.is_private() || ip.is_link_local() || ip.is_loopback(),
            Ok(IpAddr::V6(ip)) => ip.is_loopback() || (ip.segments()[0] & 0xffc0) == 0xfe80 || (ip.segments()[0] & 0xfe00) == 0xfc00,
            Err(_) => h.to_ascii_lowercase().ends_with(".local"),
        }
    }

    /// El puerto de la puerta de internet es uno que el Node local pudo abrir (no uno del sistema ni el nuestro).
    pub fn puerto_de_puerta_valido(p: u16) -> bool {
        p >= 1024 && p != PUERTO_PASARELA
    }

    /// Dirección del Node local de la puerta.
    pub fn direccion_puerta(p: u16) -> (Ipv4Addr, u16) {
        (Ipv4Addr::LOCALHOST, p)
    }

    /// La petición `CONNECT` que la pasarela manda al proxy de la puerta (sin autenticación: es local).
    pub fn conectar_encadenado(host: &str, puerto: u16) -> String {
        let h = if host.contains(':') { format!("[{host}]") } else { host.to_string() };
        format!("CONNECT {h}:{puerto} HTTP/1.1\r\nHost: {h}:{puerto}\r\n\r\n")
    }

    /// ¿La respuesta del proxy de la puerta a un CONNECT es un éxito (2xx)?
    pub fn conectar_aceptado(respuesta: &str) -> bool {
        respuesta.lines().next().and_then(|l| l.split(' ').nth(1)).is_some_and(|c| c.starts_with('2') && c.len() == 3)
    }

    #[cfg(test)]
    mod pruebas {
        use super::*;

        #[test]
        fn argumentos_con_y_sin_pasarela() {
            let a = argumentos_proxy(47077);
            assert!(a.starts_with("--proxy-server=http://127.0.0.1:47077 "));
            assert!(a.contains("--proxy-bypass-list=<-loopback>;localhost;127.0.0.1;[::1];*.localhost;10.0.0.0/8;172.16.0.0/12;192.168.0.0/16;169.254.0.0/16"));
            // Exactamente dos argumentos, en una línea (los espacios solo separan argumentos).
            assert!(!a.contains('\n') && a.split(' ').count() == 2);
            assert_eq!(valor_variable_webview2(None, 47077).as_deref(), Some(a.as_str()));
            assert_eq!(valor_variable_webview2(Some("  "), 47077).as_deref(), Some(a.as_str()));
        }

        #[test]
        fn la_variable_de_webview2_conserva_lo_que_ya_habia() {
            let v = valor_variable_webview2(Some("--enable-features=Foo"), 47077).unwrap();
            assert!(v.starts_with("--enable-features=Foo --proxy-server=http://127.0.0.1:47077"));
            // Un proxy ya elegido por la persona no se pisa.
            assert_eq!(valor_variable_webview2(Some("--proxy-server=http://mi:3128"), 47077), None);
            assert_eq!(valor_variable_webview2(Some("--no-proxy-server"), 47077), None);
            assert_eq!(valor_variable_webview2(Some("--proxy-pac-url=http://pac"), 47077), None);
        }

        #[test]
        fn la_lista_de_exclusion_cubre_el_bucle_local_y_la_red_directa() {
            let l = lista_exclusion();
            for x in ["localhost", "127.0.0.1", "*.localhost", "192.168.0.0/16"] {
                assert!(l.split(';').any(|e| e == x), "{x}");
            }
            // 192.168.137.x (Windows) y 192.168.49.x (Android) caen en 192.168.0.0/16.
            assert!(EXCLUSIONES.contains(&"192.168.0.0/16"));
        }

        #[test]
        fn proxy_del_sistema_se_respeta() {
            assert_eq!(proxy_configurado(Some("0x0"), Some(""), &[]), None);
            assert_eq!(proxy_configurado(None, None, &[]), None);
            assert!(proxy_configurado(Some("0x1"), None, &[]).is_some());
            assert!(proxy_configurado(Some("1"), None, &[]).is_some());
            assert!(proxy_configurado(Some("0x0"), Some("http://pac.empresa/proxy.pac"), &[]).unwrap().contains("PAC"));
            assert!(proxy_configurado(None, None, &[("HTTPS_PROXY", "http://p:3128")]).is_some());
            assert_eq!(proxy_configurado(None, None, &[("HTTPS_PROXY", " ")]), None);
            assert_eq!(proxy_configurado(None, None, &[("PATH", "x")]), None);
        }

        #[test]
        fn lee_la_salida_de_reg_query() {
            let s = "\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings\r\n    ProxyEnable    REG_DWORD    0x1\r\n    AutoConfigURL    REG_SZ    http://pac.local/wpad.dat\r\n";
            assert_eq!(valor_registro(s, "ProxyEnable").as_deref(), Some("0x1"));
            assert_eq!(valor_registro(s, "AutoConfigURL").as_deref(), Some("http://pac.local/wpad.dat"));
            assert_eq!(valor_registro(s, "ProxyServer"), None);
            assert_eq!(valor_registro("", "ProxyEnable"), None);
        }

        #[test]
        fn analiza_connect() {
            assert_eq!(analizar_peticion("CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\n\r\n"), Ok(Peticion::Conectar { host: "example.com".into(), puerto: 443 }));
            assert_eq!(analizar_peticion("CONNECT [2001:db8::1]:8443 HTTP/1.1\r\n\r\n"), Ok(Peticion::Conectar { host: "2001:db8::1".into(), puerto: 8443 }));
            assert_eq!(analizar_peticion("CONNECT example.com HTTP/1.1\r\n\r\n"), Ok(Peticion::Conectar { host: "example.com".into(), puerto: 443 }));
        }

        #[test]
        fn analiza_http_plano() {
            assert_eq!(
                analizar_peticion("GET http://example.com/a/b?x=1 HTTP/1.1\r\nHost: example.com\r\n\r\n"),
                Ok(Peticion::Http { host: "example.com".into(), puerto: 80, ruta: "/a/b?x=1".into() })
            );
            assert_eq!(
                analizar_peticion("POST http://example.com:8080 HTTP/1.1\r\n\r\n"),
                Ok(Peticion::Http { host: "example.com".into(), puerto: 8080, ruta: "/".into() })
            );
            assert_eq!(analizar_peticion("GET http://example.com?q=1 HTTP/1.1\r\n\r\n"), Ok(Peticion::Http { host: "example.com".into(), puerto: 80, ruta: "/?q=1".into() }));
        }

        #[test]
        fn rechaza_lo_raro() {
            assert_eq!(analizar_peticion(""), Err(Rechazo::Mal));
            assert_eq!(analizar_peticion("CONNECT\r\n\r\n"), Err(Rechazo::Mal));
            assert_eq!(analizar_peticion("GET / HTTP/1.1\r\n\r\n"), Err(Rechazo::NoSoportado), "forma de origen: no es una petición de proxy");
            assert_eq!(analizar_peticion("GET ftp://x/ HTTP/1.1\r\n\r\n"), Err(Rechazo::NoSoportado));
            assert_eq!(analizar_peticion("CONNECT a:b:c HTTP/1.1\r\n\r\n"), Err(Rechazo::Mal));
            assert_eq!(analizar_peticion("CONNECT a:0 HTTP/1.1\r\n\r\n"), Err(Rechazo::Mal));
            assert_eq!(analizar_peticion("CONNECT a:99999 HTTP/1.1\r\n\r\n"), Err(Rechazo::Mal));
            assert_eq!(analizar_peticion("CONNECT user@host:443 HTTP/1.1\r\n\r\n"), Err(Rechazo::Mal));
            assert_eq!(analizar_peticion("GET http://x/ SPDY/3\r\n\r\n"), Err(Rechazo::Mal));
            assert_eq!(analizar_peticion("GET http://x/ HTTP/1.1 extra\r\n\r\n"), Err(Rechazo::Mal));
        }

        #[test]
        fn no_es_un_puente_a_este_equipo() {
            for h in ["localhost", "127.0.0.1", "127.1.2.3", "0.0.0.0", "[::1]", "::1", "foo.localhost", "::ffff:127.0.0.1"] {
                assert!(destino_prohibido(h), "{h}");
            }
            for h in ["example.com", "8.8.8.8", "192.168.1.5", "10.0.0.1", "2001:db8::1"] {
                assert!(!destino_prohibido(h), "{h}");
            }
            assert_eq!(analizar_peticion("CONNECT 127.0.0.1:47071 HTTP/1.1\r\n\r\n"), Err(Rechazo::Prohibido));
            assert_eq!(analizar_peticion("GET http://localhost:4761/ HTTP/1.1\r\n\r\n"), Err(Rechazo::Prohibido));
        }

        #[test]
        fn red_local_siempre_directa() {
            for h in ["192.168.49.1", "192.168.137.1", "10.1.2.3", "172.16.0.9", "169.254.1.1", "fe80::1", "fd00::1", "impresora.local"] {
                assert!(destino_de_red_local(h), "{h}");
            }
            for h in ["8.8.8.8", "example.com", "2001:db8::1", "172.32.0.1"] {
                assert!(!destino_de_red_local(h), "{h}");
            }
        }

        #[test]
        fn reescribe_http_para_el_destino_y_para_el_siguiente_proxy() {
            let c = "GET http://example.com/a?b=1 HTTP/1.1\r\nHost: example.com\r\nProxy-Connection: keep-alive\r\nConnection: keep-alive\r\nAccept: */*\r\n\r\n";
            let directa = reescribir_http(c, "/a?b=1", false);
            assert!(directa.starts_with("GET /a?b=1 HTTP/1.1\r\n"));
            assert!(directa.contains("Host: example.com\r\n") && directa.contains("Accept: */*\r\n"));
            assert!(!directa.to_ascii_lowercase().contains("proxy-connection") && !directa.contains("keep-alive"));
            assert!(directa.ends_with("Connection: close\r\n\r\n"));
            assert_eq!(directa.matches("\r\n\r\n").count(), 1);
            let encadenada = reescribir_http(c, "/a?b=1", true);
            assert!(encadenada.starts_with("GET http://example.com/a?b=1 HTTP/1.1\r\n"), "el siguiente proxy necesita la URL completa");
            assert!(encadenada.ends_with("Connection: close\r\n\r\n"));
        }

        #[test]
        fn cabecera_completa() {
            assert_eq!(fin_de_cabecera(b"GET / HTTP/1.1\r\nA: b\r\n\r\nresto"), Some(24));
            assert_eq!(fin_de_cabecera(b"GET / HTTP/1.1\r\nA: b\r\n"), None);
        }

        #[test]
        fn encadenado_a_la_puerta() {
            assert_eq!(conectar_encadenado("example.com", 443), "CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\n\r\n");
            assert!(conectar_encadenado("2001:db8::1", 443).starts_with("CONNECT [2001:db8::1]:443 "));
            assert!(conectar_aceptado("HTTP/1.1 200 Connection Established\r\n\r\n"));
            assert!(conectar_aceptado("HTTP/1.0 200 OK\r\n"));
            assert!(!conectar_aceptado("HTTP/1.1 502 Bad Gateway\r\n"));
            assert!(!conectar_aceptado(""));
            assert!(!conectar_aceptado("HTTP/1.1 2000 raro\r\n"));
        }

        #[test]
        fn puertos_de_la_puerta() {
            assert!(puerto_de_puerta_valido_ok());
            assert!(!puerto_de_puerta_valido(PUERTO_PASARELA));
            assert!(!puerto_de_puerta_valido(80));
            assert_eq!(direccion_puerta(50123), (Ipv4Addr::LOCALHOST, 50123));
        }

        fn puerto_de_puerta_valido_ok() -> bool {
            puerto_de_puerta_valido(50123)
        }
        fn puerto_de_puerta_valido(p: u16) -> bool {
            super::puerto_de_puerta_valido(p)
        }
    }
}
