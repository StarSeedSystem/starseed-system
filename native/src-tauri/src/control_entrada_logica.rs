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
pub const MAX_PUNTOS: usize = 200;
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
pub const AJUSTES: [&str; 4] = ["servicio-accesibilidad", "ajustes-restringidos", "consentimiento-pantalla", "escribir-ajustes"];

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

/// Comprueba el sobre contra los aceptados, la sesión (token y nivel) y el reloj. Devuelve la orden o el
/// `Motivo` con el que se rechaza (y un detalle corto SOLO para el registro, nunca contenido de la orden).
/// El orden es: forma → aceptado → firma → sesión/nivel → reloj → repetición → límite. Nada de esto toca Kotlin.
pub fn verificar_sobre(sobre: &Value, aceptados: &[Aceptado], sesion: &str, nivel_sesion: &str, ahora_ms: i64, vistos: &mut Vistos) -> Result<OrdenEntrada, (Motivo, &'static str)> {
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
        Some(Value::Null) => None,
        Some(Value::String(s)) if es_hex(s, 32) => Some(s.as_str()),
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

    // La sesión abierta y su nivel: la carga debe ir atada a ESTA sesión y pedir `controlar`.
    if ses_carga != Some(sesion) {
        return Err((Sesion, "sesion-distinta"));
    }
    if nivel != "controlar" || nivel_sesion != "controlar" {
        return Err((Sesion, "nivel"));
    }

    // Reloj (±5 min entre las dos puntas) y vida de 2 min.
    if (ahora_ms - t).abs() > DESFASE_MAX_MS {
        return Err((Firma, "reloj"));
    }
    if ahora_ms > caduca + DESFASE_MAX_MS || caduca < t || caduca - t > VIDA_ORDEN_MS + 1_000 {
        return Err((Firma, "caducada"));
    }

    // Repetición: `seq` estrictamente creciente por aparato y nonce no visto.
    if vistos.seq.get(de).is_some_and(|ultimo| seq <= *ultimo) || vistos.nonces.iter().any(|n| n == nonce) {
        return Err((Firma, "repetida"));
    }
    let args = normalizar(nombre, args).map_err(|d| (Firma, d))?;
    if !vistos.cabe(ahora_ms.max(0) as u64) {
        return Err((Limite, "mas-de-60-por-segundo"));
    }
    vistos.seq.insert(de.to_string(), seq);
    vistos.nonces.push_back(nonce.to_string());
    while vistos.nonces.len() > 256 {
        vistos.nonces.pop_front();
    }
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

// ─────────────────────────── Regla G ───────────────────────────
// (Kotlin repite estas listas: `control_entrada_parche::kotlin_y_rust_dicen_lo_mismo` lo comprueba.)

/// Paquetes cuya ventana en primer plano es siempre un diálogo de permisos o de instalación.
pub const PAQUETES_G: [&str; 7] = [
    "com.google.android.permissioncontroller",
    "com.android.permissioncontroller",
    "com.samsung.android.permissioncontroller",
    "com.google.android.packageinstaller",
    "com.android.packageinstaller",
    "com.samsung.android.packageinstaller",
    "com.samsung.android.app.permission",
];
/// Paquetes de Ajustes: solo protegen las pantallas de `CLASES_AJUSTES_G`.
pub const PAQUETES_AJUSTES: [&str; 2] = ["com.android.settings", "com.samsung.android.settings"];
pub const CLASES_AJUSTES_G: [&str; 14] = [
    "accessibility",
    "deviceadmin",
    "specialaccess",
    "drawoverlay",
    "overlaysettings",
    "writesettings",
    "usageaccess",
    "notificationaccess",
    "managedeviceadmins",
    "installedappdetails",
    "appinfodashboard",
    "manageappexternalsources",
    "restrictedsettings",
    "alldevicesadmin",
];
/// Diálogos del sistema (SystemUI) de consentimiento de captura.
pub const CLASES_SISTEMA_G: [&str; 3] = ["mediaprojectionpermission", "screencapturepermission", "mediaprojectionappselector"];

/// ¿La ventana (paquete + clase de actividad o título) está protegida por la regla G? Mayúsculas no importan.
pub fn regla_g(paquete: &str, clase: &str) -> bool {
    let p = paquete.to_lowercase();
    let c = clase.to_lowercase();
    PAQUETES_G.iter().any(|x| p == *x)
        || (PAQUETES_AJUSTES.iter().any(|x| p == *x) && CLASES_AJUSTES_G.iter().any(|x| c.contains(x)))
        || (p == "com.android.systemui" && CLASES_SISTEMA_G.iter().any(|x| c.contains(x)))
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

/// `calidad` puede llegar como fracción (0..1) o como porcentaje (1..100). Sale JPEG 20..=95.
pub fn calidad_jpeg(calidad: f64) -> u8 {
    let q = if !calidad.is_finite() { 60.0 } else if calidad <= 1.0 { calidad * 100.0 } else { calidad };
    q.round().clamp(20.0, 95.0) as u8
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

#[cfg(test)]
mod pruebas {
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
    fn regla_g_ventanas_protegidas_y_permitidas() {
        for (p, c) in [
            ("com.google.android.permissioncontroller", "com.android.permissioncontroller.permission.ui.GrantPermissionsActivity"),
            ("com.android.packageinstaller", ""),
            ("com.android.settings", "com.android.settings.Settings$AccessibilitySettingsActivity"),
            ("com.android.settings", "com.android.settings.deviceadmin.DeviceAdminAdd"),
            ("com.android.settings", "com.android.settings.Settings$AppDrawOverlaySettingsActivity"),
            ("com.android.settings", "com.android.settings.applications.InstalledAppDetails"),
            ("com.samsung.android.settings", "x.SpecialAccessSettings"),
            ("com.android.systemui", "com.android.systemui.mediaprojection.permission.MediaProjectionPermissionActivity"),
        ] {
            assert!(regla_g(p, c), "{p} {c}");
        }
        // Permitido: ajustes rápidos, sombra de notificaciones, ajustes ordinarios, otras apps.
        for (p, c) in [
            ("com.android.systemui", "com.android.systemui.qs.QSPanel"),
            ("com.android.systemui", "NotificationShade"),
            ("com.android.settings", "com.android.settings.Settings$WifiSettingsActivity"),
            ("com.android.settings", "com.android.settings.Settings$DisplaySettingsActivity"),
            ("app.starseed.os", "app.starseed.os.MainActivity"),
            ("com.example.otra", "Permisos"),
        ] {
            assert!(!regla_g(p, c), "{p} {c}");
        }
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
        assert_eq!(calidad_jpeg(0.6), 60);
        assert_eq!(calidad_jpeg(75.0), 75);
        assert_eq!(calidad_jpeg(1.0), 95);
        assert_eq!(calidad_jpeg(f64::NAN), 60);
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
