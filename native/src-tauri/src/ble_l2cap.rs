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
/// (BLE1110A) Latido del canal: con un mensaje esperando su acuse, cada tanto se manda un eco mínimo (el mismo paquete de la
/// autoprueba). El eco lo contesta el RUST del otro lado, sin pasar por su webview: un acuse de la app puede tardar si el
/// webview está en segundo plano o ocupado, y eso NO es un canal atascado (prueba.32: cierres cada 8–100 s).
pub const LATIDO_CANAL_MS: u64 = 2_000;
/// (BLE1110A) El canal se da por atascado solo si un latido lleva sin eco esto Y no se leyó ni un byte en ese tiempo.
pub const PLAZO_ECO_LATIDO_MS: u64 = 6_000;
/// (BLE1109B) Fallos del canal de un mismo par (dentro de `VENTANA_FALLOS_MS`) que lo dejan en pausa.
pub const FALLOS_PARA_APAGAR: usize = 2;
/// (BLE1111P) Pausas crecientes del canal rápido con un par que SIGUE conectado y cuyo canal falla de verdad: 30 s, 2 min,
/// 10 min y, de ahí en adelante, 10 min (techo). Sustituye a la hora entera de BLE1109B. Todo sigue por GATT mientras tanto.
pub const ESCALA_PAUSA_MS: [u64; 3] = [30_000, 120_000, 600_000];
/// (BLE1111P) Un fallo del canal no cuenta hasta pasar este margen: si en él se cae el enlace entero, era el otro aparato
/// yéndose (reinicio, actualización, Bluetooth apagado), no un canal que falla.
pub const GRACIA_SALIDA_MS: u64 = 5_000;
/// (BLE1111P) Un canal que pasó la autoprueba y vivió esto o más estaba sano: borra la escala de pausas de ese par.
pub const CANAL_SANO_MS: u64 = 30_000;
/// (BLE1109B) Autoprueba del canal: paquete de 3 bytes [tipo | nonce] y su eco. Solo viajan por el canal; una app anterior los
/// ignora (paquete desconocido) y entonces el eco no llega y el enlace sigue por GATT.
pub const P_PRUEBA: u8 = 5;
pub const P_ECO: u8 = 6;
/// (BLE1109B) Plazo del eco de la autoprueba. Sin eco en este tiempo el canal se cierra y todo sigue por GATT.
pub const PLAZO_PRUEBA_MS: u64 = 3_000;

pub fn paquete_prueba(nonce: u16) -> Vec<u8> {
    let n = nonce.to_be_bytes();
    vec![P_PRUEBA, n[0], n[1]]
}

pub fn paquete_eco(nonce: u16) -> Vec<u8> {
    let n = nonce.to_be_bytes();
    vec![P_ECO, n[0], n[1]]
}

/// (BLE1109B) Lo que dice un paquete de autoprueba: (es eco, nonce). None si no lo es.
pub fn leer_prueba(b: &[u8]) -> Option<(bool, u16)> {
    if b.len() != 3 {
        return None;
    }
    match b[0] {
        P_PRUEBA => Some((false, u16::from_be_bytes([b[1], b[2]]))),
        P_ECO => Some((true, u16::from_be_bytes([b[1], b[2]]))),
        _ => None,
    }
}
/// …si ocurren dentro de esta ventana (10 min).
pub const VENTANA_FALLOS_MS: u64 = 10 * 60_000;

/// (BLE1111P) Lo que se sabe del canal rápido con UN par, atado a la sesión GATT (el enlace) en que pasó.
#[derive(Debug, Clone, Default)]
struct Historial {
    /// Enlace (sesión GATT) al que pertenece todo lo de abajo. Un enlace nuevo con ese par empieza limpio.
    enlace: String,
    /// Fallos aún sin confirmar (dentro de `GRACIA_SALIDA_MS`): un enlace que se cae en ese margen los anula.
    provisionales: Vec<u64>,
    /// Fallos confirmados dentro de `VENTANA_FALLOS_MS`.
    fallos: Vec<u64>,
    /// Pausas ya cumplidas desde el último canal sano (escalón de `ESCALA_PAUSA_MS`).
    escalon: usize,
    /// En pausa hasta este momento.
    pausa_hasta: Option<u64>,
    /// Acaba de salir de una pausa: un solo fallo confirmado más abre la siguiente.
    tras_pausa: bool,
    /// El enlace ya se cerró: lo que llegue tarde de él no cuenta.
    ido: bool,
}

/// (BLE1111P) Una pausa que empieza (para el registro).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Pausa {
    pub par: String,
    pub enlace: String,
    pub ms: u64,
    /// 1, 2, 3… (el 3 y siguientes son el techo).
    pub escalon: usize,
    /// Fallos confirmados que la abrieron.
    pub fallos: usize,
    /// Venía de otra pausa (un solo fallo basta).
    pub tras_pausa: bool,
}

impl Pausa {
    /// «pausa de 30 s», «pausa de 2 min»…
    pub fn texto_ms(ms: u64) -> String {
        if ms < 60_000 {
            format!("{} s", ms.div_ceil(1_000))
        } else {
            let m = ms / 60_000;
            let s = (ms % 60_000) / 1_000;
            if s == 0 { format!("{m} min") } else { format!("{m} min {s} s") }
        }
    }

    /// Lo que dice `enlaces.log` al empezar la pausa, en palabras.
    pub fn detalle(&self) -> String {
        let causa = if self.tras_pausa {
            "el canal rápido volvió a fallar tras la pausa anterior".to_string()
        } else {
            format!("{} fallos del canal rápido en 10 min con el otro aparato conectado", self.fallos)
        };
        let siguiente = ESCALA_PAUSA_MS[self.escalon.min(ESCALA_PAUSA_MS.len() - 1)];
        format!(
            "{causa}: pausa de {} (escalón {} de {}); luego se vuelve a probar solo (si falla otra vez, {}); un canal que dure {} s la anula; todo sigue por GATT",
            Self::texto_ms(self.ms),
            self.escalon.min(ESCALA_PAUSA_MS.len()),
            ESCALA_PAUSA_MS.len(),
            Self::texto_ms(siguiente),
            CANAL_SANO_MS / 1_000
        )
    }
}

/// (BLE1109B → BLE1111P) Política del canal rápido por par. Ya NO apaga una hora: cuenta como fallo solo lo que falla con el
/// otro aparato aún conectado y responde con pausas crecientes (`ESCALA_PAUSA_MS`) que un canal sano borra.
///
/// - Un fallo entra como PROVISIONAL. Si el enlace entero se cae en `GRACIA_SALIDA_MS` (o ya se había caído: el enlace
///   está «ido»), se descarta: los dos órdenes posibles («canal cerrado» → «enlace caído» y al revés) dan lo mismo.
/// - Pasado el margen, `confirmar` lo cuenta. Con `FALLOS_PARA_APAGAR` en `VENTANA_FALLOS_MS` (o uno solo justo tras una
///   pausa) empieza la pausa del escalón que toque.
/// - Todo está atado al ENLACE (sesión GATT): un enlace nuevo con el mismo par (el otro aparato reinició, se fue y volvió)
///   empieza limpio y prueba el canal enseguida.
/// - Solo en memoria. El nombre `Castigos` se conserva para no tocar a quien lo usa.
#[derive(Default, Debug)]
pub struct Castigos {
    pares: std::collections::HashMap<String, Historial>,
}

impl Castigos {
    pub fn nuevo() -> Self {
        Castigos::default()
    }

    /// El historial del par para ESTE enlace: si era de otro enlace, se olvida (sesión nueva). Devuelve si borró algo que
    /// pesaba (fallos o pausa).
    fn de_enlace(&mut self, par: &str, enlace: &str) -> (&mut Historial, bool) {
        let h = self.pares.entry(par.to_string()).or_default();
        let mut borro = false;
        if h.enlace != enlace {
            borro = h.pausa_hasta.is_some() || !h.fallos.is_empty() || !h.provisionales.is_empty() || h.escalon > 0 || h.tras_pausa;
            *h = Historial { enlace: enlace.to_string(), ..Default::default() };
        }
        (h, borro)
    }

    /// Un enlace (sesión GATT) con el par empieza o se reconoce. Si el historial era de otro enlace, se olvida y el canal se
    /// prueba ya. Devuelve true si había algo que olvidar (para decirlo en el registro).
    pub fn sesion(&mut self, par: &str, enlace: &str) -> bool {
        self.de_enlace(par, enlace).1
    }

    /// Anota un fallo del canal en ese enlace (provisional). Devuelve false si no cuenta: el enlace ya se fue.
    pub fn fallo(&mut self, par: &str, enlace: &str, ahora: u64) -> bool {
        if self.pares.get(par).is_some_and(|h| h.enlace == enlace && h.ido) {
            return false;
        }
        let (h, _) = self.de_enlace(par, enlace);
        if h.pausa_hasta.is_some_and(|t| ahora < t) {
            return false; // en pausa: lo que caiga ahora no suma
        }
        h.provisionales.push(ahora);
        true
    }

    /// El enlace entero se cayó: los fallos aún provisionales eran el otro aparato yéndose y no cuentan. Devuelve los
    /// que se descartan (momentos), para el registro. Lo que llegue después de este enlace tampoco contará.
    pub fn se_fue(&mut self, par: &str, enlace: &str, ahora: u64) -> Vec<u64> {
        let Some(h) = self.pares.get_mut(par) else { return Vec::new() };
        if h.enlace != enlace {
            return Vec::new();
        }
        h.ido = true;
        let limite = ahora.saturating_sub(GRACIA_SALIDA_MS);
        // (Uno más viejo que el margen y aún sin confirmar ya da igual: este enlace no vuelve, y el siguiente empieza limpio.)
        h.provisionales.drain(..).filter(|t| *t >= limite).collect()
    }

    /// Confirma los fallos que pasaron el margen sin que se cayera el enlace y abre las pausas que tocan.
    pub fn confirmar(&mut self, ahora: u64) -> Vec<Pausa> {
        let mut out = Vec::new();
        for (par, h) in self.pares.iter_mut() {
            if h.ido {
                continue;
            }
            let limite = ahora.saturating_sub(GRACIA_SALIDA_MS);
            let (listos, siguen): (Vec<u64>, Vec<u64>) = h.provisionales.drain(..).partition(|t| *t < limite);
            h.provisionales = siguen;
            if listos.is_empty() {
                continue;
            }
            h.fallos.extend(listos);
            h.fallos.retain(|t| ahora.saturating_sub(*t) <= VENTANA_FALLOS_MS);
            let toca = if h.tras_pausa { !h.fallos.is_empty() } else { h.fallos.len() >= FALLOS_PARA_APAGAR };
            if toca && h.pausa_hasta.is_none() {
                let ms = ESCALA_PAUSA_MS[h.escalon.min(ESCALA_PAUSA_MS.len() - 1)];
                h.escalon = h.escalon.saturating_add(1);
                out.push(Pausa { par: par.clone(), enlace: h.enlace.clone(), ms, escalon: h.escalon, fallos: h.fallos.len(), tras_pausa: h.tras_pausa });
                h.pausa_hasta = Some(ahora + ms);
                h.fallos.clear();
                h.tras_pausa = false;
            }
        }
        out.sort_by(|a, b| a.par.cmp(&b.par));
        out
    }

    /// Cuánto le queda de pausa al par en ESTE enlace (None: no está en pausa; un enlace nuevo nunca lo está).
    pub fn pausa_restante(&self, par: &str, enlace: &str, ahora: u64) -> Option<u64> {
        let h = self.pares.get(par)?;
        if h.enlace != enlace {
            return None;
        }
        h.pausa_hasta.filter(|t| ahora < *t).map(|t| t - ahora)
    }

    /// ¿En pausa en este enlace?
    pub fn apagado(&self, par: &str, enlace: &str, ahora: u64) -> bool {
        self.pausa_restante(par, enlace, ahora).is_some()
    }

    /// Las pausas que terminaron: (par, enlace). El canal vuelve a probar; un solo fallo confirmado más abre la siguiente.
    pub fn caducados(&mut self, ahora: u64) -> Vec<(String, String)> {
        let mut out = Vec::new();
        for (par, h) in self.pares.iter_mut() {
            if h.pausa_hasta.is_some_and(|t| ahora >= t) {
                h.pausa_hasta = None;
                h.tras_pausa = true;
                if !h.ido {
                    out.push((par.clone(), h.enlace.clone()));
                }
            }
        }
        out.sort();
        out
    }

    /// Un canal sano (pasó la autoprueba y vivió `CANAL_SANO_MS`): se borra la escala de pausas del par.
    pub fn sano(&mut self, par: &str, enlace: &str) {
        let (h, _) = self.de_enlace(par, enlace);
        h.provisionales.clear();
        h.fallos.clear();
        h.escalon = 0;
        h.tras_pausa = false;
        h.pausa_hasta = None;
    }

    /// Para pruebas y para el interruptor: olvida todo.
    pub fn limpiar(&mut self) {
        self.pares.clear();
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
    /// (BLE1111P) Había pasado la autoprueba (llevó tráfico del enlace).
    pub paso_prueba: bool,
}

impl Cierre {
    /// (BLE1111P) Un canal sano: pasó la autoprueba y vivió `CANAL_SANO_MS`. Borra la escala de pausas del par.
    pub fn sano(&self) -> bool {
        self.estaba_abierto && self.paso_prueba && self.vivio_ms >= CANAL_SANO_MS
    }
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
    /// (BLE1109B → BLE1111P) Este par está en pausa del canal rápido (pausa creciente, ver `Castigos`): todo sigue por GATT.
    prohibido: bool,
    /// (BLE1109B) Último momento en que llegaron bytes por el flujo (o en que abrió).
    ultimo_rx_ms: u64,
    /// (BLE1109B) Autoprueba: (nonce, desde cuándo) mientras espera el eco, y si ya la superó.
    prueba: Option<(u16, u64)>,
    prueba_ok: bool,
    ping_por_enviar: Option<u16>,
    eco_por_enviar: Option<u16>,
    /// (BLE1110A) Latido en curso: (nonce, desde cuándo) mientras espera su eco; y cuándo se mandó el último.
    latido: Option<(u16, u64)>,
    ultimo_latido_ms: u64,
    latido_n: u16,
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
            prueba: None,
            prueba_ok: false,
            ping_por_enviar: None,
            eco_por_enviar: None,
            latido: None,
            ultimo_latido_ms: 0,
            latido_n: 0,
        }
    }

    /// (BLE1109B) El enlace llegó a «ligado» por GATT: desde ahora el canal puede abrirse.
    pub fn fijar_ligado(&mut self) {
        self.ligado = true;
    }

    pub fn ligado(&self) -> bool {
        self.ligado
    }

    /// (BLE1109B → BLE1111P) Pausa del canal rápido para este par: si había uno abierto o pedido, el que llama lo cierra.
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

    /// (BLE1110A) ¿Hay que mandar un latido? Con el canal en uso y un mensaje esperando su acuse, uno cada `LATIDO_CANAL_MS`
    /// si no hay otro sin contestar. Devuelve true si deja un paquete por enviar (quien llama despierta al escritor).
    pub fn planificar_latido(&mut self, ahora: u64, pendiente: bool) -> bool {
        if !self.en_uso() || !pendiente || self.latido.is_some() || self.ping_por_enviar.is_some() {
            return false;
        }
        if ahora.saturating_sub(self.ultimo_latido_ms.max(self.abierto_ms)) < LATIDO_CANAL_MS {
            return false;
        }
        self.latido_n = self.latido_n.wrapping_add(1);
        self.latido = Some((self.latido_n, ahora));
        self.ultimo_latido_ms = ahora;
        self.ping_por_enviar = Some(self.latido_n);
        true
    }

    /// (BLE1110A) ¿Canal atascado? Solo si un latido lleva más de `PLAZO_ECO_LATIDO_MS` sin eco, no se leyó NI UN byte en
    /// ese tiempo y sigue habiendo algo esperando. Un acuse lento de la app (webview en segundo plano) ya no lo cierra.
    /// (Sustituye a «nada leído en 6 s con un mensaje esperando acuse» de BLE1109B.)
    pub fn atascado(&self, ahora: u64, pendiente: bool) -> bool {
        if self.estado != EstadoCarril::Abierto || !self.prueba_ok || !pendiente {
            return false;
        }
        match self.latido {
            Some((_, desde)) => {
                ahora.saturating_sub(desde) > PLAZO_ECO_LATIDO_MS && ahora.saturating_sub(self.ultimo_rx_ms.max(self.abierto_ms)) > PLAZO_ECO_LATIDO_MS
            }
            None => false,
        }
    }

    pub fn estado(&self) -> EstadoCarril {
        self.estado
    }

    /// (BLE1109B) El canal está abierto Y pasó la autoprueba: solo entonces los paquetes salen por él.
    pub fn en_uso(&self) -> bool {
        self.estado == EstadoCarril::Abierto && self.prueba_ok
    }

    /// (BLE1109B) Abierto, esperando el eco de la autoprueba.
    pub fn probando(&self) -> bool {
        self.estado == EstadoCarril::Abierto && !self.prueba_ok && self.prueba.is_some()
    }

    /// (BLE1109B) Empieza la autoprueba: un paquete de prueba por el canal (el otro lado lo devuelve como eco).
    pub fn iniciar_prueba(&mut self, nonce: u16, ahora: u64) {
        self.prueba = Some((nonce, ahora));
        self.prueba_ok = false;
        self.ping_por_enviar = Some(nonce);
    }

    /// (BLE1109B) El siguiente paquete de autoprueba por enviar (primero el eco que debo al otro, luego mi prueba).
    pub fn tomar_paquete_prueba(&mut self) -> Option<Vec<u8>> {
        if self.estado != EstadoCarril::Abierto {
            return None;
        }
        if let Some(n) = self.eco_por_enviar.take() {
            return Some(paquete_eco(n));
        }
        self.ping_por_enviar.take().map(paquete_prueba)
    }

    pub fn nonce_prueba(&self) -> Option<u16> {
        self.prueba.map(|(n, _)| n)
    }

    pub fn prueba_por_enviar(&self) -> bool {
        self.estado == EstadoCarril::Abierto && (self.eco_por_enviar.is_some() || self.ping_por_enviar.is_some())
    }

    /// (BLE1109B) Llegó un paquete de autoprueba. Una prueba del otro se devuelve como eco; el eco de la mía la supera
    /// (devuelve el rtt en ms). Un eco que no corresponde se ignora.
    pub fn recibir_prueba(&mut self, es_eco: bool, nonce: u16, ahora: u64) -> Option<u64> {
        if !es_eco {
            self.eco_por_enviar = Some(nonce);
            return None;
        }
        // (BLE1110A) El eco de un latido (con la autoprueba ya superada) cierra el latido.
        if self.prueba_ok && self.latido.is_some_and(|(n, _)| n == nonce) {
            self.latido = None;
            return None;
        }
        match self.prueba {
            Some((n, desde)) if n == nonce && !self.prueba_ok => {
                self.prueba_ok = true;
                Some(ahora.saturating_sub(desde))
            }
            _ => None,
        }
    }

    /// (BLE1109B) ¿Se pasó el plazo del eco?
    pub fn prueba_vencida(&self, ahora: u64) -> bool {
        self.probando() && self.prueba.is_some_and(|(_, desde)| ahora.saturating_sub(desde) > PLAZO_PRUEBA_MS)
    }

    /// (BLE1109B → BLE1111P) Terminó la pausa: el par puede volver a probar.
    pub fn permitir(&mut self) {
        self.prohibido = false;
        if self.estado == EstadoCarril::SinPsm && self.psm.is_some() {
            self.estado = EstadoCarril::Disponible;
            self.proximo_ms = 0;
        }
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
        self.prueba = None;
        self.prueba_ok = false;
        self.ping_por_enviar = None;
        self.latido = None;
        self.ultimo_latido_ms = 0;
        // (el eco debido NO se borra: el ping del otro lado puede llegar antes de que este lado note que el canal abrió)
        self.abierto_ms = ahora;
        self.ultimo_rx_ms = ahora.max(1);
    }

    /// El canal se cerró o no llegó a abrir. Vuelve a `Disponible` con la espera que toque (si había PSM).
    pub fn cerrado(&mut self, motivo: &str, ahora: u64) -> Cierre {
        let estaba_abierto = self.estado == EstadoCarril::Abierto;
        let paso_prueba = estaba_abierto && self.prueba_ok;
        let vivio_ms = if estaba_abierto { ahora.saturating_sub(self.abierto_ms) } else { 0 };
        if estaba_abierto && vivio_ms >= CANAL_ESTABLE_MS {
            self.fallos = 0;
        } else {
            self.fallos = self.fallos.saturating_add(1);
        }
        // Un canal que duró se reabre YA (fallos = 0); uno que no abrió o cayó al instante espera 0, 2, 5, 15 y 60 s.
        // (BLE1110A) Una apertura que NO llegó a abrir (macOS «Unknown error» justo tras un cierre) nunca reintenta al instante:
        // la escala empieza en 2 s. Un canal que abrió y duró poco sigue con 0, 2, 5, 15 y 60 s.
        let espera_ms = if self.fallos == 0 {
            0
        } else if estaba_abierto {
            Self::espera_para(self.fallos - 1)
        } else {
            Self::espera_para(self.fallos)
        };
        self.proximo_ms = ahora + espera_ms;
        self.prueba = None;
        self.prueba_ok = false;
        self.ping_por_enviar = None;
        self.eco_por_enviar = None;
        self.latido = None;
        self.estado = if self.psm.is_some() && !self.prohibido { EstadoCarril::Disponible } else { EstadoCarril::SinPsm };
        Cierre { motivo: motivo.chars().take(200).collect(), vivio_ms, espera_ms, estaba_abierto, paso_prueba }
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
        // No abrió: espera y vuelve a intentar con la escala 2, 5, 15, 60, 60… (BLE1110A: nunca al instante: macOS «Unknown error»).
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
        assert_eq!(esperas, vec![2_000, 5_000, 15_000, 60_000, 60_000, 60_000, 60_000]);
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
    fn canal_atascado_solo_si_el_latido_no_tiene_eco_y_no_se_lee_nada() {
        let mut c = Carril::nuevo(false);
        c.abierto(Some(0x85), 1_000);
        c.iniciar_prueba(7, 1_000);
        c.tomar_paquete_prueba();
        assert_eq!(c.recibir_prueba(true, 7, 1_001), Some(1));
        // Sin latido en curso (nada esperando, o aún no tocaba) no se juzga, por callado que esté el otro lado.
        assert!(!c.atascado(1_000 + 60_000, true), "sin latido sin eco no hay atasco: un acuse lento de la app no cuenta");
        assert!(!c.planificar_latido(1_000 + LATIDO_CANAL_MS - 1, true), "aún no toca");
        assert!(!c.planificar_latido(1_000 + LATIDO_CANAL_MS, false), "sin mensaje esperando no se manda latido");
        assert!(c.planificar_latido(1_000 + LATIDO_CANAL_MS, true));
        assert!(!c.planificar_latido(1_000 + 3 * LATIDO_CANAL_MS, true), "no se apilan latidos sin contestar");
        let t0 = 1_000 + LATIDO_CANAL_MS;
        assert!(!c.atascado(t0 + PLAZO_ECO_LATIDO_MS, true), "justo en el plazo, vivo");
        assert!(c.atascado(t0 + PLAZO_ECO_LATIDO_MS + 1, true));
        assert!(!c.atascado(t0 + PLAZO_ECO_LATIDO_MS + 1, false), "si ya no espera nada, no estorba");
        c.nota_lectura(t0 + 4_000);
        assert!(!c.atascado(t0 + PLAZO_ECO_LATIDO_MS + 1, true), "llegaron bytes hace poco: el canal lee");
        let mut cerrado = Carril::nuevo(false);
        assert!(!cerrado.atascado(u64::MAX / 2, true), "un canal que no está abierto no se vigila");
        cerrado.ofrecer_psm(0x85, 0);
        assert!(!cerrado.atascado(u64::MAX / 2, true));
    }

    #[test]
    fn el_eco_del_latido_lo_cierra_y_el_canal_nunca_se_da_por_atascado() {
        let mut a = Carril::nuevo(true);
        let mut b = Carril::nuevo(false);
        a.abierto(Some(0x85), 0);
        b.abierto(None, 0);
        a.iniciar_prueba(3, 0);
        let p = a.tomar_paquete_prueba().unwrap();
        let (_, n) = leer_prueba(&p).unwrap();
        b.recibir_prueba(false, n, 10);
        let eco = b.tomar_paquete_prueba().unwrap();
        let (es_eco, n) = leer_prueba(&eco).unwrap();
        assert!(es_eco);
        assert!(a.recibir_prueba(true, n, 20).is_some());
        // Un mensaje espera su acuse 30 s (la app del otro lado está en segundo plano): latidos y ecos cada 2 s, jamás atasco.
        let mut t = 20;
        while t < 30_000 {
            t += 500;
            if a.planificar_latido(t, true) {
                let p = a.tomar_paquete_prueba().unwrap();
                let (_, n) = leer_prueba(&p).unwrap();
                b.recibir_prueba(false, n, t);
                let e = b.tomar_paquete_prueba().unwrap();
                let (_, n) = leer_prueba(&e).unwrap();
                assert_eq!(a.recibir_prueba(true, n, t + 30), None, "el eco del latido no es una autoprueba");
            }
            assert!(!a.atascado(t, true), "t={t}");
        }
    }

    #[test]
    fn apertura_fallida_nunca_reintenta_al_instante() {
        let mut c = Carril::nuevo(true);
        c.ofrecer_psm(0x85, 0);
        c.abierto(None, 0);
        // Un canal estable que se cierra reabre ya…
        let cierre = c.cerrado("el otro aparato cerró el canal L2CAP", CANAL_ESTABLE_MS + 5);
        assert_eq!(cierre.espera_ms, 0);
        // …pero si la reapertura falla («macOS no pudo abrir el canal L2CAP: Unknown error.») espera 2 s, luego 5 s…
        assert_eq!(c.debe_abrir(CANAL_ESTABLE_MS + 5), None, "no ligado: no abre");
        let c1 = c.cerrado("macOS no pudo abrir el canal L2CAP: Unknown error.", CANAL_ESTABLE_MS + 6);
        assert!(!c1.estaba_abierto);
        assert_eq!(c1.espera_ms, ESCALA_REAPERTURA_MS[1]);
        let c2 = c.cerrado("macOS no pudo abrir el canal L2CAP: Unknown error.", CANAL_ESTABLE_MS + 7);
        assert_eq!(c2.espera_ms, ESCALA_REAPERTURA_MS[2]);
    }

    // ─────────── BLE1111P: el otro aparato yéndose no es un fallo; pausas crecientes, no una hora ───────────

    /// Lo que pasó el 2026-11-11 a las 19:05 (UTC) con la tableta reiniciando para actualizarse, en ms desde 19:04:59.470.
    #[test]
    fn el_otro_aparato_reiniciando_no_pausa_y_el_enlace_nuevo_prueba_ya() {
        let mut k = Castigos::nuevo();
        let par = "e0b9faf2";
        assert!(!k.sesion(par, "b1"), "primer enlace: nada que olvidar");
        // 19:05:08.292 el otro cerró el canal (vivió 8,9 s: no es «estable», es fallo provisional).
        assert!(k.fallo(par, "b1", 8_822));
        // 19:05:09.494 macOS no pudo reabrir («Unknown error.»).
        assert!(k.fallo(par, "b1", 10_024));
        assert!(k.confirmar(10_024).is_empty(), "dentro del margen nada se confirma");
        assert!(!k.apagado(par, "b1", 10_024));
        // 19:05:09.504 el enlace entero se cae: los dos eran el otro yéndose.
        assert_eq!(k.se_fue(par, "b1", 10_034), vec![8_822, 10_024]);
        assert!(k.confirmar(10_034 + GRACIA_SALIDA_MS + 1).is_empty(), "nada que confirmar: no hay pausa");
        assert!(!k.fallo(par, "b1", 10_040), "un cierre tardío del enlace que ya se fue no cuenta");
        // 19:05:31 vuelve con una sesión GATT nueva (b2, psm 133): limpio, el canal se prueba ya.
        k.sesion(par, "b2");
        assert_eq!(k.pausa_restante(par, "b2", 31_836), None);
        assert!(k.confirmar(40_000).is_empty());
    }

    #[test]
    fn enlace_caido_primero_y_canal_cerrado_despues_tampoco_cuenta() {
        let mut k = Castigos::nuevo();
        k.sesion("p", "b1");
        assert!(k.se_fue("p", "b1", 1_000).is_empty());
        assert!(!k.fallo("p", "b1", 1_010), "el canal se cierra después de caer el enlace: no cuenta");
        assert!(!k.fallo("p", "b1", 1_020));
        assert!(k.confirmar(100_000).is_empty());
        // Y en el orden contrario con el enlace cayendo justo al borde del margen.
        let mut k = Castigos::nuevo();
        k.fallo("p", "b1", 0);
        k.fallo("p", "b1", 1_000);
        assert_eq!(k.se_fue("p", "b1", GRACIA_SALIDA_MS), vec![0, 1_000]);
        assert!(k.confirmar(GRACIA_SALIDA_MS * 3).is_empty());
    }

    #[test]
    fn fallo_confirmado_y_enlace_que_cae_mucho_despues_si_cuenta() {
        let mut k = Castigos::nuevo();
        k.fallo("p", "b1", 0);
        assert!(k.confirmar(GRACIA_SALIDA_MS + 1).is_empty(), "uno solo no pausa");
        k.fallo("p", "b1", 20_000);
        let p = k.confirmar(20_000 + GRACIA_SALIDA_MS + 1);
        assert_eq!(p.len(), 1, "dos con el otro conectado: pausa");
        assert_eq!((p[0].ms, p[0].escalon, p[0].fallos), (ESCALA_PAUSA_MS[0], 1, 2));
        // El enlace cae luego: la pausa era de ese enlace; el siguiente empieza limpio.
        assert!(k.se_fue("p", "b1", 40_000).is_empty());
        assert!(k.sesion("p", "b2"), "había una pausa que olvidar");
        assert!(!k.apagado("p", "b2", 40_001));
    }

    #[test]
    fn canal_que_falla_de_verdad_pausas_crecientes_con_techo_y_un_canal_sano_las_borra() {
        let mut k = Castigos::nuevo();
        let mut t = 0u64;
        let mut pausas = Vec::new();
        // Primera: hacen falta 2 fallos en 10 min.
        k.fallo("p", "b1", t);
        t += 3_000;
        k.fallo("p", "b1", t);
        t += GRACIA_SALIDA_MS + 1;
        let p = k.confirmar(t);
        pausas.push(p[0].ms);
        assert!(p[0].detalle().contains("pausa de 30 s") && p[0].detalle().contains("luego se vuelve a probar solo"), "{}", p[0].detalle());
        assert!(k.apagado("p", "b1", t + p[0].ms - 1));
        assert!(!k.fallo("p", "b1", t + 1_000), "en pausa no suma");
        // Siguientes: tras cada pausa basta un fallo.
        for _ in 0..4 {
            let fin = t + *pausas.last().unwrap();
            assert!(k.caducados(fin - 1).is_empty());
            assert_eq!(k.caducados(fin), vec![("p".to_string(), "b1".to_string())]);
            assert!(!k.apagado("p", "b1", fin));
            t = fin + 500;
            k.fallo("p", "b1", t);
            t += GRACIA_SALIDA_MS + 1;
            let p = k.confirmar(t);
            assert_eq!(p.len(), 1);
            assert!(p[0].tras_pausa);
            pausas.push(p[0].ms);
        }
        assert_eq!(pausas, vec![30_000, 120_000, 600_000, 600_000, 600_000], "30 s, 2 min, 10 min y techo de 10 min");
        assert!(*pausas.iter().max().unwrap() < 60 * 60_000, "nunca una hora");
        assert_eq!(Pausa::texto_ms(120_000), "2 min");
        // Un canal sano borra la escala: hacen falta otra vez 2 fallos y la pausa vuelve a ser de 30 s.
        let fin = t + 600_000;
        k.caducados(fin);
        k.sano("p", "b1");
        k.fallo("p", "b1", fin + 1);
        assert!(k.confirmar(fin + GRACIA_SALIDA_MS + 2).is_empty(), "tras un canal sano, uno solo no pausa");
        k.fallo("p", "b1", fin + 10_000);
        let p = k.confirmar(fin + 10_000 + GRACIA_SALIDA_MS + 1);
        assert_eq!(p[0].ms, ESCALA_PAUSA_MS[0]);
        // Fuera de la ventana de 10 min el primero ya no cuenta.
        let mut k = Castigos::nuevo();
        k.fallo("q", "b9", 0);
        k.confirmar(GRACIA_SALIDA_MS + 1);
        k.fallo("q", "b9", VENTANA_FALLOS_MS + 10_000);
        assert!(k.confirmar(VENTANA_FALLOS_MS + 10_000 + GRACIA_SALIDA_MS + 1).is_empty());
        k.limpiar();
    }

    #[test]
    fn cierre_sano_solo_si_paso_la_autoprueba_y_vivio_30_s() {
        let mut c = Carril::nuevo(true);
        c.ofrecer_psm(0x85, 0);
        c.abierto(None, 0);
        assert!(!c.cerrado("x", CANAL_SANO_MS + 1).sano(), "sin autoprueba superada no estaba sano");
        c.abierto(None, 100_000);
        c.iniciar_prueba(4, 100_000);
        c.tomar_paquete_prueba();
        c.recibir_prueba(true, 4, 100_050);
        assert!(!c.clone().cerrado("x", 100_000 + CANAL_SANO_MS - 1).sano(), "vivió poco");
        let ci = c.cerrado("x", 100_000 + CANAL_SANO_MS);
        assert!(ci.sano() && ci.paso_prueba);
    }

    #[test]
    fn autoprueba_eco_en_los_dos_sentidos_y_plazo_de_3_s() {
        let (mut a, mut b) = (Carril::nuevo(true), Carril::nuevo(false));
        a.abierto(Some(0x85), 1_000);
        b.abierto(Some(0x85), 1_000);
        assert!(!a.en_uso() && !b.en_uso(), "abierto no es en uso: falta la prueba");
        a.iniciar_prueba(11, 1_000);
        b.iniciar_prueba(22, 1_000);
        assert!(a.probando() && a.prueba_por_enviar());
        // Cada lado manda su prueba; el otro la devuelve como eco.
        let pa = a.tomar_paquete_prueba().unwrap();
        let pb = b.tomar_paquete_prueba().unwrap();
        assert_eq!(leer_prueba(&pa), Some((false, 11)));
        let (e, n) = leer_prueba(&pa).unwrap();
        assert_eq!(b.recibir_prueba(e, n, 1_010), None);
        let (e, n) = leer_prueba(&pb).unwrap();
        assert_eq!(a.recibir_prueba(e, n, 1_012), None);
        let eco_b = b.tomar_paquete_prueba().unwrap();
        let eco_a = a.tomar_paquete_prueba().unwrap();
        assert_eq!(leer_prueba(&eco_b), Some((true, 11)));
        // Un eco con otro nonce no cuenta.
        assert_eq!(a.recibir_prueba(true, 99, 1_020), None);
        assert!(!a.en_uso());
        assert_eq!(a.recibir_prueba(true, 11, 1_030), Some(30));
        assert_eq!(b.recibir_prueba(true, 22, 1_031), Some(31));
        assert!(a.en_uso() && b.en_uso());
        assert_eq!(leer_prueba(&eco_a), Some((true, 22)));
        // Sin eco: vence a los 3 s.
        let mut c = Carril::nuevo(true);
        c.abierto(None, 0);
        c.iniciar_prueba(5, 0);
        assert!(!c.prueba_vencida(PLAZO_PRUEBA_MS) && c.prueba_vencida(PLAZO_PRUEBA_MS + 1));
        // Una app anterior no entiende estos paquetes: leer_paquete_max los ignora.
        assert!(crate::ble_trama::leer_paquete_max(&paquete_prueba(1), 4096).is_none());
        assert!(leer_prueba(&[1, 0, 0]).is_none() && leer_prueba(&[P_ECO, 0]).is_none());
        // Al cerrarse se olvida la prueba.
        a.cerrado("x", 5_000);
        assert!(!a.en_uso() && !a.probando());
    }
}
