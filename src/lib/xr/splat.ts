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
        if (!url.startsWith("https://")) return false;
        if (url.includes(":")) return false; // descarta usuario:password@host
        try {
            new URL(url);
        } catch {
            return false;
        }
        return true;
    }
    if (url instanceof URL) {
        return url.protocol === "https:" && !url.username && url.pathname.includes(".spz");
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
    } = {},
): Promise<{ ok: boolean; motivo?: string }> {
    const { bytes, SplatMesh, nivel } = opciones;

    // Validar URL
    if (!urlSplatSegura(url)) {
        return { ok: false, motivo: "URL debe ser https segura" };
    }

    // Validar nivel y presupuesto
    const nivelCalibrado = nivel ? nivel : "minima";
    if (!puedeUsarSplat(nivelCalibrado)) {
        return { ok: false, motivo: `Nivel ${nivelCalibrado} no admitido` };
    }
    const presupuesto = PRESUPUESTO_SPLAT[nivelCalibrado];
    if (bytes && bytes > presupuesto) {
        return { ok: false, motivo: `Excede el presupuesto de ${presupuesto} bytes para nivel ${nivelCalibrado}` };
    }

    // Intentar instanciar la malla
    try {
        const malla = new SplatMesh({ url, maxSplats: presupuesto } as SplatMeshOptions);
        if (typeof malla.initialized !== "undefined" && malla.initialized instanceof Promise) {
            await malla.initialized;
        }
        return { ok: true };
    } catch (error: any) {
        return { ok: false, motivo: error.message };
    }
}