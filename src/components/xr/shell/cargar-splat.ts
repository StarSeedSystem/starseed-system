/**
 * StarSeed XR · SPLATS GAUSSIANOS con Spark (XR1010AM · contrato §1.3 y §3 g). Lógica pura para node;
 * `@sparkjsdev/spark` se importa perezosamente dentro de `cargarSplat`; solo `alta`/`maxima`; devuelve
 * `{ok:false, motivo}` en vez de lanzar. Sin `node:*`.
 */
import type { NivelCalidad } from "../../../lib/xr/tipos";
import type { ObjetoMundo } from "../../../lib/xr/mundo-tipos";

/** Tope de descarga de un archivo de splat: 60 MB. */
export const MAX_BYTES_SPLAT = 60 * 1024 * 1024;
export const PUNTOS_SPLAT = { alta: 1_500_000, maxima: 3_000_000 } as const;
export const MOTIVO_NIVEL_SPLAT = "Este objeto necesita un aparato más potente";
export const MOTIVO_URL_SPLAT = "Solo se admiten enlaces https sin credenciales";
export const MOTIVO_TAMANO_SPLAT = "El archivo del splat supera los 60 MB";
export const MOTIVO_FALLO_SPLAT = "No se pudo cargar el splat";
export const MOTIVO_SIN_URL_SPLAT = "Este objeto no tiene un enlace de splat válido";

export interface OpcionesSplatMesh {
    url: string;
    fileBytes: Uint8Array;
    maxSplats: number;
    withCredentials: boolean;
}

export interface MallaSplat {
    initialized?: Promise<unknown>;
    dispose?: () => void;
}

export type ConstructorSplatMesh = new (opciones: OpcionesSplatMesh) => MallaSplat;
export type ImportarSpark = () => Promise<{ SplatMesh: ConstructorSplatMesh }>;

export type ResultadoSplat =
    | { ok: true; malla: MallaSplat; bytes: number; puntos: number }
    | { ok: false; motivo: string };

export interface OpcionesCargarSplat {
    /** Constructor inyectado (pruebas); si falta se importa Spark dentro de la función. */
    SplatMesh?: ConstructorSplatMesh;
    nivel?: NivelCalidad;
    maxBytes?: number;
    obtenerBytes?: (url: string) => Promise<Uint8Array>;
    importarSpark?: ImportarSpark;
}

export function puedeUsarSplat(nivel: NivelCalidad): nivel is "alta" | "maxima" {
    return nivel === "alta" || nivel === "maxima";
}

export function presupuestoSplat(nivel: NivelCalidad): number {
    return puedeUsarSplat(nivel) ? PUNTOS_SPLAT[nivel] : 0;
}

export function revisarUrlSplat(url: string): string | null {
    if (typeof url !== "string" || url.trim() === "") return MOTIVO_URL_SPLAT;
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return MOTIVO_URL_SPLAT;
    }
    if (parsed.protocol !== "https:") return MOTIVO_URL_SPLAT;
    if (parsed.username !== "" || parsed.password !== "") return MOTIVO_URL_SPLAT;
    return null;
}

export function urlSplatSegura(url: string): boolean {
    return revisarUrlSplat(url) === null;
}

export function urlSplatDeObjeto(objeto: ObjetoMundo): string | null {
    const fuente = objeto.fuente;
    if (fuente.tipo !== "biblioteca" || fuente.formato !== "splat") return null;
    return urlSplatSegura(fuente.id) ? fuente.id : null;
}

async function descargarBytes(url: string): Promise<Uint8Array> {
    const respuesta = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    return new Uint8Array(await respuesta.arrayBuffer());
}

async function importarSpark(): Promise<{ SplatMesh: ConstructorSplatMesh }> {
    const modulo = await import("@sparkjsdev/spark");
    return { SplatMesh: modulo.SplatMesh as unknown as ConstructorSplatMesh };
}

/** Carga un splat validando URL, nivel y tamaño; devuelve motivo en vez de lanzar. */
export async function cargarSplat(url: string, opciones: OpcionesCargarSplat = {}): Promise<ResultadoSplat> {
    const motivoUrl = revisarUrlSplat(url);
    if (motivoUrl) return { ok: false, motivo: motivoUrl };

    const nivel = opciones.nivel ?? "maxima";
    if (!puedeUsarSplat(nivel)) return { ok: false, motivo: MOTIVO_NIVEL_SPLAT };

    let bytes: Uint8Array;
    try {
        bytes = await (opciones.obtenerBytes ?? descargarBytes)(url);
    } catch {
        return { ok: false, motivo: MOTIVO_FALLO_SPLAT };
    }

    const maxBytes = opciones.maxBytes ?? MAX_BYTES_SPLAT;
    if (bytes.byteLength > maxBytes) {
        const megas = Math.round((bytes.byteLength / (1024 * 1024)) * 10) / 10;
        return { ok: false, motivo: `${MOTIVO_TAMANO_SPLAT} (${megas} MB)` };
    }

    let malla: MallaSplat | null = null;
    try {
        const Constructor = opciones.SplatMesh ?? (await (opciones.importarSpark ?? importarSpark)()).SplatMesh;
        const puntos = presupuestoSplat(nivel);
        malla = new Constructor({ url, fileBytes: bytes, maxSplats: puntos, withCredentials: false });
        if (malla.initialized) await malla.initialized;
        return { ok: true, malla, bytes: bytes.byteLength, puntos };
    } catch {
        if (malla) malla.dispose?.();
        return { ok: false, motivo: MOTIVO_FALLO_SPLAT };
    }
}
