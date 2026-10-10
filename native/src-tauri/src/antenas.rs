// ═══════════════════════════════════════════════════════════════════════════
// antenas — el guardián de antenas de la app nativa (2026-10-10).
// ---------------------------------------------------------------------------
// Contrato: architecture/apps-nativas-segundo-plano.md §2 y §3.
//
// Vive en hilos de Rust del PROCESO de la app, no en la página web: por eso sigue
// funcionando con la ventana cerrada (escritorio: bandeja; Android: el servicio en
// primer plano mantiene vivo el proceso). Hace, sin dependencias nuevas (solo std):
//   · Wi-Fi local: emite y escucha faros (faro.rs) por UDP multicast con TTL 1;
//     reconoce las neuronas de la MISMA cuenta y solo CUENTA las demás.
//   · LoRa/Meshtastic: radios USB enchufadas (Unix: /dev/cu.usb*, ttyUSB, ttyACM;
//     Windows: `mode`) y nodos Meshtastic por TCP 4403 (meshtasticd o un nodo con
//     Wi-Fi en la red local).
//   · Reticulum: si `rnsd` está instalado y corriendo (no lo trae la app; ver §3.5
//     del contrato por la licencia).
//   · Internet: un connect TCP de 1,5 s a 1.1.1.1:443 / 9.9.9.9:443.
//   · Bluetooth: en escritorio NO hay pila nativa todavía (falta btleplug, decisión
//     de Alex) y se dice así; en Android lo pondrá el plugin Kotlin.
// Cada antena dice «viva», «apagada», «sin-permiso», «no-disponible» o
// «detectada» con su motivo en una frase. Nada se marca viva sin haberlo medido.
// ═══════════════════════════════════════════════════════════════════════════

use crate::faro::{self, TipoAparato};
use crate::disco::orden;
use crate::sha256::desde_hex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::{Ipv4Addr, SocketAddr, TcpStream, ToSocketAddrs, UdpSocket};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

pub const ARCHIVO_CONFIG: &str = "antenas.json";
pub const PUERTO_MESHTASTIC: u16 = 4403;
pub const PUERTO_RNS: u16 = 37428;

// ───────────────────────────── Tipos públicos ─────────────────────────────

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct EstadoAntena {
    pub id: String,
    pub nombre: String,
    /// "viva" | "detectada" | "apagada" | "sin-permiso" | "no-disponible"
    pub estado: String,
    pub motivo: String,
    /// ¿Sigue con la app cerrada en este sistema?
    pub segundo_plano: bool,
    pub detalle: Vec<String>,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct Vecino {
    pub ip: String,
    pub tipo: String,
    pub propia: bool,
    pub neurona: Option<String>,
    pub puerto_servicio: u16,
    pub nas: bool,
    pub lora: bool,
    pub segundo_plano: bool,
    pub visto_hace_s: u64,
}

#[derive(Serialize, Clone, Debug)]
pub struct EstadoAntenas {
    pub medido_ms: u64,
    pub plataforma: String,
    pub guardian_activo: bool,
    pub app_en_segundo_plano: bool,
    pub antenas: Vec<EstadoAntena>,
    pub vecinos: Vec<Vecino>,
    /// Neuronas StarSeed cerca que NO son de esta cuenta (solo el número).
    pub otras_cerca: u32,
}

impl EstadoAntenas {
    /// Para Nexus y Café (no llevan guardián) o si aún no arrancó.
    pub fn sin_guardian(motivo: &str) -> Self {
        EstadoAntenas {
            medido_ms: SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0),
            plataforma: std::env::consts::OS.to_string(),
            guardian_activo: false,
            app_en_segundo_plano: false,
            antenas: vec![antena("guardian", "Guardián de antenas", "no-disponible", motivo.to_string(), false, vec![])],
            vecinos: vec![],
            otras_cerca: 0,
        }
    }
}

/// Configuración que manda la web (y que se guarda para arrancar sin ella).
/// `serde(default)`: un campo que falte toma su valor por defecto en vez de romper la llamada.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
#[serde(default)]
pub struct ConfigAntenas {
    /// Clave de faro de la cuenta (64 hex). Sin ella: faro anónimo.
    pub clave_faro: Option<String>,
    /// Id de ESTA neurona (el de `neuron_devices`).
    pub neurona: Option<String>,
    /// Ids de las otras neuronas de la cuenta (para decir cuál es cuál).
    pub conocidas: Vec<String>,
    /// Nodos Meshtastic por Wi-Fi (`192.168.1.40` o `nodo.local`).
    pub meshtastic_hosts: Vec<String>,
    /// ¿Anunciar que esta neurona sirve carpetas (NAS) a su cuenta?
    pub nas: bool,
    /// Wi-Fi local encendido (por defecto sí).
    pub faro_apagado: bool,
}

// ─────────────────────────── Sondas (puras o casi) ───────────────────────────

/// Nombres de /dev que suelen ser una radio USB (Meshtastic/RNode).
pub fn es_puerto_radio(nombre: &str) -> bool {
    const PREFIJOS: [&str; 6] = ["cu.usbserial", "cu.usbmodem", "cu.SLAB_USBtoUART", "cu.wchusbserial", "ttyUSB", "ttyACM"];
    PREFIJOS.iter().any(|p| nombre.starts_with(p))
}

/// Puertos serie candidatos (Unix: /dev; Windows: salida de `mode`).
#[cfg(all(unix, not(target_os = "android")))]
pub fn puertos_serie() -> Vec<String> {
    let mut v: Vec<String> = std::fs::read_dir("/dev")
        .map(|it| {
            it.filter_map(|e| e.ok())
                .map(|e| e.file_name().to_string_lossy().to_string())
                .filter(|n| es_puerto_radio(n))
                .map(|n| format!("/dev/{n}"))
                .collect()
        })
        .unwrap_or_default();
    v.sort();
    v
}

#[cfg(windows)]
pub fn puertos_serie() -> Vec<String> {
    orden("mode.com")
        .output()
        .map(|o| leer_mode(&String::from_utf8_lossy(&o.stdout)))
        .unwrap_or_default()
}

/// Android/iOS: la app no ve /dev (USB host va por el plugin Kotlin).
#[cfg(not(any(windows, all(unix, not(target_os = "android")))))]
pub fn puertos_serie() -> Vec<String> {
    Vec::new()
}

/// Lee los «Status for device COM3:» / «Estado para dispositivo COM3:» de `mode`.
pub fn leer_mode(salida: &str) -> Vec<String> {
    let mut v: Vec<String> = salida
        .lines()
        .filter_map(|l| {
            let i = l.find("COM")?;
            let resto: String = l[i..].chars().take_while(|c| c.is_ascii_alphanumeric()).collect();
            (resto.len() > 3 && resto[3..].chars().all(|c| c.is_ascii_digit())).then_some(resto)
        })
        .collect();
    v.sort();
    v.dedup();
    v
}

/// ¿Responde un puerto TCP? (connect con tiempo máximo; nunca bloquea más).
pub fn tcp_abierto(host: &str, puerto: u16, ms: u64) -> bool {
    let Ok(dirs) = (host, puerto).to_socket_addrs() else { return false };
    dirs.take(2).any(|d: SocketAddr| TcpStream::connect_timeout(&d, Duration::from_millis(ms)).is_ok())
}

/// Busca un ejecutable en el PATH y en las carpetas donde suele estar aunque una
/// app gráfica de macOS arranque con un PATH mínimo.
pub fn buscar_ejecutable(nombre: &str) -> Option<PathBuf> {
    let mut dirs: Vec<PathBuf> = std::env::var_os("PATH").map(|p| std::env::split_paths(&p).collect()).unwrap_or_default();
    if let Some(h) = std::env::var_os("HOME") {
        let h = PathBuf::from(h);
        dirs.push(h.join(".local/bin"));
        dirs.push(h.join("Library/Python/3.12/bin"));
        dirs.push(h.join("Library/Python/3.11/bin"));
    }
    dirs.extend(["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"].iter().map(PathBuf::from));
    let exts: &[&str] = if cfg!(windows) { &[".exe", ".cmd", ""] } else { &[""] };
    dirs.iter().flat_map(|d| exts.iter().map(move |e| d.join(format!("{nombre}{e}")))).find(|p| p.is_file())
}

#[cfg(all(unix, not(target_os = "android")))]
fn proceso_corriendo(patron: &str) -> bool {
    // pgrep se lanza directo (sin shell): no puede encontrarse a sí mismo.
    orden("pgrep").args(["-f", patron]).output().map(|o| o.status.success()).unwrap_or(false)
}

#[cfg(not(all(unix, not(target_os = "android"))))]
fn proceso_corriendo(_patron: &str) -> bool {
    false
}

fn antena(id: &str, nombre: &str, estado: &str, motivo: String, segundo_plano: bool, detalle: Vec<String>) -> EstadoAntena {
    EstadoAntena { id: id.into(), nombre: nombre.into(), estado: estado.into(), motivo, segundo_plano, detalle }
}

/// LoRa/Meshtastic a partir de lo medido (puro: se prueba).
pub fn evaluar_lora(serie: &[String], serie_abierta: Option<&str>, nodos_tcp_vivos: &[String], movil: bool) -> EstadoAntena {
    if let Some(p) = serie_abierta {
        return antena("lora", "LoRa · Meshtastic", "viva", format!("Radio conectada por serie en {p} (puente nativo)."), true, vec![p.to_string()]);
    }
    if !nodos_tcp_vivos.is_empty() {
        return antena(
            "lora",
            "LoRa · Meshtastic",
            "viva",
            format!("Nodo Meshtastic respondiendo por TCP en {}.", nodos_tcp_vivos.join(", ")),
            true,
            nodos_tcp_vivos.to_vec(),
        );
    }
    if !serie.is_empty() {
        return antena(
            "lora",
            "LoRa · Meshtastic",
            "detectada",
            format!("Radio USB enchufada ({}); ábrela desde Conexiones para usarla.", serie.join(", ")),
            true,
            serie.to_vec(),
        );
    }
    if movil {
        return antena("lora", "LoRa · Meshtastic", "apagada", "Sin radio: en Android se conectará por Bluetooth (próxima versión del plugin).".into(), true, vec![]);
    }
    antena("lora", "LoRa · Meshtastic", "apagada", "No hay ninguna radio enchufada ni nodo Meshtastic en la red.".into(), true, vec![])
}

/// Reticulum a partir de lo medido (puro).
pub fn evaluar_reticulum(rnsd: Option<&Path>, corriendo: bool, puerto_abierto: bool) -> EstadoAntena {
    match (rnsd, corriendo || puerto_abierto) {
        (_, true) => antena("reticulum", "Reticulum", "viva", "rnsd está corriendo en este aparato.".into(), true, vec![]),
        (Some(p), false) => antena(
            "reticulum",
            "Reticulum",
            "apagada",
            format!("rnsd está instalado ({}) pero no corre: arráncalo con «rnsd» o como servicio.", p.display()),
            true,
            vec![],
        ),
        (None, false) => antena(
            "reticulum",
            "Reticulum",
            "no-disponible",
            "No está instalado. La app no lo trae: su licencia (Reticulum License) es decisión de Alex; alternativa AGPL: RetiNet.".into(),
            false,
            vec![],
        ),
    }
}

/// Resumen de una línea para la bandeja y la notificación de Android (puro).
/// Solo cuenta como viva la antena medida viva; nunca «todo bien» sin medir.
pub fn resumen(estado: &EstadoAntenas) -> String {
    if !estado.guardian_activo {
        return "Antenas: sin medir".to_string();
    }
    let vivas: Vec<&str> = estado.antenas.iter().filter(|a| a.estado == "viva").map(|a| a.nombre.as_str()).collect();
    let mut texto = if vivas.is_empty() {
        "Ninguna antena viva".to_string()
    } else {
        format!("Vivas: {}", vivas.join(" · "))
    };
    let propias = estado.vecinos.iter().filter(|v| v.propia).count();
    if propias > 0 {
        texto.push_str(&format!(" — {propias} neurona(s) tuya(s) cerca"));
    } else if estado.otras_cerca > 0 {
        // Sin clave de faro de la cuenta no se sabe de quién son: solo se cuentan.
        texto.push_str(&format!(" — {} neurona(s) StarSeed cerca", estado.otras_cerca));
    }
    texto
}

// ─────────────────────────────── Guardián ───────────────────────────────

struct Interno {
    config: ConfigAntenas,
    clave: Option<Vec<u8>>,
    vecinos: HashMap<String, (Vecino, Instant)>,
    otras: HashMap<String, Instant>,
    propios_nonces: Vec<[u8; 8]>,
    wifi: EstadoAntena,
    lora: EstadoAntena,
    reticulum: EstadoAntena,
    internet: EstadoAntena,
    serie_abierta: Option<String>,
    segundo_plano: bool,
}

/// Quien quiere enterarse de cada cambio (la web, la bandeja, la notificación de Android).
/// `Arc` para poder llamarlos SIN tener el cerrojo cogido: un notificador que espera al hilo
/// principal (la bandeja) no puede bloquear a otro hilo que también quiera avisar.
pub type Notificador = Arc<dyn Fn(&EstadoAntenas) + Send + Sync>;

pub struct Guardian {
    tipo: TipoAparato,
    dir_datos: PathBuf,
    interno: Mutex<Interno>,
    notificar: Mutex<Vec<Notificador>>,
}

static GUARDIAN: OnceLock<Arc<Guardian>> = OnceLock::new();

fn ahora_s() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn bt_por_plataforma() -> EstadoAntena {
    if cfg!(target_os = "android") {
        antena("bluetooth", "Bluetooth", "no-disponible", "El Bluetooth nativo de Android llega con el plugin Kotlin (en el contrato, §3.3).".into(), true, vec![])
    } else {
        antena(
            "bluetooth",
            "Bluetooth",
            "no-disponible",
            "La app aún no trae Bluetooth nativo (falta el crate btleplug: decisión de Alex). Mientras, Chrome/Edge con Web Bluetooth.".into(),
            false,
            vec![],
        )
    }
}

impl Guardian {
    /// Arranca (una sola vez por proceso) y devuelve el guardián.
    pub fn iniciar(dir_datos: PathBuf) -> Arc<Guardian> {
        GUARDIAN
            .get_or_init(|| {
                let config = cargar_config(&dir_datos);
                let clave = config.clave_faro.as_deref().and_then(desde_hex).filter(|k| k.len() == 32);
                let g = Arc::new(Guardian {
                    tipo: TipoAparato::de_este_aparato(),
                    dir_datos,
                    interno: Mutex::new(Interno {
                        config,
                        clave,
                        vecinos: HashMap::new(),
                        otras: HashMap::new(),
                        propios_nonces: Vec::new(),
                        wifi: antena("wifi-local", "Wi-Fi local", "apagada", "Arrancando…".into(), true, vec![]),
                        lora: antena("lora", "LoRa · Meshtastic", "apagada", "Midiendo…".into(), true, vec![]),
                        reticulum: antena("reticulum", "Reticulum", "apagada", "Midiendo…".into(), true, vec![]),
                        internet: antena("internet", "Internet", "apagada", "Midiendo…".into(), true, vec![]),
                        serie_abierta: None,
                        segundo_plano: false,
                    }),
                    notificar: Mutex::new(Vec::new()),
                });
                arrancar_hilos(g.clone());
                g
            })
            .clone()
    }

    /// El guardián ya arrancado, si lo hay.
    pub fn actual() -> Option<Arc<Guardian>> {
        GUARDIAN.get().cloned()
    }

    /// Añade un notificador (se suman: web, bandeja y Android a la vez).
    pub fn al_cambiar(&self, f: Notificador) {
        if let Ok(mut n) = self.notificar.lock() {
            n.push(f);
        }
    }

    pub fn configurar(&self, nueva: ConfigAntenas) -> Result<(), String> {
        let clave = match nueva.clave_faro.as_deref() {
            None | Some("") => None,
            Some(h) => Some(desde_hex(h).filter(|k| k.len() == 32).ok_or("La clave de faro debe tener 64 caracteres hex.")?),
        };
        guardar_config(&self.dir_datos, &nueva)?;
        let mut i = self.interno.lock().map_err(|_| "estado bloqueado")?;
        i.config = nueva;
        i.clave = clave;
        i.vecinos.clear();
        Ok(())
    }

    /// La configuración actual (para cambiar un campo sin perder los demás).
    pub fn config(&self) -> ConfigAntenas {
        match self.interno.lock() {
            Ok(i) => i.config.clone(),
            Err(envenenado) => envenenado.into_inner().config.clone(),
        }
    }

    pub fn marcar_segundo_plano(&self, valor: bool) {
        if let Ok(mut i) = self.interno.lock() {
            i.segundo_plano = valor;
        }
        self.avisar();
    }

    /// Apunta el puerto serie abierto (o None al cerrarlo). No mide: quien llama
    /// lanza `medir()` en otro hilo para no bloquear la interfaz.
    pub fn marcar_serie(&self, puerto: Option<String>) {
        if let Ok(mut i) = self.interno.lock() {
            i.serie_abierta = puerto;
        }
    }

    pub fn estado(&self) -> EstadoAntenas {
        let i = match self.interno.lock() {
            Ok(g) => g,
            Err(envenenado) => envenenado.into_inner(),
        };
        let mut vecinos: Vec<Vecino> = i
            .vecinos
            .values()
            .map(|(v, t)| Vecino { visto_hace_s: t.elapsed().as_secs(), ..v.clone() })
            .collect();
        vecinos.sort_by(|a, b| a.ip.cmp(&b.ip));
        EstadoAntenas {
            medido_ms: SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0),
            plataforma: std::env::consts::OS.to_string(),
            guardian_activo: true,
            app_en_segundo_plano: i.segundo_plano,
            antenas: vec![i.wifi.clone(), i.lora.clone(), bt_por_plataforma(), i.reticulum.clone(), i.internet.clone()],
            vecinos,
            otras_cerca: i.otras.len() as u32,
        }
    }

    fn avisar(&self) {
        let estado = self.estado();
        // Se copian fuera del cerrojo y se llaman sin él (ver `Notificador`).
        let lista: Vec<Notificador> = match self.notificar.lock() {
            Ok(n) => n.clone(),
            Err(_) => return,
        };
        for f in lista {
            f(&estado);
        }
    }

    /// Mide LoRa, Reticulum e Internet (bloqueante, ≤ ~4 s).
    pub fn medir(&self) {
        let (hosts, serie_abierta) = match self.interno.lock() {
            Ok(i) => (i.config.meshtastic_hosts.clone(), i.serie_abierta.clone()),
            Err(_) => return,
        };
        let mut nodos: Vec<String> = Vec::new();
        if tcp_abierto("127.0.0.1", PUERTO_MESHTASTIC, 300) {
            nodos.push("127.0.0.1 (meshtasticd)".into());
        }
        for h in hosts.iter().take(4) {
            if tcp_abierto(h, PUERTO_MESHTASTIC, 800) {
                nodos.push(h.clone());
            }
        }
        let lora = evaluar_lora(&puertos_serie(), serie_abierta.as_deref(), &nodos, cfg!(target_os = "android"));
        let rnsd = buscar_ejecutable("rnsd");
        let reticulum = evaluar_reticulum(rnsd.as_deref(), proceso_corriendo("rnsd"), tcp_abierto("127.0.0.1", PUERTO_RNS, 300));
        let net = tcp_abierto("1.1.1.1", 443, 1500) || tcp_abierto("9.9.9.9", 443, 1500);
        let internet = if net {
            antena("internet", "Internet", "viva", "Hay salida a internet.".into(), true, vec![])
        } else {
            antena("internet", "Internet", "apagada", "Sin salida a internet: la malla local sigue funcionando.".into(), true, vec![])
        };
        if let Ok(mut i) = self.interno.lock() {
            i.lora = lora;
            i.reticulum = reticulum;
            i.internet = internet;
        }
        self.avisar();
    }

    fn flags(&self, i: &Interno) -> u8 {
        let mut f = 0u8;
        if i.config.nas {
            f |= faro::FLAG_NAS;
        }
        if i.lora.estado == "viva" {
            f |= faro::FLAG_LORA;
        }
        if i.segundo_plano {
            f |= faro::FLAG_SEGUNDO_PLANO;
        }
        f
    }

    fn faro_saliente(&self) -> Option<[u8; faro::LARGO]> {
        let mut i = self.interno.lock().ok()?;
        if i.config.faro_apagado {
            return None;
        }
        let nonce = faro::nonce_nuevo();
        i.propios_nonces.push(nonce);
        if i.propios_nonces.len() > 16 {
            i.propios_nonces.remove(0);
        }
        Some(faro::construir(
            i.clave.as_deref(),
            i.config.neurona.as_deref(),
            self.tipo,
            self.flags(&i),
            0,
            ahora_s(),
            nonce,
        ))
    }

    fn recibir(&self, datos: &[u8], de: SocketAddr) -> bool {
        let Some(f) = faro::leer(datos) else { return false };
        let Ok(mut i) = self.interno.lock() else { return false };
        if i.propios_nonces.contains(&f.nonce) {
            return false; // el eco de nuestro propio faro
        }
        let ip = de.ip().to_string();
        let ahora = ahora_s();
        let propia = i.clave.as_deref().map(|k| faro::es_de_mi_cuenta(&f, k, ahora)).unwrap_or(false);
        if !propia {
            i.otras.insert(ip, Instant::now());
            return true;
        }
        let neurona = i.clave.as_deref().and_then(|k| faro::que_neurona(&f, k, &i.config.conocidas)).map(String::from);
        let v = Vecino {
            ip: ip.clone(),
            tipo: f.tipo.nombre().into(),
            propia: true,
            neurona,
            puerto_servicio: f.puerto_servicio,
            nas: f.flags & faro::FLAG_NAS != 0,
            lora: f.flags & faro::FLAG_LORA != 0,
            segundo_plano: f.flags & faro::FLAG_SEGUNDO_PLANO != 0,
            visto_hace_s: 0,
        };
        let nuevo = !i.vecinos.contains_key(&ip);
        i.vecinos.insert(ip, (v, Instant::now()));
        nuevo
    }

    fn caducar(&self) -> bool {
        let Ok(mut i) = self.interno.lock() else { return false };
        let limite = Duration::from_secs(faro::CADUCA_SEGUNDOS);
        let antes = i.vecinos.len() + i.otras.len();
        i.vecinos.retain(|_, (_, t)| t.elapsed() < limite);
        i.otras.retain(|_, t| t.elapsed() < limite);
        antes != i.vecinos.len() + i.otras.len()
    }

    fn poner_wifi(&self, estado: &str, motivo: String) {
        if let Ok(mut i) = self.interno.lock() {
            let n = i.vecinos.len();
            let detalle = if n > 0 { vec![format!("{n} neurona(s) de tu cuenta en esta red")] } else { vec![] };
            i.wifi = antena("wifi-local", "Wi-Fi local", estado, motivo, true, detalle);
        }
    }
}

fn cargar_config(dir: &Path) -> ConfigAntenas {
    std::fs::read_to_string(dir.join(ARCHIVO_CONFIG))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

fn guardar_config(dir: &Path, c: &ConfigAntenas) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let ruta = dir.join(ARCHIVO_CONFIG);
    std::fs::write(&ruta, serde_json::to_string_pretty(c).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&ruta, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

fn abrir_socket_faro() -> Result<UdpSocket, String> {
    let grupo = Ipv4Addr::from(faro::GRUPO_MULTICAST);
    let s = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, faro::PUERTO))
        .map_err(|e| format!("El puerto {} del faro está ocupado (¿otra app StarSeed abierta?): {e}", faro::PUERTO))?;
    s.join_multicast_v4(&grupo, &Ipv4Addr::UNSPECIFIED)
        .map_err(|e| format!("No se pudo unir al grupo local {grupo}: {e} (¿sin Wi-Fi o sin permiso de red local?)"))?;
    let _ = s.set_multicast_ttl_v4(1); // solo esta red: el faro nunca sale del router
    let _ = s.set_multicast_loop_v4(true);
    let _ = s.set_read_timeout(Some(Duration::from_secs(1)));
    Ok(s)
}

fn arrancar_hilos(g: Arc<Guardian>) {
    // Hilo 1: faro (emitir cada 15 s, escuchar siempre, reintentar si no hay red).
    let gf = g.clone();
    std::thread::Builder::new()
        .name("starseed-faro".into())
        .spawn(move || {
            let destino = SocketAddr::from((faro::GRUPO_MULTICAST, faro::PUERTO));
            loop {
                let socket = match abrir_socket_faro() {
                    Ok(s) => s,
                    Err(e) => {
                        gf.poner_wifi("apagada", e);
                        gf.avisar();
                        std::thread::sleep(Duration::from_secs(30));
                        continue;
                    }
                };
                let mut ultimo_envio: Option<Instant> = None;
                let mut buf = [0u8; 64];
                let mut fallos = 0u32;
                loop {
                    let toca = ultimo_envio.map(|t| t.elapsed() >= Duration::from_secs(faro::CADA_SEGUNDOS)).unwrap_or(true);
                    if toca {
                        ultimo_envio = Some(Instant::now());
                        match gf.faro_saliente() {
                            Some(b) => match socket.send_to(&b, destino) {
                                Ok(_) => {
                                    fallos = 0;
                                    let anonimo = gf.interno.lock().map(|i| i.clave.is_none()).unwrap_or(true);
                                    let motivo = if anonimo {
                                        "Anunciando en la red local cada 15 s (anónimo: falta la clave de faro de tu cuenta).".to_string()
                                    } else {
                                        "Anunciando y escuchando en la red local cada 15 s, también con la app cerrada.".to_string()
                                    };
                                    gf.poner_wifi("viva", motivo);
                                }
                                Err(e) => {
                                    fallos += 1;
                                    gf.poner_wifi("apagada", format!("No se pudo emitir el faro: {e}"));
                                }
                            },
                            None => gf.poner_wifi("apagada", "Apagado por ti en Ajustes → Antenas.".into()),
                        }
                        gf.caducar();
                        gf.avisar();
                        if fallos >= 4 {
                            break; // la red cambió: reabrir el socket
                        }
                    }
                    // Err = tiempo agotado (1 s): se sigue con el bucle.
                    if let Ok((n, de)) = socket.recv_from(&mut buf) {
                        if gf.recibir(&buf[..n], de) {
                            gf.avisar();
                        }
                    }
                }
                std::thread::sleep(Duration::from_secs(5));
            }
        })
        .ok();

    // Hilo 2: sondas (LoRa, Reticulum, Internet) cada 30 s.
    std::thread::Builder::new()
        .name("starseed-sondas".into())
        .spawn(move || loop {
            g.medir();
            std::thread::sleep(Duration::from_secs(30));
        })
        .ok();
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn reconoce_puertos_de_radio() {
        assert!(es_puerto_radio("cu.usbserial-0001"));
        assert!(es_puerto_radio("ttyACM0"));
        assert!(!es_puerto_radio("cu.Bluetooth-Incoming-Port"));
        assert!(!es_puerto_radio("tty.usbserial-0001"), "en macOS se usa cu.*, no tty.*");
    }

    #[test]
    fn lee_mode_de_windows() {
        let s = "\r\nStatus for device COM3:\r\n-----\r\n    Baud: 115200\r\nEstado para dispositivo COM12:\r\nStatus for device CON:\r\n";
        assert_eq!(leer_mode(s), vec!["COM12".to_string(), "COM3".to_string()]);
    }

    #[test]
    fn lora_dice_la_verdad() {
        let nada = evaluar_lora(&[], None, &[], false);
        assert_eq!(nada.estado, "apagada");
        let usb = evaluar_lora(&["/dev/ttyACM0".into()], None, &[], false);
        assert_eq!(usb.estado, "detectada", "enchufada no es viva");
        let abierta = evaluar_lora(&["/dev/ttyACM0".into()], Some("/dev/ttyACM0"), &[], false);
        assert_eq!(abierta.estado, "viva");
        let tcp = evaluar_lora(&[], None, &["192.168.1.40".into()], false);
        assert_eq!(tcp.estado, "viva");
        assert!(evaluar_lora(&[], None, &[], true).motivo.contains("Android"));
    }

    #[test]
    fn reticulum_dice_la_verdad() {
        assert_eq!(evaluar_reticulum(None, false, false).estado, "no-disponible");
        assert_eq!(evaluar_reticulum(Some(Path::new("/usr/local/bin/rnsd")), false, false).estado, "apagada");
        assert_eq!(evaluar_reticulum(None, true, false).estado, "viva");
    }

    #[test]
    fn tcp_cerrado_no_cuelga() {
        let t = Instant::now();
        assert!(!tcp_abierto("127.0.0.1", 1, 300));
        assert!(t.elapsed() < Duration::from_secs(2));
    }

    #[test]
    fn resumen_honesto() {
        let mut e = EstadoAntenas::sin_guardian("Nexus");
        assert_eq!(resumen(&e), "Antenas: sin medir");
        e.guardian_activo = true;
        e.antenas = vec![
            antena("wifi-local", "Wi-Fi local", "viva", "ok".into(), true, vec![]),
            antena("lora", "LoRa · Meshtastic", "detectada", "usb".into(), true, vec![]),
            antena("internet", "Internet", "viva", "ok".into(), true, vec![]),
        ];
        assert_eq!(resumen(&e), "Vivas: Wi-Fi local · Internet");
        e.otras_cerca = 2;
        assert_eq!(resumen(&e), "Vivas: Wi-Fi local · Internet — 2 neurona(s) StarSeed cerca");
        e.vecinos.push(Vecino {
            ip: "192.168.1.9".into(),
            tipo: "android".into(),
            propia: true,
            neurona: None,
            puerto_servicio: 0,
            nas: false,
            lora: false,
            segundo_plano: true,
            visto_hace_s: 3,
        });
        assert!(resumen(&e).ends_with("1 neurona(s) tuya(s) cerca"));
        e.antenas.iter_mut().for_each(|a| a.estado = "apagada".into());
        assert!(resumen(&e).starts_with("Ninguna antena viva"));
    }

    #[test]
    fn config_ida_y_vuelta() {
        let dir = std::env::temp_dir().join(format!("ss-antenas-{}", std::process::id()));
        let c = ConfigAntenas { clave_faro: Some("ab".repeat(32)), neurona: Some("mac".into()), nas: true, ..Default::default() };
        guardar_config(&dir, &c).unwrap();
        assert_eq!(cargar_config(&dir), c);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
