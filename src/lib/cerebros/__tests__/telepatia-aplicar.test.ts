// Pruebas de telepatia-aplicar.ts (contrato cerebros-fusion-telepatia.md §5).
// Mocks: nada toca Supabase de verdad ni localStorage real.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Brain } from "@/lib/brains/brains";
import type { MemoryFile } from "@/lib/cerebro/memory-files";
import type { VinculoTelepatico } from "@/lib/cerebros/telepatia";
import { guardarVinculo, quitarVinculo, sincronizarAhora } from "@/lib/cerebros/telepatia-aplicar";

const mocks = vi.hoisted(() => ({
  saveBrain: vi.fn(),
  listMemoryFiles: vi.fn(),
  saveMemoryFile: vi.fn(),
  pushPreferences: vi.fn(),
  upsertGrant: vi.fn(),
  single: vi.fn(),
}));

vi.mock("@/lib/brains/brains", () => ({ saveBrain: mocks.saveBrain }));
vi.mock("@/lib/cerebro/memory-files", () => ({
  listMemoryFiles: mocks.listMemoryFiles,
  saveMemoryFile: mocks.saveMemoryFile,
}));
vi.mock("@/lib/settings-sync", () => ({ pushPreferences: mocks.pushPreferences }));
vi.mock("@/lib/sharing/access", () => ({ upsertGrant: mocks.upsertGrant }));
vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: mocks.single }) }) }),
  }),
}));

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
  mocks.single.mockResolvedValue({ data: null, error: null });
});

describe("guardarVinculo y quitarVinculo (vía saveBrain con conVinculo/sinVinculo)", () => {
  it("guarda sustituyendo el vínculo con el mismo id en config.telepatia", async () => {
    const c = cerebro("brain-1", { telepatia: [vinculo({ estado: "pendiente" })] });
    const bueno = vinculo({ estado: "activo" });
    const res = await guardarVinculo(c, bueno);
    expect(res?.config.telepatia).toEqual([bueno]);
  });

  it("quita el vínculo por id sin tocar el resto", async () => {
    const otro = vinculo({ id: "v-2" });
    const c = cerebro("brain-1", { telepatia: [vinculo({}), otro] });
    const res = await quitarVinculo(c, "v-1");
    expect(res?.config.telepatia).toEqual([otro]);
  });
});

describe("sincronizarAhora · destino otro cerebro tuyo", () => {
  it("escribe solo lo más nuevo en el otro cerebro y nunca borra", async () => {
    mocks.listMemoryFiles.mockImplementation(async (brainId) =>
      brainId === "brain-1"
        ? [archivo("a.md", "brain-1", "2026-01-01T00:00:00Z"), archivo("b.md", "brain-1", "2026-01-01T00:00:00Z"), archivo("c.md", "brain-1", "2026-01-01T00:00:00Z")]
        : [archivo("a.md", "brain-2", "2026-02-01T00:00:00Z", "más nuevo en brain-2"), archivo("d.md", "brain-2", "2026-02-01T00:00:00Z")],
    );
    const res = await sincronizarAhora(cerebro("brain-1"), vinculo({ alcance: { completo: false, memorias: ["a.md", "b.md"], carpetas: [], configuraciones: [] } }));
    expect(res.ok).toBe(true);
    expect(res.operaciones).toBe(1);
    expect(mocks.saveMemoryFile).toHaveBeenCalledTimes(1);
    const escrito = mocks.saveMemoryFile.mock.calls[0][0] as Partial<MemoryFile>;
    expect(escrito).toMatchObject({ brain_id: "brain-2", name: "b.md" });
    expect(escrito.meta).toMatchObject({ telepatia: "v-1" });
    expect(mocks.saveBrain).toHaveBeenCalledTimes(1);
    const guardado = mocks.saveBrain.mock.calls[0][0] as Brain;
    const vGuardado = (guardado.config.telepatia as VinculoTelepatico[])[0];
    expect(vGuardado.id).toBe("v-1");
    expect(vGuardado.estado).toBe("activo");
    expect(String(vGuardado.ultimaSync)).toBeTruthy();
    expect(mocks.pushPreferences).not.toHaveBeenCalled();
  });

  it("con dirección recibir y acceso de escritura trae lo más nuevo del otro cerebro", async () => {
    mocks.listMemoryFiles.mockImplementation(async (brainId) =>
      brainId === "brain-1" ? [archivo("a.md", "brain-1", "2026-01-01T00:00:00Z")] : [archivo("a.md", "brain-2", "2026-02-01T00:00:00Z", "lo nuevo del otro")],
    );
    const res = await sincronizarAhora(cerebro("brain-1"), vinculo({ direccion: "recibir", acceso: "escribir" }));
    expect(res.ok).toBe(true);
    const escrito = mocks.saveMemoryFile.mock.calls[0][0] as Partial<MemoryFile>;
    expect(escrito).toMatchObject({ brain_id: "brain-1", name: "a.md", content: "lo nuevo del otro" });
  });

  it("con vínculo pausado no escribe nada y lo dice en el motivo", async () => {
    const res = await sincronizarAhora(cerebro("brain-1"), vinculo({ estado: "pausado" }));
    expect(res.ok).toBe(false);
    expect(res.operaciones).toBe(0);
    expect(mocks.saveMemoryFile).not.toHaveBeenCalled();
  });
});

describe("sincronizarAhora · operaciones de configuración", () => {
  it("copia la clave starseed.brain.<de>.<config> y sincroniza preferencias", async () => {
    const almacen = new Map<string, string>([["starseed.brain.brain-1.conectores", '"tres"']]);
    vi.stubGlobal("window", { localStorage: { getItem: (k: string) => almacen.get(k) ?? null, setItem: (k: string, v: string) => almacen.set(k, v) } });
    mocks.listMemoryFiles.mockResolvedValue([]);
    const res = await sincronizarAhora(
      cerebro("brain-1"),
      vinculo({ alcance: { completo: false, memorias: [], carpetas: [], configuraciones: ["conectores"] }, direccion: "enviar" }),
    );
    expect(res.ok).toBe(true);
    expect(almacen.get("starseed.brain.brain-2.conectores")).toBe('"tres"');
    expect(mocks.pushPreferences).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});

describe("sincronizarAhora · destino grupo", () => {
  it("deja grant con el slug del grupo y estado activo (solo lectura, escribir del dueño)", async () => {
    mocks.single.mockResolvedValue({ data: { slug: "amigos" }, error: null });
    mocks.listMemoryFiles.mockResolvedValue([]);
    const res = await sincronizarAhora(cerebro("brain-1"), vinculo({ destino: { tipo: "grupo", id: "g-1" }, acceso: "escribir", alcance: { completo: false, memorias: ["a.md"], carpetas: [], configuraciones: [] } }));
    expect(res.ok).toBe(true);
    expect(res.estado).toBe("activo");
    expect(mocks.upsertGrant).toHaveBeenCalledWith({ type: "brain", id: "brain-1", ownerId: "cuenta-1", title: "Cerebro brain-1" }, { granteeKind: "group", granteeId: "amigos", role: "edit", sections: ["a.md"] });
    expect(res.motivo).toContain("solo del dueño");
  });

  it("sin slug no comparte nada y lo dice", async () => {
    const res = await sincronizarAhora(cerebro("brain-1"), vinculo({ destino: { tipo: "grupo", id: "g-1" } }));
    expect(res.ok).toBe(false);
    expect(mocks.upsertGrant).not.toHaveBeenCalled();
  });
});

describe("sincronizarAhora · destino cuenta externa", () => {
  it("devuelve el token una vez y no lo guarda nunca en la config", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ vinculo: { id: "ext-9", prefijo: "ssk_abc" }, token: "ssk_abc_123", aviso: "único" }), { status: 200 })));
    const res = await sincronizarAhora(cerebro("brain-1"), vinculo({ destino: { tipo: "cuenta", id: "account-1" }, acceso: "escribir", alcance: { completo: true, memorias: [], carpetas: [], configuraciones: [] } }));
    expect(res.ok).toBe(true);
    expect(res.token).toBe("ssk_abc_123");
    const guardado = mocks.saveBrain.mock.calls[0][0] as Brain;
    expect(JSON.stringify(guardado.config)).not.toContain("ssk_abc_123");
    expect((guardado.config.telepatia as VinculoTelepatico[])[0].destino).toEqual({ tipo: "cuenta", id: "ext-9" });
    vi.unstubAllGlobals();
  });

  it("devuelve el cerebro guardado para que la ficha pinte lo que quedó", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ vinculo: { id: "ext-9" }, token: "tok" }), { status: 200 })));
    const res = await sincronizarAhora(cerebro("brain-1"), vinculo({ destino: { tipo: "cuenta", id: "account-1" } }));
    expect(res.cerebroGuardado?.id).toBe("brain-1");
    expect(((res.cerebroGuardado?.config.telepatia as VinculoTelepatico[]) ?? [])[0].id).toBe("v-1");
    vi.unstubAllGlobals();
  });

  it("si la creación falla, lo dice sin token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Sin sesión." }), { status: 401 })));
    const res = await sincronizarAhora(cerebro("brain-1"), vinculo({ destino: { tipo: "cuenta", id: "account-1" } }));
    expect(res.ok).toBe(false);
    expect(res.token).toBeUndefined();
    expect(res.motivo).toContain("Sin sesión");
    vi.unstubAllGlobals();
  });

  it("un vínculo cuyo token ya se entregó no crea otro", async () => {
    const res = await sincronizarAhora(cerebro("brain-1"), vinculo({ destino: { tipo: "cuenta", id: "ext-9" }, ultimaSync: new Date().toISOString() }));
    expect(res.ok).toBe(true);
    expect(res.token).toBeUndefined();
    expect(res.motivo).toContain("ya se entregó");
    expect(mocks.saveBrain).not.toHaveBeenCalled();
  });
});
