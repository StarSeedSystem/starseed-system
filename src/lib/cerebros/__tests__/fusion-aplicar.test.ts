import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Brain } from "@/lib/brains/brains";
import type { ArchivoMemoria, PlanFusion } from "@/lib/cerebros/fusion";
import {
  aplicarFusion,
  copiaDeSeguridad,
  descargarCopia,
  leerParaFusion,
  type CopiaDeSeguridad,
  type LecturaFusion,
} from "@/lib/cerebros/fusion-aplicar";

/** Pruebas de fusión aplicada (§4): camino feliz, fallo al escribir, orígenes con selecciones y copia. */

const h = vi.hoisted(() => {
  const estado = {
    cerebros: new Map<string, unknown>(),
    filasMemoria: [] as Array<unknown>,
    archivosActualizados: [] as Array<Record<string, unknown>>,
    memoriaInsertada: [] as Array<Record<string, unknown>>,
    idFalloAlEscribir: null as string | null,
    idFalloAlGuardarCerebro: null as string | null,
    idsConSelecciones: [] as string[],
    borrados: [] as string[],
  };
  const datosPrefs = new Map<string, string>();
  return { estado, datosPrefs };
});

vi.mock("@/lib/consumo/guardian", () => ({
  senalEsencial: () => new AbortController().signal,
}));

vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        in: () => ({ abortSignal: () => Promise.resolve({ data: h.estado.filasMemoria, error: null }) }),
        eq: (_columna: string, id: string) => ({
          abortSignal: () =>
            Promise.resolve({
              data: h.estado.idsConSelecciones.includes(id) ? [{ brain_id: id }] : [],
              error: null,
            }),
        }),
      }),
      update: (cambios: Record<string, unknown>) => ({
        eq: (_columna: string, id: string) => ({
          abortSignal: () => {
            if (h.estado.idFalloAlEscribir === id) {
              return Promise.resolve({ data: null, error: { message: "fallo de escritura" } });
            }
            h.estado.archivosActualizados.push({ id, ...cambios });
            return Promise.resolve({ data: null, error: null });
          },
        }),
      }),
      insert: (fila: Record<string, unknown>) => ({
        abortSignal: () => {
          h.estado.memoriaInsertada.push(fila);
          return Promise.resolve({ data: null, error: null });
        },
      }),
    }),
  }),
}));

vi.mock("@/lib/brains/brains", () => ({
  getBrain: (id: string) => Promise.resolve(h.estado.cerebros.get(id) ?? null),
  saveBrain: (cerebro: Record<string, unknown>) => {
    if (h.estado.idFalloAlGuardarCerebro === String(cerebro.id)) {
      return Promise.resolve(null);
    }
    h.estado.cerebros.set(String(cerebro.id), cerebro);
    return Promise.resolve(cerebro);
  },
  deleteBrain: (id: string) => {
    h.estado.borrados.push(id);
    return Promise.resolve(true);
  },
}));

vi.mock("@/lib/settings-sync", () => ({
  pushPreferences: () => Promise.resolve({ ok: true, message: "sincronizadas" }),
}));

function cerebro(id: string, name: string): Brain {
  return {
    id,
    owner: "cuenta-1",
    name,
    scope: "account",
    scope_ref: null,
    description: "",
    config: {},
    includes: {
      vaults: [],
      backends: [],
      personalities: [],
      runtimes: [],
      tokens: [],
      memories: [],
      connections: [],
      bindScope: false,
      permissions: [],
    },
    servers: [],
  };
}

function archivo(brainId: string, id: string, name: string, content: string): ArchivoMemoria {
  return { id, brain_id: brainId, name, content, updated_at: "2026-10-24T10:00:00Z", meta: null };
}

function planSimple(): PlanFusion {
  return {
    archivos: [
      {
        name: "memorias.md",
        accion: "anexar",
        contenido: "destino + secciones del origen",
        bytesQueEntran: 31,
        desde: ["c2"],
        idDestino: "f1",
      },
      {
        name: "nueva.md",
        accion: "copiar",
        contenido: "archivo nuevo del origen",
        bytesQueEntran: 24,
        desde: ["c2"],
        idDestino: undefined,
      },
    ],
    includes: {
      vaults: [],
      backends: [],
      personalities: [],
      runtimes: [],
      tokens: [],
      memories: [],
      connections: [],
      bindScope: false,
      permissions: [],
    },
    servers: [],
    config: { fusionados: ["c2"], fusionadoEn: "2026-10-25" },
    prefs: { tema: "claro" },
    resumen: { archivosNuevos: 1, archivosAnexados: 1, archivosOmitidos: 0, bytes: 55 },
  };
}

let almacen: Storage;

beforeEach(() => {
  h.estado.cerebros.clear();
  h.estado.filasMemoria = [];
  h.estado.archivosActualizados = [];
  h.estado.memoriaInsertada = [];
  h.estado.idFalloAlEscribir = null;
  h.estado.idsConSelecciones = [];
  h.estado.borrados = [];
  h.datosPrefs.clear();
  almacen = {
    getItem: (k: string) => h.datosPrefs.get(k) ?? null,
    setItem: (k: string, v: string) => {
      h.datosPrefs.set(k, String(v));
    },
    removeItem: (k: string) => {
      h.datosPrefs.delete(k);
    },
    clear: () => h.datosPrefs.clear(),
    key: (i: number) => [...h.datosPrefs.keys()][i] ?? null,
    get length() {
      return h.datosPrefs.size;
    },
  } as Storage;
  vi.stubGlobal("window", { localStorage: almacen });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("leerParaFusion", () => {
  it("devuelve destino, orígenes, archivos y prefs con JSON.parse defensivo", async () => {
    h.estado.cerebros.set("c1", cerebro("c1", "Destino"));
    h.estado.cerebros.set("c2", cerebro("c2", "Origen"));
    h.estado.filasMemoria = [archivo("c1", "f1", "memorias.md", "contenido destino")];
    h.datosPrefs.set("starseed.brain.c2.tema", '"oscuro"');
    h.datosPrefs.set("starseed.brain.c2.roto", "{no es json");
    h.datosPrefs.set("starseed.brain.otro.pref", '"no se lee"');

    const r = await leerParaFusion("c1", ["c2"]);
    if (!r.ok) throw new Error("la lectura debía funcionar");
    expect(r.destino.id).toBe("c1");
    expect(r.origenes.map((b) => b.id)).toEqual(["c2"]);
    expect(r.archivos).toEqual(h.estado.filasMemoria);
    expect(r.prefs).toEqual({ c2: { tema: "oscuro" } });
  });

  it("falla sin inventar datos si el destino no se pudo leer", async () => {
    const r = await leerParaFusion("c1", []);
    expect(r).toEqual({ ok: false, motivo: "No se pudo leer el cerebro de destino (c1)." });
  });

  it("falla si un origen no se pudo leer", async () => {
    h.estado.cerebros.set("c1", cerebro("c1", "Destino"));
    const r = await leerParaFusion("c1", ["c2"]);
    expect(r).toEqual({ ok: false, motivo: "No se pudo leer el cerebro de origen (c2)." });
  });

  it("maneja localStorage faltante sin fallar", async () => {
    h.estado.cerebros.set("c1", cerebro("c1", "Destino"));
    h.estado.cerebros.set("c2", cerebro("c2", "Origen"));
    // Simular que localStorage lanza error
    almacen.getItem = () => {
      throw new Error("no localStorage");
    };
    const r = await leerParaFusion("c1", ["c2"]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.prefs).toBeDefined();
    }
  });
});

describe("copiaDeSeguridad", () => {
  it("todo lo leído queda dentro del JSON de la copia", () => {
    const datos: LecturaFusion = {
      ok: true,
      destino: cerebro("c1", "Destino"),
      origenes: [cerebro("c2", "Origen")],
      archivos: [archivo("c1", "f1", "memorias.md", "contenido")],
      prefs: { c2: { tema: "oscuro" } },
    };
    const copia: CopiaDeSeguridad = copiaDeSeguridad(datos, "2026-10-25");
    expect(copia.nombre).toBe("cerebros-fusion-2026-10-25.json");
    const vuelta = JSON.parse(copia.texto) as typeof datos;
    expect(vuelta.destino.id).toBe("c1");
    expect(vuelta.origenes).toHaveLength(1);
    expect(vuelta.archivos).toEqual(datos.archivos);
    expect(vuelta.prefs).toEqual(datos.prefs);
  });
});

describe("descargarCopia", () => {
  it("sin window no hace nada y devuelve false", () => {
    vi.unstubAllGlobals();
    expect(descargarCopia({ nombre: "x.json", texto: "{}" })).toBe(false);
  });

  it("descarga la copia cuando window y document están disponibles", () => {
    vi.stubGlobal("document", {
      createElement: () => ({
        href: "",
        download: "",
        click: vi.fn(),
        remove: vi.fn(),
      }),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
      URL: { createObjectURL: vi.fn(() => "blob:url"), revokeObjectURL: vi.fn() },
    } as unknown as Document);
    const copia = { nombre: "test.json", texto: '{"key": "value"}' };
    const result = descargarCopia(copia);
    expect(result).toBe(true);
  });

  it("devuelve false si ocurre un error al descargar", () => {
    vi.stubGlobal("document", {
      createElement: () => {
        throw new Error("error al crear elemento");
      },
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
    } as unknown as Document);
    const result = descargarCopia({ nombre: "test.json", texto: "data" });
    expect(result).toBe(false);
  });
});

describe("aplicarFusion", () => {
  it("camino feliz: escribe memorias, cerebro, prefs y borra los orígenes", async () => {
    h.estado.cerebros.set("c1", cerebro("c1", "Destino"));
    const r = await aplicarFusion(planSimple(), {
      destino: cerebro("c1", "Destino"),
      origenIds: ["c2", "c3"],
      quitarOrigenes: true,
    });
    expect(h.estado.archivosActualizados).toHaveLength(1);
    expect(h.estado.archivosActualizados[0]).toMatchObject({ id: "f1", content: "destino + secciones del origen" });
    expect(h.estado.memoriaInsertada).toHaveLength(1);
    expect(h.estado.memoriaInsertada[0]).toMatchObject({
      brain_id: "c1",
      name: "nueva.md",
      content: "archivo nuevo del origen",
      source: "fusion",
    });
    expect(r.archivosEscritos).toBe(2);
    expect(r.bytes).toBe(55);
    expect(h.estado.cerebros.get("c1")).toMatchObject({ config: { fusionados: ["c2"] } });
    expect(JSON.parse(almacen.getItem("starseed.brain.c1.tema") ?? "")).toBe("claro");
    expect(r.origenesQuitados).toEqual(["c2", "c3"]);
    expect(r.origenesConservados).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("si falla al escribir una memoria, no se borra ningún origen y ok es false", async () => {
    h.estado.idFalloAlEscribir = "f1";
    const r = await aplicarFusion(planSimple(), {
      destino: cerebro("c1", "Destino"),
      origenIds: ["c2"],
      quitarOrigenes: true,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("memorias.md");
    expect(r.origenesQuitados).toEqual([]);
    expect(h.estado.borrados).toEqual([]);
  });

  it("el origen con selecciones se conserva con su motivo, y sin quitarOrigenes nadie se borra", async () => {
    h.estado.idsConSelecciones = ["c2"];
    const r = await aplicarFusion(planSimple(), {
      destino: cerebro("c1", "Destino"),
      origenIds: ["c2", "c3"],
      quitarOrigenes: true,
    });
    expect(r.ok).toBe(true);
    expect(r.origenesQuitados).toEqual(["c3"]);
    expect(r.origenesConservados).toEqual([{ id: "c2", motivo: "tiene selecciones; se moverán cuando se aplique §9 b" }]);
    expect(h.estado.borrados).toEqual(["c3"]);
  });

  it("sin casilla de quitar, no borra ni comprueba selecciones", async () => {
    const r = await aplicarFusion(planSimple(), {
      destino: cerebro("c1", "Destino"),
      origenIds: ["c2"],
      quitarOrigenes: false,
    });
    expect(r.ok).toBe(true);
    expect(r.origenesQuitados).toEqual([]);
    expect(r.origenesConservados).toEqual([]);
    expect(h.estado.borrados).toEqual([]);
  });

  it("devuelve ok:false cuando saveBrain devuelve null", async () => {
    h.estado.cerebros.set("c1", cerebro("c1", "Destino"));
    h.estado.idFalloAlGuardarCerebro = "c1";

    const plan: PlanFusion = {
      archivos: [],
      includes: {
        vaults: [],
        backends: [],
        personalities: [],
        runtimes: [],
        tokens: [],
        memories: [],
        connections: [],
        bindScope: false,
        permissions: [],
        aiProvider: undefined,
      },
      servers: [],
      config: {},
      prefs: {},
      resumen: { archivosNuevos: 0, archivosAnexados: 0, archivosOmitidos: 0, bytes: 0 },
    };
    const r = await aplicarFusion(plan, {
      destino: cerebro("c1", "Destino"),
      origenIds: ["c2"],
      quitarOrigenes: false,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("No se pudo guardar el cerebro «Destino».");
  });
});


