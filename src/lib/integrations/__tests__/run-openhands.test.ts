// Pruebas del cableado del conector OpenHands con el cliente verificado
// (OHS1020Ab): run-task crea la conversación con la política de confirmación
// y la ejecuta; politica-confirmación cambia la política de una conversación;
// el test de salud usa GET /health. Sin red: fetch global interceptado.
import { afterEach, describe, expect, it, vi } from "vitest";
import { runIntegration, testIntegration } from "../run";
import type { IntegrationConfig } from "../types";

const CLAVE = "clave-modelo-secreta";
const cfg: IntegrationConfig = {
  enabled: true,
  endpoint: "http://agent-server.test",
  apiKey: CLAVE,
  extra: { modelo: "openrouter/free/modelo", directorioTrabajo: "/workspace" },
};

interface Llamada { url: string; init?: RequestInit }
let llamadas: Llamada[] = [];

function instalarFetch(respuestas: Record<string, { estado?: number; cuerpo: string }>): void {
  llamadas = [];
  vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const u = String(url);
    llamadas.push({ url: u, init });
    const r = Object.entries(respuestas).find(([fijo]) => u.includes(fijo));
    const estado = r ? (r[1].estado ?? 200) : 500;
    return new Response(r ? r[1].cuerpo : "no esperado", { status: estado });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  llamadas = [];
});

describe("runner del conector OpenHands", () => {
  it("run-task: crea la conversación (esquema verificado) y la ejecuta", async () => {
    instalarFetch({
      "/api/conversations/": { cuerpo: JSON.stringify({}) },
      "/api/conversations": { cuerpo: JSON.stringify({ id: "conv-1", execution_status: "idle" }) },
    });
    const r = await runIntegration("openhands", "run-task", { task: "Arregla el test roto" }, cfg);
    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({ id: "conv-1" });
    const creacion = llamadas.find((l) => l.url.endsWith("/api/conversations"));
    expect(creacion).toBeDefined();
    expect(creacion?.init?.method).toBe("POST");
    expect(creacion?.init?.redirect).toBe("manual");
    const cuerpo = JSON.parse(String(creacion?.init?.body));
    expect(cuerpo).toMatchObject({
      agent: { kind: "Agent", llm: { model: "openrouter/free/modelo", api_key: CLAVE } },
      workspace: { kind: "LocalWorkspace", working_dir: "/workspace" },
      confirmation_policy: { kind: "AlwaysConfirm" },
      initial_message: { role: "user", content: [{ type: "text", text: "Arregla el test roto" }] },
    });
    expect(llamadas.some((l) => l.url.endsWith("/api/conversations/conv-1/run"))).toBe(true);
  });

  it("run-task: pide lo que falta y no revela la clave del modelo en los errores", async () => {
    const sinModelo = await runIntegration("openhands", "run-task", "tarea", { ...cfg, extra: { directorioTrabajo: "/w" } });
    expect(sinModelo).toEqual({ ok: false, error: expect.stringContaining("extra.modelo") });
    const sinDirectorio = await runIntegration("openhands", "run-task", "tarea", { ...cfg, extra: { modelo: "m" } });
    expect(sinDirectorio).toEqual({ ok: false, error: expect.stringContaining("extra.directorioTrabajo") });
    const sinTarea = await runIntegration("openhands", "run-task", {}, cfg);
    expect(sinTarea).toEqual({ ok: false, error: expect.stringContaining("Indica una tarea") });
    instalarFetch({ "/api/conversations": { estado: 500, cuerpo: `fallo ${CLAVE}` } });
    const http = await runIntegration("openhands", "run-task", { task: "tarea" }, cfg);
    expect(http.ok).toBe(false);
    expect(http.error).toContain("•••");
    expect(JSON.stringify(http)).not.toContain(CLAVE);
  });

  it("politica-confirmacion: manda el kind pedido y por defecto siempre confirma acciones", async () => {
    instalarFetch({ "/confirmation_policy": { cuerpo: JSON.stringify({ success: true }) } });
    const ry = await runIntegration("openhands", "politica-confirmacion", { id: "c1", politica: "ConfirmRisky" }, cfg);
    expect(ry.ok).toBe(true);
    expect(ry.data).toEqual({ ok: true });
    expect(JSON.parse(String(llamadas[0].init?.body))).toEqual({ policy: { kind: "ConfirmRisky" } });
    expect(llamadas[0].url).toContain("/api/conversations/c1/confirmation_policy");
    const rdef = await runIntegration("openhands", "politica-confirmacion", { id: "c1" }, cfg);
    expect(JSON.parse(String(llamadas[1].init?.body))).toEqual({ policy: { kind: "AlwaysConfirm" } });
    const sinId = await runIntegration("openhands", "politica-confirmacion", { politica: "NeverConfirm" }, cfg);
    expect(sinId).toEqual({ ok: false, error: expect.stringContaining("id de la conversación") });
    expect(rdef.ok).toBe(true);
  });

  it("test de salud: GET /health del cliente verificado, no del genérico", async () => {
    instalarFetch({ "/health": { cuerpo: JSON.stringify("ok") } });
    const r = await testIntegration("openhands", cfg);
    expect(r).toEqual({ ok: true, data: { sano: true, estado: "ok" } });
    expect(llamadas[0].url).toBe("http://agent-server.test/health");
    expect(llamadas[0].init?.method).toBe("GET");
  });

  it("el test de salud no lanza nunca: lo fallido se degrada a {ok:false}", async () => {
    instalarFetch({ "/health": { estado: 503, cuerpo: "caído" } });
    const r = await testIntegration("openhands", cfg);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("503");
  });
});
