/**
 * Anthropic Claude provider — direct from browser using anthropic-dangerous-
 * direct-browser-access. Acceptable in our threat model because the API key
 * lives only in the user's encrypted local storage and never touches our
 * servers. The user is informed and consents explicitly in the UI.
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
  id: "anthropic",
  label: "Anthropic Claude",
  description:
    "Modelos Claude de Anthropic con tu propia clave. La clave se guarda cifrada en tu equipo y nunca pasa por nuestros servidores.",
  requiresKey: true,
  local: false,
  defaultBaseUrl: "https://api.anthropic.com/v1",
  getKeyUrl: "https://console.anthropic.com/settings/keys",
  defaultModels: [
    "claude-opus-4-6",
    "claude-sonnet-4-6",
    "claude-haiku-4-5",
    "claude-3-5-sonnet-20241022",
    "claude-3-5-haiku-20241022",
  ],
};

function toAnthropic(messages: ChatMessage[]): {
  system: string | undefined;
  messages: { role: "user" | "assistant"; content: string }[];
} {
  // Anthropic puts `system` at the top level, not in messages.
  let system: string | undefined;
  const rest: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      system = system ? `${system}\n\n${m.content}` : m.content;
    } else {
      rest.push({ role: m.role, content: m.content });
    }
  }
  return { system, messages: rest };
}

async function chat(
  config: DecryptedProviderConfig,
  messages: ChatMessage[],
  options: ChatOptions
): Promise<ChatResponse> {
  const baseUrl = (config.baseUrl || info.defaultBaseUrl).replace(/\/$/, "");
  const stream = Boolean(options.onChunk);
  const { system, messages: msgs } = toAnthropic(messages);

  const body: Record<string, unknown> = {
    model: options.model,
    messages: msgs,
    max_tokens: options.maxTokens ?? 1024,
    temperature: options.temperature ?? 0.7,
    stream,
  };
  if (system) body.system = system;

  const res = await fetch(`${baseUrl}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic error ${res.status}: ${text || res.statusText}`);
  }

  if (stream && res.body) {
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
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        try {
          const obj = JSON.parse(payload);
          if (obj?.type === "content_block_delta") {
            const delta = obj?.delta?.text ?? "";
            if (delta) {
              full += delta;
              options.onChunk!(delta);
            }
          }
        } catch {
          // ignore
        }
      }
    }
    return { text: full };
  }

  const json = await res.json();
  const text = Array.isArray(json?.content)
    ? json.content.map((c: { text?: string }) => c.text ?? "").join("")
    : "";
  return {
    text,
    raw: json,
    usage: {
      inputTokens: json?.usage?.input_tokens,
      outputTokens: json?.usage?.output_tokens,
    },
  };
}

export const anthropicProvider: Provider = { info, chat };
