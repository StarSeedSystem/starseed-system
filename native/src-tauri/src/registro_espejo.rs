//! (BAP1127Y) Archivo de espejo por aparato: cada aparato que espeja su registro al director
//! escribe en `espejo-<aparato>.log`, en la MISMA carpeta de datos que `enlaces.log`, con su
//! propia rotación de tres piezas (2 MiB cada una). Lo puro vive en `registro_espejo_logica.rs`.
//! Contrato: architecture/automejora-pruebas-malla.md §C.12.

use crate::registro_espejo_logica as l;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

fn ahora_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// La carpeta donde vive `enlaces.log` (igual que `ble.rs`: macOS en Logs; el resto, datos de la app).
fn carpeta(app: &AppHandle) -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        let _ = app;
        std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Library/Logs/app.starseed.os"))
    }
    #[cfg(not(target_os = "macos"))]
    {
        use tauri::Manager;
        app.path().app_data_dir().ok()
    }
}

fn rotar(ruta: &Path) {
    let piezas = l::nombres_rotacion(ruta);
    let _ = std::fs::remove_file(&piezas[2]);
    let _ = std::fs::rename(&piezas[1], &piezas[2]);
    let _ = std::fs::rename(&piezas[0], &piezas[1]);
}

fn anexar_rotando(ruta: &Path, lineas: &[String], tope: u64) -> std::io::Result<usize> {
    if let Some(dir) = ruta.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let mut bloque = String::new();
    for linea in lineas {
        bloque.push_str(linea);
        bloque.push('\n');
    }
    let actual = std::fs::metadata(ruta).map(|m| m.len()).unwrap_or(0);
    if l::debe_rotar(actual, bloque.len() as u64, tope) {
        rotar(ruta);
    }
    let mut f = std::fs::OpenOptions::new().create(true).append(true).open(ruta)?;
    f.write_all(bloque.as_bytes())?;
    Ok(lineas.len())
}

/// Anexa las líneas que llegan de otro aparato con la hora ISO de recepción delante. Devuelve cuántas guardó.
#[tauri::command]
pub fn registro_espejo_anexar(app: AppHandle, aparato: String, lineas: Vec<String>) -> usize {
    let limpias = l::acotar_lineas(&lineas);
    if limpias.is_empty() {
        return 0;
    }
    let Some(dir) = carpeta(&app) else {
        return 0;
    };
    let ruta = dir.join(format!("espejo-{}.log", l::sanear_nombre(&aparato)));
    let hora = crate::ble::iso_utc(ahora_ms());
    let preparadas: Vec<String> = limpias.into_iter().map(|linea| format!("{hora} {linea}")).collect();
    anexar_rotando(&ruta, &preparadas, l::TOPE_BYTES).unwrap_or(0)
}
