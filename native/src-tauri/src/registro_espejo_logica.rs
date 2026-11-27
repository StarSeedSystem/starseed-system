// registro_espejo_logica — lo PURO del archivo de espejo por aparato (BAP1127Y · 2026-11-27).
// Contrato: architecture/automejora-pruebas-malla.md §C.12. Solo std: se prueba sin Tauri.
// Lo que llega de otro aparato va a `espejo-<aparato>.log` con rotación propia de tres piezas,
// no a `enlaces.log` (rota a 1 MiB y con tres aparatos espejando se pierde la evidencia).

#![allow(dead_code)]

use std::path::{Path, PathBuf};

pub const TOPE_BYTES: u64 = 2 * 1024 * 1024;
pub const MAX_LINEAS: usize = 200;
pub const MAX_CARACTERES: usize = 400;
pub const MAX_NOMBRE: usize = 32;

/// `aparato` → nombre de archivo seguro: `[a-z0-9-]`, sin guiones en los bordes, ≤32.
pub fn sanear_nombre(aparato: &str) -> String {
    let mut salida = String::new();
    let mut guion = false;
    for c in aparato.chars().map(|c| c.to_ascii_lowercase()) {
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            salida.push(c);
            guion = false;
        } else if !salida.is_empty() && !guion {
            salida.push('-');
            guion = true;
        }
        if salida.len() >= MAX_NOMBRE {
            break;
        }
    }
    while salida.ends_with('-') {
        salida.pop();
    }
    if salida.is_empty() {
        "aparato".to_string()
    } else {
        salida
    }
}

/// Recorta a ≤200 líneas no vacías de ≤400 caracteres, sin caracteres de control.
pub fn acotar_lineas(lineas: &[String]) -> Vec<String> {
    lineas
        .iter()
        .map(|l| l.chars().map(|c| if c.is_control() { ' ' } else { c }).take(MAX_CARACTERES).collect::<String>())
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .take(MAX_LINEAS)
        .collect()
}

/// ¿Hay que rotar antes de anexar? Solo si ya hay contenido y lo nuevo pasa del tope.
pub fn debe_rotar(bytes_actuales: u64, nuevos: u64, tope: u64) -> bool {
    bytes_actuales > 0 && bytes_actuales.saturating_add(nuevos) > tope
}

/// Las tres piezas de la rotación: `base`, `base.1` y `base.2` (de más nueva a más vieja).
pub fn nombres_rotacion(base: &Path) -> [PathBuf; 3] {
    let mut uno = base.as_os_str().to_owned();
    uno.push(".1");
    let mut dos = base.as_os_str().to_owned();
    dos.push(".2");
    [base.to_path_buf(), PathBuf::from(uno), PathBuf::from(dos)]
}

#[cfg(test)]
mod pruebas {
    use super::*;
    #[test]
    fn nombre_se_queda_en_lo_seguro() {
        assert_eq!(sanear_nombre("MacBook de Maggasukha"), "macbook-de-maggasukha");
        assert_eq!(sanear_nombre("TABLETA_Á#1"), "tableta-1");
    }
    #[test]
    fn nombre_vacio_no_deja_archivo_sin_nombre() {
        assert_eq!(sanear_nombre("   "), "aparato");
        assert_eq!(sanear_nombre(""), "aparato");
    }
    #[test]
    fn nombre_largo_se_corta_a_32() {
        let largo = "a".repeat(80);
        let n = sanear_nombre(&largo);
        assert_eq!(n.len(), 32);
        assert!(n.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-'));
    }
    #[test]
    fn lineas_se_acotan_a_200() {
        let muchas: Vec<String> = (0..250).map(|i| format!("linea {i}")).collect();
        let salida = acotar_lineas(&muchas);
        assert_eq!(salida.len(), MAX_LINEAS);
        assert_eq!(salida[0], "linea 0");
        assert_eq!(salida[199], "linea 199");
    }
    #[test]
    fn linea_larga_se_corta_a_400_y_pierde_controles() {
        let salida = acotar_lineas(&[format!("a\u{0}b{}", "c".repeat(500))]);
        assert_eq!(salida.len(), 1);
        assert_eq!(salida[0].chars().count(), MAX_CARACTERES);
        assert!(!salida[0].chars().any(char::is_control));
    }
    #[test]
    fn lineas_vacias_no_ocupan_sitio() {
        let salida = acotar_lineas(&["".into(), "  ".into(), "algo".into()]);
        assert_eq!(salida, vec!["algo".to_string()]);
    }
    #[test]
    fn rota_solo_al_pasarse_del_tope() {
        assert!(!debe_rotar(0, TOPE_BYTES + 1, TOPE_BYTES));
        assert!(!debe_rotar(TOPE_BYTES - 10, 10, TOPE_BYTES));
        assert!(debe_rotar(TOPE_BYTES - 9, 10, TOPE_BYTES));
        assert!(debe_rotar(TOPE_BYTES, 1, TOPE_BYTES));
    }
    #[test]
    fn rotacion_tiene_tres_piezas() {
        let piezas = nombres_rotacion(Path::new("/tmp/espejo-tableta.log"));
        assert_eq!(piezas[0], PathBuf::from("/tmp/espejo-tableta.log"));
        assert_eq!(piezas[1], PathBuf::from("/tmp/espejo-tableta.log.1"));
        assert_eq!(piezas[2], PathBuf::from("/tmp/espejo-tableta.log.2"));
    }
}
