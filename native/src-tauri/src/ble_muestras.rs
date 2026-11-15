// BLE1115C · las medidas del enlace Bluetooth que sobreviven a la llamada que miden. Lógica PURA y probada.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// Caso real del 15-11: durante una llamada de 2 min por Bluetooth (sin IP) no llegó al Mac NI UNA línea `ble-enlace` de la
// tableta. Las líneas se anotaban cada 5 s en el registro nativo, pero el espejo del registro (web, `espejarRegistro`) calla
// mientras hay voz o vídeo en cola, y al volver solo manda lo nuevo, de 50 líneas y ~3,5 KB como mucho, recortando por
// el principio. Aquí cada enlace guarda sus muestras de 5 s en un búfer acotado (20 min; las más viejas caen y se cuentan) y,
// cuando el enlace queda quieto (o se cae), las convierte en UNA línea de resumen más las muestras en forma compacta, escritas
// al final: el espejo corta por el principio, así el resumen es lo último que se pierde. El tope de línea del espejo (240) lo
// sube la web solo para estas dos clases de línea (`canal-rapido-ajuste.ts`).

#![allow(dead_code)]

use std::collections::VecDeque;

/// 20 min de ventanas de 5 s.
pub const MUESTRAS_MAX: usize = 240;
/// Sin muestra nueva en este tiempo (dos ventanas y media) el enlace está quieto: se resume lo guardado.
pub const QUIETO_MS: u64 = 12_000;
/// Hasta tantas muestras salen en las líneas compactas (más: se tomaba una de cada `paso`); el espejo acota por bytes.
pub const MUESTRAS_EN_LINEAS: usize = 200;
/// Muestras por línea compacta (≈ 12 caracteres cada una: 20 caben en 480 con el prefijo).
pub const MUESTRAS_POR_LINEA: usize = 20;
/// Tipos de línea que escribe el registro nativo (la web los reconoce por estos nombres).
pub const TIPO_RESUMEN: &str = "ble-enlace-llamada";
pub const TIPO_MUESTRAS: &str = "ble-enlace-muestras";

#[derive(Clone, Debug, PartialEq)]
pub struct Muestra {
    pub t_ms: u64,
    pub escrituras_s: f64,
    pub bytes_escritura: u64,
    pub ms_puente: Option<f64>,
    pub ms_socket: Option<f64>,
    pub ms_acuse: Option<u64>,
}

#[derive(Clone, Debug, Default)]
pub struct Diario {
    muestras: VecDeque<Muestra>,
    perdidas: u64,
    phy: Option<String>,
    /// La radio nativa (Android) manda sus propias ventanas: entonces el núcleo no muestrea por su cuenta.
    pub con_radio: bool,
    /// Para muestrear por el núcleo (macOS): contadores y hora de la última ventana.
    pub previo_bytes: u64,
    pub previo_mensajes: u64,
    pub previo_t_ms: u64,
}

/// Lo que pasa de un enlace a las líneas: el diario ya vaciado.
#[derive(Clone, Debug, PartialEq)]
pub struct Informe {
    pub muestras: Vec<Muestra>,
    pub perdidas: u64,
    pub phy: Option<String>,
}

impl Diario {
    pub fn empujar(&mut self, m: Muestra, phy: Option<String>) {
        if phy.is_some() {
            self.phy = phy;
        }
        self.muestras.push_back(m);
        while self.muestras.len() > MUESTRAS_MAX {
            self.muestras.pop_front();
            self.perdidas += 1;
        }
    }

    pub fn len(&self) -> usize {
        self.muestras.len()
    }

    pub fn ultima_ms(&self) -> Option<u64> {
        self.muestras.back().map(|m| m.t_ms)
    }

    /// ¿Hay algo guardado y lleva quieto el tiempo debido?
    pub fn quieto(&self, ahora: u64) -> bool {
        self.ultima_ms().is_some_and(|u| ahora.saturating_sub(u) >= QUIETO_MS)
    }

    /// Vacía el diario (las pérdidas se cuentan por llamada: vuelven a cero).
    pub fn tomar(&mut self) -> Option<Informe> {
        if self.muestras.is_empty() {
            return None;
        }
        let i = Informe { muestras: self.muestras.drain(..).collect(), perdidas: self.perdidas, phy: self.phy.clone() };
        self.perdidas = 0;
        Some(i)
    }
}

fn decimas(x: f64) -> f64 {
    (x * 10.0).round() / 10.0
}

fn mediana(v: &mut [f64]) -> f64 {
    v.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let n = v.len();
    if n % 2 == 1 {
        v[n / 2]
    } else {
        (v[n / 2 - 1] + v[n / 2]) / 2.0
    }
}

fn media_opcional(v: impl Iterator<Item = Option<f64>>) -> Option<f64> {
    let mut x: Vec<f64> = v.flatten().collect();
    if x.is_empty() {
        None
    } else {
        Some(decimas(mediana(&mut x)))
    }
}

fn texto(x: Option<f64>) -> String {
    x.map(|v| v.to_string()).unwrap_or_else(|| "-".into())
}

/// La línea de resumen. Lo que la plataforma no da va como «-» (nunca se inventa).
/// `intervalo` es el del enlace si la plataforma lo da (ni Android ni CoreBluetooth lo dan a una app: «-»).
#[allow(clippy::too_many_arguments)]
pub fn resumen(i: &Informe, mtu: usize, rol: &str, intervalo: Option<u64>, fuente: &str) -> String {
    let n = i.muestras.len();
    let t0 = i.muestras.first().map(|m| m.t_ms).unwrap_or(0);
    let t1 = i.muestras.last().map(|m| m.t_ms).unwrap_or(0);
    // El primer ciclo empezó una ventana (5 s) antes de su primera muestra.
    let dur = (t1.saturating_sub(t0) / 1000) + 5;
    let esc: Vec<f64> = i.muestras.iter().map(|m| m.escrituras_s).collect();
    let (emin, emax) = esc.iter().fold((f64::MAX, f64::MIN), |(a, b), &x| (a.min(x), b.max(x)));
    let emed = mediana(&mut esc.clone());
    let mut bytes: Vec<f64> = i.muestras.iter().map(|m| m.bytes_escritura as f64).collect();
    let bmed = mediana(&mut bytes).round() as u64;
    let mut ac: Vec<u64> = i.muestras.iter().filter_map(|m| m.ms_acuse).collect();
    ac.sort_unstable();
    let acuse = if ac.is_empty() {
        "-".to_string()
    } else {
        let med = if ac.len() % 2 == 0 { (ac[ac.len() / 2 - 1] + ac[ac.len() / 2]) / 2 } else { ac[ac.len() / 2] };
        let p95 = ac[(((ac.len() as f64) * 0.95).ceil() as usize).clamp(1, ac.len()) - 1];
        format!("{}/{}/{}/{}", ac[0], med, p95, ac[ac.len() - 1])
    };
    format!(
        "n={n} dur-s={dur} escrituras/s={}/{}/{} bytes/escritura={bmed} ms-acuse={acuse} ms-puente={} ms-socket={} intervalo={} phy={} mtu={mtu} rol={rol} perdidas={} fuente={fuente}",
        decimas(emin),
        decimas(emed),
        decimas(emax),
        texto(media_opcional(i.muestras.iter().map(|m| m.ms_puente))),
        texto(media_opcional(i.muestras.iter().map(|m| m.ms_socket))),
        intervalo.map(|v| format!("{v}ms")).unwrap_or_else(|| "-".into()),
        i.phy.as_deref().unwrap_or("-"),
        i.perdidas,
    )
}

fn hora(t_ms: u64) -> String {
    let s = (t_ms / 1000) % 86_400;
    format!("{:02}:{:02}:{:02}", s / 3600, (s / 60) % 60, s % 60)
}

/// Las muestras en forma compacta: `t0=05:25:07 paso=5 m=12.4/138/49;…` (escrituras/s, bytes/escritura, ms de acuse; «-» sin acuse).
/// Con más de `MUESTRAS_EN_LINEAS` se toma una de cada `k` (y `paso` lo dice). Las más viejas primero: el RESUMEN se escribe
/// después, porque el espejo corta por el principio.
pub fn lineas_de_muestras(i: &Informe) -> Vec<String> {
    let k = i.muestras.len().div_ceil(MUESTRAS_EN_LINEAS).max(1);
    let tomadas: Vec<&Muestra> = i.muestras.iter().step_by(k).collect();
    tomadas
        .chunks(MUESTRAS_POR_LINEA)
        .map(|c| {
            let m: Vec<String> = c.iter().map(|m| format!("{}/{}/{}", m.escrituras_s, m.bytes_escritura, m.ms_acuse.map(|a| a.to_string()).unwrap_or_else(|| "-".into()))).collect();
            format!("t0={} paso={} m={}", hora(c[0].t_ms), 5 * k, m.join(";"))
        })
        .collect()
}

/// Todo lo que se escribe, en orden: `(tipo, detalle)`; las muestras primero y el resumen al final.
pub fn lineas_de_llamada(i: &Informe, mtu: usize, rol: &str, intervalo: Option<u64>, fuente: &str) -> Vec<(&'static str, String)> {
    let mut v: Vec<(&'static str, String)> = lineas_de_muestras(i).into_iter().map(|l| (TIPO_MUESTRAS, l)).collect();
    v.push((TIPO_RESUMEN, resumen(i, mtu, rol, intervalo, fuente)));
    v
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn m(t: u64, e: f64, b: u64, a: Option<u64>) -> Muestra {
        Muestra { t_ms: t, escrituras_s: e, bytes_escritura: b, ms_puente: Some(0.2), ms_socket: Some(0.5), ms_acuse: a }
    }

    #[test]
    fn el_diario_es_acotado_y_cuenta_lo_que_tira() {
        let mut d = Diario::default();
        for i in 0..(MUESTRAS_MAX as u64 + 7) {
            d.empujar(m(i * 5000, 1.0, 100, None), Some("2M".into()));
        }
        assert_eq!(d.len(), MUESTRAS_MAX);
        let i = d.tomar().unwrap();
        assert_eq!(i.perdidas, 7);
        assert_eq!(i.muestras[0].t_ms, 7 * 5000, "caen las más viejas");
        assert_eq!(d.len(), 0);
        assert!(d.tomar().is_none());
        d.empujar(m(1, 1.0, 1, None), None);
        assert_eq!(d.tomar().unwrap().perdidas, 0, "las pérdidas se cuentan por llamada");
    }

    #[test]
    fn quieto_solo_con_algo_guardado_y_pasado_el_tiempo() {
        let mut d = Diario::default();
        assert!(!d.quieto(1_000_000));
        d.empujar(m(100_000, 1.0, 1, None), None);
        assert!(!d.quieto(100_000 + QUIETO_MS - 1));
        assert!(d.quieto(100_000 + QUIETO_MS));
    }

    #[test]
    fn el_resumen_dice_minimo_mediana_y_maximo_y_no_inventa() {
        let mut d = Diario::default();
        let acuses = [Some(40u64), Some(55), Some(300), None, Some(410)];
        for (i, a) in acuses.iter().enumerate() {
            d.empujar(m(1_000_000 + i as u64 * 5000, 2.0 + i as f64, 100 + i as u64, *a), if i == 0 { Some("2M".into()) } else { None });
        }
        let r = resumen(&d.tomar().unwrap(), 515, "periferico", None, "radio");
        assert!(r.starts_with("n=5 dur-s=25 escrituras/s=2/4/6 bytes/escritura=102 ms-acuse=40/177/410/410 "), "{r}");
        assert!(r.contains("ms-puente=0.2 ms-socket=0.5 intervalo=- phy=2M mtu=515 rol=periferico perdidas=0 fuente=radio"), "{r}");
    }

    #[test]
    fn sin_acuses_ni_medidas_van_guiones() {
        let mut d = Diario::default();
        d.empujar(Muestra { t_ms: 5000, escrituras_s: 3.0, bytes_escritura: 10, ms_puente: None, ms_socket: None, ms_acuse: None }, None);
        let r = resumen(&d.tomar().unwrap(), 23, "central", None, "nucleo");
        assert!(r.contains("ms-acuse=- ms-puente=- ms-socket=- intervalo=- phy=- mtu=23 rol=central"), "{r}");
    }

    #[test]
    fn las_muestras_van_antes_que_el_resumen_y_caben_en_lineas_cortas() {
        let mut d = Diario::default();
        for i in 0..24u64 {
            d.empujar(m(1_000_000 + i * 5000, 12.4, 138, Some(49)), None);
        }
        let l = lineas_de_llamada(&d.tomar().unwrap(), 515, "periferico", None, "radio");
        assert_eq!(l.len(), 3, "24 muestras = 2 líneas + resumen");
        assert_eq!(l[0].0, TIPO_MUESTRAS);
        assert_eq!(l[2].0, TIPO_RESUMEN, "el resumen, lo último");
        assert!(l[0].1.starts_with("t0=") && l[0].1.contains(" paso=5 m=12.4/138/49;12.4/138/49"), "{}", l[0].1);
        assert!(l[0].1.len() <= 330, "{}", l[0].1.len());
        assert!(l[2].1.len() <= 240, "{}", l[2].1.len());
    }

    #[test]
    fn veinte_minutos_se_aclaran_para_caber_en_el_espejo() {
        let mut d = Diario::default();
        for i in 0..MUESTRAS_MAX as u64 {
            d.empujar(m(i * 5000, 9.0, 140, Some(60)), None);
        }
        let i = d.tomar().unwrap();
        let l = lineas_de_muestras(&i);
        let n: usize = l.iter().map(|x| x.matches(';').count() + 1).sum();
        assert!(n <= MUESTRAS_EN_LINEAS, "{n}");
        assert!(l[0].contains("paso=10"), "{}", l[0]);
        let bytes: usize = l.iter().map(|x| x.len() + 150).sum::<usize>() + 360;
        assert!(bytes <= 4_400, "{bytes}: lo que el espejo deja pasar de estas líneas");
    }
}
