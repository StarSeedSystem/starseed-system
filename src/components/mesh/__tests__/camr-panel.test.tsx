/**
 * Tests del módulo CAMR — solo funciones puras, sin red, sin disco, sin procesos.
 */
import { describe, it, expect } from "vitest";
import {
  leerActivoCamr,
  leerModoEnlaceCamr,
  leerModoRadioCamr,
  leerMetricaCamr,
  migrarAjusteCamr,
} from "@/lib/network/red-mesh-settings";

import type { AjusteCamrPersistente } from "@/lib/network/red-mesh-settings";

describe("ajustes CAMR - funciones puras", () => {
  describe("leerActivoCamr", () => {
    it("devuelve false por defecto", () => {
      expect(leerActivoCamr(null)).toBe(false);
      expect(leerActivoCamr(undefined)).toBe(false);
      expect(leerActivoCamr("false")).toBe(false);
    });
    it("devuelve true con valores afirmativos", () => {
      expect(leerActivoCamr("true")).toBe(true);
      expect(leerActivoCamr("1")).toBe(true);
    });
  });

  describe("leerModoEnlaceCamr", () => {
    it("usa hibrido-autonomo por defecto", () => {
      expect(leerModoEnlaceCamr(null)).toBe("hibrido-autonomo");
      expect(leerModoEnlaceCamr("")).toBe("hibrido-autonomo");
    });
    it("reconoce manual", () => {
      expect(leerModoEnlaceCamr("manual")).toBe("manual");
    });
  });

  describe("leerModoRadioCamr", () => {
    it("usa automatico por defecto", () => {
      expect(leerModoRadioCamr(null)).toBe("automatico");
      expect(leerModoRadioCamr("manual")).toBe("manual");
    });
  });

  describe("leerMetricaCamr", () => {
    it("usa hibrida por defecto", () => {
      expect(leerMetricaCamr(null)).toBe("hibrida");
      expect(leerMetricaCamr("latencia")).toBe("latencia");
      expect(leerMetricaCamr("resiliencia")).toBe("resiliencia");
    });
  });

  describe("migrarAjusteCamr", () => {
    it("normaliza un objeto parcial con valores por defecto", () => {
      const resultado = migrarAjusteCamr({ activo: true, indicativo: "EA1ABC" });
      expect(resultado.activo).toBe(true);
      expect(resultado.modoEnlace).toBe("hibrido-autonomo");
      expect(resultado.indicativo).toBe("EA1ABC");
      expect(resultado.metrica).toBe("hibrida");
    });
    it("devuelve valores por defecto con null", () => {
      const resultado = migrarAjusteCamr(null);
      expect(resultado.activo).toBe(false);
    });
  });
});
