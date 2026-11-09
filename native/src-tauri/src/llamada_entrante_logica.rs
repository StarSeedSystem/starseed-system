// ═══════════════════════════════════════════════════════════════════════════
// llamada_entrante_logica — lo PURO de la llamada entrante nativa (LLA1108F, 2026-11-09).
// Contrato: architecture/llamadas-telefonia.md § 8.5 y § 8.6. Sin Tauri ni disco (con pruebas):
//   · la trama «timbre» (despertador): cabecera en claro + firma HMAC-SHA256 con la clave de faro de la
//     cuenta. Quien llama la manda por cada enlace ANTES de la señalización cifrada; la app (aunque no tenga
//     WebView) la verifica sin secretos nuevos y hace sonar la llamada nativa;
//   · los silencios («Ignorar»/«Silenciar…»): lectura, fusión con la lista de la web y «¿quién suena?»;
//   · la ventana de escritorio «llamada-entrante»: cuándo se abre, su HTML y las acciones de sus botones.
// ═══════════════════════════════════════════════════════════════════════════

use crate::sha256::{hmac_sha256, iguales_ct};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

/// Canal del transporte universal por el que viaja la trama (`tu.msg` con `c` = este).
pub const CANAL_TIMBRE: &str = "llamada-timbre";
pub const VERSION_TIMBRE: u32 = 1;
/// Dominio de la firma: una firma de faro o de BLE no sirve como timbre.
pub const DOMINIO_FIRMA: &str = "ss-timbre-v1";
/// Cuánto se acepta de desfase de reloj entre las dos neuronas.
pub const VALIDEZ_S: u64 = 90;
/// Lo que espera Rust a que la web (si vive) reclame la llamada antes de hacerla sonar él.
pub const ESPERA_WEB_MS: u64 = 2_500;
pub const ARCHIVO_SILENCIOS: &str = "silencios-llamadas.json";
pub const TOPE_SILENCIOS: usize = 100;
pub const VIDA_LAPIDA_MS: u64 = 24 * 3_600_000;
pub const ETIQUETA_VENTANA: &str = "llamada-entrante";
pub const ESQUEMA_ACCION: &str = "starseed-llamada";
const TOPE_ID: usize = 80;
const TOPE_NOMBRE: usize = 60;

// ───────────────────────────── La trama «timbre» ─────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub struct Timbre {
    pub id: String,
    pub neurona: String,
    pub nombre: String,
    /// «voz» | «video».
    pub tipo: String,
    /// «red-local» | «bluetooth» | «internet» | «malla»…
    pub medio: String,
    pub ts: u64,
    /// 8 bytes en hex (16 caracteres).
    pub nonce: String,
    pub firma: [u8; 32],
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Rechazo {
    Vencido,
    DelFuturo,
    FirmaMala,
    EsMia,
}

pub fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

pub fn desde_hex(s: &str) -> Option<Vec<u8>> {
    if s.len() % 2 != 0 || !s.is_ascii() {
        return None;
    }
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).ok()).collect()
}

fn campo_limpio(s: &str, tope: usize) -> String {
    s.chars().filter(|c| !c.is_control() && *c != '|').take(tope).collect::<String>().trim().to_string()
}

fn tipo_limpio(t: &str) -> Option<&'static str> {
    match t {
        "voz" => Some("voz"),
        "video" => Some("video"),
        _ => None,
    }
}

/// Lo que se firma: campos en orden, separados por «|» (que no puede estar dentro de ninguno).
pub fn mensaje_firmado(id: &str, neurona: &str, nombre: &str, tipo: &str, medio: &str, ts: u64, nonce: &str) -> Vec<u8> {
    format!("{DOMINIO_FIRMA}|{id}|{neurona}|{nombre}|{tipo}|{medio}|{ts}|{nonce}").into_bytes()
}

/// El cuerpo (`b`) de la trama, firmado. Err si algún campo no vale.
pub fn construir(clave: &[u8], id: &str, neurona: &str, nombre: &str, tipo: &str, medio: &str, ts: u64, nonce: [u8; 8]) -> Result<serde_json::Value, String> {
    let id = campo_limpio(id, TOPE_ID);
    let neurona = campo_limpio(neurona, TOPE_ID);
    let nombre = campo_limpio(nombre, TOPE_NOMBRE);
    let medio = campo_limpio(medio, 24);
    let tipo = tipo_limpio(tipo).ok_or("Tipo de llamada no válido (voz o video).")?;
    if id.is_empty() || neurona.is_empty() || medio.is_empty() {
        return Err("Faltan datos para el timbre (id, neurona o medio).".into());
    }
    let nonce = hex(&nonce);
    let firma = hmac_sha256(clave, &mensaje_firmado(&id, &neurona, &nombre, tipo, &medio, ts, &nonce));
    Ok(serde_json::json!({
        "v": VERSION_TIMBRE, "id": id, "n": neurona, "nom": nombre, "tipo": tipo, "med": medio, "ts": ts, "nc": nonce, "fm": hex(&firma)
    }))
}

fn leer_cuerpo(b: &serde_json::Value) -> Option<Timbre> {
    if b.get("v")?.as_u64()? != VERSION_TIMBRE as u64 {
        return None;
    }
    let texto = |k: &str, tope: usize| -> Option<String> {
        let s = b.get(k)?.as_str()?;
        (s.chars().count() <= tope && !s.contains('|') && !s.chars().any(|c| c.is_control())).then(|| s.to_string())
    };
    let firma: [u8; 32] = desde_hex(b.get("fm")?.as_str()?)?.try_into().ok()?;
    let nonce = texto("nc", 16).filter(|n| n.len() == 16 && desde_hex(n).is_some())?;
    Some(Timbre {
        id: texto("id", TOPE_ID).filter(|s| !s.is_empty())?,
        neurona: texto("n", TOPE_ID).filter(|s| !s.is_empty())?,
        nombre: texto("nom", TOPE_NOMBRE)?,
        tipo: tipo_limpio(b.get("tipo")?.as_str()?)?.to_string(),
        medio: texto("med", 24).filter(|s| !s.is_empty())?,
        ts: b.get("ts")?.as_u64()?,
        nonce,
        firma,
    })
}

fn leer_sobre(o: &serde_json::Value) -> Option<Timbre> {
    if o.get("t")?.as_str()? != "tu.msg" || o.get("c")?.as_str()? != CANAL_TIMBRE {
        return None;
    }
    leer_cuerpo(o.get("b")?)
}

/// Los timbres de una trama del canal local: un sobre `tu.msg` suelto o un lote `nl.lote`. Lo demás, nada.
pub fn leer_timbres(cuerpo: &str) -> Vec<Timbre> {
    if !cuerpo.starts_with("{\"t\":\"tu.msg\"") && !cuerpo.starts_with("{\"t\":\"nl.lote\"") {
        return Vec::new();
    }
    let Ok(o) = serde_json::from_str::<serde_json::Value>(cuerpo) else { return Vec::new() };
    if o.get("t").and_then(|t| t.as_str()) == Some("nl.lote") {
        return o
            .get("m")
            .and_then(|m| m.as_array())
            .map(|v| {
                v.iter()
                    .take(16)
                    .filter_map(|t| t.as_str())
                    .filter_map(|t| serde_json::from_str::<serde_json::Value>(t).ok())
                    .filter_map(|x| leer_sobre(&x))
                    .collect()
            })
            .unwrap_or_default();
    }
    leer_sobre(&o).into_iter().collect()
}

/// ¿Vale esta trama? Firma con la clave de la cuenta, reloj dentro de la ventana y que no sea de esta neurona.
pub fn verificar(clave: &[u8], t: &Timbre, ahora_s: u64, mi_neurona: Option<&str>) -> Result<(), Rechazo> {
    if mi_neurona == Some(t.neurona.as_str()) {
        return Err(Rechazo::EsMia);
    }
    if t.ts > ahora_s + VALIDEZ_S {
        return Err(Rechazo::DelFuturo);
    }
    if ahora_s > t.ts + VALIDEZ_S {
        return Err(Rechazo::Vencido);
    }
    let esperada = hmac_sha256(clave, &mensaje_firmado(&t.id, &t.neurona, &t.nombre, &t.tipo, &t.medio, t.ts, &t.nonce));
    if iguales_ct(&esperada, &t.firma) {
        Ok(())
    } else {
        Err(Rechazo::FirmaMala)
    }
}

/// Los últimos ids vistos: la misma llamada llega por cada enlace y suena una vez.
#[derive(Default)]
pub struct Vistos {
    ids: VecDeque<String>,
}

impl Vistos {
    /// true si es nuevo (y lo apunta).
    pub fn apuntar(&mut self, id: &str) -> bool {
        if self.ids.iter().any(|x| x == id) {
            return false;
        }
        self.ids.push_back(id.to_string());
        while self.ids.len() > 64 {
            self.ids.pop_front();
        }
        true
    }
}

// ───────────────────────────── Silencios ─────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Silencio {
    pub id: String,
    pub ambito: String,
    pub clave: String,
    #[serde(default)]
    pub etiqueta: String,
    #[serde(default)]
    pub hasta: Option<u64>,
    #[serde(default)]
    pub creado: u64,
    #[serde(default)]
    pub r#mod: u64,
    #[serde(default)]
    pub quitado: bool,
}

#[derive(Default, Clone, Debug, PartialEq)]
pub struct ConsultaSilencio {
    pub uid: Option<String>,
    pub neurona: Option<String>,
    pub chat: Option<String>,
    pub medio: Option<String>,
}

const AMBITOS: [&str; 5] = ["persona", "neurona", "chat", "medio", "todas"];

pub fn leer_silencios(json: &str) -> Vec<Silencio> {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(json) else { return Vec::new() };
    let lista = match &v {
        serde_json::Value::Array(a) => a.clone(),
        o => o.get("silencios").and_then(|s| s.as_array()).cloned().unwrap_or_default(),
    };
    lista
        .into_iter()
        .take(TOPE_SILENCIOS * 2)
        .filter_map(|x| serde_json::from_value::<Silencio>(x).ok())
        .filter(|s| AMBITOS.contains(&s.ambito.as_str()) && !s.id.is_empty() && s.id.len() <= 200 && !s.clave.is_empty() && s.clave.len() <= 160)
        .map(|mut s| {
            s.etiqueta = s.etiqueta.chars().take(80).collect();
            s
        })
        .collect()
}

pub fn serializar_silencios(lista: &[Silencio]) -> String {
    serde_json::json!({ "v": 1, "silencios": lista.iter().take(TOPE_SILENCIOS).collect::<Vec<_>>() }).to_string()
}

pub fn vigente(s: &Silencio, ahora_ms: u64) -> bool {
    !s.quitado && s.hasta.map(|h| h > ahora_ms).unwrap_or(true)
}

fn depurar(lista: Vec<Silencio>, ahora_ms: u64) -> Vec<Silencio> {
    let mut util: Vec<Silencio> = lista
        .into_iter()
        .filter(|s| {
            if s.quitado {
                ahora_ms.saturating_sub(s.r#mod) < VIDA_LAPIDA_MS
            } else {
                s.hasta.map(|h| ahora_ms.saturating_sub(h) < VIDA_LAPIDA_MS).unwrap_or(true)
            }
        })
        .collect();
    util.sort_by(|a, b| b.r#mod.cmp(&a.r#mod));
    util.truncate(TOPE_SILENCIOS);
    util
}

/// Une la lista de la web y la nativa: por id gana el `mod` más reciente (igual que `fusionar` de TypeScript).
pub fn fusionar(a: &[Silencio], b: &[Silencio], ahora_ms: u64) -> Vec<Silencio> {
    let mut por: Vec<Silencio> = Vec::new();
    for s in a.iter().chain(b) {
        match por.iter_mut().find(|x| x.id == s.id) {
            Some(x) => {
                if s.r#mod > x.r#mod {
                    *x = s.clone();
                }
            }
            None => por.push(s.clone()),
        }
    }
    depurar(por, ahora_ms)
}

/// El silencio vigente que cubre la llamada (el que dura más), si hay.
pub fn silenciada_por<'a>(lista: &'a [Silencio], q: &ConsultaSilencio, ahora_ms: u64) -> Option<&'a Silencio> {
    let cubre = |s: &Silencio| match s.ambito.as_str() {
        "todas" => true,
        "persona" => q.uid.as_deref() == Some(s.clave.as_str()),
        "neurona" => q.neurona.as_deref() == Some(s.clave.as_str()),
        "chat" => q.chat.as_deref() == Some(s.clave.as_str()),
        "medio" => q.medio.as_deref() == Some(s.clave.as_str()),
        _ => false,
    };
    lista.iter().filter(|s| vigente(s, ahora_ms) && cubre(s)).fold(None, |mejor: Option<&Silencio>, s| match mejor {
        None => Some(s),
        Some(m) if m.hasta.is_some() && (s.hasta.is_none() || s.hasta > m.hasta) => Some(s),
        m => m,
    })
}

// ───────────────────────────── Ventana de escritorio ─────────────────────────────

/// Qué se sabe de la ventana principal.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Principal {
    pub visible: bool,
    pub enfocada: bool,
    pub minimizada: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EstadoVentana {
    Cerrada,
    Abierta(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AccionVentana {
    Abrir,
    Nada,
}

/// Se abre solo si la ventana principal no está a la vista y la llamada no está silenciada ni ya abierta.
pub fn decidir_ventana(actual: &EstadoVentana, id: &str, p: Principal, silenciada: bool) -> AccionVentana {
    if silenciada || matches!(actual, EstadoVentana::Abierta(x) if x == id) {
        return AccionVentana::Nada;
    }
    let a_la_vista = p.visible && p.enfocada && !p.minimizada;
    if a_la_vista {
        AccionVentana::Nada
    } else {
        AccionVentana::Abrir
    }
}

/// ¿Hay que cerrar la ventana al llegar este estado de la llamada `id`?
pub fn cerrar_ventana_con(actual: &EstadoVentana, id: &str, estado: &str) -> bool {
    matches!(actual, EstadoVentana::Abierta(x) if x == id) && matches!(estado, "activa" | "en-espera" | "terminada")
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct DatosVentana {
    pub id: String,
    pub nombre: String,
    pub iniciales: String,
    pub video: bool,
    pub medio: String,
    pub uid: Option<String>,
    pub neurona: Option<String>,
    pub chat: Option<String>,
}

fn esc(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            '&' => "&amp;".to_string(),
            '<' => "&lt;".to_string(),
            '>' => "&gt;".to_string(),
            '"' => "&quot;".to_string(),
            '\'' => "&#39;".to_string(),
            c => c.to_string(),
        })
        .collect()
}

pub fn texto_medio(medio: &str) -> &'static str {
    match medio {
        "bluetooth" => "por Bluetooth directo",
        "red-local" => "por la red local",
        "malla" => "por la malla",
        "internet" => "por internet",
        _ => "por StarSeed",
    }
}

/// El HTML de la ventana (sin scripts: los botones navegan a `starseed-llamada://…`, que Rust intercepta).
pub fn html_ventana(d: &DatosVentana) -> String {
    let base = format!("{ESQUEMA_ACCION}://");
    let tipo = if d.video { "Videollamada entrante" } else { "Llamada de voz entrante" };
    let ambitos: Vec<(&str, &str, bool)> = vec![
        ("persona", "Esta persona", d.uid.is_some()),
        ("neurona", "Esta neurona", d.neurona.is_some()),
        ("chat", "Este grupo o chat", d.chat.is_some()),
        ("medio", "Este medio", !d.medio.is_empty()),
        ("todas", "Todas (No molestar)", true),
    ];
    let duraciones = [("15m", "15 minutos"), ("1h", "1 hora"), ("8h", "8 horas"), ("manana", "Hasta mañana"), ("siempre", "Hasta que lo reactive")];
    let mut menu = String::new();
    for (a, texto, hay) in ambitos {
        if !hay {
            continue;
        }
        menu.push_str(&format!("<p class=\"g\">{}</p>", esc(texto)));
        for (dur, t) in duraciones {
            menu.push_str(&format!("<a class=\"o\" href=\"{base}silenciar?id={}&amp;ambito={a}&amp;dur={dur}\">{}</a>", esc(&d.id), esc(t)));
        }
    }
    format!(
        "<!doctype html><html lang=\"es\"><head><meta charset=\"utf-8\"><title>Llamada entrante</title><style>\
*{{box-sizing:border-box}}body{{margin:0;font:14px -apple-system,Segoe UI,sans-serif;color:#fff;background:linear-gradient(160deg,#0c0e22,#1b1442);height:100vh;overflow:hidden;user-select:none}}\
.c{{padding:18px;display:flex;flex-direction:column;gap:12px}}.f{{display:flex;gap:12px;align-items:center}}\
.av{{width:56px;height:56px;border-radius:50%;background:#7c5cff;display:grid;place-items:center;font-weight:700;font-size:20px}}\
.t{{font-size:11px;letter-spacing:.14em;text-transform:uppercase;opacity:.6}}.n{{font-size:18px;font-weight:600}}.m{{opacity:.7;font-size:12px}}\
.b{{display:flex;gap:8px;flex-wrap:wrap}}a.x{{flex:1;text-align:center;padding:10px 8px;border-radius:999px;color:#fff;text-decoration:none;font-weight:600;min-width:90px}}\
.ok{{background:#10b981}}.no{{background:#dc143c}}.ig{{background:rgba(255,255,255,.14)}}\
details{{width:100%}}summary{{cursor:pointer;opacity:.85;list-style:none;text-align:center;padding:6px;border-radius:999px;background:rgba(255,255,255,.08)}}\
.menu{{max-height:150px;overflow:auto;margin-top:6px}}.g{{margin:8px 0 2px;font-size:11px;opacity:.55;text-transform:uppercase}}\
a.o{{display:block;padding:5px 8px;color:#e8e4ff;text-decoration:none;border-radius:6px}}a.o:hover{{background:rgba(255,255,255,.1)}}\
</style></head><body><div class=\"c\"><div class=\"f\"><div class=\"av\">{ini}</div><div><div class=\"t\">{tipo}</div><div class=\"n\">{nombre}</div><div class=\"m\">{medio}</div></div></div>\
<div class=\"b\"><a class=\"x no\" href=\"{base}rechazar?id={id}\">Rechazar</a><a class=\"x ig\" href=\"{base}ignorar?id={id}\">Ignorar</a><a class=\"x ok\" href=\"{base}contestar?id={id}\">Contestar</a></div>\
<details><summary>Silenciar…</summary><div class=\"menu\">{menu}</div></details></div></body></html>",
        ini = esc(&d.iniciales),
        tipo = tipo,
        nombre = esc(&d.nombre),
        medio = esc(texto_medio(&d.medio)),
        id = esc(&d.id),
        base = base,
        menu = menu
    )
}

#[derive(Debug, Clone, PartialEq)]
pub enum AccionPopup {
    Contestar(String),
    Rechazar(String),
    Ignorar(String),
    Silenciar { id: String, ambito: String, duracion: String },
}

fn param(consulta: &str, k: &str) -> Option<String> {
    consulta.split('&').find_map(|p| p.split_once('=').filter(|(a, _)| *a == k).map(|(_, v)| v.to_string()))
}

/// La acción de un botón de la ventana a partir de la URL a la que navegó; None si no es nuestra.
pub fn accion_de_url(url: &str) -> Option<AccionPopup> {
    let resto = url.strip_prefix(&format!("{ESQUEMA_ACCION}://"))?;
    let (ruta, consulta) = resto.split_once('?').unwrap_or((resto, ""));
    let ruta = ruta.trim_end_matches('/');
    let id = param(consulta, "id").filter(|i| !i.is_empty() && i.len() <= TOPE_ID)?;
    match ruta {
        "contestar" => Some(AccionPopup::Contestar(id)),
        "rechazar" => Some(AccionPopup::Rechazar(id)),
        "ignorar" => Some(AccionPopup::Ignorar(id)),
        "silenciar" => {
            let ambito = param(consulta, "ambito").filter(|a| AMBITOS.contains(&a.as_str()))?;
            let duracion = param(consulta, "dur").filter(|d| ["15m", "1h", "8h", "manana", "siempre"].contains(&d.as_str()))?;
            Some(AccionPopup::Silenciar { id, ambito, duracion })
        }
        _ => None,
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    const CLAVE: [u8; 32] = [7; 32];

    fn trama(ts: u64) -> (String, serde_json::Value) {
        let b = construir(&CLAVE, "ll-1", "tablet", "Mac de Alex", "voz", "red-local", ts, [1, 2, 3, 4, 5, 6, 7, 8]).unwrap();
        (format!("{{\"t\":\"tu.msg\",\"v\":1,\"id\":\"x\",\"c\":\"{CANAL_TIMBRE}\",\"b\":{b}}}"), b)
    }

    #[test]
    fn la_trama_firmada_se_lee_y_verifica() {
        let (texto, _) = trama(1000);
        let l = leer_timbres(&texto);
        assert_eq!(l.len(), 1);
        assert_eq!(l[0].id, "ll-1");
        assert_eq!(l[0].tipo, "voz");
        assert_eq!(verificar(&CLAVE, &l[0], 1010, Some("otra")), Ok(()));
    }

    #[test]
    fn una_firma_de_otra_cuenta_no_vale() {
        let (texto, _) = trama(1000);
        let l = leer_timbres(&texto);
        assert_eq!(verificar(&[9; 32], &l[0], 1000, None), Err(Rechazo::FirmaMala));
    }

    #[test]
    fn cambiar_un_campo_rompe_la_firma() {
        let (_, mut b) = trama(1000);
        b["nom"] = serde_json::json!("Impostor");
        let t = leer_cuerpo(&b).unwrap();
        assert_eq!(verificar(&CLAVE, &t, 1000, None), Err(Rechazo::FirmaMala));
        let (_, mut b) = trama(1000);
        b["tipo"] = serde_json::json!("video");
        assert_eq!(verificar(&CLAVE, &leer_cuerpo(&b).unwrap(), 1000, None), Err(Rechazo::FirmaMala));
    }

    #[test]
    fn el_reloj_se_comprueba_y_la_propia_neurona_se_ignora() {
        let (texto, _) = trama(1000);
        let t = &leer_timbres(&texto)[0];
        assert_eq!(verificar(&CLAVE, t, 1000 + VALIDEZ_S + 1, None), Err(Rechazo::Vencido));
        assert_eq!(verificar(&CLAVE, t, 1000 - VALIDEZ_S - 1, None), Err(Rechazo::DelFuturo));
        assert_eq!(verificar(&CLAVE, t, 1000, Some("tablet")), Err(Rechazo::EsMia));
    }

    #[test]
    fn lo_que_no_es_un_timbre_no_se_lee() {
        assert!(leer_timbres("{\"t\":\"tu.msg\",\"c\":\"neurona\",\"b\":{}}").is_empty());
        assert!(leer_timbres("basura").is_empty());
        let (_, mut b) = trama(1000);
        b["fm"] = serde_json::json!("zz");
        assert!(leer_cuerpo(&b).is_none());
        let (_, mut b) = trama(1000);
        b["tipo"] = serde_json::json!("sala-vr");
        assert!(leer_cuerpo(&b).is_none());
        let (_, mut b) = trama(1000);
        b["nom"] = serde_json::json!("a|b");
        assert!(leer_cuerpo(&b).is_none());
    }

    #[test]
    fn construir_limpia_los_campos_y_pide_lo_necesario() {
        let b = construir(&CLAVE, "id", "n", "Ana|Luis\n", "voz", "bluetooth", 5, [0; 8]).unwrap();
        assert_eq!(b["nom"], "AnaLuis");
        assert!(construir(&CLAVE, "", "n", "x", "voz", "m", 1, [0; 8]).is_err());
        assert!(construir(&CLAVE, "i", "n", "x", "sala", "m", 1, [0; 8]).is_err());
    }

    #[test]
    fn un_lote_lleva_varios_timbres_y_los_ids_no_se_repiten() {
        let (uno, _) = trama(1000);
        let lote = format!("{{\"t\":\"nl.lote\",\"m\":{}}}", serde_json::json!([uno.clone(), uno]));
        let l = leer_timbres(&lote);
        assert_eq!(l.len(), 2);
        let mut v = Vistos::default();
        assert!(v.apuntar(&l[0].id));
        assert!(!v.apuntar(&l[1].id));
    }

    fn s(id: &str, ambito: &str, clave: &str, hasta: Option<u64>, m: u64) -> Silencio {
        Silencio { id: id.into(), ambito: ambito.into(), clave: clave.into(), etiqueta: String::new(), hasta, creado: m, r#mod: m, quitado: false }
    }

    #[test]
    fn cada_ambito_silencia_lo_suyo_y_caduca() {
        let q = ConsultaSilencio { uid: Some("u1".into()), neurona: Some("n1".into()), chat: Some("c1".into()), medio: Some("bluetooth".into()) };
        let ahora = 1_000;
        for (amb, clave) in [("persona", "u1"), ("neurona", "n1"), ("chat", "c1"), ("medio", "bluetooth"), ("todas", "*")] {
            let l = vec![s("a", amb, clave, Some(2_000), 1)];
            assert!(silenciada_por(&l, &q, ahora).is_some(), "{amb}");
            assert!(silenciada_por(&l, &q, 2_000).is_none(), "{amb} caduca");
        }
        let otra = vec![s("a", "persona", "u2", None, 1), s("b", "medio", "internet", None, 1)];
        assert!(silenciada_por(&otra, &q, ahora).is_none());
        let sin_fin = vec![s("a", "persona", "u1", None, 1)];
        assert!(silenciada_por(&sin_fin, &q, u64::MAX / 2).is_some());
    }

    #[test]
    fn manda_el_silencio_que_dura_mas() {
        let q = ConsultaSilencio { uid: Some("u1".into()), medio: Some("m".into()), ..Default::default() };
        let l = vec![s("a", "persona", "u1", Some(5_000), 1), s("b", "medio", "m", Some(9_000), 1)];
        assert_eq!(silenciada_por(&l, &q, 10).unwrap().id, "b");
        let l = vec![s("a", "persona", "u1", Some(5_000), 1), s("b", "medio", "m", None, 1)];
        assert_eq!(silenciada_por(&l, &q, 10).unwrap().id, "b");
    }

    #[test]
    fn fusionar_gana_lo_mas_reciente_y_la_lapida_no_revive() {
        let web = vec![s("a", "persona", "u1", None, 10)];
        let mut nativa = s("a", "persona", "u1", None, 20);
        nativa.quitado = true;
        let f = fusionar(&web, &[nativa], 30);
        assert_eq!(f.len(), 1);
        assert!(f[0].quitado);
        assert!(silenciada_por(&f, &ConsultaSilencio { uid: Some("u1".into()), ..Default::default() }, 30).is_none());
        // Una lápida vieja se tira.
        assert!(fusionar(&f, &[], 30 + VIDA_LAPIDA_MS + 1).is_empty());
    }

    #[test]
    fn leer_y_serializar_ida_y_vuelta_y_tolera_basura() {
        let l = vec![s("a", "persona", "u1", Some(5), 1), s("b", "todas", "*", None, 2)];
        let otra = leer_silencios(&serializar_silencios(&l));
        assert_eq!(otra.len(), 2);
        assert!(leer_silencios("no es json").is_empty());
        assert_eq!(leer_silencios("[{\"id\":\"a\",\"ambito\":\"raro\",\"clave\":\"x\"},{\"id\":\"b\",\"ambito\":\"chat\",\"clave\":\"c\"}]").len(), 1);
    }

    #[test]
    fn el_tope_de_silencios_se_respeta() {
        let muchos: Vec<Silencio> = (0..250).map(|i| s(&format!("s{i}"), "persona", &format!("u{i}"), None, i)).collect();
        assert_eq!(fusionar(&muchos, &[], 1000).len(), TOPE_SILENCIOS);
    }

    #[test]
    fn la_ventana_solo_se_abre_si_la_principal_no_se_ve() {
        let a_la_vista = Principal { visible: true, enfocada: true, minimizada: false };
        let atras = Principal { visible: true, enfocada: false, minimizada: false };
        let minimizada = Principal { visible: true, enfocada: false, minimizada: true };
        let oculta = Principal { visible: false, enfocada: false, minimizada: false };
        let c = EstadoVentana::Cerrada;
        assert_eq!(decidir_ventana(&c, "a", a_la_vista, false), AccionVentana::Nada);
        for p in [atras, minimizada, oculta] {
            assert_eq!(decidir_ventana(&c, "a", p, false), AccionVentana::Abrir);
            assert_eq!(decidir_ventana(&c, "a", p, true), AccionVentana::Nada, "silenciada");
        }
        assert_eq!(decidir_ventana(&EstadoVentana::Abierta("a".into()), "a", oculta, false), AccionVentana::Nada);
    }

    #[test]
    fn la_ventana_se_cierra_al_contestar_colgar_o_terminar() {
        let ab = EstadoVentana::Abierta("a".into());
        for e in ["activa", "en-espera", "terminada"] {
            assert!(cerrar_ventana_con(&ab, "a", e));
            assert!(!cerrar_ventana_con(&ab, "b", e), "otra llamada");
        }
        assert!(!cerrar_ventana_con(&ab, "a", "sonando"));
        assert!(!cerrar_ventana_con(&EstadoVentana::Cerrada, "a", "terminada"));
    }

    #[test]
    fn el_html_escapa_y_trae_las_opciones() {
        let d = DatosVentana { id: "ll-1".into(), nombre: "<b>Ana</b>".into(), iniciales: "A".into(), medio: "bluetooth".into(), uid: Some("u1".into()), ..Default::default() };
        let h = html_ventana(&d);
        assert!(!h.contains("<b>Ana"));
        assert!(h.contains("&lt;b&gt;Ana"));
        assert!(h.contains("starseed-llamada://contestar?id=ll-1"));
        assert!(h.contains("ignorar?id=ll-1"));
        assert!(h.contains("ambito=persona&amp;dur=1h"));
        assert!(h.contains("ambito=medio"));
        assert!(!h.contains("ambito=neurona"), "sin neurona conocida no se ofrece");
        assert!(h.contains("por Bluetooth directo"));
        assert!(!h.contains("<script"));
    }

    #[test]
    fn las_acciones_de_los_botones_se_leen_y_lo_ajeno_no() {
        assert_eq!(accion_de_url("starseed-llamada://contestar?id=a1"), Some(AccionPopup::Contestar("a1".into())));
        assert_eq!(accion_de_url("starseed-llamada://ignorar/?id=a1"), Some(AccionPopup::Ignorar("a1".into())));
        assert_eq!(
            accion_de_url("starseed-llamada://silenciar?id=a1&ambito=medio&dur=8h"),
            Some(AccionPopup::Silenciar { id: "a1".into(), ambito: "medio".into(), duracion: "8h".into() })
        );
        assert_eq!(accion_de_url("starseed-llamada://silenciar?id=a1&ambito=raro&dur=8h"), None);
        assert_eq!(accion_de_url("starseed-llamada://silenciar?id=a1&ambito=medio&dur=un-año"), None);
        assert_eq!(accion_de_url("starseed-llamada://contestar"), None);
        assert_eq!(accion_de_url("https://evil.example/contestar?id=a"), None);
        assert_eq!(accion_de_url("starseed-llamada://borrar?id=a"), None);
    }

    #[test]
    fn hex_ida_y_vuelta() {
        assert_eq!(desde_hex(&hex(&[0, 255, 16])), Some(vec![0, 255, 16]));
        assert_eq!(desde_hex("abc"), None);
        assert_eq!(desde_hex("zz"), None);
    }
}
