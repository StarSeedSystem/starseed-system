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

// ─── (MIC1108A) Micrófono, cámara y auriculares — contrato apps-autonomas-sin-internet.md §13 ───
// wry ya responde a `WebChromeClient.onPermissionRequest` pidiendo CAMERA / RECORD_AUDIO /
// MODIFY_AUDIO_SETTINGS en tiempo de ejecución (y la app decide antes por origen: permisos_medios.rs),
// pero Android niega AL INSTANTE un permiso que el manifiesto no declara: por eso fallaba toda llamada.
// Van en su propio bloque, justo tras `<manifest …>`, para no pisarse con el del servicio (que va antes
// de `<application`) y que aplicar los dos en cualquier orden deje siempre el mismo archivo.

const MEDIOS_INICIO: &str = "<!-- STARSEED-MEDIOS:INICIO (no editar: lo escribe native/src-tauri/build.rs · MIC1108A) -->";
const MEDIOS_FIN: &str = "<!-- STARSEED-MEDIOS:FIN -->";

/// Los paquetes de las tres apps (las tres pueden llamar desde su web).
pub const PAQUETES_MEDIOS: [&str; 3] = ["app.starseed.os", "app.starseed.nexus", "app.starseed.cafe"];

/// Permisos de medios. BLUETOOTH_CONNECT (Android 12+) deja que el WebView use el micro de unos
/// auriculares Bluetooth: es «Dispositivos cercanos», se concede en los ajustes de la app.
pub const PERMISOS_MEDIOS: [&str; 4] = [
    "android.permission.RECORD_AUDIO",
    "android.permission.MODIFY_AUDIO_SETTINGS",
    "android.permission.CAMERA",
    "android.permission.BLUETOOTH_CONNECT",
];

/// Hardware que esos permisos darían por obligatorio: la app también vale sin cámara.
pub const FUNCIONES_MEDIOS: [&str; 3] = ["android.hardware.microphone", "android.hardware.camera", "android.hardware.camera.autofocus"];

/// Bloque de medios con lo que aún no esté declarado fuera de él.
pub fn bloque_medios(manifiesto_sin_bloque: &str) -> String {
    let mut s = format!("    {MEDIOS_INICIO}\n");
    for p in PERMISOS_MEDIOS.iter().filter(|p| !ya_declarado(manifiesto_sin_bloque, p)) {
        s.push_str(&format!("    <uses-permission android:name=\"{p}\" />\n"));
    }
    // Hasta Android 11 los auriculares Bluetooth piden el BLUETOOTH de siempre (normal, sin pregunta).
    if !ya_declarado(manifiesto_sin_bloque, "android.permission.BLUETOOTH") {
        s.push_str("    <uses-permission android:name=\"android.permission.BLUETOOTH\" android:maxSdkVersion=\"30\" />\n");
    }
    for f in FUNCIONES_MEDIOS.iter().filter(|f| !ya_declarado(manifiesto_sin_bloque, f)) {
        s.push_str(&format!("    <uses-feature android:name=\"{f}\" android:required=\"false\" />\n"));
    }
    s.push_str(&format!("    {MEDIOS_FIN}\n"));
    s
}

/// Devuelve el manifiesto con el bloque de medios justo tras la etiqueta `<manifest …>`.
pub fn parchear_medios(texto: &str) -> Result<String, String> {
    let limpio = quitar_bloque(texto, MEDIOS_INICIO, MEDIOS_FIN);
    let m = limpio
        .find("<manifest")
        .ok_or("El AndroidManifest.xml no tiene <manifest>: ¿cambió la plantilla de Tauri?")?;
    let cierre = limpio[m..]
        .find('>')
        .map(|i| m + i + 1)
        .ok_or("El AndroidManifest.xml tiene <manifest sin cerrar.")?;
    match limpio.find("<application") {
        Some(a) if a >= cierre => {}
        _ => return Err("El AndroidManifest.xml no tiene <application> dentro de <manifest>: ¿cambió la plantilla de Tauri?".into()),
    }
    let bloque = bloque_medios(&limpio);
    // Tras el salto de línea de `<manifest …>` si el resto de esa línea está vacío; si no, en una línea nueva.
    let resto_linea = limpio[cierre..].split('\n').next().unwrap_or("");
    Ok(if resto_linea.trim().is_empty() && limpio[cierre..].contains('\n') {
        let tras = cierre + resto_linea.len() + 1;
        format!("{}{}{}", &limpio[..tras], bloque, &limpio[tras..])
    } else {
        format!("{}\n{}{}", &limpio[..cierre], bloque, &limpio[cierre..])
    })
}

/// ¿Se declaran los medios en este paquete? Las tres apps de StarSeed.
pub fn aplica_medios(paquete: &str) -> bool {
    PAQUETES_MEDIOS.contains(&paquete_limpio(paquete).as_str())
}

/// Escribe el bloque de medios en el manifiesto del proyecto. Devuelve si cambió el archivo.
pub fn aplicar_medios(proyecto: &Path) -> Result<bool, String> {
    let manifiesto = proyecto.join("app/src/main/AndroidManifest.xml");
    let texto = std::fs::read_to_string(&manifiesto)
        .map_err(|e| format!("No se pudo leer {}: {e} (¿falta `cargo tauri android init`?)", manifiesto.display()))?;
    escribir_si_cambia(&manifiesto, &parchear_medios(&texto)?)
}

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

// ─── (AND1107A) Servidor local DENTRO de la APK — interruptor de build, APAGADO por defecto ───
// Lo que va en el proyecto Android (libnode, el servidor en assets, ServidorLocal.kt, el manifiesto,
// la red en claro solo hacia 127.0.0.1 y el empaquetado de las .so) lo escribe
// native/servidor-local/preparar-android.mjs ANTES de compilar. build.rs solo enciende el código Rust
// (`--cfg starseed_servidor_android`) y, si el proyecto no está preparado, falla en alto.

/// STARSEED_SERVIDOR_LOCAL_ANDROID: «1», «si»/«sí» o «true» lo encienden; cualquier otra cosa, no.
pub fn servidor_local_encendido(valor: Option<&str>) -> bool {
    matches!(valor.map(|v| v.trim().to_lowercase()).as_deref(), Some("1" | "si" | "sí" | "true"))
}

/// ¿Pasó preparar-android.mjs por este proyecto? (Con el interruptor APAGADO eso sería una APK que
/// abre la página de arranque y nadie la lleva a ninguna parte: build.rs falla en alto.)
pub fn servidor_local_inyectado(proyecto: &Path) -> bool {
    proyecto.join("app/src/main/java/app/starseed/nativa/ServidorLocal.kt").is_file()
}

/// Lo mínimo que deja preparar-android.mjs (si falta algo, la APK diría tener servidor y no lo tendría).
pub fn servidor_local_preparado(proyecto: &Path) -> Result<(), String> {
    let principal = proyecto.join("app/src/main");
    for rel in [
        "java/app/starseed/nativa/ServidorLocal.kt",
        "java/app/starseed/nativa/ServidorLocalLogica.kt",
        "assets/servidor-local/paquete.properties",
        "assets/servidor-local/servidor.zip",
        "res/xml/starseed_red_local.xml",
    ] {
        if !principal.join(rel).is_file() {
            return Err(format!("falta {}", principal.join(rel).display()));
        }
    }
    let manifiesto = std::fs::read_to_string(principal.join("AndroidManifest.xml")).map_err(|e| format!("no se pudo leer el AndroidManifest.xml: {e}"))?;
    if !manifiesto.contains("app.starseed.nativa.ArranqueServidorLocal") || !manifiesto.contains("@xml/starseed_red_local") {
        return Err("el AndroidManifest.xml no declara ArranqueServidorLocal ni la red local".into());
    }
    let jni = principal.join("jniLibs");
    let con_node = std::fs::read_dir(&jni)
        .map(|it| it.flatten().any(|abi| abi.path().join("libnode.so").is_file()))
        .unwrap_or(false);
    if !con_node {
        return Err(format!("no hay libnode.so en {}", jni.display()));
    }
    Ok(())
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
    fn interruptor_del_servidor_local_apagado_por_defecto() {
        assert!(!servidor_local_encendido(None));
        assert!(!servidor_local_encendido(Some("")));
        assert!(!servidor_local_encendido(Some("0")));
        assert!(!servidor_local_encendido(Some("no")));
        assert!(servidor_local_encendido(Some("1")));
        assert!(servidor_local_encendido(Some(" Sí ")));
        assert!(servidor_local_encendido(Some("true")));
    }

    #[test]
    fn el_proyecto_preparado_o_dice_que_falta() {
        let dir = std::env::temp_dir().join(format!("ss-android-sl-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let m = dir.join("app/src/main");
        std::fs::create_dir_all(&m).unwrap();
        std::fs::write(m.join("AndroidManifest.xml"), PLANTILLA).unwrap();
        assert!(servidor_local_preparado(&dir).unwrap_err().contains("ServidorLocal.kt"));
        assert!(!servidor_local_inyectado(&dir));
        for rel in [
            "java/app/starseed/nativa/ServidorLocal.kt",
            "java/app/starseed/nativa/ServidorLocalLogica.kt",
            "assets/servidor-local/paquete.properties",
            "assets/servidor-local/servidor.zip",
            "res/xml/starseed_red_local.xml",
        ] {
            std::fs::create_dir_all(m.join(rel).parent().unwrap()).unwrap();
            std::fs::write(m.join(rel), "x").unwrap();
        }
        assert!(servidor_local_preparado(&dir).unwrap_err().contains("AndroidManifest"));
        let con = PLANTILLA.replace(
            "<application",
            "<application android:networkSecurityConfig=\"@xml/starseed_red_local\"",
        ).replace("</application>", "<provider android:name=\"app.starseed.nativa.ArranqueServidorLocal\" />\n</application>");
        std::fs::write(m.join("AndroidManifest.xml"), con).unwrap();
        assert!(servidor_local_preparado(&dir).unwrap_err().contains("libnode.so"));
        std::fs::create_dir_all(m.join("jniLibs/arm64-v8a")).unwrap();
        std::fs::write(m.join("jniLibs/arm64-v8a/libnode.so"), "x").unwrap();
        assert_eq!(servidor_local_preparado(&dir), Ok(()));
        assert!(servidor_local_inyectado(&dir));
        let _ = std::fs::remove_dir_all(&dir);
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

    // ─── (MIC1108A) Micrófono, cámara y auriculares ───

    #[test]
    fn medios_declarados_dentro_de_manifest_y_antes_de_application() {
        let m = parchear_medios(PLANTILLA).unwrap();
        let abre = m.find("<manifest").unwrap();
        let bloque = m.find(MEDIOS_INICIO).unwrap();
        let app = m.find("<application").unwrap();
        assert!(abre < bloque && bloque < app, "el bloque va dentro de <manifest> y antes de <application>");
        for p in PERMISOS_MEDIOS {
            assert_eq!(m.matches(&format!("<uses-permission android:name=\"{p}\" />")).count(), 1, "{p}");
        }
        assert!(m.contains("<uses-permission android:name=\"android.permission.BLUETOOTH\" android:maxSdkVersion=\"30\" />"));
        for f in FUNCIONES_MEDIOS {
            assert!(m.contains(&format!("<uses-feature android:name=\"{f}\" android:required=\"false\" />")), "{f}");
        }
        // La plantilla sigue intacta alrededor.
        assert!(m.contains("android.permission.INTERNET"));
        assert!(m.contains("android:name=\".MainActivity\""));
        assert_eq!(m.matches("</manifest>").count(), 1);
    }

    #[test]
    fn medios_idempotente_y_compatible_con_el_servicio() {
        let una = parchear_medios(PLANTILLA).unwrap();
        assert_eq!(parchear_medios(&una).unwrap(), una);
        // Servicio y medios, en cualquier orden y repetidos: siempre el mismo archivo.
        let a = parchear_medios(&parchear_manifiesto(PLANTILLA).unwrap()).unwrap();
        let b = parchear_manifiesto(&parchear_medios(PLANTILLA).unwrap()).unwrap();
        assert_eq!(a, b);
        assert_eq!(parchear_manifiesto(&parchear_medios(&a).unwrap()).unwrap(), a);
        assert_eq!(a.matches(MEDIOS_INICIO).count(), 1);
        assert_eq!(a.matches(PERMISOS_INICIO).count(), 1);
        assert_eq!(a.matches("\"android.permission.POST_NOTIFICATIONS\"").count(), 1);
    }

    #[test]
    fn medios_no_duplica_lo_ya_declarado() {
        let con = PLANTILLA.replace(
            "<uses-permission android:name=\"android.permission.INTERNET\" />",
            "<uses-permission android:name=\"android.permission.INTERNET\" />\n    <uses-permission android:name=\"android.permission.CAMERA\" />\n    <uses-permission android:name=\"android.permission.BLUETOOTH\" />",
        );
        let m = parchear_medios(&con).unwrap();
        assert_eq!(m.matches("\"android.permission.CAMERA\"").count(), 1);
        assert_eq!(m.matches("\"android.permission.BLUETOOTH\"").count(), 1, "el BLUETOOTH ya declarado no se repite");
        assert!(m.contains("\"android.permission.RECORD_AUDIO\""));
        assert!(m.contains("\"android.permission.BLUETOOTH_CONNECT\""));
    }

    #[test]
    fn medios_con_manifest_en_una_sola_linea() {
        let una_linea = "<manifest xmlns:android=\"http://schemas.android.com/apk/res/android\"><application android:label=\"x\"></application></manifest>";
        let m = parchear_medios(una_linea).unwrap();
        assert!(m.find(MEDIOS_INICIO).unwrap() < m.find("<application").unwrap());
        assert_eq!(parchear_medios(&m).unwrap(), m);
    }

    #[test]
    fn medios_falla_en_alto_si_cambia_la_plantilla() {
        assert!(parchear_medios("<foo></foo>").unwrap_err().contains("<manifest>"));
        assert!(parchear_medios("<manifest xmlns:android=\"x\"></manifest>").unwrap_err().contains("<application>"));
    }

    #[test]
    fn medios_en_las_tres_apps() {
        assert!(aplica_medios("app.starseed.os"));
        assert!(aplica_medios("app.starseed.`os`"));
        assert!(aplica_medios("app.starseed.nexus"));
        assert!(aplica_medios("app.starseed.cafe"));
        assert!(!aplica_medios("com.example.app"));
        assert!(!aplica_medios(""));
    }

    #[test]
    fn medios_en_disco() {
        let dir = std::env::temp_dir().join(format!("ss-android-medios-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("app/src/main")).unwrap();
        std::fs::write(dir.join("app/src/main/AndroidManifest.xml"), PLANTILLA).unwrap();
        assert_eq!(aplicar_medios(&dir), Ok(true));
        assert_eq!(aplicar_medios(&dir), Ok(false), "la segunda vez no reescribe");
        // El servicio después no lo deshace (y tampoco reescribe la segunda vez).
        aplicar(&dir, "starseed_native_lib").unwrap();
        assert_eq!(aplicar_medios(&dir), Ok(false));
        assert!(aplicar(&dir, "starseed_native_lib").unwrap().is_empty());
        let t = std::fs::read_to_string(dir.join("app/src/main/AndroidManifest.xml")).unwrap();
        assert!(t.contains("\"android.permission.RECORD_AUDIO\"") && t.contains("app.starseed.nativa.ServicioAntenas"));
        assert!(aplicar_medios(&dir.join("no-existe")).unwrap_err().contains("android init"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn kotlin_abre_los_ajustes_de_la_app() {
        let arranque = KOTLIN.iter().find(|(n, _)| *n == "ArranqueStarSeed.kt").unwrap().1;
        assert!(arranque.contains("\"ajustes\" -> abrirAjustes(a)"));
        assert!(arranque.contains("Settings.ACTION_APPLICATION_DETAILS_SETTINGS"));
    }
}
