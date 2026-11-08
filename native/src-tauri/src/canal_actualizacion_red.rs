// ═══════════════════════════════════════════════════════════════════════════
// Rutas y reintentos de la actualización de escritorio (ACT1108B, 2026-11-08) — parte PURA.
// Contrato: architecture/centro-versiones-1105.md §9 (ruta alternativa por la API de GitHub).
// ---------------------------------------------------------------------------
// Por qué existe: el 08/11 `releases/download/…` (y `releases/latest/download/…`) devolvió 504 desde
// GitHub mientras `api.github.com` respondía bien. El updater con una sola ruta y sin reintentos se
// quedaba en «Could not fetch a valid release JSON from the remote».
//
// Diseño (el más simple que aguanta, sin tocar el CI ni la firma):
//   · Ruta DIRECTA  = la URL de siempre (`releases/download/<etiqueta>/<archivo>`).
//   · Ruta API      = `https://api.github.com/repos/<repo>/releases/assets/<id>` con
//                     `Accept: application/octet-stream` (GitHub responde 302 al archivo). El `<id>` sale
//                     de `releases/tags/<etiqueta>` o `releases/latest` (repositorio público: sin token).
//   · Se prueba directa → API → directa → API (4 intentos; el 2.º sin esperar y los demás con pausa:
//     ~1 min entre el primero y el último), solo con
//     errores de red o 5xx. La FIRMA minisign de cada paquete la sigue verificando tauri-plugin-updater
//     sobre los bytes descargados, vengan por la ruta que vengan: aquí no se toca ni se desactiva.
//   · `Espejo` es el hueco tipado de F7 (red-sin-dependencias.md): una neurona que ya tiene el paquete
//     lo sirve a las demás. HOY no se construye: `rutas_espejo()` devuelve vacío.
//
// Solo std + serde_json. Se prueba sin red ni Tauri.
// ═══════════════════════════════════════════════════════════════════════════

#![allow(dead_code)]

use serde_json::Value;

/// Pausas ANTES de cada intento, en segundos: 0, 0 (otra ruta, sin esperar), 15 y 40 (≈ 1 min en total
/// entre el primero y el último; 4 intentos que alternan directa y API).
pub const PAUSAS_SEGUNDOS: [u64; 4] = [0, 0, 15, 40];

/// La pausa antes del intento `i` (el último valor se repite si hay más intentos que pausas).
pub fn pausa_antes(i: usize) -> u64 {
    PAUSAS_SEGUNDOS[i.min(PAUSAS_SEGUNDOS.len() - 1)]
}

/// Por dónde se pide un archivo de un Release.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Ruta {
    /// La URL de siempre (`releases/download/…`).
    Directa,
    /// Por la API de GitHub (`releases/assets/<id>`).
    Api,
    /// F7 (aún sin construir): una neurona de la red local/par que ya tiene el paquete.
    Espejo(String),
}

impl Ruta {
    pub fn etiqueta(&self) -> &'static str {
        match self {
            Ruta::Directa => "directa",
            Ruta::Api => "api",
            Ruta::Espejo(_) => "espejo",
        }
    }
}

/// Espejos de neuronas vecinas para un archivo. HOY vacío: el hueco existe para que F7 se enchufe aquí
/// sin cambiar el reintento (cada espejo sería un intento más, ANTES de la API).
pub fn rutas_espejo(_nombre_archivo: &str) -> Vec<String> {
    Vec::new()
}

/// Secuencia de rutas de los intentos: espejos (si los hay), directa, API, directa, API.
pub fn secuencia_rutas(espejos: &[String]) -> Vec<Ruta> {
    let mut v: Vec<Ruta> = espejos.iter().map(|e| Ruta::Espejo(e.clone())).collect();
    v.extend([Ruta::Directa, Ruta::Api, Ruta::Directa, Ruta::Api]);
    v
}

/// ¿Merece la pena reintentar (y cambiar de ruta) con este error? Red caída, tiempo agotado, 5xx, 429
/// y el genérico del updater cuando la ruta no devolvió un JSON válido (un 504 llega así). Una firma
/// inválida, un 404 o un paquete corrupto NO se reintentan: no los arregla otra ruta.
pub fn es_reintentable(error: &str) -> bool {
    let e = error.to_ascii_lowercase();
    if e.contains("signature") || e.contains("firma") || e.contains("404") || e.contains("not found") && !e.contains("release") {
        return false;
    }
    [
        "could not fetch a valid release",
        "error sending request",
        "timed out",
        "timeout",
        "connection",
        "dns",
        "network",
        "tls",
        "reset by peer",
        "unexpected eof",
        "request or response body error",
        "error decoding response body",
        "429",
        "500",
        "502",
        "503",
        "504",
        "bad gateway",
        "gateway",
    ]
    .iter()
    .any(|s| e.contains(s))
}

/// Un archivo de un Release de GitHub, separado en sus partes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArchivoRelease {
    pub propietario: String,
    pub repo: String,
    /// `None` = `releases/latest/download/…`
    pub etiqueta: Option<String>,
    pub nombre: String,
}

/// `https://github.com/<o>/<r>/releases/download/<etiqueta>/<archivo>` o
/// `https://github.com/<o>/<r>/releases/latest/download/<archivo>`. Cualquier otra cosa: `None`.
pub fn analizar_url_release(url: &str) -> Option<ArchivoRelease> {
    let resto = url.trim().strip_prefix("https://github.com/")?;
    let sin_query = resto.split(['?', '#']).next()?;
    let p: Vec<&str> = sin_query.split('/').collect();
    let valido = |s: &str| !s.is_empty() && s != "." && s != ".." && !s.contains('\\');
    // o / r / releases / download / etiqueta / archivo
    if p.len() == 6 && p[2] == "releases" && p[3] == "download" && p.iter().all(|s| valido(s)) {
        return Some(ArchivoRelease { propietario: p[0].into(), repo: p[1].into(), etiqueta: Some(p[4].into()), nombre: p[5].into() });
    }
    // o / r / releases / latest / download / archivo
    if p.len() == 6 && p[2] == "releases" && p[3] == "latest" && p[4] == "download" && p.iter().all(|s| valido(s)) {
        return Some(ArchivoRelease { propietario: p[0].into(), repo: p[1].into(), etiqueta: None, nombre: p[5].into() });
    }
    None
}

/// La URL de la API que lista los archivos de ese Release.
pub fn url_lista_api(a: &ArchivoRelease) -> String {
    match &a.etiqueta {
        Some(t) => format!("https://api.github.com/repos/{}/{}/releases/tags/{}", a.propietario, a.repo, t),
        None => format!("https://api.github.com/repos/{}/{}/releases/latest", a.propietario, a.repo),
    }
}

/// De la respuesta de `releases/tags/<etiqueta>` (o `latest`), la URL de API del archivo por su nombre.
/// Solo vale si cuelga de `https://api.github.com/repos/<o>/<r>/releases/assets/<id numérico>`.
pub fn url_api_del_archivo(release: &Value, a: &ArchivoRelease) -> Option<String> {
    let esperado = format!("https://api.github.com/repos/{}/{}/releases/assets/", a.propietario, a.repo);
    for asset in release.get("assets")?.as_array()? {
        if asset.get("name").and_then(Value::as_str) != Some(a.nombre.as_str()) {
            continue;
        }
        if let Some(id) = asset.get("id").and_then(Value::as_u64) {
            return Some(format!("{esperado}{id}"));
        }
        if let Some(u) = asset.get("url").and_then(Value::as_str) {
            let id = u.strip_prefix(esperado.as_str())?;
            if !id.is_empty() && id.bytes().all(|b| b.is_ascii_digit()) {
                return Some(u.to_string());
            }
        }
    }
    None
}

/// El texto que ve la persona cuando una ruta falla y se pasa a otra (o se reintenta). En español neutro.
pub fn mensaje_reintento(error: &str, intento: usize, total: usize, siguiente: &Ruta) -> String {
    let e = error.to_ascii_lowercase();
    let causa = if e.contains("504") || e.contains("502") || e.contains("503") || e.contains("500") || e.contains("could not fetch a valid release") || e.contains("gateway") {
        "GitHub no respondió"
    } else if e.contains("timed out") || e.contains("timeout") {
        "GitHub tardó demasiado"
    } else {
        "No hubo conexión con GitHub"
    };
    let donde = match siguiente {
        Ruta::Directa => "de nuevo por la ruta directa",
        Ruta::Api => "por otra ruta (la API de GitHub)",
        Ruta::Espejo(_) => "desde otra neurona cercana",
    };
    format!("{causa}. Lo intento {donde}… (intento {} de {total})", intento + 1)
}

/// El texto final cuando se agotaron los intentos.
pub fn mensaje_agotado(error: &str) -> String {
    let e = error.to_ascii_lowercase();
    if e.contains("signature") || e.contains("firma") {
        return "La firma de la versión nueva no es válida: no se instala. Reintenta más tarde.".into();
    }
    if es_reintentable(error) {
        "No se pudo comprobar con GitHub por ninguna ruta (¿sin conexión o GitHub caído?). Reintenta en unos minutos.".into()
    } else {
        format!("No se pudo comprobar actualizaciones: {error}")
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use serde_json::json;

    #[test]
    fn analiza_urls_de_release() {
        let a = analizar_url_release("https://github.com/StarSeedSystem/starseed-system/releases/download/canal-pruebas/latest-prueba.json").unwrap();
        assert_eq!(a.etiqueta.as_deref(), Some("canal-pruebas"));
        assert_eq!(a.nombre, "latest-prueba.json");
        assert_eq!(url_lista_api(&a), "https://api.github.com/repos/StarSeedSystem/starseed-system/releases/tags/canal-pruebas");
        let l = analizar_url_release("https://github.com/StarSeedSystem/starseed-system/releases/latest/download/latest.json").unwrap();
        assert_eq!(l.etiqueta, None);
        assert_eq!(url_lista_api(&l), "https://api.github.com/repos/StarSeedSystem/starseed-system/releases/latest");
    }

    #[test]
    fn rechaza_lo_que_no_es_un_release() {
        assert!(analizar_url_release("http://github.com/o/r/releases/download/t/f").is_none());
        assert!(analizar_url_release("https://evil.example/o/r/releases/download/t/f").is_none());
        assert!(analizar_url_release("https://github.com/o/r/releases/download/t/../f").is_none());
        assert!(analizar_url_release("https://github.com/o/r/archive/main.zip").is_none());
        assert!(analizar_url_release("https://github.com/o/r/releases/download/t").is_none());
    }

    #[test]
    fn resuelve_el_asset_por_nombre() {
        let a = analizar_url_release("https://github.com/o/r/releases/download/canal-pruebas/latest-prueba.json").unwrap();
        let rel = json!({"assets":[{"name":"otro.dmg","id":1},{"name":"latest-prueba.json","id":987654,"url":"https://api.github.com/repos/o/r/releases/assets/987654"}]});
        assert_eq!(url_api_del_archivo(&rel, &a).as_deref(), Some("https://api.github.com/repos/o/r/releases/assets/987654"));
        assert!(url_api_del_archivo(&json!({"assets":[]}), &a).is_none());
        assert!(url_api_del_archivo(&json!({}), &a).is_none());
    }

    #[test]
    fn no_acepta_urls_de_api_ajenas() {
        let a = analizar_url_release("https://github.com/o/r/releases/download/t/f.json").unwrap();
        let rel = json!({"assets":[{"name":"f.json","url":"https://evil.example/repos/o/r/releases/assets/5"}]});
        assert!(url_api_del_archivo(&rel, &a).is_none());
        let rel2 = json!({"assets":[{"name":"f.json","url":"https://api.github.com/repos/o/r/releases/assets/5x"}]});
        assert!(url_api_del_archivo(&rel2, &a).is_none());
    }

    #[test]
    fn reintenta_red_y_5xx_pero_no_firma_ni_404() {
        assert!(es_reintentable("Could not fetch a valid release JSON from the remote"));
        assert!(es_reintentable("error sending request for url (https://github.com/…): connection reset"));
        assert!(es_reintentable("HTTP status server error (504 Gateway Timeout)"));
        assert!(es_reintentable("operation timed out"));
        assert!(!es_reintentable("The signature could not be verified"));
        assert!(!es_reintentable("HTTP status client error (404 Not Found)"));
        assert!(!es_reintentable("algo raro"));
    }

    #[test]
    fn secuencia_y_pausas() {
        assert_eq!(secuencia_rutas(&[]), vec![Ruta::Directa, Ruta::Api, Ruta::Directa, Ruta::Api]);
        assert_eq!(PAUSAS_SEGUNDOS.iter().sum::<u64>(), 55);
        assert_eq!(pausa_antes(1), 0);
        assert_eq!(pausa_antes(3), 40);
        assert_eq!(pausa_antes(9), 40);
        // Con un espejo (F7), va primero.
        let con = secuencia_rutas(&["http://192.168.1.5:8765/p".to_string()]);
        assert_eq!(con[0].etiqueta(), "espejo");
        assert!(rutas_espejo("x.tar.gz").is_empty());
    }

    #[test]
    fn mensajes_claros() {
        let m = mensaje_reintento("Could not fetch a valid release JSON from the remote", 0, 3, &Ruta::Api);
        assert!(m.starts_with("GitHub no respondió. Lo intento por otra ruta"));
        assert!(m.contains("intento 1 de 3"));
        assert!(mensaje_agotado("The signature could not be verified").contains("firma"));
        assert!(mensaje_agotado("error sending request").contains("ninguna ruta"));
    }
}
