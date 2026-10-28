import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock server-only
vi.mock("server-only", () => ({}));
// Mock fs/promises
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));
// Mock os
vi.mock("node:os", () => ({
  homedir: () => "/home/test",
}));
import { readFile } from "node:fs/promises";
import { poner, buscar, estado, salud, linea } from "../memvid-cliente";

const mockFetch = vi.fn();
global.fetch = mockFetch as any;

beforeEach(() => {
  vi.clearAllMocks();
  (readFile as any).mockResolvedValue("tokentest\n");
});

describe("memvid-cliente", () => {
  it("salud devuelve true si ok", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    expect(await salud()).toBe(true);
  });

  it("salud devuelve false si falla", async () => {
    mockFetch.mockResolvedValueOnce(null);
    expect(await salud()).toBe(false);
  });

  it("estado devuelve json", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ fotogramas: 1, tamano: 100 }) });
    const res = await estado("perfil-alex-2026T4.mv2e");
    expect(res?.fotogramas).toBe(1);
  });

  it("buscar envía POST con consulta", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ aciertos: [{ texto: "hola" }] }) });
    const res = await buscar("perfil-alex-2026T4.mv2e", "hola", 3);
    expect(res?.[0].texto).toBe("hola");
    const call = mockFetch.mock.calls[0];
    expect(call[1].method).toBe("POST");
  });

  it("linea acepta respuesta directa", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [{ frame_id: 1 }] });
    const res = await linea("perfil-alex-2026T4.mv2e");
    expect(Array.isArray(res)).toBe(true);
  });

  it("poner reintenta si 507 abriendo siguiente parte", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 507 })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ frame: 1 }) });
    const res = await poner({ tipo: "perfil", id: "alex" }, "hola");
    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("poner devuelve null si servidor no responde", async () => {
    mockFetch.mockResolvedValueOnce(null);
    const res = await poner({ tipo: "perfil", id: "alex" }, "hola");
    expect(res.ok).toBe(false);
  });
});
