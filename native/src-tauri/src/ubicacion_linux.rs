// ═══════════════════════════════════════════════════════════════════════════
// ubicacion_linux — la posición del aparato en Linux por GeoClue2 (PRM1119A, 2026-11-19).
// Contrato: architecture/ubicacion-nativa.md.
// ---------------------------------------------------------------------------
// WebKitGTK ya concede `navigator.geolocation` a las páginas propias (permisos_medios.rs), pero su
// proveedor interno puede no dar posición. Esta es la vía nativa de respaldo: el comando
// `ubicacion_linux_ahora` habla con GeoClue2 por D-Bus (`org.freedesktop.GeoClue2`) en el bus del
// sistema, se registra con el identificador de escritorio de la app y devuelve la misma `RespuestaFix`
// que macOS y Android. Nada se redondea; no se escribe en ninguna base de permisos del sistema.
// ═══════════════════════════════════════════════════════════════════════════

use crate::ubicacion_logica::{self as logica, Codigo, RespuestaFix};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use zbus::blocking::{Connection, Proxy};

/// Nivel de precisión pedido (6 = calle; GeoClue admite 1 país … 8 exacta).
pub const NIVEL_PRECISION: u32 = 6;
/// Cuánto esperar una medida antes de decir «sin fijar».
pub const ESPERA_MEDIDA: Duration = Duration::from_secs(25);
/// Una medida con más de esto no sirve como «la de ahora».
pub const MAX_EDAD_MS: u64 = 60_000;
const SERVICIO: &str = "org.freedesktop.GeoClue2";
const RUTA_GESTOR: &str = "/org/freedesktop/GeoClue2/Manager";
const RUTA_AGENTE: &str = "/org/freedesktop/GeoClue2/Agent";
const RUTA_CLIENTE: &str = "org.freedesktop.GeoClue2.Client";
const RUTA_UBICACION: &str = "org.freedesktop.GeoClue2.Location";

fn ahora_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// El agente que GeoClue consulta antes de dar una posición. Autoriza lo que pide la app.
struct Agente;

#[zbus::interface(name = "org.freedesktop.GeoClue2.Agent")]
impl Agente {
    /// `(autorizado, precisión permitida)`. Nunca se concede más de `NIVEL_PRECISION`.
    #[zbus(name = "AuthorizeApp")]
    fn authorize_app(&self, _desktop_id: String, pedido: u32) -> (bool, u32) {
        (true, pedido.min(NIVEL_PRECISION))
    }

    /// La precisión máxima que este agente permite a cualquier cliente.
    #[zbus(property, name = "MaxAccuracyLevel")]
    fn max_accuracy_level(&self) -> u32 {
        NIVEL_PRECISION
    }
}

fn leer_f64(p: &Proxy<'_>, prop: &str) -> Option<f64> {
    p.get_property::<f64>(prop).ok()
}

/// La última posición que GeoClue tiene para este cliente, si ya hay una.
fn leer_fix(cliente: &Proxy<'_>) -> Option<logica::Fix> {
    let ruta: zbus::zvariant::OwnedObjectPath = cliente.get_property("Location").ok()?;
    if ruta.as_str().is_empty() {
        return None;
    }
    let loc = Proxy::new(cliente.connection(), SERVICIO.to_string(), ruta.to_string(), RUTA_UBICACION.to_string()).ok()?;
    let t: (u64, u64) = loc.get_property("Timestamp").ok()?;
    let altitud = leer_f64(&loc, "Altitude").unwrap_or(f64::MIN);
    let rumbo = leer_f64(&loc, "Heading").unwrap_or(-1.0);
    let velocidad = leer_f64(&loc, "Speed").unwrap_or(-1.0);
    logica::fix_de_geoclue(leer_f64(&loc, "Latitude")?, leer_f64(&loc, "Longitude")?, leer_f64(&loc, "Accuracy")?, altitud, rumbo, velocidad, t)
}

/// El cliente de GeoClue, ya registrado como agente con el identificador de escritorio de la app.
fn cliente_de(conn: &Connection, id: &str) -> Result<Proxy<'static>, zbus::Error> {
    let gestor = Proxy::new(conn, SERVICIO.to_string(), RUTA_GESTOR.to_string(), "org.freedesktop.GeoClue2.Manager".to_string())?;
    let _ = conn.object_server().at(RUTA_AGENTE, Agente);
    // Si ya hay otro agente para este usuario, GeoClue lo usa: no es un fallo nuestro.
    let _ = gestor.call::<_, ()>("AddAgent", &(id,));
    let ruta: zbus::zvariant::OwnedObjectPath = gestor.call("GetClient", &())?;
    Proxy::new(conn, SERVICIO.to_string(), ruta.to_string(), RUTA_CLIENTE.to_string())
}

/// Una medida de ahora por GeoClue2 para la app `id`. Bloquea como mucho `ESPERA_MEDIDA`
/// (llamar desde un hilo de trabajo).
pub fn ahora(id: &str) -> RespuestaFix {
    let Ok(conn) = Connection::system() else {
        return RespuestaFix::fallo(Codigo::NoDisponible, "linux");
    };
    let cliente = match cliente_de(&conn, id) {
        Ok(c) => c,
        Err(e) => return RespuestaFix::fallo(logica::codigo_de_error_geoclue(&e.to_string()), "linux"),
    };
    let _ = cliente.set_property("RequestedAccuracyLevel", NIVEL_PRECISION);
    let _ = cliente.set_property("DistanceThreshold", 0u32);
    let _ = cliente.set_property("TimeThreshold", 0u32);
    if let Err(e) = cliente.call::<_, ()>("Start", &()) {
        return RespuestaFix::fallo(logica::codigo_de_error_geoclue(&e.to_string()), "linux");
    }
    let t0 = Instant::now();
    let mut medida = None;
    while t0.elapsed() < ESPERA_MEDIDA {
        if let Some(f) = leer_fix(&cliente) {
            if logica::es_reciente(&f, ahora_ms(), MAX_EDAD_MS) {
                medida = Some(f);
                break;
            }
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    let _ = cliente.call::<_, ()>("Stop", &());
    match medida {
        Some(f) => RespuestaFix::con(f),
        None => RespuestaFix::fallo(Codigo::SinFijar, "linux"),
    }
}

/// La vía nativa de Linux, con la misma `RespuestaFix` que `ubicacion_ahora` en macOS y Android.
#[tauri::command]
pub async fn ubicacion_linux_ahora(app: tauri::AppHandle) -> RespuestaFix {
    use tauri::Manager;
    let id = app.config().identifier.clone();
    tauri::async_runtime::spawn_blocking(move || ahora(&id))
        .await
        .unwrap_or_else(|_| RespuestaFix::fallo(Codigo::NoDisponible, "linux"))
}
