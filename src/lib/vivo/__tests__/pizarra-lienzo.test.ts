/** Lienzo ↔ registros (SVF1A3f): ida y vuelta sin perder campos, y solo cambia el registro que cambió. */
import { describe, expect, test } from "vitest";
import type { CanvasBlock } from "@/lib/canvas/canvas";
import type { CanvasEdge } from "@/lib/canvas/workcenters";
import { normalizarPizarra, pizarraVacia } from "../pizarra";
import { desdeLienzo, haciaLienzo } from "../pizarra-lienzo";

const bloques: CanvasBlock[] = [
    { id: "b1", kind: "text", x: 1, y: 2, w: 3, h: 4, data: { texto: "hola", anidado: { a: [1, 2, { b: null }] } }, title: "Uno" },
    { id: "b2", kind: "link", x: 5, y: 6, w: 7, h: 8, data: { url: "https://x.test" }, group: "g1", accent: "#abc" },
    { id: "b3", kind: "widget", x: 0, y: 0, w: 9, h: 9, data: {}, hidden: true, locked: true },
    { id: "b4", kind: "browser", x: 10, y: 10, w: 20, h: 20, data: { url: "https://y.test" } },
    { id: "b5", kind: "app", x: 11, y: 12, w: 13, h: 14, data: { app: "x" }, title: "Cinco", accent: "red" },
];
const aristas: CanvasEdge[] = [
    { id: "e1", from: "b1", to: "b2", label: "a" },
    { id: "e2", from: "b2", to: "b3" },
    { id: "e3", from: "b4", to: "b5", label: "c" },
];
const ctx = (ahora: number, autor = "ana") => ({ ahora, autor });
const base = () => desdeLienzo(bloques, aristas, pizarraVacia(), ctx(100));

describe("pizarra ↔ lienzo", () => {
    test("ida y vuelta: los mismos objetos con todos sus campos", () => {
        const { blocks, edges } = haciaLienzo(base());
        expect(blocks).toEqual(bloques);
        expect(edges).toEqual(aristas);
        expect(blocks.map((b) => Object.keys(b).sort())).toEqual(bloques.map((b) => Object.keys(b).sort()));
        expect(haciaLienzo(normalizarPizarra(JSON.parse(JSON.stringify(base()))))).toEqual({ blocks: bloques, edges: aristas });
    });

    test("el orden de los bloques del doc viejo se conserva, y lo nuevo va detrás", () => {
        const invertido = [...bloques].reverse();
        const d = normalizarPizarra({ blocks: invertido, edges: [] });
        expect(haciaLienzo(d).blocks.map((b) => b.id)).toEqual(invertido.map((b) => b.id));
        const n = desdeLienzo([...invertido, { ...bloques[0], id: "a0" }], [], d, ctx(50));
        expect(haciaLienzo(n).blocks.map((b) => b.id)).toEqual([...invertido.map((b) => b.id), "a0"]);
    });

    test("sin cambios devuelve el mismo doc; clave en otro orden no cuenta como edición", () => {
        const d = base();
        expect(desdeLienzo(bloques, aristas, d, ctx(200))).toBe(d);
        const barajado = bloques.map((b) => Object.fromEntries(Object.entries(b).reverse()) as unknown as CanvasBlock);
        expect(desdeLienzo(barajado, aristas, d, ctx(200))).toBe(d);
    });

    test("editar un bloque cambia el t de ESE registro y de ningún otro", () => {
        const d = base();
        const editado = bloques.map((b) => (b.id === "b2" ? { ...b, x: 99 } : b));
        const n = desdeLienzo(editado, aristas, d, ctx(300, "beto"));
        expect(n.bloques.b2).toMatchObject({ t: 300, a: "beto" });
        for (const id of ["b1", "b3", "b4", "b5"]) expect(n.bloques[id]).toBe(d.bloques[id]);
        expect(n.aristas).toBe(d.aristas);
    });

    test("quitar un bloque deja lápida; volver a añadirlo lo resucita con t nuevo", () => {
        const d = base();
        const sin = bloques.filter((b) => b.id !== "b4");
        const n = desdeLienzo(sin, aristas, d, ctx(400));
        expect(n.bloques.b4).toMatchObject({ x: true, t: 400 });
        expect(haciaLienzo(n).blocks.map((b) => b.id)).toEqual(["b1", "b2", "b3", "b5"]);
        expect(desdeLienzo(sin, aristas, n, ctx(500))).toBe(n);
        const r = desdeLienzo(bloques, aristas, n, ctx(600));
        expect(r.bloques.b4.x).toBeUndefined();
        expect(r.bloques.b4.t).toBe(600);
        expect(haciaLienzo(r).blocks).toEqual(bloques);
    });

    test("una arista cuyo bloque tiene lápida no sale en haciaLienzo", () => {
        const n = desdeLienzo(bloques.filter((b) => b.id !== "b2"), aristas, base(), ctx(400));
        expect(n.aristas.e1.x).toBeUndefined();
        expect(haciaLienzo(n).edges.map((e) => e.id)).toEqual(["e3"]);
    });
});
