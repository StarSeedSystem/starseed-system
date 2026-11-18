//! (CTL1118L) Control entre mis neuronas · el indicador de un Linux (X11) como aparato controlado (contrato
//! architecture/control-remoto-entre-neuronas.md §2.4: sin indicador a la vista no hay control).
//!
//! Hasta ahora Linux no tenía ninguno (`sin-indicador-nativo`). Aquí es una FRANJA roja de GTK (la misma biblioteca que ya trae
//! la ventana de la app: no añade ningún paquete del sistema), sin marco, siempre encima, en todos los escritorios y sin
//! quitar el foco a la ventana que se controla, arriba y centrada, con:
//!   · «● Controlada por <nombre>» (el nombre sale de lo NATIVO: el de la lista que la persona aceptó);
//!   · «Reanudar» (solo mientras hay pausa local), «Terminar» y «Terminar y quitar el permiso».
//! Los tres botones los atiende Rust (en un hilo aparte, no en el de GTK): aunque la página esté colgada o comprometida,
//! terminar funciona. Si la ventana se cierra o se desmapea por cualquier motivo, `indicador_visible()` pasa a falso y el
//! vigía de `control_neuronas` cierra la sesión con `sin-indicador`.
//!
//! No hay bandeja del sistema ni atajo global: en Xfce la bandeja depende de un plugin que puede no estar y un atajo global en X11
//! exige acaparar teclas del teclado. La franja basta para cumplir §2.4 y se dice así en el diálogo de aceptar.

use crate::control_neuronas as cn;
use gtk::prelude::*;
use std::cell::RefCell;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::AppHandle;

static VISIBLE: AtomicBool = AtomicBool::new(false);

struct Franja {
    ventana: gtk::Window,
    etiqueta: gtk::Label,
    reanudar: gtk::Button,
}

thread_local! {
    /// Solo se toca en el hilo principal de GTK.
    static FRANJA: RefCell<Option<Franja>> = const { RefCell::new(None) };
}

const CSS: &[u8] = b"#ss-control-franja { background-color: #b3141b; }\n\
#ss-control-franja label { color: #ffffff; font-weight: bold; padding: 4px 10px; }\n\
#ss-control-franja button { color: #ffffff; background-image: none; background-color: #7f0d12; border: 1px solid #ffffff; border-radius: 4px; padding: 2px 10px; margin: 2px 4px; }\n\
#ss-control-franja button:hover { background-color: #5c090d; }\n";

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
/// principal para quitar la franja).
fn aparte(app: &AppHandle, f: impl FnOnce(&AppHandle) + Send + 'static) {
    let h = app.clone();
    let _ = std::thread::Builder::new().name("starseed-control-franja".into()).spawn(move || f(&h));
}

fn texto_franja(nombre: &str, pausada: bool) -> String {
    if pausada {
        "‖ Control en pausa: tocaste el teclado o el ratón · pulsa «Reanudar» para seguir".to_string()
    } else {
        format!("● Controlada por {nombre} · tocar el teclado o el ratón pausa")
    }
}

fn crear(app: &AppHandle, nombre: &str) -> Option<Franja> {
    let w = gtk::Window::new(gtk::WindowType::Toplevel);
    w.set_widget_name("ss-control-franja");
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
    if let Some(pantalla) = gtk::gdk::Screen::default() {
        if let Some(visual) = pantalla.system_visual() {
            w.set_visual(Some(&visual));
        }
        let css = gtk::CssProvider::new();
        if css.load_from_data(CSS).is_ok() {
            // Los selectores van por nombre (`#ss-control-franja …`): no tocan ninguna otra ventana de la app.
            gtk::StyleContext::add_provider_for_screen(&pantalla, &css, gtk::STYLE_PROVIDER_PRIORITY_APPLICATION);
        }
    }
    let caja = gtk::Box::new(gtk::Orientation::Horizontal, 6);
    let etiqueta = gtk::Label::new(Some(&texto_franja(nombre, false)));
    caja.pack_start(&etiqueta, true, true, 0);
    let reanudar = gtk::Button::with_label("Reanudar");
    let terminar = gtk::Button::with_label("Terminar");
    let quitar = gtk::Button::with_label("Terminar y quitar el permiso");
    caja.pack_start(&reanudar, false, false, 0);
    caja.pack_start(&terminar, false, false, 0);
    caja.pack_start(&quitar, false, false, 0);
    w.add(&caja);
    {
        let a = app.clone();
        reanudar.connect_clicked(move |_| aparte(&a, |h| cn::reanudar(h, "la-persona-desde-el-indicador")));
        let a = app.clone();
        terminar.connect_clicked(move |_| aparte(&a, |h| cn::parar(h, "la-persona-desde-el-indicador")));
        let a = app.clone();
        quitar.connect_clicked(move |_| aparte(&a, |h| cn::apagar_interruptor(h, "la-persona-quito-el-permiso")));
    }
    w.connect_map(|_| VISIBLE.store(true, Ordering::SeqCst));
    w.connect_unmap(|_| VISIBLE.store(false, Ordering::SeqCst));
    w.connect_destroy(|_| VISIBLE.store(false, Ordering::SeqCst));
    w.show_all();
    reanudar.hide(); // solo se enseña con la pausa
    // Arriba y centrada en la pantalla principal.
    let ancho_pantalla = gtk::gdk::Display::default()
        .and_then(|d| d.primary_monitor().or_else(|| d.monitor(0)))
        .map(|m| m.geometry().width())
        .unwrap_or(0);
    let ancho = w.preferred_size().1.width;
    w.move_(((ancho_pantalla - ancho) / 2).max(0), 0);
    w.present();
    let a_la_vista = w.is_mapped() && w.is_visible();
    VISIBLE.store(a_la_vista, Ordering::SeqCst);
    if a_la_vista {
        Some(Franja { ventana: w, etiqueta, reanudar })
    } else {
        w.close();
        None
    }
}

/// Pone la franja. `true` si quedó a la vista.
pub fn poner(app: &AppHandle, nombre: &str) -> bool {
    let nombre = nombre.to_string();
    let a = app.clone();
    en_principal(app, move || {
        FRANJA.with(|f| {
            if let Some(vieja) = f.borrow_mut().take() {
                vieja.ventana.close();
            }
            let nueva = crear(&a, &nombre);
            let ok = nueva.is_some();
            *f.borrow_mut() = nueva;
            ok
        })
    })
    .unwrap_or(false)
}

pub fn quitar(app: &AppHandle) {
    VISIBLE.store(false, Ordering::SeqCst);
    let _ = en_principal(app, || {
        FRANJA.with(|f| {
            if let Some(v) = f.borrow_mut().take() {
                v.ventana.close();
            }
        })
    });
}

/// El texto de la franja y el botón «Reanudar» siguen a la pausa local.
pub fn marcar_pausa(app: &AppHandle, pausada: bool, nombre: String) {
    let _ = en_principal(app, move || {
        FRANJA.with(|f| {
            if let Some(v) = f.borrow().as_ref() {
                v.etiqueta.set_text(&texto_franja(&nombre, pausada));
                if pausada {
                    v.reanudar.show();
                } else {
                    v.reanudar.hide();
                }
            }
        })
    });
}
