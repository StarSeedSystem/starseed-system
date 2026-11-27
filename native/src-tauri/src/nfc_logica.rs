// ═══════════════════════════════════════════════════════════════════════════
// nfc_logica — la parte pura del NFC de las neuronas (NFC1126B). Contrato: architecture/nfc-neuronas.md §1-§2.
// ---------------------------------------------------------------------------
// Dos neuronas Android se presentan así: una hace de LECTOR (ReaderMode) y la otra de TARJETA (HCE, `HostApduService`
// con el AID de StarSeed). El lector manda SELECT del AID y luego pide la tarjeta de neurona (≤ 1 KB, la firma y su
// vida de 30 s las comprueba la web con `src/lib/nfc/tarjeta.ts`) a trozos, porque una respuesta APDU corta lleva
// 256 bytes como mucho. Todo lo de aquí es lo MISMO que escribe NfcStarSeed.kt (una prueba vigila que casen).
// Solo std: lo usan nfc.rs, nfc_parche.rs y las pruebas, sin tocar nada del aparato.
// ═══════════════════════════════════════════════════════════════════════════

#![allow(dead_code)]

pub const VERSION_NFC: u32 = 1;
/// F0 + «STARSEED»: un AID propietario (empieza por F0, 5 a 16 bytes) que ninguna tarjeta de pago usa.
pub const AID: [u8; 9] = [0xF0, 0x53, 0x54, 0x41, 0x52, 0x53, 0x45, 0x45, 0x44];
pub const AID_HEX: &str = "F053544152534544";
pub const CLA_STARSEED: u8 = 0x80;
/// «Dame la tarjeta»: P1P2 = desde qué byte (big endian), Le = 00 (hasta 256).
pub const INS_TARJETA: u8 = 0xCA;
/// Bytes de tarjeta por respuesta: 250 + 2 de estado caben en una APDU corta.
pub const TROZO_MAX: usize = 250;
pub const SW_OK: [u8; 2] = [0x90, 0x00];
/// Quedan más bytes: pide otra vez desde el siguiente. Propio (no usa 61xx para no confundir a IsoDep).
pub const SW_MAS: [u8; 2] = [0x91, 0x00];
pub const SW_FUERA_DE_RANGO: [u8; 2] = [0x6B, 0x00];
pub const SW_SIN_TARJETA: [u8; 2] = [0x69, 0x85];
pub const SW_INS_DESCONOCIDA: [u8; 2] = [0x6D, 0x00];
pub const SW_SELECT_NO_ENCONTRADO: [u8; 2] = [0x6A, 0x82];
pub const MAX_TARJETA: usize = 1024;
/// Tipo MIME del registro NDEF de una etiqueta con la tarjeta (el mismo de `tarjeta.ts`).
pub const TIPO_MIME_NDEF: &str = "application/vnd.starseed.neurona";

/// Qué puede hacer este aparato con el NFC (se publica como `capacidades.nfc`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Modo {
    Ninguno,
    Lector,
    Emulador,
    /// Alterna los dos papeles solo (lo normal en Android con HCE).
    LectorYEmulador,
}

impl Modo {
    pub fn como_texto(self) -> &'static str {
        match self {
            Modo::Ninguno => "ninguno",
            Modo::Lector => "lector",
            Modo::Emulador => "emulador",
            Modo::LectorYEmulador => "lector_y_emulador",
        }
    }

    /// Cuadra con lo que dice el aparato: lector, emulación (HCE) o ninguno.
    pub fn de_capacidades(lector: bool, emulador: bool) -> Modo {
        match (lector, emulador) {
            (true, true) => Modo::LectorYEmulador,
            (true, false) => Modo::Lector,
            (false, true) => Modo::Emulador,
            (false, false) => Modo::Ninguno,
        }
    }
}

/// SELECT por AID (CLA 00, INS A4, P1 04): el primer mensaje del lector.
pub fn apdu_select() -> Vec<u8> {
    let mut v = vec![0x00, 0xA4, 0x04, 0x00, AID.len() as u8];
    v.extend_from_slice(&AID);
    v.push(0x00);
    v
}

pub fn es_select_de_starseed(apdu: &[u8]) -> bool {
    apdu.len() >= 5 + AID.len() && apdu[..4] == [0x00, 0xA4, 0x04, 0x00] && apdu[4] as usize == AID.len() && apdu[5..5 + AID.len()] == AID
}

/// Pide la tarjeta desde el byte `desde`.
pub fn apdu_pedir(desde: u16) -> Vec<u8> {
    vec![CLA_STARSEED, INS_TARJETA, (desde >> 8) as u8, desde as u8, 0x00]
}

/// La respuesta del emulador a una orden del lector. `tarjeta` es la que tiene preparada (o ninguna).
pub fn responder(apdu: &[u8], tarjeta: Option<&[u8]>) -> Vec<u8> {
    if es_select_de_starseed(apdu) {
        return SW_OK.to_vec();
    }
    if apdu.len() >= 2 && apdu[0] == 0x00 && apdu[1] == 0xA4 {
        return SW_SELECT_NO_ENCONTRADO.to_vec();
    }
    if apdu.len() < 4 || apdu[0] != CLA_STARSEED || apdu[1] != INS_TARJETA {
        return SW_INS_DESCONOCIDA.to_vec();
    }
    let Some(t) = tarjeta.filter(|t| !t.is_empty() && t.len() <= MAX_TARJETA) else { return SW_SIN_TARJETA.to_vec() };
    let desde = ((apdu[2] as usize) << 8) | apdu[3] as usize;
    if desde >= t.len() {
        return SW_FUERA_DE_RANGO.to_vec();
    }
    let fin = (desde + TROZO_MAX).min(t.len());
    let mut r = t[desde..fin].to_vec();
    r.extend_from_slice(if fin == t.len() { &SW_OK } else { &SW_MAS });
    r
}

/// Junta las respuestas del emulador hasta tener la tarjeta entera.
#[derive(Default)]
pub struct Reensamblador {
    bytes: Vec<u8>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum Avance {
    /// Pide otra vez desde este byte.
    Seguir(u16),
    Completa(Vec<u8>),
    Error(String),
}

impl Reensamblador {
    pub fn nuevo() -> Self {
        Self::default()
    }

    pub fn alimentar(&mut self, respuesta: &[u8]) -> Avance {
        if respuesta.len() < 2 {
            return Avance::Error("respuesta sin estado".into());
        }
        let (datos, sw) = respuesta.split_at(respuesta.len() - 2);
        if self.bytes.len() + datos.len() > MAX_TARJETA {
            return Avance::Error(format!("la tarjeta pasa de {MAX_TARJETA} bytes"));
        }
        if sw != SW_OK && sw != SW_MAS {
            return Avance::Error(format!("estado {:02X}{:02X}", sw[0], sw[1]));
        }
        self.bytes.extend_from_slice(datos);
        if sw == SW_OK {
            return Avance::Completa(std::mem::take(&mut self.bytes));
        }
        if datos.is_empty() {
            return Avance::Error("trozo vacío con «hay más»".into());
        }
        Avance::Seguir(self.bytes.len() as u16)
    }
}

pub fn a_hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02X}")).collect()
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn tarjeta(n: usize) -> Vec<u8> {
        (0..n).map(|i| (i % 251) as u8).collect()
    }

    /// El lector contra el emulador, igual que por el aire.
    fn intercambio(t: &[u8]) -> Avance {
        assert_eq!(responder(&apdu_select(), Some(t)), SW_OK.to_vec());
        let (mut re, mut desde) = (Reensamblador::nuevo(), 0u16);
        loop {
            match re.alimentar(&responder(&apdu_pedir(desde), Some(t))) {
                Avance::Seguir(d) => desde = d,
                otro => return otro,
            }
        }
    }

    #[test]
    fn el_aid_y_su_hex_dicen_lo_mismo() {
        assert_eq!(a_hex(&AID), AID_HEX);
        assert_eq!(AID[0], 0xF0, "AID propietario");
        assert_eq!(&AID[1..], b"STARSEED");
    }

    #[test]
    fn el_select_se_reconoce_y_otro_aid_no() {
        assert!(es_select_de_starseed(&apdu_select()));
        let mut otro = apdu_select();
        otro[6] ^= 0xFF;
        assert!(!es_select_de_starseed(&otro));
        assert_eq!(responder(&otro, None), SW_SELECT_NO_ENCONTRADO.to_vec());
    }

    #[test]
    fn tarjetas_de_cualquier_tamano_llegan_enteras() {
        for n in [1, 249, 250, 251, 500, 1000, MAX_TARJETA] {
            let t = tarjeta(n);
            assert_eq!(intercambio(&t), Avance::Completa(t), "tamaño {n}");
        }
    }

    #[test]
    fn rechaza_lo_que_no_debe_entregar() {
        assert_eq!(responder(&apdu_pedir(0), None), SW_SIN_TARJETA.to_vec());
        assert_eq!(responder(&apdu_pedir(0), Some(&tarjeta(MAX_TARJETA + 1))), SW_SIN_TARJETA.to_vec());
        assert_eq!(responder(&apdu_pedir(300), Some(&tarjeta(300))), SW_FUERA_DE_RANGO.to_vec());
        assert_eq!(responder(&[0x80, 0x01, 0, 0, 0], Some(&tarjeta(5))), SW_INS_DESCONOCIDA.to_vec());
    }

    #[test]
    fn el_reensamblador_corta_los_errores() {
        assert!(matches!(Reensamblador::nuevo().alimentar(&[0x90]), Avance::Error(_)));
        assert!(matches!(Reensamblador::nuevo().alimentar(&SW_SIN_TARJETA), Avance::Error(_)));
        assert!(matches!(Reensamblador::nuevo().alimentar(&SW_MAS), Avance::Error(_)), "«hay más» sin datos");
        let mut r = Reensamblador::nuevo();
        let mut grande = tarjeta(250);
        grande.extend_from_slice(&SW_MAS);
        let mut vistos = 0;
        while let Avance::Seguir(_) = r.alimentar(&grande) {
            vistos += 1;
            assert!(vistos < 6, "nunca debe pasar de MAX_TARJETA");
        }
    }

    #[test]
    fn el_modo_sale_de_lo_que_el_aparato_puede() {
        assert_eq!(Modo::de_capacidades(true, true).como_texto(), "lector_y_emulador");
        assert_eq!(Modo::de_capacidades(false, false), Modo::Ninguno);
        assert_eq!(Modo::de_capacidades(false, true).como_texto(), "emulador");
    }
}
