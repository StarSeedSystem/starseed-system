import { describe, it, expect } from "vitest";
import { SKILL_CAPABILITIES } from "../skills";
import { HABILIDADES_INGENIERIA_A } from "../habilidades/ingenieria-a";

// Las cinco habilidades de ingeniería (ingenieria-a.ts) deben aparecer en el
// registro de capacidades vivas de Aurora (SKILL_CAPABILITIES de skills.ts),
// igual que las de productividad y sin duplicar ids.
describe("Habilidades de ingeniería en el registro", () => {
  it("las cinco aparecen exactamente una vez en SKILL_CAPABILITIES", () => {
    const ids = SKILL_CAPABILITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const h of HABILIDADES_INGENIERIA_A) {
      expect(ids).toContain(h.id);
    }
  });

  it.each(HABILIDADES_INGENIERIA_A)("$id está registrado con su rutaCompleta", (h) => {
    const cap = SKILL_CAPABILITIES.find((c) => c.id === h.id);
    expect(cap).toBeDefined();
    expect(cap?.label).toBe(h.nombre);
    expect(cap?.systemPrompt).toContain(h.rutaCompleta);
    expect(cap?.systemPrompt).toContain("Matt Pocock");
    expect(cap?.systemPrompt).toContain("MIT");
  });

  it.each(HABILIDADES_INGENIERIA_A)("$id mantiene el formato del registro", (h) => {
    const cap = SKILL_CAPABILITIES.find((c) => c.id === h.id);
    expect(cap?.routing).toEqual({});
    expect(cap?.skillIds).toContain(`aurora-${h.id}`);
    expect(cap?.packageIds).toContain(`iatool-${h.id}`);
    expect(cap?.systemPrompt).toContain(h.resumen);
  });
});
