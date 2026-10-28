<<<<<<< HEAD
// src/lib/aurora/voz-starseed/__tests__/voicestudio.test.ts
/**
 * TESTS DEL CLIENTE DE VOICESTUDIO (Ola 1018V · Voz de Astraura + VoiceStudio: motores libres,
 * licencia por contexto, clonación con permiso e instantánea en cada neurona)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { descubrir, voces, hablar, transcribir, type DescubrimientoResult, type HablarParams, type TranscribirParams } from "../voicestudio";

/** Mock de fetch que simula respuestas exitosas o errores. */
function crearFetchMock(
  respuestas: { url: string; status: number; ok: boolean; json?: unknown; body?: BodyInit; method?: string; statusText?: string; contentType?: string }[] = []
) {
  let llamadas: Array<{ url: RequestInfo | URL; init?: RequestInit }> = [];
  const fn = vi.fn(
    async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      llamadas.push({ url, init });
      // If the signal is already aborted, reject with AbortError
      if (init?.signal && init.signal.aborted) {
        return Promise.reject({ name: "AbortError", message: "The operation was aborted." } as any);
      }
      const respuesta = respuestas.find(
        r => r.url === url.toString() && (!init?.method || init.method.toUpperCase() === (r.method || "GET"))
      );
      if (!respuesta) {
        return new Response("Not Found", { status: 404 });
      }
      if (!respuesta.ok) {
        return new Response(respuesta.body ?? "Error", {
          status: respuesta.status,
          statusText: respuesta.statusText ?? "Error",
        });
      }
      if (respuesta.json !== undefined) {
        return new Response(JSON.stringify(respuesta.json), {
          status: respuesta.status,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(respuesta.body ?? "", {
        status: respuesta.status,
        headers: { "Content-Type": respuesta.contentType ?? "text/plain" },
      });
    }
  );
  return { fetch: fn as typeof fetch, llamadas };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("descubrir", () => {
=======
import { describe, it, expect, vi } from "vitest";
import { crearFetchMock } from "@/lib/test/fetch-mock";
import { descubrir, voces, transcribir, hablar } from "../voicestudio";

describe("voicestudio service", () => {
>>>>>>> b844cfabd (salvavidas · RTRTRTRTCOL1012Bdsbbbbbbbbbbbb: trabajo del agente antes de las puertas (tsc / vitest))
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
<<<<<<< HEAD
});

describe("voces", () => {
=======

>>>>>>> b844cfabd (salvavidas · RTRTRTRTCOL1012Bdsbbbbbbbbbbbb: trabajo del agente antes de las puertas (tsc / vitest))
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
<<<<<<< HEAD
        url: "http://127.0.0.1:3900/v1/audio/voices",
        status: 401,
        ok: false,
        body: "Unauthorized",
        statusText: "Unauthorized",
      },
    ]);
    vi.stubGlobal("fetch", fetch);
    await expect(voces()).rejects.toThrow("Error 401: Unauthorized");
=======
        url: "http://127.0.0.1:3900/v1/audio/transcriptions",
        status: 422,
        ok: false,
        body: "Unprocessable Entity",
        statusText: "Unprocessable Entity",
        method: "POST",
      },
    ]);
    vi.stubGlobal("fetch", fetch);
    const params = {};
    await expect(transcribir(undefined, params)).rejects.toThrow("Error 422: Unprocessable Entity");
>>>>>>> b844cfabd (salvavidas · RTRTRTRTCOL1012Bdsbbbbbbbbbbbb: trabajo del agente antes de las puertas (tsc / vitest))
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
<<<<<<< HEAD
    await expect(voces()).rejects.toThrow("Error de red: no se pudo conectar al servicio");
  });
});

describe("hablar", () => {
  const params: HablarParams = { texto: "Hola mundo", voz: "alloy", formato: "mp3" };

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
    const resultado = await hablar(undefined, params);
    expect(resultado).toEqual(audioBytes);
  });

  it("debe lanzar un error cuando el servicio responde con error HTTP", async () => {
    const { fetch } = crearFetchMock([
      {
        url: "http://127.0.0.1:3900/v1/audio/speech",
        status: 400,
        ok: false,
        body: "Bad Request",
        statusText: "Bad Request",
=======
    const params = {};
    await expect(transcribir(undefined, params)).rejects.toThrow("Error de red: no se pudo conectar al servicio");
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
>>>>>>> b844cfabd (salvavidas · RTRTRTRTCOL1012Bdsbbbbbbbbbbbb: trabajo del agente antes de las puertas (tsc / vitest))
        method: "POST",
      },
    ]);
    vi.stubGlobal("fetch", fetch);
<<<<<<< HEAD
    await expect(hablar(undefined, params)).rejects.toThrow("Error 400: Bad Request");
  });

  it("debe lanzar un error de red cuando falla el fetch", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(hablar(undefined, params)).rejects.toThrow("Error de red: no se pudo conectar al servicio");
  });
});

describe("transcribir", () => {
    const audioBytes = new Uint8Array([82, 73, 70, 70]);
    const params: TranscribirParams = { audio: audioBytes.buffer, idioma: "es" };

=======
    const params = {};
    const resultado = await hablar(undefined, params);
    expect(resultado).toEqual(audioBytes);
  });

>>>>>>> b844cfabd (salvavidas · RTRTRTRTCOL1012Bdsbbbbbbbbbbbb: trabajo del agente antes de las puertas (tsc / vitest))
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
<<<<<<< HEAD
    const resultado = await transcribir(undefined, params.audio, params.idioma);
    expect(resultado).toBe("Hola mundo");
  });

  it("debe lanzar un error cuando el servicio responde con error HTTP", async () => {
    const { fetch } = crearFetchMock([
      {
        url: "http://127.0.0.1:3900/v1/audio/transcriptions",
        status: 422,
        ok: false,
        body: "Unprocessable Entity",
        statusText: "Unprocessable Entity",
        method: "POST",
      },
    ]);
    vi.stubGlobal("fetch", fetch);
    await expect(transcribir(undefined, params.audio, params.idioma)).rejects.toThrow("Error 422: Unprocessable Entity");
  });

  it("debe lanzar un error de red cuando falla el fetch", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(transcribir(undefined, params.audio, params.idioma)).rejects.toThrow("Error de red: no se pudo conectar al servicio");
  });
=======
    const params = {};
    const resultado = await transcribir(undefined, params);
    expect(resultado).toBe("Hola mundo");
  });
>>>>>>> b844cfabd (salvavidas · RTRTRTRTCOL1012Bdsbbbbbbbbbbbb: trabajo del agente antes de las puertas (tsc / vitest))
});