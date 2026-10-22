// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  CAPS_KEY,
  DEFAULT_ON_DISABLED_KEY,
  SKILL_CAPABILITIES,
  skillsSystemPrompt,
} from "../skills";

/**
 * GCA1019Wc · Conector «habilidades para agentes» APLICADO en el chat.
 * Verifica que `skillsSystemPrompt`, que es la única vía por la que las
 * habilidades de la Biblioteca llegan al cerebro de cada chat y agente,
 * now elige vía `habilidadesPara` (papel «chat», ámbito «cuenta»): sin la
 * elección explícita por chat sigue respetando las desactivadas de Ajustes
 * y deja fuera lo que sirve a otros papeles; con elección explícita, ESAS
 * entran aunque su papel de routing sea de otro.
 */

const idsDe = (bloque: string): string[] =>
  bloque
    .split("\n")
    .filter((l) => l.startsWith("• "))
    .map((l) => l.slice(2));

/** Guarda ids en el espejo local de capacidades (lo que sync escribe). */
function espejo(ids: string[]): void {
  window.localStorage.setItem(CAPS_KEY, JSON.stringify(ids));
}

/** Marca capacidades desactivadas en Ajustes (Av141: defaultOn apagadas). */
function desactivar(ids: string[]): void {
  window.localStorage.setItem(DEFAULT_ON_DISABLED_KEY, JSON.stringify(ids));
}

afterEach(() => {
  window.localStorage.clear();
});

describe("skillsSystemPrompt · vía global pasa por habilidadesPara", () => {
  it("con papel «chat»: entran las sin routing, las de preferStrong y las de web; no las de solo planificación", () => {
    // pm (preferStrong+planning), agent-recipes (solo planning), web-senses (web).
    espejo(["pm", "agent-recipes", "web-senses"]);
    const bloque = skillsSystemPrompt();
    const etiquetas = idsDe(bloque).map((l) => l.split(":")[0]);
    expect(etiquetas.some((l) => l.startsWith("PM"))).toBe(true);
    expect(etiquetas.some((l) => l.startsWith("Sentidos web"))).toBe(true);
    // Solo planificación: sirve a escritor/código/producción, no al chat.
    expect(etiquetas.some((l) => l.startsWith("Recetas"))).toBe(false);
    // Y el formato del bloque no cambia: misma cabecera de siempre.
    expect(bloque.startsWith("Capacidades activas de Aurora (Biblioteca StarSeed):")).toBe(true);
  });

  it("el texto de la habilidad va COMPLETO (capa por defecto) y con su etiqueta", () => {
    espejo(["pm"]);
    const bloque = skillsSystemPrompt();
    const pm = SKILL_CAPABILITIES.find((c) => c.id === "pm");
    expect(pm).toBeTruthy();
    if (pm) expect(bloque).toContain(pm.systemPrompt);
  });

  it("respeta las desactivadas de Ajustes aunque la capacidad viva siga instalada", () => {
    espejo(["pm", "web-senses"]);
    desactivar(["pm"]);
    const etiquetas = idsDe(skillsSystemPrompt());
    expect(etiquetas.some((l) => l.startsWith("PM"))).toBe(false);
    expect(etiquetas.some((l) => l.startsWith("Sentidos web"))).toBe(true);
  });
});

describe("skillsSystemPrompt · elección explícita del chat gana", () => {
  it("con `only` entran ESAS aunque su papel de routing no encaje con el chat", () => {
    espejo(["pm", "agent-recipes"]);
    const etiquetas = idsDe(skillsSystemPrompt(["agent-recipes"]));
    expect(etiquetas).toHaveLength(1);
    expect(etiquetas[0].startsWith("Recetas")).toBe(true);
  });

  it("una identificación elegida que no instala nada devuelve bloque vacío", () => {
    espejo(["pm"]);
    expect(skillsSystemPrompt(["agent-recipes"])).toBe("");
  });

  it("sin capacidades activas el bloque es vacío y no deja texto suelto", () => {
    // Sin espejo queda SIEMPRE la defaultOn («av-gen», Adenda 138): solo se
    // vacía cuando la persona la apaga en Ajustes.
    desactivar(["av-gen"]);
    expect(skillsSystemPrompt()).toBe("");
  });
});
