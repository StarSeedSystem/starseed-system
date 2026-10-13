/**
 * Una sola reunión a la vez. Quien llega mientras otra corre se suma a esa; quien
 * llega justo después se lleva el resultado fresco. Y mientras lentea, se enseña la
 * última cifra buena en vez del cero: mejor un dato de hace 20 s que ningún dato.
 */
export interface OpcionesReunion {
    frescoMs?: number;
    esperaMs?: number;
    /** Una reunión que tarda más que esto se da por colgada: se suelta y la siguiente arranca. */
    maxEnMarchaMs?: number;
    ahora?: () => number;
    /** Aviso cuando se suelta una reunión colgada (por defecto, `console.warn`). */
    avisar?: (texto: string) => void;
    /** (2026-10-13) Una cifra anterior más joven que esto no se marca «obsoleta» aunque venza el
     *  tope de espera (por defecto `frescoMs`, como siempre). */
    obsoletoTrasMs?: number;
}

export interface ResultadoReunion<T> {
    datos: T | null;
    t: number;
    obsoleto: boolean;
}

const FRESCO_DEFECTO_MS = 15_000;
const ESPERA_DEFECTO_MS = 6_000;
/**
 * (2026-10-13, medido) Los medidores de Genesis enseñaron la MISMA cifra de las 04:02:58 durante
 * más de 17 minutos con `obsoleto`: una reunión se quedó esperando algo que nunca contestó y,
 * como solo hay una a la vez, ninguna otra arrancó. Las reuniones lentas de verdad acaban en
 * 5-140 s (registro del 13-10).
 *
 * Primero se puso 180 s y fue peor: con la Mac sin memoria las reuniones NO estaban colgadas,
 * iban lentísimas, y soltar una a los 3 min y arrancar otra dejaba varias trabajando a la vez
 * (27 «colgada» en hora y media). 15 min solo suelta lo que de verdad no va a volver.
 */
const MAX_EN_MARCHA_DEFECTO_MS = 900_000;

export function crearReunionCompartida<T>(fn: () => Promise<T>, opciones: OpcionesReunion = {}): {
    obtener(): Promise<ResultadoReunion<T>>;
} {
    const frescoMs = opciones.frescoMs ?? FRESCO_DEFECTO_MS;
    const esperaMs = opciones.esperaMs ?? ESPERA_DEFECTO_MS;
    const maxEnMarchaMs = opciones.maxEnMarchaMs ?? MAX_EN_MARCHA_DEFECTO_MS;
    const ahora = opciones.ahora ?? (() => Date.now());
    const avisar = opciones.avisar ?? ((texto: string) => console.warn(texto));
    const obsoletoTrasMs = opciones.obsoletoTrasMs ?? frescoMs;

    let ultimo: { datos: T; t: number; desde: number } | null = null;
    let enMarcha: { p: Promise<T | null>; desde: number } | null = null;

    // Una única llamada viva siempre. Un fallo NO borra el último bueno: solo libera
    // el turno para el siguiente intento. Una colgada (> maxEnMarchaMs) se suelta: si acaba
    // más tarde, su resultado solo cuenta si no hay otro más nuevo.
    const arrancar = (): Promise<T | null> => {
        if (enMarcha && ahora() - enMarcha.desde > maxEnMarchaMs) {
            avisar(`[reunion] colgada más de ${Math.round(maxEnMarchaMs / 1000)} s: la suelto y arranco otra`);
            enMarcha = null;
        }
        if (!enMarcha) {
            const desde = ahora();
            const turno: { p: Promise<T | null>; desde: number } = { p: Promise.resolve(null), desde };
            turno.p = (async (): Promise<T | null> => {
                try {
                    const datos = await fn();
                    if (!ultimo || desde >= ultimo.desde) ultimo = { datos, t: ahora(), desde };
                    return datos;
                } catch {
                    return null;
                } finally {
                    if (enMarcha === turno) enMarcha = null;
                }
            })();
            enMarcha = turno;
        }
        return enMarcha.p;
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
        return { datos: viejo.datos, t: viejo.t, obsoleto: ahora() - viejo.t >= obsoletoTrasMs };
    }

    return { obtener };
}
