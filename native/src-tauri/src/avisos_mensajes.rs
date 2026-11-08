// ═══════════════════════════════════════════════════════════════════════════
// avisos_mensajes — notificaciones del SISTEMA para los mensajes nuevos (NOT1108A, 2026-11-08).
// ---------------------------------------------------------------------------
// Contrato: architecture/avisos-mensajes.md.
//
// Caso real (08-11): Alex mandó un mensaje de prueba entre la Mac y la tableta (Mensajes › Neuronas, por el
// enlace local de la malla) y no le llegó ningún aviso: ni dentro del OS estando en otra sección ni fuera de
// la app, en las notificaciones del aparato. La web ya recibía el mensaje (buzon.ts) pero nadie lo avisaba.
//
//   · `aviso_mensaje` (la web, por cada mensaje nuevo): si la web decide que hace falta aviso del sistema
//     (ventana sin foco u oculta, app en segundo plano), lo enseña con tauri-plugin-notification (escritorio:
//     el centro de notificaciones del sistema; Android: el canal «Mensajes», importancia alta). Con o sin
//     aviso, apunta el id: así el respaldo nativo de abajo no avisa dos veces.
//   · Pulsar la notificación (`tap`, plugin 2.8): enfoca la ventana (escritorio; en Android el plugin abre la
//     app), deja la ruta del chat como PENDIENTE y la emite (`starseed://aviso-abrir`): la web abre ese chat.
//     Si la web no estaba viva para oírlo, la pide al volver (`avisos_pendiente`).
//   · Respaldo nativo: un mensaje de una neurona que llega por el canal local (TCP 47071, `malla_local.rs`) y
//     que la web no apunta en `ESPERA_RESPALDO_MS` (la WebView no existe: se quitó la app de recientes con el
//     servicio «Segundo plano» vivo; o su JS está congelado) lo avisa Rust con los mismos filtros que la web
//     (para esta neurona, no un eco, chat no silenciado), que la web le pasa con `avisos_config`.
//   · `avisos_estado` / `avisos_pedir_permiso`: el permiso del sistema (Android 13+: POST_NOTIFICATIONS) y lo
//     que se sabe, para «Probar notificaciones» en Ajustes.
// ═══════════════════════════════════════════════════════════════════════════

use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

/// Canal de Android de los mensajes (lo crea la app la primera vez que avisa).
pub const CANAL_ANDROID: &str = "mensajes";
/// Evento que recibe la web al pulsar una notificación: la ruta del chat.
pub const EVENTO_ABRIR: &str = "starseed://aviso-abrir";
/// Lo que espera Rust a que la web apunte un mensaje del canal local antes de avisarlo él.
pub const ESPERA_RESPALDO_MS: u64 = 6_000;
/// Una ruta pendiente (de una notificación pulsada) caduca: no se abre un chat de hace horas.
pub const PENDIENTE_VALIDA_MS: u64 = 10 * 60_000;
/// Archivo de la configuración de avisos en `<app_data>/` (sobrevive a la WebView).
pub const ARCHIVO_CONFIG: &str = "avisos-mensajes.json";
const MAX_VISTOS: usize = 500;
const MAX_RUTAS: usize = 64;

// ───────────────────────────── Lógica pura ─────────────────────────────

/// Lo que la web le cuenta a Rust para el respaldo nativo (los mismos filtros que `buzon.ts`).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct ConfigAvisos {
    /// Id de neurona de este aparato en el origen de la app.
    pub neurona: Option<String>,
    /// Cuenta con sesión.
    pub uid: Option<String>,
    /// Claves de chat silenciadas (`n:<id>`, `c:<uid>`, `dm:<hilo>`).
    #[serde(default)]
    pub silenciados: Vec<String>,
    /// La persona quiere avisos del sistema para los mensajes.
    #[serde(default = "verdadero")]
    pub sistema: bool,
}

fn verdadero() -> bool {
    true
}

/// Un mensaje de neurona leído de una trama del canal local (`tu.msg` del canal «neurona»).
#[derive(Debug, Clone, PartialEq, Default)]
pub struct MensajeNeurona {
    pub mid: String,
    pub texto: String,
    pub nombre: Option<String>,
    pub de_n: Option<String>,
    pub de_u: Option<String>,
    pub para_n: Option<String>,
    pub para_u: Option<String>,
    pub archivo: Option<String>,
    pub llamada: bool,
    pub flujo: Option<String>,
}

/// El aviso que se enseña.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct AvisoNativo {
    pub id: String,
    pub clave: String,
    pub titulo: String,
    pub cuerpo: String,
    pub ruta: String,
}

fn texto_corto(v: Option<&serde_json::Value>, max: usize) -> Option<String> {
    let s = v?.as_str()?.trim();
    if s.is_empty() || s.chars().count() > max {
        return None;
    }
    Some(s.to_string())
}

fn leer_tu(o: &serde_json::Value) -> Option<MensajeNeurona> {
    if o.get("t")?.as_str()? != "tu.msg" || o.get("c")?.as_str()? != "neurona" {
        return None;
    }
    let b = o.get("b")?;
    let mid = texto_corto(b.get("mid"), 80)?;
    let texto = b.get("txt").and_then(|t| t.as_str()).unwrap_or("").chars().take(4000).collect::<String>();
    let de = b.get("de");
    let para = b.get("para");
    Some(MensajeNeurona {
        mid,
        texto,
        nombre: texto_corto(de.and_then(|d| d.get("nom")), 60),
        de_n: texto_corto(de.and_then(|d| d.get("n")), 80),
        de_u: texto_corto(de.and_then(|d| d.get("u")), 80),
        para_n: texto_corto(para.and_then(|d| d.get("n")), 80),
        para_u: texto_corto(para.and_then(|d| d.get("u")), 80),
        archivo: b.get("adj").map(|a| texto_corto(a.get("nombre"), 200).unwrap_or_else(|| "un archivo".into())),
        llamada: b.get("ll").is_some(),
        flujo: b.get("fd").map(|f| texto_corto(f.get("nombre"), 120).unwrap_or_else(|| "sin nombre".into())),
    })
}

/// Los mensajes de neurona de una trama del canal local (`tu.msg` suelto o dentro de un `nl.lote`).
pub fn leer_mensajes_neurona(cuerpo: &str) -> Vec<MensajeNeurona> {
    if !cuerpo.starts_with("{\"t\":\"tu.") && !cuerpo.starts_with("{\"t\":\"nl.lote\"") {
        return Vec::new();
    }
    let Ok(o) = serde_json::from_str::<serde_json::Value>(cuerpo) else { return Vec::new() };
    if o.get("t").and_then(|t| t.as_str()) == Some("nl.lote") {
        return o
            .get("m")
            .and_then(|m| m.as_array())
            .map(|v| {
                v.iter()
                    .take(64)
                    .filter_map(|t| t.as_str())
                    .filter_map(|t| serde_json::from_str::<serde_json::Value>(t).ok())
                    .filter_map(|x| leer_tu(&x))
                    .collect()
            })
            .unwrap_or_default();
    }
    leer_tu(&o).into_iter().collect()
}

/// Clave de la conversación (la regla de `claveEntrante` de bandeja.ts).
pub fn clave_entrante(m: &MensajeNeurona, mi_uid: Option<&str>) -> Option<String> {
    if let (Some(u), Some(yo)) = (m.de_u.as_deref(), mi_uid) {
        if u != yo {
            return Some(format!("c:{u}"));
        }
    }
    if let Some(n) = &m.de_n {
        return Some(format!("n:{n}"));
    }
    match (m.de_u.as_deref(), mi_uid) {
        (Some(u), yo) if Some(u) != yo => Some(format!("c:{u}")),
        _ => None,
    }
}

/// Codifica un componente de URL (todo menos `A-Z a-z 0-9 - . _ ~`).
fn codificar(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'.' | b'_' | b'~') {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

/// La ruta de la web que abre ese chat (la misma que `rutaChat` de avisos-mensajes.ts).
pub fn ruta_chat(clave: &str) -> String {
    match clave.strip_prefix("dm:") {
        Some(hilo) => format!("/messages?vista=mensajes&hilo={}", codificar(hilo)),
        None => format!("/messages?vista=neuronas&neurona={}", codificar(clave)),
    }
}

/// Una ruta interna de la web y nada más (nunca otra web ni un esquema raro).
pub fn ruta_valida(r: &str) -> bool {
    r.starts_with('/') && !r.starts_with("//") && !r.contains('\\') && r.len() <= 400 && !r.chars().any(char::is_control)
}

/// Título y cuerpo del aviso.
pub fn texto_aviso(m: &MensajeNeurona) -> (String, String) {
    let titulo = m.nombre.clone().unwrap_or_else(|| "Una neurona".into());
    let cuerpo = if m.llamada {
        "Te está llamando.".to_string()
    } else if let Some(a) = &m.archivo {
        format!("Te manda «{a}».")
    } else if let Some(f) = &m.flujo {
        format!("Empezó una transmisión en vivo («{f}»).")
    } else {
        let t: String = m.texto.trim().chars().take(180).collect();
        if t.is_empty() {
            "Mensaje nuevo.".into()
        } else {
            t
        }
    };
    (titulo, cuerpo)
}

/// El aviso del respaldo nativo, o None si no toca (otra neurona, eco, silenciado, avisos apagados).
pub fn decidir_respaldo(m: &MensajeNeurona, cfg: &ConfigAvisos) -> Option<AvisoNativo> {
    if !cfg.sistema {
        return None;
    }
    let neurona = cfg.neurona.as_deref();
    let uid = cfg.uid.as_deref();
    if let (Some(para), Some(yo)) = (m.para_n.as_deref(), neurona) {
        if para != yo {
            return None;
        }
    }
    if m.para_n.is_none() {
        if let (Some(para), Some(yo)) = (m.para_u.as_deref(), uid) {
            if para != yo {
                return None;
            }
        }
    }
    if let (Some(de), Some(yo)) = (m.de_n.as_deref(), neurona) {
        if de == yo {
            return None;
        }
    }
    let clave = clave_entrante(m, uid)?;
    if cfg.silenciados.iter().any(|s| s == &clave) {
        return None;
    }
    let (titulo, cuerpo) = texto_aviso(m);
    Some(AvisoNativo { id: m.mid.clone(), ruta: ruta_chat(&clave), clave, titulo, cuerpo })
}

/// Id numérico estable de la notificación (positivo, distinto de 0): FNV-1a de 32 bits.
pub fn id_notificacion(id: &str) -> i32 {
    let mut h: u32 = 0x811c_9dc5;
    for b in id.bytes() {
        h ^= u32::from(b);
        h = h.wrapping_mul(0x0100_0193);
    }
    let v = (h & 0x7fff_ffff) as i32;
    if v == 0 {
        1
    } else {
        v
    }
}

/// Ids ya vistos (cola con tope): `apuntar` devuelve si era nuevo.
#[derive(Debug, Default)]
pub struct Vistos {
    cola: VecDeque<String>,
}

impl Vistos {
    pub fn contiene(&self, id: &str) -> bool {
        self.cola.iter().any(|x| x == id)
    }
    pub fn apuntar(&mut self, id: &str) -> bool {
        if self.contiene(id) {
            return false;
        }
        self.cola.push_back(id.to_string());
        while self.cola.len() > MAX_VISTOS {
            self.cola.pop_front();
        }
        true
    }
}

/// El permiso del sistema en una palabra («concedido», «denegado», «preguntar»).
pub fn permiso_texto(p: &tauri_plugin_notification::PermissionState) -> &'static str {
    use tauri_plugin_notification::PermissionState as P;
    match p {
        P::Granted => "concedido",
        P::Denied => "denegado",
        P::Prompt | P::PromptWithRationale => "preguntar",
    }
}

// ───────────────────────────── Estado ─────────────────────────────

#[derive(Default)]
struct Estado {
    /// Mensajes que la web ya apuntó (con o sin aviso).
    apuntados: Vistos,
    /// Mensajes ya avisados por el sistema.
    avisados: Vistos,
    /// id de notificación → ruta del chat.
    rutas: VecDeque<(i32, String)>,
    /// La ruta de la última notificación pulsada (y cuándo).
    pendiente: Option<(String, u64)>,
    config: ConfigAvisos,
    config_leida: bool,
    ultimo_error: Option<String>,
}

fn estado() -> &'static Mutex<Estado> {
    static E: OnceLock<Mutex<Estado>> = OnceLock::new();
    E.get_or_init(|| Mutex::new(Estado::default()))
}

fn con<T>(f: impl FnOnce(&mut Estado) -> T) -> T {
    let mut g = match estado().lock() {
        Ok(g) => g,
        Err(e) => e.into_inner(),
    };
    f(&mut g)
}

fn ahora_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn ruta_config(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join(ARCHIVO_CONFIG))
}

fn config(app: &AppHandle) -> ConfigAvisos {
    let leida = con(|e| e.config_leida.then(|| e.config.clone()));
    if let Some(c) = leida {
        return c;
    }
    let c = ruta_config(app)
        .and_then(|r| std::fs::read_to_string(r).ok())
        .and_then(|t| serde_json::from_str::<ConfigAvisos>(&t).ok())
        .unwrap_or(ConfigAvisos { sistema: true, ..Default::default() });
    con(|e| {
        e.config = c.clone();
        e.config_leida = true;
    });
    c
}

// ───────────────────────────── Enseñar y pulsar ─────────────────────────────

#[cfg(target_os = "android")]
fn asegurar_canal(app: &AppHandle) {
    use tauri_plugin_notification::{Channel, Importance, NotificationExt};
    static HECHO: AtomicBool = AtomicBool::new(false);
    if HECHO.swap(true, Ordering::SeqCst) {
        return;
    }
    let canal = Channel::builder(CANAL_ANDROID, "Mensajes")
        .description("Mensajes nuevos de tus chats y de tus neuronas.")
        .importance(Importance::High)
        .vibration(true)
        .build();
    if app.notification().create_channel(canal).is_err() {
        HECHO.store(false, Ordering::SeqCst);
    }
}

fn mostrar(app: &AppHandle, a: &AvisoNativo) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    if !con(|e| e.avisados.apuntar(&a.id)) {
        return Ok(()); // ya se avisó (llegó por dos caminos)
    }
    let id = id_notificacion(&a.id);
    #[cfg(target_os = "android")]
    asegurar_canal(app);
    let b = app
        .notification()
        .builder()
        .id(id)
        .title(a.titulo.clone())
        .body(a.cuerpo.clone())
        .extra("ruta", a.ruta.clone())
        .extra("clave", a.clave.clone());
    #[cfg(target_os = "android")]
    let b = b.channel_id(CANAL_ANDROID).auto_cancel();
    let r = b.show().map_err(|e| e.to_string());
    con(|e| {
        e.rutas.retain(|(i, _)| *i != id);
        e.rutas.push_back((id, a.ruta.clone()));
        while e.rutas.len() > MAX_RUTAS {
            e.rutas.pop_front();
        }
        e.ultimo_error = r.as_ref().err().cloned();
    });
    r
}

/// Se registra una vez (setup): pulsar una notificación de la app abre su chat.
pub fn iniciar(app: &AppHandle) {
    use tauri_plugin_notification::NotificationExt;
    static REGISTRADO: AtomicBool = AtomicBool::new(false);
    if REGISTRADO.swap(true, Ordering::SeqCst) {
        return;
    }
    let h = app.clone();
    let r = app.notification().on_action(move |hecho| {
        if hecho.action_id() != "tap" {
            return;
        }
        let n = hecho.notification();
        let por_extra = n.and_then(|n| n.extra().get("ruta")).and_then(|v| v.as_str()).map(str::to_string);
        let por_id = n.and_then(|n| con(|e| e.rutas.iter().rev().find(|(i, _)| *i == n.id()).map(|(_, r)| r.clone())));
        let ruta = por_extra.or(por_id).or_else(|| con(|e| e.rutas.back().map(|(_, r)| r.clone())));
        let Some(ruta) = ruta.filter(|r| ruta_valida(r)) else { return };
        con(|e| e.pendiente = Some((ruta.clone(), ahora_ms())));
        #[cfg(desktop)]
        {
            if let Some(v) = h.get_webview_window("main") {
                let _ = v.show();
                let _ = v.unminimize();
                let _ = v.set_focus();
            }
        }
        let _ = h.emit(EVENTO_ABRIR, ruta);
    });
    if let Err(e) = r {
        con(|s| s.ultimo_error = Some(format!("no se pudo escuchar la pulsación: {e}")));
    }
}

/// Respaldo nativo: una trama del canal local con mensajes de neurona. Si la web no los apunta a tiempo,
/// los avisa Rust. Lo llama `malla_local.rs` con cada trama recibida. Solo de una IP que el faro reconoce
/// como neurona DE ESTA CUENTA (clave de faro) y, si el faro dice qué neurona es, solo con ese remitente:
/// cualquiera de la red local puede escribir al puerto 47071 y no debe poder inventar avisos.
pub fn al_recibir_local(app: &AppHandle, ip: &str, cuerpo: &str) {
    let mut mensajes = leer_mensajes_neurona(cuerpo);
    if mensajes.is_empty() {
        return;
    }
    let Some(g) = crate::antenas::Guardian::actual() else { return };
    let Some(vecino) = g.estado().vecinos.into_iter().find(|v| v.ip == ip && v.propia) else { return };
    mensajes.retain(|m| match (vecino.neurona.as_deref(), m.de_n.as_deref()) {
        (Some(a), Some(b)) => a == b,
        (Some(_), None) => false,
        _ => true,
    });
    if mensajes.is_empty() {
        return;
    }
    let h = app.clone();
    let _ = std::thread::Builder::new().name("avisos-respaldo".into()).spawn(move || {
        std::thread::sleep(Duration::from_millis(ESPERA_RESPALDO_MS));
        let cfg = config(&h);
        for m in mensajes {
            if con(|e| e.apuntados.contiene(&m.mid)) {
                continue; // la web lo recibió: ella decide
            }
            if let Some(a) = decidir_respaldo(&m, &cfg) {
                let _ = mostrar(&h, &a);
            }
        }
    });
}

// ───────────────────────────── Comandos ─────────────────────────────

#[derive(Serialize, Clone, Debug)]
pub struct ResultadoAviso {
    /// Se enseñó una notificación del sistema.
    pub mostrada: bool,
    /// Por qué no (o el error del sistema).
    pub motivo: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct EstadoAvisos {
    /// "macos" | "windows" | "linux" | "android" | "ios"
    pub plataforma: String,
    /// "concedido" | "denegado" | "preguntar" | "desconocido"
    pub permiso: String,
    /// Canal de Android de los mensajes (None en escritorio).
    pub canal: Option<String>,
    /// La ventana principal tiene el foco (None si no se sabe: Android).
    pub enfocada: Option<bool>,
    /// Hay una notificación pulsada esperando a abrir su chat.
    pub pendiente: Option<String>,
    /// La app avisa ella misma lo que llega por el canal local si la web no está.
    pub respaldo_nativo: bool,
    /// Lo último que falló al avisar.
    pub ultimo_error: Option<String>,
}

/// La web, con cada mensaje NUEVO que recibe: lo apunta y, si `sistema`, lo avisa por el sistema.
#[tauri::command]
pub fn aviso_mensaje(
    app: AppHandle,
    id: String,
    clave: String,
    titulo: String,
    cuerpo: String,
    ruta: String,
    sistema: bool,
) -> Result<ResultadoAviso, String> {
    if id.is_empty() || id.len() > 120 {
        return Err("Id de mensaje no válido.".into());
    }
    con(|e| e.apuntados.apuntar(&id));
    if !sistema {
        return Ok(ResultadoAviso { mostrada: false, motivo: Some("la web no pidió aviso del sistema".into()) });
    }
    if !ruta_valida(&ruta) {
        return Err("Ruta no válida.".into());
    }
    let a = AvisoNativo {
        id,
        clave: clave.chars().take(120).collect(),
        titulo: titulo.trim().chars().take(80).collect(),
        cuerpo: cuerpo.trim().chars().take(240).collect(),
        ruta,
    };
    if con(|e| e.avisados.contiene(&a.id)) {
        return Ok(ResultadoAviso { mostrada: false, motivo: Some("ya avisado".into()) });
    }
    match mostrar(&app, &a) {
        Ok(()) => Ok(ResultadoAviso { mostrada: true, motivo: None }),
        Err(e) => Ok(ResultadoAviso { mostrada: false, motivo: Some(e) }),
    }
}

/// La web cuenta su neurona, su cuenta y los chats silenciados (para el respaldo nativo). Se guarda en disco.
#[tauri::command]
pub fn avisos_config(app: AppHandle, config: ConfigAvisos) -> Result<(), String> {
    let mut c = config;
    c.silenciados.truncate(500);
    let cambia = con(|e| {
        let distinto = !e.config_leida || e.config != c;
        e.config = c.clone();
        e.config_leida = true;
        distinto
    });
    if cambia {
        if let Some(r) = ruta_config(&app) {
            if let Some(d) = r.parent() {
                let _ = std::fs::create_dir_all(d);
            }
            std::fs::write(r, serde_json::to_string(&c).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn avisos_estado(app: AppHandle) -> EstadoAvisos {
    use tauri_plugin_notification::NotificationExt;
    let permiso = app
        .notification()
        .permission_state()
        .map(|p| permiso_texto(&p).to_string())
        .unwrap_or_else(|_| "desconocido".into());
    #[cfg(desktop)]
    let enfocada = app.get_webview_window("main").and_then(|v| v.is_focused().ok());
    #[cfg(not(desktop))]
    let enfocada: Option<bool> = None;
    let (pendiente, ultimo_error) = con(|e| (e.pendiente.as_ref().map(|(r, _)| r.clone()), e.ultimo_error.clone()));
    EstadoAvisos {
        plataforma: std::env::consts::OS.to_string(),
        permiso,
        canal: if cfg!(target_os = "android") { Some(CANAL_ANDROID.to_string()) } else { None },
        enfocada,
        pendiente,
        respaldo_nativo: crate::nativa::es_starseed_os(&app),
        ultimo_error,
    }
}

/// Pide el permiso del sistema (Android 13+: el diálogo de POST_NOTIFICATIONS). Devuelve el resultado.
#[tauri::command]
pub async fn avisos_pedir_permiso(app: AppHandle) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri_plugin_notification::NotificationExt;
        app.notification().request_permission().map(|p| permiso_texto(&p).to_string()).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// La ruta de la última notificación pulsada (y la olvida). None si no hay o caducó.
#[tauri::command]
pub fn avisos_pendiente() -> Option<String> {
    con(|e| e.pendiente.take()).filter(|(_, t)| ahora_ms().saturating_sub(*t) <= PENDIENTE_VALIDA_MS).map(|(r, _)| r)
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn trama(b: &str) -> String {
        format!(r#"{{"t":"tu.msg","v":1,"id":"x1","c":"neurona","b":{b},"de":{{"s":"s1"}}}}"#)
    }

    #[test]
    fn lee_los_mensajes_de_neurona_sueltos_y_en_lote() {
        let t = trama(r#"{"v":1,"mid":"m1","txt":"hola","de":{"n":"nA","nom":"Mac de Alex","u":"u1"},"para":{"n":"nB","u":"u1"}}"#);
        let v = leer_mensajes_neurona(&t);
        assert_eq!(v.len(), 1);
        assert_eq!(v[0].mid, "m1");
        assert_eq!(v[0].texto, "hola");
        assert_eq!(v[0].nombre.as_deref(), Some("Mac de Alex"));
        assert_eq!((v[0].de_n.as_deref(), v[0].para_n.as_deref()), (Some("nA"), Some("nB")));
        // En un lote (`nl.lote` con textos JSON), junto a otros canales que no son de neurona.
        let otro = r#"{"t":"tu.msg","v":1,"id":"x2","c":"sync","b":{}}"#;
        // Como `JSON.stringify({ t: "nl.lote", m })` de red-local-nativa.ts: «t» primero.
        let lote = format!(r#"{{"t":"nl.lote","m":{}}}"#, serde_json::to_string(&[t.clone(), otro.to_string()]).unwrap());
        assert_eq!(leer_mensajes_neurona(&lote).len(), 1);
        // Lo que no es un mensaje de neurona no cuenta.
        assert!(leer_mensajes_neurona(r#"{"t":"nl.hola","s":{}}"#).is_empty());
        assert!(leer_mensajes_neurona(otro).is_empty());
        assert!(leer_mensajes_neurona("{roto").is_empty());
        assert!(leer_mensajes_neurona(&trama(r#"{"txt":"sin mid"}"#)).is_empty());
        // Archivo, llamada y flujo.
        let a = &leer_mensajes_neurona(&trama(r#"{"mid":"m2","txt":"","adj":{"nombre":"foto.jpg"}}"#))[0];
        assert_eq!(texto_aviso(a).1, "Te manda «foto.jpg».");
        let l = &leer_mensajes_neurona(&trama(r#"{"mid":"m3","txt":"","ll":{"via":"enlace-local"}}"#))[0];
        assert_eq!(texto_aviso(l), ("Una neurona".to_string(), "Te está llamando.".to_string()));
    }

    #[test]
    fn el_respaldo_usa_los_filtros_de_la_web() {
        let cfg = ConfigAvisos { neurona: Some("nB".into()), uid: Some("u1".into()), silenciados: vec![], sistema: true };
        let m = MensajeNeurona { mid: "m1".into(), texto: "hola".into(), nombre: Some("Mac".into()), de_n: Some("nA".into()), de_u: Some("u1".into()), para_n: Some("nB".into()), ..Default::default() };
        let a = decidir_respaldo(&m, &cfg).unwrap();
        assert_eq!(a.clave, "n:nA");
        assert_eq!(a.ruta, "/messages?vista=neuronas&neurona=n%3AnA");
        assert_eq!((a.titulo.as_str(), a.cuerpo.as_str()), ("Mac", "hola"));
        // Para otra neurona de la cuenta: no.
        assert_eq!(decidir_respaldo(&MensajeNeurona { para_n: Some("nC".into()), ..m.clone() }, &cfg), None);
        // Eco de esta misma neurona: no.
        assert_eq!(decidir_respaldo(&MensajeNeurona { de_n: Some("nB".into()), ..m.clone() }, &cfg), None);
        // Silenciado: no. Avisos apagados: no.
        assert_eq!(decidir_respaldo(&m, &ConfigAvisos { silenciados: vec!["n:nA".into()], ..cfg.clone() }), None);
        assert_eq!(decidir_respaldo(&m, &ConfigAvisos { sistema: false, ..cfg.clone() }), None);
        // De otra cuenta: una conversación por cuenta.
        let ajena = MensajeNeurona { de_u: Some("u9".into()), para_n: None, para_u: Some("u1".into()), ..m.clone() };
        assert_eq!(decidir_respaldo(&ajena, &cfg).unwrap().clave, "c:u9");
        assert_eq!(decidir_respaldo(&MensajeNeurona { para_u: Some("u7".into()), ..ajena }, &cfg), None);
        // Sin configuración aún (la web nunca arrancó): se avisa igual.
        assert!(decidir_respaldo(&m, &ConfigAvisos { sistema: true, ..Default::default() }).is_some());
    }

    #[test]
    fn rutas_y_ids() {
        assert_eq!(ruta_chat("dm:abc-1"), "/messages?vista=mensajes&hilo=abc-1");
        assert_eq!(ruta_chat("c:u 1"), "/messages?vista=neuronas&neurona=c%3Au%201");
        assert!(ruta_valida("/messages?vista=neuronas&neurona=n%3Aa"));
        assert!(!ruta_valida("//evil.com/x"));
        assert!(!ruta_valida("https://evil.com"));
        assert!(!ruta_valida("javascript:alert(1)"));
        assert!(!ruta_valida("/a\nb"));
        let a = id_notificacion("m1");
        assert!(a > 0);
        assert_eq!(a, id_notificacion("m1"));
        assert_ne!(a, id_notificacion("m2"));
        assert!(id_notificacion("") > 0);
    }

    #[test]
    fn vistos_con_tope() {
        let mut v = Vistos::default();
        assert!(v.apuntar("a"));
        assert!(!v.apuntar("a"));
        for i in 0..MAX_VISTOS {
            v.apuntar(&format!("x{i}"));
        }
        assert!(!v.contiene("a"), "el más viejo sale al pasar del tope");
        assert!(v.contiene(&format!("x{}", MAX_VISTOS - 1)));
    }

    #[test]
    fn la_config_se_lee_con_avisos_encendidos_por_defecto() {
        let c: ConfigAvisos = serde_json::from_str(r#"{"neurona":"n1","uid":null}"#).unwrap();
        assert!(c.sistema);
        assert!(c.silenciados.is_empty());
    }
}
