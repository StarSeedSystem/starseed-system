use serde::Serialize;
use std::collections::HashSet;
use tauri::AppHandle;
use xcap::Window;

/// Lista de ventanas prestables (las que pertenecen a apps marcadas como prestables por el dueño).
#[tauri::command]
pub fn ventanas_prestables(_app: AppHandle, apps: Vec<String>) -> Result<Vec<VentanaInfo>, String> {
    // Convertimos la lista de apps a un HashSet para búsqueda eficiente.
    let apps_set: HashSet<String> = apps.into_iter().collect();
    // `Window::all()` ya devuelve cada ventana una sola vez; aun así filtramos por id
    // por si el sistema la repite (misma ventana vista desde varios monitores).
    let mut vistos: HashSet<u32> = HashSet::new();
    let mut ventanas = Vec::new();

    for window in Window::all().map_err(|e| format!("No se pudieron obtener las ventanas: {e}"))? {
        let id = window
            .id()
            .map_err(|e| format!("No se pudo leer el id de la ventana: {e}"))?;
        if !vistos.insert(id) {
            continue;
        }

        // El nombre de la aplicación es lo que el dueño marcó como prestable.
        // Si no se puede leer, no se anuncia: nunca inventamos una identidad.
        let Ok(app_name) = window.app_name() else {
            continue;
        };
        if !apps_set.contains(&app_name) {
            continue;
        }

        let title = window.title().unwrap_or_else(|_| "desconocido".to_string());

        ventanas.push(VentanaInfo {
            id,
            app_name,
            title,
        });
    }

    Ok(ventanas)
}

/// Información de una ventana para enviar a la web.
#[derive(Serialize, Clone)]
pub struct VentanaInfo {
    /// Identificador único de la ventana (usado en los otros comandos).
    pub id: u32,
    /// Nombre de la aplicación a la que pertenece la ventana.
    pub app_name: String,
    /// Título de la ventana.
    pub title: String,
}

/// Captura un fotograma de la ventana con el `id` dado y lo devuelve como PNG en base64.
/// El `ancho_max` es el ancho máximo en píxeles; se escala manteniendo la proporción.
#[tauri::command]
pub fn capturar_ventana(_app: AppHandle, id: u32, ancho_max: u32) -> Result<String, String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use image::ImageFormat;
    use std::io::Cursor;

    // Un ancho cero no tiene sentido y rompería el redimensionado.
    if ancho_max == 0 {
        return Err("El ancho máximo debe ser mayor que cero.".into());
    }

    // Buscamos la ventana por su ID en la lista real de xcap 0.9.
    let window = Window::all()
        .map_err(|e| format!("No se pudieron obtener las ventanas: {e}"))?
        .into_iter()
        .find(|w| w.id().map(|actual| actual == id).unwrap_or(false))
        .ok_or_else(|| format!("No se encontró la ventana con ID {id}"))?;

    // `capture_image()` ya devuelve un `RgbaImage` (RGBA) de image 0.25.
    let img = window
        .capture_image()
        .map_err(|e| format!("No se pudo capturar la imagen de la ventana: {e}"))?;

    // Escalamos manteniendo la proporción y evitamos una altura cero.
    let escala = ancho_max as f32 / img.width() as f32;
    let alto = ((img.height() as f32 * escala).round() as u32).max(1);
    let redimensionada =
        image::imageops::resize(&img, ancho_max, alto, image::imageops::FilterType::Triangle);

    // Codificamos como PNG en memoria y lo pasamos a base64 estándar (base64 0.22).
    let mut buffer = Cursor::new(Vec::new());
    redimensionada
        .write_to(&mut buffer, ImageFormat::Png)
        .map_err(|e| format!("No se pudo codificar la imagen como PNG: {e}"))?;

    Ok(STANDARD.encode(buffer.into_inner()))
}
