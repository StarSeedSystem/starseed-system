/**
 * 🌌 StarSeed OS — NVIDIA NIM Provider (build.nvidia.com) · Adenda 219
 *
 * API OpenAI-compatible de NVIDIA (integrate.api.nvidia.com/v1) con 80+ modelos
 * abiertos servidos en sus GPUs: Nemotron 3 Ultra/Super/Nano, DeepSeek V4,
 * Kimi K3, gpt-oss 120B, Gemma 4, Mistral Large, Llama 3.2 Vision… Cada clave
 * gratuita de build.nvidia.com trae créditos de inferencia (no cobra dinero).
 *
 * Categoría: 💛 Freemium con clave. ACCESO COMUNITARIO: sin clave personal, las
 * peticiones van por el proxy del servidor (/api/ai/nvidia), donde vive la
 * clave compartida de la comunidad (`NVIDIA_SHARED_KEY`) — nunca en el navegador.
 * Con clave personal (Ajustes → Inteligencia), la petición va DIRECTA a NVIDIA.
 *
 * Economía de créditos: el router de Astraura trata esta fuente como una más
 * de la cadena de RELEVO — si devuelve 429/402 (cuota agotada) entra en
 * enfriamiento y la tarea sigue en la siguiente fuente gratis. Ningún modelo
 * debe agotar sus créditos: la tarea se ramifica y continúa en otro.
 */

import type {
  ChatMessage, ChatOptions, ChatResponse, DecryptedProviderConfig, Provider, ProviderInfo,
} from "./types";

const info: ProviderInfo = {
  id: "nvidia",
  label: "NVIDIA NIM (build.nvidia.com)",
  description:
    "Modelos abiertos grandes en GPUs de NVIDIA (Nemotron 3, DeepSeek V4, Kimi K3, gpt-oss, Gemma 4). "
    + "Sin clave: acceso comunitario por el servidor. Con clave gratuita propia: tus propios créditos.",
  requiresKey: false,
  local: false,
  defaultBaseUrl: "https://integrate.api.nvidia.com/v1",
  getKeyUrl: "https://build.nvidia.com/settings/api-keys",
  defaultModels: [
    "nvidia/nemotron-3.5-lightning-30b-a3b",
    "nvidia/nemotron-nano-3-30b-a3b",
    "nvidia/nemotron-3-super-120b-a12b",
    "nvidia/nemotron-3-ultra-550b-a55b",
    "deepseek-ai/deepseek-v4-flash-0731",
    "moonshotai/kimi-k3",
    "openai/gpt-oss-120b",
    "google/gemma-4-31b-it",
    "meta/llama-3.2-90b-vision-instruct",
  ],
};

async function chat(
  config: DecryptedProviderConfig,
  messages: ChatMessage[],
  options: ChatOptions,
): Promise<ChatResponse> {
  const baseUrl = (config.baseUrl || info.defaultBaseUrl).replace(/\/$/, "");
  const model = options.model || config.defaultModel || info.defaultModels[0];
  const stream = Boolean(options.onChunk);

  const hasUserKey = typeof config.apiKey === "string" && config.apiKey.trim().length > 8;
  const canUseSharedProxy = typeof window !== "undefined";
  if (!hasUserKey && !canUseSharedProxy) {
    throw new Error("NVIDIA NIM: hace falta una clave (o el acceso comunitario desde el navegador).");
  }
  const useProxy = !hasUserKey && canUseSharedProxy;

  const body: Record<string, unknown> = {
    model,
    messages,
    stream,
    temperature: options.temperature ?? 0.7,
  };
  if (options.maxTokens) body.max_tokens = options.maxTokens;

  const doFetch = (viaProxy: boolean): Promise<Response> =>
    fetch(viaProxy ? "/api/ai/nvidia" : `${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(viaProxy ? {} : { Authorization: `Bearer ${config.apiKey}` }),
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });

  let res = await doFetch(useProxy);
  // Clave personal caducada → segunda oportunidad por el acceso comunitario.
  if (!res.ok && (res.status === 401 || res.status === 403) && !useProxy && canUseSharedProxy) {
    try {
      const retry = await doFetch(true);
      if (retry.ok) res = retry;
    } catch { /* seguimos con el error original */ }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 503 && useProxy) {
      throw new Error("NVIDIA comunitario aún no configurado en este despliegue (NVIDIA_SHARED_KEY); Aurora sigue con las demás fuentes gratis.");
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(`NVIDIA ${res.status}: clave no válida. Consigue una gratis en https://build.nvidia.com/settings/api-keys`);
    }
    if (res.status === 429 || res.status === 402) {
      throw new Error(`NVIDIA ${res.status}: créditos o límite de esta clave agotados por ahora. Aurora relevará a otra fuente gratis.`);
    }
    throw new Error(`NVIDIA error ${res.status}: ${text || res.statusText}`);
  }

  if (stream && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "", full = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":") || !trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const obj = JSON.parse(payload);
          const delta = obj?.choices?.[0]?.delta?.content ?? "";
          if (delta) { full += delta; options.onChunk!(delta); }
        } catch { /* fragmento parcial */ }
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

async function listModels(config: DecryptedProviderConfig): Promise<string[]> {
  const hasUserKey = typeof config.apiKey === "string" && config.apiKey.trim().length > 8;
  const baseUrl = (config.baseUrl || info.defaultBaseUrl).replace(/\/$/, "");
  const url = hasUserKey ? `${baseUrl}/models` : "/api/ai/nvidia";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (hasUserKey) headers["Authorization"] = `Bearer ${config.apiKey}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`NVIDIA list models failed (${res.status})`);
  const json = await res.json();
  return Array.isArray(json?.data) ? json.data.map((m: { id: string }) => m.id) : [];
}

export const nvidiaProvider: Provider = { info, chat, listModels };
