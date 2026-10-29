/**
 * StarSeed XR · CARGA DE SPLATS GAUSSIANOS (XR1010AM · contrato `architecture/starseed-xr.md` §1.3 y §3 g).
 * `@sparkjsdev/spark` 2.3.1 (MIT, `three >= 0.180`): el objeto splat es una `SplatMesh` con
 * `initialized: Promise<SplatMesh>` que resuelve al terminar la descarga o rechaza si falla.
 * Sólo en niveles alta y máxima; el paquete entra con `import()` perezoso DENTRO de la función
 * (`cargarSplat`), nunca en el arranque del módulo. Todo fallo vuelve `{ok:false, motivo}`: nunca lanza.
 * Módulo sin React ni `node:*`; la prueba (`__tests__/cargar-splat.test.ts`) inyecta el cargador falso.
 */
import type { SplatMeshOptions } from "@sparkjsdev/spark";
import type { NivelCalidad } from "../../../lib/xr/tipos";

/** Tope de tamaño del archivo de splat que baja a la escena (incluye .ply sin comprimir grandes). */
export const TOPE_BYTES_SPLAT = 60 * 1024 * 1024;
/** Puntos gaussianos máximos que se materializan por nivel. 0 = el splat no se usa en ese nivel. */
export const PRESUPUESTO_SPLAT: Record<NivelCalidad, number> = {
    minima: 0,
    baja: 0,
    media: 0,
    alta: 1_500_000,
    maxima: 3_000_000,
};

export const puedeUsarSplat = (nivel: NivelCalidad): boolean => PRESUPUESTO_SPLAT[nivel] > 0;

/** Lo mínimo que `cargarSplat` pide a la malla: la clase real de Spark cumple de sobra. */
export interface MallaSplat {
    initialized?: Promise<unknown>;
}

export type ClaseSplat<M extends MallaSplat> = new (opciones: SplatMeshOptions) => M;

export interface OpcionesCarga<M extends MallaSplat> {
    /** Inyectado en pruebas; si falta, `import("@sparkjsdev/spark")` perezoso dentro de la función. */
    SplatMesh?: ClaseSplat<M>;
    /** Nivel del aparato: fija `maxSplats` al presupuesto del nivel. */
    nivel?: NivelCalidad;
    /** Bytes conocidos del archivo (ficha de la Biblioteca). Si falta, HEAD para leer Content-Length. */
    bytes?: number | null;
    /** `fetch` inyectable (pruebas); por defecto el global del navegador. */
    pedir?: typeof fetch;
}

export type ResultadoSplat<M> = { ok: true; mesh: M } | { ok: false; motivo: string };

/** Sólo https y sin usuario/contraseña en la URL: el splat viaja como datos, no arrastra credenciales. */
export function urlSplatSegura(url: string): boolean {
    if (typeof url !== "string" || url.length === 0) return false;
    try {
        const u = new URL(url);
        return u.protocol === "https:" && !u.username && !u.password;
    } catch {
        return false;
    }
}

/** Bytes del archivo por HEAD (Content-Length); `null` si no se saben: entonces no hay tope que aplicar. */
async function bytesDeArchivo(url: string, pedir?: typeof fetch): Promise<number | null> {
    const f = pedir ?? (typeof fetch === "function" ? fetch : undefined);
    if (!f) return null;
    try {
        const r = await f(url, { method: "HEAD" });
        const v = r.headers.get("Content-Length");
        const n = v === null ? Number.NaN : Number(v);
        return Number.isFinite(n) ? n : null;
    } catch {
        return null;
    }
}

/** Mensaje breve en español a partir del error que Spark (o la red) dejó caer. */
export function motivoSplatError(e: unknown): string {
    const detalle = e instanceof Error && e.message ? e.message.slice(0, 80) : "";
    return detalle ? `No se pudo cargar el splat: ${detalle}` : "No se pudo cargar el splat del objeto.";
}

/** Carga un splat convertido en `{ok, motivo}`: URLs inseguras, archivos enormes y fallos no lanzan. */
export async function cargarSplat<M extends MallaSplat>(
    url: string,
    opciones: OpcionesCarga<M> = {},
): Promise<ResultadoSplat<M>> {
    if (!urlSplatSegura(url)) {
        return { ok: false, motivo: "El enlace del splat debe ser https y sin credenciales." };
    }
    const bytes = opciones.bytes == null ? await bytesDeArchivo(url, opciones.pedir) : opciones.bytes;
    if (typeof bytes === "number" && bytes > TOPE_BYTES_SPLAT) {
        const mb = Math.round(bytes / 1_048_576);
        return { ok: false, motivo: `El splat pesa ${mb} MB y el tope en escena es de 60 MB: pide una versión ligera.` };
    }
    let Clase = opciones.SplatMesh;
    if (!Clase) {
        try {
            Clase = (await import("@sparkjsdev/spark")).SplatMesh as unknown as ClaseSplat<M>;
        } catch {
            return { ok: false, motivo: "El motor de splats no se pudo abrir en este aparato." };
        }
    }
    try {
        const maxSplats = opciones.nivel ? PRESUPUESTO_SPLAT[opciones.nivel] || undefined : undefined;
        const mesh = new Clase({ url, maxSplats });
        await mesh.initialized;
        return { ok: true, mesh };
    } catch (e) {
        return { ok: false, motivo: motivoSplatError(e) };
    }
}

/** Texto del marcador que sustituye al splat; `null` = se puede intentar cargar. */
export function marcadorSplat(nivel: NivelCalidad, url?: string): string | null {
    if (!url) return "Este splat de la Biblioteca todavía no tiene enlace de descarga.";
    if (!puedeUsarSplat(nivel)) return "Este objeto necesita un aparato más potente.";
    return null;
}
