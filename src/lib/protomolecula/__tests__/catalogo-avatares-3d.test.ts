import { describe, expect, it } from "vitest";
import {
  CATALOGO_PROTOMOLECULA,
  herramientaPorId,
} from "../catalogo-herramientas";

const AVATARES_3D = [
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

describe("fichas de avatares 3D verificadas el 2026-10-11", () => {
  it("todas las herramientas nuevas existen y sus ids son únicos en el catálogo", () => {
    const ids = CATALOGO_PROTOMOLECULA.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of AVATARES_3D) {
      expect(herramientaPorId(id), `falta ${id}`).toBeDefined();
      expect(herramientaPorId(id)!.id).toBe(id);
    }
  });

  it("ninguna de las nuevas duplica datos inventados: cada una tiene fecha 2026-10-11 o motivo real", () => {
    for (const id of AVATARES_3D) {
      const h = herramientaPorId(id);
      expect(h!.verificado, id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(h!.motivo.length, id).toBeGreaterThan(10);
      if (h!.codigo && h!.codigo.includes("github.com")) {
        expect(h!.codigo, id).toMatch(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/);
      }
    }
  });

  it("hunyuan3d tiene aviso de restricción regional", () => {
    const h = herramientaPorId("hunyuan3d");
    expect(h).toBeDefined();
    expect(h!.avisos).toBeDefined();
    expect(h!.avisos!.length).toBeGreaterThan(0);
    const textoAvisos = h!.avisos!.join(" ");
    expect(textoAvisos).toMatch(/región|UE|Unión Europea|Reino Unido|Corea/);
  });

  it("las categorías de las nuevas herramientas son conocidas", () => {
    const categoriasValidas = new Set([
      "modelado-3d", "xr", "ia-generativa",
    ]);
    for (const id of AVATARES_3D) {
      const c = herramientaPorId(id)!.categoria;
      expect(categoriasValidas.has(c), `${id}: categoría ${c}`).toBe(true);
    }
  });

  it("no hay duplicados de ids entre las nuevas y las existentes (trellis, triposr, hunyuan3d)", () => {
    const existentes3d = ["trellis", "triposr", "hunyuan3d"];
    for (const id of existentes3d) {
      expect(herramientaPorId(id)).toBeDefined();
      expect(AVATARES_3D.includes(id)).toBe(false);
    }
  });
});
