/**
 * Guardia de la skill coop-sync-testing (CAP-skill-coop-sync-testing-usob).
 *
 * La objeción del director fue mecánica: la tarea se rechazó sin tocar su único
 * archivo (`.agent/skills/coop-sync-testing/README.md`) y otras olas la cerraron
 * como «rechazada» sin que existiera el documento. Estas pruebas demuestran la
 * reparación: el README existe, declara la tarea integrada, no promete
 * herramientas que no se copiaron y enlaza el método con los módulos reales.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const SKILL = path.join(RAIZ, ".agent", "skills", "coop-sync-testing");
const README = path.join(SKILL, "README.md");
const TAREA = "CAP-skill-coop-sync-testing-usob";

function leer(): string {
  expect(existsSync(README), `falta ${README}`).toBe(true);
  return readFileSync(README, "utf8");
}

describe("skill coop-sync-testing · reparación de la objeción", () => {
  it("punto 1: la tarea sí toca su archivo (el README existe y documenta la skill)", () => {
    const texto = leer();
    expect(statSync(README).size).toBeGreaterThan(800);
    expect(texto).toMatch(/^#\s+coop-sync-testing/m);
    expect(texto).toContain("SKILL.md");
  });

  it("punto 2: declara la tarea integrada para que otra ola no la cierre en falso", () => {
    const texto = leer();
    expect(texto).toContain(TAREA);
    expect(texto.toLowerCase()).toContain("integrada");
  });

  it("punto 3: no promete tools/ que no se copiaron al repo", () => {
    const texto = leer();
    expect(texto).toContain("No hay `tools/`");
    expect(texto).toContain("no se copiaron");
    expect(texto).not.toContain("python -I tools/test_all.py");
    expect(existsSync(path.join(SKILL, "tools"))).toBe(false);
  });

  it("punto 4: enlaza el método con los módulos y pruebas reales de StarSeed", () => {
    const texto = leer();
    for (const ruta of [
      "src/lib/salas/sincronia-sala.ts",
      "src/lib/salas/propiedad-sala.ts",
      "src/lib/__tests__/salas-sincronia-fuzz.test.ts",
      "src/lib/__tests__/salas-propiedad.test.ts",
    ]) {
      expect(texto).toContain(ruta);
      expect(existsSync(path.join(RAIZ, ruta)), `la ruta citada debe existir: ${ruta}`).toBe(true);
    }
  });

  it("punto 5: trae un ejemplo ejecutable con semilla, oráculos y gemelo mutante", () => {
    const texto = leer();
    expect(texto).toContain("npx vitest run src/lib/__tests__/salas-sincronia-fuzz.test.ts");
    expect(texto).toContain("mulberry32");
    expect(texto.toLowerCase()).toContain("oráculo");
    expect(texto.toLowerCase()).toContain("gemelo mutante");
    expect(texto).toContain("fusionarEstados");
  });
});
