/**
 * Comodidad · viñeta, giro por saltos, subtítulos, una mano y movimiento reducido.
 */
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { aplicarMovimientoReducido, opacidadVineta, siguienteGiro, CONFORT_DEFECTO } from "../../../../lib/xr/confort";
import {
  calcularMovimiento,
  calcularMovimientoAngular,
  girarPorSaltos,
  avisoLocomocionContinuaMovimientoReducido,
} from "../comodidad";

describe("Comodidad · funciones puras extraídas", () => {
  it("la viñeta sube con la velocidad y nunca pasa de 0,85", () => {
    const c = { ...CONFORT_DEFECTO, vineta: "auto" as const, fuerzaVineta: 0.6 };
    const baja = opacidadVineta(c, { lineal: 0.1, angularGradosS: 10 });
    const alta = opacidadVineta(c, { lineal: 5, angularGradosS: 200 });
    expect(alta).toBeGreaterThan(baja);
    expect(alta).toBeLessThanOrEqual(0.85);
  });

  it("con `nunca` es 0 salvo movimiento reducido", () => {
    const c = { ...CONFORT_DEFECTO, vineta: "nunca" as const, movimientoReducido: false };
    expect(opacidadVineta(c, { lineal: 10, angularGradosS: 300 })).toBe(0);
    const cr = { ...CONFORT_DEFECTO, vineta: "nunca" as const, movimientoReducido: true };
    const o = opacidadVineta(cr, { lineal: 10, angularGradosS: 300 });
    expect(o).toBeGreaterThan(0);
  });

  it("ocho saltos de 45° dan la vuelta", () => {
    const c = { ...CONFORT_DEFECTO, giro: "saltos" as const, anguloSalto: 45 as const };
    let yaw = 0;
    for (let i = 0; i < 8; i++) {
      yaw = siguienteGiro(yaw, 1, c);
    }
    expect(Math.abs(yaw - 2 * Math.PI)).toBeLessThan(1e-6);
  });

  it("girarPorSaltos usa siguienteGiro con el ángulo configurado", () => {
    const c = { ...CONFORT_DEFECTO, giro: "saltos" as const, anguloSalto: 30 as const };
    const res = girarPorSaltos(0, 1, c);
    expect(res).toBeCloseTo((30 * Math.PI) / 180);
  });

  it("movimiento reducido fuerza saltos", () => {
    const c = { ...CONFORT_DEFECTO, giro: "continuo" as const, locomocion: "continua" as const, movimientoReducido: true };
    const r = aplicarMovimientoReducido(c);
    expect(r.giro).toBe("saltos");
    expect(r.locomocion).not.toBe("continua");
  });

  it("aviso cuando locomoción continua con movimiento reducido", () => {
    const aviso = avisoLocomocionContinuaMovimientoReducido();
    expect(aviso).toMatch(/movimiento reducido/);
  });

  it("calculaMovimiento devuelve lineal", () => {
    const actual = { x: 1, y: 0, z: 0 } as any;
    const previo = { x: 0, y: 0, z: 0, distanceTo: (v: any) => Math.sqrt((1-v.x)**2) } as any;
    const m = calcularMovimiento(actual, { x: 0, y: 0, z: 0 } as any, 1);
    expect(m.lineal).toBe(1);
  });

  it("calcularMovimientoAngular da grados/s", () => {
    const ang = calcularMovimientoAngular(Math.PI / 2, 0, 1);
    expect(ang).toBeCloseTo(90);
  });
});
