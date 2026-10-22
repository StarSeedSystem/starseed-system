import { describe, it, expect, vi } from "vitest";
import { type Brain } from "../../brains";
import {
  guardarVinculo,
  quitarVinculo,
  sincronizarAhora,
} from "../telepatia-aplicar";

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
  destino: { tipo: "cerebro", id: "brain-2" },
  alcance: { completo: true, memorias: [], carpetas: [], configuraciones: [] },
  direccion: "ambas" as const,
  acceso: "leer" as const,
  auto: true,
  estado: "pendiente" as const,
  creadoEn: new Date().toISOString(),
};

describe("guardarVinculo", () => {
  it("debe guardar un nuevo vínculo en el cerebro", async () => {
    const saved = await Promise.resolve({ ...mockBrain, config: { ...mockBrain.config, telepatia: [mockVinculo] } } as Brain);
    vi.fn().mockResolvedValue(saved);
    (saved as any).config = { ...mockBrain.config, telepatia: [mockVinculo] };
    const result = await guardarVinculo(mockBrain, mockVinculo);
    expect(result).toEqual(saved);
  });
});

describe("quitarVinculo", () => {
  it("debe quitar un vínculo por id", async () => {
    const nextTelepatia = mockBrain.config.telepatia?.filter((v) => v.id !== "vinc-1");
    const saved = await Promise.resolve({ ...mockBrain, config: { ...mockBrain.config, telepatia: nextTelepatia } } as Brain);
    vi.fn().mockResolvedValue(saved);
    const result = await quitarVinculo(mockBrain, "vinc-1");
    expect(result).toEqual(saved);
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