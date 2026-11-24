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

use crate::control_calidad_logica as q;
use crate::control_captura::{capturar_cuadro, reiniciar_via, via_actual, via_fluida};
use crate::control_entrada_logica as l;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
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

static ULTIMO_NUMERO: AtomicU32 = AtomicU32::new(0);
static ULTIMA_ENTREGA_MS: AtomicU64 = AtomicU64::new(0);
static RETARDO_RECEPTOR_MS: AtomicU64 = AtomicU64::new(0);
static PERIODO_CAPTURA_MS: AtomicU64 = AtomicU64::new(q::PERIODO_OBJETIVO_MS);
static ENTREGAS_CONTADOR: AtomicU64 = AtomicU64::new(0);

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

fn anotar_entrega(desde: u32, periodo_ms: u64) {
    let ahora = crate::control_neuronas::mono_k();
    let antes = ULTIMA_ENTREGA_MS.swap(ahora, Ordering::Relaxed);
    let hubo_previa = antes != 0;
    let intervalo_ms = ahora.saturating_sub(antes);
    let atraso = ULTIMO_NUMERO.load(Ordering::Relaxed).saturating_sub(desde).saturating_sub(1);
    RETARDO_RECEPTOR_MS.store(q::retardo_para_ritmo(hubo_previa, intervalo_ms, atraso, periodo_ms), Ordering::Relaxed);
    ENTREGAS_CONTADOR.fetch_add(1, Ordering::Relaxed);
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
    if let Some(a) = activa().as_ref() {
        return json!({ "ok": true, "fuente": "proyeccion", "ancho": a.ancho, "alto": a.alto, "giro": 0 });
    }
    let lado = lado.clamp(l::LADO_MIN, l::LADO_MAX);
    let calidad = l::calidad_jpeg(calidad);
    parar_interno(app); // una captura compartida a la vez
    reiniciar_via();
    // El primer cuadro se hace aquí para decir el tamaño real y para fallar con verdad si el sistema no deja capturar.
    let Some(primero) = capturar_cuadro(lado, calidad, 1, None) else {
        let (motivo, falta) = plataforma_captura_fallida();
        nota_sin_pantalla(motivo, falta);
        return json!({ "ok": false, "motivo": motivo, "falta": [falta] });
    };
    let (ancho, alto) = (primero.ancho, primero.alto);
    let huella_inicial = primero.huella;
    *buffer() = primero.jpeg;
    ULTIMO_NUMERO.store(1, Ordering::SeqCst);
    ULTIMA_ENTREGA_MS.store(0, Ordering::Relaxed);
    RETARDO_RECEPTOR_MS.store(0, Ordering::Relaxed);
    PERIODO_CAPTURA_MS.store(q::PERIODO_OBJETIVO_MS, Ordering::Relaxed);
    ENTREGAS_CONTADOR.store(0, Ordering::Relaxed);
    let parar = Arc::new(AtomicBool::new(false));
    let cuadros = Arc::new(AtomicU32::new(1));
    {
        let (parar, cuadros, app2) = (parar.clone(), cuadros.clone(), app.clone());
        std::thread::Builder::new()
            .name("control-pantalla-mac".into())
            .spawn(move || {
                let mut ritmo = q::Ritmo::nuevo(lado, calidad);
                let mut huella_previa = huella_inicial;
                let mut entregas_vistas = 0u64;
                while !parar.load(Ordering::SeqCst) {
                    if !crate::control_neuronas::sesion_viva() {
                        break;
                    }
                    let t0 = std::time::Instant::now();
                    let en_pausa = crate::control_neuronas::alguna_pausada();
                    if en_pausa || plataforma_bloqueada() {
                        if en_pausa {
                            buffer().clear(); // en pausa local no sale ningún cuadro (lo que la persona teclea no se ve)
                        }
                        let _ = &app2;
                        std::thread::sleep(std::time::Duration::from_millis(q::PERIODO_OBJETIVO_MS));
                        continue;
                    }
                    let nivel = ritmo.nivel();
                    let n = cuadros.load(Ordering::SeqCst) + 1;
                    match capturar_cuadro(nivel.lado, nivel.calidad, n, huella_previa) {
                        Some(c) => {
                            if !c.igual {
                                *buffer() = c.jpeg;
                                cuadros.store(n, Ordering::SeqCst);
                                ULTIMO_NUMERO.store(n, Ordering::SeqCst);
                                huella_previa = c.huella;
                            }
                        }
                        None => {
                            let _ = &app2;
                            std::thread::sleep(std::time::Duration::from_millis(q::PERIODO_MAX_MS));
                            continue;
                        }
                    }
                    let trabajo = t0.elapsed().as_millis() as u64;
                    let entregas_ahora = ENTREGAS_CONTADOR.load(Ordering::Relaxed);
                    // Solo consume el retardo cuando hubo una entrega real desde el ciclo anterior.
                    let retardo = if entregas_ahora > entregas_vistas {
                        entregas_vistas = entregas_ahora;
                        RETARDO_RECEPTOR_MS.load(Ordering::Relaxed)
                    } else {
                        0
                    };
                    let cambio = ritmo.muestra(trabajo, retardo);
                    let linea = q::linea_cambio(cambio, trabajo, retardo);
                    if !linea.is_empty() {
                        crate::ble::nota(None, "control-pantalla", &format!("ritmo {linea}"));
                    }
                    let ultima_entrega = ULTIMA_ENTREGA_MS.load(Ordering::Relaxed);
                    let sin_peticion_reciente = ultima_entrega != 0
                        && crate::control_neuronas::mono_k().saturating_sub(ultima_entrega) > 300;
                    let periodo = if sin_peticion_reciente {
                        q::PERIODO_MAX_MS
                    } else {
                        ritmo.periodo_ms(trabajo)
                    };
                    PERIODO_CAPTURA_MS.store(periodo, Ordering::Relaxed);
                    let _ = &app2;
                    std::thread::sleep(std::time::Duration::from_millis(periodo.saturating_sub(trabajo).max(20)));
                }
            })
            .ok();
    }
    *activa() = Some(Activa { ancho, alto, desde: std::time::Instant::now(), parar, cuadros });
    let via = via_actual();
    crate::ble::nota(None, "control-pantalla", &format!("inicio fuente={FUENTE_REGISTRO} via={via} ancho={ancho} alto={alto} fps=-"));
    if let Some(fluida) = via_fluida() {
        crate::ble::nota(None, "control-pantalla", &format!("fluida-lista via={fluida}"));
    }
    crate::control_neuronas::anotar_k(app, "pantalla-iniciada", &format!("fuente={FUENTE_REGISTRO} via={via} ancho={ancho} alto={alto}"));
    // La web solo conoce dos valores de `fuente`; la captura de pantalla completa es la de «proyeccion».
    json!({ "ok": true, "fuente": "proyeccion", "ancho": ancho, "alto": alto, "giro": 0 })
}

/// `control_pantalla_cuadro` en macOS: el cuadro más nuevo que `desde`, o cero bytes.
pub fn cuadro(app: &AppHandle, sesion: &str, desde: u32) -> Vec<u8> {
    use crate::control_neuronas::{puerta_sesion, ModoPuerta};
    static ULTIMA_ACTIVIDAD: AtomicU64 = AtomicU64::new(0);
    if activa().is_none() {
        return Vec::new();
    }
    // Ver la pantalla cuenta como actividad (como mucho una vez cada 10 s): una sesión mirada no caduca a los 45 s (latidos).
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
    let salida = l::cuadro_si_nuevo(&buffer(), desde).map(<[u8]>::to_vec).unwrap_or_default();
    if !salida.is_empty() {
        anotar_entrega(desde, PERIODO_CAPTURA_MS.load(Ordering::Relaxed));
    }
    salida
}

/// Para la captura y deja la línea de fin (con los fps medidos). Sin pantalla activa, no hace nada.
pub fn parar_interno(app: &AppHandle) {
    let Some(a) = activa().take() else { return };
    a.parar.store(true, Ordering::SeqCst);
    buffer().clear();
    let seg = a.desde.elapsed().as_secs_f64().max(0.001);
    let linea = format!(
        "fin fuente={FUENTE_REGISTRO} ancho={} alto={} fps={:.1} via={} retardo_ms={}",
        a.ancho,
        a.alto,
        f64::from(a.cuadros.load(Ordering::SeqCst)) / seg,
        via_actual(),
        RETARDO_RECEPTOR_MS.load(Ordering::Relaxed)
    );
    crate::ble::nota(None, "control-pantalla", &linea);
    crate::control_neuronas::anotar_k(app, "pantalla-parada", &linea);
}
