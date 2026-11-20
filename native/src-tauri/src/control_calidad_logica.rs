//! (CTL1119C) El ritmo de la pantalla de control, del lado del aparato. Lógica PURA, sin E/S ni reloj: la usan
//! macOS, Linux y Android (cada uno mide su captura y pasa el retardo que devuelve el receptor, CTL1119B).
//!
//! Objetivo: 15 cuadros/s en red local. Se baja de nivel cuando capturar+codificar o el retardo no caben en ese
//! presupuesto, y se sube solo tras muchas muestras buenas (histéresis: subir cuesta más que bajar, para no oscilar).
//! No se mide «fps» a secas: con la pantalla quieta no hay cuadros nuevos y eso no es un enlace lento.
//! También decide la vía de captura en Linux y detecta si un cuadro es igual al anterior por bloques.

/// Objetivo de cuadros por segundo en red local.
pub const OBJETIVO_FPS: u32 = 15;
/// Presupuesto de un cuadro completo a 15 fps.
pub const PERIODO_OBJETIVO_MS: u64 = 1000 / OBJETIVO_FPS as u64;
/// Suelo y techo del intervalo entre capturas (nunca menos de 40 ms ni más de 250).
pub const PERIODO_MIN_MS: u64 = 40;
pub const PERIODO_MAX_MS: u64 = 250;
/// De mejor a peor: lado mayor y calidad JPEG. Incluye 1280/960/720/540/400.
pub const NIVELES: [(u32, u8); 9] = [
    (1280, 60), (1280, 48), (960, 48), (960, 40), (720, 40),
    (720, 34), (540, 34), (540, 28), (400, 28),
];
pub const TRABAJO_ALTO_MS: u64 = 52;
pub const TRABAJO_BUENO_MS: u64 = 20;
pub const RETARDO_ALTO_MS: u64 = 90;
pub const RETARDO_BUENO_MS: u64 = 40;
/// Muestras seguidas para bajar y para volver a subir.
pub const MUESTRAS_PARA_BAJAR: u32 = 6;
pub const MUESTRAS_PARA_SUBIR: u32 = 24;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Nivel {
    pub lado: u32,
    pub calidad: u8,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Cambio {
    Ninguno,
    Baja(Nivel),
    Sube(Nivel),
}

/// Estado del bucle adaptativo. `indice` recorre `NIVELES` de mejor a peor.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Ritmo {
    pub indice: usize,
    pub malas: u32,
    pub buenas: u32,
}

impl Ritmo {
    /// Arranca en el nivel de siempre (1280 px, calidad 60) o en el más cercano al que pidió la página.
    pub fn nuevo(lado: u32, calidad: u8) -> Self {
        Self { indice: nivel_mas_cercano(lado, calidad), malas: 0, buenas: 0 }
    }

    pub fn nivel(&self) -> Nivel {
        let (lado, calidad) = NIVELES[self.indice.min(NIVELES.len() - 1)];
        Nivel { lado, calidad }
    }

    /// Intervalo entre capturas: el objetivo, o lo que de verdad cuesta el cuadro si es más lento.
    pub fn periodo_ms(&self, trabajo_ms: u64) -> u64 {
        trabajo_ms.max(PERIODO_OBJETIVO_MS).clamp(PERIODO_MIN_MS, PERIODO_MAX_MS)
    }

    /// Una muestra medida (captura+codificación y retardo del receptor) → nivel siguiente, si toca cambiarlo.
    pub fn muestra(&mut self, trabajo_ms: u64, retardo_ms: u64) -> Cambio {
        let alto = trabajo_ms > TRABAJO_ALTO_MS || retardo_ms > RETARDO_ALTO_MS;
        let bueno = trabajo_ms < TRABAJO_BUENO_MS && retardo_ms < RETARDO_BUENO_MS;
        if alto {
            self.malas += 1;
            self.buenas = 0;
        } else if bueno {
            self.buenas += 1;
            self.malas = 0;
        } else {
            self.malas = 0;
            self.buenas = 0;
        }
        if self.malas >= MUESTRAS_PARA_BAJAR && self.indice + 1 < NIVELES.len() {
            self.indice += 1;
            self.malas = 0;
            return Cambio::Baja(self.nivel());
        }
        if self.buenas >= MUESTRAS_PARA_SUBIR && self.indice > 0 {
            self.indice -= 1;
            self.buenas = 0;
            return Cambio::Sube(self.nivel());
        }
        Cambio::Ninguno
    }
}

/// Nivel más cercano al lado y la calidad pedidos (sin salirse de la tabla).
pub fn nivel_mas_cercano(lado: u32, calidad: u8) -> usize {
    let mut mejor = 0;
    let mut distancia = u32::MAX;
    for (i, (l, c)) in NIVELES.iter().enumerate() {
        let d = lado.abs_diff(*l) + u32::from(calidad.abs_diff(*c)) * 20;
        if d < distancia {
            distancia = d;
            mejor = i;
        }
    }
    mejor
}

/// Huella rápida por bloques: muestrea 8×8 puntos (centro de cada bloque), no recorre la pantalla entera.
/// En RGB/RGBA cuantiza a 5 bits para no considerar «cambio» un ruido de 1–2 niveles. `None` si no hay datos.
pub fn huella_bloques(bytes: &[u8], canales: usize, ancho: u32, alto: u32) -> Option<u64> {
    if canales == 0 || ancho < 8 || alto < 8 || bytes.len() < ancho as usize * alto as usize * canales {
        return None;
    }
    let (w, h) = (ancho as usize, alto as usize);
    let mut huella = 14_695_981_039_346_656_037u64;
    for fy in 0..8usize {
        for fx in 0..8usize {
            let x = ((fx * 2 + 1) * w / 16).min(w - 1);
            let y = ((fy * 2 + 1) * h / 16).min(h - 1);
            let i = (y * w + x) * canales;
            let v = (u16::from(bytes[i]) + u16::from(bytes[i + 1]) + u16::from(bytes[i + 2])) / 3;
            huella ^= (u64::from(v >> 3)).wrapping_add((fx as u64) * 31 + (fy as u64) * 131);
            huella = huella.wrapping_mul(1_099_511_628_211);
        }
    }
    Some(huella)
}

/// Lo que el aparato sabe de su sesión gráfica y de lo que trae la AppImage.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Capacidades {
    pub x11: bool,
    pub xshm: bool,
    pub gstreamer: bool,
    pub vp8_webrtc: bool,
}

/// Vía de captura de escritorio. XShm (memoria compartida) evita la copia de cada cuadro cuando existe.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Via {
    Xshm,
    Xcap,
}

/// La captura normal: memoria compartida si X11 la ofrece; si no, xcap de siempre.
pub fn via_linux(c: Capacidades) -> Via {
    if c.x11 && c.xshm { Via::Xshm } else { Via::Xcap }
}

/// Segunda vía fluida (LNX1118WB), solo si la AppImage trae GStreamer y hay VP8 por WebRTC.
pub fn via_fluida(c: Capacidades) -> Option<&'static str> {
    (c.x11 && c.gstreamer && c.vp8_webrtc).then_some("gstreamer-vp8")
}

/// Línea de registro de un cambio de nivel (sin datos privados).
pub fn linea_cambio(c: Cambio, trabajo_ms: u64, retardo_ms: u64) -> String {
    match c {
        Cambio::Ninguno => String::new(),
        Cambio::Baja(n) => format!("baja lado={} calidad={} trabajo_ms={trabajo_ms} retardo_ms={retardo_ms}", n.lado, n.calidad),
        Cambio::Sube(n) => format!("sube lado={} calidad={} trabajo_ms={trabajo_ms} retardo_ms={retardo_ms}", n.lado, n.calidad),
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn tras(r: &mut Ritmo, trabajo: u64, retardo: u64, veces: u32) -> Option<Cambio> {
        let mut ultimo = None;
        for _ in 0..veces {
            match r.muestra(trabajo, retardo) {
                Cambio::Ninguno => {}
                c => ultimo = Some(c),
            }
        }
        ultimo
    }

    #[test]
    fn ctl1119c_la_tabla_lleva_los_cinco_lados_y_arranca_en_el_de_siempre() {
        let lados: Vec<u32> = NIVELES.iter().map(|(l, _)| *l).collect();
        for lado in [1280, 960, 720, 540, 400] {
            assert!(lados.contains(&lado), "falta el lado {lado}");
        }
        let r = Ritmo::nuevo(1280, 60);
        assert_eq!(r.nivel(), Nivel { lado: 1280, calidad: 60 });
        assert_eq!(Ritmo::nuevo(720, 39).nivel().lado, 720, "un lado pedido se respeta");
        assert_eq!(PERIODO_OBJETIVO_MS, 66);
    }

    #[test]
    fn ctl1119c_equipo_lento_mac_mini_2011_baja_hasta_400_y_deja_de_oscilar() {
        // 2,7–2,9 fps medidos: captura+codificación ≈ 360 ms y el receptor tarda otros 40.
        let mut r = Ritmo::nuevo(1280, 60);
        tras(&mut r, 360, 40, 200);
        assert_eq!(r.nivel(), Nivel { lado: 400, calidad: 28 }, "no puede bajar más");
        assert_eq!(r.periodo_ms(360), 250, "el intervalo no se dispara aunque el cuadro tarde");
        // Sigue lento: se queda abajo, sin volver a «subir por una muestra buena aislada».
        assert_eq!(tras(&mut r, 360, 40, 50), None);
        assert_eq!(r.nivel().lado, 400);
    }

    #[test]
    fn ctl1119c_equipo_rapido_vuelve_a_subir_solo_tras_muchas_muestras_buenas() {
        // 10 ms de captura+codificación y 20 ms de red local: sobra presupuesto.
        let mut r = Ritmo::nuevo(400, 28);
        assert_eq!(tras(&mut r, 10, 20, MUESTRAS_PARA_SUBIR - 1), None, "subir es lento");
        let c = tras(&mut r, 10, 20, 1).expect("la muestra que completa la histéresis sube");
        assert_eq!(c, Cambio::Sube(r.nivel()));
        assert_eq!(r.periodo_ms(10), PERIODO_OBJETIVO_MS);
    }

    #[test]
    fn ctl1119c_el_retardo_del_receptor_tambien_manda_y_la_histeresis_aguanta_rachas() {
        let mut r = Ritmo::nuevo(1280, 60);
        assert_eq!(tras(&mut r, 10, 40, MUESTRAS_PARA_BAJAR - 1), None, "casi alto no baja");
        assert_eq!(tras(&mut r, 10, 10, 3), None, "una racha buena borra las malas");
        assert_eq!(tras(&mut r, 10, 91, MUESTRAS_PARA_BAJAR), Some(Cambio::Baja(r.nivel())), "90 ms ya es alto");
        assert!(r.nivel().calidad < 60 || r.nivel().lado < 1280);
    }

    #[test]
    fn ctl1119c_la_huella_ignora_ruido_de_un_nivel_pero_ve_un_cambio_y_no_inventa_sin_datos() {
        let (w, h) = (64u32, 64u32);
        let base = vec![100u8; (w * h * 3) as usize];
        let h1 = huella_bloques(&base, 3, w, h).expect("hay datos");
        let centro = (4 * w as usize + 4) * 3;
        let mut ruido = base.clone();
        ruido[centro] = ruido[centro].saturating_add(2);
        assert_eq!(huella_bloques(&ruido, 3, w, h), Some(h1), "1–2 niveles no son un cambio");
        let mut negro = base.clone();
        negro[centro] = 0;
        negro[centro + 1] = 0;
        negro[centro + 2] = 0;
        assert_ne!(huella_bloques(&negro, 3, w, h), Some(h1), "un bloque distinto sí se ve");
        assert_eq!(huella_bloques(&base, 3, 4, 4), None);
        assert_eq!(huella_bloques(&[0; 10], 3, 64, 64), None, "bytes de menos no se leen");
    }

    #[test]
    fn ctl1119c_linux_prefiere_memoria_compartida_y_el_vp8_queda_detras_de_sus_tres_condiciones() {
        let c = Capacidades { x11: true, xshm: true, gstreamer: true, vp8_webrtc: true };
        assert_eq!(via_linux(c), Via::Xshm);
        assert_eq!(via_fluida(c), Some("gstreamer-vp8"));
        assert_eq!(via_linux(Capacidades { xshm: false, ..c }), Via::Xcap, "sin MIT-SHM, xcap");
        assert_eq!(via_fluida(Capacidades { vp8_webrtc: false, ..c }), None, "sin VP8 no hay segunda vía");
        assert_eq!(via_fluida(Capacidades { gstreamer: false, ..c }), None, "sin GStreamer no hay segunda vía");
    }
}
