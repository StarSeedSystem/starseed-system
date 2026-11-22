//! (PEND1) Lógica pura de permisos y regla G de macOS para el control entre neuronas.
//! Sin E/S: se prueba en cualquier sistema con `cargo test --lib control_macos_logica`.
//!
//! Contiene:
//!   · `faltan_permisos_macos`: qué permisos le faltan a la app en este Mac (orden fijo).
//!   · `ventana_protegida_macos`: REGLA G de macOS — ventanas donde la entrada remota se niega.
//!   · `hay_pausa_local`: pausa por entrada de la persona hace < 3 s (igual que Android).

/// Los tres permisos que macOS exige para el control remoto completo, en el orden que el contrato
/// y la interfaz esperan: Grabación de pantalla → Accesibilidad → Monitorización de entrada.
pub const PERMISOS_MACOS: [&str; 3] = ["grabacion-pantalla", "accesibilidad", "monitorizacion-entrada"];

/// Devuelve los permisos que FALTAN en este Mac, en el orden canónico:
/// `grabacion-pantalla`, `accesibilidad`, `monitorizacion-entrada`.
/// `grabacion` = tiene permiso de Grabación de pantalla.
/// `accesibilidad` = tiene permiso de Accesibilidad.
/// `monitorizacion` = tiene permiso de Monitorización de entrada.
pub fn faltan_permisos_macos(grabacion: bool, accesibilidad: bool, monitorizacion: bool) -> Vec<&'static str> {
    let mut v = Vec::new();
    if !grabacion {
        v.push("grabacion-pantalla");
    }
    if !accesibilidad {
        v.push("accesibilidad");
    }
    if !monitorizacion {
        v.push("monitorizacion-entrada");
    }
    v
}

/// REGLA G de macOS: devuelve `true` si la ventana al frente protege la entrada remota.
///
/// Protegidas (devuelven `true`):
/// - Ajustes del Sistema → pestaña «Privacidad» / «Privacy» (Privacidad y seguridad / Seguridad y privacidad)
/// - Diálogos de autenticación y permisos del sistema (SecurityAgent, «Autenticación», `loginwindow`,
///   UserNotificationCenter con peticiones de permiso)
/// - El Instalador
/// - El Llavero cuando pide contraseña
///
/// NO protegidas (devuelven `false`):
/// - Safari, Finder, editores, terminales, apps de usuario, etc.
///
/// La comparación ignora mayúsculas/minúsculas y acentos: se normaliza a minúsculas sin acentos.
pub fn ventana_protegida_macos(app: &str, titulo: &str) -> bool {
    let app_norm = normalizar(app);
    let titulo_norm = normalizar(titulo);

    // Paquetes protegidos (cualquier ventana de estos paquetes)
    const PAQUETES_PROTEGIDOS: [&str; 10] = [
        "app.starseed.os",
        "com.apple.systempreferences",
        "com.apple.systemsettings",
        "com.apple.securityagent",
        "com.apple.loginwindow",
        "com.apple.usernotificationcenter",
        "com.apple.installer",
        "com.apple.keychainaccess",
        "com.apple.coreservices.uiagent",
        "com.apple.accessibility.universalaccessauthwarn",
    ];

    if PAQUETES_PROTEGIDOS.contains(&app_norm.as_str()) {
        return true;
    }

    // Títulos protegidos (ventanas con estos títulos, sea cual sea la app)
    const TITULOS_PROTEGIDOS: [&str; 13] = [
        "privacidad",
        "privacy",
        "seguridad y privacidad",
        "security & privacy",
        "autenticacion",
        "authentication",
        "autenticación",
        "instalador",
        "installer",
        "llavero",
        "keychain",
        "accesibilidad",
        "accessibility",
    ];

    for t in TITULOS_PROTEGIDOS {
        if titulo_norm.contains(t) {
            return true;
        }
    }

    false
}

/// Normaliza una cadena: minúsculas y quita acentos (solo los comunes en español/inglés).
fn normalizar(s: &str) -> String {
    s.to_lowercase()
        .replace('á', "a")
        .replace('é', "e")
        .replace('í', "i")
        .replace('ó', "o")
        .replace('ú', "u")
        .replace('ñ', "n")
        .replace('ü', "u")
        .replace('à', "a")
        .replace('è', "e")
        .replace('ì', "i")
        .replace('ò', "o")
        .replace('ù', "u")
}

/// Pausa local: `true` si hubo entrada real de la persona hace menos de 3 segundos.
/// Igual que Android (PAUSA_LOCAL_MS = 3000).
pub const PAUSA_LOCAL_MS: u64 = 3_000;

/// `segundos_desde_ultima_entrada_real`: segundos transcurridos desde el último evento
/// de entrada física (ratón, teclado, touchpad) de la persona.
/// Devuelve `true` si < 3.0 (pausa activa), `false` si ≥ 3.0.
pub fn hay_pausa_local(segundos_desde_ultima_entrada_real: f64) -> bool {
    segundos_desde_ultima_entrada_real < 3.0
}

#[cfg(test)]
mod pruebas {
    use super::*;

    // ─────────── faltan_permisos_macos ───────────

    #[test]
    fn los_ocho_estados_de_permisos_devuelven_el_vector_correcto() {
        // 000: ninguno
        assert_eq!(
            faltan_permisos_macos(false, false, false),
            vec!["grabacion-pantalla", "accesibilidad", "monitorizacion-entrada"]
        );
        // 001: solo monitorización
        assert_eq!(
            faltan_permisos_macos(false, false, true),
            vec!["grabacion-pantalla", "accesibilidad"]
        );
        // 010: solo accesibilidad
        assert_eq!(
            faltan_permisos_macos(false, true, false),
            vec!["grabacion-pantalla", "monitorizacion-entrada"]
        );
        // 011: accesibilidad + monitorización
        assert_eq!(
            faltan_permisos_macos(false, true, true),
            vec!["grabacion-pantalla"]
        );
        // 100: solo grabación
        assert_eq!(
            faltan_permisos_macos(true, false, false),
            vec!["accesibilidad", "monitorizacion-entrada"]
        );
        // 101: grabación + monitorización
        assert_eq!(
            faltan_permisos_macos(true, false, true),
            vec!["accesibilidad"]
        );
        // 110: grabación + accesibilidad
        assert_eq!(
            faltan_permisos_macos(true, true, false),
            vec!["monitorizacion-entrada"]
        );
        // 111: todos
        assert_eq!(faltan_permisos_macos(true, true, true), Vec::<&str>::new());
    }

    #[test]
    fn el_orden_siempre_es_grabacion_accesibilidad_monitorizacion() {
        // Aunque falten solo los dos últimos, el orden se respeta
        let v = faltan_permisos_macos(true, false, false);
        assert_eq!(v, vec!["accesibilidad", "monitorizacion-entrada"]);
        // Aunque falte solo el del medio
        let v = faltan_permisos_macos(true, false, true);
        assert_eq!(v, vec!["accesibilidad"]);
        // Aunque falte solo el primero
        let v = faltan_permisos_macos(false, true, true);
        assert_eq!(v, vec!["grabacion-pantalla"]);
    }

    // ─────────── ventana_protegida_macos ───────────

    #[test]
    fn paquetes_protegidos_entran_en_true() {
        for pkg in [
            "app.starseed.os",
            "com.apple.systempreferences",
            "com.apple.systemsettings",
            "com.apple.securityagent",
            "com.apple.loginwindow",
            "com.apple.usernotificationcenter",
            "com.apple.installer",
            "com.apple.keychainaccess",
            "com.apple.coreservices.uiagent",
            "com.apple.accessibility.universalaccessauthwarn",
        ] {
            assert!(ventana_protegida_macos(pkg, ""), "paquete {pkg} debe ser protegido");
            assert!(ventana_protegida_macos(pkg, "ventana cualquiera"), "paquete {pkg} con título");
            // Mayúsculas no importan
            assert!(ventana_protegida_macos(&pkg.to_uppercase(), ""), "mayúsculas {pkg}");
        }
    }

    #[test]
    fn titulos_protegidos_entran_en_true() {
        for titulo in [
            "Privacidad",
            "PRIVACIDAD",
            "privacy",
            "Privacy",
            "Seguridad y Privacidad",
            "Security & Privacy",
            "Autenticación",
            "autenticación",
            "Authentication",
            "Instalador",
            "installer",
            "Llavero",
            "llavero",
            "Keychain",
            "Accesibilidad",
            "accessibility",
        ] {
            assert!(ventana_protegida_macos("com.apple.finder", titulo), "título {titulo} debe proteger");
            assert!(ventana_protegida_macos("com.ejemplo.app", titulo), "título {titulo} en otra app");
        }
    }

    #[test]
    fn acentos_y_mayusculas_no_importan() {
        assert!(ventana_protegida_macos("com.apple.systempreferences", "PRIVACIDAD"));
        assert!(ventana_protegida_macos("com.apple.systempreferences", "Seguridad y Privacidad"));
        assert!(ventana_protegida_macos("com.apple.systempreferences", "Autenticación"));
        assert!(ventana_protegida_macos("COM.APPLE.SYSTEMPREFERENCES", "privacidad"));
    }

    #[test]
    fn apps_comunes_no_son_protegidas() {
        for (app, titulo) in [
            ("com.apple.safari", "Google"),
            ("com.apple.finder", "Escritorio"),
            ("com.microsoft.vscode", "Código"),
            ("com.apple.terminal", "terminal"),
            ("com.jetbrains.intellij", "Proyecto"),
            ("org.mozilla.firefox", "Mozilla"),
            ("com.google.chrome", "Chrome"),
            ("com.sublimetext.4", "Sublime"),
            ("com.panic.transmit", "Transmit"),
            ("com.1password.1password", "1Password"),
            ("com.apple.mail", "Correo"),
            ("com.apple.calendar", "Calendario"),
        ] {
            assert!(
                !ventana_protegida_macos(app, titulo),
                "app={app} titulo={titulo} NO debe ser protegida"
            );
        }
    }

    #[test]
    fn titulo_parcial_con_palabra_protegida_cuenta() {
        // "Preferencias de Privacidad" contiene "privacidad"
        assert!(ventana_protegida_macos("com.apple.finder", "Preferencias de Privacidad"));
        // "Configuración de Seguridad y Privacidad" contiene "seguridad y privacidad"
        assert!(ventana_protegida_macos("com.apple.finder", "Configuración de Seguridad y Privacidad"));
        // "Ventana de Autenticación del Sistema" contiene "autenticación"
        assert!(ventana_protegida_macos("com.apple.finder", "Ventana de Autenticación del Sistema"));
    }

    // ─────────── hay_pausa_local ───────────

    #[test]
    fn pausa_activa_si_menos_de_3_segundos() {
        assert!(hay_pausa_local(0.0));
        assert!(hay_pausa_local(0.5));
        assert!(hay_pausa_local(1.0));
        assert!(hay_pausa_local(2.9));
        assert!(hay_pausa_local(2.999));
    }

    #[test]
    fn pausa_inactiva_si_3_segundos_o_mas() {
        assert!(!hay_pausa_local(3.0));
        assert!(!hay_pausa_local(3.1));
        assert!(!hay_pausa_local(5.0));
        assert!(!hay_pausa_local(10.0));
        assert!(!hay_pausa_local(100.0));
    }

    #[test]
    fn bordes_exactos() {
        // Justo en 3.0: NO hay pausa (igual que Android: "hace < 3 s")
        assert!(!hay_pausa_local(3.0));
        // Epsilon por debajo
        assert!(hay_pausa_local(2.999999));
        // Epsilon por encima
        assert!(!hay_pausa_local(3.000001));
    }
}