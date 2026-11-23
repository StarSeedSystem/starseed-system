// ═══════════════════════════════════════════════════════════════════════════
// ble_enlace_diagnostico — Diagnóstico puro para evitar listo-tarde y
// le-connection-abort-by-local en BLE (LNX1108C/BLX1118A · 2026-11-22).
// Contrato: architecture/bluetooth-directo.md. 100 % std: se prueba en cualquier sistema,
// incluida la Mac y Linux, sin dependencias de radio ni D-Bus.
// ---------------------------------------------------------------------------
// Problemas detectados en Ronda 1 (22-11, 0.5.1-prueba.57):
//   · Maggabox Linux: org.bluez.Error.Failed: le-connection-abort-by-local al conectar
//     a Maggaboard Android (mientras escanea o justo tras parar escaneo sin espera
//     suficiente).
//   · MaggaBook macOS: listo-tarde (sin listo para escribir en 400 ms) + Bluetooth
//     directo: sin acuse por Bluetooth tras 4 intentos.
// ═══════════════════════════════════════════════════════════════════════════

#![allow(dead_code)]

/// Errores comunes de conexión BLE detectados en esta ronda.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorConexionBle {
    /// `org.bluez.Error.Failed: le-connection-abort-by-local`: BlueZ/el controlador abortó el
    /// intento típico con el escaneo encendido o sin tiempo suficiente de espera después de
    /// parar el escaneo.
    LeConnectionAbortByLocal,
    /// `listo-tarde (sin listo para escribir en 400 ms)`: el GATT no está listo para escribir
    /// dentro del tiempo esperado después de conectar.
    ListoTarde,
    /// Sin error detectado.
    Ok,
}

/// Tiempo recomendado (ms) para esperar después de parar el escaneo BlueZ antes de
/// intentar conectar.
///
/// Los controladores que no pueden explorar y conectar a la vez fallan si se conecta
/// muy pronto después de parar el escaneo. Este valor evita el error
/// `le-connection-abort-by-local`.
pub const TIEMPO_DESARROLLO_DESDE_PARAR_ESCANEO_MS: u64 = 500;

/// Backoff inicial (ms) antes de reintentar el acuse GATT después de fallar.
/// Se duplica cada fallo hasta alcanzar el tope.
pub const BACKOFF_GATT_INICIAL_MS: u64 = 200;

/// Tope máximo de backoff GATT en ms. Pasado este valor, cada nuevo reintentó usa el tope.
pub const BACKOFF_GATT_TOPE_MS: u64 = 2000;

/// Número máximo de reintentos GATT antes de penalizar el enlace (b1/b2).
/// Después de este límite, el enlace se da por fallen y se reintentará más tarde.
pub const MAX_REINTENTOS_GATT: u8 = 4;

/// Clasifica un error de conexión BLE a partir del nombre y mensaje de error.
///
/// Devuelve `LeConnectionAbortByLocal` si contiene "abort-by-local",
/// `ListoTarde` si contiene "listo-tarde" o "sin listo para escribir", o `Ok` en otro caso.
pub fn clasificar_error(nombre: &str, mensaje: &str) -> ErrorConexionBle {
    let n = nombre.to_ascii_lowercase();
    let m = mensaje.to_ascii_lowercase();

    if n.contains("abort-by-local")
        || m.contains("abort by local")
        || m.contains("le-connection-abort-by-local")
    {
        ErrorConexionBle::LeConnectionAbortByLocal
    } else if m.contains("listo-tarde") || m.contains("sin listo para escribir") {
        ErrorConexionBle::ListoTarde
    } else {
        ErrorConexionBle::Ok
    }
}

/// Cuánto tiempo recomendar esperar después de parar el escaneo BlueZ antes de
/// intentar conectar.
///
/// Devuelve el valor constante `TIEMPO_DESARROLLO_DESDE_PARAR_ESCANEO_MS` (500 ms).
pub fn tiempo_después_parar_escaneo() -> u64 {
    TIEMPO_DESARROLLO_DESDE_PARAR_ESCANEO_MS
}

/// Backoff escalonado para el acuse GATT. Devuelve el próximo intervalo de espera en ms.
///
/// # Lógica
/// - Empieza en `BACKOFF_GATT_INICIAL_MS` (200 ms).
/// - Se duplica cada fallo (200 → 400 → 800 → 1600 → tope 2000).
/// - Después de `MAX_REINTENTOS_GATT` reintentos, retorna `None` para indicar que se debe
///   penalizar el enlace (b1/b2) y reintentar más tarde.
pub fn backoff_gatt(fallos: u8) -> Option<u64> {
    let n = fallos.saturating_sub(1); // fallos ya cuenta desde 1
    let intervalo = BACKOFF_GATT_INICIAL_MS.saturating_mul(1u64 << n);
    if intervalo > BACKOFF_GATT_TOPE_MS {
        None
    } else {
        Some(intervalo)
    }
}

/// Verifica si se debe penalizar el enlace (b1/b2) después de tantos reintentos GATT fallidos.
///
/// Returns `true` if we've exceeded max retries and should penalize the link.
pub fn deberia_penalizar_enlace(fallos_gatt: u8) -> bool {
    fallos_gatt >= MAX_REINTENTOS_GATT
}

/// Calcula el tiempo total acumulado de backoff GATT para `n` fallos.
pub fn tiempo_total_backoff_gatt(n: u8) -> u64 {
    let mut total = 0u64;
    for i in 0..n {
        let intervalo = BACKOFF_GATT_INICIAL_MS.saturating_mul(1u64 << i);
        if intervalo > BACKOFF_GATT_TOPE_MS {
            total += BACKOFF_GATT_TOPE_MS;
        } else {
            total += intervalo;
        }
    }
    total
}

/// Constructor de mensaje de diagnóstico para mostrar al usuario.
pub fn mensaje_diagnostico(error: ErrorConexionBle, fallos_gatt: u8) -> String {
    match error {
        ErrorConexionBle::LeConnectionAbortByLocal => format!(
            "Error de conexión: {} — se recomienda esperar {} ms después de parar el escaneo antes de conectar, \
             y usar backoff GATT de {} ms entre reintentos (máximo {} reintentos).",
            error,
            TIEMPO_DESARROLLO_DESDE_PARAR_ESCANEO_MS,
            BACKOFF_GATT_INICIAL_MS,
            MAX_REINTENTOS_GATT
        ),
        ErrorConexionBle::ListoTarde => format!(
            "GATT no listo a tiempo — {} reintentos GATT realizados. \
             Tiempo total de backoff: {} ms. {}",
            fallos_gatt,
            tiempo_total_backoff_gatt(fallos_gatt),
            if fallos_gatt >= MAX_REINTENTOS_GATT {
                "Penalizar enlace (b1/b2) y reintentar más tarde"
            } else {
                "Continuar con backoff exponencial"
            }
        ),
        ErrorConexionBle::Ok => "Sin errores de conexión detectados".to_string(),
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn errores_se_clasifican_correctamente() {
        assert_eq!(
            clasificar_error("org.bluez.Error.Failed", "le-connection-abort-by-local"),
            ErrorConexionBle::LeConnectionAbortByLocal
        );
        assert_eq!(
            clasificar_error(
                "org.bluez.Error.Failed",
                "listo-tarde (sin listo para escribir en 400 ms)"
            ),
            ErrorConexionBle::ListoTarde
        );
        assert_eq!(
            clasificar_error("org.bluez.Error.Success", "todo bien"),
            ErrorConexionBle::Ok
        );
    }

    #[test]
    fn backoff_gatt_crece_exponencialmente() {
        assert_eq!(backoff_gatt(1), Some(200)); // inicial
        assert_eq!(backoff_gatt(2), Some(400)); // 200 * 2
        assert_eq!(backoff_gatt(3), Some(800)); // 200 * 4
        assert_eq!(backoff_gatt(4), Some(1600)); // 200 * 8
        assert_eq!(backoff_gatt(5), None); // tope 2000, 1600 ≤ 2000, siguiente 3200 > 2000
        // backoff_gatt(1): n=1, n-1=0, 200 << 0 = 200 ✓
        // backoff_gatt(2): n=2, n-1=1, 200 << 1 = 400 ✓
        // backoff_gatt(3): n=3, n-1=2, 200 << 2 = 800 ✓
        // backoff_gatt(4): n=4, n-1=3, 200 << 3 = 1600 ✓ (1600 ≤ 2000)
        // backoff_gatt(5): n=5, n-1=4, 200 << 4 = 3200 > 2000, returns None ✓
    }

    #[test]
    fn deberia_penalizar_enlace() {
        assert!(!deberia_penalizar_enlace(0));
        assert!(!deberia_penalizar_enlace(3));
        assert!(deberia_penalizar_enlace(4));
        assert!(deberia_penalizar_enlace(MAX_REINTENTOS_GATT));
    }

    #[test]
    fn tiempo_total_backoff_gatt() {
        // 1 fallo: 200 ms
        assert_eq!(tiempo_total_backoff_gatt(1), 200);
        // 2 fallos: 200 + 400 = 600 ms
        assert_eq!(tiempo_total_backoff_gatt(2), 600);
        // 3 fallos: 200 + 400 + 800 = 1400 ms
        assert_eq!(tiempo_total_backoff_gatt(3), 1400);
        // 4 fallos: 200 + 400 + 800 + 1600 = 3000 ms (1600 ≤ 2000, incluido totalmente)
        assert_eq!(tiempo_total_backoff_gatt(4), 3000);
    }

    #[test]
    fn mensaje_diagnostico_ok() {
        assert_eq!(
            mensaje_diagnostico(ErrorConexionBle::Ok, 0),
            "Sin errores de conexión detectados"
        );
    }

    #[test]
    fn mensaje_diagnostico_aborto_local() {
        let msg = mensaje_diagnostico(ErrorConexionBle::LeConnectionAbortByLocal, 0);
        assert!(msg.contains("Error de conexión"));
        assert!(msg.contains("le-connection-abort-by-local"));
        assert!(msg.contains("500 ms"));
        assert!(msg.contains("200 ms"));
        assert!(msg.contains("4 reintentos"));
    }

    #[test]
    fn mensaje_diagnostico_listo_tarde() {
        let msg = mensaje_diagnostico(ErrorConexionBle::ListoTarde, 3);
        assert!(msg.contains("3 reintentos GATT"));
        assert!(msg.contains("1400 ms"));
        assert!(msg.contains("Continuar con backoff"));
    }
}