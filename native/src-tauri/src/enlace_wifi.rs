// ═══════════════════════════════════════════════════════════════════════════
// enlace_wifi — comandos del enlace Wi-Fi directo entre neuronas, sin router (WFD1108A, 2026-11-08).
// Contrato: architecture/wifi-directo.md. Lo puro (con pruebas) está en enlace_wifi_logica.rs.
// ---------------------------------------------------------------------------
// La web negocia (firmado y cifrado) y aquí solo se toca la radio:
//   · Android: Rust escribe peticion.json y Kotlin (EnlaceWifiDirecto.kt, inyectado por build.rs)
//     levanta el punto de acceso local o el grupo Wi-Fi Direct, o se une a uno; contesta en estado.json.
//   · macOS: CoreWLAN (enlace_wifi_macos.rs) se une a la red del Android y, al cerrar, deja la red y
//     vuelve a la de antes; sin Ubicación o sin la red a la vista, la vía guiada (la persona se une a mano
//     desde el menú Wi-Fi y `enlace_wifi_comprobar` detecta que ya está dentro).
//   · Linux (LNX1109B): wpa_supplicant P2P por D-Bus (grupo propio DIRECT-xy-StarSeed) y NetworkManager (unirse en una
//     tarjeta libre) sin dejar el Wi-Fi de casa: enlace_wifi_linux.rs.
//   · Resto: «no disponible» con su porqué (Windows e iOS: fuera de esta ola).
// Comandos: `enlace_wifi_capacidades`, `enlace_wifi_permiso`, `enlace_wifi_abrir_ap`,
// `enlace_wifi_credenciales`, `enlace_wifi_unirse`, `enlace_wifi_estado`, `enlace_wifi_cerrar`,
// `enlace_wifi_comprobar`. Evento: `enlace-wifi://estado` (cuando cambia lo nativo).
// ═══════════════════════════════════════════════════════════════════════════

use crate::enlace_wifi_logica as logica;
pub use logica::{CapacidadesWifi, CredencialesNativas, EstadoEnlaceWifi};
use serde::Serialize;
use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4, TcpStream, UdpSocket};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

pub fn ahora_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Sube cada vez que cambia el estado nativo (macOS); en Android lo dicen las fechas de los archivos.
#[cfg_attr(target_os = "android", allow(dead_code))]
pub static VERSION: AtomicU64 = AtomicU64::new(0);
static VIGIA: AtomicBool = AtomicBool::new(false);

/// Vigía del estado: emite `enlace-wifi://estado` cuando cambia (una sola vez por proceso).
fn vigilar(app: &AppHandle) {
    #[cfg(target_os = "android")]
    {
        // Respaldo de la carpeta si el guardián de antenas no arrancó (STARSEED_SIN_SERVICIO_ANDROID):
        // en Android `app_data_dir` es dataDir y filesDir cuelga de él (como canal_actualizacion.rs).
        use tauri::Manager;
        if DIR_APP.get().is_none() {
            if let Ok(d) = app.path().app_data_dir() {
                let _ = DIR_APP.set(d.join("files").join("starseed").join(logica::CARPETA_ANDROID));
            }
        }
    }
    if VIGIA.swap(true, Ordering::SeqCst) {
        return;
    }
    let h = app.clone();
    let _ = std::thread::Builder::new().name("starseed-enlace-wifi".into()).spawn(move || {
        let mut ultima = String::new();
        loop {
            std::thread::sleep(Duration::from_millis(500));
            let firma = firma_estado();
            if firma != ultima {
                ultima = firma;
                let _ = h.emit(logica::EVENTO, estado_actual(&h));
            }
        }
    });
}

#[cfg(target_os = "android")]
fn firma_estado() -> String {
    let Some(d) = dir_android() else { return String::new() };
    let fecha = |n: &str| std::fs::metadata(d.join(n)).and_then(|m| m.modified()).map(|t| format!("{t:?}")).unwrap_or_default();
    format!("{}|{}", fecha(logica::ESTADO), fecha(logica::PUENTE))
}

#[cfg(not(target_os = "android"))]
fn firma_estado() -> String {
    VERSION.load(Ordering::Relaxed).to_string()
}

// ─────────────────────────────── Android ───────────────────────────────

#[cfg(target_os = "android")]
static DIR_APP: std::sync::OnceLock<std::path::PathBuf> = std::sync::OnceLock::new();

/// La carpeta que comparte con EnlaceWifiDirecto.kt: la del guardián (si arrancó) o la de la app; la
/// primera que tenga el `puente.json` de Kotlin.
#[cfg(target_os = "android")]
fn dir_android() -> Option<std::path::PathBuf> {
    let candidatas: Vec<std::path::PathBuf> = crate::android::dir_datos()
        .map(|d| d.join(logica::CARPETA_ANDROID))
        .into_iter()
        .chain(DIR_APP.get().cloned())
        .collect();
    candidatas.iter().find(|d| d.join(logica::PUENTE).is_file()).cloned().or_else(|| candidatas.into_iter().next())
}

/// La carpeta compartida con Kotlin, solo si Kotlin dejó su `puente.json` (si no, este APK no lo trae).
#[cfg(target_os = "android")]
fn dir_con_puente() -> Result<std::path::PathBuf, String> {
    let d = dir_android().ok_or("La parte Android de StarSeed no arrancó (sin carpeta compartida).")?;
    if logica::leer_puente(&d).is_none() {
        return Err("Este APK no trae el enlace Wi-Fi directo (llegó con WFD1108A): actualízalo.".into());
    }
    Ok(d)
}

#[cfg(target_os = "android")]
fn pedir_android(texto: Result<String, String>) -> Result<EstadoEnlaceWifi, String> {
    let d = dir_con_puente()?;
    logica::escribir_atomico(&d, logica::PETICION, &texto?)?;
    Ok(logica::leer_estado(&d))
}

// ─────────────────────────────── Estado ───────────────────────────────

#[cfg(target_os = "android")]
fn estado_actual(_app: &AppHandle) -> EstadoEnlaceWifi {
    dir_android().map(|d| logica::leer_estado(&d)).unwrap_or_default()
}

#[cfg(target_os = "macos")]
fn estado_actual(_app: &AppHandle) -> EstadoEnlaceWifi {
    crate::enlace_wifi_macos::estado()
}

// LNX1109B: Linux lleva su propio estado (wpa_supplicant / NetworkManager por D-Bus, enlace_wifi_linux.rs).
#[cfg(target_os = "linux")]
fn estado_actual(_app: &AppHandle) -> EstadoEnlaceWifi {
    crate::enlace_wifi_linux::estado()
}

#[cfg(not(any(target_os = "android", target_os = "macos", target_os = "linux")))]
fn estado_actual(_app: &AppHandle) -> EstadoEnlaceWifi {
    EstadoEnlaceWifi::default()
}

#[cfg(target_os = "android")]
fn capacidades_actuales() -> CapacidadesWifi {
    logica::capacidades_android(dir_android().and_then(|d| logica::leer_puente(&d)).as_ref())
}

#[cfg(target_os = "macos")]
fn capacidades_actuales() -> CapacidadesWifi {
    // (WFA1109A) + AWDL (Mac ↔ Mac, sin router ni hotspot) si Network.framework trae el API peer-to-peer.
    let mut c = crate::enlace_wifi_macos::capacidades();
    c.lanas = crate::awdl_macos::lanas();
    c
}

#[cfg(target_os = "linux")]
fn capacidades_actuales() -> CapacidadesWifi {
    crate::enlace_wifi_linux::capacidades()
}

#[cfg(not(any(target_os = "android", target_os = "macos", target_os = "linux")))]
fn capacidades_actuales() -> CapacidadesWifi {
    logica::capacidades_sin_soporte(
        std::env::consts::OS,
        "Este sistema aún no abre enlaces Wi-Fi directos (Android levanta la red; macOS se une a ella). Windows y Linux, en otra ola.",
    )
}

// ─────────────────────────────── Comandos ───────────────────────────────

/// Lo que puede este aparato (punto de acceso, cliente, permiso, una sola radio…).
#[tauri::command]
pub fn enlace_wifi_capacidades(app: AppHandle) -> CapacidadesWifi {
    vigilar(&app);
    capacidades_actuales()
}

/// Pide el permiso del sistema: «Dispositivos cercanos»/«Ubicación» (Android) o «Ubicación» (macOS, para
/// que CoreWLAN vea el nombre de la red). Devuelve las capacidades de ahora (el cambio llega por evento).
#[tauri::command]
pub fn enlace_wifi_permiso(app: AppHandle) -> CapacidadesWifi {
    vigilar(&app);
    #[cfg(target_os = "android")]
    {
        if let Ok(d) = dir_con_puente() {
            let _ = logica::escribir_atomico(&d, logica::PETICION, &logica::peticion_permiso(ahora_ms()));
        }
    }
    #[cfg(target_os = "macos")]
    {
        crate::enlace_wifi_macos::pedir_ubicacion(&app);
    }
    capacidades_actuales()
}

/// Levanta la red directa (solo Android): `metodo` = «hotspot-local» | «wifi-direct».
#[tauri::command]
pub fn enlace_wifi_abrir_ap(app: AppHandle, sesion: String, metodo: String, yo: Option<String>, otro: Option<String>) -> Result<EstadoEnlaceWifi, String> {
    vigilar(&app);
    #[cfg(target_os = "android")]
    {
        pedir_android(logica::peticion_abrir_ap_con(&sesion, &metodo, ahora_ms(), yo.as_deref(), otro.as_deref())) // WFA1109A: huellas para Wi-Fi Aware
    }
    #[cfg(target_os = "linux")]
    {
        let _ = (yo, otro); // LNX1109B: las huellas son de Wi-Fi Aware (Android)
        Ok(crate::enlace_wifi_linux::abrir_ap(sesion, metodo))
    }
    #[cfg(not(any(target_os = "android", target_os = "linux")))]
    {
        let _ = (metodo, yo, otro);
        Ok(logica::estado_error(
            Some(&sesion),
            "sin-soporte",
            "Este aparato no puede levantar una red directa: lo hace el Android (macOS no tiene Wi-Fi Direct ni API de punto de acceso).",
            ahora_ms(),
        ))
    }
}

/// Nombre y contraseña de la red que levantó ESTE aparato en esa sesión (la web los cifra para el otro).
#[tauri::command]
pub fn enlace_wifi_credenciales(sesion: String) -> Option<CredencialesNativas> {
    #[cfg(target_os = "android")]
    {
        dir_android().and_then(|d| logica::leer_credenciales(&d, &sesion))
    }
    #[cfg(target_os = "linux")]
    {
        crate::enlace_wifi_linux::credenciales(&sesion) // LNX1109B
    }
    #[cfg(not(any(target_os = "android", target_os = "linux")))]
    {
        let _ = sesion;
        None
    }
}

/// Se une a la red del otro: Android a un grupo Wi-Fi Direct; macOS con CoreWLAN (o guiado).
#[tauri::command]
pub fn enlace_wifi_unirse(
    app: AppHandle,
    sesion: String,
    metodo: String,
    ssid: String,
    clave: String,
    ip_ap: Option<String>,
    yo: Option<String>,
    otro: Option<String>,
) -> Result<EstadoEnlaceWifi, String> {
    vigilar(&app);
    if !logica::ssid_valido(&ssid) || !logica::clave_valida(&clave) || !logica::sesion_valida(&sesion) {
        return Err("El nombre, la contraseña o la sesión no son válidos: no se toca la radio.".into());
    }
    #[cfg(target_os = "android")]
    {
        pedir_android(logica::peticion_unirse_con(&sesion, &metodo, &ssid, &clave, ip_ap.as_deref(), ahora_ms(), yo.as_deref(), otro.as_deref())) // WFA1109A
    }
    #[cfg(target_os = "macos")]
    {
        let _ = (&yo, &otro); // WFA1109A: las huellas son de Wi-Fi Aware (Android)
        Ok(crate::enlace_wifi_macos::unirse(&app, sesion, metodo, ssid, clave, ip_ap))
    }
    #[cfg(target_os = "linux")]
    {
        let _ = (yo, otro); // LNX1109B
        Ok(crate::enlace_wifi_linux::unirse(sesion, metodo, ssid, clave, ip_ap))
    }
    #[cfg(not(any(target_os = "android", target_os = "macos", target_os = "linux")))]
    {
        let _ = (metodo, clave, ip_ap, yo, otro);
        Ok(logica::estado_error(Some(&sesion), "sin-soporte", "Este sistema aún no se une solo a una red directa.", ahora_ms()))
    }
}

/// Lo último que dijo la parte nativa (sin contraseña).
#[tauri::command]
pub fn enlace_wifi_estado(app: AppHandle) -> EstadoEnlaceWifi {
    vigilar(&app);
    estado_actual(&app)
}

/// Cierra la red directa de esa sesión: Android la apaga; el Mac la deja y vuelve a su red de antes.
#[tauri::command]
pub fn enlace_wifi_cerrar(app: AppHandle, sesion: String) -> Result<EstadoEnlaceWifi, String> {
    vigilar(&app);
    #[cfg(target_os = "android")]
    {
        pedir_android(logica::peticion_cerrar(&sesion, ahora_ms()))
    }
    #[cfg(target_os = "macos")]
    {
        Ok(crate::enlace_wifi_macos::cerrar(&app, sesion))
    }
    #[cfg(target_os = "linux")]
    {
        Ok(crate::enlace_wifi_linux::cerrar(sesion)) // LNX1109B
    }
    #[cfg(not(any(target_os = "android", target_os = "macos", target_os = "linux")))]
    {
        let _ = sesion;
        Ok(estado_actual(&app))
    }
}

#[derive(Serialize, Clone, Debug)]
pub struct Comprobacion {
    /// Se llega al canal TCP del otro (ya está en la red directa).
    pub alcanzable: bool,
    /// IP local con la que este aparato llega a esa IP (la suya en la red directa).
    pub ip_local: Option<String>,
    pub ms: Option<u64>,
}

/// IP local que el sistema usaría para llegar a `ip` (sin mandar nada: un UDP «conectado»).
pub fn ip_local_hacia(ip: Ipv4Addr, puerto: u16) -> Option<Ipv4Addr> {
    let s = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0)).ok()?;
    s.connect(SocketAddrV4::new(ip, puerto)).ok()?;
    match s.local_addr().ok()? {
        SocketAddr::V4(a) if !a.ip().is_unspecified() => Some(*a.ip()),
        _ => None,
    }
}

/// ¿Ya se llega al canal local del otro por la red directa? (vía guiada y comprobación tras unirse).
#[tauri::command]
pub async fn enlace_wifi_comprobar(ip: String, puerto: Option<u16>) -> Result<Comprobacion, String> {
    let ip4 = crate::malla_local_trama::ip_local(&ip).ok_or_else(|| format!("«{ip}» no es una dirección de red local."))?;
    let puerto = puerto.filter(|p| *p >= 1024).unwrap_or(logica::PUERTO_CANAL);
    tauri::async_runtime::spawn_blocking(move || {
        let local = ip_local_hacia(ip4, puerto);
        // Solo cuenta si la IP local está en la misma red directa (y no se llega por el router de casa).
        let en_subred = local.map(|l| logica::misma_subred(l, ip4)).unwrap_or(false);
        let t0 = Instant::now();
        let ok = en_subred && TcpStream::connect_timeout(&SocketAddr::V4(SocketAddrV4::new(ip4, puerto)), Duration::from_millis(900)).is_ok();
        Comprobacion { alcanzable: ok, ip_local: local.filter(|_| en_subred).map(|l| l.to_string()), ms: ok.then(|| t0.elapsed().as_millis() as u64) }
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn ip_local_hacia_loopback() {
        // Sin red no hay ruta a una IP privada, pero a 127.0.0.1 siempre: la IP local es la de loopback.
        assert_eq!(ip_local_hacia(Ipv4Addr::LOCALHOST, 47071), Some(Ipv4Addr::LOCALHOST));
    }

    #[test]
    fn capacidades_en_un_sistema_sin_enlace() {
        #[cfg(not(any(target_os = "android", target_os = "macos", target_os = "linux")))]
        {
            let c = capacidades_actuales();
            assert!(c.ap.is_empty() && c.cliente.is_empty());
            assert_eq!(c.permiso, "no-aplica");
            assert!(c.motivo.contains("Android"));
        }
    }
}
