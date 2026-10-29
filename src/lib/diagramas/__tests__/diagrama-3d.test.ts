// Pruebas puras del paso SVG → escena 3D/XR (sin DOM, red ni disco).
// Ejemplos tomados de la skill MIT diagram-design
// (vendor/habilidades/diagram-design/assets/example-layers.html y
// example-architecture.html). Contrato: architecture/diagramas.md §3-4.

import { describe, it, expect } from "vitest";
import { estructuraDeSvg, escena3d } from "../diagrama-3d";

const CAPAS = `<svg viewBox="0 0 1000 500" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#f5f5f5"/>
  <rect x="120" y="80" width="840" height="64" fill="#ffffff"/>
  <text x="140" y="116" font-size="8">L5</text>
  <text x="260" y="118" font-size="16" font-weight="600">UI surface</text>
  <rect x="120" y="144" width="840" height="64" fill="rgba(191,69,32,0.08)"/>
  <rect x="120" y="144" width="840" height="64" fill="none" stroke="#bf4520"/>
  <text x="140" y="180" font-size="8">L4</text>
  <text x="260" y="182" font-size="16" font-weight="600">Agent harness</text>
  <rect x="120" y="208" width="840" height="64" fill="#f5f5f5"/>
  <text x="140" y="244" font-size="8">L3</text>
  <text x="260" y="246" font-size="16" font-weight="600">Prompt layer</text>
</svg>`;

const ARQUITECTURA = `<svg viewBox="0 0 1000 480" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#f5f5f5"/>
  <defs><marker id="arrow"><polygon points="0 0, 8 3, 0 6"/></marker></defs>
  <line x1="168" y1="272" x2="220" y2="272" stroke="#2e5aa8" marker-end="url(#arrow)"/>
  <line x1="364" y1="272" x2="416" y2="272" stroke="#bf4520" marker-end="url(#arrow)"/>
  <path d="M 576,260 H 692 Q 700,260 700,252 V 224" fill="none" marker-end="url(#arrow)"/>
  <path d="M 576,284 H 692 Q 700,284 700,292 V 320" fill="none" marker-end="url(#arrow)"/>
  <rect x="40" y="240" width="128" height="64" fill="#f5f5f5"/>
  <text x="104" y="276" font-size="12">Reader</text>
  <rect x="220" y="240" width="144" height="64" fill="#f5f5f5"/>
  <text x="292" y="276" font-size="12">Cloudflare</text>
  <rect x="416" y="240" width="160" height="64" fill="rgba(191,69,32,0.08)" stroke="#bf4520"/>
  <text x="496" y="276" font-size="12">Astro Origin</text>
  <rect x="628" y="160" width="144" height="64" fill="#ffffff"/>
  <text x="700" y="196" font-size="12">MDX Bundle</text>
  <rect x="628" y="320" width="144" height="64" fill="#f5f5f5"/>
  <text x="700" y="356" font-size="12">Content CMS</text>
</svg>`;

describe("estructuraDeSvg sobre los ejemplos de diagram-design", () => {
  it("extrae nodos agrupados con su texto y capas apilables", () => {
    const estructura = estructuraDeSvg(CAPAS);
    expect(estructura.ancho).toBe(1000);
    expect(estructura.alto).toBe(500);
    expect(estructura.nodos.length).toBeGreaterThanOrEqual(3);
    expect(estructura.nodos.some((n) => n.texto === "Agent harness")).toBe(true);
    expect(estructura.nodos.some((n) => n.focal)).toBe(true);
    expect(estructura.capas).toHaveLength(3);
    expect(estructura.capas.every((c) => c.nodos.length > 0)).toBe(true);
  });

  it("extrae aristas con marcador y las une a sus nodos", () => {
    const estructura = estructuraDeSvg(ARQUITECTURA);
    const id = (texto: string) => estructura.nodos.find((n) => n.texto === texto)?.id;
    expect(estructura.aristas).toHaveLength(4);
    expect(estructura.aristas.every((a) => a.desde && a.hasta)).toBe(true);
    expect(estructura.aristas.some((a) => a.desde === id("Reader") && a.hasta === id("Cloudflare"))).toBe(true);
    expect(estructura.nodos.find((n) => n.texto === "Astro Origin")?.focal).toBe(true);
  });
});

describe("escena3d", () => {
  it("apila las capas en Z con separación proporcional y textos de cara a la cámara", () => {
    const escena = escena3d(estructuraDeSvg(CAPAS), "capas");
    expect(escena.capas).toHaveLength(3);
    expect(new Set(escena.capas.map((c) => c.z)).size).toBe(3);
    expect(escena.capas.every((c) => c.separacion > 0)).toBe(true);
    expect(escena.nodos.every((n) => n.billboard)).toBe(true);
    expect(escena.textos).toBe("billboard");
    expect(escena.nodos.every((n) => /^#[0-9A-F]{6}$/i.test(n.color))).toBe(true);
  });

  it("el despiece separa más que las capas y la planta axonométrica desplaza en X e Y", () => {
    const estructura = estructuraDeSvg(CAPAS);
    const capas = escena3d(estructura, "capas");
    const despiece = escena3d(estructura, "despiece");
    const planta = escena3d(estructura, "planta");
    expect(despiece.capas[0].separacion).toBeGreaterThan(capas.capas[0].separacion);
    expect(planta.capas[0].separacion).toBeGreaterThan(capas.capas[0].separacion);
    const movido = planta.nodos.find((n) => n.posicion[2] !== 0);
    const mismo = capas.nodos.find((n) => n.id === movido?.id);
    expect(movido).toBeDefined();
    expect(movido?.posicion[0]).not.toBe(mismo?.posicion[0]);
    expect(movido?.posicion[1]).not.toBe(mismo?.posicion[1]);
  });

  it("reparte un grafo en 3D sin solaparse", () => {
    const escena = escena3d(estructuraDeSvg(ARQUITECTURA), "grafo");
    expect(escena.capas).toHaveLength(0);
    expect(escena.nodos).toHaveLength(5);
    for (let i = 0; i < escena.nodos.length; i++) {
      for (let j = i + 1; j < escena.nodos.length; j++) {
        const a = escena.nodos[i].posicion, b = escena.nodos[j].posicion;
        expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeGreaterThan(0.6);
      }
    }
    expect(escena.nodos.every((n) => n.billboard)).toBe(true);
  });

  it("sin capas explícitas ni bandas anchas usa una sola capa contenedora", () => {
    const escena = escena3d(estructuraDeSvg(`<svg viewBox="0 0 100 100"><rect x="10" y="10" width="20" height="20"/></svg>`), "capas");
    expect(escena.capas).toHaveLength(1);
    expect(escena.nodos).toHaveLength(1);
  });
});
