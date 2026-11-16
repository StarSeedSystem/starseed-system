/**
 * Pizarra viva (SVF1A2f): modelo POR REGISTRO de la pizarra compartida.
 *
 * Hoy la pizarra sincroniza el documento entero (`{blocks, edges}`, el último en escribir gana) y dos
 * personas dibujando a la vez se pisan. Aquí cada bloque y cada arista es su propio registro, como los
 * widgets de `dashboard.ts` (mismo esquema de reloj `t`, autor `a` y lápida): una edición concurrente de
 * piezas distintas se conserva entera. La fusión está en `pizarra-fusion.ts`.
 *
 * Decisión de reloj (copiada del dashboard): `t` lo da el reloj híbrido del motor (siempre mayor que
 * todo lo visto). Lo migrado del formato viejo lleva `t = 0` y autor «legado»: cualquier edición real gana.
 */
import type { CanvasBlock } from "@/lib/canvas/canvas";
import type { CanvasEdge } from "@/lib/canvas/workcenters";

export const FORMATO_PIZARRA = 1;
const LAPIDAS_MS = 30 * 86_400_000;
const AUTOR_LEGADO = "legado";

interface Registro<T> {
    id: string;
    /** El bloque o la arista tal cual está en el lienzo. */
    v: T;
    /** Reloj híbrido de la última escritura. */
    t: number;
    /** Autor abreviado de esa escritura. */
    a: string;
    /** Lápida: el registro está borrado. */
    x?: true;
    /** Orden de aparición (los bloques no tienen campo de orden propio): índice del doc viejo, o la hora de creación. */
    o?: number;
}
export type RegistroBloque = Registro<CanvasBlock>;
export type RegistroArista = Registro<CanvasEdge>;

export interface DocPizarra {
    formato: 1;
    bloques: Record<string, RegistroBloque>;
    aristas: Record<string, RegistroArista>;
}

export function pizarraVacia(): DocPizarra {
    return { formato: FORMATO_PIZARRA, bloques: {}, aristas: {} };
}

/** ¿Este doc de `os_spaces` ya está en formato por registro? (el viejo `{blocks, edges}` no lo está). */
export function esDocPizarra(doc: Record<string, unknown> | null | undefined): boolean {
    return !!doc && doc.formato === FORMATO_PIZARRA && !!doc.bloques && typeof doc.bloques === "object";
}

/** A Record para guardar en el espacio. */
export function docPizarra(d: DocPizarra): Record<string, unknown> {
    return { formato: FORMATO_PIZARRA, bloques: d.bloques, aristas: d.aristas };
}

function esObjeto(x: unknown): x is Record<string, unknown> {
    return !!x && typeof x === "object" && !Array.isArray(x);
}

function leerMapa<T extends { id: string }>(raw: unknown): Record<string, Registro<T>> {
    const salida: Record<string, Registro<T>> = {};
    if (!esObjeto(raw)) return salida;
    for (const id of Object.keys(raw).sort()) {
        const r = raw[id];
        if (id === "__proto__" || !esObjeto(r) || !esObjeto(r.v) || r.v.id !== id) continue;
        if (typeof r.t !== "number" || !Number.isFinite(r.t) || r.t < 0) continue;
        if (typeof r.a !== "string" || r.a.length < 1 || r.a.length > 24) continue;
        const o = typeof r.o === "number" && Number.isFinite(r.o) ? { o: r.o } : {};
        salida[id] = { id, v: r.v as unknown as T, t: r.t, a: r.a, ...(r.x === true ? { x: true as const } : {}), ...o };
    }
    return salida;
}

function migrar<T extends { id: string }>(lista: unknown): Record<string, Registro<T>> {
    const salida: Record<string, Registro<T>> = {};
    if (!Array.isArray(lista)) return salida;
    for (const [i, v] of lista.entries()) {
        if (!esObjeto(v) || typeof v.id !== "string" || !v.id || v.id === "__proto__" || salida[v.id]) continue;
        salida[v.id] = { id: v.id, v: v as unknown as T, t: 0, a: AUTOR_LEGADO, o: i };
    }
    return salida;
}

/** Lee un doc venido de fuera sin fiarse de nada; migra el formato viejo `{blocks, edges}` sin perder piezas. */
export function normalizarPizarra(raw: unknown): DocPizarra {
    if (!esObjeto(raw)) return pizarraVacia();
    if (esDocPizarra(raw)) return { formato: FORMATO_PIZARRA, bloques: leerMapa<CanvasBlock>(raw.bloques), aristas: leerMapa<CanvasEdge>(raw.aristas) };
    return { formato: FORMATO_PIZARRA, bloques: migrar<CanvasBlock>(raw.blocks), aristas: migrar<CanvasEdge>(raw.edges) };
}

function podarMapa<T>(m: Record<string, Registro<T>>, ahora: number): Record<string, Registro<T>> {
    let salida: Record<string, Registro<T>> | null = null;
    for (const [id, r] of Object.entries(m)) {
        if (r.x && ahora - r.t > LAPIDAS_MS) {
            salida ??= { ...m };
            delete salida[id];
        }
    }
    return salida ?? m;
}

/** Quita las lápidas de más de 30 días (determinista: todas las copias podan lo mismo). */
export function podarPizarra(d: DocPizarra, ahora: number): DocPizarra {
    const bloques = podarMapa(d.bloques, ahora);
    const aristas = podarMapa(d.aristas, ahora);
    return bloques === d.bloques && aristas === d.aristas ? d : { formato: FORMATO_PIZARRA, bloques, aristas };
}

export function maxTiempoPizarra(d: DocPizarra): number {
    let max = 0;
    for (const r of [...Object.values(d.bloques), ...Object.values(d.aristas)]) if (r.t > max) max = r.t;
    return max;
}
