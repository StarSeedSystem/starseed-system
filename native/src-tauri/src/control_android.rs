// ═══════════════════════════════════════════════════════════════════════════
// control_android — comandos nativos de Android para el control remoto (TRM1125I).
// ---------------------------------------------------------------------------
// Estos comandos se invocan desde la web (Aurora) y se implementan vía JNI/Kotlin
// en el lado Android. En plataformas no Android devuelven "no soportado".
// ═══════════════════════════════════════════════════════════════════════════

#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Respuesta genérica para comandos Android.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AndroidRespuesta<T> {
    pub disponible: bool,
    pub datos: Option<T>,
    pub error: Option<String>,
}

impl<T> AndroidRespuesta<T> {
    fn no_soportado() -> Self {
        AndroidRespuesta {
            disponible: false,
            datos: None,
            error: Some("Comando solo disponible en Android".to_string()),
        }
    }

    fn ok(datos: T) -> Self {
        AndroidRespuesta {
            disponible: true,
            datos: Some(datos),
            error: None,
        }
    }

    fn err(msg: String) -> Self {
        AndroidRespuesta {
            disponible: false,
            datos: None,
            error: Some(msg),
        }
    }
}

/// Estado del almacenamiento (android_almacen_estado).
#[tauri::command]
pub fn android_almacen_estado() -> AndroidRespuesta<Vec<AlmacenInfo>> {
    #[cfg(target_os = "android")]
    {
        // TODO(TRM1125I): implementar vía JNI/Kotlin
        AndroidRespuesta::err("No implementado aún".to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        AndroidRespuesta::no_soportado()
    }
}

/// Salud del disco (android_almacen_salud).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaludDisco {
    pub disco: String,
    pub salud: String,
    pub temperatura_c: Option<i32>,
}

#[tauri::command]
pub fn android_almacen_salud(disco: String) -> AndroidRespuesta<SaludDisco> {
    #[cfg(target_os = "android")]
    {
        // TODO(TRM1125I): implementar vía JNI/Kotlin
        AndroidRespuesta::err("No implementado aún".to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        AndroidRespuesta::no_soportado()
    }
}

/// Acceder a URI de almacenamiento (android_almacen_acceder).
#[tauri::command]
pub fn android_almacen_acceder(uri: String) -> AndroidRespuesta<bool> {
    #[cfg(target_os = "android")]
    {
        // TODO(TRM1125I): implementar vía JNI/Kotlin (StorageManager/Intent ACTION_OPEN_DOCUMENT_TREE)
        AndroidRespuesta::err("No implementado aún".to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        AndroidRespuesta::no_soportado()
    }
}

/// Abrir ajustes del sistema (android_ajustes_abrir).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AjustesResultado {
    pub abierto: bool,
    pub pantalla: String,
}

#[tauri::command]
pub fn android_ajustes_abrir(pantalla: String) -> AndroidRespuesta<AjustesResultado> {
    #[cfg(target_os = "android")]
    {
        // TODO(TRM1125I): implementar vía JNI/Kotlin (Settings.ACTION_* intents)
        AndroidRespuesta::err("No implementado aún".to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        AndroidRespuesta::no_soportado()
    }
}

/// Proyectar pantalla (android_pantalla_proyectar).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProyeccionResultado {
    pub sesion: String,
    pub activo: bool,
}

#[tauri::command(rename_all = "snake_case")]
pub fn android_pantalla_proyectar(calidad: Option<u32>, lado_max: Option<u32>) -> AndroidRespuesta<ProyeccionResultado> {
    #[cfg(target_os = "android")]
    {
        // TODO(TRM1125I): implementar vía JNI/Kotlin (MediaProjection API)
        AndroidRespuesta::err("No implementado aún".to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        AndroidRespuesta::no_soportado()
    }
}

/// Estado de accesibilidad (android_accesibilidad_estado).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccesibilidadEstado {
    pub servicios_activos: Vec<String>,
    pub nuestro_servicio_activo: bool,
}

#[tauri::command]
pub fn android_accesibilidad_estado() -> AndroidRespuesta<AccesibilidadEstado> {
    #[cfg(target_os = "android")]
    {
        // TODO(TRM1125I): implementar vía JNI/Kotlin (AccessibilityManager)
        AndroidRespuesta::err("No implementado aún".to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        AndroidRespuesta::no_soportado()
    }
}

/// Estado de superposición (android_superposicion_estado).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuperposicionEstado {
    pub permitido: bool,
}

#[tauri::command]
pub fn android_superposicion_estado() -> AndroidRespuesta<SuperposicionEstado> {
    #[cfg(target_os = "android")]
    {
        // TODO(TRM1125I): implementar vía JNI/Kotlin (Settings.canDrawOverlays)
        AndroidRespuesta::err("No implementado aún".to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        AndroidRespuesta::no_soportado()
    }
}

/// Estado de batería (android_bateria_estado).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BateriaEstado {
    pub nivel: u32,
    pub cargando: bool,
    pub salud: String,
    pub tecnologia: String,
    pub temperatura_c: Option<i32>,
    pub voltaje_mv: Option<i32>,
}

#[tauri::command]
pub fn android_bateria_estado() -> AndroidRespuesta<BateriaEstado> {
    #[cfg(target_os = "android")]
    {
        // TODO(TRM1125I): implementar vía JNI/Kotlin (BatteryManager)
        AndroidRespuesta::err("No implementado aún".to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        AndroidRespuesta::no_soportado()
    }
}

/// Estado de red (android_red_estado).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedEstado {
    pub tipo: String,
    pub conectado: bool,
    pub medido: bool,
    pub intensidad: Option<i32>,
    pub ssid: Option<String>,
}

#[tauri::command]
pub fn android_red_estado() -> AndroidRespuesta<RedEstado> {
    #[cfg(target_os = "android")]
    {
        // TODO(TRM1125I): implementar vía JNI/Kotlin (ConnectivityManager, WifiManager)
        AndroidRespuesta::err("No implementado aún".to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        AndroidRespuesta::no_soportado()
    }
}

/// Leer notificaciones (android_notificaciones_leer).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Notificacion {
    pub paquete: String,
    pub titulo: String,
    pub texto: String,
    pub tiempo_ms: i64,
}

#[tauri::command]
pub fn android_notificaciones_leer(limite: Option<u32>) -> AndroidRespuesta<Vec<Notificacion>> {
    #[cfg(target_os = "android")]
    {
        // TODO(TRM1125I): implementar vía JNI/Kotlin (NotificationListenerService)
        AndroidRespuesta::err("No implementado aún".to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        AndroidRespuesta::no_soportado()
    }
}

/// Toggle de ajustes rápidos (android_ajustes_rapidos_toggle).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TileToggleResultado {
    pub tile: String,
    pub activado: bool,
}

#[tauri::command]
pub fn android_ajustes_rapidos_toggle(tile: String, activar: bool) -> AndroidRespuesta<TileToggleResultado> {
    #[cfg(target_os = "android")]
    {
        // TODO(TRM1125I): implementar vía JNI/Kotlin (TileService, Settings.Secure)
        AndroidRespuesta::err("No implementado aún".to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        AndroidRespuesta::no_soportado()
    }
}

/// Información de almacenamiento (para android_almacen_estado).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlmacenInfo {
    pub uuid: String,
    pub nombre: String,
    pub tipo: String,
    pub ruta: String,
    pub total_bytes: u64,
    pub libre_bytes: u64,
    pub removible: bool,
    pub emulado: bool,
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn android_almacen_estado_no_soportado_fuera_de_android() {
        let r = android_almacen_estado();
        assert!(!r.disponible);
        assert!(r.error.as_ref().unwrap().contains("Android"));
    }

    #[test]
    fn android_bateria_estado_no_soportado_fuera_de_android() {
        let r = android_bateria_estado();
        assert!(!r.disponible);
        assert!(r.error.as_ref().unwrap().contains("Android"));
    }
}