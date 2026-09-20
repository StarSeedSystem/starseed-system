// Selección radial del menú flotante — matemática pura de la corona de
// opciones: por dónde está el dedo respecto al centro se decide qué opción
// está resaltada. Sin DOM, sin red: entra (dx, dy), sale un índice.

export interface OpcionRadial {
    id: string;
    etiqueta: string;
}

/** Distancia mínima desde el centro para que haya opción resaltada. */
export const RADIO_MINIMO_SELECCION = 24;

/** Radio en px al que se dibujan las opciones alrededor del dedo. */
export const RADIO_CORONA = 76;

/**
 * Devuelve el índice de la opción más cercana al dedo, repartiendo los 360°
 * entre las N opciones. La opción 0 está ARRIBA (norte) y el resto va en
 * sentido horario. Devuelve `null` si el dedo está dentro del radio mínimo
 * (zona muerta: soltar ahí cierra sin elegir) o si no hay opciones.
 */
export function indicePorDedo(
    dx: number,
    dy: number,
    totalOpciones: number,
    radioMinimo: number = RADIO_MINIMO_SELECCION
): number | null {
    if (totalOpciones < 1) return null;
    if (Math.hypot(dx, dy) < radioMinimo) return null;

    // Ángulo en radianes donde 0 = arriba y crece en sentido horario.
    // atan2(dy, dx) mide 0 = este y crece antihorario en pantalla (y hacia
    // abajo), así que se reexpresa con el eje vertical invertido.
    const angulo = Math.atan2(dx, -dy);
    const sector = (Math.PI * 2) / totalOpciones;
    const crudo = Math.round(angulo / sector);
    return ((crudo % totalOpciones) + totalOpciones) % totalOpciones;
}

/**
 * Posición (px, relativa al centro de la corona) donde dibujar la opción
 * `indice`: la 0 sale arriba y las demás siguen en sentido horario, para que
 * el dibujo coincida con `indicePorDedo`.
 */
export function posicionOpcion(
    indice: number,
    totalOpciones: number,
    radio: number = RADIO_CORONA
): { x: number; y: number } {
    if (totalOpciones < 1) return { x: 0, y: 0 };
    const angulo = (Math.PI * 2 * indice) / totalOpciones;
    return {
        // `+ 0` normaliza el -0 (Object.is(-0, 0) es false y rompe comparaciones).
        x: Math.round(Math.sin(angulo) * radio) + 0,
        y: Math.round(-Math.cos(angulo) * radio) + 0,
    };
}
