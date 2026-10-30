import { readFileSync } from "node:fs";
import { join } from "node:path";
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

describe("catálogo JSON · Ternary Bonsai 2 en el banco (1025R)", () => {
  const crudo = readFileSync(join(process.cwd(), "config/capas-astraura.json"), "utf8");
  const catalogo = leerCatalogo(JSON.parse(crudo));
  const ids = ["ternary-bonsai2-2b", "ternary-bonsai2-4b", "ternary-bonsai2-9b"];

  it("las tres entradas del banco existen y no se promueven", () => {
    for (const id of ids) {
      const entrada = catalogo.capas.find((e) => e.id === id);
      expect(entrada, id).toBeDefined();
      expect(entrada?.estado).toBe("en-banco");
      expect(entrada?.familia).toBe("prism-ml/Ternary-Bonsai");
      expect(entrada?.formato).toBe("gguf");
      expect(entrada?.runtime).toBe("llama-cpp");
      expect(entrada?.medios).toEqual(["nativo", "servidor"]);
      expect(entrada?.espejos).toEqual([]);
      expect(entrada?.verificado).toBe("2026-10-25");
      expect(usable(entrada!)).toBe(false);
    }
  });

  it("cada una trae SHA de 64 hex en minúsculas y tamaño medido", () => {
    for (const id of ids) {
      const entrada = catalogo.capas.find((e) => e.id === id)!;
      expect(entrada.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(entrada.sha256).toBe(entrada.sha256.toLowerCase());
      expect(entrada.tamano_bytes).toBeGreaterThan(0);
      expect(entrada.archivo).toMatch(/^Ternary-Bonsai-2-(2|4|9)B-PTQ1_0\.gguf$/);
    }
  });

  it("el JSON sigue siendo válido y los ids siguen siendo únicos", () => {
    const crudoJson = JSON.parse(crudo) as { capas: { id: string }[] };
    const todos = crudoJson.capas.map((e) => e.id);
    expect(new Set(todos).size).toBe(todos.length);
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
