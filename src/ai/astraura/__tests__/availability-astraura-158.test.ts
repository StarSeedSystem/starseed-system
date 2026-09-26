/**
 * (Ola 278 · OS1 · 2026-09-07) Tests de la función pura `interpretarPing`, que
 * decide si la fuente local de Astraura 1.58 está lista según la respuesta de
 * `/api/ping` (o, para backends anteriores, `/api/bitnet/estado`).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { interpretarPing, probeAstraura158Local, probeAstraura158Nube } from "@/ai/astraura/availability";

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

/**
 * (G5/G10 · 2026-09-26) `probeAstraura158Nube`: `/api/ping` por el túnel y,
 * si contesta, `/api/cola` para no marcar lista una nube que el propio
 * backend dice que no admite más peticiones ahora mismo.
 */
describe("probeAstraura158Nube", () => {
  afterEach(() => {
    delete (globalThis as { window?: object }).window;
    vi.unstubAllGlobals();
  });

  function stubFetch(porUrl: Record<string, { status: number; json?: unknown }>) {
    (globalThis as { window?: object }).window = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (entrada: string | URL) => {
        const url = String(entrada);
        for (const [sufijo, r] of Object.entries(porUrl)) {
          if (url.endsWith(sufijo)) {
            return new Response(r.json !== undefined ? JSON.stringify(r.json) : "{}", { status: r.status });
          }
        }
        return new Response("{}", { status: 404 });
      }),
    );
  }

  it("ping caído ⇒ no lista, sin sondear la cola", async () => {
    stubFetch({ "/api/ping": { status: 503 } });
    expect(await probeAstraura158Nube("https://uno.trycloudflare.com")).toEqual({ ready: false });
  });

  it("ping ok y sin /api/cola (backend anterior) ⇒ lista igualmente", async () => {
    stubFetch({ "/api/ping": { status: 200, json: { ok: true } } });
    expect(await probeAstraura158Nube("https://dos.trycloudflare.com")).toMatchObject({ ready: true });
  });

  it("ping ok y /api/cola con admite:true ⇒ lista", async () => {
    stubFetch({
      "/api/ping": { status: 200, json: { ok: true } },
      "/api/cola": { status: 200, json: { activos: 1, en_cola: 0, max_cola: 5, admite: true } },
    });
    expect(await probeAstraura158Nube("https://tres.trycloudflare.com")).toMatchObject({ ready: true });
  });

  it("ping ok y /api/cola con admite:false ⇒ NO lista, motivo con la espera estimada", async () => {
    stubFetch({
      "/api/ping": { status: 200, json: { ok: true } },
      "/api/cola": { status: 200, json: { activos: 3, en_cola: 4, max_cola: 3, admite: false, espera_estimada_s: 42 } },
    });
    const r = await probeAstraura158Nube("https://cuatro.trycloudflare.com");
    expect(r.ready).toBe(false);
    expect(r.reason).toMatch(/ocupada.*42/);
  });
});

/**
 * (G1 · 2026-09-26) `probeAstraura158Local`: en un origen PÚBLICO, un fallo
 * directo al 127.0.0.1 de este dispositivo es DEFINITIVO — nunca reintenta
 * por el puente del OS bajo la etiqueta local, eso serviría la nube disfrazada.
 */
describe("probeAstraura158Local (G1)", () => {
  afterEach(() => {
    delete (globalThis as { window?: object }).window;
    vi.unstubAllGlobals();
  });

  it("página PÚBLICA + fetch directo bloqueado/roto ⇒ no lista, motivo honesto, SIN reintento por el puente", async () => {
    (globalThis as { window?: object }).window = { location: { hostname: "starseed-os.vercel.app" } };
    const fetchFalso = vi.fn(async (_entrada: string | URL) => { throw new TypeError("Failed to fetch"); });
    vi.stubGlobal("fetch", fetchFalso);
    const r = await probeAstraura158Local("http://127.0.0.1:8000");
    expect(r.ready).toBe(false);
    expect(r.reason).toMatch(/no tiene Astraura local/);
    // Ninguna llamada debió intentar `/api/ai/astraura-158` (el puente del OS):
    // en un origen público ese proxy no es esta máquina.
    expect(fetchFalso.mock.calls.some((c) => String(c[0]).includes("/api/ai/astraura-158"))).toBe(false);
  });

  it("página PÚBLICA sin Astraura declarada en el dispositivo ⇒ ni siquiera sondea 127.0.0.1 (sin aviso de red local)", async () => {
    (globalThis as { window?: object }).window = { location: { hostname: "starseed-os.vercel.app" } };
    const fetchFalso = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchFalso);
    const r = await probeAstraura158Local("http://127.0.0.1:8000");
    expect(r.ready).toBe(false);
    expect(r.reason).toMatch(/no tiene Astraura local/);
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("página PÚBLICA con la marca «local en este dispositivo» ⇒ sondea su propio 127.0.0.1", async () => {
    const almacen = new Map<string, string>([["starseed.astraura.local-en-este-dispositivo", "1"]]);
    (globalThis as { window?: object }).window = {
      location: { hostname: "starseed-os.vercel.app" },
      localStorage: {
        getItem: (k: string) => almacen.get(k) ?? null,
        setItem: (k: string, v: string) => void almacen.set(k, v),
        removeItem: (k: string) => void almacen.delete(k),
      },
    };
    const fetchFalso = vi.fn(async (entrada: string | URL) =>
      String(entrada).startsWith("http://127.0.0.1:8000/api/ping")
        ? new Response(JSON.stringify({ ok: true }), { status: 200 })
        : new Response("{}", { status: 404 }),
    );
    vi.stubGlobal("fetch", fetchFalso);
    const r = await probeAstraura158Local("http://127.0.0.1:8000");
    expect(r).toMatchObject({ ready: true, via: "directo" });
  });

  it("página LOCAL + fetch directo bloqueado, pero el puente del OS SÍ responde ⇒ lista por proxy", async () => {
    (globalThis as { window?: object }).window = { location: { hostname: "localhost" } };
    const fetchFalso = vi.fn(async (entrada: string | URL) => {
      const url = String(entrada);
      if (url.startsWith("http://127.0.0.1:8000")) throw new TypeError("Failed to fetch");
      if (url.includes("/api/ai/astraura-158/api/ping")) return new Response(JSON.stringify({ ok: true }), { status: 200 });
      return new Response("{}", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchFalso);
    const r = await probeAstraura158Local("http://127.0.0.1:8000");
    expect(r).toMatchObject({ ready: true, via: "proxy" });
  });
});