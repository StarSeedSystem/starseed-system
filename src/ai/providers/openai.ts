/**
 * OpenAI-compatible provider — covers OpenAI itself plus any service that
 * implements the same `/v1/chat/completions` API: Groq, Together, OpenRouter,
 * Mistral, LM Studio, vLLM, etc. The user chooses the base URL.
 */

import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  DecryptedProviderConfig,
  Provider,
  ProviderInfo,
} from "./types";

const info: ProviderInfo = {
  id: "openai",
  label: "OpenAI / Compatible",
  description:
    "OpenAI oficial o cualquier proveedor con API compatible: Groq, Together, OpenRouter, Mistral, LM Studio, vLLM. Trae tu propia clave.",
  requiresKey: true,
  local: false,
  defaultBaseUrl: "https://api.openai.com/v1",
  getKeyUrl: "https://platform.openai.com/api-keys",
  defaultModels: [
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4-turbo",
    "o1-mini",
    "o1-preview",
  ],
};

async function chat(
  config: DecryptedProviderConfig,
  messages: ChatMessage[],
  options: ChatOptions
): Promise<ChatResponse> {
  const baseUrl = (config.baseUrl || info.defaultBaseUrl).replace(/\/$/, "");
  const stream = Boolean(options.onChunk) && !baseUrl.includes("pollinations");

  const body: Record<string, unknown> = {
    model: options.model,
    messages,
    stream,
    temperature: options.temperature ?? 0.7,
  };
  if (options.maxTokens) body.max_tokens = options.maxTokens;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI-compat error ${res.status}: ${text || res.statusText}`);
  }

  if (stream && res.body) {
    // SSE: lines beginning with "data: " containing JSON, "[DONE]" at the end.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
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
          if (delta) {
            full += delta;
            options.onChunk!(delta);
          }
        } catch {
          // ignore
        }
      }
    }
    return { text: full };
  }

  const json = await res.json();
  return {
    text: json?.choices?.[0]?.message?.content ?? "",
    raw: json,
    usage: {
      inputTokens: json?.usage?.prompt_tokens,
      outputTokens: json?.usage?.completion_tokens,
    },
  };
}

async function listModels(config: DecryptedProviderConfig): Promise<string[]> {
  const baseUrl = (config.baseUrl || info.defaultBaseUrl).replace(/\/$/, "");
  const res = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
  });
  if (!res.ok) throw new Error(`OpenAI-compat list models failed (${res.status})`);
  const json = await res.json();
  return Array.isArray(json?.data) ? json.data.map((m: { id: string }) => m.id) : [];
}

export const openaiProvider: Provider = { info, chat, listModels };
