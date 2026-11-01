import { describe, expect, it, vi } from "vitest";
import { opacidadVineta, CONFORT_DEFECTO, aplicarMovimientoReducido, siguienteGiro, ANGULOS_SALTO } from "@/lib/xr/confort";
import type { PreferenciasConfort } from "@/lib/xr/confort";

describe("opacidadVineta", () => {
    const auto = { ...CONFORT_DEFECTO, vineta: "auto" as const };
    
    it("quieto o con giros lentos no hay viñeta", () => {
        expect(opacidadVineta(auto, { lineal: 0, angularGradosS: 0 })).toBe(0);
        expect(opacidadVineta(auto, { lineal: 0.3, angularGradosS: 15 })).toBe(0);
    });
    
    it("crece con la velocidad y nunca pasa de 0,85", () => {
        const a = opacidadVineta(auto, { lineal: 1.5, angularGradosS: 0 });
        const b = opacidadVineta(auto, { lineal: 3, angularGradosS: 200 });
        expect(a).toBeGreaterThan(0);
        expect(b).toBeGreaterThan(a);
        expect(opacidadVineta({ ...auto, fuerzaVineta: 1 }, { lineal: 9, angularGradosS: 900 })).toBeLessThanOrEqual(0.85);
    });
    
    it("«nunca» la apaga, «siempre» deja un mínimo aunque estés quieto, y el movimiento reducido obliga", () => {
        expect(opacidadVineta({ ...auto, vineta: "nunca" }, { lineal: 3, angularGradosS: 200 })).toBe(0);
        expect(opacidadVineta({ ...auto, vineta: "siempre" }, { lineal: 0, angularGradosS: 0 })).toBeGreaterThan(0);
        expect(opacidadVineta({ ...auto, vineta: "nunca", movimientoReducido: true }, { lineal: 0, angularGradosS: 0 })).toBeGreaterThan(0);
    });
});

describe("aplicarMovimientoReducido", () => {
    it("no toca nada cuando está apagado", () => {
        expect(aplicarMovimientoReducido(CONFORT_DEFECTO)).toBe(CONFORT_DEFECTO);
    });
    
    it("fuerza saltos, teletransporte y viñeta cuando está activo", () => {
        const c: PreferenciasConfort = { ...CONFORT_DEFECTO, giro: "continuo", locomocion: "continua", fuerzaVineta: 0.5, vineta: "nunca", movimientoReducido: true };
        const r = aplicarMovimientoReducido(c);
        expect(r.giro).toBe("saltos");
        expect(r.locomocion).toBe("teletransporte");
        expect(r.vineta).toBe("siempre");
        expect(r.fuerzaVineta).toBeGreaterThanOrEqual(0.6);
    });
    
    it("no cambia locomocion si ya era ninguna", () => {
        const c: PreferenciasConfort = { ...CONFORT_DEFECTO, locomocion: "ninguna" };
        const r = aplicarMovimientoReducido({ ...c, movimientoReducido: true });
        expect(r.locomocion).toBe("ninguna");
    });
});

describe("siguienteGiro", () => {
    it("ocho saltos de 45° dan la vuelta completa", () => {
        let y = 0;
        for (let i = 0; i < 8; i++) y = siguienteGiro(y, 1, { ...CONFORT_DEFECTO, anguloSalto: 45 });
        expect(y).toBeCloseTo(2 * Math.PI, 6);
    });
    
    it("avanza exactamente un salto y queda alineado a la rejilla", () => {
        const c = { ...CONFORT_DEFECTO, anguloSalto: 45 as const };
        const paso = Math.PI / 4;
        expect(siguienteGiro(0, 1, c)).toBeCloseTo(paso, 6);
        expect(siguienteGiro(0, -1, c)).toBeCloseTo(-paso, 6);
        expect(siguienteGiro(paso * 0.3, 1, c)).toBeCloseTo(paso, 6);
        expect(siguienteGiro(paso * 0.3, -1, c)).toBeCloseTo(0, 6);
    });
    
    it("todos los ángulos admitidos dividen la vuelta en un número entero de saltos", () => {
        for (const a of ANGULOS_SALTO) expect(360 % a).toBe(0);
    });
    
    it("gira a la izquierda (-1) y a la derecha (+1)", () => {
        const c = { ...CONFORT_DEFECTO, anguloSalto: 30 };
        const izquierda = siguienteGiro(0, -1, c);
        const derecha = siguienteGiro(0, 1, c);
        expect(izquierda).toBeCloseTo(-Math.PI / 6, 6);
        expect(derecha).toBeCloseTo(Math.PI / 6, 6);
    });
});

describe("velocidad de giro", () => {
    it("sube con velocidad angular y lineal", () => {
        const auto: PreferenciasConfort = { ...CONFORT_DEFECTO, fuerzaVineta: 1 };
        const v1 = { lineal: 1, angularGradosS: 10 };
        const v2 = { lineal: 2, angularGradosS: 20 };
        const op1 = opacidadVineta(auto, v1);
        const op2 = opacidadVineta(auto, v2);
        expect(op2).toBeGreaterThan(op1);
    });
    
    it("el ritmo está en 0, no hay viñeta con velocidad muy baja", () => {
        const c: PreferenciasConfort = { ...CONFORT_DEFECTO, fuerzaVineta: 1 };
        expect(opacidadVineta(c, { lineal: 0.1, angularGradosS: 1 })).toBe(0);
    });
});