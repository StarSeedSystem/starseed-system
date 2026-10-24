// Pruebas de telepatia-aplicar.ts (contrato cerebros-fusion-telepatia.md §5).
// Mocks: nada toca Supabase de verdad ni localStorage real.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Brain } from "@/lib/brains/brains";
import type { MemoryFile } from "@/lib/cerebro/memory-files";
import type { VinculoTelepatico } from "@/lib/cerebros/telepatia";
import { aplicarVinculoTelepatia } from "@/lib/cerebros/telepatia-aplicar";

const mocks = vi.hoisted(() => ({
  saveBrain: vi.fn(),
  listMemoryFiles: vi.fn(),
  saveMemoryFile: vi.fn(),
  pushPreferences: vi.fn(),
  upsertGrant: vi.fn(),
}));

vi.mock("@/lib/brains/brains", () => ({ saveBrain: mocks.saveBrain }));
vi.mock("@/lib/cerebro/memory-files", () => ({
  listMemoryFiles: mocks.listMemoryFiles,
  saveMemoryFile: mocks.saveMemoryFile,
}));
vi.mock("@/lib/settings-sync", () => ({ pushPreferences: mocks.pushPreferences }));
vi.mock("@/lib/sharing/access", () => ({ upsertGrant: mocks.upsertGrant }));

function cerebro(id: string, config: Record<string, unknown> = {}): Brain {
  return {
    id,
    owner: "cuenta-1",
    name: `Cerebro ${id}`,
    scope: "account",
    scope_ref: null,
    description: "",
    config,
    includes: { vaults: [], backends: [], personalities: [], runtimes: [], tokens: [], memories: [], connections: [], bindScope: false, permissions: [] },
    servers: [],
  };
}

function archivo(name: string, brainId: string, updated_at: string, contenido = `de ${name}`): MemoryFile {
  return { id: `${brainId}-${name}`, brain_id: brainId, name, content: contenido, source: "starseed", server_config: {}, meta: {}, sync: false, updated_at };
}

function vinculo(parcial: Partial<VinculoTelepatico>): VinculoTelepatico {
  return {
    id: "v-1",
    destino: { tipo: "cerebro", id: "brain-2" },
    alcance: { completo: false, memorias: ["a.md"], carpetas: [], configuraciones: [] },
    direccion: "enviar",
    acceso: "leer",
    auto: false,
    estado: "activo",
    creadoEn: new Date().toISOString(),
    expiraEn: null,
    ultimaSync: null,
    ...parcial,
  };
}

beforeEach(() => {
  vi.unstubAllGlobals();
  for (const m of Object.values(mocks)) m.mockClear();
  mocks.saveBrain.mockImplementation(async (b) => b);
  mocks.saveMemoryFile.mockImplementation(async (f) => archivo(f.name ?? "", f.brain_id ?? "", new Date().toISOString()));
  mocks.pushPreferences.mockResolvedValue({});
  mocks.upsertGrant.mockResolvedValue({});
});

describe("aplicarVinculoTelepatia · destino otro cerebro tuyo", () => {
  it("escribe solo lo más nuevo en el otro cerebro y nunca borra", async () => {
    mocks.listMemoryFiles.mockImplementation(async (brainId) =>
      brainId === "brain-1"
        ? [archivo("a.md", "brain-1", "2026-01-01T00:00:00Z"), archivo("b.md", "brain-1", "2026-01-01T00:00:00Z"), archivo("c.md", "brain-1", "2026-01-01T00:00:00Z")]
        : [archivo("a.md", "brain-2", "2026-02-01T00:00:00Z", "más nuevo en brain-2"), archivo("d.md", "brain-2", "2026-02-01T00:00:00Z")],
    );
    const res = await aplicarVinculoTelepatia(vinculo({ alcance: { completo: false, memorias: ["a.md", "b.md"], carpetas: [], configuraciones: [] } }), cerebro("brain-1"), { cerebros: [cerebro("brain-2")], entidades: [] });
    expect(res.ok).toBe(true);
    expect(res.errores).toEqual([]);
    expect(res.operaciones).toBe(1);
    expect(mocks.saveMemoryFile).toHaveBeenCalledTimes(1);
    const escrito = mocks.saveMemoryFile.mock.calls[0][0] as Partial<MemoryFile>;
    expect(escrito).toMatchObject({ brain_id: "brain-2", name: "b.md" });
    expect(escrito.meta).toMatchObject({ telepatia: "v-1" });
    expect(mocks.saveBrain).toHaveBeenCalledTimes(1);
    const guardado = mocks.saveBrain.mock.calls[0][0] as Brain;
    const vGuardado = (guardado.config.telepatia as VinculoTelepatico[])[0];
    expect(vGuardado.id).toBe("v-1");
    expect(String(vGuardado.ultimaSync)).toBeTruthy();
    expect(mocks.pushPreferences).not.toHaveBeenCalled();
  });

  it("con dirección recibir y acceso de escritura trae lo más nuevo del otro cerebro", async () => {
    mocks.listMemoryFiles.mockImplementation(async (brainId) =>
      brainId === "brain-1" ? [archivo("a.md", "brain-1", "2026-01-01T00:00:00Z")] : [archivo("a.md", "brain-2", "2026-02-01T00:00:00Z", "lo nuevo del otro")],
    );
    const res = await aplicarVinculoTelepatia(vinculo({ direccion: "recibir", acceso: "escribir" }), cerebro("brain-1"), { cerebros: [cerebro("brain-2")], entidades: [] });
    expect(res.ok).toBe(true);
    const escrito = mocks.saveMemoryFile.mock.calls[0][0] as Partial<MemoryFile>;
    expect(escrito).toMatchObject({ brain_id: "brain-1", name: "a.md", content: "lo nuevo del otro" });
  });

  it("no se usa a sí mismo como destino: lo dice sin escribir nada", async () => {
    const res = await aplicarVinculoTelepatia(vinculo({ destino: { tipo: "cerebro", id: "brain-1" } }), cerebro("brain-1"), { cerebros: [cerebro("brain-2")], entidades: [] });
    expect(res.ok).toBe(false);
    expect(mocks.saveMemoryFile).not.toHaveBeenCalled();
  });

  it("sin el cerebro de destino en la lista no encuentra a quién sincronizar", async () => {
    const res = await aplicarVinculoTelepatia(vinculo({}), cerebro("brain-1"), { cerebros: [], entidades: [] });
    expect(res.ok).toBe(false);
    expect(res.errores.join(" ")).toContain("No se encontró el cerebro");
  });

  it("con vínculo pausado no escribe nada y lo dice", async () => {
    const res = await aplicarVinculoTelepatia(vinculo({ estado: "pausado" }), cerebro("brain-1"), { cerebros: [cerebro("brain-2")], entidades: [] });
    expect(res.ok).toBe(false);
    expect(res.operaciones).toBe(0);
    expect(mocks.saveMemoryFile).not.toHaveBeenCalled();
    expect(mocks.saveBrain).not.toHaveBeenCalled();
  });

  it("con vínculo caducado no escribe nada y lo dice", async () => {
    const res = await aplicarVinculoTelepatia(vinculo({ expiraEn: "2020-01-01T00:00:00Z" }), cerebro("brain-1"), { cerebros: [cerebro("brain-2")], entidades: [] });
    expect(res.ok).toBe(false);
    expect(res.errores.join(" ")).toContain("caducó");
    expect(mocks.saveMemoryFile).not.toHaveBeenCalled();
  });
});

describe("aplicarVinculoTelepatia · operaciones de configuración", () => {
  it("copia la clave starseed.brain.<de>.<config> y sincroniza preferencias", async () => {
    const almacen = new Map<string, string>([["starseed.brain.brain-1.conectores", '"tres"']]);
    vi.stubGlobal("window", { localStorage: { getItem: (k: string) => almacen.get(k) ?? null, setItem: (k: string, v: string) => almacen.set(k, v) } });
    mocks.listMemoryFiles.mockResolvedValue([]);
    const res = await aplicarVinculoTelepatia(
      vinculo({ alcance: { completo: false, memorias: [], carpetas: [], configuraciones: ["conectores"] }, direccion: "enviar" }),
      cerebro("brain-1"),
      { cerebros: [cerebro("brain-2")], entidades: [] },
    );
    expect(res.ok).toBe(true);
    expect(almacen.get("starseed.brain.brain-2.conectores")).toBe('"tres"');
    expect(mocks.pushPreferences).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});

describe("aplicarVinculoTelepatia · destino grupo", () => {
  it("deja grant con el slug de la entidad y deja constancia de la sincronización", async () => {
    mocks.listMemoryFiles.mockResolvedValue([]);
    const res = await aplicarVinculoTelepatia(
      vinculo({ destino: { tipo: "grupo", id: "g-1" }, acceso: "escribir", alcance: { completo: false, memorias: ["a.md"], carpetas: [], configuraciones: [] } }),
      cerebro("brain-1"),
      { cerebros: [], entidades: [{ id: "g-1", tipo: "grupo", nombre: "Amigos", slug: "amigos" }] },
    );
    expect(res.ok).toBe(true);
    expect(res.errores).toEqual([]);
    expect(res.operaciones).toBe(1);
    expect(mocks.upsertGrant).toHaveBeenCalledWith(
      { type: "brain", id: "brain-1", ownerId: "cuenta-1", title: "Cerebro brain-1" },
      { granteeKind: "group", granteeId: "amigos", role: "edit", label: "Amigos", sections: ["a.md"] },
    );
    const guardado = mocks.saveBrain.mock.calls[0][0] as Brain;
    expect(String((guardado.config.telepatia as VinculoTelepatico[])[0].ultimaSync)).toBeTruthy();
  });

  it("sin slug no comparte nada y lo dice", async () => {
    mocks.listMemoryFiles.mockResolvedValue([]);
    const res = await aplicarVinculoTelepatia(
      vinculo({ destino: { tipo: "grupo", id: "g-1" } }),
      cerebro("brain-1"),
      { cerebros: [], entidades: [{ id: "g-1", tipo: "grupo", nombre: "Amigos" }] },
    );
    expect(res.ok).toBe(false);
    expect(res.errores.join(" ")).toContain("slug");
    expect(mocks.upsertGrant).not.toHaveBeenCalled();
  });

  it("si la entidad no está en la lista, lo dice sin tocar permisos", async () => {
    const res = await aplicarVinculoTelepatia(
      vinculo({ destino: { tipo: "pagina", id: "p-9" } }),
      cerebro("brain-1"),
      { cerebros: [], entidades: [] },
    );
    expect(res.ok).toBe(false);
    expect(res.errores.join(" ")).toContain("grupo, la comunidad o la página");
    expect(mocks.upsertGrant).not.toHaveBeenCalled();
  });
});

describe("aplicarVinculoTelepatia · destino cuenta externa", () => {
  it("devuelve el token una vez y no lo guarda nunca en la config", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ vinculo: { id: "ext-9", prefijo: "ssk_abc" }, token: "ssk_abc_123", aviso: "único" }), { status: 200 })));
    const res = await aplicarVinculoTelepatia(vinculo({ destino: { tipo: "cuenta", id: "account-1" }, acceso: "escribir", alcance: { completo: true, memorias: [], carpetas: [], configuraciones: [] } }), cerebro("brain-1"), { cerebros: [], entidades: [] });
    expect(res.ok).toBe(true);
    expect(res.token).toBe("ssk_abc_123");
    const guardado = mocks.saveBrain.mock.calls[0][0] as Brain;
    expect(JSON.stringify(guardado.config)).not.toContain("ssk_abc_123");
    const cuerpo = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)) as Record<string, unknown>;
    expect(cuerpo).toMatchObject({ accion: "crear", ambitoTipo: "cerebro", ambitoId: "brain-1", nombre: "account-1" });
    vi.unstubAllGlobals();
  });

  it("con una sola memoria el ámbito externo es esa memoria", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ token: "ssk_otro" }), { status: 200 })));
    await aplicarVinculoTelepatia(vinculo({ destino: { tipo: "cuenta", id: "account-1" }, alcance: { completo: false, memorias: ["memory.md"], carpetas: [], configuraciones: [] } }), cerebro("brain-1"), { cerebros: [], entidades: [] });
    const cuerpo = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)) as Record<string, unknown>;
    expect(cuerpo).toMatchObject({ ambitoTipo: "memoria", ambitoId: "memory.md", permisos: { memoria: true, leer: true, escribir: false } });
    vi.unstubAllGlobals();
  });

  it("el token se entrega una sola vez: si ya se entregó, no crea otro ni vuelve a pedirlo", async () => {
    const res = await aplicarVinculoTelepatia(
      vinculo({ destino: { tipo: "cuenta", id: "account-1" }, ultimaSync: "2026-06-01T00:00:00.000Z" }),
      cerebro("brain-1"),
      { cerebros: [], entidades: [] },
    );
    expect(res.ok).toBe(true);
    expect(res.avisos.join(" ")).toContain("ya se entregó");
    expect(mocks.saveBrain).not.toHaveBeenCalled();
    expect(mocks.saveMemoryFile).not.toHaveBeenCalled();
  });

  it("si la creación falla, lo dice sin token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Sin sesión." }), { status: 401 })));
    const res = await aplicarVinculoTelepatia(vinculo({ destino: { tipo: "cuenta", id: "account-1" } }), cerebro("brain-1"), { cerebros: [], entidades: [] });
    expect(res.ok).toBe(false);
    expect(res.token).toBeUndefined();
    expect(res.errores.join(" ")).toContain("Sin sesión");
    vi.unstubAllGlobals();
  });
});
