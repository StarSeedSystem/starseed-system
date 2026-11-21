//! (PENA1) Latido del banco de llamadas: macOS frena el temporizador de la página con la ventana en otro escritorio; con la
//! serie armada, un hilo emite `banco-llamadas-latido` cada 20 s (solo `{ "t": ms }`, sin tocar `~/.starseed`) y se para al
//! apagar o, solo, a las 9 h (la serie dura 8 como máximo). Solo el lanzamiento del hilo es de macOS.
#![cfg_attr(not(target_os = "macos"), allow(dead_code))]
use serde_json::Value;
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

/// Cuerpo del hilo (reloj, espera y emisión inyectables).
fn bucle(parar: &AtomicBool, reloj: impl Fn() -> u64, dormir: impl Fn(), mut emitir: impl FnMut()) {
    let (inicio, mut ultimo) = (reloj(), reloj());
    while !parar.load(Ordering::Acquire) {
        dormir();
        let ahora = reloj();
        if parar.load(Ordering::Acquire) || ahora.saturating_sub(inicio) >= VIDA_MAX_MS {
            break;
        }
        if toca_latido(ultimo, ahora, PERIODO_MS) {
            emitir();
            ultimo = ahora;
        } else if ahora < ultimo {
            ultimo = ahora; // el reloj retrocedió: se vuelve a contar desde aquí
        }
    }
    parar.store(true, Ordering::Release); // un hilo que acabó solo deja de contar como activo
}

/// Un solo hilo a la vez (guarda la bandera del vivo); `activar` devuelve si lanzó.
#[derive(Default)]
struct Control(Mutex<Option<Arc<AtomicBool>>>);

impl Control {
    fn activar(&self, lanzar: impl FnOnce(Arc<AtomicBool>) -> Result<(), String>) -> Result<bool, String> {
        let mut g = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if g.as_ref().is_some_and(|f| !f.load(Ordering::Acquire)) {
            return Ok(false);
        }
        let bandera = Arc::new(AtomicBool::new(false));
        lanzar(bandera.clone())?;
        Ok({ *g = Some(bandera); true })
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
        use {serde_json::json, std::time::{Duration, Instant, SystemTime, UNIX_EPOCH}, tauri::Emitter};
        static CONTROL: std::sync::OnceLock<Control> = std::sync::OnceLock::new();
        let c = CONTROL.get_or_init(Control::default);
        if !activo {
            return Ok(json!({ "ok": true, "activo": false, "estaba": c.desactivar() }));
        }
        let nuevo = c.activar(|parar| {
            let t0 = Instant::now();
            let pared = || SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0);
            let hilo = move || bucle(&parar, || t0.elapsed().as_millis() as u64, || std::thread::sleep(Duration::from_millis(PASO_MS)), || { let _ = app.emit(EVENTO, json!({ "t": pared() })); });
            std::thread::Builder::new().name("banco-latido".into()).spawn(hilo).map(|_| ()).map_err(|e| e.to_string())
        })?;
        Ok(json!({ "ok": true, "activo": true, "nuevo": nuevo }))
    }
    #[cfg(not(target_os = "macos"))]
    Ok({ let _ = activo; crate::control_entrada::sin_soporte() })
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use std::cell::Cell;
    #[test]
    fn toca_en_los_bordes() {
        assert!(toca_latido(1_000, 21_000, PERIODO_MS), "justo en el periodo");
        assert!(!toca_latido(1_000, 20_999, PERIODO_MS), "un ms antes");
        assert!(!toca_latido(50_000, 40_000, PERIODO_MS), "reloj que retrocede");
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
    fn el_bucle_emite_cada_periodo_y_para_al_apagar() {
        let (parar, ahora, n) = (AtomicBool::new(false), Cell::new(0u64), Cell::new(0u32));
        bucle(&parar, || ahora.get(), || ahora.set(ahora.get() + 10_000), || { n.set(n.get() + 1); if n.get() == 3 { parar.store(true, Ordering::Release) } });
        assert_eq!((n.get(), ahora.get()), (3, 60_000), "uno cada 20 s");
        let (parar, n) = (AtomicBool::new(false), Cell::new(0u32));
        bucle(&parar, || 0, || parar.store(true, Ordering::Release), || n.set(n.get() + 1));
        assert_eq!(n.get(), 0, "apagado durante la espera: ni un latido");
    }
    #[test]
    fn el_bucle_acaba_solo_a_las_9_h_y_se_recupera_de_un_reloj_que_retrocede() {
        let (parar, ahora, n) = (AtomicBool::new(false), Cell::new(0u64), Cell::new(0u32));
        bucle(&parar, || ahora.get(), || ahora.set(ahora.get() + 3_600_000), || n.set(n.get() + 1));
        assert!(parar.load(Ordering::Acquire), "ya no cuenta como activo");
        assert_eq!(n.get(), 8, "ni uno más allá de 9 h");
        let (parar, ahora, paso, n) = (AtomicBool::new(false), Cell::new(500_000u64), Cell::new(0u32), Cell::new(0u32));
        let dormir = || { paso.set(paso.get() + 1); ahora.set(match paso.get() { 1 => 100_000, 2 => 125_000, _ => { parar.store(true, Ordering::Release); 0 } }) };
        bucle(&parar, || ahora.get(), dormir, || n.set(n.get() + 1));
        assert_eq!(n.get(), 1, "tras retroceder cuenta desde el reloj nuevo");
    }
}
