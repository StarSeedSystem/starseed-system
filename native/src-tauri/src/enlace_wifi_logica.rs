// ═══════════════════════════════════════════════════════════════════════════
// enlace_wifi_logica — lo PURO del enlace Wi-Fi directo entre neuronas (WFD1108A, 2026-11-08).
// Contrato: architecture/wifi-directo.md. Solo std + serde: se prueba en cualquier sistema.
// ---------------------------------------------------------------------------
// La negociación (quién levanta la red, oferta, respuesta, credenciales cifradas, cierre) vive en la
// web (src/lib/malla/enlace-wifi-directo.ts). Aquí está lo que la parte nativa necesita:
//   · las CAPACIDADES de este aparato (Android: punto de acceso local y Wi-Fi Direct; macOS: unirse con
//     CoreWLAN o guiar a la persona; el resto: nada todavía);
//   · los archivos que se cruzan con Kotlin en filesDir/starseed/enlace-wifi (peticion.json, estado.json,
//     puente.json, credenciales.json), con la MISMA forma que lee y escribe EnlaceWifiDirecto.kt;
//   · validar SSID, contraseña WPA2, sesión e IP antes de tocar la radio;
//   · leer la autorización de Ubicación del Mac (CoreWLAN no da nombres de red sin ella desde macOS 14).
// La contraseña NUNCA va en estado.json ni en el estado que se devuelve a la web: solo en
// credenciales.json (del punto de acceso, privado de la app) y en la petición de unirse (Kotlin la borra
// al leerla). Nada de esto se guarda en la cuenta ni se registra.
// ═══════════════════════════════════════════════════════════════════════════

#![cfg_attr(not(any(target_os = "android", target_os = "macos")), allow(dead_code))]

use serde::{Deserialize, Serialize};
use std::net::Ipv4Addr;
use std::path::Path;

pub const CARPETA_ANDROID: &str = "enlace-wifi";
pub const PETICION: &str = "peticion.json";
pub const ESTADO: &str = "estado.json";
pub const PUENTE: &str = "puente.json";
pub const CREDENCIALES: &str = "credenciales.json";
/// Acciones que Rust pide a Kotlin (EnlaceWifiDirecto.kt las atiende todas).
pub const ACCIONES: [&str; 4] = ["abrir-ap", "unirse", "cerrar", "permiso"];
/// Evento que recibe la web cuando cambia el estado nativo.
pub const EVENTO: &str = "enlace-wifi://estado";
/// El canal TCP de la app (malla_local.rs) corre igual sobre la red nueva.
pub const PUERTO_CANAL: u16 = 47071;

pub const METODOS_AP: [&str; 2] = ["hotspot-local", "wifi-direct"];
pub const METODOS_CLIENTE: [&str; 3] = ["wifi-direct", "corewlan", "guiado"];

// ─────────────────────────────── Tipos ───────────────────────────────

/// Lo que dice la parte nativa (la web lo lee con `enlace_wifi_estado`). Sin contraseña.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct EstadoEnlaceWifi {
    #[serde(default)]
    pub sesion: Option<String>,
    /// inactivo | abriendo | red-lista | uniendo | guiado | unida | cerrando | cerrado | error
    #[serde(default = "fase_inactiva")]
    pub fase: String,
    /// «ap» | «cliente»
    #[serde(default)]
    pub rol: Option<String>,
    #[serde(default)]
    pub metodo: Option<String>,
    #[serde(default)]
    pub ssid: Option<String>,
    /// IP de ESTE aparato en la red directa.
    #[serde(default)]
    pub ip_propia: Option<String>,
    /// IP del punto de acceso en la red directa.
    #[serde(default)]
    pub ip_ap: Option<String>,
    #[serde(default)]
    pub banda: Option<String>,
    /// Velocidad de la radio que dice el sistema (Mb/s), si la dice.
    #[serde(default)]
    pub mbps: Option<f64>,
    /// permiso-denegado | sin-soporte | fallo-nativo | no-encontrada (solo con fase «error»).
    #[serde(default)]
    pub codigo: Option<String>,
    #[serde(default)]
    pub mensaje: String,
    /// La red Wi-Fi de antes (Mac): a la que se vuelve al cerrar. Solo el nombre.
    #[serde(default)]
    pub red_anterior: Option<String>,
    #[serde(default)]
    pub t: u64,
}

fn fase_inactiva() -> String {
    "inactivo".into()
}

impl Default for EstadoEnlaceWifi {
    fn default() -> Self {
        EstadoEnlaceWifi {
            sesion: None,
            fase: fase_inactiva(),
            rol: None,
            metodo: None,
            ssid: None,
            ip_propia: None,
            ip_ap: None,
            banda: None,
            mbps: None,
            codigo: None,
            mensaje: String::new(),
            red_anterior: None,
            t: 0,
        }
    }
}

/// Capacidades de este aparato (la web las manda en la oferta y la respuesta).
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct CapacidadesWifi {
    /// android | macos | ios | windows | linux
    pub plataforma: String,
    pub ap: Vec<String>,
    pub cliente: Vec<String>,
    /// concedido | preguntar | denegado | no-aplica
    pub permiso: String,
    /// Unirse a otra red deja la red Wi-Fi actual (una sola radio).
    pub radio_unica: bool,
    pub wifi: bool,
    /// Por qué puede o no puede (para Ajustes).
    pub motivo: String,
}

/// Credenciales del punto de acceso (solo del punto de acceso a la web, una vez, para cifrarlas).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct CredencialesNativas {
    pub ssid: String,
    pub clave: String,
    #[serde(default)]
    pub banda: Option<String>,
    #[serde(default)]
    pub ip: Option<String>,
}

/// Lo que Kotlin escribe al arrancar y al volver a la app (`puente.json`).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct PuenteAndroid {
    #[serde(default)]
    pub version: u32,
    #[serde(default)]
    pub sdk: u32,
    /// El aparato tiene Wi-Fi Direct (FEATURE_WIFI_DIRECT).
    #[serde(default)]
    pub p2p: bool,
    /// Punto de acceso local (Android 8+).
    #[serde(default)]
    pub hotspot_local: bool,
    /// Unirse a un grupo Wi-Fi Direct con sus credenciales, sin preguntar (Android 10+).
    #[serde(default)]
    pub cliente_p2p: bool,
    /// concedido | preguntar | denegado
    #[serde(default)]
    pub permiso: String,
    #[serde(default)]
    pub wifi: bool,
}

/// Autorización de Ubicación de macOS (`CLAuthorizationStatus`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Ubicacion {
    SinPreguntar,
    Concedida,
    Denegada,
}

/// `CLAuthorizationStatus`: 0 sin decidir, 1 restringida, 2 denegada, 3 siempre, 4 al usarla.
pub fn ubicacion_de(status: i64) -> Ubicacion {
    match status {
        3 | 4 => Ubicacion::Concedida,
        1 | 2 => Ubicacion::Denegada,
        _ => Ubicacion::SinPreguntar,
    }
}

// ─────────────────────────────── Capacidades ───────────────────────────────

fn v(x: &[&str]) -> Vec<String> {
    x.iter().map(|s| s.to_string()).collect()
}

/// Android: lo que dijo Kotlin. Sin `puente.json`, este APK no trae el enlace Wi-Fi directo.
pub fn capacidades_android(p: Option<&PuenteAndroid>) -> CapacidadesWifi {
    let Some(p) = p else {
        return capacidades_sin_soporte("android", "Este APK no trae el enlace Wi-Fi directo (llegó con WFD1108A): actualízalo.");
    };
    let mut ap = Vec::new();
    // Entre dos Android, Wi-Fi Direct primero (conservan su Wi-Fi); para un Mac, el punto de acceso local.
    if p.hotspot_local {
        ap.push("hotspot-local".to_string());
    }
    if p.p2p {
        ap.push("wifi-direct".to_string());
    }
    let cliente = if p.cliente_p2p && p.p2p { v(&["wifi-direct"]) } else { Vec::new() };
    let permiso = match p.permiso.as_str() {
        "concedido" | "denegado" => p.permiso.clone(),
        _ => "preguntar".to_string(),
    };
    let motivo = if ap.is_empty() && cliente.is_empty() {
        "Este Android no puede levantar ni unirse a una red directa (Android 8 o posterior y Wi-Fi Direct).".to_string()
    } else if permiso == "denegado" {
        "Android no dio «Dispositivos cercanos» (o «Ubicación» en Android 12 o anterior): concédelo en los ajustes de la app.".to_string()
    } else if !p.wifi {
        "El Wi-Fi está apagado: enciéndelo para abrir un enlace directo.".to_string()
    } else {
        "Puede levantar la red directa (punto de acceso local o Wi-Fi Direct) y conserva su Wi-Fi de casa.".to_string()
    };
    CapacidadesWifi { plataforma: "android".into(), ap, cliente, permiso, radio_unica: false, wifi: p.wifi, motivo }
}

/// macOS: no levanta redes (sin Wi-Fi Direct ni API de punto de acceso); se une con CoreWLAN si hay
/// Ubicación (desde macOS 14 CoreWLAN no da nombres de red sin ella) y, si no, guía a la persona.
pub fn capacidades_macos(corewlan: bool, ubicacion: Ubicacion, wifi: bool) -> CapacidadesWifi {
    let mut cliente = Vec::new();
    if corewlan && ubicacion != Ubicacion::Denegada {
        cliente.push("corewlan".to_string());
    }
    cliente.push("guiado".to_string());
    let (permiso, motivo) = match (corewlan, ubicacion) {
        (true, Ubicacion::Concedida) => ("concedido", "Se une solo a la red del Android con CoreWLAN y vuelve a tu red al cerrar."),
        (true, Ubicacion::SinPreguntar) => ("preguntar", "macOS pedirá «Ubicación» la primera vez: sin ella CoreWLAN no ve los nombres de red y tendrías que unirte a mano."),
        (true, Ubicacion::Denegada) => ("concedido", "Sin «Ubicación» para StarSeed, te unes a mano a la red que se enseña (Ajustes del Sistema › Privacidad › Localización para hacerlo solo)."),
        (false, _) => ("concedido", "CoreWLAN no está disponible: te unes a mano a la red que se enseña."),
    };
    CapacidadesWifi {
        plataforma: "macos".into(),
        ap: Vec::new(),
        cliente,
        permiso: permiso.into(),
        radio_unica: true,
        wifi,
        motivo: motivo.into(),
    }
}

pub fn capacidades_sin_soporte(plataforma: &str, motivo: &str) -> CapacidadesWifi {
    CapacidadesWifi {
        plataforma: plataforma.into(),
        ap: Vec::new(),
        cliente: Vec::new(),
        permiso: "no-aplica".into(),
        radio_unica: false,
        wifi: false,
        motivo: motivo.into(),
    }
}

// ─────────────────────────────── Validación ───────────────────────────────

/// SSID de 1 a 32 bytes sin caracteres de control. Espejo de `ssidValido` (TS).
pub fn ssid_valido(s: &str) -> bool {
    !s.is_empty() && s.len() <= 32 && !s.chars().any(|c| c.is_control())
}

/// Contraseña WPA2: 8 a 63 caracteres ASCII imprimibles. Espejo de `claveValida` (TS).
pub fn clave_valida(s: &str) -> bool {
    (8..=63).contains(&s.len()) && s.bytes().all(|b| (0x20..=0x7e).contains(&b))
}

/// Sesión: 1 a 64 caracteres [A-Za-z0-9_-] (la crea la web: «wfd-…»).
pub fn sesion_valida(s: &str) -> bool {
    !s.is_empty() && s.len() <= 64 && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

pub fn metodo_ap_valido(m: &str) -> bool {
    METODOS_AP.contains(&m)
}

pub fn metodo_cliente_valido(m: &str) -> bool {
    METODOS_CLIENTE.contains(&m)
}

/// ¿Están en la misma /24? (la red directa de Android es una /24: 192.168.49.x, 192.168.43.x…).
pub fn misma_subred(a: Ipv4Addr, b: Ipv4Addr) -> bool {
    a.octets()[..3] == b.octets()[..3]
}

/// Banda por la frecuencia (MHz) que dice el sistema.
pub fn banda_de_frecuencia(mhz: u32) -> Option<&'static str> {
    match mhz {
        2400..=2500 => Some("2.4"),
        4900..=5900 => Some("5"),
        5925..=7125 => Some("6"),
        _ => None,
    }
}

/// Banda de CoreWLAN (`CWChannelBand`: 1 = 2 GHz, 2 = 5 GHz, 3 = 6 GHz).
pub fn banda_de_corewlan(b: i64) -> Option<&'static str> {
    match b {
        1 => Some("2.4"),
        2 => Some("5"),
        3 => Some("6"),
        _ => None,
    }
}

// ─────────────────────────────── Peticiones a Kotlin ───────────────────────────────

pub fn peticion_abrir_ap(sesion: &str, metodo: &str, t: u64) -> Result<String, String> {
    if !sesion_valida(sesion) {
        return Err("Sesión no válida.".into());
    }
    if !metodo_ap_valido(metodo) {
        return Err(format!("Método de punto de acceso desconocido: «{metodo}»."));
    }
    Ok(serde_json::json!({ "accion": "abrir-ap", "sesion": sesion, "metodo": metodo, "t": t }).to_string())
}

/// La petición de unirse lleva la contraseña: solo vive en la carpeta privada de la app y Kotlin la
/// borra en cuanto la lee.
pub fn peticion_unirse(sesion: &str, metodo: &str, ssid: &str, clave: &str, ip_ap: Option<&str>, t: u64) -> Result<String, String> {
    if !sesion_valida(sesion) {
        return Err("Sesión no válida.".into());
    }
    if metodo != "wifi-direct" {
        return Err("Android solo se une sin preguntar a un grupo Wi-Fi Direct.".into());
    }
    if !ssid_valido(ssid) || !clave_valida(clave) {
        return Err("El nombre o la contraseña de la red no son válidos: no se toca la radio.".into());
    }
    let ip = ip_ap.and_then(crate::malla_local_trama::ip_local).map(|i| i.to_string());
    Ok(serde_json::json!({ "accion": "unirse", "sesion": sesion, "metodo": metodo, "ssid": ssid, "clave": clave, "ip_ap": ip, "t": t }).to_string())
}

pub fn peticion_cerrar(sesion: &str, t: u64) -> Result<String, String> {
    if !sesion_valida(sesion) {
        return Err("Sesión no válida.".into());
    }
    Ok(serde_json::json!({ "accion": "cerrar", "sesion": sesion, "t": t }).to_string())
}

pub fn peticion_permiso(t: u64) -> String {
    serde_json::json!({ "accion": "permiso", "t": t }).to_string()
}

// ─────────────────────────────── Archivos ───────────────────────────────

pub fn escribir_atomico(dir: &Path, nombre: &str, texto: &str) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let tmp = dir.join(format!("{nombre}.tmp"));
    std::fs::write(&tmp, texto).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, dir.join(nombre)).map_err(|e| e.to_string())
}

/// Lo último que escribió Kotlin (o «inactivo» si nada). Nunca devuelve la contraseña: estado.json no la
/// lleva, y si alguien la metiera, `clave` no es un campo del estado y se ignora.
pub fn leer_estado(dir: &Path) -> EstadoEnlaceWifi {
    std::fs::read_to_string(dir.join(ESTADO))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

pub fn leer_puente(dir: &Path) -> Option<PuenteAndroid> {
    std::fs::read_to_string(dir.join(PUENTE)).ok().and_then(|t| serde_json::from_str(&t).ok())
}

/// Las credenciales del punto de acceso de ESA sesión (y válidas); si no, None.
pub fn leer_credenciales(dir: &Path, sesion: &str) -> Option<CredencialesNativas> {
    #[derive(Deserialize)]
    struct ConSesion {
        sesion: String,
        #[serde(flatten)]
        c: CredencialesNativas,
    }
    let t = std::fs::read_to_string(dir.join(CREDENCIALES)).ok()?;
    let x: ConSesion = serde_json::from_str(&t).ok()?;
    if x.sesion != sesion || !ssid_valido(&x.c.ssid) || !clave_valida(&x.c.clave) {
        return None;
    }
    let ip = x.c.ip.as_deref().and_then(crate::malla_local_trama::ip_local).map(|i| i.to_string());
    Some(CredencialesNativas { ip, ..x.c })
}

/// Estado de error (sin tocar la radio) para devolver a la web.
pub fn estado_error(sesion: Option<&str>, codigo: &str, mensaje: &str, t: u64) -> EstadoEnlaceWifi {
    EstadoEnlaceWifi {
        sesion: sesion.map(|s| s.to_string()),
        fase: "error".into(),
        codigo: Some(codigo.into()),
        mensaje: mensaje.into(),
        t,
        ..Default::default()
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn dir(n: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("ss-wfd-{n}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        d
    }

    #[test]
    fn android_dice_lo_que_puede() {
        let sin = capacidades_android(None);
        assert!(sin.ap.is_empty() && sin.cliente.is_empty() && sin.permiso == "no-aplica");
        let p = PuenteAndroid { version: 1, sdk: 34, p2p: true, hotspot_local: true, cliente_p2p: true, permiso: "concedido".into(), wifi: true };
        let c = capacidades_android(Some(&p));
        assert_eq!(c.ap, vec!["hotspot-local", "wifi-direct"]);
        assert_eq!(c.cliente, vec!["wifi-direct"]);
        assert!(!c.radio_unica && c.wifi && c.permiso == "concedido");
        // Android 9: sin unirse por credenciales.
        let viejo = capacidades_android(Some(&PuenteAndroid { sdk: 28, cliente_p2p: false, ..p.clone() }));
        assert!(viejo.cliente.is_empty() && !viejo.ap.is_empty());
        // Permiso raro → «preguntar»; denegado se dice.
        assert_eq!(capacidades_android(Some(&PuenteAndroid { permiso: "x".into(), ..p.clone() })).permiso, "preguntar");
        assert!(capacidades_android(Some(&PuenteAndroid { permiso: "denegado".into(), ..p })).motivo.contains("Dispositivos cercanos"));
    }

    #[test]
    fn el_mac_se_une_o_guia_y_nunca_levanta_red() {
        let c = capacidades_macos(true, Ubicacion::Concedida, true);
        assert!(c.ap.is_empty());
        assert_eq!(c.cliente, vec!["corewlan", "guiado"]);
        assert!(c.radio_unica && c.permiso == "concedido");
        assert_eq!(capacidades_macos(true, Ubicacion::SinPreguntar, true).permiso, "preguntar");
        // Sin Ubicación queda la vía guiada (y el Mac sigue pudiendo tomar parte).
        let d = capacidades_macos(true, Ubicacion::Denegada, true);
        assert_eq!(d.cliente, vec!["guiado"]);
        assert_ne!(d.permiso, "denegado");
        assert_eq!(capacidades_macos(false, Ubicacion::Concedida, true).cliente, vec!["guiado"]);
    }

    #[test]
    fn ubicacion_de_corelocation() {
        assert_eq!(ubicacion_de(0), Ubicacion::SinPreguntar);
        assert_eq!(ubicacion_de(1), Ubicacion::Denegada);
        assert_eq!(ubicacion_de(2), Ubicacion::Denegada);
        assert_eq!(ubicacion_de(3), Ubicacion::Concedida);
        assert_eq!(ubicacion_de(4), Ubicacion::Concedida);
        assert_eq!(ubicacion_de(99), Ubicacion::SinPreguntar);
    }

    #[test]
    fn valida_como_la_web() {
        assert!(ssid_valido("StarSeed-ab12"));
        assert!(ssid_valido("DIRECT-xy-StarSeed"));
        assert!(!ssid_valido(""));
        assert!(!ssid_valido(&"a".repeat(33)));
        assert!(!ssid_valido("con\nsalto"));
        assert!(clave_valida("12345678"));
        assert!(!clave_valida("1234567"));
        assert!(!clave_valida(&"x".repeat(64)));
        assert!(!clave_valida("ñandú-123"));
        assert!(sesion_valida("wfd-0a1b2c"));
        assert!(!sesion_valida("../etc"));
        assert!(!sesion_valida(""));
        assert!(metodo_ap_valido("hotspot-local") && !metodo_ap_valido("x"));
        assert!(metodo_cliente_valido("corewlan") && !metodo_cliente_valido("x"));
    }

    #[test]
    fn subred_y_bandas() {
        assert!(misma_subred(Ipv4Addr::new(192, 168, 49, 1), Ipv4Addr::new(192, 168, 49, 23)));
        assert!(!misma_subred(Ipv4Addr::new(192, 168, 49, 1), Ipv4Addr::new(192, 168, 1, 23)));
        assert_eq!(banda_de_frecuencia(2437), Some("2.4"));
        assert_eq!(banda_de_frecuencia(5180), Some("5"));
        assert_eq!(banda_de_frecuencia(5955), Some("6"));
        assert_eq!(banda_de_frecuencia(0), None);
        assert_eq!(banda_de_corewlan(2), Some("5"));
        assert_eq!(banda_de_corewlan(0), None);
    }

    #[test]
    fn peticiones_validadas() {
        let a = peticion_abrir_ap("wfd-1", "hotspot-local", 5).unwrap();
        assert!(a.contains("\"abrir-ap\"") && a.contains("\"hotspot-local\""));
        assert!(peticion_abrir_ap("wfd-1", "corewlan", 5).is_err());
        assert!(peticion_abrir_ap("mal/sesion", "wifi-direct", 5).is_err());
        let u = peticion_unirse("wfd-1", "wifi-direct", "DIRECT-ab-StarSeed", "clave-larga", Some("192.168.49.1"), 6).unwrap();
        let j: serde_json::Value = serde_json::from_str(&u).unwrap();
        assert_eq!(j["ip_ap"], "192.168.49.1");
        assert!(peticion_unirse("wfd-1", "corewlan", "x", "clave-larga", None, 6).is_err(), "Android solo se une a Wi-Fi Direct");
        assert!(peticion_unirse("wfd-1", "wifi-direct", "x", "corta", None, 6).is_err());
        let sin_ip: serde_json::Value = serde_json::from_str(&peticion_unirse("wfd-1", "wifi-direct", "x", "clave-larga", Some("8.8.8.8"), 6).unwrap()).unwrap();
        assert!(sin_ip["ip_ap"].is_null(), "una IP que no es de red local no se pasa");
        assert!(peticion_cerrar("wfd-1", 7).unwrap().contains("\"cerrar\""));
        assert!(peticion_permiso(8).contains("\"permiso\""));
        for a in ACCIONES {
            assert!(!a.is_empty());
        }
    }

    #[test]
    fn estado_y_credenciales_en_disco() {
        let d = dir("disco");
        assert_eq!(leer_estado(&d).fase, "inactivo");
        assert!(leer_puente(&d).is_none());
        escribir_atomico(&d, ESTADO, r#"{"sesion":"wfd-1","fase":"red-lista","rol":"ap","ssid":"StarSeed-1","ip_ap":"192.168.49.1","clave":"no-deberia","t":9}"#).unwrap();
        let e = leer_estado(&d);
        assert_eq!(e.fase, "red-lista");
        assert_eq!(e.ip_ap.as_deref(), Some("192.168.49.1"));
        assert!(!serde_json::to_string(&e).unwrap().contains("no-deberia"), "el estado nunca devuelve una contraseña");
        escribir_atomico(&d, CREDENCIALES, r#"{"sesion":"wfd-1","ssid":"StarSeed-1","clave":"clave-larga-1","banda":"5","ip":"192.168.49.1"}"#).unwrap();
        assert_eq!(leer_credenciales(&d, "wfd-1").map(|c| c.clave), Some("clave-larga-1".to_string()));
        assert!(leer_credenciales(&d, "otra").is_none(), "solo las de esa sesión");
        escribir_atomico(&d, CREDENCIALES, r#"{"sesion":"wfd-1","ssid":"StarSeed-1","clave":"corta","ip":"1.2.3.4"}"#).unwrap();
        assert!(leer_credenciales(&d, "wfd-1").is_none());
        escribir_atomico(&d, PUENTE, r#"{"version":1,"sdk":34,"p2p":true,"hotspot_local":true,"cliente_p2p":true,"permiso":"preguntar","wifi":true}"#).unwrap();
        assert_eq!(leer_puente(&d).map(|p| p.sdk), Some(34));
        let err = estado_error(Some("wfd-1"), "sin-soporte", "no", 3);
        assert_eq!((err.fase.as_str(), err.codigo.as_deref()), ("error", Some("sin-soporte")));
        let _ = std::fs::remove_dir_all(&d);
    }
}
