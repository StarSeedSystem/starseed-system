// ═══════════════════════════════════════════════════════════════════════════
// migracion_origen — trae al servidor local lo que la app tenía en el origen de la web publicada
// (APP1107B · T4, 2026-11-07). Contrato: architecture/apps-autonomas-sin-internet.md §2.1.
// ---------------------------------------------------------------------------
// Al primer arranque con servidor local (y hasta que salga bien, como mucho 3 veces):
//   1. `preparar` (desde servidor_local, con el paquete ya comprobado): si hay internet, abre una
//      ventana OCULTA en `https://starseed-os.vercel.app/offline.html` con un script de inicio
//      (`native/servidor-local/migracion-origen.js`) que lee localStorage + IndexedDB de ESE origen
//      —el de la versión anterior, en el mismo almacén del sistema (WKWebView / WebView2 /
//      WebKitGTK)— y lo manda aquí por trozos (`migracion_origen_exportar`). Rust quita la sesión,
//      escribe una copia sin secretos en `<app_data>/migracion-origen/` y cierra la ventana.
//   2. La ventana principal, en vez de ir a `/`, va a `/__starseed/migracion` del servidor local:
//      una página sin el código del OS que pide los datos (`migracion_origen_estado` / `_datos`),
//      los fusiona sin pisar nada y confirma (`migracion_origen_confirmar`) → marcador y a `/`.
// El original nunca se borra. Lógica pura y pruebas: migracion_origen_logica.rs.
// (T4b · TAM1107A) SIN internet ya no se pospone: la ventana oculta abre un HTML del binario con la
// dirección (el origen) de la web publicada y exporta igual, sin red (migracion_origen_local.rs). Con
// internet, el camino de siempre. `STARSEED_MIGRACION_SIN_RED=1` fuerza el modo sin red (pruebas T12).
// ═══════════════════════════════════════════════════════════════════════════

#[path = "migracion_origen_local.rs"]
mod local;

use crate::migracion_origen_logica as l;
use crate::servidor_local_logica as sl;
use serde::Serialize;
use serde_json::Value;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

/// El módulo del navegador (se inyecta entero como script de inicio de la ventana oculta).
const MODULO_JS: &str = include_str!("../../servidor-local/migracion-origen.js");

/// Lo que la página importadora (y la web) puede leer.
#[derive(Serialize, Clone, Debug, Default)]
pub struct EstadoMigracion {
    /// "no-aplica" | "exportando" | "lista" | "fallida" | "hecha"
    pub fase: String,
    pub motivo: Option<String>,
    /// Trozos que hay que pedir con `migracion_origen_datos` (fase "lista").
    pub partes: u32,
    pub bytes: u64,
    /// Nombre de la copia en `<app_data>/migracion-origen/`.
    pub copia: Option<String>,
    pub resumen: Option<Value>,
    /// (T4b) Cómo se abrió la versión anterior: "red" | "sin-red".
    pub modo: Option<String>,
}

struct Interno {
    estado: Mutex<EstadoMigracion>,
    recepcion: Mutex<l::Recepcion>,
    /// Datos saneados (JSON) y sus rangos, hasta que la página confirme.
    datos: Mutex<Option<(String, Vec<(usize, usize)>)>>,
    dir: Mutex<Option<PathBuf>>,
    marcador: Mutex<Option<l::Marcador>>,
    version_app: Mutex<String>,
}

fn interno() -> &'static Interno {
    static I: OnceLock<Interno> = OnceLock::new();
    I.get_or_init(|| Interno {
        estado: Mutex::new(EstadoMigracion { fase: "no-aplica".into(), ..Default::default() }),
        recepcion: Mutex::new(l::Recepcion::default()),
        datos: Mutex::new(None),
        dir: Mutex::new(None),
        marcador: Mutex::new(None),
        version_app: Mutex::new(String::new()),
    })
}

fn con_estado<T>(f: impl FnOnce(&mut EstadoMigracion) -> T) -> Option<T> {
    interno().estado.lock().ok().map(|mut e| f(&mut e))
}

fn fase() -> String {
    con_estado(|e| e.fase.clone()).unwrap_or_default()
}

fn ahora_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn fallar(app: &AppHandle, motivo: String) {
    let cambio = con_estado(|e| {
        if e.fase == "exportando" {
            e.fase = "fallida".into();
            e.motivo = Some(motivo.clone());
            true
        } else {
            false
        }
    })
    .unwrap_or(false);
    if cambio {
        cerrar_ventana(app);
    }
}

fn cerrar_ventana(app: &AppHandle) {
    if let Some(v) = app.get_webview_window(l::ETIQUETA_VENTANA) {
        let _ = v.destroy();
    }
}

/// ¿La ventana principal debe pasar por la página importadora antes de abrir el OS?
pub fn ir_al_importador() -> bool {
    matches!(fase().as_str(), "exportando" | "lista" | "fallida")
}

pub fn ruta_importador() -> &'static str {
    l::RUTA_IMPORTADOR
}

/// Se llama desde servidor_local con el paquete comprobado (solo escritorio y solo StarSeed OS).
/// No bloquea: decide con el marcador y deja la exportación en un hilo.
pub fn preparar(app: &AppHandle) {
    if !crate::nativa::es_starseed_os(app) {
        return;
    }
    let Ok(dir) = app.path().app_data_dir().map(|d| d.join(l::DIR)) else { return };
    let previo = std::fs::read_to_string(dir.join(l::MARCADOR)).ok().and_then(|t| l::leer_marcador(&t));
    if let Ok(mut v) = interno().version_app.lock() {
        *v = app.package_info().version.to_string();
    }
    if let Ok(mut d) = interno().dir.lock() {
        *d = Some(dir);
    }
    let pend = l::pendiente(previo.as_ref());
    if let Ok(mut m) = interno().marcador.lock() {
        *m = previo;
    }
    if !pend {
        con_estado(|e| e.fase = "hecha".into());
        return;
    }
    con_estado(|e| {
        e.fase = "exportando".into();
        e.motivo = None;
    });
    let app = app.clone();
    let _ = std::thread::Builder::new().name("migracion-origen".into()).spawn(move || exportar(app));
}

fn exportar(app: AppHandle) {
    let forzar = l::pide_forzar_sin_red(std::env::var(l::VAR_FORZAR_SIN_RED).ok().as_deref());
    let con_red = !forzar && crate::servidor_local::hay_internet();
    let Some(modo) = l::modo_exportacion(con_red, local::DISPONIBLE, forzar) else {
        fallar(
            &app,
            "Sin internet: los datos de la versión anterior se traerán la próxima vez que abras la app con conexión. Siguen intactos.".into(),
        );
        return;
    };
    con_estado(|e| e.modo = Some(modo.nombre().into()));
    // Sin red, la ventana empieza en blanco (no pide nada) y recibe después el HTML local con la dirección
    // de la web publicada; con red, la página de verdad, como siempre.
    let url = match modo {
        l::ModoExportacion::Red => l::url_exportacion(sl::WEB_PUBLICADA),
        l::ModoExportacion::SinRed => l::URL_VACIA.to_string(),
    };
    let Ok(url) = tauri::Url::parse(&url) else {
        fallar(&app, "URL de la versión anterior no válida.".into());
        return;
    };
    let script = l::script_exportacion(MODULO_JS, sl::WEB_PUBLICADA);
    let creada = tauri::WebviewWindowBuilder::new(&app, l::ETIQUETA_VENTANA, tauri::WebviewUrl::External(url))
        .title("StarSeed OS · trayendo tus datos")
        .visible(false)
        .focused(false)
        .skip_taskbar(true)
        .inner_size(480.0, 320.0)
        .initialization_script(&script)
        .build();
    let ventana = match creada {
        Ok(v) => v,
        Err(e) => {
            fallar(&app, format!("No se pudo abrir la versión anterior para leer sus datos: {e}"));
            return;
        }
    };
    if modo == l::ModoExportacion::SinRed {
        if let Err(e) = cargar_sin_red(&ventana) {
            fallar(&app, format!("No se pudo abrir sin conexión la versión anterior ({e}). Tus datos siguen intactos; se reintentará."));
            return;
        }
    }
    std::thread::sleep(Duration::from_millis(l::ESPERA_EXPORTAR_MS));
    fallar(
        &app,
        format!("La versión anterior no respondió en {} s. Tus datos siguen intactos; se reintentará.", l::ESPERA_EXPORTAR_MS / 1000),
    );
}

/// (T4b) Pone en la ventana oculta el HTML local con la dirección de la web publicada. Espera a que el motor
/// lo acepte (el `with_webview` corre en el hilo principal; aquí estamos en el hilo de la migración).
fn cargar_sin_red(ventana: &tauri::WebviewWindow) -> Result<(), String> {
    let url_base = l::url_exportacion_sin_red(sl::WEB_PUBLICADA);
    let pagina = l::pagina_sin_red(sl::WEB_PUBLICADA);
    let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
    ventana
        .with_webview(move |pw| {
            let _ = tx.send(cargar_en(&pw, l::HTML_SIN_RED, &url_base, &pagina));
        })
        .map_err(|e| e.to_string())?;
    rx.recv_timeout(Duration::from_secs(10)).map_err(|_| "la ventana no respondió".to_string())?
}

#[cfg(target_os = "linux")]
fn cargar_en(pw: &tauri::webview::PlatformWebview, html: &str, url_base: &str, _pagina: &str) -> Result<(), String> {
    local::cargar_webkitgtk(&pw.inner(), html, url_base)
}

#[cfg(target_os = "macos")]
fn cargar_en(pw: &tauri::webview::PlatformWebview, html: &str, url_base: &str, _pagina: &str) -> Result<(), String> {
    // SAFETY: `inner()` es el WKWebView vivo de esta ventana y `with_webview` corre en el hilo principal.
    unsafe { local::cargar_wkwebview(pw.inner(), html, url_base) }
}

#[cfg(target_os = "windows")]
fn cargar_en(pw: &tauri::webview::PlatformWebview, html: &str, url_base: &str, pagina: &str) -> Result<(), String> {
    local::cargar_webview2(&pw.controller(), &pw.environment(), html, url_base, pagina)
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
fn cargar_en(_pw: &tauri::webview::PlatformWebview, _html: &str, _url_base: &str, _pagina: &str) -> Result<(), String> {
    Err("este sistema no sabe abrir sin red la versión anterior".into())
}

/// Comprueba quién llama: la ventana y el origen exactos.
fn exigir(webview: &tauri::Webview, etiqueta: &str, origen: &str) -> Result<(), String> {
    if webview.label() != etiqueta {
        return Err("Esta ventana no puede hacer esto.".into());
    }
    let url = webview.url().map_err(|e| e.to_string())?;
    if l::origen_de(url.as_str()) != origen {
        return Err("Este origen no puede hacer esto.".into());
    }
    Ok(())
}

fn origen_local_actual() -> Option<String> {
    crate::servidor_local::servidor_local_estado().puerto.map(sl::origen_local)
}

/// La ventana oculta manda un trozo (o el error si no pudo exportar). `async`: el último trozo
/// analiza y escribe hasta decenas de MB, fuera del hilo principal.
#[tauri::command]
pub async fn migracion_origen_exportar(
    app: AppHandle,
    webview: tauri::Webview,
    id: String,
    indice: u32,
    total: u32,
    trozo: String,
    error: Option<String>,
) -> Result<(), String> {
    exigir(&webview, l::ETIQUETA_VENTANA, &l::origen_de(sl::WEB_PUBLICADA))?;
    if fase() != "exportando" {
        return Err("No se está esperando ninguna exportación.".into());
    }
    if let Some(e) = error {
        fallar(&app, format!("La versión anterior no pudo leer sus datos: {e}"));
        return Ok(());
    }
    let completo = interno().recepcion.lock().map_err(|e| e.to_string())?.poner(&id, indice, total, trozo)?;
    let Some(texto) = completo else { return Ok(()) };
    match terminar(&texto) {
        Ok(()) => cerrar_ventana(&app),
        Err(m) => fallar(&app, m),
    }
    Ok(())
}

/// Sanea, escribe la copia sin secretos y deja los datos listos para la página importadora.
fn terminar(texto: &str) -> Result<(), String> {
    let mut datos: Value = serde_json::from_str(texto).map_err(|e| format!("Los datos de la versión anterior no se entienden: {e}"))?;
    let saneado = l::sanear(&mut datos, &l::origen_de(sl::WEB_PUBLICADA))?;
    let version_app = interno().version_app.lock().map(|v| v.clone()).unwrap_or_default();
    let copia = interno().dir.lock().ok().and_then(|d| d.clone()).and_then(|dir| {
        let nombre = l::nombre_copia(ahora_ms(), &version_app);
        escribir_privado(&dir, &nombre, &serde_json::to_string_pretty(&l::copia_para_disco(&datos)).ok()?).ok()?;
        Some(nombre)
    });
    let json = serde_json::to_string(&datos).map_err(|e| e.to_string())?;
    let rangos = l::partir(&json, l::TAM_TROZO);
    let partes = rangos.len() as u32;
    let bytes = json.len() as u64;
    if let Ok(mut d) = interno().datos.lock() {
        *d = Some((json, rangos));
    }
    con_estado(|e| {
        e.fase = "lista".into();
        e.partes = partes;
        e.bytes = bytes;
        e.copia = copia;
        e.resumen = Some(l::resumen_estado(&saneado));
        e.motivo = None;
    });
    Ok(())
}

/// Escribe un archivo que solo puede leer esta persona (0600 en macOS y Linux).
fn escribir_privado(dir: &PathBuf, nombre: &str, texto: &str) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    let ruta = dir.join(nombre);
    let mut op = std::fs::OpenOptions::new();
    op.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        op.mode(0o600);
    }
    use std::io::Write;
    let mut f = op.open(&ruta)?;
    f.write_all(texto.as_bytes())?;
    f.sync_all()
}

/// Estado de la migración en este arranque.
#[tauri::command]
pub fn migracion_origen_estado() -> EstadoMigracion {
    interno().estado.lock().map(|e| e.clone()).unwrap_or_default()
}

/// Un trozo de los datos saneados. Solo para la ventana principal en el servidor local.
#[tauri::command]
pub fn migracion_origen_datos(webview: tauri::Webview, indice: u32) -> Result<String, String> {
    let origen = origen_local_actual().ok_or("El servidor local no está listo.")?;
    exigir(&webview, "main", &origen)?;
    let g = interno().datos.lock().map_err(|e| e.to_string())?;
    let (json, rangos) = g.as_ref().ok_or("No hay datos de la versión anterior esperando.")?;
    let &(a, b) = rangos.get(indice as usize).ok_or("Trozo fuera de rango.")?;
    Ok(json[a..b].to_string())
}

/// La página importadora dice cómo fue: marcador en el disco y se liberan los datos.
#[tauri::command]
pub fn migracion_origen_confirmar(
    webview: tauri::Webview,
    resultado: String,
    motivo: Option<String>,
    resumen: Option<Value>,
) -> Result<String, String> {
    let origen = origen_local_actual().ok_or("El servidor local no está listo.")?;
    exigir(&webview, "main", &origen)?;
    if !matches!(fase().as_str(), "lista" | "fallida") {
        return Err("No hay ninguna migración que confirmar.".into());
    }
    let version_app = interno().version_app.lock().map(|v| v.clone()).unwrap_or_default();
    let copia = con_estado(|e| e.copia.clone()).flatten();
    let previo = interno().marcador.lock().ok().and_then(|m| m.clone());
    let nuevo = l::tras_confirmar(previo.as_ref(), &resultado, motivo.clone(), resumen, copia, &version_app, ahora_ms());
    let dir = interno().dir.lock().ok().and_then(|d| d.clone()).ok_or("Sin carpeta de datos de la app.")?;
    let texto = serde_json::to_string_pretty(&nuevo).map_err(|e| e.to_string())?;
    escribir_privado(&dir, l::MARCADOR, &texto).map_err(|e| format!("No se pudo guardar el marcador: {e}"))?;
    if let Ok(mut d) = interno().datos.lock() {
        *d = None;
    }
    if let Ok(mut m) = interno().marcador.lock() {
        *m = Some(nuevo.clone());
    }
    con_estado(|e| {
        e.fase = if nuevo.resultado == "hecha" { "hecha".into() } else { "no-aplica".into() };
        e.motivo = motivo;
        e.partes = 0;
    });
    Ok(nuevo.resultado)
}
