//! CTL1117H · ajustes NATIVOS del aparato controlado (solo locales) y color público de neurona.
//!
//! · `indicador` = `punto` (por defecto) | `oculto`: el punto de la esquina es opcional; la NOTIFICACIÓN siempre está.
//! · `ver_toques` = `true` (por defecto) | `false`: la onda del color del controlador en cada toque remoto.
//! Solo la página principal los cambia (`control_ajustes_poner`); ninguna orden remota llega aquí. Se guardan por aparato en
//! `control-ajustes.json` y, en Android, Kotlin los vuelve a leer cuando Rust se lo pide (petición `ajustes`).
//! El color de una neurona es `#rrggbb` en minúsculas; el por defecto sale de su id (misma cuenta en `color-publico.ts`).

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Ajustes {
    pub indicador: String,
    pub ver_toques: bool,
}

impl Default for Ajustes {
    fn default() -> Self {
        Ajustes { indicador: "punto".into(), ver_toques: true }
    }
}

fn indicador_valido(s: &str) -> bool {
    matches!(s, "punto" | "oculto")
}

/// Lee el archivo (o nada): lo que no vale vuelve al valor por defecto, sin fallar.
pub fn leer(texto: &str) -> Ajustes {
    let mut a = Ajustes::default();
    if let Ok(v) = serde_json::from_str::<Value>(texto) {
        if let Some(i) = v.get("indicador").and_then(|x| x.as_str()).filter(|i| indicador_valido(i)) {
            a.indicador = i.to_string();
        }
        if let Some(t) = v.get("ver_toques").and_then(|x| x.as_bool()) {
            a.ver_toques = t;
        }
    }
    a
}

/// Aplica un cambio parcial de la página: un campo con valor inválido se rechaza entero (nada a medias).
pub fn aplicar(actual: &Ajustes, parcial: &Value) -> Result<Ajustes, &'static str> {
    let o = parcial.as_object().ok_or("forma")?;
    let mut a = actual.clone();
    for (k, v) in o {
        match k.as_str() {
            "indicador" => a.indicador = v.as_str().filter(|i| indicador_valido(i)).ok_or("indicador")?.to_string(),
            "ver_toques" => a.ver_toques = v.as_bool().ok_or("ver_toques")?,
            _ => return Err("campo"),
        }
    }
    Ok(a)
}

pub fn a_texto(a: &Ajustes) -> String {
    json!({ "indicador": a.indicador, "ver_toques": a.ver_toques }).to_string()
}

/// `^#[0-9a-f]{6}$`
pub fn color_valido(c: &str) -> bool {
    c.len() == 7 && c.starts_with('#') && c[1..].bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// El color que manda el controlador si vale; si falta o no vale, el por defecto de `id`.
pub fn color_o_defecto(color: Option<&str>, id: &str) -> String {
    match color {
        Some(c) if color_valido(c) => c.to_string(),
        _ => color_por_defecto(id),
    }
}

/// Tono = (suma de los bytes UTF-8 del id × 31 + longitud) mod 360 · saturación 70 % · luminosidad 55 %.
pub fn color_por_defecto(id: &str) -> String {
    let b = id.as_bytes();
    let suma: u64 = b.iter().map(|x| u64::from(*x)).sum();
    let h = ((suma * 31 + b.len() as u64) % 360) as f64;
    let (s, l) = (0.70_f64, 0.55_f64);
    let c = (1.0 - (2.0 * l - 1.0).abs()) * s;
    let x = c * (1.0 - ((h / 60.0) % 2.0 - 1.0).abs());
    let m = l - c / 2.0;
    let (r, g, bl) = match (h / 60.0).floor() as u32 {
        0 => (c, x, 0.0),
        1 => (x, c, 0.0),
        2 => (0.0, c, x),
        3 => (0.0, x, c),
        4 => (x, 0.0, c),
        _ => (c, 0.0, x),
    };
    let f = |v: f64| ((v + m) * 255.0).round() as u8;
    format!("#{:02x}{:02x}{:02x}", f(r), f(g), f(bl))
}

// ─────────────────────────── E/S y comandos ───────────────────────────

const ARCHIVO: &str = "control-ajustes.json";

#[cfg(target_os = "android")]
fn ruta(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    crate::control_neuronas_android::es::dir(app).map(|d| d.join("ajustes.json"))
}

#[cfg(not(target_os = "android"))]
fn ruta(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    use tauri::Manager;
    app.path().app_data_dir().ok().map(|d| d.join(ARCHIVO))
}

pub(crate) fn actuales(app: &tauri::AppHandle) -> Ajustes {
    ruta(app).and_then(|r| std::fs::read_to_string(r).ok()).map(|t| leer(&t)).unwrap_or_default()
}

/// Los ajustes del aparato controlado. En escritorio y sin archivo, los de fábrica.
#[tauri::command]
pub fn control_ajustes_leer(app: tauri::AppHandle, webview: tauri::Webview) -> Result<Value, String> {
    crate::control_neuronas::pagina_ok(&app, &webview)?;
    let a = actuales(&app);
    Ok(json!({ "indicador": a.indicador, "ver_toques": a.ver_toques }))
}

/// Cambia (parcialmente) los ajustes de ESTE aparato. Solo la página principal; nunca una orden remota.
#[tauri::command]
pub fn control_ajustes_poner(app: tauri::AppHandle, webview: tauri::Webview, parcial: Value) -> Result<Value, String> {
    crate::control_neuronas::pagina_ok(&app, &webview)?;
    let nuevo = aplicar(&actuales(&app), &parcial).map_err(|m| m.to_string())?;
    let r = ruta(&app).ok_or_else(|| "sin-carpeta".to_string())?;
    if let Some(d) = r.parent() {
        let _ = std::fs::create_dir_all(d);
    }
    let tmp = r.with_extension("tmp");
    std::fs::write(&tmp, a_texto(&nuevo)).and_then(|()| std::fs::rename(&tmp, &r)).map_err(|_| "sin-disco".to_string())?;
    #[cfg(target_os = "android")]
    let _ = crate::control_neuronas_android::es::pedir(&app, "ajustes", "", "");
    crate::control_neuronas::nota_ajustes(&app, &nuevo);
    Ok(json!({ "indicador": nuevo.indicador, "ver_toques": nuevo.ver_toques }))
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn el_color_por_defecto_es_determinista_y_fija_cinco_ids() {
        // Los MISMOS cinco que `color-publico.test.ts`: si una cuenta cambia, el otro lado se pone roja.
        for (id, c) in [("tableta", "#ddc23c"), ("mac-alex", "#dd3cd2"), ("neurona-1", "#3c9fdd"), ("b49724b6", "#3cddb2"), ("ñandú", "#5fdd3c")] {
            assert_eq!(color_por_defecto(id), c, "{id}");
            assert!(color_valido(c));
        }
    }

    #[test]
    fn el_color_del_controlador_se_valida_y_si_no_vale_se_usa_el_del_id() {
        assert_eq!(color_o_defecto(Some("#12abef"), "tableta"), "#12abef");
        for malo in ["#12ABEF", "12abef", "#12abe", "#12abefg", "rgb(1,2,3)", "", "#12abef;x", "<b>"] {
            assert_eq!(color_o_defecto(Some(malo), "tableta"), "#ddc23c", "{malo}");
        }
        assert_eq!(color_o_defecto(None, "tableta"), "#ddc23c");
    }

    #[test]
    fn los_ajustes_tienen_defecto_y_solo_aceptan_valores_validos() {
        assert_eq!(leer(""), Ajustes { indicador: "punto".into(), ver_toques: true });
        assert_eq!(leer("{\"indicador\":\"raro\",\"ver_toques\":\"si\"}"), Ajustes::default());
        let a = aplicar(&Ajustes::default(), &json!({ "indicador": "oculto" })).unwrap();
        assert_eq!(a, Ajustes { indicador: "oculto".into(), ver_toques: true });
        assert_eq!(leer(&a_texto(&a)), a);
        assert_eq!(aplicar(&a, &json!({ "ver_toques": false })).unwrap(), Ajustes { indicador: "oculto".into(), ver_toques: false });
        for malo in [json!({ "indicador": "grande" }), json!({ "ver_toques": 1 }), json!({ "color": "#000000" }), json!("punto"), json!({ "indicador": "punto", "x": 1 })] {
            assert!(aplicar(&a, &malo).is_err(), "{malo}");
        }
    }

    #[test]
    fn ninguna_orden_remota_puede_cambiarlos() {
        // Los dos comandos exigen la página principal y no cuelgan de `control_neuronas_orden` ni de la entrada firmada.
        let fuente = include_str!("control_ajustes.rs");
        assert_eq!(fuente.matches(concat!("pagina_", "ok(&app, &webview)?")).count(), 2);
        assert!(!include_str!("control_entrada_logica.rs").contains("ver_toques"));
    }
}
