/**
 * Umbral de intención (puro).
 * ─────────────────────────────────────────────────────────────────────────────
 * Un toque no es un arrastre hasta que el dedo o el ratón demuestran que quieren
 * mover el panel: recorrer una distancia mínima Y hacerlo en la dirección del
 * eje, sin salirse de un cono de ángulo. Esto es lo que permite:
 *   · pulsar botones dentro de un panel arrastrable (el clic nunca se roba),
 *   · desplazar en vertical el contenido de una cortina lateral (el scroll
 *     nunca se roba),
 * y que el gesto solo «agarre» el panel cuando de verdad se lo pide.
 */

import type { Eje } from "./tipos";

export type Intencion = "pendiente" | "aceptada" | "rechazada";

export interface OpcionesIntencion {
    /** Distancia mínima (px) antes de decidir. Ratón ≈ 6, dedo ≈ 10 (el dedo tiembla más). */
    umbralPx?: number;
    /** Ángulo máximo (grados) respecto del eje para aceptar. */
    anguloMaxGrados?: number;
    /**
     * Si se exige un sentido del eje: +1 (positivo), -1 (negativo) o 0 (cualquiera).
     * Abrir desde el borde izquierdo exige +1 en x (hacia dentro): arrastrar hacia
     * fuera no significa nada y no debe armar el gesto.
     */
    soloHacia?: 1 | -1 | 0;
}

export const UMBRAL_INTENCION_RATON_PX = 6;
export const UMBRAL_INTENCION_TACTIL_PX = 10;
export const ANGULO_INTENCION_GRADOS = 35;

/** Decide si un desplazamiento (dx, dy) ya expresa la intención de arrastrar en `eje`. */
export function evaluarIntencion(eje: Eje, dx: number, dy: number, opciones: OpcionesIntencion = {}): Intencion {
    const umbral = opciones.umbralPx ?? UMBRAL_INTENCION_TACTIL_PX;
    const anguloMax = opciones.anguloMaxGrados ?? ANGULO_INTENCION_GRADOS;
    const soloHacia = opciones.soloHacia ?? 0;

    const principal = eje === "x" ? dx : dy;
    const secundario = eje === "x" ? dy : dx;
    const distancia = Math.hypot(dx, dy);
    if (distancia < umbral) return "pendiente";

    // Ángulo respecto al eje: 0° = perfectamente alineado, 90° = perpendicular.
    const angulo = (Math.atan2(Math.abs(secundario), Math.abs(principal)) * 180) / Math.PI;
    if (angulo > anguloMax) return "rechazada";
    if (soloHacia !== 0 && Math.sign(principal) !== soloHacia) return "rechazada";
    return "aceptada";
}

/** Umbral recomendado según el tipo de puntero (`PointerEvent.pointerType`). */
export function umbralParaPuntero(tipo: string | undefined): number {
    return tipo === "mouse" ? UMBRAL_INTENCION_RATON_PX : UMBRAL_INTENCION_TACTIL_PX;
}
