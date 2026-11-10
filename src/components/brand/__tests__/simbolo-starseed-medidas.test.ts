// ESC1110A — Las medidas del símbolo conservan las proporciones del arte original.
import { describe, expect, it } from "vitest";
import { CIRCULOS, DIAMANTE, FACETAS, OJO, PROPORCION, REFERENCIA, pxAModelo } from "../simbolo-starseed-medidas";
import { decidirModoSimbolo, esAparatoDebil } from "../simbolo-starseed-modo";

describe("medidas del símbolo StarSeed", () => {
    it("la caja es la del PNG oficial (1000 × 1497, ≈ 2:3)", () => {
        expect(REFERENCIA).toEqual({ ancho: 1000, alto: 1497 });
        expect(PROPORCION).toBeCloseTo(1.497, 3);
    });

    it("los dos círculos son iguales, tocan los bordes y su separación forma la vesica", () => {
        const { superior: s, inferior: i } = CIRCULOS;
        expect(s.r).toBe(i.r);
        expect(s.cy - s.r).toBe(0); // arriba del todo
        expect(i.cy + i.r).toBe(REFERENCIA.alto); // abajo del todo
        expect(s.cx - s.r).toBe(0);
        expect(s.cx + s.r).toBe(REFERENCIA.ancho);
        const d = i.cy - s.cy;
        expect(d).toBeGreaterThan(0);
        expect(d).toBeLessThan(2 * s.r); // se solapan: hay almendra
    });

    it("el diamante va del tope del círculo superior al pie del inferior y sus lados caen en las esquinas del ojo", () => {
        expect(DIAMANTE.arriba).toEqual({ x: 500, y: 0 });
        expect(DIAMANTE.abajo).toEqual({ x: 500, y: 1497 });
        // Esquina de la almendra: intersección de los dos círculos.
        const mitad = (CIRCULOS.inferior.cy - CIRCULOS.superior.cy) / 2;
        const esquina = Math.sqrt(CIRCULOS.superior.r ** 2 - mitad ** 2);
        const c = DIAMANTE.cinturaPx;
        expect(c).toHaveLength(7); // seis facetas por mitad
        expect(Math.abs(500 - c[0] - esquina)).toBeLessThan(2);
        expect(Math.abs(c[6] - 500 - esquina)).toBeLessThan(2);
        // Simetría respecto al eje vertical.
        for (let k = 0; k < 7; k++) expect(c[k] + c[6 - k]).toBe(1000);
        expect(c[3]).toBe(500);
        expect(FACETAS).toHaveLength(6);
    });

    it("el iris y el brillo quedan dentro del ojo y en su sitio", () => {
        expect(OJO.iris.cx).toBe(500);
        expect(OJO.iris.cy).toBe(748.5);
        expect(OJO.iris.r / 1000).toBeCloseTo(0.252, 3);
        const dist = Math.hypot(OJO.brillo.cx - OJO.iris.cx, OJO.brillo.cy - OJO.iris.cy);
        expect(dist + OJO.brillo.r).toBeLessThan(OJO.iris.r); // el brillo no se sale del iris
        expect(OJO.brillo.cx).toBeGreaterThan(OJO.iris.cx); // arriba a la derecha
        expect(OJO.brillo.cy).toBeLessThan(OJO.iris.cy);
    });

    it("los colores son los muestreados del símbolo (adn-y-tokens §2)", () => {
        const hex = /^#[0-9A-F]{6}$/;
        for (const f of FACETAS) {
            expect(f.arriba).toMatch(hex);
            expect(f.abajo).toMatch(hex);
        }
        expect(FACETAS.map((f) => f.arriba)).toEqual(["#A52D2D", "#CC3737", "#38A52D", "#51CC37", "#2C2CA8", "#3636CC"]);
        expect(FACETAS.map((f) => f.abajo)).toEqual(["#A52D2D", "#CC3737", "#C1BD3A", "#E2D640", "#2C2CA8", "#3636CC"]);
        expect(OJO.iris.color).toBe("#272525");
    });

    it("convierte píxeles a unidades del modelo con el ojo en el origen", () => {
        expect(pxAModelo(500, 748.5)).toEqual([0, 0]);
        const [x, y] = pxAModelo(500, 0);
        expect(x).toBe(0);
        expect(y).toBeCloseTo(0.7485, 6);
    });
});

describe("modo del símbolo 3D", () => {
    it("sin WebGL o en jsdom se queda la imagen fija", () => {
        expect(decidirModoSimbolo({ webgl: false, movimientoReducido: false })).toBe("fijo");
        expect(decidirModoSimbolo({ webgl: true, movimientoReducido: false, agente: "Mozilla/5.0 jsdom/25" })).toBe("fijo");
    });

    it("con movimiento reducido: fijo en aparato débil, quieto en uno capaz", () => {
        expect(decidirModoSimbolo({ webgl: true, movimientoReducido: true, nucleos: 4 })).toBe("fijo");
        expect(decidirModoSimbolo({ webgl: true, movimientoReducido: true, memoriaGb: 2 })).toBe("fijo");
        expect(decidirModoSimbolo({ webgl: true, movimientoReducido: true, nucleos: 8, memoriaGb: 8 })).toBe("quieto");
    });

    it("en un aparato con WebGL y sin preferencia, va en vivo", () => {
        expect(decidirModoSimbolo({ webgl: true, movimientoReducido: false, nucleos: 2 })).toBe("vivo");
        expect(esAparatoDebil({ nucleos: 8 })).toBe(false);
        expect(esAparatoDebil({})).toBe(false);
    });
});
