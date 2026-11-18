//! (CTL1118L) Control entre mis neuronas · Linux (X11): la pausa por toque FÍSICO local.
//!
//! Mecanismo principal (`xi2`): eventos CRUDOS de XInput2 (`RawKeyPress`, `RawButtonPress`, `RawMotion`) de todos los
//! dispositivos maestros. Cada evento trae el `sourceid` del dispositivo FÍSICO (o virtual) que lo causó; lo que inyectamos
//! nosotros (enigo, por XTEST) sale de «Virtual core XTEST pointer/keyboard» y se reconoce por el NOMBRE de ese dispositivo
//! (`control_escritorio_linux_logica::dispositivo_es_propio`), sin adivinar por tiempos. Cualquier otro dispositivo, y cualquier
//! `sourceid` que no se conozca, es una mano: ante la duda, pausa. No se lee QUÉ se tecleó ni dónde se pulsó: solo que hubo un
//! evento de qué clase y de qué dispositivo.
//!
//! Reserva (`sondeo`): si el servidor no ofrece XInput2 ≥ 2.0, cada 50 ms se mira el puntero (si se apartó de donde lo dejamos
//! y ya se asentó), el estado de los botones y el mapa de teclas, y un cambio sin que acabáramos de inyectar es una mano. Es
//! menos fino (una tecla muy breve entre dos sondeos se escapa); por eso la línea de registro dice qué mecanismo se usa.
//!
//! Sin sesión de control viva (o ya en pausa) los eventos se ignoran. Pausar NO cierra la sesión: la reanuda la persona
//! desde el punto del indicador, o se quita sola a los 3 s sin actividad física (CTL1118P: los eventos siguen llegando en pausa y
//! cada uno vuelve a empezar la cuenta).

use crate::control_entrada_macos_logica as m;
use crate::control_escritorio_linux_logica as ll;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use tauri::AppHandle;
use x11rb::connection::Connection;
use x11rb::protocol::xinput::{self, ConnectionExt as _, XIEventMask};
use x11rb::protocol::xproto::ConnectionExt as _;
use x11rb::protocol::Event;
use x11rb::rust_connection::RustConnection;

static PAUSAS_DE_MANO: AtomicU64 = AtomicU64::new(0);
static EVENTOS_PROPIOS: AtomicU64 = AtomicU64::new(0);
static ARRANCADA: AtomicBool = AtomicBool::new(false);

/// Al cerrar la sesión: (pausas por mano, eventos propios descontados) y a cero.
pub fn contadores_y_reiniciar() -> (u64, u64) {
    (PAUSAS_DE_MANO.swap(0, Ordering::SeqCst), EVENTOS_PROPIOS.swap(0, Ordering::SeqCst))
}

fn hay_mano(app: &AppHandle) {
    if !crate::control_neuronas::sesion_viva() {
        return;
    }
    // CTL1118P: con la pausa ya puesta una mano nueva solo vuelve a empezar los 3 s (no cuenta como pausa nueva ni suelta nada).
    if crate::control_neuronas::sesion_viva_sin_pausa() {
        PAUSAS_DE_MANO.fetch_add(1, Ordering::SeqCst);
        crate::control_entrada_linux::al_pausar(); // suelta el botón o la tecla que el control hubiera dejado pulsado
    }
    crate::control_neuronas::pausa_local(app, crate::control_neuronas::mono_k());
}

pub(crate) fn propios_y_conocidos(con: &RustConnection) -> Option<(Vec<u16>, Vec<u16>)> {
    let r = con.xinput_xi_query_device(0u16).ok()?.reply().ok()?; // XIAllDevices
    let mut propios = Vec::new();
    let mut conocidos = Vec::new();
    for d in &r.infos {
        conocidos.push(d.deviceid);
        if ll::dispositivo_es_propio(&String::from_utf8_lossy(&d.name)) {
            propios.push(d.deviceid);
        }
    }
    Some((propios, conocidos))
}

/// Arranca el hilo de vigilancia (una vez por proceso). Sin X11 (Wayland, ssh, servicio) no hace nada y lo dice una vez.
pub fn vigilar_entrada_local(app: &AppHandle) {
    if ARRANCADA.swap(true, Ordering::SeqCst) {
        return;
    }
    let h = app.clone();
    let _ = std::thread::Builder::new().name("starseed-control-vigia-linux".into()).spawn(move || {
        let mut anotado = false;
        loop {
            if crate::control_entrada_linux::grafica() != ll::Grafica::X11 {
                if !anotado {
                    crate::ble::nota(None, "control-pausa", &ll::linea_vigia("ninguno-sin-x11", 0, 0));
                    anotado = true;
                }
                std::thread::sleep(std::time::Duration::from_secs(30));
                continue;
            }
            // Solo se conecta (y deja un hilo bloqueado en el servidor X) cuando de verdad hay una sesión de control.
            if !crate::control_neuronas::sesion_viva() {
                std::thread::sleep(std::time::Duration::from_millis(500));
                continue;
            }
            let Ok((con, n)) = RustConnection::connect(None) else {
                std::thread::sleep(std::time::Duration::from_secs(2));
                continue;
            };
            let raiz = con.setup().roots.get(n).map(|s| s.root);
            let xi2 = raiz.is_some() && con.xinput_xi_query_version(2, 0).ok().and_then(|c| c.reply().ok()).is_some_and(|v| v.major_version >= 2);
            if let (true, Some(raiz)) = (xi2, raiz) {
                let masc = [xinput::EventMask { deviceid: 1, mask: vec![XIEventMask::RAW_KEY_PRESS | XIEventMask::RAW_BUTTON_PRESS | XIEventMask::RAW_MOTION] }];
                if con.xinput_xi_select_events(raiz, &masc).ok().and_then(|c| c.check().ok()).is_some() {
                    crate::ble::nota(None, "control-pausa", &ll::linea_vigia("xi2", 0, 0));
                    bucle_xi2(&h, &con);
                    continue;
                }
            }
            crate::ble::nota(None, "control-pausa", &ll::linea_vigia("sondeo", 0, 0));
            bucle_sondeo(&h, &con, raiz);
        }
    });
}

/// Eventos crudos. Termina (para reconectar) si se pierde la conexión o la sesión de control acaba hace un rato.
fn bucle_xi2(app: &AppHandle, con: &RustConnection) {
    let (mut propios, mut conocidos) = propios_y_conocidos(con).unwrap_or_default();
    loop {
        let Ok(ev) = con.wait_for_event() else { return };
        let origen = match ev {
            Event::XinputRawKeyPress(e) => Some(e.sourceid),
            Event::XinputRawButtonPress(e) => Some(e.sourceid),
            Event::XinputRawMotion(e) => Some(e.sourceid),
            _ => None,
        };
        let Some(src) = origen else { continue };
        if !conocidos.contains(&src) {
            if let Some((p, c)) = propios_y_conocidos(con) {
                propios = p;
                conocidos = c;
            }
        }
        if ll::evento_pausa(src, &propios, &conocidos) {
            hay_mano(app);
        } else {
            EVENTOS_PROPIOS.fetch_add(1, Ordering::Relaxed);
        }
    }
}

fn bucle_sondeo(app: &AppHandle, con: &RustConnection, raiz: Option<u32>) {
    let Some(raiz) = raiz else { return };
    let mut botones_antes: Option<u16> = None;
    let mut teclas_antes: Option<[u8; 32]> = None;
    loop {
        std::thread::sleep(std::time::Duration::from_millis(50));
        if !crate::control_neuronas::sesion_viva() {
            return; // cerró la sesión: se vuelve a decidir el mecanismo con la siguiente
        }
        let Some(p) = con.query_pointer(raiz).ok().and_then(|c| c.reply().ok()) else { return };
        let k = con.query_keymap().ok().and_then(|c| c.reply().ok()).map(|r| r.keys);
        // Solo los botones del ratón (bits 8..12 de la máscara), no las modificadoras.
        let botones = u16::from(p.mask) & 0x1f00;
        let (ultima, dejado) = crate::control_entrada_linux::ultima_propia_y_puntero();
        let ahora = crate::control_neuronas::mono_k();
        let movido = m::puntero_movido_por_mano(dejado, (f64::from(p.root_x), f64::from(p.root_y)), ultima, ahora);
        let b_cambio = botones_antes.is_some_and(|b| b != botones);
        let t_cambio = matches!((teclas_antes, k), (Some(a), Some(b)) if a != b);
        botones_antes = Some(botones);
        if k.is_some() {
            teclas_antes = k;
        }
        if ll::sondeo_mano(movido, b_cambio, t_cambio, ultima, ahora) {
            hay_mano(app);
        }
    }
}
