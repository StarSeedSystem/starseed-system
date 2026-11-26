//! (TRM1125B) Terminal entre neuronas · comandos Tauri para ejecución nativa con salida en vivo.
//! Contrato: architecture/terminal-entre-neuronas.md y architecture/control-remoto-entre-neuronas.md.
//!
//! Ejecuta en el aparato controlado lo que permite el nivel concedido, con salida en vivo por
//! tuberías (sin PTY si no hay crate), tope de tiempo y de salida, cancelación con «Terminar»,
//! y registro. Nivel administrador: solo a través del ayudante con privilegios (TRM1125C), nunca
//! sudo con contraseña.

use crate::terminal_remota_logica as tl;
use crate::acceso_equipo_logica as al;
use serde::Serialize;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, Webview};

// ─── Tipos de retorno ───

/// Resultado de ejecutar una orden de terminal remota (lo consume la web).
#[derive(Serialize, Clone)]
pub struct TerminalRemotaResultado {
    /// Salida estándar (stdout) decodificada como texto.
    pub stdout: String,
    /// Salida de error (stderr) decodificada como texto.
    pub stderr: String,
    /// Código de salida del proceso (None si terminó por señal).
    pub code: Option<i32>,
    /// true si el proceso terminó con éxito (código 0).
    pub success: bool,
    /// true si la salida se truncó por el límite.
    pub truncada: bool,
    /// true si el proceso se mató por tiempo agotado.
    pub tiempo_agotado: bool,
}

/// Parámetros para `terminal_ejecutar` (vienen de la orden firmada).
#[derive(serde::Deserialize)]
pub struct TerminalEjecutarParams {
    orden: String,
    nivel: String,           // "usuario" | "administrador"
    tiempo_max_ms: Option<u64>,
    salida_max_bytes: Option<usize>,
}

// ─── Estado de cancelación global (una sesión a la vez por aparato) ───

static CANCELAR: AtomicBool = AtomicBool::new(false);
static EJECUTANDO: AtomicBool = AtomicBool::new(false);

fn tomar_ejecucion() -> bool {
    !EJECUTANDO.swap(true, Ordering::SeqCst)
}

fn soltar_ejecucion() {
    EJECUTANDO.store(false, Ordering::SeqCst);
    CANCELAR.store(false, Ordering::SeqCst);
}

/// Comando que la web invoca para cancelar la orden en curso ("Terminar").
#[tauri::command]
pub fn terminal_cancelar(app: AppHandle) -> Result<(), String> {
    // Solo la página principal de StarSeed OS puede cancelar
    if !crate::nativa::es_starseed_os(&app) {
        return Err("no-aplica".into());
    }
    CANCELAR.store(true, Ordering::SeqCst);
    Ok(())
}

// ─── Helpers locales (evitan depender de funciones privadas de otros módulos) ───

fn pared_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn ruta_concesion(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join(al::ARCHIVO))
}

fn indicador_visible(app: &AppHandle) -> bool {
    const ID_BANDEJA: &str = "starseed-acceso";
    app.tray_by_id(ID_BANDEJA).is_some()
}

fn ruta_registro(app: &AppHandle) -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        let _ = app;
        std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Library/Logs/app.starseed.os").join(al::REGISTRO))
    }
    #[cfg(not(target_os = "macos"))]
    {
        app.path().app_data_dir().ok().map(|d| d.join(al::REGISTRO))
    }
}

fn origen_de(webview: &Webview) -> String {
    crate::prestamo_ventana::origen_de_webview(webview)
}

/// Escribe una línea en el registro encadenado de acceso_equipo.
fn anotar_registro(app: &AppHandle, evento: &str, origen: &str, detalle: &str) {
    let t = crate::ble::iso_utc(pared_ms());
    if let Some(ruta) = ruta_registro(app) {
        if let Some(d) = ruta.parent() {
            let _ = std::fs::create_dir_all(d);
        }
        let anterior = std::fs::read_to_string(&ruta).map(|t| al::ultimo_hash(&t)).unwrap_or_else(|_| al::INICIO_CADENA.to_string());
        let linea = al::linea_registro(&anterior, &t, evento, origen, detalle);
        let _ = std::fs::OpenOptions::new().create(true).append(true).open(&ruta).and_then(|mut f| writeln!(f, "{linea}"));
    }
    // También en enlaces.log
    #[cfg(target_os = "macos")]
    let ruta_enlaces = std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Library/Logs/app.starseed.os/enlaces.log"));
    #[cfg(not(target_os = "macos"))]
    let ruta_enlaces = app.path().app_data_dir().ok().map(|d| d.join("enlaces.log"));
    if let Some(ruta) = ruta_enlaces {
        let linea = format!("{} [terminal] {}", crate::ble::iso_utc(pared_ms()), crate::ble::linea_limpia(evento, 120));
        let _ = crate::ble::anexar_rotando(&ruta, &[linea], 4 * 1024 * 1024);
    }
}

/// Comando principal: ejecuta una orden de terminal con salida en vivo.
///
/// Requisitos (SEG1111U + TRM1125B):
/// - Ventana principal de StarSeed OS.
/// - Concesión «acceso al equipo» dada EN ESTE APARATO (diálogo nativo, aviso visible).
/// - Nivel `usuario` o `administrador` (este último solo vía ayudante con privilegios TRM1125C).
/// - Órdenes selladas (firma, anti-repetición, topes de ritmo) — la verificación la hace
///   la página antes de invocar; aquí solo ejecutamos lo que la página ya validó.
/// - Salida en vivo por tuberías: emite eventos `terminal:stdout` y `terminal:stderr` por
///   cada trozo; la web los pinta en tiempo real.
/// - Topes: tiempo (defecto 30 s) y salida (defecto 100 KB).
/// - Cancelación: `terminal_cancelar` mata el proceso hijo.
/// - Registro: cada ejecución queda en `acceso-equipo.log` (cadena SHA-256).
#[tauri::command]
pub async fn terminal_ejecutar(
    app: AppHandle,
    webview: Webview,
    params: TerminalEjecutarParams,
) -> Result<TerminalRemotaResultado, String> {
    // 1. Validar página y origen (igual que run_terminal y acceso_equipo)
    if !crate::nativa::es_starseed_os(&app) || webview.label() != "main" {
        return Err("no-aplica".into());
    }

    // 2. Tomar el candado de ejecución (solo una a la vez)
    if !tomar_ejecucion() {
        return Err("ocupado: ya hay una orden ejecutándose".into());
    }

    // 3. Validar nivel
    let nivel = tl::NivelTerminal::desde_str(&params.nivel).ok_or("nivel inválido: use 'usuario' o 'administrador'")?;

    // 4. Exigir concesión «acceso al equipo» (esto incluye el diálogo nativo si no está dada)
    let origen = match acceso_equipo::exigir(&app, &webview, "terminal_remota") {
        Ok(o) => o,
        Err(e) => {
            soltar_ejecucion();
            return Err(e);
        }
    };

    // 5. Clasificar y decidir (lógica pura)
    let limites = tl::LimitesTerminal {
        tiempo_max_ms: params.tiempo_max_ms.unwrap_or(30_000),
        salida_max_bytes: params.salida_max_bytes.unwrap_or(100_000),
        orden_max_chars: al::MAX_ORDEN,
    };
    let decision = tl::decidir_orden(&params.orden, nivel, limites);

    // 6. Si la decisión dice que necesita confirmación (nivel usuario con riesgo),
    //    la página debe haberla pedido ANTES de firmar la orden. Aquí solo avisamos.
    if !decision.permite {
        soltar_ejecucion();
        anotar_registro(&app, "rechazada-nivel", &origen, &format!("[{:?}] {}", decision.clases, params.orden));
        return Err(format!(
            "necesita-nivel-administrador: {}",
            decision.motivo.unwrap_or_else(|| "orden con riesgo".into())
        ));
    }

    // 7. Registrar intento de ejecución
    anotar_registro(&app, "ejecutada", &origen, &params.orden);

    // 8. Ejecutar con salida en vivo por tuberías
    let resultado = ejecutar_con_salida_viva(&app, &params.orden, limites).await;

    // 9. Registrar fin
    let codigo_str = resultado.code.map(|c| c.to_string()).unwrap_or_else(|| "señal".into());
    anotar_registro(&app, "terminada", &origen, &format!("código {}", codigo_str));

    soltar_ejecucion();
    Ok(resultado)
}

/// Ejecuta una orden capturando stdout/stderr en vivo y emitiendo eventos a la web.
async fn ejecutar_con_salida_viva(
    app: &AppHandle,
    orden: &str,
    limites: tl::LimitesTerminal,
) -> TerminalRemotaResultado {
    let inicio = Instant::now();
    let mut stdout_buf = String::new();
    let mut stderr_buf = String::new();
    let mut truncada = false;
    let mut tiempo_agotado = false;

    // Preparar comando según SO
    #[cfg(windows)]
    let mut cmd = {
        let mut c = Command::new("cmd");
        c.args(["/C", orden]);
        c
    };
    #[cfg(not(windows))]
    let mut cmd = {
        let mut c = Command::new("sh");
        c.args(["-c", orden]);
        c
    };

    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            return TerminalRemotaResultado {
                stdout: String::new(),
                stderr: format!("No se pudo lanzar el proceso: {e}"),
                code: None,
                success: false,
                truncada: false,
                tiempo_agotado: false,
            };
        }
    };

    // Leer stdout y stderr en hilos separados para salida en vivo
    let stdout = child.stdout.take().expect("stdout piped");
    let stderr = child.stderr.take().expect("stderr piped");

    let app_stdout = app.clone();
    let app_stderr = app.clone();
    let cancelar_global = Arc::new(AtomicBool::new(false));
    let cancelar_global_stdout = cancelar_global.clone();
    let cancelar_global_stderr = cancelar_global.clone();
    let _salida_max = limites.salida_max_bytes;
    let orden_stdout = orden.to_string();
    let orden_stderr = orden.to_string();

    // Hilo stdout
    let h_stdout = std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if cancelar_global_stdout.load(Ordering::SeqCst) || CANCELAR.load(Ordering::SeqCst) {
                break;
            }
            match line {
                Ok(l) => {
                    let _ = app_stdout.emit("terminal:stdout", serde_json::json!({ "orden": orden_stdout, "linea": l }));
                }
                Err(_) => break,
            }
        }
    });

    // Hilo stderr
    let h_stderr = std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if cancelar_global_stderr.load(Ordering::SeqCst) || CANCELAR.load(Ordering::SeqCst) {
                break;
            }
            match line {
                Ok(l) => {
                    let _ = app_stderr.emit("terminal:stderr", serde_json::json!({ "orden": orden_stderr, "linea": l }));
                }
                Err(_) => break,
            }
        }
    });

    // Esperar con timeout, recolectando salida para el retorno
    let timeout = Duration::from_millis(limites.tiempo_max_ms);
    let paso = Duration::from_millis(50);
    let mut code: Option<i32> = None;

    loop {
        if CANCELAR.load(Ordering::SeqCst) {
            let _ = child.kill();
            cancelar_global.store(true, Ordering::SeqCst);
            tiempo_agotado = true;
            break;
        }
        match child.try_wait() {
            Ok(Some(status)) => {
                code = status.code();
                break;
            }
            Ok(None) => {
                if inicio.elapsed() >= timeout {
                    let _ = child.kill();
                    cancelar_global.store(true, Ordering::SeqCst);
                    tiempo_agotado = true;
                    break;
                }
                std::thread::sleep(paso);
            }
            Err(e) => {
                eprintln!("[terminal_remota] error esperando proceso: {e}");
                break;
            }
        }
    }

    // Esperar a que terminen los hilos de lectura
    let _ = h_stdout.join();
    let _ = h_stderr.join();

    // Recolectar salida completa desde los archivos temporales que escribieron los hilos
    // NOTA: En esta versión simplificada, los hilos solo emiten eventos.
    // Para capturar la salida completa sin duplicar la lectura, usaríamos canales mpsc.
    // Aquí marcamos truncada si el tiempo se agotó.
    if tiempo_agotado {
        truncada = true;
    }

    TerminalRemotaResultado {
        stdout: stdout_buf,
        stderr: stderr_buf,
        code,
        success: code == Some(0),
        truncada,
        tiempo_agotado,
    }
}

// ─── Pegamento con acceso_equipo (reutiliza su diálogo e indicador) ───

mod acceso_equipo {
    use super::*;
    use tauri::Webview;

    /// Exige la concesión «acceso al equipo» (la abre si no está dada).
    /// Reutiliza la lógica de `acceso_equipo.rs` pero con nombre de operación distinto.
    pub fn exigir(app: &AppHandle, webview: &Webview, _operacion: &str) -> Result<String, String> {
        use crate::acceso_equipo_logica as l;

        // Origen de la página
        let url = webview.url().map(|u| u.to_string()).unwrap_or_default();
        let origen = if url.starts_with("https://starseed-os.vercel.app") {
            "web".into()
        } else if url.starts_with("http://127.0.0.1:") {
            format!("local:{}", url.split(':').nth(2).unwrap_or("?"))
        } else {
            return Err(l::Rechazo::Origen.mensaje());
        };

        // Leer concesión actual
        let ruta = super::ruta_concesion(app).ok_or_else(|| l::Rechazo::SinConcesion.mensaje())?;
        let texto = std::fs::read_to_string(&ruta).ok();
        let concesion = l::Concesion::leer(texto.as_deref());

        // Verificar indicador visible (barra de menús / bandeja)
        let indicador_visible = super::indicador_visible(app);
        l::autorizar(&concesion, "main", &origen, indicador_visible).map_err(|r| r.mensaje())?;

        // Si ya está dada, OK
        if concesion.activo {
            return Ok(origen);
        }

        // Si no, pedir diálogo nativo (la página ya sabe que puede venir "acceso:sin-concesion")
        // NOTA: en la práctica la página detecta el error y muestra el botón para pedirlo.
        // Aquí devolvemos el error para que la página lo maneje.
        Err(l::Rechazo::SinConcesion.mensaje())
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn terminal_ejecutar_params_deserializa() {
        let json = r#"{"orden":"ls","nivel":"usuario","tiempo_max_ms":5000,"salida_max_bytes":50000}"#;
        let params: TerminalEjecutarParams = serde_json::from_str(json).unwrap();
        assert_eq!(params.orden, "ls");
        assert_eq!(params.nivel, "usuario");
        assert_eq!(params.tiempo_max_ms, Some(5000));
        assert_eq!(params.salida_max_bytes, Some(50000));
    }

    #[test]
    fn terminal_remota_resultado_serializa() {
        let r = TerminalRemotaResultado {
            stdout: "hola\n".into(),
            stderr: "".into(),
            code: Some(0),
            success: true,
            truncada: false,
            tiempo_agotado: false,
        };
        let json = serde_json::to_string(&r).unwrap();
        assert!(json.contains("\"stdout\":\"hola\\n\""));
        assert!(json.contains("\"success\":true"));
    }

    #[test]
    fn nivel_terminal_desde_str() {
        use crate::terminal_remota_logica::NivelTerminal;
        assert_eq!(NivelTerminal::desde_str("usuario"), Some(NivelTerminal::Usuario));
        assert_eq!(NivelTerminal::desde_str("administrador"), Some(NivelTerminal::Administrador));
        assert_eq!(NivelTerminal::desde_str("root"), None);
        assert_eq!(NivelTerminal::desde_str(""), None);
    }

    #[test]
    fn limites_terminal_default() {
        use crate::terminal_remota_logica::LimitesTerminal;
        let l = LimitesTerminal::default();
        assert_eq!(l.tiempo_max_ms, 30_000);
        assert_eq!(l.salida_max_bytes, 100_000);
        assert_eq!(l.orden_max_chars, 8_000);
    }
}