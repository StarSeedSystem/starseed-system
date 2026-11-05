import { describe, it, expect } from "vitest";
import { pareceOpenUI } from "../detectar";

describe("pareceOpenUI", () => {
  it("retorna true si el texto empieza con @openuidev/react-lang@", () => {
    expect(pareceOpenUI("@openuidev/react-lang@1.1.0\nroot = Tarjeta(titulo: \"Hola\")")).toBe(true);
  });

  it("retorna false si el texto no empieza con la etiqueta", () => {
    expect(pareceOpenUI("Hola mundo")).toBe(false);
  });

  it("ignora espacios al inicio", () => {
    expect(pareceOpenUI("   @openuidev/react-lang@1.1.0\nroot = Tarjeta()")).toBe(true);
  });
});