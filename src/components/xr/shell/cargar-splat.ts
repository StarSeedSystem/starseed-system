/**
 * StarSeed XR · SPLATS GAUSSIANOS (XR1010AM · contrato §1.3 y §3 g).
 * Lógica pura y carga perezosa de `@sparkjsdev/spark`: solo los niveles `alta` y `maxima`
 * pintan splats; el resto recibe un marcador honesto. Ninguna función lanza: siempre
 * devuelve `{ ok:false, motivo }` para que el cascarón 3D pueda enseñar el porqué.
 */
import type { ObjetoMundo } from "../../../lib/xr/mundo-tipos";
import type { NivelCalidad } from "../../../lib/xr/tipos";

/** 60 MB es el tope de un splat que un visor autónomo puede descargar sin ahogarse. */
export const MAX_BYTES_SPLAT = 60 * 1024 * 1024;
export const TEXTO_SIN_SPLAT = "Este objeto necesita un aparato más potente";
export const MOTIVO_URL_INSEGURA = "El enlace del splat no es válido: debe ser https y no llevar credenciales.";
export const MOTIVO_SPLAT_GRANDE = "El archivo del splat pasa de 60 MB y no se puede cargar en el visor.";
export const MOTIVO_DESCARGA = "No se pudo descargar el archivo del splat.";
export const MOTIVO_NO_SPLAT = "Este objeto no es un splat gaussiano de la Biblioteca.";

export type MallaSplat = object;

export interface OpcionesSplatMesh {
    url?: string;
    fileBytes?: ArrayBuffer;
    maxSplats?: number;
    [clave: string]: unknown;
}

export type ConstructorSplatMesh = new (opciones?: OpcionesSplatMesh) => MallaSplat;

export interface OpcionesCargaSplat {
    /** Constructor inyectable; si falta se importa `@sparkjsdev/spark` dentro de la función. */
    SplatMesh?: ConstructorSplatMesh;
    /** Lector inyectable de bytes; por defecto `fetch`. */
    pedirBytes?: (url: string) => Promise<ArrayBuffer>;
    maxBytes?: number;
    maxSplats?: number;
}

export type ResultadoCargaSplat =
    | { ok: true; malla: MallaSplat; bytes: number }
    | { ok: false; motivo: string };

export function puedeUsarSplat(nivel: NivelCalidad): boolean {
    return nivel === "alta" || nivel === "maxima";
}

export function presupuestoSplat(nivel: NivelCalidad): number {
    if (nivel === "maxima") return 3_000_000;
    if (nivel === "alta") return 1_500_000;
    return 0;
}

/** Solo https, absoluta y sin usuario ni contraseña: el splat no viaja con credenciales. */
export function urlSplatSegura(url: string): boolean {
    if (typeof url !== "string" || url.trim().length === 0) return false;
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return false;
    }
    if (parsed.protocol !== "https:") return false;
    if (parsed.username.length > 0 || parsed.password.length > 0) return false;
    return parsed.hostname.length > 0;
}

/** La URL de un objeto de la Biblioteca con formato `splat`; `null` si el objeto es otra cosa. */
export function urlSplatDeObjeto(objeto: ObjetoMundo): string | null {
    if (objeto.fuente.tipo !== "biblioteca" || objeto.fuente.formato !== "splat") return null;
    return objeto.fuente.id;
}

/** Error interno con un motivo ya redactado para la persona. */
class ErrorCargaSplat extends Error {
    constructor(motivo: string) {
        super(motivo);
        this.name = "ErrorCargaSplat";
    }
}

async function descargarBytes(url: string, maxBytes: number): Promise<ArrayBuffer> {
    const respuesta = await fetch(url, { credentials: "omit" });
    if (!respuesta.ok) throw new ErrorCargaSplat(`El servidor respondió con ${respuesta.status}.`);
    const anunciado = Number(respuesta.headers.get("content-length") ?? "0");
    if (Number.isFinite(anunciado) && anunciado > maxBytes) throw new ErrorCargaSplat(MOTIVO_SPLAT_GRANDE);
    const bytes = await respuesta.arrayBuffer();
    if (bytes.byteLength > maxBytes) throw new ErrorCargaSplat(MOTIVO_SPLAT_GRANDE);
    return bytes;
}

/** Import perezoso: Spark solo entra en el chunk cuando un mundo de nivel alto pide un splat. */
async function importarSpark(): Promise<ConstructorSplatMesh> {
    const modulo = await import("@sparkjsdev/spark");
    return modulo.SplatMesh as unknown as ConstructorSplatMesh;
}

const motivoDeError = (error: unknown): string =>
    error instanceof Error && error.message.length > 0 ? error.message : "motivo desconocido";

export async function cargarSplat(url: string, opciones: OpcionesCargaSplat = {}): Promise<ResultadoCargaSplat> {
    if (!urlSplatSegura(url)) return { ok: false, motivo: MOTIVO_URL_INSEGURA };
    const maxBytes = opciones.maxBytes ?? MAX_BYTES_SPLAT;
    const maxSplats = opciones.maxSplats ?? presupuestoSplat("alta");
    let bytes: ArrayBuffer;
    try {
        bytes = opciones.pedirBytes ? await opciones.pedirBytes(url) : await descargarBytes(url, maxBytes);
    } catch (error) {
        return { ok: false, motivo: `No se pudo descargar el splat: ${motivoDeError(error)}` };
    }
    if (bytes.byteLength > maxBytes) return { ok: false, motivo: MOTIVO_SPLAT_GRANDE };
    try {
        const Constructor = opciones.SplatMesh ?? (await importarSpark());
        const malla = new Constructor({ url, fileBytes: bytes, maxSplats });
        return { ok: true, malla, bytes: bytes.byteLength };
    } catch (error) {
        return { ok: false, motivo: `No se pudo preparar el splat: ${motivoDeError(error)}` };
    }
}
