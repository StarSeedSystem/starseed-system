// Script de construcción de Tauri: embebe tauri.conf.json, los iconos y las
// capabilities en el binario, y genera los esquemas de permisos en gen/schemas.
//
// Además (2026-10-10, architecture/apps-nativas-segundo-plano.md §2.3): al compilar
// para Android, inyecta en el proyecto que genera `cargo tauri android init` el
// servicio de antenas en primer plano (manifiesto + Kotlin + reglas de R8). Solo
// StarSeed OS; `STARSEED_SIN_SERVICIO_ANDROID=1` lo desactiva.

#[path = "src/android_parche.rs"]
mod android_parche;

fn main() {
    println!("cargo:rerun-if-changed=src/android_parche.rs");
    println!("cargo:rerun-if-changed=android");
    println!("cargo:rerun-if-env-changed=STARSEED_SIN_SERVICIO_ANDROID");
    println!("cargo:rerun-if-env-changed=TAURI_ANDROID_PROJECT_PATH");
    servicio_android();
    tauri_build::build()
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
