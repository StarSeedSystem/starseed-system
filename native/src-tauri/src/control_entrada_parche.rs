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

pub const REGLA_G_TXT: &str = include_str!("control_regla_g.txt");

/// FSG1116 · A1: Kotlin lee la regla G de ESTE archivo generado desde `control_regla_g.txt` (la misma lista que Rust).
pub fn kotlin_regla_g() -> String {
    // Solo std (build.rs): se lee aquí el mismo archivo que lee control_entrada_logica.rs; la prueba compara las dos lecturas.
    let (mut p, mut s) = (Vec::new(), Vec::new());
    for l in REGLA_G_TXT.lines().map(str::trim).filter(|l| !l.is_empty() && !l.starts_with('#')) {
        match l.split_once(' ') {
            Some(("protegido", x)) => p.push(x.trim()),
            Some(("sistema", x)) => s.push(x.trim()),
            _ => panic!("control_regla_g.txt: línea sin forma «{l}»"),
        }
    }
    let lista = |v: &[&str]| v.iter().map(|x| format!("        \"{x}\",")).collect::<Vec<_>>().join("\n");
    format!(
        "package app.starseed.nativa\n\n// FSG1116 · Lo escribe native/src-tauri/build.rs desde src/control_regla_g.txt (la misma lista que lee Rust).\n// No editar aquí: se reescribe en cada compilación.\n\nobject ReglaGLista {{\n    /** Cualquier ventana de estos paquetes a la vista: no se toca nada. */\n    val PROTEGIDOS: Set<String> = setOf(\n{}\n    )\n    /** De estos paquetes, solo sus ventanas de actividad. */\n    val SISTEMA: Set<String> = setOf(\n{}\n    )\n}}\n",
        lista(&p),
        lista(&s)
    )
}

/// FSG1116 · M4: lo que el control guarda (aceptados, interruptores, cuadro) NO viaja en la copia de seguridad ni
/// en la transferencia entre aparatos: en otro aparato nadie lo aceptó.
pub const XML_COPIA: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<!-- FSG1116: lo escribe native/src-tauri/build.rs. Android 6–11: fuera de la copia lo que guarda el control entre neuronas. -->
<full-backup-content>
    <exclude domain="file" path="starseed/control-entrada/" />
    <exclude domain="file" path="starseed/control-neuronas/" />
</full-backup-content>
"#;
pub const XML_EXTRACCION: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<!-- FSG1116: lo escribe native/src-tauri/build.rs. Android 12+: ni copia en la nube ni transferencia entre aparatos. -->
<data-extraction-rules>
    <cloud-backup>
        <exclude domain="file" path="starseed/control-entrada/" />
        <exclude domain="file" path="starseed/control-neuronas/" />
    </cloud-backup>
    <device-transfer>
        <exclude domain="file" path="starseed/control-entrada/" />
        <exclude domain="file" path="starseed/control-neuronas/" />
    </device-transfer>
</data-extraction-rules>
"#;
const ATRIBUTO_COPIA: &str = "android:fullBackupContent=\"@xml/starseed_control_copia\"";
const ATRIBUTO_EXTRACCION: &str = "android:dataExtractionRules=\"@xml/starseed_control_extraccion\"";

/// FSG1116 · M4: pone las reglas de copia en `<application …>`. Si la plantilla ya trae OTRAS reglas, falla en alto
/// (mezclarlas a ciegas podría volver a meter el control en la copia).
pub fn parchear_copia(texto: &str) -> Result<String, String> {
    let app = texto.find("<application").ok_or("El AndroidManifest.xml no tiene <application>")?;
    let fin = app + texto[app..].find('>').ok_or("<application> sin cerrar")?;
    let etiqueta = &texto[app..fin];
    let ya_copia = etiqueta.contains(ATRIBUTO_COPIA);
    let ya_extraccion = etiqueta.contains(ATRIBUTO_EXTRACCION);
    if (!ya_copia && etiqueta.contains("android:fullBackupContent=")) || (!ya_extraccion && etiqueta.contains("android:dataExtractionRules=")) {
        return Err("El <application> ya trae reglas de copia propias: añade allí las exclusiones de starseed/control-* (FSG1116 · M4).".into());
    }
    let mut extra = String::new();
    if !ya_copia {
        extra.push_str(&format!("\n        {ATRIBUTO_COPIA}"));
    }
    if !ya_extraccion {
        extra.push_str(&format!("\n        {ATRIBUTO_EXTRACCION}"));
    }
    let tras = app + "<application".len();
    Ok(format!("{}{}{}", &texto[..tras], extra, &texto[tras..]))
}

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
    if escribir_si_cambia(&manifiesto, &parchear_copia(&parchear_manifiesto(&texto)?)?)? {
        cambiados.push(manifiesto);
    }
    for (rel, contenido) in [
        ("res/xml/starseed_control_accesibilidad.xml", XML_SERVICIO),
        ("res/values/starseed_control_accesibilidad.xml", XML_TEXTOS),
        ("java/app/starseed/nativa/ControlEntradaStarSeed.kt", KOTLIN),
        ("java/app/starseed/nativa/ProyeccionPantallaStarSeed.kt", KOTLIN_PROYECCION), // PENC1
        ("res/xml/starseed_control_copia.xml", XML_COPIA),             // FSG1116 · M4
        ("res/xml/starseed_control_extraccion.xml", XML_EXTRACCION),   // FSG1116 · M4
    ] {
        let f = principal.join(rel);
        if escribir_si_cambia(&f, contenido)? {
            cambiados.push(f);
        }
    }
    // FSG1116 · A1: la regla G de Kotlin sale de la MISMA lista que la de Rust.
    let f = principal.join("java/app/starseed/nativa/ReglaGStarSeed.kt");
    if escribir_si_cambia(&f, &kotlin_regla_g())? {
        cambiados.push(f);
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
        // Regla G (FSG1116): Kotlin NO lleva su propia lista; usa la generada desde la de Rust.
        let generado = kotlin_regla_g();
        let (p, s) = l::regla_g_listas();
        for x in p.iter().chain(s.iter()) {
            assert!(generado.contains(&format!("\"{x}\",")), "regla G: el Kotlin generado no lleva «{x}»");
            assert!(!KOTLIN.contains(&format!("\"{x}\"")), "regla G: «{x}» escrito a mano en Kotlin (debe salir de control_regla_g.txt)");
        }
        assert!(generado.contains("object ReglaGLista") && KOTLIN.contains("ReglaGLista.PROTEGIDOS") && KOTLIN.contains("ReglaGLista.SISTEMA"));
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
        // FSG1116: el séptimo (`vigilarDialogo`) pasó a ser `mostrarConsentimiento` (C1), marcado FSG1116.
        assert_eq!(f1.matches("AND1115K").count(), 6, "los enganches aditivos de AND1115K en ControlNeuronasStarSeed.kt");
        assert!(f1.contains("ControlEntradaNativo.iniciar(app)") && f1.contains("ControlEntradaNativo.esGestoPropio()"));
    }

    /// El cuerpo de la lambda del botón positivo `texto` en `k` (hasta el siguiente `.set`).
    fn positivo<'a>(k: &'a str, texto: &str) -> &'a str {
        let i = k.find(&format!("setPositiveButton(\"{texto}\")")).unwrap_or_else(|| panic!("sin «{texto}»"));
        let j = k[i + 10..].find(".set").map(|j| i + 10 + j).unwrap_or(k.len());
        &k[i..j]
    }

    #[test]
    fn c1_la_regla_g_se_decide_al_despachar_cada_trozo_no_al_encolar() {
        let k = KOTLIN;
        let b = k.find("private fun bombear()").unwrap();
        let fin = b + k[b..].find("private fun despacharTrozo").unwrap();
        let bombear = &k[b..fin];
        // Antes de CADA trozo (el primero y las continuaciones, que vuelven por `terminado` → `bombear`).
        assert!(bombear.contains("if (ventanaProtegida()) { cortar(); return }"), "la regla G antes de despachar");
        assert!(bombear.find("ventanaProtegida()").unwrap() < bombear.find("despacharTrozo(").unwrap());
        assert!(k.contains("const val TROZO_MS = 200L"));
        let t = k.find("private fun terminado(").unwrap();
        assert!(k[t..t + 900].contains("bombear()"), "cada continuación pasa otra vez por la regla G");
        // Un cambio de lo que hay delante tira la cola y el gesto a medias si ahora hay algo protegido.
        assert!(k.contains("TYPE_WINDOWS_CHANGED") && k.contains("&& ventanaProtegida()) cortar()"));
        // Nada de nombres de clase ni títulos (dependen del idioma y del fabricante).
        for x in ["className", ".title", "ultimaClase", "CLASES_"] {
            assert!(!k.contains(x), "{x}");
        }
        // La misma decisión que `regla_g` de Rust, cláusula a cláusula.
        assert!(k.contains("if (congelada || bloqueada || contrasena || ventanas.isEmpty()) return true"));
        assert!(k.contains("if (p == null) actividad"));
        assert!(k.contains("p in ReglaGLista.PROTEGIDOS || (actividad && (p == yo || p in ReglaGLista.SISTEMA))"));
        assert!(k.contains("isKeyguardLocked } catch (_: Throwable) { true }") && k.contains("isPassword == true } catch (_: Throwable) { true }"));
        // «Terminar», la pausa y el servicio que se va cortan también el gesto en curso (M6).
        let p = k.find("fun parar()").unwrap();
        assert!(k[p..p + 300].contains("cortar()"));
        assert!(crate::control_neuronas_parche::KOTLIN.contains("ServicioControlEntrada.instancia?.cortar() // FSG1116"));
    }

    #[test]
    fn ctl1117a_inicio_es_la_unica_excepcion_de_la_regla_g_y_respeta_el_congelado() {
        let k = KOTLIN;
        // La misma decisión que `regla_g_deja_inicio` de Rust.
        assert!(k.contains("!(congelada || bloqueada || contrasena || ventanas.isEmpty())"));
        let e = k.find("private fun inicioDesdeProtegida()").unwrap();
        let cuerpo = &k[e..e + 1400];
        assert!(cuerpo.contains("ControlEntradaNativo.congelado()") && cuerpo.contains("isKeyguardLocked") && cuerpo.contains("isPassword"));
        // `ejecutar`: la regla G se mira primero y la excepción es solo `tecla` + `inicio`.
        let j = k.find("fun ejecutar(orden: JSONObject)").unwrap();
        let ej = &k[j..j + 2200];
        assert!(ej.contains("if (ventanaProtegida()) {") && ej.contains("nombre == \"tecla\" && args.optString(\"cual\") == \"inicio\" && inicioDesdeProtegida()"));
        assert!(ej.contains("} else rechazo(\"regla-g\")"), "todo lo demás sigue negado");
        assert!(ej.contains("inicio-desde-protegida"), "traza propia");
        // Una sola excepción: ninguna otra tecla se nombra junto a `inicioDesdeProtegida`.
        assert_eq!(k.matches("inicioDesdeProtegida()").count(), 2, "su definición y un único uso");
        // El gesto en cola sigue mirando la regla G entera (Inicio no se cuela por `bombear`).
        assert!(k.contains("if (ventanaProtegida()) { cortar(); return }"));
    }

    #[test]
    fn c1_ningun_consentimiento_se_contesta_con_entrada_remota() {
        let fase1 = crate::control_neuronas_parche::KOTLIN;
        for (k, si) in [(KOTLIN, "Sí, aceptar"), (KOTLIN, "Sí, dejar ver"), (KOTLIN_PROYECCION, "Sí, continuar"), (fase1, "Sí, dejar")] {
            assert!(positivo(k, si).contains("g.valida()"), "el «{si}» mira la guarda");
        }
        // Se congela al PEDIR (antes de enseñar) y se suelta al cerrarse; ningún diálogo del control se enseña por otro camino.
        let m = KOTLIN.find("fun mostrarConsentimiento(").unwrap();
        let cuerpo = &KOTLIN[m..m + 700];
        assert!(cuerpo.find("congelar()").unwrap() < cuerpo.find("d.show()").unwrap());
        assert!(cuerpo.contains("setOnDismissListener { descongelar()"));
        assert_eq!(KOTLIN.matches(".show()").count(), 1);
        assert_eq!(KOTLIN_PROYECCION.matches(".show()").count(), 0);
        assert_eq!(fase1.matches(".show()").count(), 0);
        assert_eq!(KOTLIN.matches("mostrarConsentimiento(b, g").count(), 2);
        assert_eq!(KOTLIN_PROYECCION.matches("mostrarConsentimiento(b, g").count(), 1);
        assert_eq!(fase1.matches("mostrarConsentimiento(b, g").count(), 1);
        // Congelado = la regla G niega todo; un «Sí» con un gesto remoto despachado desde que se pidió, o con uno en el
        // aire, o pulsado desde un aparato virtual, no vale.
        assert!(KOTLIN.contains("ControlEntradaNativo.congelado(), contrasena)"));
        assert!(KOTLIN.contains("ControlEntradaNativo.ultimoGestoRemoto < desde") && KOTLIN.contains("ocupado() != true") && KOTLIN.contains("!d.isVirtual"));
        // La proyección sigue congelada mientras la pantalla de Android pregunta, y se suelta pase lo que pase.
        assert!(KOTLIN_PROYECCION.contains("ControlEntradaNativo.congelar(); congeladaEnSistema = true"));
        assert!(KOTLIN_PROYECCION.contains("override fun onDestroy() {\n        ProyeccionPantalla.sistemaContesto()"));
    }

    #[test]
    fn m1_m2_m3_pausa_y_cuadros() {
        // M1: Android cancela el gesto inyectado cuando la persona toca: eso pausa. Lo propio se oye 150 ms, no 500.
        assert!(KOTLIN.contains("override fun onCancelled(x: GestureDescription?) { cancelado() }"));
        assert!(KOTLIN.contains("ControlNeuronasNativo.pausarLocal?.invoke()") && !KOTLIN.contains("+ 500"));
        // M2/M3: ningún cuadro tras parar, en pausa o bloqueada; el que se escribía cuando llegó el parar, se borra.
        for k in [KOTLIN, KOTLIN_PROYECCION] {
            assert!(k.contains("puedePublicarCuadro()") && k.contains("ControlEntradaNativo.borrarCuadro()"));
        }
        assert!(KOTLIN.contains("if (!capturando || !ControlEntradaNativo.puedePublicarCuadro())"));
        assert!(crate::control_neuronas_parche::KOTLIN.contains("ControlEntradaNativo.borrarCuadro() // FSG1116 · M2"));
    }

    #[test]
    fn a1_la_lista_de_kotlin_es_la_de_rust() {
        let k = kotlin_regla_g();
        let (p, s) = l::regla_g_listas();
        let n = |x: &str| k.matches(&format!("\"{x}\",")).count();
        assert!(p.iter().chain(s.iter()).all(|x| n(x) == 1));
        assert_eq!(k.matches("\",").count(), p.len() + s.len(), "ni más ni menos que en control_regla_g.txt");
        assert!(k.starts_with("package app.starseed.nativa"));
    }

    #[test]
    fn m4_lo_del_control_no_viaja_en_la_copia() {
        let m = "<manifest xmlns:android=\"http://schemas.android.com/apk/res/android\">\n    <application\n        android:label=\"x\">\n    </application>\n</manifest>\n";
        let a = parchear_copia(m).unwrap();
        assert!(a.contains("android:fullBackupContent=\"@xml/starseed_control_copia\"") && a.contains("android:dataExtractionRules=\"@xml/starseed_control_extraccion\""));
        assert_eq!(parchear_copia(&a).unwrap(), a, "idempotente");
        assert!(parchear_copia("<manifest><application android:fullBackupContent=\"@xml/otra\"></application></manifest>").is_err());
        for x in [XML_COPIA, XML_EXTRACCION] {
            assert!(x.contains("path=\"starseed/control-entrada/\"") && x.contains("path=\"starseed/control-neuronas/\""));
        }
        assert_eq!(XML_EXTRACCION.matches("<exclude").count(), 4, "nube y transferencia entre aparatos");
    }
}
