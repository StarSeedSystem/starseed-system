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
  exportMemoryFileSecure,
  scanMemoryFile,
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

/* Rescate RTART1025Ld (rama nube/40908516823), adaptado a la API de hoy: el
 * escaneo de memorias usa los patrones generales del escáner de seguridad
 * (no hay un tipo `sesion_epic` propio), pero el contrato es el mismo: nada
 * con forma de credencial sale sin hallazgo ni sin redacción. */
const VALOR = ["Abc123de", "f9Xy8Zq7", "0203"].join("");

describe("scanMemoryFile y exportMemoryFileSecure · nada con forma de sesión sale limpio", () => {
  it("una memoria limpia no añade hallazgos", () => {
    expect(scanMemoryFile({ name: "notas.md", content: "hoy planificamos el lanzador", server_config: {} })).toEqual([]);
  });

  it("un token en la config del servidor: hallazgo de credencial sin repetir el valor", () => {
    const hallazgos = scanMemoryFile({ name: "memoria.md", content: "hola", server_config: { token: ["eg1", "~", "TkAb12-9_kk"].join("") } });
    expect(hallazgos.some((h) => h.type === "credencial_por_campo")).toBe(true);
    expect(hallazgos.some((h) => h.path === "server_config.token")).toBe(true);
    expect(JSON.stringify(hallazgos)).not.toContain("TkAb12");
  });

  it("una credencial en el contenido se detecta al compartir SIN redactar, con aviso", () => {
    const contenido = ["token: ", VALOR].join("");
    const r = exportMemoryFileSecure({ name: "memoria.md", content: contenido, server_config: {} }, { allowCritical: true });
    expect(r.findings.some((f) => f.type === "asignacion_credencial")).toBe(true);
    expect(r.content).toBe(contenido);
    expect(r.redactedCount).toBe(0);
    expect(r.aviso).toBeDefined();
  });
});
