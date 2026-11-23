// ═══════════════════════════════════════════════════════════════════════════
// ble_enlace_diagnostico — diagnóstico PURO del enlace Bluetooth directo.
// ---------------------------------------------------------------------------
// Contrato: architecture/bluetooth-directo.md (pendiente de escribir: § diagnóstico).
// Solo std: se prueba en cualquier sistema y no necesita radio.
//
// Calcula, sin tocar la radio:
//   · el tiempo de asentamiento recomendado entre parar el escaneo BlueZ y
//     llamar a Device1.Connect() (evita el le-connection-abort-by-local de
//     BlueZ cuando el controlador acaba de dejar de escanear);
//   · el backoff y los reintentos de acuse GATT antes de castigar un enlace
//     (b1, b2…) por «sin acuse» (macOS: «sin listo para escribir en 400 ms»;
//     4 intentos = castigo).
// ════════════════════════════════════════════════════════════════════════════

#![allow(dead_code)]

// ─── Asentamiento: parar escaneo → Connect() ───

/// Tiempo base de asentamiento tras parar el escaneo (ms).
pub const ASENTAMIENTO_BASE_MS: u64 = 200;
/// Extra si el escaneo estaba encendido justo antes (el controlador suelta la antena).
pub const ASENTAMIENTO_EXTRA_ESCANEO_MS: u64 = 300;
/// Extra por cada aborto local seguido del mismo aparato (controlador «caliente»).
pub const ASENTAMIENTO_EXTRA_ABORTO_MS: u64 = 150;
/// Nunca se espera más que esto (ms).
pub const ASENTAMIENTO_TOPE_MS: u64 = 1_000;

/// Cuánto esperar (ms) entre parar el escaneo de BlueZ y `Device1.Connect()`.
pub fn tiempo_asentamiento_ms(escaneo_activo: bool, abortos_seguidos: u32) -> u64 {
    let mut ms = ASENTAMIENTO_BASE_MS;
    if escaneo_activo {
        ms = ms.saturating_add(ASENTAMIENTO_EXTRA_ESCANEO_MS);
    }
    ms = ms.saturating_add(abortos_seguidos as u64 * ASENTAMIENTO_EXTRA_ABORTO_MS);
    ms.min(ASENTAMIENTO_TOPE_MS)
}

// ─── Acuse GATT: plazo, backoff y castigo ───

/// Plazo para que el controlador diga «listo para escribir» (ms): macOS «listo-tarde».
pub const PLAZO_LISTO_ESCRIBIR_MS: u64 = 400;
/// Plazo total para el acuse GATT de un paquete (primer paquete → acuse, ms).
pub const PLAZO_ACUSE_MS: u64 = 4_000;
/// Reintentos de acuse antes de castigar el enlace (el macOS lo registra tras 4).
pub const MAX_INTENTOS_ACUSE: u8 = 4;
/// Backoff base entre reintentos (ms); crece con cada intento fallido.
pub const BACKOFF_BASE_MS: u64 = 400;
/// Tope del backoff entre reintentos (ms).
pub const BACKOFF_TOPE_MS: u64 = 3_200;
/// Castigo base tras agotar los intentos (ms sin usar el enlace como central).
pub const CASTIGO_BASE_MS: u64 = 10_000;
/// Tope del castigo (ms).
pub const CASTIGO_TOPE_MS: u64 = 60_000;

/// Qué hacer con el acuse de un paquete en vuelo.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DecisionAcuse {
    /// Sigue esperando el acuse (aún no llegó el plazo).
    Esperando,
    /// Llegó el plazo sin acuse: reintenta tras `backoff_ms` (reescribe el paquete).
    Reintenta { backoff_ms: u64 },
    /// Se agotaron los intentos: castiga el enlace hasta `hasta_ms`.
    Castiga { hasta_ms: u64 },
    /// Llegó el acuse: el enlace vuelve a limpio.
    Acusado,
}

/// Estado del acuse GATT de UN enlace (b1, b2…). Puro: la radio/web lo alimentan.
#[derive(Debug, Clone, Default)]
pub struct AcuseEstado {
    /// Intentos seguidos sin acuse del paquete en vuelo.
    pub intentos: u8,
    /// Cuándo se entregó el primer paquete del intento actual (None si no hay vuelo).
    pub desde_ms: Option<u64>,
    /// Hasta qué ms está castigado el enlace (None si no lo está).
    pub castigado_hasta_ms: Option<u64>,
}

impl AcuseEstado {
    pub fn nueva() -> Self {
        Self::default()
    }

    /// Se entregó el primer paquete a la radio: empieza a contar el acuse.
    pub fn entregar(&mut self, ahora_ms: u64) {
        self.intentos = 0;
        self.desde_ms = Some(ahora_ms);
        self.castigado_hasta_ms = None;
    }

    /// Llegó el acuse del paquete en vuelo: vuelve a limpio.
    pub fn acuse_llego(&mut self) {
        self.intentos = 0;
        self.desde_ms = None;
    }

    /// Backoff (ms) antes del siguiente reintento, creciendo con los intentos.
    pub fn backoff_ms(intentos: u8) -> u64 {
        let n = intentos as u64;
        (BACKOFF_BASE_MS * (1u64 << n.saturating_sub(1))).min(BACKOFF_TOPE_MS)
    }

    /// Castigo (ms) tras agotar los intentos, creciendo con los intentos.
    pub fn castigo_ms(intentos: u8) -> u64 {
        let n = intentos as u64;
        let extra = n.saturating_sub(MAX_INTENTOS_ACUSE as u64);
        CASTIGO_BASE_MS.saturating_add(extra.saturating_mul(CASTIGO_BASE_MS)).min(CASTIGO_TOPE_MS)
    }

    /// Decide qué hacer ahora con el acuse pendiente (la radio lo llama cada tic).
    pub fn decidir(&mut self, ahora_ms: u64) -> DecisionAcuse {
        if self.castigado_hasta_ms.is_some_and(|h| ahora_ms < h) {
            return DecisionAcuse::Esperando;
        }
        let Some(desde) = self.desde_ms else {
            return DecisionAcuse::Esperando;
        };
        if ahora_ms.saturating_sub(desde) < PLAZO_ACUSE_MS {
            return DecisionAcuse::Esperando;
        }
        // Plazo vencido sin acuse: cuenta un intento más y reintenta (o castiga).
        self.intentos = self.intentos.saturating_add(1);
        self.desde_ms = Some(ahora_ms);
        if self.intentos >= MAX_INTENTOS_ACUSE {
            let hasta = ahora_ms.saturating_add(Self::castigo_ms(self.intentos));
            self.castigado_hasta_ms = Some(hasta);
            return DecisionAcuse::Castiga { hasta_ms: hasta };
        }
        DecisionAcuse::Reintenta { backoff_ms: Self::backoff_ms(self.intentos) }
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn asentamiento_base_y_con_escaneo() {
        assert_eq!(tiempo_asentamiento_ms(false, 0), ASENTAMIENTO_BASE_MS);
        assert_eq!(
            tiempo_asentamiento_ms(true, 0),
            ASENTAMIENTO_BASE_MS + ASENTAMIENTO_EXTRA_ESCANEO_MS
        );
    }

    #[test]
    fn asentamiento_crece_con_abortos_y_tiene_tope() {
        let uno = tiempo_asentamiento_ms(false, 1);
        assert_eq!(uno, ASENTAMIENTO_BASE_MS + ASENTAMIENTO_EXTRA_ABORTO_MS);
        assert!(tiempo_asentamiento_ms(false, 2) > uno);
        assert_eq!(tiempo_asentamiento_ms(true, 10_000), ASENTAMIENTO_TOPE_MS);
    }

    #[test]
    fn backoff_crece_con_los_intentos_con_tope() {
        assert_eq!(AcuseEstado::backoff_ms(1), BACKOFF_BASE_MS);
        assert_eq!(AcuseEstado::backoff_ms(2), BACKOFF_BASE_MS * 2);
        assert_eq!(AcuseEstado::backoff_ms(3), BACKOFF_BASE_MS * 4);
        assert_eq!(AcuseEstado::backoff_ms(4), BACKOFF_TOPE_MS);
        assert_eq!(AcuseEstado::backoff_ms(5), BACKOFF_TOPE_MS);
    }

    #[test]
    fn castigo_crece_y_tiene_tope() {
        assert_eq!(AcuseEstado::castigo_ms(MAX_INTENTOS_ACUSE), CASTIGO_BASE_MS);
        assert!(AcuseEstado::castigo_ms(u8::MAX) <= CASTIGO_TOPE_MS);
        assert!(AcuseEstado::castigo_ms(u8::MAX) >= CASTIGO_BASE_MS);
    }

    #[test]
    fn sin_acuse_se_reintenta_con_backoff_hasta_castigar() {
        let mut a = AcuseEstado::nueva();
        a.entregar(1_000);
        assert_eq!(a.decidir(1_000 + PLAZO_ACUSE_MS - 1), DecisionAcuse::Esperando);
        assert_eq!(
            a.decidir(1_000 + PLAZO_ACUSE_MS),
            DecisionAcuse::Reintenta { backoff_ms: BACKOFF_BASE_MS }
        );
        assert_eq!(a.intentos, 1);
        assert_eq!(
            a.decidir(1_000 + 2 * PLAZO_ACUSE_MS),
            DecisionAcuse::Reintenta { backoff_ms: BACKOFF_BASE_MS * 2 }
        );
        assert_eq!(a.intentos, 2);
        assert_eq!(
            a.decidir(1_000 + 3 * PLAZO_ACUSE_MS),
            DecisionAcuse::Reintenta { backoff_ms: BACKOFF_BASE_MS * 4 }
        );
        assert_eq!(a.intentos, 3);
        let d = a.decidir(1_000 + 4 * PLAZO_ACUSE_MS);
        assert_eq!(
            d,
            DecisionAcuse::Castiga {
                hasta_ms: 1_000 + 4 * PLAZO_ACUSE_MS + CASTIGO_BASE_MS
            }
        );
        assert_eq!(a.intentos, MAX_INTENTOS_ACUSE);
        assert_eq!(a.decidir(1_000 + 4 * PLAZO_ACUSE_MS + 100), DecisionAcuse::Esperando);
    }

    #[test]
    fn acuse_llego_reinicia_el_estado() {
        let mut a = AcuseEstado::nueva();
        a.entregar(1_000);
        assert!(matches!(
            a.decidir(1_000 + PLAZO_ACUSE_MS),
            DecisionAcuse::Reintenta { backoff_ms: BACKOFF_BASE_MS }
        ));
        a.acuse_llego();
        assert_eq!(a.intentos, 0);
        assert_eq!(a.desde_ms, None);
        assert_eq!(a.decidir(1_000 + PLAZO_ACUSE_MS), DecisionAcuse::Esperando);
    }

    #[test]
    fn sin_vuelo_no_hace_nada() {
        let mut a = AcuseEstado::nueva();
        assert_eq!(a.decidir(0), DecisionAcuse::Esperando);
    }
}
