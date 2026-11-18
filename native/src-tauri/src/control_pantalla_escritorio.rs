//! (CTL1117M · CTL1118L) Control entre mis neuronas · un Mac o un Linux (X11) como aparato CONTROLADO: la PANTALLA hacia quien
//! lo controla. Un solo motor para los dos; lo que cambia (qué falta antes de capturar, cómo se sabe si está bloqueado y el
//! nombre de la fuente en el registro) está en las funciones `plataforma_*` de abajo.
//!
//! · Los tres comandos `control_pantalla_*` (seam 1) contestan aquí en macOS con la misma cabecera de 12 bytes que Android
//!   (`l::cabecera_cuadro`) y un JPEG de la pantalla principal (`xcap`), a `lado_max` y `calidad`.
//! · Solo dentro de una sesión abierta con el indicador a la vista, VERIFICADA en lo nativo (el controlador firmó la
//!   apertura y sigue en la lista aceptada de este Mac) y sin pausa local. Con la pantalla bloqueada no se captura.
//! · Si falta «Grabación de pantalla», se dice qué falta (`grabacion-pantalla`) y la persona la da en Ajustes del Sistema
//!   (`control_abrir_ajuste` abre ese panel). Aquí NUNCA se pide ni se contesta el aviso del sistema: se usa
//!   `CGPreflightScreenCaptureAccess`, que solo mira.
//! · Un cuadro no se guarda ni se anota; el registro lleva fuente, tamaño y fps al empezar y al acabar.

use crate::control_captura::capturar_jpeg;
use crate::control_entrada_logica as l;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};
use tauri::AppHandle;

#[cfg(target_os = "macos")]
const FUENTE_REGISTRO: &str = "mac-pantalla";
#[cfg(target_os = "linux")]
const FUENTE_REGISTRO: &str = "linux-pantalla";

/// Lo que falta antes de poder capturar: (motivo del seam, falta). `None` = se puede.
#[cfg(target_os = "macos")]
fn plataforma_falta() -> Option<(&'static str, &'static str)> {
    (!crate::control_entrada_macos::grabacion_ok()).then_some(("sin-consentimiento", crate::control_entrada_macos_logica::FALTA_GRABACION))
}
#[cfg(target_os = "linux")]
fn plataforma_falta() -> Option<(&'static str, &'static str)> {
    crate::control_entrada_linux::falta_para_ver()
}

#[cfg(target_os = "macos")]
fn plataforma_bloqueada() -> bool {
    crate::control_entrada_macos::bloqueada()
}
#[cfg(target_os = "linux")]
fn plataforma_bloqueada() -> bool {
    crate::control_entrada_linux::bloqueada()
}

/// Una línea de registro cuando la pantalla no se puede iniciar (para diagnosticar en el aparato).
fn nota_sin_pantalla(motivo: &str, falta: &str) {
    #[cfg(target_os = "linux")]
    crate::ble::nota(None, "control-pantalla", &crate::control_escritorio_linux_logica::linea_pantalla_sin(motivo, falta, crate::control_entrada_linux::grafica()));
    #[cfg(not(target_os = "linux"))]
    crate::ble::nota(None, "control-pantalla", &format!("sin-pantalla motivo={motivo} falta={falta} fuente={FUENTE_REGISTRO}"));
}

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

/// La captura de prueba falló aunque nada faltaba: en el Mac es casi siempre el permiso; en Linux, el servidor X.
#[cfg(target_os = "macos")]
fn plataforma_captura_fallida() -> (&'static str, &'static str) {
    ("sin-consentimiento", crate::control_entrada_macos_logica::FALTA_GRABACION)
}
#[cfg(target_os = "linux")]
fn plataforma_captura_fallida() -> (&'static str, &'static str) {
    ("sin-servicio", crate::control_escritorio_linux_logica::FALTA_X11)
}

/// `control_pantalla_iniciar` en macOS y Linux.
pub fn iniciar(app: &AppHandle, sesion: &str, lado: u32, calidad: u32) -> Value {
    use crate::control_neuronas::{de_de_sesion, puerta_sesion, ModoPuerta};
    if puerta_sesion(app, sesion, ModoPuerta::Actividad).is_err() {
        return json!({ "ok": false, "motivo": "sesion" });
    }
    // Como en Android (FSG1116 · A2): solo el controlador que abrió la sesión con su orden firmada y SIGUE aceptado aquí.
    match de_de_sesion(sesion) {
        Some(de) if crate::control_aceptados_escritorio::sigue_aceptado(app, &de) => {}
        _ => return json!({ "ok": false, "motivo": "sesion" }),
    }
    if let Some((motivo, falta)) = plataforma_falta() {
        nota_sin_pantalla(motivo, falta);
        return json!({ "ok": false, "motivo": motivo, "falta": [falta] });
    }
    if plataforma_bloqueada() {
        nota_sin_pantalla("sin-servicio", "bloqueada");
        return json!({ "ok": false, "motivo": "sin-servicio" });
    }
    let lado = lado.clamp(l::LADO_MIN, l::LADO_MAX);
    let calidad = l::calidad_jpeg(calidad);
    parar_interno(app); // una captura a la vez
    // El primer cuadro se hace aquí para decir el tamaño real y para fallar con verdad si el sistema no deja capturar.
    let Some((primero, ancho, alto)) = capturar_jpeg(lado, calidad, 1) else {
        let (motivo, falta) = plataforma_captura_fallida();
        nota_sin_pantalla(motivo, falta);
        return json!({ "ok": false, "motivo": motivo, "falta": [falta] });
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
                    if !en_pausa && !plataforma_bloqueada() {
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
        Some(de) if crate::control_aceptados_escritorio::sigue_aceptado(app, &de) => {}
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
