/**
 * Guardia de las lecturas del Mando en el navegador (2026-10-05).
 *
 * QUÉ: envuelve `fetch` para las lecturas GET de `/api/mando/…`:
 *   1. Una lectura idéntica que ya está en vuelo se COMPARTE (cada llamante recibe su copia).
 *   2. Como mucho `maxEnVuelo` lecturas distintas a la vez; el resto espera en una cola
 *      ACOTADA (`maxCola`): si se llena, la más vieja se descarta con un error, como si
 *      hubiera fallado la red. Nunca más una pila sin fondo.
 *   3. Una lectura colgada se corta a los 45 s.
 *   4. Lleva la salud de las lecturas (fallos seguidos, último éxito) para la autocuración
 *      de la página (`autocuracion-pagina.ts`), y `reiniciarGuardia()` suelta todo de golpe.
 *
 * POR QUÉ: Alex: «no carga el puente de mando» (dos veces en una noche). La pestaña llevaba
 * horas abierta y Chrome respondía `net::ERR_INSUFFICIENT_RESOURCES` a TODO: más de 35.000
 * peticiones descartadas y cada pastilla en «—». Treinta y un paneles sondean con
 * `setInterval` sin mirar si su lectura anterior volvió (solo la cabecera lanza diez
 * medidores por vuelta); con la Mac cargada un medidor tarda hasta 46 s y las vueltas se
 * apilaban sin límite. Compartir las iguales no bastaba: hacía falta un TOPE.
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
    /** Lecturas distintas a la vez como mucho (4 por defecto). */
    maxEnVuelo?: number;
    /** Lecturas esperando turno como mucho; la más vieja sobra (40 por defecto). */
    maxCola?: number;
    /** Qué URLs vigila la guardia (por defecto, las de `/api/mando/`). */
    esDelMando?: (url: string) => boolean;
    /** Reloj (pruebas). */
    ahora?: () => number;
}

/** Salud de las lecturas del Mando vista desde la página. */
export interface SaludGuardia {
    enVuelo: number;
    enCola: number;
    /** Lecturas que fallaron por red, tope o cola llena, seguidas, desde el último éxito. */
    fallosSeguidos: number;
    /** Momento (ms) de la última lectura que volvió con respuesta del servidor; 0 = ninguna. */
    ultimoExito: number;
    /** Momento (ms) de la última lectura pedida; 0 = ninguna. */
    ultimoIntento: number;
    /** Lecturas descartadas por cola llena desde que se instaló. */
    descartadas: number;
}

export interface FetchGuardado {
    (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
    salud(): SaludGuardia;
    /** Corta todo lo que está en vuelo y vacía la cola (autocuración suave). */
    reiniciar(motivo?: string): void;
}

function errorDeAborto(senal: AbortSignal): unknown {
    return senal.reason ?? new DOMException("La lectura se canceló.", "AbortError");
}

interface Turno {
    url: string;
    arrancar: () => void;
    descartar: (e: unknown) => void;
}

/** El `fetch` envuelto. Puro respecto al entorno: recibe el `fetch` de verdad. */
export function crearFetchGuardado(original: typeof fetch, opciones: OpcionesGuardiaFetch = {}): FetchGuardado {
    const topeMs = opciones.topeMs ?? 45_000;
    const maxEnVuelo = Math.max(1, opciones.maxEnVuelo ?? 4);
    const maxCola = Math.max(0, opciones.maxCola ?? 40);
    const esDelMando = opciones.esDelMando ?? ((url: string) => url.includes("/api/mando/"));
    const ahora = opciones.ahora ?? (() => Date.now());

    /** Lecturas compartidas por URL (en vuelo o esperando turno). */
    const compartidas = new Map<string, Promise<Response>>();
    /** Controladores de las que están en vuelo, para poder cortarlas todas. */
    const controles = new Set<AbortController>();
    /** Las que corta `reiniciar()`: su aborto lo provocamos nosotros, no es un fallo de la red. */
    const cortadasAProposito = new WeakSet<AbortController>();
    const cola: Turno[] = [];
    let enVuelo = 0;
    const salud = { fallosSeguidos: 0, ultimoExito: 0, ultimoIntento: 0, descartadas: 0 };

    const siguiente = () => {
        while (enVuelo < maxEnVuelo && cola.length > 0) {
            const turno = cola.shift()!;
            turno.arrancar();
        }
    };

    const lanzar = (url: string, resto: RequestInit): Promise<Response> =>
        new Promise<Response>((resolver, rechazar) => {
            const arrancar = () => {
                enVuelo += 1;
                const control = new AbortController();
                controles.add(control);
                const reloj = setTimeout(
                    () => control.abort(new DOMException(`La lectura de ${url} pasó de ${Math.round(topeMs / 1000)} s.`, "TimeoutError")),
                    topeMs,
                );
                original(url, { ...resto, signal: control.signal }).then(
                    (r) => {
                        salud.fallosSeguidos = 0;
                        salud.ultimoExito = ahora();
                        resolver(r);
                    },
                    (e) => {
                        if (!cortadasAProposito.has(control)) salud.fallosSeguidos += 1;
                        rechazar(e);
                    },
                ).finally(() => {
                    clearTimeout(reloj);
                    controles.delete(control);
                    enVuelo -= 1;
                    siguiente();
                });
            };
            if (enVuelo < maxEnVuelo) {
                arrancar();
                return;
            }
            if (cola.length >= maxCola) {
                const vieja = cola.shift();
                if (vieja) {
                    salud.descartadas += 1;
                    salud.fallosSeguidos += 1;
                    vieja.descartar(new DOMException("Lectura descartada: demasiadas esperando turno.", "AbortError"));
                }
            }
            if (maxCola === 0) {
                salud.descartadas += 1;
                salud.fallosSeguidos += 1;
                rechazar(new DOMException("Lectura descartada: demasiadas esperando turno.", "AbortError"));
                return;
            }
            cola.push({ url, arrancar, descartar: rechazar });
        });

    const guardado = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        if (typeof input !== "string" && !(input instanceof URL)) return original(input, init);
        const url = typeof input === "string" ? input : input.href;
        const metodo = (init?.method ?? "GET").toUpperCase();
        if (metodo !== "GET" || init?.body != null || !esDelMando(url)) return original(input, init);

        salud.ultimoIntento = ahora();
        let compartida = compartidas.get(url);
        if (!compartida) {
            const { signal: _senalDelLlamante, ...resto } = init ?? {};
            void _senalDelLlamante;
            compartida = lanzar(url, resto).finally(() => {
                if (compartidas.get(url) === compartida) compartidas.delete(url);
            });
            compartidas.set(url, compartida);
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
    }) as FetchGuardado;

    guardado.salud = () => ({ enVuelo, enCola: cola.length, ...salud });
    guardado.reiniciar = (motivo = "autocuración del Mando") => {
        const error = new DOMException(`Lectura cortada: ${motivo}.`, "AbortError");
        for (const turno of cola.splice(0)) turno.descartar(error);
        for (const control of [...controles]) {
            cortadasAProposito.add(control);
            control.abort(error);
        }
        compartidas.clear();
        salud.fallosSeguidos = 0;
    };
    (guardado as unknown as Record<string, boolean>)[MARCA] = true;
    return guardado;
}

/** ¿Este `fetch` ya está envuelto por la guardia? */
export function estaGuardado(f: typeof fetch): f is FetchGuardado {
    return Boolean((f as unknown as Record<string, boolean>)[MARCA]);
}

let fetchDeVerdad: typeof fetch | null = null;
/**
 * La guardia de ESTA página. Se guarda aquí y no se lee de `window.fetch` porque otros envuelven
 * `fetch` después (el indicador de carga global, `indicador-carga-global.tsx`, pone su contador
 * encima): la guardia sigue trabajando debajo, pero `window.fetch` ya no es ella. Medido el
 * 2026-10-05 en el Mando instalado: la autocuración de la página no la encontraba y no actuaba.
 */
let instancia: FetchGuardado | null = null;

/** El `fetch` sin guardia (para la sonda de la autocuración, que no debe hacer cola). */
export function fetchSinGuardia(): typeof fetch {
    if (fetchDeVerdad) return fetchDeVerdad;
    return typeof window !== "undefined" ? window.fetch.bind(window) : fetch;
}

/** La guardia instalada en esta página (aunque otro envoltorio esté encima), o null. */
export function guardiaInstalada(): FetchGuardado | null {
    if (instancia) return instancia;
    if (typeof window === "undefined") return null;
    return estaGuardado(window.fetch) ? window.fetch : null;
}

/** Instala la guardia en el `fetch` del navegador una sola vez. En el servidor no hace nada. */
export function instalarGuardiaFetchMando(): void {
    if (typeof window === "undefined" || typeof window.fetch !== "function") return;
    if (instancia || estaGuardado(window.fetch)) return;
    fetchDeVerdad = window.fetch.bind(window);
    instancia = crearFetchGuardado(fetchDeVerdad);
    window.fetch = instancia as typeof fetch;
    // Para mirar su salud desde la consola o una sonda: `window.__starseedGuardiaMando.salud()`.
    (window as unknown as Record<string, unknown>).__starseedGuardiaMando = instancia;
}
