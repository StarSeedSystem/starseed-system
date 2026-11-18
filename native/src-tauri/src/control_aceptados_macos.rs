//! (CTL1117M) Control entre mis neuronas · el Mac como aparato CONTROLADO: la lista de controladores aceptados.
//!
//! · El archivo `control-entrada/aceptados.json` (mismo formato que en Android) lo escribe SOLO este módulo, y solo con el
//!   «Sí» del diálogo nativo de este Mac (el mismo `acceso_equipo::dialogo` del interruptor). Ningún comando ni orden
//!   acepta a nadie: `control_entrada_aceptar` solo PIDE el diálogo, que enseña el nombre y el código del controlador y
//!   dice lo que se concede (según `alcance`).
//! · Se vacía al apagar el interruptor de control (`apagar_interruptor`) y al arrancar con el interruptor apagado.
//! · La apertura de sesión se comprueba aquí con `l::verificar_apertura` (firma, reloj, no repetida) contra esa lista.
//!   Un controlador que aún no está en la lista sigue la fase 1 de siempre (sesión sin pantalla ni entrada); uno que está
//!   y falla la firma se rechaza. La pantalla y la entrada exigen la sesión VERIFICADA aquí.

use crate::control_entrada_logica as l;
use crate::control_entrada_macos_logica as m;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, MutexGuard, OnceLock};
use tauri::{AppHandle, Manager};

static PENDIENTE: AtomicBool = AtomicBool::new(false);

fn ruta(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("control-entrada").join("aceptados.json"))
}

pub fn leer(app: &AppHandle) -> Vec<l::Aceptado> {
    ruta(app).and_then(|r| std::fs::read_to_string(r).ok()).map(|t| l::leer_aceptados(&t)).unwrap_or_default()
}

fn escribir(app: &AppHandle, lista: &[l::Aceptado]) -> bool {
    let Some(r) = ruta(app) else { return false };
    if let Some(d) = r.parent() {
        let _ = std::fs::create_dir_all(d);
    }
    let tmp = r.with_extension("json.tmp");
    std::fs::write(&tmp, m::aceptados_a_texto(lista)).is_ok() && std::fs::rename(&tmp, &r).is_ok()
}

/// Vacía la lista (el interruptor se apagó). También olvida la sesión verificada.
pub fn vaciar(app: &AppHandle) {
    if ruta(app).is_some_and(|r| r.exists()) {
        let _ = escribir(app, &[]);
    }
    olvidar_verificada();
}

/// Al arrancar: si el interruptor está apagado, no queda ningún controlador aceptado de una vez anterior.
pub fn al_arrancar(app: &AppHandle) {
    if !crate::control_neuronas::interruptor_encendido(app) {
        vaciar(app);
    }
}

// ─────────────────────────── Pedir el diálogo (nunca aceptar) ───────────────────────────

/// `control_entrada_aceptar`: PIDE el diálogo nativo. Contesta enseguida `{ ok:true, pendiente:true, codigo }`; la lista
/// solo cambia si la persona, en este Mac, dice «Sí». Sin interruptor encendido no se pide nada.
pub fn pedir_aceptar(app: &AppHandle, spki: &str, cuenta: &str, nombre: &str, huella: &str, codigo: &str) -> Value {
    if !crate::control_neuronas::interruptor_encendido(app) {
        return json!({ "ok": false, "motivo": "interruptor-apagado" });
    }
    if PENDIENTE.swap(true, Ordering::SeqCst) {
        return json!({ "ok": false, "motivo": "pendiente" });
    }
    let nuevo = l::Aceptado {
        spki: spki.to_string(),
        huella: huella.to_string(),
        nombre: nombre.chars().filter(|c| !c.is_control()).take(40).collect(),
        cuenta: cuenta.chars().take(100).collect(),
    };
    let texto = m::texto_aceptar(&nuevo.nombre, codigo, crate::control_entrada_macos::alcance(app));
    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        let si = crate::acceso_equipo::dialogo(&app2, "Control entre tus neuronas", texto, "Sí, aceptar", "No").await;
        // Entre el diálogo y el «Sí» el interruptor pudo apagarse: entonces no se acepta nada.
        if si && crate::control_neuronas::interruptor_encendido(&app2) {
            let lista = m::con_aceptado(&leer(&app2), nuevo.clone());
            if escribir(&app2, &lista) {
                crate::control_neuronas::anotar_k(&app2, "controlador-aceptado", &format!("huella={}", nuevo.huella.chars().take(8).collect::<String>()));
            }
        }
        PENDIENTE.store(false, Ordering::SeqCst);
    });
    json!({ "ok": true, "pendiente": true, "codigo": codigo })
}

/// `control_entrada_aceptados`: solo el comienzo de la huella, el nombre y el código; nunca la clave.
pub fn listar(app: &AppHandle) -> Value {
    let lista: Vec<Value> = leer(app)
        .iter()
        .map(|a| json!({ "huella": a.huella.chars().take(8).collect::<String>(), "nombre": a.nombre, "codigo": l::codigo_de(&a.huella, &a.cuenta) }))
        .collect();
    json!({ "ok": true, "controladores": lista })
}

/// `control_entrada_quitar`: quitar a alguien de la lista nunca da poder, y la persona lo hace desde su propio panel.
/// Si el que se quita es el de la sesión verificada, esa sesión deja de tener pantalla y entrada.
pub fn quitar(app: &AppHandle, huella: &str) -> Value {
    let (lista, quitados) = m::sin_aceptado(&leer(app), huella);
    if quitados > 0 && !escribir(app, &lista) {
        return json!({ "ok": false, "motivo": "sin-servicio" });
    }
    if quitados > 0 {
        olvidar_verificada();
    }
    json!({ "ok": true, "quitados": quitados })
}

// ─────────────────────────── Apertura de sesión ───────────────────────────

pub enum Apertura {
    /// Controlador aceptado aquí y firma buena: el `de`, el nombre y el color salen de lo NATIVO.
    Verificada(l::Apertura),
    /// Sin sobre o controlador que este Mac no aceptó: sigue la fase 1 (sin pantalla ni entrada).
    SinVerificar,
    /// Aceptado pero la firma, la hora o la repetición fallan: no se abre.
    Rechazada(&'static str),
}

fn vistas() -> MutexGuard<'static, l::Vistos> {
    static V: OnceLock<Mutex<l::Vistos>> = OnceLock::new();
    V.get_or_init(|| Mutex::new(l::Vistos::default())).lock().unwrap_or_else(|e| e.into_inner())
}

fn verificada() -> MutexGuard<'static, Option<String>> {
    static V: OnceLock<Mutex<Option<String>>> = OnceLock::new();
    V.get_or_init(|| Mutex::new(None)).lock().unwrap_or_else(|e| e.into_inner())
}

pub fn olvidar_verificada() {
    *verificada() = None;
}

/// ¿La sesión de este controlador (`de`, su huella) se abrió con su orden firmada Y sigue aceptado en este Mac?
pub fn sesion_verificada(de: &str) -> bool {
    verificada().as_deref() == Some(de)
}

pub fn apertura(app: &AppHandle, sobre: Option<&Value>, nivel_pagina: &str) -> Apertura {
    olvidar_verificada(); // cada apertura decide de nuevo; una dudosa nunca hereda la anterior
    let Some(sobre) = sobre else { return Apertura::SinVerificar };
    let aceptados = leer(app);
    if aceptados.is_empty() {
        return Apertura::SinVerificar;
    }
    let ahora = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0);
    match l::verificar_apertura(sobre, &aceptados, nivel_pagina, ahora, &mut vistas()) {
        Ok(a) => {
            *verificada() = Some(a.de.clone());
            Apertura::Verificada(a)
        }
        Err((l::Motivo::NoAutorizado, "controlador-no-aceptado")) => Apertura::SinVerificar,
        Err((mo, _)) => Apertura::Rechazada(mo.codigo()),
    }
}

/// Mientras dure la sesión, el controlador sigue en la lista: si la persona lo quitó o apagó el control, no hay pantalla ni entrada.
pub fn sigue_aceptado(app: &AppHandle, de: &str) -> bool {
    sesion_verificada(de) && leer(app).iter().any(|a| a.huella == de)
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn sin_verificar_no_hay_sesion_verificada() {
        olvidar_verificada();
        assert!(!sesion_verificada("abc"));
        *verificada() = Some("abc".into());
        assert!(sesion_verificada("abc"));
        assert!(!sesion_verificada("abd"));
        olvidar_verificada();
        assert!(!sesion_verificada("abc"));
    }
}
