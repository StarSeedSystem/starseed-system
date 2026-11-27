// ═══════════════════════════════════════════════════════════════════════════
// nfc — comandos del NFC de las neuronas (NFC1126B). Contrato: architecture/nfc-neuronas.md §2.
// ---------------------------------------------------------------------------
//   · `nfc_capacidad`        → qué puede este aparato: lector, emulador (HCE), las dos o ninguna. No enciende nada.
//   · `nfc_iniciar`          → empieza a turnarse lector/tarjeta con la tarjeta de neurona que da la web (base64, ≤ 1 KB,
//                              ya firmada: aquí no se firma ni se guarda nada). Cada encuentro sale como evento
//                              `nfc://encuentro` { seq, via, bytes_b64 }: la FIRMA y los 30 s de vida los comprueba la web
//                              con `src/lib/nfc/tarjeta.ts` antes de enseñar nada.
//   · `nfc_parar`            → apaga los dos papeles y olvida la tarjeta.
//   · `nfc_escribir_etiqueta`→ escribe la tarjeta en la PRÓXIMA etiqueta NDEF que se acerque (la persona acaba de pedirlo).
// Android: Kotlin en NfcStarSeed.kt/HceStarSeed.kt, por archivos como la ubicación. Escritorio e iOS: responden
// `ninguno` / `false` sin fallar (el lector USB es NFC1126G; iOS, NFC1126G también).
// ═══════════════════════════════════════════════════════════════════════════

use crate::nfc_logica::{self as logica, Modo};
use serde::Serialize;
use tauri::AppHandle;

pub const EVENTO_ENCUENTRO: &str = "nfc://encuentro";

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct CapacidadNfc {
    pub version: u32,
    pub plataforma: String,
    /// «ninguno» | «lector» | «emulador» | «lector_y_emulador» (lo que va en `capacidades.nfc`).
    pub modo: String,
    /// El aparato tiene NFC pero está apagado en los ajustes del sistema.
    pub apagado_en_sistema: bool,
    pub activo: bool,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct EncuentroNfc {
    pub seq: u64,
    /// «neurona» (leí a otra por APDU), «etiqueta» (leí un NDEF), «leida» (otra me leyó) o «escrita».
    pub via: String,
    /// La tarjeta ajena tal cual, SIN verificar (la verifica la web). Vacío en «leida» y «escrita».
    pub bytes_b64: Option<String>,
}

fn ninguno() -> CapacidadNfc {
    CapacidadNfc { version: logica::VERSION_NFC, plataforma: std::env::consts::OS.into(), modo: Modo::Ninguno.como_texto().into(), apagado_en_sistema: false, activo: false }
}

/// De `estado.json` de Kotlin a la capacidad (separado para probarlo sin aparato).
pub fn capacidad_de_estado(e: &serde_json::Value, plataforma: &str) -> CapacidadNfc {
    let b = |k: &str| e.get(k).and_then(|v| v.as_bool()).unwrap_or(false);
    let modo = Modo::de_capacidades(b("lector"), b("emulador"));
    CapacidadNfc {
        version: logica::VERSION_NFC,
        plataforma: plataforma.into(),
        apagado_en_sistema: modo != Modo::Ninguno && !b("encendido"),
        modo: modo.como_texto().into(),
        activo: b("activo"),
    }
}

/// Los encuentros de `estado.json` con `seq` mayor que `desde`, en orden.
pub fn encuentros_nuevos(e: &serde_json::Value, desde: u64) -> Vec<EncuentroNfc> {
    let mut v: Vec<EncuentroNfc> = e
        .get("encuentros")
        .and_then(|a| a.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|x| {
                    let seq = x.get("seq")?.as_u64()?;
                    let via = x.get("via")?.as_str()?.to_string();
                    (seq > desde && ["neurona", "etiqueta", "leida", "escrita"].contains(&via.as_str()))
                        .then(|| EncuentroNfc { seq, via, bytes_b64: x.get("bytes_b64").and_then(|b| b.as_str()).map(String::from) })
                })
                .collect()
        })
        .unwrap_or_default();
    v.sort_by_key(|x| x.seq);
    v
}

/// La petición que lee Kotlin. La tarjeta no pasa de 1 KB (en base64, unos 1,4 KB): una mayor se rechaza aquí.
pub fn peticion_json(id: u64, orden: &str, tarjeta_b64: Option<&str>) -> Result<String, String> {
    if !["iniciar", "parar", "escribir"].contains(&orden) {
        return Err(format!("orden NFC desconocida: {orden}"));
    }
    if tarjeta_b64.map(|t| t.len() > logica::MAX_TARJETA * 4 / 3 + 4).unwrap_or(false) {
        return Err("la tarjeta de neurona pasa de 1 KB".into());
    }
    if orden == "escribir" && tarjeta_b64.map(str::is_empty).unwrap_or(true) {
        return Err("escribir pide la tarjeta".into());
    }
    Ok(serde_json::json!({ "id": id, "orden": orden, "tarjeta_b64": tarjeta_b64.unwrap_or("") }).to_string())
}

// ─────────────────────────────── Android ───────────────────────────────

#[cfg(target_os = "android")]
mod android_nfc {
    use super::*;
    use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
    use std::time::{Duration, Instant};
    use tauri::Emitter;

    static SECUENCIA: AtomicU64 = AtomicU64::new(0);
    static VIGILANDO: AtomicBool = AtomicBool::new(false);

    fn dir(app: &AppHandle) -> Option<std::path::PathBuf> {
        use tauri::Manager;
        let candidatas = crate::android::dir_datos().map(|d| d.join("nfc")).into_iter().chain(app.path().app_data_dir().ok().map(|d| d.join("files/starseed/nfc")));
        let v: Vec<_> = candidatas.collect();
        v.iter().find(|d| d.join("estado.json").is_file()).cloned().or_else(|| v.into_iter().next())
    }

    pub fn estado(app: &AppHandle) -> Option<serde_json::Value> {
        serde_json::from_str(&std::fs::read_to_string(dir(app)?.join("estado.json")).ok()?).ok()
    }

    fn id_nuevo() -> u64 {
        let base = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_micros() as u64).unwrap_or(0);
        SECUENCIA.fetch_update(Ordering::SeqCst, Ordering::SeqCst, |a| Some(a.max(base) + 1)).unwrap_or(0).max(base) + 1
    }

    /// Deja la petición y espera la respuesta de Kotlin (`respuestas.<id>`).
    pub fn enviar(app: &AppHandle, orden: &str, tarjeta: Option<&str>) -> bool {
        let (Some(d), id) = (dir(app), id_nuevo()) else { return false };
        let Ok(json) = peticion_json(id, orden, tarjeta) else { return false };
        let tmp = d.join(format!("peticion-{id}.tmp"));
        if std::fs::create_dir_all(&d).is_err() || std::fs::write(&tmp, json).is_err() || std::fs::rename(&tmp, d.join(format!("peticion-{id}.json"))).is_err() {
            return false;
        }
        let t0 = Instant::now();
        while t0.elapsed() < Duration::from_secs(5) {
            std::thread::sleep(Duration::from_millis(100));
            if let Some(r) = estado(app).and_then(|e| e.get("respuestas")?.get(id.to_string())?.as_bool()) {
                return r;
            }
        }
        false
    }

    /// Un solo hilo mientras esté encendido: pasa los encuentros nuevos a la web.
    pub fn vigilar(app: AppHandle) {
        if VIGILANDO.swap(true, Ordering::SeqCst) {
            return;
        }
        std::thread::spawn(move || {
            let mut visto = estado(&app).map(|e| encuentros_nuevos(&e, 0).last().map(|x| x.seq).unwrap_or(0)).unwrap_or(0);
            while VIGILANDO.load(Ordering::SeqCst) {
                std::thread::sleep(Duration::from_millis(400));
                let Some(e) = estado(&app) else { continue };
                for x in encuentros_nuevos(&e, visto) {
                    visto = x.seq;
                    let _ = app.emit(EVENTO_ENCUENTRO, x);
                }
            }
        });
    }

    pub fn dejar_de_vigilar() {
        VIGILANDO.store(false, Ordering::SeqCst);
    }
}

// ─────────────────────────────── Comandos ───────────────────────────────

/// Qué puede hacer este aparato con el NFC. No enciende nada ni pregunta.
#[tauri::command]
#[allow(unused_variables)]
pub async fn nfc_capacidad(app: AppHandle) -> CapacidadNfc {
    #[cfg(target_os = "android")]
    {
        let r = tauri::async_runtime::spawn_blocking(move || android_nfc::estado(&app).map(|e| capacidad_de_estado(&e, "android"))).await;
        return r.ok().flatten().unwrap_or_else(ninguno);
    }
    #[allow(unreachable_code)]
    ninguno()
}

/// Empieza a turnarse lector/tarjeta con la tarjeta ya firmada que da la web (base64).
#[tauri::command]
#[allow(unused_variables)]
pub async fn nfc_iniciar(app: AppHandle, tarjeta_b64: Option<String>) -> bool {
    #[cfg(target_os = "android")]
    {
        let a = app.clone();
        let ok = tauri::async_runtime::spawn_blocking(move || android_nfc::enviar(&a, "iniciar", tarjeta_b64.as_deref())).await.unwrap_or(false);
        if ok {
            android_nfc::vigilar(app);
        }
        return ok;
    }
    #[allow(unreachable_code)]
    false
}

#[tauri::command]
#[allow(unused_variables)]
pub async fn nfc_parar(app: AppHandle) -> bool {
    #[cfg(target_os = "android")]
    {
        android_nfc::dejar_de_vigilar();
        return tauri::async_runtime::spawn_blocking(move || android_nfc::enviar(&app, "parar", None)).await.unwrap_or(false);
    }
    #[allow(unreachable_code)]
    false
}

/// Escribe la tarjeta en la próxima etiqueta NDEF que se acerque (la persona acaba de pedirlo).
#[tauri::command]
#[allow(unused_variables)]
pub async fn nfc_escribir_etiqueta(app: AppHandle, tarjeta_b64: String) -> bool {
    #[cfg(target_os = "android")]
    {
        let a = app.clone();
        let ok = tauri::async_runtime::spawn_blocking(move || android_nfc::enviar(&a, "escribir", Some(&tarjeta_b64))).await.unwrap_or(false);
        if ok {
            android_nfc::vigilar(app);
        }
        return ok;
    }
    #[allow(unreachable_code)]
    false
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use serde_json::json;

    #[test]
    fn en_escritorio_responde_ninguno_sin_fallar() {
        let c = ninguno();
        assert_eq!((c.modo.as_str(), c.activo, c.apagado_en_sistema), ("ninguno", false, false));
    }

    #[test]
    fn la_capacidad_sale_del_estado_de_kotlin() {
        let c = capacidad_de_estado(&json!({"lector": true, "emulador": true, "encendido": false, "activo": true}), "android");
        assert_eq!((c.modo.as_str(), c.apagado_en_sistema, c.activo), ("lector_y_emulador", true, true));
        let sin = capacidad_de_estado(&json!({"lector": false, "emulador": false}), "android");
        assert!(sin.modo == "ninguno" && !sin.apagado_en_sistema, "sin chip no se dice «apagado»");
        assert_eq!(capacidad_de_estado(&json!({"lector": true, "encendido": true}), "android").modo, "lector");
    }

    #[test]
    fn solo_pasan_los_encuentros_nuevos_y_conocidos_en_orden() {
        let e = json!({"encuentros": [
            {"seq": 3, "via": "etiqueta", "bytes_b64": "QQ=="}, {"seq": 1, "via": "neurona", "bytes_b64": "Qg=="},
            {"seq": 2, "via": "leida"}, {"seq": 4, "via": "raro"}, {"via": "neurona"}]});
        let v = encuentros_nuevos(&e, 1);
        assert_eq!(v.iter().map(|x| x.seq).collect::<Vec<_>>(), vec![2, 3]);
        assert_eq!(v[0].bytes_b64, None);
        assert_eq!(v[1].bytes_b64.as_deref(), Some("QQ=="));
        assert!(encuentros_nuevos(&json!({}), 0).is_empty());
    }

    #[test]
    fn la_peticion_valida_la_orden_y_el_tamano() {
        assert!(peticion_json(1, "iniciar", Some("QQ==")).unwrap().contains("\"orden\":\"iniciar\""));
        assert!(peticion_json(1, "parar", None).is_ok());
        assert!(peticion_json(1, "formatear", None).is_err());
        assert!(peticion_json(1, "escribir", None).is_err() && peticion_json(1, "escribir", Some("")).is_err());
        assert!(peticion_json(1, "iniciar", Some(&"A".repeat(2000))).is_err());
        assert!(peticion_json(1, "iniciar", Some(&"A".repeat(1368))).is_ok(), "1 KB en base64 cabe");
    }
}
