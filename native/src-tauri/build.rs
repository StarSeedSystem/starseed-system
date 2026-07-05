// Script de construcción de Tauri: embebe tauri.conf.json, los iconos y las
// capabilities en el binario, y genera los esquemas de permisos en gen/schemas.
// Es el estándar de Tauri 2; no hace falta más para este scaffold.
fn main() {
    tauri_build::build()
}
