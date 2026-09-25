/**
 * Preajustes de transición de StarSeed OS (puros).
 * ─────────────────────────────────────────────────────────────────────────────
 * Un único vocabulario de movimiento para todo el sistema, graduado por
 * `NivelMovimiento`. Duraciones cortas (180-420 ms): las transiciones deben
 * acompañar, nunca hacer esperar.
 *
 * Las entradas de página usan la Web Animations API (fotogramas que aquí se
 * describen) y NO un contenedor con transform permanente: un transform que se
 * queda puesto convierte la página en bloque contenedor de sus elementos
 * `position: fixed` (barras, visores, ventanas) y los descoloca.
 */

import type { NivelMovimiento } from "./nivel";

export interface Resorte {
    type: "spring";
    stiffness: number;
    damping: number;
    mass: number;
}

/** Resorte de las cortinas y paneles al soltar o al entrar. `null` = colocar sin animar. */
export function resortePanel(nivel: NivelMovimiento): Resorte | null {
    if (nivel === "minimo") return null;
    if (nivel === "suave") return { type: "spring", stiffness: 520, damping: 50, mass: 0.9 };
    return { type: "spring", stiffness: 340, damping: 34, mass: 0.95 };
}

/** Grados de inclinación 3D de un panel a medio abrir (0 = plano). */
export function inclinacionPanel(nivel: NivelMovimiento): number {
    return nivel === "completo" ? 9 : 0;
}

/**
 * Curva CSS con aspecto de resorte (sube rápido, se asienta con un rebote
 * mínimo). `linear()` existe en Chrome 113+, Safari 17.2+ y Firefox 112+;
 * quien la use debe comprobar `CSS.supports` y caer a `CURVA_RESPALDO`.
 */
export const CURVA_RESORTE =
    "linear(0, 0.22 7%, 0.58 17%, 0.84 28%, 0.97 39%, 1.02 48%, 1.025 56%, 1.01 70%, 1)";
export const CURVA_RESPALDO = "cubic-bezier(0.2, 0.9, 0.25, 1)";

export interface EntradaAnimada {
    fotogramas: Keyframe[];
    duracion: number;
    /** true = usar la curva de resorte (si el navegador la entiende). */
    resorte: boolean;
}

/**
 * Entrada de una página nueva. `seguro` = solo opacidad: para contenedores
 * pequeños o que envuelven piezas `fixed`, donde cualquier transform las movería.
 */
export function entradaPagina(nivel: NivelMovimiento, seguro = false): EntradaAnimada {
    if (nivel === "minimo" || seguro) {
        return { fotogramas: [{ opacity: 0 }, { opacity: 1 }], duracion: nivel === "minimo" ? 140 : 220, resorte: false };
    }
    if (nivel === "suave") {
        return {
            fotogramas: [
                { opacity: 0, transform: "translate3d(0, 10px, 0)" },
                { opacity: 1, transform: "translate3d(0, 0, 0)" },
            ],
            duracion: 240,
            resorte: false,
        };
    }
    return {
        fotogramas: [
            { opacity: 0, transform: "perspective(1600px) translate3d(0, 18px, -70px) rotateX(5deg)", transformOrigin: "50% 0%" },
            { opacity: 1, transform: "perspective(1600px) translate3d(0, 0, 0) rotateX(0deg)", transformOrigin: "50% 0%" },
        ],
        duracion: 420,
        resorte: true,
    };
}

/** Dirección del cambio de paso: 1 = avanzar, -1 = retroceder. */
export type Direccion = 1 | -1;

export interface EstadoPaso {
    opacity: number;
    x?: number;
    rotateY?: number;
    scale?: number;
}

/**
 * Pasos de asistentes y guías (framer-motion): el paso nuevo entra girando de
 * canto desde el lado hacia el que se avanza y el anterior sale por el otro,
 * como hojas en profundidad. El contenedor debe llevar `perspective` en CSS.
 */
export function variantesPaso(nivel: NivelMovimiento): {
    entrar: (d: Direccion) => EstadoPaso;
    centro: EstadoPaso;
    salir: (d: Direccion) => EstadoPaso;
} {
    if (nivel === "minimo") {
        return { entrar: () => ({ opacity: 0 }), centro: { opacity: 1 }, salir: () => ({ opacity: 0 }) };
    }
    if (nivel === "suave") {
        return {
            entrar: (d) => ({ opacity: 0, x: 24 * d }),
            centro: { opacity: 1, x: 0 },
            salir: (d) => ({ opacity: 0, x: -24 * d }),
        };
    }
    return {
        entrar: (d) => ({ opacity: 0, x: 56 * d, rotateY: -16 * d, scale: 0.96 }),
        centro: { opacity: 1, x: 0, rotateY: 0, scale: 1 },
        salir: (d) => ({ opacity: 0, x: -56 * d, rotateY: 16 * d, scale: 0.96 }),
    };
}

/** Transición de los pasos: resorte en completo/suave, fundido corto en mínimo. */
export function transicionPaso(nivel: NivelMovimiento): Resorte | { duration: number } {
    return resortePanel(nivel) ?? { duration: 0.14 };
}
