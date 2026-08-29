// ════════════════════════════════════════════════════════════════
// Bonsai Integration · Motor de Inferencia 1-bit & Ternary (1.58-bit)
// ----------------------------------------------------------------
// Integración del sistema Bonsai / Ternary-Bonsai (PrismML) con
// aceleración nativa por GPU Metal en Apple Silicon (macOS),
// CUDA / Vulkan en Linux/Windows, y CPU.
//
// Capacidades clave:
//   • Ternary-Bonsai (1.7B, 4B, 8B, 27B): pesos ternarios {-1,0,1} en Q2_0 / PQ2_0.
//   • Aceleración Metal completa: offload a GPU Apple Silicon (-ngl 99) superando
//     el cuello de botella CPU-only de BitNet i2_s.
//   • Visión multimodal (VLM 27B): soporte de proyector multimodal (mmproj) para
//     imágenes, capturas de pantalla del OS, diagramas y PDFs.
//   • Tool Calling nativo estilo OpenAI: tool_calls estructurados con round-trips.
//   • Presupuesto de razonamiento (thinking/reasoning budget).
//   • Contexto largo de hasta 256k tokens con Flash Attention y KV Cache Q4_0.
// ════════════════════════════════════════════════════════════════

import type { IntegrationResult } from "@/lib/integrations/types";

export interface BonsaiConfig {
  /** Endpoint del servidor llama-server / MLX (por defecto http://127.0.0.1:8080) */
  endpoint?: string;
  /** Familia de modelo: "ternary" (Q2_0 / PQ2_0, default) o "bonsai" (1-bit, Q1_0) */
  family?: "ternary" | "bonsai";
  /** Tamaño del modelo: "1.7B" | "4B" | "8B" | "27B" */
  modelSize?: "1.7B" | "4B" | "8B" | "27B";
  /** Activar aceleración por GPU Metal / CUDA (-ngl 99) */
  gpuOffload?: boolean;
  /** Activar proyector multimodal de visión si está disponible (27B) */
  enableVision?: boolean;
  /** Activar decodificación especulativa (DSpark) */
  speculative?: boolean;
  /** Activar KV cache en Q4_0 para contextos ultra-largos */
  kv4Cache?: boolean;
  /** Presupuesto de tokens de razonamiento (-1 = ilimitado, 0 = desactivado) */
  reasoningBudget?: number;
  /** Timeout en ms */
  timeoutMs?: number;
}

export interface BonsaiModelInfo {
  id: string;
  name: string;
  family: "ternary" | "bonsai";
  size: "1.7B" | "4B" | "8B" | "27B";
  bitsPerWeight: number;
  hasVision: boolean;
  hasToolCalling: boolean;
  contextLength: number;
  recommendedGpuLayers: number;
  hfRepo: string;
}

export const BONSAI_MODELS: BonsaiModelInfo[] = [
  {
    id: "ternary-27b-vlm",
    name: "Ternary-Bonsai 27B (VLM + Tools)",
    family: "ternary",
    size: "27B",
    bitsPerWeight: 1.7,
    hasVision: true,
    hasToolCalling: true,
    contextLength: 262144,
    recommendedGpuLayers: 99,
    hfRepo: "prism-ml/Ternary-Bonsai-27B-gguf",
  },
  {
    id: "ternary-8b",
    name: "Ternary-Bonsai 8B (Deep Reasoning)",
    family: "ternary",
    size: "8B",
    bitsPerWeight: 1.7,
    hasVision: false,
    hasToolCalling: true,
    contextLength: 262144,
    recommendedGpuLayers: 99,
    hfRepo: "prism-ml/Ternary-Bonsai-8B-gguf",
  },
  {
    id: "ternary-4b",
    name: "Ternary-Bonsai 4B (Code & Fast Agent)",
    family: "ternary",
    size: "4B",
    bitsPerWeight: 1.7,
    hasVision: false,
    hasToolCalling: true,
    contextLength: 65536,
    recommendedGpuLayers: 99,
    hfRepo: "prism-ml/Ternary-Bonsai-4B-gguf",
  },
  {
    id: "ternary-1.7b",
    name: "Ternary-Bonsai 1.7B (Real-Time Voice & Edge)",
    family: "ternary",
    size: "1.7B",
    bitsPerWeight: 1.7,
    hasVision: false,
    hasToolCalling: true,
    contextLength: 32768,
    recommendedGpuLayers: 99,
    hfRepo: "prism-ml/Ternary-Bonsai-1.7B-gguf",
  },
  {
    id: "bonsai-1bit-27b",
    name: "Bonsai 27B (1-Bit VLM)",
    family: "bonsai",
    size: "27B",
    bitsPerWeight: 1.125,
    hasVision: true,
    hasToolCalling: true,
    contextLength: 262144,
    recommendedGpuLayers: 99,
    hfRepo: "prism-ml/Bonsai-27B-gguf",
  },
  {
    id: "bonsai-1bit-8b",
    name: "Bonsai 8B (1-Bit Lightweight)",
    family: "bonsai",
    size: "8B",
    bitsPerWeight: 1.125,
    hasVision: false,
    hasToolCalling: true,
    contextLength: 131072,
    recommendedGpuLayers: 99,
    hfRepo: "prism-ml/Bonsai-8B-gguf",
  },
];

function getBase(config?: BonsaiConfig): string {
  return (config?.endpoint || "http://127.0.0.1:8080").replace(/\/+$/, "");
}

/** Health check del servidor Bonsai (OpenAI-compatible /health) */
export async function healthCheck(config?: BonsaiConfig): Promise<IntegrationResult> {
  const base = getBase(config);
  const timeoutMs = config?.timeoutMs || 5000;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${base}/health`, { signal: ctrl.signal });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json().catch(() => ({ status: "ok" }));
      return {
        ok: true,
        data: {
          status: "ready",
          endpoint: base,
          backend: "bonsai-llama-server",
          serverData: data,
        },
      };
    }
    if (res.status === 503) {
      return {
        ok: true,
        data: {
          status: "loading_model",
          endpoint: base,
          note: "El servidor Bonsai está cargando el modelo 1-bit / Ternary.",
        },
      };
    }
    return { ok: false, error: `Servidor Bonsai devolvió HTTP ${res.status}` };
  } catch (err) {
    return {
      ok: false,
      error: `No se pudo conectar con el servidor Bonsai en ${base}: ${(err as Error)?.message || "desconectado"}`,
    };
  }
}

/** Obtener estado y telemetría del motor Bonsai */
export async function getStatus(config?: BonsaiConfig): Promise<IntegrationResult> {
  const base = getBase(config);
  const timeoutMs = config?.timeoutMs || 8000;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const [healthRes, modelsRes, propsRes] = await Promise.allSettled([
      fetch(`${base}/health`, { signal: ctrl.signal }),
      fetch(`${base}/v1/models`, { signal: ctrl.signal }),
      fetch(`${base}/props`, { signal: ctrl.signal }),
    ]);
    clearTimeout(timer);

    const isHealthy = healthRes.status === "fulfilled" && healthRes.value.ok;
    const modelsData = modelsRes.status === "fulfilled" && modelsRes.value.ok ? await modelsRes.value.json().catch(() => null) : null;
    const propsData = propsRes.status === "fulfilled" && propsRes.value.ok ? await propsRes.value.json().catch(() => null) : null;

    return {
      ok: isHealthy || modelsData !== null,
      data: {
        endpoint: base,
        online: isHealthy,
        activeModel: modelsData?.data?.[0]?.id || "Ternary-Bonsai-27B",
        models: modelsData?.data || [],
        hardware: {
          gpuOffload: config?.gpuOffload ?? true,
          metalSupported: true,
          quantFormat: config?.family === "bonsai" ? "Q1_0 (1-bit)" : "Q2_0 / PQ2_0 (Ternary)",
        },
        properties: propsData || {},
        supportedCatalog: BONSAI_MODELS,
      },
    };
  } catch (err) {
    return { ok: false, error: `Error al consultar estado de Bonsai: ${(err as Error)?.message}` };
  }
}

/** Inferencia de chat OpenAI-compatible con tool calling nativo */
export async function chatCompletion(
  config: BonsaiConfig | undefined,
  params: {
    messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }>;
    tools?: Array<{ type: "function"; function: { name: string; description?: string; parameters?: Record<string, unknown> } }>;
    temperature?: number;
    max_tokens?: number;
    reasoning_budget?: number;
  }
): Promise<IntegrationResult> {
  const base = getBase(config);
  const timeoutMs = config?.timeoutMs || 120_000;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);

    const payload: Record<string, unknown> = {
      messages: params.messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.max_tokens ?? 2048,
      stream: false,
    };

    if (params.tools && params.tools.length > 0) {
      payload.tools = params.tools;
    }

    if (typeof params.reasoning_budget === "number") {
      payload.reasoning_budget = params.reasoning_budget;
    }

    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { ok: false, error: `Bonsai chat error HTTP ${res.status}: ${errText}` };
    }

    const data = await res.json();
    const choice = data.choices?.[0];
    const content = choice?.message?.content || "";
    const toolCalls = choice?.message?.tool_calls || null;

    return {
      ok: true,
      data: {
        text: content,
        toolCalls,
        finishReason: choice?.finish_reason || "stop",
        usage: data.usage || null,
        source: "astraura-bonsai",
      },
    };
  } catch (err) {
    return { ok: false, error: `Error en Bonsai chat: ${(err as Error)?.message}` };
  }
}

/** Consulta de visión multimodal (VLM) con imágenes del OS */
export async function visionQuery(
  config: BonsaiConfig | undefined,
  params: {
    prompt: string;
    images: string[]; // URLs o Data URLs base64
    systemPrompt?: string;
    maxTokens?: number;
  }
): Promise<IntegrationResult> {
  const base = getBase(config);
  const timeoutMs = config?.timeoutMs || 150_000;

  try {
    const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
      { type: "text", text: params.prompt },
    ];

    for (const img of params.images) {
      contentParts.push({
        type: "image_url",
        image_url: { url: img },
      });
    }

    const messages: Array<{ role: string; content: string | typeof contentParts }> = [];
    if (params.systemPrompt) {
      messages.push({ role: "system", content: params.systemPrompt });
    }
    messages.push({ role: "user", content: contentParts });

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);

    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        max_tokens: params.maxTokens || 1500,
        temperature: 0.7,
        stream: false,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { ok: false, error: `Bonsai vision error HTTP ${res.status}: ${errText}` };
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "";

    return {
      ok: true,
      data: {
        description: content,
        imagesProcessed: params.images.length,
        model: "Ternary-Bonsai-27B-VLM",
        source: "astraura-bonsai-vision",
      },
    };
  } catch (err) {
    return { ok: false, error: `Error en Bonsai vision: ${(err as Error)?.message}` };
  }
}

/** Listar modelos de la familia Bonsai */
export function listModels(): IntegrationResult {
  return {
    ok: true,
    data: {
      models: BONSAI_MODELS,
      defaultFamily: "ternary",
      defaultSize: "27B",
      architectureSummary: {
        bitsPerWeight: "1.125 - 1.7 bits (1-bit / Ternary {-1,0,1})",
        hardwareSupport: "Apple Silicon Metal (-ngl 99), CUDA 12+, Vulkan, CPU",
        multimodal: "Ternary-Bonsai-27B (mmproj projector)",
        toolCalling: "Native OpenAI tool_calls + MCP bridge",
        context: "Hasta 262,144 tokens con Flash Attention + KV4",
      },
    },
  };
}

/** Benchmark rápido de latencia y throughput 1.58-bit */
export async function runBenchmark(
  config?: BonsaiConfig,
  params?: { prompt?: string; tokens?: number }
): Promise<IntegrationResult> {
  const base = getBase(config);
  const prompt = params?.prompt || "Explica la arquitectura ternaria 1.58-bit en tres puntos concisos.";
  const maxTokens = params?.tokens || 100;
  const startTime = Date.now();

  try {
    const chatRes = await chatCompletion(config, {
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.5,
    });

    const elapsedMs = Date.now() - startTime;
    if (!chatRes.ok) return chatRes;

    const text = (chatRes.data as { text?: string })?.text || "";
    const words = text.split(/\s+/).filter(Boolean).length;
    const estTokens = Math.round(text.length / 3.5);
    const tokensPerSec = elapsedMs > 0 ? Number(((estTokens / elapsedMs) * 1000).toFixed(1)) : 0;

    return {
      ok: true,
      data: {
        model: "Ternary-Bonsai",
        elapsedMs,
        tokensGenerated: estTokens,
        wordsGenerated: words,
        tokensPerSecond: tokensPerSec,
        sampleOutput: text.slice(0, 200),
      },
    };
  } catch (err) {
    return { ok: false, error: `Fallo al ejecutar benchmark Bonsai: ${(err as Error)?.message}` };
  }
}
