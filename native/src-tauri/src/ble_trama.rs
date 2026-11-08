// ═══════════════════════════════════════════════════════════════════════════
// ble_trama — Bluetooth directo entre neuronas: la parte PURA (2026-11-08 · BLE1108A).
// ---------------------------------------------------------------------------
// Contrato: architecture/bluetooth-directo.md.
//
// Petición de Alex: «el P2P sin router debe ir directo entre las antenas de los aparatos, no por
// una red externa». Aquí vive todo lo que no toca la radio (se prueba en cualquier sistema):
//
//   · ANUNCIO: un UUID de 128 bits que rota cada 5 min: «SS·B1» (3 B fijos: dice solo «aquí hay
//     una neurona StarSeed», como la magia del faro UDP) + tipo/indicadores + nonce + dos etiquetas
//     HMAC con la CLAVE DE FARO de la cuenta (el mismo esquema que `faro.rs`: «es de mi cuenta» y
//     «qué neurona es», probando los ids que la web conoce). Sin la clave no se reconoce nada.
//     Va como UUID de servicio porque macOS (CBPeripheralManager) solo deja anunciar el nombre y
//     UUIDs de servicio: ni datos de servicio ni datos del fabricante.
//   · GATT: un servicio fijo con ENTRADA (escritura sin respuesta, central → periférico) y SALIDA
//     (notificación, periférico → central). El enlace es simétrico por encima de eso.
//   · TRAMA: «SSB1» | versión | tipo | largo (4 B) | cuerpo JSON (≤ 16 KiB): el mismo concepto que
//     `malla_local_trama.rs`. La capa web firma y verifica (saludo `nl.hola`); aquí solo se lleva.
//   · PAQUETES: cada escritura o notificación (≤ MTU − 3, ≤ 512 B) lleva [tipo | id | índice] y un
//     trozo de la trama. Parada y espera por mensaje: uno en vuelo por sentido, ACUSE al guardarlo,
//     RECHAZO con motivo (hueco, grande, inválido, límite), reintento por plazo (4 intentos).
//   · VECINDARIO: quién se oye, con su RSSI; a quién conectar solo (tus neuronas, desempate por id).
// ═══════════════════════════════════════════════════════════════════════════

#![allow(dead_code)]

use crate::sha256::{hmac_sha256, iguales_ct};
use std::collections::{HashMap, VecDeque};
use std::fmt;

// ─────────────────────────────── UUIDs ───────────────────────────────

/// Servicio GATT de StarSeed (fijo).
pub const SERVICIO: &str = "53530001-b1e0-4d2a-9c3e-537461727365";
/// ENTRADA: el central escribe aquí (escritura sin respuesta; también admite con respuesta).
pub const ENTRADA: &str = "53530002-b1e0-4d2a-9c3e-537461727365";
/// SALIDA: el periférico notifica aquí (el central se suscribe con el CCCD).
pub const SALIDA: &str = "53530003-b1e0-4d2a-9c3e-537461727365";
/// Descriptor estándar de configuración de notificaciones.
pub const CCCD: &str = "00002902-0000-1000-8000-00805f9b34fb";
/// Los 3 primeros bytes de todo anuncio StarSeed («SS» + B1 = Bluetooth, versión 1).
pub const PREFIJO_ANUNCIO: [u8; 3] = [0x53, 0x53, 0xB1];
/// UUID del prefijo y su máscara (filtro de escaneo de Android: solo los 3 primeros bytes).
pub const UUID_PREFIJO: &str = "5353b100-0000-0000-0000-000000000000";
pub const UUID_MASCARA: &str = "ffffff00-0000-0000-0000-000000000000";

// ─────────────────────────────── Límites ───────────────────────────────

/// Ventana del anuncio (la misma del faro: 5 min; se aceptan ±1 por relojes).
pub const VENTANA_S: u64 = 300;
/// Tope del cuerpo de una trama. Con 16 KiB una trama de archivo (10 KiB en base64) tarda ~1 s en
/// el aire y un mensaje de control no espera detrás más que eso.
pub const MAX_CUERPO: usize = 16 * 1024;
/// magia (4) + versión (1) + tipo (1) + largo (4).
pub const CABECERA_TRAMA: usize = 10;
pub const MAGIA: [u8; 4] = *b"SSB1";
pub const VERSION: u8 = 1;
pub const T_MENSAJE: u8 = 1;
/// tipo (1) + id (2) + índice (2).
pub const CABECERA_PAQUETE: usize = 5;
/// Valor ATT por defecto (MTU 23 − 3) y el máximo que admite un atributo (512).
pub const PAQUETE_MIN: usize = 20;
pub const PAQUETE_MAX: usize = 512;
/// Mensajes que se admiten de cada enlace por ventana (16 KiB cada uno: muy por encima de lo que
/// lleva el aire; corta a quien inunde).
pub const LIMITE_MENSAJES: u32 = 120;
pub const LIMITE_VENTANA_MS: u64 = 10_000;
/// Lo que puede esperar en la cola de un enlace (la web frena antes: ve la cola ×4).
pub const MAX_COLA_BYTES: usize = 256 * 1024;
/// Sin acuse tras entregar el último paquete a la radio → reintento.
pub const PLAZO_ACUSE_MS: u64 = 5_000;
pub const MAX_INTENTOS: u8 = 4;
/// Un mensaje nunca espera más que esto en total (radio lenta incluida).
pub const PLAZO_TOTAL_MS: u64 = 120_000;
/// Enlaces a la vez (centrales + periféricos).
pub const MAX_ENLACES: usize = 6;
/// Un vecino que no se oye en este tiempo deja de contar.
pub const CADUCA_VECINO_MS: u64 = 30_000;
/// Entre dos intentos de conexión al mismo aparato.
pub const ENTRE_INTENTOS_MS: u64 = 20_000;
/// Por debajo de esta señal no se intenta conectar solo (se cortaría enseguida).
pub const RSSI_MINIMO: i16 = -92;

// ─────────────────────────────── Errores ───────────────────────────────

#[derive(Debug, PartialEq, Eq, Clone)]
pub enum ErrorBle {
    Vacio,
    Largo(usize),
    NoJson,
    NoUtf8,
    Magia,
    Version(u8),
    Tipo(u8),
    ColaLlena(usize),
    Cerrado(String),
}

impl fmt::Display for ErrorBle {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ErrorBle::Vacio => write!(f, "mensaje vacío"),
            ErrorBle::Largo(n) => write!(f, "mensaje de {n} bytes: por Bluetooth el tope es {MAX_CUERPO}"),
            ErrorBle::NoJson => write!(f, "por Bluetooth solo viajan objetos JSON"),
            ErrorBle::NoUtf8 => write!(f, "el cuerpo no es texto UTF-8"),
            ErrorBle::Magia => write!(f, "no es una trama StarSeed por Bluetooth"),
            ErrorBle::Version(v) => write!(f, "versión de trama {v} desconocida (esta app habla la {VERSION})"),
            ErrorBle::Tipo(t) => write!(f, "tipo de trama {t} desconocido"),
            ErrorBle::ColaLlena(n) => write!(f, "la cola del enlace Bluetooth está llena ({n} bytes esperando): reintenta en un momento"),
            ErrorBle::Cerrado(m) => write!(f, "{m}"),
        }
    }
}

// ─────────────────────────────── UUID ↔ bytes ───────────────────────────────

/// 16 bytes → «xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx» (minúsculas).
pub fn uuid_texto(b: &[u8; 16]) -> String {
    let h: String = b.iter().map(|x| format!("{x:02x}")).collect();
    format!("{}-{}-{}-{}-{}", &h[0..8], &h[8..12], &h[12..16], &h[16..20], &h[20..32])
}

/// Texto de UUID (con o sin guiones, mayúsculas o minúsculas) → 16 bytes.
pub fn uuid_bytes(t: &str) -> Option<[u8; 16]> {
    let limpio: String = t.trim().chars().filter(|c| *c != '-').collect();
    if limpio.len() != 32 {
        return None;
    }
    let mut b = [0u8; 16];
    for (i, par) in limpio.as_bytes().chunks(2).enumerate() {
        let s = std::str::from_utf8(par).ok()?;
        b[i] = u8::from_str_radix(s, 16).ok()?;
    }
    Some(b)
}

/// Bytes → hex (para el puente con Kotlin).
pub fn a_hex(b: &[u8]) -> String {
    let mut s = String::with_capacity(b.len() * 2);
    for x in b {
        s.push_str(&format!("{x:02x}"));
    }
    s
}

/// Hex → bytes (None si no es hex par).
pub fn de_hex(t: &str) -> Option<Vec<u8>> {
    let t = t.trim();
    if t.len() % 2 != 0 {
        return None;
    }
    (0..t.len()).step_by(2).map(|i| u8::from_str_radix(t.get(i..i + 2)?, 16).ok()).collect()
}

// ─────────────────────────────── Anuncio ───────────────────────────────
//
//   [0..3]   53 53 B1                 prefijo fijo (StarSeed · Bluetooth v1)
//   [3]      tipo (4 bits altos) | indicadores (4 bits bajos)
//   [4..8]   nonce (nuevo en cada rotación: dos anuncios no se enlazan desde fuera)
//   [8..12]  etiqueta_cuenta  = HMAC(clave, "ss-ble-cuenta"  | ventana (4 B) | nonce)[..4]
//   [12..16] etiqueta_neurona = HMAC(clave, "ss-ble-neurona" | nonce | id)[..4]
//
// La ventana NO viaja: quien recibe prueba la suya y las dos de al lado. Sin clave las etiquetas van
// a cero y el anuncio solo dice «neurona StarSeed cerca».

pub use crate::faro::TipoAparato;

/// El servidor GATT de este aparato está abierto (acepta que se le conecten).
pub const FLAG_SERVIDOR: u8 = 0b0001;
/// La app está cerrada y sigue anunciando (servicio de Android / bandeja).
pub const FLAG_SEGUNDO_PLANO: u8 = 0b0010;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Anuncio {
    pub tipo: TipoAparato,
    pub flags: u8,
    pub nonce: [u8; 4],
    pub etiqueta_cuenta: [u8; 4],
    pub etiqueta_neurona: [u8; 4],
}

pub fn ventana_de(segundos_unix: u64) -> u32 {
    (segundos_unix / VENTANA_S) as u32
}

fn etiqueta_cuenta(clave: &[u8], ventana: u32, nonce: &[u8; 4]) -> [u8; 4] {
    let mut m = Vec::with_capacity(13 + 4 + 4);
    m.extend_from_slice(b"ss-ble-cuenta");
    m.extend_from_slice(&ventana.to_be_bytes());
    m.extend_from_slice(nonce);
    let h = hmac_sha256(clave, &m);
    [h[0], h[1], h[2], h[3]]
}

fn etiqueta_neurona(clave: &[u8], nonce: &[u8; 4], id: &str) -> [u8; 4] {
    let mut m = Vec::with_capacity(14 + 4 + id.len());
    m.extend_from_slice(b"ss-ble-neurona");
    m.extend_from_slice(nonce);
    m.extend_from_slice(id.as_bytes());
    let h = hmac_sha256(clave, &m);
    [h[0], h[1], h[2], h[3]]
}

/// Nonce de 4 bytes impredecible desde fuera (el del faro, recortado).
pub fn nonce_nuevo() -> [u8; 4] {
    let n = crate::faro::nonce_nuevo();
    [n[0], n[1], n[2], n[3]]
}

/// Construye el UUID del anuncio. Sin clave (`None`) las etiquetas van a cero.
pub fn construir_anuncio(
    clave: Option<&[u8]>,
    id_neurona: Option<&str>,
    tipo: TipoAparato,
    flags: u8,
    segundos_unix: u64,
    nonce: [u8; 4],
) -> [u8; 16] {
    let mut b = [0u8; 16];
    b[0..3].copy_from_slice(&PREFIJO_ANUNCIO);
    b[3] = ((tipo as u8) << 4) | (flags & 0x0f);
    b[4..8].copy_from_slice(&nonce);
    if let Some(k) = clave {
        b[8..12].copy_from_slice(&etiqueta_cuenta(k, ventana_de(segundos_unix), &nonce));
        if let Some(id) = id_neurona {
            b[12..16].copy_from_slice(&etiqueta_neurona(k, &nonce, id));
        }
    }
    b
}

/// ¿Es un anuncio StarSeed? (los 3 primeros bytes). Lo comprueban Kotlin y CoreBluetooth antes de avisar.
pub fn es_anuncio(b: &[u8]) -> bool {
    b.len() == 16 && b[0..3] == PREFIJO_ANUNCIO
}

pub fn leer_anuncio(b: &[u8]) -> Option<Anuncio> {
    if !es_anuncio(b) {
        return None;
    }
    let mut nonce = [0u8; 4];
    nonce.copy_from_slice(&b[4..8]);
    let mut ec = [0u8; 4];
    ec.copy_from_slice(&b[8..12]);
    let mut en = [0u8; 4];
    en.copy_from_slice(&b[12..16]);
    Some(Anuncio { tipo: TipoAparato::desde_u8(b[3] >> 4), flags: b[3] & 0x0f, nonce, etiqueta_cuenta: ec, etiqueta_neurona: en })
}

/// ¿Es de MI cuenta? Prueba la ventana actual y las dos de al lado (relojes ±5 min).
pub fn es_de_mi_cuenta(a: &Anuncio, clave: &[u8], segundos_unix: u64) -> bool {
    if a.etiqueta_cuenta == [0u8; 4] {
        return false;
    }
    let v = ventana_de(segundos_unix);
    [v.wrapping_sub(1), v, v.wrapping_add(1)]
        .iter()
        .any(|w| iguales_ct(&etiqueta_cuenta(clave, *w, &a.nonce), &a.etiqueta_cuenta))
}

/// ¿Qué neurona de mi cuenta es? Prueba los ids conocidos (los da la web).
pub fn que_neurona<'a>(a: &Anuncio, clave: &[u8], conocidas: &'a [String]) -> Option<&'a str> {
    conocidas
        .iter()
        .find(|id| iguales_ct(&etiqueta_neurona(clave, &a.nonce, id), &a.etiqueta_neurona))
        .map(|s| s.as_str())
}

/// Desempate entre dos neuronas de la cuenta que se oyen: conecta (como central) la de id MENOR.
/// Así nunca se abren dos enlaces cruzados entre los mismos aparatos.
pub fn conecto_yo(mi_neurona: &str, su_neurona: &str) -> bool {
    mi_neurona < su_neurona
}

// ─────────────────────────────── Trama ───────────────────────────────

/// Un cuerpo válido: no vacío, ≤ tope y con forma de objeto JSON (la web lo parsea de verdad).
pub fn validar_cuerpo(cuerpo: &str) -> Result<(), ErrorBle> {
    let t = cuerpo.trim();
    if t.is_empty() {
        return Err(ErrorBle::Vacio);
    }
    if cuerpo.len() > MAX_CUERPO {
        return Err(ErrorBle::Largo(cuerpo.len()));
    }
    if !(t.starts_with('{') && t.ends_with('}')) {
        return Err(ErrorBle::NoJson);
    }
    Ok(())
}

pub fn trama(cuerpo: &str) -> Result<Vec<u8>, ErrorBle> {
    validar_cuerpo(cuerpo)?;
    let b = cuerpo.as_bytes();
    let mut v = Vec::with_capacity(CABECERA_TRAMA + b.len());
    v.extend_from_slice(&MAGIA);
    v.push(VERSION);
    v.push(T_MENSAJE);
    v.extend_from_slice(&(b.len() as u32).to_be_bytes());
    v.extend_from_slice(b);
    Ok(v)
}

/// Lee la cabecera de una trama: el largo del cuerpo (ya comprobado contra el tope).
pub fn leer_cabecera_trama(c: &[u8]) -> Result<usize, ErrorBle> {
    if c.len() < CABECERA_TRAMA || c[0..4] != MAGIA {
        return Err(ErrorBle::Magia);
    }
    if c[4] != VERSION {
        return Err(ErrorBle::Version(c[4]));
    }
    if c[5] != T_MENSAJE {
        return Err(ErrorBle::Tipo(c[5]));
    }
    let largo = u32::from_be_bytes([c[6], c[7], c[8], c[9]]) as usize;
    if largo == 0 {
        return Err(ErrorBle::Vacio);
    }
    if largo > MAX_CUERPO {
        return Err(ErrorBle::Largo(largo));
    }
    Ok(largo)
}

// ─────────────────────────────── Paquetes ───────────────────────────────

pub const P_DATOS: u8 = 1;
pub const P_ACUSE: u8 = 2;
pub const P_RECHAZO: u8 = 3;

/// Motivos de un rechazo (byte 3 del paquete).
pub const R_HUECO: u8 = 1;
pub const R_GRANDE: u8 = 2;
pub const R_INVALIDO: u8 = 3;
pub const R_LIMITE: u8 = 4;

#[derive(Debug, PartialEq, Eq)]
pub enum Paquete<'a> {
    Datos { id: u16, idx: u16, datos: &'a [u8] },
    Acuse { id: u16 },
    Rechazo { id: u16, motivo: u8 },
}

pub fn leer_paquete(b: &[u8]) -> Option<Paquete<'_>> {
    if b.len() < 3 || b.len() > PAQUETE_MAX {
        return None;
    }
    let id = u16::from_be_bytes([b[1], b[2]]);
    match b[0] {
        P_DATOS if b.len() > CABECERA_PAQUETE => {
            Some(Paquete::Datos { id, idx: u16::from_be_bytes([b[3], b[4]]), datos: &b[CABECERA_PAQUETE..] })
        }
        P_ACUSE if b.len() == 3 => Some(Paquete::Acuse { id }),
        P_RECHAZO if b.len() == 4 => Some(Paquete::Rechazo { id, motivo: b[3] }),
        _ => None,
    }
}

pub fn paquete_acuse(id: u16) -> Vec<u8> {
    let i = id.to_be_bytes();
    vec![P_ACUSE, i[0], i[1]]
}

pub fn paquete_rechazo(id: u16, motivo: u8) -> Vec<u8> {
    let i = id.to_be_bytes();
    vec![P_RECHAZO, i[0], i[1], motivo]
}

/// Bytes útiles por paquete con un MTU de ATT negociado (MTU − 3, entre 20 y 512).
pub fn paquete_util(mtu_att: u16) -> usize {
    (mtu_att as usize).saturating_sub(3).clamp(PAQUETE_MIN, PAQUETE_MAX)
}

/// Parte una trama en paquetes de `paquete` bytes como mucho (cabecera incluida).
pub fn trocear(id: u16, trama: &[u8], paquete: usize) -> Vec<Vec<u8>> {
    let util = paquete.clamp(PAQUETE_MIN, PAQUETE_MAX) - CABECERA_PAQUETE;
    let i = id.to_be_bytes();
    trama
        .chunks(util)
        .enumerate()
        .map(|(n, trozo)| {
            let idx = (n as u16).to_be_bytes();
            let mut p = Vec::with_capacity(CABECERA_PAQUETE + trozo.len());
            p.extend_from_slice(&[P_DATOS, i[0], i[1], idx[0], idx[1]]);
            p.extend_from_slice(trozo);
            p
        })
        .collect()
}

/// Texto del motivo de un rechazo recibido (para quien esperaba el acuse).
pub fn texto_rechazo(motivo: u8) -> &'static str {
    match motivo {
        R_HUECO => "se perdió un paquete por el camino",
        R_GRANDE => "el otro aparato no admite un mensaje tan grande",
        R_INVALIDO => "el otro aparato no entendió el mensaje",
        R_LIMITE => "el otro aparato está recibiendo demasiado deprisa por Bluetooth (su limitador cortó)",
        _ => "el otro aparato rechazó el mensaje",
    }
}

// ─────────────────────────────── Enlace (parada y espera) ───────────────────────────────

/// Resultado de un envío: los ms desde que se encoló hasta el acuse, o el motivo.
#[derive(Debug, PartialEq, Eq, Clone)]
pub struct Hecho {
    pub token: u64,
    pub resultado: Result<u64, String>,
}

/// Lo medido en un enlace (nada estimado).
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Medidas {
    /// Ida y vuelta del último mensaje acusado: primer paquete → acuse.
    pub rtt_ms: Option<u64>,
    /// Rendimiento del último mensaje de ≥ 2 KiB (kbit/s), medido.
    pub kbps: Option<u32>,
    pub bytes_enviados: u64,
    pub bytes_recibidos: u64,
    pub mensajes_enviados: u64,
    pub mensajes_recibidos: u64,
    pub reintentos: u64,
}

struct Vuelo {
    token: u64,
    id: u16,
    trama: Vec<u8>,
    intentos: u8,
    /// Cuando se encoló (plazo total).
    encolado_ms: u64,
    /// Primer paquete entregado a la radio en este intento.
    primero_ms: Option<u64>,
    /// Último paquete entregado a la radio en este intento (desde ahí cuenta el plazo del acuse).
    ultimo_ms: Option<u64>,
}

struct Entrada {
    id: u16,
    total: usize,
    buf: Vec<u8>,
    siguiente: u16,
}

/// Estado de UN enlace (un sentido de envío y otro de recepción). Puro: lo mueve quien tiene la radio.
pub struct Enlace {
    paquete: usize,
    cola: VecDeque<(u64, u64, Vec<u8>)>,
    bytes_cola: usize,
    vuelo: Option<Vuelo>,
    paquetes: VecDeque<Vec<u8>>,
    urgentes: VecDeque<Vec<u8>>,
    siguiente_id: u16,
    entrada: Option<Entrada>,
    recientes: VecDeque<u16>,
    ultimo_hueco: Option<u16>,
    hechos: Vec<Hecho>,
    pub medidas: Medidas,
}

/// Cuántos ids recibidos se recuerdan para descartar repetidos (acuse perdido → reenvío).
const RECIENTES: usize = 64;

impl Enlace {
    pub fn nuevo(paquete: usize) -> Self {
        Enlace {
            paquete: paquete.clamp(PAQUETE_MIN, PAQUETE_MAX),
            cola: VecDeque::new(),
            bytes_cola: 0,
            vuelo: None,
            paquetes: VecDeque::new(),
            urgentes: VecDeque::new(),
            siguiente_id: 0,
            entrada: None,
            recientes: VecDeque::new(),
            ultimo_hueco: None,
            hechos: Vec::new(),
            medidas: Medidas::default(),
        }
    }

    /// Bytes por paquete (cambia al negociar el MTU; vale para los mensajes siguientes).
    pub fn paquete(&self) -> usize {
        self.paquete
    }

    pub fn fijar_paquete(&mut self, paquete: usize) {
        self.paquete = paquete.clamp(PAQUETE_MIN, PAQUETE_MAX);
    }

    /// Bytes esperando (cola + mensaje en vuelo).
    pub fn bytes_pendientes(&self) -> usize {
        self.bytes_cola + self.vuelo.as_ref().map(|v| v.trama.len()).unwrap_or(0)
    }

    /// Mensajes esperando (cola + en vuelo).
    pub fn pendientes(&self) -> usize {
        self.cola.len() + usize::from(self.vuelo.is_some())
    }

    /// ¿Hay algo que entregar a la radio ahora mismo?
    pub fn hay_paquetes(&self) -> bool {
        !self.urgentes.is_empty() || !self.paquetes.is_empty() || (self.vuelo.is_none() && !self.cola.is_empty())
    }

    /// Encola un cuerpo JSON. Su resultado llega en `hechos()` con el mismo `token`.
    pub fn encolar(&mut self, token: u64, cuerpo: &str, ahora: u64) -> Result<(), ErrorBle> {
        let t = trama(cuerpo)?;
        if self.bytes_cola + t.len() > MAX_COLA_BYTES {
            return Err(ErrorBle::ColaLlena(self.bytes_cola));
        }
        self.bytes_cola += t.len();
        self.cola.push_back((token, ahora, t));
        self.bombear();
        Ok(())
    }

    fn bombear(&mut self) {
        if self.vuelo.is_some() {
            return;
        }
        let Some((token, encolado_ms, t)) = self.cola.pop_front() else { return };
        self.bytes_cola -= t.len();
        let id = self.siguiente_id;
        self.siguiente_id = self.siguiente_id.wrapping_add(1);
        self.paquetes = trocear(id, &t, self.paquete).into();
        self.vuelo = Some(Vuelo { token, id, trama: t, intentos: 1, encolado_ms, primero_ms: None, ultimo_ms: None });
    }

    /// Reenvía el mensaje en vuelo desde el principio (o lo da por fallido tras `MAX_INTENTOS`).
    fn reenviar(&mut self, motivo: &str) {
        let Some(v) = self.vuelo.as_mut() else { return };
        if v.intentos >= MAX_INTENTOS {
            let token = v.token;
            self.vuelo = None;
            self.paquetes.clear();
            self.hechos.push(Hecho { token, resultado: Err(format!("sin acuse por Bluetooth tras {MAX_INTENTOS} intentos ({motivo})")) });
            self.bombear();
            return;
        }
        v.intentos += 1;
        v.primero_ms = None;
        v.ultimo_ms = None;
        self.medidas.reintentos += 1;
        self.paquetes = trocear(v.id, &v.trama, self.paquete).into();
    }

    fn fallar_vuelo(&mut self, motivo: String) {
        if let Some(v) = self.vuelo.take() {
            self.paquetes.clear();
            self.hechos.push(Hecho { token: v.token, resultado: Err(motivo) });
        }
        self.bombear();
    }

    /// El siguiente paquete para la radio: primero acuses y rechazos, luego el mensaje en vuelo.
    pub fn siguiente_paquete(&mut self, ahora: u64) -> Option<Vec<u8>> {
        if let Some(p) = self.urgentes.pop_front() {
            return Some(p);
        }
        self.bombear();
        let p = self.paquetes.pop_front()?;
        if let Some(v) = self.vuelo.as_mut() {
            v.primero_ms.get_or_insert(ahora);
            if self.paquetes.is_empty() {
                v.ultimo_ms = Some(ahora);
            }
        }
        Some(p)
    }

    fn rechazar(&mut self, id: u16, motivo: u8) {
        self.urgentes.push_back(paquete_rechazo(id, motivo));
    }

    /// Un paquete que llegó por la radio. Devuelve el cuerpo de un mensaje NUEVO y completo (ya
    /// acusado). `admitir` es el limitador: si dice que no, se rechaza con R_LIMITE y no se entrega.
    pub fn recibir(&mut self, b: &[u8], ahora: u64, admitir: &mut dyn FnMut() -> bool) -> Option<String> {
        match leer_paquete(b)? {
            Paquete::Acuse { id } => {
                if self.vuelo.as_ref().is_some_and(|v| v.id == id) {
                    let v = self.vuelo.take().expect("vuelo comprobado");
                    self.paquetes.clear();
                    let desde = v.primero_ms.unwrap_or(v.encolado_ms);
                    let rtt = ahora.saturating_sub(desde).max(1);
                    self.medidas.rtt_ms = Some(rtt);
                    if v.trama.len() >= 2048 {
                        self.medidas.kbps = Some(((v.trama.len() as u64 * 8) / rtt) as u32);
                    }
                    self.medidas.bytes_enviados += v.trama.len() as u64;
                    self.medidas.mensajes_enviados += 1;
                    self.hechos.push(Hecho { token: v.token, resultado: Ok(ahora.saturating_sub(v.encolado_ms).max(1)) });
                    self.bombear();
                }
                None
            }
            Paquete::Rechazo { id, motivo } => {
                if self.vuelo.as_ref().is_some_and(|v| v.id == id) {
                    if motivo == R_HUECO {
                        self.reenviar("se perdió un paquete");
                    } else {
                        self.fallar_vuelo(texto_rechazo(motivo).to_string());
                    }
                }
                None
            }
            Paquete::Datos { id, idx, datos } => self.recibir_datos(id, idx, datos, ahora, admitir),
        }
    }

    fn recibir_datos(&mut self, id: u16, idx: u16, datos: &[u8], _ahora: u64, admitir: &mut dyn FnMut() -> bool) -> Option<String> {
        if idx == 0 {
            self.entrada = None;
            if self.ultimo_hueco == Some(id) {
                self.ultimo_hueco = None; // empieza otro intento: un hueco nuevo se vuelve a pedir
            }
            let largo = match leer_cabecera_trama(datos) {
                Ok(n) => n,
                Err(ErrorBle::Largo(_)) => {
                    self.rechazar(id, R_GRANDE);
                    return None;
                }
                Err(_) => {
                    self.rechazar(id, R_INVALIDO);
                    return None;
                }
            };
            let total = CABECERA_TRAMA + largo;
            let mut buf = Vec::with_capacity(total);
            buf.extend_from_slice(datos);
            self.entrada = Some(Entrada { id, total, buf, siguiente: 1 });
        } else {
            match self.entrada.as_mut() {
                Some(e) if e.id == id && e.siguiente == idx => {
                    e.buf.extend_from_slice(datos);
                    e.siguiente = e.siguiente.wrapping_add(1);
                }
                _ => {
                    // Hueco (o la cola de un mensaje cuyo principio no llegó): se pide entero otra vez,
                    // una sola vez por mensaje para no inundar de rechazos.
                    self.entrada = None;
                    if self.ultimo_hueco != Some(id) && !self.recientes.contains(&id) {
                        self.ultimo_hueco = Some(id);
                        self.rechazar(id, R_HUECO);
                    }
                    return None;
                }
            }
        }
        let e = self.entrada.as_ref()?;
        if e.buf.len() < e.total {
            return None;
        }
        let e = self.entrada.take()?;
        if e.buf.len() > e.total {
            self.rechazar(e.id, R_INVALIDO);
            return None;
        }
        if self.recientes.contains(&e.id) {
            // Ya entregado: su acuse se perdió. Se acusa otra vez y no se entrega dos veces.
            self.urgentes.push_back(paquete_acuse(e.id));
            return None;
        }
        let Ok(cuerpo) = String::from_utf8(e.buf[CABECERA_TRAMA..].to_vec()) else {
            self.rechazar(e.id, R_INVALIDO);
            return None;
        };
        if validar_cuerpo(&cuerpo).is_err() {
            self.rechazar(e.id, R_INVALIDO);
            return None;
        }
        if !admitir() {
            self.rechazar(e.id, R_LIMITE);
            return None;
        }
        self.recientes.push_back(e.id);
        if self.recientes.len() > RECIENTES {
            self.recientes.pop_front();
        }
        if self.ultimo_hueco == Some(e.id) {
            self.ultimo_hueco = None;
        }
        self.medidas.bytes_recibidos += e.total as u64;
        self.medidas.mensajes_recibidos += 1;
        self.urgentes.push_back(paquete_acuse(e.id));
        Some(cuerpo)
    }

    /// Plazos: sin acuse tras entregar el último paquete → reintento; demasiado en total → fallo.
    pub fn tic(&mut self, ahora: u64) {
        let Some(v) = self.vuelo.as_ref() else { return };
        if ahora.saturating_sub(v.encolado_ms) > PLAZO_TOTAL_MS {
            self.fallar_vuelo(format!("el mensaje no salió por Bluetooth en {} s", PLAZO_TOTAL_MS / 1000));
            return;
        }
        if let Some(u) = v.ultimo_ms {
            if ahora.saturating_sub(u) > PLAZO_ACUSE_MS {
                self.reenviar("sin acuse a tiempo");
            }
        }
    }

    /// El enlace se cerró: todo lo pendiente falla con ese motivo.
    pub fn cerrar(&mut self, motivo: &str) {
        if let Some(v) = self.vuelo.take() {
            self.hechos.push(Hecho { token: v.token, resultado: Err(motivo.to_string()) });
        }
        for (token, _, _) in self.cola.drain(..) {
            self.hechos.push(Hecho { token, resultado: Err(motivo.to_string()) });
        }
        self.bytes_cola = 0;
        self.paquetes.clear();
        self.urgentes.clear();
        self.entrada = None;
    }

    /// Resultados listos (se vacían al leerlos).
    pub fn hechos(&mut self) -> Vec<Hecho> {
        std::mem::take(&mut self.hechos)
    }
}

// ─────────────────────────────── Vecindario ───────────────────────────────

/// Un aparato StarSeed que se oye por Bluetooth (por su anuncio).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VecinoVisto {
    /// Dirección de la plataforma (Android: la MAC aleatoria del anuncio; macOS: el UUID que da
    /// CoreBluetooth). Solo sirve para conectar: rota con la del aparato.
    pub direccion: String,
    pub rssi: i16,
    pub visto_ms: u64,
    pub propia: bool,
    pub neurona: Option<String>,
    pub tipo: TipoAparato,
    pub flags: u8,
}

/// Id opaco y corto de un vecino para la web («v» + 8 hex del SHA-256 de su dirección).
pub fn id_vecino(direccion: &str) -> String {
    let h = crate::sha256::sha256(direccion.as_bytes());
    format!("v{}", a_hex(&h[..4]))
}

/// Quién se oye, reconocido con la clave de faro (con caché: el mismo anuncio se repite 5 min).
#[derive(Default)]
pub struct Vecindario {
    vecinos: HashMap<String, VecinoVisto>,
    cache: HashMap<[u8; 16], (bool, Option<String>)>,
    intentos: HashMap<String, u64>,
}

impl Vecindario {
    pub fn nuevo() -> Self {
        Self::default()
    }

    /// Cambió la clave o las neuronas conocidas: lo reconocido ya no vale.
    pub fn olvidar_reconocimientos(&mut self) {
        self.cache.clear();
        self.vecinos.clear();
    }

    /// Un anuncio oído. Devuelve true si es un vecino NUEVO (para avisar a la web).
    pub fn ver(
        &mut self,
        direccion: &str,
        anuncio: &[u8],
        rssi: i16,
        ahora_ms: u64,
        segundos_unix: u64,
        clave: Option<&[u8]>,
        conocidas: &[String],
    ) -> bool {
        let Some(a) = leer_anuncio(anuncio) else { return false };
        let mut b = [0u8; 16];
        b.copy_from_slice(anuncio);
        if self.cache.len() > 512 {
            self.cache.clear();
        }
        let (propia, neurona) = self
            .cache
            .entry(b)
            .or_insert_with(|| match clave {
                Some(k) if es_de_mi_cuenta(&a, k, segundos_unix) => (true, que_neurona(&a, k, conocidas).map(String::from)),
                _ => (false, None),
            })
            .clone();
        let nuevo = !self.vecinos.contains_key(direccion);
        self.vecinos.insert(
            direccion.to_string(),
            VecinoVisto { direccion: direccion.to_string(), rssi, visto_ms: ahora_ms, propia, neurona, tipo: a.tipo, flags: a.flags },
        );
        nuevo
    }

    /// Quita los que no se oyen hace `CADUCA_VECINO_MS`. Devuelve true si quitó alguno.
    pub fn caducar(&mut self, ahora_ms: u64) -> bool {
        let antes = self.vecinos.len();
        self.vecinos.retain(|_, v| ahora_ms.saturating_sub(v.visto_ms) < CADUCA_VECINO_MS);
        self.intentos.retain(|_, t| ahora_ms.saturating_sub(*t) < ENTRE_INTENTOS_MS * 4);
        antes != self.vecinos.len()
    }

    pub fn lista(&self) -> Vec<VecinoVisto> {
        let mut v: Vec<VecinoVisto> = self.vecinos.values().cloned().collect();
        v.sort_by(|a, b| b.rssi.cmp(&a.rssi).then_with(|| a.direccion.cmp(&b.direccion)));
        v
    }

    pub fn por_id(&self, id: &str) -> Option<VecinoVisto> {
        self.vecinos.values().find(|v| id_vecino(&v.direccion) == id).cloned()
    }

    pub fn marcar_intento(&mut self, direccion: &str, ahora_ms: u64) {
        self.intentos.insert(direccion.to_string(), ahora_ms);
    }

    /// A qué aparatos conectar SOLO ahora (como central): neuronas de TU cuenta que anuncian el
    /// servidor abierto, con señal suficiente, sin enlace ya, sin intento en los últimos 20 s y con
    /// sitio. Si las dos neuronas se conocen por id, conecta la de id MENOR (`conecto_yo`); si este
    /// aparato no sabe aún qué neurona es la otra (le falta en «conocidas»), conecta igual: es de tu
    /// cuenta. Una por llamada a cada neurona (la de mejor señal).
    pub fn a_conectar(
        &self,
        mi_neurona: Option<&str>,
        enlazada: &dyn Fn(&VecinoVisto) -> bool,
        enlaces_abiertos: usize,
        ahora_ms: u64,
    ) -> Vec<String> {
        let mut out: Vec<String> = Vec::new();
        let mut neuronas: Vec<String> = Vec::new();
        let mut sitio = MAX_ENLACES.saturating_sub(enlaces_abiertos);
        for v in self.lista() {
            if sitio == 0 {
                break;
            }
            if !v.propia || v.flags & FLAG_SERVIDOR == 0 || v.rssi < RSSI_MINIMO {
                continue;
            }
            if let (Some(mia), Some(suya)) = (mi_neurona, v.neurona.as_deref()) {
                if mia == suya || !conecto_yo(mia, suya) {
                    continue;
                }
            }
            if enlazada(&v) {
                continue;
            }
            if let Some(n) = &v.neurona {
                if neuronas.contains(n) {
                    continue;
                }
                neuronas.push(n.clone());
            }
            if self.intentos.get(&v.direccion).is_some_and(|t| ahora_ms.saturating_sub(*t) < ENTRE_INTENTOS_MS) {
                continue;
            }
            out.push(v.direccion.clone());
            sitio -= 1;
        }
        out
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    const CLAVE: [u8; 32] = [7u8; 32];
    const OTRA: [u8; 32] = [9u8; 32];
    const T: u64 = 1_791_608_253;

    fn json(n: usize) -> String {
        // Objeto JSON de exactamente `n` bytes (n ≥ 8).
        format!("{{\"x\":\"{}\"}}", "a".repeat(n - 8))
    }

    /// Mueve paquetes entre dos enlaces hasta que no quede nada. `perder(origen, paquete)` → true
    /// tira ese paquete por el camino. Devuelve lo entregado en cada lado.
    fn conversar(
        a: &mut Enlace,
        b: &mut Enlace,
        ahora: u64,
        perder: &mut dyn FnMut(char, &[u8]) -> bool,
    ) -> (Vec<String>, Vec<String>) {
        let (mut en_a, mut en_b) = (Vec::new(), Vec::new());
        let mut si = || true;
        for _ in 0..100_000 {
            let mut movido = false;
            if let Some(p) = a.siguiente_paquete(ahora) {
                movido = true;
                if !perder('a', &p) {
                    if let Some(c) = b.recibir(&p, ahora, &mut si) {
                        en_b.push(c);
                    }
                }
            }
            if let Some(p) = b.siguiente_paquete(ahora) {
                movido = true;
                if !perder('b', &p) {
                    if let Some(c) = a.recibir(&p, ahora, &mut si) {
                        en_a.push(c);
                    }
                }
            }
            if !movido {
                break;
            }
        }
        (en_a, en_b)
    }

    #[test]
    fn uuid_y_hex_ida_y_vuelta() {
        let b = uuid_bytes(SERVICIO).unwrap();
        assert_eq!(uuid_texto(&b), SERVICIO);
        assert_eq!(uuid_bytes(&SERVICIO.to_uppercase()), Some(b));
        assert_eq!(uuid_bytes("5353b1"), None);
        assert_eq!(uuid_bytes("zz53b100-0000-0000-0000-000000000000"), None);
        assert_eq!(&uuid_bytes(UUID_PREFIJO).unwrap()[..3], &PREFIJO_ANUNCIO);
        assert_eq!(de_hex(&a_hex(&[0, 1, 0xab, 0xff])), Some(vec![0, 1, 0xab, 0xff]));
        assert_eq!(de_hex("abc"), None);
        assert_eq!(de_hex("zz"), None);
        for u in [ENTRADA, SALIDA, CCCD] {
            assert!(uuid_bytes(u).is_some(), "{u}");
            assert!(!es_anuncio(&uuid_bytes(u).unwrap()), "{u} no se confunde con un anuncio");
        }
    }

    #[test]
    fn anuncio_reconoce_la_cuenta_y_la_neurona() {
        let b = construir_anuncio(Some(&CLAVE), Some("tablet-1"), TipoAparato::Android, FLAG_SERVIDOR, T, [1, 2, 3, 4]);
        assert!(es_anuncio(&b));
        assert!(uuid_texto(&b).starts_with("5353b1"));
        let a = leer_anuncio(&b).expect("anuncio válido");
        assert_eq!(a.tipo, TipoAparato::Android);
        assert_eq!(a.flags, FLAG_SERVIDOR);
        assert!(es_de_mi_cuenta(&a, &CLAVE, T));
        assert!(es_de_mi_cuenta(&a, &CLAVE, T + VENTANA_S), "ventana siguiente vale");
        assert!(es_de_mi_cuenta(&a, &CLAVE, T - VENTANA_S), "ventana anterior vale");
        assert!(!es_de_mi_cuenta(&a, &CLAVE, T + 3 * VENTANA_S), "más de una ventana: no");
        assert!(!es_de_mi_cuenta(&a, &OTRA, T), "otra cuenta no lo reconoce");
        let ids = vec!["mac-1".to_string(), "tablet-1".to_string()];
        assert_eq!(que_neurona(&a, &CLAVE, &ids), Some("tablet-1"));
        assert_eq!(que_neurona(&a, &OTRA, &ids), None);
        // El UUID leído como texto y vuelta (así lo pasan Kotlin y CoreBluetooth) sigue valiendo.
        let de_vuelta = uuid_bytes(&uuid_texto(&b)).unwrap();
        assert_eq!(leer_anuncio(&de_vuelta), Some(a));
    }

    #[test]
    fn anuncio_sin_clave_no_identifica_y_rota() {
        let b = construir_anuncio(None, Some("tablet-1"), TipoAparato::Escritorio, 0, T, [9; 4]);
        let a = leer_anuncio(&b).unwrap();
        assert_eq!(a.etiqueta_cuenta, [0; 4]);
        assert_eq!(a.etiqueta_neurona, [0; 4]);
        assert!(!es_de_mi_cuenta(&a, &CLAVE, T));
        let x = construir_anuncio(Some(&CLAVE), Some("x"), TipoAparato::Escritorio, 0, T, nonce_nuevo());
        let y = construir_anuncio(Some(&CLAVE), Some("x"), TipoAparato::Escritorio, 0, T, nonce_nuevo());
        assert_ne!(x[4..16], y[4..16], "dos anuncios de la misma neurona no se enlazan desde fuera");
        assert!(leer_anuncio(&[0u8; 16]).is_none());
        assert!(leer_anuncio(&b[..15]).is_none());
        assert!(conecto_yo("a", "b") && !conecto_yo("b", "a") && !conecto_yo("a", "a"));
    }

    #[test]
    fn trama_y_paquetes() {
        let t = trama("{\"t\":\"tu.msg\"}").unwrap();
        assert_eq!(&t[0..4], b"SSB1");
        assert_eq!(leer_cabecera_trama(&t), Ok(14));
        assert_eq!(trama("  "), Err(ErrorBle::Vacio));
        assert_eq!(trama("[1]"), Err(ErrorBle::NoJson));
        assert_eq!(trama(&json(MAX_CUERPO + 1)), Err(ErrorBle::Largo(MAX_CUERPO + 1)));
        assert!(trama(&json(MAX_CUERPO)).is_ok());
        let mut mala = t.clone();
        mala[4] = 9;
        assert_eq!(leer_cabecera_trama(&mala), Err(ErrorBle::Version(9)));
        mala[4] = VERSION;
        mala[6..10].copy_from_slice(&u32::MAX.to_be_bytes());
        assert_eq!(leer_cabecera_trama(&mala), Err(ErrorBle::Largo(u32::MAX as usize)), "la cabecera no puede pedir 4 GiB");
        assert_eq!(paquete_util(23), 20);
        assert_eq!(paquete_util(185), 182);
        assert_eq!(paquete_util(517), 512);
        assert_eq!(paquete_util(0), PAQUETE_MIN);
        let ps = trocear(7, &t, 20);
        assert_eq!(ps.len(), (t.len() + 14) / 15);
        assert!(ps.iter().all(|p| p.len() <= 20));
        assert_eq!(leer_paquete(&ps[1]), Some(Paquete::Datos { id: 7, idx: 1, datos: &ps[1][5..] }));
        assert_eq!(leer_paquete(&paquete_acuse(300)), Some(Paquete::Acuse { id: 300 }));
        assert_eq!(leer_paquete(&paquete_rechazo(1, R_LIMITE)), Some(Paquete::Rechazo { id: 1, motivo: R_LIMITE }));
        for basura in [&[][..], &[1, 0][..], &[9, 0, 0, 0, 0, 1][..], &[1, 0, 0, 0, 0][..], &[2, 0, 0, 0][..]] {
            assert!(leer_paquete(basura).is_none(), "{basura:?}");
        }
        assert!(leer_paquete(&vec![1u8; PAQUETE_MAX + 1]).is_none());
    }

    #[test]
    fn mensaje_grande_con_mtu_minimo_llega_entero_y_acusado() {
        let mut a = Enlace::nuevo(PAQUETE_MIN);
        let mut b = Enlace::nuevo(PAQUETE_MIN);
        let grande = json(MAX_CUERPO);
        a.encolar(1, &grande, 100).unwrap();
        a.encolar(2, "{\"t\":\"tu.msg\",\"n\":2}", 100).unwrap();
        assert_eq!(a.pendientes(), 2);
        let (en_a, en_b) = conversar(&mut a, &mut b, 150, &mut |_, _| false);
        assert!(en_a.is_empty());
        assert_eq!(en_b, vec![grande.clone(), "{\"t\":\"tu.msg\",\"n\":2}".to_string()], "en orden");
        let hechos = a.hechos();
        assert_eq!(hechos.iter().map(|h| h.token).collect::<Vec<_>>(), vec![1, 2]);
        assert!(hechos.iter().all(|h| h.resultado == Ok(50)), "{hechos:?}");
        assert_eq!(a.pendientes(), 0);
        assert_eq!(a.medidas.mensajes_enviados, 2);
        assert_eq!(b.medidas.mensajes_recibidos, 2);
        assert_eq!(b.medidas.bytes_recibidos as usize, grande.len() + 20 + 2 * CABECERA_TRAMA);
        assert!(a.medidas.rtt_ms.is_some());
    }

    #[test]
    fn los_dos_sentidos_a_la_vez() {
        let mut a = Enlace::nuevo(182);
        let mut b = Enlace::nuevo(509);
        for i in 0..5u64 {
            a.encolar(i, &format!("{{\"de\":\"a\",\"i\":{i}}}"), 0).unwrap();
            b.encolar(100 + i, &json(3000 + i as usize), 0).unwrap();
        }
        let (en_a, en_b) = conversar(&mut a, &mut b, 10, &mut |_, _| false);
        assert_eq!(en_b.len(), 5);
        assert_eq!(en_a.len(), 5);
        assert_eq!(en_a[4].len(), 3004);
        assert_eq!(a.hechos().len(), 5);
        assert_eq!(b.hechos().len(), 5);
    }

    #[test]
    fn paquete_perdido_se_pide_otra_vez_y_llega_una_vez() {
        let mut a = Enlace::nuevo(50);
        let mut b = Enlace::nuevo(50);
        let m = json(1000);
        a.encolar(9, &m, 0).unwrap();
        let mut tirados = 0;
        let (_, en_b) = conversar(&mut a, &mut b, 0, &mut |de, p| {
            // Se pierde el paquete 3 del primer intento.
            if de == 'a' && tirados == 0 && matches!(leer_paquete(p), Some(Paquete::Datos { idx: 3, .. })) {
                tirados += 1;
                return true;
            }
            false
        });
        assert_eq!(en_b, vec![m]);
        assert_eq!(a.hechos(), vec![Hecho { token: 9, resultado: Ok(1) }]);
        assert_eq!(a.medidas.reintentos, 1);
    }

    #[test]
    fn acuse_perdido_se_reenvia_y_no_se_entrega_dos_veces() {
        let mut a = Enlace::nuevo(100);
        let mut b = Enlace::nuevo(100);
        a.encolar(5, "{\"t\":\"x\"}", 0).unwrap();
        let mut perdido = false;
        let (_, en_b) = conversar(&mut a, &mut b, 0, &mut |de, p| {
            if de == 'b' && !perdido && matches!(leer_paquete(p), Some(Paquete::Acuse { .. })) {
                perdido = true;
                return true;
            }
            false
        });
        assert_eq!(en_b.len(), 1);
        assert!(a.hechos().is_empty(), "sin acuse aún");
        a.tic(PLAZO_ACUSE_MS - 1);
        assert!(!a.hay_paquetes(), "antes del plazo no se reenvía");
        a.tic(PLAZO_ACUSE_MS + 1);
        assert!(a.hay_paquetes(), "pasado el plazo, se reenvía");
        let (_, otra_vez) = conversar(&mut a, &mut b, PLAZO_ACUSE_MS + 2, &mut |_, _| false);
        assert!(otra_vez.is_empty(), "el receptor ya lo tenía: acusa sin entregarlo otra vez");
        assert_eq!(a.hechos(), vec![Hecho { token: 5, resultado: Ok(PLAZO_ACUSE_MS + 2) }]);
    }

    #[test]
    fn sin_acuse_nunca_tras_varios_intentos_falla_con_motivo() {
        let mut a = Enlace::nuevo(100);
        a.encolar(3, "{\"t\":\"x\"}", 0).unwrap();
        a.encolar(4, "{\"t\":\"y\"}", 0).unwrap();
        let mut t = 0;
        for _ in 0..MAX_INTENTOS {
            while a.siguiente_paquete(t).is_some() {}
            t += PLAZO_ACUSE_MS + 1;
            a.tic(t);
        }
        let h = a.hechos();
        assert_eq!(h.len(), 1);
        assert_eq!(h[0].token, 3);
        assert!(h[0].resultado.as_ref().unwrap_err().contains("sin acuse"));
        assert_eq!(a.pendientes(), 1, "el siguiente sale");
        a.tic(PLAZO_TOTAL_MS + 1);
        assert!(a.hechos()[0].resultado.as_ref().unwrap_err().contains("no salió"), "plazo total");
    }

    #[test]
    fn el_limitador_del_otro_rechaza_y_se_dice() {
        let mut a = Enlace::nuevo(100);
        let mut b = Enlace::nuevo(100);
        a.encolar(1, "{\"t\":\"x\"}", 0).unwrap();
        let mut no = || false;
        while let Some(p) = a.siguiente_paquete(0) {
            assert!(b.recibir(&p, 0, &mut no).is_none());
        }
        let r = b.siguiente_paquete(0).unwrap();
        assert_eq!(leer_paquete(&r), Some(Paquete::Rechazo { id: 0, motivo: R_LIMITE }));
        let mut si = || true;
        a.recibir(&r, 1, &mut si);
        let h = a.hechos();
        assert!(h[0].resultado.as_ref().unwrap_err().contains("limitador"));
    }

    #[test]
    fn cola_llena_cerrar_y_basura() {
        let mut a = Enlace::nuevo(512);
        let m = json(MAX_CUERPO);
        let mut n = 0;
        while a.encolar(n, &m, 0).is_ok() {
            n += 1;
        }
        assert!(n >= 16, "caben al menos 256 KiB");
        assert!(matches!(a.encolar(99, &m, 0), Err(ErrorBle::ColaLlena(_))));
        a.cerrar("el aparato se alejó");
        let h = a.hechos();
        assert_eq!(h.len() as u64, n);
        assert!(h.iter().all(|x| x.resultado == Err("el aparato se alejó".into())));
        assert!(!a.hay_paquetes());
        // Basura por la radio: se ignora o se rechaza, nunca se entrega.
        let mut b = Enlace::nuevo(512);
        let mut si = || true;
        assert!(b.recibir(&[0xff; 10], 0, &mut si).is_none());
        assert!(!b.hay_paquetes(), "lo que no es un paquete ni se contesta");
        let mut cab = trama("{\"a\":1}").unwrap();
        cab[6..10].copy_from_slice(&((MAX_CUERPO + 1) as u32).to_be_bytes());
        let mut p = vec![P_DATOS, 0, 4, 0, 0];
        p.extend_from_slice(&cab);
        assert!(b.recibir(&p, 0, &mut si).is_none());
        assert_eq!(leer_paquete(&b.siguiente_paquete(0).unwrap()), Some(Paquete::Rechazo { id: 4, motivo: R_GRANDE }));
        let mut no_utf8 = vec![P_DATOS, 0, 5, 0, 0];
        no_utf8.extend_from_slice(&MAGIA);
        no_utf8.extend_from_slice(&[VERSION, T_MENSAJE, 0, 0, 0, 3, b'{', 0xff, b'}']);
        assert!(b.recibir(&no_utf8, 0, &mut si).is_none());
        assert_eq!(leer_paquete(&b.siguiente_paquete(0).unwrap()), Some(Paquete::Rechazo { id: 5, motivo: R_INVALIDO }));
        // Un trozo suelto sin su principio pide el mensaje entero (una vez).
        assert!(b.recibir(&[P_DATOS, 0, 6, 0, 2, b'x'], 0, &mut si).is_none());
        assert!(b.recibir(&[P_DATOS, 0, 6, 0, 3, b'x'], 0, &mut si).is_none());
        assert_eq!(leer_paquete(&b.siguiente_paquete(0).unwrap()), Some(Paquete::Rechazo { id: 6, motivo: R_HUECO }));
        assert!(b.siguiente_paquete(0).is_none(), "un solo rechazo por mensaje");
    }

    #[test]
    fn vecindario_reconoce_desempata_y_caduca() {
        let mut v = Vecindario::nuevo();
        let ids = vec!["a-mac".to_string(), "m-tablet".to_string(), "z-movil".to_string()];
        let tablet = construir_anuncio(Some(&CLAVE), Some("m-tablet"), TipoAparato::Android, FLAG_SERVIDOR, T, [1; 4]);
        let ajena = construir_anuncio(Some(&OTRA), Some("x"), TipoAparato::Android, FLAG_SERVIDOR, T, [2; 4]);
        let sin_servidor = construir_anuncio(Some(&CLAVE), Some("z-movil"), TipoAparato::Android, 0, T, [3; 4]);
        assert!(v.ver("AA:01", &tablet, -60, 1_000, T, Some(&CLAVE), &ids));
        assert!(!v.ver("AA:01", &tablet, -58, 1_500, T, Some(&CLAVE), &ids), "el mismo: no es nuevo");
        assert!(v.ver("BB:02", &ajena, -40, 1_500, T, Some(&CLAVE), &ids));
        assert!(v.ver("CC:03", &sin_servidor, -50, 1_500, T, Some(&CLAVE), &ids));
        assert!(!v.ver("DD:04", &[0u8; 16], -50, 1_500, T, Some(&CLAVE), &ids), "lo que no es StarSeed no entra");
        let l = v.lista();
        assert_eq!(l.len(), 3);
        assert_eq!(l[0].direccion, "BB:02", "ordenados por señal");
        assert!(!l[0].propia && l[0].neurona.is_none(), "la ajena no dice nada");
        let t = v.lista().into_iter().find(|x| x.direccion == "AA:01").unwrap();
        assert!(t.propia && t.neurona.as_deref() == Some("m-tablet") && t.rssi == -58);
        let nada = |_: &VecinoVisto| false;
        // La Mac (id menor) conecta con la tableta; la tableta no conecta con la Mac.
        assert_eq!(v.a_conectar(Some("a-mac"), &nada, 0, 2_000), vec!["AA:01".to_string()]);
        assert!(v.a_conectar(Some("z-movil"), &nada, 0, 2_000).is_empty());
        assert!(v.a_conectar(Some("m-tablet"), &nada, 0, 2_000).is_empty(), "consigo misma no");
        assert!(v.a_conectar(Some("a-mac"), &|x: &VecinoVisto| x.direccion == "AA:01", 0, 2_000).is_empty(), "ya enlazada");
        assert!(v.a_conectar(Some("a-mac"), &nada, MAX_ENLACES, 2_000).is_empty(), "sin sitio");
        v.marcar_intento("AA:01", 2_000);
        assert!(v.a_conectar(Some("a-mac"), &nada, 0, 2_000 + ENTRE_INTENTOS_MS - 1).is_empty(), "intento reciente");
        assert_eq!(v.a_conectar(Some("a-mac"), &nada, 0, 2_000 + ENTRE_INTENTOS_MS).len(), 1);
        // Sin saber cuál es (le falta en «conocidas»), es de la cuenta: conecta igual.
        let mut w = Vecindario::nuevo();
        w.ver("EE:05", &tablet, -70, 0, T, Some(&CLAVE), &[]);
        assert_eq!(w.a_conectar(Some("z-ultima"), &nada, 0, 0), vec!["EE:05".to_string()]);
        // Señal muy baja: no se intenta.
        w.ver("EE:05", &tablet, RSSI_MINIMO - 1, 0, T, Some(&CLAVE), &[]);
        assert!(w.a_conectar(Some("z-ultima"), &nada, 0, 0).is_empty());
        assert_eq!(v.por_id(&id_vecino("AA:01")).map(|x| x.direccion), Some("AA:01".to_string()));
        assert!(id_vecino("AA:01").starts_with('v') && id_vecino("AA:01").len() == 9);
        assert!(v.caducar(1_500 + CADUCA_VECINO_MS));
        assert!(v.lista().is_empty());
    }
}
