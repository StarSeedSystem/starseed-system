import { describe, it, expect } from "vitest";
import {
  RECURSOS_ARTCRAFT,
  RECURSOS_NAVEGADOR,
  catalogoDeclarado,
  disponibleEn,
  recomendarPara,
} from "@/lib/agentes/taller";

// Vigila el contrato §4.1: tres MCP del OS por la pasarela ArtCraft, sin rutas
// absolutas ni red, con requisitos que son NOMBRES de condiciones y no claves.

const IDS_ARTCRAFT = [
  "os:artcraft-figcraft",
  "os:artcraft-gridcraft",
  "os:artcraft-deckcraft",
];

/** Forma de clave: minúsculas/guiones, prefijos conocidos, `=` o cadenas largas. */
function pareceClave(texto: string): boolean {
  if (/[=]/.test(texto)) return true;
  if (/(sk-|gsk_|nvapi-)/.test(texto)) return true;
  return texto.length > 48;
}

describe("RECURSOS_ARTCRAFT", () => {
  it("declara las tres vías con identificadores únicos y con prefijo os:", () => {
    expect(RECURSOS_ARTCRAFT).toHaveLength(3);
    const ids = RECURSOS_ARTCRAFT.map((r) => r.id);
    expect(ids).toEqual(IDS_ARTCRAFT);
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) expect(id.startsWith("os:")).toBe(true);
  });

  it("son de tipo mcp y de origen os", () => {
    for (const r of RECURSOS_ARTCRAFT) {
      expect(r.tipo).toBe("mcp");
      expect(r.origen).toBe("os");
    }
  });

  it("no lleva en `requiere` nada con forma de clave, solo nombres de condiciones", () => {
    for (const r of RECURSOS_ARTCRAFT) {
      expect(r.requiere.length).toBeGreaterThan(0);
      for (const condicion of r.requiere) {
        expect(pareceClave(condicion)).toBe(false);
        expect(condicion).toMatch(/^[A-Z][A-Z0-9_]+$/);
      }
    }
  });

  it("está disponible en la Mac y en la nube", () => {
    for (const r of RECURSOS_ARTCRAFT) {
      expect(disponibleEn(r, "mac")).toBe(true);
      expect(disponibleEn(r, "nube")).toBe(true);
    }
  });

  it("entra entero en el catálogo declarado", () => {
    const ids = catalogoDeclarado().map((r) => r.id);
    for (const id of IDS_ARTCRAFT) expect(ids).toContain(id);
  });

  it("su ruta pasa por la pasarela y apunta al contrato", () => {
    for (const r of RECURSOS_ARTCRAFT) {
      expect(r.ruta).toMatch(/^\/api\/artcraft\/[a-z]+$/);
      expect(r.docs).toBe("architecture/artcraft-y-rare.md");
      expect(r.descripcion).toContain("pasarela ArtCraft");
    }
  });

  it("usa etiquetas propias, distintas de las del navegador", () => {
    const etiquetasNavegador = new Set(
      RECURSOS_NAVEGADOR.flatMap((r) => r.etiquetas.map((e) => e.toLowerCase())),
    );
    for (const r of RECURSOS_ARTCRAFT) {
      for (const etiqueta of r.etiquetas) {
        expect(etiquetasNavegador.has(etiqueta.toLowerCase())).toBe(false);
      }
    }
  });
});

describe("recomendarPara con ArtCraft", () => {
  it("ofrece DeckCraft para hacer una presentación en pptx", () => {
    const salida = recomendarPara(catalogoDeclarado(), "hacer una presentación en pptx");
    expect(salida.map((r) => r.id)).toContain("os:artcraft-deckcraft");
  });

  it("ofrece GridCraft para limpiar una hoja de cálculo", () => {
    const salida = recomendarPara(catalogoDeclarado(), "limpiar una hoja de cálculo");
    expect(salida.map((r) => r.id)).toContain("os:artcraft-gridcraft");
  });
});
