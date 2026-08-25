import { describe, it, expect } from "vitest";
import { contornoEspacio } from "../mundo-espacio-forma";

describe("contornoEspacio", () => {
  it("es determinista: misma semilla y radio, mismo contorno siempre", () => {
    expect(contornoEspacio(12345, 5)).toEqual(contornoEspacio(12345, 5));
  });

  it("cada punto respeta radio * variación (0.72..1.28) — nunca se sale de ese anillo", () => {
    const radio = 8;
    for (const [x, z] of contornoEspacio(999, radio)) {
      const d = Math.hypot(x, z);
      expect(d).toBeGreaterThanOrEqual(radio * 0.72 - 1e-9);
      expect(d).toBeLessThanOrEqual(radio * 1.28 + 1e-9);
    }
  });

  it("semillas distintas producen parcelas distintas", () => {
    expect(contornoEspacio(1, 5)).not.toEqual(contornoEspacio(2, 5));
  });

  it("radio 0 colapsa el contorno al origen sin lanzar", () => {
    // toBeCloseTo (no toBe): cos/sin de algunos ángulos dan -0 * radio,
    // numéricamente idéntico a 0 pero distinto para Object.is.
    for (const [x, z] of contornoEspacio(7, 0)) {
      expect(x).toBeCloseTo(0);
      expect(z).toBeCloseTo(0);
    }
  });
});
