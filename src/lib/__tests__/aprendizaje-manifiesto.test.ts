import { describe, it, expect } from "vitest";
import {
  AGENTES_APRENDIZAJE,
  FASES_APRENDIZAJE,
  FUENTES_158,
  progresoAprendizaje,
} from "../astraura/aprendizaje/manifiesto";

describe("manifiesto de aprendizaje continuo 1.58", () => {
  it("los ids de agentes, fases e hitos son únicos", () => {
    const ids = [
      ...AGENTES_APRENDIZAJE.map((a) => a.id),
      ...FASES_APRENDIZAJE.map((f) => f.id),
      ...FASES_APRENDIZAJE.flatMap((f) => f.hitos.map((h) => h.id)),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("hay exactamente cinco agentes especializados", () => {
    expect(AGENTES_APRENDIZAJE).toHaveLength(5);
    for (const a of AGENTES_APRENDIZAJE) {
      expect(["bitnet-local", "nube-gratis"]).toContain(a.modeloPreferido);
      expect(a.entradas.length).toBeGreaterThan(0);
      expect(a.salidas.length).toBeGreaterThan(0);
    }
  });

  it("cada fase tiene su ola del enjambre y al menos un hito", () => {
    expect(FASES_APRENDIZAJE).toHaveLength(5);
    const olas = FASES_APRENDIZAJE.map((f) => f.ola);
    expect(olas).toEqual([268, 269, 270, 271, 272]);
    for (const f of FASES_APRENDIZAJE) expect(f.hitos.length).toBeGreaterThan(0);
  });

  it("lista las cuatro fuentes verificadas", () => {
    expect(FUENTES_158).toHaveLength(4);
    for (const f of FUENTES_158) expect(f.url.startsWith("https://")).toBe(true);
  });

  it("el progreso está siempre entre 0 y 1", () => {
    const p = progresoAprendizaje();
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
  });
});
