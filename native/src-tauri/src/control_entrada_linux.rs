//! (CTL1118L) Control entre mis neuronas · un Linux de escritorio (X11) como aparato CONTROLADO: la ENTRADA (ratón y teclado con
//! enigo, por la extensión XTEST del servidor X) y lo común de los comandos de capacidades, ajustes y estado. Solo Linux; la
//! decisión pura vive en `control_escritorio_linux_logica.rs` (y, compartida con macOS, en `control_entrada_macos_logica.rs`).
//!
//! Mismas garantías que en el Mac (`control_entrada_macos.rs`), en este orden y ANTES de inyectar nada:
//!   1. sesión viva con indicador a la vista y nivel `controlar`; sobre firmado por un controlador que la persona aceptó en el
//!      diálogo nativo de ESTE equipo (`control_aceptados_escritorio`), el MISMO que abrió la sesión (verificada en lo nativo);
//!   2. sin pausa local (un toque físico pausa ~3 s, `control_vigia_linux`);
//!   3. equipo no bloqueado y ningún diálogo de consentimiento de este control abierto;
//!   4. solo X11 (en Wayland: `sin-soporte` con la falta `wayland`, sin intentar nada) y XTEST disponible;
//!   5. `alcance`: `total` no mira ventanas; `protegido` mira la clase de la ventana al frente.
//! Nada de aquí pide ni concede permisos (en X11 no hay permisos que dar: es la propia sesión). Nada se anota por orden ni por
//! fotograma, y nunca contenido (ni texto escrito ni coordenadas).

use crate::control_entrada_logica as l;
use crate::control_entrada_macos_logica as m;
use crate::control_escritorio_linux_logica as ll;
use crate::control_estado_linux_logica as st;
use enigo::{Axis, Button, Coordinate, Direction, Enigo, Key, Keyboard, Mouse, Settings};
use serde_json::{json, Value};
use std::sync::atomic::Ordering;
use std::sync::{Mutex, MutexGuard, OnceLock};
use tauri::AppHandle;
use x11rb::connection::{Connection, RequestConnection};
use x11rb::protocol::xproto::{AtomEnum, ConnectionExt};
use x11rb::rust_connection::RustConnection;

// ─────────────────────────── Lo que el sistema dice (solo se MIRA) ───────────────────────────

pub fn grafica() -> ll::Grafica {
    let v = |k: &str| std::env::var(k).ok();
    ll::grafica_de(v("WAYLAND_DISPLAY").as_deref(), v("XDG_SESSION_TYPE").as_deref(), v("DISPLAY").as_deref())
}

/// ¿Se conecta al servidor X? y ¿tiene XTEST (lo que enigo usa para inyectar)? Solo mira; no cambia nada.
pub fn sondear_x11() -> (bool, bool) {
    match RustConnection::connect(None) {
        Ok((c, _)) => {
            let xtest = c.extension_information("XTEST").ok().flatten().is_some();
            (true, xtest)
        }
        Err(_) => (false, false),
    }
}

/// Lo que falta para ver la pantalla ahora (la falta y el motivo del seam), o nada si se puede.
pub fn falta_para_ver() -> Option<(&'static str, &'static str)> {
    let g = grafica();
    let conecta = g == ll::Grafica::X11 && sondear_x11().0;
    ll::falta_pantalla(g, conecta).map(|f| (if f == ll::FALTA_WAYLAND { "sin-soporte" } else { "sin-servicio" }, f))
}

fn ejecutar_texto(prog: &str, args: &[&str]) -> Option<String> {
    let mut cmd = std::process::Command::new(prog);
    crate::entorno_hijos::aplicar_a_comando(&mut cmd);
    let o = cmd.args(args).stdin(std::process::Stdio::null()).stderr(std::process::Stdio::null()).output().ok()?;
    o.status.success().then(|| String::from_utf8_lossy(&o.stdout).to_string())
}

/// ¿El equipo está bloqueado? logind (`LockedHint`) y el salvapantallas de Xfce/XScreenSaver; bloqueado si CUALQUIERA lo dice.
/// Se vuelve a mirar como mucho cada segundo. Si ninguna fuente sabe, se cuenta como no bloqueado (se dice en el registro).
pub fn bloqueada() -> bool {
    static CACHE: OnceLock<Mutex<(u64, bool)>> = OnceLock::new();
    let c = CACHE.get_or_init(|| Mutex::new((0, false)));
    let ahora = ahora();
    if let Ok(g) = c.lock() {
        if g.0 != 0 && ahora.saturating_sub(g.0) < 1000 {
            return g.1;
        }
    }
    let logind = ejecutar_texto("loginctl", &["show-session", "-p", "LockedHint", "--value"]).and_then(|s| ll::bloqueo_de_logind(&s));
    let xfce = ejecutar_texto("xfce4-screensaver-command", &["--query"]).and_then(|s| ll::bloqueo_de_salvapantallas(&s));
    let xscr = ejecutar_texto("xscreensaver-command", &["-time"]).and_then(|s| ll::bloqueo_de_salvapantallas(&s));
    let fuentes = [logind, xfce, xscr];
    let r = ll::bloqueada_de(&fuentes);
    static CONOCIDO_ANOTADO: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
    if !ll::bloqueo_conocido(&fuentes) && !CONOCIDO_ANOTADO.swap(true, Ordering::SeqCst) {
        crate::ble::nota(None, "control-entrada", "bloqueo=desconocido (ni logind ni el salvapantallas dicen nada: se cuenta como no bloqueado)");
    }
    if let Ok(mut g) = c.lock() {
        *g = (ahora, r);
    }
    r
}

/// La clase (`WM_CLASS`) de la ventana al frente según el gestor (`_NET_ACTIVE_WINDOW`). None si no se puede saber.
fn clase_ventana_activa() -> Option<String> {
    static CACHE: OnceLock<Mutex<(u64, Option<String>)>> = OnceLock::new();
    let c = CACHE.get_or_init(|| Mutex::new((0, None)));
    let ahora = ahora();
    if let Ok(g) = c.lock() {
        if g.0 != 0 && ahora.saturating_sub(g.0) < 300 {
            return g.1.clone();
        }
    }
    let r = (|| {
        let (con, n) = RustConnection::connect(None).ok()?;
        let raiz = con.setup().roots.get(n)?.root;
        let atomo = con.intern_atom(false, b"_NET_ACTIVE_WINDOW").ok()?.reply().ok()?.atom;
        let p = con.get_property(false, raiz, atomo, AtomEnum::WINDOW, 0, 1).ok()?.reply().ok()?;
        let ventana = p.value32()?.next().filter(|w| *w != 0)?;
        let wc = con.get_property(false, ventana, AtomEnum::WM_CLASS, AtomEnum::STRING, 0, 256).ok()?.reply().ok()?;
        ll::clase_de_wm_class(&wc.value)
    })();
    if let Ok(mut g) = c.lock() {
        *g = (ahora, r.clone());
    }
    r
}

/// El alcance de ESTE equipo (`control-ajustes.json`). Falta → `total`.
pub fn alcance(app: &AppHandle) -> m::Alcance {
    crate::control_ajustes::alcance_de_app(app)
}

/// Tamaño en píxeles de la pantalla principal (para `control_estado_aparato`).
pub fn tamano_principal() -> Option<(u32, u32)> {
    crate::control_captura::tamano_principal()
}

/// Comprueba si `pactl` está disponible.
fn tiene_pactl() -> bool {
    std::process::Command::new("pactl")
        .arg("--version")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Comprueba si `wpctl` está disponible.
fn tiene_wpctl() -> bool {
    std::process::Command::new("wpctl")
        .arg("--version")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Comprueba si `brightnessctl` está disponible.
fn tiene_brightnessctl() -> bool {
    std::process::Command::new("brightnessctl")
        .arg("--version")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Comprueba si `xrandr` está disponible.
fn tiene_xrandr() -> bool {
    std::process::Command::new("xrandr")
        .arg("--version")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Obtiene la salida conectada principal para xrandr.
fn salida_xrandr_principal() -> Option<String> {
    let out = std::process::Command::new("xrandr")
        .args(["--query"])
        .stdin(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .output()
        .ok()?;
    let stdout = String::from_utf8_lossy(&out.stdout);
    for line in stdout.lines() {
        if line.contains(" connected") && !line.contains("disconnected") {
            return line.split_whitespace().next().map(|s| s.to_string());
        }
    }
    None
}

/// Ejecuta un comando de volumen (pactl o wpctl).
fn ejecutar_volumen(porcentaje: u32) -> Result<(), ()> {
    if tiene_pactl() {
        let args = ll::comando_volumen_pactl(porcentaje);
        let mut cmd = std::process::Command::new("pactl");
        crate::entorno_hijos::aplicar_a_comando(&mut cmd);
        let status = cmd.args(&args).stdin(std::process::Stdio::null()).stderr(std::process::Stdio::null()).status();
        if status.map(|s| s.success()).unwrap_or(false) {
            return Ok(());
        }
    }
    if tiene_wpctl() {
        let valor = (porcentaje as f64) / 100.0;
        let args = ll::comando_volumen_wpctl(valor);
        let mut cmd = std::process::Command::new("wpctl");
        crate::entorno_hijos::aplicar_a_comando(&mut cmd);
        let status = cmd.args(&args).stdin(std::process::Stdio::null()).stderr(std::process::Stdio::null()).status();
        if status.map(|s| s.success()).unwrap_or(false) {
            return Ok(());
        }
    }
    Err(())
}

/// Ejecuta un comando de brillo (brightnessctl o xrandr).
fn ejecutar_brillo(porcentaje: u32) -> Result<(), ()> {
    if tiene_brightnessctl() {
        let args = ll::comando_brillo_brightnessctl(porcentaje);
        let mut cmd = std::process::Command::new("brightnessctl");
        crate::entorno_hijos::aplicar_a_comando(&mut cmd);
        let status = cmd.args(&args).stdin(std::process::Stdio::null()).stderr(std::process::Stdio::null()).status();
        if status.map(|s| s.success()).unwrap_or(false) {
            return Ok(());
        }
    }
    if tiene_xrandr() {
        if let Some(salida) = salida_xrandr_principal() {
            let valor = (porcentaje as f64) / 100.0;
            let args = ll::comando_brillo_xrandr(&salida, valor);
            let mut cmd = std::process::Command::new("xrandr");
            crate::entorno_hijos::aplicar_a_comando(&mut cmd);
            let status = cmd.args(&args).stdin(std::process::Stdio::null()).stderr(std::process::Stdio::null()).status();
            if status.map(|s| s.success()).unwrap_or(false) {
                return Ok(());
            }
        }
    }
    Err(())
}

/// Indica si hay control de volumen disponible (pactl o wpctl).
pub fn hay_volumen() -> bool {
    tiene_pactl() || tiene_wpctl()
}

/// Indica si hay control de brillo disponible (brightnessctl o xrandr).
pub fn hay_brillo() -> bool {
    tiene_brightnessctl() || tiene_xrandr()
}

// ─────────────────────────── Estado de la inyección ───────────────────────────

struct Mundo {
    enigo: Option<Enigo>,
    mano: m::Mano,
    /// Cuándo inyectamos nosotros (solo para el sondeo de reserva de la vigilancia).
    propias: m::Propias,
    /// Dónde dejamos el puntero (píxeles), para el sondeo de reserva.
    dejado: Option<(f64, f64)>,
}

fn mundo() -> MutexGuard<'static, Mundo> {
    static M: OnceLock<Mutex<Mundo>> = OnceLock::new();
    M.get_or_init(|| Mutex::new(Mundo { enigo: None, mano: m::Mano::default(), propias: m::Propias::default(), dejado: None })).lock().unwrap_or_else(|e| e.into_inner())
}

/// Para el sondeo de reserva de la vigilancia: cuándo inyectamos por última vez y dónde dejamos el puntero.
pub fn ultima_propia_y_puntero() -> (u64, Option<(f64, f64)>) {
    let w = mundo();
    (w.propias.ultima_ms(), w.dejado)
}

fn ahora() -> u64 {
    crate::control_neuronas::mono_k()
}

fn abrir_enigo() -> Result<Enigo, &'static str> {
    Enigo::new(&Settings { release_keys_when_dropped: true, ..Settings::default() }).map_err(|_| "sin-servicio")
}

fn inyectar(w: &mut Mundo, clase: m::Clase, f: impl FnOnce(&mut Enigo) -> Result<(), enigo::InputError>) -> Result<(), &'static str> {
    w.propias.marcar(clase, ahora());
    let r = f(w.enigo.as_mut().ok_or("sin-servicio")?);
    w.propias.marcar(clase, ahora());
    r.map_err(|_| "sin-servicio")
}

fn aplicar(w: &mut Mundo, a: &m::Accion, ancho: f64, alto: f64) -> Result<(), &'static str> {
    use m::Accion::*;
    match a {
        Mover(x, y) => {
            let (px, py) = ((x * (ancho - 1.0)).round(), (y * (alto - 1.0)).round());
            inyectar(w, m::Clase::Raton, |e| e.move_mouse(px as i32, py as i32, Coordinate::Abs))?;
            w.dejado = Some((px, py));
        }
        Pulsar => inyectar(w, m::Clase::Boton, |e| e.button(Button::Left, Direction::Press))?,
        Soltar => inyectar(w, m::Clase::Boton, |e| e.button(Button::Left, Direction::Release))?,
        ClicIzq => inyectar(w, m::Clase::Boton, |e| e.button(Button::Left, Direction::Click))?,
        ClicDer => inyectar(w, m::Clase::Boton, |e| e.button(Button::Right, Direction::Click))?,
        Rueda { v, h } => {
            if *v != 0 {
                inyectar(w, m::Clase::Rueda, |e| e.scroll(*v, Axis::Vertical))?;
            }
            if *h != 0 {
                inyectar(w, m::Clase::Rueda, |e| e.scroll(*h, Axis::Horizontal))?;
            }
        }
    }
    Ok(())
}

fn tecla(w: &mut Mundo, t: ll::TeclaLinux) -> Result<(), &'static str> {
    use ll::TeclaLinux::*;
    // Combinaciones: se sueltan siempre las modificadoras aunque la tecla final falle.
    let combo = |w: &mut Mundo, mods: &[Key], fin: Key| -> Result<(), &'static str> {
        let mut r = Ok(());
        let mut puestas: Vec<Key> = Vec::new();
        for k in mods {
            r = inyectar(w, m::Clase::Tecla, |e| e.key(*k, Direction::Press));
            if r.is_err() {
                break;
            }
            puestas.push(*k);
        }
        if r.is_ok() {
            r = inyectar(w, m::Clase::Tecla, |e| e.key(fin, Direction::Click));
        }
        for k in puestas.iter().rev() {
            let _ = inyectar(w, m::Clase::Tecla, |e| e.key(*k, Direction::Release));
        }
        r
    };
    match t {
        Recientes => combo(w, &[Key::Alt], Key::Tab),
        Bloquear => combo(w, &[Key::Control, Key::Alt], Key::Unicode('l')),
        VolumenSubir => inyectar(w, m::Clase::Tecla, |e| e.key(Key::VolumeUp, Direction::Click)),
        VolumenBajar => inyectar(w, m::Clase::Tecla, |e| e.key(Key::VolumeDown, Direction::Click)),
        Silencio => inyectar(w, m::Clase::Tecla, |e| e.key(Key::VolumeMute, Direction::Click)),
    }
}

fn texto(w: &mut Mundo, t: &str) -> Result<(), &'static str> {
    for p in m::partir_texto(t) {
        match p {
            m::ParteTexto::Texto(s) => inyectar(w, m::Clase::Tecla, |e| e.text(&s))?,
            m::ParteTexto::Intro => inyectar(w, m::Clase::Tecla, |e| e.key(Key::Return, Direction::Click))?,
            m::ParteTexto::Tabulador => inyectar(w, m::Clase::Tecla, |e| e.key(Key::Tab, Direction::Click))?,
            m::ParteTexto::Borrar => inyectar(w, m::Clase::Tecla, |e| e.key(Key::Backspace, Direction::Click))?,
            m::ParteTexto::Escape => inyectar(w, m::Clase::Tecla, |e| e.key(Key::Escape, Direction::Click))?,
        }
    }
    Ok(())
}

/// Suelta lo que hubiera pulsado (pausa, parada, cambio de modo). Nunca falla hacia fuera.
pub fn soltar_todo() {
    let mut w = mundo();
    let acciones = w.mano.soltar_todo();
    if w.enigo.is_some() {
        for a in &acciones {
            let _ = aplicar(&mut w, a, 1.0, 1.0);
        }
    }
    w.dejado = None;
}

// ─────────────────────────── control_entrada ───────────────────────────

fn rechazo(m: l::Motivo) -> Value {
    json!({ "ok": false, "motivo": m.codigo() })
}

fn vistos() -> MutexGuard<'static, l::Vistos> {
    static V: OnceLock<Mutex<l::Vistos>> = OnceLock::new();
    V.get_or_init(|| Mutex::new(l::Vistos::default())).lock().unwrap_or_else(|e| e.into_inner())
}

pub fn contadores() -> MutexGuard<'static, Option<l::Contadores>> {
    static C: OnceLock<Mutex<Option<l::Contadores>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(None)).lock().unwrap_or_else(|e| e.into_inner())
}

fn anotar_resultado(app: &AppHandle, sesion: &str, r: Result<(), l::Motivo>) {
    let mut c = contadores();
    if c.as_ref().is_none_or(|c| !sesion.starts_with(&c.sesion)) {
        crate::ble::nota(None, "control-entrada", &ll::linea_inicio_entrada(sesion, alcance(app)));
        *c = Some(l::Contadores::nueva(sesion));
    }
    if let Some(c) = c.as_mut() {
        c.anotar(r);
    }
}

/// Seam 1 en Linux. Todo lo que puede decir que no lo dice ANTES de tocar el sistema.
pub fn entrada(app: &AppHandle, sesion: &str, sobre: &Value) -> Value {
    use crate::control_neuronas::{puerta_sesion, ModoPuerta};
    let Ok(nivel) = puerta_sesion(app, sesion, ModoPuerta::Lectura) else { return rechazo(l::Motivo::Sesion) };
    let aceptados = crate::control_aceptados_escritorio::leer(app);
    let ahora_ms = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0);
    let v = l::verificar_sobre(sobre, &aceptados, sesion, &nivel, ahora_ms, &mut vistos());
    // La orden la firma el MISMO controlador que abrió la sesión, y esa apertura se verificó aquí (no solo la página).
    let v = v.and_then(|o| {
        if crate::control_neuronas::de_de_sesion(sesion).as_deref() == Some(o.de.as_str()) && crate::control_aceptados_escritorio::sesion_verificada(&o.de) {
            Ok(o)
        } else {
            Err((l::Motivo::NoAutorizado, "otro-controlador"))
        }
    });
    let orden = match v {
        Ok(o) => o,
        Err((mo, _)) => {
            anotar_resultado(app, sesion, Err(mo));
            return rechazo(mo);
        }
    };
    if let Err(mo) = puerta_sesion(app, sesion, ModoPuerta::Orden) {
        let mo = if mo == "pausa-local" { l::Motivo::PausaLocal } else { l::Motivo::Sesion };
        anotar_resultado(app, sesion, Err(mo));
        return rechazo(mo);
    }
    match ejecutar(app, &orden) {
        Ok(()) => {
            anotar_resultado(app, sesion, Ok(()));
            json!({ "ok": true })
        }
        Err((mo, falta)) => {
            anotar_resultado(app, sesion, Err(mo));
            let mut o = json!({ "ok": false, "motivo": mo.codigo() });
            if let Some(f) = falta {
                o["falta"] = json!([f]);
            }
            o
        }
    }
}

fn ejecutar(app: &AppHandle, o: &l::OrdenEntrada) -> Result<(), (l::Motivo, Option<&'static str>)> {
    // Solo X11: en Wayland (o sin pantalla) no se intenta nada y se dice la falta con verdad.
    let g = grafica();
    let (conecta, xtest) = if g == ll::Grafica::X11 { sondear_x11() } else { (false, false) };
    if let Some(f) = ll::falta_entrada(g, conecta, xtest) {
        return Err((if f == ll::FALTA_WAYLAND { l::Motivo::SinSoporte } else { l::Motivo::SinServicio }, Some(f)));
    }
    // Un equipo bloqueado no recibe nada, en ningún alcance.
    if bloqueada() {
        return Err((l::Motivo::ReglaG, None));
    }
    // Con un diálogo de consentimiento de esta app abierto, nada entra, tampoco con alcance `total`: ningún clic ni tecla
    // remotos contestan el «Sí» del interruptor ni el de aceptar a otro controlador.
    if crate::acceso_equipo::dialogo_abierto() {
        return Err((l::Motivo::ReglaG, None));
    }
    let es_texto = o.nombre == "texto";
    let al = alcance(app);
    if al == m::Alcance::Protegido {
        if let Err(_porque) = ll::permite(al, clase_ventana_activa().as_deref(), es_texto) {
            return Err((l::Motivo::ReglaG, None));
        }
    }
    let mut w = mundo();
    if w.enigo.is_none() {
        w.enigo = Some(abrir_enigo().map_err(|_| (l::Motivo::SinServicio, Some(ll::FALTA_ENTRADA)))?);
    }
    let (ancho, alto) = w.enigo.as_ref().and_then(|e| e.main_display().ok()).map(|(a, b)| (f64::from(a), f64::from(b))).unwrap_or((0.0, 0.0));
    if ancho < 2.0 || alto < 2.0 {
        return Err((l::Motivo::SinServicio, None));
    }
    let r = match o.nombre.as_str() {
        "gesto" => {
            let g = m::leer_gesto(&o.args).ok_or((l::Motivo::SinServicio, None))?;
            let acciones = w.mano.avanzar(&g, ancho, alto);
            let mut r = Ok(());
            for a in &acciones {
                r = aplicar(&mut w, a, ancho, alto);
                if r.is_err() {
                    break;
                }
            }
            r
        }
        "tecla" => {
            let t = o.args.get("cual").and_then(|c| c.as_str()).and_then(ll::tecla_de).ok_or((l::Motivo::SinServicio, None))?;
            tecla(&mut w, t)
        }
        "texto" => texto(&mut w, o.args.get("texto").and_then(|t| t.as_str()).unwrap_or("")),
        "volumen" => {
            let valor = o.args.get("valor").and_then(|v| v.as_f64()).ok_or((l::Motivo::SinServicio, None))?;
            let pct = ll::porcentaje_volumen(valor);
            ejecutar_volumen(pct).map_err(|_| (l::Motivo::SinServicio, None))
        }
        "brillo" => {
            let valor = o.args.get("valor").and_then(|v| v.as_f64()).ok_or((l::Motivo::SinServicio, None))?;
            let pct = ll::porcentaje_brillo(valor);
            ejecutar_brillo(pct).map_err(|_| (l::Motivo::SinServicio, None))
        }
        _ => return Err((l::Motivo::SinServicio, None)),
    };
    r.map_err(|_| (l::Motivo::SinServicio, None))
}

/// Al pausar o terminar: se suelta lo pulsado y se olvida dónde estaba el puntero.
pub fn al_pausar() {
    soltar_todo();
}

/// Al cerrarse la sesión (cualquier motivo): suelta todo, una línea de resumen, y se olvida lo visto.
pub fn al_cerrar(app: &AppHandle) {
    soltar_todo();
    {
        let mut w = mundo();
        w.propias = m::Propias::default();
        w.enigo = None; // suelta teclas que quedaran (release_keys_when_dropped)
    }
    let (de_mano, propios) = crate::control_vigia_linux::contadores_y_reiniciar();
    if let Some(c) = contadores().take() {
        let linea = m::linea_fin_entrada(&c, propios, de_mano);
        crate::ble::nota(None, "control-entrada", &linea);
        crate::control_neuronas::anotar_k(app, "entrada-resumen", &linea);
    }
    vistos().olvidar();
}

// ─────────────────────────── Capacidades, ajustes y estado ───────────────────────────

pub fn capacidades(app: &AppHandle) -> Value {
    let g = grafica();
    let (conecta, xtest) = if g == ll::Grafica::X11 { sondear_x11() } else { (false, false) };
    let hay_volumen = hay_volumen();
    let hay_brillo = hay_brillo();
    ll::capacidades_linux(g, conecta, xtest, alcance(app), hay_volumen, hay_brillo)
}

/// En Linux no hay un panel de Ajustes donde dar estos permisos (no son permisos: es la sesión). No se abre nada.
pub fn abrir_ajuste(_cual: &str) -> Value {
    json!({ "ok": false, "motivo": "ajuste-desconocido" })
}

/// `control_estado_aparato` en Linux: solo lo que se sabe de verdad.
pub fn estado_aparato() -> Value {
    let (ancho, alto) = tamano_principal().unwrap_or((0, 0));
    let mut res = json!({
        "ok": true,
        "pantalla": { "ancho": ancho, "alto": alto, "giro": 0, "encendida": true, "bloqueada": bloqueada() },
        "plataforma": "linux"
    });

    if let Some(s) = ejecutar_texto("pactl", &["get-sink-volume", "@DEFAULT_SINK@"]) {
        if let Some(v) = st::parsear_pactl_volumen(&s) { res["volumen"] = json!(v); }
    } else if let Some(s) = ejecutar_texto("wpctl", &["get-volume", "@DEFAULT_AUDIO_SINK@"]) {
        let (v, m) = st::parsear_wpctl_volumen(&s);
        if let Some(v) = v { res["volumen"] = json!(v); }
        if let Some(m) = m { res["silencio"] = json!(m); }
    }
    if res["silencio"].is_null() {
        if let Some(s) = ejecutar_texto("pactl", &["get-sink-mute", "@DEFAULT_SINK@"]) {
            if let Some(m) = st::parsear_pactl_silencio(&s) { res["silencio"] = json!(m); }
        }
    }

    if let (Some(actual), Some(max)) = (ejecutar_texto("brightnessctl", &["g"]), ejecutar_texto("brightnessctl", &["m"])) {
        if let Some(b) = st::calcular_brillo(&actual, &max) { res["brillo"] = json!(b); }
    } else {
        let leer = |p: &str| std::fs::read_to_string(p).ok();
        let paths = ["/sys/class/backlight/intel_backlight", "/sys/class/backlight/amdgpu_bl0", "/sys/class/backlight/acpi_video0"];
        for p in paths {
            if let (Some(a), Some(m)) = (leer(&format!("{}/brightness", p)), leer(&format!("{}/max_brightness", p))) {
                if let Some(b) = st::calcular_brillo(&a, &m) {
                    res["brillo"] = json!(b);
                    break;
                }
            }
        }
    }

    let leer = |p: &str| std::fs::read_to_string(p).ok();
    if let (Some(c), Some(s)) = (leer("/sys/class/power_supply/BAT0/capacity"), leer("/sys/class/power_supply/BAT0/status")) {
        if let Some(bat) = st::parsear_bateria(&c, &s) { res["bateria"] = json!(bat); }
    } else if let (Some(c), Some(s)) = (leer("/sys/class/power_supply/BAT1/capacity"), leer("/sys/class/power_supply/BAT1/status")) {
        if let Some(bat) = st::parsear_bateria(&c, &s) { res["bateria"] = json!(bat); }
    }

    let mut red = json!({});
    if let Some(s) = ejecutar_texto("nmcli", &["-t", "-f", "WIFI,STATE", "g"]) {
        let (enc, con) = st::parsear_nmcli_wifi(&s);
        red["wifi_encendido"] = json!(enc);
        red["wifi_conectado"] = json!(con);
    }
    if let Some(s) = ejecutar_texto("nmcli", &["-t", "-f", "active,ssid", "dev", "wifi"]) {
        if let Some(ssid) = st::parsear_nmcli_ssid(&s) { red["wifi_ssid"] = json!(ssid); }
    }
    if let Some(s) = ejecutar_texto("rfkill", &["list", "bluetooth"]) {
        red["bluetooth_encendido"] = json!(st::parsear_rfkill_bluetooth(&s));
    }
    if !red.as_object().unwrap().is_empty() {
        res["red"] = red;
    }

    res
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use x11rb::protocol::xinput::{self, ConnectionExt as _, XIEventMask};
    use x11rb::protocol::Event;

    /// Prueba de humo REAL bajo un servidor X virtual: `Xvfb :99 -screen 0 1024x768x24 &` y luego
    /// `DISPLAY=:99 cargo test --lib humo_xvfb -- --ignored --nocapture`. Comprueba la sesión gráfica, la captura (xcap + JPEG con
    /// cabecera), la inyección (enigo/XTEST: el puntero llega donde se pidió) y que XInput2 ve lo inyectado como un dispositivo
    /// PROPIO (XTEST), no como una mano. No puede probar una mano física: eso se prueba con `dispositivo_es_propio` y, en el equipo.
    #[test]
    #[ignore = "necesita un servidor X (Xvfb) en DISPLAY"]
    fn humo_xvfb_captura_inyeccion_y_dispositivos() {
        assert_eq!(grafica(), ll::Grafica::X11, "falta DISPLAY (o hay WAYLAND_DISPLAY)");
        let (conecta, xtest) = sondear_x11();
        assert!(conecta && xtest, "conecta={conecta} xtest={xtest}");
        assert!(falta_para_ver().is_none());
        // Captura real.
        let (jpeg, w, h) = crate::control_captura::capturar_jpeg(640, 60, 1).expect("captura con xcap");
        assert!(w > 0 && h > 0 && jpeg.len() > 12 + 200, "{w}x{h} {} bytes", jpeg.len());
        assert_eq!(&jpeg[12..14], &[0xFF, 0xD8], "tras la cabecera de 12 bytes va un JPEG");
        println!("humo: captura {w}x{h} {} bytes", jpeg.len());
        // XInput2: eventos crudos y nombres de dispositivos.
        let (con, n) = RustConnection::connect(None).unwrap();
        let raiz = con.setup().roots[n].root;
        assert!(con.xinput_xi_query_version(2, 0).unwrap().reply().unwrap().major_version >= 2);
        let masc = [xinput::EventMask { deviceid: 1, mask: vec![XIEventMask::RAW_KEY_PRESS | XIEventMask::RAW_BUTTON_PRESS | XIEventMask::RAW_MOTION] }];
        con.xinput_xi_select_events(raiz, &masc).unwrap().check().unwrap();
        let (propios, conocidos) = crate::control_vigia_linux::propios_y_conocidos(&con).expect("lista de dispositivos");
        println!("humo: dispositivos={} propios(XTEST)={}", conocidos.len(), propios.len());
        assert!(!propios.is_empty() && conocidos.len() > propios.len(), "hay dispositivos XTEST y otros");
        // Inyección real: mover el puntero y escribir.
        let mut mu = mundo();
        mu.enigo = Some(abrir_enigo().expect("enigo"));
        let (ancho, alto) = mu.enigo.as_ref().unwrap().main_display().unwrap();
        aplicar(&mut mu, &m::Accion::Mover(0.25, 0.5), f64::from(ancho), f64::from(alto)).expect("mover");
        aplicar(&mut mu, &m::Accion::ClicIzq, f64::from(ancho), f64::from(alto)).expect("clic");
        texto(&mut mu, "ab").expect("texto");
        tecla(&mut mu, ll::TeclaLinux::VolumenSubir).expect("tecla");
        drop(mu);
        let p = con.query_pointer(raiz).unwrap().reply().unwrap();
        let (ex, ey) = ((0.25 * f64::from(ancho - 1)).round() as i16, (0.5 * f64::from(alto - 1)).round() as i16);
        assert_eq!((p.root_x, p.root_y), (ex, ey), "el puntero llegó donde se pidió");
        let mut vistos = 0;
        let t0 = std::time::Instant::now();
        while t0.elapsed() < std::time::Duration::from_secs(2) {
            match con.poll_for_event().unwrap() {
                Some(Event::XinputRawKeyPress(e)) => { vistos += 1; assert!(ll::dispositivo_es_propio_id(e.sourceid, &propios)); }
                Some(Event::XinputRawButtonPress(e)) => { vistos += 1; assert!(ll::dispositivo_es_propio_id(e.sourceid, &propios)); }
                Some(Event::XinputRawMotion(e)) => { vistos += 1; assert!(ll::dispositivo_es_propio_id(e.sourceid, &propios)); }
                Some(_) => {}
                None => std::thread::sleep(std::time::Duration::from_millis(20)),
            }
        }
        println!("humo: eventos crudos propios vistos={vistos}");
        assert!(vistos > 0, "XInput2 no vio la inyección");
        // Wayland: se dice y no se intenta nada.
        // (Se prueba la lógica pura aparte; aquí solo que la sesión actual se reconoce como X11.)
    }
}
