"use client";

// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — CLIENTE NVIDIA NIM (API-catalog, compatible con OpenAI)
// ----------------------------------------------------------------------------
// NVIDIA NIM expone una API compatible con OpenAI en `build.nvidia.com`:
//   • Base:  https://integrate.api.nvidia.com/v1
//   • Auth:  Authorization: Bearer <NVIDIA_API_KEY>
//   • GET  /models            → lista de modelos disponibles.
//   • POST /chat/completions  → generación (chat) al estilo OpenAI.
//
// La API-catalog es GRATIS para prototipar con una cuenta del NVIDIA Developer
// Program (clave gratis en build.nvidia.com). Este cliente es DEFENSIVO: cada
// función tiene timeout, try/catch y NUNCA lanza — devuelve un resultado con
// `ok:false` y un mensaje honesto (CORS, clave inválida, servicio caído).
//
// Sigue el patrón del provider Ollama (`src/ai/providers/ollama.ts`): sonda
// HTTP con AbortController, SSR-safe (sólo usa fetch/AbortController, presentes
// en cliente y en tools). No añade dependencias.
// ════════════════════════════════════════════════════════════════════════════

/** Base por defecto de la API-catalog de NVIDIA NIM (compatible con OpenAI). */
export const NIM_DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";

/** Documentación pública de la API-catalog. */
export const NIM_DOCS_URL = "https://docs.api.nvidia.com/nim/reference/llm-apis";

/** Portal para conseguir la clave gratis (Developer Program). */
export const NIM_BUILD_URL = "https://build.nvidia.com";

// ── Normalización de la baseUrl ──────────────────────────────────────────────

/**
 * Normaliza una baseUrl de NIM: recorta espacios y barra final; cae al default.
 * Acepta que el usuario pegue la URL con o sin `/v1`.
 */
export function normalizeNimBaseUrl(baseUrl?: string): string {
  const raw = (baseUrl || NIM_DEFAULT_BASE_URL).trim();
  const cleaned = (raw || NIM_DEFAULT_BASE_URL).replace(/\/+$/, "");
  return cleaned || NIM_DEFAULT_BASE_URL;
}

// ── Tipos ────────────────────────────────────────────────────────────────────

/** Un modelo devuelto por GET /models (esquema OpenAI `{ data: [...] }`). */
export interface NimModelInfo {
  /** Id del modelo (p.ej. "meta/llama-3.1-70b-instruct"). */
  id: string;
  /** Propietario/publisher, si lo reporta la API (p.ej. "meta", "nvidia"). */
  ownedBy?: string;
  /** Epoch de creación, si está disponible. */
  created?: number;
  /** Objeto tal cual lo reporta la API (para depurar). */
  object?: string;
}

/** Resultado de listar modelos: nunca lanza. */
export interface NimListModelsResult {
  ok: boolean;
  /** Modelos detectados (vacío si falló). */
  models: NimModelInfo[];
  /** Sólo los ids (comodidad para poblar selects). */
  ids: string[];
  /** Código HTTP si hubo respuesta. */
  status?: number;
  /** Milisegundos que tardó la sonda. */
  ms: number;
  /** Mensaje legible (es). */
  message: string;
  /** URL efectiva sondeada. */
  url: string;
}

/** Resultado de una prueba de conectividad. */
export interface NimTestResult {
  ok: boolean;
  status?: number;
  ms: number;
  message: string;
  /** Nº de modelos vistos (si la lista respondió). */
  modelCount?: number;
}

/** Un mensaje de chat (esquema OpenAI). */
export interface NimChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Opciones de una llamada a /chat/completions. */
export interface NimChatOptions {
  /** Id del modelo NIM (p.ej. "meta/llama-3.1-70b-instruct"). */
  model: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  /** AbortSignal externo para cancelar. */
  signal?: AbortSignal;
  /** Timeout propio en ms (si no se pasa signal). */
  timeoutMs?: number;
}

/** Resultado de una generación de chat: nunca lanza. */
export interface NimChatResult {
  ok: boolean;
  /** Texto de la respuesta (vacío si falló). */
  text: string;
  status?: number;
  ms: number;
  message: string;
  /** Respuesta cruda (para depurar). */
  raw?: unknown;
  usage?: { inputTokens?: number; outputTokens?: number };
}

// ── Utilidades internas ──────────────────────────────────────────────────────

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** Cabeceras estándar para NIM (Bearer + JSON). */
function nimHeaders(apiKey?: string, json = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (apiKey && apiKey.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;
  if (json) headers["Content-Type"] = "application/json";
  headers.Accept = "application/json";
  return headers;
}

/**
 * Crea un AbortController que se dispara a los `timeoutMs`, encadenado a un
 * signal externo si se pasa. Devuelve `{ signal, cancel }`.
 */
function withTimeout(
  timeoutMs: number,
  external?: AbortSignal,
): { signal: AbortSignal | undefined; cancel: () => void } {
  if (typeof AbortController === "undefined") {
    return { signal: external, cancel: () => {} };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => {
    try {
      controller.abort();
    } catch {
      /* noop */
    }
  }, timeoutMs);
  if (external) {
    if (external.aborted) {
      try {
        controller.abort();
      } catch {
        /* noop */
      }
    } else {
      external.addEventListener(
        "abort",
        () => {
          try {
            controller.abort();
          } catch {
            /* noop */
          }
        },
        { once: true },
      );
    }
  }
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timer),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// listModels — GET {baseUrl}/models (Bearer). Nunca lanza.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Lista los modelos disponibles en la API-catalog de NVIDIA NIM.
 * GET {baseUrl}/models con `Authorization: Bearer <apiKey>`.
 *
 * Fetch DEFENSIVO con timeout (AbortController) y CORS. Nunca lanza: reporta el
 * fallo en el resultado con un mensaje honesto (clave inválida, CORS, red).
 *
 * @param apiKey  Clave del NVIDIA Developer Program (gratis para prototipar).
 * @param baseUrl Base opcional (por defecto `integrate.api.nvidia.com/v1`).
 */
export async function listModels(
  apiKey?: string,
  baseUrl: string = NIM_DEFAULT_BASE_URL,
  timeoutMs = 8000,
): Promise<NimListModelsResult> {
  const base = normalizeNimBaseUrl(baseUrl);
  const url = `${base}/models`;
  const started = nowMs();
  const elapsed = () => Math.round(nowMs() - started);

  if (typeof fetch === "undefined") {
    return {
      ok: false,
      models: [],
      ids: [],
      ms: elapsed(),
      message: "fetch no disponible en este entorno.",
      url,
    };
  }

  const { signal, cancel } = withTimeout(timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: nimHeaders(apiKey),
      signal,
      credentials: "omit",
      mode: "cors",
    });
    cancel();
    if (!res.ok) {
      return {
        ok: false,
        models: [],
        ids: [],
        status: res.status,
        ms: elapsed(),
        message:
          res.status === 401 || res.status === 403
            ? `Clave rechazada (HTTP ${res.status}). Revisa tu NVIDIA_API_KEY del Developer Program.`
            : `NVIDIA respondió HTTP ${res.status}. Revisa la URL base o la clave.`,
        url,
      };
    }
    const json = (await res.json().catch(() => null)) as
      | { data?: unknown }
      | null;
    const rawModels = Array.isArray(json?.data) ? (json!.data as unknown[]) : [];
    const models: NimModelInfo[] = rawModels
      .map((m): NimModelInfo | null => {
        if (!m || typeof m !== "object") return null;
        const r = m as Record<string, unknown>;
        const id = typeof r.id === "string" ? r.id : "";
        if (!id) return null;
        return {
          id,
          ownedBy: typeof r.owned_by === "string" ? r.owned_by : undefined,
          created: typeof r.created === "number" ? r.created : undefined,
          object: typeof r.object === "string" ? r.object : undefined,
        };
      })
      .filter((x): x is NimModelInfo => !!x)
      .sort((a, b) => a.id.localeCompare(b.id));
    return {
      ok: true,
      models,
      ids: models.map((m) => m.id),
      status: res.status,
      ms: elapsed(),
      message: models.length
        ? `Detectados ${models.length} modelo(s) en la API-catalog de NVIDIA.`
        : "Conexión correcta, pero la lista de modelos vino vacía.",
      url,
    };
  } catch (e: unknown) {
    cancel();
    const aborted = (e as { name?: string })?.name === "AbortError";
    return {
      ok: false,
      models: [],
      ids: [],
      ms: elapsed(),
      message: aborted
        ? `Tiempo de espera agotado (${timeoutMs} ms). ¿Hay red y la clave es válida?`
        : "No se pudo conectar con NVIDIA. Puede ser CORS (llama desde el servidor si hace falta), red, o una URL/clave incorrecta.",
      url,
    };
  }
}

// ════════════════════════════════════════════════════════════════════════════
// testNim — sonda de conectividad rápida. Nunca lanza.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Prueba la conexión con la API-catalog de NVIDIA NIM haciendo un GET /models.
 * Es un alias semántico de `listModels` centrado en "¿funciona la clave?".
 * Nunca lanza.
 */
export async function testNim(
  apiKey?: string,
  baseUrl: string = NIM_DEFAULT_BASE_URL,
  timeoutMs = 8000,
): Promise<NimTestResult> {
  if (!apiKey || !apiKey.trim()) {
    return {
      ok: false,
      ms: 0,
      message:
        "Falta la clave. Consigue una gratis en build.nvidia.com (NVIDIA Developer Program) y pégala aquí.",
    };
  }
  const r = await listModels(apiKey, baseUrl, timeoutMs);
  return {
    ok: r.ok,
    status: r.status,
    ms: r.ms,
    modelCount: r.models.length,
    message: r.ok
      ? `Conexión correcta con NVIDIA NIM (${r.models.length} modelo(s) visibles).`
      : r.message,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// chatCompletion — POST {baseUrl}/chat/completions (opcional). Nunca lanza.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Llama a /chat/completions al estilo OpenAI contra NVIDIA NIM. Opcional: sólo
 * lo usan las tools que quieran generar texto con un modelo NIM. Defensivo con
 * timeout; NUNCA lanza (devuelve `ok:false` y mensaje ante cualquier fallo).
 *
 * No soporta streaming aquí (petición simple `stream:false`) para mantener el
 * cliente ligero y SSR-safe; el streaming vive en la capa de providers.
 */
export async function chatCompletion(
  apiKey: string,
  messages: NimChatMessage[],
  options: NimChatOptions,
  baseUrl: string = NIM_DEFAULT_BASE_URL,
): Promise<NimChatResult> {
  const base = normalizeNimBaseUrl(baseUrl);
  const url = `${base}/chat/completions`;
  const started = nowMs();
  const elapsed = () => Math.round(nowMs() - started);

  if (!apiKey || !apiKey.trim()) {
    return {
      ok: false,
      text: "",
      ms: elapsed(),
      message: "Falta la clave de NVIDIA (Bearer). Consíguela gratis en build.nvidia.com.",
    };
  }
  if (!options?.model) {
    return {
      ok: false,
      text: "",
      ms: elapsed(),
      message: "Falta el id del modelo (p.ej. 'meta/llama-3.1-70b-instruct').",
    };
  }
  if (typeof fetch === "undefined") {
    return { ok: false, text: "", ms: elapsed(), message: "fetch no disponible." };
  }

  const { signal, cancel } = withTimeout(options.timeoutMs ?? 45000, options.signal);
  const body: Record<string, unknown> = {
    model: options.model,
    messages,
    stream: false,
  };
  if (typeof options.temperature === "number") body.temperature = options.temperature;
  if (typeof options.maxTokens === "number") body.max_tokens = options.maxTokens;
  if (typeof options.topP === "number") body.top_p = options.topP;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: nimHeaders(apiKey, true),
      body: JSON.stringify(body),
      signal,
      credentials: "omit",
      mode: "cors",
    });
    cancel();
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        text: "",
        status: res.status,
        ms: elapsed(),
        message:
          res.status === 401 || res.status === 403
            ? `Clave rechazada (HTTP ${res.status}).`
            : `NVIDIA respondió HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}.`,
      };
    }
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    const choices = Array.isArray(json?.choices) ? (json!.choices as unknown[]) : [];
    const first = choices[0] as Record<string, unknown> | undefined;
    const msg = first?.message as Record<string, unknown> | undefined;
    const content = typeof msg?.content === "string" ? msg.content : "";
    const usage = json?.usage as Record<string, unknown> | undefined;
    return {
      ok: true,
      text: content,
      status: res.status,
      ms: elapsed(),
      message: "Generación correcta.",
      raw: json,
      usage: {
        inputTokens:
          typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : undefined,
        outputTokens:
          typeof usage?.completion_tokens === "number"
            ? usage.completion_tokens
            : undefined,
      },
    };
  } catch (e: unknown) {
    cancel();
    const aborted = (e as { name?: string })?.name === "AbortError";
    return {
      ok: false,
      text: "",
      ms: elapsed(),
      message: aborted
        ? "Tiempo de espera agotado. La generación tardó demasiado o se canceló."
        : "No se pudo conectar con NVIDIA para generar. Revisa red, CORS, clave y modelo.",
    };
  }
}

/** Sólo los ids de modelos (comodidad). Nunca lanza. */
export async function listModelIds(
  apiKey?: string,
  baseUrl: string = NIM_DEFAULT_BASE_URL,
): Promise<string[]> {
  const r = await listModels(apiKey, baseUrl);
  return r.ids;
}
