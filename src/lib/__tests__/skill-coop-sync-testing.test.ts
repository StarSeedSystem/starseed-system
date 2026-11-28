/**
 * Guardia de la skill coop-sync-testing (CAP-skill-coop-sync-testing-usob).
 *
 * La objeción del director fue mecánica: la tarea se rechazó sin tocar su único
 * archivo (`.agent/skills/coop-sync-testing/README.md`) y otras olas la cerraron
 * como «rechazada» sin que existiera el documento. Estas pruebas demuestran la
 * reparación: el README existe, declara la tarea integrada, no promete
 * herramientas que no se copiaron y enlaza el método con los módulos reales.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const SKILL = path.join(RAIZ, ".agent", "skills", "coop-sync-testing");
const README = path.join(SKILL, "README.md");
const RUTA_REL = ".agent/skills/coop-sync-testing/README.md";
const TAREA = "CAP-skill-coop-sync-testing-usob";

function leer(): string {
  expect(existsSync(README), `falta ${README}`).toBe(true);
  return readFileSync(README, "utf8");
}

function estaVersionado(ruta: string): boolean {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", ruta], { cwd: RAIZ, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const OBJECIONES: ReadonlyArray<readonly [string, RegExp]> = [
  ["2026-11-22 22:44:29", /no tocó NINGUNO de sus 1 archivo/i],
  ["2026-11-22 22:47:29", /no se da por cerrada/i],
  ["2026-11-22 22:49:30", /reabierta otra vez/i],
  ["2026-11-22 23:01:00", /se documenta el descarte/i],
  ["2026-11-23 13:11:03", /no se cierra en silencio/i],
];

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

describe("causa mecánica y avisos literales de la objeción", () => {
  it("el README está versionado en git, no solo en disco (causa del rechazo)", () => {
    expect(leer()).toContain("git ls-files");
    if (existsSync(path.join(RAIZ, ".git"))) {
      expect(estaVersionado(RUTA_REL), `${RUTA_REL} está ignorado o sin stage`).toBe(true);
    }
  });

  for (const [fecha, frase] of OBJECIONES) {
    it(`aviso ${fecha} tiene respuesta en el README`, () => {
      const texto = leer();
      expect(texto).toContain(fecha);
      expect(texto).toMatch(frase);
    });
  }
});
