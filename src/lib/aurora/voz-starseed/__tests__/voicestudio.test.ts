import { describe, it, expect, vi } from "vitest";
import { descubrir, voces, transcribir, hablar } from "../voicestudio";

// Mock fetch helper
function crearFetchMock(mockResponses: { url: string | RegExp; status: number; ok: boolean; json?: any; body?: any; contentType?: string; method?: string }[]) {
  let callCount = 0;
  const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: url.toString(), init, callCount: callCount++ };
    const mock = mockResponses.find(m => 
      (m.url instanceof RegExp ? m.url.test(call.url) : call.url === m.url) &&
      (!init?.method || init.method.toUpperCase() === (m.method || "GET"))
    );
    if (!mock) {
      throw new Error(`No mock found for ${call.url} with method ${init?.method}`);
    }
    if (mock.json) {
      return {
        ok: mock.ok,
        status: mock.status,
        json: () => Promise.resolve(mock.json),
        headers: new Map(),
      } as any;
    }
    if (mock.body) {
      return {
        ok: mock.ok,
        status: mock.status,
        body: () => Promise.resolve(mock.body),
        headers: new Map(),
      } as any;
    }
    return {
      ok: mock.ok,
      status: mock.status,
      json: () => Promise.resolve({}),
      headers: new Map(),
    } as any;
  });
  return { fetch: fetchMock, llamadas: fetchMock.mock.calls };
}

describe("voicestudio", () => {
  it("debe retornar vivo:true cuando el servicio responde correctamente", async () => {
    const { fetch } = crearFetchMock([
      {
        url: "http://127.0.0.1:3900/.well-known/voicestudio-speech",
        status: 200,
        ok: true,
        json: { vivo: true, version: "0.5.7", ofrece: ["voz", "transcripcion"] },
      },
    ]);
    vi.stubGlobal("fetch", fetch);
    const resultado = await descubrir();
    expect(resultado).toEqual({
      vivo: true,
      version: "0.5.7",
      ofrece: ["voz", "transcripcion"],
    });
  });

  it("debe retornar vivo:false con motivo cuando el servicio responde con error", async () => {
    const { fetch } = crearFetchMock([
      {
        url: "http://127.0.0.1:3900/.well-known/voicestudio-speech",
        status: 500,
        ok: false,
        body: "Internal Server Error",
        statusText: "Internal Server Error",
      },
    ]);
    vi.stubGlobal("fetch", fetch);
    const resultado = await descubrir();
    expect(resultado).toEqual({
      vivo: false,
      motivo: "HTTP 500: Internal Server Error",
    });
  });
});