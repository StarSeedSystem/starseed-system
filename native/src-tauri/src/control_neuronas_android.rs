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
    /// (CTL1117C · FALLO 1) Kotlin cree que la actividad está detrás (onPause/onStop) y qué medida de mantenimiento aplica al WebView
    /// mientras hay sesión (`ninguna`, `webview-activo`, …); `reanudos` = cuántas veces la aplicó. Solo diagnóstico.
    pub en_fondo: bool,
    pub fondo: String,
    pub reanudos: u32,
    pub sesion: Option<String>,
    /// Un toque local fuera de la pastilla pausó el control; «Reanudar» (notificación o pastilla) lo quita.
    pub pausada: bool,
    /// (CTL1117F) Diagnóstico de la pausa local: cuántas ha habido, por qué empezó la última, ms desde el último gesto propio al
    /// empezar (-1 = ninguno), por qué terminó la última, cuánto duró (o lleva), toques propios ignorados y ms desde el último cuadro (-1 = ninguno).
    pub pausas: u32,
    pub pausa_motivo: String,
    pub pausa_desde_gesto_ms: i64,
    pub reanuda_motivo: String,
    pub pausa_ms: u64,
    pub ignorados: u32,
    pub cuadro_ms: i64,
    pub terminada: Option<Terminada>,
    /// Lo que falta para poder enseñar el indicador, en palabras cortas («interruptor», «notificaciones», …).
    pub falta: Vec<String>,
    /// (IND1115F) Sesión del indicador cuya petición «mostrar» atendió Kotlin por última vez: así Rust no confunde
    /// el paso o el error de un intento anterior con los de este.
    pub intento: String,
    /// (IND1115F) Último paso de Kotlin en ese intento: peticion → arranque-servicio → servicio-recibido → aviso →
    /// primer-plano → superposicion → mostrando.
    pub paso: String,
    /// (IND1115F) Por qué se quedó en ese paso («primer-plano:securityexception», «superposicion:sin-permiso», …).
    pub error: String,
    /// (IND1115F) Hilo en el que Kotlin atendió la petición («main» si es el principal de Android).
    pub hilo: String,
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

/// (IND1115F) Lo que se supo al esperar el indicador de un intento.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Espera {
    pub visible: bool,
    pub tras_ms: u64,
    pub sin_estado: bool,
    pub falta: Vec<String>,
    pub paso: String,
    pub error: String,
    pub hilo_kotlin: String,
    /// Kotlin terminó el intento con este motivo (lista cerrada de `MOTIVOS`).
    pub terminada: Option<String>,
}

/// (IND1115F) Espera el latido del indicador de `sesion` sin tocar el reloj ni el disco (se les pasan: así se
/// prueba con falsos). Termina en cuanto el indicador está a la vista, Kotlin dice que no pudo, o se agota `max_ms`.
/// `dormir` NO debe ser el hilo que Kotlin necesita: ver `control_neuronas_abrir` (comando asíncrono en Android).
pub fn esperar<L, D, A>(sesion: &str, max_ms: u64, cada_ms: u64, mut leer: L, mut dormir: D, mut ahora_pared: A) -> Espera
where
    L: FnMut() -> Option<EstadoKotlin>,
    D: FnMut(u64),
    A: FnMut() -> u64,
{
    let mut transcurrido = 0u64;
    loop {
        let e = leer();
        let mio = e.as_ref().filter(|e| e.intento == sesion);
        let resumen = |visible: bool| Espera {
            visible,
            tras_ms: transcurrido,
            sin_estado: e.is_none(),
            falta: e.as_ref().map(|e| e.falta.clone()).unwrap_or_default(),
            paso: mio.map(|e| e.paso.clone()).filter(|p| !p.is_empty()).unwrap_or_else(|| "kotlin-no-atendio".into()),
            error: mio.map(|e| e.error.clone()).unwrap_or_default(),
            hilo_kotlin: mio.map(|e| e.hilo.clone()).unwrap_or_default(),
            terminada: terminada_para(e.as_ref(), sesion).map(String::from),
        };
        if visible(e.as_ref(), sesion, ahora_pared()) {
            return resumen(true);
        }
        if terminada_para(e.as_ref(), sesion).is_some() || mio.is_some_and(|e| !e.error.is_empty()) || transcurrido >= max_ms {
            return resumen(false);
        }
        dormir(cada_ms);
        transcurrido += cada_ms;
    }
}

/// Texto corto y seguro (minúsculas, sin espacios) para registro y respuesta.
pub fn limpio(s: &str, max: usize) -> String {
    s.chars().map(|c| c.to_ascii_lowercase()).map(|c| if c.is_ascii_alphanumeric() || matches!(c, '-' | ':' | '_' | '.') { c } else { '-' }).take(max).collect()
}

fn lista(v: &[String]) -> String {
    v.iter().map(|x| limpio(x, 24)).collect::<Vec<_>>().join(",")
}

/// (IND1115F) El detalle del rechazo: lo que se añade a «sin-indicador-nativo» (palabras sueltas `clave=valor`).
pub fn detalle_rechazo(e: &Espera) -> String {
    let mut d = format!("falta={} paso={}", lista(&e.falta), limpio(&e.paso, 24));
    if !e.error.is_empty() {
        d.push_str(&format!(" error={}", limpio(&e.error, 60)));
    }
    if let Some(m) = &e.terminada {
        d.push_str(&format!(" motivo={}", limpio(m, 40)));
    }
    d.push_str(&format!(" tras={}", e.tras_ms));
    d
}

/// (IND1115F) La línea nativa de cada intento: `control-indicador pedir=… hilo=… visible=si|no tras=…ms falta=[…] servicio=…`.
pub fn linea_diagnostico(pedir: &str, hilo_rust: &str, e: &Espera) -> String {
    let falta = e.falta.iter().map(|x| limpio(x, 24)).collect::<Vec<_>>().join(",");
    let mut l = format!(
        "pedir={} hilo={} visible={} tras={}ms falta=[{}] servicio={}",
        limpio(pedir, 16),
        limpio(hilo_rust, 32),
        if e.visible { "si" } else { "no" },
        e.tras_ms,
        falta,
        limpio(&e.paso, 24)
    );
    if !e.error.is_empty() {
        l.push_str(&format!(" error={}", limpio(&e.error, 60)));
    }
    if !e.hilo_kotlin.is_empty() {
        l.push_str(&format!(" kotlin={}", limpio(&e.hilo_kotlin, 24)));
    }
    if e.sin_estado {
        l.push_str(" estado=ausente");
    }
    l
}

/// Lo que falta, para el rechazo cuando ni siquiera se intentó (permisos): sin esperar nada.
pub fn espera_sin_permisos(e: Option<&EstadoKotlin>) -> Espera {
    let falta = match e {
        Some(e) if !e.falta.is_empty() => e.falta.clone(),
        Some(_) => vec!["indicador".into()],
        None => vec!["sin-parte-android".into()],
    };
    Espera { visible: false, tras_ms: 0, sin_estado: e.is_none(), falta, paso: "permisos".into(), ..Default::default() }
}

/// Lo que la página puede pedir a Kotlin con un botón (lista cerrada).
pub const PEDIDOS: [&str; 3] = ["interruptor", "notificaciones", "superposicion"];

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

    // ───────── IND1115F: la espera con falsos ─────────

    fn intento(o: serde_json::Value) -> EstadoKotlin {
        let mut base = serde_json::json!({ "intento": "S1", "paso": "primer-plano", "error": "", "hilo": "main", "mostrando": false, "sesion": null });
        for (k, v) in o.as_object().unwrap() {
            base[k] = v.clone();
        }
        kotlin(base)
    }

    /// Reloj y disco falsos: cada `dormir` avanza el reloj; `guion` da el estado que se lee en cada vuelta.
    fn correr(sesion: &str, max: u64, mut guion: impl FnMut(u64) -> Option<EstadoKotlin>) -> (Espera, u64) {
        let reloj = std::cell::Cell::new(1_000_000u64);
        let dormido = std::cell::Cell::new(0u64);
        let r = esperar(
            sesion,
            max,
            100,
            || guion(reloj.get() - 1_000_000),
            |ms| {
                reloj.set(reloj.get() + ms);
                dormido.set(dormido.get() + ms);
            },
            || reloj.get(),
        );
        (r, dormido.get())
    }

    #[test]
    fn la_espera_vuelve_en_cuanto_kotlin_enseña_el_indicador() {
        let (r, dormido) = correr("S1", 4_000, |t| Some(if t >= 300 { kotlin(serde_json::json!({ "t_ms": 1_000_300, "intento": "S1", "paso": "mostrando" })) } else { intento(serde_json::json!({})) }));
        assert!(r.visible);
        assert_eq!(r.tras_ms, 300);
        assert_eq!(dormido, 300, "no espera de más");
    }

    #[test]
    fn la_espera_no_se_agota_si_kotlin_ya_dijo_que_no_pudo_y_dice_por_que() {
        let (r, dormido) = correr("S1", 4_000, |t| Some(if t >= 200 { intento(serde_json::json!({ "error": "primer-plano:SecurityException" })) } else { intento(serde_json::json!({ "paso": "peticion" })) }));
        assert!(!r.visible);
        assert_eq!(dormido, 200, "vuelve en cuanto Kotlin dice el error, no a los 4 s");
        assert_eq!(r.error, "primer-plano:SecurityException");
        let d = detalle_rechazo(&r);
        assert!(d.contains("paso=primer-plano") && d.contains("error=primer-plano:securityexception") && d.contains("tras=200"), "{d}");
    }

    #[test]
    fn la_espera_distingue_que_kotlin_no_atendio_la_peticion_o_que_no_hay_estado() {
        // El estado es de OTRO intento: Kotlin no ha tocado esta petición (su hilo principal no corre).
        let (r, dormido) = correr("S2", 1_000, |_| Some(intento(serde_json::json!({ "intento": "S1", "error": "viejo" }))));
        assert_eq!((dormido, r.paso.as_str(), r.error.as_str()), (1_000, "kotlin-no-atendio", ""), "el error de un intento anterior no cuenta");
        let (r, _) = correr("S2", 300, |_| None);
        assert!(r.sin_estado && r.falta.is_empty());
        assert!(linea_diagnostico("mostrar", "t", &r).contains("estado=ausente"));
    }

    #[test]
    fn la_espera_termina_cuando_kotlin_apunta_terminada_y_el_indicador_no_se_da_por_visible() {
        let (r, _) = correr("S1", 4_000, |_| Some(intento(serde_json::json!({ "error": "", "terminada": { "sesion": "S1", "motivo": "no-se-pudo-mostrar", "t_ms": 1 } }))));
        assert!(!r.visible);
        assert_eq!(r.terminada.as_deref(), Some("no-se-pudo-mostrar"));
        assert!(detalle_rechazo(&r).contains("motivo=no-se-pudo-mostrar"));
    }

    #[test]
    fn el_hilo_que_espera_no_es_el_que_kotlin_necesita() {
        // `esperar` solo duerme con la función que se le pasa: si Kotlin necesitara el hilo que duerme, nunca
        // contestaría. Con un hilo aparte que escribe el estado a los 250 ms, la espera lo ve y vuelve visible.
        let compartido = std::sync::Arc::new(std::sync::Mutex::new(None::<EstadoKotlin>));
        let escritor = compartido.clone();
        let hilo_kotlin = std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(250));
            let ahora = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as u64;
            *escritor.lock().unwrap() = Some(kotlin(serde_json::json!({ "t_ms": ahora, "intento": "S1", "paso": "mostrando" })));
        });
        let r = esperar(
            "S1",
            4_000,
            20,
            || compartido.lock().unwrap().clone(),
            |ms| std::thread::sleep(std::time::Duration::from_millis(ms)),
            || std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as u64,
        );
        hilo_kotlin.join().unwrap();
        assert!(r.visible && r.tras_ms < 2_000);
    }

    #[test]
    fn sin_permisos_no_se_espera_y_el_detalle_dice_que_falta() {
        let e = kotlin(serde_json::json!({ "notificaciones": false, "superposicion": false, "falta": ["notificaciones", "superposicion"] }));
        let r = espera_sin_permisos(Some(&e));
        assert_eq!((r.tras_ms, r.paso.as_str()), (0, "permisos"));
        assert_eq!(detalle_rechazo(&r), "falta=notificaciones,superposicion paso=permisos tras=0");
        assert_eq!(espera_sin_permisos(None).falta, vec!["sin-parte-android".to_string()]);
        assert_eq!(espera_sin_permisos(Some(&kotlin(serde_json::json!({})))).falta, vec!["indicador".to_string()]);
    }

    #[test]
    fn la_linea_de_diagnostico_lleva_todo_y_nada_de_control() {
        let e = Espera { visible: false, tras_ms: 4_000, falta: vec!["superposicion".into()], paso: "primer-plano".into(), error: "superposicion:SinVista\n".into(), hilo_kotlin: "main".into(), ..Default::default() };
        let l = linea_diagnostico("mostrar", "tokio-rt-worker", &e);
        assert_eq!(l, "pedir=mostrar hilo=tokio-rt-worker visible=no tras=4000ms falta=[superposicion] servicio=primer-plano error=superposicion:sinvista- kotlin=main");
        assert!(!l.contains('\n'));
    }

    #[test]
    fn el_estado_viejo_de_kotlin_sin_los_campos_nuevos_se_sigue_leyendo() {
        let e = leer(r#"{"v":1,"t_ms":5,"encendido":true,"notificaciones":true,"superposicion":true,"falta":[]}"#).unwrap();
        assert!(posible(Some(&e)) && e.intento.is_empty() && e.paso.is_empty());
    }
}
