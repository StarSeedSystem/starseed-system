//! (TRM1125G) Ayudante privilegiado Windows · lógica pura para validar y ejecutar órdenes tipadas.
//! Sin Tauri ni E/S del sistema: todo entra por argumento. La usan los comandos de
//! `ayudante_windows.rs` y las pruebas.
//!
//! Contrato: architecture/terminal-entre-neuronas.md y architecture/permisos-y-control-del-dispositivo.md §4.
//! Reglas: permiso apagado por defecto, encendido en el aparato; contraseñas nunca viajan;
//! órdenes selladas (firma, anti-repetición, topes de ritmo); aviso visible; «Terminar» y «Quitar permiso»;
//! registro encadenado; con el aparato bloqueado no entra nada.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Nombre del servicio del ayudante (Windows Service).
pub const SERVICIO_AYUDANTE: &str = "StarSeedAyudante";

/// Versión del contrato de órdenes del ayudante.
pub const VERSION_CONTRATO: u32 = 1;

/// Órdenes tipadas que ofrece el ayudante con privilegios.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OrdenAyudante {
    /// Estado de almacenes (discos): Get-Volume, Get-Disk.
    AlmacenesEstado,
    /// Salud de un almacén por su identificador (serie): SMART, temperatura, ciclos.
    AlmacenSalud,
    /// Formatear un almacén SOLO si su serie está en la lista autorizada (Format-Volume).
    AlmacenFormatear,
    /// Montar un almacén por su identificador (serie).
    AlmacenMontar,
    /// Desmontar un almacén por su identificador (serie).
    AlmacenDesmontar,
    /// Verificar/repair un almacén (chkdsk, repair-volume).
    AlmacenVerificar,
    /// Estado de servicios propios de StarSeed (Windows Services).
    ServiciosEstado,
    /// Iniciar un servicio propio de StarSeed.
    ServicioIniciar,
    /// Parar un servicio propio de StarSeed.
    ServicioParar,
    /// Reiniciar un servicio propio de StarSeed.
    ServicioReiniciar,
    /// Actualizar la app nativa (descarga verificada + instalación firmada).
    ActualizarApp,
    /// Leer logs del sistema / de la app (filtrados, últimas N líneas).
    LogsLeer,
    /// Reiniciar la app StarSeed OS (desde el ayudante, sin contraseña).
    ReiniciarApp,
    /// Ejecutar orden de terminal con privilegios (nivel administrador).
    TerminalAdministrador,
}

/// Resultado de ejecutar una orden del ayudante.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResultadoAyudante {
    pub exito: bool,
    pub salida: Option<String>,
    pub error: Option<String>,
    pub codigo: Option<i32>,
}

/// Parámetros para una orden del ayudante (vienen de la orden firmada).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParametrosOrden {
    pub orden: OrdenAyudante,
    pub args: HashMap<String, String>,
    pub tiempo_max_ms: Option<u64>,
}

/// Límites de ejecución para el ayudante.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct LimitesAyudante {
    pub tiempo_max_ms: u64,
    pub salida_max_bytes: usize,
}

impl Default for LimitesAyudante {
    fn default() -> Self {
        Self {
            tiempo_max_ms: 60_000,   // 60 segundos (operaciones de disco pueden tardar)
            salida_max_bytes: 500_000, // 500 KB
        }
    }
}

/// Decide si una orden del ayudante se permite ejecutar.
///
/// Reglas:
/// - Todas las órdenes requieren que el ayudante esté registrado y activo.
/// - `TerminalAdministrador` es la única que ejecuta shell arbitrario; se audita completa.
/// - `AlmacenFormatear` SOLO si la serie está en la lista autorizada (guardia dura).
/// - Órdenes de servicios solo afectan a `StarSeed*`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecisionAyudante {
    pub permite: bool,
    pub motivo: Option<String>,
    pub requiere_confirmacion: bool,
}

pub fn decidir_orden(
    params: &ParametrosOrden,
    ayudante_registrado: bool,
    series_autorizadas: &[String],
    limites: LimitesAyudante,
) -> DecisionAyudante {
    // Validaciones básicas
    if !ayudante_registrado {
        return DecisionAyudante {
            permite: false,
            motivo: Some("el ayudante privilegiado no está registrado en este Windows (falta instalación como servicio con UAC)".into()),
            requiere_confirmacion: false,
        };
    }

    match params.orden {
        OrdenAyudante::AlmacenFormatear => {
            let serie = params.args.get("serie").cloned().unwrap_or_default();
            if serie.is_empty() {
                return DecisionAyudante {
                    permite: false,
                    motivo: Some("falta el argumento 'serie' para formatear".into()),
                    requiere_confirmacion: false,
                };
            }
            if !series_autorizadas.contains(&serie) {
                return DecisionAyudante {
                    permite: false,
                    motivo: Some(format!("la serie '{}' no está autorizada para formatear", serie)),
                    requiere_confirmacion: false,
                };
            }
            DecisionAyudante {
                permite: true,
                motivo: None,
                requiere_confirmacion: true, // Siempre confirmar formateo
            }
        }
        OrdenAyudante::TerminalAdministrador => {
            let cmd = params.args.get("orden").cloned().unwrap_or_default();
            if cmd.trim().is_empty() || cmd.chars().count() > 8000 {
                return DecisionAyudante {
                    permite: false,
                    motivo: Some("orden vacía o demasiado larga (máx 8000 caracteres)".into()),
                    requiere_confirmacion: false,
                };
            }
            DecisionAyudante {
                permite: true,
                motivo: None,
                requiere_confirmacion: true, // Siempre confirmar terminal admin
            }
        }
        OrdenAyudante::ActualizarApp | OrdenAyudante::ReiniciarApp => {
            DecisionAyudante {
                permite: true,
                motivo: None,
                requiere_confirmacion: true,
            }
        }
        OrdenAyudante::ServicioIniciar | OrdenAyudante::ServicioParar | OrdenAyudante::ServicioReiniciar => {
            let nombre = params.args.get("servicio").cloned().unwrap_or_default();
            if !nombre.starts_with("StarSeed") && !nombre.starts_with("starseed") {
                return DecisionAyudante {
                    permite: false,
                    motivo: Some("solo se pueden gestionar servicios 'StarSeed*'".into()),
                    requiere_confirmacion: false,
                };
            }
            DecisionAyudante {
                permite: true,
                motivo: None,
                requiere_confirmacion: false,
            }
        }
        _ => DecisionAyudante {
            permite: true,
            motivo: None,
            requiere_confirmacion: false,
        },
    }
}

/// Valida los argumentos para `AlmacenFormatear`.
pub fn validar_formatear(args: &HashMap<String, String>) -> Result<(String, String, String), String> {
    let serie = args.get("serie").ok_or("falta 'serie'")?.clone();
    let formato = args.get("formato").unwrap_or(&"NTFS".to_string()).clone();
    let nombre = args.get("nombre").unwrap_or(&"StarSeed".to_string()).clone();
    if serie.is_empty() {
        return Err("serie vacía".into());
    }
    Ok((serie, formato, nombre))
}

/// Valida los argumentos para `AlmacenMontar` / `AlmacenDesmontar`.
pub fn validar_montar(args: &HashMap<String, String>) -> Result<String, String> {
    args.get("serie").cloned().ok_or_else(|| "falta 'serie'".into())
}

/// Valida los argumentos para `LogsLeer`.
pub fn validar_logs(args: &HashMap<String, String>) -> Result<(Option<String>, usize), String> {
    let filtro = args.get("filtro").cloned();
    let lineas = args.get("lineas")
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(100)
        .min(5000);
    Ok((filtro, lineas))
}

/// Valida los argumentos para `TerminalAdministrador`.
pub fn validar_terminal_admin(args: &HashMap<String, String>) -> Result<String, String> {
    let orden = args.get("orden").cloned().unwrap_or_default();
    if orden.trim().is_empty() || orden.chars().count() > 8000 {
        return Err("orden vacía o demasiado larga".into());
    }
    Ok(orden)
}

#[cfg(test)]
mod pruebas {
    use super::*;

    const SERIES_AUTORIZADAS: &[&str] = &["ABC123DEF456", "XYZ789UVW012"];

    fn series() -> Vec<String> {
        SERIES_AUTORIZADAS.iter().map(|s| s.to_string()).collect()
    }

    fn limites() -> LimitesAyudante {
        LimitesAyudante::default()
    }

    #[test]
    fn orden_requiere_ayudante_registrado() {
        let params = ParametrosOrden {
            orden: OrdenAyudante::AlmacenesEstado,
            args: HashMap::new(),
            tiempo_max_ms: None,
        };
        let d = decidir_orden(&params, false, &series(), limites());
        assert!(!d.permite);
        assert!(d.motivo.as_ref().unwrap().contains("no está registrado"));
    }

    #[test]
    fn almacenes_estado_permitido_si_registrado() {
        let params = ParametrosOrden {
            orden: OrdenAyudante::AlmacenesEstado,
            args: HashMap::new(),
            tiempo_max_ms: None,
        };
        let d = decidir_orden(&params, true, &series(), limites());
        assert!(d.permite);
        assert!(!d.requiere_confirmacion);
    }

    #[test]
    fn almacen_formatear_requiere_serie_autorizada() {
        let mut args = HashMap::new();
        args.insert("serie".into(), "ABC123DEF456".into());
        let params = ParametrosOrden {
            orden: OrdenAyudante::AlmacenFormatear,
            args,
            tiempo_max_ms: None,
        };
        let d = decidir_orden(&params, true, &series(), limites());
        assert!(d.permite);
        assert!(d.requiere_confirmacion);
    }

    #[test]
    fn almacen_formatear_rechaza_serie_no_autorizada() {
        let mut args = HashMap::new();
        args.insert("serie".into(), "NO_AUTORIZADA".into());
        let params = ParametrosOrden {
            orden: OrdenAyudante::AlmacenFormatear,
            args,
            tiempo_max_ms: None,
        };
        let d = decidir_orden(&params, true, &series(), limites());
        assert!(!d.permite);
        assert!(d.motivo.as_ref().unwrap().contains("no está autorizada"));
    }

    #[test]
    fn almacen_formatear_rechaza_sin_serie() {
        let params = ParametrosOrden {
            orden: OrdenAyudante::AlmacenFormatear,
            args: HashMap::new(),
            tiempo_max_ms: None,
        };
        let d = decidir_orden(&params, true, &series(), limites());
        assert!(!d.permite);
        assert!(d.motivo.as_ref().unwrap().contains("falta"));
    }

    #[test]
    fn terminal_admin_requiere_confirmacion_y_valida_longitud() {
        let mut args = HashMap::new();
        args.insert("orden".into(), "Format-Volume -DriveLetter D -FileSystem NTFS".into());
        let params = ParametrosOrden {
            orden: OrdenAyudante::TerminalAdministrador,
            args,
            tiempo_max_ms: None,
        };
        let d = decidir_orden(&params, true, &series(), limites());
        assert!(d.permite);
        assert!(d.requiere_confirmacion);
    }

    #[test]
    fn terminal_admin_rechaza_orden_larga() {
        let mut args = HashMap::new();
        args.insert("orden".into(), "a".repeat(9000));
        let params = ParametrosOrden {
            orden: OrdenAyudante::TerminalAdministrador,
            args,
            tiempo_max_ms: None,
        };
        let d = decidir_orden(&params, true, &series(), limites());
        assert!(!d.permite);
    }

    #[test]
    fn servicios_solo_starseed() {
        let mut args = HashMap::new();
        args.insert("servicio".into(), "StarSeedMando".into());
        let params = ParametrosOrden {
            orden: OrdenAyudante::ServicioIniciar,
            args,
            tiempo_max_ms: None,
        };
        let d = decidir_orden(&params, true, &series(), limites());
        assert!(d.permite);

        let mut args = HashMap::new();
        args.insert("servicio".into(), "AppleMobileDeviceService".into());
        let params = ParametrosOrden {
            orden: OrdenAyudante::ServicioIniciar,
            args,
            tiempo_max_ms: None,
        };
        let d = decidir_orden(&params, true, &series(), limites());
        assert!(!d.permite);
    }

    #[test]
    fn validar_formatear_ok() {
        let mut args = HashMap::new();
        args.insert("serie".into(), "ABC123".into());
        args.insert("formato".into(), "NTFS".into());
        args.insert("nombre".into(), "Disco1".into());
        let (s, f, n) = validar_formatear(&args).unwrap();
        assert_eq!(s, "ABC123");
        assert_eq!(f, "NTFS");
        assert_eq!(n, "Disco1");
    }

    #[test]
    fn validar_formatear_defaults() {
        let mut args = HashMap::new();
        args.insert("serie".into(), "ABC123".into());
        let (s, f, n) = validar_formatear(&args).unwrap();
        assert_eq!(f, "NTFS");
        assert_eq!(n, "StarSeed");
    }

    #[test]
    fn validar_montar_ok() {
        let mut args = HashMap::new();
        args.insert("serie".into(), "ABC123".into());
        assert_eq!(validar_montar(&args).unwrap(), "ABC123");
    }

    #[test]
    fn validar_logs_defaults() {
        let args = HashMap::new();
        let (filtro, lineas) = validar_logs(&args).unwrap();
        assert_eq!(filtro, None);
        assert_eq!(lineas, 100);
    }

    #[test]
    fn validar_logs_limite() {
        let mut args = HashMap::new();
        args.insert("lineas".into(), "10000".into());
        let (_, lineas) = validar_logs(&args).unwrap();
        assert_eq!(lineas, 5000);
    }

    #[test]
    fn orden_ayudante_serializa() {
        let o = OrdenAyudante::AlmacenesEstado;
        let json = serde_json::to_string(&o).unwrap();
        assert_eq!(json, "\"almacenes_estado\"");
    }

    #[test]
    fn parametros_orden_deserializa() {
        let json = r#"{"orden":"almacen_formatear","args":{"serie":"ABC123","formato":"NTFS"},"tiempo_max_ms":30000}"#;
        let p: ParametrosOrden = serde_json::from_str(json).unwrap();
        assert_eq!(p.orden, OrdenAyudante::AlmacenFormatear);
        assert_eq!(p.args.get("serie"), Some(&"ABC123".to_string()));
    }
}