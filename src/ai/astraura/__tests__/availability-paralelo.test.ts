/**
 * (CTR1104S) detectAvailability ejecuta sondas en paralelo.
 * Cada sonda tiene su propio tope y una que tarda no frena a las demás.
 * El orden de preferencia del catálogo se preserva en el resultado.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { detectAvailability } from "@/ai/astraura/availability";

describe("detectAvailability (paralelo)", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete (globalThis as any).window;
    vi.unstubAllGlobals();
  });

  it("tiempo total es el de la sonda más lenta, no la suma", async () => {
    // Mock del catálogo con 3 fuentes con tiempos de respuesta distintos
    const catálogos = [
      { id: "rápida", providerId: "test", baseUrl: "http://rápida", tier: "local", requiresKey: false, label: "Rápida" },
      { id: "lenta", providerId: "test", baseUrl: "http://lenta", tier: "local", requiresKey: false, label: "Lenta" },
      { id: "media", providerId: "test", baseUrl: "http://media", tier: "local", requiresKey: false, label: "Media" },
    ];

    let resolveRápida: () => void;
    let resolveMedia: () => void;
    let resolveLenta: () => void;

    const promRápida = new Promise<never>(r => { resolveRápida = r; });
    const promMedia = new Promise<never>(r => { resolveMedia = r; });
    const promLenta = new Promise<never>(r => { resolveLenta = r; });

    (globalThis as any).window = {
      navigator: { onLine: true },
      localStorage: { getItem: () => null },
    };

    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("rápida")) {
        await promRápida;
        return new Response("{}", { status: 200 });
      }
      if (url.includes("media")) {
        await promMedia;
        return new Response("{}", { status: 200 });
      }
      if (url.includes("lenta")) {
        await promLenta;
        return new Response("{}", { status: 200 });
      }
      return new Response("{}", { status: 404 });
    }));

    // Mock getUnifiedCatalog
    const mod = await import("@/ai/astraura/availability");
    vi.spyOn(await import("@/ai/astraura/unified-intelligence"), "getUnifiedCatalog").mockReturnValue(catálogos as any);

    const start = Date.now();
    const disponibilidad = detectAvailability(false);

    // Resolver en momentos distintos
    setTimeout(() => resolveRápida!(), 10);
    setTimeout(() => resolveMedia!(), 30);
    setTimeout(() => resolveLenta!(), 50);

    await disponibilidad;
    const elapsed = Date.now() - start;

    // Debe haber terminado en ~50ms (máxima), no ~90ms (suma)
    expect(elapsed).toBeLessThan(90);

    // El orden del catálogo se preserva en el resultado
    expect((await disponibilidad).map(a => a.source.id)).toEqual(["rápida", "lenta", "media"]);
  });

  it("orden de preferencia se mantiene aunque las sondas respondan en orden distinto", async () => {
    const catálogos = [
      { id: "primera", providerId: "test", baseUrl: "http://primera", tier: "local", requiresKey: false, label: "Primera" },
      { id: "segunda", providerId: "test", baseUrl: "http://segunda", tier: "local", requiresKey: false, label: "Segunda" },
      { id: "tercera", providerId: "test", baseUrl: "http://tercera", tier: "local", requiresKey: false, label: "Tercera" },
    ];

    const tiempos: number[] = [];
    (globalThis as any).window = { navigator: { onLine: true }, localStorage: { getItem: () => null } };

    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const delay = url.includes("primera") ? 30 : url.includes("segunda") ? 10 : 20;
      await new Promise(r => setTimeout(r, delay));
      tiempos.push(delay);
      return new Response("{}", { status: 200 });
    }));

    vi.spyOn(await import("@/ai/astraura/unified-intelligence"), "getUnifiedCatalog").mockReturnValue(catálogos as any);

    const resultado = await detectAvailability(false);

    // Los resultados deben mantener el orden del catálogo original
    expect(resultado.map(a => a.source.id)).toEqual(["primera", "segunda", "tercera"]);
    // Las sondas se disparan en paralelo (la más rápida responde primero a pesar de estar última en el catálogo)
    expect(tiempos[0]).toBe(10);
  });
});
