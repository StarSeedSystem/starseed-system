import { describe, expect, it } from "vitest";
import { detectar, reenviar, estado } from "../../../native/astraura-voice/voicestudio-proxy.mjs";
/** Ola 1018V · VST1018Gc. Puerta pura: red y reloj inyectados, sin procesos. */
type Fetcher = (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>;
const ESTUDIO = "http://127.0.0.1:3900";
const DESCUBRIMIENTO = `${ESTUDIO}/.well-known/voicestudio-speech`;
const CACHE_MS = 60_000;
const json = (status: number, data: unknown): Response => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const audio = (status: number, bytes: ArrayBuffer): Response =>
  new Response(bytes, { status, headers: { "Content-Type": "audio/wav" } });
const caido: Fetcher = async () => { throw new Error("sin estudio"); };
// Reloj monótono: cada caso cae fuera de la caché del anterior (no se exporta).
let reloj = 1_000_000;
const siguienteAhora = () => (reloj += 1_000_000);
describe("detectar con caché", () => {
  it("huele el descubrimiento y devuelve true si responde", async () => {
    const llamadas: string[] = [];
    const fetcher: Fetcher = async (url) => {
      llamadas.push(String(url));
      return json(200, { vivo: true });
    };
    expect(await detectar(fetcher, siguienteAhora())).toBe(true);
    expect(llamadas).toEqual([DESCUBRIMIENTO]);
  });
  it("cachea 60 s, también el «ausente», y reconsulta al cumplirse", async () => {
    let llamadas = 0;
    const fetcher: Fetcher = async () => {
      llamadas += 1;
      return json(503, {});
    };
    const t = siguienteAhora();
    expect(await detectar(fetcher, t)).toBe(false);
    expect(await detectar(fetcher, t + CACHE_MS - 1)).toBe(false);
    expect(llamadas).toBe(1);
    expect(await detectar(fetcher, t + CACHE_MS)).toBe(false);
    expect(llamadas).toBe(2);
  });
  it("un reenvío caído reabre la detección (no espera los 60 s)", async () => {
    const t = siguienteAhora();
    expect(await detectar(async () => json(200, {}), t)).toBe(true);
    const res = await reenviar("/v1/audio/speech", {}, caido);
    expect(res.status).toBe(502);
    expect(res.error).not.toMatch(/127\.|3900/);
    let llamadas = 0;
    const fetcher: Fetcher = async () => {
      llamadas += 1;
      return json(503, {});
    };
    expect(await detectar(fetcher, t + 1)).toBe(false);
    expect(llamadas).toBe(1);
  });
});
describe("reenviar solo el contrato", () => {
  it("cualquier otra ruta responde 404 sin tocar la red", async () => {
    let llamadas = 0;
    const fetcher: Fetcher = async () => {
      llamadas += 1;
      return json(200, {});
    };
    for (const ruta of ["/otra/ruta", "/v1/audio/speech/../x", "/v1/audio/voces"]) {
      expect((await reenviar(ruta, {}, fetcher)).status).toBe(404);
    }
    expect(llamadas).toBe(0);
  });
  it("el método del contrato manda: GET a speech o POST a voices dan 404", async () => {
    let llamadas = 0;
    const fetcher: Fetcher = async () => {
      llamadas += 1;
      return json(200, {});
    };
    expect((await reenviar("/v1/audio/speech", {}, fetcher, { metodo: "GET" })).status).toBe(404);
    expect((await reenviar("/v1/audio/voices", {}, fetcher, { metodo: "POST" })).status).toBe(404);
    expect(llamadas).toBe(0);
  });
  it("speech sale por POST en JSON y devuelve el audio tal cual", async () => {
    const bytes = new ArrayBuffer(8);
    let opciones: RequestInit | undefined;
    const fetcher: Fetcher = async (_url, op) => {
      opciones = op;
      return audio(200, bytes);
    };
    const res = await reenviar("/v1/audio/speech", { input: "hola" }, fetcher);
    expect(res.status).toBe(200);
    expect(res.audio?.byteLength).toBe(8);
    expect(res.mime).toBe("audio/wav");
    expect(opciones?.method).toBe("POST");
    expect(opciones?.headers).toEqual({ "Content-Type": "application/json" });
    expect(opciones?.body).toBe(JSON.stringify({ input: "hola" }));
  });
  it("transcriptions conserva el cuerpo crudo y su tipo (multipart)", async () => {
    const crudo = new Uint8Array([1, 2, 3]);
    let opciones: RequestInit | undefined;
    const fetcher: Fetcher = async (_url, op) => {
      opciones = op;
      return json(200, { text: "hola" });
    };
    const res = await reenviar("/v1/audio/transcriptions", crudo, fetcher, {
      contentType: "multipart/form-data; boundary=x",
    });
    expect(res).toEqual({ status: 200, data: { text: "hola" } });
    expect(opciones?.body).toBe(crudo);
    expect(opciones?.headers).toEqual({ "Content-Type": "multipart/form-data; boundary=x" });
  });
  it("voices sale por GET sin cuerpo", async () => {
    let opciones: RequestInit | undefined;
    const fetcher: Fetcher = async (_url, op) => {
      opciones = op;
      return json(200, { voices: [] });
    };
    const res = await reenviar("/v1/audio/voices", undefined, fetcher);
    expect(res.data).toEqual({ voices: [] });
    expect(opciones).toEqual({ method: "GET", signal: expect.anything() });
  });
});
describe("línea de salud", () => {
  it("dice «vivo» o «ausente» según el descubrimiento", async () => {
    expect(await estado(async () => json(200, {}), siguienteAhora())).toBe("voicestudio: vivo");
    expect(await estado(caido, siguienteAhora())).toBe("voicestudio: ausente");
  });
});
