import { describe, expect, it } from "vitest";
import { penalizacionPorPresupuesto } from "../../ai/astraura/presupuesto";

describe("penalizacionPorPresupuesto (Ola 223 I1F)", () => {
  it("91% remota → descartar", () => {
    expect(penalizacionPorPresupuesto(91, false)).toEqual({ descartar: true, penalizacion: 0 });
  });
  it("100% local → no descartar y penalización 0", () => {
    expect(penalizacionPorPresupuesto(100, true)).toEqual({ descartar: false, penalizacion: 0 });
  });
  it("85% remota → penalización > 0 y < 20 sin descartar", () => {
    const r = penalizacionPorPresupuesto(85, false);
    expect(r.descartar).toBe(false);
    expect(r.penalizacion).toBeGreaterThan(0);
    expect(r.penalizacion).toBeLessThan(20);
  });
  it("undefined → sin efecto", () => {
    expect(penalizacionPorPresupuesto(undefined, false)).toEqual({ descartar: false, penalizacion: 0 });
  });
  it("69% remota → sin efecto", () => {
    expect(penalizacionPorPresupuesto(69, false)).toEqual({ descartar: false, penalizacion: 0 });
  });
});
