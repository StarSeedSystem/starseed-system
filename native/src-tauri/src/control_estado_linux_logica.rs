//! (CTL1123A · LNX1124A) Lógica pura para el estado de Linux: parsea salidas de comandos sin E/S.
//!
//! LNX1124A: el gestor de energía de Xfce puede contestar «AccessDenied» por D-Bus. La vía de
//! brillo prefiere lo que no pide privilegios (`xrandr` → `brightnessctl` → sysfs) y un rechazo
//! de permiso se anota UNA sola vez; después no se reintenta y no se enseña nada al sistema.

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

// ─────────────── (LNX1124A) Energía: vía sin D-Bus y rechazo de una vez ───────────────

/// Evento del registro encadenado cuando el gestor de energía rechaza la vía por D-Bus.
pub const EVENTO_ENERGIA: &str = "energia-sin-permiso";

/// Vía de brillo ordenada por privilegios: `xrandr` no pide ninguno; `brightnessctl` y el
/// sysfs pueden exigir reglas de udev o permiso de escritura.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ViaBrillo {
    Xrandr,
    Brightnessctl,
    Sysfs,
}

impl ViaBrillo {
    /// Nombre estable para el registro (sin espacios).
    pub fn nombre(self) -> &'static str {
        match self {
            ViaBrillo::Xrandr => "xrandr",
            ViaBrillo::Brightnessctl => "brightnessctl",
            ViaBrillo::Sysfs => "sysfs",
        }
    }
}

/// La vía que menos privilegios pide, o `None` si no hay ninguna disponible.
pub fn via_brillo(xrandr: bool, brightnessctl: bool, sysfs: bool) -> Option<ViaBrillo> {
    if xrandr {
        Some(ViaBrillo::Xrandr)
    } else if brightnessctl {
        Some(ViaBrillo::Brightnessctl)
    } else if sysfs {
        Some(ViaBrillo::Sysfs)
    } else {
        None
    }
}

/// ¿El error del gestor de energía es un rechazo de permiso (D-Bus de logind/UPower)?
pub fn es_rechazo_de_permiso(error: &str) -> bool {
    let e = error.to_lowercase();
    e.contains("org.freedesktop.dbus.error.accessdenied")
        || e.contains("access denied")
        || e.contains("permission denied")
        || e.contains("not authorized")
        || e.contains("no autorizado")
}

/// Motivo estable y corto para el registro (nunca el mensaje entero).
pub fn motivo_rechazo(error: &str) -> &'static str {
    let e = error.to_lowercase();
    if e.contains("accessdenied") || e.contains("access denied") {
        "access-denied"
    } else if e.contains("permission denied") {
        "permission-denied"
    } else if e.contains("not authorized") || e.contains("no autorizado") {
        "not-authorized"
    } else {
        "sin-permiso"
    }
}

/// Una línea de registro, sin saltos ni contenido de la persona.
pub fn linea_rechazo_energia(error: &str) -> String {
    format!("energia=sin-permiso via=sin-dbus reintento=no motivo={}", motivo_rechazo(error))
}

/// Qué hacer con un error del gestor de energía. Se decide UNA vez por proceso.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RechazoEnergia {
    /// No es un rechazo de permiso: la vía normal sigue.
    NoEsPermiso,
    /// Primer rechazo: esta es la única línea que se escribe.
    Primera(String),
    /// Ya se anotó antes en este proceso: ni línea ni reintento.
    Repetido,
}

/// Guardia de un solo intento. No hace E/S: la línea la escribe quien llama.
#[derive(Debug, Default)]
pub struct GuardiaEnergia {
    rechazado: bool,
}

impl GuardiaEnergia {
    pub const fn nueva() -> Self {
        Self { rechazado: false }
    }

    /// Registra el error. Tras el primer rechazo de permiso, `permite_reintento` es `false`.
    pub fn registrar(&mut self, error: &str) -> RechazoEnergia {
        if !es_rechazo_de_permiso(error) {
            return RechazoEnergia::NoEsPermiso;
        }
        if self.rechazado {
            return RechazoEnergia::Repetido;
        }
        self.rechazado = true;
        RechazoEnergia::Primera(linea_rechazo_energia(error))
    }

    /// Solo la vía D-Bus de energía queda apagada; nada más cambia.
    pub fn permite_reintento(&self) -> bool {
        !self.rechazado
    }

    /// ¿Ya se rechazó (y anotó) en este proceso?
    pub fn rechazada(&self) -> bool {
        self.rechazado
    }
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

    // ─────────── (LNX1124A) Energía sin D-Bus y rechazo de una sola vez ───────────

    #[test]
    fn lnx1124a_reconoce_el_rechazo_de_permiso() {
        assert!(es_rechazo_de_permiso(
            "GDBus.Error:org.freedesktop.DBus.Error.AccessDenied: Permission denied"
        ));
        assert!(es_rechazo_de_permiso("Permission denied"));
        assert!(es_rechazo_de_permiso("Access Denied"));
        assert!(es_rechazo_de_permiso("Not authorized"));
        assert!(!es_rechazo_de_permiso("org.freedesktop.DBus.Error.ServiceUnknown"));
        assert!(!es_rechazo_de_permiso(""));
    }

    #[test]
    fn lnx1124a_el_rechazo_se_anota_una_sola_vez() {
        let mut g = GuardiaEnergia::nueva();
        assert!(g.permite_reintento());
        assert!(!g.rechazada());
        match g.registrar("org.freedesktop.DBus.Error.AccessDenied: Permission denied") {
            RechazoEnergia::Primera(l) => assert_eq!(
                l,
                "energia=sin-permiso via=sin-dbus reintento=no motivo=access-denied"
            ),
            otro => panic!("se esperaba el primer rechazo, llegó {otro:?}"),
        }
        assert!(!g.permite_reintento());
        assert!(g.rechazada());
        assert_eq!(
            g.registrar("org.freedesktop.DBus.Error.AccessDenied: Permission denied"),
            RechazoEnergia::Repetido
        );
    }

    #[test]
    fn lnx1124a_un_error_ajeno_no_apaga_la_via() {
        let mut g = GuardiaEnergia::nueva();
        assert_eq!(
            g.registrar("org.freedesktop.DBus.Error.ServiceUnknown"),
            RechazoEnergia::NoEsPermiso
        );
        assert!(g.permite_reintento());
        assert!(!g.rechazada());
    }

    #[test]
    fn lnx1124a_la_linea_no_lleva_saltos_ni_contenido() {
        let l = linea_rechazo_energia("AccessDenied\n/home/alguien/privado.txt");
        assert!(!l.contains('\n'));
        assert!(!l.contains("alguien"));
        assert!(l.len() < 120, "{l}");
        assert_eq!(motivo_rechazo("Permission denied"), "permission-denied");
    }

    #[test]
    fn lnx1124a_via_brillo_prefiere_lo_que_no_pide_privilegios() {
        assert_eq!(via_brillo(true, true, true), Some(ViaBrillo::Xrandr));
        assert_eq!(via_brillo(false, true, true), Some(ViaBrillo::Brightnessctl));
        assert_eq!(via_brillo(false, false, true), Some(ViaBrillo::Sysfs));
        assert_eq!(via_brillo(false, false, false), None);
        assert_eq!(ViaBrillo::Xrandr.nombre(), "xrandr");
    }
}