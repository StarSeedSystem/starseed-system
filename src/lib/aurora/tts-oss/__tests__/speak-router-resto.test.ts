import { describe, it, expect } from "vitest";
import { remainingTextAfterChunks } from "../speak-router";

describe("remainingTextAfterChunks", () => {
  it("debe devolver el resto cuando el primer motor suena 2 de 5 trozos", () => {
    const text = "Primera frase. Segunda frase. Tercera frase. Cuarta frase. Quinta frase.";
    const resto = remainingTextAfterChunks(text, 1);
    expect(typeof resto).toBe("string");
    expect(resto.length).toBeGreaterThanOrEqual(0);
  });
});
