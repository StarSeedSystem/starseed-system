// ═══════════════════════════════════════════════════════════════════════════
// registro_espejo — Comando Tauri para registrar eventos espejo por aparato con rotación
// BAP1127Y (2026-11-27).
// ═══════════════════════════════════════════════════════════════════════════

use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;

pub use crate::registro_espejo_logica::*;

fn directorio_espejo() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        if let Some(h) = std::env::var_os("HOME") {
            return Some(PathBuf::from(h).join("Library/Logs/app.starseed.os"));
        }
    }
    crate::ble::dir_datos()
}

fn ruta_espejo_log(aparato: &str) -> Option<PathBuf> {
    let sano = sanear_nombre(aparato);
    let nombre_archivo = format!("espejo-{sano}.log");
    directorio_espejo().map(|d| d.join(nombre_archivo))
}

fn anexar_espejo_rotando(ruta: &std::path::Path, lineas: &[String]) -> std::io::Result<()> {
    if lineas.is_empty() {
        return Ok(());
    }
    if let Some(dir) = ruta.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let bytes_actuales = std::fs::metadata(ruta).map(|m| m.len()).unwrap_or(0);
    let mut bloque = String::new();
    for l in lineas {
        bloque.push_str(l);
        bloque.push('\n');
    }
    let nuevos_bytes = bloque.as_bytes().len() as u64;

    if debe_rotar(bytes_actuales, nuevos_bytes, REGISTRO_ESPEJO_MAX_BYTES) {
        let (base, r1, r2) = nombres_rotacion(ruta);
        if r1.exists() {
            let _ = std::fs::rename(&r1, &r2);
        }
        if base.exists() {
            let _ = std::fs::rename(&base, &r1);
        }
    }

    let mut f = OpenOptions::new().create(true).append(true).open(ruta)?;
    f.write_all(bloque.as_bytes())
}

#[tauri::command]
pub fn registro_espejo_anexar(aparato: String, lineas: Vec<String>) -> usize {
    let acotadas = acotar_lineas(&lineas);
    if acotadas.is_empty() {
        return 0;
    }
    let ahora = crate::ble::ahora_ms();
    let iso = crate::ble::iso_utc(ahora);
    let limpias: Vec<String> = acotadas
        .into_iter()
        .map(|l| format!("{} {} {}", iso, sanear_nombre(&aparato), l))
        .collect();

    match ruta_espejo_log(&aparato) {
        Some(ruta) if anexar_espejo_rotando(&ruta, &limpias).is_ok() => limpias.len(),
        _ => 0,
    }
}
