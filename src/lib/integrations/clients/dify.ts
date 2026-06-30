// ════════════════════════════════════════════════════════════════
// Dify — plataforma LLMOps (apps agénticas, RAG, workflows)
// ----------------------------------------------------------------
// Endpoints (base de API normalmente {host}/v1):
//   • POST /v1/chat-messages   { inputs, query, response_mode, user }  (chatbot/agent)
//   • POST /v1/workflows/run    { inputs, response_mode, user }         (workflow)
// Auth: Bearer <app-api-key> (la clave es POR APP en Dify).
// response_mode: "blocking" para respuesta única (lo usamos aquí).
// Verificado vía docs.dify.ai (developing-with-apis, jun 2026).
// ════════════════════════════════════════════════════════════════

import type { IntegrationConfig, IntegrationResult } from "../types";
import { proxyFetch, pickText, extra } from "./_proxy";

function userId(cfg: IntegrationConfig, input: any): string {
  return (typeof input === "object" && input?.user) || extra(cfg, "user") || "starseed-os";
}

function queryOf(input: any): string {
  if (typeof input === "string") return input;
  if (input && typeof input === "object") return String(input.query || input.q || input.text || input.message || "");
  return "";
}

function inputsOf(input: any): Record<string, unknown> {
  if (input && typeof input === "object" && input.inputs && typeof input.inputs === "object") return input.inputs;
  return {};
}

/** Acción "chat": conversación con una app de chat/agente Dify. */
export async function chat(cfg: IntegrationConfig, input: any): Promise<IntegrationResult> {
  const query = queryOf(input);
  if (!query) return { ok: false, error: "Indica un mensaje (query) para Dify." };
  if (!cfg.apiKey) return { ok: false, error: "Dify requiere la clave de la app (Bearer)." };
  const res = await proxyFetch({
    id: "dify",
    endpoint: cfg.endpoint!,
    apiKey: cfg.apiKey,
    auth: "bearer",
    method: "POST",
    path: "/v1/chat-messages",
    body: {
      inputs: inputsOf(input),
      query,
      response_mode: "blocking",
      user: userId(cfg, input),
      conversation_id: (typeof input === "object" && input?.conversation_id) || "",
    },
  });
  if (!res.ok) return res;
  return { ok: true, data: { text: pickText(res.data), raw: res.data } };
}

/** Acción "workflow": ejecuta un workflow Dify con inputs. */
export async function runWorkflow(cfg: IntegrationConfig, input: any): Promise<IntegrationResult> {
  if (!cfg.apiKey) return { ok: false, error: "Dify requiere la clave de la app (Bearer)." };
  const inputs = inputsOf(input);
  // Permite pasar texto suelto como input por defecto si no hay objeto inputs.
  if (Object.keys(inputs).length === 0) {
    const q = queryOf(input);
    if (q) (inputs as any).query = q;
  }
  const res = await proxyFetch({
    id: "dify",
    endpoint: cfg.endpoint!,
    apiKey: cfg.apiKey,
    auth: "bearer",
    method: "POST",
    path: "/v1/workflows/run",
    body: { inputs, response_mode: "blocking", user: userId(cfg, input) },
  });
  if (!res.ok) return res;
  const data: any = res.data;
  const outText = data?.data?.outputs ? pickText(data.data.outputs) : pickText(data);
  return { ok: true, data: { text: outText, outputs: data?.data?.outputs, raw: data } };
}

/** Salud: Dify no tiene ping sin app; probamos parámetros de la app. */
export async function health(cfg: IntegrationConfig): Promise<IntegrationResult> {
  if (!cfg.apiKey) return { ok: false, error: "Dify requiere la clave de la app." };
  return proxyFetch({
    id: "dify",
    endpoint: cfg.endpoint!,
    apiKey: cfg.apiKey,
    auth: "bearer",
    method: "GET",
    path: "/v1/parameters",
    query: { user: userId(cfg, {}) },
    timeoutMs: 10_000,
  });
}
