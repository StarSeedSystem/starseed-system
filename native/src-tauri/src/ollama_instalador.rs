// ═══════════════════════════════════════════════════════════════════════════
// ollama_instalador — descarga guiada del instalador OFICIAL de Ollama (MOD1110B · 2026-11-10).
// Contrato: architecture/modelos-recomendados.md §11 (instalación guiada de Ollama).
// ---------------------------------------------------------------------------
// Reglas duras:
//   · SOLO escritorio macOS y Windows. En Linux la web enseña las instrucciones oficiales y NO se
//     ejecuta nada desde aquí; en Android y en la web, Ollama no corre.
//   · SOLO los anfitriones oficiales: ollama.com (/download/…), github.com (/ollama/ollama/releases/…)
//     y release-assets.githubusercontent.com (el CDN de esos mismos lanzamientos). Cada salto de
//     redirección se comprueba contra esa lista ANTES de seguirlo; cualquier otro anfitrión se rechaza.
//   · SOLO a la carpeta Descargas de la persona, con nombre fijo (Ollama.dmg / OllamaSetup.exe).
//   · NUNCA ejecuta el instalador en silencio ni pide privilegios elevados: lo ABRE con el programa del
//     sistema (open / explorer) y la persona completa la instalación; el sistema comprueba la firma.
//   · Cancelar o fallar borra el archivo parcial: no queda nada a medias.
// Solo std + curl (como `disco.rs`); la parte pura se prueba sin la app.
// ═══════════════════════════════════════════════════════════════════════════

use crate::disco;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

pub const EVENTO_OLLAMA: &str = "starseed://ollama-descarga";
/// Tope de cordura del tamaño (el instalador de Windows pesa ~1,9 GB el 2026-11-10).
pub const TAMANO_MAX_BYTES: u64 = 4 * 1024 * 1024 * 1024;
/// Por debajo de esto no puede ser el instalador (una página de error, por ejemplo).
pub const TAMANO_MIN_BYTES: u64 = 20 * 1024 * 1024;
const SALTOS_MAX: usize = 5;

static EN_CURSO: AtomicBool = AtomicBool::new(false);
/// (SEG1111U) El instalador que ESTE proceso descargó y verificó (ruta, tamaño): solo ese se abre.
static DESCARGADO: std::sync::Mutex<Option<(PathBuf, u64)>> = std::sync::Mutex::new(None);
static CANCELAR: AtomicBool = AtomicBool::new(false);

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProgresoOllama {
    /// "comprobando" | "descargando" | "lista" | "cancelada" | "error"
    pub fase: String,
    pub descargado: u64,
    pub total: u64,
    /// 0–100 (0 mientras no se conoce el total).
    pub porcentaje: u8,
}

fn prog(fase: &str, descargado: u64, total: u64) -> ProgresoOllama {
    ProgresoOllama { fase: fase.into(), descargado, total, porcentaje: porcentaje(descargado, total) }
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ResultadoOllama {
    pub ruta: String,
    pub bytes: u64,
}

// ── Parte pura ──────────────────────────────────────────────────────────────────────────────────

/// El sistema en el que corre esta app, con los mismos nombres que usa la web.
pub fn sistema_actual() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "otro"
    }
}

/// (nombre del archivo en Descargas, URL oficial de descarga) del sistema indicado.
pub fn oficial_para(sistema: &str) -> Result<(&'static str, &'static str), String> {
    match sistema {
        "macos" => Ok(("Ollama.dmg", "https://ollama.com/download/Ollama.dmg")),
        "windows" => Ok(("OllamaSetup.exe", "https://ollama.com/download/OllamaSetup.exe")),
        "linux" => Err("En Linux StarSeed no instala Ollama: sigue las instrucciones oficiales de ollama.com/download.".into()),
        _ => Err("Ollama no corre en este sistema.".into()),
    }
}

/// ¿Es una URL oficial? https, sin usuario ni puerto, y solo los anfitriones/rutas de la lista cerrada.
pub fn url_permitida(url: &str) -> bool {
    let Some(resto) = url.strip_prefix("https://") else { return false };
    if resto.chars().any(|c| c.is_control() || c.is_whitespace() || c == '\\') {
        return false;
    }
    let fin = resto.find(['/', '?', '#']).unwrap_or(resto.len());
    let (host, ruta) = resto.split_at(fin);
    if host.is_empty() || host.contains('@') || host.contains(':') {
        return false;
    }
    let host = host.to_ascii_lowercase();
    match host.as_str() {
        "ollama.com" => ruta.starts_with("/download/") && !ruta.contains(".."),
        "github.com" => ruta.starts_with("/ollama/ollama/releases/") && !ruta.contains(".."),
        // El CDN de los archivos de lanzamientos de GitHub (URL firmada y de corta vida).
        "release-assets.githubusercontent.com" => ruta.starts_with("/github-production-release-asset/"),
        _ => false,
    }
}

#[derive(Debug, PartialEq, Default)]
pub struct Cabeceras {
    pub estado: u16,
    pub location: Option<String>,
    pub longitud: Option<u64>,
}

/// Lee el ÚLTIMO bloque de cabeceras de la salida de `curl -I` (un proxy puede anteponer su propio «200 Connection Established»).
pub fn leer_cabeceras(texto: &str) -> Cabeceras {
    let norm = texto.replace("\r\n", "\n");
    let bloque = norm
        .split("\n\n")
        .map(str::trim)
        .filter(|b| b.starts_with("HTTP/"))
        .last()
        .unwrap_or("");
    let mut c = Cabeceras::default();
    for (i, linea) in bloque.lines().enumerate() {
        if i == 0 {
            c.estado = linea.split_whitespace().nth(1).and_then(|s| s.parse().ok()).unwrap_or(0);
            continue;
        }
        if let Some((k, v)) = linea.split_once(':') {
            match k.trim().to_ascii_lowercase().as_str() {
                "location" => c.location = Some(v.trim().to_string()),
                "content-length" => c.longitud = v.trim().parse().ok(),
                _ => {}
            }
        }
    }
    c
}

/// Carpeta y nombre de destino: SIEMPRE `<Descargas>/<nombre fijo>`.
pub fn ruta_destino(descargas: &Path, nombre: &str) -> Result<PathBuf, String> {
    if nombre != "Ollama.dmg" && nombre != "OllamaSetup.exe" {
        return Err("Nombre de instalador no permitido.".into());
    }
    Ok(descargas.join(nombre))
}

/// ¿Es `ruta` exactamente uno de los instaladores que esta app deja en Descargas?
pub fn ruta_abrible(descargas: &Path, ruta: &Path) -> bool {
    let Some(nombre) = ruta.file_name().and_then(|n| n.to_str()) else { return false };
    (nombre == "Ollama.dmg" || nombre == "OllamaSetup.exe") && ruta.parent() == Some(descargas)
}

pub fn porcentaje(descargado: u64, total: u64) -> u8 {
    if total == 0 {
        0
    } else {
        ((descargado.min(total) as u128 * 100) / total as u128) as u8
    }
}

/// ¿El tamaño anunciado es creíble para un instalador y cabe en el disco libre (con 10 % de margen)?
pub fn tamano_valido(total: u64, libre: Option<u64>) -> Result<(), String> {
    if !(TAMANO_MIN_BYTES..=TAMANO_MAX_BYTES).contains(&total) {
        return Err(format!("El tamaño anunciado ({} MB) no es el de un instalador de Ollama: no se descarga.", total / 1_048_576));
    }
    let libre = libre.ok_or("No se pudo medir el disco libre: no se descarga a ciegas.")?;
    let necesario = total.saturating_add(total / 10);
    if libre < necesario {
        return Err(format!("Falta disco: hacen falta {} MB libres y hay {} MB.", necesario / 1_048_576, libre / 1_048_576));
    }
    Ok(())
}

// ── Red (curl) ──────────────────────────────────────────────────────────────────────────────────

fn cabeceras_de(url: &str) -> Result<Cabeceras, String> {
    let sal = disco::orden("curl")
        .args(["-sS", "-I", "--max-time", "25", "--proto", "=https", "--max-redirs", "0", url])
        .output()
        .map_err(|e| format!("No se pudo lanzar curl: {e}"))?;
    if !sal.status.success() {
        return Err(format!("No pude consultar {url}: {}", String::from_utf8_lossy(&sal.stderr).trim()));
    }
    Ok(leer_cabeceras(&String::from_utf8_lossy(&sal.stdout)))
}

/// Sigue las redirecciones a mano: cada salto debe ser una URL oficial. Devuelve (URL final, tamaño).
fn resolver(url_inicial: &str) -> Result<(String, u64), String> {
    let mut url = url_inicial.to_string();
    for _ in 0..=SALTOS_MAX {
        if !url_permitida(&url) {
            return Err("La redirección apunta fuera de los anfitriones oficiales de Ollama: se rechaza.".into());
        }
        let c = cabeceras_de(&url)?;
        match c.estado {
            200 => return Ok((url, c.longitud.ok_or("El servidor no dijo el tamaño del instalador: no se descarga.")?)),
            301 | 302 | 303 | 307 | 308 => url = c.location.ok_or("Redirección sin destino.")?,
            otro => return Err(format!("El servidor respondió {otro}: no se descarga.")),
        }
    }
    Err("Demasiadas redirecciones.".into())
}

/// Descarga el instalador oficial a `descargas`. Bloqueante: la glue lo llama desde `spawn_blocking`.
pub fn descargar(
    sistema: &str,
    descargas: &Path,
    mut progreso: impl FnMut(ProgresoOllama),
    cancelado: impl Fn() -> bool,
) -> Result<ResultadoOllama, String> {
    if sistema != sistema_actual() {
        return Err("Solo se descarga el instalador del sistema en el que corre esta app.".into());
    }
    let (nombre, url) = oficial_para(sistema)?;
    let destino = ruta_destino(descargas, nombre)?;
    let parcial = descargas.join(format!("{nombre}.parcial"));
    progreso(prog("comprobando", 0, 0));
    let (final_url, total) = resolver(url)?;
    tamano_valido(total, disco::espacio_libre(descargas))?;
    let _ = std::fs::remove_file(&parcial);
    let mut hijo = disco::orden("curl")
        .args(["--fail", "--silent", "--show-error", "--proto", "=https", "--max-redirs", "0", "-o"])
        .arg(&parcial)
        .arg(&final_url)
        .spawn()
        .map_err(|e| format!("No se pudo lanzar curl: {e}"))?;
    let estado = loop {
        match hijo.try_wait() {
            Ok(Some(st)) => break st,
            Ok(None) => {}
            Err(e) => {
                let _ = std::fs::remove_file(&parcial);
                return Err(format!("Se perdió la descarga: {e}"));
            }
        }
        if cancelado() {
            let _ = hijo.kill();
            let _ = hijo.wait();
            let _ = std::fs::remove_file(&parcial);
            progreso(prog("cancelada", 0, total));
            return Err("Descarga cancelada: no se guardó nada.".into());
        }
        std::thread::sleep(Duration::from_millis(400));
        let ya = std::fs::metadata(&parcial).map(|m| m.len()).unwrap_or(0);
        progreso(prog("descargando", ya, total));
    };
    let bytes = std::fs::metadata(&parcial).map(|m| m.len()).unwrap_or(0);
    if !estado.success() || bytes != total {
        let _ = std::fs::remove_file(&parcial);
        return Err(format!(
            "La descarga no se completó ({} de {} MB): se borró lo bajado, no queda nada a medias.",
            bytes / 1_048_576,
            total / 1_048_576
        ));
    }
    let _ = std::fs::remove_file(&destino);
    std::fs::rename(&parcial, &destino).map_err(|e| {
        let _ = std::fs::remove_file(&parcial);
        format!("No se pudo colocar el instalador en Descargas: {e}")
    })?;
    progreso(prog("lista", total, total));
    Ok(ResultadoOllama { ruta: destino.to_string_lossy().to_string(), bytes })
}

// ── Comandos de Tauri ───────────────────────────────────────────────────────────────────────────

fn carpeta_descargas(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().download_dir().map_err(|e| format!("No encuentro la carpeta Descargas: {e}"))
}

/// Descarga el instalador oficial a Descargas, con progreso por el evento `starseed://ollama-descarga`.
#[tauri::command]
pub async fn ollama_instalador_descargar(app: AppHandle, sistema: String) -> Result<ResultadoOllama, String> {
    let descargas = carpeta_descargas(&app)?;
    if EN_CURSO.swap(true, Ordering::SeqCst) {
        return Err("Ya hay una descarga de Ollama en curso.".into());
    }
    CANCELAR.store(false, Ordering::SeqCst);
    let aviso = app.clone();
    let r = tauri::async_runtime::spawn_blocking(move || {
        descargar(&sistema, &descargas, |p| { let _ = aviso.emit(EVENTO_OLLAMA, p); }, || CANCELAR.load(Ordering::SeqCst))
    })
    .await
    .map_err(|e| e.to_string());
    EN_CURSO.store(false, Ordering::SeqCst);
    let r = r?;
    if let Ok(ok) = &r {
        if let Ok(mut d) = DESCARGADO.lock() {
            *d = Some((PathBuf::from(&ok.ruta), ok.bytes));
        }
    }
    r
}

/// (SEG1111U) ¿Es `ruta` el instalador que este proceso descargó, con el mismo tamaño? (puro)
pub fn es_el_descargado(descargado: Option<&(PathBuf, u64)>, ruta: &Path, bytes_ahora: Option<u64>) -> bool {
    matches!((descargado, bytes_ahora), (Some((r, b)), Some(ahora)) if r == ruta && *b == ahora)
}

/// Cancela la descarga en curso (borra el parcial). Devuelve si había una.
#[tauri::command]
pub fn ollama_instalador_cancelar() -> bool {
    let habia = EN_CURSO.load(Ordering::SeqCst);
    if habia {
        CANCELAR.store(true, Ordering::SeqCst);
    }
    habia
}

/// Abre el instalador descargado con el programa del sistema (la persona completa la instalación) o,
/// con `revelar`, lo muestra en el explorador de archivos. NUNCA lo ejecuta en silencio.
///
/// (SEG1111U) Abrir un instalador ejecuta un programa (en Windows, `explorer OllamaSetup.exe` lo lanza):
/// exige «acceso al equipo» en este aparato, que sea el archivo que ESTE proceso descargó (mismo tamaño)
/// y un «sí» en un diálogo nativo cada vez (instalar software se confirma siempre, §4 regla 4).
/// Enseñarlo en el Finder/Explorador (`revelar`) no ejecuta nada y no lo necesita.
#[tauri::command]
pub async fn ollama_instalador_abrir(app: AppHandle, webview: tauri::Webview, ruta: String, revelar: Option<bool>) -> Result<(), String> {
    let descargas = carpeta_descargas(&app)?;
    let ruta = PathBuf::from(ruta);
    if !ruta_abrible(&descargas, &ruta) {
        return Err("Solo se abre el instalador de Ollama que StarSeed dejó en Descargas.".into());
    }
    if !ruta.is_file() {
        return Err("El instalador ya no está en Descargas: vuelve a descargarlo.".into());
    }
    let revelar = revelar == Some(true);
    if !revelar {
        let origen = crate::acceso_equipo::exigir(&app, &webview, "abrir instalador de Ollama")?;
        let descargado = DESCARGADO.lock().ok().and_then(|d| d.clone());
        let bytes = std::fs::metadata(&ruta).ok().map(|m| m.len());
        if !es_el_descargado(descargado.as_ref(), &ruta, bytes) {
            crate::acceso_equipo::anotar(&app, "rechazada", &origen, "abrir instalador de Ollama · no es el que descargó esta app");
            return Err("Solo se abre el instalador que StarSeed acaba de descargar y comprobar: vuelve a descargarlo (o ábrelo tú desde Descargas).".into());
        }
        let nombre = ruta.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        crate::acceso_equipo::confirmar(
            &app,
            &webview,
            "StarSeed OS · ¿Abrir el instalador de Ollama?",
            format!(
                "StarSeed descargó {nombre} de la web oficial de Ollama a tu carpeta Descargas.\n\n\
                 Abrirlo instala software en este aparato: tu sistema comprobará la firma del editor y tú completas la instalación.\n\n¿Lo abres?"
            ),
            "Abrir",
        )
        .await
        .inspect_err(|e| crate::acceso_equipo::anotar(&app, "no abierto", &origen, e.split(" · ").next().unwrap_or("")))?;
        crate::acceso_equipo::anotar(&app, "abierto", &origen, &format!("instalador de Ollama {nombre}"));
    }
    #[cfg(target_os = "macos")]
    {
        let mut o = disco::orden("open");
        if revelar {
            o.arg("-R");
        }
        o.arg(&ruta).spawn().map(|_| ()).map_err(|e| format!("No se pudo abrir: {e}"))
    }
    #[cfg(target_os = "windows")]
    {
        let mut o = disco::orden("explorer.exe");
        if revelar {
            let mut sel = std::ffi::OsString::from("/select,");
            sel.push(&ruta);
            o.arg(sel);
        } else {
            o.arg(&ruta);
        }
        o.spawn().map(|_| ()).map_err(|e| format!("No se pudo abrir: {e}"))
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = revelar;
        Err("En este sistema StarSeed no abre instaladores de Ollama.".into())
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn solo_los_anfitriones_oficiales() {
        assert!(url_permitida("https://ollama.com/download/Ollama.dmg"));
        assert!(url_permitida("https://github.com/ollama/ollama/releases/download/v0.40.16/Ollama.dmg"));
        assert!(url_permitida("https://release-assets.githubusercontent.com/github-production-release-asset/658928958/abc?sig=1"));
        for mala in [
            "http://ollama.com/download/Ollama.dmg",
            "https://ollama.com.evil.example/download/Ollama.dmg",
            "https://evil.example/download/Ollama.dmg",
            "https://ollama.com@evil.example/download/Ollama.dmg",
            "https://ollama.com:8443/download/Ollama.dmg",
            "https://ollama.com/install.sh",
            "https://ollama.com/download/../install.sh",
            "https://github.com/otro/repo/releases/download/v1/Ollama.dmg",
            "https://githubusercontent.com/github-production-release-asset/1",
            "https://raw.githubusercontent.com/ollama/ollama/main/x",
            "https://objects.githubusercontent.com/github-production-release-asset/1",
            "https://ollama.com/download/Ollama.dmg\\@evil.example",
            "ftp://ollama.com/download/Ollama.dmg",
            "https://",
        ] {
            assert!(!url_permitida(mala), "debía rechazar {mala}");
        }
    }

    #[test]
    fn lee_cabeceras_de_curl_con_proxy_delante() {
        let t = "HTTP/1.1 200 Connection Established\r\n\r\nHTTP/2 307 \r\ncontent-type: text/html\r\nlocation: https://github.com/ollama/ollama/releases/latest/download/Ollama.dmg\r\n\r\n";
        let c = leer_cabeceras(t);
        assert_eq!(c.estado, 307);
        assert_eq!(c.location.as_deref(), Some("https://github.com/ollama/ollama/releases/latest/download/Ollama.dmg"));
        let f = leer_cabeceras("HTTP/1.1 200 OK\nContent-Length: 229996388\nContent-Type: application/octet-stream\n\n");
        assert_eq!((f.estado, f.longitud), (200, Some(229_996_388)));
        assert_eq!(leer_cabeceras("basura"), Cabeceras::default());
    }

    #[test]
    fn oficial_por_sistema_y_linux_no() {
        assert_eq!(oficial_para("macos").unwrap().0, "Ollama.dmg");
        assert_eq!(oficial_para("windows").unwrap().0, "OllamaSetup.exe");
        assert!(oficial_para("linux").is_err());
        assert!(oficial_para("android").is_err());
        assert!(url_permitida(oficial_para("macos").unwrap().1) && url_permitida(oficial_para("windows").unwrap().1));
    }

    #[test]
    fn destino_y_apertura_solo_en_descargas() {
        let d = Path::new("/Users/x/Downloads");
        assert_eq!(ruta_destino(d, "Ollama.dmg").unwrap(), d.join("Ollama.dmg"));
        assert!(ruta_destino(d, "../.bashrc").is_err());
        assert!(ruta_abrible(d, &d.join("Ollama.dmg")));
        assert!(ruta_abrible(d, &d.join("OllamaSetup.exe")));
        assert!(!ruta_abrible(d, &d.join("otro.dmg")));
        assert!(!ruta_abrible(d, Path::new("/tmp/Ollama.dmg")));
        assert!(!ruta_abrible(d, &d.join("sub").join("Ollama.dmg")));
    }

    #[test]
    fn tamano_y_disco() {
        let gb = 1024 * 1024 * 1024u64;
        assert!(tamano_valido(230_000_000, Some(10 * gb)).is_ok());
        assert!(tamano_valido(1_900_000_000, Some(2 * gb)).is_ok());
        assert!(tamano_valido(1_900_000_000, Some(gb)).is_err());
        assert!(tamano_valido(5_000, Some(10 * gb)).is_err());
        assert!(tamano_valido(9 * gb, Some(100 * gb)).is_err());
        assert!(tamano_valido(230_000_000, None).is_err());
    }

    #[test]
    fn solo_se_abre_el_que_descargo_esta_app() {
        let d = Path::new("/u/Descargas");
        let r = d.join("Ollama.dmg");
        let hecho = (r.clone(), 100u64);
        assert!(es_el_descargado(Some(&hecho), &r, Some(100)));
        assert!(!es_el_descargado(None, &r, Some(100)), "tras reiniciar la app no hay descarga propia");
        assert!(!es_el_descargado(Some(&hecho), &r, Some(101)), "otro archivo con el mismo nombre");
        assert!(!es_el_descargado(Some(&hecho), &d.join("OllamaSetup.exe"), Some(100)));
        assert!(!es_el_descargado(Some(&hecho), &r, None));
    }

    #[test]
    fn porcentajes() {
        assert_eq!(porcentaje(0, 0), 0);
        assert_eq!(porcentaje(50, 200), 25);
        assert_eq!(porcentaje(300, 200), 100);
    }

    #[test]
    fn rechaza_el_sistema_ajeno_sin_tocar_la_red() {
        let ajeno = if cfg!(target_os = "windows") { "macos" } else { "windows" };
        let mut avisos = 0;
        let r = descargar(ajeno, Path::new("/tmp"), |_| avisos += 1, || false);
        assert!(r.is_err());
        assert_eq!(avisos, 0);
    }
}
