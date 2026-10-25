// @vitest-environment jsdom
// Pruebas del bloque de system prompt de las capacidades de Aurora
// (Rescate RTTIP1013B, adaptadas a la API de main).
// `skillsSystemPrompt` lee CAPS_KEY y DEFAULT_ON_DISABLED_KEY de
// window.localStorage, así que esta suite corre con jsdom.
import { beforeEach, describe, expect, it } from "vitest";
import {
  CAPS_KEY,
  DEFAULT_ON_DISABLED_KEY,
  SKILL_CAPABILITIES,
  skillsSystemPrompt,
} from "../skills";

// Etiquetas visibles del bloque: cada línea «• Etiqueta: prompt» → «Etiqueta».
function etiquetasDe(bloque: string): string[] {
  return bloque
    .split("\n")
    .filter((linea) => linea.startsWith("• "))
    .map((linea) =>
      linea
        .replace(/^• /, "")
        .split(":")[0]
        .trim(),
    );
}

/** Enciende el espejo de capacidades traídas de la cuenta (CAPS_KEY). */
function espejo(ids: string[]): void {
  window.localStorage.setItem(CAPS_KEY, JSON.stringify(ids));
}

/** Apaga capacidades default-ON del usuario (DEFAULT_ON_DISABLED_KEY). */
function desactivar(ids: string[]): void {
  window.localStorage.setItem(DEFAULT_ON_DISABLED_KEY, JSON.stringify(ids));
}

describe("skillsSystemPrompt", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("con el espejo entran las sin routing, las de preferStrong y las de web; no las de solo planificación", () => {
    // pm (preferStrong+planning), agent-recipes (solo planning), web-senses (web).
    espejo(["pm", "agent-recipes", "web-senses"]);
    const bloque = skillsSystemPrompt();
    const etiquetas = etiquetasDe(bloque);
    expect(etiquetas.some((l) => l.startsWith("PM"))).toBe(true);
    expect(etiquetas.some((l) => l.startsWith("Sentidos web"))).toBe(true);
    // Solo planificación: sirve a escritor/código/producción, no al chat.
    expect(etiquetas.some((l) => l.startsWith("Recetas"))).toBe(false);
    // Y el formato del bloque no cambia: misma cabecera de siempre.
    expect(bloque.startsWith("Capacidades activas de Aurora (Biblioteca StarSeed):")).toBe(
      true,
    );
  });

  it("el texto de la habilidad va COMPLETO (capa por defecto) y con su etiqueta", () => {
    espejo(["pm"]);
    const bloque = skillsSystemPrompt();
    const manifiesto = SKILL_CAPABILITIES.find((c) => c.id === "pm");
    if (!manifiesto) throw new Error("pm no está en el manifiesto");
    expect(bloque).toContain(manifiesto.systemPrompt);
    expect(bloque).toContain(`• ${manifiesto.label}:`);
  });
});

describe("skillsSystemPrompt · filtro `only` por chat", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("con `only` entran ESAS aunque su papel de routing no encaje con el chat", () => {
    espejo(["pm", "agent-recipes"]);
    const etiquetas = etiquetasDe(skillsSystemPrompt(["agent-recipes"]));
    expect(etiquetas).toHaveLength(1);
    expect(etiquetas[0].startsWith("Recetas")).toBe(true);
  });

  it("una identificación elegida que no instala nada devuelve bloque vacío", () => {
    espejo(["pm"]);
    expect(skillsSystemPrompt(["agent-recipes"])).toBe("");
  });
});

describe("skillsSystemPrompt · capacidades default-ON apagadas", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("sin capacidades activas el bloque es vacío y no deja texto suelto", () => {
    // Sin espejo y sin instalaciones quedan SIEMPRE las defaultOn: hoy son dos
    // («av-gen», Adenda 138, y «diagram-design», Ola 1018D). El bloque solo se
    // vacía cuando la persona las apaga en Ajustes.
    desactivar(["av-gen", "diagram-design"]);
    expect(skillsSystemPrompt()).toBe("");
  });
});
