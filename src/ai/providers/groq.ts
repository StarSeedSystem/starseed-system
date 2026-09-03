/**
 * 🌌 StarSeed OS — Groq Provider (Free Tier)
 *
 * Groq ofrece inferencia ultrarrápida con hardware LPU.
 * Modelos gratuitos: llama3-70b, mixtral-8x7b, gemma2, deepseek-r1
 *
 * Categoría: 💛 Freemium (API Key Opcional para mayor rate limit)
 */

import type {
  ChatMessage, ChatOptions, ChatResponse, DecryptedProviderConfig, Provider, ProviderInfo,
} from "./types";

const info: ProviderInfo = {
  id: "groq",
  label: "Groq (Free Tier)",
  description:
    "Inferencia ultrarrápida con hardware LPU. Tiene free tier generoso. "
    + "Sin API key: rate-limit bajo. Con API key: mayor capacidad.",
  requiresKey: false,
  local: false,
  defaultBaseUrl: "https://api.groq.com/openai/v1",
  getKeyUrl: "https://console.groq.com/keys",
  defaultModels: [
    "llama3-70b-8192",
    "llama3-8b-8192",
    "mixtral-8x7b-32768",
    "gemma2-9b-it",
    "deepseek-r1-distill-llama-70b",
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
  if (stream) body.stream_options = { include_usage: true }; // (Ola 223)
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
    throw new Error(
      `Groq error ${res.status}: ${text || res.statusText}. `
      + (res.status === 429
        ? "Rate limit alcanzado. Espera un momento o añade una API key en Settings."
        : "")
    );
  }

  if (stream && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "", full = "";
    let inputTokens: number | undefined, outputTokens: number | undefined; // (Ola 223)
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const obj = JSON.parse(payload);
          const delta = obj?.choices?.[0]?.delta?.content ?? "";
          if (delta) { full += delta; options.onChunk!(delta); }
          // (Ola 223) El último chunk con usage (include_usage) marca el total.
          if (obj?.usage != null) {
            inputTokens = obj.usage.prompt_tokens ?? inputTokens;
            outputTokens = obj.usage.completion_tokens ?? outputTokens;
          }
        } catch {}
      }
    }
    return inputTokens != null || outputTokens != null
      ? { text: full, usage: { inputTokens, outputTokens } }
      : { text: full };
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
  if (!res.ok) throw new Error(`Groq list models failed (${res.status})`);
  const json = await res.json();
  return Array.isArray(json?.data) ? json.data.map((m: { id: string }) => m.id) : [];
}

export const groqProvider: Provider = { info, chat, listModels };