import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RAIZ_VOICESTUDIO,
  URL_DESCUBRIMIENTO,
  resetearDeteccion,
  detectar,
  reenviar,
  estado,
} from "../../../native/astraura-voice/voicestudio-proxy.mjs";

/**
 * Ola 1018V · G. Prueba el proxy PURO: la red es un `fetcher` prestado (nunca
 * se toca la real), el reloj es un número inyectado. Sin procesos, sin sonido.
 */

const RESPUESTA_OK = { ok: true, status: 200 };

const RESPUESTA_JSON = (status, datos) => ({
  ok: status < 400,
  status,
  headers: { get: () => "application/json" },
  json: async () => datos,
});

const RESPUESTA_AUDIO = (status) => ({
  ok: status < 400,
  status,
  headers: { get: () => "audio/wav" },
  arrayBuffer: async () => new ArrayBuffer(8),
});

describe("voicestudio-proxy: detección con caché de 60 s", () => {
  beforeEach(() => {
    resetearDeteccion();
    vi.restoreAllMocks();
  });

  it("huele el descubrimiento de VoiceStudio y devuelve true si responde", async () => {
    const obedece = vi.fn().mockResolvedValue(RESPUESTA_OK);
    expect(await detectar(obedece, 1000)).toBe(true);
    expect(obedece).toHaveBeenCalledWith(URL_DESCUBRIMIENTO);
    expect(String(URL_DESCUBRIMIENTO)).toContain("127.0.0.1:3900");
  });

  it("nunca lanza: con el estudio caído devuelve false", async () => {
    const obedece = vi.fn().mockRejectedValue(new Error("conexión rechazada"));
    expect(await detectar(obedece, 1000)).toBe(false);
  });

  it("una respuesta de error del descubrimiento también es estar ausente", async () => {
    const obedece = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    expect(await detectar(obedece, 1000)).toBe(false);
  });

  it("pregunta mucho seguido y el descubrimiento sólo se huele una vez", async () => {
    const obedece = vi.fn().mockResolvedValue(RESPUESTA_OK);
    await detectar(obedece, 1000);
    await detectar(obedece, 30_000);
    await detectar(obedece, 50_000);
    expect(obedece).toHaveBeenCalledTimes(1);
  });

  it("pasado el minuto el descubrimiento se huele de nuevo", async () => {
    const obedece = vi.fn().mockResolvedValue(RESPUESTA_OK);
    await detectar(obedece, 1000);
    await detectar(obedece, 61_000);
    expect(obedece).toHaveBeenCalledTimes(2);
  });

  it("resetearDeteccion fuerza un ping nuevo", async () => {
    const obedece = vi.fn().mockResolvedValue(RESPUESTA_OK);
    await detectar(obedece, 1000);
    await detectar(obedece, 2000);
    resetearDeteccion();
    await detectar(obedece, 2000);
    expect(obedece).toHaveBeenCalledTimes(2);
  });
});

describe("voicestudio-proxy: reenvío de la API compatible con OpenAI", () => {
  it("las otras rutas no pasan por la puerta: 404 sin reloj ni red", async () => {
    const obedece = vi.fn();
    expect(await reenviar("/v1/videos", {}, obedece)).toEqual({ status: 404, error: "ruta no permitida" });
    expect(await reenviar("/otra/ruta", {}, obedece)).toEqual({ status: 404, error: "ruta no permitida" });
    expect(await reenviar("/v1/audio/espion", {}, obedece)).toEqual({ status: 404, error: "ruta no permitida" });
    expect(obedece).not.toHaveBeenCalled();
  });

  it("la voz sale a /v1/audio/speech en binario, con su marca de audio clonado arriba", async () => {
    const obedece = vi.fn().mockResolvedValue(RESPUESTA_AUDIO(200));
    const res = await reenviar("/v1/audio/speech", { input: "hola" }, obedece);
    expect(res.status).toBe(200);
    expect(res.tipo).toBe("audio/wav");
    expect(res.audio).toBeInstanceOf(ArrayBuffer);
    expect(res.datos).toBeUndefined();
    expect(obedece).toHaveBeenCalledWith(`${RAIZ_VOICESTUDIO}/v1/audio/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "hola" }),
    });
  });

  it("el oído va a /v1/audio/transcriptions aceptando el cuerpo crudo del cliente", async () => {
    const obedece = vi.fn().mockResolvedValue(RESPUESTA_JSON(200, { text: "hola" }));
    const crudo = `--borde--\r\nContent-Disposition: form-data; name="audio"\r\n\r\n1111\r\n--borde--\r\n`;
    const res = await reenviar("/v1/audio/transcriptions", crudo, obedece);
    expect(res.status).toBe(200);
    expect(res.datos).toEqual({ text: "hola" });
    expect(obedece).toHaveBeenCalledWith(`${RAIZ_VOICESTUDIO}/v1/audio/transcriptions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: crudo,
    });
  });

  it("las voces se listan por GET y no lleva cuerpo", async () => {
    const obedece = vi.fn().mockResolvedValue(RESPUESTA_JSON(200, { voices: [] }));
    const res = await reenviar("/v1/audio/voices", undefined, obedece);
    expect(res.status).toBe(200);
    expect(res.datos).toEqual({ voices: [] });
    expect(obedece).toHaveBeenCalledWith(`${RAIZ_VOICESTUDIO}/v1/audio/voices`, {
      method: "GET",
      headers: undefined,
      body: undefined,
    });
  });

  it("si el estudio no responde la puerta se aparta con 502 y no tumba a nadie", async () => {
    const obedece = vi.fn().mockRejectedValue(new Error("no hay estudio"));
    const res = await reenviar("/v1/audio/speech", { input: "hola" }, obedece);
    expect(res.status).toBe(502);
    expect(res.error).toBe("voicestudio no responde");
  });

  it("un POST sin cuerpo pregunta con el objeto vacío serializado", async () => {
    const obedece = vi.fn().mockResolvedValue(RESPUESTA_JSON(400, { error: "falta input" }));
    const res = await reenviar("/v1/audio/speech", undefined, obedece);
    expect(res.status).toBe(400);
    expect(obedece.mock.calls[0][1].body).toBe("{}");
  });
});

describe("voicestudio-proxy: línea de salud para el daemon", () => {
  beforeEach(() => {
    resetearDeteccion();
  });

  it("estado() dice «vivo» cuando el estudio está", async () => {
    expect(await estado(vi.fn().mockResolvedValue(RESPUESTA_OK))).toBe("voicestudio: vivo");
  });

  it("estado() dice «ausente» cuando no está, y la cadena sirve de línea de /status", async () => {
    expect(await estado(vi.fn().mockRejectedValue(new Error("x")))).toBe("voicestudio: ausente");
  });
});
