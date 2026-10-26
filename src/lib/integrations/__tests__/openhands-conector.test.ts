// Pruebas del conector OpenHands sobre el cliente puro OHS1020A: fetch
// simulado, sin red, sin Supabase y sin importar route.ts.
import { describe, expect, it } from "vitest";
import { health, runTask } from "@/lib/integrations/clients/openhands";
import type { FetchLike } from "@/lib/agentes/openhands-servidor";

const cfg = { endpoint: "http://127.0.0.1:8010/", apiKey: "clave-secreta" };

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });
}
function capturar(respuesta: () => Response): { f: FetchLike; llamadas: Array<{ url: string; init?: RequestInit }> } {
  const llamadas: Array<{ url: string; init?: RequestInit }> = [];
  return { llamadas, f: async (url, init) => { llamadas.push({ url, init }); return respuesta(); } };
}

describe("conector openhands sobre el cliente verificado", () => {
  it("health: llama al /health del Agent Server", async () => {
    const { f, llamadas } = capturar(() => json("ok"));
    const r = await health(cfg, f);
    expect(r.ok).toBe(true);
    expect(new URL(llamadas[0].url).pathname).toBe("/health");
    expect(r.data?.sano).toBe(true);
  });

  it("health: sin endpoint devuelve error honesto y no llama nada", async () => {
    const { f, llamadas } = capturar(() => json("ok"));
    const r = await health({ ...cfg, endpoint: "  " }, f);
    expect(r.ok).toBe(false);
    expect(r.error).toBe("no configurado");
    expect(llamadas).toHaveLength(0);
  });

  it("runTask: crea la conversación con AlwaysConfirm, la arranca y devuelve su id", async () => {
    const { f, llamadas } = capturar(() => json({ id: "c-1" }));
    const r = await runTask(cfg, { task: "arregla el test", modelo: "openai/gpt" }, f);
    expect(r.ok).toBe(true);
    expect(r.data?.id).toBe("c-1");
    const rutas = llamadas.map((l) => new URL(l.url).pathname);
    expect(rutas).toEqual(["/api/conversations", "/api/conversations/c-1/run"]);
    const cuerpo = JSON.parse(String(llamadas[0].init?.body)) as { confirmation_policy: { kind: string }; initial_message: unknown; agent: { llm: Record<string, unknown> } };
    expect(cuerpo.confirmation_policy.kind).toBe("AlwaysConfirm");
    expect(cuerpo.agent.llm).toEqual({ model: "openai/gpt", api_key: "clave-secreta" });
    expect(JSON.stringify(cuerpo.initial_message)).toContain("arregla el test");
  });

  it("runTask: sin modelo o sin tarea lo dice sin inventar nada", async () => {
    const { f, llamadas } = capturar(() => json({ id: "c-1" }));
    const sinModelo = await runTask(cfg, { task: "algo" }, f);
    expect(sinModelo.ok).toBe(false);
    expect(sinModelo.error).toMatch(/Falta el modelo/);
    const sinTarea = await runTask(cfg, { modelo: "m" }, f);
    expect(sinTarea.ok).toBe(false);
    expect(sinTarea.error).toMatch(/Indica la tarea/);
    expect(llamadas).toHaveLength(0);
  });

  it("runTask: si el Agent Server falla, devuelve su mensaje sin filtrar la clave", async () => {
    const { f } = capturar(() => json({ detail: "fallo con clave-secreta" }, 500));
    const r = await runTask(cfg, { task: "algo", modelo: "m" }, f);
    expect(r.ok).toBe(false);
    expect(r.error).not.toContain("clave-secreta");
  });
});
