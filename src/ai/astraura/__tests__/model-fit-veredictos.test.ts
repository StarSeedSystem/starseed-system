import { describe, expect, it } from "vitest";
import {
  bestQuantForBudget,
  estimateMemoryGb,
  gpuBandwidthGbps,
  scoreFit,
  type BestQuantResult,
  type FitScore,
  type ScoreFitOpts,
} from "../model-fit";

describe("model-fit · veredictos de encaje (scoreFit)", () => {
  it("perfecto: GPU con recommendedGb ≤ disponible", () => {
    const required = estimateMemoryGb({ paramsB: 7, quant: "Q6_K", ctx: 8192 });
    const recommended = estimateMemoryGb({ paramsB: 7, quant: "Q4_K_M", ctx: 8192 });
    const available = recommended + 2; // margen cómodo
    const opts: ScoreFitOpts = {
      requiredGb: required,
      availableGb: available,
      recommendedGb: recommended,
      runMode: "gpu",
    };
    const result: FitScore = scoreFit(opts);
    expect(result.verdict).toBe("perfecto");
    expect(result.headroom).toBeGreaterThan(0);
  });

  it("bueno: GPU sin recommendedGb pero disponible ≥ requerido × 1.2", () => {
    const required = estimateMemoryGb({ paramsB: 7, quant: "Q6_K", ctx: 8192 });
    const available = required * 1.3; // ≥ 1.2
    const opts: ScoreFitOpts = {
      requiredGb: required,
      availableGb: available,
      runMode: "gpu",
    };
    const result: FitScore = scoreFit(opts);
    expect(result.verdict).toBe("bueno");
    expect(result.headroom).toBeGreaterThan(0);
  });

  it("justo: GPU sin recommendedGb y disponible < requerido × 1.2", () => {
    const required = estimateMemoryGb({ paramsB: 7, quant: "Q6_K", ctx: 8192 });
    const available = required * 1.1; // < 1.2 pero > 1.0
    const opts: ScoreFitOpts = {
      requiredGb: required,
      availableGb: available,
      runMode: "gpu",
    };
    const result: FitScore = scoreFit(opts);
    expect(result.verdict).toBe("justo");
    expect(result.headroom).toBeGreaterThan(0);
  });

  it("no-cabe: requerido > disponible (sin excepción)", () => {
    const required = estimateMemoryGb({ paramsB: 7, quant: "Q6_K", ctx: 8192 });
    const available = required * 0.9; // < 1.0
    const opts: ScoreFitOpts = {
      requiredGb: required,
      availableGb: available,
      runMode: "gpu",
    };
    const result: FitScore = scoreFit(opts);
    expect(result.verdict).toBe("no-cabe");
    expect(result.headroom).toBeLessThan(0);
  });

  it("modos no-GPU (moe-offload/cpu-offload/cpu-only): nunca perfecto", () => {
    const required = estimateMemoryGb({ paramsB: 7, quant: "Q6_K", ctx: 8192 });
    const available = required * 2.0; // mucho margen
    for (const runMode of ["moe-offload", "cpu-offload", "cpu-only"] as const) {
      const opts: ScoreFitOpts = {
        requiredGb: required,
        availableGb: available,
        runMode,
      };
      const result: FitScore = scoreFit(opts);
      expect(result.verdict).not.toBe("perfecto");
      expect(["bueno", "justo"]).toContain(result.verdict);
    }
  });

  it("tensor-parallel se trata como GPU (puede ser perfecto)", () => {
    const required = estimateMemoryGb({ paramsB: 7, quant: "Q6_K", ctx: 8192 });
    const recommended = estimateMemoryGb({ paramsB: 7, quant: "Q4_K_M", ctx: 8192 });
    const available = recommended + 2; // required ≈ 6.56, recommended ≈ 5.02, need available ≥ recommended
    const opts: ScoreFitOpts = {
      requiredGb: required,
      availableGb: available,
      recommendedGb: recommended,
      runMode: "tensor-parallel",
    };
    const result: FitScore = scoreFit(opts);
    expect(result.verdict).toBe("perfecto");
  });
});

describe("model-fit · bestQuantForBudget", () => {
  it("devuelve cuantización con ctx menor cuando solo cabe recortando contexto", () => {
    // Modelo que en Q3_K_M no cabe a ctx=8192 pero sí en Q2_K a ctx=4096
    const paramsB = 45;
    const budgetGb = 20;
    const ctx = 8192;
    const result: BestQuantResult | null = bestQuantForBudget(paramsB, budgetGb, ctx);
    expect(result).not.toBeNull();
    expect(result!.ctx).toBeLessThan(ctx);
    expect(result!.ctx).toBeGreaterThanOrEqual(1024);
    expect(result!.estimatedGb).toBeLessThanOrEqual(budgetGb);
  });

  it("devuelve null cuando no cabe ni recortando contexto al mínimo", () => {
    // Modelo muy grande para el presupuesto dado
    const paramsB = 100;
    const budgetGb = 8;
    const ctx = 8192;
    const result: BestQuantResult | null = bestQuantForBudget(paramsB, budgetGb, ctx);
    expect(result).toBeNull();
  });
});

describe("model-fit · gpuBandwidthGbps (coincidencia más larga)", () => {
  it("RTX 3060 Ti → valor de RTX 3060 Ti (no de RTX 3060)", () => {
    const bw = gpuBandwidthGbps("NVIDIA GeForce RTX 3060 Ti");
    expect(bw).toBe(448); // RTX 3060 Ti = 448 GB/s, RTX 3060 = 360 GB/s
  });

  it("cadena vacía → undefined", () => {
    expect(gpuBandwidthGbps("")).toBeUndefined();
  });

  it("undefined → undefined", () => {
    expect(gpuBandwidthGbps(undefined)).toBeUndefined();
  });

  it("sin coincidencia → undefined", () => {
    expect(gpuBandwidthGbps("AMD Radeon RX 9999")).toBeUndefined();
  });

  it("coincidencia parcial más larga gana (RX 7900 XTX vs RX 7900)", () => {
    expect(gpuBandwidthGbps("AMD Radeon RX 7900 XTX")).toBe(960);
  });
});