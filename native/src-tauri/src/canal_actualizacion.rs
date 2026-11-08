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
use crate::canal_actualizacion_red as red;
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

/// Avisa del progreso (texto en español para la persona): lo emite lib.rs como fase «buscando»/«descargando».
#[cfg(desktop)]
pub type Avisar<'a> = &'a (dyn Fn(String) + Send + Sync);

/// Duerme `seg` segundos sin ocupar un worker de tokio (el crate no depende de tokio directamente).
#[cfg(desktop)]
async fn pausa(seg: u64) {
    if seg == 0 {
        return;
    }
    let _ = tauri::async_runtime::spawn_blocking(move || std::thread::sleep(std::time::Duration::from_secs(seg))).await;
}

/// GET de un JSON de la API de GitHub (repositorio público: sin token). `Ok(None)` = 404 (no existe).
#[cfg(desktop)]
async fn json_api(url: &str) -> Result<Option<serde_json::Value>, String> {
    // tauri-plugin-updater usa rustls SIN proveedor propio e instala el suyo en `check()`; aquí se hace lo
    // mismo antes de nuestra primera petición (idempotente: si ya hay uno, no pasa nada).
    let _ = rustls::crypto::ring::default_provider().install_default();
    let cliente = reqwest::Client::builder()
        .user_agent("StarSeed-OS-Actualizador")
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;
    let r = cliente.get(url).header("Accept", "application/vnd.github+json").send().await.map_err(|e| e.to_string())?;
    let estado = r.status();
    if estado == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !estado.is_success() {
        return Err(format!("HTTP status {estado} en la API de GitHub"));
    }
    r.json::<serde_json::Value>().await.map(Some).map_err(|e| e.to_string())
}

/// Resultado de buscar el archivo de un Release por la API.
#[cfg(desktop)]
enum PorApi {
    Url(String),
    /// La API respondió y ese archivo no está en el Release (p. ej. aún no hay ninguna prueba publicada).
    NoExiste,
    Error(String),
}

#[cfg(desktop)]
async fn url_por_api(url_directa: &str) -> PorApi {
    let Some(archivo) = red::analizar_url_release(url_directa) else {
        return PorApi::Error("Esta ruta no es un archivo de un Release de GitHub.".into());
    };
    match json_api(&red::url_lista_api(&archivo)).await {
        Ok(Some(release)) => red::url_api_del_archivo(&release, &archivo).map_or(PorApi::NoExiste, PorApi::Url),
        Ok(None) => PorApi::NoExiste,
        Err(e) => PorApi::Error(e),
    }
}

/// Busca en UN endpoint con reintentos y ruta alternativa por la API. `max_intentos` limita los intentos
/// (si otro endpoint ya agotó los suyos, aquí no se espera otro minuto). `Ok(None)` = al día o ese canal
/// no tiene manifiesto; `Err` = no se pudo ni por ninguna ruta.
#[cfg(desktop)]
async fn buscar_en_endpoint(
    app: &AppHandle,
    endpoint: &str,
    max_intentos: usize,
    avisar: Avisar<'_>,
) -> Result<Option<tauri_plugin_updater::Update>, String> {
    use tauri_plugin_updater::UpdaterExt;
    let rutas = red::secuencia_rutas(&red::rutas_espejo(endpoint));
    let total = rutas.len().min(max_intentos.max(1));
    let mut ultimo_error = String::from("sin respuesta");
    for (i, ruta) in rutas.iter().take(total).enumerate() {
        pausa(red::pausa_antes(i)).await;
        let (url, accept_binario) = match ruta {
            red::Ruta::Directa => (endpoint.to_string(), false),
            red::Ruta::Espejo(u) => (u.clone(), false),
            red::Ruta::Api => match url_por_api(endpoint).await {
                PorApi::Url(u) => (u, true),
                // La API respondió y ese manifiesto no existe: el canal aún no tiene nada. No es un fallo.
                PorApi::NoExiste => return Ok(None),
                PorApi::Error(e) => {
                    ultimo_error = e;
                    if let Some(sig) = rutas.get(i + 1) {
                        avisar(red::mensaje_reintento(&ultimo_error, i, total, sig));
                    }
                    continue;
                }
            },
        };
        let url: tauri::Url = match url.parse() {
            Ok(u) => u,
            Err(e) => {
                ultimo_error = format!("{url}: {e}");
                continue;
            }
        };
        let mut b = match app.updater_builder().endpoints(vec![url]) {
            Ok(b) => b.timeout(std::time::Duration::from_secs(30)),
            Err(e) => {
                ultimo_error = format!("Updater no disponible: {e}");
                continue;
            }
        };
        if accept_binario {
            // La API de GitHub sirve el contenido del archivo con este Accept (responde 302 al archivo).
            b = match b.header("Accept", "application/octet-stream") {
                Ok(b) => b,
                Err(e) => {
                    ultimo_error = e.to_string();
                    continue;
                }
            };
        }
        let resultado = match b.build() {
            Ok(u) => u.check().await.map_err(|e| e.to_string()),
            Err(e) => Err(format!("Updater no disponible: {e}")),
        };
        match resultado {
            Ok(x) => return Ok(x),
            Err(e) => {
                ultimo_error = e;
                if !red::es_reintentable(&ultimo_error) {
                    return Err(red::mensaje_agotado(&ultimo_error));
                }
                if let Some(sig) = rutas.get(i + 1).filter(|_| i + 1 < total) {
                    avisar(red::mensaje_reintento(&ultimo_error, i, total, sig));
                }
            }
        }
    }
    Err(red::mensaje_agotado(&ultimo_error))
}

/// Los endpoints del updater en el tauri.conf.json de ESTA app (oficial).
#[cfg(desktop)]
fn endpoints_de_config(app: &AppHandle) -> Vec<String> {
    app.config()
        .plugins
        .0
        .get("updater")
        .and_then(|v| v.get("endpoints"))
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|s| s.as_str().map(String::from)).collect())
        .unwrap_or_default()
}

/// El `check()` del updater con el canal de ESTA app, con reintentos y ruta alternativa. `Ok(None)` = al día.
#[cfg(desktop)]
pub async fn buscar(app: &AppHandle, avisar: Avisar<'_>) -> Result<Option<tauri_plugin_updater::Update>, String> {
    let version = app.package_info().version.to_string();
    let endpoints = logica::endpoints_escritorio(sistema(app), &version).unwrap_or_else(|| endpoints_de_config(app));
    if endpoints.is_empty() {
        use tauri_plugin_updater::UpdaterExt;
        let updater = app.updater().map_err(|e| format!("Updater no disponible: {e}"))?;
        return updater.check().await.map_err(|e| format!("No se pudo comprobar actualizaciones: {e}"));
    }
    // Una búsqueda por endpoint (en pruebas: el canal de pruebas y el oficial) y gana la versión mayor
    // (el updater, con varios endpoints, se queda con el PRIMERO que responde, no con el mayor).
    let mut encontradas: Vec<tauri_plugin_updater::Update> = Vec::new();
    let mut alguna_respondio = false;
    let mut ultimo_error = String::new();
    let mut agotado = false;
    for endpoint in &endpoints {
        // Si otro endpoint ya agotó sus intentos, GitHub está caído: aquí solo una pasada por cada ruta.
        let max = if agotado { 2 } else { usize::MAX };
        match buscar_en_endpoint(app, endpoint, max, avisar).await {
            Ok(Some(u)) => {
                alguna_respondio = true;
                encontradas.push(u);
            }
            Ok(None) => alguna_respondio = true,
            // Un canal sin manifiesto no tumba al otro.
            Err(e) => {
                agotado = true;
                ultimo_error = e;
            }
        }
    }
    // Sin nada encontrado y con algún canal inalcanzable no se puede decir «al día»: se informa del fallo.
    if encontradas.is_empty() && (!alguna_respondio || agotado) {
        return Err(ultimo_error);
    }
    let mayor = logica::indice_mayor(encontradas.iter().map(|u| u.version.as_str()));
    Ok(mayor.map(|i| encontradas.swap_remove(i)))
}

/// Descarga el paquete (la firma la verifica tauri-plugin-updater sobre los bytes, vengan por la ruta que
/// vengan) con reintentos y ruta alternativa por la API. `al_empezar` se llama antes de cada intento
/// (para reiniciar el contador de progreso). No instala: eso lo hace quien llama con `update.install`.
#[cfg(desktop)]
pub async fn descargar(
    update: &tauri_plugin_updater::Update,
    mut al_chunk: impl FnMut(usize, Option<u64>),
    al_empezar: &(dyn Fn() + Send + Sync),
    avisar: Avisar<'_>,
) -> Result<Vec<u8>, String> {
    let original = update.download_url.to_string();
    let rutas = red::secuencia_rutas(&red::rutas_espejo(&original));
    let total = rutas.len();
    let mut ultimo_error = String::from("sin respuesta");
    for (i, ruta) in rutas.iter().enumerate() {
        pausa(red::pausa_antes(i)).await;
        let mut u = update.clone();
        match ruta {
            red::Ruta::Directa => {}
            red::Ruta::Espejo(m) => match m.parse() {
                Ok(url) => u.download_url = url,
                Err(_) => continue,
            },
            red::Ruta::Api => match url_por_api(&original).await {
                PorApi::Url(a) => match a.parse() {
                    Ok(url) => u.download_url = url,
                    Err(_) => continue,
                },
                PorApi::NoExiste => {
                    ultimo_error = "El paquete no está en el Release (ruta API).".into();
                    continue;
                }
                PorApi::Error(e) => {
                    ultimo_error = e;
                    continue;
                }
            },
        }
        al_empezar();
        match u.download(&mut al_chunk, || {}).await {
            Ok(bytes) => return Ok(bytes),
            Err(e) => {
                ultimo_error = e.to_string();
                if !red::es_reintentable(&ultimo_error) {
                    return Err(red::mensaje_agotado(&ultimo_error));
                }
                if let Some(sig) = rutas.get(i + 1) {
                    avisar(red::mensaje_reintento(&ultimo_error, i, total, sig));
                }
            }
        }
    }
    Err(red::mensaje_agotado(&ultimo_error))
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
