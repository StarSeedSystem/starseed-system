import { describe, it, expect } from "vitest";
import {
    ANGULOS_RAYOS,
    APICE_ABAJO,
    APICE_ARRIBA,
    BASE_RAYOS,
    COLORES,
    CENTRO,
    DISCOS,
    ESQUINA_DERECHA,
    ESQUINA_IZQUIERDA,
    FACETAS,
    OJO,
    puntosARuta,
    rutaLente,
    rutaMitadDisco,
    rayosDe,
} from "../simbolo-geometria";

describe("simbolo-geometria", () => {
    describe("discos y esquinas", () => {
        it("los dos discos miden r=80 con centros (200,160) y (200,240)", () => {
            const centros = DISCOS.map((d) => ({ cx: d.cx, cy: d.cy, r: d.r }));
            expect(centros).toEqual([
                { cx: 200, cy: 160, r: 80 },
                { cx: 200, cy: 240, r: 80 },
            ]);
        });

        it("las esquinas quedan a ±69,28 del centro, en y = 200", () => {
            expect(ESQUINA_IZQUIERDA.y).toBe(200);
            expect(ESQUINA_DERECHA.y).toBe(200);
            expect(Math.abs(CENTRO.x - 69.28 - ESQUINA_IZQUIERDA.x)).toBeLessThan(0.01);
            expect(Math.abs(ESQUINA_DERECHA.x - 69.28 - CENTRO.x)).toBeLessThan(0.01);
        });
    });

    describe("rombo de dos triángulos equiláteros", () => {
        it("aplica altura = base·√3/2 (±0,5)", () => {
            const base = ESQUINA_DERECHA.x - ESQUINA_IZQUIERDA.x;
            const altura = CENTRO.y - APICE_ARRIBA.y;
            expect(altura).toBe(120); // cada triángulo mide 120 de alto
            expect(Math.abs(altura - (base * Math.sqrt(3)) / 2)).toBeLessThan(0.5);
        });

        it("los ápices son (200,80) y (200,320)", () => {
            expect([APICE_ARRIBA.x, APICE_ARRIBA.y, APICE_ABAJO.x, APICE_ABAJO.y]).toEqual([
                200, 80, 200, 320,
            ]);
        });
    });

    describe("rayos de las facetas", () => {
        it("los 7 rayos van de un ápice a los x de base oficiales en y = 200", () => {
            for (const apice of [APICE_ARRIBA, APICE_ABAJO]) {
                const rayos = rayosDe(apice);
                expect(rayos).toHaveLength(7);
                rayos.forEach((r, i) => {
                    expect(r.desde).toEqual(apice);
                    expect(r.hasta.y).toBe(200);
                    expect(r.hasta.x).toBe(200 + BASE_RAYOS[i]);
                    expect(r.anguloGrados).toBe(ANGULOS_RAYOS[i]);
                });
            }
        });

        it("los desplazamientos de base responden a 120·tan(ángulo) (±0,1)", () => {
            BASE_RAYOS.forEach((x, i) => {
                const esperado = 120 * Math.tan((ANGULOS_RAYOS[i] * Math.PI) / 180);
                expect(Math.abs(x - esperado)).toBeLessThan(0.1);
            });
        });
    });

    describe("las 12 facetas", () => {
        it("hay 6 de arriba y 6 de abajo", () => {
            expect(FACETAS).toHaveLength(12);
            expect(FACETAS.filter((f) => f.lado === "arriba")).toHaveLength(6);
            expect(FACETAS.filter((f) => f.lado === "abajo")).toHaveLength(6);
        });

        it("arriba lleva rojo, verde y azul; abajo rojo, amarillo y azul", () => {
            const nombres = (lado: string) =>
                FACETAS.filter((f) => f.lado === lado).map((f) => f.color);
            expect(nombres("arriba")).toEqual(["rojo", "verde", "azul", "azul", "verde", "rojo"]);
            expect(nombres("abajo")).toEqual([
                "rojo",
                "amarillo",
                "azul",
                "azul",
                "amarillo",
                "rojo",
            ]);
        });

        it("cada faceta usa sus hex oficiales: izquierda la oscura, derecha la clara", () => {
            for (const f of FACETAS) {
                const c = COLORES[f.color];
                expect(f.colorIzquierda).toBe(c.oscuro);
                expect(f.colorDerecha).toBe(c.claro);
            }
        });

        it("los hex del símbolo son los oficiales de la referencia-2", () => {
            const hexes = Object.values(COLORES).flatMap((c) => [c.oscuro, c.claro]);
            for (const hex of [
                "#A52D2D", "#CC3737", "#38A52D", "#51CC37",
                "#2C2CA8", "#3636CC", "#C1BD3A", "#E2D640",
            ]) {
                expect(hexes).toContain(hex);
            }
            // El azul abajo es el mismo azul oficial que arriba.
            const abajo = FACETAS.filter((f) => f.lado === "abajo" && f.color === "azul")[0];
            expect(abajo.colorIzquierda).toBe("#2C2CA8");
        });
    });

    describe("el ojo y las rutas SVG", () => {
        it("la lente cae en y = 200: sus esquinas y sus arcos lo respetan", () => {
            const ruta = rutaLente();
            expect(ruta.startsWith(`M 130.72 200`)).toBe(true);
            expect(ruta).toContain(`A 80 80 0 0 1 269.28 200`);
            expect(ruta.endsWith("Z")).toBe(true);
        });

        it("los discos parten de sus mitades: oscura izquierda y clara derecha", () => {
            const [arriba, abajo] = DISCOS;
            expect(rutaMitadDisco(arriba, "izquierda")).toContain("A 80 80 0 0 0");
            expect(rutaMitadDisco(arriba, "izquierda")).toBe(`M ${arriba.cx} ${arriba.cy - arriba.r} A 80 80 0 0 0 ${arriba.cx} ${arriba.cy + arriba.r} Z`);
            expect(abajo.izquierda).toBe("#000000");
            expect(abajo.derecha).toBe("#3A3A3A");
            expect(arriba.izquierda).toBe("#CCCCCC");
            expect(arriba.derecha).toBe("#EAEAEA");
        });

        it("la pupila es #272525 r=40, el brillo blanco r=10,5 en (213,5; 183,9)", () => {
            expect(OJO.pupila.color).toBe("#272525");
            expect(OJO.pupila.r).toBe(40);
            expect(Math.abs(OJO.brillo.centro.x - 213.5)).toBeLessThan(0.01);
            expect(Math.abs(OJO.brillo.centro.y - 183.9)).toBeLessThan(0.01);
            expect(OJO.brillo.r).toBe(10.5);
        });

        it("puntosARuta escribe M/L y cierra con Z", () => {
            expect(puntosARuta([{ x: 1, y: 2 }, { x: 3, y: 4 }])).toBe("M 1 2 L 3 4 Z");
        });
    });
});
