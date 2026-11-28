import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { IDS_CAPACIDADES } from "@/lib/integrations/agent-reach-comandos";

// Puerta de la skill agent-reach (CAP1119). La objeción que reabrió la tarea tres veces decía
// solo «rechazada»; estas pruebas convierten cada reapertura en algo comprobable: la skill está
// documentada, su ejemplo es real y público, y el README no deriva del código que describe.

const RAIZ = process.cwd();
const SKILL = path.join(RAIZ, ".agent", "skills", "agent-reach");
const leer = (rel: string) => readFileSync(path.join(SKILL, rel), "utf8");

describe("reparación 1 · la skill queda documentada para el enjambre", () => {
  it("existe README.md y dice qué es, cuándo usarla y qué no hace", () => {
    expect(existsSync(path.join(SKILL, "README.md"))).toBe(true);
    const readme = leer("README.md");
    expect(readme.length).toBeGreaterThan(1200);
    for (const pista of ["Qué es y qué no", "Cuándo usarla", "solo lectura", "SKILL.md", "references/"]) {
      expect(readme).toContain(pista);
    }
  });

  it("la skill conserva su SKILL.md y sus referencias", () => {
    for (const rel of ["SKILL.md", "references/capabilities.md", "references/sessions.md", "references/maintenance.md"]) {
      expect(existsSync(path.join(SKILL, rel))).toBe(true);
    }
  });
});

describe("reparación 2 · el ejemplo es real y usa solo canales públicos (R1)", () => {
  const readme = leer("README.md");

  it("trae un ejemplo ejecutable del CLI, del proxy y del módulo puro", () => {
    expect(readme).toContain("agent-reach web search");
    expect(readme).toContain("agent-reach read https://example.org/nota");
    expect(readme).toContain("/api/agent-reach/web-search");
    expect(readme).toContain("resolverComando");
    expect(readme).toContain("leerSobre");
  });

  it("ningún bloque enseña a iniciar sesión, a pedir claves ni el paquete equivocado", () => {
    const bloques = [...readme.matchAll(/```[\s\S]*?```/g)].map((m) => m[0]);
    expect(bloques.length).toBeGreaterThanOrEqual(3);
    for (const bloque of bloques) {
      expect(bloque).not.toMatch(/agent-reach\s+login/);
      expect(bloque).not.toMatch(/agent-reach\s+add\s+(reddit|twitter|linkedin)/);
      expect(bloque).not.toMatch(/pip\s+install|npx\s+agent-reach/);
      expect(bloque).not.toMatch(/(password|contraseña|api[_-]?key|cookie)\s*[:=]\s*["'][^"']+/i);
    }
  });
});

describe("reparación 3 · la documentación no deriva del código", () => {
  it("los ids públicos documentados existen en la tabla del proxy", () => {
    const readme = leer("README.md");
    for (const id of ["web-search", "read-web", "youtube-transcript", "github-read", "health"]) {
      expect(IDS_CAPACIDADES).toContain(id);
      expect(readme).toContain(`\`${id}\``);
    }
  });

  it("las rutas y módulos citados existen en el repositorio", () => {
    const readme = leer("README.md");
    for (const rel of [
      "src/app/api/agent-reach/[capability]/route.ts",
      "src/lib/integrations/agent-reach-comandos.ts",
      "src/lib/__tests__/skill-agent-reach.test.ts",
    ]) {
      expect(readme).toContain(rel);
      expect(existsSync(path.join(RAIZ, rel))).toBe(true);
    }
  });
});
