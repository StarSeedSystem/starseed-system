// ═══════════════════════════════════════════════════════════════════════════
// registro_espejo_logica — Lógica pura para el registro espejo por aparato (BAP1127Y).
// ---------------------------------------------------------------------------
// Solo std + serde. Sin Tauri. Se compila y prueba con:
//   rustc --edition 2021 --test registro_espejo_logica.rs -o /tmp/registro_espejo_logica && /tmp/registro_espejo_logica
// ═══════════════════════════════════════════════════════════════════════════

use std::path::PathBuf;

/// Limpia un nombre de aparato: solo [a-z0-9-], máx 32 chars.
/// Mayúsculas → minúsculas; lo demás → '-'; colapsa '-' repetidos; recorta.
pub fn sanear_nombre(aparato: &str) -> String {
    let mut s = String::with_capacity(32);
    let mut prev_guion = false;
    for c in aparato.to_lowercase().chars() {
        if s.len() >= 32 {
            break;
        }
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            s.push(c);
            prev_guion = false;
        } else if c == '-' && !prev_guion && !s.is_empty() {
            s.push('-');
            prev_guion = true;
        } else if !prev_guion && !s.is_empty() {
            s.push('-');
            prev_guion = true;
        }
    }
    // Recortar guiones al final
    while s.ends_with('-') {
        s.pop();
    }
    if s.is_empty() {
        "aparato".into()
    } else {
        s
    }
}

/// Acota líneas: máx 200 líneas, cada una máx 400 chars.
/// Antepone ISO UTC de recepción (ahora_ms) a cada línea.
pub fn acotar_lineas(lineas: &[String], ahora_ms: u64) -> Vec<String> {
    const MAX_LINEAS: usize = 200;
    const MAX_CHARS: usize = 400;
    let iso = iso_utc(ahora_ms);
    lineas
        .iter()
        .take(MAX_LINEAS)
        .map(|l| {
            let limpia: String = l.chars().take(MAX_CHARS).collect();
            format!("{iso} {limpia}")
        })
        .collect()
}

/// Devuelve true si al añadir `nuevos_bytes` a `bytes_actuales` se pasa de `tope` (por defecto 2 MiB).
pub fn debe_rotar(bytes_actuales: u64, nuevos_bytes: u64, tope: u64) -> bool {
    bytes_actuales.saturating_add(nuevos_bytes) > tope
}

/// Nombres de rotación: base, base.1, base.2 (3 archivos totales).
/// El más viejo se pierde al rotar por cuarta vez.
pub fn nombres_rotacion(base: &PathBuf) -> [PathBuf; 3] {
    let mut r = [PathBuf::new(), PathBuf::new(), PathBuf::new()];
    r[0] = base.clone();
    r[1] = base.with_extension(format!("{}.1", base.extension().and_then(|e| e.to_str()).unwrap_or("log")));
    r[2] = base.with_extension(format!("{}.2", base.extension().and_then(|e| e.to_str()).unwrap_or("log")));
    r
}

/// «2026-11-08T12:30:05.123Z» de epoch ms (UTC; sin dependencias).
/// Copiado de ble.rs:iso_utc para pureza.
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

/// Anexa líneas a archivo con rotación a 3 respaldos (base, base.1, base.2).
/// Si bytes_actuales + nuevos > tope, rota: base.2 se borra, base.1→base.2, base→base.1, nuevo base.
pub fn anexar_rotando_3(ruta: &PathBuf, lineas: &[String], tope: u64) -> std::io::Result<()> {
    if lineas.is_empty() {
        return Ok(());
    }
    if let Some(dir) = ruta.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let bytes_actuales = std::fs::metadata(ruta).map(|m| m.len()).unwrap_or(0);
    let nuevos_bytes = lineas.iter().map(|l| l.len() + 1).sum::<usize>() as u64; // +1 por \n
    if debe_rotar(bytes_actuales, nuevos_bytes, tope) {
        let b1 = ruta.with_extension(format!("{}.1", ruta.extension().and_then(|e| e.to_str()).unwrap_or("log")));
        let b2 = ruta.with_extension(format!("{}.2", ruta.extension().and_then(|e| e.to_str()).unwrap_or("log")));
        let _ = std::fs::remove_file(&b2); // base.2 se pierde
        let _ = std::fs::rename(&b1, &b2);  // base.1 → base.2
        let _ = std::fs::rename(ruta, &b1); // base → base.1
    }
    let mut f = std::fs::OpenOptions::new().create(true).append(true).open(ruta)?;
    let mut bloque = String::new();
    for l in lineas {
        bloque.push_str(l);
        bloque.push('\n');
    }
    use std::io::Write;
    f.write_all(bloque.as_bytes())
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use std::fs;
    use std::env;

    #[test]
    fn sanear_nombre_basico() {
        assert_eq!(sanear_nombre("Mi Tableta"), "mi-tableta");
        assert_eq!(sanear_nombre("Tablet-Alex"), "tablet-alex");
        assert_eq!(sanear_nombre("TABLETA"), "tableta");
    }

    #[test]
    fn sanear_nombre_caracteres_raros() {
        assert_eq!(sanear_nombre("Mi@Tableta#1"), "mi-tableta-1");
        assert_eq!(sanear_nombre("  espacios  "), "espacios");
        assert_eq!(sanear_nombre("---guiones---"), "guiones");
    }

    #[test]
    fn sanear_nombre_limite_32() {
        let largo = "a".repeat(40);
        assert_eq!(sanear_nombre(&largo).len(), 32);
        assert_eq!(sanear_nombre(&largo), "a".repeat(32));
    }

    #[test]
    fn sanear_nombre_vacio() {
        assert_eq!(sanear_nombre(""), "aparato");
        assert_eq!(sanear_nombre("!!!"), "aparato");
    }

    #[test]
    fn acotar_lineas_limite() {
        let lineas = vec!["x".repeat(500); 250];
        let res = acotar_lineas(&lineas, 1_700_000_000_000);
        assert_eq!(res.len(), 200);
        // ISO "2023-11-14T22:13:20.000Z " = 25 chars + 400 = 425
        assert!(res[0].len() <= 425);
        assert!(res[0].starts_with("2023-11-14T22:13:20.000Z "));
    }

    #[test]
    fn acotar_lineas_vacio() {
        assert_eq!(acotar_lineas(&[], 0), Vec::<String>::new());
    }

    #[test]
    fn debe_rotar_sin_pasar() {
        assert!(!debe_rotar(100, 50, 200));
        assert!(!debe_rotar(0, 0, 2_000_000));
    }

    #[test]
    fn debe_rotar_pasa() {
        assert!(debe_rotar(1_900_000, 200_000, 2_000_000));
        assert!(debe_rotar(2_000_000, 1, 2_000_000));
    }

    #[test]
    fn nombres_rotacion_tres() {
        let base = PathBuf::from("/tmp/espejo-tableta.log");
        let [b0, b1, b2] = nombres_rotacion(&base);
        assert_eq!(b0, PathBuf::from("/tmp/espejo-tableta.log"));
        assert_eq!(b1, PathBuf::from("/tmp/espejo-tableta.log.1"));
        assert_eq!(b2, PathBuf::from("/tmp/espejo-tableta.log.2"));
    }

    #[test]
    fn iso_utc_conocidos() {
        assert_eq!(iso_utc(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(iso_utc(1_700_000_000_123), "2023-11-14T22:13:20.123Z");
        assert_eq!(iso_utc(951_782_400_000), "2000-02-29T00:00:00.000Z");
    }

    #[test]
    fn anexar_rotando_3_crea_y_rota() {
        let dir = env::temp_dir().join(format!("espejo_test_{}", std::process::id()));
        let ruta = dir.join("espejo-test.log");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        // Primera escritura
        anexar_rotando_3(&ruta, &["linea1".into(), "linea2".into()], 100).unwrap();
        assert!(ruta.exists());
        let contenido = fs::read_to_string(&ruta).unwrap();
        assert!(contenido.contains("linea1"));
        assert!(contenido.contains("linea2"));

        // Forzar rotación escribiendo mucho: cada vuelta ~81 bytes, tope 200
        // Primera rotación tras ~2-3 escrituras, segunda rotación tras otras ~2-3
        let linea_larga = "x".repeat(80);
        for _ in 0..15 {
            anexar_rotando_3(&ruta, &[linea_larga.clone()], 200).unwrap();
        }
        // Debe haber rotado dos veces: base, base.1, base.2
        assert!(ruta.exists());
        assert!(dir.join("espejo-test.log.1").exists(), "falta .1");
        assert!(dir.join("espejo-test.log.2").exists(), "falta .2");

        let _ = fs::remove_dir_all(&dir);
    }
}