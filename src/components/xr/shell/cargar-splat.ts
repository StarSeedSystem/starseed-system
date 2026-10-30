/**
 * Funciones de utilidad para cargar Splat.
 * Módulo puro, sin dependencias de red o DOM.
 */
import type { NivelCalidad } from "@/lib/xr/tipos";

export const MAX_BYTES_SPLAT = 60 * 1024 * 1024; // 60 MB
export const MOTIVO_TAMANO_SPLAT = "El archivo es mayor de 60 MB";
export const MOTIVO_NIVEL_SPLAT = "El nivel actual no admite splats";
export const MOTIVO_FALLO_SPLAT = "Error al procesar el archivo";
export const MOTIVO_URL_SPLAT = "URL insegura";

export type MallaSplat = { dispose: () => void };
export type ConstructorSplatMesh = (opciones: any) => Promise<MallaSplat>;
export type Registro = { opciones?: any };

export function presupuestoSplat(nivel: NivelCalidad): number {
    if (nivel === "alta") return 1_500_000;
    if (nivel === "maxima") return 3_000_000;
    return 0;
}

export function urlSplatSegura(url: string): boolean {
    return url.startsWith("https://");
}

export function revisarUrlSplat(url: string): string | null {
    return urlSplatSegura(url) ? null : MOTIVO_URL_SPLAT;
}

export function urlSplatDeObjeto(obj: any): string | null {
    if (obj?.tipo === "biblioteca" && obj?.formato === "splat" && typeof obj?.id === "string" && obj.id.startsWith("http")) {
        return obj.id;
    }
    return null;
}

export async function cargarSplat(url: string, opciones: {
    nivel?: NivelCalidad;
    obtenerBytes: () => Promise<Uint8Array>;
    SplatMesh?: ConstructorSplatMesh;
    importarSpark?: () => Promise<any>;
}): Promise<{ ok: true; bytes: number; puntos: number; malla: MallaSplat } | { ok: false; motivo: string }> {
    const errorUrl = revisarUrlSplat(url);
    if (errorUrl) return { ok: false, motivo: errorUrl };

    const presupuesto = presupuestoSplat(opciones.nivel ?? "minima");
    if (presupuesto === 0) return { ok: false, motivo: MOTIVO_NIVEL_SPLAT };

    try {
        const bytes = await opciones.obtenerBytes();
        if (bytes.byteLength > MAX_BYTES_SPLAT) return { ok: false, motivo: MOTIVO_TAMANO_SPLAT + " (60 MB)" };
        
        if (opciones.importarSpark) await opciones.importarSpark();
        
        const malla = await opciones.SplatMesh?.({
            url,
            fileBytes: bytes,
            maxSplats: presupuesto,
            withCredentials: false,
        });

        if (!malla) throw new Error("No malla");
        return { ok: true, bytes: bytes.byteLength, puntos: presupuesto, malla };
    } catch (e) {
        return { ok: false, motivo: MOTIVO_FALLO_SPLAT };
    }
}
