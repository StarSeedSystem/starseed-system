import { describe, it, expect } from "vitest";
import { SKILL_CAPABILITIES } from "@/ai/astraura/skills";
import { HABILIDADES_INGENIERIA_A } from "../habilidades/ingenieria-a";
import { PRODUCTIVITY_SKILLS } from "../habilidades/productividad";

describe("SKILL_CAPABILITIES · ingeniería", () => {
  it("no duplica ids en el registro", () => {
    const ids = SKILL_CAPABILITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("las cinco de ingeniería no pisan ids del registro ni de productividad", () => {
    const ocupados = new Set([
      ...SKILL_CAPABILITIES.map((c) => c.id),
      ...PRODUCTIVITY_SKILLS.map((c) => c.id),
    ]);
    for (const h of HABILIDADES_INGENIERIA_A) {
      expect(ocupados.has(h.id)).toBe(false);
    }
  });
});
