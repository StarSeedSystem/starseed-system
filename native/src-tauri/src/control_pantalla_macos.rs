//! (CTL1117M) Control entre mis neuronas · el Mac como aparato CONTROLADO: la PANTALLA hacia quien lo controla.
//!
//! · Los tres comandos `control_pantalla_*` (seam 1) contestan aquí en macOS con la misma cabecera de 12 bytes que Android
//!   (`l::cabecera_cuadro`) y un JPEG de la pantalla principal (`xcap`), a `lado_max` y `calidad`.
//! · Solo dentro de una sesión abierta con el indicador a la vista, VERIFICADA en lo nativo (el controlador firmó la
//!   apertura y sigue en la lista aceptada de este Mac) y sin pausa local. Con la pantalla bloqueada no se captura.
//! · Si falta «Grabación de pantalla», se dice qué falta (`grabacion-pantalla`) y la persona la da en Ajustes del Sistema
//!   (`control_abrir_ajuste` abre ese panel). Aquí NUNCA se pide ni se contesta el aviso del sistema: se usa
//!   `CGPreflightScreenCaptureAccess`, que solo mira.
//! · Un cuadro no se guarda ni se anota; el registro lleva fuente, tamaño y fps al empezar y al acabar.

use crate::control_entrada_logica as l;
use crate::control_entrada_macos as em;
use crate::control_entrada_macos_logica as m;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};
use tauri::AppHandle;

const FUENTE_REGISTRO: &str = "mac-pantalla";
/// Pausa entre capturas (~6 cuadros por segundo como mucho).
const PERIODO_MS: u64 = 160;

struct Activa {
    ancho: u32,
    alto: u32,
    desde: std::time::Instant,
    parar: Arc<AtomicBool>,
    cuadros: Arc<AtomicU32>,
}

fn activa() -> MutexGuard<'static, Option<Activa>> {
    static A: OnceLock<Mutex<Option<Activa>>> = OnceLock::new();
    A.get_or_init(|| Mutex::new(None)).lock().unwrap_or_else(|e| e.into_inner())
}

fn buffer() -> MutexGuard<'static, Vec<u8>> {
    static B: OnceLock<Mutex<Vec<u8>>> = OnceLock::new();
    B.get_or_init(|| Mutex::new(Vec::new())).lock().unwrap_or_else(|e| e.into_inner())
}

/// Tamaño en píxeles de la pantalla principal (para `control_estado_aparato`).
pub fn tamano_principal() -> Option<(u32, u32)> {
    let ms = xcap::Monitor::all().ok()?;
    let p = ms.iter().find(|m| m.is_primary().unwrap_or(false)).or(ms.first())?;
    Some((p.width().ok()?, p.height().ok()?))
}

fn capturar_jpeg(lado: u32, calidad: u8, numero: u32) -> Option<(Vec<u8>, u32, u32)> {
    let ms = xcap::Monitor::all().ok()?;
    let mon = ms.iter().find(|m| m.is_primary().unwrap_or(false)).or(ms.first())?;
    let img = mon.capture_image().ok()?;
    let (w, h) = l::escalar(img.width(), img.height(), lado);
    let img = if (w, h) == (img.width(), img.height()) { img } else { image::imageops::resize(&img, w, h, image::imageops::FilterType::Triangle) };
    let rgb = image::DynamicImage::ImageRgba8(img).to_rgb8();
    let mut salida = Vec::with_capacity(64 * 1024);
    salida.extend_from_slice(&l::cabecera_cuadro(numero, w.min(65535) as u16, h.min(65535) as u16, 0));
    let mut cod = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut salida, calidad);
    cod.encode_image(&rgb).ok()?;
    Some((salida, w, h))
}

/// `control_pantalla_iniciar` en macOS.
pub fn iniciar(app: &AppHandle, sesion: &str, lado: u32, calidad: u32) -> Value {
    use crate::control_neuronas::{de_de_sesion, puerta_sesion, ModoPuerta};
    if puerta_sesion(app, sesion, ModoPuerta::Actividad).is_err() {
        return json!({ "ok": false, "motivo": "sesion" });
    }
    // Como en Android (FSG1116 · A2): solo el controlador que abrió la sesión con su orden firmada y SIGUE aceptado aquí.
    match de_de_sesion(sesion) {
        Some(de) if crate::control_aceptados_macos::sigue_aceptado(app, &de) => {}
        _ => return json!({ "ok": false, "motivo": "sesion" }),
    }
    if !em::grabacion_ok() {
        return json!({ "ok": false, "motivo": "sin-consentimiento", "falta": [m::FALTA_GRABACION] });
    }
    if em::bloqueada() {
        return json!({ "ok": false, "motivo": "sin-servicio" });
    }
    let lado = lado.clamp(l::LADO_MIN, l::LADO_MAX);
    let calidad = l::calidad_jpeg(calidad);
    parar_interno(app); // una captura a la vez
    // El primer cuadro se hace aquí para decir el tamaño real y para fallar con verdad si el sistema no deja capturar.
    let Some((primero, ancho, alto)) = capturar_jpeg(lado, calidad, 1) else {
        return json!({ "ok": false, "motivo": "sin-consentimiento", "falta": [m::FALTA_GRABACION] });
    };
    *buffer() = primero;
    let parar = Arc::new(AtomicBool::new(false));
    let cuadros = Arc::new(AtomicU32::new(1));
    {
        let (parar, cuadros, app2, sesion2) = (parar.clone(), cuadros.clone(), app.clone(), sesion.to_string());
        std::thread::Builder::new()
            .name("control-pantalla-mac".into())
            .spawn(move || {
                while !parar.load(Ordering::SeqCst) {
                    let t0 = std::time::Instant::now();
                    let en_pausa = crate::control_neuronas::sesion_pausada(&sesion2);
                    if !en_pausa && !em::bloqueada() {
                        let n = cuadros.load(Ordering::SeqCst) + 1;
                        if let Some((c, _, _)) = capturar_jpeg(lado, calidad, n) {
                            *buffer() = c;
                            cuadros.store(n, Ordering::SeqCst);
                        }
                    } else if en_pausa {
                        buffer().clear(); // en pausa local no sale ningún cuadro (lo que la persona teclea no se ve)
                    }
                    let _ = &app2;
                    let gastado = t0.elapsed().as_millis() as u64;
                    std::thread::sleep(std::time::Duration::from_millis(PERIODO_MS.saturating_sub(gastado).max(20)));
                }
            })
            .ok();
    }
    *activa() = Some(Activa { ancho, alto, desde: std::time::Instant::now(), parar, cuadros });
    crate::ble::nota(None, "control-pantalla", &format!("inicio fuente={FUENTE_REGISTRO} ancho={ancho} alto={alto} fps=-"));
    crate::control_neuronas::anotar_k(app, "pantalla-iniciada", &format!("fuente={FUENTE_REGISTRO} ancho={ancho} alto={alto}"));
    // La web solo conoce dos valores de `fuente`; la captura de pantalla completa es la de «proyeccion».
    json!({ "ok": true, "fuente": "proyeccion", "ancho": ancho, "alto": alto, "giro": 0 })
}

/// `control_pantalla_cuadro` en macOS: el cuadro más nuevo que `desde`, o cero bytes.
pub fn cuadro(app: &AppHandle, sesion: &str, desde: u32) -> Vec<u8> {
    use crate::control_neuronas::{puerta_sesion, ModoPuerta};
    use std::sync::atomic::AtomicU64;
    static ULTIMA_ACTIVIDAD: AtomicU64 = AtomicU64::new(0);
    if activa().is_none() {
        return Vec::new();
    }
    // Ver la pantalla cuenta como actividad (como mucho una vez cada 10 s): una sesión mirada no caduca a los 2 min.
    let ahora = crate::control_neuronas::mono_k();
    let modo = if ahora.saturating_sub(ULTIMA_ACTIVIDAD.load(Ordering::Relaxed)) >= 10_000 { ModoPuerta::Actividad } else { ModoPuerta::Lectura };
    if puerta_sesion(app, sesion, modo).is_err() {
        return Vec::new();
    }
    if modo == ModoPuerta::Actividad {
        ULTIMA_ACTIVIDAD.store(ahora, Ordering::Relaxed);
    }
    if crate::control_neuronas::sesion_pausada(sesion) {
        return Vec::new();
    }
    // La lista aceptada se vuelve a mirar: si la persona quitó al controlador o apagó el control, no sale nada más.
    match crate::control_neuronas::de_de_sesion(sesion) {
        Some(de) if crate::control_aceptados_macos::sigue_aceptado(app, &de) => {}
        _ => return Vec::new(),
    }
    l::cuadro_si_nuevo(&buffer(), desde).map(<[u8]>::to_vec).unwrap_or_default()
}

/// Para la captura y deja la línea de fin (con los fps medidos). Sin pantalla activa, no hace nada.
pub fn parar_interno(app: &AppHandle) {
    let Some(a) = activa().take() else { return };
    a.parar.store(true, Ordering::SeqCst);
    buffer().clear();
    let seg = a.desde.elapsed().as_secs_f64().max(0.001);
    let linea = format!("fin fuente={FUENTE_REGISTRO} ancho={} alto={} fps={:.1}", a.ancho, a.alto, f64::from(a.cuadros.load(Ordering::SeqCst)) / seg);
    crate::ble::nota(None, "control-pantalla", &linea);
    crate::control_neuronas::anotar_k(app, "pantalla-parada", &linea);
}
