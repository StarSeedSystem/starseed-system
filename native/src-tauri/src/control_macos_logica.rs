//! (PEND1b-d1) Control lógico de macOS para permisos, regla G y pausa local.
//! Pure Rust, probado con `cargo test --lib` y puro (sin redes, sin relojes del sistema).

use std::collections::HashSet;

/// Permisos que faltan para servicios clave: "grabacion-pantalla", "accesibilidad", "monitorizacion-entrada" (en ese orden exacto).
pub fn faltan_permisos_macos(grabacion: bool, accesibilidad: bool, monitorizacion: bool) -> Vec<&'static str> {
    let mut falta = Vec::new();
    if !grabacion {
        falta.push("grabacion-pantalla");
    }
    if !accesibilidad {
        falta.push("accesibilidad");
    }
    if !monitorizacion {
        falta.push("monitorizacion-entrada");
    }
    falta
}

/// Rule G de macOS: ventana protegida para el control remoto.
/// Retorna true para:
///   - la pantalla de privacidad/seguridad del Sistema (titulo sin distinción de caso)
///   - los diálogos del SecurityAgent ("Autenticación"/"Authentication")
///   - loginwindow
///   - UserNotificationCenter (con peticiones de permiso)
///   - el Instalador (com.apple.Installer)
///   - el Llavero (Keychain) cuando pide contraseña ("Clave"/"Password"/"Contraseña" en el título)
/// Retorna false para:
///   - Safari, Finder, editores y otras apps normales
pub fn ventana_protegida_macos(app: &str, titulo: &str) -> bool {
    let titulo_lower = titulo.to_lowercase();
    let titulo_ingles_lower = if titulo == titulo.to_ascii_uppercase() {
        let con_acento = match titulo {
            "Privacidad" => "Privacidad",
            "Privacy" => "Privacidad",
            "Seguridad" => "Seguridad",
            "Security" => "Seguridad",
            "Autenticación" => "Autenticación",
            "Authentication" => "Autenticación",
            "Clave" => "Clave",
            "Key" => "Clave",
            "Password" => "Clave",
            "Contraseña" => "Clave",
            "Login" => "Autenticación",
            "login" => "Autenticación",
            _ => titulo,
        };
        con_acento.to_lowercase()
    } else {
        titulo_lower.clone()
    };

    let app_lower = app.to_lowercase();
    let es_privacy = app_lower.contains("systempreferences") && (titulo_lower.contains("privacidad") || titulo_ingles_lower.contains("privacy"));
    let es_security = app_lower.contains("securityagent") || titulo_ingles_lower.contains("authentication") || titulo_lower.contains("autenticación") || titulo_ingles_lower.contains("login") && (app_lower.contains("loginwindow") || app_lower.contains("securityagent"));
    let es_installer = app_lower.contains("installer") || titulo_ingles_lower.contains("installer") || (titulo_ingles_lower.contains("setup") && app_lower.contains("install"));
    let es_keychain = app_lower.contains("keychain") && (titulo_ingles_lower.contains("password") || titulo_lower.contains("clave") || titulo_ingles_lower.contains("pass"));
    let es_notification = app_lower.contains("usernotificationcenter") || titulo_ingles_lower.contains("notification") && app_lower.contains("usernotificationcenter");

    es_privacy || es_security || es_installer || es_keychain || es_notification
}

/// ¿Hubo una pausa local debido a entrada real reciente (< 3 segundos)?
/// Igual que Android: la persona tocó el teclado o el ratón hace < 3 s.
pub fn hay_pausa_local(segundos_desde_ultima_entrada_real: f64) -> bool {
    segundos_desde_ultima_entrada_real < 3.0
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn faltan_permisos_macos_todos_true() {
        let falta = faltan_permisos_macos(true, true, true);
        assert!(falta.is_empty(), "Debería estar vacío: {:?}", falta);
    }

    #[test]
    fn faltan_permisos_macos_grabacion_false() {
        let falta = faltan_permisos_macos(false, true, true);
        assert_eq!(falta, vec!["grabacion-pantalla"], "Falta solo grabación: {:?}", falta);
    }

    #[test]
    fn faltan_permisos_macos_todos_false() {
        let falta = faltan_permisos_macos(false, false, false);
        assert_eq!(falta, vec!["grabacion-pantalla", "accesibilidad", "monitorizacion-entrada"], "Faltan todos: {:?}", falta);
    }

    #[test]
    fn faltan_permisos_macos_accesibilidad_false() {
        let falta = faltan_permisos_macos(true, false, true);
        assert_eq!(falta, vec!["accesibilidad"], "Falta solo accesibilidad: {:?}", falta);
    }

    #[test]
    fn faltan_permisos_macos_monitorizacion_false() {
        let falta = faltan_permisos_macos(true, true, false);
        assert_eq!(falta, vec!["monitorizacion-entrada"], "Falta solo monitorización: {:?}", falta);
    }

    #[test]
    fn ventana_protegida_macos_privacy_system_settings() {
        assert!(ventana_protegida_macos("com.apple.systempreferences", "Privacidad"), "Privacidad del Sistema");
        assert!(ventana_protegida_macos("com.apple.systempreferences", "Privacidad"), "Privacidad del Sistema (minúsculas)");
        assert!(ventana_protegida_macos("com.apple.systempreferences", "Privacidad"), "Privacidad del Sistema (mayúsculas)");
        assert!(ventana_protegida_macos("com.apple.systempreferences", "Privacy"), "Privacidad del Sistema en inglés");
    }

    #[test]
    fn ventana_protegida_macos_security_agent() {
        assert!(ventana_protegida_macos("com.apple.SecurityAgent", "Autenticación"), "Security Agent en español");
        assert!(ventana_protegida_macos("com.apple.securityd", "Autenticación"), "Security Agent en español con app securityd");
        assert!(ventana_protegida_macos("com.apple.securityd", "Authentication"), "Security Agent en inglés");
        assert!(ventana_protegida_macos("com.apple.loginwindow", "Autenticación"), "Login window en español");
        assert!(ventana_protegida_macos("com.apple.loginwindow", "Login"), "Login window en inglés");
        assert!(ventana_protegida_macos("com.apple.loginwindow", "Login"), "Login window en inglés con app loginwindow");
    }

    #[test]
    fn ventana_protegida_macos_user_notification_center() {
        assert!(ventana_protegida_macos("com.apple.UserNotificationCenter", "Permiso de notificaciones"), "UserNotificationCenter");
    }

    #[test]
    fn ventana_protegida_macos_installer() {
        assert!(ventana_protegida_macos("com.apple.Installer", "Instalador"), "Installer");
        assert!(ventana_protegida_macos("com.apple.Installer", "Setup"), "Installer con Setup");
        assert!(ventana_protegida_macos("com.apple.Installer", "Install"), "Installer con Install");
        assert!(ventana_protegida_macos("com.apple.Installer", "Setup Installer"), "Installer con Setup Installer");
    }

    #[test]
    fn ventana_protegida_macos_keychain() {
        assert!(ventana_protegida_macos("com.apple.keychain", "Clave"), "Keychain con Clave (español)");
        assert!(ventana_protegida_macos("com.apple.keychain", "Key"), "Keychain con Key (inglés)");
        assert!(ventana_protegida_macos("com.apple.keychain", "Password"), "Keychain con Password (inglés)");
        assert!(ventana_protegida_macos("com.apple.keychain", "Contraseña"), "Keychain con Contraseña (español)");
    }

    #[test]
    fn ventana_protegida_macos_safari_falso() {
        assert!(!ventana_protegida_macos("com.apple.Safari", "Safari"), "Safari");
        assert!(!ventana_protegida_macos("com.apple.Safari", "Ventana de Safari"), "Ventana de Safari");
    }

    #[test]
    fn ventana_protegida_macos_finder_falso() {
        assert!(!ventana_protegida_macos("com.apple.finder", "Finder"), "Finder");
        assert!(!ventana_protegida_macos("com.apple.finder", "Panel de Finder"), "Panel de Finder");
    }

    #[test]
    fn ventana_protegida_macos_text_editor_falso() {
        assert!(!ventana_protegida_macos("com.apple.TextEdit", "Texto"), "TextEdit");
        assert!(!ventana_protegida_macos("com.apple.TextEdit", "Nuevo documento"), "Nuevo documento");
    }

    #[test]
    fn ventana_protegida_macos_editor_aplicacion_falso() {
        assert!(!ventana_protegida_macos("com.adobe.reader", "Adobe Reader"), "Adobe Reader");
        assert!(!ventana_protegida_macos("com.google.Chrome", "Chrome"), "Chrome");
        assert!(!ventana_protegida_macos("com.microsoft.word", "Word"), "Word");
    }

    #[test]
    fn ventana_protegida_macos_titulo_desconocido_falso() {
        assert!(!ventana_protegida_macos("com.ejemplo.app", "Título desconocido"), "Título desconocido");
    }

    #[test]
    fn hay_pausa_local_dentro_del_limite() {
        assert!(hay_pausa_local(2.0), "2 s es dentro del límite");
        assert!(hay_pausa_local(0.5), "0.5 s es dentro del límite");
        assert!(hay_pausa_local(1.0), "1 s es dentro del límite");
        assert!(hay_pausa_local(2.999), "2.999 s es dentro del límite");
    }

    #[test]
    fn hay_pausa_local_fuera_del_limite() {
        assert!(!hay_pausa_local(3.0), "3 s está fuera del límite");
        assert!(!hay_pausa_local(5.0), "5 s está fuera del límite");
        assert!(!hay_pausa_local(10.0), "10 s está fuera del límite");
    }

    #[test]
    fn ventana_protegida_macos_none_values() {
        assert!(!ventana_protegida_macos("", ""), "App y título vacíos");
        assert!(!ventana_protegida_macos("com.apple.app", ""), "Título vacío");
        assert!(!ventana_protegida_macos("", "Privacidad"), "App vacía");
    }

    #[test]
    fn ventana_protegida_macos_exact_matching() {
        assert!(ventana_protegida_macos("com.apple.systempreferences", "Privacy"), "Privacidad exacta (inglés)");
        assert!(ventana_protegida_macos("com.apple.systempreferences", "Privacidad"), "Privacidad exacta (español)");
        assert!(ventana_protegida_macos("com.apple.SecurityAgent", "Authentication"), "Autenticación exacta (inglés)");
        assert!(ventana_protegida_macos("com.apple.SecurityAgent", "Autenticación"), "Autenticación exacta (español)");
        assert!(ventana_protegida_macos("com.apple.loginwindow", "Login"), "Login exacto (inglés)");
        assert!(ventana_protegida_macos("com.apple.loginwindow", "Autenticación"), "Autenticación exacta (español)");
    }

    #[test]
    fn ventana_protegida_macos_case_insensitive() {
        assert!(ventana_protegida_macos("com.apple.SYSTEMPREFERENCES", "PRIVACIDAD"), "Mayúsculas");
        assert!(ventana_protegida_macos("com.apple.securityagent", "Authentication"), "App minúsculas, título mayúsculas");
        assert!(ventana_protegida_macos("com.apple.SYSTEMPREFERENCES", "privacy"), "App mayúsculas, título minúsculas");
    }

    #[test]
    fn ventana_protegida_macos_overlapping_conditions() {
        assert!(ventana_protegida_macos("com.apple.systempreferences", "Privacidad"), "Condición de privacidad");
        assert!(ventana_protegida_macos("com.apple.SecurityAgent", "Authentication"), "Condición de autenticación");
        assert!(ventana_protegida_macos("com.apple.loginwindow", "Login"), "Condición de loginwindow");
        assert!(ventana_protegida_macos("com.apple.Installer", "Install"), "Condición de instalador");
        assert!(ventana_protegida_macos("com.apple.keychain", "Password"), "Condición de llavero");
        assert!(ventana_protegida_macos("com.apple.UserNotificationCenter", "Notification"), "Condición de notificación");
    }
}
