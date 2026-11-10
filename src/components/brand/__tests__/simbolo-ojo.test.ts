// ESC1110B — El ojo: hacia dónde mira (con límites), vuelta al frente y la máquina del parpadeo.
import { describe, expect, it } from "vitest";
import {
    LIMITES_OJO, PARPADEO, REPOSO_MIRADA_MS, angulosMirada, avanzarParpadeo, esClic, estadoParpadeoInicial,
    objetivoConReposo, objetivoMirada, pedirParpadeo, seguirMirada,
} from "../simbolo-ojo";

describe("mirada", () => {
    it("mira hacia el puntero: derecha, izquierda, arriba (y del DOM hacia abajo)", () => {
        expect(objetivoMirada(300, 0, 200).x).toBeGreaterThan(0.8);
        expect(objetivoMirada(-300, 0, 200).x).toBeLessThan(-0.8);
        expect(objetivoMirada(0, -300, 200).y).toBeGreaterThan(0.8);
        expect(objetivoMirada(0, 300, 200).y).toBeLessThan(-0.8);
    });

    it("una esquina lejana satura dentro de la elipse unidad; cerca del ojo, fino", () => {
        const lejos = objetivoMirada(-5000, -4000, 200);
        expect(Math.hypot(lejos.x, lejos.y)).toBeLessThanOrEqual(1 + 1e-12);
        expect(lejos.x).toBeLessThan(0);
        expect(lejos.y).toBeGreaterThan(0);
        const cerca = objetivoMirada(10, 0, 200);
        expect(cerca.x).toBeGreaterThan(0);
        expect(cerca.x).toBeLessThan(0.1);
        expect(objetivoMirada(0, 0, 200)).toEqual({ x: 0, y: 0 });
        expect(objetivoMirada(Number.NaN, 0, 200)).toEqual({ x: 0, y: 0 });
    });

    it("los ángulos nunca pasan de los límites naturales", () => {
        const a = angulosMirada({ x: 5, y: -5 });
        expect(a.guinada).toBeCloseTo(LIMITES_OJO.guinada, 12);
        expect(a.cabeceo).toBeCloseTo(-LIMITES_OJO.cabeceo, 12);
        expect(LIMITES_OJO.guinada).toBeLessThanOrEqual((15 * Math.PI) / 180);
    });

    it("suaviza (sin saltos) y vuelve al frente tras un rato sin entrada", () => {
        const m = seguirMirada({ x: 0, y: 0 }, { x: 1, y: 0 }, 1 / 60);
        expect(m.x).toBeGreaterThan(0);
        expect(m.x).toBeLessThan(0.2);
        expect(objetivoConReposo({ x: 1, y: 1 }, REPOSO_MIRADA_MS - 1)).toEqual({ x: 1, y: 1 });
        expect(objetivoConReposo({ x: 1, y: 1 }, REPOSO_MIRADA_MS + 1)).toEqual({ x: 0, y: 0 });
    });
});

describe("parpadeo", () => {
    it("dura 150–220 ms: cierra del todo y vuelve a abrir", () => {
        const total = PARPADEO.cierreMs + PARPADEO.aperturaMs;
        expect(total).toBeGreaterThanOrEqual(150);
        expect(total).toBeLessThanOrEqual(220);
        let e = pedirParpadeo(estadoParpadeoInicial(0, false), 1000);
        expect(avanzarParpadeo(e, 1000).cierre).toBe(0);
        const medio = avanzarParpadeo(e, 1000 + PARPADEO.cierreMs);
        expect(medio.cierre).toBeCloseTo(1, 6);
        expect(avanzarParpadeo(e, 1000 + PARPADEO.cierreMs / 2).cierre).toBeGreaterThan(0.2);
        const fin = avanzarParpadeo(e, 1000 + total + 1);
        expect(fin.cierre).toBe(0);
        e = fin.estado;
        expect(e.inicio).toBeNull();
    });

    it("un segundo clic a mitad de parpadeo no lo reinicia (sin tartamudeo)", () => {
        const e = pedirParpadeo(estadoParpadeoInicial(0, false), 1000);
        expect(pedirParpadeo(e, 1050)).toBe(e);
        expect(pedirParpadeo(e, 1000 + PARPADEO.cierreMs + PARPADEO.aperturaMs + 5).inicio).not.toBe(1000);
    });

    it("el parpadeo ocioso llega solo entre 5 y 10 s, y se reprograma", () => {
        const e = estadoParpadeoInicial(0, true, () => 0.5);
        expect(e.proximoOcioso).toBe(7500);
        expect(avanzarParpadeo(e, 7000, () => 0.5).cierre).toBe(0);
        const r = avanzarParpadeo(e, 7500, () => 0.5);
        expect(r.estado.inicio).toBe(7500);
        expect(r.estado.proximoOcioso).toBe(15000);
        expect(estadoParpadeoInicial(0, false).proximoOcioso).toBeNull();
    });

    it("solo un clic (no un arrastre) parpadea", () => {
        expect(esClic(2, 3)).toBe(true);
        expect(esClic(12, 0)).toBe(false);
    });
});
