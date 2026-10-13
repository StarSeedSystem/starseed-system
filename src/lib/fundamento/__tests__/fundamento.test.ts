import { describe, expect, it } from "vitest";

export const FUENTE = "memory/principles.md §0";
export const CITA_FUNDAMENTO = "diamante en esencia de conciencia, piedra filosofal, alquimia, autosustentable";
export const SIMBOLOS = [
  { pregunta: "¿Cuál es la fuente del conocimiento?" },
  { pregunta: "¿Qué es la piedra filosofal?" },
  { pregunta: "¿Cómo se logra la autosustentabilidad?" }
];

describe("FUENTE", () => {
  it("should have the correct source", () => {
    expect(FUENTE).toBe("memory/principles.md §0");
  });
});

describe("CITA_FUNDAMENTO", () => {
  it("should contain the required phrases in the citation", () => {
    expect(CITA_FUNDAMENTO).toContain("diamante en esencia de conciencia");
    expect(CITA_FUNDAMENTO).toContain("piedra filosofal");
    expect(CITA_FUNDAMENTO).toContain("alquimia");
    expect(CITA_FUNDAMENTO).toContain("autosustentable");
  });
});

describe("SIMBOLOS", () => {
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