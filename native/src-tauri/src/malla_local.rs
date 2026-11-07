// ═══════════════════════════════════════════════════════════════════════════
// malla_local — canal de DATOS entre neuronas por la red local, sin internet (2026-11-07 · MSH1107A).
// ---------------------------------------------------------------------------
// Contrato: architecture/sincronizacion-neuronas.md §2.
//
// El faro (faro.rs + antenas.rs) solo dice «aquí hay una neurona». Esto es lo que faltaba:
// llevar bytes de una neurona a otra de la misma red. Pegamento fino con Tauri; la trama, la
// política de direcciones, el limitador y el buzón son puros y están probados en
// `malla_local_trama.rs`.
//
//   · Oyente TCP en 0.0.0.0:47071 (el puerto del faro + 1), solo en StarSeed OS y en un hilo
//     propio: sigue con la ventana cerrada mientras la app viva (bandeja / servicio de Android).
//     Corta las conexiones que no vengan de la red local, atiende como mucho 8 a la vez, limita
//     cada IP y lee UN mensaje por conexión con tiempo máximo de 3 s.
//   · Lo recibido se guarda en un buzón (anillo de 64, 10 min) y se emite a la webview como
//     `malla-local://mensaje` { seq, ip, cuerpo, recibido_ms }. Al arrancar, la web pide lo que
//     llegó antes de escuchar con `malla_local_recibidos(desde)`.
//   · `malla_local_enviar { ip, puerto?, json }` conecta (2 s), escribe y espera el ACUSE (3 s):
//     devuelve los ms de ida y vuelta. Sin acuse es un error, nunca un «enviado».
//   · `malla_local_estado` dice si escucha, por qué no, y las neuronas oídas por faro con su IP
//     (las de la cuenta con su id; las demás, solo la IP).
//
// SOLO TRANSPORTA. Quién manda y si es auténtico lo decide la capa TS con las firmas de la
// identidad de malla (src/lib/malla/sincronizacion-neuronas*.ts).
// ═══════════════════════════════════════════════════════════════════════════

use crate::malla_local_trama::{self as trama, Buzon, Limitador, Recibido};
use serde::Serialize;
use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicU16, AtomicUsize, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

pub const EVENTO_MENSAJE: &str = "malla-local://mensaje";
const CONECTAR_MS: u64 = 2_000;
const LEER_ESCRIBIR_MS: u64 = 3_000;
const MAX_CONEXIONES: usize = 8;
const BUZON_CAP: usize = 64;
const BUZON_EDAD_MS: u64 = 10 * 60_000;
// Límite por IP: `trama::LIMITE_MENSAJES` cada `trama::LIMITE_VENTANA_MS` (300 / 10 s desde MLT1107A).

// El canal escucha justo al lado del faro: si alguien cambia uno sin el otro, no compila.
const _: () = assert!(trama::PUERTO as u32 == crate::faro::PUERTO as u32 + 1);

struct Estado {
    escuchando: bool,
    motivo: String,
    buzon: Buzon,
    limitador: Limitador,
}

fn estado() -> &'static Mutex<Estado> {
    static E: OnceLock<Mutex<Estado>> = OnceLock::new();
    E.get_or_init(|| {
        Mutex::new(Estado {
            escuchando: false,
            motivo: "El canal local aún no ha arrancado.".into(),
            buzon: Buzon::nuevo(BUZON_CAP),
            limitador: Limitador::nuevo(trama::LIMITE_MENSAJES, trama::LIMITE_VENTANA_MS),
        })
    })
}

fn con_estado<T>(f: impl FnOnce(&mut Estado) -> T) -> T {
    let mut g = match estado().lock() {
        Ok(g) => g,
        Err(envenenado) => envenenado.into_inner(),
    };
    f(&mut g)
}

static PUERTO_ACTIVO: AtomicU16 = AtomicU16::new(0);
static CONEXIONES: AtomicUsize = AtomicUsize::new(0);
static ARRANCADO: AtomicBool = AtomicBool::new(false);

/// Puerto que anuncia el faro en `puerto_servicio` (0 = el canal no escucha ahora).
pub fn puerto_anunciado() -> u16 {
    PUERTO_ACTIVO.load(Ordering::Relaxed)
}

fn ahora_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

// ───────────────────────────── Tipos para la web ─────────────────────────────

#[derive(Serialize, Clone, Debug)]
pub struct MensajeLocal {
    pub seq: u64,
    pub ip: String,
    pub cuerpo: String,
    pub recibido_ms: u64,
}

impl From<Recibido> for MensajeLocal {
    fn from(r: Recibido) -> Self {
        MensajeLocal { seq: r.seq, ip: r.ip, cuerpo: r.cuerpo, recibido_ms: r.recibido_ms }
    }
}

#[derive(Serialize, Clone, Debug)]
pub struct VecinoLocal {
    pub ip: String,
    /// Reconocida como de esta cuenta por la clave de faro.
    pub propia: bool,
    /// Id de neurona si el faro lo dejó comprobar (solo las de la cuenta).
    pub neurona: Option<String>,
    pub tipo: String,
    /// Puerto del canal local al que escribirle.
    pub puerto: u16,
    /// Some(true): su faro anuncia el canal; Some(false): su app es anterior y no lo tiene;
    /// None: no se sabe (faros de otras cuentas o anónimos).
    pub canal: Option<bool>,
    pub visto_hace_s: u64,
}

#[derive(Serialize, Clone, Debug)]
pub struct EstadoMallaLocal {
    pub escuchando: bool,
    pub puerto: u16,
    pub motivo: String,
    pub ultimo_seq: u64,
    pub vecinos: Vec<VecinoLocal>,
    /// Lo que este oyente admite (MLT1107A): la web lo anuncia a las neuronas vinculadas para que
    /// nunca le manden más de lo que su limitador deja pasar. Una app anterior no lo dice.
    pub max_cuerpo: usize,
    pub limite_mensajes: u32,
    pub limite_ventana_ms: u64,
}

#[derive(Serialize, Clone, Debug)]
pub struct EnvioLocal {
    pub ip: String,
    pub puerto: u16,
    /// Ida y vuelta medida: conectar + mensaje + acuse.
    pub ms: u64,
}

// ─────────────────────────────── Oyente ───────────────────────────────

/// Arranca el oyente (una vez por proceso; solo StarSeed OS).
pub fn iniciar(app: &AppHandle) {
    if !crate::nativa::es_starseed_os(app) {
        con_estado(|e| e.motivo = "Este portal no lleva el canal local: vive en StarSeed OS.".into());
        return;
    }
    if ARRANCADO.swap(true, Ordering::SeqCst) {
        return;
    }
    let h = app.clone();
    let _ = std::thread::Builder::new().name("starseed-malla-local".into()).spawn(move || bucle(h));
}

fn bucle(app: AppHandle) {
    loop {
        match TcpListener::bind(SocketAddrV4::new(Ipv4Addr::UNSPECIFIED, trama::PUERTO)) {
            Ok(oyente) => {
                PUERTO_ACTIVO.store(trama::PUERTO, Ordering::Relaxed);
                con_estado(|e| {
                    e.escuchando = true;
                    e.motivo = format!("Escuchando a otras neuronas de esta red (TCP {}), también sin internet.", trama::PUERTO);
                });
                let mut fallos = 0u32;
                for entrante in oyente.incoming() {
                    match entrante {
                        Ok(s) => {
                            fallos = 0;
                            atender(&app, s);
                        }
                        Err(_) => {
                            fallos += 1;
                            if fallos >= 50 {
                                break; // la red cambió o el sistema se quedó sin descriptores: reabrir
                            }
                            std::thread::sleep(Duration::from_millis(200));
                        }
                    }
                }
                PUERTO_ACTIVO.store(0, Ordering::Relaxed);
                con_estado(|e| {
                    e.escuchando = false;
                    e.motivo = "El canal local se cerró; se reabre en 30 s.".into();
                });
            }
            Err(err) => {
                con_estado(|e| {
                    e.escuchando = false;
                    e.motivo = format!(
                        "No se pudo abrir el puerto TCP {} (¿otra app StarSeed abierta en este aparato?): {err}",
                        trama::PUERTO
                    );
                });
            }
        }
        std::thread::sleep(Duration::from_secs(30));
    }
}

/// Plaza ocupada en el tope de conexiones: se devuelve sola al soltarse.
struct Plaza;

impl Drop for Plaza {
    fn drop(&mut self) {
        CONEXIONES.fetch_sub(1, Ordering::SeqCst);
    }
}

fn atender(app: &AppHandle, s: TcpStream) {
    let ip = match s.peer_addr() {
        Ok(SocketAddr::V4(a)) => *a.ip(),
        _ => return,
    };
    // Solo la red local: una conexión desde internet (un puerto reenviado en el router) se corta.
    if trama::ip_local(&ip.to_string()).is_none() {
        return;
    }
    if CONEXIONES.fetch_add(1, Ordering::SeqCst) >= MAX_CONEXIONES {
        CONEXIONES.fetch_sub(1, Ordering::SeqCst);
        return;
    }
    let plaza = Plaza;
    let h = app.clone();
    // Si el hilo no llega a arrancar, el cierre (con la plaza dentro) se suelta y la devuelve.
    let _ = std::thread::Builder::new().name("starseed-malla-local-conexion".into()).spawn(move || {
        let _plaza = plaza;
        let mut s = s;
        let _ = s.set_read_timeout(Some(Duration::from_millis(LEER_ESCRIBIR_MS)));
        let _ = s.set_write_timeout(Some(Duration::from_millis(LEER_ESCRIBIR_MS)));
        let ip_texto = ip.to_string();
        let ahora = ahora_ms();
        if !con_estado(|e| e.limitador.permitir(&ip_texto, ahora)) {
            return;
        }
        let Ok(cuerpo) = trama::leer_mensaje(&mut s) else { return };
        let recibido = con_estado(|e| e.buzon.poner(&ip_texto, cuerpo, ahora));
        let _ = trama::acusar(&mut s);
        let _ = h.emit(EVENTO_MENSAJE, MensajeLocal::from(recibido));
    });
}

// ─────────────────────────────── Envío ───────────────────────────────

/// Envía un JSON a otra neurona de la red local y espera su acuse. Devuelve los ms de ida y vuelta.
pub fn enviar(ip: &str, puerto: u16, json: &str) -> Result<u64, String> {
    let ip4 = trama::ip_local(ip).ok_or_else(|| {
        format!("«{ip}» no es una dirección de esta red local: el canal local solo habla con neuronas de la misma red.")
    })?;
    if !trama::puerto_valido(puerto) {
        return Err(format!("El puerto {puerto} no vale para el canal local."));
    }
    trama::validar_cuerpo(json).map_err(|e| format!("No se envía: {e}."))?;
    let destino = SocketAddr::V4(SocketAddrV4::new(ip4, puerto));
    let inicio = Instant::now();
    let mut s = TcpStream::connect_timeout(&destino, Duration::from_millis(CONECTAR_MS)).map_err(|e| {
        format!("No se pudo conectar con {destino}: {e} (¿tiene la app nativa abierta o en segundo plano?)")
    })?;
    let _ = s.set_nodelay(true);
    let _ = s.set_read_timeout(Some(Duration::from_millis(LEER_ESCRIBIR_MS)));
    let _ = s.set_write_timeout(Some(Duration::from_millis(LEER_ESCRIBIR_MS)));
    trama::enviar_y_esperar(&mut s, json).map_err(|e| format!("{destino}: {e}"))?;
    Ok(inicio.elapsed().as_millis() as u64)
}

fn vecinos_locales() -> Vec<VecinoLocal> {
    let Some(g) = crate::antenas::Guardian::actual() else { return Vec::new() };
    let mut v: Vec<VecinoLocal> = g
        .estado()
        .vecinos
        .into_iter()
        .map(|x| VecinoLocal {
            puerto: if trama::puerto_valido(x.puerto_servicio) { x.puerto_servicio } else { trama::PUERTO },
            canal: Some(x.puerto_servicio != 0),
            ip: x.ip,
            propia: x.propia,
            neurona: x.neurona,
            tipo: x.tipo,
            visto_hace_s: x.visto_hace_s,
        })
        .collect();
    for (ip, visto_hace_s) in g.otras_cercanas() {
        if v.iter().any(|x| x.ip == ip) {
            continue;
        }
        v.push(VecinoLocal {
            ip,
            propia: false,
            neurona: None,
            tipo: "desconocido".into(),
            puerto: trama::PUERTO,
            canal: None,
            visto_hace_s,
        });
    }
    v
}

// ─────────────────────────────── Comandos ───────────────────────────────

#[tauri::command]
pub async fn malla_local_enviar(ip: String, puerto: Option<u16>, json: String) -> Result<EnvioLocal, String> {
    let puerto = puerto.unwrap_or(trama::PUERTO);
    tauri::async_runtime::spawn_blocking(move || enviar(&ip, puerto, &json).map(|ms| EnvioLocal { ip, puerto, ms }))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn malla_local_estado() -> EstadoMallaLocal {
    let (escuchando, motivo, ultimo_seq) = con_estado(|e| (e.escuchando, e.motivo.clone(), e.buzon.ultimo()));
    EstadoMallaLocal {
        escuchando,
        puerto: if escuchando { trama::PUERTO } else { 0 },
        motivo,
        ultimo_seq,
        vecinos: vecinos_locales(),
        max_cuerpo: trama::MAX_CUERPO,
        limite_mensajes: trama::LIMITE_MENSAJES,
        limite_ventana_ms: trama::LIMITE_VENTANA_MS,
    }
}

/// Lo recibido después de `desde` (la web lo pide al arrancar: nada se pierde por llegar antes).
#[tauri::command]
pub fn malla_local_recibidos(desde: u64) -> Vec<MensajeLocal> {
    let ahora = ahora_ms();
    con_estado(|e| e.buzon.desde(desde, ahora, BUZON_EDAD_MS)).into_iter().map(MensajeLocal::from).collect()
}
