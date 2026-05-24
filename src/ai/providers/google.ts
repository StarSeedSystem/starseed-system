/**
 * Google AI (Gemini) provider — direct REST call from browser with the user's
 * own API key. Kept simple; no SDK dependency to minimize bundle size.
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
  id: "google",
  label: "Google AI (Gemini)",
  description:
    "Modelos Gemini de Google con tu propia clave (AI Studio). La clave se guarda cifrada localmente.",
  requiresKey: true,
  local: false,
  defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
  getKeyUrl: "https://aistudio.google.com/apikey",
  defaultModels: [
    "gemini-2.0-flash-exp",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-1.5-flash-8b",
  ],
};

function toGoogle(messages: ChatMessage[]): {
  systemInstruction: { parts: { text: string }[] } | undefined;
  contents: { role: "user" | "model"; parts: { text: string }[] }[];
} {
  let systemText: string | undefined;
  const contents: { role: "user" | "model"; parts: { text: string }[] }[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      systemText = systemText ? `${systemText}\n\n${m.content}` : m.content;
    } else {
      contents.push({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      });
    }
  }
  return {
    systemInstruction: systemText ? { parts: [{ text: systemText }] } : undefined,
    contents,
  };
}

async function chat(
  config: DecryptedProviderConfig,
  messages: ChatMessage[],
  options: ChatOptions
): Promise<ChatResponse> {
  const baseUrl = (config.baseUrl || info.defaultBaseUrl).replace(/\/$/, "");
  const { systemInstruction, contents } = toGoogle(messages);

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxTokens,
    },
  };
  if (systemInstruction) body.systemInstruction = systemInstruction;

  // Note: streaming uses :streamGenerateContent; for now we use the simpler call.
  const url = `${baseUrl}/models/${encodeURIComponent(options.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google AI error ${res.status}: ${text || res.statusText}`);
  }

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";

  // Emit the full text as a single chunk if a streaming callback was provided —
  // keeps the API uniform while we don't fully wire streamGenerateContent.
  if (options.onChunk && text) options.onChunk(text);

  return {
    text,
    raw: json,
    usage: {
      inputTokens: json?.usageMetadata?.promptTokenCount,
      outputTokens: json?.usageMetadata?.candidatesTokenCount,
    },
  };
}

async function listModels(config: DecryptedProviderConfig): Promise<string[]> {
  const baseUrl = (config.baseUrl || info.defaultBaseUrl).replace(/\/$/, "");
  const res = await fetch(`${baseUrl}/models?key=${encodeURIComponent(config.apiKey)}`);
  if (!res.ok) throw new Error(`Google AI list models failed (${res.status})`);
  const json = await res.json();
  return Array.isArray(json?.models)
    ? json.models
        .map((m: { name: string }) => (m.name || "").replace(/^models\//, ""))
        .filter(Boolean)
    : [];
}

export const googleProvider: Provider = { info, chat, listModels };
