// ═══════════════════════════════════════════════════════════════════════════
// StarSeed Native — Ventana transmitida, lado anfitrión (rehace APM1017P, 2026-10-25)
// ---------------------------------------------------------------------------
// Con xcap 0.9 real: `Window::all()` lista ya cada ventana una vez (no hace
// falta recorrer monitores ni deduplicar por id). La app nativa lista las
// ventanas de las apps prestables y captura solo la elegida; el teclado y el
// ratón de la sesión llegan en la tarea APR1019B (entrada_ventana con enigo).
// ═══════════════════════════════════════════════════════════════════════════

use serde::Serialize;
use std::collections::HashSet;

/// Información de una ventana para enviar a la web.
#[derive(Serialize, Clone)]
pub struct VentanaInfo {
    /// Identificador único de la ventana (usado en capturar_ventana).
    pub id: u32,
    /// Nombre de la aplicación a la que pertenece la ventana.
    pub app_name: String,
    /// Título de la ventana.
    pub title: String,
}

/// Lista de ventanas prestables: las de las apps que el dueño marcó como
/// prestables (la web le pasa sus nombres; aquí nunca se inventa ninguno).
#[tauri::command]
pub fn ventanas_prestables(apps: Vec<String>) -> Result<Vec<VentanaInfo>, String> {
    let apps_set: HashSet<String> = apps.into_iter().collect();

    // xcap 0.9: Window::all() devuelve Result<Vec<Window>>, sin repetir por id.
    let todas = xcap::Window::all()
        .map_err(|e| format!("No se pudieron obtener las ventanas del sistema: {e}"))?;

    let mut ventanas = Vec::new();
    for ventana in todas {
        // En xcap 0.9 id/app_name/title devuelven Result; una ventana cuyo dato
        // no se puede leer simplemente no se lista (mejor esfuerzo, sin panics).
        let Ok(app_name) = ventana.app_name() else {
            continue;
        };
        // La web envía nombres de app prestables; si no coincide, fuera.
        if !apps_set.contains(&app_name) {
            continue;
        }
        let Ok(id) = ventana.id() else {
            continue;
        };
        let title = ventana.title().unwrap_or_default();
        ventanas.push(VentanaInfo { id, app_name, title });
    }

    Ok(ventanas)
}

/// Captura un fotograma de la ventana con el `id` dado y lo devuelve como
/// PNG en base64 (otra neurona lo muestra en la ventana transmitida).
/// `ancho_max` es el ancho máximo en píxeles; se escala manteniendo la
/// proporción. Con `ancho_max` 0 o mayor o igual al ancho, se envía tal cual.
#[tauri::command]
pub fn capturar_ventana(id: u32, ancho_max: u32) -> Result<String, String> {
    use std::io::Cursor;
    use base64::Engine as _;
    use image::ImageFormat;

    // Buscamos la ventana por su id entre todas las del sistema.
    let todas = xcap::Window::all()
        .map_err(|e| format!("No se pudieron obtener las ventanas del sistema: {e}"))?;
    let ventana = todas
        .into_iter()
        .find(|v| v.id().map(|window_id| window_id == id).unwrap_or(false))
        .ok_or_else(|| format!("No se encontró la ventana con ID {id}"))?;

    // xcap 0.9: capture_image() ya devuelve un image::RgbaImage de image 0.25
    // (después de la vieja conversión BGRA->RGBA, que ya no hace falta).
    let captura = ventana
        .capture_image()
        .map_err(|e| format!("No se pudo capturar la ventana: {e}"))?;

    // Calculamos el nuevo tamaño si procede, manteniendo la proporción.
    let frame = if ancho_max > 0 && captura.width() > ancho_max {
        let alto = ((captura.height() as f32 * (ancho_max as f32 / captura.width() as f32))
            .round() as u32)
            .max(1);
        image::imageops::resize(
            &captura,
            ancho_max,
            alto,
            image::imageops::FilterType::Triangle,
        )
    } else {
        captura.clone()
    };

    // Codificamos la imagen como PNG en un buffer en memoria.
    let mut buffer = Cursor::new(Vec::new());
    image::DynamicImage::ImageRgba8(frame)
        .write_to(&mut buffer, ImageFormat::Png)
        .map_err(|e| format!("No se pudo codificar la imagen como PNG: {e}"))?;

    // base64 0.22: el engine STANDARD y el trait Engine en el ámbito.
    Ok(base64::engine::general_purpose::STANDARD.encode(buffer.into_inner()))
}
