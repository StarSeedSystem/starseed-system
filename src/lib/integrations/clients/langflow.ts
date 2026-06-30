// ════════════════════════════════════════════════════════════════
// Langflow — constructor visual de agentes/flujos (low-code)
// ----------------------------------------------------------------
// Endpoint para disparar un flujo:
//   POST {endpoint}/api/v1/run/{flowId}
//   body: { input_value, input_type:"chat", output_type:"chat", session_id? }
// Auth: x-api-key <key> (Langflow usa cabecera x-api-key, no Bearer).
// El flowId va en cfg.extra.flowId (o en el input). Verificado vía
// docs.langflow.org (flow trigger endpoints, jun 2026).
// ════════════════════════════════════════════════════════════════

import type { IntegrationConfig, IntegrationResult } from "../types";
import { proxyFetch, extra } from "./_proxy";

function inputValueOf(input: any): string {
  if (typeof input === "string") return input;
  if (input && typeof input === "object") return String(input.input_value || input.query || input.text || input.message || "");
  return "";
}

function flowIdOf(cfg: IntegrationConfig, input: any): string {
  if (input && typeof input === "object" && input.flowId) return String(input.flowId);
  return extra(cfg, "flowId", "flow_id", "flow");
}

/** Extrae el texto de la respuesta anidada típica de Langflow. */
function pickLangflow(data: any): string {
  try {
    const out = data?.outputs?.[0]?.outputs?.[0];
    const msg =
      out?.results?.message?.text ||
      out?.results?.message?.data?.text ||
      out?.artifacts?.message ||
      out?.outputs?.message?.message ||
      out?.messages?.[0]?.message;
    if (typeof msg === "string") return msg;
  } catch { /* noop */ }
  if (typeof data === "string") return data;
  try { return JSON.stringify(data); } catch { return String(data); }
}

/** Acción "run-flow": ejecuta un flujo Langflow con un valor de entrada. */
export async function runFlow(cfg: IntegrationConfig, input: any): Promise<IntegrationResult> {
  const flowId = flowIdOf(cfg, input);
  if (!flowId) return { ok: false, error: "Configura el flowId de Langflow (en extra.flowId)." };
  const value = inputValueOf(input);
  if (!value) return { ok: false, error: "Indica un valor de entrada (input_value)." };

  const res = await proxyFetch({
    id: "langflow",
    endpoint: cfg.endpoint!,
    apiKey: cfg.apiKey,
    auth: cfg.apiKey ? "x-api-key" : "none",
    method: "POST",
    path: `/api/v1/run/${encodeURIComponent(flowId)}`,
    body: {
      input_value: value,
      input_type: "chat",
      output_type: "chat",
      session_id: (typeof input === "object" && input?.session_id) || undefined,
    },
  });
  if (!res.ok) return res;
  return { ok: true, data: { text: pickLangflow(res.data), raw: res.data } };
}

/** Salud: lista de flujos (endpoint de versión/flujos). */
export async function health(cfg: IntegrationConfig): Promise<IntegrationResult> {
  return proxyFetch({
    id: "langflow",
    endpoint: cfg.endpoint!,
    apiKey: cfg.apiKey,
    auth: cfg.apiKey ? "x-api-key" : "none",
    method: "GET",
    path: "/api/v1/version",
    timeoutMs: 10_000,
  });
}
