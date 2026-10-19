// Pruebas del servicio de voz Voicestudio (Osa 1012B · Ola ???)
import { describe, it, expect, vi, afterEach } from "vitest";

// Mock de fetch para pruebas
function crearFetchMock(respuestas: Array<{
  url: string | RegExp;
  status: number;
  ok?: boolean;
  json?: any;
  body?: any;
  contentType?: string;
  method?: string;
  statusText?: string;
}>) {
  let llamadas: { url: URL | RequestInfo; init?: RequestInit }[] = [];
  const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    llamadas.push({ url, init });
    const respuesta = respuestas.find(r => {
      const urlMatch = r.url instanceof RegExp ? r.url.test(url.toString()) : url.toString() === r.url;
      if (!urlMatch) return false;
      if (r.method && init?.method?.toUpperCase() !== r.method.toUpperCase()) return false;
      return true;
    });
    if (!respuesta) {
      throw new Error(`No se encontró mock para ${url} con ${JSON.stringify(init)}`);
    }
    // Simular timeout si es necesario (se maneja en las pruebas de timeout)
    if (respuesta.status === 0) {
      return new Promise(() => {}); // pending forever
    }
    return new Response(
      respuesta.body !== undefined ? respuesta.body : 
      respuesta.json !== undefined ? JSON.stringify(respuesta.json) : "",
      {
        status: respuesta.status,
        headers: respuesta.contentType ? { "Content-Type": respuesta.contentType } : {},
      }
    );
  });
  return { fetch: fetchMock, llamadas };
}

describe("Voicestudio servicio", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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
      },
    ]);
    vi.stubGlobal("fetch", fetch);
    const resultado = await descobrir();
    expect(resultado).toEqual({
      vivo: false,
      motivo: "HTTP 500",
    });
  });

  it("debe retornar vivo:false con motivo de timeout cuando supera los 800 ms", async () => {
    let reject: (reason: any) => void;
    const promise = new Promise((_resolve, _reject) => {
      reject = _reject;
    });
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      // If the signal is already aborted, reject with AbortError
      if (init?.signal && init.signal.aborted) {
        reject({ name: "AbortError", message: "The operation was aborted." } as any);
        return promise;
      }
      // Otherwise, set up a listener to reject if the signal is aborted during the wait
      if (init?.signal) {
        const handler = () => {
          reject({ name: "AbortError", message: "The operation was aborted." } as any);
        };
        init.signal.addEventListener("abort", handler);
      }
      return promise;
    });
    vi.stubGlobal("fetch", fetchMock);
    const resultado = await descubrir();
    expect(resultado).toEqual({
      vivo: false,
      motivo: "Timeout de conexión (800 ms)",
    });
  });

  it("debe retornar vivo:false con mensaje de error de red cuando falla el fetch", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);
    const resultado = await descubrir();
    expect(resultado).toEqual({
      vivo: false,
      motivo: "Error de red: no se pudo conectar al servicio",
    });
  });

  it("debe usar la base proporcionada por parámetro", async () => {
    const { fetch, llamadas } = crearFetchMock([
      {
        url: "https://mi-servidor.com/.well-known/voicestudio-speech",
        status: 200,
        ok: true,
        json: { vivo: true },
      },
    ]);
    vi.stubGlobal("fetch", fetch);
    await descubrir("https://mi-servidor.com");
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].url.toString()).toBe("https://mi-servidor.com/.well-known/voicestudio-speech");
  });

  it("debe retornar la lista de IDs de voz cuando el servicio responde correctamente", async () => {
    const { fetch } = crearFetchMock([
      {
        url: "http://127.0.0.1:3900/v1/audio/voices",
        status: 200,
        ok: true,
        json: {
          voices: [
            { id: "alloy", name: "Alloy" },
            { id: "echo", name: "Echo" },
            { id: "fable", name: "Fable" },
          ],
        },
      },
    ]);
    vi.stubGlobal("fetch", fetch);
    const resultado = await voces();
    expect(resultado).toEqual(["alloy", "echo", "fable"]);
  });

  it("debe lanzar un error cuando el servicio responde con error HTTP", async () => {
    const { fetch } = crearFetchMock([
      {
        url: "http://127.0.0.1:3900/v1/audio/transcriptions",
        status: 422,
        ok: false,
        body: "Unprocessable Entity",
        method: "POST",
      },
    ]);
    vi.stubGlobal("fetch", fetch);
    await expect(transcribir(undefined, {})).rejects.toThrow("Error 422");
  });

  it("debe lanzar un error cuando la respuesta no tiene el formato esperado", async () => {
    const { fetch } = crearFetchMock([
      {
        url: "http://127.0.0.1:3900/v1/audio/voices",
        status: 200,
        ok: true,
        json: { mensaje: "No hay voces" },
      },
    ]);
    vi.stubGlobal("fetch", fetch);
    await expect(voces()).rejects.toThrow("Formato de respuesta inesperado");
  });

  it("debe lanzar un error de red cuando falla el fetch", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(transcribir(undefined, {})).rejects.toThrow("Error de red: no se pudo conectar al servicio");
  });

  it("debe retornar los bytes de audio cuando el servicio responde correctamente", async () => {
     const audioBytes = new Uint8Array([82, 73, 70, 70]); // "RIFF" en ASCII, inicio de un WAV
     const { fetch } = crearFetchMock([
       {
         url: "http://127.0.0.1:3900/v1/audio/speech",
         status: 200,
         ok: true,
         body: new Blob([audioBytes], { type: "audio/mpeg" }),
         contentType: "audio/mpeg",
         method: "POST",
       },
     ]);
    vi.stubGlobal("fetch", fetch);
    const resultado = await hablar(undefined, {});
    expect(resultado).toEqual(audioBytes);
  });

  it("debe retornar el texto transcrito cuando el servicio responde correctamente", async () => {
    const { fetch } = crearFetchMock([
      {
        url: "http://127.0.0.1:3900/v1/audio/transcriptions",
        status: 200,
        ok: true,
        json: { text: "Hola mundo" },
        method: "POST",
      },
    ]);
    vi.stubGlobal("fetch", fetch);
    const resultado = await transcribir(undefined, {});
    expect(resultado).toBe("Hola mundo");
  });
});