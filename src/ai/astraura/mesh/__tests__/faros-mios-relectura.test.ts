// @vitest-environment jsdom
/**
 * (NEU1108A) En la Mac, el radar enseñaba «Neurona de otra cuenta #1/#2» por el relé: el faro nuevo de la
 * tableta (otro medio tras reinstalar: otro device_id) no estaba en la lista de «mis faros», que se releía
 * como mucho cada hora. Ahora un faro desconocido provoca releerla (como mucho una vez por minuto) y los de
 * otras cuentas ya confirmados no la vuelven a provocar.
 *   NODE_ENV=test npx vitest run src/ai/astraura/mesh/__tests__/faros-mios-relectura.test.ts
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const est = vi.hoisted(() => ({ mios: [] as string[], feed: [] as Array<Record<string, unknown>>, lecturasMios: 0 }));

vi.mock("@/lib/consumo/usuario", () => ({ uidActual: async () => "u1" }));
vi.mock("@/ai/astraura/mesh/federation", () => ({ deviceId: () => "mesh-yo" }));
vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    from: () => {
      let columnas = "";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        select: (c: string) => {
          columnas = c;
          return b;
        },
        eq: () => b,
        gte: () => b,
        order: () => b,
        limit: () => b,
        then: (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => {
          if (columnas === "device_id") {
            est.lecturasMios++;
            return Promise.resolve({ data: est.mios.map((device_id) => ({ device_id })), error: null }).then(ok, ko);
          }
          return Promise.resolve({ data: est.feed, error: null, status: 200 }).then(ok, ko);
        },
      };
      return b;
    },
  }),
}));

const fila = (device_id: string) => ({ device_id, label: null, region: null, preset: null, online_count: 0, payload: {}, created_at: new Date().toISOString() });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse("2026-11-08T01:10:00Z"));
  vi.resetModules();
  est.mios = ["mesh-mac"];
  est.feed = [fila("mesh-mac")];
  est.lecturasMios = 0;
});
afterEach(() => vi.useRealTimers());

describe("pullBeaconsDetallado · mis faros", () => {
  test("el faro nuevo de un medio de mi cuenta deja de salir como «otra cuenta» al minuto; los ajenos no releen más", async () => {
    const { pullBeaconsDetallado } = await import("@/ai/astraura/mesh/server-relay");
    expect((await pullBeaconsDetallado()).faros.map((f) => [f.deviceId, f.own])).toEqual([["mesh-mac", true]]);
    expect(est.lecturasMios).toBe(1);

    // La tableta reinstalada estrena faro (otro device_id) en mi cuenta.
    est.mios = ["mesh-mac", "mesh-tableta-127"];
    est.feed = [fila("mesh-mac"), fila("mesh-tableta-127")];
    vi.setSystemTime(Date.now() + 61_000);
    const r = await pullBeaconsDetallado();
    expect(r.faros.find((f) => f.deviceId === "mesh-tableta-127")?.own).toBe(true);
    expect(est.lecturasMios).toBe(2);

    // Un faro de OTRA cuenta: se relee una vez, sigue ajeno y no vuelve a provocar la relectura.
    est.feed = [...est.feed, fila("mesh-ajeno")];
    vi.setSystemTime(Date.now() + 61_000);
    expect((await pullBeaconsDetallado()).faros.find((f) => f.deviceId === "mesh-ajeno")?.own).toBe(false);
    expect(est.lecturasMios).toBe(3);
    vi.setSystemTime(Date.now() + 61_000);
    await pullBeaconsDetallado();
    expect(est.lecturasMios).toBe(3);
  });
});
