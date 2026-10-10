// ═══════════════════════════════════════════════════════════════════════════
// android_parche — servicio de antenas en el proyecto Android que genera Tauri
// (2026-10-10). Contrato: architecture/apps-nativas-segundo-plano.md §2.3.
// ---------------------------------------------------------------------------
// Por qué en tiempo de compilación: `cargo tauri android init` regenera
// `src-tauri/gen/android` en cada build del CI, así que lo escrito a mano allí se
// pierde. `build.rs` corre durante la compilación Rust del APK con las mismas
// variables que usa el propio Tauri para escribir su Kotlin
// (TAURI_ANDROID_PROJECT_PATH, WRY_ANDROID_LIBRARY, WRY_ANDROID_PACKAGE): después
// de `init` y antes de que Gradle compile el Kotlin y procese el manifiesto.
//
// Lo usa build.rs con `#[path]`, así que SOLO std. Idempotente: los bloques van
// entre marcadores y se sustituyen; los archivos se escriben solo si cambian.
// ═══════════════════════════════════════════════════════════════════════════

#![allow(dead_code)]

use std::path::{Path, PathBuf};

pub const PAQUETE_OS: &str = "app.starseed.os";
pub const PAQUETE_KOTLIN: &str = "app.starseed.nativa";

const PERMISOS_INICIO: &str = "<!-- STARSEED-SEGUNDO-PLANO:PERMISOS:INICIO (no editar: lo escribe native/src-tauri/build.rs) -->";
const PERMISOS_FIN: &str = "<!-- STARSEED-SEGUNDO-PLANO:PERMISOS:FIN -->";
const COMPONENTES_INICIO: &str = "<!-- STARSEED-SEGUNDO-PLANO:COMPONENTES:INICIO (no editar: lo escribe native/src-tauri/build.rs) -->";
const COMPONENTES_FIN: &str = "<!-- STARSEED-SEGUNDO-PLANO:COMPONENTES:FIN -->";

/// Permisos que pide el servicio de antenas (por qué cada uno: contrato §2.3).
pub const PERMISOS: [&str; 9] = [
    "android.permission.FOREGROUND_SERVICE",
    "android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE",
    "android.permission.FOREGROUND_SERVICE_DATA_SYNC",
    "android.permission.CHANGE_WIFI_MULTICAST_STATE",
    "android.permission.ACCESS_NETWORK_STATE",
    "android.permission.ACCESS_WIFI_STATE",
    "android.permission.POST_NOTIFICATIONS",
    "android.permission.RECEIVE_BOOT_COMPLETED",
    "android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
];

/// Las plantillas Kotlin (nombre de archivo, contenido con `{{LIB}}`).
pub const KOTLIN: [(&str, &str); 4] = [
    ("PuenteNativo.kt", include_str!("../android/PuenteNativo.kt")),
    ("ArranqueStarSeed.kt", include_str!("../android/ArranqueStarSeed.kt")),
    ("ServicioAntenas.kt", include_str!("../android/ServicioAntenas.kt")),
    ("ArranqueAlEncender.kt", include_str!("../android/ArranqueAlEncender.kt")),
];

/// Reglas de R8: el release de Tauri minifica y el JNI busca la clase por nombre.
pub const PROGUARD: &str = "# Lo escribe native/src-tauri/build.rs (StarSeed · servicio de antenas).\n-keep class app.starseed.nativa.** { *; }\n";

/// Quita el bloque entre dos marcadores (con la línea de cada marcador).
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

fn ya_declarado(manifiesto: &str, permiso: &str) -> bool {
    manifiesto.contains(&format!("\"{permiso}\""))
}

/// Bloque de permisos con los que aún no estén (fuera de nuestro bloque).
pub fn bloque_permisos(manifiesto_sin_bloques: &str) -> String {
    let mut s = format!("    {PERMISOS_INICIO}\n");
    for p in PERMISOS.iter().filter(|p| !ya_declarado(manifiesto_sin_bloques, p)) {
        s.push_str(&format!("    <uses-permission android:name=\"{p}\" />\n"));
    }
    s.push_str(&format!("    {PERMISOS_FIN}\n"));
    s
}

/// Servicio, receptor de arranque y proveedor que arranca el guardián.
pub fn bloque_componentes() -> String {
    format!(
        "        {COMPONENTES_INICIO}
        <provider
            android:name=\"{PAQUETE_KOTLIN}.ArranqueStarSeed\"
            android:authorities=\"${{applicationId}}.starseed-arranque\"
            android:exported=\"false\"
            android:initOrder=\"100\" />
        <service
            android:name=\"{PAQUETE_KOTLIN}.ServicioAntenas\"
            android:exported=\"false\"
            android:foregroundServiceType=\"connectedDevice|dataSync\" />
        <receiver
            android:name=\"{PAQUETE_KOTLIN}.ArranqueAlEncender\"
            android:exported=\"true\">
            <intent-filter>
                <action android:name=\"android.intent.action.BOOT_COMPLETED\" />
                <action android:name=\"android.intent.action.MY_PACKAGE_REPLACED\" />
            </intent-filter>
        </receiver>
        {COMPONENTES_FIN}
"
    )
}

/// Devuelve el manifiesto con los dos bloques (sustituye los que ya hubiera).
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

/// Sustituye `{{LIB}}` por el nombre real de la librería Rust (sin `lib` ni `.so`).
pub fn kotlin(plantilla: &str, libreria: &str) -> String {
    plantilla.replace("{{LIB}}", libreria)
}

/// Paquete sin las comillas invertidas que Tauri añade a palabras reservadas de Kotlin.
pub fn paquete_limpio(crudo: &str) -> String {
    crudo.replace('`', "")
}

/// ¿Hay que parchear este proyecto? Solo StarSeed OS (Nexus y Café son portales web).
pub fn aplica(paquete: &str, desactivado: bool) -> bool {
    !desactivado && paquete_limpio(paquete) == PAQUETE_OS
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
pub fn aplicar(proyecto: &Path, libreria: &str) -> Result<Vec<PathBuf>, String> {
    let mut cambiados = Vec::new();
    let manifiesto = proyecto.join("app/src/main/AndroidManifest.xml");
    let texto = std::fs::read_to_string(&manifiesto)
        .map_err(|e| format!("No se pudo leer {}: {e} (¿falta `cargo tauri android init`?)", manifiesto.display()))?;
    let nuevo = parchear_manifiesto(&texto)?;
    if escribir_si_cambia(&manifiesto, &nuevo)? {
        cambiados.push(manifiesto);
    }
    let dir_kotlin = proyecto.join("app/src/main/java").join(PAQUETE_KOTLIN.replace('.', "/"));
    for (nombre, plantilla) in KOTLIN {
        let ruta = dir_kotlin.join(nombre);
        if escribir_si_cambia(&ruta, &kotlin(plantilla, libreria))? {
            cambiados.push(ruta);
        }
    }
    let proguard = proyecto.join("app/proguard-starseed.pro");
    if escribir_si_cambia(&proguard, PROGUARD)? {
        cambiados.push(proguard);
    }
    Ok(cambiados)
}

#[cfg(test)]
mod pruebas {
    use super::*;

    // Forma del manifiesto que genera Tauri 2 (resumida).
    const PLANTILLA: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

    <!-- AndroidTV support -->
    <uses-feature android:name="android.software.leanback" android:required="false" />

    <application
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:theme="@style/Theme.starseed_native"
        android:usesCleartextTraffic="${usesCleartextTraffic}">
        <activity
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"
            android:launchMode="singleTask"
            android:label="@string/main_activity_title"
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <provider
          android:name="androidx.core.content.FileProvider"
          android:authorities="${applicationId}.fileprovider"
          android:exported="false"
          android:grantUriPermissions="true">
          <meta-data
            android:name="android.support.FILE_PROVIDER_PATHS"
            android:resource="@xml/file_paths" />
        </provider>
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
        assert!(m.contains("android:foregroundServiceType=\"connectedDevice|dataSync\""));
        assert!(m.contains("android.permission.CHANGE_WIFI_MULTICAST_STATE"));
        assert!(m.contains("app.starseed.nativa.ArranqueAlEncender"));
        assert!(m.contains("${applicationId}.starseed-arranque"), "el marcador de Gradle llega tal cual");
    }

    #[test]
    fn no_duplica_permisos_que_ya_estan() {
        let m = parchear_manifiesto(PLANTILLA).unwrap();
        assert_eq!(m.matches("\"android.permission.POST_NOTIFICATIONS\"").count(), 1);
        assert_eq!(m.matches("\"android.permission.INTERNET\"").count(), 1);
    }

    #[test]
    fn es_idempotente() {
        let una = parchear_manifiesto(PLANTILLA).unwrap();
        let dos = parchear_manifiesto(&una).unwrap();
        assert_eq!(una, dos);
        assert_eq!(dos.matches(COMPONENTES_INICIO).count(), 1);
        assert_eq!(dos.matches(PERMISOS_INICIO).count(), 1);
    }

    #[test]
    fn falla_en_alto_si_cambia_la_plantilla() {
        assert!(parchear_manifiesto("<manifest></manifest>").unwrap_err().contains("<application>"));
    }

    #[test]
    fn plantillas_kotlin_completas() {
        for (nombre, t) in KOTLIN {
            assert!(t.contains("package app.starseed.nativa"), "{nombre} sin paquete fijo");
            let k = kotlin(t, "starseed_native_lib");
            assert!(!k.contains("{{"), "{nombre} con marcador sin sustituir");
        }
        assert!(KOTLIN[0].1.contains("{{LIB}}"), "PuenteNativo carga la librería por su nombre real");
        assert!(KOTLIN.iter().any(|(_, t)| t.contains("external fun iniciarGuardian")));
    }

    #[test]
    fn solo_starseed_os() {
        assert!(aplica("app.starseed.os", false));
        assert!(aplica("app.starseed.`os`", false));
        assert!(!aplica("app.starseed.nexus", false));
        assert!(!aplica("app.starseed.os", true), "STARSEED_SIN_SERVICIO_ANDROID lo apaga");
    }

    #[test]
    fn aplica_a_un_proyecto_en_disco_y_no_reescribe() {
        let dir = std::env::temp_dir().join(format!("ss-android-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("app/src/main")).unwrap();
        std::fs::write(dir.join("app/src/main/AndroidManifest.xml"), PLANTILLA).unwrap();
        let primera = aplicar(&dir, "starseed_native_lib").unwrap();
        assert_eq!(primera.len(), 6, "manifiesto + 4 Kotlin + proguard");
        assert!(dir.join("app/src/main/java/app/starseed/nativa/ServicioAntenas.kt").is_file());
        let segunda = aplicar(&dir, "starseed_native_lib").unwrap();
        assert!(segunda.is_empty(), "la segunda vez no cambia nada");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
