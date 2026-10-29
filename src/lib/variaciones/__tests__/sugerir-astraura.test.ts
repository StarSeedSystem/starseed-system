import { describe, it, expect } from "vitest";
import { sugerirVariaciones } from "../sugerir-astraura";

describe("sugerirVariaciones", () => {
  it("debe retornar un array de variaciones válidas tras pasar payload y ADN", async () => {
    const resultado = await sugerirVariaciones(
      "widget:clima",
      { usuario: "test" },
      { supabase: {} }
    );
    expect(Array.isArray(resultado)).toBe(true);
    expect(resultado.length).toBeLessThanOrEqual(3);
    resultado.forEach((r) => {
      expect(r.variacion).toBeDefined();
      expect(r.motivo).toBeDefined();
    });
  });
});