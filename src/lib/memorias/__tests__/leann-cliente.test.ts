/** Pruebas del cliente LEANN con fetch FALSO: ni una llamada real a 4495 (LNN1028D2). */
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  BASE_LEANN, buscarLeann, nombreIndiceDe, ponerLeann, TOPE_LEANN_MS,
} from "../leann-cliente";

const SUJETO = { tipo: "personalidad" as const, id: "aurora" };
const AUTH = { "X-StarSeed-Token": "t", "content-type": "application/json" };
const TEXTO: import("../leann-cliente").TextoLeann = {
  texto: "planes del café", metadatos: { alcance: "personal", sujeto: "personalidad:aurora" },
};

interface Llamada { url: string; init: RequestInit }
function fetchFalso(status: number, data: unknown) {
  const llamadas: Llamada[] = [];
  const f = vi.fn(async (entrada: string | URL | Request, init?: RequestInit) => {
    llamadas.push({ url: String(entrada), init: init ?? {} });
    return new Response(JSON.stringify(data), { status });
  });
  return { f, llamadas };
}

describe("nombreIndiceDe", () => {
  it("el índice del sujeto: <tipo>-<id saneado>-<alcance>, sin cápsula ni parte", () => {
    expect(nombreIndiceDe(SUJETO)).toBe("personalidad-aurora-personal");
    expect(nombreIndiceDe({ tipo: "pagina", id: "café" })).toBe("pagina-cafe-publica");
    expect(nombreIndiceDe({ tipo: "cerebro", id: "Núcleo 2" })).toBe("cerebro-nucleo-2-personal");
    expect(nombreIndiceDe({ tipo: "cerebro", id: "" })).toBeNull();
  });
});

describe("ponerLeann", () => {
  it("POST con token a /indices/<nombre>/poner y devuelve true si aceptó", async () => {
    const { f, llamadas } = fetchFalso(200, { estado: "ok" });
    await expect(ponerLeann("personalidad-aurora-personal", [TEXTO], { fetch: f, token: "t" }))
      .resolves.toBe(true);
    expect(llamadas[0].url).toBe(`${BASE_LEANN}/indices/personalidad-aurora-personal/poner`);
    expect(JSON.parse(String(llamadas[0].init.body))).toEqual({ textos: [TEXTO] });
    expect(llamadas[0].init.headers).toMatchObject(AUTH);
  });
  it("rechazo del servidor vale false; índice con /, poco texto o vacío ni llama", async () => {
    const { f, llamadas } = fetchFalso(403, { error: "no autorizado" });
    await expect(ponerLeann("personalidad-aurora-personal", [TEXTO], { fetch: f, token: "t" }))
      .resolves.toBe(false);
    expect(llamadas).toHaveLength(1);
    const { f: f2, llamadas: l2 } = fetchFalso(200, {});
    await expect(ponerLeann("../mal", [TEXTO], { fetch: f2, token: "t" })).resolves.toBeNull();
    await expect(ponerLeann("ok", [], { fetch: f2, token: "t" })).resolves.toBeNull();
    expect(l2).toHaveLength(0);
  });
  it("sin token vale null y no hace ninguna llamada", async () => {
    const { f, llamadas } = fetchFalso(200, { estado: "ok" });
    await expect(ponerLeann("personalidad-aurora-personal", [TEXTO], { fetch: f, token: "" }))
      .resolves.toBeNull();
    expect(llamadas).toHaveLength(0);
  });
});

describe("buscarLeann", () => {
  it("manda consulta, k, filtros y peso_vector, y traduce los aciertos", async () => {
    const { f, llamadas } = fetchFalso(200, [
      { id: "a-1", puntuacion: 0.9, texto: "planes del café", metadatos: { alcance: "personal" } },
      { id: 3, puntuacion: 0.4, texto: "otro recuerdo" },
    ]);
    const r = await buscarLeann("personalidad-aurora-personal", "¿qué dije del café?",
      { k: 7, filtros: { alcance: { in: ["personal"] } }, pesoVector: 0.7 },
      { fetch: f, token: "t" });
    expect(r).toEqual([
      { id: "a-1", puntuacion: 0.9, texto: "planes del café", metadatos: { alcance: "personal" } },
      { id: 3, puntuacion: 0.4, texto: "otro recuerdo", metadatos: {} },
    ]);
    expect(JSON.parse(String(llamadas[0].init.body))).toEqual({
      consulta: "¿qué dije del café?", k: 7,
      filtros: { alcance: { in: ["personal"] } }, peso_vector: 0.7,
    });
    expect(llamadas[0].url).toBe(`${BASE_LEANN}/indices/personalidad-aurora-personal/buscar`);
  });
  it("sin k, filtros ni peso_vector el cuerpo solo lleva la consulta", async () => {
    const { f, llamadas } = fetchFalso(200, []);
    await expect(buscarLeann("x", "algo", {}, { fetch: f, token: "t" })).resolves.toEqual([]);
    expect(JSON.parse(String(llamadas[0].init.body))).toEqual({ consulta: "algo" });
  });
  it("respuesta sin lista, acierto sin puntuación, consulta vacía o servidor caído vale null", async () => {
    const { f } = fetchFalso(200, { no: "es una lista" });
    await expect(buscarLeann("x", "algo", {}, { fetch: f, token: "t" })).resolves.toBeNull();
    const { f: f2 } = fetchFalso(200, [{ puntuacion: 0.5 }, { id: "a", puntuacion: 1, texto: "set" }]);
    await expect(buscarLeann("x", "algo", {}, { fetch: f2, token: "t" }))
      .resolves.toEqual([{ id: "a", puntuacion: 1, texto: "set", metadatos: {} }]);
    const { f: f3 } = fetchFalso(404, { error: "índice inexistente" });
    await expect(buscarLeann("x", "algo", {}, { fetch: f3, token: "t" })).resolves.toBeNull();
    const { f: f4 } = fetchFalso(200, []);
    await expect(buscarLeann("x", "  ", {}, { fetch: f4, token: "t" })).resolves.toBeNull();
    const caido = vi.fn(async () => { throw new Error("ECONNREFUSED"); });
    await expect(buscarLeann("x", "algo", {}, { fetch: caido, token: "t" })).resolves.toBeNull();
    await expect(buscarLeann("x", "algo", {}, { fetch: caido, token: "" })).resolves.toBeNull();
  });
});

describe("tope", () => {
  it("1,5 s, como el cliente de cápsulas", () => expect(TOPE_LEANN_MS).toBe(1500));
});
