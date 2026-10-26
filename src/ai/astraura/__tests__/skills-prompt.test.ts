// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  CAPS_KEY,
  DEFAULT_ON_DISABLED_KEY,
  SKILL_CAPABILITIES,
  skillsSystemPrompt,
} from "../skills";

/**
 * Pruebas del bloque de capacidades de Aurora (src/ai/astraura/skills.ts).
 * Rescate RTTIP1013B: la rama de la nube traía casos de skills-prompt que main
 * no tiene con ese nombre; se traen los que prueban comportamiento que main
 * todavía no cubre, adaptados a la API de hoy (sin filtro por papel).
 * skills.ts lee window.localStorage, así que esta suite corre en jsdom.
 */

/** Escribe el espejo de capacidades activas (lo que se sube a la cuenta). */
function espejo(ids: string[]): void {
  window.localStorage.setItem(CAPS_KEY, JSON.stringify(ids));
}

/** Apaga capacidades encendidas por defecto (Ajustes → Habilidades). */
function desactivar(ids: string[]): void {
  window.localStorage.setItem(DEFAULT_ON_DISABLED_KEY, JSON.stringify(ids));
}

/** Etiquetas del bloque: cada línea «• Etiqueta: prompt» da su etiqueta. */
function idsDe(bloque: string): string[] {
  return bloque
    .split("\n")
    .filter((linea) => linea.startsWith("• "))
    .map((linea) => linea.slice(2, linea.indexOf(":")));
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("skillsSystemPrompt · bloque global", () => {
  it("el texto de la habilidad va COMPLETO (capa por defecto) y con su etiqueta", () => {
    espejo(["pm"]);
    const bloque = skillsSystemPrompt();
    const pm = SKILL_CAPABILITIES.find((c) => c.id === "pm");
    expect(pm).toBeTruthy();
    if (pm) expect(bloque).toContain(pm.systemPrompt);
    // El formato del bloque no cambia: cabecera y línea «• Etiqueta: prompt».
    expect(
      bloque.startsWith("Capacidades activas de Aurora (Biblioteca StarSeed):\n"),
    ).toBe(true);
    expect(idsDe(bloque)).toContain("PM · producto y proyecto");
  });

  it("con `only` entran ESAS aunque su papel de routing no encaje con el chat", () => {
    espejo(["pm", "agent-recipes"]);
    const etiquetas = idsDe(skillsSystemPrompt(["agent-recipes"]));
    expect(etiquetas).toHaveLength(1);
    expect(etiquetas[0].startsWith("Recetas")).toBe(true);
  });

  it("una identificación elegida que no activa nada devuelve bloque vacío", () => {
    espejo(["pm"]);
    expect(skillsSystemPrompt(["agent-recipes"])).toBe("");
  });

  it("sin capacidades activas el bloque es vacío y no deja texto suelto", () => {
    // Sin espejo quedan las defaultOn: hoy «av-gen» (Adenda 138) y
    // «diagram-design» (Ola 1018D). El bloque se vacía al apagarlas en Ajustes.
    desactivar(["av-gen", "diagram-design"]);
    expect(skillsSystemPrompt()).toBe("");
  });
});
