/**
 * REGISTROS DE MOVIMIENTO POR SECCIÓN (Ola 1024D · DAN1024B)
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo PURO: traduce cada sección del OS a un registro de movimiento
 * (sobrio, expresivo o experimental) usando SOLO los tokens de `movimiento.ts`.
 * No hay duraciones ni curvas propias: la escala de tiempos y las curvas son
 * las del ADN del OS, y este módulo solo decide cómo combinarlas.
 *
 *  · sobrio       — respuesta sobria: normal/suave, sin elástico.
 *  · expresivo    — presencia: pausado/entrada, con salida más corta.
 *  · experimental — escena con rebote SOLO en la entrada; la salida se retira.
 *
 * La respiración es el pulso quieto de cada sección: escala entre 1 y 1,03 con
 * un periodo de 3500–6000 ms. Ante prefers-reduced-motion, `aplicarMovimientoReducido`
 * deja todas las duraciones en 0 y la escala en 1 (estado final, sin moverse).
 */

import { CURVA, DURACION } from "@/lib/design/movimiento";

/** Registros de movimiento disponibles para una sección. */
export type RegistroMovimiento = "sobrio" | "expresivo" | "experimental";

/** Secciones del OS que tienen una receta de movimiento propia. */
export type SeccionMovimiento =
    | "trinity" | "astraura" | "genesis" | "malla" | "biblioteca" | "protomolecula";

/** Un tramo de movimiento: duración del token del OS y su curva. */
export interface TramoMovimiento {
    /** Duración en milisegundos, tomada de `DURACION`. */
    ms: number;
    /** Curva de easing, tomada de `CURVA`. */
    curva: string;
}

/** Pulso de respiración de una sección (1 = quieto). */
export interface RespiracionMovimiento {
    /** Escala máxima del latido, entre 1 y 1,03. */
    escala: number;
    /** Periodo completo del latido en milisegundos, 3500–6000. */
    periodoMs: number;
}

/** Receta de movimiento resuelta para un registro y una sección. */
export interface MovimientoSeccion {
    /** Aparición del elemento. */
    entrada: TramoMovimiento;
    /** Retirada del elemento; siempre más corta que la entrada. */
    salida: TramoMovimiento;
    /** Retardo entre elementos consecutivos de una lista (ms). */
    cascadaMs: number;
    /** Respiración de la sección. */
    respiracion: RespiracionMovimiento;
}

/** Los tres registros, en orden de contención a expresividad. */
export const REGISTROS_MOVIMIENTO: readonly RegistroMovimiento[] = [
    "sobrio", "expresivo", "experimental",
];

/** Las seis secciones con receta de movimiento. */
export const SECCIONES_MOVIMIENTO: readonly SeccionMovimiento[] = [
    "trinity", "astraura", "genesis", "malla", "biblioteca", "protomolecula",
];

/** Entrada y salida por registro; todas las cifras vienen de `DURACION`/`CURVA`. */
const RECETA: Record<RegistroMovimiento, { entrada: TramoMovimiento; salida: TramoMovimiento }> = {
    sobrio: { entrada: { ms: DURACION.normal, curva: CURVA.suave }, salida: { ms: DURACION.rapido, curva: CURVA.suave } },
    expresivo: { entrada: { ms: DURACION.pausado, curva: CURVA.entrada }, salida: { ms: DURACION.normal, curva: CURVA.salida } },
    experimental: { entrada: { ms: DURACION.escena, curva: CURVA.elastico }, salida: { ms: DURACION.pausado, curva: CURVA.salida } },
};

/** Latido propio de cada sección; la cascada nace de los tokens del OS. */
const PULSO: Record<SeccionMovimiento, { cascadaMs: number; respiracion: RespiracionMovimiento }> = {
    trinity: { cascadaMs: DURACION.instantaneo / 3, respiracion: { escala: 1.01, periodoMs: 3500 } },
    astraura: { cascadaMs: DURACION.instantaneo / 2, respiracion: { escala: 1.03, periodoMs: 6000 } },
    genesis: { cascadaMs: DURACION.instantaneo / 3, respiracion: { escala: 1.018, periodoMs: 4200 } },
    malla: { cascadaMs: DURACION.instantaneo / 2, respiracion: { escala: 1.008, periodoMs: 3800 } },
    biblioteca: { cascadaMs: DURACION.instantaneo / 3, respiracion: { escala: 1.006, periodoMs: 4000 } },
    protomolecula: { cascadaMs: DURACION.rapido / 3, respiracion: { escala: 1.022, periodoMs: 5200 } },
};

/** Factor de cascada por registro: cuanto más expresivo, más aire entre piezas. */
const FACTOR_CASCADA: Record<RegistroMovimiento, number> = {
    sobrio: 1, expresivo: 1.5, experimental: 2,
};

/**
 * Resuelve el movimiento de una sección para un registro dado.
 * Devuelve copias nuevas: quien consuma el resultado puede ajustarlo sin
 * contaminar las recetas compartidas.
 */
export function movimientoDe(
    registro: RegistroMovimiento,
    seccion: SeccionMovimiento,
): MovimientoSeccion {
    const receta = RECETA[registro];
    const pulso = PULSO[seccion];
    return {
        entrada: { ...receta.entrada },
        salida: { ...receta.salida },
        cascadaMs: Math.round(pulso.cascadaMs * FACTOR_CASCADA[registro]),
        respiracion: { ...pulso.respiracion },
    };
}

/**
 * Aplica prefers-reduced-motion: el estado final de golpe, sin animación.
 * Duraciones y cascada a 0, respiración a escala 1 (y su periodo a 0).
 */
export function aplicarMovimientoReducido(r: MovimientoSeccion): MovimientoSeccion {
    return {
        entrada: { ...r.entrada, ms: 0 },
        salida: { ...r.salida, ms: 0 },
        cascadaMs: 0,
        respiracion: { escala: 1, periodoMs: 0 },
    };
}
