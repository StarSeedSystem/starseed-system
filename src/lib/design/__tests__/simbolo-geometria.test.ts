import { describe, it, expect } from "vitest";
import {
    ANGULOS_RAYOS,
    APEXES,
    ESQUINAS_LENS,
    OJO,
    facetas,
    rutaLente,
} from "../simbolo-geometria";

const HEXES_OFICIALES = [
    "#A52D2D",
    "#CC3737",
    "#38A52D",
    "#51CC37",
    "#2C2CA8",
    "#3636CC",
    "#C1BD3A",
    "#E2D640",
];

describe("geometría del símbolo StarSeed", () => {
    it("el rombo es equilátero: altura = base · √3 / 2 ± 0,5 en cada mitad", () => {
        const base = ESQUINAS_LENS[1].x - ESQUINAS_LENS[0].x;
        const alturaArriba = ESQUINAS_LENS[0].y - APEXES.arriba.y;
        const alturaAbajo = APEXES.abajo.y - ESQUINAS_LENS[1].y;
        const ideal = (base * Math.sqrt(3)) / 2;
        expect(Math.abs(alturaArriba - ideal)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(alturaAbajo - ideal)).toBeLessThanOrEqual(0.5);
    });

    it("la lente del ojo cae en y = 200 en sus dos esquinas", () => {
        expect(ESQUINAS_LENS[0].y).toBe(200);
        expect(ESQUINAS_LENS[1].y).toBe(200);
        expect(rutaLente()).toContain("A 80 80 0 0 1 269.28 200");
    });

    it("hay 12 facetas, 6 por lado, con oscura a la izquierda y clara a la derecha", () => {
        const piezas = facetas();
        expect(piezas).toHaveLength(12);
        expect(piezas.filter((f) => f.lado === "arriba")).toHaveLength(6);
        expect(piezas.filter((f) => f.lado === "abajo")).toHaveLength(6);
        for (const f of piezas) {
            const xs = f.camino
                .split(" L ")
                .slice(1)
                .map((s) => Number(s.split(" ")[0].replace(" Z", "")));
            const centroBanda = (xs[0] + xs[1]) / 2;
            expect(centroBanda < 200).toBe(f.variante === "oscura");
        }
    });

    it("las facetas llevan exactamente los hex oficiales del diseño", () => {
        const hexes = new Set(facetas().map((f) => f.hex));
        for (const hex of HEXES_OFICIALES) expect(hexes.has(hex)).toBe(true);
        expect(hexes.size).toBe(HEXES_OFICIALES.length);
    });

    it("los rayos parten de cada ápice a 0°, ±13,86°, ±23,2° y ±30°", () => {
        expect([...ANGULOS_RAYOS].sort((a, b) => a - b)).toEqual([
            -30, -23.2, -13.86, 0, 13.86, 23.2, 30,
        ]);
        expect(facetas().filter((f) => f.lado === "arriba")).toHaveLength(ANGULOS_RAYOS.length - 1);
    });

    it("el ojo declara sus colores y geometrías oficiales", () => {
        expect(OJO.parpado).toBe("#DCDCDC");
        expect(OJO.pupila.hex).toBe("#272525");
        expect(OJO.pupila.radio).toBe(40);
        expect(OJO.brillo.radio).toBe(10.5);
        expect(OJO.blanco.centro).toEqual({ x: 200, y: 280.8 });
        expect(OJO.blanco.radio).toBe(109.4);
    });
});
