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
//     y macOS (CoreBluetooth, ble_macos.rs). Las demás plataformas dicen que no lo tienen.
//   · Un hilo propio cada 250 ms: plazos de acuse, rotación del anuncio (ventana de 5 min o clave
//     nueva), vecinos que caducan y a qué neuronas de la cuenta conectar solo.
//   · A la web: `ble_estado`, `ble_abrir`, `ble_cerrar`, `ble_enviar` (espera el ACUSE de la otra
//     app), `ble_recibidos`, `ble_activar`, `ble_pedir_permiso`; eventos `ble://mensaje` y
//     `ble://cambio`. Mismo papel que `malla_local.rs` con el TCP 47071.
//
// SOLO TRANSPORTA. Quién manda y si es auténtico lo decide la capa web con el saludo firmado
// (`nl.hola` con la prueba de cuenta), igual que por la red local.
// ═══════════════════════════════════════════════════════════════════════════

#![allow(dead_code)]

use crate::ble_trama::{self as bt, Enlace, Hecho, Vecindario};
use crate::malla_local_trama::{Buzon, Limitador, Recibido};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
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
    "En este sistema la app aún no trae Bluetooth directo: llega con la app nativa de macOS y Android (Windows y Linux, pendiente: contrato bluetooth-directo.md §9).";

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
        #[cfg(not(any(target_os = "android", target_os = "macos")))]
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
    /// Rendimiento medido del último mensaje de ≥ 2 KiB.
    pub kbps: Option<u32>,
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

#[derive(Serialize, Clone, Debug)]
pub struct EnvioBle {
    pub enlace: String,
    /// Desde que se encoló hasta el acuse de la otra app.
    pub ms: u64,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct PreferenciaBle {
    pub activo: bool,
}

impl Default for PreferenciaBle {
    fn default() -> Self {
        PreferenciaBle { activo: true }
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
}

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

fn emitir<S: Serialize + Clone>(evento: &str, carga: S) {
    if let Some(app) = APP.get() {
        use tauri::Emitter;
        let _ = app.emit(evento, carga);
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
    let activo = leer_preferencia().activo;
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
    con_estado(|e| {
        if e.radio != estado_radio || e.motivo != motivo {
            marcar_cambio(e);
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
            }
        }
    });
}

fn texto_radio(estado_radio: &str) -> &'static str {
    match estado_radio {
        "encendida" => "Bluetooth directo encendido: anunciándose y escuchando a tus neuronas cercanas, sin Wi-Fi ni internet.",
        "apagada" => "El Bluetooth de este aparato está apagado.",
        "sin-permiso" => "Falta el permiso de Bluetooth («Dispositivos cercanos» en Android, «Bluetooth» en macOS).",
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
        });
        marcar_cambio(e);
        false
    });
    if rechazar {
        radio().desconectar(plataforma);
    }
}

pub fn al_mtu(plataforma: &str, paquete: usize) {
    con_estado(|e| {
        if let Some(l) = e.enlaces.iter_mut().find(|l| l.plataforma == plataforma) {
            l.nucleo.fijar_paquete(paquete);
        }
    });
}

pub fn al_desconectar(plataforma: &str, motivo: &str) {
    con_estado(|e| {
        let Some(i) = e.enlaces.iter().position(|l| l.plataforma == plataforma) else { return };
        let mut l = e.enlaces.remove(i);
        l.nucleo.cerrar(&format!("el enlace Bluetooth se cerró: {motivo}"));
        let h = l.nucleo.hechos();
        entregar_hechos(e, h);
        marcar_cambio(e);
    });
}

/// Un paquete que llegó por la radio. Si completa un mensaje, va al buzón y a la web.
pub fn al_recibir(plataforma: &str, paquete: &[u8]) {
    let ahora = ahora_ms();
    let (nuevo, acusar) = con_estado(|e| {
        let Estado { enlaces, limitador, buzon, esperas, .. } = e;
        let Some(l) = enlaces.iter_mut().find(|l| l.plataforma == plataforma) else { return (None, false) };
        let id = l.id.clone();
        let cuerpo = l.nucleo.recibir(paquete, ahora, &mut || limitador.permitir(&id, ahora));
        for h in l.nucleo.hechos() {
            if let Some(tx) = esperas.remove(&h.token) {
                let _ = tx.send(h.resultado);
            }
        }
        let acusar = l.nucleo.hay_paquetes();
        (cuerpo.map(|c| buzon.poner(&id, c, ahora)), acusar)
    });
    if acusar {
        radio().hay_datos(plataforma);
    }
    if let Some(r) = nuevo {
        emitir(EVENTO_MENSAJE, MensajeBle::from(r));
    }
}

/// La radio pide el siguiente paquete para ese enlace (None: nada que mandar ahora).
pub fn siguiente_paquete(plataforma: &str) -> Option<Vec<u8>> {
    let ahora = ahora_ms();
    con_estado(|e| e.enlaces.iter_mut().find(|l| l.plataforma == plataforma)?.nucleo.siguiente_paquete(ahora))
}

// ───────────────────────────── Hilo de plazos ─────────────────────────────

/// Lo que el tic decide hacer con la radio (se hace FUERA del cerrojo).
#[derive(Default)]
struct Acciones {
    anunciar: Option<String>,
    conectar: Vec<String>,
    datos: Vec<String>,
    cambio: Option<EstadoBle>,
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
            let h = e.enlaces[i].nucleo.hechos();
            entregar_hechos(e, h);
            if e.enlaces[i].nucleo.hay_paquetes() {
                a.datos.push(e.enlaces[i].plataforma.clone());
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
                e.vecindario.marcar_intento(d, ahora);
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
        for p in a.datos {
            r.hay_datos(&p);
        }
        if let Some(c) = a.cambio {
            emitir(EVENTO_CAMBIO, c);
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
                kbps: m.kbps,
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
    match rx.recv_timeout(Duration::from_millis(bt::PLAZO_TOTAL_MS + 5_000)) {
        Ok(r) => r.map_err(|m| format!("Bluetooth directo: {m}.")),
        Err(_) => Err("Bluetooth directo: sin respuesta de la radio.".into()),
    }
}

/// Lo recibido después de `desde` (la web lo pide al arrancar: nada se pierde por llegar antes).
#[tauri::command]
pub fn ble_recibidos(desde: u64) -> Vec<MensajeBle> {
    let ahora = ahora_ms();
    con_estado(|e| e.buzon.desde(desde, ahora, BUZON_EDAD_MS)).into_iter().map(MensajeBle::from).collect()
}

#[tauri::command]
pub fn ble_activar(activo: bool) -> Result<EstadoBle, String> {
    if !radio().disponible() {
        return Err(MOTIVO_SIN_RADIO.to_string());
    }
    asegurar();
    guardar_preferencia(PreferenciaBle { activo })?;
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
}
