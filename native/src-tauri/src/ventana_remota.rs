use tauri::AppHandle;
use serde::Serialize;
use std::collections::HashSet;
use xcap;

/// Lista de ventanas prestables (las que pertenecen a apps marcadas como prestables por el dueño).
#[tauri::command]
pub fn ventanas_prestables(_app: AppHandle, apps: Vec<String>) -> Result<Vec<VentanaInfo>, String> {
    // Convertimos la lista de apps a un HashSet para búsqueda eficiente.
    let apps_set: HashSet<String> = apps.into_iter().collect();
    let mut ventanas = Vec::new();

    // Obtén todos los monitores y luego las ventanas de cada monitor.
    // Nota: Una ventana puede aparecer en múltiples monitors, así que usamos un HashSet para evitar duplicados por ID.
    let mut seen_ids = HashSet::new();
    for monitor in xcap::Monitor::all().map_err(|e| format!("No se pudieron obtener los monitores: {e}"))? {
        for window in monitor.windows().map_err(|e| format!("No se pudieron obtener las ventanas del monitor: {e}"))? {
            // Obtenemos el ID de la ventana (convertido a u32).
            let id = window.id() as u32;
            if seen_ids.contains(&id) {
                continue;
            }
            seen_ids.insert(id);

            // Obtenemos el nombre de la aplicación (proceso) y el título de la ventana.
            let app_name = window
                .process()
                .ok()
                .and_then(|p| p.name().to_str().ok())
                .unwrap_or("desconocido")
                .to_string();
            let title = window
                .title()
                .ok()
                .unwrap_or("desconocido")
                .to_string();

            // Verificamos si el nombre de la aplicación está en la lista de apps prestables.
            if apps_set.contains(&app_name) {
                ventanas.push(VentanaInfo {
                    id,
                    app_name,
                    title,
                });
            }
        }
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

/// Captura un fotograma de la ventana con el `id` dado y lo devuelve como PNG en base64.
/// El `ancho_max` es el ancho máximo en píxeles; se escala manteniendo la proporción.
#[tauri::command]
pub fn capturar_ventana(_app: AppHandle, id: u32, ancho_max: u32) -> Result<String, String> {
    use image::{ImageOutputFormat, RgbaImage};
    use std::io::Cursor;

    // Buscamos la ventana por su ID en todos los monitores.
    let window = xcap::Monitor::all()
        .map_err(|e| format!("No se pudieron obtener los monitores: {e}"))?
        .find_map(|monitor| {
            monitor.windows()
                .ok()
                .and_then(|windows| windows.into_iter().find(|w| w.id() as u32 == id))
        })
        .ok_or_else(|| format!("No se encontró la ventana con ID {id}"))?;

    // Capturamos la imagen de la ventana.
    let img = window
        .capture_image()
        .map_err(|e| format!("No se pudo capturar la imagen de la ventana: {e}"))?;

    // Convertimos la imagen de BGRA a RGBA.
    let mut rgba_img = RgbaImage::new(img.width, img.height);
    for (src, dst) in img.data.chunks_exact(4).zip(rgba_img.pixels_mut()) {
        // src: [B, G, R, A]
        dst.0[0] = src[2]; // R
        dst.0[1] = src[1]; // G
        dst.0[2] = src[0]; // B
        dst.0[3] = src[3]; // A
    }

    // Calculamos el nuevo tamaño manteniendo la proporción.
    let scale = ancho_max as f32 / img.width as f32;
    let new_width = ancho_max;
    let new_height = (img.height as f32 * scale).round() as u32;
    if new_height == 0 {
        // Evitamos división por cero o altura cero.
        return Err("El ancho máximo es demasiado pequeño, resultando en altura cero.".into());
    }

    // Redimensionamos la imagen.
    let resized_img = image::imageops::resize(
        &rgba_img,
        new_width,
        new_height,
        image::imageops::FilterType::Triangle,
    );

    // Codificamos la imagen como PNG en un buffer.
    let mut buffer = Cursor::new(Vec::new());
    resized_img
        .write_to(&mut buffer, ImageOutputFormat::Png)
        .map_err(|e| format!("No se pudo codificar la imagen como PNG: {e}"))?;

    // Convertimos el buffer a base64.
    let base64 = base64::encode(buffer.into_inner());

    Ok(base64)
}

/// Envía un evento de entrada (teclado o ratón) a la ventana con el `id` dado.
/// El evento solo se procesa si el punto (x, y) cae dentro de los límites de la ventana
/// y hay una sesión válida (que se pasa desde la web).
#[tauri::command]
pub fn entrada_ventana(_app: AppHandle, id: u32, evento: InputEvento) -> Result<(), String> {
    use enigo::{Coordinate, Direction, Enigo, Key, MouseButton, Settings};

    // Buscamos la ventana por su ID en todos los monitores.
    let window = xcap::Monitor::all()
        .map_err(|e| format!("No se pudieron obtener los monitores: {e}"))?
        .find_map(|monitor| {
            monitor.windows()
                .ok()
                .and_then(|windows| windows.into_iter().find(|w| w.id() as u32 == id))
        })
        .ok_or_else(|| format!("No se encontró la ventana con ID {id}"))?;

    // Obtenemos la posición y el tamaño de la ventana.
    let x = window.x()?;
    let y = window.y()?;
    let width = window.width()?;
    let height = window.height()?;

    // Verificamos si el punto (evento.x, evento.y) está dentro de la ventana.
    let punto_x = evento.x as i32;
    let punto_y = evento.y as i32;
    if punto_x < x
        || punto_x >= x + width as i32
        || punto_y < y
        || punto_y >= y + height as i32
    {
        // El punto está fuera de la ventana, no hacemos nada.
        return Ok(());
    }

    // Convertimos las coordenadas relativas a la ventana a coordenadas de pantalla.
    let pantalla_x = x + punto_x;
    let pantalla_y = y + punto_y;

    // Creamos una instancia de Enigo.
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| format!("No se pudo inicializar enigo: {e}"))?;

    // Procesamos el evento según su tipo.
    match evento.tipo.as_str() {
        "tecla" => {
            // Para teclado, enviamos la tecla.
            // Nota: El detalle es la tecla como string (ej. "a", "Enter", "ArrowLeft").
            // Convertimos el string a una tecla de enigo.
            let key = if evento.detalle.len() == 1 {
                let c = evento.detalle.chars().next().unwrap();
                Key::Unicode(c)
            } else {
                match evento.detalle.as_str() {
                    "Enter" => Key::Return,
                    "Escape" => Key::Escape,
                    "Tab" => Key::Tab,
                    "Backspace" => Key::Backspace,
                    "Delete" => Key::Delete,
                    "ArrowLeft" => Key::LeftArrow,
                    "ArrowRight" => Key::RightArrow,
                    "ArrowUp" => Key::UpArrow,
                    "ArrowDown" => Key::DownArrow,
                    " " => Key::Space,
                    // Otras teclas especiales pueden añadirse aquí.
                    _ => {
                        // Si no es una tecla especial y tiene más de un carácter, intentamos tomar el primer carácter.
                        if let Some(c) = evento.detalle.chars().next() {
                            Key::Unicode(c)
                        } else {
                            return Err("Detalle de tecla vacío.".into());
                        }
                    }
                }
            };
            enigo
                .key(key, Direction::Click)
                .map_err(|e| format!("No se pudo enviar el evento de tecla: {e}"))?;
        }
        "raton" => {
            // Para ratón, asumimos que el detalle es la acción: "click", "mousedown", "mouseup", "mousemove".
            // Por simplicidad, solo manejamos "click" como clic izquierdo.
            match evento.detalle.as_str() {
                "click" => {
                    // Movemos el mouse a la posición y hacemos clic izquierdo.
                    enigo
                        .mouse_move_to(pantalla_x, pantalla_y)
                        .map_err(|e| format!("No se pudo mover el mouse: {e}"))?;
                    enigo
                        .mouse_button(MouseButton::Left, Direction::Click)
                        .map_err(|e| format!("No se pudo hacer clic: {e}"))?;
                }
                "mousedown" => {
                    enigo
                        .mouse_move_to(pantalla_x, pantalla_y)
                        .map_err(|e| format!("No se pudo mover el mouse: {e}"))?;
                    enigo
                        .mouse_button(MouseButton::Left, Direction::Down)
                        .map_err(|e| format!("No se pudo presionar el botón del mouse: {e}"))?;
                }
                "mouseup" => {
                    enigo
                        .mouse_move_to(pantalla_x, pantalla_y)
                        .map_err(|e| format!("No se pudo mover el mouse: {e}"))?;
                    enigo
                        .mouse_button(MouseButton::Left, Direction::Up)
                        .map_err(|e| format!("No se pudo soltar el botón del mouse: {e}"))?;
                }
                "mousemove" => {
                    enigo
                        .mouse_move_to(pantalla_x, pantalla_y)
                        .map_err(|e| format!("No se pudo mover el mouse: {e}"))?;
                }
                // Ignoramos otros eventos de ratón por ahora.
                _ => {
                    // No hacemos nada para eventos de ratón no reconocidos.
                }
            }
        }
             _ => {
                 return Err(format!("Tipo de evento no reconocido: {}", evento.tipo));
             }
    }

    Ok(())
}

/// Evento de entrada que puede ser de teclado o ratón.
#[derive(Serialize, Clone)]
pub struct InputEvento {
    /// Tipo de evento: "tecla" o "raton".
    pub tipo: String,
    /// Para tecla: el código de la tecla (ej. "KeyA", "Enter").
    /// Para ratón: el evento ("click", "mousedown", etc.) o la rueda.
    pub detalle: String,
    /// Coordenadas X y Y en píxeles relativas a la ventana (0,0 es la esquina superior izquierda).
    pub x: u32,
    pub y: u32,
}