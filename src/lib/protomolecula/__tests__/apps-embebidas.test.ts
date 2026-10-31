/**
 * Pruebas de las apps ajenas embebidas (PM1010F1F). Puras y sin red: no hacen
 * ninguna petición; la honestidad de la medición quedó en los comentarios del módulo.
 */
import { describe, expect, it } from "vitest";
import { APPS_EMBEBIDAS, registrarAppsEmbebidas } from "../apps-embebidas";
import { obtenerAtomo, listarAtomos, type VistaAtomo } from "../registro-atomos";
import { esUrlEmbebible } from "../puente-herramientas";

/** Origen del OS publicado: ninguna app embebida puede apuntar al propio origen. */
const ORIGEN_OS = "https://starseed-os.vercel.app";

const urlDe = (def: { vista?: VistaAtomo }): string | null =>
  def.vista && def.vista.tipo === "externa" ? def.vista.url : null;

describe("apps ajenas embebidas", () => {
  it("todas las URL son https y pasan esUrlEmbebible frente al origen del OS", () => {
    expect(APPS_EMBEBIDAS.length).toBeGreaterThan(0);
    for (const def of APPS_EMBEBIDAS) {
      const url = urlDe(def);
      if (!url) continue;
      expect(url.startsWith("https://")).toBe(true);
      expect(esUrlEmbebible(url, ORIGEN_OS)).toEqual({ ok: true, origen: new URL(url).origin });
    }
  });

  it("ninguna con vista externa lleva «próximamente» (lo embebible está disponible, no se anuncia a medias)", () => {
    for (const def of APPS_EMBEBIDAS) {
      if (urlDe(def)) expect(def.proximamente).toBeUndefined();
    }
  });

  it("todas con «próximamente» carecen de vista (una prohibida no se pinta con vista)", () => {
    for (const def of APPS_EMBEBIDAS) {
      if (def.proximamente) expect(urlDe(def)).toBeNull();
    }
  });

  it("tercer grado: control «ventana» y sin parámetros universales", () => {
    for (const def of APPS_EMBEBIDAS) {
      expect(def.control).toBe("ventana");
      expect(def.parametros).toEqual([]);
    }
  });

  it("los ids de herramienta son únicos en todo el catálogo de apps", () => {
    const ids = APPS_EMBEBIDAS.map((d) => d.herramientaId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("cada ficha trae web, repo y licencia (honestidad obligatoria)", () => {
    for (const def of APPS_EMBEBIDAS) {
      expect(def.ficha).toBeDefined();
      expect(def.ficha?.repo?.startsWith("https://github.com/")).toBe(true);
      expect(def.ficha?.licencia).toBeTruthy();
    }
  });

  it("registrarAppsEmbebidas es idempotente y solo registra las con vista externa", () => {
    registrarAppsEmbebidas();
    for (const def of APPS_EMBEBIDAS) {
      if (urlDe(def)) expect(obtenerAtomo(def.herramientaId)).toEqual(def);
    }
    const registro = listarAtomos();
    const nuestras = registro.filter((d) => APPS_EMBEBIDAS.some((a) => a.herramientaId === d.herramientaId));
    registrarAppsEmbebidas();
    expect(listarAtomos()).toEqual(registro); // segunda llamada: ni duplicados ni cambios en el registro
    expect(nuestras.length).toBeGreaterThan(0);
  });
});
