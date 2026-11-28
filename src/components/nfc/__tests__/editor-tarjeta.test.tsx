import { describe, it, expect } from "vitest";
import { TIPO_TARJETA_OFERTA, type TipoTarjetaOferta } from "@/lib/nfc/tarjetas-oferta";
import {
  PLANTILLAS_POR_TIPO,
  plantillaParaTipo,
  validarTitulo,
  validarContenido,
  validarCaducidad,
} from "@/components/nfc/editor-tarjeta";

describe("NFC1126O-d1-d3b · plantillas por tipo", () => {
  it("define una plantilla para cada tipo del contrato", () => {
    for (const tipo of TIPO_TARJETA_OFERTA) {
      const plantilla = plantillaParaTipo(tipo);
      expect(typeof plantilla).toBe("object");
      expect(plantilla).not.toBeNull();
    }
    expect(Object.keys(PLANTILLAS_POR_TIPO)).toHaveLength(TIPO_TARJETA_OFERTA.length);
  });

  it("las plantillas tienen las claves esperadas por tipo", () => {
    expect(plantillaParaTipo("presentacion")).toEqual({ texto: "", enlaces: [] });
    expect(plantillaParaTipo("evento")).toEqual({ titulo: "", lugar: "", fecha: "", descripcion: "" });
    expect(plantillaParaTipo("pagina")).toEqual({ url: "", titulo: "" });
    expect(plantillaParaTipo("enlace_libre")).toEqual({ url: "", titulo: "", descripcion: "" });
  });
});

describe("NFC1126O-d1-d3b · validación de campos", () => {
  describe("validarTitulo", () => {
    it("rechaza título vacío", () => {
      expect(validarTitulo("")).toBe("El título es obligatorio.");
      expect(validarTitulo("   ")).toBe("El título es obligatorio.");
    });
    it("rechaza título muy largo", () => {
      expect(validarTitulo("x".repeat(101))).toBe("El título no puede superar 100 caracteres.");
    });
    it("acepta título válido", () => {
      expect(validarTitulo("Mi presentación")).toBeNull();
      expect(validarTitulo("x".repeat(100))).toBeNull();
    });
  });

  describe("validarContenido", () => {
    it("rechaza null/undefined", () => {
      expect(validarContenido(null)).toBe("El contenido debe ser un objeto.");
      expect(validarContenido(undefined)).toBe("El contenido debe ser un objeto.");
    });
    it("rechaza arrays", () => {
      expect(validarContenido([])).toBe("El contenido debe ser un objeto.");
      expect(validarContenido([1, 2, 3])).toBe("El contenido debe ser un objeto.");
    });
    it("rechaza primitivos", () => {
      expect(validarContenido("texto")).toBe("El contenido debe ser un objeto.");
      expect(validarContenido(123)).toBe("El contenido debe ser un objeto.");
      expect(validarContenido(true)).toBe("El contenido debe ser un objeto.");
    });
    it("acepta objetos válidos", () => {
      expect(validarContenido({})).toBeNull();
      expect(validarContenido({ clave: "valor" })).toBeNull();
      expect(validarContenido({ texto: "Hola", enlaces: [] })).toBeNull();
    });
  });

  describe("validarCaducidad", () => {
    it("acepta cadena vacía", () => {
      expect(validarCaducidad("")).toBeNull();
    });
    it("rechaza fecha inválida", () => {
      expect(validarCaducidad("no-es-fecha")).toBe("Fecha de caducidad no válida.");
    });
    it("rechaza fecha en el pasado", () => {
      const pasado = new Date(Date.now() - 1000).toISOString().slice(0, 16);
      expect(validarCaducidad(pasado)).toBe("La caducidad debe ser posterior a la emisión.");
    });
    it("acepta fecha futura", () => {
      const futuro = new Date(Date.now() + 86400000).toISOString().slice(0, 16);
      expect(validarCaducidad(futuro)).toBeNull();
    });
  });
});