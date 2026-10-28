/**
 * REGISTROS DE MOVIMIENTO — personalidad del movimiento por sección (Ola 1024D).
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo PURO: sin red, sin disco, sin reloj y sin `node:*`. Traduce un
 * REGISTRO (la voz con la que se mueve la interfaz) y una SECCIÓN del OS a
 * tokens de movimiento, usando SOLO `DURACION` y `CURVA` de `movimiento.ts`:
 * aquí no se inventa ninguna duración ni curva nuevas.
 *
 *  · sobrio       — normal/suave, sin elástico: trabajo, biblioteca, trinity.
 *  · expresivo    — pausado/entrada: presencia que se nota (astraura, genesis).
 *  · experimental — escena con elástico SOLO en la entrada: protomolécula, malla.
 *
 * Reglas del resultado: la salida siempre es más corta que la entrada, la
 * respiración queda entre 1 y 1,03 (escala) con periodo de 3500–6000 ms, y ante
 * `prefers-reduced-motion` todos los tiempos caen a 0 con escala 1 (estado
 * final sin moverse). Solo `transform` y `opacity` deben animarse.
 */

import { CURVA, DURACION } from "./movimiento";

/** Registro de movimiento: la personalidad con la que se anima una sección. */
export type RegistroMovimiento = "sobrio" | "expresivo" | "experimental";

/** Secciones del OS que reciben movimiento registrado. */
export type SeccionMovimiento =
    | "trinity"
    | "astraura"
    | "genesis"
    | "malla"
    | "biblioteca"
    | "protomolecula";

/** Par duración + curva, ambos del ADN del OS (`DURACION`/`CURVA`). */
export interface PasoMovimiento {
    /** Duración en milisegundos (valor de `DURACION`). */
    ms: number;
    /** Curva de easing (valor de `CURVA`). */
    curva: string;
}

/** Respiración perceptible: escala de «inhalar» y su periodo. */
export interface Respiracion {
    /** Escala del pulso (1 = quieto; tope 1,03). */
    escala: number;
    /** Periodo completo del pulso en milisegundos. */
    periodoMs: number;
}

/** Movimiento completo de una sección con un registro dado. */
export interface MovimientoSeccion {
    /** Cómo aparece lo nuevo. */
    entrada: PasoMovimiento;
    /** Cómo se retira lo que sale. */
    salida: PasoMovimiento;
    /** Retardo en cascada entre elementos hermanos (ms). */
    cascadaMs: number;
    /** Pulso sutil de fondo (solo transform/opacity). */
    respiracion: Respiracion;
}

/** Entrada/salida por registro, con las duraciones y curvas del ADN del OS. */
const BASE_REGISTRO: Record<RegistroMovimiento, { entrada: PasoMovimiento; salida: PasoMovimiento }> = {
    sobrio: { entrada: { ms: DURACION.normal, curva: CURVA.suave }, salida: { ms: DURACION.rapido, curva: CURVA.suave } },
    expresivo: { entrada: { ms: DURACION.pausado, curva: CURVA.entrada }, salida: { ms: DURACION.normal, curva: CURVA.salida } },
    experimental: { entrada: { ms: DURACION.escena, curva: CURVA.elastico }, salida: { ms: DURACION.pausado, curva: CURVA.salida } },
};

/** Cascada base (ms) por sección: secciones densas propagan más tarde. */
const CASCADA_SECCION: Record<SeccionMovimiento, number> = {
    trinity: 40,
    astraura: 60,
    genesis: 80,
    malla: 60,
    biblioteca: 40,
    protomolecula: 80,
};

/** Respiración por sección y registro: escala (≤ 1,03) y periodo (3500–6000 ms). */
const RESPIRACION: Record<SeccionMovimiento, Record<RegistroMovimiento, Respiracion>> = {
    trinity: { sobrio: { escala: 1.01, periodoMs: 4000 }, expresivo: { escala: 1.02, periodoMs: 3800 }, experimental: { escala: 1.03, periodoMs: 3600 } },
    astraura: { sobrio: { escala: 1.01, periodoMs: 4200 }, expresivo: { escala: 1.02, periodoMs: 4000 }, experimental: { escala: 1.03, periodoMs: 3800 } },
    genesis: { sobrio: { escala: 1.01, periodoMs: 4400 }, expresivo: { escala: 1.02, periodoMs: 4200 }, experimental: { escala: 1.03, periodoMs: 4000 } },
    malla: { sobrio: { escala: 1.015, periodoMs: 5000 }, expresivo: { escala: 1.02, periodoMs: 4600 }, experimental: { escala: 1.03, periodoMs: 4400 } },
    biblioteca: { sobrio: { escala: 1.01, periodoMs: 6000 }, expresivo: { escala: 1.015, periodoMs: 5400 }, experimental: { escala: 1.02, periodoMs: 5000 } },
    protomolecula: { sobrio: { escala: 1.015, periodoMs: 4600 }, expresivo: { escala: 1.02, periodoMs: 4200 }, experimental: { escala: 1.03, periodoMs: 3800 } },
};

/** Traduce (registro, sección) a los tokens de movimiento de esa pieza. */
export function movimientoDe(registro: RegistroMovimiento, seccion: SeccionMovimiento): MovimientoSeccion {
    const base = BASE_REGISTRO[registro];
    return {
        entrada: { ...base.entrada },
        salida: { ...base.salida },
        cascadaMs: CASCADA_SECCION[seccion],
        respiracion: { ...RESPIRACION[seccion][registro] },
    };
}

/**
 * Ante `prefers-reduced-motion`: todo tiempo a 0 y la escala a 1 — el resultado
 * pinta el estado final directamente, sin moverse.
 */
export function aplicarMovimientoReducido(r: MovimientoSeccion): MovimientoSeccion {
    return {
        entrada: { ...r.entrada, ms: 0 },
        salida: { ...r.salida, ms: 0 },
        cascadaMs: 0,
        respiracion: { ...r.respiracion, escala: 1 },
    };
}
