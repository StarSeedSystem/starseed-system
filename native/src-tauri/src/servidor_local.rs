// ═══════════════════════════════════════════════════════════════════════════
// servidor_local — la app de escritorio de StarSeed OS funciona SIN internet (APP1107A, 2026-11-07).
// ---------------------------------------------------------------------------
// Contrato: architecture/apps-autonomas-sin-internet.md. Lógica pura: servidor_local_logica.rs.
//
// Al arrancar (solo StarSeed OS, solo escritorio): si la app trae su paquete (Node + build
// standalone de Next), lanza `starseed-node starseed-arranque.cjs` escuchando SOLO en
// 127.0.0.1:<puerto fijo>, espera a que responda con SU firma (tope de 60 s), lleva la ventana a
// `http://127.0.0.1:<puerto>/`, lo vigila (si muere, lo reinicia en el mismo puerto con pausas y
// tope) y lo apaga al salir. Mientras tanto la ventana enseña la página de arranque local
// (`native/arranque/index.html`, sin red). Si el paquete falta o no arranca, la app hace lo de
// siempre —abrir la web publicada— y lo dice; sin internet, lo dice y reintenta.
//
// (SEG1107A · T11) La ventana entra con un PASE de este arranque de la app: Rust lo genera una vez,
// se lo da al envoltorio como primera línea de su entrada estándar y lleva la ventana a
// `/__starseed/entrar?t=<pase>`, que pone la cookie que exige el servidor local para /api/* y para
// todo lo que cambie estado (`native/servidor-local/guarda.cjs`). Ninguna otra web ni otro programa
// lo conoce; nunca va al entorno, al registro ni a la web (`servidor_local_estado` no lo incluye).
//
// (CAP1107A · T1) Lo que sirve puede ser una CAPA más nueva que la del instalador
// (`servidor_capas.rs`): cada arranque del Node elige pendiente a prueba → activa → anterior →
// instalador. Una capa a prueba que no da «listo» en 60 s, o que se cae en sus primeros 30 s, se
// marca mala y se relanza al momento con la anterior (sin contarlo como caída). «Actualizar ahora»
// (`servidor_local_actualizar`) reinicia SOLO el Node en el mismo puerto y recarga la página: misma
// ventana, mismo origen y mismo pase.
//
// Nada de dependencias nuevas: procesos con std::process, salud con un TcpStream.
// ═══════════════════════════════════════════════════════════════════════════

use crate::servidor_capas_logica as c;
use crate::servidor_local_logica as l;
use serde::Serialize;
use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

/// Lo que la web puede leer (`invoke('servidor_local_estado')`).
#[derive(Serialize, Clone, Debug, Default)]
pub struct EstadoServidorLocal {
    /// "apagado" | "arrancando" | "local" | "reiniciando" | "web-publicada" | "sin-internet" | "otro-sistema"
    pub fase: String,
    pub puerto: Option<u16>,
    /// `http://127.0.0.1:<puerto>` cuando sirve en local.
    pub origen: Option<String>,
    /// Por qué no está en local (o qué pasó la última vez), en una frase.
    pub motivo: Option<String>,
    pub reinicios: u32,
    /// Versión del paquete (de `starseed-servidor.json`, la escribe el CI).
    pub version_paquete: Option<String>,
    /// Commit del que salió el paquete.
    pub commit_paquete: Option<String>,
    /// Registro del servidor en esta máquina.
    pub registro: Option<String>,
    /// (CAP1107A · T1) Capa del servidor que sirve: su build, o None si sirve el paquete del instalador.
    pub capa: Option<String>,
    /// Capa nueva ya descargada y verificada: la usa el siguiente arranque o «Actualizar ahora».
    pub capa_nueva: Option<String>,
    /// Versión (y commit corto) de esa capa nueva.
    pub capa_nueva_version: Option<String>,
    /// "buscando" | "descargando" | "verificando" | "lista" | "al-dia" | "sin-red" | "error"
    pub capas_fase: Option<String>,
    /// Lo último que pasó con las capas (p. ej. una vuelta atrás), en una frase.
    pub capas_aviso: Option<String>,
}

struct Proceso {
    hijo: Child,
    /// Mientras esté abierta, el envoltorio sabe que la app vive; si la app muere (aunque sea de
    /// golpe), el sistema la cierra y el Node sale solo.
    entrada: Option<ChildStdin>,
}

struct Interno {
    estado: Mutex<EstadoServidorLocal>,
    proceso: Mutex<Option<Proceso>>,
    apagando: AtomicBool,
    /// URL de la página de arranque (la del primer momento de la ventana), para volver a ella.
    url_arranque: Mutex<Option<tauri::Url>>,
    /// (SEG1107A) Pase de la ventana: uno por arranque de la app (se mantiene en los reinicios del
    /// Node, que no recargan la página). Nunca sale de aquí salvo al envoltorio y a la URL de entrada.
    pase: String,
    /// (CAP1107A) «Actualizar ahora»: el próximo cierre del Node no es una caída, es un relevo de capa.
    reinicio_pedido: AtomicBool,
}

fn interno() -> &'static Interno {
    static I: OnceLock<Interno> = OnceLock::new();
    I.get_or_init(|| Interno {
        estado: Mutex::new(EstadoServidorLocal { fase: "apagado".into(), ..Default::default() }),
        proceso: Mutex::new(None),
        apagando: AtomicBool::new(false),
        url_arranque: Mutex::new(None),
        pase: l::pase_nuevo(),
        reinicio_pedido: AtomicBool::new(false),
    })
}

fn con_estado(f: impl FnOnce(&mut EstadoServidorLocal)) {
    if let Ok(mut e) = interno().estado.lock() {
        f(&mut e);
    }
}

fn ahora_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Estado actual del servidor local de esta app (y de sus capas).
#[tauri::command]
pub fn servidor_local_estado() -> EstadoServidorLocal {
    let mut e = interno().estado.lock().map(|e| e.clone()).unwrap_or_default();
    let p = crate::servidor_capas::publico();
    e.capa_nueva = p.nueva;
    e.capa_nueva_version = p.nueva_version;
    e.capas_fase = p.fase;
    e.capas_aviso = p.aviso;
    e
}

/// (CAP1107A · T1) «Actualizar ahora»: reinicia SOLO el Node con la capa nueva ya verificada, en el
/// mismo puerto; la app no se cierra y la página se recarga sola al estar lista. Solo la ventana
/// principal, desde el servidor local (capability `servidor-capas`: nunca la web publicada).
#[tauri::command]
pub fn servidor_local_actualizar(webview: tauri::Webview) -> Result<String, String> {
    let e = servidor_local_estado();
    let puerto = e.puerto.filter(|_| e.fase == "local").ok_or("El servidor local no está sirviendo ahora.")?;
    if webview.label() != "main" {
        return Err("Esta ventana no puede hacer esto.".into());
    }
    let url = webview.url().map_err(|x| x.to_string())?;
    if !l::es_url_local(url.as_str(), puerto) {
        return Err("Solo la app, desde su servidor local, puede pedirlo.".into());
    }
    if !crate::servidor_capas::hay_pendiente() {
        return Err("No hay ninguna capa nueva lista.".into());
    }
    if interno().reinicio_pedido.swap(true, Ordering::SeqCst) {
        return Ok("Ya se está actualizando.".into());
    }
    let _ = std::thread::Builder::new().name("servidor-local-relevo".into()).spawn(detener_proceso);
    Ok("Reiniciando el servidor local con la capa nueva: la página se recargará sola.".into())
}

/// ¿Se está cerrando la app? (lo mira el vigía de las capas).
pub fn apagando() -> bool {
    interno().apagando.load(Ordering::SeqCst)
}

// ───────────────────────────── Arranque ─────────────────────────────

/// Se llama desde el `setup` (solo escritorio). Nexus y Café siguen con su web: no llevan paquete.
pub fn iniciar(app: &AppHandle) {
    if !crate::nativa::es_starseed_os(app) {
        con_estado(|e| {
            e.fase = "otro-sistema".into();
            e.motivo = Some("Este portal se abre desde su web publicada: el servidor local es de StarSeed OS.".into());
        });
        return;
    }
    if let Some(v) = app.get_webview_window("main") {
        if let Ok(u) = v.url() {
            if let Ok(mut g) = interno().url_arranque.lock() {
                *g = Some(u);
            }
        }
    }
    let app = app.clone();
    let _ = std::thread::Builder::new().name("servidor-local".into()).spawn(move || arrancar(app));
}

fn arrancar(app: AppHandle) {
    con_estado(|e| e.fase = "arrancando".into());
    avisar(&app, "arrancando", "Preparando StarSeed OS en esta neurona…");

    let dir_exe = std::env::current_exe().ok().and_then(|p| p.parent().map(Path::to_path_buf));
    let dir_recursos = app.path().resource_dir().ok();
    let (Some(dir_exe), Some(dir_recursos)) = (dir_exe, dir_recursos) else {
        ir_a_web(&app, "No se encontró la carpeta de la app.".into());
        return;
    };
    let instalador = l::rutas_paquete(&dir_exe, &dir_recursos, std::env::consts::OS);
    if let Err(falta) = l::comprobar_paquete(&instalador, |p| p.exists()) {
        ir_a_web(&app, falta.explicar());
        return;
    }
    let registro = abrir_registro(&app);
    // (APP1107B · T4) La primera vez, traer lo que la app tenía en el origen de la web publicada.
    crate::migracion_origen::preparar(&app);
    // (CAP1107A · T1) Qué capas hay y con qué clave se verifican.
    crate::servidor_capas::preparar(&app, &instalador, registro.as_ref().and_then(|f| f.try_clone().ok()));

    let mut puerto_previo: Option<u16> = None;
    let mut caidas: Vec<u64> = Vec::new();
    let politica = l::PoliticaReinicio::default();
    // Tras un relevo de capa (o una vuelta atrás) con la ventana ya en el servidor local: recargarla.
    let mut recargar = false;
    loop {
        if interno().apagando.load(Ordering::SeqCst) {
            return;
        }
        let (eleccion, rutas) = crate::servidor_capas::elegir(&instalador);
        leer_manifiesto(&rutas.manifiesto);
        con_estado(|e| e.capa = eleccion.build().map(str::to_string));
        if let Some(b) = eleccion.build() {
            escribir_registro(
                registro.as_ref(),
                &format!("[servidor-local] capa {b}{}", if eleccion.a_prueba() { " (a prueba)" } else { "" }),
            );
        }
        let espera = if eleccion.a_prueba() { c::ESPERA_SALUD_MS } else { l::ESPERA_LISTO_MS };
        match lanzar_y_esperar(&rutas, registro.as_ref(), puerto_previo, espera) {
            Ok(puerto) => {
                crate::servidor_capas::tras_lista(&eleccion);
                let origen = l::origen_local(puerto);
                con_estado(|e| {
                    e.fase = "local".into();
                    e.puerto = Some(puerto);
                    e.origen = Some(origen.clone());
                    e.motivo = None;
                });
                if puerto_previo.is_some() && puerto_previo != Some(puerto) {
                    escribir_registro(registro.as_ref(), &format!(
                        "[servidor-local] el puerto {:?} estaba ocupado: ahora {puerto}. El origen cambia y con él el almacenamiento local de la web.",
                        puerto_previo
                    ));
                }
                puerto_previo = Some(puerto);
                avisar(&app, "local", "Listo: StarSeed OS funciona en esta neurona, con o sin internet.");
                let ya_local = ventana_en_local(&app, puerto);
                navegar_si_hace_falta(&app, puerto);
                if std::mem::take(&mut recargar) && ya_local {
                    recargar_ventana(&app);
                }
                crate::servidor_capas::iniciar_vigia(&app);
                let desde = Instant::now();
                vigilar();
                if interno().apagando.load(Ordering::SeqCst) {
                    return;
                }
                if interno().reinicio_pedido.swap(false, Ordering::SeqCst) {
                    // «Actualizar ahora»: no es una caída; se relanza al momento con la capa nueva.
                    con_estado(|e| {
                        e.fase = "arrancando".into();
                        e.motivo = Some("Reiniciando el servidor local con la capa nueva…".into());
                    });
                    escribir_registro(registro.as_ref(), "[servidor-local] relevo de capa pedido desde la app");
                    recargar = true;
                    continue;
                }
                if eleccion.a_prueba() && desde.elapsed() < Duration::from_millis(c::ESTABLE_MS) {
                    let motivo = format!("se cerró a los {} s de arrancar", desde.elapsed().as_secs());
                    crate::servidor_capas::tras_fallo(&eleccion, &motivo);
                    escribir_registro(registro.as_ref(), &format!("[servidor-local] la capa nueva {motivo}: se vuelve a la anterior"));
                    recargar = true;
                    continue;
                }
                caidas.push(ahora_ms());
                con_estado(|e| {
                    e.fase = "reiniciando".into();
                    e.reinicios += 1;
                    e.motivo = Some("El servidor local se cerró solo: reiniciándolo.".into());
                });
                escribir_registro(registro.as_ref(), "[servidor-local] el proceso terminó: se decide si reiniciar");
            }
            Err(fallo) => {
                let motivo = fallo.motivo;
                escribir_registro(registro.as_ref(), &format!("[servidor-local] no arrancó: {motivo}"));
                if fallo.de_la_capa && eleccion.a_prueba() {
                    // (CAP1107A) La capa nueva no pasó la salud: mala, y se relanza ya con la anterior.
                    crate::servidor_capas::tras_fallo(&eleccion, &motivo);
                    recargar = true;
                    continue;
                }
                caidas.push(ahora_ms());
                con_estado(|e| e.motivo = Some(motivo.clone()));
            }
        }
        match l::decidir_reinicio(&caidas, ahora_ms(), &politica) {
            l::Reinicio::Esperar(ms) => std::thread::sleep(Duration::from_millis(ms)),
            l::Reinicio::Rendirse if eleccion.build().is_some() => {
                // (CAP1107A) Una capa que se cae una y otra vez: mala; se vuelve a la anterior (o al
                // instalador) con la cuenta a cero, en vez de rendirse a la web publicada.
                crate::servidor_capas::tras_fallo(&eleccion, "se cayó varias veces seguidas");
                caidas.clear();
                recargar = true;
            }
            l::Reinicio::Rendirse => {
                let motivo = interno()
                    .estado
                    .lock()
                    .ok()
                    .and_then(|e| e.motivo.clone())
                    .unwrap_or_else(|| "El servidor local se cayó varias veces seguidas.".into());
                volver_a_arranque(&app);
                ir_a_web(&app, format!("{motivo} Se probó {} veces en 5 minutos.", caidas.len()));
                return;
            }
        }
    }
}

/// Por qué no arrancó, y si la culpa es de lo que se sirve (la capa) o del entorno (puertos, Node…).
struct Fallo {
    motivo: String,
    de_la_capa: bool,
}

fn fallo_entorno(motivo: String) -> Fallo {
    Fallo { motivo, de_la_capa: false }
}

/// Elige puerto, lanza el Node y espera (hasta `espera_ms`) a que conteste con su firma. Devuelve el puerto.
fn lanzar_y_esperar(
    rutas: &l::RutasPaquete,
    registro: Option<&File>,
    preferido: Option<u16>,
    espera_ms: u64,
) -> Result<u16, Fallo> {
    let candidatos = l::orden_puertos(preferido);
    let puerto = l::elegir_puerto(
        &candidatos,
        l::REINTENTOS_PREFERIDO,
        puerto_libre,
        || std::thread::sleep(Duration::from_millis(l::PAUSA_PREFERIDO_MS)),
    )
    .ok_or_else(|| fallo_entorno(format!("Los {} puertos del servidor local están ocupados.", l::PUERTOS.len())))?;

    let firma = l::firma_nueva();
    let mut cmd = Command::new(&rutas.node);
    cmd.arg(&rutas.script).current_dir(&rutas.dir).stdin(Stdio::piped());
    for v in l::ENTORNO_QUITAR {
        cmd.env_remove(v);
    }
    for (k, v) in l::entorno_hijo(puerto, &firma, l::WEB_PUBLICADA) {
        cmd.env(k, v);
    }
    match registro.and_then(|f| f.try_clone().ok()).zip(registro.and_then(|f| f.try_clone().ok())) {
        Some((salida, error)) => {
            cmd.stdout(Stdio::from(salida)).stderr(Stdio::from(error));
        }
        None => {
            cmd.stdout(Stdio::null()).stderr(Stdio::null());
        }
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW: que el Node no abra una consola negra.
        cmd.creation_flags(0x0800_0000);
    }
    escribir_registro(registro, &format!("[servidor-local] lanzando {} en {}", rutas.node.display(), l::origen_local(puerto)));
    let mut hijo = cmd.spawn().map_err(|e| fallo_entorno(format!("No se pudo lanzar el Node de la app: {e}")))?;
    let mut entrada = hijo.stdin.take();
    // (SEG1107A) El pase de la ventana, primera línea de la entrada estándar (que sigue abierta:
    // es también la señal de que la app vive). Sin él, el servidor no atiende /api ni cambios.
    let pase_enviado = entrada
        .as_mut()
        .map(|e| e.write_all(l::linea_pase(&interno().pase).as_bytes()).and_then(|_| e.flush()).is_ok())
        .unwrap_or(false);
    if !pase_enviado {
        escribir_registro(registro, "[servidor-local] no se pudo pasar el pase de la ventana al servidor local");
    }
    if let Ok(mut p) = interno().proceso.lock() {
        *p = Some(Proceso { hijo, entrada });
    }

    let tope = Instant::now() + Duration::from_millis(espera_ms);
    loop {
        if interno().apagando.load(Ordering::SeqCst) {
            return Err(fallo_entorno("La app se está cerrando.".into()));
        }
        if let Some(codigo) = proceso_termino() {
            return Err(Fallo { motivo: format!("El servidor local se cerró al arrancar ({codigo})."), de_la_capa: true });
        }
        match sondear_salud(puerto, &firma) {
            Some(l::Salud::Lista) => return Ok(puerto),
            Some(l::Salud::Ajena(por_que)) => {
                // Otro programa responde en ese puerto: jamás se lleva la ventana ahí.
                detener_proceso();
                return Err(fallo_entorno(format!("En {} responde otro programa: {por_que}.", l::origen_local(puerto))));
            }
            Some(l::Salud::Arrancando) | None => {}
        }
        if Instant::now() >= tope {
            detener_proceso();
            return Err(Fallo { motivo: format!("El servidor local no respondió en {} s.", espera_ms / 1000), de_la_capa: true });
        }
        std::thread::sleep(Duration::from_millis(l::PASO_SONDEO_MS));
    }
}

fn puerto_libre(puerto: u16) -> bool {
    TcpListener::bind((l::HOST, puerto)).is_ok()
}

fn sondear_salud(puerto: u16, firma: &str) -> Option<l::Salud> {
    let dir = std::net::SocketAddr::from(([127, 0, 0, 1], puerto));
    let mut s = TcpStream::connect_timeout(&dir, Duration::from_millis(800)).ok()?;
    let _ = s.set_read_timeout(Some(Duration::from_secs(2)));
    let _ = s.set_write_timeout(Some(Duration::from_secs(2)));
    s.write_all(l::peticion_salud(puerto).as_bytes()).ok()?;
    let mut buf = Vec::with_capacity(1024);
    let _ = s.take(64 * 1024).read_to_end(&mut buf);
    if buf.is_empty() {
        return None;
    }
    Some(l::interpretar_salud(&String::from_utf8_lossy(&buf), firma))
}

/// `Some(código)` si el proceso ya terminó (o no hay proceso).
fn proceso_termino() -> Option<String> {
    let mut g = interno().proceso.lock().ok()?;
    match g.as_mut() {
        None => Some("sin proceso".into()),
        Some(p) => match p.hijo.try_wait() {
            Ok(Some(st)) => Some(st.code().map(|c| format!("código {c}")).unwrap_or_else(|| "por señal".into())),
            Ok(None) => None,
            Err(e) => Some(e.to_string()),
        },
    }
}

/// Bloquea mientras el proceso vive (sondeo cada 500 ms) o hasta que la app se cierra.
fn vigilar() {
    loop {
        if interno().apagando.load(Ordering::SeqCst) || proceso_termino().is_some() {
            return;
        }
        std::thread::sleep(Duration::from_millis(500));
    }
}

/// Cierra la tubería (el envoltorio sale solo), espera un poco y, si sigue vivo, lo mata.
fn detener_proceso() {
    let Some(mut p) = interno().proceso.lock().ok().and_then(|mut g| g.take()) else { return };
    drop(p.entrada.take());
    let tope = Instant::now() + Duration::from_millis(1500);
    while Instant::now() < tope {
        if let Ok(Some(_)) = p.hijo.try_wait() {
            return;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    let _ = p.hijo.kill();
    let _ = p.hijo.wait();
}

/// Al salir de la app (RunEvent::Exit). Si la app muere de golpe, el envoltorio sale solo al
/// cerrarse su entrada estándar.
pub fn apagar() {
    interno().apagando.store(true, Ordering::SeqCst);
    detener_proceso();
    con_estado(|e| e.fase = "apagado".into());
}

// ───────────────────────────── Ventana ─────────────────────────────

fn avisar(app: &AppHandle, fase: &str, mensaje: &str) {
    if let Some(v) = app.get_webview_window("main") {
        let _ = v.eval(&l::script_aviso(fase, mensaje));
    }
}

/// Lleva la ventana al servidor local, salvo que ya esté en ese origen (un reinicio en el mismo
/// puerto no recarga la página: la persona no pierde lo que tenía abierto, y la cookie del pase
/// sigue valiendo porque el pase es del arranque de la app). Si toca traer los datos de la versión
/// anterior (APP1107B · T4), entra por la página importadora, que luego va a `/`.
fn navegar_si_hace_falta(app: &AppHandle, puerto: u16) {
    let Some(v) = app.get_webview_window("main") else { return };
    if let Ok(actual) = v.url() {
        if l::es_url_local(actual.as_str(), puerto) {
            return;
        }
    }
    // (SEG1107A) Siempre por la entrada: pone la cookie del pase y redirige a la ruta.
    let ruta = if crate::migracion_origen::ir_al_importador() { crate::migracion_origen::ruta_importador() } else { "/" };
    let destino = l::url_entrada(puerto, &interno().pase, ruta);
    if let Ok(url) = tauri::Url::parse(&destino) {
        let _ = v.navigate(url);
    }
}

/// ¿La ventana principal ya está en el servidor local de ese puerto?
fn ventana_en_local(app: &AppHandle, puerto: u16) -> bool {
    app.get_webview_window("main")
        .and_then(|v| v.url().ok())
        .is_some_and(|u| l::es_url_local(u.as_str(), puerto))
}

/// (CAP1107A) Tras un relevo de capa en el mismo puerto: recarga la página (sus scripts eran de la
/// capa anterior). La cookie del pase sigue valiendo: el pase es del arranque de la app.
fn recargar_ventana(app: &AppHandle) {
    if let Some(v) = app.get_webview_window("main") {
        let _ = v.eval("location.reload()");
    }
}

fn volver_a_arranque(app: &AppHandle) {
    let Some(v) = app.get_webview_window("main") else { return };
    let url = interno().url_arranque.lock().ok().and_then(|g| g.clone());
    if let Some(u) = url {
        let _ = v.navigate(u);
        std::thread::sleep(Duration::from_millis(600));
    }
}

/// Respaldo: la web publicada (lo de antes de esta versión). Sin internet, lo dice en la página de
/// arranque y reintenta cada 15 s hasta que haya red o la app se cierre.
fn ir_a_web(app: &AppHandle, motivo: String) {
    loop {
        if interno().apagando.load(Ordering::SeqCst) {
            return;
        }
        if hay_internet() {
            con_estado(|e| {
                e.fase = "web-publicada".into();
                e.puerto = None;
                e.origen = None;
                e.motivo = Some(motivo.clone());
            });
            avisar(app, "web-publicada", &format!("{motivo} Abriendo la web publicada…"));
            std::thread::sleep(Duration::from_millis(1200));
            if let (Some(v), Ok(url)) = (app.get_webview_window("main"), tauri::Url::parse(l::WEB_PUBLICADA)) {
                let _ = v.navigate(url);
            }
            return;
        }
        con_estado(|e| {
            e.fase = "sin-internet".into();
            e.motivo = Some(motivo.clone());
        });
        avisar(
            app,
            "sin-internet",
            &format!("{motivo} Y ahora no hay internet para abrir la web publicada: se vuelve a probar cada 15 s."),
        );
        std::thread::sleep(Duration::from_secs(15));
    }
}

pub(crate) fn hay_internet() -> bool {
    let host = l::WEB_PUBLICADA.trim_start_matches("https://");
    let Ok(direcciones) = (host, 443u16).to_socket_addrs() else { return false };
    direcciones.take(2).any(|d| TcpStream::connect_timeout(&d, Duration::from_secs(3)).is_ok())
}

// ───────────────────────────── Paquete y registro ─────────────────────────────

/// Versión y commit de lo que sirve (el `starseed-servidor.json` del instalador o de la capa).
fn leer_manifiesto(ruta: &Path) {
    let Ok(texto) = std::fs::read_to_string(ruta) else { return };
    let Ok(v) = serde_json::from_str::<serde_json::Value>(&texto) else { return };
    let campo = |k: &str| v.get(k).and_then(|x| x.as_str()).map(str::to_string);
    con_estado(|e| {
        e.version_paquete = campo("version");
        e.commit_paquete = campo("commit");
    });
}

fn abrir_registro(app: &AppHandle) -> Option<File> {
    let dir: PathBuf = app.path().app_log_dir().ok()?;
    std::fs::create_dir_all(&dir).ok()?;
    let ruta = dir.join(l::REGISTRO);
    if let Ok(m) = std::fs::metadata(&ruta) {
        if l::rotar_registro(m.len()) {
            let _ = std::fs::rename(&ruta, dir.join(format!("{}.1", l::REGISTRO)));
        }
    }
    let f = OpenOptions::new().create(true).append(true).open(&ruta).ok()?;
    con_estado(|e| e.registro = Some(ruta.display().to_string()));
    Some(f)
}

fn escribir_registro(registro: Option<&File>, linea: &str) {
    if let Some(mut f) = registro {
        let _ = writeln!(f, "{} {linea}", ahora_ms());
    }
}
