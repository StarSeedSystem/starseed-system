import { beforeEach, describe, expect, it, vi } from "vitest";

describe("listarCerebrosCompartidos", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mock("@/utils/supabase/client");
    vi.mock("@/lib/consumo/guardian");
  });

  it("devuelve ok false y brains vacío cuando no hay usuario", async () => {
    // Simulamos que no hay usuario (getUser devuelve null)
    const { createClient } = await import("@/utils/supabase/client");
    const { senalEsencial } = await import("@/lib/consumo/guardian");
    createClient.mockReturnValueOnce({
      auth: { getUser: async () => ({ data: { user: null } }) },
      from: () => ({
        select: () => ({}),
        neq: () => ({}),
        order: () => ({}),
        abortSignal: () => ({}),
        then: (callback: any) => Promise.resolve({ data: [], error: null }).then(callback),
      }),
    });
    senalEsencial.mockReturnValueOnce(new AbortController().signal);

    const { listarCerebrosCompartidos } = await import("../compartidos");
    const result = await listarCerebrosCompartidos();
    expect(result.ok).toBe(false);
    expect(result.brains).toEqual([]);
  });

  it("devuelve ok true y brains con los cerebros compartidos cuando la consulta tiene éxito", async () => {
    const mockBrains = [
      { id: "1", owner: "otro-usuario", name: "Cerebro 1", scope: "account", scope_ref: null, description: "", config: {}, includes: { vaults: [], backends: [], personalities: [], runtimes: [], tokens: [], memories: [], connections: [], bindScope: false, permissions: [], aiProvider: undefined }, servers: [], created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" },
      { id: "2", owner: "otro-usuario-2", name: "Cerebro 2", scope: "group", scope_ref: "grupo-1", description: "", config: {}, includes: { vaults: [], backends: [], personalities: [], runtimes: [], tokens: [], memories: [], connections: [], bindScope: false, permissions: [], aiProvider: undefined }, servers: [], created_at: "2026-01-02T00:00:00.000Z", updated_at: "2026-01-02T00:00:00.000Z" },
    ];

    const { createClient } = await import("@/utils/supabase/client");
    const { senalEsencial } = await import("@/lib/consumo/guardian");
    createClient.mockReturnValueOnce({
      auth: { getUser: async () => ({ data: { user: { id: "usuario-actual" } } }) },
      from: () => ({
        select: () => ({}),
        neq: () => ({}),
        order: () => ({}),
        abortSignal: () => ({}),
        then: (callback: any) => Promise.resolve({ data: mockBrains, error: null }).then(callback),
      }),
    });
    senalEsencial.mockReturnValueOnce(new AbortController().signal);

    const { listarCerebrosCompartidos } = await import("../compartidos");
    const result = await listarCerebrosCompartidos();
    expect(result.ok).toBe(true);
    expect(result.brains).toHaveLength(2);
    expect(result.brains[0]).toHaveProperty("compartido", true);
    expect(result.brains[0].id).toBe("1");
    expect(result.brains[1].id).toBe("2");
  });

  it("devuelve ok false y brains vacío cuando la consulta falla", async () => {
    const { createClient } = await import("@/utils/supabase/client");
    const { senalEsencial } = await import("@/lib/consumo/guardian");
    createClient.mockReturnValueOnce({
      auth: { getUser: async () => ({ data: { user: { id: "usuario-actual" } } }) },
      from: () => ({
        select: () => ({}),
        neq: () => ({}),
        order: () => ({}),
        abortSignal: () => ({}),
        then: (callback: any) => Promise.resolve({ data: null, error: { message: "Error de base de datos" } }).then(callback),
      }),
    });
    senalEsencial.mockReturnValueOnce(new AbortController().signal);

    const { listarCerebrosCompartidos } = await import("../compartidos");
    const result = await listarCerebrosCompartidos();
    expect(result.ok).toBe(false);
    expect(result.brains).toEqual([]);
  });
});

describe("esCompartido", () => {
  it("devuelve true cuando el cerebro tiene un owner diferente al usuario", async () => {
    const { esCompartido } = await import("../compartidos");
    const cerebro = {
      id: "1",
      owner: "otro-usuario",
      name: "Cerebro",
      scope: "account",
      scope_ref: null,
      description: "",
      config: {},
      includes: { vaults: [], backends: [], personalities: [], runtimes: [], tokens: [], memories: [], connections: [], bindScope: false, permissions: [], aiProvider: undefined },
      servers: [],
      created_at: undefined,
      updated_at: undefined,
    };
    expect(esCompartido(cerebro, "usuario-actual")).toBe(true);
  });

  it("devuelve false cuando el cerebro tiene el mismo owner que el usuario", async () => {
    const { esCompartido } = await import("../compartidos");
    const cerebro = {
      id: "1",
      owner: "usuario-actual",
      name: "Cerebro",
      scope: "account",
      scope_ref: null,
      description: "",
      config: {},
      includes: { vaults: [], backends: [], personalities: [], runtimes: [], tokens: [], memories: [], connections: [], bindScope: false, permissions: [], aiProvider: undefined },
      servers: [],
      created_at: undefined,
      updated_at: undefined,
    };
    expect(esCompartido(cerebro, "usuario-actual")).toBe(false);
  });

  it("devuelve false cuando el cerebro no tiene owner", async () => {
    const { esCompartido } = await import("../compartidos");
    const cerebro = {
      id: "1",
      owner: undefined,
      name: "Cerebro",
      scope: "account",
      scope_ref: null,
      description: "",
      config: {},
      includes: { vaults: [], backends: [], personalities: [], runtimes: [], tokens: [], memories: [], connections: [], bindScope: false, permissions: [], aiProvider: undefined },
      servers: [],
      created_at: undefined,
      updated_at: undefined,
    };
    expect(esCompartido(cerebro, undefined as unknown as string)).toBe(false);
  });

  it("devuelve false cuando el usuario es null", async () => {
    const { esCompartido } = await import("../compartidos");
    const cerebro = {
      id: "1",
      owner: "otro-usuario",
      name: "Cerebro",
      scope: "account",
      scope_ref: null,
      description: "",
      config: {},
      includes: { vaults: [], backends: [], personalities: [], runtimes: [], tokens: [], memories: [], connections: [], bindScope: false, permissions: [], aiProvider: undefined },
      servers: [],
      created_at: undefined,
      updated_at: undefined,
    };
    expect(esCompartido(cerebro, null)).toBe(false);
  });

  it("devuelve false cuando el usuario es undefined", async () => {
    const { esCompartido } = await import("../compartidos");
    const cerebro = {
      id: "1",
      owner: "otro-usuario",
      name: "Cerebro",
      scope: "account",
      scope_ref: null,
      description: "",
      config: {},
      includes: { vaults: [], backends: [], personalities: [], runtimes: [], tokens: [], memories: [], connections: [], bindScope: false, permissions: [], aiProvider: undefined },
      servers: [],
      created_at: undefined,
      updated_at: undefined,
    };
    expect(esCompartido(cerebro, undefined as unknown as string)).toBe(false);
  });
});