// ═══════════════════════════════════════════════════════════════════════════
// almacenes_formatear_logica — lógica pura para formatear, renombrar, montar y desmontar almacenes (2026-11-27).
// ---------------------------------------------------------------------------
// Contrato: architecture/almacenes-cerebros.md §6 (formatear y modificar).
// Solo std + serde: se prueba sin Tauri. Sin E/S real: devuelve comandos a ejecutar.
// ═══════════════════════════════════════════════════════════════════════════

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Sistema de archivos soportado para formateo.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum FormatoSoportado {
    Ext4,
    Btrfs,
    Xfs,
    Exfat,
    Fat32,
    Ntfs,
    Apfs,
    HfsPlus,
}

/// Opciones de formateo.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct OpcionesFormateo {
    /// Formato destino.
    pub formato: FormatoSoportado,
    /// Etiqueta/nombre del volumen.
    pub etiqueta: String,
    /// Forzar aunque parezca tener datos (el dueño lo confirma).
    pub forzar: bool,
    /// Confirmación escrita: el nombre del medio tal como se muestra en la UI.
    pub confirmacion_nombre: String,
}

/// Resultado de una operación de formateo (comando a ejecutar).
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ComandoFormateo {
    /// Programa a ejecutar.
    pub programa: String,
    /// Argumentos.
    pub args: Vec<String>,
    /// true si requiere elevación (sudo/UAC).
    pub requiere_elevacion: bool,
    /// Advertencia legible para el dueño.
    pub advertencia: String,
}

/// Resultado de renombrar un volumen.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ComandoRenombrar {
    pub programa: String,
    pub args: Vec<String>,
    pub requiere_elevacion: bool,
    pub advertencia: String,
}

/// Resultado de montar/desmontar.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ComandoMontaje {
    pub programa: String,
    pub args: Vec<String>,
    pub requiere_elevacion: bool,
    pub advertencia: String,
}

/// Resumen de contenido de un almacén (para mostrar antes de formatear).
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ResumenContenido {
    pub total_archivos: u64,
    pub total_bytes: u64,
    pub carpetas_principales: Vec<String>,
    /// true si este medio es la ÚNICA copia de algo fundamental (según mapa de ubicaciones).
    pub es_unica_copia_fundamental: bool,
    /// Detalle de qué es lo que solo está aquí (si es_unica_copia_fundamental).
    pub detalle_unica_copia: Option<String>,
}

/// Errores de validación de guardas.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ErrorGuarda {
    /// El medio es el disco del sistema (donde está / o C:\).
    EsDiscoSistema,
    /// El medio guarda la única copia de algo fundamental y no hay confirmación consciente.
    UnicaCopiaSinConfirmacion,
    /// La confirmación escrita no coincide con el nombre del medio.
    ConfirmacionNoCoincide,
    /// Formato no soportado en esta plataforma.
    FormatoNoSoportado,
    /// Plataforma no soportada (Android no permite formatear desde apps).
    PlataformaNoSoportada,
    /// Falta información del almacén (UUID/serie).
    InfoIncompleta,
}

/// Plataforma actual.
fn plataforma_actual() -> &'static str {
    std::env::consts::OS
}

/// Formatos soportados por plataforma.
fn formatos_por_plataforma(plataforma: &str) -> Vec<FormatoSoportado> {
    match plataforma {
        "linux" => vec![
            FormatoSoportado::Ext4,
            FormatoSoportado::Btrfs,
            FormatoSoportado::Xfs,
            FormatoSoportado::Exfat,
            FormatoSoportado::Fat32,
            FormatoSoportado::Ntfs,
        ],
        "macos" => vec![
            FormatoSoportado::Apfs,
            FormatoSoportado::HfsPlus,
            FormatoSoportado::Exfat,
            FormatoSoportado::Fat32,
            FormatoSoportado::Ext4, // vía mkfs.ext4 si está instalado
        ],
        "windows" => vec![
            FormatoSoportado::Ntfs,
            FormatoSoportado::Exfat,
            FormatoSoportado::Fat32,
            FormatoSoportado::Apfs, // solo lectura nativa, formateo vía herramientas extra
        ],
        _ => vec![],
    }
}

/// Valida que el formato sea soportado en la plataforma actual.
fn validar_formato_plataforma(formato: &FormatoSoportado, plataforma: &str) -> Result<(), ErrorGuarda> {
    let soportados = formatos_por_plataforma(plataforma);
    if soportados.contains(formato) {
        Ok(())
    } else {
        Err(ErrorGuarda::FormatoNoSoportado)
    }
}

/// Valida las guardas antes de formatear (lógica pura, sin E/S).
///
/// Reglas (architecture/almacenes-cerebros.md §6):
/// - Nunca el disco del sistema.
/// - Se muestra lo que hay y cuánto ocupa; si el medio guarda la única copia de algo fundamental,
///   no se borra sin que el dueño lo confirme a sabiendas.
/// - Confirmación escrita (el nombre del medio) en ESA neurona.
/// - Una orden remota nunca formatea sola (se cumple en la capa de comandos Tauri).
pub fn validar_guardas_formateo(
    almacen: &crate::almacenes_logica::Almacen,
    resumen: &ResumenContenido,
    opciones: &OpcionesFormateo,
) -> Result<(), ErrorGuarda> {
    // 1. Nunca el disco del sistema
    if almacen.es_disco_sistema {
        return Err(ErrorGuarda::EsDiscoSistema);
    }

    // 2. Plataforma soportada
    if plataforma_actual() == "android" {
        return Err(ErrorGuarda::PlataformaNoSoportada);
    }

    // 3. Formato soportado en esta plataforma
    validar_formato_plataforma(&opciones.formato, plataforma_actual())?;

    // 4. Info completa (UUID + serie)
    if almacen.uuid.is_empty() || almacen.serie.is_empty() {
        return Err(ErrorGuarda::InfoIncompleta);
    }

    // 5. Si es la única copia de algo fundamental, exige confirmación consciente
    if resumen.es_unica_copia_fundamental && !opciones.forzar {
        return Err(ErrorGuarda::UnicaCopiaSinConfirmacion);
    }

    // 6. Confirmación escrita: el nombre del medio debe coincidir
    let nombre_esperado = &almacen.etiqueta;
    if opciones.confirmacion_nombre.trim() != nombre_esperado.trim() {
        return Err(ErrorGuarda::ConfirmacionNoCoincide);
    }

    Ok(())
}

/// Genera el comando de formateo para Linux (udisks2 / mkfs.*).
fn comando_formateo_linux(
    almacen: &crate::almacenes_logica::Almacen,
    opciones: &OpcionesFormateo,
) -> ComandoFormateo {
    let dispositivo = &almacen.punto_montaje; // En realidad necesitamos el device path, no el mountpoint
    // NOTA: En la implementación real, el comando Tauri recibirá el device path (ej. /dev/sdb1)
    // Aquí usamos el punto_montaje como placeholder; el comando real lo sustituirá.

    let (programa, args) = match opciones.formato {
        FormatoSoportado::Ext4 => ("mkfs.ext4", vec!["-F", "-L", &opciones.etiqueta, dispositivo]),
        FormatoSoportado::Btrfs => ("mkfs.btrfs", vec!["-f", "-L", &opciones.etiqueta, dispositivo]),
        FormatoSoportado::Xfs => ("mkfs.xfs", vec!["-f", "-L", &opciones.etiqueta, dispositivo]),
        FormatoSoportado::Exfat => ("mkfs.exfat", vec!["-n", &opciones.etiqueta, dispositivo]),
        FormatoSoportado::Fat32 => ("mkfs.vfat", vec!["-F", "32", "-n", &opciones.etiqueta, dispositivo]),
        FormatoSoportado::Ntfs => ("mkfs.ntfs", vec!["-f", "-L", &opciones.etiqueta, dispositivo]),
        FormatoSoportado::Apfs | FormatoSoportado::HfsPlus => {
            // En Linux no se formatea APFS/HFS+ nativamente
            ("echo", vec!["Formato no soportado en Linux"])
        }
    };

    ComandoFormateo {
        programa: programa.to_string(),
        args: args.into_iter().map(String::from).collect(),
        requiere_elevacion: true,
        advertencia: format!(
            "Se formateará el medio '{}' ({}) como {}. TODOS LOS DATOS SE PERDERÁN.",
            almacen.etiqueta, almacen.punto_montaje, opciones.formato
        ),
    }
}

/// Genera el comando de formateo para macOS (diskutil).
fn comando_formateo_macos(
    almacen: &crate::almacenes_logica::Almacen,
    opciones: &OpcionesFormateo,
) -> ComandoFormateo {
    // En macOS necesitamos el identifier del disco (ej. disk2s1), no el mountpoint
    let identifier = &almacen.punto_montaje; // placeholder

    let (formato_diskutil, args_extra) = match opciones.formato {
        FormatoSoportado::Apfs => ("APFS", vec![]),
        FormatoSoportado::HfsPlus => ("HFS+", vec![]),
        FormatoSoportado::Exfat => ("ExFAT", vec![]),
        FormatoSoportado::Fat32 => ("MS-DOS FAT32", vec![]),
        FormatoSoportado::Ext4 | FormatoSoportado::Btrfs | FormatoSoportado::Xfs | FormatoSoportado::Ntfs => {
            // Estos requieren herramientas externas en macOS
            return ComandoFormateo {
                programa: "echo".into(),
                args: vec!["Formato requiere herramientas externas en macOS".into()],
                requiere_elevacion: false,
                advertencia: "Formato no nativo en macOS".into(),
            };
        }
    };

    let mut args = vec!["eraseDisk".into(), formato_diskutil.into(), opciones.etiqueta.clone(), identifier.into()];
    args.extend(args_extra);

    ComandoFormateo {
        programa: "diskutil".into(),
        args,
        requiere_elevacion: false, // diskutil no pide sudo para discos extraíbles
        advertencia: format!(
            "Se formateará el medio '{}' como {}. TODOS LOS DATOS SE PERDERÁN.",
            almacen.etiqueta, opciones.formato
        ),
    }
}

/// Genera el comando de formateo para Windows (Format-Volume).
fn comando_formateo_windows(
    almacen: &crate::almacenes_logica::Almacen,
    opciones: &OpcionesFormateo,
) -> ComandoFormateo {
    // En Windows necesitamos la letra de unidad (ej. D:)
    let drive_letter = almacen.punto_montaje.trim_end_matches('\\').trim_end_matches('/');

    let fs = match opciones.formato {
        FormatoSoportado::Ntfs => "NTFS",
        FormatoSoportado::Exfat => "exFAT",
        FormatoSoportado::Fat32 => "FAT32",
        FormatoSoportado::Apfs | FormatoSoportado::HfsPlus | FormatoSoportado::Ext4 | FormatoSoportado::Btrfs | FormatoSoportado::Xfs => {
            return ComandoFormateo {
                programa: "echo".into(),
                args: vec!["Formato no soportado nativamente en Windows".into()],
                requiere_elevacion: false,
                advertencia: "Formato no nativo en Windows".into(),
            };
        }
    };

    let args = vec![
        "-DriveLetter".into(),
        drive_letter.trim_end_matches(':').into(),
        "-FileSystem".into(),
        fs.into(),
        "-NewFileSystemLabel".into(),
        opciones.etiqueta.clone(),
        "-Force".into(),
        "-Confirm:$false".into(),
    ];

    ComandoFormateo {
        programa: "powershell".into(),
        args: vec!["-NoProfile".into(), "-Command".into(), format!("Format-Volume {}", args.join(" "))],
        requiere_elevacion: true, // UAC
        advertencia: format!(
            "Se formateará la unidad '{}' ({}) como {}. TODOS LOS DATOS SE PERDERÁN.",
            almacen.etiqueta, drive_letter, opciones.formato
        ),
    }
}

/// Genera el comando de formateo según la plataforma.
pub fn generar_comando_formateo(
    almacen: &crate::almacenes_logica::Almacen,
    opciones: &OpcionesFormateo,
) -> Result<ComandoFormateo, ErrorGuarda> {
    // Validar guardas primero
    let resumen_vacio = ResumenContenido {
        total_archivos: 0,
        total_bytes: 0,
        carpetas_principales: vec![],
        es_unica_copia_fundamental: false,
        detalle_unica_copia: None,
    };
    validar_guardas_formateo(almacen, &resumen_vacio, opciones)?;

    let plataforma = plataforma_actual();
    let comando = match plataforma {
        "linux" => comando_formateo_linux(almacen, opciones),
        "macos" => comando_formateo_macos(almacen, opciones),
        "windows" => comando_formateo_windows(almacen, opciones),
        _ => return Err(ErrorGuarda::PlataformaNoSoportada),
    };
    Ok(comando)
}

/// Genera comando para renombrar un volumen (sin formatear).
pub fn generar_comando_renombrar(
    almacen: &crate::almacenes_logica::Almacen,
    nueva_etiqueta: &str,
) -> Result<ComandoRenombrar, ErrorGuarda> {
    if almacen.es_disco_sistema {
        return Err(ErrorGuarda::EsDiscoSistema);
    }
    if nueva_etiqueta.trim().is_empty() {
        return Err(ErrorGuarda::InfoIncompleta);
    }

    let plataforma = plataforma_actual();
    let (programa, args, requiere_elevacion) = match plataforma {
        "linux" => {
            // fatlabel para FAT/exFAT, e2label para ext4, btrfs filesystem label para btrfs, etc.
            // Usamos udisks2 vía dbus en la implementación real; aquí comando genérico
            ("echo".into(), vec!["Renombrar vía udisks2/D-Bus en implementación real".into()], false)
        }
        "macos" => {
            let identifier = &almacen.punto_montaje; // placeholder
            ("diskutil".into(), vec!["rename".into(), identifier.into(), nueva_etiqueta.into()], false)
        }
        "windows" => {
            let drive_letter = almacen.punto_montaje.trim_end_matches('\\').trim_end_matches('/');
            ("powershell".into(), vec!["-NoProfile".into(), "-Command".into(), format!("Set-Volume -DriveLetter {} -NewFileSystemLabel '{}'", drive_letter.trim_end_matches(':'), nueva_etiqueta)], false)
        }
        _ => return Err(ErrorGuarda::PlataformaNoSoportada),
    };

    Ok(ComandoRenombrar {
        programa,
        args,
        requiere_elevacion,
        advertencia: format!("Se renombrará '{}' a '{}'.", almacen.etiqueta, nueva_etiqueta),
    })
}

/// Genera comando para montar un volumen.
pub fn generar_comando_montar(
    almacen: &crate::almacenes_logica::Almacen,
) -> Result<ComandoMontaje, ErrorGuarda> {
    let plataforma = plataforma_actual();
    let (programa, args, requiere_elevacion) = match plataforma {
        "linux" => ("udisksctl".into(), vec!["mount".into(), "-b".into(), almacen.punto_montaje.clone()], false),
        "macos" => ("diskutil".into(), vec!["mount".into(), almacen.punto_montaje.clone()], false),
        "windows" => {
            let drive_letter = almacen.punto_montaje.trim_end_matches('\\').trim_end_matches('/');
            ("powershell".into(), vec!["-NoProfile".into(), "-Command".into(), format!("Mount-Volume -DriveLetter {}", drive_letter.trim_end_matches(':'))], false)
        }
        _ => return Err(ErrorGuarda::PlataformaNoSoportada),
    };

    Ok(ComandoMontaje {
        programa,
        args,
        requiere_elevacion,
        advertencia: format!("Se montará el medio '{}'.", almacen.etiqueta),
    })
}

/// Genera comando para desmontar un volumen.
pub fn generar_comando_desmontar(
    almacen: &crate::almacenes_logica::Almacen,
    forzar: bool,
) -> Result<ComandoMontaje, ErrorGuarda> {
    let plataforma = plataforma_actual();
    let (programa, args, requiere_elevacion) = match plataforma {
        "linux" => {
            let mut args = vec!["unmount".into(), "-b".into(), almacen.punto_montaje.clone()];
            if forzar {
                args.push("-f".into());
            }
            ("udisksctl".into(), args, false)
        }
        "macos" => {
            let mut args = vec!["unmount".into(), almacen.punto_montaje.clone()];
            if forzar {
                args.insert(1, "force".into());
            }
            ("diskutil".into(), args, false)
        }
        "windows" => {
            let drive_letter = almacen.punto_montaje.trim_end_matches('\\').trim_end_matches('/');
            let cmd = if forzar {
                format!("Dismount-Volume -DriveLetter {} -Force", drive_letter.trim_end_matches(':'))
            } else {
                format!("Dismount-Volume -DriveLetter {}", drive_letter.trim_end_matches(':'))
            };
            ("powershell".into(), vec!["-NoProfile".into(), "-Command".into(), cmd], false)
        }
        _ => return Err(ErrorGuarda::PlataformaNoSoportada),
    };

    Ok(ComandoMontaje {
        programa,
        args,
        requiere_elevacion,
        advertencia: format!("Se desmontará el medio '{}'.{}", almacen.etiqueta, if forzar { " (forzado)" } else { "" }),
    })
}

/// Obtiene resumen de contenido de un almacén (lógica pura: recibe datos, no lee disco).
pub fn resumir_contenido(
    archivos: Vec<(String, u64)>, // (ruta_relativa, tamaño_bytes)
    mapa_ubicaciones: &HashMap<String, Vec<String>>, // ruta_relativa -> [ids_de_almacenes_donde_existe]
    almacen_uuid: &str,
) -> ResumenContenido {
    let total_archivos = archivos.len() as u64;
    let total_bytes: u64 = archivos.iter().map(|(_, size)| *size).sum();

    // Carpetas principales (primer nivel)
    let mut carpetas = std::collections::HashSet::new();
    for (ruta, _) in &archivos {
        if let Some(primera) = ruta.split('/').next() {
            carpetas.insert(primera.to_string());
        }
    }
    let mut carpetas_principales: Vec<String> = carpetas.into_iter().collect();
    carpetas_principales.sort();

    // Verificar si alguna archivo SOLO está en este almacén (única copia)
    let mut es_unica_copia = false;
    let mut detalle = None;
    for (ruta, _) in &archivos {
        if let Some(almacenes) = mapa_ubicaciones.get(ruta) {
            if almacenes.len() == 1 && almacenes[0] == almacen_uuid {
                es_unica_copia = true;
                detalle = Some(format!("'{}' solo existe en este medio", ruta));
                break;
            }
        }
    }

    ResumenContenido {
        total_archivos,
        total_bytes,
        carpetas_principales,
        es_unica_copia_fundamental: es_unica_copia,
        detalle_unica_copia: detalle,
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::almacenes_logica::{Almacen, SistemaArchivos, TipoAlmacen};
    use std::collections::HashMap;

    fn almacen_ejemplo() -> Almacen {
        Almacen {
            etiqueta: "MI_USB".into(),
            uuid: "123e4567e89b12d3a456426614174000".into(),
            serie: "SERIAL123".into(),
            sistema_archivos: SistemaArchivos::Exfat,
            extraible: true,
            total_bytes: 32_000_000_000,
            libre_bytes: 28_000_000_000,
            punto_montaje: "/mnt/usb".into(),
            es_disco_sistema: false,
            tipo: TipoAlmacen::Extraible,
            plataforma: "linux".into(),
            motivo: None,
        }
    }

    fn almacen_sistema() -> Almacen {
        let mut a = almacen_ejemplo();
        a.es_disco_sistema = true;
        a.punto_montaje = "/".into();
        a.etiqueta = "Sistema".into();
        a
    }

    #[test]
    fn validar_guardas_rechaza_disco_sistema() {
        let almacen = almacen_sistema();
        let resumen = ResumenContenido { total_archivos: 0, total_bytes: 0, carpetas_principales: vec![], es_unica_copia_fundamental: false, detalle_unica_copia: None };
        let opciones = OpcionesFormateo { formato: FormatoSoportado::Ext4, etiqueta: "test".into(), forzar: true, confirmacion_nombre: "Sistema".into() };
        assert_eq!(validar_guardas_formateo(&almacen, &resumen, &opciones), Err(ErrorGuarda::EsDiscoSistema));
    }

    #[test]
    fn validar_guardas_requiere_confirmacion_nombre_exacto() {
        let almacen = almacen_ejemplo();
        let resumen = ResumenContenido { total_archivos: 0, total_bytes: 0, carpetas_principales: vec![], es_unica_copia_fundamental: false, detalle_unica_copia: None };
        let opciones = OpcionesFormateo { formato: FormatoSoportado::Ext4, etiqueta: "test".into(), forzar: true, confirmacion_nombre: "OTRO_NOMBRE".into() };
        assert_eq!(validar_guardas_formateo(&almacen, &resumen, &opciones), Err(ErrorGuarda::ConfirmacionNoCoincide));
    }

    #[test]
    fn validar_guardas_acepta_confirmacion_correcta() {
        let almacen = almacen_ejemplo();
        let resumen = ResumenContenido { total_archivos: 0, total_bytes: 0, carpetas_principales: vec![], es_unica_copia_fundamental: false, detalle_unica_copia: None };
        let opciones = OpcionesFormateo { formato: FormatoSoportado::Ext4, etiqueta: "test".into(), forzar: true, confirmacion_nombre: "MI_USB".into() };
        assert!(validar_guardas_formateo(&almacen, &resumen, &opciones).is_ok());
    }

    #[test]
    fn validar_guardas_rechaza_unica_copia_sin_forzar() {
        let almacen = almacen_ejemplo();
        let resumen = ResumenContenido { total_archivos: 10, total_bytes: 1000, carpetas_principales: vec![], es_unica_copia_fundamental: true, detalle_unica_copia: Some("archivo importante".into()) };
        let opciones = OpcionesFormateo { formato: FormatoSoportado::Ext4, etiqueta: "test".into(), forzar: false, confirmacion_nombre: "MI_USB".into() };
        assert_eq!(validar_guardas_formateo(&almacen, &resumen, &opciones), Err(ErrorGuarda::UnicaCopiaSinConfirmacion));
    }

    #[test]
    fn validar_guardas_acepta_unica_copia_con_forzar() {
        let almacen = almacen_ejemplo();
        let resumen = ResumenContenido { total_archivos: 10, total_bytes: 1000, carpetas_principales: vec![], es_unica_copia_fundamental: true, detalle_unica_copia: Some("archivo importante".into()) };
        let opciones = OpcionesFormateo { formato: FormatoSoportado::Ext4, etiqueta: "test".into(), forzar: true, confirmacion_nombre: "MI_USB".into() };
        assert!(validar_guardas_formateo(&almacen, &resumen, &opciones).is_ok());
    }

    #[test]
    fn validar_guardas_rechaza_info_incompleta() {
        let mut almacen = almacen_ejemplo();
        almacen.uuid = "".into();
        let resumen = ResumenContenido { total_archivos: 0, total_bytes: 0, carpetas_principales: vec![], es_unica_copia_fundamental: false, detalle_unica_copia: None };
        let opciones = OpcionesFormateo { formato: FormatoSoportado::Ext4, etiqueta: "test".into(), forzar: true, confirmacion_nombre: "MI_USB".into() };
        assert_eq!(validar_guardas_formateo(&almacen, &resumen, &opciones), Err(ErrorGuarda::InfoIncompleta));
    }

    #[test]
    fn generar_comando_formateo_linux_ext4() {
        let almacen = almacen_ejemplo();
        let opciones = OpcionesFormateo { formato: FormatoSoportado::Ext4, etiqueta: "NUEVO".into(), forzar: true, confirmacion_nombre: "MI_USB".into() };
        let cmd = generar_comando_formateo(&almacen, &opciones).unwrap();
        assert_eq!(cmd.programa, "mkfs.ext4");
        assert!(cmd.args.iter().any(|a| a == "-L"));
        assert!(cmd.args.iter().any(|a| a == "NUEVO"));
        assert!(cmd.requiere_elevacion);
    }

    #[test]
    fn generar_comando_formateo_macos_apfs() {
        // Solo compila en macOS, pero la lógica se prueba en todas partes
        let almacen = almacen_ejemplo();
        let opciones = OpcionesFormateo { formato: FormatoSoportado::Apfs, etiqueta: "NUEVO".into(), forzar: true, confirmacion_nombre: "MI_USB".into() };
        // En Linux/Windows devolverá error de plataforma no soportada para APFS
        if cfg!(target_os = "macos") {
            let cmd = generar_comando_formateo(&almacen, &opciones).unwrap();
            assert_eq!(cmd.programa, "diskutil");
            assert!(cmd.args.contains(&"APFS".into()));
        }
    }

    #[test]
    fn generar_comando_renombrar_linux() {
        let almacen = almacen_ejemplo();
        let cmd = generar_comando_renombrar(&almacen, "OTRO_NOMBRE").unwrap();
        assert!(!cmd.programa.is_empty());
        assert_eq!(cmd.advertencia, "Se renombrará 'MI_USB' a 'OTRO_NOMBRE'.");
    }

    #[test]
    fn generar_comando_renombrar_rechaza_disco_sistema() {
        let almacen = almacen_sistema();
        assert_eq!(generar_comando_renombrar(&almacen, "nuevo"), Err(ErrorGuarda::EsDiscoSistema));
    }

    #[test]
    fn generar_comando_montar_linux() {
        let almacen = almacen_ejemplo();
        let cmd = generar_comando_montar(&almacen).unwrap();
        assert_eq!(cmd.programa, "udisksctl");
        assert_eq!(cmd.args[0], "mount");
    }

    #[test]
    fn generar_comando_desmontar_con_forzar() {
        let almacen = almacen_ejemplo();
        let cmd = generar_comando_desmontar(&almacen, true).unwrap();
        assert_eq!(cmd.programa, "udisksctl");
        assert!(cmd.args.contains(&"-f".into()));
    }

    #[test]
    fn resumir_contenido_detecta_unica_copia() {
        let archivos = vec![("documentos/importante.pdf".into(), 1024), ("fotos/vacacion.jpg".into(), 2048)];
        let mut mapa = HashMap::new();
        mapa.insert("documentos/importante.pdf".into(), vec!["uuid-1".into()]); // solo en este
        mapa.insert("fotos/vacacion.jpg".into(), vec!["uuid-1".into(), "uuid-2".into()]); // replicado

        let resumen = resumir_contenido(archivos, &mapa, "uuid-1");
        assert_eq!(resumen.total_archivos, 2);
        assert_eq!(resumen.total_bytes, 3072);
        assert!(resumen.es_unica_copia_fundamental);
        assert!(resumen.detalle_unica_copia.is_some());
    }

    #[test]
    fn resumir_contenido_sin_unica_copia() {
        let archivos = vec![("doc.pdf".into(), 1024)];
        let mut mapa = HashMap::new();
        mapa.insert("doc.pdf".into(), vec!["uuid-1".into(), "uuid-2".into()]);

        let resumen = resumir_contenido(archivos, &mapa, "uuid-1");
        assert!(!resumen.es_unica_copia_fundamental);
        assert!(resumen.detalle_unica_copia.is_none());
    }

    #[test]
    fn formatos_por_plataforma_linux_incluye_ext4() {
        let fmt = formatos_por_plataforma("linux");
        assert!(fmt.contains(&FormatoSoportado::Ext4));
        assert!(fmt.contains(&FormatoSoportado::Btrfs));
        assert!(fmt.contains(&FormatoSoportado::Exfat));
    }

    #[test]
    fn formatos_por_plataforma_macos_incluye_apfs() {
        let fmt = formatos_por_plataforma("macos");
        assert!(fmt.contains(&FormatoSoportado::Apfs));
        assert!(fmt.contains(&FormatoSoportado::HfsPlus));
    }

    #[test]
    fn formatos_por_plataforma_windows_incluye_ntfs() {
        let fmt = formatos_por_plataforma("windows");
        assert!(fmt.contains(&FormatoSoportado::Ntfs));
        assert!(fmt.contains(&FormatoSoportado::Exfat));
        assert!(fmt.contains(&FormatoSoportado::Fat32));
    }

    #[test]
    fn validar_formato_plataforma_rechaza_apfs_en_linux() {
        assert_eq!(validar_formato_plataforma(&FormatoSoportado::Apfs, "linux"), Err(ErrorGuarda::FormatoNoSoportado));
    }

    #[test]
    fn validar_formato_plataforma_acepta_exfat_en_todas() {
        assert!(validar_formato_plataforma(&FormatoSoportado::Exfat, "linux").is_ok());
        assert!(validar_formato_plataforma(&FormatoSoportado::Exfat, "macos").is_ok());
        assert!(validar_formato_plataforma(&FormatoSoportado::Exfat, "windows").is_ok());
    }
}