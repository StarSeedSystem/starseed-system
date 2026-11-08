// ═══════════════════════════════════════════════════════════════════════════
// origen_local_logica — el ORIGEN del servidor local no cambia, y si cambió, se rescata (NOT1108A, 2026-11-08).
// ---------------------------------------------------------------------------
// Contrato: architecture/apps-autonomas-sin-internet.md §2.2.
//
// Caso real (08-11): Alex instaló la APK native-21 encima de la native-20 (las dos con el servidor local
// dentro) y la app le pidió iniciar sesión y no enseñaba el historial de los chats con sus neuronas.
// localStorage e IndexedDB son POR ORIGEN (`http://127.0.0.1:<puerto>`): si el puerto cambia, la web ve
// un almacén vacío. Hasta ahora el puerto preferido solo se recordaba EN MEMORIA (escritorio) o ni eso
// (Android: siempre 47610 y, con 3 s ocupado, el siguiente), y nada traía lo que quedó en el otro origen.
//
// Aquí, sin Tauri ni red:
//   · el REGISTRO del origen (`<app_data>/servidor-local-origen.json`): el puerto PRINCIPAL (el primero que
//     sirvió en esta instalación; siempre se vuelve a él) y cada puerto que llegó a servir, con cuándo;
//   · la elección del puerto: el principal primero, esperándolo hasta 10 s (una instancia anterior que
//     aún lo suelta tras actualizar), y solo entonces otro de los diez fijos;
//   · qué orígenes anteriores hay que RESCATAR (los que sirvieron después de su último rescate; la primera
//     vez con esta versión, los otros nueve, por si una versión anterior sin registro cambió de puerto);
//   · la página de rescate (exportar en el origen viejo, importar en el actual) y su HTTP mínimo.
// Solo std + serde. Se prueba con `cargo test --lib origen_local_logica`.
// El pegamento (disco, mini servidor, ventana, comandos) vive en `origen_local.rs`.
// ═══════════════════════════════════════════════════════════════════════════

#![cfg_attr(not(desktop), allow(dead_code))]

use serde::{Deserialize, Serialize};

/// Los diez puertos fijos (los de `servidor_local_logica::PUERTOS` y de las capabilities).
pub const PUERTOS: [u16; 10] = [47610, 47611, 47612, 47613, 47614, 47615, 47616, 47617, 47618, 47619];

/// Archivo del registro en `<app_data>/`.
pub const ARCHIVO_REGISTRO: &str = "servidor-local-origen.json";
pub const VERSION_REGISTRO: u32 = 1;

/// Espera al puerto principal antes de cambiar de origen: 40 × 250 ms = 10 s. Cambiar de puerto es cambiar
/// de almacén para la web: mejor esperar unos segundos que «perder» los datos de la persona.
pub const REINTENTOS_PRINCIPAL: u32 = 40;
pub const PAUSA_PRINCIPAL_MS: u64 = 250;

/// Intentos de rescate de un origen antes de dejarlo (cada arranque de la app es un intento).
pub const MAX_INTENTOS_RESCATE: u32 = 3;
/// Tope de cada exportación (un origen con mucho IndexedDB) y de la importación.
pub const ESPERA_EXPORTAR_MS: u64 = 20_000;
pub const ESPERA_IMPORTAR_MS: u64 = 60_000;
/// Tope de todo el rescate (después, la app sigue como siempre).
pub const ESPERA_RESCATE_MS: u64 = 150_000;

/// Rutas de las dos páginas del rescate (las sirve Rust, no Next: corren ANTES que el OS).
pub const RUTA_EXPORTAR: &str = "/__starseed/rescate-origen/exportar";
pub const RUTA_IMPORTAR: &str = "/__starseed/rescate-origen/importar";

/// Un puerto que llegó a servir la web de la app (su origen puede guardar datos de la persona).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct UsoPuerto {
    pub puerto: u16,
    /// Primera y última vez que sirvió (epoch ms).
    pub desde_ms: u64,
    pub hasta_ms: u64,
    /// Última vez que lo que guardaba se trajo al origen que servía entonces (0 = nunca).
    pub rescatado_ms: u64,
    /// Intentos fallidos de rescate desde la última vez que sirvió.
    pub intentos: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct RegistroOrigen {
    pub v: u32,
    /// Puerto del origen principal: el primero que sirvió en esta instalación. Siempre se vuelve a él.
    pub principal: Option<u16>,
    pub usos: Vec<UsoPuerto>,
    /// Veces que la app tuvo que servir en un puerto que no era el principal.
    pub cambios: u32,
    /// Los nueve orígenes sin registro ya se miraron una vez (la primera vez con esta versión).
    #[serde(default)]
    pub sondeados: bool,
}

/// Lee el registro (o basura: registro vacío). Puertos fuera de los diez fijos se descartan.
pub fn leer_registro(texto: &str) -> RegistroOrigen {
    let mut r: RegistroOrigen = serde_json::from_str(texto).unwrap_or_default();
    if r.principal.is_some_and(|p| !PUERTOS.contains(&p)) {
        r.principal = None;
    }
    let mut vistos = Vec::new();
    r.usos.retain(|u| PUERTOS.contains(&u.puerto) && !vistos.contains(&u.puerto) && {
        vistos.push(u.puerto);
        true
    });
    r.v = VERSION_REGISTRO;
    r
}

pub fn escribir_registro(r: &RegistroOrigen) -> String {
    serde_json::to_string_pretty(r).unwrap_or_else(|_| "{}".into())
}

/// Orden en que se prueban los puertos: el principal (o el preferido) primero; luego los diez fijos.
pub fn candidatos(preferido: Option<u16>) -> Vec<u16> {
    let mut v = Vec::with_capacity(PUERTOS.len());
    if let Some(p) = preferido.filter(|p| PUERTOS.contains(p)) {
        v.push(p);
    }
    for p in PUERTOS {
        if !v.contains(&p) {
            v.push(p);
        }
    }
    v
}

/// El primer puerto libre de `candidatos`: el primero se espera `reintentos` veces (llamando a `esperar`
/// entre intentos) antes de pasar a los demás. Igual que `servidor_local_logica::elegir_puerto`, aquí para
/// que Android (sin el módulo de escritorio) use la misma regla.
pub fn elegir(candidatos: &[u16], reintentos: u32, mut libre: impl FnMut(u16) -> bool, mut esperar: impl FnMut()) -> Option<u16> {
    let (&primero, resto) = candidatos.split_first()?;
    for intento in 0..=reintentos {
        if libre(primero) {
            return Some(primero);
        }
        if intento < reintentos {
            esperar();
        }
    }
    resto.iter().copied().find(|&p| libre(p))
}

/// El registro tras servir en `puerto`: fija el principal si no lo había y apunta el uso.
pub fn tras_servir(previo: &RegistroOrigen, puerto: u16, ahora: u64) -> RegistroOrigen {
    let mut r = previo.clone();
    r.v = VERSION_REGISTRO;
    if !PUERTOS.contains(&puerto) {
        return r;
    }
    if r.principal.is_none() {
        r.principal = Some(puerto);
    } else if r.principal != Some(puerto) && r.usos.last().map(|u| u.puerto) != Some(puerto) {
        r.cambios = r.cambios.saturating_add(1);
    }
    match r.usos.iter_mut().find(|u| u.puerto == puerto) {
        Some(u) => {
            u.hasta_ms = ahora;
        }
        None => r.usos.push(UsoPuerto { puerto, desde_ms: ahora, hasta_ms: ahora, rescatado_ms: 0, intentos: 0 }),
    }
    // El último que sirvió, al final (así se sabe cuál fue el último origen).
    if let Some(i) = r.usos.iter().position(|u| u.puerto == puerto) {
        let u = r.usos.remove(i);
        r.usos.push(u);
    }
    r
}

/// Los orígenes a rescatar antes de servir en `actual`, el más reciente primero: los que sirvieron después
/// de su último rescate y no agotaron sus intentos. La primera vez con esta versión (sin `sondeados`), además
/// los demás puertos fijos sin registro: una versión anterior (sin registro) pudo cambiar de puerto.
pub fn fuentes_rescate(r: &RegistroOrigen, actual: u16) -> Vec<u16> {
    let mut usos: Vec<&UsoPuerto> = r
        .usos
        .iter()
        .filter(|u| u.puerto != actual && u.hasta_ms > u.rescatado_ms && u.intentos < MAX_INTENTOS_RESCATE)
        .collect();
    usos.sort_by(|a, b| b.hasta_ms.cmp(&a.hasta_ms));
    let mut v: Vec<u16> = usos.into_iter().map(|u| u.puerto).collect();
    if !r.sondeados {
        for p in PUERTOS {
            if p != actual && !v.contains(&p) && !r.usos.iter().any(|u| u.puerto == p) {
                v.push(p);
            }
        }
    }
    v
}

/// Resultado del rescate de un origen.
#[derive(Debug, Clone, PartialEq)]
pub enum Rescate {
    /// Se trajo (o estaba vacío): no se vuelve a mirar hasta que sirva otra vez.
    Hecho,
    /// No se pudo (puerto ocupado, sin respuesta, error): se reintenta el siguiente arranque.
    Fallido,
    /// No se intentó (el puerto estaba ocupado: no se puede abrir su página).
    Ocupado,
}

/// El registro tras rescatar (o intentar rescatar) el origen `puerto`.
pub fn tras_rescate(previo: &RegistroOrigen, puerto: u16, resultado: &Rescate, ahora: u64) -> RegistroOrigen {
    let mut r = previo.clone();
    let Some(u) = r.usos.iter_mut().find(|u| u.puerto == puerto) else { return r };
    match resultado {
        Rescate::Hecho => {
            u.rescatado_ms = ahora.max(u.hasta_ms);
            u.intentos = 0;
        }
        Rescate::Fallido => u.intentos = u.intentos.saturating_add(1),
        Rescate::Ocupado => {}
    }
    r
}

/// Tras sondear los puertos sin registro (con o sin datos), no se vuelven a sondear.
pub fn tras_sondeo(previo: &RegistroOrigen) -> RegistroOrigen {
    RegistroOrigen { sondeados: true, ..previo.clone() }
}

// ───────────────────────────── Páginas del rescate ─────────────────────────────

pub fn origen(puerto: u16) -> String {
    format!("http://127.0.0.1:{puerto}")
}

/// Página que exporta el origen viejo `de` (para importarlo luego en `a`).
pub fn url_exportar(de: u16, a: u16) -> String {
    format!("{}{RUTA_EXPORTAR}?a={a}", origen(de))
}

pub fn url_importar(a: u16) -> String {
    format!("{}{RUTA_IMPORTAR}", origen(a))
}

/// `esquema://host:puerto` de una URL, en minúsculas ("" si no se entiende).
pub fn origen_de(url: &str) -> String {
    let Some((esquema, resto)) = url.split_once("://") else { return String::new() };
    let fin = resto.find(['/', '?', '#']).unwrap_or(resto.len());
    let host = &resto[..fin];
    if host.is_empty() || host.contains('@') {
        return String::new();
    }
    format!("{}://{}", esquema.to_ascii_lowercase(), host.to_ascii_lowercase())
}

/// ¿Esta URL es la página de exportar (o importar) del origen `puerto`?
pub fn es_pagina(url: &str, puerto: u16, ruta: &str) -> bool {
    if origen_de(url) != origen(puerto) {
        return false;
    }
    let tras = &url[url.find("://").map(|i| i + 3).unwrap_or(0)..];
    let camino = tras.find('/').map(|i| &tras[i..]).unwrap_or("/");
    let camino = camino.split(['?', '#']).next().unwrap_or("");
    camino == ruta
}

/// Línea de petición HTTP → (método, ruta sin consulta). None si no se entiende.
pub fn leer_peticion(cabeza: &str) -> Option<(String, String)> {
    let linea = cabeza.lines().next()?;
    let mut partes = linea.split_whitespace();
    let metodo = partes.next()?.to_string();
    let objetivo = partes.next()?;
    let version = partes.next()?;
    if !version.starts_with("HTTP/1.") || !objetivo.starts_with('/') {
        return None;
    }
    let ruta = objetivo.split(['?', '#']).next().unwrap_or("/").to_string();
    Some((metodo, ruta))
}

/// Respuesta del mini servidor del rescate: solo GET/HEAD de sus dos páginas; lo demás, 404 o 405.
pub fn respuesta(metodo: &str, ruta: &str, html: &str) -> Vec<u8> {
    let (codigo, texto, cuerpo, tipo) = match (metodo, ruta) {
        ("GET" | "HEAD", RUTA_EXPORTAR | RUTA_IMPORTAR) => (200, "OK", html, "text/html; charset=utf-8"),
        ("GET" | "HEAD", _) => (404, "Not Found", "no", "text/plain; charset=utf-8"),
        _ => (405, "Method Not Allowed", "no", "text/plain; charset=utf-8"),
    };
    let cuerpo = if metodo == "HEAD" { "" } else { cuerpo };
    let mut out = format!(
        "HTTP/1.1 {codigo} {texto}\r\nContent-Type: {tipo}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n\r\n",
        cuerpo.len()
    )
    .into_bytes();
    out.extend_from_slice(cuerpo.as_bytes());
    out
}

/// La página del rescate: la biblioteca de la migración (`migracion-origen.js`: exportar e importar con
/// sus reglas de no pisar) y el guion propio (`rescate-origen.js`), las dos inline. La misma página para
/// las dos rutas: el guion mira `location.pathname`.
pub fn pagina(biblioteca: &str, guion: &str) -> String {
    let seguro = |s: &str| s.replace("</script", "<\\/script");
    format!(
        "<!doctype html><html lang=\"es\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\
<title>StarSeed OS</title><style>html,body{{margin:0;height:100%;background:#05060f;color:#e8e6ff;font:15px/1.5 system-ui,sans-serif}}\
main{{height:100%;display:grid;place-items:center;text-align:center;padding:24px;box-sizing:border-box}}p{{max-width:32em;opacity:.85}}</style></head>\
<body><main><div><h1 style=\"font-size:18px;font-weight:600\">Recuperando tus datos</h1><p id=\"t\">Mirando lo que esta app guardó en su puerto anterior…</p></div></main>\
<script>{}</script><script>{}</script></body></html>",
        seguro(biblioteca),
        seguro(guion)
    )
}

// ───────────────────────────────── Pruebas ─────────────────────────────────

#[cfg(test)]
mod pruebas {
    use super::*;
    use std::cell::Cell;

    #[test]
    fn el_principal_va_primero_y_se_espera_antes_de_cambiar() {
        assert_eq!(candidatos(None), PUERTOS.to_vec());
        let c = candidatos(Some(47613));
        assert_eq!(c[0], 47613);
        assert_eq!(c.len(), 10);
        assert_eq!(candidatos(Some(3000)), PUERTOS.to_vec(), "un puerto fuera de los diez no cuenta");

        // Ocupado 9 veces (2,25 s: la instancia anterior aún lo suelta): se queda con él, no cambia de origen.
        let veces = Cell::new(0);
        let esperas = Cell::new(0);
        let p = elegir(&candidatos(Some(47610)), REINTENTOS_PRINCIPAL, |p| {
            if p == 47610 {
                veces.set(veces.get() + 1);
                veces.get() >= 10
            } else {
                true
            }
        }, || esperas.set(esperas.get() + 1));
        assert_eq!(p, Some(47610));
        assert_eq!(esperas.get(), 9);

        // Nunca se libera: tras esperar los 10 s, el siguiente (el cambio inevitable).
        let esperas = Cell::new(0);
        let p = elegir(&candidatos(Some(47610)), REINTENTOS_PRINCIPAL, |p| p != 47610, || esperas.set(esperas.get() + 1));
        assert_eq!(p, Some(47611));
        assert_eq!(esperas.get(), REINTENTOS_PRINCIPAL);
        assert_eq!(u64::from(REINTENTOS_PRINCIPAL) * PAUSA_PRINCIPAL_MS, 10_000);

        // El principal es 47612 (la primera instalación lo tuvo así): se vuelve a él aunque 47610 esté libre.
        assert_eq!(elegir(&candidatos(Some(47612)), 0, |_| true, || {}), Some(47612));
        assert_eq!(elegir(&candidatos(None), 0, |_| false, || {}), None);
        assert_eq!(elegir(&[], 3, |_| true, || {}), None);
    }

    #[test]
    fn registro_fija_el_principal_y_cuenta_los_cambios() {
        let r0 = RegistroOrigen::default();
        let r1 = tras_servir(&r0, 47610, 100);
        assert_eq!(r1.principal, Some(47610));
        assert_eq!(r1.cambios, 0);
        assert_eq!(r1.usos, vec![UsoPuerto { puerto: 47610, desde_ms: 100, hasta_ms: 100, rescatado_ms: 0, intentos: 0 }]);
        // Otro arranque en el mismo: solo se mueve `hasta`.
        let r2 = tras_servir(&r1, 47610, 200);
        assert_eq!(r2.usos.len(), 1);
        assert_eq!((r2.usos[0].desde_ms, r2.usos[0].hasta_ms), (100, 200));
        // El principal estaba ocupado: 47611. Cuenta un cambio y el principal NO cambia.
        let r3 = tras_servir(&r2, 47611, 300);
        assert_eq!(r3.principal, Some(47610));
        assert_eq!(r3.cambios, 1);
        assert_eq!(r3.usos.last().unwrap().puerto, 47611);
        // Un reinicio del servidor en 47611 dentro del mismo arranque no es otro cambio.
        assert_eq!(tras_servir(&r3, 47611, 310).cambios, 1);
        // Vuelta al principal.
        let r4 = tras_servir(&r3, 47610, 400);
        assert_eq!(r4.usos.last().unwrap().puerto, 47610);
        assert_eq!(r4.principal, Some(47610));
        // Un puerto ajeno no se apunta.
        assert_eq!(tras_servir(&r4, 9000, 500), RegistroOrigen { v: VERSION_REGISTRO, ..r4.clone() });
    }

    #[test]
    fn rescata_los_que_sirvieron_despues_de_su_ultimo_rescate() {
        let r = tras_sondeo(&tras_servir(&tras_servir(&RegistroOrigen::default(), 47610, 100), 47611, 200));
        // Vuelta al principal: hay que traer lo de 47611.
        assert_eq!(fuentes_rescate(&r, 47610), vec![47611]);
        // Y si sirve 47611 (el principal ocupado), traer lo de 47610.
        assert_eq!(fuentes_rescate(&r, 47611), vec![47610]);
        // Rescatado: ya no, hasta que vuelva a servir.
        let hecho = tras_rescate(&r, 47611, &Rescate::Hecho, 250);
        assert_eq!(fuentes_rescate(&hecho, 47610), Vec::<u16>::new());
        let otra_vez = tras_servir(&hecho, 47611, 300);
        assert_eq!(fuentes_rescate(&tras_servir(&otra_vez, 47610, 310), 47610), vec![47611]);
        // Tres intentos fallidos: se deja (no retrasa cada arranque para siempre).
        let mut f = r.clone();
        for _ in 0..MAX_INTENTOS_RESCATE {
            assert_eq!(fuentes_rescate(&f, 47610), vec![47611]);
            f = tras_rescate(&f, 47611, &Rescate::Fallido, 260);
        }
        assert!(fuentes_rescate(&f, 47610).is_empty());
        // Ocupado no gasta intentos.
        assert_eq!(tras_rescate(&r, 47611, &Rescate::Ocupado, 270), r);
        // Lo más reciente primero.
        let tres = tras_sondeo(&tras_servir(&tras_servir(&tras_servir(&RegistroOrigen::default(), 47610, 1), 47612, 5), 47611, 9));
        assert_eq!(fuentes_rescate(&tres, 47610), vec![47611, 47612]);
    }

    #[test]
    fn la_primera_vez_sondea_los_otros_nueve() {
        // Sin registro (la native-20 no lo tenía): pudo servir en cualquiera de los diez.
        let v = fuentes_rescate(&RegistroOrigen::default(), 47610);
        assert_eq!(v, PUERTOS[1..].to_vec());
        // Con registro de 47611 y sin sondear: primero 47611 y luego los demás sin registro.
        let r = tras_servir(&RegistroOrigen::default(), 47611, 5);
        let v = fuentes_rescate(&r, 47610);
        assert_eq!(v[0], 47611);
        assert_eq!(v.len(), 9);
        assert!(!v.contains(&47610));
        // Sondeado: solo lo registrado.
        assert_eq!(fuentes_rescate(&tras_sondeo(&r), 47610), vec![47611]);
    }

    #[test]
    fn el_registro_se_lee_con_tolerancia() {
        let r = tras_servir(&tras_servir(&RegistroOrigen::default(), 47610, 1), 47612, 2);
        assert_eq!(leer_registro(&escribir_registro(&r)), r);
        assert_eq!(leer_registro("{roto"), RegistroOrigen { v: VERSION_REGISTRO, ..Default::default() });
        let raro = leer_registro(r#"{"v":1,"principal":80,"usos":[{"puerto":80,"desde_ms":1,"hasta_ms":1,"rescatado_ms":0,"intentos":0}],"cambios":0}"#);
        assert_eq!(raro.principal, None, "un principal fuera de los diez no vale");
        assert!(raro.usos.is_empty());
        assert!(!raro.sondeados, "un registro sin `sondeados` (de antes) no se dio por sondeado");
    }

    #[test]
    fn urls_y_paginas() {
        assert_eq!(url_exportar(47611, 47610), "http://127.0.0.1:47611/__starseed/rescate-origen/exportar?a=47610");
        assert_eq!(url_importar(47610), "http://127.0.0.1:47610/__starseed/rescate-origen/importar");
        assert!(es_pagina(&url_exportar(47611, 47610), 47611, RUTA_EXPORTAR));
        assert!(!es_pagina(&url_exportar(47611, 47610), 47610, RUTA_EXPORTAR));
        assert!(!es_pagina("http://127.0.0.1:47611/escritorios", 47611, RUTA_EXPORTAR));
        assert!(es_pagina("http://127.0.0.1:47610/__starseed/rescate-origen/importar#x", 47610, RUTA_IMPORTAR));
        assert!(!es_pagina("http://127.0.0.1:476100/__starseed/rescate-origen/importar", 47610, RUTA_IMPORTAR));
        assert!(!es_pagina("http://user@127.0.0.1:47610/__starseed/rescate-origen/importar", 47610, RUTA_IMPORTAR));
        assert_eq!(origen_de("HTTP://127.0.0.1:47610/a?b"), "http://127.0.0.1:47610");
    }

    #[test]
    fn http_minimo_solo_sus_dos_paginas() {
        assert_eq!(leer_peticion("GET /__starseed/rescate-origen/exportar?a=47610 HTTP/1.1\r\nHost: x\r\n\r\n"), Some(("GET".into(), RUTA_EXPORTAR.into())));
        assert_eq!(leer_peticion("basura"), None);
        assert_eq!(leer_peticion("GET http://otro/ HTTP/1.1"), None);
        let ok = String::from_utf8(respuesta("GET", RUTA_IMPORTAR, "<p>hola</p>")).unwrap();
        assert!(ok.starts_with("HTTP/1.1 200 OK\r\n"));
        assert!(ok.contains("Cache-Control: no-store\r\n"));
        assert!(ok.ends_with("\r\n\r\n<p>hola</p>"));
        assert!(ok.contains("Content-Length: 11\r\n"));
        let no = String::from_utf8(respuesta("GET", "/api/x", "<p>hola</p>")).unwrap();
        assert!(no.starts_with("HTTP/1.1 404 "));
        assert!(!no.contains("hola"));
        assert!(String::from_utf8(respuesta("POST", RUTA_IMPORTAR, "x")).unwrap().starts_with("HTTP/1.1 405 "));
        let head = String::from_utf8(respuesta("HEAD", RUTA_EXPORTAR, "abc")).unwrap();
        assert!(head.ends_with("\r\n\r\n") && head.contains("Content-Length: 0"));
    }

    #[test]
    fn la_pagina_lleva_los_dos_guiones_sin_cerrar_el_script() {
        let p = pagina("var a='</script>';", "var b=1;");
        assert!(p.contains("var a='<\\/script>';"));
        assert!(p.contains("<script>var b=1;</script>"));
        assert_eq!(p.matches("</script>").count(), 2);
        assert!(p.starts_with("<!doctype html>"));
    }
}
