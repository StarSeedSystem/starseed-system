// Evita abrir una consola extra en Windows en modo release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// ═══════════════════════════════════════════════════════════════════════════
// StarSeed Native — binario de escritorio.
// Toda la lógica vive en src/lib.rs (patrón oficial Tauri 2): así el MISMO
// código sirve para escritorio (este main) y para Android/iOS (que cargan el
// crate como librería vía `tauri::mobile_entry_point`).
// ═══════════════════════════════════════════════════════════════════════════

fn main() {
    #[cfg(target_os = "linux")]
    {
        // Evita congelamientos del compositor DMABUF de WebKitGTK en GPUs antiguas (Radeon/Intel/Mesa)
        // al abrir canvas o vídeo del control remoto. Respeta si la persona fijó otro valor.
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }
    starseed_native_lib::run()
}
