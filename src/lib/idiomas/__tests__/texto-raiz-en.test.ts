import { describe, expect, it } from "vitest";
import { cargarCatalogo, cargarFuente, cargarUnidades, coberturaDe, DIR, rechazo } from "../../../../scripts/idiomas/comun.mjs";

const fuente = cargarFuente(), unidades = cargarUnidades();

describe("traducción raiz: app/layout.tsx", () => {
  const catalogoEn = cargarCatalogo("en");
  const unidadRaiz = unidades.raiz;

  it("la unidad raiz existe con prefijo app/layout.tsx", () => {
    expect(unidadRaiz).toBeDefined();
    expect(unidadRaiz.prefijos).toContain("app/layout.tsx");
  });

  it('"Saltar al contenido" se traduce a "Skip to content"', () => {
    expect(catalogoEn.entradas["Saltar al contenido"]).toBe("Skip to content");
  });

  it("las entradas nuevas pasan rechazo(fuente, traduccion) === null", () => {
    const entradas = [
      "Saltar al contenido",
      "Democracia directa, creación colectiva e inteligencia propia, abierta y gratuita.",
      "StarSeed OS · sistema operativo social descentralizado",
      "Sistema operativo social para la regeneración global",
      "StarSeed System",
    ];
    const traducciones = [
      "Skip to content",
      "Direct democracy, collective creation and own intelligence, open and free.",
      "StarSeed OS · decentralized social operating system",
      "Social operating system for global regeneration",
      "StarSeed",
    ];
    for (const i of entradas) {
      if (!catalogoEn.entradas[i]) {
        throw new Error(`Falta entrada: ${i}`);
      }
      expect(rechazo(i, catalogoEn.entradas[i])).toBeNull();
    }
  });
});