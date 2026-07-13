/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OPENROUTER · adaptador DEDICADO (Adenda 67 · P0-2)
 * ---------------------------------------------------------------------------
 * OpenRouter es una API OpenAI-compatible, pero espera DOS cabeceras propias de
 * las apps de navegador que el adaptador genérico nunca enviaba:
 *
 *   · `HTTP-Referer` — identifica la app que llama (aparece en su ranking y, en
 *     algunos modelos comunitarios, es lo que evita el rechazo de la petición).
 *   · `X-Title`      — nombre legible de la app.
 *
 * Además, este adaptador es la garantía de que Aurora **solo gasta lo gratis**:
 * conoce la convención `:free` de OpenRouter y, salvo que se le pida un modelo
 * concreto de pago, se queda en los modelos gratuitos.
 *
 * Ambas cabeceras están permitidas por CORS de OpenRouter (verificado el
 * 2026-07-13: `access-control-allow-headers` incluye `HTTP-Referer` y
 * `X-Title`), así que funciona desde el navegador sin proxy.
 *
 * `listModels()` no necesita clave: `GET /api/v1/models` es público — lo usamos
 * para descubrir en vivo qué modelos `:free` existen HOY (el catálogo estático
 * envejece; los `:free` van y vienen).
 * ═══════════════════════════════════════════════════════════════════════════
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
  id: "openrouter",
  label: "OpenRouter",
  description:
    "Una sola clave gratuita → decenas de modelos, muchos con sufijo :free (coste 0). Aurora prioriza siempre los gratuitos.",
  requiresKey: true,
  local: false,
  defaultBaseUrl: "https://openrouter.ai/api/v1",
  getKeyUrl: "https://openrouter.ai/keys",
  defaultModels: [
    "openrouter/free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "openai/gpt-oss-120b:free",
    "qwen/qwen3-coder:free",
    "meta-llama/llama-3.3-70b-instruct:free",
  ],
};

/** Identidad de la app para OpenRouter (aparece en su ranking público). */
function appIdentity(): { referer: string; title: string } {
  let referer = "https://starseed-os.vercel.app";
  try {
    if (typeof window !== "undefined" && window.location?.origin) {
      referer = window.location.origin;
    }
  } catch {
    /* SSR / entorno sin location: nos quedamos con el origen oficial */
  }
  return { referer, title: "StarSeed OS · Aurora" };
}

async function chat(
  config: DecryptedProviderConfig,
  messages: ChatMessage[],
  options: ChatOptions
): Promise<ChatResponse> {
  const baseUrl = (config.baseUrl || info.defaultBaseUrl).replace(/\/$/, "");
  const model = options.model || config.defaultModel || info.defaultModels[0];
  const stream = Boolean(options.onChunk);
  const { referer, title } = appIdentity();

  const body: Record<string, unknown> = {
    model,
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
      // Cabeceras propias de OpenRouter (permitidas por su CORS).
      "HTTP-Referer": referer,
      "X-Title": title,
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // Mensajes accionables: el router los usa para decidir cooldown vs failover.
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `OpenRouter ${res.status}: clave no válida o sin permisos. Revisa tu clave gratuita en https://openrouter.ai/keys`
      );
    }
    if (res.status === 402) {
      throw new Error(
        "OpenRouter 402: ese modelo NO es gratuito y tu cuenta no tiene créditos. Aurora seguirá con modelos :free."
      );
    }
    throw new Error(`OpenRouter error ${res.status}: ${text || res.statusText}`);
  }

  if (stream && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        // OpenRouter envía comentarios SSE (": OPENROUTER PROCESSING") como
        // keep-alive mientras espera al proveedor: hay que IGNORARLOS, no
        // tratarlos como datos (rompían el parseo en adaptadores ingenuos).
        if (!trimmed || trimmed.startsWith(":") || !trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const obj = JSON.parse(payload);
          const err = obj?.error?.message;
          if (err) throw new Error(`OpenRouter: ${err}`);
          const delta = obj?.choices?.[0]?.delta?.content ?? "";
          if (delta) {
            full += delta;
            options.onChunk!(delta);
          }
        } catch (e) {
          // Un chunk ilegible no debe tumbar la respuesta; un error explícito sí.
          if (e instanceof Error && e.message.startsWith("OpenRouter:")) throw e;
        }
      }
    }
    return { text: full };
  }

  const json = await res.json();
  if (json?.error?.message) throw new Error(`OpenRouter: ${json.error.message}`);
  return {
    text: json?.choices?.[0]?.message?.content ?? "",
    raw: json,
    usage: {
      inputTokens: json?.usage?.prompt_tokens,
      outputTokens: json?.usage?.completion_tokens,
    },
  };
}

/**
 * Catálogo EN VIVO de OpenRouter. El endpoint es PÚBLICO (no requiere clave),
 * así que Aurora puede descubrir qué modelos `:free` existen hoy incluso antes
 * de que el usuario conecte su clave. Devuelve los `:free` primero.
 */
async function listModels(config: DecryptedProviderConfig): Promise<string[]> {
  const baseUrl = (config.baseUrl || info.defaultBaseUrl).replace(/\/$/, "");
  const headers: Record<string, string> = {};
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  const res = await fetch(`${baseUrl}/models`, { headers });
  if (!res.ok) throw new Error(`OpenRouter list models failed (${res.status})`);
  const json = await res.json();
  const ids: string[] = Array.isArray(json?.data)
    ? json.data.map((m: { id: string }) => m.id).filter(Boolean)
    : [];
  const free = ids.filter((id) => id.endsWith(":free"));
  const rest = ids.filter((id) => !id.endsWith(":free"));
  return [...free, ...rest];
}

/**
 * Solo los modelos GRATUITOS (`:free`) que OpenRouter sirve ahora mismo.
 * Público: no necesita clave. Lo usa Ajustes → Inteligencia para enseñar al
 * usuario qué tendría gratis con su clave, y el router para no quedarse con un
 * id `:free` que haya desaparecido del catálogo.
 */
export async function listOpenRouterFreeModels(): Promise<string[]> {
  try {
    const res = await fetch(`${info.defaultBaseUrl}/models`);
    if (!res.ok) return [];
    const json = await res.json();
    const data: Array<{ id?: string }> = Array.isArray(json?.data) ? json.data : [];
    return data
      .map((m) => String(m?.id ?? ""))
      .filter((id) => id.endsWith(":free"));
  } catch {
    return [];
  }
}

export const openrouterProvider: Provider = { info, chat, listModels };
