import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { detectAvailability, interpretarPing, type SourceAvailability } from "../availability";
import { getUnifiedCatalog } from "../unified-intelligence";
import type { CatalogSource } from "../free-catalog";
import type { ProviderId } from "@/ai/providers/types";

vi.mock("../unified-intelligence", () => ({
  getUnifiedCatalog: vi.fn(),
}));

vi.mock("../installed-models", () => ({
  isDownloadableSource: vi.fn(() => false),
  isModelInstalled: vi.fn(() => false),
}));

vi.mock("../builtin-engines", () => ({
  chromeAiAvailable: vi.fn(() => false),
  webgpuAvailable: vi.fn(() => false),
}));

vi.mock("../ready-sources-snapshot", () => ({
  publicarFuentesListas: vi.fn(),
}));

vi.mock("../destino-local", () => ({
  paginaEsLocal: vi.fn(() => ({ location: { hostname: "localhost" } } as any)),
}));

vi.mock("@/lib/neurons/neurons", () => ({
  settingsFor: vi.fn(() => ({})),
  thisDeviceId: vi.fn(() => "device-1"),
}));

vi.mock("../astraura-158", () => ({
  urlPuenteLocal: vi.fn((path?: string) => `http://localhost:9002/api/ai/astraura-158${path || ""}`),
}));

vi.mock("@/lib/network/astraura-por-malla", () => ({
  servidoresAstrauraMalla: vi.fn(() => []),
}));

vi.mock("../router", () => ({
  getIntelligenceSettings: vi.fn(() => ({})),
}));

function crearFuente(id: string, providerId: ProviderId): CatalogSource {
  return {
    id,
    providerId,
    label: id,
    tier: "local",
    baseUrl: `http://${id}`,
    requiresKey: false,
    privacy: "local",
    models: [],
    limits: "100",
    why: "test",
    weight: 1,
  } as CatalogSource;
}

describe("detectAvailability paralelismo", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("debe preservar el orden de preferencia del catálogo", async () => {
    const first = crearFuente("first", "openai");
    const second = crearFuente("second", "anthropic");
    (getUnifiedCatalog as any).mockReturnValue([first, second]);

    vi.stubGlobal("fetch", vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 30));
      return new Response("{}", { status: 200 });
    }));

    const result = await detectAvailability(false);
    expect(result[0].source.id).toBe("first");
    expect(result[1].source.id).toBe("second");
  });

  it("debe ejecutar sondas en paralelo y el tiempo total es el de la más lenta", async () => {
    const sources = [
      crearFuente("s1", "openai"),
      crearFuente("s2", "anthropic"),
      crearFuente("s3", "google"),
    ];
    (getUnifiedCatalog as any).mockReturnValue(sources);

    vi.stubGlobal("fetch", vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return new Response("{}", { status: 200 });
    }));

    const start = Date.now();
    await detectAvailability(false);
    const end = Date.now();

    expect(end - start).toBeLessThan(150);
  });

  it("el tiempo total es el de la sonda más lenta, no la suma", async () => {
    const sources = [
      crearFuente("s1", "openai"),
      crearFuente("s2", "anthropic"),
      crearFuente("s3", "google"),
    ];
    (getUnifiedCatalog as any).mockReturnValue(sources);

    const start = Date.now();
    await detectAvailability(false);
    const end = Date.now();

    expect(end - start).toBeLessThan(150);
  });
});

describe("interpretarPing", () => {
  it("ping ok ⇒ lista, sin motivo", () => {
    expect(
      interpretarPing({ ok: true, motor_local: true, dormido: false, vivo: true, version: "1.58", t: 1 })
    ).toEqual({ lista: true });
  });

  it("BitNet dormido (vivo:false && dormido:true) ⇒ lista con motivo", () => {
    const r = interpretarPing({ ok: true, dormido: true, vivo: false });
    expect(r.lista).toBe(true);
    expect(r.motivo).toMatch(/BitNet dormido/);
  });

  it("{ok:false} ⇒ no lista", () => {
    expect(interpretarPing({ ok: false })).toEqual({ lista: false });
  });

  it("basura (null, string, número, array, objeto vacío, ok no-booleano) ⇒ no lista", () => {
    expect(interpretarPing(null)).toEqual({ lista: false });
    expect(interpretarPing("hola")).toEqual({ lista: false });
    expect(interpretarPing(123)).toEqual({ lista: false });
    expect(interpretarPing([1, 2, 3])).toEqual({ lista: false });
    expect(interpretarPing({})).toEqual({ lista: false });
    expect(interpretarPing({ ok: "no" })).toEqual({ lista: false });
  });

  it("/api/bitnet/estado (sin campo ok) también se interpreta", () => {
    expect(interpretarPing({ dormido: false, vivo: true, puerto: 8000 }).lista).toBe(true);
    expect(interpretarPing({ dormido: true, vivo: false }).motivo).toMatch(/BitNet dormido/);
  });
});