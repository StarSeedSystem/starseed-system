/**
 * Pruebas de la matriz de cuantización de transformers por procesador.
 * Solo funciones puras de `src/lib/recursos-ia/cuantizacion-hf.ts`.
 */
import { describe, it, expect } from "vitest";
import { METODOS_HF, NOTA_BITNET, cuantizacionesPara } from "../cuantizacion-hf";

describe("METODOS_HF", () => {
    it("tiene ids únicos", () => {
        const ids = METODOS_HF.map((m) => m.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe("cuantizacionesPara", () => {
    it("en metal salen los métodos con soporte ok antes que los parciales", () => {
        const metodos = cuantizacionesPara("metal");
        const ids = metodos.map((m) => m.id);
        expect(ids).toContain("gguf");
        expect(ids).toContain("gptqmodel");
        expect(ids).toContain("optimum-quanto");
        expect(ids).toContain("metal");
        const posicion = (id: string): number => metodos.findIndex((m) => m.id === id);
        expect(posicion("metal")).toBeLessThan(posicion("bitsandbytes"));
    });

    it("en rocm salen AWQ y GPT-QModel", () => {
        const ids = cuantizacionesPara("rocm").map((m) => m.id);
        expect(ids).toContain("awq");
        expect(ids).toContain("gptqmodel");
    });

    it("alaVuelta + peft en cuda: incluye bitsandbytes y HQQ, pero no GGUF", () => {
        const ids = cuantizacionesPara("cuda", { alaVuelta: true, peft: true }).map((m) => m.id);
        expect(ids).toContain("bitsandbytes");
        expect(ids).toContain("hqq");
        expect(ids).not.toContain("gguf");
    });

    it("un bitsMax de 2 deja fuera AWQ y bitsandbytes", () => {
        const ids = cuantizacionesPara("cpu", { bitsMax: 2 }).map((m) => m.id);
        expect(ids).not.toContain("awq");
        expect(ids).not.toContain("bitsandbytes");
    });

    it("en intel no sale ningún método sin soporte", () => {
        const metodos = cuantizacionesPara("intel");
        expect(metodos.length).toBeGreaterThan(0);
        for (const m of metodos) {
            expect(m.soporte.intel).not.toBe("no");
        }
    });
});

describe("NOTA_BITNET", () => {
    it("menciona BitNet", () => {
        expect(NOTA_BITNET).toContain("BitNet");
    });
});
