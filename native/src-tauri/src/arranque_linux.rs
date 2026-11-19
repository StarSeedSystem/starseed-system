// ═══════════════════════════════════════════════════════════════════════════
// arranque_linux — integración Tauri del arranque en Linux (LNX1118WC · 2026-11-18).
// Contrato: esta tarea. Solo se compila en Linux.
// ---------------------------------------------------------------------------
// Qué hace este módulo (pega la lógica pura al sistema):
//   1. Antes de crear la ventana principal: lee /sys/class/drm y/o lspci,
//      decide si poner WEBKIT_DISABLE_DMABUF_RENDERER=1 y lo exporta al entorno del proceso.
//   2. Registra un manejador de carga del webview: si la carga principal falla
//      (error de red o «WebKit encountered an internal error»), reintenta con
//      backoff exponencial (máx. 3 intentos) cuando haya red; si se agotan,
//      carga el HTML de respaldo incluido en el binario y escribe una línea en
//      enlaces.log.
//   3. Todo lo que no es E/S (decisión de GPU, política de reintentos, línea de log)
//      vive en arranque_linux_logica y se prueba allí.
// ═══════════════════════════════════════════════════════════════════════════

#![allow(dead_code)]

use std::env;
use std::fs;
use std::process::Command;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use chrono::Local;
use crate::arranque_linux_logica as logica;
use tauri::{AppHandle, Manager};

const VAR_DMABUF: &str = "WEBKIT_DISABLE_DMABUF_RENDERER";
const LOG_ENLACES: &str = "enlaces.log";
const HTML_RESPALDO: &str = include_str!("../respaldo/arranque_fallo.html");

/// Lee el texto relevante para detectar la GPU.
/// Intenta primero /sys/class/drm (más fiable en contenedores/AppImage) y cae a lspci.
fn leer_info_gpu() -> String {
    let mut partes = Vec::new();

    // 1) /sys/class/drm/*/device/uevent — cada tarjeta tiene su uevent con PCI_ID, DRIVER, etc.
    if let Ok(entries) = fs::read_dir("/sys/class/drm") {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.file_name().and_then(|n| n.to_str()).map(|n| n.starts_with("card")).unwrap_or(false) {
                let uevent = path.join("device/uevent");
                if let Ok(txt) = fs::read_to_string(&uevent) {
                    partes.push(txt);
                }
            }
        }
    }

    // 2) lspci -nn (si está disponible) — más legible y cubre GPUs discretas sin DRM.
    if let Ok(out) = Command::new("lspci").args(["-nn"]).output() {
        if out.status.success() {
            let txt = String::from_utf8_lossy(&out.stdout).to_string();
            if !txt.trim().is_empty() {
                partes.push(txt);
            }
        }
    }

    partes.join("\n")
}

/// Configura WEBKIT_DISABLE_DMABUF_RENDERER si procede (antes de crear cualquier webview).
pub fn configurar_dmabuf_si_hace_falta() {
    let valor_existente = env::var(VAR_DMABUF).ok().filter(|v| !v.trim().is_empty());
    if valor_existente.is_some() {
        return; // Ya definida con valor no vacío: respetar.
    }
    let info = leer_info_gpu();
    let tipo = logica::detectar_tipo_gpu(&info);
    if let Some(valor) = logica::decidir_dmabuf(valor_existente.as_deref(), tipo) {
        // SAFE: solo afecta a este proceso y sus hijos (el webview hereda el entorno).
        unsafe { env::set_var(VAR_DMABUF, valor); }
        eprintln!("[arranque_linux] {VAR_DMABUF}={valor} (GPU: {:?})", tipo);
    }
}

/// Estado de reintentos por ventana (solo una ventana principal en esta app).
#[derive(Default)]
struct EstadoReintentos {
    intento: AtomicU32,
    ultima_url: Mutex<Option<String>>,
}

impl EstadoReintentos {
    fn nuevo() -> Arc<Self> {
        Arc::new(Self::default())
    }
    fn siguiente_intento(&self) -> u32 {
        self.intento.fetch_add(1, Ordering::Relaxed) + 1
    }
    fn set_url(&self, url: String) {
        *self.ultima_url.lock().unwrap() = Some(url);
    }
    fn url(&self) -> Option<String> {
        self.ultima_url.lock().unwrap().clone()
    }
}

/// Comprueba si hay conectividad de red básica (DNS + TCP a un host fiable).
fn hay_red() -> bool {
    // Intento rápido: resolver un nombre y conectar al puerto 443 (HTTPS).
    // Usamos Cloudflare (1.1.1.1) y Google (8.8.8.8) como referencias.
    for host in ["1.1.1.1:443", "8.8.8.8:443", "starseed-os.vercel.app:443"] {
        if let Ok(_) = std::net::TcpStream::connect_timeout(&host.parse().unwrap(), Duration::from_secs(2)) {
            return true;
        }
    }
    false
}

/// Escribe una línea en enlaces.log (en el directorio de datos de la app).
fn escribir_log_enlaces(app: &AppHandle, linea: &str) {
    if let Some(dir) = app.path().app_data_dir().ok() {
        let ruta = dir.join(LOG_ENLACES);
        let entrada = format!("[{}] {}\n", Local::now().format("%Y-%m-%d %H:%M:%S%.3f"), linea);
        let _ = fs::OpenOptions::new().create(true).append(true).open(&ruta).and_then(|mut f| {
            use std::io::Write;
            f.write_all(entrada.as_bytes())
        });
    }
}

/// Manejador de eventos de carga del webview principal.
/// Se registra en `setup` tras crear la ventana.
pub fn registrar_manejador_carga(app: &AppHandle) {
    let estado = EstadoReintentos::nuevo();
    let app_clone = app.clone();

    // Guardamos la URL original (la que viene de tauri.conf.json).
    if let Some(win) = app.get_webview_window("main") {
        if let Ok(url) = win.url() {
            estado.set_url(url.to_string());
        }
    }

    // Clonamos para el closure.
    let estado_clone = estado.clone();
    let app_clone2 = app_clone.clone();

    // Registramos el manejador de navegación/carga.
    // Nota: en Tauri 2, `on_navigation` o `on_page_load` son los puntos de enganche.
    // Usamos `on_page_load` que nos da el evento de carga con su resultado.
    app_clone.on_page_load(move |webview, carga| {
        // Solo nos interesa la ventana principal.
        if webview.label() != "main" {
            return;
        }

        let url = carga.url().to_string();
        let es_error = carga.error().is_some();

        // Detectar la página de error interno de WebKit ("WebKit encountered an internal error").
        // Esa página no dispara `carga.error()` en Tauri 2 (carga OK pero con contenido de error).
        // La detectamos comprobando el título o la URL interna.
        let es_error_interno_webkit = es_pagina_error_webkit_interno(&url);

        if !es_error && !es_error_interno_webkit {
            // Carga exitosa: resetear contador.
            estado_clone.intento.store(0, Ordering::Relaxed);
            return;
        }

        let intento = estado_clone.siguiente_intento();
        let causa = if es_error_interno_webkit {
            "WebKit internal error".to_string()
        } else if let Some(e) = carga.error() {
            format!("load_error: {}", e)
        } else {
            "unknown".to_string()
        };

        eprintln!("[arranque_linux] Fallo de carga (intento {}/{}): {}", intento, logica::PoliticaReintentos::default().max_intentos, causa);

        // Decidir qué hacer usando la lógica pura.
        let accion = logica::decidir_reintento(
            intento,
            hay_red(),
            es_error_interno_webkit,
            &causa,
            logica::PoliticaReintentos::default(),
        );

        match accion {
            logica::AccionTrasFallo::Reintentar { intento: siguiente, espera_ms } => {
                eprintln!("[arranque_linux] Reintentando en {} ms (intento {})", espera_ms, siguiente);
                let webview_clone = webview.clone();
                let estado_clone2 = estado_clone.clone();
                thread::spawn(move || {
                    thread::sleep(Duration::from_millis(espera_ms));
                    // Recargar la URL original.
                    if let Some(url) = estado_clone2.url() {
                        let _ = webview_clone.eval(&format!("window.location.href = '{}';", url));
                    }
                });
            }
            logica::AccionTrasFallo::CargarRespaldo { causa } => {
                let linea = logica::linea_log_fallo(intento, &causa);
                escribir_log_enlaces(&app_clone2, &linea);
                eprintln!("[arranque_linux] Cargando respaldo: {}", linea);
                cargar_respaldo(&app_clone2);
            }
            logica::AccionTrasFallo::Nada => {
                eprintln!("[arranque_linux] Sin red y error de red: no se reintenta.");
            }
        }
    });
}

/// Detecta si la URL cargada es la página de error interno de WebKit.
fn es_pagina_error_webkit_interno(url: &str) -> bool {
    // WebKitGTK carga una página interna tipo "webkit://error/..." o similar.
    // También comprobamos si el título contiene el texto característico (pero el título no está disponible aquí).
    // La URL de error interno suele ser "webkit://error" o contener "internal error".
    url.starts_with("webkit://error") || url.contains("internal error") || url.contains("WebKit encountered an internal error")
}

/// Carga el HTML de respaldo incluido en el binario.
fn cargar_respaldo(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.eval(&format!(
            "document.open(); document.write(`{}`); document.close();",
            HTML_RESPALDO.replace('`', "\\`").replace('$', "\\$")
        ));
    }
}

/// Punto de entrada llamado desde `lib.rs` en el `setup` de Tauri (solo Linux).
pub fn iniciar(app: &AppHandle) {
    // 1. Configurar DMABUF antes de que se cree el webview (ya se hizo en main.rs antes de builder, pero por si acaso).
    configurar_dmabuf_si_hace_falta();

    // 2. Registrar manejador de fallos de carga.
    registrar_manejador_carga(app);
}