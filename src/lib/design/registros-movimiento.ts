/**
 * REGISTROS DE MOVIMIENTO — personalidad animada por sección (DAN1024B, parte 1)
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo PURO: traduce un registro de movimiento («sobrio», «expresivo»,
 * «experimental») y una sección del OS a un paquete de tokens de animación,
 * usando SOLO `DURACION` y `CURVA` de `src/lib/design/movimiento.ts`.
 * Nada de red, disco ni reloj; solo transform y opacity se animan.
 *
 *  · movimientoDe          — el paquete completo: entrada, salida, cascada y
 *                            respiración (escala 1–1,03, periodo 3500–6000 ms).
 *  · aplicarMovimientoReducido — ante prefers-reduced-motion: ms a 0 y escala
 *                            a 1, el estado final sin moverse (CLAUDE.md §8).
 */

import { CURVA, DURACION } from "./movimiento";

/** Personalidad de animación elegida por cuenta, página o grupo. */
export type RegistroMovimiento = "sobrio" | "expresivo" | "experimental";

/** Secciones del OS que reciben animación propia. */
export type SeccionMovimiento =
    | "trinity"
    | "astraura"
    | "genesis"
    | "malla"
    | "biblioteca"
    | "protomolecula";

/** Fase de una animación: duración y curva, ambos del ADN del OS. */
export interface FaseMovimiento {
    /** Duración en milisegundos, de `DURACION`. */
    ms: number;
    /** Curva de easing, de `CURVA`. */
    curva: string;
}

/** Paquete de animación de una sección con su registro. */
export interface MovimientoSeccion {
    /** Aparición de la interfaz. */
    entrada: FaseMovimiento;
    /** Retirada de la interfaz: siempre más corta que la entrada. */
    salida: FaseMovimiento;
    /** Retardo total en cascada para listas (ms). */
    cascadaMs: number;
    /** Respiración viva: escala entre 1 y 1,03 y periodo 3500–6000 ms. */
    respiracion: { escala: number; periodoMs: number };
}

/** Matices por registro: qué duraciones y curvas usa cada personalidad. */
const REGISTRO: Record<
    RegistroMovimiento,
    { entradaMs: number; entrada: string; salidaMs: number; salida: string; cascadaMs: number }
> = {
    sobrio: {
        entradaMs: DURACION.normal,
        entrada: CURVA.suave,
        salidaMs: DURACION.rapido,
        salida: CURVA.suave,
        cascadaMs: 120,
    },
    expresivo: {
        entradaMs: DURACION.pausado,
        entrada: CURVA.entrada,
        salidaMs: DURACION.normal,
        salida: CURVA.salida,
        cascadaMs: 240,
    },
    experimental: {
        entradaMs: DURACION.escena,
        entrada: CURVA.elastico,
        salidaMs: DURACION.pausado,
        salida: CURVA.salida,
        cascadaMs: 360,
    },
};

/** Variación sutil (determinista) de la respiración según la sección. */
const SECCION: Record<SeccionMovimiento, { indiceRespiracion: number }> = {
    trinity: { indiceRespiracion: 0 },
    astraura: { indiceRespiracion: 1 },
    genesis: { indiceRespiracion: 2 },
    malla: { indiceRespiracion: 3 },
    biblioteca: { indiceRespiracion: 4 },
    protomolecula: { indiceRespiracion: 5 },
};

/**
 * Devuelve el paquete de movimiento para un registro y una sección.
 * La salida siempre es más corta que la entrada; la respiración vive entre
 * escala 1 y 1,03 con periodo 3500–6000 ms.
 */
export function movimientoDe(
    registro: RegistroMovimiento,
    seccion: SeccionMovimiento,
): MovimientoSeccion {
    const base = REGISTRO[registro];
    const { indiceRespiracion } = SECCION[seccion];
    return {
        entrada: { ms: base.entradaMs, curva: base.entrada },
        salida: { ms: base.salidaMs, curva: base.salida },
        cascadaMs: base.cascadaMs,
        respiracion: {
            escala: 1 + (indiceRespiracion % 4) * 0.01,
            periodoMs: 3500 + indiceRespiracion * 500,
        },
    };
}

/** Con `prefers-reduced-motion`: nada se mueve — ms a 0 y escala a 1. */
export function aplicarMovimientoReducido(m: MovimientoSeccion): MovimientoSeccion {
    return {
        entrada: { ms: 0, curva: m.entrada.curva },
        salida: { ms: 0, curva: m.salida.curva },
        cascadaMs: 0,
        respiracion: { escala: 1, periodoMs: m.respiracion.periodoMs },
    };
}
