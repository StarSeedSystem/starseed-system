// ═══════════════════════════════════════════════════════════════════════════
// android_ble — el Bluetooth directo en el proyecto Android que genera Tauri (BLE1108A, 2026-11-08).
// Contrato: architecture/bluetooth-directo.md §6.
// ---------------------------------------------------------------------------
// Como android_parche.rs y android_actualizador.rs, en su propio bloque: build.rs lo aplica tras
// `cargo tauri android init` y antes de que Gradle procese el manifiesto. Escribe:
//   · los permisos: Android 12+ BLUETOOTH_SCAN («neverForLocation»: no se usa para ubicar),
//     BLUETOOTH_ADVERTISE y BLUETOOTH_CONNECT; hasta Android 11, BLUETOOTH y BLUETOOTH_ADMIN (normales)
//     y ACCESS_FINE_LOCATION (sin él Android no da resultados de escaneo). La función BLE es opcional;
//   · el proveedor `ArranqueBle` (arranca la radio con el proceso, también con la app cerrada);
//   · `BleStarSeed.kt` (anunciante, escáner, servidor GATT y clientes GATT; Rust manda).
// Solo std (lo usa build.rs con `#[path]`). Idempotente: bloques entre marcadores, archivos escritos
// solo si cambian. Solo StarSeed OS y solo con el servicio de antenas (usa `PuenteNativo`).
// ═══════════════════════════════════════════════════════════════════════════

#![allow(dead_code)]

use std::path::{Path, PathBuf};

pub const PAQUETE_OS: &str = "app.starseed.os";

const PERMISOS_INICIO: &str = "<!-- STARSEED-BLE:PERMISOS:INICIO (no editar: lo escribe native/src-tauri/build.rs · BLE1108A) -->";
const PERMISOS_FIN: &str = "<!-- STARSEED-BLE:PERMISOS:FIN -->";
const COMPONENTES_INICIO: &str = "<!-- STARSEED-BLE:COMPONENTES:INICIO (no editar: lo escribe native/src-tauri/build.rs · BLE1108A) -->";
const COMPONENTES_FIN: &str = "<!-- STARSEED-BLE:COMPONENTES:FIN -->";

/// (permiso, atributos extra). Lo ya declarado en otro bloque (p. ej. BLUETOOTH_CONNECT de los medios)
/// no se repite.
pub const PERMISOS: [(&str, &str); 6] = [
    ("android.permission.BLUETOOTH_SCAN", " android:usesPermissionFlags=\"neverForLocation\""),
    ("android.permission.BLUETOOTH_ADVERTISE", ""),
    ("android.permission.BLUETOOTH_CONNECT", ""),
    ("android.permission.BLUETOOTH", " android:maxSdkVersion=\"30\""),
    ("android.permission.BLUETOOTH_ADMIN", " android:maxSdkVersion=\"30\""),
    ("android.permission.ACCESS_FINE_LOCATION", " android:maxSdkVersion=\"30\""),
];

/// La app también vale sin Bluetooth de baja energía.
pub const FUNCION: &str = "android.hardware.bluetooth_le";

pub const KOTLIN: &str = include_str!("../android/BleStarSeed.kt");

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

/// Bloque de permisos con los que aún no estén (fuera de este bloque).
pub fn bloque_permisos(manifiesto_sin_bloques: &str) -> String {
    let mut s = format!("    {PERMISOS_INICIO}\n");
    for (p, extra) in PERMISOS.iter().filter(|(p, _)| !ya_declarado(manifiesto_sin_bloques, p)) {
        s.push_str(&format!("    <uses-permission android:name=\"{p}\"{extra} />\n"));
    }
    if !ya_declarado(manifiesto_sin_bloques, FUNCION) {
        s.push_str(&format!("    <uses-feature android:name=\"{FUNCION}\" android:required=\"false\" />\n"));
    }
    s.push_str(&format!("    {PERMISOS_FIN}\n"));
    s
}

/// El proveedor que arranca la radio con el proceso (dentro de `<application>`).
pub fn bloque_componentes() -> String {
    format!(
        "        {COMPONENTES_INICIO}
        <provider
            android:name=\"app.starseed.nativa.ArranqueBle\"
            android:authorities=\"${{applicationId}}.starseed-ble\"
            android:exported=\"false\"
            android:initOrder=\"80\" />
        {COMPONENTES_FIN}
"
    )
}

/// Los permisos justo antes de la línea de `<application`, el proveedor justo antes de la de
/// `</application>` (los mismos anclajes que los otros bloques: aplicados siempre en el mismo orden
/// desde build.rs, el archivo queda igual build tras build).
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

/// STARSEED_SIN_BLUETOOTH_ANDROID: «1», «si»/«sí» o «true» lo apagan (interruptor de emergencia).
pub fn apagado(valor: Option<&str>) -> bool {
    matches!(valor.map(|v| v.trim().to_lowercase()).as_deref(), Some("1" | "si" | "sí" | "true"))
}

/// ¿Se inyecta en este paquete? Solo StarSeed OS y con el servicio de antenas (sin él no hay PuenteNativo).
pub fn aplica(paquete: &str, servicio_de_antenas: bool, apagado: bool) -> bool {
    servicio_de_antenas && !apagado && paquete.replace('`', "") == PAQUETE_OS
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
    let kotlin = principal.join("java/app/starseed/nativa/BleStarSeed.kt");
    if escribir_si_cambia(&kotlin, KOTLIN)? {
        cambiados.push(kotlin);
    }
    Ok(cambiados)
}

#[cfg(test)]
mod pruebas {
    use super::*;

    const PLANTILLA: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />

    <application
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name">
        <activity android:name=".MainActivity" android:exported="true" />
    </application>
</manifest>
"#;

    #[test]
    fn permisos_y_proveedor_en_su_sitio() {
        let m = parchear_manifiesto(PLANTILLA).unwrap();
        let p = m.find(PERMISOS_INICIO).unwrap();
        let a = m.find("<application").unwrap();
        let c = m.find(COMPONENTES_INICIO).unwrap();
        assert!(p < a && a < c && c < m.rfind("</application>").unwrap());
        assert!(m.contains("<uses-permission android:name=\"android.permission.BLUETOOTH_SCAN\" android:usesPermissionFlags=\"neverForLocation\" />"));
        assert!(m.contains("\"android.permission.BLUETOOTH_ADVERTISE\""));
        assert!(m.contains("<uses-permission android:name=\"android.permission.ACCESS_FINE_LOCATION\" android:maxSdkVersion=\"30\" />"));
        assert!(m.contains("<uses-feature android:name=\"android.hardware.bluetooth_le\" android:required=\"false\" />"));
        assert!(m.contains("app.starseed.nativa.ArranqueBle"));
        assert!(m.contains("${applicationId}.starseed-ble"));
    }

    #[test]
    fn idempotente_y_en_paz_con_los_otros_bloques_en_el_orden_de_build_rs() {
        use crate::android_actualizador as act;
        use crate::android_parche as ser;
        // El orden de build.rs: servicio, medios, actualizador y, por último, el Bluetooth.
        let todo = |t: &str| parchear_manifiesto(&act::parchear_manifiesto(&ser::parchear_medios(&ser::parchear_manifiesto(t).unwrap()).unwrap()).unwrap()).unwrap();
        let una = todo(PLANTILLA);
        let dos = todo(&una);
        assert_eq!(una, dos, "build tras build, el mismo archivo");
        assert_eq!(dos.matches(PERMISOS_INICIO).count(), 1);
        assert_eq!(dos.matches(COMPONENTES_INICIO).count(), 1);
        // BLUETOOTH_CONNECT y BLUETOOTH (≤ 30) ya los declaran los medios: una sola vez cada uno.
        assert_eq!(dos.matches("\"android.permission.BLUETOOTH_CONNECT\"").count(), 1);
        assert_eq!(dos.matches("\"android.permission.BLUETOOTH\"").count(), 1);
        assert_eq!(dos.matches("\"android.permission.BLUETOOTH_SCAN\"").count(), 1);
        assert_eq!(dos.matches("</manifest>").count(), 1);
    }

    #[test]
    fn en_paz_con_el_enlace_wifi_en_el_orden_de_build_rs() {
        // (INT1108C) build.rs: servicio, medios, actualizador, enlace Wi-Fi y, por último, el Bluetooth. Los dos
        // piden ACCESS_FINE_LOCATION: va UNA vez y con el tope del enlace Wi-Fi (Android 12, API 32), que
        // cubre el del Bluetooth (≤ 30). Al revés, el Wi-Fi se quedaría sin ubicación en Android 12.
        use crate::android_actualizador as act;
        use crate::android_parche as ser;
        use crate::enlace_wifi_parche as wifi;
        let todo = |t: &str| {
            let t = ser::parchear_medios(&ser::parchear_manifiesto(t).unwrap()).unwrap();
            parchear_manifiesto(&wifi::parchear_manifiesto(&act::parchear_manifiesto(&t).unwrap()).unwrap()).unwrap()
        };
        let una = todo(PLANTILLA);
        let dos = todo(&una);
        assert_eq!(una, dos, "build tras build, el mismo archivo");
        assert_eq!(dos.matches("\"android.permission.ACCESS_FINE_LOCATION\"").count(), 1);
        assert!(dos.contains("<uses-permission android:name=\"android.permission.ACCESS_FINE_LOCATION\" android:maxSdkVersion=\"32\" />"));
        assert!(dos.contains("app.starseed.nativa.ArranqueBle") && dos.contains("app.starseed.nativa.ArranqueEnlaceWifi"));
        assert_eq!(dos.matches("\"android.permission.BLUETOOTH_SCAN\"").count(), 1);
        assert_eq!(dos.matches("\"android.permission.NEARBY_WIFI_DEVICES\"").count(), 1);
        assert_eq!(dos.matches("</manifest>").count(), 1);
    }

    #[test]
    fn solo_starseed_os_con_servicio_y_sin_interruptor() {
        assert!(aplica("app.starseed.os", true, false));
        assert!(aplica("app.starseed.`os`", true, false));
        assert!(!aplica("app.starseed.nexus", true, false));
        assert!(!aplica("app.starseed.os", false, false), "sin servicio de antenas no hay PuenteNativo");
        assert!(!aplica("app.starseed.os", true, true));
        assert!(apagado(Some(" Sí ")) && apagado(Some("1")) && !apagado(None) && !apagado(Some("0")));
        assert!(parchear_manifiesto("<manifest></manifest>").unwrap_err().contains("<application>"));
    }

    #[test]
    fn kotlin_habla_con_ble_android_rs() {
        assert!(KOTLIN.contains("package app.starseed.nativa"));
        for f in [
            "external fun evento(json: String)",
            "external fun datos(enlace: String, hex: String)",
            "external fun siguiente(enlace: String): String",
            "external fun esperarOrden(ms: Long): String",
            // BLE1109A
            "external fun rapido(enlace: String, hex: String)",
            "external fun siguienteRapido(enlace: String, max: Int): String",
        ] {
            assert!(KOTLIN.contains(f), "{f}");
        }
        let rust = include_str!("ble_android.rs");
        for s in [
            "Java_app_starseed_nativa_PuenteBle_evento",
            "Java_app_starseed_nativa_PuenteBle_datos",
            "Java_app_starseed_nativa_PuenteBle_siguiente",
            "Java_app_starseed_nativa_PuenteBle_esperarOrden",
            // BLE1109A
            "Java_app_starseed_nativa_PuenteBle_rapido",
            "Java_app_starseed_nativa_PuenteBle_siguienteRapido",
        ] {
            assert!(rust.contains(s), "{s}");
        }
        // Los UUID de Kotlin son los de ble_trama.rs.
        for u in [
            crate::ble_trama::SERVICIO,
            crate::ble_trama::ENTRADA,
            crate::ble_trama::SALIDA,
            crate::ble_trama::CCCD,
            crate::ble_trama::UUID_PREFIJO,
            crate::ble_trama::UUID_MASCARA,
            crate::ble_l2cap::PSM, // BLE1109A
        ] {
            assert!(KOTLIN.contains(&format!("\"{u}\"")), "{u}");
        }
        // Cada orden que manda Rust la atiende Kotlin, y cada evento de Kotlin lo lee Rust.
        for o in ["arrancar", "anunciar", "conectar", "desconectar", "datos", "permisos", "parar", "l2cap", "cerrar-l2cap", "canal-rapido", "compartir"] {
            assert!(KOTLIN.contains(&format!("\"{o}\" ->")), "orden {o}");
            assert!(rust.contains(&format!("\"o\": \"{o}\"")), "orden {o} en Rust");
        }
        for e in ["radio", "visto", "conectado", "mtu", "desconectado", "nota", "psm", "l2cap-abierto", "l2cap-cerrado"] {
            assert!(KOTLIN.contains(&format!("put(\"e\", \"{e}\")")), "evento {e}");
            assert!(include_str!("ble.rs").contains(&format!("\"{e}\" =>")), "evento {e} en Rust");
        }
    }

    /// (P37-1111) El hex del carril BLE: dos dígitos por byte, sin `toString(16)`/`%x` (que se comen
    /// los ceros a la izquierda y dejarían el paquete truncado en el otro extremo). Es el mismo
    /// contrato que `ble_trama::a_hex` y que `ServidorLocalLogica.hex`/`hexSinRelleno`.
    #[test]
    fn kotlin_hex_de_paquetes_es_de_dos_digitos_por_byte() {
        let ini = KOTLIN.find("fun aHex(b: ByteArray): String").expect("aHex");
        let fin = ini + KOTLIN[ini..].find("fun deHex(").expect("deHex");
        let codifica = &KOTLIN[ini..fin];
        assert!(codifica.contains("CharArray(b.size * 2)"), "un carácter por nibble: nunca se recorta el paquete");
        assert!(codifica.contains("HEX[v ushr 4]") && codifica.contains("HEX[v and 0x0f]"), "los ceros a la izquierda también salen");
        assert!(!codifica.contains("toString(16)") && !codifica.contains("%x"), "nada de formatos que quitan ceros");
        let decodifica = &KOTLIN[fin..fin + 400];
        assert!(decodifica.contains("s.length % 2 != 0") && decodifica.contains("return null"), "un hex impar no es un paquete");
        // El gemelo de Rust produce el mismo patrón (16 B → 32 caracteres).
        assert_eq!(crate::ble_trama::a_hex(&[0x11, 0x22, 0x33]), "112233");
        assert_eq!(crate::ble_trama::a_hex(&[0x0f, 0x00, 0xaa]), "0f00aa");
    }

    /// (BLE1108C) `reanudarRadio` solo arranca lo que falta (anuncio y escaneo): no toca el servidor GATT ni los
    /// clientes ni para un anuncio en marcha, así que un enlace con datos en vuelo jamás se cae por él.
    #[test]
    fn reanudar_radio_no_tumba_un_enlace_en_marcha() {
        let ini = KOTLIN.find("private fun reanudarRadio()").expect("reanudarRadio");
        let cuerpo = &KOTLIN[ini..];
        let fin = cuerpo.find("\n    }\n").expect("fin de reanudarRadio");
        let f = &cuerpo[..fin];
        for prohibido in ["stopAdvertising", "cancelConnection", "disconnect", "close", "servidor", "clientes", "centrales", "limpiar", "cerrarCliente", "desconectar("] {
            assert!(!f.contains(prohibido), "reanudarRadio no debe tocar «{prohibido}»");
        }
        assert!(f.contains("if (!anunciando) anunciar(false)"), "solo anuncia si no hay anuncio (sin forzar: MLL1111C)");
        assert!(f.contains("escanear()"));
        assert!(f.contains("if (reanudarPendiente) return"), "MLL1111C: una sola reanudación pendiente");
    }

    /// (MLL1111C) El gemelo Kotlin de `ble_autocura` (desconexión repetida, anuncio que junta peticiones, plazo creciente
    /// y contador real) sigue escrito como en Rust.
    #[test]
    fn kotlin_es_gemelo_de_la_tormenta_de_la_prueba_35() {
        let ini = KOTLIN.find("STATE_DISCONNECTED) {\n                    val c = centrales.remove(k)").expect("desconexión del servidor");
        let f = &KOTLIN[ini..ini + 1400];
        let repetida = f.find("if (c == null) {").expect("una desconexión sin conexión previa es repetida");
        let cancela = f.find("cancelConnection(d)").expect("la real se libera");
        assert!(repetida < cancela, "la repetida sale ANTES de cancelar otra vez (el bucle de la prueba 35)");
        assert!(f[repetida..cancela].contains("return@post"));
        let an = KOTLIN.find("private fun anunciar(forzar: Boolean = true)").expect("anunciar con forzar");
        let g = &KOTLIN[an..an + 900];
        assert!(g.contains("ahora - anuncioPedidoMs < CONFIRMAR_ANUNCIO_MS) return"), "un arranque en curso no se reinicia");
        assert!(g.contains("if (anunciando && !forzar) return"));
        assert!(KOTLIN.contains("CONFIRMAR_ANUNCIO_MS = 3_000L") && crate::ble_autocura::CONFIRMAR_ANUNCIO_MS == 3_000);
        assert!(KOTLIN.contains("ENTRE_CURAS_MAX_MS = 1_800_000L") && crate::ble_autocura::ENTRE_CURAS_MAX_MS == 1_800_000);
        assert!(KOTLIN.contains("plazoEntreCuras(curasSeguidas)"));
        assert!(KOTLIN.contains("nota(\"contador-enlaces\""));
    }

    /// (BLE1108C) Los hitos que Kotlin anota son los que Rust acepta, y cubren descubrimiento, suscripción,
    /// «listo» tardío y reintento; el periférico vigila que el otro se suscriba.
    #[test]
    fn hitos_de_kotlin_son_los_que_rust_acepta() {
        let mut vistos = Vec::new();
        let mut resto = KOTLIN;
        while let Some(i) = resto.find("nota(\"") {
            let r = &resto[i + 6..];
            let f = r.find('"').unwrap();
            vistos.push(r[..f].to_string());
            resto = &r[f..];
        }
        for h in ["servicios-descubiertos", "suscrito", "sin-suscripcion", "listo-tarde", "suscripcion-reintento"] {
            assert!(vistos.iter().any(|v| v == h), "Kotlin no anota «{h}»");
            assert!(crate::ble::NOTAS_RADIO.contains(&h));
        }
        for v in &vistos {
            assert!(crate::ble::NOTAS_RADIO.contains(&v.as_str()), "Rust no acepta la nota «{v}»");
        }
        assert!(KOTLIN.contains("VIGIA_SUSCRIPCION_MS"), "el periférico vigila la suscripción del otro");
        assert!(KOTLIN.contains("REINTENTOS_SUSCRIPCION"), "el central reintenta la suscripción");
        assert!(KOTLIN.contains("VIGIA_ESCRITURA_MS = 500L"));
    }

    /// (BLE1109A) El canal L2CAP de Kotlin: guardado por versión, sin cifrado de aire (va por encima), con vigía de
    /// escritura, PHY de 2M y E/S fuera del hilo principal. Y el bloque no toca el camino de GATT.
    #[test]
    fn kotlin_del_canal_rapido_esta_guardado_y_es_pequeno() {
        for f in [
            "listenUsingInsecureL2capChannel",
            "createInsecureL2capChannel",
            "Build.VERSION.SDK_INT < 29",
            "PHY_LE_2M_MASK",
            "Build.VERSION.SDK_INT < 26",
            "PLAZO_ESCRITURA_FLUJO_MS",
            "onCharacteristicReadRequest",
            "PuenteBle.rapido(k, aHex(",
            "PuenteBle.siguienteRapido(k, ESCRITURA_FLUJO)",
        ] {
            assert!(KOTLIN.contains(f), "Kotlin sin «{f}»");
        }
        assert!(!KOTLIN.contains("createL2capChannel(") && !KOTLIN.contains("listenUsingL2capChannel"), "solo canales sin cifrar por el aire: el cifrado va por encima");
        // La E/S bloqueante va en hilos propios (nunca en el principal).
        for h in ["starseed-l2cap-lee", "starseed-l2cap-escribe", "starseed-l2cap-acepta", "starseed-l2cap-conecta"] {
            assert!(KOTLIN.contains(h), "hilo {h}");
        }
        // El bloque del carril rápido es pequeño (se compila en CI, no aquí).
        let ini = KOTLIN.find("Carril rápido: canal L2CAP (BLE1109A)").expect("bloque");
        let fin = KOTLIN[ini..].find("fun aHex(b: ByteArray): String").expect("fin del bloque");
        assert!(KOTLIN[ini..ini + fin].lines().count() < 330, "el bloque L2CAP de Kotlin debe seguir siendo pequeño");
        // (BLE1109B) `bombear` despierta al hilo del canal Y deja seguir a GATT: Rust decide por qué carril sale cada paquete.
        let b = KOTLIN.find("private fun bombear(k: String)").expect("bombear");
        let cuerpo = &KOTLIN[b..b + KOTLIN[b..].find("c.ocupadoDesde").unwrap()];
        assert!(cuerpo.contains("canales[k]?.senal?.offer(true)") && !cuerpo.contains("return\n        }\n        if (k.startsWith"), "el canal no puede dejar a GATT mudo");
    }

    /// (BLE1109B) Causa raíz de la regresión de prueba.31: nada que pueda bloquear (crear el socket L2CAP, leer su PSM,
    /// `accept()`) corre en el hilo principal ni en un callback GATT; el PSM se publica con el socket ya listo; el PSM del
    /// otro se lee solo tras «ligado»; y el PHY 2M no se pide al conectar.
    #[test]
    fn kotlin_del_canal_rapido_no_bloquea_el_hilo_principal_ni_los_callbacks_gatt() {
        // `listenUsingInsecureL2capChannel` solo aparece dentro de `servirL2cap`, que corre en su propio hilo.
        assert_eq!(KOTLIN.matches("a.listenUsingInsecureL2capChannel()").count(), 1);
        let serv = KOTLIN.find("private fun servirL2cap(").expect("servirL2cap");
        assert!(KOTLIN.find("a.listenUsingInsecureL2capChannel()").unwrap() > serv);
        assert_eq!(KOTLIN.matches("ss.accept()").count(), 1);
        assert!(KOTLIN.contains("Thread({ servirL2cap(a, gen) }, \"starseed-l2cap-acepta\")"));
        // `arrancar` ya no crea el socket: lo pide `onServiceAdded`, con el servicio GATT registrado.
        let arr = KOTLIN.find("private fun arrancar()").unwrap();
        let fin = arr + KOTLIN[arr..].find("private fun limpiar(").unwrap();
        assert!(!KOTLIN[arr..fin].contains("abrirServidorL2cap()"));
        assert!(KOTLIN.contains("if (servicioListo) abrirServidorL2cap()"));
        // El PSM se publica después de crear el socket y de leer su PSM.
        let crea = KOTLIN.find("a.listenUsingInsecureL2capChannel()").unwrap();
        let publica = KOTLIN.find("psmPublicado = psm").unwrap();
        assert!(crea < KOTLIN.find("ss?.psm").unwrap() && KOTLIN.find("ss?.psm").unwrap() < publica);
        // La lectura del PSM del otro ya no ocurre al suscribirse: la ordena Rust al ligar.
        assert!(KOTLIN.contains("\"leer-psm\" -> leerPsm("));
        let dw = KOTLIN.find("override fun onDescriptorWrite(gatt").unwrap();
        let dw_fin = dw + KOTLIN[dw..].find("override fun onCharacteristicChanged").unwrap();
        assert!(!KOTLIN[dw..dw_fin].contains("readCharacteristic"), "nada de leer el PSM en la suscripción");
        // El PHY 2M se pide con retraso, nunca dentro del callback de conexión.
        assert!(KOTLIN.contains("RETRASO_PHY_MS"));
        assert!(KOTLIN.contains("principal.postDelayed({\n            try {\n                f()"));
    }
}
