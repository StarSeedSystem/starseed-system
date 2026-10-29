/**
 * Pruebas de los átomos ArtCraft de build web (ART1025H).
 * Contrato: architecture/artcraft-y-rare.md §4.2 · architecture/protomolecula.md §3.2 y §11.1
 */
import { describe, it, expect, beforeEach } from "vitest";
import { ATOMOS_ARTCRAFT, fijarOrigenAlojado, urlBuildWeb, type AppArtcraft } from "../artcraft";
import { ATOMOS_PROPIOS } from "../index";
import { limpiarRegistro, listarAtomos, registrarAtomo } from "../../registro-atomos";

const APPS: AppArtcraft[] = ["figcraft", "gridcraft", "deckcraft"];
const ORIGEN = "https://builds-starseed.example.org";
const PROHIBIDOS = ["allow-top-navigation", "allow-popups"];

const reiniciar = (): void => APPS.forEach((a) => fijarOrigenAlojado(a, null));

function defDe(app: AppArtcraft) {
  const def = ATOMOS_ARTCRAFT.find((d) => d.herramientaId === app);
  if (!def) throw new Error(`Sin átomo: ${app}`);
  return def;
}

function vista(app: AppArtcraft): string {
  const doc = defDe(app).vista;
  if (!doc || doc.tipo !== "documento") throw new Error(`Sin vista de documento: ${app}`);
  return doc.documento();
}

describe("átomos ArtCraft de build web", () => {
  beforeEach(reiniciar);

  it("los tres átomos llevan los ids del catálogo y el índice los suma una vez", () => {
    expect(ATOMOS_ARTCRAFT.map((d) => d.herramientaId)).toEqual(APPS);
    expect(ATOMOS_ARTCRAFT.map((d) => d.nombre)).toEqual(["FigCraft", "GridCraft", "DeckCraft"]);
    const ids = ATOMOS_PROPIOS.map((d) => d.herramientaId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of ATOMOS_ARTCRAFT) expect(ATOMOS_PROPIOS.includes(d), d.herramientaId).toBe(true);
  });

  it("integración, control y categorías del contrato", () => {
    for (const def of ATOMOS_ARTCRAFT) {
      expect(def.integracion, def.herramientaId).toBe("iframe-aislado");
      expect(def.control, def.herramientaId).toBe("ventana");
      // No hay «documentos» en CategoriaAtomo: hoja de cálculo → «codigo»; diseño y diapositivas → «imagen».
      expect(["imagen", "codigo"], def.herramientaId).toContain(def.categoria);
    }
    expect(defDe("gridcraft").categoria).toBe("codigo");
  });

  it("los parámetros salen saneados, con tipo seguro, topes y defecto", () => {
    for (const def of ATOMOS_ARTCRAFT) {
      expect(def.parametros.length).toBeGreaterThan(0);
      for (const p of def.parametros) {
        expect(p.tipo).toMatch(/^(numero|entero|booleano|opcion|disparo)$/);
        expect(p.defecto).toBeDefined();
        expect(typeof p.defecto === "string" && /<|>/.test(p.defecto), p.id).toBe(false);
        if (p.min !== undefined && p.max !== undefined) expect(p.min, p.id).toBeLessThan(p.max);
      }
    }
    const zoom = defDe("figcraft").parametros.find((p) => p.id === "zoom");
    expect(zoom && zoom.tipo === "numero").toBe(true);
    expect(defDe("gridcraft").parametros.some((p) => p.id === "hoja")).toBe(true);
    expect(defDe("deckcraft").parametros.some((p) => p.id === "diapositiva")).toBe(true);
  });

  it("sin origen alojado: la vista anuncia el pendiente y NO lleva iframe", () => {
    for (const app of APPS) {
      const html = vista(app);
      expect(html.startsWith("<!DOCTYPE html>"), app).toBe(true);
      expect(html).toContain(`el build web de ${defDe(app).nombre} aún no está alojado`);
      expect(html).toContain("repositorio");
      expect(html).toContain("__PM_CANAL__");
      expect(html, app).not.toContain("<iframe");
    }
  });

  it("con un origen embebible: la vista lleva el iframe aislado hacia la URL del zip", () => {
    fijarOrigenAlojado("figcraft", ORIGEN);
    const html = vista("figcraft");
    expect(html).toContain('<iframe id="lienzo"');
    expect(html).toContain('sandbox="allow-scripts allow-same-origin"');
    expect(html).toContain(`${ORIGEN}/figcraft/`);
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("default-src 'none'");
  });

  it("origenes no embebibles y sin origen: ni iframe ni URL", () => {
    const malos = ["javascript:alerta()", "http://builds-starseed.example.org", "nota suelta", "https://starseed-os.vercel.app"];
    for (const malo of malos) {
      fijarOrigenAlojado("gridcraft", malo);
      expect(vista("gridcraft"), malo).not.toContain("<iframe");
      expect(urlBuildWeb("gridcraft", malo)).toBeNull();
    }
    fijarOrigenAlojado("gridcraft", null);
    expect(urlBuildWeb("gridcraft", null)).toBeNull();
  });

  it("ninguna vista lleva allow-top-navigation ni allow-popups, con o sin origen", () => {
    for (const app of APPS) {
      for (const prohibido of PROHIBIDOS) expect(vista(app), app).not.toContain(prohibido);
      fijarOrigenAlojado(app, ORIGEN);
      for (const prohibido of PROHIBIDOS) expect(vista(app), app).not.toContain(prohibido);
    }
  });

  it("urlBuildWeb construye la ruta de la app bajo el origen alojado", () => {
    expect(urlBuildWeb("figcraft", ORIGEN)).toBe(`${ORIGEN}/figcraft/`);
    expect(urlBuildWeb("deckcraft", `${ORIGEN}/`)).toBe(`${ORIGEN}/deckcraft/`);
  });

  it("registrar dos veces no duplica nada del índice", () => {
    limpiarRegistro();
    for (const def of ATOMOS_ARTCRAFT) {
      limpiarRegistro();
      expect(registrarAtomo(def)).toEqual({ ok: true });
      expect(registrarAtomo(def).ok).toBe(false);
    }
    limpiarRegistro();
    for (const def of ATOMOS_ARTCRAFT) expect(registrarAtomo(def)).toEqual({ ok: true });
    expect(listarAtomos()).toHaveLength(ATOMOS_ARTCRAFT.length);
  });
});
