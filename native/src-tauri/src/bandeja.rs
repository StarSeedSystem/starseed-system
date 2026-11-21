//! (CTL1119G) La bandeja del control: título, menú y actividad contra App Nap con la ventana
//! cerrada o en otro escritorio. «Reanudar» quita la pausa SIN traer la ventana al frente.
//! Contrato: architecture/control-remoto-entre-neuronas.md §2.4.

#![allow(dead_code)] // cada plataforma usa una parte

use tauri::AppHandle;

pub const MENU_REANUDAR: &str = "ss-control-reanudar";
pub const MENU_TERMINAR: &str = "ss-control-terminar";
pub const MENU_QUITAR: &str = "ss-control-quitar-permiso";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Accion {
    Reanudar,
    Terminar,
    QuitarPermiso,
    Ninguna,
}

/// El elemento pulsado, por su id. Un id desconocido no hace nada (el menú puede crecer).
pub fn accion_de_menu(id: &str) -> Accion {
    match id {
        MENU_REANUDAR => Accion::Reanudar,
        MENU_TERMINAR => Accion::Terminar,
        MENU_QUITAR => Accion::QuitarPermiso,
        _ => Accion::Ninguna,
    }
}

/// El título del icono: en pausa manda el aviso; si no, el nombre ENTERO de quien controla.
pub fn titulo_de_barra(nombre: &str, pausada: bool) -> String {
    if pausada {
        return "‖ Control en pausa · menú para reanudar".to_string();
    }
    let nombre = nombre.trim();
    if nombre.is_empty() {
        "● Controlada por otra neurona".to_string()
    } else {
        format!("● Controlada por {nombre}")
    }
}

/// Atiende el elemento pulsado. `true` si era nuestro. Reanudar NO muestra la ventana: solo llama
/// a `control_neuronas::reanudar`, que quita la pausa y avisa a la página donde esté.
pub fn atender_menu(app: &AppHandle, id: &str) -> bool {
    match accion_de_menu(id) {
        Accion::Reanudar => { crate::control_neuronas::reanudar(app, "la-persona-desde-la-bandeja"); true }
        Accion::Terminar => { crate::control_neuronas::parar(app, "la-persona-desde-la-bandeja"); true }
        Accion::QuitarPermiso => { crate::control_neuronas::apagar_interruptor(app, "la-persona-quito-el-permiso"); true }
        Accion::Ninguna => false,
    }
}

/// Sostiene (o suelta) la actividad que impide que App Nap frene el proceso. `sesion_activa`
/// incluye la pausa local: la sesión sigue viva y su reloj de 3 s tiene que correr.
pub fn sincronizar_actividad(sesion_activa: bool) {
    #[cfg(target_os = "macos")]
    {
        if sesion_activa {
            mac::empezar();
        } else {
            mac::terminar();
        }
    }
    #[cfg(not(target_os = "macos"))]
    let _ = sesion_activa;
}

#[cfg(target_os = "macos")]
mod mac {
    use objc2::rc::Retained;
    use objc2::runtime::ProtocolObject;
    use objc2_foundation::{NSActivityOptions, NSObjectProtocol, NSProcessInfo, NSString};
    use std::sync::Mutex;
    struct Actividad(Retained<ProtocolObject<dyn NSObjectProtocol>>);
    // El token es un objeto de Foundation que solo se entrega de vuelta a `endActivity`.
    unsafe impl Send for Actividad {}
    static ACTUAL: Mutex<Option<Actividad>> = Mutex::new(None);
    /// Evita App Nap y el frenado por inactividad mientras dura la sesión de control.
    pub fn empezar() {
        let mut a = ACTUAL.lock().unwrap_or_else(|e| e.into_inner());
        if a.is_some() {
            return;
        }
        let motivo = NSString::from_str("Control entre neuronas de StarSeed en curso");
        let token = NSProcessInfo::processInfo().beginActivityWithOptions_reason(
            NSActivityOptions::UserInitiated | NSActivityOptions::LatencyCritical,
            &motivo,
        );
        *a = Some(Actividad(token));
    }
    pub fn terminar() {
        let mut a = ACTUAL.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(act) = a.take() {
            // SAFETY: es el token que devolvió `beginActivityWithOptions_reason`, usado una vez.
            unsafe { NSProcessInfo::processInfo().endActivity(&act.0) };
        }
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;
    #[test]
    fn control_bandeja_reconoce_sus_elementos_y_no_recorta_el_nombre() {
        assert_eq!(accion_de_menu(MENU_REANUDAR), Accion::Reanudar);
        assert_eq!(accion_de_menu(MENU_TERMINAR), Accion::Terminar);
        assert_eq!(accion_de_menu(MENU_QUITAR), Accion::QuitarPermiso);
        for otro in ["ss-abrir", "ss-salir", "ss-antenas", "ss-control-info", ""] {
            assert_eq!(accion_de_menu(otro), Accion::Ninguna, "{otro}");
        }
        assert_eq!(titulo_de_barra("Neurona de Alex", false), "● Controlada por Neurona de Alex");
        assert_eq!(titulo_de_barra("  Neurona de Alex  ", false), "● Controlada por Neurona de Alex");
        assert_eq!(titulo_de_barra("", false), "● Controlada por otra neurona");
        assert_eq!(titulo_de_barra("Neurona de Alex", true), "‖ Control en pausa · menú para reanudar");
        let largo = "Neurona de Alex que vive en la mesa del salón y controla esta Mac";
        assert!(titulo_de_barra(largo, false).contains(largo), "el nombre no se recorta");
    }
}
