/**
 * Pizarra viva (SVF1A3f): del lienzo (`blocks[]` + `edges[]`) a registros y de vuelta, sin perder campos.
 *
 * `desdeLienzo` solo toca lo que cambió: un registro nuevo (`t = ahora`) por cada pieza cuyo JSON difiera
 * del `v` previo; las iguales conservan su registro (y su reloj); lo que estaba y ya no está pasa a lápida;
 * lo que reaparece tras una lápida resucita con `t` nuevo. Si no cambió nada devuelve `previo` (misma
 * referencia). El valor se guarda ENTERO (`v` = el objeto del lienzo), así ningún campo, presente o futuro,
 * se pierde. Orden de salida: el de aparición (`o`: índice en el doc viejo, hora de creación en lo nuevo), luego por id.
 */
import type { CanvasBlock } from "@/lib/canvas/canvas";
import type { CanvasEdge } from "@/lib/canvas/workcenters";
import type { DocPizarra } from "./pizarra";

export interface CtxPizarra {
    ahora: number;
    autor: string;
}

interface Reg<T> {
    id: string;
    v: T;
    t: number;
    a: string;
    x?: true;
    o?: number;
}

const cache = new WeakMap<object, string>();

/** JSON con claves ordenadas: dos objetos iguales con claves en otro orden no cuentan como «editados». */
function estable(v: unknown): string {
    if (!v || typeof v !== "object") return JSON.stringify(v) ?? "null";
    const o = v as object;
    const previo = cache.get(o);
    if (previo !== undefined) return previo;
    const s = Array.isArray(v)
        ? `[${v.map(estable).join(",")}]`
        : `{${Object.keys(o).sort().filter((k) => (o as Record<string, unknown>)[k] !== undefined).map((k) => `${JSON.stringify(k)}:${estable((o as Record<string, unknown>)[k])}`).join(",")}}`;
    cache.set(o, s);
    return s;
}

function diferencial<T extends { id: string }>(piezas: readonly T[], previo: Record<string, Reg<T>>, c: CtxPizarra): Record<string, Reg<T>> {
    let salida = previo;
    const poner = (r: Reg<T>) => {
        if (salida === previo) salida = { ...previo };
        salida[r.id] = r;
    };
    const vistos = new Set<string>();
    for (const v of piezas) {
        if (!v || typeof v.id !== "string" || !v.id || v.id === "__proto__") continue;
        vistos.add(v.id);
        const p = Object.prototype.hasOwnProperty.call(previo, v.id) ? previo[v.id] : undefined;
        if (!p || p.x || estable(p.v) !== estable(v)) poner({ id: v.id, v, t: c.ahora, a: c.autor, o: p?.o ?? c.ahora });
    }
    for (const p of Object.values(previo)) if (!p.x && !vistos.has(p.id)) poner({ ...p, x: true, t: c.ahora, a: c.autor });
    return salida;
}

export function desdeLienzo(blocks: readonly CanvasBlock[], edges: readonly CanvasEdge[], previo: DocPizarra, ctx: CtxPizarra): DocPizarra {
    const bloques = diferencial(blocks, previo.bloques, ctx);
    const aristas = diferencial(edges, previo.aristas, ctx);
    return bloques === previo.bloques && aristas === previo.aristas ? previo : { formato: 1, bloques, aristas };
}

/** Por orden de aparición (`o`) y, a igualdad, por id: estable en todas las copias. */
const porOrden = (a: Reg<unknown>, b: Reg<unknown>) => (a.o ?? 0) - (b.o ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function haciaLienzo(d: DocPizarra): { blocks: CanvasBlock[]; edges: CanvasEdge[] } {
    const blocks = Object.values(d.bloques).filter((r) => !r.x).sort(porOrden).map((r) => r.v);
    const edges = Object.values(d.aristas)
        .filter((r) => !r.x && !d.bloques[r.v.from]?.x && !d.bloques[r.v.to]?.x)
        .sort(porOrden)
        .map((r) => r.v);
    return { blocks, edges };
}
