/**
 * MOVIMIENTO — GRAMÁTICA DE MOVIMIENTO DEL OS (Ola 304 · zU5)
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo PURO: la UNICA fuente de duraciones, curvas, retardos en cascada y
 * micro-interacciones de la interfaz. Nada aquí toca el DOM ni el runtime:
 * los componentes consumen estos tokens para que el sistema se sienta uniforme,
 * sin que cada pieza invente su propia duración o curva a mano.
 *
 *  · DURACION  — la escala de tiempos (ms) que manda CLAUDE.md §8: suave, sin
 *                prisas y con la «voz» única del OS.
 *  · CURVA     — las curvas de easing con un comentario de cuándo usarlas.
 *  · tokensDe  — traduce cada micro-interacción a duración + curva (+ transform
 *                y sombra opcionales).
 *  · respetarMovimientoReducido — ante prefers-reduced-motion, duración 0 y
 *                ningún transform: el estado final se aplica de golpe (usable,
 *                simplemente no se mueve).
 *  · escalonar — el retardo en cascada de las listas, con tope para que el
 *                último elemento no se haga esperar.
 *  · cssDe     — «220ms cubic-bezier(0.4, 0, 0.2, 1)», listo para `transition`.
 */

/** Escala única de duraciones del OS (ms). Los tres del medio, 150-300 ms (§8). */
export const DURACION = {
    instantaneo: 90,
    rapido: 150,
    normal: 220,
    pausado: 300,
    escena: 480,
} as const;

/** Curvas de easing del OS, con el uso que le corresponde a cada una. */
export const CURVA = {
    /** Entrada: la interfaz responde al dedo/cursor. Para hover, press y aparición. */
    entrada: "cubic-bezier(0.16, 1, 0.3, 1)",
    /** Salida: la interfaz se retira. Para cierre de paneles, salida de elementos. */
    salida: "cubic-bezier(0.7, 0, 0.84, 0)",
    /** Suave (ease in-out estándar): para transiciones de estado neutras. */
    suave: "cubic-bezier(0.4, 0, 0.2, 1)",
    /** Elástico: micro-interacciones con «rebote» (puntos de logro, botones clave). */
    elastico: "cubic-bezier(0.34, 1.56, 0.64, 1)",
} as const;

/** Momento de una micro-interacción concreta de la interfaz. */
export type Interaccion =
    | "hover"
    | "press"
    | "entrar"
    | "salir"
    | "foco"
    | "error"
    | "exito";

/** Tokens de movimiento resultantes de una interacción. */
export interface TokensMovimiento {
    /** Duración en milisegundos. */
    duracionMs: number;
    /** Curva de easing resuelta. */
    curva: string;
    /** Transform CSS opcional para el estado en movimiento. */
    transform?: string;
    /** Sombra CSS opcional para reforzar la profundidad percibida. */
    sombra?: string;
}

type TokenBase = Pick<TokensMovimiento, "duracionMs" | "curva">;

/** `transform`/`sombra` por defecto para cada interacción. */
const TRANSFORMES: Partial<Record<Interaccion, Pick<TokensMovimiento, "transform" | "sombra">>> = {
    hover: { transform: "translateY(-1px)", sombra: "0 6px 16px rgb(0 0 0 / 0.14)" },
    press: { transform: "scale(0.97)", sombra: "0 1px 4px rgb(0 0 0 / 0.12)" },
    entrar: { transform: "translateY(0)" },
    salir: { transform: "translateY(4px)" },
    foco: { transform: "translateY(0)" },
};

/** Tokens por interacción, en la voz única de duraciones y curvas del OS. */
const BASE: Record<Interaccion, TokenBase> = {
    hover: { duracionMs: DURACION.rapido, curva: CURVA.entrada },
    press: { duracionMs: DURACION.instantaneo, curva: CURVA.entrada },
    entrar: { duracionMs: DURACION.normal, curva: CURVA.suave },
    salir: { duracionMs: DURACION.normal, curva: CURVA.salida },
    foco: { duracionMs: DURACION.rapido, curva: CURVA.suave },
    error: { duracionMs: DURACION.rapido, curva: CURVA.salida },
    exito: { duracionMs: DURACION.pausado, curva: CURVA.elastico },
};

/** Traduce una interacción a sus tokens de movimiento. */
export function tokensDe(i: Interaccion, movimientoReducido: boolean): TokensMovimiento {
    const t: TokensMovimiento = { ...BASE[i], ...TRANSFORMES[i] };
    return respetarMovimientoReducido(t, movimientoReducido);
}

/** Con movimiento reducido: duración 0 y ningún transform (sombra se mantiene). */
export function respetarMovimientoReducido<T extends { duracionMs: number }>(
    t: T,
    reducido: boolean,
): T {
    if (!reducido) return t;
    const sinTransform = { ...t, duracionMs: 0 };
    delete (sinTransform as Record<string, unknown>)["transform"];
    return sinTransform;
}

/** Retardo en cascada (ms) para listas, con tope para no demorar al último. */
export function escalonar(indice: number, pasoMs = 40, topeMs = 240): number {
    return Math.min(indice * pasoMs, topeMs);
}

/** Convierte tokens a un `transition` CSS listo para usar. */
export function cssDe(t: { duracionMs: number; curva: string }): string {
    return `${t.duracionMs}ms ${t.curva}`;
}