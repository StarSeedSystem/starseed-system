// Script de construcción de Tauri: embebe tauri.conf.json, los iconos y las
// capabilities en el binario, y genera los esquemas de permisos en gen/schemas.
//
// Además (2026-10-10, architecture/apps-nativas-segundo-plano.md §2.3): al compilar
// para Android, inyecta en el proyecto que genera `cargo tauri android init` el
// servicio de antenas en primer plano (manifiesto + Kotlin + reglas de R8). Solo
// StarSeed OS; `STARSEED_SIN_SERVICIO_ANDROID=1` lo desactiva.

#[path = "src/android_parche.rs"]
mod android_parche;
// (ACT1108A) Actualizador interno del APK: descarga, verifica y abre el instalador de Android.
#[path = "src/android_actualizador.rs"]
mod android_actualizador;
// (BLE1108A) Bluetooth directo: permisos, proveedor y BleStarSeed.kt en el proyecto Android.
#[path = "src/android_ble.rs"]
mod android_ble;
// (WFD1108A) Enlace Wi-Fi directo: permisos, proveedor y EnlaceWifiDirecto.kt en el proyecto Android.
#[path = "src/enlace_wifi_parche.rs"]
mod enlace_wifi_parche;
// (LLA1108D) Las llamadas como llamadas del teléfono: permisos, componentes y LlamadaNativaStarSeed.kt.
#[path = "src/llamada_nativa_parche.rs"]
mod llamada_nativa_parche;
// (PTA1108B) El proxy de la puerta de internet en Android: proveedor, ProxyPuertaStarSeed.kt y androidx.webkit.
#[path = "src/puerta_proxy_parche.rs"]
mod puerta_proxy_parche;
// (UBI1114K) La ubicación del aparato en Android: permisos, proveedor y UbicacionStarSeed.kt.
#[path = "src/ubicacion_parche.rs"]
mod ubicacion_parche;
// ORD1114T: el indicador nativo del control entre neuronas en Android (permisos, servicio y Kotlin).
#[path = "src/control_neuronas_parche.rs"]
mod control_neuronas_parche;
#[path = "src/control_entrada_parche.rs"]
mod control_entrada_parche; // AND1115K

/// Comandos propios de la app (los de `generate_handler!` de src/lib.rs). Desde tauri 2.11.1 una
/// página de un origen REMOTO (la web publicada, y también el servidor local http://127.0.0.1:47610…)
/// solo llega a un comando propio si una capability con `remote` le da su permiso `allow-<comando>`;
/// sin manifiesto de la app esos permisos ni existen y TODA llamada de la web se rechaza («not
/// allowed by ACL»). Aquí se generan; las capabilities los conceden. Una prueba
/// (src/lib/nativa/__tests__/contrato-rust.test.ts) vigila que esta lista, lib.rs y las capabilities
/// casen. (APP1107B, 2026-11-07)
const COMANDOS_APP: &[&str] = &[
    // PENA1
    // (SEG1111U) Solo escritorio y con «acceso al equipo» (acceso_equipo.rs); su permiso solo lo da
    // capabilities/acceso-equipo.json. Inventario: architecture/permisos-y-control-del-dispositivo.md §4.8.1.
    "run_terminal",
    // (TRM1125B) Terminal entre neuronas: ejecución nativa con salida en vivo (comando terminal_ejecutar).
    // Solo escritorio, con «acceso al equipo» y nivel concedido (usuario/administrador vía ayudante TRM1125C).
    "terminal_ejecutar",
    "terminal_cancelar",
    "check_update",
    "reiniciar_para_actualizar",
    "estado_actualizacion",
    "device_info",
    // (VER1107B) «Esta neurona» y buscar la versión nueva sin instalarla.
    "info_neurona",
    "buscar_actualizacion",
    // (NEU1108A) Pista del id de neurona del origen publicado (APK con servidor local).
    "pista_neurona",
    "pista_neurona_leer",
    // (MIC1108A) Qué sabe la app de los permisos de medios y abrir los ajustes del sistema.
    "medios_estado",
    "medios_abrir_ajustes",
    // (CTL1118M) Si WebRTC es utilizable en Linux (elementos de GStreamer del sistema).
    "webrtc_linux_estado",
    // (PER1108A) Asistente de permisos del primer arranque y pantalla completa de la ventana.
    "permisos_inicio_estado",
    "permisos_inicio_pedir",
    "ventana_pantalla_completa",
    // (PER1111S) Lista de permisos de cada neurona: estado real, aviso del sistema y pantalla de Ajustes.
    "permisos_sistema_estado",
    "permisos_sistema_pedir",
    "permisos_sistema_abrir",
    "recursos_ia_detectar",
    "energia_estado",
    // (MOD1110B) Instalación guiada de Ollama (solo escritorio).
    "ollama_instalador_descargar",
    "ollama_instalador_cancelar",
    "ollama_instalador_abrir",
    "antenas_estado",
    "antenas_medir",
    "antenas_config",
    "antenas_configurar",
    "fondo_estado",
    "fondo_fijar",
    "fondo_arranque",
    "fondo_pedir_bateria",
    "carpetas_listar",
    "carpetas_conceder",
    "carpetas_revocar",
    "carpetas_nas",
    "serie_puertos",
    "serie_abrir",
    "serie_escribir",
    "serie_cerrar",
    "capas_estado",
    "capas_descargar",
    "capas_verificar",
    "capas_borrar",
    "nas_listar",
    "nas_leer",
    "almacenes_listar",
    "malla_local_enviar",
    "malla_local_estado",
    "malla_local_recibidos",
    // (BLE1108A) Bluetooth directo entre neuronas (macOS y Android; en las demás responden que no lo hay).
    "ble_estado",
    "ble_abrir",
    "ble_cerrar",
    "ble_enviar",
    "ble_recibidos",
    "ble_activar",
    "ble_pedir_permiso",
    "ble_registro",
    "ble_registro_anexar",
    "registro_espejo_anexar",
    "ble_canal_rapido",       // BLE1109B
    "ble_enlace_ligado",      // BLE1109B
    "ble_registro_compartir", // BLE1109B
    // (ACT1108A) Actualizador interno del APK (Android; en escritorio responden «solo Android»).
    "apk_actualizar",
    "apk_estado",
    "apk_instalar",
    // (NOT1108A) Avisos del sistema de los mensajes y origen estable del servidor local (rescate entre puertos).
    "aviso_mensaje",
    "avisos_config",
    "avisos_estado",
    "avisos_pedir_permiso",
    "avisos_pendiente",
    "origen_local_estado",
    "rescate_origen_exportar",
    "rescate_origen_estado",
    "rescate_origen_datos",
    "rescate_origen_confirmar",
    // (WFD1108A) Enlace Wi-Fi directo entre neuronas (Android levanta la red, macOS se une).
    "enlace_wifi_capacidades",
    "enlace_wifi_permiso",
    "enlace_wifi_abrir_ap",
    "enlace_wifi_credenciales",
    "enlace_wifi_unirse",
    "enlace_wifi_estado",
    "enlace_wifi_cerrar",
    "enlace_wifi_comprobar",
    // (WFA1109A) AWDL entre Mac, sin router ni hotspot.
    "awdl_iniciar", // WFA1109A
    "awdl_detener", // WFA1109A
    "awdl_estado", // WFA1109A
    // (LLA1108D) Las llamadas como llamadas del teléfono (Android; en macOS no duerme; en el resto, no-op).
    "llamada_nativa_iniciar",
    "llamada_nativa_estado",
    "llamada_nativa_ruta_audio",
    "llamada_nativa_proximidad",
    "llamada_nativa_capacidades",
    "llamada_nativa_permiso",
    // (LLA1108F) Ignorar, eventos tardíos, silencios espejados y despertador firmado.
    "llamada_nativa_ignorar",
    "llamada_nativa_recientes",
    "llamada_silencios_sincronizar",
    "llamada_timbre_firmar",
    // ORD1114Q: control entre mis neuronas (sesión, orden, anotar, parar y estado; lado nativo).
    "control_neuronas_abrir",
    "control_neuronas_orden",
    "control_neuronas_anotar",
    "control_ajustes_leer", // CTL1117H: ajustes nativos del aparato controlado (indicador, toques visibles)
    "control_ajustes_poner", // CTL1117H
    "control_fondo_nota", // CTL1117C: la línea `control-fondo` (segundo plano) desde la página
    "control_neuronas_parar",
    "control_neuronas_estado",
    "control_neuronas_preparar", // ORD1114T: en Android pide a Kotlin el diálogo nativo del interruptor
    // AND1115K: pantalla y entrada de la tableta (seam 1 de la fase 2-3)
    "control_entrada",
    "control_capacidades",
    "control_abrir_ajuste",
    "control_estado_aparato",
    "control_entrada_aceptar",
    "control_entrada_aceptados",
    "banco_latido_activar", // PENA1
    "control_entrada_quitar", // PENB2
    "control_pantalla_iniciar",
    "control_pantalla_cuadro",
    "control_pantalla_parar",
    // (PTA1108B) Proxy de la puerta de internet para el webview y las descargas de Rust.
    "puerta_proxy_local",
    "puerta_proxy_estado",
    // (UBI1114K) Ubicación del aparato: estado, una medida, vigilar, parar y lo último medido.
    "ubicacion_estado",
    "ubicacion_ahora",
    "ubicacion_vigilar",
    "ubicacion_parar",
    "ubicacion_ultima",
    // (CTL1119E · SUP1121A) Clave nativa del aparato (ECDSA P-256) para Linux/Windows sin WebCrypto.
    "clave_aparato_crear",
    "clave_aparato_firmar",
    "clave_aparato_spki",
    "clave_aparato_estado",
    "clave_aparato_olvidar",
    // NEU1125A-d1: huella del aparato (Android: identificador nativo hasheado con SHA-256 + sal)
    "huella_aparato_generar",
    "huella_aparato_actual",
    "huella_aparato_verificar",
    // Solo escritorio (su permiso existe en todas, pero solo se registran en escritorio).
    "ventanas_prestables",
    "capturar_ventana",
    "entrada_ventana",
    // (SEG1111T) Abrir, parar y consultar la sesión nativa de préstamo de ventanas.
    "prestamo_ventana_iniciar",
    "prestamo_ventana_parar",
    "prestamo_ventana_estado",
    // (SEG1111U) «Acceso al equipo»: estado, pedir (diálogo nativo) y quitar. Solo escritorio.
    "acceso_equipo_estado",
    "acceso_equipo_pedir",
    "acceso_equipo_revocar",
    "servidor_local_estado",
    "servidor_local_actualizar",
    "servidor_local_buscar", // AND1114L
    "migracion_origen_exportar",
    "migracion_origen_estado",
    "migracion_origen_datos",
    "migracion_origen_confirmar",
];

fn main() {
    println!("cargo:rerun-if-changed=src/android_parche.rs");
    println!("cargo:rerun-if-changed=android");
    println!("cargo:rerun-if-env-changed=STARSEED_SIN_SERVICIO_ANDROID");
    println!("cargo:rerun-if-env-changed=STARSEED_SIN_WIFI_AWARE"); // WFA1109A
    println!("cargo:rerun-if-env-changed=TAURI_ANDROID_PROJECT_PATH");
    println!("cargo:rerun-if-env-changed=STARSEED_SERVIDOR_LOCAL_ANDROID");
    // (AND1107A) Se declara siempre (que rustc no avise de un cfg desconocido); solo se ENCIENDE abajo.
    println!("cargo:rustc-check-cfg=cfg(starseed_servidor_android)");
    println!("cargo:rustc-check-cfg=cfg(starseed_medios_android)");
    servicio_android();
    medios_android();
    servidor_local_android();
    actualizador_android();
    enlace_wifi_android(); // (WFD1108A)
    llamadas_nativas_android(); // (LLA1108D)
    proxy_puerta_android(); // (PTA1108B)
    ubicacion_android(); // (UBI1114K) ANTES que el Bluetooth: su bloque declara la ubicación fina sin tope de versión.
    control_neuronas_android(); // ORD1114T
    control_entrada_android(); // AND1115K
    // (BLE1108A) Siempre el último: su bloque del manifiesto va detrás de los otros (mismo orden, mismo archivo).
    bluetooth_android();
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(COMANDOS_APP)),
    )
    .expect("tauri-build: no se pudo generar el contexto de la app")
}

fn servicio_android() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("android") {
        return;
    }
    let paquete = std::env::var("TAURI_ANDROID_PACKAGE_UNESCAPED")
        .or_else(|_| std::env::var("WRY_ANDROID_PACKAGE"))
        .unwrap_or_default();
    let desactivado = std::env::var_os("STARSEED_SIN_SERVICIO_ANDROID").is_some();
    if !android_parche::aplica(&paquete, desactivado) {
        if desactivado {
            println!("cargo:warning=[starseed] STARSEED_SIN_SERVICIO_ANDROID: el APK sale SIN servicio de antenas.");
        }
        return;
    }
    let Some(proyecto) = std::env::var_os("TAURI_ANDROID_PROJECT_PATH").map(std::path::PathBuf::from) else {
        println!("cargo:warning=[starseed] Sin TAURI_ANDROID_PROJECT_PATH (¿build sin la CLI de Tauri?): el APK sale SIN servicio de antenas.");
        return;
    };
    let libreria = std::env::var("WRY_ANDROID_LIBRARY").unwrap_or_else(|_| "starseed_native_lib".to_string());
    println!(
        "cargo:rerun-if-changed={}",
        proyecto.join("app/src/main/AndroidManifest.xml").display()
    );
    match android_parche::aplicar(&proyecto, &libreria) {
        Ok(cambiados) => {
            for c in cambiados {
                println!("cargo:warning=[starseed] servicio de antenas: escrito {}", c.display());
            }
        }
        // Falla en alto: un APK que dice tener servicio y no lo tiene sería una ilusión.
        Err(e) => panic!("[starseed] No se pudo inyectar el servicio de antenas en Android: {e}. Para compilar sin él: STARSEED_SIN_SERVICIO_ANDROID=1"),
    }
}

/// (MIC1108A) Micrófono, cámara y auriculares en el manifiesto de Android: sin ellos el WebView pide
/// el permiso en tiempo de ejecución y Android lo niega al instante (permiso no declarado), así que
/// toda llamada fallaba. Las tres apps (OS, Nexus y Café) y aunque el servicio de antenas esté
/// apagado. Si se escribe, enciende `starseed_medios_android` (lo lee `medios_estado`). Contrato §13.
fn medios_android() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("android") {
        return;
    }
    let paquete = std::env::var("TAURI_ANDROID_PACKAGE_UNESCAPED")
        .or_else(|_| std::env::var("WRY_ANDROID_PACKAGE"))
        .unwrap_or_default();
    if !android_parche::aplica_medios(&paquete) {
        return;
    }
    let Some(proyecto) = std::env::var_os("TAURI_ANDROID_PROJECT_PATH").map(std::path::PathBuf::from) else {
        println!("cargo:warning=[starseed] Sin TAURI_ANDROID_PROJECT_PATH: el APK sale SIN micrófono ni cámara declarados.");
        return;
    };
    println!(
        "cargo:rerun-if-changed={}",
        proyecto.join("app/src/main/AndroidManifest.xml").display()
    );
    match android_parche::aplicar_medios(&proyecto) {
        Ok(cambiado) => {
            if cambiado {
                println!("cargo:warning=[starseed] micrófono, cámara y auriculares declarados en el AndroidManifest.xml (MIC1108A).");
            }
            println!("cargo:rustc-cfg=starseed_medios_android");
        }
        // Falla en alto: un APK sin estos permisos no puede llamar y nadie lo notaría hasta probarlo.
        Err(e) => panic!("[starseed] No se pudieron declarar el micrófono y la cámara en Android: {e}"),
    }
}

/// (AND1107A) Servidor local DENTRO de la APK (nodejs-mobile) — interruptor de build APAGADO por
/// defecto: sin STARSEED_SERVIDOR_LOCAL_ANDROID=1 no se compila ni una línea de él y la APK sale como
/// siempre. Encendido: solo StarSeed OS, y el proyecto Android tiene que venir preparado por
/// native/servidor-local/preparar-android.mjs (si no, falla en alto). Contrato §9.1.
fn servidor_local_android() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("android") {
        return;
    }
    let proyecto = std::env::var_os("TAURI_ANDROID_PROJECT_PATH").map(std::path::PathBuf::from);
    if !android_parche::servidor_local_encendido(std::env::var("STARSEED_SERVIDOR_LOCAL_ANDROID").ok().as_deref()) {
        // Proyecto preparado pero interruptor apagado: la ventana se quedaría en la página de arranque.
        if proyecto.as_deref().is_some_and(android_parche::servidor_local_inyectado) {
            panic!("[starseed] El proyecto Android está preparado para el servidor local (preparar-android.mjs) pero falta STARSEED_SERVIDOR_LOCAL_ANDROID=1: enciéndelo o vuelve a `cargo tauri android init` desde cero.");
        }
        return;
    }
    let paquete = std::env::var("TAURI_ANDROID_PACKAGE_UNESCAPED")
        .or_else(|_| std::env::var("WRY_ANDROID_PACKAGE"))
        .unwrap_or_default();
    if !android_parche::aplica(&paquete, false) {
        println!("cargo:warning=[starseed] STARSEED_SERVIDOR_LOCAL_ANDROID solo vale para StarSeed OS ({paquete:?}): este APK sale sin servidor local.");
        return;
    }
    match proyecto {
        Some(proyecto) => {
            if let Err(e) = android_parche::servidor_local_preparado(&proyecto) {
                panic!("[starseed] STARSEED_SERVIDOR_LOCAL_ANDROID=1 pero el proyecto Android no está preparado ({e}). Prepáralo con `node native/servidor-local/preparar-android.mjs --tar <servidor-next.tar> --proyecto native/src-tauri/gen/android --conf native/src-tauri/tauri.android.conf.json` o quita la variable.");
            }
        }
        None => println!("cargo:warning=[starseed] Sin TAURI_ANDROID_PROJECT_PATH: se compila el servidor local sin comprobar el proyecto Android."),
    }
    println!("cargo:rustc-cfg=starseed_servidor_android");
    println!("cargo:warning=[starseed] servidor local DENTRO de la APK: encendido (AND1107A).");
}

/// (ACT1108A) Actualizador interno del APK de StarSeed OS: `REQUEST_INSTALL_PACKAGES`, su FileProvider
/// y ActualizadorApk.kt en el proyecto que genera `cargo tauri android init`. Independiente del servicio
/// de antenas (va aunque STARSEED_SIN_SERVICIO_ANDROID lo apague). Contrato centro-versiones-1105.md §9.
fn actualizador_android() {
    println!("cargo:rerun-if-changed=src/android_actualizador.rs");
    println!("cargo:rerun-if-env-changed=STARSEED_SIN_ACTUALIZADOR_ANDROID");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("android") {
        return;
    }
    // Interruptor de emergencia: sin él el APK sale como antes (la web ofrece el .apk a mano).
    if std::env::var_os("STARSEED_SIN_ACTUALIZADOR_ANDROID").is_some() {
        println!("cargo:warning=[starseed] STARSEED_SIN_ACTUALIZADOR_ANDROID: el APK sale SIN actualizador interno.");
        return;
    }
    let paquete = std::env::var("TAURI_ANDROID_PACKAGE_UNESCAPED")
        .or_else(|_| std::env::var("WRY_ANDROID_PACKAGE"))
        .unwrap_or_default();
    if !android_actualizador::aplica(&paquete) {
        return;
    }
    let Some(proyecto) = std::env::var_os("TAURI_ANDROID_PROJECT_PATH").map(std::path::PathBuf::from) else {
        println!("cargo:warning=[starseed] Sin TAURI_ANDROID_PROJECT_PATH: el APK sale SIN actualizador interno (la web ofrecerá el .apk).");
        return;
    };
    match android_actualizador::aplicar(&proyecto) {
        Ok(cambiados) => {
            for c in cambiados {
                println!("cargo:warning=[starseed] actualizador interno del APK: escrito {}", c.display());
            }
        }
        // Falla en alto: un APK que dice actualizarse solo y no puede abrir el instalador sería una ilusión.
        Err(e) => panic!("[starseed] No se pudo inyectar el actualizador interno del APK: {e}"),
    }
}

/// (BLE1108A) Bluetooth directo entre neuronas: permisos (Android 12+ «Dispositivos cercanos»; hasta 11,
/// ubicación), el proveedor `ArranqueBle` y BleStarSeed.kt. Solo StarSeed OS y con el servicio de antenas
/// (BleStarSeed.kt carga la librería con `PuenteNativo`). `STARSEED_SIN_BLUETOOTH_ANDROID=1` lo apaga.
/// Contrato: architecture/bluetooth-directo.md §6.
fn bluetooth_android() {
    println!("cargo:rerun-if-changed=src/android_ble.rs");
    println!("cargo:rerun-if-env-changed=STARSEED_SIN_BLUETOOTH_ANDROID");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("android") {
        return;
    }
    let paquete = std::env::var("TAURI_ANDROID_PACKAGE_UNESCAPED")
        .or_else(|_| std::env::var("WRY_ANDROID_PACKAGE"))
        .unwrap_or_default();
    let servicio = android_parche::aplica(&paquete, std::env::var_os("STARSEED_SIN_SERVICIO_ANDROID").is_some());
    let apagado = android_ble::apagado(std::env::var("STARSEED_SIN_BLUETOOTH_ANDROID").ok().as_deref());
    if !android_ble::aplica(&paquete, servicio, apagado) {
        if apagado {
            println!("cargo:warning=[starseed] STARSEED_SIN_BLUETOOTH_ANDROID: el APK sale SIN Bluetooth directo.");
        }
        return;
    }
    let Some(proyecto) = std::env::var_os("TAURI_ANDROID_PROJECT_PATH").map(std::path::PathBuf::from) else {
        println!("cargo:warning=[starseed] Sin TAURI_ANDROID_PROJECT_PATH: el APK sale SIN Bluetooth directo.");
        return;
    };
    match android_ble::aplicar(&proyecto) {
        Ok(cambiados) => {
            for c in cambiados {
                println!("cargo:warning=[starseed] Bluetooth directo: escrito {}", c.display());
            }
        }
        // Falla en alto: un APK que dice llevar Bluetooth directo y no lo lleva sería una ilusión.
        Err(e) => panic!("[starseed] No se pudo inyectar el Bluetooth directo en Android: {e}. Para compilar sin él: STARSEED_SIN_BLUETOOTH_ANDROID=1"),
    }
}

/// (WFD1108A) Enlace Wi-Fi directo entre neuronas: permisos de Wi-Fi («Dispositivos cercanos», y
/// «Ubicación» solo hasta Android 12), el proveedor que lo arranca y EnlaceWifiDirecto.kt en el proyecto
/// que genera `cargo tauri android init`. Solo StarSeed OS. Contrato architecture/wifi-directo.md §4.
fn enlace_wifi_android() {
    println!("cargo:rerun-if-changed=src/enlace_wifi_parche.rs");
    println!("cargo:rerun-if-env-changed=STARSEED_SIN_ENLACE_WIFI_ANDROID");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("android") {
        return;
    }
    // Interruptor de emergencia: sin él el APK sale como antes (sin enlace Wi-Fi directo; la web lo dice).
    if std::env::var_os("STARSEED_SIN_ENLACE_WIFI_ANDROID").is_some() {
        println!("cargo:warning=[starseed] STARSEED_SIN_ENLACE_WIFI_ANDROID: el APK sale SIN enlace Wi-Fi directo.");
        return;
    }
    let paquete = std::env::var("TAURI_ANDROID_PACKAGE_UNESCAPED")
        .or_else(|_| std::env::var("WRY_ANDROID_PACKAGE"))
        .unwrap_or_default();
    if !enlace_wifi_parche::aplica(&paquete) {
        return;
    }
    let Some(proyecto) = std::env::var_os("TAURI_ANDROID_PROJECT_PATH").map(std::path::PathBuf::from) else {
        println!("cargo:warning=[starseed] Sin TAURI_ANDROID_PROJECT_PATH: el APK sale SIN enlace Wi-Fi directo.");
        return;
    };
    match enlace_wifi_parche::aplicar(&proyecto) {
        Ok(cambiados) => {
            for c in cambiados {
                println!("cargo:warning=[starseed] enlace Wi-Fi directo: escrito {}", c.display());
            }
        }
        // Falla en alto: un APK que dice abrir la red directa y no tiene ni el permiso sería una ilusión.
        Err(e) => panic!("[starseed] No se pudo inyectar el enlace Wi-Fi directo en Android: {e}. Para compilar sin él: STARSEED_SIN_ENLACE_WIFI_ANDROID=1"),
    }
}

/// (LLA1108D) Las llamadas de StarSeed como llamadas del teléfono: permisos (con su porqué), cuenta de
/// Telecom autogestionada, servicio en primer plano `phoneCall`, aviso CallStyle y LlamadaNativaStarSeed.kt
/// en el proyecto que genera `cargo tauri android init`. Solo StarSeed OS. Contrato
/// architecture/llamadas-telefonia.md § «Integración nativa». `STARSEED_SIN_LLAMADAS_NATIVAS_ANDROID=1` lo apaga.
fn llamadas_nativas_android() {
    println!("cargo:rerun-if-changed=src/llamada_nativa_parche.rs");
    println!("cargo:rerun-if-changed=android/LlamadaNativaStarSeed.kt");
    println!("cargo:rerun-if-changed=android/LlamadaEntranteStarSeed.kt");
    println!("cargo:rerun-if-env-changed=STARSEED_SIN_LLAMADAS_NATIVAS_ANDROID");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("android") {
        return;
    }
    // Interruptor de emergencia: sin él el APK sale como antes (la llamada vive solo en la ventana).
    if llamada_nativa_parche::apagado(std::env::var("STARSEED_SIN_LLAMADAS_NATIVAS_ANDROID").ok().as_deref()) {
        println!("cargo:warning=[starseed] STARSEED_SIN_LLAMADAS_NATIVAS_ANDROID: el APK sale SIN llamadas nativas.");
        return;
    }
    let paquete = std::env::var("TAURI_ANDROID_PACKAGE_UNESCAPED")
        .or_else(|_| std::env::var("WRY_ANDROID_PACKAGE"))
        .unwrap_or_default();
    if !llamada_nativa_parche::aplica(&paquete) {
        return;
    }
    let Some(proyecto) = std::env::var_os("TAURI_ANDROID_PROJECT_PATH").map(std::path::PathBuf::from) else {
        println!("cargo:warning=[starseed] Sin TAURI_ANDROID_PROJECT_PATH: el APK sale SIN llamadas nativas.");
        return;
    };
    match llamada_nativa_parche::aplicar(&proyecto) {
        Ok(cambiados) => {
            for c in cambiados {
                println!("cargo:warning=[starseed] llamadas nativas: escrito {}", c.display());
            }
        }
        // Falla en alto: un APK que dice contestar llamadas como el teléfono y no declara ni el servicio sería una ilusión.
        Err(e) => panic!("[starseed] No se pudo inyectar las llamadas nativas en Android: {e}. Para compilar sin ellas: STARSEED_SIN_LLAMADAS_NATIVAS_ANDROID=1"),
    }
}

/// (PTA1108B) El proxy de la puerta de internet de la malla en Android: proveedor `ArranqueProxyPuerta`,
/// ProxyPuertaStarSeed.kt (androidx.webkit `ProxyController`) y la dependencia `androidx.webkit` en
/// `app/build.gradle.kts` si la plantilla no la trae. Solo StarSeed OS. Contrato
/// architecture/red-sin-dependencias.md §5.3 (c). `STARSEED_SIN_PROXY_PUERTA=1` lo apaga.
fn proxy_puerta_android() {
    println!("cargo:rerun-if-changed=src/puerta_proxy_parche.rs");
    println!("cargo:rerun-if-changed=android/ProxyPuertaStarSeed.kt");
    println!("cargo:rerun-if-env-changed=STARSEED_SIN_PROXY_PUERTA");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("android") {
        return;
    }
    // Interruptor de emergencia: sin él el APK sale como antes (el navegador de la app sale por la red propia).
    if puerta_proxy_parche::apagado(std::env::var("STARSEED_SIN_PROXY_PUERTA").ok().as_deref()) {
        println!("cargo:warning=[starseed] STARSEED_SIN_PROXY_PUERTA: el APK sale SIN el proxy de la puerta de internet.");
        return;
    }
    let paquete = std::env::var("TAURI_ANDROID_PACKAGE_UNESCAPED")
        .or_else(|_| std::env::var("WRY_ANDROID_PACKAGE"))
        .unwrap_or_default();
    if !puerta_proxy_parche::aplica(&paquete) {
        return;
    }
    let Some(proyecto) = std::env::var_os("TAURI_ANDROID_PROJECT_PATH").map(std::path::PathBuf::from) else {
        println!("cargo:warning=[starseed] Sin TAURI_ANDROID_PROJECT_PATH: el APK sale SIN el proxy de la puerta de internet.");
        return;
    };
    match puerta_proxy_parche::aplicar(&proyecto) {
        Ok(cambiados) => {
            for c in cambiados {
                println!("cargo:warning=[starseed] proxy de la puerta: escrito {}", c.display());
            }
        }
        // Falla en alto: un APK que dice llevar el navegador por la malla y no trae ni la dependencia sería una ilusión.
        Err(e) => panic!("[starseed] No se pudo inyectar el proxy de la puerta en Android: {e}. Para compilar sin él: STARSEED_SIN_PROXY_PUERTA=1"),
    }
}

/// (UBI1114K) Permisos de ubicación, proveedor y UbicacionStarSeed.kt en el proyecto Android. Solo StarSeed OS.
fn ubicacion_android() {
    println!("cargo:rerun-if-changed=src/ubicacion_parche.rs");
    println!("cargo:rerun-if-env-changed=STARSEED_SIN_UBICACION_ANDROID");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("android") {
        return;
    }
    let paquete = std::env::var("TAURI_ANDROID_PACKAGE_UNESCAPED")
        .or_else(|_| std::env::var("WRY_ANDROID_PACKAGE"))
        .unwrap_or_default();
    let apagado = ubicacion_parche::apagado(std::env::var("STARSEED_SIN_UBICACION_ANDROID").ok().as_deref());
    if apagado || !ubicacion_parche::aplica(&paquete) {
        if apagado {
            println!("cargo:warning=[starseed] STARSEED_SIN_UBICACION_ANDROID: el APK sale SIN ubicación nativa.");
        }
        return;
    }
    let Some(proyecto) = std::env::var_os("TAURI_ANDROID_PROJECT_PATH").map(std::path::PathBuf::from) else {
        println!("cargo:warning=[starseed] Sin TAURI_ANDROID_PROJECT_PATH: el APK sale SIN ubicación nativa.");
        return;
    };
    match ubicacion_parche::aplicar(&proyecto) {
        Ok(cambiados) => {
            for c in cambiados {
                println!("cargo:warning=[starseed] Ubicación: escrito {}", c.display());
            }
        }
        // Falla en alto: un APK que dice llevar ubicación nativa y no la lleva sería una ilusión.
        Err(e) => panic!("[starseed] No se pudo inyectar la ubicación en Android: {e}. Para compilar sin ella: STARSEED_SIN_UBICACION_ANDROID=1"),
    }
}

// ORD1114T: indicador nativo del control entre neuronas en Android (notificación en curso + superposición).
fn control_neuronas_android() {
    println!("cargo:rerun-if-changed=src/control_neuronas_parche.rs");
    println!("cargo:rerun-if-changed=android/ControlNeuronasStarSeed.kt");
    println!("cargo:rerun-if-env-changed=STARSEED_SIN_CONTROL_ANDROID");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("android") {
        return;
    }
    let paquete = std::env::var("TAURI_ANDROID_PACKAGE_UNESCAPED")
        .or_else(|_| std::env::var("WRY_ANDROID_PACKAGE"))
        .unwrap_or_default();
    let apagado = control_neuronas_parche::apagado(std::env::var("STARSEED_SIN_CONTROL_ANDROID").ok().as_deref());
    if apagado || !control_neuronas_parche::aplica(&paquete) {
        if apagado {
            println!("cargo:warning=[starseed] STARSEED_SIN_CONTROL_ANDROID: el APK sale SIN indicador de control (el control se niega).");
        }
        return;
    }
    let Some(proyecto) = std::env::var_os("TAURI_ANDROID_PROJECT_PATH").map(std::path::PathBuf::from) else {
        println!("cargo:warning=[starseed] Sin TAURI_ANDROID_PROJECT_PATH: el APK sale SIN indicador de control (el control se niega).");
        return;
    };
    match control_neuronas_parche::aplicar(&proyecto) {
        Ok(cambiados) => {
            for c in cambiados {
                println!("cargo:warning=[starseed] Control entre neuronas: escrito {}", c.display());
            }
        }
        Err(e) => panic!("[starseed] No se pudo inyectar el indicador de control en Android: {e}. Para compilar sin él: STARSEED_SIN_CONTROL_ANDROID=1"),
    }
}

// AND1115K: la entrada y la pantalla remotas de la tableta (servicio de accesibilidad apagado hasta que la persona lo active).
fn control_entrada_android() {
    println!("cargo:rerun-if-changed=src/control_entrada_parche.rs");
    println!("cargo:rerun-if-changed=android/ControlEntradaStarSeed.kt");
    println!("cargo:rerun-if-changed=android/ProyeccionPantallaStarSeed.kt"); // PENC1
    println!("cargo:rerun-if-changed=src/control_regla_g.txt"); // FSG1116 · la regla G de Kotlin sale de aquí
    println!("cargo:rerun-if-env-changed=STARSEED_SIN_CONTROL_ENTRADA");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("android") {
        return;
    }
    let paquete = std::env::var("TAURI_ANDROID_PACKAGE_UNESCAPED").or_else(|_| std::env::var("WRY_ANDROID_PACKAGE")).unwrap_or_default();
    let apagado = control_entrada_parche::apagado(std::env::var("STARSEED_SIN_CONTROL_ENTRADA").ok().as_deref());
    if apagado || !control_entrada_parche::aplica(&paquete) {
        if apagado {
            println!("cargo:warning=[starseed] STARSEED_SIN_CONTROL_ENTRADA: el APK sale SIN entrada ni pantalla remotas.");
        }
        return;
    }
    let Some(proyecto) = std::env::var_os("TAURI_ANDROID_PROJECT_PATH").map(std::path::PathBuf::from) else {
        println!("cargo:warning=[starseed] Sin TAURI_ANDROID_PROJECT_PATH: el APK sale SIN entrada ni pantalla remotas.");
        return;
    };
    match control_entrada_parche::aplicar(&proyecto) {
        Ok(cambiados) => {
            for c in cambiados {
                println!("cargo:warning=[starseed] Control entre neuronas (entrada): escrito {}", c.display());
            }
        }
        Err(e) => panic!("[starseed] No se pudo inyectar la entrada remota en Android: {e}. Para compilar sin ella: STARSEED_SIN_CONTROL_ENTRADA=1"),
    }
}
