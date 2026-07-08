// ════════════════════════════════════════════════════════════════
// AnythingLLM — workspace RAG todo-en-uno, self-host
// ----------------------------------------------------------------
// Endpoint de chat de un workspace:
//   POST {endpoint}/api/v1/workspace/{slug}/chat
//   body: { message, mode:"chat"|"query"|"automatic", sessionId? }
// Auth: Bearer <clave de API> (tu instancia → Ajustes → API Keys).
// El slug del workspace va en cfg.extra.workspaceSlug (o en el input).
// Verificado vía código fuente de Mintplex-Labs/anything-llm
// (server/index.js monta `apiRouter` en "/api"; server/endpoints/api/
// workspace/index.js registra "/v1/workspace/:slug/chat" → ruta completa
// "/api/v1/workspace/{slug}/chat"), jul-2026.
// ════════════════════════════════════════════════════════════════

import type { IntegrationConfig, IntegrationResult } from "../types";
import { proxyFetch, pickText, extra } from "./_proxy";

const VALID_MODES = ["chat", "query", "automatic"];

function messageOf(input: any): string {
  if (typeof input === "string") return input;
  if (input && typeof input === "object") return String(input.message || input.question || input.query || input.text || "");
  return "";
}

function slugOf(cfg: IntegrationConfig, input: any): string {
  if (input && typeof input === "object" && input.slug) return String(input.slug);
  return extra(cfg, "workspaceSlug", "workspace_slug", "slug", "workspace");
}

function modeOf(input: any): string {
  const m = input && typeof input === "object" ? String(input.mode || "") : "";
  return VALID_MODES.includes(m) ? m : "chat";
}

/** Acción "chat": pregunta a un workspace de AnythingLLM (RAG sobre sus documentos). */
export async function chat(cfg: IntegrationConfig, input: any): Promise<IntegrationResult> {
  const slug = slugOf(cfg, input);
  if (!slug) return { ok: false, error: "Configura el workspace de AnythingLLM (en extra.workspaceSlug)." };
  const message = messageOf(input);
  if (!message) return { ok: false, error: "Indica un mensaje/pregunta (message)." };

  const res = await proxyFetch({
    id: "anything-llm",
    endpoint: cfg.endpoint!,
    apiKey: cfg.apiKey,
    auth: cfg.apiKey ? "bearer" : "none",
    method: "POST",
    path: `/api/v1/workspace/${encodeURIComponent(slug)}/chat`,
    body: { message, mode: modeOf(input) },
  });
  if (!res.ok) return res;
  const fuentes = Array.isArray(res.data?.sources)
    ? res.data.sources.slice(0, 6).map((s: any) => ({ titulo: s?.title, fragmento: s?.chunk }))
    : [];
  return { ok: true, data: { text: pickText(res.data?.textResponse ?? res.data), fuentes, raw: res.data } };
}

/** Salud: lista de workspaces (confirma endpoint + clave). */
export async function health(cfg: IntegrationConfig): Promise<IntegrationResult> {
  return proxyFetch({
    id: "anything-llm",
    endpoint: cfg.endpoint!,
    apiKey: cfg.apiKey,
    auth: cfg.apiKey ? "bearer" : "none",
    method: "GET",
    path: "/api/v1/workspaces",
    timeoutMs: 10_000,
  });
}
