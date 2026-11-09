// ═══════════════════════════════════════════════════════════════════════════
// llamada_entrante — la llamada entrante que suena, despierta y abre su ventana en cualquier estado (LLA1108F).
// Contrato: architecture/llamadas-telefonia.md § 8.5–8.6. Lo puro (con pruebas) está en llamada_entrante_logica.rs.
// ---------------------------------------------------------------------------
//   · Despertador («timbre»): quien llama manda por cada enlace una trama firmada con la clave de faro de la
//     cuenta (`llamada_timbre_firmar`). `al_recibir_local` (lo llama malla_local.rs con cada trama del TCP 47071)
//     la verifica SIN WebView. Si la web (viva) no reclama la llamada en 2,5 s, en Android suena la llamada nativa
//     (timbre, pantalla encendida, ventana sobre el bloqueo); «Contestar» abre la app y la web completa la llamada.
//   · Silencios: `llamada_silencios_sincronizar` guarda la lista de la web fusionada con la nativa en
//     `silencios-llamadas.json` (la carpeta que comparte con Kotlin) para que suene o calle aunque el JS esté parado.
//   · Escritorio: ventana pequeña «llamada-entrante», siempre encima y en todos los escritorios, más una notificación
//     con sonido, cuando la ventana principal no está a la vista. Sus botones navegan a `starseed-llamada://…`
//     (sin IPC ni capability: Rust intercepta la navegación y reenvía el evento a la web).
// ═══════════════════════════════════════════════════════════════════════════

use crate::llamada_entrante_logica as l;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

fn ahora_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn vistos() -> std::sync::MutexGuard<'static, l::Vistos> {
    static V: OnceLock<Mutex<l::Vistos>> = OnceLock::new();
    V.get_or_init(|| Mutex::new(l::Vistos::default())).lock().unwrap_or_else(|e| e.into_inner())
}

// ─────────────────────────────── Silencios en disco ───────────────────────────────

fn archivo_silencios(app: &AppHandle) -> Option<PathBuf> {
    crate::llamada_nativa::dir_compartido(app).map(|d| d.join(l::ARCHIVO_SILENCIOS))
}

pub fn cargar_silencios(app: &AppHandle) -> Vec<l::Silencio> {
    archivo_silencios(app).and_then(|a| std::fs::read_to_string(a).ok()).map(|t| l::leer_silencios(&t)).unwrap_or_default()
}

fn guardar_silencios(app: &AppHandle, lista: &[l::Silencio]) -> Result<(), String> {
    let a = archivo_silencios(app).ok_or("Sin carpeta de datos para guardar los silencios.")?;
    if let Some(d) = a.parent() {
        std::fs::create_dir_all(d).map_err(|e| format!("No se pudo crear {}: {e}", d.display()))?;
    }
    let tmp = a.with_extension("json.tmp");
    std::fs::write(&tmp, l::serializar_silencios(lista)).map_err(|e| format!("No se pudo escribir los silencios: {e}"))?;
    std::fs::rename(&tmp, &a).map_err(|e| format!("No se pudo colocar los silencios: {e}"))
}

/// La web da su lista; Rust la fusiona con la que haya en disco (la parte nativa también añade: «Silenciar…» desde
/// la pantalla de bloqueo), la guarda y devuelve el resultado para que la web lo adopte.
#[tauri::command]
pub fn llamada_silencios_sincronizar(app: AppHandle, json: String) -> Result<String, String> {
    if json.len() > 64_000 {
        return Err("La lista de silencios es demasiado grande.".into());
    }
    let web = l::leer_silencios(&json);
    let fusion = l::fusionar(&web, &cargar_silencios(&app), ahora_ms());
    guardar_silencios(&app, &fusion)?;
    Ok(l::serializar_silencios(&fusion))
}

// ─────────────────────────────── Despertador: firmar y recibir ───────────────────────────────

/// Quien llama: el cuerpo firmado del timbre para mandarlo por cada enlace (canal «llamada-timbre») antes de la
/// señalización. Err si falta la clave de faro de la cuenta: entonces no hay despertador, el resto sigue igual.
#[tauri::command]
pub fn llamada_timbre_firmar(id: String, nombre: String, tipo: String, medio: String) -> Result<serde_json::Value, String> {
    let g = crate::antenas::Guardian::actual().ok_or("Las antenas no han arrancado: sin despertador.")?;
    let clave = g.clave_cuenta().ok_or("Falta la clave de faro de la cuenta: sin despertador.")?;
    let neurona = g.neurona_propia().ok_or("Esta neurona no tiene id: sin despertador.")?;
    let ts = ahora_ms() / 1000;
    l::construir(&clave, &id, &neurona, &nombre, &tipo, &medio, ts, crate::faro::nonce_nuevo())
}

/// Una trama del canal local. Si es un timbre válido de una neurona de esta cuenta y la web no reclama la llamada,
/// la hace sonar la parte nativa (Android). Nunca bloquea al hilo de la conexión.
pub fn al_recibir_local(app: &AppHandle, cuerpo: &str) {
    let timbres = l::leer_timbres(cuerpo);
    if timbres.is_empty() {
        return;
    }
    let Some(g) = crate::antenas::Guardian::actual() else { return };
    let Some(clave) = g.clave_cuenta() else { return };
    let mia = g.neurona_propia();
    let ahora_s = ahora_ms() / 1000;
    for t in timbres {
        if l::verificar(&clave, &t, ahora_s, mia.as_deref()).is_err() || !vistos().apuntar(&t.id) {
            continue;
        }
        let h = app.clone();
        let _ = std::thread::Builder::new().name("llamada-timbre".into()).spawn(move || despertar(&h, t));
    }
}

fn despertar(app: &AppHandle, t: l::Timbre) {
    let consulta = l::ConsultaSilencio { neurona: Some(t.neurona.clone()), medio: Some(t.medio.clone()), ..Default::default() };
    let silencio_hasta = l::silenciada_por(&cargar_silencios(app), &consulta, ahora_ms()).map(|s| s.hasta.unwrap_or(u64::MAX / 2));
    // La web, si vive, es quien lleva la llamada (sus silencios, su ventana); el despertador es el respaldo.
    std::thread::sleep(std::time::Duration::from_millis(l::ESPERA_WEB_MS));
    if crate::llamada_nativa::sesion_es(&t.id) {
        return;
    }
    #[cfg(target_os = "android")]
    {
        let _ = crate::llamada_nativa::sonar_desde_timbre(app, &t, silencio_hasta);
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, silencio_hasta);
    }
}

// ─────────────────────────────── Ventana de escritorio ───────────────────────────────

#[cfg(desktop)]
static VENTANA: Mutex<l::EstadoVentana> = Mutex::new(l::EstadoVentana::Cerrada);

#[cfg(desktop)]
fn estado_principal(app: &AppHandle) -> l::Principal {
    use tauri::Manager;
    match app.get_webview_window("main") {
        Some(v) => l::Principal {
            visible: v.is_visible().unwrap_or(false),
            enfocada: v.is_focused().unwrap_or(false),
            minimizada: v.is_minimized().unwrap_or(false),
        },
        None => l::Principal { visible: false, enfocada: false, minimizada: false },
    }
}

/// Abre la ventana de la llamada entrante (y una notificación con sonido) si la app no está a la vista.
#[cfg(desktop)]
pub fn abrir_ventana(app: &AppHandle, d: l::DatosVentana) {
    use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
    let accion = {
        let v = VENTANA.lock().unwrap_or_else(|e| e.into_inner());
        l::decidir_ventana(&v, &d.id, estado_principal(app), false)
    };
    if accion != l::AccionVentana::Abrir {
        return;
    }
    notificar(app, &d);
    let html = l::html_ventana(&d);
    let Ok(url) = tauri::Url::parse(&format!("data:text/html;charset=utf-8,{}", codificar(&html))) else { return };
    let h = app.clone();
    let id = d.id.clone();
    let ventana = WebviewWindowBuilder::new(app, l::ETIQUETA_VENTANA, WebviewUrl::External(url))
        .title("StarSeed · llamada entrante")
        .inner_size(380.0, 250.0)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .focused(true)
        .on_navigation(move |u| {
            if u.scheme() == "data" {
                return true;
            }
            if let Some(a) = l::accion_de_url(u.as_str()) {
                responder(&h, a);
            }
            false
        })
        .build();
    match ventana {
        Ok(_) => {
            *VENTANA.lock().unwrap_or_else(|e| e.into_inner()) = l::EstadoVentana::Abierta(id);
        }
        Err(_) => {
            // Si ya había una (de otra llamada), se reutiliza cerrándola: la siguiente vez abre.
            if let Some(v) = app.get_webview_window(l::ETIQUETA_VENTANA) {
                let _ = v.close();
            }
        }
    }
}

#[cfg(not(desktop))]
pub fn abrir_ventana(_app: &AppHandle, _d: l::DatosVentana) {}

/// Cierra la ventana si es la de esa llamada.
#[cfg(desktop)]
pub fn cerrar_ventana(app: &AppHandle, id: &str) {
    use tauri::Manager;
    let mut v = VENTANA.lock().unwrap_or_else(|e| e.into_inner());
    if !matches!(&*v, l::EstadoVentana::Abierta(x) if x == id) {
        return;
    }
    *v = l::EstadoVentana::Cerrada;
    drop(v);
    if let Some(w) = app.get_webview_window(l::ETIQUETA_VENTANA) {
        let _ = w.close();
    }
}

#[cfg(not(desktop))]
pub fn cerrar_ventana(_app: &AppHandle, _id: &str) {}

/// Cierra la ventana de esa llamada si su nuevo estado ya no la necesita (contestada, en espera o terminada).
pub fn cerrar_por_estado(app: &AppHandle, id: &str, estado: &str) {
    #[cfg(desktop)]
    {
        let cerrar = l::cerrar_ventana_con(&VENTANA.lock().unwrap_or_else(|e| e.into_inner()), id, estado);
        if cerrar {
            cerrar_ventana(app, id);
        }
    }
    #[cfg(not(desktop))]
    let _ = (app, id, estado);
}

#[cfg(desktop)]
fn notificar(app: &AppHandle, d: &l::DatosVentana) {
    use tauri_plugin_notification::NotificationExt;
    let titulo = if d.video { "Videollamada entrante" } else { "Llamada entrante" };
    let _ = app.notification().builder().title(titulo).body(format!("{} · {}", d.nombre, l::texto_medio(&d.medio))).sound("default").show();
}

/// Un botón de la ventana: se cierra, se cuenta a la web con el mismo evento que usa Android y «Contestar» trae la
/// ventana principal al frente.
#[cfg(desktop)]
fn responder(app: &AppHandle, a: l::AccionPopup) {
    use tauri::Manager;
    let (evento, id, valor) = match &a {
        l::AccionPopup::Contestar(id) => ("contestar", id.clone(), serde_json::Value::Null),
        l::AccionPopup::Rechazar(id) => ("rechazar", id.clone(), serde_json::Value::Null),
        l::AccionPopup::Ignorar(id) => ("ignorar", id.clone(), serde_json::Value::Null),
        l::AccionPopup::Silenciar { id, ambito, duracion } => {
            ("silencio", id.clone(), serde_json::json!({ "ambito": ambito, "duracion": duracion }))
        }
    };
    cerrar_ventana(app, &id);
    if matches!(a, l::AccionPopup::Contestar(_)) {
        if let Some(v) = app.get_webview_window("main") {
            let _ = v.show();
            let _ = v.unminimize();
            let _ = v.set_focus();
        }
    }
    crate::llamada_nativa::emitir_evento(app, evento, &id, valor);
}

#[cfg(desktop)]
fn codificar(s: &str) -> String {
    let mut o = String::with_capacity(s.len() * 2);
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            o.push(b as char);
        } else {
            o.push_str(&format!("%{b:02X}"));
        }
    }
    o
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[cfg(desktop)]
    #[test]
    fn la_url_de_datos_se_codifica_sin_romper_el_html() {
        let c = codificar("<a href=\"x\">ñ & más</a>");
        assert!(!c.contains('<') && !c.contains(' ') && !c.contains('"') && !c.contains('&'));
        assert!(c.contains("%C3%B1"), "los bytes de la ñ van en UTF-8");
    }

    #[test]
    fn los_ids_vistos_no_suenan_dos_veces() {
        assert!(vistos().apuntar("prueba-llamada-entrante-1"));
        assert!(!vistos().apuntar("prueba-llamada-entrante-1"));
    }
}
