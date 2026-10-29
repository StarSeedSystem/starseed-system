/**
 * Prueba del átomo ArtCraft (ART1025H): FigCraft, GridCraft y DeckCraft con el build web aislado.
 * Solo funciones puras: documentos y URL construida; nada de red, disco ni procesos.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { listarAtomos, limpiarRegistro, obtenerAtomo, registrarAtomo } from "../../registro-atomos";
import { esUrlEmbebible } from "../../puente-herramientas";
import { IDS_APPS_ARCRAFT } from "../../catalogo-herramientas";
import { ATOMOS_PROPIOS, registrarAtomosPropios } from "../index";
import { APPS_ARTCRAFT, ATOMOS_ARTCRAFT, documentoArtcraft, documentoArtcraftEmbebido, urlBuildWeb } from "../artcraft";

const OS = "https://os.starseed.example";
const ALOJADO = "https://alojamiento.example";
const LOS_TRES = ["figcraft", "gridcraft", "deckcraft"] as const;

describe("átomos ArtCraft", () => {
  beforeEach(() => limpiarRegistro());

  it("hay tres átomos con los ids del catálogo", () => {
    expect(ATOMOS_ARTCRAFT.map((d) => d.herramientaId)).toEqual([...LOS_TRES]);
    for (const id of LOS_TRES) expect(IDS_APPS_ARCRAFT, id).toContain(id);
  });

  it("cada definición pasa registrarAtomo", () => {
    for (const def of ATOMOS_ARTCRAFT) {
      limpiarRegistro();
      expect(registrarAtomo(def), def.herramientaId).toEqual({ ok: true });
    }
  });

  it("registrarAtomosPropios dos veces no duplica (número derivado del índice)", () => {
    registrarAtomosPropios();
    registrarAtomosPropios();
    expect(listarAtomos()).toHaveLength(ATOMOS_PROPIOS.length);
    for (const id of LOS_TRES) expect(obtenerAtomo(id), id).toBeDefined();
  });

  it("categorías e integración honestas (§4.2)", () => {
    const de = (id: string) => ATOMOS_ARTCRAFT.find((d) => d.herramientaId === id);
    expect(de("figcraft")?.categoria).toBe("imagen");
    expect(de("gridcraft")?.categoria).toBe("codigo");
    expect(de("deckcraft")?.categoria).toBe("imagen");
    for (const def of ATOMOS_ARTCRAFT) {
      expect(def.integracion).toBe("iframe-aislado");
      expect(def.control).toBe("ventana");
      expect(def.parametros.length).toBe(1);
      expect(["zoom", "hoja", "diapositiva"]).toContain(def.parametros[0].id);
    }
  });

  it("los parámetros salen saneados con sanearParametro (sin campos raros)", () => {
    const admitidas = ["id", "nombre", "tipo", "min", "max", "paso", "unidad", "defecto", "sinonimos"];
    for (const def of ATOMOS_ARTCRAFT) {
      const p = def.parametros[0];
      const claves = Object.keys(p as unknown as Record<string, unknown>).filter((k) => (p as unknown as Record<string, unknown>)[k] !== undefined);
      expect(claves.every((k) => admitidas.includes(k)), `${def.herramientaId}: ${claves.join(",")}`).toBe(true);
      expect(p.tipo === "numero" || p.tipo === "entero").toBe(true);
    }
  });

  it("la vista sin origen alojado NO lleva <iframe y sí el aviso de próximamente", () => {
    for (const def of ATOMOS_ARTCRAFT) {
      expect(def.vista?.tipo).toBe("documento");
      const html = documentoArtcraft(def.herramientaId as (typeof LOS_TRES)[number]);
      expect(html, def.herramientaId).not.toContain("<iframe");
      expect(html).toContain("aún no está alojado");
      expect(html).toContain("__PM_CANAL__");
    }
  });

  it("con un origen válido la vista embebida SÍ incluye el iframe aislado", () => {
    const html = documentoArtcraftEmbebido("figcraft", ALOJADO, OS);
    expect(html).toContain("<iframe");
    expect(html).toContain('sandbox="allow-scripts allow-same-origin"');
    expect(html).toContain(`${ALOJADO}/figcraft/`);
    expect(html).not.toContain("aún no está alojado");
  });

  it("con un origen inválido no hay iframe y se degrada al aviso", () => {
    for (const origen of ["javascript:exportar()", "http://otro-dominio.example", "", `${OS}/dos/paths`]) {
      const html = documentoArtcraftEmbebido("gridcraft", origen, OS);
      expect(html, JSON.stringify(origen)).not.toContain("<iframe");
      expect(html).toContain("aún no está alojado");
    }
  });

  it("ninguna vista lleva allow-top-navigation ni allow-popups", () => {
    for (const def of ATOMOS_ARTCRAFT) {
      expect(documentoArtcraft(def.herramientaId as (typeof LOS_TRES)[number]), def.herramientaId).not.toMatch(/allow-top-navigation|allow-popups/);
      expect(documentoArtcraftEmbebido(def.herramientaId as (typeof LOS_TRES)[number], ALOJADO, OS)).not.toMatch(/allow-top-navigation|allow-popups/);
    }
  });

  it("urlBuildWeb construye la URL solo con orígenes embebibles", () => {
    expect(urlBuildWeb("deckcraft", ALOJADO, OS)).toBe(`${ALOJADO}/deckcraft/`);
    expect(urlBuildWeb("figcraft", "javascript:alert(1)", OS)).toBeNull();
    expect(urlBuildWeb("figcraft", "http://otro-dominio.example", OS)).toBeNull();
    expect(urlBuildWeb("figcraft", `${OS}/propio`, OS)).toBeNull();
    expect(esUrlEmbebible(`${ALOJADO}/gridcraft/`, OS).ok).toBe(true);
  });
});
