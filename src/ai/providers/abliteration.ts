/**
 * 🌌 StarSeed OS — Abliteration.ai Provider
 *
 * API compatible con OpenAI. Modelo `abliterated-model` (256K contexto, texto e imagen, herramientas).
 * Se paga con saldo en dólares (sin créditos diarios documentados). La clave va en `ABLITERATION_API_KEY`.
 * Lo que envías llega a un tercero: el proveedor quita los rechazos habituales.
 *
 * Categoría: 💳 Pago por uso (saldo en dólares)
 */

import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  DecryptedProviderConfig,
  Provider,
  ProviderInfo,
} from "./types";
import {
  applySseChunk,
  createTelemetryState,
  parseSseLine,
  telemetryToResponse,
} from "@/lib/ai/stream-telemetry";

const info: ProviderInfo = {
  id: "abliteration",
  label: "abliteration.ai (sin filtros, de pago)",
  description:
    "Modelos sin rechazos habituales (abliterated). API compatible con OpenAI. " +
    "Se paga con saldo en dólares (GET /v1/credits → total_credits/total_usage en USD). " +
    "Lo que envías llega a un tercero. Clave en ABLITERATION_API_KEY.",
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
  };
  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = `Abliteration error ${res.status}: ${text || res.statusText}`;
    if (res.status === 401) {
      msg += ". Clave inválida o ausente (ABLITERATION_API_KEY).";
    } else if (res.status === 429) {
      const retryAfter = res.headers.get("retry-after");
      msg += retryAfter
        ? `. Rate limit: retry after ${retryAfter}s.`
        : ". Rate limit alcanzado.";
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
        const result = parseSseLine(line, { errorPrefix: "Abliteration" });
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
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;
  const res = await fetch(`${baseUrl}/models`, { headers });
  if (!res.ok) throw new Error(`Abliteration list models failed (${res.status})`);
  const json = await res.json();
  return Array.isArray(json?.data) ? json.data.map((m: { id: string }) => m.id) : [];
}

// MQA6: el id "abliteration" se añadirá a ProviderId en types.ts en la tarea MQA6
export const abliterationProvider: Provider = { info, chat, listModels } as Provider;