import { describe, it, expect } from "vitest";
import {
    APEXES,
    BLANCO_OJO,
    BRILLO,
    CENTRO,
    COLORES_DISCOS,
    COLORES_FACETAS,
    COLORES_OJO,
    DISCO_ABAJO,
    DISCO_ARRIBA,
    ESQUINAS,
    FACETAS,
    PUPILA,
    RADIO,
    RUTA_LENS,
    rutaDeFaceta,
} from "../simbolo-geometria";

/* DAN1024I — la geometría del símbolo oficial: rombo equilátero, 12 facetas con sus
 * hex oficiales y la lente del ojo sobre la línea y = 200. */

describe("geometría del símbolo StarSeed (referencia-2)", () => {
    it("el rombo de dos triángulos es EQUILÁTERO: altura = base·√3/2 ± 0,5", () => {
        const base = ESQUINAS.derecha.x - ESQUINAS.izquierda.x;
        const altura = ESQUINAS.izquierda.y - APEXES.arriba.y;
        expect(Math.abs(altura - (base * Math.sqrt(3)) / 2)).toBeLessThanOrEqual(0.5);
        // Simetría respecto del centro: igual por abajo.
        expect(APEXES.abajo.y - ESQUINAS.derecha.y).toBeCloseTo(altura, 9);
        // Y la esquina sale del radio: media base = r·cos 30° (± 0,05).
        expect(base / 2 - RADIO * Math.cos(Math.PI / 6)).toBeLessThanOrEqual(0.05);
        expect(base / 2 - RADIO * Math.cos(Math.PI / 6)).toBeGreaterThanOrEqual(-0.05);
    });

    it("hay 12 facetas (6 arriba, 6 abajo) con los hex oficiales", () => {
        expect(FACETAS).toHaveLength(12);
        const arriba = FACETAS.filter((f) => f.mitad === "arriba");
        const abajo = FACETAS.filter((f) => f.mitad === "abajo");
        expect(arriba).toHaveLength(6);
        expect(abajo).toHaveLength(6);
        const hexes = new Set(FACETAS.map((f) => f.color));
        for (const hex of Object.values(COLORES_FACETAS)) {
            expect(hexes.has(hex)).toBe(true);
        }
        // Cara izquierda la oscura y derecha la clara, en cada mitad.
        expect(arriba[0].color).toBe(COLORES_FACETAS.rojoOscuro);
        expect(arriba[5].color).toBe(COLORES_FACETAS.rojoClaro);
        expect(abajo[0].color).toBe(COLORES_FACETAS.rojoOscuro);
        expect(abajo[5].color).toBe(COLORES_FACETAS.rojoClaro);
        expect(abajo[1].color).toBe(COLORES_FACETAS.amarilloOscuro);
        expect(abajo[4].color).toBe(COLORES_FACETAS.amarilloClaro);
    });

    it("la lente del ojo cae en y = 200 y su ruta recorre el blanco, la pupila y el brillo", () => {
        expect(ESQUINAS.izquierda.y).toBe(200);
        expect(ESQUINAS.derecha.y).toBe(200);
        expect(RUTA_LENS).toContain("130.72 200");
        expect(RUTA_LENS).toContain("269.28 200");
        expect(BLANCO_OJO).toEqual({ cx: 200, cy: 280.8, r: 109.4 });
        expect(PUPILA).toEqual({ cx: 200, cy: 200, r: 40 });
        expect(BRILLO).toEqual({ cx: 213.5, cy: 183.9, r: 10.5 });
    });

    it("cada faceta genera su ruta desde su ápice hasta su tramo de base", () => {
        const f = FACETAS[0];
        const ruta = rutaDeFaceta(f);
        expect(ruta.startsWith("M 200 80 L 130.72 200 L 148.6 200 Z")).toBe(true);
        const abajo = rutaDeFaceta(FACETAS[6]);
        expect(abajo.startsWith("M 200 320 L 130.72 200")).toBe(true);
    });

    it("los discos y el ojo llevan sus colores oficiales", () => {
        expect(DISCO_ARRIBA.colorIzquierda).toBe(COLORES_DISCOS.arribaIzquierda);
        expect(DISCO_ARRIBA.colorDerecha).toBe(COLORES_DISCOS.arribaDerecha);
        expect(DISCO_ABAJO.colorIzquierda).toBe(COLORES_DISCOS.abajoIzquierda);
        expect(DISCO_ABAJO.colorDerecha).toBe(COLORES_DISCOS.abajoDerecha);
        expect(COLORES_OJO.lente).toBe("#DCDCDC");
        expect(COLORES_OJO.pupila).toBe("#272525");
    });
});
