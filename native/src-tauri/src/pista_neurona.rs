// ═══════════════════════════════════════════════════════════════════════════
// pista_neurona — el id de neurona que la app usaba en el origen de la web publicada, para que la APK
// con servidor local (origen http://127.0.0.1:4761x) NO estrene una neurona nueva (NEU1108A, 2026-11-08).
// Contrato: architecture/neurona-bienvenida.md §6.1.
// ---------------------------------------------------------------------------
// Caso real (08-11): Alex instaló en la tableta «Maggaboard» la APK de pruebas con el servidor local
// dentro. localStorage es por ORIGEN y la migración del origen anterior (`migracion_origen*.rs`) es
// solo de escritorio (ventana oculta + loadHTMLString/WebView2): en Android el origen 127.0.0.1 nació
// vacío, sin `starseed.neuron.device-id`, y la web registró una neurona nueva («📱 Android · Chrome 156»).
//
// En Android, al primer arranque con servidor local (y hasta que salga, como mucho 3 veces):
//   1. la ventana principal, en vez de ir del arranque al servidor local, pasa un momento por
//      `<web publicada>/offline.html` (con red, o desde la caché del service worker si ya la tenía);
//   2. Rust evalúa allí `SCRIPT_PISTA`: lee `starseed.neuron.device-id` de ESE origen y lo manda con
//      `pista_neurona` (solo ventana «main» y solo desde el origen publicado; una vez);
//   3. con la pista (o pasado `ESPERA_PISTA_MS`), la ventana sigue a la entrada del servidor local;
//   4. la web del servidor local la pide con `pista_neurona_leer` (solo desde 127.0.0.1:47610…47619) y
//      la deja en `starseed.migracion-origen.neurona-anterior.v1`, como la escritorio: la adopción al
//      arrancar (`asegurarIdentidadAlArrancar`) adopta ese id si la fila es de la cuenta y no es de otro
//      aparato, y la ventana «Esta neurona» la usa como la prueba más fuerte.
// Solo viaja el id (no la sesión ni nada más). En escritorio los comandos existen pero nadie los usa
// (la migración completa ya deja la pista). Lógica pura aquí y probada; el pegamento de la ventana está
// en servidor_local_android.rs.
// ═══════════════════════════════════════════════════════════════════════════

use serde::{Deserialize, Serialize};

/// Archivo del marcador en `<app_data>/`.
pub const MARCADOR: &str = "pista-neurona.json";
/// Intentos (arranques) como mucho: sin red ni caché, no se insiste más.
pub const MAX_INTENTOS: u32 = 3;
/// Cuánto se espera en la web publicada a que llegue la pista antes de seguir.
#[cfg_attr(not(all(target_os = "android", starseed_servidor_android)), allow(dead_code))]
pub const ESPERA_PISTA_MS: u64 = 8_000;
/// Origen de la web publicada (el de `servidor_local_logica::WEB_PUBLICADA`, que en Android solo existe
/// con el interruptor del servidor local).
pub const WEB_PUBLICADA: &str = "https://starseed-os.vercel.app";
/// Puertos fijos del servidor local (los de `servidor_local_logica::PUERTOS`).
const PUERTOS_LOCALES: std::ops::RangeInclusive<u16> = 47610..=47619;

/// Lo que se evalúa en la página de la web publicada: lee el id de neurona de ESE origen y lo manda.
#[cfg_attr(not(all(target_os = "android", starseed_servidor_android)), allow(dead_code))]
pub const SCRIPT_PISTA: &str = r#"(function () {
  try {
    if (window.__starseedPistaEnviada) return;
    var t = window.__TAURI__ && window.__TAURI__.core;
    if (!t || typeof t.invoke !== "function") return;
    window.__starseedPistaEnviada = true;
    var id = null;
    try { id = window.localStorage.getItem("starseed.neuron.device-id"); } catch (e) { id = null; }
    t.invoke("pista_neurona", { id: id || null }).catch(function () { window.__starseedPistaEnviada = false; });
  } catch (e) {}
})();"#;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct Marcador {
    /// Arranques en los que se intentó.
    pub intentos: u32,
    /// La web publicada ya respondió (con o sin id).
    pub hecho: bool,
    /// El id de neurona del origen anterior (si lo había).
    pub id: Option<String>,
    /// Cuándo (epoch ms).
    pub ts: u64,
}

pub fn leer_marcador(texto: &str) -> Option<Marcador> {
    serde_json::from_str(texto).ok()
}

/// ¿Hay que pasar por la web publicada en este arranque?
pub fn pendiente(m: Option<&Marcador>) -> bool {
    match m {
        None => true,
        Some(m) => !m.hecho && m.intentos < MAX_INTENTOS,
    }
}

/// Un id de neurona aceptable (la misma regla que `leerNeuronaAnterior` de la web).
pub fn id_valido(id: &str) -> Option<String> {
    let t = id.trim();
    let mut c = t.chars();
    let primero = c.next()?;
    if !primero.is_ascii_alphanumeric() || t.len() < 6 || t.len() > 80 {
        return None;
    }
    if c.all(|x| x.is_ascii_alphanumeric() || matches!(x, '_' | '.' | '-')) {
        Some(t.to_string())
    } else {
        None
    }
}

/// Marcador tras un intento más (al salir hacia la web publicada).
pub fn tras_intento(previo: Option<&Marcador>, ahora: u64) -> Marcador {
    let mut m = previo.cloned().unwrap_or_default();
    m.intentos = m.intentos.saturating_add(1);
    m.ts = ahora;
    m
}

/// Marcador con la respuesta de la web publicada. Solo la primera cuenta (una vez hecho, no se pisa).
pub fn tras_respuesta(previo: Option<&Marcador>, id: Option<&str>, ahora: u64) -> Option<Marcador> {
    if previo.map(|m| m.hecho).unwrap_or(false) {
        return None;
    }
    let mut m = previo.cloned().unwrap_or_default();
    m.hecho = true;
    m.id = id.and_then(id_valido);
    m.ts = ahora;
    Some(m)
}

/// `esquema://host[:puerto]` de una URL (minúsculas); "" si no se entiende.
pub fn origen_de(url: &str) -> String {
    let Some((esquema, resto)) = url.split_once("://") else { return String::new() };
    let fin = resto.find(['/', '?', '#']).unwrap_or(resto.len());
    let host = &resto[..fin];
    if host.is_empty() || host.contains('@') {
        return String::new();
    }
    format!("{}://{}", esquema.to_ascii_lowercase(), host.to_ascii_lowercase())
}

/// ¿Es el origen del servidor local (http://127.0.0.1 en uno de sus diez puertos)?
pub fn es_origen_local(url: &str) -> bool {
    let o = origen_de(url);
    o.strip_prefix("http://127.0.0.1:").and_then(|p| p.parse::<u16>().ok()).map(|p| PUERTOS_LOCALES.contains(&p)).unwrap_or(false)
}

/// ¿Es el origen de la web publicada?
pub fn es_origen_publicado(url: &str, web: &str) -> bool {
    let o = origen_de(url);
    !o.is_empty() && o == origen_de(web)
}

/// La página de la web publicada por la que se pasa (estática; el service worker la guarda).
#[cfg_attr(not(all(target_os = "android", starseed_servidor_android)), allow(dead_code))]
pub fn url_pista(web: &str) -> String {
    format!("{}/offline.html?starseed-pista=1", web.trim_end_matches('/'))
}

/// ¿La ventana está ya en esa página?
#[cfg_attr(not(all(target_os = "android", starseed_servidor_android)), allow(dead_code))]
pub fn es_pagina_pista(url: &str, web: &str) -> bool {
    es_origen_publicado(url, web) && url.contains("starseed-pista=1")
}

// ───────────────────────────── Disco y comandos (pegamento con Tauri) ─────────────────────────────

fn ahora_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn ruta_marcador(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    use tauri::Manager;
    app.path().app_data_dir().ok().map(|d| d.join(MARCADOR))
}

fn leer(app: &tauri::AppHandle) -> Option<Marcador> {
    ruta_marcador(app).and_then(|r| std::fs::read_to_string(r).ok()).and_then(|t| leer_marcador(&t))
}

fn escribir(app: &tauri::AppHandle, m: &Marcador) -> Result<(), String> {
    let ruta = ruta_marcador(app).ok_or("Sin carpeta de datos de la app.")?;
    if let Some(dir) = ruta.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let texto = serde_json::to_string(m).map_err(|e| e.to_string())?;
    std::fs::write(&ruta, texto).map_err(|e| e.to_string())
}

/// ¿Hay que pasar por la web publicada en este arranque? (Android con servidor local)
#[cfg_attr(not(all(target_os = "android", starseed_servidor_android)), allow(dead_code))]
pub fn pendiente_en(app: &tauri::AppHandle) -> bool {
    pendiente(leer(app).as_ref())
}

/// Apunta un intento más (al salir hacia la web publicada).
#[cfg_attr(not(all(target_os = "android", starseed_servidor_android)), allow(dead_code))]
pub fn anotar_intento(app: &tauri::AppHandle) {
    let m = tras_intento(leer(app).as_ref(), ahora_ms());
    let _ = escribir(app, &m);
}

/// ¿Ya respondió la web publicada?
#[cfg_attr(not(all(target_os = "android", starseed_servidor_android)), allow(dead_code))]
pub fn recibida(app: &tauri::AppHandle) -> bool {
    leer(app).map(|m| m.hecho).unwrap_or(false)
}

/// La web publicada (ventana «main», solo su origen) manda el id de neurona que tenía. Una vez.
#[tauri::command]
pub fn pista_neurona(app: tauri::AppHandle, webview: tauri::Webview, id: Option<String>) -> Result<(), String> {
    if webview.label() != "main" {
        return Err("Esta ventana no puede hacer esto.".into());
    }
    let url = webview.url().map_err(|e| e.to_string())?;
    if !es_origen_publicado(url.as_str(), WEB_PUBLICADA) {
        return Err("Este origen no puede hacer esto.".into());
    }
    match tras_respuesta(leer(&app).as_ref(), id.as_deref(), ahora_ms()) {
        Some(m) => escribir(&app, &m),
        None => Ok(()),
    }
}

/// La web del servidor local (ventana «main», solo 127.0.0.1:47610…47619) lee la pista.
#[tauri::command]
pub fn pista_neurona_leer(app: tauri::AppHandle, webview: tauri::Webview) -> Result<Option<String>, String> {
    if webview.label() != "main" {
        return Err("Esta ventana no puede hacer esto.".into());
    }
    let url = webview.url().map_err(|e| e.to_string())?;
    if !es_origen_local(url.as_str()) {
        return Err("Este origen no puede hacer esto.".into());
    }
    Ok(leer(&app).filter(|m| m.hecho).and_then(|m| m.id))
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn pendiente_hasta_que_responde_o_tres_intentos() {
        assert!(pendiente(None));
        let uno = tras_intento(None, 1);
        assert_eq!(uno.intentos, 1);
        assert!(pendiente(Some(&uno)));
        let tres = tras_intento(Some(&tras_intento(Some(&uno), 2)), 3);
        assert_eq!(tres.intentos, 3);
        assert!(!pendiente(Some(&tres)));
        let hecho = tras_respuesta(Some(&uno), Some("e0b9faf2-0000-4000-8000-000000000001"), 4).unwrap();
        assert!(!pendiente(Some(&hecho)));
        assert_eq!(hecho.id.as_deref(), Some("e0b9faf2-0000-4000-8000-000000000001"));
    }

    #[test]
    fn la_respuesta_cuenta_una_vez_y_sin_ids_raros() {
        let hecho = tras_respuesta(None, None, 1).unwrap();
        assert!(hecho.hecho);
        assert_eq!(hecho.id, None);
        // Una segunda llamada no pisa la primera (ni con otro id).
        assert_eq!(tras_respuesta(Some(&hecho), Some("otro-id-000001"), 2), None);
        assert_eq!(tras_respuesta(None, Some("<script>"), 3).unwrap().id, None);
        assert_eq!(tras_respuesta(None, Some("  abcdef  "), 3).unwrap().id.as_deref(), Some("abcdef"));
    }

    #[test]
    fn ids_como_la_web() {
        assert_eq!(id_valido("e0b9faf2-0000-4000-8000-000000000001").as_deref(), Some("e0b9faf2-0000-4000-8000-000000000001"));
        assert_eq!(id_valido("n-lz3k2-ab12cd34").as_deref(), Some("n-lz3k2-ab12cd34"));
        assert_eq!(id_valido("abc"), None);
        assert_eq!(id_valido("-empieza-mal"), None);
        assert_eq!(id_valido("con espacio dentro"), None);
        assert_eq!(id_valido(&"a".repeat(81)), None);
    }

    #[test]
    fn origenes() {
        assert!(es_origen_local("http://127.0.0.1:47610/__starseed/entrar?t=x"));
        assert!(es_origen_local("http://127.0.0.1:47619/"));
        assert!(!es_origen_local("http://127.0.0.1:9002/"));
        assert!(!es_origen_local("http://localhost:47610/"));
        assert!(!es_origen_local("https://127.0.0.1:47610/"));
        assert!(es_origen_publicado("https://starseed-os.vercel.app/offline.html?starseed-pista=1", WEB_PUBLICADA));
        assert!(!es_origen_publicado("https://starseed-os.vercel.app.evil.com/", WEB_PUBLICADA));
        assert!(!es_origen_publicado("https://user@starseed-os.vercel.app/", WEB_PUBLICADA));
        assert_eq!(url_pista("https://starseed-os.vercel.app/"), "https://starseed-os.vercel.app/offline.html?starseed-pista=1");
        assert!(es_pagina_pista(&url_pista(WEB_PUBLICADA), WEB_PUBLICADA));
        assert!(!es_pagina_pista("https://starseed-os.vercel.app/", WEB_PUBLICADA));
    }

    #[test]
    fn marcador_se_lee_y_se_escribe() {
        let m = Marcador { intentos: 2, hecho: true, id: Some("abcdef".into()), ts: 9 };
        let t = serde_json::to_string(&m).unwrap();
        assert_eq!(leer_marcador(&t), Some(m));
        assert_eq!(leer_marcador("{roto"), None);
    }

    #[test]
    fn el_script_solo_lee_el_id_y_lo_manda() {
        assert!(SCRIPT_PISTA.contains("starseed.neuron.device-id"));
        assert!(SCRIPT_PISTA.contains("\"pista_neurona\""));
        assert!(!SCRIPT_PISTA.contains("sb-"));
    }
}
