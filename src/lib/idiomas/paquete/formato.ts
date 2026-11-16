/**
 * IMA5 · Formato de paquete de idioma `.starseed-lang.json` (versión 1).
 * Módulo PURO: sin red, sin disco, sin procesos. `crypto.subtle` se INYECTA.
 */

export const extension = ".starseed-lang.json";

export const LIMITES = {
    bytes: 2_000_000,
    entradas: 20_000,
    clave: 500,
    valor: 2_000,
} as const;

export type Dir = "ltr" | "rtl";

export type EstadoRevision = "automatico" | "revisado";

export interface Autor {
    nombre: string;
    contacto?: string;
}

export interface Revisado {
    estado: EstadoRevision;
    por?: string;
    fecha?: string;
}

export interface PaqueteIdioma {
    formato: "starseed-idioma";
    version: 1;
    codigo: string;
    nombre: string;
    nombreIngles?: string;
    dir: Dir;
    autor: Autor;
    creado: string;
    revisado: Revisado;
    licencia: string;
    base: "es";
    entradas: Record<string, string>;
    hash: string;
}

export interface CryptoProvider {
    subtle: {
        digest(algorithm: "SHA-256", data: ArrayBuffer): Promise<ArrayBuffer>;
    };
}

let cryptoProvider: CryptoProvider | null = null;

export function inyectarCrypto(proveedor: CryptoProvider): void {
    cryptoProvider = proveedor;
}

function obtenerCrypto(): CryptoProvider {
    if (!cryptoProvider) {
        throw new Error("crypto.subtle no inyectado: llama a inyectarCrypto() antes de usar hashDe()");
    }
    return cryptoProvider;
}

function ordenarObjeto(obj: unknown): unknown {
    if (obj === null || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(ordenarObjeto);
    const claves = Object.keys(obj as Record<string, unknown>).sort();
    const resultado: Record<string, unknown> = {};
    for (const clave of claves) {
        resultado[clave] = ordenarObjeto((obj as Record<string, unknown>)[clave]);
    }
    return resultado;
}

export function canonico(paquete: Omit<PaqueteIdioma, "hash">): string {
    return JSON.stringify(ordenarObjeto(paquete));
}

export async function hashDe(paquete: Omit<PaqueteIdioma, "hash">): Promise<string> {
    const canonical = canonico(paquete);
    const encoder = new TextEncoder();
    const data = encoder.encode(canonical);
    const crypto = obtenerCrypto();
    const hashBuffer = await crypto.subtle.digest("SHA-256", data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
    const hashArray = new Uint8Array(hashBuffer);
    return Array.from(hashArray, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function nombreDeArchivo(paquete: PaqueteIdioma): string {
    const seguro = paquete.codigo.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    return `${seguro}${extension}`;
}

export interface DatosPaquete {
    codigo: string;
    nombre: string;
    nombreIngles?: string;
    dir: Dir;
    autor: Autor;
    licencia: string;
    entradas: Record<string, string>;
    revisado?: Revisado;
    creado?: string;
}

export async function construirPaquete(datos: DatosPaquete, desdeOS = false): Promise<PaqueteIdioma> {
    const ahora = new Date().toISOString();
    const paqueteSinHash: Omit<PaqueteIdioma, "hash"> = {
        formato: "starseed-idioma",
        version: 1,
        codigo: datos.codigo,
        nombre: datos.nombre,
        nombreIngles: datos.nombreIngles,
        dir: datos.dir,
        autor: datos.autor,
        creado: datos.creado ?? ahora,
        revisado: datos.revisado ?? { estado: desdeOS ? "revisado" : "automatico" },
        licencia: datos.licencia,
        base: "es",
        entradas: datos.entradas,
    };
    const hash = await hashDe(paqueteSinHash);
    return { ...paqueteSinHash, hash };
}