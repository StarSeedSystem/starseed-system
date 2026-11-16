/**
 * 🌌 StarSeed OS — Abliteration Provider (De-paid, Sin filtros)
 *
 * Abliteration.ai ofrece modelos sin filtros de contenido, pagos con saldo en dólares.
 * API compatible con OpenAI: POST https://api.abliteration.ai/v1/chat/completions
 *
 * Categoría: ⚠️ De pago (requiere saldo en dólares)
 */

import type {
  ChatMessage, ChatOptions, ChatResponse, DecryptedProviderConfig, Provider, ProviderInfo,
} from "./types";
import {
  applySseChunk, createTelemetryState, parseSseLine, telemetryToResponse,
} from "../../lib/ai/stream-telemetry";

// MQA6: Provider ID "abliteration" agregado a types.ts vía este archivo
const info: ProviderInfo = {
  id: "abliteration" as "abliteration", // MQA6
  label: "abliteration.ai (sin filtros, de pago)",
  description:
    "Proveedor de modelos sin filtros de contenido. Se paga con saldo en dólares "
    + "(NO hay créditos diarios documentados). El contenido que envías llega a un tercero. "
    + "Precios verificados el 2026-11-16: $1 entrada / $0.10 entrada en caché / $3 salida por millón de tokens.",
  requiresKey: true,
  local: false,
  defaultBaseUrl: "https://api.abliteration.ai/v1",
  getKeyUrl: "https://abliteration.ai/console",
  defaultModels: [
    "abliterated-model",
    "abliterated-model-large-flash",
    "abliterated-model-large-v2",
  ],
};

export interface AbliterationCredits {
  total_credits: number;
  total_usage: number;
}

async function chat(
  config: DecryptedProviderConfig,
  messages: ChatMessage[],
  options: ChatOptions,
): Promise<ChatResponse> {
  const baseUrl = (config.baseUrl || info.defaultBaseUrl).replace(/\/$/, "");
  const stream = Boolean(options.onChunk);

  const body: Record<string, unknown> = {
    model: options.model,
    messages,
    stream,
  };
  if (stream) body.stream_options = { include_usage: true };
  if (options.temperature) body.temperature = options.temperature;
  if (options.maxTokens) body.max_tokens = options.maxTokens;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${config.apiKey}`,
  };

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const msg = `Abliteration error ${res.status}: ${text || res.statusText}. `;
    if (res.status === 401) {
      throw new Error(msg + "Clave API inválida o faltante. Configúrala en Settings → Inteligencia.");
    }
    if (res.status === 429) {
      const retryAfter = res.headers.get("Retry-After");
      const wait = retryAfter ? `${parseInt(retryAfter, 10) * 1000}ms` : "un momento";
      throw new Error(msg + `Rate limit alcanzado. Espera ${wait} o añade una API key válida.`);
    }
    if (res.status === 402) {
      throw new Error(msg + "Saldo insuficiente. Recarga tu cuenta en https://abliteration.ai/console");
    }
    throw new Error(msg);
  }

  if (stream && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const state = createTelemetryState();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const result = parseSseLine(line, {});
        if (!result || result.done) continue;
        applySseChunk(state, result);
        if (result.delta) options.onChunk!(result.delta);
      }
    }
    return telemetryToResponse(state);
  }

  const json = await res.json();
  return {
    text: json?.choices?.[0]?.message?.content ?? "",
    usage: {
      inputTokens: json?.usage?.prompt_tokens,
      outputTokens: json?.usage?.completion_tokens,
    },
  };
}

async function listModels(config: DecryptedProviderConfig): Promise<string[]> {
  const baseUrl = (config.baseUrl || info.defaultBaseUrl).replace(/\/$/, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${config.apiKey}`,
  };
  const res = await fetch(`${baseUrl}/models`, { headers });
  if (!res.ok) throw new Error(`Abliteration list models failed (${res.status})`);
  const json = await res.json();
  return Array.isArray(json?.data) ? json.data.map((m: { id: string }) => m.id) : [];
}

async function fetchCredits(config: DecryptedProviderConfig): Promise<AbliterationCredits | null> {
  const baseUrl = (config.baseUrl || info.defaultBaseUrl).replace(/\/$/, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${config.apiKey}`,
  };
  const res = await fetch(`${baseUrl}/credits`, { headers });
  if (!res.ok) return null;
  const json = await res.json();
  const data = json?.data;
  if (data && typeof data === "object") {
    return {
      total_credits: typeof data.total_credits === "number" ? data.total_credits : 0,
      total_usage: typeof data.total_usage === "number" ? data.total_usage : 0,
    };
  }
  return null;
}

export const abliterationProvider: Provider = { info, chat, listModels };