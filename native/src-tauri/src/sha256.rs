// ═══════════════════════════════════════════════════════════════════════════
// sha256 — SHA-256 y HMAC-SHA256 en Rust puro (solo std), 2026-10-10.
// ---------------------------------------------------------------------------
// Para qué: (1) verificar el SHA de cada capa de Astraura antes de usarla
// (architecture/capas-autoadaptables.md §6: «una capa sin su SHA en el catálogo
// no se usa jamás»), leyendo el archivo a trozos sin cargar gigas en memoria;
// (2) firmar los faros de la red local (faro.rs) para que solo las neuronas de
// la MISMA cuenta se reconozcan entre sí.
//
// Por qué no un crate: el Cargo.toml de la app no tiene ninguno de hash y añadir
// dependencias es decisión de Alex. SHA-256 es FIPS 180-4, determinista y se
// comprueba con los vectores oficiales (pruebas al final del archivo).
// No es cifrado: aquí solo hay integridad y autenticación.
// ═══════════════════════════════════════════════════════════════════════════

use std::io::Read;

const K: [u32; 64] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const H0: [u32; 8] = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

/// Hash incremental: `update` tantas veces como haga falta y `finalize` una vez.
#[derive(Clone)]
pub struct Sha256 {
    estado: [u32; 8],
    bloque: [u8; 64],
    usados: usize,
    total_bytes: u64,
}

impl Default for Sha256 {
    fn default() -> Self {
        Self::new()
    }
}

impl Sha256 {
    pub fn new() -> Self {
        Sha256 { estado: H0, bloque: [0u8; 64], usados: 0, total_bytes: 0 }
    }

    pub fn update(&mut self, mut datos: &[u8]) {
        self.total_bytes = self.total_bytes.wrapping_add(datos.len() as u64);
        if self.usados > 0 {
            let caben = 64 - self.usados;
            let n = caben.min(datos.len());
            self.bloque[self.usados..self.usados + n].copy_from_slice(&datos[..n]);
            self.usados += n;
            datos = &datos[n..];
            if self.usados == 64 {
                let b = self.bloque;
                comprimir(&mut self.estado, &b);
                self.usados = 0;
            }
        }
        while datos.len() >= 64 {
            let mut b = [0u8; 64];
            b.copy_from_slice(&datos[..64]);
            comprimir(&mut self.estado, &b);
            datos = &datos[64..];
        }
        if !datos.is_empty() {
            self.bloque[..datos.len()].copy_from_slice(datos);
            self.usados = datos.len();
        }
    }

    pub fn finalize(mut self) -> [u8; 32] {
        let bits = self.total_bytes.wrapping_mul(8);
        let mut relleno = vec![0x80u8];
        let resto = (self.usados + 1) % 64;
        let ceros = if resto <= 56 { 56 - resto } else { 120 - resto };
        relleno.extend(std::iter::repeat(0u8).take(ceros));
        relleno.extend_from_slice(&bits.to_be_bytes());
        // `update` sumaría el relleno al total: se restaura después (ya no se usa).
        let total = self.total_bytes;
        self.update(&relleno);
        self.total_bytes = total;
        debug_assert_eq!(self.usados, 0);
        let mut salida = [0u8; 32];
        for (i, palabra) in self.estado.iter().enumerate() {
            salida[i * 4..i * 4 + 4].copy_from_slice(&palabra.to_be_bytes());
        }
        salida
    }
}

fn comprimir(estado: &mut [u32; 8], bloque: &[u8; 64]) {
    let mut w = [0u32; 64];
    for i in 0..16 {
        w[i] = u32::from_be_bytes([bloque[i * 4], bloque[i * 4 + 1], bloque[i * 4 + 2], bloque[i * 4 + 3]]);
    }
    for i in 16..64 {
        let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
        let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
        w[i] = w[i - 16].wrapping_add(s0).wrapping_add(w[i - 7]).wrapping_add(s1);
    }
    let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut h] = *estado;
    for i in 0..64 {
        let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
        let ch = (e & f) ^ ((!e) & g);
        let t1 = h.wrapping_add(s1).wrapping_add(ch).wrapping_add(K[i]).wrapping_add(w[i]);
        let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
        let maj = (a & b) ^ (a & c) ^ (b & c);
        let t2 = s0.wrapping_add(maj);
        h = g;
        g = f;
        f = e;
        e = d.wrapping_add(t1);
        d = c;
        c = b;
        b = a;
        a = t1.wrapping_add(t2);
    }
    for (s, v) in estado.iter_mut().zip([a, b, c, d, e, f, g, h]) {
        *s = s.wrapping_add(v);
    }
}

/// SHA-256 de unos bytes.
pub fn sha256(datos: &[u8]) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(datos);
    h.finalize()
}

/// HMAC-SHA256 (RFC 2104).
pub fn hmac_sha256(clave: &[u8], mensaje: &[u8]) -> [u8; 32] {
    let mut k = [0u8; 64];
    if clave.len() > 64 {
        k[..32].copy_from_slice(&sha256(clave));
    } else {
        k[..clave.len()].copy_from_slice(clave);
    }
    let mut ipad = [0x36u8; 64];
    let mut opad = [0x5cu8; 64];
    for i in 0..64 {
        ipad[i] ^= k[i];
        opad[i] ^= k[i];
    }
    let mut interno = Sha256::new();
    interno.update(&ipad);
    interno.update(mensaje);
    let dentro = interno.finalize();
    let mut externo = Sha256::new();
    externo.update(&opad);
    externo.update(&dentro);
    externo.finalize()
}

/// Bytes → hex en minúsculas.
pub fn hex(bytes: &[u8]) -> String {
    const D: &[u8; 16] = b"0123456789abcdef";
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push(D[(b >> 4) as usize] as char);
        s.push(D[(b & 0x0f) as usize] as char);
    }
    s
}

/// Hex → bytes. None si la longitud es impar o hay un carácter que no es hex.
pub fn desde_hex(texto: &str) -> Option<Vec<u8>> {
    let t = texto.trim();
    if t.len() % 2 != 0 {
        return None;
    }
    let mut v = Vec::with_capacity(t.len() / 2);
    let b = t.as_bytes();
    for i in (0..b.len()).step_by(2) {
        let alto = (b[i] as char).to_digit(16)?;
        let bajo = (b[i + 1] as char).to_digit(16)?;
        v.push((alto * 16 + bajo) as u8);
    }
    Some(v)
}

/// ¿Es un SHA-256 en hex (64 caracteres hex)?
pub fn es_sha256_hex(texto: &str) -> bool {
    texto.len() == 64 && texto.bytes().all(|c| c.is_ascii_hexdigit())
}

/// SHA-256 de cualquier lector, a trozos de 1 MiB. Devuelve (hex, bytes leídos).
pub fn sha256_lector<R: Read>(mut lector: R) -> std::io::Result<(String, u64)> {
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 1 << 20];
    let mut total = 0u64;
    loop {
        let n = lector.read(&mut buf)?;
        if n == 0 {
            break;
        }
        total += n as u64;
        h.update(&buf[..n]);
    }
    Ok((hex(&h.finalize()), total))
}

/// SHA-256 de un archivo del disco (streaming; sirve para capas de varios GB).
pub fn sha256_archivo(ruta: &std::path::Path) -> std::io::Result<(String, u64)> {
    sha256_lector(std::fs::File::open(ruta)?)
}

/// Comparación en tiempo constante (para etiquetas HMAC).
pub fn iguales_ct(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut d = 0u8;
    for (x, y) in a.iter().zip(b) {
        d |= x ^ y;
    }
    d == 0
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn vectores_nist() {
        assert_eq!(hex(&sha256(b"")), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
        assert_eq!(hex(&sha256(b"abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        assert_eq!(
            hex(&sha256(b"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")),
            "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"
        );
    }

    #[test]
    fn un_millon_de_aes_a_trozos_irregulares() {
        let datos = vec![b'a'; 1_000_000];
        let mut h = Sha256::new();
        for trozo in datos.chunks(997) {
            h.update(trozo);
        }
        assert_eq!(hex(&h.finalize()), "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0");
    }

    #[test]
    fn todos_los_tamanos_de_relleno_coinciden_con_el_de_un_golpe() {
        for n in 0..200usize {
            let datos: Vec<u8> = (0..n).map(|i| (i * 31 % 251) as u8).collect();
            let mut h = Sha256::new();
            for b in &datos {
                h.update(std::slice::from_ref(b));
            }
            assert_eq!(h.finalize(), sha256(&datos), "n = {n}");
        }
    }

    #[test]
    fn hmac_rfc4231() {
        let k1 = [0x0bu8; 20];
        assert_eq!(
            hex(&hmac_sha256(&k1, b"Hi There")),
            "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7"
        );
        assert_eq!(
            hex(&hmac_sha256(b"Jefe", b"what do ya want for nothing?")),
            "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
        );
        // Caso 6: clave de 131 bytes (más larga que el bloque).
        let k6 = [0xaau8; 131];
        assert_eq!(
            hex(&hmac_sha256(&k6, b"Test Using Larger Than Block-Size Key - Hash Key First")),
            "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54"
        );
    }

    #[test]
    fn hex_ida_y_vuelta() {
        assert_eq!(desde_hex("00ff10").unwrap(), vec![0, 255, 16]);
        assert!(desde_hex("0g").is_none());
        assert!(desde_hex("abc").is_none());
        assert!(es_sha256_hex("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"));
        assert!(!es_sha256_hex("por-verificar"));
        assert!(iguales_ct(b"abc", b"abc"));
        assert!(!iguales_ct(b"abc", b"abd"));
    }

    #[test]
    fn lector_por_trozos() {
        let datos = vec![7u8; (1 << 20) + 13];
        let (h, n) = sha256_lector(std::io::Cursor::new(&datos)).unwrap();
        assert_eq!(n, datos.len() as u64);
        assert_eq!(h, hex(&sha256(&datos)));
    }
}
