// Ventanas prestables y captura para las apps transmitidas por la malla.
// Las dependencias de este módulo (xcap, image y base64) son solo de escritorio:
// el registro de comandos vive bajo `#[cfg(desktop)]` en lib.rs
// (ver architecture/apps-en-la-malla.md §9).
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde::Serialize;
use std::collections::HashSet;
use tauri::AppHandle;
use xcap::Window;

/// Información de una ventana que se puede prestar a otra neurona.
#[derive(Serialize, Clone)]
pub struct VentanaInfo {
    /// Identificador único de la ventana (el mismo que usa `capturar_ventana`).
    pub id: u32,
    /// Nombre de la aplicación dueña de la ventana.
    pub app_name: String,
    /// Título visible de la ventana.
    pub title: String,
}

/// Lista las ventanas de las apps marcadas como prestables por su dueño.
///
/// `Window::all()` ya devuelve cada ventana una sola vez, pero mantenemos el
/// filtro por id para blindar el contrato si el backend repite alguna.
#[tauri::command]
pub fn ventanas_prestables(_app: AppHandle, apps: Vec<String>) -> Result<Vec<VentanaInfo>, String> {
    let apps_set: HashSet<String> = apps.into_iter().collect();
    let ventanas = Window::all().map_err(|e| format!("No se pudieron listar las ventanas: {e}"))?;

    let mut vistas = HashSet::new();
    let mut prestables = Vec::new();
    for ventana in ventanas {
        let Ok(id) = ventana.id() else { continue };
        if !vistas.insert(id) {
            continue;
        }
        let Ok(app_name) = ventana.app_name() else {
            continue;
        };
        if !apps_set.contains(&app_name) {
            continue;
        }
        let title = ventana.title().unwrap_or_else(|_| "Sin título".to_string());
        prestables.push(VentanaInfo {
            id,
            app_name,
            title,
        });
    }
    Ok(prestables)
}

/// Captura la ventana `id`, la escala a `ancho_max` y devuelve un PNG en base64.
#[tauri::command]
pub fn capturar_ventana(_app: AppHandle, id: u32, ancho_max: u32) -> Result<String, String> {
    let ventana = Window::all()
        .map_err(|e| format!("No se pudieron listar las ventanas: {e}"))?
        .into_iter()
        .find(|v| v.id().map(|propio| propio == id).unwrap_or(false))
        .ok_or_else(|| format!("No se encontró la ventana con id {id}"))?;

    let imagen = ventana
        .capture_image()
        .map_err(|e| format!("No se pudo capturar la ventana {id}: {e}"))?;

    let (ancho, alto) = dimensiones_destino(imagen.width(), imagen.height(), ancho_max)?;
    let escalada = if (ancho, alto) == (imagen.width(), imagen.height()) {
        imagen
    } else {
        image::imageops::resize(&imagen, ancho, alto, image::imageops::FilterType::Triangle)
    };

    let mut png = std::io::Cursor::new(Vec::new());
    escalada
        .write_to(&mut png, image::ImageFormat::Png)
        .map_err(|e| format!("No se pudo codificar el PNG: {e}"))?;

    Ok(STANDARD.encode(png.into_inner()))
}

/// Calcula el tamaño destino sin deformar ni ampliar la ventana.
fn dimensiones_destino(ancho: u32, alto: u32, ancho_max: u32) -> Result<(u32, u32), String> {
    if ancho == 0 || alto == 0 {
        return Err("La ventana no tiene tamaño capturable.".to_string());
    }
    if ancho_max == 0 {
        return Err("El ancho máximo debe ser mayor que cero.".to_string());
    }
    if ancho <= ancho_max {
        return Ok((ancho, alto));
    }
    let nuevo_alto = ((alto as f64 * ancho_max as f64) / ancho as f64).round() as u32;
    Ok((ancho_max, nuevo_alto.max(1)))
}

#[cfg(test)]
mod pruebas {
    use super::dimensiones_destino;

    #[test]
    fn no_amplia_una_ventana_mas_pequena_que_el_tope() {
        assert_eq!(dimensiones_destino(800, 600, 1280), Ok((800, 600)));
    }

    #[test]
    fn reduce_manteniendo_la_proporcion() {
        assert_eq!(dimensiones_destino(1920, 1080, 640), Ok((640, 360)));
    }

    #[test]
    fn rechaza_topes_y_tamanos_invalidos() {
        assert!(dimensiones_destino(800, 600, 0).is_err());
        assert!(dimensiones_destino(0, 600, 640).is_err());
    }
}
