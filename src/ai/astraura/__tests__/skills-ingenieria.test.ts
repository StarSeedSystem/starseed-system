import { describe, it, expect } from "vitest";
import { SKILL_CAPABILITIES } from "../skills";
import { HABILIDADES_INGENIERIA_A } from "../habilidades/ingenieria-a";
import { PRODUCTIVITY_SKILLS } from "../habilidades/productividad";

describe("habilidades de ingeniería en el registro de capacidades", () => {
  it("las cinco están en SKILL_CAPABILITIES con su rutaCompleta", () => {
    const ids = HABILIDADES_INGENIERIA_A.map((h) => h.id);
    expect(ids).toHaveLength(5);
    for (const id of ids) {
      const registrada = SKILL_CAPABILITIES.find((c) => c.id === id);
      expect(registrada, `falta ${id} en el registro`).toBeDefined();
    }
  });

  it.each(HABILIDADES_INGENIERIA_A)("$id conserva su tarjeta y su rutaCompleta", (h) => {
    const capacidad = SKILL_CAPABILITIES.find((c) => c.id === h.id);
    expect(capacidad).toBeDefined();
    expect(capacidad?.label).toBe(h.nombre);
    expect(capacidad?.rutaCompleta).toBe(h.rutaCompleta);
    expect(capacidad?.rutaCompleta).toBe(
      `vendor/habilidades/mattpocock-skills/engineering/${h.id}/SKILL.md`,
    );
    expect(capacidad?.systemPrompt.startsWith(h.resumen)).toBe(true);
    expect(capacidad?.systemPrompt.endsWith("(Matt Pocock, MIT)")).toBe(true);
  });

  it("no duplica ids en el registro ni pisa los de productividad", () => {
    const ids = SKILL_CAPABILITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const deProductividad = new Set(PRODUCTIVITY_SKILLS.map((c) => c.id));
    for (const h of HABILIDADES_INGENIERIA_A) {
      expect(deProductividad.has(h.id)).toBe(false);
    }
  });
});
