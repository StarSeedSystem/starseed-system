import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  TOPE_PETICION_MS, crearClienteMemvid, type FetchCapsulas, type RespuestaCapsulas,
} from "../memvid-cliente";

const F = new Date(Date.UTC(2026, 9, 28));
const SUJ = { tipo: "personalidad" as const, id: "Aurora Nova" };
const BASE = "http://127.0.0.1:4490";
const r = (status: number, datos: unknown): RespuestaCapsulas => ({ status, json: async () => datos });
type Llamada = { url: string; init: Parameters<FetchCapsulas>[1] };

function falso(respuesta: (n: number, llamada: Llamada) => RespuestaCapsulas | Promise<RespuestaCapsulas>) {
  const llamadas: Llamada[] = [];
  const fetchImpl: FetchCapsulas = async (url, init) => {
    const llamada = { url, init };
    llamadas.push(llamada);
    return respuesta(llamadas.length, llamada);
  };
  return { fetchImpl, llamadas };
}
const cliente = (fetchImpl: FetchCapsulas, token: string | null = "tok") =>
  crearClienteMemvid({ token, fetchImpl, ahora: () => F, baseUrl: `${BASE}/` });
describe("salud y token", () => {
  it("salud: true si responde y manda el token del llavero", async () => {
    const { fetchImpl, llamadas } = falso(() => r(200, { ok: true }));
    expect(await cliente(fetchImpl).salud()).toBe(true);
    expect(llamadas[0].url).toBe(`${BASE}/salud`);
    expect(llamadas[0].init.headers["X-StarSeed-Token"]).toBe("tok");
  });
  it("sin token no llama al servidor: todo queda en null/false", async () => {
    const { fetchImpl, llamadas } = falso(() => r(200, {}));
    const c = cliente(fetchImpl, null);
    expect(await c.salud()).toBe(false);
    expect(await c.estado(SUJ)).toBeNull();
    expect(llamadas).toHaveLength(0);
  });
});
describe("estado", () => {
  it("usa el nombre de la cápsula, cifrada en personal, y calcula cuánto queda", async () => {
    const { fetchImpl, llamadas } = falso(() => r(200, { fotogramas: 7, bytes: 1024, topeBytes: 50 * 1024 * 1024 }));
    const e = await cliente(fetchImpl).estado(SUJ, { parte: 2 });
    expect(llamadas[0].url).toBe(`${BASE}/capsulas/personalidad-aurora-nova-2026T4b.mv2e/estado`);
    expect(e).toEqual({
      nombre: "personalidad-aurora-nova-2026T4b.mv2e", fotogramas: 7, bytes: 1024,
      topeBytes: 52_428_800, quedanBytes: 52_427_776,
    });
  });
});
describe("poner", () => {
  it("envía el texto recortado y los metadatos, y devuelve el fotograma", async () => {
    const { fetchImpl, llamadas } = falso(() => r(200, { frame: 12 }));
    const p = await cliente(fetchImpl).poner(SUJ, "  hola  ", {
      titulo: "T", uri: "mv2://x", etiquetas: ["a"], ts: 5,
    });
    expect(p).toEqual({ nombre: "personalidad-aurora-nova-2026T4.mv2e", frame: 12, parte: 1 });
    expect(llamadas[0].url).toBe(`${BASE}/capsulas/personalidad-aurora-nova-2026T4.mv2e/poner`);
    expect(JSON.parse(llamadas[0].init.body ?? "")).toEqual({
      texto: "hola", titulo: "T", uri: "mv2://x", etiquetas: ["a"], ts: 5,
    });
  });
  it("con 507 abre la parte siguiente y reintenta una sola vez", async () => {
    const { fetchImpl, llamadas } = falso((n) => (n === 1 ? r(507, { error: "llena" }) : r(200, { frame: 1 })));
    const p = await cliente(fetchImpl).poner(SUJ, "hola");
    expect(p).toEqual({ nombre: "personalidad-aurora-nova-2026T4b.mv2e", frame: 1, parte: 2 });
    expect(llamadas.map((l) => l.url)).toEqual([
      `${BASE}/capsulas/personalidad-aurora-nova-2026T4.mv2e/poner`,
      `${BASE}/capsulas/personalidad-aurora-nova-2026T4b.mv2e/poner`,
    ]);
  });
  it("dos 507 seguidos no insisten más", async () => {
    const { fetchImpl, llamadas } = falso(() => r(507, {}));
    expect(await cliente(fetchImpl).poner(SUJ, "hola")).toBeNull();
    expect(llamadas).toHaveLength(2);
  });
});
describe("buscar", () => {
  it("limpia aciertos inválidos y no pasa de k", async () => {
    const { fetchImpl, llamadas } = falso(() => r(200, { aciertos: [
      { titulo: "uno", texto: "hola", uri: "u", ts: "5" }, { texto: "" }, { texto: "dos" },
    ] }));
    const a = await cliente(fetchImpl).buscar(SUJ, " hola ", 2);
    expect(a).toEqual([
      { titulo: "uno", texto: "hola", uri: "u", ts: 5 },
      { titulo: null, texto: "dos", uri: null, ts: null },
    ]);
    expect(JSON.parse(llamadas[0].init.body ?? "")).toEqual({ consulta: "hola", k: 2 });
  });
  it("servidor caído devuelve null y nunca lanza", async () => {
    const fetchImpl: FetchCapsulas = async () => { throw new Error("ECONNREFUSED"); };
    expect(await cliente(fetchImpl).buscar(SUJ, "hola", 3)).toBeNull();
    expect(await cliente(fetchImpl).estado(SUJ)).toBeNull();
    expect(await cliente(fetchImpl).linea(SUJ)).toBeNull();
  });
});
describe("linea y tope de tiempo", () => {
  it("pasa desde/hasta y normaliza la vista previa", async () => {
    const { fetchImpl, llamadas } = falso(() => r(200, {
      linea: [{ frameId: 3, timestamp: 10, vistaPrevia: "recuerdo" }],
    }));
    const l = await cliente(fetchImpl).linea(SUJ, { desde: 1, hasta: 9 });
    expect(llamadas[0].url).toBe(`${BASE}/capsulas/personalidad-aurora-nova-2026T4.mv2e/linea?desde=1&hasta=9`);
    expect(l).toEqual([{ frame: 3, ts: 10, texto: "recuerdo", uri: null }]);
  });
  it("un servidor colgado se corta a los 1,5 s", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl: FetchCapsulas = (_url, init) => new Promise((_ok, mal) => {
        init.signal?.addEventListener("abort", () => mal(new Error("abortado")));
      });
      const pendiente = cliente(fetchImpl).salud();
      await vi.advanceTimersByTimeAsync(TOPE_PETICION_MS + 10);
      expect(await pendiente).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
