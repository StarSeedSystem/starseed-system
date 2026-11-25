// ═══════════════════════════════════════════════════════════════════════════
// energia — estado de energía del aparato para la web (EFI1119B · 2026-11-19).
// ---------------------------------------------------------------------------
// La web decide el modo «auto» de rendimiento con `src/lib/perf/modo-rendimiento.ts`
// (`decidirModoAuto`): batería, ahorro del sistema, gama del aparato, temperatura
// y tareas pesadas. Aquí se mide el estado que la web no puede medir sola:
//   · macOS:   `pmset -g batt` (nivel y carga) y el modo de bajo consumo;
//   · Android: `/sys/class/power_supply` (nivel, carga) y el ahorro del sistema;
//   · Linux:   power-profiles-daemon/UPower si existen y `/sys/class/power_supply`;
//   · Windows: `powercfg /getactivescheme` (Plan de ahorro) y Win32_Battery.
//   · web:     Battery API, cuando existe (lo hace `device-tier.ts`, no Rust).
//
// SOLO LEE: no cambia ningún ajuste de la persona (regla pétrea de Alex). Si un
// dato no se puede medir, va `None`/`false`; nunca se inventa. El pegamento Tauri
// es este mismo archivo; lo puro se prueba abajo sin tocar el sistema.
// ═══════════════════════════════════════════════════════════════════════════

#![allow(dead_code)]

use serde::Serialize;
use std::process::Command;

/// Lo que la web recibe de `energia_estado` (camelCase, como `EstadoEnergia` en TS).
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EstadoEnergia {
    pub sistema: &'static str,
    pub bateria_pct: Option<u8>,
    pub cargando: Option<bool>,
    pub ahorro_sistema: bool,
    pub modo_bajo_consumo: bool,
    pub perfil_energia: Option<String>,
    pub temperatura_c: Option<f32>,
    pub fuente: String,
    /// CAP1125D · Linux: `Some(true)` si ningún conector está conectado.
    /// Ausente = se desconoce (se actúa como siempre).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sin_pantalla: Option<bool>,
}

impl EstadoEnergia {
    fn vacio(sistema: &'static str, fuente: &str) -> Self {
        EstadoEnergia {
            sistema,
            bateria_pct: None,
            cargando: None,
            ahorro_sistema: false,
            modo_bajo_consumo: false,
            perfil_energia: None,
            temperatura_c: None,
            fuente: fuente.to_string(),
            sin_pantalla: None,
        }
    }
}

/// Comando de la web: `invoke("energia_estado")`.
#[tauri::command]
pub fn energia_estado() -> EstadoEnergia {
    estado_actual()
}

/// Estado del sistema en el que corre la app.
pub fn estado_actual() -> EstadoEnergia {
    #[cfg(target_os = "macos")]
    {
        return estado_macos();
    }
    #[cfg(target_os = "android")]
    {
        return estado_android();
    }
    #[cfg(target_os = "linux")]
    {
        return estado_linux();
    }
    #[cfg(target_os = "windows")]
    {
        return estado_windows();
    }
    #[allow(unreachable_code)]
    EstadoEnergia::vacio("desconocido", "sin-medida")
}

fn comando(programa: &str, args: &[&str]) -> Option<String> {
    let salida = Command::new(programa).args(args).output().ok()?;
    if !salida.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&salida.stdout).to_string())
}

// ───────────────────────────── Lecturas comunes ─────────────────────────────

/// Porcentaje de una línea como «85%» o el contenido de `capacity`.
fn parse_porcentaje(texto: &str) -> Option<u8> {
    let limpio = texto.trim();
    let numero = if let Some(pos) = limpio.find('%') {
        &limpio[..pos]
    } else {
        limpio
    };
    numero
        .trim()
        .parse::<f32>()
        .ok()
        .map(|n| n.round().clamp(0.0, 100.0) as u8)
}

/// `charging` / `discharging` / `full` / `not charging` del kernel o de UPower.
fn parse_estado_carga(texto: &str) -> Option<bool> {
    let t = texto.trim().to_lowercase();
    if t.contains("discharg") || t.contains("not charging") {
        Some(false)
    } else if t.contains("charg") || t.contains("full") {
        Some(true)
    } else {
        None
    }
}

/// Miligrados del kernel (`45000`) o grados ya hechos (`45.0`) → °C.
fn parse_mili_celsius(texto: &str) -> Option<f32> {
    let n = texto.trim().parse::<f32>().ok()?;
    let c = if n.abs() > 1_000.0 { n / 1_000.0 } else { n };
    if (-40.0..=150.0).contains(&c) {
        Some(c)
    } else {
        None
    }
}

// ───────────────────────────── macOS ─────────────────────────────

/// `pmset -g batt` → (nivel, cargando). Ejemplo:
/// `-InternalBattery-0 (id=…)	85%; discharging; 5:12 remaining present: true`
fn parse_batt_macos(texto: &str) -> (Option<u8>, Option<bool>) {
    let nivel = texto.split_whitespace().find_map(|p| {
        if p.contains('%') {
            parse_porcentaje(p)
        } else {
            None
        }
    });
    let t = texto.to_lowercase();
    let cargando = if t.contains("discharging") || t.contains("not charging") {
        Some(false)
    } else if t.contains("charging") || t.contains("charged") || t.contains("ac attached") {
        Some(true)
    } else {
        None
    };
    (nivel, cargando)
}

/// `pmset -g custom` / `pmset -g` → ¿modo de bajo consumo activo?
fn parse_bajo_consumo_macos(texto: &str) -> bool {
    texto.lines().any(|linea| {
        let t = linea.to_lowercase();
        t.contains("lowpowermode")
            && t.split_whitespace()
                .last()
                .map(|v| v != "0")
                .unwrap_or(false)
    })
}

fn estado_macos() -> EstadoEnergia {
    let batt = comando("pmset", &["-g", "batt"]);
    let (bateria_pct, cargando) = batt
        .as_deref()
        .map(parse_batt_macos)
        .unwrap_or((None, None));
    let bajo = comando("pmset", &["-g", "custom"])
        .or_else(|| comando("pmset", &["-g"]))
        .map(|t| parse_bajo_consumo_macos(&t))
        .unwrap_or(false);
    EstadoEnergia {
        bateria_pct,
        cargando,
        modo_bajo_consumo: bajo,
        ..EstadoEnergia::vacio("macos", "pmset")
    }
}

// ───────────────────────────── Linux y Android ─────────────────────────────

/// `/sys/class/power_supply/BAT*` → (nivel, cargando). Funciona igual en Android.
fn leer_bateria_sysfs() -> (Option<u8>, Option<bool>) {
    let Ok(entradas) = std::fs::read_dir("/sys/class/power_supply") else {
        return (None, None);
    };
    let mut nivel = None;
    let mut cargando = None;
    for entrada in entradas.flatten() {
        let nombre = entrada.file_name().to_string_lossy().to_uppercase();
        if !nombre.starts_with("BAT") {
            continue;
        }
        let dir = entrada.path();
        if nivel.is_none() {
            nivel = std::fs::read_to_string(dir.join("capacity"))
                .ok()
                .and_then(|t| parse_porcentaje(&t));
        }
        if cargando.is_none() {
            cargando = std::fs::read_to_string(dir.join("status"))
                .ok()
                .and_then(|t| parse_estado_carga(&t));
        }
    }
    (nivel, cargando)
}

/// `/sys/class/thermal/thermal_zone*/temp`: el mayor de los sensores válidos.
fn leer_temperatura_sysfs() -> Option<f32> {
    let entradas = std::fs::read_dir("/sys/class/thermal").ok()?;
    let mut mayor: Option<f32> = None;
    for entrada in entradas.flatten() {
        let nombre = entrada.file_name().to_string_lossy().to_string();
        if !nombre.starts_with("thermal_zone") {
            continue;
        }
        if let Some(c) = std::fs::read_to_string(entrada.path().join("temp"))
            .ok()
            .and_then(|t| parse_mili_celsius(&t))
        {
            mayor = Some(mayor.map_or(c, |m| m.max(c)));
        }
    }
    mayor
}

/// power-profiles-daemon → el nombre que entiende la web.
fn parse_perfil_linux(texto: &str) -> Option<String> {
    let t = texto.trim().to_lowercase();
    let perfil = if t.contains("power-saver") || t.contains("power saver") {
        "ahorro"
    } else if t.contains("performance") || t.contains("rendimiento") {
        "rendimiento"
    } else if t.contains("balanced") || t.contains("equilibrado") {
        "equilibrado"
    } else {
        return None;
    };
    Some(perfil.to_string())
}

/// `upower -i …` → (nivel, cargando) cuando no hay sysfs utilizable.
fn parse_upower(texto: &str) -> (Option<u8>, Option<bool>) {
    let mut nivel = None;
    let mut cargando = None;
    for linea in texto.lines() {
        let t = linea.trim().to_lowercase();
        if let Some(resto) = t.strip_prefix("percentage:") {
            nivel = parse_porcentaje(resto);
        } else if let Some(resto) = t.strip_prefix("state:") {
            cargando = parse_estado_carga(resto);
        }
    }
    (nivel, cargando)
}

/// CAP1125D · aviso de pantalla física que mantiene `arranque_linux` cada 30 s.
fn sin_pantalla_linux() -> Option<bool> {
    #[cfg(target_os = "linux")]
    {
        crate::arranque_linux::sin_pantalla_actual()
    }
    #[cfg(not(target_os = "linux"))]
    {
        None
    }
}

fn estado_linux() -> EstadoEnergia {
    let mut estado = EstadoEnergia::vacio("linux", "sysfs");
    estado.sin_pantalla = sin_pantalla_linux();
    let (mut nivel, mut cargando) = leer_bateria_sysfs();
    if nivel.is_none() || cargando.is_none() {
        if let Some(texto) = comando("upower", &["-i"]) {
            let (n, c) = parse_upower(&texto);
            nivel = nivel.or(n);
            cargando = cargando.or(c);
            estado.fuente = "upower".to_string();
        }
    }
    estado.bateria_pct = nivel;
    estado.cargando = cargando;
    estado.temperatura_c = leer_temperatura_sysfs();
    if let Some(texto) = comando("powerprofilesctl", &["get"]) {
        estado.perfil_energia = parse_perfil_linux(&texto);
        estado.ahorro_sistema = estado.perfil_energia.as_deref() == Some("ahorro");
        estado.fuente = "power-profiles-daemon".to_string();
    }
    estado
}

fn estado_android() -> EstadoEnergia {
    let (bateria_pct, cargando) = leer_bateria_sysfs();
    let ahorro = comando("settings", &["get", "global", "low_power"])
        .map(|t| t.trim() == "1")
        .unwrap_or(false)
        || comando("cmd", &["power", "get-battery-saver"])
            .map(|t| t.trim().eq_ignore_ascii_case("true"))
            .unwrap_or(false);
    EstadoEnergia {
        bateria_pct,
        cargando,
        ahorro_sistema: ahorro,
        temperatura_c: leer_temperatura_sysfs(),
        ..EstadoEnergia::vacio("android", "sysfs")
    }
}

// ───────────────────────────── Windows ─────────────────────────────

/// GUID del plan «Economizador» (Power saver) de Windows.
const PLAN_AHORRO_WINDOWS: &str = "a1841308-3541-4fab-bc81-f71556f20b4a";

/// `powercfg /getactivescheme` → ¿está activo el ahorro de energía?
fn parse_ahorro_windows(texto: &str) -> bool {
    let t = texto.to_lowercase();
    t.contains(PLAN_AHORRO_WINDOWS) || t.contains("power saver") || t.contains("economizador")
}

/// `Win32_Battery` por PowerShell → «nivel|estado» (estado 6/7/8 = cargando).
fn parse_bateria_windows(texto: &str) -> (Option<u8>, Option<bool>) {
    let mut partes = texto.trim().split('|');
    let nivel = partes.next().and_then(parse_porcentaje);
    let cargando = partes
        .next()
        .and_then(|e| e.trim().parse::<u8>().ok())
        .map(|e| {
            // 6 = descargando, 7 = sin batería, 8 = cargando, 9 = llena.
            matches!(e, 8 | 9)
        });
    (nivel, cargando)
}

fn estado_windows() -> EstadoEnergia {
    let ahorro = comando("powercfg", &["/getactivescheme"])
        .map(|t| parse_ahorro_windows(&t))
        .unwrap_or(false);
    let guion = "$b=Get-CimInstance Win32_Battery | Select-Object -First 1; \
                 if($b){ \"$($b.EstimatedChargeRemaining)|$($b.BatteryStatus)\" }";
    let (bateria_pct, cargando) = comando("powershell", &["-NoProfile", "-Command", guion])
        .map(|t| parse_bateria_windows(&t))
        .unwrap_or((None, None));
    EstadoEnergia {
        bateria_pct,
        cargando,
        ahorro_sistema: ahorro,
        ..EstadoEnergia::vacio("windows", "powercfg")
    }
}

// ───────────────────────────── Pruebas puras ─────────────────────────────

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn macos_bateria_descargando() {
        let (n, c) = parse_batt_macos(
            "-InternalBattery-0 (id=1)\t15%; discharging; 2:00 remaining present: true",
        );
        assert_eq!(n, Some(15));
        assert_eq!(c, Some(false));
    }

    #[test]
    fn macos_bateria_cargando_y_llena() {
        assert_eq!(
            parse_batt_macos("100%; charged; 0:00 remaining present: true").1,
            Some(true)
        );
        assert_eq!(
            parse_batt_macos("84%; charging; 0:35 remaining present: true").1,
            Some(true)
        );
        assert_eq!(
            parse_batt_macos("84%; AC attached; not charging present: true").1,
            Some(false)
        );
    }

    #[test]
    fn macos_bajo_consumo() {
        assert!(parse_bajo_consumo_macos(
            "Battery Power:\n lowpowermode         1\n"
        ));
        assert!(!parse_bajo_consumo_macos(
            "Battery Power:\n lowpowermode         0\n"
        ));
        assert!(!parse_bajo_consumo_macos("AC Power:\n"));
    }

    #[test]
    fn android_y_linux_estados_de_carga() {
        assert_eq!(parse_estado_carga("Charging"), Some(true));
        assert_eq!(parse_estado_carga("Discharging"), Some(false));
        assert_eq!(parse_estado_carga("Not charging"), Some(false));
        assert_eq!(parse_estado_carga("Full"), Some(true));
        assert_eq!(parse_estado_carga("desconocido"), None);
    }

    #[test]
    fn porcentaje_y_temperatura() {
        assert_eq!(parse_porcentaje("85%"), Some(85));
        assert_eq!(parse_porcentaje(" 42 "), Some(42));
        assert_eq!(parse_porcentaje("n/a"), None);
        assert_eq!(parse_mili_celsius("45000"), Some(45.0));
        assert_eq!(parse_mili_celsius("45.5"), Some(45.5));
        assert_eq!(parse_mili_celsius("900000"), None);
    }

    #[test]
    fn linux_perfil_de_energia() {
        assert_eq!(
            parse_perfil_linux("power-saver\n").as_deref(),
            Some("ahorro")
        );
        assert_eq!(
            parse_perfil_linux("balanced").as_deref(),
            Some("equilibrado")
        );
        assert_eq!(
            parse_perfil_linux("performance").as_deref(),
            Some("rendimiento")
        );
        assert_eq!(parse_perfil_linux("otro"), None);
    }

    #[test]
    fn upower_nivel_y_carga() {
        let (n, c) = parse_upower("  percentage:  66%\n  state:  discharging\n");
        assert_eq!(n, Some(66));
        assert_eq!(c, Some(false));
    }

    #[test]
    fn windows_ahorro_y_bateria() {
        assert!(parse_ahorro_windows(
            "Power Scheme GUID: a1841308-3541-4fab-bc81-f71556f20b4a  (Power saver)"
        ));
        assert!(parse_ahorro_windows("Power Scheme GUID: x  (Economizador)"));
        assert!(!parse_ahorro_windows(
            "Power Scheme GUID: 381b4222-f694-41f0-9685-ff5bb260df2e  (Balanced)"
        ));
        let (n, c) = parse_bateria_windows("55|8");
        assert_eq!(n, Some(55));
        assert_eq!(c, Some(true));
        assert_eq!(parse_bateria_windows("55|6").1, Some(false));
    }
}
