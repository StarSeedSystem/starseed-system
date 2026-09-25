/**
 * Gesto de rueda / panel táctil (trackpad) en escritorio (puro).
 * ─────────────────────────────────────────────────────────────────────────────
 * En un portátil, deslizar con dos dedos en horizontal sobre una cortina lateral
 * debe moverla como lo haría el dedo en un móvil. La rueda no tiene «soltar»:
 * se acumula el recorrido mientras llegan eventos y se decide cuando dejan de
 * llegar durante una pausa corta (`PAUSA_FIN_RUEDA_MS`).
 *
 * Signo: con desplazamiento natural (macOS, la mayoría de trackpads), mover los
 * dedos hacia la izquierda produce deltaX > 0. Por eso, para la cortina
 * izquierda, deltaX positivo la empuja hacia su borde: el panel sigue a los dedos.
 */

import { limitar } from "./geometria";
import type { EstadoPanel, Lado } from "./tipos";

/** Sin eventos durante este tiempo = el gesto terminó (los trackpads emiten cada 8-16 ms). */
export const PAUSA_FIN_RUEDA_MS = 180;
/** Fracción del panel que hay que acumular para que la rueda cierre. */
export const UMBRAL_RUEDA = 0.3;

/** Convierte un delta de `WheelEvent` a píxeles (0 píxel, 1 línea, 2 página). */
export function normalizarDelta(delta: number, modo: number): number {
    if (modo === 1) return delta * 16;
    if (modo === 2) return delta * 800;
    return delta;
}

/** ¿Es un gesto claramente horizontal? (no roba el desplazamiento vertical del contenido). */
export function esGestoLateral(dx: number, dy: number): boolean {
    return Math.abs(dx) > 0.5 && Math.abs(dx) > Math.abs(dy) * 1.2;
}

/** Delta de rueda proyectado hacia el cierre del panel del `lado` dado. */
export function deltaRuedaHaciaCierre(lado: Lado, dx: number, dy: number): number {
    switch (lado) {
        case "izquierda":
            return dx;
        case "derecha":
            return -dx;
        case "arriba":
            return dy;
        case "abajo":
            return -dy;
    }
}

/** Acumula recorrido: se permite un poco de estirón al revés (goma) y nunca más que el panel. */
export function acumularRueda(acumulado: number, delta: number, tam: number): number {
    return limitar(acumulado + delta, -tam * 0.15, tam);
}

/** Al terminar el gesto: ¿se cierra o vuelve a su sitio? */
export function decidirRueda(acumulado: number, tam: number, umbral = UMBRAL_RUEDA): EstadoPanel {
    return tam > 0 && acumulado / tam >= umbral ? "cerrado" : "abierto";
}
