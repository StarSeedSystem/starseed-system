import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContextoProto } from "../contrato";

// Todo lo que `edicion.ts` carga a demanda se simula: la prueba comprueba QUÉ se llama y con qué, no el OS entero.
const m = vi.hoisted(() => ({
  currentUserRef: vi.fn(),
  libraryRef: vi.fn((kind: string, id: string) => ({ kind, id })),
  listLibrary: vi.fn(),
  replicateItem: vi.fn(),
  updateItemContent: vi.fn(),
  suggestChange: vi.fn(),
  sendMessage: vi.fn(),
  getCanvas: vi.fn(),
  saveCanvas: vi.fn(),
  controladorActivo: vi.fn(),
  candidatosDe: vi.fn(),
}));

vi.mock("@/lib/sync/entity-state", () => ({ currentUserRef: m.currentUserRef }));
vi.mock("@/lib/library/entity-library", () => ({ libraryRef: m.libraryRef, listLibrary: m.listLibrary, replicateItem: m.replicateItem, updateItemContent: m.updateItemContent }));
vi.mock("@/lib/posts/post-entity", () => ({ suggestChange: m.suggestChange }));
vi.mock("@/lib/messages/dm", () => ({ sendMessage: m.sendMessage }));
vi.mock("@/lib/canvas/canvas", () => ({
  getCanvas: m.getCanvas,
  saveCanvas: m.saveCanvas,
  defaultBlock: (kind: string, i: number) => ({ id: `b${i}`, kind, x: 0, y: 0, w: 1, h: 1, data: {}, title: kind }),
}));
vi.mock("../../controlador-activo", () => ({ controladorActivo: m.controladorActivo }));
vi.mock("../../registro-atomos", () => ({ candidatosDe: m.candidatosDe }));

import { MAX_TEXTO_REESCRITO, bloqueDeMoleculaActiva, editarEntidad, insertarEn, textoReescritoValido } from "../edicion";

const CTX: ContextoProto = { ruta: "/library", ambito: "personal" };
const ARCHIVO = { tipo: "archivo", id: "f1", nombre: "Acta" } as const;
const editar = (objetivo: { tipo: string; id: string; nombre?: string }, modo: "rama" | "directo", cambio = "traduce al inglés") =>
  ({ tipo: "editar-entidad", objetivo, cambio, modo }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  m.currentUserRef.mockResolvedValue({ id: "u1" });
  m.listLibrary.mockResolvedValue({ items: [{ id: "f1", title: "Acta", content: "Hola mundo" }] });
  m.replicateItem.mockResolvedValue({ ok: true, id: "f1-rama" });
  m.updateItemContent.mockResolvedValue({ ok: true });
  m.suggestChange.mockResolvedValue({ text: "x" });
  m.sendMessage.mockResolvedValue({ id: "msg1" });
  m.getCanvas.mockResolvedValue({ id: "c1", owner: "u1", scope: "personal", scope_ref: null, title: "Mi pizarra", blocks: [], shared: false });
  m.saveCanvas.mockImplementation(async (c: { id: string }) => c);
  m.controladorActivo.mockReturnValue(null);
});

describe("textoReescritoValido · lo que devuelve una IA solo entra si es razonable", () => {
  it("acepta un texto normal y normaliza saltos de línea", () => {
    expect(textoReescritoValido("  Hello world \r\n", "Hola mundo")).toBe("Hello world");
  });
  it("rechaza lo vacío, lo que no es texto, lo enorme y lo que lleva marcas de código", () => {
    expect(textoReescritoValido(null, "x")).toBeNull();
    expect(textoReescritoValido("   ", "x")).toBeNull();
    expect(textoReescritoValido("a".repeat(MAX_TEXTO_REESCRITO + 1), "a".repeat(MAX_TEXTO_REESCRITO))).toBeNull();
    expect(textoReescritoValido("a".repeat(500), "corto")).toBeNull();
    expect(textoReescritoValido("Hola <script>alert(1)</script>", "Hola mundo")).toBeNull();
    expect(textoReescritoValido("javascript:alert(1)", "Hola mundo")).toBeNull();
  });
});

describe("editarEntidad · archivo de la Biblioteca", () => {
  it("en rama con IA: replica el original (cita), guarda el texto reescrito en la rama y no toca el original", async () => {
    const reescribir = vi.fn(async () => "Hello world");
    const r = await editarEntidad(editar(ARCHIVO, "rama"), CTX, { reescribir });
    expect(r.estado).toBe("hecho");
    expect(r.texto).toMatch(/rama de «Acta» con el cambio aplicado; el original no se tocó/);
    expect(r.ruta).toBe("/library");
    expect(m.replicateItem).toHaveBeenCalledWith({ kind: "user", id: "u1" }, "f1");
    expect(m.updateItemContent).toHaveBeenCalledTimes(1);
    expect(m.updateItemContent).toHaveBeenCalledWith({ kind: "user", id: "u1" }, "f1-rama", { content: "Hello world", note: expect.stringContaining("traduce al inglés") }, expect.any(Object));
    expect(r.pendiente).toBeUndefined();
  });

  it("en rama sin IA: la rama lleva el cambio como nota y se dice que no se reescribió (no se finge)", async () => {
    const r = await editarEntidad(editar(ARCHIVO, "rama"), CTX, {});
    expect(r.estado).toBe("hecho");
    expect(r.texto).toMatch(/dejé anotado el cambio pedido/);
    expect(r.pendiente).toMatch(/no se reescribió/);
    expect(m.updateItemContent.mock.calls[0][2]).toEqual({ note: expect.any(String) });
  });

  it("una reescritura con código se descarta: la rama queda solo con la nota", async () => {
    const r = await editarEntidad(editar(ARCHIVO, "rama"), CTX, { reescribir: async () => "<script>robar()</script>" });
    expect(r.estado).toBe("hecho");
    expect(m.updateItemContent.mock.calls[0][2]).not.toHaveProperty("content");
    expect(r.pendiente).toBeDefined();
  });

  it("directo con IA: nueva versión con historial", async () => {
    const r = await editarEntidad(editar(ARCHIVO, "directo"), CTX, { reescribir: async () => "Hello world" });
    expect(r.estado).toBe("hecho");
    expect(m.replicateItem).not.toHaveBeenCalled();
    expect(m.updateItemContent).toHaveBeenCalledWith({ kind: "user", id: "u1" }, "f1", { content: "Hello world" }, expect.any(Object));
    expect(r.texto).toMatch(/historial/);
  });

  it("directo sin una reescritura válida: NO toca nada y sugiere la rama", async () => {
    const r = await editarEntidad(editar(ARCHIVO, "directo"), CTX, {});
    expect(r.estado).toBe("pendiente");
    expect(r.texto).toMatch(/en una rama/);
    expect(m.updateItemContent).not.toHaveBeenCalled();
    expect(m.replicateItem).not.toHaveBeenCalled();
  });

  it("sin sesión no se edita nada", async () => {
    m.currentUserRef.mockResolvedValue(null);
    const r = await editarEntidad(editar(ARCHIVO, "rama"), CTX, {});
    expect(r.estado).toBe("pendiente");
    expect(r.texto).toMatch(/sesión iniciada/);
    expect(m.replicateItem).not.toHaveBeenCalled();
  });

  it("un archivo que no es de tu Biblioteca (un documento, una tabla) se dice honestamente", async () => {
    const r = await editarEntidad(editar({ tipo: "archivo", id: "otro" }, "rama"), CTX, {});
    expect(r.estado).toBe("pendiente");
    expect(r.texto).toMatch(/no es un archivo de tu Biblioteca/);
  });

  it("si la Biblioteca falla al crear la rama, es un fallo y no se guarda nada", async () => {
    m.replicateItem.mockResolvedValue({ ok: false, id: "" });
    const r = await editarEntidad(editar(ARCHIVO, "rama"), CTX, {});
    expect(r.estado).toBe("fallo");
    expect(m.updateItemContent).not.toHaveBeenCalled();
  });

  it("si la reescritura lanza, la rama se hace igual con la nota", async () => {
    const r = await editarEntidad(editar(ARCHIVO, "rama"), CTX, { reescribir: async () => { throw new Error("IA caída"); } });
    expect(r.estado).toBe("hecho");
    expect(r.pendiente).toBeDefined();
  });
});

describe("editarEntidad · publicaciones y el resto", () => {
  it("publicación en rama = sugerencia al autor; el original no se toca", async () => {
    const r = await editarEntidad(editar({ tipo: "publicacion", id: "p 1", nombre: "Mi texto" }, "rama", "corrige la ortografía"), CTX);
    expect(m.suggestChange).toHaveBeenCalledWith("p 1", "corrige la ortografía");
    expect(r.estado).toBe("hecho");
    expect(r.ruta).toBe("/post/p%201");
  });

  it("publicación directa: sin camino, no se toca", async () => {
    const r = await editarEntidad(editar({ tipo: "publicacion", id: "p1" }, "directo"), CTX);
    expect(r.estado).toBe("pendiente");
    expect(m.suggestChange).not.toHaveBeenCalled();
  });

  it("si la sugerencia no se pudo guardar, es un fallo", async () => {
    m.suggestChange.mockRejectedValue(new Error("RLS"));
    expect((await editarEntidad(editar({ tipo: "publicacion", id: "p1" }, "rama"), CTX)).estado).toBe("fallo");
    m.suggestChange.mockResolvedValue({ text: "" });
    expect((await editarEntidad(editar({ tipo: "publicacion", id: "p1" }, "rama"), CTX)).estado).toBe("fallo");
  });

  it.each(["mensaje", "molecula", "pizarra", "grupo", "perfil", "comunidad"] as const)("%s: pendiente con su motivo, nada se escribe", async (tipo) => {
    const r = await editarEntidad(editar({ tipo, id: "x1" }, "directo"), CTX);
    expect(r.estado).toBe("pendiente");
    expect(r.texto.length).toBeGreaterThan(20);
    expect(m.updateItemContent).not.toHaveBeenCalled();
    expect(m.suggestChange).not.toHaveBeenCalled();
    expect(m.saveCanvas).not.toHaveBeenCalled();
    expect(m.sendMessage).not.toHaveBeenCalled();
  });
});

describe("insertarEn · mensajes con la molécula activa", () => {
  const molecula = {
    titulo: "Mi molécula",
    atomos: [{ id: "a1", herramientaId: "ecualizador", titulo: "EQ" }, { id: "a2", herramientaId: "pulso-cardiaco" }],
    valores: { "a1::brillo": 0.7, "a1::pulso": 72, "a2::ritmo": 90, "a1::texto": "hola" } as Record<string, unknown>,
  };
  const activo = () => m.controladorActivo.mockReturnValue({ obtener: () => ({ molecula, historial: { hechos: [{ operacion: { objetivo: { atomoId: "a2", parametroId: "ritmo" }, fuente: "wearable:pulso" } }], rehacer: [] }, pendientes: [] }) });
  const candidatos = () => m.candidatosDe.mockReturnValue([
    { ref: { atomoId: "a1", parametroId: "brillo" }, parametro: { id: "brillo", nombre: "Brillo", tipo: "numero" } },
    { ref: { atomoId: "a1", parametroId: "pulso" }, parametro: { id: "pulso", nombre: "Pulso", tipo: "numero" } },
    { ref: { atomoId: "a2", parametroId: "ritmo" }, parametro: { id: "ritmo", nombre: "Ritmo", tipo: "numero" } },
    { ref: { atomoId: "a1", parametroId: "texto" }, parametro: { id: "texto", nombre: "Texto", tipo: "texto" } },
  ]);

  it("sin molécula abierta: pendiente y no se envía nada", async () => {
    const r = await insertarEn({ tipo: "insertar-en", destino: { tipo: "mensaje", id: "hilo1" }, que: "mira esto" }, CTX);
    expect(r.estado).toBe("pendiente");
    expect(m.sendMessage).not.toHaveBeenCalled();
  });

  it("con molécula: el bloque lleva átomos y valores, SIN datos de salud (ni por nombre ni por wearable)", async () => {
    activo(); candidatos();
    const b = await bloqueDeMoleculaActiva();
    expect(b?.titulo).toBe("Mi molécula");
    const json = JSON.parse(b!.fence.replace(/^```protomolecula\n/, "").replace(/\n```$/, ""));
    expect(json.titulo).toBe("Mi molécula");
    expect(json.atomos).toEqual([{ herramienta: "ecualizador", titulo: "EQ" }, { herramienta: "pulso-cardiaco", titulo: "pulso-cardiaco" }]);
    expect(json.valores).toEqual([{ atomo: 0, parametro: "brillo", valor: 0.7 }, { atomo: 0, parametro: "texto", valor: "hola" }]);
    expect(b!.fence).not.toContain("72");
    expect(b!.fence).not.toContain("90");
  });

  it("envía el mensaje al hilo con el texto y el bloque", async () => {
    activo(); candidatos();
    const r = await insertarEn({ tipo: "insertar-en", destino: { tipo: "mensaje", id: "hilo1", nombre: "Equipo" }, que: "mira esto" }, CTX);
    expect(r.estado).toBe("hecho");
    expect(r.ruta).toBe("/messages");
    expect(m.sendMessage).toHaveBeenCalledTimes(1);
    const [hilo, entrada] = m.sendMessage.mock.calls[0];
    expect(hilo).toBe("hilo1");
    expect(entrada.body).toMatch(/^mira esto\n\n```protomolecula\n/);
    expect(entrada.body.length).toBeLessThanOrEqual(4000);
  });

  it("si el envío falla (sin sesión, no eres miembro), es un fallo", async () => {
    activo(); candidatos();
    m.sendMessage.mockResolvedValue(null);
    const r = await insertarEn({ tipo: "insertar-en", destino: { tipo: "mensaje", id: "hilo1" }, que: "x" }, CTX);
    expect(r.estado).toBe("fallo");
  });
});

describe("insertarEn · pizarra y el resto", () => {
  const dest = { tipo: "pizarra", id: "c1", nombre: "Mi pizarra" } as const;

  it("en una pizarra propia añade un bloque de texto con la nota", async () => {
    const r = await insertarEn({ tipo: "insertar-en", destino: dest, que: "Idea nueva" }, CTX);
    expect(r.estado).toBe("hecho");
    expect(r.ruta).toBe("/pizarra?canvas=c1");
    const guardado = m.saveCanvas.mock.calls[0][0];
    expect(guardado.blocks).toHaveLength(1);
    expect(guardado.blocks[0]).toMatchObject({ kind: "text", data: { text: "Idea nueva" } });
  });

  it("una pizarra ajena no se toca", async () => {
    m.getCanvas.mockResolvedValue({ id: "c1", owner: "otra-persona", blocks: [] });
    const r = await insertarEn({ tipo: "insertar-en", destino: dest, que: "Idea" }, CTX);
    expect(r.estado).toBe("pendiente");
    expect(r.texto).toMatch(/no es tuya/);
    expect(m.saveCanvas).not.toHaveBeenCalled();
  });

  it("sin sesión o sin pizarra: pendiente", async () => {
    m.currentUserRef.mockResolvedValue(null);
    expect((await insertarEn({ tipo: "insertar-en", destino: dest, que: "x" }, CTX)).estado).toBe("pendiente");
    m.currentUserRef.mockResolvedValue({ id: "u1" });
    m.getCanvas.mockResolvedValue(null);
    expect((await insertarEn({ tipo: "insertar-en", destino: dest, que: "x" }, CTX)).estado).toBe("pendiente");
    expect(m.saveCanvas).not.toHaveBeenCalled();
  });

  it("si no se pudo guardar, es un fallo", async () => {
    m.saveCanvas.mockResolvedValue(null);
    expect((await insertarEn({ tipo: "insertar-en", destino: dest, que: "x" }, CTX)).estado).toBe("fallo");
  });

  it("publicaciones y otros destinos: pendiente con su motivo", async () => {
    for (const tipo of ["publicacion", "grupo", "archivo"] as const) {
      const r = await insertarEn({ tipo: "insertar-en", destino: { tipo, id: "x1" }, que: "algo" }, CTX);
      expect(r.estado).toBe("pendiente");
    }
    expect(m.saveCanvas).not.toHaveBeenCalled();
    expect(m.sendMessage).not.toHaveBeenCalled();
  });
});
