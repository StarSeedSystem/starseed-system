// ═══════════════════════════════════════════════════════════════════════════
// ubicacion_logica — lo PURO de la ubicación nativa (UBI1114K, 2026-11-14). Sin Tauri, sin objc, sin JNI:
// se prueba en cualquier sistema. Contrato: architecture/ubicacion-nativa.md.
// ---------------------------------------------------------------------------
// Un solo modo de saber dónde está el aparato para la web de todas las apps: los comandos
// `ubicacion_estado`, `ubicacion_ahora`, `ubicacion_vigilar`, `ubicacion_parar` y `ubicacion_ultima`
// (ubicacion.rs). Detrás, CoreLocation en macOS (ubicacion_macos.rs) y LocationManager en Android
// (UbicacionStarSeed.kt, por archivos como las llamadas nativas). Nada se redondea: precisión y hora de cada
// medida pasan tal cual las dio el sistema. La app NUNCA concede nada: el permiso lo da la persona en el
// aviso del propio sistema, y solo cuando ella lo pide (`pedir: true`); sin eso, solo se lee el estado.
// ═══════════════════════════════════════════════════════════════════════════

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Sube si cambia la forma de lo que la web lee.
pub const VERSION_UBICACION: u32 = 1;
/// Carpeta (bajo `files/starseed/`) que comparten Rust y UbicacionStarSeed.kt.
pub const CARPETA_ANDROID: &str = "ubicacion";
pub const ESTADO: &str = "estado.json";
pub const PREFIJO_PETICION: &str = "peticion-";

/// Una medida de posición tal cual la dio el sistema.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct Fix {
    pub lat: f64,
    pub lon: f64,
    /// Radio de error horizontal en metros; None si el sistema no lo da.
    #[serde(default)]
    pub precision_m: Option<f64>,
    #[serde(default)]
    pub altitud_m: Option<f64>,
    #[serde(default)]
    pub precision_altitud_m: Option<f64>,
    /// Rumbo en grados (0–360); None si no hay.
    #[serde(default)]
    pub rumbo: Option<f64>,
    #[serde(default)]
    pub velocidad_ms: Option<f64>,
    /// Hora de la MEDIDA (epoch ms), no la de la lectura.
    #[serde(default)]
    pub t_ms: u64,
    /// Quién la midió: «corelocation», «gps», «network», «fused»…
    #[serde(default)]
    pub fuente: String,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Permiso {
    Concedido,
    /// Android 12+: la persona dio solo la ubicación aproximada.
    Aproximado,
    SinPreguntar,
    Denegado,
    /// macOS: restringido por control parental o administración.
    Restringido,
    NoDisponible,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Codigo {
    Denegado,
    Restringido,
    /// Aún no se preguntó y esta llamada no pidió que se preguntara.
    SinPreguntar,
    /// El interruptor general de ubicación del sistema está apagado.
    ServiciosApagados,
    /// Permiso dado, pero el aparato no consiguió fijar una posición a tiempo.
    SinFijar,
    /// Esta app o este sistema no sabe dar la ubicación por la vía nativa.
    NoDisponible,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ErrorUbicacion {
    pub codigo: Codigo,
    /// Texto para la persona: qué pasó y cómo cambiarlo en los ajustes de ESE sistema.
    pub motivo: String,
}

/// Lo que devuelven `ubicacion_ahora` y `ubicacion_ultima`. Siempre `Ok` para Tauri: el fallo va dentro,
/// con su código, para que la web distinga «no diste permiso» de «el aparato no pudo darla».
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct RespuestaFix {
    pub ok: bool,
    #[serde(default)]
    pub fix: Option<Fix>,
    #[serde(default)]
    pub error: Option<ErrorUbicacion>,
}

impl RespuestaFix {
    pub fn con(fix: Fix) -> Self {
        RespuestaFix { ok: true, fix: Some(fix), error: None }
    }
    pub fn fallo(codigo: Codigo, plataforma: &str) -> Self {
        RespuestaFix { ok: false, fix: None, error: Some(ErrorUbicacion { codigo, motivo: motivo_de(codigo, plataforma) }) }
    }
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct EstadoUbicacion {
    pub version: u32,
    pub plataforma: String,
    /// ¿Esta app sabe dar la ubicación por la vía nativa aquí? (si no, la web usa la del navegador)
    pub disponible: bool,
    pub permiso: Permiso,
    /// Interruptor general del sistema; None si no se pudo leer.
    pub servicios: Option<bool>,
    pub vigilando: bool,
    /// Dónde cambiarlo (texto de ajustes de ESTE sistema).
    pub donde_cambiarlo: String,
}

/// Dónde se cambia el permiso de ubicación en cada sistema (texto para la persona).
pub fn donde_cambiarlo(plataforma: &str) -> &'static str {
    match plataforma {
        "macos" => "Ajustes del Sistema › Privacidad y seguridad › Localización: activa «Servicios de localización» y marca StarSeed.",
        "android" => "Ajustes › Aplicaciones › StarSeed › Permisos › Ubicación (y, en el panel rápido o en Ajustes › Ubicación, que la ubicación del aparato esté encendida).",
        "windows" => "Configuración › Privacidad y seguridad › Ubicación.",
        _ => "Los ajustes de privacidad de tu sistema.",
    }
}

/// El motivo que se enseña, con cómo arreglarlo en ESE sistema. Pura.
pub fn motivo_de(codigo: Codigo, plataforma: &str) -> String {
    let donde = donde_cambiarlo(plataforma);
    match codigo {
        Codigo::Denegado => format!("No diste permiso de ubicación a StarSeed. Para cambiarlo: {donde}"),
        Codigo::Restringido => format!("El sistema restringe la ubicación de StarSeed (control parental o administración del aparato). Para cambiarlo: {donde}"),
        Codigo::SinPreguntar => "Aún no diste permiso de ubicación: pulsa «Usar mi ubicación» y el sistema te lo preguntará.".to_string(),
        Codigo::ServiciosApagados => format!("La ubicación del aparato está apagada en el sistema, así que nadie puede darla. Para encenderla: {donde}"),
        Codigo::SinFijar => "Tienes el permiso, pero el aparato no pudo fijar su posición a tiempo (sin GPS ni redes conocidas a la vista, o dentro de un edificio). Prueba junto a una ventana o con el Wi-Fi encendido.".to_string(),
        Codigo::NoDisponible => "Esta versión de la app no trae la ubicación nativa: actualízala.".to_string(),
    }
}

/// El error que corresponde a un permiso que NO permite leer. None si el permiso sí permite.
pub fn error_de_permiso(p: Permiso, pedir: bool) -> Option<Codigo> {
    match p {
        Permiso::Concedido | Permiso::Aproximado => None,
        Permiso::Denegado => Some(Codigo::Denegado),
        Permiso::Restringido => Some(Codigo::Restringido),
        Permiso::NoDisponible => Some(Codigo::NoDisponible),
        Permiso::SinPreguntar => (!pedir).then_some(Codigo::SinPreguntar),
    }
}

/// `CLAuthorizationStatus`: 0 sin decidir, 1 restringida, 2 denegada, 3 siempre, 4 al usarla.
pub fn permiso_de_cl(status: i64) -> Permiso {
    match status {
        3 | 4 => Permiso::Concedido,
        1 => Permiso::Restringido,
        2 => Permiso::Denegado,
        _ => Permiso::SinPreguntar,
    }
}

fn finito(x: f64) -> Option<f64> {
    x.is_finite().then_some(x)
}

/// Una medida de CoreLocation → `Fix`. CoreLocation marca «inválido» con números negativos
/// (`horizontalAccuracy < 0`: la posición no vale; `verticalAccuracy < 0`: sin altitud; `course` y `speed`
/// negativos: sin dato). Nada se redondea. None si la posición no vale. Pura.
#[allow(clippy::too_many_arguments)]
pub fn fix_de_cl(lat: f64, lon: f64, h_acc: f64, alt: f64, v_acc: f64, rumbo: f64, vel: f64, t_unix_s: f64) -> Option<Fix> {
    if !coordenada_valida(lat, lon) || !h_acc.is_finite() || h_acc < 0.0 || !t_unix_s.is_finite() || t_unix_s <= 0.0 {
        return None;
    }
    Some(Fix {
        lat,
        lon,
        precision_m: Some(h_acc),
        altitud_m: if v_acc.is_finite() && v_acc >= 0.0 { finito(alt) } else { None },
        precision_altitud_m: if v_acc.is_finite() && v_acc >= 0.0 { Some(v_acc) } else { None },
        rumbo: if rumbo.is_finite() && rumbo >= 0.0 { Some(rumbo) } else { None },
        velocidad_ms: if vel.is_finite() && vel >= 0.0 { Some(vel) } else { None },
        t_ms: (t_unix_s * 1000.0) as u64,
        fuente: "corelocation".into(),
    })
}

pub fn coordenada_valida(lat: f64, lon: f64) -> bool {
    lat.is_finite() && lon.is_finite() && (-90.0..=90.0).contains(&lat) && (-180.0..=180.0).contains(&lon)
}

/// Antigüedad de una medida en ms (0 si es del futuro por un reloj distinto). Pura.
pub fn edad_ms(t_ms: u64, ahora_ms: u64) -> u64 {
    ahora_ms.saturating_sub(t_ms)
}

/// ¿Sirve esta medida como «la posición de ahora»? Si no tiene más de `max_ms`. Pura.
pub fn es_reciente(fix: &Fix, ahora_ms: u64, max_ms: u64) -> bool {
    edad_ms(fix.t_ms, ahora_ms) <= max_ms
}

// ─────────────────────────────── Linux: GeoClue2 por D-Bus ───────────────────────────────

/// La hora de GeoClue viene como `(segundos, microsegundos)` desde la época. Pura.
pub fn t_ms_de_geoclue(segs: u64, micros: u64) -> u64 {
    segs.saturating_mul(1000).saturating_add(micros / 1000)
}

/// Lo que da GeoClue → `Fix`. Una posición imposible o una precisión negativa se descarta. Pura.
/// GeoClue marca «sin dato» con `-1` (rumbo, velocidad) y con el mínimo `f64` (altitud).
#[allow(clippy::too_many_arguments)]
pub fn fix_de_geoclue(lat: f64, lon: f64, precision: f64, altitud: f64, rumbo: f64, velocidad: f64, t: (u64, u64)) -> Option<Fix> {
    if !coordenada_valida(lat, lon) || !precision.is_finite() || precision < 0.0 {
        return None;
    }
    Some(Fix {
        lat,
        lon,
        precision_m: Some(precision),
        altitud_m: finito(altitud).filter(|v| *v > -1.0e300),
        precision_altitud_m: None,
        rumbo: finito(rumbo).filter(|v| *v >= 0.0),
        velocidad_ms: finito(velocidad).filter(|v| *v >= 0.0),
        t_ms: t_ms_de_geoclue(t.0, t.1),
        fuente: "geoclue".into(),
    })
}

/// El nombre de error de D-Bus de GeoClue → el código que entiende la web. Pura.
pub fn codigo_de_error_geoclue(nombre: &str) -> Codigo {
    if nombre.contains("PermissionDenied") {
        Codigo::Denegado
    } else if nombre.contains("Disabled") {
        Codigo::ServiciosApagados
    } else if nombre.contains("ServiceUnknown") || nombre.contains("NameHasNoOwner") || nombre.contains("UnknownObject") {
        Codigo::NoDisponible
    } else {
        Codigo::SinFijar
    }
}

// ─────────────────────────────── Android: archivos con Kotlin ───────────────────────────────

/// Lo que escribe UbicacionStarSeed.kt en `estado.json`.
#[derive(Deserialize, Clone, Debug, Default)]
pub struct EstadoKotlin {
    #[serde(default)]
    pub version: u32,
    /// La última petición que Kotlin terminó de atender.
    #[serde(default)]
    pub respuesta_a: u64,
    #[serde(default)]
    pub permiso: String,
    #[serde(default)]
    pub servicios: Option<bool>,
    #[serde(default)]
    pub vigilando: bool,
    #[serde(default)]
    pub fix: Option<Fix>,
    #[serde(default)]
    pub error: Option<ErrorKotlin>,
}

#[derive(Deserialize, Clone, Debug)]
pub struct ErrorKotlin {
    pub codigo: String,
}

pub fn permiso_de_texto(t: &str) -> Permiso {
    match t {
        "concedido" => Permiso::Concedido,
        "aproximado" => Permiso::Aproximado,
        "sin-preguntar" => Permiso::SinPreguntar,
        "denegado" => Permiso::Denegado,
        "restringido" => Permiso::Restringido,
        _ => Permiso::NoDisponible,
    }
}

pub fn codigo_de_texto(t: &str) -> Codigo {
    match t {
        "denegado" => Codigo::Denegado,
        "restringido" => Codigo::Restringido,
        "sin-preguntar" => Codigo::SinPreguntar,
        "servicios-apagados" => Codigo::ServiciosApagados,
        "sin-fijar" => Codigo::SinFijar,
        _ => Codigo::NoDisponible,
    }
}

pub fn leer_estado(dir: &Path) -> Option<EstadoKotlin> {
    let texto = std::fs::read_to_string(dir.join(ESTADO)).ok()?;
    let e: EstadoKotlin = serde_json::from_str(&texto).ok()?;
    (e.version > 0).then_some(e)
}

/// La respuesta de Kotlin a la petición `id`, si ya la atendió. Una medida con coordenadas imposibles se
/// rechaza (nunca se enseña un punto inventado). Pura.
pub fn respuesta_a(estado: &EstadoKotlin, id: u64, plataforma: &str) -> Option<RespuestaFix> {
    if estado.respuesta_a < id {
        return None;
    }
    Some(match (&estado.error, &estado.fix) {
        (Some(e), _) => RespuestaFix::fallo(codigo_de_texto(&e.codigo), plataforma),
        (None, Some(f)) if coordenada_valida(f.lat, f.lon) => RespuestaFix::con(f.clone()),
        _ => RespuestaFix::fallo(Codigo::SinFijar, plataforma),
    })
}

/// Lo último que Kotlin midió (para `ubicacion_ultima`), sin esperar a nadie. Pura.
pub fn ultima_de(estado: &EstadoKotlin, plataforma: &str) -> RespuestaFix {
    match &estado.fix {
        Some(f) if coordenada_valida(f.lat, f.lon) => RespuestaFix::con(f.clone()),
        _ => match error_de_permiso(permiso_de_texto(&estado.permiso), false) {
            Some(c) => RespuestaFix::fallo(c, plataforma),
            None if estado.servicios == Some(false) => RespuestaFix::fallo(Codigo::ServiciosApagados, plataforma),
            None => RespuestaFix::fallo(Codigo::SinFijar, plataforma),
        },
    }
}

pub fn nombre_peticion(n: u64) -> String {
    format!("{PREFIJO_PETICION}{n:020}.json")
}

/// La petición para Kotlin. `orden`: «ahora», «vigilar», «parar» o «estado»; `pedir`: si la persona acaba de
/// pulsar el botón y puede mostrarse el aviso del sistema. Pura.
pub fn peticion_json(id: u64, orden: &str, pedir: bool) -> Result<String, String> {
    if !["ahora", "vigilar", "parar", "estado"].contains(&orden) {
        return Err(format!("Orden de ubicación desconocida: «{orden}»."));
    }
    serde_json::to_string(&serde_json::json!({ "id": id, "orden": orden, "pedir": pedir })).map_err(|e| e.to_string())
}

pub fn escribir_peticion(dir: &Path, id: u64, texto: &str) -> Result<PathBuf, String> {
    std::fs::create_dir_all(dir).map_err(|e| format!("No se pudo crear {}: {e}", dir.display()))?;
    let destino = dir.join(nombre_peticion(id));
    let tmp = dir.join(format!(".{}.tmp", nombre_peticion(id)));
    std::fs::write(&tmp, texto).map_err(|e| format!("No se pudo escribir la petición: {e}"))?;
    std::fs::rename(&tmp, &destino).map_err(|e| format!("No se pudo colocar la petición: {e}"))?;
    Ok(destino)
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn cl_estado_a_permiso() {
        assert_eq!(permiso_de_cl(0), Permiso::SinPreguntar);
        assert_eq!(permiso_de_cl(1), Permiso::Restringido);
        assert_eq!(permiso_de_cl(2), Permiso::Denegado);
        assert_eq!(permiso_de_cl(3), Permiso::Concedido);
        assert_eq!(permiso_de_cl(4), Permiso::Concedido);
        assert_eq!(permiso_de_cl(99), Permiso::SinPreguntar);
    }

    #[test]
    fn el_fix_no_se_redondea_y_pasa_precision_y_hora() {
        let f = fix_de_cl(40.416775123456, -3.703790654321, 4.7, 650.25, 3.5, 91.0, 1.25, 1_700_000_000.123).unwrap();
        assert_eq!(f.lat, 40.416775123456);
        assert_eq!(f.lon, -3.703790654321);
        assert_eq!(f.precision_m, Some(4.7));
        assert_eq!(f.altitud_m, Some(650.25));
        assert_eq!(f.precision_altitud_m, Some(3.5));
        assert_eq!(f.rumbo, Some(91.0));
        assert_eq!(f.velocidad_ms, Some(1.25));
        assert_eq!(f.t_ms, 1_700_000_000_123);
        assert_eq!(f.fuente, "corelocation");
    }

    #[test]
    fn lo_invalido_de_corelocation_se_descarta_o_queda_vacio() {
        // Precisión horizontal negativa = la posición no vale.
        assert!(fix_de_cl(40.0, -3.0, -1.0, 0.0, -1.0, -1.0, -1.0, 1.7e9).is_none());
        // Coordenadas imposibles o sin hora.
        assert!(fix_de_cl(91.0, 0.0, 5.0, 0.0, -1.0, -1.0, -1.0, 1.7e9).is_none());
        assert!(fix_de_cl(f64::NAN, 0.0, 5.0, 0.0, -1.0, -1.0, -1.0, 1.7e9).is_none());
        assert!(fix_de_cl(40.0, -3.0, 5.0, 0.0, -1.0, -1.0, -1.0, 0.0).is_none());
        // Sin altitud, rumbo ni velocidad: quedan en None, no en 0 ni -1.
        let f = fix_de_cl(40.0, -3.0, 5.0, 12.0, -1.0, -1.0, -1.0, 1.7e9).unwrap();
        assert_eq!((f.altitud_m, f.precision_altitud_m, f.rumbo, f.velocidad_ms), (None, None, None, None));
    }

    #[test]
    fn geoclue_pasa_su_medida_sin_redondear() {
        // PRM1119A: la misma forma de `Fix` que CoreLocation, con su fuente.
        let f = fix_de_geoclue(40.416775123, -3.703790654, 12.5, 650.25, 91.0, 1.25, (1_700_000_000, 123_456)).unwrap();
        assert_eq!((f.lat, f.lon), (40.416775123, -3.703790654));
        assert_eq!(f.precision_m, Some(12.5));
        assert_eq!(f.altitud_m, Some(650.25));
        assert_eq!((f.rumbo, f.velocidad_ms), (Some(91.0), Some(1.25)));
        assert_eq!((f.t_ms, f.fuente.as_str()), (1_700_000_000_123, "geoclue"));
        // Sin altitud/rumbo/velocidad: None, nunca los centinelas de GeoClue (-1 y el mínimo `f64`).
        let s = fix_de_geoclue(40.0, -3.0, 5.0, f64::MIN, -1.0, -1.0, (1_700_000_000, 0)).unwrap();
        assert_eq!((s.altitud_m, s.rumbo, s.velocidad_ms), (None, None, None));
        // Posición imposible o precisión negativa: no se enseña.
        assert!(fix_de_geoclue(91.0, 0.0, 5.0, 0.0, 0.0, 0.0, (1, 0)).is_none());
        assert!(fix_de_geoclue(40.0, -3.0, -1.0, 0.0, 0.0, 0.0, (1, 0)).is_none());
    }

    #[test]
    fn la_hora_de_geoclue_se_compone_de_segundos_y_microsegundos() {
        assert_eq!(t_ms_de_geoclue(0, 0), 0);
        assert_eq!(t_ms_de_geoclue(1_700_000_000, 123_456), 1_700_000_000_123);
        assert_eq!(t_ms_de_geoclue(1_700_000_000, 999_999), 1_700_000_000_999);
    }

    #[test]
    fn los_errores_de_geoclue_se_traducen() {
        assert_eq!(codigo_de_error_geoclue("org.freedesktop.GeoClue2.Error.PermissionDenied"), Codigo::Denegado);
        assert_eq!(codigo_de_error_geoclue("org.freedesktop.GeoClue2.Error.Disabled"), Codigo::ServiciosApagados);
        assert_eq!(codigo_de_error_geoclue("org.freedesktop.DBus.Error.ServiceUnknown"), Codigo::NoDisponible);
        assert_eq!(codigo_de_error_geoclue("org.freedesktop.DBus.Error.NameHasNoOwner"), Codigo::NoDisponible);
        assert_eq!(codigo_de_error_geoclue("org.freedesktop.GeoClue2.Error.Internal"), Codigo::SinFijar);
    }

    #[test]
    fn cada_error_dice_donde_cambiarlo_en_su_sistema() {
        let m = motivo_de(Codigo::Denegado, "macos");
        assert!(m.contains("No diste permiso") && m.contains("Privacidad y seguridad › Localización"), "{m}");
        let a = motivo_de(Codigo::Denegado, "android");
        assert!(a.contains("Aplicaciones › StarSeed › Permisos › Ubicación"), "{a}");
        let s = motivo_de(Codigo::ServiciosApagados, "macos");
        assert!(s.contains("apagada") && s.contains("Servicios de localización"), "{s}");
        // «No diste permiso» y «el aparato no pudo» son mensajes distintos.
        assert_ne!(motivo_de(Codigo::Denegado, "android"), motivo_de(Codigo::SinFijar, "android"));
        assert!(motivo_de(Codigo::SinFijar, "android").contains("no pudo fijar"));
        assert!(!motivo_de(Codigo::SinPreguntar, "macos").contains("Ajustes del Sistema"), "sin preguntar no manda a los ajustes");
    }

    #[test]
    fn sin_preguntar_solo_pregunta_si_la_persona_lo_pidio() {
        assert_eq!(error_de_permiso(Permiso::SinPreguntar, false), Some(Codigo::SinPreguntar));
        assert_eq!(error_de_permiso(Permiso::SinPreguntar, true), None);
        assert_eq!(error_de_permiso(Permiso::Denegado, true), Some(Codigo::Denegado), "pedir no insiste con lo denegado");
        assert_eq!(error_de_permiso(Permiso::Restringido, true), Some(Codigo::Restringido));
        assert_eq!(error_de_permiso(Permiso::Concedido, false), None);
        assert_eq!(error_de_permiso(Permiso::Aproximado, false), None);
    }

    #[test]
    fn la_hora_de_la_medida_decide_si_es_de_ahora() {
        let f = Fix { t_ms: 10_000, ..Default::default() };
        assert!(es_reciente(&f, 20_000, 15_000));
        assert!(!es_reciente(&f, 30_000, 15_000));
        assert!(es_reciente(&f, 5_000, 1), "una hora futura (reloj distinto) no es vieja");
    }

    fn estado(json: &str) -> EstadoKotlin {
        serde_json::from_str(json).unwrap()
    }

    #[test]
    fn respuesta_espera_a_que_kotlin_atienda_la_peticion() {
        let e = estado(r#"{"version":1,"respuesta_a":5,"permiso":"concedido","fix":{"lat":40.1,"lon":-3.2,"precision_m":12.5,"t_ms":99,"fuente":"gps"}}"#);
        assert!(respuesta_a(&e, 6, "android").is_none(), "la 6 aún no se atendió");
        let r = respuesta_a(&e, 5, "android").unwrap();
        assert!(r.ok);
        let f = r.fix.unwrap();
        assert_eq!((f.lat, f.lon, f.precision_m, f.t_ms, f.fuente.as_str()), (40.1, -3.2, Some(12.5), 99, "gps"));
    }

    #[test]
    fn el_error_de_kotlin_llega_con_su_codigo_y_su_texto() {
        let e = estado(r#"{"version":1,"respuesta_a":3,"permiso":"denegado","error":{"codigo":"denegado"}}"#);
        let r = respuesta_a(&e, 3, "android").unwrap();
        assert!(!r.ok);
        let er = r.error.unwrap();
        assert_eq!(er.codigo, Codigo::Denegado);
        assert!(er.motivo.contains("Permisos › Ubicación"));
        // Un código que esta versión no conoce no se disfraza de otro: «no disponible».
        let raro = estado(r#"{"version":1,"respuesta_a":3,"error":{"codigo":"inventado"}}"#);
        assert_eq!(respuesta_a(&raro, 3, "android").unwrap().error.unwrap().codigo, Codigo::NoDisponible);
    }

    #[test]
    fn una_medida_imposible_de_kotlin_no_se_enseña() {
        let e = estado(r#"{"version":1,"respuesta_a":1,"fix":{"lat":123.0,"lon":0.0,"t_ms":1}}"#);
        let r = respuesta_a(&e, 1, "android").unwrap();
        assert!(!r.ok && r.error.unwrap().codigo == Codigo::SinFijar);
    }

    #[test]
    fn ultima_distingue_sin_permiso_de_sin_medida() {
        let sin_permiso = estado(r#"{"version":1,"permiso":"denegado"}"#);
        assert_eq!(ultima_de(&sin_permiso, "android").error.unwrap().codigo, Codigo::Denegado);
        let sin_servicios = estado(r#"{"version":1,"permiso":"concedido","servicios":false}"#);
        assert_eq!(ultima_de(&sin_servicios, "android").error.unwrap().codigo, Codigo::ServiciosApagados);
        let aun_nada = estado(r#"{"version":1,"permiso":"concedido","servicios":true}"#);
        assert_eq!(ultima_de(&aun_nada, "android").error.unwrap().codigo, Codigo::SinFijar);
        let con = estado(r#"{"version":1,"permiso":"aproximado","fix":{"lat":1.0,"lon":2.0,"t_ms":5}}"#);
        assert!(ultima_de(&con, "android").ok);
    }

    #[test]
    fn peticiones_validas_y_archivos_ordenados_sin_temporales() {
        assert!(peticion_json(1, "ahora", true).unwrap().contains("\"orden\":\"ahora\""));
        assert!(peticion_json(1, "conceder", true).is_err(), "la app no tiene orden de concederse nada");
        let dir = std::env::temp_dir().join(format!("ubi1114k-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        escribir_peticion(&dir, 2, &peticion_json(2, "parar", false).unwrap()).unwrap();
        escribir_peticion(&dir, 10, &peticion_json(10, "estado", false).unwrap()).unwrap();
        let mut nombres: Vec<String> = std::fs::read_dir(&dir).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().to_string()).collect();
        nombres.sort();
        assert_eq!(nombres.len(), 2);
        assert!(nombres[0] < nombres[1], "el orden de los nombres es el de las peticiones: {nombres:?}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn leer_estado_ignora_archivos_rotos() {
        let dir = std::env::temp_dir().join(format!("ubi1114k-e-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        assert!(leer_estado(&dir).is_none());
        std::fs::write(dir.join(ESTADO), "{no es json").unwrap();
        assert!(leer_estado(&dir).is_none());
        std::fs::write(dir.join(ESTADO), r#"{"version":1,"permiso":"concedido"}"#).unwrap();
        assert!(leer_estado(&dir).is_some());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn los_permisos_viajan_en_kebab() {
        assert_eq!(serde_json::to_string(&Permiso::SinPreguntar).unwrap(), "\"sin-preguntar\"");
        assert_eq!(serde_json::to_string(&Codigo::ServiciosApagados).unwrap(), "\"servicios-apagados\"");
        for p in [Permiso::Concedido, Permiso::Aproximado, Permiso::SinPreguntar, Permiso::Denegado, Permiso::Restringido, Permiso::NoDisponible] {
            let t = serde_json::to_string(&p).unwrap();
            assert_eq!(permiso_de_texto(t.trim_matches('"')), p);
        }
    }
}
