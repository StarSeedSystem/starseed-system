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
    salida
        .split('%')
        .next()?
        .split_whitespace()
        .last()?
        .parse::<f64>()
        .ok()
        .map(|v| v / 100.0)
}

pub fn parsear_wpctl_volumen(salida: &str) -> (Option<f64>, Option<bool>) {
    let mut parts = salida.split_whitespace();
    let vol = parts.nth(1).and_then(|s| s.parse::<f64>().ok());
    let mute = if salida.contains("[MUTED]") {
        Some(true)
    } else {
        Some(false)
    };
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
    Some(Bateria {
        nivel: nivel.clamp(0.0, 1.0),
        cargando,
    })
}

pub fn parsear_nmcli_wifi(salida: &str) -> (bool, bool) {
    let parts: Vec<&str> = salida.trim().split(':').collect();
    let encendido = parts.get(0).map_or(false, |&s| s == "enabled");
    let conectado = parts.get(1).map_or(false, |&s| s == "connected");
    (encendido, conectado)
}

pub fn parsear_nmcli_ssid(salida: &str) -> Option<String> {
    salida
        .lines()
        .find(|l| l.starts_with("yes:"))
        .map(|l| l[4..].to_string())
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

/// Métodos de control de brillo/energía que pueden usar D-Bus internamente.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum MetodoControl {
    Brightnessctl,
    Powerprofilesctl,
    Xrandr,
    Sysfs,
}

/// Detecta si una salida de error contiene un error D-Bus AccessDenied.
/// El error típico es: "GDBus.Error:org.freedesktop.DBus.Error.AccessDenied: Permission denied"
pub fn es_error_dbus_access_denied(salida_error: &str) -> bool {
    let s = salida_error.to_lowercase();
    s.contains("org.freedesktop.dbus.error.accessdenied")
        || s.contains("gdbus.error:org.freedesktop.dbus.error.accessdenied")
        || (s.contains("accessdenied") && s.contains("permission denied"))
}

/// Estado para recordar qué métodos han sido rechazados por AccessDenied.
/// Se usa para no reintentarlos y no mostrar avisos del sistema repetidos.
#[derive(Debug, Default)]
pub struct RechazosDbus {
    rechazados: std::collections::HashSet<MetodoControl>,
}

impl RechazosDbus {
    /// Marca un método como rechazado por AccessDenied.
    /// Devuelve `true` si es la primera vez que se rechaza (para loguear una vez).
    pub fn rechazar(&mut self, metodo: MetodoControl) -> bool {
        self.rechazados.insert(metodo)
    }

    /// Comprueba si un método ya fue rechazado.
    pub fn esta_rechazado(&self, metodo: MetodoControl) -> bool {
        self.rechazados.contains(&metodo)
    }

    /// Lista de métodos rechazados (para registro).
    pub fn lista_rechazados(&self) -> Vec<MetodoControl> {
        self.rechazados.iter().copied().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pactl_volumen() {
        assert_eq!(
            parsear_pactl_volumen("Volume: front-left: 32768 /  50%"),
            Some(0.5)
        );
    }

    #[test]
    fn test_pactl_silencio() {
        assert_eq!(parsear_pactl_silencio("Mute: no"), Some(false));
        assert_eq!(parsear_pactl_silencio("Mute: yes"), Some(true));
    }

    #[test]
    fn test_wpctl() {
        assert_eq!(
            parsear_wpctl_volumen("Volume: 0.50"),
            (Some(0.5), Some(false))
        );
        assert_eq!(
            parsear_wpctl_volumen("Volume: 0.85 [MUTED]"),
            (Some(0.85), Some(true))
        );
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
        assert!(parsear_rfkill_bluetooth(
            "Soft blocked: no\nHard blocked: no"
        ));
        assert!(parsear_rfkill_bluetooth(
            "0: hci0: Bluetooth\n\tSoft blocked: no\n\tHard blocked: no"
        ));
    }

    #[test]
    fn test_es_error_dbus_access_denied() {
        assert!(es_error_dbus_access_denied(
            "GDBus.Error:org.freedesktop.DBus.Error.AccessDenied: Permission denied"
        ));
        assert!(es_error_dbus_access_denied(
            "gdbus.error:org.freedesktop.dbus.error.accessdenied: permission denied"
        ));
        assert!(es_error_dbus_access_denied(
            "Error: org.freedesktop.DBus.Error.AccessDenied"
        ));
        assert!(es_error_dbus_access_denied(
            "accessdenied: permission denied"
        ));
        assert!(!es_error_dbus_access_denied(
            "GDBus.Error:org.freedesktop.DBus.Error.ServiceUnknown"
        ));
        assert!(!es_error_dbus_access_denied("Error: command not found"));
        assert!(!es_error_dbus_access_denied(""));
    }

    #[test]
    fn test_rechazos_dbus() {
        let mut rechazos = RechazosDbus::default();
        assert!(!rechazos.esta_rechazado(MetodoControl::Brightnessctl));
        assert!(rechazos.rechazar(MetodoControl::Brightnessctl));
        assert!(rechazos.esta_rechazado(MetodoControl::Brightnessctl));
        assert!(!rechazos.rechazar(MetodoControl::Brightnessctl));
        assert_eq!(
            rechazos.lista_rechazados(),
            vec![MetodoControl::Brightnessctl]
        );
        rechazos.rechazar(MetodoControl::Powerprofilesctl);
        let lista = rechazos.lista_rechazados();
        assert_eq!(lista.len(), 2);
        assert!(lista.contains(&MetodoControl::Brightnessctl));
        assert!(lista.contains(&MetodoControl::Powerprofilesctl));
    }
}
