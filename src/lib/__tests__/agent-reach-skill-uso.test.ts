import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  CAPACIDADES,
  IDS_CAPACIDADES,
  HINT_INSTALACION,
  type CapacidadId,
} from "../integrations/agent-reach-comandos";

// Puerta de la guía de la skill `agent-reach` (CAP1119). No prueba el CLI (eso ya lo
// hacen agent-reach-comandos y agent-reach-cliente): prueba que la GUÍA que lee el
// enjambre no miente y no vuelve a caer en los rechazos que la devolvieron tres veces.

const RUTA_README = join(process.cwd(), ".agent", "skills", "agent-reach", "README.md");
const leerGuia = () => readFileSync(RUTA_README, "utf8");

// Capacidades públicas que la guía debe ofrecer tal cual las conoce el proxy.
const CANONICAS = ["web-search", "read-web", "youtube-transcript", "github-read", "health"] as const;

describe("skill agent-reach · reparación CAP1119 (TDD de la objeción)", () => {
  it("objeción 2026-11-23: el README existe, tiene título y no es un esqueleto vacío", () => {
    expect(existsSync(RUTA_README)).toBe(true);
    const guia = leerGuia();
    expect(guia).toMatch(/^#\s.+/m);
    expect(guia.length).toBeGreaterThan(1500);
    expect(guia).toContain("Panniantong/Agent-Reach");
    expect(guia).toContain("MIT");
  });

  it("objeción 2026-11-23 (rechazada en la nube): el uso coincide con el código real", () => {
    const guia = leerGuia();
    for (const cap of CANONICAS) {
      expect(IDS_CAPACIDADES).toContain(cap);
      expect(CAPACIDADES[cap as CapacidadId]).toBeTruthy();
      expect(guia).toContain(`\`${cap}\``);
    }
    expect(guia).toContain("/api/agent-reach/");
    expect(guia).toContain("src/lib/integrations/agent-reach-comandos.ts");
  });

  it("objeción 2026-11-24: cierra un alcance único (no repite una ola ni promete sesión)", () => {
    const guia = leerGuia();
    expect(guia).toContain("architecture/repos-libreria-1025.md");
    expect(guia).toContain("v1.6.0");
    expect(guia).toContain("Solo lectura");
    expect(guia).toContain("NEED_LOGIN_BLOQUEADO");
    expect(guia).toContain("Reddit");
    expect(guia).toContain("Twitter");
  });
});

describe("skill agent-reach · ejemplo de uso ejecutable", () => {
  const guia = leerGuia();

  it("trae ejemplos con cuerpo JSON para buscar, leer y comprobar salud", () => {
    expect(guia).toContain('{"q"');
    expect(guia).toContain('{"url"');
    expect(guia).toContain("GET");
    expect(guia).toContain("/api/agent-reach/health");
    expect(guia).toContain("Authorization");
  });

  it("la instalación es la buena y avisa de PyPI/pip/npx", () => {
    const url = "uv tool install https://github.com/Panniantong/Agent-Reach/releases/latest/download/agent-reach.zip";
    expect(HINT_INSTALACION).toContain(url);
    expect(guia).toContain(url);
    expect(guia).toMatch(/PyPI[\s\S]{0,120}no[\s\S]{0,40}(pip|npx)/i);
    expect(guia).not.toMatch(/^\s*(pip install|npx)\s+agent-reach/m);
  });

  it("no filtra secretos ni rutas del disco", () => {
    for (const patron of [/sk-[A-Za-z0-9]{8,}/, /nvapi-[A-Za-z0-9]+/, /AIza[0-9A-Za-z_-]{10,}/, /hf_[A-Za-z0-9]{10,}/]) {
      expect(guia).not.toMatch(patron);
    }
    expect(guia).not.toContain("/Users/");
  });
});
