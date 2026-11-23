//! (CTL1118L · CTL1118H) Control entre mis neuronas · el indicador de un Linux (X11) como aparato controlado (contrato
//! architecture/control-remoto-entre-neuronas.md §2.4: sin indicador a la vista no hay control).
//!
//! CTL1118H: lo mismo que Android y macOS, un PUNTO del color de quien controla (con borde blanco) en la esquina de arriba a la
//! derecha, siempre encima, en todos los escritorios y sin quitar el foco a la ventana que se controla (`accept_focus(false)`).
//! Al pulsarlo se abre un panel pequeño con el nombre ENTERO de quien controla (hasta dos líneas), «Reanudar» (solo en pausa),
//! «Terminar» (corta la sesión; el permiso sigue) y «Quitar permiso» (la corta y lo apaga; pide una segunda pulsación). Antes era
//! una franja roja arriba con tres botones. GTK es la biblioteca que ya trae la ventana de la app: no añade ningún paquete.
//!
//! Los botones los atiende Rust en un hilo aparte (no en el de GTK): aunque la página esté colgada o comprometida, terminar
//! funciona. Si la ventana del punto se cierra o se desmapea por cualquier motivo, `indicador_visible()` pasa a falso y el vigía de
//! `control_neuronas` cierra la sesión con `sin-indicador`.
//!
//! Linux no tiene bandeja del sistema (en Xfce depende de un plugin que puede no estar) ni atajo global (en X11 exige acaparar
//! teclas): con `indicador=oculto` NO se puede quitar el punto, porque no quedaría ningún otro aviso. El ajuste se respeta en
//! macOS y en Android; aquí el punto se pone siempre (`control_punto_logica::dibujar_punto(…, false)`). No comprobado a ojo.

use crate::control_neuronas as cn;
use crate::control_punto_logica as p;
use gtk::prelude::*;
use std::cell::RefCell;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;
use tauri::AppHandle;

static VISIBLE: AtomicBool = AtomicBool::new(false);
/// Cada apertura o cierre del panel suma uno: el plegado por tiempo solo vale si nadie lo tocó desde entonces.
static GENERACION: AtomicU64 = AtomicU64::new(0);

fn confirmacion() -> std::sync::MutexGuard<'static, p::Confirmacion> {
    static C: std::sync::Mutex<p::Confirmacion> = std::sync::Mutex::new(p::Confirmacion::nueva());
    C.lock().unwrap_or_else(|e| e.into_inner())
}

struct Pieza {
    punto: gtk::Window,
    panel: gtk::Window,
    nombre: gtk::Label,
    estado: gtk::Label,
    reanudar: gtk::Button,
    quitar: gtk::Button,
    nivel: String,
    css: gtk::CssProvider,
}

thread_local! {
    /// Solo se toca en el hilo principal de GTK.
    static PIEZA: RefCell<Option<Pieza>> = const { RefCell::new(None) };
}

pub fn indicador_visible() -> bool {
    VISIBLE.load(Ordering::SeqCst)
}

/// Corre `f` en el hilo principal de GTK y espera su resultado (3 s como mucho).
fn en_principal<R: Send + 'static>(app: &AppHandle, f: impl FnOnce() -> R + Send + 'static) -> Option<R> {
    if gtk::is_initialized_main_thread() {
        return Some(f());
    }
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let _ = tx.send(f());
    })
    .ok()?;
    rx.recv_timeout(Duration::from_secs(3)).ok()
}

/// Lo que hace cada botón: en un hilo aparte (no se llama a `parar` dentro de un manejador de GTK, que a su vez pide el hilo
/// principal para quitar el punto).
fn aparte(app: &AppHandle, f: impl FnOnce(&AppHandle) + Send + 'static) {
    let h = app.clone();
    let _ = std::thread::Builder::new().name("starseed-control-punto".into()).spawn(move || f(&h));
}

fn css_de(color_hex: &str) -> String {
    let (r, g, b) = p::color_rgb(color_hex);
    let c = format!("rgb({},{},{})", (r * 255.0).round() as u8, (g * 255.0).round() as u8, (b * 255.0).round() as u8);
    format!(
        "#ss-control-punto {{ background-color: transparent; }}\n\
#ss-control-punto-boton {{ background-image: none; background-color: {c}; border: 2px solid #ffffff; border-radius: 50%; padding: 0; min-width: 10px; min-height: 10px; }}\n\
#ss-control-panel {{ background-color: rgba(24,24,32,0.96); border: 2px solid {c}; border-radius: 12px; }}\n\
#ss-control-panel, #ss-control-panel * {{ color: #ffffff; }}\n\
#ss-control-panel label {{ color: #ffffff; }}\n\
#ss-control-nombre {{ color: #ffffff; font-weight: 700; font-size: 14px; }}\n\
#ss-control-estado {{ font-size: 12px; color: #d4d4e0; }}\n\
#ss-control-panel button {{ color: #ffffff; background-image: none; background-color: #3a3a4a; border: 1px solid #ffffff; border-radius: 6px; padding: 3px 10px; }}\n\
#ss-control-panel button:hover {{ background-color: #55556a; }}\n"
    )
}

fn ventana(nombre_widget: &str) -> gtk::Window {
    let w = gtk::Window::new(gtk::WindowType::Toplevel);
    w.set_widget_name(nombre_widget);
    w.set_title("StarSeed OS · control desde otra neurona");
    w.set_decorated(false);
    w.set_resizable(false);
    w.set_keep_above(true);
    w.set_skip_taskbar_hint(true);
    w.set_skip_pager_hint(true);
    w.set_accept_focus(false); // no le quita el foco a la ventana que se controla
    w.set_focus_on_map(false);
    w.set_type_hint(gtk::gdk::WindowTypeHint::Dock);
    w.stick();
    w.set_app_paintable(true);
    if let Some(pantalla) = gtk::gdk::Screen::default() {
        // Un visual con transparencia (si hay compositor) para que el punto sea redondo de verdad.
        if let Some(visual) = pantalla.rgba_visual().or_else(|| pantalla.system_visual()) {
            w.set_visual(Some(&visual));
        }
    }
    w
}

/// El área útil de la pantalla principal (sin el panel del escritorio), con la `y` hacia abajo.
fn area_util() -> p::Rect {
    gtk::gdk::Display::default()
        .and_then(|d| d.primary_monitor().or_else(|| d.monitor(0)))
        .map(|m| {
            let r = m.workarea();
            p::Rect { x: f64::from(r.x()), y: f64::from(r.y()), w: f64::from(r.width()), h: f64::from(r.height()) }
        })
        .unwrap_or(p::Rect { x: 0.0, y: 0.0, w: 1280.0, h: 800.0 })
}

fn titulo_quitar() {
    let t = confirmacion().texto_boton(cn::mono_k());
    PIEZA.with(|z| {
        if let Some(pz) = z.borrow().as_ref() {
            pz.quitar.set_label(t);
        }
    });
}

fn plegar_panel() {
    PIEZA.with(|z| {
        if let Some(pz) = z.borrow().as_ref() {
            pz.panel.hide();
        }
    });
    confirmacion().deshacer();
    titulo_quitar();
}

fn alternar_panel(app: &AppHandle) {
    let abrir = PIEZA.with(|z| z.borrow().as_ref().is_some_and(|pz| !pz.panel.is_visible()));
    let g = GENERACION.fetch_add(1, Ordering::SeqCst) + 1;
    if !abrir {
        plegar_panel();
        return;
    }
    PIEZA.with(|z| {
        if let Some(pz) = z.borrow().as_ref() {
            pz.panel.show_all();
            if pz.estado.text().as_str() != p::texto_estado(&pz.nivel, true) {
                pz.reanudar.hide();
            }
            let area = area_util();
            let punto = p::punto_en_esquina(area, p::Eje::YHaciaAbajo);
            let alto = f64::from(pz.panel.preferred_size().1.height).max(150.0);
            let r = p::panel_junto_al_punto(punto, area, p::Eje::YHaciaAbajo, alto);
            pz.panel.move_(r.x as i32, r.y as i32);
            pz.panel.present();
        }
    });
    confirmacion().deshacer();
    titulo_quitar();
    // Se pliega solo a los 5 s si nadie lo ha vuelto a tocar.
    let h = app.clone();
    aparte(app, move |_| {
        std::thread::sleep(Duration::from_millis(p::PLEGAR_MS));
        if GENERACION.load(Ordering::SeqCst) == g {
            let _ = en_principal(&h, plegar_panel);
        }
    });
}

fn crear(app: &AppHandle, nombre: &str, color_hex: &str, nivel: &str) -> Option<Pieza> {
    let css = gtk::CssProvider::new();
    css.load_from_data(css_de(color_hex).as_bytes()).ok()?;
    if let Some(pantalla) = gtk::gdk::Screen::default() {
        // Los selectores van por nombre (`#ss-control-…`): prioridad de usuario para ganar a Adwaita claro.
        gtk::StyleContext::add_provider_for_screen(&pantalla, &css, gtk::STYLE_PROVIDER_PRIORITY_USER);
    }
    // El punto.
    let punto = ventana("ss-control-punto");
    let boton = gtk::Button::new();
    boton.set_widget_name("ss-control-punto-boton");
    boton.set_focus_on_click(false);
    boton.set_size_request(p::PUNTO as i32, p::PUNTO as i32);
    punto.add(&boton);
    punto.set_default_size(p::PUNTO as i32, p::PUNTO as i32);
    {
        let a = app.clone();
        boton.connect_clicked(move |_| alternar_panel(&a));
    }
    punto.connect_map(|_| VISIBLE.store(true, Ordering::SeqCst));
    punto.connect_unmap(|_| VISIBLE.store(false, Ordering::SeqCst));
    punto.connect_destroy(|_| VISIBLE.store(false, Ordering::SeqCst));
    // El panel.
    let panel = ventana("ss-control-panel");
    let caja = gtk::Box::new(gtk::Orientation::Vertical, 6);
    caja.set_border_width(12);
    let n = gtk::Label::new(Some(&format!("Controlada por: {nombre}")));
    n.set_widget_name("ss-control-nombre");
    n.set_xalign(0.0);
    n.set_line_wrap(true);
    n.set_line_wrap_mode(gtk::pango::WrapMode::WordChar);
    n.set_ellipsize(gtk::pango::EllipsizeMode::None);
    n.set_max_width_chars(28);
    n.set_width_chars(24);
    let estado = gtk::Label::new(Some(&p::texto_estado(nivel, false)));
    estado.set_widget_name("ss-control-estado");
    estado.set_xalign(0.0);
    let reanudar = gtk::Button::with_label("Reanudar");
    let terminar = gtk::Button::with_label("Terminar (el permiso sigue)");
    let quitar = gtk::Button::with_label(p::TEXTO_QUITAR);
    for b in [&reanudar, &terminar, &quitar] {
        b.set_focus_on_click(false);
    }
    caja.pack_start(&n, false, false, 0);
    caja.pack_start(&estado, false, false, 0);
    caja.pack_start(&reanudar, false, false, 0);
    caja.pack_start(&terminar, false, false, 0);
    caja.pack_start(&quitar, false, false, 0);
    panel.add(&caja);
    panel.set_size_request(p::PANEL_ANCHO as i32, -1);
    {
        let a = app.clone();
        reanudar.connect_clicked(move |_| aparte(&a, |h| cn::reanudar(h, "la-persona-desde-el-indicador")));
        let a = app.clone();
        terminar.connect_clicked(move |_| aparte(&a, |h| cn::parar(h, "la-persona-desde-el-indicador")));
        let a = app.clone();
        quitar.connect_clicked(move |_| {
            if confirmacion().pulsar(cn::mono_k()) {
                aparte(&a, |h| cn::apagar_interruptor(h, "la-persona-quito-el-permiso"));
            } else {
                titulo_quitar();
                let h = a.clone();
                aparte(&a, move |_| {
                    std::thread::sleep(Duration::from_millis(p::CONFIRMAR_MS + 100));
                    let _ = en_principal(&h, || {
                        if !confirmacion().armada(cn::mono_k()) {
                            titulo_quitar();
                        }
                    });
                });
            }
        });
    }
    confirmacion().deshacer();
    // Arriba a la derecha del área útil.
    let r = p::punto_en_esquina(area_util(), p::Eje::YHaciaAbajo);
    punto.move_(r.x as i32, r.y as i32);
    punto.show_all();
    punto.present();
    let a_la_vista = punto.is_mapped() && punto.is_visible();
    VISIBLE.store(a_la_vista, Ordering::SeqCst);
    if a_la_vista {
        Some(Pieza { punto, panel, nombre: n, estado, reanudar, quitar, nivel: nivel.to_string(), css })
    } else {
        punto.close();
        panel.close();
        None
    }
}

/// Pone el punto. `true` si quedó a la vista. `_indicador` se ignora a propósito: sin bandeja no hay otro aviso (ver arriba).
pub fn poner(app: &AppHandle, nombre: &str, color_hex: &str, nivel: &str, _indicador: &str) -> bool {
    let (nombre, color_hex, nivel) = (nombre.to_string(), color_hex.to_string(), nivel.to_string());
    let a = app.clone();
    en_principal(app, move || {
        quitar_en_principal();
        let nueva = crear(&a, &nombre, &color_hex, &nivel);
        let ok = nueva.is_some();
        PIEZA.with(|z| *z.borrow_mut() = nueva);
        ok
    })
    .unwrap_or(false)
}

fn quitar_en_principal() {
    PIEZA.with(|z| {
        if let Some(pz) = z.borrow_mut().take() {
            if let Some(pantalla) = gtk::gdk::Screen::default() {
                gtk::StyleContext::remove_provider_for_screen(&pantalla, &pz.css);
            }
            pz.panel.close();
            pz.punto.close();
        }
    });
    GENERACION.fetch_add(1, Ordering::SeqCst);
}

pub fn quitar(app: &AppHandle) {
    VISIBLE.store(false, Ordering::SeqCst);
    let _ = en_principal(app, quitar_en_principal);
}

/// Actualiza el texto visible con el/los controladores activos en el panel del punto.
pub fn actualizar_nombre(app: &AppHandle, nombre: &str) {
    let texto = format!("Controlada por: {nombre}");
    let _ = en_principal(app, move || {
        PIEZA.with(|z| {
            if let Some(pz) = z.borrow().as_ref() {
                pz.nombre.set_text(&texto);
            }
        });
    });
}

/// El texto del panel y el botón «Reanudar» siguen a la pausa local.
pub fn marcar_pausa(app: &AppHandle, pausada: bool, _nombre: String) {
    let _ = en_principal(app, move || {
        PIEZA.with(|z| {
            if let Some(pz) = z.borrow().as_ref() {
                pz.estado.set_text(&p::texto_estado(&pz.nivel, pausada));
                pz.punto.set_opacity(if pausada { 0.45 } else { 1.0 });
                if pausada && pz.panel.is_visible() {
                    pz.reanudar.show();
                } else if !pausada {
                    pz.reanudar.hide();
                }
            }
        })
    });
}
