// ═══════════════════════════════════════════════════════════════════════════
// ble_enlace_diagnostico — diagnóstico puro para evitar listo-tarde y le-connection-abort-by-local (CTL1123E).
// ---------------------------------------------------------------------------
// Contrato: architecture/bluetooth-directo.md §17. Solo std: se prueba en cualquier sistema.
// ---------------------------------------------------------------------------
// Lo que miden en Ronda 1 (22-11, 0.5.1-prueba.57):
//   · Maggabox Linux registra `org.bluez.Error.Failed: le-connection-abort-by-local` al conectar a Maggaboard
//     Android (mientras escanea o justo tras parar escaneo sin espera suficiente).
//   · MaggaBook macOS registra `listo-tarde (sin listo para escribir en 400 ms)` +
//     `Bluetooth directo: sin acuse por Bluetooth tras 4 intentos`.
// Este módulo calcula:
//
//   1) TIEMPO DE ASENTAMIENTO recomendado entre `StopDiscovery` y `Device1.Connect()` en BlueZ
//      (evita `le-connection-abort-by-local` por controladores que no exploran y conectan a la vez).
//
//   2) BACKOFF / REINTENTOS de acuse GATT antes de castigar el enlace b1/b2
//      (evita `listo-tarde` y «sin acuse tras 4 intentos» sin dejar huecos que el otro lado interprete
//      como enlace caído).
//
//   Todo es función pura de lo que ya existe en `ble_linux_logica` y `ble_l2cap` (nada nuevo en runtime).
// ═══════════════════════════════════════════════════════════════════════════

#![allow(dead_code)]

/// Qué tan agresivo es el controlador / la pila a la hora de explorar y conectar a la vez.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PerfilControlador {
    /// Controlador moderno (BlueZ ≥ 5.60, kernel ≥ 5.10): admite exploración y conexión LE simultáneas.
    Moderno,
    /// Controlador antiguo (BlueZ < 5.60, kernel < 5.10): `InProgress` y `le-connection-abort-by-local`
    /// si se conecta mientras el escaneo sigue encendido o acaba de pararse.
    Antiguo,
    /// Desconocido: se usa el perfil conservador (Antiguo) por seguridad.
    Desconocido,
}

impl Default for PerfilControlador {
    fn default() -> Self {
        PerfilControlador::Desconocido
    }
}

/// Entrada para el cálculo del tiempo de asentamiento.
#[derive(Debug, Clone, Copy)]
pub struct EntradaAsentamiento {
    /// Perfil del controlador Bluetooth local (BlueZ + kernel).
    pub perfil: PerfilControlador,
    /// Si `true`, el escaneo estaba encendido justo antes de pedir la conexión
    /// (típico: se para para conectar y se vuelve a encender tras el intento).
    pub escaneo_estaba_encendido: bool,
    /// Milisegundos que el escaneo lleva oficialmente «parado» según BlueZ
    /// (None = no se sabe / se acaba de pedir `StopDiscovery`).
    pub ms_desde_parada: Option<u64>,
}

/// Salida del cálculo del tiempo de asentamiento.
#[derive(Debug, Clone)]
pub struct Asentamiento {
    /// Milisegundos MÍNIMOS que hay que esperar tras `StopDiscovery` antes de `Connect()`.
    pub minimo_ms: u64,
    /// Milisegundos RECOMENDADOS (con margen de seguridad) antes de `Connect()`.
    pub recomendado_ms: u64,
    /// Si `true`, el controlador es antiguo y el escaneo DEBE estar parado
    /// durante toda la conexión (no se vuelve a encender hasta que termine).
    pub exige_escaneo_parado: bool,
    /// Texto para el registro (una línea).
    pub detalle: String,
}

/// Calcula el tiempo de asentamiento recomendado entre parar el escaneo BlueZ y `Connect()`.
///
/// Reglas (basadas en BLX1118A y lo medido en Ronda 1):
///   · Controlador moderno: 0 ms (BlueZ gestiona la simultaneidad).
///   · Controlador antiguo:
///       - Si el escaneo YA estaba parado hace ≥ 300 ms: 0 ms extra (ya asentado).
///       - Si el escaneo se acaba de parar (o no se sabe): 300 ms (lo que hace `PausaEscaneo` hoy).
///       - Margen de seguridad: +200 ms sobre el mínimo → 500 ms recomendados.
///   · Perfil desconocido: se asume antiguo (conservador).
pub fn calcular_asentamiento(e: EntradaAsentamiento) -> Asentamiento {
    match e.perfil {
        PerfilControlador::Moderno => Asentamiento {
            minimo_ms: 0,
            recomendado_ms: 0,
            exige_escaneo_parado: false,
            detalle: "controlador moderno: exploración y conexión simultáneas".into(),
        },
        PerfilControlador::Antiguo | PerfilControlador::Desconocido => {
            let ya_asentado = e.ms_desde_parada.is_some_and(|ms| ms >= 300);
            let minimo = if ya_asentado { 0 } else { 300 };
            let recomendado = minimo + 200; // margen de seguridad
            Asentamiento {
                minimo_ms: minimo,
                recomendado_ms: recomendado,
                exige_escaneo_parado: true,
                detalle: format!(
                    "controlador {}: escaneo{} → mínimo {} ms, recomendado {} ms",
                    if e.perfil == PerfilControlador::Antiguo { "antiguo" } else { "desconocido (asume antiguo)" },
                    if e.escaneo_estaba_encendido { " encendido" } else { " ya parado" },
                    minimo,
                    recomendado
                ),
            }
        }
    }
}

/// Qué tan estricta es la pila GATT a la hora de exigir acuses.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PerfilGatt {
    /// Pila que acusa rápido y de forma fiable (Android ≥ 12, macOS ≥ 13, Linux BlueZ ≥ 5.64).
    Rapida,
    /// Pila que puede tardar o perder acuses si el webview está en segundo plano
    /// (Android < 12, macOS < 13, Linux BlueZ < 5.64, o webview sin foco).
    Lenta,
    /// Desconocida: se usa la conservadora (Lenta).
    Desconocida,
}

impl Default for PerfilGatt {
    fn default() -> Self {
        PerfilGatt::Desconocida
    }
}

/// Entrada para el cálculo del backoff de acuse GATT.
#[derive(Debug, Clone, Copy)]
pub struct EntradaBackoffAcuse {
    /// Perfil de la pila GATT del dispositivo local.
    pub perfil: PerfilGatt,
    /// Número de intento actual (1 = primer envío, 2 = primer reintento, …).
    pub intento: u32,
    /// MTU negociado (bytes por paquete GATT = MTU − 3).
    pub mtu: u16,
    /// Si `true`, hay un mensaje en vuelo esperando su acuse.
    pub hay_pendiente: bool,
    /// Milisegundos desde el último acuse recibido (None = nunca / enlace nuevo).
    pub ms_desde_ultimo_acuse: Option<u64>,
}

/// Salida del cálculo del backoff de acuse GATT.
#[derive(Debug, Clone)]
pub struct BackoffAcuse {
    /// Milisegundos que hay que esperar ANTES de reintentar el envío (0 = reintento inmediato).
    pub espera_ms: u64,
    /// Número MÁXIMO de reintentos totales (incluyendo el primer envío) antes de castigar el enlace.
    pub max_reintentos: u32,
    /// Si `true`, este intento cuenta como «castigo» para el enlace b1/b2
    /// (pausa de canal rápido, reconexión, etc.).
    pub castiga: bool,
    /// Texto para el registro (una línea).
    pub detalle: String,
}

/// Calcula el backoff y los reintentos de acuse GATT antes de castigar el enlace b1/b2.
///
/// Reglas (basadas en `ble_l2cap::ESCALA_REAPERTURA_MS`, `ble_l2cap::PLAZO_PRUEBA_MS`,
/// `ble_linux_logica::pausa_tras_fallo_ms` y lo medido en Ronda 1):
///
///   · Pila rápida:
///       - Espera base: 200 ms (primer reintento), 500 ms, 1 s, 2 s (tope).
///       - Max reintentos: 4 (1 envío + 3 reintentos).
///       - Castiga a partir del 4.º intento fallido.
///
///   · Pila lenta / desconocida:
///       - Espera base: 500 ms, 1 s, 2 s, 5 s, 10 s (tope).
///       - Max reintentos: 5 (1 envío + 4 reintentos).
///       - Castiga a partir del 5.º intento fallido.
///
///   · Si NO hay mensaje pendiente (latido, keep-alive): no se castiga, espera mínima.
///   · El MTU no cambia la espera, pero se incluye para trazabilidad.
pub fn calcular_backoff_acuse(e: EntradaBackoffAcuse) -> BackoffAcuse {
    // No hay nada esperando acuse: no se castiga, reintento inmediato si hace falta.
    if !e.hay_pendiente {
        return BackoffAcuse {
            espera_ms: 0,
            max_reintentos: 3,
            castiga: false,
            detalle: "sin mensaje pendiente: no castiga".into(),
        };
    }

    let (escalas, max_reintentos, umbral_castigo) = match e.perfil {
        PerfilGatt::Rapida => (&[200, 500, 1_000, 2_000][..], 4u32, 4u32),
        PerfilGatt::Lenta | PerfilGatt::Desconocida => (&[500, 1_000, 2_000, 5_000, 10_000][..], 5u32, 5u32),
    };

    // `intento` = 1 es el primer envío; el primer reintento es intento = 2.
    let idx = (e.intento.saturating_sub(2) as usize).min(escalas.len() - 1);
    let espera = escalas[idx] as u64;
    let castiga = e.intento >= umbral_castigo;

    BackoffAcuse {
        espera_ms: espera,
        max_reintentos,
        castiga,
        detalle: format!(
            "perfil={:?} mtu={} intento={}/{} {}",
            e.perfil,
            e.mtu,
            e.intento,
            max_reintentos,
            if castiga { "→ CASTIGA" } else { "" }
        ),
    }
}

/// Perfil combinado del enlace (lo que ve el diagnóstico en un momento dado).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PerfilEnlace {
    /// Linux (BlueZ) actuando como central.
    LinuxCentral,
    /// Linux (BlueZ) actuando como periférico.
    LinuxPeriferico,
    /// macOS (CoreBluetooth) actuando como central.
    MacosCentral,
    /// macOS (CoreBluetooth) actuando como periférico.
    MacosPeriferico,
    /// Android (Bluetooth LE) actuando como central.
    AndroidCentral,
    /// Android (Bluetooth LE) actuando como periférico.
    AndroidPeriferico,
}

/// Entrada completa para el diagnóstico del enlace.
#[derive(Debug, Clone, Copy)]
pub struct EntradaDiagnostico {
    /// Perfil del enlace (sistema + rol).
    pub perfil_enlace: PerfilEnlace,
    /// Perfil del controlador Bluetooth local (solo relevante en Linux).
    pub perfil_controlador: PerfilControlador,
    /// Perfil de la pila GATT local.
    pub perfil_gatt: PerfilGatt,
    /// Si el escaneo estaba encendido antes de conectar (solo Linux central).
    pub escaneo_estaba_encendido: bool,
    /// Ms desde que se paró el escaneo (solo Linux central).
    pub ms_desde_parada_escaneo: Option<u64>,
    /// Intento actual de envío GATT (1 = primer envío).
    pub intento_envio: u32,
    /// MTU negociado.
    pub mtu: u16,
    /// Hay mensaje esperando acuse.
    pub hay_pendiente: bool,
    /// Ms desde último acuse.
    pub ms_desde_ultimo_acuse: Option<u64>,
}

/// Salida completa del diagnóstico.
#[derive(Debug, Clone)]
pub struct DiagnosticoEnlace {
    /// Tiempo de asentamiento calculado.
    pub asentamiento: Asentamiento,
    /// Backoff de acuse calculado.
    pub backoff_acuse: BackoffAcuse,
    /// Si `true`, el diagnóstico recomienda NO iniciar la conexión todavía
    /// (esperar el asentamiento).
    pub bloquea_conexion: bool,
    /// Si `true`, el diagnóstico recomienda CASTIGAR el enlace (pausa canal rápido,
    /// reconexión, etc.) tras este intento.
    pub castiga_enlace: bool,
    /// Resumen en una línea para el registro.
    pub resumen: String,
}

/// Diagnóstico completo del enlace: asentamiento + backoff de acuse.
pub fn diagnosticar(e: EntradaDiagnostico) -> DiagnosticoEnlace {
    // 1) Asentamiento (solo relevante para Linux central)
    let asentamiento = if matches!(e.perfil_enlace, PerfilEnlace::LinuxCentral) {
        calcular_asentamiento(EntradaAsentamiento {
            perfil: e.perfil_controlador,
            escaneo_estaba_encendido: e.escaneo_estaba_encendido,
            ms_desde_parada: e.ms_desde_parada_escaneo,
        })
    } else {
        Asentamiento {
            minimo_ms: 0,
            recomendado_ms: 0,
            exige_escaneo_parado: false,
            detalle: format!("{:?}: no requiere asentamiento de escaneo", e.perfil_enlace),
        }
    };

    // 2) Backoff de acuse
    let backoff_acuse = calcular_backoff_acuse(EntradaBackoffAcuse {
        perfil: e.perfil_gatt,
        intento: e.intento_envio,
        mtu: e.mtu,
        hay_pendiente: e.hay_pendiente,
        ms_desde_ultimo_acuse: e.ms_desde_ultimo_acuse,
    });

    let bloquea_conexion = asentamiento.recomendado_ms > 0;
    let castiga_enlace = backoff_acuse.castiga;

    let resumen = format!(
        "{:?} | asentamiento: min={}ms rec={}ms {} | acuse: espera={}ms max_reint={} {}",
        e.perfil_enlace,
        asentamiento.minimo_ms,
        asentamiento.recomendado_ms,
        if asentamiento.exige_escaneo_parado { "(escaneo parado)" } else { "" },
        backoff_acuse.espera_ms,
        backoff_acuse.max_reintentos,
        if backoff_acuse.castiga { "CASTIGA" } else { "" }
    );

    DiagnosticoEnlace {
        asentamiento,
        backoff_acuse,
        bloquea_conexion,
        castiga_enlace,
        resumen,
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn controlador_moderno_no_espera() {
        let a = calcular_asentamiento(EntradaAsentamiento {
            perfil: PerfilControlador::Moderno,
            escaneo_estaba_encendido: true,
            ms_desde_parada: Some(0),
        });
        assert_eq!(a.minimo_ms, 0);
        assert_eq!(a.recomendado_ms, 0);
        assert!(!a.exige_escaneo_parado);
    }

    #[test]
    fn controlador_antiguo_ya_asentado_si_300ms() {
        let a = calcular_asentamiento(EntradaAsentamiento {
            perfil: PerfilControlador::Antiguo,
            escaneo_estaba_encendido: true,
            ms_desde_parada: Some(300),
        });
        assert_eq!(a.minimo_ms, 0);
        assert_eq!(a.recomendado_ms, 200); // margen de seguridad
        assert!(a.exige_escaneo_parado);
    }

    #[test]
    fn controlador_antiguo_recien_parado_espera_300_min_500_rec() {
        let a = calcular_asentamiento(EntradaAsentamiento {
            perfil: PerfilControlador::Antiguo,
            escaneo_estaba_encendido: true,
            ms_desde_parada: Some(50),
        });
        assert_eq!(a.minimo_ms, 300);
        assert_eq!(a.recomendado_ms, 500);
        assert!(a.exige_escaneo_parado);
    }

    #[test]
    fn controlador_antiguo_sin_dato_espera_300_min_500_rec() {
        let a = calcular_asentamiento(EntradaAsentamiento {
            perfil: PerfilControlador::Antiguo,
            escaneo_estaba_encendido: true,
            ms_desde_parada: None,
        });
        assert_eq!(a.minimo_ms, 300);
        assert_eq!(a.recomendado_ms, 500);
    }

    #[test]
    fn perfil_desconocido_asume_antiguo() {
        let a = calcular_asentamiento(EntradaAsentamiento {
            perfil: PerfilControlador::Desconocido,
            escaneo_estaba_encendido: true,
            ms_desde_parada: None,
        });
        assert_eq!(a.minimo_ms, 300);
        assert_eq!(a.recomendado_ms, 500);
        assert!(a.exige_escaneo_parado);
    }

    #[test]
    fn backoff_pila_rapida_escalas_y_castigo_en_4() {
        for (intento, espera_esperada) in [(1, 0), (2, 200), (3, 500), (4, 1_000), (5, 2_000)] {
            let b = calcular_backoff_acuse(EntradaBackoffAcuse {
                perfil: PerfilGatt::Rapida,
                intento,
                mtu: 247,
                hay_pendiente: true,
                ms_desde_ultimo_acuse: Some(100),
            });
            assert_eq!(b.espera_ms, espera_esperada, "intento {intento}");
            assert_eq!(b.max_reintentos, 4);
            assert_eq!(b.castiga, intento >= 4, "castiga a partir del 4");
        }
    }

    #[test]
    fn backoff_pila_lenta_escalas_y_castigo_en_5() {
        for (intento, espera_esperada) in [(1, 0), (2, 500), (3, 1_000), (4, 2_000), (5, 5_000), (6, 10_000)] {
            let b = calcular_backoff_acuse(EntradaBackoffAcuse {
                perfil: PerfilGatt::Lenta,
                intento,
                mtu: 517,
                hay_pendiente: true,
                ms_desde_ultimo_acuse: Some(100),
            });
            assert_eq!(b.espera_ms, espera_esperada, "intento {intento}");
            assert_eq!(b.max_reintentos, 5);
            assert_eq!(b.castiga, intento >= 5, "castiga a partir del 5");
        }
    }

    #[test]
    fn backoff_sin_pendiente_no_castiga() {
        let b = calcular_backoff_acuse(EntradaBackoffAcuse {
            perfil: PerfilGatt::Lenta,
            intento: 10,
            mtu: 23,
            hay_pendiente: false,
            ms_desde_ultimo_acuse: None,
        });
        assert_eq!(b.espera_ms, 0);
        assert!(!b.castiga);
        assert!(b.detalle.contains("sin mensaje pendiente"));
    }

    #[test]
    fn diagnostico_linux_central_antiguo_bloquea_conexion() {
        let d = diagnosticar(EntradaDiagnostico {
            perfil_enlace: PerfilEnlace::LinuxCentral,
            perfil_controlador: PerfilControlador::Antiguo,
            perfil_gatt: PerfilGatt::Lenta,
            escaneo_estaba_encendido: true,
            ms_desde_parada_escaneo: None,
            intento_envio: 1,
            mtu: 247,
            hay_pendiente: true,
            ms_desde_ultimo_acuse: Some(100),
        });
        assert!(d.bloquea_conexion);
        assert_eq!(d.asentamiento.recomendado_ms, 500);
        assert!(!d.castiga_enlace); // intento 1 no castiga
    }

    #[test]
    fn diagnostico_macos_no_bloquea_por_asentamiento() {
        let d = diagnosticar(EntradaDiagnostico {
            perfil_enlace: PerfilEnlace::MacosCentral,
            perfil_controlador: PerfilControlador::Moderno,
            perfil_gatt: PerfilGatt::Rapida,
            escaneo_estaba_encendido: false,
            ms_desde_parada_escaneo: None,
            intento_envio: 3,
            mtu: 517,
            hay_pendiente: true,
            ms_desde_ultimo_acuse: Some(500),
        });
        assert!(!d.bloquea_conexion);
        assert_eq!(d.asentamiento.minimo_ms, 0);
        assert_eq!(d.backoff_acuse.espera_ms, 500); // intento 3 en pila rápida
        assert!(!d.castiga_enlace); // intento 3 < 4
    }

    #[test]
    fn diagnostico_android_periferico_castiga_en_5_con_pila_lenta() {
        let d = diagnosticar(EntradaDiagnostico {
            perfil_enlace: PerfilEnlace::AndroidPeriferico,
            perfil_controlador: PerfilControlador::Desconocido,
            perfil_gatt: PerfilGatt::Lenta,
            escaneo_estaba_encendido: false,
            ms_desde_parada_escaneo: None,
            intento_envio: 5,
            mtu: 247,
            hay_pendiente: true,
            ms_desde_ultimo_acuse: Some(2_000),
        });
        assert!(!d.bloquea_conexion);
        assert!(d.castiga_enlace); // intento 5 >= 5 en pila lenta
        assert_eq!(d.backoff_acuse.espera_ms, 5_000);
    }

    #[test]
    fn diagnostico_resumen_contiene_info_clave() {
        let d = diagnosticar(EntradaDiagnostico {
            perfil_enlace: PerfilEnlace::LinuxCentral,
            perfil_controlador: PerfilControlador::Antiguo,
            perfil_gatt: PerfilGatt::Lenta,
            escaneo_estaba_encendido: true,
            ms_desde_parada_escaneo: Some(100),
            intento_envio: 4,
            mtu: 247,
            hay_pendiente: true,
            ms_desde_ultimo_acuse: Some(300),
        });
        let r = d.resumen;
        assert!(r.contains("LinuxCentral"));
        assert!(r.contains("asentamiento"));
        assert!(r.contains("500ms")); // recomendado
        assert!(r.contains("acuse"));
        assert!(!r.contains("CASTIGA")); // intento 4 en pila lenta NO castiga (umbral 5)
        assert!(!d.castiga_enlace, "intento 4 en pila lenta no castiga");
        assert_eq!(d.backoff_acuse.espera_ms, 2_000);
    }
}