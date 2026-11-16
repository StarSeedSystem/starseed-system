/**
 * TU1116-APP-F1 · Tipos del Traductor: pares, motores, paquetes locales, resultados
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo PURO (lo usan el traductor y las pruebas). Nunca lanza.
 */

export type ModoTraductor = "texto" | "conversacion";

export interface ParIdiomas {
    origen: string | "auto";
    destino: string;
}

export type IdMotor = "paquete-local" | "navegador" | "libretranslate" | "astraura" | "malla";

export interface ResultadoTraductor {
    texto: string;
    origenDetectado: string;
    motor: IdMotor;
    local: boolean;
    ms: number;
    aviso?: string;
}

export type EstadoPar = "sin-internet" | "descarga" | "solo-internet";

export const ROTOLOS_ESTADO: Record<EstadoPar, string> = {
    "sin-internet": "Sin conexión",
    "descarga": "Descarga",
    "solo-internet": "Solo internet",
};

export interface PaqueteModelo {
    id: string;
    par: ParIdiomas;
    motor: "marian-onnx";
    repo: string;
    bytes: number;
    hash: string;
    version: string;
    verificado: boolean;
}

/** Clave normalizada para un par de idiomas. */
export function claveDePar(origen: string, destino: string): string {
    return `${origen}->${destino}`;
}

/** Pares inversos de un conjunto: P → {Q, R, ...}. */
export function paresInversos(par: Record<string, string>): Record<string, string[]> {
    const inverso: Record<string, string[]> = {};
    for (const [p, q] of Object.entries(par)) {
        if (!inverso[q]) inverso[q] = [];
        inverso[q].push(p);
    }
    return inverso;
}

/** Código de idioma elegible (reutiliza el patrón de aIdiomaElegible de idiomas.ts). */
export function esCodigoValido(codigo: string): boolean {
    if (typeof codigo !== "string") return false;
    const v = codigo.trim().toLowerCase().replace(/\s+/g, "-");
    if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(v)) return false;
    const base = v.split("-")[0];
    const alias = base === "no" || base === "nn" ? "nb" : base === "iw" ? "he" : base === "in" ? "id" : base;
    return ["es", "en", "pt", "fr", "de", "it", "nl", "ca", "gl", "eu", "ru", "uk", "pl", "tr", "ar", "he", "fa", "ur", "hi", "bn", "zh", "zh-hant", "ja", "ko", "th", "vi", "id", "sw", "el", "sv", "cs", "ro", "hu", "fi", "da", "nb"].includes(alias);
}