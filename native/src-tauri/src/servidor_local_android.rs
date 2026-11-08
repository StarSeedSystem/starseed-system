// ═══════════════════════════════════════════════════════════════════════════
// servidor_local_android — StarSeed OS sin internet DENTRO de la APK (AND1107A, 2026-11-07).
// ---------------------------------------------------------------------------
// Contrato: architecture/apps-autonomas-sin-internet.md §9.1. Lógica pura:
// servidor_local_android_logica.rs (y la común con escritorio: servidor_local_logica.rs).
//
// Solo se compila con el INTERRUPTOR de build (apagado por defecto): build.rs pone
// `--cfg starseed_servidor_android` cuando STARSEED_SERVIDOR_LOCAL_ANDROID=1 y el proyecto Android lo
// preparó native/servidor-local/preparar-android.mjs (libnode de nodejs-mobile en jniLibs, el
// servidor en assets, ServidorLocal.kt, el manifiesto y la red local en claro solo hacia 127.0.0.1).
//
// Cómo va (la misma arquitectura que escritorio, sin `std::process`):
//   1. Kotlin (`ArranqueServidorLocal`, al crearse el proceso) extrae `assets/servidor-local/servidor.zip`
//      a `noBackupFilesDir/servidor-local/<buildId>` la primera vez de cada versión, carga libnode.so y
//      cuenta cómo va por JNI (`ServidorLocal.nativoEstado`, líneas `clave=valor`).
//   2. Rust elige puerto (los diez fijos), firma nueva, y el PASE de la ventana por una TUBERÍA propia
//      (escribe `pase:<hex>` y la cierra; al Node solo le llega el número del descriptor en
//      STARSEED_ENTRADA_FD): nunca en el entorno. Fija el entorno (TMPDIR, HOME, caché de V8…) y arranca
//      `node::Start` (dlsym en libnode.so) en un hilo con el MISMO envoltorio que escritorio
//      (`starseed-arranque.cjs`, en modo STARSEED_EN_PROCESO).
//   3. Espera la salud con SU firma, y lleva la ventana a `/__starseed/entrar?t=<pase>&a=/`.
//   4. Vigila la salud. Node solo puede arrancar UNA vez por proceso: si se cae, la web publicada
//      (que el service worker v8 sirve sin conexión si ya precargó, §9.1.1).
// Cualquier fallo antes de «listo» → la web publicada, como hoy, y la página de arranque lo dice.
// Sin crates nuevos: JNI con la tabla de funciones (como android.rs) y dlopen/pipe/dup2 de bionic.
// ═══════════════════════════════════════════════════════════════════════════

use crate::pista_neurona;
use crate::servidor_local_android_logica as la;
use crate::servidor_local_logica as l;
use std::ffi::{c_char, c_int, c_void, CStr, CString};
use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::os::fd::{AsRawFd, FromRawFd};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

#[link(name = "dl")]
extern "C" {
    fn dlopen(nombre: *const c_char, flags: c_int) -> *mut c_void;
    fn dlsym(h: *mut c_void, simbolo: *const c_char) -> *mut c_void;
    fn dlerror() -> *const c_char;
}
extern "C" {
    fn pipe(fds: *mut c_int) -> c_int;
    fn dup2(viejo: c_int, nuevo: c_int) -> c_int;
}
/// bionic: RTLD_NOW vale 2 en 64 bits y 0 en 32 (dlfcn.h).
#[cfg(target_pointer_width = "64")]
const RTLD_NOW: c_int = 2;
#[cfg(not(target_pointer_width = "64"))]
const RTLD_NOW: c_int = 0;

type NodeStart = unsafe extern "C" fn(c_int, *mut *mut c_char) -> c_int;

/// (NOT1108A) Tope hasta «listo» cuando la puerta ya contesta «arrancando» (Next tarda en una tablet).
const ESPERA_LISTO_ARRANCANDO_MS: u64 = 300_000;

#[derive(Clone, Debug, PartialEq)]
enum Fase {
    Preparando(String),
    Local(u16),
    Respaldo(String),
}

struct Global {
    /// Lo último que contó Kotlin.
    paquete: Mutex<Option<la::EstadoPaquete>>,
    fase: Mutex<Fase>,
    /// El servidor se arranca UNA vez por proceso (node::Start no admite una segunda).
    arrancado: AtomicBool,
    /// Cada `setup` (la actividad puede recrearse) lanza un conductor de ventana; solo el último manda.
    generacion: AtomicU64,
    node_vivo: AtomicBool,
    node_codigo: Mutex<Option<i32>>,
    /// (SEG1107A) Pase de la ventana: uno por proceso; nunca sale de aquí salvo por la tubería del
    /// Node y en la URL de entrada.
    pase: String,
    registro: Mutex<Option<File>>,
}

fn g() -> &'static Global {
    static G: OnceLock<Global> = OnceLock::new();
    G.get_or_init(|| Global {
        paquete: Mutex::new(None),
        fase: Mutex::new(Fase::Preparando("Preparando StarSeed OS en esta neurona…".into())),
        arrancado: AtomicBool::new(false),
        generacion: AtomicU64::new(0),
        node_vivo: AtomicBool::new(false),
        node_codigo: Mutex::new(None),
        pase: l::pase_nuevo(),
        registro: Mutex::new(None),
    })
}

fn fase() -> Fase {
    g().fase.lock().map(|f| f.clone()).unwrap_or(Fase::Respaldo("estado interno inaccesible".into()))
}

fn fijar(f: Fase) {
    if let Ok(mut x) = g().fase.lock() {
        *x = f;
    }
}

fn ahora_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn registrar(linea: &str) {
    if let Ok(mut r) = g().registro.lock() {
        if let Some(f) = r.as_mut() {
            let _ = writeln!(f, "{} [servidor-local-android] {linea}", ahora_ms());
        }
    }
}

// ───────────────────────────── JNI (Kotlin → Rust) ─────────────────────────────

type Env = *mut *const *const c_void;
type GetUtf = unsafe extern "system" fn(Env, *mut c_void, *mut u8) -> *const c_char;
type RelUtf = unsafe extern "system" fn(Env, *mut c_void, *const c_char);

/// jstring → String con GetStringUTFChars/ReleaseStringUTFChars (jni.h, índices 169/170), como android.rs.
unsafe fn texto_jni(env: Env, s: *mut c_void) -> Option<String> {
    if env.is_null() || s.is_null() || (*env).is_null() {
        return None;
    }
    let tabla: *const *const c_void = *env;
    let get: GetUtf = std::mem::transmute(*tabla.add(169));
    let rel: RelUtf = std::mem::transmute(*tabla.add(170));
    let p = get(env, s, std::ptr::null_mut());
    if p.is_null() {
        return None;
    }
    let r = CStr::from_ptr(p).to_string_lossy().into_owned();
    rel(env, s, p);
    Some(r)
}

/// `ServidorLocal.nativoEstado(estado: String)` (Kotlin, @JvmStatic): cómo va la preparación.
#[no_mangle]
pub extern "system" fn Java_app_starseed_nativa_ServidorLocal_nativoEstado(env: Env, _clase: *mut c_void, estado: *mut c_void) {
    let Some(t) = (unsafe { texto_jni(env, estado) }) else { return };
    if let Ok(mut p) = g().paquete.lock() {
        *p = Some(la::leer_estado(&t));
    }
}

// ───────────────────────────── Arranque ─────────────────────────────

/// Desde el `setup` (solo con el interruptor). El servidor, una vez por proceso; la ventana, siempre.
pub fn iniciar(app: &AppHandle) {
    if !g().arrancado.swap(true, Ordering::SeqCst) {
        // (NOT1108A) El servidor necesita la app: registro del origen (puerto principal) y rescate.
        let a = app.clone();
        let _ = std::thread::Builder::new().name("servidor-local".into()).spawn(move || servidor(a));
    }
    let gen = g().generacion.fetch_add(1, Ordering::SeqCst) + 1;
    let app = app.clone();
    let _ = std::thread::Builder::new().name("servidor-local-ventana".into()).spawn(move || conducir(app, gen));
}

fn servidor(app: AppHandle) {
    let inicio = Instant::now();
    let paquete = loop {
        let e = g().paquete.lock().ok().and_then(|p| p.clone());
        match la::decidir(e.as_ref(), inicio.elapsed().as_millis() as u64) {
            la::Paso::Esperar(m) => fijar(Fase::Preparando(m)),
            la::Paso::Arrancar => break e.unwrap_or_default(),
            la::Paso::Respaldo(m) => {
                if let Some(e) = &e {
                    abrir_registro(e);
                }
                registrar(&format!("respaldo antes de arrancar: {m}"));
                fijar(Fase::Respaldo(m));
                return;
            }
        }
        std::thread::sleep(Duration::from_millis(250));
    };
    abrir_registro(&paquete);
    fijar(Fase::Preparando("Arrancando el servidor local…".into()));
    match arrancar_node(&app, &paquete) {
        Ok((puerto, firma)) => {
            registrar(&format!("listo en {}", l::origen_local(puerto)));
            // (NOT1108A) El registro del origen: el principal (la primera vez) y este uso.
            if crate::origen_local::tras_servir(&app, puerto) {
                registrar(&format!("AVISO: el puerto principal estaba ocupado; esta vez sirve {} (otro origen)", l::origen_local(puerto)));
            }
            fijar(Fase::Local(puerto));
            vigilar(puerto, &firma);
        }
        Err(m) => {
            registrar(&format!("no arrancó: {m}"));
            fijar(Fase::Respaldo(m));
        }
    }
}

fn abrir_registro(e: &la::EstadoPaquete) {
    let Some(ruta) = e.registro.clone() else { return };
    if let Some(dir) = ruta.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(m) = std::fs::metadata(&ruta) {
        if l::rotar_registro(m.len()) {
            let _ = std::fs::rename(&ruta, ruta.with_extension("log.1"));
        }
    }
    if let Ok(f) = OpenOptions::new().create(true).append(true).open(&ruta) {
        if let Ok(mut r) = g().registro.lock() {
            if r.is_none() {
                *r = Some(f);
            }
        }
    }
}

/// La salida del Node (y la de Next) al registro: en una app Android, la estándar va a /dev/null.
fn redirigir_salida() {
    if let Ok(r) = g().registro.lock() {
        if let Some(f) = r.as_ref() {
            let fd = f.as_raw_fd();
            unsafe {
                dup2(fd, 1);
                dup2(fd, 2);
            }
        }
    }
}

fn dlerror_texto() -> String {
    let p = unsafe { dlerror() };
    if p.is_null() {
        "sin detalle".into()
    } else {
        unsafe { CStr::from_ptr(p) }.to_string_lossy().into_owned()
    }
}

/// `node::Start` de libnode.so (ya cargada por Kotlin con System.loadLibrary: dlopen solo la encuentra).
fn simbolo_start() -> Result<NodeStart, String> {
    let lib = CString::new(la::LIBNODE).map_err(|e| e.to_string())?;
    let h = unsafe { dlopen(lib.as_ptr(), RTLD_NOW) };
    if h.is_null() {
        return Err(format!("No se pudo cargar {}: {}", la::LIBNODE, dlerror_texto()));
    }
    let s = CString::new(la::SIMBOLO_START).map_err(|e| e.to_string())?;
    let f = unsafe { dlsym(h, s.as_ptr()) };
    if f.is_null() {
        return Err(format!("{} no tiene node::Start: {}", la::LIBNODE, dlerror_texto()));
    }
    Ok(unsafe { std::mem::transmute::<*mut c_void, NodeStart>(f) })
}

/// (SEG1107A) El pase por una tubería propia: se escribe `pase:<hex>\n` y se cierra el extremo de
/// escritura; el Node (en este mismo proceso) lee el otro extremo por su número de descriptor.
fn tuberia_con_pase(pase: &str) -> Result<c_int, String> {
    let mut fds: [c_int; 2] = [-1, -1];
    if unsafe { pipe(fds.as_mut_ptr()) } != 0 {
        return Err(format!("No se pudo crear la tubería del pase: {}", std::io::Error::last_os_error()));
    }
    let mut w = unsafe { File::from_raw_fd(fds[1]) };
    let r = w.write_all(l::linea_pase(pase).as_bytes()).and_then(|_| w.flush());
    drop(w);
    if let Err(e) = r {
        drop(unsafe { File::from_raw_fd(fds[0]) });
        return Err(format!("No se pudo escribir el pase: {e}"));
    }
    Ok(fds[0])
}

fn puerto_libre(puerto: u16) -> bool {
    TcpListener::bind((l::HOST, puerto)).is_ok()
}

/// Arranca node::Start en su hilo y espera a que conteste con su firma. Devuelve (puerto, firma).
/// (NOT1108A) El puerto es el PRINCIPAL del registro del origen (esperado hasta 10 s; antes: siempre 47610 con
/// 3 s y, si no, el siguiente, sin recordarlo). Antes de node::Start, si otros orígenes del servidor local
/// guardan datos, se traen a este (`origen_local::rescatar`, desde la página de arranque).
fn arrancar_node(app: &AppHandle, p: &la::EstadoPaquete) -> Result<(u16, String), String> {
    let dir = p.dir.clone().ok_or("El servidor local no dice dónde está.")?;
    if let Some(f) = la::falta(&dir, |x| x.exists()) {
        return Err(format!("El servidor local está incompleto: falta {}.", f.display()));
    }
    let start = simbolo_start()?;
    let puerto = crate::origen_local::elegir_puerto(app, None, puerto_libre)
        .ok_or_else(|| format!("Los {} puertos del servidor local están ocupados.", l::PUERTOS.len()))?;
    if let Some(r) = crate::origen_local::rescatar(app, puerto, |m| fijar(Fase::Preparando(m.to_string()))) {
        registrar(&r);
    }
    let firma = l::firma_nueva();
    let fd = tuberia_con_pase(&g().pase)?;

    // El entorno lo lee Node al arrancar (setenv antes de node::Start, docs/EMBEDDING.md).
    for v in l::ENTORNO_QUITAR {
        std::env::remove_var(v);
    }
    for (k, v) in l::entorno_hijo(puerto, &firma, l::WEB_PUBLICADA) {
        std::env::set_var(k, v);
    }
    for (k, v) in la::entorno_extra(fd, p) {
        std::env::set_var(k, v);
    }
    if let Some(c) = &p.cache {
        let _ = std::fs::create_dir_all(c.join("node-compile-cache"));
    }
    let _ = std::env::set_current_dir(&dir);
    let args = la::argumentos(&dir.join(l::SCRIPT_ARRANQUE), la::limite_heap_mb(p.memoria));
    let (buf, inicios) = la::argv_contiguo(&args)?;
    registrar(&format!("arrancando node::Start ({}) en {}", args[1], l::origen_local(puerto)));
    redirigir_salida();

    g().node_vivo.store(true, Ordering::SeqCst);
    std::thread::Builder::new()
        .name("node".into())
        .stack_size(la::PILA_NODE)
        .spawn(move || {
            // El búfer y argv viven lo que el proceso: libuv puede reescribir esa memoria (título).
            let buf: &'static mut [u8] = Box::leak(buf.into_boxed_slice());
            let base = buf.as_mut_ptr() as *mut c_char;
            let mut argv: Vec<*mut c_char> = inicios.iter().map(|&o| unsafe { base.add(o) }).collect();
            let argc = argv.len() as c_int;
            argv.push(std::ptr::null_mut());
            let argv: &'static mut [*mut c_char] = Box::leak(argv.into_boxed_slice());
            let codigo = unsafe { start(argc, argv.as_mut_ptr()) };
            if let Ok(mut c) = g().node_codigo.lock() {
                *c = Some(codigo);
            }
            g().node_vivo.store(false, Ordering::SeqCst);
            registrar(&format!("node::Start terminó con código {codigo}"));
        })
        .map_err(|e| format!("No se pudo crear el hilo de Node: {e}"))?;

    let desde = Instant::now();
    // (NOT1108A) Si la puerta ya contesta «arrancando» (es nuestro Node y vive), se le dan hasta 5 min a Next
    // en vez de 2: rendirse aquí es abrir la web publicada, OTRO origen con otros datos y otra sesión.
    let mut tope_ms = la::ESPERA_LISTO_MS;
    loop {
        if !g().node_vivo.load(Ordering::SeqCst) {
            let c = g().node_codigo.lock().ok().and_then(|c| *c);
            return Err(format!("El servidor local se cerró al arrancar (código {}).", c.map(|c| c.to_string()).unwrap_or("?".into())));
        }
        match sondear_salud(puerto, &firma) {
            Some(l::Salud::Lista) => return Ok((puerto, firma)),
            Some(l::Salud::Ajena(por_que)) => {
                return Err(format!("En {} responde otro programa: {por_que}.", l::origen_local(puerto)));
            }
            Some(l::Salud::Arrancando) => tope_ms = tope_ms.max(ESPERA_LISTO_ARRANCANDO_MS),
            None => {}
        }
        if desde.elapsed() >= Duration::from_millis(tope_ms) {
            return Err(format!("El servidor local no respondió en {} s.", tope_ms / 1000));
        }
        std::thread::sleep(Duration::from_millis(l::PASO_SONDEO_MS));
    }
}

fn sondear_salud(puerto: u16, firma: &str) -> Option<l::Salud> {
    let dir = SocketAddr::from(([127, 0, 0, 1], puerto));
    let mut s = TcpStream::connect_timeout(&dir, Duration::from_millis(800)).ok()?;
    let _ = s.set_read_timeout(Some(Duration::from_secs(3)));
    let _ = s.set_write_timeout(Some(Duration::from_secs(3)));
    s.write_all(l::peticion_salud(puerto).as_bytes()).ok()?;
    let mut buf = Vec::with_capacity(1024);
    let _ = s.take(64 * 1024).read_to_end(&mut buf);
    if buf.is_empty() {
        return None;
    }
    Some(l::interpretar_salud(&String::from_utf8_lossy(&buf), firma))
}

/// Tras «listo»: si Node termina, la web publicada (Node no arranca dos veces en un proceso).
/// (NOT1108A) Una salud que falla con Node VIVO (la app en segundo plano, el sistema sin CPU para el hilo,
/// una recolección larga) ya no lleva la ventana a la web publicada: eso era cambiar de ORIGEN en silencio
/// (otro localStorage, otra sesión) y la persona creía haber perdido sus datos. Se apunta y se sigue mirando.
fn vigilar(puerto: u16, firma: &str) {
    let mut fallos = 0u32;
    loop {
        std::thread::sleep(Duration::from_millis(la::VIGIA_PASO_MS));
        if !g().node_vivo.load(Ordering::SeqCst) {
            fijar(Fase::Respaldo("El servidor local se detuvo.".into()));
            return;
        }
        match sondear_salud(puerto, firma) {
            Some(l::Salud::Lista) => {
                if fallos >= la::VIGIA_FALLOS {
                    registrar("la salud vuelve a responder");
                }
                fallos = 0;
            }
            _ => {
                fallos += 1;
                if fallos == la::VIGIA_FALLOS {
                    registrar("la salud falló varias veces seguidas con Node vivo: se sigue en el servidor local (sin cambiar de origen)");
                }
            }
        }
    }
}

// ───────────────────────────── Ventana ─────────────────────────────

fn avisar(v: &tauri::WebviewWindow, fase: &str, mensaje: &str) {
    let _ = v.eval(&l::script_aviso(fase, mensaje));
}

/// Cuenta lo que pasa en la página de arranque y lleva la ventana a donde toque. Solo saca de la
/// página de arranque (nunca de otra web: un inicio de sesión con OAuth, por ejemplo).
fn conducir(app: AppHandle, gen: u64) {
    let mut ultimo = String::new();
    // (NEU1108A) Paso por la web publicada para traer la pista del id de neurona (pista_neurona.rs).
    let mut pista_desde: Option<Instant> = None;
    loop {
        if g().generacion.load(Ordering::SeqCst) != gen {
            return;
        }
        let Some(v) = app.get_webview_window("main") else {
            std::thread::sleep(Duration::from_millis(250));
            continue;
        };
        let url = v.url().map(|u| u.to_string()).unwrap_or_default();
        match fase() {
            Fase::Preparando(m) => {
                if m != ultimo {
                    avisar(&v, "arrancando", &m);
                    ultimo = m;
                }
            }
            Fase::Local(puerto) => {
                if la::es_pagina_arranque(&url) && pista_desde.is_none() && pista_neurona::pendiente_en(&app) {
                    // (NEU1108A) Primer arranque con servidor local: antes, un momento por la web publicada
                    // para traer el id de neurona que esta app ya tenía allí (el origen 127.0.0.1 nace vacío).
                    pista_neurona::anotar_intento(&app);
                    pista_desde = Some(Instant::now());
                    registrar("paso por la web publicada para traer la pista del id de neurona");
                    avisar(&v, "local", "Buscando la neurona que esta app ya tenía en este aparato…");
                    if let Ok(u) = tauri::Url::parse(&pista_neurona::url_pista(l::WEB_PUBLICADA)) {
                        let _ = v.navigate(u);
                    }
                    std::thread::sleep(Duration::from_millis(800));
                } else if let Some(desde) = pista_desde.filter(|_| !la::es_pagina_arranque(&url)) {
                    let llego = pista_neurona::recibida(&app);
                    if llego || desde.elapsed() >= Duration::from_millis(pista_neurona::ESPERA_PISTA_MS) {
                        registrar(if llego { "pista del id de neurona recibida" } else { "sin pista del id de neurona (sin red ni caché): se sigue" });
                        pista_desde = None;
                        if let Ok(u) = tauri::Url::parse(&l::url_entrada(puerto, &g().pase, "/")) {
                            let _ = v.navigate(u);
                        }
                        std::thread::sleep(Duration::from_millis(1500));
                    } else if pista_neurona::es_pagina_pista(&url, l::WEB_PUBLICADA) {
                        // La página se está cargando o ya cargó: el script es idempotente.
                        let _ = v.eval(pista_neurona::SCRIPT_PISTA);
                    }
                } else if la::es_pagina_arranque(&url) {
                    avisar(&v, "local", "Listo: StarSeed OS funciona en esta neurona, con o sin internet.");
                    // (SEG1107A) Siempre por la entrada: pone la cookie del pase y va a «/».
                    if let Ok(u) = tauri::Url::parse(&l::url_entrada(puerto, &g().pase, "/")) {
                        let _ = v.navigate(u);
                    }
                    std::thread::sleep(Duration::from_millis(1500));
                }
            }
            Fase::Respaldo(m) => {
                // Desde la página de arranque o desde el servidor local caído; nunca desde otra web.
                if la::es_pagina_arranque(&url) || url.starts_with("http://127.0.0.1:") {
                    avisar(&v, "web-publicada", &format!("{m} Abriendo la web publicada…"));
                    std::thread::sleep(Duration::from_millis(1200));
                    if let Ok(u) = tauri::Url::parse(l::WEB_PUBLICADA) {
                        let _ = v.navigate(u);
                    }
                }
                return;
            }
        }
        // Mientras se prepara, a menudo (el progreso); después, cada segundo basta (v.url() cruza al
        // hilo principal de Android).
        let pausa = if matches!(fase(), Fase::Preparando(_)) { 250 } else { 1000 };
        std::thread::sleep(Duration::from_millis(pausa));
    }
}
