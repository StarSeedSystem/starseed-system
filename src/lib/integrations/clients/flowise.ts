// ════════════════════════════════════════════════════════════════
// Flowise — agentes IA visuales (drag-and-drop sobre LangChain)
// ----------------------------------------------------------------
// Endpoint de predicción:
//   POST {endpoint}/api/v1/prediction/{chatflowId}
//   body: { question, overrideConfig?, history? }
// Auth: Bearer <api-key> (opcional si el chatflow es público).
// El chatflowId va en cfg.extra.chatflowId (o en el input). La respuesta
// trae { text, chatId }. Verificado vía docs.flowiseai.com (prediction).
// ════════════════════════════════════════════════════════════════

import type { IntegrationConfig, IntegrationResult } from "../types";
import { proxyFetch, pickText, extra } from "./_proxy";

function questionOf(input: any): string {
  if (typeof input === "string") return input;
  if (input && typeof input === "object") return String(input.question || input.query || input.text || input.message || "");
  return "";
}

function chatflowIdOf(cfg: IntegrationConfig, input: any): string {
  if (input && typeof input === "object" && input.chatflowId) return String(input.chatflowId);
  return extra(cfg, "chatflowId", "chatflow_id", "chatflow", "flowId");
}

/** Acción "predict": pregunta a un chatflow Flowise y devuelve el texto. */
export async function predict(cfg: IntegrationConfig, input: any): Promise<IntegrationResult> {
  const chatflowId = chatflowIdOf(cfg, input);
  if (!chatflowId) return { ok: false, error: "Configura el chatflowId de Flowise (en extra.chatflowId)." };
  const question = questionOf(input);
  if (!question) return { ok: false, error: "Indica una pregunta (question)." };

  const body: Record<string, unknown> = { question };
  if (input && typeof input === "object" && input.overrideConfig) body.overrideConfig = input.overrideConfig;

  const res = await proxyFetch({
    id: "flowise",
    endpoint: cfg.endpoint!,
    apiKey: cfg.apiKey,
    auth: cfg.apiKey ? "bearer" : "none",
    method: "POST",
    path: `/api/v1/prediction/${encodeURIComponent(chatflowId)}`,
    body,
  });
  if (!res.ok) return res;
  return { ok: true, data: { text: pickText(res.data), raw: res.data } };
}

/** Salud: lista de chatflows (requiere clave en instancias protegidas). */
export async function health(cfg: IntegrationConfig): Promise<IntegrationResult> {
  return proxyFetch({
    id: "flowise",
    endpoint: cfg.endpoint!,
    apiKey: cfg.apiKey,
    auth: cfg.apiKey ? "bearer" : "none",
    method: "GET",
    path: "/api/v1/chatflows",
    timeoutMs: 10_000,
  });
}
