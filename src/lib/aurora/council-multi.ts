"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * COUNCIL · MODO MULTI-AGENTE (subagentes OpenRouter :free por perspectiva)
 * ---------------------------------------------------------------------------
 * Extiende el Consejo de Aurora (council.ts, patrón llm-council de 3 etapas)
 * para que CADA PERSPECTIVA/ consejero se ejecute en un modelo GRATUITO
 * distinto de OpenRouter (proxy /api/ai/openrouter, solo :free → coste 0).
 *
 * Etapas:
 *   1) OPINIONES  → cada perspectiva StarSeed corre como subagente :free (en
 *      paralelo) sobre la propuesta.
 *   2) REVISIÓN  → subagentes "revisores" (también :free, distinto modelo)
 *      leen las opiniones ANONIMIZADAS y las evalúan/ordenan sin saber cuál es
 *      suya (evita favoritismo propio).
 *   3) SÍNTESIS  → Chairman (puede ser astrauraChat o un :free) une todo,
 *      citando el fundamento de cada dictamen.
 *
 * SAFETY CONTRACT:
 *   · Si el proxy no está configurado o fallan las opiniones, degrada al
 *     Consejo clásico (ya defensivo). Nunca lanza.
 *   · Cada subagente degrada a "" si falla, y la síntesis trabaja con lo útil.
 *
 * "las 3 con múltiples agentes openrouter y más subagentes analizando los
 * contextos": el Consejo ES la instancia multi-agente; esto la hace real con
 * modelos :free diversos y revisores subagentes.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { OPENROUTER_FREE_MODELS, runSubAgents, type SubAgentResult } from "@/lib/aurora/subagents";

/** Perspectiva StarSeed que el Consejo delibera (de council.ts). */
export interface CouncilPerspectiveLite {
  id: string;
  label: string;
  system: string;
}

/** Opinión producida por un subagente-consejero. */
export interface CouncilOpinionLite {
  perspectiveId: string;
  label: string;
  model: string;
  text: string;
  ok: boolean;
}

/**
 * ETAPA 1 — opiniones en paralelo, una perspectiva por subagente (modelo :free
 * rotativo para diversificar). Devuelve las opiniones útiles.
 */
export async function councilStage1Opinions(
  proposal: string,
  perspectives: CouncilPerspectiveLite[],
  signal?: AbortSignal,
): Promise<CouncilOpinionLite[]> {
  if (perspectives.length === 0) return [];
  const tasks = perspectives.map((p, i) => ({
    role: `${p.label}\n\n${p.system}`,
    instruction:
      `Dictamina sobre esta propuesta de la red StarSeed DESDE TU fundamento ` +
      `(y solo el tuyo), en menos de 220 palabras. Cita el principio en que te apoyas.\n\nPROPUESTA:\n${proposal}`,
    model: OPENROUTER_FREE_MODELS[i % OPENROUTER_FREE_MODELS.length],
    maxTokens: 350,
    signal,
  }));

  let results: SubAgentResult[];
  try {
    results = await runSubAgents(tasks);
  } catch {
    return [];
  }

  return results.map((r, i) => ({
    perspectiveId: perspectives[i].id,
    label: perspectives[i].label,
    model: r.model,
    text: r.ok ? r.text : "",
    ok: r.ok,
  }));
}

/**
 * ETAPA 2 — revisores subagentes :free que evalúan opiniones ANONIMIZADAS.
 * No saben de quién es cada una → sin favoritismo propio.
 */
export async function councilStage2Review(
  opinions: CouncilOpinionLite[],
  signal?: AbortSignal,
): Promise<string> {
  const useful = opinions.filter((o) => o.ok && o.text.trim());
  if (useful.length === 0) return "";

  const anon = useful
    .map((o, i) => `Opinión #${i + 1}:\n${o.text}`)
    .join("\n\n---\n\n");

  const tasks = Array.from({ length: Math.min(2, useful.length) }, (_, i) => ({
    role:
      "Eres un revisor imparcial del Consejo StarSeed. No sabes quién escribió " +
      "cada opinión. Evalúa su solidez, coherencia con los principios y utilidad, " +
      "y ORDÉNALAS de mejor a peor con una justificación breve.",
    instruction: `Opiniones a revisar (anonimizadas):\n\n${anon}\n\nDa el ranking y por qué. Máx 250 palabras.`,
    model: OPENROUTER_FREE_MODELS[(i + 3) % OPENROUTER_FREE_MODELS.length],
    maxTokens: 350,
    signal,
  }));

  let results: SubAgentResult[];
  try {
    results = await runSubAgents(tasks);
  } catch {
    return "";
  }
  return results.filter((r) => r.ok).map((r) => r.text).join("\n\n");
}

/**
 * ETAPA 3 — síntesis unida (Chairman local, sin llamar a más modelos para no
 * duplicar latencia). Une opiniones + revisión en un informe legible.
 */
export function councilStage3Synthesis(
  opinions: CouncilOpinionLite[],
  review: string,
): string {
  const body = opinions
    .filter((o) => o.ok)
    .map((o) => `### ${o.label}  ·  [modelo :free: ${o.model}]\n${o.text}`)
    .join("\n\n");
  const rev = review ? `\n\n## Revisión cruzada (subagentes)\n${review}` : "";
  return `${body}${rev}`;
}
