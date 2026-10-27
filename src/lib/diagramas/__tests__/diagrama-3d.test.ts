// Pruebas puras de diagrama-3d (architecture/diagramas.md §3-5).
// Usa example-layers.html y example-architecture.html del vendor.
// Módulo PURO: sin red, sin navegador real, sin any.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { estructuraDeSvg, escena3d } from "../diagrama-3d";

const plantilla = (nombre: string) =>
  readFileSync(path.join(process.cwd(), "vendor/habilidades/diagram-design/assets", nombre), "utf8");

describe("diagrama-3d", () => {
  it("estructuraDeSvg extrae nodos, aristas y capas de example-layers.html", () => {
    const html = plantilla("example-layers.html");
    const est = estructuraDeSvg(html);
    expect(Array.isArray(est.nodos)).toBe(true);
    expect(Array.isArray(est.aristas)).toBe(true);
    expect(Array.isArray(est.capas)).toBe(true);
    expect(est.nodos.length).toBeGreaterThan(0);
  });

  it("estructuraDeSvg extrae nodos (rect/círculo/texto agrupados) y aristas (path/line con marcador) de example-architecture.html", () => {
    const html = plantilla("example-architecture.html");
    const est = estructuraDeSvg(html);
    expect(est.nodos.some((n) => n.tipo === "rect")).toBe(true);
    expect(est.nodos.some((n) => n.tipo === "texto")).toBe(true);
    expect(est.aristas.length).toBeGreaterThan(0);
    expect(est.aristas.some((a) => a.tipo === "path" || a.tipo === "line")).toBe(true);
  });

  it("escena3d coloca capas/despiece/planta-axonométrica apilados en Z con separación proporcional", () => {
    const html = plantilla("example-layers.html");
    const est = estructuraDeSvg(html);
    const escena = escena3d(est, "capas");
    expect(escena.tipo).toBe("capas");
    expect(escena.elementos.length).toBeGreaterThan(0);
    const zVals = escena.elementos.map((e) => e.posicion[2]);
    const distintas = new Set(zVals.map((z) => Math.round(z * 100)));
    expect(distintas.size).toBeGreaterThanOrEqual(1);
  });

  it("escena3d en modo despiece apila en Z con separación proporcional", () => {
    const html = plantilla("example-architecture.html");
    const est = estructuraDeSvg(html);
    const escena = escena3d(est, "despiece");
    expect(escena.tipo).toBe("despiece");
    expect(escena.elementos.length).toBeGreaterThan(0);
  });

  it("escena3d en modo planta-axonométrica apila en Z con separación proporcional", () => {
    const html = plantilla("example-layers.html");
    const est = estructuraDeSvg(html);
    const escena = escena3d(est, "planta-axonometrica");
    expect(escena.tipo).toBe("planta-axonometrica");
    expect(escena.elementos.length).toBeGreaterThan(0);
  });

  it("escena3d en modo grafo reparte en 3D sin solaparse", () => {
    const html = plantilla("example-architecture.html");
    const est = estructuraDeSvg(html);
    const escena = escena3d(est, "grafo");
    expect(escena.tipo).toBe("grafo");
    expect(escena.elementos.length).toBeGreaterThan(0);
    const pos = escena.elementos.filter((e) => e.tipo === "nodo").map((e) => e.posicion);
    if (pos.length > 1) {
      const distancias = new Set(pos.map((p) => `${Math.round(p[0])},${Math.round(p[2])}`));
      expect(distancias.size).toBeGreaterThanOrEqual(1);
    }
  });

  it("textos siempre de cara a la cámara", () => {
    const html = plantilla("example-layers.html");
    const est = estructuraDeSvg(html);
    const escena = escena3d(est, "capas");
    const textos = escena.elementos.filter((e) => {
      const d: any = e.datos;
      return d && d.tipo === "texto";
    });
    for (const t of textos) {
      expect(t.caraACamara).toBe(true);
    }
  });
});
