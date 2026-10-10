/**
 * OPD1010 · 2026-10-10 — El Studio 1.58 decía «Failed to fetch» con el backend vivo:
 * el navegador integrado bloquea `127.0.0.1:8000` desde `localhost:9002` (medido:
 * `net::ERR_BLOCKED_BY_CLIENT` en 2–11 ms) y el puente same-origin respondía 200.
 * Estas pruebas fijan el respaldo por el puente y sus límites.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DIRECTO_BLOQUEADO_MS,
  _reiniciarVia158,
  directoBloqueado,
  esFalloDeRed,
  intentosLlamada,
  marcarDirectoBloqueado,
  puedeIrPorPuente,
  rutaPorPuente,
} from "@/lib/astraura/via-158-local";
import { fetchAstraura158Status, probeAstraura158 } from "@/lib/astraura/astraura-158-client";

const LOCAL = "http://127.0.0.1:8000";

describe("puedeIrPorPuente", () => {
  it("solo la fuente local, con base de bucle local y página local", () => {
    expect(puedeIrPorPuente("local", LOCAL, true)).toBe(true);
    expect(puedeIrPorPuente("local", "http://localhost:8000", true)).toBe(true);
    expect(puedeIrPorPuente("nube", LOCAL, true)).toBe(false);
    expect(puedeIrPorPuente("local", LOCAL, false)).toBe(false); // origen público: el proxy no es local
    expect(puedeIrPorPuente("local", "http://192.168.1.20:8000", true)).toBe(false); // LAN: otra máquina
    expect(puedeIrPorPuente("local", "https://x.trycloudflare.com", true)).toBe(false);
  });
});

describe("rutaPorPuente", () => {
  it("añade destino=local y conserva la query del backend", () => {
    expect(rutaPorPuente("/api/status")).toBe("/api/ai/astraura-158/api/status?destino=local");
    expect(rutaPorPuente("/api/memory/search?q=hola&limit=3")).toBe(
      "/api/ai/astraura-158/api/memory/search?q=hola&limit=3&destino=local",
    );
    expect(rutaPorPuente("api/ping?destino=nube")).toBe("/api/ai/astraura-158/api/ping?destino=local");
  });
});

describe("esFalloDeRed", () => {
  it("bloqueo, conexión rechazada o contenido mixto sí; timeout y cancelación no", () => {
    expect(esFalloDeRed(new TypeError("Failed to fetch"))).toBe(true);
    expect(esFalloDeRed(new Error("NetworkError when attempting to fetch resource."))).toBe(true);
    expect(esFalloDeRed(new Error("Load failed"))).toBe(true);
    const abort = new Error("The operation was aborted.");
    abort.name = "AbortError";
    expect(esFalloDeRed(abort)).toBe(false);
    expect(esFalloDeRed(new Error("signal is aborted without reason"))).toBe(false);
    expect(esFalloDeRed(new Error("HTTP 500"))).toBe(false);
  });
});

describe("intentosLlamada y memoria del bloqueo", () => {
  beforeEach(() => _reiniciarVia158());

  it("sin puente posible: un solo intento directo", () => {
    expect(intentosLlamada("nube", "/api/ai/astraura-158", "/api/status", true)).toEqual([
      { url: "/api/ai/astraura-158/api/status", via: "directo" },
    ]);
  });

  it("con puente: directo primero y, tras un bloqueo, el puente primero durante 5 min", () => {
    const t0 = 1_000_000;
    expect(intentosLlamada("local", LOCAL, "/api/ping", true, t0).map((i) => i.via)).toEqual(["directo", "puente"]);
    marcarDirectoBloqueado(t0);
    expect(directoBloqueado(t0 + 1)).toBe(true);
    expect(intentosLlamada("local", LOCAL, "/api/ping", true, t0 + 1).map((i) => i.via)).toEqual(["puente", "directo"]);
    expect(directoBloqueado(t0 + DIRECTO_BLOQUEADO_MS + 1)).toBe(false);
  });
});

/* ─────────── El cliente real del Studio con un doble de fetch ─────────── */

const g = globalThis as unknown as { window?: unknown; location?: unknown };
const realWindow = g.window;
const realLocation = g.location;

function respuesta(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("astraura-158-client por el puente", () => {
  beforeEach(() => {
    _reiniciarVia158();
    g.window = globalThis;
    g.location = { hostname: "localhost" };
  });
  afterEach(() => {
    g.window = realWindow;
    g.location = realLocation;
    vi.unstubAllGlobals();
  });

  it("directo bloqueado (Failed to fetch) → responde por el puente con destino=local", async () => {
    const llamadas: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      llamadas.push(url);
      if (url.startsWith(LOCAL)) throw new TypeError("Failed to fetch");
      return respuesta(200, { engine: { active_model: "BitNet b1.58" } });
    }));
    const r = await fetchAstraura158Status("local");
    expect(r.ok).toBe(true);
    expect(llamadas).toEqual([`${LOCAL}/api/status`, "/api/ai/astraura-158/api/status?destino=local"]);
    // La segunda llamada ya no paga el fallo del directo.
    llamadas.length = 0;
    await fetchAstraura158Status("local");
    expect(llamadas[0]).toBe("/api/ai/astraura-158/api/status?destino=local");
  });

  it("un timeout del directo NO cambia de camino (el backend está lento, no bloqueado)", async () => {
    const llamadas: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      llamadas.push(url);
      const e = new Error("The operation was aborted.");
      e.name = "AbortError";
      throw e;
    }));
    const r = await fetchAstraura158Status("local");
    expect(r).toMatchObject({ ok: false, error: "sin respuesta (timeout)" });
    expect(llamadas).toHaveLength(1);
  });

  it("en un origen público (la app en una tablet) nunca usa el puente para «local»", async () => {
    g.location = { hostname: "starseed-os.vercel.app" };
    const llamadas: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      llamadas.push(url);
      throw new TypeError("Failed to fetch");
    }));
    const r = await fetchAstraura158Status("local");
    expect(r.ok).toBe(false);
    expect(llamadas).toEqual([`${LOCAL}/api/status`]);
  });

  it("«Probar» un endpoint de otra máquina va directo, sin colarse por el puente", async () => {
    const llamadas: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      llamadas.push(url);
      throw new TypeError("Failed to fetch");
    }));
    const r = await probeAstraura158("http://192.168.1.20:8000");
    expect(r.ok).toBe(false);
    expect(llamadas).toEqual(["http://192.168.1.20:8000/api/status"]);
  });
});
