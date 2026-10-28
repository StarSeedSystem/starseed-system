import { describe, expect, it } from "vitest";
import {
  ErrorOpenHands, crearConversacion, enviarMensaje, eventos, ejecutar, pausar,
  politicaConfirmacion, salud, type FetchLike, type OpcionesOpenHands,
} from "@/lib/agentes/openhands-servidor";

const BASE = "http://127.0.0.1:8010/";
const SECRETO = "clave-de-prueba-123";

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });
}

function capturar(respuesta: (url: string, init?: RequestInit) => Response | Promise<Response> = () => json({ success: true })) {
  const llamadas: Array<{ url: string; init?: RequestInit }> = [];
  const f: FetchLike = async (url, init) => { llamadas.push({ url, init }); return respuesta(url, init); };
  return { f, llamadas };
}

function op(f: FetchLike, extra: Partial<OpcionesOpenHands> = {}): OpcionesOpenHands {
  return { baseUrl: BASE, fetch: f, ...extra };
}

function cuerpo(init?: RequestInit): Record<string, unknown> {
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

async function fallo(promesa: Promise<unknown>): Promise<ErrorOpenHands> {
  try {
    await promesa;
  } catch (e) {
    return e as ErrorOpenHands;
  }
  throw new Error("Se esperaba un fallo y no lo hubo.");
}

describe("cliente del Agent Server de OpenHands", () => {
  it("salud: GET /health, sin barra final y sin seguir redirecciones", async () => {
    const { f, llamadas } = capturar(() => json("ok"));
    await expect(salud(op(f))).resolves.toEqual({ sano: true, estado: "ok" });
    expect(llamadas[0].url).toBe("http://127.0.0.1:8010/health");
    expect(llamadas[0].init?.method).toBe("GET");
    expect(llamadas[0].init?.redirect).toBe("manual");
  });

  it("salud: acepta el estado como texto plano, sin exigir JSON", async () => {
    const { f } = capturar(() => new Response("OK", { status: 200 }));
    await expect(salud(op(f))).resolves.toEqual({ sano: true, estado: "OK" });
  });

  it("salud: acepta cuerpo vacío como sano con estado «ok»", async () => {
    const { f } = capturar(() => new Response(null, { status: 200 }));
    await expect(salud(op(f))).resolves.toEqual({ sano: true, estado: "ok" });
  });

  it("crearConversacion: esquema StartConversationRequest y aprobación por defecto", async () => {
    const { f, llamadas } = capturar(() => json({ id: "c-1" }));
    const c = await crearConversacion({
      ...op(f), modelo: "openai/gpt", apiKey: SECRETO, directorioTrabajo: "/workspace",
      mensajeInicial: "hola", herramientas: [{ nombre: "TerminalTool" }],
    });
    expect(c.id).toBe("c-1");
    expect(llamadas[0].url).toBe("http://127.0.0.1:8010/api/conversations");
    expect(cuerpo(llamadas[0].init)).toEqual({
      agent: { kind: "Agent", llm: { model: "openai/gpt", api_key: SECRETO }, tools: [{ name: "TerminalTool" }] },
      workspace: { kind: "LocalWorkspace", working_dir: "/workspace" },
      confirmation_policy: { kind: "AlwaysConfirm" },
      initial_message: { role: "user", content: [{ type: "text", text: "hola" }] },
    });
  });

  it("sin clave de modelo no manda api_key y permite otra política", async () => {
    const { f, llamadas } = capturar(() => json({ id: "c-2" }));
    await crearConversacion({ ...op(f), modelo: "m", directorioTrabajo: "/w", politica: "ConfirmRisky" });
    const b = cuerpo(llamadas[0].init) as { agent: { llm: Record<string, unknown> }; confirmation_policy: { kind: string } };
    expect(b.agent.llm).toEqual({ model: "m" });
    expect(b.confirmation_policy.kind).toBe("ConfirmRisky");
  });

  it("crearConversacion: herramientas con parámetros y sin mensaje inicial", async () => {
    const { f, llamadas } = capturar(() => json({ id: "c-3" }));
    await crearConversacion({
      ...op(f), modelo: "m", directorioTrabajo: "/w",
      herramientas: [{ nombre: "FileEditorTool", parametros: { nivel: 2 } }],
    });
    expect(cuerpo(llamadas[0].init)).toEqual({
      agent: { kind: "Agent", llm: { model: "m" }, tools: [{ name: "FileEditorTool", params: { nivel: 2 } }] },
      workspace: { kind: "LocalWorkspace", working_dir: "/w" },
      confirmation_policy: { kind: "AlwaysConfirm" },
    });
  });

  it("enviarMensaje: success false se refleja en ok", async () => {
    const { f } = capturar(() => json({ success: false }));
    await expect(enviarMensaje("c1", "hola", op(f))).resolves.toEqual({ ok: false });
  });

  it("enviarMensaje, ejecutar, pausar y política usan sus rutas y cuerpos", async () => {
    const { f, llamadas } = capturar(() => json({ success: true }));
    const o = op(f);
    await enviarMensaje("c 1", "hola", o);
    await ejecutar("c 1", o);
    await pausar("c 1", o);
    await politicaConfirmacion("c 1", "NeverConfirm", o);
    expect(llamadas.map((l) => new URL(l.url).pathname)).toEqual([
      "/api/conversations/c%201/events", "/api/conversations/c%201/run",
      "/api/conversations/c%201/pause", "/api/conversations/c%201/confirmation_policy",
    ]);
    expect(llamadas[1].init?.method).toBe("POST");
    expect(llamadas[2].init?.method).toBe("POST");
    expect(cuerpo(llamadas[0].init)).toEqual({ role: "user", content: [{ type: "text", text: "hola" }] });
    expect(cuerpo(llamadas[3].init)).toEqual({ policy: { kind: "NeverConfirm" } });
  });

  it("eventos: pagina por next_page_id y devuelve la página tal cual", async () => {
    const { f, llamadas } = capturar(() => json({ items: [{ kind: "MessageEvent", id: "e1" }], next_page_id: "p2" }));
    const p = await eventos("c1", op(f), "p1");
    expect(new URL(llamadas[0].url).searchParams.get("page_id")).toBe("p1");
    expect(p.items[0].kind).toBe("MessageEvent");
    expect(p.next_page_id).toBe("p2");
  });

  it("eventos sin cursor no inventa parámetros", async () => {
    const { f, llamadas } = capturar(() => json({ items: [], next_page_id: null }));
    await eventos("c1", op(f));
    expect(new URL(llamadas[0].url).search).toBe("");
  });

  it("errores: HTTP, redirección, red, tiempo y respuesta sin JSON; la clave nunca sale", async () => {
    const conClave = capturar(() => json({ detail: `fallo ${SECRETO}` }, 500)).f;
    const http = await fallo(crearConversacion({ ...op(conClave), modelo: "m", apiKey: SECRETO, directorioTrabajo: "/w" }));
    expect(http).toBeInstanceOf(ErrorOpenHands);
    expect(http).toMatchObject({ fallo: "http", estado: 500 });
    expect(http.message).not.toContain(SECRETO);
    expect(http.message).toContain("•••");

    const redir = await fallo(salud(op(capturar(() => new Response("", { status: 302, headers: { location: "http://otro" } })).f)));
    expect(redir).toMatchObject({ fallo: "http", estado: 302 });
    expect(redir.message).toMatch(/redirigir/);

    const red = await fallo(salud(op(async () => { throw new Error("sin red"); })));
    expect(red).toMatchObject({ fallo: "red" });

    const lento: FetchLike = () => new Promise<Response>(() => undefined);
    const tiempo = await fallo(salud(op(lento, { tiempoMs: 5 })));
    expect(tiempo).toMatchObject({ fallo: "tiempo" });

    const roto = await fallo(eventos("c1", op(capturar(() => new Response("no-json", { status: 200 })).f)));
    expect(roto).toMatchObject({ fallo: "respuesta" });
  });
});

