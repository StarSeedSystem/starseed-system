/**
 * Agent-Reach en el flujo del enjambre (CAP1119).
 *
 * La tarea volvió «rechazada» dos veces desde la nube y otra ola la cerró sin
 * escribir nada («no la repito»). Esta puerta fija lo que la reparación exige:
 * el README de la skill existe, documenta la instalación canónica, usa los ids
 * de capacidad que el proxy acepta de verdad y deja constancia de la tarea.
 * Si alguien la cierra sin el archivo, o lo deja en esqueleto, esto falla.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { IDS_CAPACIDADES } from "@/lib/integrations/agent-reach-comandos";

const RUTA = path.join(process.cwd(), ".agent", "skills", "agent-reach", "README.md");
const leer = (): string => readFileSync(RUTA, "utf8");

const CAPACIDADES_DOCUMENTADAS = [
  "web-search",
  "read-web",
  "youtube-transcript",
  "github-read",
  "health",
] as const;

describe("agent-reach · README de la skill (CAP1119)", () => {
  it("existe y no es un esqueleto: la nube ya la rechazó por vacía", () => {
    const texto = leer();
    expect(texto.length).toBeGreaterThan(1200);
    for (const seccion of ["## Qué es", "## Instalación", "## Ejemplo de uso", "## Líneas rojas"]) {
      expect(texto).toContain(seccion);
    }
  });

  it("enseña la instalación canónica con uv y avisa de que PyPI no es este proyecto", () => {
    const texto = leer();
    expect(texto).toContain(
      "uv tool install https://github.com/Panniantong/Agent-Reach/releases/latest/download/agent-reach.zip",
    );
    expect(texto).toContain("PyPI");
    expect(texto).not.toContain("pip install agent-reach");
    expect(texto).not.toContain("npx agent-reach");
  });

  it("los ids del ejemplo son los que el proxy acepta (una sola fuente)", () => {
    const texto = leer();
    for (const id of CAPACIDADES_DOCUMENTADAS) {
      expect(IDS_CAPACIDADES).toContain(id);
      expect(texto).toContain(id);
    }
    expect(texto).toContain("/api/agent-reach/");
  });

  it("deja constancia de la tarea: otra ola no puede cerrarla sin el archivo", () => {
    const texto = leer();
    expect(texto).toContain("CAP1119");
    expect(texto).toContain(".agent/skills/agent-reach/README.md");
  });

  it("declara las líneas rojas: solo lectura, sin sesión y sin claves", () => {
    const texto = leer();
    expect(texto).toMatch(/solo lectura|sólo lectura/i);
    expect(texto).toContain("NEED_LOGIN_BLOQUEADO");
    expect(texto).toMatch(/sin claves|no pide claves|ninguna clave/i);
  });
});
