/**
 * REGISTROS DE MOVIMIENTO — «DANZA DEL OS» (Ola 1024D · DAN1024B · parte 1)
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo PURO: tres registros de movimiento (sobrio, expresivo, experimental)
 * para las seis secciones de animación del OS. NO inventa duraciones ni curvas:
 * todo sale de `DURACION` y `CURVA` de `movimiento.ts`, la única fuente de
 * la gramática de movimiento. Interfaz 140–350 ms (§6 de vídeo: los números
 * del vídeo NO se copian a la interfaz).
 *
 *  · movimientoDe              — registro × sección → tokens de entrada,
 *                                salida, cascada y respiración.
 *  · aplicarMovimientoReducido — ante prefers-reduced-motion: ms en 0 y
 *                                escala en 1 (estado final sin moverse).
 * Solo se animan transform y opacity; aquí solo se fija el TIEMPO.
 */

import { CURVA, DURACION } from "./movimiento";

/** Registro de animación: el carácter del movimiento en una sección. */
export type RegistroMovimiento = "sobrio" | "expresivo" | "experimental";

/** Secciones del OS que reciben movimiento diseñado. */
export type SeccionMovimiento =
    | "trinity"
    | "astraura"
    | "genesis"
    | "malla"
    | "biblioteca"
    | "protomolecula";

/** Tiempo y curva de un momento de la animación. */
export interface TokensTiempo {
    /** Duración en milisegundos. */
    ms: number;
    /** Curva de easing (siempre una de `CURVA`). */
    curva: string;
}

/** Respiración continua del elemento (pulsación sutil de escala). */
export interface Respiracion {
    /** Escala máxima sobre 1 (entre 1 y 1,03). */
    escala: number;
    /** Un ciclo completo de respiración, en ms. */
    periodoMs: number;
}

/** Movimiento completo de una sección con cierto registro. */
export interface MovimientoSeccion {
    entrada: TokensTiempo;
    salida: TokensTiempo;
    /** Retardo entre elementos hermanos (efecto cascada). */
    cascadaMs: number;
    respiracion: Respiracion;
}

/** Momentos base por registro, SOLO con `DURACION` y `CURVA`. La salida siempre más corta que la entrada. */
const BASE: Record<RegistroMovimiento, { entrada: TokensTiempo; salida: TokensTiempo }> = {
    sobrio: {
        entrada: { ms: DURACION.normal, curva: CURVA.suave },
        salida: { ms: DURACION.rapido, curva: CURVA.suave },
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

/** Ajuste fino por sección: cascada y respiración (nunca tokens nuevos). */
const SECCIONES: Record<SeccionMovimiento, { cascadaMs: number; respiracion: Respiracion }> = {
    trinity: { cascadaMs: 40, respiracion: { escala: 1.005, periodoMs: 4000 } },
    astraura: { cascadaMs: 60, respiracion: { escala: 1.01, periodoMs: 3800 } },
    genesis: { cascadaMs: 30, respiracion: { escala: 1.008, periodoMs: 4500 } },
    malla: { cascadaMs: 80, respiracion: { escala: 1.015, periodoMs: 5000 } },
    biblioteca: { cascadaMs: 40, respiracion: { escala: 1.012, periodoMs: 5500 } },
    protomolecula: { cascadaMs: 100, respiracion: { escala: 1.02, periodoMs: 3600 } },
};

/** Devuelve el movimiento completo para un registro y una sección. */
export function movimientoDe(registro: RegistroMovimiento, seccion: SeccionMovimiento): MovimientoSeccion {
    const base = BASE[registro];
    const s = SECCIONES[seccion];
    return {
        entrada: { ...base.entrada },
        salida: { ...base.salida },
        cascadaMs: s.cascadaMs,
        respiracion: { ...s.respiracion },
    };
}

/** Ante prefers-reduced-motion: ms en 0 y escala en 1; estado final sin moverse. */
export function aplicarMovimientoReducido(m: MovimientoSeccion): MovimientoSeccion {
    return {
        entrada: { ...m.entrada, ms: 0 },
        salida: { ...m.salida, ms: 0 },
        cascadaMs: m.cascadaMs,
        respiracion: { ...m.respiracion, escala: 1 },
    };
}
