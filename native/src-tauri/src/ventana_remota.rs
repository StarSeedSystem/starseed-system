// ═══════════════════════════════════════════════════════════════════════════
// Ventana remota — ventanas prestables y captura para la malla (APR1019)
// ---------------------------------------------------------------------------
// Solo escritorio: xcap 0.9, image 0.25 y base64 0.22 son dependencias de
// escritorio (ver Cargo.toml). La entrada de teclado y ratón (enigo) llega en
// APR1019B; aquí solo se listan ventanas y se capturan fotogramas.
// ═══════════════════════════════════════════════════════════════════════════

use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use serde::Serialize;
use std::collections::HashSet;
use tauri::AppHandle;
use xcap::Window;

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

/// Lista las ventanas de las apps marcadas como prestables por el dueño.
/// `Window::all()` puede repetir una ventana: se deduplica por id.
#[tauri::command]
pub fn ventanas_prestables(_app: AppHandle, apps: Vec<String>) -> Result<Vec<VentanaInfo>, String> {
    let apps_set: HashSet<String> = apps.into_iter().collect();
    let todas = Window::all().map_err(|e| format!("No se pudieron enumerar las ventanas: {e}"))?;

    let mut vistas: HashSet<u32> = HashSet::new();
    let mut prestables = Vec::new();

    for ventana in todas {
        let Ok(id) = ventana.id() else {
            continue;
        };
        if !vistas.insert(id) {
            continue;
        }
        let app_name = ventana
            .app_name()
            .unwrap_or_else(|_| "desconocida".to_string());
        if !apps_set.contains(&app_name) {
            continue;
        }
        let title = ventana
            .title()
            .unwrap_or_else(|_| "Sin título".to_string());
        prestables.push(VentanaInfo {
            id,
            app_name,
            title,
        });
    }

    Ok(prestables)
}

/// Captura la ventana `id` y devuelve un PNG en base64, sin pasar de `ancho_max`.
/// Mantiene la proporción; la imagen de xcap 0.9 ya llega en RGBA.
#[tauri::command]
pub fn capturar_ventana(_app: AppHandle, id: u32, ancho_max: u32) -> Result<String, String> {
    if ancho_max == 0 {
        return Err("El ancho máximo debe ser mayor que cero.".to_string());
    }

    let ventana = Window::all()
        .map_err(|e| format!("No se pudieron enumerar las ventanas: {e}"))?
        .into_iter()
        .find(|v| v.id().map(|actual| actual == id).unwrap_or(false))
        .ok_or_else(|| format!("No se encontró la ventana con ID {id}"))?;

    let imagen = ventana
        .capture_image()
        .map_err(|e| format!("No se pudo capturar la ventana {id}: {e}"))?;

    let (ancho, alto) = (imagen.width(), imagen.height());
    if ancho == 0 || alto == 0 {
        return Err("La captura llegó vacía; la ventana puede estar minimizada.".to_string());
    }

    let escala = ancho_max as f32 / ancho as f32;
    let alto_nuevo = ((alto as f32) * escala).round().max(1.0) as u32;
    let reducida = image::imageops::resize(
        &imagen,
        ancho_max,
        alto_nuevo,
        image::imageops::FilterType::Triangle,
    );

    let mut png = std::io::Cursor::new(Vec::new());
    reducida
        .write_to(&mut png, image::ImageFormat::Png)
        .map_err(|e| format!("No se pudo codificar el PNG: {e}"))?;

    Ok(STANDARD.encode(png.into_inner()))
}
