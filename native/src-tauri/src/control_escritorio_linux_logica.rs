//! (CTL1118L) Control entre mis neuronas · un Linux de escritorio (X11) como aparato CONTROLADO: la lógica pura (sin X11,
//! sin GTK, sin enigo, sin D-Bus y sin reloj real), para que se pruebe en cualquier sistema. Lo que toca el sistema está en
//! `control_entrada_linux.rs`, `control_pantalla_linux.rs`, `control_neuronas_linux.rs` y `control_vigia_linux.rs`.
//!
//! Reutiliza de macOS lo que es puro y común (`control_entrada_macos_logica`: alcance, gestos → ratón, texto → pulsaciones,
//! archivo de aceptados) y añade lo propio de Linux:
//!   · Qué es «una sesión gráfica con la que se puede trabajar»: SOLO X11. En Wayland se dice `wayland` y no se intenta nada.
//!   · Qué protege `protegido` en Linux (por la clase de la ventana al frente) y qué NO puede proteger.
//!   · Las teclas de escritorio y el texto del diálogo nativo de aceptar.
//!   · Qué dispositivo de entrada es PROPIO (el de XTEST con el que inyectamos) y cuál es una mano de verdad.
//!   · El bloqueo del aparato (logind `LockedHint`, salvapantallas de Xfce/XScreenSaver) leído de lo que dicen esos programas.

#![cfg_attr(not(target_os = "linux"), allow(dead_code))] // la usa Linux; en el resto solo se prueba

use crate::control_entrada_macos_logica as m;
use crate::control_estado_linux_logica::{MetodoControl, RechazosDbus};
use serde_json::{json, Value};

// ─────────────────────────── Sesión gráfica ───────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Grafica {
    /// X11 con `DISPLAY`: lo único que este módulo sabe manejar.
    X11,
    /// Wayland (por `WAYLAND_DISPLAY` o `XDG_SESSION_TYPE=wayland`): se contesta sin-soporte y no se toca nada.
    Wayland,
    /// Ni `DISPLAY` ni Wayland (sesión sin pantalla, ssh, servicio).
    SinPantalla,
}

fn lleno(v: Option<&str>) -> bool {
    v.is_some_and(|s| !s.trim().is_empty())
}

/// De las variables de entorno → qué hay. Wayland manda sobre `DISPLAY`: bajo Wayland suele haber un `DISPLAY` de XWayland
/// que solo ve las apps X11 (no el escritorio), y capturar o inyectar ahí daría un control engañoso.
pub fn grafica_de(
    wayland_display: Option<&str>,
    xdg_session_type: Option<&str>,
    display: Option<&str>,
) -> Grafica {
    if lleno(wayland_display)
        || xdg_session_type.is_some_and(|t| t.trim().eq_ignore_ascii_case("wayland"))
    {
        return Grafica::Wayland;
    }
    if lleno(display) {
        Grafica::X11
    } else {
        Grafica::SinPantalla
    }
}

pub const FALTA_WAYLAND: &str = "wayland";
pub const FALTA_X11: &str = "sin-pantalla-x11";
pub const FALTA_ENTRADA: &str = "entrada-x11";

/// Lo que falta para ver la pantalla (nada que la persona arregle en Ajustes: es la sesión o el servidor gráfico).
pub fn falta_pantalla(g: Grafica, conecta_x11: bool) -> Option<&'static str> {
    match g {
        Grafica::Wayland => Some(FALTA_WAYLAND),
        Grafica::SinPantalla => Some(FALTA_X11),
        Grafica::X11 if !conecta_x11 => Some(FALTA_X11),
        Grafica::X11 => None,
    }
}

/// Lo que falta para tocar: lo mismo que la pantalla y, además, la extensión XTEST del servidor X.
pub fn falta_entrada(g: Grafica, conecta_x11: bool, xtest: bool) -> Option<&'static str> {
    match falta_pantalla(g, conecta_x11) {
        Some(f) => Some(f),
        None if !xtest => Some(FALTA_ENTRADA),
        None => None,
    }
}

// ─────────────────────────── Teclas ───────────────────────────

/// El vocabulario cerrado que un Linux de escritorio (Xfce y parecidos) tiene. Mismas palabras que en el Mac: la ventana de
/// quien manda ya las conoce. `recientes` es Alt+Tab (cambiar de ventana); `bloquear` es Ctrl+Alt+L (el atajo de bloqueo de
/// Xfce y de casi todos los escritorios); el volumen y el silencio son las teclas multimedia estándar.
pub const TECLAS_LINUX: [&str; 5] = [
    "recientes",
    "bloquear",
    "volumen-subir",
    "volumen-bajar",
    "silencio",
];
/// Marca adicional: distingue un Linux de un Mac entre los aparatos «de escritorio» (para rotular `recientes`).
pub const MARCA_LINUX: &str = "linux";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TeclaLinux {
    /// Alt+Tab.
    Recientes,
    /// Ctrl+Alt+L.
    Bloquear,
    VolumenSubir,
    VolumenBajar,
    Silencio,
}

pub fn tecla_de(cual: &str) -> Option<TeclaLinux> {
    Some(match cual {
        "recientes" => TeclaLinux::Recientes,
        "bloquear" => TeclaLinux::Bloquear,
        "volumen-subir" => TeclaLinux::VolumenSubir,
        "volumen-bajar" => TeclaLinux::VolumenBajar,
        "silencio" => TeclaLinux::Silencio,
        _ => return None,
    })
}

// ─────────────────────────── Alcance protegido ───────────────────────────

/// Clases de ventana (`WM_CLASS`, en minúsculas) que `protegido` no deja tocar: StarSeed OS, los ajustes del escritorio, los
/// agentes de autenticación (polkit), los gestores de claves, los instaladores y el cierre de sesión.
pub const CLASES_PROTEGIDAS: [&str; 19] = [
    "starseed-os",
    "starseed os",
    "app.starseed.os",
    "starseed-native",
    "xfce4-settings-manager",
    "xfce4-session-logout",
    "xfce4-power-manager-settings",
    "polkit-gnome-authentication-agent-1",
    "polkit-kde-authentication-agent-1",
    "xfce-polkit",
    "lxpolkit",
    "pkexec",
    "gcr-prompter",
    "gnome-keyring-prompt",
    "seahorse",
    "synaptic",
    "gnome-software",
    "software-properties-gtk",
    "gnome-control-center",
];

/// ¿`protegido` rechaza esta orden? `clase`: clase de la ventana activa (None = no se pudo saber → se rechaza, ante la duda).
/// `es_texto`: la orden escribe. En Linux (X11) NO se puede saber si el foco está en un campo de contraseña (no hay un
/// equivalente de la «entrada segura» del Mac): por eso en `protegido` el texto se niega siempre. Esto se dice en el
/// diálogo de aceptar. `total` no rechaza nada aquí (el aparato bloqueado se mira aparte, en los dos alcances).
pub fn permite(
    alcance: m::Alcance,
    clase: Option<&str>,
    es_texto: bool,
) -> Result<(), &'static str> {
    if alcance == m::Alcance::Total {
        return Ok(());
    }
    let Some(c) = clase else {
        return Err("app-desconocida");
    };
    let c = c.trim().to_lowercase();
    if c.is_empty() {
        return Err("app-desconocida");
    }
    if CLASES_PROTEGIDAS.contains(&c.as_str())
        || c.contains("polkit")
        || c.contains("authentication")
        || c.contains("starseed")
    {
        return Err("app-protegida");
    }
    if es_texto {
        return Err("texto-sin-campo-seguro");
    }
    Ok(())
}

/// Del valor crudo de la propiedad `WM_CLASS` (dos cadenas separadas por NUL: instancia y clase) → la clase (la segunda; si
/// solo hay una, esa). Sin texto → None.
pub fn clase_de_wm_class(crudo: &[u8]) -> Option<String> {
    let partes: Vec<&[u8]> = crudo.split(|b| *b == 0).filter(|p| !p.is_empty()).collect();
    let ultima = partes.last()?;
    let s = String::from_utf8_lossy(ultima).trim().to_string();
    (!s.is_empty()).then_some(s)
}

// ─────────────────────────── Diálogo nativo de aceptar ───────────────────────────

/// Lo que dice el diálogo nativo al aceptar un controlador en un Linux. Dice la verdad de `alcance` y de lo que `protegido`
/// puede y no puede proteger aquí.
pub fn texto_aceptar(nombre: &str, codigo: &str, alcance: m::Alcance) -> String {
    let nombre: String = nombre
        .chars()
        .filter(|c| !c.is_control())
        .take(40)
        .collect();
    let nombre = if nombre.trim().is_empty() {
        "otra neurona".to_string()
    } else {
        nombre.trim().to_string()
    };
    let alcance_txt = match alcance {
        m::Alcance::Total => "Control TOTAL: podrá ver tu pantalla y mover el ratón, pulsar y escribir en cualquier ventana de este equipo, \
            también StarSeed OS, los ajustes, los instaladores y los campos de contraseña. Solo se niega con la pantalla bloqueada.",
        m::Alcance::Protegido => "Control PROTEGIDO: podrá ver tu pantalla y manejar el ratón y el teclado, pero no cuando la ventana al frente sea \
            StarSeed OS, los ajustes del escritorio, un agente de autenticación o un instalador. En este sistema NO se puede saber si el \
            foco está en un campo de contraseña: por eso, en este modo, tampoco se escribe texto.",
    };
    format!(
        "¿Dejar que «{nombre}» (código {codigo}) controle este equipo?\n\n\
         Compara ese código con el que ves en la otra neurona antes de decir que sí.\n\n{alcance_txt}\n\n\
         Mientras te controle verás un punto de su color en la esquina de arriba a la derecha; al pulsarlo, su nombre completo y los botones «Terminar» y «Quitar permiso». Tocar el teclado o el \
         ratón de este equipo pausa unos segundos. Cada orden queda en el registro (nunca lo que se escribe ni dónde se pulsa). \
         Al apagar «Control entre tus neuronas» esta lista se vacía."
    )
}

// ─────────────────────────── Capacidades ───────────────────────────

/// `control_capacidades` en un Linux: lo que se puede de verdad AHORA y lo que falta. Sin X11 no se promete nada; sin XTEST no se
/// promete entrada. No hay «ajustes» que abrir: lo que falta lo da la sesión (iniciar en X11), no un permiso.
/// `volumen_ok`: si `pactl` o `wpctl` están disponibles. `brillo_ok`: si `brightnessctl` o `xrandr` están disponibles.
pub fn capacidades_linux(
    g: Grafica,
    conecta_x11: bool,
    xtest: bool,
    alcance: m::Alcance,
    volumen_ok: bool,
    brillo_ok: bool,
) -> Value {
    let pantalla_ok = falta_pantalla(g, conecta_x11).is_none();
    let entrada_ok = falta_entrada(g, conecta_x11, xtest).is_none();
    let mut falta: Vec<&str> = Vec::new();
    if let Some(f) = falta_entrada(g, conecta_x11, xtest) {
        falta.push(f);
    }
    let mut teclas: Vec<&str> = if entrada_ok {
        TECLAS_LINUX.to_vec()
    } else {
        Vec::new()
    };
    teclas.push(m::MARCA_ESCRITORIO);
    teclas.push(MARCA_LINUX);
    json!({
        "pantalla": { "accesibilidad": false, "proyeccion": pantalla_ok, "sin_preguntar": true },
        "entrada": {
            "gestos": entrada_ok,
            "max_dedos": if entrada_ok { 2 } else { 0 },
            "teclas": teclas,
            "volumen": volumen_ok,
            "brillo": brillo_ok,
            "texto": entrada_ok,
        },
        "falta": falta,
        "alcance": alcance.codigo(),
        "plataforma": "linux",
    })
}

/// Argumentos para `pactl set-sink-volume @DEFAULT_SINK@ N%` a partir de un nivel en [0.0, 1.0].
pub fn volumen_pactl_args(nivel: f64) -> Vec<String> {
    let p = (nivel.clamp(0.0, 1.0) * 100.0).round() as u32;
    vec![
        "set-sink-volume".into(),
        "@DEFAULT_SINK@".into(),
        format!("{p}%"),
    ]
}

/// Argumentos para `wpctl set-volume @DEFAULT_AUDIO_SINK@ N` a partir de un nivel en [0.0, 1.0].
pub fn volumen_wpctl_args(nivel: f64) -> Vec<String> {
    let v = (nivel.clamp(0.0, 1.0) * 100.0).round() / 100.0;
    vec![
        "set-volume".into(),
        "@DEFAULT_AUDIO_SINK@".into(),
        format!("{v}"),
    ]
}

/// Argumentos para `brightnessctl set N%` a partir de un nivel en [0.0, 1.0].
pub fn brillo_brightnessctl_args(nivel: f64) -> Vec<String> {
    let p = (nivel.clamp(0.0, 1.0) * 100.0).round() as u32;
    vec!["set".into(), format!("{p}%")]
}

/// Argumentos para `xrandr --output <out> --brightness N` a partir de un nivel en [0.0, 1.0].
pub fn brillo_xrandr_args(salida: &str, nivel: f64) -> Vec<String> {
    let v = nivel.clamp(0.0, 1.0);
    vec![
        "--output".into(),
        salida.into(),
        "--brightness".into(),
        format!("{:.1}", v),
    ]
}

/// Método preferido para controlar el brillo, ordenado por prioridad:
/// 1. `brightnessctl` (si no rechazado) - usa sysfs o D-Bus según configuración
/// 2. `xrandr` (si no rechazado) - solo X11, no usa D-Bus
/// 3. `sysfs` (escritura directa) - nunca usa D-Bus, siempre disponible si hay backlight
/// Devuelve `None` si todos los métodos disponibles están rechazados.
pub fn elegir_metodo_brillo(
    tiene_brightnessctl: bool,
    tiene_xrandr: bool,
    rechazos: &RechazosDbus,
) -> Option<MetodoControl> {
    if tiene_brightnessctl && !rechazos.esta_rechazado(MetodoControl::Brightnessctl) {
        return Some(MetodoControl::Brightnessctl);
    }
    if tiene_xrandr && !rechazos.esta_rechazado(MetodoControl::Xrandr) {
        return Some(MetodoControl::Xrandr);
    }
    if !rechazos.esta_rechazado(MetodoControl::Sysfs) {
        return Some(MetodoControl::Sysfs);
    }
    None
}

/// Método preferido para leer el perfil de energía, ordenado por prioridad:
/// 1. `powerprofilesctl` (si no rechazado) - usa D-Bus
/// 2. Ninguno - fallback a sysfs/UPower sin D-Bus
pub fn elegir_metodo_perfil_energia(rechazos: &RechazosDbus) -> Option<MetodoControl> {
    if !rechazos.esta_rechazado(MetodoControl::Powerprofilesctl) {
        Some(MetodoControl::Powerprofilesctl)
    } else {
        None
    }
}

// ─────────────────────────── Pausa local: mano de verdad o evento propio ───────────────────────────

/// ¿Este dispositivo de entrada de X es el que usamos para inyectar? XTEST crea «Virtual core XTEST pointer» y «Virtual core
/// XTEST keyboard»: lo que sale de ahí lo causamos NOSOTROS (enigo). Cualquier otro dispositivo (teclado, ratón, panel táctil,
/// uno virtual de otro programa) es una mano o, ante la duda, se trata como una mano.
pub fn dispositivo_es_propio(nombre: &str) -> bool {
    nombre.to_ascii_lowercase().contains("xtest")
}

/// Para pruebas y registro: ¿este `sourceid` está entre los dispositivos propios?
#[cfg_attr(not(test), allow(dead_code))]
pub fn dispositivo_es_propio_id(sourceid: u16, propios: &[u16]) -> bool {
    propios.contains(&sourceid)
}

/// Decide si un evento crudo de XInput2 pausa: sí, salvo que venga de un dispositivo propio CONOCIDO. Un `sourceid` que no se
/// conoce (dispositivo recién enchufado, lista sin refrescar) cuenta como mano: ante la duda, pausa.
pub fn evento_pausa(sourceid: u16, propios: &[u16], conocidos: &[u16]) -> bool {
    if propios.contains(&sourceid) {
        return false;
    }
    let _ = conocidos; // lo conocido y no propio es una mano; lo desconocido también (conservador)
    true
}

/// Sondeo de reserva (si el servidor no tiene XInput2 ≥ 2.0): ¿hay una mano? Mira lo que se SABE del estado: el puntero se
/// apartó de donde lo dejamos (ya asentado), cambió el estado de los botones o de las teclas sin que acabáramos de inyectar.
/// Conservador: un cambio de teclas o botones cuando no inyectamos nada en los últimos `RECIENTE_PROPIO_MS` es una mano.
pub const RECIENTE_PROPIO_MS: u64 = 250;

pub fn sondeo_mano(
    puntero_movido_por_mano: bool,
    botones_cambiaron: bool,
    teclas_cambiaron: bool,
    ultima_propia_ms: u64,
    ahora_ms: u64,
) -> bool {
    if puntero_movido_por_mano {
        return true;
    }
    let propio_reciente =
        ultima_propia_ms != 0 && ahora_ms.saturating_sub(ultima_propia_ms) <= RECIENTE_PROPIO_MS;
    (botones_cambiaron || teclas_cambiaron) && !propio_reciente
}

// ─────────────────────────── Bloqueo del aparato ───────────────────────────

/// `loginctl show-session -p LockedHint --value` → ¿bloqueada? (`yes`/`no`; cualquier otra cosa = no se sabe).
pub fn bloqueo_de_logind(salida: &str) -> Option<bool> {
    match salida.trim().to_ascii_lowercase().as_str() {
        "yes" | "true" | "1" => Some(true),
        "no" | "false" | "0" => Some(false),
        _ => None,
    }
}

/// Lo que dice `xfce4-screensaver-command --query` (o `xscreensaver-command -time`) → ¿el salvapantallas está activo?
/// «The screensaver is active» / «screen locked since …» = sí; «is inactive» / «non-blanked» = no.
pub fn bloqueo_de_salvapantallas(salida: &str) -> Option<bool> {
    let s = salida.to_ascii_lowercase();
    if s.contains("inactive") || s.contains("non-blanked") || s.contains("not active") {
        return Some(false);
    }
    if s.contains("is active") || s.contains("screen locked") || s.contains("screen blanked") {
        return Some(true);
    }
    None
}

/// Une las fuentes: bloqueada si CUALQUIERA lo dice; no bloqueada solo si alguna dice que no y ninguna que sí. Si ninguna
/// sabe, se considera NO bloqueada (no hay forma de saberlo; se anota en el registro con `bloqueo=desconocido`).
pub fn bloqueada_de(fuentes: &[Option<bool>]) -> bool {
    fuentes.iter().flatten().any(|b| *b)
}

pub fn bloqueo_conocido(fuentes: &[Option<bool>]) -> bool {
    fuentes.iter().any(|b| b.is_some())
}

// ─────────────────────────── Registro ───────────────────────────

/// Líneas del registro de enlaces con las mismas claves que macOS y Android (`control-entrada`).
pub fn linea_inicio_entrada(sesion: &str, alcance: m::Alcance) -> String {
    format!(
        "inicio sesion={} plataforma=linux alcance={}",
        sesion.chars().take(8).collect::<String>(),
        alcance.codigo()
    )
}

/// La línea de `control-pantalla` cuando no se puede iniciar, con el motivo y lo que falta.
pub fn linea_pantalla_sin(motivo: &str, falta: &str, grafica: Grafica) -> String {
    let g = match grafica {
        Grafica::X11 => "x11",
        Grafica::Wayland => "wayland",
        Grafica::SinPantalla => "sin-pantalla",
    };
    format!("sin-pantalla motivo={motivo} falta={falta} grafica={g} fuente=linux-pantalla")
}

/// La línea de `control-pausa` de la vigilancia local (sin contenido: solo qué mecanismo y cuántas veces).
pub fn linea_vigia(mecanismo: &str, pausas_de_mano: u64, eventos_propios: u64) -> String {
    format!("vigia mecanismo={mecanismo} pausas-de-mano={pausas_de_mano} eventos-propios-descontados={eventos_propios}")
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn wayland_manda_sobre_display_y_se_dice_wayland() {
        assert_eq!(
            grafica_de(Some("wayland-0"), None, Some(":0")),
            Grafica::Wayland
        );
        assert_eq!(
            grafica_de(None, Some("wayland"), Some(":0")),
            Grafica::Wayland
        );
        assert_eq!(grafica_de(None, Some("Wayland"), None), Grafica::Wayland);
        assert_eq!(grafica_de(None, Some("x11"), Some(":0")), Grafica::X11);
        assert_eq!(
            grafica_de(Some("  "), Some("tty"), Some(":1")),
            Grafica::X11
        );
        assert_eq!(grafica_de(None, None, None), Grafica::SinPantalla);
        assert_eq!(grafica_de(None, None, Some("")), Grafica::SinPantalla);
        assert_eq!(falta_pantalla(Grafica::Wayland, true), Some("wayland"));
        assert_eq!(
            falta_pantalla(Grafica::SinPantalla, false),
            Some("sin-pantalla-x11")
        );
        assert_eq!(
            falta_pantalla(Grafica::X11, false),
            Some("sin-pantalla-x11")
        );
        assert_eq!(falta_pantalla(Grafica::X11, true), None);
        assert_eq!(
            falta_entrada(Grafica::X11, true, false),
            Some("entrada-x11")
        );
        assert_eq!(falta_entrada(Grafica::X11, true, true), None);
        assert_eq!(falta_entrada(Grafica::Wayland, true, true), Some("wayland"));
    }

    #[test]
    fn capacidades_dicen_la_verdad_y_marcan_el_escritorio_linux() {
        let c = capacidades_linux(Grafica::X11, true, true, m::Alcance::Total, true, true);
        assert_eq!(c["plataforma"], "linux");
        assert_eq!(c["pantalla"]["proyeccion"], true);
        assert_eq!(c["entrada"]["gestos"], true);
        assert_eq!(c["entrada"]["max_dedos"], 2);
        assert_eq!(c["entrada"]["volumen"], true);
        assert_eq!(c["entrada"]["brillo"], true);
        assert_eq!(c["falta"], json!([]));
        let teclas: Vec<&str> = c["entrada"]["teclas"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|t| t.as_str())
            .collect();
        assert!(
            teclas.contains(&"escritorio")
                && teclas.contains(&"linux")
                && teclas.contains(&"recientes")
        );
        // El vocabulario es un subconjunto del cerrado de la web.
        for t in TECLAS_LINUX {
            assert!(crate::control_entrada_logica::TECLAS.contains(&t), "{t}");
        }
        let w = capacidades_linux(
            Grafica::Wayland,
            false,
            false,
            m::Alcance::Total,
            false,
            false,
        );
        assert_eq!(w["falta"], json!(["wayland"]));
        assert_eq!(w["pantalla"]["proyeccion"], false);
        assert_eq!(w["entrada"]["gestos"], false);
        assert_eq!(w["entrada"]["teclas"], json!(["escritorio", "linux"]));
        let sx = capacidades_linux(
            Grafica::X11,
            true,
            false,
            m::Alcance::Protegido,
            false,
            false,
        );
        assert_eq!(sx["falta"], json!(["entrada-x11"]));
        assert_eq!(sx["pantalla"]["proyeccion"], true, "sin XTEST aún se ve");
        assert_eq!(sx["alcance"], "protegido");
    }

    #[test]
    fn total_no_rechaza_y_protegido_si_ante_la_duda() {
        assert!(permite(m::Alcance::Total, None, true).is_ok());
        assert!(permite(
            m::Alcance::Total,
            Some("polkit-gnome-authentication-agent-1"),
            true
        )
        .is_ok());
        assert_eq!(
            permite(m::Alcance::Protegido, None, false),
            Err("app-desconocida")
        );
        assert_eq!(
            permite(m::Alcance::Protegido, Some("  "), false),
            Err("app-desconocida")
        );
        assert_eq!(
            permite(m::Alcance::Protegido, Some("Xfce4-settings-manager"), false),
            Err("app-protegida")
        );
        assert_eq!(
            permite(
                m::Alcance::Protegido,
                Some("Polkit-gnome-authentication-agent-1"),
                false
            ),
            Err("app-protegida")
        );
        assert_eq!(
            permite(m::Alcance::Protegido, Some("StarSeed-OS"), false),
            Err("app-protegida")
        );
        assert_eq!(
            permite(m::Alcance::Protegido, Some("Firefox"), false),
            Ok(())
        );
        assert_eq!(
            permite(m::Alcance::Protegido, Some("Firefox"), true),
            Err("texto-sin-campo-seguro")
        );
    }

    #[test]
    fn wm_class_lee_la_clase_y_no_inventa() {
        assert_eq!(
            clase_de_wm_class(b"navigator\0Firefox\0").as_deref(),
            Some("Firefox")
        );
        assert_eq!(clase_de_wm_class(b"xterm\0").as_deref(), Some("xterm"));
        assert_eq!(clase_de_wm_class(b""), None);
        assert_eq!(clase_de_wm_class(b"\0\0"), None);
    }

    #[test]
    fn el_dialogo_dice_la_verdad_de_cada_alcance_y_no_nombra_al_mando() {
        let t = texto_aceptar("Mi Mac", "123-456", m::Alcance::Total);
        assert!(
            t.contains("Mi Mac")
                && t.contains("123-456")
                && t.contains("TOTAL")
                && t.contains("Terminar")
        );
        let p = texto_aceptar("  ", "9", m::Alcance::Protegido);
        assert!(
            p.contains("otra neurona")
                && p.contains("NO se puede saber")
                && p.contains("tampoco se escribe texto")
        );
        assert!(!t.contains("Mando") && !p.contains("Mando"));
        assert!(!t.contains("Mac de") && !t.contains("este Mac"));
    }

    #[test]
    fn solo_el_dispositivo_xtest_es_propio_y_lo_desconocido_pausa() {
        assert!(dispositivo_es_propio("Virtual core XTEST pointer"));
        assert!(dispositivo_es_propio("Virtual core XTEST keyboard"));
        assert!(!dispositivo_es_propio("Logitech USB Receiver"));
        assert!(!dispositivo_es_propio("Apple Inc. Magic Trackpad"));
        assert!(!dispositivo_es_propio("Virtual core pointer"));
        assert!(!evento_pausa(7, &[7, 8], &[2, 3, 7, 8, 9]));
        assert!(evento_pausa(9, &[7, 8], &[2, 3, 7, 8, 9]));
        assert!(
            evento_pausa(42, &[7, 8], &[2, 3, 7, 8, 9]),
            "dispositivo que no se conoce: pausa"
        );
    }

    #[test]
    fn el_sondeo_de_reserva_es_conservador_pero_no_toma_lo_propio_por_una_mano() {
        assert!(
            sondeo_mano(true, false, false, 1000, 1010),
            "el puntero se apartó: mano, aunque inyectáramos hace poco"
        );
        assert!(
            !sondeo_mano(false, true, false, 1000, 1100),
            "botón que cambió justo tras inyectar: es nuestro"
        );
        assert!(
            sondeo_mano(false, true, false, 1000, 1400),
            "botón que cambió sin inyectar: mano"
        );
        assert!(
            sondeo_mano(false, false, true, 0, 5000),
            "tecla sin haber inyectado nunca: mano"
        );
        assert!(!sondeo_mano(false, false, false, 0, 5000));
    }

    #[test]
    fn el_bloqueo_se_lee_de_logind_y_del_salvapantallas() {
        assert_eq!(bloqueo_de_logind("yes\n"), Some(true));
        assert_eq!(bloqueo_de_logind("no\n"), Some(false));
        assert_eq!(bloqueo_de_logind(""), None);
        assert_eq!(bloqueo_de_logind("n/a"), None);
        assert_eq!(
            bloqueo_de_salvapantallas("The screensaver is active\n"),
            Some(true)
        );
        assert_eq!(
            bloqueo_de_salvapantallas("The screensaver is inactive"),
            Some(false)
        );
        assert_eq!(bloqueo_de_salvapantallas("screen non-blanked"), Some(false));
        assert_eq!(
            bloqueo_de_salvapantallas("screen locked since Tue"),
            Some(true)
        );
        assert_eq!(bloqueo_de_salvapantallas("no se que"), None);
        assert!(bloqueada_de(&[Some(false), Some(true), None]));
        assert!(!bloqueada_de(&[Some(false), None]));
        assert!(!bloqueada_de(&[None, None]));
        assert!(bloqueo_conocido(&[None, Some(false)]));
        assert!(!bloqueo_conocido(&[None, None]));
    }

    #[test]
    fn las_lineas_del_registro_no_llevan_contenido() {
        let l = linea_inicio_entrada("abcdef0123456789", m::Alcance::Total);
        assert_eq!(l, "inicio sesion=abcdef01 plataforma=linux alcance=total");
        let s = linea_pantalla_sin("sin-consentimiento", "wayland", Grafica::Wayland);
        assert!(s.contains("falta=wayland") && s.contains("grafica=wayland"));
        assert!(linea_vigia("xi2", 2, 14).contains("mecanismo=xi2"));
    }

    #[test]
    fn volumen_pactl_desde_porcentaje_acotado() {
        assert_eq!(
            volumen_pactl_args(0.0),
            vec!["set-sink-volume", "@DEFAULT_SINK@", "0%"]
        );
        assert_eq!(
            volumen_pactl_args(0.5),
            vec!["set-sink-volume", "@DEFAULT_SINK@", "50%"]
        );
        assert_eq!(
            volumen_pactl_args(1.0),
            vec!["set-sink-volume", "@DEFAULT_SINK@", "100%"]
        );
        assert_eq!(
            volumen_pactl_args(-0.1),
            vec!["set-sink-volume", "@DEFAULT_SINK@", "0%"]
        );
        assert_eq!(
            volumen_pactl_args(1.1),
            vec!["set-sink-volume", "@DEFAULT_SINK@", "100%"]
        );
    }

    #[test]
    fn volumen_wpctl_desde_porcentaje_acotado() {
        assert_eq!(
            volumen_wpctl_args(0.0),
            vec!["set-volume", "@DEFAULT_AUDIO_SINK@", "0"]
        );
        assert_eq!(
            volumen_wpctl_args(0.5),
            vec!["set-volume", "@DEFAULT_AUDIO_SINK@", "0.5"]
        );
        assert_eq!(
            volumen_wpctl_args(1.0),
            vec!["set-volume", "@DEFAULT_AUDIO_SINK@", "1"]
        );
        assert_eq!(
            volumen_wpctl_args(-0.1),
            vec!["set-volume", "@DEFAULT_AUDIO_SINK@", "0"]
        );
        assert_eq!(
            volumen_wpctl_args(1.1),
            vec!["set-volume", "@DEFAULT_AUDIO_SINK@", "1"]
        );
    }

    #[test]
    fn brillo_brightnessctl_desde_porcentaje_acotado() {
        assert_eq!(brillo_brightnessctl_args(0.0), vec!["set", "0%"]);
        assert_eq!(brillo_brightnessctl_args(0.5), vec!["set", "50%"]);
        assert_eq!(brillo_brightnessctl_args(1.0), vec!["set", "100%"]);
        assert_eq!(brillo_brightnessctl_args(-0.1), vec!["set", "0%"]);
        assert_eq!(brillo_brightnessctl_args(1.1), vec!["set", "100%"]);
    }

    #[test]
    fn brillo_xrandr_desde_porcentaje_acotado() {
        assert_eq!(
            brillo_xrandr_args("eDP-1", 0.0),
            vec!["--output", "eDP-1", "--brightness", "0.0"]
        );
        assert_eq!(
            brillo_xrandr_args("eDP-1", 0.5),
            vec!["--output", "eDP-1", "--brightness", "0.5"]
        );
        assert_eq!(
            brillo_xrandr_args("eDP-1", 1.0),
            vec!["--output", "eDP-1", "--brightness", "1.0"]
        );
        assert_eq!(
            brillo_xrandr_args("eDP-1", -0.1),
            vec!["--output", "eDP-1", "--brightness", "0.0"]
        );
        assert_eq!(
            brillo_xrandr_args("eDP-1", 1.1),
            vec!["--output", "eDP-1", "--brightness", "1.0"]
        );
    }

    #[test]
    fn elegir_metodo_brillo_prefiere_brightnessctl_si_disponible() {
        let rechazos = RechazosDbus::default();
        assert_eq!(
            elegir_metodo_brillo(true, true, &rechazos),
            Some(MetodoControl::Brightnessctl)
        );
    }

    #[test]
    fn elegir_metodo_brillo_usa_xrandr_si_brightnessctl_rechazado() {
        let mut rechazos = RechazosDbus::default();
        rechazos.rechazar(MetodoControl::Brightnessctl);
        assert_eq!(
            elegir_metodo_brillo(true, true, &rechazos),
            Some(MetodoControl::Xrandr)
        );
    }

    #[test]
    fn elegir_metodo_brillo_usa_sysfs_si_todos_rechazados() {
        let mut rechazos = RechazosDbus::default();
        rechazos.rechazar(MetodoControl::Brightnessctl);
        rechazos.rechazar(MetodoControl::Xrandr);
        assert_eq!(
            elegir_metodo_brillo(true, true, &rechazos),
            Some(MetodoControl::Sysfs)
        );
    }

    #[test]
    fn elegir_metodo_brillo_none_si_todos_rechazados_incluyendo_sysfs() {
        let mut rechazos = RechazosDbus::default();
        rechazos.rechazar(MetodoControl::Brightnessctl);
        rechazos.rechazar(MetodoControl::Xrandr);
        rechazos.rechazar(MetodoControl::Sysfs);
        assert_eq!(elegir_metodo_brillo(true, true, &rechazos), None);
    }

    #[test]
    fn elegir_metodo_brillo_sin_brightnessctl_usa_xrandr() {
        let rechazos = RechazosDbus::default();
        assert_eq!(
            elegir_metodo_brillo(false, true, &rechazos),
            Some(MetodoControl::Xrandr)
        );
    }

    #[test]
    fn elegir_metodo_perfil_energia_usa_powerprofilesctl_si_no_rechazado() {
        let rechazos = RechazosDbus::default();
        assert_eq!(
            elegir_metodo_perfil_energia(&rechazos),
            Some(MetodoControl::Powerprofilesctl)
        );
    }

    #[test]
    fn elegir_metodo_perfil_energia_none_si_rechazado() {
        let mut rechazos = RechazosDbus::default();
        rechazos.rechazar(MetodoControl::Powerprofilesctl);
        assert_eq!(elegir_metodo_perfil_energia(&rechazos), None);
    }
}
