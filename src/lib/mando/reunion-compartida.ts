/**
 * Una sola reunión a la vez. Quien llega mientras otra corre se suma a esa; quien
 * llega justo después se lleva el resultado fresco. Y mientras lentea, se enseña la
 * última cifra buena en vez del cero: mejor un dato de hace 20 s que ningún dato.
 */
export interface OpcionesReunion {
    frescoMs?: number;
    esperaMs?: number;
    ahora?: () => number;
}

export interface ResultadoReunion<T> {
    datos: T | null;
    t: number;
    obsoleto: boolean;
}

const FRESCO_DEFECTO_MS = 15_000;
const ESPERA_DEFECTO_MS = 6_000;

export function crearReunionCompartida<T>(fn: () => Promise<T>, opciones: OpcionesReunion = {}): {
    obtener(): Promise<ResultadoReunion<T>>;
} {
    const frescoMs = opciones.frescoMs ?? FRESCO_DEFECTO_MS;
    const esperaMs = opciones.esperaMs ?? ESPERA_DEFECTO_MS;
    const ahora = opciones.ahora ?? (() => Date.now());

    let ultimo: { datos: T; t: number } | null = null;
    let enMarcha: Promise<T | null> | null = null;

    // Una única llamada viva siempre. Un fallo NO borra el último bueno: solo libera
    // el turno para el siguiente intento.
    const arrancar = (): Promise<T | null> => {
        if (!enMarcha) {
            enMarcha = (async (): Promise<T | null> => {
                try {
                    const datos = await fn();
                    ultimo = { datos, t: ahora() };
                    return datos;
                } catch {
                    return null;
                } finally {
                    enMarcha = null;
                }
            })();
        }
        return enMarcha;
    };

    const esperarConTope = (p: Promise<T | null>): Promise<T | null | "__tope__"> =>
        Promise.race([p, new Promise<"__tope__">((res) => setTimeout(() => res("__tope__"), esperaMs))]);

    async function obtener(): Promise<ResultadoReunion<T>> {
        if (ultimo && ahora() - ultimo.t < frescoMs) {
            return { datos: ultimo.datos, t: ultimo.t, obsoleto: false };
        }
        const p = arrancar();
        // Sin nada anterior no hay más remedio que aguantar a que termine.
        if (ultimo === null) {
            const d = await p;
            const quedo = ultimo as { datos: T; t: number } | null;
            return quedo
                ? { datos: quedo.datos, t: quedo.t, obsoleto: false }
                : { datos: d, t: ahora(), obsoleto: true };
        }
        const viejo = ultimo as { datos: T; t: number } | null;
        if (!viejo) return { datos: null, t: ahora(), obsoleto: true };
        const r = await esperarConTope(p);
        if (r !== "__tope__" && r !== null) {
            return { datos: r, t: ahora(), obsoleto: false };
        }
        // Tope vencido o reunión fallida: la cifra vieja se enseña y la llamada sigue
        // por su cuenta; cuando acabe actualizará `ultimo`.
        return { datos: viejo.datos, t: viejo.t, obsoleto: true };
    }

    return { obtener };
}
