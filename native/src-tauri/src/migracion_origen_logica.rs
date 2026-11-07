// ═══════════════════════════════════════════════════════════════════════════
// migracion_origen_logica — el núcleo PURO de la migración del origen web al origen local
// (APP1107B · T4, 2026-11-07). Contrato: architecture/apps-autonomas-sin-internet.md §2.1.
// ---------------------------------------------------------------------------
// Desde APP1107A la app de escritorio abre `http://127.0.0.1:<puerto>`; lo que la persona tenía en
// el localStorage/IndexedDB del origen de la web publicada se trae UNA vez (ventana oculta que
// exporta → página `/__starseed/migracion` del servidor local que importa). Aquí, lo que no toca ni
// Tauri ni el disco: cuándo está pendiente, el marcador, qué se quita SIEMPRE (la sesión de
// Supabase), qué no se escribe en la copia del disco (lo secreto), los trozos del IPC y el script de
// la ventana oculta. Solo `std` + `serde_json`. El pegamento con Tauri: `migracion_origen.rs`; la
// parte del navegador: `native/servidor-local/migracion-origen.js`.
// ═══════════════════════════════════════════════════════════════════════════

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

/// Versión de la migración (no de la app). El marcador «hecha» vale para esta versión: si un día
/// cambia lo que se trae (v2), se vuelve a pasar UNA vez, sin pisar nada (la fusión nunca sobrescribe).
pub const VERSION_MIGRACION: u32 = 1;
/// Formato del paquete que manda la ventana oculta (`FORMATO` en migracion-origen.js).
pub const FORMATO: &str = "starseed-migracion-origen";
/// Etiqueta de la ventana oculta (la capability `migracion-exportar` solo vale para ella).
pub const ETIQUETA_VENTANA: &str = "migracion-origen";
/// Página del servidor local que importa ANTES de abrir el OS.
pub const RUTA_IMPORTADOR: &str = "/__starseed/migracion";
/// Página ligera de la web publicada (HTML estático, sin el código del OS): solo hace falta su ORIGEN.
pub const PAGINA_EXPORTACION: &str = "/offline.html?starseed-migracion=1";
/// Tope de espera de la exportación (red + lectura de IndexedDB).
pub const ESPERA_EXPORTAR_MS: u64 = 40_000;
/// Tamaño de cada trozo que se devuelve a la página importadora (bytes UTF-8, aprox.).
pub const TAM_TROZO: usize = 1024 * 1024;
/// Trozos como mucho por exportación (≈ 256 MiB: muy por encima de los topes del JS).
pub const MAX_TROZOS: u32 = 256;
/// Intentos fallidos antes de dejarlo (la página importadora retrasaría cada arranque).
pub const MAX_INTENTOS: u32 = 3;
/// Carpeta (en el directorio de datos de la app) con el marcador y las copias.
pub const DIR: &str = "migracion-origen";
pub const MARCADOR: &str = "estado.json";

// ───────────────────────────── Marcador ─────────────────────────────

/// Lo que queda en `<app_data>/migracion-origen/estado.json`.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct Marcador {
    pub version_migracion: u32,
    /// "hecha" | "pospuesta" | "abandonada"
    pub resultado: String,
    pub intentos: u32,
    pub version_app: String,
    pub fecha_ms: u64,
    pub copia: Option<String>,
    pub motivo: Option<String>,
    pub resumen: Option<Value>,
}

pub fn leer_marcador(texto: &str) -> Option<Marcador> {
    serde_json::from_str::<Marcador>(texto).ok()
}

/// ¿Hay que pasar por la migración en este arranque?
pub fn pendiente(m: Option<&Marcador>) -> bool {
    match m {
        None => true,
        Some(m) if m.version_migracion < VERSION_MIGRACION => true,
        Some(m) => !(m.resultado == "hecha" || m.resultado == "abandonada"),
    }
}

/// El marcador después de que la página importadora diga cómo fue.
pub fn tras_confirmar(
    previo: Option<&Marcador>,
    resultado: &str,
    motivo: Option<String>,
    resumen: Option<Value>,
    copia: Option<String>,
    version_app: &str,
    ahora_ms: u64,
) -> Marcador {
    let mismo_ciclo = previo.filter(|p| p.version_migracion == VERSION_MIGRACION);
    let intentos = mismo_ciclo.map(|p| p.intentos).unwrap_or(0) + 1;
    let resultado = if resultado == "hecha" {
        "hecha"
    } else if intentos >= MAX_INTENTOS {
        "abandonada"
    } else {
        "pospuesta"
    };
    Marcador {
        version_migracion: VERSION_MIGRACION,
        resultado: resultado.to_string(),
        intentos,
        version_app: version_app.to_string(),
        fecha_ms: ahora_ms,
        copia: copia.or_else(|| mismo_ciclo.and_then(|p| p.copia.clone())),
        motivo,
        resumen,
    }
}

// ───────────────────────────── Sesión y secretos ─────────────────────────────

/// Claves de sesión de Supabase (`sb-<proyecto>-auth-token`, sus trozos y su `-code-verifier`) y la
/// clave antigua de supabase-js v1. Mismo criterio que `esClaveDeSesion` del JS.
pub fn es_clave_de_sesion(clave: &str) -> bool {
    let c = clave.to_ascii_lowercase();
    (c.starts_with("sb-") && c.contains("-auth-token")) || c.starts_with("supabase.auth.")
}

/// Un valor con `access_token` y `refresh_token` es una sesión, se llame como se llame su clave.
pub fn parece_sesion(valor: &str) -> bool {
    valor.contains("refresh_token") && valor.contains("access_token")
}

/// Lo que dejó el saneado (para el registro y el estado).
#[derive(Serialize, Clone, Debug, PartialEq, Default)]
pub struct Saneado {
    pub claves: usize,
    pub secretas: usize,
    pub sesiones_quitadas: usize,
    pub bases: usize,
    pub registros: usize,
}

/// Comprueba el paquete y quita SIEMPRE lo que parezca sesión (aunque el JS ya no lo mande: defensa
/// en profundidad). Lo que queda es lo que recibirá la página importadora.
pub fn sanear(datos: &mut Value, origen_esperado: &str) -> Result<Saneado, String> {
    let o = datos.as_object_mut().ok_or("los datos de la versión anterior no son un objeto")?;
    if o.get("formato").and_then(Value::as_str) != Some(FORMATO) {
        return Err("formato desconocido".into());
    }
    let version = o.get("version").and_then(Value::as_u64).ok_or("falta la versión")?;
    if version == 0 || version > u64::from(VERSION_MIGRACION) {
        return Err(format!("versión de migración desconocida: {version}"));
    }
    if o.get("origen").and_then(Value::as_str) != Some(origen_esperado) {
        return Err("los datos no vienen del origen de la web publicada".into());
    }
    let mut s = Saneado::default();
    let mut quitadas: Vec<String> = Vec::new();
    {
        let ls = o
            .get_mut("localStorage")
            .and_then(Value::as_object_mut)
            .ok_or("faltan los ajustes (localStorage)")?;
        ls.retain(|k, v| {
            let texto = v.as_str();
            let fuera = texto.is_none() || es_clave_de_sesion(k) || texto.map(parece_sesion).unwrap_or(false);
            if fuera {
                quitadas.push(k.clone());
            }
            !fuera
        });
        s.claves = ls.len();
    }
    s.sesiones_quitadas = quitadas.len();
    let secretas: Vec<Value> = o
        .get("secretas")
        .and_then(Value::as_array)
        .map(|l| l.iter().filter(|x| x.is_string()).cloned().collect())
        .unwrap_or_default();
    s.secretas = secretas.len();
    o.insert("secretas".into(), Value::Array(secretas));
    if !o.get("indexedDB").map(Value::is_array).unwrap_or(false) {
        o.insert("indexedDB".into(), Value::Array(Vec::new()));
    }
    for b in o.get("indexedDB").and_then(Value::as_array).into_iter().flatten() {
        if b.get("omitida").is_some() {
            continue;
        }
        s.bases += 1;
        for a in b.get("almacenes").and_then(Value::as_array).into_iter().flatten() {
            s.registros += a.get("registros").and_then(Value::as_array).map(Vec::len).unwrap_or(0);
        }
    }
    if !quitadas.is_empty() {
        let omitidas = o.entry("omitidas").or_insert_with(|| Value::Array(Vec::new()));
        if let Some(l) = omitidas.as_array_mut() {
            for k in quitadas {
                l.push(json!({"clave": k, "motivo": "sesion"}));
            }
        }
    }
    Ok(s)
}

/// La copia que se escribe en el disco: igual que los datos saneados, pero sin el VALOR de lo
/// secreto (claves de IA, identidad de la malla, tokens de los medios…). Lo secreto sigue en el
/// origen viejo (nunca se borra) y llega a la app nueva por IPC, sin pasar por ningún archivo.
pub fn copia_para_disco(datos: &Value) -> Value {
    let mut c = datos.clone();
    let secretas: Vec<String> = c
        .get("secretas")
        .and_then(Value::as_array)
        .map(|l| l.iter().filter_map(|x| x.as_str().map(str::to_string)).collect())
        .unwrap_or_default();
    if let Some(ls) = c.get_mut("localStorage").and_then(Value::as_object_mut) {
        let claves: Vec<String> = ls.keys().cloned().collect();
        for k in claves {
            let secreta = secretas.iter().any(|s| s == &k);
            let sesion = es_clave_de_sesion(&k) || ls.get(&k).and_then(Value::as_str).map(parece_sesion).unwrap_or(false);
            if sesion {
                ls.remove(&k);
            } else if secreta {
                let bytes = ls.get(&k).and_then(Value::as_str).map(str::len).unwrap_or(0);
                ls.insert(k, json!({"$ss": "omitido", "motivo": "secreto", "bytes": bytes}));
            }
        }
    }
    if let Some(o) = c.as_object_mut() {
        o.insert(
            "nota".into(),
            Value::String(
                "Copia de lo que la app tenía en el origen de la web publicada, hecha al pasar al servidor local. Sin la sesión ni los valores secretos (siguen en la versión anterior y en la app)."
                    .into(),
            ),
        );
    }
    c
}

pub fn nombre_copia(ahora_ms: u64, version_app: &str) -> String {
    let v: String = version_app.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '.' || *c == '-').collect();
    format!("copia-{}-{ahora_ms}.json", if v.is_empty() { "x" } else { &v })
}

// ───────────────────────────── Trozos ─────────────────────────────

/// Rangos [inicio, fin) de `texto` de como mucho `tam` bytes, sin partir un carácter UTF-8.
pub fn partir(texto: &str, tam: usize) -> Vec<(usize, usize)> {
    let tam = tam.max(4);
    let mut out = Vec::new();
    let mut i = 0;
    while i < texto.len() {
        let mut fin = (i + tam).min(texto.len());
        while !texto.is_char_boundary(fin) {
            fin -= 1;
        }
        out.push((i, fin));
        i = fin;
    }
    if out.is_empty() {
        out.push((0, 0));
    }
    out
}

/// Recepción por trozos de la ventana oculta: mismo `id`, `total` fijo, cada índice una vez.
#[derive(Debug, Default)]
pub struct Recepcion {
    pub id: Option<String>,
    pub trozos: Vec<Option<String>>,
}

impl Recepcion {
    /// Guarda un trozo. `Ok(Some(texto))` cuando ya están todos.
    pub fn poner(&mut self, id: &str, indice: u32, total: u32, trozo: String) -> Result<Option<String>, String> {
        if total == 0 || total > MAX_TROZOS {
            return Err(format!("número de trozos fuera de rango: {total}"));
        }
        if indice >= total {
            return Err("trozo fuera de rango".into());
        }
        match &self.id {
            Some(actual) if actual != id || self.trozos.len() != total as usize => {
                return Err("llegó otra exportación a la vez".into());
            }
            None => {
                self.id = Some(id.to_string());
                self.trozos = vec![None; total as usize];
            }
            _ => {}
        }
        self.trozos[indice as usize] = Some(trozo);
        if self.trozos.iter().all(Option::is_some) {
            let texto: String = self.trozos.iter_mut().map(|t| t.take().unwrap_or_default()).collect();
            self.id = None;
            self.trozos.clear();
            return Ok(Some(texto));
        }
        Ok(None)
    }
}

// ───────────────────────────── Orígenes y script ─────────────────────────────

/// `https://host[:puerto]` de una URL (sin ruta). Vacío si no se entiende.
pub fn origen_de(url: &str) -> String {
    let Some((esquema, resto)) = url.split_once("://") else { return String::new() };
    let fin = resto.find(['/', '?', '#']).unwrap_or(resto.len());
    let host = &resto[..fin];
    if host.is_empty() || host.contains('@') {
        return String::new();
    }
    format!("{}://{}", esquema.to_ascii_lowercase(), host.to_ascii_lowercase())
}

pub fn url_exportacion(web: &str) -> String {
    format!("{}{}", web.trim_end_matches('/'), PAGINA_EXPORTACION)
}

/// Script de inicio de la ventana oculta: el módulo entero + la llamada. Solo actúa en el origen de
/// la web publicada (en una página de error o tras una redirección a otro sitio, no hace nada).
pub fn script_exportacion(modulo_js: &str, web: &str) -> String {
    let origen = origen_de(web);
    format!(
        "{modulo_js}\n;(function(){{try{{var M=window.StarseedMigracionOrigen;if(!M||location.origin!=={o})return;if(window.__ssMigracionOrigen)return;window.__ssMigracionOrigen=1;M.invocador(window,8000).then(function(inv){{return M.exportarYEnviar({{invoke:inv,localStorage:window.localStorage,indexedDB:window.indexedDB,origen:location.origin}});}}).catch(function(){{}});}}catch(e){{}}}})();",
        o = cadena_js(&origen)
    )
}

fn cadena_js(s: &str) -> String {
    serde_json::to_string(s).unwrap_or_else(|_| "\"\"".into())
}

/// Resumen corto para el estado (lo que la web puede pintar sin leer todo el paquete).
pub fn resumen_estado(s: &Saneado) -> Value {
    let mut m = Map::new();
    m.insert("claves".into(), json!(s.claves));
    m.insert("secretas".into(), json!(s.secretas));
    m.insert("sesionesQuitadas".into(), json!(s.sesiones_quitadas));
    m.insert("bases".into(), json!(s.bases));
    m.insert("registros".into(), json!(s.registros));
    Value::Object(m)
}

// ───────────────────────────────── Pruebas ─────────────────────────────────

#[cfg(test)]
mod pruebas {
    use super::*;

    const WEB: &str = "https://starseed-os.vercel.app";

    fn paquete() -> Value {
        json!({
            "formato": FORMATO, "version": 1, "origen": WEB, "creado": "2026-11-07T00:00:00Z",
            "localStorage": {
                "appearance-config-v2": "{\"tema\":\"oscuro\"}",
                "starseed.ai.providers": "cifrado-local",
                "sb-abcd-auth-token": "{\"access_token\":\"a\",\"refresh_token\":\"r\"}",
                "rara": "{\"access_token\":1,\"refresh_token\":2}",
                "sb-abcd-auth-token-code-verifier": "v"
            },
            "secretas": ["starseed.ai.providers", 7],
            "omitidas": [],
            "indexedDB": [
                {"nombre": "starseed-memory", "version": 2, "almacenes": [{"nombre": "items", "registros": [{"k": 1, "v": 2}, {"k": 2, "v": 3}]}]},
                {"nombre": "firebaseLocalStorageDb", "omitida": "sesion"}
            ]
        })
    }

    #[test]
    fn pendiente_hasta_hecha_o_abandonada() {
        assert!(pendiente(None));
        let mut m = Marcador { version_migracion: 1, resultado: "pospuesta".into(), intentos: 1, ..Default::default() };
        assert!(pendiente(Some(&m)));
        m.resultado = "hecha".into();
        assert!(!pendiente(Some(&m)));
        m.resultado = "abandonada".into();
        assert!(!pendiente(Some(&m)));
        // Una versión de migración nueva vuelve a pasar una vez.
        m.version_migracion = 0;
        assert!(pendiente(Some(&m)));
        assert_eq!(leer_marcador("basura"), None);
    }

    #[test]
    fn tres_intentos_y_se_deja() {
        let a = tras_confirmar(None, "pospuesta", Some("sin internet".into()), None, None, "0.5.0", 1);
        assert_eq!((a.resultado.as_str(), a.intentos), ("pospuesta", 1));
        let b = tras_confirmar(Some(&a), "pospuesta", None, None, Some("copia-1.json".into()), "0.5.0", 2);
        assert_eq!((b.resultado.as_str(), b.intentos), ("pospuesta", 2));
        let c = tras_confirmar(Some(&b), "error", None, None, None, "0.5.0", 3);
        assert_eq!((c.resultado.as_str(), c.intentos), ("abandonada", 3));
        assert_eq!(c.copia.as_deref(), Some("copia-1.json"), "la copia anterior no se olvida");
        let h = tras_confirmar(Some(&b), "hecha", None, Some(json!({"x": 1})), None, "0.5.0", 4);
        assert_eq!(h.resultado, "hecha");
        assert!(!pendiente(Some(&h)));
        let ida_vuelta = leer_marcador(&serde_json::to_string(&h).unwrap()).unwrap();
        assert_eq!(ida_vuelta, h);
    }

    #[test]
    fn la_sesion_nunca_pasa() {
        assert!(es_clave_de_sesion("sb-abcd-auth-token"));
        assert!(es_clave_de_sesion("sb-abcd-auth-token.0"));
        assert!(es_clave_de_sesion("SB-x-auth-token-code-verifier"));
        assert!(es_clave_de_sesion("supabase.auth.token"));
        assert!(!es_clave_de_sesion("starseed.sb-notas"));
        assert!(parece_sesion("{\"access_token\":\"a\",\"refresh_token\":\"b\"}"));
        assert!(!parece_sesion("{\"access_token\":\"a\"}"));

        let mut p = paquete();
        let s = sanear(&mut p, WEB).unwrap();
        let ls = p["localStorage"].as_object().unwrap();
        assert!(ls.contains_key("appearance-config-v2"));
        assert!(ls.contains_key("starseed.ai.providers"), "lo secreto SÍ va a la app nueva");
        assert!(!ls.keys().any(|k| k.starts_with("sb-") || k == "rara"));
        assert_eq!(s, Saneado { claves: 2, secretas: 1, sesiones_quitadas: 3, bases: 1, registros: 2 });
        assert_eq!(p["secretas"], json!(["starseed.ai.providers"]));
        assert_eq!(p["omitidas"].as_array().unwrap().len(), 3);
    }

    #[test]
    fn rechaza_lo_que_no_es_nuestro() {
        let mut p = paquete();
        p["formato"] = json!("otro");
        assert!(sanear(&mut p, WEB).is_err());
        let mut p = paquete();
        p["origen"] = json!("https://malo.example");
        assert!(sanear(&mut p, WEB).is_err());
        let mut p = paquete();
        p["version"] = json!(99);
        assert!(sanear(&mut p, WEB).is_err());
        let mut p = paquete();
        p.as_object_mut().unwrap().remove("localStorage");
        assert!(sanear(&mut p, WEB).is_err());
        assert!(sanear(&mut json!([1]), WEB).is_err());
    }

    #[test]
    fn la_copia_del_disco_no_lleva_secretos_ni_sesion() {
        let mut p = paquete();
        sanear(&mut p, WEB).unwrap();
        // Aunque alguien volviera a meter una sesión, la copia no la escribe.
        p["localStorage"]["sb-zz-auth-token"] = json!("{\"access_token\":1,\"refresh_token\":2}");
        let c = copia_para_disco(&p);
        let texto = serde_json::to_string(&c).unwrap();
        assert!(!texto.contains("refresh_token"));
        assert!(!texto.contains("cifrado-local"));
        assert_eq!(c["localStorage"]["starseed.ai.providers"]["$ss"], json!("omitido"));
        assert_eq!(c["localStorage"]["starseed.ai.providers"]["bytes"], json!(13));
        assert_eq!(c["localStorage"]["appearance-config-v2"], json!("{\"tema\":\"oscuro\"}"));
        assert!(c["nota"].is_string());
        assert_eq!(nombre_copia(5, "0.5.0"), "copia-0.5.0-5.json");
        assert_eq!(nombre_copia(5, "../x"), "copia-..x-5.json");
    }

    #[test]
    fn trozos_sin_partir_caracteres() {
        let t = "añb€c";
        let r = partir(t, 4);
        let unido: String = r.iter().map(|&(a, b)| &t[a..b]).collect();
        assert_eq!(unido, t);
        assert!(r.iter().all(|&(a, b)| b - a <= 4 && b > a));
        assert_eq!(partir("", 10), vec![(0, 0)]);
        assert_eq!(partir("abcdefghij", 4), vec![(0, 4), (4, 8), (8, 10)]);
        // Un tamaño ridículo no deja trozos vacíos ni un bucle sin fin: mínimo 4 bytes.
        assert_eq!(partir("abcdef", 1), vec![(0, 4), (4, 6)]);
    }

    #[test]
    fn recepcion_por_trozos() {
        let mut r = Recepcion::default();
        assert_eq!(r.poner("a", 1, 2, "mundo".into()), Ok(None));
        assert!(r.poner("b", 0, 2, "x".into()).is_err(), "otra exportación a la vez");
        assert_eq!(r.poner("a", 0, 2, "hola ".into()), Ok(Some("hola mundo".into())));
        // Acabada, se puede empezar otra.
        assert_eq!(r.poner("c", 0, 1, "z".into()), Ok(Some("z".into())));
        assert!(r.poner("d", 0, 0, "".into()).is_err());
        assert!(r.poner("d", 3, 2, "".into()).is_err());
        assert!(r.poner("d", 0, MAX_TROZOS + 1, "".into()).is_err());
    }

    #[test]
    fn origenes_y_script() {
        assert_eq!(origen_de("https://starseed-os.vercel.app/offline.html?x=1"), WEB);
        assert_eq!(origen_de("HTTP://127.0.0.1:47610/__starseed/migracion"), "http://127.0.0.1:47610");
        assert_eq!(origen_de("https://user@evil.example/"), "");
        assert_eq!(origen_de("nada"), "");
        assert_eq!(url_exportacion(&format!("{WEB}/")), format!("{WEB}/offline.html?starseed-migracion=1"));
        let s = script_exportacion("var M=1;", WEB);
        assert!(s.starts_with("var M=1;\n"));
        assert!(s.contains("location.origin!==\"https://starseed-os.vercel.app\""));
        assert!(s.contains("exportarYEnviar"));
        let r = resumen_estado(&Saneado { claves: 3, ..Default::default() });
        assert_eq!(r["claves"], json!(3));
    }
}
