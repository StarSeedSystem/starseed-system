// ═══════════════════════════════════════════════════════════════════════════
// StarSeed Native — Librería de la app Tauri 2 (cuerpo nativo de OS / Nexus / Café)
// ---------------------------------------------------------------------------
// TODA la lógica vive aquí (patrón oficial Tauri 2 para escritorio + móvil):
//   · Escritorio: src/main.rs llama a `starseed_native_lib::run()`.
//   · Android/iOS: el proyecto generado por `cargo tauri android|ios init`
//     carga este crate como librería (staticlib/cdylib) y entra por
//     `tauri::mobile_entry_point` — por eso el target [lib] es OBLIGATORIO.
//
// Esta app NO trae la web embebida: carga la web desplegada (ver la propiedad
// `url` de la ventana en tauri.conf.json) y le añade el "cuerpo" nativo:
//   · Actualización incremental DENTRO de la app (updater de Tauri, sin reinstalar).
//   · Control por terminal / procesos del dispositivo (el "compañero profundo"
//     que Aurora usa, con el usuario concediendo permisos en las capabilities).
//
// La web (Aurora) invoca estos comandos vía `window.__TAURI__.core.invoke(...)`.
// Para que una web REMOTA pueda invocarlos, su origen debe estar declarado en
// `capabilities/default.json → remote.urls` (Tauri lo exige por seguridad).
//
// HONESTIDAD RADICAL: `run_terminal` ejecuta comandos de shell con los permisos
// del usuario que corre la app. Es POTENTE y PELIGROSO: es literalmente dar a la
// IA una terminal. Por eso el scope está declarado en la capability y el usuario
// concede el acceso al instalar la app nativa. Nunca se ejecuta nada sin que la
// cadena de permisos (capability → scope de shell) lo permita.
// ═══════════════════════════════════════════════════════════════════════════

use serde::Serialize;
use tauri_plugin_shell::ShellExt;

// ═══════════════════════════════════════════════════════════════════════════
// Actualización automática INTELIGENTE del shell nativo (SOLO escritorio,
// SOLO sistema OS — Nexus/Café aún no declaran canal de updater propio: ver
// `capabilities/desktop.json`, que solo concede `updater:*` a `windows:
// ["main"]` de ESTE crate, y `tauri.conf.json` del OS es el único con
// `plugins.updater.active: true` + `pubkey` real).
//
// Todo bajo `#[cfg(desktop)]`: en Android/iOS ni compila (tauri-plugin-updater
// es dependencia solo-escritorio, ver Cargo.toml) ni se registra ningún
// comando/hilo de aquí — así el binario móvil sigue compilando igual.
// ═══════════════════════════════════════════════════════════════════════════
#[cfg(desktop)]
mod actualizacion {
    use serde::Serialize;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::{Arc, Mutex};
    use tauri::{AppHandle, Emitter, Manager};
    use tauri_plugin_updater::UpdaterExt;

    /// Nombre del evento que recibe la web (Aurora) vía
    /// `window.__TAURI__.event.listen('starseed://actualizacion', cb)`.
    pub const EVENTO_ACTUALIZACION: &str = "starseed://actualizacion";

    /// Payload que viaja en CADA evento y que `estado_actualizacion` también
    /// devuelve tal cual (el último emitido) para que la web pueda leer el
    /// estado sin haberse suscrito a tiempo al evento.
    #[derive(Serialize, Clone, Default)]
    pub struct EstadoActualizacion {
        /// "buscando" | "descargando" | "instalando" | "lista" | "error" | "al-dia"
        pub fase: String,
        pub version: Option<String>,
        pub descargado: Option<u64>,
        pub total: Option<u64>,
        pub mensaje: Option<String>,
    }

    /// Estado compartido gestionado por Tauri (`app.manage(...)`): el último
    /// payload emitido (para `estado_actualizacion`) y si hay una instalación
    /// YA lista esperando que el usuario pulse «Reiniciar ahora».
    #[derive(Default)]
    pub struct EstadoCompartido {
        pub ultimo: Mutex<EstadoActualizacion>,
        pub pendiente_reinicio: Mutex<bool>,
    }

    fn emitir(app: &AppHandle, payload: EstadoActualizacion) {
        if let Some(estado) = app.try_state::<EstadoCompartido>() {
            if let Ok(mut u) = estado.ultimo.lock() {
                *u = payload.clone();
            }
        }
        // Best-effort: si no hay ninguna ventana escuchando aún, emit() no falla,
        // simplemente no llega a nadie (la web puede leer estado_actualizacion()).
        let _ = app.emit(EVENTO_ACTUALIZACION, payload);
    }

    fn marcar_pendiente_reinicio(app: &AppHandle, valor: bool) {
        if let Some(estado) = app.try_state::<EstadoCompartido>() {
            if let Ok(mut p) = estado.pendiente_reinicio.lock() {
                *p = valor;
            }
        }
    }

    /// ¿La ventana principal está VISIBLE y ENFOCADA ahora mismo? Ante la duda
    /// (ventana inexistente = None, o una llamada que devuelve Err) asumimos que
    /// SÍ (honestidad/seguridad: mejor no reiniciar de sorpresa al usuario que
    /// sí está mirando, que sorprenderlo con un reinicio no pedido).
    fn usuario_esta_mirando(app: &AppHandle) -> bool {
        match app.get_webview_window("main") {
            Some(win) => {
                let visible = win.is_visible().unwrap_or(true);
                let enfocada = win.is_focused().unwrap_or(true);
                visible && enfocada
            }
            // Sin ventana principal (p.ej. solo bandeja del sistema): nadie
            // puede sorprenderse por un reinicio silencioso.
            None => false,
        }
    }

    /// Núcleo ÚNICO de la comprobación + descarga + instalación: lo usan tanto
    /// el hilo de fondo (comprobación periódica) como el comando `check_update`
    /// invocable desde la web (misma ruta de código, ver la petición del dueño).
    /// Nunca hace panic: cualquier fallo se reporta como fase "error" y se
    /// devuelve como Err(String) para quien haya invocado el comando.
    pub async fn comprobar_e_instalar(app: AppHandle) -> Result<Option<String>, String> {
        emitir(&app, EstadoActualizacion { fase: "buscando".into(), ..Default::default() });

        let updater = app
            .updater()
            .map_err(|e| {
                let msg = format!("Updater no disponible: {e}");
                emitir(&app, EstadoActualizacion { fase: "error".into(), mensaje: Some(msg.clone()), ..Default::default() });
                msg
            })?;

        let encontrado = updater.check().await.map_err(|e| {
            let msg = format!("No se pudo comprobar actualizaciones: {e}");
            emitir(&app, EstadoActualizacion { fase: "error".into(), mensaje: Some(msg.clone()), ..Default::default() });
            msg
        })?;

        let Some(update) = encontrado else {
            emitir(&app, EstadoActualizacion { fase: "al-dia".into(), ..Default::default() });
            return Ok(None);
        };

        let version = update.version.clone();
        emitir(
            &app,
            EstadoActualizacion {
                fase: "descargando".into(),
                version: Some(version.clone()),
                descargado: Some(0),
                total: None,
                mensaje: None,
            },
        );

        // Acumuladores compartidos con los callbacks de progreso (FnMut/FnOnce
        // deben ser Send + 'static: solo capturan AppHandle clonado + Arc<Atomic*>,
        // nada de referencias con lifetime).
        let total_bytes = Arc::new(AtomicU64::new(0));
        let descargado_bytes = Arc::new(AtomicU64::new(0));

        let app_chunk = app.clone();
        let version_chunk = version.clone();
        let total_bytes_chunk = total_bytes.clone();
        let descargado_bytes_chunk = descargado_bytes.clone();
        let on_chunk = move |chunk: usize, total: Option<u64>| {
            if let Some(t) = total {
                total_bytes_chunk.store(t, Ordering::Relaxed);
            }
            let acumulado = descargado_bytes_chunk.fetch_add(chunk as u64, Ordering::Relaxed) + chunk as u64;
            let total_actual = total_bytes_chunk.load(Ordering::Relaxed);
            emitir(
                &app_chunk,
                EstadoActualizacion {
                    fase: "descargando".into(),
                    version: Some(version_chunk.clone()),
                    descargado: Some(acumulado),
                    total: if total_actual > 0 { Some(total_actual) } else { None },
                    mensaje: None,
                },
            );
        };

        let app_fin_descarga = app.clone();
        let version_fin_descarga = version.clone();
        let on_download_finish = move || {
            emitir(
                &app_fin_descarga,
                EstadoActualizacion {
                    fase: "instalando".into(),
                    version: Some(version_fin_descarga.clone()),
                    ..Default::default()
                },
            );
        };

        update
            .download_and_install(on_chunk, on_download_finish)
            .await
            .map_err(|e| {
                let msg = format!("Falló la instalación de la actualización: {e}");
                emitir(&app, EstadoActualizacion { fase: "error".into(), version: Some(version.clone()), mensaje: Some(msg.clone()), ..Default::default() });
                msg
            })?;

        // Instalada: reinicio inteligente. Si el usuario NO está mirando la
        // ventana principal (minimizada, en 2º plano o sin foco), reiniciamos
        // solos — es el mejor momento, no interrumpe nada. Si SÍ está mirando,
        // dejamos la instalación lista y avisamos para que decida cuándo.
        if usuario_esta_mirando(&app) {
            marcar_pendiente_reinicio(&app, true);
            emitir(
                &app,
                EstadoActualizacion {
                    fase: "lista".into(),
                    version: Some(version.clone()),
                    mensaje: Some("Actualización lista: reinicia cuando quieras para aplicarla.".into()),
                    ..Default::default()
                },
            );
        } else {
            marcar_pendiente_reinicio(&app, false);
            app.restart(); // no retorna (reinicia el proceso).
        }

        Ok(Some(version))
    }

    /// Hilo de fondo que espera ~25 s tras el arranque (para no competir con la
    /// primera carga de la web) y luego comprueba actualizaciones cada 6 h.
    ///
    /// Deliberadamente NO usa `tauri::async_runtime::spawn` + un sleep async: el
    /// crate `tokio` no es dependencia DIRECTA de este crate (solo transitiva vía
    /// `tauri`), así que `tokio::time::sleep` no es nombrable aquí sin añadir esa
    /// dependencia (el dueño pidió «no new crates»). Un hilo del SO dedicado con
    /// `std::thread::sleep` + `tauri::async_runtime::block_on(...)` para la parte
    /// async logra lo mismo con API 100% estable y ya usada en el resto del
    /// crate, sin ocupar un worker del pool de tokio durante horas.
    pub fn iniciar_vigilancia_en_segundo_plano(app: AppHandle) {
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(25));
            loop {
                // Cualquier error ya quedó reportado (evento "error" + estado
                // compartido) dentro de comprobar_e_instalar; aquí no hay nada
                // más que hacer que seguir esperando al siguiente ciclo.
                let _ = tauri::async_runtime::block_on(comprobar_e_instalar(app.clone()));
                std::thread::sleep(std::time::Duration::from_secs(6 * 60 * 60));
            }
        });
    }
}

// ───────────────────────── Tipos de retorno a la web ─────────────────────────

/// Resultado de ejecutar un comando de terminal (lo consume Aurora).
#[derive(Serialize)]
struct TerminalResult {
    /// Salida estándar (stdout) decodificada como texto.
    stdout: String,
    /// Salida de error (stderr) decodificada como texto.
    stderr: String,
    /// Código de salida del proceso (None si terminó por señal).
    code: Option<i32>,
    /// true si el proceso terminó con éxito (código 0).
    success: bool,
}

/// Información básica del dispositivo (para que Aurora sepa "dónde vive").
#[derive(Serialize)]
struct DeviceInfo {
    /// SO: "macos", "windows", "linux", "android", "ios"…
    os: String,
    /// Arquitectura: "x86_64", "aarch64"…
    arch: String,
    /// Familia: "unix" | "windows".
    family: String,
    /// Versión de la app nativa (de tauri.conf.json / Cargo).
    app_version: String,
    /// Hostname si se puede resolver (mejor esfuerzo).
    hostname: Option<String>,
}

// ─────────────────────────── Comando: run_terminal ───────────────────────────

/// Ejecuta un comando de shell en el dispositivo y devuelve su salida.
///
/// Es el PUENTE de "control por terminal" para Aurora. En Unix ejecuta
/// `sh -c "<cmd>"`; en Windows `cmd /C "<cmd>"`. El scope está declarado en la
/// capability (`shell:allow-execute`), por eso esto solo funciona en la app
/// nativa instalada y con el permiso concedido — un navegador NO puede hacerlo.
///
/// ⚠️ Potente y peligroso: da a la IA acceso de terminal con los permisos del
/// usuario. Úsese con criterio; el usuario es soberano de lo que autoriza.
#[tauri::command]
async fn run_terminal(app: tauri::AppHandle, cmd: String) -> Result<TerminalResult, String> {
    if cmd.trim().is_empty() {
        return Err("El comando está vacío.".into());
    }

    // Elegimos intérprete según el sistema.
    #[cfg(windows)]
    let (program, args) = ("cmd", vec!["/C".to_string(), cmd.clone()]);
    #[cfg(not(windows))]
    let (program, args) = ("sh", vec!["-c".to_string(), cmd.clone()]);

    // Ejecuta el proceso hijo vía tauri-plugin-shell y espera su salida.
    let output = app
        .shell()
        .command(program)
        .args(args)
        .output()
        .await
        .map_err(|e| format!("No se pudo ejecutar «{cmd}»: {e}"))?;

    Ok(TerminalResult {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        code: output.status.code(),
        success: output.status.success(),
    })
}

// ─────────────────── Comandos: check_update / reiniciar_para_actualizar / estado_actualizacion ───────────────────

/// Busca e instala la actualización incremental DENTRO de la app (sin
/// reinstalar), reutilizando el MISMO camino de código que la vigilancia
/// periódica en segundo plano (`actualizacion::comprobar_e_instalar`) — así el
/// botón manual «Buscar actualizaciones» y el ciclo automático de 6h nunca
/// pueden divergir en comportamiento. Devuelve un mensaje legible para Aurora.
///
/// Solo escritorio: el updater no aplica igual en móvil (allí actualiza la
/// tienda o el sideload manual del APK).
#[tauri::command]
async fn check_update(app: tauri::AppHandle) -> Result<String, String> {
    #[cfg(desktop)]
    {
        match actualizacion::comprobar_e_instalar(app).await {
            Ok(Some(version)) => Ok(format!(
                "Actualización a la versión {version} descargada. Revisa el aviso de la app para reiniciar."
            )),
            Ok(None) => Ok("Ya estás en la última versión.".to_string()),
            Err(e) => Err(e),
        }
    }

    #[cfg(not(desktop))]
    {
        let _ = app;
        Ok("En móvil las actualizaciones llegan por la tienda o instalando el APK nuevo.".to_string())
    }
}

/// Reinicia la app para aplicar una actualización YA descargada e instalada
/// (la web la invoca cuando el usuario pulsa «Reiniciar ahora» tras el evento
/// `starseed://actualizacion` con fase "lista"). Solo escritorio: en móvil no
/// hay reinicio in-app que aplicar (el sideload del APK lo hace el usuario).
#[tauri::command]
fn reiniciar_para_actualizar(app: tauri::AppHandle) {
    #[cfg(desktop)]
    {
        app.restart();
    }
    #[cfg(not(desktop))]
    {
        let _ = app;
    }
}

/// Devuelve el ÚLTIMO estado de actualización conocido (lo que emitió el
/// evento `starseed://actualizacion` por última vez), para que la web pueda
/// pintar el estado correcto aunque se haya suscrito tarde (p. ej. tras
/// recargar la página). En móvil, o si aún no se ha comprobado nada, devuelve
/// el estado por defecto ("" en fase: ninguna comprobación todavía).
#[tauri::command]
fn estado_actualizacion(app: tauri::AppHandle) -> actualizacion_estado::EstadoActualizacionPublico {
    #[cfg(desktop)]
    {
        use tauri::Manager;
        if let Some(estado) = app.try_state::<actualizacion::EstadoCompartido>() {
            let ultimo = estado.ultimo.lock().map(|g| g.clone()).unwrap_or_default();
            let pendiente = estado.pendiente_reinicio.lock().map(|g| *g).unwrap_or(false);
            return actualizacion_estado::EstadoActualizacionPublico {
                fase: ultimo.fase,
                version: ultimo.version,
                descargado: ultimo.descargado,
                total: ultimo.total,
                mensaje: ultimo.mensaje,
                pendiente_reinicio: pendiente,
            };
        }
    }
    #[cfg(not(desktop))]
    {
        let _ = app;
    }
    actualizacion_estado::EstadoActualizacionPublico::default()
}

/// Tipo de retorno serializable de `estado_actualizacion`, separado del
/// interno de `actualizacion` para no filtrar `EstadoCompartido` (con sus
/// `Mutex`, no `Serialize`) al `invoke_handler`. Vive fuera de `#[cfg(desktop)]`
/// para que el comando siga existiendo (con estado vacío) también en móvil.
mod actualizacion_estado {
    use serde::Serialize;

    #[derive(Serialize, Default)]
    pub struct EstadoActualizacionPublico {
        pub fase: String,
        pub version: Option<String>,
        pub descargado: Option<u64>,
        pub total: Option<u64>,
        pub mensaje: Option<String>,
        pub pendiente_reinicio: bool,
    }
}

// ─────────────────────────── Comando: device_info ────────────────────────────

/// Devuelve información básica del dispositivo donde corre la app.
#[tauri::command]
fn device_info(app: tauri::AppHandle) -> DeviceInfo {
    let hostname = hostname_best_effort();
    DeviceInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        family: std::env::consts::FAMILY.to_string(),
        app_version: app.package_info().version.to_string(),
        hostname,
    }
}

/// Resuelve el hostname sin dependencias extra: variable de entorno primero,
/// y en Unix el comando `hostname` como respaldo. Nunca falla (Option).
fn hostname_best_effort() -> Option<String> {
    if let Ok(h) = std::env::var("HOSTNAME") {
        if !h.trim().is_empty() {
            return Some(h);
        }
    }
    if let Ok(h) = std::env::var("COMPUTERNAME") {
        if !h.trim().is_empty() {
            return Some(h);
        }
    }
    #[cfg(unix)]
    {
        if let Ok(out) = std::process::Command::new("hostname").output() {
            let h = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !h.is_empty() {
                return Some(h);
            }
        }
    }
    None
}

// ──────────────────────────────── Arranque ───────────────────────────────────

/// Punto de entrada compartido escritorio + móvil.
///
/// `tauri::mobile_entry_point` genera el enganche que Android (JNI) e iOS
/// llaman al arrancar; en escritorio lo llama `main()` directamente.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Autostart + Updater: SOLO escritorio (en móvil ni compilan; ver Cargo.toml
    // → [target.'cfg(not(any(target_os = "android", target_os = "ios")))'.dependencies]).
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ));
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        // Terminal / procesos → control profundo para Aurora.
        .plugin(tauri_plugin_shell::init())
        // Notificaciones nativas.
        .plugin(tauri_plugin_notification::init())
        // Diálogos nativos (consentimiento del usuario).
        .plugin(tauri_plugin_dialog::init())
        // Sistema de archivos con scope.
        .plugin(tauri_plugin_fs::init())
        // Info del SO.
        .plugin(tauri_plugin_os::init())
        // Control del proceso (necesario para reiniciar tras un update).
        .plugin(tauri_plugin_process::init())
        // Enlaces profundos starseed://
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            // Estado compartido + vigilancia de actualizaciones: SOLO escritorio
            // y SOLO el sistema OS (identifier `app.starseed.os`). Nexus/Café
            // (`app.starseed.nexus` / `app.starseed.cafe`) comparten este mismo
            // binario pero NO declaran `plugins.updater` en sus
            // tauri.<sistema>.conf.json ni tienen permisos `updater:*` propios
            // en capabilities/desktop.json — arrancar la vigilancia para ellos
            // llamaría a un updater sin endpoint propio configurado a propósito
            // (aún no tienen canal de releases independiente). Cuando lo tengan,
            // basta con quitar esta condición y darles su propio pubkey/endpoint.
            #[cfg(desktop)]
            {
                use tauri::Manager;
                app.manage(actualizacion::EstadoCompartido::default());
                if app.config().identifier == "app.starseed.os" {
                    actualizacion::iniciar_vigilancia_en_segundo_plano(app.handle().clone());
                }
            }
            #[cfg(not(desktop))]
            {
                let _ = &app;
            }
            Ok(())
        })
        // Comandos que la web (Aurora) puede invocar vía window.__TAURI__.
        .invoke_handler(tauri::generate_handler![
            run_terminal,
            check_update,
            reiniciar_para_actualizar,
            estado_actualizacion,
            device_info
        ])
        .run(tauri::generate_context!())
        .expect("error irrecuperable arrancando la app nativa StarSeed");
}
