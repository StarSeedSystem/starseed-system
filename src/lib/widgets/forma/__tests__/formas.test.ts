import { describe, expect, it } from "vitest";
import { FORMAS, relacionForma, trazoForma } from "../formas";

const numeros = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

describe("trazoForma", () => {
    it.each(FORMAS)("%s: path cerrado dentro de la caja", (tipo) => {
        for (const [w, h] of [[200, 200], [320, 140], [90, 260]]) {
            const d = trazoForma(tipo, w, h, "semilla-x");
            expect(d.startsWith("M")).toBe(true);
            expect(d.endsWith("Z")).toBe(true);
            for (const v of numeros(d)) {
                expect(v).toBeGreaterThanOrEqual(0);
                expect(v).toBeLessThanOrEqual(Math.max(w, h));
            }
        }
    });

    it("es determinista por semilla y cambia con otra semilla", () => {
        for (const tipo of ["cristal", "mancha"] as const) {
            expect(trazoForma(tipo, 240, 180, "a")).toBe(trazoForma(tipo, 240, 180, "a"));
            expect(trazoForma(tipo, 240, 180, "a")).not.toBe(trazoForma(tipo, 240, 180, "b"));
        }
    });

    it("la órbita es un anillo: dos subtrayectos", () => {
        expect(trazoForma("orbita", 200, 200).match(/M/g)?.length).toBe(2);
    });

    it("tamaños imposibles no lanzan", () => {
        expect(trazoForma("orbe", 0, 100)).toBe("");
        expect(trazoForma("cristal", -5, 10)).toBe("");
    });

    it("relación de aspecto", () => {
        expect(relacionForma("orbe")).toBe("cuadrada");
        expect(relacionForma("onda")).toBe("libre");
    });
});
