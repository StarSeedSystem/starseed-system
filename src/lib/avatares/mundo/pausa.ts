/**
 * pausa.ts — decisión pura del tick de simulación del mundo.
 *
 * REGLA: `pausado` debe detener el avance de la simulación de verdad, no solo
 * reiniciar el temporizador. La pestaña oculta tampoco avanza (los ticks se
 * acumulan y se recuperan de uno en uno al volver).
 */

export interface PulsoMundo {
    /** El usuario pulsó «Pausar» en los controles del mundo. */
    pausado: boolean;
    /** La pestaña está oculta (`document.hidden`). */
    oculta: boolean;
}

/**
 * Devuelve true si el pulso actual debe avanzar la simulación.
 * Mientras `pausado` sea true, el estado del mundo no se mueve jamás.
 */
export function debeAvanzar(pulso: PulsoMundo): boolean {
    return !pulso.pausado && !pulso.oculta;
}
