// ═══════════════════════════════════════════════════════════════════════════
// Canal de actualización de la app instalada (ACT1108A, 2026-11-08) — pegamento con Tauri.
// Contrato: architecture/centro-versiones-1105.md §9. La lógica pura vive en
// canal_actualizacion_logica.rs (con pruebas).
// ---------------------------------------------------------------------------
//   · Escritorio: `buscar` es el `check()` que usan la vigilancia de 6 h, `check_update` y
//     `buscar_actualizacion` (lib.rs). Una app del canal de pruebas (versión con «-prueba.») mira
//     `canal-pruebas/latest-prueba.json` Y el `latest.json` oficial, y se queda con la mayor; las
//     demás, los endpoints de su tauri.<sistema>.conf.json, como siempre. `avisar_lista` deja la
//     notificación «Lista: reinicia» cuando la vigilancia ya instaló la versión nueva.
//   · Android: el APK nuevo se descarga DENTRO de la app (ActualizadorApk.kt, inyectado por build.rs),
//     se comprueba su SHA-256 contra el manifiesto, su paquete y su firma, y se abre el instalador del
//     sistema (Android SIEMPRE pide a la persona que confirme). Rust escribe las peticiones, lee el
//     estado y busca solo cada 6 h. Comandos: `apk_actualizar`, `apk_estado`, `apk_instalar`.
// ═══════════════════════════════════════════════════════════════════════════

use crate::canal_actualizacion_logica as logica;
pub use logica::EstadoApk;
use tauri::AppHandle;

#[cfg_attr(not(target_os = "android"), allow(dead_code))]
fn ahora_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg_attr(not(target_os = "android"), allow(dead_code))]
fn sistema(app: &AppHandle) -> &'static str {
    crate::neurona_info::sistema_de_identificador(&app.config().identifier)
}

// ─────────────────────────────── Escritorio ───────────────────────────────

/// El `check()` del updater con el canal de ESTA app. `Ok(None)` = al día.
#[cfg(desktop)]
pub async fn buscar(app: &AppHandle) -> Result<Option<tauri_plugin_updater::Update>, String> {
    use tauri_plugin_updater::UpdaterExt;
    let version = app.package_info().version.to_string();
    let Some(endpoints) = logica::endpoints_escritorio(sistema(app), &version) else {
        let updater = app.updater().map_err(|e| format!("Updater no disponible: {e}"))?;
        return updater.check().await.map_err(|e| format!("No se pudo comprobar actualizaciones: {e}"));
    };
    // Canal de pruebas: una búsqueda por canal y gana la versión mayor (el updater, con varios
    // endpoints, se queda con el PRIMERO que responde, no con el mayor).
    let mut encontradas: Vec<tauri_plugin_updater::Update> = Vec::new();
    let mut alguna_respondio = false;
    let mut ultimo_error = String::new();
    for endpoint in endpoints {
        let url: tauri::Url = match endpoint.parse() {
            Ok(u) => u,
            Err(e) => {
                ultimo_error = format!("{endpoint}: {e}");
                continue;
            }
        };
        let updater = match app.updater_builder().endpoints(vec![url]).and_then(|b| b.build()) {
            Ok(u) => u,
            Err(e) => {
                ultimo_error = format!("Updater no disponible: {e}");
                continue;
            }
        };
        match updater.check().await {
            Ok(Some(u)) => {
                alguna_respondio = true;
                encontradas.push(u);
            }
            Ok(None) => alguna_respondio = true,
            // Un canal sin manifiesto (p. ej. aún no hay ninguna prueba publicada) no tumba al otro.
            Err(e) => ultimo_error = e.to_string(),
        }
    }
    if encontradas.is_empty() && !alguna_respondio {
        return Err(format!("No se pudo comprobar actualizaciones: {ultimo_error}"));
    }
    let mayor = logica::indice_mayor(encontradas.iter().map(|u| u.version.as_str()));
    Ok(mayor.map(|i| encontradas.swap_remove(i)))
}

/// Notificación del sistema cuando la vigilancia de fondo ya instaló la versión nueva y la persona
/// está mirando la app (si no mira, lib.rs reinicia solo y no hace falta avisar).
#[cfg(desktop)]
pub fn avisar_lista(app: &AppHandle, version: &str) {
    use tauri_plugin_notification::NotificationExt;
    let _ = app
        .notification()
        .builder()
        .title(app.package_info().name.clone())
        .body(logica::texto_lista(version))
        .show();
}

// ──────────────────────────────── Android ─────────────────────────────────

/// Carpeta que comparte con ActualizadorApk.kt (filesDir/starseed/actualizacion). Solo vale si Kotlin
/// dejó `puente.json`: si no, este APK no trae el actualizador interno.
#[cfg(target_os = "android")]
fn dir_android(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    let mut candidatas = Vec::new();
    if let Some(d) = crate::android::dir_datos() {
        candidatas.push(d.join(logica::CARPETA_ANDROID));
    }
    if let Ok(d) = app.path().app_data_dir() {
        // En Android `app_data_dir` es `dataDir` (/data/user/0/<paquete>); filesDir cuelga de él.
        candidatas.push(d.join("files").join("starseed").join(logica::CARPETA_ANDROID));
    }
    candidatas
        .into_iter()
        .find(|d| logica::hay_puente(d))
        .ok_or_else(|| "Este APK no trae el actualizador interno (llegó con ACT1108A): descarga el .apk desde la Librería.".to_string())
}

/// Busca la versión nueva del APK y, con `instalar` (por defecto sí), al terminar abre el instalador de
/// Android (que pide confirmar). Devuelve enseguida: el progreso se lee con `apk_estado`.
#[tauri::command]
pub fn apk_actualizar(app: AppHandle, instalar: Option<bool>) -> Result<EstadoApk, String> {
    #[cfg(target_os = "android")]
    {
        let dir = dir_android(&app)?;
        let version = app.package_info().version.to_string();
        let manifiestos = logica::manifiestos_android(sistema(&app), &version);
        if manifiestos.is_empty() {
            return Err("Esta app todavía no tiene canal de APK propio: descarga el .apk desde la Librería.".into());
        }
        let anterior = logica::leer_estado(&dir);
        if !logica::ocupada(&anterior.fase) {
            logica::escribir_peticion(&dir, &logica::peticion_buscar(&manifiestos, instalar.unwrap_or(true), ahora_ms()))?;
        }
        Ok(logica::estado_pedido(anterior, ahora_ms()))
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, instalar);
        Err("Solo en la app de Android: en escritorio la versión nueva se instala con check_update.".into())
    }
}

/// Lo último que dijo el actualizador interno de Android (fase, versión, progreso, mensaje).
#[tauri::command]
pub fn apk_estado(app: AppHandle) -> EstadoApk {
    #[cfg(target_os = "android")]
    {
        match dir_android(&app) {
            Ok(dir) => logica::leer_estado(&dir),
            Err(motivo) => EstadoApk { fase: "sin-actualizador".into(), mensaje: Some(motivo), ..Default::default() },
        }
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        EstadoApk { fase: "sin-actualizador".into(), mensaje: Some("Solo en la app de Android.".into()), ..Default::default() }
    }
}

/// Abre el instalador de Android con el APK ya descargado y verificado (fase «lista»).
#[tauri::command]
pub fn apk_instalar(app: AppHandle) -> Result<EstadoApk, String> {
    #[cfg(target_os = "android")]
    {
        let dir = dir_android(&app)?;
        let estado = logica::leer_estado(&dir);
        if !matches!(estado.fase.as_str(), "lista" | "permiso" | "instalador") {
            return Err("No hay ninguna versión descargada y verificada que instalar: busca primero.".into());
        }
        logica::escribir_peticion(&dir, &logica::peticion_instalar(ahora_ms()))?;
        Ok(estado)
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Err("Solo en la app de Android.".into())
    }
}

/// Android: busca sola cada 6 h (sin abrir el instalador). Si encuentra una versión nueva, Kotlin la
/// descarga, la verifica y deja una notificación; la web enseña la ventana al abrir la app.
pub fn iniciar(app: &AppHandle) {
    #[cfg(target_os = "android")]
    {
        let app = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(90));
            loop {
                if let Ok(dir) = dir_android(&app) {
                    let version = app.package_info().version.to_string();
                    let manifiestos = logica::manifiestos_android(sistema(&app), &version);
                    // No pisa una descarga en marcha. Si el APK de esa versión ya está bajado y verificado,
                    // Kotlin no lo vuelve a bajar ni repite la notificación.
                    if !manifiestos.is_empty() && !logica::ocupada(&logica::leer_estado(&dir).fase) {
                        let _ = logica::escribir_peticion(&dir, &logica::peticion_buscar(&manifiestos, false, ahora_ms()));
                    }
                }
                std::thread::sleep(std::time::Duration::from_secs(logica::INTERVALO_SEGUNDOS));
            }
        });
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
    }
}
