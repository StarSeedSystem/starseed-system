// ═══════════════════════════════════════════════════════════════════════════
// ble_windows — la radio Bluetooth de Windows (WinRT) para el núcleo de `ble.rs` (WIN1109B · 2026-11-09).
// Contrato: architecture/bluetooth-directo.md §16. SOLO Windows (10 versión 1809 o posterior; Windows 11).
// ---------------------------------------------------------------------------
// Central y periférico a la vez, con el MISMO protocolo que macOS y Android (mismos UUID, misma trama de
// `ble_trama.rs`, mismos eventos y mismas notas del registro `enlaces.log`). Aquí solo se mueven bytes.
//
//   · Periférico: `GattServiceProvider` con el servicio StarSeed, ENTRADA (escritura, con y sin respuesta),
//     SALIDA (notificación) y PSM (lectura, valor fijo 0 = «sin canal rápido»: WinRT no tiene API pública de
//     L2CAP en LE, así que Windows NO ofrece ni abre `ble-l2cap` y el enlace se queda en GATT).
//     Se anuncia conectable con `GattServiceProviderAdvertisingParameters { IsConnectable, IsDiscoverable }`.
//     Ese anuncio lleva el UUID del SERVICIO, no el rotatorio de la neurona (el prefijo «SS·B1» de §3 del
//     contrato), así que además se publica el UUID rotatorio con `BluetoothLEAdvertisementPublisher`
//     (anuncio no conectable con la lista de UUID de 128 bits, igual que lo hacen macOS y Android). Quien oye
//     el rotatorio conecta a la dirección del aparato, que es la misma del servicio conectable.
//   · Central: `BluetoothLEAdvertisementWatcher` pasivo. Se queda con los anuncios cuya lista de UUID de 128 bits
//     lleva uno que empieza por «SS·B1» (el filtro de §3: el UUID es rotatorio, no se puede filtrar por el del
//     servicio). Conecta con `BluetoothLEDevice.FromBluetoothAddressAsync`, `GetGattServicesForUuidAsync`,
//     las características, se suscribe a SALIDA y escribe en ENTRADA sin respuesta. El paquete sale de
//     `GattSession.MaxPduSize − 3`; `SetMaintainConnection(true)` mantiene el enlace vivo.
//   · Todo lo bloqueante (`.join()` de WinRT) va en hilos propios, cada uno en el apartamento MTA; los manejadores
//     de eventos de WinRT solo llaman al núcleo (`al_*`) o lanzan un hilo. Ninguna llamada del núcleo espera.
//   · Radio apagada, sin adaptador, sin papel periférico o sin acceso (Privacidad de Windows) se dicen con su
//     `motivo` (`win_p2p_logica::ble::estado_radio`). Interruptor: `STARSEED_SIN_BLE_WINDOWS=1`.
//
// Lo puro (UUID, direcciones, ids de enlace, paquete, estados) está en `win_p2p_logica.rs` con sus pruebas. Esta
// parte se comprobó con `cargo check --target x86_64-pc-windows-msvc`; el comportamiento con radios reales lo
// confirma un PC con Windows (contrato §16.6).
// ═══════════════════════════════════════════════════════════════════════════

use crate::ble::{self as nucleo, Radio};
use crate::ble_l2cap as l2;
use crate::ble_trama as bt;
use crate::win_p2p_logica::ble as lg;
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};
use std::time::Duration;
use windows::core::{Interface, GUID};
use windows::Devices::Bluetooth::Advertisement::{
    BluetoothLEAdvertisement, BluetoothLEAdvertisementPublisher, BluetoothLEAdvertisementReceivedEventArgs, BluetoothLEAdvertisementWatcher, BluetoothLEScanningMode,
};
use windows::Devices::Bluetooth::GenericAttributeProfile::{
    GattCharacteristic, GattCharacteristicProperties, GattClientCharacteristicConfigurationDescriptorValue, GattCommunicationStatus, GattLocalCharacteristic,
    GattLocalCharacteristicParameters, GattProtectionLevel, GattServiceProvider, GattServiceProviderAdvertisingParameters, GattSession, GattSubscribedClient,
    GattValueChangedEventArgs, GattWriteOption, GattWriteRequestedEventArgs,
};
use windows::Devices::Bluetooth::{BluetoothAdapter, BluetoothConnectionStatus, BluetoothError, BluetoothLEDevice};
use windows::Devices::Radios::{Radio as RadioWin, RadioAccessStatus, RadioState};
use windows::Foundation::{IClosable, TypedEventHandler};
use windows::core::IInspectable;
use windows::Storage::Streams::{DataReader, DataWriter, IBuffer};
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};

/// Paquetes seguidos que se mandan antes de volver a mirar si hay más (cede el hilo).
const RAFAGA: usize = 32;
/// Reintentos de la suscripción a SALIDA antes de rendirse, y espera entre ellos.
const REINTENTOS_SUSCRIPCION: u8 = 3;
const ESPERA_SUSCRIPCION_MS: u64 = 1_000;
/// Fallos de escritura seguidos que cierran el enlace.
const FALLOS_ESCRITURA: u32 = 3;

pub struct RadioWindows;

// ───────────────────────────── Estado ─────────────────────────────

struct Central {
    dispositivo: BluetoothLEDevice,
    sesion: Option<GattSession>,
    entrada: GattCharacteristic,
    salida: GattCharacteristic,
    token_valor: i64,
    token_estado: i64,
    token_pdu: Option<i64>,
}

struct Servicio {
    proveedor: GattServiceProvider,
    salida: GattLocalCharacteristic,
}

#[derive(Default)]
struct Win {
    parado: bool,
    radio: Option<RadioWin>,
    token_radio: Option<i64>,
    watcher: Option<BluetoothLEAdvertisementWatcher>,
    servicio: Option<Servicio>,
    publicador: Option<BluetoothLEAdvertisementPublisher>,
    anuncio: Option<String>,
    centrales: HashMap<String, Central>,
    conectando: HashSet<String>,
    /// Clientes suscritos a nuestra SALIDA (somos periférico), por su dirección en 12 hex.
    suscritos: HashMap<String, GattSubscribedClient>,
    ultimo_fallo: String,
}

fn w() -> MutexGuard<'static, Win> {
    static W: OnceLock<Mutex<Win>> = OnceLock::new();
    W.get_or_init(|| Mutex::new(Win::default())).lock().unwrap_or_else(|e| e.into_inner())
}

fn con_w<T>(f: impl FnOnce(&mut Win) -> T) -> T {
    f(&mut w())
}

/// Serializa arrancar, reevaluar y parar: no se abren dos servicios a la vez.
static CICLO: Mutex<()> = Mutex::new(());

fn ciclo() -> MutexGuard<'static, ()> {
    CICLO.lock().unwrap_or_else(|e| e.into_inner())
}

/// Un hilo con su apartamento MTA de COM (WinRT lo necesita en los hilos que no crea el sistema).
fn hilo(nombre: &str, f: impl FnOnce() + Send + 'static) {
    let _ = std::thread::Builder::new().name(format!("starseed-ble-win-{nombre}")).spawn(move || {
        // SAFETY: se empareja con `CoUninitialize` al salir; si el hilo ya tenía otro modo, no se desinicializa.
        let iniciado = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }.is_ok();
        f();
        if iniciado {
            unsafe { CoUninitialize() };
        }
    });
}

fn guid(texto: &str) -> GUID {
    let (a, b, c, d) = lg::guid_de_texto(texto).expect("UUID de StarSeed válido");
    GUID::from_values(a, b, c, d)
}

fn bytes_de(b: &IBuffer) -> Vec<u8> {
    let n = b.Length().unwrap_or(0) as usize;
    if n == 0 {
        return Vec::new();
    }
    let mut v = vec![0u8; n];
    match DataReader::FromBuffer(b).and_then(|r| r.ReadBytes(&mut v)) {
        Ok(()) => v,
        Err(_) => Vec::new(),
    }
}

fn buffer_de(b: &[u8]) -> windows::core::Result<IBuffer> {
    let w = DataWriter::new()?;
    w.WriteBytes(b)?;
    w.DetachBuffer()
}

/// Un fallo de WinRT dicho en llano; si es de permisos o de radio apagada, avisa al núcleo (una vez).
fn texto_error(e: &windows::core::Error, que: &str) -> String {
    format!("{que}: {}", e.message().trim())
}

/// Avisa al núcleo de un fallo del servicio SIN repetir el mismo aviso (cada aviso vuelve a anunciar).
fn avisar_fallo(motivo: String) {
    let nuevo = con_w(|w| {
        let n = w.ultimo_fallo != motivo;
        w.ultimo_fallo = motivo.clone();
        n
    });
    if nuevo {
        nucleo::al_radio("encendida", &motivo);
    }
}

// ───────────────────────────── Sonda y ciclo de vida ─────────────────────────────

fn sondear() -> (lg::SondaBle, Option<RadioWin>) {
    let adaptador = BluetoothAdapter::GetDefaultAsync().ok().and_then(|o| o.join().ok());
    let Some(a) = adaptador else {
        return (lg::SondaBle { adaptador: false, le: false, rol_central: false, rol_periferico: false, radio: lg::EstadoRadioWin::Desconocida }, None);
    };
    let le = a.IsLowEnergySupported().unwrap_or(false);
    let rol_central = a.IsCentralRoleSupported().unwrap_or(false);
    let rol_periferico = a.IsPeripheralRoleSupported().unwrap_or(false);
    let radio = a.GetRadioAsync().ok().and_then(|o| o.join().ok());
    let acceso = RadioWin::RequestAccessAsync().ok().and_then(|o| o.join().ok());
    let estado = match acceso {
        Some(RadioAccessStatus::DeniedByUser) | Some(RadioAccessStatus::DeniedBySystem) => lg::EstadoRadioWin::SinAcceso,
        _ => match radio.as_ref().and_then(|r| r.State().ok()) {
            Some(RadioState::On) => lg::EstadoRadioWin::Encendida,
            Some(RadioState::Off) | Some(RadioState::Disabled) => lg::EstadoRadioWin::Apagada,
            _ => lg::EstadoRadioWin::Desconocida,
        },
    };
    (lg::SondaBle { adaptador: true, le, rol_central, rol_periferico, radio: estado }, radio)
}

/// Mira el Bluetooth, lo cuenta al núcleo y enciende o apaga las piezas. Dentro del `ciclo`.
fn reevaluar() {
    if con_w(|w| w.parado) {
        return;
    }
    let (sonda, radio) = sondear();
    suscribir_radio(radio);
    let (estado, motivo) = lg::estado_radio(&sonda);
    if estado == "encendida" {
        nucleo::al_radio(estado, &motivo);
        encender_piezas(&sonda);
    } else {
        // Primero el núcleo (cierra sus enlaces), luego se sueltan los objetos de WinRT.
        nucleo::al_radio(estado, &motivo);
        apagar_piezas();
    }
}

/// Se entera de que el Bluetooth se enciende o se apaga (un solo manejador por radio).
fn suscribir_radio(radio: Option<RadioWin>) {
    let Some(r) = radio else { return };
    let ya = con_w(|w| w.token_radio.is_some());
    if ya {
        return;
    }
    let h = TypedEventHandler::<RadioWin, IInspectable>::new(move |_, _| {
        hilo("radio", || {
            let _g = ciclo();
            reevaluar();
        });
        Ok(())
    });
    if let Ok(t) = r.StateChanged(&h) {
        con_w(|w| {
            w.token_radio = Some(t);
            w.radio = Some(r);
        });
    }
}

fn encender_piezas(sonda: &lg::SondaBle) {
    if sonda.rol_central {
        iniciar_vigilante();
    }
    if sonda.rol_periferico {
        if con_w(|w| w.servicio.is_none()) {
            match abrir_servicio() {
                Ok(s) => {
                    con_w(|w| w.servicio = Some(s));
                    con_w(|w| w.ultimo_fallo.clear());
                }
                Err(e) => avisar_fallo(format!("Bluetooth encendido, pero Windows no abrió el servicio StarSeed ({e}).")),
            }
        }
        publicar_anuncio();
    }
}

fn apagar_piezas() {
    let (watcher, servicio, publicador, centrales) = con_w(|w| {
        w.suscritos.clear();
        w.conectando.clear();
        let c: Vec<(String, Central)> = w.centrales.drain().collect();
        (w.watcher.take(), w.servicio.take(), w.publicador.take(), c)
    });
    if let Some(v) = watcher {
        let _ = v.Stop();
    }
    if let Some(p) = publicador {
        let _ = p.Stop();
    }
    if let Some(s) = servicio {
        let _ = s.proveedor.StopAdvertising();
    }
    for (_, c) in centrales {
        soltar_central(c);
    }
}

// ───────────────────────────── Central: ver y conectar ─────────────────────────────

fn iniciar_vigilante() {
    if con_w(|w| w.watcher.is_some()) {
        return;
    }
    let creado = (|| -> windows::core::Result<BluetoothLEAdvertisementWatcher> {
        let v = BluetoothLEAdvertisementWatcher::new()?;
        v.SetScanningMode(BluetoothLEScanningMode::Passive)?;
        v.Received(&TypedEventHandler::<BluetoothLEAdvertisementWatcher, BluetoothLEAdvertisementReceivedEventArgs>::new(|_, args| {
            if let Some(a) = args.as_ref() {
                al_ver(a);
            }
            Ok(())
        }))?;
        v.Start()?;
        Ok(v)
    })();
    match creado {
        Ok(v) => con_w(|w| w.watcher = Some(v)),
        Err(e) => avisar_fallo(texto_error(&e, "Bluetooth encendido, pero Windows no dejó escanear")),
    }
}

/// Un anuncio oído: si lleva un UUID «SS·B1» en su lista de 128 bits, es una neurona StarSeed.
fn al_ver(a: &BluetoothLEAdvertisementReceivedEventArgs) {
    let Ok(direccion) = a.BluetoothAddress() else { return };
    let Ok(lista) = a.Advertisement().and_then(|x| x.ServiceUuids()) else { return };
    let n = lista.Size().unwrap_or(0);
    for i in 0..n {
        let Ok(g) = lista.GetAt(i) else { continue };
        let b = lg::guid_a_bytes(g.data1, g.data2, g.data3, g.data4);
        if bt::es_anuncio(&b) {
            let rssi = a.RawSignalStrengthInDBm().unwrap_or(-127);
            nucleo::al_ver(&lg::direccion_texto(direccion), &b, rssi.clamp(-127, 20));
            return;
        }
    }
}

fn conectar_hilo(direccion: String) {
    let ok = con_w(|w| !w.parado && !w.centrales.contains_key(&direccion) && w.conectando.insert(direccion.clone()));
    if !ok {
        return;
    }
    let plataforma = lg::plataforma_central(&direccion);
    let r = conectar(&direccion, &plataforma);
    con_w(|w| w.conectando.remove(&direccion));
    if let Err(motivo) = r {
        // Un intento fallido es un enlace que se cae al instante: el núcleo espera 2 s, 5 s, 15 s antes de repetir.
        nucleo::al_desconectar(&plataforma, &motivo);
        nucleo::nota(Some(&plataforma), "sin-suscripcion", &motivo);
    }
}

/// Todo el camino del central, bloqueante. Devuelve el motivo si no llegó a abrir el enlace.
fn conectar(direccion: &str, plataforma: &str) -> Result<(), String> {
    let addr = lg::direccion_de_texto(direccion).ok_or("dirección Bluetooth no válida")?;
    let dispositivo = BluetoothLEDevice::FromBluetoothAddressAsync(addr)
        .and_then(|o| o.join())
        .map_err(|e| texto_error(&e, "Windows no abrió el aparato"))?;
    // Servicio StarSeed.
    let servicios = dispositivo
        .GetGattServicesForUuidAsync(guid(bt::SERVICIO))
        .and_then(|o| o.join())
        .map_err(|e| texto_error(&e, "no se pudo pedir el servicio StarSeed"))?;
    if servicios.Status().ok() != Some(GattCommunicationStatus::Success) {
        return Err("el aparato no contestó al pedir sus servicios".into());
    }
    let lista = servicios.Services().map_err(|e| texto_error(&e, "sin lista de servicios"))?;
    if lista.Size().unwrap_or(0) == 0 {
        return Err("el aparato no es una neurona StarSeed (sin su servicio)".into());
    }
    let servicio = lista.GetAt(0).map_err(|e| texto_error(&e, "sin servicio"))?;
    nucleo::nota(Some(plataforma), "servicios-descubiertos", "servicio StarSeed encontrado, pidiendo características");
    let pedir = |uuid: &str| -> Option<GattCharacteristic> {
        let r = servicio.GetCharacteristicsForUuidAsync(guid(uuid)).ok()?.join().ok()?;
        if r.Status().ok()? != GattCommunicationStatus::Success {
            return None;
        }
        r.Characteristics().ok()?.GetAt(0).ok()
    };
    let entrada = pedir(bt::ENTRADA).ok_or("al servicio le falta ENTRADA")?;
    let salida = pedir(bt::SALIDA).ok_or("al servicio le falta SALIDA")?;
    // (PSM de ble-l2cap: se ignora a propósito, Windows no abre canales L2CAP LE.)
    // Primero el manejador de notificaciones, luego la suscripción: no se pierde la primera.
    let plat = plataforma.to_string();
    let token_valor = salida
        .ValueChanged(&TypedEventHandler::<GattCharacteristic, GattValueChangedEventArgs>::new(move |_, args| {
            if let Some(a) = args.as_ref() {
                if let Ok(b) = a.CharacteristicValue() {
                    nucleo::al_recibir(&plat, &bytes_de(&b));
                }
            }
            Ok(())
        }))
        .map_err(|e| texto_error(&e, "no se pudo escuchar SALIDA"))?;
    let suscrito = suscribir_salida(&salida, plataforma);
    if !suscrito {
        let _ = salida.RemoveValueChanged(token_valor);
        return Err("SALIDA no quedó notificando; se cierra el enlace".into());
    }
    // MTU y mantener el enlace.
    let sesion = dispositivo
        .BluetoothDeviceId()
        .and_then(|id| GattSession::FromDeviceIdAsync(&id))
        .and_then(|o| o.join())
        .ok();
    let mut token_pdu = None;
    let mut pdu = 0u16;
    if let Some(s) = &sesion {
        let _ = s.SetMaintainConnection(true);
        pdu = s.MaxPduSize().unwrap_or(0);
        let plat = plataforma.to_string();
        token_pdu = s
            .MaxPduSizeChanged(&TypedEventHandler::<GattSession, IInspectable>::new(move |s, _| {
                if let Some(s) = s.as_ref() {
                    nucleo::al_mtu(&plat, lg::paquete_de_pdu(s.MaxPduSize().unwrap_or(0)));
                }
                Ok(())
            }))
            .ok();
    }
    // Si Windows suelta el enlace, se cierra aquí también.
    let dir = direccion.to_string();
    let token_estado = dispositivo
        .ConnectionStatusChanged(&TypedEventHandler::<BluetoothLEDevice, IInspectable>::new(move |d, _| {
            if let Some(d) = d.as_ref() {
                if d.ConnectionStatus().ok() == Some(BluetoothConnectionStatus::Disconnected) {
                    let dir = dir.clone();
                    hilo("caida", move || cerrar_central(&dir, "Windows perdió la conexión Bluetooth"));
                }
            }
            Ok(())
        }))
        .map_err(|e| texto_error(&e, "no se pudo vigilar la conexión"))?;
    let central = Central { dispositivo, sesion, entrada, salida, token_valor, token_estado, token_pdu };
    let parado = con_w(|w| {
        if w.parado {
            return true;
        }
        w.centrales.insert(direccion.to_string(), central);
        false
    });
    if parado {
        cerrar_central(direccion, "Bluetooth directo apagado");
        return Ok(());
    }
    nucleo::nota(Some(plataforma), "suscrito", &format!("notificaciones de SALIDA activas, paquete {}", lg::paquete_de_pdu(pdu)));
    nucleo::al_conectar(plataforma, "central", Some(direccion), lg::paquete_de_pdu(pdu));
    bombear(plataforma);
    Ok(())
}

/// Se suscribe a SALIDA (CCCD = notificar), con hasta `REINTENTOS_SUSCRIPCION` reintentos a 1 s.
fn suscribir_salida(salida: &GattCharacteristic, plataforma: &str) -> bool {
    for intento in 0..=REINTENTOS_SUSCRIPCION {
        let r = salida
            .WriteClientCharacteristicConfigurationDescriptorAsync(GattClientCharacteristicConfigurationDescriptorValue::Notify)
            .and_then(|o| o.join());
        match r {
            Ok(GattCommunicationStatus::Success) => return true,
            Ok(otro) => nucleo::nota(Some(plataforma), "sin-suscripcion", &format!("Windows contestó {:?} al suscribirse; reintento {} de {REINTENTOS_SUSCRIPCION}", otro, intento + 1)),
            Err(e) => nucleo::nota(Some(plataforma), "sin-suscripcion", &format!("{}; reintento {} de {REINTENTOS_SUSCRIPCION}", e.message().trim(), intento + 1)),
        }
        if intento < REINTENTOS_SUSCRIPCION {
            std::thread::sleep(Duration::from_millis(ESPERA_SUSCRIPCION_MS));
            nucleo::nota(Some(plataforma), "suscripcion-reintento", "pidiendo de nuevo las notificaciones de SALIDA");
        }
    }
    false
}

fn soltar_central(c: Central) {
    let _ = c.salida.RemoveValueChanged(c.token_valor);
    let _ = c.dispositivo.RemoveConnectionStatusChanged(c.token_estado);
    if let (Some(s), Some(t)) = (&c.sesion, c.token_pdu) {
        let _ = s.RemoveMaxPduSizeChanged(t);
        let _ = s.SetMaintainConnection(false);
        if let Ok(x) = s.cast::<IClosable>() {
            let _ = x.Close();
        }
    }
    if let Ok(x) = c.dispositivo.cast::<IClosable>() {
        let _ = x.Close();
    }
}

/// Cierra el enlace donde somos central y se lo cuenta al núcleo (idempotente).
fn cerrar_central(direccion: &str, motivo: &str) {
    let c = con_w(|w| w.centrales.remove(direccion));
    if let Some(c) = c {
        soltar_central(c);
    }
    nucleo::al_desconectar(&lg::plataforma_central(direccion), motivo);
}

// ───────────────────────────── Periférico: servicio y anuncio ─────────────────────────────

fn abrir_servicio() -> Result<Servicio, String> {
    let r = GattServiceProvider::CreateAsync(guid(bt::SERVICIO)).and_then(|o| o.join()).map_err(|e| e.message().trim().to_string())?;
    if r.Error().ok() != Some(BluetoothError::Success) {
        return Err(format!("{:?}", r.Error().ok()));
    }
    let proveedor = r.ServiceProvider().map_err(|e| e.message().trim().to_string())?;
    let anadir = |uuid: &str, props: GattCharacteristicProperties, estatico: Option<&[u8]>| -> Result<GattLocalCharacteristic, String> {
        let p = GattLocalCharacteristicParameters::new().map_err(|e| e.message().trim().to_string())?;
        p.SetCharacteristicProperties(props).map_err(|e| e.message().trim().to_string())?;
        p.SetWriteProtectionLevel(GattProtectionLevel::Plain).ok();
        p.SetReadProtectionLevel(GattProtectionLevel::Plain).ok();
        if let Some(v) = estatico {
            p.SetStaticValue(&buffer_de(v).map_err(|e| e.message().trim().to_string())?).map_err(|e| e.message().trim().to_string())?;
        }
        let c = proveedor.Service().and_then(|s| s.CreateCharacteristicAsync(guid(uuid), &p)).and_then(|o| o.join()).map_err(|e| e.message().trim().to_string())?;
        if c.Error().ok() != Some(BluetoothError::Success) {
            return Err(format!("{:?}", c.Error().ok()));
        }
        c.Characteristic().map_err(|e| e.message().trim().to_string())
    };
    let entrada = anadir(bt::ENTRADA, GattCharacteristicProperties::Write | GattCharacteristicProperties::WriteWithoutResponse, None)?;
    let salida = anadir(bt::SALIDA, GattCharacteristicProperties::Notify, None)?;
    // PSM: 0 = «sin canal rápido» (Windows no tiene L2CAP LE público). Las apps con BLE1109A lo leen y se quedan en GATT.
    anadir(l2::PSM, GattCharacteristicProperties::Read, Some(&l2::bytes_psm(None)))?;
    entrada
        .WriteRequested(&TypedEventHandler::<GattLocalCharacteristic, GattWriteRequestedEventArgs>::new(|_, args| {
            if let Some(a) = args.as_ref() {
                al_escribir(a);
            }
            Ok(())
        }))
        .map_err(|e| e.message().trim().to_string())?;
    salida
        .SubscribedClientsChanged(&TypedEventHandler::<GattLocalCharacteristic, IInspectable>::new(|_, _| {
            hilo("suscritos", refrescar_suscritos);
            Ok(())
        }))
        .map_err(|e| e.message().trim().to_string())?;
    let anuncio = GattServiceProviderAdvertisingParameters::new().map_err(|e| e.message().trim().to_string())?;
    anuncio.SetIsConnectable(true).map_err(|e| e.message().trim().to_string())?;
    anuncio.SetIsDiscoverable(true).map_err(|e| e.message().trim().to_string())?;
    proveedor.StartAdvertisingWithParameters(&anuncio).map_err(|e| e.message().trim().to_string())?;
    Ok(Servicio { proveedor, salida })
}

/// Publica (o rota) el UUID «SS·B1» de la neurona como anuncio de lista de UUID de 128 bits.
fn publicar_anuncio() {
    let Some(uuid) = con_w(|w| w.anuncio.clone()) else { return };
    let Some(bytes) = bt::uuid_bytes(&uuid) else { return };
    let (a, b, c, d) = lg::bytes_a_guid(&bytes);
    let viejo = con_w(|w| w.publicador.take());
    if let Some(v) = viejo {
        let _ = v.Stop();
    }
    let nuevo = (|| -> windows::core::Result<BluetoothLEAdvertisementPublisher> {
        let adv = BluetoothLEAdvertisement::new()?;
        adv.ServiceUuids()?.Append(GUID::from_values(a, b, c, d))?;
        let p = BluetoothLEAdvertisementPublisher::Create(&adv)?;
        p.Start()?;
        Ok(p)
    })();
    match nuevo {
        Ok(p) => con_w(|w| w.publicador = Some(p)),
        Err(e) => avisar_fallo(texto_error(&e, "Windows no pudo anunciar a esta neurona (otras neuronas la verán solo si ya conocen su dirección)")),
    }
}

/// Un cliente escribió en ENTRADA: se entrega si es de quien se suscribió a SALIDA.
fn al_escribir(a: &GattWriteRequestedEventArgs) {
    let Ok(deferral) = a.GetDeferral() else { return };
    let r = (|| -> windows::core::Result<()> {
        let peticion = a.GetRequestAsync()?.join()?;
        let bytes = bytes_de(&peticion.Value()?);
        let id = a.Session()?.DeviceId()?.Id()?.to_string();
        if let Some(mac) = lg::mac_de_id_dispositivo(&id) {
            // Puede que la escritura llegue antes que el aviso de la suscripción: se mira la lista de Windows.
            if !con_w(|w| w.suscritos.contains_key(&mac)) {
                refrescar_suscritos();
            }
            if con_w(|w| w.suscritos.contains_key(&mac)) {
                nucleo::al_recibir(&lg::plataforma_periferico(&mac), &bytes);
            }
        }
        if peticion.Option()? == GattWriteOption::WriteWithResponse {
            peticion.Respond()?;
        }
        Ok(())
    })();
    let _ = r;
    let _ = deferral.Complete();
}

/// Compara los clientes suscritos de Windows con los que el núcleo conoce: altas y bajas.
fn refrescar_suscritos() {
    let Some(salida) = con_w(|w| w.servicio.as_ref().map(|s| s.salida.clone())) else { return };
    let Ok(lista) = salida.SubscribedClients() else { return };
    let mut ahora: HashMap<String, GattSubscribedClient> = HashMap::new();
    for i in 0..lista.Size().unwrap_or(0) {
        let Ok(c) = lista.GetAt(i) else { continue };
        let Some(mac) = c.Session().and_then(|s| s.DeviceId()).and_then(|d| d.Id()).ok().and_then(|id| lg::mac_de_id_dispositivo(&id.to_string())) else { continue };
        ahora.insert(mac, c);
    }
    let (nuevos, bajas) = con_w(|w| {
        let nuevos: Vec<(String, GattSubscribedClient)> = ahora.iter().filter(|(k, _)| !w.suscritos.contains_key(*k)).map(|(k, v)| (k.clone(), v.clone())).collect();
        let bajas: Vec<String> = w.suscritos.keys().filter(|k| !ahora.contains_key(*k)).cloned().collect();
        for (k, v) in &nuevos {
            w.suscritos.insert(k.clone(), v.clone());
        }
        for k in &bajas {
            w.suscritos.remove(k);
        }
        (nuevos, bajas)
    });
    for (mac, c) in nuevos {
        let plat = lg::plataforma_periferico(&mac);
        let paquete = lg::paquete_de_notificacion(c.MaxNotificationSize().unwrap_or(0));
        let p2 = plat.clone();
        let _ = c.MaxNotificationSizeChanged(&TypedEventHandler::<GattSubscribedClient, IInspectable>::new(move |c, _| {
            if let Some(c) = c.as_ref() {
                nucleo::al_mtu(&p2, lg::paquete_de_notificacion(c.MaxNotificationSize().unwrap_or(0)));
            }
            Ok(())
        }));
        nucleo::al_conectar(&plat, "periferico", None, paquete);
        bombear(&plat);
    }
    for mac in bajas {
        nucleo::al_desconectar(&lg::plataforma_periferico(&mac), "el otro aparato se desuscribió");
    }
}

// ───────────────────────────── Salida de paquetes ─────────────────────────────

struct Bomba {
    bombeando: AtomicBool,
    pendiente: AtomicBool,
}

fn bombas() -> &'static Mutex<HashMap<String, Arc<Bomba>>> {
    static B: OnceLock<Mutex<HashMap<String, Arc<Bomba>>>> = OnceLock::new();
    B.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Pide que se vacíen los paquetes de ese enlace. Un solo hilo por enlace; si llegan más mientras tanto, repite.
fn bombear(plataforma: &str) {
    let b = {
        let mut m = bombas().lock().unwrap_or_else(|e| e.into_inner());
        if m.len() > 64 {
            m.retain(|_, v| v.bombeando.load(Ordering::SeqCst) || v.pendiente.load(Ordering::SeqCst));
        }
        m.entry(plataforma.to_string()).or_insert_with(|| Arc::new(Bomba { bombeando: AtomicBool::new(false), pendiente: AtomicBool::new(false) })).clone()
    };
    b.pendiente.store(true, Ordering::SeqCst);
    if b.bombeando.swap(true, Ordering::SeqCst) {
        return;
    }
    let plat = plataforma.to_string();
    hilo("envio", move || {
        loop {
            while b.pendiente.swap(false, Ordering::SeqCst) {
                vaciar(&plat);
            }
            b.bombeando.store(false, Ordering::SeqCst);
            // Una orden que entró entre el último vaciado y soltar la bandera no se pierde.
            if !b.pendiente.load(Ordering::SeqCst) || b.bombeando.swap(true, Ordering::SeqCst) {
                break;
            }
        }
    });
}

fn vaciar(plataforma: &str) {
    let Some((lado, id)) = lg::partir_plataforma(plataforma) else { return };
    let mut fallos = 0u32;
    loop {
        for _ in 0..RAFAGA {
            let Some(paquete) = nucleo::siguiente_paquete(plataforma) else { return };
            let ok = if lado == "central" { escribir_central(id, &paquete) } else { notificar(id, &paquete) };
            if ok {
                fallos = 0;
            } else {
                fallos += 1;
                if fallos >= FALLOS_ESCRITURA {
                    if lado == "central" {
                        cerrar_central(id, "falló la escritura en ENTRADA");
                    } else {
                        con_w(|w| w.suscritos.remove(id));
                        nucleo::al_desconectar(plataforma, "falló la notificación por SALIDA");
                    }
                    return;
                }
            }
        }
        // Cede el hilo un instante y sigue mientras haya paquetes.
        std::thread::sleep(Duration::from_millis(1));
    }
}

fn escribir_central(direccion: &str, paquete: &[u8]) -> bool {
    let Some(entrada) = con_w(|w| w.centrales.get(direccion).map(|c| c.entrada.clone())) else { return false };
    let Ok(b) = buffer_de(paquete) else { return false };
    matches!(
        entrada.WriteValueWithResultAndOptionAsync(&b, GattWriteOption::WriteWithoutResponse).and_then(|o| o.join()).and_then(|r| r.Status()),
        Ok(GattCommunicationStatus::Success)
    )
}

fn notificar(mac: &str, paquete: &[u8]) -> bool {
    let Some((salida, cliente)) = con_w(|w| Some((w.servicio.as_ref()?.salida.clone(), w.suscritos.get(mac)?.clone()))) else { return false };
    let Ok(b) = buffer_de(paquete) else { return false };
    matches!(
        salida.NotifyValueForSubscribedClientAsync(&b, &cliente).and_then(|o| o.join()).and_then(|r| r.Status()),
        Ok(GattCommunicationStatus::Success)
    )
}

// ───────────────────────────── La radio para el núcleo ─────────────────────────────

impl Radio for RadioWindows {
    fn disponible(&self) -> bool {
        true
    }

    fn arrancar(&self) {
        hilo("arranque", || {
            let _g = ciclo();
            con_w(|w| w.parado = false);
            // Interruptor de emergencia: no se toca el Bluetooth de Windows.
            if lg::apagado(std::env::var(lg::ENTORNO_SIN_BLE).ok().as_deref()) {
                nucleo::al_radio("no-disponible", &format!("Bluetooth directo apagado en esta instalación ({}).", lg::ENTORNO_SIN_BLE));
                return;
            }
            reevaluar();
        });
    }

    fn anunciar(&self, uuid: &str) {
        let u = uuid.to_string();
        hilo("anuncio", move || {
            let _g = ciclo();
            let listo = con_w(|w| {
                w.anuncio = Some(u);
                !w.parado && w.servicio.is_some()
            });
            if listo {
                publicar_anuncio();
            }
        });
    }

    fn conectar(&self, direccion: &str) {
        let d = direccion.to_string();
        hilo("conectar", move || conectar_hilo(d));
    }

    fn desconectar(&self, plataforma: &str) {
        let p = plataforma.to_string();
        hilo("cerrar", move || match lg::partir_plataforma(&p) {
            Some(("central", dir)) => cerrar_central(dir, "cerrado por esta neurona"),
            // WinRT no deja echar a un cliente: se le deja de atender.
            Some((_, mac)) => {
                con_w(|w| w.suscritos.remove(mac));
            }
            None => {}
        });
    }

    fn hay_datos(&self, plataforma: &str) {
        bombear(plataforma);
    }

    fn pedir_permiso(&self) {
        // Windows no pregunta por app: la persona lo da en Configuración › Privacidad.
        let _ = std::process::Command::new("explorer.exe").arg("ms-settings:privacy-radios").spawn();
    }

    fn parar(&self) {
        hilo("parada", || {
            let _g = ciclo();
            let (macs, dirs, radio, token) = con_w(|w| {
                w.parado = true;
                w.anuncio = None;
                (w.suscritos.keys().cloned().collect::<Vec<_>>(), w.centrales.keys().cloned().collect::<Vec<_>>(), w.radio.take(), w.token_radio.take())
            });
            apagar_piezas();
            if let (Some(r), Some(t)) = (radio, token) {
                let _ = r.RemoveStateChanged(t);
            }
            for mac in macs {
                nucleo::al_desconectar(&lg::plataforma_periferico(&mac), "Bluetooth directo apagado");
            }
            for d in dirs {
                nucleo::al_desconectar(&lg::plataforma_central(&d), "Bluetooth directo apagado");
            }
        });
    }
}
