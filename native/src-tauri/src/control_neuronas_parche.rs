// ═══════════════════════════════════════════════════════════════════════════
// control_neuronas_parche — el indicador nativo del control entre neuronas en el proyecto Android que genera
// Tauri (ORD1114T, 2026-11-15). Contrato: architecture/control-remoto-entre-neuronas.md §2.4.
// ---------------------------------------------------------------------------
// Como ubicacion_parche.rs, en su propio bloque. build.rs lo aplica tras los demás y antes del Bluetooth. Escribe:
//   · permisos, EXACTAMENTE los que el indicador usa: `SYSTEM_ALERT_WINDOW` (superposición: borde y pastilla),
//     `FOREGROUND_SERVICE_SPECIAL_USE` (el servicio de la notificación en curso, Android 14+), y, si ningún otro
//     parche los declara ya, `POST_NOTIFICATIONS` y `FOREGROUND_SERVICE`. Se PIDEN solo cuando la persona dice
//     «Sí» en el diálogo nativo de Kotlin (notificaciones: diálogo del sistema; superposición: su pantalla de
//     Ajustes, que Android no ofrece como diálogo). Nada de accesibilidad: la fase 1 no inyecta toques;
//   · el servicio `ServicioControlNeuronas` (tipo `specialUse`, con la propiedad que lo justifica) y el
//     proveedor `ArranqueControlNeuronas` (queda a la escucha de Rust; no pide nada solo);
//   · `ControlNeuronasStarSeed.kt`.
// Solo std (lo usa build.rs con `#[path]`). Idempotente. Solo StarSeed OS.
// Interruptor de emergencia: STARSEED_SIN_CONTROL_ANDROID=1 (el APK sale sin indicador: el control se niega).
// ═══════════════════════════════════════════════════════════════════════════

#![allow(dead_code)]

use std::path::{Path, PathBuf};

pub const PAQUETE_OS: &str = "app.starseed.os";

const PERMISOS_INICIO: &str = "<!-- STARSEED-CONTROL-NEURONAS:PERMISOS:INICIO (no editar: lo escribe native/src-tauri/build.rs · ORD1114T) -->";
const PERMISOS_FIN: &str = "<!-- STARSEED-CONTROL-NEURONAS:PERMISOS:FIN -->";
const COMPONENTES_INICIO: &str = "<!-- STARSEED-CONTROL-NEURONAS:COMPONENTES:INICIO (no editar: lo escribe native/src-tauri/build.rs · ORD1114T) -->";
const COMPONENTES_FIN: &str = "<!-- STARSEED-CONTROL-NEURONAS:COMPONENTES:FIN -->";

/// Siempre (nadie más los declara).
pub const PERMISOS_PROPIOS: [(&str, &str); 2] = [
    ("android.permission.SYSTEM_ALERT_WINDOW", "Borde rojo y pastilla «Terminar» sobre otras apps mientras otra neurona controla esta (§2.4)."),
    ("android.permission.FOREGROUND_SERVICE_SPECIAL_USE", "Servicio de la notificación en curso del control entre neuronas (Android 14+)."),
];
/// Solo si ningún otro parche los declaró ya (el de las antenas lo hace).
pub const PERMISOS_COMPARTIDOS: [(&str, &str); 2] = [
    ("android.permission.POST_NOTIFICATIONS", "Notificación en curso con «Terminar» mientras otra neurona controla esta."),
    ("android.permission.FOREGROUND_SERVICE", "Servicio en primer plano de la notificación del control."),
];

pub const COMPONENTES: [&str; 2] = ["app.starseed.nativa.ArranqueControlNeuronas", "app.starseed.nativa.ServicioControlNeuronas"];

pub const KOTLIN: &str = include_str!("../android/ControlNeuronasStarSeed.kt");

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

pub fn bloque_permisos(manifiesto_sin_bloque: &str) -> String {
    let mut s = format!("    {PERMISOS_INICIO}\n");
    for (p, porque) in PERMISOS_PROPIOS {
        s.push_str(&format!("    <!-- {porque} -->\n    <uses-permission android:name=\"{p}\" />\n"));
    }
    for (p, porque) in PERMISOS_COMPARTIDOS {
        if !ya_declarado(manifiesto_sin_bloque, p) {
            s.push_str(&format!("    <!-- {porque} -->\n    <uses-permission android:name=\"{p}\" />\n"));
        }
    }
    s.push_str(&format!("    {PERMISOS_FIN}\n"));
    s
}

pub fn bloque_componentes() -> String {
    format!(
        "        {COMPONENTES_INICIO}
        <provider
            android:name=\"app.starseed.nativa.ArranqueControlNeuronas\"
            android:authorities=\"${{applicationId}}.starseed-control-neuronas\"
            android:exported=\"false\"
            android:initOrder=\"55\" />
        <service
            android:name=\"app.starseed.nativa.ServicioControlNeuronas\"
            android:exported=\"false\"
            android:foregroundServiceType=\"specialUse\">
            <property
                android:name=\"android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE\"
                android:value=\"Aviso fijo y botón Terminar mientras otro aparato de la misma cuenta, con permiso dado en este, manda órdenes a la app\" />
        </service>
        {COMPONENTES_FIN}
"
    )
}

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
    let kotlin = principal.join("java/app/starseed/nativa/ControlNeuronasStarSeed.kt");
    if escribir_si_cambia(&kotlin, KOTLIN)? {
        cambiados.push(kotlin);
    }
    Ok(cambiados)
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::control_neuronas_android as rs;

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
    fn declara_solo_lo_que_usa_y_en_su_sitio() {
        let m = parchear_manifiesto(PLANTILLA).unwrap();
        let p = m.find(PERMISOS_INICIO).unwrap();
        let a = m.find("<application").unwrap();
        let c = m.find(COMPONENTES_INICIO).unwrap();
        assert!(p < a && a < c && c < m.rfind("</application>").unwrap());
        for x in ["SYSTEM_ALERT_WINDOW", "FOREGROUND_SERVICE_SPECIAL_USE", "POST_NOTIFICATIONS", "\"android.permission.FOREGROUND_SERVICE\""] {
            assert!(m.contains(x), "{x}");
        }
        // Nada que la fase 1 no use: ni accesibilidad, ni captura, ni ajustes del sistema.
        for x in ["BIND_ACCESSIBILITY_SERVICE", "FOREGROUND_SERVICE_MEDIA_PROJECTION", "WRITE_SETTINGS", "MANAGE_EXTERNAL_STORAGE"] {
            assert!(!m.contains(x), "{x}");
        }
        assert!(m.contains("android:foregroundServiceType=\"specialUse\"") && m.contains("PROPERTY_SPECIAL_USE_FGS_SUBTYPE"));
        assert!(m.contains("android:exported=\"false\""));
    }

    #[test]
    fn idempotente_y_sin_duplicar_lo_que_otro_declara() {
        let una = parchear_manifiesto(PLANTILLA).unwrap();
        assert_eq!(parchear_manifiesto(&una).unwrap(), una);
        let con_antenas = PLANTILLA.replace(
            "<uses-permission android:name=\"android.permission.INTERNET\" />",
            "<uses-permission android:name=\"android.permission.INTERNET\" />\n    <uses-permission android:name=\"android.permission.POST_NOTIFICATIONS\" />\n    <uses-permission android:name=\"android.permission.FOREGROUND_SERVICE\" />",
        );
        let m = parchear_manifiesto(&con_antenas).unwrap();
        assert_eq!(m.matches("\"android.permission.POST_NOTIFICATIONS\"").count(), 1);
        assert_eq!(m.matches("\"android.permission.FOREGROUND_SERVICE\"").count(), 1);
        assert_eq!(parchear_manifiesto(&m).unwrap(), m);
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
        assert!(KOTLIN.contains("class ArranqueControlNeuronas : ContentProvider()"));
        assert!(KOTLIN.contains("class ServicioControlNeuronas : Service()"));
        assert!(KOTLIN.contains(&format!("const val CARPETA = \"{}\"", rs::CARPETA)));
        assert!(KOTLIN.contains(&format!("const val ESTADO = \"{}\"", rs::ESTADO)));
        assert!(KOTLIN.contains(&format!("const val PREFIJO_PETICION = \"{}\"", rs::PREFIJO_PETICION)));
        for m in rs::MOTIVOS {
            assert!(KOTLIN.contains(&format!("\"{m}\"")), "Kotlin no escribe «{m}»");
        }
        for campo in ["\"encendido\"", "\"notificaciones\"", "\"superposicion\"", "\"mostrando\"", "\"sesion\"", "\"pausada\"", "\"terminada\"", "\"falta\"", "\"t_ms\""] {
            assert!(KOTLIN.contains(campo), "Kotlin no escribe {campo}");
        }
        for accion in ["\"preparar\"", "\"mostrar\"", "\"quitar\"", "\"apagar\""] {
            assert!(KOTLIN.contains(accion), "Kotlin no atiende {accion}");
        }
        // El latido de Kotlin cabe con holgura en lo que Rust espera.
        assert!(KOTLIN.contains("const val LATIDO_MS = 2_000L") && rs::LATIDO_MAX_MS >= 3 * 2_000);
    }

    #[test]
    fn la_notificacion_termina_sin_la_pagina_y_descartarla_termina() {
        assert!(KOTLIN.contains("setOngoing(true)"));
        assert!(KOTLIN.contains("setDeleteIntent(pi(DESCARTADA"));
        assert!(KOTLIN.contains("TERMINAR -> terminar(\"la-persona-desde-la-notificacion\")"));
        assert!(KOTLIN.contains("PendingIntent.getService"), "lo atiende el servicio nativo, no la página");
        assert!(KOTLIN.contains("FLAG_WATCH_OUTSIDE_TOUCH") && KOTLIN.contains("ACTION_OUTSIDE"), "toque local → pausa");
        assert!(KOTLIN.contains("pBorde.alpha = 0.8f"), "los toques atraviesan el borde (Android 12+)");
    }

    #[test]
    fn ctl1117a_la_pausa_por_toque_local_se_quita_sola_a_los_3_s_y_terminar_sigue_mandando() {
        // Antes la pausa quedaba pegada hasta pulsar «Reanudar» (S7): ahora, 3 s sin tocar (contrato §12.1).
        assert!(KOTLIN.contains("private val reanudarSola = Runnable { reanudarPorSilencio() }"));
        assert!(KOTLIN.contains("principal.postDelayed(reanudarSola, ControlEntradaNativo.PAUSA_LOCAL_MS + 50)"));
        let r = KOTLIN.find("private fun reanudarPorSilencio()").unwrap();
        let cuerpo = &KOTLIN[r..r + 700];
        assert!(cuerpo.contains("PAUSA_LOCAL_MS") && cuerpo.contains("reanudar(\"reanudada-sola\")"), "solo reanuda con 3 s sin tocar, por la vía de `reanudar` (que ya respeta el gesto propio)");
        // Cada toque local vuelve a armar el reloj; cerrar y destruir lo cancelan.
        assert!(KOTLIN.contains("pausaLocal(); esperarSilencio()"));
        assert!(KOTLIN.matches("principal.removeCallbacks(reanudarSola)").count() >= 3);
        // Terminar y descartar siguen siendo de la persona: la auto-reanudación nunca se toca desde ellos.
        assert!(KOTLIN.contains("TERMINAR -> terminar(\"la-persona-desde-la-notificacion\")") && !KOTLIN.contains("reanudarPorSilencio()\n            TERMINAR"));
    }

    #[test]
    fn la_app_nunca_se_concede_nada() {
        for x in ["grantRuntimePermission", "pm grant", "appops", "TCC.db", "tccutil"] {
            assert!(!KOTLIN.contains(x), "{x}");
        }
        // Los permisos se PIDEN con lo del sistema y solo tras el «Sí» del diálogo nativo.
        assert!(KOTLIN.contains("requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS)"));
        assert!(KOTLIN.contains("Settings.ACTION_MANAGE_OVERLAY_PERMISSION"));
        let si = KOTLIN.find("setPositiveButton(\"Sí, dejar\")").unwrap();
        let pedir = KOTLIN.find("private fun pedirPermisosQueFaltan").unwrap();
        assert!(KOTLIN[si..].contains("pedirPermisosQueFaltan()") && pedir > 0);
        // ORD1114V: el interruptor solo se ENCIENDE en el «Sí» del diálogo nativo; ninguna petición de Rust lo enciende.
        assert_eq!(KOTLIN.matches("guardarInterruptor(true)").count(), 1);
        assert!(KOTLIN[si..].find("guardarInterruptor(true)").unwrap() < 200);
        assert!(!KOTLIN.contains("put(\"encendido\", true)"));
    }

    #[test]
    fn ctl1117c_con_sesion_el_webview_no_se_queda_parado_y_al_cerrar_todo_vuelve() {
        let k = KOTLIN;
        let f = k.find("object ControlFondo").unwrap();
        let fondo = &k[f..f + 4200];
        // Solo con sesión (`mostrando`): sin ella `mantener` suelta y no hace nada más.
        let m = fondo.find("fun mantener(").unwrap();
        assert!(fondo[m..m + 200].contains("if (!ControlNeuronasNativo.mostrando) {") && fondo[m..m + 260].contains("soltar(a)"));
        // La misma medida que `PuertaSegundoPlano` y la llamada nativa (`onResume` + `resumeTimers`), y prioridad IMPORTANTE del renderizador.
        assert!(fondo.contains("w.onResume()") && fondo.contains("w.resumeTimers()"));
        assert!(fondo.contains("w.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false)"));
        // Al soltar: prioridad de antes y el WebView otra vez en pausa si la app sigue detrás (como lo deja Wry).
        assert!(fondo.contains("w.setRendererPriorityPolicy(prioridadAntes, esperaAntes)") && fondo.contains("if (enFondo) w.onPause()"));
        // Quién la mueve: onPause/onStop/onResume de la actividad, el latido del indicador (que solo corre con sesión) y el cierre.
        assert!(k.contains("override fun onActivityPaused(a: Activity) { ControlFondo.cambio(a, true) }"));
        assert!(k.contains("override fun onActivityStopped(a: Activity) { ControlFondo.cambio(a, true) }"));
        assert!(k.contains("ControlFondo.cambio(a, false)"));
        let l = k.find("private val latido = object : Runnable").unwrap();
        assert!(k[l..l + 400].contains("if (!ControlNeuronasNativo.mostrando) return") && k[l..l + 400].contains("ControlFondo.mantener(ControlNeuronasNativo.actividadActual())"));
        let c = k.find("private fun cerrar()").unwrap();
        assert!(k[c..c + 200].contains("ControlFondo.soltar(") && k.matches("ControlFondo.soltar(").count() == 2);
        // El estado para Rust (solo diagnóstico) y NINGÚN permiso nuevo para sostenerlo (ni WakeLock ni ignorar la batería).
        assert!(k.contains(".put(\"en_fondo\", ControlFondo.enFondo)") && k.contains(".put(\"fondo\", ControlFondo.medida)") && k.contains(".put(\"reanudos\", ControlFondo.reanudos)"));
        for malo in ["WAKE_LOCK", "WakeLock", "REQUEST_IGNORE_BATTERY_OPTIMIZATIONS", "PowerManager"] {
            assert!(!fondo.contains(malo), "{malo}");
        }
    }

    #[test]
    fn ctl1117f_la_pausa_no_se_queda_pegada_y_dice_por_que_empieza_y_acaba() {
        // El temporizador de 3 s que no podía reanudar (gesto propio en el aire) se vuelve a armar, y cada latido (2 s) lo comprueba.
        assert!(KOTLIN.contains("if (!reanudar(\"reanudada-sola\")) esperarSilencio()"));
        let l = KOTLIN.find("private val latido = object : Runnable").unwrap();
        assert!(KOTLIN[l..l + 500].contains("vigilarPausa()"));
        let v = KOTLIN.find("private fun vigilarPausa()").unwrap();
        let cuerpo = &KOTLIN[v..v + 450];
        assert!(cuerpo.contains("PAUSA_LOCAL_MS") && cuerpo.contains("reanudar(\"reanudada-vigia\")"));
        // La reanudación sigue negándose con un gesto propio y a la persona no se le quita nada: «Reanudar» y «Terminar» siguen.
        let r = KOTLIN.find("private fun reanudar(motivo: String").unwrap();
        assert!(KOTLIN[r..r + 400].contains("esGestoPropio()) return false"));
        assert!(KOTLIN.contains("REANUDAR -> reanudar()") && KOTLIN.contains("setOnClickListener { reanudar() }"));
        // Motivos y números que Rust anota en `control-pausa`.
        for m in ["toque-fuera", "reanudada-sola", "reanudada-vigia", "reanudada-por-la-persona", "pausa_desde_gesto_ms", "\"pausas\"", "\"ignorados\"", "\"cuadro_ms\""] {
            assert!(KOTLIN.contains(m), "{m}");
        }
        // Un toque propio ignorado se cuenta; uno de la persona sigue pausando.
        assert!(KOTLIN.contains("ControlEntradaNativo.toqueLocal(); pausaLocal(); esperarSilencio() } else ControlEntradaNativo.ignorado()"));
    }
}
