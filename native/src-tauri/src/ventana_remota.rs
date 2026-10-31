// ═══════════════════════════════════════════════════════════════════════════
// Ventanas prestables y captura remota (APR1019A)
// ---------------------------------------------------------------------------
// Rehecho con las API REALES de xcap 0.9: `Window::all()` lista todas las
// ventanas (sin recorrer monitores ni duplicar por id), `app_name()` y
// `title()` devuelven `Result<String>` y `capture_image()` devuelve ya un
// `image::RgbaImage` (image 0.25). El PNG se codifica con base64 0.22.
//
// `entrada_ventana` (teclado y ratón con enigo 0.6) se rehará en APR1019B.
// ═══════════════════════════════════════════════════════════════════════════

use base64::Engine;
use serde::Serialize;
use std::collections::HashSet;
use tauri::AppHandle;

/// Texto de reserva cuando el sistema no informa del nombre o del título.
const DESCONOCIDO: &str = "desconocido";

/// Información de una ventana que se puede prestar a la web.
#[derive(Serialize, Clone)]
pub struct VentanaInfo {
    /// Identificador único de la ventana (lo usan los demás comandos).
    pub id: u32,
    /// Nombre de la aplicación a la que pertenece la ventana.
    pub app_name: String,
    /// Título visible de la ventana.
    pub title: String,
}

/// Lista las ventanas de las apps que el dueño marcó como prestables.
///
/// `Window::all()` devuelve todas las ventanas ordenadas por z; nos quedamos
/// con una sola entrada por id (la primera, la más al frente) y solo
/// devolvemos las que pertenecen a `apps`.
#[tauri::command]
pub fn ventanas_prestables(_app: AppHandle, apps: Vec<String>) -> Result<Vec<VentanaInfo>, String> {
    let apps_prestables: HashSet<String> = apps.into_iter().collect();
    let mut vistas: HashSet<u32> = HashSet::new();
    let mut ventanas = Vec::new();

    let todas =
        xcap::Window::all().map_err(|e| format!("No se pudieron listar las ventanas: {e}"))?;

    for ventana in todas {
        let id = ventana
            .id()
            .map_err(|e| format!("No se pudo leer el id de una ventana: {e}"))?;

        // Sin duplicados: la primera aparición (la más al frente) manda.
        if !vistas.insert(id) {
            continue;
        }

        let app_name = ventana
            .app_name()
            .unwrap_or_else(|_| DESCONOCIDO.to_string());
        if !apps_prestables.contains(&app_name) {
            continue;
        }

        let title = ventana.title().unwrap_or_else(|_| DESCONOCIDO.to_string());
        ventanas.push(VentanaInfo {
            id,
            app_name,
            title,
        });
    }

    Ok(ventanas)
}

/// Captura la ventana con `id` y la devuelve como PNG en base64.
///
/// `ancho_max` es el ancho máximo en píxeles; la altura se escala manteniendo
/// la proporción. Se rechaza un ancho cero para no pedir una imagen vacía.
#[tauri::command]
pub fn capturar_ventana(_app: AppHandle, id: u32, ancho_max: u32) -> Result<String, String> {
    use image::imageops::FilterType;
    use image::ImageFormat;
    use std::io::Cursor;

    if ancho_max == 0 {
        return Err("El ancho máximo debe ser mayor que cero.".into());
    }

    let todas =
        xcap::Window::all().map_err(|e| format!("No se pudieron listar las ventanas: {e}"))?;
    let ventana = todas
        .into_iter()
        .find(|v| v.id().map(|actual| actual == id).unwrap_or(false))
        .ok_or_else(|| format!("No se encontró la ventana con id {id}"))?;

    // xcap 0.9 ya entrega un `RgbaImage` de image 0.25: no hay que convertir
    // canales ni inventar un buffer propio.
    let imagen = ventana
        .capture_image()
        .map_err(|e| format!("No se pudo capturar la ventana: {e}"))?;

    let (ancho, alto) = imagen.dimensions();
    if ancho == 0 || alto == 0 {
        return Err("La ventana no tiene un tamaño capturable.".into());
    }

    // Escalamos manteniendo la proporción y evitamos una altura de cero.
    let nuevo_alto = ((alto as f32 * ancho_max as f32 / ancho as f32).round() as u32).max(1);
    let reducida = image::imageops::resize(&imagen, ancho_max, nuevo_alto, FilterType::Triangle);

    // Codificamos a PNG en memoria (image 0.25 usa `ImageFormat`, no el
    // antiguo `ImageOutputFormat`).
    let mut png = Cursor::new(Vec::new());
    reducida
        .write_to(&mut png, ImageFormat::Png)
        .map_err(|e| format!("No se pudo codificar el PNG: {e}"))?;

    // base64 0.22 exige el trait `Engine` (importado arriba) para `encode`.
    Ok(base64::engine::general_purpose::STANDARD.encode(png.into_inner()))
}
