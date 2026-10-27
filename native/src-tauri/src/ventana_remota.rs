// ═══════════════════════════════════════════════════════════════════════════
// Ventana remota (apps-en-la-malla.md §9) — lado ANFITRIÓN, solo escritorio.
// ---------------------------------------------------------------------------
// Lista las ventanas de las apps prestables y captura la elegida con xcap 0.9
// (API real: `Window::all()`; `id`/`app_name`/`title`/`capture_image` devuelven
// `Result`). La captura sale como PNG en base64 (image 0.25 + base64 0.22).
// `entrada_ventana` (teclado y ratón con enigo 0.6) entra con APR1019B.
// ═══════════════════════════════════════════════════════════════════════════

use serde::Serialize;
use std::collections::HashSet;
use std::io::Cursor;

use base64::{engine::general_purpose::STANDARD, Engine as _};

/// Una ventana prestable que la web puede pedir capturar.
#[derive(Serialize, Clone)]
pub struct VentanaInfo {
    /// Identificador de la ventana en el sistema (lo que pide `capturar_ventana`).
    pub id: u32,
    /// Nombre de la app dueña de la ventana (proceso).
    pub app_name: String,
    /// Título de la ventana.
    pub title: String,
}

/// Lista de ventanas prestables (solo las de las apps que el dueño marcó).
#[tauri::command]
pub fn ventanas_prestables(apps: Vec<String>) -> Result<Vec<VentanaInfo>, String> {
    // Búsqueda eficiente del nombre de app en la lista del dueño.
    let apps_set: HashSet<String> = apps.into_iter().collect();
    // Una misma ventana puede aparecer repetida: sin duplicados por id.
    let mut vistas: HashSet<u32> = HashSet::new();
    let mut ventanas = Vec::new();

    for ventana in xcap::Window::all()
        .map_err(|e| format!("No se pudieron listar las ventanas: {e}"))?
    {
        // Sin id legible no se podría capturar después: la saltamos.
        let Ok(id) = ventana.id() else { continue };
        if !vistas.insert(id) {
            continue;
        }

        // Nombre de la app (proceso) con xcap 0.9; si falla, no bloqueamos la lista.
        let app_name = ventana
            .app_name()
            .unwrap_or_else(|_| "desconocido".to_string());
        if apps_set.contains(&app_name) {
            ventanas.push(VentanaInfo {
                id,
                app_name,
                title: ventana
                    .title()
                    .unwrap_or_else(|_| "desconocido".to_string()),
            });
        }
    }

    Ok(ventanas)
}

/// Captura un fotograma de la ventana con el `id` dado y lo devuelve como PNG en base64.
/// El `ancho_max` es el ancho máximo en píxeles; solo reduce, manteniendo la proporción.
#[tauri::command]
pub fn capturar_ventana(id: u32, ancho_max: u32) -> Result<String, String> {
    let ventana = xcap::Window::all()
        .map_err(|e| format!("No se pudieron listar las ventanas: {e}"))?
        .into_iter()
        .find(|v| v.id().map(|encontrado| encontrado == id).unwrap_or(false))
        .ok_or_else(|| format!("No se encontró la ventana con ID {id}"))?;

    // xcap 0.9 ya devuelve RGBA (image::RgbaImage de image 0.25): no hay que
    // convertir canales, a diferencia de lo que hacía la versión antigua.
    let captura = ventana
        .capture_image()
        .map_err(|e| format!("No se pudo capturar la ventana {id}: {e}"))?;

    // Solo reducimos si supera el ancho máximo; la proporción se mantiene.
    let (ancho, alto) = (captura.width(), captura.height());
    let (ancho_final, alto_final) = if ancho_max > 0 && ancho > ancho_max {
        let alto_escalado = ((alto as f64 * ancho_max as f64) / ancho as f64).round() as u32;
        (ancho_max, alto_escalado.max(1))
    } else {
        (ancho, alto)
    };
    let imagen = if (ancho_final, alto_final) == (ancho, alto) {
        captura
    } else {
        image::imageops::resize(
            &captura,
            ancho_final,
            alto_final,
            image::imageops::FilterType::Triangle,
        )
    };

    // PNG en memoria y base64 con el engine de base64 0.22.
    let mut png = Cursor::new(Vec::new());
    imagen
        .write_to(&mut png, image::ImageFormat::Png)
        .map_err(|e| format!("No se pudo codificar la imagen como PNG: {e}"))?;

    Ok(STANDARD.encode(png.get_ref()))
}
