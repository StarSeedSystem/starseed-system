/**
 * Vineta · contrato opacidad y tope 0,85.
 */
import { describe, expect, it } from "vitest";
import { opacidadVineta } from "../../../../lib/xr/confort";
import { CONFORT_DEFECTO } from "../../../../lib/xr/confort";

describe("Vineta · opacidadVineta", () => {
  it("nunca pasa de 0,85", () => {
    const c = { ...CONFORT_DEFECTO, vineta: "auto" as const, fuerzaVineta: 1 };
    const o = opacidadVineta(c, { lineal: 100, angularGradosS: 10000 });
    expect(o).toBeLessThanOrEqual(0.85);
  });

  it("siempre con movimiento reducido sube", () => {
    const c = { ...CONFORT_DEFECTO, vineta: "siempre" as const, fuerzaVineta: 0.6, movimientoReducido: true };
    const o = opacidadVineta(c, { lineal: 0, angularGradosS: 0 });
    expect(o).toBeGreaterThan(0);
  });

  it("nunca sin movimiento reducido da 0", () => {
    const c = { ...CONFORT_DEFECTO, vineta: "nunca" as const, movimientoReducido: false };
    expect(opacidadVineta(c, { lineal: 0, angularGradosS: 0 })).toBe(0);
  });
});
