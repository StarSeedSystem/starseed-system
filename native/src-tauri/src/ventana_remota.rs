use serde::Serialize;
use std::collections::HashSet;
use tauri::AppHandle;
use xcap::Window;

/// Lista de ventanas prestables: las que pertenecen a apps que el dueño marcó.
#[tauri::command]
pub fn ventanas_prestables(_app: AppHandle, apps: Vec<String>) -> Result<Vec<VentanaInfo>, String> {
    let apps_set: HashSet<String> = apps.into_iter().collect();
    let mut ventanas = Vec::new();
    let mut vistos: HashSet<u32> = HashSet::new();

    // `Window::all()` ya recorre todas las ventanas; el filtro por id evita
    // que una misma ventana se cuele dos veces si la plataforma la repite.
    let lista = Window::all().map_err(|e| format!("No se pudieron obtener las ventanas: {e}"))?;
    for ventana in lista {
        let id = ventana
            .id()
            .map_err(|e| format!("No se pudo leer el id de una ventana: {e}"))?;
        if !vistos.insert(id) {
            continue;
        }

        // Si no se puede resolver la app, no se puede saber si es prestable.
        let app_name = match ventana.app_name() {
            Ok(nombre) => nombre,
            Err(_) => continue,
        };
        if !apps_set.contains(&app_name) {
            continue;
        }

        let title = ventana.title().unwrap_or_default();
        ventanas.push(VentanaInfo { id, app_name, title });
    }

    Ok(ventanas)
}

/// Información de una ventana para enviar a la web.
#[derive(Serialize, Clone)]
pub struct VentanaInfo {
    /// Identificador único de la ventana (lo usan los demás comandos).
    pub id: u32,
    /// Nombre de la aplicación a la que pertenece la ventana.
    pub app_name: String,
    /// Título de la ventana.
    pub title: String,
}

/// Captura un fotograma de la ventana y lo devuelve como PNG en base64.
#[tauri::command]
pub fn capturar_ventana(_app: AppHandle, id: u32, ancho_max: u32) -> Result<String, String> {
    use base64::Engine as _;
    use image::ImageFormat;
    use std::io::Cursor;

    if ancho_max == 0 {
        return Err("El ancho máximo debe ser mayor que cero.".into());
    }

    // Buscamos la ventana por su id; si el id de una ventana no se puede leer, se ignora.
    let ventana = Window::all()
        .map_err(|e| format!("No se pudieron obtener las ventanas: {e}"))?
        .into_iter()
        .find(|w| w.id().map(|otro| otro == id).unwrap_or(false))
        .ok_or_else(|| format!("No se encontró la ventana con ID {id}"))?;

    // xcap 0.9 devuelve ya una imagen RGBA de `image` 0.25 (no hay que convertir canales).
    let img = ventana
        .capture_image()
        .map_err(|e| format!("No se pudo capturar la imagen de la ventana: {e}"))?;

    let (ancho_original, alto_original) = img.dimensions();
    if ancho_original == 0 || alto_original == 0 {
        return Err("La ventana no tiene un tamaño capturable.".into());
    }

    // `ancho_max` es un tope: se mantiene la proporción y nunca se amplía la imagen.
    let ancho = ancho_max.min(ancho_original);
    let alto =
        ((alto_original as f64 * ancho as f64 / ancho_original as f64).round() as u32).max(1);
    let redimensionada = if (ancho, alto) == (ancho_original, alto_original) {
        img
    } else {
        image::imageops::resize(&img, ancho, alto, image::imageops::FilterType::Triangle)
    };

    // PNG en memoria y luego base64 estándar (una sola cadena para la web).
    let mut buffer = Cursor::new(Vec::new());
    redimensionada
        .write_to(&mut buffer, ImageFormat::Png)
        .map_err(|e| format!("No se pudo codificar la imagen como PNG: {e}"))?;

    Ok(base64::engine::general_purpose::STANDARD.encode(buffer.into_inner()))
}
