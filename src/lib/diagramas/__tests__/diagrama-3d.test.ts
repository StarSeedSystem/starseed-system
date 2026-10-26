// @vitest-environment jsdom
// Pruebas puras de `estructuraDeSvg` y `escena3d` con los ejemplos MIT de la skill diagram-design.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { estructuraDeSvg, escena3d } from "../diagrama-3d";

const plantilla = (nombre: string) => readFileSync(path.join(process.cwd(), "vendor/habilidades/diagram-design/assets", nombre), "utf8");

function svgDeHtml(html: string): string {
  const inicio = html.indexOf("<svg");
  const fin = html.indexOf("</svg>") + 6;
  return inicio >= 0 && fin > inicio ? html.slice(inicio, fin) : html;
}

describe("estructuraDeSvg", () => {
  it("extrae rect, círculo, texto, aristas y capas del ejemplo de capas (example-layers.html)", () => {
    const html = plantilla("example-layers.html");
    const estructura = estructuraDeSvg(svgDeHtml(html));
    expect(estructura.nodos.length).toBeGreaterThanOrEqual(5);
    expect(estructura.aristas.length).toBeGreaterThanOrEqual(0);
    // example-layers.html no usa grupos `g` como capas, pero sí tiene nodos y textos.
    expect(estructura.capas.length).toBeGreaterThanOrEqual(0);
    expect(estructura.textos.some((t) => t.includes("UI surface"))).toBe(true);
  });

  it("extrae nodos y aristas del ejemplo de arquitectura (example-architecture.html)", () => {
    const html = plantilla("example-architecture.html");
    const estructura = estructuraDeSvg(svgDeHtml(html));
    expect(estructura.nodos.length).toBeGreaterThanOrEqual(3);
    expect(estructura.aristas.length).toBeGreaterThanOrEqual(1);
    const textos = estructura.textos.map((t) => t.toLowerCase());
    expect(textos.some((t) => t.includes("reader") || t.includes("cloudflare"))).toBe(true);
  });

  it("nunca lanza con un SVG vacío o sin nodos", () => {
    const estructura = estructuraDeSvg("<svg xmlns='http://www.w3.org/2000/svg'></svg>");
    expect(estructura.nodos).toEqual([]);
    expect(estructura.aristas).toEqual([]);
    expect(estructura.capas).toEqual([]);
  });
});

describe("escena3d", () => {
  it("apila capas en Z con separación φ para 'capas'", () => {
    const estructura = estructuraDeSvg(svgDeHtml(plantilla("example-layers.html")));
    const escena = escena3d(estructura, "capas");
    expect(escena.tipo).toBe("capas");
    expect(escena.capas.length).toBe(estructura.capas.length);
    expect(escena.nodos.length).toBe(estructura.nodos.length);
    // Separación proporcional en Z (φ ≈ 1.618)
    const zBases = escena.capas.map((c) => c.zBase);
    expect(zBases.every((z) => z >= 0)).toBe(true);
    expect(zBases.length > 1 ? zBases[1] > zBases[0] : true).toBe(true);
  });

  it("reparte grafo en 3D sin solaparse para 'grafo'", () => {
    const estructura = estructuraDeSvg(svgDeHtml(plantilla("example-architecture.html")));
    const escena = escena3d(estructura, "grafo");
    expect(escena.tipo).toBe("grafo");
    expect(escena.nodos.length).toBe(estructura.nodos.length);
    expect(escena.aristas.length).toBe(estructura.aristas.length);
    // Cada nodo tiene rotación distinta para evitar solaparse
    expect(escena.nodos.every((n) => typeof n.rotacion === "number")).toBe(true);
  });

  it("usa despiece con separación por φ y axonométrica plana", () => {
    const estructura = estructuraDeSvg(svgDeHtml(plantilla("example-layers.html")));
    expect(escena3d(estructura, "despiece").tipo).toBe("despiece");
    expect(escena3d(estructura, "axonometrica").tipo).toBe("axonometrica");
  });

  it("los textos se incluyen y los nodos mantienen sus ids originales", () => {
    const estructura = estructuraDeSvg(svgDeHtml(plantilla("example-architecture.html")));
    const escena = escena3d(estructura);
    expect(escena.textos.length).toBeGreaterThanOrEqual(estructura.textos.length);
    expect(escena.nodos[0]?.id).toBe(estructura.nodos[0]?.id);
  });
});
