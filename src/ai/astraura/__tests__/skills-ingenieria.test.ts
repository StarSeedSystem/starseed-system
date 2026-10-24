import { describe, it, expect } from "vitest";
import { SKILL_CAPABILITIES } from "../skills";
import { HABILIDADES_INGENIERIA_A, comoCapacidad } from "../habilidades/ingenieria-a";
import { PRODUCTIVITY_SKILLS } from "../habilidades/productividad";

const RAIZ_INGENIERIA = "vendor/habilidades/mattpocock-skills/engineering";

describe("skills.ts · habilidades de ingeniería", () => {
  it("registra las cinco habilidades de ingeniería", () => {
    expect(HABILIDADES_INGENIERIA_A).toHaveLength(5);
    const ids = new Set(SKILL_CAPABILITIES.map((c) => c.id));
    for (const h of HABILIDADES_INGENIERIA_A) expect(ids.has(h.id)).toBe(true);
  });

  it.each(HABILIDADES_INGENIERIA_A)("$id aparece en el registro con su rutaCompleta", (h) => {
    const capacidad = SKILL_CAPABILITIES.find((c) => c.id === h.id);
    expect(capacidad).toBeDefined();
    expect(capacidad?.rutaCompleta).toBe(h.rutaCompleta);
    expect(capacidad?.rutaCompleta).toBe(`${RAIZ_INGENIERIA}/${h.id}/SKILL.md`);
  });

  it.each(HABILIDADES_INGENIERIA_A)("$id conserva el resumen y su activación por skill y paquete", (h) => {
    const capacidad = SKILL_CAPABILITIES.find((c) => c.id === h.id);
    expect(capacidad?.label).toBe(h.nombre);
    expect(capacidad?.systemPrompt).toBe(comoCapacidad(h, "resumen").systemPrompt);
    expect(capacidad?.skillIds).toEqual([`aurora-${h.id}`]);
    expect(capacidad?.packageIds).toEqual([`iatool-${h.id}`]);
  });

  it("no duplica ningún id en el registro", () => {
    const ids = SKILL_CAPABILITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("no reutiliza los ids de las habilidades de productividad", () => {
    const productividad = new Set(PRODUCTIVITY_SKILLS.map((c) => c.id));
    expect(HABILIDADES_INGENIERIA_A.filter((h) => productividad.has(h.id))).toEqual([]);
  });
});
