// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  scoutModels,
  scoutSignature,
  hasNewScoutFindings,
  markScoutSeen,
  type ScoutOptions,
  type ScoutResult,
} from "../model-scout";
import type { NeuronCapabilities } from "@/lib/neurons/neurons";

const CATALOG_LEN = 24;

const HIGH_END: NeuronCapabilities = {
  platform: "macOS",
  browser: "Chrome 148",
  cores: 12,
  memoryGb: 64,
  webgpu: true,
  webgl2: true,
  gpuRenderer: "Apple M3 Max",
  gpuVendor: "Apple",
  chromeAi: false,
  ollama: true,
  lmstudio: false,
  installedApp: true,
};

const MID_RANGE: NeuronCapabilities = {
  platform: "Windows",
  browser: "Edge 140",
  cores: 8,
  memoryGb: 16,
  webgpu: true,
  webgl2: true,
  gpuRenderer: "Intel(R) Iris(R) Xe Graphics",
  gpuVendor: "Intel",
  chromeAi: false,
  ollama: false,
  lmstudio: false,
  installedApp: false,
};

const LOW_END: NeuronCapabilities = {
  platform: "Android",
  browser: "Chrome 148",
  cores: 4,
  memoryGb: 8,
  webgpu: false,
  webgl2: true,
  gpuRenderer: "Adreno (TM) 730",
  gpuVendor: "Qualcomm",
  chromeAi: false,
  ollama: false,
  lmstudio: false,
  installedApp: false,
};

describe("scoutModels · end-to-end con NeuronCapabilities fijas", () => {
  it("gama baja: no recibe modelos que no le caben (veredicto no-cabe filtrado)", () => {
    const result: ScoutResult = scoutModels(LOW_END, { kind: "llm", limit: 10 });
    const noCabe = result.best.some((r) => r.verdict === "no-cabe");
    expect(noCabe).toBe(false);
    expect(result.best.length).toBeGreaterThan(0);
    for (const r of result.best) {
      expect(r.verdict).not.toBe("no-cabe");
    }
  });

  it("gama alta: recibe al menos los mismos modelos que la media y mayores", () => {
    const midResult = scoutModels(MID_RANGE, { kind: "llm", limit: 10 });
    const highResult = scoutModels(HIGH_END, { kind: "llm", limit: 10 });

    const midIds = new Set(midResult.best.map((r) => r.spec.id));
    const highIds = new Set(highResult.best.map((r) => r.spec.id));

    for (const id of midIds) {
      expect(highIds.has(id)).toBe(true);
    }
    expect(highResult.best.length).toBeGreaterThanOrEqual(midResult.best.length);
  });

  it("orden estable entre dos llamadas consecutivas", () => {
    const r1 = scoutModels(HIGH_END, { kind: "llm", limit: 10 });
    const r2 = scoutModels(HIGH_END, { kind: "llm", limit: 10 });

    expect(r1.best.map((x) => x.spec.id)).toEqual(r2.best.map((x) => x.spec.id));
  });

  it("gama media: tiene opciones servidor perfectas y algunas locales", () => {
    const result = scoutModels(MID_RANGE, { kind: "llm", limit: 10 });
    const serverOpts = result.best.filter((r) => r.spec.access !== "local");
    const localOpts = result.best.filter((r) => r.spec.access === "local");

    expect(serverOpts.length).toBeGreaterThan(0);
    for (const r of serverOpts) {
      expect(r.verdict).toBe("perfecto");
      expect(r.requiredGb).toBe(0);
    }
    expect(localOpts.length).toBeGreaterThan(0);
  });

  it("deltaVsCurrent aparece en best cuando hay usedModelIds y hay diferencia relevante", () => {
    const usedIds = ["ollama-small", "starseed-llm"];
    const result = scoutModels(HIGH_END, { kind: "llm", usedModelIds: usedIds, limit: 10 });

    for (const r of result.best) {
      if (usedIds.includes(r.spec.id)) {
        expect(r.isCurrentlyUsed).toBe(true);
      } else if (r.deltaVsCurrent !== undefined) {
        expect(typeof r.deltaVsCurrent).toBe("string");
        expect(r.deltaVsCurrent.length).toBeGreaterThan(0);
      }
    }
    for (const r of result.current) {
      expect(r.isCurrentlyUsed).toBe(true);
    }
  });

  it("sin usedModelIds → deltaVsCurrent es undefined en best", () => {
    const result = scoutModels(HIGH_END, { kind: "llm", limit: 10 });
    for (const r of result.best) {
      expect(r.deltaVsCurrent).toBeUndefined();
    }
  });

  it("hasBetter es true solo cuando hay algo mejor (perfecto/bueno) que lo usado", () => {
    const usedIds = ["ollama-small"];
    const result = scoutModels(HIGH_END, { kind: "llm", usedModelIds: usedIds, limit: 10 });
    expect(result.hasBetter).toBe(true);

    const resultNoBetter = scoutModels(LOW_END, { kind: "llm", usedModelIds: ["starseed-llm"], limit: 10 });
    expect(resultNoBetter.hasBetter).toBe(false);
  });

  it("sin usedModelIds → hasBetter false y current vacío", () => {
    const result = scoutModels(HIGH_END, { kind: "llm", limit: 10 });
    expect(result.hasBetter).toBe(false);
    expect(result.current.length).toBe(0);
  });

  it("kind voz: filtra solo modelos de voz", () => {
    const result = scoutModels(HIGH_END, { kind: "voz", limit: 10 });
    for (const r of result.best) {
      expect(r.spec.kind).toBe("voz");
    }
  });

  it("summary en español listo para UI", () => {
    const result = scoutModels(HIGH_END, { kind: "llm", limit: 10 });
    expect(typeof result.summary).toBe("string");
    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.summary).toMatch(/Tu equipo/);
  });
});

describe("scoutSignature · firma estable del hardware+catálogo", () => {
  it("devuelve firma determinista para mismas caps y catálogo", () => {
    const s1 = scoutSignature(HIGH_END, CATALOG_LEN);
    const s2 = scoutSignature(HIGH_END, CATALOG_LEN);
    expect(s1).toBe(s2);
    expect(s1).toMatch(/^\d+\.[a-z0-9]+$/);
  });

  it("cambia si cambia el tamaño del catálogo", () => {
    const s1 = scoutSignature(HIGH_END, CATALOG_LEN);
    const s2 = scoutSignature(HIGH_END, CATALOG_LEN + 1);
    expect(s1).not.toBe(s2);
  });

  it("cambia si cambia la RAM", () => {
    const s1 = scoutSignature(HIGH_END, CATALOG_LEN);
    const s2 = scoutSignature({ ...HIGH_END, memoryGb: 32 }, CATALOG_LEN);
    expect(s1).not.toBe(s2);
  });

  it("cambia si cambia la GPU", () => {
    const s1 = scoutSignature(HIGH_END, CATALOG_LEN);
    const s2 = scoutSignature({ ...HIGH_END, gpuRenderer: "NVIDIA RTX 4090" }, CATALOG_LEN);
    expect(s1).not.toBe(s2);
  });

  it("cambia si cambia WebGPU", () => {
    const s1 = scoutSignature(HIGH_END, CATALOG_LEN);
    const s2 = scoutSignature({ ...HIGH_END, webgpu: false }, CATALOG_LEN);
    expect(s1).not.toBe(s2);
  });

  it("cambia si cambian los núcleos", () => {
    const s1 = scoutSignature(HIGH_END, CATALOG_LEN);
    const s2 = scoutSignature({ ...HIGH_END, cores: 8 }, CATALOG_LEN);
    expect(s1).not.toBe(s2);
  });

  it("no cambia cuando la selección de modelos es la misma (mismo hardware + mismo catálogo)", () => {
    const r1 = scoutModels(HIGH_END, { kind: "llm", limit: 10 });
    const r2 = scoutModels(HIGH_END, { kind: "llm", limit: 10 });
    const sel1 = r1.best.map((x) => x.spec.id).join(",");
    const sel2 = r2.best.map((x) => x.spec.id).join(",");

    const s1 = scoutSignature(HIGH_END, r1.best.length + r1.current.length);
    const s2 = scoutSignature(HIGH_END, r2.best.length + r2.current.length);

    expect(sel1).toBe(sel2);
    expect(s1).toBe(s2);
  });

  it("no lanza con caps incompletas", () => {
    expect(() => scoutSignature({} as NeuronCapabilities, CATALOG_LEN)).not.toThrow();
    expect(() => scoutSignature(null as unknown as NeuronCapabilities, CATALOG_LEN)).not.toThrow();
  });
});

describe("hasNewScoutFindings / markScoutSeen · patrón firma+visto", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("sin firma guardada → hay novedades (true)", () => {
    const sig = scoutSignature(HIGH_END, CATALOG_LEN);
    expect(hasNewScoutFindings(sig)).toBe(true);
  });

  it("misma firma ya vista → NO hay novedades (false)", () => {
    const sig = scoutSignature(HIGH_END, CATALOG_LEN);
    markScoutSeen(sig);
    expect(hasNewScoutFindings(sig)).toBe(false);
  });

  it("firma distinta a la vista → hay novedades (true)", () => {
    const sigOld = scoutSignature(HIGH_END, CATALOG_LEN);
    markScoutSeen(sigOld);
    const sigNew = scoutSignature({ ...HIGH_END, memoryGb: 32 }, CATALOG_LEN);
    expect(hasNewScoutFindings(sigNew)).toBe(true);
  });

  it("markScoutSeen marca la firma como vista", () => {
    const sig = scoutSignature(HIGH_END, CATALOG_LEN);
    expect(hasNewScoutFindings(sig)).toBe(true);
    markScoutSeen(sig);
    expect(hasNewScoutFindings(sig)).toBe(false);
  });

  it("no lanza aunque localStorage falle", () => {
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = () => {
      throw new Error("quota exceeded");
    };
    expect(() => markScoutSeen("test")).not.toThrow();
    expect(() => hasNewScoutFindings("test")).not.toThrow();
    localStorage.setItem = originalSetItem;
  });
});

describe("ScoutOptions · tipos y valores por defecto", () => {
  it("kind opcional: sin kind combina ambos catálogos", () => {
    const result = scoutModels(HIGH_END, { limit: 20 });
    const kinds = new Set(result.best.map((r) => r.spec.kind));
    expect(kinds.has("llm")).toBe(true);
    expect(kinds.has("voz")).toBe(true);
  });

  it("limit por defecto = 6", () => {
    const result = scoutModels(HIGH_END, { kind: "llm" });
    expect(result.best.length).toBeLessThanOrEqual(6);
  });

  it("limit personalizado respeta el tope", () => {
    const result = scoutModels(HIGH_END, { kind: "llm", limit: 3 });
    expect(result.best.length).toBeLessThanOrEqual(3);
  });
});