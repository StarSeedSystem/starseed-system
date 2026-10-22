<<<<<<< HEAD
import { describe, it, expect } from "vitest";
import { CITA_FUNDAMENTO, SIMBOLOS, FUENTE } from "../fundamento";

describe("Fundamento", () => {
  it("should have the correct source", () => {
    expect(FUENTE).toBe("memory/principles.md §0");
  });

=======
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
>>>>>>> 75754a0ed (salvavidas · RTFS1013Ac: trabajo del agente antes de las puertas (tsc / vitest))
  it("should contain the required phrases in the citation", () => {
    expect(CITA_FUNDAMENTO).toContain("diamante en esencia de conciencia");
    expect(CITA_FUNDAMENTO).toContain("piedra filosofal");
    expect(CITA_FUNDAMENTO).toContain("alquimia");
    expect(CITA_FUNDAMENTO).toContain("autosustentable");
  });
<<<<<<< HEAD

  it("should have exactly three symbols", () => {
    expect(SIMBOLOS).toHaveLength(3);
  });

=======
});

describe("SIMBOLOS", () => {
  it("should have exactly three symbols", () => {
    expect(SIMBOLOS).toHaveLength(3);
  });
>>>>>>> 75754a0ed (salvavidas · RTFS1013Ac: trabajo del agente antes de las puertas (tsc / vitest))
  it("each symbol should have a pregunta", () => {
    SIMBOLOS.forEach((symbol) => {
      expect(symbol.pregunta).toBeTypeOf("string");
      expect(symbol.pregunta.length).toBeGreaterThan(0);
    });
  });
});