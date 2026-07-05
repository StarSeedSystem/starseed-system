// Evita abrir una consola extra en Windows en modo release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// ═══════════════════════════════════════════════════════════════════════════
// StarSeed Native — App Tauri 2 (cuerpo nativo de OS / Nexus / Café)
// ---------------------------------------------------------------------------
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
use tauri::Manager;
use tauri_plugin_shell::ShellExt;

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

// ─────────────────────────── Comando: check_update ───────────────────────────

/// Busca e instala la actualización incremental DENTRO de la app (sin reinstalar).
///
/// Usa el updater de Tauri con los `endpoints` de tauri.conf.json (por defecto el
/// latest.json de GitHub Releases). Si hay versión nueva, la descarga, la instala
/// y reinicia la app. Devuelve un mensaje legible para mostrar en la UI (Aurora).
///
/// Solo escritorio: el updater no aplica igual en móvil (allí actualiza la store).
#[tauri::command]
async fn check_update(app: tauri::AppHandle) -> Result<String, String> {
    #[cfg(desktop)]
    {
        use tauri_plugin_updater::UpdaterExt;

        // Construye el updater (usa endpoints + pubkey de la config).
        let updater = app
            .updater()
            .map_err(|e| format!("Updater no disponible: {e}"))?;

        match updater.check().await {
            Ok(Some(update)) => {
                let version = update.version.clone();
                // Descarga + instala con callbacks de progreso (aquí solo logueamos).
                update
                    .download_and_install(
                        |chunk, total| {
                            // Progreso de descarga; en producción esto se puede
                            // reenviar al frontend con un Channel para una barra.
                            let _ = (chunk, total);
                        },
                        || {
                            // Descarga terminada; empieza la instalación.
                        },
                    )
                    .await
                    .map_err(|e| format!("Falló la instalación de la actualización: {e}"))?;

                // Reinicia para aplicar la nueva versión (en Windows el instalador
                // ya cierra la app; restart es el patrón oficial en el resto).
                app.restart();
            }
            Ok(None) => Ok("Ya estás en la última versión.".to_string()),
            Err(e) => Err(format!("No se pudo comprobar actualizaciones: {e}")),
        }
    }

    #[cfg(not(desktop))]
    {
        let _ = app;
        Ok("En móvil las actualizaciones llegan por la tienda de apps.".to_string())
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

fn main() {
    let mut builder = tauri::Builder::default();

    // Autostart: en escritorio permite que el compañero arranque con el sistema.
    // (En móvil este plugin no aplica; por eso va bajo cfg(desktop).)
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ));
        // Updater solo tiene sentido en escritorio (móvil usa la tienda).
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
        // Comandos que la web (Aurora) puede invocar vía window.__TAURI__.
        .invoke_handler(tauri::generate_handler![
            run_terminal,
            check_update,
            device_info
        ])
        .run(tauri::generate_context!())
        .expect("error irrecuperable arrancando la app nativa StarSeed");
}
