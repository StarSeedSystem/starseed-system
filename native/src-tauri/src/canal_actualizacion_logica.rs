// ═══════════════════════════════════════════════════════════════════════════
// Canal de actualización de la app instalada (ACT1108A, 2026-11-08) — parte PURA.
// Contrato: architecture/centro-versiones-1105.md §9.
// ---------------------------------------------------------------------------
// Dos canales:
//   · oficial  → lo de siempre: `releases/latest/download/latest.json` (escritorio). Aquí no cambia nada.
//   · pruebas  → la prerelease FIJA `canal-pruebas`: `latest-prueba.json` (escritorio, firmado con la
//                clave del updater) y `latest-prueba-android.json` (APK: versión, versionCode, url,
//                sha256). Lo sube native-build.yml con `canal=pruebas`.
// Una app está en el canal de pruebas si su versión lleva «-prueba.» (0.5.1-prueba.23). Esa app mira
// las DOS fuentes (pruebas y oficial) y se queda con la mayor por semver, así que cuando salga la
// 0.5.1 oficial la instala encima (0.5.1-prueba.N < 0.5.1). Una app oficial nunca mira el canal de
// pruebas.
//
// Lo que se cruzan Rust y Kotlin en Android (filesDir/starseed/actualizacion/): `peticion.json` (Rust
// → Kotlin: buscar o instalar), `estado.json` (Kotlin → Rust → web) y `puente.json` (Kotlin dice que el
// actualizador interno existe en este APK).
//
// Solo std + serde/serde_json + semver (el mismo comparador que tauri-plugin-updater; ya estaba en el
// árbol por tauri-utils). Se prueba sin Tauri.
// ═══════════════════════════════════════════════════════════════════════════

// Compartido por escritorio (endpoints, semver, texto) y Android (manifiestos, peticiones, estado):
// cada plataforma usa solo su parte.
#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use std::path::Path;

/// Raíz de las descargas de los Releases del repositorio. Kotlin (ActualizadorApk.kt) solo baja
/// manifiestos y APK que empiecen así (una prueba vigila que diga lo mismo).
pub const PREFIJO_DESCARGAS: &str = "https://github.com/StarSeedSystem/starseed-system/releases/download/";
/// Etiqueta de la prerelease fija del canal de pruebas.
pub const ETIQUETA_PRUEBAS: &str = "canal-pruebas";
/// Canal oficial de escritorio de StarSeed OS (el de tauri.conf.json; no se toca).
pub const ENDPOINT_OFICIAL_OS: &str = "https://github.com/StarSeedSystem/starseed-system/releases/latest/download/latest.json";
/// Canal de pruebas de escritorio (StarSeed OS).
pub const ENDPOINT_PRUEBAS_OS: &str = "https://github.com/StarSeedSystem/starseed-system/releases/download/canal-pruebas/latest-prueba.json";
/// Manifiesto del APK de pruebas.
pub const MANIFIESTO_PRUEBAS_ANDROID: &str = "https://github.com/StarSeedSystem/starseed-system/releases/download/canal-pruebas/latest-prueba-android.json";
/// Manifiesto del APK oficial, CUANDO EXISTA (hoy los releases oficiales no lo llevan: si no está, la
/// web sigue con el enlace al .apk de siempre).
pub const MANIFIESTO_OFICIAL_ANDROID: &str = "https://github.com/StarSeedSystem/starseed-system/releases/latest/download/latest-android.json";
/// Marca de una versión del canal de pruebas.
pub const MARCA_PRUEBA: &str = "-prueba.";
/// Cada cuánto se busca en segundo plano (escritorio lo hace en lib.rs con el mismo valor).
pub const INTERVALO_SEGUNDOS: u64 = 6 * 60 * 60;

// Archivos en filesDir/starseed/actualizacion (Android).
pub const CARPETA_ANDROID: &str = "actualizacion";
pub const PETICION: &str = "peticion.json";
pub const ESTADO: &str = "estado.json";
pub const PUENTE: &str = "puente.json";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Canal {
    Oficial,
    Pruebas,
}

/// ¿De qué canal es esta versión instalada? Solo «-prueba.» la pasa al de pruebas.
pub fn canal_de_version(version: &str) -> Canal {
    if version.trim().contains(MARCA_PRUEBA) {
        Canal::Pruebas
    } else {
        Canal::Oficial
    }
}

/// Versión semver (sin «v» delante). `None` si no lo es.
pub fn semver(v: &str) -> Option<semver::Version> {
    semver::Version::parse(v.trim().trim_start_matches(['v', 'V'])).ok()
}

/// ¿`candidata` es más nueva que `actual`? Las reglas de semver (las del updater de Tauri):
/// 0.5.0 < 0.5.1-prueba.9 < 0.5.1-prueba.23 < 0.5.1. Con algo que no sea semver, no.
pub fn es_mas_nueva(candidata: &str, actual: &str) -> bool {
    match (semver(candidata), semver(actual)) {
        (Some(c), Some(a)) => c > a,
        _ => false,
    }
}

/// Endpoints de escritorio para este sistema y esta versión. `None` = los de su tauri.conf.json (lo de
/// siempre). Solo StarSeed OS tiene canal de pruebas; con él se miran pruebas y oficial, en ese orden.
pub fn endpoints_escritorio(sistema: &str, version: &str) -> Option<Vec<String>> {
    if sistema == "os" && canal_de_version(version) == Canal::Pruebas {
        Some(vec![ENDPOINT_PRUEBAS_OS.to_string(), ENDPOINT_OFICIAL_OS.to_string()])
    } else {
        None
    }
}

/// Manifiestos de APK que mira esta app de Android (en orden). Vacío = no hay actualizador interno
/// para ella (Nexus y Café todavía no tienen canal de APK).
pub fn manifiestos_android(sistema: &str, version: &str) -> Vec<String> {
    if sistema != "os" {
        return Vec::new();
    }
    match canal_de_version(version) {
        Canal::Pruebas => vec![MANIFIESTO_PRUEBAS_ANDROID.to_string(), MANIFIESTO_OFICIAL_ANDROID.to_string()],
        Canal::Oficial => vec![MANIFIESTO_OFICIAL_ANDROID.to_string()],
    }
}

/// De varias versiones encontradas (una por canal), la mayor por semver. Las que no son semver no cuentan.
pub fn indice_mayor<'a>(versiones: impl IntoIterator<Item = &'a str>) -> Option<usize> {
    let mut mejor: Option<(usize, semver::Version)> = None;
    for (i, v) in versiones.into_iter().enumerate() {
        if let Some(s) = semver(v) {
            if mejor.as_ref().map_or(true, |(_, m)| s > *m) {
                mejor = Some((i, s));
            }
        }
    }
    mejor.map(|(i, _)| i)
}

/// Texto de la notificación cuando el updater de escritorio ya instaló la versión nueva en segundo plano.
pub fn texto_lista(version: &str) -> String {
    let v = version.trim().trim_start_matches(['v', 'V']);
    if canal_de_version(v) == Canal::Pruebas {
        format!("Lista: reinicia para usar la {v} (canal de pruebas). Tus datos se quedan donde están.")
    } else {
        format!("Lista: reinicia para usar la {v}. Tus datos se quedan donde están.")
    }
}

// ─── Android: peticiones y estado (archivos JSON pequeños con ActualizadorApk.kt) ───

/// Lo que escribe Kotlin en `estado.json` y la web lee con `apk_estado`. Los nombres van en snake_case
/// (así los lee `src/lib/nativa/actualizador-apk.ts`, interfaz `EstadoApkNativo`).
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct EstadoApk {
    /// "" (nada aún) | "buscando" | "al-dia" | "descargando" | "lista" | "permiso" | "instalador" |
    /// "instalada" | "error" | "sin-actualizador".
    #[serde(default)]
    pub fase: String,
    /// Versión ofrecida (versionName del APK nuevo).
    #[serde(default)]
    pub version: Option<String>,
    /// versionCode del APK nuevo.
    #[serde(default)]
    pub version_code: Option<u64>,
    /// versionName instalado ahora.
    #[serde(default)]
    pub instalada: Option<String>,
    #[serde(default)]
    pub descargado: Option<u64>,
    #[serde(default)]
    pub total: Option<u64>,
    #[serde(default)]
    pub mensaje: Option<String>,
    /// Canal de la versión ofrecida: "pruebas" | "oficial".
    #[serde(default)]
    pub canal: Option<String>,
    /// Notas de la versión ofrecida (del manifiesto).
    #[serde(default)]
    pub notas: Option<String>,
    /// Momento del estado (ms desde 1970).
    #[serde(default)]
    pub t: u64,
}

/// Fases en las que Kotlin sigue trabajando (no se pisa con otra búsqueda).
pub fn ocupada(fase: &str) -> bool {
    matches!(fase, "buscando" | "descargando")
}

/// Lee `estado.json` (por defecto, fase vacía: nunca se buscó).
pub fn leer_estado(dir: &Path) -> EstadoApk {
    std::fs::read_to_string(dir.join(ESTADO))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

/// ¿Trae este APK el actualizador interno? (Kotlin escribe `puente.json` al arrancar el proceso.)
pub fn hay_puente(dir: &Path) -> bool {
    dir.join(PUENTE).is_file()
}

/// Petición «buscar» (y, si `instalar`, abrir el instalador al terminar con la app a la vista).
pub fn peticion_buscar(manifiestos: &[String], instalar: bool, ahora_ms: u64) -> serde_json::Value {
    serde_json::json!({ "accion": "buscar", "manifiestos": manifiestos, "instalar": instalar, "t": ahora_ms })
}

/// Petición «instalar» (el APK ya descargado y verificado).
pub fn peticion_instalar(ahora_ms: u64) -> serde_json::Value {
    serde_json::json!({ "accion": "instalar", "t": ahora_ms })
}

/// Escribe la petición de forma atómica (Kotlin la recoge con un FileObserver al cerrarse o moverse).
pub fn escribir_peticion(dir: &Path, peticion: &serde_json::Value) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| format!("No se pudo crear {}: {e}", dir.display()))?;
    let tmp = dir.join(format!("{PETICION}.tmp"));
    std::fs::write(&tmp, peticion.to_string()).map_err(|e| format!("No se pudo escribir la petición: {e}"))?;
    std::fs::rename(&tmp, dir.join(PETICION)).map_err(|e| format!("No se pudo colocar la petición: {e}"))
}

/// Estado que se devuelve justo después de pedir una búsqueda (Kotlin aún no ha escrito el suyo).
pub fn estado_pedido(anterior: EstadoApk, ahora_ms: u64) -> EstadoApk {
    if ocupada(&anterior.fase) {
        return anterior;
    }
    EstadoApk { fase: "buscando".into(), mensaje: Some("Buscando la versión nueva…".into()), t: ahora_ms, ..anterior }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn canal_por_version() {
        assert_eq!(canal_de_version("0.5.1-prueba.23"), Canal::Pruebas);
        assert_eq!(canal_de_version(" 0.5.1-prueba.1 "), Canal::Pruebas);
        assert_eq!(canal_de_version("0.5.0"), Canal::Oficial);
        assert_eq!(canal_de_version("0.6.0-beta.1"), Canal::Oficial, "otra prerelease no es el canal de pruebas");
        assert_eq!(canal_de_version(""), Canal::Oficial);
    }

    #[test]
    fn orden_semver_del_canal_de_pruebas() {
        // Lo que pide el contrato: 0.5.0 < 0.5.1-prueba.23 < 0.5.1, y las pruebas crecen por número.
        assert!(es_mas_nueva("0.5.1-prueba.23", "0.5.0"));
        assert!(es_mas_nueva("0.5.1", "0.5.1-prueba.23"));
        assert!(!es_mas_nueva("0.5.1-prueba.23", "0.5.1"));
        assert!(es_mas_nueva("0.5.1-prueba.24", "0.5.1-prueba.23"));
        assert!(es_mas_nueva("0.5.1-prueba.100", "0.5.1-prueba.99"), "numérico, no alfabético");
        assert!(!es_mas_nueva("0.5.1-prueba.23", "0.5.1-prueba.23"));
        assert!(es_mas_nueva("0.5.2-prueba.1", "0.5.1"));
        assert!(es_mas_nueva("v0.6.0", "0.5.1-prueba.40"));
        assert!(!es_mas_nueva("basura", "0.5.0"));
        assert!(!es_mas_nueva("0.6.0", "build-mvq6"));
    }

    #[test]
    fn mismo_comparador_que_el_updater_de_tauri() {
        // tauri-plugin-updater compara `semver::Version` con `>` (comparador por defecto).
        let v = |s: &str| semver::Version::parse(s).unwrap();
        assert!(v("0.5.1-prueba.23") > v("0.5.0"));
        assert!(v("0.5.1-prueba.23") < v("0.5.1"));
        assert_eq!(semver("v0.5.1-prueba.23"), Some(v("0.5.1-prueba.23")));
    }

    #[test]
    fn endpoints_de_escritorio_por_canal() {
        assert_eq!(endpoints_escritorio("os", "0.5.0"), None, "oficial: los de tauri.conf.json, sin tocar");
        assert_eq!(
            endpoints_escritorio("os", "0.5.1-prueba.23"),
            Some(vec![ENDPOINT_PRUEBAS_OS.to_string(), ENDPOINT_OFICIAL_OS.to_string()])
        );
        assert_eq!(endpoints_escritorio("nexus", "0.5.1-prueba.23"), None, "solo StarSeed OS tiene canal de pruebas");
        assert_eq!(endpoints_escritorio("cafe", "0.5.0"), None);
        assert!(ENDPOINT_PRUEBAS_OS.starts_with(PREFIJO_DESCARGAS));
        assert!(ENDPOINT_PRUEBAS_OS.contains(&format!("/{ETIQUETA_PRUEBAS}/")));
        assert!(ENDPOINT_OFICIAL_OS.ends_with("/releases/latest/download/latest.json"));
    }

    #[test]
    fn el_endpoint_oficial_es_el_de_tauri_conf() {
        let conf: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let eps = conf["plugins"]["updater"]["endpoints"].as_array().unwrap();
        assert_eq!(eps[0].as_str(), Some(ENDPOINT_OFICIAL_OS));
    }

    #[test]
    fn manifiestos_de_android_por_canal() {
        assert_eq!(manifiestos_android("os", "0.5.1-prueba.3"), vec![MANIFIESTO_PRUEBAS_ANDROID, MANIFIESTO_OFICIAL_ANDROID]);
        assert_eq!(manifiestos_android("os", "0.5.0"), vec![MANIFIESTO_OFICIAL_ANDROID]);
        assert!(manifiestos_android("nexus", "0.5.0").is_empty());
        assert!(manifiestos_android("cafe", "0.5.1-prueba.3").is_empty());
        for m in manifiestos_android("os", "0.5.1-prueba.3") {
            assert!(m.starts_with("https://github.com/StarSeedSystem/starseed-system/releases/"));
        }
        assert!(MANIFIESTO_PRUEBAS_ANDROID.starts_with(PREFIJO_DESCARGAS));
    }

    #[test]
    fn la_mayor_de_los_dos_canales() {
        assert_eq!(indice_mayor(["0.5.1-prueba.23", "0.5.0"]), Some(0));
        assert_eq!(indice_mayor(["0.5.1-prueba.23", "0.5.1"]), Some(1));
        assert_eq!(indice_mayor(["x", "0.5.0"]), Some(1));
        assert_eq!(indice_mayor(["x", "y"]), None);
        assert_eq!(indice_mayor(Vec::<&str>::new()), None);
    }

    #[test]
    fn textos_de_lista() {
        assert!(texto_lista("0.5.1-prueba.2").contains("canal de pruebas"));
        assert!(texto_lista("v0.6.0").starts_with("Lista: reinicia para usar la 0.6.0."));
    }

    #[test]
    fn peticiones_y_estado_en_disco() {
        let dir = std::env::temp_dir().join(format!("ss-canal-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(leer_estado(&dir), EstadoApk::default());
        assert!(!hay_puente(&dir));
        let urls = manifiestos_android("os", "0.5.1-prueba.3");
        escribir_peticion(&dir, &peticion_buscar(&urls, true, 7)).unwrap();
        let p: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(dir.join(PETICION)).unwrap()).unwrap();
        assert_eq!(p["accion"], "buscar");
        assert_eq!(p["instalar"], true);
        assert_eq!(p["manifiestos"][0], MANIFIESTO_PRUEBAS_ANDROID);
        assert!(!dir.join(format!("{PETICION}.tmp")).exists(), "atómica: sin temporal");
        escribir_peticion(&dir, &peticion_instalar(8)).unwrap();
        let p: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(dir.join(PETICION)).unwrap()).unwrap();
        assert_eq!(p["accion"], "instalar");
        // Lo que escribe Kotlin (con campos que Rust no conoce) se lee igual.
        std::fs::write(
            dir.join(ESTADO),
            r#"{"fase":"descargando","version":"0.5.1-prueba.4","version_code":5000004,"descargado":10,"total":100,"otro":1,"t":5}"#,
        )
        .unwrap();
        let e = leer_estado(&dir);
        assert_eq!(e.fase, "descargando");
        assert_eq!(e.version_code, Some(5_000_004));
        assert_eq!(e.total, Some(100));
        assert_eq!(estado_pedido(e.clone(), 9), e, "no pisa una descarga en marcha");
        let pedido = estado_pedido(EstadoApk { fase: "al-dia".into(), ..Default::default() }, 9);
        assert_eq!(pedido.fase, "buscando");
        assert_eq!(pedido.t, 9);
        std::fs::write(dir.join(PUENTE), "{}").unwrap();
        assert!(hay_puente(&dir));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn estado_con_los_nombres_que_lee_la_web() {
        let v = serde_json::to_value(EstadoApk::default()).unwrap();
        let mut claves: Vec<_> = v.as_object().unwrap().keys().cloned().collect();
        claves.sort();
        assert_eq!(
            claves,
            vec!["canal", "descargado", "fase", "instalada", "mensaje", "notas", "t", "total", "version", "version_code"]
        );
    }
}
