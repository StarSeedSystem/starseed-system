import { describe, it, expect } from "vitest";
import { getHabilidadesIngenieria } from "../ingenieria-a";

describe("getHabilidadesIngenieria", () => {
  it("debe devolver un array de cinco habilidades de ingeniería", () => {
    const habilidades = getHabilidadesIngenieria();
    expect(habilidades).toHaveLength(5);
  });

  it("cada habilidad debe tener las propiedades requeridas", () => {
    const habilidades = getHabilidadesIngenieria();
    habilidades.forEach((habilidad) => {
      expect(habilidad).toHaveProperty("id");
      expect(habilidad).toHaveProperty("nombre");
      expect(habilidad).toHaveProperty("cuando");
      expect(habilidad).toHaveProperty("tarjeta");
      expect(habilidad).toHaveProperty("resumen");
      expect(habilidad).toHaveProperty("rutaCompleta");
      expect(habilidad).toHaveProperty("licencia");
      expect(habilidad).toHaveProperty("autor");
      // Check types
      expect(typeof habilidad.id).toBe("string");
      expect(typeof habilidad.nombre).toBe("string");
      expect(typeof habilidad.cuando).toBe("string");
      expect(typeof habilidad.tarjeta).toBe("string");
      expect(typeof habilidad.resumen).toBe("string");
      expect(typeof habilidad.rutaCompleta).toBe("string");
      expect(typeof habilidad.licencia).toBe("string");
      expect(typeof habilidad.autor).toBe("string");
    });
  });

  // Helper function to count words
  const countWords = (text: string) => {
    return text.trim().split(/\s+/).filter((word) => word.length > 0).length;
  };

  it("cada habilidad debe respetar los límites de palabras para tarjeta y resumen", () => {
    const habilidades = getHabilidadesIngenieria();
    habilidades.forEach((habilidad) => {
      const tarjetaWordCount = countWords(habilidad.tarjeta);
      const resumenWordCount = countWords(habilidad.resumen);
      expect(tarjetaWordCount).toBeLessThanOrEqual(60);
      expect(resumenWordCount).toBeLessThanOrEqual(120);
    });
  });

  // Optional: check specific known values for the first skill (tdd)
  it("la primera habilidad debe ser TDD con valores esperados", () => {
    const habilidades = getHabilidadesIngenieria();
    const tdd = habilidades[0];
    expect(tdd.id).toBe("tdd");
    expect(tdd.nombre).toBe("Desarrollo Dirigido por Pruebas");
    expect(tdd.cuando).toBe("Utilizar cuando el usuario quiere construir características o corregir errores siguiendo un enfoque test-first, menciona 'rojo-verde-refactorizar', o quiere pruebas de integración.");
    expect(tdd.rutaCompleta).toBe("vendor/habilidades/mattpocock-skills/engineering/tdd/SKILL.md");
    expect(tdd.licencia).toBe("MIT");
    expect(tdd.autor).toBe("Matt Pocock");
  });
});