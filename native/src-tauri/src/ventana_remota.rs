// ═══════════════════════════════════════════════════════════════════════════
// StarSeed Native — Ventana remota: compartir una ventana de la malla (escritorio)
// ---------------------------------------------------------------------------
// ¿Qué es? Otras apps de la malla pueden pedir ver (y luego manejar, APR1019B)
// la ventana de una app cuyo dueño la marcó como prestable. Esta pieza NATIVA
// lista esas ventanas y captura fotogramas reales con xcap 0.9.
//
// ¿Por qué aquí? El navegador no puede ver las ventanas del equipo; solo la
// app nativa (Tauri) puede. La web (Aurora) invoca estos comandos vía
// `invoke("ventanas_prestables" | "capturar_ventana", …)` y pinta el
// fotograma (PNG en base64) en un `<img>`.
// ═══════════════════════════════════════════════════════════════════════════

use base64::Engine as _;
use serde::Serialize;
use std::collections::HashSet;

// ═══════════════════════════════════════════════════════════════════════════

/// Información de una ventana prestable para la web.
#[derive(Serialize, Clone)]
pub struct VentanaInfo {
    /// Identificador único de la ventana (lo pide después `capturar_ventana`).
    pub id: u32,
    /// Nombre de la aplicación dueña de la ventana.
    pub app_name: String,
    /// Título visible de la ventana.
    pub title: String,
}

/// Lista de ventanas prestables (las de apps marcadas como prestables por su dueño),
/// deduplicadas por id.
#[tauri::command]
pub fn ventanas_prestables(apps: Vec<String>) -> Result<Vec<VentanaInfo>, String> {
    // Conjunto de apps marcadas como prestables, para filtrar rápido.
    let apps_set: HashSet<String> = apps.into_iter().collect();
    let mut ventanas = Vec::new();
    // Una ventana solo va una vez aunque aparezca repetida en la lista del SO.
    let mut vistas: HashSet<u32> = HashSet::new();

    // xcap 0.9: `Window::all()` ya devuelve todas las ventanas (sin precisar
    // monitores); `id()` y `app_name()` devuelven Result.
    for window in
        xcap::Window::all().map_err(|e| format!("No se pudieron enumerar las ventanas: {e}"))?
    {
        // Ventana ya cerrada o sin identificador: la saltamos sin romper la lista.
        let Ok(id) = window.id() else { continue };
        if !vistas.insert(id) {
            continue;
        }
        let Ok(app_name) = window.app_name() else { continue };
        // Solo las apps que el dueño marcó como prestables.
        if !apps_set.contains(&app_name) {
            continue;
        }
        let title = window.title().unwrap_or_default();
        ventanas.push(VentanaInfo { id, app_name, title });
    }

    Ok(ventanas)
}

/// Captura un fotograma de la ventana con el `id` dado y lo devuelve como PNG
/// en base64, redimensionado a un ancho máximo manteniendo la proporción.
#[tauri::command]
pub fn capturar_ventana(id: u32, ancho_max: u32) -> Result<String, String> {
    use base64::engine::general_purpose::STANDARD;
    use std::io::Cursor;

    // Buscamos la ventana viva por su id entre todas las del sistema.
    let window = xcap::Window::all()
        .map_err(|e| format!("No se pudieron enumerar las ventanas: {e}"))?
        .into_iter()
        .find(|w| w.id().map(|wid| wid == id).unwrap_or(false))
        .ok_or_else(|| format!("No se encontró la ventana con id {id}"))?;

    // xcap 0.9 devuelve directamente un RgbaImage de image 0.25 (RGBA ya listo).
    let img = window
        .capture_image()
        .map_err(|e| format!("No se pudo capturar la ventana: {e}"))?;

    // Cotas absurdas (ventana oculta o ancho_máximo cero): error honesto.
    if img.width() == 0 || ancho_max == 0 {
        return Err("La captura o el ancho máximo tienen medida cero.".into());
    }

    // Escala manteniendo la proporción; altura mínima de 1 px.
    let escala = f64::from(ancho_max) / f64::from(img.width());
    let nuevo_alto = ((f64::from(img.height()) * escala).round() as u32).max(1);

    let reducida = image::imageops::resize(
        &img,
        ancho_max,
        nuevo_alto,
        image::imageops::FilterType::Triangle,
    );

    // Codificamos PNG y devolvemos base64 con el engine de base64 0.22.
    let mut png = Cursor::new(Vec::new());
    reducida
        .write_to(&mut png, image::ImageFormat::Png)
        .map_err(|e| format!("No se pudo codificar el PNG: {e}"))?;
    Ok(STANDARD.encode(png.into_inner()))
}
