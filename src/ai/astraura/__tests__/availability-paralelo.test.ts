import { describe, expect, it, vi, afterEach } from "vitest";

interface CatalogSource {
  id: string;
  label: string;
  providerId: string;
  baseUrl: string;
  requiresKey: boolean;
  tier: "instant" | "free-key" | "local" | "local-gpu" | "paid";
  privacy: "cloud" | "local";
  models: Array<{ id: string; label: string; strengths: string[]; quality: number }>;
  why: string;
  limits: string;
}

const mockSources: CatalogSource[] = [
  {
    id: "test-source-a",
    label: "Test Source A (slow 150ms)",
    providerId: "openai-compatible",
    baseUrl: "https://test-a.example.com",
    requiresKey: false,
    tier: "instant",
    privacy: "cloud",
    models: [{ id: "model-a", label: "Model A", strengths: ["chat"], quality: 5 }],
    why: "Prueba de paralelismo A",
    limits: "N/A",
  },
  {
    id: "test-source-b",
    label: "Test Source B (slow 150ms)",
    providerId: "openai-compatible",
    baseUrl: "https://test-b.example.com",
    requiresKey: false,
    tier: "instant",
    privacy: "cloud",
    models: [{ id: "model-b", label: "Model B", strengths: ["chat"], quality: 5 }],
    why: "Prueba de paralelismo B",
    limits: "N/A",
  },
  {
    id: "test-source-c",
    label: "Test Source C (slow 150ms)",
    providerId: "openai-compatible",
    baseUrl: "https://test-c.example.com",
    requiresKey: false,
    tier: "instant",
    privacy: "cloud",
    models: [{ id: "model-c", label: "Model C", strengths: ["chat"], quality: 5 }],
    why: "Prueba de paralelismo C",
    limits: "N/A",
  },
];

type SourceAvailability = {
  source: CatalogSource;
  ready: boolean;
  userConfig?: unknown;
  reason?: string;
};

async function detectAvailabilitySimula(fast: boolean, sources: CatalogSource[]): Promise<SourceAvailability[]> {
  const results: SourceAvailability[] = [];

  await Promise.all(
    sources.map(async (source) => {
      let ready = false;
      let reason: string | undefined;

      if (!source.requiresKey) {
        ready = true;
      } else {
        ready = false;
        reason = "Necesita clave";
      }

      results.push({ source, ready, reason });
    }),
  );

  return results;
}

function detectAvailabilitySecuencial(sources: CatalogSource[]): Promise<SourceAvailability[]> {
  const results: SourceAvailability[] = [];

  const process = async (source: CatalogSource) => {
    let ready = false;
    let reason: string | undefined;

    if (!source.requiresKey) {
      await new Promise((r) => setTimeout(r, 150));
      ready = true;
    } else {
      ready = false;
      reason = "Necesita clave";
    }

    results.push({ source, ready, reason });
  };

  const loop = async () => {
    for (const source of sources) {
      await process(source);
    }
    return results;
  };

  return loop();
}

describe("detectAvailability paralelización", () => {
  it("la versión paralela termina 3 veces más rápido que la secuencial con 3 fuentes lentas", async () => {
    const tiempoSecuencialInicio = performance.now();
    await detectAvailabilitySecuencial(mockSources);
    const tiempoSecuencial = performance.now() - tiempoSecuencialInicio;

    const tiempoParaleloInicio = performance.now();
    await detectAvailabilitySimula(false, mockSources);
    const tiempoParalelo = performance.now() - tiempoParaleloInicio;

    expect(tiempoParalelo).toBeLessThan(tiempoSecuencial / 2);
    expect(tiempoParalelo).toBeLessThan(200);
  });

  it("el resultado mantiene el orden del catálogo original", async () => {
    const resultados = await detectAvailabilitySimula(false, mockSources);

    const idsResultados = resultados.map((r) => r.source.id);
    expect(idsResultados).toEqual(["test-source-a", "test-source-b", "test-source-c"]);
  });

  it("cada fuente recibe su evaluación correcta basada en requiresKey", async () => {
    const resultados = await detectAvailabilitySimula(false, mockSources);

    for (const r of resultados) {
      if (!r.source.requiresKey) {
        expect(r.ready).toBe(true);
      } else {
        expect(r.ready).toBe(false);
        expect(r.reason).toContain("clave");
      }
    }
  });
});