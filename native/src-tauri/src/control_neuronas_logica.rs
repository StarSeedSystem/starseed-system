//! (ORD1114Q) Control entre mis neuronas · la parte pura del lado NATIVO del aparato controlado.
//! Contrato: architecture/control-remoto-entre-neuronas.md §1 caso H y §2.4.
//!
//! La sesión de control vive AQUÍ (Rust), no en la página: la página pide abrirla (y solo se abre si hay
//! indicador nativo), pide permiso a Rust antes de ejecutar CADA orden y Rust anota la orden en un
//! registro de solo-añadir encadenado por SHA-256. Parar (menú del indicador, atendido en Rust) cierra
//! la sesión aunque la página no conteste: la siguiente orden ya no tiene sesión. También se cierra sola
//! a la hora (máximo) y a los 2 min sin órdenes.
//!
//! Sin Tauri ni E/S: reloj y textos entran por argumento. Lo usa `control_neuronas.rs`.

pub const REGISTRO: &str = "control-neuronas.log";
pub const INICIO_CADENA: &str = "inicio";
pub const SESION_MAX_MS: u64 = 60 * 60_000;
pub const SESION_INACTIVA_MS: u64 = 2 * 60_000;
const MAX_DETALLE: usize = 160;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Rechazo {
    /// No hay forma de enseñar el indicador nativo: sin indicador no hay control (§2.4).
    SinIndicador,
    /// Ya hay una sesión abierta por OTRO aparato.
    OtraSesion,
    /// No hay sesión (nunca se abrió, se paró o caducó).
    SinSesion,
    /// El token no es el de la sesión abierta.
    Token,
    /// Datos con forma rara (huella, nivel, nombre de orden).
    Forma,
}

impl Rechazo {
    pub fn codigo(self) -> &'static str {
        match self {
            Rechazo::SinIndicador => "sin-indicador-nativo",
            Rechazo::OtraSesion => "otra-sesion",
            Rechazo::SinSesion => "parada-nativa",
            Rechazo::Token => "parada-nativa",
            Rechazo::Forma => "forma",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Sesion {
    pub token: String,
    /// Huella (hex) del aparato que manda.
    pub de: String,
    pub nombre: String,
    pub nivel: String,
    pub inicio_ms: u64,
    pub ultima_ms: u64,
}

#[derive(Debug, Default)]
pub struct Control {
    sesion: Option<Sesion>,
    /// La última parada: (hora, motivo). Para el estado que lee la página.
    pub ultima_parada: Option<(u64, String)>,
}

pub fn huella_valida(de: &str) -> bool {
    (8..=64).contains(&de.len()) && de.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

pub fn nombre_orden_valido(n: &str) -> bool {
    (1..=24).contains(&n.len()) && n.bytes().all(|b| b.is_ascii_lowercase() || b == b'-')
}

pub fn nivel_valido(n: &str) -> bool {
    matches!(n, "ver" | "controlar")
}

/// Nombre visible del aparato: sin controles, ≤ 40 caracteres.
pub fn nombre_limpio(s: &str) -> String {
    let t: String = s.chars().filter(|c| !c.is_control()).take(40).collect();
    let t = t.trim().to_string();
    if t.is_empty() {
        "otra neurona".into()
    } else {
        t
    }
}

impl Control {
    pub fn activa(&self) -> Option<&Sesion> {
        self.sesion.as_ref()
    }

    /// Abre la sesión (la pide la página tras aceptar «abrir-sesion»). `indicador` = Rust ya puso el
    /// indicador visible. Mismo aparato con sesión viva: la renueva con token nuevo.
    pub fn abrir(&mut self, token: &str, de: &str, nombre: &str, nivel: &str, ahora: u64, indicador: bool) -> Result<&Sesion, Rechazo> {
        if !huella_valida(de) || !nivel_valido(nivel) || token.len() < 32 {
            return Err(Rechazo::Forma);
        }
        if !indicador {
            return Err(Rechazo::SinIndicador);
        }
        self.caducar(ahora);
        if let Some(s) = &self.sesion {
            if s.de != de {
                return Err(Rechazo::OtraSesion);
            }
        }
        self.sesion = Some(Sesion { token: token.into(), de: de.into(), nombre: nombre_limpio(nombre), nivel: nivel.into(), inicio_ms: ahora, ultima_ms: ahora });
        Ok(self.sesion.as_ref().expect("recién puesta"))
    }

    /// Antes de ejecutar CADA orden: hay sesión viva, el token es el suyo y el indicador sigue a la vista.
    pub fn orden(&mut self, token: &str, nombre: &str, ahora: u64, indicador: bool) -> Result<&Sesion, Rechazo> {
        if !nombre_orden_valido(nombre) {
            return Err(Rechazo::Forma);
        }
        self.caducar(ahora);
        if !indicador && self.sesion.is_some() {
            // Indicador desaparecido = sesión cerrada (SEG1111T §4.7, §2.4 del contrato).
            self.parar(ahora, "sin-indicador");
            return Err(Rechazo::SinIndicador);
        }
        let Some(s) = self.sesion.as_mut() else { return Err(Rechazo::SinSesion) };
        if !crate::sha256::iguales_ct(s.token.as_bytes(), token.as_bytes()) {
            return Err(Rechazo::Token);
        }
        s.ultima_ms = ahora;
        Ok(s)
    }

    /// Cierra la sesión si pasó la hora o 2 min sin órdenes. Devuelve la sesión cerrada.
    pub fn caducar(&mut self, ahora: u64) -> Option<Sesion> {
        let vencida = self
            .sesion
            .as_ref()
            .is_some_and(|s| ahora.saturating_sub(s.inicio_ms) > SESION_MAX_MS || ahora.saturating_sub(s.ultima_ms) > SESION_INACTIVA_MS);
        if vencida {
            self.parar(ahora, "caducada")
        } else {
            None
        }
    }

    /// Para: no necesita a la página para nada. Devuelve la sesión que había.
    pub fn parar(&mut self, ahora: u64, motivo: &str) -> Option<Sesion> {
        let s = self.sesion.take();
        if s.is_some() {
            self.ultima_parada = Some((ahora, limpiar(motivo, 40)));
        }
        s
    }
}

// ─────────────────────────── Registro encadenado ───────────────────────────

fn limpiar(s: &str, max: usize) -> String {
    s.chars().map(|c| if c.is_control() { ' ' } else { c }).take(max).collect()
}

fn hash_de(ant: &str, t: &str, ev: &str, detalle: &str) -> String {
    crate::sha256::hex(&crate::sha256::sha256(format!("{ant}|{t}|{ev}|{detalle}").as_bytes()))
}

/// Una línea: JSON con hora, evento, detalle, hash anterior (`ant`) y el suyo (`h`). Nunca guarda capturas
/// ni el contenido de las órdenes: solo su nombre, el aparato (8 caracteres) y el resultado.
pub fn linea_registro(anterior: &str, t: &str, evento: &str, detalle: &str) -> String {
    let evento = limpiar(evento, 40);
    let detalle = limpiar(detalle, MAX_DETALLE);
    let h = hash_de(anterior, t, &evento, &detalle);
    serde_json::json!({ "t": t, "ev": evento, "detalle": detalle, "ant": anterior, "h": h }).to_string()
}

pub fn ultimo_hash(texto: &str) -> String {
    texto
        .lines()
        .rev()
        .find(|l| !l.trim().is_empty())
        .and_then(|l| serde_json::from_str::<serde_json::Value>(l).ok())
        .and_then(|v| v.get("h").and_then(|h| h.as_str()).map(str::to_string))
        .unwrap_or_else(|| INICIO_CADENA.to_string())
}

/// Ok(líneas) o Err(número de la primera línea rota, desde 1): quitar o cambiar una línea se nota.
pub fn verificar_registro(texto: &str) -> Result<usize, usize> {
    let mut ant = INICIO_CADENA.to_string();
    let mut n = 0;
    for (i, l) in texto.lines().enumerate().filter(|(_, l)| !l.trim().is_empty()) {
        let v: serde_json::Value = serde_json::from_str(l).map_err(|_| i + 1)?;
        let s = |k: &str| v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string();
        if s("ant") != ant || hash_de(&s("ant"), &s("t"), &s("ev"), &s("detalle")) != s("h") {
            return Err(i + 1);
        }
        ant = s("h");
        n += 1;
    }
    Ok(n)
}

#[cfg(test)]
mod pruebas {
    use super::*;

    const DE: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const TOK: &str = "00112233445566778899aabbccddeeff";

    #[test]
    fn sin_indicador_no_hay_sesion() {
        let mut c = Control::default();
        assert_eq!(c.abrir(TOK, DE, "Mac", "controlar", 0, false).unwrap_err(), Rechazo::SinIndicador);
        assert!(c.activa().is_none());
    }

    #[test]
    fn parar_cierra_aunque_la_pagina_no_conteste() {
        // La «página» es un falso que nunca contesta: Rust no la necesita para parar.
        struct PaginaColgada;
        impl PaginaColgada {
            #[allow(dead_code)]
            fn contestar(&self) -> Option<()> {
                None
            }
        }
        let _pagina = PaginaColgada;
        let mut c = Control::default();
        c.abrir(TOK, DE, "Mac", "controlar", 1_000, true).unwrap();
        assert!(c.orden(TOK, "leer-estado", 2_000, true).is_ok());
        assert!(c.parar(3_000, "la persona, desde el indicador").is_some());
        assert_eq!(c.orden(TOK, "colgar", 3_001, true).unwrap_err(), Rechazo::SinSesion);
        assert_eq!(c.ultima_parada.as_ref().unwrap().1, "la persona, desde el indicador");
    }

    #[test]
    fn token_ajeno_inactividad_hora_e_indicador_perdido() {
        let mut c = Control::default();
        c.abrir(TOK, DE, "Mac", "controlar", 0, true).unwrap();
        assert_eq!(c.orden("ffffffffffffffffffffffffffffffff", "colgar", 10, true).unwrap_err(), Rechazo::Token);
        assert!(c.orden(TOK, "colgar", SESION_INACTIVA_MS, true).is_ok());
        assert_eq!(c.orden(TOK, "colgar", 2 * SESION_INACTIVA_MS + 1, true).unwrap_err(), Rechazo::SinSesion);
        c.abrir(TOK, DE, "Mac", "controlar", 0, true).unwrap();
        let mut t = 0;
        while t < SESION_MAX_MS {
            t += 60_000;
            let _ = c.orden(TOK, "leer-estado", t, true);
        }
        assert_eq!(c.orden(TOK, "leer-estado", SESION_MAX_MS + 60_001, true).unwrap_err(), Rechazo::SinSesion);
        c.abrir(TOK, DE, "Mac", "controlar", 0, true).unwrap();
        assert_eq!(c.orden(TOK, "colgar", 5, false).unwrap_err(), Rechazo::SinIndicador);
        assert!(c.activa().is_none());
    }

    #[test]
    fn otro_aparato_no_pisa_la_sesion_y_formas() {
        let mut c = Control::default();
        c.abrir(TOK, DE, "Mac", "controlar", 0, true).unwrap();
        let otro = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
        assert_eq!(c.abrir(TOK, otro, "X", "controlar", 1, true).unwrap_err(), Rechazo::OtraSesion);
        assert_eq!(c.abrir(TOK, "ZZ", "X", "controlar", 1, true).unwrap_err(), Rechazo::Forma);
        assert_eq!(c.abrir(TOK, DE, "X", "administrar", 1, true).unwrap_err(), Rechazo::Forma);
        assert_eq!(c.orden(TOK, "rm -rf", 2, true).unwrap_err(), Rechazo::Forma);
        assert_eq!(nombre_limpio("\u{7}  "), "otra neurona");
    }

    #[test]
    fn registro_encadenado_detecta_borrar_y_cambiar() {
        let mut texto = String::new();
        for (i, ev) in ["sesion-abierta", "orden", "orden", "parada"].iter().enumerate() {
            let l = linea_registro(&ultimo_hash(&texto), &format!("2026-11-15T00:00:0{i}Z"), ev, "de=01234567 leer-estado");
            texto.push_str(&l);
            texto.push('\n');
        }
        assert_eq!(verificar_registro(&texto), Ok(4));
        let sin_segunda: String = texto.lines().enumerate().filter(|(i, _)| *i != 1).map(|(_, l)| format!("{l}\n")).collect();
        assert_eq!(verificar_registro(&sin_segunda), Err(2));
        let cambiada = texto.replacen("leer-estado", "colgar", 1);
        assert_eq!(verificar_registro(&cambiada), Err(1));
    }
}
