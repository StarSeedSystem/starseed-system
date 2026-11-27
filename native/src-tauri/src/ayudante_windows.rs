//! (TRM1125G) Ayudante privilegiado Windows · registro como servicio y comandos Tauri para órdenes tipadas.
//! Contrato: architecture/terminal-entre-neuronas.md, architecture/control-remoto-entre-neuronas.md,
//! architecture/permisos-y-control-del-dispositivo.md §4.
//!
//! El ayudante se instala como servicio de Windows (installMode perMachine en NSIS) con su ventana de UAC.
//! Ofrece órdenes tipadas (almacenes, servicios propios de StarSeed, actualizar, logs, reiniciar)
//! con guardas en la lógica pura y registro de solo-añadir.

use crate::ayudante_windows_logica as al;
use crate::acceso_equipo_logica as ael;
use serde::Serialize;
use std::collections::HashMap;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, Webview};

// ─── Estado global ───

static AYUDANTE_REGISTRADO: AtomicBool = AtomicBool::new(false);
static REGISTRANDO: AtomicBool = AtomicBool::new(false);
static EJECUTANDO: AtomicBool = AtomicBool::new(false);

fn tomar_ejecucion() -> bool {
    !EJECUTANDO.swap(true, Ordering::SeqCst)
}

fn soltar_ejecucion() {
    EJECUTANDO.store(false, Ordering::SeqCst);
}

/// Series de discos autorizados para formatear (se carga desde configuración).
fn series_autorizadas(app: &AppHandle) -> Vec<String> {
    // Por defecto: lista vacía (nadie puede formatear hasta que se configure)
    // En producción vendría de un archivo de configuración firmado.
    if let Ok(ruta) = ruta_config(app) {
        if let Ok(texto) = std::fs::read_to_string(ruta) {
            if let Ok(v) = serde_json::from_str::<Vec<String>>(&texto) {
                return v;
            }
        }
    }
    Vec::new()
}

fn ruta_config(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_config_dir()
        .map(|d| d.join("ayudante-series-autorizadas.json"))
        .ok_or_else(|| "sin carpeta de configuración".into())
}

/// Dónde se guarda el registro del ayudante.
fn ruta_registro(app: &AppHandle) -> Option<PathBuf> {
    std::env::var_os("LOCALAPPDATA").map(|h| {
        PathBuf::from(h).join("StarSeed OS/Logs/ayudante.log")
    })
}

/// Escribe una línea en el registro encadenado del ayudante.
fn anotar_registro(app: &AppHandle, evento: &str, origen: &str, detalle: &str) {
    let t = crate::ble::iso_utc(pared_ms());
    if let Some(ruta) = ruta_registro(app) {
        if let Some(d) = ruta.parent() {
            let _ = std::fs::create_dir_all(d);
        }
        let anterior = std::fs::read_to_string(&ruta)
            .map(|t| ael::ultimo_hash(&t))
            .unwrap_or_else(|_| ael::INICIO_CADENA.to_string());
        let linea = ael::linea_registro(&anterior, &t, evento, origen, detalle);
        let _ = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&ruta)
            .and_then(|mut f| writeln!(f, "{linea}"));
    }
    // También en enlaces.log
    let ruta_enlaces = std::env::var_os("LOCALAPPDATA")
        .map(|h| PathBuf::from(h).join("StarSeed OS/Logs/enlaces.log"));
    if let Some(ruta) = ruta_enlaces {
        let linea = format!("{} [ayudante] {}", crate::ble::iso_utc(pared_ms()), crate::ble::linea_limpia(evento, 120));
        let _ = crate::ble::anexar_rotando(&ruta, &[linea], 4 * 1024 * 1024);
    }
}

fn pared_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn origen_de(webview: &Webview) -> String {
    crate::prestamo_ventana::origen_de_webview(webview)
}

// ─── Windows Service: registro del ayudante ───

/// Registra el ayudante como servicio de Windows (requiere UAC).
/// Solo Windows 10 1809+ / Windows 11. El instalador NSIS (installMode perMachine) ya lo hace.
#[tauri::command]
pub async fn ayudante_registrar(app: AppHandle, webview: Webview) -> Result<EstadoAyudante, String> {
    if !crate::nativa::es_starseed_os(&app) {
        return Err("no-aplica".into());
    }
    if webview.label() != "main" {
        return Err("solo-ventana-principal".into());
    }
    if !origen_permitido(&origen_de(&webview)) {
        return Err("origen-no-permitido".into());
    }

    // Evitar registros concurrentes
    if REGISTRANDO.swap(true, Ordering::SeqCst) {
        return Err("registro-en-curso".into());
    }

    let origen = origen_de(&webview);
    anotar_registro(&app, "registro-pedido", &origen, "la persona pidió registrar el ayudante");

    let resultado = registrar_ayudante_nativo().await;

    REGISTRANDO.store(false, Ordering::SeqCst);

    match resultado {
        Ok(()) => {
            AYUDANTE_REGISTRADO.store(true, Ordering::SeqCst);
            anotar_registro(&app, "registrado", &origen, "Windows Service: ayudante registrado con UAC");
            Ok(estado(&app))
        }
        Err(e) => {
            anotar_registro(&app, "registro-fallido", &origen, &e);
            Err(e)
        }
    }
}

/// Desregistra el ayudante (quita el servicio de Windows).
#[tauri::command]
pub async fn ayudante_desregistrar(app: AppHandle, webview: Webview) -> Result<EstadoAyudante, String> {
    if !crate::nativa::es_starseed_os(&app) || webview.label() != "main" {
        return Err("no-aplica".into());
    }
    if !origen_permitido(&origen_de(&webview)) {
        return Err("origen-no-permitido".into());
    }

    let origen = origen_de(&webview);
    anotar_registro(&app, "desregistro-pedido", &origen, "la persona pidió desregistrar el ayudante");

    let resultado = desregistrar_ayudante_nativo().await;

    match resultado {
        Ok(()) => {
            AYUDANTE_REGISTRADO.store(false, Ordering::SeqCst);
            anotar_registro(&app, "desregistrado", &origen, "Windows Service: ayudante desregistrado");
            Ok(estado(&app))
        }
        Err(e) => {
            anotar_registro(&app, "desregistro-fallido", &origen, &e);
            Err(e)
        }
    }
}

/// Estado actual del ayudante (para la web).
#[derive(Serialize, Clone)]
pub struct EstadoAyudante {
    pub registrado: bool,
    pub disponible: bool,      // Windows 10 1809+ y StarSeed OS
    pub motivo: String,        // vacío si disponible
    pub version_contrato: u32,
}

#[tauri::command]
pub fn ayudante_estado(app: AppHandle) -> EstadoAyudante {
    estado(&app)
}

fn estado(app: &AppHandle) -> EstadoAyudante {
    let registrado = AYUDANTE_REGISTRADO.load(Ordering::SeqCst);
    let (disponible, motivo) = if !crate::nativa::es_starseed_os(app) {
        (false, "Solo StarSeed OS usa el ayudante privilegiado".into())
    } else if !cfg!(target_os = "windows") {
        (false, "El ayudante como servicio de Windows solo existe en Windows".into())
    } else {
        // Verificar versión de Windows (10.0.17763 = 1809)
        let version = windows_version();
        if version.major >= 10 && (version.major > 10 || version.build >= 17763) {
            (true, String::new())
        } else {
            (false, format!("Windows build {} demasiado antiguo: se necesita 17763 (1809) o posterior", version.build))
        }
    };
    EstadoAyudante {
        registrado,
        disponible,
        motivo,
        version_contrato: al::VERSION_CONTRATO,
    }
}

struct WindowsVersion { major: u32, minor: u32, build: u32 }
fn windows_version() -> WindowsVersion {
    let output = Command::new("cmd")
        .args(["/c", "ver"])
        .output()
        .ok();
    let version = output.and_then(|o| String::from_utf8(o.stdout).ok()).unwrap_or_default();
    // "Microsoft Windows [Versión 10.0.19045.3693]"
    let parts: Vec<&str> = version
        .trim()
        .split(|c: char| !c.is_ascii_digit() && c != '.')
        .filter(|s| !s.is_empty())
        .collect();
    let mut major = 0;
    let mut minor = 0;
    let mut build = 0;
    if let Some(first) = parts.first() {
        let nums: Vec<&str> = first.split('.').collect();
        major = nums.first().and_then(|s| s.parse().ok()).unwrap_or(0);
        minor = nums.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);
        build = nums.get(2).and_then(|s| s.parse().ok()).unwrap_or(0);
    }
    WindowsVersion { major, minor, build }
}

/// Registra el ayudante como servicio de Windows.
/// En producción lo hace el instalador NSIS; aquí solo verifica/complementa.
async fn registrar_ayudante_nativo() -> Result<(), String> {
    // Verificar si el servicio ya existe
    let output = Command::new("sc")
        .args(["query", al::SERVICIO_AYUDANTE])
        .output()
        .await
        .map_err(|e| format!("sc query: {e}"))?;

    if output.status.success() {
        // Servicio ya existe, verificar que está corriendo
        let stdout = String::from_utf8_lossy(&output.stdout);
        if stdout.contains("RUNNING") {
            return Ok(());
        }
        // Intentar iniciarlo
        let start = Command::new("sc")
            .args(["start", al::SERVICIO_AYUDANTE])
            .output()
            .await
            .map_err(|e| format!("sc start: {e}"))?;
        if !start.status.success() {
            let stderr = String::from_utf8_lossy(&start.stderr);
            return Err(format!("servicio existe pero no arranca: {stderr}"));
        }
        return Ok(());
    }

    // El servicio no existe: en producción el instalador NSIS lo crea.
    // Aquí solo reportamos que falta (el instalador debería haberlo puesto).
    Err("el servicio StarSeedAyudante no está instalado; ejecute el instalador NSIS con UAC".into())
}

/// Desregistra el ayudante (detiene y borra el servicio).
async fn desregistrar_ayudante_nativo() -> Result<(), String> {
    // Detener el servicio
    let _ = Command::new("sc")
        .args(["stop", al::SERVICIO_AYUDANTE])
        .output()
        .await;

    // Borrar el servicio
    let output = Command::new("sc")
        .args(["delete", al::SERVICIO_AYUDANTE])
        .output()
        .await
        .map_err(|e| format!("sc delete: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("falló el desregistro del servicio: {stderr}"));
    }
    Ok(())
}

// ─── Ejecución de órdenes tipadas ───

#[derive(serde::Deserialize)]
pub struct EjecutarParams {
    orden: al::OrdenAyudante,
    args: HashMap<String, String>,
    tiempo_max_ms: Option<u64>,
}

#[derive(Serialize)]
pub struct EjecutarResultado {
    exito: bool,
    salida: Option<String>,
    error: Option<String>,
    codigo: Option<i32>,
}

/// Ejecuta una orden tipada del ayudante con privilegios.
#[tauri::command]
pub async fn ayudante_ejecutar(
    app: AppHandle,
    webview: Webview,
    params: EjecutarParams,
) -> Result<EjecutarResultado, String> {
    if !crate::nativa::es_starseed_os(&app) || webview.label() != "main" {
        return Err("no-aplica".into());
    }
    if !origen_permitido(&origen_de(&webview)) {
        return Err("origen-no-permitido".into());
    }

    if !tomar_ejecucion() {
        return Err("ocupado".into());
    }

    let origen = origen_de(&webview);
    let series = series_autorizadas(&app);
    let limites = al::LimitesAyudante {
        tiempo_max_ms: params.tiempo_max_ms.unwrap_or(60_000),
        salida_max_bytes: 500_000,
    };

    let decision = al::decidir_orden(&al::ParametrosOrden {
        orden: params.orden,
        args: params.args.clone(),
        tiempo_max_ms: params.tiempo_max_ms,
    }, AYUDANTE_REGISTRADO.load(Ordering::SeqCst), &series, limites);

    if !decision.permite {
        soltar_ejecucion();
        anotar_registro(&app, "rechazada", &origen, &format!("[{:?}] {}", params.orden, decision.motivo.unwrap_or_default()));
        return Err(decision.motivo.unwrap_or_else(|| "orden no permitida".into()));
    }

    // Si requiere confirmación, la página debe haberla pedido ANTES (orden firmada).
    // Aquí solo avisamos en el registro.
    if decision.requiere_confirmacion {
        anotar_registro(&app, "a-confirmar", &origen, &format!("[{:?}] {}", params.orden, serde_json::to_string(&params.args).unwrap_or_default()));
    }

    anotar_registro(&app, "ejecutada", &origen, &format!("[{:?}] {}", params.orden, serde_json::to_string(&params.args).unwrap_or_default()));

    let resultado = match params.orden {
        al::OrdenAyudante::AlmacenesEstado => ejecutar_almacenes_estado().await,
        al::OrdenAyudante::AlmacenSalud => ejecutar_almacen_salud(&params.args).await,
        al::OrdenAyudante::AlmacenFormatear => ejecutar_almacen_formatear(&params.args).await,
        al::OrdenAyudante::AlmacenMontar => ejecutar_almacen_montar(&params.args).await,
        al::OrdenAyudante::AlmacenDesmontar => ejecutar_almacen_desmontar(&params.args).await,
        al::OrdenAyudante::AlmacenVerificar => ejecutar_almacen_verificar(&params.args).await,
        al::OrdenAyudante::ServiciosEstado => ejecutar_servicios_estado().await,
        al::OrdenAyudante::ServicioIniciar => ejecutar_servicio_iniciar(&params.args).await,
        al::OrdenAyudante::ServicioParar => ejecutar_servicio_parar(&params.args).await,
        al::OrdenAyudante::ServicioReiniciar => ejecutar_servicio_reiniciar(&params.args).await,
        al::OrdenAyudante::ActualizarApp => ejecutar_actualizar_app(&app).await,
        al::OrdenAyudante::LogsLeer => ejecutar_logs_leer(&params.args).await,
        al::OrdenAyudante::ReiniciarApp => ejecutar_reiniciar_app(&app).await,
        al::OrdenAyudante::TerminalAdministrador => ejecutar_terminal_admin(&params.args, limites).await,
    };

    let codigo_str = resultado.codigo.map(|c| c.to_string()).unwrap_or_else(|| "señal".into());
    anotar_registro(&app, "terminada", &origen, &format!("[{:?}] código {}", params.orden, codigo_str));

    soltar_ejecucion();
    Ok(resultado)
}

// ─── Implementación de cada orden ───

async fn ejecutar_almacenes_estado() -> EjecutarResultado {
    // Usa PowerShell Get-Volume y Get-Disk
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

    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", ps_script])
        .output()
        .await;

    match output {
        Ok(o) => EjecutarResultado {
            exito: o.status.success(),
            salida: Some(String::from_utf8_lossy(&o.stdout).to_string()),
            error: if o.stderr.is_empty() { None } else { Some(String::from_utf8_lossy(&o.stderr).to_string()) },
            codigo: o.status.code(),
        },
        Err(e) => EjecutarResultado { exito: false, salida: None, error: Some(e.to_string()), codigo: None },
    }
}

async fn ejecutar_almacen_salud(args: &HashMap<String, String>) -> EjecutarResultado {
    let serie = match args.get("serie") { Some(s) => s, None => return error("falta serie") };
    // Get-PhysicalDisk para salud SMART
    let ps_script = format!(
        r#"Get-PhysicalDisk | Where-Object {{ $_.SerialNumber -eq '{}' }} | Select-Object SerialNumber, MediaType, HealthStatus, OperationalStatus, Size, Temperature | ConvertTo-Json"#,
        serie
    );
    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps_script])
        .output()
        .await;

    match output {
        Ok(o) => EjecutarResultado {
            exito: o.status.success(),
            salida: Some(String::from_utf8_lossy(&o.stdout).to_string()),
            error: if o.stderr.is_empty() { None } else { Some(String::from_utf8_lossy(&o.stderr).to_string()) },
            codigo: o.status.code(),
        },
        Err(e) => EjecutarResultado { exito: false, salida: None, error: Some(e.to_string()), codigo: None },
    }
}

async fn ejecutar_almacen_formatear(args: &HashMap<String, String>) -> EjecutarResultado {
    let (serie, formato, nombre) = match al::validar_formatear(args) { Ok(v) => v, Err(e) => return error(&e) };
    // Encontrar la letra de unidad por serie y formatear
    let ps_script = format!(
        r#"
        $disk = Get-PhysicalDisk | Where-Object {{ $_.SerialNumber -eq '{}' }} | Select-Object -First 1
        if (-not $disk) {{ throw "No se encontró disco con serie {}" }}
        $partition = Get-Partition -DiskNumber $disk.Number | Where-Object {{ $_.DriveLetter -ne '' }} | Select-Object -First 1
        if (-not $partition) {{ throw "El disco no tiene partición con letra de unidad" }}
        Format-Volume -DriveLetter $partition.DriveLetter -FileSystem {} -NewFileSystemLabel {} -Force -Confirm:$false
        "#,
        serie, formato, nombre
    );
    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps_script])
        .output()
        .await;

    match output {
        Ok(o) => EjecutarResultado {
            exito: o.status.success(),
            salida: Some(String::from_utf8_lossy(&o.stdout).to_string()),
            error: if o.stderr.is_empty() { None } else { Some(String::from_utf8_lossy(&o.stderr).to_string()) },
            codigo: o.status.code(),
        },
        Err(e) => EjecutarResultado { exito: false, salida: None, error: Some(e.to_string()), codigo: None },
    }
}

async fn ejecutar_almacen_montar(args: &HashMap<String, String>) -> EjecutarResultado {
    let serie = match al::validar_montar(args) { Ok(s) => s, Err(e) => return error(&e) };
    let ps_script = format!(
        r#"
        $disk = Get-PhysicalDisk | Where-Object {{ $_.SerialNumber -eq '{}' }} | Select-Object -First 1
        if (-not $disk) {{ throw "No se encontró disco con serie {}" }}
        $partition = Get-Partition -DiskNumber $disk.Number | Where-Object {{ $_.DriveLetter -eq '' -and $_.Type -eq 'Basic' }} | Select-Object -First 1
        if (-not $partition) {{ throw "No hay partición sin letra para montar" }}
        $letter = 68..90 | ForEach-Object {{ [char]$_ }} | Where-Object {{ -not (Get-Volume -DriveLetter $_ -ErrorAction SilentlyContinue) }} | Select-Object -First 1
        if (-not $letter) {{ throw "No hay letras de unidad disponibles" }}
        Set-Partition -DiskNumber $disk.Number -PartitionNumber $partition.PartitionNumber -NewDriveLetter $letter
        "#,
        serie
    );
    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps_script])
        .output()
        .await;

    match output {
        Ok(o) => EjecutarResultado {
            exito: o.status.success(),
            salida: Some(String::from_utf8_lossy(&o.stdout).to_string()),
            error: if o.stderr.is_empty() { None } else { Some(String::from_utf8_lossy(&o.stderr).to_string()) },
            codigo: o.status.code(),
        },
        Err(e) => EjecutarResultado { exito: false, salida: None, error: Some(e.to_string()), codigo: None },
    }
}

async fn ejecutar_almacen_desmontar(args: &HashMap<String, String>) -> EjecutarResultado {
    let serie = match al::validar_montar(args) { Ok(s) => s, Err(e) => return error(&e) };
    let ps_script = format!(
        r#"
        $disk = Get-PhysicalDisk | Where-Object {{ $_.SerialNumber -eq '{}' }} | Select-Object -First 1
        if (-not $disk) {{ throw "No se encontró disco con serie {}" }}
        $partition = Get-Partition -DiskNumber $disk.Number | Where-Object {{ $_.DriveLetter -ne '' }} | Select-Object -First 1
        if (-not $partition) {{ throw "No hay partición montada para desmontar" }}
        Set-Partition -DiskNumber $disk.Number -PartitionNumber $partition.PartitionNumber -RemoveDriveLetter
        "#,
        serie
    );
    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps_script])
        .output()
        .await;

    match output {
        Ok(o) => EjecutarResultado {
            exito: o.status.success(),
            salida: Some(String::from_utf8_lossy(&o.stdout).to_string()),
            error: if o.stderr.is_empty() { None } else { Some(String::from_utf8_lossy(&o.stderr).to_string()) },
            codigo: o.status.code(),
        },
        Err(e) => EjecutarResultado { exito: false, salida: None, error: Some(e.to_string()), codigo: None },
    }
}

async fn ejecutar_almacen_verificar(args: &HashMap<String, String>) -> EjecutarResultado {
    let serie = match args.get("serie") { Some(s) => s, None => return error("falta serie") };
    let ps_script = format!(
        r#"
        $disk = Get-PhysicalDisk | Where-Object {{ $_.SerialNumber -eq '{}' }} | Select-Object -First 1
        if (-not $disk) {{ throw "No se encontró disco con serie {}" }}
        $partition = Get-Partition -DiskNumber $disk.Number | Where-Object {{ $_.DriveLetter -ne '' }} | Select-Object -First 1
        if (-not $partition) {{ throw "No hay partición montada para verificar" }}
        Repair-Volume -DriveLetter $partition.DriveLetter -Scan
        "#,
        serie
    );
    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps_script])
        .output()
        .await;

    match output {
        Ok(o) => EjecutarResultado {
            exito: o.status.success(),
            salida: Some(String::from_utf8_lossy(&o.stdout).to_string()),
            error: if o.stderr.is_empty() { None } else { Some(String::from_utf8_lossy(&o.stderr).to_string()) },
            codigo: o.status.code(),
        },
        Err(e) => EjecutarResultado { exito: false, salida: None, error: Some(e.to_string()), codigo: None },
    }
}

async fn ejecutar_servicios_estado() -> EjecutarResultado {
    let output = Command::new("sc")
        .args(["query", "type=", "service", "state=", "all", "StarSeed*"])
        .output()
        .await;

    match output {
        Ok(o) => EjecutarResultado {
            exito: o.status.success(),
            salida: Some(String::from_utf8_lossy(&o.stdout).to_string()),
            error: if o.stderr.is_empty() { None } else { Some(String::from_utf8_lossy(&o.stderr).to_string()) },
            codigo: o.status.code(),
        },
        Err(e) => EjecutarResultado { exito: false, salida: None, error: Some(e.to_string()), codigo: None },
    }
}

async fn ejecutar_servicio_iniciar(args: &HashMap<String, String>) -> EjecutarResultado {
    let nombre = match args.get("servicio") { Some(s) => s, None => return error("falta servicio") };
    if !nombre.starts_with("StarSeed") && !nombre.starts_with("starseed") {
        return error("solo servicios StarSeed*");
    }
    let output = Command::new("sc")
        .args(["start", nombre])
        .output()
        .await;

    match output {
        Ok(o) => EjecutarResultado {
            exito: o.status.success(),
            salida: Some(String::from_utf8_lossy(&o.stdout).to_string()),
            error: if o.stderr.is_empty() { None } else { Some(String::from_utf8_lossy(&o.stderr).to_string()) },
            codigo: o.status.code(),
        },
        Err(e) => EjecutarResultado { exito: false, salida: None, error: Some(e.to_string()), codigo: None },
    }
}

async fn ejecutar_servicio_parar(args: &HashMap<String, String>) -> EjecutarResultado {
    let nombre = match args.get("servicio") { Some(s) => s, None => return error("falta servicio") };
    if !nombre.starts_with("StarSeed") && !nombre.starts_with("starseed") {
        return error("solo servicios StarSeed*");
    }
    let output = Command::new("sc")
        .args(["stop", nombre])
        .output()
        .await;

    match output {
        Ok(o) => EjecutarResultado {
            exito: o.status.success(),
            salida: Some(String::from_utf8_lossy(&o.stdout).to_string()),
            error: if o.stderr.is_empty() { None } else { Some(String::from_utf8_lossy(&o.stderr).to_string()) },
            codigo: o.status.code(),
        },
        Err(e) => EjecutarResultado { exito: false, salida: None, error: Some(e.to_string()), codigo: None },
    }
}

async fn ejecutar_servicio_reiniciar(args: &HashMap<String, String>) -> EjecutarResultado {
    let r = ejecutar_servicio_parar(args).await;
    if !r.exito { return r; }
    std::thread::sleep(std::time::Duration::from_millis(500));
    ejecutar_servicio_iniciar(args).await
}

async fn ejecutar_actualizar_app(_app: &AppHandle) -> EjecutarResultado {
    // El actualizador de la app (tauri-plugin-updater) ya maneja la descarga e instalación.
    // Aquí solo dispararíamos el reinicio post-instalación si fuera necesario.
    EjecutarResultado {
        exito: true,
        salida: Some("actualización gestionada por el updater de la app; use reiniciar_app si hay una instalación pendiente".into()),
        error: None,
        codigo: Some(0),
    }
}

async fn ejecutar_logs_leer(args: &HashMap<String, String>) -> EjecutarResultado {
    let (filtro, lineas) = match al::validar_logs(args) { Ok(v) => v, Err(e) => return error(&e) };
    let mut cmd = Command::new("powershell");
    let ps_script = if let Some(f) = filtro {
        format!(r#"Get-WinEvent -FilterHashtable @{{LogName='Application'; ProviderName='StarSeed*'}} -MaxEvents {} | Where-Object {{ $_ -match '{}' }} | Format-Table -AutoSize"#, lineas, f)
    } else {
        format!(r#"Get-WinEvent -FilterHashtable @{{LogName='Application'; ProviderName='StarSeed*'}} -MaxEvents {} | Format-Table -AutoSize"#, lineas)
    };
    cmd.args(["-NoProfile", "-Command", &ps_script]);
    let output = cmd.output().await;

    match output {
        Ok(o) => {
            let stdout = String::from_utf8_lossy(&o.stdout).to_string();
            let lineas_vec: Vec<&str> = stdout.lines().rev().take(lineas).collect();
            let salida = lineas_vec.into_iter().rev().collect::<Vec<_>>().join("\n");
            EjecutarResultado {
                exito: o.status.success(),
                salida: Some(salida),
                error: if o.stderr.is_empty() { None } else { Some(String::from_utf8_lossy(&o.stderr).to_string()) },
                codigo: o.status.code(),
            }
        }
        Err(e) => EjecutarResultado { exito: false, salida: None, error: Some(e.to_string()), codigo: None },
    }
}

async fn ejecutar_reiniciar_app(app: &AppHandle) -> EjecutarResultado {
    // Reiniciar la app desde el ayudante (sin contraseña).
    let bundle_id = "app.starseed.os";
    let output = Command::new("cmd")
        .args(["/c", "start", "", "shell:AppsFolder\\StarSeedSystem.StarSeedOS_app.starseed.os"])
        .output()
        .await;

    match output {
        Ok(o) => EjecutarResultado {
            exito: o.status.success(),
            salida: Some(String::from_utf8_lossy(&o.stdout).to_string()),
            error: if o.stderr.is_empty() { None } else { Some(String::from_utf8_lossy(&o.stderr).to_string()) },
            codigo: o.status.code(),
        },
        Err(e) => EjecutarResultado { exito: false, salida: None, error: Some(e.to_string()), codigo: None },
    }
}

async fn ejecutar_terminal_admin(args: &HashMap<String, String>, limites: al::LimitesAyudante) -> EjecutarResultado {
    let orden = match al::validar_terminal_admin(args) { Ok(o) => o, Err(e) => return error(&e) };
    let mut cmd = Command::new("powershell");
    cmd.args(["-NoProfile", "-Command", &orden]);
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = match cmd.spawn() { Ok(c) => c, Err(e) => return error(&format!("spawn: {e}")) };
    let stdout = child.stdout.take().expect("stdout");
    let stderr = child.stderr.take().expect("stderr");

    let mut stdout_buf = String::new();
    let mut stderr_buf = String::new();

    // Leer con límite
    use std::io::{BufRead, BufReader};
    let mut r_stdout = BufReader::new(stdout);
    let mut r_stderr = BufReader::new(stderr);
    let mut total = 0usize;

    let timeout = std::time::Duration::from_millis(limites.tiempo_max_ms);
    let inicio = std::time::Instant::now();
    let mut code = None;

    loop {
        if inicio.elapsed() >= timeout {
            let _ = child.kill();
            break;
        }
        match child.try_wait() {
            Ok(Some(status)) => { code = status.code(); break; }
            Ok(None) => { std::thread::sleep(std::time::Duration::from_millis(50)); }
            Err(e) => return error(&format!("wait: {e}")),
        }
    }

    // Leer salida restante
    let _ = r_stdout.read_to_string(&mut stdout_buf);
    let _ = r_stderr.read_to_string(&mut stderr_buf);
    if stdout_buf.len() + stderr_buf.len() > limites.salida_max_bytes {
        stdout_buf.truncate(limites.salida_max_bytes / 2);
        stderr_buf.truncate(limites.salida_max_bytes / 2);
    }

    EjecutarResultado {
        exito: code == Some(0),
        salida: Some(stdout_buf),
        error: if stderr_buf.is_empty() { None } else { Some(stderr_buf) },
        codigo: code,
    }
}

fn error(msg: &str) -> EjecutarResultado {
    EjecutarResultado { exito: false, salida: None, error: Some(msg.into()), codigo: None }
}

// ─── Helpers compartidos ───

fn origen_permitido(origen: &str) -> bool {
    crate::prestamo_ventana_logica::origen_puede_prestar(origen)
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn estado_ayudante_serializa() {
        let e = EstadoAyudante { registrado: true, disponible: true, motivo: String::new(), version_contrato: 1 };
        let json = serde_json::to_string(&e).unwrap();
        assert!(json.contains("\"registrado\":true"));
        assert!(json.contains("\"version_contrato\":1"));
    }

    #[test]
    fn ejecutar_params_deserializa() {
        let json = r#"{"orden":"almacenes_estado","args":{},"tiempo_max_ms":30000}"#;
        let p: EjecutarParams = serde_json::from_str(json).unwrap();
        assert_eq!(p.orden, al::OrdenAyudante::AlmacenesEstado);
    }
}