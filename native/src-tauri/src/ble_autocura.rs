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
        // MLL1111C: el plazo entre curas crece con la racha (5, 10, 20 min, tope 30): una cura que no arregla nada no se
        // repite cada 5 min durante nueve horas (prueba 35: 106 curas seguidas).
        if self.ultima_cura.is_some_and(|c| ahora.saturating_sub(c) < plazo_entre_curas(self.curas_seguidas)) {
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

// ───────────────────────────── MLL1111C: la tormenta que no era tormenta ─────────────────────────────
// Prueba 35 (10-11): el Bluetooth estuvo caído casi nueve horas con los dos aparatos en el mismo Wi-Fi. La tableta contaba
// ~18 000 desconexiones por minuto «sin ningún enlace ligado». Causa (leída en `BleStarSeed.kt`, `servidorCb`): cada
// STATE_DISCONNECTED llamaba a `servidor.cancelConnection(d)` aunque ese aparato ya no estuviera conectado, y la pila de
// Android contesta a esa cancelación con OTRO STATE_DISCONNECTED del mismo aparato → bucle de ~300 por segundo. Cada vuelta:
//  · se contaba como caída (la «tormenta»), y
//  · llamaba a `reanudarRadio()` → `anunciar()`, que para el anuncio y programa el arranque 300 ms después SOLO si nadie
//    volvió a pedirlo antes (turno). Con una petición cada pocos ms el turno nunca coincidía: el anuncio no arrancaba nunca,
//    el Mac (central) no veía a la tableta y no intentaba conectar (su registro calla de 09:56 a 18:32).
// La cura cada 5 min recreaba el servidor GATT, pero el bucle seguía. Cuando el bucle paró (~18:31), la cura de 18:32:46
// arrancó el anuncio y el Mac conectó 3 s después.
// Arreglo (gemelo en Kotlin): una desconexión de un aparato que no constaba como conectado es REPETIDA: no se cancela otra
// vez, no cuenta como caída y no toca la radio; las peticiones de anuncio se juntan (un arranque en curso no se reinicia);
// y el contador cuenta hechos reales por minuto.

/// Una desconexión, según si ese aparato constaba como conectado.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Desconexion {
    /// Constaba como conectado: se libera (cancelConnection una vez), cuenta como caída y se reanuda la radio.
    Real,
    /// No constaba (eco de una cancelación nuestra o aviso repetido de la pila): se ignora.
    Repetida,
}

pub fn clasificar_desconexion(constaba_conectado: bool) -> Desconexion {
    if constaba_conectado {
        Desconexion::Real
    } else {
        Desconexion::Repetida
    }
}

/// Plazo entre curas según cuántas van seguidas sin que ligue un enlace: 5, 5, 10, 20 y 30 min de tope.
pub const ENTRE_CURAS_MAX_MS: u64 = 30 * 60_000;
pub fn plazo_entre_curas(curas_seguidas: u32) -> u64 {
    if curas_seguidas <= 1 {
        return ENTRE_CURAS_MS;
    }
    let factor = 1u64 << (curas_seguidas - 1).min(10);
    ENTRE_CURAS_MS.saturating_mul(factor).min(ENTRE_CURAS_MAX_MS)
}

/// Un arranque de anuncio pedido y sin confirmar se puede repetir pasado este tiempo.
pub const CONFIRMAR_ANUNCIO_MS: u64 = 3_000;

/// El anuncio del periférico: junta las peticiones. Antes cada petición paraba el anuncio y reprogramaba el arranque, y una
/// ráfaga de peticiones lo dejaba parado para siempre.
#[derive(Debug, Default, Clone)]
pub struct Anuncio {
    activo: bool,
    pedido_en: Option<u64>,
}

impl Anuncio {
    /// ¿Hay que (re)arrancar el anuncio ahora? `forzar`: el servidor se recreó y hay que arrancarlo aunque constara activo.
    /// Nunca reinicia un arranque en curso (pedido hace menos de `CONFIRMAR_ANUNCIO_MS` y sin confirmar).
    pub fn pedir(&mut self, ahora: u64, forzar: bool) -> bool {
        if self.pedido_en.is_some_and(|p| ahora.saturating_sub(p) < CONFIRMAR_ANUNCIO_MS) {
            return false;
        }
        if self.activo && !forzar {
            return false;
        }
        self.activo = false;
        self.pedido_en = Some(ahora);
        true
    }
    /// `onStartSuccess` (o el código 3, «ya estaba»).
    pub fn confirmado(&mut self) {
        self.activo = true;
        self.pedido_en = None;
    }
    /// `onStartFailure` con otro código, o se paró a propósito.
    pub fn parado(&mut self) {
        self.activo = false;
        self.pedido_en = None;
    }
    pub fn activo(&self) -> bool {
        self.activo
    }
}

/// Conexiones y desconexiones REALES por minuto (y las repetidas aparte), para `enlaces.log`.
#[derive(Debug, Default, Clone)]
pub struct ContadorEnlaces {
    desde: u64,
    conexiones: u32,
    reales: u32,
    repetidas: u32,
}

pub const MINUTO_CONTADOR_MS: u64 = 60_000;

impl ContadorEnlaces {
    pub fn nuevo(ahora: u64) -> Self {
        ContadorEnlaces { desde: ahora, ..Default::default() }
    }
    pub fn conexion(&mut self) {
        self.conexiones = self.conexiones.saturating_add(1);
    }
    pub fn desconexion(&mut self, d: Desconexion) {
        match d {
            Desconexion::Real => self.reales = self.reales.saturating_add(1),
            Desconexion::Repetida => self.repetidas = self.repetidas.saturating_add(1),
        }
    }
    /// Pasado un minuto devuelve la línea del registro (None si no hubo ningún hecho: un minuto callado no escribe).
    pub fn cerrar(&mut self, ahora: u64) -> Option<String> {
        let ms = ahora.saturating_sub(self.desde);
        if ms < MINUTO_CONTADOR_MS {
            return None;
        }
        let hubo = self.conexiones + self.reales + self.repetidas > 0;
        let linea = format!(
            "en {} s: {} conexiones, {} desconexiones reales, {} avisos repetidos ignorados",
            ms / 1000,
            self.conexiones,
            self.reales,
            self.repetidas
        );
        *self = ContadorEnlaces::nuevo(ahora);
        hubo.then_some(linea)
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

#[cfg(test)]
mod pruebas_mll1111c {
    use super::*;
    use std::collections::VecDeque;

    /// Modelo de la pila de Android de la prueba 35: `cancelConnection` sobre un aparato ya desconectado devuelve otro
    /// STATE_DISCONNECTED ~3,3 ms después (≈ 18 000 por minuto, lo que contó la tableta).
    const ECO_MS: u64 = 3;
    const ECO_US_EXTRA: u64 = 300; // 3,3 ms por vuelta

    /// Repite 60 s de la tableta tras una desconexión real. `viejo`: cancela en CADA desconexión (código de prueba.35).
    /// Devuelve (caídas contadas, peticiones de anuncio, arranques de anuncio que llegaron a salir).
    fn minuto_de_la_tableta(viejo: bool) -> (usize, u32, u32) {
        let mut conectados = std::collections::HashSet::from(["p:mac"]);
        let mut cola: VecDeque<u64> = VecDeque::from([0u64]); // instantes (µs) de STATE_DISCONNECTED de «p:mac»
        let mut caidas = 0usize;
        let mut peticiones = 0u32;
        // Anuncio viejo: cada petición sube el turno y el arranque sale 300 ms después solo si el turno no cambió.
        let mut turno = 0u32;
        let mut programados: Vec<(u64, u32)> = Vec::new();
        let mut arranques_viejos = 0u32;
        let mut anuncio = Anuncio::default();
        let mut arranques_nuevos = 0u32;
        while let Some(t_us) = cola.pop_front() {
            if t_us > 60_000_000 {
                break;
            }
            let t = t_us / 1000;
            let constaba = conectados.remove("p:mac");
            let real = clasificar_desconexion(constaba) == Desconexion::Real;
            if viejo || real {
                // cancelConnection(d): la pila lo contesta con otro DISCONNECTED.
                cola.push_back(t_us + ECO_MS * 1000 + ECO_US_EXTRA);
            }
            if viejo || real {
                caidas += 1;
                // reanudarRadio(): pide anuncio 400 ms después.
                peticiones += 1;
                let tp = t + 400;
                if viejo {
                    turno += 1;
                    programados.push((tp + 300, turno));
                } else if anuncio.pedir(tp, false) {
                    arranques_nuevos += 1;
                    anuncio.confirmado();
                }
            }
            // Arranques viejos que vencieron: solo salen si nadie pidió otro entre medias.
            programados.retain(|(vence, tu)| {
                if *vence <= t {
                    if *tu == turno {
                        arranques_viejos += 1;
                    }
                    false
                } else {
                    true
                }
            });
        }
        (caidas, peticiones, if viejo { arranques_viejos } else { arranques_nuevos })
    }

    #[test]
    fn la_tormenta_de_la_prueba_35_es_una_sola_caida() {
        let (caidas_viejo, _, _) = minuto_de_la_tableta(true);
        assert!(caidas_viejo > 17_000, "el código viejo cuenta la tormenta imposible: {caidas_viejo}");
        let (caidas, peticiones, arranques) = minuto_de_la_tableta(false);
        assert_eq!(caidas, 1, "una desconexión real y su eco ignorado");
        assert_eq!(peticiones, 1);
        assert_eq!(arranques, 1, "el anuncio arranca");
        // Y con una sola caída no hay cura.
        let mut a = Autocura::nueva(0);
        a.anotar_caida(1_000);
        assert_eq!(a.decidir(&Entrada { ahora: 120_000, encendida: true, enlace_vivo: false, vecino_cerca: false }), None);
    }

    #[test]
    fn el_anuncio_viejo_no_arrancaba_nunca_durante_el_bucle() {
        let (_, peticiones, arranques) = minuto_de_la_tableta(true);
        assert!(peticiones > 17_000);
        assert_eq!(arranques, 0, "con una petición cada 3 ms el turno nunca coincide: la tableta no se anuncia");
    }

    #[test]
    fn una_desconexion_sin_conexion_previa_es_repetida() {
        assert_eq!(clasificar_desconexion(true), Desconexion::Real);
        assert_eq!(clasificar_desconexion(false), Desconexion::Repetida);
    }

    #[test]
    fn caidas_reales_siguen_siendo_tormenta() {
        // Cuatro centrales que conectan y caen de verdad en un minuto: eso sí es una tormenta (y se cura).
        let mut a = Autocura::nueva(0);
        for i in 0..4 {
            if clasificar_desconexion(true) == Desconexion::Real {
                a.anotar_caida(100_000 + i * 5_000);
            }
        }
        assert!(matches!(a.decidir(&Entrada { ahora: 130_000, encendida: true, enlace_vivo: false, vecino_cerca: true }).map(|d| d.motivo), Some(Motivo::Tormenta { caidas: 4 })));
    }

    #[test]
    fn un_arranque_sin_confirmar_se_puede_repetir() {
        let mut an = Anuncio::default();
        assert!(an.pedir(0, false));
        assert!(!an.pedir(10, false), "un arranque en curso no se reinicia");
        assert!(!an.pedir(10, true), "ni forzado");
        assert!(an.pedir(CONFIRMAR_ANUNCIO_MS, false), "sin confirmar a los 3 s: se vuelve a pedir");
        an.confirmado();
        assert!(!an.pedir(CONFIRMAR_ANUNCIO_MS + 10_000, false), "activo: nada que hacer");
        assert!(an.pedir(CONFIRMAR_ANUNCIO_MS + 10_000, true), "servidor recreado: se rearranca");
        an.parado();
        assert!(!an.activo());
        assert!(an.pedir(CONFIRMAR_ANUNCIO_MS + 20_000, false));
    }

    #[test]
    fn el_plazo_entre_curas_crece_y_tiene_tope() {
        assert_eq!(plazo_entre_curas(0), ENTRE_CURAS_MS);
        assert_eq!(plazo_entre_curas(1), ENTRE_CURAS_MS);
        assert_eq!(plazo_entre_curas(2), 2 * ENTRE_CURAS_MS);
        assert_eq!(plazo_entre_curas(3), 4 * ENTRE_CURAS_MS);
        assert_eq!(plazo_entre_curas(4), ENTRE_CURAS_MAX_MS);
        assert_eq!(plazo_entre_curas(106), ENTRE_CURAS_MAX_MS);
        // Nueve horas sin enlace con una neurona cerca: antes 106 curas; ahora muchas menos.
        let mut a = Autocura::nueva(0);
        let mut curas = 0;
        let mut t = 0;
        while t < 9 * 3_600_000 {
            t += 30_000;
            if a.decidir(&Entrada { ahora: t, encendida: true, enlace_vivo: false, vecino_cerca: true }).is_some() {
                curas += 1;
            }
        }
        assert!(curas <= 22 && curas >= 15, "curas en 9 h: {curas}");
    }

    #[test]
    fn contador_sin_hechos_no_escribe() {
        let mut c = ContadorEnlaces::nuevo(0);
        assert_eq!(c.cerrar(30_000), None, "aún no pasó el minuto");
        assert_eq!(c.cerrar(60_000), None, "un minuto callado no escribe");
        c.conexion();
        c.desconexion(Desconexion::Real);
        for _ in 0..18_000 {
            c.desconexion(Desconexion::Repetida);
        }
        let l = c.cerrar(120_000).expect("línea");
        assert!(l.contains("1 conexiones, 1 desconexiones reales, 18000 avisos repetidos"), "{l}");
        assert_eq!(c.cerrar(180_000), None, "se reinicia");
    }
}
