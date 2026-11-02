import { describe, it, expect } from "vitest";
import {
  RECURSOS_ARTCRAFT,
  RECURSOS_NAVEGADOR,
  catalogoDeclarado,
  disponibleEn,
  recomendarPara,
} from "@/lib/agentes/taller";

const IDS_ARTCRAFT = [
  "os:artcraft-figcraft",
  "os:artcraft-gridcraft",
  "os:artcraft-deckcraft",
];

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

  it("no lleva dentro nada con forma de clave, tampoco fuera de `requiere`", () => {
    const patrones = ["sk-", "gsk_", "nvapi-", "Bearer", "-----BEGIN"];
    const texto = JSON.stringify(RECURSOS_ARTCRAFT);
    for (const patron of patrones) expect(texto).not.toContain(patron);
  });

  it("cubre las tres apps de la pasarela con una ruta exacta por app", () => {
    const rutas = RECURSOS_ARTCRAFT.map((r) => r.ruta).sort();
    expect(rutas).toEqual([
      "/api/artcraft/deckcraft",
      "/api/artcraft/figcraft",
      "/api/artcraft/gridcraft",
    ]);
  });

  it("su ruta pasa por la pasarela y apunta al contrato", () => {
    for (const r of RECURSOS_ARTCRAFT) {
      expect(r.ruta).toMatch(/^\/api\/artcraft\/[a-z]+$/);
      expect(r.docs).toBe("architecture/artcraft-y-rare.md");
      expect(r.descripcion).toContain("pasarela ArtCraft");
    }
  });

  it("ningún requiere tiene forma de clave", () => {
    const PATRONES_CLAVE = ["sk-", "gsk_", "nvapi-", "Bearer", "/Users/"];
    const texto = JSON.stringify(RECURSOS_ARTCRAFT);
    for (const patron of PATRONES_CLAVE) expect(texto).not.toContain(patron);
    for (const r of RECURSOS_ARTCRAFT) {
      for (const req of r.requiere) {
        expect(req).not.toMatch(/^(sk-|gsk_|nvapi-|Bearer)/);
        expect(req).not.toContain("/Users/");
      }
    }
  });

  it("requiere solo nombres de condiciones (NEURONA_CON_PASARELA_ARTCRAFT)", () => {
    for (const r of RECURSOS_ARTCRAFT) {
      expect(r.requiere).toEqual(["NEURONA_CON_PASARELA_ARTCRAFT"]);
    }
  });

  it("descripcion menciona pasarela ArtCraft, directorio de trabajo y sin red", () => {
    for (const r of RECURSOS_ARTCRAFT) {
      expect(r.descripcion).toContain("pasarela ArtCraft");
      expect(r.descripcion).toContain("directorio de trabajo");
      expect(r.descripcion).toContain("sin red");
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
