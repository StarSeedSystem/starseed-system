import { describe, it, expect, vi, beforeEach } from "vitest";
import { type Brain } from "../../brains/brains";
import {
  guardarVinculo,
  quitarVinculo,
  sincronizarAhora,
} from "../telepatia-aplicar";

let saveBrain: any;
let upsertGrant: any;
let createClient: any;

beforeEach(async () => {
  vi.mock("@/lib/brains/brains");
  vi.mock("@/lib/sharing/access");
  vi.mock("@/utils/supabase/client");
  const brainMod = await import("@/lib/brains/brains");
  const sharingMod = await import("@/lib/sharing/access");
  const supabaseMod = await import("@/utils/supabase/client");
  saveBrain = brainMod.saveBrain;
  upsertGrant = sharingMod.upsertGrant;
  createClient = supabaseMod.createClient;
  // Mock implementations
  saveBrain.mockImplementation((brain: Brain) => Promise.resolve(brain));
  upsertGrant.mockResolvedValue(undefined);
  // Mock supabase client to return a slug
  const mockSupa = {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: { slug: "test-slug" }, error: null }),
        }),
      }),
    }),
  };
  createClient.mockReturnValue(mockSupa);
});

const mockBrain: Brain = {
  id: "brain-1",
  owner: "user-1",
  name: "Mi Cerebro",
  scope: "account",
  scope_ref: null,
  description: "",
  config: {} as any,
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
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mockVinculo = {
  id: "vinc-1",
  destino: { tipo: "cerebro", id: "brain-2" } as const,
  alcance: { 
    completo: true, 
    memorias: [] as string[], 
    carpetas: [] as string[], 
    configuraciones: [] as string[] 
  },
  direccion: "ambas" as const,
  acceso: "leer" as const,
  auto: true,
  estado: "pendiente" as const,
  creadoEn: new Date().toISOString(),
};

describe("guardarVinculo", () => {
  it("debe guardar un nuevo vínculo en el cerebro", async () => {
    const result = await guardarVinculo(mockBrain, mockVinculo);
    expect(result).toEqual({
      ...mockBrain,
      config: { ...mockBrain.config, telepatia: [mockVinculo] },
    });
    expect(saveBrain).toHaveBeenCalledWith({
      ...mockBrain,
      config: { ...mockBrain.config, telepatia: [mockVinculo] },
    });
  });
});

describe("quitarVinculo", () => {
  it("debe quitar un vínculo por id", async () => {
    const result = await quitarVinculo(mockBrain, "vinc-1");
    expect(result).toEqual({
      ...mockBrain,
      config: { ...mockBrain.config, telepatia: [] },
    });
    expect(saveBrain).toHaveBeenCalledWith({
      ...mockBrain,
      config: { ...mockBrain.config, telepatia: [] },
    });
  });
});

describe("sincronizarAhora", () => {
  it("debe manejar destino cerebro sin operaciones reales", async () => {
    const result = await sincronizarAhora(mockBrain, {
      ...mockVinculo,
      destino: { tipo: "cerebro", id: "brain-2" } as any,
      alcance: { completo: true, memorias: [], carpetas: [], configuraciones: [] },
      direccion: "ambas" as any,
      acceso: "leer" as any,
      auto: true,
      estado: "pendiente" as any,
      creadoEn: new Date().toISOString(),
    } as any);
    expect(result.ok).toBe(true);
    expect(result.operaciones).toBe(0);
    expect(result.estado).toBe("pendiente");
  });

  it("debe manejar destino grupo con grant", async () => {
    const result = await sincronizarAhora(mockBrain, {
      ...mockVinculo,
      destino: { tipo: "grupo", id: "grupo-1" } as any,
      alcance: { completo: true, memorias: [], carpetas: [], configuraciones: [] },
      direccion: "ambas" as any,
      acceso: "escribir" as any,
      auto: true,
      estado: "pendiente" as any,
      creadoEn: new Date().toISOString(),
    } as any);
    expect(result.ok).toBe(true);
    expect(result.estado).toBe("activo");
  });

  it("debe manejar destino cuenta y devolver token", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: "ssk_abc_123" }),
    } as Response);

    const result = await sincronizarAhora(mockBrain, {
      ...mockVinculo,
      destino: { tipo: "cuenta", id: "account-1" } as any,
      alcance: { completo: true, memorias: [], carpetas: [], configuraciones: [] },
      direccion: "ambas" as any,
      acceso: "escribir" as any,
      auto: true,
      estado: "pendiente" as any,
      creadoEn: new Date().toISOString(),
    } as any);

    expect(result.ok).toBe(true);
    expect(result.token).toBe("ssk_abc_123");
    expect(result.estado).toBe("activo");
  });
});
