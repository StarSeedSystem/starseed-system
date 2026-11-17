//! (ORD1114Q) Control entre mis neuronas · el lado NATIVO del aparato controlado: sesión, indicador,
//! parada y registro encadenado. Contrato: architecture/control-remoto-entre-neuronas.md §1 caso H y §2.4.
//!
//! · La sesión la guarda Rust (`control_neuronas_logica::Control`). La página la pide abrir y Rust solo la
//!   abre si puede enseñar el indicador; antes de ejecutar CADA orden la página pide permiso
//!   (`control_neuronas_orden`) y Rust lo anota. Sin sesión en Rust, la orden no se ejecuta.
//! · Indicador (escritorio): icono propio en la barra de menús/bandeja con el título «● Controlada por …» y
//!   el menú «Terminar el control ahora», atendido en Rust: para aunque la página esté colgada. La página no
//!   tiene `core:tray`/`core:menu` (SEG1111U), así que no lo puede quitar.
//! · (ORD1114T) macOS además: borde rojo siempre encima en cada pantalla, atajo global fijo ⌃⌥⌘. que para, y
//!   cualquier tecla, clic o movimiento local pausa al instante (`control_neuronas_macos.rs`); «Reanudar el
//!   control» solo desde el menú del indicador.
//! · (ORD1114T) Android: notificación en curso del servicio en primer plano con «Terminar» + superposición
//!   (borde y pastilla), todo en Kotlin; la sesión y el registro siguen aquí (`control_neuronas_android.rs`).
//!   Sin interruptor nativo, notificaciones o superposición, se niega con «sin-indicador-nativo».
//! · (ORD1114T) Windows, Linux e iOS: falta el borde, el atajo o la pausa local que pide §2.4, así que allí la
//!   sesión se NIEGA («sin-indicador-nativo»): no se rebaja la condición.
//! · Vigía: cada segundo cierra la sesión vencida (1 h) o inactiva (2 min) y quita el indicador.
//! · Registro: `control-neuronas.log` (macOS: ~/Library/Logs/app.starseed.os; otros: datos de la app),
//!   solo-añadir y encadenado por SHA-256; guarda nombre de orden, aparato (8) y resultado, nunca contenido.

use crate::control_neuronas_logica as l;
use serde::Serialize;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

pub const EVENTO_PARADA: &str = "control-neuronas:parada";
/// (ORD1114T) Pausa o reanudación local (para que la página lo diga; no decide nada).
#[allow(dead_code)] // ORD1114T: lo usan macOS y Android, no Windows/Linux
pub const EVENTO_PAUSA: &str = "control-neuronas:pausa";
#[cfg(desktop)]
const ID_BANDEJA: &str = "starseed-control-neuronas";
#[cfg(desktop)]
#[allow(dead_code)]
const MENU_TERMINAR: &str = "ss-control-terminar";
#[cfg(desktop)]
#[allow(dead_code)]
const MENU_QUITAR: &str = "ss-control-quitar-permiso"; // ORD1114V
#[cfg(desktop)]
#[allow(dead_code)]
const MENU_REANUDAR: &str = "ss-control-reanudar"; // ORD1114T

/// (ORD1114T) El AppHandle para quien no lo recibe (el atajo global de Carbon).
pub(crate) static APP: OnceLock<AppHandle> = OnceLock::new();

fn control() -> MutexGuard<'static, l::Control> {
    static C: OnceLock<Mutex<l::Control>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(l::Control::default())).lock().unwrap_or_else(|e| e.into_inner())
}

fn cerrojo_registro() -> MutexGuard<'static, ()> {
    static C: OnceLock<Mutex<()>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(())).lock().unwrap_or_else(|e| e.into_inner())
}

/// (CTL1117A · S1) Una sola apertura de sesión a la vez: dos `abrir-sesion` seguidas (la Mac con dos ventanas, un
/// reintento) ya no ponen dos indicadores a la vez ni se pisan el identificador del indicador. La segunda espera a la
/// primera y, si es el mismo controlador con la sesión viva, la reutiliza.
static APERTURA: Mutex<()> = Mutex::new(());

fn cerrojo_apertura() -> MutexGuard<'static, ()> {
    APERTURA.lock().unwrap_or_else(|e| e.into_inner())
}

/// ¿Hay una apertura en curso ahora mismo? (se mira sin esperar)
#[cfg(target_os = "android")]
fn apertura_en_curso() -> bool {
    matches!(APERTURA.try_lock(), Err(std::sync::TryLockError::WouldBlock))
}

pub(crate) fn mono_ms() -> u64 {
    static A: OnceLock<Instant> = OnceLock::new();
    A.get_or_init(Instant::now).elapsed().as_millis() as u64
}

fn pared_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

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
        h.write_u64(pared_ms());
        h.write_u64(mono_ms());
        *p = h.finish();
    }
    format!("{:016x}{:016x}", partes[0], partes[1])
}

#[derive(Serialize, Clone)]
pub struct EstadoControl {
    /// ¿Este aparato puede enseñar el indicador nativo? Sin él no hay control.
    pub indicador_posible: bool,
    pub activa: bool,
    pub de: Option<String>,
    pub nombre: Option<String>,
    pub nivel: Option<String>,
    pub desde: Option<String>,
    pub ultima_parada: Option<String>,
    pub ultima_parada_motivo: Option<String>,
    pub registro_integro: Option<bool>,
    /// (ORD1114T) Pausada por una acción local; la reanuda la persona desde el indicador.
    pub pausada: bool,
    /// (ORD1114T) Lo que falta para poder enseñar el indicador aquí, en palabras cortas.
    pub falta: Vec<String>,
    /// (ORD1114T) Primera línea rota del registro encadenado (None si está íntegro o no existe).
    pub registro_roto_en: Option<usize>,
    /// (ORD1114V) El interruptor nativo «dejar que me controlen» de este aparato.
    pub interruptor: bool,
    /// (IND1115F) El último «sin-indicador-nativo» de este aparato con lo que faltaba y en qué paso quedó.
    pub ultimo_rechazo: Option<UltimoRechazo>,
}

/// (IND1115F) Por qué la última sesión se negó por falta de indicador (para el panel del aparato controlado).
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct UltimoRechazo {
    pub hace_ms: u64,
    pub falta: Vec<String>,
    pub paso: String,
    pub error: String,
    pub tras_ms: u64,
}

static ULTIMO_RECHAZO: Mutex<Option<(u64, UltimoRechazo)>> = Mutex::new(None);

#[allow(dead_code)] // IND1115F: lo usa el borde Android
fn guardar_rechazo(falta: Vec<String>, paso: &str, error: &str, tras_ms: u64) {
    let r = UltimoRechazo { hace_ms: 0, falta, paso: paso.into(), error: error.into(), tras_ms };
    *ULTIMO_RECHAZO.lock().unwrap_or_else(|e| e.into_inner()) = Some((mono_ms(), r));
}

fn ultimo_rechazo() -> Option<UltimoRechazo> {
    ULTIMO_RECHAZO.lock().unwrap_or_else(|e| e.into_inner()).clone().map(|(t, mut r)| {
        r.hace_ms = mono_ms().saturating_sub(t);
        r
    })
}

fn estado(app: &AppHandle) -> EstadoControl {
    let posible = indicador_posible(app);
    let int_encendido = interruptor(app).encendido;
    let mut falta = if posible { Vec::new() } else { falta_indicador(app) };
    if !int_encendido && !falta.iter().any(|f| f == "interruptor") {
        falta.push("interruptor".into());
    }
    let roto = ruta_registro(app).and_then(|r| std::fs::read_to_string(r).ok()).and_then(|t| l::verificar_registro(&t).err());
    let c = control();
    let s = c.activa();
    EstadoControl {
        indicador_posible: posible,
        pausada: c.pausada(),
        falta,
        registro_roto_en: roto,
        interruptor: int_encendido,
        ultimo_rechazo: ultimo_rechazo(),
        activa: s.is_some(),
        de: s.map(|s| s.de.chars().take(8).collect()),
        nombre: s.map(|s| s.nombre.clone()),
        nivel: s.map(|s| s.nivel.clone()),
        desde: s.map(|s| crate::ble::iso_utc(pared_ms().saturating_sub(mono_ms().saturating_sub(s.inicio_ms)))),
        ultima_parada: c.ultima_parada.as_ref().map(|(t, _)| crate::ble::iso_utc(pared_ms().saturating_sub(mono_ms().saturating_sub(*t)))),
        ultima_parada_motivo: c.ultima_parada.as_ref().map(|(_, m)| m.clone()),
        registro_integro: ruta_registro(app).and_then(|r| std::fs::read_to_string(r).ok()).map(|t| l::verificar_registro(&t).is_ok()),
    }
}

/// La página que pide algo: ventana principal y StarSeed OS. (El origen lo acota la capability.)
fn exigir_pagina(app: &AppHandle, webview: &tauri::Webview) -> Result<(), String> {
    if !crate::nativa::es_starseed_os(app) || webview.label() != "main" {
        return Err("no-aplica".into());
    }
    // FSG1116 · M5: en Android los comandos del control solo los da la página de StarSeed OS publicada o el servidor
    // local que ESTA app sirve en ese momento; otra cosa que escuche en 127.0.0.1:4761x no los tiene.
    #[cfg(target_os = "android")]
    {
        let url = webview.url().map(|u| u.to_string()).unwrap_or_default();
        #[cfg(starseed_servidor_android)]
        let puerto = crate::servidor_local_android::puerto_sirviendo();
        #[cfg(not(starseed_servidor_android))]
        let puerto: Option<u16> = None;
        if !l::origen_de_control_ok(&url, puerto) {
            return Err("no-aplica".into());
        }
    }
    Ok(())
}

// ─────────────────────────── Comandos ───────────────────────────

/// Abre la sesión de control (la pide la página al aceptar «abrir-sesion»). Pone el indicador ANTES de
/// abrirla; si no puede, no hay sesión. Devuelve el token que la página pondrá en cada orden.
/// IND1115F: en Android el comando es `async` (corre en el grupo de hilos de Tauri, no en el hilo que atiende la
/// página) porque espera hasta 4 s el latido de Kotlin; un comando síncrono bloquearía ese hilo todo ese tiempo.
/// El rechazo por falta de indicador lleva el detalle tras el código: «sin-indicador-nativo falta=… paso=… tras=…».
#[cfg_attr(target_os = "android", tauri::command(async))]
#[cfg_attr(not(target_os = "android"), tauri::command)]
pub fn control_neuronas_abrir(app: AppHandle, webview: tauri::Webview, de: String, nombre: String, nivel: String, sobre: Option<serde_json::Value>) -> Result<String, String> {
    exigir_pagina(&app, &webview)?;
    let _una_a_la_vez = cerrojo_apertura(); // CTL1117A · S1
    // FSG1116 · A2: en Android la sesión (y con ella la pantalla y los cuadros) solo la abre la orden firmada
    // `abrir-sesion` de un controlador que la persona aceptó en el diálogo nativo, comprobada AQUÍ como la entrada.
    // El `de` y el NOMBRE del indicador salen de `aceptados.json`, nunca de lo que diga la página.
    #[cfg(target_os = "android")]
    let (de, nombre, nivel, color) = match apertura_nativa(&app, sobre.as_ref(), &nivel) {
        Ok(a) => (a.de, a.nombre, a.nivel, a.color),
        Err(m) => {
            anotar(&app, "sesion-rechazada", &format!("de=- motivo={m}"));
            return Err(m.into());
        }
    };
    #[cfg(not(target_os = "android"))]
    let color = crate::control_ajustes::color_por_defecto(&de); // CTL1117H: sin entrada nativa no hay color firmado
    #[cfg(not(target_os = "android"))]
    let _ = &sobre; // escritorio: sin entrada ni pantalla nativas (`sin-soporte`); ver contrato §12.3
    // ORD1114T: una cadena rota se DETECTA y queda dicha en la propia cadena (y en el estado); no se tapa.
    if let Some(n) = ruta_registro(&app).and_then(|r| std::fs::read_to_string(r).ok()).and_then(|t| l::verificar_registro(&t).err()) {
        anotar(&app, "registro-roto", &format!("primera-linea-rota={n}"));
    }
    // ORD1114V: primero el interruptor NATIVO de este aparato (§1 caso A punto 1); la página no lo puede encender.
    let int = interruptor(&app);
    // CTL1117A · S1/S4: con la sesión viva del MISMO controlador y su indicador a la vista, abrir otra vez es la misma
    // sesión (mismo token, mismo indicador). Antes cada apertura repetida ponía otro indicador, pisaba el identificador
    // del anterior y, si Kotlin no atendía a tiempo, quitaba el indicador de la sesión que sí funcionaba.
    if let Some(m) = control().negada_por_la_viva(&de, mono_ms()) {
        anotar(&app, "sesion-rechazada", &format!("de={} motivo={}", de.chars().take(8).collect::<String>(), m.codigo()));
        return Err(m.codigo().into());
    }
    if int.encendido {
        let a_la_vista = indicador_visible(&app);
        let ya = control().reutilizar(&de, &nivel, mono_ms(), a_la_vista).map(|s| (s.token.clone(), s.de.chars().take(8).collect::<String>(), s.nivel.clone()));
        if let Some((token, de8, nivel)) = ya {
            anotar(&app, "sesion-reutilizada", &format!("de={de8} nivel={nivel}"));
            return Ok(token);
        }
    }
    let posible = indicador_posible(&app);
    if !posible && cfg!(target_os = "android") {
        // ORD1114T: en Android se PIDE a Kotlin el diálogo nativo (la persona decide allí; nada se enciende solo).
        pedir_preparar(&app);
    }
    // IND1115F: con el detalle de por qué no (solo Android lo tiene; en el resto queda vacío).
    let mut detalle = String::new();
    let visible = int.encendido
        && if posible {
            match poner_indicador(&app, &l::nombre_limpio(&nombre), &color, &nivel) {
                Ok(()) => true,
                Err(d) => {
                    detalle = d;
                    false
                }
            }
        } else {
            detalle = detalle_sin_permisos(&app);
            false
        };
    let token = token_nuevo();
    let r = control().abrir_con_interruptor(&int, &token, &de, &nombre, &nivel, mono_ms(), visible).map(|s| (s.de.chars().take(8).collect::<String>(), s.nivel.clone()));
    match r {
        Ok((de8, nivel)) => {
            *ULTIMO_RECHAZO.lock().unwrap_or_else(|e| e.into_inner()) = None; // IND1115F: ya no hay nada que explicar
            anotar(&app, "sesion-abierta", &format!("de={de8} nivel={nivel}"));
            Ok(token)
        }
        Err(e) => {
            if control().activa().is_none() {
                quitar_indicador(&app);
            }
            let sin_indicador = e.codigo() == "sin-indicador-nativo" && !detalle.is_empty();
            anotar(
                &app,
                "sesion-rechazada",
                &format!("de={} motivo={}{}", de.chars().take(8).collect::<String>(), e.codigo(), if sin_indicador { format!(" {detalle}") } else { String::new() }),
            );
            Err(if sin_indicador { format!("{} {detalle}", e.codigo()) } else { e.codigo().into() })
        }
    }
}

/// Antes de ejecutar CADA orden. Sin sesión viva en Rust (parada, caducada, indicador perdido), no.
#[tauri::command]
pub fn control_neuronas_orden(app: AppHandle, webview: tauri::Webview, token: String, nombre: String) -> Result<(), String> {
    exigir_pagina(&app, &webview)?;
    sondear_plataforma(&app); // ORD1114T: lo que dijo Kotlin (terminar, pausa) manda antes de cada orden
    let visible = indicador_visible(&app);
    let r = control().orden(&token, &nombre, mono_ms(), visible).map(|s| s.de.chars().take(8).collect::<String>());
    match r {
        Ok(de8) => {
            anotar(&app, "orden", &format!("{nombre} de={de8} resultado=autorizada"));
            Ok(())
        }
        Err(e) => {
            anotar(&app, "orden", &format!("{nombre} resultado=rechazo:{}", e.codigo()));
            // CTL1117C · FALLO 3: «parada-nativa» dice POR QUÉ no hay sesión (caducada, sin-indicador, la persona…), no solo el código.
            let detalle = control().detalle_parada(e, mono_ms());
            if control().activa().is_none() {
                quitar_indicador(&app);
            }
            Err(match detalle {
                Some(d) if e.codigo() == "parada-nativa" => format!("parada-nativa {d}"),
                _ => e.codigo().into(),
            })
        }
    }
}

/// (CTL1117C · FALLO 3) Una línea en el registro de enlaces cuando una sesión acaba: el motivo REAL y lo que Kotlin dice del
/// indicador (edad del latido, si cree mostrar, si la app está detrás). Antes el fin solo quedaba en la cadena de Rust, y la
/// ventana de quien manda decía «Terminar» para cualquier parada. Sin contenido: motivos, números y sí/no.
fn nota_fin_sesion(app: &AppHandle, de8: &str, motivo: &str) {
    #[cfg(target_os = "android")]
    nota_fin_sesion_con(app, de8, motivo, crate::control_neuronas_android::es::estado(app).as_ref());
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        crate::ble::nota(None, "control-sesion", &l::linea_fin_sesion(de8, motivo, None));
    }
}

#[cfg(target_os = "android")]
fn nota_fin_sesion_con(_app: &AppHandle, de8: &str, motivo: &str, e: Option<&crate::control_neuronas_android::EstadoKotlin>) {
    let k = e.map(|e| l::DatosKotlin { latido_ms: pared_ms().saturating_sub(e.t_ms), mostrando: e.mostrando, en_fondo: e.en_fondo, medida: e.fondo.clone(), reanudos: e.reanudos, pausada: e.pausada, cuadro_ms: e.cuadro_ms });
    crate::ble::nota(None, "control-sesion", &l::linea_fin_sesion(de8, motivo, k.as_ref()));
}

/// (CTL1117C · FALLO 1) La página cuenta qué ve con la app detrás (`control-fondo …`); Rust le suma lo que sabe Kotlin. Solo con
/// sesión viva (sin sesión no se anota nada) y solo la página principal. Texto acotado y sin contenido.
#[tauri::command]
pub fn control_fondo_nota(app: AppHandle, webview: tauri::Webview, detalle: String) -> Result<(), String> {
    exigir_pagina(&app, &webview)?;
    if control().activa().is_none() {
        return Ok(());
    }
    #[cfg(target_os = "android")]
    let k = crate::control_neuronas_android::es::estado(&app).map(|e| l::DatosKotlin { latido_ms: pared_ms().saturating_sub(e.t_ms), mostrando: e.mostrando, en_fondo: e.en_fondo, medida: e.fondo.clone(), reanudos: e.reanudos, pausada: e.pausada, cuadro_ms: e.cuadro_ms });
    #[cfg(not(target_os = "android"))]
    let k: Option<l::DatosKotlin> = None;
    crate::ble::nota(None, "control-fondo", &l::linea_fondo(&detalle, k.as_ref()));
    Ok(())
}

/// (CTL1117H) Un cambio de ajustes locales queda en la cadena (sin contenido de órdenes).
pub(crate) fn nota_ajustes(app: &AppHandle, a: &crate::control_ajustes::Ajustes) {
    anotar(app, "ajustes", &format!("indicador={} ver-toques={}", a.indicador, if a.ver_toques { "si" } else { "no" }));
}

/// La puerta de la página rechazó una orden: Rust lo anota en la cadena (no concede nada).
#[tauri::command]
pub fn control_neuronas_anotar(app: AppHandle, webview: tauri::Webview, nombre: String, de: String, resultado: String) -> Result<(), String> {
    exigir_pagina(&app, &webview)?;
    let nombre = if l::nombre_orden_valido(&nombre) { nombre } else { "?".into() };
    let de: String = de.chars().filter(|c| c.is_ascii_hexdigit()).take(8).collect();
    let resultado: String = resultado.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == ':').take(40).collect();
    anotar(&app, "orden", &format!("{nombre} de={de} resultado={resultado}"));
    Ok(())
}

/// Parar desde la página (botón de la banda). Parar SIEMPRE se puede.
#[tauri::command]
pub fn control_neuronas_parar(app: AppHandle, motivo: String) -> EstadoControl {
    let m: String = motivo.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').take(30).collect();
    parar(&app, if m.is_empty() { "pagina" } else { &m });
    // ORD1114V: quitar el permiso en la página apaga también el interruptor nativo (apagar no pide nada).
    if l::motivo_apaga(&m) {
        apagar_interruptor(&app, &m);
    }
    estado(&app)
}

#[tauri::command]
pub fn control_neuronas_estado(app: AppHandle) -> EstadoControl {
    estado(&app)
}

/// (ORD1114T/ORD1114V) La persona enciende «dejar que me controlen» en ESTE aparato. La página solo PIDE el
/// diálogo; el interruptor lo enciende el «Sí» de un diálogo NATIVO que la página no puede pulsar:
/// escritorio, `tauri-plugin-dialog` como «Acceso al equipo» (acceso_equipo.rs); Android, el de Kotlin, que
/// después pide los permisos con los diálogos del sistema.
#[cfg(desktop)]
#[tauri::command]
pub async fn control_neuronas_preparar(app: AppHandle, webview: tauri::Webview, que: Option<String>) -> Result<EstadoControl, String> {
    exigir_pagina(&app, &webview)?;
    let _ = que; // IND1115F: el botón por cada cosa que falta solo existe en Android
    static PREGUNTANDO: AtomicBool = AtomicBool::new(false);
    let mut i = interruptor(&app);
    // Sin indicador posible (Windows/Linux) encenderlo no daría control: no se pregunta.
    if !i.encendido && indicador_posible(&app) && !PREGUNTANDO.swap(true, Ordering::SeqCst) {
        let texto = "¿Dejar que tus otras neuronas de la misma cuenta controlen este aparato?\n\n\
            Solo las que aceptes una a una. Mientras alguna lo controle verás un borde rojo, «● Controlada por …» en \
            la barra de menús y podrás terminar con ⌃⌥⌘. o desde ese menú; tocar el teclado o el ratón lo pausa. Cada \
            orden queda en el registro de este aparato. Puedes quitarlo cuando quieras."
            .to_string();
        let si = crate::acceso_equipo::dialogo(&app, "Control entre tus neuronas", texto, "Sí, dejar", "No").await;
        PREGUNTANDO.store(false, Ordering::SeqCst);
        if i.encender(si, pared_ms()) && guardar_interruptor(&app, &i) {
            anotar(&app, "interruptor-encendido", "la-persona-en-el-dialogo-nativo");
        } else if !si {
            anotar(&app, "interruptor-no", "la-persona-dijo-no-en-el-dialogo-nativo");
        }
    }
    Ok(estado(&app))
}

#[cfg(not(desktop))]
#[tauri::command]
pub fn control_neuronas_preparar(app: AppHandle, webview: tauri::Webview, que: Option<String>) -> Result<EstadoControl, String> {
    exigir_pagina(&app, &webview)?;
    // IND1115F: `que` = interruptor | notificaciones | superposicion: un botón del panel abre YA ese diálogo o esa
    // pantalla de Ajustes (sin esperar a la pausa de 10 min del aviso automático). Sin `que`, como antes.
    match que.as_deref() {
        Some(q) if crate::control_neuronas_android::PEDIDOS.contains(&q) => pedir_cosa(&app, q),
        _ => pedir_preparar(&app),
    }
    Ok(estado(&app))
}

// ─────────────────────────── Interruptor nativo (ORD1114V) ───────────────────────────

#[cfg(desktop)]
fn ruta_interruptor(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join(l::ARCHIVO_INTERRUPTOR))
}

/// Escritorio: archivo que solo escribe Rust (la página no tiene escritura de archivos, SEG1111U).
#[cfg(desktop)]
fn interruptor(app: &AppHandle) -> l::Interruptor {
    l::Interruptor::leer(ruta_interruptor(app).and_then(|r| std::fs::read_to_string(r).ok()).as_deref())
}

/// Android: lo guarda Kotlin, y solo con el «Sí» de su diálogo nativo.
#[cfg(target_os = "android")]
fn interruptor(app: &AppHandle) -> l::Interruptor {
    let e = crate::control_neuronas_android::es::estado(app);
    l::Interruptor { encendido: e.is_some_and(|e| e.encendido), desde_ms: 0 }
}

#[cfg(not(any(desktop, target_os = "android")))]
fn interruptor(_app: &AppHandle) -> l::Interruptor {
    l::Interruptor::default()
}

#[cfg(desktop)]
fn guardar_interruptor(app: &AppHandle, i: &l::Interruptor) -> bool {
    let Some(r) = ruta_interruptor(app) else { return false };
    if let Some(d) = r.parent() {
        let _ = std::fs::create_dir_all(d);
    }
    let tmp = r.with_extension("json.tmp");
    std::fs::write(&tmp, i.texto()).is_ok() && std::fs::rename(&tmp, &r).is_ok()
}

/// Apaga el interruptor nativo al instante, sin diálogo, y cierra la sesión que hubiera.
pub(crate) fn apagar_interruptor(app: &AppHandle, motivo: &str) {
    parar(app, motivo);
    #[cfg(desktop)]
    {
        let mut i = interruptor(app);
        if i.apagar() || ruta_interruptor(app).is_some_and(|r| r.exists()) {
            let _ = guardar_interruptor(app, &i);
            anotar(app, "interruptor-apagado", motivo);
        }
    }
    #[cfg(target_os = "android")]
    {
        let _ = crate::control_neuronas_android::es::pedir(app, "apagar", "", "");
        anotar(app, "interruptor-apagado", motivo);
    }
}

/// (ORD1114T) Pausa local (macOS: tecla/ratón; Android: toque fuera de la pastilla). Devuelve si pausó.
#[allow(dead_code)] // ORD1114T: lo usan macOS y Android, no Windows/Linux
pub(crate) fn pausa_local(app: &AppHandle, entrada_ms: u64) {
    let pauso = control().entrada_local(entrada_ms);
    if pauso {
        anotar(app, "pausa-local", "una accion local pauso el control");
        marcar_pausa_indicador(app, true);
        let _ = app.emit(EVENTO_PAUSA, serde_json::json!({ "pausada": true }));
    }
}

/// (ORD1114T) Para el vigía de entrada local: ¿hay sesión y no está ya en pausa?
#[allow(dead_code)]
pub(crate) fn sesion_viva_sin_pausa() -> bool {
    let c = control();
    c.activa().is_some() && !c.pausada()
}

/// (ORD1114T) Solo desde el indicador nativo.
#[allow(dead_code)] // ORD1114T: lo usan macOS y Android, no Windows/Linux
pub(crate) fn reanudar(app: &AppHandle, desde: &str) {
    if control().reanudar(mono_ms()) {
        anotar(app, "reanudada", desde);
        marcar_pausa_indicador(app, false);
        let _ = app.emit(EVENTO_PAUSA, serde_json::json!({ "pausada": false }));
    }
}

/// Cierra la sesión en Rust, quita el indicador, lo anota y avisa a la página (si vive).
pub fn parar(app: &AppHandle, motivo: &str) {
    let s = control().parar(mono_ms(), motivo);
    quitar_indicador(app);
    if let Some(s) = s {
        anotar(app, "sesion-parada", &format!("de={} motivo={motivo}", s.de.chars().take(8).collect::<String>()));
        nota_fin_sesion(app, &s.de.chars().take(8).collect::<String>(), motivo); // CTL1117C
        let _ = app.emit(EVENTO_PARADA, serde_json::json!({ "motivo": motivo }));
    }
}

/// Vigía de caducidad (1 h, 2 min sin órdenes) e indicador perdido. Una vez por proceso.
pub fn iniciar(app: &AppHandle) {
    static EN_MARCHA: AtomicBool = AtomicBool::new(false);
    if EN_MARCHA.swap(true, Ordering::SeqCst) {
        return;
    }
    let _ = APP.set(app.clone()); // ORD1114T
    #[cfg(target_os = "macos")]
    crate::control_neuronas_macos::vigilar_entrada_local(app); // ORD1114T: tecla/ratón local → pausa
    let h = app.clone();
    #[cfg(target_os = "android")]
    let mut huerfano = 0u32;
    #[cfg(target_os = "android")]
    let (mut ult_pared, mut ult_mono, mut tics) = (pared_ms(), mono_ms(), 0u32);
    let _ = std::thread::Builder::new().name("starseed-control-neuronas".into()).spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(1));
        #[cfg(target_os = "android")]
        {
            // CTL1117G: un hueco de más de 5 s entre dos tics = el proceso estuvo parado; se anota con la hora REAL en cuanto vuelve, y un pulso cada 30 s.
            let (p, m) = (pared_ms(), mono_ms());
            if control().activa().is_some() {
                if let Some(t) = l::linea_hueco(p.saturating_sub(ult_pared), m.saturating_sub(ult_mono)) {
                    crate::ble::nota(None, "control-pulso", &t);
                }
                tics += 1;
                if tics % 30 == 0 {
                    if let Some(k) = crate::control_neuronas_android::es::estado(&h) {
                        crate::ble::nota(None, "control-pulso", &format!("pulso latido-ms={} pausa={} cuadro-ms={} fondo={} indicador={} toques={}", p.saturating_sub(k.t_ms).min(9_999_999), if k.pausada { "si" } else { "no" }, k.cuadro_ms.clamp(-1, 9_999_999), if k.en_fondo { "si" } else { "no" }, if crate::control_ajustes::actuales(&h).indicador == "oculto" { "oculto" } else { "punto" }, if crate::control_ajustes::actuales(&h).ver_toques { "si" } else { "no" }));
                    }
                }
            }
            ult_pared = p;
            ult_mono = m;
        }
        #[cfg(target_os = "android")]
        quitar_indicador_huerfano(&h, &mut huerfano); // CTL1117A · S7
        let activa = control().activa().is_some();
        if !activa {
            continue;
        }
        sondear_plataforma(&h); // ORD1114T
        if control().activa().is_none() {
            continue;
        }
        if !indicador_visible(&h) {
            parar(&h, "sin-indicador");
            continue;
        }
        let cerrada = control().caducar(mono_ms());
        if let Some(s) = cerrada {
            quitar_indicador(&h);
            anotar(&h, "sesion-parada", &format!("de={} motivo=caducada", s.de.chars().take(8).collect::<String>()));
            nota_fin_sesion(&h, &s.de.chars().take(8).collect::<String>(), "caducada"); // CTL1117C
            let _ = h.emit(EVENTO_PARADA, serde_json::json!({ "motivo": "caducada" }));
        }
    });
}

// ─────────────────────────── Indicador ───────────────────────────
// (ORD1114T) Solo donde se cumple TODO §2.4 hay indicador posible: macOS (barra + borde + atajo + pausa local)
// y Android (notificación en curso + superposición + pausa por toque). En el resto, no.

#[cfg(target_os = "macos")]
fn indicador_posible(app: &AppHandle) -> bool {
    crate::nativa::es_starseed_os(app) && crate::segundo_plano::bandeja_posible()
}

#[cfg(target_os = "android")]
fn indicador_posible(app: &AppHandle) -> bool {
    crate::nativa::es_starseed_os(app) && crate::control_neuronas_android::posible(crate::control_neuronas_android::es::estado(app).as_ref())
}

#[cfg(not(any(target_os = "macos", target_os = "android")))]
fn indicador_posible(_app: &AppHandle) -> bool {
    false
}

#[cfg(target_os = "android")]
fn falta_indicador(app: &AppHandle) -> Vec<String> {
    match crate::control_neuronas_android::es::estado(app) {
        Some(e) if !e.falta.is_empty() => e.falta,
        Some(_) => vec!["indicador".into()],
        None => vec!["sin-parte-android".into()],
    }
}

#[cfg(not(target_os = "android"))]
fn falta_indicador(app: &AppHandle) -> Vec<String> {
    if cfg!(target_os = "macos") {
        if crate::nativa::es_starseed_os(app) { vec!["bandeja".into()] } else { vec!["no-aplica".into()] }
    } else {
        // Windows/Linux/iOS: sin borde siempre encima, atajo global y pausa local en Rust (§2.4).
        vec!["plataforma-sin-borde-atajo-ni-pausa".into()]
    }
}

/// (CTL1117A · S7) El marco «Controlada por…» no puede seguir a la vista sin sesión: si Kotlin lo enseña y Rust no tiene
/// sesión (una apertura que falló a medias, un identificador pisado), a los 3 s seguidos se le pide quitarlo con SU
/// identificador. No toca nada mientras haya una apertura en curso (el indicador se pone antes de abrir la sesión).
#[cfg(target_os = "android")]
fn quitar_indicador_huerfano(app: &AppHandle, tics: &mut u32) {
    use crate::control_neuronas_android as a;
    let e = a::es::estado(app);
    let sin_sesion = control().activa().is_none();
    let sesion = e.as_ref().filter(|e| e.mostrando).and_then(|e| e.sesion.clone());
    let Some(id) = sesion.filter(|_| sin_sesion && !apertura_en_curso()) else {
        *tics = 0;
        return;
    };
    *tics += 1;
    if *tics >= 3 {
        *tics = 0;
        let _ = a::es::pedir(app, "quitar", &id, "");
        anotar(app, "indicador-huerfano", "quitado-sin-sesion");
    }
}

/// Android: id de la sesión del indicador que Kotlin enseña (no es el token de las órdenes).
#[cfg(target_os = "android")]
fn sesion_indicador() -> MutexGuard<'static, Option<String>> {
    static S: OnceLock<Mutex<Option<String>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(None)).lock().unwrap_or_else(|e| e.into_inner())
}

#[cfg(target_os = "macos")]
fn indicador_visible(app: &AppHandle) -> bool {
    app.tray_by_id(ID_BANDEJA).is_some() && crate::control_neuronas_macos::borde_visible()
}

#[cfg(target_os = "android")]
fn indicador_visible(app: &AppHandle) -> bool {
    let Some(id) = sesion_indicador().clone() else { return false };
    crate::control_neuronas_android::visible(crate::control_neuronas_android::es::estado(app).as_ref(), &id, pared_ms())
}

#[cfg(not(any(target_os = "macos", target_os = "android")))]
fn indicador_visible(_app: &AppHandle) -> bool {
    false
}

/// Lo que dijo la plataforma desde la última vez (Android: terminar/pausa/reanudar de Kotlin). Sin página.
#[cfg(target_os = "android")]
fn sondear_plataforma(app: &AppHandle) {
    use crate::control_neuronas_android::{self as a, Cambio};
    let Some(id) = sesion_indicador().clone() else { return };
    let e = a::es::estado(app);
    let antes = control().activa().map(|s| s.de.chars().take(8).collect::<String>());
    let cambio = a::sincronizar(&mut control(), e.as_ref(), &id, pared_ms(), mono_ms());
    // CTL1117F: la pausa local se anota AQUÍ (el vigía de Rust, sin la página) con su motivo y el tiempo REAL de la tableta.
    static PAUSAS_VISTAS: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(u32::MAX);
    if let Some(ek) = e.as_ref() {
        let d = l::DatosPausa { pausada: ek.pausada, pausas: ek.pausas, motivo: ek.pausa_motivo.clone(), desde_gesto_ms: ek.pausa_desde_gesto_ms, reanuda: ek.reanuda_motivo.clone(), pausa_ms: ek.pausa_ms, ignorados: ek.ignorados };
        let antes_vistas = PAUSAS_VISTAS.swap(ek.pausas, Ordering::SeqCst);
        let vistas = if antes_vistas == u32::MAX { ek.pausas.saturating_sub(u32::from(cambio == Cambio::Pausada)) } else { antes_vistas }; // primer sondeo: lo anterior no es de esta sesión
        for linea in l::lineas_pausa(vistas, cambio == Cambio::Pausada, cambio == Cambio::Reanudada, &d) {
            crate::ble::nota(None, "control-pausa", &linea);
        }
    }
    // CTL1117G: el aviso fijo repuesto (descartado/ausente), con su error si lo hubo; no termina nada.
    static AVISOS_VISTOS: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(u32::MAX);
    if let Some(ek) = e.as_ref() {
        let antes = AVISOS_VISTOS.swap(ek.avisos, Ordering::SeqCst);
        if antes != u32::MAX && ek.avisos > antes {
            crate::ble::nota(None, "control-aviso", &l::linea_aviso(&ek.aviso_motivo, ek.avisos, &ek.aviso_error, ek.notificaciones));
        }
    }
    match cambio {
        Cambio::Parar(m) => {
            quitar_indicador(app);
            anotar(app, "sesion-parada", &format!("de={} motivo={m}", antes.clone().unwrap_or_default()));
            nota_fin_sesion_con(app, &antes.unwrap_or_default(), &m, e.as_ref()); // CTL1117C
            let _ = app.emit(EVENTO_PARADA, serde_json::json!({ "motivo": m }));
        }
        Cambio::Pausada => {
            anotar(app, "pausa-local", "un toque local pauso el control");
            let _ = app.emit(EVENTO_PAUSA, serde_json::json!({ "pausada": true }));
        }
        Cambio::Reanudada => {
            anotar(app, "reanudada", "la-persona-desde-la-notificacion");
            let _ = app.emit(EVENTO_PAUSA, serde_json::json!({ "pausada": false }));
        }
        Cambio::Nada => {}
    }
}

#[cfg(not(target_os = "android"))]
fn sondear_plataforma(_app: &AppHandle) {}

#[cfg(target_os = "android")]
fn pedir_preparar(app: &AppHandle) {
    let _ = crate::control_neuronas_android::es::pedir(app, "preparar", "", "");
}

#[cfg(not(target_os = "android"))]
fn pedir_preparar(_app: &AppHandle) {}

/// (IND1115F) Una cosa concreta de las que faltan, desde su botón: Kotlin abre el diálogo o la pantalla de Ajustes.
#[cfg(target_os = "android")]
fn pedir_cosa(app: &AppHandle, que: &str) {
    let _ = crate::control_neuronas_android::es::pedir(app, &format!("pedir-{que}"), "", "");
    anotar(app, "pedido-desde-el-panel", que);
}

#[cfg(not(target_os = "android"))]
#[allow(dead_code)]
fn pedir_cosa(_app: &AppHandle, _que: &str) {}

/// (IND1115F) Sin los permisos no se intenta nada: se dice cuáles faltan (y queda para el panel y el registro).
#[cfg(target_os = "android")]
fn detalle_sin_permisos(app: &AppHandle) -> String {
    use crate::control_neuronas_android as a;
    let e = a::es::estado(app);
    let r = a::espera_sin_permisos(e.as_ref());
    guardar_rechazo(r.falta.clone(), &r.paso, "", 0);
    diagnostico(&r, "permisos");
    a::detalle_rechazo(&r)
}

#[cfg(not(target_os = "android"))]
fn detalle_sin_permisos(_app: &AppHandle) -> String {
    String::new()
}

/// (IND1115F) La línea nativa de cada intento, en el mismo registro que se espeja a la otra neurona.
#[cfg(target_os = "android")]
fn diagnostico(r: &crate::control_neuronas_android::Espera, pedir: &str) {
    let hilo = std::thread::current().name().unwrap_or("sin-nombre").to_string();
    crate::ble::nota(None, "control-indicador", &crate::control_neuronas_android::linea_diagnostico(pedir, &hilo, r));
}

#[cfg(desktop)]
#[allow(dead_code)] // ORD1114T: lo usan macOS y Android, no Windows/Linux
fn marcar_pausa_indicador(app: &AppHandle, pausada: bool) {
    if let Some(t) = app.tray_by_id(ID_BANDEJA) {
        let nombre = control().activa().map(|s| s.nombre.clone()).unwrap_or_default();
        let _ = t.set_title(Some(if pausada { "‖ Control en pausa · menú para reanudar".to_string() } else { format!("● Controlada por {nombre}") }));
    }
}

#[cfg(not(desktop))]
fn marcar_pausa_indicador(_app: &AppHandle, _pausada: bool) {}

#[cfg(target_os = "macos")]
fn poner_indicador(app: &AppHandle, nombre: &str, _color: &str, _nivel: &str) -> Result<(), String> {
    poner_bandeja(app, nombre).map_err(|e| e.to_string())?;
    // Borde siempre encima y atajo global: sin cualquiera de los dos, no hay indicador completo (§2.4).
    if !crate::control_neuronas_macos::poner_borde(app, nombre) || !crate::control_neuronas_macos::registrar_atajo(app) {
        quitar_indicador(app);
        return Err("indicador-incompleto".into());
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn poner_bandeja(app: &AppHandle, nombre: &str) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
    use tauri::tray::TrayIconBuilder;
    if app.tray_by_id(ID_BANDEJA).is_none() {
        let info = MenuItem::with_id(app, "ss-control-info", format!("{nombre} manda órdenes a esta neurona"), false, None::<&str>)?;
        let nota = MenuItem::with_id(app, "ss-control-nota", "Cada orden queda en el registro de este aparato", false, None::<&str>)?;
        let atajo = MenuItem::with_id(app, "ss-control-atajo", "⌃⌥⌘. termina · tocar el teclado o el ratón pausa", false, None::<&str>)?;
        let sep = PredefinedMenuItem::separator(app)?;
        let reanudar_i = MenuItem::with_id(app, MENU_REANUDAR, "Reanudar el control", true, None::<&str>)?;
        let terminar = MenuItem::with_id(app, MENU_TERMINAR, "Terminar el control ahora", true, None::<&str>)?;
        let quitar = MenuItem::with_id(app, MENU_QUITAR, "Terminar y quitar el permiso", true, None::<&str>)?; // ORD1114V
        let menu = Menu::with_items(app, &[&info, &nota, &atajo, &sep, &reanudar_i, &terminar, &quitar])?;
        let mut b = TrayIconBuilder::with_id(ID_BANDEJA)
            .menu(&menu)
            .tooltip("Otra neurona de tu cuenta controla esta (StarSeed OS)")
            .title(format!("● Controlada por {nombre}"))
            .show_menu_on_left_click(true)
            // Atendido en Rust: aunque la página esté colgada o comprometida, terminar funciona.
            .on_menu_event(|app, ev| match ev.id().as_ref() {
                MENU_TERMINAR => parar(app, "la-persona-desde-el-indicador"),
                MENU_REANUDAR => reanudar(app, "la-persona-desde-el-indicador"),
                MENU_QUITAR => apagar_interruptor(app, "la-persona-quito-el-permiso"),
                _ => {}
            });
        if let Some(icono) = app.default_window_icon() {
            b = b.icon(icono.clone());
        }
        b.build(app)?;
    } else if let Some(t) = app.tray_by_id(ID_BANDEJA) {
        let _ = t.set_title(Some(format!("● Controlada por {nombre}")));
    }
    Ok(())
}

#[cfg(target_os = "android")]
fn poner_indicador(app: &AppHandle, nombre: &str, color: &str, nivel: &str) -> Result<(), String> {
    use crate::control_neuronas_android as a;
    let id = token_nuevo();
    *sesion_indicador() = Some(id.clone());
    if !a::es::pedir_mostrar(app, &id, nombre, color, nivel) {
        *sesion_indicador() = None;
        let r = a::Espera { paso: "peticion-no-escrita".into(), falta: a::es::estado(app).map(|e| e.falta).unwrap_or_default(), ..Default::default() };
        guardar_rechazo(r.falta.clone(), &r.paso, "", 0);
        diagnostico(&r, "mostrar");
        return Err(a::detalle_rechazo(&r));
    }
    // Kotlin confirma con su latido: hasta 4 s (arrancar el servicio y poner la superposición), y antes si dice
    // que no pudo. Aquí se duerme el hilo de este comando; Kotlin trabaja en el suyo (IND1115F).
    let r = a::esperar(&id, 4_000, 100, || a::es::estado(app), |ms| std::thread::sleep(std::time::Duration::from_millis(ms)), pared_ms);
    diagnostico(&r, "mostrar");
    if r.visible {
        return Ok(());
    }
    guardar_rechazo(r.falta.clone(), &r.paso, &r.error, r.tras_ms);
    quitar_indicador(app);
    Err(a::detalle_rechazo(&r))
}

#[cfg(not(any(target_os = "macos", target_os = "android")))]
fn poner_indicador(_app: &AppHandle, _nombre: &str, _color: &str, _nivel: &str) -> Result<(), String> {
    Err("sin-indicador-nativo".into())
}

#[cfg(desktop)]
fn quitar_indicador(app: &AppHandle) {
    let _ = app.remove_tray_by_id(ID_BANDEJA);
    #[cfg(target_os = "macos")]
    {
        crate::control_neuronas_macos::quitar_borde(app);
        crate::control_neuronas_macos::quitar_atajo(app);
    }
}

#[cfg(target_os = "android")]
fn quitar_indicador(app: &AppHandle) {
    crate::control_entrada::al_cerrar(app); // AND1115K: líneas de fin de sesión y parada de pantalla/entrada
    if let Some(id) = sesion_indicador().take() {
        let _ = crate::control_neuronas_android::es::pedir(app, "quitar", &id, "");
    }
}

#[cfg(not(any(desktop, target_os = "android")))]
fn quitar_indicador(_app: &AppHandle) {}

// ─────────────────────────── Registro ───────────────────────────

fn ruta_registro(app: &AppHandle) -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        let _ = app;
        std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Library/Logs/app.starseed.os").join(l::REGISTRO))
    }
    #[cfg(not(target_os = "macos"))]
    {
        app.path().app_data_dir().ok().map(|d| d.join(l::REGISTRO))
    }
}

fn anotar(app: &AppHandle, evento: &str, detalle: &str) {
    let Some(ruta) = ruta_registro(app) else { return };
    let _c = cerrojo_registro();
    if let Some(d) = ruta.parent() {
        let _ = std::fs::create_dir_all(d);
    }
    let anterior = std::fs::read_to_string(&ruta).map(|t| l::ultimo_hash(&t)).unwrap_or_else(|_| l::INICIO_CADENA.to_string());
    let linea = l::linea_registro(&anterior, &crate::ble::iso_utc(pared_ms()), evento, detalle);
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&ruta) {
        let _ = writeln!(f, "{linea}");
    }
}

// ─────────────────────────── AND1115K: la puerta de la entrada y la pantalla ───────────────────────────
// Lo que `control_entrada.rs` y `control_pantalla.rs` piden a la sesión de aquí (que es privada de este módulo).

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum ModoPuerta {
    /// Solo mira (¿sesión viva con indicador a la vista?): no renueva la inactividad.
    Lectura,
    /// Cuenta como actividad, también en pausa local (la pantalla se sigue viendo).
    Actividad,
    /// Una orden de entrada: cuenta como actividad y se rechaza con `pausa-local` si hay pausa.
    Orden,
}

/// FSG1116 · A2: comprueba la `abrir-sesion` firmada contra `aceptados.json` (lo escribe solo Kotlin con el «Sí»
/// del diálogo nativo). Las aperturas vistas no se olvidan al cerrar una sesión: una vieja no abre otra.
#[cfg(target_os = "android")]
fn apertura_nativa(app: &AppHandle, sobre: Option<&serde_json::Value>, nivel_pagina: &str) -> Result<crate::control_entrada_logica::Apertura, &'static str> {
    use crate::control_entrada_logica as e;
    static VISTAS: OnceLock<Mutex<e::Vistos>> = OnceLock::new();
    let sobre = sobre.ok_or("no-autorizado")?;
    let aceptados = crate::control_entrada::es::leer(app, crate::control_entrada::ACEPTADOS).map(|t| e::leer_aceptados(&t)).unwrap_or_default();
    let ahora = pared_ms() as i64;
    let mut v = VISTAS.get_or_init(|| Mutex::new(e::Vistos::default())).lock().unwrap_or_else(|x| x.into_inner());
    e::verificar_apertura(sobre, &aceptados, nivel_pagina, ahora, &mut v).map_err(|(m, _)| m.codigo())
}

#[allow(dead_code)] // FSG1116: lo usan la entrada y la pantalla de Android
/// FSG1116 · B1: la huella del controlador de la sesión `token` (la que comprobó la apertura firmada).
pub(crate) fn de_de_sesion(token: &str) -> Option<String> {
    control().valida(token).ok().map(|s| s.de.clone())
}

#[allow(dead_code)] // FSG1116: lo usa la pantalla de Android
/// FSG1116 · M2: ¿la sesión `token` está en pausa local? (en pausa no salen cuadros).
pub(crate) fn sesion_pausada(token: &str) -> bool {
    control().valida(token).map(|s| s.pausada_ms.is_some()).unwrap_or(true)
}

/// La página de StarSeed OS, ventana principal.
pub(crate) fn pagina_ok(app: &AppHandle, webview: &tauri::Webview) -> Result<(), String> {
    exigir_pagina(app, webview)
}

/// Mira la sesión `token` con lo último que dijo Kotlin. Devuelve su nivel («ver»/«controlar») o el motivo.
pub(crate) fn puerta_sesion(app: &AppHandle, token: &str, modo: ModoPuerta) -> Result<String, &'static str> {
    sondear_plataforma(app);
    let visible = indicador_visible(app);
    let r = {
        let mut c = control();
        if !visible && c.activa().is_some() {
            Err("sin-indicador")
        } else {
            match modo {
                ModoPuerta::Lectura => c.valida(token).map(|s| s.nivel.clone()).map_err(|_| "sesion"),
                ModoPuerta::Actividad => match c.orden(token, "pantalla", mono_ms(), visible) {
                    Ok(s) => Ok(s.nivel.clone()),
                    Err(l::Rechazo::Pausada) => c.valida(token).map(|s| s.nivel.clone()).map_err(|_| "sesion"),
                    Err(_) => Err("sesion"),
                },
                ModoPuerta::Orden => match c.orden(token, "entrada", mono_ms(), visible) {
                    Ok(s) => Ok(s.nivel.clone()),
                    Err(l::Rechazo::Pausada) => Err("pausa-local"),
                    Err(_) => Err("sesion"),
                },
            }
        }
    };
    if r == Err("sin-indicador") {
        parar(app, "sin-indicador");
        return Err("sesion");
    }
    if control().activa().is_none() {
        quitar_indicador(app);
    }
    r
}

/// Una línea en el registro encadenado (nombre del evento y detalle corto: nunca contenido).
pub(crate) fn anotar_k(app: &AppHandle, evento: &str, detalle: &str) {
    anotar(app, evento, detalle);
}

pub(crate) fn mono_k() -> u64 {
    mono_ms()
}

pub(crate) fn pared_k() -> u64 {
    pared_ms()
}
