//! (AND1115K) Control entre mis neuronas, fases 2–3 · la parte PURA del lado nativo de la entrada y la pantalla:
//! verificación de la orden firmada, controladores aceptados, límite de 60 por segundo, forma de cada orden de
//! entrada, regla G y números de la pantalla. Sin E/S: se prueba en cualquier sistema con `cargo test --lib`.
//!
//! Lo que firma la web (`src/lib/control-remoto/orden.ts` + `chats-genesis/firma-aparato.ts`):
//!   · sobre = `{ v:1, carga:<base64url de los bytes de JSON.stringify(carga)>, firma:<base64url r‖s de 64 bytes> }`;
//!   · firma = ECDSA P-256 / SHA-256 sobre esos bytes exactos, con la clave del aparato que manda;
//!   · `carga.de` = SHA-256 (hex) de la SPKI DER de esa clave; `carga.aud` = «starseed.control-neuronas.v1».
//! Aquí se comprueba contra la SPKI que la PERSONA aceptó en el diálogo nativo (nunca contra lo que traiga la página).

#![allow(dead_code)] // en escritorio solo se usa lo que prueban los tests; todo se usa en Android

use crate::sha256::{hex, sha256};
use base64::Engine as _;
use p256::ecdsa::{signature::Verifier, Signature, VerifyingKey};
use serde_json::{json, Value};
use std::collections::{HashMap, VecDeque};

pub const AUD_CONTROL: &str = "starseed.control-neuronas.v1";
/// §2.4: una orden vive 2 min; los relojes de las dos puntas pueden diferir ±5 min.
pub const VIDA_ORDEN_MS: i64 = 120_000;
pub const DESFASE_MAX_MS: i64 = 5 * 60_000;
pub const MAX_CARGA_ORDEN: usize = 4096;
/// §2.4: como mucho 60 órdenes de entrada por segundo.
pub const LIMITE_POR_SEGUNDO: usize = 60;
pub const MAX_TEXTO: usize = 512;
pub const MAX_DEDOS: usize = 10;
pub const MAX_PUNTOS: usize = 64; // UNI1115M: el mismo tope que el vocabulario de la web (contrato §2.4)
/// `GestureDescription.getMaxGestureDuration()` es 60 s.
pub const MAX_GESTO_MS: u64 = 60_000;
/// Un toque local mantiene el control en pausa hasta que pasan 3 s sin otro (seam, regla 5).
pub const PAUSA_LOCAL_MS: u64 = 3_000;

pub const TECLAS: [&str; 11] = [
    "atras",
    "inicio",
    "recientes",
    "notificaciones",
    "ajustes-rapidos",
    "bloquear",
    "captura",
    "volumen-subir",
    "volumen-bajar",
    "silencio",
    "menu-energia",
];
pub const FLUJOS: [&str; 4] = ["multimedia", "llamada", "timbre", "alarma"];
/// Lo que la página puede pedir que se abra para arreglar una cosa que falta (lista cerrada).
pub const AJUSTES: [&str; 5] = ["servicio-accesibilidad", "ajustes-restringidos", "consentimiento-pantalla", "escribir-ajustes", "consentimiento-proyeccion"]; // PENC2: la quinta abre el diálogo de la proyección

/// Los únicos `motivo` que devuelve `control_entrada` (seam 1).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Motivo {
    Firma,
    NoAutorizado,
    Sesion,
    ReglaG,
    PausaLocal,
    Limite,
    SinServicio,
    SinSoporte,
}

impl Motivo {
    pub fn codigo(self) -> &'static str {
        match self {
            Motivo::Firma => "firma",
            Motivo::NoAutorizado => "no-autorizado",
            Motivo::Sesion => "sesion",
            Motivo::ReglaG => "regla-g",
            Motivo::PausaLocal => "pausa-local",
            Motivo::Limite => "limite",
            Motivo::SinServicio => "sin-servicio",
            Motivo::SinSoporte => "sin-soporte",
        }
    }
    pub fn desde_codigo(c: &str) -> Option<Motivo> {
        [Motivo::Firma, Motivo::NoAutorizado, Motivo::Sesion, Motivo::ReglaG, Motivo::PausaLocal, Motivo::Limite, Motivo::SinServicio, Motivo::SinSoporte]
            .into_iter()
            .find(|m| m.codigo() == c)
    }
}

// ─────────────────────────── base64url, SPKI, huella, código ───────────────────────────

pub fn de_b64url(s: &str) -> Option<Vec<u8>> {
    if s.is_empty() || !s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_') {
        return None;
    }
    base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(s).ok()
}

/// Cabecera fija de una SPKI DER de P-256 sin comprimir (26 bytes) + el punto 04‖X‖Y (65 bytes).
const CABECERA_SPKI_P256: [u8; 26] = [
    0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00,
];

/// La clave pública de una SPKI (base64url) de P-256, o None si no lo es o el punto no está en la curva.
pub fn clave_de_spki(spki_b64: &str) -> Option<(VerifyingKey, [u8; 32])> {
    let der = de_b64url(spki_b64)?;
    if der.len() != 91 || der[..26] != CABECERA_SPKI_P256 || der[26] != 0x04 {
        return None;
    }
    let k = VerifyingKey::from_sec1_bytes(&der[26..]).ok()?;
    Some((k, sha256(&der)))
}

/// Huella (hex) de una SPKI: lo que `carga.de` lleva y lo que la web llama «huella».
pub fn huella_de_spki(spki_b64: &str) -> Option<String> {
    clave_de_spki(spki_b64).map(|(_, h)| hex(&h))
}

const ALFABETO_B32: &[u8; 32] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

fn base32(bytes: &[u8]) -> String {
    let (mut bits, mut valor, mut out) = (0u32, 0u32, String::new());
    for b in bytes {
        valor = (valor << 8) | u32::from(*b);
        bits += 8;
        while bits >= 5 {
            out.push(ALFABETO_B32[((valor >> (bits - 5)) & 31) as usize] as char);
            bits -= 5;
        }
    }
    if bits > 0 {
        out.push(ALFABETO_B32[((valor << (5 - bits)) & 31) as usize] as char);
    }
    out
}

/// Código visible del aparato (`codigoDe` de firma-aparato.ts): lo que la persona compara en el diálogo nativo.
pub fn codigo_de(huella_hex: &str, cuenta: &str) -> String {
    let texto = format!("starseed.genesis.emparejar.v1\n{}\n{}", huella_hex.to_lowercase(), cuenta.trim().to_lowercase());
    let c = base32(&sha256(texto.as_bytes())[..8]);
    format!("{}-{}-{}", &c[0..4], &c[4..8], &c[8..12])
}

// ─────────────────────────── Controladores aceptados ───────────────────────────

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Aceptado {
    pub spki: String,
    pub huella: String,
    pub nombre: String,
    pub cuenta: String,
}

/// Lee `aceptados.json` (lo escribe SOLO Kotlin, con el «Sí» del diálogo nativo). Lo que no es una SPKI P-256
/// válida se ignora; la huella se recalcula (no se fía de la guardada).
pub fn leer_aceptados(texto: &str) -> Vec<Aceptado> {
    let Ok(v) = serde_json::from_str::<Value>(texto) else { return Vec::new() };
    let Some(lista) = v.get("controladores").and_then(|x| x.as_array()) else { return Vec::new() };
    lista
        .iter()
        .filter_map(|c| {
            let spki = c.get("spki")?.as_str()?;
            let huella = huella_de_spki(spki)?;
            Some(Aceptado {
                spki: spki.to_string(),
                huella,
                nombre: c.get("nombre").and_then(|x| x.as_str()).unwrap_or("").chars().filter(|c| !c.is_control()).take(40).collect(),
                cuenta: c.get("cuenta").and_then(|x| x.as_str()).unwrap_or("").chars().take(100).collect(),
            })
        })
        .collect()
}

// ─────────────────────────── Hora ───────────────────────────

fn dias_desde_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// `YYYY-MM-DDTHH:MM:SS[.fff](Z|±HH:MM)` → milisegundos Unix. Lo que `Date.toISOString()` produce.
pub fn iso_a_ms(t: &str) -> Option<i64> {
    let b = t.as_bytes();
    if b.len() < 20 || !t.is_ascii() {
        return None;
    }
    let n = |a: usize, z: usize| -> Option<i64> { t.get(a..z)?.parse::<i64>().ok().filter(|_| t.as_bytes()[a..z].iter().all(u8::is_ascii_digit)) };
    if b[4] != b'-' || b[7] != b'-' || (b[10] != b'T' && b[10] != b' ') || b[13] != b':' || b[16] != b':' {
        return None;
    }
    let (y, mo, d, h, mi, s) = (n(0, 4)?, n(5, 7)?, n(8, 10)?, n(11, 13)?, n(14, 16)?, n(17, 19)?);
    if !(1..=12).contains(&mo) || !(1..=31).contains(&d) || h > 23 || mi > 59 || s > 60 {
        return None;
    }
    let mut i = 19;
    let mut ms = 0i64;
    if b[i] == b'.' {
        let ini = i + 1;
        i = ini;
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
        }
        let frac = &t[ini..i];
        if frac.is_empty() {
            return None;
        }
        let tres: String = frac.chars().chain("000".chars()).take(3).collect();
        ms = tres.parse().ok()?;
    }
    let desfase_min = match t.get(i..)? {
        "Z" => 0,
        r if r.len() == 6 && (r.starts_with('+') || r.starts_with('-')) && r.as_bytes()[3] == b':' => {
            let hh: i64 = r.get(1..3)?.parse().ok()?;
            let mm: i64 = r.get(4..6)?.parse().ok()?;
            let v = hh * 60 + mm;
            if r.starts_with('-') { -v } else { v }
        }
        _ => return None,
    };
    Some(((dias_desde_civil(y, mo, d) * 86_400 + h * 3_600 + mi * 60 + s - desfase_min * 60) * 1000) + ms)
}

// ─────────────────────────── Estado de verificación ───────────────────────────

/// Lo que se recuerda para no aceptar dos veces lo mismo: último `seq` por aparato y nonces recientes.
#[derive(Debug, Default)]
pub struct Vistos {
    seq: HashMap<String, u64>,
    nonces: VecDeque<String>,
    recientes: VecDeque<u64>,
}

impl Vistos {
    pub fn olvidar(&mut self) {
        *self = Vistos::default();
    }

    /// ¿Cabe una orden más ahora? (ventana deslizante de 1 s). Cuenta solo las que caben.
    pub fn cabe(&mut self, ahora_ms: u64) -> bool {
        while self.recientes.front().is_some_and(|t| ahora_ms.saturating_sub(*t) >= 1_000) {
            self.recientes.pop_front();
        }
        if self.recientes.len() >= LIMITE_POR_SEGUNDO {
            return false;
        }
        self.recientes.push_back(ahora_ms);
        true
    }
}

/// Una orden de entrada ya comprobada y con la carga útil normalizada.
#[derive(Debug, Clone, PartialEq)]
pub struct OrdenEntrada {
    pub nombre: String,
    pub args: Value,
    pub de: String,
    pub seq: u64,
}

fn es_nonce(s: &str) -> bool {
    (16..=64).contains(&s.len()) && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

fn es_hex(s: &str, n: usize) -> bool {
    s.len() == n && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// FSG1116 · Una carga ya leída y con la firma comprobada contra un controlador ACEPTADO en este aparato.
#[derive(Debug, Clone)]
pub struct Firmada {
    pub de: String,
    pub nivel: String,
    pub sesion: Option<String>,
    pub seq: u64,
    pub nonce: String,
    pub t: i64,
    pub caduca: i64,
    pub nombre: String,
    pub args: Value,
    pub aceptado: Aceptado,
}

/// Forma → aceptado → firma. Lo comparten la entrada (`verificar_sobre`) y la apertura de sesión
/// (`verificar_apertura`), para que las dos digan lo mismo de una misma orden.
pub fn leer_firmada(sobre: &Value, aceptados: &[Aceptado]) -> Result<Firmada, (Motivo, &'static str)> {
    use Motivo::*;
    let o = sobre.as_object().ok_or((Firma, "sobre-sin-forma"))?;
    if o.get("v").and_then(|x| x.as_u64()) != Some(1) {
        return Err((Firma, "sobre-v"));
    }
    let (Some(carga_b64), Some(firma_b64)) = (o.get("carga").and_then(|x| x.as_str()), o.get("firma").and_then(|x| x.as_str())) else {
        return Err((Firma, "sobre-campos"));
    };
    if carga_b64.len() > MAX_CARGA_ORDEN * 2 {
        return Err((Firma, "carga-grande"));
    }
    let bytes = de_b64url(carga_b64).filter(|b| b.len() <= MAX_CARGA_ORDEN).ok_or((Firma, "carga-b64"))?;
    let firma = de_b64url(firma_b64).filter(|f| f.len() == 64).ok_or((Firma, "firma-forma"))?;
    let c: Value = serde_json::from_slice(&bytes).map_err(|_| (Firma, "carga-json"))?;
    let co = c.as_object().ok_or((Firma, "carga-forma"))?;
    // Forma estricta, la misma que `leerOrden` de la web.
    if co.get("aud").and_then(|x| x.as_str()) != Some(AUD_CONTROL) || co.get("v").and_then(|x| x.as_u64()) != Some(1) {
        return Err((Firma, "aud"));
    }
    let de = co.get("de").and_then(|x| x.as_str()).filter(|d| es_hex(d, 64)).ok_or((Firma, "de"))?;
    let cuenta_ok = co.get("cuenta").and_then(|x| x.as_str()).is_some_and(|s| !s.is_empty() && s.chars().count() <= 100);
    let para_ok = co.get("para").and_then(|x| x.as_str()).is_some_and(|s| (1..=100).contains(&s.len()) && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-'));
    let nivel = co.get("nivel").and_then(|x| x.as_str()).filter(|n| matches!(*n, "ver" | "controlar")).ok_or((Firma, "nivel"))?;
    let ses_carga = match co.get("sesion") {
        Some(Value::Null) | None => None,
        Some(Value::String(s)) if es_hex(s, 32) => Some(s.clone()),
        _ => return Err((Firma, "sesion-forma")),
    };
    let seq = co.get("seq").and_then(|x| x.as_u64()).filter(|s| *s >= 1 && *s < (1u64 << 53)).ok_or((Firma, "seq"))?;
    let nonce = co.get("nonce").and_then(|x| x.as_str()).filter(|n| es_nonce(n)).ok_or((Firma, "nonce"))?;
    let t = co.get("t").and_then(|x| x.as_str()).and_then(iso_a_ms).ok_or((Firma, "t"))?;
    let caduca = co.get("caduca").and_then(|x| x.as_str()).and_then(iso_a_ms).ok_or((Firma, "caduca"))?;
    let accion = co.get("accion").and_then(|x| x.as_object()).ok_or((Firma, "accion"))?;
    let nombre = accion.get("nombre").and_then(|x| x.as_str()).ok_or((Firma, "accion-nombre"))?;
    let args = accion.get("args").filter(|a| a.is_object()).ok_or((Firma, "accion-args"))?;
    if !cuenta_ok || !para_ok {
        return Err((Firma, "cuenta-o-para"));
    }

    // ¿Es un controlador que la persona aceptó EN este aparato?
    let acep = aceptados.iter().find(|a| a.huella == de).ok_or((NoAutorizado, "controlador-no-aceptado"))?;
    let (clave, _) = clave_de_spki(&acep.spki).ok_or((NoAutorizado, "clave-aceptada-invalida"))?;
    let sig = Signature::from_slice(&firma).map_err(|_| (Firma, "firma-forma"))?;
    clave.verify(&bytes, &sig).map_err(|_| (Firma, "firma-no-casa"))?;
    Ok(Firmada { de: de.into(), nivel: nivel.into(), sesion: ses_carga, seq, nonce: nonce.into(), t, caduca, nombre: nombre.into(), args: args.clone(), aceptado: acep.clone() })
}

/// Reloj (±5 min entre las dos puntas) y vida de 2 min.
fn en_hora(f: &Firmada, ahora_ms: i64) -> Result<(), (Motivo, &'static str)> {
    if (ahora_ms - f.t).abs() > DESFASE_MAX_MS {
        return Err((Motivo::Firma, "reloj"));
    }
    if ahora_ms > f.caduca + DESFASE_MAX_MS || f.caduca < f.t || f.caduca - f.t > VIDA_ORDEN_MS + 1_000 {
        return Err((Motivo::Firma, "caducada"));
    }
    Ok(())
}

fn no_repetida(f: &Firmada, vistos: &Vistos) -> Result<(), (Motivo, &'static str)> {
    if vistos.seq.get(&f.de).is_some_and(|ultimo| f.seq <= *ultimo) || vistos.nonces.iter().any(|n| *n == f.nonce) {
        return Err((Motivo::Firma, "repetida"));
    }
    Ok(())
}

fn anotar_vista(f: &Firmada, vistos: &mut Vistos) {
    vistos.seq.insert(f.de.clone(), f.seq);
    vistos.nonces.push_back(f.nonce.clone());
    while vistos.nonces.len() > 256 {
        vistos.nonces.pop_front();
    }
}

/// FSG1116 · A2: lo que abre una sesión en el aparato controlado, decidido en lo NATIVO.
#[derive(Debug, Clone, PartialEq)]
pub struct Apertura {
    /// Huella del controlador (la de `aceptados.json`, no la que diga la página).
    pub de: String,
    /// El nombre que la PERSONA aceptó en el diálogo nativo: el que enseña el indicador.
    pub nombre: String,
    /// El menor entre lo que firmó el controlador y lo que la página concede (la página solo puede bajar).
    pub nivel: String,
    /// (CTL1117H) El color público que FIRMÓ el controlador (`#rrggbb`) o, si falta o no vale, el por defecto de su huella.
    pub color: String,
    /// (CTL1117K) De dónde sale `nombre`: `aceptados` (lo que la persona aceptó en el diálogo nativo) o `defecto` («otra neurona», porque la
    /// lista no traía nombre). `pagina` solo lo pone quien abre sin entrada nativa (escritorio). Va a la línea `control-indicador`.
    pub nombre_origen: &'static str,
    /// (CTL1117K) El código de 12 caracteres del controlador (el mismo del diálogo de aceptación): el panel del punto lo enseña junto al nombre.
    pub codigo: String,
}

/// FSG1116 · A2: la orden firmada `abrir-sesion` de un controlador ACEPTADO aquí, en hora y no repetida. Sin ella
/// no hay sesión, ni pantalla, ni cuadros. `nivel_pagina` es lo que la página concede: puede bajar el nivel firmado,
/// nunca subirlo. `vistos` es propio de las aperturas y NO se olvida al cerrar una sesión (una apertura vieja no
/// sirve para abrir otra). Los argumentos de `abrir-sesion` van vacíos (`sinArgs` de la web).
pub fn verificar_apertura(sobre: &Value, aceptados: &[Aceptado], nivel_pagina: &str, ahora_ms: i64, vistos: &mut Vistos) -> Result<Apertura, (Motivo, &'static str)> {
    let f = leer_firmada(sobre, aceptados)?;
    if f.nombre != "abrir-sesion" {
        return Err((Motivo::Firma, "no-es-abrir-sesion"));
    }
    // CTL1117H: los argumentos son vacíos o SOLO `color` (texto); cualquier otra cosa sigue siendo «forma».
    let color_firmado = f.args.get("color").and_then(|c| c.as_str()).map(str::to_string);
    if f.sesion.is_some() || f.args.as_object().is_some_and(|a| a.keys().any(|k| k != "color") || a.len() > 1 || (a.len() == 1 && color_firmado.is_none())) {
        return Err((Motivo::Firma, "abrir-sesion-forma"));
    }
    en_hora(&f, ahora_ms)?;
    no_repetida(&f, vistos)?;
    let nivel = match (f.nivel.as_str(), nivel_pagina) {
        ("controlar", "controlar") => "controlar",
        (_, "ver" | "controlar") => "ver",
        _ => return Err((Motivo::Sesion, "nivel")),
    };
    anotar_vista(&f, vistos);
    let (nombre, nombre_origen) = {
        let n: String = f.aceptado.nombre.chars().filter(|c| !c.is_control()).take(40).collect();
        if n.trim().is_empty() { ("otra neurona".to_string(), "defecto") } else { (n.trim().to_string(), "aceptados") }
    };
    let color = crate::control_ajustes::color_o_defecto(color_firmado.as_deref(), &f.de);
    let codigo = codigo_de(&f.de, &f.aceptado.cuenta);
    Ok(Apertura { de: f.de, nombre, nivel: nivel.into(), color, nombre_origen, codigo })
}

/// Comprueba el sobre contra los aceptados, la sesión (token y nivel) y el reloj. Devuelve la orden o el
/// `Motivo` con el que se rechaza (y un detalle corto SOLO para el registro, nunca contenido de la orden).
/// El orden es: forma → aceptado → firma → sesión/nivel → reloj → repetición → límite. Nada de esto toca Kotlin.
pub fn verificar_sobre(sobre: &Value, aceptados: &[Aceptado], sesion: &str, nivel_sesion: &str, ahora_ms: i64, vistos: &mut Vistos) -> Result<OrdenEntrada, (Motivo, &'static str)> {
    use Motivo::*;
    let f = leer_firmada(sobre, aceptados)?;
    let (de, nivel, ses_carga, nombre) = (f.de.as_str(), f.nivel.as_str(), f.sesion.as_deref(), f.nombre.as_str());

    // La sesión abierta y su nivel: la carga debe ir atada a ESTA sesión y pedir `controlar`.
    if ses_carga != Some(sesion) {
        return Err((Sesion, "sesion-distinta"));
    }
    if nivel != "controlar" || nivel_sesion != "controlar" {
        return Err((Sesion, "nivel"));
    }

    en_hora(&f, ahora_ms)?;
    no_repetida(&f, vistos)?;
    let args = normalizar(nombre, &f.args).map_err(|d| (Firma, d))?;
    if !vistos.cabe(ahora_ms.max(0) as u64) {
        return Err((Limite, "mas-de-60-por-segundo"));
    }
    anotar_vista(&f, vistos);
    let seq = f.seq;
    Ok(OrdenEntrada { nombre: nombre.to_string(), args, de: de.to_string(), seq })
}

fn num01(v: &Value) -> Option<f64> {
    v.as_f64().filter(|x| x.is_finite() && (-0.001..=1.001).contains(x)).map(|x| x.clamp(0.0, 1.0))
}

/// Forma de cada orden de entrada (seam 2). Devuelve la carga útil normalizada (x, y dentro de 0..1).
pub fn normalizar(nombre: &str, args: &Value) -> Result<Value, &'static str> {
    match nombre {
        "gesto" => {
            let dedos = args.get("dedos").and_then(|d| d.as_array()).filter(|d| (1..=MAX_DEDOS).contains(&d.len())).ok_or("gesto-dedos")?;
            let sigue = args.get("sigue").and_then(|s| s.as_bool()).ok_or("gesto-sigue")?;
            let mut ids = [false; 10];
            let mut salida = Vec::new();
            for d in dedos {
                let id = d.get("id").and_then(|i| i.as_u64()).filter(|i| *i <= 9).ok_or("gesto-id")? as usize;
                if std::mem::replace(&mut ids[id], true) {
                    return Err("gesto-id-repetido");
                }
                let pts = d.get("puntos").and_then(|p| p.as_array()).filter(|p| (1..=MAX_PUNTOS).contains(&p.len())).ok_or("gesto-puntos")?;
                let mut total = 0u64;
                let mut norm = Vec::new();
                for p in pts {
                    let a = p.as_array().filter(|a| a.len() == 3).ok_or("gesto-punto")?;
                    let (x, y) = (num01(&a[0]).ok_or("gesto-x")?, num01(&a[1]).ok_or("gesto-y")?);
                    let dt = a[2].as_u64().filter(|t| *t <= MAX_GESTO_MS).ok_or("gesto-dt")?;
                    total += dt;
                    norm.push(json!([x, y, dt]));
                }
                if total > MAX_GESTO_MS {
                    return Err("gesto-largo");
                }
                salida.push(json!({ "id": id, "puntos": norm }));
            }
            Ok(json!({ "dedos": salida, "sigue": sigue }))
        }
        "tecla" => {
            let cual = args.get("cual").and_then(|c| c.as_str()).filter(|c| TECLAS.contains(c)).ok_or("tecla")?;
            Ok(json!({ "cual": cual }))
        }
        "volumen" => {
            let flujo = args.get("flujo").and_then(|c| c.as_str()).filter(|c| FLUJOS.contains(c)).ok_or("volumen-flujo")?;
            let nivel = args.get("nivel").and_then(num01).ok_or("volumen-nivel")?;
            Ok(json!({ "flujo": flujo, "nivel": nivel }))
        }
        "brillo" => Ok(json!({ "nivel": args.get("nivel").and_then(num01).ok_or("brillo-nivel")? })),
        "texto" => {
            let t = args.get("texto").and_then(|t| t.as_str()).filter(|t| !t.is_empty() && t.chars().count() <= MAX_TEXTO && !t.contains('\0')).ok_or("texto")?;
            Ok(json!({ "texto": t }))
        }
        _ => Err("orden-desconocida"),
    }
}

// ─────────────────────────── Regla G (FSG1116: por paquete y tipo de ventana, una sola lista) ───────────────────────────

/// La ÚNICA lista (Rust la lee aquí; build.rs escribe con ella ReglaGStarSeed.kt para Kotlin).
pub const REGLA_G_TXT: &str = include_str!("control_regla_g.txt");

/// (protegidos, sistema) de `control_regla_g.txt`. Una línea mal formada hace fallar la prueba, no se ignora.
pub fn regla_g_listas() -> (Vec<&'static str>, Vec<&'static str>) {
    let (mut p, mut s) = (Vec::new(), Vec::new());
    for l in REGLA_G_TXT.lines().map(str::trim).filter(|l| !l.is_empty() && !l.starts_with('#')) {
        match l.split_once(' ') {
            Some(("protegido", x)) => p.push(x.trim()),
            Some(("sistema", x)) => s.push(x.trim()),
            Some(("salida", _)) => {} // CTL1117A: ver `regla_g_salida`
            _ => panic!("control_regla_g.txt: línea sin forma «{l}»"),
        }
    }
    (p, s)
}

/// (CTL1117A) Los paquetes `salida` de `control_regla_g.txt`: desde ellos (y desde la propia app) Inicio puede salir.
pub fn regla_g_salida() -> Vec<&'static str> {
    REGLA_G_TXT.lines().map(str::trim).filter_map(|l| l.strip_prefix("salida ")).map(str::trim).collect()
}

/// Una ventana a la vista tal como la da Android (`AccessibilityWindowInfo`): su paquete (None si no se sabe) y si es
/// de tipo APLICACIÓN (una actividad o un diálogo de actividad; la cortina, los ajustes rápidos, el teclado y las
/// superposiciones no lo son).
#[derive(Debug, Clone, Copy)]
pub struct VentanaG<'a> {
    pub paquete: Option<&'a str>,
    pub actividad: bool,
    /// (CTL1117E) Es la ventana activa o tiene el foco (`isActive || isFocused`): un diálogo de verdad, no un aviso suelto.
    pub foco: bool,
}

/// Lo que mira la regla G en el instante de DESPACHAR cada trazo (no al encolarlo). Kotlin repite esta función
/// (`ControlEntradaNativo.reglaG`) con las mismas cláusulas; una prueba lo comprueba. Ante la duda, `true` (se niega).
pub fn regla_g(ventanas: &[VentanaG], propio: &str, bloqueada: bool, congelada: bool, contrasena: bool) -> bool {
    if congelada || bloqueada || contrasena || ventanas.is_empty() {
        return true;
    }
    let (protegidos, sistema) = regla_g_listas();
    ventanas.iter().any(|v| match v.paquete.map(str::to_lowercase) {
        None => v.actividad, // una actividad de quien no se sabe: no se toca
        Some(p) => protegidos.iter().any(|x| p == *x) || (v.actividad && (p == propio || sistema.iter().any(|x| p == *x))),
    })
}

/// (CTL1117K · S2) El alcance del control en el aparato controlado: `total` (por defecto; un valor ausente o desconocido también lo es)
/// o `protegido`. Lo guarda la página DE ESE aparato junto a los demás ajustes locales (`control_ajustes.rs`); ninguna orden remota lo cambia.
pub fn alcance_efectivo(a: &str) -> &'static str {
    if a == "protegido" { "protegido" } else { "total" }
}

/// (CTL1117K · S2) La regla G con el alcance. `total` (decisión del dueño, 17-11): no niega ninguna ventana ni app (StarSeed OS, Ajustes,
/// tiendas, instaladores, diálogos del sistema, campos de contraseña); solo se niega con el aparato BLOQUEADO o con un consentimiento de
/// este control abierto (`congelada`: nada remoto puede pulsar un «Sí»). `protegido` es `regla_g` tal cual. Kotlin repite esta función
/// (`reglaGTotal` + `ventanaProtegida`); una prueba compara las cláusulas.
pub fn regla_g_con_alcance(alcance: &str, ventanas: &[VentanaG], propio: &str, bloqueada: bool, congelada: bool, contrasena: bool) -> bool {
    if alcance_efectivo(alcance) == "total" {
        return bloqueada || congelada;
    }
    regla_g(ventanas, propio, bloqueada, congelada, contrasena)
}

/// (CTL1117K) Ventana, en ms, en la que una cancelación llega TAN pronto tras despachar un trozo que no puede ser un dedo: es Android
/// rechazando el gesto (continuación inválida, gesto que no cabe…). Medido en la ronda .52: `desde-gesto-ms=2` y `=3`.
pub const CANCELACION_INMEDIATA_MS: i64 = 25;
/// (CTL1117K) Cuántas cancelaciones «inmediatas» seguidas (sin un solo trozo completado entre medias) se perdonan; la siguiente cuenta
/// como un dedo: un dedo apoyado en el cristal haría que Android cancelara cada trozo al instante y nunca pausaría.
pub const CANCELACIONES_PROPIAS_SEGUIDAS_MAX: u32 = 2;

/// (CTL1117K) Lo que se sabe de una cancelación que Android avisa (`GestureResultCallback.onCancelled`) o de un despacho que falló.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CancelacionVista {
    /// `dispatchGesture` devolvió false o lanzó una excepción (nada llegó a Android).
    pub rechazado_al_despachar: bool,
    /// El aviso es de un despacho que ya no es el último (hay uno más nuevo): no es de lo que está en el aire.
    pub obsoleta: bool,
    /// NUESTRO código cortó o soltó el gesto a propósito (`cortar`, `soltarTodo`, una pausa, la regla G, un consentimiento).
    pub pedida_por_nosotros: bool,
    /// Ms entre despachar el trozo y recibir el aviso.
    pub ms_desde_despacho: i64,
    /// Cancelaciones propias «inmediatas» seguidas hasta ahora.
    pub inmediatas_seguidas: u32,
}

/// (CTL1117K) ¿La cancelación la causó NUESTRO código? `Some(causa)` = sí (no es un dedo: no pausa); `None` = sin causa nuestra, cuenta como
/// toque local y pausa. Una causa de las cuatro, por este orden. El dedo de verdad sigue pausando por la ventana que oye ACTION_OUTSIDE.
pub fn causa_cancelacion_propia(c: &CancelacionVista) -> Option<&'static str> {
    if c.rechazado_al_despachar {
        return Some("despacho-rechazado");
    }
    if c.obsoleta {
        return Some("obsoleta");
    }
    if c.pedida_por_nosotros {
        return Some("cortada");
    }
    if c.ms_desde_despacho <= CANCELACION_INMEDIATA_MS && c.inmediatas_seguidas < CANCELACIONES_PROPIAS_SEGUIDAS_MAX {
        return Some("inmediata");
    }
    None
}

/// (CTL1117A) Lo ÚNICO que se deja pasar desde una ventana protegida (regla G): la tecla Inicio, para salir de Ajustes o
/// de una tienda. Decisión del dueño (16-11): «con una ventana protegida delante (StarSeed OS, Ajustes, tiendas) pasa
/// únicamente la tecla Inicio, y nunca mientras haya un diálogo de permiso abierto». LISTA POSITIVA, ante la duda se
/// niega: Inicio pasa solo si TODAS las ventanas protegidas a la vista son de la propia app o de un paquete `salida` de
/// `control_regla_g.txt`. Con a la vista un gestor o diálogo de permisos, un instalador, credenciales/cuentas/certificados,
/// managedprovisioning o una actividad de systemui (captura, USB…), se niega; igual con congelada (consentimiento de este
/// control abierto o pedido), pantalla bloqueada, contraseña con foco o ninguna ventana. Kotlin repite esta función
/// (`ControlEntradaNativo.reglaGInicio`); una prueba compara.
pub fn regla_g_deja_inicio(ventanas: &[VentanaG], propio: &str, bloqueada: bool, congelada: bool, contrasena: bool) -> bool {
    if congelada || bloqueada || contrasena || ventanas.is_empty() {
        return false;
    }
    let (protegidos, sistema) = regla_g_listas();
    let salida = regla_g_salida();
    ventanas.iter().all(|v| match v.paquete.map(str::to_lowercase) {
        None => !v.actividad, // una actividad de quien no se sabe: se niega
        Some(p) => {
            // CTL1117E: una actividad de `sistema` (systemui…) que NO es la activa ni tiene el foco (un aviso emergente, una barra
            // flotante) no es un diálogo y no niega Inicio; las de `protegido` niegan siempre (permisos, instaladores, credenciales).
            let protegida = protegidos.iter().any(|x| p == *x) || (v.actividad && (p == propio || (v.foco && sistema.iter().any(|x| p == *x))));
            !protegida || p == propio || salida.iter().any(|x| p == *x)
        }
    })
}

/// (CTL1117C · FALLO 2) Una ventana SIN raíz (Android no dio su árbol) cuenta como la propia app solo si está PROBADO: es la ventana
/// activa y la raíz de la ventana activa es de la propia app. Sin esa prueba sigue siendo «actividad de quien no se sabe» y se
/// niega (`regla_g_deja_inicio`). Ampliar esto no abre nada: la propia app ya estaba permitida para Inicio cuando se la ve.
/// Kotlin repite la prueba (`ControlEntradaNativo.sinRaizEsPropia`).
pub fn ventana_sin_raiz_es_propia(es_la_activa: bool, raiz_de_la_activa: Option<&str>, propio: &str) -> bool {
    es_la_activa && raiz_de_la_activa.is_some_and(|p| p.eq_ignore_ascii_case(propio))
}

/// (CTL1117C · FALLO 2) La CLASE de una ventana para la traza de un Inicio negado: nunca el nombre de otras apps, solo
/// `propia`, `salida`, `protegida:<paquete de la lista>`, `sistema-actividad`, `otra` o `sin-raiz`. Kotlin la repite
/// (`ControlEntradaNativo.claseVentana`).
pub fn clase_ventana(paquete: Option<&str>, actividad: bool, propio: &str) -> String {
    let Some(p) = paquete.map(str::to_lowercase) else { return "sin-raiz".into() };
    if p == propio.to_lowercase() {
        return "propia".into();
    }
    let (protegidos, sistema) = regla_g_listas();
    if regla_g_salida().iter().any(|x| p == *x) {
        "salida".into()
    } else if protegidos.iter().any(|x| p == *x) {
        format!("protegida:{p}")
    } else if actividad && sistema.iter().any(|x| p == *x) {
        "sistema-actividad".into()
    } else {
        "otra".into()
    }
}

/// (CTL1117E) El título de una ventana del SISTEMA saneado para la traza: solo letras, cifras y guiones (el resto, `-`), ≤24.
pub fn titulo_saneado(t: Option<&str>) -> String {
    let mut o = String::new();
    for c in t.unwrap_or("").chars() {
        let c = if c.is_ascii_alphanumeric() { c } else { '-' };
        if c == '-' && (o.is_empty() || o.ends_with('-')) {
            continue;
        }
        o.push(c);
        if o.len() >= 24 {
            break;
        }
    }
    while o.ends_with('-') {
        o.pop();
    }
    o
}

/// (CTL1117E) Lo que se añade a una ventana `sistema-actividad` en la traza para poder identificarla: `foco=si|no/activa=si|no/tam=<ancho>x<alto>/titulo=<…>`.
/// Para las demás clases no se añade nada (ni títulos). Kotlin lo repite (`ControlEntradaNativo.extraSistema`).
pub fn extra_sistema(foco: bool, activa: bool, ancho: i32, alto: i32, titulo: Option<&str>) -> String {
    let sn = |b: bool| if b { "si" } else { "no" };
    format!("foco={}/activa={}/tam={}x{}/titulo={}", sn(foco), sn(activa), ancho.max(0), alto.max(0), titulo_saneado(titulo))
}

/// La traza de un Inicio negado (o que pasó) por la regla G: `ventanas=<clase>/<tipo>[/activa],… marcas=<bloqueada,congelada,contrasena,sin-ventanas|ninguna>`.
/// `tipo` es el de Android (`app`, `sistema`, `teclado`, `otro`). Es lo que lee quien depura desde el registro de enlaces.
pub fn traza_inicio_negado(ventanas: &[(Option<&str>, bool, &str, bool, &str)], propio: &str, bloqueada: bool, congelada: bool, contrasena: bool) -> String {
    let v: Vec<String> = ventanas
        .iter()
        .map(|(p, actividad, tipo, activa, extra)| {
            format!("{}/{}{}{}", clase_ventana(*p, *actividad, propio), tipo, if *activa { "/activa" } else { "" }, if extra.is_empty() { String::new() } else { format!("/{extra}") })
        })
        .collect();
    let mut m: Vec<&str> = Vec::new();
    if bloqueada {
        m.push("bloqueada");
    }
    if congelada {
        m.push("congelada");
    }
    if contrasena {
        m.push("contrasena");
    }
    if ventanas.is_empty() {
        m.push("sin-ventanas");
    }
    format!("ventanas={} marcas={}", if v.is_empty() { "ninguna".to_string() } else { v.join(",") }, if m.is_empty() { "ninguna".to_string() } else { m.join(",") })
}

/// (CTL1117C · FALLO 2) De la respuesta de Kotlin a un Inicio rechazado por regla G: la traza saneada (solo `[a-z0-9:/.,=_-]`,
/// ≤200) para la línea `control-entrada`. `None` si no es esa respuesta.
pub fn traza_de_inicio_negado(r: Option<&Value>) -> Option<String> {
    let r = r?;
    if r.get("ok").and_then(|x| x.as_bool()) == Some(true) || r.get("motivo").and_then(|x| x.as_str()) != Some("regla-g") {
        return None;
    }
    let d = r.get("detalle").and_then(|x| x.as_str())?.strip_prefix("inicio-negado ")?;
    let t: String = d.chars().filter(|c| c.is_ascii_alphanumeric() || matches!(c, ':' | '/' | '.' | ',' | '=' | '_' | '-' | ' ')).take(200).collect();
    Some(t)
}

/// Qué hace la entrada con una orden cuando la regla G dice «protegida»: solo `tecla` con `cual = inicio` y
/// `regla_g_deja_inicio`. Devuelve la decisión (`None` = se rechaza con `regla-g`).
pub fn inicio_desde_protegida(nombre: &str, args: &Value, ventanas: &[VentanaG], propio: &str, bloqueada: bool, congelada: bool, contrasena: bool) -> bool {
    nombre == "tecla" && args.get("cual").and_then(|c| c.as_str()) == Some("inicio") && regla_g_deja_inicio(ventanas, propio, bloqueada, congelada, contrasena)
}

/// (CTL1117A) ¿Contestó Kotlin que la tecla Inicio pasó desde una ventana protegida? Para dejar su traza propia en el
/// registro (distinta de una tecla normal).
pub fn fue_inicio_desde_protegida(r: Option<&Value>) -> bool {
    r.is_some_and(|r| r.get("ok").and_then(|x| x.as_bool()) == Some(true) && r.get("detalle").and_then(|x| x.as_str()).is_some_and(|d| d == "inicio-desde-protegida" || d.starts_with("inicio-desde-protegida ")))
}

/// (CTL1117E) La traza de las ventanas cuando Inicio PASÓ por la excepción (`inicio-desde-protegida <traza>`), saneada como la del rechazo.
pub fn traza_de_inicio_pasa(r: Option<&Value>) -> Option<String> {
    let r = r.filter(|r| r.get("ok").and_then(|x| x.as_bool()) == Some(true))?;
    let d = r.get("detalle").and_then(|x| x.as_str())?.strip_prefix("inicio-desde-protegida ")?;
    Some(d.chars().filter(|c| c.is_ascii_alphanumeric() || matches!(c, ':' | '/' | '.' | ',' | '=' | '_' | '-' | ' ')).take(240).collect())
}

// ─────────────────────────── Contadores de sesión (una línea al empezar, otra al acabar) ───────────────────────────

#[derive(Debug, Default, Clone)]
pub struct Contadores {
    pub sesion: String,
    pub ordenes: u64,
    pub rechazadas: u64,
    motivos: HashMap<&'static str, u64>,
}

impl Contadores {
    pub fn nueva(sesion: &str) -> Self {
        Contadores { sesion: sesion.chars().take(8).collect(), ..Default::default() }
    }
    pub fn anotar(&mut self, resultado: Result<(), Motivo>) {
        match resultado {
            Ok(()) => self.ordenes += 1,
            Err(m) => {
                self.ordenes += 1;
                self.rechazadas += 1;
                *self.motivos.entry(m.codigo()).or_insert(0) += 1;
            }
        }
    }
    pub fn mas_frecuente(&self) -> &'static str {
        self.motivos.iter().max_by(|a, b| a.1.cmp(b.1).then(b.0.cmp(a.0))).map(|(m, _)| *m).unwrap_or("ninguno")
    }
    /// `control-entrada sesion=… ordenes=… rechazadas=… motivo-mas-frecuente=…`
    pub fn linea(&self) -> String {
        format!("sesion={} ordenes={} rechazadas={} motivo-mas-frecuente={}", self.sesion, self.ordenes, self.rechazadas, self.mas_frecuente())
    }
}

// ─────────────────────────── Pantalla ───────────────────────────

pub const LADO_MIN: u32 = 160;
pub const LADO_MAX: u32 = 2048;

/// Tamaño del cuadro: el lado mayor es `lado_max` (acotado) y nunca se amplía; lados pares y ≥ 2.
pub fn escalar(ancho: u32, alto: u32, lado_max: u32) -> (u32, u32) {
    if ancho == 0 || alto == 0 {
        return (0, 0);
    }
    let tope = lado_max.clamp(LADO_MIN, LADO_MAX);
    let mayor = ancho.max(alto);
    let k = if mayor <= tope { 1.0 } else { f64::from(tope) / f64::from(mayor) };
    let par = |v: u32| (((f64::from(v) * k).round() as u32) & !1).max(2);
    (par(ancho), par(alto))
}

/// UNI1115M · costura b: `calidad` es un entero 1..100 en la web y aquí (sin fracciones). Sale JPEG 20..=95.
pub fn calidad_jpeg(calidad: u32) -> u8 {
    calidad.clamp(1, 100).clamp(20, 95) as u8
}

pub const CABECERA_CUADRO: usize = 12;

/// Cabecera de seam 1: u32 LE nº de cuadro, u16 LE ancho, u16 LE alto, u16 LE giro (0/90/180/270), u16 cero.
pub fn cabecera_cuadro(numero: u32, ancho: u16, alto: u16, giro: u16) -> [u8; CABECERA_CUADRO] {
    let mut h = [0u8; CABECERA_CUADRO];
    h[0..4].copy_from_slice(&numero.to_le_bytes());
    h[4..6].copy_from_slice(&ancho.to_le_bytes());
    h[6..8].copy_from_slice(&alto.to_le_bytes());
    h[8..10].copy_from_slice(&giro.to_le_bytes());
    h
}

/// El cuadro que Kotlin dejó (`cabecera + JPEG`) si es más nuevo que `desde` y está bien formado; si no, None.
pub fn cuadro_si_nuevo(bytes: &[u8], desde: u32) -> Option<&[u8]> {
    if bytes.len() < CABECERA_CUADRO + 4 {
        return None;
    }
    let numero = u32::from_le_bytes(bytes[0..4].try_into().ok()?);
    let giro = u16::from_le_bytes(bytes[8..10].try_into().ok()?);
    let cero = u16::from_le_bytes(bytes[10..12].try_into().ok()?);
    if numero <= desde || cero != 0 || !matches!(giro, 0 | 90 | 180 | 270) || bytes[12] != 0xFF || bytes[13] != 0xD8 {
        return None;
    }
    Some(bytes)
}

// PENC2: de dónde sale la pantalla. Lo elige el aparato controlado según lo que la persona haya dado; nunca se enciende nada aquí.
/// `preferida`: «auto» (proyección si está concedida en ESTA sesión, si no accesibilidad), «proyeccion» o «accesibilidad».
/// Si no hay ninguna posible, devuelve lo que FALTA con las palabras del contrato (las que la persona arregla en el aparato).
pub fn fuente_de_pantalla(preferida: &str, proyeccion_ok: bool, accesibilidad_ok: bool) -> Result<&'static str, Vec<&'static str>> {
    const ACC: [&str; 2] = ["servicio-accesibilidad", "consentimiento-pantalla"];
    let preferida = if matches!(preferida, "proyeccion" | "accesibilidad") { preferida } else { "auto" };
    match (preferida, proyeccion_ok, accesibilidad_ok) {
        ("proyeccion", true, _) | ("auto", true, _) => Ok("proyeccion"),
        ("accesibilidad", _, true) | ("auto", false, true) => Ok("accesibilidad"),
        ("proyeccion", false, _) => Err(vec!["consentimiento-proyeccion"]),
        ("accesibilidad", _, false) => Err(ACC.to_vec()),
        _ => Err(vec![ACC[0], ACC[1], "consentimiento-proyeccion"]), // auto sin nada (o una preferencia desconocida: se trata como auto)
    }
}

/// Afina la lista genérica con lo que `control_capacidades` dice que falta de verdad: conserva lo que de verdad falta,
/// añade «ajustes-restringidos» si Android lo impone, y si nada coincide deja la genérica (nunca una lista vacía).
pub fn falta_afinada(generica: &[&'static str], reales: &[String]) -> Vec<&'static str> {
    let mut v: Vec<&'static str> = generica.iter().copied().filter(|g| *g == "consentimiento-proyeccion" || reales.iter().any(|r| r == g)).collect();
    if v.contains(&"servicio-accesibilidad") && reales.iter().any(|r| r == "ajustes-restringidos") {
        v.insert(0, "ajustes-restringidos");
    }
    if v.is_empty() { generica.to_vec() } else { v }
}

#[cfg(test)]
mod fuente_pruebas {
    use super::*;

    #[test]
    fn las_ocho_combinaciones_de_fuente_de_pantalla() {
        let casos: [(&str, bool, bool, Result<&str, Vec<&str>>); 8] = [
            ("auto", true, true, Ok("proyeccion")),
            ("auto", true, false, Ok("proyeccion")),
            ("auto", false, true, Ok("accesibilidad")),
            ("auto", false, false, Err(vec!["servicio-accesibilidad", "consentimiento-pantalla", "consentimiento-proyeccion"])),
            ("proyeccion", true, false, Ok("proyeccion")),
            ("proyeccion", false, true, Err(vec!["consentimiento-proyeccion"])),
            ("accesibilidad", true, true, Ok("accesibilidad")),
            ("accesibilidad", true, false, Err(vec!["servicio-accesibilidad", "consentimiento-pantalla"])),
        ];
        for (p, pr, ac, esperado) in casos {
            assert_eq!(fuente_de_pantalla(p, pr, ac), esperado, "{p} {pr} {ac}");
        }
        assert_eq!(fuente_de_pantalla("rara", false, true), Ok("accesibilidad"), "lo desconocido es auto");
    }

    #[test]
    fn la_lista_de_lo_que_falta_se_afina_sin_quedar_vacia() {
        let g = ["servicio-accesibilidad", "consentimiento-pantalla", "consentimiento-proyeccion"];
        let reales = vec!["ajustes-restringidos".to_string(), "servicio-accesibilidad".to_string()];
        assert_eq!(falta_afinada(&g, &reales), ["ajustes-restringidos", "servicio-accesibilidad", "consentimiento-proyeccion"]);
        assert_eq!(falta_afinada(&["consentimiento-proyeccion"], &[]), ["consentimiento-proyeccion"]);
        assert_eq!(falta_afinada(&["servicio-accesibilidad"], &[]), ["servicio-accesibilidad"]);
    }
}

#[cfg(test)]
mod pruebas {
    /// UNI1115M · costura a (lado Rust): la tabla de la web (`src/lib/control-remoto/nativo-comandos.ts`) y las firmas
    /// de los comandos de aquí dicen lo mismo. Si uno de los dos lados cambia un nombre, esta prueba falla.
    #[test]
    fn los_argumentos_de_los_comandos_son_los_de_la_tabla_de_la_web() {
        let tabla = include_str!("../../../src/lib/control-remoto/nativo-comandos.ts");
        let fuentes = [include_str!("control_entrada.rs"), include_str!("control_pantalla.rs")].join("\n");
        let mut vistos = 0;
        for linea in tabla.lines() {
            let l = linea.trim();
            let Some((nombre, resto)) = l.split_once(": [") else { continue };
            if !nombre.starts_with("control_") {
                continue;
            }
            let esperados: Vec<&str> = resto.trim_end_matches("],").split(',').map(|a| a.trim().trim_matches('"')).filter(|a| !a.is_empty()).collect();
            let i = fuentes.find(&format!("pub fn {nombre}(")).unwrap_or_else(|| panic!("{nombre} no existe en Rust"));
            let firma = &fuentes[i..i + fuentes[i..].find(") ->").unwrap()];
            let reales: Vec<&str> = firma[firma.find('(').unwrap() + 1..].split(',').map(|a| a.split(':').next().unwrap().trim()).filter(|a| !a.is_empty() && *a != "app" && *a != "webview").collect();
            assert_eq!(reales, esperados, "argumentos de {nombre}");
            let atributo = &fuentes[i.saturating_sub(120)..i];
            assert_eq!(atributo.contains("rename_all = \"snake_case\""), esperados.iter().any(|a| a.contains('_')), "rename_all de {nombre}");
            vistos += 1;
        }
        assert_eq!(vistos, 10, "la tabla tiene los 9 comandos del seam 1 y los extras del panel, más quitar (PENB3)");
    }

    use super::*;

    // Hechos con Node (WebCrypto ECDSA P-256 / SHA-256, `firmarOrdenControl` byte a byte): ver encargos/AND1115K.
    const SPKI: &str = include_str!("control_entrada_vectores/spki.txt");
    const HUELLA: &str = include_str!("control_entrada_vectores/huella.txt");
    const CODIGO: &str = include_str!("control_entrada_vectores/codigo.txt");
    const GESTO: &str = include_str!("control_entrada_vectores/gesto.json");
    const TECLA: &str = include_str!("control_entrada_vectores/tecla.json");
    const SES: &str = "00112233445566778899aabbccddeeff";
    /// 2026-11-15T10:00:30Z, a 30 s de `t` de los vectores.
    const AHORA: i64 = 1_794_736_830_000;

    fn aceptados() -> Vec<Aceptado> {
        leer_aceptados(&json!({ "controladores": [{ "spki": SPKI.trim(), "nombre": "Mac de Alex", "cuenta": "alex@example.com" }] }).to_string())
    }
    fn sobre(s: &str) -> Value {
        serde_json::from_str(s).unwrap()
    }

    #[test]
    fn la_hora_de_los_vectores_es_la_que_se_dice() {
        assert_eq!(iso_a_ms("2026-11-15T10:00:00.000Z"), Some(AHORA - 30_000));
        assert_eq!(iso_a_ms("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(iso_a_ms("2026-11-15T12:00:00.5+02:00"), Some(AHORA - 30_000 + 500));
        assert_eq!(iso_a_ms("2026-13-15T10:00:00Z"), None);
        assert_eq!(iso_a_ms("hoy"), None);
    }

    #[test]
    fn la_huella_y_el_codigo_salen_igual_que_en_la_web() {
        assert_eq!(huella_de_spki(SPKI.trim()).as_deref(), Some(HUELLA.trim()));
        assert_eq!(codigo_de(HUELLA.trim(), "Alex@Example.com "), CODIGO.trim());
        assert!(clave_de_spki("AAAA").is_none() && clave_de_spki("").is_none());
    }

    #[test]
    fn una_orden_firmada_de_un_controlador_aceptado_pasa() {
        let mut v = Vistos::default();
        let o = verificar_sobre(&sobre(GESTO), &aceptados(), SES, "controlar", AHORA, &mut v).unwrap();
        assert_eq!((o.nombre.as_str(), o.seq), ("gesto", 1));
        assert_eq!(o.de, HUELLA.trim());
        assert_eq!(o.args["dedos"][0]["puntos"][1][2], 120);
        // La siguiente (seq 2) pasa; repetir la primera no.
        assert!(verificar_sobre(&sobre(TECLA), &aceptados(), SES, "controlar", AHORA + 10, &mut v).is_ok());
        assert_eq!(verificar_sobre(&sobre(GESTO), &aceptados(), SES, "controlar", AHORA + 20, &mut v).unwrap_err().0, Motivo::Firma);
    }

    #[test]
    fn sin_aceptar_no_hay_entrada_aunque_la_firma_sea_buena() {
        let mut v = Vistos::default();
        assert_eq!(verificar_sobre(&sobre(GESTO), &[], SES, "controlar", AHORA, &mut v).unwrap_err().0, Motivo::NoAutorizado);
        // Otra clave aceptada con otra huella: tampoco.
        let otra = vec![Aceptado { spki: SPKI.trim().into(), huella: "00".repeat(32), nombre: String::new(), cuenta: String::new() }];
        assert_eq!(verificar_sobre(&sobre(GESTO), &otra, SES, "controlar", AHORA, &mut v).unwrap_err().0, Motivo::NoAutorizado);
    }

    #[test]
    fn una_carga_o_firma_tocadas_se_rechazan() {
        let mut v = Vistos::default();
        let mut s = sobre(GESTO);
        // Cambiar un carácter de la carga (la firma ya no casa o el JSON se rompe: ambos son «firma»).
        let c = s["carga"].as_str().unwrap().to_string();
        let mut b: Vec<char> = c.chars().collect();
        let i = b.len() / 2;
        b[i] = if b[i] == 'A' { 'B' } else { 'A' };
        s["carga"] = Value::String(b.into_iter().collect());
        assert_eq!(verificar_sobre(&s, &aceptados(), SES, "controlar", AHORA, &mut v).unwrap_err().0, Motivo::Firma);
        let mut s = sobre(GESTO);
        s["firma"] = Value::String(sobre(TECLA)["firma"].as_str().unwrap().into());
        assert_eq!(verificar_sobre(&s, &aceptados(), SES, "controlar", AHORA, &mut v).unwrap_err(), (Motivo::Firma, "firma-no-casa"));
        for roto in [json!(null), json!({}), json!({ "v": 2 }), json!({ "v": 1, "carga": "!!", "firma": "x" }), json!({ "v": 1, "carga": "AAAA", "firma": "AAAA" })] {
            assert_eq!(verificar_sobre(&roto, &aceptados(), SES, "controlar", AHORA, &mut v).unwrap_err().0, Motivo::Firma);
        }
    }

    #[test]
    fn sesion_nivel_y_reloj() {
        let mut v = Vistos::default();
        let a = aceptados();
        assert_eq!(verificar_sobre(&sobre(GESTO), &a, "ffffffffffffffffffffffffffffffff", "controlar", AHORA, &mut v).unwrap_err().0, Motivo::Sesion);
        assert_eq!(verificar_sobre(&sobre(GESTO), &a, SES, "ver", AHORA, &mut v).unwrap_err().0, Motivo::Sesion);
        // Reloj: 6 min antes de `t` o 8 min después de `caduca`.
        assert_eq!(verificar_sobre(&sobre(GESTO), &a, SES, "controlar", AHORA - 30_000 - 6 * 60_000, &mut v).unwrap_err(), (Motivo::Firma, "reloj"));
        assert_eq!(verificar_sobre(&sobre(GESTO), &a, SES, "controlar", AHORA - 30_000 + 8 * 60_000, &mut v).unwrap_err().0, Motivo::Firma);
        // Nada de lo rechazado consumió el `seq`: la orden sigue pasando en hora.
        assert!(verificar_sobre(&sobre(GESTO), &a, SES, "controlar", AHORA, &mut v).is_ok());
    }

    #[test]
    fn el_limite_son_60_por_segundo_y_se_libera() {
        let mut v = Vistos::default();
        for i in 0..60 {
            assert!(v.cabe(10_000 + i), "{i}");
        }
        assert!(!v.cabe(10_500));
        assert!(!v.cabe(10_999));
        assert!(v.cabe(11_100), "tras 1 s caben otras");
        // Dentro de verificar_sobre: con la ventana llena, la orden buena se rechaza con «limite» y no gasta su seq.
        let mut v = Vistos::default();
        for _ in 0..60 {
            assert!(v.cabe(AHORA as u64));
        }
        assert_eq!(verificar_sobre(&sobre(GESTO), &aceptados(), SES, "controlar", AHORA, &mut v).unwrap_err().0, Motivo::Limite);
        assert!(verificar_sobre(&sobre(GESTO), &aceptados(), SES, "controlar", AHORA + 1_500, &mut v).is_ok());
    }

    #[test]
    fn la_forma_de_cada_orden() {
        let g = json!({ "dedos": [{ "id": 0, "puntos": [[0.5, 0.5, 0], [1.0004, 0.2, 100]] }, { "id": 1, "puntos": [[0.1, 0.1, 0]] }], "sigue": true });
        let n = normalizar("gesto", &g).unwrap();
        assert_eq!(n["dedos"][0]["puntos"][1][0], 1.0, "se acota a 0..1");
        assert_eq!(n["sigue"], true);
        for (malo, motivo) in [
            (json!({ "dedos": [], "sigue": false }), "gesto-dedos"),
            (json!({ "dedos": [{ "id": 10, "puntos": [[0, 0, 0]] }], "sigue": false }), "gesto-id"),
            (json!({ "dedos": [{ "id": 0, "puntos": [[0, 0, 0]] }, { "id": 0, "puntos": [[0, 0, 0]] }], "sigue": false }), "gesto-id-repetido"),
            (json!({ "dedos": [{ "id": 0, "puntos": [[2.0, 0, 0]] }], "sigue": false }), "gesto-x"),
            (json!({ "dedos": [{ "id": 0, "puntos": [[0, 0, 0]] }] }), "gesto-sigue"),
            (json!({ "dedos": [{ "id": 0, "puntos": [[0, 0, 40000], [0, 0, 40000]] }], "sigue": false }), "gesto-largo"),
        ] {
            assert_eq!(normalizar("gesto", &malo).unwrap_err(), motivo);
        }
        for t in TECLAS {
            assert!(normalizar("tecla", &json!({ "cual": t })).is_ok(), "{t}");
        }
        assert!(normalizar("tecla", &json!({ "cual": "apagar-todo" })).is_err());
        assert!(normalizar("volumen", &json!({ "flujo": "timbre", "nivel": 0.5 })).is_ok());
        assert!(normalizar("volumen", &json!({ "flujo": "sistema", "nivel": 0.5 })).is_err());
        assert!(normalizar("volumen", &json!({ "flujo": "timbre", "nivel": 1.5 })).is_err());
        assert!(normalizar("brillo", &json!({ "nivel": 0.0 })).is_ok());
        assert!(normalizar("texto", &json!({ "texto": "x".repeat(512) })).is_ok());
        assert!(normalizar("texto", &json!({ "texto": "x".repeat(513) })).is_err());
        assert!(normalizar("texto", &json!({ "texto": "" })).is_err());
        assert!(normalizar("colgar", &json!({})).is_err());
    }

    #[test]
    fn regla_g_por_paquete_y_tipo_de_ventana_sin_depender_del_idioma() {
        let propio = "app.starseed.os";
        let v = |p: &'static str, actividad: bool| VentanaG { paquete: Some(p), actividad, foco: false };
        // Protegido con cualquier clase o título, en cualquier idioma: lo decide el paquete.
        for p in ["com.android.settings", "com.samsung.android.settings", "com.google.android.permissioncontroller", "com.android.packageinstaller", "com.android.vending", "com.google.android.gms", "com.android.credentialmanager"] {
            assert!(regla_g(&[v(p, true)], propio, false, false, false), "{p}");
            assert!(regla_g(&[v("com.example.notas", true), v(p, false)], propio, false, false, false), "{p} en otra ventana a la vista");
        }
        // La interfaz del sistema: sus actividades (consentimiento de captura, USB) no; la cortina y los ajustes rápidos sí.
        assert!(regla_g(&[v("com.android.systemui", true)], propio, false, false, false));
        assert!(!regla_g(&[v("com.android.systemui", false), v("com.example.notas", true)], propio, false, false, false));
        // La propia app: su panel y sus diálogos no; su superposición (borde y pastilla) no cuenta.
        assert!(regla_g(&[v(propio, true)], propio, false, false, false));
        assert!(!regla_g(&[v(propio, false), v("com.example.notas", true)], propio, false, false, false));
        // Pantalla bloqueada, consentimiento pedido, contraseña con el foco, nada a la vista o actividad sin paquete: no.
        let ok = [v("com.example.notas", true)];
        assert!(!regla_g(&ok, propio, false, false, false));
        assert!(regla_g(&ok, propio, true, false, false));
        assert!(regla_g(&ok, propio, false, true, false));
        assert!(regla_g(&ok, propio, false, false, true));
        assert!(regla_g(&[], propio, false, false, false));
        assert!(regla_g(&[VentanaG { paquete: None, actividad: true, foco: false }], propio, false, false, false));
        assert!(!regla_g(&[VentanaG { paquete: None, actividad: false, foco: false }, v("com.example.notas", true)], propio, false, false, false));
        // Mayúsculas no importan; la lista se lee entera y sin líneas raras.
        assert!(regla_g(&[v("COM.ANDROID.SETTINGS", false)], propio, false, false, false));
        let (p, s) = regla_g_listas();
        assert!(p.len() >= 25 && s == vec!["com.android.systemui"]);
    }

    #[test]
    fn ctl1117k_el_alcance_total_no_niega_ninguna_ventana_y_protegido_es_la_regla_g_de_siempre() {
        let propio = "app.starseed.os";
        let v = |p: &'static str, actividad: bool| VentanaG { paquete: Some(p), actividad, foco: true };
        // Sin valor o con un valor desconocido: total.
        for a in ["", "total", "TOTAL", "raro", "protegido "] {
            assert_eq!(alcance_efectivo(a), "total", "{a:?}");
        }
        assert_eq!(alcance_efectivo("protegido"), "protegido");
        // La lista entera de la regla G: con `total` ninguna ventana niega (propia, Ajustes, instaladores, permisos, systemui, sin raíz, sin ventanas).
        let (protegidos, sistema) = regla_g_listas();
        let mut todas: Vec<&str> = protegidos.iter().chain(sistema.iter()).copied().collect();
        todas.push(propio);
        for p in todas {
            assert!(regla_g(&[v(p, true)], propio, false, false, false), "{p} sigue protegido en `protegido`");
            assert!(regla_g_con_alcance("protegido", &[v(p, true)], propio, false, false, false), "{p}");
            assert!(!regla_g_con_alcance("total", &[v(p, true)], propio, false, false, false), "{p} no se niega en `total`");
        }
        assert!(!regla_g_con_alcance("total", &[], propio, false, false, false));
        assert!(!regla_g_con_alcance("total", &[VentanaG { paquete: None, actividad: true, foco: false }], propio, false, false, false));
        // Un campo de contraseña recibe entrada en `total`; en `protegido` se niega.
        assert!(!regla_g_con_alcance("total", &[v("com.example.notas", true)], propio, false, false, true));
        assert!(regla_g_con_alcance("protegido", &[v("com.example.notas", true)], propio, false, false, true));
        // Lo que NO cambia con ningún alcance: el aparato bloqueado y un consentimiento de este control abierto.
        for a in ["total", "protegido"] {
            assert!(regla_g_con_alcance(a, &[v("com.example.notas", true)], propio, true, false, false), "{a}: bloqueado");
            assert!(regla_g_con_alcance(a, &[v("com.example.notas", true)], propio, false, true, false), "{a}: congelada");
            assert!(!regla_g_con_alcance(a, &[v("com.example.notas", true)], propio, false, false, false), "{a}: una app cualquiera pasa");
        }
        // `protegido` == regla_g en cualquier combinación (byte a byte con hoy).
        for (b, c, k) in [(false, false, false), (true, false, false), (false, true, false), (false, false, true)] {
            for vs in [vec![], vec![v("com.android.settings", true)], vec![v(propio, true)], vec![v("com.example.notas", true)]] {
                assert_eq!(regla_g_con_alcance("protegido", &vs, propio, b, c, k), regla_g(&vs, propio, b, c, k));
            }
        }
    }

    #[test]
    fn ctl1117k_una_cancelacion_causada_por_nuestro_codigo_no_es_un_dedo() {
        let base = CancelacionVista { rechazado_al_despachar: false, obsoleta: false, pedida_por_nosotros: false, ms_desde_despacho: 120, inmediatas_seguidas: 0 };
        // Sin causa nuestra y a mitad del trozo: es un dedo (pausa).
        assert_eq!(causa_cancelacion_propia(&base), None);
        // Cada causa nuestra, por separado.
        assert_eq!(causa_cancelacion_propia(&CancelacionVista { rechazado_al_despachar: true, ..base }), Some("despacho-rechazado"));
        assert_eq!(causa_cancelacion_propia(&CancelacionVista { obsoleta: true, ..base }), Some("obsoleta"));
        assert_eq!(causa_cancelacion_propia(&CancelacionVista { pedida_por_nosotros: true, ..base }), Some("cortada"));
        // Las medidas de la ronda .52: 2 y 3 ms tras despachar → de Android, no de un dedo.
        for ms in [0, 2, 3, 25] {
            assert_eq!(causa_cancelacion_propia(&CancelacionVista { ms_desde_despacho: ms, ..base }), Some("inmediata"), "{ms}");
        }
        assert_eq!(causa_cancelacion_propia(&CancelacionVista { ms_desde_despacho: 26, ..base }), None);
        // Pero un dedo apoyado cancelaría cada trozo al instante: tras dos seguidas, la siguiente cuenta como dedo.
        assert_eq!(causa_cancelacion_propia(&CancelacionVista { ms_desde_despacho: 3, inmediatas_seguidas: 1, ..base }), Some("inmediata"));
        assert_eq!(causa_cancelacion_propia(&CancelacionVista { ms_desde_despacho: 3, inmediatas_seguidas: CANCELACIONES_PROPIAS_SEGUIDAS_MAX, ..base }), None);
        // Un despacho rechazado, una obsoleta o una cortada por nosotros no dependen del contador de seguidas.
        assert_eq!(causa_cancelacion_propia(&CancelacionVista { rechazado_al_despachar: true, inmediatas_seguidas: 9, ..base }), Some("despacho-rechazado"));
    }

    #[test]
    fn ctl1117e_systemui_sin_foco_no_niega_inicio_y_con_foco_si() {
        let propio = "app.starseed.os";
        let w = |p: Option<&'static str>, actividad: bool, foco: bool| VentanaG { paquete: p, actividad, foco };
        let pasa = |vs: &[VentanaG]| regla_g_deja_inicio(vs, propio, false, false, false);
        let activa = w(Some(propio), true, true);
        let sui = |foco: bool| w(Some("com.android.systemui"), true, foco);
        // Inicio pasa con [propia activa + sistema-actividad sin foco ni activa].
        assert!(pasa(&[activa, sui(false)]));
        // Se niega con la de systemui activa/con foco (captura de pantalla, depuración USB…).
        assert!(!pasa(&[activa, sui(true)]));
        assert!(!pasa(&[sui(true)]));
        // Un `protegido` que no es `salida` niega aunque no tenga foco; `salida` (Ajustes) no.
        for p in ["com.google.android.permissioncontroller", "com.google.android.packageinstaller", "com.android.credentialmanager", "com.android.managedprovisioning"] {
            assert!(!pasa(&[activa, w(Some(p), true, false)]), "{p}");
        }
        assert!(pasa(&[activa, w(Some("com.android.settings"), true, false)]));
        // Sin raíz de tipo aplicación niega (salvo prueba de propia), con o sin foco.
        assert!(!pasa(&[activa, w(None, true, false)]));
        assert!(!pasa(&[activa, w(None, true, true)]));
        // Congelada, bloqueada, contraseña y sin ventanas niegan igual.
        assert!(!regla_g_deja_inicio(&[activa, sui(false)], propio, false, true, false));
        assert!(!regla_g_deja_inicio(&[activa, sui(false)], propio, true, false, false));
        assert!(!regla_g_deja_inicio(&[activa, sui(false)], propio, false, false, true));
        assert!(!pasa(&[]));
        // La fila EXACTA de la prueba .50: otra/sistema ×4, propia/sistema, sistema-actividad/app (sin foco), propia/app/activa → pasa.
        let sistema = |p: &'static str| w(Some(p), false, false);
        let fila = [sistema("com.otra.uno"), sistema("com.otra.dos"), sistema("com.otra.tres"), sistema("com.otra.cuatro"), sistema(propio), sui(false), activa];
        assert!(pasa(&fila));
        // La regla G de gestos, texto y demás teclas NO cambia: esa misma situación sigue «protegida».
        assert!(regla_g(&fila, propio, false, false, false));
        // La traza: solo `sistema-actividad` lleva foco/activa/tamaño/título; el título va saneado y corto.
        let x = extra_sistema(false, false, 1080, 160, Some("Toast <Ver pantalla!> con un título larguísimo de verdad"));
        assert_eq!(x, "foco=no/activa=no/tam=1080x160/titulo=Toast-Ver-pantalla-con-u");
        assert_eq!(extra_sistema(true, true, -5, 3, None), "foco=si/activa=si/tam=0x3/titulo=");
        let t = traza_inicio_negado(&[(Some("com.android.systemui"), true, "app", false, &x), (Some(propio), true, "app", true, "")], propio, false, false, false);
        assert_eq!(t, "ventanas=sistema-actividad/app/foco=no/activa=no/tam=1080x160/titulo=Toast-Ver-pantalla-con-u,propia/app/activa marcas=ninguna");
        // Y cuando Inicio PASA, la respuesta también lleva la traza.
        let r = json!({ "ok": true, "detalle": format!("inicio-desde-protegida {t}") });
        assert!(fue_inicio_desde_protegida(Some(&r)) && fue_inicio_desde_protegida(Some(&json!({ "ok": true, "detalle": "inicio-desde-protegida" }))));
        assert_eq!(traza_de_inicio_pasa(Some(&r)).unwrap(), t);
        assert!(traza_de_inicio_pasa(Some(&json!({ "ok": false, "detalle": "inicio-desde-protegida x" }))).is_none());
    }

    #[test]
    fn ctl1117c_una_ventana_sin_raiz_solo_es_la_propia_si_esta_probado() {
        let propio = "app.starseed.os";
        // Probada: es la activa y la raíz de la activa es nuestra.
        assert!(ventana_sin_raiz_es_propia(true, Some("app.starseed.os"), propio));
        assert!(ventana_sin_raiz_es_propia(true, Some("App.StarSeed.OS"), propio));
        // Sin prueba: no es la activa, no hay raíz activa, o la activa es de otra app.
        assert!(!ventana_sin_raiz_es_propia(false, Some("app.starseed.os"), propio));
        assert!(!ventana_sin_raiz_es_propia(true, None, propio));
        assert!(!ventana_sin_raiz_es_propia(true, Some("com.android.settings"), propio));
        assert!(!ventana_sin_raiz_es_propia(true, Some(""), propio));
        // Sin raíz y sin prueba, Inicio sigue negado (no se ensancha la lista positiva); con la prueba, el paquete propio pasa.
        let sin_prueba = [VentanaG { paquete: None, actividad: true, foco: false }];
        assert!(!regla_g_deja_inicio(&sin_prueba, propio, false, false, false));
        let probada = [VentanaG { paquete: Some(propio), actividad: true, foco: false }];
        assert!(regla_g_deja_inicio(&probada, propio, false, false, false));
        // La propia + una sin raíz SIN prueba (p. ej. un diálogo de otra app): NO.
        assert!(!regla_g_deja_inicio(&[VentanaG { paquete: Some(propio), actividad: true, foco: false }, VentanaG { paquete: None, actividad: true, foco: false }], propio, false, false, false));
        // Los consentimientos y la contraseña siguen mandando aunque la ventana sea la propia.
        assert!(!regla_g_deja_inicio(&probada, propio, false, true, false));
        assert!(!regla_g_deja_inicio(&probada, propio, true, false, false));
        assert!(!regla_g_deja_inicio(&probada, propio, false, false, true));
    }

    #[test]
    fn ctl1117c_la_traza_de_un_inicio_negado_usa_clases_y_no_nombres_ajenos() {
        let propio = "app.starseed.os";
        assert_eq!(clase_ventana(Some(propio), true, propio), "propia");
        assert_eq!(clase_ventana(None, true, propio), "sin-raiz");
        assert_eq!(clase_ventana(None, false, propio), "sin-raiz");
        assert_eq!(clase_ventana(Some("com.android.settings"), true, propio), "salida");
        assert_eq!(clase_ventana(Some("com.google.android.permissioncontroller"), true, propio), "protegida:com.google.android.permissioncontroller");
        assert_eq!(clase_ventana(Some("com.android.systemui"), true, propio), "sistema-actividad");
        assert_eq!(clase_ventana(Some("com.android.systemui"), false, propio), "otra", "la cortina no es actividad");
        assert_eq!(clase_ventana(Some("com.otra.cosa.privada"), true, propio), "otra", "una app ajena no se nombra");
        let t = traza_inicio_negado(&[(Some(propio), true, "app", true, ""), (None, true, "app", false, ""), (Some("com.otra.cosa.privada"), true, "app", false, "")], propio, false, false, true);
        assert_eq!(t, "ventanas=propia/app/activa,sin-raiz/app,otra/app marcas=contrasena");
        assert!(!t.contains("privada"));
        assert_eq!(traza_inicio_negado(&[], propio, true, true, false), "ventanas=ninguna marcas=bloqueada,congelada,sin-ventanas");
        // La respuesta de Kotlin → la línea: solo la de un Inicio negado, saneada.
        let r = json!({ "ok": false, "motivo": "regla-g", "detalle": format!("inicio-negado {t}<script>") });
        assert_eq!(traza_de_inicio_negado(Some(&r)).unwrap(), format!("{t}script"));
        assert!(traza_de_inicio_negado(Some(&json!({ "ok": false, "motivo": "regla-g" }))).is_none());
        assert!(traza_de_inicio_negado(Some(&json!({ "ok": false, "motivo": "pausa-local", "detalle": "inicio-negado x" }))).is_none());
        assert!(traza_de_inicio_negado(Some(&json!({ "ok": true, "detalle": "inicio-desde-protegida" }))).is_none());
        assert!(traza_de_inicio_negado(None).is_none());
    }

    /// FSG1116 · A2: firmar una `abrir-sesion` con una clave de prueba (P-256) y su SPKI.
    #[test]
    fn ctl1117a_inicio_pasa_desde_una_ventana_protegida_y_nada_mas() {
        let propio = "app.starseed.os";
        let v = |p: &'static str, a: bool| VentanaG { paquete: Some(p), actividad: a, foco: false };
        let ajustes = [v("com.android.settings", true)];
        let inicio = json!({ "cual": "inicio" });
        let pasa = |vs: &[VentanaG]| inicio_desde_protegida("tecla", &inicio, vs, propio, false, false, false);
        assert!(regla_g(&ajustes, propio, false, false, false), "Ajustes es ventana protegida");
        // Pasa desde Ajustes, una tienda y la propia app (lista positiva `salida`).
        for p in ["com.android.settings", "com.samsung.android.settings", "com.android.vending", "org.fdroid.fdroid", propio] {
            assert!(pasa(&[v(p, true)]), "{p}");
        }
        // NO desde permisos, instaladores, credenciales/cuentas/certificados, managedprovisioning ni una actividad de systemui.
        for p in [
            "com.google.android.permissioncontroller", "com.android.permissioncontroller", "com.google.android.packageinstaller",
            "com.android.packageinstaller", "com.android.credentialmanager", "com.google.android.gms", "com.android.keychain",
            "com.android.certinstaller", "com.android.managedprovisioning",
        ] {
            assert!(!pasa(&[v(p, true)]), "{p}");
        }
        // La cortina de systemui (no es actividad) no es protegida: no estorba, pero tampoco abre nada por sí sola.
        assert!(pasa(&[v("com.android.settings", true), v("com.android.systemui", false)]));
        // Mezcla: Ajustes + un diálogo de permisos (o de captura) a la vista: NO.
        assert!(!pasa(&[v("com.android.settings", true), v("com.google.android.permissioncontroller", true)]));
        // CTL1117E: una actividad de systemui SIN foco ni activa (aviso emergente, barra flotante) no niega; con foco sí.
        assert!(pasa(&[v("com.android.settings", true), v("com.android.systemui", true)]));
        assert!(!regla_g_deja_inicio(&[v("com.android.settings", true), VentanaG { foco: true, ..v("com.android.systemui", true) }], propio, false, false, false));
        assert!(!pasa(&[v("com.android.settings", true), VentanaG { paquete: None, actividad: true, foco: false }]));
        // Con un consentimiento de este control abierto o pedido (congelada): NO, aunque sea Inicio y Ajustes.
        assert!(!inicio_desde_protegida("tecla", &inicio, &ajustes, propio, false, true, false));
        // Pantalla de bloqueo, contraseña o nada a la vista: NO.
        assert!(!inicio_desde_protegida("tecla", &inicio, &ajustes, propio, true, false, false));
        assert!(!inicio_desde_protegida("tecla", &inicio, &ajustes, propio, false, false, true));
        assert!(!pasa(&[]));
        // Ninguna otra tecla, ningún gesto, ningún texto, ningún volumen.
        for t in TECLAS.iter().filter(|t| **t != "inicio") {
            assert!(!inicio_desde_protegida("tecla", &json!({ "cual": t }), &ajustes, propio, false, false, false), "{t}");
        }
        assert!(!inicio_desde_protegida("gesto", &json!({ "dedos": [], "sigue": false }), &ajustes, propio, false, false, false));
        assert!(!inicio_desde_protegida("texto", &json!({ "texto": "hola" }), &ajustes, propio, false, false, false));
        assert!(!inicio_desde_protegida("tecla", &json!({}), &ajustes, propio, false, false, false));
        assert!(!inicio_desde_protegida("tecla", &json!({ "cual": "INICIO" }), &ajustes, propio, false, false, false));
        // La lista `salida`: ningún paquete suyo es de permisos, instaladores, credenciales, managedprovisioning ni systemui.
        let (prot, _) = regla_g_listas();
        for x in regla_g_salida() {
            assert!(prot.contains(&x), "{x}: una salida que no es protegida sobra");
            assert!(!x.contains("permission") && !x.contains("packageinstaller") && !x.contains("managedprovisioning") && !x.contains("systemui"), "{x}");
            assert!(!["com.google.android.gms", "com.google.android.gsf.login", "com.android.keychain", "com.android.certinstaller", "com.android.credentialmanager"].contains(&x), "{x}");
        }
        assert_eq!(regla_g_salida().len(), 15);
        // Dice lo mismo que `regla_g` para todo lo demás: si la regla G no protege, no hace falta la excepción.
        assert!(!regla_g(&[v("com.example.notas", true)], propio, false, false, false));
        // La traza propia en el registro.
        assert!(fue_inicio_desde_protegida(Some(&json!({ "ok": true, "detalle": "inicio-desde-protegida" }))));
        assert!(!fue_inicio_desde_protegida(Some(&json!({ "ok": true }))));
        assert!(!fue_inicio_desde_protegida(Some(&json!({ "ok": false, "detalle": "inicio-desde-protegida" }))));
        assert!(!fue_inicio_desde_protegida(None));
    }

    fn firmado(clave: u8, carga: Value) -> (Value, Aceptado) {
        use p256::ecdsa::{signature::Signer, SigningKey};
        let sk = SigningKey::from_bytes(&[clave; 32].into()).unwrap();
        let punto = sk.verifying_key().to_encoded_point(false);
        let mut der = CABECERA_SPKI_P256.to_vec();
        der.extend_from_slice(punto.as_bytes());
        let b64 = |b: &[u8]| base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(b);
        let spki = b64(&der);
        let huella = huella_de_spki(&spki).unwrap();
        let mut carga = carga;
        carga["de"] = Value::String(huella.clone());
        let bytes = serde_json::to_vec(&carga).unwrap();
        let firma: Signature = sk.sign(&bytes);
        (json!({ "v": 1, "carga": b64(&bytes), "firma": b64(&firma.to_bytes()) }), Aceptado { spki, huella, nombre: "Mac de Alex".into(), cuenta: "alex@example.com".into() })
    }
    fn carga_abrir(seq: u64, nonce: &str, nivel: &str) -> Value {
        json!({ "aud": AUD_CONTROL, "v": 1, "de": "", "cuenta": "alex@example.com", "para": "neurona-tableta-01", "nivel": nivel, "sesion": null, "seq": seq, "nonce": nonce,
            "t": "2026-11-15T10:00:00.000Z", "caduca": "2026-11-15T10:02:00.000Z", "accion": { "nombre": "abrir-sesion", "args": {} } })
    }

    #[test]
    fn a2_la_sesion_solo_la_abre_una_orden_firmada_de_un_aceptado_y_el_nombre_es_el_nativo() {
        let (s, a) = firmado(7, carga_abrir(1, "AAAAAAAAAAAAAAAAAAAAAA", "controlar"));
        let mut v = Vistos::default();
        // Sin aceptado aquí (lo que la página diga no cuenta): no.
        assert_eq!(verificar_apertura(&s, &[], "controlar", AHORA, &mut v).unwrap_err().0, Motivo::NoAutorizado);
        let ap = verificar_apertura(&s, &[a.clone()], "controlar", AHORA, &mut v).unwrap();
        assert_eq!(ap, Apertura { de: a.huella.clone(), nombre: "Mac de Alex".into(), nivel: "controlar".into(), color: crate::control_ajustes::color_por_defecto(&a.huella), nombre_origen: "aceptados", codigo: codigo_de(&a.huella, &a.cuenta) });
        // La misma apertura otra vez (o con la sesión ya cerrada): no.
        assert_eq!(verificar_apertura(&s, &[a.clone()], "controlar", AHORA + 10, &mut v).unwrap_err(), (Motivo::Firma, "repetida"));
        // La página puede bajar el nivel firmado, nunca subirlo.
        let (s2, a2) = firmado(7, carga_abrir(2, "BBBBBBBBBBBBBBBBBBBBBB", "ver"));
        assert_eq!(verificar_apertura(&s2, &[a2], "controlar", AHORA, &mut v).unwrap().nivel, "ver");
        let (s3, a3) = firmado(7, carga_abrir(3, "CCCCCCCCCCCCCCCCCCCCCC", "controlar"));
        assert_eq!(verificar_apertura(&s3, &[a3.clone()], "ver", AHORA, &mut v).unwrap().nivel, "ver");
        // Otra orden firmada (un gesto) no abre sesiones; tampoco fuera de hora.
        assert_eq!(verificar_apertura(&sobre(GESTO), &aceptados(), "controlar", AHORA, &mut v).unwrap_err(), (Motivo::Firma, "no-es-abrir-sesion"));
        let (s4, a4) = firmado(7, carga_abrir(4, "DDDDDDDDDDDDDDDDDDDDDD", "controlar"));
        assert_eq!(verificar_apertura(&s4, &[a4], "controlar", AHORA + 10 * 60_000, &mut v).unwrap_err().0, Motivo::Firma);
        // Firmada por otra clave que dice ser la aceptada: no casa.
        let (mut s5, _) = firmado(9, carga_abrir(5, "EEEEEEEEEEEEEEEEEEEEEE", "controlar"));
        let (s5b, _) = firmado(7, carga_abrir(5, "EEEEEEEEEEEEEEEEEEEEEE", "controlar"));
        s5["carga"] = s5b["carga"].clone();
        assert_eq!(verificar_apertura(&s5, &[a3], "controlar", AHORA, &mut v).unwrap_err(), (Motivo::Firma, "firma-no-casa"));
    }

    #[test]
    fn ctl1117h_el_color_del_controlador_viaja_firmado_se_valida_y_si_no_el_de_su_huella() {
        let mut v = Vistos::default();
        let con = |seq: u64, nonce: &str, args: Value| {
            let mut c = carga_abrir(seq, nonce, "controlar");
            c["accion"]["args"] = args;
            firmado(7, c)
        };
        // Con un color válido y firmado: ese.
        let (s, a) = con(1, "FFFFFFFFFFFFFFFFFFFFFF", json!({ "color": "#12abef" }));
        assert_eq!(verificar_apertura(&s, &[a.clone()], "controlar", AHORA, &mut v).unwrap().color, "#12abef");
        // Con un color que no vale: el de su huella (no se rechaza la sesión por un color).
        let (s, a) = con(2, "GGGGGGGGGGGGGGGGGGGGGG", json!({ "color": "#12ABEF" }));
        assert_eq!(verificar_apertura(&s, &[a.clone()], "controlar", AHORA, &mut v).unwrap().color, crate::control_ajustes::color_por_defecto(&a.huella));
        let (s, a) = con(3, "HHHHHHHHHHHHHHHHHHHHHH", json!({ "color": 7 }));
        assert!(verificar_apertura(&s, &[a], "controlar", AHORA, &mut v).is_err(), "un color que ni es texto es forma inválida");
        // Cualquier otro argumento sigue siendo forma inválida.
        let (s, a) = con(4, "IIIIIIIIIIIIIIIIIIIIII", json!({ "color": "#12abef", "nivel": "controlar" }));
        assert!(verificar_apertura(&s, &[a], "controlar", AHORA, &mut v).is_err());
        // El color va DENTRO de lo firmado: cambiarlo después de firmar rompe la firma.
        let (mut s, a) = con(5, "JJJJJJJJJJJJJJJJJJJJJJ", json!({ "color": "#12abef" }));
        let (otro, _) = con(5, "JJJJJJJJJJJJJJJJJJJJJJ", json!({ "color": "#ff0000" }));
        s["carga"] = otro["carga"].clone();
        assert!(verificar_apertura(&s, &[a], "controlar", AHORA, &mut v).is_err());
    }

    #[test]
    fn los_contadores_dan_la_linea_de_la_sesion() {
        let mut c = Contadores::nueva("00112233445566778899aabbccddeeff");
        c.anotar(Ok(()));
        c.anotar(Err(Motivo::ReglaG));
        c.anotar(Err(Motivo::ReglaG));
        c.anotar(Err(Motivo::Limite));
        assert_eq!(c.linea(), "sesion=00112233 ordenes=4 rechazadas=3 motivo-mas-frecuente=regla-g");
        assert_eq!(Contadores::nueva("x").linea(), "sesion=x ordenes=0 rechazadas=0 motivo-mas-frecuente=ninguno");
        assert_eq!(Motivo::desde_codigo("pausa-local"), Some(Motivo::PausaLocal));
    }

    #[test]
    fn numeros_de_pantalla() {
        assert_eq!(escalar(2960, 1848, 1280), (1280, 799 & !1));
        assert_eq!(escalar(1848, 2960, 1280), (799 & !1, 1280));
        assert_eq!(escalar(800, 600, 1280), (800, 600), "no se amplía");
        assert_eq!(escalar(0, 5, 1280), (0, 0));
        assert_eq!(escalar(2960, 1848, 99_999).0, 2048);
        assert_eq!(calidad_jpeg(60), 60);
        assert_eq!(calidad_jpeg(75), 75);
        assert_eq!(calidad_jpeg(100), 95);
        assert_eq!(calidad_jpeg(0), 20);
        let mut f = cabecera_cuadro(7, 1280, 798, 90).to_vec();
        f.extend_from_slice(&[0xFF, 0xD8, 0xFF, 0xD9]);
        assert_eq!(cuadro_si_nuevo(&f, 6).map(<[u8]>::len), Some(16));
        assert!(cuadro_si_nuevo(&f, 7).is_none(), "ninguno más nuevo → cero bytes");
        assert!(cuadro_si_nuevo(&f[..10], 0).is_none());
        let mut roto = f.clone();
        roto[8] = 45;
        assert!(cuadro_si_nuevo(&roto, 0).is_none(), "giro raro");
        assert_eq!(&f[0..4], &7u32.to_le_bytes());
    }
}
