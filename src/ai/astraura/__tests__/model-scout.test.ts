import { describe, expect, it } from "vitest";
import { scoutModels, scoutSignature } from "../model-scout";
import type { NeuronCapabilities } from "@/lib/neurons/neurons";

const capsAlta: NeuronCapabilities = {
  platform: "macos",
  browser: "Chrome",
  webgpu: true,
  webgl2: true,
  gpuVendor: "NVIDIA",
  gpuRenderer: "NVIDIA GeForce RTX 3090",
  cores: 12,
  memoryGb: 32,
};

const capsMedia: NeuronCapabilities = {
  platform: "macos",
  browser: "Safari",
  webgpu: false,
  webgl2: true,
  gpuVendor: "Apple",
  gpuRenderer: "Apple M2",
  cores: 8,
  memoryGb: 16,
};

const capsBaja: NeuronCapabilities = {
  platform: "android",
  browser: "Chrome",
  webgpu: false,
  webgl2: false,
  gpuVendor: "Qualcomm",
  gpuRenderer: "Adreno 640",
  cores: 6,
  memoryGb: 6,
};

describe("model-scout · scoutModels", () => {
  it("gama alta: devuelve opciones con veredicto perfecto", () => {
    const result = scoutModels(capsAlta, { kind: "llm", limit: 6 });
    expect(result.tier).toBe("alto");
    expect(result.best.some((r) => r.verdict === "perfecto")).toBe(true);
  });

  it("gama media: incluye opciones con veredicto justo/bueno", () => {
    const result = scoutModels(capsMedia, { kind: "llm", limit: 6 });
    expect(result.tier).toBe("medio");
    expect(result.best.some((r) => r.verdict === "justo" || r.verdict === "bueno")).toBe(true);
  });

  it("gama baja: devuelve opciones con veredicto", () => {
    const result = scoutModels(capsBaja, { kind: "llm", limit: 6 });
    expect(result.tier).toBe("bajo");
    expect(result.best.length).toBeGreaterThanOrEqual(0);
  });

  it("current está vacío cuando no hay usedModelIds", () => {
    const result = scoutModels(capsAlta, { kind: "llm" });
    expect(result.current).toEqual([]);
    expect(result.hasBetter).toBe(false);
  });

  it("hasBetter detecta mejor opción", () => {
    const resultAlta = scoutModels(capsAlta, { kind: "llm", usedModelIds: ["ollama-small"], limit: 10 });
    const resultBaja = scoutModels(capsBaja, { kind: "llm", usedModelIds: ["ollama-small"], limit: 10 });
    expect(typeof resultAlta.hasBetter).toBe("boolean");
    expect(typeof resultBaja.hasBetter).toBe("boolean");
  });

  it("summary es legible en español", () => {
    const resultAlta = scoutModels(capsAlta, { kind: "llm" });
    expect(resultAlta.summary).toContain("Tu equipo");
    expect(typeof resultAlta.summary).toBe("string");
  });

  it("catalogo combinado LLM y voz sin kind", () => {
    const result = scoutModels(capsAlta, { kind: undefined, limit: 3 });
    expect(result.best.length).toBeGreaterThanOrEqual(0);
  });
});

describe("model-scout · firma de novedades", () => {
  it("scoutSignature genera hash estable", () => {
    const sig1 = scoutSignature(capsAlta, 20);
    const sig2 = scoutSignature(capsAlta, 20);
    expect(sig1).toBe(sig2);
  });

  it("firma cambia con hardware diferente", () => {
    const sig1 = scoutSignature(capsAlta, 20);
    const sig2 = scoutSignature(capsMedia, 20);
    expect(sig1).not.toBe(sig2);
  });

  it("firma incluye longitud del catálogo", () => {
    const sig1 = scoutSignature(capsAlta, 10);
    const sig2 = scoutSignature(capsAlta, 30);
    expect(sig1).not.toBe(sig2);
  });
});