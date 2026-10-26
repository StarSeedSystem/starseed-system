import { describe, it, expect } from "vitest";
import { saludar, agente } from "../src/agente.mjs";

describe("agente Mastra", () => {
  it("exporta el agente con nombre esperado", () => {
    expect(agente.name).toBe("AgenteStarSeed");
  });

  it("la herramienta saludar es una función pura", async () => {
    const res = await saludar.execute({ nombre: "Alex" });
    expect(res.mensaje).toBe("Hola, Alex");
  });
});
