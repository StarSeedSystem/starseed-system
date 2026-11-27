// ═══════════════════════════════════════════════════════════════════════════
// nfc_parche — el NFC de las neuronas en el proyecto Android que genera Tauri (NFC1126B, 2026-11-27).
// Contrato: architecture/nfc-neuronas.md §2. Como ubicacion_parche.rs: build.rs lo aplica tras `cargo tauri android init`
// y antes de que Gradle procese el manifiesto. Escribe:
//   · el permiso NFC y las dos funciones OPCIONALES (`nfc`, `nfc.hce`): un aparato sin NFC se instala igual;
//   · el proveedor `ArranqueNfc` (queda a la escucha de Rust, no enciende nada) y el servicio `HceStarSeed`
//     (HostApduService) con su lista de AID (`res/xml/starseed_apdu_service.xml`): SOLO el AID de StarSeed,
//     categoría «other» (nunca «payment»);
//   · NfcStarSeed.kt y HceStarSeed.kt.
// Solo std (lo usa build.rs con `#[path]`). Idempotente. Solo StarSeed OS. Apagado: STARSEED_SIN_NFC_ANDROID=1.
// ═══════════════════════════════════════════════════════════════════════════

#![allow(dead_code)]

use std::path::{Path, PathBuf};

pub const PAQUETE_OS: &str = "app.starseed.os";

const PERMISOS_INICIO: &str = "<!-- STARSEED-NFC:PERMISOS:INICIO (no editar: lo escribe native/src-tauri/build.rs · NFC1126B) -->";
const PERMISOS_FIN: &str = "<!-- STARSEED-NFC:PERMISOS:FIN -->";
const COMPONENTES_INICIO: &str = "<!-- STARSEED-NFC:COMPONENTES:INICIO (no editar: lo escribe native/src-tauri/build.rs · NFC1126B) -->";
const COMPONENTES_FIN: &str = "<!-- STARSEED-NFC:COMPONENTES:FIN -->";

pub const PERMISO_NFC: &str = "android.permission.NFC";
pub const FUNCIONES: [&str; 2] = ["android.hardware.nfc", "android.hardware.nfc.hce"];
pub const RECURSO_AID: &str = "starseed_apdu_service";

pub const KOTLIN_NFC: &str = include_str!("../android/NfcStarSeed.kt");
pub const KOTLIN_HCE: &str = include_str!("../android/HceStarSeed.kt");

/// El AID que declara el servicio: el mismo de nfc_logica.rs.
pub fn xml_aid() -> String {
    format!(
        "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<!-- Lo escribe native/src-tauri/build.rs (NFC1126B). -->\n\
<host-apdu-service xmlns:android=\"http://schemas.android.com/apk/res/android\"\n    android:description=\"@string/app_name\"\n    android:requireDeviceUnlock=\"false\">\n    \
<aid-group android:category=\"other\" android:description=\"@string/app_name\">\n        <aid-filter android:name=\"{}\" />\n    </aid-group>\n</host-apdu-service>\n",
        crate::nfc_logica::AID_HEX
    )
}

/// `STARSEED_SIN_NFC_ANDROID`: cualquier valor salvo vacío, «0» o «false» lo apaga.
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

pub fn bloque_permisos(manifiesto_sin_bloques: &str) -> String {
    let mut s = format!("    {PERMISOS_INICIO}\n");
    if !ya_declarado(manifiesto_sin_bloques, PERMISO_NFC) {
        s.push_str(&format!("    <uses-permission android:name=\"{PERMISO_NFC}\" />\n"));
    }
    for f in FUNCIONES.iter().filter(|f| !ya_declarado(manifiesto_sin_bloques, f)) {
        s.push_str(&format!("    <uses-feature android:name=\"{f}\" android:required=\"false\" />\n"));
    }
    s.push_str(&format!("    {PERMISOS_FIN}\n"));
    s
}

pub fn bloque_componentes() -> String {
    format!(
        "        {COMPONENTES_INICIO}
        <provider
            android:name=\"app.starseed.nativa.ArranqueNfc\"
            android:authorities=\"${{applicationId}}.starseed-nfc\"
            android:exported=\"false\"
            android:initOrder=\"60\" />
        <service
            android:name=\"app.starseed.nativa.HceStarSeed\"
            android:exported=\"true\"
            android:permission=\"android.permission.BIND_NFC_SERVICE\">
            <intent-filter>
                <action android:name=\"android.nfc.cardemulation.action.HOST_APDU_SERVICE\" />
            </intent-filter>
            <meta-data
                android:name=\"android.nfc.cardemulation.host_apdu_service\"
                android:resource=\"@xml/{RECURSO_AID}\" />
        </service>
        {COMPONENTES_FIN}
"
    )
}

/// Manifiesto con los dos bloques (sustituye los que hubiera): permisos antes de `<application`, componentes antes de `</application>`.
pub fn parchear_manifiesto(texto: &str) -> Result<String, String> {
    let limpio = quitar_bloque(&quitar_bloque(texto, PERMISOS_INICIO, PERMISOS_FIN), COMPONENTES_INICIO, COMPONENTES_FIN);
    let app = limpio.find("<application").ok_or("El AndroidManifest.xml no tiene <application>: ¿cambió la plantilla de Tauri?")?;
    let linea_app = limpio[..app].rfind('\n').map(|i| i + 1).unwrap_or(app);
    let cierre = limpio.rfind("</application>").ok_or("El AndroidManifest.xml no tiene </application>: ¿cambió la plantilla de Tauri?")?;
    if cierre < app {
        return Err("El AndroidManifest.xml tiene </application> antes de <application>.".into());
    }
    let linea_cierre = limpio[..cierre].rfind('\n').map(|i| i + 1).unwrap_or(cierre);
    Ok(format!("{}{}{}{}{}", &limpio[..linea_app], bloque_permisos(&limpio), &limpio[linea_app..linea_cierre], bloque_componentes(), &limpio[linea_cierre..]))
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
    let archivos: [(PathBuf, String); 4] = [
        (manifiesto, parchear_manifiesto(&texto)?),
        (principal.join(format!("res/xml/{RECURSO_AID}.xml")), xml_aid()),
        (principal.join("java/app/starseed/nativa/NfcStarSeed.kt"), KOTLIN_NFC.to_string()),
        (principal.join("java/app/starseed/nativa/HceStarSeed.kt"), KOTLIN_HCE.to_string()),
    ];
    for (ruta, contenido) in archivos {
        if escribir_si_cambia(&ruta, &contenido)? {
            cambiados.push(ruta);
        }
    }
    Ok(cambiados)
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::nfc_logica as logica;

    const PLANTILLA: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />

    <application
        android:label="@string/app_name">
        <activity
            android:name=".MainActivity"
            android:exported="true">
        </activity>
    </application>
</manifest>
"#;

    #[test]
    fn declara_permiso_funciones_opcionales_y_servicio_en_su_sitio() {
        let m = parchear_manifiesto(PLANTILLA).unwrap();
        let (p, a, c, cierre) = (m.find(PERMISOS_INICIO).unwrap(), m.find("<application").unwrap(), m.find(COMPONENTES_INICIO).unwrap(), m.rfind("</application>").unwrap());
        assert!(p < a && a < c && c < cierre);
        assert!(m.contains("<uses-permission android:name=\"android.permission.NFC\" />"));
        for f in FUNCIONES {
            assert!(m.contains(&format!("<uses-feature android:name=\"{f}\" android:required=\"false\" />")), "{f} debe ser opcional");
        }
        assert!(m.contains("android:permission=\"android.permission.BIND_NFC_SERVICE\""));
        assert!(m.contains("android.nfc.cardemulation.action.HOST_APDU_SERVICE") && m.contains("@xml/starseed_apdu_service"));
        assert!(m.contains("app.starseed.nativa.ArranqueNfc") && m.contains("app.starseed.nativa.HceStarSeed"));
    }

    #[test]
    fn es_idempotente_y_no_repite_lo_ya_declarado() {
        let una = parchear_manifiesto(PLANTILLA).unwrap();
        assert_eq!(parchear_manifiesto(&una).unwrap(), una);
        let con_nfc = PLANTILLA.replace("<application", "<uses-permission android:name=\"android.permission.NFC\" />\n    <application");
        assert_eq!(parchear_manifiesto(&con_nfc).unwrap().matches("\"android.permission.NFC\"").count(), 1);
    }

    #[test]
    fn falla_en_alto_si_cambia_la_plantilla() {
        assert!(parchear_manifiesto("<manifest></manifest>").unwrap_err().contains("<application>"));
    }

    #[test]
    fn interruptor_y_paquete() {
        assert!(!apagado(None) && !apagado(Some("false")) && apagado(Some("1")));
        assert!(aplica("app.starseed.os") && !aplica("app.starseed.cafe"));
    }

    #[test]
    fn el_xml_declara_solo_el_aid_de_starseed_y_nunca_pagos() {
        let x = xml_aid();
        assert_eq!(x.matches("<aid-filter").count(), 1);
        assert!(x.contains(&format!("android:name=\"{}\"", logica::AID_HEX)));
        assert!(x.contains("android:category=\"other\"") && !x.contains("payment"));
    }

    #[test]
    fn kotlin_y_rust_dicen_lo_mismo() {
        let kt = KOTLIN_HCE.to_lowercase().replace(' ', "");
        let aid_kt: String = logica::AID[1..].iter().map(|b| format!("0x{b:02x},")).collect();
        assert!(kt.contains(&format!("byteArrayOf(0xF0.toByte(),{}", aid_kt.trim_end_matches(',')).to_lowercase()), "el AID de Kotlin no es el de Rust");
        assert!(KOTLIN_HCE.contains(&format!("const val TROZO_MAX = {}", logica::TROZO_MAX)));
        assert!(KOTLIN_HCE.contains(&format!("const val MAX_TARJETA = {}", logica::MAX_TARJETA)));
        assert!(KOTLIN_HCE.contains(&format!("INS_TARJETA: Byte = 0x{:02X}", logica::INS_TARJETA)));
        assert!(KOTLIN_HCE.contains(&format!("CLA_STARSEED: Byte = 0x{:02X}", logica::CLA_STARSEED)));
        for (nombre, sw) in [("SW_OK", logica::SW_OK), ("SW_MAS", logica::SW_MAS), ("SW_SIN_TARJETA", logica::SW_SIN_TARJETA), ("SW_FUERA_DE_RANGO", logica::SW_FUERA_DE_RANGO)] {
            let linea = KOTLIN_HCE.lines().find(|l| l.contains(&format!("val {nombre} = byteArrayOf("))).unwrap_or_else(|| panic!("falta {nombre}")).to_lowercase();
            assert!(linea.contains(&format!("0x{:02x}", sw[0])) && linea.contains(&format!("0x{:02x}", sw[1])), "{nombre}");
        }
        assert!(KOTLIN_NFC.contains("package app.starseed.nativa") && KOTLIN_HCE.contains("package app.starseed.nativa"));
        assert!(KOTLIN_NFC.contains(logica::TIPO_MIME_NDEF));
    }

    #[test]
    fn kotlin_no_se_concede_nada_ni_envia_solo() {
        for k in [KOTLIN_NFC, KOTLIN_HCE] {
            assert!(!k.contains("grantRuntimePermission") && !k.contains("HttpURLConnection") && !k.contains("OkHttp"));
        }
    }
}
