/**
 * REGISTROS DE MOVIMIENTO — «CÓMO SE SIENTE CADA SECCIÓN» (Ola 1024D)
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo PURO. Traduce los tres registros de animación de la identidad StarSeed
 * (sobrio, expresivo, experimental) a los tokens de `movimiento.ts`: aquella es
 * la ÚNICA fuente de duraciones y curvas y aquí no se inventa ninguna.
 *
 *  · sobrio      — la sección acompaña sin llamar la atención: normal + suave,
 *                  sin elástico, cascada corta.
 *  · expresivo   — la sección toma la palabra: pausado + entrada, salida viva.
 *  · experimental— la escena se abre: escena + elástico SOLO en la entrada;
 *                  la salida vuelve a una curva de retirada, nunca rebota.
 *
 * La sección aporta su respiración (escala y periodo) y su densidad de cascada,
 * de modo que la MISMA identidad de gesto se reconoce en todos los contextos.
 */

import { CURVA, DURACION } from "@/lib/design/movimiento";

/** Registros de animación de la identidad StarSeed. */
export type RegistroMovimiento = "sobrio" | "expresivo" | "experimental";

/** Secciones del OS con movimiento propio. */
export type SeccionMovimiento =
    | "trinity"
    | "astraura"
    | "genesis"
    | "malla"
    | "biblioteca"
    | "protomolecula";

/** Un tramo animado: duración y curva, ambas del ADN del OS. */
export interface TramoMovimiento {
    ms: number;
    curva: string;
}

/** Respiración de una sección: cuánto crece y cada cuánto. */
export interface RespiracionMovimiento {
    escala: number;
    periodoMs: number;
}

/** Movimiento resuelto para un par registro × sección. */
export interface MovimientoResuelto {
    entrada: TramoMovimiento;
    salida: TramoMovimiento;
    cascadaMs: number;
    respiracion: RespiracionMovimiento;
}

/** Tokens por registro: solo DURACION y CURVA; salida siempre más corta. */
const TRAMOS: Record<RegistroMovimiento, { entrada: TramoMovimiento; salida: TramoMovimiento }> = {
    sobrio: {
        entrada: { ms: DURACION.normal, curva: CURVA.suave },
        salida: { ms: DURACION.rapido, curva: CURVA.salida },
    },
    expresivo: {
        entrada: { ms: DURACION.pausado, curva: CURVA.entrada },
        salida: { ms: DURACION.normal, curva: CURVA.salida },
    },
    experimental: {
        entrada: { ms: DURACION.escena, curva: CURVA.elastico },
        salida: { ms: DURACION.pausado, curva: CURVA.salida },
    },
};

/** Paso de cascada propio de cada registro (ms, token del OS). */
const CASCADA_REGISTRO: Record<RegistroMovimiento, number> = {
    sobrio: DURACION.instantaneo,
    expresivo: DURACION.rapido,
    experimental: DURACION.rapido,
};

/** La sección puede subir la densidad de su cascada, nunca inventar un tiempo. */
const CASCADA_SECCION: Record<SeccionMovimiento, number> = {
    trinity: DURACION.rapido,
    astraura: DURACION.instantaneo,
    genesis: DURACION.pausado,
    malla: DURACION.rapido,
    biblioteca: DURACION.normal,
    protomolecula: DURACION.normal,
};

/** Respiración por sección: leve (≤ 3 %) y lenta (3,5–6 s). */
const RESPIRACION: Record<SeccionMovimiento, RespiracionMovimiento> = {
    trinity: { escala: 1.03, periodoMs: 4200 },
    astraura: { escala: 1.02, periodoMs: 6000 },
    genesis: { escala: 1.02, periodoMs: 4800 },
    malla: { escala: 1.01, periodoMs: 3500 },
    biblioteca: { escala: 1.01, periodoMs: 5000 },
    protomolecula: { escala: 1.03, periodoMs: 5400 },
};

/** Resuelve el movimiento de un registro en una sección concreta. */
export function movimientoDe(
    registro: RegistroMovimiento,
    seccion: SeccionMovimiento,
): MovimientoResuelto {
    const tramos = TRAMOS[registro];
    return {
        entrada: { ...tramos.entrada },
        salida: { ...tramos.salida },
        cascadaMs: Math.max(CASCADA_REGISTRO[registro], CASCADA_SECCION[seccion]),
        respiracion: { ...RESPIRACION[seccion] },
    };
}

/** Con movimiento reducido: sin duración ni cascada, sin escala; estado final. */
export function aplicarMovimientoReducido(r: MovimientoResuelto): MovimientoResuelto {
    return {
        entrada: { ...r.entrada, ms: 0 },
        salida: { ...r.salida, ms: 0 },
        cascadaMs: 0,
        respiracion: { ...r.respiracion, escala: 1 },
    };
}
