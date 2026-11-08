// ═══════════════════════════════════════════════════════════════════════════
// permisos_medios — micrófono, cámara y pantalla en la app nativa (MIC1108A, 2026-11-08).
// Contrato: architecture/apps-autonomas-sin-internet.md §13.
// ---------------------------------------------------------------------------
// Qué responde la app cuando la página pide un medio (getUserMedia / getDisplayMedia):
//   · página de un origen PROPIO (el servidor local http://127.0.0.1:47610…47619 o la web
//     publicada de OS, Nexus o Café: los mismos orígenes de capabilities/default.json) → el motor
//     web lo concede y es el SISTEMA quien pregunta a la persona (macOS: TCC con los textos de
//     Info.plist; Android: permiso en tiempo de ejecución; Windows: Privacidad del sistema);
//   · página de otro origen → se deniega;
//   · página aún desconocida → lo de siempre del motor (que pregunta él).
// El resto de permisos (ubicación, notificaciones…) no se toca.
//
// wry no dice qué origen pide: se usa la URL de la ÚLTIMA página cargada en esa ventana
// (`on_page_load`), guardada aquí. Nunca se llama a `webview.url()` dentro del manejador: en
// Android el manejador corre en el hilo de la interfaz y `url()` espera a ese mismo hilo.
//
// Lo de decidir es puro (se prueba sin Tauri); el pegamento con Tauri va al final.
// ═══════════════════════════════════════════════════════════════════════════

use serde::Serialize;
use std::sync::Mutex;

use crate::pista_neurona::{es_origen_local, origen_de};

/// Sube si cambia lo que la app hace con los medios (la web lo lee con `medios_estado`).
pub const VERSION_MEDIOS: u32 = 1;

/// Las webs publicadas que la app abre como propias (las de `capabilities/default.json`).
pub const WEBS_PUBLICADAS: [&str; 3] = [
    "https://starseed-os.vercel.app",
    "https://starseed-nexus.vercel.app",
    "https://starseed-cafe.vercel.app",
];

/// Qué medio se pide.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Medio {
    Microfono,
    Camara,
    Pantalla,
    /// Cualquier otro permiso: no se toca.
    Otro,
}

/// Qué se le responde al motor web.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Decision {
    Conceder,
    Denegar,
    /// Lo de siempre del motor (en Android, el permiso en tiempo de ejecución igualmente).
    PorDefecto,
}

/// ¿Es una página de la propia app (servidor local o web publicada)?
pub fn es_origen_propio(url: &str) -> bool {
    if es_origen_local(url) {
        return true;
    }
    let o = origen_de(url);
    !o.is_empty() && WEBS_PUBLICADAS.contains(&o.as_str())
}

/// Qué responder a una petición de `medio` desde la página `pagina` (None: aún no se sabe). Pura.
pub fn decidir(medio: Medio, pagina: Option<&str>) -> Decision {
    if medio == Medio::Otro {
        return Decision::PorDefecto;
    }
    match pagina {
        None => Decision::PorDefecto,
        Some(u) if es_origen_propio(u) => Decision::Conceder,
        Some(_) => Decision::Denegar,
    }
}

/// «microfono» | «camara» | «pantalla» (lo que manda la web a `medios_abrir_ajustes`).
pub fn medio_de_texto(t: &str) -> Option<Medio> {
    match t.trim().to_ascii_lowercase().as_str() {
        "microfono" | "micrófono" | "audio" => Some(Medio::Microfono),
        "camara" | "cámara" | "video" | "vídeo" => Some(Medio::Camara),
        "pantalla" => Some(Medio::Pantalla),
        _ => None,
    }
}

/// La pantalla de ajustes del sistema para `medio` en `plataforma` (`std::env::consts::OS`). Pura.
/// macOS: Ajustes del Sistema › Privacidad y seguridad; Windows: Configuración › Privacidad;
/// Android: la ficha de la app (Permisos). Linux e iOS: no hay una dirección fiable (None).
pub fn destino_ajustes(plataforma: &str, medio: Medio) -> Option<&'static str> {
    match (plataforma, medio) {
        ("macos", Medio::Microfono) => Some("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"),
        ("macos", Medio::Camara) => Some("x-apple.systempreferences:com.apple.preference.security?Privacy_Camera"),
        ("macos", Medio::Pantalla) => Some("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"),
        ("windows", Medio::Microfono) => Some("ms-settings:privacy-microphone"),
        ("windows", Medio::Camara) => Some("ms-settings:privacy-webcam"),
        ("android", Medio::Microfono | Medio::Camara) => Some("ajustes"),
        _ => None,
    }
}

// ─────────────────────────── Última página de cada ventana ───────────────────────────

static PAGINAS: Mutex<Vec<(String, String)>> = Mutex::new(Vec::new());

/// Apunta la página que carga la ventana `etiqueta` (la última manda).
pub fn recordar_pagina(etiqueta: &str, url: &str) {
    let Ok(mut p) = PAGINAS.lock() else { return };
    if let Some(f) = p.iter_mut().find(|(e, _)| e == etiqueta) {
        f.1 = url.to_string();
    } else {
        p.push((etiqueta.to_string(), url.to_string()));
    }
}

/// La última página cargada en la ventana `etiqueta`.
pub fn pagina_de(etiqueta: &str) -> Option<String> {
    PAGINAS.lock().ok()?.iter().find(|(e, _)| e == etiqueta).map(|(_, u)| u.clone())
}

// ─────────────────────────── Pegamento con Tauri ───────────────────────────

use tauri::webview::{PermissionKind, PermissionResponse};

fn medio_de(kind: PermissionKind) -> Medio {
    match kind {
        PermissionKind::Microphone => Medio::Microfono,
        PermissionKind::Camera => Medio::Camara,
        PermissionKind::DisplayCapture => Medio::Pantalla,
        _ => Medio::Otro,
    }
}

/// `Builder::on_permission_request`: decide con la última página de esa ventana. No bloquea.
pub fn al_pedir_permiso(etiqueta: &str, kind: PermissionKind) -> PermissionResponse {
    match decidir(medio_de(kind), pagina_de(etiqueta).as_deref()) {
        Decision::Conceder => PermissionResponse::Allow,
        Decision::Denegar => PermissionResponse::Deny,
        Decision::PorDefecto => PermissionResponse::Default,
    }
}

/// Lo que la web lee para saber qué puede decirle a la persona (y si la app es anterior a MIC1108A:
/// entonces el comando ni existe).
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct EstadoMediosNativo {
    /// `VERSION_MEDIOS`.
    pub version: u32,
    /// "macos" | "windows" | "linux" | "android" | "ios".
    pub plataforma: String,
    /// Esta instalación declara micrófono y cámara al sistema (Info.plist, manifiesto de Android).
    pub declarados: bool,
    /// `medios_abrir_ajustes` sabe abrir los ajustes del sistema aquí.
    pub abrir_ajustes: bool,
}

fn declarados() -> bool {
    // Android: build.rs enciende `starseed_medios_android` solo si escribió los permisos en el
    // manifiesto. iOS: el proyecto lo genera `tauri ios init` sin los textos (no cubierto aún).
    if cfg!(target_os = "android") {
        cfg!(starseed_medios_android)
    } else {
        !cfg!(target_os = "ios")
    }
}

fn abrir_ajustes_disponible() -> bool {
    #[cfg(target_os = "android")]
    {
        crate::android::dir_datos().is_some()
    }
    #[cfg(not(target_os = "android"))]
    {
        destino_ajustes(std::env::consts::OS, Medio::Microfono).is_some()
    }
}

#[tauri::command]
pub fn medios_estado() -> EstadoMediosNativo {
    EstadoMediosNativo {
        version: VERSION_MEDIOS,
        plataforma: std::env::consts::OS.to_string(),
        declarados: declarados(),
        abrir_ajustes: abrir_ajustes_disponible(),
    }
}

/// Abre los ajustes del sistema donde se da (o se quita) el permiso de `tipo`
/// («microfono» | «camara» | «pantalla»). Solo direcciones fijas: nada de la web llega a un proceso.
#[tauri::command]
pub fn medios_abrir_ajustes(tipo: String) -> Result<bool, String> {
    let medio = medio_de_texto(&tipo).ok_or_else(|| format!("No sé qué ajustes abrir para «{tipo}»."))?;
    let destino = destino_ajustes(std::env::consts::OS, medio)
        .ok_or("Este sistema no tiene una pantalla de ajustes que la app sepa abrir: búscalo en los ajustes de privacidad.")?;
    abrir(destino)
}

#[cfg(target_os = "macos")]
fn abrir(destino: &str) -> Result<bool, String> {
    std::process::Command::new("/usr/bin/open")
        .arg(destino)
        .spawn()
        .map(|_| true)
        .map_err(|e| format!("No se pudieron abrir los Ajustes del Sistema: {e}"))
}

#[cfg(target_os = "windows")]
fn abrir(destino: &str) -> Result<bool, String> {
    std::process::Command::new("explorer.exe")
        .arg(destino)
        .spawn()
        .map(|_| true)
        .map_err(|e| format!("No se pudo abrir la Configuración de Windows: {e}"))
}

#[cfg(target_os = "android")]
fn abrir(_destino: &str) -> Result<bool, String> {
    let dir = crate::android::dir_datos().ok_or("Este APK no trae el puente con Android para abrir sus ajustes.")?;
    let ahora = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    crate::android::pedir(&dir, "ajustes", ahora)?;
    Ok(true)
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "android")))]
fn abrir(_destino: &str) -> Result<bool, String> {
    Err("Este sistema no tiene una pantalla de ajustes que la app sepa abrir.".into())
}

/// Linux (WebKitGTK): MediaStream y WebRTC vienen APAGADOS por defecto en sus ajustes; sin ellos
/// `navigator.mediaDevices` ni existe. Se encienden en la ventana principal (solo eso).
#[cfg(target_os = "linux")]
pub fn encender_medios_linux<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    use tauri::Manager;
    let Some(ventana) = app.get_webview_window("main") else { return };
    let _ = ventana.with_webview(|pw| {
        use webkit2gtk::{SettingsExt, WebViewExt};
        if let Some(ajustes) = WebViewExt::settings(&pw.inner()) {
            ajustes.set_enable_media_stream(true);
            ajustes.set_enable_webrtc(true);
        }
    });
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn origenes_propios() {
        for u in [
            "http://127.0.0.1:47610/escritorios",
            "http://127.0.0.1:47619/",
            "HTTP://127.0.0.1:47613/mensajes?x=1",
            "https://starseed-os.vercel.app/mensajes",
            "https://starseed-nexus.vercel.app/",
            "https://starseed-cafe.vercel.app",
        ] {
            assert!(es_origen_propio(u), "{u} es propio");
        }
        for u in [
            "http://127.0.0.1:47620/",
            "http://127.0.0.1:8080/",
            "http://localhost:47610/",
            "https://127.0.0.1:47610/",
            "http://127.0.0.1:47610@evil.example/",
            "http://127.0.0.1:47610.evil.example/",
            "https://starseed-os.vercel.app.evil.example/",
            "https://evil.example/?https://starseed-os.vercel.app",
            "https://user@starseed-os.vercel.app/",
            "http://starseed-os.vercel.app/",
            "https://starseed-os.vercel.app:8443/",
            "tauri://localhost/index.html",
            "about:blank",
            "",
        ] {
            assert!(!es_origen_propio(u), "{u} NO es propio");
        }
    }

    #[test]
    fn decide_solo_los_medios() {
        let propia = Some("http://127.0.0.1:47611/mensajes");
        let ajena = Some("https://evil.example/");
        for m in [Medio::Microfono, Medio::Camara, Medio::Pantalla] {
            assert_eq!(decidir(m, propia), Decision::Conceder);
            assert_eq!(decidir(m, ajena), Decision::Denegar);
            assert_eq!(decidir(m, None), Decision::PorDefecto, "sin página: lo de siempre del motor");
        }
        assert_eq!(decidir(Medio::Otro, propia), Decision::PorDefecto, "ubicación, notificaciones… no se tocan");
        assert_eq!(decidir(Medio::Otro, ajena), Decision::PorDefecto);
    }

    #[test]
    fn la_ultima_pagina_de_cada_ventana_manda() {
        recordar_pagina("prueba-a", "tauri://localhost/index.html");
        recordar_pagina("prueba-b", "https://evil.example/");
        assert_eq!(decidir(Medio::Microfono, pagina_de("prueba-a").as_deref()), Decision::Denegar);
        recordar_pagina("prueba-a", "http://127.0.0.1:47610/mensajes");
        assert_eq!(decidir(Medio::Microfono, pagina_de("prueba-a").as_deref()), Decision::Conceder);
        assert_eq!(decidir(Medio::Microfono, pagina_de("prueba-b").as_deref()), Decision::Denegar);
        assert_eq!(pagina_de("prueba-sin-cargar"), None);
    }

    #[test]
    fn traduce_lo_de_tauri() {
        recordar_pagina("prueba-tauri", "https://starseed-os.vercel.app/");
        assert_eq!(al_pedir_permiso("prueba-tauri", PermissionKind::Microphone), PermissionResponse::Allow);
        assert_eq!(al_pedir_permiso("prueba-tauri", PermissionKind::Camera), PermissionResponse::Allow);
        assert_eq!(al_pedir_permiso("prueba-tauri", PermissionKind::DisplayCapture), PermissionResponse::Allow);
        assert_eq!(al_pedir_permiso("prueba-tauri", PermissionKind::Geolocation), PermissionResponse::Default);
        assert_eq!(al_pedir_permiso("prueba-tauri-sin", PermissionKind::Microphone), PermissionResponse::Default);
        recordar_pagina("prueba-tauri", "https://evil.example/");
        assert_eq!(al_pedir_permiso("prueba-tauri", PermissionKind::Microphone), PermissionResponse::Deny);
    }

    #[test]
    fn ajustes_del_sistema() {
        assert_eq!(medio_de_texto("microfono"), Some(Medio::Microfono));
        assert_eq!(medio_de_texto(" Cámara "), Some(Medio::Camara));
        assert_eq!(medio_de_texto("pantalla"), Some(Medio::Pantalla));
        assert_eq!(medio_de_texto("rm -rf /"), None);
        assert!(destino_ajustes("macos", Medio::Microfono).unwrap().ends_with("Privacy_Microphone"));
        assert!(destino_ajustes("macos", Medio::Camara).unwrap().ends_with("Privacy_Camera"));
        assert!(destino_ajustes("macos", Medio::Pantalla).unwrap().ends_with("Privacy_ScreenCapture"));
        assert_eq!(destino_ajustes("windows", Medio::Microfono), Some("ms-settings:privacy-microphone"));
        assert_eq!(destino_ajustes("windows", Medio::Camara), Some("ms-settings:privacy-webcam"));
        assert_eq!(destino_ajustes("windows", Medio::Pantalla), None);
        assert_eq!(destino_ajustes("android", Medio::Microfono), Some("ajustes"));
        assert_eq!(destino_ajustes("android", Medio::Pantalla), None, "Android WebView no comparte pantalla");
        assert_eq!(destino_ajustes("linux", Medio::Microfono), None);
        assert_eq!(destino_ajustes("ios", Medio::Microfono), None);
        // Solo direcciones fijas, sin espacios ni nada que una shell pudiera leer de otra forma.
        for p in ["macos", "windows", "android"] {
            for m in [Medio::Microfono, Medio::Camara, Medio::Pantalla] {
                if let Some(d) = destino_ajustes(p, m) {
                    assert!(d.chars().all(|c| c.is_ascii_alphanumeric() || ".:?_-".contains(c)), "{d}");
                }
            }
        }
    }

    #[test]
    fn estado_honesto() {
        let e = medios_estado();
        assert_eq!(e.version, VERSION_MEDIOS);
        assert_eq!(e.plataforma, std::env::consts::OS);
        assert!(e.declarados || cfg!(any(target_os = "android", target_os = "ios")));
    }
}
