// ═══════════════════════════════════════════════════════════════════════════
// registro_espejo_logica — lógica pura para el espejo del registro por aparato (BAP1127Y).
// ---------------------------------------------------------------------------
// Solo std: se prueba sin Tauri con
//     rustc --edition 2021 --test native/src-tauri/src/registro_espejo_logica.rs -o /tmp/re && /tmp/re
// El pegamento con Tauri (comando, ruta de datos, escritura) vive en `registro_espejo.rs`.
// ═══════════════════════════════════════════════════════════════════════════

use std::path::{Path, PathBuf};

/// Limpia el nombre del aparato a [a-z0-9-] ≤ 32 caracteres.
/// Caracteres inválidos se convierten en '-'; múltiples '-' seguidos se colapsan.
pub fn sanear_nombre(aparato: &str) -> String {
    let mut resultado = String::new();
    let mut prev_guion = false;
    for c in aparato.to_lowercase().chars() {
        let c = if c.is_ascii_lowercase() || c.is_ascii_digit() {
            c
        } else {
            '-'
        };
        if c == '-' {
            if !prev_guion && !resultado.is_empty() {
                resultado.push(c);
                prev_guion = true;
            }
        } else {
            resultado.push(c);
            prev_guion = false;
        }
        if resultado.len() >= 32 {
            break;
        }
    }
    resultado.trim_matches('-').to_string()
}

/// Acota las líneas a ≤ 200 líneas de ≤ 400 caracteres cada una.
pub fn acotar_lineas(lineas: Vec<String>) -> Vec<String> {
    lineas
        .into_iter()
        .take(200)
        .map(|l| l.chars().take(400).collect())
        .collect()
}

/// Devuelve true si al añadir `nuevos` bytes a `bytes_actuales` se pasa del `tope` (por defecto 2 MiB).
pub fn debe_rotar(bytes_actuales: u64, nuevos: u64, tope: u64) -> bool {
    bytes_actuales.saturating_add(nuevos) >= tope
}

/// Genera los 3 nombres de rotación: base, base.1, base.2
pub fn nombres_rotacion(base: &str) -> [String; 3] {
    [
        base.to_string(),
        format!("{base}.1"),
        format!("{base}.2"),
    ]
}

/// Calcula la ruta del archivo espejo para un aparato en la carpeta de datos.
pub fn ruta_espejo(dir_datos: &Path, aparato: &str) -> PathBuf {
    let limpio = sanear_nombre(aparato);
    dir_datos.join(format!("espejo-{limpio}.log"))
}

/// Prepara las líneas para escritura: antepone timestamp ISO UTC de recepción.
pub fn preparar_lineas(lineas: Vec<String>, ahora_ms: u64) -> Vec<String> {
    let prefijo = iso_utc(ahora_ms);
    acotar_lineas(lineas)
        .into_iter()
        .map(|l| format!("{prefijo} {l}"))
        .collect()
}

/// «2026-11-08T12:30:05.123Z» de un epoch en ms (UTC; sin dependencias).
pub fn iso_utc(ms: u64) -> String {
    let s = ms / 1000;
    let milis = ms % 1000;
    let dias = (s / 86_400) as i64;
    let resto = s % 86_400;
    let z = dias + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.{milis:03}Z", resto / 3_600, (resto % 3_600) / 60, resto % 60)
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn sanear_nombre_minusculas_y_digitos_y_guion() {
        assert_eq!(sanear_nombre("Mi-Aparato_123"), "mi-aparato-123");
        assert_eq!(sanear_nombre("APPARATO"), "apparato");
        // 32 caracteres exactos
        assert_eq!(sanear_nombre("aparato-con-muchos-caracteres-extra-largos"), "aparato-con-muchos-caracteres-ex");
    }

    #[test]
    fn sanear_nombre_elimina_caracteres_invalidos() {
        assert_eq!(sanear_nombre("Mi Aparato!@#"), "mi-aparato");
        assert_eq!(sanear_nombre("Árbol"), "rbol");
        assert_eq!(sanear_nombre("aparato.con.puntos"), "aparato-con-puntos");
    }

    #[test]
    fn acotar_lineas_limita_a_200_y_400() {
        let largas: Vec<String> = (0..250).map(|i| format!("linea {i}")).collect();
        let r = acotar_lineas(largas);
        assert_eq!(r.len(), 200);

        let muy_larga = "x".repeat(500);
        let r = acotar_lineas(vec![muy_larga]);
        assert_eq!(r[0].len(), 400);
    }

    #[test]
    fn debe_rotar_detecta_desbordamiento() {
        assert!(!debe_rotar(0, 100, 1024));
        assert!(!debe_rotar(500, 500, 1024));
        assert!(debe_rotar(500, 524, 1024));
        assert!(debe_rotar(1024, 0, 1024));
        assert!(debe_rotar(1025, 0, 1024));
    }

    #[test]
    fn nombres_rotacion_tres_archivos() {
        let n = nombres_rotacion("espejo-test.log");
        assert_eq!(n[0], "espejo-test.log");
        assert_eq!(n[1], "espejo-test.log.1");
        assert_eq!(n[2], "espejo-test.log.2");
    }

    #[test]
    fn ruta_espejo_usa_nombre_saneado() {
        let dir = PathBuf::from("/datos/app");
        assert_eq!(ruta_espejo(&dir, "Mi-Aparato"), dir.join("espejo-mi-aparato.log"));
        assert_eq!(ruta_espejo(&dir, "APPARATO@123"), dir.join("espejo-apparato-123.log"));
    }

    #[test]
    fn preparar_lineas_antepone_timestamp_y_acota() {
        let lineas = vec!["linea 1".to_string(), "linea 2".to_string()];
        let r = preparar_lineas(lineas, 1_700_000_000_000); // 2023-11-14T22:13:20.000Z
        assert_eq!(r.len(), 2);
        assert!(r[0].starts_with("2023-11-14T22:13:20.000Z "));
        assert!(r[1].starts_with("2023-11-14T22:13:20.000Z "));
    }

    #[test]
    fn iso_utc_formato_correcto() {
        // 0 ms = 1970-01-01T00:00:00.000Z
        assert_eq!(iso_utc(0), "1970-01-01T00:00:00.000Z");
        // 1000 ms = 1970-01-01T00:00:01.000Z
        assert_eq!(iso_utc(1000), "1970-01-01T00:00:01.000Z");
        // 86_400_000 ms = 1970-01-02T00:00:00.000Z
        assert_eq!(iso_utc(86_400_000), "1970-01-02T00:00:00.000Z");
    }
}