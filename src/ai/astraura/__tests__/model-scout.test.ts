import { describe, it, expect } from "vitest";
import { scoutModels, scoutSignature, type NeuronCapabilities } from "../model-scout";

const CAPS_ALTA: NeuronCapabilities = {
  platform: "macOS",
  browser: "Chrome 148",
  webgpu: true,
  webgl2: true,
  gpuRenderer: "Apple M3 Max",
  gpuVendor: "Apple",
  chromeAi: false,
  cores: 16,
  memoryGb: 48,
  ollama: true,
  lmstudio: false,
};

const CAPS_MEDIA: NeuronCapabilities = {
  platform: "Windows",
  browser: "Chrome 148",
  webgpu: true,
  webgl2: true,
  gpuRenderer: "NVIDIA GeForce RTX 3060",
  gpuVendor: "NVIDIA",
  chromeAi: false,
  cores: 12,
  memoryGb: 16,
  ollama: true,
  lmstudio: false,
};

const CAPS_BAJA: NeuronCapabilities = {
  platform: "Linux",
  browser: "Firefox 130",
  webgpu: false,
  webgl2: true,
  gpuRenderer: "Intel UHD Graphics 620",
  gpuVendor: "Intel",
  chromeAi: false,
  cores: 4,
  memoryGb: 8,
  ollama: false,
  lmstudio: false,
};

describe("scoutModels end-to-end con capacidades fijas", () => {
  it("gama baja: no recibe modelos locales que no le caben", () => {
    const result = scoutModels(CAPS_BAJA, { kind: "llm" });

    const locales = result.best.filter((r) => r.spec.access === "local");
    for (const r of locales) {
      expect(r.verdict).not.toBe("no-cabe");
    }

    const noCabe = result.best.filter((r) => r.verdict === "no-cabe");
    expect(noCabe.length).toBe(0);
  });

  it("gama alta: recibe al menos los mismos modelos que la media", () => {
    const alta = scoutModels(CAPS_ALTA, { kind: "llm", limit: 20 });
    const media = scoutModels(CAPS_MEDIA, { kind: "llm", limit: 20 });

    const altaIds = new Set(alta.best.map((r) => r.spec.id));
    const mediaIds = new Set(media.best.map((r) => r.spec.id));

    for (const id of mediaIds) {
      expect(altaIds.has(id)).toBe(true);
    }
  });

  it("orden estable entre dos llamadas consecutivas", () => {
    const r1 = scoutModels(CAPS_MEDIA, { kind: "llm", limit: 10 });
    const r2 = scoutModels(CAPS_MEDIA, { kind: "llm", limit: 10 });

    const ids1 = r1.best.map((r) => r.spec.id);
    const ids2 = r2.best.map((r) => r.spec.id);

    expect(ids1).toEqual(ids2);
  });

  it("scoutSignature solo cambia cuando cambia la selección", () => {
    const sig1 = scoutSignature(CAPS_MEDIA, 20);
    const sig2 = scoutSignature(CAPS_MEDIA, 20);
    expect(sig1).toBe(sig2);

    const sigDistinto = scoutSignature(CAPS_MEDIA, 21);
    expect(sigDistinto).not.toBe(sig1);

    const sigOtroHardware = scoutSignature(CAPS_ALTA, 20);
    expect(sigOtroHardware).not.toBe(sig1);
  });

  it("modelos de servidor siempre tienen veredicto perfecto", () => {
    const result = scoutModels(CAPS_BAJA, { kind: "llm" });

    const servidores = result.best.filter((r) => r.spec.access !== "local");
    for (const r of servidores) {
      expect(r.verdict).toBe("perfecto");
      expect(r.requiredGb).toBe(0);
    }
  });

  it("deltaVsCurrent se calcula cuando hay usedModelIds", () => {
    const result = scoutModels(CAPS_ALTA, {
      kind: "llm",
      usedModelIds: ["ollama-small"],
    });

    const current = result.current.find((r) => r.spec.id === "ollama-small");
    expect(current).toBeDefined();

    const best = result.best[0];
    if (best && best.spec.id !== "ollama-small") {
      expect(best.deltaVsCurrent).toBeDefined();
    }
  });

  it("hasBetter es true solo si hay algo mejor que lo usado", () => {
    const sinUsados = scoutModels(CAPS_ALTA, { kind: "llm" });
    expect(sinUsados.hasBetter).toBe(false);

    const conPeor = scoutModels(CAPS_ALTA, {
      kind: "llm",
      usedModelIds: ["ollama-small"],
    });
    expect(conPeor.hasBetter).toBe(true);

    const conMejor = scoutModels(CAPS_BAJA, {
      kind: "llm",
      usedModelIds: ["starseed-llm"],
    });
    expect(conMejor.hasBetter).toBe(false);
  });

  it("resumen en español listo para UI", () => {
    const result = scoutModels(CAPS_MEDIA, { kind: "llm" });

    expect(typeof result.summary).toBe("string");
    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.summary).toMatch(/Tu equipo/);
  });
});

describe("scoutModels con kind voz", () => {
  it("devuelve recomendaciones de voz para gama baja", () => {
    const result = scoutModels(CAPS_BAJA, { kind: "voz" });

    expect(result.best.length).toBeGreaterThan(0);
    for (const r of result.best) {
      expect(r.spec.kind).toBe("voz");
    }
  });

  it("Piper siempre cabe en gama baja (CPU only, 0.1 GB)", () => {
    const result = scoutModels(CAPS_BAJA, { kind: "voz", limit: 20 });
    const piper = result.best.find((r) => r.spec.id === "piper");

    expect(piper).toBeDefined();
    expect(piper!.verdict).not.toBe("no-cabe");
  });
});