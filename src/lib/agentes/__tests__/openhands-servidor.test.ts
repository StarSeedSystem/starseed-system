import { describe, expect, it } from "vitest";
import {
  crearClienteOpenHands,
  origenOpenHands,
  POLITICA_POR_DEFECTO,
  type ConfiguracionConversacion,
} from "../openhands-servidor";

const BASE = "http://127.0.0.1:8010";

type Llamada = { url: string; init: RequestInit };

function fetchFalso(respuestas: Response[]): { fetch: typeof fetch; llamadas: Llamada[] } {
  const llamadas: Llamada[] = [];
  let i = 0;
  const f = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    llamadas.push({ url: String(input), init: init ?? {} });
    return respuestas[Math.min(i++, respuestas.length - 1)] ?? new Response("{}", { status: 200 });
  };
  return { fetch: f as unknown as typeof fetch, llamadas };
}

function fetchQueEspera(): typeof fetch {
  const f = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
    await new Promise<Response>((_, rechazar) => {
      init?.signal?.addEventListener("abort", () => rechazar(new Error("abortado")));
    });
  return f as unknown as typeof fetch;
}

const CONVERSACION: ConfiguracionConversacion = {
  llm: { model: "openai/gpt-4o-mini", apiKey: "sk-clave-secreta", usageId: "pruebas" },
  workingDir: "/tmp/trabajo",
  tools: ["TerminalTool", "FileEditorTool"],
};

describe("origenOpenHands", () => {
  it("acepta http(s) con puerto y sin ruta ni credenciales", () => {
    expect(origenOpenHands(BASE)).toBe(BASE);
    expect(origenOpenHands(`${BASE}/`)).toBe(BASE);
    expect(origenOpenHands("https://agentes.example.com")).toBe("https://agentes.example.com");
  });

  it("rechaza rutas, credenciales, consulta y esquemas que no son http(s)", () => {
    expect(origenOpenHands("ftp://127.0.0.1:8010")).toBeNull();
    expect(origenOpenHands(`${BASE}/api`)).toBeNull();
    expect(origenOpenHands("http://usuario:clave@127.0.0.1:8010")).toBeNull();
    expect(origenOpenHands(`${BASE}?x=1`)).toBeNull();
    expect(origenOpenHands("no es una url")).toBeNull();
  });
});

describe("salud", () => {
  it("pide GET /health sin seguir redirecciones y devuelve el texto", async () => {
    const { fetch, llamadas } = fetchFalso([new Response("OK", { status: 200 })]);
    const cliente = crearClienteOpenHands({ baseUrl: BASE, fetch });
    expect(await cliente.salud()).toEqual({ ok: true, estado: 200, datos: "OK" });
    expect(llamadas[0]!.url).toBe(`${BASE}/health`);
    expect(llamadas[0]!.init.method).toBe("GET");
    expect(llamadas[0]!.init.redirect).toBe("manual");
  });

  it("un 3xx no se sigue: queda como fallo http", async () => {
    const { fetch, llamadas } = fetchFalso([new Response("", { status: 302, headers: { location: "http://otro" } })]);
    const cliente = crearClienteOpenHands({ baseUrl: BASE, fetch });
    const r = await cliente.salud();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fallo).toBe("http");
    expect(llamadas).toHaveLength(1);
  });
});

describe("crearConversacion", () => {
  it("manda el esquema verificada con política AlwaysConfirm por defecto", async () => {
    const { fetch, llamadas } = fetchFalso([new Response(JSON.stringify({ id: "c1" }), { status: 200 })]);
    const cliente = crearClienteOpenHands({ baseUrl: BASE, fetch });
    const r = await cliente.crearConversacion({ ...CONVERSACION, mensajeInicial: "Hola", maxIterations: 10 });
    expect(r).toEqual({ ok: true, estado: 200, datos: { id: "c1" } });
    expect(llamadas[0]!.url).toBe(`${BASE}/api/conversations`);
    expect(llamadas[0]!.init.method).toBe("POST");
    const cuerpo = JSON.parse(String(llamadas[0]!.init.body)) as Record<string, unknown>;
    expect(cuerpo.agent).toEqual({
      kind: "Agent",
      llm: { model: "openai/gpt-4o-mini", api_key: "sk-clave-secreta", usage_id: "pruebas" },
      tools: [{ name: "TerminalTool" }, { name: "FileEditorTool" }],
    });
    expect(cuerpo.workspace).toEqual({ kind: "LocalWorkspace", working_dir: "/tmp/trabajo" });
    expect(cuerpo.confirmation_policy).toEqual(POLITICA_POR_DEFECTO);
    expect(cuerpo.max_iterations).toBe(10);
    expect(cuerpo.initial_message).toEqual({
      role: "user",
      content: [{ type: "text", text: "Hola" }],
      run: false,
    });
  });

  it("respeta la política que se le pase", async () => {
    const { fetch, llamadas } = fetchFalso([new Response(JSON.stringify({ id: "c1" }), { status: 200 })]);
    const cliente = crearClienteOpenHands({ baseUrl: BASE, fetch });
    await cliente.crearConversacion({ ...CONVERSACION, politica: { kind: "ConfirmRisky", threshold: "MEDIUM" } });
    const cuerpo = JSON.parse(String(llamadas[0]!.init.body)) as Record<string, unknown>;
    expect(cuerpo.confirmation_policy).toEqual({ kind: "ConfirmRisky", threshold: "MEDIUM" });
  });
});

describe("enviarMensaje, ejecutar y pausar", () => {
  it("manda el mensaje con el esquema TextContent y sin ejecutar solo", async () => {
    const { fetch, llamadas } = fetchFalso([new Response(JSON.stringify({ success: true }), { status: 200 })]);
    const cliente = crearClienteOpenHands({ baseUrl: BASE, fetch });
    const r = await cliente.enviarMensaje("c1", "  revisa el repo  ");
    expect(r).toEqual({ ok: true, estado: 200, datos: { success: true } });
    expect(llamadas[0]!.url).toBe(`${BASE}/api/conversations/c1/events`);
    expect(JSON.parse(String(llamadas[0]!.init.body))).toEqual({
      role: "user",
      content: [{ type: "text", text: "  revisa el repo  " }],
      run: false,
    });
  });

  it("ejecutar y pausar van a sus rutas POST sin cuerpo", async () => {
    const { fetch, llamadas } = fetchFalso([new Response("", { status: 200 })]);
    const cliente = crearClienteOpenHands({ baseUrl: BASE, fetch });
    expect(await cliente.ejecutar("c1")).toEqual({ ok: true, estado: 200, datos: { success: true } });
    expect(await cliente.pausar("c1")).toEqual({ ok: true, estado: 200, datos: { success: true } });
    expect(llamadas.map((l) => l.url)).toEqual([
      `${BASE}/api/conversations/c1/run`,
      `${BASE}/api/conversations/c1/pause`,
    ]);
    expect(llamadas[0]!.init.method).toBe("POST");
    expect(llamadas[0]!.init.body).toBeUndefined();
  });
});

describe("eventos y política de confirmación", () => {
  it("lee la página de eventos y pasa el cursor como page_id codificado", async () => {
    const pagina = { items: [{ id: "e1", kind: "MessageEvent" }], next_page_id: "p2" };
    const { fetch, llamadas } = fetchFalso([new Response(JSON.stringify(pagina), { status: 200 })]);
    const cliente = crearClienteOpenHands({ baseUrl: BASE, fetch });
    const r = await cliente.eventos("c1", "p/2");
    expect(r).toEqual({ ok: true, estado: 200, datos: pagina });
    expect(llamadas[0]!.url).toBe(`${BASE}/api/conversations/c1/events/search?page_id=p%2F2`);
    expect(llamadas[0]!.init.method).toBe("GET");
  });

  it("sin cursor no añade consulta", async () => {
    const { fetch, llamadas } = fetchFalso([new Response(JSON.stringify({ items: [] }), { status: 200 })]);
    const cliente = crearClienteOpenHands({ baseUrl: BASE, fetch });
    expect((await cliente.eventos("c1")).ok).toBe(true);
    expect(llamadas[0]!.url).toBe(`${BASE}/api/conversations/c1/events/search`);
  });

  it("cambia la política con el sobre { policy }", async () => {
    const { fetch, llamadas } = fetchFalso([new Response(JSON.stringify({ success: true }), { status: 200 })]);
    const cliente = crearClienteOpenHands({ baseUrl: BASE, fetch });
    const politica = { kind: "NeverConfirm" as const };
    expect((await cliente.politicaConfirmacion("c1", politica)).ok).toBe(true);
    expect(llamadas[0]!.url).toBe(`${BASE}/api/conversations/c1/confirmation_policy`);
    expect(JSON.parse(String(llamadas[0]!.init.body))).toEqual({ policy: politica });
  });
});

describe("errores y secretos", () => {
  it("una URL inválida falla como configuración sin llamar a fetch", async () => {
    const { fetch, llamadas } = fetchFalso([new Response("{}", { status: 200 })]);
    const cliente = crearClienteOpenHands({ baseUrl: "http://host/con/ruta", fetch });
    const r = await cliente.salud();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fallo).toBe("configuracion");
    expect(llamadas).toHaveLength(0);
  });

  it("sin id o sin texto no se llama al servidor", async () => {
    const { fetch, llamadas } = fetchFalso([new Response("{}", { status: 200 })]);
    const cliente = crearClienteOpenHands({ baseUrl: BASE, fetch });
    for (const r of [await cliente.enviarMensaje(" ", "hola"), await cliente.enviarMensaje("c1", "   ")]) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.fallo).toBe("configuracion");
    }
    expect(llamadas).toHaveLength(0);
  });

  it("un 500 no filtra la clave del modelo y la tapa si el servidor la repite", async () => {
    const { fetch } = fetchFalso([new Response("fallo con sk-clave-secreta", { status: 500 })]);
    const cliente = crearClienteOpenHands({ baseUrl: BASE, fetch });
    const r = await cliente.crearConversacion(CONVERSACION);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fallo).toBe("http");
    expect(r.estado).toBe(500);
    expect(r.motivo).not.toContain("sk-clave-secreta");
    expect(r.motivo).toContain("•••");
  });

  it("una respuesta que no es JSON falla como json", async () => {
    const { fetch } = fetchFalso([new Response("no es json", { status: 200 })]);
    const cliente = crearClienteOpenHands({ baseUrl: BASE, fetch });
    const r = await cliente.crearConversacion(CONVERSACION);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fallo).toBe("json");
  });

  it("una página de eventos sin items falla como json", async () => {
    const { fetch } = fetchFalso([new Response(JSON.stringify({ items: "no" }), { status: 200 })]);
    const cliente = crearClienteOpenHands({ baseUrl: BASE, fetch });
    const r = await cliente.eventos("c1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fallo).toBe("json");
  });

  it("una conversación sin id falla como json", async () => {
    const { fetch } = fetchFalso([new Response(JSON.stringify({ title: "sin id" }), { status: 200 })]);
    const cliente = crearClienteOpenHands({ baseUrl: BASE, fetch });
    const r = await cliente.crearConversacion(CONVERSACION);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fallo).toBe("json");
  });

  it("si fetch rechaza, falla como red", async () => {
    const f = (async () => {
      throw new Error("sin conexión");
    }) as unknown as typeof fetch;
    const cliente = crearClienteOpenHands({ baseUrl: BASE, fetch: f });
    const r = await cliente.salud();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fallo).toBe("red");
  });

  it("si el servidor no contesta a tiempo, falla como tiempo", async () => {
    const cliente = crearClienteOpenHands({ baseUrl: BASE, fetch: fetchQueEspera(), tiempoMs: 10 });
    const r = await cliente.salud();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fallo).toBe("tiempo");
  });

  it("manda el token del Agent Server solo si se declara", async () => {
    const { fetch, llamadas } = fetchFalso([new Response("OK", { status: 200 })]);
    const conToken = crearClienteOpenHands({ baseUrl: BASE, fetch, token: "token-del-servidor" });
    await conToken.salud();
    expect(new Headers(llamadas[0]!.init.headers).get("authorization")).toBe("Bearer token-del-servidor");
    const sinToken = crearClienteOpenHands({ baseUrl: BASE, fetch });
    await sinToken.salud();
    expect(new Headers(llamadas[1]!.init.headers).has("authorization")).toBe(false);
  });
});
