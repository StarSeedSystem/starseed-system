/**
 * Sección Identidad de la ficha de neurona: nombre, nombre de aparato, tipo/icono, color, foto.
 * Tests de funciones puras exportadas.
 */
import { describe, it, expect } from "vitest";
import { filasIdentidad, normalizarNombreNeurona, normalizarNombreAparato } from "./seccion-identidad";

describe("seccion-identidad (funciones puras)", () => {
  describe("normalizarNombreNeurona", () => {
    it("recorta a 60 caracteres y limpia espacios", () => {
      expect(normalizarNombreNeurona("  Mi Neurona  ")).toBe("Mi Neurona");
      expect(normalizarNombreNeurona("a".repeat(70))).toHaveLength(60);
      expect(normalizarNombreNeurona("")).toBe("");
    });
  });

  describe("normalizarNombreAparato", () => {
    it("recorta a 60 caracteres y limpia espacios", () => {
      expect(normalizarNombreAparato("  Móvil de Alex  ")).toBe("Móvil de Alex");
      expect(normalizarNombreAparato("a".repeat(70))).toHaveLength(60);
      expect(normalizarNombreAparato("")).toBe("");
    });
  });

  describe("filasIdentidad", () => {
    it("devuelve filas solo con datos conocidos", () => {
      const filas = filasIdentidad({
        nombreNeurona: "Mi Neurona",
        nombreAparato: "Móvil de Alex",
        icono: "mobile",
        colorPublico: "#e5484d",
        foto: "data:image/png;base64,...",
      });
      expect(filas).toEqual([
        { etiqueta: "Nombre de la neurona", valor: "Mi Neurona" },
        { etiqueta: "Nombre de este aparato", valor: "Móvil de Alex" },
        { etiqueta: "Tipo / Icono", valor: "Móvil" },
        { etiqueta: "Color público", valor: "#e5484d" },
        { etiqueta: "Foto", valor: "Definida" },
      ]);
    });

    it("omite campos vacíos", () => {
      const filas = filasIdentidad({
        nombreNeurona: "",
        nombreAparato: "",
        icono: null,
        colorPublico: null,
        foto: null,
      });
      expect(filas).toEqual([]);
    });

    it("usa icono por defecto si no hay elegido", () => {
      const filas = filasIdentidad({
        nombreNeurona: "Neurona",
        nombreAparato: "Aparato",
        icono: "desktop",
        colorPublico: "#12a594",
        foto: null,
      });
      expect(filas.some((f) => f.etiqueta === "Tipo / Icono" && f.valor === "Escritorio")).toBe(true);
    });
  });
});