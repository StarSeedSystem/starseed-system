/**
 * 🌌 StarSeed OS — abliteration.ai Provider
 *
 * Modelo sin filtros ("abliterated"). Se paga con saldo en USD (total_credits).
 * API compatible con OpenAI.
 *
 * Categoría: 💸 Pago (Saldo USD)
 */

import type {
  ChatMessage, ChatOptions, ChatResponse, DecryptedProviderConfig, Provider, ProviderInfo,
} from "./types";
import {
  applySseChunk, createTelemetryState, parseSseLine, telemetryToResponse,
} from "../../lib/ai/stream-telemetry";

const info: ProviderInfo = {
  id: "abliteration",
  label: "abliteration.ai (sin filtros, de pago)",
  description:
    "Acceso a modelos sin restricciones de contenido. Se paga con saldo en dólares. "
    + "Lo que envías llega a un tercero.",
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

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `abliteration error ${res.status}: ${text || res.statusText}. `
      + (res.status === 401 ? "API Key inválida." : "")
      + (res.status === 429 ? "Rate limit alcanzado." : "")
    );
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
        const result = parseSseLine(line, { errorPrefix: "Abliteration SSE error" });
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

export const abliterationProvider: Provider = { info, chat };
