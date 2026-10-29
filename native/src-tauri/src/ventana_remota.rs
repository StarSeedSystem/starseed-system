// ═══════════════════════════════════════════════════════════════════════════
// Ventana remota — anfitrión del modo «ventana transmitida»
// (architecture/apps-en-la-malla.md §9). Solo escritorio: las API de captura
// de xcap no existen en móvil.
// ---------------------------------------------------------------------------
// Reescrito el 2026-10-19 con las API reales (APR1019A, cola APR1019): la
// versión de APM1017P pedía `Monitor::windows()`, `process()` y
// `base64::encode`, que ya no existen en xcap 0.9 · image 0.25 · base64 0.22,
// y eso rompía `cargo check` del CI (commit 4e8fac291 la sacó de la
// compilación). El lado de entrada (teclado y ratón con enigo) entra aparte,
// en APR1019B.
// ═══════════════════════════════════════════════════════════════════════════

use serde::Serialize;
use std::collections::HashSet;
use std::io::Cursor;
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

// ─────────────────────────── Comando: ventanas_prestables ───────────────────

/// Lista de ventanas prestables: las de las aplicaciones cuyo nombre viene
/// marcado como prestrable desde la web (`apps`; se compara con `app_name()`
/// de xcap, el nombre del proceso dueño).
#[tauri::command]
pub fn ventanas_prestables(apps: Vec<String>) -> Result<Vec<VentanaInfo>, String> {
    // HashSet para búsqueda O(1) del nombre de app y deduplicación por id.
    let apps_set: HashSet<String> = apps.into_iter().collect();
    let mut vistas = HashSet::new();
    let mut ventanas = Vec::new();

    // xcap 0.9: una única lista global `Window::all()` (ya no hay
    // `Monitor::windows()`, que duplicaba la misma ventana por monitor).
    for ventana in Window::all()
        .map_err(|e| format!("No se pudieron listar las ventanas: {e}"))?
    {
        // `id()` y `app_name()` devuelven Result en xcap 0.9: si falla la
        // lectura, pasamos a la siguiente ventana mejor que abortar la lista.
        let Ok(id) = ventana.id() else { continue };
        let Ok(app_name) = ventana.app_name() else { continue };

        // Sin duplicar por id (la misma ventana puede aparecer dos veces).
        if !vistas.insert(id) {
            continue;
        }
        // Solo las ventanas de apps prestrables.
        if !apps_set.contains(&app_name) {
            continue;
        }

        let title = ventana.title().unwrap_or_else(|_| app_name.clone());
        ventanas.push(VentanaInfo { id, app_name, title });
    }

    Ok(ventanas)
}

// ─────────────────────────── Comando: capturar_ventana ──────────────────────

/// Captura un fotograma de la ventana con el `id` dado y lo devuelve como PNG
/// en base64. `ancho_max` es el ancho máximo en píxeles: si la captura lo
/// supera se redimensiona manteniendo el aspecto; si no, va tal cual.
#[tauri::command]
pub fn capturar_ventana(id: u32, ancho_max: u32) -> Result<String, String> {
    use base64::Engine;

    // Buscamos la ventana por su id en la lista global de xcap (leemos `id()`
    // de cada una: en xcap 0.9 devuelve Result, no el id pelado).
    let ventana = Window::all()
        .map_err(|e| format!("No se pudieron listar las ventanas: {e}"))?
        .into_iter()
        .find(|v| v.id().map(|id_v| id_v == id).unwrap_or(false))
        .ok_or_else(|| format!("No se encontró la ventana con id {id}"))?;

    // `capture_image()` devuelve directamente un `image::RgbaImage`
    // (image 0.25): ya no hace falta convertir a mano de BGRA a RGBA.
    let captura = ventana
        .capture_image()
        .map_err(|e| format!("No se pudo capturar la ventana: {e}"))?;

    // Comprobamos el ancho máximo guardando la proporción. Con altura 0 el
    // resize sería inválido: error claro en vez de pánic silencioso.
    let final_img = if ancho_max > 0 && captura.width() > ancho_max {
        let nueva_altura =
            (captura.height() as u64 * ancho_max as u64 / captura.width() as u64) as u32;
        if nueva_altura == 0 {
            return Err(
                "El ancho máximo es demasiado pequeño: la ventana quedaría con altura 0.".into(),
            );
        }
        image::imageops::resize(
            &captura,
            ancho_max,
            nueva_altura,
            image::imageops::FilterType::Triangle,
        )
    } else {
        captura
    };

    // Codificamos como PNG en un buffer y devolvemos base64 con el engine
    // de base64 0.22 (la función suelta `base64::encode` ya no existe).
    let mut buffer = Cursor::new(Vec::new());
    final_img
        .write_to(&mut buffer, image::ImageFormat::Png)
        .map_err(|e| format!("No se pudo codificar la imagen como PNG: {e}"))?;

    Ok(base64::engine::general_purpose::STANDARD.encode(buffer.into_inner()))
}
