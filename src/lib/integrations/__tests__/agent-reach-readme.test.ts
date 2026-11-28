import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { IDS_CAPACIDADES } from "../agent-reach-comandos";

// Reparación CAP1119 · CAP-skill-agent-reach-uso.
// Tres rechazos seguidos («la nube dijo rechazada», «otra ola ya la cerró») tenían
// la misma causa: la skill se instaló (SKILL.md, LICENSE, references) pero nunca
// quedó escrito su README de uso para el enjambre. Estas pruebas fijan ese contrato:
// el README existe, no se desvía de las capacidades reales del proxy y enseña a usarlo
// sin saltarse las reglas duras (solo lectura, sin claves, canales con sesión apagados).

const RUTA = new URL("../../../../.agent/skills/agent-reach/README.md", import.meta.url);

function leer(): string | null {
  try {
    return readFileSync(RUTA, "utf8");
  } catch {
    return null;
  }
}

const readme = leer();
const texto = readme ?? "";

describe("README de la skill agent-reach · CAP1119", () => {
  it("punto 1 · existe junto a SKILL.md y LICENSE", () => {
    expect(readme, "falta .agent/skills/agent-reach/README.md").not.toBeNull();
    expect(texto.length).toBeGreaterThan(400);
    expect(texto).toMatch(/agent-reach/i);
  });

  it("punto 1 · el README no queda fuera del índice por .gitignore (causa de los rechazos)", () => {
    const gitignore = readFileSync(new URL("../../../../.gitignore", import.meta.url), "utf8");
    const reglas = gitignore
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"));
    const negado = reglas.lastIndexOf("!.agent/skills/agent-reach/README.md");
    const ignorado = reglas.lastIndexOf(".agent/skills/agent-reach/*");
    expect(ignorado, "falta la regla que ignora el resto de la skill").toBeGreaterThanOrEqual(0);
    expect(negado, "falta la excepción del README").toBeGreaterThan(ignorado);
    for (const dir of ["!.agent/skills/", "!.agent/skills/agent-reach/"]) {
      expect(reglas, `falta re-incluir el directorio ${dir}`).toContain(dir);
    }
  });

  it("punto 2 · documenta cada capacidad real del proxy, sin deriva", () => {
    expect(IDS_CAPACIDADES.length).toBeGreaterThan(0);
    for (const id of IDS_CAPACIDADES) {
      expect(texto, `el README no documenta la capacidad \`${id}\``).toContain(`\`${id}\``);
    }
  });

  it("punto 3 · enseña el ejemplo por el proxy local, no el CLI desde el navegador", () => {
    expect(texto).toContain("/api/agent-reach/");
    const bloques = texto.match(/```bash\n[\s\S]*?```/g) ?? [];
    const bash = bloques.join("\n");
    expect(bash, "el ejemplo debe llamar a la capacidad web-search").toContain("/api/agent-reach/web-search");
    expect(bash, "el ejemplo debe enviar la consulta q").toContain('"q"');
  });

  it("punto 3 · deja claras las reglas duras del área", () => {
    expect(texto).toMatch(/solo lectura|read-only|nunca escribe/i);
    expect(texto).toContain("NEED_LOGIN_BLOQUEADO");
    expect(texto).toMatch(/reddit/i);
    expect(texto).toMatch(/twitter|X\b/);
    expect(texto).toMatch(/sin claves|no pide claves|no usa claves/i);
  });

  it("punto 3 · explica la instalación correcta y advierte de PyPI", () => {
    expect(texto).toContain("uv tool install");
    expect(texto).toContain("PyPI");
  });

  it("punto 3 · nombra los códigos de error que el enjambre debe ramificar", () => {
    const codigos = [
      "NEED_SETUP", "NEED_LOGIN", "UPSTREAM_BROKEN", "TIMEOUT",
      "RATE_LIMITED", "PLATFORM_BLOCKED", "BUSY", "NOT_FOUND", "BAD_INPUT",
    ];
    for (const c of codigos) expect(texto, `falta el código ${c}`).toContain(c);
  });
});
