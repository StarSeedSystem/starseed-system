import { describe, expect, it } from "vitest";
import { scoutModels, classifyDeviceTier } from "./model-scout";
import type { NeuronCapabilities } from "@/lib/neurons/neurons";

const CAPS_ALTA: NeuronCapabilities = {
  platform: "macOS", browser: "Chrome 120", webgpu: true, webgl2: true,
  gpuRenderer: "Apple M3 Max", gpuVendor: "Apple", chromeAi: false,
  cores: 16, memoryGb: 64, storageQuotaGb: 100, storageUsedGb: 10,
  touch: false, installedApp: true, ollama: true, lmstudio: true,
  battery: { level: 100, charging: true },
};

const CAPS_MEDIA: NeuronCapabilities = {
  platform: "Windows", browser: "Chrome 120", webgpu: true, webgl2: true,
  gpuRenderer: "NVIDIA GeForce RTX 3060", gpuVendor: "NVIDIA", chromeAi: false,
  cores: 12, memoryGb: 16, storageQuotaGb: 50, storageUsedGb: 5,
  touch: false, installedApp: false, ollama: true, lmstudio: false,
  battery: { level: 80, charging: false },
};

const CAPS_BAJA: NeuronCapabilities = {
  platform: "Linux", browser: "Firefox 120", webgpu: false, webgl2: true,
  gpuRenderer: "Intel UHD Graphics", gpuVendor: "Intel", chromeAi: false,
  cores: 4, memoryGb: 8, storageQuotaGb: 20, storageUsedGb: 2,
  touch: false, installedApp: false, ollama: false, lmstudio: false,
  battery: { level: 50, charging: false },
};

describe("debug", () => {
  it("debug tiers", () => {
    console.log("ALTA tier:", classifyDeviceTier(CAPS_ALTA));
    console.log("MEDIA tier:", classifyDeviceTier(CAPS_MEDIA));
    console.log("BAJA tier:", classifyDeviceTier(CAPS_BAJA));
  });

  it("debug scoutModels", () => {
    const opts = { kind: "llm" as const, limit: 10 };
    
    const resAlta = scoutModels(CAPS_ALTA, opts);
    console.log("\nALTA best:", resAlta.best.map(r => `${r.spec.id}:${r.verdict}:${r.requiredGb.toFixed(1)}GB`).join(", "));
    console.log("ALTA summary:", resAlta.summary);
    console.log("ALTA tier:", resAlta.tier);
    
    const resMedia = scoutModels(CAPS_MEDIA, opts);
    console.log("\nMEDIA best:", resMedia.best.map(r => `${r.spec.id}:${r.verdict}:${r.requiredGb.toFixed(1)}GB`).join(", "));
    console.log("MEDIA summary:", resMedia.summary);
    console.log("MEDIA tier:", resMedia.tier);
    
    const resBaja = scoutModels(CAPS_BAJA, opts);
    console.log("\nBAJA best:", resBaja.best.map(r => `${r.spec.id}:${r.verdict}:${r.requiredGb.toFixed(1)}GB`).join(", "));
    console.log("BAJA summary:", resBaja.summary);
    console.log("BAJA tier:", resBaja.tier);
  });
});