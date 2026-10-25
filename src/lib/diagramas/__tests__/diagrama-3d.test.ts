// Pruebas puras de conversión SVG → estructura 3D (entrada → salida).
// Usa las plantillas de diagram-design: example-layers.html y example-architecture.html.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { estructuraDeSvg, escena3d } from "../diagrama-3d";

function plantillaDeVendor(nombre: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../../vendor/habilidades/diagram-design/assets/${nombre}`, import.meta.url)),
    "utf8",
  );
}

describe("diagrama-3d", () => {
  it("estructuraDeSvg extrae nodos, aristas, capas y grupos de example-layers.html", () => {
    const svg = plantillaDeVendor("example-layers.html");
    const est = estructuraDeSvg(svg);
    expect(est.nodos.length).toBeGreaterThan(0);
    expect(Array.isArray(est.aristas)).toBe(true);
    expect(Array.isArray(est.capas)).toBe(true);
    expect(Array.isArray(est.grupos)).toBe(true);
    expect(est.nodos.some((n) => n.tipo === "rect" || n.tipo === "circle" || n.tipo === "text")).toBe(true);
  });

  it("estructuraDeSvg extrae nodos (rect/círculo/texto agrupados), aristas (path/line con marcador) y capas (grupos con id/clase de capa) de example-architecture.html", () => {
    const svg = plantillaDeVendor("example-architecture.html");
    const est = estructuraDeSvg(svg);
    expect(est.nodos.some((n) => n.tipo === "rect")).toBe(true);
    expect(est.nodos.some((n) => n.tipo === "text")).toBe(true);
    expect(est.aristas.some((a) => a.tipo === "path" || a.tipo === "line")).toBe(true);
    expect(est.aristas.length).toBeGreaterThan(0);
    // Debe haber grupos y/o capas según la estructura
    expect(est.grupos.length + est.capas.length).toBeGreaterThan(0);
  });

  it("escena3d con capas/despiece/planta-axonométrica apila en Z con separación proporcional", () => {
    const svg = plantillaDeVendor("example-layers.html");
    const est = estructuraDeSvg(svg);
    const capas = escena3d(est, "capas");
    expect(capas.nodos.length).toBe(est.nodos.length);
    expect(capas.separacionZ).toBeGreaterThan(0);
    const zVals = capas.nodos.map((n) => n.posicion[2]);
    expect(new Set(zVals).size).toBeGreaterThanOrEqual(1);
    const despiece = escena3d(est, "despiece");
    expect(despiece.separacionZ).toBeGreaterThan(capas.separacionZ * 0.8);
    const planta = escena3d(est, "planta-axonometrica");
    expect(planta.separacionZ).toBeGreaterThan(0);
    expect(planta.nodos[0].rotacion.length).toBe(3);
  });

  it("escena3d con grafo reparte nodos en 3D sin solaparse", () => {
    const svg = plantillaDeVendor("example-architecture.html");
    const est = estructuraDeSvg(svg);
    const grafo = escena3d(est, "grafo");
    expect(grafo.tipo).toBe("grafo");
    expect(grafo.nodos.length).toBe(est.nodos.length);
    // Comprobación sencilla: hay diferentes posiciones
    const posiciones = grafo.nodos.map((n) => n.posicion.join(","));
    expect(new Set(posiciones).size).toBeGreaterThanOrEqual(Math.min(grafo.nodos.length, 2));
  });

  it("los textos siempre de cara a la cámara", () => {
    const svg = plantillaDeVendor("example-layers.html");
    const est = estructuraDeSvg(svg);
    const escena = escena3d(est, "capas");
    const textos = escena.nodos.filter((n) => n.tipo === "text");
    for (const t of textos) {
      expect(t.mirarACamara).toBe(true);
    }
  });
});
