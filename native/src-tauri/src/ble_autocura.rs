// BLE1110A · lógica PURA de la autocuración del periférico Android, del MTU recordado y del colapso de líneas repetidas.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Caso real del 09-11 (prueba.32): la autocuración de `BleStarSeed.kt` se disparó 68 veces (35 en 2 s, otra ráfaga 10 min
// después) y tiró un enlace sano de 476 s: el contador de caídas no se limpiaba, las desconexiones de la propia cura
// alimentaban el contador, la comprobación «ningún enlace vivo» no veía el enlace ligado y nada limitaba la cura.
//
// Kotlin no puede llamar a Rust sin compilar contra el JNI, así que la decisión vive aquí, con sus pruebas, y
// `MotorBle` en `BleStarSeed.kt` es su gemelo línea a línea (`Autocura`, mismas constantes y mismas reglas). Cualquier cambio
// de una regla se hace en los dos sitios. Contrato: `architecture/bluetooth-directo.md` §15.
//
// Además: la decisión del MTU tras recrear el servidor (nunca 20 B a un central que negoció 512) y el colapso de
// líneas idénticas consecutivas del registro («… (×N)»), usado por `enlaces.log`.

#![allow(dead_code)]

/// Con un enlace ligado, o con tráfico en este tiempo, no se cura NUNCA.
pub const SIN_TRAFICO_MS: u64 = 30_000;
/// Como mucho una cura cada tanto.
pub const ENTRE_CURAS_MS: u64 = 5 * 60_000;
/// Tormenta: tantas desconexiones en esta ventana.
pub const VENTANA_TORMENTA_MS: u64 = 60_000;
pub const CAIDAS_TORMENTA: usize = 4;
/// Sin ningún enlace ligado durante esto (con una neurona anunciándose cerca) → cura.
pub const SIN_CENTRAL_MS: u64 = 90_000;
/// Tras una cura, las desconexiones que provoca ella misma (cancelar conexiones, cerrar el servidor) no cuentan.
pub const GRACIA_CURA_MS: u64 = 20_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Motivo {
    Tormenta { caidas: usize },
    SinEnlace { segundos: u64 },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Decision {
    pub motivo: Motivo,
    /// Recrear también el servidor GATT (si no, solo se reinicia el anuncio y se sueltan las conexiones a medias).
    pub recrear_servidor: bool,
    /// Una sola línea de registro con la evidencia sobre la que se actuó.
    pub evidencia: String,
}

/// Lo que se sabe en el momento de decidir.
#[derive(Debug, Clone, Copy)]
pub struct Entrada {
    pub ahora: u64,
    /// La radio está encendida (el vigía solo actúa entonces).
    pub encendida: bool,
    /// Hay algún enlace ligado/suscrito, o un cliente listo, o un canal L2CAP abierto.
    pub enlace_vivo: bool,
    /// Hay una neurona StarSeed anunciándose cerca.
    pub vecino_cerca: bool,
}

#[derive(Debug, Default, Clone)]
pub struct Autocura {
    caidas: Vec<u64>,
    ultima_cura: Option<u64>,
    curas_seguidas: u32,
    ultimo_enlace: u64,
    ultimo_trafico: Option<u64>,
}

impl Autocura {
    pub fn nueva(ahora: u64) -> Self {
        Autocura { ultimo_enlace: ahora, ..Default::default() }
    }

    fn en_gracia(&self, ahora: u64) -> bool {
        self.ultima_cura.is_some_and(|c| ahora.saturating_sub(c) < GRACIA_CURA_MS)
    }

    /// Una desconexión del otro aparato. Las que provoca la propia cura no cuentan.
    pub fn anotar_caida(&mut self, ahora: u64) {
        if self.en_gracia(ahora) {
            return;
        }
        self.caidas.push(ahora);
        self.caidas.retain(|t| ahora.saturating_sub(*t) <= VENTANA_TORMENTA_MS);
    }

    /// Un central se suscribió (enlace nuevo): se acaba la racha de curas.
    pub fn nota_enlace(&mut self, ahora: u64) {
        self.ultimo_enlace = ahora;
        self.curas_seguidas = 0;
    }

    /// Pasaron bytes por algún enlace (GATT o L2CAP, en cualquier sentido).
    pub fn nota_trafico(&mut self, ahora: u64) {
        self.ultimo_trafico = Some(ahora);
    }

    pub fn caidas_en_ventana(&self) -> usize {
        self.caidas.len()
    }

    /// ¿Hay que curar ahora? Si devuelve Some, la cura ya queda anotada (cooldown, caídas a cero).
    pub fn decidir(&mut self, e: &Entrada) -> Option<Decision> {
        let ahora = e.ahora;
        self.caidas.retain(|t| ahora.saturating_sub(*t) <= VENTANA_TORMENTA_MS);
        if !e.encendida {
            return None;
        }
        if e.enlace_vivo {
            // Un enlace sano cuenta como «hay enlace» y borra el historial de caídas: nada que curar.
            self.ultimo_enlace = ahora;
            self.caidas.clear();
            return None;
        }
        let desde_trafico = self.ultimo_trafico.map(|t| ahora.saturating_sub(t));
        if desde_trafico.is_some_and(|d| d < SIN_TRAFICO_MS) {
            return None;
        }
        if self.ultima_cura.is_some_and(|c| ahora.saturating_sub(c) < ENTRE_CURAS_MS) {
            return None;
        }
        let sin_enlace_ms = ahora.saturating_sub(self.ultimo_enlace);
        let trafico_txt = match desde_trafico {
            Some(d) => format!("{} s sin tráfico", d / 1000),
            None => "sin tráfico desde que arrancó".to_string(),
        };
        let (motivo, recrear) = if self.caidas.len() >= CAIDAS_TORMENTA {
            (Motivo::Tormenta { caidas: self.caidas.len() }, true)
        } else if sin_enlace_ms > SIN_CENTRAL_MS && e.vecino_cerca {
            (Motivo::SinEnlace { segundos: sin_enlace_ms / 1000 }, self.curas_seguidas + 1 >= 2)
        } else {
            return None;
        };
        let evidencia = match &motivo {
            Motivo::Tormenta { caidas } => format!(
                "tormenta de desconexiones ({caidas} en {} s), ningún enlace ligado, {trafico_txt}, {} curas seguidas",
                VENTANA_TORMENTA_MS / 1000,
                self.curas_seguidas
            ),
            Motivo::SinEnlace { segundos } => format!(
                "ningún enlace ligado desde hace {segundos} s con una neurona anunciándose cerca, {trafico_txt}, {} curas seguidas",
                self.curas_seguidas
            ),
        };
        self.ultima_cura = Some(ahora);
        self.curas_seguidas += 1;
        self.ultimo_enlace = ahora;
        self.caidas.clear();
        Some(Decision { motivo, recrear_servidor: recrear, evidencia })
    }
}

// ───────────────────────────── MTU recordado ─────────────────────────────

/// Paquete GATT mínimo (MTU 23 − 3).
pub const PAQUETE_MIN: usize = 20;
/// Un central que se suscribe con el paquete mínimo y sin MTU recordado se suelta una sola vez por este tiempo.
pub const ESPERA_SOLTAR_MTU_MS: u64 = 60_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AccionMtu {
    /// Usar este paquete.
    Usar(usize),
    /// El MTU no es de fiar: soltar la conexión para que el central reconecte y renegocie.
    SoltarYRenegociar,
}

/// Al suscribirse un central: `actual` es el paquete que tiene anotado, `recordado` el que se negoció antes con este
/// aparato (sobrevive a recrear el servidor), `soltado_hace_ms` cuánto hace que se le soltó por esto mismo.
pub fn decidir_mtu(actual: usize, recordado: Option<usize>, soltado_hace_ms: Option<u64>) -> AccionMtu {
    if actual > PAQUETE_MIN {
        return AccionMtu::Usar(actual);
    }
    if let Some(r) = recordado.filter(|r| *r > PAQUETE_MIN) {
        return AccionMtu::Usar(r);
    }
    if soltado_hace_ms.is_some_and(|h| h < ESPERA_SOLTAR_MTU_MS) {
        // Ya se le soltó hace poco y sigue en el mínimo: ese central de verdad no tiene más.
        return AccionMtu::Usar(actual);
    }
    AccionMtu::SoltarYRenegociar
}

// ───────────────────────────── Colapso de líneas repetidas ─────────────────────────────

/// Líneas idénticas consecutivas → la primera sale al instante y al terminar la racha sale «<línea> … (×N)».
#[derive(Debug, Default, Clone)]
pub struct Colapsador {
    clave: Option<String>,
    linea: String,
    repetidas: u32,
    ultima_ms: u64,
}

impl Colapsador {
    /// `clave`: lo que hace idénticas a dos líneas (sin la hora). Devuelve las líneas que hay que escribir ya.
    pub fn empujar(&mut self, clave: &str, linea: String, ahora: u64) -> Vec<String> {
        let mut salida = Vec::new();
        if self.clave.as_deref() == Some(clave) {
            self.repetidas += 1;
            self.linea = linea;
            self.ultima_ms = ahora;
            return salida;
        }
        if let Some(r) = self.resumen() {
            salida.push(r);
        }
        self.clave = Some(clave.to_string());
        self.linea = linea.clone();
        self.repetidas = 0;
        self.ultima_ms = ahora;
        salida.push(linea);
        salida
    }

    fn resumen(&self) -> Option<String> {
        if self.repetidas == 0 {
            None
        } else {
            Some(format!("{} … (×{})", self.linea, self.repetidas + 1))
        }
    }

    /// Cierra una racha que lleva `max_ms` sin repetirse (para que el resumen no espere a la siguiente línea distinta).
    pub fn vaciar_viejas(&mut self, ahora: u64, max_ms: u64) -> Option<String> {
        if self.repetidas > 0 && ahora.saturating_sub(self.ultima_ms) >= max_ms {
            let r = self.resumen();
            self.clave = None;
            self.repetidas = 0;
            return r;
        }
        None
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn sano(ahora: u64) -> Entrada {
        Entrada { ahora, encendida: true, enlace_vivo: true, vecino_cerca: true }
    }
    fn solo(ahora: u64) -> Entrada {
        Entrada { ahora, encendida: true, enlace_vivo: false, vecino_cerca: true }
    }

    #[test]
    fn un_enlace_sano_no_se_cura_nunca() {
        let mut a = Autocura::nueva(0);
        for t in 0..10 {
            a.anotar_caida(t * 1_000);
        }
        for t in (0..1_000).map(|i| i * 30_000) {
            assert_eq!(a.decidir(&sano(t)), None, "con enlace ligado no se cura (t={t})");
        }
        assert_eq!(a.caidas_en_ventana(), 0, "un enlace sano borra el historial");
    }

    #[test]
    fn con_trafico_reciente_no_se_cura() {
        let mut a = Autocura::nueva(0);
        for t in 0..5 {
            a.anotar_caida(1_000 * t);
        }
        a.nota_trafico(10_000);
        assert_eq!(a.decidir(&solo(10_000 + SIN_TRAFICO_MS - 1)), None);
        assert!(a.decidir(&solo(10_000 + SIN_TRAFICO_MS)).is_some(), "pasados los 30 s sin tráfico, la tormenta se cura");
    }

    #[test]
    fn una_tormenta_real_cura_una_vez_y_la_cura_no_se_dispara_a_si_misma() {
        let mut a = Autocura::nueva(0);
        for t in 0..4 {
            a.anotar_caida(100_000 + t * 500);
        }
        let d = a.decidir(&solo(102_000)).expect("tormenta");
        assert!(d.recrear_servidor);
        assert_eq!(d.motivo, Motivo::Tormenta { caidas: 4 });
        assert!(d.evidencia.contains("4 en 60 s"), "{}", d.evidencia);
        // La cura cancela conexiones: sus desconexiones llegan ahora y NO cuentan.
        for t in 0..140 {
            a.anotar_caida(102_000 + t * 10);
        }
        assert_eq!(a.caidas_en_ventana(), 0);
        assert_eq!(a.decidir(&solo(104_000)), None);
        // Aunque pasada la gracia lleguen 4 caídas reales, el enfriamiento de 5 min manda.
        for t in 0..4 {
            a.anotar_caida(130_000 + t * 100);
        }
        assert_eq!(a.decidir(&solo(131_000)), None);
        assert_eq!(a.decidir(&solo(102_000 + ENTRE_CURAS_MS - 1)), None);
        // Cinco minutos después, una tormenta nueva sí.
        let t0 = 102_000 + ENTRE_CURAS_MS + 1_000;
        for t in 0..4 {
            a.anotar_caida(t0 + t * 100);
        }
        assert!(a.decidir(&solo(t0 + 2_000)).is_some());
    }

    #[test]
    fn las_caidas_viejas_se_podan() {
        let mut a = Autocura::nueva(0);
        for t in 0..3 {
            a.anotar_caida(t * 1_000);
        }
        a.anotar_caida(VENTANA_TORMENTA_MS + 5_000);
        assert_eq!(a.caidas_en_ventana(), 1, "las de hace más de 60 s ya no cuentan");
        assert_eq!(a.decidir(&solo(VENTANA_TORMENTA_MS + 6_000)), None, "una sola caída no es tormenta");
    }

    #[test]
    fn sin_enlace_espera_90_s_y_con_vecino_y_recrea_a_la_segunda() {
        let mut a = Autocura::nueva(0);
        assert_eq!(a.decidir(&solo(SIN_CENTRAL_MS)), None, "justo en el plazo, todavía no");
        let sin_vecino = Entrada { vecino_cerca: false, ..solo(SIN_CENTRAL_MS + 1) };
        assert_eq!(a.decidir(&sin_vecino), None, "sin nadie cerca no hay nada que curar");
        let d = a.decidir(&solo(SIN_CENTRAL_MS + 1)).expect("cura");
        assert!(!d.recrear_servidor, "la primera solo reinicia el anuncio");
        let t2 = SIN_CENTRAL_MS + 1 + ENTRE_CURAS_MS + SIN_CENTRAL_MS + 1;
        let d2 = a.decidir(&solo(t2)).expect("segunda");
        assert!(d2.recrear_servidor, "la segunda seguida recrea el servidor");
        // Un enlace nuevo acaba la racha.
        a.nota_enlace(t2 + 10);
        let t3 = t2 + ENTRE_CURAS_MS + SIN_CENTRAL_MS + 100;
        assert!(!a.decidir(&solo(t3)).unwrap().recrear_servidor);
    }

    #[test]
    fn radio_apagada_no_se_cura() {
        let mut a = Autocura::nueva(0);
        for t in 0..6 {
            a.anotar_caida(t * 100);
        }
        assert_eq!(a.decidir(&Entrada { encendida: false, ..solo(2_000) }), None);
    }

    #[test]
    fn mtu_nunca_baja_a_20_si_se_negocio_antes() {
        assert_eq!(decidir_mtu(512, None, None), AccionMtu::Usar(512));
        assert_eq!(decidir_mtu(20, Some(512), None), AccionMtu::Usar(512), "recordado tras recrear el servidor");
        assert_eq!(decidir_mtu(20, None, None), AccionMtu::SoltarYRenegociar);
        assert_eq!(decidir_mtu(20, Some(20), None), AccionMtu::SoltarYRenegociar);
        assert_eq!(decidir_mtu(20, None, Some(5_000)), AccionMtu::Usar(20), "ya se soltó: no en bucle");
        assert_eq!(decidir_mtu(20, None, Some(ESPERA_SOLTAR_MTU_MS)), AccionMtu::SoltarYRenegociar, "pasado el tiempo se puede volver a probar");
    }

    #[test]
    fn colapsador_junta_identicas_consecutivas() {
        let mut c = Colapsador::default();
        let mut sal = Vec::new();
        for i in 0..68 {
            sal.extend(c.empujar("autocuracion·x", format!("t{i} autocuracion x"), 1_000 + i));
        }
        assert_eq!(sal, vec!["t0 autocuracion x".to_string()], "la primera sale; las repetidas esperan");
        let fin = c.empujar("otra", "t99 otra".into(), 2_000);
        assert_eq!(fin, vec!["t67 autocuracion x … (×68)".to_string(), "t99 otra".to_string()]);
        // Sin repetir no hay resumen.
        assert_eq!(c.empujar("y", "t100 y".into(), 2_001), vec!["t100 y".to_string()]);
    }

    #[test]
    fn colapsador_cierra_rachas_viejas_sin_esperar_otra_linea() {
        let mut c = Colapsador::default();
        c.empujar("k", "a".into(), 0);
        c.empujar("k", "b".into(), 100);
        assert_eq!(c.vaciar_viejas(1_000, 5_000), None, "aún reciente");
        assert_eq!(c.vaciar_viejas(6_000, 5_000), Some("b … (×2)".to_string()));
        assert_eq!(c.vaciar_viejas(60_000, 5_000), None, "ya cerrada");
        // Tras cerrar, la misma línea vuelve a salir.
        assert_eq!(c.empujar("k", "c".into(), 61_000), vec!["c".to_string()]);
    }
}
