import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CAPS_KEY,
  DEFAULT_ON_DISABLED_KEY,
  SKILL_CAPABILITIES,
  skillsSystemPrompt,
} from "../skills";

type Almacen = Map<string, string>;

function montarVentana(almacen: Almacen): void {
  const localStorage = {
    getItem: (clave: string) => almacen.get(clave) ?? null,
    setItem: (clave: string, valor: string) => void almacen.set(clave, valor),
    removeItem: (clave: string) => void almacen.delete(clave),
    clear: () => almacen.clear(),
  };
  (globalThis as { window?: unknown }).window = {
    localStorage,
    dispatchEvent: () => true,
  };
}

function espejo(ids: string[]): void {
  window.localStorage.setItem(CAPS_KEY, JSON.stringify(ids));
}

function desactivar(ids: string[]): void {
  window.localStorage.setItem(DEFAULT_ON_DISABLED_KEY, JSON.stringify(ids));
}

function lineasDe(bloque: string): string[] {
  return bloque.split("\n").slice(1).map((linea) => linea.replace(/^• /, ""));
}

beforeEach(() => {
  montarVentana(new Map());
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("skillsSystemPrompt", () => {
  it("incluye el texto COMPLETO de la habilidad activa, con su etiqueta", () => {
    espejo(["pm"]);
    const bloque = skillsSystemPrompt();
    const pm = SKILL_CAPABILITIES.find((c) => c.id === "pm");
    expect(pm).toBeTruthy();
    if (pm) {
      expect(bloque).toContain(`• ${pm.label}: ${pm.systemPrompt}`);
      expect(bloque).toContain(pm.systemPrompt);
    }
  });

  it("con `only` entran ESAS aunque su papel de routing no encaje con el chat", () => {
    espejo(["pm", "agent-recipes"]);
    const etiquetas = lineasDe(skillsSystemPrompt(["agent-recipes"]));
    expect(etiquetas).toHaveLength(1);
    expect(etiquetas[0].startsWith("Recetas")).toBe(true);
  });

  it("una selección que no instala nada devuelve bloque vacío", () => {
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
