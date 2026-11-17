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
#[allow(dead_code)]
/// (ORD1114T) Margen tras abrir o reanudar en el que lo local no pausa (el propio clic de «Reanudar»).
pub const GRACIA_LOCAL_MS: u64 = 1_500;

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
    /// (ORD1114V) El interruptor NATIVO «dejar que me controlen» de este aparato está apagado.
    InterruptorApagado,
    /// (ORD1114T) Una tecla, un toque o un movimiento LOCAL pausó el control (§2.4); lo reanuda la persona
    /// desde el indicador nativo, nunca la página ni quien manda.
    Pausada,
}

impl Rechazo {
    pub fn codigo(self) -> &'static str {
        match self {
            Rechazo::SinIndicador => "sin-indicador-nativo",
            Rechazo::OtraSesion => "otra-sesion",
            Rechazo::SinSesion => "parada-nativa",
            Rechazo::Token => "parada-nativa",
            Rechazo::Forma => "forma",
            Rechazo::Pausada => "pausa-local",
            Rechazo::InterruptorApagado => "interruptor-nativo-apagado",
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
    /// (ORD1114T) En pausa por una acción local desde esta hora (None = no pausada).
    pub pausada_ms: Option<u64>,
    /// (ORD1114T) Última vez que la persona la reanudó (o que se abrió): lo local anterior no pausa.
    pub reanudada_ms: u64,
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

/// FSG1116 · M5: ¿puede esta URL usar los comandos del control? La web publicada (https, ese host exacto) o el
/// servidor local que la app sirve AHORA en `puerto_local`. Nada más (ni otro puerto de 127.0.0.1, ni http del host).
#[cfg_attr(not(target_os = "android"), allow(dead_code))]
pub fn origen_de_control_ok(url: &str, puerto_local: Option<u16>) -> bool {
    let empieza = |o: &str| url == o || [format!("{o}/"), format!("{o}?"), format!("{o}#")].iter().any(|p| url.starts_with(p.as_str()));
    empieza("https://starseed-os.vercel.app") || puerto_local.is_some_and(|p| empieza(&format!("http://127.0.0.1:{p}")))
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
            if s.pausada_ms.is_some() {
                return Err(Rechazo::Pausada); // ORD1114T: renovar no quita la pausa local
            }
        }
        self.sesion = Some(Sesion { token: token.into(), de: de.into(), nombre: nombre_limpio(nombre), nivel: nivel.into(), inicio_ms: ahora, ultima_ms: ahora, pausada_ms: None, reanudada_ms: ahora });
        Ok(self.sesion.as_ref().expect("recién puesta"))
    }

    /// (CTL1117A · S1/S4) Abrir OTRA vez con la sesión viva del MISMO controlador y el indicador ya a la vista: es la
    /// misma sesión (mismo token, mismo indicador), solo se da por activa ahora. Nada de indicador nuevo ni de token
    /// nuevo: así una apertura repetida (la Mac, dos ventanas, un reintento) no tumba lo que ya funciona. No reutiliza
    /// si hay pausa local (quien manda no se la quita reabriendo), si es otro aparato ni si no hay indicador a la vista.
    /// No alarga la hora máxima: `inicio_ms` no cambia.
    pub fn reutilizar(&mut self, de: &str, nivel: &str, ahora: u64, indicador: bool) -> Option<&Sesion> {
        if !indicador || !huella_valida(de) || !nivel_valido(nivel) {
            return None;
        }
        self.caducar(ahora);
        let s = self.sesion.as_mut()?;
        if s.de != de || s.pausada_ms.is_some() {
            return None;
        }
        s.nivel = nivel.into();
        s.ultima_ms = ahora;
        Some(s)
    }

    /// (CTL1117A · S7) Lo que `abrir` va a negar de todos modos por la sesión que YA hay (otro aparato, pausa local),
    /// dicho ANTES de tocar el indicador: negar una apertura nunca debe quitar el indicador de la sesión que sigue viva.
    pub fn negada_por_la_viva(&mut self, de: &str, ahora: u64) -> Option<Rechazo> {
        self.caducar(ahora);
        let s = self.sesion.as_ref()?;
        if s.de != de {
            Some(Rechazo::OtraSesion)
        } else if s.pausada_ms.is_some() {
            Some(Rechazo::Pausada)
        } else {
            None
        }
    }

    /// (ORD1114V) Abrir pasa ANTES por el interruptor nativo de este aparato (contrato §1 caso A punto 1): lo
    /// que diga la página no basta.
    #[allow(clippy::too_many_arguments)]
    pub fn abrir_con_interruptor(&mut self, interruptor: &Interruptor, token: &str, de: &str, nombre: &str, nivel: &str, ahora: u64, indicador: bool) -> Result<&Sesion, Rechazo> {
        if !interruptor.encendido {
            return Err(Rechazo::InterruptorApagado);
        }
        self.abrir(token, de, nombre, nivel, ahora, indicador)
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
        if s.pausada_ms.is_some() {
            return Err(Rechazo::Pausada); // ORD1114T
        }
        s.ultima_ms = ahora;
        Ok(s)
    }

    /// (AND1115K) Solo MIRA: ¿hay sesión y es este el token? No renueva la actividad ni mira la pausa.
    pub fn valida(&self, token: &str) -> Result<&Sesion, Rechazo> {
        let s = self.sesion.as_ref().ok_or(Rechazo::SinSesion)?;
        if !crate::sha256::iguales_ct(s.token.as_bytes(), token.as_bytes()) {
            return Err(Rechazo::Token);
        }
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

    /// (ORD1114T) Lo local pausa al instante. `entrada_ms` = hora de la última entrada local (tecla, ratón,
    /// toque). Solo cuenta si es POSTERIOR a abrir o reanudar más `GRACIA_LOCAL_MS` (el clic de «Reanudar» no
    /// vuelve a pausar). Devuelve true si acaba de pausar.
    #[allow(dead_code)]
    pub fn entrada_local(&mut self, entrada_ms: u64) -> bool {
        let Some(s) = self.sesion.as_mut() else { return false };
        if s.pausada_ms.is_some() || entrada_ms <= s.reanudada_ms.saturating_add(GRACIA_LOCAL_MS) {
            return false;
        }
        s.pausada_ms = Some(entrada_ms);
        true
    }

    /// (ORD1114T) Pausa sin más (Android: Kotlin ya aplicó la gracia al toque local).
    #[allow(dead_code)]
    pub fn pausar(&mut self, ahora: u64) -> bool {
        let Some(s) = self.sesion.as_mut() else { return false };
        if s.pausada_ms.is_some() {
            return false;
        }
        s.pausada_ms = Some(ahora);
        true
    }

    /// (ORD1114T) Solo desde el indicador nativo (menú de la barra, notificación de Android).
    #[allow(dead_code)]
    pub fn reanudar(&mut self, ahora: u64) -> bool {
        let Some(s) = self.sesion.as_mut() else { return false };
        if s.pausada_ms.take().is_none() {
            return false;
        }
        s.reanudada_ms = ahora;
        s.ultima_ms = ahora;
        true
    }

    /// (CTL1117C · FALLO 3) El detalle de un rechazo `parada-nativa`: POR QUÉ no hay sesión, para que quien manda no diga que la
    /// persona pulsó «Terminar» cuando fue la caducidad, el indicador perdido u otra cosa. `motivo=` es el de `parar` (solo
    /// `a-z` y `-`), `hace=` los segundos desde esa parada; sin parada conocida, `sin-sesion`; con sesión pero de otro token,
    /// `otro-token`. Cualquier otro rechazo no lleva detalle.
    pub fn detalle_parada(&self, r: Rechazo, ahora: u64) -> Option<String> {
        match r {
            Rechazo::SinSesion => Some(match &self.ultima_parada {
                Some((t, m)) => {
                    let k = clave_de_motivo(m);
                    format!("motivo={} hace={}", if k.is_empty() { "sin-sesion" } else { &k }, (ahora.saturating_sub(*t) / 1000).min(99_999))
                }
                None => "motivo=sin-sesion".into(),
            }),
            Rechazo::Token => Some("motivo=otro-token".into()),
            _ => None,
        }
    }

    pub fn pausada(&self) -> bool {
        self.sesion.as_ref().is_some_and(|s| s.pausada_ms.is_some())
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

// ─────────────────────────── Interruptor nativo (ORD1114V) ───────────────────────────

/// Archivo del interruptor en la carpeta de configuración de la app (escritorio). Lo escribe SOLO Rust.
pub const ARCHIVO_INTERRUPTOR: &str = "control-neuronas-interruptor.json";
/// Motivos de parada que, además, APAGAN el interruptor (la persona quitó el permiso). Apagar nunca pide nada.
pub const MOTIVOS_QUE_APAGAN: [&str; 4] = ["revocado", "terminado-por-el-dueno", "apagado-por-el-dueno", "la-persona-quito-el-permiso"];

/// «Dejar que mis otras neuronas controlen esta»: apagado de fábrica, por aparato, guardado por el lado nativo.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Interruptor {
    pub encendido: bool,
    pub desde_ms: u64,
}

impl Interruptor {
    /// Sin archivo, roto o con otra forma: apagado.
    pub fn leer(texto: Option<&str>) -> Self {
        let v = texto.and_then(|t| serde_json::from_str::<serde_json::Value>(t).ok());
        let encendido = v.as_ref().and_then(|v| v.get("encendido")).and_then(|x| x.as_bool()).unwrap_or(false);
        let desde_ms = v.as_ref().and_then(|v| v.get("desde_ms")).and_then(|x| x.as_u64()).unwrap_or(0);
        Interruptor { encendido, desde_ms: if encendido { desde_ms } else { 0 } }
    }

    pub fn texto(&self) -> String {
        serde_json::json!({ "v": 1, "encendido": self.encendido, "desde_ms": self.desde_ms }).to_string()
    }

    /// Solo enciende con el «Sí» del diálogo nativo. Devuelve si cambió.
    pub fn encender(&mut self, dialogo_dijo_si: bool, ahora: u64) -> bool {
        if !dialogo_dijo_si || self.encendido {
            return false;
        }
        *self = Interruptor { encendido: true, desde_ms: ahora };
        true
    }

    /// Apagar no pide nada y vale siempre. Devuelve si cambió.
    pub fn apagar(&mut self) -> bool {
        let estaba = self.encendido;
        *self = Interruptor::default();
        estaba
    }
}

pub fn motivo_apaga(motivo: &str) -> bool {
    MOTIVOS_QUE_APAGAN.contains(&motivo)
}

// ─────────────────────────── Registro encadenado ───────────────────────────

/// (CTL1117C) Un motivo de parada como clave corta `a-z` y `-` (lo que viaja en el rechazo y se lee en la ventana).
pub fn clave_de_motivo(m: &str) -> String {
    let mut o = String::new();
    for c in m.chars().take(60) {
        let c = c.to_ascii_lowercase();
        if c.is_ascii_lowercase() {
            o.push(c);
        } else if !o.ends_with('-') && !o.is_empty() {
            o.push('-');
        }
    }
    while o.ends_with('-') {
        o.pop();
    }
    o.chars().take(40).collect()
}

/// (CTL1117C) Lo que Kotlin sabe del indicador y de la actividad, para las líneas `control-sesion` y `control-fondo`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DatosKotlin {
    pub latido_ms: u64,
    pub mostrando: bool,
    pub en_fondo: bool,
    pub medida: String,
    pub reanudos: u32,
    /// (CTL1117F) Pausa local puesta ahora y ms desde el último cuadro que Kotlin publicó (-1 = ninguno): solo en `control-fondo`.
    pub pausada: bool,
    pub cuadro_ms: i64,
}

fn si_no(b: bool) -> &'static str {
    if b { "si" } else { "no" }
}

fn solo_clave(s: &str, max: usize) -> String {
    s.chars().filter(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | ':' | '.' | ',' | '=' | ' ')).take(max).collect()
}

impl DatosKotlin {
    fn texto(&self) -> String {
        let m = clave_de_motivo(&self.medida);
        format!("latido-ms={} mostrando={} kotlin-en-fondo={} medida={} reanudos={}", self.latido_ms.min(9_999_999), si_no(self.mostrando), si_no(self.en_fondo), if m.is_empty() { "ninguna" } else { &m }, self.reanudos)
    }
}

/// (CTL1117F) Lo que Kotlin dice de la pausa local, para las líneas `control-pausa`.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct DatosPausa {
    pub pausada: bool,
    pub pausas: u32,
    pub motivo: String,
    pub desde_gesto_ms: i64,
    pub reanuda: String,
    pub pausa_ms: u64,
    pub ignorados: u32,
}

/// (CTL1117F) La línea al ENTRAR en pausa: por qué (`toque-fuera`, `gesto-cancelado`…), ms desde el último gesto propio y toques propios ignorados.
#[allow(dead_code)] // solo Android la usa
pub fn linea_pausa_entra(d: &DatosPausa) -> String {
    let m = clave_de_motivo(&d.motivo);
    format!("entra motivo={} desde-gesto-ms={} ignorados={} pausas={}", if m.is_empty() { "desconocido".to_string() } else { m }, d.desde_gesto_ms.clamp(-1, 9_999_999), d.ignorados, d.pausas)
}

/// (CTL1117F) La línea al SALIR: `reanudada-sola`, `reanudada-vigia` o `reanudada-por-la-persona`, y cuánto duró.
#[allow(dead_code)] // solo Android la usa
pub fn linea_pausa_sale(d: &DatosPausa) -> String {
    let m = clave_de_motivo(&d.reanuda);
    format!("sale motivo={} dur-ms={} pausas={}", if m.is_empty() { "desconocido".to_string() } else { m }, d.pausa_ms.min(9_999_999), d.pausas)
}

/// (CTL1117F) Lo que Rust anota en un sondeo: una entrada/salida por cada cambio visto y, si Kotlin pausó MÁS veces que los cambios
/// vistos (pausas más cortas que el sondeo), una línea `breves` con cuántas y la última causa. `vistas` = el contador del sondeo anterior.
#[allow(dead_code)] // solo Android la usa
pub fn lineas_pausa(vistas: u32, entra: bool, sale: bool, d: &DatosPausa) -> Vec<String> {
    let mut v = Vec::new();
    let nuevas = d.pausas.saturating_sub(vistas);
    let propias = u32::from(entra);
    if nuevas > propias {
        v.push(format!("breves n={} ultima={} ignorados={}", nuevas - propias, { let m = clave_de_motivo(&d.motivo); if m.is_empty() { "desconocido".to_string() } else { m } }, d.ignorados));
    }
    if entra {
        v.push(linea_pausa_entra(d));
    }
    if sale {
        v.push(linea_pausa_sale(d));
    }
    v
}

/// (CTL1117G) `repuesto motivo=descartado|ausente n=… [error=…] notificaciones=si|no`: el aviso fijo se volvió a poner; el control sigue.
#[allow(dead_code)] // solo Android la usa
pub fn linea_aviso(motivo: &str, n: u32, error: &str, notificaciones: bool) -> String {
    let m = clave_de_motivo(motivo);
    let e = solo_clave(error.trim(), 60);
    let base = format!("repuesto motivo={} n={}", if m.is_empty() { "desconocido".to_string() } else { m }, n);
    let con_error = if e.is_empty() { base } else { format!("{base} error={}", e.replace(' ', "-")) };
    format!("{con_error} notificaciones={}", si_no(notificaciones))
}

/// (CTL1117G) El vigía de Rust tiene un tic por segundo: si entre dos pasaron más de 5 s, el PROCESO estuvo parado (congelado por el
/// sistema o dormido). Con el reloj de pared y el monótono: si solo crece el de pared, el aparato durmió; si crecen los dos, no.
#[allow(dead_code)] // solo Android la usa
pub fn linea_hueco(hueco_pared_ms: u64, hueco_mono_ms: u64) -> Option<String> {
    if hueco_pared_ms < 5_000 {
        return None;
    }
    Some(format!("hueco hueco-pared-ms={} hueco-mono-ms={}", hueco_pared_ms.min(99_999_999), hueco_mono_ms.min(99_999_999)))
}

/// `fin de=… motivo=… latido-ms=… mostrando=… kotlin-en-fondo=… medida=… reanudos=…` (sin Kotlin, solo `de` y `motivo`).
pub fn linea_fin_sesion(de8: &str, motivo: &str, k: Option<&DatosKotlin>) -> String {
    let de: String = de8.chars().filter(|c| c.is_ascii_hexdigit()).take(8).collect();
    let base = format!("fin de={} motivo={}", if de.is_empty() { "-" } else { &de }, { let m = clave_de_motivo(motivo); if m.is_empty() { "otro".to_string() } else { m } });
    match k {
        Some(k) => format!("{base} {}", k.texto()),
        None => base,
    }
}

/// `control-fondo`: lo que dijo la página (acotado a `clave=valor` sin caracteres raros) y lo nativo (CTL1117F: más `pausa=si|no cuadro-ms=`).
pub fn linea_fondo(pagina: &str, k: Option<&DatosKotlin>) -> String {
    let p = solo_clave(pagina.trim(), 170);
    match k {
        Some(k) => format!("{p} {} pausa={} cuadro-ms={}", k.texto(), si_no(k.pausada), k.cuadro_ms.clamp(-1, 9_999_999)),
        None => p,
    }
}

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
    fn ctl1117c_la_parada_nativa_dice_su_motivo_real() {
        let mut c = Control::default();
        assert_eq!(c.detalle_parada(Rechazo::SinSesion, 5_000).as_deref(), Some("motivo=sin-sesion"), "nunca hubo parada");
        c.abrir(TOK, DE, "Mac", "controlar", 1_000, true).unwrap();
        assert_eq!(c.detalle_parada(Rechazo::Token, 2_000).as_deref(), Some("motivo=otro-token"));
        assert_eq!(c.detalle_parada(Rechazo::Pausada, 2_000), None, "otros rechazos no llevan detalle");
        assert_eq!(c.detalle_parada(Rechazo::SinIndicador, 2_000), None);
        for (motivo, esperado) in [
            ("caducada", "caducada"),
            ("sin-indicador", "sin-indicador"),
            ("la-persona-desde-el-indicador", "la-persona-desde-el-indicador"),
            ("la persona, desde el indicador", "la-persona-desde-el-indicador"),
            ("¡¡!!", "sin-sesion"),
        ] {
            let mut c = Control::default();
            c.abrir(TOK, DE, "Mac", "controlar", 1_000, true).unwrap();
            c.parar(3_000, motivo);
            assert_eq!(c.orden(TOK, "leer-aparato", 4_000, true).unwrap_err(), Rechazo::SinSesion);
            assert_eq!(c.detalle_parada(Rechazo::SinSesion, 12_500).unwrap(), format!("motivo={esperado} hace=9"), "{motivo}");
        }
        // Lo que viaja cabe en el formato de la página (`clave=valor`, valores `[a-z0-9:_.,-]`).
        let d = c.detalle_parada(Rechazo::SinSesion, 0).unwrap();
        assert!(d.split(' ').all(|p| p.split_once('=').is_some_and(|(k, v)| k.chars().all(|c| c.is_ascii_lowercase()) && v.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'))));
    }

    #[test]
    fn ctl1117c_las_lineas_de_fin_y_de_fondo_son_acotadas_y_sin_contenido() {
        let k = DatosKotlin { latido_ms: 7_400, mostrando: true, en_fondo: true, medida: "webview-activo".into(), reanudos: 12, pausada: false, cuadro_ms: 340 };
        assert_eq!(
            linea_fin_sesion("0011AABB<x>", "Sin-Indicador", Some(&k)),
            "fin de=0011AABB motivo=sin-indicador latido-ms=7400 mostrando=si kotlin-en-fondo=si medida=webview-activo reanudos=12"
        );
        assert_eq!(linea_fin_sesion("", "!!", None), "fin de=- motivo=otro");
        let l = linea_fondo("inicio-fondo estado=oculta <script>alert(1)</script> deriva-ms=840\nx", Some(&k));
        assert!(l.starts_with("inicio-fondo estado=oculta") && !l.contains('<') && !l.contains('\n') && l.contains("medida=webview-activo"), "{l}");
        assert!(linea_fondo(&"a".repeat(900), None).len() <= 170);
        let sin = DatosKotlin { medida: String::new(), ..k };
        assert!(linea_fondo("x", Some(&sin)).contains("medida=ninguna"));
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

    // ─────────── ORD1114T ───────────

    #[test]
    fn lo_local_pausa_al_instante_y_solo_el_indicador_reanuda() {
        let mut c = Control::default();
        c.abrir(TOK, DE, "Mac", "controlar", 10_000, true).unwrap();
        assert!(!c.entrada_local(10_500), "lo de antes de abrir (y el gesto de abrir) no pausa");
        assert!(c.entrada_local(20_000));
        assert_eq!(c.orden(TOK, "colgar", 20_001, true).unwrap_err(), Rechazo::Pausada);
        assert!(c.activa().is_some(), "pausa no es parada");
        assert!(c.reanudar(30_000));
        assert!(!c.entrada_local(30_400), "el clic de «Reanudar» no vuelve a pausar");
        assert!(c.orden(TOK, "colgar", 30_500, true).is_ok());
        assert!(c.entrada_local(40_000));
        assert_eq!(c.abrir(TOK, DE, "Mac", "controlar", 40_001, true).unwrap_err(), Rechazo::Pausada, "quien manda no se quita la pausa reabriendo");
        // En pausa también caduca por inactividad: pausar no alarga la sesión.
        assert_eq!(c.orden(TOK, "colgar", 30_500 + SESION_INACTIVA_MS + 1, true).unwrap_err(), Rechazo::SinSesion);
        assert_eq!(Rechazo::Pausada.codigo(), "pausa-local");
    }

    // ─────────── CTL1117A ───────────

    #[test]
    fn abrir_otra_vez_con_la_sesion_viva_es_la_misma_sesion() {
        let mut c = Control::default();
        c.abrir(TOK, DE, "Mac", "controlar", 1_000, true).unwrap();
        // Sin indicador a la vista no se reutiliza (la apertura normal decide).
        assert!(c.reutilizar(DE, "controlar", 2_000, false).is_none());
        let s = c.reutilizar(DE, "controlar", 5_000, true).expect("misma sesión");
        assert_eq!((s.token.as_str(), s.inicio_ms, s.ultima_ms), (TOK, 1_000, 5_000), "mismo token, misma hora de inicio");
        // Otro aparato, forma rara, pausa local: no.
        let otro = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
        assert!(c.reutilizar(otro, "controlar", 5_100, true).is_none());
        assert!(c.reutilizar("zz", "controlar", 5_100, true).is_none());
        assert!(c.reutilizar(DE, "administrar", 5_100, true).is_none());
        assert!(c.pausar(6_000));
        assert!(c.reutilizar(DE, "controlar", 6_100, true).is_none(), "reabrir no quita la pausa local");
        assert_eq!(c.negada_por_la_viva(DE, 6_200), Some(Rechazo::Pausada));
        assert_eq!(c.negada_por_la_viva(otro, 6_200), Some(Rechazo::OtraSesion));
        assert!(c.reanudar(7_000));
        assert!(c.reutilizar(DE, "ver", 7_100, true).is_some());
        assert_eq!(c.activa().unwrap().nivel, "ver");
        // Caducada (2 min sin órdenes) o terminada por la persona: NO resucita.
        assert!(c.reutilizar(DE, "controlar", 7_100 + SESION_INACTIVA_MS + 1, true).is_none());
        assert!(c.activa().is_none());
        assert_eq!(c.negada_por_la_viva(DE, 9_000_000), None, "sin sesión no hay nada que negar");
        c.abrir(TOK, DE, "Mac", "controlar", 0, true).unwrap();
        c.parar(10, "la-persona-desde-el-indicador");
        assert!(c.reutilizar(DE, "controlar", 11, true).is_none(), "una sesión que la persona terminó no se renueva");
        // La hora máxima no se alarga reabriendo.
        c.abrir(TOK, DE, "Mac", "controlar", 0, true).unwrap();
        let mut t = 0;
        while t < SESION_MAX_MS - 60_000 {
            t += 60_000;
            assert!(c.reutilizar(DE, "controlar", t, true).is_some());
        }
        assert!(c.reutilizar(DE, "controlar", SESION_MAX_MS + 1, true).is_none());
    }

    // ─────────── ORD1114V ───────────

    #[test]
    fn interruptor_nativo_apagado_niega_aunque_la_pagina_tenga_el_permiso_encendido() {
        // La «página» dice que el permiso está encendido y el controlador aceptado: no cuenta.
        struct Pagina {
            permiso_encendido: bool,
        }
        let pagina = Pagina { permiso_encendido: true };
        assert!(pagina.permiso_encendido);
        let mut c = Control::default();
        let apagado = Interruptor::leer(None);
        let e = c.abrir_con_interruptor(&apagado, TOK, DE, "Mac", "controlar", 0, true).unwrap_err();
        assert_eq!(e, Rechazo::InterruptorApagado);
        assert_eq!(e.codigo(), "interruptor-nativo-apagado");
        assert!(c.activa().is_none());
        let mut i = apagado;
        assert!(i.encender(true, 5));
        assert!(c.abrir_con_interruptor(&i, TOK, DE, "Mac", "controlar", 6, true).is_ok());
    }

    #[test]
    fn el_interruptor_no_se_enciende_sin_el_si_del_dialogo_y_apagar_no_pide_nada() {
        let mut i = Interruptor::default();
        assert!(!i.encender(false, 1), "sin «Sí» no se enciende");
        assert!(!i.encendido);
        // Un archivo raro o escrito a medias se lee apagado; solo `encender(true)` lo enciende.
        assert!(!Interruptor::leer(Some("{roto")).encendido);
        assert!(!Interruptor::leer(Some("{\"encendido\":\"si\"}")).encendido);
        assert!(i.encender(true, 7));
        assert_eq!(Interruptor::leer(Some(&i.texto())), i, "persiste");
        assert!(i.apagar(), "apagar sin diálogo");
        assert!(!Interruptor::leer(Some(&i.texto())).encendido);
        for m in ["revocado", "terminado-por-el-dueno", "apagado-por-el-dueno", "la-persona-quito-el-permiso"] {
            assert!(motivo_apaga(m), "{m}");
        }
        assert!(!motivo_apaga("cerrar-sesion") && !motivo_apaga("a-mano") && !motivo_apaga("pagina"));
    }

    #[test]
    fn m5_solo_la_web_publicada_o_el_puerto_que_sirve_la_app() {
        assert!(origen_de_control_ok("https://starseed-os.vercel.app/genesis?x=1", None));
        assert!(origen_de_control_ok("https://starseed-os.vercel.app", None));
        assert!(!origen_de_control_ok("https://starseed-os.vercel.app.evil.com/", None));
        assert!(!origen_de_control_ok("http://starseed-os.vercel.app/", None));
        assert!(!origen_de_control_ok("http://127.0.0.1:47613/", None), "un puerto de la lista que la app no sirve");
        assert!(!origen_de_control_ok("http://127.0.0.1:47613/", Some(47610)));
        assert!(origen_de_control_ok("http://127.0.0.1:47610/escritorios", Some(47610)));
        assert!(!origen_de_control_ok("http://127.0.0.1:476100/", Some(47610)));
    }

    #[test]
    fn ctl1117f_con_la_ventana_leyendo_la_sesion_vive_hasta_el_tope_de_una_hora() {
        // La ventana lee cada 5 s con órdenes firmadas (`leer-aparato`): cada una que pasa renueva la inactividad, pero NO la hora máxima.
        let mut c = Control::default();
        c.abrir(TOK, DE, "Mac", "controlar", 0, true).unwrap();
        let mut t = 0;
        while t + 5_000 <= SESION_MAX_MS {
            t += 5_000;
            assert!(c.orden(TOK, "leer-aparato", t, true).is_ok(), "t={t}");
        }
        assert!(c.activa().is_some(), "una hora de lecturas cada 5 s y sigue viva");
        // Pasado el tope duro, ni leyendo.
        assert_eq!(c.orden(TOK, "leer-aparato", SESION_MAX_MS + 5_000, true).unwrap_err(), Rechazo::SinSesion);
    }

    #[test]
    fn ctl1117f_sin_nadie_leyendo_caduca_por_inactividad_y_en_pausa_las_lecturas_no_renuevan() {
        let mut c = Control::default();
        c.abrir(TOK, DE, "Mac", "controlar", 0, true).unwrap();
        assert!(c.orden(TOK, "leer-aparato", 5_000, true).is_ok());
        // Sin lecturas: a los 2 min de la última, caducada.
        assert_eq!(c.orden(TOK, "leer-aparato", 5_000 + SESION_INACTIVA_MS + 1, true).unwrap_err(), Rechazo::SinSesion);
        // En pausa local las lecturas se rechazan y no renuevan (pausar no alarga la sesión): por eso una pausa pegada la mata a los 2 min.
        let mut c = Control::default();
        c.abrir(TOK, DE, "Mac", "controlar", 0, true).unwrap();
        assert!(c.pausar(10_000));
        for t in (15_000..=SESION_INACTIVA_MS).step_by(5_000) {
            assert_eq!(c.orden(TOK, "leer-aparato", t, true).unwrap_err(), Rechazo::Pausada, "t={t}");
        }
        assert_eq!(c.orden(TOK, "leer-aparato", SESION_INACTIVA_MS + 1, true).unwrap_err(), Rechazo::SinSesion);
    }

    #[test]
    fn ctl1117g_lineas_de_aviso_y_de_hueco() {
        assert_eq!(linea_aviso("descartado", 2, "", true), "repuesto motivo=descartado n=2 notificaciones=si");
        assert_eq!(linea_aviso("Ausente", 1, "primer-plano:SecurityException,notify:X", false), "repuesto motivo=ausente n=1 error=primer-plano:SecurityException,notify:X notificaciones=no");
        assert!(!linea_aviso("<x>", 1, "a b\nc", true).contains('<'));
        assert_eq!(linea_hueco(4_999, 0), None);
        assert_eq!(linea_hueco(1_559_834, 3_000).unwrap(), "hueco hueco-pared-ms=1559834 hueco-mono-ms=3000");
    }

    #[test]
    fn ctl1117f_las_lineas_de_pausa_dicen_motivo_y_tiempo_y_cuentan_las_breves() {
        let d = DatosPausa { pausada: true, pausas: 3, motivo: "Gesto-Cancelado".into(), desde_gesto_ms: 120, reanuda: "reanudada-sola".into(), pausa_ms: 3_050, ignorados: 2 };
        assert_eq!(linea_pausa_entra(&d), "entra motivo=gesto-cancelado desde-gesto-ms=120 ignorados=2 pausas=3");
        assert_eq!(linea_pausa_sale(&d), "sale motivo=reanudada-sola dur-ms=3050 pausas=3");
        assert_eq!(lineas_pausa(2, true, false, &d), vec![linea_pausa_entra(&d)]);
        assert_eq!(lineas_pausa(3, false, false, &d), Vec::<String>::new());
        // Kotlin pausó 3 veces desde el sondeo anterior y Rust solo vio una entrada: dos fueron más breves que el sondeo.
        let l = lineas_pausa(0, true, false, &d);
        assert!(l[0].starts_with("breves n=2 ultima=gesto-cancelado"), "{l:?}");
        assert_eq!(linea_pausa_entra(&DatosPausa::default()), "entra motivo=desconocido desde-gesto-ms=0 ignorados=0 pausas=0");
        let sin_gesto = DatosPausa { desde_gesto_ms: -1, ..d.clone() };
        assert!(linea_pausa_entra(&sin_gesto).contains("desde-gesto-ms=-1"));
        // `control-fondo` suma `pausa=` y `cuadro-ms=`.
        let k = DatosKotlin { latido_ms: 10, mostrando: true, en_fondo: true, medida: "webview-activo".into(), reanudos: 4, pausada: true, cuadro_ms: -1 };
        assert!(linea_fondo("sigue-en-fondo", Some(&k)).ends_with("pausa=si cuadro-ms=-1"));
        assert!(!linea_fin_sesion("0011AABB", "caducada", Some(&k)).contains("cuadro-ms"));
    }
}
