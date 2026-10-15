import { describe, it, expect, vi, beforeEach } from "vitest";
import { type Brain } from "../../brains";
import { type MemoryFile } from "../../cerebro/memory-files";
import { type VinculoTelepatico } from "../telepatia";

vi.mock("@/lib/brains/brains");
vi.mock("@/lib/cerebro/memory-files", () => {
  const saveMemoryFile = vi.fn();
  return {
    ...vi.importActual("@/lib/cerebro/memory-files"),
    listMemoryFiles: vi.fn(),
    saveMemoryFile: vi.fn(),
  };
});
vi.mock("@/lib/sharing/access", () => ({
  upsertGrant: vi.fn(),
}));
vi.mock("@/utils/supabase/client");
vi.mock("../telepatia-aplicar", () => ({
  ...vi.importActual("../telepatia-aplicar"),
  guardarVinculo: vi.fn(),
  quitarVinculo: vi.fn(),
}));

import { saveBrain } from "@/lib/brains/brains";
import { listMemoryFiles, saveMemoryFile } from "@/lib/cerebro/memory-files";
import { upsertGrant } from "@/lib/sharing/access>;
import { createClient } from "@/utils/supabase/client";
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
  config: { telepatia: [] as VinculoTelepatico[] },
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("debe guardar un nuevo vínculo en el cerebro", async () => {
    const savedBrain = { ...mockBrain, config: { ...mockBrain.config, telepatia: [mockVinculo] } };
    vi.mocked(saveBrain).mockResolvedValue(savedBrain);
    const result = await guardarVinculo(mockBrain, mockVinculo);
    expect(result).toEqual(savedBrain);
    expect(saveBrain).toHaveBeenCalledWith(
      expect.objectContaining({
        config: {
          telepatia: expect.arrayContaining([expect.objectContaining({ id: "vinc-1" })]),
        },
      })
    );
  });

  it("debe devolver null si saveBrain falla", async () => {
    vi.mocked(saveBrain).mockResolvedValue(null);
    const result = await guardarVinculo(mockBrain, mockVinculo);
    expect(result).toBeNull();
  });
});

describe("quitarVinculo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("debe quitar un vínculo por id", async () => {
    const savedBrain = { ...mockBrain, config: { ...mockBrain.config, telepatia: [] } };
    vi.mocked(saveBrain).mockResolvedValue(savedBrain);
    const result = await quitarVinculo(mockBrain, "vinc-1");
    expect(result).toEqual(savedBrain);
    expect(saveBrain).toHaveBeenCalledWith(
      expect.objectContaining({
        config: {
          telepatia: [],
        },
      })
    );
  });

  it("debe devolver null si saveBrain falla", async () => {
    vi.mocked(saveBrain).mockResolvedValue(null);
    const result = await quitarVinculo(mockBrain, "vinc-1");
    expect(result).toBeNull();
  });
});

describe("sincronizarAhora", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("debe manejar destino cerebro con archivo nuevo", async () => {
    // Mock listMemoryFiles
    vi.mocked(listMemoryFiles)
      .mockResolvedValueOnce([
        {
          id: "file-1",
          brain_id: "brain-1",
          name: "test.md",
          content: "# Test",
          source: "starseed",
          server_config: {},
          meta: {},
          sync: true,
          updated_at: new Date().toISOString(),
        } as MemoryFile,
      ]) // origen
      .mockResolvedValueOnce([]); // destino

    // Mock saveMemoryFile
    vi.mocked(saveMemoryFile).mockResolvedValue({
      id: "file-2",
      brain_id: "brain-2",
      name: "test.md",
      content: "# Test",
      source: "starseed",
      server_config: {},
      meta: { telepatia: "vinc-1" },
      sync: true,
      updated_at: new Date().toISOString(),
    } as MemoryFile);

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
    expect(result.operaciones).toBe(1);
    expect(result.estado).toBe("activo");
    expect(result.motivo).toBe("Sincronización completada");
    expect(listMemoryFiles).toHaveBeenCalledTimes(2);
    expect(listMemoryFiles).toHaveBeenNthCalledWith(1, "brain-1");
    expect(listMemoryFiles).toHaveBeenNthCalledWith(2, "brain-2");
    expect(saveMemoryFile).toHaveBeenCalled();
    expect(guardarVinculo).toHaveBeenCalledWith(
      mockBrain,
      expect.objectContaining({
        estado: "activo",
        ultimaSync: expect.any(String),
      })
    );
  });

  it("debe manejar destino grupo con grant", async () => {
    // Mock upsertGrant
    vi.mocked(upsertGrant).mockResolvedValue(undefined);
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
    expect(result.motivo).toBe("Los miembros pueden leer; escribir solo del dueño");
    expect(upsertGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "brain",
        id: "brain-1",
        ownerId: "user-1",
        title: "Mi Cerebro",
      }),
      expect.objectContaining({
        granteeKind: "group",
        granteeId: expect.any(String),
        role: "edit",
        sections: undefined,
      })
    );
    expect(guardarVinculo).toHaveBeenCalledWith(
      mockBrain,
      expect.objectContaining({
        estado: "activo",
        ultimaSync: expect.any(String),
      })
    );
  });

  it("debe manejar destino cuenta y devolver token", async () => {
    // Mock fetch
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
    expect(result.motivo).toBe("Vinculo externo creado");
    expect(fetch).toHaveBeenCalledWith("/api/externos/vinculos", expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: expect.any(String),
    }));
    expect(guardarVinculo).toHaveBeenCalledWith(
      mockBrain,
      expect.objectContaining({
        estado: "activo",
        ultimaSync: expect.any(String),
      })
    );
  });
});

