import { describe, expect, it } from "vitest";
import { METODOS_HF, NOTA_BITNET, cuantizacionesPara } from "../cuantizacion-hf";

describe("matriz de cuantización de transformers", () => {
    it("los nueve métodos tienen ids únicos", () => {
        expect(METODOS_HF).toHaveLength(9);
        expect(new Set(METODOS_HF.map((m) => m.id)).size).toBe(9);
    });

    it("en metal salen GGUF, GPT-QModel, optimum-quanto y Metal, y lo ok va antes que lo parcial", () => {
        const enMetal = cuantizacionesPara("metal");
        const nombres = enMetal.map((m) => m.nombre);
        expect(nombres).toContain("GGUF (llama.cpp)");
        expect(nombres).toContain("GPT-QModel");
        expect(nombres).toContain("optimum-quanto");
        expect(nombres).toContain("Metal (kernels de Apple Silicon)");
        expect(nombres.indexOf("Metal (kernels de Apple Silicon)")).toBeLessThan(nombres.indexOf("bitsandbytes"));
        expect(enMetal[0].soporte.metal).toBe("ok");
    });

    it("en rocm salen AWQ y GPT-QModel", () => {
        const enRocm = cuantizacionesPara("rocm");
        expect(enRocm.map((m) => m.nombre)).toContain("AWQ");
        expect(enRocm.map((m) => m.nombre)).toContain("GPT-QModel");
        expect(enRocm.every((m) => m.soporte.rocm !== "no")).toBe(true);
    });

    it("cuantización al vuelo con PEFT en cuda: bitsandbytes y HQQ, sin GGUF", () => {
        const alVuelo = cuantizacionesPara("cuda", { alaVuelta: true, peft: true });
        const nombres = alVuelo.map((m) => m.nombre);
        expect(nombres).toContain("bitsandbytes");
        expect(nombres).toContain("HQQ");
        expect(nombres).not.toContain("GGUF (llama.cpp)");
        expect(alVuelo.every((m) => m.alaVuelta && m.peft === true)).toBe(true);
    });

    it("bitsMax 2 deja fuera AWQ y bitsandbytes", () => {
        const pocasBits = cuantizacionesPara("cuda", { bitsMax: 2 });
        const nombres = pocasBits.map((m) => m.nombre);
        expect(nombres).not.toContain("AWQ");
        expect(nombres).not.toContain("bitsandbytes");
        expect(pocasBits.every((m) => m.bitsMin <= 2)).toBe(true);
    });

    it("en intel no sale ningún método sin soporte", () => {
        const enIntel = cuantizacionesPara("intel");
        expect(enIntel.every((m) => m.soporte.intel !== "no")).toBe(true);
    });

    it("la nota de BitNet lo menciona", () => {
        expect(NOTA_BITNET).toContain("BitNet");
        expect(NOTA_BITNET).toContain("QAT");
    });
});
