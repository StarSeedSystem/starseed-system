// ═══════════════════════════════════════════════════════════════════════════
// origen_local — pegamento del origen ESTABLE y del rescate entre puertos (NOT1108A, 2026-11-08).
// ---------------------------------------------------------------------------
// Contrato: architecture/apps-autonomas-sin-internet.md §2.2. Lógica pura: origen_local_logica.rs.
//
//   · `elegir_puerto`: el principal del registro (o el de este arranque, en un reinicio del Node) con
//     10 s de espera antes de cambiar de origen. Lo usan escritorio (servidor_local.rs) y Android
//     (servidor_local_android.rs).
//   · `tras_servir`: apunta en `<app_data>/servidor-local-origen.json` el puerto que sirvió.
//   · `rescatar`: ANTES de lanzar el Node en el puerto elegido, si otros orígenes del servidor local
//     guardan datos más nuevos que su último rescate, Rust abre un mini servidor (solo 127.0.0.1, solo
//     dos páginas, unos segundos) en cada puerto viejo y en el actual, lleva la ventana por ellos
//     (exportar → importar) y la devuelve a la página de arranque. Los datos pasan por la memoria de la
//     app (comandos `rescate_origen_*`, solo la ventana «main» y solo desde la página que toca): nunca
//     al disco. Si algo falla, se sigue como siempre y se reintenta el siguiente arranque (3 veces).
//   · `origen_local_estado`: el registro y el último rescate, para Ajustes y el diagnóstico.
// ═══════════════════════════════════════════════════════════════════════════

#![cfg_attr(not(desktop), allow(dead_code))]

use crate::origen_local_logica as o;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

/// La biblioteca de la migración (exportar/importar con sus reglas) y el guion del rescate.
const BIBLIOTECA_JS: &str = include_str!("../../servidor-local/migracion-origen.js");
const GUION_JS: &str = include_str!("../../servidor-local/rescate-origen.js");
/// Tope de trozos por origen (1 MiB cada uno) y de cada trozo (caracteres).
const MAX_TROZOS: u32 = 256;
const MAX_TROZO: usize = 2 * 1024 * 1024;

fn ahora_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

// ───────────────────────────── Registro en disco ─────────────────────────────

fn ruta_registro(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join(o::ARCHIVO_REGISTRO))
}

pub fn leer(app: &AppHandle) -> o::RegistroOrigen {
    ruta_registro(app)
        .and_then(|r| std::fs::read_to_string(r).ok())
        .map(|t| o::leer_registro(&t))
        .unwrap_or_default()
}

fn guardar(app: &AppHandle, r: &o::RegistroOrigen) {
    let Some(ruta) = ruta_registro(app) else { return };
    if let Some(dir) = ruta.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let tmp = ruta.with_extension("json.tmp");
    if std::fs::write(&tmp, o::escribir_registro(r)).is_ok() {
        let _ = std::fs::rename(&tmp, &ruta);
    }
}

/// El puerto en el que servir: `en_memoria` (el de este arranque de la app, en un reinicio del Node) o el
/// principal del registro, esperado hasta 10 s; luego los demás de los diez fijos.
pub fn elegir_puerto(app: &AppHandle, en_memoria: Option<u16>, libre: impl FnMut(u16) -> bool) -> Option<u16> {
    let preferido = en_memoria.or_else(|| leer(app).principal);
    o::elegir(&o::candidatos(preferido), o::REINTENTOS_PRINCIPAL, libre, || {
        std::thread::sleep(Duration::from_millis(o::PAUSA_PRINCIPAL_MS))
    })
}

/// Apunta que `puerto` sirvió (y fija el principal la primera vez). Devuelve si fue un cambio de origen.
pub fn tras_servir(app: &AppHandle, puerto: u16) -> bool {
    let previo = leer(app);
    let nuevo = o::tras_servir(&previo, puerto, ahora_ms());
    let cambio = nuevo.cambios > previo.cambios;
    guardar(app, &nuevo);
    cambio
}

// ───────────────────────────── Estado del rescate ─────────────────────────────

#[derive(Default)]
struct Exportado {
    id: String,
    trozos: Vec<Option<String>>,
    vacio: bool,
    error: Option<String>,
    completo: bool,
}

#[derive(Default)]
struct Rescate {
    /// Puerto del origen actual (donde se importa).
    actual: u16,
    /// Origen viejo cuya página de exportar está abierta ahora.
    exportando: Option<u16>,
    /// Ya se puede importar (la ventana va a la página del origen actual).
    importando: bool,
    exportados: HashMap<u16, Exportado>,
    /// Resultados que confirmó la página de importar.
    confirmado: Option<Vec<ResultadoFuente>>,
}

fn rescate() -> &'static Mutex<Option<Rescate>> {
    static R: OnceLock<Mutex<Option<Rescate>>> = OnceLock::new();
    R.get_or_init(|| Mutex::new(None))
}

fn con_rescate<T>(f: impl FnOnce(&mut Option<Rescate>) -> T) -> T {
    let mut g = match rescate().lock() {
        Ok(g) => g,
        Err(e) => e.into_inner(),
    };
    f(&mut g)
}

fn ultimo() -> &'static Mutex<Option<String>> {
    static U: OnceLock<Mutex<Option<String>>> = OnceLock::new();
    U.get_or_init(|| Mutex::new(None))
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct ResultadoFuente {
    pub puerto: u16,
    pub ok: bool,
    pub motivo: Option<String>,
    pub resumen: Option<serde_json::Value>,
}

#[derive(Serialize, Clone, Debug)]
pub struct FuenteImportar {
    pub puerto: u16,
    pub partes: u32,
}

#[derive(Serialize, Clone, Debug)]
pub struct EstadoImportar {
    pub actual: u16,
    pub fuentes: Vec<FuenteImportar>,
}

#[derive(Serialize, Clone, Debug)]
pub struct EstadoOrigenLocal {
    /// Puerto del origen principal (None: esta app aún no sirvió en local).
    pub principal: Option<u16>,
    /// El último que sirvió.
    pub ultimo_puerto: Option<u16>,
    pub puertos_usados: Vec<u16>,
    pub cambios: u32,
    /// Lo último que hizo el rescate, en una frase (None: nunca hizo falta en este arranque).
    pub ultimo_rescate: Option<String>,
}

// ───────────────────────────── Comandos (la página del rescate) ─────────────────────────────

fn url_de(webview: &tauri::Webview) -> Result<String, String> {
    if webview.label() != "main" {
        return Err("Esta ventana no puede hacer esto.".into());
    }
    webview.url().map(|u| u.to_string()).map_err(|e| e.to_string())
}

/// La página de exportar (origen viejo) manda lo que guarda, por trozos.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn rescate_origen_exportar(
    webview: tauri::Webview,
    id: String,
    indice: u32,
    total: u32,
    trozo: String,
    vacio: bool,
    error: Option<String>,
) -> Result<(), String> {
    let url = url_de(&webview)?;
    con_rescate(|r| {
        let r = r.as_mut().ok_or("No hay ningún rescate en curso.")?;
        let de = r.exportando.ok_or("No hay ningún origen exportándose.")?;
        if !o::es_pagina(&url, de, o::RUTA_EXPORTAR) {
            return Err("Este origen no puede hacer esto.".into());
        }
        if total > MAX_TROZOS || trozo.len() > MAX_TROZO || (total > 0 && indice >= total) {
            return Err("Trozo fuera de los topes.".into());
        }
        let e = r.exportados.entry(de).or_default();
        if e.id != id {
            *e = Exportado { id, ..Default::default() };
        }
        if let Some(err) = error {
            e.error = Some(err.chars().take(300).collect());
            e.completo = true;
            return Ok(());
        }
        if total == 0 {
            e.error = Some("exportación vacía sin trozos".into());
            e.completo = true;
            return Ok(());
        }
        if e.trozos.len() != total as usize {
            e.trozos = vec![None; total as usize];
        }
        e.vacio = vacio;
        e.trozos[indice as usize] = Some(trozo);
        e.completo = e.trozos.iter().all(Option::is_some);
        Ok(())
    })
}

/// La página de importar (origen actual) pregunta qué hay que traer.
#[tauri::command]
pub fn rescate_origen_estado(webview: tauri::Webview) -> Result<EstadoImportar, String> {
    let url = url_de(&webview)?;
    con_rescate(|r| {
        let r = r.as_ref().ok_or("No hay ningún rescate en curso.")?;
        if !r.importando || !o::es_pagina(&url, r.actual, o::RUTA_IMPORTAR) {
            return Err("Este origen no puede hacer esto.".into());
        }
        let mut fuentes: Vec<FuenteImportar> = r
            .exportados
            .iter()
            .filter(|(_, e)| e.completo && !e.vacio && e.error.is_none())
            .map(|(p, e)| FuenteImportar { puerto: *p, partes: e.trozos.len() as u32 })
            .collect();
        fuentes.sort_by_key(|f| f.puerto);
        Ok(EstadoImportar { actual: r.actual, fuentes })
    })
}

#[tauri::command]
pub fn rescate_origen_datos(webview: tauri::Webview, puerto: u16, indice: u32) -> Result<String, String> {
    let url = url_de(&webview)?;
    con_rescate(|r| {
        let r = r.as_ref().ok_or("No hay ningún rescate en curso.")?;
        if !r.importando || !o::es_pagina(&url, r.actual, o::RUTA_IMPORTAR) {
            return Err("Este origen no puede hacer esto.".into());
        }
        r.exportados
            .get(&puerto)
            .and_then(|e| e.trozos.get(indice as usize))
            .and_then(|t| t.clone())
            .ok_or_else(|| "Ese trozo no existe.".into())
    })
}

#[tauri::command]
pub fn rescate_origen_confirmar(webview: tauri::Webview, resultados: Vec<ResultadoFuente>) -> Result<(), String> {
    let url = url_de(&webview)?;
    con_rescate(|r| {
        let r = r.as_mut().ok_or("No hay ningún rescate en curso.")?;
        if !r.importando || !o::es_pagina(&url, r.actual, o::RUTA_IMPORTAR) {
            return Err("Este origen no puede hacer esto.".into());
        }
        r.confirmado = Some(resultados.into_iter().take(16).collect());
        Ok(())
    })
}

/// El registro del origen y el último rescate (Ajustes y diagnóstico).
#[tauri::command]
pub fn origen_local_estado(app: AppHandle) -> EstadoOrigenLocal {
    let r = leer(&app);
    EstadoOrigenLocal {
        principal: r.principal,
        ultimo_puerto: r.usos.last().map(|u| u.puerto),
        puertos_usados: r.usos.iter().map(|u| u.puerto).collect(),
        cambios: r.cambios,
        ultimo_rescate: ultimo().lock().ok().and_then(|g| g.clone()),
    }
}

// ───────────────────────────── Mini servidor ─────────────────────────────

/// Sirve las dos páginas del rescate en 127.0.0.1:<puerto> mientras vive. Se cierra al soltarse.
struct MiniServidor {
    parar: Arc<AtomicBool>,
    hilo: Option<std::thread::JoinHandle<()>>,
}

impl MiniServidor {
    fn abrir(puerto: u16, html: Arc<String>) -> std::io::Result<MiniServidor> {
        let oyente = TcpListener::bind(("127.0.0.1", puerto))?;
        oyente.set_nonblocking(true)?;
        let parar = Arc::new(AtomicBool::new(false));
        let p = parar.clone();
        let hilo = std::thread::Builder::new().name("rescate-origen".into()).spawn(move || {
            while !p.load(Ordering::SeqCst) {
                match oyente.accept() {
                    Ok((s, _)) => {
                        let h = html.clone();
                        let _ = std::thread::Builder::new().name("rescate-origen-conexion".into()).spawn(move || atender(s, &h));
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(25)),
                    Err(_) => std::thread::sleep(Duration::from_millis(100)),
                }
            }
        })?;
        Ok(MiniServidor { parar, hilo: Some(hilo) })
    }
}

impl Drop for MiniServidor {
    fn drop(&mut self) {
        self.parar.store(true, Ordering::SeqCst);
        if let Some(h) = self.hilo.take() {
            let _ = h.join();
        }
    }
}

fn atender(mut s: TcpStream, html: &str) {
    // En macOS/BSD la conexión aceptada hereda el «no bloqueante» del oyente.
    let _ = s.set_nonblocking(false);
    let _ = s.set_read_timeout(Some(Duration::from_secs(3)));
    let _ = s.set_write_timeout(Some(Duration::from_secs(3)));
    let mut buf = Vec::with_capacity(2048);
    let mut trozo = [0u8; 1024];
    while buf.len() < 16 * 1024 {
        match s.read(&mut trozo) {
            Ok(0) | Err(_) => break,
            Ok(n) => {
                buf.extend_from_slice(&trozo[..n]);
                if buf.windows(4).any(|w| w == b"\r\n\r\n") {
                    break;
                }
            }
        }
    }
    let cabeza = String::from_utf8_lossy(&buf);
    let respuesta = match o::leer_peticion(&cabeza) {
        Some((metodo, ruta)) => o::respuesta(&metodo, &ruta, html),
        None => o::respuesta("BAD", "/", ""),
    };
    let _ = s.write_all(&respuesta);
    let _ = s.flush();
}

fn puerto_libre(puerto: u16) -> bool {
    TcpListener::bind(("127.0.0.1", puerto)).is_ok()
}

// ───────────────────────────── El rescate ─────────────────────────────

fn navegar(app: &AppHandle, url: &str) -> bool {
    let (Some(v), Ok(u)) = (app.get_webview_window("main"), tauri::Url::parse(url)) else { return false };
    v.navigate(u).is_ok()
}

/// ¿La ventana está en la página de arranque de la app (y no en una web)? Solo desde ahí se hace el rescate.
pub fn es_pagina_arranque(url: &str) -> bool {
    let u = url.to_ascii_lowercase();
    u.starts_with("tauri://") || u.starts_with("http://tauri.localhost") || u.starts_with("https://tauri.localhost") || u == "about:blank"
}

/// Espera a que `listo()` diga que sí (o al tope). Devuelve si llegó.
fn esperar(tope: Duration, mut listo: impl FnMut() -> bool) -> bool {
    let fin = Instant::now() + tope;
    while Instant::now() < fin {
        if listo() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    listo()
}

/// Antes de lanzar el Node en `actual`: trae a ese origen lo que guardan los orígenes viejos del servidor
/// local (si hace falta). Bloquea como mucho `ESPERA_RESCATE_MS`. `avisar` cuenta lo que pasa en la página
/// de arranque. Devuelve una frase para el registro (None: no hacía falta).
pub fn rescatar(app: &AppHandle, actual: u16, avisar: impl Fn(&str)) -> Option<String> {
    let registro = leer(app);
    let fuentes = o::fuentes_rescate(&registro, actual);
    if fuentes.is_empty() {
        return None;
    }
    let ventana = app.get_webview_window("main")?;
    let volver = ventana.url().ok()?;
    if !es_pagina_arranque(volver.as_str()) {
        // La ventana ya está en otra parte (una web, un inicio de sesión): no se la secuestra.
        return Some("rescate pospuesto: la ventana no estaba en la página de arranque".into());
    }
    let inicio = Instant::now();
    let html = Arc::new(o::pagina(BIBLIOTECA_JS, GUION_JS));
    con_rescate(|r| *r = Some(Rescate { actual, ..Default::default() }));
    let sondeo = !registro.sondeados;
    let mut resultados: Vec<(u16, o::Rescate)> = Vec::new();
    let mut con_datos: Vec<u16> = Vec::new();

    for &q in &fuentes {
        if inicio.elapsed() > Duration::from_millis(o::ESPERA_RESCATE_MS / 2) {
            break;
        }
        if !puerto_libre(q) {
            resultados.push((q, o::Rescate::Ocupado));
            continue;
        }
        let Ok(servidor) = MiniServidor::abrir(q, html.clone()) else {
            resultados.push((q, o::Rescate::Ocupado));
            continue;
        };
        con_rescate(|r| {
            if let Some(r) = r.as_mut() {
                r.exportando = Some(q);
            }
        });
        avisar(&format!("Buscando tus datos en el puerto {q} de esta app…"));
        navegar(app, &o::url_exportar(q, actual));
        let llego = esperar(Duration::from_millis(o::ESPERA_EXPORTAR_MS), || {
            con_rescate(|r| r.as_ref().and_then(|r| r.exportados.get(&q)).is_some_and(|e| e.completo))
        });
        drop(servidor);
        let (vacio, error) = con_rescate(|r| {
            let e = r.as_ref().and_then(|r| r.exportados.get(&q));
            (e.is_some_and(|e| e.vacio), e.and_then(|e| e.error.clone()))
        });
        match (llego, vacio, error) {
            (true, true, None) => resultados.push((q, o::Rescate::Hecho)),
            (true, false, None) => con_datos.push(q),
            _ => resultados.push((q, o::Rescate::Fallido)),
        }
    }

    let mut frase = String::new();
    if !con_datos.is_empty() {
        match MiniServidor::abrir(actual, html.clone()) {
            Ok(servidor) => {
                con_rescate(|r| {
                    if let Some(r) = r.as_mut() {
                        r.exportando = None;
                        r.importando = true;
                    }
                });
                avisar("Trayendo aquí tus datos del puerto anterior…");
                navegar(app, &o::url_importar(actual));
                esperar(Duration::from_millis(o::ESPERA_IMPORTAR_MS), || {
                    con_rescate(|r| r.as_ref().is_some_and(|r| r.confirmado.is_some()))
                });
                drop(servidor);
                let confirmado = con_rescate(|r| r.as_ref().and_then(|r| r.confirmado.clone())).unwrap_or_default();
                for q in &con_datos {
                    let ok = confirmado.iter().any(|c| c.puerto == *q && c.ok);
                    resultados.push((*q, if ok { o::Rescate::Hecho } else { o::Rescate::Fallido }));
                }
                let traidos: Vec<String> = confirmado
                    .iter()
                    .filter(|c| c.ok)
                    .map(|c| {
                        let n = c.resumen.as_ref().and_then(|x| x.get("mensajesMalla")).and_then(|x| x.as_u64()).unwrap_or(0);
                        let a = c.resumen.as_ref().and_then(|x| x.pointer("/ajustes/traidos")).and_then(|x| x.as_u64()).unwrap_or(0);
                        format!("{} ({a} ajustes, {n} mensajes de la malla)", c.puerto)
                    })
                    .collect();
                frase = if traidos.is_empty() {
                    format!("no se pudieron traer los datos de {:?}", con_datos)
                } else {
                    format!("traído de {}", traidos.join(", "))
                };
            }
            Err(e) => {
                for q in &con_datos {
                    resultados.push((*q, o::Rescate::Fallido));
                }
                frase = format!("el puerto {actual} no se pudo abrir para importar: {e}");
            }
        }
    }

    // Registro: un resultado por origen; el sondeo de la primera vez, hecho.
    let ahora = ahora_ms();
    let mut nuevo = leer(app);
    for (q, res) in &resultados {
        if !nuevo.usos.iter().any(|u| u.puerto == *q) && matches!(res, o::Rescate::Fallido | o::Rescate::Ocupado) && sondeo {
            // Un origen sin registro que falló u ocupado: se apunta para reintentarlo (con su tope de intentos).
            nuevo.usos.insert(0, o::UsoPuerto { puerto: *q, desde_ms: 0, hasta_ms: 1, rescatado_ms: 0, intentos: 0 });
        }
        nuevo = o::tras_rescate(&nuevo, *q, res, ahora);
    }
    if sondeo {
        nuevo = o::tras_sondeo(&nuevo);
    }
    guardar(app, &nuevo);
    con_rescate(|r| *r = None);

    navegar(app, volver.as_str());
    std::thread::sleep(Duration::from_millis(400));

    let ocupados: Vec<u16> = resultados.iter().filter(|(_, r)| *r == o::Rescate::Ocupado).map(|(q, _)| *q).collect();
    let vacios = resultados.iter().filter(|(q, r)| *r == o::Rescate::Hecho && !con_datos.contains(q)).count();
    let resumen = format!(
        "rescate de origen en {} ms hacia {}: {}{} vacíos{}",
        inicio.elapsed().as_millis(),
        o::origen(actual),
        if frase.is_empty() { String::new() } else { format!("{frase}; ") },
        vacios,
        if ocupados.is_empty() { String::new() } else { format!("; ocupados (se reintenta): {ocupados:?}") }
    );
    if let Ok(mut g) = ultimo().lock() {
        *g = Some(resumen.clone());
    }
    Some(resumen)
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn el_mini_servidor_solo_da_sus_dos_paginas_y_se_cierra() {
        // Un puerto libre cualquiera (no los diez: la prueba no debe chocar con una app abierta).
        let puerto = {
            let l = TcpListener::bind(("127.0.0.1", 0)).unwrap();
            l.local_addr().unwrap().port()
        };
        let html = Arc::new(o::pagina("var a=1;", "var b=2;"));
        let s = MiniServidor::abrir(puerto, html).unwrap();
        let pedir = |linea: &str| {
            let mut c = TcpStream::connect(("127.0.0.1", puerto)).unwrap();
            c.write_all(format!("{linea}\r\nHost: 127.0.0.1\r\n\r\n").as_bytes()).unwrap();
            let mut r = String::new();
            let _ = c.read_to_string(&mut r);
            r
        };
        let ok = pedir("GET /__starseed/rescate-origen/exportar?a=47610 HTTP/1.1");
        assert!(ok.starts_with("HTTP/1.1 200 OK"), "{ok}");
        assert!(ok.contains("var b=2;"));
        assert!(pedir("GET /api/mando HTTP/1.1").starts_with("HTTP/1.1 404"));
        assert!(pedir("POST /__starseed/rescate-origen/importar HTTP/1.1").starts_with("HTTP/1.1 405"));
        drop(s);
        // Cerrado: el puerto vuelve a estar libre (lo usará el Node).
        assert!(puerto_libre(puerto));
    }

    #[test]
    fn la_pagina_lleva_la_biblioteca_y_el_guion_reales() {
        let p = o::pagina(BIBLIOTECA_JS, GUION_JS);
        assert!(p.contains("StarseedMigracionOrigen"));
        assert!(p.contains("StarseedRescateOrigen"));
        assert!(p.contains("rescate_origen_exportar"));
        // Ningún `</script>` de los guiones corta la página antes de tiempo.
        assert_eq!(p.matches("</script>").count(), 2);
    }

    #[cfg(desktop)]
    #[test]
    fn los_diez_puertos_son_los_del_servidor_local() {
        assert_eq!(o::PUERTOS, crate::servidor_local_logica::PUERTOS);
    }

    #[test]
    fn pagina_de_arranque() {
        assert!(es_pagina_arranque("tauri://localhost/index.html"));
        assert!(es_pagina_arranque("http://tauri.localhost/index.html"));
        assert!(!es_pagina_arranque("http://127.0.0.1:47610/"));
        assert!(!es_pagina_arranque("https://accounts.google.com/"));
    }
}
