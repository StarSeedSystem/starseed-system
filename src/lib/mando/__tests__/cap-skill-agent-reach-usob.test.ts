import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { cambioAutomatico, reencolar, type TareaAnalizar } from "@/lib/mando/reintento-inteligente";

const RAÍZ = path.resolve(__dirname, "../../../..");
const RUTA_REAL = ".agent/skills/agent-reach/README.md";
const leer = (relativa: string): string => readFileSync(path.join(RAÍZ, relativa), "utf8");
const lineasIgnore = (): string[] => leer(".gitignore").split("\n").map((l) => l.trim());

describe("CAP-skill-agent-reach-usob: reparación de la skill agent-reach", () => {
  it("objeción 1 (2026-11-23 02:26:39): el README declarado deja de estar ignorado y existe", () => {
    const ignore = lineasIgnore();
    const cadena = [".agent/", ".agent/*", "!.agent/", "!.agent/skills/", ".agent/skills/*", "!.agent/skills/agent-reach/"];
    for (const patron of cadena) expect(ignore.includes(patron), `falta ${patron}`).toBe(true);
    const lineas = leer(RUTA_REAL).split("\n");
    expect(lineas.length).toBeGreaterThan(50);
    expect(lineas.length).toBeLessThanOrEqual(120);
    expect(leer(RUTA_REAL)).toContain("# agent-reach");
  });

  it("objeción 2 (2026-11-23 16:21:16): el ejemplo es ejecutable sin sesión, sin claves y en solo lectura", () => {
    const readme = leer(RUTA_REAL);
    const necesarios = [
      "agent-reach read <url>",
      "agent-reach github search",
      "agent-reach youtube subtitle",
      "gratis",
      "429",
      "402",
      "solo lectura",
      "xiaohongshu",
      "no se activan",
    ];
    for (const texto of necesarios) expect(readme.includes(texto), `falta «${texto}»`).toBe(true);
    expect(/sk-[A-Za-z0-9]{12,}/.test(readme)).toBe(false);
  });

  it("objeción 3 (2026-11-24 23:21:02): una rechazada cerrada se repara con sucesora, no se repite", () => {
    const nota = "otra ola ya la cerró (rechazada según progreso.json) → no la repito";
    const original: TareaAnalizar = {
      id: "CAP-skill-agent-reach-uso",
      ola: "CAP1119",
      archivos: [RUTA_REAL],
      estado: "rechazada",
      nota,
      modelo: "nvidia/nemotron-3-ultra",
      revisor: "bloqueante",
    };
    const cambio = cambioAutomatico(original, { eventos: nota });
    expect(cambio).toContain("Corrige cada punto de esta objeción literal y añade una prueba para cada uno");
    expect(cambio).toContain(nota);
    const sucesora = reencolar(original, cambio, { [original.id]: { estado: "rechazada" } }, ["codex/gpt-5.6-sol"]);
    expect(sucesora.id).toBe("CAP-skill-agent-reach-usob");
    expect(sucesora.id).not.toBe(original.id);
    expect(sucesora.prompt).toContain(nota);
    expect(sucesora).not.toHaveProperty("revisor");
    expect(sucesora.modelo).not.toBe(original.modelo);
    expect(leer(RUTA_REAL)).toContain("progreso.json");
    expect(leer(RUTA_REAL)).toContain("no la repito");
  });
});
