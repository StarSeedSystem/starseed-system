import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SKILL_ROOT = join(__dirname, "../../../../.agent/skills/coop-sync-testing");
const README_PATH = join(SKILL_ROOT, "README.md");
const REFERENCIAS_DIR = join(SKILL_ROOT, "referencias");

describe("skill coop-sync-testing — README y referencias", () => {
  it("README.md existe y no está vacío", () => {
    const content = readFileSync(README_PATH, "utf-8");
    expect(content.length).toBeGreaterThan(500);
  });

  it("README.md contiene las secciones obligatorias", () => {
    const content = readFileSync(README_PATH, "utf-8");
    const secciones = [
      "## Propósito",
      "## Conceptos clave para StarSeed",
      "## Flujo de trabajo recomendado",
      "## Archivos de referencia incluidos",
      "## Ejemplo de uso en el enjambre",
      "## Cómo invocar la skill desde el enjambre",
      "## Reglas de integración",
      "## Referencias rápidas",
    ];
    for (const seccion of secciones) {
      expect(content).toContain(seccion);
    }
  });

  it("README.md incluye los cinco patrones principales", () => {
    const content = readFileSync(README_PATH, "utf-8");
    const patrones = [
      "epoch-ownership",
      "fuzzing",
      "fake-world",
      "flight",
      "chaos",
    ];
    for (const patron of patrones) {
      expect(content).toContain(patron);
    }
  });

  it("README.md tiene cuatro ejemplos de tareas JSON", () => {
    const content = readFileSync(README_PATH, "utf-8");
    const ejemplos = content.match(/"id":\s*"CAP-sync-test-\d{3}"/g) || [];
    expect(ejemplos.length).toBe(4);
  });

  it("las cinco referencias existen en referencias/", () => {
    const referencias = [
      "actor-ownership.md",
      "fuzzing-coop-sync.md",
      "fake-world-testing.md",
      "desync-hunting.md",
      "network-chaos-testing.md",
    ];
    for (const ref of referencias) {
      const refPath = join(REFERENCIAS_DIR, ref);
      const content = readFileSync(refPath, "utf-8");
      expect(content.length).toBeGreaterThan(100);
    }
  });

  it("README.md no usa 'any' ni hex sueltos en ejemplos de código", () => {
    const content = readFileSync(README_PATH, "utf-8");
    const codeBlocks = content.match(/```(?:typescript|json|ts)[\s\S]*?```/g) || [];
    for (const block of codeBlocks) {
      expect(block).not.toContain(": any");
      expect(block).not.toContain(" as any");
      expect(block).not.toMatch(/#([0-9a-fA-F]{3,8})\b/);
    }
  });

  it("textos en español con acentos", () => {
    const content = readFileSync(README_PATH, "utf-8");
    expect(content).toMatch(/[áéíóúñ]/);
  });
});