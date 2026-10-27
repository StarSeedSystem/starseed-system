import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { skillsSystemPrompt, SKILL_CAPABILITIES, CAPS_KEY, DEFAULT_ON_DISABLED_KEY } from "../skills";

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

/** Fija el espejo de capacidades traído de la cuenta. */
function espejo(ids: string[]): void {
  almacen.setItem(CAPS_KEY, JSON.stringify(ids));
}

/** Apaga capacidades predeterminadas desde Ajustes. */
function desactivar(ids: string[]): void {
  almacen.setItem(DEFAULT_ON_DISABLED_KEY, JSON.stringify(ids));
}

/** Extrae las etiquetas («PM · …») de las líneas del bloque. */
function idsDe(bloque: string): string[] {
  return bloque
    .split("\n")
    .filter((linea) => linea.startsWith("• "))
    .map((linea) => linea.slice(2).split(":")[0]);
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

  it("el texto de la habilidad va COMPLETO (capa por defecto) y con su etiqueta", () => {
    espejo(["pm"]);
    const bloque = skillsSystemPrompt();
    const pm = SKILL_CAPABILITIES.find((c) => c.id === "pm");
    expect(pm).toBeTruthy();
    if (pm) expect(bloque).toContain(pm.systemPrompt);
  });

  it("respeta las desactivadas de Ajustes aunque la espejo siga activa", () => {
    // Hoy la lista de desactivadas solo gobierna las capacidades defaultOn:
    // la del espejo (pm) sigue activa, la defaultOn (av-gen) desaparece.
    espejo(["pm", "web-senses"]);
    desactivar(["av-gen"]);
    const etiquetas = idsDe(skillsSystemPrompt());
    expect(etiquetas.some((l) => l.startsWith("PM"))).toBe(true);
    expect(etiquetas.some((l) => l.startsWith("Sentidos web"))).toBe(true);
    expect(etiquetas.some((l) => l.startsWith("Generación audiovisual"))).toBe(false);
  });

  it("con `only` entran solo las elegidas que están activas", () => {
    espejo(["pm", "web-senses", "agent-recipes"]);
    const etiquetas = idsDe(skillsSystemPrompt(["pm", "agent-recipes"]));
    expect(etiquetas).toHaveLength(2);
    expect(etiquetas.some((l) => l.startsWith("PM"))).toBe(true);
    expect(etiquetas.some((l) => l.startsWith("Recetas"))).toBe(true);
    expect(etiquetas.some((l) => l.startsWith("Sentidos web"))).toBe(false);
  });

  it("una identificación elegida que no instala nada devuelve bloque vacío", () => {
    espejo(["pm"]);
    expect(skillsSystemPrompt(["agent-recipes"])).toBe("");
  });

  it("sin capacidades activas el bloque es vacío y no deja texto suelto", () => {
    // Sin espejo queda SIEMPRE la defaultOn («av-gen», Adenda 138): solo se
    // vacía cuando la persona la apaga en Ajustes.
    espejo([]);
    desactivar(["av-gen"]);
    expect(skillsSystemPrompt()).toBe("");
  });
});
