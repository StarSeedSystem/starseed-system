/**
 * Fusión de pizarras por REGISTRO (SES1116, 2026-11-16).
 *
 * `fusionarPizarras(a, b)` combina dos versiones de la misma pizarra. Por cada id gana el registro
 * de `t` mayor; en empate gana la LÁPIDA y, si no, el autor MENOR por orden alfabético (así dos
 * editores que se cruzan convergen al mismo resultado). Es un máximo sobre un orden total, luego
 * conmutativa, asociativa e idempotente: da igual el orden de llegada o cuántas veces se fusione.
 *
 * Comparte estructura: si `b` no aporta nada devuelve LA MISMA referencia `a`.
 */
import type { CanvasBlock } from "@/lib/canvas/canvas";
import type { CanvasEdge } from "@/lib/canvas/workcenters";
import { FORMATO_PIZARRA, type DocPizarra, type RegistroBase } from "./pizarra";

function clave(v: unknown): string {
    try {
        return JSON.stringify(v) ?? "";
    } catch {
        return "";
    }
}

/** Orden total y determinista entre dos registros del mismo id. */
export function ganaRegistroPizarra<T>(cand: RegistroBase<T>, actual: RegistroBase<T>): boolean {
    if (cand.t !== actual.t) return cand.t > actual.t;
    const candX = cand.x === true;
    const actualX = actual.x === true;
    if (candX !== actualX) return candX;
    if (cand.a !== actual.a) return cand.a < actual.a;
    return clave(cand.v) < clave(actual.v);
}

function fusionarMapa<T>(
    a: Record<string, RegistroBase<T>>,
    b: Record<string, RegistroBase<T>>,
): Record<string, RegistroBase<T>> {
    let salida = a;
    for (const id of Object.keys(b)) {
        const rb = b[id];
        const ra = salida[id];
        if (!ra || ganaRegistroPizarra(rb, ra)) {
            if (salida === a) salida = { ...a };
            salida[id] = rb;
        }
    }
    return salida;
}

/** Fusiona `b` en `a`. Devuelve `a` (misma referencia) si `b` no aporta nada. */
export function fusionarPizarras(a: DocPizarra, b: DocPizarra): DocPizarra {
    if (a === b) return a;
    const bloques = fusionarMapa(a.bloques, b.bloques);
    const aristas = fusionarMapa(a.aristas, b.aristas);
    if (bloques === a.bloques && aristas === a.aristas) return a;
    return { formato: FORMATO_PIZARRA, bloques, aristas };
}

/** ¿Las dos pizarras dicen lo mismo? (ninguna aporta nada a la otra). */
export function pizarrasIguales(a: DocPizarra, b: DocPizarra): boolean {
    return a === b || (fusionarPizarras(a, b) === a && fusionarPizarras(b, a) === b);
}

function igual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    try {
        return JSON.stringify(a) === JSON.stringify(b);
    } catch {
        return false;
    }
}

function aplicarMapa<T extends { id: string }>(
    previos: Record<string, RegistroBase<T>>,
    siguientes: readonly T[],
    c: { t: number; a: string },
): Record<string, RegistroBase<T>> {
    let salida = previos;
    const tocar = (): Record<string, RegistroBase<T>> => {
        if (salida === previos) salida = { ...previos };
        return salida;
    };
    const vistos = new Set<string>();
    for (const v of siguientes) {
        if (!v.id || vistos.has(v.id)) continue;
        vistos.add(v.id);
        const r = previos[v.id];
        if (r && r.x !== true && igual(r.v, v)) continue;
        tocar()[v.id] = { id: v.id, v, t: c.t, a: c.a };
    }
    for (const [id, r] of Object.entries(previos)) if (!vistos.has(id) && r.x !== true) tocar()[id] = { id, v: r.v, t: c.t, a: c.a, x: true };
    return salida;
}

/** Traduce «el lienzo ahora es esta lista» a registros: solo sella lo que cambió y lapida lo que falta. */
export function aplicarLienzo(d: DocPizarra, blocks: readonly CanvasBlock[], edges: readonly CanvasEdge[], c: { t: number; a: string }): DocPizarra {
    const bloques = aplicarMapa(d.bloques, blocks, c);
    const aristas = aplicarMapa(d.aristas, edges, c);
    if (bloques === d.bloques && aristas === d.aristas) return d;
    return { formato: FORMATO_PIZARRA, bloques, aristas };
}

/** Lienzo visible (solo registros vivos) a partir del doc por registro. */
export function lienzoDePizarra(d: DocPizarra): { blocks: CanvasBlock[]; edges: CanvasEdge[] } {
    const blocks: CanvasBlock[] = [];
    const edges: CanvasEdge[] = [];
    for (const r of Object.values(d.bloques)) if (r.x !== true) blocks.push(r.v);
    for (const r of Object.values(d.aristas)) if (r.x !== true) edges.push(r.v);
    return { blocks, edges };
}
