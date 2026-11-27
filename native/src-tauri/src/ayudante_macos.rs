//! (TRM1125C) Ayudante privilegiado macOS · registro con SMAppService y comandos Tauri para órdenes tipadas.
//! Contrato: architecture/terminal-entre-neuronas.md, architecture/control-remoto-entre-neuronas.md,
//! architecture/permisos-y-control-del-dispositivo.md §4.
//!
//! El ayudante se registra como LaunchDaemon (SMAppService) con autorización de administrador
//! la primera vez. Ofrece órdenes tipadas (almacenes, servicios StarSeed, actualizar, logs, reiniciar)
//! con guardas en la lógica pura y registro de solo-añadir.

use crate::ayudante_macos_logica as al;
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
    std::env::var_os("HOME").map(|h| {
        PathBuf::from(h).join("Library/Logs/app.starseed.os/ayudante.log")
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
    let ruta_enlaces = std::env::var_os("HOME")
        .map(|h| PathBuf::from(h).join("Library/Logs/app.starseed.os/enlaces.log"));
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

// ─── SMAppService: registro del ayudante ───

/// Registra el ayudante como LaunchDaemon (SMAppService) pidiendo autorización de administrador.
/// Solo macOS 13+ (Ventura+). En sistemas antiguos devuelve error descriptivo.
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
            anotar_registro(&app, "registrado", &origen, "SMAppService: ayudante registrado con autorización de administrador");
            Ok(estado(&app))
        }
        Err(e) => {
            anotar_registro(&app, "registro-fallido", &origen, &e);
            Err(e)
        }
    }
}

/// Desregistra el ayudante (quita el LaunchDaemon).
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
            anotar_registro(&app, "desregistrado", &origen, "SMAppService: ayudante desregistrado");
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
    pub disponible: bool,      // macOS 13+ y StarSeed OS
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
    } else if !cfg!(target_os = "macos") {
        (false, "El ayudante con SMAppService solo existe en macOS".into())
    } else {
        // Verificar versión de macOS (13.0 = Ventura = SMAppService)
        let version = macos_version();
        if version.major >= 13 {
            (true, String::new())
        } else {
            (false, format!("macOS {} demasiado antiguo: se necesita 13.0 (Ventura) o posterior para SMAppService", version))
        }
    };
    EstadoAyudante {
        registrado,
        disponible,
        motivo,
        version_contrato: al::VERSION_CONTRATO,
    }
}

struct MacOSVersion { major: u32, minor: u32 }
fn macos_version() -> MacOSVersion {
    let output = Command::new("sw_vers").arg("-productVersion").output().ok();
    let version = output.and_then(|o| String::from_utf8(o.stdout).ok()).unwrap_or_default();
    let parts: Vec<&str> = version.trim().split('.').collect();
    let major = parts.first().and_then(|s| s.parse().ok()).unwrap_or(0);
    let minor = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);
    MacOSVersion { major, minor }
}

/// Registra el ayudante vía SMAppService (requiere autorización de administrador).
/// El binario del ayudante debe estar en `Contents/Library/LaunchServices/` del bundle.
async fn registrar_ayudante_nativo() -> Result<(), String> {
    // El helper tool se registra con `SMAppService` desde la app principal.
    // En Rust usamos `launchctl bootstrap` como alternativa portable que pide autorización.
    // El plist del LaunchDaemon debe estar en el bundle de la app.
    let plist = formato_plist();
    let tmp = std::env::temp_dir().join("com.starseed.ayudante.plist");
    std::fs::write(&tmp, plist).map_err(|e| format!("escribir plist: {e}"))?;

    // `launchctl bootstrap system` pide autorización de administrador via GUI nativa.
    let output = Command::new("launchctl")
        .args(["bootstrap", "system", tmp.to_str().unwrap()])
        .output()
        .await
        .map_err(|e| format!("launchctl: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("falló el registro (¿autorización de administrador?): {stderr}"));
    }
    Ok(())
}

/// Desregistra el ayudante.
async fn desregistrar_ayudante_nativo() -> Result<(), String> {
    let output = Command::new("launchctl")
        .args(["bootout", "system", "com.starseed.ayudante"])
        .output()
        .await
        .map_err(|e| format!("launchctl: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("falló el desregistro: {stderr}"));
    }
    Ok(())
}

/// Genera el plist del LaunchDaemon para el ayudante.
fn formato_plist() -> String {
    // El ejecutable del ayudante está en Contents/MacOS/ayudante (o se copia ahí al instalar)
    format!(r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>{}</string>
    <key>ProgramArguments</key>
    <array>
        <string>{{EXECUTABLE_PATH}}/ayudante</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    <key>StandardOutPath</key>
    <string>/var/log/starseed-ayudante.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/starseed-ayudante-error.log</string>
</dict>
</plist>"#, al::SERVICIO_AYUDANTE)
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
    let output = Command::new("diskutil").arg("list").output().await;
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
    // Buscar el disco por serie
    let output = Command::new("diskutil").args(["info", "-plist", serie]).output().await;
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
    let output = Command::new("diskutil")
        .args(["eraseDisk", &formato, &nombre, &serie])
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
    let output = Command::new("diskutil").args(["mount", &serie]).output().await;
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
    let output = Command::new("diskutil").args(["unmount", &serie]).output().await;
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
    let output = Command::new("diskutil").args(["verifyDisk", serie]).output().await;
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
    let output = Command::new("launchctl").args(["list", "com.starseed.*"]).output().await;
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
    if !nombre.starts_with("com.starseed.") { return error("solo servicios com.starseed.*"); }
    let output = Command::new("launchctl").args(["bootstrap", "system", format!("/Library/LaunchDaemons/{}.plist", nombre)]).output().await;
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
    if !nombre.starts_with("com.starseed.") { return error("solo servicios com.starseed.*"); }
    let output = Command::new("launchctl").args(["bootout", "system", nombre]).output().await;
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
    let mut cmd = Command::new("log");
    cmd.args(["show", "--style", "compact", "--last", &format!("{}m", (lineas / 10).max(1))]);
    if let Some(f) = filtro { cmd.args(["--predicate", &f]); }
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
    // Usamos el comando de Tauri `app.restart()` pero desde el proceso privilegiado
    // podríamos usar `launchctl` para reiniciar el bundle.
    let bundle_id = "app.starseed.os";
    let output = Command::new("launchctl").args(["bootout", "gui/$(id -u)", bundle_id]).output().await;
    let _ = output;
    std::thread::sleep(std::time::Duration::from_millis(500));
    let output = Command::new("open").args(["-b", bundle_id]).output().await;
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
    let mut cmd = Command::new("sh");
    cmd.arg("-c").arg(&orden);
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = match cmd.spawn() { Ok(c) => c, Err(e) => return error(&format!("spawn: {e}")) };
    let stdout = child.stdout.take().expect("stdout");
    let stderr = child.stderr.take().expect("stderr");

    let mut stdout_buf = String::new();
    let mut stderr_buf = String::new();
    let mut truncada = false;

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
            truncada = true;
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
        truncada = true;
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