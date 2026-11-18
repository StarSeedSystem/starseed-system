//! (CTL1117M) Control entre mis neuronas · el Mac como aparato CONTROLADO: la lógica pura (sin AppKit, sin enigo, sin
//! xcap y sin reloj real), para que se pruebe en cualquier sistema. Lo que toca el sistema está en
//! `control_entrada_macos.rs`, `control_pantalla_escritorio.rs` y `control_aceptados_escritorio.rs` (solo macOS).
//!
//! Contiene:
//!   · `alcance` (S2): `total` (por defecto; un valor que falta o no se conoce se lee como `total`) o `protegido`.
//!   · La lista de lo que `protegido` NO deja tocar en macOS y la decisión (`permite`).
//!   · De `gesto` a acciones de ratón: un dedo → puntero, dos dedos → rueda, pulsación larga → clic derecho.
//!   · De `texto` a pulsaciones (saltos de línea, tabulador, borrar y escape).
//!   · Descontar los eventos PROPIOS al pausar por entrada local (una mano de verdad sí pausa).
//!   · Texto del diálogo nativo de aceptación y el archivo de controladores aceptados.
//!   · Lo que contesta `control_capacidades` en macOS.

use crate::control_entrada_logica as l;
use serde_json::{json, Value};

// ─────────────────────────── Alcance (S2) ───────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Alcance {
    Total,
    Protegido,
}

impl Alcance {
    pub fn codigo(self) -> &'static str {
        match self {
            Alcance::Total => "total",
            Alcance::Protegido => "protegido",
        }
    }
}

/// El campo `alcance` de `control-ajustes.json` (el mismo archivo de `indicador` y `ver_toques`). Falta, no es texto
/// o no se conoce → `total` (la decisión del dueño); solo la palabra `protegido` baja el alcance.
pub fn leer_alcance(texto: &str) -> Alcance {
    match serde_json::from_str::<Value>(texto).ok().as_ref().and_then(|v| v.get("alcance")).and_then(|a| a.as_str()) {
        Some("protegido") => Alcance::Protegido,
        _ => Alcance::Total,
    }
}

/// Apps que `protegido` no deja tocar en macOS: StarSeed OS, Ajustes del Sistema, App Store y los diálogos de seguridad
/// del sistema (autenticación, privacidad, ventana de inicio de sesión, avisos de accesibilidad).
pub const PAQUETES_PROTEGIDOS: [&str; 10] = [
    "app.starseed.os",
    "com.apple.systempreferences",
    "com.apple.AppStore",
    "com.apple.SecurityAgent",
    "com.apple.securityd",
    "com.apple.loginwindow",
    "com.apple.coreservices.uiagent",
    "com.apple.UserNotificationCenter",
    "com.apple.accessibility.universalAccessAuthWarn",
    "com.apple.ScreenSaver.Engine",
];

/// ¿`protegido` rechaza esta orden? `frontal`: paquete de la app al frente (None = no se pudo saber → se rechaza, ante la
/// duda); `entrada_segura`: hay un campo de contraseña con el foco o una app activó la entrada segura; `es_texto`: la orden
/// escribe. `total` no rechaza nada aquí (el Mac bloqueado se mira aparte, en los dos alcances).
pub fn permite(alcance: Alcance, frontal: Option<&str>, entrada_segura: bool, es_texto: bool) -> Result<(), &'static str> {
    if alcance == Alcance::Total {
        return Ok(());
    }
    match frontal {
        None => Err("app-desconocida"),
        Some(p) if PAQUETES_PROTEGIDOS.contains(&p) || p.starts_with("com.apple.SecurityAgent") => Err("app-protegida"),
        Some(_) if es_texto && entrada_segura => Err("entrada-segura"),
        Some(_) => Ok(()),
    }
}

// ─────────────────────────── Teclas ───────────────────────────

/// Las teclas del vocabulario cerrado (`l::TECLAS`) que un Mac tiene. `escritorio` no es una tecla: es la marca con la
/// que la ventana de quien manda sabe que habla con un ordenador y no con una tableta (no se puede mandar como orden).
pub const TECLAS_MAC: [&str; 5] = ["recientes", "bloquear", "volumen-subir", "volumen-bajar", "silencio"];
pub const MARCA_ESCRITORIO: &str = "escritorio";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TeclaMac {
    /// Mission Control.
    Recientes,
    /// ⌃⌘Q: bloquear la pantalla.
    Bloquear,
    VolumenSubir,
    VolumenBajar,
    Silencio,
}

pub fn tecla_de(cual: &str) -> Option<TeclaMac> {
    Some(match cual {
        "recientes" => TeclaMac::Recientes,
        "bloquear" => TeclaMac::Bloquear,
        "volumen-subir" => TeclaMac::VolumenSubir,
        "volumen-bajar" => TeclaMac::VolumenBajar,
        "silencio" => TeclaMac::Silencio,
        _ => return None,
    })
}

// ─────────────────────────── Texto ───────────────────────────

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParteTexto {
    Texto(String),
    Intro,
    Tabulador,
    Borrar,
    Escape,
}

/// El texto que manda la ventana → pulsaciones. `\n` es Intro, `\t` Tabulador, `\u{8}` Borrar y `\u{1b}` Escape; el resto de
/// caracteres de control se ignora (nunca se escriben bytes raros en otra app).
pub fn partir_texto(t: &str) -> Vec<ParteTexto> {
    let mut salida = Vec::new();
    let mut actual = String::new();
    let vaciar = |actual: &mut String, salida: &mut Vec<ParteTexto>| {
        if !actual.is_empty() {
            salida.push(ParteTexto::Texto(std::mem::take(actual)));
        }
    };
    for c in t.chars() {
        let especial = match c {
            '\n' | '\r' => Some(ParteTexto::Intro),
            '\t' => Some(ParteTexto::Tabulador),
            '\u{8}' | '\u{7f}' => Some(ParteTexto::Borrar),
            '\u{1b}' => Some(ParteTexto::Escape),
            c if c.is_control() => {
                vaciar(&mut actual, &mut salida);
                continue;
            }
            c => {
                actual.push(c);
                continue;
            }
        };
        vaciar(&mut actual, &mut salida);
        if let Some(e) = especial {
            salida.push(e);
        }
    }
    vaciar(&mut actual, &mut salida);
    salida
}

// ─────────────────────────── Gestos → ratón ───────────────────────────

/// Un dedo del `gesto` ya normalizado (x, y en 0..1 y dt en ms).
#[derive(Debug, Clone, PartialEq)]
pub struct DedoG {
    pub id: u8,
    pub puntos: Vec<(f64, f64, u64)>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct GestoG {
    pub dedos: Vec<DedoG>,
    pub sigue: bool,
}

/// Lee los argumentos que `l::normalizar("gesto", …)` dejó.
pub fn leer_gesto(args: &Value) -> Option<GestoG> {
    let sigue = args.get("sigue")?.as_bool()?;
    let dedos = args
        .get("dedos")?
        .as_array()?
        .iter()
        .map(|d| {
            let id = d.get("id")?.as_u64()? as u8;
            let puntos = d
                .get("puntos")?
                .as_array()?
                .iter()
                .map(|p| {
                    let a = p.as_array()?;
                    Some((a.first()?.as_f64()?, a.get(1)?.as_f64()?, a.get(2)?.as_u64()?))
                })
                .collect::<Option<Vec<_>>>()?;
            Some(DedoG { id, puntos })
        })
        .collect::<Option<Vec<_>>>()?;
    (!dedos.is_empty()).then_some(GestoG { dedos, sigue })
}

#[derive(Debug, Clone, PartialEq)]
pub enum Accion {
    /// Mueve el puntero (x, y en 0..1 de la pantalla principal; con el botón pulsado es un arrastre).
    Mover(f64, f64),
    Pulsar,
    Soltar,
    ClicIzq,
    ClicDer,
    /// Líneas de rueda (positivo = hacia abajo / hacia la derecha).
    Rueda { v: i32, h: i32 },
}

/// Lo que mueve un dedo antes de contar como arrastre (píxeles de pantalla).
pub const UMBRAL_ARRASTRE_PX: f64 = 8.0;
/// Una pulsación así de larga, casi quieta, es clic derecho.
pub const PULSACION_LARGA_MS: u64 = 550;
/// Píxeles que equivalen a una línea de rueda.
pub const PX_POR_LINEA: f64 = 14.0;

/// El estado de la mano entre una orden y la siguiente (`sigue:true` deja el dedo abajo).
#[derive(Debug, Default, Clone)]
pub struct Mano {
    activa: bool,
    inicio: (f64, f64),
    ultimo: (f64, f64),
    t_ms: u64,
    pulsado: bool,
    largo: bool,
    /// Hubo dos dedos: hasta levantar todo no se hace nada con el que queda (no es un clic).
    ignorar: bool,
    centro: Option<(f64, f64)>,
    resto_v: f64,
    resto_h: f64,
}

fn acotar(v: f64) -> f64 {
    if v.is_finite() { v.clamp(0.0, 1.0) } else { 0.0 }
}

impl Mano {
    pub fn hay_dedo(&self) -> bool {
        self.activa
    }

    pub fn olvidar(&mut self) {
        *self = Mano::default();
    }

    /// Lo que debe hacerse ahora para soltar lo que hubiera pulsado (al pausar, parar o cambiar de modo).
    pub fn soltar_todo(&mut self) -> Vec<Accion> {
        let pulsado = self.pulsado;
        self.olvidar();
        if pulsado { vec![Accion::Soltar] } else { Vec::new() }
    }

    /// Avanza la mano con una orden `gesto`. `ancho_px` y `alto_px` son los de la pantalla principal (puntos).
    pub fn avanzar(&mut self, g: &GestoG, ancho_px: f64, alto_px: f64) -> Vec<Accion> {
        let mut a = Vec::new();
        if g.dedos.len() >= 2 {
            return self.rueda(g, ancho_px, alto_px);
        }
        let Some(dedo) = g.dedos.first() else { return a };
        if self.ignorar {
            if !g.sigue {
                self.olvidar();
            }
            return a;
        }
        if !self.activa {
            let Some(&(x, y, _)) = dedo.puntos.first() else { return a };
            let (x, y) = (acotar(x), acotar(y));
            self.activa = true;
            self.inicio = (x, y);
            self.ultimo = (x, y);
            self.t_ms = 0;
            a.push(Accion::Mover(x, y));
        }
        for &(x, y, dt) in &dedo.puntos {
            let (x, y) = (acotar(x), acotar(y));
            self.t_ms = self.t_ms.saturating_add(dt);
            let d = ((x - self.inicio.0) * ancho_px).hypot((y - self.inicio.1) * alto_px);
            if !self.pulsado && !self.largo && d >= UMBRAL_ARRASTRE_PX {
                a.push(Accion::Pulsar);
                self.pulsado = true;
            }
            if self.pulsado {
                a.push(Accion::Mover(x, y));
            }
            self.ultimo = (x, y);
        }
        if !g.sigue {
            if self.pulsado {
                a.push(Accion::Mover(self.ultimo.0, self.ultimo.1));
                a.push(Accion::Soltar);
            } else if self.t_ms >= PULSACION_LARGA_MS {
                a.push(Accion::ClicDer);
            } else {
                a.push(Accion::ClicIzq);
            }
            self.olvidar();
        }
        a
    }

    fn rueda(&mut self, g: &GestoG, ancho_px: f64, alto_px: f64) -> Vec<Accion> {
        let mut a = Vec::new();
        if self.pulsado {
            a.push(Accion::Soltar);
            self.pulsado = false;
        }
        self.activa = true;
        self.ignorar = true; // lo que quede de un dedo al levantar el otro no hace nada
        let ultimos: Vec<(f64, f64)> = g.dedos.iter().filter_map(|d| d.puntos.last().map(|p| (acotar(p.0), acotar(p.1)))).collect();
        if ultimos.is_empty() {
            return a;
        }
        let n = ultimos.len() as f64;
        let fin = (ultimos.iter().map(|p| p.0).sum::<f64>() / n, ultimos.iter().map(|p| p.1).sum::<f64>() / n);
        let primeros: Vec<(f64, f64)> = g.dedos.iter().filter_map(|d| d.puntos.first().map(|p| (acotar(p.0), acotar(p.1)))).collect();
        let ini = self.centro.unwrap_or_else(|| {
            let m = primeros.len().max(1) as f64;
            (primeros.iter().map(|p| p.0).sum::<f64>() / m, primeros.iter().map(|p| p.1).sum::<f64>() / m)
        });
        // Dedos hacia arriba = contenido hacia arriba = la rueda baja (como en una pantalla táctil).
        self.resto_v += -(fin.1 - ini.1) * alto_px / PX_POR_LINEA;
        self.resto_h += -(fin.0 - ini.0) * ancho_px / PX_POR_LINEA;
        let (v, h) = (self.resto_v.trunc(), self.resto_h.trunc());
        self.resto_v -= v;
        self.resto_h -= h;
        self.centro = Some(fin);
        if v != 0.0 || h != 0.0 {
            a.push(Accion::Rueda { v: v as i32, h: h as i32 });
        }
        if !g.sigue {
            self.olvidar();
        }
        a
    }
}

// ─────────────────────────── Descontar la entrada propia ───────────────────────────

/// Las clases de evento del sistema que la pausa local mira por separado.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Clase {
    Raton = 0,
    Boton = 1,
    Rueda = 2,
    Tecla = 3,
}

pub const CLASES: [Clase; 4] = [Clase::Raton, Clase::Boton, Clase::Rueda, Clase::Tecla];
/// Tipos de `CGEventType` de cada clase (`CGEventSourceSecondsSinceLastEventType`).
pub fn tipos_de(c: Clase) -> &'static [u32] {
    match c {
        Clase::Raton => &[5, 6, 7, 27],
        Clase::Boton => &[1, 2, 3, 4, 25, 26],
        Clase::Rueda => &[22],
        Clase::Tecla => &[10, 11, 12, 14],
    }
}

/// Un evento del sistema más antiguo que esto ya no cuenta para pausar (se habría visto antes).
pub const RECIENTE_MS: u64 = 400;
/// Margen que se da a los eventos propios por si el sistema los sella un poco antes o después.
pub const MARGEN_ANTES_MS: u64 = 12;
pub const MARGEN_DESPUES_MS: u64 = 40;
/// Una ráfaga propia se parte cuando pasan más de esto sin inyectar nada.
pub const RAFAGA_MS: u64 = 150;
/// Lo que se aparta el puntero de donde lo dejamos, ya asentado, para decir que lo movió una mano.
pub const DESVIO_PUNTERO_PX: f64 = 5.0;
/// Tras inyectar, así de tiempo se espera a mirar dónde quedó el puntero.
pub const ASENTAR_MS: u64 = 80;

/// Cuándo inyectamos nosotros, por clase. `marcar` se llama justo antes y justo después de cada evento propio.
#[derive(Debug, Default, Clone)]
pub struct Propias {
    ini: [u64; 4],
    fin: [u64; 4],
}

impl Propias {
    pub fn marcar(&mut self, c: Clase, ahora_ms: u64) {
        let i = c as usize;
        let ahora_ms = ahora_ms.max(1);
        if self.fin[i] == 0 || ahora_ms.saturating_sub(self.fin[i]) > RAFAGA_MS {
            self.ini[i] = ahora_ms;
        }
        self.fin[i] = ahora_ms;
    }

    pub fn ultima_ms(&self) -> u64 {
        self.fin.iter().copied().max().unwrap_or(0)
    }

    /// ¿El evento de esta clase, ocurrido en `evento_ms`, lo causamos nosotros?
    pub fn es_propio(&self, c: Clase, evento_ms: u64) -> bool {
        let i = c as usize;
        self.fin[i] != 0 && evento_ms + MARGEN_ANTES_MS >= self.ini[i] && evento_ms <= self.fin[i] + MARGEN_DESPUES_MS
    }
}

/// De los últimos eventos del sistema por clase (`hace_ms`: cuánto hace que ocurrió el último de esa clase) → el instante
/// del que es de una MANO, si lo hay. Un evento propio nunca pausa; uno que no lo es, sí.
pub fn evento_de_mano(propias: &Propias, ahora_ms: u64, hace_ms: [Option<u64>; 4]) -> Option<u64> {
    let mut mas_reciente: Option<u64> = None;
    for c in CLASES {
        let Some(h) = hace_ms[c as usize] else { continue };
        if h > RECIENTE_MS {
            continue;
        }
        let e = ahora_ms.saturating_sub(h);
        if !propias.es_propio(c, e) {
            mas_reciente = Some(mas_reciente.map_or(e, |m| m.max(e)));
        }
    }
    mas_reciente
}

/// ¿El puntero está donde lo dejamos? Si ya se asentó (pasó `ASENTAR_MS` desde nuestra última inyección) y se apartó más
/// de `DESVIO_PUNTERO_PX`, lo movió una mano.
pub fn puntero_movido_por_mano(dejado: Option<(f64, f64)>, actual: (f64, f64), ultima_propia_ms: u64, ahora_ms: u64) -> bool {
    let Some(d) = dejado else { return false };
    ultima_propia_ms != 0 && ahora_ms.saturating_sub(ultima_propia_ms) >= ASENTAR_MS && (actual.0 - d.0).hypot(actual.1 - d.1) > DESVIO_PUNTERO_PX
}

// ─────────────────────────── Controladores aceptados (archivo nativo) ───────────────────────────

/// `aceptados.json`: el mismo formato que lee `l::leer_aceptados` y que escribe Kotlin en Android. Aquí lo escribe SOLO
/// Rust, y solo con el «Sí» del diálogo nativo del Mac.
pub fn aceptados_a_texto(lista: &[l::Aceptado]) -> String {
    json!({ "controladores": lista.iter().map(|a| json!({ "spki": a.spki, "huella": a.huella, "nombre": a.nombre, "cuenta": a.cuenta })).collect::<Vec<_>>() }).to_string()
}

/// La lista con `nuevo` dentro (si ya estaba esa huella, se sustituye: el nombre que la persona acaba de ver manda). Máximo 16.
pub fn con_aceptado(lista: &[l::Aceptado], nuevo: l::Aceptado) -> Vec<l::Aceptado> {
    let mut v: Vec<l::Aceptado> = lista.iter().filter(|a| a.huella != nuevo.huella).cloned().collect();
    v.push(nuevo);
    while v.len() > 16 {
        v.remove(0);
    }
    v
}

pub fn sin_aceptado(lista: &[l::Aceptado], huella: &str) -> (Vec<l::Aceptado>, usize) {
    let v: Vec<l::Aceptado> = lista.iter().filter(|a| a.huella != huella).cloned().collect();
    let quitados = lista.len() - v.len();
    (v, quitados)
}

/// Lo que dice el diálogo nativo al aceptar un controlador. Dice la verdad de `alcance`: con `total`, que quien controla
/// ve la pantalla y maneja TODO el Mac, con todas las apps.
pub fn texto_aceptar(nombre: &str, codigo: &str, alcance: Alcance) -> String {
    let nombre: String = nombre.chars().filter(|c| !c.is_control()).take(40).collect();
    let nombre = if nombre.trim().is_empty() { "otra neurona".to_string() } else { nombre.trim().to_string() };
    let alcance_txt = match alcance {
        Alcance::Total => "Control TOTAL: podrá ver tu pantalla y mover el ratón, pulsar y escribir en cualquier app de este Mac, \
            también StarSeed OS, Ajustes del Sistema, la App Store, los instaladores y los campos de contraseña. Solo se niega con la pantalla bloqueada.",
        Alcance::Protegido => "Control PROTEGIDO: podrá ver tu pantalla y manejar el ratón y el teclado, pero no cuando el frente sea StarSeed OS, \
            Ajustes del Sistema, la App Store o un diálogo de seguridad del sistema, ni para escribir en un campo de contraseña.",
    };
    format!(
        "¿Dejar que «{nombre}» (código {codigo}) controle este Mac?\n\n\
         Compara ese código con el que ves en la otra neurona antes de decir que sí.\n\n{alcance_txt}\n\n\
         Mientras te controle verás un borde rojo y «● Controlada por …» en la barra de menús. Tocar el teclado o el ratón pausa; \
         ⌃⌥⌘. termina. Cada orden queda en el registro de este Mac (nunca lo que se escribe ni dónde se pulsa). \
         Al apagar «Control entre tus neuronas» esta lista se vacía."
    )
}

// ─────────────────────────── Capacidades ───────────────────────────

pub const FALTA_GRABACION: &str = "grabacion-pantalla";
pub const FALTA_ACCESIBILIDAD: &str = "accesibilidad-mac";
pub const AJUSTES_MAC: [&str; 2] = [FALTA_GRABACION, FALTA_ACCESIBILIDAD];

/// La pantalla de Ajustes del Sistema donde la persona da cada permiso (solo se ABRE; nada se concede por código).
pub fn url_ajuste(cual: &str) -> Option<&'static str> {
    match cual {
        FALTA_GRABACION => Some("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"),
        FALTA_ACCESIBILIDAD => Some("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"),
        _ => None,
    }
}

/// `control_capacidades` en macOS: lo que se puede de verdad AHORA (con los permisos que la persona dio en este Mac) y lo
/// que falta. Sin «Accesibilidad» no se promete entrada; sin «Grabación de pantalla» no se promete pantalla.
pub fn capacidades_mac(grabacion: bool, accesibilidad: bool, alcance: Alcance) -> Value {
    let mut falta: Vec<&str> = Vec::new();
    if !grabacion {
        falta.push(FALTA_GRABACION);
    }
    if !accesibilidad {
        falta.push(FALTA_ACCESIBILIDAD);
    }
    let mut teclas: Vec<&str> = if accesibilidad { TECLAS_MAC.to_vec() } else { Vec::new() };
    teclas.push(MARCA_ESCRITORIO);
    json!({
        "pantalla": { "accesibilidad": false, "proyeccion": grabacion, "sin_preguntar": true },
        "entrada": {
            "gestos": accesibilidad,
            "max_dedos": if accesibilidad { 2 } else { 0 },
            "teclas": teclas,
            "volumen": false,
            "brillo": false,
            "texto": accesibilidad,
        },
        "falta": falta,
        "alcance": alcance.codigo(),
        "plataforma": "macos",
    })
}

/// Líneas del registro de enlaces, con las mismas claves que Android.
pub fn linea_inicio_entrada(sesion: &str, alcance: Alcance) -> String {
    format!("inicio sesion={} plataforma=macos alcance={}", sesion.chars().take(8).collect::<String>(), alcance.codigo())
}

pub fn linea_fin_entrada(c: &l::Contadores, propias_descontadas: u64, pausas_de_mano: u64) -> String {
    format!("{} propias-descontadas={propias_descontadas} pausas-de-mano={pausas_de_mano}", c.linea())
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn dedo(id: u8, p: &[(f64, f64, u64)]) -> DedoG {
        DedoG { id, puntos: p.to_vec() }
    }
    fn g(dedos: Vec<DedoG>, sigue: bool) -> GestoG {
        GestoG { dedos, sigue }
    }
    const W: f64 = 1440.0;
    const H: f64 = 900.0;

    #[test]
    fn el_alcance_sin_valor_o_desconocido_es_total_y_solo_protegido_baja() {
        assert_eq!(leer_alcance(""), Alcance::Total);
        assert_eq!(leer_alcance("{}"), Alcance::Total);
        assert_eq!(leer_alcance("{\"alcance\":\"raro\"}"), Alcance::Total);
        assert_eq!(leer_alcance("{\"alcance\":3}"), Alcance::Total);
        assert_eq!(leer_alcance("{\"alcance\":\"total\"}"), Alcance::Total);
        assert_eq!(leer_alcance("{\"indicador\":\"punto\",\"alcance\":\"protegido\"}"), Alcance::Protegido);
    }

    #[test]
    fn total_no_rechaza_ninguna_app_y_protegido_rechaza_las_de_la_lista() {
        for p in PAQUETES_PROTEGIDOS {
            assert_eq!(permite(Alcance::Total, Some(p), true, true), Ok(()), "{p}");
            assert_eq!(permite(Alcance::Protegido, Some(p), false, false), Err("app-protegida"), "{p}");
        }
        assert_eq!(permite(Alcance::Protegido, Some("com.apple.Safari"), false, false), Ok(()));
        assert_eq!(permite(Alcance::Protegido, Some("com.apple.Safari"), true, false), Ok(()), "un clic con entrada segura pasa");
        assert_eq!(permite(Alcance::Protegido, Some("com.apple.Safari"), true, true), Err("entrada-segura"));
        assert_eq!(permite(Alcance::Protegido, None, false, false), Err("app-desconocida"));
        assert_eq!(permite(Alcance::Protegido, Some("com.apple.SecurityAgent.helper"), false, false), Err("app-protegida"));
        assert_eq!(permite(Alcance::Total, None, true, true), Ok(()));
    }

    #[test]
    fn protegido_nombra_starseed_os_ajustes_app_store_y_los_dialogos_de_seguridad() {
        for p in ["app.starseed.os", "com.apple.systempreferences", "com.apple.AppStore", "com.apple.SecurityAgent"] {
            assert!(PAQUETES_PROTEGIDOS.contains(&p), "{p}");
        }
    }

    #[test]
    fn un_toque_es_un_clic_izquierdo_y_una_pulsacion_larga_quieta_es_clic_derecho() {
        let mut m = Mano::default();
        let a = m.avanzar(&g(vec![dedo(0, &[(0.5, 0.5, 0)])], false), W, H);
        assert_eq!(a, vec![Accion::Mover(0.5, 0.5), Accion::ClicIzq]);
        assert!(!m.hay_dedo());
        // Clic repartido: abajo con sigue:true y luego arriba.
        let a1 = m.avanzar(&g(vec![dedo(0, &[(0.2, 0.3, 0)])], true), W, H);
        assert_eq!(a1, vec![Accion::Mover(0.2, 0.3)]);
        let a2 = m.avanzar(&g(vec![dedo(0, &[(0.2, 0.3, 90)])], false), W, H);
        assert_eq!(a2, vec![Accion::ClicIzq]);
        // Larga.
        let a1 = m.avanzar(&g(vec![dedo(0, &[(0.4, 0.4, 0)])], true), W, H);
        assert_eq!(a1, vec![Accion::Mover(0.4, 0.4)]);
        let a2 = m.avanzar(&g(vec![dedo(0, &[(0.4, 0.4, 700)])], false), W, H);
        assert_eq!(a2, vec![Accion::ClicDer]);
    }

    #[test]
    fn mover_mas_del_umbral_pulsa_arrastra_y_suelta_al_levantar() {
        let mut m = Mano::default();
        m.avanzar(&g(vec![dedo(0, &[(0.1, 0.1, 0)])], true), W, H);
        let a = m.avanzar(&g(vec![dedo(0, &[(0.1, 0.1, 10), (0.2, 0.2, 20)])], true), W, H);
        assert_eq!(a, vec![Accion::Pulsar, Accion::Mover(0.1, 0.1), Accion::Mover(0.2, 0.2)].into_iter().filter(|x| *x != Accion::Mover(0.1, 0.1)).collect::<Vec<_>>().into_iter().take(0).chain([Accion::Pulsar, Accion::Mover(0.2, 0.2)]).collect::<Vec<_>>());
        assert!(m.pulsado);
        let a = m.avanzar(&g(vec![dedo(0, &[(0.3, 0.3, 20)])], false), W, H);
        assert_eq!(a, vec![Accion::Mover(0.3, 0.3), Accion::Mover(0.3, 0.3), Accion::Soltar]);
        assert!(!m.hay_dedo());
    }

    #[test]
    fn un_temblor_menor_que_el_umbral_sigue_siendo_un_clic() {
        let mut m = Mano::default();
        // 0,002 de 1440 = 2,9 px: por debajo de 8.
        let a = m.avanzar(&g(vec![dedo(0, &[(0.5, 0.5, 0), (0.502, 0.5, 30)])], false), W, H);
        assert_eq!(a, vec![Accion::Mover(0.5, 0.5), Accion::ClicIzq]);
    }

    #[test]
    fn dos_dedos_hacen_rueda_y_el_dedo_que_queda_no_hace_clic() {
        let mut m = Mano::default();
        // Dos dedos suben 0,1 de alto (90 px) → ~6 líneas hacia abajo.
        let a = m.avanzar(&g(vec![dedo(0, &[(0.4, 0.6, 0), (0.4, 0.5, 30)]), dedo(1, &[(0.6, 0.6, 0), (0.6, 0.5, 30)])], true), W, H);
        assert_eq!(a, vec![Accion::Rueda { v: 6, h: 0 }]);
        // Siguiente orden: continúa desde donde quedó (resto acumulado, no se repite el tramo).
        let a = m.avanzar(&g(vec![dedo(0, &[(0.4, 0.5, 0), (0.4, 0.4, 30)]), dedo(1, &[(0.6, 0.5, 0), (0.6, 0.4, 30)])], true), W, H);
        assert_eq!(a, vec![Accion::Rueda { v: 6, h: 0 }]);
        // Se levanta uno: el que queda se mueve y NO hace clic ni arrastra.
        let a = m.avanzar(&g(vec![dedo(1, &[(0.6, 0.4, 0), (0.7, 0.4, 20)])], true), W, H);
        assert!(a.is_empty());
        let a = m.avanzar(&g(vec![dedo(1, &[(0.7, 0.4, 20)])], false), W, H);
        assert!(a.is_empty());
        assert!(!m.hay_dedo());
        // Y luego un toque normal vuelve a funcionar.
        let a = m.avanzar(&g(vec![dedo(0, &[(0.5, 0.5, 0)])], false), W, H);
        assert_eq!(a, vec![Accion::Mover(0.5, 0.5), Accion::ClicIzq]);
    }

    #[test]
    fn la_rueda_hacia_el_otro_lado_y_los_restos_no_se_pierden() {
        let mut m = Mano::default();
        // 5 px hacia abajo: menos de una línea → nada todavía.
        let a = m.avanzar(&g(vec![dedo(0, &[(0.4, 0.5, 0), (0.4, 0.5 + 5.0 / H, 10)]), dedo(1, &[(0.6, 0.5, 0), (0.6, 0.5 + 5.0 / H, 10)])], true), W, H);
        assert!(a.is_empty());
        // Otros 20 px hacia abajo: en total 25 px = 1,8 líneas hacia ARRIBA (−1).
        let a = m.avanzar(&g(vec![dedo(0, &[(0.4, 0.5 + 5.0 / H, 0), (0.4, 0.5 + 25.0 / H, 10)]), dedo(1, &[(0.6, 0.5 + 5.0 / H, 0), (0.6, 0.5 + 25.0 / H, 10)])], true), W, H);
        assert_eq!(a, vec![Accion::Rueda { v: -1, h: 0 }]);
    }

    #[test]
    fn pasar_de_arrastre_a_dos_dedos_suelta_el_boton_y_soltar_todo_tambien() {
        let mut m = Mano::default();
        m.avanzar(&g(vec![dedo(0, &[(0.1, 0.1, 0), (0.3, 0.3, 20)])], true), W, H);
        assert_eq!(m.soltar_todo(), vec![Accion::Soltar]);
        assert!(!m.hay_dedo());
        assert!(m.soltar_todo().is_empty());
        let mut m = Mano::default();
        m.avanzar(&g(vec![dedo(0, &[(0.1, 0.1, 0), (0.3, 0.3, 20)])], true), W, H);
        let a = m.avanzar(&g(vec![dedo(0, &[(0.3, 0.3, 0)]), dedo(1, &[(0.5, 0.3, 0)])], true), W, H);
        assert_eq!(a.first(), Some(&Accion::Soltar));
    }

    #[test]
    fn el_gesto_normalizado_por_la_logica_de_la_entrada_se_lee_aqui() {
        let args = l::normalizar("gesto", &json!({ "dedos": [{ "id": 0, "puntos": [[0.25, 0.75, 0], [0.5, 0.5, 40]] }], "sigue": true })).unwrap();
        let g = leer_gesto(&args).unwrap();
        assert_eq!(g.dedos.len(), 1);
        assert_eq!(g.dedos[0].puntos, vec![(0.25, 0.75, 0), (0.5, 0.5, 40)]);
        assert!(g.sigue);
        assert!(leer_gesto(&json!({ "dedos": [], "sigue": true })).is_none());
        assert!(leer_gesto(&json!({ "sigue": true })).is_none());
    }

    #[test]
    fn el_texto_se_parte_en_pulsaciones_y_los_controles_raros_se_ignoran() {
        assert_eq!(partir_texto("hola"), vec![ParteTexto::Texto("hola".into())]);
        assert_eq!(
            partir_texto("a\nb\tc\u{8}\u{1b}d"),
            vec![ParteTexto::Texto("a".into()), ParteTexto::Intro, ParteTexto::Texto("b".into()), ParteTexto::Tabulador, ParteTexto::Texto("c".into()), ParteTexto::Borrar, ParteTexto::Escape, ParteTexto::Texto("d".into())]
        );
        assert_eq!(partir_texto("x\u{1}y"), vec![ParteTexto::Texto("x".into()), ParteTexto::Texto("y".into())]);
        assert_eq!(partir_texto("ñandú 🙂"), vec![ParteTexto::Texto("ñandú 🙂".into())]);
        assert!(partir_texto("\u{0}").is_empty());
    }

    #[test]
    fn la_entrada_propia_no_pausa_y_la_de_una_mano_si() {
        let mut p = Propias::default();
        // Inyectamos un movimiento en t=1000 (marcado antes y después).
        p.marcar(Clase::Raton, 1000);
        p.marcar(Clase::Raton, 1004);
        // El sistema dice que el último movimiento fue hace 6 ms (t=1004+): es nuestro.
        assert_eq!(evento_de_mano(&p, 1010, [Some(6), None, None, None]), None);
        // Un movimiento ocurrido DESPUÉS de nuestra ráfaga + margen es de una mano.
        assert_eq!(evento_de_mano(&p, 1200, [Some(10), None, None, None]), Some(1190));
        // Una tecla de una mano mientras solo inyectamos ratón.
        assert_eq!(evento_de_mano(&p, 1010, [Some(6), None, None, Some(30)]), Some(980));
        // Un evento viejo no cuenta.
        assert_eq!(evento_de_mano(&p, 5000, [Some(2000), None, None, None]), None);
        // Una ráfaga larga continua se parte en una nueva y la mano posterior se ve.
        p.marcar(Clase::Raton, 2000);
        assert_eq!(evento_de_mano(&p, 2300, [Some(100), None, None, None]), Some(2200));
    }

    #[test]
    fn el_puntero_apartado_de_donde_lo_dejamos_es_una_mano_solo_cuando_ya_se_asento() {
        assert!(!puntero_movido_por_mano(None, (10.0, 10.0), 100, 500));
        assert!(!puntero_movido_por_mano(Some((100.0, 100.0)), (102.0, 101.0), 100, 500), "diferencia pequeña");
        assert!(!puntero_movido_por_mano(Some((100.0, 100.0)), (200.0, 100.0), 100, 140), "aún no se asentó");
        assert!(puntero_movido_por_mano(Some((100.0, 100.0)), (200.0, 100.0), 100, 400));
        assert!(!puntero_movido_por_mano(Some((100.0, 100.0)), (200.0, 100.0), 0, 400), "sin inyección propia no hay desvío que medir");
    }

    #[test]
    fn la_lista_de_aceptados_se_escribe_en_el_formato_que_lee_la_entrada() {
        let spki = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE".to_string(); // no es una clave válida: se descarta al leer
        let a = l::Aceptado { spki: spki.clone(), huella: "ab".repeat(32), nombre: "Tableta".into(), cuenta: "c1".into() };
        let t = aceptados_a_texto(&[a.clone()]);
        let v: Value = serde_json::from_str(&t).unwrap();
        assert_eq!(v["controladores"][0]["nombre"], "Tableta");
        assert_eq!(v["controladores"][0]["spki"], spki);
        assert!(l::leer_aceptados(&t).is_empty(), "una SPKI que no es P-256 válida no se acepta al leer");
        let b = l::Aceptado { nombre: "Otra".into(), ..a.clone() };
        let lista = con_aceptado(&[a.clone()], b.clone());
        assert_eq!(lista, vec![b.clone()], "la misma huella se sustituye");
        let (resto, q) = sin_aceptado(&lista, &b.huella);
        assert_eq!((resto.len(), q), (0, 1));
        let muchos: Vec<l::Aceptado> = (0..20).map(|i| l::Aceptado { huella: format!("{i:064}"), ..a.clone() }).collect();
        assert_eq!(muchos.iter().fold(Vec::new(), |v, x| con_aceptado(&v, x.clone())).len(), 16);
    }

    #[test]
    fn el_dialogo_dice_la_verdad_de_cada_alcance() {
        let t = texto_aceptar("Tableta de Alex", "ABCD-EFGH-JKLM", Alcance::Total);
        for frase in ["Tableta de Alex", "ABCD-EFGH-JKLM", "TOTAL", "cualquier app de este Mac", "StarSeed OS", "campos de contraseña", "Al apagar"] {
            assert!(t.contains(frase), "{frase}");
        }
        let t = texto_aceptar("", "X", Alcance::Protegido);
        assert!(t.contains("otra neurona") && t.contains("PROTEGIDO") && t.contains("no cuando el frente sea StarSeed OS"));
        assert!(!t.contains("TOTAL"));
        for p in [texto_aceptar("a\u{7}b", "X", Alcance::Total)] {
            assert!(p.contains("«ab»"));
        }
    }

    #[test]
    fn las_capacidades_de_un_mac_solo_prometen_lo_que_los_permisos_dan() {
        let c = capacidades_mac(false, false, Alcance::Total);
        assert_eq!(c["falta"], json!(["grabacion-pantalla", "accesibilidad-mac"]));
        assert_eq!(c["entrada"]["gestos"], false);
        assert_eq!(c["entrada"]["max_dedos"], 0);
        assert_eq!(c["entrada"]["teclas"], json!(["escritorio"]));
        assert_eq!(c["pantalla"]["proyeccion"], false);
        assert_eq!(c["alcance"], "total");
        let c = capacidades_mac(true, true, Alcance::Protegido);
        assert_eq!(c["falta"], json!([]));
        assert_eq!(c["entrada"]["max_dedos"], 2);
        assert_eq!(c["entrada"]["volumen"], false);
        assert_eq!(c["entrada"]["brillo"], false);
        assert_eq!(c["alcance"], "protegido");
        let teclas: Vec<&str> = c["entrada"]["teclas"].as_array().unwrap().iter().map(|t| t.as_str().unwrap()).collect();
        for t in &teclas {
            assert!(*t == MARCA_ESCRITORIO || l::TECLAS.contains(t), "{t} no está en el vocabulario cerrado");
        }
        for t in TECLAS_MAC {
            assert!(tecla_de(t).is_some(), "{t}");
        }
        assert!(tecla_de("atras").is_none() && tecla_de(MARCA_ESCRITORIO).is_none());
    }

    #[test]
    fn solo_se_abren_los_dos_ajustes_del_mac_y_con_su_panel_de_privacidad() {
        for a in AJUSTES_MAC {
            assert!(url_ajuste(a).unwrap().starts_with("x-apple.systempreferences:com.apple.preference.security?Privacy_"));
        }
        assert!(url_ajuste("servicio-accesibilidad").is_none());
        assert!(url_ajuste("https://example.com").is_none());
    }

    #[test]
    fn las_lineas_del_registro_llevan_las_claves_de_android_y_nada_de_contenido() {
        assert_eq!(linea_inicio_entrada("0123456789abcdef", Alcance::Total), "inicio sesion=01234567 plataforma=macos alcance=total");
        let c = l::Contadores::nueva("s");
        let t = linea_fin_entrada(&c, 3, 1);
        assert!(t.contains("propias-descontadas=3") && t.contains("pausas-de-mano=1"));
    }
}
