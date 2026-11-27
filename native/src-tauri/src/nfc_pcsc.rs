// NFC1126G · lectura de tarjetas de neurona con lector NFC USB (PC/SC, p. ej. ACR122U).
// Contrato: architecture/nfc-neuronas.md §2. Esta parte es lógica pura de APDU (sin crate `pcsc`,
// sin dispositivo): el transporte real se enchufa con el trait `Lector`, así el build no se rompe
// si no hay lector ni librería PC/SC. Escritorio: Mac, Windows y Linux.

/// AID propio de StarSeed (F0 + «STARSEED»), el mismo que usa la emulación HCE de Android.
pub const AID_STARSEED: [u8; 8] = [0xF0, 0x53, 0x54, 0x41, 0x52, 0x53, 0x45, 0x45];
pub const MAX_BYTES_TARJETA: usize = 1024;
const TROZO: usize = 240;

/// Un lector PC/SC: manda un APDU y devuelve la respuesta completa (datos + SW1 SW2).
pub trait Lector {
    fn transmitir(&mut self, apdu: &[u8]) -> Result<Vec<u8>, String>;
}

/// SELECT por AID (ISO 7816-4).
pub fn apdu_seleccionar() -> Vec<u8> {
    let mut a = vec![0x00, 0xA4, 0x04, 0x00, AID_STARSEED.len() as u8];
    a.extend_from_slice(&AID_STARSEED);
    a.push(0x00);
    a
}

/// READ BINARY desde `desplazamiento` hasta `largo` bytes.
pub fn apdu_leer(desplazamiento: usize, largo: usize) -> Vec<u8> {
    vec![0x00, 0xB0, (desplazamiento >> 8) as u8, (desplazamiento & 0xFF) as u8, largo.min(255) as u8]
}

/// Separa datos y estado; `Err` si la respuesta no acaba en 90 00.
pub fn datos_de(respuesta: &[u8]) -> Result<&[u8], String> {
    if respuesta.len() < 2 {
        return Err("respuesta PC/SC demasiado corta".into());
    }
    let (datos, sw) = respuesta.split_at(respuesta.len() - 2);
    if sw == [0x90, 0x00] {
        Ok(datos)
    } else {
        Err(format!("estado del lector {:02X}{:02X}", sw[0], sw[1]))
    }
}

/// Lee la tarjeta NDEF completa (SELECT + trozos de READ BINARY). La firma y la
/// caducidad se comprueban después, en `src/lib/nfc/tarjeta.ts`.
pub fn leer_tarjeta<L: Lector>(lector: &mut L) -> Result<Vec<u8>, String> {
    datos_de(&lector.transmitir(&apdu_seleccionar())?)?;
    let mut bytes: Vec<u8> = Vec::new();
    while bytes.len() < MAX_BYTES_TARJETA {
        let respuesta = lector.transmitir(&apdu_leer(bytes.len(), TROZO))?;
        let datos = datos_de(&respuesta)?;
        if datos.is_empty() {
            break;
        }
        bytes.extend_from_slice(datos);
        if datos.len() < TROZO {
            break;
        }
    }
    if bytes.is_empty() {
        return Err("la tarjeta está vacía".into());
    }
    if bytes.len() > MAX_BYTES_TARJETA {
        return Err("la tarjeta pesa más de 1 KB".into());
    }
    Ok(bytes)
}

#[cfg(test)]
mod pruebas {
    use super::*;

    struct Falso {
        tarjeta: Vec<u8>,
    }

    impl Lector for Falso {
        fn transmitir(&mut self, apdu: &[u8]) -> Result<Vec<u8>, String> {
            if apdu[1] == 0xA4 {
                return Ok(vec![0x90, 0x00]);
            }
            let desde = ((apdu[2] as usize) << 8) | apdu[3] as usize;
            let hasta = (desde + apdu[4] as usize).min(self.tarjeta.len());
            let mut r = self.tarjeta[desde.min(hasta)..hasta].to_vec();
            r.extend_from_slice(&[0x90, 0x00]);
            Ok(r)
        }
    }

    #[test]
    fn lee_en_trozos() {
        let tarjeta: Vec<u8> = (0..600u32).map(|i| (i % 251) as u8).collect();
        let mut l = Falso { tarjeta: tarjeta.clone() };
        assert_eq!(leer_tarjeta(&mut l).unwrap(), tarjeta);
    }

    #[test]
    fn rechaza_estado_malo() {
        assert!(datos_de(&[0x6A, 0x82]).is_err());
        assert!(datos_de(&[0x90]).is_err());
    }
}
