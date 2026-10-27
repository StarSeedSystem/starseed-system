/**
 * Cliente PURO de LibreTranslate (TRD1020A, repos-libreria-1020d.md §4).
 * `fetch` inyectado, sin red ni `node:*`. La `api_key` solo viaja en la petición
 * que la use (nunca se persiste) y los textos se parten en lotes sin perder orden.
 */

export type FetchLike = (entrada: string | URL | Request, init?: RequestInit) => Promise<Response>;
export interface OpcionesClienteLibreTranslate {
    base: string; // p. ej. «http://127.0.0.1:5100» (túnel del A1)
    fetch: FetchLike;
    claveApi?: string; // instancia protegida; no se persiste, solo vive en memoria
    limiteCaracteres?: number; // tope por petición; 1800 si no se indica
}
export interface ParametroTraduccion {
    q: string | string[];
    source: "auto" | string;
    target: string;
    format?: string; // «text» (defecto) o «html»
    api_key?: string; // manda sobre claveApi; solo se envía, no se guarda
}
export interface IdiomaDetectado { language: string; confidence: number }
export interface IdiomaLibreTranslate { code: string; name?: string }
export interface RespuestaTraduccion {
    translatedText: string | string[];
    detectedLanguage?: IdiomaDetectado; // solo con source «auto»
}
const LOTE_DEFECTO = 1800;
const MENSAJES_HTTP: Record<number, string> = {
    400: "LibreTranslate rechazó la petición (400): revisa los idiomas o el texto.",
    403: "LibreTranslate rechazó la clave de API (403): falta o no es válida.",
    429: "LibreTranslate está saturada (429): espera un momento y reintenta.",
    500: "LibreTranslate falló por dentro (500): inténtalo más tarde.",
};
/** Junta los textos en lotes que no superen el límite; un texto grande va solo. */
export function crearLotes(textos: string[], limite: number = LOTE_DEFECTO): string[][] {
    const lotes: string[][] = []; let actual: string[] = []; let caracteres = 0;
    for (const texto of textos) {
        if (actual.length > 0 && caracteres + texto.length > limite) { lotes.push(actual); actual = []; caracteres = 0; }
        actual.push(texto); caracteres += texto.length;
    }
    if (actual.length > 0) lotes.push(actual);
    return lotes;
}
const objetosDe = (valor: unknown): Record<string, unknown>[] => Array.isArray(valor)
    ? valor.filter((v): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v))
    : valor !== null && typeof valor === "object" ? [valor as Record<string, unknown>] : [];

const textosDe = (valor: unknown): string[] => typeof valor === "string"
    ? [valor] : Array.isArray(valor) ? valor.filter((v): v is string => typeof v === "string") : [];
export function crearClienteLibreTranslate(opciones: OpcionesClienteLibreTranslate) {
    const base = opciones.base.replace(/\/+$/, "");
    const pedir = opciones.fetch;
    const limite = opciones.limiteCaracteres ?? LOTE_DEFECTO;
    const clave = (puntual?: string): string | undefined => puntual || opciones.claveApi || undefined;

    async function pedirYDescodificar(ruta: string, init: RequestInit): Promise<unknown> {
        let respuesta: Response;
        try { respuesta = await pedir(`${base}${ruta}`, init); }
        catch (e) { throw new Error(`No se pudo conectar con LibreTranslate (${base}${ruta}): ${e instanceof Error ? e.message : String(e)}`); }
        let datos: unknown = null;
        try { datos = await respuesta.json(); } catch { datos = null; }
        if (!respuesta.ok) throw new Error(MENSAJES_HTTP[respuesta.status] ?? `LibreTranslate respondió HTTP ${respuesta.status}.`);
        return datos;
    }

    async function traducir(params: ParametroTraduccion): Promise<RespuestaTraduccion> {
        const textos: string[] = Array.isArray(params.q) ? params.q : [params.q];
        const esLista = Array.isArray(params.q);
        const lotes = esLista ? crearLotes(textos, limite) : [textos];
        const hechos: string[] = []; let detectado: IdiomaDetectado | undefined;
        for (const lote of lotes) {
            const cuerpo: Record<string, unknown> = {
                q: esLista ? lote : lote[0], source: params.source,
                target: params.target, format: params.format ?? "text",
            };
            const apiKey = clave(params.api_key);
            if (apiKey) cuerpo.api_key = apiKey;
            const datos = objetosDe(await pedirYDescodificar("/translate", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo),
            }))[0];
            const trozos = textosDe(datos?.translatedText);
            if (trozos.length !== lote.length) throw new Error("LibreTranslate devolvió otra cantidad de traducciones que la esperada.");
            hechos.push(...trozos);
            if (params.source === "auto" && detectado === undefined) {
                const candidato = objetosDe(datos?.detectedLanguage)[0];
                if (typeof candidato?.language === "string") detectado = {
                    language: candidato.language,
                    confidence: typeof candidato.confidence === "number" ? candidato.confidence : 0,
                };
            }
        }
        const translatedText = esLista ? hechos : hechos[0];
        return detectado ? { translatedText, detectedLanguage: detectado } : { translatedText };
    }

    async function idiomas(): Promise<IdiomaLibreTranslate[]> {
        return objetosDe(await pedirYDescodificar("/languages", { method: "GET" }))
            .map((o) => ({ code: typeof o.code === "string" ? o.code : "", name: typeof o.name === "string" ? o.name : undefined }))
            .filter((i) => i.code !== "");
    }

    async function detectar(q: string, api_key?: string): Promise<IdiomaDetectado[]> {
        const cuerpo: Record<string, unknown> = { q };
        const apiKey = clave(api_key);
        if (apiKey) cuerpo.api_key = apiKey;
        return objetosDe(await pedirYDescodificar("/detect", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo),
        }))
            .map((o) => ({ language: typeof o.language === "string" ? o.language : "", confidence: typeof o.confidence === "number" ? o.confidence : 0 }))
            .filter((d) => d.language !== "");
    }

    async function salud(): Promise<boolean> {
        try { return objetosDe(await pedirYDescodificar("/health", { method: "GET" }))[0]?.success !== false; }
        catch { return false; }
    }

    return { traducir, idiomas, detectar, salud };
}
