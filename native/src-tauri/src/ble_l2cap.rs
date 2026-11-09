// ═══════════════════════════════════════════════════════════════════════════
// ble_l2cap — el carril rápido del Bluetooth directo: canales L2CAP orientados a conexión (BLE1109A).
// ---------------------------------------------------------------------------
// Contrato: architecture/bluetooth-directo.md §15 «Canal rápido L2CAP».
//
// Lo PURO (se prueba en cualquier sistema): el PSM y su validación, el marco del flujo (largo + paquete), el
// desmarcador (lecturas partidas y pegadas), el búfer de salida (escrituras parciales) y la máquina del carril
// con su espera escalonada de reapertura. La radio (CoreBluetooth en macOS, `BluetoothSocket` en Android) solo
// mueve bytes del flujo; el núcleo (`ble.rs`) decide cuándo abrir, cuándo caer a GATT y qué paquete sale.
//
//   · PSM: el periférico abre un canal L2CAP sin cifrar por el aire (el cifrado va por encima: CIF1108A) y lo
//     publica en una característica LEÍBLE más del servicio StarSeed (`PSM`, 2 bytes big-endian). El central la
//     lee y abre el canal. Quien no la tenga (app anterior) o la deje en 0: GATT, como siempre.
//   · MARCO: `[largo (2 B BE)][paquete]`, el MISMO paquete de `ble_trama` (DATOS, ACUSE, RECHAZO, LATIDO) pero
//     de hasta `PAQUETE_RAPIDO` (4096 B). Un flujo fiable y en orden: ni huecos ni reordenados; si el marco no
//     cuadra, el flujo está desalineado y el canal se cierra (se cae a GATT, no se adivina).
//   · CARRIL: mientras el canal está abierto, TODOS los paquetes del enlace (datos, acuses, latidos) salen por él
//     y GATT calla; al cerrarse, salen por GATT sin soltar el enlace, y el canal se reintenta con espera.
// ═══════════════════════════════════════════════════════════════════════════

#![allow(dead_code)]

use crate::ble_trama as bt;
use std::fmt;

// ─────────────────────────────── PSM ───────────────────────────────

/// Característica de lectura del servicio StarSeed con el PSM del canal L2CAP (2 bytes big-endian; 0 = sin soporte).
pub const PSM: &str = "53530004-b1e0-4d2a-9c3e-537461727365";
/// PSM de L2CAP en LE: 1–127 reservados por la SIG, 128–255 dinámicos. Los que dan Android y CoreBluetooth caen
/// en 128–255; se admite todo el rango LE (1–255) y nada más (un PSM mayor es de BR/EDR o basura).
pub const PSM_MIN: u16 = 0x0001;
pub const PSM_MAX: u16 = 0x00FF;

pub fn psm_valido(psm: u16) -> bool {
    (PSM_MIN..=PSM_MAX).contains(&psm)
}

/// El valor de la característica `PSM`: exactamente 2 bytes y un PSM válido (si no, None = sin canal rápido).
pub fn leer_psm(b: &[u8]) -> Option<u16> {
    if b.len() != 2 {
        return None;
    }
    let p = u16::from_be_bytes([b[0], b[1]]);
    psm_valido(p).then_some(p)
}

/// Lo que publica el periférico (0 si aún no hay canal: el central lo lee como «sin soporte»).
pub fn bytes_psm(psm: Option<u16>) -> [u8; 2] {
    psm.filter(|p| psm_valido(*p)).unwrap_or(0).to_be_bytes()
}

// ─────────────────────────────── Marco del flujo ───────────────────────────────

/// Largo del marco: u16 big-endian.
pub const CABECERA_MARCO: usize = 2;
/// Un marco lleva un paquete: de 3 bytes (acuse) a `PAQUETE_RAPIDO`.
pub const MARCO_MIN: usize = 3;
pub const MARCO_MAX: usize = bt::PAQUETE_RAPIDO;
/// Lo que el desmarcador retiene como mucho sin completar un marco (un marco entero y la cabecera del siguiente).
const TOPE_PENDIENTE: usize = CABECERA_MARCO + MARCO_MAX + CABECERA_MARCO;
/// Trozo que la radio lee o escribe de una vez (el máximo que se acepta de golpe del flujo).
pub const TROZO_MAX: usize = 16 * 1024;

#[derive(Debug, PartialEq, Eq, Clone)]
pub enum ErrorMarco {
    /// Largo declarado fuera de [3, 4096].
    Largo(usize),
    /// Más datos pendientes de los que cabe un marco: el flujo no es de StarSeed o está roto.
    Desbordado(usize),
}

impl fmt::Display for ErrorMarco {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ErrorMarco::Largo(n) => write!(f, "marco de {n} bytes fuera de [{MARCO_MIN}, {MARCO_MAX}]"),
            ErrorMarco::Desbordado(n) => write!(f, "flujo desalineado ({n} bytes sin completar un marco)"),
        }
    }
}

/// Un paquete → su marco (None si no cabe: vacío, menor que el mínimo o mayor que `MARCO_MAX`).
pub fn marco(paquete: &[u8]) -> Option<Vec<u8>> {
    if paquete.len() < MARCO_MIN || paquete.len() > MARCO_MAX {
        return None;
    }
    let mut v = Vec::with_capacity(CABECERA_MARCO + paquete.len());
    v.extend_from_slice(&(paquete.len() as u16).to_be_bytes());
    v.extend_from_slice(paquete);
    Some(v)
}

/// Rearma los paquetes de un flujo que llega en trozos de cualquier tamaño (partidos o pegados).
#[derive(Default, Debug)]
pub struct Desmarcador {
    buf: Vec<u8>,
}

impl Desmarcador {
    pub fn nuevo() -> Self {
        Desmarcador { buf: Vec::new() }
    }

    /// Bytes de un marco a medias.
    pub fn pendiente(&self) -> usize {
        self.buf.len()
    }

    pub fn vaciar(&mut self) {
        self.buf.clear();
    }

    /// Añade lo leído y devuelve los paquetes COMPLETOS (en orden). Un error deja el desmarcador vacío: el flujo
    /// ya no sirve y quien lo llama cierra el canal.
    pub fn empujar(&mut self, datos: &[u8]) -> Result<Vec<Vec<u8>>, ErrorMarco> {
        if datos.len() > TROZO_MAX {
            self.buf.clear();
            return Err(ErrorMarco::Desbordado(datos.len()));
        }
        self.buf.extend_from_slice(datos);
        let mut salida = Vec::new();
        let mut pos = 0;
        loop {
            let resto = &self.buf[pos..];
            if resto.len() < CABECERA_MARCO {
                break;
            }
            let largo = u16::from_be_bytes([resto[0], resto[1]]) as usize;
            if !(MARCO_MIN..=MARCO_MAX).contains(&largo) {
                self.buf.clear();
                return Err(ErrorMarco::Largo(largo));
            }
            if resto.len() < CABECERA_MARCO + largo {
                break;
            }
            salida.push(resto[CABECERA_MARCO..CABECERA_MARCO + largo].to_vec());
            pos += CABECERA_MARCO + largo;
        }
        self.buf.drain(..pos);
        if self.buf.len() > TOPE_PENDIENTE {
            let n = self.buf.len();
            self.buf.clear();
            return Err(ErrorMarco::Desbordado(n));
        }
        Ok(salida)
    }
}

// ─────────────────────────────── Búfer de salida (escrituras parciales) ───────────────────────────────

/// Lo que falta por escribir en el flujo. `write` puede aceptar menos de lo pedido (`NSOutputStream`, un socket
/// lleno): se anota lo escrito y se sigue por donde iba.
#[derive(Default, Debug)]
pub struct Salida {
    buf: Vec<u8>,
    pos: usize,
}

impl Salida {
    pub fn nueva() -> Self {
        Salida::default()
    }

    pub fn vacia(&self) -> bool {
        self.pos >= self.buf.len()
    }

    /// Bytes que faltan por escribir.
    pub fn faltan(&self) -> usize {
        self.buf.len().saturating_sub(self.pos)
    }

    /// Añade bytes ya marcados (uno o varios marcos).
    pub fn cargar(&mut self, bytes: &[u8]) {
        if self.vacia() {
            self.buf.clear();
            self.pos = 0;
        }
        self.buf.extend_from_slice(bytes);
    }

    /// Lo que toca escribir ahora.
    pub fn pendiente(&self) -> &[u8] {
        &self.buf[self.pos.min(self.buf.len())..]
    }

    /// El flujo aceptó `n` bytes.
    pub fn avanzar(&mut self, n: usize) {
        self.pos = (self.pos + n).min(self.buf.len());
        if self.vacia() {
            self.buf.clear();
            self.pos = 0;
        }
    }
}

// ─────────────────────────────── El carril ───────────────────────────────

/// Espera antes de volver a abrir el canal tras cerrarse sin haber durado (se repite el último valor: no se rinde).
pub const ESCALA_REAPERTURA_MS: [u64; 5] = [0, 2_000, 5_000, 15_000, 60_000];
/// Un canal que duró esto o más cuenta como estable: la siguiente apertura es inmediata.
pub const CANAL_ESTABLE_MS: u64 = 10_000;
/// Tiempo máximo para que un canal pedido llegue a abrirse.
pub const PLAZO_ABRIR_MS: u64 = 8_000;
/// Escritura sin avanzar un solo byte durante este tiempo: el canal se da por atascado y se cierra.
pub const PLAZO_ESCRITURA_MS: u64 = 5_000;
/// (BLE1109B) Con un mensaje esperando su acuse, el canal abierto sin leer NI UN byte durante esto se da por atascado.
pub const PLAZO_SIN_LECTURA_MS: u64 = 6_000;
/// (BLE1109B) Fallos del canal de un mismo par que lo dejan apagado hasta reiniciar la app…
pub const FALLOS_PARA_APAGAR: usize = 2;
/// …si ocurren dentro de esta ventana (10 min).
pub const VENTANA_FALLOS_MS: u64 = 10 * 60_000;

/// (BLE1109B) Cuenta, por par, los fallos del canal rápido. Dos dentro de `VENTANA_FALLOS_MS` lo apagan para ese par
/// hasta reiniciar la app (solo en memoria: a propósito, un reinicio vuelve a dar una oportunidad).
#[derive(Default, Debug)]
pub struct Castigos {
    fallos: std::collections::HashMap<String, Vec<u64>>,
    apagados: std::collections::HashSet<String>,
}

impl Castigos {
    pub fn nuevo() -> Self {
        Castigos::default()
    }

    /// Anota un fallo. Devuelve true si el par QUEDA apagado con este.
    pub fn fallo(&mut self, par: &str, ahora: u64) -> bool {
        if self.apagados.contains(par) {
            return true;
        }
        let v = self.fallos.entry(par.to_string()).or_default();
        v.retain(|t| ahora.saturating_sub(*t) <= VENTANA_FALLOS_MS);
        v.push(ahora);
        if v.len() >= FALLOS_PARA_APAGAR {
            self.apagados.insert(par.to_string());
            self.fallos.remove(par);
            return true;
        }
        false
    }

    pub fn apagado(&self, par: &str) -> bool {
        self.apagados.contains(par)
    }

    /// Para pruebas y para el interruptor: olvida todo.
    pub fn limpiar(&mut self) {
        self.fallos.clear();
        self.apagados.clear();
    }
}

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum EstadoCarril {
    /// Aún no se sabe el PSM del otro (no lo leímos, o no lo tiene).
    SinPsm,
    /// Con PSM válido, a la espera de abrir (o de la espera de reapertura).
    Disponible,
    /// Pedido; esperando a que el flujo abra.
    Abriendo,
    /// Abierto: es el carril de los paquetes.
    Abierto,
}

impl EstadoCarril {
    pub fn texto(self) -> &'static str {
        match self {
            EstadoCarril::SinPsm => "sin-psm",
            EstadoCarril::Disponible => "disponible",
            EstadoCarril::Abriendo => "abriendo",
            EstadoCarril::Abierto => "abierto",
        }
    }
}

/// Qué pasó al cerrarse el canal (para el registro y la espera).
#[derive(Debug, PartialEq, Eq, Clone)]
pub struct Cierre {
    pub motivo: String,
    pub vivio_ms: u64,
    /// Espera hasta el siguiente intento.
    pub espera_ms: u64,
    /// Estaba abierto (si no, solo falló la apertura).
    pub estaba_abierto: bool,
}

/// La máquina del carril rápido de UN enlace.
#[derive(Debug, Clone)]
pub struct Carril {
    psm: Option<u16>,
    estado: EstadoCarril,
    fallos: u32,
    proximo_ms: u64,
    pedido_ms: u64,
    abierto_ms: u64,
    /// Este lado conectó (central) o aceptó (periférico): solo el central abre; el periférico espera.
    pub abre_este_lado: bool,
    /// (BLE1109B) El enlace ya está LIGADO (saludo firmado intercambiado por GATT): solo entonces se abre el canal.
    ligado: bool,
    /// (BLE1109B) Este par quedó sin canal rápido hasta reiniciar la app (2 fallos en 10 min): todo sigue por GATT.
    prohibido: bool,
    /// (BLE1109B) Último momento en que llegaron bytes por el flujo (o en que abrió).
    ultimo_rx_ms: u64,
}

impl Carril {
    pub fn nuevo(abre_este_lado: bool) -> Self {
        Carril {
            psm: None,
            estado: EstadoCarril::SinPsm,
            fallos: 0,
            proximo_ms: 0,
            pedido_ms: 0,
            abierto_ms: 0,
            abre_este_lado,
            ligado: false,
            prohibido: false,
            ultimo_rx_ms: 0,
        }
    }

    /// (BLE1109B) El enlace llegó a «ligado» por GATT: desde ahora el canal puede abrirse.
    pub fn fijar_ligado(&mut self) {
        self.ligado = true;
    }

    pub fn ligado(&self) -> bool {
        self.ligado
    }

    /// (BLE1109B) Sin canal rápido para este par hasta reiniciar: si había uno abierto o pedido, el que llama lo cierra.
    pub fn prohibir(&mut self) {
        self.prohibido = true;
        if self.estado == EstadoCarril::Disponible {
            self.estado = EstadoCarril::SinPsm;
        }
    }

    pub fn prohibido(&self) -> bool {
        self.prohibido
    }

    /// (BLE1109B) Llegaron bytes por el flujo.
    pub fn nota_lectura(&mut self, ahora: u64) {
        self.ultimo_rx_ms = ahora.max(1);
    }

    /// (BLE1109B) ¿Canal abierto, algo esperando respuesta y NADA leído en `PLAZO_SIN_LECTURA_MS`? Entonces está
    /// atascado en la lectura (la escritura puede ir bien): se cae a GATT.
    pub fn atascado(&self, ahora: u64, pendiente: bool) -> bool {
        self.estado == EstadoCarril::Abierto && pendiente && ahora.saturating_sub(self.ultimo_rx_ms.max(self.abierto_ms)) > PLAZO_SIN_LECTURA_MS
    }

    pub fn estado(&self) -> EstadoCarril {
        self.estado
    }

    pub fn psm(&self) -> Option<u16> {
        self.psm
    }

    pub fn es_rapido(&self) -> bool {
        self.estado == EstadoCarril::Abierto
    }

    pub fn fallos(&self) -> u32 {
        self.fallos
    }

    pub fn espera_para(fallos: u32) -> u64 {
        ESCALA_REAPERTURA_MS[(fallos as usize).min(ESCALA_REAPERTURA_MS.len() - 1)]
    }

    /// El otro lado publicó este PSM. Devuelve si es válido (si no, se ignora y se sigue por GATT).
    pub fn ofrecer_psm(&mut self, psm: u16, ahora: u64) -> bool {
        if !psm_valido(psm) {
            return false;
        }
        self.psm = Some(psm);
        if self.estado == EstadoCarril::SinPsm && !self.prohibido {
            self.estado = EstadoCarril::Disponible;
            self.proximo_ms = ahora;
        }
        true
    }

    /// ¿Hay que abrir el canal ahora? Devuelve el PSM y pasa a `Abriendo`. Solo el lado que abre, con el enlace ya
    /// ligado por GATT (BLE1109B) y el par no apagado.
    pub fn debe_abrir(&mut self, ahora: u64) -> Option<u16> {
        if !self.abre_este_lado || !self.ligado || self.prohibido || self.estado != EstadoCarril::Disponible || ahora < self.proximo_ms {
            return None;
        }
        let psm = self.psm?;
        self.estado = EstadoCarril::Abriendo;
        self.pedido_ms = ahora;
        Some(psm)
    }

    /// ¿Se pasó el plazo de una apertura pedida? (Se cierra con `cerrado`.)
    pub fn apertura_vencida(&self, ahora: u64) -> bool {
        self.estado == EstadoCarril::Abriendo && ahora.saturating_sub(self.pedido_ms) > PLAZO_ABRIR_MS
    }

    /// El flujo abrió (lo pedimos nosotros o lo abrió el otro). Un PSM propio (periférico) también vale.
    pub fn abierto(&mut self, psm: Option<u16>, ahora: u64) {
        if let Some(p) = psm.filter(|p| psm_valido(*p)) {
            self.psm = Some(p);
        }
        self.estado = EstadoCarril::Abierto;
        self.abierto_ms = ahora;
        self.ultimo_rx_ms = ahora.max(1);
    }

    /// El canal se cerró o no llegó a abrir. Vuelve a `Disponible` con la espera que toque (si había PSM).
    pub fn cerrado(&mut self, motivo: &str, ahora: u64) -> Cierre {
        let estaba_abierto = self.estado == EstadoCarril::Abierto;
        let vivio_ms = if estaba_abierto { ahora.saturating_sub(self.abierto_ms) } else { 0 };
        if estaba_abierto && vivio_ms >= CANAL_ESTABLE_MS {
            self.fallos = 0;
        } else {
            self.fallos = self.fallos.saturating_add(1);
        }
        // Un canal que duró se reabre YA (fallos = 0); uno que no abrió o cayó al instante espera 0, 2, 5, 15 y 60 s.
        let espera_ms = if self.fallos == 0 { 0 } else { Self::espera_para(self.fallos - 1) };
        self.proximo_ms = ahora + espera_ms;
        self.estado = if self.psm.is_some() && !self.prohibido { EstadoCarril::Disponible } else { EstadoCarril::SinPsm };
        Cierre { motivo: motivo.chars().take(200).collect(), vivio_ms, espera_ms, estaba_abierto }
    }

    /// Olvida todo (enlace GATT cerrado).
    pub fn reiniciar(&mut self) {
        *self = Carril::nuevo(self.abre_este_lado);
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::ble_trama::{Enlace, Paquete};

    #[test]
    fn psm_se_lee_con_cuidado() {
        assert_eq!(leer_psm(&[0x00, 0x85]), Some(0x85));
        assert_eq!(leer_psm(&[0x00, 0x01]), Some(1));
        assert_eq!(leer_psm(&[0x00, 0xFF]), Some(255));
        assert_eq!(leer_psm(&[0x00, 0x00]), None, "0 = el otro no tiene canal rápido");
        assert_eq!(leer_psm(&[0x01, 0x00]), None, "256 no es un PSM de LE");
        assert_eq!(leer_psm(&[0xFF, 0xFF]), None);
        assert_eq!(leer_psm(&[0x85]), None);
        assert_eq!(leer_psm(&[0, 0, 0x85]), None);
        assert_eq!(leer_psm(&[]), None);
        assert_eq!(bytes_psm(Some(0x85)), [0, 0x85]);
        assert_eq!(bytes_psm(None), [0, 0]);
        assert_eq!(bytes_psm(Some(9999)), [0, 0], "un PSM fuera de rango no se publica");
        for p in 1..=255u16 {
            assert_eq!(leer_psm(&bytes_psm(Some(p))), Some(p));
        }
        assert!(!psm_valido(0) && psm_valido(128) && !psm_valido(256));
        assert_ne!(PSM, bt::SALIDA);
        assert!(bt::uuid_bytes(PSM).is_some());
    }

    #[test]
    fn marco_rechaza_lo_que_no_cabe() {
        assert_eq!(marco(&[]), None);
        assert_eq!(marco(&[1, 2]), None);
        assert_eq!(marco(&[2, 0, 1]), Some(vec![0, 3, 2, 0, 1]));
        assert!(marco(&vec![1u8; MARCO_MAX]).is_some());
        assert_eq!(marco(&vec![1u8; MARCO_MAX + 1]), None);
        let m = marco(&vec![7u8; 300]).unwrap();
        assert_eq!(&m[..2], &300u16.to_be_bytes());
        assert_eq!(m.len(), 302);
    }

    #[test]
    fn desmarcador_une_trozos_partidos_y_pegados() {
        let paquetes: Vec<Vec<u8>> = vec![
            bt::paquete_acuse(1),
            vec![bt::P_DATOS, 0, 2, 0, 0, 9, 9, 9],
            bt::paquete_latido(),
            vec![bt::P_DATOS, 0, 3, 0, 1].into_iter().chain(std::iter::repeat(5u8).take(3000)).collect(),
            bt::paquete_rechazo(4, bt::R_LIMITE),
        ];
        let flujo: Vec<u8> = paquetes.iter().flat_map(|p| marco(p).unwrap()).collect();
        // Todo de golpe (pegados).
        let mut d = Desmarcador::nuevo();
        assert_eq!(d.empujar(&flujo).unwrap(), paquetes);
        assert_eq!(d.pendiente(), 0);
        // Byte a byte (partidos hasta lo imposible).
        let mut d = Desmarcador::nuevo();
        let mut sale = Vec::new();
        for b in &flujo {
            sale.extend(d.empujar(&[*b]).unwrap());
        }
        assert_eq!(sale, paquetes);
        // Trozos irregulares (7, 1, 4096, 13, …) que cortan cabeceras y cuerpos por la mitad.
        let mut d = Desmarcador::nuevo();
        let mut sale = Vec::new();
        let (mut i, mut k) = (0, 0usize);
        let cortes = [7usize, 1, 4096, 13, 2, 999, 1, 3, 8192];
        while i < flujo.len() {
            let n = cortes[k % cortes.len()].min(flujo.len() - i);
            sale.extend(d.empujar(&flujo[i..i + n]).unwrap());
            i += n;
            k += 1;
        }
        assert_eq!(sale, paquetes);
        assert_eq!(d.pendiente(), 0);
        // Un marco a medias se queda esperando.
        let mut d = Desmarcador::nuevo();
        let m = marco(&paquetes[3]).unwrap();
        assert!(d.empujar(&m[..m.len() - 1]).unwrap().is_empty());
        assert_eq!(d.pendiente(), m.len() - 1);
        assert_eq!(d.empujar(&m[m.len() - 1..]).unwrap(), vec![paquetes[3].clone()]);
    }

    #[test]
    fn desmarcador_corta_un_flujo_desalineado() {
        for malo in [vec![0u8, 0, 1], vec![0, 2, 1, 1], vec![0xFF, 0xFF, 0], vec![0x10, 0x01, 0]] {
            let mut d = Desmarcador::nuevo();
            assert!(matches!(d.empujar(&malo), Err(ErrorMarco::Largo(_))), "{malo:?}");
            assert_eq!(d.pendiente(), 0, "tras el error no queda basura");
        }
        // Un trozo mayor que lo que la radio lee de golpe.
        let mut d = Desmarcador::nuevo();
        assert!(matches!(d.empujar(&vec![0u8; TROZO_MAX + 1]), Err(ErrorMarco::Desbordado(_))));
        // Un marco bueno seguido de uno malo: el error llega, no se entrega a medias.
        let mut d = Desmarcador::nuevo();
        let mut flujo = marco(&bt::paquete_acuse(9)).unwrap();
        flujo.extend_from_slice(&[0, 1, 0]);
        assert!(d.empujar(&flujo).is_err());
    }

    #[test]
    fn salida_sigue_por_donde_iba_tras_una_escritura_parcial() {
        let mut s = Salida::nueva();
        assert!(s.vacia());
        let a = marco(&vec![1u8; 1000]).unwrap();
        let b = marco(&bt::paquete_acuse(5)).unwrap();
        s.cargar(&a);
        s.cargar(&b);
        assert_eq!(s.faltan(), a.len() + b.len());
        let mut escrito = Vec::new();
        // El flujo acepta 0, 1, 300, … bytes: nunca lo que se le pide.
        let mut k = 0usize;
        let acepta = [0usize, 1, 300, 5000, 2];
        while !s.vacia() {
            let n = acepta[k % acepta.len()].min(s.pendiente().len());
            escrito.extend_from_slice(&s.pendiente()[..n]);
            s.avanzar(n);
            k += 1;
            assert!(k < 100);
        }
        let mut esperado = a.clone();
        esperado.extend_from_slice(&b);
        assert_eq!(escrito, esperado);
        assert!(s.vacia() && s.pendiente().is_empty());
        s.avanzar(10);
        assert!(s.vacia(), "avanzar de más no rompe");
        // Y se puede volver a cargar.
        s.cargar(&b);
        assert_eq!(s.pendiente(), &b[..]);
    }

    #[test]
    fn carril_abre_cae_a_gatt_y_reintenta_con_espera() {
        let mut c = Carril::nuevo(true);
        assert_eq!(c.estado(), EstadoCarril::SinPsm);
        assert_eq!(c.debe_abrir(0), None, "sin PSM no hay nada que abrir");
        assert!(!c.ofrecer_psm(0, 0) && !c.ofrecer_psm(999, 0), "PSM inválido: se ignora");
        assert_eq!(c.estado(), EstadoCarril::SinPsm);
        assert!(c.ofrecer_psm(0x85, 1_000));
        c.fijar_ligado(); // BLE1109B: solo se abre con el enlace ya ligado
        assert_eq!(c.debe_abrir(1_000), Some(0x85));
        assert_eq!(c.estado(), EstadoCarril::Abriendo);
        assert_eq!(c.debe_abrir(1_001), None, "ya pedido");
        assert!(!c.apertura_vencida(1_000 + PLAZO_ABRIR_MS));
        assert!(c.apertura_vencida(1_001 + PLAZO_ABRIR_MS));
        // No abrió: espera y vuelve a intentar con la escala 0, 2, 5, 15, 60, 60…
        let mut t = 10_000;
        let mut esperas = Vec::new();
        for _ in 0..7 {
            let cierre = c.cerrado("no abrió", t);
            assert!(!cierre.estaba_abierto);
            esperas.push(cierre.espera_ms);
            if cierre.espera_ms > 0 {
                assert_eq!(c.debe_abrir(t + cierre.espera_ms - 1), None, "aún en espera");
            }
            t += cierre.espera_ms;
            assert_eq!(c.debe_abrir(t), Some(0x85));
        }
        assert_eq!(esperas, vec![0, 2_000, 5_000, 15_000, 60_000, 60_000, 60_000]);
        // Abre y dura: la caída siguiente es inmediata y el contador vuelve a cero.
        c.abierto(Some(0x85), t);
        assert!(c.es_rapido());
        let cierre = c.cerrado("el otro cerró", t + CANAL_ESTABLE_MS + 1);
        assert!(cierre.estaba_abierto && cierre.espera_ms == 0 && cierre.vivio_ms > CANAL_ESTABLE_MS);
        assert_eq!(c.fallos(), 0);
        assert!(!c.es_rapido());
        assert_eq!(c.debe_abrir(t + CANAL_ESTABLE_MS + 1), Some(0x85));
        // Abre y cae al instante (flapping): cuenta como fallo y espera.
        c.abierto(None, 100_000);
        let cierre = c.cerrado("estado 8", 100_300);
        assert_eq!((c.fallos(), cierre.espera_ms), (1, 0));
        c.debe_abrir(100_300);
        c.abierto(None, 100_400);
        let cierre = c.cerrado("estado 8", 100_700);
        assert_eq!((c.fallos(), cierre.espera_ms), (2, 2_000));
        // Enlace GATT cerrado: se olvida todo.
        c.reiniciar();
        assert_eq!((c.estado(), c.psm()), (EstadoCarril::SinPsm, None));
    }

    #[test]
    fn el_periferico_no_abre_pero_acepta() {
        let mut p = Carril::nuevo(false);
        assert!(p.ofrecer_psm(0x90, 0));
        assert_eq!(p.debe_abrir(100), None, "el periférico espera a que el central abra");
        p.abierto(Some(0x90), 200);
        assert!(p.es_rapido());
        p.cerrado("fin", 300);
        assert_eq!(p.estado(), EstadoCarril::Disponible);
        assert_eq!(p.debe_abrir(1_000_000), None);
    }

    /// Lleva los paquetes de `de` a `a` por el flujo con trozos irregulares (lo que haría el aire) y devuelve lo entregado.
    fn por_el_flujo(de: &mut Enlace, a: &mut Enlace, d: &mut Desmarcador, ahora: u64, cortes: &[usize], k: &mut usize, ya: &mut impl FnMut() -> bool) -> Vec<String> {
        let mut flujo = Vec::new();
        while let Some(p) = de.siguiente_paquete(ahora) {
            flujo.extend(marco(&p).expect("cabe en un marco"));
        }
        let mut entregados = Vec::new();
        let mut i = 0;
        while i < flujo.len() {
            let n = cortes[*k % cortes.len()].min(flujo.len() - i);
            *k += 1;
            for p in d.empujar(&flujo[i..i + n]).expect("flujo alineado") {
                if let Some(c) = a.recibir_rapido(&p, ahora, ya) {
                    entregados.push(c);
                }
            }
            i += n;
        }
        entregados
    }

    #[test]
    fn mensaje_de_16_kib_por_el_carril_rapido_llega_entero_y_acusado_y_se_mide() {
        let mut a = Enlace::nuevo(23);
        let mut b = Enlace::nuevo(23);
        a.fijar_carril(true);
        b.fijar_carril(true);
        assert!(a.es_rapido());
        let cuerpo = format!("{{\"t\":\"archivo.chunk\",\"d\":\"{}\"}}", "Z".repeat(16_000));
        a.encolar(7, &cuerpo, 1_000).unwrap();
        let (mut da, mut db) = (Desmarcador::nuevo(), Desmarcador::nuevo());
        let mut si = || true;
        let (mut ka, mut kb) = (0usize, 0usize);
        let cortes = [333usize, 1, 4096, 17, 2000];
        let entregado = por_el_flujo(&mut a, &mut b, &mut da, 1_100, &cortes, &mut ka, &mut si);
        assert_eq!(entregado, vec![cuerpo.clone()]);
        // El acuse vuelve por el mismo flujo.
        let acuses = por_el_flujo(&mut b, &mut a, &mut db, 1_150, &cortes, &mut kb, &mut si);
        assert!(acuses.is_empty());
        let hechos = a.hechos();
        assert_eq!(hechos.len(), 1);
        assert!(hechos[0].resultado.is_ok());
        // Se midió POR CARRIL: la del rápido tiene valor, la de GATT no.
        assert!(a.medidas.kbps_rapido.is_some_and(|k| k > 0), "{:?}", a.medidas);
        assert_eq!(a.medidas.kbps_gatt, None);
        assert_eq!(a.medidas.kbps, a.medidas.kbps_rapido);
        // 16 KB en ~150 ms ≈ 850 kbit/s; con 4 KiB por paquete son 5 paquetes, no 32 como a 512 B.
        assert!(a.medidas.kbps_rapido.unwrap() > 500);
        let av = a.avisos();
        assert!(av.iter().any(|(t, d)| *t == "l2cap-kbps" && d.starts_with("kbps=")), "{av:?}");
    }

    #[test]
    fn cambiar_de_carril_a_mitad_de_un_mensaje_no_pierde_nada() {
        let cuerpo = format!("{{\"t\":\"x\",\"d\":\"{}\"}}", "Q".repeat(9_000));
        let mut a = Enlace::nuevo(100);
        let mut b = Enlace::nuevo(100);
        a.encolar(1, &cuerpo, 0).unwrap();
        let mut si = || true;
        // Salen 3 paquetes de GATT (de ~95 B útiles)…
        for _ in 0..3 {
            let p = a.siguiente_paquete(10).unwrap();
            assert!(p.len() <= 100);
            assert!(b.recibir(&p, 10, &mut si).is_none());
        }
        // …y el canal rápido abre: lo que falta se re-trocea al tamaño del carril nuevo desde el índice 0.
        a.fijar_carril(true);
        b.fijar_carril(true);
        let mut d = Desmarcador::nuevo();
        let mut k = 0;
        let entregado = por_el_flujo(&mut a, &mut b, &mut d, 20, &[1500], &mut k, &mut si);
        assert_eq!(entregado, vec![cuerpo.clone()], "llega una sola vez y entero");
        let mut dd = Desmarcador::nuevo();
        let mut k2 = 0;
        por_el_flujo(&mut b, &mut a, &mut dd, 30, &[64], &mut k2, &mut si);
        assert!(a.hechos().iter().all(|h| h.resultado.is_ok()));
        // Y de vuelta a GATT con otro mensaje: vuelve al paquete de GATT, el enlace sigue vivo.
        a.fijar_carril(false);
        b.fijar_carril(false);
        assert!(!a.es_rapido());
        a.encolar(2, "{\"t\":\"y\",\"d\":\"gatt\"}", 40).unwrap();
        let p = a.siguiente_paquete(40).unwrap();
        assert!(p.len() <= 100);
        assert_eq!(b.recibir(&p, 40, &mut si).as_deref(), Some("{\"t\":\"y\",\"d\":\"gatt\"}"));
    }

    #[test]
    fn caida_del_canal_con_un_mensaje_en_vuelo_sigue_por_gatt_y_se_entrega() {
        let cuerpo = format!("{{\"t\":\"x\",\"d\":\"{}\"}}", "R".repeat(6_000));
        let mut a = Enlace::nuevo(60);
        let mut b = Enlace::nuevo(60);
        a.fijar_carril(true);
        b.fijar_carril(true);
        a.encolar(3, &cuerpo, 0).unwrap();
        // El canal rápido solo alcanzó a sacar el primer paquete y se cayó.
        let primero = a.siguiente_paquete(5).unwrap();
        assert!(primero.len() > 60, "salió por el carril rápido");
        a.fijar_carril(false);
        b.fijar_carril(false);
        // El resto se re-trocea a 60 B y va por GATT; el receptor nunca vio el principio.
        let mut si = || true;
        let mut entregado = None;
        for _ in 0..400 {
            while let Some(p) = a.siguiente_paquete(6) {
                assert!(p.len() <= 60);
                if let Some(c) = b.recibir(&p, 6, &mut si) {
                    entregado = Some(c);
                }
            }
            while let Some(p) = b.siguiente_paquete(6) {
                a.recibir(&p, 6, &mut si);
            }
            if entregado.is_some() {
                break;
            }
        }
        assert_eq!(entregado.as_deref(), Some(cuerpo.as_str()));
        for _ in 0..4 {
            while let Some(p) = b.siguiente_paquete(7) {
                a.recibir(&p, 7, &mut si);
            }
        }
        assert!(a.hechos().iter().all(|h| h.resultado.is_ok()));
        assert!(a.medidas.kbps_rapido.is_none() && a.medidas.kbps_gatt.is_some(), "se midió el carril por el que salió");
    }

    #[test]
    fn acuses_y_latidos_pasan_por_delante_de_los_datos_en_el_flujo() {
        let mut a = Enlace::nuevo(23);
        a.fijar_carril(true);
        a.encolar(1, &format!("{{\"d\":\"{}\"}}", "W".repeat(12_000)), 0).unwrap();
        // Llega un mensaje del otro y hay que acusarlo: el acuse sale ANTES del siguiente paquete de datos.
        let mut otro = Enlace::nuevo(23);
        otro.fijar_carril(true);
        otro.encolar(9, "{\"t\":\"hola\"}", 0).unwrap();
        let pq = otro.siguiente_paquete(1).unwrap();
        let mut si = || true;
        assert_eq!(a.recibir_rapido(&pq, 1, &mut si).as_deref(), Some("{\"t\":\"hola\"}"));
        let primero = a.siguiente_paquete(2).unwrap();
        assert!(matches!(bt::leer_paquete_max(&primero, bt::PAQUETE_RAPIDO), Some(Paquete::Acuse { id: 0 })), "primero el acuse");
        let segundo = a.siguiente_paquete(2).unwrap();
        assert!(matches!(bt::leer_paquete_max(&segundo, bt::PAQUETE_RAPIDO), Some(Paquete::Datos { idx: 0, .. })));
        // Un paquete de carril rápido no se acepta por GATT (más de 512 B).
        assert!(bt::leer_paquete(&segundo).is_none());
    }

    // ─────────── BLE1109B: ligado, par apagado, canal atascado ───────────

    #[test]
    fn el_canal_solo_se_abre_tras_ligar_y_no_si_el_par_esta_apagado() {
        let mut c = Carril::nuevo(true);
        assert!(c.ofrecer_psm(0x85, 100));
        assert_eq!(c.debe_abrir(100), None, "sin «ligado» por GATT no se abre");
        c.fijar_ligado();
        assert_eq!(c.debe_abrir(100), Some(0x85));
        c.cerrado("x", 200);
        c.prohibir();
        assert_eq!(c.estado(), EstadoCarril::SinPsm);
        assert!(c.ofrecer_psm(0x85, 300), "el PSM se guarda…");
        assert_eq!(c.estado(), EstadoCarril::SinPsm, "…pero no habilita el canal");
        assert_eq!(c.debe_abrir(10_000_000), None);
        // El que no abre (periférico) nunca pide el canal.
        let mut p = Carril::nuevo(false);
        p.ofrecer_psm(0x85, 0);
        p.fijar_ligado();
        assert_eq!(p.debe_abrir(0), None);
    }

    #[test]
    fn canal_atascado_solo_con_algo_esperando_y_sin_leer() {
        let mut c = Carril::nuevo(false);
        c.abierto(Some(0x85), 1_000);
        assert!(!c.atascado(1_000 + PLAZO_SIN_LECTURA_MS + 1, false), "sin nada esperando acuse no se juzga");
        assert!(!c.atascado(1_000 + PLAZO_SIN_LECTURA_MS, true), "justo en el plazo, vivo");
        assert!(c.atascado(1_000 + PLAZO_SIN_LECTURA_MS + 1, true));
        c.nota_lectura(5_000);
        assert!(!c.atascado(5_000 + PLAZO_SIN_LECTURA_MS, true), "leyó hace poco");
        assert!(c.atascado(5_000 + PLAZO_SIN_LECTURA_MS + 1, true));
        let mut cerrado = Carril::nuevo(false);
        assert!(!cerrado.atascado(u64::MAX / 2, true), "un canal que no está abierto no se vigila");
        cerrado.ofrecer_psm(0x85, 0);
        assert!(!cerrado.atascado(u64::MAX / 2, true));
    }

    #[test]
    fn dos_fallos_en_diez_minutos_apagan_al_par_hasta_reiniciar() {
        let mut k = Castigos::nuevo();
        assert!(!k.fallo("n1", 0));
        assert!(!k.apagado("n1"));
        assert!(k.fallo("n1", 599_000), "el segundo dentro de 10 min lo apaga");
        assert!(k.apagado("n1") && !k.apagado("n2"), "solo ese par");
        assert!(k.fallo("n1", 99_999_999), "ya apagado sigue apagado");
        // Fuera de la ventana el primero ya no cuenta.
        assert!(!k.fallo("n2", 0));
        assert!(!k.fallo("n2", VENTANA_FALLOS_MS + 1));
        assert!(k.fallo("n2", VENTANA_FALLOS_MS + 2));
        k.limpiar();
        assert!(!k.apagado("n1") && !k.apagado("n2"));
    }
}
