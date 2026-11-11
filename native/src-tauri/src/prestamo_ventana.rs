//! (SEG1111T) La sesión de «prestar una ventana» en el proceso nativo: diálogo nativo para abrirla,
//! indicador en la barra de menús/bandeja con «Dejar de prestar», vigilante que la cierra sola
//! (inactividad, hora máxima, reposo, bloqueo, ventana cerrada) y comprobaciones del sistema que
//! acotan la entrada (entrada segura de macOS, campos de contraseña de Windows, foco, ventanas encima).
//!
//! La lógica pura (estado, vencimientos, orígenes, textos) está en `prestamo_ventana_logica.rs`.
//! Contrato: architecture/permisos-y-control-del-dispositivo.md §4.7.

use crate::prestamo_ventana_logica as l;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

/// Evento que recibe la web cuando la sesión termina (por lo que sea).
pub const EVENTO_FIN: &str = "prestamo-ventana-fin";
/// Id del icono propio del préstamo en la barra de menús / bandeja (aparte del de las antenas).
const ID_BANDEJA: &str = "starseed-prestamo";
const MENU_PARAR: &str = "ss-prestamo-parar";

fn estado() -> MutexGuard<'static, l::Prestamo> {
    static E: OnceLock<Mutex<l::Prestamo>> = OnceLock::new();
    // Un pánico con el cerrojo tomado no deja el préstamo abierto para siempre: se recupera el estado.
    E.get_or_init(|| Mutex::new(l::Prestamo::default())).lock().unwrap_or_else(|e| e.into_inner())
}

/// Milisegundos monótonos desde que arrancó el proceso (no corren hacia atrás).
fn ahora_ms() -> u64 {
    static ARRANQUE: OnceLock<Instant> = OnceLock::new();
    ARRANQUE.get_or_init(Instant::now).elapsed().as_millis() as u64
}

fn pared_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

/// Token opaco de 128 bits. Las claves de `RandomState` salen de la entropía del sistema operativo;
/// se mezclan con el reloj y un contador para que dos tokens seguidos no se parezcan.
fn token_nuevo() -> String {
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hasher};
    use std::sync::atomic::AtomicU64;
    static CONTADOR: AtomicU64 = AtomicU64::new(0);
    let n = CONTADOR.fetch_add(1, Ordering::Relaxed);
    let mut partes = [0u64; 2];
    for (i, p) in partes.iter_mut().enumerate() {
        let mut h = RandomState::new().build_hasher();
        h.write_u64(n);
        h.write_u64(i as u64);
        h.write_i64(pared_ms());
        h.write_u64(ahora_ms());
        *p = h.finish();
    }
    format!("{:016x}{:016x}", partes[0], partes[1])
}

/// Origen de la página que llama («esquema://host[:puerto]»).
pub fn origen_de_webview(webview: &tauri::Webview) -> String {
    webview.url().map(|u| l::origen_de(u.as_str())).unwrap_or_default()
}

/// La puerta de los comandos de `ventana_remota`: la ventana `main`, el origen, el token y (si se
/// pide) la ventana deben ser los de la sesión abierta; si no, error con su código `prestamo:…`.
pub fn exigir(app: &AppHandle, webview: &tauri::Webview, token: &str, ventana: Option<u32>) -> Result<l::Sesion, String> {
    if webview.label() != "main" {
        return Err(l::Rechazo::Origen.mensaje());
    }
    let origen = origen_de_webview(webview);
    let habia = estado().activa().is_some();
    let r = estado().autorizar(token, &origen, ventana, ahora_ms()).cloned();
    match r {
        Ok(s) => Ok(s),
        Err(e) => {
            // Un vencimiento descubierto aquí (antes que el vigilante) también quita el indicador y avisa.
            if habia && estado().activa().is_none() {
                quitar_indicador(app);
                let _ = app.emit(EVENTO_FIN, serde_json::json!({ "motivo": "venció" }));
                anotar(app, "terminada · venció");
            }
            anotar(app, &format!("rechazada · {}", e.codigo()));
            Err(e.mensaje())
        }
    }
}

/// Termina la sesión abierta (si la hay) con su motivo: quita el indicador, avisa a la web y lo anota.
pub fn terminar(app: &AppHandle, fin: l::Fin) {
    let habia = estado().terminar(fin);
    if habia {
        cerrada(app, fin);
    }
}

/// Lo que se hace siempre que una sesión acaba de cerrarse (también si la cerró el vigilante).
fn cerrada(app: &AppHandle, fin: l::Fin) {
    quitar_indicador(app);
    let _ = app.emit(EVENTO_FIN, serde_json::json!({ "motivo": fin.texto() }));
    anotar(app, &format!("terminada · {}", fin.texto()));
}

/// Una ventana prestada ya no existe.
pub fn ventana_desaparecida(app: &AppHandle, id: u32) {
    let fin = estado().quitar_ventana(id);
    if let Some(f) = fin {
        cerrada(app, f);
    }
}

/// Lo que devuelve `prestamo_ventana_iniciar` a la página: el token y las ventanas que la persona vio.
#[derive(serde::Serialize, Clone)]
pub struct SesionPrestamo {
    pub token: String,
    pub ventanas: Vec<crate::ventana_remota::VentanaInfo>,
    pub inactividad_ms: u64,
    pub duracion_max_ms: u64,
}

/// Lo que puede saber la página del préstamo sin token: si hay uno abierto (nada más).
#[derive(serde::Serialize, Clone)]
pub struct EstadoPrestamo {
    pub activo: bool,
}

/// Pide prestar ventanas de `apps` (opcionalmente solo las `ventanas` indicadas) a `destino`.
/// Rust lista las ventanas, ENSEÑA un diálogo nativo con cada una (app y título) y el destino, y
/// solo con «Prestar» abre la sesión. Antes del «sí» la página no recibe ni un título.
#[tauri::command]
pub async fn prestamo_ventana_iniciar(
    app: AppHandle,
    webview: tauri::Webview,
    apps: Vec<String>,
    ventanas: Option<Vec<u32>>,
    destino: String,
) -> Result<SesionPrestamo, String> {
    if !crate::nativa::es_starseed_os(&app) {
        return Err(l::Rechazo::OrigenNoPermitido.mensaje());
    }
    if webview.label() != "main" {
        return Err(l::Rechazo::Origen.mensaje());
    }
    let origen = origen_de_webview(&webview);
    estado().empezar_pedido(&origen, ahora_ms()).map_err(|e| {
        anotar(&app, &format!("pedido rechazado · {}", e.codigo()));
        e.mensaje()
    })?;

    // A partir de aquí el pedido está «abierto»: toda salida debe cerrarlo.
    let elegidas = match crate::ventana_remota::listar_de_apps(&apps) {
        Ok(v) => v
            .into_iter()
            .filter(|w| ventanas.as_ref().map(|ids| ids.contains(&w.id)).unwrap_or(true))
            .take(l::MAX_VENTANAS)
            .collect::<Vec<_>>(),
        Err(e) => {
            estado().cancelar_pedido();
            return Err(e);
        }
    };
    if elegidas.is_empty() {
        estado().cancelar_pedido();
        return Err(l::Rechazo::SinVentanas.mensaje());
    }
    // Sin indicador visible no se presta (en un Linux sin libappindicator no habría cómo verlo ni pararlo).
    if !crate::segundo_plano::bandeja_posible() {
        estado().cancelar_pedido();
        return Err("prestamo:sin-indicador · este sistema no puede enseñar el aviso de préstamo en la bandeja".into());
    }

    let destino = l::limpiar_destino(&destino);
    let texto = l::texto_confirmacion(
        &destino,
        &elegidas.iter().map(|w| (w.app_name.clone(), w.title.clone())).collect::<Vec<_>>(),
    );
    anotar(&app, &format!("pedido · {} ventana(s) → «{destino}»", elegidas.len()));
    let dialogo = {
        use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
        app.dialog()
            .message(texto)
            .title("StarSeed OS · ¿Prestar ventanas?")
            .kind(MessageDialogKind::Warning)
            .buttons(MessageDialogButtons::OkCancelCustom("Prestar".into(), "No prestar".into()))
    };
    // El diálogo bloquea: fuera del hilo del runtime asíncrono.
    let si = tauri::async_runtime::spawn_blocking(move || dialogo.blocking_show()).await.unwrap_or(false);

    let token = token_nuevo();
    let ids: Vec<u32> = elegidas.iter().map(|w| w.id).collect();
    // El origen se vuelve a mirar tras el diálogo: si la página navegó mientras tanto, no se abre.
    let origen_ahora = origen_de_webview(&webview);
    let si = si && origen_ahora == origen;
    let resultado = estado().resolver_pedido(si, token.clone(), &origen, &destino, ids, ahora_ms());
    match resultado {
        Ok(vieja) => {
            if vieja.is_some() {
                anotar(&app, "terminada · se abrió otra sesión");
            }
            if let Err(e) = poner_indicador(&app, &destino, elegidas.len()) {
                // Fallar cerrado: sin indicador, sin sesión.
                estado().terminar(l::Fin::Salida);
                anotar(&app, &format!("sin indicador · {e}"));
                return Err(format!("prestamo:sin-indicador · no se pudo enseñar el aviso de préstamo: {e}"));
            }
            iniciar_vigilante(&app);
            anotar(&app, &format!("abierta · {} ventana(s) → «{destino}»", elegidas.len()));
            Ok(SesionPrestamo {
                token,
                ventanas: elegidas,
                inactividad_ms: l::INACTIVIDAD_MS,
                duracion_max_ms: l::DURACION_MAX_MS,
            })
        }
        Err(e) => {
            anotar(&app, &format!("no prestada · {}", e.codigo()));
            Err(e.mensaje())
        }
    }
}

/// La página deja de prestar. Parar no necesita token: siempre se puede parar.
#[tauri::command]
pub fn prestamo_ventana_parar(app: AppHandle) {
    terminar(&app, l::Fin::Web);
}

/// ¿Hay un préstamo abierto? Solo sí/no: ni token, ni ventanas, ni destino.
#[tauri::command]
pub fn prestamo_ventana_estado() -> EstadoPrestamo {
    EstadoPrestamo { activo: estado().activa().is_some() }
}

// ─────────────────────────── Indicador nativo ───────────────────────────

fn poner_indicador(app: &AppHandle, destino: &str, n: usize) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
    use tauri::tray::TrayIconBuilder;
    let _ = app.remove_tray_by_id(ID_BANDEJA);
    let que = MenuItem::with_id(
        app,
        "ss-prestamo-info",
        format!("Prestando {n} ventana(s) a «{destino}»"),
        false,
        None::<&str>,
    )?;
    let sep = PredefinedMenuItem::separator(app)?;
    let parar = MenuItem::with_id(app, MENU_PARAR, "Dejar de prestar ahora", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&que, &sep, &parar])?;
    let mut b = TrayIconBuilder::with_id(ID_BANDEJA)
        .menu(&menu)
        .tooltip(format!("StarSeed: prestando {n} ventana(s) a «{destino}»"))
        // En macOS el texto se ve en la barra de menús junto al icono.
        .title("● Prestando")
        .show_menu_on_left_click(true)
        // El clic se atiende en Rust: aunque la página esté colgada, «Dejar de prestar» funciona.
        .on_menu_event(|app, ev| {
            if ev.id().as_ref() == MENU_PARAR {
                terminar(app, l::Fin::Persona);
            }
        });
    if let Some(icono) = app.default_window_icon() {
        b = b.icon(icono.clone());
    }
    b.build(app)?;
    Ok(())
}

fn quitar_indicador(app: &AppHandle) {
    let _ = app.remove_tray_by_id(ID_BANDEJA);
}

// ─────────────────────────── Vigilante ───────────────────────────

/// Un hilo por proceso: cada segundo mira vencimientos, reposo y bloqueo; cada 2 s, que las ventanas
/// prestadas sigan existiendo. Duerme mientras no hay sesión.
fn iniciar_vigilante(app: &AppHandle) {
    static VIVO: AtomicBool = AtomicBool::new(false);
    if VIVO.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    let _ = std::thread::Builder::new().name("starseed-prestamo".into()).spawn(move || {
        let (mut pared, mut mono) = (pared_ms(), ahora_ms());
        let mut vuelta: u64 = 0;
        loop {
            std::thread::sleep(std::time::Duration::from_secs(1));
            vuelta += 1;
            let (p, m) = (pared_ms(), ahora_ms());
            let durmio = l::dormido(p - pared, m.saturating_sub(mono));
            (pared, mono) = (p, m);
            let ventanas = match estado().activa() {
                Some(s) => s.ventanas.clone(),
                None => continue,
            };
            if durmio {
                terminar(&app, l::Fin::Sueno);
                continue;
            }
            // Sin indicador no hay préstamo: si algo quitó el icono, la sesión termina.
            if app.tray_by_id(ID_BANDEJA).is_none() {
                terminar(&app, l::Fin::SinIndicador);
                continue;
            }
            if sistema::pantalla_bloqueada() {
                terminar(&app, l::Fin::Bloqueo);
                continue;
            }
            let vencida = estado().vigilar(ahora_ms());
            if let Some(fin) = vencida {
                cerrada(&app, fin);
                continue;
            }
            if vuelta % 2 == 0 {
                if let Ok(vivas) = crate::ventana_remota::ids_existentes() {
                    for id in ventanas.iter().filter(|id| !vivas.contains(id)) {
                        ventana_desaparecida(&app, *id);
                    }
                }
            }
        }
    });
}

// ─────────────────────────── Registro ───────────────────────────

/// Una línea en `enlaces.log` (macOS `~/Library/Logs/app.starseed.os/`; resto, carpeta de datos de la
/// app) con el prefijo `[prestamo]`, para leer la ronda de pruebas sin adivinar. Nunca títulos de
/// ventanas ni tokens: solo cuántas, a qué nombre de destino y el motivo.
pub fn anotar(app: &AppHandle, texto: &str) {
    #[cfg(target_os = "macos")]
    let ruta = std::env::var_os("HOME").map(|h| std::path::PathBuf::from(h).join("Library/Logs/app.starseed.os/enlaces.log"));
    #[cfg(not(target_os = "macos"))]
    let ruta = {
        use tauri::Manager;
        app.path().app_data_dir().ok().map(|d| d.join("enlaces.log"))
    };
    #[cfg(target_os = "macos")]
    let _ = app;
    let Some(ruta) = ruta else { return };
    let linea = format!(
        "{} [prestamo] {}",
        crate::ble::iso_utc(pared_ms().max(0) as u64),
        crate::ble::linea_limpia(texto, 200)
    );
    let _ = crate::ble::anexar_rotando(&ruta, &[linea], 4 * 1024 * 1024);
}

// ─────────────────────────── Comprobaciones del sistema ───────────────────────────

/// Lo que solo el sistema operativo sabe: pantalla bloqueada y campos de contraseña.
/// Ante la duda (una llamada que falla) se elige lo seguro: bloqueada / entrada segura.
pub mod sistema {
    #[cfg(target_os = "macos")]
    mod mac {
        use std::ffi::c_void;
        type CfRef = *const c_void;
        const UTF8: u32 = 0x0800_0100;
        #[link(name = "CoreGraphics", kind = "framework")]
        extern "C" {
            fn CGSessionCopyCurrentDictionary() -> CfRef;
        }
        #[link(name = "CoreFoundation", kind = "framework")]
        extern "C" {
            fn CFDictionaryGetValue(d: CfRef, k: CfRef) -> CfRef;
            fn CFStringCreateWithCString(alloc: CfRef, s: *const std::ffi::c_char, enc: u32) -> CfRef;
            fn CFRelease(r: CfRef);
            fn CFGetTypeID(r: CfRef) -> usize;
            fn CFBooleanGetTypeID() -> usize;
            fn CFBooleanGetValue(b: CfRef) -> u8;
        }
        #[link(name = "Carbon", kind = "framework")]
        extern "C" {
            fn IsSecureEventInputEnabled() -> u8;
        }

        unsafe fn booleano(d: CfRef, clave: &std::ffi::CStr) -> Option<bool> {
            let k = CFStringCreateWithCString(std::ptr::null(), clave.as_ptr(), UTF8);
            if k.is_null() {
                return None;
            }
            let v = CFDictionaryGetValue(d, k);
            let r = if v.is_null() || CFGetTypeID(v) != CFBooleanGetTypeID() { None } else { Some(CFBooleanGetValue(v) != 0) };
            CFRelease(k);
            r
        }

        /// Pantalla bloqueada, salvapantallas con contraseña o la sesión de usuario fuera de la consola
        /// (cambio rápido de usuario). Sin diccionario de sesión: se trata como bloqueada.
        pub fn pantalla_bloqueada() -> bool {
            unsafe {
                let d = CGSessionCopyCurrentDictionary();
                if d.is_null() {
                    return true;
                }
                let bloqueada = booleano(d, c"CGSSessionScreenIsLocked").unwrap_or(false);
                let en_consola = booleano(d, c"kCGSSessionOnConsoleKey").unwrap_or(true);
                CFRelease(d);
                bloqueada || !en_consola
            }
        }

        /// Hay un campo seguro (contraseña) con el foco en alguna app, o una app activó la entrada
        /// segura (Terminal «Secure Keyboard Entry», gestores de contraseñas, la pantalla de inicio).
        pub fn entrada_segura() -> bool {
            unsafe { IsSecureEventInputEnabled() != 0 }
        }
    }

    #[cfg(target_os = "windows")]
    mod win {
        type Hwnd = isize;
        #[repr(C)]
        struct Rect {
            l: i32,
            t: i32,
            r: i32,
            b: i32,
        }
        #[repr(C)]
        struct GuiThreadInfo {
            cb_size: u32,
            flags: u32,
            hwnd_active: Hwnd,
            hwnd_focus: Hwnd,
            hwnd_capture: Hwnd,
            hwnd_menu_owner: Hwnd,
            hwnd_move_size: Hwnd,
            hwnd_caret: Hwnd,
            rc_caret: Rect,
        }
        #[link(name = "user32")]
        extern "system" {
            fn OpenInputDesktop(flags: u32, heredar: i32, acceso: u32) -> isize;
            fn SwitchDesktop(h: isize) -> i32;
            fn CloseDesktop(h: isize) -> i32;
            fn GetGUIThreadInfo(hilo: u32, info: *mut GuiThreadInfo) -> i32;
            fn GetWindowLongW(h: Hwnd, indice: i32) -> i32;
            fn GetClassNameW(h: Hwnd, buf: *mut u16, max: i32) -> i32;
        }
        const DESKTOP_SWITCHDESKTOP: u32 = 0x0100;
        const GWL_STYLE: i32 = -16;
        const ES_PASSWORD: i32 = 0x0020;

        /// Con la estación bloqueada el escritorio de entrada es el de Winlogon y no se puede cambiar a él.
        pub fn pantalla_bloqueada() -> bool {
            unsafe {
                let h = OpenInputDesktop(0, 0, DESKTOP_SWITCHDESKTOP);
                if h == 0 {
                    return true;
                }
                let ok = SwitchDesktop(h) != 0;
                CloseDesktop(h);
                !ok
            }
        }

        /// El control con el foco es un «Edit» clásico con `ES_PASSWORD`. Los campos de contraseña de
        /// otros marcos (navegadores, UWP, WPF) no se ven así: eso queda sin cubrir (ver contrato).
        pub fn entrada_segura() -> bool {
            unsafe {
                let mut info: GuiThreadInfo = std::mem::zeroed();
                info.cb_size = std::mem::size_of::<GuiThreadInfo>() as u32;
                if GetGUIThreadInfo(0, &mut info) == 0 || info.hwnd_focus == 0 {
                    return false;
                }
                let mut buf = [0u16; 64];
                let n = GetClassNameW(info.hwnd_focus, buf.as_mut_ptr(), buf.len() as i32);
                let clase = String::from_utf16_lossy(&buf[..n.max(0) as usize]).to_ascii_lowercase();
                clase.contains("edit") && GetWindowLongW(info.hwnd_focus, GWL_STYLE) & ES_PASSWORD != 0
            }
        }
    }

    #[cfg(target_os = "macos")]
    pub use mac::{entrada_segura, pantalla_bloqueada};
    #[cfg(target_os = "windows")]
    pub use win::{entrada_segura, pantalla_bloqueada};

    /// Linux: sin comprobación de bloqueo ni de campos de contraseña todavía (logind `LockedHint` y
    /// AT-SPI quedan pendientes; ver contrato). El reposo sí se detecta por el salto de reloj.
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    pub fn pantalla_bloqueada() -> bool {
        false
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    pub fn entrada_segura() -> bool {
        false
    }
}

/// Al salir de la app: la sesión (solo en memoria) se da por terminada y se anota.
pub fn al_salir(app: &AppHandle) {
    terminar(app, l::Fin::Salida);
}
