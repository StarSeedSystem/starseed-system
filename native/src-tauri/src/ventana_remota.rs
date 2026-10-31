// ═══════════════════════════════════════════════════════════════════════════
// StarSeed Native — Ventana remota: anfitrión de apps prestables (solo escritorio)
// ---------------------------------------------------------------------------
// §9 de architecture/apps-en-la-malla.md: la web (Aurora) pide la lista de
// ventanas de las apps que el dueño marcó como prestables y captura el
// fotograma de la elegida. xcap 0.9: `Window::all()` (la lista ya es global,
// no hace falta recorrer monitores), `app_name()`, `title()` e `id()` (todos
// devuelven Result) y `capture_image()` (devuelve un `image::RgbaImage` de
// image 0.25). PNG en base64 con el engine de base64 0.22.
// (APR1019B) añadirá `entrada_ventana` (teclado y ratón con enigo 0.6).
// ═══════════════════════════════════════════════════════════════════════════

use base64::Engine as _;
use serde::Serialize;
use std::collections::HashSet;
use tauri::AppHandle;

/// Información de una ventana para enviar a la web.
#[derive(Serialize, Clone)]
pub struct VentanaInfo {
    /// Identificador único de la ventana (lo usan los otros comandos).
    pub id: u32,
    /// Nombre de la aplicación (proceso) dueña de la ventana.
    pub app_name: String,
    /// Título de la ventana tal como lo muestra el sistema.
    pub title: String,
}

/// Lista de ventanas prestables (las de apps marcadas como prestables por su dueño).
#[tauri::command]
pub fn ventanas_prestables(_app: AppHandle, apps: Vec<String>) -> Result<Vec<VentanaInfo>, String> {
    ventanas_prestables_interno(apps)
}

/// Cuerpo real de `ventanas_prestables`, separado para poder probarlo sin Tauri.
fn ventanas_prestables_interno(apps: Vec<String>) -> Result<Vec<VentanaInfo>, String> {
    // HashSet para la búsqueda de apps prestables: O(1) por ventana.
    let apps_set: HashSet<String> = apps.into_iter().collect();
    let mut ids_vistos: HashSet<u32> = HashSet::new();
    let mut ventanas: Vec<VentanaInfo> = Vec::new();

    // `Window::all()` es la lista global: no se recorre por monitores.
    for ventana in xcap::Window::all()
        .map_err(|e| format!("No se pudieron obtener las ventanas: {e}"))?
    {
        // Sin id no hay forma de capturar la ventana después: se descarta.
        // El mismo id puede aparecer repetido en la lista (p. ej. una ventana de
        // Windows con varias superficies): solo entra la primera aparición.
        let Ok(id) = ventana.id() else { continue };
        if !ids_vistos.insert(id) {
            continue;
        }
        let Ok(app_name) = ventana.app_name() else {
            continue;
        };
        let Ok(title) = ventana.title() else {
            continue;
        };
        if apps_set.contains(&app_name) {
            ventanas.push(VentanaInfo { id, app_name, title });
        }
    }
    Ok(ventanas)
}

/// Captura un fotograma de la ventana con el `id` dado y lo devuelve como PNG
/// en base64. El `ancho_max` es el ancho máximo en píxeles: se escala manteniendo
/// la proporción (solo hacia abajo: si la captura ya es estrecha, no se agranda).
#[tauri::command]
pub fn capturar_ventana(_app: AppHandle, id: u32, ancho_max: u32) -> Result<String, String> {
    capturar_ventana_interno(id, ancho_max)
}

/// Cuerpo real de `capturar_ventana`, separado para poder probarlo sin Tauri.
fn capturar_ventana_interno(id: u32, ancho_max: u32) -> Result<String, String> {
    use std::io::Cursor;

    if ancho_max == 0 {
        return Err("El ancho máximo debe ser mayor que cero".into());
    }

    // Buscamos la ventana por su id en la lista global de xcap.
    let ventana = xcap::Window::all()
        .map_err(|e| format!("No se pudieron obtener las ventanas: {e}"))?
        .into_iter()
        .find(|w| w.id().map(|wid| wid == id).unwrap_or(false))
        .ok_or_else(|| format!("No se encontró la ventana con id {id}"))?;

    // `capture_image()` ya devuelve un `image::RgbaImage` (image 0.25): nada de
    // conversión de canales (la conversión BGRA de xcap 0.4 ya no existe).
    let img = ventana
        .capture_image()
        .map_err(|e| format!("No se pudo capturar la ventana: {e}"))?;

    // Solo reducimos si la captura supera el máximo; la proporción se mantiene.
    let escala = f64::from(ancho_max) / f64::from(img.width());
    let redimensionada = if escala < 1.0 {
        let nueva_altura = (f64::from(img.height()) * escala).round() as u32;
        if nueva_altura == 0 {
            // Evitamos una altura cero (ancho máximo ridículo).
            return Err("El ancho máximo es demasiado pequeño: la altura resultaría cero".into());
        }
        image::imageops::resize(
            &img,
            ancho_max,
            nueva_altura,
            image::imageops::FilterType::Triangle,
        )
    } else {
        img
    };

    // Codificamos como PNG en memoria y devolvemos base64 con el engine
    // explícito de base64 0.22 (la función `base64::encode` ya no existe).
    let mut png = Cursor::new(Vec::new());
    redimensionada
        .write_to(&mut png, image::ImageFormat::Png)
        .map_err(|e| format!("No se pudo codificar la imagen como PNG: {e}"))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(png.into_inner()))
}