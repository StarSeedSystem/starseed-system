//! (ORD1114T) Control entre mis neuronas · el borde ANDROID del indicador nativo (contrato
//! architecture/control-remoto-entre-neuronas.md §1 caso H y §2.4; permisos: permisos-y-control-del-dispositivo.md §2.2).
//!
//! La sesión, la puerta de cada orden y el registro encadenado son los MISMOS que en escritorio
//! (`control_neuronas_logica`, en Rust). Lo único que es Kotlin (`android/ControlNeuronasStarSeed.kt`) es el
//! borde de la plataforma: la notificación en curso del servicio en primer plano con «Terminar», la
//! superposición (borde rojo + pastilla con «Terminar») y el interruptor nativo con sus permisos.
//! Se hablan como el resto de la app (android.rs, ubicacion.rs): archivos JSON pequeños en
//! `filesDir/starseed/control-neuronas`:
//!   · Rust → Kotlin: `peticion-<n>.json` {id, accion: preparar|mostrar|quitar, sesion, nombre}.
//!   · Kotlin → Rust: `estado.json` (lo escribe SOLO Kotlin; la página no tiene escritura de archivos: SEG1111U).
//!     Mientras enseña el indicador lo reescribe cada 2 s (latido): si el latido falta más de 6 s, el indicador
//!     se da por desaparecido y la sesión se cierra.
//! «Terminar» (notificación o pastilla) lo atiende Kotlin sin la página: quita el indicador y apunta
//! `terminada` en `estado.json`; Rust lo ve en su vigía (1 s) y, antes, en la orden siguiente (que ya no ve
//! indicador). Descartar la notificación (Android 14+ deja hacerlo) cuenta como indicador desaparecido: para.
//!
//! Lo puro de aquí se prueba en cualquier sistema; la E/S solo se compila en Android.

#![allow(dead_code)]

use crate::control_neuronas_logica::Control;
use serde::Deserialize;

pub const CARPETA: &str = "control-neuronas";
pub const ESTADO: &str = "estado.json";
pub const PREFIJO_PETICION: &str = "peticion-";
/// Sin latido de Kotlin en este tiempo, el indicador no está a la vista.
pub const LATIDO_MAX_MS: u64 = 6_000;
/// Motivos de «terminada» que escribe Kotlin (lista cerrada: cualquier otro se lee como «indicador-perdido»).
pub const MOTIVOS: [&str; 4] = ["la-persona-desde-la-notificacion", "la-persona-desde-la-superposicion", "notificacion-descartada", "no-se-pudo-mostrar"];

#[derive(Deserialize, Default, Debug, Clone, PartialEq)]
#[serde(default)]
pub struct Terminada {
    pub sesion: String,
    pub motivo: String,
    pub t_ms: u64,
}

/// Lo que publica Kotlin.
#[derive(Deserialize, Default, Debug, Clone, PartialEq)]
#[serde(default)]
pub struct EstadoKotlin {
    pub v: u32,
    /// Hora (pared, ms) de la última escritura: el latido.
    pub t_ms: u64,
    /// La persona dijo «Sí» en el diálogo NATIVO «Dejar que tus otras neuronas controlen esta tableta».
    pub encendido: bool,
    /// Notificaciones permitidas (POST_NOTIFICATIONS en 13+ y el canal sin bloquear).
    pub notificaciones: bool,
    /// «Mostrar sobre otras apps» (Settings.canDrawOverlays).
    pub superposicion: bool,
    pub mostrando: bool,
    pub sesion: Option<String>,
    /// Un toque local fuera de la pastilla pausó el control; «Reanudar» (notificación o pastilla) lo quita.
    pub pausada: bool,
    pub terminada: Option<Terminada>,
    /// Lo que falta para poder enseñar el indicador, en palabras cortas («interruptor», «notificaciones», …).
    pub falta: Vec<String>,
}

pub fn leer(texto: &str) -> Option<EstadoKotlin> {
    serde_json::from_str::<EstadoKotlin>(texto).ok()
}

/// ¿Puede Kotlin enseñar el indicador? Las tres cosas, o no hay control.
pub fn posible(e: Option<&EstadoKotlin>) -> bool {
    e.is_some_and(|e| e.encendido && e.notificaciones && e.superposicion)
}

/// ¿El indicador de la sesión `sesion` está a la vista ahora (con latido fresco)?
pub fn visible(e: Option<&EstadoKotlin>, sesion: &str, ahora_ms: u64) -> bool {
    let Some(e) = e else { return false };
    e.mostrando
        && e.sesion.as_deref() == Some(sesion)
        && ahora_ms.saturating_sub(e.t_ms) <= LATIDO_MAX_MS
        && terminada_para(Some(e), sesion).is_none()
}

/// Si Kotlin terminó la sesión `sesion` (la persona o el sistema), el motivo.
pub fn terminada_para(e: Option<&EstadoKotlin>, sesion: &str) -> Option<&'static str> {
    let t = e?.terminada.as_ref()?;
    if t.sesion != sesion {
        return None;
    }
    Some(MOTIVOS.iter().copied().find(|m| *m == t.motivo).unwrap_or("indicador-perdido"))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Cambio {
    Nada,
    /// Cerrar la sesión con este motivo (la persona terminó o el indicador ya no está).
    Parar(String),
    Pausada,
    Reanudada,
}

/// Une lo que dice Kotlin con la sesión de Rust. No necesita a la página para nada: es lo que corre el vigía
/// (y la puerta de cada orden) aunque la página esté colgada.
pub fn sincronizar(c: &mut Control, e: Option<&EstadoKotlin>, sesion: &str, ahora_pared: u64, ahora_mono: u64) -> Cambio {
    if c.activa().is_none() {
        return Cambio::Nada;
    }
    if let Some(m) = terminada_para(e, sesion) {
        c.parar(ahora_mono, m);
        return Cambio::Parar(m.to_string());
    }
    if !visible(e, sesion, ahora_pared) {
        c.parar(ahora_mono, "sin-indicador");
        return Cambio::Parar("sin-indicador".into());
    }
    let kotlin_pausada = e.is_some_and(|e| e.pausada);
    match (kotlin_pausada, c.pausada()) {
        (true, false) => {
            c.pausar(ahora_mono);
            Cambio::Pausada
        }
        (false, true) => {
            c.reanudar(ahora_mono);
            Cambio::Reanudada
        }
        _ => Cambio::Nada,
    }
}

/// Una petición para Kotlin (JSON de una línea). `nombre` ya limpio (≤ 40, sin controles).
pub fn peticion(id: u64, accion: &str, sesion: &str, nombre: &str) -> String {
    serde_json::json!({ "id": id, "accion": accion, "sesion": sesion, "nombre": nombre }).to_string()
}

// ─────────────────────────── E/S (solo Android) ───────────────────────────

#[cfg(target_os = "android")]
pub mod es {
    use super::*;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};
    use tauri::{AppHandle, Manager};

    static SECUENCIA: AtomicU64 = AtomicU64::new(0);

    /// La carpeta que comparte con ControlNeuronasStarSeed.kt (la que ya tenga su `estado.json`).
    pub fn dir(app: &AppHandle) -> Option<PathBuf> {
        let candidatas: Vec<PathBuf> = crate::android::dir_datos()
            .map(|d| d.join(CARPETA))
            .into_iter()
            .chain(app.path().app_data_dir().ok().map(|d| d.join("files").join("starseed").join(CARPETA)))
            .collect();
        candidatas.iter().find(|d| d.join(ESTADO).is_file()).cloned().or_else(|| candidatas.into_iter().next())
    }

    pub fn estado(app: &AppHandle) -> Option<EstadoKotlin> {
        dir(app).and_then(|d| std::fs::read_to_string(d.join(ESTADO)).ok()).and_then(|t| leer(&t))
    }

    /// Deja una petición para Kotlin (tmp + renombrar: Kotlin nunca lee una a medias).
    pub fn pedir(app: &AppHandle, accion: &str, sesion: &str, nombre: &str) -> bool {
        let Some(d) = dir(app) else { return false };
        let _ = std::fs::create_dir_all(&d);
        let base = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|x| x.as_millis() as u64).unwrap_or(0) * 1000;
        let id = SECUENCIA.fetch_update(Ordering::SeqCst, Ordering::SeqCst, |a| Some(a.max(base) + 1)).unwrap_or(base) + 1;
        let tmp = d.join(format!(".{PREFIJO_PETICION}{id}.tmp"));
        let fin = d.join(format!("{PREFIJO_PETICION}{id}.json"));
        std::fs::write(&tmp, peticion(id, accion, sesion, nombre)).is_ok() && std::fs::rename(&tmp, &fin).is_ok()
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    const DE: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const TOK: &str = "00112233445566778899aabbccddeeff";

    fn kotlin(o: serde_json::Value) -> EstadoKotlin {
        let mut base = serde_json::json!({
            "v": 1, "t_ms": 1_000_000, "encendido": true, "notificaciones": true, "superposicion": true,
            "mostrando": true, "sesion": "S1", "pausada": false, "terminada": null, "falta": []
        });
        for (k, v) in o.as_object().unwrap() {
            base[k] = v.clone();
        }
        leer(&base.to_string()).unwrap()
    }

    #[test]
    fn sin_notificaciones_superposicion_o_interruptor_no_hay_indicador_y_la_sesion_se_niega() {
        for falta in ["encendido", "notificaciones", "superposicion"] {
            let e = kotlin(serde_json::json!({ falta: false, "mostrando": false, "sesion": null }));
            assert!(!posible(Some(&e)), "{falta}");
            // control_neuronas.rs pasa `posible && Kotlin lo puso a la vista` como `indicador`.
            let mut c = Control::default();
            assert_eq!(c.abrir(TOK, DE, "Mac", "controlar", 0, posible(Some(&e))).unwrap_err().codigo(), "sin-indicador-nativo");
        }
        assert!(!posible(None), "sin Kotlin (APK sin el parche) no hay indicador");
        assert!(!posible(leer("{roto").as_ref()));
        assert!(posible(Some(&kotlin(serde_json::json!({})))));
    }

    #[test]
    fn terminar_desde_la_notificacion_con_la_pagina_colgada() {
        // La página es un falso que nunca contesta: ni se la llama. Solo Kotlin (estado.json) y Rust.
        struct PaginaColgada;
        let _pagina = PaginaColgada;
        let mut c = Control::default();
        let e = kotlin(serde_json::json!({}));
        c.abrir(TOK, DE, "Mac", "controlar", 0, visible(Some(&e), "S1", 1_000_500)).unwrap();
        assert_eq!(sincronizar(&mut c, Some(&e), "S1", 1_001_000, 10), Cambio::Nada);
        assert!(c.orden(TOK, "leer-estado", 20, visible(Some(&e), "S1", 1_001_000)).is_ok());
        // La persona pulsa «Terminar» en la notificación: Kotlin quita el indicador y lo apunta.
        let fin = kotlin(serde_json::json!({ "mostrando": false, "t_ms": 1_002_000,
            "terminada": { "sesion": "S1", "motivo": "la-persona-desde-la-notificacion", "t_ms": 1_002_000 } }));
        assert_eq!(sincronizar(&mut c, Some(&fin), "S1", 1_002_100, 30), Cambio::Parar("la-persona-desde-la-notificacion".into()));
        assert!(c.activa().is_none());
        assert_eq!(c.orden(TOK, "colgar", 31, visible(Some(&fin), "S1", 1_002_100)).unwrap_err().codigo(), "parada-nativa");
        assert_eq!(c.ultima_parada.as_ref().unwrap().1, "la-persona-desde-la-notificacion");
    }

    #[test]
    fn descartar_la_notificacion_o_perder_el_latido_cierra_la_sesion() {
        let mut c = Control::default();
        c.abrir(TOK, DE, "Mac", "controlar", 0, true).unwrap();
        let descartada = kotlin(serde_json::json!({ "mostrando": false,
            "terminada": { "sesion": "S1", "motivo": "notificacion-descartada", "t_ms": 1 } }));
        assert_eq!(sincronizar(&mut c, Some(&descartada), "S1", 1_000_100, 1), Cambio::Parar("notificacion-descartada".into()));
        c.abrir(TOK, DE, "Mac", "controlar", 2, true).unwrap();
        let viejo = kotlin(serde_json::json!({}));
        assert_eq!(sincronizar(&mut c, Some(&viejo), "S1", 1_000_000 + LATIDO_MAX_MS + 1, 3), Cambio::Parar("sin-indicador".into()));
        c.abrir(TOK, DE, "Mac", "controlar", 4, true).unwrap();
        assert_eq!(sincronizar(&mut c, Some(&viejo), "OTRA", 1_000_100, 5), Cambio::Parar("sin-indicador".into()), "indicador de otra sesión");
        c.abrir(TOK, DE, "Mac", "controlar", 6, true).unwrap();
        let rara = kotlin(serde_json::json!({ "terminada": { "sesion": "S1", "motivo": "<script>", "t_ms": 1 } }));
        assert_eq!(sincronizar(&mut c, Some(&rara), "S1", 1_000_100, 7), Cambio::Parar("indicador-perdido".into()));
    }

    #[test]
    fn un_toque_local_pausa_y_reanudar_solo_desde_kotlin() {
        let mut c = Control::default();
        c.abrir(TOK, DE, "Mac", "controlar", 0, true).unwrap();
        let pausada = kotlin(serde_json::json!({ "pausada": true }));
        assert_eq!(sincronizar(&mut c, Some(&pausada), "S1", 1_000_100, 10), Cambio::Pausada);
        assert_eq!(c.orden(TOK, "colgar", 11, true).unwrap_err().codigo(), "pausa-local");
        let sigue = kotlin(serde_json::json!({}));
        assert_eq!(sincronizar(&mut c, Some(&sigue), "S1", 1_000_200, 20), Cambio::Reanudada);
        assert!(c.orden(TOK, "colgar", 21, true).is_ok());
    }

    #[test]
    fn la_peticion_es_json_de_una_linea() {
        let p = peticion(7, "mostrar", "S1", "Mac de Alex");
        let v: serde_json::Value = serde_json::from_str(&p).unwrap();
        assert_eq!(v["accion"], "mostrar");
        assert!(!p.contains('\n'));
    }
}
