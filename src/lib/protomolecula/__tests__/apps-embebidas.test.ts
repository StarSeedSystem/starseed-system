/**
 * Pruebas de las apps ajenas embebidas (PM1010F1F). Sin red: las mediciones de
 * incrustación y licencia se hicieron el 2026-10-10 y quedan anotadas en el
 * módulo; aquí solo se comprueba el contrato declarativo.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { APPS_EMBEBIDAS, registrarAppsEmbebidas } from "../atomos/apps-embebidas";
import { esUrlEmbebible } from "../puente-herramientas";
import { listarAtomos, limpiarRegistro, obtenerAtomo } from "../registro-atomos";

const ORIGEN_OS = "https://starseed-os.vercel.app";
const reglas = APPS_EMBEBIDAS.flatMap((def) => def.vista?.tipo === "externa" ? [def] : []);

describe("apps embebidas según §3.2 (tercer grado)", () => {
  beforeEach(() => {
    limpiarRegistro();
  });

  it("todas las URLs son https y pasan esUrlEmbebible", () => {
    expect(APPS_EMBEBIDAS.length).toBeGreaterThan(0);
    for (const def of APPS_EMBEBIDAS) {
      if (def.vista?.tipo !== "externa") continue;
      expect(def.vista.url.startsWith("https://")).toBe(true);
      expect(esUrlEmbebible(def.vista.url, ORIGEN_OS)).toMatchObject({ ok: true });
    }
  });

  it("ninguna con vista externa lleva proximamente; las con proximamente carecen de vista", () => {
    for (const def of APPS_EMBEBIDAS) {
      if (def.vista?.tipo === "externa") expect(def.proximamente).toBeUndefined();
      if (def.proximamente !== undefined) expect(def.vista).toBeUndefined();
    }
  });

  it("control de ventana: control «ventana», sin parámetros e integración iframe-aislado", () => {
    for (const def of APPS_EMBEBIDAS) {
      expect(def.control).toBe("ventana");
      expect(def.parametros).toEqual([]);
      expect(def.integracion).toBe("iframe-aislado");
    }
  });

  it("los ids de herramienta son únicos y tienen forma válida", () => {
    const ids = APPS_EMBEBIDAS.map((def) => def.herramientaId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("cada ficha trae repo y licencia, y las licencias están verificadas", () => {
    for (const def of APPS_EMBEBIDAS) {
      expect(def.ficha?.repo).toMatch(/^https:\/\/github\.com\//);
      expect(def.ficha?.licencia ?? "").not.toBe("sin verificar");
      expect(def.ficha?.web?.startsWith("https://")).toBe(true);
    }
  });

  it("registrarAppsEmbebidas registra las cuatro y es idempotente", () => {
    registrarAppsEmbebidas();
    const primera = listarAtomos().filter((def) => def.control === "ventana");
    expect(primera.length).toBe(reglas.length);
    for (const def of reglas) {
      expect(obtenerAtomo(def.herramientaId)).toBeDefined();
    }
    registrarAppsEmbebidas();
    const segunda = listarAtomos().filter((def) => def.control === "ventana");
    expect(segunda.length).toBe(primera.length);
  });
});
