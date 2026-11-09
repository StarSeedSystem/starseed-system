// ═══════════════════════════════════════════════════════════════════════════
// wifi_p2p_logica — lo PURO del Wi-Fi P2P sin router ni hotspot (WFA1109A, 2026-11-09).
// Contrato: architecture/wifi-directo.md §2 y §4. Solo std: se prueba en cualquier sistema.
// ---------------------------------------------------------------------------
// Dos carriles nuevos además del Wi-Fi Direct de WFD1108A:
//   · Wi-Fi Aware (NAN), Android ↔ Android: publicar/suscribir `starseed-malla` y un camino de datos (NDP) con
//     IPv6 de enlace local. Kotlin (WifiAwareStarSeed.kt) habla con el sistema; aquí está lo que se valida,
//     los carriles que se anuncian y el «aviso» de servicio (versión + huella corta de la neurona, SIN secretos).
//   · AWDL, Apple ↔ Apple: Network.framework con peer-to-peer y Bonjour `_starseed-p2p._tcp` (awdl_macos.rs).
//     Aquí: el nombre del servicio, la dirección virtual `awdl:<id>`, la tabla de vecinos y el ensamblado de
//     tramas (Network.framework entrega los bytes en trozos de cualquier tamaño).
// Mac ↔ Android NO tiene Wi-Fi P2P común: su enlace directo es Bluetooth (y el punto de acceso, solo si la
// persona lo permite).
// ═══════════════════════════════════════════════════════════════════════════

// Cada sistema usa un subconjunto (Android: Aware; macOS: AWDL; el resto, solo las pruebas).
#![allow(dead_code)]

use crate::enlace_wifi_logica::PuenteAndroid;
use crate::malla_local_trama::{self as trama, TipoTrama, CABECERA};
use crate::sha256;
use std::collections::HashMap;

/// Nombre del servicio Wi-Fi Aware (publicar/suscribir).
pub const SERVICIO_AWARE: &str = "starseed-malla";
/// Tipo Bonjour del servicio AWDL.
pub const SERVICIO_BONJOUR: &str = "_starseed-p2p._tcp";
/// Versión del protocolo P2P (va en el aviso de servicio de Aware y en el TXT de Bonjour).
pub const VERSION_P2P: u8 = 1;
/// Puerto del canal TCP en IPv6 de enlace local (Aware): el mismo protocolo que 47071 en otro socket.
pub const PUERTO_CANAL_P2P: u16 = trama::PUERTO_P2P;
/// Escape de emergencia: sin Wi-Fi Aware (en el APK lo aplica build.rs; aquí también al ejecutar).
pub const ENTORNO_SIN_AWARE: &str = "STARSEED_SIN_WIFI_AWARE";
/// Escape de emergencia: sin AWDL.
pub const ENTORNO_SIN_AWDL: &str = "STARSEED_SIN_AWDL";

pub const LANA_AWARE: &str = "wifi-aware";
pub const LANA_DIRECT_CONCURRENTE: &str = "wifi-direct-concurrente";
pub const LANA_AWDL: &str = "awdl";

// ─────────────────────────────── Huella corta ───────────────────────────────

/// Huella de una neurona para los avisos de servicio: 8 bytes del SHA-256 de «starseed-malla:v1:<id>».
/// No es secreta (no revela el id) y solo sirve para reconocer al vecino que se espera.
pub fn huella_neurona(id: &str) -> [u8; 8] {
    let h = sha256::sha256(format!("{SERVICIO_AWARE}:v{VERSION_P2P}:{id}").as_bytes());
    let mut o = [0u8; 8];
    o.copy_from_slice(&h[..8]);
    o
}

pub fn huella_hex(id: &str) -> String {
    sha256::hex(&huella_neurona(id))
}

/// Aviso de servicio de Wi-Fi Aware: versión + huella corta (9 bytes). Nada secreto.
pub fn info_servicio_aware(id: &str) -> Vec<u8> {
    let mut v = vec![VERSION_P2P];
    v.extend_from_slice(&huella_neurona(id));
    v
}

/// Lee el aviso de un vecino: (versión, huella en hex). None si no tiene la forma o la versión es otra.
pub fn leer_info_servicio_aware(b: &[u8]) -> Option<(u8, String)> {
    if b.len() != 9 || b[0] != VERSION_P2P {
        return None;
    }
    Some((b[0], sha256::hex(&b[1..])))
}

// ─────────────────────────────── Bonjour / AWDL ───────────────────────────────

/// Nombre del servicio Bonjour de esta neurona: «starseed-<huella de 16 hex>».
pub fn nombre_servicio_bonjour(id: &str) -> String {
    format!("starseed-{}", huella_hex(id))
}

/// De un nombre de servicio Bonjour a la dirección virtual `awdl:<huella>`. None si no es de StarSeed.
pub fn direccion_de_servicio(nombre: &str) -> Option<String> {
    let h = nombre.strip_prefix("starseed-")?;
    let ok = h.len() == 16 && h.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b));
    ok.then(|| format!("awdl:{h}"))
}

/// La huella de una dirección `awdl:<huella>`.
pub fn huella_de_direccion(dir: &str) -> Option<&str> {
    trama::direccion_awdl(dir).map(|_| &dir["awdl:".len()..])
}

// ─────────────────────────────── Tabla de vecinos AWDL ───────────────────────────────

/// Vecinos vistos por Bonjour (dirección virtual → último avistamiento, ms). Se purga solo.
#[derive(Default, Debug)]
pub struct Vecinos {
    vistos: HashMap<String, u64>,
}

impl Vecinos {
    pub fn registrar(&mut self, direccion: &str, ahora_ms: u64) {
        if trama::direccion_awdl(direccion).is_some() {
            self.vistos.insert(direccion.to_string(), ahora_ms);
        }
    }
    pub fn olvidar(&mut self, direccion: &str) {
        self.vistos.remove(direccion);
    }
    pub fn purgar(&mut self, ahora_ms: u64, edad_max_ms: u64) {
        self.vistos.retain(|_, t| ahora_ms.saturating_sub(*t) <= edad_max_ms);
    }
    /// (dirección, hace cuántos segundos), ordenados por dirección.
    pub fn lista(&self, ahora_ms: u64) -> Vec<(String, u64)> {
        let mut v: Vec<(String, u64)> = self.vistos.iter().map(|(d, t)| (d.clone(), ahora_ms.saturating_sub(*t) / 1000)).collect();
        v.sort();
        v
    }
    pub fn contiene(&self, direccion: &str) -> bool {
        self.vistos.contains_key(direccion)
    }
}

// ─────────────────────────────── Ensamblado de tramas ───────────────────────────────

/// Resultado de mirar los bytes recibidos hasta ahora.
#[derive(Debug, PartialEq, Eq)]
pub enum Ensamblado {
    /// Faltan bytes (la cabecera o el cuerpo aún no están enteros).
    Incompleto,
    /// Una trama entera; `consumidos` bytes del acumulado.
    Completo { tipo: TipoTrama, cuerpo: String, consumidos: usize },
    /// No es una trama válida (magia, versión, tipo, largo o UTF-8): se corta la conexión.
    Invalido(String),
}

/// Network.framework entrega los datos en trozos de cualquier tamaño: se acumulan y se pregunta aquí si ya hay
/// una trama entera. La MISMA trama del canal TCP (`SSM1`…), sin cambios: el saludo firmado y el cifrado de
/// sesión viajan dentro del cuerpo, como siempre. Nunca reserva más del tope aunque la cabecera mienta.
pub fn ensamblar(acumulado: &[u8]) -> Ensamblado {
    if acumulado.len() < CABECERA {
        return Ensamblado::Incompleto;
    }
    let mut c = [0u8; CABECERA];
    c.copy_from_slice(&acumulado[..CABECERA]);
    let (tipo, largo) = match trama::leer_cabecera(&c) {
        Ok(x) => x,
        Err(e) => return Ensamblado::Invalido(format!("{e:?}")),
    };
    if acumulado.len() < CABECERA + largo {
        return Ensamblado::Incompleto;
    }
    let cuerpo = match String::from_utf8(acumulado[CABECERA..CABECERA + largo].to_vec()) {
        Ok(s) => s,
        Err(_) => return Ensamblado::Invalido("NoUtf8".into()),
    };
    if let Err(e) = trama::validar_cuerpo(&cuerpo) {
        return Ensamblado::Invalido(format!("{e:?}"));
    }
    Ensamblado::Completo { tipo, cuerpo, consumidos: CABECERA + largo }
}

/// El mensaje que se manda a un vecino (trama «mensaje»).
pub fn trama_mensaje(json: &str) -> Result<Vec<u8>, String> {
    trama::codificar(TipoTrama::Mensaje, json).map_err(|e| format!("No se envía: {e:?}."))
}

/// El acuse con el que se confirma lo recibido (trama «acuse»).
pub fn trama_acuse() -> Vec<u8> {
    trama::codificar(TipoTrama::Acuse, trama::ACUSE_OK).unwrap_or_default()
}

// ─────────────────────────────── Preámbulo AWDL ───────────────────────────────

/// Por AWDL el vecino no tiene una IP que le sirva a la capa de arriba: quien conecta se presenta con su huella
/// corta ANTES de la trama («AWDL1:<16 hex>\n», 23 bytes) y el que escucha lo etiqueta `awdl:<huella>`, la misma
/// dirección con la que Bonjour lo anuncia. Es solo una etiqueta de ENCAMINAMIENTO (como una IP en la red local):
/// quién es de verdad lo prueba el saludo firmado de la capa TS, que va dentro de la trama de siempre.
pub const PREAMBULO_PREFIJO: &str = "AWDL1:";
pub const LARGO_PREAMBULO: usize = 6 + 16 + 1;

pub fn preambulo(huella: &str) -> Option<Vec<u8>> {
    huella_valida(huella).then(|| format!("{PREAMBULO_PREFIJO}{huella}\n").into_bytes())
}

#[derive(Debug, PartialEq, Eq)]
pub enum LecturaPreambulo {
    Incompleto,
    Completo { huella: String },
    Invalido,
}

pub fn leer_preambulo(b: &[u8]) -> LecturaPreambulo {
    let n = b.len().min(LARGO_PREAMBULO);
    let pref = PREAMBULO_PREFIJO.as_bytes();
    // Lo que ya llegó tiene que ser un prefijo de lo esperado (se corta pronto a quien no habla AWDL1).
    if b[..n.min(pref.len())] != pref[..n.min(pref.len())] {
        return LecturaPreambulo::Invalido;
    }
    if b.len() < LARGO_PREAMBULO {
        return LecturaPreambulo::Incompleto;
    }
    let h = &b[pref.len()..pref.len() + 16];
    match std::str::from_utf8(h) {
        Ok(t) if huella_valida(t) && b[LARGO_PREAMBULO - 1] == b'\n' => LecturaPreambulo::Completo { huella: t.to_string() },
        _ => LecturaPreambulo::Invalido,
    }
}

// ─────────────────────────────── Carriles anunciados ───────────────────────────────

/// ¿Se usa Wi-Fi Aware en este Android? (lo dijo Kotlin y no está el escape de emergencia).
pub fn aware_activo(p: &PuenteAndroid, sin_aware: bool) -> bool {
    p.aware && p.aware_disponible && !sin_aware
}

/// Carriles Wi-Fi P2P de un Android: Aware primero; Wi-Fi Direct concurrente si el aparato lo tiene (Wi-Fi de casa
/// intacta). El punto de acceso local NO es un carril P2P.
pub fn lanas_android(p: &PuenteAndroid, sin_aware: bool) -> Vec<String> {
    let mut v = Vec::new();
    if aware_activo(p, sin_aware) {
        v.push(LANA_AWARE.to_string());
    }
    if p.p2p {
        v.push(LANA_DIRECT_CONCURRENTE.to_string());
    }
    v
}

/// macOS 10.15+ trae el API `nw_*` con peer-to-peer; antes, ni se intenta.
pub fn macos_admite_awdl(major: u32, minor: u32) -> bool {
    major > 10 || (major == 10 && minor >= 15)
}

pub fn lanas_macos(major: u32, minor: u32, sin_awdl: bool, simbolos: bool) -> Vec<String> {
    if sin_awdl || !simbolos || !macos_admite_awdl(major, minor) {
        return Vec::new();
    }
    vec![LANA_AWDL.to_string()]
}

pub fn sin_aware_en_entorno() -> bool {
    std::env::var_os(ENTORNO_SIN_AWARE).is_some()
}

pub fn sin_awdl_en_entorno() -> bool {
    std::env::var_os(ENTORNO_SIN_AWDL).is_some()
}

// ─────────────────────────────── Validación de comandos ───────────────────────────────

/// Una huella de neurona en hex (16 caracteres) o vacía.
pub fn huella_valida(h: &str) -> bool {
    h.len() == 16 && h.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// Un identificador de neurona que viene de la web: 1 a 80 caracteres imprimibles sin controles.
pub fn id_neurona_valido(id: &str) -> bool {
    !id.is_empty() && id.len() <= 80 && !id.chars().any(|c| c.is_control())
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn puente(aware: bool, disp: bool, p2p: bool) -> PuenteAndroid {
        PuenteAndroid { version: 2, sdk: 34, p2p, hotspot_local: true, cliente_p2p: true, permiso: "concedido".into(), wifi: true, aware, aware_disponible: disp }
    }

    #[test]
    fn el_aviso_de_aware_lleva_version_y_huella_sin_secretos() {
        let i = info_servicio_aware("neurona-123");
        assert_eq!(i.len(), 9);
        assert_eq!(i[0], VERSION_P2P);
        // La huella no es el id ni lo contiene.
        assert!(!i.windows(3).any(|w| w == b"neu"));
        let (v, h) = leer_info_servicio_aware(&i).unwrap();
        assert_eq!(v, VERSION_P2P);
        assert_eq!(h, huella_hex("neurona-123"));
        assert_ne!(huella_hex("a"), huella_hex("b"));
        assert!(leer_info_servicio_aware(&[2, 0, 0, 0, 0, 0, 0, 0, 0]).is_none(), "otra versión no se entiende");
        assert!(leer_info_servicio_aware(&[1, 2, 3]).is_none());
    }

    #[test]
    fn bonjour_y_direccion_awdl_se_corresponden() {
        let n = nombre_servicio_bonjour("neurona-123");
        assert!(n.starts_with("starseed-") && n.len() == "starseed-".len() + 16);
        let d = direccion_de_servicio(&n).unwrap();
        assert_eq!(d, format!("awdl:{}", huella_hex("neurona-123")));
        assert!(trama::direccion_awdl(&d).is_some());
        assert_eq!(huella_de_direccion(&d), Some(huella_hex("neurona-123").as_str()));
        assert!(direccion_de_servicio("otra-cosa").is_none());
        assert!(direccion_de_servicio("starseed-XYZ").is_none());
        assert!(huella_de_direccion("awdl:").is_none());
    }

    #[test]
    fn la_tabla_de_vecinos_purga_y_ordena() {
        let mut t = Vecinos::default();
        t.registrar("awdl:aaaaaaaaaaaaaaaa", 1_000);
        t.registrar("awdl:bbbbbbbbbbbbbbbb", 9_000);
        t.registrar("no-es-awdl", 9_000);
        assert!(!t.contiene("no-es-awdl"));
        t.purgar(12_000, 5_000);
        assert!(!t.contiene("awdl:aaaaaaaaaaaaaaaa"));
        assert_eq!(t.lista(12_000), vec![("awdl:bbbbbbbbbbbbbbbb".to_string(), 3)]);
        t.olvidar("awdl:bbbbbbbbbbbbbbbb");
        assert!(t.lista(12_000).is_empty());
    }

    #[test]
    fn ensambla_la_misma_trama_del_canal_tcp_en_trozos() {
        let json = r#"{"t":"saludo","k":"firmado"}"#;
        let bytes = trama_mensaje(json).unwrap();
        // Es exactamente la trama del canal TCP: nada nuevo en el cable.
        assert_eq!(bytes, trama::codificar(TipoTrama::Mensaje, json).unwrap());
        // Trozo a trozo: incompleto hasta el último byte.
        for corte in 0..bytes.len() {
            assert_eq!(ensamblar(&bytes[..corte]), Ensamblado::Incompleto, "corte {corte}");
        }
        match ensamblar(&bytes) {
            Ensamblado::Completo { tipo, cuerpo, consumidos } => {
                assert_eq!(tipo, TipoTrama::Mensaje);
                assert_eq!(cuerpo, json);
                assert_eq!(consumidos, bytes.len());
            }
            otro => panic!("{otro:?}"),
        }
        // Bytes de más (el acuse pegado detrás): consume solo la primera.
        let mut dos = bytes.clone();
        dos.extend_from_slice(&trama_acuse());
        match ensamblar(&dos) {
            Ensamblado::Completo { consumidos, .. } => assert_eq!(consumidos, bytes.len()),
            otro => panic!("{otro:?}"),
        }
        match ensamblar(&dos[bytes.len()..]) {
            Ensamblado::Completo { tipo, cuerpo, .. } => {
                assert_eq!(tipo, TipoTrama::Acuse);
                assert_eq!(cuerpo, trama::ACUSE_OK);
            }
            otro => panic!("{otro:?}"),
        }
    }

    #[test]
    fn rechaza_tramas_malas_sin_reservar_de_mas() {
        assert!(matches!(ensamblar(b"XXXX\x01\x01\x00\x00\x00\x02{}"), Ensamblado::Invalido(_)));
        // Largo enorme en la cabecera: se rechaza al leerla, sin esperar ni reservar.
        let mut c = Vec::new();
        c.extend_from_slice(&trama::MAGIA);
        c.push(trama::VERSION);
        c.push(1);
        c.extend_from_slice(&u32::MAX.to_be_bytes());
        assert!(matches!(ensamblar(&c), Ensamblado::Invalido(_)));
        assert!(trama_mensaje("no es json").is_err());
        assert!(trama_mensaje("").is_err());
    }

    #[test]
    fn carriles_de_android_aware_primero_y_sin_punto_de_acceso() {
        assert_eq!(lanas_android(&puente(true, true, true), false), vec!["wifi-aware", "wifi-direct-concurrente"]);
        assert_eq!(lanas_android(&puente(true, false, true), false), vec!["wifi-direct-concurrente"], "Aware no disponible ahora (Wi-Fi apagado o sin sesión)");
        assert_eq!(lanas_android(&puente(true, true, true), true), vec!["wifi-direct-concurrente"], "escape STARSEED_SIN_WIFI_AWARE");
        assert!(lanas_android(&puente(false, false, false), false).is_empty(), "el punto de acceso local no es un carril P2P");
    }

    #[test]
    fn awdl_solo_en_macos_10_15_o_mas_con_los_simbolos() {
        assert!(!macos_admite_awdl(10, 14));
        assert!(macos_admite_awdl(10, 15));
        assert!(macos_admite_awdl(14, 0));
        assert_eq!(lanas_macos(14, 0, false, true), vec!["awdl"]);
        assert!(lanas_macos(10, 14, false, true).is_empty());
        assert!(lanas_macos(14, 0, true, true).is_empty(), "escape STARSEED_SIN_AWDL");
        assert!(lanas_macos(14, 0, false, false).is_empty(), "sin los símbolos nw_* no se anuncia");
    }

    #[test]
    fn valida_lo_que_viene_de_la_web() {
        assert!(huella_valida(&huella_hex("x")));
        assert!(!huella_valida("XYZ"));
        assert!(!huella_valida("0123456789abcdeg"));
        assert!(id_neurona_valido("neurona-1"));
        assert!(!id_neurona_valido(""));
        assert!(!id_neurona_valido("a\nb"));
        assert!(!id_neurona_valido(&"x".repeat(81)));
    }

    #[test]
    fn el_puerto_p2p_no_choca_con_los_demas() {
        assert_eq!(PUERTO_CANAL_P2P, 47073);
        assert_ne!(PUERTO_CANAL_P2P, trama::PUERTO);
    }

    #[test]
    fn el_preambulo_etiqueta_al_que_conecta() {
        let h = huella_hex("neurona-1");
        let p = preambulo(&h).unwrap();
        assert_eq!(p.len(), LARGO_PREAMBULO);
        assert_eq!(leer_preambulo(&p), LecturaPreambulo::Completo { huella: h.clone() });
        for corte in 0..p.len() {
            assert_eq!(leer_preambulo(&p[..corte]), LecturaPreambulo::Incompleto, "corte {corte}");
        }
        assert_eq!(leer_preambulo(b"SSM1xxxxxxxxxxxxxxxxxxxxxxxx"), LecturaPreambulo::Invalido, "una trama sin preámbulo no es AWDL");
        assert_eq!(leer_preambulo(b"AWDL1:ZZZZZZZZZZZZZZZZ\n"), LecturaPreambulo::Invalido);
        assert_eq!(leer_preambulo(b"AWDL1:0123456789abcdefX"), LecturaPreambulo::Invalido, "falta el salto de línea");
        assert!(preambulo("corta").is_none());
        // El preámbulo + la trama de siempre.
        let mut todo = p.clone();
        todo.extend_from_slice(&trama_mensaje("{\"a\":1}").unwrap());
        assert!(matches!(ensamblar(&todo[LARGO_PREAMBULO..]), Ensamblado::Completo { .. }));
    }

    #[test]
    fn android_con_aware_anuncia_aware_primero() {
        use crate::enlace_wifi_logica::capacidades_android;
        let c = capacidades_android(Some(&puente(true, true, true)));
        assert_eq!(c.ap[0], "wifi-aware");
        assert_eq!(c.cliente[0], "wifi-aware");
        assert!(c.ap.contains(&"wifi-direct".to_string()));
        assert_eq!(c.lanas, vec!["wifi-aware", "wifi-direct-concurrente"]);
        let sin = capacidades_android(Some(&puente(false, false, true)));
        assert!(!sin.ap.contains(&"wifi-aware".to_string()));
        assert_eq!(sin.lanas, vec!["wifi-direct-concurrente"]);
    }

    #[test]
    fn peticiones_de_aware_validan_metodo_y_ids() {
        use crate::enlace_wifi_logica as l;
        assert!(l::peticion_abrir_ap_con("wfd-1", "wifi-aware", 1, Some("neurona-1"), Some("neurona-2")).is_ok());
        let j: serde_json::Value = serde_json::from_str(&l::peticion_abrir_ap_con("wfd-1", "wifi-aware", 1, Some("neurona-1"), Some("neurona-2")).unwrap()).unwrap();
        assert_eq!(j["huella_propia"], huella_hex("neurona-1"));
        assert_eq!(j["huella_otro"], huella_hex("neurona-2"));
        assert!(j.get("neurona").is_none() && !j.to_string().contains("neurona-1"), "el id no viaja, solo su huella");
        assert!(l::peticion_abrir_ap_con("wfd-1", "wifi-aware", 1, Some("a\nb"), None).is_err());
        assert!(l::peticion_abrir_ap("wfd-1", "inventado", 1).is_err());
        assert!(l::peticion_unirse("wfd-1", "wifi-aware", "starseed-malla", "clave-larga-123", None, 1).is_ok());
        assert!(l::peticion_unirse("wfd-1", "corewlan", "starseed-malla", "clave-larga-123", None, 1).is_err(), "Android no se une a una red cualquiera");
        assert!(l::peticion_unirse("wfd-1", "wifi-aware", "starseed-malla", "corta", None, 1).is_err());
    }
}
