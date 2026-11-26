import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { CAPACIDADES, IDS_CAPACIDADES, resolverComando } from "../agent-reach-comandos";

// CAP1119 · la skill agent-reach se documenta con un ejemplo que el enjambre
// puede ejecutar. Estas pruebas atan el README a la interfaz pública real
// (`agent-reach-comandos.ts`): si la documentación se desvía del código o el
// ejemplo deja de resolver, la puerta lo ve.
const RAIZ = path.resolve(__dirname, "../../../..");
const README = path.join(RAIZ, ".agent", "skills", "agent-reach", "README.md");
const leer = (): string => readFileSync(README, "utf8");

/** Lee el bloque ```json de entradas de ejemplo del README. */
function ejemplos(): Record<string, Record<string, unknown>> {
  const bloque = leer().match(/```json\s*([\s\S]*?)```/);
  if (!bloque) throw new Error("El README no trae el bloque json de ejemplos.");
  const datos: unknown = JSON.parse(bloque[1]);
  if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
    throw new Error("El bloque de ejemplos no es un objeto JSON.");
  }
  return datos as Record<string, Record<string, unknown>>;
}

describe("CAP1119 · el README existe en la ruta que declara la tarea", () => {
  it("está en .agent/skills/agent-reach/README.md y tiene cuerpo", () => {
    expect(existsSync(README)).toBe(true);
    const texto = leer();
    expect(texto.length).toBeGreaterThan(1200);
    expect(texto).toContain("agent-reach");
  });
});

describe("CAP1119 · documenta el uso real del enjambre", () => {
  it("nombra las tres vías (CLI, proxy y herramientas de Aurora)", () => {
    const texto = leer();
    expect(texto).toContain("agent-reach web search");
    expect(texto).toContain("/api/agent-reach/");
    expect(texto).toContain("agent_reach_web_search");
  });

  it("fija la regla de solo lectura y el apagado de canales con sesión", () => {
    const texto = leer();
    expect(texto).toMatch(/solo lectura/i);
    expect(texto).toContain("NEED_LOGIN_BLOQUEADO");
    expect(texto).toContain("STARSEED_AGENT_REACH_LOGIN");
  });

  it("la instalación usa uv y avisa de PyPI, nunca pip ni npx como método", () => {
    const texto = leer();
    expect(texto).toContain("uv tool install https://github.com/Panniantong/Agent-Reach/releases/latest/download/agent-reach.zip");
    expect(texto).toContain("PyPI");
  });
});

describe("CAP1119 · el ejemplo del README es ejecutable", () => {
  it("cada capacidad del ejemplo existe y es pública (sin sesión)", () => {
    const entradas = ejemplos();
    expect(Object.keys(entradas).length).toBeGreaterThanOrEqual(4);
    for (const capacidad of Object.keys(entradas)) {
      expect(IDS_CAPACIDADES, `${capacidad} no es una capacidad real`).toContain(capacidad);
      const cap = (CAPACIDADES as Record<string, { conSesion?: boolean }>)[capacidad];
      expect(cap?.conSesion, `${capacidad} pide sesión`).toBeFalsy();
    }
  });

  it("resuelve a la orden real del CLI v1.6", () => {
    const esperado: Record<string, string[]> = {
      "web-search": ["web", "search", "geometría sagrada", "--limit", "3"],
      "read-web": ["read", "https://es.wikipedia.org/wiki/Vesica_piscis"],
      "youtube-transcript": ["youtube", "subtitle", "https://www.youtube.com/watch?v=aqz-KE-bpKQ"],
      "github-read": ["github", "read", "Panniantong/Agent-Reach"],
    };
    const entradas = ejemplos();
    for (const [capacidad, cuerpo] of Object.entries(entradas)) {
      const r = resolverComando(capacidad, cuerpo);
      expect(r.ok, `${capacidad}: ${r.ok ? "ok" : r.error}`).toBe(true);
      if (r.ok) expect(r.argv).toEqual(esperado[capacidad]);
    }
  });

  it("un canal con sesión sigue bloqueado (R1)", () => {
    const r = resolverComando("reddit", { url: "https://www.reddit.com/r/x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("NEED_LOGIN_BLOQUEADO");
  });
});
