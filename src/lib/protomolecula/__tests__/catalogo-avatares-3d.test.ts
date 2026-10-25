import { describe, expect, it } from "vitest";
import {
  CATALOGO_PROTOMOLECULA,
  HerramientaProto,
} from "../catalogo-herramientas";

/** Herramientas específicas para avatares 3D que deben estar presentes. */
const TOOLS_AVATAR_3D = [
  "unimate",
  "image-to-3dlab",
  "unirig",
  "instant-meshes",
  "smart-remesh",
  "three-vrm",
  "characterstudio",
  "filigree3d",
  "btc3d",
  "meshy",
  "tripo",
  "3daistudio",
  "hi3d",
  "hitem3d",
  "meta-horizon",
];

describe("catálogo de herramientas para avatares 3D", () => {
  it("todas las herramientas específicas para avatares están en el catálogo", () => {
    const ids = CATALOGO_PROTOMOLECULA.map((h) => h.id);
    for (const id of TOOLS_AVATAR_3D) {
      expect(ids).toContain(id);
    }
  });

  it("cada herramienta para avatares tiene propiedades básicas", () => {
    for (const id of TOOLS_AVATAR_3D) {
      const tool = CATALOGO_PROTOMOLECULA.find((h) => h.id === id);
      expect(tool).toBeDefined();
      expect(tool?.nombre.length).toBeGreaterThan(0);
      expect(tool?.descripcion.length).toBeGreaterThan(0);
      expect(tool?.licencia.length).toBeGreaterThan(0);
      expect(tool?.codigo !== null || tool?.web !== null).toBe(true);
      expect(tool?.verificado).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(tool?.verificado >= "2026-10-11").toBe(true);
    }
  });

  it("las herramientas de avatares tienen categorías apropiadas", () => {
    const toolsForAvatar = CATALOGO_PROTOMOLECULA.filter((h) =>
      TOOLS_AVATAR_3D.includes(h.id)
    );
    for (const tool of toolsForAvatar) {
      expect(["modelado-3d", "materiales-shaders", "xr"], tool.id).toContain(tool.categoria);
    }
  });

  it("las herramientas de avatares tienen estados apropiados", () => {
    const proximamente = ["unimate", "filigree3d", "btc3d"];
    const soloEnlace = ["smart-remesh", "meshy", "tripo", "3daistudio", "hi3d", "hitem3d", "meta-horizon"];
    const integrable = ["image-to-3dlab", "unirig", "instant-meshes", "three-vrm", "characterstudio"];

    for (const id of proximamente) {
      const tool = CATALOGO_PROTOMOLECULA.find((h) => h.id === id);
      expect(tool?.estado).toBe("proximamente");
    }

    for (const id of soloEnlace) {
      const tool = CATALOGO_PROTOMOLECULA.find((h) => h.id === id);
      expect(tool?.estado).toBe("solo-enlace");
    }

    for (const id of integrable) {
      const tool = CATALOGO_PROTOMOLECULA.find((h) => h.id === id);
      expect(tool?.estado).toBe("integrable");
    }
  });

  it("las herramientas de avatares tienen diferentes tipos", () => {
    const tiposEsperados = new Map([
      ["unimate", "modelo"],
      ["image-to-3dlab", "servicio"],
      ["unirig", "libreria"],
      ["instant-meshes", "libreria"],
      ["smart-remesh", "servicio"],
      ["three-vrm", "libreria"],
      ["characterstudio", "libreria"],
      ["filigree3d", "modelo"],
      ["btc3d", "modelo"],
      ["meshy", "servicio"],
      ["tripo", "servicio"],
      ["3daistudio", "servicio"],
      ["hi3d", "servicio"],
      ["hitem3d", "servicio"],
      ["meta-horizon", "servicio"],
    ]);

    for (const [id, tipoEsperado] of tiposEsperados) {
      const tool = CATALOGO_PROTOMOLECULA.find((h) => h.id === id);
      expect(tool?.tipo).toBe(tipoEsperado);
    }
  });
});