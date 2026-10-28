/**
 * REGISTROS DE MOVIMIENTO — Danza por sección (Ola 1024D · DAN1024B)
 * ─────────────────────────────────────────────────────────────────────
 * Módulo PURO: registro de movimiento de cada sección del OS (sobrio,
 * expresivo, experimental) sobre los ÚNICOS tokens de movimiento.ts:
 * `movimientoDe` y `aplicarMovimientoReducido` (ms en 0 y escala en 1,
 * ante prefers-reduced-motion: estado final sin moverse).
 */

import { DURACION, CURVA } from "./movimiento";

/** Carácter del movimiento de una sección. */
export type RegistroMovimiento = "sobrio" | "expresivo" | "experimental";

/** Secciones del OS que llevan registro de movimiento propio. */
export type SeccionMovimiento =
    | "trinity" | "astraura" | "genesis" | "malla" | "biblioteca" | "protomolecula";

/** Un paso del movimiento: duración y curva, ambas del ADN del OS. */
export interface PasoMovimiento {
    ms: number;
    curva: string;
}

/** Movimiento completo de una sección con un registro dado. */
export interface MovimientoDeSeccion {
    entrada: PasoMovimiento;
    salida: PasoMovimiento;
    /** Retardo en cascada por elemento (ms). */
    cascadaMs: number;
    /** Respiración de fondo: escala 1-1,03, periodo 3500-6000 ms. */
    respiracion: { escala: number; periodoMs: number };
}

/** Entrada y salida base de cada registro, SOLO con DURACION y CURVA. */
const BASE_REGISTRO: Record<
    RegistroMovimiento,
    { entrada: PasoMovimiento; salida: PasoMovimiento; salidaRapida: PasoMovimiento }> = {
    sobrio: {
        entrada: { ms: DURACION.normal, curva: CURVA.suave },
        salida: { ms: DURACION.rapido, curva: CURVA.suave },
        salidaRapida: { ms: DURACION.instantaneo, curva: CURVA.suave },
    },
    expresivo: {
        entrada: { ms: DURACION.pausado, curva: CURVA.entrada },
        salida: { ms: DURACION.normal, curva: CURVA.salida },
        salidaRapida: { ms: DURACION.rapido, curva: CURVA.salida },
    },
    experimental: {
        entrada: { ms: DURACION.escena, curva: CURVA.elastico },
        salida: { ms: DURACION.pausado, curva: CURVA.salida },
        salidaRapida: { ms: DURACION.normal, curva: CURVA.salida },
    },
};

/** Respiración base de cada registro: experimental respira algo más. */
const RESPIRACION_REGISTRO: Record<RegistroMovimiento, { escala: number; periodoMs: number }> = {
    sobrio: { escala: 1.005, periodoMs: 5600 },
    expresivo: { escala: 1.015, periodoMs: 4600 },
    experimental: { escala: 1.025, periodoMs: 3600 },
};

/** Personalidad de cada sección: cascada base y afinación de respiración. */
const SECCION: Record<
    SeccionMovimiento,
    { cascadaMs: number; salidaRapida: boolean; ajusteEscala: number; ajustePeriodoMs: number }
> = {
    trinity: { cascadaMs: 40, salidaRapida: true, ajusteEscala: 0, ajustePeriodoMs: 0 },
    astraura: { cascadaMs: 60, salidaRapida: false, ajusteEscala: 0.003, ajustePeriodoMs: 400 },
    genesis: { cascadaMs: 50, salidaRapida: false, ajusteEscala: 0.001, ajustePeriodoMs: 200 },
    malla: { cascadaMs: 45, salidaRapida: true, ajusteEscala: 0.004, ajustePeriodoMs: 600 },
    biblioteca: { cascadaMs: 30, salidaRapida: false, ajusteEscala: 0.002, ajustePeriodoMs: 400 },
    protomolecula: { cascadaMs: 70, salidaRapida: false, ajusteEscala: 0.005, ajustePeriodoMs: 200 },
};

/** Cascada extra por registro: las escenas experimentales escalonan más. */
const CASCADA_EXTRA: Record<RegistroMovimiento, number> = {
    sobrio: 0, expresivo: 20, experimental: 40,
};

const ESCALA_MAXIMA = 1.03;
const PERIODO_MINIMO_MS = 3500;
const PERIODO_MAXIMO_MS = 6000;
/**
 * Movimiento de una sección con un registro dado. La salida queda SIEMPRE
 * más corta que la entrada; el elástico solo en la entrada experimental.
 */
export function movimientoDe(
    registro: RegistroMovimiento,
    seccion: SeccionMovimiento,
): MovimientoDeSeccion {
    const base = BASE_REGISTRO[registro];
    const s = SECCION[seccion];
    const respiracionBase = RESPIRACION_REGISTRO[registro];
    return {
        entrada: base.entrada,
        salida: s.salidaRapida ? base.salidaRapida : base.salida,
        cascadaMs: s.cascadaMs + CASCADA_EXTRA[registro],
        respiracion: {
            escala: Math.min(ESCALA_MAXIMA, respiracionBase.escala + s.ajusteEscala),
            periodoMs: Math.min(
                PERIODO_MAXIMO_MS,
                Math.max(PERIODO_MINIMO_MS, respiracionBase.periodoMs + s.ajustePeriodoMs),
            ),
        },
    };
}

/**
 * Con prefers-reduced-motion: duraciones en 0, cascada en 0 y respiración
 * parada (escala 1): el estado final se aplica de golpe, sin moverse.
 */
export function aplicarMovimientoReducido(m: MovimientoDeSeccion): MovimientoDeSeccion {
    return {
        entrada: { ...m.entrada, ms: 0 },
        salida: { ...m.salida, ms: 0 },
        cascadaMs: 0,
        respiracion: { escala: 1, periodoMs: 0 },
    };
}
