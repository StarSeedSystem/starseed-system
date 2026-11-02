use std::path::Path;
use std::fs;

use serde::Deserialize;

use memvid_core::{Memvid, PutOptions, SearchRequest, TimelineQuery, Stats, MemvidError};

const DEFAULT_MEMVID_DIR: &str = ".starseed/memvid";
const CLAVES_PATH: &str = ".starseed/memvid.claves";
const ABIERTAS_DIR: &str = "abiertas";

#[derive(Deserialize, Debug)]
struct ClavesMap {
    #[serde(rename = "nombre")]
    entries: std::collections::HashMap<String, String>,
}

fn get_memvid_dir() -> std::path::PathBuf {
    dirs::home_dir()
        .map(|p| p.join(DEFAULT_MEMVID_DIR))
        .unwrap_or_else(|| std::path::PathBuf::from(DEFAULT_MEMVID_DIR))
}

fn get_claves_path() -> std::path::PathBuf {
    dirs::home_dir()
        .map(|p| p.join(CLAVES_PATH))
        .unwrap_or_else(|| std::path::PathBuf::from(CLAVES_PATH))
}

fn load_claves() -> std::collections::HashMap<String, String> {
    let claves_path = get_claves_path();
    if claves_path.exists() {
        let content = fs::read_to_string(&claves_path).expect("read claves");
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        std::collections::HashMap::new()
    }
}

fn save_claves(claves: &std::collections::HashMap<String, String>) {
    let claves_path = get_claves_path();
    let json = serde_json::to_string(claves).expect("serialize claves");
    fs::write(&claves_path, json).expect("write claves");
    let _ = Command::new("chmod").args(["0600", claves_path.to_str().unwrap()]).output();
}

fn validate_name(nombre: &str) -> bool {
    // Pattern: ^[a-z0-9-]+\.mv2e?$
    let mut chars = nombre.chars();
    let mut found_dot_mv2 = false;
    let mut after_dot = false;
    let mut valid_core = false;

    // Parse: must end with .mv2 or .mv2e
    let ends_with_mv2e = nombre.ends_with(".mv2e");
    let ends_with_mv2 = nombre.ends_with(".mv2") && !ends_with_mv2e;

    if !ends_with_mv2 && !ends_with_mv2e {
        return false;
    }

    // Check core part before .mv2/.mv2e
    let core_part = if ends_with_mv2e {
        nombre.strip_suffix(".mv2e").unwrap_or(nombre)
    } else {
        nombre.strip_suffix(".mv2").unwrap_or(nombre)
    };

    if core_part.is_empty() {
        return false;
    }

    // All core chars must be [a-z0-9-]
    valid_core = core_part.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');

    // No / or .. 
    if nombre.contains('/') || nombre.contains("..") {
        return false;
    }

    valid_core && (ends_with_mv2e || ends_with_mv2)
}

pub struct MemvidServidor {
    memvid_dir: std::path::PathBuf,
    claves: std::collections::HashMap<String, String>,
}

impl MemvidServidor {
    pub fn nuevo() -> Self {
        let memvid_dir = get_memvid_dir();
        let _ = fs::create_dir_all(&memvid_dir);
        let claves = load_claves();
        Self { memvid_dir, claves }
    }

    pub fn poner(&mut self, nombre: &str, texto: &str, titulo: Option<&str>, uri: Option<&str>, etiquetas: Option<&str>, ts: Option<i64>) -> Result<u64, String> {
        if !validate_name(nombre) {
            return Err("Nombre de cápsula inválido".to_string());
        }

        let ruta_capsula = self.memvid_dir.join(nombre);
        let ruta_abierta = self.memvid_dir.join(ABIERTAS_DIR).join(
            nombre.strip_suffix(".mv2e").or_else(|| nombre.strip_suffix(".mv2")).unwrap_or(nombre)
        );

        let mut mem = if ruta_capsula.exists() {
            Memvid::open(&ruta_capsula).map_err(|e| format!("Error opening: {e}"))?
        } else {
            Memvid::create(&ruta_capsula).map_err(|e| format!("Error creating: {e}"))?
        };

        let opts = PutOptions::builder()
            .title(titulo.unwrap_or(""))
            .uri(uri.unwrap_or(""))
            .tag("alcance", "personal")
            .timestamp(ts.unwrap_or(0))
            .build();

        let frame_id = mem.put_bytes_with_options(texto.as_bytes(), &opts)
            .map_err(|e| format!("Error putting: {e}"))?;

        mem.commit().map_err(|e| format!("Error committing: {e}"))?;

        // Descifrar .mv2e a abiertas/ si existe
        let mv2e_path = ruta_capsula.with_extension("mv2e");
        if mv2e_path.exists() && self.claves.contains_key(nombre.strip_suffix(".mv2e").or_else(|| nombre.strip_suffix(".mv2")).unwrap_or(nombre)) {
            let clave = self.claves.get(nombre.strip_suffix(".mv2e").or_else(|| nombre.strip_suffix(".mv2")).unwrap_or(nombre)).unwrap();
            // Desbloquear para lectura
            let _ = memvid_core::encryption::unlock_file(&mv2e_path, Some(&ruta_abierta), Some(clave));
        }

        Ok(frame_id)
    }

    pub fn buscar(&self, nombre: &str, query: &str, top_k: usize) -> Result<Vec<String>, String> {
        if !validate_name(nombre) {
            return Err("Nombre de cápsula inválido".to_string());
        }

        let ruta_capsula = self.memvid_dir.join(nombre);
        if !ruta_capsula.exists() {
            return Ok(vec![]);
        }

        let mem = Memvid::open(&ruta_capsula).map_err(|e| format!("Error opening: {e}"))?;

        let r = mem.search(SearchRequest {
            query: query.into(),
            top_k,
            snippet_chars: 300,
            ..Default::default()
        })
            .map_err(|e| format!("Error searching: {e}"))?;

        Ok(r.hits.iter()
            .map(|h| format!("{} - {} - {}", h.title.unwrap_or_default(), h.text, h.uri.unwrap_or_default()))
            .collect())
    }

    pub fn estado(&self, nombre: &str) -> Result<String, String> {
        if !validate_name(nombre) {
            return Err("Nombre de cápsula inválido".to_string());
        }

        let ruta_capsula = self.memvid_dir.join(nombre);
        if !ruta_capsula.exists() {
            return Ok(r#"{"frames":0,"size_bytes":0,"capacity_bytes":52428800,"used_percent":0}"#.to_string());
        }

        let mem = Memvid::open(&ruta_capsula).map_err(|e| format!("Error opening: {e}"))?;
        let stats: Stats = mem.stats()
            .map_err(|e| format!("Error stats: {e}"))?;

        let current = stats.size_bytes;
        let limit = stats.capacity_bytes;
        let used_percent = if limit > 0 { current * 100 / limit } else { 0 };

        Ok(format!(
            r#"{{"frames":{},"size_bytes":{},"capacity_bytes":{},"used_percent":{}}}"#,
            stats.frame_count, current, limit, used_percent
        ))
    }

    pub fn linea_tiempo(&self, nombre: &str, desde: Option<i64>, hasta: Option<i64>) -> Result<Vec<String>, String> {
        if !validate_name(nombre) {
            return Err("Nombre de cápsula inválido".to_string());
        }

        let ruta_capsula = self.memvid_dir.join(nombre);
        if !ruta_capsula.exists() {
            return Ok(vec![]);
        }

        let mem = Memvid::open(&ruta_capsula).map_err(|e| format!("Error opening: {e}"))?;

        let query = TimelineQuery::builder()
            .since(desde)
            .until(hasta)
            .build();

        let linea = mem.timeline(&query)
            .map_err(|e| format!("Error timeline: {e}"))?;

        Ok(linea.iter()
            .map(|e| format!("frame {} - ts {} - {}", e.frame_id, e.timestamp, e.preview))
            .collect())
    }

    pub fn commit(&mut self, nombre: &str) -> Result<(), String> {
        if !validate_name(nombre) {
            return Err("Nombre de cápsula inválido".to_string());
        }

        let ruta_capsula = self.memvid_dir.join(nombre);
        if !ruta_capsula.exists() {
            return Err("Capsula not found".to_string());
        }

        // Volver a cifrar después de commit
        let mv2e_path = ruta_capsula.with_extension("mv2e");
        let nombre_base = nombre.strip_suffix(".mv2e").or_else(|| nombre.strip_suffix(".mv2")).unwrap_or(nombre);

        if self.claves.contains_key(nombre_base) {
            let clave = self.claves.get(nombre_base).unwrap();
            let _ = memvid_core::encryption::lock_file(&ruta_capsula, Some(&mv2e_path), Some(clave));
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_valid_name() {
        assert!(validate_name("personalidad-aurora-2026T4.mv2"));
        assert!(validate_name("test.mv2e"));
        assert!(!validate_name("bad/name"));
        assert!(!validate_name("UPPERCASE.MV2"));
    }

    #[test]
    fn test_put_and_search() {
        let _dir = tempdir().unwrap();
        let mut servidor = MemvidServidor::nuevo();

        let frame_id = servidor.poner(
            "test-memvid-2026T1.mv2",
            "Hola mundo primer recuerdo",
            Some("Primer recuerdo"),
            Some("mv2://personal/test/1"),
            Some("test"),
            Some(1761600000),
        ).unwrap();

        assert!(frame_id > 0);

        let resultados = servidor.buscar(
            "test-memvid-2026T1.mv2",
            "mundo",
            5,
        );

        assert!(resultados.is_ok());
        let res = resultados.unwrap();
        assert!(!res.is_empty());
    }

    #[test]
    fn test_estado() {
        let _dir = tempdir().unwrap();
        let servidor = MemvidServidor::nuevo();

        let _ = servidor.poner(
            "test-estado-2026T1.mv2",
            "texto de prueba",
            None,
            None,
            None,
            None,
        );

        let estado = servidor.estado("test-estado-2026T1.mv2");
        assert!(estado.is_ok());
    }

    #[test]
    fn test_linea_tiempo() {
        let _dir = tempdir().unwrap();
        let mut servidor = MemvidServidor::nuevo();

        let _ = servidor.poner(
            "test-linea-2026T1.mv2",
            "primer texto",
            None,
            None,
            None,
            Some(1761600000),
        );

        let _ = servidor.poner(
            "test-linea-2026T1.mv2",
            "segundo texto",
            None,
            None,
            None,
            Some(1761600010),
        );

        let linea = servidor.linea_tiempo(
            "test-linea-2026T1.mv2",
            None,
            None,
        );

        assert!(linea.is_ok());
    }

    #[test]
    fn test_commit_y_re_cifrado() {
        let _dir = tempdir().unwrap();
        let mut servidor = MemvidServidor::nuevo();

        let _ = servidor.poner(
            "test-commit-2026T1.mv2",
            "texto para commit",
            None,
            None,
            None,
            None,
        );

        let _ = servidor.commit("test-commit-2026T1.mv2");

        // Después de commit, el archivo debería estar cifrado (.mv2e)
        let mv2e_path = get_memvid_dir().join("test-commit-2026T1.mv2e");
        assert!(mv2e_path.exists(), "Archivo .mv2e debería existir después de commit");
    }
}