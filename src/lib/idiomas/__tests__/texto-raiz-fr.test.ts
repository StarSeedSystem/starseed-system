import { describe, expect, it } from "vitest";
import { cargarCatalogo, cargarFuente, cargarUnidades, rechazo } from "../../../../scripts/idiomas/comun.mjs";

const fuente = cargarFuente(), unidades = cargarUnidades();

describe("traducción raiz: app/layout.tsx", () => {
  const catalogoFr = cargarCatalogo("fr");
  const unidadRaiz = unidades.raiz;

  it("la unidad raiz existe con prefijo app/layout.tsx", () => {
    expect(unidadRaiz).toBeDefined();
    expect(unidadRaiz.prefijos).toContain("app/layout.tsx");
  });

  it('"Saltar al contenido" se traduce a "Aller au contenu"', () => {
    expect(catalogoFr.entradas["Saltar al contenido"]).toBe("Aller au contenu");
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
      "Aller au contenu",
      "Démocratie directe, création collective et intelligence propre, ouverte et gratuite.",
      "StarSeed OS · système d'exploitation social décentralisé",
      "Système d'exploitation social pour la régénération mondiale",
      "StarSeed",
    ];
    for (let i = 0; i < entradas.length; i++) {
      const e = entradas[i];
      const t = traducciones[i];
      if (!catalogoFr.entradas[e]) {
        throw new Error(`Falta entrada: ${e}`);
      }
      expect(catalogoFr.entradas[e]).toBe(t);
      expect(rechazo(e, catalogoFr.entradas[e])).toBeNull();
    }
  });
});
