/**
 * REGISTROS DE MOVIMIENTO — Ola 1024D (DAN1024B)
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo PURO: sin red, disco ni reloj. Traduce el par (registro, sección) a
 * tokens de movimiento usando SOLO `DURACION` y `CURVA` de `movimiento.ts`
 * (la única fuente de duraciones y curvas del OS: aquí no se inventa ninguna).
 *
 *  · Registro: la voz del movimiento (sobrio / expresivo / experimental).
 *  · Sección:  dónde vive en el OS (trinity, astraura, genesis, malla,
 *              biblioteca, protomolecula) — matiza la cascada.
 *  · `aplicarMovimientoReducido` respeta prefers-reduced-motion: el estado
 *    final se aplica sin moverse (ms en 0 y escala en 1).
 */
import { CURVA, DURACION } from "./movimiento";

/** Registro de movimiento: qué «voz» anima la interfaz. */
export type RegistroMovimiento = "sobrio" | "expresivo" | "experimental";

/** Sección del OS donde se aplica el movimiento. */
export type SeccionMovimiento =
    | "trinity"
    | "astraura"
    | "genesis"
    | "malla"
    | "biblioteca"
    | "protomolecula";

/** Lado de una transición: duración + curva, siempre tokens del OS. */
export interface TiempoMovimiento {
    /** Duración en milisegundos. */
    ms: number;
    /** Curva de easing del OS. */
    curva: string;
}

/** Tokens de movimiento de una sección bajo un registro. */
export interface MovimientoSeccion {
    entrada: TiempoMovimiento;
    salida: TiempoMovimiento;
    cascadaMs: number;
    respiracion: { escala: number; periodoMs: number };
}

/** Entrada y salida por registro (solo tokens del OS). */
const POR_REGISTRO: Record<
    RegistroMovimiento,
    { entrada: TiempoMovimiento; salida: TiempoMovimiento; cascadaBaseMs: number; escala: number }
> = {
    // Sobrio: normal/suave, sin elástico nunca — la voz neutra del OS.
    sobrio: {
        entrada: { ms: DURACION.normal, curva: CURVA.suave },
        salida: { ms: DURACION.rapido, curva: CURVA.suave },
        cascadaBaseMs: 40,
        escala: 1.01,
    },
    // Expresivo: pausado con la curva de entrada de la interfaz.
    expresivo: {
        entrada: { ms: DURACION.pausado, curva: CURVA.entrada },
        salida: { ms: DURACION.normal, curva: CURVA.salida },
        cascadaBaseMs: 60,
        escala: 1.02,
    },
    // Experimental: escena + elástico SOLO en la entrada; la salida se retira.
    experimental: {
        entrada: { ms: DURACION.escena, curva: CURVA.elastico },
        salida: { ms: DURACION.pausado, curva: CURVA.salida },
        cascadaBaseMs: 80,
        escala: 1.03,
    },
};

/** Ritmo de sección: multiplica la cascada y fija el periodo de respiración. */
const POR_SECCION: Record<SeccionMovimiento, { multiplicador: number; periodoMs: number }> = {
    trinity: { multiplicador: 0.8, periodoMs: 4800 },
    astraura: { multiplicador: 1.2, periodoMs: 4400 },
    genesis: { multiplicador: 1.4, periodoMs: 3800 },
    malla: { multiplicador: 1.0, periodoMs: 5000 },
    biblioteca: { multiplicador: 0.8, periodoMs: 6000 },
    protomolecula: { multiplicador: 1.2, periodoMs: 4000 },
};

/** Tokens de movimiento para un registro en una sección del OS. */
export function movimientoDe(registro: RegistroMovimiento, seccion: SeccionMovimiento): MovimientoSeccion {
    const base = POR_REGISTRO[registro];
    const seccion_ = POR_SECCION[seccion];
    return {
        entrada: base.entrada,
        salida: base.salida,
        cascadaMs: Math.round(base.cascadaBaseMs * seccion_.multiplicador),
        respiracion: { escala: base.escala, periodoMs: seccion_.periodoMs },
    };
}

/** Con movimiento reducido: ningún ms y ninguna escala — el estado final
 * se aplica sin moverse (usable, simplemente no respira). */
export function aplicarMovimientoReducido(r: MovimientoSeccion): MovimientoSeccion {
    return {
        ...r,
        entrada: { ...r.entrada, ms: 0 },
        salida: { ...r.salida, ms: 0 },
        cascadaMs: 0,
        respiracion: { ...r.respiracion, escala: 1 },
    };
}
