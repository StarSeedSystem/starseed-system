// Pruebas de fusion-aplicar.ts (cerebros-fusion-telepatia.md §4).
// Mocks: nada toca Supabase de verdad, la red ni el disco.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Brain } from "@/lib/brains/brains";
import type { ArchivoMemoria, PlanFusion } from "@/lib/cerebros/fusion";
import { aplicarFusion, copiaDeSeguridad, descargarCopia, leerParaFusion } from "@/lib/cerebros/fusion-aplicar";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getBrain: vi.fn(),
  saveBrain: vi.fn(),
  deleteBrain: vi.fn(),
  pushPreferences: vi.fn(),
}));

vi.mock("@/utils/supabase/client", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/brains/brains", () => ({
  getBrain: mocks.getBrain,
  saveBrain: mocks.saveBrain,
  deleteBrain: mocks.deleteBrain,
}));
vi.mock("@/lib/settings-sync", () => ({ pushPreferences: mocks.pushPreferences }));

function cerebro(id: string): Brain {
  return {
    id,
    owner: "cuenta-1",
    name: `Cerebro ${id}`,
    scope: "account",
    scope_ref: null,
    description: "",
    config: {},
    includes: { vaults: [], backends: [], personalities: [], runtimes: [], tokens: [], memories: [], connections: [], bindScope: false, permissions: [] },
    servers: [],
  };
}

/** Cadena de Supabase de prueba: registra y resuelve `resultado`. */
type Registro = { update: unknown[]; insert: unknown[]; select: unknown[] };
type Resultado = { data?: unknown; error?: unknown };
function tablaDe(resultado: Resultado, registro: Registro) {
  type Cadena = {
    data?: unknown;
    error?: unknown;
    select: () => Cadena;
    in: () => Cadena;
    eq: () => Cadena;
    limit: () => Cadena;
    update: (carga: unknown) => Cadena;
    insert: (carga: unknown) => Cadena;
    abortSignal: () => Cadena;
  };
  const self: Cadena = Promise.resolve(resultado) as unknown as Cadena;
  self.select = () => {
    registro.select.push("select");
    return self;
  };
  self.in = () => self;
  self.eq = () => self;
  self.limit = () => self;
  self.update = (carga: unknown) => {
    registro.update.push(carga);
    return self;
  };
  self.insert = (carga: unknown) => {
    registro.insert.push(carga);
    return self;
  };
  self.abortSignal = () => self;
  return self;
}

function clienteCon(tablas: Record<string, () => unknown>): void {
  mocks.createClient.mockImplementation(() => ({
    from: (t: string) => tablas[t]?.() ?? tablaDe({ data: [], error: null }, muestra),
  }));
}

const muestra: Registro = { update: [], insert: [], select: [] };

function archivo(brainId: string, name: string, contenido: string, id?: string): ArchivoMemoria {
  return { ...(id ? { id } : {}), brain_id: brainId, name, content: contenido, updated_at: "2026-10-23T10:00:00.000Z", meta: null };
}

/** Almacenamiento de prueba con la API de localStorage. Devuelve también sus datos. */
function crearAlmacen(t0: Array<[string, string]> = []): {
  almacen: { getItem(k: string): string | null; setItem(k: string, v: string): void; key(i: number): string | null; readonly length: number };
  datos: Map<string, string>;
} {
  const datos = new Map<string, string>(t0);
  return {
    datos,
    almacen: {
      getItem: (k) => (datos.has(k) ? (datos.get(k) as string) : null),
      setItem: (k, v) => {
        datos.set(k, v);
      },
      key: (i) => Array.from(datos.keys())[i] ?? null,
      get length() {
        return datos.size;
      },
    },
  };
}

/** Cast rápido a PlanFusion para los literales de prueba. */
function plan(de: PlanFusion): PlanFusion {
  return de;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  for (const m of Object.values(mocks)) m.mockClear();
  mocks.getBrain.mockImplementation(async (id: string) => cerebro(id));
  mocks.saveBrain.mockImplementation(async (b: Brain) => b);
  mocks.deleteBrain.mockResolvedValue(true);
  mocks.pushPreferences.mockResolvedValue({ ok: true });
});

describe("leerParaFusion", () => {
  it("lee destino, orígenes, memorias y preferencias del aparato", async () => {
    const { almacen, datos } = crearAlmacen([
      ["starseed.brain.c1.conectores", JSON.stringify(["mcp-x"])],
      ["ajeno", JSON.stringify({ sin: "relación" })],
      ["starseed.brain.c2.roto", "{esto no es JSON"],
    ]);
    vi.stubGlobal("window", { localStorage: almacen });
    const registro: Registro = { update: [], insert: [], select: [] };
    clienteCon({
      brain_memory_files: () => tablaDe({ data: [archivo("c1", "memory.md", "a"), { brain_id: "c2", name: "knowledge.md", content: "b", updated_at: null, meta: null }], error: null }, registro),
    });
    const r = await leerParaFusion("c1", ["c2"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.destino.id).toBe("c1");
    expect(r.origenes).toHaveLength(1);
    expect(r.archivos).toHaveLength(2);
    expect(r.prefs.c1.conectores).toEqual(["mcp-x"]);
    expect(datos.get("starseed.brain.c1.conectores")).toBe(JSON.stringify(["mcp-x"]));
  });

  it("falla si el destino no se puede leer, sin tirar", async () => {
    vi.stubGlobal("window", {});
    mocks.getBrain.mockResolvedValue(null);
    const r = await leerParaFusion("c1", []);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("c1");
  });
});

describe("copiaDeSeguridad y descargarCopia", () => {
  it("la copia contiene todos los archivos y los dos cerebros", () => {
    const datos = {
      destino: cerebro("c1"),
      origenes: [cerebro("c2"), cerebro("c3")],
      archivos: [archivo("c1", "memory.md", "a"), archivo("c2", "memory.md", "b"), archivo("c2", "extra.md", "c")],
      prefs: { c1: {}, c2: {} },
    };
    const copia = copiaDeSeguridad(datos, "2026-10-24");
    expect(copia.nombre).toBe("cerebros-fusion-2026-10-24.json");
    const contenido = JSON.parse(copia.texto) as { destino: { id: string }; origenes: { id: string }[]; archivos: unknown[] };
    expect(contenido.destino.id).toBe("c1");
    expect(contenido.origenes.map((o) => o.id)).toEqual(["c2", "c3"]);
    expect(contenido.archivos).toHaveLength(3);
  });

  it("sin window no hace nada y devuelve false", () => {
    expect(descargarCopia(copiaDeSeguridad({ destino: cerebro("c1"), origenes: [], archivos: [], prefs: {} }, "2026-10-24"))).toBe(false);
  });
});

describe("aplicarFusion · camino feliz", () => {
  it("escribe memorias, cerebro, preferencias y quita el origen sin selecciones", async () => {
    const almacenFusion = crearAlmacen();
    vi.stubGlobal("window", { localStorage: almacenFusion.almacen });
    const escritura: Registro = { update: [], insert: [], select: [] };
    const selecciones: Registro = { update: [], insert: [], select: [] };
    clienteCon({
      brain_memory_files: () => tablaDe({ data: null, error: null }, escritura),
      brain_selections: () => tablaDe({ data: [], error: null }, selecciones),
    });
    const p = plan({
      archivos: [
        { name: "memory.md", accion: "anexar", contenido: "a + fusion", bytesQueEntran: 9, desde: ["c2"], idDestino: "f-1" },
        { name: "extra.md", accion: "copiar", contenido: "nuevo", bytesQueEntran: 5, desde: ["c2"] },
        { name: "igual.md", accion: "omitir", contenido: "", bytesQueEntran: 0, desde: [] },
      ],
      includes: { vaults: [], backends: [], personalities: [], runtimes: [], tokens: [], memories: [], connections: [], bindScope: false, permissions: [] },
      servers: [],
      config: { fusionados: ["c2"] },
      prefs: { conectores: ["mcp-x"] },
      resumen: { archivosNuevos: 1, archivosAnexados: 1, archivosOmitidos: 1, bytes: 14 },
    });
    const r = await aplicarFusion(p, { destino: cerebro("c1"), origenIds: ["c2"], quitarOrigenes: true });
    expect(r.ok).toBe(true);
    expect(r.error).toBeUndefined();
    expect(r.archivosEscritos).toBe(2);
    expect(r.bytes).toBe(14);
    expect(escritura.update).toHaveLength(1);
    expect(escritura.update[0]).toMatchObject({ content: "a + fusion" });
    expect(escritura.insert).toHaveLength(1);
    expect(escritura.insert[0]).toMatchObject({ brain_id: "c1", name: "extra.md", source: "fusion" });
    expect(mocks.saveBrain).toHaveBeenCalledTimes(1);
    expect(mocks.saveBrain.mock.calls[0][0]).toMatchObject({ id: "c1", config: { fusionados: ["c2"] } });
    expect(mocks.pushPreferences).toHaveBeenCalledTimes(1);
    expect(almacenFusion.datos.get("starseed.brain.c1.conectores")).toBe(JSON.stringify(["mcp-x"]));
    expect(mocks.deleteBrain).toHaveBeenCalledTimes(1);
    expect(mocks.deleteBrain).toHaveBeenCalledWith("c2");
    expect(r.origenesQuitados).toEqual(["c2"]);
    expect(r.origenesConservados).toEqual([]);
  });
});

describe("aplicarFusion · fallos y conservación", () => {
  it("si falla una memoria no se borra ningún origen y ok es false", async () => {
    vi.stubGlobal("window", { localStorage: crearAlmacen().almacen });
    const escritura: Registro = { update: [], insert: [], select: [] };
    clienteCon({
      brain_memory_files: () => tablaDe({ data: null, error: { message: "sin red" } }, escritura),
      brain_selections: () => tablaDe({ data: [], error: null }, muestra),
    });
    const p = plan({
      archivos: [{ name: "memory.md", accion: "anexar", contenido: "x", bytesQueEntran: 1, desde: ["c2"], idDestino: "f-1" }],
      includes: { vaults: [], backends: [], personalities: [], runtimes: [], tokens: [], memories: [], connections: [], bindScope: false, permissions: [] },
      servers: [],
      config: {},
      prefs: {},
      resumen: { archivosNuevos: 0, archivosAnexados: 1, archivosOmitidos: 0, bytes: 1 },
    });
    const r = await aplicarFusion(p, { destino: cerebro("c1"), origenIds: ["c2"], quitarOrigenes: true });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("memory.md");
    expect(r.archivosEscritos).toBe(0);
    expect(mocks.saveBrain).not.toHaveBeenCalled();
    expect(mocks.deleteBrain).not.toHaveBeenCalled();
    expect(r.origenesQuitados).toEqual([]);
  });

  it("un origen con selecciones se conserva con su motivo y no se borra", async () => {
    vi.stubGlobal("window", { localStorage: crearAlmacen().almacen });
    const selecciones: Registro = { update: [], insert: [], select: [] };
    clienteCon({
      brain_memory_files: () => tablaDe({ data: null, error: null }, { update: [], insert: [], select: [] }),
      brain_selections: () => tablaDe({ data: [{ id: "s-1" }], error: null }, selecciones),
    });
    const p = plan({
      archivos: [],
      includes: { vaults: [], backends: [], personalities: [], runtimes: [], tokens: [], memories: [], connections: [], bindScope: false, permissions: [] },
      servers: [],
      config: {},
      prefs: {},
      resumen: { archivosNuevos: 0, archivosAnexados: 0, archivosOmitidos: 0, bytes: 0 },
    });
    const r = await aplicarFusion(p, { destino: cerebro("c1"), origenIds: ["c2"], quitarOrigenes: true });
    expect(r.ok).toBe(true);
    expect(mocks.deleteBrain).not.toHaveBeenCalled();
    expect(r.origenesQuitados).toEqual([]);
    expect(r.origenesConservados).toEqual([{ id: "c2", motivo: "Tiene selecciones; se moverán cuando se aplique §9 b." }]);
  });

  it("con quitarOrigenes false se conservan todos con su motivo", async () => {
    vi.stubGlobal("window", { localStorage: crearAlmacen().almacen });
    clienteCon({});
    const p = plan({
      archivos: [],
      includes: { vaults: [], backends: [], personalities: [], runtimes: [], tokens: [], memories: [], connections: [], bindScope: false, permissions: [] },
      servers: [],
      config: {},
      prefs: {},
      resumen: { archivosNuevos: 0, archivosAnexados: 0, archivosOmitidos: 0, bytes: 0 },
    });
    const r = await aplicarFusion(p, { destino: cerebro("c1"), origenIds: ["c2", "c3"], quitarOrigenes: false });
    expect(r.ok).toBe(true);
    expect(r.origenesQuitados).toEqual([]);
    expect(r.origenesConservados).toEqual([
      { id: "c2", motivo: "Se pidió conservar los cerebros fusionados." },
      { id: "c3", motivo: "Se pidió conservar los cerebros fusionados." },
    ]);
  });
});




