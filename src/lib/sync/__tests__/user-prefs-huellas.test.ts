/**
 * `mergeUserPrefs` · sin cambios, sin petición (contrato «consumo», 2026-09-29). 1.112 llamadas
 * a `merge_user_prefs` en 4 h, casi todas con valores que la cuenta ya tenía.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const rpc = vi.hoisted(() => ({ llamadas: [] as Array<Record<string, unknown>> }));

vi.mock("@/lib/consumo/usuario", () => ({ uidActual: async () => "u1" }));
vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    rpc: async (_fn: string, args: { p_patch: Record<string, unknown> }) => {
      rpc.llamadas.push(args.p_patch);
      return { error: null };
    },
  }),
}));

beforeEach(async () => {
  rpc.llamadas = [];
  const m = await import("@/lib/sync/user-prefs");
  m.olvidarHuellasPrefs();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("mergeUserPrefs con huellas", () => {
  test("el mismo valor dos veces = una sola petición", async () => {
    const { mergeUserPrefs } = await import("@/lib/sync/user-prefs");
    expect((await mergeUserPrefs({ tema: "oscuro" })).ok).toBe(true);
    const r = await mergeUserPrefs({ tema: "oscuro" });
    expect(r).toMatchObject({ ok: true, sinCambios: true });
    expect(rpc.llamadas).toHaveLength(1);
    await mergeUserPrefs({ tema: "claro" });
    expect(rpc.llamadas).toHaveLength(2);
  });

  test("el orden de las claves no cuenta como cambio (jsonb las reordena)", async () => {
    const { mergeUserPrefs } = await import("@/lib/sync/user-prefs");
    await mergeUserPrefs({ dock: { a: 1, b: [1, { x: 1, y: 2 }] } });
    await mergeUserPrefs({ dock: { b: [1, { y: 2, x: 1 }], a: 1 } });
    expect(rpc.llamadas).toHaveLength(1);
  });

  test("solo sube lo que cambió, y su marca LWW con ello", async () => {
    const { mergeUserPrefs } = await import("@/lib/sync/user-prefs");
    await mergeUserPrefs({ a: 1 });
    await mergeUserPrefs({ a: 1, b: 2, __meta: { a: 10, b: 20 } });
    expect(rpc.llamadas[1]).toEqual({ b: 2, __meta: { b: 20 } });
  });

  test("lo que llega de la cuenta (realtime/lectura) también cuenta como ya subido", async () => {
    const { mergeUserPrefs, recordarPrefsServidor } = await import("@/lib/sync/user-prefs");
    await mergeUserPrefs({ tema: "oscuro" });
    recordarPrefsServidor({ tema: "claro", __meta: { tema: 5 } }); // otro dispositivo lo cambió
    await mergeUserPrefs({ tema: "oscuro" }); // volver a oscuro SÍ es un cambio para la cuenta
    expect(rpc.llamadas).toHaveLength(2);
    await mergeUserPrefs({ tema: "oscuro" });
    expect(rpc.llamadas).toHaveLength(2);
  });

  test("la huella caduca a los 30 min y un cliente ajeno nunca se salta", async () => {
    vi.useFakeTimers();
    const { mergeUserPrefs, HUELLA_VIGENCIA_MS } = await import("@/lib/sync/user-prefs");
    await mergeUserPrefs({ k: 1 });
    vi.advanceTimersByTime(HUELLA_VIGENCIA_MS + 1);
    await mergeUserPrefs({ k: 1 });
    expect(rpc.llamadas).toHaveLength(2);

    const propias: unknown[] = [];
    const cliente = { rpc: async (_f: string, a: unknown) => { propias.push(a); return { error: null }; } };
    await mergeUserPrefs({ k: 1 }, { client: cliente as never });
    await mergeUserPrefs({ k: 1 }, { client: cliente as never });
    expect(propias).toHaveLength(2);
  });
});
