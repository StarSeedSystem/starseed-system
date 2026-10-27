import { describe, expect, it } from "vitest";
import { detectar, reenviar, estado } from "../../../native/astraura-voice/voicestudio-proxy.mjs";

describe("VoiceStudio Proxy", () => {
  it("detectar devuelve true cuando el health responde ok", async () => {
    const fetchMock = async (url: string) => {
      if (url === "http://127.0.0.1:3900/health") {
        return { ok: true };
      }
      return { ok: false };
    };
    const res = await detectar(fetchMock);
    expect(res).toBe(true);
  });

  it("detectar devuelve false cuando falla el fetch", async () => {
    const fetchMock = async () => {
      throw new Error("fallo");
    };
    const res = await detectar(fetchMock);
    expect(res).toBe(false);
  });

  it("reenviar devuelve 404 para ruta no permitida", async () => {
    const fetchMock = async () => {
      throw new Error("should not be called");
    };
    const res = await reenviar("/otra/ruta", {}, fetchMock);
    expect(res.status).toBe(404);
    expect(res.error).toBe("No encontrado");
  });

  it("reenviar reenvía POST a la ruta permitida", async () => {
    const calls: Array<{ url: string; options?: RequestInit }> = [];
    const fetchMock = async (url: string, options?: RequestInit) => {
      calls.push({ url, options });
      if (url === "http://127.0.0.1:3900/v1/audio/speech") {
        return {
          status: 200,
          json: async () => ({ ok: true }),
        };
      }
      throw new Error("unexpected call");
    };
    const res = await reenviar("/v1/audio/speech", { texto: "hola" }, fetchMock);
    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe("http://127.0.0.1:3900/v1/audio/speech");
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ ok: true });
  });

  it("estado devuelve texto con vivo/ausente", async () => {
    const fetchMock = async (url: string) => {
      if (url === "http://127.0.0.1:3900/health") {
        return { ok: true };
      }
      return { ok: false };
    };
    const txt = await estado(fetchMock);
    expect(txt).toBe("voicestudio: vivo");
  });
});