import { describe, expect, it } from "vitest";
import { ErrorOpenHands, crearConversacion, ejecutar, enviarMensaje, eventos, pausar, politicaConfirmacion, salud, type FetchLike } from "@/lib/agentes/openhands-servidor";

const BASE = "http://127.0.0.1:8010/";
const ID = "8a1f6c62-0f51-4a8e-9e4f-1f3f0f0d2b11";

interface Llamada { url: string; init?: RequestInit }
interface Cuerpo { agent: { llm: Record<string, unknown>; tools?: unknown }; workspace: unknown; confirmation_policy: unknown; initial_message?: { content: Array<{ text: string }> } }

const json = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });

function servidor(responder: (url: string) => Response | Promise<Response>) {
  const llamadas: Llamada[] = [];
  const f: FetchLike = async (url, init) => { llamadas.push({ url, init }); return responder(url); };
  return { llamadas, cfg: { baseUrl: BASE, fetch: f, timeoutMs: 50 } };
}

describe("cliente del Agent Server de OpenHands", () => {
  it("salud consulta GET /health con redirección manual", async () => {
    const { llamadas, cfg } = servidor(() => json("OK"));
    await expect(salud(cfg)).resolves.toBe("OK");
    expect(llamadas[0].url).toBe(`${BASE}health`);
    expect(llamadas[0].init?.method).toBeUndefined();
    expect(llamadas[0].init?.redirect).toBe("manual");
  });
  it("crearConversacion arma el esquema real y pide permiso por defecto", async () => {
    const { llamadas, cfg } = servidor(() => json({ id: ID }));
    const r = await crearConversacion(cfg, {
      modelo: "openrouter/qwen", apiKey: "clave-secreta", baseUrlModelo: "https://llm.local/v1",
      directorioTrabajo: "/workspace/proyecto", mensajeInicial: "Hola",
      herramientas: [{ name: "TerminalTool" }],
    });
    expect(r.id).toBe(ID);
    expect(llamadas[0].url).toBe(`${BASE}api/conversations`);
    expect(llamadas[0].init?.method).toBe("POST");
    const b = JSON.parse(String(llamadas[0].init?.body)) as Cuerpo;
    expect(b.agent.llm).toEqual({
      model: "openrouter/qwen", api_key: "clave-secreta", base_url: "https://llm.local/v1",
    });
    expect(b.agent.tools).toEqual([{ name: "TerminalTool", params: {} }]);
    expect(b.workspace).toEqual({ kind: "LocalWorkspace", working_dir: "/workspace/proyecto" });
    expect(b.confirmation_policy).toEqual({ kind: "AlwaysConfirm" });
    expect(b.initial_message?.content[0].text).toBe("Hola");
  });
  it("crearConversacion respeta otra política y no inventa mensaje ni herramientas", async () => {
    const { llamadas, cfg } = servidor(() => json({ id: ID }));
    await crearConversacion(cfg, {
      modelo: "m", apiKey: "k", directorioTrabajo: "/w", politicaConfirmacion: "NeverConfirm",
    });
    const b = JSON.parse(String(llamadas[0].init?.body)) as Cuerpo;
    expect(b.confirmation_policy).toEqual({ kind: "NeverConfirm" });
    expect(b.initial_message).toBeUndefined();
    expect(b.agent.tools).toBeUndefined();
  });
  it("enviarMensaje usa el esquema de mensaje y no ejecuta solo", async () => {
    const { llamadas, cfg } = servidor(() => json({ kind: "MessageEvent" }));
    const r = await enviarMensaje(cfg, ID, "hola mundo");
    expect(r.kind).toBe("MessageEvent");
    expect(llamadas[0].url).toBe(`${BASE}api/conversations/${ID}/events`);
    expect(JSON.parse(String(llamadas[0].init?.body))).toEqual({
      role: "user", content: [{ type: "text", text: "hola mundo" }], run: false,
    });
  });
  it("ejecutar y pausar llaman a sus rutas sin cuerpo", async () => {
    const { llamadas, cfg } = servidor(() => json({ success: true }));
    await expect(ejecutar(cfg, ID)).resolves.toEqual({ success: true });
    await expect(pausar(cfg, ID)).resolves.toEqual({ success: true });
    expect(llamadas.map((l) => l.url)).toEqual([
      `${BASE}api/conversations/${ID}/run`,
      `${BASE}api/conversations/${ID}/pause`,
    ]);
    expect(llamadas.every((l) => l.init?.method === "POST")).toBe(true);
  });
  it("eventos filtra por timestamp desde un punto", async () => {
    const { llamadas, cfg } = servidor(() => json({ items: [{ kind: "PauseEvent" }], next_page_id: "p2" }));
    const pagina = await eventos(cfg, ID, "2026-10-20T12:00:00Z");
    expect(pagina.next_page_id).toBe("p2");
    expect(llamadas[0].url).toBe(`${BASE}api/conversations/${ID}/events/search?timestamp__gte=2026-10-20T12%3A00%3A00Z`);
    const sinPagina = servidor(() => json({ items: [] }));
    await eventos(sinPagina.cfg, ID);
    expect(sinPagina.llamadas[0].url).toBe(`${BASE}api/conversations/${ID}/events/search`);
  });
  it("politicaConfirmacion envía el discriminante del esquema", async () => {
    const { llamadas, cfg } = servidor(() => json({ success: true }));
    await politicaConfirmacion(cfg, ID, "ConfirmRisky");
    expect(llamadas[0].url).toBe(`${BASE}api/conversations/${ID}/confirmation_policy`);
    expect(JSON.parse(String(llamadas[0].init?.body))).toEqual({ policy: { kind: "ConfirmRisky" } });
  });
  it("un estado no 2xx es un error sin copiar el cuerpo con la clave", async () => {
    const { cfg } = servidor(() => json({ detalle: "api_key=clave-secreta" }, 500));
    const error = await crearConversacion(cfg, { modelo: "m", apiKey: "clave-secreta", directorioTrabajo: "/w" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorOpenHands);
    const fallo = error as ErrorOpenHands;
    expect(fallo.status).toBe(500);
    expect(fallo.message).toContain("500");
    expect(fallo.message).not.toContain("clave-secreta");
  });
  it("si no se puede conectar lo dice y conserva la causa", async () => {
    const causa = new Error("ECONNREFUSED");
    const cfg = { baseUrl: BASE, fetch: (async () => { throw causa; }) as FetchLike };
    const error = await salud(cfg).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorOpenHands);
    expect((error as ErrorOpenHands).message).toBe("no se pudo conectar con el Agent Server");
    expect((error as ErrorOpenHands).causa).toBe(causa);
  });
  it("corta por tiempo cuando el servidor no responde", async () => {
    const lento: FetchLike = (_url, init) =>
      new Promise((_ok, falla) => init?.signal?.addEventListener("abort", () => falla(new Error("abortado"))));
    const error = await salud({ baseUrl: BASE, fetch: lento, timeoutMs: 5 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorOpenHands);
    expect((error as ErrorOpenHands).message).toBe("sin respuesta en 5 ms");
  });
});
