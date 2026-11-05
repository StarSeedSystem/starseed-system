import { describe, expect, it } from "vitest";
import { pareceOpenUI } from "../detectar";

describe("pareceOpenUI", () => {
  it("detecta como falso texto plano o markdown normal", () => {
    expect(pareceOpenUI("Hola, ¿cómo estás?")).toBe(false);
    expect(pareceOpenUI("Aquí tienes un resumen de la sesión.")).toBe(false);
    expect(pareceOpenUI("")).toBe(false);
  });

  it("detecta como verdadero texto con asignación root = Componente(...)", () => {
    expect(pareceOpenUI('root = Tarjeta("Hola", "Mundo")')).toBe(true);
    expect(pareceOpenUI('  root = Tabla("Datos", ["A"], [["1"]])')).toBe(true);
  });
});
