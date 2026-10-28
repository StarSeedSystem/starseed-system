/**
 * REGISTROS DE MOVIMIENTO — el carácter de la animación por sección (Ola 1024D)
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo PURO: traduce el ADN dinámico StarSeed (Claude Video 2.0) a los tokens
 * de interfaz del OS SIN inventar duraciones ni curvas nuevas: todo sale de
 * `DURACION` y `CURVA` de `src/lib/design/movimiento.ts`, la única fuente.
 * (§6 de la skill claude-video-studio: los números de vídeo NUNCA se copian a
 * la interfaz: aquí manda la ventana de interfaz con las curvas del ADN.)
 *
 *  · registro  — el carácter: sobrio, expresivo o experimental.
 *  · sección   — destino en el OS: Trinity, Astraura, Genesis, malla, biblioteca
 *                o protomolécula (lo elige la cuenta, la página o el grupo).
 *  · movimientoDe(registro, sección) — el movimiento completo de esa pareja;
 *                y aplicarMovimientoReducido lo aplaza a 0 ms ante el motion
 *                reducido: el estado final se pinta quieto, sin moverse.
 *
 * Reglas: solo se animan `transform` y `opacity`; la salida es SIEMPRE más
 * corta que la entrada; el elástico se reserva a la entrada experimental.
 */

import { CURVA, DURACION } from "@/lib/design/movimiento";

/** Registros de la identidad dinámica: el carácter del movimiento. */
export type RegistroMovimiento = "sobrio" | "expresivo" | "experimental";

/** Secciones del OS que adoptan un registro por cuenta, página y grupo. */
export type SeccionMovimiento = "trinity" | "astraura" | "genesis" | "malla" | "biblioteca" | "protomolecula";

/** Un instante del movimiento: duración del OS + curva del ADN. */
export interface TokenTiempo {
    ms: number;
    curva: string;
}

/** El movimiento completo que una sección adopta con su registro. */
export interface MovimientoRegistro {
    /** Cómo aparece; `salida` es SIEMPRE más corta que la entrada. */
    entrada: TokenTiempo;
    salida: TokenTiempo;
    /** Retardo en cascada de los hijos (ms), en la línea de `escalonar`. */
    cascadaMs: number;
    /** Respiración de la sección: escala máxima 1,03; periodo 3.500–6.000. */
    respiracion: { escala: number; periodoMs: number };
}

/** Entrada/salida por registro: tokens del OS; salida SIEMPRE más corta. */
const TIEMPOS: Record<RegistroMovimiento, { entrada: TokenTiempo; salida: TokenTiempo }> = {
    // Sobrio: normal/suave, sin elástico en ninguno de los dos sentidos.
    sobrio: {
        entrada: { ms: DURACION.normal, curva: CURVA.suave },
        salida: { ms: DURACION.rapido, curva: CURVA.suave },
    },
    // Expresivo: entrada pausada con curva de aparición; retira en modo normal.
    expresivo: {
        entrada: { ms: DURACION.pausado, curva: CURVA.entrada },
        salida: { ms: DURACION.normal, curva: CURVA.salida },
    },
    // Experimental: escena con elástico SOLO en la entrada; retira a pausado.
    experimental: {
        entrada: { ms: DURACION.escena, curva: CURVA.elastico },
        salida: { ms: DURACION.pausado, curva: CURVA.salida },
    },
};

/** Amplitud de la respiración por registro: 1,01 casi quieta; tope 1,03. */
const ESCALA_RESPIRACION: Record<RegistroMovimiento, number> = {
    sobrio: 1.01,
    expresivo: 1.02,
    experimental: 1.03,
};

/** Cascada (ms) por sección, dentro del tope de `escalonar` (240 ms). */
const CASCADA_MS: Record<SeccionMovimiento, number> = {
    trinity: 60,
    astraura: 45,
    genesis: 75,
    malla: 55,
    biblioteca: 40,
    protomolecula: 85,
};

/** Periodo de la respiración (ms) por sección, entre 3.500 y 6.000. */
const PERIODO_MS: Record<SeccionMovimiento, number> = {
    trinity: 4500,
    astraura: 3800,
    genesis: 5200,
    malla: 4100,
    biblioteca: 5600,
    protomolecula: 3700,
};

/**
 * El movimiento de una sección con un registro. Determinista: el mismo par
 * (registro, sección) devuelve SIEMPRE el mismo objeto — sin red, disco ni
 * reloj — con la identidad de gesto igual en todos los equipos: el registro
 * manda el carácter (tiempos y amplitud) y la sección el ritmo.
 */
export function movimientoDe(registro: RegistroMovimiento, seccion: SeccionMovimiento): MovimientoRegistro {
    const tiempos = TIEMPOS[registro];
    return {
        entrada: { ...tiempos.entrada },
        salida: { ...tiempos.salida },
        cascadaMs: CASCADA_MS[seccion],
        respiracion: { escala: ESCALA_RESPIRACION[registro], periodoMs: PERIODO_MS[seccion] },
    };
}

/** Movimiento reducido: duraciones a 0 y escala a 1 — el estado final, quieto. */
export function aplicarMovimientoReducido(m: MovimientoRegistro): MovimientoRegistro {
    return {
        entrada: { ...m.entrada, ms: 0 },
        salida: { ...m.salida, ms: 0 },
        cascadaMs: 0,
        respiracion: { escala: 1, periodoMs: 0 },
    };
}
