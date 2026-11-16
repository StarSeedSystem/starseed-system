/** Fusión de la pizarra por registro (SVF1A2f): conserva las dos ediciones, converge en cualquier orden. */
import { describe, expect, test } from "vitest";
import type { CanvasBlock } from "@/lib/canvas/canvas";
import { esDocPizarra, maxTiempoPizarra, normalizarPizarra, pizarraVacia, podarPizarra, docPizarra, type DocPizarra } from "../pizarra";
import { fusionarPizarras as f } from "../pizarra-fusion";

const bl = (id: string, x = 0): CanvasBlock => ({ id, kind: "text", x, y: 0, w: 10, h: 10, data: { texto: id } });
function doc(regs: { id: string; x?: number; t: number; a: string; borrado?: boolean }[]): DocPizarra {
    const d = pizarraVacia();
    for (const r of regs) d.bloques[r.id] = { id: r.id, v: bl(r.id, r.x), t: r.t, a: r.a, ...(r.borrado ? { x: true as const } : {}) };
    return d;
}
const vivos = (d: DocPizarra) => Object.values(d.bloques).filter((r) => !r.x).map((r) => r.id).sort();

describe("fusión de pizarras", () => {
    test("(1) bloques distintos a la vez: se conservan las dos ediciones, en cualquier orden", () => {
        const base = doc([{ id: "b1", t: 1, a: "base" }, { id: "b2", t: 1, a: "base" }]);
        const a = f(base, doc([{ id: "b1", x: 50, t: 10, a: "ana" }]));
        const b = f(base, doc([{ id: "b2", x: 70, t: 11, a: "beto" }]));
        for (const r of [f(a, b), f(b, a)]) {
            expect(r.bloques.b1.v.x).toBe(50);
            expect(r.bloques.b2.v.x).toBe(70);
        }
        expect(f(a, b)).toEqual(f(b, a));
    });

    test("(2) mismo bloque: gana el de mayor t en los dos órdenes", () => {
        const a = doc([{ id: "b1", x: 1, t: 10, a: "ana" }]);
        const b = doc([{ id: "b1", x: 2, t: 20, a: "beto" }]);
        expect(f(a, b).bloques.b1.v.x).toBe(2);
        expect(f(b, a).bloques.b1.v.x).toBe(2);
    });

    test("empate de t: la lápida gana; si no, el autor menor", () => {
        const viva = doc([{ id: "b1", x: 1, t: 5, a: "aaa" }]);
        const lapida = doc([{ id: "b1", x: 2, t: 5, a: "zzz", borrado: true }]);
        expect(f(viva, lapida).bloques.b1.x).toBe(true);
        expect(f(lapida, viva).bloques.b1.x).toBe(true);
        const p = doc([{ id: "b1", x: 1, t: 5, a: "ana" }]);
        const q = doc([{ id: "b1", x: 2, t: 5, a: "beto" }]);
        expect(f(p, q).bloques.b1.a).toBe("ana");
        expect(f(q, p).bloques.b1.a).toBe("ana");
    });

    test("(3) la lápida con t mayor borra; una edición posterior a la lápida lo resucita", () => {
        const edicion = doc([{ id: "b1", x: 9, t: 10, a: "ana" }]);
        const lapida = doc([{ id: "b1", t: 20, a: "beto", borrado: true }]);
        expect(vivos(f(edicion, lapida))).toEqual([]);
        expect(vivos(f(lapida, edicion))).toEqual([]);
        const despues = doc([{ id: "b1", x: 3, t: 30, a: "ana" }]);
        expect(vivos(f(f(edicion, lapida), despues))).toEqual(["b1"]);
        expect(vivos(f(despues, f(lapida, edicion)))).toEqual(["b1"]);
    });

    test("(4) propiedades sobre 30 conjuntos con semilla fija", () => {
        let s = 20261116;
        const azar = (n: number) => ((s = (s * 1103515245 + 12345) % 2147483648), s % n);
        const gen = (): DocPizarra => {
            const regs = Array.from({ length: 1 + azar(5) }, () => ({
                id: `b${azar(5)}`, x: azar(4), t: azar(6), a: ["ana", "beto", "cora"][azar(3)], borrado: azar(4) === 0,
            }));
            const d = pizarraVacia();
            for (const r of regs) d.aristas[`e${r.id}`] = { id: `e${r.id}`, v: { id: `e${r.id}`, from: r.id, to: "b0" }, t: r.t, a: r.a };
            return f(d, doc(regs));
        };
        for (let i = 0; i < 30; i++) {
            const [a, b, c] = [gen(), gen(), gen()];
            expect(f(a, b)).toEqual(f(b, a));
            expect(f(f(a, b), c)).toEqual(f(a, f(b, c)));
            expect(f(a, a)).toBe(a);
            expect(f(a, f(a, b))).toEqual(f(a, b));
        }
    });

    test("devuelve a MISMA referencia si b no aporta nada", () => {
        const a = doc([{ id: "b1", t: 10, a: "ana" }, { id: "b2", t: 10, a: "ana" }]);
        expect(f(a, doc([{ id: "b1", t: 5, a: "ana" }]))).toBe(a);
        expect(f(a, pizarraVacia())).toBe(a);
    });
});

describe("normalizar, migrar y podar", () => {
    test("(5) un doc viejo {blocks, edges} migra sin perder nada", () => {
        const viejo = { blocks: [bl("b1"), bl("b2", 4), { ...bl("b3"), accent: "#fff", group: "g", hidden: true, locked: true, title: "T" }], edges: [{ id: "e1", from: "b1", to: "b2", label: "x" }], sharing: "ajeno" };
        const d = normalizarPizarra(viejo);
        expect(Object.keys(d.bloques)).toHaveLength(3);
        expect(d.bloques.b3.v).toEqual(viejo.blocks[2]);
        expect(d.aristas.e1.v).toEqual(viejo.edges[0]);
        expect(Object.values(d.bloques).every((r) => r.t === 0 && r.a === "legado" && !r.x)).toBe(true);
        expect(esDocPizarra(docPizarra(d))).toBe(true);
        expect(normalizarPizarra(docPizarra(d))).toEqual(d);
    });

    test("descarta lo roto y no se fía de claves peligrosas", () => {
        const raw = { formato: 1, bloques: { ok: { id: "ok", v: bl("ok"), t: 3, a: "ana" }, mal: { id: "mal", v: bl("otro"), t: 3, a: "ana" }, neg: { id: "neg", v: bl("neg"), t: -1, a: "ana" }, sin: 5 }, aristas: 7 };
        expect(Object.keys(normalizarPizarra(raw).bloques)).toEqual(["ok"]);
        expect(normalizarPizarra(null)).toEqual(pizarraVacia());
        expect(normalizarPizarra({ blocks: "no", edges: [null, { id: "" }] })).toEqual(pizarraVacia());
    });

    test("poda lápidas de más de 30 días y calcula el tiempo máximo", () => {
        const dia = 86_400_000;
        const d = doc([{ id: "viejo", t: 1000, a: "ana", borrado: true }, { id: "reciente", t: 40 * dia, a: "ana", borrado: true }, { id: "vivo", t: 5, a: "ana" }]);
        const p = podarPizarra(d, 41 * dia);
        expect(Object.keys(p.bloques).sort()).toEqual(["reciente", "vivo"]);
        expect(podarPizarra(p, 41 * dia)).toBe(p);
        expect(maxTiempoPizarra(d)).toBe(40 * dia);
    });
});
