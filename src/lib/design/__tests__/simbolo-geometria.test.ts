import { describe, it, expect } from "vitest";
import {
    APICES,
    BASE_X,
    CENTRO,
    COLORES,
    ESQUINAS,
    FACETAS,
    LIENZO,
    OJO,
    PUPILA,
    RADIO,
    RUTAS,
    SEMILLA,
} from "@/lib/design/simbolo-geometria";

describe("simbolo-geometria · el rombo oficial", () => {
    it("vive en un lienzo de 400 × 400 con centro (200, 200) y r = 80", () => {
        expect(LIENZO).toBe(400);
        expect(CENTRO).toEqual({ x: 200, y: 200 });
        expect(RADIO).toBe(80);
        expect(SEMILLA).toMatchObject({ cx: 200, cy: 200 });
    });

    it("son dos triángulos equiláteros: altura = base · √3 / 2 ± 0,5", () => {
        const base = ESQUINAS[1].x - ESQUINAS[0].x;
        const esperada = (base * Math.sqrt(3)) / 2;
        const alturaArriba = Math.abs(APICES.arriba.y - ESQUINAS[0].y);
        const alturaAbajo = Math.abs(APICES.abajo.y - ESQUINAS[0].y);
        expect(base).toBeCloseTo(138.56, 1);
        expect(Math.abs(alturaArriba - esperada)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(alturaAbajo - esperada)).toBeLessThanOrEqual(0.5);
        expect(alturaArriba).toBeCloseTo(alturaAbajo, 6);
    });

    it("los ápices oficiales del rombo quedan en (200, 80) y (200, 320); altura total 240", () => {
        expect(APICES).toEqual({
            arriba: { x: 200, y: 80 },
            abajo: { x: 200, y: 320 },
        });
        expect(APICES.abajo.y - APICES.arriba.y).toBe(240);
    });
});

describe("simbolo-geometria · la lente del ojo", () => {
    it("cae en y = 200 y sus esquinas están a 200 ± 69,28", () => {
        expect(ESQUINAS[0]).toEqual({ x: 200 - 69.28, y: 200 });
        expect(ESQUINAS[1]).toEqual({ x: 200 + 69.28, y: 200 });
        expect(ESQUINAS.every((p) => p.y === 200)).toBe(true);
        expect(RUTAS.lente).toContain("200");
        expect(RUTAS.lente.startsWith(`M ${ESQUINAS[0].x} 200`)).toBe(true);
    });

    it("el blanco se recorta dentro del círculo oficial y la pupila mide 40", () => {
        expect(OJO).toEqual({ cx: 200, cy: 280.8, r: 109.4 });
        expect(PUPILA).toEqual({ cx: 200, cy: 200, r: 40 });
    });
});

describe("simbolo-geometria · las 12 facetas", () => {
    it("hay 6 arriba y 6 abajo, con sus colores oficiales en orden", () => {
        expect(FACETAS).toHaveLength(12);
        const arriba = FACETAS.filter((f) => f.lado === "arriba");
        const abajo = FACETAS.filter((f) => f.lado === "abajo");
        expect(arriba).toHaveLength(6);
        expect(abajo).toHaveLength(6);
        expect(arriba.map((f) => f.color)).toEqual([...COLORES.arriba]);
        expect(abajo.map((f) => f.color)).toEqual([...COLORES.abajo]);
    });

    it("cada faceta usa un hex oficial y una ruta cerrada de tres puntos", () => {
        const oficiales = new Set([
            "#A52D2D", "#CC3737", "#38A52D", "#51CC37", "#2C2CA8", "#3636CC",
            "#C1BD3A", "#E2D640",
        ]);
        expect(new Set(FACETAS.map((f) => f.id)).size).toBe(12);
        for (const faceta of FACETAS) {
            expect(oficiales.has(faceta.color)).toBe(true);
            expect(faceta.puntos).toHaveLength(3);
            expect(faceta.puntos[1].y).toBe(200);
            expect(faceta.puntos[2].y).toBe(200);
            expect(faceta.d.startsWith("M ")).toBe(true);
            expect(faceta.d.endsWith("Z")).toBe(true);
        }
        expect(BASE_X).toHaveLength(7);
        expect(BASE_X[0]).toBeCloseTo(130.72, 2);
        expect(BASE_X[6]).toBeCloseTo(269.28, 2);
    });
});
