// Pruebas puras del diagrama 3D (architecture/diagramas.md §3.5) con los ejemplos MIT de
// vendor/habilidades/diagram-design/assets/. Sin red ni navegador: entrada → salida.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { escena3d, estructuraDeSvg } from "../diagrama-3d";

const ejemplo = (nombre: string) =>
  readFileSync(path.join(process.cwd(), "vendor/habilidades/diagram-design/assets", nombre), "utf8");

describe("estructuraDeSvg", () => {
  const capasHtml = ejemplo("example-layers.html");
  const arquitecturaHtml = ejemplo("example-architecture.html");

  it("saca las capas de una pila y las apila de abajo arriba", () => {
    const e = estructuraDeSvg(capasHtml);
    expect(e.ancho).toBe(1000);
    expect(e.alto).toBe(500);
    expect(e.capas.length).toBeGreaterThanOrEqual(4);
    expect(e.capas.every((c) => c.nombre.length > 0)).toBe(true);
    const s = escena3d(e, "capas");
    expect(s.nodos.length).toBe(e.capas.length);
    expect(s.nodos.every((n) => n.billboard)).toBe(true);
    const zs = s.nodos.map((n) => n.pos[2]);
    expect(zs).toEqual([...zs].sort((a, b) => a - b));
    expect(new Set(zs).size).toBe(e.capas.length);
  });

  it("saca nodos, aristas con marcador y la zona de capa del ejemplo de arquitectura", () => {
    const e = estructuraDeSvg(arquitecturaHtml);
    const textos = e.nodos.map((n) => n.texto);
    for (const nombre of ["Reader", "Cloudflare", "Astro Origin", "MDX Bundle", "Content CMS"]) {
      expect(textos.some((t) => t.includes(nombre))).toBe(true);
    }
    expect(e.aristas.length).toBeGreaterThanOrEqual(4);
    for (const a of e.aristas) {
      expect(e.nodos.some((n) => n.id === a.desde)).toBe(true);
      expect(e.nodos.some((n) => n.id === a.hasta)).toBe(true);
    }
    expect(e.capas.some((c) => c.nombre.includes("CONTENT"))).toBe(true);
  });

  it("admite grupos g con id de capa, círculos y textos sueltos", () => {
    const html =
      '<svg viewBox="0 0 200 100"><g id="capa-base"><rect x="10" y="10" width="40" height="24"/>' +
      '<text x="30" y="28" font-size="12">Base</text></g><circle cx="120" cy="50" r="10"/>' +
      '<text x="120" y="50" font-size="14">Centro</text><text x="20" y="90" font-size="14">Suelto</text></svg>';
    const e = estructuraDeSvg(html);
    const base = e.capas.find((c) => c.id === "capa-base");
    expect(base).toBeDefined();
    expect(base?.nodos.length).toBe(1);
    expect(e.nodos.some((n) => n.tipo === "circulo" && n.texto === "Centro")).toBe(true);
    expect(e.nodos.some((n) => n.tipo === "texto" && n.texto === "Suelto")).toBe(true);
  });

  it("coloca el grafo en 3D sin solaparse y con los textos de cara a la cámara", () => {
    const e = estructuraDeSvg(arquitecturaHtml);
    const s = escena3d(e, "grafo");
    expect(s.nodos.length).toBe(e.nodos.length);
    expect(s.aristas.length).toBe(e.aristas.length);
    expect(s.nodos.every((n) => n.billboard === (n.texto.trim().length > 0))).toBe(true);
    for (let i = 0; i < s.nodos.length; i += 1) {
      for (let j = i + 1; j < s.nodos.length; j += 1) {
        const a = s.nodos[i], b = s.nodos[j];
        const d = Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]);
        const radios = (Math.hypot(...a.tamano) + Math.hypot(...b.tamano)) / 2;
        expect(d).toBeGreaterThan(radios * 0.9);
      }
    }
  });

  it("separa más el despiece que la planta y es determinista", () => {
    const e = estructuraDeSvg(capasHtml);
    const despiece = escena3d(e, "despiece");
    const planta = escena3d(e, "planta");
    expect(despiece.separacion).toBeGreaterThan(planta.separacion);
    expect(despiece.nodos.length).toBe(e.nodos.length);
    expect(despiece.nodos.every((n) => n.tamano[2] > 0)).toBe(true);
    expect(planta.nodos.every((n) => n.tamano[2] === 0.05)).toBe(true);
    expect(escena3d(e, "despiece")).toEqual(despiece);
  });

  it("no inventa nodos con un SVG vacío", () => {
    const e = estructuraDeSvg('<svg viewBox="0 0 10 10"></svg>');
    expect(e.nodos).toEqual([]);
    expect(e.aristas).toEqual([]);
    expect(escena3d(e, "grafo").nodos).toEqual([]);
    expect(escena3d(e, "capas").nodos).toEqual([]);
  });
});
