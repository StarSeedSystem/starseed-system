// @vitest-environment jsdom
/**
 * La marca «Bot de IA» recorre las capas de datos del OS (Ola 1025U · U3): lo que escribe un agente en
 * `os_post_comments`, en la tabla `posts` del Lienzo y en el feed de la Red se lee de vuelta como bot; lo de las
 * personas no cambia.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { crearAgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";
import { marcaDeAgente, marcarComoBot } from "../marca-bot";

const AGENTE = crearAgenteMundoRef({ origen: "bot", idOrigen: "guardian", nombre: "Guardián", dueno: { tipo: "grupo", id: "huerto" } });
const MARCA = marcaDeAgente(AGENTE);

/* ── Un Supabase de mentira que apunta lo que se inserta y devuelve filas preparadas ── */
const estado = vi.hoisted(() => ({
  insertado: [] as Array<{ tabla: string; fila: Record<string, unknown> }>,
  filas: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/utils/supabase/client", () => {
  const consulta = (tabla: string): Record<string, unknown> => {
    const q: Record<string, unknown> = {};
    const devolver = () => q;
    for (const m of ["select", "neq", "eq", "order", "in", "is", "or", "range", "gte", "lt"]) q[m] = devolver;
    q.insert = (fila: Record<string, unknown>) => {
      estado.insertado.push({ tabla, fila });
      const creada = { id: "nuevo-1", created_at: "2026-10-26T10:00:00Z", ...fila };
      const r: Record<string, unknown> = {};
      r.select = () => r;
      r.single = async () => ({ data: creada, error: null });
      r.maybeSingle = async () => ({ data: creada, error: null });
      return r;
    };
    q.limit = async () => ({ data: estado.filas, error: null, status: 200 });
    q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: estado.filas, error: null, status: 200 }).then(ok);
    return q;
  };
  return {
    createClient: () => ({
      from: (tabla: string) => consulta(tabla),
      auth: { getSession: async () => ({ data: { session: { user: { id: "uid-persona" } } } }), getUser: async () => ({ data: { user: { id: "uid-persona" } } }) },
      channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
      removeChannel: () => undefined,
    }),
  };
});

beforeEach(() => {
  estado.insertado.length = 0;
  estado.filas = [];
  localStorage.clear();
  vi.stubGlobal("fetch", async () => ({ ok: false, json: async () => ({}) }));
});

describe("comentarios del OS (os_post_comments)", () => {
  it("un comentario de un agente se guarda marcado y vuelve como bot con el texto limpio", async () => {
    const { addComment } = await import("@/lib/os-social");
    const r = await addComment("post-1", "Buen trabajo", "Guardián", MARCA);
    expect(r.ok).toBe(true);
    const guardado = estado.insertado.find((i) => i.tabla === "os_post_comments")!.fila;
    expect(String(guardado.body)).toContain("<!--ss:meta");
    expect(r.comment?.bot).toMatchObject({ agenteId: "bot:guardian", dueno: { tipo: "grupo", id: "huerto" } });
    expect(r.comment?.body).toBe("Buen trabajo");
    // el autor sigue siendo la cuenta de la persona: el bloqueo usa la marca, no ese id
    expect(guardado.author_id).toBe("uid-persona");
  });

  it("un comentario de una persona se guarda tal cual y no trae marca", async () => {
    const { addComment } = await import("@/lib/os-social");
    const r = await addComment("post-1", "Gracias", "Ana");
    expect(estado.insertado.find((i) => i.tabla === "os_post_comments")!.fila.body).toBe("Gracias");
    expect(r.comment?.bot).toBeUndefined();
  });

  it("fetchComments lee las dos clases de fila, también las antiguas sin marca", async () => {
    const { fetchComments } = await import("@/lib/os-social");
    estado.filas = [
      { id: "c1", post_id: "p", author_id: "u", author_name: "Ana", body: "Hola", created_at: "2026-10-26T09:00:00Z" },
      { id: "c2", post_id: "p", author_id: "u2", author_name: "Guardián", body: marcarComoBot("Riego hecho", AGENTE), created_at: "2026-10-26T09:05:00Z" },
    ];
    const lista = await fetchComments("p");
    expect(lista.map((c) => [c.body, c.bot?.agenteId ?? null])).toEqual([["Hola", null], ["Riego hecho", "bot:guardian"]]);
  });
});

describe("comentarios del Lienzo (tabla posts)", () => {
  it("la marca va en post_references.bot", async () => {
    const { addComment } = await import("@/lib/posts/post-entity");
    await addComment("post-1", "Bien", null, { bot: MARCA });
    const fila = estado.insertado.find((i) => i.tabla === "posts")!.fila;
    expect((fila.post_references as { bot?: { agenteId: string }; parent: string }).bot?.agenteId).toBe("bot:guardian");
    expect((fila.post_references as { parent: string }).parent).toBe("post-1");
  });

  it("sin bot, post_references queda exactamente como antes", async () => {
    const { addComment } = await import("@/lib/posts/post-entity");
    await addComment("post-1", "Bien", "c9");
    const fila = estado.insertado.find((i) => i.tabla === "posts")!.fila;
    expect(fila.post_references).toEqual({ parent: "post-1", parentComment: "c9" });
  });
});

describe("feed de la Red (tabla posts)", () => {
  it("una publicación con content.bot o post_references.bot sale con autor-bot; la de una persona, no", async () => {
    const { fetchNetworkFeed, enrichAuthors } = await import("@/lib/feed/network-feed");
    estado.filas = [
      { id: "a", author_id: "uid-persona", content: { text: "De una persona" }, post_references: {}, interactions: {}, created_at: "2026-10-26T08:00:00Z" },
      { id: "b", author_id: "uid-persona", content: { text: "De un bot", bot: MARCA }, post_references: {}, interactions: {}, created_at: "2026-10-26T08:01:00Z" },
      { id: "c", author_id: "uid-persona", content: { text: "Otro bot" }, post_references: { bot: MARCA }, interactions: {}, created_at: "2026-10-26T08:02:00Z" },
    ];
    const posts = await enrichAuthors(await fetchNetworkFeed());
    const porId = Object.fromEntries(posts.map((p) => [p.postId, p]));
    expect(porId.a.author.bot).toBeUndefined();
    expect(porId.a.author.name).toBe("Ciudadano StarSeed");
    expect(porId.b.author.bot?.agenteId).toBe("bot:guardian");
    expect(porId.b.author.name).toBe("Guardián");
    expect(porId.c.author.bot?.agenteId).toBe("bot:guardian");
  });

  it("el filtro de bloqueo quita al bot del feed y deja a la persona, aunque compartan cuenta", async () => {
    const { fetchNetworkFeed } = await import("@/lib/feed/network-feed");
    const { bloquearBot, filtrarPorBloqueo, leerReglas, _reiniciarCacheBloqueoParaPruebas } = await import("../bloqueo-bots");
    _reiniciarCacheBloqueoParaPruebas();
    estado.filas = [
      { id: "a", author_id: "uid-persona", content: { text: "De una persona" }, post_references: {}, interactions: {}, created_at: "2026-10-26T08:00:00Z" },
      { id: "b", author_id: "uid-persona", content: { text: "De un bot", bot: MARCA }, post_references: {}, interactions: {}, created_at: "2026-10-26T08:01:00Z" },
    ];
    const posts = await fetchNetworkFeed();
    bloquearBot(MARCA);
    expect(filtrarPorBloqueo(posts, leerReglas()).map((p) => p.postId)).toEqual(["a"]);
  });
});
