import { describe, it, expect } from "vitest";
import {
  idBaseValido,
  claveAceptada,
  validarCrearBase,
  validarCrearDocumento,
  validarRecuperar,
} from "@/lib/mando/conocimiento";

describe("conocimiento - validadores puros", () => {
  describe("idBaseValido", () => {
    it("acepta slug simple", () => {
      expect(idBaseValido("abc-123")).toBe(true);
    });
    it("rechaza vacío", () => {
      expect(idBaseValido("")).toBe(false);
    });
    it("rechaza caracteres inválidos", () => {
      expect(idBaseValido("../secret")).toBe(false);
      expect(idBaseValido("UPPER")).toBe(false);
      expect(idBaseValido("a".repeat(65))).toBe(false);
    });
    it("acepta límites", () => {
      expect(idBaseValido("a")).toBe(true);
      expect(idBaseValido("a".repeat(64))).toBe(true);
    });
  });

  describe("claveAceptada", () => {
    it("rechaza sin clave configurada", () => {
      expect(claveAceptada("Bearer xyz", undefined)).toBe(false);
    });
    it("acepta cabecera correcta", () => {
      expect(claveAceptada("Bearer secreta", "secreta")).toBe(true);
    });
    it("rechaza cabecera distinta", () => {
      expect(claveAceptada("Bearer otra", "secreta")).toBe(false);
    });
    it("rechaza null", () => {
      expect(claveAceptada(null, "secreta")).toBe(false);
    });
  });

  describe("validarCrearBase", () => {
    it("detecta falta de name", () => {
      expect(validarCrearBase({})).toBe("Falta `name`.");
    });
    it("acepta name válido", () => {
      expect(validarCrearBase({ name: "Mi base" })).toBeNull();
    });
    it("rechaza description no texto", () => {
      expect(validarCrearBase({ name: "x", description: 123 })).toBe("`description` debe ser texto.");
    });
    it("rechaza name vacío", () => {
      expect(validarCrearBase({ name: "   " })).toBe("Falta `name`.");
    });
  });

  describe("validarCrearDocumento", () => {
    it("detecta falta de name", () => {
      expect(validarCrearDocumento({ text: "hola" })).toBe("Falta `name`.");
    });
    it("detecta falta de text", () => {
      expect(validarCrearDocumento({ name: "n" })).toBe("Falta `text`.");
    });
    it("acepta ambos", () => {
      expect(validarCrearDocumento({ name: "doc", text: "contenido" })).toBeNull();
    });
    it("rechaza text vacío", () => {
      expect(validarCrearDocumento({ name: "n", text: "   " })).toBe("Falta `text`.");
    });
  });

  describe("validarRecuperar", () => {
    it("detecta falta de query", () => {
      expect(validarRecuperar({})).toBe("Falta `query`.");
    });
    it("acepta query válido", () => {
      expect(validarRecuperar({ query: "buscar" })).toBeNull();
    });
    it("rechaza top_k fuera de rango", () => {
      expect(validarRecuperar({ query: "q", top_k: 0 })).toBe("`top_k` debe ser un número entre 1 y 20.");
      expect(validarRecuperar({ query: "q", top_k: 21 })).toBe("`top_k` debe ser un número entre 1 y 20.");
    });
    it("acepta top_k límite", () => {
      expect(validarRecuperar({ query: "q", top_k: 1 })).toBeNull();
      expect(validarRecuperar({ query: "q", top_k: 20 })).toBeNull();
    });
    it("rechaza query vacío", () => {
      expect(validarRecuperar({ query: "   " })).toBe("Falta `query`.");
    });
  });
});
