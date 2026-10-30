/** Pruebas del cliente LEANN con fetch FALSO: ni una llamada real al 4495 del A1. */
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  BASE_LEANN, buscarLeann, indiceUrl, nombreIndiceLeann, ponerLeann,
} from "../leann-cliente";

const SUJETO = { tipo: "personalidad" as const, id: "aurora" };
const AUTH = { "X-StarSeed-Token": "t", "content-type": "application/json" };

function fetchFalso(status: number, data: unknown) {
  const llamadas: Array<{ url: string; init: RequestInit }> = [];
  const f = vi.fn(async (entrada: string | URL | Request, init?: RequestInit) => {
    llamadas.push({ url: String(entrada), init: init ?? {} });
    return new Response(JSON.stringify(data), { status });
  });
  return { f, llamadas };
}

describe("nombreIndiceLeann e indiceUrl", () => {
  it("el índice es el de la cápsula sin parte ni extensión: <tipo>-<id>-<alcance>", () => {
    expect(nombreIndiceLeann(SUJETO)).toBe("personalidad-aurora-personal"); // sin trimestre
    expect(nombreIndiceLeann({ tipo: "perfil", id: "Álex Café_2" })).toBe("perfil-alex-cafe-2-perfil");
  });
  it("indiceUrl construye la ruta y rechaza índices o rutas con / o ..", () => {
    expect(indiceUrl("personalidad-aurora-personal", "buscar"))
      .toBe(`${BASE_LEANN}/indices/personalidad-aurora-personal/buscar`);
    expect(indiceUrl("repo/starseed", "buscar")).toBeNull();
    expect(indiceUrl("repo-starseed", "../salir")).toBeNull();
    expect(indiceUrl("repo-starseed", "buscar", "http://127.0.0.1:4495/")).toBe(
      "http://127.0.0.1:4495/indices/repo-starseed/buscar",
    );
  });
});

describe("buscarLeann", () => {
  it("POST con token al índice: consulta, k, filtros y peso_vector en el cuerpo", async () => {
    const { f, llamadas } = fetchFalso(200, [
      { id: "a1", puntuacion: 0.9, texto: "planes del café", metadatos: { alcance: "personal" } },
      { puntuacion: 0.1, texto: "Otro recuerdo" },
    ]);
    const r = await buscarLeann("personalidad-aurora-personal", "¿qué dije de la cafetería?", {
      k: 7, filtros: { alcance: { in: ["perfil", "publica"] } }, pesoVector: 0.7,
    }, { fetch: f, token: "t" });
    expect(r).toEqual([
      { id: "a1", puntuacion: 0.9, texto: "planes del café", metadatos: { alcance: "personal" } },
      { id: "", puntuacion: 0.1, texto: "Otro recuerdo", metadatos: undefined },
    ]);
    expect(llamadas[0].url).toBe(
      `${BASE_LEANN}/indices/personalidad-aurora-personal/buscar`,
    );
    expect(JSON.parse(String(llamadas[0].init.body))).toEqual({
      consulta: "¿qué dije de la cafetería?",
      k: 7,
      filtros: { alcance: { in: ["perfil", "publica"] } },
      peso_vector: 0.7,
    });
    expect(llamadas[0].init.headers).toMatchObject(AUTH);
  });
  it("k ausente vale 5 y sin opciones extra el cuerpo solo lleva consulta y k", async () => {
    const { f, llamadas } = fetchFalso(200, []);
    await expect(buscarLeann("repo-starseed", "x", {}, { fetch: f, token: "t" })).resolves.toEqual([]);
    expect(JSON.parse(String(llamadas[0].init.body))).toEqual({ consulta: "x", k: 5 });
  });
  it("respuesta con 4xx o cuerpo que no es lista vale null; sin token ni llamada", async () => {
    const { f, llamadas } = fetchFalso(404, { error: "no está" });
    await expect(buscarLeann("repo-starseed", "x", {}, { fetch: f, token: "t" })).resolves.toBeNull();
    await expect(buscarLeann("repo-starseed", "x", {}, { fetch: f, token: "" })).resolves.toBeNull();
    await expect(buscarLeann("repo/starseed", "x", {}, { fetch: f, token: "t" })).resolves.toBeNull();
    expect(llamadas).toHaveLength(1); // solo la del 404; sin token ni índice malo no hay llamada
  });
});

describe("ponerLeann", () => {
  it("POST {textos} y true con 2xx; false con 4xx/5xx o sin textos", async () => {
    const { f, llamadas } = fetchFalso(200, { ok: true, puestos: 1 });
    const bien = await ponerLeann("perfil-alex-cafe-2-perfil", [
      { texto: "Planes", metadatos: { alcance: "perfil", sujeto: "perfil:alex", uri: "mv2://x#1", ts: 1 } },
    ], { fetch: f, token: "t" });
    expect(bien).toBe(true);
    const cuerpo = JSON.parse(String(llamadas[0].init.body)) as { textos: unknown };
    expect(cuerpo.textos).toHaveLength(1);
    expect(llamadas[0].url).toContain("/indices/perfil-alex-cafe-2-perfil/poner");
    const { f: f2 } = fetchFalso(500, {});
    await expect(ponerLeann("repo-starseed", [{ texto: "x" }], { fetch: f2, token: "t" })).resolves.toBe(false);
    const { f: f3 } = fetchFalso(200, {});
    await expect(ponerLeann("repo-starseed", [], { fetch: f3, token: "t" })).resolves.toBe(false);
  });
});

describe("nunca lanza: sin servidor vale null (buscar) o false (poner)", () => {
  it("con fetch que tira, buscar vale null y poner false", async () => {
    const f = vi.fn(async () => { throw new Error("ECONNREFUSED"); });
    await expect(buscarLeann("repo-starseed", "x", {}, { fetch: f, token: "t" })).resolves.toBeNull();
    await expect(ponerLeann("repo-starseed", [{ texto: "x" }], { fetch: f, token: "t" })).resolves.toBe(false);
  });
});
