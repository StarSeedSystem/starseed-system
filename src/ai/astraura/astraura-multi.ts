"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ASTRARURA · MODO MULTI-AGENTE (subagentes OpenRouter :free en paralelo)
 * ---------------------------------------------------------------------------
 * Capa ADITIVA sobre astrauraChat. Cuando el usuario activa
 * `IntelligenceSettings.multiAgent`, Aurora NO se queda con la primera
 * respuesta: la contrasta con VARIOS subagentes que corren EN PARALELO contra
 * modelos GRATUITOS distintos de OpenRouter (proxy /api/ai/openrouter, solo
 * :free → coste 0). Un "Chairman" sintetiza lo útil de cada uno.
 *
 * SAFETY CONTRACT (igual que MoA):
 *   · Si el proxy no está configurado o todos los subagentes fallan, devuelve
 *     el `primary` intacto (la respuesta que ya tenía astrauraChat). Nunca
 *     empeora lo que el usuario ya recibe.
 *   · No lanza jamás: errores aislados por subagente.
 *   · Respeta el AbortSignal.
 *
 * Esto materializa "las 3 con múltiples agentes openrouter y más subagentes
 * analizando los contextos": Astraura descompone (rol de contraste) y delega.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { ChatMessage, ChatResponse } from "@/ai/providers/types";
import { OPENROUTER_FREE_MODELS, runSubAgents, type SubAgentResult } from "@/lib/aurora/subagents";

export interface AstrauraMultiInput {
  /** Mensajes originales de la conversación. */
  messages: ChatMessage[];
  /** Respuesta principal ya producida por astrauraChat (la que se contrasta). */
  primary: ChatResponse;
  /** Señal de cancelación compartida. */
  signal?: AbortSignal;
  /** Nº de subagentes de contraste (default 3, máx 5). */
  workers?: number;
}

export interface AstrauraMultiResult {
  /** Texto final (sintetizado o, en fallo, el primary). */
  text: string;
  /** true si se pudo enriquecer con subagentes. */
  enriched: boolean;
  /** Desglose de qué modelo :free aportó qué (observabilidad). */
  contributors: { role: string; model: string; ok: boolean }[];
}

/** Rol de "crítico" que contrasta la respuesta principal. */
const CONTRAST_ROLES = [
  "Eres un crítico riguroso. Señala fallos, sesgos o datos incorrectos en la respuesta.",
  "Eres un experto en ampliar la respuesta con contexto, matices y ejemplos útiles.",
  "Eres un editor que la hace más clara, concisa y accionable para el usuario.",
  "Eres un defensor del método científico: pide fuentes, evita afirmaciones sin base.",
  "Eres un estratega: extrae los próximos pasos concretos que el usuario debería tomar.",
];

/**
 * Ejecuta el contraste multi-agente. Devuelve el primary sin tocar si no hay
 * mejora posible.
 */
export async function astrauraMultiContrast(
  input: AstrauraMultiInput,
): Promise<AstrauraMultiResult> {
  const workers = Math.max(1, Math.min(5, input.workers ?? 3));
  const primaryText = input.primary.text?.trim() ?? "";

  if (!primaryText) {
    return { text: "", enriched: false, contributors: [] };
  }

  // Último mensaje del usuario como base del contraste.
  const lastUser = [...input.messages].reverse().find((m) => m.role === "user");
  const userPrompt = lastUser?.content ?? "(sin contexto de usuario)";

  const tasks = Array.from({ length: workers }, (_, i) => ({
    role: CONTRAST_ROLES[i % CONTRAST_ROLES.length],
    instruction:
      `PREGUNTA DEL USUARIO:\n${userPrompt}\n\nRESPUESTA A CONTRASTAR:\n${primaryText}\n\n` +
      `Aporta tu mejora concreta en menos de 300 palabras. Si no hay nada que mejorar, di "OK".`,
    model: OPENROUTER_FREE_MODELS[i % OPENROUTER_FREE_MODELS.length],
    maxTokens: 400,
    signal: input.signal,
  }));

  let results: SubAgentResult[];
  try {
    results = await runSubAgents(tasks);
  } catch {
    return { text: primaryText, enriched: false, contributors: [] };
  }

  const useful = results.filter((r) => r.ok && !/^\s*OK\b/i.test(r.text));
  const contributors = results.map((r) => ({
    role: r.role,
    model: r.model,
    ok: r.ok,
  }));

  if (useful.length === 0) {
    // Ningún subagente aportó mejora → devolvemos el primary tal cual.
    return { text: primaryText, enriched: false, contributors };
  }

  // Síntesis Chairman: pegamos las aportaciones y las resumimos en un único
  // párrafo final (sin llamar a otro modelo para no duplicar coste/latencia).
  const synthesis =
    `${primaryText}\n\n` +
    `---\n` +
    `🔍 Contrastado por ${useful.length} agente(s) gratuito(s) de OpenRouter:\n` +
    useful
      .map((r, i) => `• [${r.model}] ${r.text.trim()}`)
      .join("\n");

  return { text: synthesis, enriched: true, contributors };
}
