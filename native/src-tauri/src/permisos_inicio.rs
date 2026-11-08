// ═══════════════════════════════════════════════════════════════════════════
// permisos_inicio — permisos «del primer arranque» y pantalla completa de la VENTANA (PER1108A, 2026-11-08).
// Contrato: architecture/red-sin-dependencias.md §4 «Permisos y antenas desde la instalación».
// ---------------------------------------------------------------------------
// Dos cosas pequeñas que el asistente de permisos (src/lib/nativa/permisos-inicio.ts) necesita y que
// la web sola no puede:
//   · Android: pedir en tiempo de ejecución micrófono, cámara y notificaciones, abrir «Instalar apps
//     desconocidas» y la exención de batería. La web los pide a Kotlin por el archivo `peticion.json`
//     (como ya hace «bateria» y «ajustes»); Kotlin los contesta en `servicio.json`. Lo de Bluetooth y
//     Wi-Fi directo ya tiene su propio camino (ble_pedir_permiso, enlace_wifi_permiso): no se duplica.
//   · Escritorio: pantalla completa de la VENTANA (no la API web de pantalla completa de un elemento,
//     que en WKWebView deja un marcador borroso en la ventana y, tras un relanzamiento, la congelaba).
// Lo de decidir es puro (se prueba sin Tauri); los comandos van al final.
// ═══════════════════════════════════════════════════════════════════════════

use serde::Serialize;

/// Permisos que Kotlin sabe pedir por `peticion.json` (`permiso:<id>`).
pub const PERMISOS_ANDROID: [&str; 5] = ["microfono", "camara", "notificaciones", "instalar", "bateria"];

/// ¿Es un permiso que se puede pedir a Kotlin? (Nada de la web llega a Android si no está en la lista.)
pub fn permiso_valido(id: &str) -> bool {
    PERMISOS_ANDROID.contains(&id)
}

/// La acción que se escribe en `peticion.json`. «bateria» conserva su nombre de siempre.
pub fn accion_android(id: &str) -> Option<String> {
    if !permiso_valido(id) {
        return None;
    }
    Some(if id == "bateria" { "bateria".to_string() } else { format!("permiso:{id}") })
}

/// Lo que la web lee para saber qué puede pedir y cómo está cada cosa en Android (en el resto, vacío).
#[derive(Serialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct EstadoPermisosInicio {
    pub version: u32,
    /// `std::env::consts::OS`.
    pub plataforma: String,
    /// Android: el servicio escribió su estado (si no, la app es un APK sin el parche).
    pub puente_android: bool,
    pub microfono: bool,
    pub camara: bool,
    pub notificaciones: bool,
    pub instalar_apps: bool,
    pub bateria_exenta: bool,
}

/// Sube si cambia lo que la app sabe pedir (la web lo compara con su versión del asistente).
pub const VERSION_PERMISOS_INICIO: u32 = 1;

/// Estado de Android a partir de lo que escribió Kotlin. Pura.
pub fn estado_desde_servicio(plataforma: &str, servicio: Option<&crate::android::ServicioAndroid>) -> EstadoPermisosInicio {
    let mut e = EstadoPermisosInicio { version: VERSION_PERMISOS_INICIO, plataforma: plataforma.to_string(), ..Default::default() };
    if let Some(s) = servicio {
        e.puente_android = true;
        e.microfono = s.microfono;
        e.camara = s.camara;
        e.notificaciones = s.notificaciones;
        e.instalar_apps = s.instalar_apps;
        e.bateria_exenta = s.bateria_exenta;
    }
    e
}

#[tauri::command]
pub fn permisos_inicio_estado() -> EstadoPermisosInicio {
    let plataforma = std::env::consts::OS;
    #[cfg(target_os = "android")]
    {
        let servicio = crate::android::dir_datos().and_then(|d| crate::android::leer_servicio(&d));
        return estado_desde_servicio(plataforma, servicio.as_ref());
    }
    #[cfg(not(target_os = "android"))]
    {
        estado_desde_servicio(plataforma, None)
    }
}

/// Android: pide a Kotlin el permiso `permiso` (uno cada vez; el resultado llega en `servicio.json`).
#[tauri::command]
pub fn permisos_inicio_pedir(permiso: String) -> Result<bool, String> {
    let accion = accion_android(&permiso).ok_or_else(|| format!("No sé pedir el permiso «{permiso}»."))?;
    #[cfg(target_os = "android")]
    {
        let dir = crate::android::dir_datos().ok_or("Este APK no trae el puente con Android para pedir permisos.")?;
        let ahora = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        crate::android::pedir(&dir, &accion, ahora)?;
        Ok(true)
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = accion;
        Err("Estos permisos se piden solo en Android; en escritorio los pide el propio sistema al usarlos.".into())
    }
}

/// Escritorio: pantalla completa de la ventana principal. En Android no hay ventana que ampliar.
#[tauri::command]
pub fn ventana_pantalla_completa(app: tauri::AppHandle, activo: bool) -> Result<bool, String> {
    #[cfg(desktop)]
    {
        use tauri::Manager;
        let v = app.get_webview_window("main").ok_or("No hay ventana principal.")?;
        v.set_fullscreen(activo).map_err(|e| format!("No se pudo cambiar la pantalla completa: {e}"))?;
        Ok(activo)
    }
    #[cfg(not(desktop))]
    {
        let _ = (app, activo);
        Err("La pantalla completa de la ventana es solo de escritorio.".into())
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn solo_los_permisos_de_la_lista() {
        for p in PERMISOS_ANDROID {
            assert!(permiso_valido(p), "{p}");
        }
        assert!(!permiso_valido(""));
        assert!(!permiso_valido("ubicacion"));
        assert!(!permiso_valido("microfono; rm -rf"));
        assert!(!permiso_valido("MICROFONO"));
    }

    #[test]
    fn la_accion_de_kotlin() {
        assert_eq!(accion_android("microfono").as_deref(), Some("permiso:microfono"));
        assert_eq!(accion_android("instalar").as_deref(), Some("permiso:instalar"));
        assert_eq!(accion_android("bateria").as_deref(), Some("bateria"));
        assert_eq!(accion_android("otra"), None);
    }

    #[test]
    fn sin_servicio_todo_en_falso() {
        let e = estado_desde_servicio("macos", None);
        assert_eq!(e.version, VERSION_PERMISOS_INICIO);
        assert_eq!(e.plataforma, "macos");
        assert!(!e.puente_android && !e.microfono && !e.camara && !e.notificaciones && !e.instalar_apps && !e.bateria_exenta);
    }

    #[test]
    fn con_servicio_copia_lo_que_dijo_kotlin() {
        let s = crate::android::ServicioAndroid {
            vivo: true,
            microfono: true,
            notificaciones: true,
            bateria_exenta: true,
            ..Default::default()
        };
        let e = estado_desde_servicio("android", Some(&s));
        assert!(e.puente_android && e.microfono && e.notificaciones && e.bateria_exenta);
        assert!(!e.camara && !e.instalar_apps);
    }

    #[test]
    fn el_servicio_viejo_sin_campos_nuevos_se_lee() {
        let s: crate::android::ServicioAndroid =
            serde_json::from_str(r#"{"vivo":true,"motivo":"ok","bateria_exenta":false}"#).unwrap();
        assert!(!s.microfono && !s.camara && !s.instalar_apps);
    }

    #[test]
    fn en_escritorio_pedir_no_aplica() {
        #[cfg(not(target_os = "android"))]
        {
            assert!(permisos_inicio_pedir("microfono".into()).is_err());
            assert!(permisos_inicio_pedir("nada".into()).unwrap_err().contains("nada"));
        }
    }
}
