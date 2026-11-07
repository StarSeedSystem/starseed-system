// @vitest-environment jsdom
/**
 * (NEU1107B) Fusión SIN borrar filas (la que usa la ventana «Esta neurona»): las absorbidas quedan como
 * historial con la marca `capabilities.fusionada`, el alias y el respaldo; deshacer las devuelve tal cual.
 * El panel de siempre (sin la opción) sigue borrando con respaldo. Y el faro reconoce los ids absorbidos.
 *   NODE_ENV=test npx vitest run src/lib/neurons/__tests__/fusion-conservar.test.ts
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const est = vi.hoisted(() => ({
  filas: [] as Array<Record<string, unknown>>,
  updates: [] as Array<{ id: string; v: Record<string, unknown> }>,
  borrados: [] as unknown[],
  upserts: [] as unknown[],
  difusiones: [] as unknown[],
}));

vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ in: async () => ({ data: est.filas, error: null }) }),
      update: (v: Record<string, unknown>) => ({
        eq: async (_c: string, id: string) => {
          est.updates.push({ id, v });
          return { error: null };
        },
      }),
      delete: () => ({
        in: async (_c: string, ids: unknown) => {
          est.borrados.push(ids);
          return { error: null };
        },
      }),
      upsert: async (filas: unknown) => {
        est.upserts.push(filas);
        return { error: null };
      },
    }),
  }),
}));
vi.mock("@/lib/sync/realtime-sync", () => ({
  sendAccountBroadcast: async (ev: string, p: unknown) => {
    est.difusiones.push([ev, p]);
  },
}));

import { deshacerFusion, fichaConMarcaFusion, fichaFundida, fusionarNeuronas } from "../fusion";
import { CLAVE_FUSIONES, MARCA_FUSIONADA, fusionadaEn, idsConocidasConAlias, leerFusiones } from "../fusion-alias";

const PRINCIPAL = "659d5e03-0000-4000-8000-000000000003";
const ABSORBIDA = "9370fd33-0000-4000-8000-000000000004";

const filaPrincipal = { id: PRINCIPAL, owner: "u", name: "Maggadroid", kind: "mobile", capabilities: { platform: "Android", browser: "Chrome 141" }, last_seen_at: "2026-06-11T09:30:00Z" };
const filaAbsorbida = { id: ABSORBIDA, owner: "u", name: "Maggadroid phone", kind: "mobile", capabilities: { platform: "Android", cores: 8 }, last_seen_at: "2026-11-07T17:58:00Z" };

beforeEach(() => {
  est.filas = [structuredClone(filaPrincipal), structuredClone(filaAbsorbida)];
  est.updates = [];
  est.borrados = [];
  est.upserts = [];
  est.difusiones = [];
  window.localStorage.clear();
  window.localStorage.setItem("starseed.neurons.prefs.v1", JSON.stringify({ names: { [ABSORBIDA]: "Maggadroid phone" }, settings: { [ABSORBIDA]: { role: "servidor" } } }));
});

describe("fusión que conserva las filas", () => {
  it("no borra nada: marca la absorbida, deja el alias y el respaldo, y mueve sus ajustes", async () => {
    const r = await fusionarNeuronas(PRINCIPAL, [ABSORBIDA], { conservarFilas: true, por: "bienvenida" });
    expect(r.ok).toBe(true);
    expect(est.borrados).toEqual([]);
    // 1.ª escritura: la principal con la ficha fundida; 2.ª: la absorbida con su marca.
    expect(est.updates.map((u) => u.id)).toEqual([PRINCIPAL, ABSORBIDA]);
    expect((est.updates[0].v.capabilities as Record<string, unknown>).cores).toBe(8);
    expect(fusionadaEn(est.updates[0].v.capabilities)).toBeNull();
    const marcada = est.updates[1].v.capabilities as Record<string, unknown>;
    expect(marcada.platform).toBe("Android");
    expect(marcada[MARCA_FUSIONADA]).toEqual({ en: PRINCIPAL, ts: r.respaldo, por: "bienvenida" });
    // Alias y respaldo (con la fila tal como estaba, sin marca) en el registro que viaja con la cuenta.
    const reg = leerFusiones();
    expect(reg.alias[ABSORBIDA]).toEqual({ a: PRINCIPAL, ts: r.respaldo });
    expect(reg.respaldos.at(-1)?.filas).toEqual([filaAbsorbida]);
    // Los ajustes del id absorbido pasan al que se queda.
    const prefs = JSON.parse(window.localStorage.getItem("starseed.neurons.prefs.v1") ?? "{}");
    expect(prefs.settings[PRINCIPAL]).toEqual({ role: "servidor" });
    expect(prefs.settings[ABSORBIDA]).toBeUndefined();
    expect(est.difusiones).toHaveLength(1);
  });

  it("deshacer devuelve la fila sin marca y quita el alias", async () => {
    const r = await fusionarNeuronas(PRINCIPAL, [ABSORBIDA], { conservarFilas: true });
    const d = await deshacerFusion(r.respaldo!);
    expect(d.ok).toBe(true);
    expect(est.upserts).toEqual([[filaAbsorbida]]);
    expect(leerFusiones().alias[ABSORBIDA]).toBeUndefined();
    expect(JSON.parse(window.localStorage.getItem(CLAVE_FUSIONES) ?? "{}").respaldos.at(-1).deshecha).toBe(true);
  });

  it("sin la opción (panel de Neuronas) sigue como siempre: borra con respaldo", async () => {
    const r = await fusionarNeuronas(PRINCIPAL, [ABSORBIDA]);
    expect(r.ok).toBe(true);
    expect(est.borrados).toEqual([[ABSORBIDA]]);
    expect(est.updates.map((u) => u.id)).toEqual([PRINCIPAL]);
  });

  it("nunca fusiona con ids inválidos o sin absorbidas", async () => {
    expect((await fusionarNeuronas(PRINCIPAL, [], { conservarFilas: true })).ok).toBe(false);
    expect((await fusionarNeuronas("<x>", [ABSORBIDA], { conservarFilas: true })).ok).toBe(false);
    expect(est.updates).toEqual([]);
  });
});

describe("marca de fusión", () => {
  it("se añade sin perder la ficha y se lee", () => {
    const f = fichaConMarcaFusion({ platform: "macOS" }, PRINCIPAL, 7, "bienvenida");
    expect(f).toEqual({ platform: "macOS", fusionada: { en: PRINCIPAL, ts: 7, por: "bienvenida" } });
    expect(fusionadaEn(f)).toBe(PRINCIPAL);
    expect(fusionadaEn({ fusionada: { en: "" } })).toBeNull();
    expect(fusionadaEn(null)).toBeNull();
  });
  it("la que se queda nunca hereda la marca de una fusión anterior (se escondería de las listas)", () => {
    const f = fichaFundida({ id: "p", capabilities: { platform: "Android" } }, [{ id: "a", capabilities: { cores: 4, fusionada: { en: "otra", ts: 1 } } }]);
    expect(f).not.toHaveProperty("fusionada");
    expect((f as unknown as Record<string, unknown>).cores).toBe(4);
  });
});

describe("faro: ids conocidas", () => {
  it("las vigentes más las absorbidas que apuntan a una vigente (sin repetidos, ordenadas)", () => {
    const alias = { [ABSORBIDA]: { a: PRINCIPAL, ts: 1 }, "vieja-ajena-01": { a: "neurona-de-otra", ts: 1 }, "cadena-0001": { a: ABSORBIDA, ts: 2 } };
    expect(idsConocidasConAlias([PRINCIPAL, "e0b9faf2-tableta"], alias)).toEqual([PRINCIPAL, ABSORBIDA, "cadena-0001", "e0b9faf2-tableta"].sort());
    expect(idsConocidasConAlias([], {})).toEqual([]);
  });
});
