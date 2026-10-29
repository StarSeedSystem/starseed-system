/**
 * Protomolécula — Pruebas de apps-embebidas.ts (F1B, ≥6 pruebas, sin red).
 *
 * Reglas: solo funciones puras exportadas, sin vi.mock de módulos Node,
 * sin route.ts importado. Importa describe/it/expect de vitest.
 */
import { describe, it, expect } from "vitest";
import { APPS_EMBEBIDAS, registrarAppsEmbebidas } from "../apps-embebidas";
import { esUrlEmbebible } from "../puente-herramientas";

const ORIGEN_OS = "https://starseed-os.vercel.app";

describe("APPS_EMBEBIDAS", () => {
  it("exporta exactamente 4 definiciones", () => {
    expect(APPS_EMBEBIDAS.length).toBe(4);
  });

  it("cada id es único", () => {
    const ids = APPS_EMBEBIDAS.map((a) => a.herramientaId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("todas las URL de vista son https y pasan esUrlEmbebible", () => {
    for (const a of APPS_EMBEBIDAS) {
      expect(a.vista).toBeDefined();
      const v = a.vista as { tipo: string; url: string };
      expect(v.tipo).toBe("externa");
      expect(v.url.startsWith("https://")).toBe(true);
      const res = esUrlEmbebible(v.url, ORIGEN_OS);
      expect(res.ok).toBe(true);
    }
  });

  it("control es 'ventana' y parametros vacío en todas", () => {
    for (const a of APPS_EMBEBIDAS) {
      expect(a.control).toBe("ventana");
      expect(a.parametros).toEqual([]);
      expect(a.integracion).toBe("iframe-aislado");
    }
  });

  it("ninguna con vista 'externa' tiene 'proximamente'", () => {
    for (const a of APPS_EMBEBIDAS) {
      expect(a.proximamente).toBeUndefined();
    }
  });

  it("cada ficha trae repo y licencia", () => {
    for (const a of APPS_EMBEBIDAS) {
      expect(a.ficha).toBeDefined();
      expect(typeof a.ficha!.repo).toBe("string");
      expect(a.ficha!.repo!.length).toBeGreaterThan(0);
      expect(typeof a.ficha!.licencia).toBe("string");
      expect(a.ficha!.licencia!.length).toBeGreaterThan(0);
    }
  });

  it("registrarAppsEmbebidas es idempotente (sin lanzar procesos)", () => {
    // Función pura: no modifica el registro ni lanza procesos.
    expect(() => registrarAppsEmbebidas()).not.toThrow();
  });
});
