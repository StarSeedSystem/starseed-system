import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// CON1011B: ninguna escritura a `brain_memory_files` sale si el contenido no
// cambió, y las escrituras agrupadas salen como mucho una cada 5 min por fichero.

const updates: Array<Record<string, unknown>> = [];

vi.mock("@/utils/supabase/client", () => {
  const chain = () => {
    const q: Record<string, unknown> = {};
    q.update = (row: Record<string, unknown>) => {
      updates.push(row);
      return q;
    };
    q.eq = () => q;
    q.then = (resolve: (v: unknown) => void) => resolve({ error: null });
    return q;
  };
  return {
    createClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: "dueño" } } }) },
      from: () => chain(),
    }),
  };
});

import {
  INTERVALO_ESCRITURA_AGRUPADA_MS,
  _reiniciarEscriturasMemoria,
  contenidoSinCambios,
  escribirAgrupado,
  updateMemoryContent,
  vaciarEscriturasAgrupadas,
} from "../memory-files";

beforeEach(() => {
  updates.length = 0;
  _reiniciarEscriturasMemoria();
});

describe("updateMemoryContent sin cambios", () => {
  it("la misma memoria escrita dos veces sale UNA vez", async () => {
    expect(await updateMemoryContent("f1", "# memoria\nhola")).toBe(true);
    expect(await updateMemoryContent("f1", "# memoria\nhola")).toBe(true);
    expect(updates).toHaveLength(1);
    expect(contenidoSinCambios("f1", "# memoria\nhola")).toBe(true);
  });

  it("un cambio de verdad sí se guarda", async () => {
    await updateMemoryContent("f1", "uno");
    await updateMemoryContent("f1", "dos");
    expect(updates.map((u) => u.content)).toEqual(["uno", "dos"]);
  });
});

describe("escribirAgrupado", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("la primera sale ya y las siguientes se juntan en una a los 5 min", async () => {
    const escribir = vi.fn(async (c: string) => updateMemoryContent("f2", c));
    escribirAgrupado("f2", "a", escribir);
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(20_000);
      escribirAgrupado("f2", `a${i}`, escribir);
    }
    expect(escribir).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(INTERVALO_ESCRITURA_AGRUPADA_MS);
    expect(escribir).toHaveBeenCalledTimes(2);
    expect(escribir).toHaveBeenLastCalledWith("a9");
  });

  it("no escribe lo que ya está guardado", async () => {
    await updateMemoryContent("f3", "igual");
    const escribir = vi.fn(async () => true);
    escribirAgrupado("f3", "igual", escribir);
    expect(escribir).not.toHaveBeenCalled();
  });

  it("lo pendiente sale al cerrar la pestaña", () => {
    const escribir = vi.fn(async () => true);
    escribirAgrupado("f4", "x", escribir);
    escribirAgrupado("f4", "xy", escribir);
    expect(escribir).toHaveBeenCalledTimes(1);
    vaciarEscriturasAgrupadas();
    expect(escribir).toHaveBeenCalledTimes(2);
    expect(escribir).toHaveBeenLastCalledWith("xy");
  });
});
