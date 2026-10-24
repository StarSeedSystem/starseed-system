import { describe, expect, it } from "vitest";
import {
  CATALOGO_PROTOMOLECULA,
  aPaqueteBiblioteca,
  buscar,
  herramientaPorId,
  usoLicencia,
} from "../catalogo-herramientas";
import type { HerramientaProto } from "../catalogo-herramientas";

/* Fichas de la Ola 1020T (tarea RLB1020N): Excalidraw, Penpot, img2threejs y
   SUPRA-Tex. Datos del catálogo verificado `config/repos-libreria-1020c.json`. */

const CUATRO = ["excalidraw", "penpot", "img2threejs", "supra-tex"] as const;
const ids = CATALOGO_PROTOMOLECULA.map((h) => h.id);

const ficha = (id: string): HerramientaProto => herramientaPorId(id) as HerramientaProto;

describe("Ola 1020T · las cuatro están en el catálogo", () => {
  it("las cuatro están presentes, con licencia y fuente de versión", () => {
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of CUATRO) {
      const h = ficha(id);
      expect(h.licencia.trim().length, id).toBeGreaterThan(0);
      expect(["github-releases", "github-tags", "npm", "pypi", "flathub", "web"], id).toContain(h.actualizacion.fuente);
      expect(h.actualizacion.ref.trim().length, id).toBeGreaterThan(0);
      expect(buscar(id.replace(/-/g, " ")).map((x) => x.id), id).toContain(id);
    }
  });
});

describe("excalidraw · integración en curso, aún no montada", () => {
  it("dice lo que corre y lo que falta", () => {
    const h = ficha("excalidraw");
    expect(h.licencia).toBe("MIT");
    expect(h.integracion).toBe("libreria-js");
    expect(h.actualizacion).toMatchObject({ fuente: "npm", ref: "@excalidraw/excalidraw" });
    expect(h.estado).toBe("integrable");
    expect(h.motivo).toMatch(/integración en curso/i);
    expect(h.motivo).toMatch(/aún no montada/i);
    expect((h.avisos ?? []).join(" ")).toMatch(/no corre|no promete/i);
  });
});

describe("penpot · conector autoalojado + MCP", () => {
  it("MPL-2.0, servidor propio y MCP", () => {
    const h = ficha("penpot");
    expect(h.licencia).toBe("MPL-2.0");
    expect(h.codigo).toBe("https://github.com/penpot/penpot");
    expect(h.integracion).toBe("servidor-remoto");
    expect(h.control.via).toContain("mcp");
    expect(h.actualizacion).toMatchObject({ fuente: "github-releases", ref: "penpot/penpot", ultimaVersion: "2.18.3" });
    expect((h.avisos ?? []).join(" ")).toMatch(/MCP/i);
  });
});

describe("img2threejs · imagen → three.js procedural para agentes", () => {
  it("Apache-2.0, vía de agente y versión real", () => {
    const h = ficha("img2threejs");
    expect(h.licencia).toBe("Apache-2.0");
    expect(h.codigo).toBe("https://github.com/img2threejs/img2threejs");
    expect(h.ia).toContain("cli-agentes");
    expect(h.formatos.entrada).toContain("png");
    expect(h.formatos.salida).toContain("threejs");
    expect(h.estado).toBe("integrable");
    expect(h.actualizacion).toMatchObject({ fuente: "github-releases", ref: "img2threejs/img2threejs", ultimaVersion: "v2.0.0", fechaVersion: "2026-09-06" });
    expect(h.motivo).toMatch(/agente/i);
  });
});

describe("supra-tex · no comercial y sin código publicado", () => {
  it("queda solo-enlace, con licencia no comercial y sin versión", () => {
    const h = ficha("supra-tex");
    expect(h.tipo).toBe("modelo");
    expect(h.licencia).toBe("NOASSERTION");
    expect(h.licenciaPesos).toMatch(/Qwen/);
    expect(usoLicencia(h)).toBe("sin-permiso");
    expect(h.estado).toBe("solo-enlace");
    expect(h.integracion).toBe("solo-enlace");
    expect(h.actualizacion).toMatchObject({ fuente: "github-releases", ref: "Supra-3D/SUPRA-Tex", ultimaVersion: null, fechaVersion: null });
    expect(h.motivo).toMatch(/no comercial/i);
    expect(h.motivo).toMatch(/sin publicar|publicado/i);
    expect((h.avisos ?? []).join(" ")).toMatch(/NO comercial/i);
  });
});

describe("coherencia común de las cuatro fichas", () => {
  it("verificadas el 2026-10-20, con motivo y convertibles a la Biblioteca", () => {
    for (const id of CUATRO) {
      const h = ficha(id);
      expect(h.verificado).toBe("2026-10-20");
      expect(h.motivo.trim().length, id).toBeGreaterThan(10);
      const p = aPaqueteBiblioteca(h);
      expect(p.id).toBe(`proto-${id}`);
      expect(p.sourceRepoId).toBe("protomolecula");
      expect(String(p.payload.externalUrl).length, id).toBeGreaterThan(0);
    }
    expect(aPaqueteBiblioteca(ficha("supra-tex")).comingSoon).toBe(true);
    expect(aPaqueteBiblioteca(ficha("excalidraw")).tags).toContain("libreria-js");
  });
});
