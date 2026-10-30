/** Pruebas del cliente de cápsulas Memvid con fetch FALSO: ni una llamada real a 4490. */
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  BASE_MEMVID, buscar, estado, linea, poner, salud, sujetoDeParametro, urlDe,
} from "../memvid-cliente";

const FECHA = new Date("2026-10-27T12:00:00.000Z"); // 2026T4 fijo, sin mirar el reloj
const SUJETO = { tipo: "personalidad" as const, id: "aurora" };
const NOMBRE = "personalidad-aurora-2026T4.mv2e"; // personal → cifrada (.mv2e)
const AUTH = { "X-StarSeed-Token": "t", "content-type": "application/json" };

interface Llamada { url: string; init: RequestInit }
function fetchFalso(status: number, data: unknown) {
  const llamadas: Llamada[] = [];
  const f = vi.fn(async (entrada: string | URL | Request, init?: RequestInit) => {
    llamadas.push({ url: String(entrada), init: init ?? {} });
    return new Response(JSON.stringify(data), { status });
  });
  return { f, llamadas };
}

describe("sujetoDeParametro y urlDe", () => {
  it("«tipo:id» vale; tipo desconocido, id vacío o null vale null", () => {
    expect(sujetoDeParametro("personalidad:aurora")).toEqual({ tipo: "personalidad", id: "aurora", grupoId: undefined });
    expect(sujetoDeParametro("cerebro:x")).toEqual({ tipo: "cerebro", id: "x", grupoId: undefined });
    expect(sujetoDeParametro("mineral:x")).toBeNull();
    expect(sujetoDeParametro("personalidad:")).toBeNull();
    expect(sujetoDeParametro(null)).toBeNull();
  });
  it("urlDe construye la ruta y rechaza nombres o rutas con / o ..", () => {
    expect(urlDe(NOMBRE, "estado")).toBe(`${BASE_MEMVID}/capsulas/${NOMBRE}/estado`);
    expect(urlDe("../etc/hosts", "estado")).toBeNull();
    expect(urlDe(NOMBRE, "../salir")).toBeNull();
  });
});

describe("poner", () => {
  it("POST con token al nombre del trimestre y devuelve el fotograma", async () => {
    const { f, llamadas } = fetchFalso(200, { frame: 3 });
    const r = await poner(SUJETO, "Hola", FECHA, { fetch: f, token: "t" });
    expect(r).toEqual({ nombre: NOMBRE, frame: 3 });
    expect(llamadas[0].url).toBe(`${BASE_MEMVID}/capsulas/${NOMBRE}/poner`);
    expect(JSON.parse(String(llamadas[0].init.body)).texto).toBe("Hola");
    expect(llamadas[0].init.headers).toMatchObject(AUTH);
  });
  it("con 507 abre la parte siguiente y reintenta una sola vez", async () => {
    const llamadas: Llamada[] = [];
    const f = vi.fn(async (u: string | URL | Request, i?: RequestInit) => {
      llamadas.push({ url: String(u), init: i ?? {} });
      return llamadas.length === 1
        ? new Response(null, { status: 507 })
        : new Response(JSON.stringify({ frame: 0 }), { status: 200 });
    });
    const r = await poner(SUJETO, "sigue", FECHA, { fetch: f, token: "t" });
    expect(r?.nombre).toBe("personalidad-aurora-2026T4b.mv2e");
    expect(llamadas).toHaveLength(2);
    expect(llamadas[1].url).toContain("-2026T4b");
  });
  it("sin token vale null y no hace ninguna llamada", async () => {
    const { f, llamadas } = fetchFalso(200, { frame: 0 });
    await expect(poner(SUJETO, "x", FECHA, { fetch: f, token: "" })).resolves.toBeNull();
    expect(llamadas).toHaveLength(0);
  });
});

describe("buscar, estado y linea", () => {
  it("buscar devuelve los aciertos y manda k en el cuerpo", async () => {
    const { f, llamadas } = fetchFalso(200, { aciertos: [{ titulo: "Un recuerdo", texto: "Planes" }] });
    const r = await buscar(SUJETO, "planes", 7, FECHA, { fetch: f, token: "t" });
    expect(r).toEqual([{ titulo: "Un recuerdo", texto: "Planes" }]);
    expect(JSON.parse(String(llamadas[0].init.body))).toEqual({ consulta: "planes", k: 7 });
  });
  it("estado traduce las claves del núcleo y calcula cuánto queda", async () => {
    const { f } = fetchFalso(200, { frame_count: 2, size_bytes: 100, capacity_bytes: 400 });
    expect(await estado(SUJETO, FECHA, { fetch: f, token: "t" }))
      .toEqual({ fotogramas: 2, bytes: 100, topeBytes: 400, quedaBytes: 300 });
    const { f: f2 } = fetchFalso(200, { fotogramas: "no", bytes: 1, topeBytes: 2 });
    expect(await estado(SUJETO, FECHA, { fetch: f2, token: "t" })).toBeNull();
  });
  it("linea limpia las entradas, sale las vacías y manda desde y hasta", async () => {
    const { f, llamadas } = fetchFalso(200, { entradas: [{ ts: 5, texto: "Algo" }, { preview: "Vista" }, { texto: "" }] });
    const r = await linea(SUJETO, 1, 9, FECHA, { fetch: f, token: "t" });
    expect(r).toEqual([{ ts: 5, texto: "Algo", uri: undefined }, { ts: undefined, texto: "Vista", uri: undefined }]);
    expect(llamadas[0].url).toContain("/linea?desde=1&hasta=9");
  });
});

describe("nunca lanza: sin servidor o respuesta mala vale null", () => {
  const f = vi.fn(async () => { throw new Error("ECONNREFUSED"); });
  const o = { fetch: f, token: "t" };
  it("poner, buscar, estado y linea valen null", async () => {
    await expect(poner(SUJETO, "x", FECHA, o)).resolves.toBeNull();
    await expect(buscar(SUJETO, "x", 5, FECHA, o)).resolves.toBeNull();
    await expect(estado(SUJETO, FECHA, o)).resolves.toBeNull();
    await expect(linea(SUJETO, undefined, undefined, FECHA, o)).resolves.toBeNull();
  });
  it("salud: true si responde, false si el servidor no está", async () => {
    expect(await salud({ fetch: f, token: "t" })).toBe(false);
    const { f: vivo } = fetchFalso(200, {});
    expect(await salud({ fetch: vivo, token: "t" })).toBe(true);
    const { f: roto } = fetchFalso(500, {});
    expect(await salud({ fetch: roto, token: "t" })).toBe(false);
  });
});
