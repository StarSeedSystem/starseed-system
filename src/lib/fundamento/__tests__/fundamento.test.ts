import { describe, it, expect } from "vitest";
import { CITA_FUNDAMENTO, SIMBOLOS, FUENTE } from "../fundamento";

describe("Fundamento", () => {
  it("should have the correct source", () => {
    expect(FUENTE).toBe("memory/principles.md §0");
  });

  it("should contain the required phrases in the citation", () => {
    expect(CITA_FUNDAMENTO).toContain("diamante en esencia de conciencia");
    expect(CITA_FUNDAMENTO).toContain("piedra filosofal");
    expect(CITA_FUNDAMENTO).toContain("alquimia");
    expect(CITA_FUNDAMENTO).toContain("autosustentable");
  });

  it("should have exactly three symbols", () => {
    expect(SIMBOLOS).toHaveLength(3);
  });

  it("each symbol should have a pregunta", () => {
    SIMBOLOS.forEach((symbol) => {
      expect(symbol.pregunta).toBeTypeOf("string");
      expect(symbol.pregunta.length).toBeGreaterThan(0);
    });
  });

  it("los tres símbolos son el diamante, la piedra filosofal y la alquimia", () => {
    expect(SIMBOLOS.map((symbol) => symbol.id)).toEqual(["diamante", "piedra", "alquimia"]);
  });

  it("cada símbolo trae su nombre y su «es» con contenido", () => {
    SIMBOLOS.forEach((symbol) => {
      expect(symbol.nombre.trim().length).toBeGreaterThan(0);
      expect(symbol.es.trim().length).toBeGreaterThan(0);
    });
  });

  it("las tres preguntas son distintas entre sí", () => {
    expect(new Set(SIMBOLOS.map((symbol) => symbol.pregunta)).size).toBe(3);
  });

  it("cada pregunta es una pregunta de verdad", () => {
    SIMBOLOS.forEach((symbol) => {
      expect(symbol.pregunta.startsWith("¿")).toBe(true);
      expect(symbol.pregunta.endsWith("?")).toBe(true);
    });
  });

  it("el «es» de cada símbolo trae la palabra ancla de Alex", () => {
    const esDe = (id: "diamante" | "piedra" | "alquimia"): string =>
      SIMBOLOS.find((symbol) => symbol.id === id)?.es ?? "";
    expect(esDe("diamante")).toContain("sistema completo");
    expect(esDe("piedra")).toContain("estructura y metodología");
    expect(esDe("alquimia")).toContain("autosustentable");
  });

  it("la cita conserva las palabras de Alex aunque la fuente las parta en líneas", () => {
    const cita = CITA_FUNDAMENTO.replace(/\s+/g, " ");
    expect(cita).toContain("diamante en esencia de conciencia");
    expect(cita).toContain("piedra filosofal");
    expect(cita).toContain("alquimia de la transformación a oro");
    expect(cita).toContain("autosustentable");
  });
});
