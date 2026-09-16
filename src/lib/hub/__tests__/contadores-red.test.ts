import { describe, it, expect } from "vitest";
import {
    contarConceptos,
    contadoresDe,
    resumenDeContadores,
} from "../contadores-red";

describe("contarConceptos", () => {
    it("lista vacía devuelve [] sin reventar", () => {
        expect(contarConceptos([])).toEqual([]);
    });

    it("posts sin tags o con tags null se ignoran", () => {
        expect(contarConceptos([{ content: "hola" }, { tags: null }])).toEqual([]);
    });

    it("agrupa sin distinguir mayúsculas", () => {
        const r = contarConceptos([
            { tags: ["Cultura"] },
            { tags: ["cultura"] },
        ]);
        expect(r).toEqual([{ etiqueta: "cultura", veces: 2 }]);
    });

    it("#Cultura y cultura son la misma etiqueta", () => {
        const r = contarConceptos([{ tags: ["#Cultura", "cultura", "#cultura"] }]);
        expect(r).toEqual([{ etiqueta: "cultura", veces: 3 }]);
    });

    it("ordena por veces descendente", () => {
        const r = contarConceptos([
            { tags: ["arte"] },
            { tags: ["educación", "arte", "política"] },
            { tags: ["arte", "educación"] },
        ]);
        expect(r[0]).toEqual({ etiqueta: "arte", veces: 3 });
        expect(r[1]).toEqual({ etiqueta: "educación", veces: 2 });
        expect(r[2]).toEqual({ etiqueta: "política", veces: 1 });
    });

    it("ante empate ordena alfabéticamente (estable y determinista)", () => {
        const r = contarConceptos([{ tags: ["zorro", "ábaco", "mesa"] }]);
        expect(r.map((e) => e.etiqueta)).toEqual(["ábaco", "mesa", "zorro"]);
    });

    it("ignora etiquetas vacías o de solo almohadilla", () => {
        expect(contarConceptos([{ tags: ["", "  ", "#"] }])).toEqual([]);
    });
});

describe("contadoresDe", () => {
    it("todo vacío da ceros", () => {
        expect(
            contadoresDe({ posts: [], conexiones: [], propuestasAbiertas: 0, conceptos: [] }),
        ).toEqual({ publicaciones: 0, conexiones: 0, propuestas: 0, conceptos: 0 });
    });

    it("acepta conexiones como número o como lista de ids", () => {
        const base = { posts: [{}, {}], propuestasAbiertas: 3, conceptos: [{ etiqueta: "x" }] };
        expect(contadoresDe({ ...base, conexiones: 7 }).conexiones).toBe(7);
        expect(contadoresDe({ ...base, conexiones: ["a", "b"] }).conexiones).toBe(2);
    });

    it("cuenta los cuatro números", () => {
        expect(
            contadoresDe({
                posts: [{}, {}, {}],
                conexiones: ["a"],
                propuestasAbiertas: 2,
                conceptos: [{ etiqueta: "x" }, { etiqueta: "y" }],
            }),
        ).toEqual({ publicaciones: 3, conexiones: 1, propuestas: 2, conceptos: 2 });
    });
});

describe("resumenDeContadores", () => {
    it("singular: 1 publicación, 1 conexión, 1 propuesta activa, 1 concepto", () => {
        expect(
            resumenDeContadores({ publicaciones: 1, conexiones: 1, propuestas: 1, conceptos: 1 }),
        ).toBe("1 publicación · 1 conexión · 1 propuesta activa · 1 concepto");
    });

    it("plural: 2 publicaciones y 0 usa plural", () => {
        expect(
            resumenDeContadores({ publicaciones: 2, conexiones: 0, propuestas: 5, conceptos: 3 }),
        ).toBe("2 publicaciones · 0 conexiones · 5 propuestas activas · 3 conceptos");
    });
});
