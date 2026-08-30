// StarSeed OS — shell de escritorio (Tauri v2).
// Carga la interfaz viva (el contenido — red, publicaciones, Astraura —
// se actualiza al instante sin reinstalar) y auto-actualiza el shell
// nativo desde GitHub Releases cuando hay versión nueva, conservando
// todos los datos del usuario (viven en su perfil, Supabase y la mesh).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri_plugin_updater::UpdaterExt;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();
            // Chequeo de actualización del shell al arrancar. Honesto y
            // silencioso: sin red o sin release nueva, no hace nada.
            tauri::async_runtime::spawn(async move {
                if let Ok(updater) = handle.updater() {
                    if let Ok(Some(update)) = updater.check().await {
                        let _ = update.download_and_install(|_, _| {}, || {}).await;
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error al iniciar StarSeed OS");
}
