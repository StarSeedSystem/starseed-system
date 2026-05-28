/**
 * 🌌 StarSeed OS — DeepSeek Provider (Free Tier)
 *
 * DeepSeek ofrece acceso gratuito rate-limited sin necesidad de API key.
 * Modelos: deepseek-chat, deepseek-reasoner
 *
 * Categoría: 💚 Gratuito (Sin API Key)
 */

import type {
  ChatMessage, ChatOptions, ChatResponse, DecryptedProviderConfig, Provider, ProviderInfo,
} from "./types";

const info: ProviderInfo = {
  id: "deepseek",
  label: "DeepSeek (Free Tier)",
  description:
    "Modelo gratuito de DeepSeek. Sin API key necesaria (rate-limited). "
    + "deepseek-chat es comparable a GPT-4 en razonamiento.",
  requiresKey: false,
  local: false,
  defaultBaseUrl: "https://api.deepseek.com/v1",
  defaultModels: ["deepseek-chat", "deepseek-reasoner"],
};

async function chat(
  config: DecryptedProviderConfig,
  messages: ChatMessage[],
  options: ChatOptions,
): Promise<ChatResponse> {
  const baseUrl = (config.baseUrl || info.defaultBaseUrl).replace(/\/$/, "");
  const stream = Boolean(options.onChunk);

  const body: Record<string, unknown> = {
    model: options.model || config.defaultModel,
    messages,
    stream,
  };
  if (options.temperature) body.temperature = options.temperature;
  if (options.maxTokens) body.max_tokens = options.maxTokens;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }
  // Sin API key: usa el free tier público (rate-limited)

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `DeepSeek error ${res.status}: ${text || res.statusText}. `
      + (res.status === 402
        ? "Límite del free tier alcanzado. Espera un momento o configura una API key."
        : "")
    );
  }

  if (stream && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "", full = "";
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
        } catch {}
      }
    }
    return { text: full };
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

export const deepseekProvider: Provider = { info, chat };
