// ═══════════════════════════════════════════════════════════════════════════
// control_entrada_parche — la entrada y la pantalla remotas de la tableta en el proyecto Android que genera Tauri
// (AND1115K, 2026-11-15). Contrato: control-fase23-costuras.md. Como control_neuronas_parche.rs, en su propio bloque.
// ---------------------------------------------------------------------------
// Escribe, y solo esto:
//   · el servicio de accesibilidad `ServicioControlEntrada` con `android:permission=BIND_ACCESSIBILITY_SERVICE`
//     (lo exige Android para poder enlazarlo; NO lo activa: lo activa la persona en Ajustes > Accesibilidad),
//     su descripción (recursos `values` y `xml`) con `canPerformGestures`, `canRetrieveWindowContent` y
//     `canTakeScreenshot`;
//   · `WRITE_SETTINGS` (acceso especial «modificar ajustes del sistema», para el brillo; la persona lo da en su
//     pantalla de Ajustes) y, si nadie más los declara, `ACCESS_WIFI_STATE` y `ACCESS_NETWORK_STATE` (solo leer);
//   · `ControlEntradaStarSeed.kt`.
// PENC1: la proyección de pantalla (fluida; Android pregunta en CADA sesión) añade SOLO esto al manifiesto:
//   · el permiso `FOREGROUND_SERVICE_MEDIA_PROJECTION` (normal, sin diálogo; `FOREGROUND_SERVICE` ya lo declara el parche de antenas);
//   · `<service ServicioProyeccionPantalla foregroundServiceType="mediaProjection" exported=false>`;
//   · `<activity ProyeccionConsentimientoActivity exported=false>` transparente, solo para recibir el resultado del consentimiento;
//   · `ProyeccionPantallaStarSeed.kt`. Ningún permiso de captura se concede solo: no existe en el manifiesto.
// Solo std (lo usa build.rs con `#[path]`). Idempotente. Solo StarSeed OS.
// Interruptor de emergencia: STARSEED_SIN_CONTROL_ENTRADA=1 (el APK sale sin entrada ni pantalla remotas).
// ═══════════════════════════════════════════════════════════════════════════

#![allow(dead_code)]

use std::path::{Path, PathBuf};

pub const PAQUETE_OS: &str = "app.starseed.os";

const PERMISOS_INICIO: &str = "<!-- STARSEED-CONTROL-ENTRADA:PERMISOS:INICIO (no editar: lo escribe native/src-tauri/build.rs · AND1115K) -->";
const PERMISOS_FIN: &str = "<!-- STARSEED-CONTROL-ENTRADA:PERMISOS:FIN -->";
const COMPONENTES_INICIO: &str = "<!-- STARSEED-CONTROL-ENTRADA:COMPONENTES:INICIO (no editar: lo escribe native/src-tauri/build.rs · AND1115K) -->";
const COMPONENTES_FIN: &str = "<!-- STARSEED-CONTROL-ENTRADA:COMPONENTES:FIN -->";

pub const PERMISOS_COMPARTIDOS: [(&str, &str); 2] = [
    ("android.permission.ACCESS_WIFI_STATE", "Leer si el Wi-Fi está encendido para el estado del aparato que ve quien controla."),
    ("android.permission.ACCESS_NETWORK_STATE", "Leer el tipo de red activa para el estado del aparato que ve quien controla."),
];

pub const SERVICIO: &str = "app.starseed.nativa.ServicioControlEntrada";
pub const KOTLIN: &str = include_str!("../android/ControlEntradaStarSeed.kt");
/// PENC1: servicio, actividad de consentimiento y puente de la proyección de pantalla.
pub const KOTLIN_PROYECCION: &str = include_str!("../android/ProyeccionPantallaStarSeed.kt");
pub const SERVICIO_PROYECCION: &str = "app.starseed.nativa.ServicioProyeccionPantalla";
pub const ACTIVIDAD_PROYECCION: &str = "app.starseed.nativa.ProyeccionConsentimientoActivity";
pub const PERMISO_PROYECCION: &str = "android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION";

pub const XML_SERVICIO: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<!-- AND1115K: lo escribe native/src-tauri/build.rs. Apagado hasta que la persona lo activa en Ajustes > Accesibilidad. -->
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:accessibilityEventTypes="typeWindowStateChanged|typeWindowsChanged"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:accessibilityFlags="flagRetrieveInteractiveWindows"
    android:canPerformGestures="true"
    android:canRetrieveWindowContent="true"
    android:canTakeScreenshot="true"
    android:description="@string/starseed_control_accesibilidad_descripcion"
    android:notificationTimeout="100" />
"#;

pub const XML_TEXTOS: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<!-- AND1115K: lo escribe native/src-tauri/build.rs. -->
<resources>
    <string name="starseed_control_accesibilidad_nombre">StarSeed OS · control entre tus neuronas</string>
    <string name="starseed_control_accesibilidad_descripcion">Deja que otra neurona de tu cuenta, que aceptaste en esta tableta con su código, toque, escriba y vea la pantalla mientras ves el borde rojo y la notificación fija. No hace nada si no hay una sesión de control abierta. Solo actúa con tu permiso en esta tableta.</string>
</resources>
"#;

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

pub fn bloque_permisos(sin_bloque: &str) -> String {
    let mut s = format!("    {PERMISOS_INICIO}\n");
    s.push_str("    <!-- Acceso especial «modificar ajustes del sistema» (brillo): lo da la persona en su pantalla de Ajustes. -->\n");
    s.push_str("    <uses-permission xmlns:tools=\"http://schemas.android.com/tools\" android:name=\"android.permission.WRITE_SETTINGS\" tools:ignore=\"ProtectedPermissions\" />\n");
    for (p, porque) in PERMISOS_COMPARTIDOS {
        if !ya_declarado(sin_bloque, p) {
            s.push_str(&format!("    <!-- {porque} -->\n    <uses-permission android:name=\"{p}\" />\n"));
        }
    }
    if !ya_declarado(sin_bloque, PERMISO_PROYECCION) {
        s.push_str(&format!("    <!-- PENC1: Android 14+ exige este permiso (normal, sin diálogo) para el servicio de proyección de pantalla. -->\n    <uses-permission android:name=\"{PERMISO_PROYECCION}\" />\n"));
    }
    s.push_str(&format!("    {PERMISOS_FIN}\n"));
    s
}

pub fn bloque_componentes() -> String {
    format!(
        "        {COMPONENTES_INICIO}
        <service
            android:name=\"{SERVICIO}\"
            android:exported=\"true\"
            android:label=\"@string/starseed_control_accesibilidad_nombre\"
            android:permission=\"android.permission.BIND_ACCESSIBILITY_SERVICE\">
            <intent-filter>
                <action android:name=\"android.accessibilityservice.AccessibilityService\" />
            </intent-filter>
            <meta-data
                android:name=\"android.accessibilityservice\"
                android:resource=\"@xml/starseed_control_accesibilidad\" />
        </service>
        <!-- PENC1: proyección de pantalla. El servicio solo arranca tras el consentimiento de Android en esa sesión. -->
        <service
            android:name=\"{SERVICIO_PROYECCION}\"
            android:exported=\"false\"
            android:foregroundServiceType=\"mediaProjection\" />
        <activity
            android:name=\"{ACTIVIDAD_PROYECCION}\"
            android:exported=\"false\"
            android:excludeFromRecents=\"true\"
            android:theme=\"@android:style/Theme.Translucent.NoTitleBar\" />
        {COMPONENTES_FIN}
"
    )
}

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
    let texto = std::fs::read_to_string(&manifiesto).map_err(|e| format!("No se pudo leer {}: {e} (¿falta `cargo tauri android init`?)", manifiesto.display()))?;
    if escribir_si_cambia(&manifiesto, &parchear_manifiesto(&texto)?)? {
        cambiados.push(manifiesto);
    }
    for (rel, contenido) in [
        ("res/xml/starseed_control_accesibilidad.xml", XML_SERVICIO),
        ("res/values/starseed_control_accesibilidad.xml", XML_TEXTOS),
        ("java/app/starseed/nativa/ControlEntradaStarSeed.kt", KOTLIN),
        ("java/app/starseed/nativa/ProyeccionPantallaStarSeed.kt", KOTLIN_PROYECCION), // PENC1
    ] {
        let f = principal.join(rel);
        if escribir_si_cambia(&f, contenido)? {
            cambiados.push(f);
        }
    }
    Ok(cambiados)
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::control_entrada_logica as l;

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
    fn declara_el_servicio_y_el_permiso_especial_y_nada_que_conceda_algo() {
        let m = parchear_manifiesto(PLANTILLA).unwrap();
        let p = m.find(PERMISOS_INICIO).unwrap();
        let a = m.find("<application").unwrap();
        let c = m.find(COMPONENTES_INICIO).unwrap();
        assert!(p < a && a < c && c < m.rfind("</application>").unwrap());
        assert!(m.contains("android.permission.WRITE_SETTINGS") && m.contains("BIND_ACCESSIBILITY_SERVICE"));
        assert!(m.contains("@xml/starseed_control_accesibilidad") && m.contains(SERVICIO));
        // PENC1: de la proyección, solo su permiso, su servicio (único con tipo en primer plano) y su actividad; nada de otras familias.
        for x in ["MANAGE_EXTERNAL_STORAGE", "SYSTEM_ALERT_WINDOW", "WRITE_SECURE_SETTINGS", "CAPTURE_VIDEO_OUTPUT", "CAPTURE_SECURE_VIDEO_OUTPUT", "INJECT_EVENTS", "RECORD_AUDIO", "CAMERA"] {
            assert!(!m.contains(x), "{x}");
        }
        assert_eq!(m.matches("MEDIA_PROJECTION").count(), 1, "solo FOREGROUND_SERVICE_MEDIA_PROJECTION");
        assert_eq!(m.matches("foregroundServiceType=\"mediaProjection\"").count(), 1);
        assert_eq!(m.matches("foregroundServiceType").count(), 1);
        assert!(m.contains(SERVICIO_PROYECCION) && m.contains(ACTIVIDAD_PROYECCION));
        assert_eq!(m.matches("android:exported=\"false\"").count(), 2, "servicio y actividad de proyección no se exportan");
        assert!(XML_SERVICIO.contains("canPerformGestures") && XML_SERVICIO.contains("canTakeScreenshot"));
    }

    #[test]
    fn idempotente_y_convive_con_el_parche_de_la_fase_1() {
        let una = parchear_manifiesto(PLANTILLA).unwrap();
        assert_eq!(parchear_manifiesto(&una).unwrap(), una);
        let fase1 = crate::control_neuronas_parche::parchear_manifiesto(PLANTILLA).unwrap();
        let ambos = parchear_manifiesto(&fase1).unwrap();
        assert!(ambos.contains("SYSTEM_ALERT_WINDOW") && ambos.contains("BIND_ACCESSIBILITY_SERVICE"));
        assert_eq!(crate::control_neuronas_parche::parchear_manifiesto(&ambos).unwrap().matches("BIND_ACCESSIBILITY_SERVICE").count(), 1);
        let con = PLANTILLA.replace("<uses-permission android:name=\"android.permission.INTERNET\" />", "<uses-permission android:name=\"android.permission.ACCESS_WIFI_STATE\" />");
        assert_eq!(parchear_manifiesto(&con).unwrap().matches("\"android.permission.ACCESS_WIFI_STATE\"").count(), 1);
    }

    #[test]
    fn falla_en_alto_e_interruptor() {
        assert!(parchear_manifiesto("<manifest></manifest>").is_err());
        assert!(!apagado(None) && apagado(Some("1")) && !apagado(Some("0")));
        assert!(aplica("app.starseed.os") && !aplica("app.starseed.nexus"));
    }

    #[test]
    fn kotlin_y_rust_dicen_lo_mismo() {
        assert!(KOTLIN.contains("package app.starseed.nativa"));
        assert!(KOTLIN.contains("class ServicioControlEntrada : AccessibilityService()"));
        assert!(KOTLIN.contains("object ControlEntradaNativo"));
        for (c, v) in [("CARPETA", crate::control_entrada::CARPETA), ("PREFIJO_PETICION", crate::control_entrada::PREFIJO_PETICION), ("PREFIJO_RESULTADO", crate::control_entrada::PREFIJO_RESULTADO), ("ACEPTADOS", crate::control_entrada::ACEPTADOS), ("CUADRO", crate::control_entrada::CUADRO)] {
            assert!(KOTLIN.contains(&format!("const val {c} = \"{v}\"")), "{c}");
        }
        assert!(KOTLIN.contains(&format!("const val PAUSA_LOCAL_MS = {}L", l::PAUSA_LOCAL_MS).replace("3000L", "3_000L")));
        // Regla G: cada elemento de cada lista de Rust está en Kotlin.
        for x in l::PAQUETES_G.iter().chain(l::PAQUETES_AJUSTES.iter()).chain(l::CLASES_AJUSTES_G.iter()).chain(l::CLASES_SISTEMA_G.iter()) {
            assert!(KOTLIN.contains(&format!("\"{x}\"")), "regla G: Kotlin no lleva «{x}»");
        }
        // Las órdenes y teclas que Rust deja pasar, Kotlin las ejecuta.
        for t in l::TECLAS {
            assert!(KOTLIN.contains(&format!("\"{t}\"")), "tecla {t}");
        }
        for o in ["\"gesto\"", "\"tecla\"", "\"texto\"", "\"volumen\"", "\"brillo\""] {
            assert!(KOTLIN.contains(o), "orden {o}");
        }
        for t in ["\"capacidades\"", "\"estado-aparato\"", "\"abrir-ajuste\"", "\"aceptar-controlador\"", "\"entrada\"", "\"pantalla-iniciar\"", "\"pantalla-parar\""] {
            assert!(KOTLIN.contains(t), "petición {t}");
        }
        for a in l::AJUSTES {
            assert!(KOTLIN.contains(&format!("\"{a}\"")), "ajuste {a}");
        }
    }

    #[test]
    fn la_proyeccion_pregunta_en_cada_sesion_y_no_guarda_nada() {
        let k = KOTLIN_PROYECCION;
        assert!(k.contains("package app.starseed.nativa") && k.contains(&format!("class {} : Service()", SERVICIO_PROYECCION.rsplit('.').next().unwrap())));
        assert!(k.contains(&format!("class {} : Activity()", ACTIVIDAD_PROYECCION.rsplit('.').next().unwrap())));
        // El consentimiento viene de la pantalla de Android (createScreenCaptureIntent), con el tipo de servicio puesto ANTES de la proyección.
        assert!(k.contains("createScreenCaptureIntent()"));
        let (a, b, c) = (k.find("FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION").unwrap(), k.find("getMediaProjection(").unwrap(), k.find("registerCallback(").unwrap());
        assert!(a < b && b < c, "tipo de servicio, proyección, devolución de llamada");
        assert!(c < k.find("createVirtualDisplay(").unwrap(), "Android 14: la devolución de llamada va antes de la pantalla virtual");
        // Para con la sesión, la pantalla bloqueada, el chip de Android y «Dejar de compartir»; nada se guarda entre sesiones.
        for x in ["ACTION_SCREEN_OFF", "isKeyguardLocked", "onStop()", "ControlNeuronasNativo.mostrando", "Dejar de compartir", "consentidaPara = null", "START_NOT_STICKY", "ENTRE_CUADROS_MS = 67L"] {
            assert!(k.contains(x), "{x}");
        }
        for x in ["SharedPreferences", "getSharedPreferences", "writeText", "performClick", "ACTION_CLICK", "grantRuntimePermission", "Log.", "setNeutralButton"] {
            assert!(!k.contains(x), "{x}");
        }
        // Mismo formato y misma escritura atómica que `cuadro.bin`; el tipo `proyeccion` lo conoce la parte de entrada.
        assert!(k.contains("ControlEntradaNativo.CUADRO") && k.contains("renameTo(File(d, ControlEntradaNativo.CUADRO))"));
        for x in ["\"consentimiento-proyeccion\"", "\"proyeccion\"", "ProyeccionPantalla.parar()", "ProyeccionPantalla.concedida()"] {
            assert!(KOTLIN.contains(x), "{x}");
        }
    }

    #[test]
    fn la_app_nunca_activa_ni_acepta_nada_por_su_cuenta() {
        // Ningún camino que conceda permisos, active el servicio o conteste diálogos del sistema.
        for x in ["grantRuntimePermission", "pm grant", "appops set", "WRITE_SECURE_SETTINGS", "ENABLED_ACCESSIBILITY_SERVICES", "enabled_accessibility_services", "performClick", "ACTION_CLICK", "setNeutralButton", "getButton("] {
            assert!(!KOTLIN.contains(x), "{x}");
        }
        // Aceptar un controlador y encender «ver la pantalla» solo ocurre en el «Sí» de un diálogo nativo.
        assert_eq!(KOTLIN.matches("guardarSinPreguntar(true)").count(), 1);
        assert!(KOTLIN.contains("setPositiveButton(\"Sí, dejar ver\")"));
        assert_eq!(KOTLIN.matches("escribirAtomico(File(dir, ACEPTADOS), JSONObject().put(\"v\", 1).put(\"controladores\", lista)").count(), 1);
        assert!(KOTLIN.contains("setPositiveButton(\"Sí, aceptar\")"));
        // La lista se vacía al apagar y el servicio no captura sin sesión a la vista.
        assert!(KOTLIN.contains("fun alApagar()") && KOTLIN.contains("put(\"controladores\", JSONArray())"));
        assert!(KOTLIN.contains("!ControlNeuronasNativo.mostrando"));
        assert!(KOTLIN.contains("isPassword"), "texto nunca en un campo de contraseña");
        assert!(KOTLIN.contains("TYPE_WINDOW_STATE_CHANGED"));
    }

    #[test]
    fn los_enganches_de_la_fase_1_estan_marcados() {
        let f1 = crate::control_neuronas_parche::KOTLIN;
        assert_eq!(f1.matches("AND1115K").count(), 7, "los siete enganches aditivos de AND1115K en ControlNeuronasStarSeed.kt");
        assert!(f1.contains("ControlEntradaNativo.iniciar(app)") && f1.contains("ControlEntradaNativo.esGestoPropio()"));
    }
}
