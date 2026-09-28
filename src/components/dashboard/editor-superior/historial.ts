/**
 * Historial de deshacer/rehacer del editor — PURO.
 *
 * Una pila corta por pestaña: cada cambio del editor apunta la foto ANTERIOR; deshacer la
 * recupera y guarda la actual para rehacer. Un cambio nuevo borra el futuro, como en cualquier
 * editor. No se guarda en disco: vive lo que dura la sesión de edición.
 */
export interface Historial<T> {
    pasado: T[];
    futuro: T[];
}

export const LIMITE_HISTORIAL = 30;

export function historialVacio<T>(): Historial<T> {
    return { pasado: [], futuro: [] };
}

export function registrar<T>(h: Historial<T>, anterior: T, limite = LIMITE_HISTORIAL): Historial<T> {
    const pasado = [...h.pasado, anterior];
    while (pasado.length > limite) pasado.shift();
    return { pasado, futuro: [] };
}

export function deshacer<T>(h: Historial<T>, actual: T): { historial: Historial<T>; valor: T } | null {
    if (h.pasado.length === 0) return null;
    const valor = h.pasado[h.pasado.length - 1];
    return { historial: { pasado: h.pasado.slice(0, -1), futuro: [actual, ...h.futuro] }, valor };
}

export function rehacer<T>(h: Historial<T>, actual: T): { historial: Historial<T>; valor: T } | null {
    if (h.futuro.length === 0) return null;
    const [valor, ...futuro] = h.futuro;
    return { historial: { pasado: [...h.pasado, actual], futuro }, valor };
}
