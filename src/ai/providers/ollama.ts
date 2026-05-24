/**
 * Ollama provider — local AI, the privacy default.
 * No API key required. Runs against http://localhost:11434 by default.
 * Install Ollama: https://ollama.com
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
  id: "ollama",
  label: "Ollama (local)",
  description:
    "Modelos open-source ejecutándose en tu propio equipo. Cero datos enviados a terceros. El proveedor por defecto si valoras la privacidad absoluta.",
  requiresKey: false,
  local: true,
  defaultBaseUrl: "http://localhost:11434",
  defaultModels: [
    "llama3.2",
    "llama3.1",
    "qwen2.5",
    "mistral",
    "phi3",
    "gemma2",
    "deepseek-coder-v2",
  ],
};

async function chat(
  config: DecryptedProviderConfig,
  messages: ChatMessage[],
  options: ChatOptions
): Promise<ChatResponse> {
  const baseUrl = (config.baseUrl || info.defaultBaseUrl).replace(/\/$/, "");
  const body = {
    model: options.model,
    messages,
    stream: Boolean(options.onChunk),
    options: {
      temperature: options.temperature ?? 0.7,
      num_predict: options.maxTokens,
    },
  };

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Ollama error ${res.status}: ${text || res.statusText}. ¿Está Ollama corriendo en ${baseUrl}?`
    );
  }

  if (options.onChunk && res.body) {
    // Streaming: NDJSON, one JSON object per line.
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
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          const delta = obj?.message?.content ?? "";
          if (delta) {
            full += delta;
            options.onChunk(delta);
          }
        } catch {
          // ignore malformed lines
        }
      }
    }
    return { text: full };
  }

  const json = await res.json();
  return {
    text: json?.message?.content ?? "",
    raw: json,
    usage: {
      inputTokens: json?.prompt_eval_count,
      outputTokens: json?.eval_count,
    },
  };
}

async function listModels(config: DecryptedProviderConfig): Promise<string[]> {
  const baseUrl = (config.baseUrl || info.defaultBaseUrl).replace(/\/$/, "");
  const res = await fetch(`${baseUrl}/api/tags`);
  if (!res.ok) throw new Error(`Ollama list models failed (${res.status})`);
  const json = await res.json();
  return Array.isArray(json?.models) ? json.models.map((m: { name: string }) => m.name) : [];
}

export const ollamaProvider: Provider = { info, chat, listModels };
