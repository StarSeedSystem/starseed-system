// ═══════════════════════════════════════════════════════════════════════════
// registro_espejo — comando Tauri para anexar al espejo del registro por aparato (BAP1127Y).
// ---------------------------------------------------------------------------
// Escribe en la MISMA carpeta de datos donde vive `enlaces.log` (mira cómo la calcula ble.rs)
// el archivo `espejo-<aparato>.log`, anteponiendo la hora ISO de recepción a cada línea,
// y rota con `debe_rotar` (tope 2 MiB, 3 archivos: base, base.1, base.2).
// ═══════════════════════════════════════════════════════════════════════════

use crate::ble::{dir_datos, ahora_ms};
use crate::registro_espejo_logica::{
    acotar_lineas, debe_rotar, iso_utc, nombres_rotacion, preparar_lineas, ruta_espejo, sanear_nombre,
};
use std::fs;
use std::io::Write;
use std::path::Path;

/// Tope de 2 MiB para el espejo del registro.
pub const ESPEJO_MAX_BYTES: u64 = 2 * 1024 * 1024;

/// Añade líneas a un archivo de registro con rotación a 3 archivos (base, base.1, base.2).
/// Si el archivo actual pasa del tope, rota: base.2 se borra, base.1 → base.2, base → base.1.
pub fn anexar_rotando_con_nombres(ruta: &Path, lineas: &[String], max: u64) -> std::io::Result<()> {
    if lineas.is_empty() {
        return Ok(());
    }
    if let Some(dir) = ruta.parent() {
        fs::create_dir_all(dir)?;
    }

    let nombres = nombres_rotacion(ruta.to_str().unwrap_or(""));
    let base_path = Path::new(&nombres[0]);
    let rot1_path = Path::new(&nombres[1]);
    let rot2_path = Path::new(&nombres[2]);

    // Comprobar si hay que rotar
    let tam_actual = fs::metadata(base_path).map(|m| m.len()).unwrap_or(0);
    let nuevos_bytes: u64 = lineas.iter().map(|l| l.len() as u64 + 1).sum(); // +1 por \n

    if debe_rotar(tam_actual, nuevos_bytes, max) {
        // Rotar: borrar .2, mover .1 a .2, mover base a .1
        let _ = fs::remove_file(&rot2_path);
        if rot1_path.exists() {
            let _ = fs::rename(&rot1_path, &rot2_path);
        }
        if base_path.exists() {
            let _ = fs::rename(base_path, &rot1_path);
        }
    }

    let mut f = fs::OpenOptions::new().create(true).append(true).open(base_path)?;
    let mut bloque = String::new();
    for l in lineas {
        bloque.push_str(l);
        bloque.push('\n');
    }
    f.write_all(bloque.as_bytes())
}

/// Comando Tauri: anexa líneas al espejo del registro para un aparato.
/// Devuelve cuántas líneas se guardaron (tras acotar a 200 líneas × 400 chars).
#[tauri::command]
pub fn registro_espejo_anexar(aparato: String, lineas: Vec<String>) -> usize {
    let limpio = sanear_nombre(&aparato);
    if limpio.is_empty() {
        return 0;
    }
    let ahora = ahora_ms();
    let preparadas = preparar_lineas(lineas, ahora);
    if preparadas.is_empty() {
        return 0;
    }
    let Some(dir) = dir_datos() else {
        return 0;
    };
    let ruta = ruta_espejo(&dir, &limpio);
    match anexar_rotando_con_nombres(&ruta, &preparadas, ESPEJO_MAX_BYTES) {
        Ok(_) => preparadas.len(),
        Err(_) => 0,
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    #[test]
    fn anexar_rotando_con_nombres_crea_y_rota() {
        let tmp = std::env::temp_dir().join(format!("test_espejo_{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();
        let ruta = tmp.join("espejo-test.log");

        // Primera escritura
        let lineas = vec!["2023-01-01T00:00:00.000Z linea 1".to_string()];
        anexar_rotando_con_nombres(&ruta, &lineas, ESPEJO_MAX_BYTES).unwrap();
        assert!(ruta.exists());
        let contenido = fs::read_to_string(&ruta).unwrap();
        assert!(contenido.contains("linea 1"));

        // Segunda escritura sin rotar
        let lineas2 = vec!["2023-01-01T00:00:01.000Z linea 2".to_string()];
        anexar_rotando_con_nombres(&ruta, &lineas2, ESPEJO_MAX_BYTES).unwrap();
        let contenido = fs::read_to_string(&ruta).unwrap();
        assert!(contenido.contains("linea 1"));
        assert!(contenido.contains("linea 2"));

        // Forzar rotación escribiendo mucho
        let grandes: Vec<String> = (0..5000).map(|i| format!("2023-01-01T00:00:00.000Z {}", "x".repeat(400))).collect();
        anexar_rotando_con_nombres(&ruta, &grandes, ESPEJO_MAX_BYTES).unwrap();

        // Debe haber rotado: base.1 existe
        let rot1 = tmp.join("espejo-test.log.1");
        assert!(rot1.exists(), "debe existir .1 tras rotar");

        // Limpiar
        let _ = fs::remove_dir_all(&tmp);
    }
}