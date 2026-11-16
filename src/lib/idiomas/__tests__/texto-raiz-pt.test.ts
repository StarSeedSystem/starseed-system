import { describe, it, expect } from "vitest";
import pt from "../catalogos/pt.json";

describe("texto-raiz-pt", () => {
  it("contiene las traducciones requeridas para app/layout.tsx", () => {
    // Estas claves deben estar presentes en pt.json
    expect(pt.entradas).toHaveProperty("Saltar al contenido");
  });

  it("verifica la traducción de 'Saltar al contenido'", () => {
    expect(pt.entradas["Saltar al contenido"]).toBe("Saltar para o conteúdo");
  });
});
