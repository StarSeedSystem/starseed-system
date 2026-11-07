// ═══════════════════════════════════════════════════════════════════════════
// migracion_origen_local — la exportación de la migración SIN internet (T4b · TAM1107A, 2026-11-07).
// Contrato: architecture/apps-autonomas-sin-internet.md §2.1.
// ---------------------------------------------------------------------------
// localStorage e IndexedDB son por ORIGEN. Para leer los de la web publicada sin red, la ventana oculta
// carga un HTML que va DENTRO del binario (`HTML_SIN_RED`) pero con la dirección —y por tanto el origen—
// de la web publicada; el motor lee su propio almacén, sin que nadie toque sus archivos:
//   · Linux (WebKitGTK): `webkit_web_view_load_html(html, base_uri)`.
//   · macOS (WKWebView): `-[WKWebView loadHTMLString:baseURL:]`.
//   · Windows (WebView2): un filtro `WebResourceRequested` SOLO para `<web>/offline.html` que responde
//     con el HTML desde memoria, y `Navigate(<web>/offline.html?…)`: la petición nunca sale a la red.
// El exportador (script de inicio) lo inyecta Tauri igual que con red; el puente IPC y su ACL ven la
// misma dirección que con red. Con internet nada de esto se usa: la ventana abre la página de verdad.
// Aquí solo lo que habla con cada motor, sin Tauri (el pegamento está en `migracion_origen.rs`): así se
// puede comprobar por separado para cada sistema. Mismas versiones de las crates que ya usa tauri.
// ═══════════════════════════════════════════════════════════════════════════

/// ¿Este sistema sabe abrir el HTML local con el origen de la web publicada?
pub const DISPONIBLE: bool = cfg!(any(target_os = "linux", target_os = "macos", target_os = "windows"));

/// Linux: WebKitGTK carga el HTML con `url_base` como dirección del documento (su origen manda).
#[cfg(target_os = "linux")]
pub fn cargar_webkitgtk(vista: &webkit2gtk::WebView, html: &str, url_base: &str) -> Result<(), String> {
    use webkit2gtk::WebViewExt;
    vista.load_html(html, Some(url_base));
    Ok(())
}

/// macOS: `-[WKWebView loadHTMLString:baseURL:]`.
///
/// # Safety
/// `wkwebview` es el puntero que da `PlatformWebview::inner()` (un `WKWebView` vivo) y se llama en el hilo
/// principal (dentro de `with_webview`).
#[cfg(target_os = "macos")]
pub unsafe fn cargar_wkwebview(wkwebview: *mut std::ffi::c_void, html: &str, url_base: &str) -> Result<(), String> {
    use objc2::msg_send;
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2_foundation::{NSString, NSURL};
    let vista: &AnyObject = unsafe { (wkwebview as *const AnyObject).as_ref() }.ok_or("la ventana no tiene WKWebView")?;
    let url = NSURL::URLWithString(&NSString::from_str(url_base)).ok_or("dirección base no válida")?;
    let contenido = NSString::from_str(html);
    let _navegacion: Option<Retained<AnyObject>> = unsafe { msg_send![vista, loadHTMLString: &*contenido, baseURL: &*url] };
    Ok(())
}

/// Windows: responde `pagina` (y solo ella) desde memoria y navega a `url_base`, que empieza por `pagina`.
/// El filtro y el manejador son de ESTA vista (la ventana oculta); la principal no los ve.
#[cfg(target_os = "windows")]
pub fn cargar_webview2(
    controlador: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Controller,
    entorno: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Environment,
    html: &str,
    url_base: &str,
    pagina: &str,
) -> Result<(), String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_WEB_RESOURCE_CONTEXT_DOCUMENT;
    use webview2_com::{take_pwstr, WebResourceRequestedEventHandler};
    use windows::core::{HSTRING, PWSTR};
    use windows::Win32::UI::Shell::SHCreateMemStream;

    let error = |que: &str, e: windows::core::Error| format!("WebView2 ({que}): {e}");
    let vista = unsafe { controlador.CoreWebView2() }.map_err(|e| error("vista", e))?;
    let filtro = HSTRING::from(format!("{pagina}*"));
    unsafe { vista.AddWebResourceRequestedFilter(&filtro, COREWEBVIEW2_WEB_RESOURCE_CONTEXT_DOCUMENT) }.map_err(|e| error("filtro", e))?;
    let cuerpo: Vec<u8> = html.as_bytes().to_vec();
    let pagina = pagina.to_string();
    let entorno = entorno.clone();
    let manejador = WebResourceRequestedEventHandler::create(Box::new(move |_vista, args| {
        let Some(args) = args else { return Ok(()) };
        let uri = unsafe {
            let peticion = args.Request()?;
            let mut uri = PWSTR::null();
            peticion.Uri(&mut uri)?;
            take_pwstr(uri)
        };
        if !crate::migracion_origen_logica::es_pagina_sin_red(&uri, &pagina) {
            return Ok(());
        }
        unsafe {
            let flujo = SHCreateMemStream(Some(&cuerpo));
            let respuesta = entorno.CreateWebResourceResponse(
                flujo.as_ref(),
                200,
                &HSTRING::from("OK"),
                &HSTRING::from("Content-Type: text/html; charset=utf-8\r\nCache-Control: no-store"),
            )?;
            args.SetResponse(&respuesta)?;
        }
        Ok(())
    }));
    let mut ficha = Default::default();
    unsafe { vista.add_WebResourceRequested(&manejador, &mut ficha) }.map_err(|e| error("manejador", e))?;
    unsafe { vista.Navigate(&HSTRING::from(url_base)) }.map_err(|e| error("navegar", e))?;
    Ok(())
}
