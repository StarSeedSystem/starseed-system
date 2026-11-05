import { describe, expect, it } from "vitest";
import { Biblioteca } from "../biblioteca";

describe("Biblioteca StarSeed OS", () => {
  it("tiene los 7 componentes requeridos", () => {
    expect(Biblioteca.Card).toBeDefined();
    expect(Biblioteca.Table).toBeDefined();
    expect(Biblioteca.Steps).toBeDefined();
    expect(Biblioteca.Comparison).toBeDefined();
    expect(Biblioteca.Timeline).toBeDefined();
    expect(Biblioteca.List).toBeDefined();
    expect(Biblioteca.Action).toBeDefined();
  });

  it("tiene una función promptDeSistema generada", () => {
    expect(typeof Biblioteca.promptDeSistema).toBe("function");
  });

  it("promptDeSistema nombra los 7 componentes", () => {
    const prompt = Biblioteca.promptDeSistema();
    expect(prompt).toContain("Card");
    expect(prompt).toContain("Table");
    expect(prompt).toContain("Steps");
    expect(prompt).toContain("Comparison");
    expect(prompt).toContain("Timeline");
    expect(prompt).toContain("List");
    expect(prompt).toContain("Action");
  });

  it("cada componente es una función", () => {
    expect(typeof Biblioteca.Card).toBe("function");
    expect(typeof Biblioteca.Table).toBe("function");
    expect(typeof Biblioteca.Steps).toBe("function");
    expect(typeof Biblioteca.Comparison).toBe("function");
    expect(typeof Biblioteca.Timeline).toBe("function");
    expect(typeof Biblioteca.List).toBe("function");
    expect(typeof Biblioteca.Action).toBe("function");
  });
});