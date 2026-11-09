// ═══════════════════════════════════════════════════════════════════════════
// ble_android — la radio Bluetooth de Android para el núcleo de `ble.rs` (BLE1108A).
// ---------------------------------------------------------------------------
// Contrato: architecture/bluetooth-directo.md §6.
//
// La radio vive en Kotlin (android/BleStarSeed.kt: BluetoothLeAdvertiser, BluetoothLeScanner,
// BluetoothGattServer y BluetoothGatt cliente), inyectado por build.rs (android_ble.rs). Rust es el
// cerebro (anuncio, tramas, acuses, a quién conectar); Kotlin solo mueve bytes. Se hablan así, sin
// crates nuevos (el JNI va con la tabla de funciones de JNIEnv, como `android.rs`):
//
//   Kotlin → Rust   PuenteBle.evento(json)          radio, visto, conectado, mtu, desconectado
//                   PuenteBle.datos(enlace, hex)    un paquete que llegó
//                   PuenteBle.siguiente(enlace)     el siguiente paquete a mandar («» = nada)
//   Rust → Kotlin   PuenteBle.esperarOrden(ms)      un hilo de Kotlin espera órdenes (JSON):
//                   arrancar · anunciar{uuid} · conectar{direccion} · desconectar{enlace} ·
//                   datos{enlace} · permisos · parar · l2cap{enlace,psm} · cerrar-l2cap{enlace}
//   (BLE1109A)      PuenteBle.rapido(enlace, hex)         bytes del flujo del canal L2CAP (trozos de cualquier tamaño)
//                   PuenteBle.siguienteRapido(enlace, max) bytes ya marcados para escribir en el flujo («» = nada)
//                   evento psm · l2cap-abierto · l2cap-cerrado (ver `ble::leer_evento`)
//
// Como el núcleo vive en el PROCESO, todo sigue con la app cerrada mientras el servicio en primer
// plano («Segundo plano», ServicioAntenas.kt) mantenga vivo el proceso.
// ═══════════════════════════════════════════════════════════════════════════

#![allow(dead_code)]

use std::collections::VecDeque;
use std::sync::{Condvar, Mutex};
use std::time::Duration;

static COLA: Mutex<VecDeque<String>> = Mutex::new(VecDeque::new());
static AVISO: Condvar = Condvar::new();
/// Órdenes que esperan como mucho (si Kotlin no las recoge, las más viejas se pierden).
const MAX_ORDENES: usize = 512;

fn cola() -> std::sync::MutexGuard<'static, VecDeque<String>> {
    match COLA.lock() {
        Ok(g) => g,
        Err(envenenado) => envenenado.into_inner(),
    }
}

/// Encola una orden para Kotlin. «datos» de un enlace que ya espera no se repite.
pub fn ordenar(orden: serde_json::Value) {
    let texto = orden.to_string();
    let mut c = cola();
    if orden.get("o").and_then(|o| o.as_str()) == Some("datos") && c.iter().any(|x| *x == texto) {
        return;
    }
    if c.len() >= MAX_ORDENES {
        c.pop_front();
    }
    c.push_back(texto);
    AVISO.notify_all();
}

/// Lo que Kotlin recoge: la orden más vieja, o «» si en `ms` no llegó ninguna.
pub fn esperar_orden(ms: u64) -> String {
    let mut c = cola();
    if c.is_empty() {
        c = match AVISO.wait_timeout(c, Duration::from_millis(ms.clamp(1, 30_000))) {
            Ok((g, _)) => g,
            Err(envenenado) => envenenado.into_inner().0,
        };
    }
    c.pop_front().unwrap_or_default()
}

/// La radio de Android: cada llamada es una orden para BleStarSeed.kt.
pub struct RadioAndroid;

impl crate::ble::Radio for RadioAndroid {
    fn disponible(&self) -> bool {
        true
    }
    fn arrancar(&self) {
        ordenar(serde_json::json!({ "o": "arrancar" }));
    }
    fn anunciar(&self, uuid: &str) {
        ordenar(serde_json::json!({ "o": "anunciar", "uuid": uuid }));
    }
    fn conectar(&self, direccion: &str) {
        ordenar(serde_json::json!({ "o": "conectar", "direccion": direccion }));
    }
    fn desconectar(&self, plataforma: &str) {
        ordenar(serde_json::json!({ "o": "desconectar", "enlace": plataforma }));
    }
    fn hay_datos(&self, plataforma: &str) {
        ordenar(serde_json::json!({ "o": "datos", "enlace": plataforma }));
    }
    fn pedir_permiso(&self) {
        ordenar(serde_json::json!({ "o": "permisos" }));
    }
    fn parar(&self) {
        ordenar(serde_json::json!({ "o": "parar" }));
    }
    // BLE1109A
    fn abrir_l2cap(&self, plataforma: &str, psm: u16) {
        ordenar(serde_json::json!({ "o": "l2cap", "enlace": plataforma, "psm": psm }));
    }
    fn cerrar_l2cap(&self, plataforma: &str) {
        ordenar(serde_json::json!({ "o": "cerrar-l2cap", "enlace": plataforma }));
    }
    // BLE1109B: el ajuste «Canal rápido Bluetooth (experimental)» llega a Kotlin ANTES de `arrancar`; apagado, Kotlin no
    // añade la característica PSM, ni abre el socket L2CAP, ni pide PHY 2M (servicio GATT idéntico al de prueba.30).
    fn canal_rapido(&self, activo: bool) {
        ordenar(serde_json::json!({ "o": "canal-rapido", "activo": activo }));
    }
    // BLE1109B: el enlace ya está ligado: ahora sí se lee la característica PSM del periférico.
    fn leer_psm(&self, plataforma: &str) {
        ordenar(serde_json::json!({ "o": "leer-psm", "enlace": plataforma }));
    }
    // BLE1109B: «Compartir registro de enlaces» → hoja de compartir de Android con el final de `enlaces.log`.
    fn compartir_registro(&self, titulo: &str, texto: &str) -> bool {
        ordenar(serde_json::json!({ "o": "compartir", "titulo": titulo, "texto": texto }));
        true
    }
}

/// Un paquete en hex que llegó de Kotlin (puro: lo que no es hex o no cabe se ignora).
pub fn paquete_de_hex(hex: &str) -> Option<Vec<u8>> {
    if hex.len() > crate::ble_trama::PAQUETE_MAX * 2 {
        return None;
    }
    crate::ble_trama::de_hex(hex).filter(|b| !b.is_empty())
}

/// (BLE1109A) Bytes del flujo L2CAP en hex (hasta un trozo de `ble_l2cap::TROZO_MAX`; lo demás se ignora).
pub fn trozo_de_hex(hex: &str) -> Option<Vec<u8>> {
    if hex.len() > crate::ble_l2cap::TROZO_MAX * 2 {
        return None;
    }
    crate::ble_trama::de_hex(hex).filter(|b| !b.is_empty())
}

/// JNI sin crates: GetStringUTFChars (169), ReleaseStringUTFChars (170) y NewStringUTF (167) de la
/// tabla de JNIEnv (jni.h). Ningún pánico cruza a Java (el perfil de release aborta igualmente).
#[cfg(target_os = "android")]
pub mod jni {
    use std::ffi::{c_char, c_void, CStr, CString};

    type Env = *mut *const *const c_void;
    type GetUtf = unsafe extern "system" fn(Env, *mut c_void, *mut u8) -> *const c_char;
    type RelUtf = unsafe extern "system" fn(Env, *mut c_void, *const c_char);
    type NewUtf = unsafe extern "system" fn(Env, *const c_char) -> *mut c_void;

    unsafe fn texto(env: Env, s: *mut c_void) -> Option<String> {
        if env.is_null() || s.is_null() || (*env).is_null() {
            return None;
        }
        let tabla: *const *const c_void = *env;
        let get: GetUtf = std::mem::transmute(*tabla.add(169));
        let rel: RelUtf = std::mem::transmute(*tabla.add(170));
        let p = get(env, s, std::ptr::null_mut());
        if p.is_null() {
            return None;
        }
        let r = CStr::from_ptr(p).to_string_lossy().into_owned();
        rel(env, s, p);
        Some(r)
    }

    unsafe fn nuevo_texto(env: Env, s: &str) -> *mut c_void {
        if env.is_null() || (*env).is_null() {
            return std::ptr::null_mut();
        }
        // Solo ASCII sale hacia Kotlin (hex, UUIDs, direcciones, órdenes): el UTF-8 «modificado» de
        // JNI coincide con él.
        let limpio: String = s.chars().filter(|c| c.is_ascii() && *c != '\0').collect();
        let Ok(c) = CString::new(limpio) else { return std::ptr::null_mut() };
        let tabla: *const *const c_void = *env;
        let nuevo: NewUtf = std::mem::transmute(*tabla.add(167));
        nuevo(env, c.as_ptr())
    }

    /// `PuenteBle.evento(json: String)`.
    #[no_mangle]
    pub extern "system" fn Java_app_starseed_nativa_PuenteBle_evento(env: Env, _clase: *mut c_void, json: *mut c_void) {
        let Some(j) = (unsafe { texto(env, json) }) else { return };
        let _ = std::panic::catch_unwind(|| {
            crate::ble::asegurar();
            if let Some(ev) = crate::ble::leer_evento(&j) {
                crate::ble::aplicar_evento(ev);
            }
        });
    }

    /// `PuenteBle.datos(enlace: String, hex: String)`.
    #[no_mangle]
    pub extern "system" fn Java_app_starseed_nativa_PuenteBle_datos(env: Env, _clase: *mut c_void, enlace: *mut c_void, hex: *mut c_void) {
        let (Some(e), Some(h)) = (unsafe { texto(env, enlace) }, unsafe { texto(env, hex) }) else { return };
        let _ = std::panic::catch_unwind(|| {
            if let Some(b) = super::paquete_de_hex(&h) {
                crate::ble::al_recibir(&e, &b);
            }
        });
    }

    /// `PuenteBle.siguiente(enlace: String): String` — hex del siguiente paquete, o «».
    #[no_mangle]
    pub extern "system" fn Java_app_starseed_nativa_PuenteBle_siguiente(env: Env, _clase: *mut c_void, enlace: *mut c_void) -> *mut c_void {
        let e = unsafe { texto(env, enlace) }.unwrap_or_default();
        let hex = std::panic::catch_unwind(|| crate::ble::siguiente_paquete(&e).map(|b| crate::ble_trama::a_hex(&b)).unwrap_or_default())
            .unwrap_or_default();
        unsafe { nuevo_texto(env, &hex) }
    }

    /// (BLE1109A) `PuenteBle.rapido(enlace: String, hex: String)` — bytes que llegaron por el flujo del canal L2CAP.
    #[no_mangle]
    pub extern "system" fn Java_app_starseed_nativa_PuenteBle_rapido(env: Env, _clase: *mut c_void, enlace: *mut c_void, hex: *mut c_void) {
        let (Some(e), Some(h)) = (unsafe { texto(env, enlace) }, unsafe { texto(env, hex) }) else { return };
        let _ = std::panic::catch_unwind(|| {
            if let Some(b) = super::trozo_de_hex(&h) {
                crate::ble::al_l2cap_datos(&e, &b);
            }
        });
    }

    /// (BLE1109A) `PuenteBle.siguienteRapido(enlace: String, max: Int): String` — hex de lo siguiente que escribir en el flujo, o «».
    #[no_mangle]
    pub extern "system" fn Java_app_starseed_nativa_PuenteBle_siguienteRapido(env: Env, _clase: *mut c_void, enlace: *mut c_void, max: i32) -> *mut c_void {
        let e = unsafe { texto(env, enlace) }.unwrap_or_default();
        let hex = std::panic::catch_unwind(|| {
            crate::ble::siguiente_trama_rapida(&e, max.clamp(1, 65_536) as usize).map(|b| crate::ble_trama::a_hex(&b)).unwrap_or_default()
        })
        .unwrap_or_default();
        unsafe { nuevo_texto(env, &hex) }
    }

    /// `PuenteBle.esperarOrden(ms: Long): String` — la siguiente orden (JSON), o «» si no llegó ninguna.
    #[no_mangle]
    pub extern "system" fn Java_app_starseed_nativa_PuenteBle_esperarOrden(env: Env, _clase: *mut c_void, ms: i64) -> *mut c_void {
        let _ = std::panic::catch_unwind(crate::ble::asegurar);
        let o = std::panic::catch_unwind(|| super::esperar_orden(ms.max(1) as u64)).unwrap_or_default();
        unsafe { nuevo_texto(env, &o) }
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn ordenes_en_orden_sin_repetir_datos_y_con_espera() {
        let radio = RadioAndroid;
        use crate::ble::Radio;
        // Vacía lo que hubiera.
        while !esperar_orden(1).is_empty() {}
        radio.arrancar();
        radio.anunciar("5353b1a0-0102-0304-0000-000000000000");
        radio.hay_datos("c:AA:01");
        radio.hay_datos("c:AA:01");
        radio.hay_datos("p:BB:02");
        radio.conectar("AA:01");
        let leer = |s: String| serde_json::from_str::<serde_json::Value>(&s).unwrap();
        assert_eq!(leer(esperar_orden(10))["o"], "arrancar");
        let a = leer(esperar_orden(10));
        assert_eq!((a["o"].as_str(), a["uuid"].as_str()), (Some("anunciar"), Some("5353b1a0-0102-0304-0000-000000000000")));
        assert_eq!(leer(esperar_orden(10))["enlace"], "c:AA:01");
        assert_eq!(leer(esperar_orden(10))["enlace"], "p:BB:02", "el «datos» repetido no se encola dos veces");
        assert_eq!(leer(esperar_orden(10))["direccion"], "AA:01");
        let t0 = std::time::Instant::now();
        assert_eq!(esperar_orden(30), "");
        assert!(t0.elapsed() >= Duration::from_millis(25), "espera de verdad");
        // Otro hilo despierta al que espera.
        let h = std::thread::spawn(|| esperar_orden(5_000));
        std::thread::sleep(Duration::from_millis(30));
        RadioAndroid.pedir_permiso();
        assert_eq!(leer(h.join().unwrap())["o"], "permisos");
        // BLE1109A: abrir y cerrar el canal rápido son órdenes más, en orden.
        while !esperar_orden(1).is_empty() {}
        RadioAndroid.abrir_l2cap("c:AA:01", 133);
        RadioAndroid.cerrar_l2cap("c:AA:01");
        let c = leer(esperar_orden(10));
        assert_eq!((c["o"].as_str(), c["enlace"].as_str(), c["psm"].as_u64()), (Some("l2cap"), Some("c:AA:01"), Some(133)));
        let d = leer(esperar_orden(10));
        assert_eq!((d["o"].as_str(), d["enlace"].as_str()), (Some("cerrar-l2cap"), Some("c:AA:01")));
    }

    #[test]
    fn paquetes_en_hex() {
        assert_eq!(paquete_de_hex("020001"), Some(vec![2, 0, 1]));
        assert_eq!(paquete_de_hex(""), None);
        assert_eq!(paquete_de_hex("zz"), None);
        assert_eq!(paquete_de_hex(&"00".repeat(crate::ble_trama::PAQUETE_MAX + 1)), None, "más de 512 B no es un paquete");
        // BLE1109A: el flujo del canal rápido admite trozos mayores (hasta TROZO_MAX), nunca vacíos ni más.
        assert_eq!(trozo_de_hex(&"00".repeat(4096)).map(|b| b.len()), Some(4096));
        assert_eq!(trozo_de_hex(&"ab".repeat(crate::ble_l2cap::TROZO_MAX)).map(|b| b.len()), Some(crate::ble_l2cap::TROZO_MAX));
        assert_eq!(trozo_de_hex(&"00".repeat(crate::ble_l2cap::TROZO_MAX + 1)), None);
        assert_eq!(trozo_de_hex(""), None);
        assert_eq!(trozo_de_hex("0g"), None);
    }
}
