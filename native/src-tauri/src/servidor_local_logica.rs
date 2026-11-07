// ═══════════════════════════════════════════════════════════════════════════
// servidor_local_logica — el núcleo PURO del servidor local de la app (APP1107A, 2026-11-07).
// ---------------------------------------------------------------------------
// Contrato: architecture/apps-autonomas-sin-internet.md.
//
// Petición de Alex (07-11): las apps instaladas deben funcionar SIN internet, con todo lo
// necesario dentro. La app de escritorio de StarSeed OS trae dentro el build `standalone` de
// Next y un Node oficial (`starseed-node`); al arrancar, Rust lanza ese servidor SOLO en
// 127.0.0.1 y lleva la ventana a `http://127.0.0.1:<puerto>/`. Este archivo es la parte que
// no toca ni Tauri ni el sistema: rutas del paquete, elección de puerto, entorno del proceso,
// lectura de la respuesta de salud, política de reinicios y los avisos de la página de
// arranque. Solo `std`: se prueba sin Tauri con
//     rustc --edition 2021 --test src/servidor_local_logica.rs -o /tmp/sl && /tmp/sl
// El pegamento con Tauri (lanzar, vigilar, navegar, apagar) vive en `servidor_local.rs`.
// ═══════════════════════════════════════════════════════════════════════════

use std::hash::{BuildHasher, Hasher};
use std::path::{Path, PathBuf};

/// El servidor local solo escucha aquí: nunca en 0.0.0.0 ni en la red local.
pub const HOST: &str = "127.0.0.1";

/// Puertos fijos, en orden de preferencia. Fijos (y no «cualquiera libre») porque el ORIGEN de la
/// web es `http://127.0.0.1:<puerto>`: si el puerto cambiara en cada arranque, el localStorage y
/// el IndexedDB de la persona (que son por origen) parecerían vacíos. Casi siempre se usa el
/// primero. Las capabilities (`capabilities/default.json` y `desktop.json`) declaran estos diez
/// orígenes exactos como `remote.urls`; si se cambia la lista aquí, se cambia allí.
pub const PUERTOS: [u16; 10] = [47610, 47611, 47612, 47613, 47614, 47615, 47616, 47617, 47618, 47619];

/// Reintentos sobre el puerto preferido si está ocupado (p. ej. la instancia anterior aún se
/// está apagando tras una actualización): 10 × 300 ms antes de pasar al siguiente.
pub const REINTENTOS_PREFERIDO: u32 = 10;
pub const PAUSA_PREFERIDO_MS: u64 = 300;

/// Tope de espera hasta que el servidor responde «listo» (arranque en frío en un disco lento).
pub const ESPERA_LISTO_MS: u64 = 60_000;
/// Cada cuánto se pregunta por la salud mientras arranca.
pub const PASO_SONDEO_MS: u64 = 250;

/// Ruta de salud que responde el envoltorio `starseed-arranque.cjs` (no Next).
pub const RUTA_SALUD: &str = "/__starseed/salud";
/// (SEG1107A · T11) Entrada de la ventana: el envoltorio comprueba el pase, pone la cookie
/// `starseed_pase` (HttpOnly; SameSite=Strict) y redirige a la ruta pedida. Sin esa cookie, el
/// servidor local no atiende /api/* ni nada que cambie estado (`native/servidor-local/guarda.cjs`).
pub const RUTA_ENTRAR: &str = "/__starseed/entrar";
/// Nombre que el envoltorio pone en su respuesta de salud.
pub const NOMBRE_SERVIDOR: &str = "starseed-os-local";

/// La web publicada: el respaldo si el paquete local falta o no arranca, y el destino de las
/// rutas `/api/*` cuando hay internet (el envoltorio las reenvía; así nada de lo que hoy funciona
/// en línea se pierde por ir en local).
pub const WEB_PUBLICADA: &str = "https://starseed-os.vercel.app";

/// Nombre del Node que trae la app (externalBin de Tauri: va junto al ejecutable).
pub const NOMBRE_NODE: &str = "starseed-node";
/// Carpeta del servidor dentro de los recursos de la app.
pub const DIR_SERVIDOR: &str = "servidor";
/// Envoltorio que arranca Next y hace de puerta (salud, reenvío de /api, vigía del padre).
pub const SCRIPT_ARRANQUE: &str = "starseed-arranque.cjs";
/// Manifiesto que escribe el CI al armar el paquete (versión, commit, Node).
pub const MANIFIESTO: &str = "starseed-servidor.json";
/// Registro del servidor (en la carpeta de registros de la app); se rota al pasar de 5 MB.
pub const REGISTRO: &str = "servidor-local.log";
pub const REGISTRO_MAX_BYTES: u64 = 5 * 1024 * 1024;

/// Variables del entorno heredado que NO deben llegar al Node de la app: opciones de quien
/// tenga Node instalado en su máquina (inspector, módulos precargados, otro puerto…).
pub const ENTORNO_QUITAR: [&str; 4] = ["NODE_OPTIONS", "NODE_PATH", "PORT", "__NEXT_PRIVATE_ORIGIN"];

// ───────────────────────────── Rutas del paquete ─────────────────────────────

/// Dónde está cada pieza del servidor local dentro de la app instalada.
#[derive(Debug, Clone, PartialEq)]
pub struct RutasPaquete {
    /// El binario de Node (externalBin: junto al ejecutable de la app).
    pub node: PathBuf,
    /// La carpeta del servidor (`<recursos>/servidor`): standalone + .next/static + public.
    pub dir: PathBuf,
    /// `<dir>/starseed-arranque.cjs`.
    pub script: PathBuf,
    /// `<dir>/starseed-servidor.json`.
    pub manifiesto: PathBuf,
}

/// `os` es `std::env::consts::OS` ("macos", "windows", "linux"…).
pub fn nombre_node(os: &str) -> String {
    if os == "windows" {
        format!("{NOMBRE_NODE}.exe")
    } else {
        NOMBRE_NODE.to_string()
    }
}

pub fn rutas_paquete(dir_exe: &Path, dir_recursos: &Path, os: &str) -> RutasPaquete {
    let dir = dir_recursos.join(DIR_SERVIDOR);
    RutasPaquete {
        node: dir_exe.join(nombre_node(os)),
        script: dir.join(SCRIPT_ARRANQUE),
        manifiesto: dir.join(MANIFIESTO),
        dir,
    }
}

/// Qué falta del paquete (si falta algo, la app se comporta como antes: web publicada).
#[derive(Debug, Clone, PartialEq)]
pub enum FaltaPaquete {
    Node(PathBuf),
    Servidor(PathBuf),
    Next(PathBuf),
    Script(PathBuf),
}

impl FaltaPaquete {
    pub fn explicar(&self) -> String {
        match self {
            FaltaPaquete::Node(p) => format!("Este instalador no trae su Node ({}).", p.display()),
            FaltaPaquete::Servidor(p) => format!("Este instalador no trae el servidor local ({}).", p.display()),
            FaltaPaquete::Next(p) => format!("El servidor local está incompleto: falta {}.", p.display()),
            FaltaPaquete::Script(p) => format!("El servidor local está incompleto: falta {}.", p.display()),
        }
    }
}

/// Comprueba que el paquete está entero. `existe` se inyecta para poder probarlo sin disco.
pub fn comprobar_paquete(r: &RutasPaquete, existe: impl Fn(&Path) -> bool) -> Result<(), FaltaPaquete> {
    if !existe(&r.node) {
        return Err(FaltaPaquete::Node(r.node.clone()));
    }
    let server = r.dir.join("server.js");
    if !existe(&server) {
        return Err(FaltaPaquete::Servidor(server));
    }
    let next = r.dir.join(".next").join("BUILD_ID");
    if !existe(&next) {
        return Err(FaltaPaquete::Next(next));
    }
    if !existe(&r.script) {
        return Err(FaltaPaquete::Script(r.script.clone()));
    }
    Ok(())
}

// ─────────────────────────────── Puertos ───────────────────────────────

/// El orden en que se prueban los puertos: el preferido (el de la vez anterior, para no cambiar
/// de origen al reiniciar) primero y luego el resto de la lista fija, sin repetir.
pub fn orden_puertos(preferido: Option<u16>) -> Vec<u16> {
    let mut v = Vec::with_capacity(PUERTOS.len());
    if let Some(p) = preferido {
        if PUERTOS.contains(&p) {
            v.push(p);
        }
    }
    for p in PUERTOS {
        if !v.contains(&p) {
            v.push(p);
        }
    }
    v
}

/// El primer puerto libre de `candidatos`. El primero se reintenta `reintentos_primero` veces
/// (llamando a `esperar` entre intentos) antes de pasar al siguiente: así un reinicio tras una
/// actualización vuelve al MISMO origen aunque el Node anterior tarde un instante en soltarlo.
pub fn elegir_puerto(
    candidatos: &[u16],
    reintentos_primero: u32,
    mut libre: impl FnMut(u16) -> bool,
    mut esperar: impl FnMut(),
) -> Option<u16> {
    let (&primero, resto) = candidatos.split_first()?;
    for intento in 0..=reintentos_primero {
        if libre(primero) {
            return Some(primero);
        }
        if intento < reintentos_primero {
            esperar();
        }
    }
    resto.iter().copied().find(|&p| libre(p))
}

pub fn origen_local(puerto: u16) -> String {
    format!("http://{HOST}:{puerto}")
}

/// ¿Esta URL ya es la del servidor local en ese puerto? (para no recargar la ventana sin motivo).
pub fn es_url_local(url: &str, puerto: u16) -> bool {
    let o = origen_local(puerto);
    url == o || url.starts_with(&format!("{o}/")) || url.starts_with(&format!("{o}?")) || url.starts_with(&format!("{o}#"))
}

// ─────────────────────────────── Entorno ───────────────────────────────

/// Variables que recibe el Node de la app. Nada de claves: el servidor local no lleva secretos
/// (lo que los necesite se reenvía a la web publicada cuando hay internet).
pub fn entorno_hijo(puerto: u16, firma: &str, web: &str) -> Vec<(&'static str, String)> {
    vec![
        ("STARSEED_SERVIDOR_LOCAL", "1".to_string()),
        ("STARSEED_PUERTO", puerto.to_string()),
        ("STARSEED_FIRMA", firma.to_string()),
        ("STARSEED_WEB_PUBLICADA", web.to_string()),
        ("HOSTNAME", HOST.to_string()),
        ("NODE_ENV", "production".to_string()),
        ("NEXT_TELEMETRY_DISABLED", "1".to_string()),
    ]
}

/// Firma de un arranque: 128 bits al azar en hex. Solo sirve para que Rust compruebe que quien
/// responde en el puerto es SU proceso y no otro programa que lo haya ocupado.
pub fn firma_nueva() -> String {
    let semilla = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let mut partes = [0u64; 2];
    for (i, parte) in partes.iter_mut().enumerate() {
        let mut h = std::collections::hash_map::RandomState::new().build_hasher();
        h.write_u128(semilla);
        h.write_u32(std::process::id());
        h.write_usize(i);
        *parte = h.finish();
    }
    format!("{:016x}{:016x}", partes[0], partes[1])
}

/// (SEG1107A · T11) Pase de la ventana: 256 bits al azar, UNO por arranque de la app (no por
/// arranque del Node: un reinicio del servidor no recarga la página y la cookie debe seguir
/// valiendo). Va al envoltorio por su entrada estándar (nunca en el entorno ni en el registro) y a
/// la ventana en la URL de entrada. Dos mitades de `firma_nueva`, cada una en un hilo propio: cada
/// hilo siembra las claves de SipHash de `RandomState` con el generador del sistema.
pub fn pase_nuevo() -> String {
    let otra = std::thread::spawn(firma_nueva).join().unwrap_or_else(|_| firma_nueva());
    let una = std::thread::spawn(firma_nueva).join().unwrap_or_else(|_| firma_nueva());
    format!("{una}{otra}")
}

/// Primera línea que la app escribe en la entrada estándar del envoltorio.
pub fn linea_pase(pase: &str) -> String {
    format!("pase:{pase}\n")
}

/// Codifica un componente de URL (todo menos `A-Z a-z 0-9 - . _ ~`).
pub fn codificar_componente(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'.' | b'_' | b'~') {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

/// URL con la que la ventana entra al servidor local: pone la cookie del pase y va a `ruta`
/// (p. ej. `/` o la página importadora de la migración).
pub fn url_entrada(puerto: u16, pase: &str, ruta: &str) -> String {
    format!(
        "{}{RUTA_ENTRAR}?t={}&a={}",
        origen_local(puerto),
        codificar_componente(pase),
        codificar_componente(ruta)
    )
}

// ─────────────────────────────── Salud ───────────────────────────────

/// Petición HTTP/1.1 mínima a la ruta de salud (sin dependencias: va por un TcpStream).
pub fn peticion_salud(puerto: u16) -> String {
    format!(
        "GET {RUTA_SALUD} HTTP/1.1\r\nHost: {HOST}:{puerto}\r\nAccept: application/json\r\nConnection: close\r\n\r\n"
    )
}

#[derive(Debug, Clone, PartialEq)]
pub enum Salud {
    /// Es nuestro proceso y Next ya acepta peticiones.
    Lista,
    /// Es nuestro proceso pero Next aún arranca.
    Arrancando,
    /// Responde otra cosa: no es nuestro servidor (o algo va mal). Nunca se navega ahí.
    Ajena(String),
}

/// Lee la respuesta cruda. El envoltorio responde JSON compacto con Content-Length, p. ej.
/// `{"servidor":"starseed-os-local","firma":"…","listo":true,…}`.
pub fn interpretar_salud(respuesta: &str, firma: &str) -> Salud {
    let linea = respuesta.lines().next().unwrap_or("");
    let codigo = linea.split_whitespace().nth(1).unwrap_or("");
    if !linea.starts_with("HTTP/1.") {
        return Salud::Ajena("respuesta sin cabecera HTTP".into());
    }
    if codigo != "200" {
        return Salud::Ajena(format!("respondió {codigo}"));
    }
    let cuerpo = respuesta.split_once("\r\n\r\n").map(|(_, c)| c).unwrap_or("");
    if !cuerpo.contains(&format!("\"servidor\":\"{NOMBRE_SERVIDOR}\"")) {
        return Salud::Ajena("no es el servidor local de StarSeed".into());
    }
    if firma.is_empty() || !cuerpo.contains(&format!("\"firma\":\"{firma}\"")) {
        return Salud::Ajena("la firma no coincide: el puerto lo tiene otro proceso".into());
    }
    if cuerpo.contains("\"listo\":true") {
        Salud::Lista
    } else {
        Salud::Arrancando
    }
}

// ─────────────────────────────── Reinicios ───────────────────────────────

/// Si el servidor muere, se reinicia con pausas crecientes; más de `max_en_ventana` caídas en
/// `ventana_ms` y se rinde (la app pasa a la web publicada y lo dice).
#[derive(Debug, Clone, PartialEq)]
pub struct PoliticaReinicio {
    pub max_en_ventana: usize,
    pub ventana_ms: u64,
    pub pausas_ms: [u64; 3],
}

impl Default for PoliticaReinicio {
    fn default() -> Self {
        PoliticaReinicio { max_en_ventana: 3, ventana_ms: 5 * 60_000, pausas_ms: [500, 2_000, 5_000] }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum Reinicio {
    Esperar(u64),
    Rendirse,
}

/// `caidas_ms`: instantes de las caídas (incluida la que acaba de pasar).
pub fn decidir_reinicio(caidas_ms: &[u64], ahora_ms: u64, pol: &PoliticaReinicio) -> Reinicio {
    let recientes = caidas_ms.iter().filter(|&&t| ahora_ms.saturating_sub(t) <= pol.ventana_ms).count();
    if recientes > pol.max_en_ventana {
        return Reinicio::Rendirse;
    }
    let i = recientes.saturating_sub(1).min(pol.pausas_ms.len() - 1);
    Reinicio::Esperar(pol.pausas_ms[i])
}

/// ¿Rotar el registro antes de abrirlo?
pub fn rotar_registro(tam_bytes: u64) -> bool {
    tam_bytes > REGISTRO_MAX_BYTES
}

// ───────────────────────── Página de arranque ─────────────────────────

/// Cadena JS entre comillas dobles, escapada (para `eval` en la página de arranque).
pub fn js_cadena(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '<' => out.push_str("\\u003c"),
            '>' => out.push_str("\\u003e"),
            '\u{2028}' => out.push_str("\\u2028"),
            '\u{2029}' => out.push_str("\\u2029"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

/// JS que la app ejecuta en la página de arranque (`native/arranque/index.html`) para contar qué
/// pasa. Deja el último aviso en `window.__starseedUltimo` por si la página aún no cargó su script.
/// En cualquier otra página es inofensivo (la función no existe).
pub fn script_aviso(fase: &str, mensaje: &str) -> String {
    format!(
        "window.__starseedUltimo=[{f},{m}];if(typeof window.__starseedArranque==='function'){{window.__starseedArranque({f},{m});}}",
        f = js_cadena(fase),
        m = js_cadena(mensaje)
    )
}

// ───────────────────────────────── Pruebas ─────────────────────────────────

#[cfg(test)]
mod pruebas {
    use super::*;
    use std::cell::Cell;

    #[test]
    fn rutas_por_sistema() {
        let r = rutas_paquete(Path::new("/app/MacOS"), Path::new("/app/Resources"), "macos");
        assert_eq!(r.node, PathBuf::from("/app/MacOS/starseed-node"));
        assert_eq!(r.dir, PathBuf::from("/app/Resources/servidor"));
        assert_eq!(r.script, PathBuf::from("/app/Resources/servidor/starseed-arranque.cjs"));
        assert_eq!(r.manifiesto, PathBuf::from("/app/Resources/servidor/starseed-servidor.json"));
        let w = rutas_paquete(Path::new("C:/SS"), Path::new("C:/SS"), "windows");
        assert_eq!(w.node, PathBuf::from("C:/SS/starseed-node.exe"));
    }

    #[test]
    fn paquete_entero_o_dice_que_falta() {
        let r = rutas_paquete(Path::new("/e"), Path::new("/r"), "linux");
        assert_eq!(comprobar_paquete(&r, |_| true), Ok(()));
        assert_eq!(comprobar_paquete(&r, |_| false), Err(FaltaPaquete::Node(PathBuf::from("/e/starseed-node"))));
        let sin_server = comprobar_paquete(&r, |p| !p.ends_with("server.js"));
        assert_eq!(sin_server, Err(FaltaPaquete::Servidor(PathBuf::from("/r/servidor/server.js"))));
        let sin_build = comprobar_paquete(&r, |p| !p.ends_with("BUILD_ID"));
        assert!(matches!(sin_build, Err(FaltaPaquete::Next(_))));
        let sin_script = comprobar_paquete(&r, |p| !p.ends_with(SCRIPT_ARRANQUE));
        assert!(matches!(sin_script, Err(FaltaPaquete::Script(_))));
        assert!(FaltaPaquete::Node(PathBuf::from("/x")).explicar().contains("Node"));
    }

    #[test]
    fn el_preferido_va_primero_y_no_se_repite() {
        assert_eq!(orden_puertos(None), PUERTOS.to_vec());
        let o = orden_puertos(Some(47613));
        assert_eq!(o[0], 47613);
        assert_eq!(o.len(), PUERTOS.len());
        assert_eq!(o.iter().filter(|&&p| p == 47613).count(), 1);
        // Un preferido fuera de la lista (no declarado en las capabilities) se ignora.
        assert_eq!(orden_puertos(Some(3000)), PUERTOS.to_vec());
    }

    #[test]
    fn elige_el_primero_libre_y_reintenta_el_preferido() {
        let esperas = Cell::new(0);
        let p = elegir_puerto(&PUERTOS, 3, |p| p == 47610, || esperas.set(esperas.get() + 1));
        assert_eq!(p, Some(47610));
        assert_eq!(esperas.get(), 0);

        // El preferido se libera al tercer intento: se queda con él (mismo origen).
        let intentos = Cell::new(0);
        let p = elegir_puerto(
            &PUERTOS,
            5,
            |p| {
                if p == 47610 {
                    intentos.set(intentos.get() + 1);
                    intentos.get() >= 3
                } else {
                    true
                }
            },
            || {},
        );
        assert_eq!(p, Some(47610));

        // Nunca se libera: pasa al siguiente tras agotar los reintentos.
        let esperas = Cell::new(0);
        let p = elegir_puerto(&PUERTOS, 4, |p| p != 47610, || esperas.set(esperas.get() + 1));
        assert_eq!(p, Some(47611));
        assert_eq!(esperas.get(), 4);

        assert_eq!(elegir_puerto(&PUERTOS, 0, |_| false, || {}), None);
        assert_eq!(elegir_puerto(&[], 0, |_| true, || {}), None);
    }

    #[test]
    fn urls_locales() {
        assert_eq!(origen_local(47610), "http://127.0.0.1:47610");
        assert!(es_url_local("http://127.0.0.1:47610/escritorios?x=1", 47610));
        assert!(es_url_local("http://127.0.0.1:47610", 47610));
        assert!(!es_url_local("http://127.0.0.1:476100/", 47610));
        assert!(!es_url_local("http://127.0.0.1:47611/", 47610));
        assert!(!es_url_local("https://starseed-os.vercel.app/", 47610));
    }

    #[test]
    fn entorno_sin_secretos_y_solo_loopback() {
        let e = entorno_hijo(47610, "abc", WEB_PUBLICADA);
        let v = |k: &str| e.iter().find(|(n, _)| *n == k).map(|(_, v)| v.clone());
        assert_eq!(v("HOSTNAME").as_deref(), Some("127.0.0.1"));
        assert_eq!(v("STARSEED_PUERTO").as_deref(), Some("47610"));
        assert_eq!(v("STARSEED_FIRMA").as_deref(), Some("abc"));
        assert_eq!(v("NODE_ENV").as_deref(), Some("production"));
        for (k, _) in &e {
            assert!(!k.contains("KEY") && !k.contains("SECRET") && !k.contains("TOKEN"), "{k}");
            // (SEG1107A) El pase de la ventana va por la entrada estándar, nunca en el entorno.
            assert!(!k.contains("PASE"), "{k}");
        }
        assert!(ENTORNO_QUITAR.contains(&"NODE_OPTIONS"));
    }

    #[test]
    fn firmas_distintas_y_hex() {
        let a = firma_nueva();
        let b = firma_nueva();
        assert_eq!(a.len(), 32);
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(a, b);
    }

    #[test]
    fn pase_de_256_bits_distinto_en_cada_arranque() {
        let a = pase_nuevo();
        let b = pase_nuevo();
        assert_eq!(a.len(), 64);
        assert!(a.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
        assert_ne!(a, b);
        assert_ne!(a[..32], a[32..]);
        assert_eq!(linea_pase("ab"), "pase:ab\n");
    }

    #[test]
    fn url_de_entrada_con_el_pase_y_la_ruta_codificada() {
        let p = "0123456789abcdef".repeat(4);
        assert_eq!(
            url_entrada(47610, &p, "/"),
            format!("http://127.0.0.1:47610/__starseed/entrar?t={p}&a=%2F")
        );
        assert_eq!(
            url_entrada(47611, &p, "/__starseed/migracion"),
            format!("http://127.0.0.1:47611/__starseed/entrar?t={p}&a=%2F__starseed%2Fmigracion")
        );
        assert!(es_url_local(&url_entrada(47610, &p, "/"), 47610));
        assert_eq!(codificar_componente("/a b?c=d&e#ñ"), "%2Fa%20b%3Fc%3Dd%26e%23%C3%B1");
        assert_eq!(codificar_componente("Az09-._~"), "Az09-._~");
    }

    #[test]
    fn peticion_bien_formada() {
        let p = peticion_salud(47610);
        assert!(p.starts_with("GET /__starseed/salud HTTP/1.1\r\n"));
        assert!(p.contains("Host: 127.0.0.1:47610\r\n"));
        assert!(p.ends_with("\r\n\r\n"));
    }

    fn resp(codigo: &str, cuerpo: &str) -> String {
        format!("HTTP/1.1 {codigo} OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{cuerpo}", cuerpo.len())
    }

    #[test]
    fn salud_lista_arrancando_o_ajena() {
        let ok = resp("200", r#"{"servidor":"starseed-os-local","firma":"f1","listo":true,"red":"en-linea"}"#);
        assert_eq!(interpretar_salud(&ok, "f1"), Salud::Lista);
        let arr = resp("200", r#"{"servidor":"starseed-os-local","firma":"f1","listo":false}"#);
        assert_eq!(interpretar_salud(&arr, "f1"), Salud::Arrancando);
        // Otro proceso con nuestro formato pero otra firma: ajeno.
        assert!(matches!(interpretar_salud(&ok, "f2"), Salud::Ajena(_)));
        // Firma vacía nunca vale.
        assert!(matches!(interpretar_salud(&ok, ""), Salud::Ajena(_)));
        assert!(matches!(interpretar_salud(&resp("404", "no"), "f1"), Salud::Ajena(_)));
        assert!(matches!(interpretar_salud("basura", "f1"), Salud::Ajena(_)));
        assert!(matches!(interpretar_salud(&resp("200", r#"{"hola":1}"#), "f1"), Salud::Ajena(_)));
    }

    #[test]
    fn reinicios_con_pausa_creciente_y_tope() {
        let pol = PoliticaReinicio::default();
        let m = 60_000;
        assert_eq!(decidir_reinicio(&[10 * m], 10 * m, &pol), Reinicio::Esperar(500));
        assert_eq!(decidir_reinicio(&[9 * m, 10 * m], 10 * m, &pol), Reinicio::Esperar(2_000));
        assert_eq!(decidir_reinicio(&[8 * m, 9 * m, 10 * m], 10 * m, &pol), Reinicio::Esperar(5_000));
        assert_eq!(decidir_reinicio(&[7 * m, 8 * m, 9 * m, 10 * m], 10 * m, &pol), Reinicio::Rendirse);
        // Caídas viejas (fuera de la ventana de 5 min) no cuentan.
        assert_eq!(decidir_reinicio(&[0, m, 2 * m, 10 * m], 10 * m, &pol), Reinicio::Esperar(500));
    }

    #[test]
    fn registro_se_rota_al_pasar_el_tope() {
        assert!(!rotar_registro(0));
        assert!(!rotar_registro(REGISTRO_MAX_BYTES));
        assert!(rotar_registro(REGISTRO_MAX_BYTES + 1));
    }

    #[test]
    fn js_escapado_seguro() {
        assert_eq!(js_cadena("hola"), "\"hola\"");
        assert_eq!(js_cadena("a\"b\\c\nd"), "\"a\\\"b\\\\c\\nd\"");
        assert_eq!(js_cadena("</script>"), "\"\\u003c/script\\u003e\"");
        assert_eq!(js_cadena("\u{1}"), "\"\\u0001\"");
        let s = script_aviso("local", "Listo en «127.0.0.1»");
        assert!(s.starts_with("window.__starseedUltimo=[\"local\",\"Listo en «127.0.0.1»\"];"));
        assert!(s.contains("window.__starseedArranque(\"local\""));
    }
}
