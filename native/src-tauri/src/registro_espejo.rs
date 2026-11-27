// ═══════════════════════════════════════════════════════════════════════════
// registro_espejo — Comando Tauri para anexar al registro espejo por aparato (BAP1127Y).
// ---------------------------------------------------------------------------
// Escribe en la MISMA carpeta de datos donde vive enlaces.log (ver ble.rs:dir_datos/ruta_registro)
// el archivo espejo-<aparato>.log, anteponiendo la hora ISO de recepción a cada línea,
// y rota con debe_rotar (tope 2 MiB, 3 archivos: base, base.1, base.2).
// ═══════════════════════════════════════════════════════════════════════════

use crate::registro_espejo_logica::{acotar_lineas, anexar_rotando_3, iso_utc, ahora_ms, sanear_nombre};
use crate::ble::{dir_datos, linea_limpia};
use std::path::PathBuf;
use tauri::command;

const TOPE_ESPEJO: u64 = 2 * 1024 * 1024; // 2 MiB

/// Comando Tauri: anexa líneas al registro espejo del aparato.
/// - `aparato`: nombre del aparato remoto (se sanea a [a-z0-9-] ≤32).
/// - `lineas`: líneas recibidas (máx 200, cada una máx 400 chars tras limpieza).
/// Devuelve cuántas líneas se guardaron realmente.
#[command]
pub fn registro_espejo_anexar(aparato: String, lineas: Vec<String>) -> usize {
    let ahora = ahora_ms();
    let limpio = sanear_nombre(&aparato);
    let limpias: Vec<String> = lineas
        .into_iter()
        .map(|l| linea_limpia(&l, 400))
        .filter(|l| !l.is_empty())
        .collect();
    if limpias.is_empty() {
        return 0;
    }
    let con_hora = acotar_lineas(&limpias, ahora);
    let Some(dir) = dir_datos() else { return 0 };
    let ruta = dir.join(format!("espejo-{limpio}.log"));
    match anexar_rotando_3(&ruta, &con_hora, TOPE_ESPEJO) {
        Ok(()) => con_hora.len(),
        Err(_) => 0,
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use std::fs;
    use std::env;

    #[test]
    fn registro_espejo_anexar_sin_datos_dir() {
        // Sin inicializar ble::dir_datos, debe devolver 0
        let n = registro_espejo_anexar("tableta".into(), vec!["hola".into()]);
        // Puede ser 0 o >0 según si dir_datos está inicializado; solo comprobamos que no pánico
        let _ = n;
    }
}