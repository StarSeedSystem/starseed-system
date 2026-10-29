import { describe, expect, it } from "vitest";
import { cuantizacionesPara, METODOS_HF, NOTA_BITNET } from "../cuantizacion-hf";

describe("Matriz de cuantización de transformers", () => {
    it("los ids de método son únicos", () => {
        const ids = METODOS_HF.map((m) => m.id);
        expect(ids.length).toBe(9);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("en metal salen los cuatro con ok antes que los parciales", () => {
        const metal = cuantizacionesPara("metal");
        expect(metal.map((m) => m.id)).toContain("gguf");
        expect(metal.map((m) => m.id)).toContain("gptqmodel");
        expect(metal.map((m) => m.id)).toContain("optimum-quanto");
        expect(metal.map((m) => m.id)).toContain("metal");
        // Metal (kernels de Apple Silicon), ok, antes que bitsandbytes, parcial.
        const posMetal = metal.findIndex((m) => m.id === "metal");
        const posBits = metal.findIndex((m) => m.id === "bitsandbytes");
        expect(posMetal).toBeGreaterThanOrEqual(0);
        expect(posBits).toBeGreaterThan(posMetal);
        // AWQ con soporte «no» no entra.
        expect(metal.map((m) => m.id)).not.toContain("awq");
    });

    it("en rocm salen AWQ y GPT-QModel", () => {
        const rocm = cuantizacionesPara("rocm");
        expect(rocm.map((m) => m.id)).toContain("awq");
        expect(rocm.map((m) => m.id)).toContain("gptqmodel");
    });

    it("al vuelo con PEFT en cuda incluye bitsandbytes y HQQ pero no GGUF", () => {
        const op = { alaVuelta: true, peft: true };
        const cuda = cuantizacionesPara("cuda", op);
        expect(cuda.map((m) => m.id)).toContain("bitsandbytes");
        expect(cuda.map((m) => m.id)).toContain("hqq");
        expect(cuda.map((m) => m.id)).not.toContain("gguf");
    });

    it("con bitsMax 2 se quedan fuera AWQ y bitsandbytes", () => {
        const porBits = cuantizacionesPara("cuda", { bitsMax: 2 });
        expect(porBits.map((m) => m.id)).not.toContain("awq");
        expect(porBits.map((m) => m.id)).not.toContain("bitsandbytes");
    });

    it("en intel no sale ningún método con soporte «no»", () => {
        const intel = cuantizacionesPara("intel");
        expect(intel.length).toBeGreaterThan(0);
        for (const m of intel) {
            expect(m.soporte.intel).not.toBe("no");
        }
    });

    it("NOTA_BITNET menciona BitNet", () => {
        expect(NOTA_BITNET).toContain("BitNet");
    });
});
