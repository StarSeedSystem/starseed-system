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
    servicio_android();
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
