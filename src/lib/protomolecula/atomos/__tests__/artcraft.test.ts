import { describe, it, expect, beforeEach } from "vitest";
import { ATOMOS_ARTCRAFT, documentoArtcraft, urlBuildWeb, type AppArtcraft } from "../artcraft";
import { ATOMOS_PROPIOS, registrarAtomosPropios } from "../index";
import { limpiarRegistro, listarAtomos, obtenerAtomo, registrarAtomo } from "../../registro-atomos";

const APPS: AppArtcraft[] = ["figcraft", "gridcraft", "deckcraft"];
const ALOJADO = "https://alojado.starseed.dev";
const OS = "https://starseed-os.vercel.app";

describe("átomos ArtCraft", () => {
  beforeEach(() => limpiarRegistro());

  it("declara los tres ids del catálogo, integrados por iframe y con control de ventana", () => {
    expect(ATOMOS_ARTCRAFT.map((d) => d.herramientaId)).toEqual(APPS);
    for (const def of ATOMOS_ARTCRAFT) {
      expect(def.integracion).toBe("iframe-aislado");
      expect(def.control).toBe("ventana");
      expect(def.vista?.tipo).toBe("documento");
    }
  });

  it("cada definición pasa el registro y ATOMOS_PROPIOS las incluye", () => {
    for (const def of ATOMOS_ARTCRAFT) {
      limpiarRegistro();
      expect(registrarAtomo(def)).toEqual({ ok: true });
      expect(ATOMOS_PROPIOS).toContain(def);
    }
  });

  it("sin origen alojado la vista no lleva iframe y ofrece el repositorio", () => {
    for (const app of APPS) {
      const html = documentoArtcraft(app, null);
      expect(html).not.toContain("<iframe");
      expect(html).toContain("Próximamente");
      expect(html).toContain("Repositorio");
      expect(html).toContain("__PM_CANAL__");
    }
  });

  it("con un origen válido sí hay iframe aislado", () => {
    for (const app of APPS) {
      const html = documentoArtcraft(app, ALOJADO);
      expect(html).toContain("<iframe");
      expect(html).toContain('sandbox="allow-scripts allow-same-origin"');
      expect(html).toContain(`${ALOJADO}/artcraft/${app}/`);
    }
  });

  it("rechaza javascript:, http sin cifrar y el mismo origen del OS", () => {
    expect(urlBuildWeb("figcraft", "javascript:alert(1)")).toBeNull();
    expect(urlBuildWeb("figcraft", "http://otro.example.com")).toBeNull();
    expect(urlBuildWeb("figcraft", OS)).toBeNull();
    for (const origen of ["javascript:alert(1)", "http://otro.example.com", OS]) {
      expect(documentoArtcraft("gridcraft", origen)).not.toContain("<iframe");
    }
  });

  it("ninguna vista, con o sin origen, permite top-navigation ni popups", () => {
    for (const app of APPS) {
      for (const origen of [null, ALOJADO]) {
        const html = documentoArtcraft(app, origen);
        expect(html).not.toContain("allow-top-navigation");
        expect(html).not.toContain("allow-popups");
      }
    }
  });

  it("registrar dos veces no duplica átomos", () => {
    registrarAtomosPropios();
    registrarAtomosPropios();
    expect(listarAtomos()).toHaveLength(ATOMOS_PROPIOS.length);
    for (const app of APPS) expect(obtenerAtomo(app)?.herramientaId).toBe(app);
  });

  it("los parámetros son seguros, saneados y sin código", () => {
    for (const def of ATOMOS_ARTCRAFT) {
      expect(def.parametros.length).toBeGreaterThan(0);
      for (const p of def.parametros) {
        expect(["numero", "entero", "booleano", "opcion"]).toContain(p.tipo);
        expect(p.id).not.toMatch(/[<>"'`]/);
        expect(p.nombre.length).toBeGreaterThan(0);
      }
    }
  });

  it("la categoría es la más cercana disponible", () => {
    const porId = Object.fromEntries(ATOMOS_ARTCRAFT.map((d) => [d.herramientaId, d.categoria]));
    expect(porId).toEqual({ figcraft: "imagen", gridcraft: "codigo", deckcraft: "imagen" });
  });
});
