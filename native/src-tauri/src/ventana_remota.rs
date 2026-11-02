//! `ventanas_prestables` y `capturar_ventana` rehechos con la API real de xcap 0.9
//! (APR1019A, parte 1): `Window::all()` ya devuelve las ventanas de todos los
//! monitores con duplicados, `app_name()` da el nombre de la app y `capture_image()`
//! devuelve un `image::RgbaImage` (image 0.25) listo para codificar. La entrada
//! (`entrada_ventana`, con enigo 0.6) se rehízo en APR1019B: solo actúa dentro de
//! los límites de la ventana y usa `Coordinate::Abs` y `Direction::Click`.

use base64::Engine as _;
use enigo::{Button, Coordinate, Direction, Enigo, Keyboard, Mouse, Settings};
use serde::{Deserialize, Serialize};
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

/// Evento de entrada que reenvía la web mientras dura el préstamo de la
/// ventana. Las coordenadas `x` e `y` son relativas a la ventana (0,0 es su
/// esquina superior izquierda).
#[derive(Deserialize, Clone)]
pub struct EntradaVentana {
    /// «teclado», «raton» o «tacto».
    pub tipo: String,
    /// Acción pedida por la web («pulsar», «mover», «escribir»…).
    pub accion: String,
    #[serde(default)]
    pub x: Option<f64>,
    #[serde(default)]
    pub y: Option<f64>,
    #[serde(default)]
    pub tecla: Option<String>,
    #[serde(default)]
    pub boton: Option<u8>,
}

/// Comprueba si el punto de pantalla `(px, py)` cae dentro del rectángulo de
/// la ventana situado en `(x, y)` con `ancho × alto`. El borde derecho y el
/// inferior no cuentan (rectángulo semiabierto). Se opera en `i64` para que
/// sumar el tamaño a un origen negativo no desborde.
fn punto_dentro(x: i32, y: i32, ancho: u32, alto: u32, px: i32, py: i32) -> bool {
    let (x, y, px, py) = (x as i64, y as i64, px as i64, py as i64);
    px >= x && px < x + ancho as i64 && py >= y && py < y + alto as i64
}

/// Envía una entrada a la ventana `id` con enigo 0.6. Solo actúa si el punto
/// indicado cae dentro de los límites de la ventana: así un clic perdido no
/// toca otra aplicación del escritorio.
#[tauri::command]
pub fn entrada_ventana(
    _app: AppHandle,
    id: u32,
    entrada: EntradaVentana,
) -> Result<(), String> {
    let ventana = xcap::Window::all()
        .map_err(|e| format!("No se pudieron listar las ventanas: {e}"))?
        .into_iter()
        .find(|w| w.id().map(|wid| wid == id).unwrap_or(false))
        .ok_or_else(|| format!("No se encontró la ventana con el ID {id}"))?;

    let x = ventana.x().map_err(|e| format!("No se pudo leer la posición X de la ventana: {e}"))?;
    let y = ventana.y().map_err(|e| format!("No se pudo leer la posición Y de la ventana: {e}"))?;
    let ancho = ventana.width().map_err(|e| format!("No se pudo leer el ancho de la ventana: {e}"))?;
    let alto = ventana.height().map_err(|e| format!("No se pudo leer el alto de la ventana: {e}"))?;

    // Sin punto no hay forma de saber si el evento va dirigido a esta ventana.
    let (Some(rel_x), Some(rel_y)) = (entrada.x, entrada.y) else {
        return Ok(());
    };
    let pantalla_x = x.saturating_add(rel_x.round() as i32);
    let pantalla_y = y.saturating_add(rel_y.round() as i32);
    if !punto_dentro(x, y, ancho, alto, pantalla_x, pantalla_y) {
        return Ok(());
    }

    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("No se pudo inicializar enigo: {e}"))?;

    match entrada.tipo.as_str() {
        "teclado" => {
            if let Some(texto) = entrada.tecla.as_deref() {
                enigo
                    .text(texto)
                    .map_err(|e| format!("No se pudo escribir el texto: {e}"))?;
            }
        }
        "raton" | "tacto" => {
            enigo
                .move_mouse(pantalla_x, pantalla_y, Coordinate::Abs)
                .map_err(|e| format!("No se pudo mover el ratón: {e}"))?;
            // «mover» solo desplaza el cursor; cualquier otra acción pulsa.
            if entrada.accion == "mover" {
                return Ok(());
            }
            let boton = match entrada.boton.unwrap_or(0) {
                1 => Button::Middle,
                2 => Button::Right,
                _ => Button::Left,
            };
            enigo
                .button(boton, Direction::Click)
                .map_err(|e| format!("No se pudo pulsar el botón del ratón: {e}"))?;
        }
        otro => return Err(format!("Tipo de entrada no reconocido: {otro}")),
    }

    Ok(())
}

#[cfg(test)]
mod pruebas {
    use super::{altura_escalada, capturar_ventana, punto_dentro, ventanas_prestables};
    use base64::Engine as _;

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

    #[test]
    fn punto_dentro_respeta_los_bordes_de_la_ventana() {
        // Ventana en (100, 50) de 200 × 100: las esquinas interiores entran.
        assert!(punto_dentro(100, 50, 200, 100, 100, 50));
        assert!(punto_dentro(100, 50, 200, 100, 299, 149));
        // El borde derecho y el inferior quedan fuera (rectángulo semiabierto).
        assert!(!punto_dentro(100, 50, 200, 100, 300, 100));
        assert!(!punto_dentro(100, 50, 200, 100, 200, 150));
        // A la izquierda y por arriba tampoco.
        assert!(!punto_dentro(100, 50, 200, 100, 99, 50));
        assert!(!punto_dentro(100, 50, 200, 100, 100, 49));
        // Un origen negativo (pantalla a la izquierda) no desborda al sumar.
        assert!(punto_dentro(-1920, 0, 1920, 1080, -100, 100));
        // Una ventana de tamaño cero no contiene ningún punto.
        assert!(!punto_dentro(0, 0, 0, 0, 0, 0));
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
