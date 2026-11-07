"use client";

/**
 * Singleton manager de preferencia de movimiento reducido.
 * Centraliza la detección de `prefers-reduced-motion` y garantiza una única fuente de verdad.
 *
 * Propósito:
 * - Leer la preferencia una sola vez por sesión (sin costosos matchMedia en cada efecto).
 * - Expone solo `isReducedMotion`, `isReducedMotionActive` (booleano actualizado con el listener) y `subscribe`
 * - Permite comprobaciones SSR-safe.
 * - Respeta las reglas de "una sola exportación" para imports limpios.
 */

/** Estado interno del singleton */
interface EstadoPRM {
    activo: boolean;
    subscripciones: Set<(activo: boolean) => void>;
    inicializado: boolean;
}

const estado: EstadoPRM = {
    activo: false,
    subscripciones: new Set(),
    inicializado: false,
};

function establecerActivo(nuevo: boolean): void {
    if (estado.activo !== nuevo) {
        estado.activo = nuevo;
        estado.subscripciones.forEach((fn) => fn(nuevo));
    }
}

/** Inicializa el singleton escuchando cambios de media query. SSR-safe. */
function inicializarSingletonPRM(): void {
    if (estado.inicializado || typeof window === "undefined") return;

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");

    // Estado inicial inmediato (coincide con prefiereReducirMovimiento del motor).
    establecerActivo(mq.matches);

    const actualizar = () => establecerActivo(mq.matches);
    mq.addEventListener("change", actualizar);

    // Cleanup opcional (no expuesto; se destruye cuando el módulo desaparece).
    // Podría hacer referencia a la función de cleanup si necesitáramos un control manual,
    // pero el ciclo de vida del módulo coincide con la vida de la pestaña.

    estado.inicializado = true;
}

// Inicializar automáticamente cuando se importe (lado cliente).
if (typeof window !== "undefined") {
    // Usar setTimeout para que la lectura inicial del estado no bloquee la primera renderización.
    // Esto también da tiempo a que los componentes demanden el valor antes de que el listener
    // del Sistema Operativo pueda cambiarlo (raro pero posible en macOS, ejemplo: accesibilidad global).
    setTimeout(inicializarSingletonPRM, 0);
}

/** Singleton manager de preferencia de movimiento reducido.
 *
 * @returns `isReducedMotion`: booleano de solo lectura para el valor actual.
 * @returns `isReducedMotionActive`: mismo que `isReducedMotion`, expuesto explícitamente para chequeos.
 * @returns `subscribe`: callback para actualizaciones del sistema (cambio de SO o usuario).
 */
export function isReducedMotion(): boolean {
    // Inicializar temprano si aún no (puede ocurrir si este módulo se importa después de que
    // un matchMedia haya cambiado ya).
    if (!estado.inicializado && typeof window !== "undefined") {
        inicializarSingletonPRM();
    }
    return estado.activo;
}

// Alias para facilitar la lectura en componentes que ya usan `isReducedMotion`.
export { isReducedMotion as isReducedMotionActive };

/** Callback para cambios del sistema operativo o usuario en motion.
 *
 * @param fn Función que recibe el valor actual (activo/inactivo).
 * @returns Función para cancelar la suscripción.
 */
export function subscribePRM(fn: (activo: boolean) => void): () => void {
    estado.subscripciones.add(fn);
    // Devolver el estado actual inmediatamente.
    fn(estado.activo);
    return () => {
        estado.subscripciones.delete(fn);
    };
}
