//! (SEG1111T) Lógica pura de la sesión de «prestar una ventana»: sin Tauri, sin xcap, sin reloj real.
//!
//! Hasta SEG1111T `ventanas_prestables`, `capturar_ventana` y `entrada_ventana` respondían a cualquier
//! página de los orígenes remotos permitidos sin comprobar nada en Rust. Ahora solo responden a una
//! sesión de préstamo que vive AQUÍ, en el proceso nativo, y que solo nace con el «Prestar» de un
//! diálogo nativo en el aparato. Nada de lo que diga la web puede ampliarla: la web recibe un token
//! opaco y la lista de ventanas que la persona vio en el diálogo; el resto lo decide este módulo.
//!
//! Contrato: architecture/permisos-y-control-del-dispositivo.md §4.7.

/// Sin una captura ni una entrada durante este tiempo, la sesión termina. Mientras la otra neurona
/// mira, la web pide fotogramas varias veces por segundo: dos minutos sin ninguno quieren decir que
/// nadie está mirando, y una sesión abierta sin nadie es solo superficie de ataque.
pub const INACTIVIDAD_MS: u64 = 2 * 60_000;
/// Ninguna sesión dura más de una hora aunque se use sin parar: para seguir, la persona vuelve a
/// confirmar en el aparato. Así un préstamo olvidado no queda abierto toda la tarde.
pub const DURACION_MAX_MS: u64 = 60 * 60_000;
/// Tras un «No prestar» (o cerrar el diálogo), 30 s sin volver a preguntar: una página que insiste no
/// puede convertir el diálogo en un muro de ventanas hasta arrancar un «sí» por cansancio.
pub const ESPERA_TRAS_NO_MS: u64 = 30_000;
/// Si el reloj de pared avanza más que el monótono por encima de esto entre dos vueltas del vigilante,
/// el aparato estuvo dormido (en macOS el reloj monótono no corre durante el reposo): la sesión termina.
pub const SALTO_SUENO_MS: i64 = 15_000;
/// Como mucho estas ventanas por sesión (el diálogo tiene que poder leerse entero).
pub const MAX_VENTANAS: usize = 8;
/// Como mucho estos caracteres por orden de texto.
pub const MAX_TEXTO: usize = 512;
/// Largo máximo del nombre de la neurona destino que se enseña en el diálogo.
pub const MAX_DESTINO: usize = 60;

/// Orígenes desde los que se puede pedir y usar un préstamo: la web publicada de StarSeed OS y el
/// servidor local de la app (127.0.0.1:47610…47619, `servidor_local_logica::PUERTOS`). Las webs
/// hermanas (Nexus, Café) no prestan ventanas.
pub const WEB_PUBLICADA: &str = "https://starseed-os.vercel.app";
pub const PUERTO_LOCAL_MIN: u16 = 47610;
pub const PUERTO_LOCAL_MAX: u16 = 47619;

/// Por qué se rechaza una orden. El código (`prestamo:…`) va al principio del error que ve la web,
/// para que `src/lib/apps-remotas/nativo.ts` sepa parar en vez de reintentar.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Rechazo {
    /// No hay ninguna sesión de préstamo abierta en este aparato.
    SinSesion,
    /// El token no es el de la sesión abierta.
    Token,
    /// La orden llega desde un origen distinto del que abrió la sesión.
    Origen,
    /// Ese origen no puede pedir préstamos (webs hermanas, cualquier otra página).
    OrigenNoPermitido,
    /// La ventana no es una de las que la persona prestó.
    VentanaAjena,
    /// La sesión de ese token terminó sola (inactividad, tiempo máximo, reposo, bloqueo, ventana cerrada).
    Caducada(Fin),
    /// La sesión de ese token la paró la persona (o la web).
    Parada,
    /// Ya hay un diálogo de confirmación abierto.
    Pendiente,
    /// La persona dijo que no hace poco; faltan estos ms para poder volver a preguntar.
    Espera(u64),
    /// Lo pedido no deja ninguna ventana que prestar.
    SinVentanas,
}

impl Rechazo {
    pub fn codigo(&self) -> &'static str {
        match self {
            Rechazo::SinSesion => "prestamo:sin-sesion",
            Rechazo::Token => "prestamo:token",
            Rechazo::Origen => "prestamo:origen",
            Rechazo::OrigenNoPermitido => "prestamo:origen-no-permitido",
            Rechazo::VentanaAjena => "prestamo:ventana-ajena",
            Rechazo::Caducada(_) => "prestamo:caducada",
            Rechazo::Parada => "prestamo:parada",
            Rechazo::Pendiente => "prestamo:pendiente",
            Rechazo::Espera(_) => "prestamo:espera",
            Rechazo::SinVentanas => "prestamo:sin-ventanas",
        }
    }

    /// Texto del error para la web: «prestamo:<código> · explicación».
    pub fn mensaje(&self) -> String {
        let explicacion = match self {
            Rechazo::SinSesion => "no hay ninguna ventana prestada en este aparato".to_string(),
            Rechazo::Token => "esta sesión de préstamo no es la abierta".to_string(),
            Rechazo::Origen => "la sesión se abrió desde otra página".to_string(),
            Rechazo::OrigenNoPermitido => "esta página no puede pedir prestar ventanas".to_string(),
            Rechazo::VentanaAjena => "esa ventana no está prestada".to_string(),
            Rechazo::Caducada(f) => format!("la sesión terminó: {}", f.texto()),
            Rechazo::Parada => "la persona dejó de prestar la ventana".to_string(),
            Rechazo::Pendiente => "ya hay una confirmación abierta en el aparato".to_string(),
            Rechazo::Espera(ms) => format!("se dijo que no hace poco; se podrá volver a pedir en {} s", ms.div_ceil(1000)),
            Rechazo::SinVentanas => "no hay ninguna ventana que prestar con lo pedido".to_string(),
        };
        format!("{} · {}", self.codigo(), explicacion)
    }
}

/// Cómo terminó una sesión.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Fin {
    /// «Dejar de prestar» en la barra de menús / bandeja (nativo).
    Persona,
    /// La página pidió parar (`prestamo_ventana_parar`).
    Web,
    /// Se cerraron todas las ventanas prestadas.
    VentanaCerrada,
    Inactividad,
    DuracionMaxima,
    /// Pantalla bloqueada o sesión de usuario fuera de la consola.
    Bloqueo,
    /// El aparato se durmió.
    Sueno,
    /// Se abrió otra sesión (la nueva sustituye a la vieja).
    Sustituida,
    /// El indicador de la barra de menús/bandeja desapareció.
    SinIndicador,
    /// La app se cierra.
    Salida,
}

impl Fin {
    pub fn texto(&self) -> &'static str {
        match self {
            Fin::Persona => "la persona la paró en el aparato",
            Fin::Web => "la página pidió parar",
            Fin::VentanaCerrada => "se cerró la ventana prestada",
            Fin::Inactividad => "dos minutos sin uso",
            Fin::DuracionMaxima => "pasó la hora máxima",
            Fin::Bloqueo => "el aparato se bloqueó",
            Fin::Sueno => "el aparato se durmió",
            Fin::Sustituida => "se abrió otra sesión",
            Fin::SinIndicador => "desapareció el aviso de la barra de menús",
            Fin::Salida => "la app se cerró",
        }
    }

    /// ¿La terminó alguien a propósito (parada) o terminó sola (caducada)?
    pub fn es_parada(&self) -> bool {
        matches!(self, Fin::Persona | Fin::Web)
    }
}

/// Una sesión abierta. Vive solo en memoria: al cerrar la app no queda nada.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Sesion {
    pub token: String,
    pub origen: String,
    pub destino: String,
    pub ventanas: Vec<u32>,
    pub inicio: u64,
    pub ultimo_uso: u64,
}

/// Estado del préstamo del aparato: como mucho una sesión, como mucho una confirmación abierta.
#[derive(Debug, Default)]
pub struct Prestamo {
    sesion: Option<Sesion>,
    pendiente: bool,
    no_hasta: u64,
    /// Token y motivo de la última sesión terminada: para decir «parada» o «caducada» en vez de
    /// «sin sesión» a quien siga usando el token viejo.
    ultima: Option<(String, Fin)>,
}

impl Prestamo {
    pub fn activa(&self) -> Option<&Sesion> {
        self.sesion.as_ref()
    }

    /// Antes de enseñar el diálogo: origen permitido, ningún diálogo abierto y sin «no» reciente.
    /// Si pasa, marca el diálogo como abierto (hay que cerrarlo con `resolver_pedido`).
    pub fn empezar_pedido(&mut self, origen: &str, ahora: u64) -> Result<(), Rechazo> {
        if !origen_puede_prestar(origen) {
            return Err(Rechazo::OrigenNoPermitido);
        }
        if self.pendiente {
            return Err(Rechazo::Pendiente);
        }
        if ahora < self.no_hasta {
            return Err(Rechazo::Espera(self.no_hasta - ahora));
        }
        self.pendiente = true;
        Ok(())
    }

    /// Cierra el diálogo. Con «sí», la sesión nueva sustituye a la que hubiera (devuelve el fin de la
    /// vieja para que se anote); con «no», empieza la espera.
    pub fn resolver_pedido(
        &mut self,
        si: bool,
        token: String,
        origen: &str,
        destino: &str,
        ventanas: Vec<u32>,
        ahora: u64,
    ) -> Result<Option<Fin>, Rechazo> {
        self.pendiente = false;
        if !si {
            self.no_hasta = ahora.saturating_add(ESPERA_TRAS_NO_MS);
            return Err(Rechazo::Espera(ESPERA_TRAS_NO_MS));
        }
        if ventanas.is_empty() {
            return Err(Rechazo::SinVentanas);
        }
        let vieja = self.terminar(Fin::Sustituida).then_some(Fin::Sustituida);
        self.sesion = Some(Sesion {
            token,
            origen: origen.to_string(),
            destino: destino.to_string(),
            ventanas,
            inicio: ahora,
            ultimo_uso: ahora,
        });
        Ok(vieja)
    }

    /// Cancela un diálogo que no llegó a enseñarse (error al listar, sin bandeja…).
    pub fn cancelar_pedido(&mut self) {
        self.pendiente = false;
    }

    /// ¿Puede esta orden tocar `ventana` (o, con `None`, leer la sesión)? Primero se aplican los
    /// vencimientos; si pasa, cuenta como uso.
    pub fn autorizar(&mut self, token: &str, origen: &str, ventana: Option<u32>, ahora: u64) -> Result<&Sesion, Rechazo> {
        if let Some(fin) = self.vigilar(ahora) {
            // Venció justo ahora: se dice qué pasó si el token era el de esa sesión.
            if self.ultima.as_ref().map(|(t, _)| t == token).unwrap_or(false) {
                return Err(Rechazo::Caducada(fin));
            }
        }
        let Some(s) = self.sesion.as_mut() else {
            return Err(match &self.ultima {
                Some((t, f)) if t == token && f.es_parada() => Rechazo::Parada,
                Some((t, f)) if t == token => Rechazo::Caducada(*f),
                _ => Rechazo::SinSesion,
            });
        };
        if !iguales_en_tiempo_constante(&s.token, token) {
            return Err(match &self.ultima {
                Some((t, f)) if t == token && f.es_parada() => Rechazo::Parada,
                Some((t, f)) if t == token => Rechazo::Caducada(*f),
                _ => Rechazo::Token,
            });
        }
        if s.origen != origen {
            return Err(Rechazo::Origen);
        }
        if let Some(v) = ventana {
            if !s.ventanas.contains(&v) {
                return Err(Rechazo::VentanaAjena);
            }
        }
        s.ultimo_uso = ahora;
        Ok(s)
    }

    /// Vencimientos por tiempo. Devuelve el fin si la sesión acaba de terminar.
    pub fn vigilar(&mut self, ahora: u64) -> Option<Fin> {
        let s = self.sesion.as_ref()?;
        let fin = if ahora.saturating_sub(s.inicio) >= DURACION_MAX_MS {
            Fin::DuracionMaxima
        } else if ahora.saturating_sub(s.ultimo_uso) >= INACTIVIDAD_MS {
            Fin::Inactividad
        } else {
            return None;
        };
        self.terminar(fin);
        Some(fin)
    }

    /// Una ventana prestada ya no existe: sale de la sesión; si no queda ninguna, la sesión termina.
    pub fn quitar_ventana(&mut self, id: u32) -> Option<Fin> {
        let s = self.sesion.as_mut()?;
        s.ventanas.retain(|v| *v != id);
        if s.ventanas.is_empty() {
            self.terminar(Fin::VentanaCerrada);
            return Some(Fin::VentanaCerrada);
        }
        None
    }

    /// Termina la sesión abierta (si la hay). Devuelve si había una.
    pub fn terminar(&mut self, fin: Fin) -> bool {
        match self.sesion.take() {
            Some(s) => {
                self.ultima = Some((s.token, fin));
                true
            }
            None => false,
        }
    }
}

/// Compara sin cortar en el primer byte distinto (el token no se adivina midiendo tiempos).
fn iguales_en_tiempo_constante(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// «esquema://host[:puerto]» de una URL («» si no se entiende).
pub fn origen_de(url: &str) -> String {
    let Some((esquema, resto)) = url.split_once("://") else { return String::new() };
    let host = resto.split(['/', '?', '#']).next().unwrap_or("");
    if host.is_empty() || host.contains('@') {
        return String::new();
    }
    format!("{}://{}", esquema.to_ascii_lowercase(), host.to_ascii_lowercase())
}

/// ¿Puede este origen pedir y usar un préstamo?
pub fn origen_puede_prestar(origen: &str) -> bool {
    if origen == WEB_PUBLICADA {
        return true;
    }
    let Some(puerto) = origen.strip_prefix("http://127.0.0.1:") else { return false };
    puerto.parse::<u16>().map(|p| (PUERTO_LOCAL_MIN..=PUERTO_LOCAL_MAX).contains(&p)).unwrap_or(false)
}

/// Nombre del destino tal como se enseña en el diálogo: sin caracteres de control y acotado.
pub fn limpiar_destino(destino: &str) -> String {
    let limpio: String = destino.chars().map(|c| if c.is_control() { ' ' } else { c }).take(MAX_DESTINO).collect();
    let limpio = limpio.trim().to_string();
    if limpio.is_empty() {
        "otra neurona sin nombre".to_string()
    } else {
        limpio
    }
}

/// Texto del diálogo nativo: QUÉ se presta (app y título de cada ventana) y A QUIÉN.
pub fn texto_confirmacion(destino: &str, ventanas: &[(String, String)]) -> String {
    let mut t = format!(
        "La página de StarSeed OS pide prestar a «{}» (nombre que da la página) estas ventanas de este aparato:\n\n",
        limpiar_destino(destino)
    );
    for (app, titulo) in ventanas.iter().take(MAX_VENTANAS) {
        let titulo: String = titulo.chars().map(|c| if c.is_control() { ' ' } else { c }).take(80).collect();
        t.push_str(&format!("• {app} — {}\n", if titulo.trim().is_empty() { "(sin título)" } else { titulo.trim() }));
    }
    t.push_str(
        "\nMientras dure, esa neurona verá estas ventanas y podrá hacer clic y escribir SOLO en ellas. \
         Verás «Prestando» en la barra de menús, desde donde puedes parar en cualquier momento. \
         Termina sola tras 2 minutos sin uso, a la hora, al bloquear o dormir el aparato, al cerrar \
         la ventana o al salir de la app.\n\nSi no lo has pedido tú, pulsa «No prestar».",
    );
    t
}

/// ¿Estuvo dormido el aparato entre dos vueltas del vigilante?
pub fn dormido(salto_pared_ms: i64, salto_monotono_ms: u64) -> bool {
    salto_pared_ms - salto_monotono_ms as i64 > SALTO_SUENO_MS
}

/// Rectángulo de una ventana en coordenadas de pantalla (con su orden: más alto = más arriba).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub ancho: u32,
    pub alto: u32,
}

impl Rect {
    pub fn contiene(&self, px: i32, py: i32) -> bool {
        let (px, py, wx, wy) = (px as i64, py as i64, self.x as i64, self.y as i64);
        px >= wx && py >= wy && px < wx + self.ancho as i64 && py < wy + self.alto as i64
    }
}

/// ¿Hay otra ventana (de cualquier app, también los diálogos del sistema) por ENCIMA de la prestada
/// en ese punto? Entonces el clic caería en ella y se rechaza.
pub fn tapada(px: i32, py: i32, z_prestada: i32, otras: &[(i32, Rect)]) -> bool {
    otras.iter().any(|(z, r)| *z > z_prestada && r.contiene(px, py))
}

/// Texto que se puede escribir: no vacío, acotado.
pub fn texto_valido(t: &str) -> Result<(), String> {
    if t.is_empty() {
        return Err("Escribir necesita un texto no vacío".into());
    }
    if t.chars().count() > MAX_TEXTO {
        return Err(format!("El texto pasa de {MAX_TEXTO} caracteres por orden"));
    }
    Ok(())
}

#[cfg(test)]
mod pruebas {
    use super::*;

    const WEB: &str = "https://starseed-os.vercel.app";

    fn abierta(p: &mut Prestamo, ahora: u64) -> String {
        p.empezar_pedido(WEB, ahora).unwrap();
        p.resolver_pedido(true, "tok-1".into(), WEB, "Maggaboard", vec![7, 9], ahora).unwrap();
        "tok-1".into()
    }

    #[test]
    fn sin_sesion_no_hay_acceso() {
        let mut p = Prestamo::default();
        assert_eq!(p.autorizar("cualquiera", WEB, Some(7), 0).unwrap_err(), Rechazo::SinSesion);
        assert_eq!(p.autorizar("", WEB, None, 0).unwrap_err(), Rechazo::SinSesion);
    }

    #[test]
    fn con_sesion_solo_las_ventanas_prestadas_y_el_token_y_origen_justos() {
        let mut p = Prestamo::default();
        let t = abierta(&mut p, 1_000);
        assert!(p.autorizar(&t, WEB, Some(7), 1_001).is_ok());
        assert!(p.autorizar(&t, WEB, Some(9), 1_002).is_ok());
        assert!(p.autorizar(&t, WEB, None, 1_003).is_ok());
        assert_eq!(p.autorizar(&t, WEB, Some(8), 1_004).unwrap_err(), Rechazo::VentanaAjena);
        assert_eq!(p.autorizar("tok-2", WEB, Some(7), 1_005).unwrap_err(), Rechazo::Token);
        assert_eq!(p.autorizar("tok-", WEB, Some(7), 1_005).unwrap_err(), Rechazo::Token);
        // Segundo origen con el token bueno (una web hermana, el servidor local u otra página).
        assert_eq!(p.autorizar(&t, "https://starseed-nexus.vercel.app", Some(7), 1_006).unwrap_err(), Rechazo::Origen);
        assert_eq!(p.autorizar(&t, "http://127.0.0.1:47611", Some(7), 1_006).unwrap_err(), Rechazo::Origen);
    }

    #[test]
    fn la_inactividad_y_la_hora_maxima_la_terminan() {
        let mut p = Prestamo::default();
        let t = abierta(&mut p, 0);
        assert!(p.autorizar(&t, WEB, Some(7), INACTIVIDAD_MS - 1).is_ok());
        let tarde = (INACTIVIDAD_MS - 1) + INACTIVIDAD_MS;
        assert_eq!(p.autorizar(&t, WEB, Some(7), tarde).unwrap_err(), Rechazo::Caducada(Fin::Inactividad));
        assert!(p.activa().is_none());
        // Y sigue diciéndolo después.
        assert_eq!(p.autorizar(&t, WEB, Some(7), tarde + 1).unwrap_err(), Rechazo::Caducada(Fin::Inactividad));

        let mut p = Prestamo::default();
        let t = abierta(&mut p, 0);
        let mut ahora = 0;
        while ahora + 60_000 < DURACION_MAX_MS {
            ahora += 60_000;
            assert!(p.autorizar(&t, WEB, Some(7), ahora).is_ok(), "uso continuo a {ahora}");
        }
        assert_eq!(p.autorizar(&t, WEB, Some(7), DURACION_MAX_MS).unwrap_err(), Rechazo::Caducada(Fin::DuracionMaxima));
    }

    #[test]
    fn el_vigilante_tambien_la_vence_sin_ordenes() {
        let mut p = Prestamo::default();
        abierta(&mut p, 0);
        assert_eq!(p.vigilar(INACTIVIDAD_MS - 1), None);
        assert_eq!(p.vigilar(INACTIVIDAD_MS), Some(Fin::Inactividad));
        assert_eq!(p.vigilar(INACTIVIDAD_MS + 1), None);
    }

    #[test]
    fn parada_por_la_persona_o_la_web_se_dice_parada() {
        for fin in [Fin::Persona, Fin::Web] {
            let mut p = Prestamo::default();
            let t = abierta(&mut p, 0);
            assert!(p.terminar(fin));
            assert!(!p.terminar(fin), "parar dos veces no hace nada");
            assert_eq!(p.autorizar(&t, WEB, Some(7), 1).unwrap_err(), Rechazo::Parada);
            assert_eq!(p.autorizar("otro", WEB, Some(7), 1).unwrap_err(), Rechazo::SinSesion);
        }
        for fin in [Fin::Bloqueo, Fin::Sueno, Fin::Salida] {
            let mut p = Prestamo::default();
            let t = abierta(&mut p, 0);
            p.terminar(fin);
            assert_eq!(p.autorizar(&t, WEB, Some(7), 1).unwrap_err(), Rechazo::Caducada(fin));
        }
    }

    #[test]
    fn cerrar_las_ventanas_prestadas_la_termina() {
        let mut p = Prestamo::default();
        let t = abierta(&mut p, 0);
        assert_eq!(p.quitar_ventana(7), None);
        assert_eq!(p.autorizar(&t, WEB, Some(7), 1).unwrap_err(), Rechazo::VentanaAjena);
        assert_eq!(p.quitar_ventana(9), Some(Fin::VentanaCerrada));
        assert_eq!(p.autorizar(&t, WEB, Some(9), 2).unwrap_err(), Rechazo::Caducada(Fin::VentanaCerrada));
    }

    #[test]
    fn solo_pide_un_origen_permitido_un_dialogo_a_la_vez_y_respeta_el_no() {
        let mut p = Prestamo::default();
        assert_eq!(p.empezar_pedido("https://starseed-nexus.vercel.app", 0).unwrap_err(), Rechazo::OrigenNoPermitido);
        assert_eq!(p.empezar_pedido("https://starseed-cafe.vercel.app", 0).unwrap_err(), Rechazo::OrigenNoPermitido);
        assert_eq!(p.empezar_pedido("https://evil.example", 0).unwrap_err(), Rechazo::OrigenNoPermitido);
        p.empezar_pedido(WEB, 0).unwrap();
        assert_eq!(p.empezar_pedido(WEB, 1).unwrap_err(), Rechazo::Pendiente);
        assert_eq!(p.resolver_pedido(false, "t".into(), WEB, "x", vec![1], 10).unwrap_err(), Rechazo::Espera(ESPERA_TRAS_NO_MS));
        assert!(p.activa().is_none());
        assert_eq!(p.empezar_pedido(WEB, 20).unwrap_err(), Rechazo::Espera(ESPERA_TRAS_NO_MS - 10));
        assert!(p.empezar_pedido(WEB, 10 + ESPERA_TRAS_NO_MS).is_ok());
        p.cancelar_pedido();
        assert!(p.empezar_pedido("http://127.0.0.1:47619", 10 + ESPERA_TRAS_NO_MS).is_ok());
    }

    #[test]
    fn una_sesion_nueva_sustituye_a_la_vieja_y_sin_ventanas_no_abre() {
        let mut p = Prestamo::default();
        let viejo = abierta(&mut p, 0);
        p.empezar_pedido(WEB, 5).unwrap();
        assert_eq!(p.resolver_pedido(true, "tok-n".into(), WEB, "x", vec![3], 5).unwrap(), Some(Fin::Sustituida));
        assert_eq!(p.autorizar(&viejo, WEB, Some(7), 6).unwrap_err(), Rechazo::Caducada(Fin::Sustituida));
        assert!(p.autorizar("tok-n", WEB, Some(3), 6).is_ok());
        p.empezar_pedido(WEB, 7).unwrap();
        assert_eq!(p.resolver_pedido(true, "tok-z".into(), WEB, "x", vec![], 7).unwrap_err(), Rechazo::SinVentanas);
        assert!(p.autorizar("tok-n", WEB, Some(3), 8).is_ok(), "un pedido vacío no tumba la sesión abierta");
    }

    #[test]
    fn origenes() {
        assert_eq!(origen_de("https://starseed-os.vercel.app/escritorios?x=1#y"), WEB);
        assert_eq!(origen_de("HTTPS://Starseed-OS.vercel.app"), WEB);
        assert_eq!(origen_de("http://127.0.0.1:47612/x"), "http://127.0.0.1:47612");
        assert_eq!(origen_de("https://user@starseed-os.vercel.app"), "");
        assert_eq!(origen_de("tauri://localhost"), "tauri://localhost");
        assert_eq!(origen_de("nada"), "");
        assert!(origen_puede_prestar(WEB));
        assert!(origen_puede_prestar("http://127.0.0.1:47610"));
        assert!(origen_puede_prestar("http://127.0.0.1:47619"));
        assert!(!origen_puede_prestar("http://127.0.0.1:47620"));
        assert!(!origen_puede_prestar("http://127.0.0.1:9002"));
        assert!(!origen_puede_prestar("http://localhost:47610"));
        assert!(!origen_puede_prestar("https://starseed-os.vercel.app.evil.example"));
        assert!(!origen_puede_prestar("https://starseed-nexus.vercel.app"));
        assert!(!origen_puede_prestar(""));
    }

    #[test]
    fn el_dialogo_dice_que_y_a_quien_y_no_se_deja_inyectar() {
        let t = texto_confirmacion("Magga\nboard\u{7}", &[("Safari".into(), "Banco\r\n— sesión".into()), ("Notas".into(), "".into())]);
        assert!(t.contains("«Magga board»"));
        assert!(t.contains("• Safari — Banco  — sesión"));
        assert!(t.contains("• Notas — (sin título)"));
        assert!(t.contains("No prestar"));
        assert_eq!(limpiar_destino("   "), "otra neurona sin nombre");
        assert_eq!(limpiar_destino(&"x".repeat(200)).chars().count(), MAX_DESTINO);
    }

    #[test]
    fn reposo_por_salto_de_reloj() {
        assert!(!dormido(1_000, 1_000));
        assert!(!dormido(SALTO_SUENO_MS + 1_000, 1_000));
        assert!(dormido(SALTO_SUENO_MS + 1_001, 1_000));
        assert!(!dormido(-5_000, 1_000), "un ajuste del reloj hacia atrás no es reposo");
    }

    #[test]
    fn un_clic_tapado_por_otra_ventana_se_rechaza() {
        let dialogo = Rect { x: 100, y: 100, ancho: 50, alto: 50 };
        let debajo = Rect { x: 0, y: 0, ancho: 1000, alto: 1000 };
        assert!(tapada(120, 120, 5, &[(9, dialogo)]));
        assert!(!tapada(200, 200, 5, &[(9, dialogo)]));
        assert!(!tapada(120, 120, 5, &[(2, debajo)]));
        assert!(!tapada(120, 120, 5, &[]));
    }

    #[test]
    fn texto_acotado() {
        assert!(texto_valido("").is_err());
        assert!(texto_valido("hola").is_ok());
        assert!(texto_valido(&"ñ".repeat(MAX_TEXTO)).is_ok());
        assert!(texto_valido(&"ñ".repeat(MAX_TEXTO + 1)).is_err());
    }

    #[test]
    fn mensajes_con_codigo_para_la_web() {
        assert!(Rechazo::SinSesion.mensaje().starts_with("prestamo:sin-sesion · "));
        assert!(Rechazo::Caducada(Fin::Sueno).mensaje().contains("se durmió"));
        assert!(Rechazo::Espera(1_500).mensaje().contains("2 s"));
    }
}
