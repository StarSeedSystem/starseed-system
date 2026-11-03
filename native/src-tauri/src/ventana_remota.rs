//! `ventanas_prestables` y `capturar_ventana` rehechos con la API real de xcap 0.9
//! (APR1019A, parte 1): `Window::all()` ya devuelve las ventanas de todos los
//! monitores con duplicados, `app_name()` da el nombre de la app y `capture_image()`
//! devuelve un `image::RgbaImage` (image 0.25) listo para codificar. La entrada
//! (`entrada_ventana`, con enigo 0.6) rehecha en APR1019B.

use base64::Engine as _;
use enigo::{Button, Coordinate, Direction, Enigo, Keyboard, Mouse, Settings};
use serde::Serialize;
use std::collections::HashSet;
use tauri::AppHandle;

/// Lista de ventanas prestables: las que pertenecen a apps marcadas como
/// prestables por el dueño. Sin duplicados por id (la misma ventana puede
/// aparecer más de una vez en la lista que devuelve `Window::all()`).
#[tauri::command]
pub fn ventanas_prestables(_app: AppHandle, apps: Vec<String>) -> Result<Vec<VentanaInfo>, String> {
    let apps_set: HashSet<String> = apps.into_iter().collect();
    let mut vistas: HashSet<u32> = HashSet::new();
    let mut ventanas = Vec::new();

    for window in
        xcap::Window::all().map_err(|e| format!("No se pudieron listar las ventanas: {e}"))?
    {
        let Ok(id) = window.id() else {
            // Una ventana sin id legible no se puede seleccionar después: la saltamos.
            continue;
        };
        if !vistas.insert(id) {
            continue;
        }
        let app_name = window
            .app_name()
            .unwrap_or_else(|_| "desconocido".to_string());
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

/// Altura redondeada tras reducir una imagen de `ancho × alto` al ancho
/// máximo, manteniendo la proporción. Devuelve `None` si la proporción no da
/// una altura válida (ancho o altura de origen en cero, o `ancho_max` en cero).
fn altura_escalada(ancho: u32, alto: u32, ancho_max: u32) -> Option<u32> {
    if ancho == 0 || alto == 0 || ancho_max == 0 {
        return None;
    }
    let escala = ancho_max as f32 / ancho as f32;
    let nueva = (alto as f32 * escala).round() as u32;
    Some(nueva.max(1))
}

/// ¿Cae el punto `(px, py)` (coordenadas absolutas de pantalla) dentro de la
/// ventana con esquina `(wx, wy)` y tamaño `ancho × alto`? El borde izquierdo y
/// el superior cuentan como dentro; el derecho y el inferior, no (el último
/// píxel es `wx + ancho - 1`). Se calcula en i64 para que una ventana enorme o
/// en coordenadas negativas (monitor a la izquierda) no desborde.
fn punto_dentro(px: i32, py: i32, wx: i32, wy: i32, ancho: u32, alto: u32) -> bool {
    let (px, py, wx, wy) = (px as i64, py as i64, wx as i64, wy as i64);
    px >= wx && py >= wy && px < wx + ancho as i64 && py < wy + alto as i64
}

/// Lee un límite de la ventana con un mensaje de error en español.
fn limite<T>(r: xcap::XCapResult<T>) -> Result<T, String> {
    r.map_err(|e| format!("No se pudieron leer los límites de la ventana: {e}"))
}

/// Entrada remota (teclado y ratón) sobre una ventana prestada, con enigo 0.6.
/// `tipo` es `"click"` (necesita `x`, `y` en coordenadas absolutas de pantalla)
/// o `"texto"` (necesita `texto`). Solo actúa si el punto cae dentro de los
/// límites de la ventana: un clic fuera podría tocar otra app que el dueño no
/// prestó. Para el texto se exige además que la ventana siga existiendo.
#[tauri::command]
pub fn entrada_ventana(
    _app: AppHandle,
    id: u32,
    tipo: String,
    x: Option<i32>,
    y: Option<i32>,
    texto: Option<String>,
) -> Result<(), String> {
    let ventana = xcap::Window::all()
        .map_err(|e| format!("No se pudieron listar las ventanas: {e}"))?
        .into_iter()
        .find(|w| w.id().map(|wid| wid == id).unwrap_or(false))
        .ok_or_else(|| format!("No se encontró la ventana con el ID {id}"))?;

    match tipo.as_str() {
        "click" => {
            let (Some(px), Some(py)) = (x, y) else {
                return Err("El clic necesita las coordenadas x e y".into());
            };
            let (wx, wy) = (limite(ventana.x())?, limite(ventana.y())?);
            let (ancho, alto) = (limite(ventana.width())?, limite(ventana.height())?);
            if !punto_dentro(px, py, wx, wy, ancho, alto) {
                return Err(format!("El punto ({px}, {py}) cae fuera de la ventana {id}"));
            }
            let mut enigo = Enigo::new(&Settings::default())
                .map_err(|e| format!("No se pudo abrir la entrada del sistema: {e}"))?;
            enigo
                .move_mouse(px, py, Coordinate::Abs)
                .map_err(|e| format!("No se pudo mover el ratón: {e}"))?;
            enigo
                .button(Button::Left, Direction::Click)
                .map_err(|e| format!("No se pudo pulsar: {e}"))?;
        }
        "texto" | "teclado" => {
            let Some(t) = texto.filter(|t| !t.is_empty()) else {
                return Err("Escribir necesita un texto no vacío".into());
            };
            let mut enigo = Enigo::new(&Settings::default())
                .map_err(|e| format!("No se pudo abrir la entrada del sistema: {e}"))?;
            enigo
                .text(&t)
                .map_err(|e| format!("No se pudo escribir el texto: {e}"))?;
        }
        otro => return Err(format!("Tipo de entrada no soportado: «{otro}»")),
    }
    Ok(())
}

/// Captura un fotograma de la ventana con el `id` dado y lo devuelve como PNG
/// en base64. `ancho_max` es el ancho máximo en píxeles; se escala manteniendo
/// la proporción.
#[tauri::command]
pub fn capturar_ventana(_app: AppHandle, id: u32, ancho_max: u32) -> Result<String, String> {
    // xcap 0.9: `Window::all()` devuelve ventanas de todos los monitores; las
    // buscamos por id en esa lista única (los duplicados comparten el id real).
    let ventana = xcap::Window::all()
        .map_err(|e| format!("No se pudieron listar las ventanas: {e}"))?
        .into_iter()
        .find(|w| w.id().map(|wid| wid == id).unwrap_or(false))
        .ok_or_else(|| format!("No se encontró la ventana con el ID {id}"))?;

    // `capture_image()` ya devuelve un `image::RgbaImage` (image 0.25): no hay
    // que convertir BGRA, como en la versión anterior.
    let imagen = ventana
        .capture_image()
        .map_err(|e| format!("No se pudo capturar la ventana: {e}"))?;

    let nueva_altura =
        altura_escalada(imagen.width(), imagen.height(), ancho_max).ok_or_else(|| {
            format!("El ancho máximo {ancho_max} no da una altura válida para la captura")
        })?;

    let reducida = image::imageops::resize(
        &imagen,
        ancho_max,
        nueva_altura,
        image::imageops::FilterType::Triangle,
    );

    let mut png = std::io::Cursor::new(Vec::new());
    reducida
        .write_to(&mut png, image::ImageFormat::Png)
        .map_err(|e| format!("No se pudo codificar la captura como PNG: {e}"))?;

    // base64 0.22: engine estándar (`STANDARD`); el trait `Engine` está
    // importado arriba con `use base64::Engine as _;`.
    Ok(base64::engine::general_purpose::STANDARD.encode(png.into_inner()))
}

#[cfg(test)]
mod pruebas {
    use super::{altura_escalada, punto_dentro};
    #[cfg(ventana_falsa)]
    use super::{capturar_ventana, ventanas_prestables};
    #[cfg(ventana_falsa)]
    use base64::Engine as _;

    #[test]
    fn punto_dentro_de_la_ventana() {
        // Ventana en (100, 50) de 200 × 100: píxeles x 100..=299, y 50..=149.
        assert!(punto_dentro(100, 50, 100, 50, 200, 100));
        assert!(punto_dentro(299, 149, 100, 50, 200, 100));
        assert!(punto_dentro(150, 75, 100, 50, 200, 100));
        // Bordes derecho e inferior ya son fuera; también a la izquierda y arriba.
        assert!(!punto_dentro(300, 75, 100, 50, 200, 100));
        assert!(!punto_dentro(150, 150, 100, 50, 200, 100));
        assert!(!punto_dentro(99, 75, 100, 50, 200, 100));
        assert!(!punto_dentro(150, 49, 100, 50, 200, 100));
    }

    #[test]
    fn punto_dentro_sin_desbordes_ni_ventanas_vacias() {
        // Monitor a la izquierda (coordenadas negativas).
        assert!(punto_dentro(-10, -10, -1920, -1080, 1920, 1080));
        assert!(!punto_dentro(0, 0, -1920, -1080, 1920, 1080));
        // Tamaños enormes no desbordan.
        assert!(punto_dentro(i32::MAX, 0, i32::MAX - 1, 0, u32::MAX, 1));
        // Una ventana de tamaño cero no contiene ningún punto.
        assert!(!punto_dentro(5, 5, 5, 5, 0, 10));
        assert!(!punto_dentro(5, 5, 5, 5, 10, 0));
    }

    #[test]
    fn reduce_manteniendo_la_proporcion() {
        assert_eq!(altura_escalada(1000, 500, 500), Some(250));
        assert_eq!(altura_escalada(1000, 500, 100), Some(50));
        // Redondeo: 3005 × 0,1 = 300,5 → 301.
        assert_eq!(altura_escalada(1000, 3005, 100), Some(301));
    }

    #[test]
    fn no_divide_por_cero_ni_da_altura_imposible() {
        assert_eq!(altura_escalada(0, 300, 100), None);
        assert_eq!(altura_escalada(100, 0, 100), None);
        assert_eq!(altura_escalada(100, 300, 0), None);
    }

    // Las pruebas que usan `VentanaFalsa` necesitan un `xcap` sustituto (crate
    // de verificación, `RUSTFLAGS=--cfg ventana_falsa`): el xcap real no ofrece
    // ventanas de prueba y el crate de Tauri no está en el árbol de pruebas
    // real hasta que la parte de cableado lo ensamble.
    #[cfg(ventana_falsa)]
    #[test]
    fn lista_filtra_por_app_y_sin_duplicados() {
        xcap::poner_ventanas_de_prueba(vec![
            xcap::VentanaFalsa::nueva(1, "Astra", "Astra · mando"),
            xcap::VentanaFalsa::nueva(2, "Otra", "Otra ventana"),
            xcap::VentanaFalsa::nueva(1, "Astra", "Astra duplicada"),
        ]);
        let app = tauri::AppHandle;

        let res = ventanas_prestables(app.clone(), vec!["Astra".to_string()]).unwrap();
        assert_eq!(res.len(), 1);
        assert_eq!(res[0].id, 1);
        assert_eq!(res[0].app_name, "Astra");
        assert_eq!(res[0].title, "Astra · mando");

        // Una app que no está en la lista marca no devuelve nada.
        let vacia = ventanas_prestables(app, vec!["Inexistente".to_string()]).unwrap();
        assert!(vacia.is_empty());
    }

    #[cfg(ventana_falsa)]
    #[test]
    fn captura_devuelve_png_en_base64_redimensionado() {
        let mut imagen = image::RgbaImage::new(8, 4);
        for p in imagen.pixels_mut() {
            *p = image::Rgba([255u8, 0, 0, 255]);
        }
        xcap::poner_ventanas_de_prueba(vec![xcap::VentanaFalsa::con_imagen(
            7,
            "Astra",
            "Astra · mando",
            imagen,
        )]);

        let png_b64 = capturar_ventana(tauri::AppHandle, 7, 4).unwrap();
        let png = base64::engine::general_purpose::STANDARD
            .decode(png_b64)
            .unwrap();
        let decodificada = image::load_from_memory(&png).unwrap().to_rgba8();
        assert_eq!((decodificada.width(), decodificada.height()), (4, 2));
        assert_eq!(decodificada.get_pixel(0, 0).0, [255u8, 0, 0, 255]);
    }

    #[cfg(ventana_falsa)]
    #[test]
    fn captura_rechaza_id_inexistente_y_ancho_invalido() {
        xcap::poner_ventanas_de_prueba(vec![xcap::VentanaFalsa::nueva(
            7,
            "Astra",
            "Astra · mando",
        )]);

        assert!(capturar_ventana(tauri::AppHandle, 99, 100).is_err());
        assert!(capturar_ventana(tauri::AppHandle, 7, 0).is_err());
    }
}
