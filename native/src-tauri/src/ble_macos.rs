// ═══════════════════════════════════════════════════════════════════════════
// ble_macos — la radio Bluetooth de macOS (CoreBluetooth) para el núcleo de `ble.rs` (BLE1108A).
// ---------------------------------------------------------------------------
// Contrato: architecture/bluetooth-directo.md §6.
//
// Central y periférico a la vez, en UNA cola de despacho propia («app.starseed.ble»): todo lo de
// CoreBluetooth (gestores, delegado, periféricos y centrales) se crea y se toca SOLO en esa cola;
// las llamadas del núcleo (`Radio`) se encolan con `exec_async` y vuelven por los `al_*` de ble.rs.
//
//   · Periférico (CBPeripheralManager): servicio StarSeed con ENTRADA (escritura, con y sin
//     respuesta) y SALIDA (notificación). Anuncia SOLO el UUID rotatorio (macOS no deja anunciar
//     datos de servicio ni del fabricante). Notifica con `updateValue…` y, si la cola del sistema se
//     llena, espera a `peripheralManagerIsReadyToUpdateSubscribers:`.
//   · Central (CBCentralManager): escanea sin filtro (con duplicados, para el RSSI) y se queda con los
//     anuncios que empiezan por «SS·B1»; conecta, descubre, se suscribe a SALIDA y escribe en ENTRADA
//     sin respuesta mientras `canSendWriteWithoutResponse` lo deje (luego espera a
//     `peripheralIsReadyToSendWriteWithoutResponse:`). El paquete es `maximumWriteValueLengthForType:`.
//
// (BLE1109A) Carril rápido: canal L2CAP. Como central, lee la característica PSM del periférico y abre el canal
// (`openL2CAPChannel`); como periférico, publica un canal (`publishL2CAPChannelWithEncryption: NO`, el cifrado va por
// encima) y sirve su PSM en la lectura de esa característica. Los dos flujos (`NSInputStream`/`NSOutputStream`) se
// atienden en UN hilo propio por canal con su NSRunLoop, mirando `hasBytesAvailable` / `hasSpaceAvailable` cada 5 ms
// y escribiendo lo que el flujo acepte (escrituras parciales: `ble_l2cap::Salida`). Todo el marco y la decisión
// de carril viven en `ble.rs` / `ble_l2cap.rs`; aquí solo se mueven bytes.
//
// Requiere `NSBluetoothAlwaysUsageDescription` en Info.plist (sin ella macOS cierra la app).
// No se compila en Linux: se comprobó con `cargo check --target aarch64-apple-darwin` en una caja
// aparte con las mismas versiones (objc2 0.6, objc2-foundation 0.3.2, objc2-core-bluetooth =0.3.2,
// dispatch2 0.3); ver el contrato §8.
// ═══════════════════════════════════════════════════════════════════════════

#![allow(non_snake_case)]

use crate::ble::{self as nucleo, Radio};
use crate::ble_l2cap as l2;
use crate::ble_trama as bt;
use dispatch2::{DispatchQueue, DispatchRetained};
use objc2::rc::Retained;
use objc2::runtime::{AnyObject, ProtocolObject};
use objc2::{define_class, msg_send, AnyThread, DefinedClass, Message};
use objc2_core_bluetooth::{
    CBATTError, CBATTRequest, CBAdvertisementDataServiceUUIDsKey, CBAttributePermissions, CBCentral, CBCentralManager, CBL2CAPChannel,
    CBCentralManagerDelegate, CBCentralManagerScanOptionAllowDuplicatesKey, CBCharacteristic, CBCharacteristicProperties,
    CBCharacteristicWriteType, CBManagerState, CBMutableCharacteristic, CBMutableService, CBPeripheral, CBPeripheralDelegate,
    CBPeripheralManager, CBPeripheralManagerDelegate, CBService, CBUUID,
};
use objc2_foundation::{NSArray, NSData, NSDate, NSDefaultRunLoopMode, NSDictionary, NSError, NSNumber, NSObject, NSObjectProtocol, NSRunLoop, NSStreamStatus, NSString};
use std::collections::HashMap;
use std::ptr::NonNull;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

/// Paquetes seguidos que se mandan antes de ceder la cola a otros eventos.
const RAFAGA: usize = 64;
/// (BLE1108C) Si el sistema no avisa de «listo para escribir / actualizar» en este tiempo, se manda igual y se
/// anota `listo-tarde`: una señal que no llega nunca vuelve a bloquear un enlace (el acuse repara lo perdido).
const ESPERA_LISTO_MS: u64 = 400;
/// (BLE1108C) Reintentos de la suscripción a SALIDA antes de rendirse, y espera entre ellos.
const REINTENTOS_SUSCRIPCION: u8 = 3;
const ESPERA_SUSCRIPCION_MS: u64 = 1_000;

pub struct RadioMac;

fn cola() -> &'static DispatchQueue {
    static C: OnceLock<DispatchRetained<DispatchQueue>> = OnceLock::new();
    C.get_or_init(|| DispatchQueue::new("app.starseed.ble", None))
}

fn ahora_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

// ───────────────────────────── Estado (solo en la cola) ─────────────────────────────

struct PerifericoMac {
    p: Retained<CBPeripheral>,
    entrada: Option<Retained<CBCharacteristic>>,
    listo: bool,
    /// (BLE1108C) SALIDA (para reintentar la suscripción), desde cuándo espera «listo para escribir», avisos
    /// de `listo-tarde` dados y reintentos de suscripción gastados.
    salida: Option<Retained<CBCharacteristic>>,
    bloqueado_desde: Option<u64>,
    tardes: u32,
    reintentos_suscripcion: u8,
    /// (BLE1109A) Característica PSM del periférico (opcional: las apps anteriores no la tienen).
    psm: Option<Retained<CBCharacteristic>>,
    /// (BLE1109B) Cuándo se pidió la conexión: `connectPeripheral` no caduca nunca, así que se vigila aquí.
    desde_ms: u64,
}

struct Mac {
    delegado: Retained<Delegado>,
    central: Retained<CBCentralManager>,
    servidor: Retained<CBPeripheralManager>,
    salida: Option<Retained<CBMutableCharacteristic>>,
    servicio_listo: bool,
    anuncio: Option<String>,
    parado: bool,
    vistos: HashMap<String, (Retained<CBPeripheral>, u64)>,
    perifericos: HashMap<String, PerifericoMac>,
    centrales: HashMap<String, Retained<CBCentral>>,
    servidor_ocupado: bool,
    /// (BLE1108C) Desde cuándo está ocupada la cola de notificaciones, y avisos de `listo-tarde` dados.
    servidor_ocupado_desde: u64,
    servidor_tardes: u32,
    pendiente: Option<(String, Vec<u8>)>,
    turno: usize,
    /// (BLE1109A) PSM del canal L2CAP que este aparato publicó como periférico.
    psm_publicado: Option<u16>,
    /// (BLE1109B) Conexiones seguidas que no llegaron a «listo» por dirección (3 → se olvida el `CBPeripheral` y se
    /// redescubre por su anuncio: Android rota su dirección y el objeto guardado deja de conectar).
    fallos_conexion: HashMap<String, u32>,
}

/// Los objetos de CoreBluetooth no son `Send`: solo se tocan en la cola `app.starseed.ble` (por
/// convención de este módulo: todo entra por `exec_async` o por el delegado, que corre en ella).
struct Celda(Option<Mac>);
unsafe impl Send for Celda {}

static MAC: Mutex<Celda> = Mutex::new(Celda(None));

fn con_mac<T>(f: impl FnOnce(&mut Mac) -> T) -> Option<T> {
    let mut g = match MAC.lock() {
        Ok(g) => g,
        Err(envenenado) => envenenado.into_inner(),
    };
    g.0.as_mut().map(f)
}

fn cbuuid(s: &str) -> Retained<CBUUID> {
    unsafe { CBUUID::UUIDWithString(&NSString::from_str(s)) }
}

fn es_uuid(u: Retained<CBUUID>, s: &str) -> bool {
    unsafe { u.UUIDString() }.to_string().eq_ignore_ascii_case(s)
}

fn id_de(peer_uuid: Retained<objc2_foundation::NSUUID>) -> String {
    peer_uuid.UUIDString().to_string().to_ascii_lowercase()
}

// ───────────────────────────── Delegado ─────────────────────────────

define_class!(
    #[unsafe(super(NSObject))]
    #[name = "StarSeedDelegadoBle"]
    struct Delegado;

    unsafe impl NSObjectProtocol for Delegado {}

    unsafe impl CBCentralManagerDelegate for Delegado {
        #[unsafe(method(centralManagerDidUpdateState:))]
        fn centralManagerDidUpdateState(&self, _central: &CBCentralManager) {
            al_cambiar_estado();
        }

        #[unsafe(method(centralManager:didDiscoverPeripheral:advertisementData:RSSI:))]
        fn centralManager_didDiscoverPeripheral_advertisementData_RSSI(
            &self,
            _central: &CBCentralManager,
            peripheral: &CBPeripheral,
            advertisement_data: &NSDictionary<NSString, AnyObject>,
            rssi: &NSNumber,
        ) {
            al_ver(peripheral, advertisement_data, rssi);
        }

        #[unsafe(method(centralManager:didConnectPeripheral:))]
        fn centralManager_didConnectPeripheral(&self, _central: &CBCentralManager, peripheral: &CBPeripheral) {
            unsafe { peripheral.setDelegate(Some(ProtocolObject::from_ref(self))) };
            let servicios = NSArray::from_retained_slice(&[cbuuid(bt::SERVICIO)]);
            unsafe { peripheral.discoverServices(Some(&servicios)) };
        }

        #[unsafe(method(centralManager:didFailToConnectPeripheral:error:))]
        fn centralManager_didFailToConnectPeripheral_error(&self, _central: &CBCentralManager, peripheral: &CBPeripheral, error: Option<&NSError>) {
            cerrar_central(peripheral, &motivo("no se pudo conectar", error));
        }

        #[unsafe(method(centralManager:didDisconnectPeripheral:error:))]
        fn centralManager_didDisconnectPeripheral_error(&self, _central: &CBCentralManager, peripheral: &CBPeripheral, error: Option<&NSError>) {
            cerrar_central(peripheral, &motivo("el otro aparato se desconectó", error));
        }
    }

    unsafe impl CBPeripheralDelegate for Delegado {
        #[unsafe(method(peripheral:didDiscoverServices:))]
        fn peripheral_didDiscoverServices(&self, peripheral: &CBPeripheral, error: Option<&NSError>) {
            al_descubrir_servicios(peripheral, error);
        }

        #[unsafe(method(peripheral:didDiscoverCharacteristicsForService:error:))]
        fn peripheral_didDiscoverCharacteristicsForService_error(&self, peripheral: &CBPeripheral, service: &CBService, error: Option<&NSError>) {
            al_descubrir_caracteristicas(peripheral, service, error);
        }

        #[unsafe(method(peripheral:didUpdateNotificationStateForCharacteristic:error:))]
        fn peripheral_didUpdateNotificationStateForCharacteristic_error(
            &self,
            peripheral: &CBPeripheral,
            characteristic: &CBCharacteristic,
            error: Option<&NSError>,
        ) {
            al_suscribirse(peripheral, characteristic, error);
        }

        #[unsafe(method(peripheral:didUpdateValueForCharacteristic:error:))]
        fn peripheral_didUpdateValueForCharacteristic_error(&self, peripheral: &CBPeripheral, characteristic: &CBCharacteristic, error: Option<&NSError>) {
            // (BLE1109A) El PSM del canal rápido: 2 bytes; inválido o 0 = el otro no lo ofrece (se sigue por GATT).
            if error.is_none() && es_uuid(unsafe { characteristic.UUID() }, l2::PSM) {
                if let Some(psm) = unsafe { characteristic.value() }.and_then(|v| l2::leer_psm(&v.to_vec())) {
                    nucleo::al_psm(&format!("c:{}", id_de(unsafe { peripheral.identifier() })), psm);
                }
                return;
            }
            if error.is_some() || !es_uuid(unsafe { characteristic.UUID() }, bt::SALIDA) {
                return;
            }
            if let Some(v) = unsafe { characteristic.value() } {
                let id = id_de(unsafe { peripheral.identifier() });
                nucleo::al_recibir(&format!("c:{id}"), &v.to_vec());
            }
        }

        #[unsafe(method(peripheralIsReadyToSendWriteWithoutResponse:))]
        fn peripheralIsReadyToSendWriteWithoutResponse(&self, peripheral: &CBPeripheral) {
            bombear_central(&id_de(unsafe { peripheral.identifier() }));
        }

        // (BLE1109A) El canal L2CAP que pedimos como central ya abrió (o falló).
        #[unsafe(method(peripheral:didOpenL2CAPChannel:error:))]
        fn peripheral_didOpenL2CAPChannel_error(&self, peripheral: &CBPeripheral, channel: Option<&CBL2CAPChannel>, error: Option<&NSError>) {
            let plataforma = format!("c:{}", id_de(unsafe { peripheral.identifier() }));
            match (channel, error) {
                (Some(c), None) => lanzar_canal(plataforma, c.retain()),
                _ => nucleo::al_l2cap_cerrado(&plataforma, &motivo("macOS no pudo abrir el canal L2CAP", error)),
            }
        }
    }

    unsafe impl CBPeripheralManagerDelegate for Delegado {
        #[unsafe(method(peripheralManagerDidUpdateState:))]
        fn peripheralManagerDidUpdateState(&self, _peripheral: &CBPeripheralManager) {
            al_cambiar_estado();
        }

        #[unsafe(method(peripheralManager:didAddService:error:))]
        fn peripheralManager_didAddService_error(&self, _peripheral: &CBPeripheralManager, _service: &CBService, error: Option<&NSError>) {
            if let Some(e) = error {
                nucleo::al_radio("encendida", &format!("Bluetooth encendido, pero macOS no abrió el servicio StarSeed: {}", e.localizedDescription()));
                return;
            }
            con_mac(|m| {
                m.servicio_listo = true;
                anunciar(m);
                // (BLE1109A) Canal L2CAP sin cifrar por el aire (el cifrado va por encima, CIF1108A).
                // (BLE1109B) Solo con el ajuste «Canal rápido Bluetooth (experimental)» encendido.
                if nucleo::canal_rapido_activo() && m.psm_publicado.is_none() {
                    unsafe { m.servidor.publishL2CAPChannelWithEncryption(false) };
                }
            });
        }

        #[unsafe(method(peripheralManager:central:didSubscribeToCharacteristic:))]
        fn peripheralManager_central_didSubscribeToCharacteristic(&self, _peripheral: &CBPeripheralManager, central: &CBCentral, characteristic: &CBCharacteristic) {
            if !es_uuid(unsafe { characteristic.UUID() }, bt::SALIDA) {
                return;
            }
            let id = id_de(unsafe { central.identifier() });
            let paquete = unsafe { central.maximumUpdateValueLength() };
            con_mac(|m| m.centrales.insert(id.clone(), central.retain()));
            nucleo::al_conectar(&format!("p:{id}"), "periferico", None, paquete.clamp(bt::PAQUETE_MIN, bt::PAQUETE_MAX));
            bombear_servidor();
        }

        #[unsafe(method(peripheralManager:central:didUnsubscribeFromCharacteristic:))]
        fn peripheralManager_central_didUnsubscribeFromCharacteristic(&self, _peripheral: &CBPeripheralManager, central: &CBCentral, _characteristic: &CBCharacteristic) {
            let id = id_de(unsafe { central.identifier() });
            con_mac(|m| m.centrales.remove(&id));
            parar_canal(&format!("p:{id}"));
            nucleo::al_desconectar(&format!("p:{id}"), "el otro aparato se desuscribió");
        }

        #[unsafe(method(peripheralManager:didReceiveWriteRequests:))]
        fn peripheralManager_didReceiveWriteRequests(&self, peripheral: &CBPeripheralManager, requests: &NSArray<CBATTRequest>) {
            al_escrituras(peripheral, requests);
        }

        #[unsafe(method(peripheralManagerIsReadyToUpdateSubscribers:))]
        fn peripheralManagerIsReadyToUpdateSubscribers(&self, _peripheral: &CBPeripheralManager) {
            con_mac(|m| m.servidor_ocupado = false);
            bombear_servidor();
        }

        // (BLE1109A) Lectura de la característica PSM (la única legible del servicio).
        #[unsafe(method(peripheralManager:didReceiveReadRequest:))]
        fn peripheralManager_didReceiveReadRequest(&self, peripheral: &CBPeripheralManager, request: &CBATTRequest) {
            if !es_uuid(unsafe { request.characteristic().UUID() }, l2::PSM) {
                unsafe { peripheral.respondToRequest_withResult(request, CBATTError::ReadNotPermitted) };
                return;
            }
            let b = l2::bytes_psm(con_mac(|m| m.psm_publicado).flatten());
            let desde = unsafe { request.offset() } as usize;
            if desde > b.len() {
                unsafe { peripheral.respondToRequest_withResult(request, CBATTError::InvalidOffset) };
                return;
            }
            unsafe {
                request.setValue(Some(&NSData::with_bytes(&b[desde..])));
                peripheral.respondToRequest_withResult(request, CBATTError::Success);
            }
        }

        // (BLE1109A) El canal L2CAP que publicamos ya tiene PSM.
        #[unsafe(method(peripheralManager:didPublishL2CAPChannel:error:))]
        fn peripheralManager_didPublishL2CAPChannel_error(&self, _peripheral: &CBPeripheralManager, psm: u16, error: Option<&NSError>) {
            if error.is_none() && l2::psm_valido(psm) {
                con_mac(|m| m.psm_publicado = Some(psm));
            }
        }

        // (BLE1109A) Un central abrió nuestro canal L2CAP: solo se atiende al que ya tiene el enlace GATT abierto.
        #[unsafe(method(peripheralManager:didOpenL2CAPChannel:error:))]
        fn peripheralManager_didOpenL2CAPChannel_error(&self, _peripheral: &CBPeripheralManager, channel: Option<&CBL2CAPChannel>, error: Option<&NSError>) {
            let (Some(c), None) = (channel, error) else { return };
            if !nucleo::canal_rapido_activo() {
                return; // (BLE1109B) ajuste apagado: nadie debería abrirlo; si lo hace, se ignora y GATT sigue
            }
            let Some(peer) = (unsafe { c.peer() }) else { return };
            let id = id_de(unsafe { peer.identifier() });
            if con_mac(|m| m.centrales.contains_key(&id)).unwrap_or(false) {
                lanzar_canal(format!("p:{id}"), c.retain());
            }
        }
    }
);

impl Delegado {
    fn nuevo() -> Retained<Self> {
        let this = Self::alloc().set_ivars(());
        unsafe { msg_send![super(this), init] }
    }
}

fn motivo(que: &str, error: Option<&NSError>) -> String {
    match error {
        Some(e) => format!("{que}: {}", e.localizedDescription()),
        None => que.to_string(),
    }
}

// ───────────────────────────── Estado de la radio ─────────────────────────────

/// Lo que dicen los dos gestores, en una frase para el núcleo (y, encendidos, a escanear y a servir).
fn al_cambiar_estado() {
    let Some((central, servidor)) = con_mac(|m| (m.central.clone(), m.servidor.clone())) else { return };
    let (c, s) = unsafe { (central.state(), servidor.state()) };
    let (estado, texto) = if c == CBManagerState::PoweredOn && s == CBManagerState::PoweredOn {
        ("encendida", "")
    } else if c == CBManagerState::Unauthorized || s == CBManagerState::Unauthorized {
        ("sin-permiso", "macOS no deja a StarSeed usar el Bluetooth: Ajustes del Sistema › Privacidad y seguridad › Bluetooth › StarSeed OS.")
    } else if c == CBManagerState::PoweredOff || s == CBManagerState::PoweredOff {
        ("apagada", "El Bluetooth de esta Mac está apagado (menú Bluetooth o Ajustes del Sistema).")
    } else if c == CBManagerState::Unsupported || s == CBManagerState::Unsupported {
        ("no-disponible", "Esta Mac no tiene Bluetooth de baja energía con papel central y periférico.")
    } else {
        return; // Desconocido o reiniciándose: el sistema avisará otra vez.
    };
    if estado != "encendida" {
        // (BLE1109B) La radio se apagó o se reinició (en el registro del 09-11 cambió cada 5-10 s): las conexiones pedidas y
        // los `CBPeripheral` guardados ya no valen. Se cancelan las pendientes (sin bucle: Rust reintenta con su espera) y se
        // vacían los mapas, para que al volver se redescubra todo por los anuncios.
        let viejos: Vec<Retained<CBPeripheral>> = con_mac(|m| {
            let v = m.perifericos.drain().map(|(_, x)| x.p).collect();
            m.vistos.clear();
            m.fallos_conexion.clear();
            v
        })
        .unwrap_or_default();
        parar_todos_los_canales();
        if c == CBManagerState::PoweredOn {
            for p in &viejos {
                unsafe { central.cancelPeripheralConnection(p) };
            }
        }
    }
    if c == CBManagerState::PoweredOn {
        escanear(&central);
    }
    if s == CBManagerState::PoweredOn {
        con_mac(|m| {
            if m.salida.is_none() {
                abrir_servicio(m);
            } else if m.servicio_listo {
                anunciar(m);
            }
        });
    }
    nucleo::al_radio(estado, texto);
}

fn escanear(central: &CBCentralManager) {
    if con_mac(|m| m.parado).unwrap_or(true) {
        return;
    }
    let si = NSNumber::new_bool(true);
    let valor: &AnyObject = &si;
    let clave: &NSString = unsafe { CBCentralManagerScanOptionAllowDuplicatesKey };
    let opciones = NSDictionary::<NSString, AnyObject>::from_slices(&[clave], &[valor]);
    unsafe {
        if !central.isScanning() {
            central.scanForPeripheralsWithServices_options(None, Some(&opciones));
        }
    }
}

/// El servicio StarSeed: ENTRADA (escritura con y sin respuesta) y SALIDA (notificación).
fn abrir_servicio(m: &mut Mac) {
    let entrada = unsafe {
        CBMutableCharacteristic::initWithType_properties_value_permissions(
            CBMutableCharacteristic::alloc(),
            &cbuuid(bt::ENTRADA),
            CBCharacteristicProperties::Write | CBCharacteristicProperties::WriteWithoutResponse,
            None,
            CBAttributePermissions::Writeable,
        )
    };
    let salida = unsafe {
        CBMutableCharacteristic::initWithType_properties_value_permissions(
            CBMutableCharacteristic::alloc(),
            &cbuuid(bt::SALIDA),
            CBCharacteristicProperties::Notify,
            None,
            CBAttributePermissions::Readable,
        )
    };
    // (BLE1109A) PSM del canal rápido: de solo lectura, sin valor fijo (se responde en `didReceiveReadRequest`).
    let psm = unsafe {
        CBMutableCharacteristic::initWithType_properties_value_permissions(
            CBMutableCharacteristic::alloc(),
            &cbuuid(l2::PSM),
            CBCharacteristicProperties::Read,
            None,
            CBAttributePermissions::Readable,
        )
    };
    let servicio = unsafe { CBMutableService::initWithType_primary(CBMutableService::alloc(), &cbuuid(bt::SERVICIO), true) };
    // (BLE1109B) Con el ajuste apagado (por defecto) el servicio es EXACTAMENTE el de prueba.30: ENTRADA y SALIDA.
    let con_psm = nucleo::canal_rapido_activo();
    let completa: [&CBCharacteristic; 3] = [&entrada, &salida, &psm];
    let basica: [&CBCharacteristic; 2] = [&entrada, &salida];
    unsafe {
        if con_psm {
            servicio.setCharacteristics(Some(&NSArray::from_slice(&completa)));
        } else {
            servicio.setCharacteristics(Some(&NSArray::from_slice(&basica)));
        }
        m.servidor.addService(&servicio);
    }
    m.salida = Some(salida);
}

/// Anuncia SOLO el UUID rotatorio (lo único que cabe y que macOS deja anunciar).
fn anunciar(m: &mut Mac) {
    if m.parado || !m.servicio_listo {
        return;
    }
    let Some(uuid) = m.anuncio.clone() else { return };
    let lista = NSArray::from_retained_slice(&[cbuuid(&uuid)]);
    let valor: &AnyObject = &lista;
    let clave: &NSString = unsafe { CBAdvertisementDataServiceUUIDsKey };
    let datos = NSDictionary::<NSString, AnyObject>::from_slices(&[clave], &[valor]);
    unsafe {
        m.servidor.stopAdvertising();
        m.servidor.startAdvertising(Some(&datos));
    }
}

// ───────────────────────────── Central ─────────────────────────────

fn al_ver(p: &CBPeripheral, anuncio: &NSDictionary<NSString, AnyObject>, rssi: &NSNumber) {
    let clave: &NSString = unsafe { CBAdvertisementDataServiceUUIDsKey };
    let Some(obj) = anuncio.objectForKey(clave) else { return };
    let Ok(lista) = obj.downcast::<NSArray>() else { return };
    for u in lista.to_vec() {
        let Ok(u) = u.downcast::<CBUUID>() else { continue };
        let datos = unsafe { u.data() }.to_vec();
        if !bt::es_anuncio(&datos) {
            continue;
        }
        let id = id_de(unsafe { p.identifier() });
        let ahora = ahora_ms();
        con_mac(|m| {
            m.vistos.insert(id.clone(), (p.retain(), ahora));
            if m.vistos.len() > 256 {
                m.vistos.retain(|_, (_, t)| ahora.saturating_sub(*t) < 60_000);
            }
        });
        // 127 = «sin dato» en CoreBluetooth.
        let r = rssi.intValue();
        nucleo::al_ver(&id, &datos, if r >= 127 { -127 } else { r.clamp(-127, 20) as i16 });
        return;
    }
}

/// (BLE1109B) `connectPeripheral` no caduca nunca: una conexión pedida que lleva esto sin llegar a «listo» se cancela.
const PLAZO_CONEXION_MS: u64 = 15_000;
/// (BLE1109B) Conexiones seguidas sin llegar a «listo» tras las que se olvida el `CBPeripheral` guardado y se redescubre.
const FALLOS_PARA_REDESCUBRIR: u32 = 3;

/// (BLE1109B) Una conexión a esta dirección no llegó a «listo» (caducó, falló o se cayó antes). A la tercera seguida se
/// olvida el `CBPeripheral` y se reinicia el escaneo: el siguiente anuncio crea uno nuevo (Android rota su dirección y,
/// con el objeto viejo, macOS repetía «Device disconnected without being ready» sin fin: reason 762).
fn contar_fallo_conexion(id: &str) {
    let (fallos, central) = match con_mac(|m| {
        let n = m.fallos_conexion.entry(id.to_string()).or_insert(0);
        *n += 1;
        let n = *n;
        if n >= FALLOS_PARA_REDESCUBRIR {
            m.fallos_conexion.remove(id);
            m.vistos.remove(id);
            (n, Some(m.central.clone()))
        } else {
            (n, None)
        }
    }) {
        Some(x) => x,
        None => return,
    };
    if let Some(central) = central {
        nucleo::nota(Some(&format!("c:{id}")), "redescubriendo", &format!("{fallos} conexiones seguidas sin llegar a listo: se olvida el aparato guardado y se busca de nuevo por su anuncio"));
        nucleo::olvidar_vecino(id);
        unsafe {
            if central.state() == CBManagerState::PoweredOn {
                central.stopScan();
            }
        }
        escanear(&central);
    }
}

fn conectar(direccion: &str) {
    let ahora = ahora_ms();
    // (BLE1109B) Si ya hay una conexión pedida que no avanza, se cancela y se cuenta como fallo; sin esto el intento
    // quedaba colgado para siempre y los siguientes `conectar` no hacían nada.
    let vencida = con_mac(|m| {
        let x = m.perifericos.get(direccion)?;
        if !x.listo && x.entrada.is_none() && ahora.saturating_sub(x.desde_ms) > PLAZO_CONEXION_MS {
            Some(x.p.clone())
        } else {
            None
        }
    })
    .flatten();
    if let Some(p) = vencida {
        con_mac(|m| m.perifericos.remove(direccion));
        cancelar(&p);
        nucleo::nota(Some(&format!("c:{direccion}")), "conexion-vencida", &format!("la conexión llevaba más de {} s sin llegar a listo: se cancela y se reintenta", PLAZO_CONEXION_MS / 1000));
        contar_fallo_conexion(direccion);
    }
    let Some(r) = con_mac(|m| {
        if m.parado || m.perifericos.contains_key(direccion) {
            return None;
        }
        let (p, _) = m.vistos.get(direccion)?;
        let p = p.clone();
        m.perifericos.insert(
            direccion.to_string(),
            PerifericoMac { p: p.clone(), entrada: None, listo: false, salida: None, bloqueado_desde: None, tardes: 0, reintentos_suscripcion: 0, psm: None, desde_ms: ahora },
        );
        Some((m.central.clone(), p))
    }) else {
        return;
    };
    if let Some((central, p)) = r {
        unsafe { central.connectPeripheral_options(&p, None) };
    }
}

fn cerrar_central(p: &CBPeripheral, motivo: &str) {
    let id = id_de(unsafe { p.identifier() });
    // (BLE1109B) Si se cayó antes de estar «listo», cuenta como fallo de conexión.
    let sin_listo = con_mac(|m| m.perifericos.get(&id).map(|x| !x.listo)).flatten().unwrap_or(false);
    con_mac(|m| m.perifericos.remove(&id));
    parar_canal(&format!("c:{id}"));
    nucleo::al_desconectar(&format!("c:{id}"), motivo);
    if sin_listo {
        contar_fallo_conexion(&id);
    }
}

fn cancelar(p: &CBPeripheral) {
    if let Some(central) = con_mac(|m| m.central.clone()) {
        unsafe { central.cancelPeripheralConnection(p) };
    }
}

fn al_descubrir_servicios(p: &CBPeripheral, error: Option<&NSError>) {
    let servicio = if error.is_none() {
        unsafe { p.services() }.and_then(|l| l.to_vec().into_iter().find(|s| es_uuid(unsafe { s.UUID() }, bt::SERVICIO)))
    } else {
        None
    };
    let Some(s) = servicio else {
        cancelar(p); // no es (o ya no es) una neurona StarSeed
        return;
    };
    nucleo::nota(Some(&format!("c:{}", id_de(unsafe { p.identifier() }))), "servicios-descubiertos", "servicio StarSeed encontrado, pidiendo características");
    // (BLE1109B) Sin el ajuste se piden SOLO ENTRADA y SALIDA, como en prueba.30.
    let caracteristicas = if nucleo::canal_rapido_activo() {
        NSArray::from_retained_slice(&[cbuuid(bt::ENTRADA), cbuuid(bt::SALIDA), cbuuid(l2::PSM)])
    } else {
        NSArray::from_retained_slice(&[cbuuid(bt::ENTRADA), cbuuid(bt::SALIDA)])
    };
    unsafe { p.discoverCharacteristics_forService(Some(&caracteristicas), &s) };
}

fn al_descubrir_caracteristicas(p: &CBPeripheral, s: &CBService, error: Option<&NSError>) {
    let lista = if error.is_none() { unsafe { s.characteristics() }.map(|l| l.to_vec()).unwrap_or_default() } else { Vec::new() };
    let entrada = lista.iter().find(|c| es_uuid(unsafe { c.UUID() }, bt::ENTRADA)).cloned();
    let salida = lista.iter().find(|c| es_uuid(unsafe { c.UUID() }, bt::SALIDA)).cloned();
    let psm = lista.iter().find(|c| es_uuid(unsafe { c.UUID() }, l2::PSM)).cloned();
    let (Some(entrada), Some(salida)) = (entrada, salida) else {
        cancelar(p);
        return;
    };
    let id = id_de(unsafe { p.identifier() });
    con_mac(|m| {
        if let Some(x) = m.perifericos.get_mut(&id) {
            x.entrada = Some(entrada);
            x.salida = Some(salida.clone());
            x.psm = psm;
        }
    });
    unsafe { p.setNotifyValue_forCharacteristic(true, &salida) };
}

/// (BLE1108C) La suscripción a SALIDA no quedó: se anota y se reintenta hasta `REINTENTOS_SUSCRIPCION` veces
/// (a 1 s) antes de cerrar el enlace, en vez de quedarse esperando un enlace que nunca abre.
fn reintentar_suscripcion(p: &CBPeripheral, motivo: &str) {
    let id = id_de(unsafe { p.identifier() });
    let plataforma = format!("c:{id}");
    let turno = con_mac(|m| {
        let x = m.perifericos.get_mut(&id)?;
        if x.salida.is_none() || x.reintentos_suscripcion >= REINTENTOS_SUSCRIPCION {
            return None;
        }
        x.reintentos_suscripcion += 1;
        Some(x.reintentos_suscripcion)
    })
    .flatten();
    let Some(n) = turno else {
        nucleo::nota(Some(&plataforma), "sin-suscripcion", &format!("{motivo}; sin más reintentos, se cierra el enlace"));
        cancelar(p);
        return;
    };
    nucleo::nota(Some(&plataforma), "sin-suscripcion", &format!("{motivo}; reintento {n} de {REINTENTOS_SUSCRIPCION}"));
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(ESPERA_SUSCRIPCION_MS));
        cola().exec_async(move || {
            let r = con_mac(|m| {
                let x = m.perifericos.get(&id)?;
                Some((x.p.clone(), x.salida.clone()?))
            })
            .flatten();
            if let Some((p, salida)) = r {
                nucleo::nota(Some(&format!("c:{id}")), "suscripcion-reintento", "pidiendo de nuevo las notificaciones de SALIDA");
                unsafe { p.setNotifyValue_forCharacteristic(true, &salida) };
            }
        });
    });
}

fn al_suscribirse(p: &CBPeripheral, c: &CBCharacteristic, error: Option<&NSError>) {
    if !es_uuid(unsafe { c.UUID() }, bt::SALIDA) {
        return;
    }
    if error.is_some() || !unsafe { c.isNotifying() } {
        reintentar_suscripcion(p, if error.is_some() { "el sistema devolvió un error al suscribirse" } else { "SALIDA no quedó notificando" });
        return;
    }
    let id = id_de(unsafe { p.identifier() });
    let paquete = unsafe { p.maximumWriteValueLengthForType(CBCharacteristicWriteType::WithoutResponse) };
    let conocido = con_mac(|m| match m.perifericos.get_mut(&id) {
        Some(x) => {
            x.listo = true;
            true
        }
        None => false,
    })
    .unwrap_or(false);
    if !conocido {
        cancelar(p);
        return;
    }
    nucleo::nota(Some(&format!("c:{id}")), "suscrito", &format!("notificaciones de SALIDA activas, paquete {paquete}"));
    nucleo::al_conectar(&format!("c:{id}"), "central", Some(&id), paquete.clamp(bt::PAQUETE_MIN, bt::PAQUETE_MAX));
    con_mac(|m| m.fallos_conexion.remove(&id)); // (BLE1109B) esta dirección sí conectó
    // (BLE1109B) El PSM del canal rápido NO se lee aquí: el núcleo lo pide (`leer_psm`) cuando el enlace queda ligado por GATT.
    // Así ninguna lectura extra compite con el saludo firmado.
    bombear_central(&id);
}

/// Escribe en ENTRADA mientras el sistema deje (sin respuesta); luego espera a que avise.
fn bombear_central(id: &str) {
    let plataforma = format!("c:{id}");
    for _ in 0..RAFAGA {
        let Some(Some((p, entrada))) = con_mac(|m| {
            let x = m.perifericos.get(id)?;
            if !x.listo {
                return None;
            }
            Some((x.p.clone(), x.entrada.clone()?))
        }) else {
            return;
        };
        if !unsafe { p.canSendWriteWithoutResponse() } {
            // `peripheralIsReadyToSendWriteWithoutResponse:` vuelve a llamar; y el tic de 250 ms también. Si la
            // señal tarda más de `ESPERA_LISTO_MS` se escribe igual (BLE1108C): nunca se espera para siempre.
            let ahora = ahora_ms();
            let tarde = con_mac(|m| {
                let x = m.perifericos.get_mut(id)?;
                let desde = *x.bloqueado_desde.get_or_insert(ahora);
                if ahora.saturating_sub(desde) < ESPERA_LISTO_MS {
                    return Some((false, 0));
                }
                x.tardes += 1;
                Some((true, x.tardes))
            })
            .flatten();
            match tarde {
                Some((true, n)) => {
                    if n <= 3 || n % 50 == 0 {
                        nucleo::nota(Some(&plataforma), "listo-tarde", &format!("sin «listo para escribir» en {ESPERA_LISTO_MS} ms: se escribe igual (aviso {n})"));
                    }
                }
                _ => return,
            }
        } else {
            con_mac(|m| {
                if let Some(x) = m.perifericos.get_mut(id) {
                    x.bloqueado_desde = None;
                }
            });
        }
        let Some(b) = nucleo::siguiente_paquete(&plataforma) else { return };
        unsafe { p.writeValue_forCharacteristic_type(&NSData::with_bytes(&b), &entrada, CBCharacteristicWriteType::WithoutResponse) };
    }
    // Cede la cola a otros eventos y sigue después.
    let id = id.to_string();
    cola().exec_async(move || bombear_central(&id));
}

// ───────────────────────────── Periférico ─────────────────────────────

fn al_escrituras(servidor: &CBPeripheralManager, peticiones: &NSArray<CBATTRequest>) {
    let lista = peticiones.to_vec();
    for r in &lista {
        if !es_uuid(unsafe { r.characteristic().UUID() }, bt::ENTRADA) {
            continue;
        }
        let Some(v) = (unsafe { r.value() }) else { continue };
        let id = id_de(unsafe { r.central().identifier() });
        // Solo de quien se suscribió a SALIDA (así abre el enlace un central StarSeed).
        if con_mac(|m| m.centrales.contains_key(&id)).unwrap_or(false) {
            nucleo::al_recibir(&format!("p:{id}"), &v.to_vec());
        }
    }
    // Una respuesta para todo el lote (lo que pide CoreBluetooth); a las escrituras sin respuesta no les afecta.
    if let Some(primera) = lista.first() {
        unsafe { servidor.respondToRequest_withResult(primera, CBATTError::Success) };
    }
}

/// Notifica por SALIDA a cada central con datos, por turnos. Si la cola del sistema se llena, guarda
/// el paquete y espera a `peripheralManagerIsReadyToUpdateSubscribers:`.
fn bombear_servidor() {
    let Some((servidor, salida, centrales, ocupado, turno)) = con_mac(|m| {
        let mut c: Vec<(String, Retained<CBCentral>)> = m.centrales.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
        c.sort_by(|a, b| a.0.cmp(&b.0));
        m.turno = m.turno.wrapping_add(1);
        (m.servidor.clone(), m.salida.clone(), c, m.servidor_ocupado, m.turno)
    }) else {
        return;
    };
    let Some(salida) = salida else { return };
    if centrales.is_empty() {
        return;
    }
    if ocupado {
        // (BLE1108C) Cola de notificaciones llena sin aviso de «lista»: pasados `ESPERA_LISTO_MS` se sigue igual.
        let ahora = ahora_ms();
        let tarde = con_mac(|m| {
            if ahora.saturating_sub(m.servidor_ocupado_desde) < ESPERA_LISTO_MS {
                return None;
            }
            m.servidor_ocupado = false;
            m.servidor_tardes += 1;
            Some(m.servidor_tardes)
        })
        .flatten();
        let Some(n) = tarde else { return };
        if n <= 3 || n % 50 == 0 {
            nucleo::nota(None, "listo-tarde", &format!("sin «lista para actualizar» en {ESPERA_LISTO_MS} ms: se notifica igual (aviso {n})"));
        }
    }
    let enviar = |plataforma: &str, central: &Retained<CBCentral>, b: Vec<u8>| -> bool {
        let a = NSArray::from_retained_slice(&[central.clone()]);
        let ok = unsafe { servidor.updateValue_forCharacteristic_onSubscribedCentrals(&NSData::with_bytes(&b), &salida, Some(&a)) };
        if !ok {
            con_mac(|m| {
                if !m.servidor_ocupado {
                    m.servidor_ocupado_desde = ahora_ms();
                }
                m.servidor_ocupado = true;
                m.pendiente = Some((plataforma.to_string(), b));
            });
        }
        ok
    };
    // Primero lo que se quedó sin salir.
    if let Some((plataforma, b)) = con_mac(|m| m.pendiente.take()).flatten() {
        if let Some((_, central)) = centrales.iter().find(|(id, _)| format!("p:{id}") == plataforma) {
            if !enviar(&plataforma, central, b) {
                return;
            }
        }
    }
    let n = centrales.len();
    let mut enviados = 0;
    let mut alguno = true;
    while alguno && enviados < RAFAGA {
        alguno = false;
        for k in 0..n {
            let (id, central) = &centrales[(turno + k) % n];
            let plataforma = format!("p:{id}");
            let Some(b) = nucleo::siguiente_paquete(&plataforma) else { continue };
            alguno = true;
            enviados += 1;
            if !enviar(&plataforma, central, b) {
                return;
            }
        }
    }
    if enviados >= RAFAGA {
        cola().exec_async(bombear_servidor);
    }
}

// ───────────────────────────── Arranque y parada ─────────────────────────────

fn arrancar_en_cola() {
    let existe = con_mac(|m| {
        m.parado = false;
    })
    .is_some();
    if existe {
        al_cambiar_estado();
        return;
    }
    let delegado = Delegado::nuevo();
    let central = unsafe {
        CBCentralManager::initWithDelegate_queue(CBCentralManager::alloc(), Some(ProtocolObject::from_ref(&*delegado)), Some(cola()))
    };
    let servidor = unsafe {
        CBPeripheralManager::initWithDelegate_queue(CBPeripheralManager::alloc(), Some(ProtocolObject::from_ref(&*delegado)), Some(cola()))
    };
    let mut g = match MAC.lock() {
        Ok(g) => g,
        Err(envenenado) => envenenado.into_inner(),
    };
    g.0 = Some(Mac {
        delegado,
        central,
        servidor,
        salida: None,
        servicio_listo: false,
        anuncio: None,
        parado: false,
        vistos: HashMap::new(),
        perifericos: HashMap::new(),
        centrales: HashMap::new(),
        servidor_ocupado: false,
        servidor_ocupado_desde: 0,
        servidor_tardes: 0,
        pendiente: None,
        turno: 0,
        psm_publicado: None,
        fallos_conexion: HashMap::new(),
    });
    // Los dos gestores avisan de su estado en esta misma cola (`…DidUpdateState:`).
}

fn parar_en_cola() {
    let Some((central, servidor, perifericos, centrales)) = con_mac(|m| {
        m.parado = true;
        m.anuncio = None;
        m.pendiente = None;
        m.servidor_ocupado = false;
        let p: Vec<Retained<CBPeripheral>> = m.perifericos.drain().map(|(_, x)| x.p).collect();
        let c: Vec<String> = m.centrales.drain().map(|(k, _)| k).collect();
        (m.central.clone(), m.servidor.clone(), p, c)
    }) else {
        return;
    };
    parar_todos_los_canales();
    unsafe {
        central.stopScan();
        servidor.stopAdvertising();
        for p in &perifericos {
            central.cancelPeripheralConnection(p);
        }
    }
    for id in centrales {
        nucleo::al_desconectar(&format!("p:{id}"), "Bluetooth directo apagado");
    }
}

impl Radio for RadioMac {
    fn disponible(&self) -> bool {
        true
    }

    fn arrancar(&self) {
        cola().exec_async(arrancar_en_cola);
    }

    fn anunciar(&self, uuid: &str) {
        let u = uuid.to_string();
        cola().exec_async(move || {
            con_mac(|m| {
                m.anuncio = Some(u);
                anunciar(m);
            });
        });
    }

    fn conectar(&self, direccion: &str) {
        let d = direccion.to_string();
        cola().exec_async(move || conectar(&d));
    }

    fn desconectar(&self, plataforma: &str) {
        let p = plataforma.to_string();
        cola().exec_async(move || {
            if let Some(id) = p.strip_prefix("c:") {
                parar_canal(&p);
                if let Some(Some(x)) = con_mac(|m| m.perifericos.remove(id).map(|x| x.p)) {
                    cancelar(&x);
                }
            } else if let Some(id) = p.strip_prefix("p:") {
                // CoreBluetooth no deja echar a un central: se le deja de atender.
                con_mac(|m| m.centrales.remove(id));
                parar_canal(&p);
            }
        });
    }

    fn hay_datos(&self, plataforma: &str) {
        let p = plataforma.to_string();
        cola().exec_async(move || {
            if let Some(id) = p.strip_prefix("c:") {
                bombear_central(id);
            } else {
                bombear_servidor();
            }
        });
    }

    fn pedir_permiso(&self) {
        // macOS pregunta solo la primera vez; si se negó, el sitio para cambiarlo.
        let _ = std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Bluetooth")
            .spawn();
    }

    fn parar(&self) {
        cola().exec_async(parar_en_cola);
    }

    // BLE1109B: ya ligado por GATT, el central lee el PSM del periférico (si el otro lo ofrece).
    fn leer_psm(&self, plataforma: &str) {
        let Some(id) = plataforma.strip_prefix("c:") else { return };
        let id = id.to_string();
        cola().exec_async(move || {
            if let Some(Some((p, Some(c)))) = con_mac(|m| m.perifericos.get(&id).map(|x| (x.p.clone(), x.psm.clone()))) {
                unsafe { p.readValueForCharacteristic(&c) };
            }
        });
    }

    // BLE1109A: como central abre el canal con el PSM leído; como periférico espera a que el otro abra.
    fn abrir_l2cap(&self, plataforma: &str, psm: u16) {
        let p = plataforma.to_string();
        cola().exec_async(move || {
            let Some(id) = p.strip_prefix("c:") else { return };
            match con_mac(|m| m.perifericos.get(id).map(|x| x.p.clone())).flatten() {
                Some(per) => unsafe { per.openL2CAPChannel(psm) },
                None => nucleo::al_l2cap_cerrado(&p, "el aparato ya no está conectado"),
            }
        });
    }

    fn cerrar_l2cap(&self, plataforma: &str) {
        parar_canal(plataforma);
    }
}

// ───────────────────────────── Canal L2CAP: un hilo por canal (BLE1109A) ─────────────────────────────

/// Tic del hilo del canal: lo máximo que tarda en notar datos nuevos para escribir.
const TIC_CANAL_S: f64 = 0.005;
/// Lo que se lee del flujo de una vez.
const LECTURA_CANAL: usize = 8 * 1024;

/// Los objetos de CoreBluetooth no son `Send`: el canal pasa al hilo que lo atiende y no vuelve.
struct Enviable<T>(T);
unsafe impl<T> Send for Enviable<T> {}
impl<T> Enviable<T> {
    fn dentro(self) -> T {
        self.0
    }
}

static CANALES: Mutex<Option<HashMap<String, Arc<AtomicBool>>>> = Mutex::new(None);

fn con_canales<T>(f: impl FnOnce(&mut HashMap<String, Arc<AtomicBool>>) -> T) -> T {
    let mut g = match CANALES.lock() {
        Ok(g) => g,
        Err(envenenado) => envenenado.into_inner(),
    };
    f(g.get_or_insert_with(HashMap::new))
}

/// Pide al hilo de ese canal que cierre (idempotente: sin canal no hace nada).
fn parar_canal(plataforma: &str) {
    con_canales(|c| {
        if let Some(f) = c.get(plataforma) {
            f.store(true, Ordering::SeqCst);
        }
    });
}

fn parar_todos_los_canales() {
    con_canales(|c| {
        for f in c.values() {
            f.store(true, Ordering::SeqCst);
        }
    });
}

fn lanzar_canal(plataforma: String, canal: Retained<CBL2CAPChannel>) {
    let parar = Arc::new(AtomicBool::new(false));
    con_canales(|c| {
        if let Some(viejo) = c.insert(plataforma.clone(), parar.clone()) {
            viejo.store(true, Ordering::SeqCst);
        }
    });
    let canal = Enviable(canal);
    let hilo = std::thread::Builder::new().name("starseed-l2cap".into()).spawn({
        let plataforma = plataforma.clone();
        let parar = parar.clone();
        move || {
            let canal = canal.dentro();
            let motivo = bucle_canal(&plataforma, &canal, &parar);
            con_canales(|c| {
                if c.get(&plataforma).is_some_and(|f| Arc::ptr_eq(f, &parar)) {
                    c.remove(&plataforma);
                }
            });
            nucleo::al_l2cap_cerrado(&plataforma, &motivo);
        }
    });
    if hilo.is_err() {
        con_canales(|c| c.remove(&plataforma));
        nucleo::al_l2cap_cerrado(&plataforma, "no se pudo crear el hilo del canal L2CAP");
    }
}

fn texto_error(e: Option<Retained<NSError>>, que: &str) -> String {
    match e {
        Some(e) => format!("{que}: {}", e.localizedDescription()),
        None => que.to_string(),
    }
}

/// El hilo del canal: abre los flujos, lee lo que llega (a `ble.rs`, que desmarca) y escribe lo que `ble.rs` marca,
/// con escrituras parciales. Devuelve el motivo del cierre.
fn bucle_canal(plataforma: &str, canal: &CBL2CAPChannel, parar: &AtomicBool) -> String {
    let (entra, sale) = match unsafe { (canal.inputStream(), canal.outputStream()) } {
        (Some(e), Some(s)) => (e, s),
        _ => return "el canal L2CAP no trae flujos".into(),
    };
    let psm = unsafe { canal.PSM() };
    let rl = NSRunLoop::currentRunLoop();
    let modo = unsafe { NSDefaultRunLoopMode };
    unsafe {
        entra.scheduleInRunLoop_forMode(&rl, modo);
        sale.scheduleInRunLoop_forMode(&rl, modo);
    }
    entra.open();
    sale.open();
    let inicio = ahora_ms();
    let mut abierto = false;
    let mut salida = l2::Salida::nueva();
    let mut ultimo_avance = ahora_ms();
    let mut buf = vec![0u8; LECTURA_CANAL];
    let motivo = 'bucle: loop {
        if parar.load(Ordering::SeqCst) {
            break "cerrado desde esta app".to_string();
        }
        let hasta = NSDate::dateWithTimeIntervalSinceNow(TIC_CANAL_S);
        rl.runMode_beforeDate(modo, &hasta);
        let (se, ss) = (entra.streamStatus(), sale.streamStatus());
        if se == NSStreamStatus::Error || ss == NSStreamStatus::Error {
            break texto_error(entra.streamError().or_else(|| sale.streamError()), "error en el flujo del canal L2CAP");
        }
        if se == NSStreamStatus::AtEnd || se == NSStreamStatus::Closed || ss == NSStreamStatus::Closed {
            break "el otro aparato cerró el canal L2CAP".to_string();
        }
        let ahora = ahora_ms();
        if !abierto {
            let abre = |s: NSStreamStatus| s == NSStreamStatus::Open || s == NSStreamStatus::Reading || s == NSStreamStatus::Writing;
            if abre(se) && abre(ss) {
                abierto = true;
                ultimo_avance = ahora;
                nucleo::al_l2cap_abierto(plataforma, Some(psm));
            } else if ahora.saturating_sub(inicio) > l2::PLAZO_ABRIR_MS {
                break "los flujos del canal L2CAP no abrieron a tiempo".to_string();
            }
            continue;
        }
        let mut movido = false;
        // Leer lo que haya (hasBytesAvailable), sin bloquear nunca.
        for _ in 0..32 {
            if !entra.hasBytesAvailable() {
                break;
            }
            let n = unsafe { entra.read_maxLength(NonNull::new_unchecked(buf.as_mut_ptr()), LECTURA_CANAL) };
            if n > 0 {
                movido = true;
                nucleo::al_l2cap_datos(plataforma, &buf[..n as usize]);
            } else if n == 0 {
                break 'bucle "el otro aparato cerró el canal L2CAP".to_string();
            } else {
                break 'bucle texto_error(entra.streamError(), "error al leer del canal L2CAP");
            }
        }
        // Escribir lo que acepte el flujo (hasSpaceAvailable); lo que no cabe se queda para el siguiente tic.
        for _ in 0..16 {
            if salida.vacia() {
                match nucleo::siguiente_trama_rapida(plataforma, 8 * 1024) {
                    Some(b) => salida.cargar(&b),
                    None => break,
                }
            }
            if !sale.hasSpaceAvailable() {
                break;
            }
            let pendiente = salida.pendiente();
            let n = unsafe { sale.write_maxLength(NonNull::new_unchecked(pendiente.as_ptr() as *mut u8), pendiente.len()) };
            if n > 0 {
                movido = true;
                ultimo_avance = ahora;
                salida.avanzar(n as usize);
            } else if n < 0 {
                break 'bucle texto_error(sale.streamError(), "error al escribir en el canal L2CAP");
            } else {
                break;
            }
        }
        if salida.vacia() {
            ultimo_avance = ahora;
        } else if ahora.saturating_sub(ultimo_avance) > l2::PLAZO_ESCRITURA_MS {
            break format!("escritura atascada: {} B sin salir en {} ms", salida.faltan(), l2::PLAZO_ESCRITURA_MS);
        }
        if !movido {
            // Sin trabajo: el run loop ya esperó el tic; este respiro evita girar en vacío si devuelve de inmediato.
            std::thread::sleep(std::time::Duration::from_millis(1));
        }
    };
    unsafe {
        entra.removeFromRunLoop_forMode(&rl, modo);
        sale.removeFromRunLoop_forMode(&rl, modo);
    }
    entra.close();
    sale.close();
    motivo
}
