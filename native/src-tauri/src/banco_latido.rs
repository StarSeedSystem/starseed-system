//! (PENA1) Latido del modo de pruebas de llamadas: macOS frena los temporizadores de la página con la ventana en otro
//! escritorio. La serie armada pide `banco_latido_activar(true)` y un hilo emite `banco-llamadas-latido` cada 20 s con
//! `{ "t": ms }` (reloj de pared); no toca `~/.starseed`, no mantiene despierta la Mac, se para al apagar y solo macOS lanza el hilo.
#![cfg_attr(not(target_os = "macos"), allow(dead_code))]

use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

pub const PERIODO_MS: u64 = 20_000;
pub const EVENTO: &str = "banco-llamadas-latido";
const VIDA_MAX_MS: u64 = 9 * 3_600_000;
const PASO_MS: u64 = 500;

/// ¿Toca emitir? (reloj que retrocede = no)
pub fn toca_latido(ultimo_ms: u64, ahora_ms: u64, periodo_ms: u64) -> bool {
    ahora_ms >= ultimo_ms && ahora_ms - ultimo_ms >= periodo_ms
}

/// La respuesta de los sistemas sin latido, aquí mismo y por escrito (no prestada de otro módulo).
fn sin_soporte() -> Value {
    json!({ "ok": false, "motivo": "sin-soporte" })
}

#[cfg(target_os = "macos")]
fn ahora_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Cuerpo del hilo: reloj, espera y emisión inyectables. `emitir` recibe el mismo `ahora_ms` que decide el periodo.
fn bucle(parar: &AtomicBool, reloj: impl Fn() -> u64, dormir: impl Fn(), mut emitir: impl FnMut(u64)) {
    let (inicio, mut ultimo) = (reloj(), reloj());
    while !parar.load(Ordering::Acquire) {
        dormir();
        let ahora = reloj();
        if parar.load(Ordering::Acquire) || ahora.saturating_sub(inicio) >= VIDA_MAX_MS { break; }
        if ahora < ultimo { ultimo = ahora; } // reloj que retrocede: se vuelve a contar desde aquí
        else if toca_latido(ultimo, ahora, PERIODO_MS) { emitir(ahora); ultimo = ahora; }
    }
    parar.store(true, Ordering::Release); // el hilo que acabó deja de contar como activo
}

/// Un solo hilo a la vez: la bandera la enciende quien apaga y también el hilo al terminar.
#[derive(Default)]
struct Control(Mutex<Option<Arc<AtomicBool>>>);

impl Control {
    fn activar(&self, lanzar: impl FnOnce(Arc<AtomicBool>) -> Result<(), String>) -> Result<bool, String> {
        let mut g = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if g.as_ref().is_some_and(|f| !f.load(Ordering::Acquire)) { return Ok(false); }
        let bandera = Arc::new(AtomicBool::new(false));
        lanzar(bandera.clone())?;
        *g = Some(bandera);
        Ok(true)
    }
    fn desactivar(&self) -> bool {
        let g = self.0.lock().unwrap_or_else(|e| e.into_inner());
        g.as_ref().is_some_and(|f| !f.swap(true, Ordering::AcqRel))
    }
}

#[tauri::command]
pub fn banco_latido_activar(app: tauri::AppHandle, webview: tauri::Webview, activo: bool) -> Result<Value, String> {
    crate::control_neuronas::pagina_ok(&app, &webview)?;
    #[cfg(target_os = "macos")]
    {
        use std::time::Duration;
        use tauri::Emitter;
        static CONTROL: std::sync::OnceLock<Control> = std::sync::OnceLock::new();
        let c = CONTROL.get_or_init(Control::default);
        if !activo { return Ok(json!({ "ok": true, "activo": false, "estaba": c.desactivar() })); }
        let nuevo = c.activar(|parar| {
            let hilo = move || bucle(&parar, ahora_ms, || std::thread::sleep(Duration::from_millis(PASO_MS)), |t| {
                let _ = app.emit(EVENTO, json!({ "t": t }));
            });
            std::thread::Builder::new().name("banco-latido".into()).spawn(hilo).map(|_| ()).map_err(|e| e.to_string())
        })?;
        Ok(json!({ "ok": true, "activo": true, "nuevo": nuevo }))
    }
    #[cfg(not(target_os = "macos"))]
    { let _ = activo; Ok(sin_soporte()) }
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use std::cell::Cell;
    #[test]
    fn toca_en_los_bordes_y_sin_soporte() {
        assert!(toca_latido(1_000, 21_000, PERIODO_MS), "justo en el periodo");
        assert!(!toca_latido(1_000, 20_999, PERIODO_MS), "un ms antes");
        assert!(!toca_latido(50_000, 40_000, PERIODO_MS), "reloj que retrocede");
        assert_eq!(sin_soporte(), json!({ "ok": false, "motivo": "sin-soporte" }));
    }
    #[test]
    fn activar_dos_veces_no_crea_dos_hilos_y_desactivar_para() {
        let (c, n) = (Control::default(), Cell::new(0));
        let falso = |_b: Arc<AtomicBool>| { n.set(n.get() + 1); Ok(()) };
        assert_eq!((c.activar(falso), c.activar(falso)), (Ok(true), Ok(false)));
        assert_eq!(n.get(), 1);
        assert!(c.desactivar() && !c.desactivar());
        assert_eq!(c.activar(falso), Ok(true), "tras apagar se puede encender");
        assert!(Control::default().activar(|_| Err("sin hilos".into())).is_err());
    }
    #[test]
    fn bucle_emite_cada_periodo_y_para_al_apagar() {
        let (parar, ahora, n) = (AtomicBool::new(false), Cell::new(0u64), Cell::new(0u32));
        bucle(&parar, || ahora.get(), || ahora.set(ahora.get() + 10_000), |t| {
            n.set(n.get() + 1); assert_eq!(t, ahora.get()); if n.get() == 3 { parar.store(true, Ordering::Release) }
        });
        assert_eq!((n.get(), ahora.get()), (3, 60_000), "uno cada 20 s");
        let (parar, ahora, n) = (AtomicBool::new(false), Cell::new(0u64), Cell::new(0u32));
        bucle(&parar, || ahora.get(), || ahora.set(ahora.get() + 3_600_000), |_| n.set(n.get() + 1));
        assert!(parar.load(Ordering::Acquire) && n.get() == 8, "ni uno más allá de 9 h");
        let (parar, ahora, paso, n) = (AtomicBool::new(false), Cell::new(500_000u64), Cell::new(0u32), Cell::new(0u32));
        let dormir = || { paso.set(paso.get() + 1); ahora.set(match paso.get() { 1 => 100_000, 2 => 125_000, _ => { parar.store(true, Ordering::Release); 0 } }) };
        bucle(&parar, || ahora.get(), dormir, |_| n.set(n.get() + 1));
        assert_eq!(n.get(), 1, "tras retroceder cuenta desde el reloj nuevo");
    }
}
