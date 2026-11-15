// ═══════════════════════════════════════════════════════════════════════════
// ubicacion — comandos de la ubicación nativa (UBI1114K, 2026-11-14). Contrato: architecture/ubicacion-nativa.md.
// ---------------------------------------------------------------------------
// Un solo modo de saber dónde está el aparato, igual para la web en todas las apps:
//   · `ubicacion_estado`  → qué sabe esta app (permiso, servicios del sistema, si vigila). No pregunta nada.
//   · `ubicacion_ahora`   → una medida. `pedir: true` SOLO cuando la persona acaba de pulsar el botón: si el
//                           permiso está sin preguntar, el sistema enseña SU aviso. Sin eso, nunca pregunta.
//   · `ubicacion_vigilar` / `ubicacion_parar` → mantener la medición en marcha mientras la vista está abierta.
//   · `ubicacion_ultima`  → lo último medido, sin esperar.
// macOS: CoreLocation (ubicacion_macos.rs). Android: LocationManager en UbicacionStarSeed.kt (por archivos,
// como las llamadas nativas). Windows y Linux: «no disponible»; la web usa la ubicación del navegador.
// Ningún comando concede ni cambia permisos del sistema.
// ═══════════════════════════════════════════════════════════════════════════

use crate::ubicacion_logica::{self as logica, Codigo, EstadoUbicacion, Permiso, RespuestaFix};
use tauri::AppHandle;

#[cfg(target_os = "android")]
use std::sync::atomic::{AtomicU64, Ordering};
#[cfg(target_os = "android")]
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

#[cfg(target_os = "android")]
static DIR_APP: std::sync::OnceLock<std::path::PathBuf> = std::sync::OnceLock::new();
#[cfg(target_os = "android")]
static SECUENCIA: AtomicU64 = AtomicU64::new(0);

fn plataforma() -> &'static str {
    std::env::consts::OS
}

// ─────────────────────────────── Android: archivos con Kotlin ───────────────────────────────

#[cfg(target_os = "android")]
fn ahora_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// La carpeta que comparte con UbicacionStarSeed.kt: la que ya tenga su `estado.json`.
#[cfg(target_os = "android")]
fn dir_android(app: &AppHandle) -> Option<std::path::PathBuf> {
    use tauri::Manager;
    if DIR_APP.get().is_none() {
        if let Ok(d) = app.path().app_data_dir() {
            let _ = DIR_APP.set(d.join("files").join("starseed").join(logica::CARPETA_ANDROID));
        }
    }
    let candidatas: Vec<std::path::PathBuf> = crate::android::dir_datos()
        .map(|d| d.join(logica::CARPETA_ANDROID))
        .into_iter()
        .chain(DIR_APP.get().cloned())
        .collect();
    candidatas.iter().find(|d| d.join(logica::ESTADO).is_file()).cloned().or_else(|| candidatas.into_iter().next())
}

/// Números de petición que suben siempre (la hora en µs como base).
#[cfg(target_os = "android")]
fn siguiente_id() -> u64 {
    let base = ahora_ms().saturating_mul(1000);
    let previo = SECUENCIA.fetch_update(Ordering::SeqCst, Ordering::SeqCst, |a| Some(a.max(base.saturating_sub(1)) + 1)).unwrap_or(0);
    previo.max(base.saturating_sub(1)) + 1
}

#[cfg(target_os = "android")]
fn enviar_android(app: &AppHandle, orden: &str, pedir: bool) -> Result<(std::path::PathBuf, u64), String> {
    let d = dir_android(app).ok_or("La parte Android de StarSeed no arrancó (sin carpeta compartida).")?;
    if logica::leer_estado(&d).is_none() {
        return Err("Este APK no trae la ubicación nativa (llegó con UBI1114K): actualízalo.".into());
    }
    let id = siguiente_id();
    logica::escribir_peticion(&d, id, &logica::peticion_json(id, orden, pedir)?)?;
    Ok((d, id))
}

#[cfg(target_os = "android")]
fn sin_modulo() -> RespuestaFix {
    RespuestaFix::fallo(Codigo::NoDisponible, "android")
}

// ─────────────────────────────── Comandos ───────────────────────────────

fn no_disponible() -> EstadoUbicacion {
    EstadoUbicacion {
        version: logica::VERSION_UBICACION,
        plataforma: plataforma().into(),
        disponible: false,
        permiso: Permiso::NoDisponible,
        servicios: None,
        vigilando: false,
        donde_cambiarlo: logica::donde_cambiarlo(plataforma()).into(),
    }
}

/// Qué sabe esta app de la ubicación del aparato. No pregunta nada.
#[tauri::command]
pub async fn ubicacion_estado(app: AppHandle) -> EstadoUbicacion {
    let r = tauri::async_runtime::spawn_blocking(move || estado_bloqueante(&app)).await;
    r.unwrap_or_else(|_| no_disponible())
}

#[allow(unused_variables)]
fn estado_bloqueante(app: &AppHandle) -> EstadoUbicacion {
    #[cfg(target_os = "macos")]
    {
        let (permiso, servicios) = crate::ubicacion_macos::estado(app);
        return EstadoUbicacion {
            version: logica::VERSION_UBICACION,
            plataforma: "macos".into(),
            disponible: permiso != Permiso::NoDisponible,
            permiso,
            servicios,
            vigilando: crate::ubicacion_macos::vigilando(),
            donde_cambiarlo: logica::donde_cambiarlo("macos").into(),
        };
    }
    #[cfg(target_os = "android")]
    {
        let Some(e) = dir_android(app).and_then(|d| logica::leer_estado(&d)) else { return no_disponible() };
        return EstadoUbicacion {
            version: logica::VERSION_UBICACION,
            plataforma: "android".into(),
            disponible: true,
            permiso: logica::permiso_de_texto(&e.permiso),
            servicios: e.servicios,
            vigilando: e.vigilando,
            donde_cambiarlo: logica::donde_cambiarlo("android").into(),
        };
    }
    #[allow(unreachable_code)]
    no_disponible()
}

/// Una medida de ahora. `pedir`: la persona acaba de pulsar «Usar mi ubicación» (puede salir el aviso del sistema).
#[tauri::command]
pub async fn ubicacion_ahora(app: AppHandle, pedir: Option<bool>) -> RespuestaFix {
    let pedir = pedir.unwrap_or(false);
    let r = tauri::async_runtime::spawn_blocking(move || ahora_bloqueante(&app, pedir)).await;
    r.unwrap_or_else(|_| RespuestaFix::fallo(Codigo::NoDisponible, plataforma()))
}

#[allow(unused_variables)]
fn ahora_bloqueante(app: &AppHandle, pedir: bool) -> RespuestaFix {
    #[cfg(target_os = "macos")]
    {
        return crate::ubicacion_macos::ahora(app, pedir);
    }
    #[cfg(target_os = "android")]
    {
        let (d, id) = match enviar_android(app, "ahora", pedir) {
            Ok(x) => x,
            Err(_) => return sin_modulo(),
        };
        // Con aviso del sistema la persona tarda; sin él, Kotlin contesta en segundos.
        let tope = Duration::from_secs(if pedir { 130 } else { 40 });
        let t0 = Instant::now();
        while t0.elapsed() < tope {
            std::thread::sleep(Duration::from_millis(200));
            if let Some(r) = logica::leer_estado(&d).and_then(|e| logica::respuesta_a(&e, id, "android")) {
                return r;
            }
        }
        return RespuestaFix::fallo(Codigo::SinFijar, "android");
    }
    #[allow(unreachable_code)]
    RespuestaFix::fallo(Codigo::NoDisponible, plataforma())
}

#[tauri::command]
pub async fn ubicacion_vigilar(app: AppHandle) -> bool {
    tauri::async_runtime::spawn_blocking(move || orden_bloqueante(&app, true)).await.unwrap_or(false)
}

#[tauri::command]
pub async fn ubicacion_parar(app: AppHandle) -> bool {
    tauri::async_runtime::spawn_blocking(move || orden_bloqueante(&app, false)).await.unwrap_or(false)
}

#[allow(unused_variables)]
fn orden_bloqueante(app: &AppHandle, vigilar: bool) -> bool {
    #[cfg(target_os = "macos")]
    {
        if vigilar {
            crate::ubicacion_macos::vigilar(app);
        } else {
            crate::ubicacion_macos::parar(app);
        }
        return true;
    }
    #[cfg(target_os = "android")]
    {
        return enviar_android(app, if vigilar { "vigilar" } else { "parar" }, false).is_ok();
    }
    #[allow(unreachable_code)]
    false
}

/// Lo último medido, sin esperar.
#[tauri::command]
pub async fn ubicacion_ultima(app: AppHandle) -> RespuestaFix {
    let r = tauri::async_runtime::spawn_blocking(move || ultima_bloqueante(&app)).await;
    r.unwrap_or_else(|_| RespuestaFix::fallo(Codigo::NoDisponible, plataforma()))
}

#[allow(unused_variables)]
fn ultima_bloqueante(app: &AppHandle) -> RespuestaFix {
    #[cfg(target_os = "macos")]
    {
        return crate::ubicacion_macos::ultima(app);
    }
    #[cfg(target_os = "android")]
    {
        return match dir_android(app).and_then(|d| logica::leer_estado(&d)) {
            Some(e) => logica::ultima_de(&e, "android"),
            None => sin_modulo(),
        };
    }
    #[allow(unreachable_code)]
    RespuestaFix::fallo(Codigo::NoDisponible, plataforma())
}
