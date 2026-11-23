import { describe, it, expect } from "vitest";
import { ejecutarAgenteReach, contieneUrl_valida, type ResultadoExtraccion } from "../agente-reach-ejemplo";

describe("agente-reach-ejemplo", () => {
  it("contieneUrl_valida: reconoce URLs válidas", () => {
    expect(contieneUrl_valida("https://example.com")).toBe(true);
    expect(contieneUrl_valida("http://test.es/path")).toBe(true);
    expect(contieneUrl_valida("  https://valid.com ")).toBe(true);
  });

  it("contieneUrl_valida: rechaza URLs inválidas", () => {
    expect(contieneUrl_valida("not-a-url")).toBe(false);
    expect(contieneUrl_valida("https://")).toBe(false);
    expect(contieneUrl_valida("")).toBe(false);
  });

  it("ejecutarAgenteReach: maneja canales sin resultados válidos", async () => {
    const resultado = ejecutarAgenteReach([]);
    expect(resultado).toEqual([]);
  });
});