// ═══════════════════════════════════════════════════════════════════════════
// puerta_proxy — el webview, las descargas de Rust y el proxy de la puerta de internet (PTA1108B · 2026-11-08).
// Contrato: architecture/red-sin-dependencias.md §5.3 (c). Lo puro (con pruebas) está en puerta_proxy_logica.rs.
// ---------------------------------------------------------------------------
// `native/servidor-local/puerta.cjs` abre un proxy HTTP en 127.0.0.1:<puerto> solo mientras la página lo
// activa (sin salida propia y con al menos una puerta). La página avisa aquí cada vez que arranca, cambia o se
// para (`puerta_proxy_local`) y la app nativa:
//   · macOS 14+  : `WKWebsiteDataStore.proxyConfigurations` de la ventana principal, EN CALIENTE (sin recrear el
//                  webview): `nw_proxy_config_create_http_connect` de Network.framework + dominios excluidos de
//                  bucle local. Se cubre también todo <iframe> (mismo almacén de datos): es el navegador de la app.
//   · Android    : `androidx.webkit.ProxyController.setProxyOverride` (Kotlin, ProxyPuertaStarSeed.kt) con reglas de
//                  salto para 127.0.0.1/localhost/<local>; Rust le deja una petición en una carpeta y lee su estado.
//   · Windows (WIN1109B): WebView2 no tiene API de proxy en caliente. Al arrancar, `puerta_proxy_windows::instalar()`
//                  deja el webview apuntando SIEMPRE a una pasarela local (127.0.0.1:47077, `--proxy-server` por
//                  `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`) que va directa a Internet y solo encadena con el proxy de
//                  `puerta.cjs` mientras haya puerto (esta acción lo fija o lo quita). Si no se pudo instalar (proxy del
//                  sistema, variable ya con proxy, puerto ocupado) la capacidad es `false` con su motivo.
//   · Linux: el webview no se toca (capacidad `false`, con el motivo); las descargas de Rust sí usan el proxy.
//   · Descargas de Rust (actualizador, manifiestos por reqwest, capas con curl): `proxy_url()` mientras haya puerto.
// Nunca se proxifica el bucle local: el servidor de la propia app (127.0.0.1:4761x) y `*.localhost` van siempre directos.
// Comandos: `puerta_proxy_local` y `puerta_proxy_estado`. Evento: `puerta://estado` (EstadoPublico).
// Interruptor de emergencia: STARSEED_SIN_PROXY_PUERTA=1 (en Android, al compilar: no se inyecta el módulo Kotlin).
// ═══════════════════════════════════════════════════════════════════════════

use crate::puerta_proxy_logica as l;
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Manager, State};

/// El estado gestionado por Tauri (`app.manage`) y, a la vez, el que leen las descargas de Rust.
pub struct EstadoPuertaProxy {
    estado: Mutex<l::EstadoProxy>,
    /// Una petición a la vez (aplicar un proxy no admite carreras).
    orden: Mutex<()>,
}

static GLOBAL: OnceLock<Arc<EstadoPuertaProxy>> = OnceLock::new();

fn global() -> Arc<EstadoPuertaProxy> {
    GLOBAL.get_or_init(|| Arc::new(EstadoPuertaProxy { estado: Mutex::new(l::EstadoProxy::default()), orden: Mutex::new(()) })).clone()
}

fn bloquear<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// Se llama en `setup`: deja el estado en el manejador de Tauri.
pub fn iniciar(app: &AppHandle) {
    app.manage(global());
}

fn desactivado() -> bool {
    l::apagado(std::env::var(l::VARIABLE_APAGADO).ok().as_deref())
}

/// La URL del proxy de la puerta si la página lo tiene encendido (`None` si no, o si está apagado por entorno).
/// La usan el actualizador, los manifiestos por reqwest y las capas con curl: sin puerto, todo sigue igual.
pub fn proxy_url() -> Option<String> {
    if desactivado() {
        return None;
    }
    bloquear(&global().estado).puerto.map(l::url_proxy)
}

// ─────────────────────────────── Plataformas ───────────────────────────────

#[cfg(target_os = "macos")]
fn macos_mayor() -> Option<u32> {
    static V: OnceLock<Option<u32>> = OnceLock::new();
    *V.get_or_init(|| {
        let salida = std::process::Command::new("sw_vers").arg("-productVersion").output().ok()?;
        String::from_utf8_lossy(&salida.stdout).trim().split('.').next()?.parse().ok()
    })
}
#[cfg(not(target_os = "macos"))]
fn macos_mayor() -> Option<u32> {
    None
}

#[cfg(target_os = "android")]
static DIR_APP: OnceLock<std::path::PathBuf> = OnceLock::new();
#[cfg(target_os = "android")]
static SECUENCIA: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// La carpeta que comparte con ProxyPuertaStarSeed.kt: la del guardián (si arrancó) o la de la app.
#[cfg(target_os = "android")]
fn dir_android(app: Option<&AppHandle>) -> Option<std::path::PathBuf> {
    if let (None, Some(app)) = (DIR_APP.get(), app) {
        if let Ok(d) = app.path().app_data_dir() {
            let _ = DIR_APP.set(d.join("files").join("starseed").join(l::CARPETA_ANDROID));
        }
    }
    let candidatas: Vec<std::path::PathBuf> =
        crate::android::dir_datos().map(|d| d.join(l::CARPETA_ANDROID)).into_iter().chain(DIR_APP.get().cloned()).collect();
    candidatas.iter().find(|d| d.join(l::ESTADO).is_file()).cloned().or_else(|| candidatas.into_iter().next())
}

fn capacidad_actual(_app: &AppHandle, desact: bool) -> l::Capacidad {
    #[allow(unused_mut)]
    let mut c = l::capacidad_estatica(std::env::consts::OS, macos_mayor(), desact);
    #[cfg(target_os = "android")]
    {
        if c.soportado {
            match dir_android(Some(_app)).and_then(|d| l::leer_estado(&d)) {
                // Kotlin ya contestó: manda lo que dice el WebView de este teléfono.
                Some(k) if !k.soportado => {
                    c.soportado = false;
                    c.motivo = Some("El WebView de este teléfono no admite el proxy por aplicación (hace falta uno reciente: actualiza «Android System WebView»).".into());
                }
                Some(_) => {}
                // Kotlin aún no escribió: o el APK no trae el módulo, o arranca. Se intenta; la petición lo dirá.
                None => {}
            }
        }
    }
    // WIN1109B: soportado solo si la pasarela del navegador quedó instalada al arrancar.
    #[cfg(target_os = "windows")]
    {
        if !desact {
            if crate::puerta_proxy_windows::activa() {
                c.soportado = true;
                c.motivo = None;
            } else if let Some(m) = crate::puerta_proxy_windows::motivo_no_instalada() {
                c.motivo = Some(m);
            }
        }
    }
    c
}

/// macOS: `WKWebsiteDataStore.proxyConfigurations` (macOS 14+). Todo en el hilo principal (dentro de `with_webview`).
#[cfg(target_os = "macos")]
mod macos {
    use crate::puerta_proxy_logica as l;
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2::{class, msg_send, sel};
    use std::ffi::{c_char, c_void, CString};

    // Network.framework existe desde macOS 10.14, pero `nw_proxy_config_*` solo desde la 14 y la app admite
    // desde la 10.15: se enlaza el marco (para que esté cargado) y los símbolos se buscan con `dlsym` en el
    // momento de usarlos, así un Mac anterior arranca igual y simplemente responde «no se puede».
    #[link(name = "Network", kind = "framework")]
    extern "C" {}
    extern "C" {
        fn dlsym(handle: *mut c_void, simbolo: *const c_char) -> *mut c_void;
    }
    const RTLD_DEFAULT: *mut c_void = -2isize as *mut c_void;

    /// `nw_endpoint_t nw_endpoint_create_host(const char *host, const char *port)`
    type CrearPunto = unsafe extern "C" fn(*const c_char, *const c_char) -> *mut AnyObject;
    /// `nw_proxy_config_t nw_proxy_config_create_http_connect(nw_endpoint_t, nw_protocol_options_t tls_o_nulo)`
    type CrearConfig = unsafe extern "C" fn(*mut AnyObject, *mut AnyObject) -> *mut AnyObject;
    /// `void nw_proxy_config_add_excluded_domain(nw_proxy_config_t, const char *domain)`
    type Excluir = unsafe extern "C" fn(*mut AnyObject, *const c_char);

    unsafe fn simbolo<T: Copy>(nombre: &str) -> Result<T, String> {
        let c = CString::new(nombre).map_err(|e| e.to_string())?;
        let p = unsafe { dlsym(RTLD_DEFAULT, c.as_ptr()) };
        if p.is_null() {
            return Err(format!("Este macOS no trae {nombre} (hace falta macOS 14 o más nuevo)."));
        }
        // SAFETY: el símbolo tiene la firma documentada en Network.framework; `T` es un puntero a función.
        Ok(unsafe { std::mem::transmute_copy::<*mut c_void, T>(&p) })
    }

    /// El `nw_proxy_config_t` HTTP CONNECT hacia 127.0.0.1:<puerto>, con el bucle local excluido.
    unsafe fn crear_config(puerto: u16) -> Result<Retained<AnyObject>, String> {
        let crear_punto: CrearPunto = unsafe { simbolo("nw_endpoint_create_host")? };
        let crear_config: CrearConfig = unsafe { simbolo("nw_proxy_config_create_http_connect")? };
        let excluir: Excluir = unsafe { simbolo("nw_proxy_config_add_excluded_domain")? };
        let host = CString::new("127.0.0.1").map_err(|e| e.to_string())?;
        let port = CString::new(puerto.to_string()).map_err(|e| e.to_string())?;
        // Las funciones `create` devuelven un objeto con +1: `from_raw` lo adopta y se libera solo.
        let punto = unsafe { Retained::from_raw(crear_punto(host.as_ptr(), port.as_ptr())) }.ok_or("no se pudo crear el destino del proxy")?;
        let config = unsafe { Retained::from_raw(crear_config(Retained::as_ptr(&punto) as *mut AnyObject, std::ptr::null_mut())) }
            .ok_or("no se pudo crear la configuración del proxy")?;
        for dominio in l::DOMINIOS_DIRECTOS {
            let d = CString::new(dominio).map_err(|e| e.to_string())?;
            unsafe { excluir(Retained::as_ptr(&config) as *mut AnyObject, d.as_ptr()) };
        }
        Ok(config)
    }

    /// Pone (`Some`) o quita (`None`) el proxy del almacén de datos del `WKWebView`.
    ///
    /// # Safety
    /// `wkwebview` es el puntero que da `PlatformWebview::inner()` (un `WKWebView` vivo) y se llama en el hilo
    /// principal (dentro de `with_webview`).
    pub unsafe fn aplicar(wkwebview: *mut c_void, puerto: Option<u16>) -> Result<(), String> {
        let vista: &AnyObject = unsafe { (wkwebview as *const AnyObject).as_ref() }.ok_or("la ventana no tiene WKWebView")?;
        let configuracion: Option<Retained<AnyObject>> = unsafe { msg_send![vista, configuration] };
        let configuracion = configuracion.ok_or("el WKWebView no tiene configuración")?;
        let almacen: Option<Retained<AnyObject>> = unsafe { msg_send![&*configuracion, websiteDataStore] };
        let almacen = almacen.ok_or("el WKWebView no tiene almacén de datos")?;
        let sabe: bool = unsafe { msg_send![&*almacen, respondsToSelector: sel!(setProxyConfigurations:)] };
        if !sabe {
            return Err("Este WebKit no admite proxyConfigurations (hace falta macOS 14 o más nuevo).".into());
        }
        let lista: Option<Retained<AnyObject>> = match puerto {
            None => unsafe { msg_send![class!(NSArray), array] },
            Some(p) => {
                let config = unsafe { crear_config(p)? };
                unsafe { msg_send![class!(NSArray), arrayWithObject: &*config] }
            }
        };
        let lista = lista.ok_or("no se pudo crear la lista de proxies")?;
        let _: () = unsafe { msg_send![&*almacen, setProxyConfigurations: &*lista] };
        Ok(())
    }
}

#[allow(dead_code)]
fn puerto_de(accion: l::Accion) -> Option<u16> {
    match accion {
        l::Accion::Aplicar(p) => Some(p),
        _ => None,
    }
}

/// Aplica la acción al webview principal. Bloqueante: se llama desde `spawn_blocking`.
#[cfg(target_os = "macos")]
fn aplicar_al_sistema(app: &AppHandle, accion: l::Accion) -> Result<(), String> {
    let puerto = puerto_de(accion);
    let ventana = app.get_webview_window("main").ok_or("no hay ventana principal")?;
    let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
    ventana
        .with_webview(move |pw| {
            // SAFETY: `inner()` es el WKWebView vivo de esta ventana y `with_webview` corre en el hilo principal.
            let _ = tx.send(unsafe { macos::aplicar(pw.inner(), puerto) });
        })
        .map_err(|e| e.to_string())?;
    rx.recv_timeout(std::time::Duration::from_secs(5)).map_err(|_| "la ventana no respondió".to_string())?
}

/// Android: deja la petición a Kotlin (ProxyPuertaStarSeed.kt) y espera su contestación en `estado.json`.
#[cfg(target_os = "android")]
fn aplicar_al_sistema(app: &AppHandle, accion: l::Accion) -> Result<(), String> {
    use std::sync::atomic::Ordering;
    let puerto = puerto_de(accion);
    let dir = dir_android(Some(app)).ok_or("La parte Android de StarSeed no arrancó (sin carpeta compartida).")?;
    let ahora = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_micros() as u64).unwrap_or(0);
    let previo = SECUENCIA.fetch_update(Ordering::SeqCst, Ordering::SeqCst, |a| Some(a.max(ahora.saturating_sub(1)) + 1)).unwrap_or(0);
    let n = previo.max(ahora.saturating_sub(1)) + 1;
    l::escribir_peticion(&dir, n, &l::texto_peticion(n, puerto))?;
    // Kotlin atiende en su hilo principal y contesta en estado.json: se espera su número.
    let limite = std::time::Instant::now() + std::time::Duration::from_secs(4);
    while std::time::Instant::now() < limite {
        if let Some(k) = l::leer_estado(&dir) {
            if k.n >= n {
                if !k.soportado {
                    return Err("Este WebView no admite el proxy por aplicación.".into());
                }
                return match k.error {
                    Some(e) => Err(e),
                    None if k.aplicado == puerto.is_some() => Ok(()),
                    None => Err("Android no aplicó el proxy.".into()),
                };
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    Err("Este APK no trae el proxy de la puerta o no contestó a tiempo.".into())
}

/// Windows (WIN1109B): la pasarela local ya es el proxy del webview; aquí solo se le dice si hay puerta.
#[cfg(target_os = "windows")]
fn aplicar_al_sistema(_app: &AppHandle, accion: l::Accion) -> Result<(), String> {
    crate::puerta_proxy_windows::fijar_puerta(puerto_de(accion))
}

/// Linux y demás: el webview no se toca (la capacidad ya dice por qué).
#[cfg(not(any(target_os = "macos", target_os = "android", target_os = "windows")))]
fn aplicar_al_sistema(_app: &AppHandle, _accion: l::Accion) -> Result<(), String> {
    Err("este sistema no lleva el webview por el proxy".into())
}

fn ejecutar(app: &AppHandle, g: &EstadoPuertaProxy, puerto: Option<u32>, neurona: Option<String>, via: Option<String>) -> Result<l::EstadoPublico, String> {
    let _una_a_la_vez = bloquear(&g.orden);
    let desact = desactivado();
    let cap = capacidad_actual(app, desact);
    let mut est = bloquear(&g.estado).clone();
    // Apagado por entorno: el puerto no se recuerda (ni el webview ni las descargas lo usan), pero quitar sí vale.
    let puerto = if desact { None } else { puerto };
    l::transitar(&mut est, &cap, puerto, neurona, via, |accion| aplicar_al_sistema(app, accion))?;
    let publico = l::publico(&est, &cap, desact);
    *bloquear(&g.estado) = est;
    let _ = app.emit(l::EVENTO, &publico);
    Ok(publico)
}

/// La página dice dónde está el proxy local de la puerta (`puerto`) o que ya no (`null`). `neurona` y `via` son
/// solo rótulos para la interfaz («Internet por: Mac de Alex (vía Bluetooth directo, 1 salto)»).
#[tauri::command]
pub async fn puerta_proxy_local(
    app: AppHandle,
    estado: State<'_, Arc<EstadoPuertaProxy>>,
    puerto: Option<u32>,
    neurona: Option<String>,
    via: Option<String>,
) -> Result<l::EstadoPublico, String> {
    let g = estado.inner().clone();
    // `with_webview` espera al hilo principal: nunca desde el hilo que lo atiende.
    tauri::async_runtime::spawn_blocking(move || ejecutar(&app, &g, puerto, neurona, via)).await.map_err(|e| e.to_string())?
}

/// Lo que sabe la app ahora mismo (para quien se suscribe tarde al evento).
#[tauri::command]
pub async fn puerta_proxy_estado(app: AppHandle, estado: State<'_, Arc<EstadoPuertaProxy>>) -> Result<l::EstadoPublico, String> {
    let g = estado.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let desact = desactivado();
        let cap = capacidad_actual(&app, desact);
        let est = bloquear(&g.estado).clone();
        l::publico(&est, &cap, desact)
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn sin_puerto_las_descargas_no_usan_proxy() {
        let g = global();
        *bloquear(&g.estado) = l::EstadoProxy::default();
        assert_eq!(proxy_url(), None);
        bloquear(&g.estado).puerto = Some(50123);
        let esperado = if desactivado() { None } else { Some("http://127.0.0.1:50123".to_string()) };
        assert_eq!(proxy_url(), esperado);
        *bloquear(&g.estado) = l::EstadoProxy::default();
        assert_eq!(proxy_url(), None);
    }

    #[test]
    fn el_comando_esta_registrado_y_con_permiso() {
        let lib = include_str!("lib.rs");
        let build = include_str!("../build.rs");
        let cap = include_str!("../capabilities/default.json");
        for c in ["puerta_proxy_local", "puerta_proxy_estado"] {
            assert!(lib.contains(&format!("puerta_proxy::{c}")), "{c} sin registrar en lib.rs");
            assert!(build.contains(&format!("\"{c}\"")), "{c} sin permiso generado en build.rs");
            assert!(cap.contains(&format!("\"allow-{}\"", c.replace('_', "-"))), "{c} sin allow en default.json");
        }
        assert!(lib.contains("puerta_proxy::iniciar"), "falta gestionar el estado en setup");
    }
}
