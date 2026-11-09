// ═══════════════════════════════════════════════════════════════════════════
// enlace_wifi_windows — Wi-Fi Direct de Windows (WinRT) para `enlace_wifi.rs` (WIN1109B · 2026-11-09).
// Contrato: architecture/wifi-directo.md §10. SOLO Windows (10 versión 1809 o posterior; Windows 11).
// ---------------------------------------------------------------------------
// Mismo protocolo que Android: la web negocia (firmado y cifrado, `enlace.wifi.*`) y aquí solo se toca la radio.
//   · Dueño del grupo (`ap`): `WiFiDirectAdvertisementPublisher` autónomo + `LegacySettings` (red `DIRECT-xy-StarSeed`,
//     contraseña al azar de 16 caracteres) + `WiFiDirectConnectionListener`. Los clientes Android 10+ (y Linux) se
//     unen con nombre y contraseña, como a cualquier grupo de Android. La contraseña SOLO sale por
//     `enlace_wifi_credenciales` hacia la web, que la cifra con ECDH en `enlace.wifi.listo` fase `red`; no está en
//     el estado, ni en eventos, ni en el registro.
//   · Cliente (`cliente`): se une a un grupo `DIRECT-…` (de Android, Linux o Windows) por un adaptador que NO sea el
//     de la conexión de casa. Primero el dispositivo Wi-Fi Direct (`WiFiDirectDevice`) si el grupo se ve como
//     tal; si no, un `WiFiAdapter` distinto del que tiene Internet (`ConnectWithPasswordCredentialAsync`). Si solo
//     hay un adaptador y está en el Wi-Fi de casa NO se suelta: error `sin-soporte` con su porqué.
//   · IP: el dueño toma la del grupo (192.168.137.1 o 192.168.49.1, las habituales); el cliente busca al dueño en
//     `ip_ap` (la pista que dio la web) o en las habituales, y confirma que la IP propia está en su subred.
//   · Interruptor: `STARSEED_SIN_WIFI_DIRECT_WINDOWS=1`. Lo puro está en `win_p2p_logica.rs::wifi`, con pruebas.
// Esta parte se comprobó con `cargo check --target x86_64-pc-windows-msvc`; lo que hacen las radios reales lo
// confirma un PC con Windows (contrato §10.4).
// ═══════════════════════════════════════════════════════════════════════════

use crate::enlace_wifi::{ahora_ms, ip_local_hacia, VERSION};
use crate::enlace_wifi_logica::{self as logica, CapacidadesWifi, CredencialesNativas, EstadoEnlaceWifi};
use crate::win_p2p_logica::wifi as lg;
use std::net::Ipv4Addr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use windows::core::HSTRING;
use windows::Devices::Enumeration::DeviceInformation;
use windows::Devices::Radios::{Radio, RadioKind, RadioState};
use windows::Devices::WiFi::{WiFiAccessStatus, WiFiAdapter, WiFiConnectionStatus, WiFiReconnectionKind};
use windows::Devices::WiFiDirect::{
    WiFiDirectAdvertisementListenStateDiscoverability, WiFiDirectAdvertisementPublisher, WiFiDirectAdvertisementPublisherStatus, WiFiDirectConnectionListener,
    WiFiDirectConnectionParameters, WiFiDirectConnectionRequestedEventArgs, WiFiDirectDevice, WiFiDirectDeviceSelectorType,
};
use windows::Foundation::TypedEventHandler;
use windows::Networking::Connectivity::{NetworkInformation, NetworkAdapter};
use windows::Networking::HostNameType;
use windows::Security::Credentials::PasswordCredential;
use windows::Security::Cryptography::CryptographicBuffer;
use windows::Storage::Streams::DataReader;
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};

/// Se vuelve a mirar el equipo si la última comprobación es más vieja que esto.
const VIGENCIA_SONDA: Duration = Duration::from_secs(20);

static ESTADO: Mutex<Option<EstadoEnlaceWifi>> = Mutex::new(None);
static SONDA: Mutex<Option<(lg::SondaWifi, Instant)>> = Mutex::new(None);
static SONDEANDO: AtomicBool = AtomicBool::new(false);
/// Hay una apertura o unión en marcha.
static OCUPADO: AtomicBool = AtomicBool::new(false);
/// Se pidió cerrar mientras se abría o se unía.
static CANCELAR: AtomicBool = AtomicBool::new(false);
/// Nombre y contraseña del grupo que abrió ESTE equipo (para la web; nunca al estado).
static CLAVE: Mutex<Option<(String, CredencialesNativas)>> = Mutex::new(None);
static GRUPO: Mutex<Option<Grupo>> = Mutex::new(None);
static UNION: Mutex<Option<Union>> = Mutex::new(None);

/// El grupo abierto por este equipo. Mientras viva, el grupo se anuncia.
struct Grupo {
    sesion: String,
    publicador: WiFiDirectAdvertisementPublisher,
    escucha: WiFiDirectConnectionListener,
    token_escucha: i64,
    token_estado: i64,
    conectados: std::sync::Arc<Mutex<Vec<WiFiDirectDevice>>>,
}

/// La unión de este equipo a un grupo ajeno.
struct Union {
    sesion: String,
    dispositivo: Option<WiFiDirectDevice>,
    adaptador: Option<WiFiAdapter>,
}

pub fn estado() -> EstadoEnlaceWifi {
    ESTADO.lock().ok().and_then(|g| g.clone()).unwrap_or_default()
}

fn poner(e: EstadoEnlaceWifi) {
    if let Ok(mut g) = ESTADO.lock() {
        *g = Some(EstadoEnlaceWifi { t: ahora_ms(), ..e });
    }
    VERSION.fetch_add(1, Ordering::Relaxed);
}

fn evento(ev: lg::Evento) {
    let nuevo = lg::aplicar(&estado(), ev, ahora_ms());
    poner(nuevo);
}

fn desactivado() -> bool {
    lg::apagado(std::env::var(lg::ENTORNO_SIN_WIFI_DIRECT).ok().as_deref())
}

fn texto_error(e: &windows::core::Error) -> String {
    let m = e.message().trim().to_string();
    if m.is_empty() {
        format!("0x{:08X}", e.code().0 as u32)
    } else {
        m
    }
}

/// Un hilo propio en el apartamento MTA de COM (lo que piden las llamadas bloqueantes de WinRT).
fn hilo(nombre: &str, f: impl FnOnce() + Send + 'static) {
    let _ = std::thread::Builder::new().name(format!("starseed-wifi-win-{nombre}")).spawn(move || {
        // SAFETY: se empareja con `CoUninitialize` al salir; si el hilo ya tenía otro modo, no se desinicializa.
        let iniciado = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }.is_ok();
        f();
        if iniciado {
            unsafe { CoUninitialize() };
        }
    });
}

fn azar(n: u32) -> Vec<u8> {
    let Ok(b) = CryptographicBuffer::GenerateRandom(n) else { return Vec::new() };
    let mut v = vec![0u8; b.Length().unwrap_or(0) as usize];
    if v.is_empty() {
        return v;
    }
    match DataReader::FromBuffer(&b).and_then(|r| r.ReadBytes(&mut v)) {
        Ok(()) => v,
        Err(_) => Vec::new(),
    }
}

// ─────────────────────────────── Capacidades ───────────────────────────────

fn sondear() -> lg::SondaWifi {
    let acceso = match WiFiAdapter::RequestAccessAsync().and_then(|o| o.join()) {
        Ok(WiFiAccessStatus::Allowed) => lg::AccesoWifi::Concedido,
        Ok(WiFiAccessStatus::DeniedByUser) | Ok(WiFiAccessStatus::DeniedBySystem) => lg::AccesoWifi::Denegado,
        _ => lg::AccesoWifi::Desconocido,
    };
    let adaptadores = WiFiAdapter::FindAllAdaptersAsync().and_then(|o| o.join()).and_then(|v| v.Size()).unwrap_or(0) as usize;
    let encendida = Radio::GetRadiosAsync()
        .and_then(|o| o.join())
        .map(|v| v.into_iter().any(|r| r.Kind().ok() == Some(RadioKind::WiFi) && r.State().ok() == Some(RadioState::On)))
        .unwrap_or(false);
    let con_wifi_de_casa = perfil_de_casa_conectado();
    lg::SondaWifi { sondeado: true, adaptadores, acceso, encendida, con_wifi_de_casa, adaptador_virtual: adaptadores > 1, desactivado: desactivado() }
}

fn perfil_de_casa_conectado() -> bool {
    NetworkInformation::GetInternetConnectionProfile().and_then(|p| p.IsWlanConnectionProfile()).unwrap_or(false)
}

/// Mira el equipo en un hilo y avisa (el estado sube de versión para que la web vuelva a preguntar).
fn sondear_en_hilo() {
    if SONDEANDO.swap(true, Ordering::SeqCst) {
        return;
    }
    hilo("sonda", || {
        let s = sondear();
        if let Ok(mut g) = SONDA.lock() {
            *g = Some((s, Instant::now()));
        }
        SONDEANDO.store(false, Ordering::SeqCst);
        VERSION.fetch_add(1, Ordering::Relaxed);
    });
}

pub fn capacidades() -> CapacidadesWifi {
    if desactivado() {
        return lg::capacidades(&lg::SondaWifi::sin_mirar(true));
    }
    let (sonda, vieja) = match SONDA.lock().ok().and_then(|g| *g) {
        Some((s, t)) => (s, t.elapsed() > VIGENCIA_SONDA),
        None => (lg::SondaWifi::sin_mirar(false), true),
    };
    if vieja {
        sondear_en_hilo();
    }
    lg::capacidades(&sonda)
}

// ─────────────────────────────── Dueño del grupo ───────────────────────────────

fn ipv4_del_equipo() -> Vec<Ipv4Addr> {
    let Ok(nombres) = NetworkInformation::GetHostNames() else { return Vec::new() };
    nombres
        .into_iter()
        .filter(|n| n.Type().ok() == Some(HostNameType::Ipv4))
        .filter_map(|n| n.CanonicalName().ok())
        .filter_map(|t| lg::ip_privada(&t.to_string()))
        .collect()
}

pub fn abrir_ap(sesion: String, metodo: String) -> EstadoEnlaceWifi {
    let fallo = |codigo: &str, m: &str| logica::estado_error(Some(&sesion), codigo, m, ahora_ms());
    if desactivado() {
        return fallo("sin-soporte", &format!("Wi-Fi Direct apagado en esta instalación ({}).", lg::ENTORNO_SIN_WIFI_DIRECT));
    }
    if metodo != lg::METODO {
        return fallo("sin-soporte", "Windows abre grupos Wi-Fi Direct («wifi-direct»), no un punto de acceso.");
    }
    if !logica::sesion_valida(&sesion) {
        return fallo("fallo-nativo", "La sesión no es válida: no se toca la radio.");
    }
    if OCUPADO.swap(true, Ordering::SeqCst) {
        return fallo("fallo-nativo", "Ya hay una apertura o una unión en marcha.");
    }
    CANCELAR.store(false, Ordering::SeqCst);
    evento(lg::Evento::AbriendoGrupo { sesion: sesion.clone() });
    hilo("go", move || {
        match abrir_grupo_en_hilo(&sesion) {
            Ok(()) => {}
            Err((codigo, m)) => {
                soltar_grupo();
                evento(lg::Evento::Error { codigo, mensaje: m });
            }
        }
        OCUPADO.store(false, Ordering::SeqCst);
    });
    estado()
}

fn abrir_grupo_en_hilo(sesion: &str) -> Result<(), (&'static str, String)> {
    soltar_grupo();
    let e = |x: windows::core::Error| (lg::codigo_de_hresult(x.code().0), format!("Windows no pudo abrir el grupo Wi-Fi Direct: {}", texto_error(&x)));
    // Nombre y contraseña al azar del sistema (CSPRNG de Windows).
    let a = azar(66);
    if a.len() < 66 {
        return Err(("fallo-nativo", "Windows no dio bytes al azar para la contraseña.".into()));
    }
    let ssid = lg::nombre_grupo([a[0], a[1]]);
    let clave = lg::clave_de_azar(&a[2..]).ok_or(("fallo-nativo", "No se pudo formar la contraseña del grupo.".to_string()))?;
    if !lg::grupo_valido(&ssid, &clave) {
        return Err(("fallo-nativo", "El nombre o la contraseña del grupo no pasan las reglas del contrato.".into()));
    }

    let publicador = WiFiDirectAdvertisementPublisher::new().map_err(e)?;
    let anuncio = publicador.Advertisement().map_err(e)?;
    anuncio.SetIsAutonomousGroupOwnerEnabled(true).map_err(e)?;
    anuncio.SetListenStateDiscoverability(WiFiDirectAdvertisementListenStateDiscoverability::Normal).ok();
    let ajustes = anuncio.LegacySettings().map_err(e)?;
    ajustes.SetIsEnabled(true).map_err(e)?;
    ajustes.SetSsid(&HSTRING::from(ssid.as_str())).map_err(e)?;
    let credencial = PasswordCredential::new().map_err(e)?;
    credencial.SetPassword(&HSTRING::from(clave.as_str())).map_err(e)?;
    ajustes.SetPassphrase(&credencial).map_err(e)?;

    // Si otro Windows pide entrar por Wi-Fi Direct puro (no por nombre y contraseña), se acepta.
    let conectados = std::sync::Arc::new(Mutex::new(Vec::<WiFiDirectDevice>::new()));
    let escucha = WiFiDirectConnectionListener::new().map_err(e)?;
    let lista = conectados.clone();
    let token_escucha = escucha
        .ConnectionRequested(&TypedEventHandler::<WiFiDirectConnectionListener, WiFiDirectConnectionRequestedEventArgs>::new(move |_, args| {
            let Some(a) = args.as_ref() else { return Ok(()) };
            let lista = lista.clone();
            if let Ok(id) = a.GetConnectionRequest().and_then(|r| r.DeviceInformation()).and_then(|d| d.Id()) {
                hilo("acepta", move || {
                    if let Ok(d) = WiFiDirectDevice::FromIdAsync(&id).and_then(|o| o.join()) {
                        if let Ok(mut g) = lista.lock() {
                            g.push(d);
                        }
                    }
                });
            }
            Ok(())
        }))
        .map_err(e)?;
    let token_estado = publicador
        .StatusChanged(&TypedEventHandler::<WiFiDirectAdvertisementPublisher, windows::Devices::WiFiDirect::WiFiDirectAdvertisementPublisherStatusChangedEventArgs>::new(|_, args| {
            if let Some(a) = args.as_ref() {
                if a.Status().ok() == Some(WiFiDirectAdvertisementPublisherStatus::Aborted) {
                    // El grupo se cayó por su cuenta (radio apagada, otro programa tomó el adaptador…).
                    let est = estado();
                    if est.fase == "red-lista" || est.fase == "abriendo" {
                        evento(lg::Evento::Error { codigo: "fallo-nativo", mensaje: "El grupo Wi-Fi Direct se cerró (Windows lo abortó).".into() });
                    }
                }
            }
            Ok(())
        }))
        .map_err(e)?;
    publicador.Start().map_err(e)?;
    if let Ok(mut g) = GRUPO.lock() {
        *g = Some(Grupo { sesion: sesion.to_string(), publicador: publicador.clone(), escucha, token_escucha, token_estado, conectados });
    }

    // Espera a que Windows lo ponga en marcha (hasta 10 s).
    let t0 = Instant::now();
    loop {
        if CANCELAR.load(Ordering::SeqCst) {
            return Ok(());
        }
        match publicador.Status().ok() {
            Some(WiFiDirectAdvertisementPublisherStatus::Started) => break,
            Some(WiFiDirectAdvertisementPublisherStatus::Aborted) => {
                return Err(("fallo-nativo", "Windows abortó el grupo Wi-Fi Direct (¿el adaptador no admite ser dueño del grupo?).".into()));
            }
            _ => {}
        }
        if t0.elapsed() > Duration::from_secs(10) {
            return Err(("fallo-nativo", "El grupo Wi-Fi Direct no arrancó a tiempo.".into()));
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    // La IP del dueño llega un poco después (hasta 8 s). Si no aparece, el cliente probará las habituales.
    let t1 = Instant::now();
    let mut ip = None;
    while t1.elapsed() < Duration::from_secs(8) && !CANCELAR.load(Ordering::SeqCst) {
        ip = lg::ip_de_grupo(&ipv4_del_equipo());
        if ip.is_some() {
            break;
        }
        std::thread::sleep(Duration::from_millis(400));
    }
    if CANCELAR.load(Ordering::SeqCst) {
        return Ok(());
    }
    if let Ok(mut g) = CLAVE.lock() {
        *g = Some((sesion.to_string(), CredencialesNativas { ssid: ssid.clone(), clave, banda: None, ip: ip.map(|i| i.to_string()) }));
    }
    evento(lg::Evento::GrupoListo { ssid, ip: ip.map(|i| i.to_string()) });
    Ok(())
}

fn soltar_grupo() {
    let g = GRUPO.lock().ok().and_then(|mut g| g.take());
    if let Some(g) = g {
        let _ = g.publicador.RemoveStatusChanged(g.token_estado);
        let _ = g.escucha.RemoveConnectionRequested(g.token_escucha);
        let _ = g.publicador.Stop();
        if let Ok(mut l) = g.conectados.lock() {
            for d in l.drain(..) {
                cerrar_objeto(&d);
            }
        }
        let _ = g.sesion;
    }
    if let Ok(mut c) = CLAVE.lock() {
        *c = None;
    }
}

fn cerrar_objeto(d: &impl windows::core::Interface) {
    if let Ok(c) = d.cast::<windows::Foundation::IClosable>() {
        let _ = c.Close();
    }
}

/// Nombre y contraseña del grupo que abrió ESTE equipo en esa sesión.
pub fn credenciales(sesion: &str) -> Option<CredencialesNativas> {
    CLAVE.lock().ok().and_then(|g| g.as_ref().filter(|(s, _)| s == sesion).map(|(_, c)| c.clone()))
}

// ─────────────────────────────── Cliente ───────────────────────────────

pub fn unirse(sesion: String, metodo: String, ssid: String, clave: String, ip_ap: Option<String>) -> EstadoEnlaceWifi {
    let fallo = |codigo: &str, m: &str| logica::estado_error(Some(&sesion), codigo, m, ahora_ms());
    if desactivado() {
        return fallo("sin-soporte", &format!("Wi-Fi Direct apagado en esta instalación ({}).", lg::ENTORNO_SIN_WIFI_DIRECT));
    }
    if metodo != lg::METODO {
        return fallo("sin-soporte", "Windows se une por Wi-Fi Direct («wifi-direct»), no a una red cualquiera.");
    }
    if !lg::grupo_valido(&ssid, &clave) {
        return fallo("fallo-nativo", "Solo se unen grupos Wi-Fi Direct («DIRECT-xy-…») con contraseña válida.");
    }
    if OCUPADO.swap(true, Ordering::SeqCst) {
        return fallo("fallo-nativo", "Ya hay una apertura o una unión en marcha.");
    }
    CANCELAR.store(false, Ordering::SeqCst);
    evento(lg::Evento::Uniendo { sesion: sesion.clone(), ssid: ssid.clone(), ip_ap: ip_ap.clone() });
    hilo("cliente", move || {
        match unirse_en_hilo(&sesion, &ssid, &clave, ip_ap.as_deref()) {
            Ok(()) => {}
            Err((codigo, m)) => {
                soltar_union();
                evento(lg::Evento::Error { codigo, mensaje: m });
            }
        }
        OCUPADO.store(false, Ordering::SeqCst);
    });
    estado()
}

/// Adaptadores Wi-Fi que NO tienen la conexión de casa (por ahí se une sin soltar el Wi-Fi de casa).
fn adaptadores_libres() -> (Vec<WiFiAdapter>, usize) {
    let todos: Vec<WiFiAdapter> = WiFiAdapter::FindAllAdaptersAsync().and_then(|o| o.join()).map(|v| v.into_iter().collect()).unwrap_or_default();
    let total = todos.len();
    let de_casa: Option<NetworkAdapter> = NetworkInformation::GetInternetConnectionProfile().ok().and_then(|p| if p.IsWlanConnectionProfile().unwrap_or(false) { p.NetworkAdapter().ok() } else { None });
    let id = |a: &NetworkAdapter| a.NetworkAdapterId().ok();
    let libres = todos
        .into_iter()
        .filter(|w| match (&de_casa, w.NetworkAdapter().ok()) {
            (Some(c), Some(a)) => id(c) != id(&a),
            _ => true,
        })
        .collect();
    (libres, total)
}

fn unirse_en_hilo(sesion: &str, ssid: &str, clave: &str, ip_ap: Option<&str>) -> Result<(), (&'static str, String)> {
    soltar_union();
    let mut union = Union { sesion: sesion.to_string(), dispositivo: None, adaptador: None };

    // 1) Como dispositivo Wi-Fi Direct: solo si el grupo se ve así (su nombre coincide). Android 10+ suele
    //    mostrarlo como red normal, y entonces se pasa a (2).
    union.dispositivo = dispositivo_del_grupo(ssid);

    // 2) Como red `DIRECT-…` por un adaptador que no sea el de casa.
    if union.dispositivo.is_none() {
        let (libres, total) = adaptadores_libres();
        let Some(adaptador) = libres.into_iter().next() else {
            let m = if total == 0 {
                "Este equipo no tiene adaptador Wi-Fi."
            } else {
                "Este equipo solo muestra un adaptador Wi-Fi y está en tu Wi-Fi de casa: no se suelta para unirse al grupo directo."
            };
            return Err(("sin-soporte", m.into()));
        };
        let credencial = PasswordCredential::new().map_err(|x| ("fallo-nativo", texto_error(&x)))?;
        credencial.SetPassword(&HSTRING::from(clave)).map_err(|x| ("fallo-nativo", texto_error(&x)))?;
        let mut red = None;
        for intento in 0..5 {
            if CANCELAR.load(Ordering::SeqCst) {
                return Ok(());
            }
            let _ = adaptador.ScanAsync().and_then(|o| o.join());
            red = adaptador
                .NetworkReport()
                .and_then(|r| r.AvailableNetworks())
                .ok()
                .and_then(|v| v.into_iter().find(|n| n.Ssid().map(|s| s.to_string() == ssid).unwrap_or(false)));
            if red.is_some() {
                break;
            }
            if intento < 4 {
                std::thread::sleep(Duration::from_secs(2));
            }
        }
        let Some(red) = red else {
            return Err(("no-encontrada", format!("La red «{ssid}» no aparece desde este equipo (¿demasiado lejos?).")));
        };
        let r = adaptador
            .ConnectWithPasswordCredentialAsync(&red, WiFiReconnectionKind::Manual, &credencial)
            .and_then(|o| o.join())
            .map_err(|x| (lg::codigo_de_hresult(x.code().0), format!("Windows no pudo unirse a «{ssid}»: {}", texto_error(&x))))?;
        if r.ConnectionStatus().ok() != Some(WiFiConnectionStatus::Success) {
            return Err(("fallo-nativo", format!("Windows no pudo unirse a «{ssid}» ({:?}): ¿contraseña distinta?", r.ConnectionStatus().ok())));
        }
        union.adaptador = Some(adaptador);
    }
    if let Ok(mut g) = UNION.lock() {
        *g = Some(union);
    }

    // Dentro: se espera la IP (DHCP del dueño) hasta 15 s y se busca al dueño en la subred.
    let candidatas = lg::ips_a_probar(ip_ap);
    let t1 = Instant::now();
    while t1.elapsed() < Duration::from_secs(15) {
        if CANCELAR.load(Ordering::SeqCst) {
            return Ok(());
        }
        for dueno in &candidatas {
            if let Some(local) = ip_local_hacia(*dueno, logica::PUERTO_CANAL) {
                if logica::misma_subred(local, *dueno) && local != *dueno {
                    evento(lg::Evento::Unida { ip_propia: local.to_string(), ip_ap: Some(dueno.to_string()) });
                    return Ok(());
                }
            }
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    Err(("fallo-nativo", format!("Unido a «{ssid}», pero el dueño del grupo no dio dirección IP a este equipo.")))
}

/// El dispositivo Wi-Fi Direct cuyo nombre es el del grupo (o termina en lo que sigue a `DIRECT-xy-`).
fn dispositivo_del_grupo(ssid: &str) -> Option<WiFiDirectDevice> {
    let selector = WiFiDirectDevice::GetDeviceSelector2(WiFiDirectDeviceSelectorType::AssociationEndpoint).ok()?;
    let lista = DeviceInformation::FindAllAsyncAqsFilter(&selector).and_then(|o| o.join()).ok()?;
    let cola = ssid.get(10..).filter(|c| !c.is_empty());
    let id = lista
        .into_iter()
        .find(|d| {
            let n = d.Name().map(|n| n.to_string()).unwrap_or_default();
            n == ssid || cola.is_some_and(|c| n.ends_with(c))
        })
        .and_then(|d| d.Id().ok())?;
    let parametros = WiFiDirectConnectionParameters::new().ok()?;
    WiFiDirectDevice::FromIdAsync2(&id, &parametros).and_then(|o| o.join()).ok()
}

fn soltar_union() {
    let u = UNION.lock().ok().and_then(|mut g| g.take());
    if let Some(u) = u {
        if let Some(a) = &u.adaptador {
            let _ = a.Disconnect();
        }
        if let Some(d) = &u.dispositivo {
            cerrar_objeto(d);
        }
        let _ = u.sesion;
    }
}

// ─────────────────────────────── Cerrar ───────────────────────────────

/// Cierra el grupo o la unión de esa sesión (en un hilo: puede tardar) y deja el Wi-Fi de casa como estaba.
pub fn cerrar(sesion: String) -> EstadoEnlaceWifi {
    let e = estado();
    if e.sesion.as_deref().is_some_and(|s| s != sesion) {
        return e;
    }
    CANCELAR.store(true, Ordering::SeqCst);
    if e.fase == "inactivo" || e.fase == "cerrado" {
        return e;
    }
    evento(lg::Evento::Cerrando);
    hilo("cerrar", move || {
        let t0 = Instant::now();
        while OCUPADO.load(Ordering::SeqCst) && t0.elapsed() < Duration::from_secs(10) {
            std::thread::sleep(Duration::from_millis(200));
        }
        soltar_grupo();
        soltar_union();
        evento(lg::Evento::Cerrado { mensaje: "Enlace cerrado.".into() });
    });
    estado()
}
