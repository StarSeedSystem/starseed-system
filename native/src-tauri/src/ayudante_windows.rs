//! (TRM1125G) Ayudante privilegiado Windows · registro como servicio Windows y comandos Tauri para órdenes tipadas.
//! Contrato: architecture/terminal-entre-neuronas.md, architecture/control-remoto-entre-neuronas.md,
//! architecture/permisos-y-control-del-dispositivo.md §4.
//!
//! El ayudante se instala como servicio Windows (NSIS installer con UAC).
//! Ofrece órdenes tipadas (almacenes, servicios propios de StarSeed, actualizar, logs, reiniciar)
//! con guardas en la lógica pura y registro de solo-añadir.

use crate::ayudante_windows_logica as al;
use crate::acceso_equipo_logica as ael;
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, Webview};

// ─── Estado global ───

static AYUDANTE_INSTALADO: AtomicBool = AtomicBool::new(false);
static INSTALANDO: AtomicBool = AtomicBool::new(false);
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
        .map_err(|e| format!("sin carpeta de configuración: {e}"))
}

/// Dónde se guarda el registro del ayudante.
fn ruta_registro(app: &AppHandle) -> Option<PathBuf> {
    std::env::var_os("LOCALAPPDATA").or_else(|| std::env::var_os("APPDATA")).map(|h| {
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
    let ruta_enlaces = std::env::var_os("LOCALAPPDATA").or_else(|| std::env::var_os("APPDATA"))
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

// ─── Windows Service: instalación/desinstalación ───

/// Instala el ayudante como servicio Windows ejecutando el script PowerShell con UAC.
/// Solo Windows. En otros sistemas devuelve error descriptivo.
#[tauri::command]
pub async fn ayudante_instalar(app: AppHandle, webview: Webview) -> Result<EstadoAyudante, String> {
    if !crate::nativa::es_starseed_os(&app) {
        return Err("no-aplica".into());
    }
    if webview.label() != "main" {
        return Err("solo-ventana-principal".into());
    }
    if !origen_permitido(&origen_de(&webview)) {
        return Err("origen-no-permitido".into());
    }

    // Evitar instalaciones concurrentes
    if INSTALANDO.swap(true, Ordering::SeqCst) {
        return Err("instalacion-en-curso".into());
    }

    let origen = origen_de(&webview);
    anotar_registro(&app, "instalacion-pedida", &origen, "la persona pidió instalar el ayudante como servicio");

    let resultado = instalar_servicio_nativo(&app).await;

    INSTALANDO.store(false, Ordering::SeqCst);

    match resultado {
        Ok(()) => {
            AYUDANTE_INSTALADO.store(true, Ordering::SeqCst);
            anotar_registro(&app, "instalado", &origen, "Servicio Windows: ayudante instalado con autorización UAC");
            Ok(estado(&app))
        }
        Err(e) => {
            anotar_registro(&app, "instalacion-fallida", &origen, &e);
            Err(e)
        }
    }
}

/// Desinstala el ayudante (quita el servicio Windows).
#[tauri::command]
pub async fn ayudante_desinstalar(app: AppHandle, webview: Webview) -> Result<EstadoAyudante, String> {
    if !crate::nativa::es_starseed_os(&app) || webview.label() != "main" {
        return Err("no-aplica".into());
    }
    if !origen_permitido(&origen_de(&webview)) {
        return Err("origen-no-permitido".into());
    }

    let origen = origen_de(&webview);
    anotar_registro(&app, "desinstalacion-pedida", &origen, "la persona pidió desinstalar el ayudante");

    let resultado = desinstalar_servicio_nativo().await;

    match resultado {
        Ok(()) => {
            AYUDANTE_INSTALADO.store(false, Ordering::SeqCst);
            anotar_registro(&app, "desinstalado", &origen, "Servicio Windows: ayudante desinstalado");
            Ok(estado(&app))
        }
        Err(e) => {
            anotar_registro(&app, "desinstalacion-fallida", &origen, &e);
            Err(e)
        }
    }
}

/// Estado actual del ayudante (para la web).
#[derive(Serialize, Clone)]
pub struct EstadoAyudante {
    pub instalado: bool,
    pub disponible: bool,      // Windows y StarSeed OS
    pub motivo: String,        // vacío si disponible
    pub version_contrato: u32,
}

#[tauri::command]
pub fn ayudante_estado(app: AppHandle) -> EstadoAyudante {
    estado(&app)
}

fn estado(app: &AppHandle) -> EstadoAyudante {
    let instalado = AYUDANTE_INSTALADO.load(Ordering::SeqCst);
    let (disponible, motivo) = if !crate::nativa::es_starseed_os(app) {
        (false, "Solo StarSeed OS usa el ayudante privilegiado".into())
    } else if !cfg!(target_os = "windows") {
        (false, "El ayudante como servicio Windows solo existe en Windows".into())
    } else {
        // Verificar si el servicio existe realmente
        match verificar_servicio_existe() {
            Ok(existe) => {
                if existe != instalado {
                    // Sincronizar estado si hay discrepancia
                    AYUDANTE_INSTALADO.store(existe, Ordering::SeqCst);
                }
                (true, String::new())
            }
            Err(e) => (false, format!("error verificando servicio: {e}")),
        }
    };
    EstadoAyudante {
        instalado: AYUDANTE_INSTALADO.load(Ordering::SeqCst),
        disponible,
        motivo,
        version_contrato: al::VERSION_CONTRATO,
    }
}

/// Verifica si el servicio Windows existe.
fn verificar_servicio_existe() -> Result<bool, String> {
    let output = Command::new("sc.exe")
        .args(["query", al::SERVICIO_AYUDANTE])
        .output()
        .map_err(|e| format!("sc.exe query: {e}"))?;

    // sc query devuelve 0 si existe (running o stopped), 1060 si no existe
    Ok(output.status.code() == Some(0))
}

/// Instala el servicio Windows vía PowerShell con UAC.
/// El script se genera desde la lógica pura.
async fn instalar_servicio_nativo(app: &AppHandle) -> Result<(), String> {
    let script = al::script_instalacion_servicio();
    // Reemplazar placeholder con la ruta real del ejecutable del ayudante
    // El ayudante.exe debe estar junto a la app principal o en una ubicación conocida
    let ruta_ejecutable = obtener_ruta_ayudante(app)?;
    let script = script.replace("{EJECUTABLE_PATH}", &ruta_ejecutable);

    // Ejecutar PowerShell con UAC (RunAs)
    // Usamos Start-Process con -Verb RunAs para elevar
    let ps_command = format!(
        r#"Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command {}" -Verb RunAs -Wait"#,
        escape_ps_script(&script)
    );

    let output = Command::new("powershell")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &ps_command])
        .output()
        .map_err(|e| format!("powershell UAC: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("falló la instalación del servicio (¿UAC denegado?): {stderr}"));
    }

    // Verificar que el servicio quedó instalado y corriendo
    std::thread::sleep(std::time::Duration::from_millis(1000));
    if !verificar_servicio_existe().unwrap_or(false) {
        return Err("el servicio no quedó instalado tras la elevación UAC".into());
    }

    Ok(())
}

/// Desinstala el servicio Windows.
async fn desinstalar_servicio_nativo() -> Result<(), String> {
    let script = al::script_desinstalacion_servicio();
    let ps_command = format!(
        r#"Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command {}" -Verb RunAs -Wait"#,
        escape_ps_script(&script)
    );

    let output = Command::new("powershell")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &ps_command])
        .output()
        .map_err(|e| format!("powershell UAC: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("falló la desinstalación del servicio: {stderr}"));
    }

    Ok(())
}

/// Escapa un script PowerShell para pasar como argumento.
fn escape_ps_script(script: &str) -> String {
    // Codificar en base64 para evitar problemas de comillas y caracteres especiales
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    let encoded = STANDARD.encode(script.as_bytes());
    format!("[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('{}'))", encoded)
}

/// Obtiene la ruta donde está el ejecutable del ayudante (ayudante.exe).
/// En producción viene instalado por NSIS junto a la app principal.
fn obtener_ruta_ayudante(app: &AppHandle) -> Result<String, String> {
    // Intentar varias ubicaciones comunes
    let exe_dir = app.path().resource_dir()
        .map_err(|e| format!("resource_dir: {e}"))?
        .parent()
        .ok_or("sin directorio padre")?
        .to_path_buf();

    // El ayudante.exe debería estar en el mismo directorio que la app principal
    let candidatos = [
        exe_dir.join("ayudante.exe"),
        exe_dir.join("resources/ayudante.exe"),
        // En desarrollo puede estar en target/
        std::env::current_exe().ok()
            .and_then(|p| p.parent().map(|d| d.join("ayudante.exe")))
            .unwrap_or_default(),
    ];

    for c in &candidatos {
        if c.exists() {
            return Ok(c.to_string_lossy().to_string());
        }
    }

    // Fallback: asumir que está junto al ejecutable principal
    Ok(exe_dir.join("ayudante.exe").to_string_lossy().to_string())
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
    }, AYUDANTE_INSTALADO.load(Ordering::SeqCst), &series, limites);

    if !decision.permite {
        soltar_ejecucion();
        anotar_registro(&app, "rechazada", &origen, &format!("[{:?}] {}", params.orden, decision.motivo.clone().unwrap_or_default()));
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

// ─── Implementación de cada orden (PowerShell) ───

async fn ejecutar_almacenes_estado() -> EjecutarResultado {
    // Get-Disk + Get-Volume para listar discos y volúmenes
    let ps = r#"
        $disks = Get-Disk | Select-Object Number, FriendlyName, SerialNumber, Size, HealthStatus, OperationalStatus, PartitionStyle
        $volumes = Get-Volume | Where-Object { $_.DriveLetter -ne '' } | Select-Object DriveLetter, FileSystemLabel, FileSystem, Size, SizeRemaining, DriveType
        @{ Disks = $disks; Volumes = $volumes } | ConvertTo-Json -Depth 4
    "#;
    ejecutar_powershell(ps).await
}

async fn ejecutar_almacen_salud(args: &HashMap<String, String>) -> EjecutarResultado {
    let serie = match args.get("serie") { Some(s) => s, None => return error("falta serie") };
    // Buscar el disco por número de serie y obtener info SMART vía Get-Disk y Get-PhysicalDisk
    let ps = format!(r#"
        $disk = Get-Disk | Where-Object {{ $_.SerialNumber -eq '{}' }} | Select-Object -First 1
        if (-not $disk) {{ @{{ error = 'Disco no encontrado' }} | ConvertTo-Json; exit }}
        $physical = Get-PhysicalDisk | Where-Object {{ $_.SerialNumber -eq '{}' }} | Select-Object -First 1
        $smart = if ($physical) {{ $physical | Get-StorageReliabilityCounter | Select-Object Temperature, ReadErrorsTotal, WriteErrorsTotal, Wear }} else {{ @{{}} }}
        @{{ Disk = $disk; Smart = $smart }} | ConvertTo-Json -Depth 4
    "#, serie, serie);
    ejecutar_powershell(&ps).await
}

async fn ejecutar_almacen_formatear(args: &HashMap<String, String>) -> EjecutarResultado {
    let (serie, formato, nombre) = match al::validar_formatear(args) { Ok(v) => v, Err(e) => return error(&e) };
    // Format-Volume en la partición del disco con esa serie
    // Primero buscar el número de disco, luego la partición, luego formatear
    let ps = format!(r#"
        $disk = Get-Disk | Where-Object {{ $_.SerialNumber -eq '{}' }} | Select-Object -First 1
        if (-not $disk) {{ @{{ error = 'Disco no encontrado' }} | ConvertTo-Json; exit }}
        $partition = Get-Partition -DiskNumber $disk.Number | Where-Object {{ $_.DriveLetter -eq '' -or $_.DriveLetter }} | Select-Object -First 1
        if (-not $partition) {{ @{{ error = 'No hay partición para formatear' }} | ConvertTo-Json; exit }}
        Format-Volume -Partition $partition -FileSystem {} -NewFileSystemLabel '{}' -Confirm:$false -Force -ErrorAction Stop
        @{{ exito = $true; mensaje = 'Formateado correctamente' }} | ConvertTo-Json
    "#, serie, formato, nombre);
    ejecutar_powershell(&ps).await
}

async fn ejecutar_almacen_montar(args: &HashMap<String, String>) -> EjecutarResultado {
    let serie = match al::validar_montar(args) { Ok(s) => s, Err(e) => return error(&e) };
    // Asignar letra de unidad a la primera partición sin letra
    let ps = format!(r#"
        $disk = Get-Disk | Where-Object {{ $_.SerialNumber -eq '{}' }} | Select-Object -First 1
        if (-not $disk) {{ @{{ error = 'Disco no encontrado' }} | ConvertTo-Json; exit }}
        $partition = Get-Partition -DiskNumber $disk.Number | Where-Object {{ $_.DriveLetter -eq '' -and $_.Type -ne 'System' -and $_.Type -ne 'Reserved' }} | Select-Object -First 1
        if (-not $partition) {{ @{{ error = 'No hay partición disponible para montar' }} | ConvertTo-Json; exit }}
        $letra = 68..90 | ForEach-Object {{ [char]$_ }} | Where-Object {{ -not (Get-Volume -DriveLetter $_ -ErrorAction SilentlyContinue) }} | Select-Object -First 1
        if (-not $letra) {{ @{{ error = 'No hay letras de unidad disponibles' }} | ConvertTo-Json; exit }}
        Set-Partition -DiskNumber $disk.Number -PartitionNumber $partition.PartitionNumber -NewDriveLetter $letra -ErrorAction Stop
        @{{ exito = $true; letra = "$letra:" }} | ConvertTo-Json
    "#, serie);
    ejecutar_powershell(&ps).await
}

async fn ejecutar_almacen_desmontar(args: &HashMap<String, String>) -> EjecutarResultado {
    let serie = match al::validar_montar(args) { Ok(s) => s, Err(e) => return error(&e) };
    // Quitar letra de unidad
    let ps = format!(r#"
        $disk = Get-Disk | Where-Object {{ $_.SerialNumber -eq '{}' }} | Select-Object -First 1
        if (-not $disk) {{ @{{ error = 'Disco no encontrado' }} | ConvertTo-Json; exit }}
        $partition = Get-Partition -DiskNumber $disk.Number | Where-Object {{ $_.DriveLetter -ne '' }} | Select-Object -First 1
        if (-not $partition) {{ @{{ error = 'No hay partición montada para desmontar' }} | ConvertTo-Json; exit }}
        Remove-PartitionAccessPath -DiskNumber $disk.Number -PartitionNumber $partition.PartitionNumber -AccessPath "$($partition.DriveLetter):\" -ErrorAction Stop
        @{{ exito = $true; mensaje = 'Desmontado correctamente' }} | ConvertTo-Json
    "#, serie);
    ejecutar_powershell(&ps).await
}

async fn ejecutar_almacen_verificar(args: &HashMap<String, String>) -> EjecutarResultado {
    let serie = match args.get("serie") { Some(s) => s, None => return error("falta serie") };
    // Repair-Volume (chkdsk equivalente) en la partición
    let ps = format!(r#"
        $disk = Get-Disk | Where-Object {{ $_.SerialNumber -eq '{}' }} | Select-Object -First 1
        if (-not $disk) {{ @{{ error = 'Disco no encontrado' }} | ConvertTo-Json; exit }}
        $partition = Get-Partition -DiskNumber $disk.Number | Where-Object {{ $_.DriveLetter -ne '' }} | Select-Object -First 1
        if (-not $partition) {{ @{{ error = 'No hay partición montada para verificar' }} | ConvertTo-Json; exit }}
        $resultado = Repair-Volume -DriveLetter $partition.DriveLetter -ErrorAction SilentlyContinue
        @{{ exito = $resultado.NoErrorsFound; detalles = $resultado | ConvertTo-Json }} | ConvertTo-Json
    "#, serie);
    ejecutar_powershell(&ps).await
}

async fn ejecutar_servicios_estado() -> EjecutarResultado {
    let ps = r#"
        Get-Service -Name "StarSeed*" | Select-Object Name, DisplayName, Status, StartType | ConvertTo-Json -Depth 3
    "#;
    ejecutar_powershell(ps).await
}

async fn ejecutar_servicio_iniciar(args: &HashMap<String, String>) -> EjecutarResultado {
    let nombre = match args.get("servicio") { Some(s) => s, None => return error("falta servicio") };
    if !nombre.starts_with("StarSeed") { return error("solo servicios StarSeed*"); }
    let ps = format!(r#"Start-Service -Name '{}' -ErrorAction Stop; @{{ exito = $true }} | ConvertTo-Json"#, nombre);
    ejecutar_powershell(&ps).await
}

async fn ejecutar_servicio_parar(args: &HashMap<String, String>) -> EjecutarResultado {
    let nombre = match args.get("servicio") { Some(s) => s, None => return error("falta servicio") };
    if !nombre.starts_with("StarSeed") { return error("solo servicios StarSeed*"); }
    let ps = format!(r#"Stop-Service -Name '{}' -Force -ErrorAction Stop; @{{ exito = $true }} | ConvertTo-Json"#, nombre);
    ejecutar_powershell(&ps).await
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
    let mut ps = format!("Get-WinEvent -MaxEvents {} ", lineas);
    if let Some(f) = filtro {
        ps.push_str(&format!("-FilterXPath \"{}\" ", f.replace('"', "'")));
    }
    ps.push_str("| Select-Object TimeCreated, Id, LevelDisplayName, Message | ConvertTo-Json -Depth 3");
    ejecutar_powershell(&ps).await
}

async fn ejecutar_reiniciar_app(app: &AppHandle) -> EjecutarResultado {
    // Reiniciar la app desde el ayudante (sin contraseña).
    // Usamos Restart-Service en el servicio de la app si existe, o Start-Process.
    let bundle_id = "app.starseed.os";
    // Intentar encontrar el servicio de la app
    let ps = format!(r#"
        $proc = Get-Process -Name "starseed*" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($proc) {{ Stop-Process -Id $proc.Id -Force; Start-Sleep -Milliseconds 500 }}
        Start-Process -FilePath "{}"
    "#, obtener_ruta_app(app).unwrap_or_default());
    ejecutar_powershell(&ps).await
}

async fn ejecutar_terminal_admin(args: &HashMap<String, String>, limites: al::LimitesAyudante) -> EjecutarResultado {
    let orden = match al::validar_terminal_admin(args) { Ok(o) => o, Err(e) => return error(&e) };
    // Ejecutar en PowerShell elevado (ya corremos como SYSTEM en el servicio)
    let ps = format!(r#"
        $ErrorActionPreference = 'Stop'
        try {{
            {} 2>&1
        }} catch {{
            Write-Error $_.Exception.Message
            exit 1
        }}
    "#, orden);
    ejecutar_powershell_con_limites(&ps, limites).await
}

// ─── Helpers PowerShell ───

async fn ejecutar_powershell(script: &str) -> EjecutarResultado {
    let output = Command::new("powershell")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script])
        .output()
        .await;

    match output {
        Ok(o) => EjecutarResultado {
            exito: o.status.success(),
            salida: if o.stdout.is_empty() { None } else { Some(String::from_utf8_lossy(&o.stdout).to_string()) },
            error: if o.stderr.is_empty() { None } else { Some(String::from_utf8_lossy(&o.stderr).to_string()) },
            codigo: o.status.code(),
        },
        Err(e) => EjecutarResultado { exito: false, salida: None, error: Some(e.to_string()), codigo: None },
    }
}

async fn ejecutar_powershell_con_limites(script: &str, limites: al::LimitesAyudante) -> EjecutarResultado {
    // Para terminal admin con límites, ejecutamos con timeout y límite de salida
    let mut cmd = Command::new("powershell");
    cmd.args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script]);
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = match cmd.spawn() { Ok(c) => c, Err(e) => return error(&format!("spawn: {e}")) };
    let stdout = child.stdout.take().expect("stdout");
    let stderr = child.stderr.take().expect("stderr");

    let mut stdout_buf = String::new();
    let mut stderr_buf = String::new();

    use std::io::{BufRead, BufReader};
    let mut r_stdout = BufReader::new(stdout);
    let mut r_stderr = BufReader::new(stderr);

    let timeout = std::time::Duration::from_millis(limites.tiempo_max_ms);
    let inicio = std::time::Instant::now();
    let mut code = None;

    loop {
        if inicio.elapsed() >= timeout {
            let _ = child.kill();
            stdout_buf.push_str("\n[TIMEOUT]");
            break;
        }
        match child.try_wait() {
            Ok(Some(status)) => { code = status.code(); break; }
            Ok(None) => { std::thread::sleep(std::time::Duration::from_millis(50)); }
            Err(e) => return error(&format!("wait: {e}")),
        }
    }

    // Leer salida restante con límite
    let _ = r_stdout.read_to_string(&mut stdout_buf);
    let _ = r_stderr.read_to_string(&mut stderr_buf);
    if stdout_buf.len() + stderr_buf.len() > limites.salida_max_bytes {
        stdout_buf.truncate(limites.salida_max_bytes / 2);
        stderr_buf.truncate(limites.salida_max_bytes / 2);
    }

    EjecutarResultado {
        exito: code == Some(0),
        salida: if stdout_buf.is_empty() { None } else { Some(stdout_buf) },
        error: if stderr_buf.is_empty() { None } else { Some(stderr_buf) },
        codigo: code,
    }
}

fn obtener_ruta_app(app: &AppHandle) -> Result<String, String> {
    app.path().resource_dir()
        .map_err(|e| format!("resource_dir: {e}"))?
        .parent()
        .ok_or("sin directorio padre")?
        .join("starseed-native.exe")
        .to_string_lossy()
        .to_string()
        .into()
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
        let e = EstadoAyudante { instalado: true, disponible: true, motivo: String::new(), version_contrato: 1 };
        let json = serde_json::to_string(&e).unwrap();
        assert!(json.contains("\"instalado\":true"));
        assert!(json.contains("\"version_contrato\":1"));
    }

    #[test]
    fn ejecutar_params_deserializa() {
        let json = r#"{"orden":"almacenes_estado","args":{},"tiempo_max_ms":30000}"#;
        let p: EjecutarParams = serde_json::from_str(json).unwrap();
        assert_eq!(p.orden, al::OrdenAyudante::AlmacenesEstado);
    }

    #[test]
    fn escape_ps_script_no_panica() {
        let script = "Get-Disk | ConvertTo-Json";
        let escaped = escape_ps_script(script);
        assert!(escaped.contains("FromBase64String"));
    }
}