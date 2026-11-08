// ═══════════════════════════════════════════════════════════════════════════
// android_actualizador — el actualizador interno del APK en el proyecto Android que genera Tauri
// (ACT1108A, 2026-11-08). Contrato: architecture/centro-versiones-1105.md §9.
// ---------------------------------------------------------------------------
// Como android_parche.rs (servicio de antenas) y en su propio bloque para no pisarse con él: build.rs
// lo aplica tras `cargo tauri android init` y antes de que Gradle procese el manifiesto. Escribe:
//   · el permiso `REQUEST_INSTALL_PACKAGES` (sin él Android ni deja pedir «Instalar apps desconocidas»);
//   · dos proveedores: `ArranqueActualizador` (arranca el actualizador con el proceso) y
//     `ProveedorActualizacion` (FileProvider propio: el instalador lee el APK por content://);
//   · `res/xml/starseed_actualizacion.xml` (solo filesDir/starseed/actualizacion/);
//   · `ActualizadorApk.kt` (descarga, verifica SHA-256 / paquete / firma y abre el instalador).
// Solo std (lo usa build.rs con `#[path]`). Idempotente: bloques entre marcadores, archivos escritos
// solo si cambian. Solo StarSeed OS (Nexus y Café no tienen canal de APK todavía).
// ═══════════════════════════════════════════════════════════════════════════

#![allow(dead_code)]

use std::path::{Path, PathBuf};

pub const PAQUETE_OS: &str = "app.starseed.os";

const PERMISOS_INICIO: &str = "<!-- STARSEED-ACTUALIZADOR:PERMISOS:INICIO (no editar: lo escribe native/src-tauri/build.rs · ACT1108A) -->";
const PERMISOS_FIN: &str = "<!-- STARSEED-ACTUALIZADOR:PERMISOS:FIN -->";
const COMPONENTES_INICIO: &str = "<!-- STARSEED-ACTUALIZADOR:COMPONENTES:INICIO (no editar: lo escribe native/src-tauri/build.rs · ACT1108A) -->";
const COMPONENTES_FIN: &str = "<!-- STARSEED-ACTUALIZADOR:COMPONENTES:FIN -->";

/// Permisos del actualizador: instalar paquetes (pide confirmación siempre), red y la notificación.
pub const PERMISOS: [&str; 3] = [
    "android.permission.REQUEST_INSTALL_PACKAGES",
    "android.permission.INTERNET",
    "android.permission.POST_NOTIFICATIONS",
];

/// Autoridad del FileProvider (sufijo; Kotlin usa `packageName + SUFIJO_AUTORIDAD`).
pub const SUFIJO_AUTORIDAD: &str = ".starseed-actualizacion";
/// Recurso con las rutas que comparte el FileProvider.
pub const RECURSO_RUTAS: &str = "starseed_actualizacion";

pub const KOTLIN: &str = include_str!("../android/ActualizadorApk.kt");

/// Rutas del FileProvider: SOLO la carpeta del actualizador (nada más de la app sale por content://).
pub const RUTAS_XML: &str = "<?xml version=\"1.0\" encoding=\"utf-8\"?>
<!-- Lo escribe native/src-tauri/build.rs (StarSeed · actualizador interno del APK · ACT1108A). -->
<paths>
    <files-path name=\"actualizacion\" path=\"starseed/actualizacion/\" />
</paths>
";

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

/// Los dos proveedores (dentro de `<application>`).
pub fn bloque_componentes() -> String {
    format!(
        "        {COMPONENTES_INICIO}
        <provider
            android:name=\"app.starseed.nativa.ArranqueActualizador\"
            android:authorities=\"${{applicationId}}.starseed-actualizador-arranque\"
            android:exported=\"false\"
            android:initOrder=\"90\" />
        <provider
            android:name=\"app.starseed.nativa.ProveedorActualizacion\"
            android:authorities=\"${{applicationId}}{SUFIJO_AUTORIDAD}\"
            android:exported=\"false\"
            android:grantUriPermissions=\"true\">
            <meta-data
                android:name=\"android.support.FILE_PROVIDER_PATHS\"
                android:resource=\"@xml/{RECURSO_RUTAS}\" />
        </provider>
        {COMPONENTES_FIN}
"
    )
}

/// Devuelve el manifiesto con los dos bloques (sustituye los que ya hubiera): los permisos justo antes
/// de la línea de `<application`, los proveedores justo antes de la de `</application>`.
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

/// ¿Se inyecta en este paquete? Solo StarSeed OS (sin las comillas invertidas que Tauri añade a
/// palabras reservadas de Kotlin).
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
    let rutas = principal.join(format!("res/xml/{RECURSO_RUTAS}.xml"));
    if escribir_si_cambia(&rutas, RUTAS_XML)? {
        cambiados.push(rutas);
    }
    let kotlin = principal.join("java/app/starseed/nativa/ActualizadorApk.kt");
    if escribir_si_cambia(&kotlin, KOTLIN)? {
        cambiados.push(kotlin);
    }
    Ok(cambiados)
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::canal_actualizacion_logica as logica;

    // La misma forma de manifiesto que genera Tauri 2 (resumida; la de android_parche.rs).
    const PLANTILLA: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

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
    fn inserta_permiso_y_proveedores_en_su_sitio() {
        let m = parchear_manifiesto(PLANTILLA).unwrap();
        let p = m.find(PERMISOS_INICIO).unwrap();
        let a = m.find("<application").unwrap();
        let c = m.find(COMPONENTES_INICIO).unwrap();
        let cierre = m.rfind("</application>").unwrap();
        assert!(p < a, "los permisos van antes de <application>");
        assert!(a < c && c < cierre, "los proveedores van dentro de <application>");
        assert_eq!(m.matches("\"android.permission.REQUEST_INSTALL_PACKAGES\"").count(), 1);
        assert_eq!(m.matches("\"android.permission.INTERNET\"").count(), 1, "no repite lo que ya trae la plantilla");
        assert_eq!(m.matches("\"android.permission.POST_NOTIFICATIONS\"").count(), 1);
        assert!(m.contains("android:name=\"app.starseed.nativa.ProveedorActualizacion\""));
        assert!(m.contains("android:authorities=\"${applicationId}.starseed-actualizacion\""));
        assert!(m.contains("android:resource=\"@xml/starseed_actualizacion\""));
        assert!(m.contains("app.starseed.nativa.ArranqueActualizador"));
        // El FileProvider de Tauri sigue intacto (otra clase y otra autoridad: no chocan).
        assert!(m.contains("android:authorities=\"${applicationId}.fileprovider\""));
        assert_eq!(m.matches("android:name=\"androidx.core.content.FileProvider\"").count(), 1);
    }

    #[test]
    fn es_idempotente() {
        let una = parchear_manifiesto(PLANTILLA).unwrap();
        let dos = parchear_manifiesto(&una).unwrap();
        assert_eq!(una, dos);
        assert_eq!(dos.matches(PERMISOS_INICIO).count(), 1);
        assert_eq!(dos.matches(COMPONENTES_INICIO).count(), 1);
    }

    #[test]
    fn convive_con_el_servicio_de_antenas_y_los_medios() {
        // build.rs aplica: servicio, medios y actualizador, en ese orden, en cada build. Tras dos
        // pasadas completas el archivo ya no cambia (punto fijo) y cada bloque está una sola vez.
        let pasada = |t: &str| {
            let t = crate::android_parche::parchear_manifiesto(t).unwrap();
            let t = crate::android_parche::parchear_medios(&t).unwrap();
            parchear_manifiesto(&t).unwrap()
        };
        let una = pasada(PLANTILLA);
        let dos = pasada(&una);
        assert_eq!(una, dos, "punto fijo tras una pasada");
        assert_eq!(dos.matches(PERMISOS_INICIO).count(), 1);
        assert_eq!(dos.matches(COMPONENTES_INICIO).count(), 1);
        assert_eq!(dos.matches("\"android.permission.POST_NOTIFICATIONS\"").count(), 1);
        assert!(dos.contains("app.starseed.nativa.ServicioAntenas") && dos.contains("android.permission.RECORD_AUDIO"));
        // Sin el servicio de antenas (STARSEED_SIN_SERVICIO_ANDROID) también.
        let sin = parchear_manifiesto(&crate::android_parche::parchear_medios(PLANTILLA).unwrap()).unwrap();
        assert_eq!(parchear_manifiesto(&crate::android_parche::parchear_medios(&sin).unwrap()).unwrap(), sin);
    }

    #[test]
    fn falla_en_alto_si_cambia_la_plantilla() {
        assert!(parchear_manifiesto("<manifest></manifest>").unwrap_err().contains("<application>"));
    }

    #[test]
    fn solo_starseed_os() {
        assert!(aplica("app.starseed.os"));
        assert!(aplica("app.starseed.`os`"));
        assert!(!aplica("app.starseed.nexus"));
        assert!(!aplica("app.starseed.cafe"));
        assert!(!aplica(""));
    }

    #[test]
    fn kotlin_y_rust_dicen_lo_mismo() {
        assert!(KOTLIN.contains("package app.starseed.nativa"));
        assert!(!KOTLIN.contains("{{"), "sin marcadores por sustituir");
        // Mismo prefijo de descargas, mismos archivos y misma autoridad a los dos lados.
        assert!(KOTLIN.contains(&format!("const val PREFIJO_DESCARGAS = \"{}\"", logica::PREFIJO_DESCARGAS)));
        assert!(KOTLIN.contains(&format!("const val CARPETA = \"{}\"", logica::CARPETA_ANDROID)));
        assert!(KOTLIN.contains(&format!("const val PETICION = \"{}\"", logica::PETICION)));
        assert!(KOTLIN.contains(&format!("const val ESTADO = \"{}\"", logica::ESTADO)));
        assert!(KOTLIN.contains(&format!("const val PUENTE = \"{}\"", logica::PUENTE)));
        assert!(KOTLIN.contains(&format!("const val SUFIJO_AUTORIDAD = \"{SUFIJO_AUTORIDAD}\"")));
        assert!(RUTAS_XML.contains(&format!("path=\"starseed/{}/\"", logica::CARPETA_ANDROID)));
        // Las clases que declara el manifiesto existen en el Kotlin.
        assert!(KOTLIN.contains("class ArranqueActualizador : ContentProvider()"));
        assert!(KOTLIN.contains("class ProveedorActualizacion : FileProvider()"));
        // Lo que lee Kotlin del estado son los campos de EstadoApk (Rust los devuelve a la web).
        for campo in ["fase", "version", "version_code", "instalada", "descargado", "total", "mensaje", "canal", "notas", "t"] {
            assert!(KOTLIN.contains(&format!(".put(\"{campo}\"")), "Kotlin no escribe «{campo}»");
        }
        // Lo que lee del manifiesto del APK (lo escribe native/scripts/canal-pruebas.mjs).
        for lectura in [
            "j.optString(\"version\")",
            "j.optLong(\"versionCode\", -1)",
            "j.optString(\"apk\")",
            "j.optString(\"sha256\")",
            "j.optLong(\"bytes\", -1)",
            "j.optString(\"notas\", \"\")",
        ] {
            assert!(KOTLIN.contains(lectura), "Kotlin no lee {lectura}");
        }
        // Android siempre pide confirmar: el instalador se abre con ACTION_VIEW y el permiso se pide en Ajustes.
        assert!(KOTLIN.contains("Intent.ACTION_VIEW") && KOTLIN.contains("application/vnd.android.package-archive"));
        assert!(KOTLIN.contains("Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES"));
        assert!(KOTLIN.contains("canRequestPackageInstalls()"));
    }

    #[test]
    fn aplica_a_un_proyecto_en_disco_y_no_reescribe() {
        let dir = std::env::temp_dir().join(format!("ss-android-act-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("app/src/main")).unwrap();
        std::fs::write(dir.join("app/src/main/AndroidManifest.xml"), PLANTILLA).unwrap();
        let primera = aplicar(&dir).unwrap();
        assert_eq!(primera.len(), 3, "manifiesto + rutas + Kotlin");
        assert!(dir.join("app/src/main/java/app/starseed/nativa/ActualizadorApk.kt").is_file());
        assert!(dir.join("app/src/main/res/xml/starseed_actualizacion.xml").is_file());
        assert!(aplicar(&dir).unwrap().is_empty(), "la segunda vez no cambia nada");
        assert!(aplicar(&dir.join("no-existe")).unwrap_err().contains("android init"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
