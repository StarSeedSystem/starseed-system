// ═══════════════════════════════════════════════════════════════════════════
// recursos_ia — discos y NPU de esta neurona para «Recursos de IA» (2026-10-23).
// Contrato: architecture/recursos-ia-neurona.md §2 y §3 (reglas duras).
// ---------------------------------------------------------------------------
// La web no ve los discos ni la NPU de la máquina. La app nativa sí, sin
// permisos especiales, y se lo cuenta al panel de Recursos de IA:
//   · volúmenes montados: punto de montaje, total, libre, interno/externo,
//     sistema de archivos y (en Linux) si el disco es NVMe, SSD, HDD o SD;
//   · NPU por el nombre del chip: Apple Neural Engine en Apple Silicon, y las
//     de Intel (AI Boost), AMD (XDNA) y Qualcomm (Hexagon) cuando la CPU se
//     identifica con claridad.
//
// Honestidad: lo que no se puede medir se omite; nunca se inventa. Sin `df`,
// `mount` o sysctl se devuelve la lista vacía con un aviso legible.
// Solo std (+ serde para la respuesta de Tauri): se prueba sin la app.
// ═══════════════════════════════════════════════════════════════════════════

use serde::Serialize;
use std::collections::HashMap;
#[cfg(not(windows))]
use std::process::Command;

const GIB: f64 = 1024.0 * 1024.0 * 1024.0;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VolumenNativo {
    pub montaje: String,
    pub nombre: String,
    pub total_gb: f64,
    pub libre_gb: f64,
    pub externo: bool,
    pub tipo_disco: String,
    pub conexion: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sistema_archivos: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub solo_lectura: Option<bool>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NpuNativo {
    pub nombre: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tops: Option<f64>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RecursosIaNativo {
    pub so: String,
    pub arquitectura: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chip: Option<String>,
    pub nucleos: usize,
    pub ram_gb: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub npu: Option<NpuNativo>,
    pub volumenes: Vec<VolumenNativo>,
    pub avisos: Vec<String>,
}

#[derive(Clone, Debug)]
struct FilaDf {
    dispositivo: String,
    total_kib: u64,
    libre_kib: u64,
    montaje: String,
}

fn redondear_gb(bytes: u64) -> f64 {
    ((bytes as f64 / GIB) * 10.0).round() / 10.0
}

fn texto(valor: &str, tope: usize) -> String {
    valor.trim().chars().take(tope).collect()
}

/// Nombre visible del volumen: «Macintosh HD», «SSD Externo» o «Disco del sistema».
fn nombre_del_montaje(montaje: &str) -> String {
    if montaje == "/" {
        return "Disco del sistema".to_string();
    }
    montaje
        .trim_end_matches('/')
        .rsplit('/')
        .next()
        .filter(|n| !n.is_empty())
        .map(|n| texto(n, 80))
        .unwrap_or_else(|| texto(montaje, 80))
}

/// Sistemas de archivos de red: no son discos locales ni sirven para streaming de pesos.
fn es_red(sistema: &str) -> bool {
    matches!(
        sistema,
        "smbfs"
            | "cifs"
            | "nfs"
            | "nfs4"
            | "afpfs"
            | "webdav"
            | "davfs"
            | "fuse.sshfs"
            | "fuse.rclone"
            | "9p"
    )
}

/// ¿Es un montaje del sistema que no interesa como almacén de modelos?
fn es_montaje_de_sistema(montaje: &str, sistema: &str) -> bool {
    if montaje == "/" {
        return false;
    }
    const PREFIJOS: [&str; 13] = [
        "/dev",
        "/proc",
        "/sys",
        "/run",
        "/snap",
        "/boot",
        "/var/lib/docker",
        "/var/lib/containers",
        "/System/Volumes",
        "/private/var/vm",
        "/Library/Developer/CoreSimulator",
        "/Volumes/Recovery",
        "/private/tmp",
    ];
    if PREFIJOS
        .iter()
        .any(|p| montaje == *p || montaje.starts_with(&format!("{p}/")))
    {
        return true;
    }
    matches!(
        sistema,
        "tmpfs"
            | "devtmpfs"
            | "devfs"
            | "proc"
            | "sysfs"
            | "cgroup"
            | "cgroup2"
            | "overlay"
            | "squashfs"
            | "ramfs"
            | "autofs"
            | "nsfs"
            | "fusectl"
            | "debugfs"
            | "tracefs"
            | "securityfs"
            | "pstore"
            | "bpf"
            | "mqueue"
            | "hugetlbfs"
            | "configfs"
            | "binfmt_misc"
    )
}

fn es_externo(montaje: &str, sistema_so: &str) -> bool {
    if sistema_so == "macos" {
        return montaje.starts_with("/Volumes/");
    }
    montaje.starts_with("/media/")
        || montaje.starts_with("/mnt/")
        || montaje.starts_with("/run/media/")
}

fn filas_df(salida: &str) -> Vec<FilaDf> {
    let mut filas = Vec::new();
    for linea in salida.lines().skip(1) {
        let campos: Vec<&str> = linea.split_whitespace().collect();
        let Some(pos) = campos.iter().rposition(|c| c.ends_with('%')) else {
            continue;
        };
        if pos < 3 {
            continue;
        }
        let (Ok(total_kib), Ok(libre_kib)) = (
            campos[pos - 3].parse::<u64>(),
            campos[pos - 1].parse::<u64>(),
        ) else {
            continue;
        };
        filas.push(FilaDf {
            dispositivo: campos.first().copied().unwrap_or("").to_string(),
            total_kib,
            libre_kib,
            montaje: campos[pos + 1..].join(" "),
        });
    }
    filas
}

/// Salida de `mount` → sistema de archivos por punto de montaje. PURA.
pub fn sistemas_de_montaje(salida: &str) -> HashMap<String, String> {
    let mut mapa = HashMap::new();
    for linea in salida.lines() {
        let Some((_dispositivo, resto)) = linea.split_once(" on ") else {
            continue;
        };
        if let Some((montaje, tras_tipo)) = resto.split_once(" type ") {
            let fs = tras_tipo
                .split_whitespace()
                .next()
                .unwrap_or("")
                .trim_end_matches(',');
            if !montaje.trim().is_empty() && !fs.is_empty() {
                mapa.insert(montaje.trim().to_string(), fs.to_lowercase());
            }
        } else if let Some((montaje, tras_parentesis)) = resto.split_once(" (") {
            let fs = tras_parentesis.split(',').next().unwrap_or("").trim();
            if !montaje.trim().is_empty() && !fs.is_empty() {
                mapa.insert(montaje.trim().to_string(), fs.to_lowercase());
            }
        }
    }
    mapa
}

/// Montajes de solo lectura según la salida de `mount`: `ro` en Linux, `read-only` en macOS.
/// Se excluye el raíz: en macOS su volumen del sistema va sellado «read-only» pero la escritura
/// real va por el volumen Data (firmlink); marcarlo dejaría sin disco interno a toda la neurona.
/// PURA.
pub fn montajes_solo_lectura(salida: &str) -> Vec<String> {
    let mut out = Vec::new();
    for linea in salida.lines() {
        let Some((_dispositivo, resto)) = linea.split_once(" on ") else {
            continue;
        };
        let (montaje, opciones) = if let Some((m, tras)) = resto.split_once(" type ") {
            let tras_opciones = tras.splitn(2, ' ').nth(1).unwrap_or("");
            (m, tras_opciones)
        } else if let Some((m, tras)) = resto.split_once(" (") {
            (m, tras)
        } else {
            continue;
        };
        let ro = opciones
            .trim_end_matches(')')
            .trim_start_matches('(')
            .split(',')
            .any(|o| matches!(o.trim(), "ro" | "read-only"));
        if ro && montaje.trim() != "/" {
            out.push(montaje.trim().to_string());
        }
    }
    out
}

#[cfg(target_os = "linux")]
fn tipo_disco_linux(dispositivo: &str) -> String {
    let nombre = dispositivo.rsplit('/').next().unwrap_or("");
    if nombre.starts_with("nvme") {
        return "nvme".to_string();
    }
    if nombre.starts_with("mmcblk") {
        return "sd".to_string();
    }
    let base = nombre.trim_end_matches(|c: char| c.is_ascii_digit());
    let rotacional = std::fs::read_to_string(format!("/sys/block/{base}/queue/rotational"))
        .ok()
        .and_then(|s| s.trim().parse::<u8>().ok());
    match rotacional {
        Some(0) => "ssd".to_string(),
        Some(_) => "hdd".to_string(),
        None => "desconocido".to_string(),
    }
}

#[cfg(not(target_os = "linux"))]
fn tipo_disco_linux(_dispositivo: &str) -> String {
    "desconocido".to_string()
}

/// `df -Pk` + `mount` → volúmenes reales (sin montajes de sistema ni pseudo-discos). PURA.
pub fn volumenes_de_df(
    salida_df: &str,
    salida_mount: &str,
    sistema_so: &str,
) -> Vec<VolumenNativo> {
    let sistemas = sistemas_de_montaje(salida_mount);
    let solo_lectura: std::collections::HashSet<String> = montajes_solo_lectura(salida_mount).into_iter().collect();
    let mut filas = filas_df(salida_df);
    // En macOS el volumen raíz es de solo lectura; el espacio real lo da el volumen Data.
    if sistema_so == "macos" {
        if let Some((total, libre)) = filas
            .iter()
            .find(|f| f.montaje == "/System/Volumes/Data")
            .map(|f| (f.total_kib, f.libre_kib))
        {
            if let Some(raiz) = filas.iter_mut().find(|f| f.montaje == "/") {
                raiz.total_kib = total;
                raiz.libre_kib = libre;
            }
        }
    }
    filas
        .into_iter()
        .filter(|f| !f.montaje.is_empty())
        .filter_map(|f| {
            let fs = sistemas.get(&f.montaje).cloned().unwrap_or_default();
            if es_montaje_de_sistema(&f.montaje, &fs) {
                return None;
            }
            let red = es_red(&fs);
            let externo = !red && es_externo(&f.montaje, sistema_so);
            let tipo = if red {
                "red".to_string()
            } else if sistema_so == "linux" {
                tipo_disco_linux(&f.dispositivo)
            } else {
                "desconocido".to_string()
            };
            Some(VolumenNativo {
                montaje: texto(&f.montaje, 240),
                nombre: nombre_del_montaje(&f.montaje),
                total_gb: redondear_gb(f.total_kib.saturating_mul(1024)),
                libre_gb: redondear_gb(f.libre_kib.saturating_mul(1024)),
                externo,
                tipo_disco: tipo,
                conexion: if red {
                    "red"
                } else if externo {
                    "usb"
                } else {
                    "interna"
                }
                .to_string(),
                sistema_archivos: (!fs.is_empty()).then(|| texto(&fs, 20)),
                solo_lectura: if solo_lectura.contains(&f.montaje) { Some(true) } else { None },
            })
        })
        .collect()
}

#[cfg(not(windows))]
fn volumenes_del_sistema() -> (Vec<VolumenNativo>, Vec<String>) {
    let mut avisos = Vec::new();
    let salida_df = Command::new("df").args(["-kP"]).output();
    let salida_mount = Command::new("mount").output();
    let (Ok(df), Ok(mount)) = (salida_df, salida_mount) else {
        avisos.push("No se pudieron leer los discos de esta neurona (falta df/mount).".to_string());
        return (vec![], avisos);
    };
    if !df.status.success() {
        avisos.push("El sistema no dejó listar los discos (df falló).".to_string());
        return (vec![], avisos);
    }
    let sistema = if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    };
    let montajes = if mount.status.success() {
        String::from_utf8_lossy(&mount.stdout).to_string()
    } else {
        String::new()
    };
    let volumenes = volumenes_de_df(&String::from_utf8_lossy(&df.stdout), &montajes, sistema);
    if volumenes.is_empty() {
        avisos.push("No se encontró ningún volumen utilizable para modelos.".to_string());
    }
    (volumenes, avisos)
}

#[cfg(windows)]
fn volumenes_del_sistema() -> (Vec<VolumenNativo>, Vec<String>) {
    let mut avisos = Vec::new();
    let script = "Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID,VolumeName,Size,FreeSpace,DriveType,FileSystem | ConvertTo-Json -Compress";
    let salida = crate::disco::orden("powershell")
        .args(["-NoProfile", "-Command", script])
        .output();
    let Ok(out) = salida else {
        avisos.push(
            "No se pudieron leer los discos de esta neurona (PowerShell no contestó).".to_string(),
        );
        return (vec![], avisos);
    };
    let texto_json = String::from_utf8_lossy(&out.stdout);
    let Ok(valor) = serde_json::from_str::<serde_json::Value>(&texto_json) else {
        avisos.push("Windows devolvió los discos en un formato que no se pudo leer.".to_string());
        return (vec![], avisos);
    };
    let lista: Vec<serde_json::Value> = match valor {
        serde_json::Value::Array(a) => a,
        serde_json::Value::Object(_) => vec![valor],
        _ => vec![],
    };
    let mut volumenes = Vec::new();
    for d in lista {
        let id = d.get("DeviceID").and_then(|x| x.as_str()).unwrap_or("");
        let total = d.get("Size").and_then(|x| x.as_u64()).unwrap_or(0);
        if id.is_empty() || total == 0 {
            continue;
        }
        let libre = d.get("FreeSpace").and_then(|x| x.as_u64()).unwrap_or(0);
        let tipo_windows = d.get("DriveType").and_then(|x| x.as_u64()).unwrap_or(3);
        let red = tipo_windows == 4;
        let fs = d
            .get("FileSystem")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_lowercase();
        let nombre = d
            .get("VolumeName")
            .and_then(|x| x.as_str())
            .filter(|n| !n.is_empty())
            .unwrap_or(id);
        volumenes.push(VolumenNativo {
            montaje: format!("{id}\\"),
            nombre: texto(nombre, 80),
            total_gb: redondear_gb(total),
            libre_gb: redondear_gb(libre),
            externo: tipo_windows == 2,
            tipo_disco: if red {
                "red".to_string()
            } else {
                "desconocido".to_string()
            },
            conexion: if red {
                "red"
            } else if tipo_windows == 2 {
                "usb"
            } else {
                "interna"
            }
            .to_string(),
            sistema_archivos: (!fs.is_empty()).then(|| texto(&fs, 20)),
            solo_lectura: None,
        });
    }
    if volumenes.is_empty() {
        avisos.push("No se encontró ningún volumen utilizable para modelos.".to_string());
    }
    (volumenes, avisos)
}

/// NPU por el nombre de la CPU: lo que el chip dice de sí mismo, sin sondas privilegiadas. PURA.
pub fn npu_de_cpu(chip: &str) -> Option<NpuNativo> {
    let c = chip.to_lowercase();
    if c.starts_with("apple m") {
        let modelo = c.get(6..8).unwrap_or("").to_uppercase();
        let tops = match modelo.as_str() {
            "M1" => Some(11.0),
            "M2" => Some(15.8),
            "M3" => Some(18.0),
            "M4" => Some(38.0),
            _ => None,
        };
        return Some(NpuNativo {
            nombre: "Apple Neural Engine".to_string(),
            tops,
        });
    }
    // «Intel(R) Core(TM) Ultra…»: se busca «ultra» a secas, no «core ultra».
    let intel = c.contains("intel")
        && (c.contains("ultra")
            || c.contains("meteor lake")
            || c.contains("lunar lake")
            || c.contains("arrow lake")
            || c.contains("npu"));
    if intel {
        return Some(NpuNativo {
            nombre: "Intel AI Boost (NPU)".to_string(),
            tops: None,
        });
    }
    let amd =
        c.contains("amd") && (c.contains("ryzen ai") || c.contains("xdna") || c.contains("npu"));
    if amd {
        return Some(NpuNativo {
            nombre: "AMD XDNA (NPU)".to_string(),
            tops: None,
        });
    }
    let qualcomm = (c.contains("qualcomm") || c.contains("snapdragon"))
        && (c.contains("x ")
            || c.contains("x elite")
            || c.contains("x plus")
            || c.contains("hexagon"));
    if qualcomm {
        return Some(NpuNativo {
            nombre: "Qualcomm Hexagon (NPU)".to_string(),
            tops: None,
        });
    }
    None
}

#[cfg(target_os = "macos")]
fn chip_del_sistema() -> Option<String> {
    let salida = Command::new("/usr/sbin/sysctl")
        .args(["-n", "machdep.cpu.brand_string"])
        .output()
        .or_else(|_| {
            Command::new("sysctl")
                .args(["-n", "machdep.cpu.brand_string"])
                .output()
        })
        .ok()?;
    let chip = String::from_utf8_lossy(&salida.stdout).trim().to_string();
    (!chip.is_empty()).then_some(chip)
}

#[cfg(target_os = "linux")]
fn chip_del_sistema() -> Option<String> {
    let cpuinfo = std::fs::read_to_string("/proc/cpuinfo").ok()?;
    cpuinfo.lines().find_map(|linea| {
        let (clave, valor) = linea.split_once(':')?;
        clave
            .trim()
            .eq_ignore_ascii_case("model name")
            .then(|| valor.trim().to_string())
    })
}

#[cfg(windows)]
fn chip_del_sistema() -> Option<String> {
    std::env::var("PROCESSOR_IDENTIFIER")
        .ok()
        .filter(|c| !c.trim().is_empty())
        .map(|c| texto(&c, 160))
}

#[cfg(not(any(target_os = "macos", target_os = "linux", windows)))]
fn chip_del_sistema() -> Option<String> {
    None
}

#[cfg(target_os = "macos")]
fn ram_del_sistema() -> Option<f64> {
    let salida = Command::new("/usr/sbin/sysctl")
        .args(["-n", "hw.memsize"])
        .output()
        .or_else(|_| Command::new("sysctl").args(["-n", "hw.memsize"]).output())
        .ok()?;
    let bytes = String::from_utf8_lossy(&salida.stdout)
        .trim()
        .parse::<u64>()
        .ok()?;
    (bytes > 0).then(|| redondear_gb(bytes))
}

#[cfg(target_os = "linux")]
fn ram_del_sistema() -> Option<f64> {
    let meminfo = std::fs::read_to_string("/proc/meminfo").ok()?;
    let kib = meminfo.lines().find_map(|linea| {
        let resto = linea.strip_prefix("MemTotal:")?;
        resto.split_whitespace().next()?.parse::<u64>().ok()
    })?;
    (kib > 0).then(|| redondear_gb(kib.saturating_mul(1024)))
}

#[cfg(windows)]
fn ram_del_sistema() -> Option<f64> {
    let script = "(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory";
    let out = crate::disco::orden("powershell")
        .args(["-NoProfile", "-Command", script])
        .output()
        .ok()?;
    let bytes = String::from_utf8_lossy(&out.stdout)
        .trim()
        .parse::<u64>()
        .ok()?;
    (bytes > 0).then(|| redondear_gb(bytes))
}

#[cfg(not(any(target_os = "macos", target_os = "linux", windows)))]
fn ram_del_sistema() -> Option<f64> {
    None
}

fn arquitectura() -> String {
    match std::env::consts::ARCH {
        "aarch64" => "arm64".to_string(),
        "x86_64" => "x86_64".to_string(),
        "wasm32" => "wasm".to_string(),
        _ => "otra".to_string(),
    }
}

fn nombre_so() -> String {
    match std::env::consts::OS {
        "macos" => "macOS".to_string(),
        "windows" => "Windows".to_string(),
        "linux" => "Linux".to_string(),
        otro => texto(otro, 40),
    }
}

/// Lee la máquina sin permisos especiales. Lo que falla queda en `avisos`, nunca se finge.
pub fn detectar() -> RecursosIaNativo {
    let (volumenes, mut avisos) = volumenes_del_sistema();
    let chip = chip_del_sistema();
    let npu = chip.as_deref().and_then(npu_de_cpu);
    if chip.is_some() && npu.is_none() {
        avisos.push(
            "El nombre de la CPU no declara una NPU conocida: no se anuncia ninguna.".to_string(),
        );
    }
    RecursosIaNativo {
        so: nombre_so(),
        arquitectura: arquitectura(),
        chip,
        nucleos: std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(0),
        ram_gb: ram_del_sistema().unwrap_or(0.0),
        npu,
        volumenes,
        avisos,
    }
}

/// Comando de Tauri: `window.__TAURI__.core.invoke("recursos_ia_detectar")`.
/// Bloqueante (df/mount/sysctl) → fuera del hilo de la ventana.
#[tauri::command]
pub async fn recursos_ia_detectar() -> Result<RecursosIaNativo, String> {
    tauri::async_runtime::spawn_blocking(detectar)
        .await
        .map_err(|e| format!("La detección nativa de discos se cortó: {e}"))
}

#[cfg(test)]
mod pruebas {
    use super::*;

    const DF_MAC: &str = "Filesystem 1024-blocks Used Available Capacity Mounted on\n\
/dev/disk3s1s1 239362496 180000000 52000000 78% /\n\
/dev/disk3s5 239362496 180000000 52000000 78% /System/Volumes/Data\n\
/dev/disk5s1 976490576 100000000 800000000 20% /Volumes/SSD Externo\n";
    const MOUNT_MAC: &str = "/dev/disk3s1s1 on / (apfs, sealed, local, read-only, journaled)\n\
/dev/disk3s5 on /System/Volumes/Data (apfs, local, journaled)\n\
/dev/disk5s1 on /Volumes/SSD Externo (exfat, local, nodev, nosuid)\n";

    #[test]
    fn lee_volumenes_de_mac_con_su_libre_real_y_el_externo() {
        let v = volumenes_de_df(DF_MAC, MOUNT_MAC, "macos");
        assert_eq!(v.len(), 2);
        assert_eq!(v[0].montaje, "/");
        assert_eq!(v[0].nombre, "Disco del sistema");
        assert_eq!(v[0].sistema_archivos.as_deref(), Some("apfs"));
        assert!(!v[0].externo && v[0].conexion == "interna");
        assert_eq!(v[1].montaje, "/Volumes/SSD Externo");
        assert_eq!(v[1].nombre, "SSD Externo");
        assert!(v[1].externo && v[1].conexion == "usb");
        assert_eq!(v[1].sistema_archivos.as_deref(), Some("exfat"));
    }

    #[test]
    fn lee_volumenes_de_linux_y_descarta_los_del_sistema() {
        let df = "Filesystem 1024-blocks Used Available Capacity Mounted on\n\
/dev/nvme0n1p2 264000000 44000000 216000000 17% /\n\
/dev/sda1 976490576 100000000 800000000 12% /media/alex/SSD\n\
tmpfs 8123456 0 8123456 0% /run\n";
        let mount = "/dev/nvme0n1p2 on / type ext4 (rw,relatime)\n\
/dev/sda1 on /media/alex/SSD type exfat (rw,nosuid,nodev)\n\
tmpfs on /run type tmpfs (rw,nosuid,nodev)\n";
        let v = volumenes_de_df(df, mount, "linux");
        assert_eq!(
            v.iter().map(|x| x.montaje.as_str()).collect::<Vec<_>>(),
            vec!["/", "/media/alex/SSD"]
        );
        assert_eq!(v[0].sistema_archivos.as_deref(), Some("ext4"));
        assert!(v[1].externo && v[1].conexion == "usb");
    }

    #[test]
    fn reconoce_la_npu_por_el_nombre_del_chip() {
        assert_eq!(npu_de_cpu("Apple M1").unwrap().tops, Some(11.0));
        assert_eq!(npu_de_cpu("Apple M2 Pro").unwrap().tops, Some(15.8));
        assert_eq!(
            npu_de_cpu("Apple M4").unwrap().nombre,
            "Apple Neural Engine"
        );
        assert!(npu_de_cpu("Intel(R) Core(TM) Ultra 7 155H")
            .unwrap()
            .nombre
            .contains("Intel"));
        assert!(npu_de_cpu("AMD Ryzen AI 9 HX 370")
            .unwrap()
            .nombre
            .contains("AMD"));
        assert!(npu_de_cpu("Qualcomm Snapdragon X Elite")
            .unwrap()
            .nombre
            .contains("Qualcomm"));
        assert!(npu_de_cpu("Intel Core i7-1165G7").is_none());
        assert!(npu_de_cpu("Apple M1").is_some());
        assert!(npu_de_cpu("").is_none());
    }

    #[test]
    fn marca_la_solo_lectura_de_mount_sin_marcar_el_raiz_sellado_de_mac() {
        let linux = "/dev/sda1 on /media/alex/SSD type exfat (rw,nosuid,nodev)\n\
/dev/sdb1 on /media/alex/DVD type iso9660 (ro,nosuid,nodev)\n";
        let ro = montajes_solo_lectura(linux);
        assert_eq!(ro, vec!["/media/alex/DVD"]);
        let v = volumenes_de_df(
            "Filesystem 1024-blocks Used Available Capacity Mounted on\n\
/dev/sda1 976490576 100000000 800000000 12% /media/alex/SSD\n\
/dev/sdb1 4700000 0 4700000 0% /media/alex/DVD\n",
            linux,
            "linux",
        );
        assert_eq!(v[0].solo_lectura, None);
        assert_eq!(v[1].solo_lectura, Some(true));
        // El raíz de macOS va «read-only» sellado pero se usa: la escritura real va por el
        // volumen Data (firmlink); marcarlo dejaría la neurona sin disco interno.
        let ro_mac = montajes_solo_lectura(MOUNT_MAC);
        assert!(ro_mac.is_empty());
        let v_mac = volumenes_de_df(DF_MAC, MOUNT_MAC, "macos");
        assert_eq!(v_mac[0].solo_lectura, None);
    }
}
