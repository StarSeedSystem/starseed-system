/**
 * REGISTROS DE MOVIMIENTO — Ola 1024D
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo PURO (sin red, disco ni reloj): traduce un registro de identidad
 * dinámica y una sección del OS a tokens de movimiento. Las duraciones y las
 * curvas salen SIEMPRE de `movimiento.ts`; aquí no se inventa ninguna.
 *
 *  · sobrio      — normal/suave, sin elástico: lectura, ajustes, biblioteca.
 *  · expresivo   — pausado/entrada: Trinity, orbe y acciones principales.
 *  · experimental— escena/elástico solo en la entrada: protomolécula y malla.
 *
 * La salida es siempre más corta que la entrada. La respiración queda entre
 * 1 y 1,03 de escala, con un periodo de 3500–6000 ms. Con movimiento reducido,
 * todas las duraciones bajan a 0 y la escala vuelve a 1 (estado final quieto).
 */

import { CURVA, DURACION } from "@/lib/design/movimiento";

export type RegistroMovimiento = "sobrio" | "expresivo" | "experimental";

export type SeccionMovimiento =
    | "trinity"
    | "astraura"
    | "genesis"
    | "malla"
    | "biblioteca"
    | "protomolecula";
/** Registros en orden de intensidad, útil para menús y pruebas. */
export const REGISTROS_MOVIMIENTO: RegistroMovimiento[] = ["sobrio", "expresivo", "experimental"];

/** Secciones del OS que tienen movimiento propio, con identidad compartida. */
export const SECCIONES_MOVIMIENTO: SeccionMovimiento[] = ["trinity", "astraura", "genesis", "malla", "biblioteca", "protomolecula"];
export interface TramoMovimiento {
    /** Duración en milisegundos (token de `DURACION`). */
    ms: number;
    /** Curva de easing resuelta (token de `CURVA`). */
    curva: string;
}

export interface RespiracionMovimiento {
    /** Escala máxima del latido, entre 1 y 1,03. */
    escala: number;
    /** Periodo completo del latido, entre 3500 y 6000 ms. */
    periodoMs: number;
}

export interface MovimientoDeSeccion {
    entrada: TramoMovimiento;
    salida: TramoMovimiento;
    /** Retardo entre elementos hermanos de una lista o menú. */
    cascadaMs: number;
    respiracion: RespiracionMovimiento;
}

/** Base de cada registro: solo tokens de `movimiento.ts`. */
const BASE: Record<RegistroMovimiento, MovimientoDeSeccion> = {
    sobrio: {
        entrada: { ms: DURACION.normal, curva: CURVA.suave },
        salida: { ms: DURACION.rapido, curva: CURVA.salida },
        cascadaMs: 30,
        respiracion: { escala: 1.01, periodoMs: 5400 },
    },
    expresivo: {
        entrada: { ms: DURACION.pausado, curva: CURVA.entrada },
        salida: { ms: DURACION.normal, curva: CURVA.salida },
        cascadaMs: 45,
        respiracion: { escala: 1.02, periodoMs: 4600 },
    },
    experimental: {
        entrada: { ms: DURACION.escena, curva: CURVA.elastico },
        salida: { ms: DURACION.pausado, curva: CURVA.salida },
        cascadaMs: 60,
        respiracion: { escala: 1.03, periodoMs: 3800 },
    },
};

/** Ajuste fino por sección: la identidad del gesto no cambia, el pulso sí. */
const AJUSTE_SECCION: Record<SeccionMovimiento, { cascadaMs: number; periodoMs: number }> = {
    trinity: { cascadaMs: 0, periodoMs: 0 },
    astraura: { cascadaMs: 5, periodoMs: 200 },
    genesis: { cascadaMs: 10, periodoMs: -200 },
    malla: { cascadaMs: 15, periodoMs: 400 },
    biblioteca: { cascadaMs: -5, periodoMs: -400 },
    protomolecula: { cascadaMs: 10, periodoMs: 600 },
};

function acotar(n: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, n));
}

/** Tokens de movimiento de un registro en una sección concreta. */
export function movimientoDe(
    registro: RegistroMovimiento,
    seccion: SeccionMovimiento,
): MovimientoDeSeccion {
    const base = BASE[registro];
    const ajuste = AJUSTE_SECCION[seccion];
    return {
        entrada: { ...base.entrada },
        salida: { ...base.salida },
        cascadaMs: Math.max(0, base.cascadaMs + ajuste.cascadaMs),
        respiracion: {
            escala: acotar(base.respiracion.escala, 1, 1.03),
            periodoMs: acotar(base.respiracion.periodoMs + ajuste.periodoMs, 3500, 6000),
        },
    };
}

/**
 * Movimiento reducido (`prefers-reduced-motion`): el estado final se aplica de
 * golpe. Duraciones y cascada a 0; la respiración deja de latir (escala 1).
 */
export function aplicarMovimientoReducido(r: MovimientoDeSeccion): MovimientoDeSeccion {
    return {
        entrada: { ...r.entrada, ms: 0 },
        salida: { ...r.salida, ms: 0 },
        cascadaMs: 0,
        respiracion: { ...r.respiracion, escala: 1 },
    };
}
