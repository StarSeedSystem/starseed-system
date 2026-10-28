/** Cliente PURO de LibreTranslate (TRD1020A, repos-libreria-1020d.md §4): fetch inyectado,
 * sin red ni `node:*`, y nunca guarda la `api_key`; solo la pasa en la petición que la pida. */
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
    source: "auto" | string;
    target: string;
    format: string;
    api_key?: string;
}

export interface IdiomaDetectado { language: string; confidence: number }
export interface IdiomaLibreTranslate { code: string; name?: string }
interface RespuestaTraduccion { translatedText: string | string[]; detectedLanguage?: IdiomaDetectado }
const LOTE_DEFECTO = 1800;
const MENSAJES_HTTP: Record<number, string> = {
    400: "LibreTranslate rechazó la petición (400): revisa los idiomas o el texto.",
    403: "LibreTranslate rechazó la clave de API (403): falta o no es válida.",
    429: "LibreTranslate está saturada (429): espera un momento y reintenta.",
    500: "Error interno de LibreTranslate (500): inténtalo más tarde.",
};

/** Junta los textos en lotes que no superen el límite; un texto grande va solo. */
export function crearLotes(textos: string[], limite: number = LOTE_DEFECTO): string[][] {
    const lotes: string[][] = [];
    let actual: string[] = [];
    let usado = 0;
    for (const texto of textos) {
        if (actual.length > 0 && usado + texto.length > limite) {
            lotes.push(actual);
            actual = [];
            usado = 0;
        }
        actual.push(texto);
        usado += texto.length;
    }
    if (actual.length > 0) lotes.push(actual);
    return lotes;
}

function objetosDe(valor: unknown): Record<string, unknown>[] {
    if (Array.isArray(valor)) return valor.filter((v): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v));
    return valor !== null && typeof valor === "object" ? [valor as Record<string, unknown>] : [];
}
function textosDe(valor: unknown): string[] {
    if (typeof valor === "string") return [valor];
    return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === "string") : [];
}

export function crearClienteLibreTranslate(opciones: OpcionesClienteLibreTranslate) {
    const base = opciones.base.replace(/\/+$/, "");
    const enviar = opciones.fetch;

    async function pedir(ruta: string, init: RequestInit): Promise<unknown> {
        let respuesta: Response;
        try {
            respuesta = await enviar(`${base}${ruta}`, init);
        } catch (e) {
            const motivo = e instanceof Error ? e.message : String(e);
            throw new Error(`No se pudo conectar con LibreTranslate (${base}${ruta}): ${motivo}`);
        }
        if (!respuesta.ok) throw new Error(MENSAJES_HTTP[respuesta.status] ?? `LibreTranslate respondió HTTP ${respuesta.status}.`);
        try {
            return await respuesta.json();
        } catch {
            return {};
        }
    }
    async function traducir(params: ParametroTraduccion): Promise<RespuestaTraduccion> {
        const textos = Array.isArray(params.q) ? params.q : [params.q];
        const esLista = Array.isArray(params.q);
        const traducciones: string[] = [];
        let detectado: IdiomaDetectado | null | undefined;
        for (const lote of crearLotes(textos, opciones.limiteCaracteres)) {
            const cuerpo: Record<string, unknown> = { q: esLista ? lote : lote[0], source: params.source, target: params.target, format: params.format ?? "text" };
            if (params.api_key !== undefined) cuerpo.api_key = params.api_key;
            const datos = objetosDe(await pedir("/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) }))[0];
            for (const t of textosDe(datos?.translatedText)) traducciones.push(t);
            if (params.source === "auto" && detectado === undefined) {
                const bruto = objetosDe(datos?.detectedLanguage)[0];
                const confianza = typeof bruto?.confidence === "number" ? bruto.confidence : 0;
                detectado = typeof bruto?.language === "string" ? { language: bruto.language, confidence: confianza } : null;
            }
        }
        if (traducciones.length !== textos.length) throw new Error("LibreTranslate devolvió otra cantidad de traducciones que la esperada.");
        const salida: RespuestaTraduccion = { translatedText: esLista ? traducciones : traducciones[0] };
        if (detectado) salida.detectedLanguage = detectado;
        return salida;
    }
    const idiomas = async (api_key?: string): Promise<IdiomaLibreTranslate[]> => {
        const ruta = api_key ? `/languages?api_key=${encodeURIComponent(api_key)}` : "/languages";
        return objetosDe(await pedir(ruta, { method: "GET" }))
            .map((o) => ({ code: typeof o.code === "string" ? o.code : "", name: typeof o.name === "string" ? o.name : undefined }))
            .filter((i) => i.code !== "");
    };
    const detectar = async (q: string, api_key?: string): Promise<IdiomaDetectado[]> => {
        const cuerpo: Record<string, unknown> = { q };
        if (api_key !== undefined) cuerpo.api_key = api_key;
        const datos = await pedir("/detect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
        return objetosDe(datos)
            .map((o) => ({ language: typeof o.language === "string" ? o.language : "", confidence: typeof o.confidence === "number" ? o.confidence : 0 }))
            .filter((d) => d.language !== "");
    };
    const salud = async (): Promise<boolean> => {
        try {
            return objetosDe(await pedir("/health", { method: "GET" }))[0]?.success !== false;
        } catch {
            return false;
        }
    };

    return { traducir, idiomas, detectar, salud };
}