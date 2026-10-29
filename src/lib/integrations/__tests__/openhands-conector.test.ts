import { describe, it, expect } from "vitest";
import { runTask, health } from "../clients/openhands";
import type { IntegrationConfig } from "../types";

const cfg: IntegrationConfig = {
  endpoint: "http://127.0.0.1:8010",
  apiKey: "clave-secreta-1",
  extra: { modelo: "litellm_proxy/anthropic/claude-sonnet-4-5", directorioTrabajo: "/workspace" },
};

function fetchDe(respuestas: Array<Record<string, unknown>>, llamadas: Array<{ url: string; init: RequestInit }>): typeof fetch {
  let i = 0;
  return ((url: string, init?: RequestInit) => {
    llamadas.push({ url, init: init ?? {} });
    const r = respuestas[i];
    i += 1;
    return Promise.resolve(new Response(JSON.stringify(r), { status: 200, headers: { "content-type": "application/json" } }));
  }) as typeof fetch;
}

describe("conector openhands sobre el cliente verificado (OHS1020A)", () => {
  it("run-task crea la conversación y la arranca, con la clave dentro del cuerpo y nunca en la URL", async () => {
    const llamadas: Array<{ url: string; init: RequestInit }> = [];
    const f = fetchDe([{ id: "conv-1", execution_status: "idle" }, { success: true }], llamadas);
    const r = await runTask(cfg, { task: "Arregla el test de enteros." }, f);
    expect(r.ok).toBe(true);
    expect(llamadas).toHaveLength(2);
    expect(llamadas[0].url).toBe("http://127.0.0.1:8010/api/conversations");
    expect(llamadas[1].url).toBe("http://127.0.0.1:8010/api/conversations/conv-1/run");
    const cuerpo = JSON.parse(llamadas[0].init.body as string) as { agent: { llm: { api_key?: string } }; confirmation_policy: { kind: string }; initial_message: unknown };
    expect(cuerpo.agent.llm.api_key).toBe("clave-secreta-1");
    expect(cuerpo.confirmation_policy.kind).toBe("AlwaysConfirm");
    for (const l of llamadas) expect(l.url).not.toContain("clave-secreta-1");
  });

  it("sin modelo en la entrada ni en extra no se inventa: lo pide y va sin clave", async () => {
    const r = await runTask({ endpoint: cfg.endpoint, apiKey: "clave-secreta-1" }, { task: "algo" }, fetchDe([], []));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("modelo");
  });

  it("sin directorio de trabajo no se inventa: lo pide y avisa", async () => {
    const r = await runTask({ endpoint: cfg.endpoint, extra: { modelo: "m" } }, { task: "algo" }, fetchDe([], []));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("directorioTrabajo");
  });
  it("sin tarea no va a la red", async () => {
    let enviadas = 0;
    const f = (() => { enviadas += 1; return Promise.reject(new Error("no")); }) as typeof fetch;
    const r = await runTask(cfg, {}, f);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("tarea");
    expect(enviadas).toBe(0);
  });
  it("salud usa GET /health y devuelve el estado", async () => {
    const llamadas: Array<{ url: string; init: RequestInit }> = [];
    const f = ((url: string, init?: RequestInit) => {
      llamadas.push({ url, init: init ?? {} });
      return Promise.resolve(new Response(JSON.stringify("OK"), { status: 200 }));
    }) as typeof fetch;
    const r = await health(cfg, f);
    expect(r.ok).toBe(true);
    expect(llamadas[0].url).toBe("http://127.0.0.1:8010/health");
    expect(llamadas[0].init.method).toBe("GET");
  });
  it("el error HTTP deja el mensaje humano y honesto, sin clave", async () => {
    const f = (async () => new Response(JSON.stringify({ detail: "api_key=clave-secreta-1" }), { status: 401 })) as unknown as typeof fetch;
    const r = await runTask(cfg, { task: "algo" }, f);
    expect(r.ok).toBe(false);
    expect((r.error ?? "")).toContain("401");
    expect((r.error ?? "")).not.toContain("clave-secreta-1");
  });
});
