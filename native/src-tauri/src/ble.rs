// ═══════════════════════════════════════════════════════════════════════════
// ble — Bluetooth directo entre neuronas: estado, radio de cada sistema y comandos (BLE1108A).
// ---------------------------------------------------------------------------
// Contrato: architecture/bluetooth-directo.md. Lo puro (anuncio, trama, paquetes, parada y
// espera, vecindario) está probado en `ble_trama.rs`; aquí se junta con la radio y con la web.
//
//   · El NÚCLEO vive en el proceso (no en la página): en Android lo arranca el primer evento de
//     Kotlin (BleStarSeed.kt, también con la app cerrada mientras el servicio «Segundo plano» tiene
//     vivo el proceso); en escritorio, `iniciar` desde el arranque de la app (solo StarSeed OS).
//   · La RADIO de cada sistema solo mueve bytes (`Radio`): Android (Kotlin por JNI, ble_android.rs)
//     macOS (CoreBluetooth, ble_macos.rs) y Windows (WinRT, ble_windows.rs, WIN1109B; sin L2CAP). Linux e iOS dicen que no lo tienen.
//   · Un hilo propio cada 250 ms: plazos de acuse, rotación del anuncio (ventana de 5 min o clave
//     nueva), vecinos que caducan y a qué neuronas de la cuenta conectar solo.
//   · A la web: `ble_estado`, `ble_abrir`, `ble_cerrar`, `ble_enviar` (espera el ACUSE de la otra
//     app), `ble_recibidos`, `ble_activar`, `ble_pedir_permiso`, `ble_registro` y
//     `ble_registro_anexar` (BLE1108B: registro de eventos del enlace); eventos `ble://mensaje` y
//     `ble://cambio`. Mismo papel que `malla_local.rs` con el TCP 47071.
//
// SOLO TRANSPORTA. Quién manda y si es auténtico lo decide la capa web con el saludo firmado
// (`nl.hola` con la prueba de cuenta), igual que por la red local.
// ═══════════════════════════════════════════════════════════════════════════

#![allow(dead_code)]

use crate::ble_l2cap::{self as l2, Carril, Castigos, Desmarcador};
use crate::ble_trama::{self as bt, Enlace, Hecho, Vecindario};
use crate::malla_local_trama::{Buzon, Limitador, Recibido};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub const EVENTO_MENSAJE: &str = "ble://mensaje";
pub const EVENTO_CAMBIO: &str = "ble://cambio";
pub const ARCHIVO_PREFERENCIA: &str = "ble.json";
const BUZON_CAP: usize = 128;
const BUZON_EDAD_MS: u64 = 10 * 60_000;
const TIC_MS: u64 = 250;
/// Entre dos avisos `ble://cambio` (los vecinos se oyen varias veces por segundo).
const ENTRE_CAMBIOS_MS: u64 = 1_000;

// ───────────────────────────── La radio de cada sistema ─────────────────────────────

/// Lo que hace la radio. Ninguna llamada vuelve al núcleo desde dentro (encolan y responden luego
/// con los `al_*` de abajo), así que se puede llamar sin miedo a cerrojos cruzados.
pub trait Radio: Send + Sync {
    /// ¿Esta plataforma tiene Bluetooth directo en esta app?
    fn disponible(&self) -> bool;
    /// Abrir el servidor GATT y escanear (si hay permiso y el Bluetooth está encendido).
    fn arrancar(&self);
    /// (Re)anunciar con este UUID (el anuncio rota cada 5 min).
    fn anunciar(&self, uuid: &str);
    /// Conectar como central con el aparato de esa dirección.
    fn conectar(&self, direccion: &str);
    /// Cerrar el enlace con ese id de plataforma («c:…» o «p:…»).
    fn desconectar(&self, plataforma: &str);
    /// Hay paquetes para ese enlace: que los pida con `siguiente_paquete`.
    fn hay_datos(&self, plataforma: &str);
    /// Pedir a la persona los permisos de Bluetooth (Android) o abrir dónde se dan (macOS).
    fn pedir_permiso(&self);
    /// Apagar anuncio, escaneo y enlaces (la persona lo apagó).
    fn parar(&self);
    /// (BLE1109A) Abrir el canal L2CAP (carril rápido) con el PSM que publicó el otro. Responde con
    /// `al_l2cap_abierto` o `al_l2cap_cerrado`. Sin soporte: no hace nada y el enlace sigue por GATT.
    fn abrir_l2cap(&self, _plataforma: &str, _psm: u16) {}
    /// (BLE1109A) Cerrar el canal L2CAP de ese enlace (no el enlace GATT).
    fn cerrar_l2cap(&self, _plataforma: &str) {}
    /// (BLE1109B) Si el canal rápido está permitido (ajuste, por defecto SÍ). Se llama antes de `arrancar`. Con false la
    /// radio NO publica la característica PSM, ni el canal, ni pide PHY 2M: el servicio GATT es el de prueba.30.
    fn canal_rapido(&self, _activo: bool) {}
    /// (BLE1109B) Leer la característica PSM del periférico. Solo se pide cuando el enlace YA está ligado por GATT: así la
    /// negociación del canal rápido nunca compite con el saludo. Sin soporte: no hace nada.
    fn leer_psm(&self, _plataforma: &str) {}
    /// (BLE1109B) «Compartir registro de enlaces»: Android abre la hoja de compartir con este texto. true = lo hizo.
    fn compartir_registro(&self, _titulo: &str, _texto: &str) -> bool {
        false
    }
}

/// Sistemas sin radio en esta app (Windows, Linux, iOS por ahora).
struct RadioNula;

impl Radio for RadioNula {
    fn disponible(&self) -> bool {
        false
    }
    fn arrancar(&self) {}
    fn anunciar(&self, _uuid: &str) {}
    fn conectar(&self, _direccion: &str) {}
    fn desconectar(&self, _plataforma: &str) {}
    fn hay_datos(&self, _plataforma: &str) {}
    fn pedir_permiso(&self) {}
    fn parar(&self) {}
}

pub const MOTIVO_SIN_RADIO: &str =
    "En este sistema la app aún no trae Bluetooth directo: la trae la app nativa de macOS, Windows (WinRT), Linux (BlueZ; se apaga con STARSEED_SIN_BLE_LINUX=1) y Android.";

/// (INT1109C) Papeles GATT de cada plataforma, con el mismo vocabulario que las `lanas` de la matriz
/// (`architecture/matriz-enlaces-directos.md`): macOS, Windows y Linux hacen de central y de periférico; Android también
/// (el central de BLE existe desde Android 5 y el periférico lo comprobó Kotlin al anunciar). Otros: ninguno.
pub fn roles_de(os: &str) -> &'static [&'static str] {
    match os {
        "macos" | "windows" | "linux" | "android" => &["central", "periferico"],
        _ => &[],
    }
}

/// (INT1109C) ¿Puede la plataforma abrir el canal L2CAP? macOS y Linux sí; Android desde la API 29 (LE CoC público);
/// Windows no (WinRT no tiene L2CAP CoC en LE: el PSM se publica como `[0, 0]`). Sin saber la API de Android, no.
pub fn l2cap_de(os: &str, sdk_android: Option<u32>) -> bool {
    match os {
        "macos" | "linux" => true,
        "android" => sdk_android.is_some_and(|v| v >= 29),
        _ => false,
    }
}

/// (INT1109C) API de Android (`ro.build.version.sdk`); en otros sistemas, nada.
#[cfg(target_os = "android")]
fn sdk_android() -> Option<u32> {
    static V: OnceLock<Option<u32>> = OnceLock::new();
    *V.get_or_init(|| {
        let salida = std::process::Command::new("getprop").arg("ro.build.version.sdk").output().ok()?;
        String::from_utf8_lossy(&salida.stdout).trim().parse().ok()
    })
}
#[cfg(not(target_os = "android"))]
fn sdk_android() -> Option<u32> {
    None
}

fn radio() -> &'static dyn Radio {
    static R: OnceLock<Box<dyn Radio>> = OnceLock::new();
    R.get_or_init(|| {
        #[cfg(target_os = "android")]
        {
            Box::new(crate::ble_android::RadioAndroid)
        }
        #[cfg(target_os = "macos")]
        {
            Box::new(crate::ble_macos::RadioMac)
        }
        // <WIN1109B> Windows: WinRT (ble_windows.rs), central y periférico, sin L2CAP.
        #[cfg(target_os = "windows")]
        {
            Box::new(crate::ble_windows::RadioWindows)
        }
        // LNX1109B: Linux habla con BlueZ por D-Bus (ble_linux.rs); la radio nace apagada con STARSEED_SIN_BLE_LINUX=1.
        #[cfg(target_os = "linux")]
        {
            Box::new(crate::ble_linux::RadioLinux)
        }
        #[cfg(not(any(target_os = "android", target_os = "macos", target_os = "windows", target_os = "linux")))]
        {
            Box::new(RadioNula)
        }
    })
    .as_ref()
}

// ───────────────────────────── Tipos para la web ─────────────────────────────

#[derive(Serialize, Clone, Debug)]
pub struct EstadoBle {
    /// Esta plataforma tiene Bluetooth directo en la app (macOS y Android).
    pub disponible: bool,
    /// La persona lo tiene encendido (por defecto sí).
    pub activo: bool,
    /// "arrancando" | "encendida" | "apagada" | "sin-permiso" | "no-disponible"
    pub radio: String,
    pub motivo: String,
    pub plataforma: String,
    /// (INT1109C) Papeles GATT que esta plataforma puede hacer: «central» y/o «periferico». Vacío sin radio.
    pub roles: Vec<String>,
    /// (INT1109C) ¿Puede abrir el canal rápido L2CAP (carril `ble-l2cap`)? Falso sin radio.
    pub l2cap: bool,
    /// Anunciándose ahora (UUID rotatorio).
    pub anunciando: bool,
    /// Los anuncios llevan la cuenta (hay clave de faro): tus neuronas se reconocen y se conectan solas.
    pub con_cuenta: bool,
    pub vecinos: Vec<VecinoBle>,
    pub enlaces: Vec<EnlaceBle>,
    pub ultimo_seq: u64,
    pub max_cuerpo: usize,
    pub limite_mensajes: u32,
    pub limite_ventana_ms: u64,
    pub paquete_max: usize,
}

#[derive(Serialize, Clone, Debug)]
pub struct VecinoBle {
    /// Id opaco («v» + 8 hex), estable mientras su dirección no rote.
    pub id: String,
    pub rssi: i16,
    /// Reconocido como de tu cuenta por la clave de faro.
    pub propia: bool,
    /// Id de neurona si el anuncio dejó comprobarlo (solo los de la cuenta).
    pub neurona: Option<String>,
    pub tipo: String,
    /// Su servidor GATT acepta conexiones.
    pub servidor: bool,
    pub visto_hace_ms: u64,
    /// Enlace abierto con él desde este aparato, si lo hay.
    pub enlace: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct EnlaceBle {
    /// «b1», «b2»… (la web lo usa como `ble:<id>`).
    pub id: String,
    /// "central" (este aparato conectó) | "periferico" (el otro conectó).
    pub rol: String,
    pub vecino: Option<String>,
    pub neurona: Option<String>,
    pub rssi: Option<i16>,
    /// Bytes por paquete (MTU negociado − 3).
    pub paquete: usize,
    /// Ida y vuelta medida del último mensaje acusado.
    pub rtt_ms: Option<u64>,
    /// Rendimiento medido del último mensaje de ≥ 2 KiB POR EL CARRIL EN USO (es la capacidad del enlace que
    /// ven el planificador y la escalera de vídeo). Sin medir en ese carril: null.
    pub kbps: Option<u32>,
    /// (BLE1109A) "gatt" | "rapido" (canal L2CAP abierto: todos los paquetes salen por él).
    pub carril: String,
    /// (BLE1109A) Estado del canal rápido: "sin-psm" | "disponible" | "abriendo" | "abierto".
    pub canal_rapido: String,
    /// (BLE1109A) PSM del canal L2CAP, si se conoce.
    pub psm: Option<u16>,
    /// (BLE1109A) Lo medido en cada carril (el otro puede seguir con su último valor).
    pub kbps_rapido: Option<u32>,
    pub kbps_gatt: Option<u32>,
    pub pendientes: usize,
    pub bytes_enviados: u64,
    pub bytes_recibidos: u64,
    pub abierto_hace_ms: u64,
}

#[derive(Serialize, Clone, Debug)]
pub struct MensajeBle {
    pub seq: u64,
    pub enlace: String,
    pub cuerpo: String,
    pub recibido_ms: u64,
}

impl From<Recibido> for MensajeBle {
    fn from(r: Recibido) -> Self {
        MensajeBle { seq: r.seq, enlace: r.ip, cuerpo: r.cuerpo, recibido_ms: r.recibido_ms }
    }
}

/// (BLE1108B) Una línea del registro de eventos del enlace: por qué se abrió, se cayó o no se envió algo.
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct RegistroBle {
    pub seq: u64,
    /// Epoch ms.
    pub ms: u64,
    /// "radio" | "enlace-abierto" | "enlace-cerrado" | "mtu" | "conectar" | "envio-fallido" | "silencio" | "anuncio".
    pub tipo: String,
    pub enlace: Option<String>,
    pub neurona: Option<String>,
    pub detalle: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct EnvioBle {
    pub enlace: String,
    /// Desde que se encoló hasta el acuse de la otra app.
    pub ms: u64,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct PreferenciaBle {
    pub activo: bool,
    /// (BLE1109B) «Canal rápido Bluetooth (experimental)»: por defecto ENCENDIDO (también para quien viene de prueba.31, que
    /// no tenía el ajuste); es seguro por construcción: solo tras «ligado», con autoprueba de eco y caída a GATT.
    #[serde(default = "canal_rapido_defecto")]
    pub canal_rapido: bool,
}

fn canal_rapido_defecto() -> bool {
    true
}

impl Default for PreferenciaBle {
    fn default() -> Self {
        PreferenciaBle { activo: true, canal_rapido: true }
    }
}

// ───────────────────────────── Eventos de la radio (puro) ─────────────────────────────

/// Lo que cuenta la radio. Kotlin lo manda como JSON (`PuenteBle.evento`); macOS llama directo.
#[derive(Debug, PartialEq, Eq, Clone)]
pub enum EventoRadio {
    /// Estado de la radio: "encendida" | "apagada" | "sin-permiso" | "no-disponible".
    Radio { estado: String, motivo: String },
    /// Un anuncio StarSeed oído.
    Visto { direccion: String, uuid: [u8; 16], rssi: i16 },
    /// Enlace LISTO para datos (central: servicios, MTU y suscripción hechos; periférico: el otro se suscribió).
    Conectado { enlace: String, rol: String, direccion: Option<String>, paquete: usize },
    Mtu { enlace: String, paquete: usize },
    Desconectado { enlace: String, motivo: String },
    /// (BLE1108C) Un hito de la radio para el registro (`servicios-descubiertos`, `suscrito`, `sin-suscripcion`,
    /// `listo-tarde`, `suscripcion-reintento`). No cambia ningún estado: solo deja rastro.
    Nota { enlace: Option<String>, tipo: String, detalle: String },
    /// (BLE1109A) El central leyó el PSM que publica el periférico (característica `PSM`). Inválido (0, > 255): se ignora.
    Psm { enlace: String, psm: u16 },
    /// (BLE1109A) El canal L2CAP abrió (lo pedimos o lo aceptamos). `psm` si se conoce.
    L2capAbierto { enlace: String, psm: Option<u16> },
    /// (BLE1109A) El canal L2CAP se cerró o no abrió; el enlace GATT sigue.
    L2capCerrado { enlace: String, motivo: String },
}

/// Los hitos que la radio puede anotar (lista cerrada: el texto libre va en el detalle).
pub const NOTAS_RADIO: [&str; 14] = [
    // BLE1110A: cambios de MTU (anterior → nuevo), anuncio que ya estaba activo (código 3) y conexión soltada para renegociar el MTU.
    "mtu-cambio",
    "anuncio-ya-activo",
    "mtu-soltado",
    "servicios-descubiertos",
    "suscrito",
    "sin-suscripcion",
    "listo-tarde",
    "suscripcion-reintento",
    // (BLE1109B) Autocuración del periférico Android, compartir el registro y la conexión vencida / redescubrimiento de macOS.
    "autocuracion",
    "compartir-fallido",
    "conexion-vencida",
    "redescubriendo",
    "l2cap-servidor", // BLE1109B: el socket L2CAP del periférico Android (creado en su propio hilo)
    "contador-enlaces", // MLL1111C: conexiones y desconexiones REALES por minuto (y los avisos repetidos aparte)
];

fn texto_de(v: &serde_json::Value, k: &str, max: usize) -> Option<String> {
    v.get(k).and_then(|x| x.as_str()).map(|s| s.trim()).filter(|s| !s.is_empty()).map(|s| s.chars().take(max).collect())
}

/// Un id de plataforma válido: «c:…» o «p:…», corto y sin caracteres raros.
pub fn plataforma_valida(p: &str) -> bool {
    (p.starts_with("c:") || p.starts_with("p:"))
        && p.len() <= 80
        && p[2..].chars().all(|c| c.is_ascii_alphanumeric() || c == ':' || c == '-')
        && p.len() > 2
}

/// JSON de Kotlin → evento. Lo que no tenga sentido → None (se ignora).
pub fn leer_evento(json: &str) -> Option<EventoRadio> {
    let v: serde_json::Value = serde_json::from_str(json).ok()?;
    match v.get("e")?.as_str()? {
        "radio" => {
            let estado = texto_de(&v, "estado", 20)?;
            if !["encendida", "apagada", "sin-permiso", "no-disponible"].contains(&estado.as_str()) {
                return None;
            }
            Some(EventoRadio::Radio { estado, motivo: texto_de(&v, "motivo", 300).unwrap_or_default() })
        }
        "visto" => {
            let uuid = bt::uuid_bytes(&texto_de(&v, "uuid", 40)?)?;
            if !bt::es_anuncio(&uuid) {
                return None;
            }
            let rssi = v.get("rssi").and_then(|x| x.as_i64()).unwrap_or(-127).clamp(-127, 20) as i16;
            Some(EventoRadio::Visto { direccion: texto_de(&v, "direccion", 64)?, uuid, rssi })
        }
        "conectado" => {
            let enlace = texto_de(&v, "enlace", 80).filter(|p| plataforma_valida(p))?;
            let rol = texto_de(&v, "rol", 12).filter(|r| r == "central" || r == "periferico")?;
            let paquete = v.get("paquete").and_then(|x| x.as_u64()).unwrap_or(bt::PAQUETE_MIN as u64) as usize;
            Some(EventoRadio::Conectado { enlace, rol, direccion: texto_de(&v, "direccion", 64), paquete: paquete.clamp(bt::PAQUETE_MIN, bt::PAQUETE_MAX) })
        }
        "mtu" => {
            let enlace = texto_de(&v, "enlace", 80).filter(|p| plataforma_valida(p))?;
            let paquete = v.get("paquete").and_then(|x| x.as_u64())? as usize;
            Some(EventoRadio::Mtu { enlace, paquete: paquete.clamp(bt::PAQUETE_MIN, bt::PAQUETE_MAX) })
        }
        "desconectado" => {
            let enlace = texto_de(&v, "enlace", 80).filter(|p| plataforma_valida(p))?;
            Some(EventoRadio::Desconectado { enlace, motivo: texto_de(&v, "motivo", 300).unwrap_or_else(|| "el enlace Bluetooth se cerró".into()) })
        }
        "nota" => {
            let tipo = texto_de(&v, "tipo", 40).filter(|t| NOTAS_RADIO.contains(&t.as_str()))?;
            let enlace = texto_de(&v, "enlace", 80).filter(|p| plataforma_valida(p));
            Some(EventoRadio::Nota { enlace, tipo, detalle: texto_de(&v, "detalle", 200).unwrap_or_default() })
        }
        "psm" => {
            let enlace = texto_de(&v, "enlace", 80).filter(|p| plataforma_valida(p))?;
            let psm = v.get("psm").and_then(|x| x.as_u64()).and_then(|x| u16::try_from(x).ok()).filter(|p| l2::psm_valido(*p))?;
            Some(EventoRadio::Psm { enlace, psm })
        }
        "l2cap-abierto" => {
            let enlace = texto_de(&v, "enlace", 80).filter(|p| plataforma_valida(p))?;
            let psm = v.get("psm").and_then(|x| x.as_u64()).and_then(|x| u16::try_from(x).ok()).filter(|p| l2::psm_valido(*p));
            Some(EventoRadio::L2capAbierto { enlace, psm })
        }
        "l2cap-cerrado" => {
            let enlace = texto_de(&v, "enlace", 80).filter(|p| plataforma_valida(p))?;
            Some(EventoRadio::L2capCerrado { enlace, motivo: texto_de(&v, "motivo", 200).unwrap_or_else(|| "el canal L2CAP se cerró".into()) })
        }
        _ => None,
    }
}

/// Lleva un evento al núcleo.
pub fn aplicar_evento(ev: EventoRadio) {
    match ev {
        EventoRadio::Radio { estado, motivo } => al_radio(&estado, &motivo),
        EventoRadio::Visto { direccion, uuid, rssi } => al_ver(&direccion, &uuid, rssi),
        EventoRadio::Conectado { enlace, rol, direccion, paquete } => al_conectar(&enlace, &rol, direccion.as_deref(), paquete),
        EventoRadio::Mtu { enlace, paquete } => al_mtu(&enlace, paquete),
        EventoRadio::Desconectado { enlace, motivo } => al_desconectar(&enlace, &motivo),
        EventoRadio::Nota { enlace, tipo, detalle } => nota(enlace.as_deref(), &tipo, &detalle),
        EventoRadio::Psm { enlace, psm } => al_psm(&enlace, psm),
        EventoRadio::L2capAbierto { enlace, psm } => al_l2cap_abierto(&enlace, psm),
        EventoRadio::L2capCerrado { enlace, motivo } => al_l2cap_cerrado(&enlace, &motivo),
    }
}

// ───────────────────────────── Núcleo ─────────────────────────────

struct EnlaceVivo {
    id: String,
    plataforma: String,
    rol: &'static str,
    vecino: Option<String>,
    neurona: Option<String>,
    desde_ms: u64,
    nucleo: Enlace,
    /// (BLE1108C) Hitos de datos ya anotados: primer paquete recibido / enviado.
    dato_visto: bool,
    dato_salido: bool,
    /// (BLE1109A) Carril rápido (canal L2CAP) de este enlace y el desmarcador de su flujo.
    carril: Carril,
    desmarcador: Desmarcador,
}

/// Lo que se sabe de la cuenta (de la configuración de antenas): clave de faro, esta neurona y las demás.
#[derive(Clone, Default, PartialEq, Eq)]
struct Cuenta {
    clave: Option<Vec<u8>>,
    neurona: Option<String>,
    conocidas: Vec<String>,
}

struct Estado {
    activo: bool,
    radio: String,
    motivo: String,
    /// UUID anunciado y su ventana (None: hay que anunciar en el siguiente tic).
    anuncio: Option<(String, u32)>,
    cuenta: Cuenta,
    vecindario: Vecindario,
    enlaces: Vec<EnlaceVivo>,
    buzon: Buzon,
    limitador: Limitador,
    siguiente_enlace: u64,
    siguiente_token: u64,
    esperas: HashMap<u64, mpsc::Sender<Result<u64, String>>>,
    ultimo_cambio_ms: u64,
    cambio_pendiente: bool,
    dir: Option<PathBuf>,
    /// (BLE1108B) Últimos eventos del enlace (anillo) y lo que falta por volcar a `enlaces.log`.
    registro: VecDeque<RegistroBle>,
    siguiente_reg: u64,
    por_volcar: Vec<String>,
    /// (BLE1110A) Líneas idénticas consecutivas de `enlaces.log` → «… (×N)».
    colapso: crate::ble_autocura::Colapsador,
    /// (BLE1109B) Fallos del canal rápido por par (2 en 10 min lo apagan hasta reiniciar).
    castigos: Castigos,
}

fn estado() -> &'static Mutex<Estado> {
    static E: OnceLock<Mutex<Estado>> = OnceLock::new();
    E.get_or_init(|| {
        Mutex::new(Estado {
            activo: true,
            radio: if radio().disponible() { "arrancando".into() } else { "no-disponible".into() },
            motivo: if radio().disponible() { "Arrancando el Bluetooth directo…".into() } else { MOTIVO_SIN_RADIO.into() },
            anuncio: None,
            cuenta: Cuenta::default(),
            vecindario: Vecindario::nuevo(),
            enlaces: Vec::new(),
            buzon: Buzon::nuevo(BUZON_CAP),
            limitador: Limitador::nuevo(bt::LIMITE_MENSAJES, bt::LIMITE_VENTANA_MS),
            siguiente_enlace: 1,
            siguiente_token: 1,
            esperas: HashMap::new(),
            ultimo_cambio_ms: 0,
            cambio_pendiente: false,
            dir: None,
            registro: VecDeque::new(),
            siguiente_reg: 1,
            por_volcar: Vec::new(),
            colapso: Default::default(),
            castigos: Castigos::nuevo(),
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

fn ahora_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn ahora_s() -> u64 {
    ahora_ms() / 1000
}

static APP: OnceLock<tauri::AppHandle> = OnceLock::new();
static ARRANCADO: AtomicBool = AtomicBool::new(false);
/// (BLE1109B) El ajuste «Canal rápido Bluetooth (experimental)». Encendido por defecto; apagado, el enlace va por GATT puro.
static CANAL_RAPIDO: AtomicBool = AtomicBool::new(true);

pub fn canal_rapido_activo() -> bool {
    CANAL_RAPIDO.load(Ordering::SeqCst)
}

fn emitir<S: Serialize + Clone>(evento: &str, carga: S) {
    if let Some(app) = APP.get() {
        use tauri::Emitter;
        let _ = app.emit(evento, carga);
    }
}

// ───────────────────────────── Registro del enlace (BLE1108B) ─────────────────────────────

/// Eventos que guarda el anillo en memoria.
pub const REGISTRO_CAP: usize = 300;
/// Tamaño máximo de `enlaces.log` antes de rotarlo a `enlaces.log.1`.
pub const REGISTRO_MAX_BYTES: u64 = 1024 * 1024;

/// Texto de una sola línea y sin caracteres de control, de como mucho `max` caracteres.
pub fn linea_limpia(s: &str, max: usize) -> String {
    s.chars().map(|c| if c.is_control() { ' ' } else { c }).take(max).collect::<String>().trim().to_string()
}

/// «2026-11-08T12:30:05.123Z» de un epoch en ms (UTC; sin dependencias).
pub fn iso_utc(ms: u64) -> String {
    let s = ms / 1000;
    let milis = ms % 1000;
    let dias = (s / 86_400) as i64;
    let resto = s % 86_400;
    let z = dias + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.{milis:03}Z", resto / 3_600, (resto % 3_600) / 60, resto % 60)
}

/// La línea de `enlaces.log` de un evento.
pub fn linea_registro(r: &RegistroBle) -> String {
    let mut l = format!("{} ble {}", iso_utc(r.ms), r.tipo);
    if let Some(e) = &r.enlace {
        l.push_str(&format!(" enlace={e}"));
    }
    if let Some(n) = &r.neurona {
        l.push_str(&format!(" neurona={}", linea_limpia(n, 40)));
    }
    if !r.detalle.is_empty() {
        l.push_str(&format!(" · {}", r.detalle));
    }
    l
}

/// Añade líneas a un archivo de registro; si ya pasa de `max` bytes, lo rota a «<archivo>.1» (un solo respaldo)
/// y empieza otro: el registro nunca ocupa más de ~2 × `max`.
pub fn anexar_rotando(ruta: &Path, lineas: &[String], max: u64) -> std::io::Result<()> {
    if lineas.is_empty() {
        return Ok(());
    }
    if let Some(dir) = ruta.parent() {
        std::fs::create_dir_all(dir)?;
    }
    if std::fs::metadata(ruta).map(|m| m.len()).unwrap_or(0) >= max {
        let mut respaldo = ruta.as_os_str().to_owned();
        respaldo.push(".1");
        let _ = std::fs::rename(ruta, PathBuf::from(respaldo));
    }
    let mut f = std::fs::OpenOptions::new().create(true).append(true).open(ruta)?;
    let mut bloque = String::new();
    for l in lineas {
        bloque.push_str(l);
        bloque.push('\n');
    }
    f.write_all(bloque.as_bytes())
}

/// Dónde va `enlaces.log`: en macOS `~/Library/Logs/app.starseed.os/`; en el resto, la carpeta de datos de la app.
fn ruta_registro() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        if let Some(h) = std::env::var_os("HOME") {
            return Some(PathBuf::from(h).join("Library/Logs/app.starseed.os/enlaces.log"));
        }
    }
    dir_datos().map(|d| d.join("enlaces.log"))
}

/// Apunta un evento en el anillo y lo deja para volcar al archivo (el volcado se hace fuera del cerrojo).
fn anotar(e: &mut Estado, tipo: &str, enlace: Option<&str>, neurona: Option<&str>, detalle: &str) {
    let r = RegistroBle {
        seq: e.siguiente_reg,
        ms: ahora_ms(),
        tipo: tipo.to_string(),
        enlace: enlace.map(String::from),
        neurona: neurona.map(|n| linea_limpia(n, 80)),
        detalle: linea_limpia(detalle, 300),
    };
    e.siguiente_reg += 1;
    if e.por_volcar.len() < 500 {
        // (BLE1110A) 68 líneas idénticas seguidas (la autocuración desbocada del 09-11) salen como una y «… (×68)».
        let clave = format!("{}|{:?}|{:?}|{}", r.tipo, r.enlace, r.neurona, r.detalle);
        let salida = e.colapso.empujar(&clave, linea_registro(&r), r.ms);
        e.por_volcar.extend(salida);
    }
    e.registro.push_back(r);
    while e.registro.len() > REGISTRO_CAP {
        e.registro.pop_front();
    }
}

fn volcar_registro() {
    let lineas = con_estado(|e| {
        if let Some(r) = e.colapso.vaciar_viejas(ahora_ms(), 5_000) {
            e.por_volcar.push(r);
        }
        std::mem::take(&mut e.por_volcar)
    });
    if lineas.is_empty() {
        return;
    }
    if let Some(ruta) = ruta_registro() {
        let _ = anexar_rotando(&ruta, &lineas, REGISTRO_MAX_BYTES);
    }
}

/// Resultados de envíos a quien los espera (fuera de la radio; nunca bloquea).
fn entregar_hechos(e: &mut Estado, hechos: Vec<Hecho>) {
    for h in hechos {
        if let Some(tx) = e.esperas.remove(&h.token) {
            let _ = tx.send(h.resultado);
        }
    }
}

fn marcar_cambio(e: &mut Estado) {
    e.cambio_pendiente = true;
}

fn leer_cuenta() -> Cuenta {
    let Some(g) = crate::antenas::Guardian::actual() else { return Cuenta::default() };
    let c = g.config();
    Cuenta {
        clave: c.clave_faro.as_deref().and_then(crate::sha256::desde_hex).filter(|k| k.len() == 32),
        neurona: c.neurona.filter(|n| !n.trim().is_empty()),
        conocidas: c.conocidas,
    }
}

fn dir_datos() -> Option<PathBuf> {
    #[cfg(target_os = "android")]
    {
        if let Some(d) = crate::android::dir_datos() {
            return Some(d);
        }
    }
    con_estado(|e| e.dir.clone())
}

fn leer_preferencia() -> PreferenciaBle {
    dir_datos()
        .and_then(|d| std::fs::read_to_string(d.join(ARCHIVO_PREFERENCIA)).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

fn guardar_preferencia(p: PreferenciaBle) -> Result<(), String> {
    let d = dir_datos().ok_or("La app aún no sabe dónde guardar la preferencia.")?;
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    let tmp = d.join(format!("{ARCHIVO_PREFERENCIA}.tmp"));
    std::fs::write(&tmp, serde_json::to_string(&p).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, d.join(ARCHIVO_PREFERENCIA)).map_err(|e| e.to_string())
}

/// Arranca el núcleo una vez por proceso: preferencia, hilo de plazos y la radio.
pub fn asegurar() {
    if ARRANCADO.swap(true, Ordering::SeqCst) {
        return;
    }
    let pref = leer_preferencia();
    let activo = pref.activo;
    CANAL_RAPIDO.store(pref.canal_rapido, Ordering::SeqCst);
    // Fuera del cerrojo: el guardián de antenas pregunta por la antena Bluetooth con el suyo cogido
    // (`antena()`), así que este núcleo nunca pide el del guardián con el propio cogido.
    let cuenta = leer_cuenta();
    con_estado(|e| {
        e.activo = activo;
        e.cuenta = cuenta;
        if !activo && radio().disponible() {
            e.radio = "apagada".into();
            e.motivo = "Bluetooth directo apagado por ti.".into();
        }
    });
    let _ = std::thread::Builder::new().name("starseed-ble".into()).spawn(bucle);
    if activo {
        // (BLE1109B) Antes de arrancar, para que la radio sepa si el servicio lleva el canal rápido.
        radio().canal_rapido(pref.canal_rapido);
        radio().arrancar();
    }
}

/// Desde el arranque de la app (escritorio y Android con la ventana abierta). Solo StarSeed OS.
pub fn iniciar(app: &tauri::AppHandle) {
    if !crate::nativa::es_starseed_os(app) {
        return;
    }
    let _ = APP.set(app.clone());
    if con_estado(|e| e.dir.is_none()) {
        use tauri::Manager;
        let base = app.path().app_data_dir().ok();
        con_estado(|e| e.dir = base);
    }
    asegurar();
}

pub fn al_radio(estado_radio: &str, motivo: &str) {
    asegurar();
    let cerrar_canales = con_estado(|e| {
        let mut cerrar: Vec<String> = Vec::new();
        if e.radio != estado_radio || e.motivo != motivo {
            marcar_cambio(e);
            anotar(e, "radio", None, None, &format!("{estado_radio}: {motivo}"));
        }
        e.radio = estado_radio.to_string();
        e.motivo = if motivo.is_empty() { texto_radio(estado_radio).to_string() } else { motivo.to_string() };
        // Encendida (otra vez): el anuncio se repite en el siguiente tic.
        e.anuncio = None;
        if estado_radio != "encendida" {
            for l in e.enlaces.drain(..).collect::<Vec<_>>() {
                let mut l = l;
                l.nucleo.cerrar("el Bluetooth de este aparato se apagó");
                let h = l.nucleo.hechos();
                entregar_hechos(e, h);
                cerrar.push(l.plataforma.clone());
            }
        }
        cerrar
    });
    // (BLE1109A) Los canales L2CAP de esos enlaces se cierran con ellos.
    for p in cerrar_canales {
        radio().cerrar_l2cap(&p);
    }
}

fn texto_radio(estado_radio: &str) -> &'static str {
    match estado_radio {
        "encendida" => "Bluetooth directo encendido: anunciándose y escuchando a tus neuronas cercanas, sin Wi-Fi ni internet.",
        "apagada" => "El Bluetooth de este aparato está apagado.",
        "sin-permiso" => "Falta el permiso de Bluetooth («Dispositivos cercanos» en Android, «Bluetooth» en macOS, Privacidad › Radios en Windows; en Linux, acceso a BlueZ: grupo «bluetooth» o sesión local).",
        _ => "Este aparato no tiene Bluetooth de baja energía.",
    }
}

pub fn al_ver(direccion: &str, uuid: &[u8], rssi: i16) {
    let ahora = ahora_ms();
    let s = ahora_s();
    con_estado(|e| {
        let Cuenta { clave, conocidas, .. } = e.cuenta.clone();
        if e.vecindario.ver(direccion, uuid, rssi, ahora, s, clave.as_deref(), &conocidas) {
            marcar_cambio(e);
        }
    });
}

pub fn al_conectar(plataforma: &str, rol: &str, direccion: Option<&str>, paquete: usize) {
    asegurar();
    if !plataforma_valida(plataforma) {
        return;
    }
    let ahora = ahora_ms();
    let rechazar = con_estado(|e| {
        if let Some(l) = e.enlaces.iter_mut().find(|l| l.plataforma == plataforma) {
            l.nucleo.fijar_paquete(paquete);
            return false;
        }
        if e.enlaces.len() >= bt::MAX_ENLACES || !e.activo {
            return true;
        }
        let neurona = direccion.and_then(|d| e.vecindario.lista().into_iter().find(|v| v.direccion == d)).and_then(|v| v.neurona);
        let id = format!("b{}", e.siguiente_enlace);
        e.siguiente_enlace += 1;
        e.enlaces.push(EnlaceVivo {
            id,
            plataforma: plataforma.to_string(),
            rol: if rol == "central" { "central" } else { "periferico" },
            vecino: direccion.map(String::from),
            neurona,
            desde_ms: ahora,
            nucleo: Enlace::nuevo(paquete),
            dato_visto: false,
            dato_salido: false,
            carril: Carril::nuevo(rol == "central"),
            desmarcador: Desmarcador::nuevo(),
        });
        let (id, neurona) = e.enlaces.last().map(|l| (l.id.clone(), l.neurona.clone())).unwrap_or_default();
        let fallos = direccion.map(|d| e.vecindario.fallos_de(d)).unwrap_or(0);
        anotar(e, "enlace-abierto", Some(&id), neurona.as_deref(), &format!("rol={rol} paquete={paquete} intentos-previos={fallos}"));
        marcar_cambio(e);
        false
    });
    if rechazar {
        radio().desconectar(plataforma);
    }
}

/// (BLE1109B) La radio olvidó el objeto de ese aparato (no conectaba): se le quita del vecindario hasta oírle de nuevo.
pub fn olvidar_vecino(direccion: &str) {
    con_estado(|e| {
        e.vecindario.olvidar(direccion);
        marcar_cambio(e);
    });
}

/// (BLE1108C) Deja en el registro un hito de la radio. `plataforma` (si la hay) se traduce al id del enlace;
/// sin enlace vivo (p. ej. durante el descubrimiento) la plataforma va en el detalle.
pub fn nota(plataforma: Option<&str>, tipo: &str, detalle: &str) {
    if !NOTAS_RADIO.contains(&tipo) {
        return;
    }
    con_estado(|e| {
        let (id, neurona) = match plataforma.and_then(|p| e.enlaces.iter().find(|l| l.plataforma == p)) {
            Some(l) => (Some(l.id.clone()), l.neurona.clone()),
            None => (None, None),
        };
        let texto = match (&id, plataforma) {
            (None, Some(p)) => format!("{detalle} ({p})"),
            _ => detalle.to_string(),
        };
        anotar(e, tipo, id.as_deref(), neurona.as_deref(), &texto);
    });
}

pub fn al_mtu(plataforma: &str, paquete: usize) {
    con_estado(|e| {
        let nota = if let Some(l) = e.enlaces.iter_mut().find(|l| l.plataforma == plataforma) {
            l.nucleo.fijar_paquete(paquete);
            Some((l.id.clone(), l.neurona.clone()))
        } else {
            None
        };
        if let Some((id, neurona)) = nota {
            anotar(e, "mtu", Some(&id), neurona.as_deref(), &format!("paquete={paquete}"));
        }
    });
}

pub fn al_desconectar(plataforma: &str, motivo: &str) {
    con_estado(|e| {
        let Some(i) = e.enlaces.iter().position(|l| l.plataforma == plataforma) else { return };
        let mut l = e.enlaces.remove(i);
        let ahora = ahora_ms();
        let vida = ahora.saturating_sub(l.desde_ms);
        let m = l.nucleo.medidas.clone();
        let pendientes = l.nucleo.pendientes();
        let silencio = l.nucleo.silencio_ms(ahora);
        l.nucleo.cerrar(&format!("el enlace Bluetooth se cerró: {motivo}"));
        let h = l.nucleo.hechos();
        entregar_hechos(e, h);
        // (BLE1108B) Un enlace que duró (≥ 5 s) y se cae: la reconexión es INMEDIATA. Uno que se cae al
        // instante cuenta como fallo y espera 2 s, 5 s, 15 s. Y se vuelve a anunciar ya: en Android y
        // macOS un anuncio conectable puede quedar parado tras una conexión y nadie más te encontraría.
        if let Some(d) = l.vecino.as_deref() {
            if vida >= bt::ENLACE_ESTABLE_MS {
                e.vecindario.enlace_estable(d);
            }
        }
        e.anuncio = None;
        anotar(
            e,
            "enlace-cerrado",
            Some(&l.id),
            l.neurona.as_deref(),
            &format!(
                "{motivo} · vivo {} s · rol={} · enviado {} B / recibido {} B · {} msg en cola · {} reintentos · {} s sin oír al otro · latidos={}",
                vida / 1000,
                l.rol,
                m.bytes_enviados,
                m.bytes_recibidos,
                pendientes,
                m.reintentos,
                silencio / 1000,
                if l.nucleo.otro_late() { "sí" } else { "no" }
            ),
        );
        marcar_cambio(e);
    });
    // (BLE1109A) El canal L2CAP muere con su enlace GATT (idempotente: la radio ya pudo cerrarlo).
    radio().cerrar_l2cap(plataforma);
}

/// Un paquete que llegó por la radio (GATT). Si completa un mensaje, va al buzón y a la web.
pub fn al_recibir(plataforma: &str, paquete: &[u8]) {
    recibir_lote(plataforma, paquete, false);
}

/// (BLE1109A) Bytes del flujo del canal L2CAP (en trozos de cualquier tamaño: partidos o pegados). El desmarcador
/// rearma los paquetes; un flujo desalineado cierra el canal (se sigue por GATT).
pub fn al_l2cap_datos(plataforma: &str, bytes: &[u8]) {
    recibir_lote(plataforma, bytes, true);
}

fn recibir_lote(plataforma: &str, entrada: &[u8], flujo: bool) {
    let ahora = ahora_ms();
    let (nuevos, acusar, error) = con_estado(|e| {
        let Estado { enlaces, limitador, buzon, esperas, .. } = e;
        let Some(l) = enlaces.iter_mut().find(|l| l.plataforma == plataforma) else { return (Vec::new(), false, None) };
        let id = l.id.clone();
        if flujo {
            l.carril.nota_lectura(ahora); // (BLE1109B) para detectar un canal que escribe pero no lee
        }
        let paquetes: Vec<Vec<u8>> = if flujo {
            match l.desmarcador.empujar(entrada) {
                Ok(p) => p,
                Err(x) => return (Vec::new(), false, Some(x.to_string())),
            }
        } else {
            vec![entrada.to_vec()]
        };
        let mut cuerpos = Vec::new();
        let mut hito = None;
        let mut notas: Vec<(&'static str, String)> = Vec::new();
        let mut bombear = false;
        for paquete in &paquetes {
            // (BLE1109B) Autoprueba del canal: un paquete del otro lado se devuelve como eco; el eco de MI prueba la supera y
            // desde ahí los paquetes salen por el canal. No es tráfico del enlace: no pasa por el núcleo ni por el hito.
            if flujo {
                if let Some((es_eco, nonce)) = l2::leer_prueba(paquete) {
                    match l.carril.recibir_prueba(es_eco, nonce, ahora) {
                        Some(rtt) => {
                            l.nucleo.fijar_carril(true);
                            notas.push(("l2cap-prueba-ok", format!("rtt={rtt}ms · desde ahora el tráfico del enlace sale por el canal rápido")));
                        }
                        None => {}
                    }
                    bombear = true;
                    continue;
                }
            }
            // (BLE1108C) Hito: el primer paquete que llega por este enlace.
            if !l.dato_visto {
                l.dato_visto = true;
                hito = Some((l.neurona.clone(), format!("{} B, {} ms después de abrir el enlace", paquete.len(), ahora.saturating_sub(l.desde_ms))));
            }
            let cuerpo = if flujo {
                l.nucleo.recibir_rapido(paquete, ahora, &mut || limitador.permitir(&id, ahora))
            } else {
                l.nucleo.recibir(paquete, ahora, &mut || limitador.permitir(&id, ahora))
            };
            if let Some(c) = cuerpo {
                cuerpos.push(c);
            }
        }
        for h in l.nucleo.hechos() {
            if let Some(tx) = esperas.remove(&h.token) {
                let _ = tx.send(h.resultado);
            }
        }
        let acusar = l.nucleo.hay_paquetes();
        let nuevos: Vec<Recibido> = cuerpos.into_iter().map(|c| buzon.poner(&id, c, ahora)).collect();
        if let Some((neurona, detalle)) = hito {
            anotar(e, "primer-dato-recibido", Some(&id), neurona.as_deref(), &detalle);
        }
        if !notas.is_empty() {
            let neurona = e.enlaces.iter().find(|l| l.id == id).and_then(|l| l.neurona.clone());
            for (tipo, detalle) in notas {
                anotar(e, tipo, Some(&id), neurona.as_deref(), &detalle);
            }
            marcar_cambio(e);
        }
        (nuevos, acusar || bombear, None)
    });
    if let Some(motivo) = error {
        // Flujo desalineado: el canal ya no sirve. Se cierra y el enlace sigue por GATT.
        al_l2cap_cerrado(plataforma, &format!("flujo inválido: {motivo}"));
        radio().cerrar_l2cap(plataforma);
        return;
    }
    if acusar {
        radio().hay_datos(plataforma);
    }
    for r in nuevos {
        emitir(EVENTO_MENSAJE, MensajeBle::from(r));
    }
}

// ───────────────────────────── Carril rápido: canal L2CAP (BLE1109A) ─────────────────────────────

/// El central leyó el PSM que publica el periférico. Un PSM inválido se ignora (el enlace sigue por GATT).
pub fn al_psm(plataforma: &str, psm: u16) {
    // (BLE1109B) Con el ajuste apagado (por defecto) el PSM no se mira: el enlace es GATT puro.
    if !canal_rapido_activo() {
        return;
    }
    let ahora = ahora_ms();
    con_estado(|e| {
        let Some(i) = e.enlaces.iter().position(|l| l.plataforma == plataforma) else { return };
        let apagado = e.castigos.apagado(&par_de(&e.enlaces[i]), ahora);
        let l = &mut e.enlaces[i];
        if apagado {
            l.carril.prohibir();
        }
        let (id, neurona) = (l.id.clone(), l.neurona.clone());
        if l.carril.ofrecer_psm(psm, ahora) {
            anotar(e, "l2cap-psm", Some(&id), neurona.as_deref(), &format!("psm={psm}"));
        } else {
            anotar(e, "l2cap-psm", Some(&id), neurona.as_deref(), &format!("psm={psm} no es válido: se sigue por GATT"));
        }
    });
}

/// El canal L2CAP abrió. (BLE1109B) Los paquetes del enlace pasan a salir por él (GATT calla) SOLO cuando la autoprueba de
/// eco se supera; hasta entonces sigue todo por GATT.
pub fn al_l2cap_abierto(plataforma: &str, psm: Option<u16>) {
    let ahora = ahora_ms();
    let conocido = con_estado(|e| {
        let Some(i) = e.enlaces.iter().position(|l| l.plataforma == plataforma) else { return false };
        if !canal_rapido_activo() || e.enlaces[i].carril.prohibido() {
            // (BLE1109B) Un canal que no se pidió (ajuste apagado o par apagado): se cierra y GATT sigue.
            let (id, neurona) = (e.enlaces[i].id.clone(), e.enlaces[i].neurona.clone());
            anotar(e, "l2cap-rechazado", Some(&id), neurona.as_deref(), "canal rápido apagado para este par: se cierra, el enlace sigue por GATT");
            return false;
        }
        let l = &mut e.enlaces[i];
        l.carril.abierto(psm, ahora);
        l.desmarcador.vaciar();
        // (BLE1109B) Abierto NO es en uso: antes de mover tráfico se hace la autoprueba (un paquete y su eco, 3 s). Mientras
        // tanto todo sigue por GATT.
        let nonce = u16::from_be_bytes([bt::nonce_nuevo()[0], bt::nonce_nuevo()[1]]);
        l.carril.iniciar_prueba(nonce, ahora);
        let (id, neurona, psm, gatt) = (l.id.clone(), l.neurona.clone(), l.carril.psm(), l.nucleo.paquete());
        anotar(
            e,
            "l2cap-abierto",
            Some(&id),
            neurona.as_deref(),
            &format!("psm={} · paquete {} B (GATT {} B) · autoprueba en curso, por ahora todo sigue por GATT", psm.map(|p| p.to_string()).unwrap_or_else(|| "?".into()), bt::PAQUETE_RAPIDO, gatt),
        );
        marcar_cambio(e);
        true
    });
    if conocido {
        radio().hay_datos(plataforma);
    } else {
        radio().cerrar_l2cap(plataforma);
    }
}

/// El canal L2CAP se cerró (o no llegó a abrir): el enlace sigue por GATT, sin soltarlo, y el canal se reintenta con la
/// espera escalonada de `ble_l2cap`. (BLE1109B) Lo que estaba en vuelo se reenvía entero por GATT, el otro lado recibe
/// la tregua de latidos y, tras 2 fallos del mismo par en 10 min, ese par queda sin canal rápido hasta reiniciar.
pub fn al_l2cap_cerrado(plataforma: &str, motivo: &str) {
    let ahora = ahora_ms();
    let hubo = con_estado(|e| {
        let Some(i) = e.enlaces.iter().position(|l| l.plataforma == plataforma) else { return false };
        if !matches!(e.enlaces[i].carril.estado(), l2::EstadoCarril::Abierto | l2::EstadoCarril::Abriendo) {
            return false;
        }
        let par = par_de(&e.enlaces[i]);
        let probando = e.enlaces[i].carril.probando();
        let (cierre, m) = {
            let l = &mut e.enlaces[i];
            let cierre = l.carril.cerrado(motivo, ahora);
            l.desmarcador.vaciar();
            l.nucleo.fijar_carril(false);
            if cierre.estaba_abierto {
                l.nucleo.dar_tregua(ahora);
            }
            (cierre, l.nucleo.medidas.clone())
        };
        let estable = cierre.estaba_abierto && cierre.vivio_ms >= l2::CANAL_ESTABLE_MS;
        let apagado = if estable { false } else { e.castigos.fallo(&par, ahora) };
        if apagado {
            e.enlaces[i].carril.prohibir();
        }
        let (id, neurona) = (e.enlaces[i].id.clone(), e.enlaces[i].neurona.clone());
        if probando {
            anotar(e, "l2cap-prueba-fallida", Some(&id), neurona.as_deref(), &format!("motivo={}", linea_limpia(&cierre.motivo, 160)));
        }
        anotar(
            e,
            "l2cap-cerrado",
            Some(&id),
            neurona.as_deref(),
            &format!(
                "motivo={} · {} · vivió {} ms · se sigue por GATT · reabre en {} ms · último kbps rápido={}",
                linea_limpia(&cierre.motivo, 160),
                if cierre.estaba_abierto { "estaba abierto" } else { "no llegó a abrir" },
                cierre.vivio_ms,
                cierre.espera_ms,
                m.kbps_rapido.map(|k| k.to_string()).unwrap_or_else(|| "sin medir".into())
            ),
        );
        if apagado {
            anotar(e, "l2cap-desactivado", Some(&id), neurona.as_deref(), "2 fallos del canal rápido en 10 min con este par: sin canal rápido durante 1 hora (luego un intento más); todo sigue por GATT");
        }
        marcar_cambio(e);
        true
    });
    if hubo {
        // GATT retoma lo que estaba por salir.
        radio().cerrar_l2cap(plataforma);
        radio().hay_datos(plataforma);
    }
}

/// (BLE1109B) El par con el que se cuentan los fallos del canal: su neurona (la dirección de Android rota).
fn par_de(l: &EnlaceVivo) -> String {
    l.neurona.clone().unwrap_or_else(|| l.plataforma.clone())
}

/// (BLE1109B) La web avisa de que el enlace LLEGÓ A «ligado» (saludo firmado por GATT): desde ahora puede abrirse el
/// canal rápido, si el ajuste lo permite. Devuelve si el enlace existe.
#[tauri::command]
pub fn ble_enlace_ligado(enlace: String) -> bool {
    let (existe, leer) = con_estado(|e| {
        let Some(i) = e.enlaces.iter().position(|l| l.id == enlace) else { return (false, None) };
        if e.enlaces[i].carril.ligado() {
            return (true, None);
        }
        e.enlaces[i].carril.fijar_ligado();
        let mut leer = None;
        if canal_rapido_activo() {
            let (id, neurona, psm) = (e.enlaces[i].id.clone(), e.enlaces[i].neurona.clone(), e.enlaces[i].carril.psm());
            anotar(e, "l2cap-listo", Some(&id), neurona.as_deref(), &format!("enlace ligado por GATT: el canal rápido ya puede negociarse (psm={})", psm.map(|p| p.to_string()).unwrap_or_else(|| "aún sin leer".into())));
            // Solo el central lee el PSM del periférico, y solo ahora: la lectura nunca compite con el saludo.
            if psm.is_none() && e.enlaces[i].rol == "central" {
                leer = Some(e.enlaces[i].plataforma.clone());
            }
        }
        (true, leer)
    });
    if let Some(p) = leer {
        radio().leer_psm(&p);
    }
    existe
}

/// La radio pide lo siguiente para el flujo del canal L2CAP: paquetes ya marcados (`[largo][paquete]`), hasta
/// `max` bytes como poco. None: nada que mandar ahora (o el enlace no usa el carril rápido).
pub fn siguiente_trama_rapida(plataforma: &str, max: usize) -> Option<Vec<u8>> {
    let ahora = ahora_ms();
    con_estado(|e| {
        let l = e.enlaces.iter_mut().find(|l| l.plataforma == plataforma)?;
        let mut salida: Vec<u8> = Vec::new();
        // (BLE1109B) La autoprueba (su paquete y el eco que debo) sale siempre primero, también mientras GATT lleva el tráfico.
        while let Some(p) = l.carril.tomar_paquete_prueba() {
            if let Some(m) = l2::marco(&p) {
                salida.extend_from_slice(&m);
            }
        }
        if !l.carril.en_uso() {
            return if salida.is_empty() { None } else { Some(salida) };
        }
        let mut primero = None;
        while salida.len() < max.clamp(l2::MARCO_MAX, l2::TROZO_MAX) {
            let Some(p) = l.nucleo.siguiente_paquete(ahora) else { break };
            let Some(m) = l2::marco(&p) else { continue };
            if primero.is_none() {
                primero = Some(p.len());
            }
            salida.extend_from_slice(&m);
        }
        if salida.is_empty() {
            return None;
        }
        if !l.dato_salido {
            l.dato_salido = true;
            let (id, neurona, detalle) = (l.id.clone(), l.neurona.clone(), format!("{} B por el canal rápido, {} ms después de abrir el enlace", salida.len(), ahora.saturating_sub(l.desde_ms)));
            anotar(e, "primer-paquete-retirado", Some(&id), neurona.as_deref(), &detalle);
        }
        Some(salida)
    })
}

/// La radio pide el siguiente paquete para ese enlace (None: nada que mandar ahora).
pub fn siguiente_paquete(plataforma: &str) -> Option<Vec<u8>> {
    let ahora = ahora_ms();
    con_estado(|e| {
        let l = e.enlaces.iter_mut().find(|l| l.plataforma == plataforma)?;
        // (BLE1109A) Con el canal L2CAP EN USO (abierto y con la autoprueba superada), GATT no saca nada: todo va por el
        // flujo (nunca por los dos carriles). (BLE1109B) Abierto sin superar la prueba sigue siendo GATT.
        if l.carril.en_uso() {
            return None;
        }
        let p = l.nucleo.siguiente_paquete(ahora)?;
        if !l.dato_salido {
            l.dato_salido = true;
            let (id, neurona, detalle) = (l.id.clone(), l.neurona.clone(), format!("{} B, {} ms después de abrir el enlace", p.len(), ahora.saturating_sub(l.desde_ms)));
            anotar(e, "primer-paquete-retirado", Some(&id), neurona.as_deref(), &detalle);
        }
        Some(p)
    })
}

// ───────────────────────────── Hilo de plazos ─────────────────────────────

/// Lo que el tic decide hacer con la radio (se hace FUERA del cerrojo).
#[derive(Default)]
struct Acciones {
    anunciar: Option<String>,
    conectar: Vec<String>,
    datos: Vec<String>,
    cambio: Option<EstadoBle>,
    /// (BLE1108B) Enlaces cuyo otro lado dejó de latir: se cierran y se vuelve a conectar.
    cerrar: Vec<String>,
    /// (BLE1109A) Canales L2CAP por abrir (enlace, PSM) y por cerrar (apertura vencida).
    abrir_l2cap: Vec<(String, u16)>,
    /// (BLE1109B) Con el motivo (apertura vencida, canal atascado, silencio total…).
    cerrar_l2cap: Vec<(String, String)>,
}

fn tic(ahora: u64, releer_cuenta: bool) -> Acciones {
    let cuenta_nueva = if releer_cuenta { Some(leer_cuenta()) } else { None };
    con_estado(|e| {
        let mut a = Acciones::default();
        if let Some(c) = cuenta_nueva {
            if c != e.cuenta {
                // Otra clave u otras neuronas: lo reconocido ya no vale y el anuncio cambia ya.
                e.cuenta = c;
                e.vecindario.olvidar_reconocimientos();
                e.anuncio = None;
                marcar_cambio(e);
            }
        }
        for i in 0..e.enlaces.len() {
            e.enlaces[i].nucleo.tic(ahora);
            // (BLE1108C) Lo que el enlace nota de la radio (atascos) va al registro con el id del enlace.
            for (tipo, detalle) in e.enlaces[i].nucleo.avisos() {
                let (id, neurona) = (e.enlaces[i].id.clone(), e.enlaces[i].neurona.clone());
                anotar(e, tipo, Some(&id), neurona.as_deref(), &detalle);
            }
            let h = e.enlaces[i].nucleo.hechos();
            entregar_hechos(e, h);
            if e.enlaces[i].nucleo.hay_paquetes() {
                a.datos.push(e.enlaces[i].plataforma.clone());
            }
            if e.enlaces[i].nucleo.muerto(ahora) {
                if e.enlaces[i].carril.es_rapido() {
                    // (BLE1109B) El silencio puede ser del canal rápido, no del enlace: primero se cae a GATT (con tregua).
                    a.cerrar_l2cap.push((e.enlaces[i].plataforma.clone(), "silencio total con el canal rápido abierto".to_string()));
                } else {
                    a.cerrar.push(e.enlaces[i].plataforma.clone());
                }
            } else if e.enlaces[i].carril.atascado(ahora, e.enlaces[i].nucleo.en_vuelo()) {
                // (BLE1110A) Un latido del canal lleva sin eco y no se lee nada, con un mensaje esperando: atascado de verdad.
                a.cerrar_l2cap.push((e.enlaces[i].plataforma.clone(), format!("canal atascado: el latido del canal sin eco en {} ms y nada leído, con un mensaje esperando acuse", l2::PLAZO_ECO_LATIDO_MS)));
            } else if {
                let espera = e.enlaces[i].nucleo.en_vuelo();
                e.enlaces[i].carril.planificar_latido(ahora, espera)
            } {
                // (BLE1110A) Mientras un mensaje espera su acuse, un eco mínimo cada 2 s prueba el canal sin depender de la app.
                a.datos.push(e.enlaces[i].plataforma.clone());
            }
            // (BLE1109A) Carril rápido: abrir el canal cuando toca (con la espera escalonada) o dar por perdida una
            // apertura que no llega. Mientras tanto el enlace sigue por GATT.
            if e.enlaces[i].carril.prueba_vencida(ahora) {
                a.cerrar_l2cap.push((e.enlaces[i].plataforma.clone(), format!("sin eco de la autoprueba en {} ms", l2::PLAZO_PRUEBA_MS)));
            } else if e.enlaces[i].carril.apertura_vencida(ahora) {
                a.cerrar_l2cap.push((e.enlaces[i].plataforma.clone(), "el canal rápido no abrió a tiempo".to_string()));
            } else if let Some(psm) = e.enlaces[i].carril.debe_abrir(ahora) {
                let (id, neurona, plataforma, intento) = (e.enlaces[i].id.clone(), e.enlaces[i].neurona.clone(), e.enlaces[i].plataforma.clone(), e.enlaces[i].carril.fallos() + 1);
                anotar(e, "l2cap-abriendo", Some(&id), neurona.as_deref(), &format!("psm={psm} (intento {intento})"));
                a.abrir_l2cap.push((plataforma, psm));
            }
        }
        // (BLE1109B) Pasada la hora de castigo, el par vuelve a probar el canal rápido (un solo fallo más lo apaga otra hora).
        for par in e.castigos.caducados(ahora) {
            for i in 0..e.enlaces.len() {
                if par_de(&e.enlaces[i]) == par && e.enlaces[i].carril.prohibido() {
                    e.enlaces[i].carril.permitir();
                    let (id, neurona) = (e.enlaces[i].id.clone(), e.enlaces[i].neurona.clone());
                    anotar(e, "l2cap-reintento", Some(&id), neurona.as_deref(), "pasó la hora de castigo: se vuelve a probar el canal rápido");
                }
            }
        }
        if e.vecindario.caducar(ahora) {
            marcar_cambio(e);
        }
        let encendida = e.activo && e.radio == "encendida";
        if encendida {
            let s = ahora / 1000;
            let ventana = bt::ventana_de(s);
            if e.anuncio.as_ref().map(|(_, v)| *v) != Some(ventana) {
                let tipo = crate::faro::TipoAparato::de_este_aparato();
                let b = bt::construir_anuncio(e.cuenta.clave.as_deref(), e.cuenta.neurona.as_deref(), tipo, bt::FLAG_SERVIDOR, s, bt::nonce_nuevo());
                let uuid = bt::uuid_texto(&b);
                e.anuncio = Some((uuid.clone(), ventana));
                a.anunciar = Some(uuid);
            }
            let mia = e.cuenta.neurona.clone();
            let enlazadas: Vec<(Option<String>, Option<String>)> =
                e.enlaces.iter().filter(|l| l.rol == "central").map(|l| (l.vecino.clone(), l.neurona.clone())).collect();
            let enlazada = |v: &bt::VecinoVisto| {
                enlazadas.iter().any(|(d, n)| d.as_deref() == Some(v.direccion.as_str()) || (n.is_some() && *n == v.neurona))
            };
            let conectar = e.vecindario.a_conectar(mia.as_deref(), &enlazada, e.enlaces.len(), ahora);
            for d in &conectar {
                let previos = e.vecindario.fallos_de(d);
                e.vecindario.marcar_intento(d, ahora);
                let neurona = e.vecindario.lista().into_iter().find(|v| &v.direccion == d).and_then(|v| v.neurona);
                anotar(e, "conectar", None, neurona.as_deref(), &format!("intento {} (espera previa {} ms)", previos + 1, bt::espera_reconexion(previos)));
            }
            a.conectar = conectar;
        }
        if e.cambio_pendiente && ahora.saturating_sub(e.ultimo_cambio_ms) >= ENTRE_CAMBIOS_MS {
            e.cambio_pendiente = false;
            e.ultimo_cambio_ms = ahora;
            a.cambio = Some(foto(e, ahora));
        }
        a
    })
}

fn bucle() {
    let mut n: u64 = 0;
    loop {
        std::thread::sleep(Duration::from_millis(TIC_MS));
        n = n.wrapping_add(1);
        let a = tic(ahora_ms(), n % 8 == 1);
        let r = radio();
        if let Some(uuid) = a.anunciar {
            r.anunciar(&uuid);
        }
        for d in a.conectar {
            r.conectar(&d);
        }
        for (p, psm) in a.abrir_l2cap {
            r.abrir_l2cap(&p, psm);
        }
        for (p, motivo) in a.cerrar_l2cap {
            r.cerrar_l2cap(&p);
            al_l2cap_cerrado(&p, &motivo);
        }
        for p in a.datos {
            r.hay_datos(&p);
        }
        for p in a.cerrar {
            r.desconectar(&p);
            let nota = con_estado(|e| e.enlaces.iter().find(|l| l.plataforma == p).map(|l| (l.id.clone(), l.neurona.clone())));
            if let Some((id, neurona)) = nota {
                con_estado(|e| anotar(e, "silencio", Some(&id), neurona.as_deref(), "el otro aparato late pero dejó de oírse: enlace dado por muerto"));
            }
            al_desconectar(&p, "el otro aparato dejó de dar señales (sin latidos)");
        }
        if let Some(c) = a.cambio {
            emitir(EVENTO_CAMBIO, c);
        }
        if n % 4 == 0 {
            volcar_registro();
        }
    }
}

// ───────────────────────────── Foto para la web ─────────────────────────────

fn foto(e: &Estado, ahora: u64) -> EstadoBle {
    let enlaces: Vec<EnlaceBle> = e
        .enlaces
        .iter()
        .map(|l| {
            let m = &l.nucleo.medidas;
            let rssi = l.vecino.as_deref().and_then(|d| e.vecindario.lista().into_iter().find(|v| v.direccion == d)).map(|v| v.rssi);
            EnlaceBle {
                id: l.id.clone(),
                rol: l.rol.to_string(),
                vecino: l.vecino.as_deref().map(bt::id_vecino),
                neurona: l.neurona.clone(),
                rssi,
                paquete: l.nucleo.paquete(),
                rtt_ms: m.rtt_ms,
                // (BLE1109A) La capacidad es la del carril en uso: medida por él, o sin medir.
                kbps: if l.carril.en_uso() { m.kbps_rapido } else { m.kbps_gatt },
                carril: if l.carril.en_uso() { "rapido" } else { "gatt" }.to_string(),
                canal_rapido: if !canal_rapido_activo() {
                    "apagado".to_string() // (BLE1109B) ajuste apagado: GATT puro
                } else if l.carril.prohibido() {
                    "desactivado".to_string() // (BLE1109B) 2 fallos en 10 min con este par
                } else if l.carril.probando() {
                    "abriendo".to_string() // (BLE1109B) abierto, pero aún en autoprueba
                } else {
                    l.carril.estado().texto().to_string()
                },
                psm: l.carril.psm(),
                kbps_rapido: m.kbps_rapido,
                kbps_gatt: m.kbps_gatt,
                pendientes: l.nucleo.pendientes(),
                bytes_enviados: m.bytes_enviados,
                bytes_recibidos: m.bytes_recibidos,
                abierto_hace_ms: ahora.saturating_sub(l.desde_ms),
            }
        })
        .collect();
    let vecinos = e
        .vecindario
        .lista()
        .into_iter()
        .map(|v| VecinoBle {
            id: bt::id_vecino(&v.direccion),
            rssi: v.rssi,
            propia: v.propia,
            neurona: v.neurona.clone(),
            tipo: v.tipo.nombre().to_string(),
            servidor: v.flags & bt::FLAG_SERVIDOR != 0,
            visto_hace_ms: ahora.saturating_sub(v.visto_ms),
            enlace: e.enlaces.iter().find(|l| l.vecino.as_deref() == Some(v.direccion.as_str())).map(|l| l.id.clone()),
        })
        .collect();
    EstadoBle {
        disponible: radio().disponible(),
        activo: e.activo,
        radio: e.radio.clone(),
        motivo: e.motivo.clone(),
        plataforma: std::env::consts::OS.to_string(),
        roles: if radio().disponible() { roles_de(std::env::consts::OS).iter().map(|r| r.to_string()).collect() } else { Vec::new() },
        l2cap: radio().disponible() && l2cap_de(std::env::consts::OS, sdk_android()),
        anunciando: e.activo && e.radio == "encendida" && e.anuncio.is_some(),
        con_cuenta: e.cuenta.clave.is_some(),
        vecinos,
        enlaces,
        ultimo_seq: e.buzon.ultimo(),
        max_cuerpo: bt::MAX_CUERPO,
        limite_mensajes: bt::LIMITE_MENSAJES,
        limite_ventana_ms: bt::LIMITE_VENTANA_MS,
        paquete_max: bt::PAQUETE_MAX,
    }
}

// ───────────────────────────── Comandos ─────────────────────────────

#[tauri::command]
pub fn ble_estado() -> EstadoBle {
    let ahora = ahora_ms();
    con_estado(|e| foto(e, ahora))
}

/// Conectar a mano con un vecino (también a uno anónimo: el saludo firmado decide si se habla).
#[tauri::command]
pub fn ble_abrir(vecino: String) -> Result<EstadoBle, String> {
    let ahora = ahora_ms();
    let direccion = con_estado(|e| {
        if !e.activo || e.radio != "encendida" {
            return Err(format!("El Bluetooth directo no está listo: {}", e.motivo));
        }
        if e.enlaces.len() >= bt::MAX_ENLACES {
            return Err(format!("Ya hay {} enlaces Bluetooth abiertos: cierra alguno.", bt::MAX_ENLACES));
        }
        let v = e.vecindario.por_id(&vecino).ok_or("Ese aparato ya no se oye por Bluetooth.")?;
        e.vecindario.marcar_intento(&v.direccion, ahora);
        Ok(v.direccion)
    })?;
    radio().conectar(&direccion);
    Ok(ble_estado())
}

#[tauri::command]
pub fn ble_cerrar(enlace: String) -> Result<EstadoBle, String> {
    let plataforma = con_estado(|e| e.enlaces.iter().find(|l| l.id == enlace).map(|l| l.plataforma.clone()))
        .ok_or("Ese enlace Bluetooth ya no está abierto.")?;
    radio().desconectar(&plataforma);
    al_desconectar(&plataforma, "cerrado desde esta app");
    Ok(ble_estado())
}

/// Encola un JSON hacia ese enlace y espera el ACUSE de la otra app (sin acuse, no es un «enviado»).
#[tauri::command]
pub async fn ble_enviar(enlace: String, json: String) -> Result<EnvioBle, String> {
    tauri::async_runtime::spawn_blocking(move || enviar(&enlace, &json).map(|ms| EnvioBle { enlace, ms }))
        .await
        .map_err(|e| e.to_string())?
}

pub fn enviar(enlace: &str, json: &str) -> Result<u64, String> {
    let ahora = ahora_ms();
    let (rx, plataforma) = con_estado(|e| {
        let token = e.siguiente_token;
        e.siguiente_token += 1;
        let l = e.enlaces.iter_mut().find(|l| l.id == enlace).ok_or_else(|| format!("El enlace Bluetooth «{enlace}» ya no está abierto."))?;
        l.nucleo.encolar(token, json, ahora).map_err(|x| format!("No se envía por Bluetooth: {x}."))?;
        let plataforma = l.plataforma.clone();
        let (tx, rx) = mpsc::channel();
        e.esperas.insert(token, tx);
        Ok::<_, String>((rx, plataforma))
    })?;
    radio().hay_datos(&plataforma);
    let r = match rx.recv_timeout(Duration::from_millis(bt::PLAZO_TOTAL_MS + 5_000)) {
        Ok(r) => r.map_err(|m| format!("Bluetooth directo: {m}.")),
        Err(_) => Err("Bluetooth directo: sin respuesta de la radio.".into()),
    };
    if let Err(m) = &r {
        con_estado(|e| {
            let neurona = e.enlaces.iter().find(|l| l.id == enlace).and_then(|l| l.neurona.clone());
            anotar(e, "envio-fallido", Some(enlace), neurona.as_deref(), m);
        });
    }
    r
}

/// Lo recibido después de `desde` (la web lo pide al arrancar: nada se pierde por llegar antes).
#[tauri::command]
pub fn ble_recibidos(desde: u64) -> Vec<MensajeBle> {
    let ahora = ahora_ms();
    con_estado(|e| e.buzon.desde(desde, ahora, BUZON_EDAD_MS)).into_iter().map(MensajeBle::from).collect()
}

/// (BLE1108B) Los últimos eventos del enlace (más viejo primero): la web los une a los suyos en «Registro del enlace».
#[tauri::command]
pub fn ble_registro() -> Vec<RegistroBle> {
    con_estado(|e| e.registro.iter().cloned().collect())
}

/// (BLE1108B) La web añade sus líneas (ligado, cerrado, sin cifrar…) al mismo `enlaces.log`. Devuelve cuántas guardó.
#[tauri::command]
pub fn ble_registro_anexar(lineas: Vec<String>) -> usize {
    let limpias: Vec<String> = lineas
        .iter()
        .take(60)
        .map(|l| linea_limpia(l, 400))
        .filter(|l| !l.is_empty())
        .map(|l| format!("{} web {}", iso_utc(ahora_ms()), l))
        .collect();
    match ruta_registro() {
        Some(ruta) if anexar_rotando(&ruta, &limpias, REGISTRO_MAX_BYTES).is_ok() => limpias.len(),
        _ => 0,
    }
}

#[tauri::command]
pub fn ble_activar(activo: bool) -> Result<EstadoBle, String> {
    if !radio().disponible() {
        return Err(MOTIVO_SIN_RADIO.to_string());
    }
    asegurar();
    guardar_preferencia(PreferenciaBle { activo, canal_rapido: canal_rapido_activo() })?;
    let cerrar: Vec<String> = con_estado(|e| {
        e.activo = activo;
        e.anuncio = None;
        marcar_cambio(e);
        if activo {
            e.radio = "arrancando".into();
            e.motivo = "Arrancando el Bluetooth directo…".into();
            Vec::new()
        } else {
            e.radio = "apagada".into();
            e.motivo = "Bluetooth directo apagado por ti.".into();
            e.enlaces.iter().map(|l| l.plataforma.clone()).collect()
        }
    });
    if activo {
        radio().arrancar();
    } else {
        radio().parar();
        for p in cerrar {
            al_desconectar(&p, "Bluetooth directo apagado por ti");
        }
    }
    Ok(ble_estado())
}

#[tauri::command]
pub fn ble_pedir_permiso() -> EstadoBle {
    radio().pedir_permiso();
    ble_estado()
}

/// (BLE1109B) «Canal rápido Bluetooth (experimental)»: sin argumento devuelve el ajuste; con él lo guarda. Por defecto
/// APAGADO. Al cambiarlo se reinicia el Bluetooth directo (el servicio GATT cambia: con el canal apagado es el de
/// prueba.30, sin la característica PSM) y se olvidan los fallos anteriores.
#[tauri::command]
pub fn ble_canal_rapido(activo: Option<bool>) -> bool {
    asegurar();
    let Some(nuevo) = activo else { return canal_rapido_activo() };
    if nuevo == canal_rapido_activo() {
        return nuevo;
    }
    let mut pref = leer_preferencia();
    pref.canal_rapido = nuevo;
    let _ = guardar_preferencia(pref);
    CANAL_RAPIDO.store(nuevo, Ordering::SeqCst);
    let (reiniciar, plataformas) = con_estado(|e| {
        e.castigos.limpiar();
        anotar(e, "canal-rapido-ajuste", None, None, if nuevo { "encendido por la persona (experimental)" } else { "apagado: todo va por GATT, como en prueba.30" });
        (e.activo && radio().disponible(), e.enlaces.iter().map(|l| l.plataforma.clone()).collect::<Vec<_>>())
    });
    if reiniciar {
        radio().parar();
        for p in plataformas {
            al_desconectar(&p, "se reinicia el Bluetooth directo por el ajuste del canal rápido");
        }
        radio().canal_rapido(nuevo);
        con_estado(|e| {
            e.radio = "arrancando".into();
            e.motivo = "Arrancando el Bluetooth directo…".into();
            e.anuncio = None;
            marcar_cambio(e);
        });
        radio().arrancar();
    } else {
        radio().canal_rapido(nuevo);
    }
    nuevo
}

/// (BLE1109B) Lo último de `enlaces.log` (y del respaldo `.1` si hace falta) como texto de como mucho `max` bytes,
/// empezando en una línea entera. Puro (lee archivos, nada más).
pub fn cola_de_registro(ruta: &Path, max: usize) -> String {
    let mut respaldo = ruta.as_os_str().to_owned();
    respaldo.push(".1");
    let mut bytes: Vec<u8> = std::fs::read(PathBuf::from(respaldo)).unwrap_or_default();
    bytes.extend(std::fs::read(ruta).unwrap_or_default());
    if bytes.len() > max {
        let corte = bytes.len() - max;
        let desde = bytes[corte..].iter().position(|b| *b == b'\n').map(|p| corte + p + 1).unwrap_or(corte);
        bytes.drain(..desde);
    }
    String::from_utf8_lossy(&bytes).into_owned()
}

/// (BLE1109B) «Compartir registro de enlaces»: en Android abre la hoja de compartir con el final del registro; en
/// escritorio abre la carpeta donde está `enlaces.log`. Devuelve una frase para la persona.
#[tauri::command]
pub fn ble_registro_compartir() -> Result<String, String> {
    volcar_registro();
    let ruta = ruta_registro().ok_or("La app aún no sabe dónde guardar el registro de enlaces.")?;
    let texto = cola_de_registro(&ruta, 120_000);
    if texto.is_empty() {
        return Err("Todavía no hay registro de enlaces que compartir.".into());
    }
    if radio().compartir_registro("Registro de enlaces de StarSeed", &texto) {
        return Ok("Se abrió la hoja de compartir con el registro de enlaces.".into());
    }
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let dir = ruta.parent().ok_or("El registro no tiene carpeta.")?.to_path_buf();
        #[cfg(target_os = "macos")]
        let orden = "open";
        #[cfg(target_os = "windows")]
        let orden = "explorer";
        #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
        let orden = "xdg-open";
        std::process::Command::new(orden).arg(&dir).spawn().map_err(|e| format!("No se pudo abrir la carpeta del registro: {e}"))?;
        return Ok(format!("Carpeta del registro abierta: {}", dir.display()));
    }
    #[allow(unreachable_code)]
    Err("Este aparato no puede compartir el registro.".into())
}

/// Para la antena «Bluetooth» del guardián (antenas.rs): lo medido, en una frase.
pub fn antena() -> (String, String) {
    if !radio().disponible() {
        return ("no-disponible".into(), MOTIVO_SIN_RADIO.into());
    }
    con_estado(|e| {
        let estado = match (e.activo, e.radio.as_str()) {
            (true, "encendida") => "viva",
            (false, _) | (_, "apagada") => "apagada",
            (_, "sin-permiso") => "sin-permiso",
            (_, "no-disponible") => "no-disponible",
            _ => "detectada",
        };
        let propias = e.vecindario.lista().iter().filter(|v| v.propia).count();
        let mut motivo = e.motivo.clone();
        if estado == "viva" {
            motivo = format!("Bluetooth directo: {} enlace(s), {} neurona(s) de tu cuenta cerca.", e.enlaces.len(), propias);
        }
        (estado.to_string(), motivo)
    })
}

#[cfg(test)]
mod pruebas {
    // INT1109C: la forma de `roles` y `l2cap` que lee la matriz (`lanas-propias.ts`) en TODAS las plataformas.
    #[test]
    fn roles_y_l2cap_por_plataforma() {
        use super::{l2cap_de, roles_de};
        for os in ["macos", "windows", "linux", "android"] {
            assert_eq!(roles_de(os), &["central", "periferico"], "{os}");
        }
        assert!(roles_de("ios").is_empty() && roles_de("otro").is_empty());
        assert!(l2cap_de("macos", None) && l2cap_de("linux", None));
        assert!(!l2cap_de("windows", None), "WinRT no tiene L2CAP CoC en LE");
        assert!(l2cap_de("android", Some(29)) && l2cap_de("android", Some(34)));
        assert!(!l2cap_de("android", Some(28)) && !l2cap_de("android", None));
        assert!(!l2cap_de("ios", None));
    }

    #[test]
    fn ble_estado_serializa_roles_y_l2cap() {
        let j = serde_json::to_value(super::ble_estado()).unwrap();
        assert!(j["roles"].is_array(), "roles es una lista");
        assert!(j["l2cap"].is_boolean(), "l2cap es booleano");
        for k in ["disponible", "radio", "plataforma", "motivo"] {
            assert!(j.get(k).is_some(), "falta {k}");
        }
        // Las pruebas corren sin radio (`disponible` falso o con núcleo de pruebas): sin radio no se promete nada.
        if j["disponible"] == false {
            assert_eq!(j["roles"].as_array().unwrap().len(), 0);
            assert_eq!(j["l2cap"], false);
        }
    }

    use super::*;

    #[test]
    fn eventos_de_kotlin_se_leen_con_cuidado() {
        let uuid = bt::uuid_texto(&bt::construir_anuncio(None, None, crate::faro::TipoAparato::Android, bt::FLAG_SERVIDOR, 0, [1, 2, 3, 4]));
        assert_eq!(
            leer_evento(&format!(r#"{{"e":"visto","direccion":"AA:BB:CC:DD:EE:01","uuid":"{uuid}","rssi":-61}}"#)),
            Some(EventoRadio::Visto { direccion: "AA:BB:CC:DD:EE:01".into(), uuid: bt::uuid_bytes(&uuid).unwrap(), rssi: -61 })
        );
        assert_eq!(leer_evento(&format!(r#"{{"e":"visto","direccion":"x","uuid":"{}","rssi":-61}}"#, bt::SERVICIO)), None, "otro UUID no es un anuncio");
        assert_eq!(
            leer_evento(r#"{"e":"conectado","enlace":"c:AA:BB:CC:DD:EE:01","rol":"central","direccion":"AA:BB:CC:DD:EE:01","paquete":509}"#),
            Some(EventoRadio::Conectado { enlace: "c:AA:BB:CC:DD:EE:01".into(), rol: "central".into(), direccion: Some("AA:BB:CC:DD:EE:01".into()), paquete: 509 })
        );
        assert_eq!(
            leer_evento(r#"{"e":"conectado","enlace":"p:1234","rol":"periferico","paquete":99999}"#),
            Some(EventoRadio::Conectado { enlace: "p:1234".into(), rol: "periferico".into(), direccion: None, paquete: bt::PAQUETE_MAX })
        );
        assert_eq!(leer_evento(r#"{"e":"conectado","enlace":"x:1","rol":"central"}"#), None, "id de plataforma raro");
        assert_eq!(leer_evento(r#"{"e":"conectado","enlace":"c:1","rol":"jefe"}"#), None);
        assert_eq!(
            leer_evento(r#"{"e":"nota","tipo":"listo-tarde","enlace":"c:1","detalle":"400 ms sin señal"}"#),
            Some(EventoRadio::Nota { enlace: Some("c:1".into()), tipo: "listo-tarde".into(), detalle: "400 ms sin señal".into() })
        );
        assert_eq!(leer_evento(r#"{"e":"nota","tipo":"inventado"}"#), None);
        assert_eq!(
            leer_evento(r#"{"e":"nota","tipo":"suscrito","enlace":"mal id!"}"#),
            Some(EventoRadio::Nota { enlace: None, tipo: "suscrito".into(), detalle: String::new() })
        );
        assert_eq!(leer_evento(r#"{"e":"mtu","enlace":"c:1","paquete":10}"#), Some(EventoRadio::Mtu { enlace: "c:1".into(), paquete: bt::PAQUETE_MIN }));
        assert_eq!(
            leer_evento(r#"{"e":"desconectado","enlace":"p:1"}"#),
            Some(EventoRadio::Desconectado { enlace: "p:1".into(), motivo: "el enlace Bluetooth se cerró".into() })
        );
        assert_eq!(
            leer_evento(r#"{"e":"radio","estado":"sin-permiso","motivo":"Falta «Dispositivos cercanos»."}"#),
            Some(EventoRadio::Radio { estado: "sin-permiso".into(), motivo: "Falta «Dispositivos cercanos».".into() })
        );
        assert_eq!(leer_evento(r#"{"e":"radio","estado":"rota"}"#), None);
        for basura in ["", "{}", "[]", "no", r#"{"e":"otro"}"#] {
            assert_eq!(leer_evento(basura), None, "{basura}");
        }
        assert!(plataforma_valida("c:AA:BB:CC:DD:EE:FF"));
        assert!(plataforma_valida("p:5f1c2b9e-0000-4c2a-9a3e-0123456789ab"));
        assert!(!plataforma_valida("c:"));
        assert!(!plataforma_valida("c:<script>"));
        assert!(!plataforma_valida(&format!("c:{}", "a".repeat(100))));
    }

    /// El núcleo de verdad (estado global, buzón, limitador, esperas) frente a la otra app hecha con
    /// un `Enlace` puro: los paquetes van y vuelven a mano, como los movería la radio.
    #[test]
    fn nucleo_envia_recibe_acusa_y_cierra() {
        use crate::ble_trama::Enlace;
        let p = "c:AA:BB:CC:DD:EE:42";
        al_conectar(p, "central", Some("AA:BB:CC:DD:EE:42"), 60);
        let est = ble_estado();
        let enl = est.enlaces.iter().find(|l| l.rol == "central" && l.paquete == 60).expect("enlace abierto").id.clone();
        assert!(enl.starts_with('b'));
        let mut otra = Enlace::nuevo(60);
        let mut si = || true;
        // Este aparato → la otra app (espera el acuse en otro hilo, como el comando).
        let e2 = enl.clone();
        let espera = std::thread::spawn(move || enviar(&e2, "{\"t\":\"tu.msg\",\"b\":\"hola por bluetooth\"}"));
        let mut entregado = None;
        for _ in 0..2_000 {
            while let Some(pq) = siguiente_paquete(p) {
                if let Some(c) = otra.recibir(&pq, ahora_ms(), &mut si) {
                    entregado = Some(c);
                }
            }
            while let Some(pq) = otra.siguiente_paquete(ahora_ms()) {
                al_recibir(p, &pq);
            }
            if espera.is_finished() {
                break;
            }
            std::thread::sleep(Duration::from_millis(2));
        }
        assert_eq!(entregado.as_deref(), Some("{\"t\":\"tu.msg\",\"b\":\"hola por bluetooth\"}"));
        assert!(espera.join().unwrap().is_ok(), "con acuse, enviado");
        // La otra app → este aparato: va al buzón (y a la web por `ble://mensaje`).
        let antes = ble_estado().ultimo_seq;
        otra.encolar(1, &format!("{{\"t\":\"archivo.chunk\",\"d\":\"{}\"}}", "Q".repeat(3000)), ahora_ms()).unwrap();
        for _ in 0..200 {
            while let Some(pq) = otra.siguiente_paquete(ahora_ms()) {
                al_recibir(p, &pq);
            }
            while let Some(pq) = siguiente_paquete(p) {
                otra.recibir(&pq, ahora_ms(), &mut si);
            }
        }
        let r = ble_recibidos(antes);
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].enlace, enl);
        assert!(r[0].cuerpo.starts_with("{\"t\":\"archivo.chunk\""));
        assert!(otra.hechos().iter().all(|h| h.resultado.is_ok()), "la otra app recibió el acuse");
        // Un envío sin acuse y el enlace se cierra: falla con el motivo, nunca «enviado».
        let e3 = enl.clone();
        let colgado = std::thread::spawn(move || enviar(&e3, "{\"t\":\"x\"}"));
        std::thread::sleep(Duration::from_millis(50));
        al_desconectar(p, "el aparato se alejó");
        let r = colgado.join().unwrap();
        assert!(r.as_ref().unwrap_err().contains("se alejó"), "{r:?}");
        assert!(enviar(&enl, "{\"t\":\"x\"}").unwrap_err().contains("ya no está abierto"));
        assert!(ble_estado().enlaces.iter().all(|l| l.id != enl));
        // Lo que no es JSON ni sale.
        al_conectar(p, "central", None, 60);
        let enl2 = ble_estado().enlaces.iter().find(|l| l.paquete == 60).unwrap().id.clone();
        assert!(enviar(&enl2, "hola").unwrap_err().contains("objetos JSON"));
        al_desconectar(p, "fin de la prueba");
        // Sin radio en este sistema (Linux de las pruebas): activar lo dice, no finge.
        assert!(ble_activar(true).unwrap_err().contains("Bluetooth directo"));
        let (estado_antena, _) = antena();
        assert_eq!(estado_antena, "no-disponible");
    }

    #[test]
    fn registro_de_enlaces_con_motivo_y_rotacion() {
        assert_eq!(iso_utc(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(iso_utc(1_700_000_000_123), "2023-11-14T22:13:20.123Z");
        assert_eq!(iso_utc(951_782_400_000), "2000-02-29T00:00:00.000Z", "bisiesto");
        assert_eq!(linea_limpia("a\nb\tc\u{7}d", 50), "a b c d");
        assert_eq!(linea_limpia(&"x".repeat(500), 40).len(), 40);
        let r = RegistroBle { seq: 1, ms: 1_700_000_000_000, tipo: "enlace-cerrado".into(), enlace: Some("b2".into()), neurona: Some("n-tablet".into()), detalle: "motivo".into() };
        assert_eq!(linea_registro(&r), "2023-11-14T22:13:20.000Z ble enlace-cerrado enlace=b2 neurona=n-tablet · motivo");
        // El núcleo de verdad: abrir y cerrar un enlace deja el motivo y vuelve a anunciar.
        let p = "c:AA:BB:CC:DD:EE:77";
        al_conectar(p, "central", Some("AA:BB:CC:DD:EE:77"), 61);
        al_desconectar(p, "estado 8 (supervisión)");
        let r = ble_registro();
        assert!(r.iter().any(|x| x.tipo == "enlace-abierto" && x.detalle.contains("paquete=61")), "{r:?}");
        let cierre = r.iter().rev().find(|x| x.tipo == "enlace-cerrado").expect("cierre anotado");
        assert!(cierre.detalle.contains("estado 8 (supervisión)") && cierre.detalle.contains("vivo 0 s"), "{cierre:?}");
        assert!(r.windows(2).all(|w| w[0].seq < w[1].seq), "en orden");
        assert!(r.len() <= REGISTRO_CAP);
        // El archivo rota a «.1» al pasar del tope y no crece sin límite.
        let dir = std::env::temp_dir().join(format!("ble1108b-{}", std::process::id()));
        let ruta = dir.join("sub/enlaces.log");
        let linea = "x".repeat(99);
        for _ in 0..5 {
            anexar_rotando(&ruta, &vec![linea.clone(); 4], 1_000).unwrap();
        }
        let actual = std::fs::metadata(&ruta).unwrap().len();
        let respaldo = std::fs::metadata(dir.join("sub/enlaces.log.1")).unwrap().len();
        assert!(actual <= 1_000 + 400 && respaldo >= 1_000, "actual {actual} respaldo {respaldo}");
        assert!(std::fs::read_to_string(&ruta).unwrap().lines().all(|l| l == linea));
        assert!(anexar_rotando(&ruta, &[], 1_000).is_ok());
        let _ = std::fs::remove_dir_all(&dir);
    }

    // ─────────── BLE1109A: carril rápido (L2CAP) ───────────

    #[test]
    fn eventos_del_canal_rapido_se_leen_con_cuidado() {
        assert_eq!(leer_evento(r#"{"e":"psm","enlace":"c:AA:01","psm":133}"#), Some(EventoRadio::Psm { enlace: "c:AA:01".into(), psm: 133 }));
        assert_eq!(leer_evento(r#"{"e":"psm","enlace":"c:AA:01","psm":0}"#), None, "0 = sin canal rápido");
        assert_eq!(leer_evento(r#"{"e":"psm","enlace":"c:AA:01","psm":4097}"#), None, "fuera del rango LE");
        assert_eq!(leer_evento(r#"{"e":"psm","enlace":"c:AA:01","psm":-3}"#), None);
        assert_eq!(leer_evento(r#"{"e":"psm","enlace":"c:AA:01","psm":70000}"#), None);
        assert_eq!(leer_evento(r#"{"e":"psm","enlace":"mal id","psm":133}"#), None);
        assert_eq!(leer_evento(r#"{"e":"l2cap-abierto","enlace":"p:BB:02","psm":200}"#), Some(EventoRadio::L2capAbierto { enlace: "p:BB:02".into(), psm: Some(200) }));
        assert_eq!(leer_evento(r#"{"e":"l2cap-abierto","enlace":"p:BB:02"}"#), Some(EventoRadio::L2capAbierto { enlace: "p:BB:02".into(), psm: None }));
        assert_eq!(leer_evento(r#"{"e":"l2cap-abierto","enlace":"p:BB:02","psm":9}"#), Some(EventoRadio::L2capAbierto { enlace: "p:BB:02".into(), psm: Some(9) }));
        assert_eq!(leer_evento(r#"{"e":"l2cap-abierto","enlace":"p:BB:02","psm":999}"#), Some(EventoRadio::L2capAbierto { enlace: "p:BB:02".into(), psm: None }), "PSM raro: se abre sin él");
        assert_eq!(
            leer_evento(r#"{"e":"l2cap-cerrado","enlace":"c:AA:01","motivo":"el otro cerró"}"#),
            Some(EventoRadio::L2capCerrado { enlace: "c:AA:01".into(), motivo: "el otro cerró".into() })
        );
        assert_eq!(
            leer_evento(r#"{"e":"l2cap-cerrado","enlace":"c:AA:01"}"#),
            Some(EventoRadio::L2capCerrado { enlace: "c:AA:01".into(), motivo: "el canal L2CAP se cerró".into() })
        );
        assert_eq!(leer_evento(r#"{"e":"l2cap-cerrado","enlace":"zzz"}"#), None);
    }

    /// El núcleo de verdad con el canal rápido: GATT primero, el canal toma el relevo (y GATT calla), un flujo roto
    /// lo cierra, y el enlace sigue vivo por GATT con el mismo id.
    #[test]
    fn canal_rapido_toma_el_relevo_y_vuelve_a_gatt_sin_soltar_el_enlace() {
        use crate::ble_trama::Enlace;
        fn por_gatt(p: &str, otra: &mut Enlace, entregados: &mut Vec<String>) {
            let mut si = || true;
            while let Some(pq) = siguiente_paquete(p) {
                if let Some(c) = otra.recibir(&pq, ahora_ms(), &mut si) {
                    entregados.push(c);
                }
            }
            while let Some(pq) = otra.siguiente_paquete(ahora_ms()) {
                al_recibir(p, &pq);
            }
        }
        fn por_el_flujo(p: &str, otra: &mut Enlace, des: &mut Desmarcador, entregados: &mut Vec<String>) {
            let mut si = || true;
            while let Some(b) = siguiente_trama_rapida(p, 8192) {
                for pq in des.empujar(&b).expect("flujo alineado") {
                    if let Some(c) = otra.recibir_rapido(&pq, ahora_ms(), &mut si) {
                        entregados.push(c);
                    }
                }
            }
            let mut flujo = Vec::new();
            while let Some(pq) = otra.siguiente_paquete(ahora_ms()) {
                flujo.extend(l2::marco(&pq).expect("cabe en un marco"));
            }
            for trozo in flujo.chunks(333) {
                al_l2cap_datos(p, trozo);
            }
        }
        fn enviar_y_esperar(enl: &str, json: String, mut bombear: impl FnMut()) -> Result<u64, String> {
            let e = enl.to_string();
            let h = std::thread::spawn(move || enviar(&e, &json));
            for _ in 0..4_000 {
                bombear();
                if h.is_finished() {
                    break;
                }
                std::thread::sleep(Duration::from_millis(2));
            }
            h.join().unwrap()
        }
        let _g = con_ajuste(true); // BLE1109B: el canal rápido es un ajuste (apagado por defecto)
        let estado_de = |enl: &str| ble_estado().enlaces.into_iter().find(|l| l.id == enl).expect("enlace abierto");
        let p = "c:AA:BB:CC:DD:EE:64";
        al_conectar(p, "central", Some("AA:BB:CC:DD:EE:64"), 64);
        let enl = id_de_enlace(p);
        assert!(ble_enlace_ligado(enl.clone()));
        let mut otra = Enlace::nuevo(64);
        let mut entregados = Vec::new();
        // 0 · PSM inválido: se ignora; válido: disponible. GATT sigue siendo el carril.
        al_psm(p, 0);
        assert_eq!(estado_de(&enl).psm, None);
        al_psm(p, 0x85);
        let e0 = estado_de(&enl);
        assert_eq!((e0.psm, e0.carril.as_str()), (Some(0x85), "gatt"));
        assert!(["disponible", "abriendo"].contains(&e0.canal_rapido.as_str()), "{}", e0.canal_rapido);
        // 1 · Por GATT, como siempre.
        let r = enviar_y_esperar(&enl, "{\"t\":\"a\",\"d\":\"por gatt\"}".into(), || por_gatt(p, &mut otra, &mut entregados));
        assert!(r.is_ok(), "{r:?}");
        assert_eq!(entregados, vec!["{\"t\":\"a\",\"d\":\"por gatt\"}".to_string()]);
        entregados.clear();
        // 2 · El canal abre: todo va por él y GATT calla.
        al_l2cap_abierto(p, Some(0x85));
        assert_eq!(estado_de(&enl).carril, "gatt", "abierto no es en uso: falta la autoprueba");
        superar_prueba(p);
        otra.fijar_carril(true);
        let e1 = estado_de(&enl);
        assert_eq!((e1.carril.as_str(), e1.canal_rapido.as_str(), e1.psm), ("rapido", "abierto", Some(0x85)));
        assert_eq!(e1.kbps, None, "la capacidad del carril rápido se mide por él: aún sin medir");
        assert_eq!(e1.kbps_gatt, None, "(un mensaje corto no mide)");
        let grande = format!("{{\"t\":\"archivo.chunk\",\"d\":\"{}\"}}", "K".repeat(14_000));
        let mut des = Desmarcador::nuevo();
        let g2 = grande.clone();
        let e2 = enl.clone();
        let h = std::thread::spawn(move || enviar(&e2, &g2));
        for _ in 0..4_000 {
            assert!(siguiente_paquete(p).is_none() || h.is_finished(), "GATT no debe sacar nada con el canal abierto");
            por_el_flujo(p, &mut otra, &mut des, &mut entregados);
            if h.is_finished() {
                break;
            }
            std::thread::sleep(Duration::from_millis(2));
        }
        assert!(h.join().unwrap().is_ok());
        assert_eq!(entregados, vec![grande.clone()], "llega entero y una sola vez");
        entregados.clear();
        let e3 = estado_de(&enl);
        assert!(e3.kbps.is_some_and(|k| k > 0) && e3.kbps == e3.kbps_rapido && e3.carril == "rapido", "{e3:?}");
        // 3 · Lo que manda la otra app por el flujo, en trozos partidos, llega al buzón.
        let antes = ble_estado().ultimo_seq;
        otra.encolar(1, &format!("{{\"t\":\"x\",\"d\":\"{}\"}}", "M".repeat(3_000)), ahora_ms()).unwrap();
        for _ in 0..50 {
            por_el_flujo(p, &mut otra, &mut des, &mut entregados);
        }
        let recibidos = ble_recibidos(antes);
        assert_eq!(recibidos.len(), 1);
        assert_eq!(recibidos[0].enlace, enl);
        assert!(otra.hechos().iter().all(|h| h.resultado.is_ok()), "la otra app recibió el acuse por el flujo");
        // 4 · Un flujo roto cierra el canal, NO el enlace: sigue por GATT con el mismo id.
        al_l2cap_datos(p, &[0, 1, 0]);
        let e4 = estado_de(&enl);
        assert_eq!(e4.carril, "gatt");
        assert!(["disponible", "abriendo"].contains(&e4.canal_rapido.as_str()), "se reintentará: {}", e4.canal_rapido);
        let reg = ble_registro();
        assert!(reg.iter().any(|x| x.tipo == "l2cap-abierto" && x.detalle.starts_with("psm=133")), "{reg:?}");
        assert!(reg.iter().any(|x| x.tipo == "l2cap-cerrado" && x.detalle.contains("flujo inválido") && x.detalle.contains("se sigue por GATT")), "{reg:?}");
        otra.fijar_carril(false);
        let r = enviar_y_esperar(&enl, "{\"t\":\"b\",\"d\":\"otra vez gatt\"}".into(), || por_gatt(p, &mut otra, &mut entregados));
        assert!(r.is_ok(), "{r:?}");
        assert_eq!(entregados, vec!["{\"t\":\"b\",\"d\":\"otra vez gatt\"}".to_string()]);
        assert!(ble_estado().enlaces.iter().any(|l| l.id == enl), "el enlace nunca se soltó");
        // 5 · Cerrar dos veces no duplica el registro; el canal que ya no está no se vuelve a anotar.
        let n = ble_registro().iter().filter(|x| x.tipo == "l2cap-cerrado" && x.enlace.as_deref() == Some(enl.as_str())).count();
        al_l2cap_cerrado(p, "otra vez");
        al_l2cap_cerrado(p, "y otra");
        let m = ble_registro().iter().filter(|x| x.tipo == "l2cap-cerrado" && x.enlace.as_deref() == Some(enl.as_str())).count();
        assert!(m <= n + 2, "no se anota un cierre que no existe ({n} → {m})");
        // 6 · Un canal para un enlace que no existe: se ignora sin romper nada.
        al_l2cap_abierto("c:no-existe", Some(0x85));
        assert!(siguiente_trama_rapida("c:no-existe", 8192).is_none());
        al_desconectar(p, "fin de la prueba del canal rápido");
        assert!(ble_estado().enlaces.iter().all(|l| l.id != enl));
    }

    // ─────────── BLE1109B: ajuste apagado, ligado, fallos y caída a GATT ───────────

    static AJUSTE_PRUEBA: Mutex<()> = Mutex::new(());

    /// Fija el ajuste del canal rápido para esta prueba y evita que otra lo cambie mientras tanto.
    fn con_ajuste(activo: bool) -> std::sync::MutexGuard<'static, ()> {
        let g = match AJUSTE_PRUEBA.lock() {
            Ok(g) => g,
            Err(e) => e.into_inner(),
        };
        asegurar(); // el arranque lee la preferencia: que no pise el ajuste de la prueba
        CANAL_RAPIDO.store(activo, Ordering::SeqCst);
        g
    }

    fn id_de_enlace(p: &str) -> String {
        con_estado(|e| e.enlaces.iter().find(|l| l.plataforma == p).map(|l| l.id.clone())).expect("enlace abierto")
    }

    fn estado_enlace(id: &str) -> EnlaceBle {
        ble_estado().enlaces.into_iter().find(|l| l.id == id).expect("enlace abierto")
    }

    /// (BLE1109B) Simula el eco del otro lado a la autoprueba del canal: desde aquí el canal queda EN USO.
    fn superar_prueba(p: &str) {
        let n = con_estado(|e| e.enlaces.iter().find(|l| l.plataforma == p).and_then(|l| l.carril.nonce_prueba())).expect("hay una autoprueba en curso");
        al_l2cap_datos(p, &l2::marco(&l2::paquete_eco(n)).expect("cabe"));
    }

    /// Un mensaje por GATT de punta a punta contra un `Enlace` del otro lado. Devuelve lo entregado allí.
    fn mensaje_por_gatt(p: &str, id: &str, otra: &mut Enlace, json: &str) -> Vec<String> {
        let (e, j) = (id.to_string(), json.to_string());
        let h = std::thread::spawn(move || enviar(&e, &j));
        let mut entregados = Vec::new();
        let mut si = || true;
        for _ in 0..4_000 {
            while let Some(pq) = siguiente_paquete(p) {
                if let Some(c) = otra.recibir(&pq, ahora_ms(), &mut si) {
                    entregados.push(c);
                }
            }
            while let Some(pq) = otra.siguiente_paquete(ahora_ms()) {
                al_recibir(p, &pq);
            }
            if h.is_finished() {
                break;
            }
            std::thread::sleep(Duration::from_millis(2));
        }
        assert!(h.join().unwrap().is_ok(), "el envío por GATT termina con acuse");
        entregados
    }

    #[test]
    fn preferencia_vieja_de_prueba_31_deja_el_canal_rapido_encendido_por_defecto() {
        let vieja: PreferenciaBle = serde_json::from_str(r#"{"activo":true}"#).unwrap();
        assert_eq!(vieja, PreferenciaBle { activo: true, canal_rapido: true });
        assert!(PreferenciaBle::default().canal_rapido, "por defecto encendido");
        let apagada: PreferenciaBle = serde_json::from_str(&serde_json::to_string(&PreferenciaBle { activo: false, canal_rapido: false }).unwrap()).unwrap();
        assert!(!apagada.canal_rapido && !apagada.activo, "quien lo apagó a mano lo sigue teniendo apagado");
    }

    #[test]
    fn con_el_ajuste_apagado_el_enlace_es_gatt_puro_y_el_psm_se_ignora() {
        let _g = con_ajuste(false);
        let p = "c:AA:BB:CC:DD:EE:70";
        al_conectar(p, "central", Some("AA:BB:CC:DD:EE:70"), 64);
        let id = id_de_enlace(p);
        al_psm(p, 0x85); // un periférico de prueba.31 publica su PSM: con el ajuste apagado ni se mira
        assert!(ble_enlace_ligado(id.clone()));
        let a = tic(ahora_ms(), false);
        assert!(a.abrir_l2cap.iter().all(|(x, _)| x != p), "no se pide ningún canal");
        al_l2cap_abierto(p, Some(0x85)); // y si el otro abriera uno, se rechaza
        let e = estado_enlace(&id);
        assert_eq!((e.carril.as_str(), e.canal_rapido.as_str(), e.psm), ("gatt", "apagado", None));
        let mut otra = Enlace::nuevo(64);
        let got = mensaje_por_gatt(p, &id, &mut otra, "{\"t\":\"a\",\"d\":\"solo gatt\"}");
        assert_eq!(got, vec!["{\"t\":\"a\",\"d\":\"solo gatt\"}".to_string()]);
        al_desconectar(p, "fin de la prueba");
    }

    #[test]
    fn par_de_prueba_30_sin_caracteristica_psm_sigue_por_gatt_con_el_ajuste_encendido() {
        let _g = con_ajuste(true);
        let p = "c:AA:BB:CC:DD:EE:71";
        al_conectar(p, "central", Some("AA:BB:CC:DD:EE:71"), 64);
        let id = id_de_enlace(p);
        // Una app de prueba.30 no tiene la característica PSM: nunca llega `psm`. Una lectura fallida o con 0 tampoco cuenta.
        assert_eq!(leer_evento(r#"{"e":"psm","enlace":"c:AA:BB:CC:DD:EE:71","psm":0}"#), None);
        assert!(ble_enlace_ligado(id.clone()));
        let a = tic(ahora_ms() + 60_000, false);
        assert!(a.abrir_l2cap.iter().all(|(x, _)| x != p), "sin PSM no se abre nada");
        let e = estado_enlace(&id);
        assert_eq!((e.carril.as_str(), e.canal_rapido.as_str()), ("gatt", "sin-psm"));
        let mut otra = Enlace::nuevo(64);
        let got = mensaje_por_gatt(p, &id, &mut otra, "{\"t\":\"a\",\"d\":\"par antiguo\"}");
        assert_eq!(got.len(), 1, "GATT no se detiene por la lectura del PSM que no existe");
        al_desconectar(p, "fin de la prueba");
    }

    #[test]
    fn el_canal_solo_se_pide_despues_de_ligar() {
        let _g = con_ajuste(true);
        let p = "c:AA:BB:CC:DD:EE:72";
        al_conectar(p, "central", Some("AA:BB:CC:DD:EE:72"), 64);
        let id = id_de_enlace(p);
        al_psm(p, 0x85);
        let a = tic(ahora_ms(), false);
        assert!(a.abrir_l2cap.iter().all(|(x, _)| x != p), "con PSM pero sin «ligado»: GATT");
        assert_eq!(estado_enlace(&id).canal_rapido, "disponible");
        assert!(ble_enlace_ligado(id.clone()));
        let a = tic(ahora_ms(), false);
        assert!(a.abrir_l2cap.iter().any(|(x, psm)| x == p && *psm == 0x85), "ligado: ahora sí");
        assert!(!ble_enlace_ligado("b999999".to_string()), "un enlace que no existe");
        al_desconectar(p, "fin de la prueba");
    }

    #[test]
    fn fallos_del_canal_caen_a_gatt_sin_cerrar_el_enlace_y_dos_apagan_al_par() {
        let _g = con_ajuste(true);
        let p = "c:AA:BB:CC:DD:EE:73";
        al_conectar(p, "central", Some("AA:BB:CC:DD:EE:73"), 64);
        let id = id_de_enlace(p);
        assert!(ble_enlace_ligado(id.clone()));
        al_psm(p, 0x85);
        // 1 · Flujo desalineado.
        al_l2cap_abierto(p, Some(0x85));
        superar_prueba(p);
        assert_eq!(estado_enlace(&id).carril, "rapido");
        al_l2cap_datos(p, &[0, 1, 0]);
        let e = estado_enlace(&id);
        assert_eq!(e.carril, "gatt");
        assert_ne!(e.canal_rapido, "desactivado", "un fallo solo no apaga al par");
        // 2 · Cierre desde la plataforma (el otro lado, error de lectura/escritura…).
        al_l2cap_abierto(p, Some(0x85));
        al_l2cap_cerrado(p, "el otro aparato cerró el canal L2CAP");
        let e = estado_enlace(&id);
        assert_eq!((e.carril.as_str(), e.canal_rapido.as_str()), ("gatt", "desactivado"), "2 fallos en 10 min: apagado hasta reiniciar");
        let reg = ble_registro();
        assert!(reg.iter().any(|x| x.tipo == "l2cap-desactivado" && x.enlace.as_deref() == Some(id.as_str())), "{reg:?}");
        // 3 · Apagado: ni el PSM ni una apertura cambian nada, y el enlace sigue vivo y hablando por GATT.
        al_psm(p, 0x85);
        al_l2cap_abierto(p, Some(0x85));
        assert_eq!(estado_enlace(&id).carril, "gatt");
        let mut otra = Enlace::nuevo(64);
        assert_eq!(mensaje_por_gatt(p, &id, &mut otra, "{\"t\":\"a\",\"d\":\"sigue\"}").len(), 1);
        // 4 · Cambiar el ajuste olvida los fallos.
        con_estado(|e| e.castigos.limpiar());
        al_desconectar(p, "fin de la prueba");
    }

    #[test]
    fn canal_atascado_cae_a_gatt_y_el_mensaje_en_vuelo_llega_entero_una_vez() {
        let _g = con_ajuste(true);
        let p = "c:AA:BB:CC:DD:EE:74";
        al_conectar(p, "central", Some("AA:BB:CC:DD:EE:74"), 64);
        let id = id_de_enlace(p);
        assert!(ble_enlace_ligado(id.clone()));
        al_psm(p, 0x85);
        al_l2cap_abierto(p, Some(0x85));
        superar_prueba(p);
        let json = format!("{{\"t\":\"archivo.chunk\",\"d\":\"{}\"}}", "Q".repeat(6_000));
        let j2 = json.clone();
        con_estado(|e| e.enlaces.iter_mut().find(|l| l.plataforma == p).unwrap().nucleo.encolar(900, &j2, ahora_ms())).unwrap();
        // El canal escribe (sale el mensaje) pero no se lee ni un byte: atascado.
        assert!(siguiente_trama_rapida(p, 8192).is_some());
        // (BLE1110A) Primero sale un latido (el eco lo contestaría el otro lado); sin eco y sin leer nada, atascado.
        let t0 = ahora_ms();
        let primero = tic(t0 + l2::LATIDO_CANAL_MS + 100, false);
        assert!(primero.cerrar_l2cap.iter().all(|(x, _)| x != p), "un acuse lento no es un atasco: antes del plazo del eco no se cierra");
        let a = tic(t0 + l2::LATIDO_CANAL_MS + l2::PLAZO_ECO_LATIDO_MS + 200, false);
        let (_, motivo) = a.cerrar_l2cap.iter().find(|(x, _)| x == p).expect("el tic da el canal por atascado").clone();
        assert!(motivo.contains("atascado"), "{motivo}");
        al_l2cap_cerrado(p, &motivo);
        assert_eq!(estado_enlace(&id).carril, "gatt");
        assert!(ble_estado().enlaces.iter().any(|l| l.id == id), "el enlace no se cerró");
        // GATT retoma el mensaje desde el principio y llega entero.
        let mut otra = Enlace::nuevo(64);
        let mut si = || true;
        let mut entregados = Vec::new();
        for _ in 0..800 {
            while let Some(pq) = siguiente_paquete(p) {
                assert!(pq.len() <= 64);
                if let Some(c) = otra.recibir(&pq, ahora_ms(), &mut si) {
                    entregados.push(c);
                }
            }
            while let Some(pq) = otra.siguiente_paquete(ahora_ms()) {
                al_recibir(p, &pq);
            }
            if !entregados.is_empty() {
                break;
            }
        }
        assert_eq!(entregados, vec![json]);
        al_desconectar(p, "fin de la prueba");
    }

    #[test]
    fn la_cola_del_registro_empieza_en_una_linea_entera() {
        let dir = std::env::temp_dir().join(format!("ble1109b-cola-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let ruta = dir.join("enlaces.log");
        let lineas: Vec<String> = (0..50).map(|i| format!("2026-11-09T10:00:{i:02}.000Z ble nota · linea numero {i}")).collect();
        anexar_rotando(&ruta, &lineas, 1_000_000).unwrap();
        let todo = cola_de_registro(&ruta, 1_000_000);
        assert_eq!(todo.lines().count(), 50);
        let cola = cola_de_registro(&ruta, 300);
        assert!(cola.len() <= 300 && cola.starts_with("2026-"), "{cola:?}");
        assert!(cola.ends_with("linea numero 49\n"));
        assert_eq!(cola_de_registro(&dir.join("no-existe.log"), 100), "");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn autoprueba_ok_mueve_el_trafico_al_canal_y_mientras_tanto_gatt_sigue_llevandolo() {
        let _g = con_ajuste(true);
        let p = "c:AA:BB:CC:DD:EE:80";
        al_conectar(p, "central", Some("AA:BB:CC:DD:EE:80"), 64);
        let id = id_de_enlace(p);
        assert!(ble_enlace_ligado(id.clone()));
        al_psm(p, 0x85);
        al_l2cap_abierto(p, Some(0x85));
        // Abierto pero sin prueba superada: GATT lleva el tráfico y por el flujo solo sale la prueba.
        let e = estado_enlace(&id);
        assert_eq!((e.carril.as_str(), e.canal_rapido.as_str()), ("gatt", "abriendo"));
        let mut otra = Enlace::nuevo(64);
        assert_eq!(mensaje_por_gatt(p, &id, &mut otra, "{\"t\":\"a\",\"d\":\"durante la prueba\"}").len(), 1);
        let flujo = siguiente_trama_rapida(p, 8192).expect("sale el paquete de prueba");
        assert_eq!(flujo.len(), 2 + 3, "marco + [tipo|nonce]");
        assert_eq!(flujo[2], l2::P_PRUEBA);
        assert!(siguiente_trama_rapida(p, 8192).is_none(), "una sola prueba");
        // El otro lado nos manda SU prueba: la devolvemos como eco (aunque la nuestra no haya vuelto aún).
        al_l2cap_datos(p, &l2::marco(&l2::paquete_prueba(0x1234)).unwrap());
        let eco = siguiente_trama_rapida(p, 8192).expect("el eco debido sale por el flujo");
        assert_eq!((eco[2], eco[3], eco[4]), (l2::P_ECO, 0x12, 0x34));
        assert_eq!(estado_enlace(&id).carril, "gatt");
        superar_prueba(p);
        assert_eq!(estado_enlace(&id).carril, "rapido");
        let reg = ble_registro();
        assert!(reg.iter().any(|x| x.tipo == "l2cap-prueba-ok" && x.detalle.starts_with("rtt=") && x.detalle.contains("ms")), "{reg:?}");
        al_desconectar(p, "fin de la prueba");
    }

    #[test]
    fn autoprueba_sin_eco_en_3_s_cae_a_gatt_sin_cerrar_el_enlace_y_lo_deja_dicho() {
        let _g = con_ajuste(true);
        let p = "c:AA:BB:CC:DD:EE:81";
        al_conectar(p, "central", Some("AA:BB:CC:DD:EE:81"), 64);
        let id = id_de_enlace(p);
        assert!(ble_enlace_ligado(id.clone()));
        al_psm(p, 0x85);
        al_l2cap_abierto(p, Some(0x85));
        // Un mensaje en vuelo por GATT mientras la prueba corre.
        let json = format!("{{\"t\":\"archivo.chunk\",\"d\":\"{}\"}}", "W".repeat(3_000));
        let j2 = json.clone();
        con_estado(|e| e.enlaces.iter_mut().find(|l| l.plataforma == p).unwrap().nucleo.encolar(901, &j2, ahora_ms())).unwrap();
        let a = tic(ahora_ms() + l2::PLAZO_PRUEBA_MS / 2, false);
        assert!(a.cerrar_l2cap.iter().all(|(x, _)| x != p), "dentro del plazo no se cierra nada");
        let a = tic(ahora_ms() + l2::PLAZO_PRUEBA_MS + 100, false);
        let (_, motivo) = a.cerrar_l2cap.iter().find(|(x, _)| x == p).expect("sin eco en 3 s").clone();
        assert!(motivo.contains("autoprueba"), "{motivo}");
        al_l2cap_cerrado(p, &motivo);
        assert_eq!(estado_enlace(&id).carril, "gatt");
        assert!(ble_estado().enlaces.iter().any(|l| l.id == id), "el enlace no se cerró");
        let reg = ble_registro();
        assert!(reg.iter().any(|x| x.tipo == "l2cap-prueba-fallida" && x.detalle.starts_with("motivo=") && x.detalle.contains("autoprueba")), "{reg:?}");
        // El mensaje en vuelo llega entero por GATT.
        let mut otra = Enlace::nuevo(64);
        let mut si = || true;
        let mut entregados = Vec::new();
        for _ in 0..800 {
            while let Some(pq) = siguiente_paquete(p) {
                if let Some(c) = otra.recibir(&pq, ahora_ms(), &mut si) {
                    entregados.push(c);
                }
            }
            while let Some(pq) = otra.siguiente_paquete(ahora_ms()) {
                al_recibir(p, &pq);
            }
            if !entregados.is_empty() {
                break;
            }
            std::thread::sleep(Duration::from_millis(2));
        }
        assert_eq!(entregados, vec![json]);
        al_desconectar(p, "fin de la prueba");
    }

    #[test]
    fn el_par_apagado_vuelve_a_probar_pasada_una_hora() {
        let _g = con_ajuste(true);
        let p = "c:AA:BB:CC:DD:EE:82";
        al_conectar(p, "central", Some("AA:BB:CC:DD:EE:82"), 64);
        let id = id_de_enlace(p);
        assert!(ble_enlace_ligado(id.clone()));
        al_psm(p, 0x85);
        al_l2cap_abierto(p, Some(0x85));
        al_l2cap_cerrado(p, "fallo 1");
        al_l2cap_abierto(p, Some(0x85));
        al_l2cap_cerrado(p, "fallo 2");
        assert_eq!(estado_enlace(&id).canal_rapido, "desactivado");
        let _ = tic(ahora_ms() + l2::ESPERA_REINTENTO_MS / 2, false);
        assert_eq!(estado_enlace(&id).canal_rapido, "desactivado", "aún dentro de la hora");
        let _ = tic(ahora_ms() + l2::ESPERA_REINTENTO_MS + 1_000, false);
        assert_ne!(estado_enlace(&id).canal_rapido, "desactivado", "pasada la hora vuelve a probar");
        let reg = ble_registro();
        assert!(reg.iter().any(|x| x.tipo == "l2cap-reintento"), "{reg:?}");
        con_estado(|e| e.castigos.limpiar());
        al_desconectar(p, "fin de la prueba");
    }

}
