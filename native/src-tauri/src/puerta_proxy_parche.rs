// ═══════════════════════════════════════════════════════════════════════════
// puerta_proxy_parche — el proxy de la puerta de internet en el proyecto Android que genera Tauri
// (PTA1108B, 2026-11-08). Contrato: architecture/red-sin-dependencias.md §5.3 (c).
// ---------------------------------------------------------------------------
// Como llamada_nativa_parche.rs, en su propio bloque para no pisarse con los otros parches: build.rs lo aplica
// tras `cargo tauri android init`. Escribe:
//   · el proveedor `ArranqueProxyPuerta` (arranca ProxyPuertaStarSeed.kt al crearse el proceso). No pide ningún
//     permiso nuevo: el proxy es de 127.0.0.1 y INTERNET ya lo declara la plantilla;
//   · `ProxyPuertaStarSeed.kt` (androidx.webkit `ProxyController.setProxyOverride`);
//   · la dependencia `androidx.webkit:webkit` en `app/build.gradle.kts` SOLO si la plantilla no la trae (la de
//     Tauri 2 ya la trae: entonces no se toca nada).
// Solo std (lo usa build.rs con `#[path]`). Idempotente. Solo StarSeed OS.
// Interruptor de emergencia: STARSEED_SIN_PROXY_PUERTA=1 (el APK sale sin el módulo).
// ═══════════════════════════════════════════════════════════════════════════

#![allow(dead_code)]

use std::path::{Path, PathBuf};

pub const PAQUETE_OS: &str = "app.starseed.os";

const COMPONENTES_INICIO: &str = "<!-- STARSEED-PROXY-PUERTA:COMPONENTES:INICIO (no editar: lo escribe native/src-tauri/build.rs · PTA1108B) -->";
const COMPONENTES_FIN: &str = "<!-- STARSEED-PROXY-PUERTA:COMPONENTES:FIN -->";
const GRADLE_INICIO: &str = "// STARSEED-PROXY-PUERTA:INICIO (no editar: lo escribe native/src-tauri/build.rs · PTA1108B)";
const GRADLE_FIN: &str = "// STARSEED-PROXY-PUERTA:FIN";
/// `ProxyController` y `ProxyConfig.addBypassRule/addDirect` existen desde la 1.4.0 (Tauri 2 trae la 1.6.1).
pub const DEPENDENCIA: &str = "androidx.webkit:webkit";
pub const VERSION_DEPENDENCIA: &str = "1.8.0";

pub const COMPONENTES: [&str; 1] = ["app.starseed.nativa.ArranqueProxyPuerta"];
pub const KOTLIN: &str = include_str!("../android/ProxyPuertaStarSeed.kt");

/// `STARSEED_SIN_PROXY_PUERTA`: cualquier valor salvo vacío, «0» o «false» lo apaga.
pub fn apagado(valor: Option<&str>) -> bool {
    match valor.map(|v| v.trim().to_lowercase()) {
        Some(v) => !(v.is_empty() || v == "0" || v == "false"),
        None => false,
    }
}

/// Solo StarSeed OS (sin las comillas invertidas que Tauri añade a palabras reservadas de Kotlin).
pub fn aplica(paquete: &str) -> bool {
    paquete.replace('`', "") == PAQUETE_OS
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

/// Los componentes (dentro de `<application>`).
pub fn bloque_componentes() -> String {
    format!(
        "        {COMPONENTES_INICIO}
        <provider
            android:name=\"app.starseed.nativa.ArranqueProxyPuerta\"
            android:authorities=\"${{applicationId}}.starseed-proxy-puerta\"
            android:exported=\"false\"
            android:initOrder=\"60\" />
        {COMPONENTES_FIN}
"
    )
}

/// Manifiesto con el bloque de componentes (sustituye el que hubiera), antes de la línea de `</application>`.
pub fn parchear_manifiesto(texto: &str) -> Result<String, String> {
    let limpio = quitar_bloque(texto, COMPONENTES_INICIO, COMPONENTES_FIN);
    let app = limpio
        .find("<application")
        .ok_or("El AndroidManifest.xml no tiene <application>: ¿cambió la plantilla de Tauri?")?;
    let cierre = limpio
        .rfind("</application>")
        .ok_or("El AndroidManifest.xml no tiene </application>: ¿cambió la plantilla de Tauri?")?;
    if cierre < app {
        return Err("El AndroidManifest.xml tiene </application> antes de <application>.".into());
    }
    let linea_cierre = limpio[..cierre].rfind('\n').map(|i| i + 1).unwrap_or(cierre);
    Ok(format!("{}{}{}", &limpio[..linea_cierre], bloque_componentes(), &limpio[linea_cierre..]))
}

/// `app/build.gradle.kts` con `androidx.webkit` garantizada UNA vez: si la plantilla ya la trae (fuera de nuestro
/// bloque) no se añade nada y se quita nuestro bloque si lo hubiera; si no, se añade dentro de `dependencies { … }`.
pub fn parchear_gradle(texto: &str) -> Result<String, String> {
    let limpio = quitar_bloque(texto, GRADLE_INICIO, GRADLE_FIN);
    if limpio.contains(DEPENDENCIA) {
        return Ok(limpio);
    }
    // El `dependencies {` del módulo (sin sangría, el último), no el de `buildscript`; si todos van sangrados, el último.
    let mut sin_sangria = None;
    let mut ultimo = None;
    let mut desde = 0;
    while let Some(i) = limpio[desde..].find("dependencies {") {
        let abs = desde + i;
        let linea = limpio[..abs].rfind('\n').map(|k| k + 1).unwrap_or(0);
        let antes = &limpio[linea..abs];
        if antes.is_empty() {
            sin_sangria = Some(abs);
        }
        if antes.trim().is_empty() {
            ultimo = Some(abs);
        }
        desde = abs + "dependencies {".len();
    }
    let abs = sin_sangria.or(ultimo).ok_or("El build.gradle.kts de la app no tiene `dependencies {`: ¿cambió la plantilla de Tauri?")?;
    let fin_linea = limpio[abs..].find('\n').map(|k| abs + k + 1).ok_or("El build.gradle.kts termina en `dependencies {`.")?;
    Ok(format!(
        "{}    {GRADLE_INICIO}\n    implementation(\"{DEPENDENCIA}:{VERSION_DEPENDENCIA}\")\n    {GRADLE_FIN}\n{}",
        &limpio[..fin_linea],
        &limpio[fin_linea..]
    ))
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
    let gradle = proyecto.join("app/build.gradle.kts");
    let g = std::fs::read_to_string(&gradle).map_err(|e| format!("No se pudo leer {}: {e} (¿falta `cargo tauri android init`?)", gradle.display()))?;
    if escribir_si_cambia(&gradle, &parchear_gradle(&g)?)? {
        cambiados.push(gradle);
    }
    let kotlin = principal.join("java/app/starseed/nativa/ProxyPuertaStarSeed.kt");
    if escribir_si_cambia(&kotlin, KOTLIN)? {
        cambiados.push(kotlin);
    }
    Ok(cambiados)
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::puerta_proxy_logica as logica;

    const MANIFIESTO: &str = r#"<?xml version="1.0" encoding="utf-8"?>
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

    /// Como el que genera `cargo tauri android init` (con androidx.webkit).
    const GRADLE_TAURI: &str = r#"plugins {
    id("com.android.application")
}

android {
    namespace = "app.starseed.os"
}

dependencies {
    implementation("androidx.webkit:webkit:1.6.1")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("com.google.android.material:material:1.8.0")
}
"#;
    const GRADLE_SIN_WEBKIT: &str = r#"buildscript {
    dependencies {
        classpath("com.android.tools.build:gradle:8.5.1")
    }
}

android {
    namespace = "app.starseed.os"
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.6.1")
}
"#;

    #[test]
    fn el_proveedor_va_dentro_de_application_y_sin_permisos_nuevos() {
        let m = parchear_manifiesto(MANIFIESTO).unwrap();
        let c = m.find(COMPONENTES_INICIO).unwrap();
        assert!(m.find("<application").unwrap() < c && c < m.rfind("</application>").unwrap());
        for comp in COMPONENTES {
            assert!(m.contains(&format!("android:name=\"{comp}\"")), "{comp}");
        }
        assert!(m.contains("${applicationId}.starseed-proxy-puerta"));
        assert!(m.contains("android:exported=\"false\""));
        assert_eq!(m.matches("<uses-permission").count(), 1, "no añade permisos: el proxy es de 127.0.0.1");
    }

    #[test]
    fn el_manifiesto_es_idempotente_y_convive_con_los_demas_parches() {
        let una = parchear_manifiesto(MANIFIESTO).unwrap();
        assert_eq!(parchear_manifiesto(&una).unwrap(), una, "aplicar dos veces = aplicar una");
        assert_eq!(una.matches(COMPONENTES_INICIO).count(), 1);
        let pasada = |t: &str| {
            let t = crate::android_parche::parchear_manifiesto(t).unwrap();
            let t = crate::android_actualizador::parchear_manifiesto(&t).unwrap();
            let t = crate::enlace_wifi_parche::parchear_manifiesto(&t).unwrap();
            let t = crate::llamada_nativa_parche::parchear_manifiesto(&t).unwrap();
            parchear_manifiesto(&t).unwrap()
        };
        let a = pasada(MANIFIESTO);
        let b = pasada(&a);
        assert_eq!(a, b, "punto fijo tras una pasada de todos los parches");
        assert_eq!(b.matches(COMPONENTES_INICIO).count(), 1);
        assert!(b.contains("app.starseed.nativa.ArranqueLlamadaNativa") && b.contains("app.starseed.nativa.ArranqueProxyPuerta"));
    }

    #[test]
    fn el_gradle_no_duplica_androidx_webkit() {
        // La plantilla de Tauri ya la trae: no se toca.
        let t = parchear_gradle(GRADLE_TAURI).unwrap();
        assert_eq!(t, GRADLE_TAURI);
        assert_eq!(t.matches("androidx.webkit:webkit").count(), 1);
        // Sin ella: se añade UNA vez, dentro del `dependencies` del módulo (no el de buildscript).
        let a = parchear_gradle(GRADLE_SIN_WEBKIT).unwrap();
        assert_eq!(a.matches("androidx.webkit:webkit").count(), 1);
        assert!(a.contains(&format!("implementation(\"{DEPENDENCIA}:{VERSION_DEPENDENCIA}\")")));
        let deps_modulo = a.rfind("\ndependencies {").unwrap();
        assert!(a.find(GRADLE_INICIO).unwrap() > deps_modulo, "va en el dependencies del módulo, no en buildscript");
        assert_eq!(parchear_gradle(&a).unwrap(), a, "idempotente");
        // Si después la plantilla la trae, nuestro bloque se retira y queda una sola.
        let con_plantilla = a.replace("implementation(\"androidx.appcompat:appcompat:1.6.1\")", "implementation(\"androidx.webkit:webkit:1.6.1\")\n    implementation(\"androidx.appcompat:appcompat:1.6.1\")");
        let b = parchear_gradle(&con_plantilla).unwrap();
        assert_eq!(b.matches("androidx.webkit:webkit").count(), 1);
        assert!(!b.contains(GRADLE_INICIO));
        assert!(parchear_gradle("android { }\n").unwrap_err().contains("dependencies"));
    }

    #[test]
    fn falla_en_alto_si_cambia_la_plantilla() {
        assert!(parchear_manifiesto("<manifest></manifest>").unwrap_err().contains("<application>"));
        assert!(parchear_manifiesto("<manifest><application></application></manifest>").is_ok());
    }

    #[test]
    fn interruptor_de_emergencia_y_solo_starseed_os() {
        assert!(!apagado(None) && !apagado(Some("0")) && !apagado(Some("false")) && !apagado(Some("")));
        assert!(apagado(Some("1")));
        assert!(aplica("app.starseed.os") && aplica("app.starseed.`os`"));
        assert!(!aplica("app.starseed.nexus") && !aplica(""));
    }

    #[test]
    fn kotlin_y_rust_dicen_lo_mismo() {
        assert!(KOTLIN.contains("package app.starseed.nativa"));
        assert!(KOTLIN.contains("class ArranqueProxyPuerta : ContentProvider()"));
        assert!(KOTLIN.contains(&format!("const val CARPETA = \"{}\"", logica::CARPETA_ANDROID)));
        assert!(KOTLIN.contains(&format!("const val ESTADO = \"{}\"", logica::ESTADO)));
        assert!(KOTLIN.contains(&format!("const val PREFIJO_PETICION = \"{}\"", logica::PREFIJO_PETICION)));
        // El estado que escribe Kotlin son campos de EstadoKotlin.
        for campo in ["version", "n", "soportado", "aplicado", "error"] {
            assert!(KOTLIN.contains(&format!(".put(\"{campo}\"")), "estado.json sin «{campo}»");
        }
        let ejemplo: logica::EstadoKotlin = serde_json::from_str(r#"{"version":1,"n":9,"soportado":true,"aplicado":true,"error":null}"#).unwrap();
        assert!(ejemplo.soportado && ejemplo.aplicado && ejemplo.n == 9);
        // La petición de Rust es la que Kotlin lee.
        let p: serde_json::Value = serde_json::from_str(&logica::texto_peticion(5, Some(50123))).unwrap();
        for campo in ["n", "puerto"] {
            assert!(p.get(campo).is_some() && KOTLIN.contains(&format!("\"{campo}\"")), "{campo}");
        }
        // Las mismas reglas de bucle local a los dos lados.
        for r in logica::REGLAS_DIRECTAS_ANDROID {
            assert!(KOTLIN.contains(&format!("\"{r}\"")), "Kotlin no excluye «{r}»");
        }
        // Las API: ProxyController del proceso, detrás de la comprobación de la función y de la versión.
        for api in ["ProxyController.getInstance().setProxyOverride", "clearProxyOverride", "WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE)", "addProxyRule", "addBypassRule", "Build.VERSION.SDK_INT >= 21"] {
            assert!(KOTLIN.contains(api), "falta {api}");
        }
        let uso = KOTLIN.find("ProxyController.getInstance().setProxyOverride").unwrap();
        let guarda = KOTLIN.find("if (!soportado())").unwrap();
        assert!(guarda < uso, "setProxyOverride va detrás de la comprobación de PROXY_OVERRIDE");
    }

    #[test]
    fn aplica_a_un_proyecto_en_disco_y_no_reescribe() {
        let dir = std::env::temp_dir().join(format!("ss-android-proxy-puerta-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("app/src/main")).unwrap();
        std::fs::write(dir.join("app/src/main/AndroidManifest.xml"), MANIFIESTO).unwrap();
        std::fs::write(dir.join("app/build.gradle.kts"), GRADLE_SIN_WEBKIT).unwrap();
        let primera = aplicar(&dir).unwrap();
        assert_eq!(primera.len(), 3, "manifiesto + gradle + Kotlin");
        assert!(dir.join("app/src/main/java/app/starseed/nativa/ProxyPuertaStarSeed.kt").is_file());
        assert!(std::fs::read_to_string(dir.join("app/build.gradle.kts")).unwrap().contains(DEPENDENCIA));
        assert!(aplicar(&dir).unwrap().is_empty(), "la segunda vez no cambia nada");
        assert!(aplicar(&dir.join("no-existe")).unwrap_err().contains("android init"));
        // Con la plantilla de Tauri (ya trae androidx.webkit) el gradle no cambia.
        std::fs::write(dir.join("app/build.gradle.kts"), GRADLE_TAURI).unwrap();
        assert!(aplicar(&dir).unwrap().is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
