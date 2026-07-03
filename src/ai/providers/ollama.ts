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

/** Endpoint local por defecto de Ollama. Exportado para reutilizar en la UI. */
export const OLLAMA_DEFAULT_BASE_URL = "http://localhost:11434";

const info: ProviderInfo = {
  id: "ollama",
  label: "Ollama (local)",
  description:
    "Modelos open-source ejecutándose en tu propio equipo. Cero datos enviados a terceros. El proveedor por defecto si valoras la privacidad absoluta.",
  requiresKey: false,
  local: true,
  defaultBaseUrl: OLLAMA_DEFAULT_BASE_URL,
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

// ── Helpers standalone para la UI (detectar / probar) ────────────────────────
// Aditivos: NO cambian el contrato Provider. Todos son defensivos y SSR-safe
// (sólo usan fetch/AbortController, que existen en el cliente y en tools).

/** Normaliza una baseUrl de Ollama (quita la barra final; cae al default). */
export function normalizeOllamaBaseUrl(baseUrl?: string): string {
  const raw = (baseUrl || OLLAMA_DEFAULT_BASE_URL).trim();
  return (raw || OLLAMA_DEFAULT_BASE_URL).replace(/\/$/, "");
}

/** Un modelo instalado en el servidor Ollama, con metadatos útiles. */
export interface OllamaModelInfo {
  /** Nombre completo (p.ej. "llama3.1:8b"). */
  name: string;
  /** Tamaño en bytes (si lo reporta el servidor). */
  size?: number;
  /** Familia del modelo (p.ej. "llama"), si está disponible. */
  family?: string;
  /** Número de parámetros (p.ej. "8B"), si está disponible. */
  parameterSize?: string;
  /** Nivel de cuantización (p.ej. "Q4_0"), si está disponible. */
  quantization?: string;
  /** Fecha de modificación ISO, si la reporta el servidor. */
  modifiedAt?: string;
}

/** Resultado de detectar modelos: nunca lanza. */
export interface OllamaProbeResult {
  ok: boolean;
  /** Modelos con metadatos (vacío si falló). */
  models: OllamaModelInfo[];
  /** Sólo los nombres (comodidad para poblar selects). */
  names: string[];
  /** Código HTTP si hubo respuesta. */
  status?: number;
  /** Milisegundos que tardó la sonda. */
  ms: number;
  /** Mensaje legible (es) explicando el resultado. */
  message: string;
  /** URL efectiva sondeada. */
  url: string;
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/**
 * Detecta los modelos instalados en un servidor Ollama vía GET {baseUrl}/api/tags.
 * Fetch DEFENSIVO con timeout (AbortController) y CORS. Nunca lanza: reporta el
 * fallo en el resultado con un mensaje honesto (CORS, servidor caído, URL mala).
 */
export async function probeOllamaModels(
  baseUrl?: string,
  timeoutMs = 6000,
): Promise<OllamaProbeResult> {
  const base = normalizeOllamaBaseUrl(baseUrl);
  const url = `${base}/api/tags`;
  const started = nowMs();
  const elapsed = () => Math.round(nowMs() - started);

  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => {
        try {
          controller.abort();
        } catch {
          /* noop */
        }
      }, timeoutMs)
    : null;

  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller?.signal,
      credentials: "omit",
      mode: "cors",
    });
    if (timer) clearTimeout(timer);
    if (!res.ok) {
      return {
        ok: false,
        models: [],
        names: [],
        status: res.status,
        ms: elapsed(),
        message: `Ollama respondió HTTP ${res.status}. Revisa la URL o que el servidor esté sano.`,
        url,
      };
    }
    const json = (await res.json().catch(() => null)) as
      | { models?: unknown }
      | null;
    const rawModels = Array.isArray(json?.models) ? (json!.models as unknown[]) : [];
    const models: OllamaModelInfo[] = rawModels
      .map((m): OllamaModelInfo | null => {
        if (!m || typeof m !== "object") return null;
        const r = m as Record<string, unknown>;
        const name = typeof r.name === "string" ? r.name : "";
        if (!name) return null;
        const details =
          r.details && typeof r.details === "object"
            ? (r.details as Record<string, unknown>)
            : {};
        return {
          name,
          size: typeof r.size === "number" ? r.size : undefined,
          modifiedAt:
            typeof r.modified_at === "string" ? r.modified_at : undefined,
          family:
            typeof details.family === "string" ? details.family : undefined,
          parameterSize:
            typeof details.parameter_size === "string"
              ? details.parameter_size
              : undefined,
          quantization:
            typeof details.quantization_level === "string"
              ? details.quantization_level
              : undefined,
        };
      })
      .filter((x): x is OllamaModelInfo => !!x);
    return {
      ok: true,
      models,
      names: models.map((m) => m.name),
      status: res.status,
      ms: elapsed(),
      message: models.length
        ? `Detectados ${models.length} modelo(s) en ${base}.`
        : `Conexión correcta, pero no hay modelos instalados. Usa \`ollama pull <modelo>\`.`,
      url,
    };
  } catch (e: unknown) {
    if (timer) clearTimeout(timer);
    const aborted = (e as { name?: string })?.name === "AbortError";
    return {
      ok: false,
      models: [],
      names: [],
      ms: elapsed(),
      message: aborted
        ? `Tiempo de espera agotado (${timeoutMs} ms). ¿Ollama está corriendo y accesible en ${base}?`
        : `No se pudo conectar con ${base}. Puede ser CORS, que Ollama no esté corriendo, o una URL incorrecta. (Arranca con OLLAMA_ORIGINS para permitir CORS.)`,
      url,
    };
  }
}

/**
 * Prueba la conexión con un servidor Ollama (GET /api/tags). Nunca lanza.
 * Alias semántico de `probeOllamaModels` centrado en conectividad.
 */
export async function testOllamaConnection(
  baseUrl?: string,
  timeoutMs = 6000,
): Promise<OllamaProbeResult> {
  return probeOllamaModels(baseUrl, timeoutMs);
}

/** Sólo los nombres de modelos instalados (comodidad). Nunca lanza. */
export async function listOllamaModels(baseUrl?: string): Promise<string[]> {
  const r = await probeOllamaModels(baseUrl);
  return r.names;
}

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
  // Reutiliza la sonda defensiva (timeout + CORS). Mantiene el contrato:
  // devuelve nombres o lanza si la conexión falla (para el toast de error).
  const r = await probeOllamaModels(config.baseUrl);
  if (!r.ok) throw new Error(r.message);
  return r.names;
}

export const ollamaProvider: Provider = { info, chat, listModels };
