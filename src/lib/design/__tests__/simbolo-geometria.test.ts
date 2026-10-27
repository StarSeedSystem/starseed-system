import { describe, it, expect } from "vitest";
import {
    APICE_ABAJO,
    APICE_ARRIBA,
    CENTRO,
    CIRCULO_ARRIBA,
    CIRCULO_ABAJO,
    COLORES,
    DESPLAZAMIENTOS_BASE,
    DISCOS,
    ESQUINA_DERECHA,
    ESQUINA_IZQUIERDA,
    FACETAS,
    LIENZO,
    OJO,
    rutaFaceta,
    rutaDisco,
    rutaLente,
    rutaRombo,
    rutaTriangulo,
} from "../simbolo-geometria";

/* DAN1024I — geometría del símbolo oficial (referencia-2) */

describe("los círculos y la lente del ojo", () => {
    it("usa el lienzo, el centro y el radio oficiales", () => {
        expect(LIENZO).toBe(400);
        expect(CENTRO).toEqual({ x: 200, y: 200 });
        expect(CIRCULO_ARRIBA).toEqual({ cx: 200, cy: 160, r: 80 });
        expect(CIRCULO_ABAJO).toEqual({ cx: 200, cy: 240, r: 80 });
    });

    it("las esquinas de la lente caen en y = 200, simétricas y sobre los dos círculos", () => {
        expect(ESQUINA_IZQUIERDA.y).toBe(200);
        expect(ESQUINA_DERECHA.y).toBe(200);
        expect(ESQUINA_IZQUIERDA.x + ESQUINA_DERECHA.x).toBeCloseTo(400, 5);
        expect(ESQUINA_IZQUIERDA.x).toBeCloseTo(130.72, 2);
        expect(ESQUINA_DERECHA.x).toBeCloseTo(269.28, 2);
        for (const esquina of [ESQUINA_IZQUIERDA, ESQUINA_DERECHA]) {
            for (const circulo of [CIRCULO_ARRIBA, CIRCULO_ABAJO]) {
                const distancia = Math.hypot(esquina.x - circulo.cx, esquina.y - circulo.cy);
                expect(distancia).toBeCloseTo(80, 2);
            }
        }
    });

    it("la ruta de la lente une las dos esquinas con arcos de radio 80", () => {
        const ruta = rutaLente();
        expect(ruta).toContain("130.72 200");
        expect(ruta).toContain("269.28 200");
        expect(ruta).toContain("A 80 80");
        expect(ruta).not.toMatch(/NaN|undefined/);
    });
});

describe("el rombo de dos triángulos equiláteros", () => {
    it("es equilátero: altura = base · √3 / 2 (± 0,5) para cada lado", () => {
        for (const [apex, lado] of [
            [APICE_ARRIBA, "arriba"],
            [APICE_ABAJO, "abajo"],
        ] as const) {
            const ruta = rutaTriangulo(lado);
            expect(ruta).not.toMatch(/NaN|undefined/);
            const base = ESQUINA_DERECHA.x - ESQUINA_IZQUIERDA.x;
            const altura = Math.abs(lado === "arriba" ? 200 - apex.y : apex.y - 200);
            expect(altura).toBeCloseTo((base * Math.sqrt(3)) / 2, 0.5);
        }
    });

    it("los ápices están a (200, 80) y (200, 320), sobre el eje del centro", () => {
        expect(APICE_ARRIBA).toEqual({ x: 200, y: 80 });
        expect(APICE_ABAJO).toEqual({ x: 200, y: 320 });
    });
});

const HEX_OFICIALES = [
    "#A52D2D", "#CC3737",
    "#38A52D", "#51CC37",
    "#2C2CA8", "#3636CC",
    "#C1BD3A", "#E2D640",
] as const;

describe("las 12 facetas", () => {
    it("hay exactamente 12 facetas, 6 por lado con índices 0..5", () => {
        expect(FACETAS).toHaveLength(12);
        expect(FACETAS.filter((f) => f.lado === "arriba")).toHaveLength(6);
        expect(FACETAS.filter((f) => f.lado === "abajo")).toHaveLength(6);
        for (const lado of ["arriba", "abajo"] as const) {
            const indices = FACETAS.filter((f) => f.lado === lado).map((f) => f.indice);
            expect(indices).toEqual([0, 1, 2, 3, 4, 5]);
        }
    });

    it("cada faceta lleva un hex oficial (oscura a la izquierda, clara a la derecha)", () => {
        const hexes = new Set(FACETAS.flatMap((f) => [f.colorOscuro, f.colorClaro, f.color]));
        for (const hex of hexes) expect(HEX_OFICIALES).toContain(hex);
        expect(hexes).toEqual(new Set<string>(HEX_OFICIALES));
        for (const f of FACETAS) {
            const esIzquierda = f.baseA.x < CENTRO.x || f.baseB.x < CENTRO.x;
            if (esIzquierda) {
                expect(f.color).toBe(f.colorOscuro);
            } else {
                expect(f.color).toBe(f.colorClaro);
            }
        }
    });

    it("los colores se espejan y cada faceta tira del ápice a su par de la base", () => {
        for (const lado of ["arriba", "abajo"] as const) {
            const ladoFacetas = FACETAS.filter((f) => f.lado === lado);
            for (let i = 0; i < 3; i++) {
                expect(ladoFacetas[i].colorOscuro).toBe(ladoFacetas[5 - i].colorOscuro);
            }
        }
        for (const f of FACETAS) {
            expect(f.apex).toEqual(f.lado === "arriba" ? APICE_ARRIBA : APICE_ABAJO);
            expect(f.baseA.y).toBe(200);
            expect(f.baseB.y).toBe(200);
            const esperada = 200 + DESPLAZAMIENTOS_BASE[f.indice];
            expect(f.baseA.x).toBeCloseTo(esperada, 5);
            expect(f.baseB.x).toBeCloseTo(200 + DESPLAZAMIENTOS_BASE[f.indice + 1], 5);
            expect(rutaFaceta(f)).not.toMatch(/NaN|undefined/);
        }
    });

    it("los pares de color arriba y abajo llevan los hex oficiales", () => {
        expect(COLORES.arriba.rojo).toEqual({ oscuro: "#A52D2D", claro: "#CC3737" });
        expect(COLORES.arriba.verde).toEqual({ oscuro: "#38A52D", claro: "#51CC37" });
        expect(COLORES.abajo.amarillo).toEqual({ oscuro: "#C1BD3A", claro: "#E2D640" });
        expect(COLORES.abajo.azul).toEqual({ oscuro: "#2C2CA8", claro: "#3636CC" });
    });
});

describe("discos, ojo y rutas del símbolo", () => {
    it("los discos usan los grises y negros oficiales, mitad a mitad", () => {
        expect(DISCOS).toHaveLength(2);
        expect(DISCOS[0].colorIzquierda).toBe("#CCCCCC");
        expect(DISCOS[0].colorDerecha).toBe("#EAEAEA");
        expect(DISCOS[1].colorIzquierda).toBe("#000000");
        expect(DISCOS[1].colorDerecha).toBe("#3A3A3A");
        for (const disco of DISCOS) {
            expect(rutaDisco(disco.lado, "izquierda")).not.toMatch(/NaN|undefined/);
            expect(rutaDisco(disco.lado, "derecha")).not.toMatch(/NaN|undefined/);
        }
    });

    it("el ojo cae dentro del rombo: pupila en el centro y brillo arriba a la derecha", () => {
        expect(OJO.baseColor).toBe("#DCDCDC");
        expect(OJO.blanco).toEqual({ cx: 200, cy: 280.8, r: 109.4, color: "#FFFFFF" });
        expect(OJO.pupila).toEqual({ cx: 200, cy: 200, r: 40, color: "#272525" });
        expect(OJO.brillo).toEqual({ cx: 213.5, cy: 183.9, r: 10.5, color: "#FFFFFF" });
        const centroBrillo = Math.hypot(OJO.brillo.cx - OJO.pupila.cx, OJO.brillo.cy - OJO.pupila.cy);
        expect(centroBrillo).toBeLessThan(OJO.pupila.r);
    });

    it("el rombo y sus vértices usan el lienzo sin salirse", () => {
        expect(rutaRombo()).not.toMatch(/NaN|undefined/);
        for (const vertice of [APICE_ARRIBA, APICE_ABAJO, ESQUINA_IZQUIERDA, ESQUINA_DERECHA]) {
            expect(vertice.x).toBeGreaterThanOrEqual(0);
            expect(vertice.x).toBeLessThanOrEqual(LIENZO);
            expect(vertice.y).toBeGreaterThanOrEqual(0);
            expect(vertice.y).toBeLessThanOrEqual(LIENZO);
        }
    });
});
