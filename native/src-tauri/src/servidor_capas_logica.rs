// ═══════════════════════════════════════════════════════════════════════════
// servidor_capas_logica — núcleo PURO de las capas del servidor local (CAP1107A · T1, 2026-11-07).
// ---------------------------------------------------------------------------
// Contrato: architecture/apps-autonomas-sin-internet.md §10.
//
// Petición de Alex (10-10): «actualizaciones por capas: según el cambio se reinician los servidores
// dentro de la app sin reinstalarla». Desde la v0.5.0 la app de escritorio sirve las páginas de SU
// instalador (servidor_local.rs); con esto, lo nuevo de la web llega como una CAPA del servidor
// (standalone + static + public + envoltorio, ≈ 50 MB en .tar.gz) sin bajar otra vez la app entera:
//
//   · El CI publica la capa, su manifiesto FIRMADO con la misma clave minisign del updater de Tauri
//     (lista de archivos con su SHA-256 + el SHA-256 del .tar.gz) y un puntero `latest-servidor.json`.
//   · La app mira el canal (al arrancar y cada 6 h, con internet), descarga, verifica firma y SHA y la
//     deja en `<app_data>/servidor-capas/<build>/` como PENDIENTE; en el siguiente arranque (o con
//     «Actualizar ahora», que reinicia solo el Node) la prueba. Si da «listo» pasa a ACTIVA y la de
//     antes queda como ANTERIOR (para volver atrás); si no lo da en 60 s, o se cae en sus primeros
//     30 s, se marca MALA y se vuelve a la anterior. La del instalador nunca se toca.
//
// Este archivo no toca ni Tauri, ni la red, ni el disco (salvo leer de un `Read` y escribir en un
// `Write` que le dan): versiones y compatibilidad, qué capa usar, transiciones del estado, qué
// borrar, la validación del manifiesto firmado y un lector ESTRICTO de tar (solo archivos y
// carpetas, rutas seguras). Solo `std`: se prueba sin Tauri con
//     rustc --edition 2021 --test src/servidor_capas_logica.rs -o /tmp/sc && /tmp/sc
// El pegamento (curl, minisign, gzip, disco, hilos) vive en `servidor_capas.rs`.
// ═══════════════════════════════════════════════════════════════════════════

use std::collections::HashSet;
use std::io::{self, Read, Write};

/// Carpeta de las capas dentro de los datos de la app (`<app_data>/servidor-capas`).
pub const DIR_CAPAS: &str = "servidor-capas";
/// Estado de las capas (activa, anterior, pendiente, malas) dentro de `DIR_CAPAS`.
pub const ESTADO: &str = "estado.json";
/// Descargas a medias (reanudables) dentro de `DIR_CAPAS`.
pub const DIR_DESCARGAS: &str = "descargas";
/// Copia del manifiesto firmado (y su firma) dentro de cada capa instalada.
pub const MANIFIESTO_EN_CAPA: &str = "starseed-capa.json";
pub const FIRMA_EN_CAPA: &str = "starseed-capa.json.sig";
/// Sufijo de la carpeta mientras se extrae (nunca se usa: se renombra al acabar).
pub const SUFIJO_EXTRAYENDO: &str = ".extrayendo";

/// Canal FIJO de las capas: un Release `servidor-local` (prerelease, nunca «latest», así no toca el
/// `latest.json` del updater) donde el CI deja `latest-servidor.json` y los archivos de cada capa.
pub const CANAL: &str = "https://github.com/StarSeedSystem/starseed-system/releases/download/servidor-local/latest-servidor.json";

/// Versión del formato del puntero y del manifiesto.
pub const FORMATO: u32 = 1;
/// Protocolos del envoltorio (`starseed-arranque.cjs` · `PROTOCOLO`) que esta app sabe lanzar:
/// entorno STARSEED_*, pase por la entrada estándar, salud con firma. Si un envoltorio futuro cambia
/// eso, sube su número y solo lo aceptan las apps que lo conozcan.
pub const PROTOCOLOS_ADMITIDOS: &[u32] = &[1];

/// Tope para que una capa NUEVA conteste «listo» (el mismo que el arranque del instalador).
pub const ESPERA_SALUD_MS: u64 = 60_000;
/// Una capa recién promovida que se cae antes de esto también es mala (y se vuelve atrás).
pub const ESTABLE_MS: u64 = 30_000;
/// Arranques de una pendiente que no llegan a ninguna conclusión (la app se cerró a medias) antes
/// de darla por mala.
pub const MAX_INTENTOS: u32 = 3;
/// Primera mirada al canal tras el primer «listo» del arranque (no compite con el arranque).
pub const PRIMERA_MIRADA_MS: u64 = 90_000;
/// Después, cada 6 h; tras un error de red o de descarga, a los 30 min.
pub const CADA_MS: u64 = 6 * 60 * 60 * 1000;
pub const REINTENTO_MS: u64 = 30 * 60 * 1000;

/// Topes (bytes) de lo que se baja: puntero, manifiesto, .tar.gz y lo que ocupa extraída.
pub const TOPE_CANAL: u64 = 64 * 1024;
pub const TOPE_MANIFIESTO: u64 = 16 * 1024 * 1024;
pub const TOPE_ARCHIVO: u64 = 1024 * 1024 * 1024;
pub const TOPE_EXPANDIDO: u64 = 4 * 1024 * 1024 * 1024;
pub const TOPE_ARCHIVOS: usize = 100_000;
/// Disco libre que debe quedar DESPUÉS de bajar y extraer una capa.
pub const MARGEN_DISCO: u64 = 512 * 1024 * 1024;
/// Avisos de capas malas que se recuerdan (las más viejas se olvidan).
pub const MAX_MALAS: usize = 20;

/// Lo que toda capa debe traer para poder lanzarse (como el paquete del instalador).
pub const REQUERIDOS: [&str; 6] =
    ["server.js", ".next/BUILD_ID", "starseed-arranque.cjs", "guarda.cjs", "migracion-origen.js", "starseed-servidor.json"];

// ───────────────────────────── Nombres ─────────────────────────────

/// El BUILD_ID de Next (p. ej. `AA0YdaG0s8hV9CgdmX1rc`): será nombre de carpeta y de archivo.
pub fn build_id_seguro(b: &str) -> bool {
    !b.is_empty() && b.len() <= 64 && b.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
}

pub fn nombre_archivo(build: &str) -> String {
    format!("servidor-capa-{build}.tar.gz")
}

pub fn nombre_manifiesto(build: &str) -> String {
    format!("servidor-capa-{build}.json")
}

pub fn es_sha256_hex(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
}

/// Ruta relativa segura dentro de la capa (con «/»), o por qué no. Sin absolutas, sin `..` ni `.`,
/// sin `\`, sin `:` (unidades y flujos de Windows), sin controles y sin componentes que Windows
/// recortaría (punto o espacio al final). Una «/» final (carpeta) se quita.
pub fn ruta_segura(r: &str) -> Result<String, String> {
    let r = r.strip_suffix('/').unwrap_or(r);
    if r.is_empty() || r.len() > 1024 {
        return Err("ruta vacía o demasiado larga".into());
    }
    if r.starts_with('/') {
        return Err(format!("ruta absoluta: «{r}»"));
    }
    if r.chars().any(|c| c == '\\' || c == ':' || (c as u32) < 0x20 || c == '\u{7f}') {
        return Err(format!("carácter no admitido en «{r}»"));
    }
    for parte in r.split('/') {
        if parte.is_empty() || parte == "." || parte == ".." {
            return Err(format!("componente no admitido en «{r}»"));
        }
        if parte.len() > 255 || parte.ends_with('.') || parte.ends_with(' ') {
            return Err(format!("componente no admitido en «{r}»"));
        }
    }
    Ok(r.to_string())
}

// ───────────────────────────── Versiones ─────────────────────────────

/// `0.5.0`, `v0.5.0`, `0.5` o `0.5.0-beta.1` → (0, 5, 0). None si no es una versión.
pub fn version(v: &str) -> Option<(u64, u64, u64)> {
    let v = v.trim().trim_start_matches('v');
    let num = v.split(['-', '+']).next()?;
    let mut partes = num.split('.');
    let a = partes.next()?.parse().ok()?;
    let b = partes.next().map(|x| x.parse().ok()).unwrap_or(Some(0))?;
    let c = partes.next().map(|x| x.parse().ok()).unwrap_or(Some(0))?;
    if partes.next().is_some() {
        return None;
    }
    Some((a, b, c))
}

/// ¿La app `actual` es igual o más nueva que `minima`? Ante la duda (algo ilegible), no.
pub fn version_cumple(actual: &str, minima: &str) -> bool {
    matches!((version(actual), version(minima)), (Some(a), Some(m)) if a >= m)
}

/// `22.23.4`, `v22.23.4` o `22.23.4 (local, …)` → 22.
pub fn mayor_de(v: &str) -> Option<u32> {
    v.trim().trim_start_matches('v').split(|c: char| !c.is_ascii_digit()).next()?.parse().ok()
}

// ───────────────────────────── Datos ─────────────────────────────

/// `latest-servidor.json`: el puntero del canal. NO va firmado: solo dice dónde está el manifiesto
/// (que sí) y su firma; todo lo que importa se vuelve a comprobar contra el manifiesto firmado.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Canal {
    pub formato: u32,
    pub build_id: String,
    pub version: Option<String>,
    pub commit: Option<String>,
    pub creado_ms: u64,
    pub app_minima: String,
    pub protocolo: u32,
    /// URL del manifiesto (`servidor-capa-<build>.json`).
    pub manifiesto: String,
    /// Contenido del `.sig` del manifiesto (base64 de la firma minisign, como en `latest.json`).
    pub firma: String,
    /// URL del `.tar.gz`.
    pub archivo: String,
    pub bytes: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ArchivoCapa {
    pub ruta: String,
    pub bytes: u64,
    pub sha256: String,
}

/// `servidor-capa-<build>.json`, firmado.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Manifiesto {
    pub formato: u32,
    pub build_id: String,
    pub version: Option<String>,
    pub commit: Option<String>,
    pub creado_ms: u64,
    pub app_minima: String,
    pub protocolo: u32,
    /// Versión mayor del Node con la que se compiló (0 = no lo dice).
    pub node_mayor: u32,
    pub archivo_nombre: String,
    pub archivo_bytes: u64,
    pub archivo_sha256: String,
    pub total_archivos: usize,
    pub total_bytes: u64,
    pub archivos: Vec<ArchivoCapa>,
}

/// Lo que se sabe de ESTA app: su versión, su Node y el paquete de su instalador.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Contexto {
    pub version_app: String,
    pub node_mayor: Option<u32>,
    pub instalador_build: Option<String>,
    /// `creadoMs` del `starseed-servidor.json` del instalador (0 si no lo dice: entonces cualquier
    /// capa compatible se considera más nueva).
    pub instalador_creado_ms: u64,
}

/// Resumen de una capa instalada (de su manifiesto firmado).
#[derive(Debug, Clone, PartialEq, Default)]
pub struct ResumenCapa {
    pub build_id: String,
    pub version: Option<String>,
    pub commit: Option<String>,
    pub creado_ms: u64,
    pub app_minima: String,
    pub protocolo: u32,
    pub node_mayor: u32,
}

impl From<&Manifiesto> for ResumenCapa {
    fn from(m: &Manifiesto) -> Self {
        ResumenCapa {
            build_id: m.build_id.clone(),
            version: m.version.clone(),
            commit: m.commit.clone(),
            creado_ms: m.creado_ms,
            app_minima: m.app_minima.clone(),
            protocolo: m.protocolo,
            node_mayor: m.node_mayor,
        }
    }
}

/// ¿Esta app puede lanzar una capa así?
pub fn compatible(app_minima: &str, protocolo: u32, node_mayor: u32, ctx: &Contexto) -> Result<(), String> {
    if !PROTOCOLOS_ADMITIDOS.contains(&protocolo) {
        return Err(format!(
            "pide el protocolo {protocolo} del envoltorio y esta app habla {:?}: llegará con una versión nueva de la app",
            PROTOCOLOS_ADMITIDOS
        ));
    }
    if !version_cumple(&ctx.version_app, app_minima) {
        return Err(format!("pide la app {app_minima} o más nueva (esta es la {})", ctx.version_app));
    }
    if let Some(n) = ctx.node_mayor {
        if node_mayor != 0 && node_mayor != n {
            return Err(format!("se compiló para Node {node_mayor} y esta app trae Node {n}"));
        }
    }
    Ok(())
}

/// ¿Es más nueva que el paquete del instalador? (tras actualizar la app, su instalador puede ser más
/// nuevo que la última capa: entonces manda el instalador).
pub fn mas_nueva_que_instalador(build: &str, creado_ms: u64, ctx: &Contexto) -> bool {
    ctx.instalador_build.as_deref() != Some(build) && creado_ms > ctx.instalador_creado_ms
}

// ───────────────────────────── Estado ─────────────────────────────

#[derive(Debug, Clone, PartialEq, Default)]
pub struct EstadoCapas {
    /// La que sirve (pasó la salud).
    pub activa: Option<String>,
    /// La de antes de la activa: para volver atrás si la activa falla.
    pub anterior: Option<String>,
    /// Descargada y verificada, aún sin probar.
    pub pendiente: Option<String>,
    /// Arranques de la pendiente sin conclusión.
    pub intentos: u32,
    /// Capas que no pasaron la salud: nunca más.
    pub malas: Vec<String>,
    /// Lo último que pasó y que la persona debería saber (una vuelta atrás).
    pub aviso: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Eleccion {
    /// El paquete que trae la app (siempre está; nunca se borra).
    Instalador,
    /// Una capa de `<app_data>/servidor-capas/<build>`. `a_prueba`: aún no ha pasado la salud.
    Capa { build: String, a_prueba: bool },
}

impl Eleccion {
    pub fn build(&self) -> Option<&str> {
        match self {
            Eleccion::Instalador => None,
            Eleccion::Capa { build, .. } => Some(build),
        }
    }
    pub fn a_prueba(&self) -> bool {
        matches!(self, Eleccion::Capa { a_prueba: true, .. })
    }
}

/// Qué servir en este arranque. `info(build)` da el resumen de una capa instalada y entera (None si
/// falta, está a medias o su manifiesto no verifica).
pub fn elegir(e: &EstadoCapas, info: impl Fn(&str) -> Option<ResumenCapa>, ctx: &Contexto) -> Eleccion {
    let valida = |b: &str| {
        !e.malas.iter().any(|m| m == b)
            && info(b).is_some_and(|r| {
                r.build_id == b
                    && compatible(&r.app_minima, r.protocolo, r.node_mayor, ctx).is_ok()
                    && mas_nueva_que_instalador(b, r.creado_ms, ctx)
            })
    };
    if let Some(p) = e.pendiente.as_deref() {
        if e.intentos < MAX_INTENTOS && valida(p) {
            return Eleccion::Capa { build: p.to_string(), a_prueba: true };
        }
    }
    for b in [e.activa.as_deref(), e.anterior.as_deref()].into_iter().flatten() {
        if valida(b) {
            return Eleccion::Capa { build: b.to_string(), a_prueba: false };
        }
    }
    Eleccion::Instalador
}

/// Antes de lanzar: una pendiente suma un intento (si la app se cierra a medias, cuenta).
pub fn al_intentar(e: &EstadoCapas, el: &Eleccion) -> EstadoCapas {
    let mut n = e.clone();
    if let Eleccion::Capa { build, a_prueba: true } = el {
        if n.pendiente.as_deref() == Some(build) {
            n.intentos = n.intentos.saturating_add(1);
        }
    }
    n
}

/// La capa contestó «listo»: si estaba a prueba, pasa a activa y la activa de antes a anterior.
pub fn tras_lista(e: &EstadoCapas, el: &Eleccion) -> EstadoCapas {
    let mut n = e.clone();
    if let Eleccion::Capa { build, a_prueba: true } = el {
        if n.activa.as_deref() != Some(build) {
            if let Some(a) = n.activa.take() {
                n.anterior = Some(a);
            }
            n.activa = Some(build.clone());
        }
        if n.anterior.as_deref() == Some(build) {
            n.anterior = None;
        }
        if n.pendiente.as_deref() == Some(build) {
            n.pendiente = None;
        }
        n.intentos = 0;
        n.aviso = None;
    }
    n
}

/// La capa no pasó la salud (o se cayó recién promovida): mala para siempre y se vuelve atrás.
pub fn tras_fallo(e: &EstadoCapas, el: &Eleccion, motivo: &str) -> EstadoCapas {
    let mut n = e.clone();
    let Eleccion::Capa { build, .. } = el else { return n };
    if !n.malas.iter().any(|m| m == build) {
        n.malas.push(build.clone());
    }
    while n.malas.len() > MAX_MALAS {
        n.malas.remove(0);
    }
    if n.pendiente.as_deref() == Some(build) {
        n.pendiente = None;
        n.intentos = 0;
    }
    if n.activa.as_deref() == Some(build) {
        n.activa = n.anterior.take();
    }
    if n.anterior.as_deref() == Some(build) {
        n.anterior = None;
    }
    let destino = match n.activa.as_deref() {
        Some(a) => format!("la capa {}", corto(a)),
        None => "el paquete del instalador".to_string(),
    };
    n.aviso = Some(format!("La capa {} no pasó la salud ({motivo}): se volvió a {destino}.", corto(build)));
    n
}

/// Se descargó y verificó una capa: queda pendiente para el siguiente arranque (o «Actualizar ahora»).
pub fn al_verificar(e: &EstadoCapas, build: &str) -> EstadoCapas {
    let mut n = e.clone();
    n.pendiente = Some(build.to_string());
    n.intentos = 0;
    n
}

/// Carpetas de capas que sobran (ni activa, ni anterior, ni pendiente, ni la que sirve ahora).
pub fn sobrantes(e: &EstadoCapas, presentes: &[String], en_uso: Option<&str>) -> Vec<String> {
    let guardar: HashSet<&str> =
        [e.activa.as_deref(), e.anterior.as_deref(), e.pendiente.as_deref(), en_uso].into_iter().flatten().collect();
    presentes.iter().filter(|p| !guardar.contains(p.as_str())).cloned().collect()
}

/// Los primeros 8 caracteres de un build (para avisos).
pub fn corto(build: &str) -> &str {
    let fin = build.char_indices().nth(8).map(|(i, _)| i).unwrap_or(build.len());
    &build[..fin]
}

// ───────────────────────────── Canal y manifiesto ─────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub enum Decision {
    /// No hay nada que bajar (con el porqué, para el registro).
    AlDia(String),
    Descargar,
}

/// ¿Bajar la capa que anuncia el canal? `mas_reciente_ms`: la más nueva de las que ya hay (la del
/// instalador, la activa o la pendiente). Solo se baja lo compatible y MÁS NUEVO (nunca vuelve atrás
/// un puntero viejo o manipulado).
pub fn decidir(c: &Canal, e: &EstadoCapas, ctx: &Contexto, mas_reciente_ms: u64) -> Decision {
    if c.formato != FORMATO {
        return Decision::AlDia(format!("formato {} del canal desconocido", c.formato));
    }
    if !build_id_seguro(&c.build_id) {
        return Decision::AlDia("el canal anuncia un build con un nombre no válido".into());
    }
    let b = c.build_id.as_str();
    if ctx.instalador_build.as_deref() == Some(b) || e.activa.as_deref() == Some(b) || e.pendiente.as_deref() == Some(b) {
        return Decision::AlDia(format!("la capa {} ya está aquí", corto(b)));
    }
    if e.malas.iter().any(|m| m == b) {
        return Decision::AlDia(format!("la capa {} ya falló aquí una vez", corto(b)));
    }
    if let Err(m) = compatible(&c.app_minima, c.protocolo, 0, ctx) {
        return Decision::AlDia(format!("la capa {} {m}", corto(b)));
    }
    if c.creado_ms <= mas_reciente_ms {
        return Decision::AlDia(format!("la capa {} no es más nueva que la que ya hay", corto(b)));
    }
    if c.bytes == 0 || c.bytes > TOPE_ARCHIVO || !es_sha256_hex(&c.sha256) {
        return Decision::AlDia("el canal anuncia un archivo sin tamaño o sin SHA-256 válidos".into());
    }
    Decision::Descargar
}

/// El trusted comment de la firma (lo cubre la firma) debe nombrar este manifiesto:
/// `timestamp:<n>\tfile:servidor-capa-<build>.json` (lo que escribe `tauri signer sign`).
pub fn comentario_firmado_ok(comentario: &str, nombre: &str) -> bool {
    comentario.split('\t').any(|campo| campo.strip_prefix("file:") == Some(nombre))
}

/// ¿La URL apunta a ese archivo? (https, o http://127.0.0.1 en las pruebas).
pub fn url_de(url: &str, nombre: &str, permitir_local: bool) -> bool {
    let esquema_ok = url.starts_with("https://") || (permitir_local && url.starts_with("http://127.0.0.1:"));
    esquema_ok && url.rsplit('/').next() == Some(nombre) && !url.contains(['?', '#', ' '])
}

/// Todo lo del manifiesto FIRMADO que debe cumplirse antes de bajar el .tar.gz.
pub fn validar_manifiesto(m: &Manifiesto, c: &Canal, ctx: &Contexto, permitir_local: bool) -> Result<(), String> {
    if m.formato != FORMATO {
        return Err(format!("formato {} del manifiesto desconocido", m.formato));
    }
    if m.build_id != c.build_id || !build_id_seguro(&m.build_id) {
        return Err("el manifiesto firmado es de otro build que el que anuncia el canal".into());
    }
    if m.creado_ms != c.creado_ms || m.app_minima != c.app_minima || m.protocolo != c.protocolo {
        return Err("el canal no dice lo mismo que el manifiesto firmado".into());
    }
    if m.archivo_nombre != nombre_archivo(&m.build_id) || m.archivo_bytes != c.bytes || m.archivo_sha256 != c.sha256 {
        return Err("el archivo del canal no es el del manifiesto firmado".into());
    }
    if !url_de(&c.archivo, &m.archivo_nombre, permitir_local) || !url_de(&c.manifiesto, &nombre_manifiesto(&m.build_id), permitir_local)
    {
        return Err("las direcciones del canal no son las de esta capa".into());
    }
    if !es_sha256_hex(&m.archivo_sha256) || m.archivo_bytes == 0 || m.archivo_bytes > TOPE_ARCHIVO {
        return Err("tamaño o SHA-256 del archivo no válidos".into());
    }
    compatible(&m.app_minima, m.protocolo, m.node_mayor, ctx)?;
    if m.archivos.is_empty() || m.archivos.len() > TOPE_ARCHIVOS || m.archivos.len() != m.total_archivos {
        return Err("la lista de archivos está vacía, es enorme o no cuadra".into());
    }
    let mut suma: u64 = 0;
    let mut minusculas = HashSet::with_capacity(m.archivos.len());
    let mut previa: Option<&str> = None;
    for a in &m.archivos {
        let r = ruta_segura(&a.ruta)?;
        if r != a.ruta {
            return Err(format!("ruta no normalizada: «{}»", a.ruta));
        }
        if !es_sha256_hex(&a.sha256) {
            return Err(format!("SHA-256 no válido para «{}»", a.ruta));
        }
        if let Some(p) = previa {
            if p >= a.ruta.as_str() {
                return Err(format!("lista desordenada o repetida en «{}»", a.ruta));
            }
            if a.ruta.starts_with(p) && a.ruta.as_bytes().get(p.len()) == Some(&b'/') {
                return Err(format!("«{p}» es archivo y carpeta a la vez"));
            }
        }
        // En macOS y Windows (sin distinguir mayúsculas) dos de estos se pisarían.
        if !minusculas.insert(a.ruta.to_lowercase()) {
            return Err(format!("dos archivos que solo cambian en mayúsculas: «{}»", a.ruta));
        }
        suma = suma.checked_add(a.bytes).ok_or("tamaño total desbordado")?;
        previa = Some(&a.ruta);
    }
    if suma != m.total_bytes || suma > TOPE_EXPANDIDO {
        return Err("el tamaño total no cuadra o es excesivo".into());
    }
    for req in REQUERIDOS {
        if m.archivos.binary_search_by(|a| a.ruta.as_str().cmp(req)).is_err() {
            return Err(format!("a la capa le falta {req}"));
        }
    }
    Ok(())
}

/// ¿Cabe? Hay que poder tener el .tar.gz y la capa extraída y que aún sobre `MARGEN_DISCO`.
pub fn cabe(libre: u64, m: &Manifiesto, ya_bajado: u64) -> bool {
    let falta_bajar = m.archivo_bytes.saturating_sub(ya_bajado);
    libre >= falta_bajar.saturating_add(m.total_bytes).saturating_add(MARGEN_DISCO)
}

// ───────────────────────────── Lector de tar ─────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub enum TipoEntrada {
    Archivo,
    Carpeta,
}

#[derive(Debug, Clone, PartialEq)]
pub struct EntradaTar {
    pub ruta: String,
    pub tipo: TipoEntrada,
    pub bytes: u64,
}

/// Lector estricto de tar (ustar/POSIX con cabeceras pax `path`/`size`, y el `L` de GNU): SOLO
/// archivos normales y carpetas, con rutas seguras. Cualquier enlace, dispositivo o ruta rara es un
/// error: la capa entera se descarta. No escribe en disco: da cada entrada y copia sus datos al
/// `Write` que le pasen.
pub struct LectorTar<R: Read> {
    r: R,
    /// Bytes de datos de la entrada actual aún sin leer.
    pendiente: u64,
    /// Relleno hasta el siguiente bloque de 512.
    relleno: u64,
    terminado: bool,
}

const BLOQUE: usize = 512;
const TOPE_PAX: u64 = 1024 * 1024;

fn error_io(e: io::Error) -> String {
    format!("tar ilegible: {e}")
}

/// Lee un bloque entero. `Ok(false)` si el flujo acabó justo al empezar el bloque.
fn leer_bloque<R: Read>(r: &mut R, buf: &mut [u8; BLOQUE]) -> Result<bool, String> {
    let mut n = 0;
    while n < BLOQUE {
        match r.read(&mut buf[n..]) {
            Ok(0) if n == 0 => return Ok(false),
            Ok(0) => return Err("tar cortado a mitad de un bloque".into()),
            Ok(k) => n += k,
            Err(e) if e.kind() == io::ErrorKind::Interrupted => {}
            Err(e) => return Err(error_io(e)),
        }
    }
    Ok(true)
}

fn descartar<R: Read>(r: &mut R, mut n: u64) -> Result<(), String> {
    let mut buf = [0u8; 8192];
    while n > 0 {
        let k = (n as usize).min(buf.len());
        r.read_exact(&mut buf[..k]).map_err(error_io)?;
        n -= k as u64;
    }
    Ok(())
}

fn octal(campo: &[u8]) -> Result<u64, String> {
    if campo.first().is_some_and(|b| b & 0x80 != 0) {
        return Err("número en base 256 no admitido".into());
    }
    let texto: String = campo.iter().take_while(|&&b| b != 0).map(|&b| b as char).collect();
    let t = texto.trim();
    if t.is_empty() {
        return Ok(0);
    }
    u64::from_str_radix(t, 8).map_err(|_| format!("número octal no válido: «{t}»"))
}

fn cadena(campo: &[u8]) -> Result<String, String> {
    let fin = campo.iter().position(|&b| b == 0).unwrap_or(campo.len());
    String::from_utf8(campo[..fin].to_vec()).map_err(|_| "nombre que no es UTF-8".into())
}

/// Registros pax: `"<largo> <clave>=<valor>\n"`, uno tras otro.
pub fn leer_pax(datos: &[u8]) -> Result<Vec<(String, String)>, String> {
    let mut out = Vec::new();
    let mut resto = datos;
    while !resto.is_empty() {
        if resto.iter().all(|&b| b == 0) {
            break;
        }
        let esp = resto.iter().position(|&b| b == b' ').ok_or("registro pax sin largo")?;
        let largo: usize = std::str::from_utf8(&resto[..esp])
            .ok()
            .and_then(|s| s.parse().ok())
            .ok_or("largo de registro pax no válido")?;
        if largo <= esp + 1 || largo > resto.len() || resto[largo - 1] != b'\n' {
            return Err("registro pax mal formado".into());
        }
        let cuerpo = std::str::from_utf8(&resto[esp + 1..largo - 1]).map_err(|_| "registro pax que no es UTF-8")?;
        let (k, v) = cuerpo.split_once('=').ok_or("registro pax sin «=»")?;
        out.push((k.to_string(), v.to_string()));
        resto = &resto[largo..];
    }
    Ok(out)
}

impl<R: Read> LectorTar<R> {
    pub fn new(r: R) -> Self {
        LectorTar { r, pendiente: 0, relleno: 0, terminado: false }
    }

    fn leer_datos_cortos(&mut self, tam: u64, tope: u64) -> Result<Vec<u8>, String> {
        if tam > tope {
            return Err("cabecera extendida demasiado grande".into());
        }
        let mut v = vec![0u8; tam as usize];
        self.r.read_exact(&mut v).map_err(error_io)?;
        descartar(&mut self.r, (BLOQUE as u64 - tam % BLOQUE as u64) % BLOQUE as u64)?;
        Ok(v)
    }

    /// La siguiente entrada (None al final). Lo que quedara sin leer de la anterior se descarta.
    pub fn siguiente(&mut self) -> Result<Option<EntradaTar>, String> {
        if self.terminado {
            return Ok(None);
        }
        descartar(&mut self.r, self.pendiente + self.relleno)?;
        self.pendiente = 0;
        self.relleno = 0;
        let mut ruta_larga: Option<String> = None;
        let mut tam_pax: Option<u64> = None;
        loop {
            let mut cab = [0u8; BLOQUE];
            if !leer_bloque(&mut self.r, &mut cab)? {
                if ruta_larga.is_some() || tam_pax.is_some() {
                    return Err("tar cortado tras una cabecera extendida".into());
                }
                self.terminado = true;
                return Ok(None);
            }
            if cab.iter().all(|&b| b == 0) {
                self.terminado = true;
                return Ok(None);
            }
            let suma_esperada = octal(&cab[148..156])?;
            let suma: u64 = cab.iter().enumerate().map(|(i, &b)| if (148..156).contains(&i) { 32 } else { b as u64 }).sum();
            if suma != suma_esperada {
                return Err("suma de control de una cabecera de tar errónea".into());
            }
            let posix = &cab[257..263] == b"ustar\0";
            if !posix && &cab[257..263] != b"ustar " {
                return Err("no es un tar ustar".into());
            }
            let tipo = cab[156];
            let tam = octal(&cab[124..136])?;
            match tipo {
                b'x' => {
                    let datos = self.leer_datos_cortos(tam, TOPE_PAX)?;
                    for (k, v) in leer_pax(&datos)? {
                        match k.as_str() {
                            "path" => ruta_larga = Some(v),
                            "size" => tam_pax = Some(v.parse().map_err(|_| "tamaño pax no válido")?),
                            _ => {}
                        }
                    }
                }
                b'g' => {
                    self.leer_datos_cortos(tam, TOPE_PAX)?;
                }
                b'L' => {
                    let datos = self.leer_datos_cortos(tam, 64 * 1024)?;
                    ruta_larga = Some(cadena(&datos)?);
                }
                b'0' | 0 | b'5' => {
                    let nombre = cadena(&cab[0..100])?;
                    let ruta = match ruta_larga.take() {
                        Some(r) => r,
                        None => {
                            let prefijo = if posix { cadena(&cab[345..500])? } else { String::new() };
                            if prefijo.is_empty() {
                                nombre.clone()
                            } else {
                                format!("{prefijo}/{nombre}")
                            }
                        }
                    };
                    let bytes = tam_pax.take().unwrap_or(tam);
                    let carpeta = tipo == b'5' || ruta.ends_with('/');
                    let ruta = ruta_segura(&ruta)?;
                    if carpeta && bytes != 0 {
                        return Err(format!("la carpeta «{ruta}» trae datos"));
                    }
                    self.pendiente = bytes;
                    self.relleno = (BLOQUE as u64 - bytes % BLOQUE as u64) % BLOQUE as u64;
                    let tipo = if carpeta { TipoEntrada::Carpeta } else { TipoEntrada::Archivo };
                    return Ok(Some(EntradaTar { ruta, tipo, bytes }));
                }
                otro => {
                    let nombre = cadena(&cab[0..100]).unwrap_or_default();
                    return Err(format!(
                        "«{nombre}» es de un tipo que una capa no puede traer ({}): solo archivos y carpetas",
                        (otro as char).escape_default()
                    ));
                }
            }
        }
    }

    /// Copia los datos de la entrada actual a `w`. Devuelve cuántos bytes copió.
    pub fn copiar_datos<W: Write>(&mut self, w: &mut W) -> Result<u64, String> {
        let mut buf = vec![0u8; 64 * 1024];
        let mut copiados = 0u64;
        while self.pendiente > 0 {
            let k = (self.pendiente as usize).min(buf.len());
            self.r.read_exact(&mut buf[..k]).map_err(error_io)?;
            w.write_all(&buf[..k]).map_err(|e| format!("no se pudo escribir: {e}"))?;
            self.pendiente -= k as u64;
            copiados += k as u64;
        }
        Ok(copiados)
    }
}

// ───────────────────────────────── Pruebas ─────────────────────────────────

#[cfg(test)]
mod pruebas {
    use super::*;

    fn ctx() -> Contexto {
        Contexto {
            version_app: "0.5.0".into(),
            node_mayor: Some(22),
            instalador_build: Some("INSTALADOR".into()),
            instalador_creado_ms: 1_000,
        }
    }

    fn resumen(b: &str, creado: u64) -> ResumenCapa {
        ResumenCapa {
            build_id: b.into(),
            creado_ms: creado,
            app_minima: "0.5.0".into(),
            protocolo: 1,
            node_mayor: 22,
            ..Default::default()
        }
    }

    const SHA: &str = "c9d915eca282ed42d1a09b143b592adb4cc6744ffe2d294adf5cfc5548170c38";

    fn manifiesto(b: &str) -> Manifiesto {
        let mut archivos: Vec<ArchivoCapa> = REQUERIDOS
            .iter()
            .chain(["node_modules/next/dist/server/next.js", "public/logo.svg"].iter())
            .map(|r| ArchivoCapa { ruta: r.to_string(), bytes: 10, sha256: SHA.into() })
            .collect();
        archivos.sort_by(|a, b| a.ruta.cmp(&b.ruta));
        Manifiesto {
            formato: 1,
            build_id: b.into(),
            version: Some("0.1.0".into()),
            commit: Some("abc".into()),
            creado_ms: 5_000,
            app_minima: "0.5.0".into(),
            protocolo: 1,
            node_mayor: 22,
            archivo_nombre: nombre_archivo(b),
            archivo_bytes: 1234,
            archivo_sha256: SHA.into(),
            total_archivos: archivos.len(),
            total_bytes: archivos.len() as u64 * 10,
            archivos,
        }
    }

    fn canal_de(m: &Manifiesto) -> Canal {
        let base = "https://github.com/StarSeedSystem/starseed-system/releases/download/servidor-local";
        Canal {
            formato: 1,
            build_id: m.build_id.clone(),
            version: m.version.clone(),
            commit: m.commit.clone(),
            creado_ms: m.creado_ms,
            app_minima: m.app_minima.clone(),
            protocolo: m.protocolo,
            manifiesto: format!("{base}/{}", nombre_manifiesto(&m.build_id)),
            firma: "ZmlybWE=".into(),
            archivo: format!("{base}/{}", nombre_archivo(&m.build_id)),
            bytes: m.archivo_bytes,
            sha256: m.archivo_sha256.clone(),
        }
    }

    #[test]
    fn nombres_y_rutas_seguras() {
        assert!(build_id_seguro("AA0YdaG0s8hV9CgdmX1rc"));
        assert!(build_id_seguro("a-b_c"));
        for malo in ["", "../x", "a/b", "a b", "ñ", &"x".repeat(65)] {
            assert!(!build_id_seguro(malo), "{malo}");
        }
        assert_eq!(nombre_archivo("B1"), "servidor-capa-B1.tar.gz");
        assert_eq!(nombre_manifiesto("B1"), "servidor-capa-B1.json");
        assert_eq!(ruta_segura("a/b.js"), Ok("a/b.js".into()));
        assert_eq!(ruta_segura(".next/static/"), Ok(".next/static".into()));
        assert_eq!(ruta_segura("node_modules/@next/env/dist/index.js"), Ok("node_modules/@next/env/dist/index.js".into()));
        for malo in ["", "/etc/passwd", "../x", "a/../../x", "a/./b", "a//b", "a\\b", "C:/x", "a/b:flujo", "a/\u{1}", "a. /b", "a./b", "./a"] {
            assert!(ruta_segura(malo).is_err(), "{malo:?}");
        }
        assert!(ruta_segura(&"a/".repeat(600)).is_err());
        assert!(es_sha256_hex(SHA));
        assert!(!es_sha256_hex(&SHA.to_uppercase()));
        assert!(!es_sha256_hex("abc"));
        assert_eq!(corto("AA0YdaG0s8hV9CgdmX1rc"), "AA0YdaG0");
        assert_eq!(corto("abc"), "abc");
    }

    #[test]
    fn versiones() {
        assert_eq!(version("0.5.0"), Some((0, 5, 0)));
        assert_eq!(version("v1.2"), Some((1, 2, 0)));
        assert_eq!(version("0.5.1-beta.2"), Some((0, 5, 1)));
        assert_eq!(version("1.2.3.4"), None);
        assert_eq!(version("hola"), None);
        assert!(version_cumple("0.5.0", "0.5.0"));
        assert!(version_cumple("0.10.0", "0.9.9"));
        assert!(!version_cumple("0.4.3", "0.5.0"));
        assert!(!version_cumple("0.5.0", "basura"));
        assert_eq!(mayor_de("22.23.4"), Some(22));
        assert_eq!(mayor_de("v22.23.4"), Some(22));
        assert_eq!(mayor_de("22.23.4 (local, sin SHA del repo)"), Some(22));
        assert_eq!(mayor_de("x"), None);
    }

    #[test]
    fn compatibilidad() {
        let c = ctx();
        assert!(compatible("0.5.0", 1, 22, &c).is_ok());
        assert!(compatible("0.5.0", 1, 0, &c).is_ok());
        assert!(compatible("0.6.0", 1, 22, &c).unwrap_err().contains("0.6.0"));
        assert!(compatible("0.5.0", 2, 22, &c).unwrap_err().contains("protocolo"));
        assert!(compatible("0.5.0", 1, 24, &c).unwrap_err().contains("Node"));
        assert!(mas_nueva_que_instalador("B", 1_001, &c));
        assert!(!mas_nueva_que_instalador("B", 1_000, &c));
        assert!(!mas_nueva_que_instalador("INSTALADOR", 9_999, &c));
    }

    #[test]
    fn eleccion_pendiente_activa_anterior_o_instalador() {
        let c = ctx();
        let info = |b: &str| match b {
            "P" => Some(resumen("P", 3_000)),
            "A" => Some(resumen("A", 2_000)),
            "Z" => Some(resumen("Z", 1_500)),
            "VIEJA" => Some(resumen("VIEJA", 500)),
            "NUEVA-APP" => Some(ResumenCapa { app_minima: "9.0.0".into(), ..resumen("NUEVA-APP", 9_000) }),
            "OTRA" => Some(resumen("DISTINTA", 9_000)),
            _ => None,
        };
        let e = EstadoCapas { activa: Some("A".into()), anterior: Some("Z".into()), pendiente: Some("P".into()), ..Default::default() };
        assert_eq!(elegir(&e, info, &c), Eleccion::Capa { build: "P".into(), a_prueba: true });
        // Tras MAX_INTENTOS sin conclusión, la pendiente deja de probarse.
        let agotada = EstadoCapas { intentos: MAX_INTENTOS, ..e.clone() };
        assert_eq!(elegir(&agotada, info, &c), Eleccion::Capa { build: "A".into(), a_prueba: false });
        // Activa mala o desaparecida → anterior → instalador.
        let mala = EstadoCapas { malas: vec!["A".into()], pendiente: None, ..e.clone() };
        assert_eq!(elegir(&mala, info, &c), Eleccion::Capa { build: "Z".into(), a_prueba: false });
        let sin = EstadoCapas { activa: Some("NO-ESTA".into()), anterior: None, pendiente: None, ..Default::default() };
        assert_eq!(elegir(&sin, info, &c), Eleccion::Instalador);
        // Más vieja que el instalador (la app se actualizó), incompatible o con otro build dentro: no.
        for b in ["VIEJA", "NUEVA-APP", "OTRA"] {
            let e = EstadoCapas { activa: Some(b.into()), ..Default::default() };
            assert_eq!(elegir(&e, info, &c), Eleccion::Instalador, "{b}");
        }
        assert_eq!(elegir(&EstadoCapas::default(), info, &c), Eleccion::Instalador);
        assert_eq!(Eleccion::Instalador.build(), None);
        assert!(Eleccion::Capa { build: "P".into(), a_prueba: true }.a_prueba());
    }

    #[test]
    fn promocion_vuelta_atras_y_sobrantes() {
        let e0 = EstadoCapas { activa: Some("A".into()), anterior: Some("Z".into()), ..Default::default() };
        let e1 = al_verificar(&e0, "P");
        assert_eq!(e1.pendiente.as_deref(), Some("P"));
        let probar = Eleccion::Capa { build: "P".into(), a_prueba: true };
        let e2 = al_intentar(&e1, &probar);
        assert_eq!(e2.intentos, 1);
        // Pasa la salud: P activa, A anterior, Z sobra.
        let e3 = tras_lista(&e2, &probar);
        assert_eq!((e3.activa.as_deref(), e3.anterior.as_deref(), e3.pendiente.as_deref(), e3.intentos), (Some("P"), Some("A"), None, 0));
        let presentes: Vec<String> = ["A", "P", "Z", "VIEJA"].iter().map(|s| s.to_string()).collect();
        assert_eq!(sobrantes(&e3, &presentes, Some("P")), vec!["Z".to_string(), "VIEJA".to_string()]);
        // La que sirve ahora nunca sobra, aunque el estado ya no la nombre.
        assert_eq!(sobrantes(&e3, &presentes, Some("Z")), vec!["VIEJA".to_string()]);
        // Se cae recién promovida: mala y se vuelve a A.
        let e4 = tras_fallo(&e3, &probar, "se cerró a los 3 s");
        assert_eq!((e4.activa.as_deref(), e4.anterior.as_deref()), (Some("A"), None));
        assert_eq!(e4.malas, vec!["P".to_string()]);
        assert!(e4.aviso.as_deref().unwrap().contains("se volvió a la capa A"));
        // No pasa la salud estando pendiente: mala, la activa sigue.
        let e5 = tras_fallo(&e2, &probar, "no respondió en 60 s");
        assert_eq!((e5.activa.as_deref(), e5.pendiente.as_deref(), e5.intentos), (Some("A"), None, 0));
        // Sin anterior: al instalador.
        let solo = EstadoCapas { activa: Some("A".into()), ..Default::default() };
        let e6 = tras_fallo(&solo, &Eleccion::Capa { build: "A".into(), a_prueba: false }, "x");
        assert_eq!(e6.activa, None);
        assert!(e6.aviso.unwrap().contains("instalador"));
        // El instalador nunca cambia el estado.
        assert_eq!(tras_fallo(&solo, &Eleccion::Instalador, "x"), solo);
        assert_eq!(tras_lista(&solo, &Eleccion::Instalador), solo);
        // Usar la activa (no a prueba) tampoco.
        assert_eq!(tras_lista(&solo, &Eleccion::Capa { build: "A".into(), a_prueba: false }), solo);
        // Las malas no crecen sin tope.
        let mut e = EstadoCapas::default();
        for i in 0..(MAX_MALAS + 5) {
            e = tras_fallo(&e, &Eleccion::Capa { build: format!("M{i}"), a_prueba: true }, "x");
        }
        assert_eq!(e.malas.len(), MAX_MALAS);
        assert_eq!(e.malas[0], "M5");
    }

    #[test]
    fn decide_bajar_solo_lo_nuevo_y_compatible() {
        let c = ctx();
        let m = manifiesto("NUEVA");
        let canal = canal_de(&m);
        let e = EstadoCapas { activa: Some("A".into()), ..Default::default() };
        assert_eq!(decidir(&canal, &e, &c, 2_000), Decision::Descargar);
        // Ya está, es el instalador, falló antes, no es más nueva, o pide otra app / protocolo.
        assert!(matches!(decidir(&canal, &EstadoCapas { activa: Some("NUEVA".into()), ..Default::default() }, &c, 0), Decision::AlDia(_)));
        assert!(matches!(decidir(&canal, &EstadoCapas { pendiente: Some("NUEVA".into()), ..Default::default() }, &c, 0), Decision::AlDia(_)));
        assert!(matches!(decidir(&Canal { build_id: "INSTALADOR".into(), ..canal.clone() }, &e, &c, 0), Decision::AlDia(_)));
        assert!(matches!(decidir(&canal, &EstadoCapas { malas: vec!["NUEVA".into()], ..Default::default() }, &c, 0), Decision::AlDia(_)));
        assert!(matches!(decidir(&canal, &e, &c, 5_000), Decision::AlDia(_)));
        let Decision::AlDia(m1) = decidir(&Canal { app_minima: "0.9.0".into(), ..canal.clone() }, &e, &c, 0) else { panic!() };
        assert!(m1.contains("0.9.0"));
        assert!(matches!(decidir(&Canal { protocolo: 7, ..canal.clone() }, &e, &c, 0), Decision::AlDia(_)));
        assert!(matches!(decidir(&Canal { formato: 2, ..canal.clone() }, &e, &c, 0), Decision::AlDia(_)));
        assert!(matches!(decidir(&Canal { build_id: "../x".into(), ..canal.clone() }, &e, &c, 0), Decision::AlDia(_)));
        assert!(matches!(decidir(&Canal { sha256: "x".into(), ..canal.clone() }, &e, &c, 0), Decision::AlDia(_)));
    }

    #[test]
    fn manifiesto_firmado_manda_sobre_el_canal() {
        let c = ctx();
        let m = manifiesto("NUEVA");
        let canal = canal_de(&m);
        assert_eq!(validar_manifiesto(&m, &canal, &c, false), Ok(()));
        // El canal no puede emparejar un build con el archivo de otro.
        assert!(validar_manifiesto(&m, &Canal { build_id: "OTRA".into(), ..canal.clone() }, &c, false).is_err());
        assert!(validar_manifiesto(&m, &Canal { sha256: "a".repeat(64), ..canal.clone() }, &c, false).is_err());
        assert!(validar_manifiesto(&m, &Canal { bytes: 1, ..canal.clone() }, &c, false).is_err());
        assert!(validar_manifiesto(&m, &Canal { creado_ms: 9_999_999, ..canal.clone() }, &c, false).is_err());
        assert!(validar_manifiesto(&m, &Canal { archivo: "https://otra.web/x.tar.gz".into(), ..canal.clone() }, &c, false).is_err());
        assert!(validar_manifiesto(&m, &Canal { archivo: canal.archivo.replace("https://", "http://"), ..canal.clone() }, &c, false).is_err());
        // Pruebas: http://127.0.0.1 solo si se permite.
        let local = Canal {
            archivo: format!("http://127.0.0.1:8123/{}", nombre_archivo("NUEVA")),
            manifiesto: format!("http://127.0.0.1:8123/{}", nombre_manifiesto("NUEVA")),
            ..canal.clone()
        };
        assert!(validar_manifiesto(&m, &local, &c, false).is_err());
        assert_eq!(validar_manifiesto(&m, &local, &c, true), Ok(()));
        // Lista: falta un requerido, desordenada, repetida, mayúsculas, archivo y carpeta, ruta mala, total.
        let sin = |q: &str| {
            let mut x = m.clone();
            x.archivos.retain(|a| a.ruta != q);
            x.total_archivos = x.archivos.len();
            x.total_bytes = x.archivos.len() as u64 * 10;
            x
        };
        assert!(validar_manifiesto(&sin("guarda.cjs"), &canal, &c, false).unwrap_err().contains("guarda.cjs"));
        let con = |extra: Vec<ArchivoCapa>, ordenar: bool| {
            let mut x = m.clone();
            x.archivos.extend(extra);
            if ordenar {
                x.archivos.sort_by(|a, b| a.ruta.cmp(&b.ruta));
            }
            x.total_archivos = x.archivos.len();
            x.total_bytes = x.archivos.iter().map(|a| a.bytes).sum();
            x
        };
        let a = |r: &str| ArchivoCapa { ruta: r.into(), bytes: 10, sha256: SHA.into() };
        assert!(validar_manifiesto(&con(vec![a("aaa")], false), &canal, &c, false).unwrap_err().contains("desordenada"));
        assert!(validar_manifiesto(&con(vec![a("server.js")], true), &canal, &c, false).is_err());
        assert!(validar_manifiesto(&con(vec![a("Server.js")], true), &canal, &c, false).unwrap_err().contains("mayúsculas"));
        assert!(validar_manifiesto(&con(vec![a("server.js/x")], true), &canal, &c, false).unwrap_err().contains("carpeta"));
        assert!(validar_manifiesto(&con(vec![a("../fuera")], true), &canal, &c, false).is_err());
        let mut sha_malo = con(vec![], true);
        sha_malo.archivos[0].sha256 = "NO".into();
        assert!(validar_manifiesto(&sha_malo, &canal, &c, false).is_err());
        let mut total = m.clone();
        total.total_bytes += 1;
        assert!(validar_manifiesto(&total, &canal, &c, false).is_err());
        let mut incompatible = m.clone();
        incompatible.node_mayor = 24;
        assert!(validar_manifiesto(&incompatible, &canal, &c, false).unwrap_err().contains("Node"));
        // Disco: el .tar.gz que falta + la capa + el margen.
        assert!(cabe(1234 + m.total_bytes + MARGEN_DISCO, &m, 0));
        assert!(!cabe(1233 + m.total_bytes + MARGEN_DISCO, &m, 0));
        assert!(cabe(m.total_bytes + MARGEN_DISCO, &m, 1234));
    }

    #[test]
    fn la_firma_nombra_el_manifiesto() {
        assert!(comentario_firmado_ok("timestamp:1794077943\tfile:servidor-capa-B1.json", "servidor-capa-B1.json"));
        assert!(!comentario_firmado_ok("timestamp:1794077943\tfile:servidor-capa-B2.json", "servidor-capa-B1.json"));
        assert!(!comentario_firmado_ok("timestamp:1794077943", "servidor-capa-B1.json"));
        assert!(url_de("https://x/y/servidor-capa-B1.json", "servidor-capa-B1.json", false));
        assert!(!url_de("https://x/y/servidor-capa-B1.json?x=1", "servidor-capa-B1.json", false));
        assert!(!url_de("file:///servidor-capa-B1.json", "servidor-capa-B1.json", true));
    }

    // ── Tar: se arma a mano (como lo escribe native/servidor-local/capa.mjs) ──

    fn cabecera(nombre: &str, tam: u64, tipo: u8, prefijo: &str, magia: &[u8; 8]) -> [u8; 512] {
        let mut c = [0u8; 512];
        c[..nombre.len()].copy_from_slice(nombre.as_bytes());
        c[100..107].copy_from_slice(b"0000644");
        c[108..115].copy_from_slice(b"0000000");
        c[116..123].copy_from_slice(b"0000000");
        let t = format!("{tam:011o}");
        c[124..135].copy_from_slice(t.as_bytes());
        c[136..147].copy_from_slice(b"00000000000");
        c[156] = tipo;
        c[257..265].copy_from_slice(magia);
        c[345..345 + prefijo.len()].copy_from_slice(prefijo.as_bytes());
        c[148..156].copy_from_slice(b"        ");
        let suma: u64 = c.iter().map(|&b| b as u64).sum();
        let s = format!("{suma:06o}\0 ");
        c[148..156].copy_from_slice(s.as_bytes());
        c
    }

    const POSIX: &[u8; 8] = b"ustar\x0000";

    fn entrada(t: &mut Vec<u8>, nombre: &str, datos: &[u8], tipo: u8) {
        t.extend_from_slice(&cabecera(nombre, datos.len() as u64, tipo, "", POSIX));
        t.extend_from_slice(datos);
        t.resize(t.len().div_ceil(512) * 512, 0);
    }

    fn pax(t: &mut Vec<u8>, clave: &str, valor: &str) {
        let cuerpo = format!(" {clave}={valor}\n");
        let mut largo = cuerpo.len() + 1;
        while format!("{largo}{cuerpo}").len() != largo {
            largo += 1;
        }
        entrada(t, "PaxHeader", format!("{largo}{cuerpo}").as_bytes(), b'x');
    }

    fn fin(t: &mut Vec<u8>) {
        t.extend_from_slice(&[0u8; 1024]);
    }

    fn todo(t: &[u8]) -> Result<Vec<(EntradaTar, Vec<u8>)>, String> {
        let mut l = LectorTar::new(t);
        let mut v = Vec::new();
        while let Some(e) = l.siguiente()? {
            let mut d = Vec::new();
            if e.tipo == TipoEntrada::Archivo {
                assert_eq!(l.copiar_datos(&mut d)?, e.bytes);
            }
            v.push((e, d));
        }
        Ok(v)
    }

    #[test]
    fn tar_archivos_carpetas_y_rutas_largas() {
        let mut t = Vec::new();
        entrada(&mut t, ".next/", b"", b'5');
        entrada(&mut t, ".next/BUILD_ID", b"B1\n", b'0');
        entrada(&mut t, "vacio.txt", b"", b'0');
        let larga = format!("node_modules/{}index.js", "paquete-con-nombre-largo/".repeat(8));
        pax(&mut t, "path", &larga);
        entrada(&mut t, "recortado", &vec![7u8; 1000], b'0');
        // ustar con prefijo (sin pax).
        t.extend_from_slice(&cabecera("b.js", 2, b'0', "pre/fijo", POSIX));
        t.extend_from_slice(b"hi");
        t.resize(t.len().div_ceil(512) * 512, 0);
        // GNU: nombre largo con «L».
        let gnu = b"ustar  \0";
        let nombre_gnu = "gnu/".repeat(40) + "x.js";
        t.extend_from_slice(&cabecera("././@LongLink", nombre_gnu.len() as u64 + 1, b'L', "", gnu));
        t.extend_from_slice(nombre_gnu.as_bytes());
        t.push(0);
        t.resize(t.len().div_ceil(512) * 512, 0);
        t.extend_from_slice(&cabecera("recortado", 1, b'0', "", gnu));
        t.push(b'z');
        t.resize(t.len().div_ceil(512) * 512, 0);
        fin(&mut t);
        let v = todo(&t).unwrap();
        let rutas: Vec<&str> = v.iter().map(|(e, _)| e.ruta.as_str()).collect();
        assert_eq!(rutas, vec![".next", ".next/BUILD_ID", "vacio.txt", larga.as_str(), "pre/fijo/b.js", nombre_gnu.as_str()]);
        assert_eq!(v[0].0.tipo, TipoEntrada::Carpeta);
        assert_eq!(v[1].1, b"B1\n");
        assert_eq!(v[3].1, vec![7u8; 1000]);
        assert_eq!(v[5].1, b"z");
    }

    #[test]
    fn tar_salta_lo_no_leido_y_acaba_sin_bloques_finales() {
        let mut t = Vec::new();
        entrada(&mut t, "a.txt", &vec![1u8; 700], b'0');
        entrada(&mut t, "b.txt", b"bb", b'0');
        let mut l = LectorTar::new(t.as_slice());
        assert_eq!(l.siguiente().unwrap().unwrap().ruta, "a.txt");
        let b = l.siguiente().unwrap().unwrap();
        assert_eq!(b.ruta, "b.txt");
        let mut d = Vec::new();
        l.copiar_datos(&mut d).unwrap();
        assert_eq!(d, b"bb");
        assert_eq!(l.siguiente().unwrap(), None);
        assert_eq!(l.siguiente().unwrap(), None);
    }

    #[test]
    fn tar_rechaza_enlaces_rutas_malas_y_cabeceras_rotas() {
        let un = |nombre: &str, tipo: u8| {
            let mut t = Vec::new();
            entrada(&mut t, nombre, b"", tipo);
            fin(&mut t);
            todo(&t)
        };
        assert!(un("enlace", b'2').unwrap_err().contains("tipo"));
        assert!(un("duro", b'1').unwrap_err().contains("tipo"));
        assert!(un("fifo", b'6').is_err());
        assert!(un("../fuera.js", b'0').is_err());
        assert!(un("/etc/passwd", b'0').is_err());
        assert!(un("./a.js", b'0').is_err());
        let mut con_pax = Vec::new();
        pax(&mut con_pax, "path", "a/../../x");
        entrada(&mut con_pax, "x", b"", b'0');
        assert!(todo(&con_pax).is_err());
        // Carpeta con datos.
        let mut t = Vec::new();
        entrada(&mut t, "c/", b"datos", b'5');
        assert!(todo(&t).unwrap_err().contains("carpeta"));
        // Suma de control rota.
        let mut t = Vec::new();
        entrada(&mut t, "a.txt", b"hola", b'0');
        t[0] = b'b';
        assert!(todo(&t).unwrap_err().contains("suma"));
        // No es tar.
        assert!(todo(&[1u8; 512]).is_err());
        // Cortado a mitad de los datos o de un bloque.
        let mut t = Vec::new();
        entrada(&mut t, "a.txt", &vec![1u8; 2000], b'0');
        assert!(todo(&t[..1024]).is_err());
        assert!(todo(&t[..100]).is_err());
        // Tamaño en base 256: no.
        let mut c = cabecera("a", 0, b'0', "", POSIX);
        c[124] = 0x80;
        assert!(LectorTar::new(&c[..]).siguiente().is_err());
    }

    #[test]
    fn pax_registros() {
        assert_eq!(leer_pax(b"11 path=ab\n").unwrap(), vec![("path".into(), "ab".into())]);
        assert_eq!(leer_pax(b"").unwrap(), vec![]);
        assert!(leer_pax(b"99 path=ab\n").is_err());
        assert!(leer_pax(b"x path=ab\n").is_err());
        assert!(leer_pax(b"10 pathab\n").is_err());
    }
}
