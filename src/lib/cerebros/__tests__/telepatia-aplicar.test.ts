import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Brain } from "@/lib/brains/brains";
import type { VinculoTelepatico } from "../telepatia";
import { guardarVinculo, quitarVinculo, sincronizarAhora } from "../telepatia-aplicar";
import { saveBrain } from "@/lib/brains/brains";
import { upsertGrant } from "@/lib/sharing/access";

const h = vi.hoisted(() => {
  const filas: Record<string, unknown>[] = [];
  const actualizaciones: Array<{ id: unknown; cambios: Record<string, unknown> }> = [];
  const inserciones: Array<Record<string, unknown>> = [];
  const estado = { slug: "grupo-uno" as string | null };
  const cliente = {
    auth: { getUser: async () => ({ data: { user: { id: "cuenta-1" } } }) },
    from: (tabla: string) => {
      if (tabla === "os_groups" || tabla === "os_pages") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: estado.slug ? { slug: estado.slug } : null, error: null }) }) }) };
      }
      return {
        select: () => ({ eq: (_columna: string, brainId: unknown) => ({ abortSignal: async () => ({ data: filas.filter((f) => f.brain_id === brainId), error: null }) }) }),
        insert: async (fila: Record<string, unknown>) => { inserciones.push(fila); return { error: null }; },
        update: (cambios: Record<string, unknown>) => ({ eq: async (_columna: string, id: unknown) => { actualizaciones.push({ id, cambios }); return { error: null }; } }),
      };
    },
  };
  return { filas, actualizaciones, inserciones, estado, cliente };
});

vi.mock("@/utils/supabase/client", () => ({ createClient: () => h.cliente }));
vi.mock("@/lib/brains/brains", () => ({ saveBrain: vi.fn(async (b: unknown) => b) }));
vi.mock("@/lib/settings-sync", () => ({ pushPreferences: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/sharing/access", () => ({ upsertGrant: vi.fn(async () => ({})) }));

function cerebro(id: string): Brain {
  return {
    id, owner: "cuenta-1", name: `Cerebro ${id}`, scope: "account", scope_ref: null, description: "",
    config: {}, includes: { vaults: [], backends: [], personalities: [], runtimes: [], tokens: [], memories: [], connections: [], bindScope: false, permissions: [] }, servers: [],
  };
}

function vinculo(destino: VinculoTelepatico["destino"], extra: Partial<Omit<VinculoTelepatico, "destino">> = {}): VinculoTelepatico {
  return {
    id: "v1", destino, alcance: { completo: true, memorias: [], carpetas: [], configuraciones: [] },
    direccion: "enviar", acceso: "escribir", auto: false, estado: "activo",
    creadoEn: "2026-10-13T00:00:00Z", ...extra,
  };
}

beforeEach(() => {
  h.filas.length = 0;
  h.actualizaciones.length = 0;
  h.inserciones.length = 0;
  h.estado.slug = "grupo-uno";
  vi.mocked(saveBrain).mockClear();
  vi.mocked(upsertGrant).mockClear();
});

afterEach(() => vi.unstubAllGlobals());

describe("telepatía aplicada", () => {
  it("sincroniza solo lo más nuevo entre cerebros propios y no borra", async () => {
    h.filas.push(
      { id: "destino-viejo", brain_id: "b2", name: "compartida.md", content: "viejo", updated_at: "2026-10-01T00:00:00Z", source: "starseed", server_config: {}, meta: { nota: "destino" }, sync: true },
      { id: "origen-nuevo", brain_id: "b1", name: "compartida.md", content: "nuevo", updated_at: "2026-10-02T00:00:00Z", source: "starseed", server_config: {}, meta: { nota: "origen" }, sync: true },
      { id: "origen-atrasado", brain_id: "b1", name: "vieja.md", content: "atrasada", updated_at: "2026-09-01T00:00:00Z", source: "starseed", server_config: {}, meta: {}, sync: true },
      { id: "destino-adelantado", brain_id: "b2", name: "vieja.md", content: "manda destino", updated_at: "2026-09-02T00:00:00Z", source: "starseed", server_config: {}, meta: {}, sync: true },
      { id: "origen-solo", brain_id: "b1", name: "nueva.md", content: "estreno", updated_at: "2026-10-02T00:00:00Z", source: "starseed", server_config: {}, meta: {}, sync: true },
      { id: "solo-destino", brain_id: "b2", name: "local.md", content: "se queda", updated_at: "2026-10-03T00:00:00Z", source: "starseed", server_config: {}, meta: {}, sync: true },
    );
    const res = await sincronizarAhora(cerebro("b1"), vinculo({ tipo: "cerebro", id: "b2" }));
    expect(res).toMatchObject({ ok: true, operaciones: 2, estado: "activo" });
    expect(h.actualizaciones).toHaveLength(1);
    expect(h.actualizaciones[0]).toMatchObject({ id: "destino-viejo", cambios: { content: "nuevo", meta: { nota: "origen", telepatia: "v1" } } });
    expect(h.inserciones).toHaveLength(1);
    expect(h.inserciones[0]).toMatchObject({ brain_id: "b2", name: "nueva.md", content: "estreno", owner: "cuenta-1", meta: { telepatia: "v1" } });
    expect(h.actualizaciones.some((a) => a.id === "solo-destino")).toBe(false);
    const guardado = vi.mocked(saveBrain).mock.calls.at(-1)?.[0] as Brain;
    expect((guardado.config.telepatia as VinculoTelepatico[])[0].ultimaSync).toBeTruthy();
  });

  it("comparte con un grupo mediante slug y activa el vínculo pendiente", async () => {
    const res = await sincronizarAhora(cerebro("b1"), vinculo({ tipo: "grupo", id: "g1" }, { acceso: "leer", estado: "pendiente" }));
    expect(res).toMatchObject({ ok: true, operaciones: 1, estado: "activo" });
    expect(res.motivo).toContain("escribir sigue siendo solo del dueño");
    expect(vi.mocked(upsertGrant)).toHaveBeenCalledWith(
      expect.objectContaining({ type: "brain", id: "b1", title: "Cerebro b1" }),
      expect.objectContaining({ granteeKind: "group", granteeId: "grupo-uno", role: "view" }),
    );
  });

  it("deja pendiente el vínculo si no puede leer el slug", async () => {
    h.estado.slug = null;
    const res = await sincronizarAhora(cerebro("b1"), vinculo({ tipo: "pagina", id: "p1" }));
    expect(res).toMatchObject({ ok: false, operaciones: 0, estado: "pendiente" });
    expect(vi.mocked(upsertGrant)).not.toHaveBeenCalled();
  });

  it("devuelve el token de una cuenta externa una vez y no lo guarda", async () => {
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true, json: async () => ({ token: "ssk_secreto_123", vinculo: { id: "externo-9" } }) }));
    vi.stubGlobal("fetch", fetchFalso);
    const res = await sincronizarAhora(cerebro("b1"), vinculo({ tipo: "cuenta", id: "cuenta-externa" }));
    expect(res.token).toBe("ssk_secreto_123");
    expect(res.estado).toBe("activo");
    const guardado = vi.mocked(saveBrain).mock.calls.at(-1)?.[0] as Brain;
    expect(JSON.stringify(guardado)).not.toContain("ssk_secreto_123");
    expect((guardado.config.telepatia as VinculoTelepatico[])[0].destino).toEqual({ tipo: "cuenta", id: "externo-9" });
    const cuerpo = JSON.parse(String(fetchFalso.mock.calls[0][1]?.body)) as Record<string, unknown>;
    expect(cuerpo).toMatchObject({ ambitoTipo: "cerebro", ambitoId: "b1" });
  });

  it("guarda y quita el vínculo de la configuración del cerebro", async () => {
    const v = vinculo({ tipo: "cerebro", id: "b2" });
    await guardarVinculo(cerebro("b1"), v);
    expect((vi.mocked(saveBrain).mock.calls.at(-1)?.[0] as Brain).config.telepatia).toHaveLength(1);
    await quitarVinculo(cerebro("b1"), v.id);
    expect((vi.mocked(saveBrain).mock.calls.at(-1)?.[0] as Brain).config.telepatia).toHaveLength(0);
  });
});
