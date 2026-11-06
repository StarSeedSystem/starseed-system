import { describe, expect, it } from "vitest";
import { scoutModels, scoutSignature, hasNewScoutFindings, markScoutSeen } from "./model-scout";
import type { NeuronCapabilities, ScoutOptions } from "./model-scout";

/* ────────────────────────── Capacidades fijas (deterministas, sin red) ────────────────────────── */

// ALTA: Mac M3 Max, 64 GB, 16 núcleos, WebGPU, GPU discreta (Apple Silicon) → score 6+ = "alto"
const CAPS_ALTA: NeuronCapabilities = {
  platform: "macOS",
  browser: "Chrome 120",
  webgpu: true,
  webgl2: true,
  gpuRenderer: "Apple M3 Max",
  gpuVendor: "Apple",
  chromeAi: false,
  cores: 16,
  memoryGb: 64,
  storageQuotaGb: 100,
  storageUsedGb: 10,
  touch: false,
  installedApp: true,
  ollama: true,
  lmstudio: true,
  battery: { level: 100, charging: true },
};

// MEDIA: Windows, 16 GB, 8 núcleos, WebGPU, GPU integrada → score 4 = "medio"
const CAPS_MEDIA: NeuronCapabilities = {
  platform: "Windows",
  browser: "Chrome 120",
  webgpu: true,
  webgl2: true,
  gpuRenderer: "Intel UHD Graphics 770",
  gpuVendor: "Intel",
  chromeAi: false,
  cores: 8,
  memoryGb: 16,
  storageQuotaGb: 50,
  storageUsedGb: 5,
  touch: false,
  installedApp: false,
  ollama: true,
  lmstudio: false,
  battery: { level: 80, charging: false },
};

// BAJA: Linux, 8 GB, 4 núcleos, sin WebGPU, GPU integrada → score 2 = "bajo"
const CAPS_BAJA: NeuronCapabilities = {
  platform: "Linux",
  browser: "Firefox 120",
  webgpu: false,
  webgl2: true,
  gpuRenderer: "Intel UHD Graphics",
  gpuVendor: "Intel",
  chromeAi: false,
  cores: 4,
  memoryGb: 8,
  storageQuotaGb: 20,
  storageUsedGb: 2,
  touch: false,
  installedApp: false,
  ollama: false,
  lmstudio: false,
  battery: { level: 50, charging: false },
};

/* ────────────────────────── Helpers ────────────────────────── */

function ids(recs: { spec: { id: string } }[]): string[] {
  return recs.map((r) => r.spec.id);
}

function verdicts(recs: { verdict: string }[]): string[] {
  return recs.map((r) => r.verdict);
}

/* ────────────────────────── Tests ────────────────────────── */

describe("scoutModels · end-to-end con capacidades fijas", () => {
  const opts: ScoutOptions = { kind: "llm", limit: 10 };

  it("gama baja: modelos no-cabe excluidos de best; recibe solo los que caben (incluyendo justo)", () => {
    const res = scoutModels(CAPS_BAJA, opts);
    // Verifica que NO hay modelos con veredicto "no-cabe" en best
    const noCabeEnBest = res.best.some((r) => r.verdict === "no-cabe");
    expect(noCabeEnBest).toBe(false);
    // Verifica que best no está vacío (hay modelos de servidor + algunos locales)
    expect(res.best.length).toBeGreaterThan(0);
    // Los modelos de servidor siempre están
    expect(ids(res.best)).toContain("starseed-llm");
    expect(ids(res.best)).toContain("openrouter-llm");
  });

  it("gama alta: recibe al menos los mismos modelos que la media y además los mayores locales", () => {
    const resAlta = scoutModels(CAPS_ALTA, opts);
    const resMedia = scoutModels(CAPS_MEDIA, opts);

    const idsAlta = new Set(ids(resAlta.best));
    const idsMedia = new Set(ids(resMedia.best));

    // Todos los modelos que caben en media también caben en alta
    for (const id of idsMedia) {
      expect(idsAlta.has(id)).toBe(true);
    }
    // Alta tiene modelos locales adicionales más grandes
    expect(idsAlta.has("ollama-large")).toBe(true);
    expect(idsAlta.has("ollama-mid")).toBe(true);
  });

  it("orden estable entre dos llamadas consecutivas", () => {
    const res1 = scoutModels(CAPS_ALTA, opts);
    const res2 = scoutModels(CAPS_ALTA, opts);

    expect(ids(res1.best)).toEqual(ids(res2.best));
    expect(verdicts(res1.best)).toEqual(verdicts(res2.best));
    expect(res1.summary).toBe(res2.summary);
  });

  it("scoutSignature solo cambia cuando cambia la selección (catálogo o hardware)", () => {
    const catalogLen = 16; // ALL_LLM_SPECS.length típico

    // Misma firma con mismos inputs
    const sig1 = scoutSignature(CAPS_ALTA, catalogLen);
    const sig2 = scoutSignature(CAPS_ALTA, catalogLen);
    expect(sig1).toBe(sig2);

    // Cambia si cambia la RAM
    const capsDistintaRam = { ...CAPS_ALTA, memoryGb: 32 };
    const sigRam = scoutSignature(capsDistintaRam, catalogLen);
    expect(sigRam).not.toBe(sig1);

    // Cambia si cambia el GPU renderer
    const capsDistintoGpu = { ...CAPS_ALTA, gpuRenderer: "Apple M2" };
    const sigGpu = scoutSignature(capsDistintoGpu, catalogLen);
    expect(sigGpu).not.toBe(sig1);

    // Cambia si cambia el tamaño del catálogo
    const sigCatalog = scoutSignature(CAPS_ALTA, catalogLen + 1);
    expect(sigCatalog).not.toBe(sig1);

    // Cambia si cambia webgpu
    const capsSinWebgpu = { ...CAPS_ALTA, webgpu: false };
    const sigWebgpu = scoutSignature(capsSinWebgpu, catalogLen);
    expect(sigWebgpu).not.toBe(sig1);

    // Cambia si cambia cores
    const capsDistintosCores = { ...CAPS_ALTA, cores: 8 };
    const sigCores = scoutSignature(capsDistintosCores, catalogLen);
    expect(sigCores).not.toBe(sig1);

    // Cambia si cambia platform
    const capsDistintaPlatform = { ...CAPS_ALTA, platform: "Windows" };
    const sigPlatform = scoutSignature(capsDistintaPlatform, catalogLen);
    expect(sigPlatform).not.toBe(sig1);
  });

  it("hasNewScoutFindings / markScoutSeen funciona sin lanzar", () => {
    const sig = scoutSignature(CAPS_ALTA, 16);

    // Primera vez: hay novedades (no hay firma guardada)
    expect(hasNewScoutFindings(sig)).toBe(true);

    // Marcamos como vista
    markScoutSeen(sig);

    // Segunda vez: ya no hay novedades
    expect(hasNewScoutFindings(sig)).toBe(false);

    // Otra firma distinta sí tiene novedades
    const sigOtra = scoutSignature(CAPS_MEDIA, 16);
    expect(hasNewScoutFindings(sigOtra)).toBe(true);
  });

  it("gama media: tiene modelos locales y servidor en best", () => {
    const res = scoutModels(CAPS_MEDIA, opts);
    const idsBest = ids(res.best);

    // Modelos de servidor siempre perfecto
    expect(idsBest).toContain("starseed-llm");
    expect(idsBest).toContain("openrouter-llm");

    // Algunos locales caben (ollama-small, astraura-158, etc.)
    expect(idsBest).toContain("ollama-small");
    expect(idsBest).toContain("astraura-158");
  });

  it("deltaVsCurrent se calcula cuando hay usedModelIds y hay modelo mejor en best", () => {
    // Usa ollama-small (bueno en alta), best tiene ollama-large (bueno) y server (perfecto)
    const res = scoutModels(CAPS_ALTA, { ...opts, usedModelIds: ["ollama-small"] });

    // ollama-small está en current
    const currentIds = ids(res.current);
    expect(currentIds).toContain("ollama-small");

    // Los modelos mejores en best tienen deltaVsCurrent
    // Server models son perfecto > bueno, así que tienen delta
    const serverModel = res.best.find((r) => r.spec.id === "starseed-llm");
    expect(serverModel?.deltaVsCurrent).toBeDefined();
    expect(serverModel?.deltaVsCurrent).toContain("mejor ajuste");
  });

  it("hasBetter es true cuando hay modelo perfecto/bueno estrictamente mejor que lo usado", () => {
    // Usa ollama-small (bueno), hay server models (perfecto) en best → hasBetter = true
    const res = scoutModels(CAPS_ALTA, { ...opts, usedModelIds: ["ollama-small"] });
    expect(res.hasBetter).toBe(true);

    // Usa modelo de servidor (perfecto), no hay nada mejor → hasBetter = false
    const resServer = scoutModels(CAPS_ALTA, { ...opts, usedModelIds: ["starseed-llm"] });
    expect(resServer.hasBetter).toBe(false);
  });

  it("resumen en español coherente con el tier", () => {
    const resAlta = scoutModels(CAPS_ALTA, opts);
    const resMedia = scoutModels(CAPS_MEDIA, opts);
    const resBaja = scoutModels(CAPS_BAJA, opts);

    expect(resAlta.summary).toContain("Gama alta");
    expect(resMedia.summary).toContain("Gama media");
    expect(resBaja.summary).toContain("Gama modesta");
  });
});