// ═══════════════════════════════════════════════════════════════════════════
// almacenes_logica — detección pura de volúmenes/medios de almacenamiento (2026-11-25).
// ---------------------------------------------------------------------------
// Contrato: architecture/almacenes-cerebros.md §1 (el almacén).
// Detecta volúmenes con identidad estable (UUID + serie), nunca la ruta de montaje.
// Linux: /proc/mounts + /sys/block + lsblk -J si está.
// macOS: diskutil info -plist.
// Windows: Get-Volume / Get-Disk (PowerShell).
// Android: StorageManager por el puente que ya exista, o lista vacía con motivo.
// Solo std + serde: se prueba sin Tauri (pruebas al final).
// ═══════════════════════════════════════════════════════════════════════════

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::Command;

/// Tipo de almacén según su naturaleza.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TipoAlmacen {
    /// Disco interno del sistema (SSD/HDD).
    Interno,
    /// Medio extraíble (USB, SD, disco externo).
    Extraible,
    /// Almacenamiento de red (NAS, servidor SMB/NFS).
    Red,
    /// Almacenamiento en la nube (Drive, S3, WebDAV, etc.).
    Nube,
    /// Otra neurona o nodo de la malla P2P.
    Neurona,
    /// Desconocido / no se pudo determinar.
    Desconocido,
}

/// Sistema de archivos detectado.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SistemaArchivos {
    Ext4,
    Btrfs,
    Xfs,
    Exfat,
    Fat32,
    Ntfs,
    Apfs,
    HfsPlus,
    Smb,
    Nfs,
    Desconocido(String),
}

/// Información completa de un almacén (medio de almacenamiento).
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Almacen {
    /// Etiqueta legible (nombre del volumen).
    pub etiqueta: String,
    /// UUID del volumen (identidad estable).
    pub uuid: String,
    /// Número de serie del dispositivo físico.
    pub serie: String,
    /// Sistema de archivos.
    pub sistema_archivos: SistemaArchivos,
    /// true si es extraíble (USB, SD, etc.).
    pub extraible: bool,
    /// Capacidad total en bytes.
    pub total_bytes: u64,
    /// Espacio libre en bytes.
    pub libre_bytes: u64,
    /// Punto de montaje (puede cambiar, solo informativo).
    pub punto_montaje: String,
    /// true si es el disco del sistema (donde está / o C:\).
    pub es_disco_sistema: bool,
    /// Tipo de almacén.
    pub tipo: TipoAlmacen,
    /// Plataforma donde se detectó.
    pub plataforma: String,
    /// Motivo si no se pudo obtener algún dato (None = todo ok).
    pub motivo: Option<String>,
}

/// Resultado de listar almacenes.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ListarAlmacenes {
    pub almacenes: Vec<Almacen>,
    /// Plataforma donde se ejecutó.
    pub plataforma: String,
    /// Motivo general si la lista está vacía o incompleta.
    pub motivo: Option<String>,
}

/// Normaliza un UUID: quita guiones, pasa a minúsculas.
fn normalizar_uuid(uuid: &str) -> String {
    uuid.replace('-', "").to_lowercase()
}

/// Detecta si una ruta es el disco del sistema.
fn es_disco_sistema(punto_montaje: &str, plataforma: &str) -> bool {
    match plataforma {
        "linux" | "macos" => {
            punto_montaje == "/" || punto_montaje.starts_with("/System/Volumes/Data")
        }
        "windows" => {
            punto_montaje.eq_ignore_ascii_case("C:\\") || punto_montaje.eq_ignore_ascii_case("C:/")
        }
        _ => false,
    }
}

/// Parsea la salida de `lsblk -J` (Linux).
#[cfg(target_os = "linux")]
fn parsear_lsblk_json(salida: &str) -> HashMap<String, (String, String, bool, u64, String)> {
    // Devuelve: mountpoint -> (uuid, serie, extraible, tamano_bytes, fstype)
    let mut mapa = HashMap::new();
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(salida) {
        if let Some(blockdevices) = json.get("blockdevices").and_then(|v| v.as_array()) {
            for dev in blockdevices {
                let nombre = dev.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let uuid = dev.get("uuid").and_then(|v| v.as_str()).unwrap_or("");
                let serial = dev.get("serial").and_then(|v| v.as_str()).unwrap_or("");
                let rm = dev.get("rm").and_then(|v| v.as_bool()).unwrap_or(false);
                let size = dev.get("size").and_then(|v| v.as_str()).unwrap_or("0");
                let fstype = dev.get("fstype").and_then(|v| v.as_str()).unwrap_or("");
                let mountpoint = dev.get("mountpoint").and_then(|v| v.as_str()).unwrap_or("");
                let tamano = size.parse::<u64>().unwrap_or(0);

                if !mountpoint.is_empty() {
                    mapa.insert(
                        mountpoint.to_string(),
                        (
                            normalizar_uuid(uuid),
                            serial.to_string(),
                            rm,
                            tamano,
                            fstype.to_string(),
                        ),
                    );
                }

                // También procesar hijos (particiones)
                if let Some(children) = dev.get("children").and_then(|v| v.as_array()) {
                    for child in children {
                        let nombre_c = child.get("name").and_then(|v| v.as_str()).unwrap_or("");
                        let uuid_c = child.get("uuid").and_then(|v| v.as_str()).unwrap_or("");
                        let serial_c = child.get("serial").and_then(|v| v.as_str()).unwrap_or("");
                        let rm_c = child.get("rm").and_then(|v| v.as_bool()).unwrap_or(false);
                        let size_c = child.get("size").and_then(|v| v.as_str()).unwrap_or("0");
                        let fstype_c = child.get("fstype").and_then(|v| v.as_str()).unwrap_or("");
                        let mountpoint_c = child
                            .get("mountpoint")
                            .and_then(|v| v.as_str())
                            .unwrap_or("");
                        let tamano_c = size_c.parse::<u64>().unwrap_or(0);

                        if !mountpoint_c.is_empty() {
                            mapa.insert(
                                mountpoint_c.to_string(),
                                (
                                    normalizar_uuid(uuid_c),
                                    serial_c.to_string(),
                                    rm_c,
                                    tamano_c,
                                    fstype_c.to_string(),
                                ),
                            );
                        }
                    }
                }
            }
        }
    }
    mapa
}

/// Lee /proc/mounts en Linux.
#[cfg(target_os = "linux")]
fn leer_proc_mounts() -> Result<Vec<(String, String, String)>, String> {
    // Devuelve: (dispositivo, punto_montaje, fstype)
    let contenido = std::fs::read_to_string("/proc/mounts")
        .map_err(|e| format!("No se pudo leer /proc/mounts: {e}"))?;
    let mut montajes = Vec::new();
    for linea in contenido.lines() {
        let partes: Vec<&str> = linea.split_whitespace().collect();
        if partes.len() >= 3 {
            let dispositivo = partes[0].to_string();
            let punto_montaje = partes[1].to_string();
            let fstype = partes[2].to_string();
            // Filtrar solo sistemas de archivos reales (no virtuales)
            if !dispositivo.starts_with("tmpfs")
                && !dispositivo.starts_with("proc")
                && !dispositivo.starts_with("sysfs")
                && !dispositivo.starts_with("devtmpfs")
                && !dispositivo.starts_with("devpts")
                && !dispositivo.starts_with("cgroup")
                && !dispositivo.starts_with("overlay")
                && !dispositivo.starts_with("nsfs")
                && !dispositivo.starts_with("binfmt_misc")
                && !dispositivo.starts_with("mqueue")
                && !dispositivo.starts_with("hugetlbfs")
                && !dispositivo.starts_with("configfs")
                && !dispositivo.starts_with("tracefs")
                && !dispositivo.starts_with("pstore")
                && !dispositivo.starts_with("efivarfs")
                && !dispositivo.starts_with("securityfs")
                && !dispositivo.starts_with("selinuxfs")
                && !dispositivo.starts_with("debugfs")
                && !dispositivo.starts_with("rpc_pipefs")
                && !dispositivo.starts_with("autofs")
            {
                montajes.push((dispositivo, punto_montaje, fstype));
            }
        }
    }
    Ok(montajes)
}

/// Obtiene información de /sys/block para un dispositivo.
#[cfg(target_os = "linux")]
fn info_sys_block(dispositivo: &str) -> (String, bool) {
    // dispositivo es como "/dev/sda1" o "/dev/nvme0n1p1"
    // Extraer el disco base: sda, nvme0n1, etc.
    let disco = dispositivo
        .strip_prefix("/dev/")
        .unwrap_or(dispositivo)
        .chars()
        .take_while(|c| c.is_alphabetic())
        .collect::<String>();

    let ruta_removable = format!("/sys/block/{disco}/removable");
    let ruta_serial = format!("/sys/block/{disco}/device/serial");
    let ruta_serial_alt = format!("/sys/block/{disco}/serial");

    let extraible = std::fs::read_to_string(&ruta_removable)
        .ok()
        .and_then(|s| s.trim().parse::<u8>().ok())
        .map(|v| v != 0)
        .unwrap_or(false);

    let serie = std::fs::read_to_string(&ruta_serial)
        .ok()
        .or_else(|| std::fs::read_to_string(&ruta_serial_alt))
        .map(|s| s.trim().to_string())
        .unwrap_or_default();

    (serie, extraible)
}

/// Detecta el sistema de archivos desde el string del fstype.
fn detectar_sistema_archivos(fstype: &str) -> SistemaArchivos {
    match fstype.to_lowercase().as_str() {
        "ext4" => SistemaArchivos::Ext4,
        "btrfs" => SistemaArchivos::Btrfs,
        "xfs" => SistemaArchivos::Xfs,
        "exfat" | "vfat" if fstype.contains("exfat") => SistemaArchivos::Exfat,
        "vfat" | "fat32" | "msdos" => SistemaArchivos::Fat32,
        "ntfs" => SistemaArchivos::Ntfs,
        "apfs" => SistemaArchivos::Apfs,
        "hfsplus" | "hfs+" => SistemaArchivos::HfsPlus,
        "smbfs" | "cifs" => SistemaArchivos::Smb,
        "nfs" | "nfs4" => SistemaArchivos::Nfs,
        otro => SistemaArchivos::Desconocido(otro.to_string()),
    }
}

/// Determina el tipo de almacén según la información disponible.
fn determinar_tipo(
    extraible: bool,
    fstype: &str,
    punto_montaje: &str,
    es_sistema: bool,
    plataforma: &str,
) -> TipoAlmacen {
    if es_sistema {
        return TipoAlmacen::Interno;
    }
    if extraible {
        return TipoAlmacen::Extraible;
    }
    // Verificar si es de red por fstype
    let fstype_lower = fstype.to_lowercase();
    if fstype_lower.contains("smb")
        || fstype_lower.contains("cifs")
        || fstype_lower.contains("nfs")
        || fstype_lower.contains("sshfs")
        || fstype_lower.contains("fuse")
    {
        return TipoAlmacen::Red;
    }
    // En Linux, verificar si el punto de montaje sugiere red
    if plataforma == "linux"
        && (punto_montaje.starts_with("/mnt/") || punto_montaje.starts_with("/media/"))
    {
        // Podría ser red o extraíble; si no es extraíble, asumimos red si es remoto
        // Por simplicidad, si no es extraíble ni sistema, y no es red conocido, es interno
    }
    TipoAlmacen::Interno
}

/// Lista almacenes en Linux.
#[cfg(target_os = "linux")]
pub fn listar_almacenes_linux() -> ListarAlmacenes {
    let mut almacenes = Vec::new();
    let mut motivo_general = None;

    // 1. Leer lsblk -J para info rica (UUID, serie, tamaño, extraíble, fstype)
    let lsblk_mapa = Command::new("lsblk")
        .args(["-J", "-o", "NAME,UUID,SERIAL,RM,SIZE,FSTYPE,MOUNTPOINT"])
        .output()
        .ok()
        .and_then(|out| String::from_utf8(out.stdout).ok())
        .map(|s| parsear_lsblk_json(&s))
        .unwrap_or_else(HashMap::new);

    // 2. Leer /proc/mounts para puntos de montaje reales
    let montajes = match leer_proc_mounts() {
        Ok(m) => m,
        Err(e) => {
            motivo_general = Some(e);
            Vec::new()
        }
    };

    for (dispositivo, punto_montaje, fstype) in montajes {
        // Saltar montajes virtuales y pseudo-fs
        if punto_montaje.starts_with("/proc")
            || punto_montaje.starts_with("/sys")
            || punto_montaje.starts_with("/dev")
            || punto_montaje.starts_with("/run")
            || punto_montaje.starts_with("/tmp")
            || punto_montaje == "/boot/efi"
        {
            continue;
        }

        // Buscar info en lsblk
        let (uuid, serie, extraible_lsblk, tamano_lsblk, fstype_lsblk) = lsblk_mapa
            .get(&punto_montaje)
            .cloned()
            .unwrap_or_else(|| (String::new(), String::new(), false, 0, String::new()));

        // Info de /sys/block como respaldo para serie y extraíble
        let (serie_sys, extraible_sys) = info_sys_block(&dispositivo);
        let serie_final = if !serie.is_empty() { serie } else { serie_sys };
        let extraible_final = extraible_lsblk || extraible_sys;

        // UUID: si no hay de lsblk, intentar con blkid
        let uuid_final = if !uuid.is_empty() {
            uuid
        } else {
            Command::new("blkid")
                .args(["-s", "UUID", "-o", "value", &dispositivo])
                .output()
                .ok()
                .and_then(|out| String::from_utf8(out.stdout).ok())
                .map(|s| normalizar_uuid(s.trim()))
                .unwrap_or_default()
        };

        // Sistema de archivos: preferir lsblk, sino /proc/mounts
        let fs_final = if !fstype_lsblk.is_empty() {
            fstype_lsblk
        } else {
            fstype.clone()
        };

        // Espacio en disco
        let (total_bytes, libre_bytes) = match std::fs::metadata(&punto_montaje) {
            Ok(_) => {
                // Usar statvfs via comando df
                let out = Command::new("df")
                    .args(["-Pk", &punto_montaje])
                    .output()
                    .ok();
                if let Some(out) = out {
                    if out.status.success() {
                        let salida = String::from_utf8_lossy(&out.stdout);
                        if let Some(libre_kib) = crate::disco::leer_df(&salida) {
                            // total = usado + libre; pero df no da total directo en -P
                            // Usamos statvfs si está disponible, sino aproximamos
                            let total = Command::new("df")
                                .args(["-Pk", "--output=size", &punto_montaje])
                                .output()
                                .ok()
                                .and_then(|o| String::from_utf8(o.stdout).ok())
                                .and_then(|s| s.lines().nth(1).map(|l| l.trim().to_string()))
                                .and_then(|l| l.parse::<u64>().ok())
                                .map(|kib| kib * 1024)
                                .unwrap_or(libre_kib); // fallback
                            (total, libre_kib)
                        } else {
                            (0, 0)
                        }
                    } else {
                        (0, 0)
                    }
                } else {
                    (0, 0)
                }
            }
            Err(_) => (0, 0),
        };

        let es_sistema = es_disco_sistema(&punto_montaje, "linux");
        let tipo = determinar_tipo(
            extraible_final,
            &fs_final,
            &punto_montaje,
            es_sistema,
            "linux",
        );
        let sistema_archivos = detectar_sistema_archivos(&fs_final);

        let mut motivo = None;
        if uuid_final.is_empty() {
            motivo = Some("No se pudo obtener UUID del volumen".into());
        }
        if serie_final.is_empty() {
            motivo = Some(match motivo {
                Some(m) => format!("{}; sin número de serie", m),
                None => "No se pudo obtener número de serie del dispositivo".into(),
            });
        }

        almacenes.push(Almacen {
            etiqueta: punto_montaje
                .split('/')
                .last()
                .unwrap_or(&punto_montaje)
                .to_string(),
            uuid: uuid_final,
            serie: serie_final,
            sistema_archivos,
            extraible: extraible_final,
            total_bytes,
            libre_bytes,
            punto_montaje,
            es_disco_sistema: es_sistema,
            tipo,
            plataforma: "linux".into(),
            motivo,
        });
    }

    if almacenes.is_empty() && motivo_general.is_none() {
        motivo_general = Some("No se detectaron volúmenes montados (¿sin permisos?)".into());
    }

    ListarAlmacenes {
        almacenes,
        plataforma: "linux".into(),
        motivo: motivo_general,
    }
}

/// Lista almacenes en macOS.
#[cfg(target_os = "macos")]
pub fn listar_almacenes_macos() -> ListarAlmacenes {
    let mut almacenes = Vec::new();
    let mut motivo_general = None;

    // diskutil list -plist da info de todos los discos
    // diskutil info -plist <disk> da info detallada de uno
    let out = Command::new("diskutil").args(["list", "-plist"]).output();

    let discos = match out {
        Ok(out) if out.status.success() => String::from_utf8(out.stdout).ok(),
        _ => None,
    };

    let discos_json: Option<serde_json::Value> = discos
        .and_then(|s| plist::from_str::<serde_json::Value>(&s).ok())
        .or_else(|| {
            // Fallback: intentar parsear como JSON si plist falla
            discos.and_then(|s| serde_json::from_str(&s).ok())
        });

    if let Some(discos_val) = discos_json {
        // diskutil list -plist devuelve un array de discos
        if let Some(array) = discos_val.as_array() {
            for disco in array {
                let identifier = disco
                    .get("DeviceIdentifier")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if identifier.is_empty() {
                    continue;
                }

                // Obtener info detallada de este disco
                let info_out = Command::new("diskutil")
                    .args(["info", "-plist", identifier])
                    .output();

                let info_json = match info_out {
                    Ok(out) if out.status.success() => String::from_utf8(out.stdout).ok(),
                    _ => None,
                };

                let info_val: Option<serde_json::Value> = info_json
                    .and_then(|s| plist::from_str::<serde_json::Value>(&s).ok())
                    .or_else(|| info_json.and_then(|s| serde_json::from_str(&s).ok()));

                if let Some(info) = info_val {
                    let mount_point = info
                        .get("MountPoint")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    if mount_point.is_empty() {
                        continue; // Solo volúmenes montados
                    }

                    // Saltar montajes del sistema que no son volúmenes de usuario
                    if mount_point.starts_with("/private")
                        || mount_point.starts_with("/System")
                        || mount_point == "/Volumes/Recovery"
                    {
                        continue;
                    }

                    let volume_name = info
                        .get("VolumeName")
                        .and_then(|v| v.as_str())
                        .unwrap_or(mount_point.split('/').last().unwrap_or(""));
                    let uuid = info
                        .get("VolumeUUID")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    let serial = info
                        .get("DeviceSerialNumber")
                        .or_else(|| info.get("SerialNumber"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    let fs_type = info
                        .get("FileSystemPersonality")
                        .or_else(|| info.get("FileSystemType"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    let total_size = info.get("TotalSize").and_then(|v| v.as_u64()).unwrap_or(0);
                    let free_space = info
                        .get("FreeSpace")
                        .or_else(|| info.get("AvailableSpace"))
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0);
                    let removable = info
                        .get("Removable")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);
                    let internal = info
                        .get("Internal")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(true);

                    let es_sistema = es_disco_sistema(mount_point, "macos");
                    let extraible = removable || !internal;
                    let tipo =
                        determinar_tipo(extraible, fs_type, mount_point, es_sistema, "macos");
                    let sistema_archivos = detectar_sistema_archivos(fs_type);

                    let mut motivo = None;
                    if uuid.is_empty() {
                        motivo = Some("No se pudo obtener UUID del volumen".into());
                    }
                    if serial.is_empty() {
                        motivo = Some(match motivo {
                            Some(m) => format!("{}; sin número de serie", m),
                            None => "No se pudo obtener número de serie del dispositivo".into(),
                        });
                    }

                    almacenes.push(Almacen {
                        etiqueta: volume_name.to_string(),
                        uuid: normalizar_uuid(uuid),
                        serie: serial.to_string(),
                        sistema_archivos,
                        extraible,
                        total_bytes: total_size,
                        libre_bytes: free_space,
                        punto_montaje: mount_point.to_string(),
                        es_disco_sistema: es_sistema,
                        tipo,
                        plataforma: "macos".into(),
                        motivo,
                    });
                }
            }
        }
    } else {
        motivo_general = Some("No se pudo ejecutar diskutil list -plist".into());
    }

    if almacenes.is_empty() && motivo_general.is_none() {
        motivo_general = Some("No se detectaron volúmenes montados".into());
    }

    ListarAlmacenes {
        almacenes,
        plataforma: "macos".into(),
        motivo: motivo_general,
    }
}

/// Lista almacenes en Windows.
#[cfg(target_os = "windows")]
pub fn listar_almacenes_windows() -> ListarAlmacenes {
    let mut almacenes = Vec::new();
    let mut motivo_general = None;

    // Usar PowerShell Get-Volume y Get-Disk
    // Get-Volume da info de particiones montadas
    // Get-Disk da info de discos físicos (serie, etc.)
    let ps_script = r#"
        $volumes = Get-Volume | Where-Object { $_.DriveLetter -ne '' -and $_.FileSystem -ne '' }
        $disks = Get-Disk
        $result = @()
        foreach ($vol in $volumes) {
            $driveLetter = $vol.DriveLetter + ':'
            $size = $vol.Size
            $free = $vol.SizeRemaining
            $fs = $vol.FileSystem
            $label = $vol.FileSystemLabel
            # Buscar el disco físico para este volumen
            $disk = $disks | Where-Object { $_.Number -eq $vol.DiskNumber } | Select-Object -First 1
            $serial = if ($disk) { $disk.SerialNumber } else { '' }
            $removable = if ($disk) { $disk.BusType -eq 'USB' -or $disk.BusType -eq 'SD' } else { $false }
            $result += @{
                DriveLetter = $driveLetter
                Label = $label
                Size = $size
                Free = $free
                FileSystem = $fs
                SerialNumber = $serial
                Removable = $removable
                DiskNumber = $vol.DiskNumber
            }
        }
        $result | ConvertTo-Json -Depth 3
    "#;

    let out = Command::new("powershell")
        .args(["-NoProfile", "-Command", ps_script])
        .output();

    match out {
        Ok(out) if out.status.success() => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&stdout) {
                let items = if json.is_array() {
                    json.as_array().unwrap()
                } else {
                    std::slice::from_ref(&json)
                };

                for item in items {
                    let drive_letter = item
                        .get("DriveLetter")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    if drive_letter.is_empty() {
                        continue;
                    }
                    let label = item
                        .get("Label")
                        .and_then(|v| v.as_str())
                        .unwrap_or(drive_letter);
                    let total = item.get("Size").and_then(|v| v.as_u64()).unwrap_or(0);
                    let free = item.get("Free").and_then(|v| v.as_u64()).unwrap_or(0);
                    let fs = item
                        .get("FileSystem")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    let serial = item
                        .get("SerialNumber")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    let removable = item
                        .get("Removable")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);

                    let punto_montaje = format!("{drive_letter}\\");
                    let es_sistema = es_disco_sistema(&punto_montaje, "windows");
                    let tipo =
                        determinar_tipo(removable, fs, &punto_montaje, es_sistema, "windows");
                    let sistema_archivos = detectar_sistema_archivos(fs);

                    // UUID en Windows: usar el GUID del volumen via mountvol
                    let uuid = Command::new("powershell")
                        .args([
                            "-NoProfile",
                            "-Command",
                            &format!(
                                "(Get-Volume -DriveLetter {} | Select-Object -ExpandProperty ObjectId).Guid",
                                drive_letter.trim_end_matches(':')
                            ),
                        ])
                        .output()
                        .ok()
                        .and_then(|o| String::from_utf8(o.stdout).ok())
                        .map(|s| normalizar_uuid(s.trim()))
                        .unwrap_or_default();

                    let mut motivo = None;
                    if uuid.is_empty() {
                        motivo = Some("No se pudo obtener UUID del volumen".into());
                    }
                    if serial.is_empty() {
                        motivo = Some(match motivo {
                            Some(m) => format!("{}; sin número de serie", m),
                            None => "No se pudo obtener número de serie del dispositivo".into(),
                        });
                    }

                    almacenes.push(Almacen {
                        etiqueta: label.to_string(),
                        uuid,
                        serie: serial.to_string(),
                        sistema_archivos,
                        extraible: removable,
                        total_bytes: total,
                        libre_bytes: free,
                        punto_montaje,
                        es_disco_sistema: es_sistema,
                        tipo,
                        plataforma: "windows".into(),
                        motivo,
                    });
                }
            } else {
                motivo_general = Some("No se pudo parsear la salida de PowerShell".into());
            }
        }
        _ => {
            motivo_general = Some("No se pudo ejecutar Get-Volume/Get-Disk en PowerShell".into());
        }
    }

    if almacenes.is_empty() && motivo_general.is_none() {
        motivo_general = Some("No se detectaron volúmenes montados".into());
    }

    ListarAlmacenes {
        almacenes,
        plataforma: "windows".into(),
        motivo: motivo_general,
    }
}

/// Lista almacenes en Android.
#[cfg(target_os = "android")]
pub fn listar_almacenes_android() -> ListarAlmacenes {
    // En Android, el acceso a almacenamiento externo requiere permisos y el puente Kotlin.
    // Por ahora, devolvemos lista vacía con motivo explicativo.
    // TODO: Implementar vía StorageManager en el puente Kotlin existente.
    ListarAlmacenes {
        almacenes: Vec::new(),
        plataforma: "android".into(),
        motivo: Some(
            "En Android la detección de volúmenes requiere el puente StorageManager (próxima versión)".into(),
        ),
    }
}

/// Lista almacenes en otras plataformas (iOS, etc.).
#[cfg(not(any(
    target_os = "linux",
    target_os = "macos",
    target_os = "windows",
    target_os = "android"
)))]
pub fn listar_almacenes_otro() -> ListarAlmacenes {
    ListarAlmacenes {
        almacenes: Vec::new(),
        plataforma: std::env::consts::OS.to_string(),
        motivo: Some("Detección de almacenes no implementada en esta plataforma".into()),
    }
}

/// Función pública unificada para listar almacenes en la plataforma actual.
pub fn listar_almacenes() -> ListarAlmacenes {
    #[cfg(target_os = "linux")]
    return listar_almacenes_linux();
    #[cfg(target_os = "macos")]
    return listar_almacenes_macos();
    #[cfg(target_os = "windows")]
    return listar_almacenes_windows();
    #[cfg(target_os = "android")]
    return listar_almacenes_android();
    #[cfg(not(any(
        target_os = "linux",
        target_os = "macos",
        target_os = "windows",
        target_os = "android"
    )))]
    return listar_almacenes_otro();
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn normalizar_uuid_quita_guiones_y_minusculas() {
        assert_eq!(
            normalizar_uuid("123E4567-E89B-12D3-A456-426614174000"),
            "123e4567e89b12d3a456426614174000"
        );
        assert_eq!(normalizar_uuid("abcdef"), "abcdef");
        assert_eq!(normalizar_uuid(""), "");
    }

    #[test]
    fn detectar_sistema_archivos_conocidos() {
        assert_eq!(detectar_sistema_archivos("ext4"), SistemaArchivos::Ext4);
        assert_eq!(detectar_sistema_archivos("btrfs"), SistemaArchivos::Btrfs);
        assert_eq!(detectar_sistema_archivos("xfs"), SistemaArchivos::Xfs);
        assert_eq!(detectar_sistema_archivos("exfat"), SistemaArchivos::Exfat);
        assert_eq!(detectar_sistema_archivos("vfat"), SistemaArchivos::Fat32);
        assert_eq!(detectar_sistema_archivos("ntfs"), SistemaArchivos::Ntfs);
        assert_eq!(detectar_sistema_archivos("apfs"), SistemaArchivos::Apfs);
        assert_eq!(
            detectar_sistema_archivos("hfsplus"),
            SistemaArchivos::HfsPlus
        );
        assert_eq!(detectar_sistema_archivos("smbfs"), SistemaArchivos::Smb);
        assert_eq!(detectar_sistema_archivos("nfs"), SistemaArchivos::Nfs);
        assert_eq!(
            detectar_sistema_archivos("zfs"),
            SistemaArchivos::Desconocido("zfs".into())
        );
    }

    #[test]
    fn es_disco_sistema_linux_macos() {
        assert!(es_disco_sistema("/", "linux"));
        assert!(es_disco_sistema("/System/Volumes/Data", "macos"));
        assert!(!es_disco_sistema("/home", "linux"));
        assert!(!es_disco_sistema("/mnt/usb", "linux"));
    }

    #[test]
    fn es_disco_sistema_windows() {
        assert!(es_disco_sistema("C:\\", "windows"));
        assert!(es_disco_sistema("C:/", "windows"));
        assert!(!es_disco_sistema("D:\\", "windows"));
        assert!(!es_disco_sistema("E:/", "windows"));
    }

    #[test]
    fn determinar_tipo_sistema() {
        assert_eq!(
            determinar_tipo(false, "ext4", "/", true, "linux"),
            TipoAlmacen::Interno
        );
        assert_eq!(
            determinar_tipo(true, "exfat", "/mnt/usb", false, "linux"),
            TipoAlmacen::Extraible
        );
        assert_eq!(
            determinar_tipo(false, "smbfs", "/mnt/nas", false, "linux"),
            TipoAlmacen::Red
        );
        assert_eq!(
            determinar_tipo(false, "cifs", "/mnt/share", false, "linux"),
            TipoAlmacen::Red
        );
        assert_eq!(
            determinar_tipo(false, "nfs4", "/mnt/nfs", false, "linux"),
            TipoAlmacen::Red
        );
    }

    #[test]
    fn listar_almacenes_no_panica() {
        // Solo verifica que la función se ejecuta sin panic
        let resultado = listar_almacenes();
        assert_eq!(resultado.plataforma, std::env::consts::OS);
        // En CI puede no haber volúmenes detectados; solo chequeamos que la estructura es válida
        for a in &resultado.almacenes {
            assert!(!a.etiqueta.is_empty() || !a.uuid.is_empty() || !a.punto_montaje.is_empty());
        }
    }
}
