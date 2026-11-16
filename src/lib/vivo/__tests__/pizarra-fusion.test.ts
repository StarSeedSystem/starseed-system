/**
 * Pizarra viva por registro (SES1116): dos editores concurrentes conservan sus bloques, el mismo
 * bloque lo gana el reloj mayor, la lápida borra y una edición posterior resucita, y la fusión es
 * conmutativa, asociativa e idempotente. El doc viejo `{blocks, edges}` migra sin perder nada.
 */
import { expect, test } from "vitest";
import type { CanvasBlock } from "@/lib/canvas/canvas";
import type { CanvasEdge } from "@/lib/canvas/workcenters";
import {
    docPizarra,
    esDocPizarra,
    LAPIDAS_PIZARRA_MS,
    maxTiempoPizarra,
    normalizarPizarra,
    pizarraVacia,
    podarPizarra,
    type DocPizarra,
    type RegistroArista,
    type RegistroBloque,
} from "@/lib/vivo/pizarra";
import { fusionarPizarras, pizarrasIguales } from "@/lib/vivo/pizarra-fusion";

const bloque = (id: string, x = 0): CanvasBlock => ({ id, kind: "text", x, y: 0, w: 100, h: 60, data: {} });
const arista = (id: string, from: string, to: string): CanvasEdge => ({ id, from, to });
const rb = (id: string, x: number, t: number, a: string, difunto = false): RegistroBloque =>
    difunto ? { id, v: bloque(id, x), t, a, x: true } : { id, v: bloque(id, x), t, a };
const ra = (id: string, from: string, to: string, t: number, a: string): RegistroArista => ({ id, v: arista(id, from, to), t, a });
const doc = (bloques: RegistroBloque[], aristas: RegistroArista[] = []): DocPizarra => {
    const d = pizarraVacia();
    for (const r of bloques) d.bloques[r.id] = r;
    for (const r of aristas) d.aristas[r.id] = r;
    return d;
};
const vivo = (d: DocPizarra, id: string): boolean => !!d.bloques[id] && d.bloques[id].x !== true;

test("dos personas editan bloques distintos: la fusión conserva las dos ediciones", () => {
    const a = doc([rb("b1", 50, 20, "ana"), rb("b2", 0, 10, "bea")]);
    const b = doc([rb("b1", 0, 10, "ana"), rb("b2", 90, 21, "bea")]);
    for (const m of [fusionarPizarras(a, b), fusionarPizarras(b, a)]) {
        expect(m.bloques.b1.v.x).toBe(50);
        expect(m.bloques.b2.v.x).toBe(90);
    }
});

test("el mismo bloque a la vez: gana el reloj mayor en los dos órdenes", () => {
    const a = doc([rb("b1", 10, 100, "ana")]);
    const b = doc([rb("b1", 20, 200, "bea")]);
    expect(fusionarPizarras(a, b).bloques.b1.v.x).toBe(20);
    expect(fusionarPizarras(b, a).bloques.b1.v.x).toBe(20);
    const empate = doc([rb("b1", 30, 200, "ana")]);
    expect(fusionarPizarras(b, empate).bloques.b1.v.x).toBe(30);
    expect(fusionarPizarras(empate, b).bloques.b1.v.x).toBe(30);
});

test("lápida con más reloj borra; una edición posterior resucita", () => {
    const editado = doc([rb("b1", 10, 100, "ana")]);
    const borrado = doc([rb("b1", 10, 300, "bea", true)]);
    expect(vivo(fusionarPizarras(editado, borrado), "b1")).toBe(false);
    expect(vivo(fusionarPizarras(borrado, editado), "b1")).toBe(false);
    const mismoT = doc([rb("b1", 10, 300, "aaa", true)]);
    const edicionMismoT = doc([rb("b1", 10, 300, "zzz")]);
    expect(vivo(fusionarPizarras(edicionMismoT, mismoT), "b1")).toBe(false);
    const resucitado = doc([rb("b1", 77, 400, "ana")]);
    const m = fusionarPizarras(borrado, resucitado);
    expect(vivo(m, "b1")).toBe(true);
    expect(m.bloques.b1.v.x).toBe(77);
});

test("leyes de CRDT sobre 21 conjuntos con semilla fija", () => {
    let s = 20261116 >>> 0;
    const rnd = (): number => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const autores = ["ana", "bea", "cid"];
    const generar = (): DocPizarra => {
        const d = pizarraVacia();
        for (let i = 0; i < 4; i += 1) {
            const id = `b${Math.floor(rnd() * 3)}`;
            d.bloques[id] = rb(id, Math.floor(rnd() * 100), Math.floor(rnd() * 5), autores[Math.floor(rnd() * 3)], rnd() < 0.25);
            const eid = `e${Math.floor(rnd() * 2)}`;
            d.aristas[eid] = ra(eid, "b0", "b1", Math.floor(rnd() * 5), autores[Math.floor(rnd() * 3)]);
        }
        return d;
    };
    const casos = Array.from({ length: 21 }, generar);
    for (const a of casos) {
        expect(fusionarPizarras(a, a)).toBe(a);
        for (const b of casos) expect(pizarrasIguales(fusionarPizarras(a, b), fusionarPizarras(b, a))).toBe(true);
    }
    for (let i = 0; i < casos.length; i += 1) {
        const a = casos[i];
        const b = casos[(i + 7) % casos.length];
        const c = casos[(i + 13) % casos.length];
        expect(pizarrasIguales(fusionarPizarras(fusionarPizarras(a, b), c), fusionarPizarras(a, fusionarPizarras(b, c)))).toBe(true);
    }
});

test("un doc viejo {blocks, edges} migra sin perder nada", () => {
    const d = normalizarPizarra({ blocks: [bloque("b1"), bloque("b2")], edges: [arista("e1", "b1", "b2")] });
    expect(Object.keys(d.bloques).sort()).toEqual(["b1", "b2"]);
    expect(Object.keys(d.aristas)).toEqual(["e1"]);
    expect(d.bloques.b1.t).toBe(0);
    expect(d.bloques.b1.a).toBe("legado");
    expect(d.aristas.e1.v.from).toBe("b1");
});

test("normalizar descarta lo roto, envuelve y poda lápidas viejas", () => {
    const roto = normalizarPizarra({ bloques: { b1: { id: "b1", v: bloque("b1"), t: "x", a: "ana" }, otro: {} }, aristas: {} });
    expect(Object.keys(roto.bloques)).toEqual([]);
    const d = doc([rb("b1", 0, 100, "ana", true), rb("b2", 0, 200, "ana")]);
    expect(maxTiempoPizarra(d)).toBe(200);
    const podado = podarPizarra(d, 100 + LAPIDAS_PIZARRA_MS + 1);
    expect(podado.bloques.b1).toBeUndefined();
    expect(podado.bloques.b2).toBeDefined();
    expect(podarPizarra(d, 0)).toBe(d);
    const guardado = docPizarra(d);
    expect(esDocPizarra(guardado)).toBe(true);
    expect(normalizarPizarra(guardado)).toEqual(d);
});
