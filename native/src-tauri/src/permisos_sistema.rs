// ═══════════════════════════════════════════════════════════════════════════
// permisos_sistema — estado REAL de los permisos del sistema y la pantalla EXACTA de Ajustes donde se dan
// (PER1111S, 2026-11-11). Contrato: architecture/permisos-y-control-del-dispositivo.md §2 y §5.
// ---------------------------------------------------------------------------
// La lista de permisos de cada neurona (src/lib/nativa/permisos-registro.ts) pregunta aquí tres cosas:
//   · `permisos_sistema_estado`: cómo está cada permiso que este sistema deja LEER (solo leer: nada de
//     esto abre avisos). Lo que el sistema no deja leer no sale («desconocido» en la web, y se dice).
//   · `permisos_sistema_pedir`: los avisos que el PROPIO sistema enseña a la persona (macOS: Accesibilidad
//     con `AXIsProcessTrustedWithOptions`, Grabación de pantalla con `CGRequestScreenCaptureAccess`,
//     Monitorización de entrada con `IOHIDRequestAccess`). Son las API públicas de Apple para eso.
//   · `permisos_sistema_abrir`: la pantalla de Ajustes de ese permiso (direcciones fijas; nada de la web
//     llega a un proceso).
// REGLA (no negociable, contrato §1): la app NUNCA se concede nada a sí misma. Ni escribe en la base de
// datos de permisos del sistema (TCC.db en macOS), ni usa interfaces privadas, ni pulsa por guion los
// diálogos del sistema, ni cambia ajustes de Android por `adb`/`pm grant`. Pide, abre la pantalla y mira.
// Lo de decidir es puro (se prueba sin Tauri); lo que toca el sistema va en módulos por plataforma.
// ═══════════════════════════════════════════════════════════════════════════

// Las piezas puras se usan según la plataforma (Android, macOS) y en las pruebas.
#![allow(dead_code)]

use serde::Serialize;
use std::collections::BTreeMap;

/// Sube si cambia lo que esta lectura sabe decir (la web lo guarda con la lista).
pub const VERSION_PERMISOS_SISTEMA: u32 = 1;

/// Estados que se devuelven. «no-concedido»: el sistema no distingue «negado» de «nunca preguntado»
/// (Accesibilidad de macOS). «no-aplica»: en este sistema no hace falta pedirlo.
pub const ESTADOS: [&str; 5] = ["concedido", "denegado", "sin-preguntar", "no-concedido", "no-aplica"];

/// Los permisos con pantalla de Ajustes que la app sabe abrir, por sistema. Pura.
/// macOS: Ajustes del Sistema › Privacidad y seguridad (las anclas `Privacy_*` funcionan de macOS 13 a 15;
/// en 13+ también las acepta el panel nuevo). Windows: `ms-settings:` de la Configuración.
/// Android: el identificador lo traduce Kotlin a la pantalla exacta (`panel:<id>`).
pub fn panel(plataforma: &str, id: &str) -> Option<&'static str> {
    Some(match (plataforma, id) {
        ("macos", "accesibilidad") => "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
        ("macos", "pantalla") => "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
        ("macos", "monitor-entrada") => "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent",
        ("macos", "automatizacion") => "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation",
        ("macos", "disco-completo") => "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles",
        ("macos", "bluetooth") => "x-apple.systempreferences:com.apple.preference.security?Privacy_Bluetooth",
        ("macos", "microfono") => "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
        ("macos", "camara") => "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera",
        ("macos", "ubicacion-wifi") => "x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices",
        ("macos", "red-local") => "x-apple.systempreferences:com.apple.preference.security?Privacy_LocalNetwork",
        ("macos", "notificaciones") => "x-apple.systempreferences:com.apple.preference.notifications",
        ("macos", "arranque") => "x-apple.systempreferences:com.apple.LoginItems-Settings.extension",
        ("windows", "microfono") => "ms-settings:privacy-microphone",
        ("windows", "camara") => "ms-settings:privacy-webcam",
        ("windows", "ubicacion-wifi") => "ms-settings:privacy-location",
        ("windows", "notificaciones") => "ms-settings:notifications",
        ("windows", "arranque") => "ms-settings:startupapps",
        ("windows", "bluetooth") => "ms-settings:bluetooth",
        ("android", x) if PANELES_ANDROID.contains(&x) => "android",
        _ => return None,
    })
}

/// Pantallas de Android que Kotlin sabe abrir con `panel:<id>` (ArranqueStarSeed.kt › abrirPanel).
pub const PANELES_ANDROID: [&str; 8] =
    ["accesibilidad", "superposicion", "no-molestar", "escribir-ajustes", "todos-archivos", "notificaciones", "bateria", "app"];

/// La acción que se escribe en `peticion.json` para abrir una pantalla de Android. Pura.
pub fn accion_panel_android(id: &str) -> Option<String> {
    if !PANELES_ANDROID.contains(&id) {
        return None;
    }
    Some(if id == "bateria" { "bateria".to_string() } else { format!("panel:{id}") })
}

/// Permisos que el propio sistema pregunta con su aviso cuando la app lo pide (`permisos_sistema_pedir`).
pub const AVISOS_MACOS: [&str; 3] = ["accesibilidad", "pantalla", "monitor-entrada"];

/// Sesión gráfica de Linux, de las variables de entorno. Pura.
pub fn sesion_linux(xdg_session_type: Option<&str>, wayland_display: Option<&str>) -> &'static str {
    match xdg_session_type.map(|s| s.trim().to_ascii_lowercase()) {
        Some(s) if s == "wayland" => "wayland",
        Some(s) if s == "x11" => "x11",
        _ => {
            if wayland_display.map(|w| !w.trim().is_empty()).unwrap_or(false) {
                "wayland"
            } else {
                "x11"
            }
        }
    }
}

/// `AVAuthorizationStatus` / `CBManagerAuthorization` / `CLAuthorizationStatus` (los tres usan 0 = sin
/// preguntar, 1 = restringido, 2 = negado; 3 y 4 = concedido). Pura.
pub fn estado_de_autorizacion(n: i64) -> &'static str {
    match n {
        0 => "sin-preguntar",
        1 | 2 => "denegado",
        3 | 4 => "concedido",
        _ => "no-concedido",
    }
}

/// `IOHIDAccessType`: 0 concedido, 1 negado, 2 desconocido (sin preguntar). Pura.
pub fn estado_de_iohid(n: u32) -> &'static str {
    match n {
        0 => "concedido",
        1 => "denegado",
        _ => "sin-preguntar",
    }
}

/// Lo que la web lee: un estado por permiso que se pudo leer. Lo que no se pudo leer, no está.
#[derive(Serialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct EstadoPermisosSistema {
    pub version: u32,
    /// `std::env::consts::OS`.
    pub plataforma: String,
    /// Linux: «x11» | «wayland». Vacío en el resto.
    pub sesion: String,
    pub estados: BTreeMap<String, String>,
    /// Ids cuyo panel de Ajustes sabe abrir esta app aquí.
    pub paneles: Vec<String>,
}

/// Estados de Android a partir de lo que escribió Kotlin (los campos nuevos de PER1111S son opcionales:
/// un APK anterior no los escribe y entonces no se dice nada de ellos). Pura.
pub fn estados_android(s: Option<&crate::android::ServicioAndroid>) -> BTreeMap<String, String> {
    let mut m = BTreeMap::new();
    let Some(s) = s else { return m };
    let b = |v: bool| if v { "concedido" } else { "no-concedido" }.to_string();
    m.insert("microfono".into(), b(s.microfono));
    m.insert("camara".into(), b(s.camara));
    m.insert("notificaciones".into(), b(s.notificaciones));
    m.insert("instalar".into(), b(s.instalar_apps));
    m.insert("bateria".into(), b(s.bateria_exenta));
    for (id, v) in [
        ("superposicion", s.superposicion),
        ("no-molestar", s.no_molestar),
        ("escribir-ajustes", s.escribir_ajustes),
        ("todos-archivos", s.todos_archivos),
        ("ubicacion", s.ubicacion),
    ] {
        if let Some(v) = v {
            m.insert(id.into(), b(v));
        }
    }
    m
}

/// Lo que es igual en todos los sistemas: leer las capacidades del aparato no pide nada.
fn comunes(m: &mut BTreeMap<String, String>) {
    m.insert("capacidades".into(), "no-aplica".into());
}

fn paneles_de(plataforma: &str) -> Vec<String> {
    const IDS: [&str; 20] = [
        "accesibilidad", "pantalla", "monitor-entrada", "automatizacion", "disco-completo", "bluetooth", "microfono",
        "camara", "ubicacion-wifi", "red-local", "notificaciones", "arranque", "superposicion", "no-molestar",
        "escribir-ajustes", "todos-archivos", "bateria", "app", "instalar", "ubicacion",
    ];
    IDS.iter().filter(|id| panel(plataforma, id).is_some()).map(|s| s.to_string()).collect()
}

#[tauri::command]
pub fn permisos_sistema_estado() -> EstadoPermisosSistema {
    let plataforma = std::env::consts::OS.to_string();
    let mut estados = BTreeMap::new();
    comunes(&mut estados);
    #[allow(unused_mut)]
    let mut sesion = String::new();
    #[cfg(target_os = "macos")]
    macos::leer(&mut estados);
    #[cfg(target_os = "android")]
    {
        let servicio = crate::android::dir_datos().and_then(|d| crate::android::leer_servicio(&d));
        estados.extend(estados_android(servicio.as_ref()));
    }
    #[cfg(target_os = "linux")]
    {
        let s = sesion_linux(std::env::var("XDG_SESSION_TYPE").ok().as_deref(), std::env::var("WAYLAND_DISPLAY").ok().as_deref());
        sesion.push_str(s);
        // X11 no aísla nada: capturar la pantalla y mandar teclas no piden permiso (contrato §2.4).
        if s == "x11" {
            estados.insert("pantalla".into(), "no-aplica".into());
            estados.insert("accesibilidad".into(), "no-aplica".into());
        }
    }
    #[cfg(target_os = "windows")]
    {
        // Una app de escritorio de Windows captura la pantalla y manda entrada sin pedir nada (salvo a
        // ventanas elevadas: UIPI). Contrato §2.3.
        estados.insert("pantalla".into(), "no-aplica".into());
        estados.insert("accesibilidad".into(), "no-aplica".into());
    }
    EstadoPermisosSistema { version: VERSION_PERMISOS_SISTEMA, paneles: paneles_de(&plataforma), plataforma, sesion, estados }
}

/// Enseña el aviso del PROPIO sistema para `id` (solo los de `AVISOS_MACOS`). Devuelve si ya estaba concedido.
#[tauri::command]
pub fn permisos_sistema_pedir(id: String) -> Result<bool, String> {
    if !AVISOS_MACOS.contains(&id.as_str()) {
        return Err(format!("«{id}» no tiene un aviso del sistema que la app pueda enseñar: se abre su pantalla de Ajustes."));
    }
    #[cfg(target_os = "macos")]
    {
        macos::pedir(&id)
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("Estos avisos son de macOS.".into())
    }
}

/// Abre la pantalla de Ajustes del sistema donde se da (o se quita) el permiso `id`.
#[tauri::command]
pub fn permisos_sistema_abrir(id: String) -> Result<bool, String> {
    let plataforma = std::env::consts::OS;
    let destino = panel(plataforma, &id).ok_or_else(|| format!("No sé qué pantalla de Ajustes abrir para «{id}» en este sistema."))?;
    #[cfg(target_os = "android")]
    {
        let _ = destino;
        let accion = accion_panel_android(&id).ok_or("Pantalla de Android desconocida.")?;
        let dir = crate::android::dir_datos().ok_or("Este APK no trae el puente con Android para abrir sus ajustes.")?;
        let ahora = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0);
        crate::android::pedir(&dir, &accion, ahora)?;
        Ok(true)
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("/usr/bin/open")
            .arg(destino)
            .spawn()
            .map(|_| true)
            .map_err(|e| format!("No se pudieron abrir los Ajustes del Sistema: {e}"))
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer.exe")
            .arg(destino)
            .spawn()
            .map(|_| true)
            .map_err(|e| format!("No se pudo abrir la Configuración de Windows: {e}"))
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "android")))]
    {
        let _ = destino;
        Err("Este sistema no tiene una pantalla de ajustes que la app sepa abrir.".into())
    }
}

#[cfg(target_os = "macos")]
mod macos {
    //! Solo API públicas y documentadas de Apple, buscadas con `dlsym` para que un símbolo que falte en una
    //! versión vieja de macOS dé «sin dato» y no un cierre. Nada de esto concede: lee o pide el aviso.
    use std::collections::BTreeMap;
    use std::ffi::{c_char, c_void, CStr};

    use objc2::runtime::AnyClass;
    use objc2::{msg_send, sel};
    use objc2_foundation::NSString;

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {}
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {}
    #[link(name = "IOKit", kind = "framework")]
    extern "C" {}
    #[link(name = "AVFoundation", kind = "framework")]
    extern "C" {}
    #[link(name = "CoreLocation", kind = "framework")]
    extern "C" {}
    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {}

    extern "C" {
        fn dlsym(handle: *mut c_void, simbolo: *const c_char) -> *mut c_void;
    }
    const RTLD_DEFAULT: *mut c_void = -2isize as *mut c_void;

    fn simbolo(nombre: &CStr) -> Option<*mut c_void> {
        let p = unsafe { dlsym(RTLD_DEFAULT, nombre.as_ptr()) };
        (!p.is_null()).then_some(p)
    }

    /// `kIOHIDRequestTypeListenEvent`.
    const ESCUCHAR_EVENTOS: u32 = 1;

    fn ax_confiable() -> Option<bool> {
        let f: extern "C" fn() -> bool = unsafe { std::mem::transmute(simbolo(c"AXIsProcessTrusted")?) };
        Some(f())
    }

    fn pantalla_concedida() -> Option<bool> {
        let f: extern "C" fn() -> bool = unsafe { std::mem::transmute(simbolo(c"CGPreflightScreenCaptureAccess")?) };
        Some(f())
    }

    fn iohid(tipo: u32) -> Option<u32> {
        let f: extern "C" fn(u32) -> u32 = unsafe { std::mem::transmute(simbolo(c"IOHIDCheckAccess")?) };
        Some(f(tipo))
    }

    fn clase_entero(clase: &CStr, selector: objc2::runtime::Sel, arg: Option<&str>) -> Option<i64> {
        let cls = AnyClass::get(clase)?;
        let responde: bool = unsafe { msg_send![cls, respondsToSelector: selector] };
        if !responde {
            return None;
        }
        Some(match arg {
            Some(a) => {
                let s = NSString::from_str(a);
                let n: isize = unsafe { msg_send![cls, authorizationStatusForMediaType: &*s] };
                n as i64
            }
            None if selector == sel!(authorization) => {
                let n: isize = unsafe { msg_send![cls, authorization] };
                n as i64
            }
            None => {
                let n: i32 = unsafe { msg_send![cls, authorizationStatus] };
                n as i64
            }
        })
    }

    pub fn leer(m: &mut BTreeMap<String, String>) {
        use super::{estado_de_autorizacion, estado_de_iohid};
        if let Some(ok) = ax_confiable() {
            // macOS no distingue «negado» de «nunca preguntado» en Accesibilidad.
            m.insert("accesibilidad".into(), if ok { "concedido" } else { "no-concedido" }.into());
        }
        if let Some(ok) = pantalla_concedida() {
            m.insert("pantalla".into(), if ok { "concedido" } else { "no-concedido" }.into());
        }
        if let Some(n) = iohid(ESCUCHAR_EVENTOS) {
            m.insert("monitor-entrada".into(), estado_de_iohid(n).into());
        }
        // AVMediaTypeAudio = «soun», AVMediaTypeVideo = «vide».
        if let Some(n) = clase_entero(c"AVCaptureDevice", sel!(authorizationStatusForMediaType:), Some("soun")) {
            m.insert("microfono".into(), estado_de_autorizacion(n).into());
        }
        if let Some(n) = clase_entero(c"AVCaptureDevice", sel!(authorizationStatusForMediaType:), Some("vide")) {
            m.insert("camara".into(), estado_de_autorizacion(n).into());
        }
        if let Some(n) = clase_entero(c"CBManager", sel!(authorization), None) {
            m.insert("bluetooth".into(), estado_de_autorizacion(n).into());
        }
        if let Some(n) = clase_entero(c"CLLocationManager", sel!(authorizationStatus), None) {
            m.insert("ubicacion-wifi".into(), estado_de_autorizacion(n).into());
        }
        // Red local, notificaciones, automatización y acceso total al disco: macOS no da una lectura
        // pública (o la de notificaciones la da el plugin en la web). No se escribe nada: «desconocido».
    }

    /// Enseña el aviso del sistema. Devuelve si ya estaba concedido.
    pub fn pedir(id: &str) -> Result<bool, String> {
        match id {
            "accesibilidad" => {
                type CrearDic = extern "C" fn(*const c_void, *const *const c_void, *const *const c_void, isize, *const c_void, *const c_void) -> *const c_void;
                let crear: CrearDic = unsafe { std::mem::transmute(simbolo(c"CFDictionaryCreate").ok_or("Falta CoreFoundation.")?) };
                let liberar: extern "C" fn(*const c_void) = unsafe { std::mem::transmute(simbolo(c"CFRelease").ok_or("Falta CoreFoundation.")?) };
                let pedir: extern "C" fn(*const c_void) -> bool =
                    unsafe { std::mem::transmute(simbolo(c"AXIsProcessTrustedWithOptions").ok_or("Este macOS no tiene el aviso de Accesibilidad.")?) };
                // Las constantes son variables globales: dlsym da su DIRECCIÓN; se lee el puntero que guardan.
                let clave = unsafe { *(simbolo(c"kAXTrustedCheckOptionPrompt").ok_or("Falta la opción del aviso.")? as *const *const c_void) };
                let verdad = unsafe { *(simbolo(c"kCFBooleanTrue").ok_or("Falta CoreFoundation.")? as *const *const c_void) };
                let cb_claves = simbolo(c"kCFTypeDictionaryKeyCallBacks").ok_or("Falta CoreFoundation.")? as *const c_void;
                let cb_valores = simbolo(c"kCFTypeDictionaryValueCallBacks").ok_or("Falta CoreFoundation.")? as *const c_void;
                let claves = [clave];
                let valores = [verdad];
                let dic = crear(std::ptr::null(), claves.as_ptr(), valores.as_ptr(), 1, cb_claves, cb_valores);
                if dic.is_null() {
                    return Err("No se pudo preparar el aviso de Accesibilidad.".into());
                }
                let ok = pedir(dic);
                liberar(dic);
                Ok(ok)
            }
            "pantalla" => {
                let f: extern "C" fn() -> bool =
                    unsafe { std::mem::transmute(simbolo(c"CGRequestScreenCaptureAccess").ok_or("Este macOS no tiene el aviso de Grabación de pantalla.")?) };
                Ok(f())
            }
            "monitor-entrada" => {
                let f: extern "C" fn(u32) -> bool =
                    unsafe { std::mem::transmute(simbolo(c"IOHIDRequestAccess").ok_or("Este macOS no tiene el aviso de Monitorización de entrada.")?) };
                Ok(f(ESCUCHAR_EVENTOS))
            }
            _ => Err("Sin aviso del sistema para ese permiso.".into()),
        }
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn paneles_de_macos_son_las_anclas_de_privacidad() {
        assert!(panel("macos", "accesibilidad").unwrap().ends_with("Privacy_Accessibility"));
        assert!(panel("macos", "pantalla").unwrap().ends_with("Privacy_ScreenCapture"));
        assert!(panel("macos", "monitor-entrada").unwrap().ends_with("Privacy_ListenEvent"));
        assert!(panel("macos", "disco-completo").unwrap().ends_with("Privacy_AllFiles"));
        for id in ["accesibilidad", "pantalla", "microfono", "camara", "bluetooth"] {
            assert!(panel("macos", id).unwrap().starts_with("x-apple.systempreferences:"), "{id}");
        }
        assert_eq!(panel("macos", "nada"), None);
        assert_eq!(panel("linux", "pantalla"), None, "Linux no tiene una dirección fiable");
    }

    #[test]
    fn paneles_de_windows() {
        assert_eq!(panel("windows", "microfono"), Some("ms-settings:privacy-microphone"));
        assert_eq!(panel("windows", "ubicacion-wifi"), Some("ms-settings:privacy-location"));
        assert_eq!(panel("windows", "accesibilidad"), None, "Windows no pide nada para mandar entrada");
    }

    #[test]
    fn paneles_de_android_solo_los_de_la_lista() {
        for id in PANELES_ANDROID {
            assert!(panel("android", id).is_some(), "{id}");
        }
        assert_eq!(accion_panel_android("superposicion").as_deref(), Some("panel:superposicion"));
        assert_eq!(accion_panel_android("bateria").as_deref(), Some("bateria"));
        assert_eq!(accion_panel_android("panel:x; rm"), None);
        assert_eq!(accion_panel_android("SUPERPOSICION"), None);
    }

    #[test]
    fn sesion_de_linux() {
        assert_eq!(sesion_linux(Some("wayland"), None), "wayland");
        assert_eq!(sesion_linux(Some("X11"), Some("wayland-0")), "x11");
        assert_eq!(sesion_linux(None, Some("wayland-0")), "wayland");
        assert_eq!(sesion_linux(Some("tty"), None), "x11");
    }

    #[test]
    fn autorizaciones_de_apple() {
        assert_eq!(estado_de_autorizacion(0), "sin-preguntar");
        assert_eq!(estado_de_autorizacion(2), "denegado");
        assert_eq!(estado_de_autorizacion(3), "concedido");
        assert_eq!(estado_de_autorizacion(4), "concedido");
        assert_eq!(estado_de_iohid(0), "concedido");
        assert_eq!(estado_de_iohid(1), "denegado");
        assert_eq!(estado_de_iohid(2), "sin-preguntar");
        for e in [estado_de_autorizacion(9), estado_de_iohid(7)] {
            assert!(ESTADOS.contains(&e));
        }
    }

    #[test]
    fn android_viejo_no_dice_lo_que_no_mide() {
        let s: crate::android::ServicioAndroid = serde_json::from_str(r#"{"vivo":true,"microfono":true}"#).unwrap();
        let m = estados_android(Some(&s));
        assert_eq!(m.get("microfono").map(String::as_str), Some("concedido"));
        assert_eq!(m.get("camara").map(String::as_str), Some("no-concedido"));
        assert!(!m.contains_key("superposicion"), "un APK sin PER1111S no mide la superposición");
        let s2: crate::android::ServicioAndroid = serde_json::from_str(r#"{"superposicion":true,"todos_archivos":false}"#).unwrap();
        let m2 = estados_android(Some(&s2));
        assert_eq!(m2.get("superposicion").map(String::as_str), Some("concedido"));
        assert_eq!(m2.get("todos-archivos").map(String::as_str), Some("no-concedido"));
        assert!(estados_android(None).is_empty());
    }

    #[test]
    fn estado_honesto_en_este_sistema() {
        let e = permisos_sistema_estado();
        assert_eq!(e.version, VERSION_PERMISOS_SISTEMA);
        assert_eq!(e.estados.get("capacidades").map(String::as_str), Some("no-aplica"));
        for v in e.estados.values() {
            assert!(ESTADOS.contains(&v.as_str()), "{v}");
        }
        #[cfg(target_os = "linux")]
        assert!(e.sesion == "x11" || e.sesion == "wayland");
    }

    #[test]
    fn pedir_solo_avisos_del_sistema() {
        assert!(permisos_sistema_pedir("disco-completo".into()).unwrap_err().contains("Ajustes"));
        #[cfg(not(target_os = "macos"))]
        assert!(permisos_sistema_pedir("accesibilidad".into()).is_err());
    }
}
