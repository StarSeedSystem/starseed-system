/**
 * Motor de gestos de StarSeed OS — tipos compartidos.
 * ─────────────────────────────────────────────────────────────────────────────
 * Todo el motor habla en los mismos términos para ratón, dedo y lápiz: una
 * «muestra» es una posición con su instante, venga de un PointerEvent, de un
 * TouchEvent o de una rueda. Así la física no sabe (ni necesita saber) qué
 * dispositivo la mueve, y el mismo gesto se siente igual en cualquier pantalla.
 */

/** Lado de la pantalla en el que vive un panel (y hacia el que se cierra). */
export type Lado = "izquierda" | "derecha" | "arriba" | "abajo";

/** Eje del gesto: horizontal para los paneles laterales, vertical para arriba/abajo. */
export type Eje = "x" | "y";

/** Una posición del puntero en un instante (ms, `performance.now()` o `event.timeStamp`). */
export interface Muestra {
    x: number;
    y: number;
    t: number;
}

/** Estado estable de un panel: donde termina un gesto. */
export type EstadoPanel = "abierto" | "cerrado";

/** Los cuatro nodos cardinales de Trinity. */
export type BordeTrinity = "zenith" | "horizon" | "logic" | "anchor";
