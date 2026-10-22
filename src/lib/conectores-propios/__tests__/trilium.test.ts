import { describe, expect, it } from "vitest";

import {
  TOPE_CONTENIDO_BYTES,
  buscarNotas,
  crearNota,
  leerNota,
  type Pedir,
} from "@/lib/conectores-propios/trilium";

const BASE = "https://notas.ejemplo";
const TOKEN = "token-secreto-123";

function respuestaJson(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });
}

describe("cliente ETAPI de Trilium", () => {
  it("busca notas y devuelve id y título", async () => {
    const llamadas: Array<{ url: string; init: RequestInit }> = [];
    const pedir: Pedir = async (url, init) => {
      llamadas.push({ url, init });
      return respuestaJson({ results: [{ noteId: "n1", title: "Perfil de Ana" }, { noteId: "n2", title: "Grupo" }] });
    };
    const r = await buscarNotas(`${BASE}/`, TOKEN, "perfil de Ana", 5, pedir);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.datos).toEqual([
      { id: "n1", titulo: "Perfil de Ana" },
      { id: "n2", titulo: "Grupo" },
    ]);
    expect(llamadas[0].url).toBe(`${BASE}/etapi/notes?search=perfil%20de%20Ana&limit=5`);
    expect(new Headers(llamadas[0].init.headers).get("authorization")).toBe(TOKEN);
  });

  it("corta el contenido en 64 KB sin pasarse de bytes", async () => {
    const contenido = "ñ".repeat(TOPE_CONTENIDO_BYTES);
    const pedir: Pedir = async () => new Response(contenido, { status: 200 });
    const r = await leerNota(BASE, TOKEN, "n1", pedir);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.datos.truncada).toBe(true);
    expect(r.datos.contenido.length).toBeLessThan(contenido.length);
    expect(new TextEncoder().encode(r.datos.contenido).length).toBeLessThanOrEqual(TOPE_CONTENIDO_BYTES);
  });

  it("no marca como truncada una nota pequeña", async () => {
    const pedir: Pedir = async () => new Response("Hola, memoria del cerebro.", { status: 200 });
    const r = await leerNota(BASE, TOKEN, "n1", pedir);
    expect(r).toEqual({ ok: true, datos: { id: "n1", contenido: "Hola, memoria del cerebro.", truncada: false } });
  });

  it("el error HTTP no filtra el token", async () => {
    const pedir: Pedir = async () => new Response(`Token rechazado: ${TOKEN}`, { status: 401 });
    const r = await leerNota(BASE, TOKEN, "n1", pedir);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("401");
    expect(r.motivo).not.toContain(TOKEN);
  });

  it("crea la nota con el padre, el título y el tipo", async () => {
    const llamadas: Array<{ url: string; init: RequestInit }> = [];
    const pedir: Pedir = async (url, init) => {
      llamadas.push({ url, init });
      return respuestaJson({ noteId: "n9", title: "Nueva" });
    };
    const r = await crearNota(BASE, TOKEN, "root", "Perfil", "Hola", "text", pedir);
    expect(r).toEqual({ ok: true, datos: { id: "n9", titulo: "Nueva" } });
    expect(llamadas[0].url).toBe(`${BASE}/etapi/create-note`);
    expect(llamadas[0].init.method).toBe("POST");
    expect(JSON.parse(String(llamadas[0].init.body))).toEqual({
      parentNoteId: "root",
      title: "Perfil",
      type: "text",
      content: "Hola",
    });
  });
});
