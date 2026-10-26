/**
 * Historial de deshacer/rehacer del editor de iconos (Ola 1025U · V1b) — puro.
 *
 * Arrastrar un deslizador emite decenas de valores por segundo; si cada uno fuera un paso, «Deshacer» no
 * serviría. Los cambios con la misma `clave` en una ráfaga corta (por defecto 700 ms) se funden en UN paso:
 * deshacer vuelve al valor de antes de la ráfaga entera.
 */

export interface Historial<T> {
    pasado: T[];
    presente: T;
    futuro: T[];
    /** Clave y hora del último cambio (para fundir ráfagas). */
    clave?: string;
    t?: number;
}

export const MAX_PASOS = 50;
export const VENTANA_RAFAGA_MS = 700;

export function crearHistorial<T>(inicial: T): Historial<T> {
    return { pasado: [], presente: inicial, futuro: [] };
}

export interface OpcionesProponer<T> {
    clave?: string;
    ahora?: number;
    ventanaMs?: number;
    igual?: (a: T, b: T) => boolean;
}

export function proponer<T>(h: Historial<T>, valor: T, opciones: OpcionesProponer<T> = {}): Historial<T> {
    const ahora = opciones.ahora ?? Date.now();
    const igual = opciones.igual ?? ((a: T, b: T) => Object.is(a, b));
    if (igual(h.presente, valor)) return h;
    const enRafaga =
        opciones.clave !== undefined &&
        opciones.clave === h.clave &&
        h.t !== undefined &&
        ahora - h.t < (opciones.ventanaMs ?? VENTANA_RAFAGA_MS);
    if (enRafaga) return { ...h, presente: valor, futuro: [], t: ahora };
    return {
        pasado: [...h.pasado, h.presente].slice(-MAX_PASOS),
        presente: valor,
        futuro: [],
        clave: opciones.clave,
        t: ahora,
    };
}

export const puedeDeshacer = <T>(h: Historial<T>) => h.pasado.length > 0;
export const puedeRehacer = <T>(h: Historial<T>) => h.futuro.length > 0;

export function deshacer<T>(h: Historial<T>): Historial<T> {
    if (!h.pasado.length) return h;
    const pasado = h.pasado.slice(0, -1);
    return { pasado, presente: h.pasado[h.pasado.length - 1], futuro: [h.presente, ...h.futuro].slice(0, MAX_PASOS) };
}

export function rehacer<T>(h: Historial<T>): Historial<T> {
    if (!h.futuro.length) return h;
    const [siguiente, ...futuro] = h.futuro;
    return { pasado: [...h.pasado, h.presente].slice(-MAX_PASOS), presente: siguiente, futuro };
}

/** Empieza de cero con un valor (p. ej. al abrir el editor de otro icono). */
export function reiniciar<T>(valor: T): Historial<T> {
    return crearHistorial(valor);
}
