// Script de construcción de Tauri: embebe tauri.conf.json, los iconos y las
// capabilities en el binario, y genera los esquemas de permisos en gen/schemas.
//
// Además (2026-10-10, architecture/apps-nativas-segundo-plano.md §2.3): al compilar
// para Android, inyecta en el proyecto que genera `cargo tauri android init` el
// servicio de antenas en primer plano (manifiesto + Kotlin + reglas de R8). Solo
// StarSeed OS; `STARSEED_SIN_SERVICIO_ANDROID=1` lo desactiva.

#[path = "src/android_parche.rs"]
mod android_parche;

/// Comandos propios de la app (los de `generate_handler!` de src/lib.rs). Desde tauri 2.11.1 una
/// página de un origen REMOTO (la web publicada, y también el servidor local http://127.0.0.1:47610…)
/// solo llega a un comando propio si una capability con `remote` le da su permiso `allow-<comando>`;
/// sin manifiesto de la app esos permisos ni existen y TODA llamada de la web se rechaza («not
/// allowed by ACL»). Aquí se generan; las capabilities los conceden. Una prueba
/// (src/lib/nativa/__tests__/contrato-rust.test.ts) vigila que esta lista, lib.rs y las capabilities
/// casen. (APP1107B, 2026-11-07)
const COMANDOS_APP: &[&str] = &[
    "run_terminal",
    "check_update",
    "reiniciar_para_actualizar",
    "estado_actualizacion",
    "device_info",
    // (VER1107B) «Esta neurona» y buscar la versión nueva sin instalarla.
    "info_neurona",
    "buscar_actualizacion",
    "recursos_ia_detectar",
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
    "malla_local_enviar",
    "malla_local_estado",
    "malla_local_recibidos",
    // Solo escritorio (su permiso existe en todas, pero solo se registran en escritorio).
    "ventanas_prestables",
    "capturar_ventana",
    "entrada_ventana",
    "servidor_local_estado",
    "servidor_local_actualizar",
    "migracion_origen_exportar",
    "migracion_origen_estado",
    "migracion_origen_datos",
    "migracion_origen_confirmar",
];

fn main() {
    println!("cargo:rerun-if-changed=src/android_parche.rs");
    println!("cargo:rerun-if-changed=android");
    println!("cargo:rerun-if-env-changed=STARSEED_SIN_SERVICIO_ANDROID");
    println!("cargo:rerun-if-env-changed=TAURI_ANDROID_PROJECT_PATH");
    println!("cargo:rerun-if-env-changed=STARSEED_SERVIDOR_LOCAL_ANDROID");
    // (AND1107A) Se declara siempre (que rustc no avise de un cfg desconocido); solo se ENCIENDE abajo.
    println!("cargo:rustc-check-cfg=cfg(starseed_servidor_android)");
    servicio_android();
    servidor_local_android();
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
