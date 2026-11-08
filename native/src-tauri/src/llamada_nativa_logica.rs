
// ═══════════════════════════════════════════════════════════════════════════
// llamada_nativa_logica — lo PURO de la integración de las llamadas con el teléfono (LLA1108D, 2026-11-08).
// Contrato: architecture/llamadas-telefonia.md § «Integración nativa». Sin Tauri: se prueba sin la app.
// ---------------------------------------------------------------------------
// La web (src/lib/llamadas/nativa/puente-llamada-nativa.ts) cuenta el ciclo de vida de la llamada y Android
// (LlamadaNativaStarSeed.kt: Telecom autogestionado, notificación CallStyle, servicio en primer plano,
// rutas de audio y sensor de proximidad) lo hace «de verdad» para el sistema. Entre los dos, archivos en
// filesDir/starseed/llamada-nativa, como el enlace Wi-Fi directo:
//   · Rust → Kotlin: una COLA de peticiones `peticion-<n>.json` (varias seguidas no se pisan);
//   · Kotlin → Rust: `estado.json` (lo que hay ahora + los últimos eventos con número creciente).
// Aquí: validación de lo que llega de la web, la máquina de estados de la sesión nativa, las peticiones y
// la lectura de lo que dice Kotlin (qué eventos son nuevos y cuáles valen).
// ═══════════════════════════════════════════════════════════════════════════

// Fuera de Android solo la usan las pruebas y macOS/escritorio por partes: no es código muerto.
#![cfg_attr(not(target_os = "android"), allow(dead_code))]

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Carpeta (dentro de filesDir/starseed) compartida con Kotlin.
pub const CARPETA_ANDROID: &str = "llamada-nativa";
pub const PREFIJO_PETICION: &str = "peticion-";
pub const ESTADO: &str = "estado.json";

/// Prefijo de los eventos que se emiten a la web.
pub const PREFIJO_EVENTO: &str = "llamada-nativa://";
/// Eventos que Kotlin puede contar. `espera` lo añade el teléfono (otra llamada, auriculares): la web puede
/// ignorarlo.
pub const EVENTOS: [&str; 7] = ["contestar", "rechazar", "colgar", "silenciar", "ruta", "proximidad", "espera"];

/// Rutas de audio que conoce la web (y Kotlin).
pub const RUTAS: [&str; 4] = ["auricular", "altavoz", "cableado", "bluetooth"];

/// Acciones que Rust pide a Kotlin (todas las atiende `LlamadaNativaStarSeed.kt`).
pub const ACCIONES: [&str; 5] = ["iniciar", "estado", "ruta", "proximidad", "permiso"];

pub const TOPE_ID: usize = 80;
pub const TOPE_NOMBRE: usize = 60;
/// Tope de eventos que se recuerdan a los dos lados (Kotlin guarda los últimos).
pub const TOPE_EVENTOS: usize = 32;

// ─────────────────────────────── Validación ───────────────────────────────

/// Id de llamada: el mismo en los dos aparatos (UUID o `ll-…`). Nada de controles ni de rutas.
pub fn id_valido(id: &str) -> bool {
    !id.is_empty() && id.len() <= TOPE_ID && id.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | ':' | '@'))
}

/// El nombre que sale en la notificación: sin saltos ni controles, recortado.
pub fn nombre_limpio(nombre: &str) -> String {
    let s: String = nombre.chars().map(|c| if c.is_control() { ' ' } else { c }).collect();
    let s = s.split_whitespace().collect::<Vec<_>>().join(" ");
    let s: String = s.chars().take(TOPE_NOMBRE).collect();
    if s.is_empty() {
        "StarSeed".to_string()
    } else {
        s
    }
}

/// «voz» o «video» (también se acepta «vídeo» y «audio»).
pub fn tipo_valido(tipo: &str) -> Option<&'static str> {
    match tipo.trim().to_lowercase().as_str() {
        "voz" | "audio" | "voice" => Some("voz"),
        "video" | "vídeo" => Some("video"),
        _ => None,
    }
}

pub fn ruta_valida(ruta: &str) -> bool {
    RUTAS.contains(&ruta)
}

// ─────────────────────────────── Máquina de estados ───────────────────────────────

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Fase {
    Sonando,
    Activa,
    EnEspera,
    Terminada,
}

impl Fase {
    pub fn desde_texto(t: &str) -> Option<Fase> {
        match t {
            "sonando" => Some(Fase::Sonando),
            "activa" => Some(Fase::Activa),
            "en-espera" => Some(Fase::EnEspera),
            "terminada" => Some(Fase::Terminada),
            _ => None,
        }
    }
    pub fn texto(self) -> &'static str {
        match self {
            Fase::Sonando => "sonando",
            Fase::Activa => "activa",
            Fase::EnEspera => "en-espera",
            Fase::Terminada => "terminada",
        }
    }
}

/// ¿Se puede pasar de una fase a otra? Repetir la misma vale (la web puede avisar dos veces).
pub fn transicion_valida(de: Fase, a: Fase) -> bool {
    use Fase::*;
    if de == a {
        return true;
    }
    matches!((de, a), (Sonando, Activa) | (Sonando, Terminada) | (Activa, EnEspera) | (Activa, Terminada) | (EnEspera, Activa) | (EnEspera, Terminada))
}

/// La llamada que sigue la parte nativa (solo UNA a la vez: el teléfono tampoco mezcla dos de StarSeed).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Sesion {
    pub id: String,
    pub fase: Fase,
}

/// Qué hacer con un `iniciar`: empezar, repetir (misma llamada) o rechazar (hay otra).
#[derive(Debug, PartialEq, Eq)]
pub enum Inicio {
    Nueva,
    Repetida,
    Ocupado(String),
}

pub fn decidir_inicio(actual: Option<&Sesion>, id: &str) -> Inicio {
    match actual {
        Some(s) if s.id == id && s.fase != Fase::Terminada => Inicio::Repetida,
        Some(s) if s.fase != Fase::Terminada => Inicio::Ocupado(s.id.clone()),
        _ => Inicio::Nueva,
    }
}

/// Aplica un cambio de estado de la web a la sesión. Devuelve la fase nueva o por qué no vale.
pub fn aplicar_estado(actual: Option<&Sesion>, id: &str, estado: &str) -> Result<Fase, String> {
    let nueva = Fase::desde_texto(estado).ok_or_else(|| format!("«{estado}» no es un estado de llamada (sonando, activa, en-espera, terminada)."))?;
    let Some(s) = actual else {
        // Terminar una llamada que ya no está es un no-op válido (la web avisa siempre al colgar).
        return if nueva == Fase::Terminada { Ok(Fase::Terminada) } else { Err("No hay ninguna llamada nativa en curso.".into()) };
    };
    if s.id != id {
        return if nueva == Fase::Terminada { Ok(Fase::Terminada) } else { Err("Esa no es la llamada nativa en curso.".into()) };
    }
    if !transicion_valida(s.fase, nueva) {
        return Err(format!("Una llamada «{}» no puede pasar a «{}».", s.fase.texto(), nueva.texto()));
    }
    Ok(nueva)
}

// ─────────────────────────────── Peticiones a Kotlin ───────────────────────────────

pub fn nombre_peticion(secuencia: u64) -> String {
    format!("{PREFIJO_PETICION}{secuencia:020}.json")
}

pub fn peticion_iniciar(id: &str, nombre: &str, tipo: &str, entrante: bool, ahora_ms: u64) -> Result<String, String> {
    if !id_valido(id) {
        return Err("El id de la llamada no es válido.".into());
    }
    let tipo = tipo_valido(tipo).ok_or_else(|| format!("El tipo de llamada «{tipo}» no es válido (voz o video)."))?;
    serde_json::to_string(&serde_json::json!({
        "accion": "iniciar", "id": id, "nombre": nombre_limpio(nombre), "tipo": tipo, "entrante": entrante, "t": ahora_ms
    }))
    .map_err(|e| e.to_string())
}

pub fn peticion_estado(id: &str, fase: Fase, silenciada: Option<bool>, ahora_ms: u64) -> Result<String, String> {
    if !id_valido(id) {
        return Err("El id de la llamada no es válido.".into());
    }
    let mut v = serde_json::json!({ "accion": "estado", "id": id, "estado": fase.texto(), "t": ahora_ms });
    if let Some(s) = silenciada {
        v["silenciada"] = serde_json::Value::Bool(s);
    }
    serde_json::to_string(&v).map_err(|e| e.to_string())
}

pub fn peticion_ruta(ruta: &str, ahora_ms: u64) -> Result<String, String> {
    if !ruta_valida(ruta) {
        return Err(format!("La ruta de audio «{ruta}» no es válida (auricular, altavoz, cableado o bluetooth)."));
    }
    serde_json::to_string(&serde_json::json!({ "accion": "ruta", "ruta": ruta, "t": ahora_ms })).map_err(|e| e.to_string())
}

pub fn peticion_proximidad(activa: bool, ahora_ms: u64) -> String {
    serde_json::json!({ "accion": "proximidad", "activa": activa, "t": ahora_ms }).to_string()
}

pub fn peticion_permiso(ahora_ms: u64) -> String {
    serde_json::json!({ "accion": "permiso", "t": ahora_ms }).to_string()
}

// ─────────────────────────────── Lo que dice Kotlin ───────────────────────────────

#[derive(Deserialize, Clone, Debug, Default, PartialEq)]
pub struct EventoKotlin {
    #[serde(default)]
    pub n: u64,
    #[serde(default)]
    pub tipo: String,
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub valor: serde_json::Value,
}

/// `estado.json` tal como lo escribe Kotlin. Todo con valor por defecto: un archivo viejo o a medias se lee.
#[derive(Deserialize, Clone, Debug, Default, PartialEq)]
pub struct EstadoKotlin {
    #[serde(default)]
    pub version: u32,
    /// Hora en que arrancó la parte Android: si cambia, los números de evento empiezan de nuevo.
    #[serde(default)]
    pub epoca: u64,
    #[serde(default)]
    pub sdk: u32,
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub fase: String,
    #[serde(default)]
    pub ruta: String,
    #[serde(default)]
    pub rutas: Vec<String>,
    #[serde(default)]
    pub proximidad: bool,
    #[serde(default)]
    pub silenciada: bool,
    /// ¿Android aceptó la cuenta de teléfono autogestionada de StarSeed?
    #[serde(default)]
    pub telecom: bool,
    #[serde(default)]
    pub notificaciones: bool,
    /// «concedido» | «denegado» | «no-aplica».
    #[serde(default)]
    pub pantalla_completa: String,
    /// Hay sensor de proximidad y Android deja apagar la pantalla con él.
    #[serde(default)]
    pub sensor_proximidad: bool,
    #[serde(default)]
    pub eventos: Vec<EventoKotlin>,
}

pub fn leer_estado(dir: &Path) -> Option<EstadoKotlin> {
    let texto = std::fs::read_to_string(dir.join(ESTADO)).ok()?;
    let e: EstadoKotlin = serde_json::from_str(&texto).ok()?;
    (e.version > 0).then_some(e)
}

/// Qué eventos ya se emitieron.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Seguimiento {
    pub epoca: u64,
    pub ultimo: u64,
}

/// Lo que se emite a la web: `llamada-nativa://<tipo>` con `{ id, valor }`.
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct CargaEvento {
    pub id: String,
    pub valor: serde_json::Value,
}

/// Los eventos nuevos de Kotlin, en orden y ya validados (los raros se descartan sin ruido). Actualiza el
/// seguimiento. Pura.
pub fn eventos_nuevos(estado: &EstadoKotlin, seg: &mut Seguimiento) -> Vec<(String, CargaEvento)> {
    if estado.epoca != seg.epoca {
        *seg = Seguimiento { epoca: estado.epoca, ultimo: 0 };
    }
    let mut lista: Vec<&EventoKotlin> = estado.eventos.iter().filter(|e| e.n > seg.ultimo).collect();
    lista.sort_by_key(|e| e.n);
    let mut fuera = Vec::new();
    for e in lista.into_iter().take(TOPE_EVENTOS) {
        seg.ultimo = e.n;
        if !EVENTOS.contains(&e.tipo.as_str()) || !id_valido(&e.id) {
            continue;
        }
        let valor = match e.tipo.as_str() {
            "silenciar" | "proximidad" | "espera" => match e.valor.as_bool() {
                Some(b) => serde_json::Value::Bool(b),
                None => continue,
            },
            "ruta" => match e.valor.as_str() {
                Some(r) if ruta_valida(r) => serde_json::Value::String(r.to_string()),
                _ => continue,
            },
            _ => serde_json::Value::Null,
        };
        fuera.push((format!("{PREFIJO_EVENTO}{}", e.tipo), CargaEvento { id: e.id.clone(), valor }));
    }
    fuera
}

// ─────────────────────────────── Capacidades ───────────────────────────────

/// Lo que puede este aparato en llamadas (la web lo lee para explicar y para elegir qué enseñar).
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct CapacidadesLlamada {
    pub plataforma: String,
    /// Hay integración nativa (Android con el parche; macOS: evita la suspensión).
    pub nativa: bool,
    /// Android aceptó la cuenta de teléfono autogestionada (audio, auriculares y prioridad de llamada reales).
    pub telecom: bool,
    /// Las notificaciones están permitidas (sin ellas no hay aviso de llamada con la app cerrada).
    pub notificaciones: bool,
    /// «concedido» | «denegado» | «no-aplica»: aviso a pantalla completa sobre el bloqueo (Android 14+ lo pide).
    pub pantalla_completa: String,
    /// El sensor de proximidad puede apagar la pantalla junto a la cara.
    pub proximidad: bool,
    /// Rutas de audio disponibles ahora.
    pub rutas: Vec<String>,
    pub ruta: String,
    /// El aparato no se duerme durante la llamada (escritorio).
    pub evita_suspension: bool,
    /// Si falta algo, por qué (en claro, para enseñarlo).
    pub motivo: String,
}

pub fn capacidades_sin_soporte(plataforma: &str, motivo: &str) -> CapacidadesLlamada {
    CapacidadesLlamada {
        plataforma: plataforma.to_string(),
        nativa: false,
        telecom: false,
        notificaciones: false,
        pantalla_completa: "no-aplica".into(),
        proximidad: false,
        rutas: Vec::new(),
        ruta: String::new(),
        evita_suspension: false,
        motivo: motivo.to_string(),
    }
}

pub fn capacidades_macos() -> CapacidadesLlamada {
    CapacidadesLlamada {
        plataforma: "macos".into(),
        nativa: true,
        telecom: false,
        notificaciones: false,
        pantalla_completa: "no-aplica".into(),
        proximidad: false,
        rutas: Vec::new(),
        ruta: String::new(),
        evita_suspension: true,
        motivo: "En el Mac la app no se duerme durante la llamada; el audio lo elige el sistema.".into(),
    }
}

fn motivo_android(e: &EstadoKotlin) -> String {
    if !e.telecom {
        return "Android no aceptó la cuenta de llamadas de StarSeed: la llamada suena y se contesta, pero sin la prioridad ni los botones de auriculares del teléfono.".into();
    }
    if e.pantalla_completa == "denegado" {
        return "Para que la llamada aparezca sobre el bloqueo, permite «Notificaciones a pantalla completa» a StarSeed en los ajustes del teléfono; mientras, llega como aviso emergente.".into();
    }
    if !e.notificaciones {
        return "Las notificaciones de StarSeed están apagadas: con la app cerrada no se oirá la llamada.".into();
    }
    String::new()
}

/// Capacidades en Android a partir de lo que escribió Kotlin (None: este APK no trae el módulo).
pub fn capacidades_android(estado: Option<&EstadoKotlin>) -> CapacidadesLlamada {
    let Some(e) = estado else {
        return capacidades_sin_soporte("android", "Este APK no trae las llamadas nativas (llegaron con LLA1108D): actualízalo.");
    };
    CapacidadesLlamada {
        plataforma: "android".into(),
        nativa: true,
        telecom: e.telecom,
        notificaciones: e.notificaciones,
        pantalla_completa: if e.pantalla_completa.is_empty() { "no-aplica".into() } else { e.pantalla_completa.clone() },
        proximidad: e.sensor_proximidad,
        rutas: e.rutas.iter().filter(|r| ruta_valida(r)).cloned().collect(),
        ruta: if ruta_valida(&e.ruta) { e.ruta.clone() } else { String::new() },
        evita_suspension: false,
        motivo: motivo_android(e),
    }
}

// ─────────────────────────────── Cola de peticiones ───────────────────────────────

/// Escribe una petición en la cola de Kotlin (archivo temporal + renombrar: nunca se lee a medias).
pub fn escribir_peticion(dir: &Path, secuencia: u64, texto: &str) -> Result<PathBuf, String> {
    std::fs::create_dir_all(dir).map_err(|e| format!("No se pudo crear {}: {e}", dir.display()))?;
    let destino = dir.join(nombre_peticion(secuencia));
    let tmp = dir.join(format!(".{}.tmp", nombre_peticion(secuencia)));
    std::fs::write(&tmp, texto).map_err(|e| format!("No se pudo escribir la petición: {e}"))?;
    std::fs::rename(&tmp, &destino).map_err(|e| format!("No se pudo colocar la petición: {e}"))?;
    Ok(destino)
}

/// Argumentos de `caffeinate` (macOS) para que el Mac no se duerma mientras viva este proceso. Pura.
pub fn argumentos_caffeinate(pid: u32) -> Vec<String> {
    // -i: no dormir por inactividad · -s: tampoco con la tapa abierta enchufado · -w: se va solo con la app.
    vec!["-i".into(), "-s".into(), "-w".into(), pid.to_string()]
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn ev(n: u64, tipo: &str, id: &str, valor: serde_json::Value) -> EventoKotlin {
        EventoKotlin { n, tipo: tipo.into(), id: id.into(), valor }
    }

    #[test]
    fn ids_validos_y_peligrosos() {
        assert!(id_valido("ll-abc123"));
        assert!(id_valido("3f2b1c9e-1111-4222-8333-444455556666"));
        assert!(!id_valido(""));
        assert!(!id_valido("../etc"));
        assert!(!id_valido("a b"));
        assert!(!id_valido("a\nb"));
        assert!(!id_valido(&"x".repeat(TOPE_ID + 1)));
        assert!(id_valido(&"x".repeat(TOPE_ID)));
    }

    #[test]
    fn nombre_sin_controles_ni_largo() {
        assert_eq!(nombre_limpio("  Ana \n  López\t"), "Ana López");
        assert_eq!(nombre_limpio("\n\t"), "StarSeed");
        assert_eq!(nombre_limpio(&"é".repeat(200)).chars().count(), TOPE_NOMBRE);
    }

    #[test]
    fn tipos_y_rutas() {
        assert_eq!(tipo_valido("voz"), Some("voz"));
        assert_eq!(tipo_valido("Vídeo"), Some("video"));
        assert_eq!(tipo_valido("fax"), None);
        for r in RUTAS {
            assert!(ruta_valida(r));
        }
        assert!(!ruta_valida("") && !ruta_valida("Altavoz") && !ruta_valida("altavoz;x"));
    }

    #[test]
    fn maquina_de_estados() {
        use Fase::*;
        assert!(transicion_valida(Sonando, Activa));
        assert!(transicion_valida(Activa, EnEspera) && transicion_valida(EnEspera, Activa));
        assert!(transicion_valida(Sonando, Terminada) && transicion_valida(EnEspera, Terminada));
        assert!(transicion_valida(Activa, Activa), "repetir no rompe");
        assert!(!transicion_valida(Sonando, EnEspera), "no se pone en espera lo que aún suena");
        assert!(!transicion_valida(Terminada, Activa), "una llamada acabada no resucita");
        assert!(!transicion_valida(Activa, Sonando));
    }

    #[test]
    fn inicio_una_sola_llamada() {
        let s = Sesion { id: "a".into(), fase: Fase::Activa };
        assert_eq!(decidir_inicio(None, "a"), Inicio::Nueva);
        assert_eq!(decidir_inicio(Some(&s), "a"), Inicio::Repetida);
        assert_eq!(decidir_inicio(Some(&s), "b"), Inicio::Ocupado("a".into()));
        let t = Sesion { id: "a".into(), fase: Fase::Terminada };
        assert_eq!(decidir_inicio(Some(&t), "b"), Inicio::Nueva);
        assert_eq!(decidir_inicio(Some(&t), "a"), Inicio::Nueva, "la misma id, ya acabada, puede volver a sonar");
    }

    #[test]
    fn aplicar_estado_valida() {
        let s = Sesion { id: "a".into(), fase: Fase::Sonando };
        assert_eq!(aplicar_estado(Some(&s), "a", "activa"), Ok(Fase::Activa));
        assert!(aplicar_estado(Some(&s), "a", "en-espera").is_err());
        assert!(aplicar_estado(Some(&s), "a", "colgada").unwrap_err().contains("colgada"));
        assert!(aplicar_estado(Some(&s), "b", "activa").is_err());
        assert_eq!(aplicar_estado(Some(&s), "b", "terminada"), Ok(Fase::Terminada), "terminar otra id no estorba");
        assert_eq!(aplicar_estado(None, "a", "terminada"), Ok(Fase::Terminada));
        assert!(aplicar_estado(None, "a", "activa").is_err());
    }

    #[test]
    fn peticiones_bien_formadas() {
        let p: serde_json::Value = serde_json::from_str(&peticion_iniciar("ll-1", " Ana\n", "Voz", true, 7).unwrap()).unwrap();
        assert_eq!(p["accion"], "iniciar");
        assert_eq!(p["nombre"], "Ana");
        assert_eq!(p["tipo"], "voz");
        assert_eq!(p["entrante"], true);
        assert!(peticion_iniciar("../x", "a", "voz", false, 0).is_err());
        assert!(peticion_iniciar("ll-1", "a", "fax", false, 0).is_err());
        let e: serde_json::Value = serde_json::from_str(&peticion_estado("ll-1", Fase::Activa, Some(true), 1).unwrap()).unwrap();
        assert_eq!((e["estado"].as_str(), e["silenciada"].as_bool()), (Some("activa"), Some(true)));
        let sin: serde_json::Value = serde_json::from_str(&peticion_estado("ll-1", Fase::EnEspera, None, 1).unwrap()).unwrap();
        assert!(sin.get("silenciada").is_none());
        assert!(peticion_ruta("moto", 0).is_err());
        assert!(peticion_ruta("altavoz", 0).unwrap().contains("\"ruta\":\"altavoz\""));
        assert!(peticion_proximidad(false, 0).contains("\"activa\":false"));
        // Todas las acciones que Rust escribe están en la lista que Kotlin atiende.
        for texto in [peticion_iniciar("a", "n", "voz", false, 0).unwrap(), peticion_estado("a", Fase::Activa, None, 0).unwrap(), peticion_ruta("altavoz", 0).unwrap(), peticion_proximidad(true, 0), peticion_permiso(0)] {
            let v: serde_json::Value = serde_json::from_str(&texto).unwrap();
            assert!(ACCIONES.contains(&v["accion"].as_str().unwrap()), "{texto}");
        }
    }

    #[test]
    fn nombres_de_peticion_ordenan_como_numeros() {
        assert!(nombre_peticion(9) < nombre_peticion(10));
        assert!(nombre_peticion(1_700_000_000_000_000) < nombre_peticion(1_700_000_000_000_001));
        assert!(nombre_peticion(5).starts_with(PREFIJO_PETICION) && nombre_peticion(5).ends_with(".json"));
    }

    #[test]
    fn eventos_nuevos_en_orden_y_una_vez() {
        let est = EstadoKotlin {
            version: 1,
            epoca: 10,
            eventos: vec![
                ev(2, "colgar", "a", serde_json::Value::Null),
                ev(1, "contestar", "a", serde_json::Value::Null),
                ev(3, "silenciar", "a", serde_json::json!(true)),
            ],
            ..Default::default()
        };
        let mut seg = Seguimiento::default();
        let fuera = eventos_nuevos(&est, &mut seg);
        let nombres: Vec<&str> = fuera.iter().map(|(n, _)| n.as_str()).collect();
        assert_eq!(nombres, ["llamada-nativa://contestar", "llamada-nativa://colgar", "llamada-nativa://silenciar"]);
        assert_eq!(fuera[2].1.valor, serde_json::json!(true));
        assert_eq!(seg, Seguimiento { epoca: 10, ultimo: 3 });
        assert!(eventos_nuevos(&est, &mut seg).is_empty(), "no se repiten");
    }

    #[test]
    fn eventos_raros_se_descartan_pero_avanzan() {
        let est = EstadoKotlin {
            version: 1,
            epoca: 1,
            eventos: vec![
                ev(1, "formatear", "a", serde_json::Value::Null),
                ev(2, "ruta", "a", serde_json::json!("moto")),
                ev(3, "silenciar", "a", serde_json::json!("si")),
                ev(4, "colgar", "../x", serde_json::Value::Null),
                ev(5, "ruta", "a", serde_json::json!("bluetooth")),
            ],
            ..Default::default()
        };
        let mut seg = Seguimiento::default();
        let fuera = eventos_nuevos(&est, &mut seg);
        assert_eq!(fuera.len(), 1);
        assert_eq!(fuera[0].0, "llamada-nativa://ruta");
        assert_eq!(seg.ultimo, 5);
    }

    #[test]
    fn otra_epoca_reinicia_la_cuenta() {
        let mut est = EstadoKotlin { version: 1, epoca: 1, eventos: vec![ev(7, "colgar", "a", serde_json::Value::Null)], ..Default::default() };
        let mut seg = Seguimiento::default();
        assert_eq!(eventos_nuevos(&est, &mut seg).len(), 1);
        // La app Android se reinició: los números vuelven a empezar y el evento nº 1 es nuevo.
        est.epoca = 2;
        est.eventos = vec![ev(1, "contestar", "b", serde_json::Value::Null)];
        let fuera = eventos_nuevos(&est, &mut seg);
        assert_eq!(fuera.len(), 1);
        assert_eq!(seg, Seguimiento { epoca: 2, ultimo: 1 });
    }

    #[test]
    fn el_estado_viejo_o_a_medias_se_lee() {
        let e: EstadoKotlin = serde_json::from_str(r#"{"version":1,"id":"a"}"#).unwrap();
        assert!(e.eventos.is_empty() && !e.telecom);
        let dir = std::env::temp_dir().join(format!("ss-llamada-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        assert!(leer_estado(&dir).is_none(), "sin archivo");
        std::fs::write(dir.join(ESTADO), "{basura").unwrap();
        assert!(leer_estado(&dir).is_none(), "ilegible");
        std::fs::write(dir.join(ESTADO), r#"{"version":0}"#).unwrap();
        assert!(leer_estado(&dir).is_none(), "versión 0 = Kotlin no escribió");
        std::fs::write(dir.join(ESTADO), r#"{"version":1,"telecom":true}"#).unwrap();
        assert!(leer_estado(&dir).unwrap().telecom);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn capacidades_android_explican_lo_que_falta() {
        let base = EstadoKotlin {
            version: 1,
            telecom: true,
            notificaciones: true,
            pantalla_completa: "concedido".into(),
            sensor_proximidad: true,
            ruta: "auricular".into(),
            rutas: vec!["auricular".into(), "altavoz".into(), "hola".into()],
            ..Default::default()
        };
        let c = capacidades_android(Some(&base));
        assert!(c.nativa && c.telecom && c.proximidad);
        assert_eq!(c.rutas, ["auricular", "altavoz"], "lo desconocido no se enseña");
        assert!(c.motivo.is_empty());
        let sin_pantalla = capacidades_android(Some(&EstadoKotlin { pantalla_completa: "denegado".into(), ..base.clone() }));
        assert!(sin_pantalla.motivo.contains("pantalla completa"));
        let sin_telecom = capacidades_android(Some(&EstadoKotlin { telecom: false, ..base.clone() }));
        assert!(sin_telecom.motivo.contains("cuenta de llamadas"));
        let sin_avisos = capacidades_android(Some(&EstadoKotlin { notificaciones: false, ..base }));
        assert!(sin_avisos.motivo.contains("notificaciones"));
        let viejo = capacidades_android(None);
        assert!(!viejo.nativa && viejo.motivo.contains("actualízalo"));
    }

    #[test]
    fn escritorio_sin_nativa_y_macos_sin_suspension() {
        let c = capacidades_sin_soporte("windows", "x");
        assert!(!c.nativa && !c.evita_suspension && c.rutas.is_empty() && c.pantalla_completa == "no-aplica");
        let m = capacidades_macos();
        assert!(m.nativa && m.evita_suspension && !m.telecom);
        assert_eq!(argumentos_caffeinate(42), ["-i", "-s", "-w", "42"]);
    }

    #[test]
    fn la_cola_escribe_en_orden_y_sin_restos() {
        let dir = std::env::temp_dir().join(format!("ss-llamada-cola-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        escribir_peticion(&dir, 2, "{\"accion\":\"estado\"}").unwrap();
        escribir_peticion(&dir, 1, "{\"accion\":\"iniciar\"}").unwrap();
        let mut nombres: Vec<String> = std::fs::read_dir(&dir).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().to_string()).collect();
        nombres.sort();
        assert_eq!(nombres.len(), 2, "sin temporales");
        assert!(nombres[0] < nombres[1] && std::fs::read_to_string(dir.join(&nombres[0])).unwrap().contains("iniciar"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
