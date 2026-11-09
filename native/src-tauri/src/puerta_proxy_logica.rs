// ═══════════════════════════════════════════════════════════════════════════
// puerta_proxy_logica — lo puro del proxy de la puerta de internet (PTA1108B · 2026-11-08).
// Contrato: architecture/red-sin-dependencias.md §5.3 (c).
// ---------------------------------------------------------------------------
// `native/servidor-local/puerta.cjs` abre un proxy HTTP (CONNECT y HTTP simple) en 127.0.0.1:<puerto> mientras
// la página lo activa. Aquí está lo que decide QUÉ hacer la parte nativa con ese puerto, sin tocar el sistema:
//   · la máquina de estados del comando `puerta_proxy_local` (aplicar, quitar, repetir, nada);
//   · la URL del proxy y la lista de destinos que NUNCA van por él (bucle local: el propio servidor de la app);
//   · qué plataforma puede llevar el webview por el proxy y por qué no;
//   · la cola de peticiones hacia Kotlin (Android) y el estado que devuelve.
// Sin dependencias del sistema: se prueba en cualquier plataforma.
// ═══════════════════════════════════════════════════════════════════════════

// Lo de Android (cola hacia Kotlin, reglas) y lo de macOS solo se usa en su plataforma; aquí se prueba en todas.
#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Evento que recibe la web con el estado del proxy en cada cambio.
pub const EVENTO: &str = "puerta://estado";
/// Puertos del proxy: el de Node es efímero (> 1023); nada por debajo de eso es suyo.
pub const PUERTO_MIN: u32 = 1024;
pub const PUERTO_MAX: u32 = 65_535;
/// Interruptor de emergencia (todas las plataformas): cualquier valor salvo vacío, «0» o «false» lo apaga.
pub const VARIABLE_APAGADO: &str = "STARSEED_SIN_PROXY_PUERTA";

/// Destinos que JAMÁS pasan por el proxy: el servidor local de la app (127.0.0.1:4761x), `localhost` y todo
/// `*.localhost`. Se usan como «dominios excluidos» de Network.framework (coinciden por sufijo de nombre).
/// `local` (mDNS) tampoco: la puerta rechaza `.local` de todos modos, así que va directo o no va.
pub const DOMINIOS_DIRECTOS: [&str; 4] = ["localhost", "127.0.0.1", "::1", "local"];
/// Las reglas de Chromium/WebView de Android para lo mismo (`ProxyConfig.Builder.addBypassRule`).
pub const REGLAS_DIRECTAS_ANDROID: [&str; 5] = ["127.0.0.1", "localhost", "*.localhost", "[::1]", "<local>"];

/// (LNX1109B) `ignore_hosts` de `WebKitNetworkProxySettings` (GProxyResolver: «localhost» ya cubre sus subdominios;
/// «*.localhost» lo deja explícito). Nunca se proxifica el bucle local.
pub const IGNORAR_WEBKIT: [&str; 4] = ["localhost", "127.0.0.1", "::1", "*.localhost"];

/// (LNX1109B) La URL de proxy por defecto de `WebKitNetworkProxySettings` (mismo servidor HTTP de la puerta).
pub fn url_proxy_webkit(puerto: u16) -> String {
    url_proxy(puerto)
}

/// `STARSEED_SIN_PROXY_PUERTA`: cualquier valor salvo vacío, «0» o «false» lo apaga.
pub fn apagado(valor: Option<&str>) -> bool {
    match valor.map(|v| v.trim().to_lowercase()) {
        Some(v) => !(v.is_empty() || v == "0" || v == "false"),
        None => false,
    }
}

/// `http://127.0.0.1:<puerto>`: lo que se le da al updater, a reqwest y a curl.
pub fn url_proxy(puerto: u16) -> String {
    format!("http://127.0.0.1:{puerto}")
}

/// `127.0.0.1:<puerto>`: la regla de proxy de Android.
pub fn regla_proxy_android(puerto: u16) -> String {
    format!("127.0.0.1:{puerto}")
}

/// ¿Es un destino que nunca va por el proxy? (el mismo criterio que las listas de arriba, para pruebas y para
/// los clientes de Rust que deciden por URL).
pub fn es_destino_directo(host: &str) -> bool {
    let h = host.trim().trim_start_matches('[').trim_end_matches(']').trim_end_matches('.').to_lowercase();
    if h.is_empty() || h == "localhost" || h.ends_with(".localhost") || h == "::1" || h == "0.0.0.0" || h == "local" || h.ends_with(".local") {
        return true;
    }
    h.starts_with("127.")
}

/// El nombre de host de una URL (sin usuario, puerto ni corchetes); `""` si no se entiende.
pub fn host_de_url(url: &str) -> String {
    let resto = url.split_once("://").map(|(_, r)| r).unwrap_or(url);
    let autoridad = resto.split(['/', '?', '#']).next().unwrap_or("");
    let sin_usuario = autoridad.rsplit('@').next().unwrap_or("");
    let host = if let Some(r) = sin_usuario.strip_prefix('[') {
        r.split(']').next().unwrap_or("")
    } else {
        sin_usuario.split(':').next().unwrap_or("")
    };
    host.to_string()
}

/// Argumentos de `curl` para salir por el proxy de la puerta (vacío si no hay proxy o el destino es del bucle local:
/// el servidor de la propia app y las pruebas con 127.0.0.1 van siempre directos).
pub fn argumentos_curl(proxy: Option<&str>, url: &str) -> Vec<String> {
    match proxy {
        Some(p) if !es_destino_directo(&host_de_url(url)) => vec!["-x".into(), p.into(), "--noproxy".into(), "localhost,127.0.0.1".into()],
        _ => Vec::new(),
    }
}

/// Texto corto y limpio para mostrar (sin controles, ≤ `tope` caracteres); `None` si queda vacío.
pub fn limpiar(texto: Option<String>, tope: usize) -> Option<String> {
    let t: String = texto?.chars().filter(|c| !c.is_control()).collect();
    let t = t.trim();
    if t.is_empty() {
        None
    } else {
        Some(t.chars().take(tope).collect())
    }
}

/// Valida el puerto que manda la página.
pub fn validar_puerto(p: Option<u32>) -> Result<Option<u16>, String> {
    match p {
        None => Ok(None),
        Some(n) if (PUERTO_MIN..=PUERTO_MAX).contains(&n) => Ok(Some(n as u16)),
        Some(n) => Err(format!("Puerto del proxy no válido: {n}.")),
    }
}

// ─────────────────────────────── Máquina de estados ───────────────────────────────

/// Lo que la parte nativa recuerda del proxy.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct EstadoProxy {
    /// El puerto que pide la página (aunque esta plataforma no pueda aplicarlo al webview: las descargas de Rust sí lo usan).
    pub puerto: Option<u16>,
    pub neurona: Option<String>,
    pub via: Option<String>,
    /// El webview YA sale por el proxy.
    pub aplicado: bool,
    /// Último error al aplicar o quitar (se limpia al salir bien).
    pub error: Option<String>,
}

/// Qué hay que hacer en el sistema tras una petición de la página.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Accion {
    Nada,
    Aplicar(u16),
    Quitar,
}

/// Aplica la petición de la página al estado y dice qué hacer. Mismo puerto y ya aplicado = nada (solo cambian
/// los rótulos); mismo puerto sin aplicar = reintenta; `null` con algo aplicado (o pedido) = quitar.
pub fn solicitar(est: &mut EstadoProxy, puerto: Option<u32>, neurona: Option<String>, via: Option<String>) -> Result<Accion, String> {
    let nuevo = validar_puerto(puerto)?;
    est.neurona = if nuevo.is_some() { limpiar(neurona, 80) } else { None };
    est.via = if nuevo.is_some() { limpiar(via, 120) } else { None };
    Ok(match nuevo {
        Some(p) => {
            let igual = est.puerto == Some(p) && est.aplicado;
            est.puerto = Some(p);
            if igual {
                Accion::Nada
            } else {
                Accion::Aplicar(p)
            }
        }
        None => {
            let hacer = est.puerto.is_some() || est.aplicado;
            est.puerto = None;
            if hacer {
                Accion::Quitar
            } else {
                Accion::Nada
            }
        }
    })
}

/// Registra cómo salió la acción en el sistema.
pub fn resultado(est: &mut EstadoProxy, accion: Accion, r: Result<(), String>) {
    match (accion, r) {
        (Accion::Nada, _) => {}
        (Accion::Aplicar(_), Ok(())) => {
            est.aplicado = true;
            est.error = None;
        }
        (Accion::Quitar, Ok(())) => {
            est.aplicado = false;
            est.error = None;
        }
        (Accion::Aplicar(_), Err(e)) => {
            est.aplicado = false;
            est.error = Some(e);
        }
        (Accion::Quitar, Err(e)) => {
            // No se pudo quitar: se sigue contando como aplicado para reintentar quitarlo en la siguiente petición.
            est.error = Some(e);
        }
    }
}

/// Una petición completa: actualiza el estado, decide la acción y —solo si la plataforma puede llevar el webview
/// por el proxy— la ejecuta con `aplicador`. En una plataforma que no puede el puerto se recuerda igual (las
/// descargas de Rust lo usan) pero el webview no se toca. Devuelve la acción pedida por la página.
pub fn transitar(
    est: &mut EstadoProxy,
    cap: &Capacidad,
    puerto: Option<u32>,
    neurona: Option<String>,
    via: Option<String>,
    aplicador: impl FnOnce(Accion) -> Result<(), String>,
) -> Result<Accion, String> {
    let accion = solicitar(est, puerto, neurona, via)?;
    if cap.soportado && accion != Accion::Nada {
        let r = aplicador(accion);
        resultado(est, accion, r);
    }
    Ok(accion)
}

// ─────────────────────────────── Capacidad por plataforma ───────────────────────────────

/// Lo que esta plataforma puede hacer con el webview.
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct Capacidad {
    /// El webview principal puede salir por el proxy.
    pub soportado: bool,
    pub plataforma: String,
    /// Por qué no, en lenguaje llano (la interfaz lo muestra tal cual).
    pub motivo: Option<String>,
}

/// La capacidad que se sabe SIN preguntar al sistema (versión de macOS ya leída; Android la confirma Kotlin).
pub fn capacidad_estatica(os: &str, macos_mayor: Option<u32>, desactivado: bool) -> Capacidad {
    let no = |m: &str| Capacidad { soportado: false, plataforma: os.to_string(), motivo: Some(m.to_string()) };
    if desactivado {
        return no("El proxy de la puerta está apagado en esta instalación (STARSEED_SIN_PROXY_PUERTA).");
    }
    match os {
        "macos" => match macos_mayor {
            Some(v) if v >= 14 => Capacidad { soportado: true, plataforma: os.into(), motivo: None },
            Some(_) => no("Hace falta macOS 14 (Sonoma) o más nuevo para llevar el navegador de la app por la malla."),
            None => no("No se pudo comprobar la versión de macOS."),
        },
        // Kotlin confirma con WebViewFeature.PROXY_OVERRIDE; mientras no conteste se da por posible.
        "android" => Capacidad { soportado: true, plataforma: os.into(), motivo: None },
        "windows" => no("En Windows el navegador de la app todavía no puede salir por la malla; las descargas de la app sí."),
        // LNX1109B: WebKitGTK `WebsiteDataManager::set_network_proxy_settings` (webkit2gtk-4.1), en caliente.
        "linux" => Capacidad { soportado: true, plataforma: os.into(), motivo: None },
        _ => no("Este sistema no puede llevar el navegador de la app por la malla."),
    }
}

/// Lo que ve la web (comando y evento).
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct EstadoPublico {
    pub puerto: Option<u16>,
    pub neurona: Option<String>,
    pub via: Option<String>,
    /// El webview ya sale por el proxy.
    pub aplicado: bool,
    pub soportado: bool,
    pub plataforma: String,
    pub motivo: Option<String>,
    pub error: Option<String>,
    /// Las descargas de Rust (actualizador, capas) usan el proxy mientras hay puerto.
    pub descargas: bool,
}

pub fn publico(est: &EstadoProxy, cap: &Capacidad, desactivado: bool) -> EstadoPublico {
    EstadoPublico {
        puerto: est.puerto,
        neurona: est.neurona.clone(),
        via: est.via.clone(),
        aplicado: est.aplicado,
        soportado: cap.soportado,
        plataforma: cap.plataforma.clone(),
        motivo: cap.motivo.clone(),
        error: est.error.clone(),
        descargas: est.puerto.is_some() && !desactivado,
    }
}

// ─────────────────────────────── Cola hacia Kotlin (Android) ───────────────────────────────

pub const CARPETA_ANDROID: &str = "proxy-puerta";
pub const PREFIJO_PETICION: &str = "peticion-";
pub const ESTADO: &str = "estado.json";

pub fn nombre_peticion(n: u64) -> String {
    format!("{PREFIJO_PETICION}{n:020}.json")
}

/// El JSON de una petición: `{"n":…,"puerto":<n|null>}`.
pub fn texto_peticion(n: u64, puerto: Option<u16>) -> String {
    serde_json::json!({ "n": n, "puerto": puerto }).to_string()
}

/// Escribe la petición (archivo temporal + renombrar: Kotlin nunca la lee a medias).
pub fn escribir_peticion(dir: &Path, n: u64, texto: &str) -> Result<PathBuf, String> {
    std::fs::create_dir_all(dir).map_err(|e| format!("No se pudo crear {}: {e}", dir.display()))?;
    let destino = dir.join(nombre_peticion(n));
    let tmp = dir.join(format!(".{}.tmp", nombre_peticion(n)));
    std::fs::write(&tmp, texto).map_err(|e| format!("No se pudo escribir la petición: {e}"))?;
    std::fs::rename(&tmp, &destino).map_err(|e| format!("No se pudo colocar la petición: {e}"))?;
    Ok(destino)
}

/// Lo que Kotlin deja en `estado.json`.
#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct EstadoKotlin {
    #[serde(default)]
    pub version: u32,
    /// Última petición atendida.
    #[serde(default)]
    pub n: u64,
    /// `WebViewFeature.PROXY_OVERRIDE` existe en este WebView.
    #[serde(default)]
    pub soportado: bool,
    #[serde(default)]
    pub aplicado: bool,
    #[serde(default)]
    pub error: Option<String>,
}

pub fn leer_estado(dir: &Path) -> Option<EstadoKotlin> {
    let e: EstadoKotlin = serde_json::from_str(&std::fs::read_to_string(dir.join(ESTADO)).ok()?).ok()?;
    (e.version > 0).then_some(e)
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn pide(est: &mut EstadoProxy, p: Option<u32>) -> Accion {
        solicitar(est, p, Some("Mac de Alex".into()), Some("Bluetooth directo, 1 salto".into())).unwrap()
    }

    #[test]
    fn maquina_de_estados_aplicar_repetir_quitar() {
        let mut e = EstadoProxy::default();
        assert_eq!(pide(&mut e, None), Accion::Nada, "apagado y sin nada que quitar");
        let a = pide(&mut e, Some(50123));
        assert_eq!(a, Accion::Aplicar(50123));
        resultado(&mut e, a, Ok(()));
        assert!(e.aplicado && e.error.is_none());
        assert_eq!(pide(&mut e, Some(50123)), Accion::Nada, "mismo puerto y aplicado: solo rótulos");
        let b = pide(&mut e, Some(50124));
        assert_eq!(b, Accion::Aplicar(50124), "puerto nuevo = aplicar de nuevo, sin recrear nada");
        resultado(&mut e, b, Ok(()));
        let q = pide(&mut e, None);
        assert_eq!(q, Accion::Quitar);
        assert_eq!(e.puerto, None);
        assert!(e.neurona.is_none() && e.via.is_none(), "al apagar se olvidan los rótulos");
        resultado(&mut e, q, Ok(()));
        assert!(!e.aplicado);
        assert_eq!(pide(&mut e, None), Accion::Nada, "quitar dos veces no hace nada");
    }

    #[test]
    fn transitar_solo_toca_el_webview_si_la_plataforma_puede() {
        let buena = capacidad_estatica("macos", Some(14), false);
        let mala = capacidad_estatica("windows", None, false);
        let mut llamadas: Vec<Accion> = Vec::new();
        let mut e = EstadoProxy::default();
        transitar(&mut e, &buena, Some(50123), None, None, |a| {
            llamadas.push(a);
            Ok(())
        })
        .unwrap();
        assert!(e.aplicado);
        transitar(&mut e, &buena, Some(50123), None, None, |a| {
            llamadas.push(a);
            Ok(())
        })
        .unwrap();
        transitar(&mut e, &buena, None, None, None, |a| {
            llamadas.push(a);
            Ok(())
        })
        .unwrap();
        assert_eq!(llamadas, vec![Accion::Aplicar(50123), Accion::Quitar], "la repetición no vuelve a tocar el webview");
        assert!(!e.aplicado);
        // Plataforma sin soporte: el puerto se recuerda (descargas) y el webview no se toca.
        let mut w = EstadoProxy::default();
        let r = transitar(&mut w, &mala, Some(50123), Some("x".into()), None, |_| panic!("no debe tocar el webview"));
        assert_eq!(r, Ok(Accion::Aplicar(50123)));
        assert_eq!(w.puerto, Some(50123));
        assert!(!w.aplicado);
        assert_eq!(transitar(&mut w, &mala, None, None, None, |_| panic!("tampoco al quitar")), Ok(Accion::Quitar));
        assert_eq!(w.puerto, None);
        // Un puerto malo no llama a nadie.
        assert!(transitar(&mut w, &buena, Some(22), None, None, |_| panic!("no")).is_err());
        // Un fallo queda anotado y no marca aplicado.
        let mut f = EstadoProxy::default();
        transitar(&mut f, &buena, Some(50123), None, None, |_| Err("sin WKWebView".into())).unwrap();
        assert!(!f.aplicado && f.error.is_some());
    }

    #[test]
    fn un_fallo_se_reintenta_en_la_siguiente_peticion() {
        let mut e = EstadoProxy::default();
        let a = pide(&mut e, Some(50123));
        resultado(&mut e, a, Err("WKWebView no respondió".into()));
        assert!(!e.aplicado);
        assert_eq!(e.error.as_deref(), Some("WKWebView no respondió"));
        assert_eq!(pide(&mut e, Some(50123)), Accion::Aplicar(50123), "no aplicado = se reintenta");
        // Quitar que falla: sigue contando como pendiente de quitar.
        let mut f = EstadoProxy::default();
        let a = pide(&mut f, Some(50123));
        resultado(&mut f, a, Ok(()));
        let q = pide(&mut f, None);
        resultado(&mut f, q, Err("x".into()));
        assert!(f.aplicado, "no se pudo quitar: se sigue marcando aplicado");
        assert_eq!(pide(&mut f, None), Accion::Quitar, "y se reintenta quitar");
    }

    #[test]
    fn puertos_validos_y_rotulos_limpios() {
        assert_eq!(validar_puerto(None), Ok(None));
        assert_eq!(validar_puerto(Some(1024)), Ok(Some(1024)));
        assert_eq!(validar_puerto(Some(65535)), Ok(Some(65535)));
        for malo in [0, 80, 1023, 65536, 1_000_000] {
            assert!(validar_puerto(Some(malo)).is_err(), "{malo}");
        }
        let mut e = EstadoProxy::default();
        assert!(solicitar(&mut e, Some(80), None, None).is_err());
        assert_eq!(e, EstadoProxy::default(), "una petición mala no cambia nada");
        assert_eq!(limpiar(Some("  a\u{7}b\n".into()), 10).as_deref(), Some("ab"));
        assert_eq!(limpiar(Some("   ".into()), 10), None);
        assert_eq!(limpiar(Some("x".repeat(500)), 80).unwrap().chars().count(), 80);
        let mut e = EstadoProxy::default();
        solicitar(&mut e, Some(50000), Some("\u{1b}[31mMac".into()), None).unwrap();
        assert_eq!(e.neurona.as_deref(), Some("[31mMac"));
    }

    #[test]
    fn url_y_reglas_del_proxy() {
        assert_eq!(url_proxy(50123), "http://127.0.0.1:50123");
        assert_eq!(regla_proxy_android(50123), "127.0.0.1:50123");
        // El proxy es SIEMPRE el de loopback: la página no elige a dónde apunta, solo el puerto.
        assert!(url_proxy(65535).starts_with("http://127.0.0.1:"));
    }

    #[test]
    fn el_bucle_local_nunca_va_por_el_proxy() {
        for h in ["localhost", "LOCALHOST", "127.0.0.1", "127.0.0.2", "app.localhost", "[::1]", "::1", "impresora.local", "0.0.0.0", "localhost."] {
            assert!(es_destino_directo(h), "{h}");
        }
        for h in ["starseed-os.vercel.app", "example.com", "8.8.8.8", "localhost.example.com", "notlocal", ""] {
            assert_eq!(es_destino_directo(h), h.is_empty(), "{h}");
        }
        for d in ["localhost", "127.0.0.1", "::1"] {
            assert!(DOMINIOS_DIRECTOS.contains(&d), "{d}");
        }
        for r in ["127.0.0.1", "localhost", "<local>"] {
            assert!(REGLAS_DIRECTAS_ANDROID.contains(&r), "{r}");
        }
        assert!(REGLAS_DIRECTAS_ANDROID.contains(&"*.localhost"));
    }

    #[test]
    fn curl_y_hosts_de_las_descargas() {
        assert_eq!(host_de_url("https://github.com/o/r/releases/x.tar.gz"), "github.com");
        assert_eq!(host_de_url("http://127.0.0.1:47610/a?b=c"), "127.0.0.1");
        assert_eq!(host_de_url("https://usuario:clave@huggingface.co:443/x"), "huggingface.co");
        assert_eq!(host_de_url("http://[::1]:8080/x"), "::1");
        assert_eq!(host_de_url("https://a.b/c#d"), "a.b");
        let p = "http://127.0.0.1:50123";
        let con = argumentos_curl(Some(p), "https://huggingface.co/x.cact");
        assert_eq!(con, vec!["-x", p, "--noproxy", "localhost,127.0.0.1"]);
        assert!(argumentos_curl(None, "https://huggingface.co/x").is_empty(), "sin proxy, curl como siempre");
        assert!(argumentos_curl(Some(p), "http://127.0.0.1:47610/x").is_empty(), "el bucle local va directo");
        assert!(argumentos_curl(Some(p), "http://localhost:3000/x").is_empty());
    }

    #[test]
    fn capacidad_por_plataforma() {
        assert!(capacidad_estatica("macos", Some(14), false).soportado);
        assert!(capacidad_estatica("macos", Some(15), false).soportado);
        let viejo = capacidad_estatica("macos", Some(13), false);
        assert!(!viejo.soportado && viejo.motivo.unwrap().contains("macOS 14"));
        assert!(!capacidad_estatica("macos", None, false).soportado);
        assert!(capacidad_estatica("android", None, false).soportado);
        for os in ["windows", "ios", "otro"] {
            let c = capacidad_estatica(os, None, false);
            assert!(!c.soportado && c.motivo.is_some(), "{os}");
        }
        // LNX1109B: Linux sí (WebKitGTK), y el interruptor de emergencia lo apaga como en el resto.
        assert!(capacidad_estatica("linux", None, false).soportado);
        assert!(!capacidad_estatica("linux", None, true).soportado);
        assert_eq!(IGNORAR_WEBKIT, ["localhost", "127.0.0.1", "::1", "*.localhost"]);
        for d in IGNORAR_WEBKIT {
            assert!(es_destino_directo(&d.replace("*.", "x.")), "{d}");
        }
        assert_eq!(url_proxy_webkit(50123), "http://127.0.0.1:50123");
        let apagada = capacidad_estatica("macos", Some(15), true);
        assert!(!apagada.soportado && apagada.motivo.unwrap().contains(VARIABLE_APAGADO));
    }

    #[test]
    fn interruptor_de_emergencia() {
        assert!(!apagado(None));
        assert!(!apagado(Some("")));
        assert!(!apagado(Some("0")));
        assert!(!apagado(Some("false")));
        assert!(apagado(Some("1")));
        assert!(apagado(Some("si")));
    }

    #[test]
    fn estado_publico_y_descargas() {
        let mut e = EstadoProxy::default();
        let cap = capacidad_estatica("windows", None, false);
        assert!(!publico(&e, &cap, false).descargas, "sin puerto no hay descargas por el proxy");
        pide(&mut e, Some(50123));
        let p = publico(&e, &cap, false);
        assert!(p.descargas && !p.soportado && !p.aplicado, "Windows: las descargas sí, el webview no");
        assert_eq!(p.puerto, Some(50123));
        assert!(!publico(&e, &cap, true).descargas, "apagado: ni las descargas");
        let j = serde_json::to_value(&p).unwrap();
        for campo in ["puerto", "neurona", "via", "aplicado", "soportado", "plataforma", "motivo", "error", "descargas"] {
            assert!(j.get(campo).is_some(), "falta {campo}");
        }
    }

    #[test]
    fn cola_de_peticiones_hacia_kotlin() {
        assert_eq!(nombre_peticion(7), "peticion-00000000000000000007.json");
        assert!(nombre_peticion(9) < nombre_peticion(10), "el orden de nombres es el orden numérico");
        assert_eq!(texto_peticion(3, Some(50123)), r#"{"n":3,"puerto":50123}"#);
        assert_eq!(texto_peticion(4, None), r#"{"n":4,"puerto":null}"#);
        let dir = std::env::temp_dir().join(format!("ss-proxy-puerta-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let f = escribir_peticion(&dir, 1, &texto_peticion(1, Some(50123))).unwrap();
        assert!(f.is_file() && std::fs::read_to_string(&f).unwrap().contains("50123"));
        assert!(!dir.join(format!(".{}.tmp", nombre_peticion(1))).exists(), "sin temporales");
        assert!(leer_estado(&dir).is_none());
        std::fs::write(dir.join(ESTADO), r#"{"version":1,"n":1,"soportado":true,"aplicado":true}"#).unwrap();
        let k = leer_estado(&dir).unwrap();
        assert!(k.soportado && k.aplicado && k.n == 1 && k.error.is_none());
        std::fs::write(dir.join(ESTADO), "no es json").unwrap();
        assert!(leer_estado(&dir).is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
