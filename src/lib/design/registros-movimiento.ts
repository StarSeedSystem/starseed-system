/**
 * REGISTROS DE MOVIMIENTO — por sección, sobre los tokens del OS
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo PURO (Ola 1024D): traduce un registro de animación («sobrio»,
 * «expresivo», «experimental») y la sección del OS donde se aplica a un PLAN
 * de movimiento usando SOLO `DURACION` y `CURVA` de `movimiento.ts`, la única
 * fuente de duraciones y curvas. Los números de vídeo de la skill
 * claude-video-studio NO se copian a la interfaz (STARSEED.md §6): aquí se
 * traducen al ADN (interfaz 90–480 ms, curvas del OS).
 *
 *  · movimientoDe           — plan completo: entrada, salida, cascada y
 *                             respiración (1–1,03 · 3500–6000 ms).
 *  · aplicarMovimientoReducido — ante prefers-reduced-motion: ningún ms y
 *                             escala 1, el estado final se pinta sin moverse.
 *
 * Solo transform y opacity se animan (regla del área); nada de red, disco ni
 * reloj: todo es entrada → salida, determinista y testeable.
 */

import { CURVA, DURACION } from "./movimiento";

/** Registro de animación: la «voz» de movimiento de una superficie. */
export type RegistroMovimiento = "sobrio" | "expresivo" | "experimental";

/** Secciones del OS que reciben plan de movimiento. */
export type SeccionMovimiento =
    | "trinity"
    | "astraura"
    | "genesis"
    | "malla"
    | "biblioteca"
    | "protomolecula";

/** Escalón de entrada/salida dentro de la escala `DURACION` del OS. */
type Nivel = keyof typeof DURACION;

/** Plan de movimiento completo para una sección con un registro dado. */
export interface PlanMovimiento {
    /** Aparición del elemento. */
    entrada: { ms: number; curva: string };
    /** Retirada del elemento: siempre más corta que la entrada. */
    salida: { ms: number; curva: string };
    /** Retardo entre elementos hermanos en cascada (ms). */
    cascadaMs: number;
    /** Respiración del elemento: escala sutil dentro de 1–1,03 y su periodo. */
    respiracion: { escala: number; periodoMs: number };
}

/** Peso de cada sección: 0 = sobriedad pura, 2 = la más viva (orbe, Multiverso). */
const PESO_SECCION: Record<SeccionMovimiento, number> = {
    genesis: 0,
    biblioteca: 0,
    malla: 0,
    trinity: 1,
    astraura: 2,
    protomolecula: 2,
};

/** Base de cada registro: el ADN manda (sobrio normal/suave sin elástico,
 * expresivo pausado/entrada, experimental escena con elástico SOLO en entrada)
 * y su retirada siempre un escalón por debajo. */
const BASE_REGISTRO: Record<
    RegistroMovimiento,
    { entrada: Nivel; curva: string; salida: Nivel }
> = {
    sobrio: { entrada: "normal", curva: CURVA.suave, salida: "rapido" },
    expresivo: { entrada: "pausado", curva: CURVA.entrada, salida: "rapido" },
    experimental: { entrada: "escena", curva: CURVA.elastico, salida: "normal" },
};

/** Retardo entre hermanos en cascada (ms): la sección elige dentro de la
 * escala del OS — la malla queda sobria, la orbe y el Multiverso se marcan. */
const CASCADA_POR_PESO: [Nivel, Nivel, Nivel] = ["instantaneo", "rapido", "normal"];

/** Base de la respiración por registro, en milésimas y ms (el peso de sección
 * afina ambos: la orbe respira algo más, con periodo algo más corto). */
const BASE_RESPIRACION: Record<RegistroMovimiento, { milesimas: number; periodoMs: number }> = {
    sobrio: { milesimas: 1010, periodoMs: 5400 },
    expresivo: { milesimas: 1015, periodoMs: 4800 },
    experimental: { milesimas: 1020, periodoMs: 4200 },
};

/** Devuelve el plan de movimiento de una sección con un registro dado. */
export function movimientoDe(
    registro: RegistroMovimiento,
    seccion: SeccionMovimiento,
): PlanMovimiento {
    const peso = PESO_SECCION[seccion];
    const base = BASE_REGISTRO[registro];
    const baseRespiracion = BASE_RESPIRACION[registro];
    return {
        entrada: { ms: DURACION[base.entrada], curva: base.curva },
        // La retirada del OS manda: curva de `salida`, siempre más corta.
        salida: { ms: DURACION[base.salida], curva: CURVA.salida },
        cascadaMs: DURACION[CASCADA_POR_PESO[peso]],
        respiracion: {
            escala: (baseRespiracion.milesimas + peso * 5) / 1000,
            periodoMs: baseRespiracion.periodoMs - peso * 300,
        },
    };
}

/** Con movimiento reducido: ni un ms, ni un movimiento de escala; las curvas
 * se conservan para el estado final (se pinta sin transición). */
export function aplicarMovimientoReducido(plan: PlanMovimiento): PlanMovimiento {
    return {
        entrada: { ...plan.entrada, ms: 0 },
        salida: { ...plan.salida, ms: 0 },
        cascadaMs: 0,
        respiracion: { ...plan.respiracion, escala: 1 },
    };
}
