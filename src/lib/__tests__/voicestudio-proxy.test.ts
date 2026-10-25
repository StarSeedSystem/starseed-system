import { describe, expect, it } from "vitest";
import {
  detectar,
  estado,
  limpiarCache,
  reenviar,
} from "../../../native/astraura-voice/voicestudio-proxy.mjs";

const okJson = (data) => ({
  ok: true,
  status: 200,
  headers: { get: () => "application/json" },
  json: async () => data,
});
const fija = () => 1700000000000; // reloj inyectable, sin esperar nada

describe("Puerta local hacia VoiceStudio · detectar con caché", () => {
  it("consulta el descubrimiento en 127.0.0.1:3900 y devuelve true", async () => {
    limpiarCache();
    let pedidas = "";
    const fetcher = async (url) => {
      pedidas = url;
      return { ok: true };
    };
    expect(await detectar(fetcher, fija)).toBe(true);
    expect(pedidas).toBe("http://127.0.0.1:3900/.well-known/voicestudio-speech");
  });

  it("se aparta con false si VoiceStudio no responde", async () => {
    limpiarCache();
    expect(await detectar(async () => { throw new Error("sin conexión"); }, fija)).toBe(false);
  });

  it("cada 60 s como mucho: dentro de la cadencia no vuelve a consultar", async () => {
    limpiarCache();
    let llamadas = 0;
    const fetcher = async () => { llamadas += 1; return { ok: true }; };
    await detectar(fetcher, fija);
    await detectar(fetcher, () => fija() + 59000);
    expect(llamadas).toBe(1);
  });

  it("reconsulta el descubrimiento pasados los 60 s", async () => {
    limpiarCache();
    let llamadas = 0;
    const fetcher = async () => { llamadas += 1; return { ok: true }; };
    await detectar(fetcher, fija);
    await detectar(fetcher, () => fija() + 61000);
    expect(llamadas).toBe(2);
  });

  it("también cachea «ausente» para no sondear a cada rato", async () => {
    limpiarCache();
    let llamadas = 0;
    const fetcher = async () => { llamadas += 1; throw new Error("apagado"); };
    await detectar(fetcher, fija);
    await detectar(fetcher, () => fija() + 1000);
    expect(llamadas).toBe(1);
  });
});

describe("Puerta local hacia VoiceStudio · reenviar", () => {
  it("cualquier otra ruta → 404 sin tocar el fetch", async () => {
    let pedidas = 0;
    const fetcher = async () => { pedidas += 1; return okJson({}); };
    const res = await reenviar("/dentro/de/vs", { a: 1 }, fetcher);
    expect(res.status).toBe(404);
    expect(pedidas).toBe(0);
  });

  it("POST /v1/audio/speech reenvía el cuerpo como JSON", async () => {
    let pedida = null;
    const fetcher = async (url, op) => { pedida = { url, op }; return okJson({ ok: true }); };
    const res = await reenviar("/v1/audio/speech", { texto: "hola" }, fetcher);
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ ok: true });
    expect(pedida.url).toBe("http://127.0.0.1:3900/v1/audio/speech");
    expect(pedida.op).toEqual({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto: "hola" }),
    });
  });

  it("GET /v1/audio/voices reenvía por GET sin cuerpo", async () => {
    let op = null;
    const fetcher = async (_url, opciones) => { op = opciones; return okJson({ voices: [] }); };
    const res = await reenviar("/v1/audio/voices", null, fetcher);
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ voices: [] });
    expect(op).toEqual({ method: "GET" });
  });

  it("la voz sintetizada llega de una pieza como audio binario", async () => {
    const fetcher = async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "audio/wav" },
      arrayBuffer: async () => new ArrayBuffer(4),
    });
    const res = await reenviar("/v1/audio/speech", { texto: "hola" }, fetcher);
    expect(res.status).toBe(200);
    expect(res.audio.byteLength).toBe(4);
  });

  it("si VoiceStudio no está, responde 502 y se aparta", async () => {
    const res = await reenviar("/v1/audio/speech", {}, async () => { throw new Error("cayó"); });
    expect(res.status).toBe(502);
    expect(res.error).toBe("VoiceStudio no responde en esta neurona");
  });
});

describe("Puerta local hacia VoiceStudio · estado", () => {
  it("devuelve la línea «voicestudio: vivo»", async () => {
    limpiarCache();
    expect(await estado(async () => ({ ok: true }), fija)).toBe("voicestudio: vivo");
  });

  it("devuelve la línea «voicestudio: ausente»", async () => {
    limpiarCache();
    expect(await estado(async () => { throw new Error("no está"); }, fija)).toBe("voicestudio: ausente");
  });
});
