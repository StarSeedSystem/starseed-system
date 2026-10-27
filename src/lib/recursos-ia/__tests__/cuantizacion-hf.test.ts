import { describe, expect, it } from "vitest";
import {
  FUENTE_METODOS_HF,
  METODOS_HF,
  NOTA_BITNET,
  cuantizacionesPara,
} from "../cuantizacion-hf";

describe("cuantización de transformers por procesador", () => {
  it("los nueve métodos tienen id único, soporte completo entre cpu y intel, y enlace", () => {
    expect(METODOS_HF).toHaveLength(9);
    expect(new Set(METODOS_HF.map((m) => m.id)).size).toBe(9);
    for (const m of METODOS_HF) {
      expect(m.enlace).toMatch(/^https:\/\//);
      expect(m.bitsMin).toBeLessThanOrEqual(m.bitsMax);
      for (const d of ["cpu", "cuda", "rocm", "metal", "intel"] as const) {
        expect(["ok", "parcial", "no"]).toContain(m.soporte[d]);
      }
    }
    expect(FUENTE_METODOS_HF).toContain("quantization/overview.md");
  });

  it("en metal entran GGUF, GPT-QModel, optimum-quanto y Metal, ordenados ok antes que parcial", () => {
    const metal = cuantizacionesPara("metal");
    const ids = metal.map((m) => m.id);
    expect(ids).toContain("gguf");
    expect(ids).toContain("gptqmodel");
    expect(ids).toContain("optimum-quanto");
    expect(ids).toContain("metal");
    const ultimoOk = metal.findLastIndex((m) => m.soporte.metal === "ok");
    const primerParcial = metal.findIndex((m) => m.soporte.metal === "parcial");
    expect(ultimoOk).toBeLessThan(primerParcial);
    // El método Metal (ok) sale antes que bitsandbytes (parcial).
    expect(ids.indexOf("metal")).toBeLessThan(ids.indexOf("bitsandbytes"));
  });

  it("en rocm salen AWQ y GPT-QModel con soporte completo antes que los parciales", () => {
    const rocm = cuantizacionesPara("rocm");
    expect(rocm.map((m) => m.id).slice(0, 2)).toEqual(["awq", "gptqmodel"]);
    // Los «no» en rocm no salen: GGUF, HQQ, optimum-quanto.
    const ids = rocm.map((m) => m.id);
    expect(ids).not.toContain("gguf");
    expect(ids).not.toContain("hqq");
    expect(ids).not.toContain("optimum-quanto");
  });

  it("con alaVuelta y peft en cuda: bitsandbytes y HQQ sí, GGUF no", () => {
    const alVuelo = cuantizacionesPara("cuda", { alaVuelta: true, peft: true });
    const ids = alVuelo.map((m) => m.id);
    expect(ids).toContain("bitsandbytes");
    expect(ids).toContain("hqq");
    expect(ids).not.toContain("gguf");
    // torchao tiene peft desconocido (null): se queda fuera al exigir peft true.
    expect(ids).not.toContain("torchao");
    for (const m of alVuelo) {
      expect(m.alaVuelta).toBe(true);
      expect(m.peft).toBe(true);
    }
  });

  it("con bitsMax 2 quedan fuera AWQ y bitsandbytes (4 bits por piso)", () => {
    const cortos = cuantizacionesPara("cuda", { bitsMax: 2 });
    const ids = cortos.map((m) => m.id);
    expect(ids).not.toContain("awq");
    expect(ids).not.toContain("bitsandbytes");
    expect(ids).toContain("hqq");
    for (const m of cortos) {
      expect(m.bitsMin).toBeLessThanOrEqual(2);
    }
  });

  it("en intel ningún método devuelto queda sin soporte", () => {
    const intel = cuantizacionesPara("intel");
    // Metal no soporta intel: no sale nunca.
    expect(intel.map((m) => m.id)).not.toContain("metal");
    for (const m of intel) {
      expect(m.soporte.intel).not.toBe("no");
    }
  });

  it("la nota de BitNet avisa que no se cuantiza al vuelo", () => {
    expect(NOTA_BITNET).toContain("BitNet");
    expect(NOTA_BITNET).toContain("al vuelo");
    expect(NOTA_BITNET).toContain("QAT");
  });
});
