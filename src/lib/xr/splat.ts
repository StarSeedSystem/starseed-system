/* StarSeed XR · SPLATS GAUSSIANOS. Módulo PURO: entrada → salida, sin red, sin disco,
   sin procesos lanzados. Perfiles de nivel, validación de URLs y cargador seguro. */
import type { NivelCalidad } from "./tipos";

/** Niveles de splat: sólo "alta" y "maxima" son admisibles para su uso. */
export function puedeUsarSplat(nivel: NivelCalidad): boolean {
    return nivel === "alta" || nivel === "maxima";
}

/** Presupuesto de splats por nivel (en bytes). */
export const PRESUPUESTO_SPLAT = {
    minima: 0,
    baja: 0,
    media: 0,
    alta: 1_500_000,
    maxima: 3_000_000,
} as const;

/** Opciones de la malla splat recibidas por el constructor. */
export interface SplatMeshOptions {
    url: string;
    maxSplats: number;
}

/** Tipo de clase malla splat inyectable (para tests y producción). */
export interface ClaseSplat<T = any> {
    initialized: Promise<unknown>;
    new (opciones: SplatMeshOptions): T;
}

/** Malla splat base. */
export interface MallaSplat {
    initialized: Promise<unknown>;
    url: string;
    maxSplats: number;
}

/** Valida que la URL sea un enlace https seguro sin credenciales incrustadas. */
export function urlSplatSegura(url: string | URL): boolean {
    if (typeof url === "string") {
        if (!url) return false;
        try {
            const parsed = new URL(url);
            if (parsed.protocol !== "https:") return false;
            if (parsed.username) return false; // descarta usuario:password@host
            return true;
        } catch {
            return false;
        }
    }
    if (url instanceof URL) {
        return url.protocol === "https:" && !url.username;
    }
    return false;
}

/** Devuelve un mensaje indicativo según el nivel y si hay enlace de descarga. */
export function marcadorSplat(nivel: NivelCalidad, url?: string): string | null {
    if (nivel === "baja" || nivel === "media") {
        return "Este objeto necesita un aparato más potente.";
    }
    if (nivel === "alta" && !url) {
        return "Este splat de la Biblioteca todavía no tiene enlace de descarga.";
    }
    if (nivel === "maxima" && url) {
        return null;
    }
    return null;
}

/** Carga un splat gaussiano validando nivel, presupuesto y URL antes de instanciar la malla.
 *  Devuelve { ok, motivo? }.
 */
export async function cargarSplat(
    url: string | URL,
    opciones: {
        bytes?: number;
        SplatMesh: ClaseSplat;
        nivel?: NivelCalidad;
        pedir?: typeof fetch;
    } = {},
): Promise<{ ok: boolean; motivo?: string }> {
    // Usar fetch personalizado si se proporciona (pruebas de HEAD, etc.)
    if (opciones.pedir) {
        const targetUrl = typeof url === "string" ? url : String(url);
        const respuesta = await opciones.pedir(targetUrl);
        if (!respuesta.ok) {
            return { ok: false, motivo: "URL no accesible" };
        }
        const contentLength = respuesta.headers.get("Content-Length");
        if (contentLength && parseInt(contentLength) > PRESUPUESTO_SPLAT.maxima) {
            return { ok: false, motivo: `Excede el límite de ${PRESUPUESTO_SPLAT.maxima} bytes` };
        }
    } else if (!urlSplatSegura(url)) {
        return { ok: false, motivo: "URL debe ser https segura" };
    }

    const { bytes, SplatMesh, nivel } = opciones;

    // Determinar el nivel y presupuesto a usar
    let presupuesto: number | undefined;
    let maxSplatsParaOpciones: number | undefined;

    if (nivel) {
        if (!puedeUsarSplat(nivel)) {
            return { ok: false, motivo: `Nivel ${nivel} no admitido` };
        }
        presupuesto = PRESUPUESTO_SPLAT[nivel];
        maxSplatsParaOpciones = presupuesto;
    } else {
        // Sin nivel: límite duro contra máxima
        if (bytes && bytes > PRESUPUESTO_SPLAT.maxima) {
            return { ok: false, motivo: `Excede el límite de 60 MB` };
        }
    }

    // Intentar instanciar la malla
    try {
        const opcionesMalla: SplatMeshOptions = { url: String(url) };
        if (maxSplatsParaOpciones !== undefined) {
            opcionesMalla.maxSplats = maxSplatsParaOpciones;
        }
        const malla = new SplatMesh(opcionesMalla);
        if (typeof malla.initialized !== "undefined" && malla.initialized instanceof Promise) {
            await malla.initialized;
        }
        return { ok: true };
    } catch (error: any) {
        return { ok: false, motivo: error.message };
    }
}