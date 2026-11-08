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
// Requiere `NSBluetoothAlwaysUsageDescription` en Info.plist (sin ella macOS cierra la app).
// No se compila en Linux: se comprobó con `cargo check --target aarch64-apple-darwin` en una caja
// aparte con las mismas versiones (objc2 0.6, objc2-foundation 0.3.2, objc2-core-bluetooth =0.3.2,
// dispatch2 0.3); ver el contrato §8.
// ═══════════════════════════════════════════════════════════════════════════

#![allow(non_snake_case)]

use crate::ble::{self as nucleo, Radio};
use crate::ble_trama as bt;
use dispatch2::{DispatchQueue, DispatchRetained};
use objc2::rc::Retained;
use objc2::runtime::{AnyObject, ProtocolObject};
use objc2::{define_class, msg_send, AnyThread, DefinedClass, Message};
use objc2_core_bluetooth::{
    CBATTError, CBATTRequest, CBAdvertisementDataServiceUUIDsKey, CBAttributePermissions, CBCentral, CBCentralManager,
    CBCentralManagerDelegate, CBCentralManagerScanOptionAllowDuplicatesKey, CBCharacteristic, CBCharacteristicProperties,
    CBCharacteristicWriteType, CBManagerState, CBMutableCharacteristic, CBMutableService, CBPeripheral, CBPeripheralDelegate,
    CBPeripheralManager, CBPeripheralManagerDelegate, CBService, CBUUID,
};
use objc2_foundation::{NSArray, NSData, NSDictionary, NSError, NSNumber, NSObject, NSObjectProtocol, NSString};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
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
    let servicio = unsafe { CBMutableService::initWithType_primary(CBMutableService::alloc(), &cbuuid(bt::SERVICIO), true) };
    let lista: [&CBCharacteristic; 2] = [&entrada, &salida];
    unsafe {
        servicio.setCharacteristics(Some(&NSArray::from_slice(&lista)));
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

fn conectar(direccion: &str) {
    let Some(r) = con_mac(|m| {
        if m.parado || m.perifericos.contains_key(direccion) {
            return None;
        }
        let (p, _) = m.vistos.get(direccion)?;
        let p = p.clone();
        m.perifericos.insert(direccion.to_string(), PerifericoMac { p: p.clone(), entrada: None, listo: false, salida: None, bloqueado_desde: None, tardes: 0, reintentos_suscripcion: 0 });
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
    con_mac(|m| m.perifericos.remove(&id));
    nucleo::al_desconectar(&format!("c:{id}"), motivo);
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
    let caracteristicas = NSArray::from_retained_slice(&[cbuuid(bt::ENTRADA), cbuuid(bt::SALIDA)]);
    unsafe { p.discoverCharacteristics_forService(Some(&caracteristicas), &s) };
}

fn al_descubrir_caracteristicas(p: &CBPeripheral, s: &CBService, error: Option<&NSError>) {
    let lista = if error.is_none() { unsafe { s.characteristics() }.map(|l| l.to_vec()).unwrap_or_default() } else { Vec::new() };
    let entrada = lista.iter().find(|c| es_uuid(unsafe { c.UUID() }, bt::ENTRADA)).cloned();
    let salida = lista.iter().find(|c| es_uuid(unsafe { c.UUID() }, bt::SALIDA)).cloned();
    let (Some(entrada), Some(salida)) = (entrada, salida) else {
        cancelar(p);
        return;
    };
    let id = id_de(unsafe { p.identifier() });
    con_mac(|m| {
        if let Some(x) = m.perifericos.get_mut(&id) {
            x.entrada = Some(entrada);
            x.salida = Some(salida.clone());
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
                if let Some(Some(x)) = con_mac(|m| m.perifericos.remove(id).map(|x| x.p)) {
                    cancelar(&x);
                }
            } else if let Some(id) = p.strip_prefix("p:") {
                // CoreBluetooth no deja echar a un central: se le deja de atender.
                con_mac(|m| m.centrales.remove(id));
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
}
