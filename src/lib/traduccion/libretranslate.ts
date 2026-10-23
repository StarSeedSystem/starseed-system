// src/lib/traduccion/libretranslate.ts
// Cliente puro de LibreTranslate (Ola 1020U · TRD1020A): sin `node:*`, sin estado global
// y con `fetch` inyectado. La clave de API solo viaja si el llamador la pasa; no se guarda.
export type FormatoTraduccion = "text" | "html";
export type TextoTraducido = string | string[];
export interface Deteccion { confidence: number; language: string }
export interface Traduccion { translatedText: TextoTraducido; detectedLanguage?: Deteccion }
export interface Idioma { code: string; name: string; targets: string[] }
export interface OpcionesTraduccion { q: string | string[]; target: string; source?: string; format?: FormatoTraduccion; api_key?: string }
export interface OpcionesClienteLibreTranslate { base: string; fetch: typeof fetch; limiteCaracteres?: number }
export interface ClienteLibreTranslate {
    traducir(opciones: OpcionesTraduccion): Promise<Traduccion>;
    idiomas(): Promise<Idioma[]>;
    detectar(q: string | string[]): Promise<Deteccion | Deteccion[]>;
    salud(): Promise<{ status: string }>;
}
export const LIMITE_CARACTERES_POR_DEFECTO = 5000;

export class ErrorLibreTranslate extends Error {
    readonly estado: number | null;
    constructor(mensaje: string, estado: number | null = null) { super(mensaje); this.name = "ErrorLibreTranslate"; this.estado = estado; }
}

/** Mensaje claro en español para los errores HTTP del servicio. */
export function mensajeDeError(estado: number): string {
    if (estado === 400) return "La solicitud a LibreTranslate no es válida (400). Revisa el texto, el idioma de destino y el formato.";
    if (estado === 403) return "LibreTranslate rechazó el acceso (403): la clave de API no es válida o falta.";
    if (estado === 429) return "LibreTranslate está recibiendo demasiadas peticiones (429). Espera un momento y vuelve a intentarlo.";
    if (estado === 500) return "LibreTranslate falló en su servidor (500). Inténtalo de nuevo más tarde.";
    return `LibreTranslate respondió con un error ${estado}.`;
}

/** Parte textos por caracteres sin cambiar el orden; un texto mayor que el límite viaja solo. */
export function agruparEnLotes(textos: string[], limite: number): string[][] {
    const maximo = Number.isFinite(limite) && limite > 0 ? Math.floor(limite) : LIMITE_CARACTERES_POR_DEFECTO;
    const lotes: string[][] = []; let lote: string[] = []; let usados = 0;
    for (const texto of textos) {
        if (lote.length > 0 && usados + texto.length > maximo) { lotes.push(lote); lote = []; usados = 0; }
        lote.push(texto); usados += texto.length;
    }
    if (lote.length > 0) lotes.push(lote);
    return lotes;
}

function leerTraduccion(valor: unknown, cantidad: number): string[] {
    if (typeof valor === "string" && cantidad === 1) return [valor];
    const valido = Array.isArray(valor) && valor.length === cantidad && valor.every((v) => typeof v === "string");
    if (!valido) throw new ErrorLibreTranslate("LibreTranslate devolvió una traducción con un formato inesperado.");
    return valor as string[];
}

function esDeteccion(valor: unknown): valor is Deteccion {
    if (!valor || typeof valor !== "object") return false;
    const o = valor as Record<string, unknown>;
    return typeof o.language === "string" && typeof o.confidence === "number";
}

export function crearClienteLibreTranslate(opciones: OpcionesClienteLibreTranslate): ClienteLibreTranslate {
    const base = opciones.base.trim().replace(/\/+$/, "");
    if (!base) throw new ErrorLibreTranslate("Falta la dirección de LibreTranslate.");
    const transporte = opciones.fetch; const limite = opciones.limiteCaracteres ?? LIMITE_CARACTERES_POR_DEFECTO;

    async function pedir<T>(ruta: string, init?: RequestInit): Promise<T> {
        let respuesta: Response;
        try { respuesta = await transporte(`${base}${ruta}`, init); } catch {
            throw new ErrorLibreTranslate("No se pudo conectar con LibreTranslate. Comprueba que el servicio esté encendido y accesible.");
        }
        if (!respuesta.ok) throw new ErrorLibreTranslate(mensajeDeError(respuesta.status), respuesta.status);
        try { return (await respuesta.json()) as T; } catch {
            throw new ErrorLibreTranslate("LibreTranslate devolvió una respuesta que no es JSON válido.", respuesta.status);
        }
    }

    return {
        async traducir(peticion) {
            if (!peticion.target?.trim()) throw new ErrorLibreTranslate("Falta el idioma de destino de la traducción.");
            const esLista = typeof peticion.q !== "string";
            const textos: string[] = typeof peticion.q === "string" ? [peticion.q] : peticion.q;
            if (textos.length === 0) return { translatedText: esLista ? [] : "" };
            const resultados: string[] = []; let detectedLanguage: Deteccion | undefined;
            for (const lote of agruparEnLotes(textos, limite)) {
                const cuerpo: Record<string, unknown> = { q: esLista ? lote : lote[0], source: peticion.source || "auto", target: peticion.target, format: peticion.format || "text" };
                if (peticion.api_key) cuerpo.api_key = peticion.api_key;
                const datos = await pedir<{ translatedText?: unknown; detectedLanguage?: unknown }>("/translate", {
                    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo),
                });
                resultados.push(...leerTraduccion(datos.translatedText, lote.length));
                if (!detectedLanguage && esDeteccion(datos.detectedLanguage)) detectedLanguage = datos.detectedLanguage;
            }
            return { translatedText: esLista ? resultados : resultados[0] ?? "", ...(detectedLanguage ? { detectedLanguage } : {}) };
        },
        async idiomas() {
            const datos = await pedir<unknown>("/languages", { method: "GET" });
            if (!Array.isArray(datos)) throw new ErrorLibreTranslate("LibreTranslate devolvió una lista de idiomas inesperada.");
            return datos.flatMap((item): Idioma[] => {
                if (!item || typeof item !== "object") return [];
                const o = item as Record<string, unknown>;
                if (typeof o.code !== "string" || typeof o.name !== "string") return [];
                const targets = Array.isArray(o.targets) ? o.targets.filter((t): t is string => typeof t === "string") : [];
                return [{ code: o.code, name: o.name, targets }];
            });
        },
        async detectar(q) {
            const esLista = Array.isArray(q);
            const datos = await pedir<unknown>("/detect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q }) });
            const lista = Array.isArray(datos) ? datos.filter(esDeteccion) : esDeteccion(datos) ? [datos] : [];
            if (lista.length === 0) throw new ErrorLibreTranslate("LibreTranslate no pudo detectar el idioma del texto.");
            return esLista ? lista : lista[0];
        },
        async salud() {
            const datos = await pedir<unknown>("/health", { method: "GET" });
            const estado = datos && typeof datos === "object" ? (datos as Record<string, unknown>).status : undefined;
            if (typeof estado !== "string") throw new ErrorLibreTranslate("LibreTranslate no devolvió un estado de salud válido.");
            return { status: estado };
        },
    };
}
