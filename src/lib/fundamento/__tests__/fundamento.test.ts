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
});
