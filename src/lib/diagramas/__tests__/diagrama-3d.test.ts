// Pruebas puras del diagrama 3D. Los SVG de entrada son extractos de los ejemplos MIT de la
// skill diagram-design: assets/example-layers.html y assets/example-architecture.html.
// Sin red, sin disco y sin navegador; todo es entrada → salida.

import { describe, it, expect } from "vitest";
import { estructuraDeSvg, escena3d } from "../diagrama-3d";

const CAPAS = `<svg viewBox="0 0 1000 500" xmlns="http://www.w3.org/2000/svg">
  <defs><pattern id="dots"><circle cx="1" cy="1" r="0.9" fill="rgba(45,49,66,0.10)"/></pattern></defs>
  <rect width="100%" height="100%" fill="#f5f5f5"/>
  <text x="60" y="68" font-size="8">ABSTRACTION</text>
  <line x1="80" y1="80" x2="80" y2="400" stroke="rgba(45,49,66,0.30)"/>
  <rect x="120" y="80" width="840" height="64" fill="#ffffff"/>
  <text x="140" y="116" font-size="8">L5</text>
  <text x="260" y="118" font-size="16">UI surface</text>
  <rect x="120" y="144" width="840" height="64" fill="rgba(191,69,32,0.08)"/>
  <text x="260" y="182" font-size="16">Agent harness</text>
  <rect x="120" y="208" width="840" height="64" fill="#f5f5f5"/>
  <text x="260" y="246" font-size="16">Prompt layer</text>
  <rect x="120" y="272" width="840" height="64" fill="#ececec"/>
  <text x="260" y="310" font-size="16">SDK / client</text>
  <rect x="120" y="336" width="840" height="64" fill="#ececec"/>
  <text x="260" y="374" font-size="16">Model weights</text>
</svg>`;

const ARQUITECTURA = `<svg viewBox="0 0 1000 480" xmlns="http://www.w3.org/2000/svg">
  <defs><marker id="arrow"><polygon points="0 0, 8 3, 0 6" fill="#4f5d75"/></marker></defs>
  <rect width="100%" height="100%" fill="#f5f5f5"/>
  <rect x="616" y="128" width="164" height="272" rx="8" fill="rgba(45,49,66,0.02)"/>
  <text x="698" y="141" font-size="7">CONTENT</text>
  <line x1="168" y1="272" x2="220" y2="272" marker-end="url(#arrow)"/>
  <line x1="364" y1="272" x2="416" y2="272" marker-end="url(#arrow)"/>
  <path d="M 576,260 H 692 Q 700,260 700,252 V 224" fill="none" marker-end="url(#arrow)"/>
  <path d="M 576,284 H 692 Q 700,284 700,292 V 320" fill="none" marker-end="url(#arrow)"/>
  <path d="M 220,288 H 168" fill="none" stroke-dasharray="4,3" marker-end="url(#arrow)"/>
  <rect x="40" y="240" width="128" height="64" rx="6" fill="#f5f5f5"/>
  <rect x="40" y="240" width="128" height="64" rx="6" fill="rgba(79,93,117,0.10)" stroke="#5a6580"/>
  <text x="104" y="276" font-size="12" text-anchor="middle">Reader</text>
  <rect x="220" y="240" width="144" height="64" rx="6" fill="#f5f5f5"/>
  <rect x="220" y="240" width="144" height="64" rx="6" fill="rgba(45,49,66,0.03)" stroke="rgba(45,49,66,0.30)"/>
  <text x="292" y="276" font-size="12" text-anchor="middle">Cloudflare</text>
  <rect x="416" y="240" width="160" height="64" rx="6" fill="#f5f5f5"/>
  <rect x="416" y="240" width="160" height="64" rx="6" fill="rgba(191,69,32,0.08)" stroke="#bf4520"/>
  <text x="496" y="276" font-size="12" text-anchor="middle">Astro Origin</text>
  <rect x="628" y="160" width="144" height="64" rx="6" fill="#f5f5f5"/>
  <rect x="628" y="160" width="144" height="64" rx="6" fill="#ffffff" stroke="#2d3142"/>
  <text x="700" y="196" font-size="12" text-anchor="middle">MDX Bundle</text>
  <rect x="628" y="320" width="144" height="64" rx="6" fill="#f5f5f5"/>
  <rect x="628" y="320" width="144" height="64" rx="6" fill="rgba(45,49,66,0.05)" stroke="#4f5d75"/>
  <text x="700" y="356" font-size="12" text-anchor="middle">Content CMS</text>
</svg>`;

describe("estructuraDeSvg", () => {
  it("extrae las capas apiladas del ejemplo layer stack (sin duplicar el fondo)", () => {
    const e = estructuraDeSvg(CAPAS);
    expect(e.nodos).toHaveLength(5);
    expect(e.nodos.map((n) => n.etiqueta)).toContain("Agent harness");
    expect(e.textos).toContain("ABSTRACTION");
    expect(e.aristas).toHaveLength(0);
    expect(e.ancho).toBe(1000);
    expect(e.alto).toBe(500);
  });

  it("extrae nodos y aristas con marcador del ejemplo de arquitectura", () => {
    const e = estructuraDeSvg(ARQUITECTURA);
    const etiquetas = e.nodos.map((n) => n.etiqueta);
    expect(etiquetas).toEqual(expect.arrayContaining(["Reader", "Cloudflare", "Astro Origin", "MDX Bundle", "Content CMS"]));
    expect(e.aristas.length).toBeGreaterThanOrEqual(5);
    expect(e.aristas.every((a) => a.conMarcador)).toBe(true);
    const ids = new Set(e.nodos.map((n) => n.id));
    for (const a of e.aristas) {
      expect(ids.has(a.fuente)).toBe(true);
      expect(ids.has(a.destino)).toBe(true);
      expect(a.fuente).not.toBe(a.destino);
    }
    const porEtiqueta = new Map(e.nodos.map((n) => [n.etiqueta, n.id]));
    const pares = e.aristas.map((a) => `${a.fuente}->${a.destino}`);
    expect(pares).toContain(`${porEtiqueta.get("Reader")}->${porEtiqueta.get("Cloudflare")}`);
    expect(pares).toContain(`${porEtiqueta.get("Astro Origin")}->${porEtiqueta.get("MDX Bundle")}`);
    expect(pares).toContain(`${porEtiqueta.get("Astro Origin")}->${porEtiqueta.get("Content CMS")}`);
  });

  it("reconoce grupos g con id o clase de capa", () => {
    const svg = `<svg viewBox="0 0 400 200"><g id="capa-datos"><rect x="10" y="10" width="80" height="40"/><text x="20" y="30" font-size="12">Datos</text></g>
      <g class="layer"><rect x="10" y="100" width="80" height="40"/><text x="20" y="120" font-size="12">Vista</text></g></svg>`;
    const e = estructuraDeSvg(svg);
    expect(e.capas).toHaveLength(2);
    expect(e.capas.map((c) => c.id)[0]).toBe("capa-datos");
    expect(e.capas[0].nodos).toHaveLength(1);
    expect(e.nodos.find((n) => n.id === e.capas[0].nodos[0])?.etiqueta).toBe("Datos");
  });

  it("convierte un texto suelto legible en nodo de forma texto", () => {
    const e = estructuraDeSvg(`<svg viewBox="0 0 200 100"><text x="20" y="40" font-size="14">Suelto</text></svg>`);
    expect(e.nodos).toHaveLength(1);
    expect(e.nodos[0]).toMatchObject({ forma: "texto", etiqueta: "Suelto" });
    expect(e.nodos[0].ancho).toBeGreaterThan(24);
  });

  it("no falla con un SVG sin nodos", () => {
    const e = estructuraDeSvg(`<svg viewBox="0 0 10 10"></svg>`);
    expect(e.nodos).toEqual([]);
    expect(escena3d(e, "grafo").nodos).toEqual([]);
  });
});

describe("escena3d", () => {
  it("apila las capas en Z con separación proporcional y etiquetas de cara a la cámara", () => {
    const escena = escena3d(estructuraDeSvg(CAPAS), "capas");
    expect(escena.capas).toHaveLength(5);
    const zs = escena.capas.map((c) => c.z);
    for (let i = 1; i < zs.length; i++) expect(zs[i]).toBeGreaterThan(zs[i - 1]);
    const paso = zs[1] - zs[0];
    expect(paso).toBeGreaterThan(0.5);
    for (let i = 2; i < zs.length; i++) expect(zs[i] - zs[i - 1]).toBeCloseTo(paso, 6);
    expect(escena.nodos).toHaveLength(5);
    expect(escena.etiquetas.length).toBeGreaterThanOrEqual(5);
    expect(escena.etiquetas.every((e) => e.miraCamara === true)).toBe(true);
    expect(escena.etiquetas.map((e) => e.texto)).toEqual(expect.arrayContaining(["UI surface", "Agent harness", "Model weights"]));
  });

  it("en despiece separa también en X/Y y conserva la planta", () => {
    const e = estructuraDeSvg(CAPAS);
    const planta = escena3d(e, "capas");
    const despiece = escena3d(e, "despiece");
    expect(despiece.nodos.map((n) => n.posicion[0])).not.toEqual(planta.nodos.map((n) => n.posicion[0]));
    expect(despiece.nodos.map((n) => n.id)).toEqual(planta.nodos.map((n) => n.id));
  });

  it("reparte un grafo en 3D sin posiciones repetidas y con aristas válidas", () => {
    const escena = escena3d(estructuraDeSvg(ARQUITECTURA), "grafo");
    expect(escena.nodos.length).toBeGreaterThanOrEqual(5);
    const claves = new Set(escena.nodos.map((n) => n.posicion.map((v) => v.toFixed(4)).join(",")));
    expect(claves.size).toBe(escena.nodos.length);
    expect(escena.aristas.length).toBeGreaterThanOrEqual(5);
    expect(escena.etiquetas.every((e) => e.miraCamara)).toBe(true);
    expect(escena.camara.posicion[2]).toBeGreaterThan(0);
    expect(escena.camara.objetivo).toEqual([0, 0, 0]);
  });

  it("es determinista: la misma estructura produce la misma escena", () => {
    const e = estructuraDeSvg(ARQUITECTURA);
    expect(escena3d(e, "grafo")).toEqual(escena3d(e, "grafo"));
    expect(escena3d(estructuraDeSvg(CAPAS), "axonometria")).toEqual(escena3d(estructuraDeSvg(CAPAS), "axonometria"));
  });
});
