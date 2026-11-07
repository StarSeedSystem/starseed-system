// ═══════════════════════════════════════════════════════════════════════════
// «Esta neurona»: lo que la app nativa sabe de sí misma (VER1107B, 2026-11-07).
// Contrato: architecture/centro-versiones-1105.md §8.
//
// Aquí vive la parte PURA (solo std + serde/serde_json, con pruebas): qué sistema es (OS, Café o
// Nexus) por su identificador, limpiar lo que dice el sistema operativo (nombres vacíos,
// «localhost», «Unknown»), el modelo de un Android a partir de fabricante + modelo, y el resultado de
// buscar una actualización SIN instalarla. El pegamento con Tauri (los comandos `info_neurona` y
// `buscar_actualizacion`) está en lib.rs.
//
// Regla: nada se inventa. Lo que el sistema no dice va como `None` y la web no lo enseña.
// ═══════════════════════════════════════════════════════════════════════════

use serde::Serialize;

/// Lo que devuelve `info_neurona`. Los nombres van en snake_case (así los lee la web:
/// `src/lib/nativa/info-neurona.ts`, interfaz `InfoNeuronaNativa`).
#[derive(Serialize, Clone, Debug, PartialEq, Default)]
pub struct InfoNeurona {
    /// Versión del binario nativo instalado (la de tauri.conf.json con la que se compiló).
    pub app_version: String,
    /// Nombre de la app («StarSeed OS», «StarSeed Café», «StarSeed Nexus»).
    pub app_nombre: String,
    /// Identificador del paquete (app.starseed.os / .cafe / .nexus).
    pub identificador: String,
    /// "os" | "cafe" | "nexus" | "desconocido".
    pub sistema: String,
    /// "macos" | "windows" | "linux" | "android" | "ios"…
    pub plataforma: String,
    /// Versión del sistema operativo, si el sistema la dice.
    pub so_version: Option<String>,
    /// Arquitectura: "aarch64", "x86_64"…
    pub arquitectura: String,
    /// Nombre del equipo (escritorio) si se puede leer.
    pub equipo: Option<String>,
    /// Modelo del aparato (Android: fabricante + modelo) si se puede leer.
    pub modelo: Option<String>,
    /// Versión de Tauri con la que se compiló la app.
    pub tauri_version: String,
    /// true en escritorio (macOS, Windows, Linux).
    pub escritorio: bool,
    /// true si esta app puede buscar e instalar su versión nueva sola (updater de escritorio).
    pub actualizador: bool,
}

/// Lo que devuelve `buscar_actualizacion`: solo BUSCA (no descarga ni instala nada).
#[derive(Serialize, Clone, Debug, PartialEq, Default)]
pub struct BusquedaActualizacion {
    /// Versión instalada (la que corre ahora).
    pub actual: String,
    /// Versión que ofrece el canal de esta app (`latest*.json`) si es más nueva; `None` si está al día.
    pub disponible: Option<String>,
    /// Notas de esa versión según el canal.
    pub notas: Option<String>,
    /// Fecha de publicación según el canal (`pub_date`, tal cual).
    pub fecha: Option<String>,
}

/// Qué sistema de StarSeed es por su identificador de paquete.
pub fn sistema_de_identificador(identificador: &str) -> &'static str {
    match identificador.trim().to_ascii_lowercase().as_str() {
        "app.starseed.os" => "os",
        "app.starseed.cafe" => "cafe",
        "app.starseed.nexus" => "nexus",
        _ => "desconocido",
    }
}

/// Limpia un texto del sistema: sin controles, recortado a 80 caracteres y sin los valores que no
/// dicen nada («localhost», «unknown», «(none)»…). `None` si no queda nada útil.
pub fn limpiar(texto: &str) -> Option<String> {
    let limpio: String = texto.chars().filter(|c| !c.is_control()).collect::<String>().trim().to_string();
    if limpio.is_empty() {
        return None;
    }
    let bajo = limpio.to_ascii_lowercase();
    if matches!(bajo.as_str(), "localhost" | "unknown" | "desconocido" | "(none)" | "none" | "null" | "undefined") {
        return None;
    }
    Some(limpio.chars().take(80).collect())
}

/// Fabricante + modelo de un Android («samsung» + «SM-X200» → «Samsung SM-X200»). Si el modelo ya
/// empieza por el fabricante («Pixel» de «Google Pixel 8» no, pero «Xiaomi 13» sí), no se repite.
/// Solo lo usa Android (en escritorio queda para las pruebas).
#[cfg_attr(not(target_os = "android"), allow(dead_code))]
pub fn componer_modelo(fabricante: Option<&str>, modelo: Option<&str>) -> Option<String> {
    let fab = fabricante.and_then(limpiar);
    let mo = modelo.and_then(limpiar);
    match (fab, mo) {
        (None, None) => None,
        (Some(f), None) => Some(capitalizar(&f)),
        (None, Some(m)) => Some(m),
        (Some(f), Some(m)) => {
            if m.to_lowercase().starts_with(&f.to_lowercase()) {
                Some(m)
            } else {
                Some(format!("{} {}", capitalizar(&f), m))
            }
        }
    }
}

#[cfg_attr(not(target_os = "android"), allow(dead_code))]
fn capitalizar(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        Some(p) => p.to_uppercase().collect::<String>() + c.as_str(),
        None => String::new(),
    }
}

/// La fecha de publicación del canal (`pub_date` de `latest*.json`), tal cual y limpia.
pub fn fecha_de_json(json: &serde_json::Value) -> Option<String> {
    json.get("pub_date").and_then(|v| v.as_str()).and_then(limpiar)
}

/// Resultado de una búsqueda: `encontrada` es (versión, notas, fecha) si el updater ofrece una.
/// Una «versión» vacía del canal cuenta como nada (no se anuncia lo que no se puede instalar).
pub fn busqueda(actual: &str, encontrada: Option<(String, Option<String>, Option<String>)>) -> BusquedaActualizacion {
    let actual = actual.trim().to_string();
    match encontrada {
        Some((version, notas, fecha)) => match limpiar(&version) {
            Some(v) => BusquedaActualizacion {
                actual,
                disponible: Some(v.trim_start_matches(['v', 'V']).to_string()),
                notas: notas.as_deref().map(str::trim).filter(|n| !n.is_empty()).map(|n| n.chars().take(4000).collect()),
                fecha: fecha.as_deref().and_then(limpiar),
            },
            None => BusquedaActualizacion { actual, ..Default::default() },
        },
        None => BusquedaActualizacion { actual, ..Default::default() },
    }
}

/// Lee una propiedad de Android (`getprop`). Mejor esfuerzo: `None` si no se puede.
#[cfg(target_os = "android")]
pub fn propiedad_android(nombre: &str) -> Option<String> {
    let salida = std::process::Command::new("getprop").arg(nombre).output().ok()?;
    if !salida.status.success() {
        return None;
    }
    limpiar(&String::from_utf8_lossy(&salida.stdout))
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn sistema_por_identificador() {
        assert_eq!(sistema_de_identificador("app.starseed.os"), "os");
        assert_eq!(sistema_de_identificador(" App.StarSeed.Cafe "), "cafe");
        assert_eq!(sistema_de_identificador("app.starseed.nexus"), "nexus");
        assert_eq!(sistema_de_identificador("com.otra.app"), "desconocido");
        assert_eq!(sistema_de_identificador(""), "desconocido");
    }

    #[test]
    fn limpiar_quita_lo_que_no_dice_nada() {
        assert_eq!(limpiar("  MacBook-de-Alex \n"), Some("MacBook-de-Alex".into()));
        assert_eq!(limpiar("localhost"), None);
        assert_eq!(limpiar("Unknown"), None);
        assert_eq!(limpiar("   "), None);
        assert_eq!(limpiar("a\u{0007}b"), Some("ab".into()));
        assert_eq!(limpiar(&"x".repeat(200)).map(|s| s.chars().count()), Some(80));
    }

    #[test]
    fn modelo_de_android() {
        assert_eq!(componer_modelo(Some("samsung"), Some("SM-X200")), Some("Samsung SM-X200".into()));
        assert_eq!(componer_modelo(Some("Xiaomi"), Some("Xiaomi 13")), Some("Xiaomi 13".into()));
        assert_eq!(componer_modelo(None, Some("Pixel 8")), Some("Pixel 8".into()));
        assert_eq!(componer_modelo(Some("google"), None), Some("Google".into()));
        assert_eq!(componer_modelo(Some("unknown"), Some("")), None);
        assert_eq!(componer_modelo(None, None), None);
    }

    #[test]
    fn fecha_del_canal() {
        let j = serde_json::json!({ "version": "0.6.0", "pub_date": "2026-11-08T10:00:00Z" });
        assert_eq!(fecha_de_json(&j), Some("2026-11-08T10:00:00Z".into()));
        assert_eq!(fecha_de_json(&serde_json::json!({ "version": "0.6.0" })), None);
        assert_eq!(fecha_de_json(&serde_json::json!({ "pub_date": 5 })), None);
    }

    #[test]
    fn busqueda_sin_y_con_version() {
        let al_dia = busqueda("0.5.0", None);
        assert_eq!(al_dia.actual, "0.5.0");
        assert_eq!(al_dia.disponible, None);
        assert_eq!(al_dia.notas, None);

        let nueva = busqueda(" 0.5.0 ", Some(("v0.6.0".into(), Some("  Notas \n".into()), Some("2026-11-08T10:00:00Z".into()))));
        assert_eq!(nueva.actual, "0.5.0");
        assert_eq!(nueva.disponible.as_deref(), Some("0.6.0"));
        assert_eq!(nueva.notas.as_deref(), Some("Notas"));
        assert_eq!(nueva.fecha.as_deref(), Some("2026-11-08T10:00:00Z"));

        // Un canal con la versión vacía no anuncia nada.
        assert_eq!(busqueda("0.5.0", Some(("  ".into(), None, None))).disponible, None);
    }

    #[test]
    fn se_serializa_con_los_nombres_que_lee_la_web() {
        let v = serde_json::to_value(busqueda("0.5.0", None)).unwrap();
        assert_eq!(v, serde_json::json!({ "actual": "0.5.0", "disponible": null, "notas": null, "fecha": null }));
        let i = serde_json::to_value(InfoNeurona::default()).unwrap();
        let mut claves: Vec<_> = i.as_object().unwrap().keys().cloned().collect();
        claves.sort();
        assert_eq!(
            claves,
            vec![
                "actualizador", "app_nombre", "app_version", "arquitectura", "equipo", "escritorio", "identificador", "modelo",
                "plataforma", "sistema", "so_version", "tauri_version"
            ]
        );
    }
}
