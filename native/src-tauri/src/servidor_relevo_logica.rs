// ═══════════════════════════════════════════════════════════════════════════
// servidor_relevo_logica — núcleo PURO del relevo de capa «en la misma sesión» (ACT1114H, 2026-11-14).
// ---------------------------------------------------------------------------
// Problema medido en la Mac el 13-11: con la web ya publicada, la app arrancada a las 17:39 bajó la capa nueva
// durante ese arranque pero solo la sirvió desde el SIGUIENTE (17:54). La capa quedaba PENDIENTE
// (`servidor_capas::buscar` termina en `p.nueva = Some(..)`) y solo la tomaba el próximo `elegir`, o el botón
// «Actualizar ahora» (`servidor_local_actualizar`, que nadie pulsaba solo). Además la primera mirada al canal
// es a los 90 s y luego cada 6 h: con la app abierta, un despliegue nuevo tardaba horas en bajarse.
//
// Aquí vive lo que se decide sin tocar disco ni red: cómo se nombra una build en el registro (la misma forma
// `web=<compilación>/<sha>` que escribe la web en sus líneas de llamada), cómo se comparan la que corre, la
// PUBLICADA (`/version.json` de la web publicada, no la copia local) y la de la capa lista, cuándo conviene
// buscar ya una capa, y las líneas del registro. Quién decide si es MOMENTO seguro (llamada, escritura…) es la
// web, con la misma regla de ACT1113F (`src/lib/pwa/decision-build.ts`): Rust no inventa una segunda regla.
//
// Solo `std`: se prueba sin Tauri con
//     rustc --edition 2021 --test src/servidor_relevo_logica.rs -o /tmp/sr && /tmp/sr
// ═══════════════════════════════════════════════════════════════════════════
#![allow(dead_code)]

/// Cada cuánto se lee `/version.json` de la web publicada (el mismo pulso que ACT1113F).
pub const MIRAR_WEB_MS: u64 = 5 * 60 * 1000;
/// Primera lectura tras arrancar el servidor local.
pub const MIRAR_WEB_PRIMERA_MS: u64 = 15 * 1000;
/// Mientras la publicada no tenga capa en el canal, no se mira el canal más de una vez cada tanto
/// (el CI tarda unos minutos en armar y firmar la capa después del despliegue).
pub const BUSCAR_CAPA_MIN_MS: u64 = 5 * 60 * 1000;
/// Tope de lo que se lee de `/version.json`.
pub const TOPE_VERSION_JSON: u64 = 4 * 1024;

/// La build de la web que sirve (o publica, o trae una capa): id y sha corto, como `leerBuild` en la web.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct WebId {
    pub build: Option<String>,
    /// Sha de 10 caracteres en minúsculas.
    pub sha: Option<String>,
}

fn id_valido(s: &str) -> bool {
    (3..=64).contains(&s.len()) && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

fn sha_valido(s: &str) -> bool {
    (7..=40).contains(&s.len()) && s.chars().all(|c| c.is_ascii_hexdigit())
}

impl WebId {
    /// Sanea lo que llega de un `version.json` (misma regla que `leerBuild` de `build-corriendo.ts`).
    pub fn de_campos(build: Option<&str>, sha: Option<&str>) -> WebId {
        WebId {
            build: build.map(str::trim).filter(|b| id_valido(b)).map(str::to_string),
            sha: sha.map(str::trim).filter(|s| sha_valido(s)).map(|s| s.chars().take(10).collect::<String>().to_lowercase()),
        }
    }

    /// `mwfli3jt-ctfbyg/fbbcb6794a`; solo la build si no hay sha; «desconocida» si no hay nada.
    pub fn etiqueta(&self) -> String {
        match (&self.build, &self.sha) {
            (Some(b), Some(s)) => format!("{b}/{s}"),
            (Some(b), None) => b.clone(),
            (None, Some(s)) => format!("?/{s}"),
            (None, None) => "desconocida".into(),
        }
    }

    pub fn conocida(&self) -> bool {
        self.build.is_some() || self.sha.is_some()
    }
}

/// El valor de un campo de texto de un JSON plano (`{"build":"x",...}`) sin dependencias. None si falta o
/// no es texto. Solo para `version.json`, que escribe `scripts/gen-version.mjs` (sin escapes en estos campos).
fn campo_texto(json: &str, clave: &str) -> Option<String> {
    let patron = format!("\"{clave}\"");
    let i = json.find(&patron)? + patron.len();
    let resto = json[i..].trim_start().strip_prefix(':')?.trim_start();
    let resto = resto.strip_prefix('"')?;
    let fin = resto.find('"')?;
    Some(resto[..fin].to_string())
}

/// Lee `{"build":..,"sha":..}` de un `version.json`. None si no se reconoce ninguno de los dos.
pub fn de_version_json(json: &str) -> Option<WebId> {
    let w = WebId::de_campos(campo_texto(json, "build").as_deref(), campo_texto(json, "sha").as_deref());
    w.conocida().then_some(w)
}

/// ¿Es la misma build? Con sha en ambas manda el sha (la capa del CI y Vercel compilan el mismo commit con
/// ids de build distintos: el id es aleatorio por compilación); si no, el id.
pub fn misma(a: &WebId, b: &WebId) -> bool {
    match (&a.sha, &b.sha) {
        (Some(x), Some(y)) => x == y,
        _ => matches!((&a.build, &b.build), (Some(x), Some(y)) if x == y),
    }
}

/// Lo que se sabe de la web publicada frente a lo que corre.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Relevo {
    /// Lo que corre es lo publicado.
    AlDia,
    /// Hay una capa lista y verificada distinta de lo que corre: se puede aplicar (si es momento).
    CapaLista,
    /// La publicada es otra y el canal aún no tiene su capa (o no se ha mirado).
    SinCapa,
    /// No se pudo leer la publicada (sin red, error): no se afirma nada.
    SinDato,
}

impl Relevo {
    pub fn texto(&self) -> &'static str {
        match self {
            Relevo::AlDia => "al-dia",
            Relevo::CapaLista => "capa-lista",
            Relevo::SinCapa => "sin-capa",
            Relevo::SinDato => "sin-datos",
        }
    }
}

/// Clasifica. `lista`: la web de la capa nueva ya verificada (None si no hay). Una capa lista que no es la
/// que corre se ofrece aunque no sea todavía la publicada: es más nueva que lo que corre y la siguiente
/// llegará con la misma vía; nunca se ofrece una capa que ya corre.
pub fn clasificar(corre: &WebId, publicada: Option<&WebId>, lista: Option<&WebId>) -> Relevo {
    if let Some(l) = lista {
        if l.conocida() && !misma(l, corre) {
            return Relevo::CapaLista;
        }
    }
    match publicada {
        None => Relevo::SinDato,
        Some(p) if !p.conocida() || !corre.conocida() => Relevo::SinDato,
        Some(p) if misma(p, corre) => Relevo::AlDia,
        Some(_) => Relevo::SinCapa,
    }
}

/// ¿Hay que mirar el canal YA (sin esperar a las 6 h)? Solo si la publicada no es lo que corre, no hay capa
/// lista y pasó el mínimo desde la última búsqueda (para no martillar el canal mientras el CI arma la capa).
pub fn buscar_ya(r: &Relevo, ahora_ms: u64, ultima_busqueda_ms: u64) -> bool {
    *r == Relevo::SinCapa && ahora_ms.saturating_sub(ultima_busqueda_ms) >= BUSCAR_CAPA_MIN_MS
}

// ─────────────────────────── Líneas del registro ───────────────────────────

/// Se pide el relevo (ya hay capa lista, la web dijo que es momento seguro).
pub fn linea_relevo_pedido(antes: &WebId, despues: &WebId, publicada: Option<&WebId>) -> String {
    format!(
        "relevo pedido: web={} -> web={} (publicada web={})",
        antes.etiqueta(),
        despues.etiqueta(),
        publicada.map(WebId::etiqueta).unwrap_or_else(|| "sin-datos".into())
    )
}

/// El Node ya sirve la capa nueva (dio «listo»).
pub fn linea_relevo_hecho(antes: &WebId, ahora: &WebId, publicada: Option<&WebId>) -> String {
    let coincide = match publicada {
        Some(p) if p.conocida() && ahora.conocida() => {
            if misma(p, ahora) {
                "coincide con la publicada"
            } else {
                "aún no es la publicada"
            }
        }
        _ => "publicada sin dato",
    };
    format!("relevo hecho: web={} -> web={} ({coincide})", antes.etiqueta(), ahora.etiqueta())
}

/// No se pudo aplicar, con el motivo.
pub fn linea_relevo_fallido(antes: &WebId, destino: &str, motivo: &str) -> String {
    format!("relevo NO aplicado: sigue web={} (la nueva era web={destino}): {motivo}", antes.etiqueta())
}

/// La publicada no tiene capa todavía.
pub fn linea_sin_capa(corre: &WebId, publicada: &WebId) -> String {
    format!(
        "la web publicada web={} no tiene capa lista en el canal: sigue web={} y se vuelve a mirar",
        publicada.etiqueta(),
        corre.etiqueta()
    )
}

/// No se pudo leer la publicada.
pub fn linea_publicada_ilegible(corre: &WebId, motivo: &str) -> String {
    format!("no se pudo leer la web publicada ({motivo}): sigue web={}", corre.etiqueta())
}

/// Lo que sirve el Node al arrancar.
pub fn linea_sirve(corre: &WebId, publicada: Option<&WebId>) -> String {
    format!("sirve web={} (publicada conocida: {})", corre.etiqueta(), publicada.map(WebId::etiqueta).unwrap_or_else(|| "no".into()))
}

/// Un mensaje que no se repite seguidas: devuelve true si hay que escribirlo (cambió respecto al último).
pub fn nuevo_mensaje(ultimo: &mut Option<String>, mensaje: &str) -> bool {
    if ultimo.as_deref() == Some(mensaje) {
        return false;
    }
    *ultimo = Some(mensaje.to_string());
    true
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn w(b: &str, s: &str) -> WebId {
        WebId::de_campos(Some(b), Some(s))
    }

    #[test]
    fn lee_version_json_y_sanea() {
        let j = r#"{"build":"mwg92loz-2z7m3w","at":"2026-11-14T10:15:41.660Z","sha":"18a63896c24cc1d3e03014c2f8b9319953fbd821","rama":"master","version":"0.3.0"}"#;
        let id = de_version_json(j).unwrap();
        assert_eq!(id.etiqueta(), "mwg92loz-2z7m3w/18a63896c2");
        assert!(de_version_json("{}").is_none());
        assert!(de_version_json("<html>").is_none());
        assert_eq!(de_version_json(r#"{"build":"a b!"}"#), None);
        assert_eq!(de_version_json(r#"{"build":"abc12","sha":null}"#).unwrap().etiqueta(), "abc12");
        assert_eq!(WebId::default().etiqueta(), "desconocida");
    }

    #[test]
    fn misma_compara_por_sha_y_si_no_por_id() {
        assert!(misma(&w("aaa1", "1111111111"), &w("bbb2", "1111111111"))); // CI y Vercel: ids distintos, mismo commit
        assert!(!misma(&w("aaa1", "1111111111"), &w("aaa1", "2222222222")));
        let sin_sha = WebId::de_campos(Some("aaa1"), None);
        assert!(misma(&sin_sha, &w("aaa1", "3333333333")));
        assert!(!misma(&sin_sha, &w("bbb2", "3333333333")));
    }

    #[test]
    fn clasifica_igual_nueva_vieja_e_inalcanzable() {
        let corre = w("aaa1", "1111111111");
        let nueva = w("bbb2", "2222222222");
        // misma publicada
        assert_eq!(clasificar(&corre, Some(&w("zzz9", "1111111111")), None), Relevo::AlDia);
        // publicada más nueva, capa lista
        assert_eq!(clasificar(&corre, Some(&nueva), Some(&nueva)), Relevo::CapaLista);
        // publicada más nueva, sin capa
        assert_eq!(clasificar(&corre, Some(&nueva), None), Relevo::SinCapa);
        // publicada inalcanzable, sin capa: no se afirma nada
        assert_eq!(clasificar(&corre, None, None), Relevo::SinDato);
        // inalcanzable pero hay capa lista distinta: se puede aplicar (es más nueva que la que corre)
        assert_eq!(clasificar(&corre, None, Some(&nueva)), Relevo::CapaLista);
        // capa lista que es la que ya corre: nunca se ofrece
        assert_eq!(clasificar(&corre, Some(&corre), Some(&corre)), Relevo::AlDia);
        // publicada ILEGIBLE (sin id ni sha) o lo que corre desconocido: no se adivina
        assert_eq!(clasificar(&corre, Some(&WebId::default()), None), Relevo::SinDato);
        assert_eq!(clasificar(&WebId::default(), Some(&nueva), None), Relevo::SinDato);
    }

    #[test]
    fn busca_ya_solo_si_falta_capa_y_pasado_el_minimo() {
        assert!(buscar_ya(&Relevo::SinCapa, BUSCAR_CAPA_MIN_MS, 0));
        assert!(!buscar_ya(&Relevo::SinCapa, BUSCAR_CAPA_MIN_MS - 1, 0));
        assert!(!buscar_ya(&Relevo::AlDia, 10 * BUSCAR_CAPA_MIN_MS, 0));
        assert!(!buscar_ya(&Relevo::CapaLista, 10 * BUSCAR_CAPA_MIN_MS, 0));
        assert!(!buscar_ya(&Relevo::SinDato, 10 * BUSCAR_CAPA_MIN_MS, 0));
        // reloj atrás: no revienta
        assert!(!buscar_ya(&Relevo::SinCapa, 5, 1_000_000));
    }

    #[test]
    fn lineas_del_registro_llevan_la_forma_web_build_sha() {
        let a = w("aaa1", "1111111111");
        let b = w("bbb2", "2222222222");
        assert_eq!(
            linea_relevo_pedido(&a, &b, Some(&b)),
            "relevo pedido: web=aaa1/1111111111 -> web=bbb2/2222222222 (publicada web=bbb2/2222222222)"
        );
        assert_eq!(
            linea_relevo_hecho(&a, &b, Some(&w("ccc3", "2222222222"))),
            "relevo hecho: web=aaa1/1111111111 -> web=bbb2/2222222222 (coincide con la publicada)"
        );
        assert!(linea_relevo_hecho(&a, &b, Some(&w("ccc3", "9999999999"))).contains("aún no es la publicada"));
        assert!(linea_relevo_hecho(&a, &b, None).contains("publicada sin dato"));
        let f = linea_relevo_fallido(&a, "bbb2/2222222222", "no dio «listo» en 60 s");
        assert!(f.starts_with("relevo NO aplicado: sigue web=aaa1/1111111111") && f.contains("no dio «listo»"));
        assert!(linea_sin_capa(&a, &b).contains("web=bbb2/2222222222 no tiene capa"));
        assert!(linea_publicada_ilegible(&a, "sin red").contains("sigue web=aaa1/1111111111"));
        assert!(linea_sirve(&a, None).contains("web=aaa1/1111111111"));
    }

    #[test]
    fn un_mensaje_igual_no_se_repite() {
        let mut u = None;
        assert!(nuevo_mensaje(&mut u, "a"));
        assert!(!nuevo_mensaje(&mut u, "a"));
        assert!(nuevo_mensaje(&mut u, "b"));
        assert!(nuevo_mensaje(&mut u, "a"));
    }
}
