/**
 * Guardia de las lecturas del Mando en el navegador (2026-10-05).
 *
 * QUÉ: envuelve `fetch` para las lecturas GET de `/api/mando/…`. Una lectura idéntica que ya
 * está en vuelo se COMPARTE (cada llamante recibe su copia de la respuesta) en vez de
 * repetirse, y una lectura colgada se corta a los 45 s.
 *
 * POR QUÉ: Alex: «no carga el puente de mando». La pestaña llevaba horas abierta y Chrome
 * respondía `net::ERR_INSUFFICIENT_RESOURCES` a TODO: más de 35.000 peticiones descartadas y
 * cada pastilla en «—». Treinta y un paneles sondean con `setInterval` sin mirar si su lectura
 * anterior volvió (solo la cabecera lanza diez medidores por vuelta). Con la Mac cargada un
 * medidor tarda hasta 46 s (`reunir lenta 46147` en el registro del Mando), las vueltas se
 * apilan sobre las que no han vuelto, el servidor va más lento con cada una y el navegador
 * acaba sin recursos. Arreglarlo en cada panel eran 31 cambios; aquí es uno, para todos.
 *
 * CÓMO: solo GET a rutas del Mando, con URL de texto y sin cuerpo; todo lo demás (POST,
 * otras rutas, `Request` con cabeceras propias) pasa intacto. La petición compartida no lleva
 * la señal de ningún llamante: si un panel aborta la suya (al desmontarse), solo ESE llamante
 * recibe el aborto y los demás siguen esperando la misma respuesta.
 */

/** Marca para no envolver dos veces el mismo `fetch`. */
const MARCA = "__starseedGuardiaFetchMando";

export interface OpcionesGuardiaFetch {
    /** Tiempo máximo de una lectura compartida (45 s por defecto). */
    topeMs?: number;
    /** Qué URLs vigila la guardia (por defecto, las de `/api/mando/`). */
    esDelMando?: (url: string) => boolean;
}

function errorDeAborto(senal: AbortSignal): unknown {
    return senal.reason ?? new DOMException("La lectura se canceló.", "AbortError");
}

/** El `fetch` envuelto. Puro respecto al entorno: recibe el `fetch` de verdad. */
export function crearFetchGuardado(original: typeof fetch, opciones: OpcionesGuardiaFetch = {}): typeof fetch {
    const topeMs = opciones.topeMs ?? 45_000;
    const esDelMando = opciones.esDelMando ?? ((url: string) => url.includes("/api/mando/"));
    const enVuelo = new Map<string, Promise<Response>>();

    const guardado = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        if (typeof input !== "string" && !(input instanceof URL)) return original(input, init);
        const url = typeof input === "string" ? input : input.href;
        const metodo = (init?.method ?? "GET").toUpperCase();
        if (metodo !== "GET" || init?.body != null || !esDelMando(url)) return original(input, init);

        let compartida = enVuelo.get(url);
        if (!compartida) {
            const control = new AbortController();
            const reloj = setTimeout(
                () => control.abort(new DOMException(`La lectura de ${url} pasó de ${Math.round(topeMs / 1000)} s.`, "TimeoutError")),
                topeMs,
            );
            const { signal: _senalDelLlamante, ...resto } = init ?? {};
            void _senalDelLlamante;
            compartida = original(url, { ...resto, signal: control.signal }).finally(() => {
                clearTimeout(reloj);
                enVuelo.delete(url);
            });
            enVuelo.set(url, compartida);
        }

        // Cada llamante lee su propia copia: la respuesta compartida no se consume nunca.
        const copia = compartida.then((r) => r.clone());
        const senal = init?.signal;
        if (!senal) return copia;
        if (senal.aborted) return Promise.reject(errorDeAborto(senal));
        return new Promise<Response>((resolver, rechazar) => {
            const alAbortar = () => rechazar(errorDeAborto(senal));
            senal.addEventListener("abort", alAbortar, { once: true });
            copia.then(
                (r) => {
                    senal.removeEventListener("abort", alAbortar);
                    resolver(r);
                },
                (e) => {
                    senal.removeEventListener("abort", alAbortar);
                    rechazar(e);
                },
            );
        });
    };
    (guardado as unknown as Record<string, boolean>)[MARCA] = true;
    return guardado as typeof fetch;
}

/** ¿Este `fetch` ya está envuelto por la guardia? */
export function estaGuardado(f: typeof fetch): boolean {
    return Boolean((f as unknown as Record<string, boolean>)[MARCA]);
}

/** Instala la guardia en el `fetch` del navegador una sola vez. En el servidor no hace nada. */
export function instalarGuardiaFetchMando(): void {
    if (typeof window === "undefined" || typeof window.fetch !== "function") return;
    if (estaGuardado(window.fetch)) return;
    window.fetch = crearFetchGuardado(window.fetch.bind(window));
}
