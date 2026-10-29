import { describe, it, expect } from "vitest";
import {
  METODOS_HF,
  NOTA_BITNET,
  cuantizacionesPara,
  type MetodoCuantizacion,
} from "../cuantizacion-hf";

describe("METODOS_HF", () => {
  it("tiene ids únicos", () => {
    const ids = METODOS_HF.map((m: MetodoCuantizacion) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("cuantizacionesPara", () => {
  it("en metal salen GGUF, GPT-QModel, optimum-quanto y el método Metal, con los ok antes que bitsandbytes (parcial)", () => {
    const nombres = cuantizacionesPara("metal").map((m) => m.nombre);
    expect(nombres).toContain("GGUF (llama.cpp)");
    expect(nombres).toContain("GPT-QModel");
    expect(nombres).toContain("optimum-quanto");
    expect(nombres).toContain("Metal (kernels de Apple Silicon)");
    const metal = nombres.indexOf("Metal (kernels de Apple Silicon)");
    const bnb = nombres.indexOf("bitsandbytes");
    expect(metal).toBeGreaterThan(-1);
    expect(bnb).toBeGreaterThan(-1);
    expect(metal).toBeLessThan(bnb);
  });

  it("en rocm salen AWQ y GPT-QModel", () => {
    const nombres = cuantizacionesPara("rocm").map((m) => m.nombre);
    expect(nombres).toContain("AWQ");
    expect(nombres).toContain("GPT-QModel");
  });

  it("en cuda, alaVuelta y peft incluyen bitsandbytes y HQQ, pero no GGUF", () => {
    const out = cuantizacionesPara("cuda", { alaVuelta: true, peft: true });
    const nombres = out.map((m) => m.nombre);
    expect(nombres).toContain("bitsandbytes");
    expect(nombres).toContain("HQQ");
    expect(nombres).not.toContain("GGUF (llama.cpp)");
  });

  it("con bitsMax 2 quedan fuera AWQ y bitsandbytes", () => {
    const nombres = cuantizacionesPara("cuda", { bitsMax: 2 }).map((m) => m.nombre);
    expect(nombres).not.toContain("AWQ");
    expect(nombres).not.toContain("bitsandbytes");
  });

  it("NOTA_BITNET menciona BitNet", () => {
    expect(NOTA_BITNET).toContain("BitNet");
  });
});
