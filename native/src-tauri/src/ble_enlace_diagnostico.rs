// ═══════════════════════════════════════════════════════════════════════════
// ble_enlace_diagnostico — diagnóstico puro para evitar listo-tarde y le-connection-abort-by-local (CTL1123E).
// ---------------------------------------------------------------------------
// Contrato: architecture/bluetooth-directo.md. Solo std: se prueba en cualquier sistema.
// ---------------------------------------------------------------------------
// Lo que mide este módulo (sin radio, sin D-Bus, sin CoreBluetooth, sin WinRT, sin JNI):
//   · TIEMPO DE ASENTAMIENTO: cuánto esperar ENTRE parar el escaneo BlueZ y llamar a
//     `Device1.Connect()`, para que el controlador no aborte la conexión con
//     `le-connection-abort-by-local` (típico en controladores que no pueden explorar
//     y conectar a la vez, o cuando se lanza `Connect` antes de que el controlador
//     haya soltado los recursos del escaneo).
//   · BACKOFF DE ACUSE GATT: cuánto esperar y cuántas veces reintentar antes de
//     penalizar el enlace b1/b2 (castigos del carril rápido), distinguiendo entre
//     «la radio está atascada» y «el otro aparato tarda en responder».
//
// Entradas: solo constantes y lo que se observa (RSSI, si hay escaneo activo, MTU,
// si el carril rápido está abierto, cuántos acuses llegaron en la ventana).
// Salidas: tiempos recomendados (ms) y decisiones booleanas. Nada muta estado.
// ═══════════════════════════════════════════════════════════════════════════

#![allow(dead_code)]

/// Tiempo base que el controlador BlueZ necesita tras `StopDiscovery` antes de
/// aceptar `Device1.Connect()` sin abortar por `le-connection-abort-by-local`.
/// Medido en el nodo (MagaBox Linux, BlueZ 5.82, controlador Intel/AMD): 300 ms
/// era insuficiente con carga; 500 ms funciona en la mayoría de casos.
pub const ASENTAMIENTO_BASE_MS: u64 = 500;

/// Margen extra por cada conexión LE pendiente que el controlador esté gestionando
/// (además de la que vamos a abrir). Los controladores antiguos solo admiten una
/// conexión LE pendiente; si ya hay una, el asentamiento debe ser mayor.
pub const ASENTAMIENTO_POR_CONEXION_PENDIENTE_MS: u64 = 300;

/// Tope del asentamiento recomendado (no esperar indefinidamente).
pub const ASENTAMIENTO_MAX_MS: u64 = 2_000;

/// Umbral para considerar que la radio tardó en estar "lista para escribir" (macOS CoreBluetooth).
/// Observado en MaggaBook: `listo-tarde (sin listo para escribir en 400 ms)`.
pub const LISTO_TARDE_UMBRAL_MS: u64 = 400;

/// Diagnóstico de "listo-tarde": la radio (CoreBluetooth en macOS) no notificó
/// `CBPeripheralManagerDelegate.peripheralManagerIsReadyToUpdateSubscribers`
/// dentro del umbral tras encolar una notificación/escritura.
/// `ms_desde_encolar`: milisegundos desde que se pidió a la radio enviar el paquete.
/// Devuelve true si se considera "listo-tarde" (para anotar en el registro).
pub fn es_listo_tarde(ms_desde_encolar: u64) -> bool {
    ms_desde_encolar > LISTO_TARDE_UMBRAL_MS
}

/// ¿Cuántos milisegundos esperar entre `StopDiscovery` y `Connect()`?
/// `escaneo_activo`: true si BlueZ estaba escaneando justo antes (se pidió `StopDiscovery`).
/// `conexiones_pendientes`: cuántas conexiones LE tiene el controlador en curso (excluyendo la que vamos a abrir).
pub fn asentamiento_recomendado_ms(escaneo_activo: bool, conexiones_pendientes: u32) -> u64 {
    if !escaneo_activo {
        return 0;
    }
    let base = ASENTAMIENTO_BASE_MS;
    let extra = ASENTAMIENTO_POR_CONEXION_PENDIENTE_MS * conexiones_pendientes as u64;
    (base + extra).min(ASENTAMIENTO_MAX_MS)
}

/// Parámetros observados del enlace para decidir el backoff de acuse.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ParametrosAcuse {
    /// MTU de ATT negociado (bytes por paquete = MTU − 3).
    pub mtu_att: u16,
    /// Si el carril rápido (L2CAP) está ABIERTO y pasó la autoprueba.
    pub carril_rapido_abierto: bool,
    /// Acuses recibidos en la última ventana de ~5 s (0 = ninguno).
    pub acuses_en_ventana: u64,
    /// RSSI actual (dBm, negativo). ≤ -92: señal muy débil.
    pub rssi: i16,
    /// Si hay tráfico de fondo (latidos, otros mensajes en cola) que compite por el aire.
    pub hay_traffic_fondo: bool,
}

impl Default for ParametrosAcuse {
    fn default() -> Self {
        ParametrosAcuse {
            mtu_att: 23,
            carril_rapido_abierto: false,
            acuses_en_ventana: 0,
            rssi: -90,
            hay_traffic_fondo: false,
        }
    }
}

/// Decisión de backoff para el próximo intento de acuse.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DecisionBackoff {
    /// Milisegundos a esperar antes del siguiente reintento.
    pub espera_ms: u64,
    /// Si se debe penalizar el enlace (b1/b2 → castigos del carril rápido).
    pub penalizar_enlace: bool,
    /// Motivo legible para el registro.
    pub motivo: &'static str,
}

/// Plazo base para esperar un acuse tras entregar el último paquete a la radio.
/// Coincide con `ble_trama::PLAZO_ACUSE_MS` (5 000 ms).
pub const PLAZO_ACUSE_BASE_MS: u64 = 5_000;

/// Factor de escala por reintento (intento 1 → 1×, intento 2 → 1.5×, intento 3 → 2×, intento 4 → 3×).
const FACTORES_REINTENTO: [f64; 4] = [1.0, 1.5, 2.0, 3.0];

/// Tope del backoff (no esperar más de esto entre reintentos).
pub const BACKOFF_MAX_MS: u64 = 30_000;

/// Decide el backoff para el siguiente reintento de acuse.
/// `intento`: 1 = primer intento (recién entregado el último paquete), 2 = primer reintento, …
/// `params`: lo observado ahora mismo.
pub fn backoff_acuse(intento: u8, params: ParametrosAcuse) -> DecisionBackoff {
    let intento = intento.clamp(1, 4) as usize;
    let factor = FACTORES_REINTENTO[intento - 1];

    // Base: PLAZO_ACUSE_BASE_MS escalado por el factor de reintento.
    let mut espera = (PLAZO_ACUSE_BASE_MS as f64 * factor) as u64;

    // Ajuste por MTU: MTU mayor → menos paquetes → acuse más rápido → espera menor.
    let bytes_por_paquete = params.mtu_att.saturating_sub(3) as u64;
    if bytes_por_paquete > 200 {
        espera = espera.saturating_mul(200).saturating_div(bytes_por_paquete);
    }

    // Ajuste por carril rápido: si está abierto y pasó la autoprueba, el acuse viaja
    // por un flujo fiable y ordenado → más predecible → espera base (sin factor extra).
    if params.carril_rapido_abierto {
        espera = PLAZO_ACUSE_BASE_MS * intento as u64; // lineal, no exponencial
    }

    // Ajuste por RSSI: señal débil (≤ -92) duplica la espera; muy débil (≤ -100) la cuadruplica.
    if params.rssi <= -92 {
        espera = espera.saturating_mul(2);
    }
    if params.rssi <= -100 {
        espera = espera.saturating_mul(2);
    }

    // Ajuste por tráfico de fondo: si hay latidos/otros mensajes compitiendo, añadir margen.
    if params.hay_traffic_fondo {
        espera = espera.saturating_add(1_000);
    }

    // Tope.
    espera = espera.min(BACKOFF_MAX_MS);

    // Decisión de penalizar el enlace (b1/b2 → castigos del carril rápido).
    // Penalizar SOLO si:
    //   - Llegamos al intento 4 (último antes de rendirse)
    //   - NO hubo acuses en la ventana reciente (acuses_en_ventana == 0)
    //   - NO hay carril rápido abierto con tráfico de fondo (ese silencio no es culpa del enlace)
    //   - RSSI no es extremadamente malo (≤ -100: el aire es el problema, no el enlace)
    let penalizar = intento == 4
        && params.acuses_en_ventana == 0
        && !(params.carril_rapido_abierto && params.hay_traffic_fondo)
        && params.rssi > -100;

    let motivo = if penalizar {
        "sin acuse tras 4 intentos y sin tráfico reciente: se penaliza el enlace"
    } else if params.carril_rapido_abierto && params.hay_traffic_fondo && params.acuses_en_ventana == 0 {
        "carril rápido abierto con tráfico de fondo: silencio achacable a la app del otro lado"
    } else if params.acuses_en_ventana > 0 {
        "hay acuses recientes: el enlace responde, solo tarda"
    } else {
        "reintento normal"
    };

    DecisionBackoff {
        espera_ms: espera,
        penalizar_enlace: penalizar,
        motivo,
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn asentamiento_cero_si_no_habia_escaneo() {
        assert_eq!(asentamiento_recomendado_ms(false, 0), 0);
        assert_eq!(asentamiento_recomendado_ms(false, 3), 0);
    }

    #[test]
    fn asentamiento_base_con_escaneo_y_sin_otras_conexiones() {
        assert_eq!(asentamiento_recomendado_ms(true, 0), ASENTAMIENTO_BASE_MS);
    }

    #[test]
    fn asentamiento_crece_con_conexiones_pendientes() {
        assert_eq!(
            asentamiento_recomendado_ms(true, 1),
            ASENTAMIENTO_BASE_MS + ASENTAMIENTO_POR_CONEXION_PENDIENTE_MS
        );
        assert_eq!(
            asentamiento_recomendado_ms(true, 2),
            ASENTAMIENTO_BASE_MS + 2 * ASENTAMIENTO_POR_CONEXION_PENDIENTE_MS
        );
    }

    #[test]
    fn asentamiento_tope_no_pasa_de_max() {
        // Con muchas conexiones pendientes no debe superar ASENTAMIENTO_MAX_MS
        assert_eq!(asentamiento_recomendado_ms(true, 100), ASENTAMIENTO_MAX_MS);
    }

    #[test]
    fn backoff_primer_intento_sin_penalizar_si_hay_acuses_recientes() {
        let params = ParametrosAcuse {
            mtu_att: 247,
            carril_rapido_abierto: false,
            acuses_en_ventana: 3,
            rssi: -60,
            hay_traffic_fondo: false,
        };
        let d = backoff_acuse(1, params);
        assert!(!d.penalizar_enlace, "con acuses recientes no se penaliza en el primer intento");
        assert!(d.espera_ms > 0, "siempre hay una espera base");
    }

    #[test]
    fn backoff_penaliza_si_no_hay_acuses_tras_varios_intentos() {
        let params = ParametrosAcuse {
            mtu_att: 23,
            carril_rapido_abierto: false,
            acuses_en_ventana: 0,
            rssi: -85,
            hay_traffic_fondo: false,
        };
        // Intento 4 (el último antes de rendirse): si no hubo acuses en la ventana, se penaliza
        let d = backoff_acuse(4, params);
        assert!(d.penalizar_enlace, "tras 4 intentos sin acuses y sin tráfico reciente, se penaliza");
    }

    #[test]
    fn backoff_no_penaliza_si_carril_rapido_abierto_y_hay_traffic() {
        let params = ParametrosAcuse {
            mtu_att: 247,
            carril_rapido_abierto: true,
            acuses_en_ventana: 0,
            rssi: -55,
            hay_traffic_fondo: true,
        };
        let d = backoff_acuse(3, params);
        assert!(!d.penalizar_enlace, "con carril rápido abierto y tráfico de fondo, el silencio no es culpa del enlace");
    }

    #[test]
    fn backoff_escala_con_intento_y_rssi() {
        let params_bueno = ParametrosAcuse {
            mtu_att: 247,
            carril_rapido_abierto: false,
            acuses_en_ventana: 0,
            rssi: -50,
            hay_traffic_fondo: false,
        };
        let params_malo = ParametrosAcuse {
            mtu_att: 23,
            carril_rapido_abierto: false,
            acuses_en_ventana: 0,
            rssi: -95,
            hay_traffic_fondo: false,
        };
        let d1 = backoff_acuse(1, params_bueno);
        let d2 = backoff_acuse(2, params_bueno);
        let d3 = backoff_acuse(1, params_malo);
        // Con buena señal, el backoff crece menos agresivamente
        assert!(d2.espera_ms >= d1.espera_ms);
        // Con mala señal, el primer backoff ya es mayor
        assert!(d3.espera_ms >= d1.espera_ms);
    }

    #[test]
    fn backoff_tope_no_pasa_de_max() {
        let params = ParametrosAcuse {
            mtu_att: 23,
            carril_rapido_abierto: false,
            acuses_en_ventana: 0,
            rssi: -100,
            hay_traffic_fondo: false,
        };
        let d = backoff_acuse(4, params);
        assert!(d.espera_ms <= BACKOFF_MAX_MS);
    }

    #[test]
    fn listo_tarde_umbral_400_ms() {
        assert!(!es_listo_tarde(399));
        assert!(!es_listo_tarde(400));
        assert!(es_listo_tarde(401));
        assert!(es_listo_tarde(1000));
    }
}