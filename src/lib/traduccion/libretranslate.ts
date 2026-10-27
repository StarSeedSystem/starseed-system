/** TRD1020A · parte 1 de 2 — cliente puro de LibreTranslate (sin framework ni estado global): el contrato fija el TRÁFICO (POST {base}/translate con solo lo pedido y api_key solo si quien llama la pasa, GET /languages y /health, POST /detect, lotes por límite de caracteres sin perder orden, errores en español claro), no la forma del objeto entregado a quien llama. El `fetch` se inyecta: nada de red en pruebas. Privado (mensajes, documentos) solo en servidores del aparato o del cerebro, nunca en la instancia pública de pago. */

export type OpcionesCliente = {
    /** Base del servidor, p. ej. «http://127.0.0.1:5000». Se aceptan los alias baseUrl/url. */
    base?: string; baseUrl?: string; url?: string;
    /** Transporte inyectado (pruebas u opción de red propia); en su defecto el global. */
    fetch?: typeof fetch;
};

export type PeticionTraduccion = {
    q: string | string[];
    source?: string; target?: string; format?: string;
    apiKey?: string; api_key?: string;
    /** Límite de caracteres por lote cuando q es lista (alias: limiteCaracteres). */
    loteCaracteres?: number; limiteCaracteres?: number;
};

type CuerpoTraduccion = { translatedText?: unknown; detectedLanguage?: unknown } | null;

/** Mensajes en español claro por estado; el cuerpo crudo NUNCA se volca al error. */
const MENSAJES_ESTADO: Record<number, string> = {
    400: "La petición a LibreTranslate no es válida.",
    403: "La clave de API de LibreTranslate no es válida o falta.",
    429: "LibreTranslate recibió demasiadas peticiones: reintenta en un momento.",
    500: "LibreTranslate falló por dentro; revisa el registro del servidor.",
};

async function pedir(http: typeof fetch, url: string, init: RequestInit): Promise<unknown> {
    const respuesta = await http(url, init);
    const cuerpo: CuerpoTraduccion | unknown[] | null = await respuesta.json().catch(() => null);
    if (!respuesta.ok) {
        throw new Error(MENSAJES_ESTADO[respuesta.status] ?? `LibreTranslate rechazó la petición (estado ${respuesta.status}).`);
    }
    return cuerpo;
}

/** Parte la lista en lotes cuya suma de caracteres no pase el límite (un ítem enorme va solo y entero). */
function lotesDe(textos: string[], limite?: number): string[][] {
    if (!limite || limite <= 0 || textos.length < 2) return [textos];
    const lotes: string[][] = [];
    let actual: string[] = [];
    let usados = 0;
    for (const t of textos) {
        if (actual.length > 0 && usados + t.length > limite) { lotes.push(actual); actual = []; usados = 0; }
        actual.push(t); usados += t.length;
    }
    if (actual.length > 0) lotes.push(actual);
    return lotes;
}

function traduccionesDe(cuerpo: unknown): string[] {
    const t = ((cuerpo ?? {}) as Exclude<CuerpoTraduccion, null>).translatedText;
    if (Array.isArray(t)) return t.map(String);
    return typeof t === "string" ? [t] : [];
}

export class ClienteLibreTranslate {
    private readonly base: string;
    private readonly http: typeof fetch;

    constructor(opciones: OpcionesCliente = {}) {
        const base = opciones.base ?? opciones.baseUrl ?? opciones.url;
        if (!base) throw new Error("Falta la base de LibreTranslate (base, baseUrl o url).");
        this.base = base.replace(/\/+$/, "");
        this.http = opciones.fetch ?? globalThis.fetch;
    }

    /** POST /translate: solo los campos pedidos; con lista y límite, en lotes por caracteres y unidos en orden. */
    async traducir(p: PeticionTraduccion): Promise<unknown> {
        const { source, target, format } = p;
        const clave = p.api_key ?? p.apiKey;
        const lote: string[] = Array.isArray(p.q) ? p.q : [p.q];
        const partido = lotesDe(lote, p.loteCaracteres ?? p.limiteCaracteres);
        let detectado: unknown;
        const unidas: string[] = [];
        for (let i = 0; i < partido.length; i++) {
            const cuerpo: Record<string, unknown> = { q: Array.isArray(p.q) ? partido[i] : partido[i][0] };
            if (source !== undefined) cuerpo.source = source;
            if (target !== undefined) cuerpo.target = target;
            if (format !== undefined) cuerpo.format = format;
            if (clave !== undefined) cuerpo.api_key = clave;
            const crudo = await pedir(this.http, `${this.base}/translate`, {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo),
            });
            if (i === 0) detectado = (crudo as CuerpoTraduccion)?.detectedLanguage;
            unidas.push(...traduccionesDe(crudo));
        }
        if (partido.length === 1 && Array.isArray(p.q) === false) {
            const unico = unidas[0] ?? "";
            return typeof detectado === "undefined" ? { translatedText: unico } : { translatedText: unico, detectedLanguage: detectado };
        }
        const salida: Record<string, unknown> = { translatedText: unidas };
        if (typeof detectado !== "undefined") salida.detectedLanguage = detectado;
        return salida;
    }

    /** GET /languages: lista cruda [{code, name}] tal cual la da el servidor. */
    async idiomas(): Promise<unknown> {
        return pedir(this.http, `${this.base}/languages`, { method: "GET" });
    }

    /** POST /detect: el texto en el cuerpo; la respuesta cruda [{confidence, language}] se normaliza a {idioma, confianza, respuesta} para que quien llama no dependa de la forma del servidor. */
    async detectar(q: string): Promise<unknown> {
        const crudo = await pedir(this.http, `${this.base}/detect`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q }),
        });
        const primero = Array.isArray(crudo) ? ((crudo[0] ?? {}) as { confidence?: unknown; language?: unknown }) : {};
        return { idioma: typeof primero.language === "string" ? primero.language : null, confianza: primero.confidence ?? null, respuesta: crudo };
    }

    /** GET /health: crudo ({success:true}) para que quien llama decida. */
    async salud(): Promise<unknown> {
        return pedir(this.http, `${this.base}/health`, { method: "GET" });
    }
}
