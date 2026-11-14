// ═══════════════════════════════════════════════════════════════════════════
// servidor_capas — actualizar el servidor local por CAPAS, sin reinstalar la app (CAP1107A · T1).
// ---------------------------------------------------------------------------
// Contrato: architecture/apps-autonomas-sin-internet.md §10. Lógica pura: servidor_capas_logica.rs.
//
// Pegamento de las capas con el sistema:
//   · Al arrancar (`preparar`), qué hay en `<app_data>/servidor-capas/` y con qué clave se verifica:
//     la MISMA clave pública del updater de Tauri (`plugins.updater.pubkey` de tauri.conf.json).
//   · `elegir`: qué carpeta sirve este arranque (pendiente a prueba → activa → anterior → instalador);
//     cada capa se vuelve a verificar (firma de su manifiesto + archivos clave) antes de usarla.
//   · `tras_lista` / `tras_fallo`: promover o marcar mala y volver atrás (lo llama servidor_local.rs).
//   · El vigía (un hilo): con internet, a los 90 s del primer «listo» y cada 6 h, mira el canal
//     (`latest-servidor.json`), y si hay una capa compatible y más nueva baja su manifiesto, verifica
//     la firma minisign (y que firma ESE archivo), baja el .tar.gz con el `curl` del sistema
//     (reanudable, solo https), comprueba su SHA-256, lo extrae con el lector estricto (cada archivo
//     con su SHA-256 del manifiesto; lo que no casa o no está en la lista tira la capa entera) a una
//     carpeta temporal y la renombra a `<build>/`. Queda PENDIENTE: la usa el siguiente arranque o
//     «Actualizar ahora» (`servidor_local_actualizar`, que reinicia solo el Node).
//   · Nunca toca el paquete del instalador; borra solo capas que no son ni activa, ni anterior, ni
//     pendiente, ni la que sirve ahora.
//
// Dependencias: `minisign-verify` (la que ya usa tauri-plugin-updater para lo mismo) y `flate2` (ya
// en el árbol por `png`); ninguna descarga nueva. Solo escritorio.
// ═══════════════════════════════════════════════════════════════════════════

use crate::servidor_capas_logica as c;
use crate::servidor_local_logica as l;
use crate::servidor_relevo_logica as r; // ACT1114H
use crate::sha256::{hex, sha256_archivo, Sha256};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File, OpenOptions};
use std::io::{BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

/// Lo que la pastilla enseña de las capas (va dentro de `servidor_local_estado`).
#[derive(Clone, Debug, Default)]
pub struct Publico {
    /// "buscando" | "descargando" | "verificando" | "lista" | "al-dia" | "sin-red" | "error"
    pub fase: Option<String>,
    /// Build de la capa nueva ya verificada (lista para «Actualizar ahora»).
    pub nueva: Option<String>,
    pub nueva_version: Option<String>,
    pub aviso: Option<String>,
    // ── ACT1114H · qué web corre, cuál está publicada y qué dice el relevo (todo `web=<compilación>/<sha>`) ──
    /// Build de la web que sirve el Node ahora.
    pub web_corre: Option<String>,
    /// Build de la web PUBLICADA (`/version.json` de la web publicada, no la copia local); None si no se pudo leer.
    pub web_publicada: Option<String>,
    /// Build de la web de la capa nueva ya verificada.
    pub web_nueva: Option<String>,
    /// "al-dia" | "capa-lista" | "sin-capa" | "sin-datos"
    pub relevo: Option<String>,
}

/// (ACT1114H) Las tres builds que se comparan.
#[derive(Clone, Default)]
struct Webs {
    corre: r::WebId,
    publicada: Option<r::WebId>,
    nueva: Option<r::WebId>,
}

struct Interno {
    dir: Mutex<Option<PathBuf>>,
    ctx: Mutex<Option<c::Contexto>>,
    clave: Mutex<Option<String>>,
    /// Lectura-cambio-escritura de `estado.json` (el vigía y el arranque).
    cerrojo: Mutex<()>,
    publico: Mutex<Publico>,
    en_uso: Mutex<Option<String>>,
    registro: Mutex<Option<File>>,
    vigia: AtomicBool,
    /// (ACT1114H) Builds de la web: la que corre, la publicada y la de la capa lista.
    webs: Mutex<Webs>,
    /// (ACT1114H) Build que corría cuando se pidió un relevo (para escribir «antes → ahora» o el fallo).
    relevo_desde: Mutex<Option<r::WebId>>,
    /// (ACT1114H) Último aviso de relevo escrito, para no repetirlo en cada mirada.
    ultimo_aviso: Mutex<Option<String>>,
    /// (ACT1114H) Última vez que se miró el canal (ms).
    ultima_busqueda: Mutex<u64>,
}

fn interno() -> &'static Interno {
    static I: OnceLock<Interno> = OnceLock::new();
    I.get_or_init(|| Interno {
        dir: Mutex::new(None),
        ctx: Mutex::new(None),
        clave: Mutex::new(None),
        cerrojo: Mutex::new(()),
        publico: Mutex::new(Publico::default()),
        en_uso: Mutex::new(None),
        registro: Mutex::new(None),
        vigia: AtomicBool::new(false),
        webs: Mutex::new(Webs::default()),
        relevo_desde: Mutex::new(None),
        ultimo_aviso: Mutex::new(None),
        ultima_busqueda: Mutex::new(0),
    })
}

fn leer<T: Clone>(m: &Mutex<T>) -> T {
    m.lock().map(|g| g.clone()).unwrap_or_else(|p| p.into_inner().clone())
}

fn poner<T>(m: &Mutex<T>, v: T) {
    if let Ok(mut g) = m.lock() {
        *g = v;
    }
}

fn con_publico(f: impl FnOnce(&mut Publico)) {
    if let Ok(mut p) = interno().publico.lock() {
        f(&mut p);
    }
}

pub fn publico() -> Publico {
    leer(&interno().publico)
}

/// ¿Hay una capa nueva verificada esperando?
pub fn hay_pendiente() -> bool {
    publico().nueva.is_some()
}

// ─────────────── ACT1114H · la web que corre, la publicada y el relevo en la misma sesión ───────────────

/// La build de la web que lleva una carpeta de servidor (instalador o capa): su `public/version.json`.
/// Sin ese archivo (paquetes viejos), la build queda «desconocida»: nunca se inventa.
fn web_de_dir(dir: &Path) -> r::WebId {
    fs::read_to_string(dir.join("public").join("version.json")).ok().and_then(|t| r::de_version_json(&t)).unwrap_or_default()
}

/// Escribe en `Publico` lo que se sabe (para la pastilla y para la web, que decide si es momento de relevar).
fn refrescar_publico() {
    let w = leer(&interno().webs);
    let rel = r::clasificar(&w.corre, w.publicada.as_ref(), w.nueva.as_ref());
    con_publico(|p| {
        p.web_corre = w.corre.conocida().then(|| w.corre.etiqueta());
        p.web_publicada = w.publicada.as_ref().map(r::WebId::etiqueta);
        p.web_nueva = w.nueva.as_ref().map(r::WebId::etiqueta);
        p.relevo = Some(rel.texto().into());
    });
}

/// Una línea de relevo que no se repite seguida (la mirada es cada 5 min).
fn registrar_una_vez(linea: &str) {
    let nuevo = interno().ultimo_aviso.lock().map(|mut u| r::nuevo_mensaje(&mut u, linea)).unwrap_or(true);
    if nuevo {
        registrar(linea);
    }
}

/// Se llama desde `elegir`: qué carpeta sirve el Node en este arranque. Devuelve su build de web.
pub fn servida(dir: &Path) -> r::WebId {
    let web = web_de_dir(dir);
    if let Ok(mut w) = interno().webs.lock() {
        w.corre = web.clone();
    }
    refrescar_publico();
    web
}

/// Una línea en el registro con la build de web que sirve este arranque (con o sin capa): `sirve web=<compilación>/<sha>`.
pub fn registrar_sirve() {
    let w = leer(&interno().webs);
    registrar(&r::linea_sirve(&w.corre, w.publicada.as_ref()));
}

/// «Actualizar ahora» (a mano o por la web al ser momento seguro): deja escrito qué build se deja y cuál entra.
pub fn al_pedir_relevo() {
    let w = leer(&interno().webs);
    let destino = w.nueva.clone().unwrap_or_default();
    registrar(&r::linea_relevo_pedido(&w.corre, &destino, w.publicada.as_ref()));
    poner(&interno().relevo_desde, Some(w.corre));
}

/// Lee `/version.json` de la web PUBLICADA y dice si hay que mirar el canal ya. Nunca lanza.
fn mirar_publicada(ahora: u64) -> bool {
    let url = format!("{}/version.json", l::WEB_PUBLICADA);
    let leida = bajar_bytes(&url, r::TOPE_VERSION_JSON)
        .and_then(|b| r::de_version_json(&String::from_utf8_lossy(&b)).ok_or_else(|| "respuesta sin build reconocible".to_string()));
    let corre = leer(&interno().webs).corre;
    match leida {
        Ok(p) => {
            if let Ok(mut w) = interno().webs.lock() {
                w.publicada = Some(p);
            }
        }
        Err(e) => {
            if let Ok(mut w) = interno().webs.lock() {
                w.publicada = None;
            }
            registrar_una_vez(&r::linea_publicada_ilegible(&corre, &e));
        }
    }
    refrescar_publico();
    let w = leer(&interno().webs);
    let rel = r::clasificar(&w.corre, w.publicada.as_ref(), w.nueva.as_ref());
    if rel == r::Relevo::SinCapa {
        if let Some(p) = &w.publicada {
            registrar_una_vez(&r::linea_sin_capa(&w.corre, p));
        }
    }
    r::buscar_ya(&rel, ahora, leer(&interno().ultima_busqueda))
}

fn ahora_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn registrar(linea: &str) {
    if let Ok(g) = interno().registro.lock() {
        if let Some(mut f) = g.as_ref() {
            let _ = writeln!(f, "{} [capas] {linea}", ahora_ms());
        }
    }
}

/// Solo en builds de depuración (pruebas): canal propio y direcciones http://127.0.0.1.
fn permitir_local() -> bool {
    cfg!(debug_assertions)
}

/// Primera mirada al canal (en depuración, `STARSEED_CAPAS_PRIMERA_MS` la adelanta para las pruebas).
fn primera_mirada_ms() -> u64 {
    if permitir_local() {
        if let Some(ms) = std::env::var("STARSEED_CAPAS_PRIMERA_MS").ok().and_then(|v| v.trim().parse().ok()) {
            return ms;
        }
    }
    c::PRIMERA_MIRADA_MS
}

fn url_canal() -> String {
    if permitir_local() {
        if let Ok(u) = std::env::var("STARSEED_CANAL_SERVIDOR") {
            if !u.trim().is_empty() {
                return u;
            }
        }
    }
    c::CANAL.to_string()
}

// ───────────────────────────── JSON ─────────────────────────────

fn texto(v: &Value, k: &str) -> Option<String> {
    v.get(k).and_then(Value::as_str).map(str::trim).filter(|s| !s.is_empty()).map(str::to_string)
}

fn num(v: &Value, k: &str) -> Option<u64> {
    v.get(k).and_then(Value::as_u64)
}

fn n32(v: &Value, k: &str) -> Result<u32, String> {
    num(v, k).and_then(|n| u32::try_from(n).ok()).ok_or_else(|| format!("falta «{k}»"))
}

fn exigir(v: Option<String>, k: &str) -> Result<String, String> {
    v.ok_or_else(|| format!("falta «{k}»"))
}

pub fn canal_de_json(v: &Value) -> Result<c::Canal, String> {
    Ok(c::Canal {
        formato: n32(v, "formato")?,
        build_id: exigir(texto(v, "build_id"), "build_id")?,
        version: texto(v, "version"),
        commit: texto(v, "commit"),
        creado_ms: num(v, "creado_ms").ok_or("falta «creado_ms»")?,
        app_minima: exigir(texto(v, "app_minima"), "app_minima")?,
        protocolo: n32(v, "protocolo")?,
        manifiesto: exigir(texto(v, "manifiesto"), "manifiesto")?,
        firma: exigir(texto(v, "firma"), "firma")?,
        archivo: exigir(texto(v, "archivo"), "archivo")?,
        bytes: num(v, "bytes").ok_or("falta «bytes»")?,
        sha256: exigir(texto(v, "sha256"), "sha256")?,
    })
}

pub fn manifiesto_de_json(v: &Value) -> Result<c::Manifiesto, String> {
    let archivo = v.get("archivo").ok_or("falta «archivo»")?;
    let total = v.get("total").ok_or("falta «total»")?;
    let lista = v.get("archivos").and_then(Value::as_array).ok_or("falta «archivos»")?;
    let mut archivos = Vec::with_capacity(lista.len());
    for x in lista {
        let t = x.as_array().filter(|t| t.len() == 3).ok_or("entrada de «archivos» mal formada")?;
        archivos.push(c::ArchivoCapa {
            ruta: t[0].as_str().ok_or("ruta no válida")?.to_string(),
            bytes: t[1].as_u64().ok_or("tamaño no válido")?,
            sha256: t[2].as_str().ok_or("SHA-256 no válido")?.to_string(),
        });
    }
    Ok(c::Manifiesto {
        formato: n32(v, "formato")?,
        build_id: exigir(texto(v, "build_id"), "build_id")?,
        version: texto(v, "version"),
        commit: texto(v, "commit"),
        creado_ms: num(v, "creado_ms").ok_or("falta «creado_ms»")?,
        app_minima: exigir(texto(v, "app_minima"), "app_minima")?,
        protocolo: n32(v, "protocolo")?,
        node_mayor: num(v, "node_mayor").and_then(|n| u32::try_from(n).ok()).unwrap_or(0),
        archivo_nombre: exigir(texto(archivo, "nombre"), "archivo.nombre")?,
        archivo_bytes: num(archivo, "bytes").ok_or("falta «archivo.bytes»")?,
        archivo_sha256: exigir(texto(archivo, "sha256"), "archivo.sha256")?,
        total_archivos: num(total, "archivos").ok_or("falta «total.archivos»")? as usize,
        total_bytes: num(total, "bytes").ok_or("falta «total.bytes»")?,
        archivos,
    })
}

fn lista_de(v: &Value, k: &str) -> Vec<String> {
    v.get(k)
        .and_then(Value::as_array)
        .map(|a| a.iter().filter_map(Value::as_str).filter(|s| c::build_id_seguro(s)).map(str::to_string).collect())
        .unwrap_or_default()
}

fn build_de(v: &Value, k: &str) -> Option<String> {
    texto(v, k).filter(|b| c::build_id_seguro(b))
}

pub fn estado_de_json(v: &Value) -> c::EstadoCapas {
    c::EstadoCapas {
        activa: build_de(v, "activa"),
        anterior: build_de(v, "anterior"),
        pendiente: build_de(v, "pendiente"),
        intentos: num(v, "intentos").and_then(|n| u32::try_from(n).ok()).unwrap_or(0),
        malas: lista_de(v, "malas"),
        aviso: texto(v, "aviso"),
    }
}

pub fn estado_a_json(e: &c::EstadoCapas) -> Value {
    json!({
        "formato": c::FORMATO,
        "activa": e.activa,
        "anterior": e.anterior,
        "pendiente": e.pendiente,
        "intentos": e.intentos,
        "malas": e.malas,
        "aviso": e.aviso,
    })
}

fn leer_estado(dir: &Path) -> c::EstadoCapas {
    fs::read(dir.join(c::ESTADO))
        .ok()
        .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
        .map(|v| estado_de_json(&v))
        .unwrap_or_default()
}

/// Escribe el estado de forma atómica (temporal + renombrar).
fn escribir_estado(dir: &Path, e: &c::EstadoCapas) {
    let _ = fs::create_dir_all(dir);
    let tmp = dir.join(format!("{}.tmp", c::ESTADO));
    let ok = serde_json::to_vec_pretty(&estado_a_json(e))
        .ok()
        .and_then(|b| File::create(&tmp).and_then(|mut f| f.write_all(&b).and_then(|_| f.sync_all())).ok());
    if ok.is_some() {
        if let Err(err) = fs::rename(&tmp, dir.join(c::ESTADO)) {
            registrar(&format!("no se pudo guardar el estado de las capas: {err}"));
        }
    }
}

/// Cambia el estado con el cerrojo puesto y lo guarda.
fn cambiar_estado(f: impl FnOnce(&c::EstadoCapas) -> c::EstadoCapas) -> Option<c::EstadoCapas> {
    let dir = leer(&interno().dir)?;
    let _g = interno().cerrojo.lock().ok()?;
    let antes = leer_estado(&dir);
    let despues = f(&antes);
    if despues != antes {
        escribir_estado(&dir, &despues);
    }
    Some(despues)
}

// ───────────────────────────── Firma ─────────────────────────────

/// La clave pública del updater (base64 del texto minisign), de tauri.conf.json.
fn clave_publica(app: &AppHandle) -> Option<String> {
    app.config().plugins.0.get("updater")?.get("pubkey")?.as_str().map(str::to_string)
}

/// Verifica `datos` con la firma (contenido de un `.sig` de `tauri signer sign`: base64 del texto
/// minisign) y la clave del updater; además la firma debe ser de ESE archivo (`file:` del comentario
/// firmado). Igual que tauri-plugin-updater, pero sin aceptar firmas «legacy» sin prehash.
pub fn verificar_firma(datos: &[u8], firma_b64: &str, clave_b64: &str, nombre: &str) -> Result<(), String> {
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD;
    let clave = b64
        .decode(clave_b64.trim())
        .ok()
        .and_then(|b| String::from_utf8(b).ok())
        .ok_or("la clave pública del updater no es válida")?;
    let pk = minisign_verify::PublicKey::decode(&clave).map_err(|e| format!("la clave pública del updater no es válida: {e}"))?;
    let firma = b64
        .decode(firma_b64.trim())
        .ok()
        .and_then(|b| String::from_utf8(b).ok())
        .ok_or("la firma no es el base64 de un .sig de minisign")?;
    let sig = minisign_verify::Signature::decode(&firma).map_err(|e| format!("firma ilegible: {e}"))?;
    pk.verify(datos, &sig, false).map_err(|e| format!("la firma del manifiesto no es válida: {e}"))?;
    if !c::comentario_firmado_ok(sig.trusted_comment(), nombre) {
        return Err(format!("la firma es buena pero no es la de {nombre}"));
    }
    Ok(())
}

// ───────────────────────────── Capas en disco ─────────────────────────────

/// `base` + ruta relativa con «/» (componente a componente: vale en Windows).
fn ruta_local(base: &Path, rel: &str) -> PathBuf {
    let mut p = base.to_path_buf();
    for parte in rel.split('/') {
        p.push(parte);
    }
    p
}

/// El manifiesto de una capa instalada, si está entera y su firma verifica.
fn leer_capa(dir: &Path, build: &str, clave: &str) -> Option<c::Manifiesto> {
    if !c::build_id_seguro(build) {
        return None;
    }
    let d = dir.join(build);
    let bytes = fs::read(d.join(c::MANIFIESTO_EN_CAPA)).ok()?;
    let firma = fs::read_to_string(d.join(c::FIRMA_EN_CAPA)).ok()?;
    if let Err(e) = verificar_firma(&bytes, &firma, clave, &c::nombre_manifiesto(build)) {
        registrar(&format!("la capa {build} no verifica: {e}"));
        return None;
    }
    let m = manifiesto_de_json(&serde_json::from_slice(&bytes).ok()?).ok()?;
    if m.build_id != build {
        return None;
    }
    let id = fs::read_to_string(ruta_local(&d, ".next/BUILD_ID")).ok()?;
    if id.trim() != build || !c::REQUERIDOS.iter().all(|r| ruta_local(&d, r).is_file()) {
        registrar(&format!("la capa {build} está incompleta"));
        return None;
    }
    Some(m)
}

/// Contexto de esta app: su versión, el Node que trae y el paquete del instalador.
fn contexto(app: &AppHandle, instalador: &l::RutasPaquete) -> c::Contexto {
    let m = fs::read(&instalador.manifiesto).ok().and_then(|b| serde_json::from_slice::<Value>(&b).ok()).unwrap_or(Value::Null);
    c::Contexto {
        version_app: app.package_info().version.to_string(),
        node_mayor: texto(&m, "node").and_then(|n| c::mayor_de(&n)),
        instalador_build: texto(&m, "buildId").or_else(|| {
            fs::read_to_string(instalador.dir.join(".next").join("BUILD_ID")).ok().map(|s| s.trim().to_string())
        }),
        instalador_creado_ms: num(&m, "creadoMs").unwrap_or(0),
    }
}

/// Se llama al arrancar el servidor local (antes del primer `elegir`).
pub fn preparar(app: &AppHandle, instalador: &l::RutasPaquete, registro: Option<File>) {
    poner(&interno().registro, registro);
    let Ok(base) = app.path().app_data_dir() else {
        registrar("sin carpeta de datos de la app: no hay capas");
        return;
    };
    let dir = base.join(c::DIR_CAPAS);
    let ctx = contexto(app, instalador);
    registrar(&format!(
        "app {} · Node {:?} · instalador {} ({})",
        ctx.version_app,
        ctx.node_mayor,
        ctx.instalador_build.as_deref().unwrap_or("?"),
        ctx.instalador_creado_ms
    ));
    // Restos de una extracción cortada (la app se cerró a medias).
    if let Ok(lector) = fs::read_dir(&dir) {
        for e in lector.flatten() {
            if e.file_name().to_string_lossy().ends_with(c::SUFIJO_EXTRAYENDO) {
                let _ = fs::remove_dir_all(e.path());
            }
        }
    }
    poner(&interno().dir, Some(dir.clone()));
    poner(&interno().ctx, Some(ctx));
    let clave = clave_publica(app);
    if clave.is_none() {
        registrar("sin clave pública del updater: las capas no se pueden verificar y no se usan");
    }
    poner(&interno().clave, clave);
    let e = leer_estado(&dir);
    con_publico(|p| p.aviso = e.aviso.clone());
}

/// Qué servir en este arranque, con sus rutas (el Node siempre es el del instalador).
pub fn elegir(instalador: &l::RutasPaquete) -> (c::Eleccion, l::RutasPaquete) {
    let instalador_solo = || {
        servida(&instalador.dir); // ACT1114H
        (c::Eleccion::Instalador, instalador.clone())
    };
    let (Some(dir), Some(ctx), Some(clave)) = (leer(&interno().dir), leer(&interno().ctx), leer(&interno().clave)) else {
        return instalador_solo();
    };
    let Ok(_g) = interno().cerrojo.lock() else { return instalador_solo() };
    let estado = leer_estado(&dir);
    let mut cache: HashMap<String, Option<c::ResumenCapa>> = HashMap::new();
    for b in [&estado.pendiente, &estado.activa, &estado.anterior].into_iter().flatten() {
        cache.entry(b.clone()).or_insert_with(|| leer_capa(&dir, b, &clave).map(|m| c::ResumenCapa::from(&m)));
    }
    let eleccion = c::elegir(&estado, |b| cache.get(b).cloned().flatten(), &ctx);
    let nuevo = c::al_intentar(&estado, &eleccion);
    if nuevo != estado {
        escribir_estado(&dir, &nuevo);
    }
    poner(&interno().en_uso, eleccion.build().map(str::to_string));
    // La pendiente que se va a probar ya no es «nueva»: es la que arranca.
    let pendiente_valida = nuevo
        .pendiente
        .as_ref()
        .filter(|p| Some(p.as_str()) != eleccion.build() && nuevo.intentos < c::MAX_INTENTOS)
        .and_then(|p| cache.get(p).cloned().flatten());
    con_publico(|p| {
        p.nueva = pendiente_valida.as_ref().map(|r| r.build_id.clone());
        p.nueva_version = pendiente_valida.as_ref().map(version_corta);
    });
    // (ACT1114H) La web de la capa pendiente y la de lo que va a servir este arranque.
    let web_pendiente = pendiente_valida.as_ref().map(|x| web_de_dir(&dir.join(&x.build_id))).filter(r::WebId::conocida);
    if let Ok(mut w) = interno().webs.lock() {
        w.nueva = web_pendiente;
    }
    match &eleccion {
        c::Eleccion::Instalador => {
            servida(&instalador.dir);
            (eleccion, instalador.clone())
        }
        c::Eleccion::Capa { build, .. } => {
            servida(&dir.join(build));
            let rutas = l::rutas_con_dir(instalador.node.clone(), dir.join(build));
            (eleccion, rutas)
        }
    }
}

fn version_corta(r: &c::ResumenCapa) -> String {
    let commit = r.commit.as_deref().map(|x| &x[..x.len().min(7)]);
    match (r.version.as_deref(), commit) {
        (Some(v), Some(k)) => format!("{v} · {k}"),
        (Some(v), None) => v.to_string(),
        (None, Some(k)) => k.to_string(),
        (None, None) => c::corto(&r.build_id).to_string(),
    }
}

/// La capa elegida contestó «listo».
pub fn tras_lista(el: &c::Eleccion) {
    if el.a_prueba() {
        if let Some(e) = cambiar_estado(|e| c::tras_lista(e, el)) {
            registrar(&format!("capa {} activa (anterior: {:?})", el.build().unwrap_or("?"), e.anterior));
            // (ACT1114H) Si venía de un relevo pedido: la build de antes y la de ahora, en el registro.
            let antes = interno().relevo_desde.lock().ok().and_then(|mut g| g.take());
            let w = leer(&interno().webs);
            if let Some(antes) = antes {
                registrar(&r::linea_relevo_hecho(&antes, &w.corre, w.publicada.as_ref()));
            } else {
                registrar(&r::linea_sirve(&w.corre, w.publicada.as_ref()));
            }
            refrescar_publico();
            con_publico(|p| {
                p.aviso = None;
                if p.nueva.as_deref() == el.build() {
                    p.nueva = None;
                    p.nueva_version = None;
                    p.fase = Some("al-dia".into());
                }
            });
        }
    }
}

/// La capa elegida no pasó la salud: mala y vuelta atrás. Su Node ya terminó (no arrancó, o se
/// cayó): su carpeta se borra ya, no se volverá a usar.
pub fn tras_fallo(el: &c::Eleccion, motivo: &str) {
    let Some(build) = el.build() else { return };
    if let Some(e) = cambiar_estado(|e| c::tras_fallo(e, el, motivo)) {
        registrar(e.aviso.as_deref().unwrap_or("capa mala"));
        // (ACT1114H) Un relevo pedido que no se pudo aplicar: sigue lo de antes y se dice por qué.
        let antes = interno().relevo_desde.lock().ok().and_then(|mut g| g.take());
        if let Some(antes) = antes {
            let destino = leer(&interno().webs).corre.etiqueta();
            registrar(&r::linea_relevo_fallido(&antes, &destino, motivo));
        }
        poner(&interno().en_uso, None);
        if let Some(dir) = leer(&interno().dir) {
            if c::build_id_seguro(build) && fs::remove_dir_all(dir.join(build)).is_err() {
                registrar(&format!("no se pudo borrar la capa mala {build}"));
            }
        }
        con_publico(|p| {
            p.aviso = e.aviso.clone();
            if p.nueva.as_deref() == el.build() {
                p.nueva = None;
                p.nueva_version = None;
            }
        });
    }
}

/// Borra las capas que sobran (nunca la activa, la anterior, la pendiente ni la que sirve).
fn limpiar(dir: &Path) {
    let Ok(_g) = interno().cerrojo.lock() else { return };
    let e = leer_estado(dir);
    let presentes: Vec<String> = fs::read_dir(dir)
        .map(|l| {
            l.flatten()
                .filter(|x| x.path().is_dir())
                .map(|x| x.file_name().to_string_lossy().to_string())
                .filter(|n| c::build_id_seguro(n) && n != c::DIR_DESCARGAS)
                .collect()
        })
        .unwrap_or_default();
    let en_uso = leer(&interno().en_uso);
    for b in c::sobrantes(&e, &presentes, en_uso.as_deref()) {
        match fs::remove_dir_all(dir.join(&b)) {
            Ok(()) => registrar(&format!("capa {b} borrada (ya no hace falta)")),
            Err(err) => registrar(&format!("no se pudo borrar la capa {b}: {err}")),
        }
    }
}

// ───────────────────────────── Descarga ─────────────────────────────

fn curl(url: &str) -> std::process::Command {
    let mut cmd = crate::disco::orden("curl");
    cmd.args(["-L", "--fail", "--silent", "--show-error", "--retry", "3", "--connect-timeout", "20"]);
    if !(permitir_local() && url.starts_with("http://127.0.0.1:")) {
        // Solo https, también en las redirecciones (GitHub → objects.githubusercontent.com).
        cmd.args(["--proto", "=https", "--proto-redir", "=https"]);
    }
    // (PTA1108B) Con el proxy de la puerta de internet encendido, la descarga sale por la malla; sin él, igual que siempre.
    cmd.args(crate::puerta_proxy_logica::argumentos_curl(crate::puerta_proxy::proxy_url().as_deref(), url));
    cmd
}

fn salida_curl(o: &std::process::Output) -> String {
    let e = String::from_utf8_lossy(&o.stderr);
    format!("curl terminó con {} ({})", o.status, e.trim().chars().take(200).collect::<String>())
}

fn bajar_bytes(url: &str, tope: u64) -> Result<Vec<u8>, String> {
    let o = curl(url)
        .args(["--max-filesize", &tope.to_string(), "--max-time", "120"])
        .arg(url)
        .output()
        .map_err(|e| format!("no se pudo lanzar curl: {e}"))?;
    if !o.status.success() {
        return Err(salida_curl(&o));
    }
    if o.stdout.len() as u64 > tope {
        return Err("respuesta demasiado grande".into());
    }
    Ok(o.stdout)
}

fn bajar_archivo(url: &str, destino: &Path, tope: u64) -> Result<(), String> {
    let o = curl(url)
        .args(["-C", "-", "--max-filesize", &tope.to_string(), "-o"])
        .arg(destino)
        .arg(url)
        .output()
        .map_err(|e| format!("no se pudo lanzar curl: {e}"))?;
    if o.status.success() {
        Ok(())
    } else {
        Err(format!("{} · se reanudará en el siguiente intento", salida_curl(&o)))
    }
}

/// Escribe y calcula el SHA-256 a la vez.
struct EscritorConHash {
    f: File,
    h: Sha256,
}

impl Write for EscritorConHash {
    fn write(&mut self, b: &[u8]) -> std::io::Result<usize> {
        let n = self.f.write(b)?;
        self.h.update(&b[..n]);
        Ok(n)
    }
    fn flush(&mut self) -> std::io::Result<()> {
        self.f.flush()
    }
}

/// Extrae el .tar.gz en `destino` comprobando CADA archivo contra el manifiesto firmado. Los archivos
/// idénticos a los de `previa` (misma ruta, tamaño y SHA-256) se enlazan (enlace duro) en vez de
/// escribirse otra vez: una capa nueva ocupa solo lo que cambió. Devuelve cuántos se enlazaron.
pub fn extraer(gz: &Path, destino: &Path, m: &c::Manifiesto, previa: Option<(&Path, &c::Manifiesto)>) -> Result<usize, String> {
    let esperados: HashMap<&str, &c::ArchivoCapa> = m.archivos.iter().map(|a| (a.ruta.as_str(), a)).collect();
    let previos: HashMap<&str, &c::ArchivoCapa> =
        previa.map(|(_, pm)| pm.archivos.iter().map(|a| (a.ruta.as_str(), a)).collect()).unwrap_or_default();
    let mut vistos: HashSet<String> = HashSet::with_capacity(esperados.len());
    fs::create_dir_all(destino).map_err(|e| format!("no se pudo crear {}: {e}", destino.display()))?;
    let f = File::open(gz).map_err(|e| format!("no se pudo abrir la capa: {e}"))?;
    let mut tar = c::LectorTar::new(flate2::read::GzDecoder::new(BufReader::with_capacity(1 << 20, f)));
    let mut enlazados = 0usize;
    while let Some(e) = tar.siguiente()? {
        let ruta = ruta_local(destino, &e.ruta);
        if e.tipo == c::TipoEntrada::Carpeta {
            fs::create_dir_all(&ruta).map_err(|x| format!("no se pudo crear {}: {x}", e.ruta))?;
            continue;
        }
        let a = esperados.get(e.ruta.as_str()).ok_or_else(|| format!("«{}» no está en el manifiesto firmado", e.ruta))?;
        if a.bytes != e.bytes {
            return Err(format!("«{}» no tiene el tamaño del manifiesto", e.ruta));
        }
        if !vistos.insert(e.ruta.clone()) {
            return Err(format!("«{}» viene dos veces", e.ruta));
        }
        if let Some(padre) = ruta.parent() {
            fs::create_dir_all(padre).map_err(|x| format!("no se pudo crear la carpeta de {}: {x}", e.ruta))?;
        }
        if let (Some((dir_previa, _)), Some(p)) = (previa, previos.get(e.ruta.as_str())) {
            if p.sha256 == a.sha256 && p.bytes == a.bytes && fs::hard_link(ruta_local(dir_previa, &e.ruta), &ruta).is_ok() {
                enlazados += 1;
                continue;
            }
        }
        // `create_new`: nunca pisa nada (en un disco sin mayúsculas, un choque es un error, no una pérdida).
        let f = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&ruta)
            .map_err(|x| format!("no se pudo escribir {}: {x}", e.ruta))?;
        let mut w = EscritorConHash { f, h: Sha256::new() };
        tar.copiar_datos(&mut w)?;
        w.flush().map_err(|x| format!("no se pudo escribir {}: {x}", e.ruta))?;
        if hex(&w.h.finalize()) != a.sha256 {
            return Err(format!("«{}» no casa con su SHA-256 del manifiesto", e.ruta));
        }
    }
    if vistos.len() != esperados.len() {
        return Err(format!("a la capa le faltan {} archivos del manifiesto", esperados.len() - vistos.len()));
    }
    Ok(enlazados)
}

/// Mira el canal y, si toca, baja, verifica y deja PENDIENTE una capa nueva.
fn buscar() -> Result<(), String> {
    let dir = leer(&interno().dir).ok_or("sin carpeta de capas")?;
    let ctx = leer(&interno().ctx).ok_or("sin contexto")?;
    let clave = leer(&interno().clave).ok_or("sin clave pública del updater")?;
    con_publico(|p| p.fase = Some("buscando".into()));
    let texto_canal = bajar_bytes(&url_canal(), c::TOPE_CANAL)?;
    let canal = canal_de_json(&serde_json::from_slice(&texto_canal).map_err(|e| format!("canal ilegible: {e}"))?)?;
    let estado = leer_estado(&dir);
    let mas_reciente = [estado.activa.as_deref(), estado.pendiente.as_deref()]
        .into_iter()
        .flatten()
        .filter_map(|b| leer_capa(&dir, b, &clave))
        .map(|m| m.creado_ms)
        .fold(ctx.instalador_creado_ms, u64::max);
    if let c::Decision::AlDia(por_que) = c::decidir(&canal, &estado, &ctx, mas_reciente) {
        registrar(&format!("al día: {por_que}"));
        con_publico(|p| p.fase = Some("al-dia".into()));
        limpiar(&dir);
        return Ok(());
    }
    let b = canal.build_id.clone();
    let nombre_m = c::nombre_manifiesto(&b);
    if !c::url_de(&canal.manifiesto, &nombre_m, permitir_local()) {
        return Err("el canal apunta a un manifiesto que no es el de esa capa".into());
    }
    let bytes_m = bajar_bytes(&canal.manifiesto, c::TOPE_MANIFIESTO)?;
    verificar_firma(&bytes_m, &canal.firma, &clave, &nombre_m)?;
    let m = manifiesto_de_json(&serde_json::from_slice(&bytes_m).map_err(|e| format!("manifiesto ilegible: {e}"))?)?;
    c::validar_manifiesto(&m, &canal, &ctx, permitir_local())?;
    let version = version_corta(&c::ResumenCapa::from(&m));
    registrar(&format!("capa nueva {b} ({version}): manifiesto firmado y válido, {} archivos", m.total_archivos));

    let descargas = dir.join(c::DIR_DESCARGAS);
    fs::create_dir_all(&descargas).map_err(|e| format!("no se pudo crear {}: {e}", descargas.display()))?;
    let parcial = descargas.join(format!("{}.parcial", m.archivo_nombre));
    // Solo una descarga a medias: la de esta capa.
    if let Ok(l) = fs::read_dir(&descargas) {
        for x in l.flatten() {
            if x.path() != parcial {
                let _ = fs::remove_file(x.path());
            }
        }
    }
    let mut ya = fs::metadata(&parcial).map(|x| x.len()).unwrap_or(0);
    if ya > m.archivo_bytes {
        let _ = fs::remove_file(&parcial);
        ya = 0;
    }
    let libre = crate::disco::espacio_libre(&dir).ok_or("no se pudo medir el disco libre: no se baja a ciegas")?;
    if !c::cabe(libre, &m, ya) {
        return Err(format!(
            "no cabe: la capa necesita {} MB y quedan {} MB libres",
            (m.archivo_bytes - ya + m.total_bytes + c::MARGEN_DISCO) >> 20,
            libre >> 20
        ));
    }
    con_publico(|p| {
        p.fase = Some("descargando".into());
        p.nueva_version = p.nueva_version.clone().or(Some(version.clone()));
    });
    if ya < m.archivo_bytes {
        bajar_archivo(&canal.archivo, &parcial, c::TOPE_ARCHIVO)?;
    }
    con_publico(|p| p.fase = Some("verificando".into()));
    let (sha, n) = sha256_archivo(&parcial).map_err(|e| format!("no se pudo leer la descarga: {e}"))?;
    if n != m.archivo_bytes || sha != m.archivo_sha256 {
        let _ = fs::remove_file(&parcial);
        return Err("el archivo bajado no casa con el SHA-256 del manifiesto firmado: se borró".into());
    }
    let tmp = dir.join(format!("{b}{}", c::SUFIJO_EXTRAYENDO));
    let _ = fs::remove_dir_all(&tmp);
    let previa_build = leer(&interno().en_uso).or(estado.activa.clone());
    let previa = previa_build.as_deref().and_then(|p| leer_capa(&dir, p, &clave).map(|pm| (dir.join(p), pm)));
    let resultado = extraer(&parcial, &tmp, &m, previa.as_ref().map(|(d, pm)| (d.as_path(), pm))).and_then(|enlazados| {
        fs::write(tmp.join(c::MANIFIESTO_EN_CAPA), &bytes_m).map_err(|e| e.to_string())?;
        fs::write(tmp.join(c::FIRMA_EN_CAPA), canal.firma.as_bytes()).map_err(|e| e.to_string())?;
        let final_ = dir.join(&b);
        let _ = fs::remove_dir_all(&final_);
        fs::rename(&tmp, &final_).map_err(|e| format!("no se pudo colocar la capa: {e}"))?;
        Ok(enlazados)
    });
    let enlazados = match resultado {
        Ok(n) => n,
        Err(e) => {
            let _ = fs::remove_dir_all(&tmp);
            let _ = fs::remove_file(&parcial);
            return Err(format!("la capa {b} se descartó: {e}"));
        }
    };
    let _ = fs::remove_file(&parcial);
    cambiar_estado(|e| c::al_verificar(e, &b));
    registrar(&format!("capa {b} lista ({} archivos, {enlazados} reutilizados de la anterior)", m.total_archivos));
    con_publico(|p| {
        p.fase = Some("lista".into());
        p.nueva = Some(b.clone());
        p.nueva_version = Some(version.clone());
    });
    // (ACT1114H) La web que trae esa capa (su public/version.json, ya verificado por SHA contra el manifiesto firmado).
    let web_nueva = web_de_dir(&dir.join(&b));
    if let Ok(mut w) = interno().webs.lock() {
        w.nueva = web_nueva.conocida().then_some(web_nueva);
    }
    refrescar_publico();
    limpiar(&dir);
    Ok(())
}

/// Arranca (una vez) el hilo que mira el canal.
pub fn iniciar_vigia(app: &AppHandle) {
    if interno().vigia.swap(true, Ordering::SeqCst) {
        return;
    }
    if leer(&interno().clave).is_none() || leer(&interno().dir).is_none() {
        return;
    }
    let _ = app;
    let _ = std::thread::Builder::new().name("servidor-capas".into()).spawn(move || {
        // (ACT1114H) Dos relojes: el del canal (primera mirada y luego cada 6 h) y el de la web PUBLICADA (cada 5 min,
        // como ACT1113F). Si la publicada no es lo que corre y no hay capa lista, se mira el canal ya, sin esperar 6 h.
        let mut prox_capas = ahora_ms() + primera_mirada_ms();
        let mut prox_web = ahora_ms() + r::MIRAR_WEB_PRIMERA_MS;
        loop {
            if !dormir(1000) {
                return;
            }
            let ahora = ahora_ms();
            // (En depuración, con un canal propio en 127.0.0.1, no hace falta internet.)
            let canal_local = permitir_local() && url_canal().starts_with("http://127.0.0.1:");
            let mut ya = false;
            if ahora >= prox_web {
                prox_web = ahora + r::MIRAR_WEB_MS;
                if !canal_local && crate::servidor_local::hay_internet() {
                    ya = mirar_publicada(ahora);
                }
            }
            if !ya && ahora < prox_capas {
                continue;
            }
            poner(&interno().ultima_busqueda, ahora);
            let espera = if !canal_local && !crate::servidor_local::hay_internet() {
                con_publico(|p| {
                    if p.fase.as_deref() != Some("lista") {
                        p.fase = Some("sin-red".into());
                    }
                });
                c::REINTENTO_MS
            } else {
                match buscar() {
                    Ok(()) => c::CADA_MS,
                    Err(e) => {
                        registrar(&format!("no se pudo actualizar la capa: {e}"));
                        // (ACT1114H) Si la publicada no se puede aplicar, queda dicho una vez con su motivo.
                        let w = leer(&interno().webs);
                        if let Some(p) = &w.publicada {
                            if !r::misma(p, &w.corre) {
                                registrar_una_vez(&format!(
                                    "la web publicada web={} NO se pudo traer: sigue web={}: {e}",
                                    p.etiqueta(),
                                    w.corre.etiqueta()
                                ));
                            }
                        }
                        con_publico(|p| {
                            p.fase = Some("error".into());
                            p.aviso = Some(format!("No se pudo traer la capa nueva del servidor: {e}"));
                        });
                        c::REINTENTO_MS
                    }
                }
            };
            prox_capas = ahora_ms() + espera;
            refrescar_publico();
        }
    });
}

/// Duerme `ms` a pasos de 1 s; false si la app se está cerrando.
fn dormir(ms: u64) -> bool {
    let mut quedan = ms;
    while quedan > 0 {
        if crate::servidor_local::apagando() {
            return false;
        }
        let paso = quedan.min(1000);
        std::thread::sleep(Duration::from_millis(paso));
        quedan -= paso;
    }
    !crate::servidor_local::apagando()
}

// ───────────────────────────────── Pruebas ─────────────────────────────────
// (Con cargo, en el crate real: usan minisign-verify, flate2 y serde_json.)

#[cfg(test)]
mod pruebas {
    use super::*;

    /// Clave y firma de PRUEBA (generadas solo para esto con `tauri signer generate`; la privada no
    /// se guardó en ningún sitio). La firma es de `servidor-capa-B1.json` con el contenido de abajo.
    const CLAVE_PRUEBA: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDIzRjU4RDczRENCMUMyNzcKUldSM3dySGNjNDMxSTRPaVl3UTZCbXhLQjJDTzVIbG5oR1dlL05pa1R0QkZvaEk0WTN4dVZib0gK";
    const FIRMA_PRUEBA: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVSM3dySGNjNDMxSXplMTdjaWNwQi9rUkdJRU5vY1FVaU5RQ1MzNFdmT0N4ZUlmS0xOcmp6OGJab0NsdGd1NHlYNzNlTHRGVktwZ2dZTndMc1M5Tmluayt0SjFUZGxVTHdnPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzk0MDc4NzEyCWZpbGU6c2Vydmlkb3ItY2FwYS1CMS5qc29uCktZbXJaN2k3Q3Nxb2lTRHRURExQdncyWXVCOUxUd2NjUmorL0xTZTUyWTVXQkhkWE94ekUzUHgyaFhKZTBxV1FNTGZoT0R1Y2NWVWZROTdxbWs3UkFBPT0K";

    #[test]
    fn json_del_canal_del_manifiesto_y_del_estado() {
        let v: Value = serde_json::from_str(
            r#"{"formato":1,"build_id":"B1","version":"0.3.0","commit":"abc","creado_ms":5,"app_minima":"0.5.0","protocolo":1,
                "manifiesto":"https://x/servidor-capa-B1.json","firma":"Zg==","archivo":"https://x/servidor-capa-B1.tar.gz","bytes":9,"sha256":"aa"}"#,
        )
        .unwrap();
        let canal = canal_de_json(&v).unwrap();
        assert_eq!((canal.build_id.as_str(), canal.creado_ms, canal.protocolo, canal.bytes), ("B1", 5, 1, 9));
        assert!(canal_de_json(&json!({"formato": 1})).unwrap_err().contains("build_id"));
        let m: Value = serde_json::from_str(
            r#"{"formato":1,"build_id":"B1","creado_ms":5,"app_minima":"0.5.0","protocolo":1,"node_mayor":22,
                "archivo":{"nombre":"servidor-capa-B1.tar.gz","bytes":9,"sha256":"aa"},"total":{"archivos":1,"bytes":3},
                "archivos":[["server.js",3,"bb"]]}"#,
        )
        .unwrap();
        let m = manifiesto_de_json(&m).unwrap();
        assert_eq!(m.archivos, vec![c::ArchivoCapa { ruta: "server.js".into(), bytes: 3, sha256: "bb".into() }]);
        assert_eq!((m.node_mayor, m.total_archivos, m.archivo_bytes), (22, 1, 9));
        assert!(manifiesto_de_json(&json!({"formato": 1, "archivos": [["a", 1]]})).is_err());
        let e = c::EstadoCapas {
            activa: Some("A".into()),
            anterior: None,
            pendiente: Some("P".into()),
            intentos: 2,
            malas: vec!["M".into()],
            aviso: Some("x".into()),
        };
        assert_eq!(estado_de_json(&estado_a_json(&e)), e);
        // Lo que no es un build seguro no entra en el estado.
        let raro = estado_de_json(&json!({"activa": "../x", "malas": ["ok", "a/b"]}));
        assert_eq!((raro.activa, raro.malas), (None, vec!["ok".to_string()]));
    }

    #[test]
    fn firma_minisign_de_tauri_signer() {
        // Firmado con la clave de prueba: `tauri signer sign servidor-capa-B1.json`.
        let datos = b"{\"formato\":1,\"build_id\":\"B1\"}\n";
        let firma = FIRMA_PRUEBA;
        assert_eq!(verificar_firma(datos, firma, CLAVE_PRUEBA, "servidor-capa-B1.json"), Ok(()));
        // Otro contenido, otro nombre, otra clave o basura: no.
        assert!(verificar_firma(b"{\"formato\":1,\"build_id\":\"B2\"}\n", firma, CLAVE_PRUEBA, "servidor-capa-B1.json").is_err());
        assert!(verificar_firma(datos, firma, CLAVE_PRUEBA, "servidor-capa-B2.json").unwrap_err().contains("no es la de"));
        let clave_app = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEVGNzA5QzREOUMzOTFDRTUKUldUbEhEbWNUWnh3N3dCUlpQNmtIM05NOUs3Mmt0TkRzRXFleHdzYmlIaUVHd2poWDluM1JsVFQK";
        assert!(verificar_firma(datos, firma, clave_app, "servidor-capa-B1.json").is_err());
        assert!(verificar_firma(datos, "no!", CLAVE_PRUEBA, "servidor-capa-B1.json").is_err());
        assert!(verificar_firma(datos, firma, "no!", "servidor-capa-B1.json").is_err());
    }

    fn tar_gz(entradas: &[(&str, &[u8])]) -> Vec<u8> {
        // Como capa.mjs: cabeceras ustar, archivos 0644, dos bloques finales; gzip.
        let mut t = Vec::new();
        for (ruta, datos) in entradas {
            let mut c = [0u8; 512];
            c[..ruta.len()].copy_from_slice(ruta.as_bytes());
            c[100..108].copy_from_slice(b"0000644\0");
            c[108..116].copy_from_slice(b"0000000\0");
            c[116..124].copy_from_slice(b"0000000\0");
            c[124..136].copy_from_slice(format!("{:011o}\0", datos.len()).as_bytes());
            c[136..148].copy_from_slice(b"00000000000\0");
            c[156] = b'0';
            c[257..265].copy_from_slice(b"ustar\x0000");
            c[148..156].copy_from_slice(b"        ");
            let suma: u64 = c.iter().map(|&b| b as u64).sum();
            c[148..156].copy_from_slice(format!("{suma:06o}\0 ").as_bytes());
            t.extend_from_slice(&c);
            t.extend_from_slice(datos);
            t.resize(t.len().div_ceil(512) * 512, 0);
        }
        t.extend_from_slice(&[0u8; 1024]);
        let mut gz = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        gz.write_all(&t).unwrap();
        gz.finish().unwrap()
    }

    fn manifiesto(entradas: &[(&str, &[u8])]) -> c::Manifiesto {
        let mut archivos: Vec<c::ArchivoCapa> = entradas
            .iter()
            .map(|(r, d)| c::ArchivoCapa { ruta: r.to_string(), bytes: d.len() as u64, sha256: hex(&crate::sha256::sha256(d)) })
            .collect();
        archivos.sort_by(|a, b| a.ruta.cmp(&b.ruta));
        c::Manifiesto { total_archivos: archivos.len(), archivos, ..Default::default() }
    }

    fn carpeta(nombre: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("ss-capas-{nombre}-{}-{}", std::process::id(), ahora_ms()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn extrae_verificando_cada_archivo_y_reutiliza_la_anterior() {
        let base = carpeta("extraer");
        let v1: Vec<(&str, &[u8])> = vec![("server.js", b"uno"), (".next/BUILD_ID", b"B1"), ("node_modules/x/index.js", b"igual")];
        let gz1 = base.join("1.tar.gz");
        fs::write(&gz1, tar_gz(&v1)).unwrap();
        let m1 = manifiesto(&v1);
        let d1 = base.join("B1");
        assert_eq!(extraer(&gz1, &d1, &m1, None), Ok(0));
        assert_eq!(fs::read(d1.join("node_modules").join("x").join("index.js")).unwrap(), b"igual");

        // La segunda reutiliza lo que no cambió (enlace duro) y escribe lo nuevo.
        let v2: Vec<(&str, &[u8])> = vec![("server.js", b"dos"), (".next/BUILD_ID", b"B2"), ("node_modules/x/index.js", b"igual")];
        let gz2 = base.join("2.tar.gz");
        fs::write(&gz2, tar_gz(&v2)).unwrap();
        let m2 = manifiesto(&v2);
        let d2 = base.join("B2");
        assert_eq!(extraer(&gz2, &d2, &m2, Some((&d1, &m1))), Ok(1));
        assert_eq!(fs::read(d2.join("server.js")).unwrap(), b"dos");
        assert_eq!(fs::read(d2.join("node_modules").join("x").join("index.js")).unwrap(), b"igual");
        // Borrar la anterior no rompe la nueva.
        fs::remove_dir_all(&d1).unwrap();
        assert_eq!(fs::read(d2.join("node_modules").join("x").join("index.js")).unwrap(), b"igual");

        // Un archivo que no casa con su SHA-256, uno que no está en la lista o uno que falta: fuera.
        let mut malo = m2.clone();
        malo.archivos[0].sha256 = "0".repeat(64);
        assert!(extraer(&gz2, &base.join("x1"), &malo, None).unwrap_err().contains("SHA-256"));
        let mut corto = m2.clone();
        corto.archivos.retain(|a| a.ruta != "server.js");
        assert!(extraer(&gz2, &base.join("x2"), &corto, None).unwrap_err().contains("no está en el manifiesto"));
        let mut largo = m2.clone();
        largo.archivos.push(c::ArchivoCapa { ruta: "zz.js".into(), bytes: 1, sha256: "0".repeat(64) });
        assert!(extraer(&gz2, &base.join("x3"), &largo, None).unwrap_err().contains("faltan 1"));
        // No es un gzip.
        fs::write(base.join("no.tar.gz"), b"hola").unwrap();
        assert!(extraer(&base.join("no.tar.gz"), &base.join("x4"), &m2, None).is_err());
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn estado_atomico_en_disco() {
        let d = carpeta("estado");
        assert_eq!(leer_estado(&d), c::EstadoCapas::default());
        let e = c::EstadoCapas { activa: Some("A".into()), ..Default::default() };
        escribir_estado(&d, &e);
        assert_eq!(leer_estado(&d), e);
        assert!(!d.join(format!("{}.tmp", c::ESTADO)).exists());
        fs::write(d.join(c::ESTADO), b"{roto").unwrap();
        assert_eq!(leer_estado(&d), c::EstadoCapas::default());
        let _ = fs::remove_dir_all(&d);
    }
}
