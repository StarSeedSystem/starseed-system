"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * STARSEED · PRIMITIVA DE SUBAGENTES MULTI-MODELO (OpenRouter :free)
 * ---------------------------------------------------------------------------
 * Núcleo reutilizable que los 3 agentes principales (Astraura, Council, MoA)
 * usan para descomponer una tarea en N subagentes que se ejecutan EN PARALELO
 * contra DISTINTOS modelos GRATUITOS de OpenRouter (proxy comunitario
 * /api/ai/openrouter, que SOLO permite modelos :free → coste 0).
 *
 * Diseño:
 *   · NO introduce una segunda fuente de verdad: reusa el `chat()` existente
 *     pasándole un `providerOverride` que apunta al proxy del OS. Así hereda
 *     el manejo de streaming, abort, y errores del resto de la app.
 *   · Defensivo y SSR-safe: nunca lanza. Cada subagente degrada a ""
 *     (o al fallback) si falla, para que el orquestador siempre pueda
 *     sintetizar con lo que llegó.
 *   · Paralelismo real vía Promise.allSettled (no se bloquea por un modelo
 *     lento/caído).
 *   · Observabilidad: cada subagente declara QUÉ modelo :free respondió.
 *
 * Rotación de modelos: el proxy ya rota claves; aquí rotamos la LISTA de
 * modelos :free para repartirlos entre subagentes y no saturar uno solo.
 *
 * Adenda: "las 3 con múltiples agentes openrouter y más subagentes".
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { chat } from "@/ai/client/chat";
import type { ChatMessage, ChatResponse } from "@/ai/providers/types";

/** Endpoint del proxy comunitario de OpenRouter (solo :free). */
const OPENROUTER_FREE_PROXY = "/api/ai/openrouter";

/**
 * Modelos :free de OpenRouter conocidos (rotativos). El proxy los filtra por
 * `:free`, así que listamos varios para repartir la carga y diversificar
 * capacidades. Si el proxy devuelve 503 (sin clave compartida configurada),
 * el runner degrada con honestidad.
 */
export const OPENROUTER_FREE_MODELS: string[] = [
  "meta-llama/llama-3.1-8b-instruct:free",
  "google/gemma-2-9b-it:free",
  "microsoft/phi-3-mini-128k-instruct:free",
  "qwen/qwen2.5-7b-instruct:free",
  "deepseek/deepseek-chat-v3-0324:free",
  "meta-llama/llama-3.2-3b-instruct:free",
  "openchat/openchat-7b:free",
  "cognitivecomputations/dolphin3.0-mistral-24b:free",
];

/** Un subagente a ejecutar en paralelo. */
export interface SubAgentTask {
  /** Rol/identidad del subagente (va al system prompt). */
  role: string;
  /** Instrucción específica para este subagente. */
  instruction: string;
  /** Mensajes de contexto base (opcional, se preceden al instruction). */
  contextMessages?: ChatMessage[];
  /** Modelo :free a usar. Si se omite, se rota de OPENROUTER_FREE_MODELS. */
  model?: string;
  /** Temperatura (default 0.7). */
  temperature?: number;
  /** Tope de tokens de salida (default 1500). */
  maxTokens?: number;
  /** AbortSignal compartido. */
  signal?: AbortSignal;
}

/** Resultado de un subagente. */
export interface SubAgentResult {
  role: string;
  model: string;
  /** Texto producido ("" si falló). */
  text: string;
  /** true si el subagente produjo contenido útil. */
  ok: boolean;
  /** Razón de fallo (si ok=false). */
  error?: string;
  /** ms que tardó. */
  tookMs: number;
}

/** Construye el ChatMessage[] para un subagente. */
function buildMessages(task: SubAgentTask): ChatMessage[] {
  const base = task.contextMessages ? [...task.contextMessages] : [];
  return [
    ...base,
    { role: "system", content: task.role },
    { role: "user", content: task.instruction },
  ];
}

/**
 * Ejecuta UN subagente contra el proxy OpenRouter :free.
 * Nunca lanza: devuelve {ok:false, error} en fallo.
 */
export async function runSubAgent(task: SubAgentTask): Promise<SubAgentResult> {
  const model = task.model ?? OPENROUTER_FREE_MODELS[0];
  const started = Date.now();
  const messages = buildMessages(task);

  // Reusa chat() con providerOverride apuntando al proxy del OS. La clave NO
  // viaja al cliente: el proxy la inyecta en servidor.
  try {
    const res: ChatResponse = await chat({
      messages,
      providerOverride: {
        providerId: "openai-compatible",
        baseUrl: OPENROUTER_FREE_PROXY,
        model,
      },
      temperature: task.temperature ?? 0.7,
      maxTokens: task.maxTokens ?? 1500,
      signal: task.signal,
    });
    const text = res.text?.trim() ?? "";
    if (!text) {
      return {
        role: task.role,
        model,
        text: "",
        ok: false,
        error: "respuesta vacía",
        tookMs: Date.now() - started,
      };
    }
    return {
      role: task.role,
      model,
      text,
      ok: true,
      tookMs: Date.now() - started,
    };
  } catch (e) {
    const err = e instanceof Error ? e.message : "error desconocido";
    return {
      role: task.role,
      model,
      text: "",
      ok: false,
      error: err,
      tookMs: Date.now() - started,
    };
  }
}

/**
 * Ejecuta VARIOS subagentes EN PARALELO, rotando modelos :free para diversificar
 * y no saturar uno solo. Degrada con honestidad si el proxy no está configurado
 * (503) o algún modelo falla.
 *
 * Devuelve los resultados en el MISMO orden que `tasks`.
 */
export async function runSubAgents(tasks: SubAgentTask[]): Promise<SubAgentResult[]> {
  if (tasks.length === 0) return [];
  const scheduled = tasks.map((t, i) => ({
    ...t,
    // Rotación de modelo: respeta el modelo explícito, si no rota por índice.
    model: t.model ?? OPENROUTER_FREE_MODELS[i % OPENROUTER_FREE_MODELS.length],
  }));
  const settled = await Promise.allSettled(scheduled.map((t) => runSubAgent(t)));
  return settled.map((s, i) =>
    s.status === "fulfilled"
      ? s.value
      : {
          role: scheduled[i].role,
          model: scheduled[i].model ?? OPENROUTER_FREE_MODELS[0],
          text: "",
          ok: false,
          error: "rechazado (no resuelto)",
          tookMs: 0,
        },
  );
}

/**
 * Helper: ¿el proxy OpenRouter :free está disponible en este despliegue?
 * (Llamada barata: un modelo :free con un mensaje vacío; si 503 → no configurado.)
 * Útil para que los agentes decidan si ofrecen el modo multi-agente.
 */
export async function isOpenRouterFreeAvailable(signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await chat({
      messages: [{ role: "user", content: "ping" }],
      providerOverride: {
        providerId: "openai-compatible",
        baseUrl: OPENROUTER_FREE_PROXY,
        model: OPENROUTER_FREE_MODELS[0],
      },
      maxTokens: 1,
      signal,
    });
    return Boolean(res.text);
  } catch {
    return false;
  }
}
