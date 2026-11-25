/** DIR1125I · el tope del orbe de Aurora: 5 cuadros/s solo en «eficiente» y en reposo (decisión de Alex del 25-11). */
import { describe, expect, it } from "vitest";
import { FPS_ORBE_REPOSO_EFICIENTE, topeDelOrbe } from "../ritmo-cuadros";

describe("DIR1125I · tope del orbe", () => {
  it("en «eficiente» (tope 10) y en reposo baja a 5", () => {
    expect(FPS_ORBE_REPOSO_EFICIENTE).toBe(5);
    expect(topeDelOrbe(10, true)).toBe(5);
  });
  it("con voz, en «eco» y sin tope no cambia nada", () => {
    expect(topeDelOrbe(10, false)).toBe(10);
    expect(topeDelOrbe(30, true)).toBe(30);
    expect(topeDelOrbe(30, false)).toBe(30);
    expect(topeDelOrbe(0, true)).toBe(0);
    expect(topeDelOrbe(0, false)).toBe(0);
  });
  it("nunca sube un tope que ya era más bajo", () => {
    expect(topeDelOrbe(4, true)).toBe(4);
  });
});
