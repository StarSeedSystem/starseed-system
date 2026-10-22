import { describe, it, expect } from "vitest";
import {
  buscarNotas,
  crearNota,
  leerNota,
  ErrorTrilium,
  TOPE_CONTENIDO,
  type Pedir,
  type RespuestaEtapi,
} from "../trilium";

const TOKEN = "secreto-etapi-123";
const BASE = "http://trilium:8080/etapi";

function responder(cuerpo: string, ok = true, status = 200): RespuestaEtapi {
  return { ok, status, text: async () => cuerpo };
}

function espia(respuesta: RespuestaEtapi) {
  const llamadas: { url: string; init: Parameters<Pedir>[1] }[] = [];
  const pedir: Pedir = async (url, init) => {
    llamadas.push({ url, init });
    return respuesta;
  };
  return { pedir, llamadas };
}

describe("trilium · ETAPI puro", () => {
  it("busca notas y devuelve id y título, sin doblar /etapi", async () => {
    const { pedir, llamadas } = espia(
      responder(
        JSON.stringify([
          { noteId: "n1", title: "Perfil de Alex" },
          { noteId: "n2", title: "Grupo RLB" },
        ]),
      ),
    );
    const notas = await buscarNotas(`${BASE}/`, TOKEN, "perfil de alex", pedir, 1);
    expect(notas).toEqual([{ id: "n1", titulo: "Perfil de Alex" }]);
    expect(llamadas[0].url).toBe(`${BASE}/notes?search=perfil%20de%20alex`);
    expect(llamadas[0].init.headers.Authorization).toBe(TOKEN);
    expect(llamadas[0].url).not.toContain(TOKEN);
  });

  it("añade /etapi cuando la base es solo el servidor", async () => {
    const { pedir, llamadas } = espia(responder("[]"));
    await buscarNotas("http://trilium:8080", TOKEN, "nota", pedir);
    expect(llamadas[0].url).toBe("http://trilium:8080/etapi/notes?search=nota");
  });

  it("lee texto y corta a 64 KB marcándolo truncado", async () => {
    const grande = "a".repeat(TOPE_CONTENIDO + 500);
    const { pedir, llamadas } = espia(responder(grande));
    const leida = await leerNota(BASE, TOKEN, "n1", pedir);
    expect(llamadas[0].url).toBe(`${BASE}/notes/n1/content`);
    expect(leida.truncado).toBe(true);
    expect(new TextEncoder().encode(leida.contenido).length).toBe(TOPE_CONTENIDO);
  });

  it("deja intacto el texto que cabe en el tope", async () => {
    const { pedir } = espia(responder("Nota breve con acentos: ñandú."));
    const leida = await leerNota(BASE, TOKEN, "n3", pedir);
    expect(leida).toEqual({ id: "n3", contenido: "Nota breve con acentos: ñandú.", truncado: false });
  });

  it("el error no filtra el token", async () => {
    const { pedir } = espia(responder(`Token inválido: ${TOKEN}`, false, 401));
    let capturado: unknown = null;
    try {
      await buscarNotas(BASE, TOKEN, "x", pedir);
    } catch (error) {
      capturado = error;
    }
    expect(capturado).toBeInstanceOf(ErrorTrilium);
    const mensaje = (capturado as Error).message;
    expect(mensaje).toContain("401");
    expect(mensaje).toContain("«oculto»");
    expect(mensaje).not.toContain(TOKEN);
  });

  it("crea una nota con el tipo text por defecto", async () => {
    const { pedir, llamadas } = espia(
      responder(JSON.stringify({ note: { noteId: "n9", title: "Diario" } })),
    );
    const creada = await crearNota(BASE, TOKEN, "padre1", "Diario", "Hoy llueve", pedir);
    expect(creada).toEqual({ id: "n9", titulo: "Diario" });
    expect(llamadas[0].url).toBe(`${BASE}/create-note`);
    expect(llamadas[0].init.method).toBe("POST");
    const cuerpo = JSON.parse(llamadas[0].init.body ?? "{}") as Record<string, unknown>;
    expect(cuerpo).toEqual({
      parentNoteId: "padre1",
      title: "Diario",
      type: "text",
      content: "Hoy llueve",
    });
  });
});
