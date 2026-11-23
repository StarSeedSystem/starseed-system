//! (AND1115K) Control entre mis neuronas, fases 2–3 · la PANTALLA de la tableta hacia quien la controla.
//! Fuente «accesibilidad»: capturas del servicio de accesibilidad (`AccessibilityService.takeScreenshot`, API 30+).
//! Contrato: seam 1 (`control_pantalla_iniciar`, `_cuadro`, `_parar`).
//!
//! · Solo dentro de una sesión abierta con el indicador a la vista, y solo si la persona encendió, EN la tableta,
//!   «Ver la pantalla sin preguntar en cada sesión» (diálogo nativo de Kotlin, apagado por defecto).
//! · Kotlin deja cada cuadro ya hecho (`cabecera de 12 bytes + JPEG`) en `cuadro.bin` con un solo archivo que se
//!   reemplaza de forma atómica: Rust lo lee y lo devuelve si es más nuevo que `desde`. Un cuadro nunca se guarda
//!   ni se anota (el registro solo lleva fuente, tamaño y fps al empezar y al acabar).
//! · Android limita `takeScreenshot` a una captura cada ~333 ms: como mucho ~3 cuadros por segundo.
//! · PENC2: `fuente` opcional («auto» por defecto, «proyeccion» o «accesibilidad»). La proyección (MediaProjection) es
//!   fluida pero Android pregunta en CADA sesión: `control_capacidades` solo dice `proyeccion:true` con el «Sí» de la sesión.
//!   Se anota la fuente REAL que contestó Kotlin, no la pedida.
//! · En escritorio todo contesta `{ ok:false, motivo:"sin-soporte" }`; macOS (CTL1117M) y Linux/X11 (CTL1118L) capturan con xcap.

#![allow(dead_code)] // AND1115K: parte de esto solo se usa en Android

#[cfg(target_os = "android")]
use crate::control_entrada_logica as l;
#[cfg(target_os = "android")]
use serde_json::json;
use serde_json::Value;
use std::sync::{Mutex, MutexGuard, OnceLock};

#[allow(dead_code)]
struct Activa {
    fuente: String,
    ancho: u64,
    alto: u64,
    desde: std::time::Instant,
}

fn activa() -> MutexGuard<'static, Option<Activa>> {
    static A: OnceLock<Mutex<Option<Activa>>> = OnceLock::new();
    A.get_or_init(|| Mutex::new(None)).lock().unwrap_or_else(|e| e.into_inner())
}

/// Seam 1. `lado_max` (lado mayor del cuadro, 160..2048) y `calidad` (entero 1..100, UNI1115M) → JPEG.
/// La página llama con los nombres en snake_case, tal como están en el seam.
#[tauri::command(async, rename_all = "snake_case")]
pub fn control_pantalla_iniciar(app: tauri::AppHandle, webview: tauri::Webview, sesion: String, lado_max: Option<u32>, calidad: Option<u32>, fuente: Option<String>) -> Result<Value, String> {
    crate::control_neuronas::pagina_ok(&app, &webview)?;
    Ok(iniciar(&app, &sesion, lado_max.unwrap_or(1280), calidad.unwrap_or(60), fuente.as_deref().unwrap_or("auto")))
}

/// (PENC2) La fuente que Kotlin dice haber usado; una respuesta sin `fuente` (Kotlin anterior) es accesibilidad.
pub fn fuente_real(r: &Value) -> &'static str {
    if r.get("fuente").and_then(|f| f.as_str()) == Some("proyeccion") { "proyeccion" } else { "accesibilidad" }
}

#[cfg(not(any(target_os = "android", target_os = "macos", target_os = "linux")))]
fn iniciar(_app: &tauri::AppHandle, _sesion: &str, _lado: u32, _calidad: u32, _fuente: &str) -> Value {
    crate::control_entrada::sin_soporte()
}

// CTL1117M: la pantalla principal del Mac (la fuente pedida no cambia nada: solo hay una).
#[cfg(any(target_os = "macos", target_os = "linux"))]
fn iniciar(app: &tauri::AppHandle, sesion: &str, lado: u32, calidad: u32, _fuente: &str) -> Value {
    crate::control_pantalla_escritorio::iniciar(app, sesion, lado, calidad)
}

#[cfg(target_os = "android")]
fn iniciar(app: &tauri::AppHandle, sesion: &str, lado: u32, calidad: u32, preferida: &str) -> Value {
    use crate::control_entrada::es;
    use crate::control_neuronas::{puerta_sesion, ModoPuerta};
    if puerta_sesion(app, sesion, ModoPuerta::Actividad).is_err() {
        return json!({ "ok": false, "motivo": "sesion" });
    }
    // FSG1116 · A2: la pantalla solo para el controlador que abrió la sesión con su orden firmada y SIGUE aceptado aquí.
    let aceptados = es::leer(app, crate::control_entrada::ACEPTADOS).map(|t| l::leer_aceptados(&t)).unwrap_or_default();
    match crate::control_neuronas::de_de_sesion(sesion) {
        Some(de) if aceptados.iter().any(|a| a.huella == de) => {}
        _ => return json!({ "ok": false, "motivo": "sesion" }),
    }
    // PENC2: qué hay de verdad en el aparato (lo mide Kotlin) → qué fuente se puede usar, o qué falta y lo arregla la persona allí.
    let k = es::llamar(app, json!({ "tipo": "capacidades" }), crate::control_entrada::ESPERA_MS);
    let b = |c: &str| k.as_ref().and_then(|k| k.get(c)).and_then(|x| x.as_bool()).unwrap_or(false);
    let (proyeccion_ok, accesibilidad_ok) = (b("proyeccion"), b("servicio") && b("captura") && b("sin_preguntar"));
    let lado = lado.clamp(l::LADO_MIN, l::LADO_MAX);
    let calidad = l::calidad_jpeg(calidad);
    let fuente = match l::fuente_de_pantalla(preferida, proyeccion_ok, accesibilidad_ok) {
        Ok(f) => f,
        Err(falta) => {
            if falta.contains(&"consentimiento-proyeccion") {
                // Pide a la persona, en el aparato, el «Sí» de ESTA sesión (diálogo propio y luego el de Android). No se contesta nada por ella.
                let _ = es::llamar(app, json!({ "tipo": "pantalla-iniciar", "fuente": "proyeccion", "lado_max": lado, "calidad": calidad }), crate::control_entrada::ESPERA_MS);
                // CTL1118F: la pantalla fluida se pidió y la persona la verá en el aparato; la sesión sigue con lo que hubiera.
                let actual = activa().as_ref().map_or("ninguna".to_string(), |a| a.fuente.clone());
                crate::ble::nota(None, "control-pantalla", &format!("fluida-pedida resultado=pregunta-en-el-aparato pedida={preferida} sigue-con={actual}"));
            }
            let reales: Vec<String> = crate::control_entrada::capacidades_json(k.as_ref())["falta"].as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default();
            let falta = l::falta_afinada(&falta, &reales);
            let motivo = if falta.iter().any(|f| matches!(*f, "servicio-accesibilidad" | "ajustes-restringidos")) && !falta.contains(&"consentimiento-proyeccion") { "sin-servicio" } else { "sin-consentimiento" };
            return json!({ "ok": false, "motivo": motivo, "falta": falta });
        }
    };
    let p = json!({ "tipo": "pantalla-iniciar", "fuente": fuente, "lado_max": lado, "calidad": calidad });
    let Some(r) = es::llamar(app, p, crate::control_entrada::ESPERA_MS) else {
        return json!({ "ok": false, "motivo": "sin-servicio", "falta": ["servicio-accesibilidad"] });
    };
    if r.get("ok").and_then(|x| x.as_bool()) != Some(true) {
        let mut o = json!({ "ok": false, "motivo": r.get("motivo").and_then(|m| m.as_str()).filter(|m| matches!(*m, "sin-consentimiento" | "sin-servicio" | "sesion")).unwrap_or("sin-servicio") });
        if let Some(f) = r.get("falta") {
            o["falta"] = f.clone();
        }
        return o;
    }
    let (ancho, alto, giro) = (r["ancho"].as_u64().unwrap_or(0), r["alto"].as_u64().unwrap_or(0), r["giro"].as_u64().unwrap_or(0));
    let real = fuente_real(&r); // la que Kotlin usó, no la pedida
    // CTL1118F: un cambio de fuente a media sesión (de accesibilidad a la fluida) no reinicia el reloj ni la cuenta: los cuadros siguen numerándose igual.
    let antes = activa().as_ref().map(|a| (a.fuente.clone(), a.desde));
    *activa() = Some(Activa { fuente: real.into(), ancho, alto, desde: antes.as_ref().map_or_else(std::time::Instant::now, |a| a.1) });
    match antes {
        Some((f, _)) if f != real => {
            crate::ble::nota(None, "control-pantalla", &format!("cambio fuente={real} antes={f} pedida={preferida} ancho={ancho} alto={alto}"));
            crate::control_neuronas::anotar_k(app, "pantalla-fuente", &format!("fuente={real} antes={f}"));
        }
        Some(_) => crate::ble::nota(None, "control-pantalla", &format!("sigue fuente={real} pedida={preferida} ancho={ancho} alto={alto}")),
        None => {
            crate::ble::nota(None, "control-pantalla", &format!("inicio fuente={real} pedida={preferida} ancho={ancho} alto={alto} fps=-"));
            crate::control_neuronas::anotar_k(app, "pantalla-iniciada", &format!("fuente={real} ancho={ancho} alto={alto}"));
        }
    }
    json!({ "ok": true, "fuente": real, "ancho": ancho, "alto": alto, "giro": giro })
}

/// Seam 1: el cuadro más nuevo que `desde` (cabecera de 12 bytes + JPEG) o cero bytes.
#[tauri::command(async)]
pub fn control_pantalla_cuadro(app: tauri::AppHandle, webview: tauri::Webview, sesion: String, desde: Option<u32>) -> Result<tauri::ipc::Response, String> {
    crate::control_neuronas::pagina_ok(&app, &webview)?;
    Ok(tauri::ipc::Response::new(cuadro(&app, &sesion, desde.unwrap_or(0))))
}

#[cfg(not(any(target_os = "android", target_os = "macos", target_os = "linux")))]
fn cuadro(_app: &tauri::AppHandle, _sesion: &str, _desde: u32) -> Vec<u8> {
    Vec::new()
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn cuadro(app: &tauri::AppHandle, sesion: &str, desde: u32) -> Vec<u8> {
    crate::control_pantalla_escritorio::cuadro(app, sesion, desde) // CTL1117M
}

#[cfg(target_os = "android")]
fn cuadro(app: &tauri::AppHandle, sesion: &str, desde: u32) -> Vec<u8> {
    use crate::control_neuronas::{puerta_sesion, ModoPuerta};
    use std::sync::atomic::{AtomicU64, Ordering};
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
    // FSG1116 · M2: en pausa local no sale ningún cuadro (lo que la persona teclea para recuperar el control no se ve).
    if crate::control_neuronas::sesion_pausada(sesion) {
        return Vec::new();
    }
    match crate::control_entrada::es::leer_bytes(app, crate::control_entrada::CUADRO) {
        Some(b) => l::cuadro_si_nuevo(&b, desde).map(<[u8]>::to_vec).unwrap_or_default(),
        None => Vec::new(),
    }
}

/// Seam 1: parar la pantalla (siempre se puede; no necesita sesión viva).
#[tauri::command(async)]
pub fn control_pantalla_parar(app: tauri::AppHandle, webview: tauri::Webview, sesion: String) -> Result<Value, String> {
    crate::control_neuronas::pagina_ok(&app, &webview)?;
    if crate::control_neuronas::otras_sesiones_vivas(&sesion) {
        #[cfg(not(any(target_os = "android", target_os = "macos", target_os = "linux")))]
        return Ok(crate::control_entrada::sin_soporte());
        #[cfg(any(target_os = "android", target_os = "macos", target_os = "linux"))]
        return Ok(serde_json::json!({ "ok": true }));
    }
    #[cfg(target_os = "android")]
    {
        parar_interno(&app);
        Ok(json!({ "ok": true }))
    }
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        parar_interno(&app); // CTL1117M
        Ok(serde_json::json!({ "ok": true }))
    }
    #[cfg(not(any(target_os = "android", target_os = "macos", target_os = "linux")))]
    Ok(crate::control_entrada::sin_soporte())
}

/// Para la captura de Kotlin y deja la línea de fin (con los fps medidos). Sin pantalla activa, no hace nada.
pub(crate) fn parar_interno(app: &tauri::AppHandle) {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    return crate::control_pantalla_escritorio::parar_interno(app); // CTL1117M
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    let Some(a) = activa().take() else { return };
    #[cfg(target_os = "android")]
    {
        let frames = crate::control_entrada::es::leer_bytes(app, crate::control_entrada::CUADRO).filter(|b| b.len() >= 4).map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]])).unwrap_or(0);
        let seg = a.desde.elapsed().as_secs_f64().max(0.001);
        let _ = crate::control_entrada::es::enviar(app, json!({ "tipo": "pantalla-parar" }));
        let linea = format!("fin fuente={} ancho={} alto={} fps={:.1}", a.fuente, a.ancho, a.alto, f64::from(frames) / seg);
        crate::ble::nota(None, "control-pantalla", &linea);
        crate::control_neuronas::anotar_k(app, "pantalla-parada", &linea);
    }
    #[cfg(not(any(target_os = "android", target_os = "macos", target_os = "linux")))]
    let _ = (app, a);
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use serde_json::json;

    #[test]
    fn la_fuente_que_se_anota_es_la_que_contesta_kotlin() {
        assert_eq!(fuente_real(&json!({ "ok": true, "fuente": "proyeccion", "ancho": 1280 })), "proyeccion");
        assert_eq!(fuente_real(&json!({ "ok": true, "fuente": "accesibilidad" })), "accesibilidad");
        assert_eq!(fuente_real(&json!({ "ok": true })), "accesibilidad", "un Kotlin anterior no dice fuente");
        assert_eq!(fuente_real(&json!({ "ok": true, "fuente": "<script>" })), "accesibilidad");
    }
}
