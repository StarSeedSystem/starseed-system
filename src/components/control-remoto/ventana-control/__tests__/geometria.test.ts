import { describe, expect, it } from "vitest";
import { ajustar, aCuadro, deltaACuadro, puntoEnPantalla, tamanoGirado } from "../geometria";
import { MAX_TEXTO, trocear } from "../texto";

const CAJA = { left: 100, top: 50, width: 800, height: 400 };

describe("VEN1115L · geometría", () => {
    it("el tamaño girado intercambia ancho y alto a 90 y 270", () => {
        expect(tamanoGirado(1200, 2000, 0)).toEqual({ w: 1200, h: 2000 });
        expect(tamanoGirado(1200, 2000, 90)).toEqual({ w: 2000, h: 1200 });
        expect(tamanoGirado(1200, 2000, 180)).toEqual({ w: 1200, h: 2000 });
        expect(tamanoGirado(1200, 2000, 270)).toEqual({ w: 2000, h: 1200 });
    });

    it("la imagen se centra con bandas negras (vertical en caja ancha)", () => {
        const im = ajustar(CAJA, 1200, 2000);
        expect(im.height).toBeCloseTo(400);
        expect(im.width).toBeCloseTo(240);
        expect(im.left).toBeCloseTo(100 + (800 - 240) / 2);
        expect(im.top).toBeCloseTo(50);
    });

    it("las cuatro esquinas del cuadro tras cada giro", () => {
        // esquina superior izquierda del cuadro sin girar: (0,0); gira en sentido horario
        expect(aCuadro(0, 0, 0)).toEqual([0, 0]);
        expect(aCuadro(1, 0, 90)).toEqual([0, 0]); // arriba-izquierda del cuadro acaba arriba-derecha
        expect(aCuadro(1, 1, 180)).toEqual([0, 0]);
        expect(aCuadro(0, 1, 270)).toEqual([0, 0]);
        expect(aCuadro(0.25, 0.75, 90)).toEqual([0.75, 0.75]);
        expect(aCuadro(0.25, 0.75, 270)).toEqual([0.25, 0.25]);
    });

    it.each([0, 90, 180, 270] as const)("el punto central y una esquina con giro %i y bandas negras", (giro) => {
        const g = tamanoGirado(1000, 2000, giro);
        const im = ajustar(CAJA, g.w, g.h);
        const c = puntoEnPantalla(im.left + im.width / 2, im.top + im.height / 2, im, giro);
        expect(c.x).toBeCloseTo(0.5);
        expect(c.y).toBeCloseTo(0.5);
        expect(c.fuera).toBe(false);
        // esquina superior izquierda de lo que se ve
        const e = puntoEnPantalla(im.left + 1e-9, im.top + 1e-9, im, giro);
        const [ex, ey] = aCuadro(0, 0, giro);
        expect(e.x).toBeCloseTo(ex);
        expect(e.y).toBeCloseTo(ey);
    });

    it("un toque a un cuarto de ancho y tres cuartos de alto, en cada giro", () => {
        const im = { left: 0, top: 0, width: 400, height: 800 };
        const px = [100, 600] as const;
        expect(puntoEnPantalla(px[0], px[1], im, 0)).toMatchObject({ x: 0.25, y: 0.75, fuera: false });
        expect(puntoEnPantalla(px[0], px[1], im, 90)).toMatchObject({ x: 0.75, y: 0.75, fuera: false });
        expect(puntoEnPantalla(px[0], px[1], im, 180)).toMatchObject({ x: 0.75, y: 0.25, fuera: false });
        expect(puntoEnPantalla(px[0], px[1], im, 270)).toMatchObject({ x: 0.25, y: 0.25, fuera: false });
    });

    it("fuera de la imagen (bandas negras o fuera de la caja) se acota y se marca", () => {
        const im = ajustar(CAJA, 1200, 2000);
        const izq = puntoEnPantalla(CAJA.left + 5, CAJA.top + 200, im, 0);
        expect(izq).toMatchObject({ x: 0, fuera: true });
        const lejos = puntoEnPantalla(5000, -300, im, 0);
        expect(lejos).toEqual({ x: 1, y: 0, fuera: true });
        const giradoFuera = puntoEnPantalla(5000, -300, im, 90);
        expect(giradoFuera.fuera).toBe(true);
        expect(giradoFuera.x).toBeGreaterThanOrEqual(0);
        expect(giradoFuera.x).toBeLessThanOrEqual(1);
    });

    it("una imagen sin tamaño no da puntos válidos", () => {
        expect(puntoEnPantalla(1, 1, { left: 0, top: 0, width: 0, height: 0 }, 0).fuera).toBe(true);
        expect(ajustar(CAJA, 0, 10).width).toBe(0);
    });

    it("el desplazamiento sigue el mismo giro que los puntos", () => {
        expect(deltaACuadro(0.1, 0.2, 0)).toEqual([0.1, 0.2]);
        expect(deltaACuadro(0.1, 0.2, 90)).toEqual([0.2, -0.1]);
        expect(deltaACuadro(0.1, 0.2, 180)).toEqual([-0.1, -0.2]);
        expect(deltaACuadro(0.1, 0.2, 270)).toEqual([-0.2, 0.1]);
    });
});

describe("VEN1115L · texto en trozos", () => {
    it("trozos de como mucho 512 que al juntarse dan el texto", () => {
        const t = "a".repeat(1300);
        const r = trocear(t);
        expect(r.map((x) => x.length)).toEqual([512, 512, 276]);
        expect(r.join("")).toBe(t);
        expect(trocear("")).toEqual([]);
        expect(trocear("hola")).toEqual(["hola"]);
        expect(trocear("a".repeat(MAX_TEXTO))).toHaveLength(1);
    });
    it("no parte un carácter de dos unidades", () => {
        const t = "a".repeat(511) + "😀" + "b";
        const r = trocear(t);
        expect(r[0]).toBe("a".repeat(511));
        expect(r[1]).toBe("😀b");
        expect(r.join("")).toBe(t);
        expect(r.every((x) => x.length <= 512)).toBe(true);
    });
});
