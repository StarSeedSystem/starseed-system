import { describe, it, expect } from "vitest";
import { estructuraDeSvg, escena3d, type Vec3 } from "../diagrama-3d";

// Recortes de example-layers.html y example-architecture.html de la skill MIT
// diagram-design (vendor/habilidades/diagram-design/assets/). Sin disco ni red.
const RECORTE_CAPAS = `<svg viewBox="0 0 1000 500">
  <rect width="100%" height="100%" fill="#f5f5f5"/>
  <rect x="120" y="80" width="840" height="64" fill="#ffffff"/>
  <text x="260" y="118" font-size="16">UI surface</text>
  <rect x="120" y="144" width="840" height="64" fill="rgba(191,69,32,0.08)"/>
  <text x="260" y="182" font-size="16">Agent harness</text>
  <rect x="120" y="208" width="840" height="64" fill="#f5f5f5"/>
  <text x="260" y="246" font-size="16">Prompt layer</text>
</svg>`;

const RECORTE_ARQUITECTURA = `<svg viewBox="0 0 1000 480">
  <defs><marker id="arrow" markerWidth="8" markerHeight="6"><polygon points="0 0, 8 3, 0 6"/></marker></defs>
  <rect width="100%" height="100%" fill="#f5f5f5"/>
  <rect x="40" y="240" width="128" height="64" rx="6" fill="#f5f5f5"/>
  <text x="104" y="276" font-size="12" text-anchor="middle">Reader</text>
  <rect x="220" y="240" width="144" height="64" rx="6" fill="rgba(45,49,66,0.03)"/>
  <text x="292" y="276" font-size="12" text-anchor="middle">Cloudflare</text>
  <rect x="416" y="240" width="160" height="64" rx="6" fill="rgba(191,69,32,0.08)"/>
  <text x="496" y="276" font-size="12" text-anchor="middle">Astro Origin</text>
  <line x1="168" y1="272" x2="220" y2="272" stroke="#2e5aa8" marker-end="url(#arrow)"/>
  <path d="M 364,272 H 416" fill="none" stroke="#bf4520" marker-end="url(#arrow)"/>
</svg>`;

const distancia = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe("estructuraDeSvg · capas y textos", () => {
  it("agrupa rect + texto y lee los grupos de capa", () => {
    const e = estructuraDeSvg(RECORTE_CAPAS);
    expect(e.ancho).toBe(1000);
    expect(e.nodos.filter((n) => n.forma === "rect")).toHaveLength(3);
    expect(e.capas).toHaveLength(0);
    expect(e.nodos.some((n) => n.etiqueta === "Agent harness")).toBe(true);
    expect(e.nodos.every((n) => n.forma === "rect" || n.etiqueta !== "")).toBe(true);
    const conGrupo = estructuraDeSvg('<svg viewBox="0 0 100 100"><g id="capa-a"><rect x="0" y="0" width="10" height="10"/></g></svg>');
    expect(conGrupo.capas).toHaveLength(1);
    expect(conGrupo.nodos[0].capa).toBe("capa-a");
  });

  it("apila las capas en Z con separación y textos cara a cámara", () => {
    const e = estructuraDeSvg(RECORTE_CAPAS);
    const esc = escena3d(e, "capas");
    expect(esc.tipo).toBe("capas");
    expect(new Set(esc.nodos.map((n) => n.posicion[2])).size).toBe(3);
    expect(esc.nodos.every((n) => n.caraCamara)).toBe(true);
    expect(esc.capas.map((c) => c.z)).toEqual([0, esc.capas[1].z, esc.capas[2].z]);
    expect(esc.capas[1].z).toBeGreaterThan(esc.capas[0].z);
  });
});

describe("estructuraDeSvg · aristas y grafo", () => {
  it("solo toma path/line con marcador y los une a sus nodos", () => {
    const e = estructuraDeSvg(RECORTE_ARQUITECTURA);
    expect(e.nodos.filter((n) => n.forma === "rect")).toHaveLength(3);
    expect(e.aristas).toHaveLength(2);
    for (const a of e.aristas) {
      expect(a.marcador).toBe(true);
      expect(a.de).not.toBe(a.a);
      expect(e.nodos.some((n) => n.id === a.de)).toBe(true);
      expect(e.nodos.some((n) => n.id === a.a)).toBe(true);
    }
  });

  it("reparte el grafo en 3D sin solaparse", () => {
    const esc = escena3d(estructuraDeSvg(RECORTE_ARQUITECTURA), "arquitectura");
    expect(esc.tipo).toBe("grafo");
    for (let i = 0; i < esc.nodos.length; i++) {
      for (let j = i + 1; j < esc.nodos.length; j++) {
        expect(distancia(esc.nodos[i].posicion, esc.nodos[j].posicion)).toBeGreaterThan(1);
      }
    }
    expect(esc.nodos.every((n) => n.caraCamara)).toBe(true);
  });

  it("clasifica despiece y planta axonométrica", () => {
    const e = estructuraDeSvg(RECORTE_CAPAS);
    expect(escena3d(e, "despiece").tipo).toBe("despiece");
    expect(escena3d(e, "planta axonométrica").tipo).toBe("axonometrica");
  });
});
