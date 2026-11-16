/**
 * 🌌 StarSeed OS — Abliteration.ai Provider
 *
 * Proveedor OpenAI-compatible con modelos de alta calidad.
 * API compatible: POST https://api.abliteration.ai/v1/chat/completions
 * Clave: variable de entorno ABLITERATION_API_KEY
 *
 * Precios (verificado 2026-11-16):
 *   $1 entrada / $0.10 entrada en caché / $3 salida por millón de tokens
 *
 * Categoría: 💛 Freemium (pago con saldo en dólares, sin créditos diarios documentados)
 */

import type {
  ChatMessage, ChatOptions, ChatResponse, DecryptedProviderConfig, Provider, ProviderInfo,
} from "./types";
import {
  applySseChunk, createTelemetryState, parseSseLine, telemetryToResponse,
} from "../../lib/ai/stream-telemetry";

// MQA6: Provider "abliteration" agregado como tipo a ProviderId en types.ts
const info: ProviderInfo = {
  id: "abliteration",
  label: "abliteration.ai (sin filtros, de pago)",
  description:
    "Modelos OpenAI-compatible sin filtros de seguridad. Se paga con saldo en dólares."
    + " La API compatible permite usarlo como cualquier otro proveedor.",
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
    throw new Error(
      `Abliteration error ${res.status}: ${text || res.statusText}. `
      + (res.status === 401
        ? "Clave API inválida o faltante. Añade tu clave en ajustes."
        : res.status === 429
          ? "Rate limit alcanzado. Espera y vuelve a intentar."
          : "")
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

export const abliterationProvider: Provider = { info, chat, listModels };