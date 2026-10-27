<<<<<<< HEAD
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
=======
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

>>>>>>> 4319ad7ee (salvavidas · RTTIP1013Bb: trabajo del agente antes de las puertas (tsc / vitest))
  it("el texto de la habilidad va COMPLETO (capa por defecto) y con su etiqueta", () => {
    espejo(["pm"]);
    const bloque = skillsSystemPrompt();
    const pm = SKILL_CAPABILITIES.find((c) => c.id === "pm");
    expect(pm).toBeTruthy();
    if (pm) expect(bloque).toContain(pm.systemPrompt);
<<<<<<< HEAD
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
=======
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
>>>>>>> 4319ad7ee (salvavidas · RTTIP1013Bb: trabajo del agente antes de las puertas (tsc / vitest))
    espejo(["pm"]);
    expect(skillsSystemPrompt(["agent-recipes"])).toBe("");
  });

  it("sin capacidades activas el bloque es vacío y no deja texto suelto", () => {
<<<<<<< HEAD
    // Sin espejo quedan las defaultOn: hoy «av-gen» (Adenda 138) y
    // «diagram-design» (Ola 1018D). El bloque se vacía al apagarlas en Ajustes.
    desactivar(["av-gen", "diagram-design"]);
=======
    // Sin espejo queda SIEMPRE la defaultOn («av-gen», Adenda 138): solo se
    // vacía cuando la persona la apaga en Ajustes.
    espejo([]);
    desactivar(["av-gen"]);
>>>>>>> 4319ad7ee (salvavidas · RTTIP1013Bb: trabajo del agente antes de las puertas (tsc / vitest))
    expect(skillsSystemPrompt()).toBe("");
  });
});
