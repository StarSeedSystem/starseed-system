/**
 * REGISTROS DE MOVIMIENTO — LA VOZ DE CADA SECCIÓN (Ola 1024D · DAN1024B-d1)
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo PURO: traduce un registro (sobrio, expresivo, experimental) y una
 * sección del OS a los tokens de `movimiento.ts`, la ÚNICA fuente de duraciones
 * y curvas: aquí no se inventa ningún número y los del vídeo (STARSEED.md §6)
 * jamás se copian a la interfaz. El registro marca la voz (entrada, salida,
 * cuánto respira); la sección, el ritmo (cascada y periodo de respiración).
 * Solo se animan transform y opacity; la salida siempre es más corta que la
 * entrada; el elástico vive solo en la entrada experimental; con movimiento
 * reducido, `aplicarMovimientoReducido` deja todo en 0 ms y la escala en 1.
 */

import { DURACION, CURVA } from "./movimiento";

/** Registro de movimiento: la intensidad elegida para una sección. */
export type RegistroMovimiento = "sobrio" | "expresivo" | "experimental";

/** Sección del OS con identidad de movimiento propia. */
export type SeccionMovimiento =
    | "trinity"
    | "astraura"
    | "genesis"
    | "malla"
    | "biblioteca"
    | "protomolecula";

/** Curva de easing del OS, tal cual sale de `movimiento.ts` (nunca inventada). */
export type CurvaDelOS = (typeof CURVA)[keyof typeof CURVA];

/** Un momento del movimiento: duración en ms y curva del OS. */
export interface MomentoMovimiento {
    /** Duración en milisegundos (0 con movimiento reducido). */
    ms: number;
    curva: CurvaDelOS;
}

/** Respiración de una sección: una escala sutil, nunca otra propiedad. */
export interface Respiracion {
    /** Escala máxima del ciclo, entre 1 y 1.03 (1 = no respirar). */
    escala: number;
    /** Periodo del ciclo en ms, entre 3500 y 6000 (0 con movimiento reducido). */
    periodoMs: number;
}

/** Tokens de movimiento de una sección bajo un registro. */
export interface MovimientoSeccion {
    /** Cómo entra un elemento de la sección. */
    entrada: MomentoMovimiento;
    /** Cómo se retira: siempre más corto que la entrada. */
    salida: MomentoMovimiento;
    /** Retardo en cascada entre elementos consecutivos de una lista (ms). */
    cascadaMs: number;
    respiracion: Respiracion;
}

/** La voz de cada registro: sus dos momentos y cuánto respira. Solo tokens del OS. */
const VOZ: Record<RegistroMovimiento, Pick<MovimientoSeccion, "entrada" | "salida"> & { escala: number }> = {
    // Sobrio: responde y se retira sin teatro; jamás elástico.
    sobrio: {
        entrada: { ms: DURACION.normal, curva: CURVA.suave },
        salida: { ms: DURACION.rapido, curva: CURVA.salida },
        escala: 1.01,
    },
    // Expresivo: la entrada se deja notar y responde al dedo.
    expresivo: {
        entrada: { ms: DURACION.pausado, curva: CURVA.entrada },
        salida: { ms: DURACION.normal, curva: CURVA.salida },
        escala: 1.02,
    },
    // Experimental: la entrada es una escena con rebote; elástico SOLO aquí.
    experimental: {
        entrada: { ms: DURACION.escena, curva: CURVA.elastico },
        salida: { ms: DURACION.pausado, curva: CURVA.salida },
        escala: 1.03,
    },
};

/** El ritmo de cada sección: cascada de sus listas y periodo de su respiración. */
const RITMO: Record<SeccionMovimiento, Pick<MovimientoSeccion, "cascadaMs"> & { periodoMs: number }> = {
    trinity: { cascadaMs: DURACION.rapido, periodoMs: 4800 },
    astraura: { cascadaMs: DURACION.rapido, periodoMs: 4000 },
    genesis: { cascadaMs: DURACION.instantaneo, periodoMs: 5200 },
    malla: { cascadaMs: DURACION.normal, periodoMs: 5600 },
    biblioteca: { cascadaMs: DURACION.normal, periodoMs: 6000 },
    protomolecula: { cascadaMs: DURACION.instantaneo, periodoMs: 3500 },
};

/**
 * El movimiento de una sección bajo un registro: la voz del registro sobre el
 * ritmo de la sección. Devuelve copias nuevas: mutar el resultado no cambia
 * los tokens.
 */
export function movimientoDe(
    registro: RegistroMovimiento,
    seccion: SeccionMovimiento,
): MovimientoSeccion {
    const voz = VOZ[registro];
    const ritmo = RITMO[seccion];
    return {
        entrada: { ...voz.entrada },
        salida: { ...voz.salida },
        cascadaMs: ritmo.cascadaMs,
        respiracion: { escala: voz.escala, periodoMs: ritmo.periodoMs },
    };
}

/**
 * Con prefers-reduced-motion: todo en 0 ms y la escala en 1 — el estado final
 * se aplica de golpe, sin moverse. Las curvas se conservan (con 0 ms no
 * importan) y el original no se toca.
 */
export function aplicarMovimientoReducido(r: MovimientoSeccion): MovimientoSeccion {
    return {
        entrada: { ms: 0, curva: r.entrada.curva },
        salida: { ms: 0, curva: r.salida.curva },
        cascadaMs: 0,
        respiracion: { escala: 1, periodoMs: 0 },
    };
}
