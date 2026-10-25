// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { CAPS_KEY, DEFAULT_ON_DISABLED_KEY, SKILL_CAPABILITIES, skillsSystemPrompt } from "../skills";

/**
 * Pruebas del bloque de capacidades de Aurora (src/ai/astraura/skills.ts).
 * CASO DE RESCATE RTTIP1013B: la rama nube/39717157403 traía pruebas de
 * skills-prompt que main no tiene con ese nombre; se traen las que prueban
 * comportamiento que main todavía no cubre, adaptadas a la API de hoy.
 * skills.ts lee window.localStorage (SSR-safe), así que corren en jsdom y
 * escriben el espejo y las desactivadas directamente en ese registro.
 */

/** Escribe el espejo de capacidades activas (lo que library-sync sube a la cuenta). */
function espejo(ids: string[]): void {
  window.localStorage.setItem(CAPS_KEY, JSON.stringify(ids));
}

/** Desactiva capacidades encendidas por defecto (Ajustes → Habilidades). */
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
    // Y el formato del bloque no cambia: cabecera y línea «• Etiqueta: prompt» de siempre.
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
    // Hoy hay DOS capacidades encendidas por defecto sin instalar nada: «av-gen»
    // (Adenda 138) y «diagram-design» (Ola 1018D). El bloque solo queda vacío
    // cuando la persona apaga LAS DOS en Ajustes.
    desactivar(["av-gen", "diagram-design"]);
    expect(skillsSystemPrompt()).toBe("");
  });

  it("las capacidades encendidas por defecto vienen solas, sin espejo ni instalación", () => {
    // Sin espejo quedan SIEMPRE las defaultOn; el bloque no vacío es el suelo
    // garantizado de toda cuenta nueva.
    const etiquetas = idsDe(skillsSystemPrompt());
    expect(etiquetas.some((l) => l.startsWith("Generación audiovisual"))).toBe(true);
    expect(etiquetas.some((l) => l.startsWith("Diagram Design"))).toBe(true);
  });
});
