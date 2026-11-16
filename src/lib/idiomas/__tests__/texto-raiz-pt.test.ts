import { describe, expect, it } from "vitest";
import { cargarCatalogo, cargarFuente, cargarUnidades, coberturaDe, DIR, rechazo } from "../../../../scripts/idiomas/comun.mjs";

const fuente = cargarFuente(), unidades = cargarUnidades();

describe("traducción raiz: app/layout.tsx", () => {
  const catalogoPt = cargarCatalogo("pt");
  const unidadRaiz = unidades.raiz;

  it("la unidad raiz existe con prefijo app/layout.tsx", () => {
    expect(unidadRaiz).toBeDefined();
    expect(unidadRaiz.prefijos).toContain("app/layout.tsx");
  });

  it('"Saltar al contenido" se traduce a "Saltar para o conteúdo"', () => {
    expect(catalogoPt.entradas["Saltar al contenido"]).toBe("Saltar para o conteúdo");
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
      "Saltar para o conteúdo",
      "Democracia direta, criação coletiva e inteligência própria, aberta e gratuita.",
      "StarSeed OS · sistema operacional social descentralizado",
      "Sistema operacional social para a regeneração global",
      "StarSeed",
    ];
    for (const i of entradas) {
      if (!catalogoPt.entradas[i]) {
        throw new Error(`Falta entrada: ${i}`);
      }
      expect(rechazo(i, catalogoPt.entradas[i])).toBeNull();
    }
  });
});