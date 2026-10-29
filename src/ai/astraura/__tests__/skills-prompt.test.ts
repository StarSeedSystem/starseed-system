// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  CAPS_KEY,
  DEFAULT_ON_DISABLED_KEY,
  SKILL_CAPABILITIES,
  skillsSystemPrompt,
} from "@/ai/astraura/skills";

/**
 * El espejo de la cuenta es la única fuente que activa capacidades aquí: sin
 * skills ni paquetes instalados, entra exactamente lo que declare cada prueba.
 */
function espejo(ids: string[]): void {
  localStorage.setItem(CAPS_KEY, JSON.stringify(ids));
}

/** Apaga capacidades `defaultOn` como hace Ajustes. */
function desactivar(ids: string[]): void {
  localStorage.setItem(DEFAULT_ON_DISABLED_KEY, JSON.stringify(ids));
}

/** Etiquetas del bloque («• Etiqueta: prompt»), en el orden en que salen. */
function idsDe(bloque: string): string[] {
  return bloque
    .split("\n")
    .slice(1)
    .filter((linea) => linea.startsWith("• "))
    .map((linea) => {
      const resto = linea.slice(2);
      return resto.slice(0, resto.indexOf(": "));
    });
}

afterEach(() => localStorage.clear());

describe("skillsSystemPrompt · capa completa y filtro por chat", () => {
  it("el texto de la habilidad va COMPLETO (capa por defecto) y con su etiqueta", () => {
    espejo(["pm"]);
    const bloque = skillsSystemPrompt();
    const pm = SKILL_CAPABILITIES.find((c) => c.id === "pm");
    expect(pm).toBeTruthy();
    if (pm) expect(bloque).toContain(pm.systemPrompt);
    // El formato del bloque no cambia: cabecera y línea «• Etiqueta: prompt».
    expect(bloque.startsWith("Capacidades activas de Aurora (Biblioteca StarSeed):\n")).toBe(true);
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

  it("respeta las desactivadas de Ajustes aunque la capacidad viva siga instalada", () => {
    // La capacidad activa por espejo (pm) sigue presente; la defaultOn (av-gen)
    // desaparece al desactivarla en Ajustes.
    espejo(["pm", "web-senses"]);
    desactivar(["av-gen"]);
    const bloque = skillsSystemPrompt();
    const etiquetas = idsDe(bloque);
    expect(etiquetas.some((l) => l.startsWith("PM"))).toBe(true);
    expect(etiquetas.some((l) => l.startsWith("Sentidos web"))).toBe(true);
    expect(etiquetas.some((l) => l.startsWith("Generación audiovisual"))).toBe(false);
  });

  it("sin capacidades activas el bloque es vacío y no deja texto suelto", () => {
    // Sin espejo quedan las defaultOn: hoy «av-gen» (Adenda 138),
    // «diagram-design» (Ola 1018D) y «habilidades-ingenieria» (Ola 1018L).
    // El bloque se vacía al apagarlas en Ajustes.
    desactivar(["av-gen", "diagram-design", "habilidades-ingenieria"]);
    expect(skillsSystemPrompt()).toBe("");
  });
});
