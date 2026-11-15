// ═══════════════════════════════════════════════════════════════════════════
// ubicacion_parche — la ubicación del aparato en el proyecto Android que genera Tauri (UBI1114K, 2026-11-14).
// Contrato: architecture/ubicacion-nativa.md.
// ---------------------------------------------------------------------------
// Como llamada_nativa_parche.rs, en su propio bloque para no pisarse con los otros parches: build.rs lo aplica
// tras `cargo tauri android init` y antes de que Gradle procese el manifiesto. Escribe:
//   · los permisos de ubicación (fina y aproximada). SIN ellos Android niega al instante cualquier petición, y
//     el WebView de wry no llega a enseñar el aviso. Siempre se declaran los dos, con independencia de lo que
//     declare otro parche: el del Bluetooth declara la fina solo hasta Android 11 y, si fuera el único,
//     la ubicación quedaría muerta en Android 12+. build.rs aplica este parche ANTES que el del Bluetooth,
//     que entonces no repite la fina. La función de GPS es opcional (una tableta sin GPS se instala igual);
//   · el proveedor `ArranqueUbicacion` (queda a la escucha de las peticiones de Rust; no pide nada solo);
//   · `UbicacionStarSeed.kt`.
// Solo std (lo usa build.rs con `#[path]`). Idempotente. Solo StarSeed OS.
// Interruptor de emergencia: STARSEED_SIN_UBICACION_ANDROID=1.
// ═══════════════════════════════════════════════════════════════════════════

#![allow(dead_code)]

use std::path::{Path, PathBuf};

pub const PAQUETE_OS: &str = "app.starseed.os";

const PERMISOS_INICIO: &str = "<!-- STARSEED-UBICACION:PERMISOS:INICIO (no editar: lo escribe native/src-tauri/build.rs · UBI1114K) -->";
const PERMISOS_FIN: &str = "<!-- STARSEED-UBICACION:PERMISOS:FIN -->";
const COMPONENTES_INICIO: &str = "<!-- STARSEED-UBICACION:COMPONENTES:INICIO (no editar: lo escribe native/src-tauri/build.rs · UBI1114K) -->";
const COMPONENTES_FIN: &str = "<!-- STARSEED-UBICACION:COMPONENTES:FIN -->";

/// Permisos y para qué. Android 12+ deja a la persona dar solo la aproximada: la app lo dice como «aproximado».
pub const PERMISOS: [(&str, &str); 2] = [
    ("android.permission.ACCESS_FINE_LOCATION", "Ubicación exacta del aparato para el mapa de Señales y «Usar mi ubicación»; solo cuando la persona lo pide."),
    ("android.permission.ACCESS_COARSE_LOCATION", "Ubicación aproximada (Android 12+ deja elegirla en vez de la exacta)."),
];
pub const FUNCION_GPS: &str = "android.hardware.location.gps";

pub const COMPONENTES: [&str; 1] = ["app.starseed.nativa.ArranqueUbicacion"];

pub const KOTLIN: &str = include_str!("../android/UbicacionStarSeed.kt");

/// `STARSEED_SIN_UBICACION_ANDROID`: cualquier valor salvo vacío, «0» o «false» lo apaga.
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

/// Bloque de permisos: los dos de ubicación SIEMPRE (ver la nota de arriba); la función de GPS, opcional.
pub fn bloque_permisos(manifiesto_sin_bloques: &str) -> String {
    let mut s = format!("    {PERMISOS_INICIO}\n");
    for (p, porque) in PERMISOS {
        s.push_str(&format!("    <!-- {porque} -->\n    <uses-permission android:name=\"{p}\" />\n"));
    }
    if !ya_declarado(manifiesto_sin_bloques, FUNCION_GPS) {
        s.push_str(&format!("    <uses-feature android:name=\"{FUNCION_GPS}\" android:required=\"false\" />\n"));
    }
    s.push_str(&format!("    {PERMISOS_FIN}\n"));
    s
}

pub fn bloque_componentes() -> String {
    format!(
        "        {COMPONENTES_INICIO}
        <provider
            android:name=\"app.starseed.nativa.ArranqueUbicacion\"
            android:authorities=\"${{applicationId}}.starseed-ubicacion\"
            android:exported=\"false\"
            android:initOrder=\"60\" />
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
    Ok(format!(
        "{}{}{}{}{}",
        &limpio[..linea_app],
        bloque_permisos(&limpio),
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
    let kotlin = principal.join("java/app/starseed/nativa/UbicacionStarSeed.kt");
    if escribir_si_cambia(&kotlin, KOTLIN)? {
        cambiados.push(kotlin);
    }
    Ok(cambiados)
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::ubicacion_logica as logica;

    const PLANTILLA: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />

    <application
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name">
        <activity
            android:name=".MainActivity"
            android:exported="true">
        </activity>
    </application>
</manifest>
"#;

    #[test]
    fn declara_las_dos_ubicaciones_y_el_proveedor_en_su_sitio() {
        let m = parchear_manifiesto(PLANTILLA).unwrap();
        let p = m.find(PERMISOS_INICIO).unwrap();
        let a = m.find("<application").unwrap();
        let c = m.find(COMPONENTES_INICIO).unwrap();
        let cierre = m.rfind("</application>").unwrap();
        assert!(p < a && a < c && c < cierre);
        assert!(m.contains("<uses-permission android:name=\"android.permission.ACCESS_FINE_LOCATION\" />"));
        assert!(m.contains("<uses-permission android:name=\"android.permission.ACCESS_COARSE_LOCATION\" />"));
        assert!(!m.contains("ACCESS_BACKGROUND_LOCATION"), "nunca ubicación en segundo plano");
        assert!(m.contains("<uses-feature android:name=\"android.hardware.location.gps\" android:required=\"false\" />"), "una tableta sin GPS se instala igual");
        assert!(m.contains("app.starseed.nativa.ArranqueUbicacion") && m.contains("${applicationId}.starseed-ubicacion"));
    }

    #[test]
    fn es_idempotente() {
        let una = parchear_manifiesto(PLANTILLA).unwrap();
        assert_eq!(parchear_manifiesto(&una).unwrap(), una);
        assert_eq!(una.matches(PERMISOS_INICIO).count(), 1);
    }

    #[test]
    fn con_el_parche_del_bluetooth_la_fina_queda_sin_tope_de_version_y_una_sola_vez() {
        // Orden de build.rs: la ubicación va ANTES que el Bluetooth. Dos pasadas = punto fijo.
        let pasada = |t: &str| {
            let t = parchear_manifiesto(t).unwrap();
            crate::android_ble::parchear_manifiesto(&t).unwrap()
        };
        let una = pasada(PLANTILLA);
        let dos = pasada(&una);
        assert_eq!(una, dos, "punto fijo");
        assert_eq!(dos.matches("\"android.permission.ACCESS_FINE_LOCATION\"").count(), 1, "una sola vez");
        assert!(!dos.contains("ACCESS_FINE_LOCATION\" android:maxSdkVersion"), "sin tope de versión: Android 12+ también pregunta");
        assert!(dos.contains("ACCESS_COARSE_LOCATION"));
    }

    #[test]
    fn falla_en_alto_si_cambia_la_plantilla() {
        assert!(parchear_manifiesto("<manifest></manifest>").unwrap_err().contains("<application>"));
    }

    #[test]
    fn interruptor_y_paquete() {
        assert!(!apagado(None) && !apagado(Some("0")) && apagado(Some("1")));
        assert!(aplica("app.starseed.os") && aplica("app.starseed.`os`") && !aplica("app.starseed.nexus"));
    }

    #[test]
    fn kotlin_y_rust_dicen_lo_mismo() {
        assert!(KOTLIN.contains("package app.starseed.nativa"));
        assert!(KOTLIN.contains("class ArranqueUbicacion : ContentProvider()"));
        assert!(KOTLIN.contains(&format!("const val CARPETA = \"{}\"", logica::CARPETA_ANDROID)));
        assert!(KOTLIN.contains(&format!("const val ESTADO = \"{}\"", logica::ESTADO)));
        assert!(KOTLIN.contains(&format!("const val PREFIJO_PETICION = \"{}\"", logica::PREFIJO_PETICION)));
        // Los códigos de error y de permiso que escribe Kotlin los entiende Rust (ninguno cae en «no disponible» por un typo).
        for c in ["denegado", "sin-preguntar", "servicios-apagados", "sin-fijar"] {
            assert!(KOTLIN.contains(&format!("\"{c}\"")), "Kotlin no escribe «{c}»");
            assert_ne!(logica::codigo_de_texto(c), logica::Codigo::NoDisponible, "{c}");
        }
        for p in ["concedido", "aproximado", "sin-preguntar", "denegado"] {
            assert!(KOTLIN.contains(&format!("\"{p}\"")), "Kotlin no escribe «{p}»");
            assert_ne!(logica::permiso_de_texto(p), logica::Permiso::NoDisponible, "{p}");
        }
        // Los campos del fix son los de Rust.
        for campo in ["lat", "lon", "precision_m", "altitud_m", "precision_altitud_m", "rumbo", "velocidad_ms", "t_ms", "fuente", "respuesta_a"] {
            assert!(KOTLIN.contains(&format!("\"{campo}\"")), "Kotlin no escribe «{campo}»");
        }
    }

    #[test]
    fn la_app_nunca_se_concede_nada() {
        // Solo se PIDE (aviso del sistema) y solo con `pedir`; nada escribe permisos del sistema.
        assert!(!KOTLIN.contains("grantRuntimePermission") && !KOTLIN.contains("pm grant") && !KOTLIN.contains("appops"));
        assert!(!KOTLIN.contains("ACCESS_BACKGROUND_LOCATION"));
    }
}
