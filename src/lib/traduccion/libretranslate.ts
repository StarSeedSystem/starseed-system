/**
 * Cliente PURO de LibreTranslate (TRD1020A, repos-libreria-1020d.md §4).
 * Fetch inyectado, sin red ni `node:*`; traduce en el aparato (puerto 5000)
 * y nunca guarda la `api_key`: solo la pasa en la petición que la pida.
 */

export type FetchLike = (entrada: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface OpcionesClienteLibreTranslate {
    /** Base del servicio, p. ej. «http://127.0.0.1:5000». */
    base: string;
    fetch: FetchLike;
    /** Límite de caracteres por petición: trocea las listas y respeta el orden. */
    limiteCaracteres?: number;
}

export interface ParametroTraduccion {
    q: string | string[];
    source: string;
    target: string;
    format: string;
    api_key?: string;
}

export interface IdiomaDetectado {
    language: string;
    confidence: number;
}

interface RespuestaTraduccion {
    translatedText: string | string[];
    detectedLanguage?: IdiomaDetectado;
}

interface CuerpoTraduccion extends ParametroTraduccion {
    q: string | string[];
}

function trocear(textos: string[], limite: number): string[][] {
    const grupos: string[][] = [];
    let actual: string[] = [];
    let usado = 0;
    for (const texto of textos) {
        const largo = texto.length;
        if (actual.length > 0 && usado + largo > limite) {
            grupos.push(actual);
            actual = [];
            usado = 0;
        }
        actual.push(texto);
        usado += largo;
    }
    if (actual.length > 0) grupos.push(actual);
    return grupos;
}

export function crearClienteLibreTranslate(opciones: OpcionesClienteLibreTranslate) {
    const base = opciones.base.replace(/\/+$/, "");
    const pedir = opciones.fetch;

    async function pedirYDescodificar(entrada: string, init: RequestInit): Promise<unknown> {
        const respuesta = await pedir(entrada, init);
        let datos: unknown = null;
        try {
            datos = await respuesta.json();
        } catch {
            datos = null;
        }
        if (!respuesta.ok) {
            const detalle =
                datos && typeof datos === "object" && "error" in (datos as Record<string, unknown>)
                    ? String((datos as Record<string, unknown>).error ?? "")
                    : "";
            throw new Error(`LibreTranslate respondió ${respuesta.status} al traducir${detalle ? `: ${detalle}` : ""} — prueba con menos texto o reintenta más tarde.`);
        }
        return datos;
    }

    async function traducir(params: ParametroTraduccion): Promise<RespuestaTraduccion> {
        const cuerpo = (q: CuerpoTraduccion["q"]): Record<string, unknown> => {
            const completo: Record<string, unknown> = {
                q,
                source: params.source,
                target: params.target,
                format: params.format,
            };
            if (params.api_key !== undefined) completo.api_key = params.api_key;
            return completo;
        };

        if (typeof params.q === "string") {
            const datos = (await pedirYDescodificar(`${base}/translate`, {
                method: "POST",
                body: JSON.stringify(cuerpo(params.q)),
            })) as RespuestaTraduccion;
            return datos;
        }

        const grupos = opciones.limiteCaracteres ? trocear(params.q, opciones.limiteCaracteres) : [params.q];
        const resultados: string[] = [];
        let detectado: IdiomaDetectado | undefined;
        for (const grupo of grupos) {
            const datos = (await pedirYDescodificar(`${base}/translate`, {
                method: "POST",
                body: JSON.stringify(cuerpo(grupo)),
            })) as RespuestaTraduccion;
            detectado ??= datos.detectedLanguage;
            const trozos = Array.isArray(datos.translatedText) ? datos.translatedText : [datos.translatedText];
            resultados.push(...trozos);
        }
        return { translatedText: resultados, ...(detectado ? { detectedLanguage: detectado } : {}) };
    }

    return {
        traducir,
        idiomas: () => pedirYDescodificar(`${base}/languages`, { method: "GET" }),
        detectar: (q: string) =>
            pedirYDescodificar(`${base}/detect`, {
                method: "POST",
                body: JSON.stringify({ q }),
            }),
        salud: () => pedirYDescodificar(`${base}/health`, { method: "GET" }),
    };
}
