// Pruebas del cliente de cápsulas Memvid (MVD1027D) — puro con `fetch` falso
// inyectado y token de prueba; sin disco, sin red, sin `vi.mock` de módulos de Node.
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buscar, estado, linea, parsearSujeto, salud, poner, MEMVID_URL, type OpcionesCliente,
} from "../memvid-cliente";
import { capsulaDe } from "../capsulas";

interface Llamada { url: string; init: RequestInit | undefined; }

function fetchFalso(status: number, cuerpo: unknown): { impl: typeof fetch; llamadas: Llamada[] } {
  const llamadas: Llamada[] = [];
  const impl = (async (url: string | URL, init?: RequestInit) => {
    llamadas.push({ url: String(url), init });
    return new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return { impl, llamadas };
}

function fetchMuerto(): typeof fetch {
  return (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;
}

const ops = (impl: typeof fetch): OpcionesCliente => ({ fetchImpl: impl, token: "prueba-1" });

describe("parsearSujeto", () => {
  it("lee «tipo:id» y descarta lo que no encaja", () => {
    expect(parsearSujeto("pagina:cafe-1")).toEqual({ tipo: "pagina", id: "cafe-1" });
    expect(parsearSujeto("grupo:g-9")).toEqual({ tipo: "grupo", id: "g-9" });
    expect(parsearSujeto("modo:cafe-1")).toBeNull();
    expect(parsearSujeto("pagina:")).toBeNull();
    expect(parsearSujeto("'")).toBeNull();
    expect(parsearSujeto(null)).toBeNull();
  });
});

describe("poner", () => {
  it("añade un recuerdo y devuelve la cápsula del trimestre con su parte", async () => {
    const { impl, llamadas } = fetchFalso(200, { frame: { id: 7 } });
    const sujeto = { tipo: "pagina" as const, id: "cafe-1" };
    const r = await poner(sujeto, "Recuerdo de la página", ops(impl));
    const esperado = capsulaDe(sujeto, new Date()).nombre;
    expect(r).toEqual({ ok: true, nombre: esperado, parte: 1, rotada: false });
    expect(llamadas[0].url).toBe(`${MEMVID_URL}/capsulas/${esperado}/poner`);
    expect(JSON.parse(String(llamadas[0].init?.body)).texto).toBe("Recuerdo de la página");
    expect((llamadas[0].init?.headers as Record<string, string>)["X-StarSeed-Token"]).toBe("prueba-1");
  });

  it("con 507 abre la parte siguiente con nombreCapsula(…, parte+1) y reintenta una vez", async () => {
    const sujeto = { tipo: "pagina" as const, id: "cafe-1" };
    const llamadas: Llamada[] = [];
    const impl = (async (url: string | URL, init?: RequestInit) => {
      llamadas.push({ url: String(url), init });
      return llamadas.length === 1 ? new Response("", { status: 507 })
        : new Response(JSON.stringify({ frame: { id: 1 } }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await poner(sujeto, "texto", ops(impl));
    expect(r?.parte).toBe(2);
    expect(r?.rotada).toBe(true);
    expect(llamadas.length).toBe(2);
    expect(llamadas[1].url).toBe(`${MEMVID_URL}/capsulas/${capsulaDe(sujeto, new Date(), 2).nombre}/poner`);
  });

  it("dos 507 seguidos agotan el reintento y devuelven null", async () => {
    const llamadas: Llamada[] = [];
    const impl = (async (url: string | URL, init?: RequestInit) => {
      llamadas.push({ url: String(url), init });
      return new Response("", { status: 507 });
    }) as unknown as typeof fetch;
    const r = await poner({ tipo: "pagina", id: "cafe-1" }, "texto", ops(impl));
    expect(r).toBeNull();
    expect(llamadas.length).toBe(2);
  });

  it("nunca lanza: servidor caído, texto vacío o sujeto sin cápsula", async () => {
    const sujeto = { tipo: "pagina" as const, id: "cafe-1" };
    await expect(poner(sujeto, "texto", ops(fetchMuerto()))).resolves.toBeNull();
    await expect(poner(sujeto, "   ", ops(fetchMuerto()))).resolves.toBeNull();
    await expect(poner({ tipo: "pagina", id: "" }, "texto", ops(fetchMuerto()))).resolves.toBeNull();
  });
});

describe("buscar, estado, linea y salud", () => {
  const nombre = "pagina-cafe-1-2026T4.mv2";

  it("buscar manda la consulta y k al servidor y devuelve los aciertos", async () => {
    const { impl, llamadas } = fetchFalso(200, { aciertos: [{ texto: "planes" }] });
    const r = await buscar(nombre, "planes", 3, ops(impl));
    expect(r).toEqual([{ texto: "planes" }]);
    expect(llamadas[0].url).toBe(`${MEMVID_URL}/capsulas/${nombre}/buscar`);
    expect(JSON.parse(String(llamadas[0].init?.body))).toEqual({ consulta: "planes", k: 3 });
    await expect(buscar(nombre, "   ", 3, ops(impl))).resolves.toBeNull();
    await expect(buscar(nombre, "planes", 3, ops(fetchMuerto()))).resolves.toBeNull();
  });

  it("estado pide su ruta GET y devuelve el cuerpo", async () => {
    const { impl, llamadas } = fetchFalso(200, { fotogramas: 2, bytes: 9, tope: 10, libre: 1 });
    const r = await estado(nombre, ops(impl));
    expect(r).toEqual({ fotogramas: 2, bytes: 9, tope: 10, libre: 1 });
    expect(llamadas[0].url).toBe(`${MEMVID_URL}/capsulas/${nombre}/estado`);
    expect(llamadas[0].init?.method).toBeUndefined();
  });

  it("linea lleva desde y hasta en la cadena de la ruta", async () => {
    const { impl, llamadas } = fetchFalso(200, { linea: [{ texto: "hoy" }] });
    const r = await linea(nombre, 100, 200, ops(impl));
    expect(r).toEqual([{ texto: "hoy" }]);
    expect(llamadas[0].url).toBe(`${MEMVID_URL}/capsulas/${nombre}/linea?desde=100&hasta=200`);
    await expect(linea("mal nombre/..", 1, 2, ops(impl))).resolves.toBeNull();
  });

  it("salud distingue vivo de muerto y «no sé»", async () => {
    expect(await salud(ops(fetchFalso(200, { ok: true }).impl))).toBe(true);
    expect(await salud(ops(fetchFalso(403, { error: "x" }).impl))).toBe(false);
    expect(await salud(ops(fetchMuerto()))).toBeNull();
  });
});
