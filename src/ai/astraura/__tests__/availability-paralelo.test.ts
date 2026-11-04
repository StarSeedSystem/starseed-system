import { describe, expect, it, vi, afterEach } from "vitest";
import { detectAvailability } from "@/ai/astraura/availability";
import { FREE_CATALOG } from "@/ai/astraura/free-catalog";

describe("disponibilidad en paralelo", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("el tiempo total es el de la sonda más lenta, no la suma", async () => {
    const calls: { url: string; start: number; end: number }[] = [];

    const fetchFalso = vi.fn(async (entrada: string | URL) => {
      const url = String(entrada);
      const start = performance.now();
      await new Promise((r) => setTimeout(r, 50));
      const end = performance.now();
      calls.push({ url, start, end });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchFalso);
    (globalThis as { window?: object }).window = { location: { hostname: "localhost" }, navigator: { onLine: true } };

    const t0 = performance.now();
    await detectAvailability(false);
    const t1 = performance.now();
    const duracion = t1 - t0;
    
    console.log(`Total duration: ${duracion}ms, total calls: ${calls.length}`);
    
    expect(fetchFalso).toHaveBeenCalled();
    
    if (calls.length > 0) {
      // Check that calls overlap
      const minStart = Math.min(...calls.map(c => c.start));
      const maxEnd = Math.max(...calls.map(c => c.end));
      const span = maxEnd - minStart;
      const expectedSpanIfParallel = 50 + 10; // 50ms delay + overhead
      const expectedSpanIfSequential = calls.length * 50;
      
      console.log(`Span of calls: ${span}ms, expected if parallel: ~${expectedSpanIfParallel}ms, expected if sequential: ~${expectedSpanIfSequential}ms`);
      
      // The span should be close to the time of a single call, not the sum
      expect(span).toBeLessThan(expectedSpanIfSequential / 2);
    }
  });
  
  it("conserva el orden de preferencia del catálogo", async () => {
    const fetchFalso = vi.fn(async (entrada: string | URL) => {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchFalso);
    (globalThis as { window?: object }).window = { location: { hostname: "localhost" }, navigator: { onLine: true } };

    const resultado = await detectAvailability(true);
    
    const catalog = FREE_CATALOG;
    expect(resultado.length).toBe(catalog.length);
    
    // Verificar que el orden se conserva
    for (let i = 0; i < Math.min(resultado.length, catalog.length); i++) {
      expect(resultado[i].source.id).toBe(catalog[i].id);
    }
  });
});
