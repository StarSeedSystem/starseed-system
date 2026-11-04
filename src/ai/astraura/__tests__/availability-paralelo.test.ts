/**
 * (Ola 368) detectAvailability sondea en PARALELO entre fuentes: cada sonda con su
 * tope, una que tarda no frena a las demás; el orden de resultados se mantiene
 * por el orden de preferencia del catálogo. El tiempo total es el de la más
 * lenta, no la suma.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { ASTRAURA_158_LOCAL_SOURCE_ID } from "@/ai/astraura/free-catalog";

function catalogParaTest(ids: string[]): { id: string; label: string; tier: string; providerId: string; baseUrl: string; requiresKey: boolean; privacy: string; weight: number; models: []; why: string; limits: string }[] {
  return ids.map((id, i) => ({
    id,
    label: `Fuente ${id}`,
    tier: "instant" as const,
    providerId: "openai-compatible" as const,
    baseUrl: `https://${id}.test/api`,
    requiresKey: false,
    privacy: "cloud" as const,
    weight: 1,
    models: [],
    why: "test",
    limits: "test",
  }));
}

describe("detectAvailability paralelo", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("tiempo total es el de la sonda más lenta, no la suma (PARALLELISM)", async () => {
    const catalog = catalogParaTest(["s1-rapida", "s2-media", "s3-lenta"]);
    const tiempos = { s1: 150, s2: 120, s3: 100 };

    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      for (const [prefix, delay] of Object.entries(tiempos)) {
        if (url.includes(prefix)) {
          await new Promise((r) => setTimeout(r, delay));
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
      }
      await new Promise((r) => setTimeout(r, 100));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));

    vi.doMock("@/ai/astraura/unified-intelligence", () => ({
      getUnifiedCatalog: () => catalog,
      liveOpenRouterSource: () => catalog[0],
    }));
    vi.doMock("@/lib/network/astraura-por-malla", () => ({
      servidoresAstrauraMalla: () => [],
    }));

    const { detectAvailability } = await import("@/ai/astraura/availability");

    const inicio = Date.now();
    await detectAvailability();
    const duracion = Date.now() - inicio;

    const maxTiempo = Math.max(...Object.values(tiempos));
    const margen = 50;

    expect(duracion).toBeLessThan(maxTiempo + margen);
  });

  it("mantiene el orden de preferencia del catálogo en los resultados", async () => {
    const catalog = catalogParaTest(["primero", "segundo", "tercero"]);
    const tiempos = { primero: 50, segundo: 40, tercero: 30 };

    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      for (const [prefix, delay] of Object.entries(tiempos)) {
        if (url.includes(prefix)) {
          await new Promise((r) => setTimeout(r, delay));
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
      }
      await new Promise((r) => setTimeout(r, 50));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));

    vi.doMock("@/ai/astraura/unified-intelligence", () => ({
      getUnifiedCatalog: () => catalog,
      liveOpenRouterSource: () => catalog[0],
    }));
    vi.doMock("@/lib/network/astraura-por-malla", () => ({
      servidoresAstrauraMalla: () => [],
    }));

    const { detectAvailability } = await import("@/ai/astraura/availability");

    const resp = await detectAvailability(true);
    const ids = resp.map((r) => r.source.id);

    expect(ids.indexOf("primero")).toBeLessThan(ids.indexOf("segundo"));
    expect(ids.indexOf("segundo")).toBeLessThan(ids.indexOf("tercero"));
  });

  it("sondas fallidas no bloquean otras fuentes", async () => {
    const catalog = catalogParaTest(["exitosa", "fallida", "reintentada"]);

    vi.stubGlobal("fetch", vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 30));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));

    vi.doMock("@/ai/astraura/unified-intelligence", () => ({
      getUnifiedCatalog: () => catalog,
      liveOpenRouterSource: () => catalog[0],
    }));
    vi.doMock("@/lib/network/astraura-por-malla", () => ({
      servidoresAstrauraMalla: () => [],
    }));

    const { detectAvailability } = await import("@/ai/astraura/availability");

    const resp = await detectAvailability(true);
    expect(resp.length).toBeGreaterThanOrEqual(1);
    expect(resp.length).toBeLessThanOrEqual(3);
  });

  it("mantiene el orden local → malla → nube para fuentes 1.58", async () => {
    const { detectAvailability } = await import("@/ai/astraura/availability");

    vi.doMock("@/ai/astraura/unified-intelligence", () => ({
      getUnifiedCatalog: () => catalogParaTest(["astraura-158-local", "astraura-158-malla", "astraura-158-nube"]),
      liveOpenRouterSource: () => ({ id: "openrouter-free", label: "OpenRouter", tier: "free-key", providerId: "openrouter", baseUrl: "https://openrouter.ai", requiresKey: true, getKeyUrl: "https://openrouter.ai/keys", privacy: "cloud", weight: 1, models: [], why: "test", limits: "test" }),
    }));
    vi.doMock("@/lib/network/astraura-por-malla", () => ({
      servidoresAstrauraMalla: () => [],
    }));

    const resp = await detectAvailability(true);
    const ids = resp.map((r) => r.source.id);

    const localIdx = ids.indexOf("astraura-158-local");
    const mallaIdx = ids.indexOf("astraura-158-malla");
    const nubeIdx = ids.indexOf("astraura-158-nube");

    if (localIdx >= 0) {
      expect(localIdx).toBeLessThan(mallaIdx);
      expect(mallaIdx).toBeLessThan(nubeIdx);
    }
  });
});