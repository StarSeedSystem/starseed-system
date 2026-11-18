//! (CTL1118H) Control entre mis neuronas · el PUNTO de color de un aparato de escritorio controlado: la parte pura.
//!
//! Alex (18-11, literal): «falta cambiar el marco de controlado por otra neurona a el punto en la esquina del color». En Android el
//! indicador ya es un punto de 12 dp del color de quien controla, siempre encima, que al pulsarlo abre un panel pequeño. macOS tenía un
//! MARCO rojo alrededor de la pantalla y Linux una franja roja; los dos pasan a lo mismo que Android:
//!   · un punto del color del controlador en la esquina de arriba a la derecha (con borde blanco, como el de Android), siempre encima y
//!     sin quitar el foco a lo que la persona esté usando;
//!   · al pulsarlo, un panel con el nombre ENTERO de quien controla (hasta dos líneas), el estado, «Terminar» y «Quitar permiso»
//!     (este con confirmación: la primera pulsación pide otra, y a los 5 s se deshace); «Reanudar» solo mientras hay pausa local;
//!   · `indicador=oculto` (ajuste local ya existente): sin punto, pero SOLO si queda otro aviso a la vista (macOS: el icono de la barra de
//!     menús). Sin otro aviso (Linux no tiene bandeja) el punto se pone igual: sin indicador a la vista no hay control (contrato §2.4).
//!
//! No existe un ajuste de esquina en `control_ajustes.rs` (solo `indicador`, `ver_toques` y `alcance`); la esquina es la de Android
//! (arriba a la derecha). Sin Tauri, sin AppKit ni GTK: los números y los textos se prueban en cualquier plataforma.

#![allow(dead_code)] // cada plataforma usa una parte (macOS: oculto y YHaciaArriba; Linux: YHaciaAbajo)

/// Lado del punto, en puntos/píxeles de pantalla.
pub const PUNTO: f64 = 14.0;
/// Separación del punto al borde del área útil.
pub const MARGEN: f64 = 10.0;
/// Ancho del panel.
pub const PANEL_ANCHO: f64 = 264.0;
/// Separación entre el punto y el panel.
pub const HUECO_PANEL: f64 = 6.0;
/// El panel se pliega solo a los 5 s (igual que el de Android).
pub const PLEGAR_MS: u64 = 5_000;
/// «Quitar permiso» pide una segunda pulsación durante 5 s.
pub const CONFIRMAR_MS: u64 = 5_000;
/// Color si el controlador no manda uno válido (el mismo por defecto de `control_ajustes::color_por_defecto("tableta")`).
pub const COLOR_DEFECTO: &str = "#ddc23c";

pub const TEXTO_QUITAR: &str = "Quitar permiso";
pub const TEXTO_QUITAR_SEGURO: &str = "¿Seguro? Pulsa otra vez";

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

/// Hacia dónde crece la `y` de la pantalla: AppKit (origen abajo a la izquierda) o GTK/X11 (origen arriba a la izquierda).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Eje {
    YHaciaArriba,
    YHaciaAbajo,
}

/// El punto, arriba a la derecha del área útil (la que deja libre la barra de menús o el panel del escritorio).
pub fn punto_en_esquina(area: Rect, eje: Eje) -> Rect {
    let x = area.x + area.w - MARGEN - PUNTO;
    let y = match eje {
        Eje::YHaciaArriba => area.y + area.h - MARGEN - PUNTO,
        Eje::YHaciaAbajo => area.y + MARGEN,
    };
    Rect { x, y, w: PUNTO, h: PUNTO }
}

/// El panel, pegado al punto (su borde derecho con el del punto) por debajo, y sin salirse del área útil.
pub fn panel_junto_al_punto(punto: Rect, area: Rect, eje: Eje, alto: f64) -> Rect {
    let w = PANEL_ANCHO.min(area.w);
    let alto = alto.min(area.h);
    let x = (punto.x + punto.w - w).clamp(area.x, (area.x + area.w - w).max(area.x));
    let y = match eje {
        Eje::YHaciaArriba => punto.y - HUECO_PANEL - alto,
        Eje::YHaciaAbajo => punto.y + punto.h + HUECO_PANEL,
    };
    let (min_y, max_y) = match eje {
        Eje::YHaciaArriba => (area.y, (area.y + area.h - alto).max(area.y)),
        Eje::YHaciaAbajo => (area.y, (area.y + area.h - alto).max(area.y)),
    };
    Rect { x, y: y.clamp(min_y, max_y), w, h: alto }
}

/// `#rrggbb` → componentes 0..1. Lo que no es un color válido usa el de por defecto (nunca falla).
pub fn color_rgb(hex: &str) -> (f64, f64, f64) {
    let h = if crate::control_ajustes::color_valido(hex) { hex } else { COLOR_DEFECTO };
    let c = |i: usize| f64::from(u8::from_str_radix(&h[i..i + 2], 16).unwrap_or(0)) / 255.0;
    (c(1), c(3), c(5))
}

/// ¿Se dibuja el punto? Con `indicador=oculto` solo si NO queda otro aviso a la vista (§2.4: sin indicador visible no hay control).
pub fn dibujar_punto(indicador: &str, hay_otro_aviso: bool) -> bool {
    indicador != "oculto" || !hay_otro_aviso
}

/// ¿El indicador está completo? `otro_aviso_visible` = el icono de la barra (macOS); `punto_a_la_vista` = el punto dibujado se ve.
/// Con el punto dibujado hace falta que se vea; sin punto (oculto) basta el otro aviso.
pub fn indicador_completo(punto_dibujado: bool, punto_a_la_vista: bool, otro_aviso_visible: bool, hay_otro_aviso: bool) -> bool {
    (if punto_dibujado { punto_a_la_vista } else { true }) && (!hay_otro_aviso || otro_aviso_visible)
}

/// La línea de estado del panel. Sin dar por hecho qué aparato es el de quien controla ni este.
pub fn texto_estado(nivel: &str, pausada: bool) -> String {
    if pausada {
        "En pausa: están usando esta neurona".to_string()
    } else if nivel == "controlar" {
        "Controla esta neurona".to_string()
    } else {
        "Ve esta neurona".to_string()
    }
}

/// El texto de ayuda del panel (una frase): lo que pasa al tocar y lo que hace cada botón.
pub fn texto_ayuda() -> &'static str {
    "Tocar el teclado o el ratón pausa el control. «Terminar» corta la sesión y el permiso sigue; «Quitar permiso» la corta y lo apaga."
}

/// «Quitar permiso» pide una segunda pulsación: la primera arma, la segunda (dentro de `CONFIRMAR_MS`) ejecuta.
#[derive(Debug, Default, Clone, Copy)]
pub struct Confirmacion {
    armada_ms: Option<u64>,
}

impl Confirmacion {
    /// Sin pulsar (constante: la usa un `static`).
    pub const fn nueva() -> Self {
        Confirmacion { armada_ms: None }
    }

    /// Una pulsación a la hora `ahora`. `true` = ejecutar (era la segunda dentro del plazo); `false` = quedó armada.
    pub fn pulsar(&mut self, ahora: u64) -> bool {
        match self.armada_ms {
            Some(t) if ahora.saturating_sub(t) <= CONFIRMAR_MS => {
                self.armada_ms = None;
                true
            }
            _ => {
                self.armada_ms = Some(ahora);
                false
            }
        }
    }

    pub fn armada(&self, ahora: u64) -> bool {
        self.armada_ms.is_some_and(|t| ahora.saturating_sub(t) <= CONFIRMAR_MS)
    }

    /// Desarma (el panel se pliega, se pulsa otro botón o pasa el plazo).
    pub fn deshacer(&mut self) {
        self.armada_ms = None;
    }

    pub fn texto_boton(&self, ahora: u64) -> &'static str {
        if self.armada(ahora) {
            TEXTO_QUITAR_SEGURO
        } else {
            TEXTO_QUITAR
        }
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    const AREA: Rect = Rect { x: 0.0, y: 0.0, w: 1440.0, h: 875.0 };

    #[test]
    fn control_punto_va_arriba_a_la_derecha_en_los_dos_ejes() {
        let p = punto_en_esquina(AREA, Eje::YHaciaArriba);
        assert_eq!((p.x, p.y, p.w, p.h), (1440.0 - 10.0 - 14.0, 875.0 - 10.0 - 14.0, 14.0, 14.0), "AppKit: la y de arriba es la mayor");
        let g = punto_en_esquina(AREA, Eje::YHaciaAbajo);
        assert_eq!((g.x, g.y), (1416.0, 10.0), "GTK: la y de arriba es 0");
        // Un área útil que no empieza en el origen (barra de menús, segundo monitor).
        let v = Rect { x: 1440.0, y: 40.0, w: 1920.0, h: 1000.0 };
        let p = punto_en_esquina(v, Eje::YHaciaArriba);
        assert_eq!((p.x, p.y), (1440.0 + 1920.0 - 24.0, 40.0 + 1000.0 - 24.0));
    }

    #[test]
    fn control_panel_se_pega_al_punto_sin_salirse_del_area() {
        let p = punto_en_esquina(AREA, Eje::YHaciaArriba);
        let r = panel_junto_al_punto(p, AREA, Eje::YHaciaArriba, 200.0);
        assert_eq!(r.w, PANEL_ANCHO);
        assert_eq!(r.x + r.w, p.x + p.w, "borde derecho con el del punto");
        assert_eq!(r.y + r.h + HUECO_PANEL, p.y, "justo por debajo del punto");
        let g = punto_en_esquina(AREA, Eje::YHaciaAbajo);
        let r = panel_junto_al_punto(g, AREA, Eje::YHaciaAbajo, 200.0);
        assert_eq!(r.y, g.y + g.h + HUECO_PANEL);
        // Un área pequeña recorta ancho y alto y no se sale.
        let chica = Rect { x: 100.0, y: 50.0, w: 200.0, h: 120.0 };
        let p = punto_en_esquina(chica, Eje::YHaciaArriba);
        let r = panel_junto_al_punto(p, chica, Eje::YHaciaArriba, 400.0);
        assert!(r.x >= chica.x && r.x + r.w <= chica.x + chica.w && r.y >= chica.y && r.y + r.h <= chica.y + chica.h, "{r:?}");
    }

    #[test]
    fn control_color_del_punto_es_el_del_controlador_o_el_de_por_defecto() {
        let (r, g, b) = color_rgb("#ff0000");
        assert_eq!((r, g, b), (1.0, 0.0, 0.0));
        let (r, g, b) = color_rgb("#8add3c");
        assert!((r - 138.0 / 255.0).abs() < 1e-9 && (g - 221.0 / 255.0).abs() < 1e-9 && (b - 60.0 / 255.0).abs() < 1e-9);
        let por_defecto = color_rgb(COLOR_DEFECTO);
        for malo in ["", "rojo", "#FF0000", "#12345", "#12345g", "rgb(1,2,3)", "<b>"] {
            assert_eq!(color_rgb(malo), por_defecto, "{malo}");
        }
        assert!(crate::control_ajustes::color_valido(COLOR_DEFECTO));
    }

    #[test]
    fn control_oculto_solo_quita_el_punto_si_queda_otro_aviso() {
        assert!(dibujar_punto("punto", true) && dibujar_punto("punto", false));
        assert!(!dibujar_punto("oculto", true), "macOS: queda el icono de la barra");
        assert!(dibujar_punto("oculto", false), "Linux no tiene bandeja: sin punto no habría indicador");
        assert!(dibujar_punto("cualquier-cosa", true), "solo «oculto» lo quita");
    }

    #[test]
    fn control_indicador_completo_pide_todo_lo_que_se_dibujo() {
        // macOS con punto: icono de la barra Y punto a la vista.
        assert!(indicador_completo(true, true, true, true));
        assert!(!indicador_completo(true, false, true, true), "punto dibujado pero no visible");
        assert!(!indicador_completo(true, true, false, true), "sin el icono de la barra");
        // macOS oculto: basta el icono.
        assert!(indicador_completo(false, false, true, true));
        assert!(!indicador_completo(false, false, false, true));
        // Linux (sin otro aviso): solo el punto.
        assert!(indicador_completo(true, true, false, false));
        assert!(!indicador_completo(true, false, false, false));
    }

    #[test]
    fn control_estado_del_panel_no_da_por_hecho_que_aparato_es() {
        assert_eq!(texto_estado("controlar", false), "Controla esta neurona");
        assert_eq!(texto_estado("ver", false), "Ve esta neurona");
        assert_eq!(texto_estado("ver", true), "En pausa: están usando esta neurona");
        for t in [texto_estado("controlar", false), texto_estado("ver", true), texto_ayuda().to_string()] {
            let m = t.to_lowercase();
            assert!(!m.contains("tableta") && !m.contains("tablet") && !m.contains("mac") && !m.contains("móvil"), "{t}");
        }
    }

    #[test]
    fn control_quitar_permiso_pide_una_segunda_pulsacion_y_se_deshace() {
        let mut c = Confirmacion::default();
        assert_eq!(c.texto_boton(0), TEXTO_QUITAR);
        assert!(!c.pulsar(1_000), "la primera solo arma");
        assert!(c.armada(1_001));
        assert_eq!(c.texto_boton(1_001), TEXTO_QUITAR_SEGURO);
        assert!(c.pulsar(1_000 + CONFIRMAR_MS), "la segunda, dentro del plazo, ejecuta");
        assert!(!c.armada(2_000), "tras ejecutar vuelve a pedir confirmación");
        // Pasado el plazo, la segunda pulsación vuelve a ser la primera.
        assert!(!c.pulsar(10_000));
        assert!(!c.pulsar(10_000 + CONFIRMAR_MS + 1));
        assert!(c.armada(10_000 + CONFIRMAR_MS + 2));
        assert!(!c.armada(10_000 + CONFIRMAR_MS + 1 + CONFIRMAR_MS + 1), "vencida");
        // Plegar el panel o pulsar otra cosa la deshace.
        let mut c = Confirmacion::default();
        c.pulsar(5_000);
        c.deshacer();
        assert!(!c.armada(5_001));
        assert!(!c.pulsar(5_002), "tras deshacer, otra vez hace falta confirmar");
    }
}
