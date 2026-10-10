// ═══════════════════════════════════════════════════════════════════════════
// android — el lado Rust del servicio de antenas de Android (2026-10-10).
// Contrato: architecture/apps-nativas-segundo-plano.md §2.3.
// ---------------------------------------------------------------------------
// Kotlin (native/src-tauri/android/*.kt, inyectado por build.rs) y Rust se hablan
// con archivos JSON pequeños en `filesDir/starseed`:
//   · Kotlin → Rust: llama `PuenteNativo.iniciarGuardian(dir)` (JNI, abajo) al
//     arrancar el proceso; escribe `servicio.json` (vivo, motivo, permisos).
//   · Rust → Kotlin: `estado-antenas.json` (resumen para la notificación),
//     `segundo-plano.json` (preferencia) y `peticion.json` (p. ej. batería).
// Sin crates nuevos: el JNI se hace con la tabla de funciones de JNIEnv (índices
// fijos de jni.h: GetStringUTFChars = 169, ReleaseStringUTFChars = 170).
// Lo que no es JNI es puro y se prueba en cualquier sistema.
// ═══════════════════════════════════════════════════════════════════════════

#![allow(dead_code)]

use crate::antenas::{resumen, EstadoAntenas};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

pub const PREFERENCIA: &str = "segundo-plano.json";
pub const PETICION: &str = "peticion.json";
pub const SERVICIO: &str = "servicio.json";
pub const RESUMEN: &str = "estado-antenas.json";

static DIR: OnceLock<PathBuf> = OnceLock::new();

/// La carpeta que fijó Kotlin al arrancar el proceso (None si el parche no se aplicó).
pub fn dir_datos() -> Option<PathBuf> {
    DIR.get().cloned()
}

/// Preferencia compartida con Kotlin (por defecto encendida: es la petición de Alex).
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct PreferenciaAndroid {
    pub activo: bool,
    pub arranque: bool,
}

impl Default for PreferenciaAndroid {
    fn default() -> Self {
        PreferenciaAndroid { activo: true, arranque: true }
    }
}

/// Lo que escribe el servicio Kotlin (`servicio.json`).
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct ServicioAndroid {
    #[serde(default)]
    pub vivo: bool,
    #[serde(default)]
    pub motivo: String,
    #[serde(default)]
    pub desde_ms: u64,
    #[serde(default)]
    pub sdk: u32,
    #[serde(default)]
    pub bateria_exenta: bool,
    #[serde(default)]
    pub notificaciones: bool,
}

fn escribir_atomico(dir: &Path, nombre: &str, texto: &str) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let tmp = dir.join(format!("{nombre}.tmp"));
    std::fs::write(&tmp, texto).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, dir.join(nombre)).map_err(|e| e.to_string())
}

pub fn leer_preferencia(dir: &Path) -> PreferenciaAndroid {
    std::fs::read_to_string(dir.join(PREFERENCIA))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

pub fn guardar_preferencia(dir: &Path, p: PreferenciaAndroid) -> Result<(), String> {
    escribir_atomico(dir, PREFERENCIA, &serde_json::to_string(&p).map_err(|e| e.to_string())?)
}

/// None si el servicio nunca escribió (parche no aplicado o app recién instalada).
pub fn leer_servicio(dir: &Path) -> Option<ServicioAndroid> {
    std::fs::read_to_string(dir.join(SERVICIO)).ok().and_then(|t| serde_json::from_str(&t).ok())
}

/// Pide a Kotlin una acción que necesita una pantalla del sistema (solo «bateria» hoy).
pub fn pedir(dir: &Path, accion: &str, ahora_ms: u64) -> Result<(), String> {
    let j = serde_json::json!({ "accion": accion, "t": ahora_ms });
    escribir_atomico(dir, PETICION, &j.to_string())
}

/// JSON del resumen para la notificación (puro).
pub fn json_resumen(estado: &EstadoAntenas) -> String {
    let vivas: Vec<&str> = estado.antenas.iter().filter(|a| a.estado == "viva").map(|a| a.id.as_str()).collect();
    serde_json::json!({ "texto": resumen(estado), "vivas": vivas, "medido_ms": estado.medido_ms }).to_string()
}

static ULTIMO: Mutex<String> = Mutex::new(String::new());

/// Escribe el resumen solo si cambió el texto (la notificación no parpadea cada 15 s).
pub fn escribir_resumen(dir: &Path, estado: &EstadoAntenas) {
    let texto = resumen(estado);
    if let Ok(mut u) = ULTIMO.lock() {
        if *u == texto {
            return;
        }
        *u = texto;
    }
    let _ = escribir_atomico(dir, RESUMEN, &json_resumen(estado));
}

/// Arranca el guardián en `dir` (una sola vez por proceso) y engancha el resumen.
pub fn iniciar_en(dir: PathBuf) -> bool {
    if DIR.set(dir.clone()).is_err() {
        return true; // ya arrancado (Kotlin lo llama desde el proveedor, el servicio y el arranque)
    }
    let g = crate::antenas::Guardian::iniciar(dir.clone());
    let d = dir;
    g.al_cambiar(std::sync::Arc::new(move |e: &EstadoAntenas| escribir_resumen(&d, e)));
    true
}

/// `#[no_mangle]` exporta el símbolo de la librería aunque el módulo sea privado (referencia de
/// Rust); se deja `pub` igualmente para que nadie dude de que Kotlin lo encuentra.
#[cfg(target_os = "android")]
pub mod jni {
    use std::ffi::{c_char, c_void, CStr};

    type Env = *mut *const *const c_void;
    type GetUtf = unsafe extern "system" fn(Env, *mut c_void, *mut u8) -> *const c_char;
    type RelUtf = unsafe extern "system" fn(Env, *mut c_void, *const c_char);

    /// jstring → String con GetStringUTFChars/ReleaseStringUTFChars (jni.h, índices 169/170).
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

    /// `PuenteNativo.iniciarGuardian(dirDatos: String): Boolean` (Kotlin, @JvmStatic).
    #[no_mangle]
    pub extern "system" fn Java_app_starseed_nativa_PuenteNativo_iniciarGuardian(env: Env, _clase: *mut c_void, dir: *mut c_void) -> u8 {
        let Some(ruta) = (unsafe { texto(env, dir) }) else { return 0 };
        if ruta.is_empty() {
            return 0;
        }
        super::iniciar_en(std::path::PathBuf::from(ruta)) as u8
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn preferencia_por_defecto_encendida_e_ida_y_vuelta() {
        let dir = std::env::temp_dir().join(format!("ss-android-pref-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(leer_preferencia(&dir), PreferenciaAndroid { activo: true, arranque: true });
        guardar_preferencia(&dir, PreferenciaAndroid { activo: false, arranque: true }).unwrap();
        assert!(!leer_preferencia(&dir).activo);
        assert!(leer_servicio(&dir).is_none(), "sin servicio.json no se inventa un estado");
        std::fs::write(dir.join(SERVICIO), r#"{"vivo":true,"motivo":"ok","bateria_exenta":false}"#).unwrap();
        let s = leer_servicio(&dir).unwrap();
        assert!(s.vivo && !s.bateria_exenta && !s.notificaciones);
        pedir(&dir, "bateria", 5).unwrap();
        assert!(std::fs::read_to_string(dir.join(PETICION)).unwrap().contains("\"bateria\""));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn resumen_para_la_notificacion() {
        let e = EstadoAntenas::sin_guardian("x");
        let j: serde_json::Value = serde_json::from_str(&json_resumen(&e)).unwrap();
        assert_eq!(j["texto"], "Antenas: sin medir");
        assert!(j["vivas"].as_array().unwrap().is_empty());
    }
}
