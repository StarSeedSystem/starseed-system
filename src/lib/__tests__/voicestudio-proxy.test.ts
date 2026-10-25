import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  VOICE_STUDIO_URL,
  RUTA_DESCUBRIMIENTO,
  JUEGO_DETECCION_MS,
  detectar,
  reenviar,
  estado,
  reiniciarDeteccion,
} from "../../../native/astraura-voice/voicestudio-proxy.mjs";

/** Respuesta JSON falsa con headers.get, como pide `reenviar`/`detectar`. */
const resJson = (status: number, data: unknown) => ({
  ok: status >= 200 && status < 400,
  status,
  headers: { get: (nombre: string) => (nombre === "content-type" ? "application/json" : null) },
  json: async () => data,
});

/** Respuesta binaria falsa (audio de `speech`). */
const resAudio = (status: number, bytes: ArrayBuffer, mime = "audio/mpeg") => ({
  ok: status >= 200 && status < 400,
  status,
  headers: { get: (nombre: string) => (nombre === "content-type" ? mime : null) },
  arrayBuffer: async () => bytes,
});

beforeEach(() => {
  reiniciarDeteccion();
});

describe("Puente del demonio de voz hacia VoiceStudio", () => {
  it("exporta el contrato por defecto", () => {
    expect(VOICE_STUDIO_URL).toBe("http://127.0.0.1:3900");
    expect(RUTA_DESCUBRIMIENTO).toBe("/.well-known/voicestudio-speech");
    expect(JUEGO_DETECCION_MS).toBe(60_000);
  });

  it("detectar pregunta al descubrimiento y devuelve true si responde bien", async () => {
    const fetchFalso = vi.fn().mockResolvedValue(resJson(200, { ok: true }));
    expect(await detectar(fetchFalso)).toBe(true);
    expect(fetchFalso).toHaveBeenCalledWith(
      `${VOICE_STUDIO_URL}${RUTA_DESCUBRIMIENTO}`,
      expect.objectContaining({ method: "GET" })
    );
  });

  it("detectar devuelve false si el descubrimiento contesta mal o falla", async () => {
    expect(await detectar(vi.fn().mockResolvedValue(resJson(500, { ok: false })))).toBe(false);
    reiniciarDeteccion();
    expect(await detectar(vi.fn().mockRejectedValue(new Error("sin red")))).toBe(false);
  });

  it("detectar cachea: dentro de los 60 s no vuelve a salir a la red", async () => {
    let instante = 1_000;
    const ahora = () => instante;
    const primero = vi.fn().mockResolvedValue(resJson(200, { ok: true }));
    const segundo = vi.fn().mockResolvedValue(resJson(500, {}));
    expect(await detectar(primero, ahora)).toBe(true);
    expect(await detectar(segundo, ahora)).toBe(true);
    expect(primero).toHaveBeenCalledTimes(1);
    expect(segundo).not.toHaveBeenCalled();
    instante += JUEGO_DETECCION_MS;
    expect(await detectar(segundo, ahora)).toBe(false);
    expect(segundo).toHaveBeenCalledTimes(1);
  });

  it("reenviar devuelve 404 para cualquier ruta fuera del contrato, sin salir a la red", async () => {
    const fetchFalso = vi.fn();
    expect(await reenviar("/otra/ruta", {}, fetchFalso)).toEqual({ status: 404, error: "No encontrado" });
    expect(await reenviar("/v1/audio/speech/../etc", {}, fetchFalso)).toEqual({
      status: 404,
      error: "No encontrado",
    });
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("reenviar pasa speech por POST con JSON y devuelve el audio tal cual", async () => {
    const audioFalso = new ArrayBuffer(8);
    const fetchFalso = vi.fn().mockResolvedValue(resAudio(200, audioFalso));
    const res = await reenviar("/v1/audio/speech", { input: "hola", voice: "alloy" }, fetchFalso);
    expect(res).toEqual({ status: 200, audio: audioFalso, mime: "audio/mpeg" });
    expect(fetchFalso).toHaveBeenCalledWith(
      `${VOICE_STUDIO_URL}/v1/audio/speech`,
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: "hola", voice: "alloy" }),
      })
    );
  });

  it("reenviar pasa transcriptions por POST y voices por GET", async () => {
    const fetchTranscripciones = vi.fn().mockResolvedValue(resJson(200, { text: "hola" }));
    const resTranscripciones = await reenviar(
      "/v1/audio/transcriptions",
      { audio_base64: "AAAA" },
      fetchTranscripciones
    );
    expect(resTranscripciones).toEqual({ status: 200, data: { text: "hola" } });

    const fetchVoces = vi.fn().mockResolvedValue(resJson(200, { data: [] }));
    const resVoces = await reenviar("/v1/audio/voices", undefined, fetchVoces);
    expect(resVoces).toEqual({ status: 200, data: { data: [] } });
    expect(fetchVoces).toHaveBeenCalledWith(
      `${VOICE_STUDIO_URL}/v1/audio/voices`,
      expect.objectContaining({ method: "GET" })
    );
  });

  it("reenviar se aparta con 502 si VoiceStudio no responde", async () => {
    const res = await reenviar("/v1/audio/speech", { input: "hola" }, vi.fn().mockRejectedValue(new Error("no hay nada")));
    expect(res.status).toBe(502);
    expect(typeof res.error).toBe("string");
    expect(res.error).not.toMatch(/127\.|localhost|3900/);
  });

  it("estado devuelve la línea de salud con vivo o ausente", async () => {
    expect(await estado(vi.fn().mockResolvedValue(resJson(200, { ok: true })))).toBe("voicestudio: vivo");
    reiniciarDeteccion();
    expect(await estado(vi.fn().mockRejectedValue(new Error("fallo")))).toBe("voicestudio: ausente");
  });
});
