//! (CTL1123A) Lógica pura para el estado de Linux: parsea salidas de comandos sin E/S.

use serde::Serialize;

#[derive(Debug, Clone, Serialize, Default, PartialEq)]
pub struct Bateria {
    pub nivel: f64,
    pub cargando: bool,
}

#[derive(Debug, Clone, Serialize, Default, PartialEq)]
pub struct Red {
    pub wifi_encendido: bool,
    pub wifi_conectado: bool,
    pub wifi_ssid: Option<String>,
    pub bluetooth_encendido: bool,
}

pub fn parsear_pactl_volumen(salida: &str) -> Option<f64> {
    salida.split('%').next()?.split_whitespace().last()?.parse::<f64>().ok().map(|v| v / 100.0)
}

pub fn parsear_wpctl_volumen(salida: &str) -> (Option<f64>, Option<bool>) {
    let mut parts = salida.split_whitespace();
    let vol = parts.nth(1).and_then(|s| s.parse::<f64>().ok());
    let mute = if salida.contains("[MUTED]") { Some(true) } else { Some(false) };
    (vol, mute)
}

pub fn calcular_brillo(actual: &str, max: &str) -> Option<f64> {
    let a = actual.trim().parse::<f64>().ok()?;
    let m = max.trim().parse::<f64>().ok()?;
    (m > 0.0).then(|| (a / m).clamp(0.0, 1.0))
}

pub fn parsear_bateria(capacidad: &str, estado: &str) -> Option<Bateria> {
    let nivel = capacidad.trim().parse::<f64>().ok()? / 100.0;
    let cargando = estado.trim().to_lowercase() == "charging";
    Some(Bateria { nivel: nivel.clamp(0.0, 1.0), cargando })
}

pub fn parsear_nmcli_wifi(salida: &str) -> (bool, bool) {
    let parts: Vec<&str> = salida.trim().split(':').collect();
    let encendido = parts.get(0).map_or(false, |&s| s == "enabled");
    let conectado = parts.get(1).map_or(false, |&s| s == "connected");
    (encendido, conectado)
}

pub fn parsear_nmcli_ssid(salida: &str) -> Option<String> {
    salida.lines().find(|l| l.starts_with("yes:")).map(|l| l[4..].to_string())
}

pub fn parsear_pactl_silencio(salida: &str) -> Option<bool> {
    let s = salida.to_lowercase();
    if s.contains("yes") {
        Some(true)
    } else if s.contains("no") {
        Some(false)
    } else {
        None
    }
}

pub fn parsear_rfkill_bluetooth(salida: &str) -> bool {
    let mut visto_estado = false;
    for linea in salida.lines() {
        if linea.contains("Soft blocked: yes") || linea.contains("Hard blocked: yes") {
            return false;
        }
        if linea.contains("Soft blocked: no") || linea.contains("Hard blocked: no") {
            visto_estado = true;
        }
    }
    visto_estado
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pactl_volumen() {
        assert_eq!(parsear_pactl_volumen("Volume: front-left: 32768 /  50%"), Some(0.5));
    }

    #[test]
    fn test_pactl_silencio() {
        assert_eq!(parsear_pactl_silencio("Mute: no"), Some(false));
        assert_eq!(parsear_pactl_silencio("Mute: yes"), Some(true));
    }

    #[test]
    fn test_wpctl() {
        assert_eq!(parsear_wpctl_volumen("Volume: 0.50"), (Some(0.5), Some(false)));
        assert_eq!(parsear_wpctl_volumen("Volume: 0.85 [MUTED]"), (Some(0.85), Some(true)));
    }

    #[test]
    fn test_brillo() {
        assert_eq!(calcular_brillo("500", "1000"), Some(0.5));
    }

    #[test]
    fn test_bateria() {
        let b = parsear_bateria("85", "Charging").unwrap();
        assert_eq!(b.nivel, 0.85);
        assert!(b.cargando);
    }

    #[test]
    fn test_nmcli() {
        assert_eq!(parsear_nmcli_wifi("enabled:connected"), (true, true));
        assert_eq!(parsear_nmcli_ssid("yes:MiRed"), Some("MiRed".to_string()));
    }

    #[test]
    fn test_rfkill() {
        assert!(!parsear_rfkill_bluetooth(""));
        assert!(!parsear_rfkill_bluetooth("Soft blocked: yes"));
        assert!(parsear_rfkill_bluetooth("Soft blocked: no\nHard blocked: no"));
        assert!(parsear_rfkill_bluetooth("0: hci0: Bluetooth\n\tSoft blocked: no\n\tHard blocked: no"));
    }
}