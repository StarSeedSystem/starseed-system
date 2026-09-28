/**
 * Tienda mínima para `useSyncExternalStore` (L5 · 2026-09-28).
 *
 * ⚠️ Regla de oro (React #185 en producción): `getSnapshot` devuelve SIEMPRE el mismo objeto
 * mientras nada cambie. Aquí el snapshot es un valor guardado; solo `fijar` lo sustituye, y solo
 * si el nuevo valor es distinto (por referencia o por la igualdad que se pase). Nunca se
 * construye un objeto nuevo al leer.
 */

export interface Tienda<T> {
    obtener: () => T;
    suscribir: (oyente: () => void) => () => void;
    /** Sustituye el valor y avisa (no hace nada si `igual(previo, siguiente)`). */
    fijar: (siguiente: T) => void;
    /** Actualiza a partir del valor actual; si el actualizador devuelve el mismo valor, no avisa. */
    cambiar: (fn: (previo: T) => T) => void;
}

export function crearTienda<T>(inicial: T, igual: (a: T, b: T) => boolean = Object.is): Tienda<T> {
    let valor = inicial;
    const oyentes = new Set<() => void>();
    const fijar = (siguiente: T) => {
        if (igual(valor, siguiente)) return;
        valor = siguiente;
        for (const o of Array.from(oyentes)) {
            try {
                o();
            } catch {
                /* un oyente roto no tumba a los demás */
            }
        }
    };
    return {
        obtener: () => valor,
        suscribir: (oyente) => {
            oyentes.add(oyente);
            return () => {
                oyentes.delete(oyente);
            };
        },
        fijar,
        cambiar: (fn) => fijar(fn(valor)),
    };
}

/** Igualdad superficial de objetos planos (mismas claves, mismos valores por referencia). */
export function igualSuperficial<T extends object>(a: T, b: T): boolean {
    if (a === b) return true;
    const ka = Object.keys(a) as (keyof T)[];
    const kb = Object.keys(b) as (keyof T)[];
    if (ka.length !== kb.length) return false;
    for (const k of ka) if (!Object.is(a[k], b[k])) return false;
    return true;
}
