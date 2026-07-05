// Evita abrir una consola extra en Windows en modo release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// ═══════════════════════════════════════════════════════════════════════════
// StarSeed Native — binario de escritorio.
// Toda la lógica vive en src/lib.rs (patrón oficial Tauri 2): así el MISMO
// código sirve para escritorio (este main) y para Android/iOS (que cargan el
// crate como librería vía `tauri::mobile_entry_point`).
// ═══════════════════════════════════════════════════════════════════════════

fn main() {
    starseed_native_lib::run()
}
