import { describe, expect, it } from "vitest";
import { getPersonaParams, PERSONA_PARAM_ADJUSTMENTS, FALLBACK_PERSONA } from "@/lib/aurora/persona-params";
import type { QuantumOrbParams } from "@/lib/aurora/quantum-orb-theme";

describe("persona-params", () => {
  it("exporta ajustes para todas las personalidades conocidas", () => {
    const esperadas = [
      "hephaestus",
      "hermione",
      "atenea",
      "oneiros",
      "hermes",
      "logos",
      "mnemosyne",
      "kallisti",
      "astraura_prime",
      "aurora",
    ];
    for (const id of esperadas) {
      expect(PERSONA_PARAM_ADJUSTMENTS[id]).toBeDefined();
      const params = PERSONA_PARAM_ADJUSTMENTS[id] as Partial<QuantumOrbParams>;
      for (const valor of Object.values(params)) {
        expect(valor).toBeGreaterThanOrEqual(0);
        expect(valor).toBeLessThanOrEqual(1);
      }
    }
  });

  it("getPersonaParams devuelve ajustes válidos para IDs conocidos", () => {
    const params = getPersonaParams("hephaestus");
    expect(params.turbulence).toBe(0.6);
    expect(params.spikiness).toBe(0.7);
    expect(params.symmetry).toBe(0.3);
    expect(params.hueShift).toBe(0.1);
    expect(params.breath).toBe(0.4);
  });

  it("getPersonaParams es case-insensitive", () => {
    expect(getPersonaParams("HEPHAESTUS")).toEqual(getPersonaParams("hephaestus"));
    expect(getPersonaParams("HePhAeStUs")).toEqual(getPersonaParams("hephaestus"));
  });

  it("getPersonaParams devuelve fallback para ID desconocido", () => {
    const desconocido = getPersonaParams("no-existe");
    const fallback = getPersonaParams(FALLBACK_PERSONA);
    expect(desconocido).toEqual(fallback);
  });

  it("FALLBACK_PERSONA es aurora", () => {
    expect(FALLBACK_PERSONA).toBe("aurora");
  });
});