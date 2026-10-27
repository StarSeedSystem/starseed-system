/**
 * REGISTROS DE MOVIMIENTO POR SECCIÓN (Ola 1024D · DAN1024B)
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo PURO: traduce un registro creativo (sobrio, expresivo, experimental) y
 * una sección del OS a tokens de movimiento. No toca el DOM, ni la red, ni el
 * reloj: la misma pareja produce siempre el mismo objeto.
 *
 * Las duraciones y las curvas salen SIEMPRE de `movimiento.ts`; aquí solo se
 * elige entre sus tokens. La cascada y la respiración son el pulso propio de
 * cada sección: el mismo gesto se siente distinto en la Trinity o en la malla.
 */

import { CURVA, DURACION } from "@/lib/design/movimiento";

/** Carácter del movimiento: de la mesura al gesto de escena. */
export type RegistroMovimiento = "sobrio" | "expresivo" | "experimental";

/** Secciones del OS con movimiento propio. */
export type SeccionMovimiento =
    | "trinity"
    | "astraura"
    | "genesis"
    | "malla"
    | "biblioteca"
    | "protomolecula";

/** Un tramo de movimiento: duración y curva del OS. */
export interface TramoMovimiento {
    /** Duración del tramo, en milisegundos. */
    ms: number;
    /** Curva de easing de `CURVA`. */
    curva: string;
}

/** Respiración de la sección: latido lento y apenas perceptible. */
export interface RespiracionMovimiento {
    /** Escala máxima del latido (1 = inmóvil). */
    escala: number;
    /** Periodo completo del latido, en milisegundos. */
    periodoMs: number;
}

/** Movimiento resuelto para una pareja registro + sección. */
export interface MovimientoSeccion {
    entrada: TramoMovimiento;
    salida: TramoMovimiento;
    /** Retardo entre elementos consecutivos de una lista, en milisegundos. */
    cascadaMs: number;
    respiracion: RespiracionMovimiento;
}

/** Entrada de cada registro: cómo aparece el contenido. */
const ENTRADA: Record<RegistroMovimiento, TramoMovimiento> = {
    sobrio: { ms: DURACION.normal, curva: CURVA.suave },
    expresivo: { ms: DURACION.pausado, curva: CURVA.entrada },
    experimental: { ms: DURACION.escena, curva: CURVA.elastico },
};

/** Salida de cada registro: siempre más corta que su entrada. */
const SALIDA: Record<RegistroMovimiento, TramoMovimiento> = {
    sobrio: { ms: DURACION.rapido, curva: CURVA.salida },
    expresivo: { ms: DURACION.normal, curva: CURVA.salida },
    experimental: { ms: DURACION.pausado, curva: CURVA.salida },
};

/** Pulso propio de cada sección: paso de cascada y respiración. */
const SECCIONES: Record<
    SeccionMovimiento,
    { pasoCascadaMs: number; respiracion: RespiracionMovimiento }
> = {
    trinity: { pasoCascadaMs: 40, respiracion: { escala: 1.012, periodoMs: 4200 } },
    astraura: { pasoCascadaMs: 60, respiracion: { escala: 1.018, periodoMs: 5000 } },
    genesis: { pasoCascadaMs: 50, respiracion: { escala: 1.015, periodoMs: 4600 } },
    malla: { pasoCascadaMs: 30, respiracion: { escala: 1.022, periodoMs: 5500 } },
    biblioteca: { pasoCascadaMs: 35, respiracion: { escala: 1.008, periodoMs: 3800 } },
    protomolecula: { pasoCascadaMs: 70, respiracion: { escala: 1.027, periodoMs: 6000 } },
};

/**
 * Cuánto alarga cada registro la cascada de la sección. El sobrio no escalona
 * de más; el experimental deja que la escena se despliegue por partes.
 */
const FACTOR_CASCADA: Record<RegistroMovimiento, number> = {
    sobrio: 1,
    expresivo: 1.25,
    experimental: 1.5,
};

/**
 * Resuelve el movimiento de una pareja registro + sección. Determinista y puro:
 * entrada y salida vienen de los tokens del OS; cascada y respiración, del
 * carácter de la sección. La salida siempre dura menos que la entrada.
 */
export function movimientoDe(
    registro: RegistroMovimiento,
    seccion: SeccionMovimiento,
): MovimientoSeccion {
    const perfil = SECCIONES[seccion];
    return {
        entrada: { ...ENTRADA[registro] },
        salida: { ...SALIDA[registro] },
        cascadaMs: Math.round(perfil.pasoCascadaMs * FACTOR_CASCADA[registro]),
        respiracion: { ...perfil.respiracion },
    };
}

/**
 * Aplica `prefers-reduced-motion`: las duraciones de entrada, salida y cascada
 * quedan en 0 y la respiración deja de latir (escala 1). El estado final se
 * aplica de golpe, sin animación.
 */
export function aplicarMovimientoReducido(r: MovimientoSeccion): MovimientoSeccion {
    return {
        entrada: { curva: r.entrada.curva, ms: 0 },
        salida: { curva: r.salida.curva, ms: 0 },
        cascadaMs: 0,
        respiracion: { escala: 1, periodoMs: r.respiracion.periodoMs },
    };
}
