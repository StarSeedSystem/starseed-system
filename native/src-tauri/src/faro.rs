// ═══════════════════════════════════════════════════════════════════════════
// faro — anuncio de presencia en la red local SIN internet (2026-10-10).
// ---------------------------------------------------------------------------
// Contrato: architecture/apps-nativas-segundo-plano.md §3 (Wi-Fi local).
//
// Un faro es un datagrama UDP de 37 bytes que la app nativa emite cada 15 s al
// grupo multicast 239.255.70.83:47070 (y escucha en el mismo). Dice SOLO «aquí
// hay una neurona StarSeed»: no lleva nombre, cuenta ni id en claro. Cada faro
// lleva un nonce nuevo, así que dos faros del mismo aparato no se pueden enlazar
// desde fuera.
//
// Quien tenga la CLAVE DE FARO de la cuenta (32 bytes que derivan las neuronas
// de la misma cuenta, ver src/lib/nativa/faro-clave.ts) puede comprobar:
//   · etiqueta_cuenta  = HMAC(clave, "ss-faro-cuenta" | ventana | nonce)[..8]
//       → «es de mi cuenta» (ventana = minutos/5, se aceptan ±1 por relojes);
//   · etiqueta_neurona = HMAC(clave, "ss-faro-neurona" | nonce | id)[..8]
//       → «es mi tablet», probando los ids de neurona que la web conoce.
// Sin clave, el receptor solo cuenta «N neuronas StarSeed cerca».
//
// Límite honesto: quien grabe un faro puede reemitirlo durante ~10 min y fingir
// presencia (no datos). Para vincular de verdad, el canal posterior (WebRTC/QR o
// el NAS) exige su propio saludo; el faro solo dice «prueba a conectar aquí».
// ═══════════════════════════════════════════════════════════════════════════

use crate::sha256::{hmac_sha256, iguales_ct};
use std::hash::{BuildHasher, Hasher};

pub const MAGIA: &[u8; 4] = b"SSF1";
pub const VERSION: u8 = 1;
pub const LARGO: usize = 37;
pub const GRUPO_MULTICAST: [u8; 4] = [239, 255, 70, 83];
pub const PUERTO: u16 = 47070;
/// Cada cuánto se emite un faro.
pub const CADA_SEGUNDOS: u64 = 15;
/// Un vecino que no se oye en este tiempo deja de contar.
pub const CADUCA_SEGUNDOS: u64 = 60;

/// Tipo de aparato que anuncia (no identifica a nadie: hay millones de cada uno).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TipoAparato {
    Desconocido = 0,
    Escritorio = 1,
    Android = 2,
    Ios = 3,
    Servidor = 4,
}

impl TipoAparato {
    pub fn desde_u8(v: u8) -> Self {
        match v {
            1 => TipoAparato::Escritorio,
            2 => TipoAparato::Android,
            3 => TipoAparato::Ios,
            4 => TipoAparato::Servidor,
            _ => TipoAparato::Desconocido,
        }
    }
    pub fn nombre(self) -> &'static str {
        match self {
            TipoAparato::Escritorio => "escritorio",
            TipoAparato::Android => "android",
            TipoAparato::Ios => "ios",
            TipoAparato::Servidor => "servidor",
            TipoAparato::Desconocido => "desconocido",
        }
    }
    pub fn de_este_aparato() -> Self {
        if cfg!(target_os = "android") {
            TipoAparato::Android
        } else if cfg!(target_os = "ios") {
            TipoAparato::Ios
        } else {
            TipoAparato::Escritorio
        }
    }
}

/// Bits de `flags`.
pub const FLAG_NAS: u8 = 0b0000_0001; // sirve carpetas a su cuenta
pub const FLAG_LORA: u8 = 0b0000_0010; // tiene una radio LoRa viva
pub const FLAG_SEGUNDO_PLANO: u8 = 0b0000_0100; // la app está cerrada y sigue anunciando

/// Faro ya leído (lo que se sabe sin clave + lo que se pudo comprobar con ella).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FaroLeido {
    pub flags: u8,
    pub ventana: u32,
    pub nonce: [u8; 8],
    pub puerto_servicio: u16,
    pub tipo: TipoAparato,
    pub etiqueta_cuenta: [u8; 8],
    pub etiqueta_neurona: [u8; 8],
}

/// Ventana de tiempo de 5 minutos desde la época Unix.
pub fn ventana_de(segundos_unix: u64) -> u32 {
    (segundos_unix / 300) as u32
}

fn etiqueta_cuenta(clave: &[u8], ventana: u32, nonce: &[u8; 8]) -> [u8; 8] {
    let mut m = Vec::with_capacity(14 + 4 + 8);
    m.extend_from_slice(b"ss-faro-cuenta");
    m.extend_from_slice(&ventana.to_be_bytes());
    m.extend_from_slice(nonce);
    let h = hmac_sha256(clave, &m);
    let mut e = [0u8; 8];
    e.copy_from_slice(&h[..8]);
    e
}

fn etiqueta_neurona(clave: &[u8], nonce: &[u8; 8], id: &str) -> [u8; 8] {
    let mut m = Vec::with_capacity(15 + 8 + id.len());
    m.extend_from_slice(b"ss-faro-neurona");
    m.extend_from_slice(nonce);
    m.extend_from_slice(id.as_bytes());
    let h = hmac_sha256(clave, &m);
    let mut e = [0u8; 8];
    e.copy_from_slice(&h[..8]);
    e
}

/// Nonce de 8 bytes impredecible desde fuera, solo con std: `RandomState` se
/// siembra con aleatoriedad del sistema operativo; se mezcla con la hora y un
/// contador para que dos faros seguidos nunca repitan.
pub fn nonce_nuevo() -> [u8; 8] {
    use std::sync::atomic::{AtomicU64, Ordering};
    static CONTADOR: AtomicU64 = AtomicU64::new(0);
    let mut h = std::collections::hash_map::RandomState::new().build_hasher();
    h.write_u64(CONTADOR.fetch_add(1, Ordering::Relaxed));
    let ahora = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0);
    h.write_u64(ahora);
    h.finish().to_be_bytes()
}

/// Construye un faro. Sin clave (`None`), las etiquetas van a cero: el receptor
/// lo cuenta como «StarSeed cerca» y nada más.
pub fn construir(
    clave: Option<&[u8]>,
    id_neurona: Option<&str>,
    tipo: TipoAparato,
    flags: u8,
    puerto_servicio: u16,
    segundos_unix: u64,
    nonce: [u8; 8],
) -> [u8; LARGO] {
    let ventana = ventana_de(segundos_unix);
    let mut b = [0u8; LARGO];
    b[0..4].copy_from_slice(MAGIA);
    b[4] = VERSION;
    b[5] = flags;
    b[6..10].copy_from_slice(&ventana.to_be_bytes());
    b[10..18].copy_from_slice(&nonce);
    b[18..20].copy_from_slice(&puerto_servicio.to_be_bytes());
    b[20] = tipo as u8;
    if let Some(k) = clave {
        b[21..29].copy_from_slice(&etiqueta_cuenta(k, ventana, &nonce));
        if let Some(id) = id_neurona {
            b[29..37].copy_from_slice(&etiqueta_neurona(k, &nonce, id));
        }
    }
    b
}

/// Lee un datagrama. None si no es un faro StarSeed v1 bien formado.
pub fn leer(datos: &[u8]) -> Option<FaroLeido> {
    if datos.len() != LARGO || &datos[0..4] != MAGIA || datos[4] != VERSION {
        return None;
    }
    let mut nonce = [0u8; 8];
    nonce.copy_from_slice(&datos[10..18]);
    let mut ec = [0u8; 8];
    ec.copy_from_slice(&datos[21..29]);
    let mut en = [0u8; 8];
    en.copy_from_slice(&datos[29..37]);
    Some(FaroLeido {
        flags: datos[5],
        ventana: u32::from_be_bytes([datos[6], datos[7], datos[8], datos[9]]),
        nonce,
        puerto_servicio: u16::from_be_bytes([datos[18], datos[19]]),
        tipo: TipoAparato::desde_u8(datos[20]),
        etiqueta_cuenta: ec,
        etiqueta_neurona: en,
    })
}

/// ¿Es de MI cuenta? Acepta la ventana actual y la de al lado (relojes ±5 min).
pub fn es_de_mi_cuenta(faro: &FaroLeido, clave: &[u8], segundos_unix: u64) -> bool {
    let v = ventana_de(segundos_unix);
    if faro.ventana.abs_diff(v) > 1 {
        return false;
    }
    iguales_ct(&etiqueta_cuenta(clave, faro.ventana, &faro.nonce), &faro.etiqueta_cuenta)
}

/// ¿Qué neurona de mi cuenta es? Prueba los ids conocidos (los da la web).
pub fn que_neurona<'a>(faro: &FaroLeido, clave: &[u8], conocidas: &'a [String]) -> Option<&'a str> {
    conocidas
        .iter()
        .find(|id| iguales_ct(&etiqueta_neurona(clave, &faro.nonce, id), &faro.etiqueta_neurona))
        .map(|s| s.as_str())
}

#[cfg(test)]
mod pruebas {
    use super::*;

    const CLAVE: [u8; 32] = [7u8; 32];
    const OTRA: [u8; 32] = [9u8; 32];
    const T: u64 = 1_791_608_253;

    #[test]
    fn ida_y_vuelta_y_reconocimiento() {
        let b = construir(Some(&CLAVE), Some("tablet-1"), TipoAparato::Android, FLAG_NAS, 47071, T, [1, 2, 3, 4, 5, 6, 7, 8]);
        let f = leer(&b).expect("faro válido");
        assert_eq!(f.tipo, TipoAparato::Android);
        assert_eq!(f.flags & FLAG_NAS, FLAG_NAS);
        assert_eq!(f.puerto_servicio, 47071);
        assert!(es_de_mi_cuenta(&f, &CLAVE, T));
        assert!(es_de_mi_cuenta(&f, &CLAVE, T + 300), "ventana vecina vale");
        assert!(!es_de_mi_cuenta(&f, &CLAVE, T + 900), "más de una ventana: no");
        assert!(!es_de_mi_cuenta(&f, &OTRA, T), "otra cuenta no lo reconoce");
        let ids = vec!["mac-1".to_string(), "tablet-1".to_string()];
        assert_eq!(que_neurona(&f, &CLAVE, &ids), Some("tablet-1"));
        assert_eq!(que_neurona(&f, &OTRA, &ids), None);
    }

    #[test]
    fn sin_clave_no_lleva_nada_identificable() {
        let b = construir(None, Some("tablet-1"), TipoAparato::Escritorio, 0, 0, T, [9; 8]);
        let f = leer(&b).unwrap();
        assert_eq!(f.etiqueta_cuenta, [0u8; 8]);
        assert_eq!(f.etiqueta_neurona, [0u8; 8]);
        assert!(!es_de_mi_cuenta(&f, &CLAVE, T));
    }

    #[test]
    fn nonces_distintos_dan_faros_no_enlazables() {
        let a = construir(Some(&CLAVE), Some("x"), TipoAparato::Escritorio, 0, 0, T, nonce_nuevo());
        let b = construir(Some(&CLAVE), Some("x"), TipoAparato::Escritorio, 0, 0, T, nonce_nuevo());
        assert_ne!(a[10..37], b[10..37]);
    }

    #[test]
    fn rechaza_basura() {
        assert!(leer(b"hola").is_none());
        let mut b = construir(None, None, TipoAparato::Escritorio, 0, 0, T, [0; 8]);
        b[4] = 2;
        assert!(leer(&b).is_none(), "otra versión");
        assert!(leer(&[0u8; LARGO]).is_none());
    }
}
