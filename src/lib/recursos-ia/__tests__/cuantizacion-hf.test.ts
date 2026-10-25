import { describe, expect, it } from "vitest";
import {
    METODOS_HF,
    NOTA_BITNET,
    cuantizacionesPara,
} from "../cuantizacion-hf";

describe("matriz de cuantización de transformers", () => {
    it("ids únicos en los 9 métodos", () => {
        expect(METODOS_HF).toHaveLength(9);
        expect(new Set(METODOS_HF.map((m) => m.id)).size).toBe(9);
    });

    it("en metal salen los que soporta y ok antes que parcial", () => {
        const metal = cuantizacionesPara("metal");
        const ids = metal.map((m) => m.id);
        expect(ids).toContain("gguf-llamacpp");
        expect(ids).toContain("gptqmodel");
        expect(ids).toContain("optimum-quanto");
        expect(ids).toContain("metal-apple-silicon");

        const okIds = metal.filter((m) => m.soporte.metal === "ok").map((m) => m.id);
        const primerosOk = okIds.findIndex((id) => id === "bitsandbytes");
        expect(primerosOk).toBe(-1);
        expect(metal.findIndex((m) => m.id === "bitsandbytes")).toBeGreaterThan(
            metal.findIndex((m) => m.id === "gptqmodel"),
        );
    });

    it("en rocm salen AWQ y GPT-QModel", () => {
        const rocm = cuantizacionesPara("rocm").map((m) => m.id);
        expect(rocm).toContain("awq");
        expect(rocm).toContain("gptqmodel");
    });

    it("al vuelo con peft en cuda: bitsandbytes y HQQ sí, GGUF no", () => {
        const cuda = cuantizacionesPara("cuda", { alaVuelta: true, peft: true }).map((m) => m.id);
        expect(cuda).toContain("bitsandbytes");
        expect(cuda).toContain("hqq");
        expect(cuda).not.toContain("gguf-llamacpp");
    });

    it("bitsMax 2 deja fuera AWQ y bitsandbytes", () => {
        const acotado = cuantizacionesPara("cpu", { bitsMax: 2 }).map((m) => m.id);
        expect(acotado).not.toContain("awq");
        expect(acotado).not.toContain("bitsandbytes");
        expect(acotado).toContain("gptqmodel");
    });

    it("en intel nada del resultado tiene soporte no", () => {
        const intel = cuantizacionesPara("intel");
        expect(intel.length).toBeGreaterThan(0);
        expect(intel.every((m) => m.soporte.intel !== "no")).toBe(true);
    });

    it("la nota de BitNet lo menciona", () => {
        expect(NOTA_BITNET).toContain("BitNet");
    });
});
