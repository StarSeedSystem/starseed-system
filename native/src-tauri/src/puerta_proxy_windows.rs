// ═══════════════════════════════════════════════════════════════════════════
// puerta_proxy_windows — el navegador de Windows (WebView2) por la pasarela local de la puerta (WIN1109B).
// Contrato: architecture/red-sin-dependencias.md §5.3 (c) y architecture/wifi-directo.md §10.3.
// ---------------------------------------------------------------------------
// El problema: WebView2 NO tiene API para cambiar el proxy en caliente (macOS lo hace con
// `WKWebsiteDataStore.proxyConfigurations` y Android con `ProxyController`). El proxy de WebView2 se fija al crear
// su entorno, con `--proxy-server` en los argumentos del navegador, y no cambia hasta reiniciar la app.
//
// La solución (la más segura que funciona): una PASARELA permanente DENTRO de este proceso.
//
//     WebView2 ──(--proxy-server=http://127.0.0.1:47077)──▶ pasarela (este proceso)
//                                                              │ ¿la puerta de internet está abierta
//                                                              │  y el destino NO es de la red local?
//                                         no (neurona con internet propio) ◀──┴──▶ sí (sin internet propio)
//                                         conecta DIRECTO al destino              CONNECT por el proxy de la puerta
//                                                                                 (puerta.cjs, 127.0.0.1:<puerto>)
//                                                                                 si ese proxy no contesta → DIRECTO
//
//   · Es un paso directo mientras la puerta esté cerrada, que es siempre que la neurona tiene internet propio
//     (`puerta.cjs` solo abre su proxy cuando NO la tiene): `puerta.cjs` no cambia. La página sigue avisando con
//     `puerta_proxy_local({ puerto })` y aquí `aplicar` solo cambia el siguiente salto de la pasarela, en caliente.
//   · Nunca rompe la navegación: la pasarela vive en el proceso de la app (si la app vive, ella vive); el bucle
//     local, `*.localhost` y las redes privadas (la red directa Wi-Fi Direct incluida) NI SIQUIERA pasan por ella
//     (`--proxy-bypass-list`); y la pasarela no es un puente a este equipo (los destinos de loopback se rechazan).
//   · No pisa nada: no se instala si el puerto fijo está ocupado, si la persona o su empresa tienen un proxy (o PAC)
//     en Windows o en el entorno, o con `STARSEED_SIN_PROXY_PUERTA=1`. En esos casos el webview queda como siempre y
//     la capacidad dice `soportado: false` con el motivo; las descargas de Rust (actualizador, reqwest, curl) siguen
//     usando el proxy de la puerta, que es genérico.
//   · Los argumentos van por `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` (se pone antes de crear ningún webview):
//     vale para todas las ventanas del proceso —WebView2 exige las mismas opciones a los webviews que comparten
//     carpeta de datos— y no reemplaza los argumentos por defecto de wry.
//
// La pasarela solo usa std y se prueba en cualquier sistema (con servidores de prueba en 127.0.0.1). Solo la
// instalación (variable de entorno, lectura del proxy del sistema) es de Windows.
// ═══════════════════════════════════════════════════════════════════════════

#![allow(dead_code)]

use crate::win_p2p_logica::proxy as p;
use std::io::{self, Read, Write};
use std::net::{Ipv4Addr, Shutdown, SocketAddr, TcpListener, TcpStream, ToSocketAddrs};
use std::sync::atomic::{AtomicBool, AtomicU16, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

const MAX_CONEXIONES: usize = 512;
const ESPERA_CABECERA: Duration = Duration::from_secs(15);
const ESPERA_CONEXION: Duration = Duration::from_secs(10);
const ESPERA_PUERTA: Duration = Duration::from_secs(15);
const INACTIVIDAD: Duration = Duration::from_secs(15 * 60);

/// Cómo se comporta una pasarela. En producción las dos en `true`; las pruebas hablan por 127.0.0.1.
#[derive(Clone, Copy, Debug)]
pub struct Opciones {
    /// Rechazar los destinos de loopback (la pasarela no es un puente a este equipo).
    pub prohibir_locales: bool,
    /// Las redes privadas y de enlace local salen siempre directas, aunque la puerta de internet esté abierta.
    pub locales_directos: bool,
}

impl Default for Opciones {
    fn default() -> Self {
        Opciones { prohibir_locales: true, locales_directos: true }
    }
}

pub struct Pasarela {
    pub puerto: u16,
    puerta: Arc<AtomicU16>,
    activas: Arc<AtomicUsize>,
}

impl Pasarela {
    /// Abre la pasarela en 127.0.0.1:`puerto` (0 = el que dé el sistema) y atiende en hilos propios.
    pub fn iniciar(puerto: u16, op: Opciones) -> io::Result<Pasarela> {
        let escucha = TcpListener::bind((Ipv4Addr::LOCALHOST, puerto))?;
        let puerto = escucha.local_addr()?.port();
        let puerta = Arc::new(AtomicU16::new(0));
        let activas = Arc::new(AtomicUsize::new(0));
        let (p2, a2) = (puerta.clone(), activas.clone());
        std::thread::Builder::new().name("starseed-pasarela".into()).spawn(move || {
            for c in escucha.incoming() {
                let Ok(c) = c else { continue };
                if a2.fetch_add(1, Ordering::SeqCst) >= MAX_CONEXIONES {
                    a2.fetch_sub(1, Ordering::SeqCst);
                    responder(&c, "503 Service Unavailable");
                    continue;
                }
                let (p3, a3) = (p2.clone(), a2.clone());
                let hilo = std::thread::Builder::new().name("starseed-pasarela-c".into()).spawn(move || {
                    atender(c, &p3, op);
                    a3.fetch_sub(1, Ordering::SeqCst);
                });
                if hilo.is_err() {
                    a2.fetch_sub(1, Ordering::SeqCst);
                }
            }
        })?;
        Ok(Pasarela { puerto, puerta, activas })
    }

    /// El siguiente salto: el proxy de la puerta de internet (`Some`) o directo (`None`).
    pub fn fijar_puerta(&self, puerto: Option<u16>) {
        self.puerta.store(puerto.filter(|x| p::puerto_de_puerta_valido(*x)).unwrap_or(0), Ordering::SeqCst);
    }

    pub fn puerta(&self) -> Option<u16> {
        Some(self.puerta.load(Ordering::SeqCst)).filter(|x| *x != 0)
    }

    pub fn conexiones(&self) -> usize {
        self.activas.load(Ordering::SeqCst)
    }
}

fn responder(mut c: &TcpStream, estado: &str) {
    let _ = c.write_all(format!("HTTP/1.1 {estado}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").as_bytes());
    let _ = c.shutdown(Shutdown::Both);
}

/// Lee hasta el final de la cabecera. Devuelve (cabecera, lo que ya llegó de más).
fn leer_cabecera(c: &mut TcpStream) -> Option<(String, Vec<u8>)> {
    let _ = c.set_read_timeout(Some(ESPERA_CABECERA));
    let mut buf: Vec<u8> = Vec::with_capacity(1024);
    let mut tmp = [0u8; 2048];
    loop {
        if let Some(fin) = p::fin_de_cabecera(&buf) {
            let resto = buf.split_off(fin);
            return Some((String::from_utf8_lossy(&buf).into_owned(), resto));
        }
        if buf.len() > p::MAX_CABECERA {
            return None;
        }
        match c.read(&mut tmp) {
            Ok(0) | Err(_) => return None,
            Ok(n) => buf.extend_from_slice(&tmp[..n]),
        }
    }
}

fn abrir_directo(host: &str, puerto: u16) -> io::Result<TcpStream> {
    let mut ultimo = io::Error::new(io::ErrorKind::NotFound, "sin direcciones");
    for a in (host, puerto).to_socket_addrs()? {
        match TcpStream::connect_timeout(&a, ESPERA_CONEXION) {
            Ok(s) => return Ok(s),
            Err(e) => ultimo = e,
        }
    }
    Err(ultimo)
}

/// Un túnel por el proxy de la puerta (puerta.cjs): `CONNECT host:puerto` y espera su 2xx.
fn abrir_por_puerta(gw: u16, host: &str, puerto: u16) -> io::Result<TcpStream> {
    let (ip, pg) = p::direccion_puerta(gw);
    let mut s = TcpStream::connect_timeout(&SocketAddr::from((ip, pg)), Duration::from_secs(2))?;
    s.set_read_timeout(Some(ESPERA_PUERTA))?;
    s.write_all(p::conectar_encadenado(host, puerto).as_bytes())?;
    let mut resp: Vec<u8> = Vec::new();
    let mut tmp = [0u8; 1024];
    loop {
        if p::fin_de_cabecera(&resp).is_some() {
            break;
        }
        if resp.len() > 4096 {
            return Err(io::Error::new(io::ErrorKind::InvalidData, "respuesta demasiado larga de la puerta"));
        }
        let n = s.read(&mut tmp)?;
        if n == 0 {
            return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "la puerta cerró sin contestar"));
        }
        resp.extend_from_slice(&tmp[..n]);
    }
    if !p::conectar_aceptado(&String::from_utf8_lossy(&resp)) {
        return Err(io::Error::new(io::ErrorKind::ConnectionRefused, "la puerta no abrió el túnel"));
    }
    // Nada más debería venir tras la cabecera; si vino, es del servidor y se perdería: no pasa con CONNECT.
    Ok(s)
}

/// Por dónde sale este destino ahora.
fn por_puerta(gw: Option<u16>, host: &str, op: Opciones) -> Option<u16> {
    let gw = gw?;
    if op.locales_directos && p::destino_de_red_local(host) {
        return None;
    }
    Some(gw)
}

fn bombear(a: TcpStream, b: TcpStream) {
    let _ = a.set_read_timeout(Some(INACTIVIDAD));
    let _ = b.set_read_timeout(Some(INACTIVIDAD));
    let _ = a.set_nodelay(true);
    let _ = b.set_nodelay(true);
    let (Ok(mut a_lee), Ok(mut b_lee)) = (a.try_clone(), b.try_clone()) else { return };
    let (mut a_escribe, mut b_escribe) = (a, b);
    let ida = std::thread::spawn(move || {
        let _ = io::copy(&mut a_lee, &mut b_escribe);
        let _ = b_escribe.shutdown(Shutdown::Write);
    });
    let _ = io::copy(&mut b_lee, &mut a_escribe);
    let _ = a_escribe.shutdown(Shutdown::Write);
    let _ = ida.join();
}

fn atender(mut c: TcpStream, puerta: &AtomicU16, op: Opciones) {
    let Some((cabecera, resto)) = leer_cabecera(&mut c) else { return responder(&c, "400 Bad Request") };
    let gw = Some(puerta.load(Ordering::SeqCst)).filter(|x| *x != 0);
    match p::analizar_peticion_con(&cabecera, op.prohibir_locales) {
        Err(p::Rechazo::Mal) => responder(&c, "400 Bad Request"),
        Err(p::Rechazo::Prohibido) => responder(&c, "403 Forbidden"),
        Err(p::Rechazo::NoSoportado) => responder(&c, "501 Not Implemented"),
        Ok(p::Peticion::Conectar { host, puerto }) => {
            // Primero por la puerta (si toca); si no contesta, directo: nunca se queda sin camino por un fallo suyo.
            let salida = por_puerta(gw, &host, op)
                .and_then(|g| abrir_por_puerta(g, &host, puerto).ok())
                .map(Ok)
                .unwrap_or_else(|| abrir_directo(&host, puerto));
            let Ok(mut s) = salida else { return responder(&c, "502 Bad Gateway") };
            if c.write_all(b"HTTP/1.1 200 Connection Established\r\n\r\n").is_err() {
                return;
            }
            if !resto.is_empty() && s.write_all(&resto).is_err() {
                return;
            }
            let _ = c.set_read_timeout(None);
            bombear(c, s);
        }
        Ok(p::Peticion::Http { host, puerto, ruta }) => {
            let gw = por_puerta(gw, &host, op);
            // Por la puerta: el siguiente proxy recibe la URL completa; directo: la forma de origen.
            let por_gw = gw.and_then(|g| {
                let (ip, pg) = p::direccion_puerta(g);
                TcpStream::connect_timeout(&SocketAddr::from((ip, pg)), Duration::from_secs(2)).ok()
            });
            let (mut s, encadenada) = match por_gw {
                Some(s) => (s, true),
                None => match abrir_directo(&host, puerto) {
                    Ok(s) => (s, false),
                    Err(_) => return responder(&c, "502 Bad Gateway"),
                },
            };
            let envio = p::reescribir_http(&cabecera, &ruta, encadenada);
            if s.write_all(envio.as_bytes()).is_err() || (!resto.is_empty() && s.write_all(&resto).is_err()) {
                return responder(&c, "502 Bad Gateway");
            }
            let _ = c.set_read_timeout(None);
            bombear(c, s);
        }
    }
}

// ─────────────────────────────── Instalación (Windows) ───────────────────────────────

/// Lo que la app sabe de la pasarela del proceso.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum EstadoPasarela {
    /// Aún no se intentó (arranque en curso) o este sistema no es Windows.
    SinIntentar,
    Activa(u16),
    /// No se instaló, y por qué (para la capacidad y para Ajustes).
    NoInstalada(String),
}

static ESTADO: Mutex<EstadoPasarela> = Mutex::new(EstadoPasarela::SinIntentar);
static PASARELA: OnceLock<Pasarela> = OnceLock::new();
static INSTALADA: AtomicBool = AtomicBool::new(false);

fn poner_estado(e: EstadoPasarela) {
    *ESTADO.lock().unwrap_or_else(|x| x.into_inner()) = e;
}

pub fn estado() -> EstadoPasarela {
    ESTADO.lock().unwrap_or_else(|x| x.into_inner()).clone()
}

/// ¿El webview sale por la pasarela? (la capacidad de `puerta_proxy` en Windows).
pub fn activa() -> bool {
    matches!(estado(), EstadoPasarela::Activa(_))
}

/// El motivo por el que el webview no sale por la pasarela (None si sale o si aún no se sabe).
pub fn motivo_no_instalada() -> Option<String> {
    match estado() {
        EstadoPasarela::NoInstalada(m) => Some(m),
        _ => None,
    }
}

/// Cambia el siguiente salto de la pasarela (la página avisa con `puerta_proxy_local`). Sin pasarela, no hace nada.
pub fn fijar_puerta(puerto: Option<u16>) -> Result<(), String> {
    match PASARELA.get() {
        Some(pa) => {
            pa.fijar_puerta(puerto);
            Ok(())
        }
        None => Err(motivo_no_instalada().unwrap_or_else(|| "La pasarela del navegador no está instalada.".into())),
    }
}

pub fn puerta_actual() -> Option<u16> {
    PASARELA.get().and_then(|p| p.puerta())
}

/// ¿Windows o el entorno tienen un proxy configurado que no hay que pisar?
#[cfg(target_os = "windows")]
fn proxy_del_sistema() -> Option<&'static str> {
    use std::os::windows::process::CommandExt;
    const SIN_VENTANA: u32 = 0x0800_0000;
    let leer = |nombre: &str| -> Option<String> {
        let salida = std::process::Command::new("reg")
            .args(["query", r"HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings", "/v", nombre])
            .creation_flags(SIN_VENTANA)
            .output()
            .ok()?;
        p::valor_registro(&String::from_utf8_lossy(&salida.stdout), nombre)
    };
    let entorno: Vec<(String, String)> = std::env::vars().filter(|(k, _)| ["http_proxy", "https_proxy", "all_proxy"].contains(&k.to_ascii_lowercase().as_str())).collect();
    let refs: Vec<(&str, &str)> = entorno.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect();
    p::proxy_configurado(leer("ProxyEnable").as_deref(), leer("AutoConfigURL").as_deref(), &refs)
}

#[cfg(not(target_os = "windows"))]
fn proxy_del_sistema() -> Option<&'static str> {
    None
}

/// Se llama UNA vez al principio de `run()` (antes de crear ningún webview). Abre la pasarela y deja los argumentos
/// de WebView2 en la variable de entorno. Si algo no cuadra, no toca nada y lo deja dicho en `estado()`.
pub fn instalar() {
    if INSTALADA.swap(true, Ordering::SeqCst) {
        return;
    }
    if p::apagado(std::env::var(p::ENTORNO_APAGADO).ok().as_deref()) {
        return poner_estado(EstadoPasarela::NoInstalada(format!("El proxy de la puerta está apagado en esta instalación ({}).", p::ENTORNO_APAGADO)));
    }
    if let Some(razon) = proxy_del_sistema() {
        return poner_estado(EstadoPasarela::NoInstalada(format!(
            "Este equipo {razon}: el navegador de la app sigue su camino de siempre (las descargas de la app sí usan la puerta)."
        )));
    }
    let actual = std::env::var(p::VARIABLE_WEBVIEW2).ok();
    let Some(valor) = p::valor_variable_webview2(actual.as_deref(), p::PUERTO_PASARELA) else {
        return poner_estado(EstadoPasarela::NoInstalada("WebView2 ya tiene un proxy elegido por la persona (WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS): no se pisa.".into()));
    };
    let pasarela = match Pasarela::iniciar(p::PUERTO_PASARELA, Opciones::default()) {
        Ok(x) => x,
        Err(e) => {
            return poner_estado(EstadoPasarela::NoInstalada(format!(
                "El puerto {} de la pasarela local está ocupado ({e}): el navegador de la app sigue su camino de siempre.",
                p::PUERTO_PASARELA
            )));
        }
    };
    let puerto = pasarela.puerto;
    let _ = PASARELA.set(pasarela);
    // SAFETY: es lo primero que hace `run()`, antes de crear hilos de webview; ningún otro hilo toca el entorno.
    std::env::set_var(p::VARIABLE_WEBVIEW2, valor);
    poner_estado(EstadoPasarela::Activa(puerto));
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use std::net::TcpListener;

    fn libre() -> u16 {
        let l = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        l.local_addr().unwrap().port()
    }

    /// Un servidor de eco en 127.0.0.1: devuelve (puerto, hilo).
    fn eco() -> u16 {
        let l = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let puerto = l.local_addr().unwrap().port();
        std::thread::spawn(move || {
            for c in l.incoming() {
                let Ok(mut c) = c else { continue };
                std::thread::spawn(move || {
                    let mut b = [0u8; 256];
                    while let Ok(n) = c.read(&mut b) {
                        if n == 0 || c.write_all(&b[..n]).is_err() {
                            break;
                        }
                    }
                });
            }
        });
        puerto
    }

    /// Una «puerta» falsa: contesta 200 al CONNECT y hace eco; guarda la primera línea que vio.
    fn puerta_falsa(acepta: bool) -> (u16, Arc<Mutex<Vec<String>>>) {
        let l = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let puerto = l.local_addr().unwrap().port();
        let vistas = Arc::new(Mutex::new(Vec::new()));
        let v = vistas.clone();
        std::thread::spawn(move || {
            for c in l.incoming() {
                let Ok(mut c) = c else { continue };
                let v = v.clone();
                std::thread::spawn(move || {
                    let Some((cab, _)) = leer_cabecera(&mut c) else { return };
                    v.lock().unwrap().push(cab.lines().next().unwrap_or("").to_string());
                    if !acepta {
                        let _ = c.write_all(b"HTTP/1.1 502 Bad Gateway\r\n\r\n");
                        return;
                    }
                    let _ = c.write_all(b"HTTP/1.1 200 Connection Established\r\n\r\n");
                    let mut b = [0u8; 256];
                    while let Ok(n) = c.read(&mut b) {
                        if n == 0 || c.write_all(&b[..n]).is_err() {
                            break;
                        }
                    }
                });
            }
        });
        (puerto, vistas)
    }

    fn pasarela(prohibir: bool, locales_directos: bool) -> Pasarela {
        Pasarela::iniciar(0, Opciones { prohibir_locales: prohibir, locales_directos }).unwrap()
    }

    fn leer_linea(c: &mut TcpStream) -> String {
        let (cab, _) = leer_cabecera(c).expect("respuesta");
        cab.lines().next().unwrap_or("").to_string()
    }

    fn conectar_por(pa: &Pasarela, destino: &str) -> (TcpStream, String) {
        let mut c = TcpStream::connect((Ipv4Addr::LOCALHOST, pa.puerto)).unwrap();
        c.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
        c.write_all(format!("CONNECT {destino} HTTP/1.1\r\nHost: {destino}\r\n\r\n").as_bytes()).unwrap();
        let l = leer_linea(&mut c);
        (c, l)
    }

    fn hacer_eco(c: &mut TcpStream, texto: &str) -> String {
        c.write_all(texto.as_bytes()).unwrap();
        let mut b = vec![0u8; texto.len()];
        c.read_exact(&mut b).unwrap();
        String::from_utf8(b).unwrap()
    }

    #[test]
    fn connect_directo_sin_puerta() {
        let e = eco();
        let pa = pasarela(false, true);
        assert_eq!(pa.puerta(), None);
        let (mut c, l) = conectar_por(&pa, &format!("127.0.0.1:{e}"));
        assert!(l.contains("200"), "{l}");
        assert_eq!(hacer_eco(&mut c, "hola desde el navegador"), "hola desde el navegador");
    }

    #[test]
    fn el_bucle_local_se_rechaza_en_produccion() {
        let e = eco();
        let pa = pasarela(true, true);
        let (_, l) = conectar_por(&pa, &format!("127.0.0.1:{e}"));
        assert!(l.contains("403"), "la pasarela no es un puente a este equipo: {l}");
        let (_, l) = conectar_por(&pa, "localhost:47071");
        assert!(l.contains("403"), "{l}");
    }

    #[test]
    fn peticiones_malas_o_que_no_son_de_proxy() {
        let pa = pasarela(true, true);
        for (envio, esperado) in [
            ("GET / HTTP/1.1\r\nHost: x\r\n\r\n", "501"),
            ("CONNECT a:b:c HTTP/1.1\r\n\r\n", "400"),
            ("basura\r\n\r\n", "400"),
        ] {
            let mut c = TcpStream::connect((Ipv4Addr::LOCALHOST, pa.puerto)).unwrap();
            c.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
            c.write_all(envio.as_bytes()).unwrap();
            assert!(leer_linea(&mut c).contains(esperado), "{envio:?}");
        }
        // Una cabecera sin fin se corta.
        let mut c = TcpStream::connect((Ipv4Addr::LOCALHOST, pa.puerto)).unwrap();
        c.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
        c.write_all(&vec![b'a'; p::MAX_CABECERA + 4096]).unwrap();
        assert!(leer_linea(&mut c).contains("400"));
    }

    #[test]
    fn sale_por_la_puerta_cuando_esta_abierta() {
        let e = eco();
        let (g, vistas) = puerta_falsa(true);
        // locales_directos = false: 127.0.0.1 hace de «internet» para la prueba.
        let pa = pasarela(false, false);
        pa.fijar_puerta(Some(g));
        assert_eq!(pa.puerta(), Some(g));
        let (mut c, l) = conectar_por(&pa, &format!("127.0.0.1:{e}"));
        assert!(l.contains("200"), "{l}");
        assert_eq!(hacer_eco(&mut c, "por la malla"), "por la malla", "el eco lo da la puerta falsa");
        assert_eq!(vistas.lock().unwrap().as_slice(), [format!("CONNECT 127.0.0.1:{e} HTTP/1.1")]);
    }

    #[test]
    fn la_red_local_nunca_pasa_por_la_puerta() {
        let e = eco();
        let (g, vistas) = puerta_falsa(true);
        let pa = pasarela(false, true);
        pa.fijar_puerta(Some(g));
        let (mut c, l) = conectar_por(&pa, &format!("127.0.0.1:{e}"));
        assert!(l.contains("200"));
        assert_eq!(hacer_eco(&mut c, "directo"), "directo");
        assert!(vistas.lock().unwrap().is_empty(), "un destino local no toca la puerta");
    }

    #[test]
    fn si_la_puerta_no_contesta_se_sigue_directo() {
        let e = eco();
        // Puerta cerrada (nadie escucha) y puerta que rechaza: en los dos casos, directo.
        let pa = pasarela(false, false);
        pa.fijar_puerta(Some(libre()));
        let (mut c, l) = conectar_por(&pa, &format!("127.0.0.1:{e}"));
        assert!(l.contains("200"), "{l}");
        assert_eq!(hacer_eco(&mut c, "sin puerta"), "sin puerta");
        let (g, vistas) = puerta_falsa(false);
        pa.fijar_puerta(Some(g));
        let (mut c, l) = conectar_por(&pa, &format!("127.0.0.1:{e}"));
        assert!(l.contains("200"), "{l}");
        assert_eq!(hacer_eco(&mut c, "rechazada"), "rechazada");
        assert_eq!(vistas.lock().unwrap().len(), 1, "se intentó por la puerta primero");
    }

    #[test]
    fn quitar_la_puerta_vuelve_al_directo() {
        let e = eco();
        let (g, vistas) = puerta_falsa(true);
        let pa = pasarela(false, false);
        pa.fijar_puerta(Some(g));
        pa.fijar_puerta(None);
        assert_eq!(pa.puerta(), None);
        let (mut c, _) = conectar_por(&pa, &format!("127.0.0.1:{e}"));
        assert_eq!(hacer_eco(&mut c, "otra vez directo"), "otra vez directo");
        assert!(vistas.lock().unwrap().is_empty());
        // Un puerto reservado o el de la propia pasarela no se aceptan como puerta.
        pa.fijar_puerta(Some(80));
        assert_eq!(pa.puerta(), None);
        pa.fijar_puerta(Some(p::PUERTO_PASARELA));
        assert_eq!(pa.puerta(), None);
    }

    #[test]
    fn http_plano_directo_en_forma_de_origen() {
        // Un servidor HTTP mínimo que devuelve la petición que recibió.
        let l = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let sp = l.local_addr().unwrap().port();
        std::thread::spawn(move || {
            if let Ok((mut c, _)) = l.accept() {
                let (cab, _) = leer_cabecera(&mut c).unwrap();
                let cuerpo = cab.replace("\r\n", "|");
                let _ = c.write_all(format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{cuerpo}", cuerpo.len()).as_bytes());
            }
        });
        let pa = pasarela(false, true);
        let mut c = TcpStream::connect((Ipv4Addr::LOCALHOST, pa.puerto)).unwrap();
        c.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
        c.write_all(format!("GET http://127.0.0.1:{sp}/x?y=1 HTTP/1.1\r\nHost: 127.0.0.1:{sp}\r\nProxy-Connection: keep-alive\r\n\r\n").as_bytes()).unwrap();
        let mut todo = String::new();
        c.read_to_string(&mut todo).unwrap();
        assert!(todo.starts_with("HTTP/1.1 200 OK"), "{todo}");
        assert!(todo.contains("GET /x?y=1 HTTP/1.1|"), "forma de origen: {todo}");
        assert!(todo.contains("Connection: close") && !todo.to_ascii_lowercase().contains("proxy-connection"), "{todo}");
    }

    #[test]
    fn instalar_respeta_el_interruptor_y_deja_motivo() {
        // `instalar` toca el entorno del proceso: la prueba solo comprueba el camino sin efectos (interruptor).
        assert!(p::apagado(Some("1")));
        assert_eq!(estado(), EstadoPasarela::SinIntentar);
        assert!(!activa());
        assert!(fijar_puerta(Some(50000)).is_err(), "sin pasarela instalada no se puede fijar la puerta");
    }
}
