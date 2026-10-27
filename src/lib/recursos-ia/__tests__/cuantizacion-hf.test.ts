import { describe, it, expect } from "vitest";
import { METODOS_HF, NOTA_BITNET, cuantizacionesPara } from "../cuantizacion-hf";

describe("METODOS_HF", () => {
  it("tiene ids únicos", () => {
    const ids = METODOS_HF.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("recoge los nueve métodos de la tabla", () => {
    expect(METODOS_HF).toHaveLength(9);
  });
});

describe("cuantizacionesPara", () => {
  it("en metal salen GGUF, GPT-QModel, optimum-quanto y Metal, con ok antes que parcial", () => {
    const lista = cuantizacionesPara("metal");
    const ids = lista.map((m) => m.id);
    expect(ids).toContain("gguf");
    expect(ids).toContain("gptqmodel");
    expect(ids).toContain("optimum-quanto");
    expect(ids).toContain("metal");
    expect(lista[0].soporte.metal).toBe("ok");
    const posBits = ids.indexOf("bitsandbytes");
    const posMetal = ids.indexOf("metal");
    expect(posMetal).toBeLessThan(posBits);
  });

  it("en rocm no salen GGUB ni HQQ, pero sí AWQ y GPT-QModel", () => {
    const ids = cuantizacionesPara("rocm").map((m) => m.id);
    expect(ids).toContain("awq");
    expect(ids).toContain("gptqmodel");
    expect(ids).not.toContain("gguf");
    expect(ids).not.toContain("hqq");
    expect(ids).not.toContain("torchao");
  });

  it("alaVuelta + peft en cuda incluye bitsandbytes y HQQ pero no GGUF", () => {
    const ids = cuantizacionesPara("cuda", { alaVuelta: true, peft: true }).map((m) => m.id);
    expect(ids).toContain("bitsandbytes");
    expect(ids).toContain("hqq");
    expect(ids).not.toContain("gguf");
  });

  it("bitsMax 2 deja fuera AWQ y bitsandbytes", () => {
    const ids = cuantizacionesPara("cuda", { bitsMax: 2 }).map((m) => m.id);
    expect(ids).not.toContain("awq");
    expect(ids).not.toContain("bitsandbytes");
    expect(ids).toContain("gptqmodel");
  });

  it("en intel todos los métodos tienen soporte distinto de no", () => {
    for (const m of cuantizacionesPara("intel")) {
      expect(m.soporte.intel).not.toBe("no");
    }
  });

  it("NOTA_BITNET menciona BitNet", () => {
    expect(NOTA_BITNET).toContain("BitNet");
  });
});
