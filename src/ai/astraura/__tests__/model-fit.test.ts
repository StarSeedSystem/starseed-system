import { describe, expect, it } from "vitest";
import { QUANT_BPP, QUANT_HIERARCHY, bestQuantForBudget, estimateMemoryGb, quantBpp } from "../model-fit";

describe("model-fit · cuantizaciones ternarias y 1-bit", () => {
    it("BitNet b1.58 2B en I2_S pesa ~1,1 GB (archivo real: 1,19 GB)", () => {
        const pesos = 2 * quantBpp("I2_S");
        expect(pesos).toBeGreaterThan(1.0);
        expect(pesos).toBeLessThan(1.25);
    });

    it("TQ1_0 ≈ 1,69 bits/peso y TQ2_0 ≈ 2,06 bits/peso (con margen de tensores en más precisión)", () => {
        expect(QUANT_BPP.TQ1_0 * 8).toBeGreaterThanOrEqual(1.69);
        expect(QUANT_BPP.TQ1_0 * 8).toBeLessThan(1.9);
        expect(QUANT_BPP.TQ2_0 * 8).toBeGreaterThanOrEqual(2.06);
        expect(QUANT_BPP.TQ2_0 * 8).toBeLessThan(2.3);
    });

    it("Ternary Bonsai Q2_0 y Bonsai 1-bit Q1_0 casan con sus archivos reales", () => {
        // Ternary-Bonsai-8B-Q2_0.gguf: 2.182.184.672 bytes; Bonsai-27B-Q1_0.gguf: 3.803.452.480 bytes.
        expect(8 * quantBpp("Q2_0")).toBeCloseTo(2.18, 1);
        expect(27 * quantBpp("Q1_0")).toBeCloseTo(3.8, 0);
        expect(quantBpp("Q1_0_g128")).toBe(quantBpp("Q1_0"));
    });

    it("el orden de tamaño es 1-bit < ternario < Q2_K < Q4_K_M", () => {
        expect(quantBpp("Q1_0")).toBeLessThan(quantBpp("TQ1_0"));
        expect(quantBpp("TQ1_0")).toBeLessThan(quantBpp("TQ2_0"));
        expect(quantBpp("TQ2_0")).toBeLessThan(quantBpp("Q2_K"));
        expect(quantBpp("Q2_K")).toBeLessThan(quantBpp("Q4_K_M"));
    });

    it("no cambia lo que ya había ni el recomendador de cuantizaciones", () => {
        expect(QUANT_BPP.Q4_K_M).toBe(0.58);
        expect(QUANT_BPP.Q8_0).toBe(1.05);
        expect(quantBpp("desconocida")).toBe(0.58);
        expect(QUANT_HIERARCHY).not.toContain("I2_S");
        expect(QUANT_HIERARCHY).not.toContain("TQ1_0");
        expect(bestQuantForBudget(7, 100, 4096)?.quant).toBe("Q8_0");
    });

    it("estimateMemoryGb usa la cuantización ternaria", () => {
        const ternario = estimateMemoryGb({ paramsB: 8, quant: "TQ2_0", ctx: 2048 });
        const q4 = estimateMemoryGb({ paramsB: 8, quant: "Q4_K_M", ctx: 2048 });
        expect(ternario).toBeLessThan(q4);
        expect(ternario).toBeCloseTo(8 * 0.27 + 0.000008 * 8 * 2048 + 0.5, 5);
    });
});
