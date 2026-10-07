import { describe, it, expect } from "vitest";
import {
  leerCatalogo,
  candidatosDe,
  usable,
  profundidadNeedle,
  type EntradaCapa,
} from "../catalogo";

const entradaBase: EntradaCapa = {
  id: "prueba",
  familia: "familia/prueba",
  capa: "palabra",
  modelo: "Prueba 1B",
  version: "1.0",
  formato: "gguf",
  runtime: "llama-cpp",
  parametros: "1 B",
  disco_mb: 100,
  ram_min_mb: 512,
  sha256: "a".repeat(64),
  fuente_oficial: "https://huggingface.co/familia/prueba",
  espejos: [],
  estado: "recomendado",
  medios: ["web", "pwa", "nativo", "servidor"],
};

const catalogoFalso = {
  esquema: 1,
  actualizado: "2026-10-07",
  capas: [
    { ...entradaBase, id: "ternary-bonsai-8b", capa: "razon", disco_mb: 1750, medios: ["nativo", "servidor"] },
    { ...entradaBase, id: "bitnet-b1.58-2b-4t", capa: "razon", disco_mb: 1100, medios: ["nativo", "servidor"] },
    // Entradas mal formadas que leerCatalogo debe descartar:
    { id: "sin-capa" },
    { ...entradaBase, id: "capa-inventada", capa: "magia" },
    { ...entradaBase, id: "sin-medios", medios: [] },
    { ...entradaBase, id: "peso-negativo", disco_mb: -5 },
  ],
};

describe("leerCatalogo", () => {
  it("conserva las entradas válidas y descarta las mal formadas", () => {
    const c = leerCatalogo(catalogoFalso);
    expect(c.esquema).toBe(1);
    expect(c.capas.map((e) => e.id)).toEqual(["ternary-bonsai-8b", "bitnet-b1.58-2b-4t"]);
  });

  it("tolera JSON que no es catálogo", () => {
    expect(leerCatalogo(null).capas).toEqual([]);
    expect(leerCatalogo("texto").capas).toEqual([]);
    expect(leerCatalogo({}).capas).toEqual([]);
  });

  it("acepta profundidades bien formadas y rechaza las malas", () => {
    const buena = leerCatalogo({
      capas: [
        {
          ...entradaBase,
          capa: "reflejo",
          profundidades: [
            { capas: 2, disco_mb: 8 },
            { capas: 20, disco_mb: 29 },
          ],
        },
      ],
    });
    expect(buena.capas).toHaveLength(1);
    const mala = leerCatalogo({
      capas: [{ ...entradaBase, capa: "reflejo", profundidades: [{ capas: 0, disco_mb: 8 }] }],
    });
    expect(mala.capas).toEqual([]);
  });
});

describe("candidatosDe", () => {
  it("ordena de mejor a más ligero según la preferencia de la capa", () => {
    const catalogo = leerCatalogo({
      capas: [
        { ...entradaBase, id: "ternary-bonsai-1.7b", capa: "palabra", disco_mb: 370 },
        { ...entradaBase, id: "ternary-bonsai-4b", capa: "palabra", disco_mb: 860 },
        { ...entradaBase, id: "bonsai-1bit-1.7b", capa: "palabra", disco_mb: 250 },
      ],
    });
    expect(candidatosDe(catalogo, "palabra", "web").map((e) => e.id)).toEqual([
      "ternary-bonsai-4b",
      "ternary-bonsai-1.7b",
      "bonsai-1bit-1.7b",
    ]);
  });

  it("filtra por medio: lo que no corre en web no aparece", () => {
    const c = leerCatalogo(catalogoFalso);
    expect(candidatosDe(c, "razon", "web")).toEqual([]);
    expect(candidatosDe(c, "razon", "servidor").map((e) => e.id)).toEqual([
      "ternary-bonsai-8b",
      "bitnet-b1.58-2b-4t",
    ]);
  });

  it("los ids fuera de la tabla de preferencia van al final, por tamaño", () => {
    const catalogo = leerCatalogo({
      capas: [
        { ...entradaBase, id: "desconocido-grande", capa: "voz", disco_mb: 900 },
        { ...entradaBase, id: "vibeasr-cpp", capa: "voz", disco_mb: 500 },
        { ...entradaBase, id: "desconocido-chico", capa: "voz", disco_mb: 100 },
      ],
    });
    expect(candidatosDe(catalogo, "voz", "web").map((e) => e.id)).toEqual([
      "vibeasr-cpp",
      "desconocido-chico",
      "desconocido-grande",
    ]);
  });
});

describe("usable", () => {
  it("exige SHA-256 de 64 hex y estado recomendado o respaldo", () => {
    expect(usable(entradaBase)).toBe(true);
    expect(usable({ ...entradaBase, estado: "respaldo" })).toBe(true);
    expect(usable({ ...entradaBase, estado: "en-banco" })).toBe(false);
    expect(usable({ ...entradaBase, estado: "retirado" })).toBe(false);
  });

  it("nada sin SHA verificado es usable", () => {
    expect(usable({ ...entradaBase, sha256: "por-verificar" })).toBe(false);
    expect(usable({ ...entradaBase, sha256: "corta" })).toBe(false);
    expect(usable({ ...entradaBase, sha256: "A".repeat(64) })).toBe(false);
    expect(usable({ ...entradaBase, sha256: "g".repeat(64) })).toBe(false);
  });
});

describe("profundidadNeedle", () => {
  it("elige la mayor profundidad que cabe en el presupuesto", () => {
    expect(profundidadNeedle(29)).toBe(20);
    expect(profundidadNeedle(100)).toBe(20);
    expect(profundidadNeedle(20)).toBe(12);
    expect(profundidadNeedle(12)).toBe(6);
    expect(profundidadNeedle(8)).toBe(2);
  });

  it("sin presupuesto suficiente no hay reflejo local", () => {
    expect(profundidadNeedle(0)).toBe(0);
    expect(profundidadNeedle(7)).toBe(0);
  });
});
