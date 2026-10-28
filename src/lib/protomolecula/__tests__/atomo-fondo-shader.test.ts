import { describe, it, expect } from "vitest";
import { FONDO_SHADER, crearSetFondoShader, validarSetFondoShader, type SetFondoShader } from "../fondo-shader";

describe("atomo-fondo-shader", () => {
  it("exporta FONDO_SHADER", () => {
    expect(FONDO_SHADER.herramientaId).toBe("shaders");
    expect(FONDO_SHADER.categoria).toBe("arquitectura");
    expect(FONDO_SHADER.control).toBe("total");
  });

  it("crea un set con valores por defecto", () => {
    const s = crearSetFondoShader();
    expect(s.efecto).toBe("gradiente");
    expect(s.capas).toBe(1);
    expect(s.disableTelemetry).toBe(true);
  });

  it("valida un set correcto", () => {
    const s = crearSetFondoShader({ id: "test-1", nombre: "Test" });
    expect(validarSetFondoShader(s)).toEqual({ ok: true });
  });

  it("rechaza capas fuera de rango Fibonacci", () => {
    const s = crearSetFondoShader({ capas: 10 });
    const r = validarSetFondoShader(s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("capas");
  });

  it("rechaza telemetría activa", () => {
    const s = crearSetFondoShader({ disableTelemetry: false });
    const r = validarSetFondoShader(s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("telemetría");
  });

  it("respeta la escala φ en los parámetros", () => {
    const s = crearSetFondoShader({ capas: 5, intensidad: 0.618 });
    expect(s.capas).toBe(5);
    expect(s.intensidad).toBeCloseTo(0.618, 2);
  });
});
