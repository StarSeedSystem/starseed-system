import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { skillsSystemPrompt, SKILL_CAPABILITIES } from "../skills";

const CAPS_KEY = "starseed.capabilities.v1";
const DISABLED_KEY = "starseed.capabilities.disabled.v1";

/** Almacén mínimo de localStorage para el entorno node de vitest. */
class AlmacenFalso {
  private datos = new Map<string, string>();

  getItem(clave: string): string | null {
    return this.datos.get(clave) ?? null;
  }

  setItem(clave: string, valor: string): void {
    this.datos.set(clave, valor);
  }

  removeItem(clave: string): void {
    this.datos.delete(clave);
  }

  clear(): void {
    this.datos.clear();
  }
}

const almacen = new AlmacenFalso();

function instalarVentana(): void {
  (globalThis as unknown as { window: { localStorage: AlmacenFalso } }).window = {
    localStorage: almacen,
  };
}

function espejo(ids: string[]): void {
  almacen.setItem(CAPS_KEY, JSON.stringify(ids));
}

function desactivar(ids: string[]): void {
  almacen.setItem(DISABLED_KEY, JSON.stringify(ids));
}

beforeEach(() => {
  almacen.clear();
  instalarVentana();
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("skillsSystemPrompt", () => {
  it("incluye el espejo de la cuenta y las capacidades defaultOn", () => {
    espejo(["pm", "web-senses"]);
    const bloque = skillsSystemPrompt();
    expect(bloque.startsWith("Capacidades activas de Aurora (Biblioteca StarSeed):")).toBe(true);
    expect(bloque).toContain("PM · producto y proyecto");
    expect(bloque).toContain("Sentidos web (Agent-Reach)");
    expect(bloque).toContain("Generación audiovisual");
  });

  it("el texto de la habilidad va completo y con su etiqueta", () => {
    espejo(["pm"]);
    const bloque = skillsSystemPrompt();
    const pm = SKILL_CAPABILITIES.find((c) => c.id === "pm");
    expect(pm).toBeTruthy();
    if (!pm) return;
    expect(bloque).toContain(pm.label);
    expect(bloque).toContain(pm.systemPrompt);
  });

  it("respeta las defaultOn desactivadas en Ajustes", () => {
    espejo(["pm"]);
    desactivar(["av-gen"]);
    const bloque = skillsSystemPrompt();
    expect(bloque).toContain("PM · producto y proyecto");
    expect(bloque).not.toContain("Generación audiovisual");
  });

  it("con `only` se queda solo con las elegidas que están activas", () => {
    espejo(["pm", "web-senses"]);
    const bloque = skillsSystemPrompt(["pm"]);
    expect(bloque).toContain("PM · producto y proyecto");
    expect(bloque).not.toContain("Sentidos web (Agent-Reach)");
  });

  it("una identificación elegida que no está activa devuelve bloque vacío", () => {
    espejo(["pm"]);
    expect(skillsSystemPrompt(["agent-recipes"])).toBe("");
  });

  it("sin capacidades activas el bloque es vacío y no deja texto suelto", () => {
    espejo([]);
    desactivar(["av-gen", "diagram-design"]);
    expect(skillsSystemPrompt()).toBe("");
  });
});
