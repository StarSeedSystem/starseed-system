// ═══════════════════════════════════════════════════════════════════════════
// disco — espacio libre, presupuesto y almacén de capas de Astraura (2026-10-10).
// ---------------------------------------------------------------------------
// Contrato: architecture/capas-autoadaptables.md §4 y §6 +
//           architecture/apps-nativas-segundo-plano.md §6.
//
//   · Presupuesto de la app nativa: 15 % del disco libre, con tope de 8 GB. Se
//     calcula sobre (libre + lo que ya ocupan las capas) para que el número no
//     baje solo por haber descargado una capa.
//   · Una capa entra en el disco SOLO si su SHA-256 casa con el del catálogo
//     (`config/capas-astraura.json`): se descarga a un temporal, se hashea a
//     trozos y, si no casa, se borra. Nunca se usa una capa sin SHA.
//   · Descarga con el `curl` del sistema (macOS, Linux y Windows 10+ lo traen),
//     reanudable (`-C -`). En Android no hay curl: allí la descarga será del
//     servicio Kotlin (DownloadManager) — lo dice el error, no se finge.
//
// Solo std: se prueba sin Tauri (pruebas al final).
// ═══════════════════════════════════════════════════════════════════════════

use crate::sha256::{es_sha256_hex, sha256_archivo};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;

/// `Command` que en Windows no abre una consola negra (la app es gráfica).
pub fn orden(programa: &str) -> Command {
    #[allow(unused_mut)]
    let mut c = Command::new(programa);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    c
}

pub const FRACCION_PORCENTAJE: u64 = 15;
pub const TOPE_BYTES: u64 = 8 * 1024 * 1024 * 1024;
pub const CARPETA_CAPAS: &str = "capas";

/// Presupuesto en bytes para capas: 15 % de (libre + ya ocupado), tope 8 GB.
pub fn presupuesto(libre: u64, ocupado_por_capas: u64) -> u64 {
    let base = libre.saturating_add(ocupado_por_capas);
    (base / 100 * FRACCION_PORCENTAJE).min(TOPE_BYTES)
}

/// Lee la salida de `df -Pk <dir>`: segunda línea, 4.ª columna (KiB disponibles).
pub fn leer_df(salida: &str) -> Option<u64> {
    let linea = salida.lines().filter(|l| !l.trim().is_empty()).nth(1)?;
    let campos: Vec<&str> = linea.split_whitespace().collect();
    // Si el nombre del dispositivo lleva espacios, las columnas numéricas siguen
    // siendo las 4 anteriores al «Capacity%»: se buscan desde el final.
    let pos_pct = campos.iter().rposition(|c| c.ends_with('%'))?;
    if pos_pct < 1 {
        return None;
    }
    campos[pos_pct - 1].parse::<u64>().ok().map(|kib| kib * 1024)
}

/// Lee la salida de PowerShell `(Get-PSDrive -Name C).Free` (un número).
pub fn leer_psdrive(salida: &str) -> Option<u64> {
    salida.trim().lines().next()?.trim().parse::<u64>().ok()
}

/// Espacio libre (bytes) del volumen donde vive `dir`. None si no se pudo medir.
#[cfg(windows)]
pub fn espacio_libre(dir: &Path) -> Option<u64> {
    let texto = dir.to_string_lossy();
    let letra = texto.chars().next().filter(|c| c.is_ascii_alphabetic())?;
    let ps = format!("(Get-PSDrive -Name {letra}).Free");
    let out = orden("powershell").args(["-NoProfile", "-Command", &ps]).output().ok()?;
    leer_psdrive(&String::from_utf8_lossy(&out.stdout))
}

/// Espacio libre (bytes) del volumen donde vive `dir` (`df -Pk`; Android trae
/// el `df` de toybox, que también entiende -P). None si no se pudo medir.
#[cfg(not(windows))]
pub fn espacio_libre(dir: &Path) -> Option<u64> {
    let out = orden("df").arg("-Pk").arg(dir).output().ok()?;
    if !out.status.success() {
        return None;
    }
    leer_df(&String::from_utf8_lossy(&out.stdout))
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct CapaEnDisco {
    pub nombre: String,
    pub bytes: u64,
}

/// Archivos de capa ya en el disco (se ignoran los temporales `.parcial`).
pub fn capas_instaladas(dir: &Path) -> Vec<CapaEnDisco> {
    let Ok(lector) = std::fs::read_dir(dir) else { return vec![] };
    let mut v: Vec<CapaEnDisco> = lector
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let m = e.metadata().ok()?;
            let nombre = e.file_name().to_string_lossy().to_string();
            (m.is_file() && !nombre.ends_with(".parcial")).then_some(CapaEnDisco { nombre, bytes: m.len() })
        })
        .collect();
    v.sort_by(|a, b| a.nombre.cmp(&b.nombre));
    v
}

/// Nombre de archivo seguro: sin rutas, sin `..`, sin caracteres raros.
pub fn nombre_seguro(nombre: &str) -> bool {
    !nombre.is_empty()
        && nombre.len() <= 160
        && nombre != "."
        && nombre != ".."
        && !nombre.starts_with('.')
        && nombre.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct Verificacion {
    pub ok: bool,
    pub sha256: String,
    pub bytes: u64,
    pub motivo: String,
}

/// Comprueba el SHA de un archivo contra el esperado (64 hex).
pub fn verificar(ruta: &Path, sha_esperado: &str) -> Verificacion {
    if !es_sha256_hex(sha_esperado) {
        return Verificacion {
            ok: false,
            sha256: String::new(),
            bytes: 0,
            motivo: "El catálogo no trae un SHA-256 válido para esta capa: no se usa (§6).".into(),
        };
    }
    match sha256_archivo(ruta) {
        Ok((sha, bytes)) => {
            let ok = sha.eq_ignore_ascii_case(sha_esperado);
            Verificacion {
                motivo: if ok { "SHA-256 correcto.".into() } else { "El SHA-256 no casa con el catálogo.".into() },
                ok,
                sha256: sha,
                bytes,
            }
        }
        Err(e) => Verificacion { ok: false, sha256: String::new(), bytes: 0, motivo: format!("No se pudo leer: {e}") },
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PeticionDescarga {
    pub url: String,
    pub sha256: String,
    pub nombre: String,
    pub tamano_bytes: u64,
}

/// Comprueba la petición ANTES de descargar nada (puro).
pub fn validar_peticion(p: &PeticionDescarga, libre: u64, ocupado: u64) -> Result<(), String> {
    if !p.url.starts_with("https://") {
        return Err("Solo se descargan capas por https.".into());
    }
    if !es_sha256_hex(&p.sha256) {
        return Err("La capa no trae SHA-256 del catálogo: no se descarga (§6).".into());
    }
    if !nombre_seguro(&p.nombre) {
        return Err(format!("Nombre de archivo no válido: «{}».", p.nombre));
    }
    let tope = presupuesto(libre, ocupado);
    if ocupado.saturating_add(p.tamano_bytes) > tope {
        return Err(format!(
            "No cabe: las capas ocuparían {} MB y el presupuesto es {} MB (15 % del disco libre, tope 8 GB).",
            (ocupado + p.tamano_bytes) / 1_048_576,
            tope / 1_048_576
        ));
    }
    Ok(())
}

/// Descarga con curl a `<nombre>.parcial`, verifica y renombra. Bloqueante: la
/// glue de Tauri la llama desde `spawn_blocking`.
pub fn descargar(p: &PeticionDescarga, dir: &Path) -> Result<Verificacion, String> {
    if cfg!(any(target_os = "android", target_os = "ios")) {
        return Err("En el móvil la descarga de capas llega con el servicio nativo (DownloadManager en Android); hoy, solo escritorio.".into());
    }
    std::fs::create_dir_all(dir).map_err(|e| format!("No se pudo crear {}: {e}", dir.display()))?;
    let parcial: PathBuf = dir.join(format!("{}.parcial", p.nombre));
    let estado = orden("curl")
        .args(["-L", "--fail", "--silent", "--show-error", "--retry", "3", "-C", "-", "-o"])
        .arg(&parcial)
        .arg(&p.url)
        .status()
        .map_err(|e| format!("No se pudo lanzar curl: {e}"))?;
    if !estado.success() {
        return Err(format!("curl terminó con {estado}: la descarga se reanudará en el siguiente intento."));
    }
    let v = verificar(&parcial, &p.sha256);
    if !v.ok {
        let _ = std::fs::remove_file(&parcial);
        return Err(format!("{} Se borró el archivo descargado.", v.motivo));
    }
    std::fs::rename(&parcial, dir.join(&p.nombre)).map_err(|e| format!("No se pudo colocar la capa: {e}"))?;
    Ok(v)
}

#[cfg(test)]
mod pruebas {
    use super::*;

    const GB: u64 = 1024 * 1024 * 1024;

    #[test]
    fn presupuesto_quince_por_ciento_con_tope() {
        assert_eq!(presupuesto(10 * GB, 0), 10 * GB / 100 * 15);
        assert_eq!(presupuesto(200 * GB, 0), TOPE_BYTES);
        // Lo ya ocupado por capas cuenta en la base: el presupuesto no se encoge al descargar.
        assert_eq!(presupuesto(9 * GB, GB), presupuesto(10 * GB, 0));
    }

    #[test]
    fn lee_df_de_macos_linux_y_android() {
        let mac = "Filesystem     1024-blocks      Used Available Capacity  Mounted on\n/dev/disk3s5    239362496 180000000  52000000    78%    /System/Volumes/Data\n";
        assert_eq!(leer_df(mac), Some(52_000_000 * 1024));
        let linux = "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/vda 264000000 44000000 216000 100% /\n";
        assert_eq!(leer_df(linux), Some(216_000 * 1024));
        let raro = "Filesystem 1024-blocks Used Available Capacity Mounted on\nmap auto home 0 0 0 100% /home\n";
        assert_eq!(leer_df(raro), Some(0));
        assert_eq!(leer_df("basura"), None);
        assert_eq!(leer_psdrive("123456789\r\n"), Some(123_456_789));
    }

    #[test]
    fn nombres_seguros() {
        assert!(nombre_seguro("needle3.cact"));
        assert!(nombre_seguro("bitnet-embeddings-0.6b-bf16-i2_s.gguf"));
        assert!(!nombre_seguro("../x"));
        assert!(!nombre_seguro("a/b"));
        assert!(!nombre_seguro(".oculto"));
        assert!(!nombre_seguro(""));
    }

    #[test]
    fn valida_peticiones() {
        let sha = "c9d915eca282ed42d1a09b143b592adb4cc6744ffe2d294adf5cfc5548170c38".to_string();
        let ok = PeticionDescarga { url: "https://huggingface.co/x".into(), sha256: sha.clone(), nombre: "needle3.cact".into(), tamano_bytes: 35_335_380 };
        assert!(validar_peticion(&ok, 50 * GB, 0).is_ok());
        let http = PeticionDescarga { url: "http://x".into(), ..ok.clone() };
        assert!(validar_peticion(&http, 50 * GB, 0).is_err());
        let sin_sha = PeticionDescarga { sha256: "por-verificar".into(), ..ok.clone() };
        assert!(validar_peticion(&sin_sha, 50 * GB, 0).unwrap_err().contains("SHA"));
        let grande = PeticionDescarga { tamano_bytes: 9 * GB, ..ok.clone() };
        assert!(validar_peticion(&grande, 500 * GB, 0).unwrap_err().contains("No cabe"));
    }

    #[test]
    fn verifica_sha_de_un_archivo() {
        let dir = std::env::temp_dir().join(format!("ss-disco-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("capa.bin");
        std::fs::write(&f, b"abc").unwrap();
        let bien = verificar(&f, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        assert!(bien.ok && bien.bytes == 3);
        assert!(!verificar(&f, &"0".repeat(64)).ok);
        assert!(!verificar(&f, "por-verificar").ok);
        std::fs::write(dir.join("otra.gguf.parcial"), b"x").unwrap();
        let inst = capas_instaladas(&dir);
        assert_eq!(inst, vec![CapaEnDisco { nombre: "capa.bin".into(), bytes: 3 }]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    #[test]
    fn mide_el_disco_de_verdad() {
        // En cualquier Unix con df: debe dar un número (puede ser pequeño).
        assert!(espacio_libre(&std::env::temp_dir()).is_some());
    }
}
