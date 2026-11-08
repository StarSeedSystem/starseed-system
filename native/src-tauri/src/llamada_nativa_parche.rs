
// ═══════════════════════════════════════════════════════════════════════════
// llamada_nativa_parche — las llamadas como llamadas del teléfono en el proyecto Android que genera Tauri
// (LLA1108D, 2026-11-08). Contrato: architecture/llamadas-telefonia.md § «Integración nativa».
// ---------------------------------------------------------------------------
// Como enlace_wifi_parche.rs, en su propio bloque para no pisarse con los otros parches: build.rs lo aplica
// tras `cargo tauri android init` y antes de que Gradle procese el manifiesto. Escribe:
//   · los permisos (cada uno con su porqué en un comentario del propio manifiesto) y la función de
//     telefonía como OPCIONAL (una tableta sin SIM se instala igual);
//   · el proveedor `ArranqueLlamadaNativa`, el servicio de conexión de Telecom, el servicio en primer plano
//     `phoneCall|microphone|camera`, el receptor de los botones del aviso y la actividad que se abre sobre
//     el bloqueo;
//   · `LlamadaNativaStarSeed.kt` (Telecom autogestionado, aviso CallStyle, audio, proximidad).
// Solo std (lo usa build.rs con `#[path]`). Idempotente. Solo StarSeed OS.
// Interruptor de emergencia: STARSEED_SIN_LLAMADAS_NATIVAS_ANDROID=1.
// ═══════════════════════════════════════════════════════════════════════════

#![allow(dead_code)]

use std::path::{Path, PathBuf};

pub const PAQUETE_OS: &str = "app.starseed.os";

const PERMISOS_INICIO: &str = "<!-- STARSEED-LLAMADAS-NATIVAS:PERMISOS:INICIO (no editar: lo escribe native/src-tauri/build.rs · LLA1108D) -->";
const PERMISOS_FIN: &str = "<!-- STARSEED-LLAMADAS-NATIVAS:PERMISOS:FIN -->";
const COMPONENTES_INICIO: &str = "<!-- STARSEED-LLAMADAS-NATIVAS:COMPONENTES:INICIO (no editar: lo escribe native/src-tauri/build.rs · LLA1108D) -->";
const COMPONENTES_FIN: &str = "<!-- STARSEED-LLAMADAS-NATIVAS:COMPONENTES:FIN -->";

/// Permisos y para qué. Los que otro parche ya declara (servicio, medios, actualizador) no se repiten:
/// `ya_declarado` los salta, y si el otro parche está apagado quedan aquí.
pub const PERMISOS: [(&str, &str); 9] = [
    ("android.permission.MANAGE_OWN_CALLS", "Registrar las llamadas de StarSeed como llamadas del teléfono (audio, auriculares y prioridad sobre la música)."),
    ("android.permission.FOREGROUND_SERVICE", "Mantener viva la llamada con la pantalla apagada o la app atrás."),
    ("android.permission.FOREGROUND_SERVICE_PHONE_CALL", "Tipo de servicio «llamada» (Android 14+)."),
    ("android.permission.FOREGROUND_SERVICE_MICROPHONE", "El micrófono sigue abierto durante la llamada con la app atrás (Android 14+)."),
    ("android.permission.FOREGROUND_SERVICE_CAMERA", "La cámara sigue abierta en una videollamada con la app atrás (Android 14+)."),
    ("android.permission.USE_FULL_SCREEN_INTENT", "Mostrar la llamada entrante sobre la pantalla de bloqueo (Android 14+ lo concede el usuario en Ajustes)."),
    ("android.permission.WAKE_LOCK", "Apagar la pantalla junto a la cara con el sensor de proximidad durante una llamada de voz."),
    ("android.permission.POST_NOTIFICATIONS", "El aviso de llamada con Contestar, Rechazar, Colgar y Silenciar (Android 13+)."),
    ("android.permission.MODIFY_AUDIO_SETTINGS", "Encaminar el audio de la llamada: auricular, altavoz, cable o Bluetooth."),
];
/// Una tableta sin SIM ni teléfono se instala igual: la telefonía es opcional.
pub const FUNCION_TELEFONIA: &str = "android.hardware.telephony";

pub const COMPONENTES: [&str; 5] = [
    "app.starseed.nativa.ArranqueLlamadaNativa",
    "app.starseed.nativa.ServicioConexionStarSeed",
    "app.starseed.nativa.ServicioLlamadaStarSeed",
    "app.starseed.nativa.ReceptorLlamadaStarSeed",
    "app.starseed.nativa.ActividadLlamadaStarSeed",
];

pub const KOTLIN: &str = include_str!("../android/LlamadaNativaStarSeed.kt");

/// `STARSEED_SIN_LLAMADAS_NATIVAS_ANDROID`: cualquier valor salvo vacío, «0» o «false» lo apaga.
pub fn apagado(valor: Option<&str>) -> bool {
    match valor.map(|v| v.trim().to_lowercase()) {
        Some(v) => !(v.is_empty() || v == "0" || v == "false"),
        None => false,
    }
}

fn quitar_bloque(texto: &str, inicio: &str, fin: &str) -> String {
    let (Some(a), Some(b)) = (texto.find(inicio), texto.find(fin)) else { return texto.to_string() };
    if b < a {
        return texto.to_string();
    }
    let desde = texto[..a].rfind('\n').map(|i| i + 1).unwrap_or(a);
    let mut hasta = b + fin.len();
    if texto[hasta..].starts_with('\n') {
        hasta += 1;
    }
    format!("{}{}", &texto[..desde], &texto[hasta..])
}

fn ya_declarado(manifiesto: &str, nombre: &str) -> bool {
    manifiesto.contains(&format!("\"{nombre}\""))
}

/// Bloque de permisos con lo que aún no esté declarado (fuera de nuestro bloque).
pub fn bloque_permisos(manifiesto_sin_bloques: &str) -> String {
    let mut s = format!("    {PERMISOS_INICIO}\n");
    for (p, porque) in PERMISOS.iter().filter(|(p, _)| !ya_declarado(manifiesto_sin_bloques, p)) {
        s.push_str(&format!("    <!-- {porque} -->\n    <uses-permission android:name=\"{p}\" />\n"));
    }
    if !ya_declarado(manifiesto_sin_bloques, FUNCION_TELEFONIA) {
        s.push_str(&format!("    <uses-feature android:name=\"{FUNCION_TELEFONIA}\" android:required=\"false\" />\n"));
    }
    s.push_str(&format!("    {PERMISOS_FIN}\n"));
    s
}

/// Los componentes (dentro de `<application>`).
pub fn bloque_componentes() -> String {
    format!(
        "        {COMPONENTES_INICIO}
        <provider
            android:name=\"app.starseed.nativa.ArranqueLlamadaNativa\"
            android:authorities=\"${{applicationId}}.starseed-llamada-nativa\"
            android:exported=\"false\"
            android:initOrder=\"70\" />
        <service
            android:name=\"app.starseed.nativa.ServicioConexionStarSeed\"
            android:exported=\"true\"
            android:permission=\"android.permission.BIND_TELECOM_CONNECTION_SERVICE\">
            <intent-filter>
                <action android:name=\"android.telecom.ConnectionService\" />
            </intent-filter>
        </service>
        <service
            android:name=\"app.starseed.nativa.ServicioLlamadaStarSeed\"
            android:exported=\"false\"
            android:foregroundServiceType=\"phoneCall|microphone|camera\" />
        <receiver
            android:name=\"app.starseed.nativa.ReceptorLlamadaStarSeed\"
            android:exported=\"false\" />
        <activity
            android:name=\"app.starseed.nativa.ActividadLlamadaStarSeed\"
            android:exported=\"false\"
            android:excludeFromRecents=\"true\"
            android:noHistory=\"true\"
            android:taskAffinity=\"\"
            android:showWhenLocked=\"true\"
            android:turnScreenOn=\"true\"
            android:theme=\"@android:style/Theme.Translucent.NoTitleBar\" />
        {COMPONENTES_FIN}
"
    )
}

/// Manifiesto con los dos bloques (sustituye los que hubiera): permisos antes de la línea de
/// `<application`, componentes antes de la de `</application>`.
pub fn parchear_manifiesto(texto: &str) -> Result<String, String> {
    let limpio = quitar_bloque(&quitar_bloque(texto, PERMISOS_INICIO, PERMISOS_FIN), COMPONENTES_INICIO, COMPONENTES_FIN);
    let app = limpio
        .find("<application")
        .ok_or("El AndroidManifest.xml no tiene <application>: ¿cambió la plantilla de Tauri?")?;
    let linea_app = limpio[..app].rfind('\n').map(|i| i + 1).unwrap_or(app);
    let cierre = limpio
        .rfind("</application>")
        .ok_or("El AndroidManifest.xml no tiene </application>: ¿cambió la plantilla de Tauri?")?;
    if cierre < app {
        return Err("El AndroidManifest.xml tiene </application> antes de <application>.".into());
    }
    let linea_cierre = limpio[..cierre].rfind('\n').map(|i| i + 1).unwrap_or(cierre);
    let permisos = bloque_permisos(&limpio);
    Ok(format!(
        "{}{}{}{}{}",
        &limpio[..linea_app],
        permisos,
        &limpio[linea_app..linea_cierre],
        bloque_componentes(),
        &limpio[linea_cierre..]
    ))
}

/// Solo StarSeed OS (sin las comillas invertidas que Tauri añade a palabras reservadas de Kotlin).
pub fn aplica(paquete: &str) -> bool {
    paquete.replace('`', "") == PAQUETE_OS
}

fn escribir_si_cambia(ruta: &Path, contenido: &str) -> Result<bool, String> {
    if std::fs::read_to_string(ruta).map(|t| t == contenido).unwrap_or(false) {
        return Ok(false);
    }
    if let Some(dir) = ruta.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("No se pudo crear {}: {e}", dir.display()))?;
    }
    let tmp = ruta.with_extension("starseed-tmp");
    std::fs::write(&tmp, contenido).map_err(|e| format!("No se pudo escribir {}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, ruta).map_err(|e| format!("No se pudo colocar {}: {e}", ruta.display()))?;
    Ok(true)
}

/// Aplica todo al proyecto Android. Devuelve los archivos que cambiaron.
pub fn aplicar(proyecto: &Path) -> Result<Vec<PathBuf>, String> {
    let mut cambiados = Vec::new();
    let principal = proyecto.join("app/src/main");
    let manifiesto = principal.join("AndroidManifest.xml");
    let texto = std::fs::read_to_string(&manifiesto)
        .map_err(|e| format!("No se pudo leer {}: {e} (¿falta `cargo tauri android init`?)", manifiesto.display()))?;
    if escribir_si_cambia(&manifiesto, &parchear_manifiesto(&texto)?)? {
        cambiados.push(manifiesto);
    }
    let kotlin = principal.join("java/app/starseed/nativa/LlamadaNativaStarSeed.kt");
    if escribir_si_cambia(&kotlin, KOTLIN)? {
        cambiados.push(kotlin);
    }
    Ok(cambiados)
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::llamada_nativa_logica as logica;

    const PLANTILLA: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />

    <application
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:usesCleartextTraffic="${usesCleartextTraffic}">
        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
"#;

    #[test]
    fn inserta_permisos_y_componentes_en_su_sitio() {
        let m = parchear_manifiesto(PLANTILLA).unwrap();
        let p = m.find(PERMISOS_INICIO).unwrap();
        let a = m.find("<application").unwrap();
        let c = m.find(COMPONENTES_INICIO).unwrap();
        let cierre = m.rfind("</application>").unwrap();
        assert!(p < a, "los permisos van antes de <application>");
        assert!(a < c && c < cierre, "los componentes van dentro de <application>");
        for (perm, _) in PERMISOS {
            assert!(m.contains(&format!("<uses-permission android:name=\"{perm}\" />")), "{perm}");
        }
        assert!(m.contains("<uses-feature android:name=\"android.hardware.telephony\" android:required=\"false\" />"), "una tableta sin SIM se instala igual");
        for c in COMPONENTES {
            assert!(m.contains(&format!("android:name=\"{c}\"")), "{c}");
        }
        assert!(m.contains("android:permission=\"android.permission.BIND_TELECOM_CONNECTION_SERVICE\""));
        assert!(m.contains("<action android:name=\"android.telecom.ConnectionService\" />"));
        assert!(m.contains("android:foregroundServiceType=\"phoneCall|microphone|camera\""));
        assert!(m.contains("${applicationId}.starseed-llamada-nativa"));
        // Cada permiso lleva su porqué en un comentario.
        assert!(m.contains("<!-- Apagar la pantalla junto a la cara"));
    }

    #[test]
    fn es_idempotente_y_no_duplica() {
        let una = parchear_manifiesto(PLANTILLA).unwrap();
        assert_eq!(parchear_manifiesto(&una).unwrap(), una, "aplicar dos veces = aplicar una");
        assert_eq!(una.matches(PERMISOS_INICIO).count(), 1);
        assert_eq!(una.matches(COMPONENTES_INICIO).count(), 1);
        let con = PLANTILLA.replace(
            "<uses-permission android:name=\"android.permission.INTERNET\" />",
            "<uses-permission android:name=\"android.permission.INTERNET\" />\n    <uses-permission android:name=\"android.permission.WAKE_LOCK\" />\n    <uses-feature android:name=\"android.hardware.telephony\" android:required=\"true\" />",
        );
        let m = parchear_manifiesto(&con).unwrap();
        assert_eq!(m.matches("\"android.permission.WAKE_LOCK\"").count(), 1, "no se pisa lo ya declarado");
        assert_eq!(m.matches("\"android.hardware.telephony\"").count(), 1);
    }

    #[test]
    fn convive_con_los_demas_parches() {
        // build.rs aplica: servicio, medios, actualizador, enlace Wi-Fi y llamadas, en cada build: punto fijo.
        let pasada = |t: &str| {
            let t = crate::android_parche::parchear_manifiesto(t).unwrap();
            let t = crate::android_parche::parchear_medios(&t).unwrap();
            let t = crate::android_actualizador::parchear_manifiesto(&t).unwrap();
            let t = crate::enlace_wifi_parche::parchear_manifiesto(&t).unwrap();
            parchear_manifiesto(&t).unwrap()
        };
        let una = pasada(PLANTILLA);
        let dos = pasada(&una);
        assert_eq!(una, dos, "punto fijo tras una pasada");
        assert_eq!(dos.matches(PERMISOS_INICIO).count(), 1);
        assert_eq!(dos.matches(COMPONENTES_INICIO).count(), 1);
        // Lo que otro parche ya declara (servicio, medios) queda UNA sola vez.
        for p in ["android.permission.FOREGROUND_SERVICE", "android.permission.POST_NOTIFICATIONS", "android.permission.MODIFY_AUDIO_SETTINGS"] {
            assert_eq!(dos.matches(&format!("\"{p}\"")).count(), 1, "{p} duplicado");
        }
        assert!(dos.contains("app.starseed.nativa.ServicioAntenas") && dos.contains("app.starseed.nativa.ArranqueEnlaceWifi"));
    }

    #[test]
    fn sin_los_otros_parches_se_declara_lo_que_falta() {
        // Con el servicio de antenas apagado nadie más declara FOREGROUND_SERVICE: queda en este bloque.
        let m = parchear_manifiesto(PLANTILLA).unwrap();
        assert_eq!(m.matches("\"android.permission.FOREGROUND_SERVICE\"").count(), 1);
        assert_eq!(parchear_manifiesto(&m).unwrap(), m);
    }

    #[test]
    fn falla_en_alto_si_cambia_la_plantilla() {
        assert!(parchear_manifiesto("<manifest></manifest>").unwrap_err().contains("<application>"));
        assert!(parchear_manifiesto("<manifest><application></application></manifest>").is_ok());
    }

    #[test]
    fn interruptor_de_emergencia() {
        assert!(!apagado(None));
        assert!(!apagado(Some("")));
        assert!(!apagado(Some("0")));
        assert!(!apagado(Some("false")));
        assert!(apagado(Some("1")));
        assert!(apagado(Some("si")));
    }

    #[test]
    fn solo_starseed_os() {
        assert!(aplica("app.starseed.os"));
        assert!(aplica("app.starseed.`os`"));
        assert!(!aplica("app.starseed.nexus"));
        assert!(!aplica(""));
    }

    #[test]
    fn kotlin_y_rust_dicen_lo_mismo() {
        assert!(KOTLIN.contains("package app.starseed.nativa"));
        assert!(!KOTLIN.contains("{{"), "sin marcadores por sustituir");
        assert!(KOTLIN.contains("class ArranqueLlamadaNativa : ContentProvider()"));
        for c in COMPONENTES {
            let clase = c.rsplit('.').next().unwrap();
            assert!(KOTLIN.contains(&format!("class {clase}")), "falta la clase {clase}");
        }
        // Misma carpeta y mismos archivos a los dos lados.
        assert!(KOTLIN.contains(&format!("const val CARPETA = \"{}\"", logica::CARPETA_ANDROID)));
        assert!(KOTLIN.contains(&format!("const val ESTADO = \"{}\"", logica::ESTADO)));
        assert!(KOTLIN.contains(&format!("const val PREFIJO_PETICION = \"{}\"", logica::PREFIJO_PETICION)));
        // Kotlin atiende todas las acciones que Rust pide.
        for a in logica::ACCIONES {
            assert!(KOTLIN.contains(&format!("\"{a}\" ->")), "Kotlin no atiende «{a}»");
        }
        // Lo que escribe Kotlin en estado.json son campos de EstadoKotlin.
        for campo in ["version", "epoca", "sdk", "id", "fase", "ruta", "rutas", "proximidad", "silenciada", "telecom", "notificaciones", "pantalla_completa", "sensor_proximidad", "eventos"] {
            assert!(KOTLIN.contains(&format!(".put(\"{campo}\"")), "estado.json sin «{campo}»");
        }
        let ejemplo: logica::EstadoKotlin = serde_json::from_str(
            r#"{"version":1,"epoca":1,"sdk":34,"id":"a","fase":"activa","ruta":"altavoz","rutas":["altavoz"],"proximidad":false,"silenciada":true,"telecom":true,"notificaciones":true,"pantalla_completa":"concedido","sensor_proximidad":true,"eventos":[{"n":1,"tipo":"colgar","id":"a"}]}"#,
        )
        .unwrap();
        assert!(ejemplo.telecom && ejemplo.silenciada && ejemplo.eventos.len() == 1);
        // Los eventos que cuenta Kotlin son los que Rust deja pasar.
        for ev in logica::EVENTOS {
            assert!(KOTLIN.contains(&format!("\"{ev}\"")), "Kotlin no usa el evento «{ev}»");
        }
        // Las rutas: las mismas palabras.
        for r in logica::RUTAS {
            assert!(KOTLIN.contains(&format!("\"{r}\"")), "Kotlin no conoce la ruta «{r}»");
        }
        // Las fases que escribe Kotlin son las que entiende Rust.
        for f in ["sonando", "activa", "en-espera"] {
            assert!(KOTLIN.contains(&format!("\"{f}\"")) && logica::Fase::desde_texto(f).is_some());
        }
        // Las API que se usan (si cambia una, que se note).
        for api in ["PhoneAccount.CAPABILITY_SELF_MANAGED", "Notification.CallStyle.forIncomingCall", "Notification.CallStyle.forOngoingCall", "setFullScreenIntent", "PROXIMITY_SCREEN_OFF_WAKE_LOCK", "requestCallEndpointChange", "canUseFullScreenIntent", "FOREGROUND_SERVICE_TYPE_PHONE_CALL", "USAGE_VOICE_COMMUNICATION"] {
            assert!(KOTLIN.contains(api), "falta {api}");
        }
        // Cada API nueva va detrás de una comprobación de versión.
        for (api, desde) in [("canUseFullScreenIntent", "34"), ("requestCallEndpointChange", "34"), ("CallStyle.forIncomingCall", "31"), ("FOREGROUND_SERVICE_TYPE_MICROPHONE", "30")] {
            let pos = KOTLIN.find(api).unwrap();
            let antes = &KOTLIN[pos.saturating_sub(900)..pos];
            assert!(antes.contains(&format!("SDK_INT >= {desde}")) || antes.contains(&format!("SDK_INT < {desde}")), "{api} sin comprobar SDK_INT {desde}");
        }
    }

    #[test]
    fn aplica_a_un_proyecto_en_disco_y_no_reescribe() {
        let dir = std::env::temp_dir().join(format!("ss-android-llamadas-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("app/src/main")).unwrap();
        std::fs::write(dir.join("app/src/main/AndroidManifest.xml"), PLANTILLA).unwrap();
        let primera = aplicar(&dir).unwrap();
        assert_eq!(primera.len(), 2, "manifiesto + Kotlin");
        assert!(dir.join("app/src/main/java/app/starseed/nativa/LlamadaNativaStarSeed.kt").is_file());
        assert!(aplicar(&dir).unwrap().is_empty(), "la segunda vez no cambia nada");
        assert!(aplicar(&dir.join("no-existe")).unwrap_err().contains("android init"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
