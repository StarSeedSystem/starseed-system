// ═══════════════════════════════════════════════════════════════════════════
// enlace_wifi_parche — el enlace Wi-Fi directo en el proyecto Android que genera Tauri (WFD1108A,
// 2026-11-08). Contrato: architecture/wifi-directo.md §4.
// ---------------------------------------------------------------------------
// Como android_parche.rs y android_actualizador.rs, en su propio bloque para no pisarse con ellos:
// build.rs lo aplica tras `cargo tauri android init` y antes de que Gradle procese el manifiesto.
// Escribe:
//   · los permisos: Wi-Fi (estado y cambio), «Dispositivos cercanos» (NEARBY_WIFI_DEVICES, Android 13+,
//     sin uso de ubicación) y «Ubicación precisa» SOLO hasta Android 12 (Android la exige ahí para crear o
//     buscar redes Wi-Fi), y Wi-Fi Direct como función opcional;
//   · el proveedor `ArranqueEnlaceWifi` (arranca la parte Android con el proceso);
//   · `EnlaceWifiDirecto.kt` (punto de acceso local, grupo Wi-Fi Direct y unirse a uno).
// Solo std (lo usa build.rs con `#[path]`). Idempotente. Solo StarSeed OS.
// ═══════════════════════════════════════════════════════════════════════════

#![allow(dead_code)]

use std::path::{Path, PathBuf};

pub const PAQUETE_OS: &str = "app.starseed.os";

const PERMISOS_INICIO: &str = "<!-- STARSEED-ENLACE-WIFI:PERMISOS:INICIO (no editar: lo escribe native/src-tauri/build.rs · WFD1108A) -->";
const PERMISOS_FIN: &str = "<!-- STARSEED-ENLACE-WIFI:PERMISOS:FIN -->";
const COMPONENTES_INICIO: &str = "<!-- STARSEED-ENLACE-WIFI:COMPONENTES:INICIO (no editar: lo escribe native/src-tauri/build.rs · WFD1108A) -->";
const COMPONENTES_FIN: &str = "<!-- STARSEED-ENLACE-WIFI:COMPONENTES:FIN -->";

/// Permisos normales (sin pregunta) del enlace.
pub const PERMISOS: [&str; 3] = [
    "android.permission.ACCESS_WIFI_STATE",
    "android.permission.CHANGE_WIFI_STATE",
    "android.permission.ACCESS_NETWORK_STATE",
];
/// «Dispositivos cercanos» (Android 13+): se declara sin uso de ubicación.
pub const PERMISO_CERCANOS: &str = "android.permission.NEARBY_WIFI_DEVICES";
/// «Ubicación precisa»: solo hasta Android 12 (API 32), donde Android la exige para redes Wi-Fi.
pub const PERMISO_UBICACION: &str = "android.permission.ACCESS_FINE_LOCATION";
pub const FUNCION_P2P: &str = "android.hardware.wifi.direct";

pub const KOTLIN: &str = include_str!("../android/EnlaceWifiDirecto.kt");

// (WFA1109A) Wi-Fi Aware: el Kotlin completo, y una variante mínima con la misma API que dice «sin soporte»
// (`STARSEED_SIN_WIFI_AWARE=1` en el build: el APK sale sin una línea de Aware y sigue compilando).
pub const KOTLIN_AWARE: &str = include_str!("../android/WifiAwareStarSeed.kt");
pub const FUNCION_AWARE: &str = "android.hardware.wifi.aware";
pub const ENTORNO_SIN_AWARE: &str = "STARSEED_SIN_WIFI_AWARE";
pub const KOTLIN_AWARE_SIN: &str = r#"// Lo copia native/src-tauri/build.rs (STARSEED_SIN_WIFI_AWARE=1): Wi-Fi Aware desactivado en este build.
package app.starseed.nativa

import android.content.Context
import org.json.JSONObject

object WifiAwareStarSeed {
    interface Salida {
        fun fase(ses: String, fase: String, codigo: String?, mensaje: String, extra: JSONObject?)
        fun credenciales(ses: String, ssid: String, clave: String)
    }

    fun soportado(ctx: Context): Boolean = false

    fun disponible(ctx: Context): Boolean = false

    fun abrirAp(ctx: Context, ses: String, huellaPropia: String?, huellaOtro: String?, salida: Salida) {
        salida.fase(ses, "error", "sin-soporte", "Wi-Fi Aware está desactivado en esta compilación.", null)
    }

    fun unirse(ctx: Context, ses: String, huellaPropia: String?, huellaOtro: String?, clave: String, salida: Salida) {
        salida.fase(ses, "error", "sin-soporte", "Wi-Fi Aware está desactivado en esta compilación.", null)
    }

    fun cerrar() {}
}
"#;

/// ¿El build desactiva Wi-Fi Aware?
pub fn sin_aware_en_entorno() -> bool {
    std::env::var_os(ENTORNO_SIN_AWARE).map(|v| !v.is_empty() && v != "0").unwrap_or(false)
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
    for p in PERMISOS.iter().filter(|p| !ya_declarado(manifiesto_sin_bloques, p)) {
        s.push_str(&format!("    <uses-permission android:name=\"{p}\" />\n"));
    }
    if !ya_declarado(manifiesto_sin_bloques, PERMISO_CERCANOS) {
        s.push_str(&format!("    <uses-permission android:name=\"{PERMISO_CERCANOS}\" android:usesPermissionFlags=\"neverForLocation\" />\n"));
    }
    if !ya_declarado(manifiesto_sin_bloques, PERMISO_UBICACION) {
        s.push_str(&format!("    <uses-permission android:name=\"{PERMISO_UBICACION}\" android:maxSdkVersion=\"32\" />\n"));
    }
    if !ya_declarado(manifiesto_sin_bloques, FUNCION_P2P) {
        s.push_str(&format!("    <uses-feature android:name=\"{FUNCION_P2P}\" android:required=\"false\" />\n"));
    }
    if !ya_declarado(manifiesto_sin_bloques, FUNCION_AWARE) {
        s.push_str(&format!("    <uses-feature android:name=\"{FUNCION_AWARE}\" android:required=\"false\" />\n"));
    }
    s.push_str(&format!("    {PERMISOS_FIN}\n"));
    s
}

/// El proveedor que arranca la parte Android con el proceso (dentro de `<application>`).
pub fn bloque_componentes() -> String {
    format!(
        "        {COMPONENTES_INICIO}
        <provider
            android:name=\"app.starseed.nativa.ArranqueEnlaceWifi\"
            android:authorities=\"${{applicationId}}.starseed-enlace-wifi\"
            android:exported=\"false\"
            android:initOrder=\"80\" />
        {COMPONENTES_FIN}
"
    )
}

/// Manifiesto con los dos bloques (sustituye los que hubiera): permisos antes de la línea de
/// `<application`, el proveedor antes de la de `</application>`.
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
    aplicar_con(proyecto, sin_aware_en_entorno())
}

/// Como `aplicar`, eligiendo si Wi-Fi Aware va completo o desactivado (idempotente en los dos casos).
pub fn aplicar_con(proyecto: &Path, sin_aware: bool) -> Result<Vec<PathBuf>, String> {
    let mut cambiados = Vec::new();
    let principal = proyecto.join("app/src/main");
    let manifiesto = principal.join("AndroidManifest.xml");
    let texto = std::fs::read_to_string(&manifiesto)
        .map_err(|e| format!("No se pudo leer {}: {e} (¿falta `cargo tauri android init`?)", manifiesto.display()))?;
    if escribir_si_cambia(&manifiesto, &parchear_manifiesto(&texto)?)? {
        cambiados.push(manifiesto);
    }
    let kotlin = principal.join("java/app/starseed/nativa/EnlaceWifiDirecto.kt");
    if escribir_si_cambia(&kotlin, KOTLIN)? {
        cambiados.push(kotlin);
    }
    let aware = principal.join("java/app/starseed/nativa/WifiAwareStarSeed.kt");
    if escribir_si_cambia(&aware, if sin_aware { KOTLIN_AWARE_SIN } else { KOTLIN_AWARE })? {
        cambiados.push(aware);
    }
    Ok(cambiados)
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::enlace_wifi_logica as logica;

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
    fn inserta_permisos_y_proveedor_en_su_sitio() {
        let m = parchear_manifiesto(PLANTILLA).unwrap();
        let p = m.find(PERMISOS_INICIO).unwrap();
        let a = m.find("<application").unwrap();
        let c = m.find(COMPONENTES_INICIO).unwrap();
        let cierre = m.rfind("</application>").unwrap();
        assert!(p < a, "los permisos van antes de <application>");
        assert!(a < c && c < cierre, "el proveedor va dentro de <application>");
        assert!(m.contains("<uses-permission android:name=\"android.permission.NEARBY_WIFI_DEVICES\" android:usesPermissionFlags=\"neverForLocation\" />"));
        assert!(m.contains("<uses-permission android:name=\"android.permission.ACCESS_FINE_LOCATION\" android:maxSdkVersion=\"32\" />"), "la ubicación solo hasta Android 12");
        assert!(m.contains("<uses-feature android:name=\"android.hardware.wifi.direct\" android:required=\"false\" />"), "la app también vale sin Wi-Fi Direct");
        assert!(m.contains("android:name=\"app.starseed.nativa.ArranqueEnlaceWifi\""));
        assert!(m.contains("${applicationId}.starseed-enlace-wifi"));
    }

    #[test]
    fn es_idempotente_y_no_duplica() {
        let una = parchear_manifiesto(PLANTILLA).unwrap();
        assert_eq!(parchear_manifiesto(&una).unwrap(), una);
        let con = PLANTILLA.replace(
            "<uses-permission android:name=\"android.permission.INTERNET\" />",
            "<uses-permission android:name=\"android.permission.INTERNET\" />\n    <uses-permission android:name=\"android.permission.ACCESS_FINE_LOCATION\" />\n    <uses-permission android:name=\"android.permission.ACCESS_WIFI_STATE\" />",
        );
        let m = parchear_manifiesto(&con).unwrap();
        assert_eq!(m.matches("\"android.permission.ACCESS_FINE_LOCATION\"").count(), 1, "no se pisa la ubicación ya declarada");
        assert_eq!(m.matches("\"android.permission.ACCESS_WIFI_STATE\"").count(), 1);
    }

    #[test]
    fn convive_con_los_demas_parches() {
        // build.rs aplica: servicio, medios, actualizador y enlace Wi-Fi, en cada build: punto fijo.
        let pasada = |t: &str| {
            let t = crate::android_parche::parchear_manifiesto(t).unwrap();
            let t = crate::android_parche::parchear_medios(&t).unwrap();
            let t = crate::android_actualizador::parchear_manifiesto(&t).unwrap();
            parchear_manifiesto(&t).unwrap()
        };
        let una = pasada(PLANTILLA);
        let dos = pasada(&una);
        assert_eq!(una, dos, "punto fijo tras una pasada");
        assert_eq!(dos.matches(PERMISOS_INICIO).count(), 1);
        assert_eq!(dos.matches(COMPONENTES_INICIO).count(), 1);
        // ACCESS_WIFI_STATE y ACCESS_NETWORK_STATE ya los declara el servicio de antenas: una sola vez.
        assert_eq!(dos.matches("\"android.permission.ACCESS_WIFI_STATE\"").count(), 1);
        assert_eq!(dos.matches("\"android.permission.ACCESS_NETWORK_STATE\"").count(), 1);
        assert!(dos.contains("app.starseed.nativa.ServicioAntenas") && dos.contains("app.starseed.nativa.ProveedorActualizacion"));
    }

    #[test]
    fn falla_en_alto_si_cambia_la_plantilla() {
        assert!(parchear_manifiesto("<manifest></manifest>").unwrap_err().contains("<application>"));
    }

    #[test]
    fn wifi_aware_kotlin_y_variante_desactivada_tienen_la_misma_api() {
        for k in [KOTLIN_AWARE, KOTLIN_AWARE_SIN] {
            assert!(k.contains("package app.starseed.nativa") && k.contains("object WifiAwareStarSeed"));
            for api in ["interface Salida", "fun soportado(", "fun disponible(", "fun abrirAp(", "fun unirse(", "fun cerrar("] {
                assert!(k.contains(api), "falta {api}");
            }
        }
        assert!(KOTLIN_AWARE.contains("const val SERVICIO = \"starseed-malla\""));
        assert!(KOTLIN_AWARE.contains("WifiAwareNetworkSpecifier") && KOTLIN_AWARE.contains("ACTION_WIFI_AWARE_STATE_CHANGED") && KOTLIN_AWARE.contains("FEATURE_WIFI_AWARE"));
        assert!(!KOTLIN_AWARE.contains("{{") && !KOTLIN_AWARE_SIN.contains("WifiAwareManager"));
        // EnlaceWifiDirecto la usa con la misma firma y escribe los campos nuevos del puente y del estado.
        assert!(KOTLIN.contains("WifiAwareStarSeed.abrirAp(") && KOTLIN.contains("WifiAwareStarSeed.unirse(") && KOTLIN.contains("WifiAwareStarSeed.cerrar()"));
        assert!(KOTLIN.contains(".put(\"aware\"") && KOTLIN.contains(".put(\"aware_disponible\""));
        assert!(KOTLIN_AWARE.contains("\"ip_otro\"") && KOTLIN_AWARE.contains("\"ip_propia\""));
        let m = parchear_manifiesto(PLANTILLA).unwrap();
        assert!(m.contains("<uses-feature android:name=\"android.hardware.wifi.aware\" android:required=\"false\" />"));
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
        assert!(KOTLIN.contains("class ArranqueEnlaceWifi : ContentProvider()"));
        // Misma carpeta y mismos archivos a los dos lados.
        assert!(KOTLIN.contains(&format!("const val CARPETA = \"{}\"", logica::CARPETA_ANDROID)));
        assert!(KOTLIN.contains(&format!("const val PETICION = \"{}\"", logica::PETICION)));
        assert!(KOTLIN.contains(&format!("const val ESTADO = \"{}\"", logica::ESTADO)));
        assert!(KOTLIN.contains(&format!("const val PUENTE = \"{}\"", logica::PUENTE)));
        assert!(KOTLIN.contains(&format!("const val CREDENCIALES = \"{}\"", logica::CREDENCIALES)));
        // Kotlin atiende todas las acciones que Rust pide.
        for a in logica::ACCIONES {
            assert!(KOTLIN.contains(&format!("\"{a}\" ->")), "Kotlin no atiende «{a}»");
        }
        // Lo que escribe Kotlin en el estado son campos de EstadoEnlaceWifi, y nunca la contraseña.
        for campo in ["sesion", "fase", "rol", "metodo", "codigo", "mensaje", "t", "ssid", "ip_propia", "ip_ap", "banda"] {
            assert!(KOTLIN.contains(&format!(".put(\"{campo}\"")), "Kotlin no escribe «{campo}»");
        }
        let estado = serde_json::to_value(logica::EstadoEnlaceWifi::default()).unwrap();
        for campo in ["sesion", "fase", "rol", "metodo", "codigo", "mensaje", "t", "ssid", "ip_propia", "ip_ap", "banda"] {
            assert!(estado.get(campo).is_some(), "EstadoEnlaceWifi no tiene «{campo}»");
        }
        assert!(estado.get("clave").is_none(), "el estado nunca lleva la contraseña");
        // El puente: los campos de PuenteAndroid.
        for campo in ["version", "sdk", "p2p", "hotspot_local", "cliente_p2p", "permiso", "wifi"] {
            assert!(KOTLIN.contains(&format!(".put(\"{campo}\"")), "puente.json sin «{campo}»");
        }
        // Las credenciales: lo que lee `leer_credenciales`.
        assert!(KOTLIN.contains("JSONObject().put(\"sesion\", ses).put(\"ssid\", ssid).put(\"clave\", clave).put(\"banda\", banda).put(\"ip\", ip)"));
        // Las fases que escribe Kotlin son las que entiende la web (enlace-wifi-motor.ts).
        for fase in ["\"abriendo\"", "\"red-lista\"", "\"uniendo\"", "\"unida\"", "\"cerrado\"", "\"error\""] {
            assert!(KOTLIN.contains(fase), "Kotlin no escribe la fase {fase}");
        }
        for codigo in ["\"permiso-denegado\"", "\"sin-soporte\"", "\"fallo-nativo\"", "\"no-encontrada\""] {
            assert!(KOTLIN.contains(codigo), "Kotlin no usa el código {codigo}");
        }
        // Permisos en tiempo de ejecución: los mismos que declara el manifiesto.
        assert!(KOTLIN.contains("\"android.permission.NEARBY_WIFI_DEVICES\"") && KOTLIN.contains("Manifest.permission.ACCESS_FINE_LOCATION"));
        // Las API que se usan.
        assert!(KOTLIN.contains("startLocalOnlyHotspot") && KOTLIN.contains("WifiP2pConfig.Builder()") && KOTLIN.contains("createGroup") && KOTLIN.contains(".connect("));
    }

    #[test]
    fn aplica_a_un_proyecto_en_disco_y_no_reescribe() {
        let dir = std::env::temp_dir().join(format!("ss-android-wfd-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("app/src/main")).unwrap();
        std::fs::write(dir.join("app/src/main/AndroidManifest.xml"), PLANTILLA).unwrap();
        let primera = aplicar(&dir).unwrap();
        assert_eq!(primera.len(), 3, "manifiesto + Kotlin + Wi-Fi Aware");
        assert!(dir.join("app/src/main/java/app/starseed/nativa/EnlaceWifiDirecto.kt").is_file());
        assert!(dir.join("app/src/main/java/app/starseed/nativa/WifiAwareStarSeed.kt").is_file());
        assert!(aplicar_con(&dir, false).unwrap().is_empty(), "la segunda vez no cambia nada");
        // STARSEED_SIN_WIFI_AWARE: solo cambia la variante de Aware, y también es idempotente.
        let sin = aplicar_con(&dir, true).unwrap();
        assert_eq!(sin.len(), 1);
        assert!(std::fs::read_to_string(&sin[0]).unwrap().contains("desactivado en esta compilación"));
        assert!(aplicar_con(&dir, true).unwrap().is_empty());
        assert_eq!(aplicar_con(&dir, false).unwrap().len(), 1, "volver a encender Aware restituye el Kotlin completo");
        assert!(aplicar(&dir.join("no-existe")).unwrap_err().contains("android init"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
