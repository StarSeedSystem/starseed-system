// ═══════════════════════════════════════════════════════════════════════════
// registro_espejo_logica — Lógica pura para el espejo de registros por aparato
// BAP1127Y (2026-11-27).
// ═══════════════════════════════════════════════════════════════════════════

use std::path::{Path, PathBuf};

pub const REGISTRO_ESPEJO_MAX_BYTES: u64 = 2 * 1024 * 1024;
pub const MAX_LINEAS_ANEXAR: usize = 200;
pub const MAX_CHAR_LINEA: usize = 400;

pub fn sanear_nombre(aparato: &str) -> String {
    let normalized = native_normalizar_ascii(aparato);
    let mut res = String::new();
    let mut ultimo_guion = true;
    for c in normalized.chars() {
        let lc = c.to_ascii_lowercase();
        if (lc >= 'a' && lc <= 'z') || (lc >= '0' && lc <= '9') {
            res.push(lc);
            ultimo_guion = false;
        } else if lc == '-' || c.is_control() || c.is_whitespace() || !lc.is_ascii() {
            if !ultimo_guion {
                res.push('-');
                ultimo_guion = true;
            }
        } else {
            if !ultimo_guion {
                res.push('-');
                ultimo_guion = true;
            }
        }
    }
    let trimmed = res.trim_matches('-');
    let final_res = if trimmed.is_empty() { "aparato" } else { trimmed };
    if final_res.len() > 32 {
        final_res[..32].trim_end_matches('-').to_string()
    } else {
        final_res.to_string()
    }
}

fn native_normalizar_ascii(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'á' | 'à' | 'ä' | 'â' | 'ã' => 'a',
            'é' | 'è' | 'ë' | 'ê' => 'e',
            'í' | 'ì' | 'ï' | 'î' => 'i',
            'ó' | 'ò' | 'ö' | 'ô' | 'õ' => 'o',
            'ú' | 'ù' | 'ü' | 'û' => 'u',
            'ñ' => 'n',
            'Á' | 'À' | 'Ä' | 'Â' | 'Ã' => 'A',
            'É' | 'È' | 'Ë' | 'Ê' => 'E',
            'Í' | 'Ì' | 'Ï' | 'Î' => 'I',
            'Ó' | 'Ò' | 'Ö' | 'Ô' | 'Õ' => 'O',
            'Ú' | 'Ù' | 'Ü' | 'Û' => 'U',
            'Ñ' => 'N',
            other => other,
        })
        .collect()
}

pub fn acotar_lineas(lineas: &[String]) -> Vec<String> {
    lineas
        .iter()
        .take(MAX_LINEAS_ANEXAR)
        .map(|l| {
            let limpiada: String = l
                .chars()
                .map(|c| if c.is_control() { ' ' } else { c })
                .take(MAX_CHAR_LINEA)
                .collect();
            limpiada.trim().to_string()
        })
        .filter(|l| !l.is_empty())
        .collect()
}

pub fn debe_rotar(bytes_actuales: u64, nuevos: u64, tope: u64) -> bool {
    bytes_actuales.saturating_add(nuevos) >= tope
}

pub fn nombres_rotacion(base: &Path) -> (PathBuf, PathBuf, PathBuf) {
    let b1 = {
        let mut p = base.as_os_str().to_owned();
        p.push(".1");
        PathBuf::from(p)
    };
    let b2 = {
        let mut p = base.as_os_str().to_owned();
        p.push(".2");
        PathBuf::from(p)
    };
    (base.to_path_buf(), b1, b2)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanear_nombre() {
        assert_eq!(sanear_nombre("Aparato_01!"), "aparato-01");
        assert_eq!(sanear_nombre("---"), "aparato");
        assert_eq!(sanear_nombre(""), "aparato");
        let largo = "a".repeat(50);
        assert_eq!(sanear_nombre(&largo).len(), 32);
    }

    #[test]
    fn test_acotar_lineas() {
        let entrada = vec![
            "hola\ncon\rcontrol".to_string(),
            "".to_string(),
        ];
        let res = acotar_lineas(&entrada);
        assert_eq!(res.len(), 1);
        assert_eq!(res[0], "hola con control");
    }

    #[test]
    fn test_debe_rotar() {
        assert!(!debe_rotar(100, 50, 200));
        assert!(debe_rotar(150, 50, 200));
        assert!(debe_rotar(200, 1, 200));
    }

    #[test]
    fn test_nombres_rotacion() {
        let base = Path::new("espejo-tablet.log");
        let (b, r1, r2) = nombres_rotacion(base);
        assert_eq!(b, Path::new("espejo-tablet.log"));
        assert_eq!(r1, Path::new("espejo-tablet.log.1"));
        assert_eq!(r2, Path::new("espejo-tablet.log.2"));
    }

    #[test]
    fn test_acotar_max_lineas() {
        let mut vec = Vec::new();
        for i in 0..300 {
            let s = format!("linea {}", i);
            vec.push(s);
        }
        let res = acotar_lineas(&vec);
        assert_eq!(res.len(), 200);
    }

    #[test]
    fn test_sanear_caracteres_raros() {
        assert_eq!(sanear_nombre("Teléfono #2 (@home)"), "telefono-2-home");
    }
}
