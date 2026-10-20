import { describe, expect, it, vi } from "vitest";
import { detectar, reenviar, estado } from "../../../native/astraura-voice/voicestudio-proxy.mjs";

describe("VoiceStudio Proxy", () => {
  it("detectar devuelve true cuando el health responde ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    const res = await detectar(fetchMock);
    expect(res).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:4500/health");
  });

  it("detectar devuelve false cuando falla el fetch", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("fallo"));
    const res = await detectar(fetchMock);
    expect(res).toBe(false);
  });

  it("reenviar devuelve 404 para ruta no permitida", async () => {
    const fetchMock = vi.fn();
    const res = await reenviar("/otra/ruta", {}, fetchMock);
    expect(res.status).toBe(404);
    expect(res.error).toBe("No encontrado");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reenviar reenvía POST a la ruta permitida", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ ok: true }),
    });
    const res = await reenviar("/v1/audio/speech", { texto: "hola" }, fetchMock);
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4500/v1/audio/speech",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: "hola" }),
      })
    );
  });

  it("estado devuelve texto con vivo/ausente", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    const txt = await estado(fetchMock);
    expect(txt).toBe("voicestudio: vivo");
  });
});