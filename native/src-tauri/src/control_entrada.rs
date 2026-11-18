//! (AND1115K) Control entre mis neuronas, fases 2–3 · el lado nativo de la ENTRADA en el aparato controlado y
//! lo común de los comandos de capacidades, ajustes y estado. Contrato: `control-fase23-costuras.md` (seams 1 y 2).
//!
//! · `control_entrada` comprueba en Rust, ANTES de que nada llegue a Kotlin: sobre firmado por un controlador que
//!   LA PERSONA aceptó en el diálogo nativo de esta tableta, `seq`, `t`, `caduca`, sesión abierta y su nivel,
//!   y el límite de 60 por segundo (`control_entrada_logica`, con vectores hechos por el algoritmo de la web).
//! · Aceptar un controlador: `control_entrada_aceptar` solo PIDE el diálogo (que enseña el código del aparato);
//!   la lista `aceptados.json` la escribe SOLO Kotlin con el «Sí» del diálogo y se vacía al apagar el interruptor.
//! · Rust y Kotlin hablan por archivos JSON como en la fase 1: `peticion-<id>.json` (Rust → Kotlin) y
//!   `resultado-<id>.json` (Kotlin → Rust) en `files/starseed/control-entrada`.
//! · En escritorio todo contesta `{ ok:false, motivo:"sin-soporte" }`.
//! · Ningún camino de aquí concede un permiso, enciende el servicio de accesibilidad ni contesta un diálogo del
//!   sistema: lo más que hace es ABRIR la pantalla de Ajustes donde la persona lo hace.

#![allow(dead_code)] // AND1115K: parte de esto solo se usa en Android

use crate::control_entrada_logica as l;
use serde_json::{json, Value};
use std::sync::{Mutex, MutexGuard, OnceLock};

pub const CARPETA: &str = "control-entrada";
pub const PREFIJO_PETICION: &str = "peticion-";
pub const PREFIJO_RESULTADO: &str = "resultado-";
pub const ACEPTADOS: &str = "aceptados.json";
pub const CUADRO: &str = "cuadro.bin";
/// Lo que Rust espera a que Kotlin conteste una orden (el gesto se encola y vuelve al momento).
pub const ESPERA_MS: u64 = 1_500;

pub(crate) fn sin_soporte() -> Value {
    json!({ "ok": false, "motivo": "sin-soporte" })
}

fn vistos() -> MutexGuard<'static, l::Vistos> {
    static V: OnceLock<Mutex<l::Vistos>> = OnceLock::new();
    V.get_or_init(|| Mutex::new(l::Vistos::default())).lock().unwrap_or_else(|e| e.into_inner())
}

fn contadores() -> MutexGuard<'static, Option<l::Contadores>> {
    static C: OnceLock<Mutex<Option<l::Contadores>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(None)).lock().unwrap_or_else(|e| e.into_inner())
}

fn rechazo(m: l::Motivo) -> Value {
    json!({ "ok": false, "motivo": m.codigo() })
}

/// Lo puro del seam 1 `control_capacidades`: lo que Kotlin mide → la forma que la página espera.
pub fn capacidades_json(k: Option<&Value>) -> Value {
    let b = |c: &str| k.and_then(|k| k.get(c)).and_then(|x| x.as_bool()).unwrap_or(false);
    let servicio = b("servicio");
    let mut falta: Vec<&str> = Vec::new();
    if !servicio {
        if b("restringido") {
            falta.push("ajustes-restringidos");
        }
        falta.push("servicio-accesibilidad");
    }
    let sin_preguntar = b("sin_preguntar");
    if !sin_preguntar {
        falta.push("consentimiento-pantalla");
    }
    let escribir = b("escribir_ajustes");
    if !escribir {
        falta.push("escribir-ajustes");
    }
    let max = k.and_then(|k| k.get("max_dedos")).and_then(|x| x.as_u64()).unwrap_or(0).min(l::MAX_DEDOS as u64);
    json!({
        "pantalla": { "accesibilidad": servicio && b("captura") && sin_preguntar, "proyeccion": b("proyeccion"), "sin_preguntar": sin_preguntar },
        "entrada": {
            "gestos": servicio && max > 0,
            "max_dedos": if servicio { max } else { 0 },
            "teclas": if servicio { l::TECLAS.to_vec() } else { Vec::new() },
            "volumen": servicio,
            "brillo": servicio && escribir,
            "texto": servicio,
        },
        "falta": falta,
        // CTL1117K · S2: hasta dónde llega el control en ESTE aparato; quien manda lo enseña. Sin dato de Kotlin, `total` (la regla del dueño).
        "alcance": l::alcance_efectivo(k.and_then(|k| k.get("alcance")).and_then(|x| x.as_str()).unwrap_or("")),
    })
}

/// ¿Qué hace Kotlin con una orden ya verificada? Su respuesta, con el motivo acotado a la lista del seam.
pub fn resultado_de_kotlin(r: Option<&Value>) -> Result<Value, l::Motivo> {
    let Some(r) = r else { return Err(l::Motivo::SinServicio) };
    if r.get("ok").and_then(|x| x.as_bool()) == Some(true) {
        return Ok(json!({ "ok": true }));
    }
    let m = r.get("motivo").and_then(|x| x.as_str()).and_then(l::Motivo::desde_codigo).unwrap_or(l::Motivo::SinServicio);
    Err(m)
}

// ─────────────────────────── Comandos ───────────────────────────

/// Seam 1: una orden de entrada firmada. Rust la comprueba entera y solo entonces la manda a Kotlin.
#[tauri::command(async)]
pub fn control_entrada(app: tauri::AppHandle, webview: tauri::Webview, sesion: String, sobre: Value) -> Result<Value, String> {
    crate::control_neuronas::pagina_ok(&app, &webview)?;
    Ok(entrada(&app, &sesion, &sobre))
}

#[cfg(not(any(target_os = "android", target_os = "macos")))]
fn entrada(_app: &tauri::AppHandle, _sesion: &str, _sobre: &Value) -> Value {
    sin_soporte()
}

// CTL1117M: el Mac como aparato controlado (enigo + comprobación nativa del controlador).
#[cfg(target_os = "macos")]
fn entrada(app: &tauri::AppHandle, sesion: &str, sobre: &Value) -> Value {
    crate::control_entrada_macos::entrada(app, sesion, sobre)
}

#[cfg(target_os = "android")]
fn entrada(app: &tauri::AppHandle, sesion: &str, sobre: &Value) -> Value {
    use crate::control_neuronas::{puerta_sesion, ModoPuerta};
    // 1 · la sesión (solo mirar) y su nivel.
    let Ok(nivel) = puerta_sesion(app, sesion, ModoPuerta::Lectura) else { return rechazo(l::Motivo::Sesion) };
    // 2 · el sobre: controlador aceptado, firma, sesión, reloj, repetición y límite. Nada de esto toca Kotlin.
    let aceptados = es::leer(app, ACEPTADOS).map(|t| l::leer_aceptados(&t)).unwrap_or_default();
    let ahora = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0);
    let v = l::verificar_sobre(sobre, &aceptados, sesion, &nivel, ahora, &mut vistos());
    // FSG1116 · B1: la orden la firma el MISMO controlador que abrió la sesión.
    let v = v.and_then(|o| if crate::control_neuronas::de_de_sesion(sesion).as_deref() == Some(o.de.as_str()) { Ok(o) } else { Err((l::Motivo::NoAutorizado, "otro-controlador")) });
    let orden = match v {
        Ok(o) => o,
        Err((m, detalle)) => {
            anotar_resultado(app, sesion, Err(m), detalle);
            return rechazo(m);
        }
    };
    // 3 · la sesión como orden (renueva la inactividad y respeta la pausa local).
    if let Err(m) = puerta_sesion(app, sesion, ModoPuerta::Orden) {
        let m = if m == "pausa-local" { l::Motivo::PausaLocal } else { l::Motivo::Sesion };
        anotar_resultado(app, sesion, Err(m), "puerta");
        return rechazo(m);
    }
    // 4 · Kotlin: regla G, pausa de 3 s, y ejecutar.
    let r = es::llamar(app, json!({ "tipo": "entrada", "orden": { "nombre": orden.nombre, "args": orden.args } }), ESPERA_MS);
    match resultado_de_kotlin(r.as_ref()) {
        Ok(v) => {
            anotar_resultado(app, sesion, Ok(()), "");
            // CTL1117A: la tecla Inicio que pasó desde una ventana protegida deja su traza propia (regla G, excepción aprobada).
            if l::fue_inicio_desde_protegida(r.as_ref()) {
                crate::control_neuronas::anotar_k(app, "entrada-inicio-protegida", "tecla=inicio paso-regla-g=excepcion-aprobada");
                let t = l::traza_de_inicio_pasa(r.as_ref()).map(|t| format!(" {t}")).unwrap_or_default();
                crate::ble::nota(None, "control-entrada", &format!("tecla inicio desde-ventana-protegida (excepcion de la regla G){t}"));
            }
            v
        }
        Err(m) => {
            anotar_resultado(app, sesion, Err(m), "kotlin");
            // CTL1117C · FALLO 2: un Inicio negado por la regla G dice POR QUÉ (clases de ventana, nunca nombres ajenos) en el registro de enlaces.
            if let Some(t) = l::traza_de_inicio_negado(r.as_ref()) {
                crate::ble::nota(None, "control-entrada", &format!("tecla inicio negada-por-regla-g {t}"));
            }
            let mut o = json!({ "ok": false, "motivo": m.codigo() });
            for c in ["falta", "detalle"] {
                if let Some(x) = r.as_ref().and_then(|r| r.get(c)) {
                    o[c] = x.clone();
                }
            }
            o
        }
    }
}

#[cfg(target_os = "android")]
fn anotar_resultado(app: &tauri::AppHandle, sesion: &str, r: Result<(), l::Motivo>, _detalle: &str) {
    let mut c = contadores();
    if c.as_ref().is_none_or(|c| !sesion.starts_with(&c.sesion)) {
        // Primera orden de esta sesión: una línea de inicio.
        crate::ble::nota(None, "control-entrada", &format!("inicio sesion={}", sesion.chars().take(8).collect::<String>()));
        *c = Some(l::Contadores::nueva(sesion));
    }
    if let Some(c) = c.as_mut() {
        c.anotar(r);
    }
    let _ = app;
}

/// Al cerrarse la sesión (cualquier motivo): una línea de resumen, se olvida lo visto y se para la pantalla.
pub(crate) fn al_cerrar(app: &tauri::AppHandle) {
    let resumen = contadores().take();
    if let Some(c) = resumen {
        crate::ble::nota(None, "control-entrada", &c.linea());
        crate::control_neuronas::anotar_k(app, "entrada-resumen", &c.linea());
    }
    vistos().olvidar();
    crate::control_pantalla::parar_interno(app);
}

/// Seam 1: qué puede esta tableta ahora mismo y qué falta para lo demás.
#[tauri::command(async)]
pub fn control_capacidades(app: tauri::AppHandle, webview: tauri::Webview) -> Result<Value, String> {
    crate::control_neuronas::pagina_ok(&app, &webview)?;
    #[cfg(target_os = "android")]
    {
        let k = es::llamar(&app, json!({ "tipo": "capacidades" }), ESPERA_MS);
        Ok(capacidades_json(k.as_ref()))
    }
    #[cfg(target_os = "macos")]
    return Ok(crate::control_entrada_macos::capacidades(&app)); // CTL1117M
    #[cfg(not(any(target_os = "android", target_os = "macos")))]
    Ok(sin_soporte())
}

/// Seam 1: abre la pantalla de Ajustes donde la persona arregla una de las cosas que faltan. No concede nada.
#[tauri::command(async)]
pub fn control_abrir_ajuste(app: tauri::AppHandle, webview: tauri::Webview, cual: String) -> Result<Value, String> {
    crate::control_neuronas::pagina_ok(&app, &webview)?;
    #[cfg(target_os = "macos")]
    return Ok(crate::control_entrada_macos::abrir_ajuste(&cual)); // CTL1117M: los permisos del Mac tienen sus propios nombres
    #[cfg(not(target_os = "macos"))]
    {
        if !l::AJUSTES.contains(&cual.as_str()) {
            return Ok(json!({ "ok": false, "motivo": "ajuste-desconocido" }));
        }
    }
    #[cfg(target_os = "android")]
    {
        let r = es::llamar(&app, json!({ "tipo": "abrir-ajuste", "cual": cual }), ESPERA_MS);
        Ok(r.unwrap_or_else(|| json!({ "ok": false, "motivo": "sin-servicio" })))
    }
    #[cfg(not(target_os = "android"))]
    Ok(sin_soporte())
}

/// Seam 1: volumen, brillo, batería, red y pantalla de la tableta.
#[tauri::command(async)]
pub fn control_estado_aparato(app: tauri::AppHandle, webview: tauri::Webview) -> Result<Value, String> {
    crate::control_neuronas::pagina_ok(&app, &webview)?;
    #[cfg(target_os = "android")]
    {
        let r = es::llamar(&app, json!({ "tipo": "estado-aparato" }), ESPERA_MS);
        Ok(match r {
            Some(v) if v.get("volumen").is_some() => v,
            _ => json!({ "ok": false, "motivo": "sin-servicio" }),
        })
    }
    #[cfg(target_os = "macos")]
    return Ok(crate::control_entrada_macos::estado_aparato()); // CTL1117M
    #[cfg(not(any(target_os = "android", target_os = "macos")))]
    Ok(sin_soporte())
}

/// (extra del seam, para el panel) La página PIDE el diálogo nativo que enseña el código del controlador. No
/// acepta nada: lo acepta la persona con el «Sí» de Kotlin. `spki` es la clave pública (base64url) del Mac.
#[tauri::command(async)]
pub fn control_entrada_aceptar(app: tauri::AppHandle, webview: tauri::Webview, spki: String, cuenta: String, nombre: String) -> Result<Value, String> {
    crate::control_neuronas::pagina_ok(&app, &webview)?;
    let Some(huella) = l::huella_de_spki(&spki) else { return Ok(json!({ "ok": false, "motivo": "clave-invalida" })) };
    let codigo = l::codigo_de(&huella, &cuenta);
    #[cfg(target_os = "android")]
    {
        let nombre: String = nombre.chars().filter(|c| !c.is_control()).take(40).collect();
        let r = es::llamar(&app, json!({ "tipo": "aceptar-controlador", "spki": spki, "cuenta": cuenta.chars().take(100).collect::<String>(), "nombre": nombre, "codigo": codigo, "huella": huella }), ESPERA_MS);
        Ok(match r {
            Some(v) if v.get("ok").and_then(|x| x.as_bool()) == Some(true) => json!({ "ok": true, "pendiente": true, "codigo": codigo }),
            Some(v) => json!({ "ok": false, "motivo": v.get("motivo").cloned().unwrap_or(json!("sin-servicio")) }),
            None => json!({ "ok": false, "motivo": "sin-servicio" }),
        })
    }
    #[cfg(target_os = "macos")]
    return Ok(crate::control_aceptados_macos::pedir_aceptar(&app, &spki, &cuenta, &nombre, &huella, &codigo)); // CTL1117M: solo PIDE el diálogo nativo
    #[cfg(not(any(target_os = "android", target_os = "macos")))]
    {
        let _ = (nombre, codigo);
        Ok(sin_soporte())
    }
}

/// (extra) Los controladores que la persona aceptó aquí: solo código y nombre, nunca la clave.
#[tauri::command(async)]
pub fn control_entrada_aceptados(app: tauri::AppHandle, webview: tauri::Webview) -> Result<Value, String> {
    crate::control_neuronas::pagina_ok(&app, &webview)?;
    #[cfg(target_os = "android")]
    {
        let lista: Vec<Value> = es::leer(&app, ACEPTADOS)
            .map(|t| l::leer_aceptados(&t))
            .unwrap_or_default()
            .iter()
            .map(|a| json!({ "huella": a.huella.chars().take(8).collect::<String>(), "nombre": a.nombre, "codigo": l::codigo_de(&a.huella, &a.cuenta) }))
            .collect();
        Ok(json!({ "ok": true, "controladores": lista }))
    }
    #[cfg(target_os = "macos")]
    return Ok(crate::control_aceptados_macos::listar(&app)); // CTL1117M
    #[cfg(not(any(target_os = "android", target_os = "macos")))]
    Ok(sin_soporte())
}

/// (PENB2) Una huella que se puede mandar a Kotlin para quitar: no vacía, ≤128, sin espacios ni caracteres de control.
pub fn huella_aceptable(h: &str) -> bool {
    !h.is_empty() && h.chars().count() <= 128 && !h.chars().any(|c| c.is_whitespace() || c.is_control())
}

/// (PENB2) Lo que contesta Kotlin a «quitar-controlador» → la forma del comando. Sin respuesta: `sin-servicio`.
pub fn quitar_de_kotlin(r: Option<&Value>) -> Value {
    match r {
        Some(v) if v.get("ok").and_then(|x| x.as_bool()) == Some(true) => {
            json!({ "ok": true, "quitados": v.get("quitados").and_then(|x| x.as_u64()).unwrap_or(0) })
        }
        Some(v) => {
            let m = v.get("motivo").and_then(|x| x.as_str()).filter(|m| !m.is_empty() && m.len() <= 40 && m.chars().all(|c| c.is_ascii_lowercase() || c == '-'));
            json!({ "ok": false, "motivo": m.unwrap_or("sin-servicio") })
        }
        None => json!({ "ok": false, "motivo": "sin-servicio" }),
    }
}

/// (PENB2) Quita un controlador de la lista aceptada. Rust NO toca `aceptados.json`: se lo pide a Kotlin, que es quien
/// la escribe. `huella` es la completa (la lista que enseña `control_entrada_aceptados` solo da el comienzo).
#[tauri::command(async)]
pub fn control_entrada_quitar(app: tauri::AppHandle, webview: tauri::Webview, huella: String) -> Result<Value, String> {
    crate::control_neuronas::pagina_ok(&app, &webview)?;
    if !huella_aceptable(&huella) {
        return Ok(json!({ "ok": false, "motivo": "huella-invalida" }));
    }
    #[cfg(target_os = "android")]
    {
        let r = es::llamar(&app, json!({ "tipo": "quitar-controlador", "huella": huella }), ESPERA_MS);
        Ok(quitar_de_kotlin(r.as_ref()))
    }
    #[cfg(target_os = "macos")]
    return Ok(crate::control_aceptados_macos::quitar(&app, &huella)); // CTL1117M
    #[cfg(not(any(target_os = "android", target_os = "macos")))]
    Ok(sin_soporte())
}

// ─────────────────────────── E/S con Kotlin (solo Android) ───────────────────────────

#[cfg(target_os = "android")]
pub(crate) mod es {
    use super::*;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};
    use tauri::{AppHandle, Manager};

    static SECUENCIA: AtomicU64 = AtomicU64::new(0);

    /// La carpeta que comparte con ControlEntradaStarSeed.kt (`files/starseed/control-entrada`).
    pub fn dir(app: &AppHandle) -> Option<PathBuf> {
        let candidatas: Vec<PathBuf> = crate::android::dir_datos()
            .map(|d| d.join(CARPETA))
            .into_iter()
            .chain(app.path().app_data_dir().ok().map(|d| d.join("files").join("starseed").join(CARPETA)))
            .collect();
        candidatas.iter().find(|d| d.is_dir()).cloned().or_else(|| candidatas.into_iter().next())
    }

    pub fn leer(app: &AppHandle, nombre: &str) -> Option<String> {
        dir(app).and_then(|d| std::fs::read_to_string(d.join(nombre)).ok())
    }

    pub fn leer_bytes(app: &AppHandle, nombre: &str) -> Option<Vec<u8>> {
        dir(app).and_then(|d| std::fs::read(d.join(nombre)).ok())
    }

    fn id_nuevo() -> u64 {
        let base = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|x| x.as_millis() as u64).unwrap_or(0) * 1000;
        SECUENCIA.fetch_update(Ordering::SeqCst, Ordering::SeqCst, |a| Some(a.max(base) + 1)).unwrap_or(base) + 1
    }

    /// Deja la petición sin esperar respuesta. Devuelve su id.
    pub fn enviar(app: &AppHandle, mut p: Value) -> Option<u64> {
        let d = dir(app)?;
        let _ = std::fs::create_dir_all(&d);
        let id = id_nuevo();
        p["id"] = json!(id);
        let tmp = d.join(format!(".{PREFIJO_PETICION}{id}.tmp"));
        let fin = d.join(format!("{PREFIJO_PETICION}{id}.json"));
        (std::fs::write(&tmp, p.to_string()).is_ok() && std::fs::rename(&tmp, &fin).is_ok()).then_some(id)
    }

    /// Deja la petición y espera el resultado de Kotlin hasta `espera_ms`. Si no llega, retira la petición.
    pub fn llamar(app: &AppHandle, p: Value, espera_ms: u64) -> Option<Value> {
        let id = enviar(app, p)?;
        let d = dir(app)?;
        let res = d.join(format!("{PREFIJO_RESULTADO}{id}.json"));
        let t0 = std::time::Instant::now();
        loop {
            if let Ok(t) = std::fs::read_to_string(&res) {
                let _ = std::fs::remove_file(&res);
                return serde_json::from_str(&t).ok();
            }
            if t0.elapsed().as_millis() as u64 >= espera_ms {
                let _ = std::fs::remove_file(d.join(format!("{PREFIJO_PETICION}{id}.json")));
                return None;
            }
            std::thread::sleep(std::time::Duration::from_millis(4));
        }
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn sin_servicio_de_accesibilidad_la_tableta_no_promete_nada_y_dice_que_falta() {
        let c = capacidades_json(None);
        assert_eq!(c["entrada"]["gestos"], false);
        assert_eq!(c["entrada"]["teclas"].as_array().unwrap().len(), 0);
        assert_eq!(c["pantalla"]["proyeccion"], false);
        let f: Vec<&str> = c["falta"].as_array().unwrap().iter().map(|x| x.as_str().unwrap()).collect();
        assert_eq!(f, ["servicio-accesibilidad", "consentimiento-pantalla", "escribir-ajustes"]);
    }

    #[test]
    fn con_ajustes_restringidos_se_dice_primero_y_con_todo_en_orden_no_falta_nada() {
        let k = json!({ "servicio": false, "restringido": true, "sin_preguntar": true, "escribir_ajustes": true });
        assert_eq!(capacidades_json(Some(&k))["falta"], json!(["ajustes-restringidos", "servicio-accesibilidad"]));
        let k = json!({ "servicio": true, "captura": true, "max_dedos": 10, "sin_preguntar": true, "escribir_ajustes": true });
        let c = capacidades_json(Some(&k));
        assert_eq!(c["falta"], json!([]));
        assert_eq!(c["entrada"]["max_dedos"], 10);
        assert_eq!(c["entrada"]["teclas"].as_array().unwrap().len(), 11);
        assert_eq!((c["pantalla"]["accesibilidad"].clone(), c["entrada"]["brillo"].clone()), (json!(true), json!(true)));
        // Sin «modificar ajustes del sistema» el brillo no se promete y `falta` lo dice.
        let k = json!({ "servicio": true, "captura": true, "max_dedos": 10, "sin_preguntar": false, "escribir_ajustes": false });
        let c = capacidades_json(Some(&k));
        assert_eq!(c["entrada"]["brillo"], false);
        assert_eq!(c["pantalla"]["accesibilidad"], false, "sin el interruptor de la persona no hay pantalla");
        assert_eq!(c["falta"], json!(["consentimiento-pantalla", "escribir-ajustes"]));
    }

    #[test]
    fn ctl1117k_la_tableta_dice_su_alcance_y_sin_dato_o_con_un_valor_raro_es_total() {
        assert_eq!(capacidades_json(None)["alcance"], "total");
        for (k, esperado) in [(json!({}), "total"), (json!({ "alcance": "total" }), "total"), (json!({ "alcance": "protegido" }), "protegido"), (json!({ "alcance": "x" }), "total"), (json!({ "alcance": 7 }), "total")] {
            assert_eq!(capacidades_json(Some(&k))["alcance"], esperado, "{k}");
        }
    }

    #[test]
    fn quitar_pide_una_huella_razonable_y_traduce_lo_que_contesta_kotlin() {
        assert!(huella_aceptable("abcdef0123456789"));
        assert!(huella_aceptable(&"a".repeat(128)));
        assert!(!huella_aceptable(""));
        assert!(!huella_aceptable("ab cd"));
        assert!(!huella_aceptable("ab\ncd"));
        assert!(!huella_aceptable(&"a".repeat(129)));
        assert_eq!(quitar_de_kotlin(Some(&json!({ "ok": true, "quitados": 1 }))), json!({ "ok": true, "quitados": 1 }));
        assert_eq!(quitar_de_kotlin(Some(&json!({ "ok": true }))), json!({ "ok": true, "quitados": 0 }));
        assert_eq!(quitar_de_kotlin(Some(&json!({ "ok": false, "motivo": "interruptor-apagado" }))), json!({ "ok": false, "motivo": "interruptor-apagado" }));
        assert_eq!(quitar_de_kotlin(Some(&json!({ "ok": false, "motivo": "<script>" }))), json!({ "ok": false, "motivo": "sin-servicio" }));
        assert_eq!(quitar_de_kotlin(None), json!({ "ok": false, "motivo": "sin-servicio" }));
    }

    #[test]
    fn lo_que_contesta_kotlin_se_acota_a_los_motivos_del_seam() {
        assert_eq!(resultado_de_kotlin(Some(&json!({ "ok": true }))).unwrap(), json!({ "ok": true }));
        assert_eq!(resultado_de_kotlin(None).unwrap_err(), l::Motivo::SinServicio);
        assert_eq!(resultado_de_kotlin(Some(&json!({ "ok": false, "motivo": "regla-g" }))).unwrap_err(), l::Motivo::ReglaG);
        assert_eq!(resultado_de_kotlin(Some(&json!({ "ok": false, "motivo": "pausa-local" }))).unwrap_err(), l::Motivo::PausaLocal);
        assert_eq!(resultado_de_kotlin(Some(&json!({ "ok": false, "motivo": "<script>" }))).unwrap_err(), l::Motivo::SinServicio);
        assert_eq!(resultado_de_kotlin(Some(&json!({ "ok": "true" }))).unwrap_err(), l::Motivo::SinServicio);
    }
}
