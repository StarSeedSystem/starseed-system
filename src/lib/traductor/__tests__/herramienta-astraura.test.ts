import { describe, it, expect } from "vitest";
import { ejecutarTraductor, EntradaTraductor } from "../herramienta-astraura";

// Mock service that returns reversed text
const mockService = {
  traducir: async (textos: string[], origen: string, destino: string) => {
    if (origen === "error") throw new Error("mock error");
    return textos.map((t) => `${t.split("").reverse().join("")} (translated)`);
  },
};

describe("ejecutarTraductor", () => {
  it("debe traducir texto válido", async () => {
    const entrada: EntradaTraductor = { texto: "Hola", origen: "es", destino: "en" };
    const res = await ejecutarTraductor(entrada, mockService);
    expect((res as any).traducciones).toEqual([
      "aloH (translated)",
    ]);
  });

  it("devuelve error si se proveen tanto texto como textos", async () => {
    const entrada: EntradaTraductor = {
      texto: "Solo", textos: ["Solo"],
      origen: "es",
      destino: "en",
    };
    const res = await ejecutarTraductor(entrada, mockService);
    expect((res as any).error).toBeDefined();
  });

  it("devuelve error si textos supera 20", async () => {
    const entrada: EntradaTraductor = {
      textos: Array.from({ length: 21 }, (_, i) => `texto${i}`),
      origen: "es",
      destino: "en",
    };
    const res = await ejecutarTraductor(entrada, mockService);
    expect((res as any).error).toBeDefined();
  });

  it("devuelve error del servicio", async () => {
    const entrada: EntradaTraductor = { texto: "Error", origen: "error", destino: "en" };
    const res = await ejecutarTraductor(entrada, mockService);
    expect((res as any).error).toBe("Error del servicio de traducción.");
  });

  it("no traduce si origen y destino son iguales", async () => {
    const entrada: EntradaTraductor = { texto: "SAME", origen: "es", destino: "es" };
    const res = await ejecutarTraductor(entrada, mockService);
    expect((res as any).traducciones).toEqual(["SAME"]);
    expect((res as any).aviso).toBe("idioma origen y destino son iguales; no se tradujo.");
  });

  it("protege fragmentos entre letras de código", async () => {
    const entrada: EntradaTraductor = {
      texto: "Código: \`const a = 1;\` dentro de \`\```,
      origen: "es",
      destino: "en",
    };
    const res = await ejecutarTraductor(entrada, mockService);
    const traduccion = (res as any).traducciones[0];
    // La cadena entre \\`\`\` debe permanecer sin traducir
    expect(traduccion.includes("const a = 1;")).toBe(true);
  });
});
