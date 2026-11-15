// ═══════════════════════════════════════════════════════════════════════════
// capas_http_android — las descargas de las capas del servidor local en Android (AND1114L).
// ---------------------------------------------------------------------------
// En escritorio las capas se bajan con el `curl` del sistema. Android no trae `curl` ni hay un cliente HTTPS
// en el árbol de Rust del móvil (reqwest/rustls son solo de escritorio), así que la descarga la hace Kotlin
// (`CapasAndroid.kt`, HttpURLConnection) y Rust y Kotlin se hablan como en el resto de la app: archivos JSON
// pequeños en una carpeta (`<noBackup>/servidor-capas-puente/`).
//
//   Rust → Kotlin  `pet-<id>.json`   {"id","url","destino","tope","reanudar"}  (se escribe a `.tmp-<id>` y se renombra)
//   Kotlin → Rust  `res-<id>.json`   {"id","ok","bytes","error"}
//   Rust → Kotlin  `reiniciar.json`  {"motivo"}   (relevo de capa: cierra el proceso y lo vuelve a abrir)
//
// Rust sigue haciendo TODA la verificación (firma del manifiesto, SHA-256 del archivo, SHA-256 de cada archivo
// extraído): Kotlin solo trae bytes. Lo que no es Android (formato de los archivos, espera, limpieza) es puro y
// se prueba en cualquier sistema con un Kotlin de mentira (un hilo que contesta).
// ═══════════════════════════════════════════════════════════════════════════

#![allow(dead_code)]

use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

/// Nombre de la carpeta del puente, hermana de la de las capas (nunca dentro: `limpiar` borra lo que no es capa).
pub const CARPETA_PUENTE: &str = "servidor-capas-puente";
pub const PREFIJO_PETICION: &str = "pet-";
pub const PREFIJO_RESPUESTA: &str = "res-";
pub const REINICIAR: &str = "reiniciar.json";
/// Tope de espera de una descarga pequeña (canal, manifiesto) y de la grande (la capa, ≈ decenas de MB).
pub const ESPERA_PEQUENA: Duration = Duration::from_secs(150);
pub const ESPERA_GRANDE: Duration = Duration::from_secs(60 * 30);
pub const PASO_ESPERA: Duration = Duration::from_millis(250);

pub fn carpeta_puente(capas: &Path) -> PathBuf {
    capas.parent().unwrap_or(capas).join(CARPETA_PUENTE)
}

fn id_nuevo() -> String {
    static N: AtomicU64 = AtomicU64::new(0);
    let ms = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    format!("{ms}-{}", N.fetch_add(1, Ordering::SeqCst))
}

/// PURA: el JSON de una petición de descarga.
pub fn peticion_json(id: &str, url: &str, destino: &Path, tope: u64, reanudar: bool) -> Value {
    json!({ "id": id, "url": url, "destino": destino.to_string_lossy(), "tope": tope, "reanudar": reanudar })
}

/// PURA: lee la respuesta de Kotlin. Err con el motivo si no fue bien (o si no se entiende).
pub fn leer_respuesta(texto: &str, id: &str) -> Result<u64, String> {
    let v: Value = serde_json::from_str(texto).map_err(|e| format!("respuesta ilegible de la app: {e}"))?;
    if v.get("id").and_then(Value::as_str) != Some(id) {
        return Err("respuesta de otra petición".into());
    }
    if v.get("ok").and_then(Value::as_bool) == Some(true) {
        Ok(v.get("bytes").and_then(Value::as_u64).unwrap_or(0))
    } else {
        let e = v.get("error").and_then(Value::as_str).unwrap_or("sin detalle");
        Err(e.chars().take(300).collect())
    }
}

fn escribir_atomico(dir: &Path, nombre: &str, contenido: &str) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| format!("no se pudo crear {}: {e}", dir.display()))?;
    let tmp = dir.join(format!(".tmp-{nombre}"));
    fs::write(&tmp, contenido).map_err(|e| format!("no se pudo escribir la petición: {e}"))?;
    fs::rename(&tmp, dir.join(nombre)).map_err(|e| format!("no se pudo dejar la petición: {e}"))
}

/// Pide a Kotlin que baje `url` a `destino` (con `reanudar`, sigue donde quedó) y espera su respuesta.
/// Devuelve los bytes que hay en `destino`. Nunca deja una petición viva si no contestan a tiempo.
pub fn bajar(puente: &Path, url: &str, destino: &Path, tope: u64, reanudar: bool, espera: Duration, paso: Duration) -> Result<u64, String> {
    let id = id_nuevo();
    let pet = format!("{PREFIJO_PETICION}{id}.json");
    let res = puente.join(format!("{PREFIJO_RESPUESTA}{id}.json"));
    escribir_atomico(puente, &pet, &peticion_json(&id, url, destino, tope, reanudar).to_string())?;
    let inicio = Instant::now();
    loop {
        if let Ok(t) = fs::read_to_string(&res) {
            let r = leer_respuesta(&t, &id);
            let _ = fs::remove_file(&res);
            return r;
        }
        if inicio.elapsed() >= espera {
            let _ = fs::remove_file(puente.join(&pet));
            return Err("la app no contestó a la descarga a tiempo".into());
        }
        std::thread::sleep(paso);
    }
}

/// Pide el relevo de proceso (la capa nueva solo se carga en un proceso nuevo: Node arranca una vez por proceso).
pub fn pedir_reinicio(puente: &Path, motivo: &str) -> Result<(), String> {
    escribir_atomico(puente, REINICIAR, &json!({ "motivo": motivo.chars().take(200).collect::<String>() }).to_string())
}

/// Borra restos de peticiones/respuestas viejas (al arrancar: de un proceso anterior que murió a medias).
pub fn limpiar_restos(puente: &Path) {
    if let Ok(l) = fs::read_dir(puente) {
        for e in l.flatten() {
            let n = e.file_name().to_string_lossy().to_string();
            if n.starts_with(PREFIJO_PETICION) || n.starts_with(PREFIJO_RESPUESTA) || n.starts_with(".tmp-") {
                let _ = fs::remove_file(e.path());
            }
        }
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn carpeta(n: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("capas-http-{n}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    /// Un Kotlin de mentira: contesta a la primera petición que vea, con lo que se le diga.
    fn kotlin_falso(puente: PathBuf, bytes: Option<&'static [u8]>, error: &'static str) -> std::thread::JoinHandle<()> {
        std::thread::spawn(move || {
            let fin = Instant::now() + Duration::from_secs(10);
            while Instant::now() < fin {
                if let Ok(l) = fs::read_dir(&puente) {
                    for e in l.flatten() {
                        let n = e.file_name().to_string_lossy().to_string();
                        if n.starts_with(PREFIJO_PETICION) {
                            let v: Value = serde_json::from_str(&fs::read_to_string(e.path()).unwrap()).unwrap();
                            let id = v["id"].as_str().unwrap().to_string();
                            let r = match bytes {
                                Some(b) => {
                                    fs::write(v["destino"].as_str().unwrap(), b).unwrap();
                                    json!({ "id": id, "ok": true, "bytes": b.len() })
                                }
                                None => json!({ "id": id, "ok": false, "error": error }),
                            };
                            fs::write(puente.join(format!("{PREFIJO_RESPUESTA}{id}.json")), r.to_string()).unwrap();
                            let _ = fs::remove_file(e.path());
                            return;
                        }
                    }
                }
                std::thread::sleep(Duration::from_millis(20));
            }
        })
    }

    #[test]
    fn baja_con_la_respuesta_de_kotlin() {
        let d = carpeta("ok");
        let puente = d.join("p");
        fs::create_dir_all(&puente).unwrap();
        let h = kotlin_falso(puente.clone(), Some(b"hola"), "");
        let destino = d.join("salida.bin");
        let n = bajar(&puente, "https://x/y", &destino, 100, false, Duration::from_secs(5), Duration::from_millis(10)).unwrap();
        h.join().unwrap();
        assert_eq!(n, 4);
        assert_eq!(fs::read(&destino).unwrap(), b"hola");
    }

    #[test]
    fn un_fallo_de_kotlin_llega_con_su_motivo() {
        let d = carpeta("fallo");
        let puente = d.join("p");
        fs::create_dir_all(&puente).unwrap();
        let h = kotlin_falso(puente.clone(), None, "sin red: UnknownHost");
        let e = bajar(&puente, "https://x/y", &d.join("s"), 100, false, Duration::from_secs(5), Duration::from_millis(10)).unwrap_err();
        h.join().unwrap();
        assert!(e.contains("UnknownHost"), "{e}");
    }

    #[test]
    fn sin_respuesta_se_rinde_y_no_deja_la_peticion() {
        let d = carpeta("tiempo");
        let puente = d.join("p");
        let e = bajar(&puente, "https://x/y", &d.join("s"), 100, false, Duration::from_millis(150), Duration::from_millis(10)).unwrap_err();
        assert!(e.contains("no contestó"), "{e}");
        let quedan = fs::read_dir(&puente).unwrap().flatten().filter(|x| x.file_name().to_string_lossy().starts_with(PREFIJO_PETICION)).count();
        assert_eq!(quedan, 0);
    }

    #[test]
    fn respuesta_de_otra_peticion_no_vale() {
        assert!(leer_respuesta(r#"{"id":"a","ok":true,"bytes":3}"#, "b").is_err());
        assert_eq!(leer_respuesta(r#"{"id":"a","ok":true,"bytes":3}"#, "a"), Ok(3));
        assert!(leer_respuesta("no es json", "a").is_err());
    }

    #[test]
    fn el_puente_es_hermano_de_las_capas_y_el_reinicio_se_escribe() {
        let d = carpeta("hermano");
        let capas = d.join("servidor-capas");
        assert_eq!(carpeta_puente(&capas), d.join(CARPETA_PUENTE));
        pedir_reinicio(&carpeta_puente(&capas), "relevo de capa").unwrap();
        assert!(d.join(CARPETA_PUENTE).join(REINICIAR).is_file());
        limpiar_restos(&carpeta_puente(&capas)); // no toca reiniciar.json
        assert!(d.join(CARPETA_PUENTE).join(REINICIAR).is_file());
    }
}
