// ═══════════════════════════════════════════════════════════════════════════
// instancia_unica — solo una app nativa StarSeed por sistema y usuario en escritorio.
// ---------------------------------------------------------------------------
// Evita que dos procesos `starseed-native` (por ejemplo, autostart `--segundo-plano`
// y un segundo lanzador o doble clic) compitan por UDP 47070, TCP 47071/47073,
// el servidor local 127.0.0.1:47610 (cambiando de origen a 47611) y BlueZ.
// Solo `std` + `crate::sha256::iguales_ct`; sin dependencias nuevas.
// ═══════════════════════════════════════════════════════════════════════════

use std::fs;
use std::hash::{BuildHasher, Hasher};
use std::io::{BufRead, BufReader, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread::JoinHandle;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

pub const PUERTO_OS: u16 = 47629;
pub const PUERTO_NEXUS: u16 = 47630;
pub const PUERTO_CAFE: u16 = 47631;
const ARCHIVO_TOKEN: &str = "instancia-unica.token";
const MAX_LINEA_BYTES: usize = 256;
const REINTENTOS_ADQUIRIR: usize = 6;
const PAUSA_REINTENTO_MS: u64 = 200;
const TIMEOUT_CLIENTE_MS: u64 = 600;
const TIMEOUT_SERVIDOR_MS: u64 = 400;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AccionInstancia {
    Mostrar,
    Ping,
}

impl AccionInstancia {
    pub fn verbo(self) -> &'static str {
        match self {
            AccionInstancia::Mostrar => "MOSTRAR",
            AccionInstancia::Ping => "PING",
        }
    }
}

/// Puerto loopback fijo para este bundle (fuera de 47610..=47619 de `servidor_local`). Pura.
pub fn puerto_de_identificador(identificador: &str) -> u16 {
    match identificador.trim() {
        "app.starseed.nexus" => PUERTO_NEXUS,
        "app.starseed.cafe" => PUERTO_CAFE,
        _ => PUERTO_OS,
    }
}

/// Valida `<MOSTRAR|PING> <token>` contra el token esperado usando comparación constante. Pura.
pub fn analizar_peticion(linea: &str, token_esperado: &str) -> Option<AccionInstancia> {
    if token_esperado.is_empty() || linea.len() > MAX_LINEA_BYTES {
        return None;
    }
    let limpia = linea.trim_end_matches(&['\r', '\n'][..]);
    let (verbo, token) = limpia.split_once(' ')?;
    if !crate::sha256::iguales_ct(token.as_bytes(), token_esperado.as_bytes()) {
        return None;
    }
    match verbo {
        "MOSTRAR" => Some(AccionInstancia::Mostrar),
        "PING" => Some(AccionInstancia::Ping),
        _ => None,
    }
}

fn token_nuevo() -> String {
    let mut out = String::with_capacity(32);
    let ahora = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos() as u64).unwrap_or(0);
    let pid = u64::from(std::process::id());
    for paso in 0..2u64 {
        let mut h = std::collections::hash_map::RandomState::new().build_hasher();
        h.write_u64(ahora);
        h.write_u64(pid);
        h.write_u64(paso);
        out.push_str(&format!("{:016x}", h.finish()));
    }
    out
}

fn escribir_token(ruta: &Path, token: &str) -> std::io::Result<()> {
    if let Some(padre) = ruta.parent() {
        fs::create_dir_all(padre)?;
    }
    fs::write(ruta, token)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(ruta, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

fn ruta_token(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join(format!("starseed-{}", app.config().identifier)));
    dir.join(ARCHIVO_TOKEN)
}

fn enviar_a_instancia(addr: SocketAddr, accion: AccionInstancia, ruta: &Path) -> bool {
    let Ok(token) = fs::read_to_string(ruta) else { return false };
    let token = token.trim();
    if token.is_empty() {
        return false;
    }
    enviar_a_instancia_con_token(addr, accion, token)
}

fn enviar_a_instancia_con_token(addr: SocketAddr, accion: AccionInstancia, token: &str) -> bool {
    let Ok(mut s) = TcpStream::connect_timeout(&addr, Duration::from_millis(TIMEOUT_CLIENTE_MS)) else {
        return false;
    };
    let _ = s.set_read_timeout(Some(Duration::from_millis(TIMEOUT_CLIENTE_MS)));
    let _ = s.set_write_timeout(Some(Duration::from_millis(TIMEOUT_CLIENTE_MS)));
    let mensaje = format!("{} {token}\n", accion.verbo());
    if s.write_all(mensaje.as_bytes()).is_err() || s.flush().is_err() {
        return false;
    }
    let mut resp = String::new();
    let mut lector = BufReader::new(s);
    if lector.read_line(&mut resp).is_err() {
        return false;
    }
    resp.trim_end_matches(&['\r', '\n'][..]) == "OK"
}

fn atender_conexion(mut s: TcpStream, token: &str, al_mostrar: &(dyn Fn() + Send + Sync)) {
    let _ = s.set_read_timeout(Some(Duration::from_millis(TIMEOUT_SERVIDOR_MS)));
    let _ = s.set_write_timeout(Some(Duration::from_millis(TIMEOUT_SERVIDOR_MS)));
    let mut linea = String::new();
    let ok = {
        let mut lector = BufReader::new(&mut s);
        lector.read_line(&mut linea).is_ok()
    };
    if !ok {
        return;
    }
    match analizar_peticion(&linea, token) {
        Some(AccionInstancia::Mostrar) => {
            let _ = s.write_all(b"OK\n");
            let _ = s.flush();
            al_mostrar();
        }
        Some(AccionInstancia::Ping) => {
            let _ = s.write_all(b"OK\n");
            let _ = s.flush();
        }
        None => {
            let _ = s.write_all(b"ERR\n");
            let _ = s.flush();
        }
    }
}

struct EstadoUnico {
    addr: SocketAddr,
    apagar: Arc<AtomicBool>,
    hilo: Option<JoinHandle<()>>,
}

fn estado() -> &'static Mutex<Option<EstadoUnico>> {
    static E: OnceLock<Mutex<Option<EstadoUnico>>> = OnceLock::new();
    E.get_or_init(|| Mutex::new(None))
}

fn arrancar_servidor(listener: TcpListener, addr: SocketAddr, token: String, al_mostrar: Arc<dyn Fn() + Send + Sync>) {
    let apagar = Arc::new(AtomicBool::new(false));
    let apagar_hilo = apagar.clone();
    let hilo = std::thread::Builder::new()
        .name("starseed-instancia".into())
        .spawn(move || {
            let _ = listener.set_nonblocking(false);
            while !apagar_hilo.load(Ordering::SeqCst) {
                match listener.accept() {
                    Ok((s, _)) => {
                        if apagar_hilo.load(Ordering::SeqCst) {
                            break;
                        }
                        atender_conexion(s, &token, al_mostrar.as_ref());
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(20));
                    }
                    Err(_) => break,
                }
            }
        })
        .ok();
    if let Ok(mut g) = estado().lock() {
        *g = Some(EstadoUnico { addr, apagar, hilo });
    }
}

/// Intenta convertirse en la instancia única de este sistema en esta sesión de usuario.
/// Devuelve `false` si ya había otra instancia viva (a la que se pidió mostrar o PING):
/// el llamador debe salir enseguida sin iniciar servicios ni abrir puertos.
pub fn adquirir(app: &AppHandle) -> bool {
    let puerto = puerto_de_identificador(&app.config().identifier);
    let addr = SocketAddr::from(([127, 0, 0, 1], puerto));
    let ruta = ruta_token(app);
    let accion = if std::env::args().any(|a| a == crate::segundo_plano::ARG_SEGUNDO_PLANO) {
        AccionInstancia::Ping
    } else {
        AccionInstancia::Mostrar
    };

    for intento in 0..REINTENTOS_ADQUIRIR {
        match TcpListener::bind(addr) {
            Ok(listener) => {
                let token = token_nuevo();
                let _ = escribir_token(&ruta, &token);
                let app_mostrar = app.clone();
                let al_mostrar: Arc<dyn Fn() + Send + Sync> = Arc::new(move || {
                    let h = app_mostrar.clone();
                    let _ = app_mostrar.run_on_main_thread(move || crate::segundo_plano::mostrar(&h));
                });
                arrancar_servidor(listener, addr, token, al_mostrar);
                return true;
            }
            Err(_) => {
                if enviar_a_instancia(addr, accion, &ruta) {
                    return false;
                }
                if intento + 1 < REINTENTOS_ADQUIRIR {
                    std::thread::sleep(Duration::from_millis(PAUSA_REINTENTO_MS));
                }
            }
        }
    }
    // Si otro programa ajeno ocupa ese puerto, no bloqueamos el arranque de la app.
    true
}

/// Libera el puerto de instancia única (llamado antes de `app.restart()` o al salir).
pub fn soltar() {
    let tomado = estado().lock().ok().and_then(|mut g| g.take());
    let Some(mut e) = tomado else { return };
    e.apagar.store(true, Ordering::SeqCst);
    let _ = TcpStream::connect_timeout(&e.addr, Duration::from_millis(150));
    if let Some(h) = e.hilo.take() {
        let tope = Instant::now() + Duration::from_millis(350);
        while !h.is_finished() && Instant::now() < tope {
            std::thread::sleep(Duration::from_millis(15));
        }
        if h.is_finished() {
            let _ = h.join();
        }
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use std::sync::atomic::AtomicUsize;

    #[test]
    fn puertos_por_identificador_fuera_de_servidor_local() {
        assert_eq!(puerto_de_identificador("app.starseed.os"), 47629);
        assert_eq!(puerto_de_identificador("app.starseed.nexus"), 47630);
        assert_eq!(puerto_de_identificador("app.starseed.cafe"), 47631);
        assert_eq!(puerto_de_identificador("otra.app"), 47629);
        for p in [PUERTO_OS, PUERTO_NEXUS, PUERTO_CAFE] {
            assert!(!(47610..=47619).contains(&p));
        }
    }

    #[test]
    fn analiza_ordenes_con_token_exacto() {
        let tok = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
        assert_eq!(analizar_peticion(&format!("MOSTRAR {tok}\n"), tok), Some(AccionInstancia::Mostrar));
        assert_eq!(analizar_peticion(&format!("PING {tok}\r\n"), tok), Some(AccionInstancia::Ping));
        assert_eq!(analizar_peticion(&format!("MOSTRAR {}x\n", &tok[..31]), tok), None);
        assert_eq!(analizar_peticion(&format!("OTRO {tok}\n"), tok), None);
        assert_eq!(analizar_peticion("", tok), None);
        assert_eq!(analizar_peticion(&format!("MOSTRAR {}", "x".repeat(300)), tok), None);
    }

    #[test]
    fn protocolo_loopback_despierta_en_mostrar_y_suelta_al_terminar() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).expect("puerto efímero");
        let addr = listener.local_addr().unwrap();
        let token = token_nuevo();
        let mostradas = Arc::new(AtomicUsize::new(0));
        let mostradas_cb = mostradas.clone();
        let apagar = Arc::new(AtomicBool::new(false));
        let apagar_hilo = apagar.clone();
        let token_srv = token.clone();
        let hilo = std::thread::spawn(move || {
            while !apagar_hilo.load(Ordering::SeqCst) {
                let Ok((s, _)) = listener.accept() else { break };
                if apagar_hilo.load(Ordering::SeqCst) {
                    break;
                }
                atender_conexion(s, &token_srv, &|| {
                    mostradas_cb.fetch_add(1, Ordering::SeqCst);
                });
            }
        });

        assert!(enviar_a_instancia_con_token(addr, AccionInstancia::Ping, &token));
        assert_eq!(mostradas.load(Ordering::SeqCst), 0);
        assert!(enviar_a_instancia_con_token(addr, AccionInstancia::Mostrar, &token));
        assert_eq!(mostradas.load(Ordering::SeqCst), 1);
        assert!(!enviar_a_instancia_con_token(addr, AccionInstancia::Mostrar, "token-invalido"));
        assert_eq!(mostradas.load(Ordering::SeqCst), 1);

        apagar.store(true, Ordering::SeqCst);
        let _ = TcpStream::connect_timeout(&addr, Duration::from_millis(150));
        let _ = hilo.join();
    }
}
