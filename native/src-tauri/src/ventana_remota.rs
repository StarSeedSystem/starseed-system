use serde::Serialize;
use std::collections::HashSet;
use tauri::AppHandle;

#[tauri::command]
pub fn ventanas_prestables(_app: AppHandle, apps: Vec<String>) -> Result<Vec<VentanaInfo>, String> {
    let apps_set: HashSet<String> = apps.into_iter().collect();
    let mut ventanas = Vec::new();
    let mut seen_ids = HashSet::new();

    for window in
        xcap::Window::all().map_err(|e| format!("No se pudieron obtener las ventanas: {e}"))?
    {
        let id = window
            .id()
            .map_err(|e| format!("No se pudo obtener el ID de la ventana: {e}"))?;
        if seen_ids.contains(&id) {
            continue;
        }
        seen_ids.insert(id);

        let app_name = window
            .app_name()
            .map_err(|e| format!("No se pudo obtener el nombre de la app: {e}"))?;
        let title = window
            .title()
            .map_err(|e| format!("No se pudo obtener el título: {e}"))?;

        if apps_set.contains(&app_name) {
            ventanas.push(VentanaInfo {
                id,
                app_name,
                title,
            });
        }
    }

    Ok(ventanas)
}

#[derive(Serialize, Clone)]
pub struct VentanaInfo {
    pub id: u32,
    pub app_name: String,
    pub title: String,
}

#[tauri::command]
pub fn capturar_ventana(_app: AppHandle, id: u32, ancho_max: u32) -> Result<String, String> {
    let window = xcap::Window::all()
        .map_err(|e| format!("No se pudieron obtener las ventanas: {e}"))?
        .into_iter()
        .find(|w| w.id().ok() == Some(id))
        .ok_or_else(|| format!("No se encontró la ventana con ID {id}"))?;

    let img = window
        .capture_image()
        .map_err(|e| format!("No se pudo capturar la imagen: {e}"))?;

    let scale = ancho_max as f32 / img.width() as f32;
    let new_width = ancho_max;
    let new_height = (img.height() as f32 * scale).round() as u32;
    if new_height == 0 {
        return Err("El ancho máximo es demasiado pequeño.".into());
    }

    let resized_img = image::imageops::resize(
        &img,
        new_width,
        new_height,
        image::imageops::FilterType::Triangle,
    );

    let mut buffer = Vec::new();
    resized_img
        .write_to(
            &mut std::io::Cursor::new(&mut buffer),
            image::ImageOutputFormat::Png,
        )
        .map_err(|e| format!("No se pudo codificar PNG: {e}"))?;

    let base64 = base64::engine::general_purpose::STANDARD.encode(buffer);

    Ok(base64)
}
