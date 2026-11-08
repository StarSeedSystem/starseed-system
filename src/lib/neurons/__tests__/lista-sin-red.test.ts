// @vitest-environment jsdom
/**
 * (OFF1108A) Lista de neuronas en un arranque en frío SIN red: con la instantánea de la cuenta la Mac sigue
 * en la lista (antes solo salía «este dispositivo»). «Cerrar y reabrir» = `vi.resetModules()` con el mismo disco.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const UID = "11111111-2222-4333-8444-555555555555";
const sim = vi.hoisted(() => ({
  disco: new Map<string, unknown>(),
  red: true,
}));

vi.mock("@/lib/identidad/almacen", () => ({
  almacenIdentidad: () => ({
    async leer(c: string) {
      return sim.disco.has(c) ? structuredClone(sim.disco.get(c)) : undefined;
    },
    async escribir(c: string, v: unknown) {
      sim.disco.set(c, structuredClone(v));
    },
    async borrar(c: string) {
      sim.disco.delete(c);
    },
    async claves() {
      return [...sim.disco.keys()];
    },
  }),
}));
vi.mock("@/lib/consumo/lider-pestana", () => ({ esLider: () => false, alCambiarLider: () => () => undefined }));
vi.mock("@/lib/consumo/freno", () => ({ frenoActivo: () => false }));
vi.mock("@/lib/consumo/usuario", () => ({ uidActual: async () => UID }));
vi.mock("@/lib/sync/entity-state", () => ({ deviceId: () => "sync-1" }));
vi.mock("@/ai/astraura/mesh/federation", () => ({ deviceId: () => "dev-1" }));
vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      upsert: async () => (sim.red ? { error: null, status: 201 } : { error: { message: "Failed to fetch" }, status: 0 }),
      update: () => ({ eq: () => ({ select: async () => ({ data: [], error: sim.red ? null : { message: "Failed to fetch" }, status: sim.red ? 200 : 0 }) }) }),
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null, status: 200 }) }),
        order: async () =>
          sim.red
            ? {
                data: [{ id: "mac-de-alex", name: "Mac de Alex", kind: "desktop", capabilities: { cores: 10 }, permissions: {}, last_seen_at: new Date().toISOString() }],
                error: null,
                status: 200,
              }
            : { data: null, error: { message: "Failed to fetch" }, status: 0 },
      }),
    }),
  }),
}));

beforeEach(() => {
  vi.stubGlobal("BroadcastChannel", undefined);
  vi.stubGlobal("fetch", vi.fn(async () => {
    throw new Error("sin red en pruebas");
  }));
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
  vi.resetModules();
  sim.disco.clear();
  sim.red = true;
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("listNeurons sin internet tras reabrir", () => {
  test("en línea guarda la copia; con la app reabierta sin red la Mac sigue en la lista", async () => {
    const enLinea = await import("@/lib/neurons/neurons");
    const l1 = await enLinea.listNeurons({ fresco: true });
    expect(l1.map((n) => n.id)).toContain("mac-de-alex");
    await vi.waitFor(() => expect([...sim.disco.keys()].some((k) => k.endsWith(":neuronas"))).toBe(true));
    // Nada con forma de secreto en lo guardado.
    expect(JSON.stringify([...sim.disco.values()])).not.toMatch(/eyJ|refresh_token|access_token/);

    // «Cerrar y reabrir» sin red.
    vi.resetModules();
    sim.red = false;
    const frio = await import("@/lib/neurons/neurons");
    const l2 = await frio.listNeurons();
    const mac = l2.find((n) => n.id === "mac-de-alex");
    expect(mac?.name).toBe("Mac de Alex");
  });

  test("sin copia guardada y sin red solo sale este dispositivo (no se inventa nada)", async () => {
    sim.red = false;
    const n = await import("@/lib/neurons/neurons");
    const l = await n.listNeurons();
    expect(l.filter((x) => !x.isThisDevice)).toEqual([]);
  });
});
