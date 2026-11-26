/**
 * Caché de promesas para cargas caras (IMG-agentes-reimaginada · versión genérica).
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ: una caché por clave que COMPARTE la carga en vuelo (una sola promesa para todos los
 * que piden lo mismo) y que NUNCA deja una promesa rechazada dentro: al fallar se borra en el
 * acto, así el siguiente intento vuelve a cargar de verdad en vez de heredar el fallo.
 *
 * POR QUÉ: una carga que muere por timeout, red o 429/402 no puede quedarse pegada en la caché
 * contaminando los intentos siguientes. Además, los intentos están limitados: agotados, se
 * corta en seco durante un enfriamiento y no se vuelve a llamar al cargador (sin gastar
 * créditos). Pasado el enfriamiento, se reintenta solo.
 *
 * Puro: sin `node:*`, sin DOM ni three.js; el reloj se inyecta para probarlo con tiempo falso.
 * Regla del área: el contenido es UNA entidad — aquí se referencia la misma promesa, no se
 * duplica el trabajo.
 */

export interface OpcionesCachePromesas {
    /** Intentos seguidos antes de bloquear la clave (por defecto 3). */
    maxIntentos?: number;
    /** Tiempo de enfriamiento tras agotar los intentos, en ms (por defecto 30 s). */
    enfriamientoMs?: number;
    /** Reloj inyectable (por defecto `Date.now`). */
    ahora?: () => number;
}

export interface EstadoClave {
    /** Fallos seguidos desde el último éxito. */
    intentos: number;
    /** Momento (ms) hasta el que no se reintenta; 0 si aún quedan intentos. */
    bloqueadaHasta: number;
}

export interface CachePromesas<T> {
    /** Devuelve la carga ya en vuelo o arranca una nueva; un fallo se descarta al instante. */
    obtener(clave: string, cargar: () => Promise<T>): Promise<T>;
    /** Olvida una clave (o todas) y sus intentos. */
    olvidar(clave?: string): void;
    /** Claves con carga viva o resuelta (las rechazadas no cuentan). */
    tamano(): number;
    /** Contador de fallos de una clave, o null si está sana. */
    estado(clave: string): EstadoClave | null;
}

/** El cargador no se llama porque la clave agotó sus intentos y sigue en enfriamiento. */
export class LimiteIntentosError extends Error {
    readonly clave: string;
    readonly intentos: number;

    constructor(clave: string, intentos: number) {
        super(`No se reintenta «${clave}»: ${intentos} intentos fallidos seguidos.`);
        this.name = "LimiteIntentosError";
        this.clave = clave;
        this.intentos = intentos;
    }
}

export function crearCachePromesas<T>(opciones: OpcionesCachePromesas = {}): CachePromesas<T> {
    const maxIntentos = Math.max(1, opciones.maxIntentos ?? 3);
    const enfriamientoMs = Math.max(0, opciones.enfriamientoMs ?? 30_000);
    const ahora = opciones.ahora ?? (() => Date.now());
    const entradas = new Map<string, Promise<T>>();
    const cuentas = new Map<string, EstadoClave>();

    const obtener = (clave: string, cargar: () => Promise<T>): Promise<T> => {
        const viva = entradas.get(clave);
        if (viva) return viva;

        const cuenta = cuentas.get(clave);
        if (cuenta && cuenta.intentos >= maxIntentos) {
            if (ahora() < cuenta.bloqueadaHasta) {
                return Promise.reject(new LimiteIntentosError(clave, cuenta.intentos));
            }
            cuentas.delete(clave);
        }

        let promesa: Promise<T>;
        try {
            promesa = Promise.resolve(cargar());
        } catch (error) {
            promesa = Promise.reject(error);
        }
        entradas.set(clave, promesa);
        promesa.then(
            () => {
                // Solo si esta carga sigue siendo la vigente (no la olvidó ni la sustituyó otra).
                if (entradas.get(clave) === promesa) cuentas.delete(clave);
            },
            () => {
                // Un fallo de una carga ya olvidada o sustituida no cuenta ni contamina.
                if (entradas.get(clave) !== promesa) return;
                entradas.delete(clave);
                const previa = cuentas.get(clave);
                const intentos = (previa?.intentos ?? 0) + 1;
                cuentas.set(clave, {
                    intentos,
                    bloqueadaHasta: intentos >= maxIntentos ? ahora() + enfriamientoMs : 0,
                });
            },
        );
        return promesa;
    };

    const olvidar = (clave?: string): void => {
        if (clave === undefined) {
            entradas.clear();
            cuentas.clear();
            return;
        }
        entradas.delete(clave);
        cuentas.delete(clave);
    };

    return {
        obtener,
        olvidar,
        tamano: () => entradas.size,
        estado: (clave) => {
            const cuenta = cuentas.get(clave);
            return cuenta ? { ...cuenta } : null;
        },
    };
}
