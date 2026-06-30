// ════════════════════════════════════════════════════════════════
// OpenAI-compat — runtimes locales con API estilo OpenAI
// ----------------------------------------------------------------
// Cubre Ollama, Open WebUI, LiteLLM y LocalAI (todos exponen el shape
// OpenAI `/v1/chat/completions` y `/v1/models`).
//   • POST {endpoint}/v1/chat/completions { model, messages }
//   • GET  {endpoint}/v1/models
// Auth: Bearer opcional (Ollama local no la exige; Open WebUI/LiteLLM sí).
// El modelo por defecto puede venir en cfg.extra.model.
// ════════════════════════════════════════════════════════════════

import type { IntegrationConfig, IntegrationResult } from "../types";
import { proxyFetch, pickText, extra } from "./_proxy";

interface ChatMsg { role: "system" | "user" | "assistant"; content: string }

function messagesOf(input: any): ChatMsg[] {
  if (!input) return [];
  if (typeof input === "string") return [{ role: "user", content: input }];
  if (Array.isArray(input)) {
    return input
      .filter((m) => m && typeof m === "object" && typeof m.content === "string")
      .map((m) => ({ role: (m.role as ChatMsg["role"]) || "user", content: String(m.content) }));
  }
  if (typeof input === "object") {
    if (Array.isArray(input.messages)) return messagesOf(input.messages);
    const prompt = input.prompt || input.query || input.text || input.message;
    if (typeof prompt === "string") return [{ role: "user", content: prompt }];
  }
  return [];
}

/** Acción "chat": completar un chat con un runtime local OpenAI-compat. */
export async function chat(id: string, cfg: IntegrationConfig, input: any): Promise<IntegrationResult> {
  const messages = messagesOf(input);
  if (messages.length === 0) return { ok: false, error: "Indica un prompt o lista de mensajes." };
  const model = (typeof input === "object" && input?.model) || extra(cfg, "model") || "gpt-3.5-turbo";

  const res = await proxyFetch({
    id,
    endpoint: cfg.endpoint!,
    apiKey: cfg.apiKey,
    auth: cfg.apiKey ? "bearer" : "none",
    method: "POST",
    path: "/v1/chat/completions",
    body: { model, messages, stream: false },
  });
  if (!res.ok) return res;
  const text = pickText(res.data);
  return { ok: true, data: { text, model, raw: res.data } };
}

/** Acción "models": lista modelos disponibles en el runtime. */
export async function models(id: string, cfg: IntegrationConfig): Promise<IntegrationResult> {
  const res = await proxyFetch({
    id,
    endpoint: cfg.endpoint!,
    apiKey: cfg.apiKey,
    auth: cfg.apiKey ? "bearer" : "none",
    method: "GET",
    path: "/v1/models",
  });
  if (!res.ok) return res;
  const data: any = res.data;
  const list = Array.isArray(data?.data) ? data.data.map((m: any) => m?.id).filter(Boolean) : [];
  return { ok: true, data: { models: list, raw: data } };
}

/** Salud: lista de modelos (endpoint barato y universal). */
export async function health(id: string, cfg: IntegrationConfig): Promise<IntegrationResult> {
  return models(id, cfg);
}
