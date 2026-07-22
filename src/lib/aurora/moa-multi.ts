"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MoA · MODO MULTI-AGENTE (capas OpenRouter :free + crew de subagentes)
 * ---------------------------------------------------------------------------
 * Extiende runtime.ts (Mixture-of-Agents: single/router/moa/crew) para que en
 * modos `moa`/`crew` use VARIOS modelos GRATUITOS de OpenRouter (proxy
 * /api/ai/openrouter, solo :free → coste 0) por capa, en PARALELO real
 * (Promise.all / allSettled), y en `crew` descomponga la tarea en subagentes
 * con roles especializados.
 *
 * Mantiene el SAFETY CONTRACT del MoA original: si falla, degrada a la
 * respuesta single (chat() de siempre). Nunca lanza.
 *
 * "las 3 con múltiples agentes openrouter y más subagentes": MoA es la capa de
 * orquestación pura; esto la alimenta con modelos :free diversos y crew de
 * subagentes, sin coste.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { ChatMessage, ChatResponse } from "@/ai/providers/types";
import { OPENROUTER_FREE_MODELS, runSubAgents, type SubAgentResult } from "@/lib/aurora/subagents";

export interface MoaMultiInput {
  messages: ChatMessage[];
  /** Capas de mezcla (default 2). */
  layers?: number;
  /** Subagentes por capa (default 3, máx 5). */
  perLayer?: number;
  /** Modo crew: descompone en subagentes con roles. */
  crew?: boolean;
  signal?: AbortSignal;
}

export interface MoaMultiResult {
  text: string;
  enriched: boolean;
  layers: { layer: number; contributors: { model: string; ok: boolean }[] }[];
}

/** Roles para el modo crew (descomposición de tarea en subagentes). */
const CREW_ROLES = [
  "Eres el PLANIFICADOR: desglosa el problema en pasos y prioridades.",
  "Eres el ANALISTA: identifica riesgos, supuestos y dependencias.",
  "Eres el EJECUTOR: produce la solución concreta y accionable.",
  "Eres el REVISOR DE CALIDAD: valida coherencia, completitud y claridad.",
  "Eres el SÍNTESIS: unifica lo anterior en la mejor respuesta final.",
];

/**
 * Ejecuta UNA capa MoA: N subagentes :free en paralelo sobre los mensajes.
 * Devuelve los textos útiles.
 */
async function runMoaLayer(
  messages: ChatMessage[],
  perLayer: number,
  layerSeed: number,
  crew: boolean,
  signal?: AbortSignal,
): Promise<{ texts: string[]; results: SubAgentResult[] }> {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const prompt = lastUser?.content ?? "";
  const others = messages.filter((m) => m !== lastUser);

  const tasks = Array.from({ length: perLayer }, (_, i) => {
    const idx = (layerSeed + i) % OPENROUTER_FREE_MODELS.length;
    const role = crew
      ? CREW_ROLES[i % CREW_ROLES.length]
      : "Colabora en una mezcla de agentes: responde la petición desde tu punto de vista, en menos de 250 palabras.";
    return {
      role,
      contextMessages: others.length ? others : undefined,
      instruction:
        (crew ? "" : "Petición a resolver en equipo:\n") +
        `${prompt}\n\nAporta tu respuesta parcial; otra instancia la integrará.`,
      model: OPENROUTER_FREE_MODELS[idx],
      maxTokens: 350,
      signal,
    };
  });

  let results: SubAgentResult[];
  try {
    results = await runSubAgents(tasks);
  } catch {
    results = [];
  }
  const texts = results.filter((r) => r.ok).map((r) => r.text.trim());
  return { texts, results };
}

/**
 * Orquesta el MoA multi-agente. Degrada a enriched:false si no hay aportes.
 * El texto final es la unión de las mejores aportaciones de la última capa.
 */
export async function moaMulti(input: MoaMultiInput): Promise<MoaMultiResult> {
  const layers = Math.max(1, Math.min(4, input.layers ?? 2));
  const perLayer = Math.max(1, Math.min(5, input.perLayer ?? 3));
  const crew = input.crew ?? false;

  const layerReports: MoaMultiResult["layers"] = [];
  let lastTexts: string[] = [];

  for (let L = 0; L < layers; L++) {
    const { texts, results } = await runMoaLayer(
      input.messages,
      perLayer,
      L * perLayer,
      crew,
      input.signal,
    );
    layerReports.push({
      layer: L + 1,
      contributors: results.map((r) => ({ model: r.model, ok: r.ok })),
    });
    if (texts.length > 0) lastTexts = texts;
  }

  if (lastTexts.length === 0) {
    return { text: "", enriched: false, layers: layerReports };
  }

  // Síntesis final: unimos las aportaciones de la última capa (sin llamar a otro
  // modelo para no duplicar latencia/coste).
  const text =
    `${lastTexts.join("\n\n---\n\n")}\n\n` +
    `🧩 Sintetizado por MoA multi-agente (${perLayer} modelos :free × ${layers} capa(s)).`;
  return { text, enriched: true, layers: layerReports };
}
