// Pruebas puras del diagrama 3D (entrada SVG → estructura → escena), sin DOM, sin red ni disco.
// Fixtures tomados de la skill MIT diagram-design: assets/example-layers.html y
// assets/example-architecture.html (vendor/habilidades/diagram-design/), citados en
// architecture/diagramas.md §3 y §4. Importamos vitest porque `globals` está en false.
import { describe, it, expect } from "vitest";
import { escena3d, estructuraDeSvg } from "../diagrama-3d";
// Extracto fiel de example-layers.html: cinco barras apiladas y sus rótulos.
const CAPAS = `<svg viewBox="0 0 1000 500" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f5f5f5"/><rect x="120" y="80" width="840" height="64" fill="#ffffff"/><text x="260" y="118" font-size="16" font-weight="600">UI surface</text><text x="940" y="118" font-size="10" text-anchor="end">chat, editor, canvas</text><rect x="120" y="144" width="840" height="64" fill="rgba(191,69,32,0.08)"/><text x="260" y="182" font-size="16" font-weight="600">Agent harness</text><rect x="120" y="208" width="840" height="64" fill="#f5f5f5"/><text x="260" y="246" font-size="16" font-weight="600">Prompt layer</text><rect x="120" y="272" width="840" height="64" fill="#ececec"/><text x="260" y="310" font-size="16" font-weight="600">SDK / client</text><rect x="120" y="336" width="840" height="64" fill="#ececec"/><text x="260" y="374" font-size="16" font-weight="600">Model weights</text></svg>`;
// Extracto fiel de example-architecture.html: cajas, flechas con marcador y un path con curvas.
const ARQUITECTURA = `<svg viewBox="0 0 1000 480" xmlns="http://www.w3.org/2000/svg"><defs><marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#4f5d75"/></marker></defs><rect width="100%" height="100%" fill="#f5f5f5"/><rect x="616" y="128" width="164" height="272" fill="rgba(45,49,66,0.02)"/><rect x="40" y="240" width="128" height="64" rx="6" fill="#f5f5f5"/><text x="104" y="276" font-size="12" font-weight="600" text-anchor="middle">Reader</text><text x="104" y="292" font-size="9" text-anchor="middle">Browser</text><rect x="220" y="240" width="144" height="64" rx="6" fill="#f5f5f5"/><text x="292" y="276" font-size="12" font-weight="600" text-anchor="middle">Cloudflare</text><rect x="416" y="240" width="160" height="64" rx="6" fill="#f5f5f5"/><text x="496" y="276" font-size="12" font-weight="600" text-anchor="middle">Astro Origin</text><rect x="648" y="160" width="104" height="64" rx="6" fill="#f5f5f5"/><text x="700" y="196" font-size="12" font-weight="600" text-anchor="middle">MDX Bundle</text><rect x="648" y="320" width="104" height="64" rx="6" fill="#f5f5f5"/><text x="700" y="356" font-size="12" font-weight="600" text-anchor="middle">CMS</text><line x1="168" y1="272" x2="220" y2="272" stroke="#2e5aa8" marker-end="url(#arrow)"/><line x1="364" y1="272" x2="416" y2="272" stroke="#bf4520" marker-end="url(#arrow)"/><path d="M 576,260 H 692 Q 700,260 700,252 V 224" fill="none" stroke="#4f5d75" marker-end="url(#arrow)"/><path d="M 576,284 H 692 Q 700,284 700,292 V 320" fill="none" stroke="#4f5d75" marker-end="url(#arrow)"/><path d="M 220,288 H 168" fill="none" stroke="#4f5d75" marker-end="url(#arrow)"/></svg>`;
const dist = (a: [number, number, number], b: [number, number, number]): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
describe("estructuraDeSvg", () => {
  it("saca nodos y textos de example-layers.html", () => {
    const estructura = estructuraDeSvg(CAPAS);
    expect(estructura.nodos.length).toBe(5);
    expect(estructura.nodos.map((n) => n.etiqueta)).toContain("UI surface");
    expect(estructura.nodos.map((n) => n.etiqueta)).toContain("Model weights");
    expect(estructura.ancho).toBe(1000);
    expect(estructura.alto).toBe(500);
  });
  it("saca nodos, aristas con marcador y capas de un SVG con grupos", () => {
    const svg = `<svg viewBox="0 0 400 200"><g id="capa-datos" class="capa"><rect x="20" y="20" width="120" height="50"/><text x="80" y="50" font-size="12">Datos</text></g><g class="capa" data-capa="interfaz"><rect x="220" y="20" width="120" height="50"/><text x="280" y="50" font-size="12">Interfaz</text></g><line x1="140" y1="45" x2="220" y2="45" marker-end="url(#arrow)"/></svg>`;
    const estructura = estructuraDeSvg(svg);
    expect(estructura.capas.length).toBe(2);
    expect(estructura.capas[0].id).toBe("capa-datos");
    expect(estructura.capas[0].nodos.length).toBe(1);
    expect(estructura.capas[1].nodos.length).toBe(1);
    expect(estructura.aristas.length).toBe(1);
    expect(estructura.aristas[0].fuente).toBe(estructura.capas[0].nodos[0]);
    expect(estructura.aristas[0].destino).toBe(estructura.capas[1].nodos[0]);
  });
  it("saca aristas de path y descarta el fondo de example-architecture.html", () => {
    const estructura = estructuraDeSvg(ARQUITECTURA);
    expect(estructura.nodos.length).toBe(5);
    expect(estructura.nodos.map((n) => n.etiqueta)).toEqual(expect.arrayContaining(["Reader", "Cloudflare", "Astro Origin", "MDX Bundle", "CMS"]));
    expect(estructura.aristas.length).toBe(5);
    expect(estructura.aristas.every((a) => a.fuente !== "" && a.destino !== "")).toBe(true);
    expect(estructura.nodos.some((n) => n.etiqueta === "f5f5f5")).toBe(false);
  });
  it("sin nodos devuelve una escena vacía", () => {
    const escena = escena3d(estructuraDeSvg("<svg viewBox='0 0 10 10'></svg>"), "grafo");
    expect(escena.nodos).toEqual([]);
    expect(escena.radio).toBe(0);
  });
});
describe("escena3d", () => {
  it("apila capas, despiece y planta axonométrica en Z con separación proporcional", () => {
    const estructura = estructuraDeSvg(CAPAS);
    for (const tipo of ["capas", "despiece", "axonometrica"] as const) {
      const escena = escena3d(estructura, tipo);
      expect(escena.nodos.length).toBe(5);
      expect(escena.separacion).toBeGreaterThan(0);
      const zs = escena.nodos.map((n) => n.pos[2]);
      expect(new Set(zs).size).toBeGreaterThan(1);
      expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThanOrEqual(escena.separacion * 4 - 1e-9);
    }
  });
  it("usa las capas explícitas de los grupos y su orden", () => {
    const svg = `<svg viewBox="0 0 400 200"><g id="capa-datos"><rect x="20" y="20" width="120" height="50"/><text x="80" y="50" font-size="12">Datos</text></g><g id="capa-interfaz"><rect x="220" y="20" width="120" height="50"/><text x="280" y="50" font-size="12">Interfaz</text></g></svg>`;
    const escena = escena3d(estructuraDeSvg(svg), "capas");
    const datos = escena.nodos.find((n) => n.capa === "capa-datos");
    const interfaz = escena.nodos.find((n) => n.capa === "capa-interfaz");
    expect(datos?.pos[2]).toBe(0);
    expect(interfaz?.pos[2]).toBeCloseTo(escena.separacion, 6);
  });
  it("reparte los grafos en 3D sin solaparse y conserva las aristas válidas", () => {
    const escena = escena3d(estructuraDeSvg(ARQUITECTURA), "grafo");
    expect(escena.nodos.length).toBe(5);
    expect(escena.radio).toBeGreaterThan(0);
    expect(escena.aristas.length).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < escena.nodos.length; i++) {
      for (let j = i + 1; j < escena.nodos.length; j++) {
        expect(dist(escena.nodos[i].pos, escena.nodos[j].pos)).toBeGreaterThan(0.6);
      }
    }
  });
  it("los textos miran siempre a la cámara y cada nodo lleva su tamaño", () => {
    const escena = escena3d(estructuraDeSvg(ARQUITECTURA), "grafo");
    expect(escena.miraCamara).toBe(true);
    expect(escena.nodos.every((n) => n.miraCamara)).toBe(true);
    expect(escena.nodos.every((n) => n.tamano[0] > 0 && n.tamano[1] > 0 && n.tamano[2] > 0)).toBe(true);
  });
});
