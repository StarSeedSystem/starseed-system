// ═══════════════════════════════════════════════════════════════════════════
// malla_local_trama — la trama del canal local entre neuronas (2026-11-07 · MSH1107A).
// ---------------------------------------------------------------------------
// Contrato: architecture/sincronizacion-neuronas.md §2.
//
// PURO: solo std (sin serde, sin Tauri). Se prueba suelto:
//     rustc --edition 2021 --test malla_local_trama.rs && ./malla_local_trama
//
// Una trama es:   "SSM1" | versión (1 B) | tipo (1 B) | largo (4 B, big-endian) | cuerpo
// El cuerpo es texto UTF-8 con un objeto JSON (la capa TS lo firma y lo verifica: aquí solo
// se transporta). Tope de 64 KiB. Una conexión TCP lleva UN mensaje y su acuse:
//     quien envía  → trama «mensaje»
//     quien escucha → trama «acuse» {"ok":true}   (si no llega, el envío NO se da por hecho)
//
// También viven aquí, puras y probadas, la política de direcciones (solo la red local), el
// limitador por IP y el buzón con número de orden que la web vacía al arrancar.
// ═══════════════════════════════════════════════════════════════════════════

use std::collections::{HashMap, VecDeque};
use std::fmt;
use std::io::{self, Read, Write};
use std::net::Ipv4Addr;

pub const MAGIA: [u8; 4] = *b"SSM1";
pub const VERSION: u8 = 1;
/// magia (4) + versión (1) + tipo (1) + largo (4).
pub const CABECERA: usize = 10;
/// Tope del cuerpo de una trama (una solicitud de sincronización firmada ocupa ~1 KiB).
/// CIF1108A: 96 KiB (antes 64). La trama cifrada de punta a punta pesa 4/3 del claro; con 96 KiB el trozo
/// de archivo cifrado (~51 KiB) supera al de antes (46 KiB claros). Es compatible: cada app ANUNCIA el
/// suyo en `malla_local_estado` y en su saludo firmado (`lim.max_cuerpo`), y la web manda a cada una
/// como máximo min(tope propio, tope del otro); una app anterior (sin anuncio) sigue en 64 KiB.
pub const MAX_CUERPO: usize = 96 * 1024;
/// El tope que asume la web de una app anterior (que no lo anuncia).
pub const MAX_CUERPO_ANTERIOR: usize = 64 * 1024;
/// Puerto TCP del canal local: el del faro UDP (47070) + 1. `malla_local.rs` lo comprueba al compilar.
pub const PUERTO: u16 = 47071;
/// Cuerpo del acuse.
pub const ACUSE_OK: &str = "{\"ok\":true}";
/// Mensajes que el oyente admite de cada IP por ventana. 300 cada 10 s (MLT1107A): el canal ya no
/// lleva solo la sincronización, también los trozos de archivo de las neuronas vinculadas (dos de
/// 16 KiB en base64 por trama). La app anterior admitía 30; la web lee los límites con
/// `malla_local_estado`, los anuncia en su saludo y nunca manda más del 90 % del cupo del otro
/// (`src/lib/malla/red-local-nativa.ts`). El tope de conexiones a la vez y de tiempo por conexión
/// siguen igual.
pub const LIMITE_MENSAJES: u32 = 300;
pub const LIMITE_VENTANA_MS: u64 = 10_000;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TipoTrama {
    Mensaje = 1,
    Acuse = 2,
}

impl TipoTrama {
    pub fn desde_u8(v: u8) -> Option<Self> {
        match v {
            1 => Some(TipoTrama::Mensaje),
            2 => Some(TipoTrama::Acuse),
            _ => None,
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum ErrorTrama {
    Magia,
    Version(u8),
    Tipo(u8),
    Vacio,
    Largo(usize),
    NoUtf8,
    NoJson,
    TipoInesperado,
    TiempoAgotado,
    Cerrada,
    Io(String),
}

impl fmt::Display for ErrorTrama {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ErrorTrama::Magia => write!(f, "no es una trama StarSeed"),
            ErrorTrama::Version(v) => write!(f, "versión de trama {v} desconocida (esta app habla la {VERSION})"),
            ErrorTrama::Tipo(t) => write!(f, "tipo de trama {t} desconocido"),
            ErrorTrama::Vacio => write!(f, "trama vacía"),
            ErrorTrama::Largo(n) => write!(f, "trama de {n} bytes: el tope es {MAX_CUERPO}"),
            ErrorTrama::NoUtf8 => write!(f, "el cuerpo no es texto UTF-8"),
            ErrorTrama::NoJson => write!(f, "el cuerpo no es un objeto JSON"),
            ErrorTrama::TipoInesperado => write!(f, "llegó una trama de otro tipo"),
            ErrorTrama::TiempoAgotado => write!(f, "tiempo agotado esperando a la otra neurona"),
            ErrorTrama::Cerrada => write!(f, "la otra neurona cerró la conexión sin responder"),
            ErrorTrama::Io(e) => write!(f, "fallo de red: {e}"),
        }
    }
}

impl From<io::Error> for ErrorTrama {
    fn from(e: io::Error) -> Self {
        match e.kind() {
            io::ErrorKind::WouldBlock | io::ErrorKind::TimedOut => ErrorTrama::TiempoAgotado,
            io::ErrorKind::UnexpectedEof => ErrorTrama::Cerrada,
            _ => ErrorTrama::Io(e.to_string()),
        }
    }
}

/// Un cuerpo válido: no vacío, ≤ tope y con forma de objeto JSON (la capa TS lo parsea de verdad).
pub fn validar_cuerpo(cuerpo: &str) -> Result<(), ErrorTrama> {
    let t = cuerpo.trim();
    if t.is_empty() {
        return Err(ErrorTrama::Vacio);
    }
    if cuerpo.len() > MAX_CUERPO {
        return Err(ErrorTrama::Largo(cuerpo.len()));
    }
    if !(t.starts_with('{') && t.ends_with('}')) {
        return Err(ErrorTrama::NoJson);
    }
    Ok(())
}

pub fn codificar(tipo: TipoTrama, cuerpo: &str) -> Result<Vec<u8>, ErrorTrama> {
    validar_cuerpo(cuerpo)?;
    let b = cuerpo.as_bytes();
    let mut v = Vec::with_capacity(CABECERA + b.len());
    v.extend_from_slice(&MAGIA);
    v.push(VERSION);
    v.push(tipo as u8);
    v.extend_from_slice(&(b.len() as u32).to_be_bytes());
    v.extend_from_slice(b);
    Ok(v)
}

/// Lee la cabecera: tipo y largo del cuerpo (ya comprobado contra el tope).
pub fn leer_cabecera(c: &[u8; CABECERA]) -> Result<(TipoTrama, usize), ErrorTrama> {
    if c[0..4] != MAGIA {
        return Err(ErrorTrama::Magia);
    }
    if c[4] != VERSION {
        return Err(ErrorTrama::Version(c[4]));
    }
    let tipo = TipoTrama::desde_u8(c[5]).ok_or(ErrorTrama::Tipo(c[5]))?;
    let largo = u32::from_be_bytes([c[6], c[7], c[8], c[9]]) as usize;
    if largo == 0 {
        return Err(ErrorTrama::Vacio);
    }
    if largo > MAX_CUERPO {
        return Err(ErrorTrama::Largo(largo));
    }
    Ok((tipo, largo))
}

#[derive(Debug, PartialEq, Eq)]
pub struct Trama {
    pub tipo: TipoTrama,
    pub cuerpo: String,
}

/// Lee UNA trama. Nunca reserva más del tope aunque la cabecera mienta.
pub fn leer_trama<R: Read>(r: &mut R) -> Result<Trama, ErrorTrama> {
    let mut c = [0u8; CABECERA];
    r.read_exact(&mut c)?;
    let (tipo, largo) = leer_cabecera(&c)?;
    let mut b = vec![0u8; largo];
    r.read_exact(&mut b)?;
    let cuerpo = String::from_utf8(b).map_err(|_| ErrorTrama::NoUtf8)?;
    validar_cuerpo(&cuerpo)?;
    Ok(Trama { tipo, cuerpo })
}

pub fn escribir_trama<W: Write>(w: &mut W, tipo: TipoTrama, cuerpo: &str) -> Result<(), ErrorTrama> {
    let datos = codificar(tipo, cuerpo)?;
    w.write_all(&datos)?;
    w.flush()?;
    Ok(())
}

/// Lado que ESCUCHA: lee un mensaje (no acusa todavía: quien llama lo guarda y luego acusa).
pub fn leer_mensaje<R: Read>(r: &mut R) -> Result<String, ErrorTrama> {
    let t = leer_trama(r)?;
    if t.tipo != TipoTrama::Mensaje {
        return Err(ErrorTrama::TipoInesperado);
    }
    Ok(t.cuerpo)
}

/// Lado que ESCUCHA: confirma que el mensaje quedó guardado.
pub fn acusar<W: Write>(w: &mut W) -> Result<(), ErrorTrama> {
    escribir_trama(w, TipoTrama::Acuse, ACUSE_OK)
}

/// Lado que ENVÍA: escribe el mensaje y espera el acuse. Sin acuse, el envío NO se da por hecho.
pub fn enviar_y_esperar<S: Read + Write>(s: &mut S, cuerpo: &str) -> Result<(), ErrorTrama> {
    escribir_trama(s, TipoTrama::Mensaje, cuerpo)?;
    let a = leer_trama(s)?;
    if a.tipo != TipoTrama::Acuse {
        return Err(ErrorTrama::TipoInesperado);
    }
    Ok(())
}

// ─────────────────────────── Política de direcciones ───────────────────────────

/// Solo direcciones de la RED LOCAL (privadas o de enlace local). El canal nunca habla con
/// internet: así la web no puede usar la app para conectar con cualquier máquina.
pub fn ip_local(texto: &str) -> Option<Ipv4Addr> {
    let ip: Ipv4Addr = texto.trim().parse().ok()?;
    (ip.is_private() || ip.is_link_local()).then_some(ip)
}

/// Puertos de usuario (≥ 1024): nunca servicios del sistema.
pub fn puerto_valido(p: u16) -> bool {
    p >= 1024
}

// ─────────────────────────────── Limitador ───────────────────────────────

/// Como mucho `max` mensajes por `ventana_ms` desde cada IP (quien inunde el puerto se queda fuera).
pub struct Limitador {
    max: u32,
    ventana_ms: u64,
    cuentas: HashMap<String, (u64, u32)>,
}

impl Limitador {
    pub fn nuevo(max: u32, ventana_ms: u64) -> Self {
        Limitador { max, ventana_ms: ventana_ms.max(1), cuentas: HashMap::new() }
    }

    pub fn permitir(&mut self, clave: &str, ahora_ms: u64) -> bool {
        let ventana = self.ventana_ms;
        if self.cuentas.len() > 512 {
            self.cuentas.retain(|_, (inicio, _)| ahora_ms.saturating_sub(*inicio) < ventana);
        }
        let e = self.cuentas.entry(clave.to_string()).or_insert((ahora_ms, 0));
        if ahora_ms.saturating_sub(e.0) >= ventana {
            *e = (ahora_ms, 0);
        }
        if e.1 >= self.max {
            return false;
        }
        e.1 += 1;
        true
    }
}

// ─────────────────────────────── Buzón ───────────────────────────────

/// Un mensaje recibido, con su número de orden (la web pide «lo que llegó después del N»).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Recibido {
    pub seq: u64,
    pub ip: String,
    pub cuerpo: String,
    pub recibido_ms: u64,
}

/// Últimos mensajes recibidos (anillo): lo que llegó antes de que la web escuchara no se pierde.
pub struct Buzon {
    cap: usize,
    ultimo: u64,
    items: VecDeque<Recibido>,
}

impl Buzon {
    pub fn nuevo(cap: usize) -> Self {
        Buzon { cap: cap.max(1), ultimo: 0, items: VecDeque::new() }
    }

    pub fn poner(&mut self, ip: &str, cuerpo: String, ahora_ms: u64) -> Recibido {
        self.ultimo += 1;
        let r = Recibido { seq: self.ultimo, ip: ip.to_string(), cuerpo, recibido_ms: ahora_ms };
        if self.items.len() >= self.cap {
            self.items.pop_front();
        }
        self.items.push_back(r.clone());
        r
    }

    /// Los posteriores a `seq` que no tengan más de `max_edad_ms`.
    pub fn desde(&self, seq: u64, ahora_ms: u64, max_edad_ms: u64) -> Vec<Recibido> {
        self.items
            .iter()
            .filter(|r| r.seq > seq && ahora_ms.saturating_sub(r.recibido_ms) <= max_edad_ms)
            .cloned()
            .collect()
    }

    pub fn ultimo(&self) -> u64 {
        self.ultimo
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use std::io::Cursor;
    use std::net::{TcpListener, TcpStream};
    use std::time::Duration;

    const JSON: &str = "{\"t\":\"tu.msg\",\"c\":\"sync\"}";

    #[test]
    fn ida_y_vuelta() {
        let b = codificar(TipoTrama::Mensaje, JSON).unwrap();
        assert_eq!(&b[0..4], b"SSM1");
        assert_eq!(b.len(), CABECERA + JSON.len());
        let t = leer_trama(&mut Cursor::new(b)).unwrap();
        assert_eq!(t, Trama { tipo: TipoTrama::Mensaje, cuerpo: JSON.to_string() });
    }

    #[test]
    fn rechaza_basura() {
        let buena = codificar(TipoTrama::Mensaje, JSON).unwrap();
        let mut b = buena.clone();
        b[0] = b'X';
        assert_eq!(leer_trama(&mut Cursor::new(b)), Err(ErrorTrama::Magia));
        let mut b = buena.clone();
        b[4] = 9;
        assert_eq!(leer_trama(&mut Cursor::new(b)), Err(ErrorTrama::Version(9)));
        let mut b = buena.clone();
        b[5] = 7;
        assert_eq!(leer_trama(&mut Cursor::new(b)), Err(ErrorTrama::Tipo(7)));
        let mut b = buena.clone();
        b[6..10].copy_from_slice(&0u32.to_be_bytes());
        assert_eq!(leer_trama(&mut Cursor::new(b)), Err(ErrorTrama::Vacio));
        let mut b = buena.clone();
        b[6..10].copy_from_slice(&(u32::MAX).to_be_bytes());
        assert_eq!(leer_trama(&mut Cursor::new(b)), Err(ErrorTrama::Largo(u32::MAX as usize)), "la cabecera no puede pedir 4 GiB");
        let mut b = buena[..CABECERA].to_vec();
        b[6..10].copy_from_slice(&2u32.to_be_bytes());
        b.extend_from_slice(&[0xff, 0xfe]);
        assert_eq!(leer_trama(&mut Cursor::new(b)), Err(ErrorTrama::NoUtf8));
        let mut b = buena[..CABECERA].to_vec();
        b[6..10].copy_from_slice(&4u32.to_be_bytes());
        b.extend_from_slice(b"hola");
        assert_eq!(leer_trama(&mut Cursor::new(b)), Err(ErrorTrama::NoJson));
        assert_eq!(leer_trama(&mut Cursor::new(&buena[..buena.len() - 3])), Err(ErrorTrama::Cerrada), "trama cortada");
        assert_eq!(leer_trama(&mut Cursor::new(Vec::<u8>::new())), Err(ErrorTrama::Cerrada));
    }

    /// CIF1108A: el tope nuevo (96 KiB) vale en los dos sentidos y por TCP de verdad; la app anterior
    /// (64 KiB) quedaría por debajo, así que la web debe pedirle ≤ 64 KiB (`MAX_CUERPO_ANTERIOR`).
    #[test]
    fn el_tope_de_96_kib_vale_en_los_dos_sentidos() {
        assert_eq!(MAX_CUERPO, 96 * 1024);
        assert!(MAX_CUERPO > MAX_CUERPO_ANTERIOR);
        let justo = format!("{{\"x\":\"{}\"}}", "a".repeat(MAX_CUERPO - 8));
        assert_eq!(justo.len(), MAX_CUERPO);
        let t = leer_trama(&mut Cursor::new(codificar(TipoTrama::Mensaje, &justo).unwrap())).unwrap();
        assert_eq!(t.cuerpo.len(), MAX_CUERPO);
        // Uno más: se rechaza al codificar y, si alguien lo fabrica a mano, al leer la cabecera.
        let pasado = format!("{{\"x\":\"{}\"}}", "a".repeat(MAX_CUERPO - 7));
        assert_eq!(codificar(TipoTrama::Mensaje, &pasado), Err(ErrorTrama::Largo(MAX_CUERPO + 1)));
        let mut cab = [0u8; CABECERA];
        cab[0..4].copy_from_slice(&MAGIA);
        cab[4] = VERSION;
        cab[5] = TipoTrama::Mensaje as u8;
        cab[6..10].copy_from_slice(&((MAX_CUERPO + 1) as u32).to_be_bytes());
        assert_eq!(leer_cabecera(&cab), Err(ErrorTrama::Largo(MAX_CUERPO + 1)));
        // Un cuerpo de 80 KiB (más que el tope anterior) cruza una conexión TCP local con su acuse.
        let ochenta = format!("{{\"x\":\"{}\"}}", "b".repeat(80 * 1024));
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let puerto = l.local_addr().unwrap().port();
        let c = ochenta.clone();
        let h = std::thread::spawn(move || {
            let mut s = TcpStream::connect(("127.0.0.1", puerto)).unwrap();
            s.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
            enviar_y_esperar(&mut s, &c)
        });
        let (mut srv, _) = l.accept().unwrap();
        srv.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
        assert_eq!(leer_mensaje(&mut srv).unwrap(), ochenta);
        acusar(&mut srv).unwrap();
        assert!(h.join().unwrap().is_ok());
    }

    #[test]
    fn el_cuerpo_tiene_tope_y_forma() {
        assert_eq!(codificar(TipoTrama::Mensaje, "   "), Err(ErrorTrama::Vacio));
        assert_eq!(codificar(TipoTrama::Mensaje, "[1,2]"), Err(ErrorTrama::NoJson));
        let grande = format!("{{\"x\":\"{}\"}}", "a".repeat(MAX_CUERPO));
        assert_eq!(codificar(TipoTrama::Mensaje, &grande), Err(ErrorTrama::Largo(grande.len())));
        let justo = format!("{{\"x\":\"{}\"}}", "a".repeat(MAX_CUERPO - 8));
        assert_eq!(justo.len(), MAX_CUERPO);
        assert!(codificar(TipoTrama::Mensaje, &justo).is_ok());
    }

    #[test]
    fn solo_la_red_local() {
        for ok in ["192.168.1.5", "10.0.0.2", "172.16.5.4", "172.31.255.1", "169.254.10.1", " 192.168.0.9 "] {
            assert!(ip_local(ok).is_some(), "{ok} es de la red local");
        }
        for no in ["8.8.8.8", "127.0.0.1", "0.0.0.0", "172.32.0.1", "255.255.255.255", "hola", "", "::1", "fe80::1", "192.168.1.300"] {
            assert!(ip_local(no).is_none(), "{no} no es de la red local");
        }
        assert!(puerto_valido(PUERTO));
        assert!(!puerto_valido(22));
    }

    #[test]
    fn limitador_por_ip() {
        let mut l = Limitador::nuevo(3, 1_000);
        assert!(l.permitir("192.168.1.5", 0));
        assert!(l.permitir("192.168.1.5", 10));
        assert!(l.permitir("192.168.1.5", 20));
        assert!(!l.permitir("192.168.1.5", 30), "el cuarto en la ventana se rechaza");
        assert!(l.permitir("192.168.1.6", 30), "otra IP no comparte cupo");
        assert!(l.permitir("192.168.1.5", 1_000), "ventana nueva");
    }

    #[test]
    fn buzon_con_orden_y_edad() {
        let mut b = Buzon::nuevo(2);
        assert_eq!(b.poner("192.168.1.5", "{\"a\":1}".into(), 100).seq, 1);
        assert_eq!(b.poner("192.168.1.5", "{\"a\":2}".into(), 200).seq, 2);
        assert_eq!(b.poner("192.168.1.6", "{\"a\":3}".into(), 300).seq, 3);
        assert_eq!(b.ultimo(), 3);
        let todo = b.desde(0, 300, 10_000);
        assert_eq!(todo.iter().map(|r| r.seq).collect::<Vec<_>>(), vec![2, 3], "el más viejo salió del anillo");
        assert_eq!(b.desde(2, 300, 10_000).len(), 1);
        assert!(b.desde(0, 20_000, 10_000).is_empty(), "los caducados no se devuelven");
    }

    #[test]
    fn conversacion_por_tcp_con_acuse() {
        let oyente = TcpListener::bind("127.0.0.1:0").unwrap();
        let dir = oyente.local_addr().unwrap();
        let servidor = std::thread::spawn(move || {
            let (mut s, _) = oyente.accept().unwrap();
            s.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
            let cuerpo = leer_mensaje(&mut s).unwrap();
            acusar(&mut s).unwrap();
            cuerpo
        });
        let mut c = TcpStream::connect(dir).unwrap();
        c.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
        enviar_y_esperar(&mut c, JSON).unwrap();
        assert_eq!(servidor.join().unwrap(), JSON);
    }

    #[test]
    fn sin_acuse_no_hay_envio() {
        let oyente = TcpListener::bind("127.0.0.1:0").unwrap();
        let dir = oyente.local_addr().unwrap();
        let servidor = std::thread::spawn(move || {
            let (mut s, _) = oyente.accept().unwrap();
            let _ = leer_mensaje(&mut s);
            std::thread::sleep(Duration::from_millis(400)); // lee y nunca acusa
        });
        let mut c = TcpStream::connect(dir).unwrap();
        c.set_read_timeout(Some(Duration::from_millis(150))).unwrap();
        assert_eq!(enviar_y_esperar(&mut c, JSON), Err(ErrorTrama::TiempoAgotado));
        servidor.join().unwrap();
    }

    /// Lo que manda la web (MLT1107A): un `nl.lote` con dos trozos de archivo de 16 KiB en base64
    /// (`archivo.chunk` de archivos-malla.ts) cabe en una trama, con el margen que deja la web.
    #[test]
    fn dos_trozos_de_archivo_caben_en_una_trama() {
        let b64 = "A".repeat(4 * ((16 * 1024 + 2) / 3));
        let trozo = format!("{{\"t\":\"archivo.chunk\",\"id\":\"{}\",\"index\":12345,\"datosB64\":\"{b64}\"}}", "f".repeat(36));
        let escapado = trozo.replace('"', "\\\"");
        let lote = format!("{{\"t\":\"nl.lote\",\"m\":[\"{escapado}\",\"{escapado}\"]}}");
        assert!(lote.len() <= MAX_CUERPO - 512, "{} B no deja el margen de la web", lote.len());
        let t = leer_trama(&mut Cursor::new(codificar(TipoTrama::Mensaje, &lote).unwrap())).unwrap();
        assert_eq!(t.cuerpo, lote);
    }

    #[test]
    fn el_limitador_deja_pasar_archivos_y_corta_la_inundacion() {
        assert!(LIMITE_MENSAJES >= 30, "nunca menos que la app anterior");
        let mut l = Limitador::nuevo(LIMITE_MENSAJES, LIMITE_VENTANA_MS);
        for i in 0..LIMITE_MENSAJES {
            assert!(l.permitir("192.168.1.5", u64::from(i)), "el mensaje {i} cabe en la ventana");
        }
        assert!(!l.permitir("192.168.1.5", 9_999), "uno más en la misma ventana se corta");
        assert!(l.permitir("192.168.1.5", LIMITE_VENTANA_MS), "ventana nueva");
    }

    #[test]
    fn mensaje_en_vez_de_acuse_es_error() {
        let mut ida_vuelta = Cursor::new(codificar(TipoTrama::Mensaje, JSON).unwrap());
        assert_eq!(leer_mensaje(&mut ida_vuelta), Ok(JSON.to_string()));
        let mut acuse = Cursor::new(codificar(TipoTrama::Acuse, ACUSE_OK).unwrap());
        assert_eq!(leer_mensaje(&mut acuse), Err(ErrorTrama::TipoInesperado));
        assert!(ErrorTrama::Largo(5).to_string().contains("tope"));
    }
}
