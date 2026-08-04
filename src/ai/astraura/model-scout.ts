"use client";

/**
 * StarSeed OS — ASTRAURA · SCOUT DE MODELOS (Adenda 138 · llmfit).
 * ============================================================================
 * El RECOMENDADOR: compara el hardware de la NEURONA actual (capacidades
 * detectadas) contra el catálogo de opciones de Astraura (LLM) y OmniVoice
 * (voz), y produce una lista de recomendaciones con VEREDICTO cuantitativo
 * (perfecto/bueno/justo/no-cabe), GB requeridos, tokens/segundo estimados y —
 * cuando se le dice qué usa el usuario ahora mismo — el DELTA frente a lo ya
 * instalado/activo ("Z rinde mejor que Y"). Pensado para alimentar las
 * superficies de UI (ventana de actualizaciones, pestañas de ajustes,
 * notificaciones, Biblioteca) sin que cada una reimplemente la comparación.
 *
 * DOS CAPAS QUE SE COMBINAN AQUÍ:
 *   · `model-requirements.ts::fitFor` — bloqueos DUROS de plataforma (falta
 *     WebGPU/Chrome AI/núcleos): si el motor de ejecución ni siquiera existe
 *     en este navegador, NINGÚN cálculo de memoria lo arregla, así que esas
 *     razones se preservan y el veredicto se fuerza a "no-cabe".
 *   · `model-fit.ts` — el cálculo CUANTITATIVO (GB de pesos + caché KV +
 *     margen, mejor cuantización para el presupuesto, tokens/segundo por
 *     roofline de ancho de banda) que da el veredicto fino perfecto/bueno/
 *     justo/no-cabe y la cifra de velocidad.
 *
 * PROXY HONESTO: `ModelSpec` (el catálogo curado de `model-requirements.ts`)
 * NO lleva un recuento real de parámetros ni una cuantización declarada —
 * solo un `approxSizeGb` orientativo para la UI. Aquí se usa ese
 * `approxSizeGb` COMO PROXY de `paramsB` (según pide esta ola), documentado
 * explícitamente en `buildLocalRecommendation` para que quede claro que es una
 * aproximación de trabajo, no una medición real. Cuando se disponga de
 * parámetros/cuantización reales (p.ej. una ficha de Hugging Bay o un modelo
 * GGUF concreto), se debe llamar a `estimateMemoryGb`/`bestQuantForBudget` de
 * `model-fit.ts` DIRECTAMENTE con esos datos reales en vez de pasar por este
 * proxy.
 *
 * Relación con `model-recommend.ts` (Adenda 109, YA EXISTENTE): ese módulo
 * responde "¿cuál es LA mejor opción por vía de acceso (local/servidor) para
 * esta neurona?" con la escala CUALITATIVA de `fitFor`
 * (ideal/suficiente/justo/insuficiente) y alimenta hoy `NeuronModelsPanel`.
 * Este módulo (`model-scout.ts`) responde una pregunta distinta y
 * complementaria: "¿cómo de bien encaja CADA opción, con números reales de
 * memoria/velocidad, y en cuánto MEJORA (o no) lo que ya uso?" — con la escala
 * CUANTITATIVA de `model-fit.ts` (perfecto/bueno/justo/no-cabe) y soporte
 * explícito para comparar contra `usedModelIds`. Ninguno sustituye al otro
 * todavía; `NeuronModelsPanel` sigue usando `model-recommend.ts` hasta que se
 * cablee esta ola (ver SOP `architecture/recomendador-modelos-llmfit.md`).
 *
 * Todo defensivo y SSR-safe: sin `window` se puede seguir usando (no hay
 * lectura de capacidades aquí, eso lo hace el llamador con `detectCapabilities`
 * de `@/lib/neurons/neurons`), y la firma de novedades degrada a "sin
 * novedades" si `localStorage` no está disponible. NUNCA lanza.
 * ============================================================================
 */

import { safeGet, safeSet } from "@/lib/safe-storage";
import {
  ALL_LLM_SPECS,
  ALL_VOICE_SPECS,
  fitFor,
  classifyDeviceTier,
  tierLabel,
  type ModelSpec,
  type ModelKind,
  type DeviceTier,
} from "./model-requirements";
import {
  bestQuantForBudget,
  estimateMemoryGb,
  estimateTps,
  gpuBandwidthGbps,
  scoreFit,
  DEFAULT_ESTIMATION_CTX,
  type FitVerdict,
  type RunMode,
  type Backend,
} from "./model-fit";
import type { NeuronCapabilities } from "@/lib/neurons/neurons";

/* ────────────────────────── Tipos públicos ────────────────────────── */

export interface ModelRecommendation {
  spec: ModelSpec;
  verdict: FitVerdict;
  /** GB estimados necesarios (0 para opciones de servidor: no cargan nada en local). */
  requiredGb: number;
  /** Tokens/segundo estimados (solo opciones locales con datos suficientes). */
  estTps?: number;
  /** Cuantización asumida/elegida para el cálculo (solo opciones locales). */
  quant?: string;
  isCurrentlyUsed: boolean;
  /** Diferencia legible frente al modelo actualmente en uso (solo en `best`, y solo si hay uno). */
  deltaVsCurrent?: string;
  reasons: string[];
}

export interface ScoutOptions {
  /** Restringe el catálogo a LLM o voz. Sin especificar ⇒ ambos catálogos combinados. */
  kind?: ModelKind;
  /** Ids de `ModelSpec` que el usuario tiene activos/instalados ahora mismo (cualquier neurona/config). */
  usedModelIds?: string[];
  /** Máximo de entradas en `best`. Por defecto 6. */
  limit?: number;
}

export interface ScoutResult {
  tier: DeviceTier;
  /** Mejores opciones que SÍ caben (nunca incluye veredicto "no-cabe"), ordenadas por encaje y calidad. */
  best: ModelRecommendation[];
  /** Recomendaciones de los modelos que el usuario ya tiene en `usedModelIds`. */
  current: ModelRecommendation[];
  /** ¿Hay algo mejor ("perfecto"/"bueno") que lo que ya usa? Falso si no se pasó `usedModelIds`. */
  hasBetter: boolean;
  /** Resumen en español, listo para mostrar tal cual. */
  summary: string;
}

/* ────────────────────────── Constantes internas ────────────────────────── */

const DEFAULT_LIMIT = 6;
/** RAM (GB) asumida cuando el navegador no reporta `deviceMemory` (Firefox/Safari no lo exponen). Conservador. */
const FALLBACK_RAM_GB = 4;
/** Tamaño (B params, proxy) asumido cuando una opción local no declara `approxSizeGb`. Conservador (modelo pequeño). */
const FALLBACK_PARAMS_B = 3;

const VERDICT_RANK: Record<FitVerdict, number> = { perfecto: 3, bueno: 2, justo: 1, "no-cabe": 0 };

/* ────────────────────────── Heurística de VRAM por GPU ────────────────────────── */
// NOTA: distinta de `GPU_BANDWIDTH_GBPS` de `model-fit.ts` (esa mide ANCHO DE
// BANDA en GB/s para estimar velocidad; esta mide CAPACIDAD en GB para derivar
// el presupuesto de memoria dedicada). Vive aquí — no en `model-fit.ts` — por
// ser una heurística propia del recomendador, no una fórmula portada de
// llmfit. En Apple Silicon la GPU comparte la RAM unificada: no hay entrada
// aquí a propósito, se usa `caps.memoryGb` directamente como presupuesto.

const GPU_VRAM_GB: Record<string, number> = {
  "rtx 3050": 8,
  "rtx 3060 ti": 8,
  "rtx 3060": 12,
  "rtx 3070": 8,
  "rtx 3080 ti": 12,
  "rtx 3080": 10,
  "rtx 3090": 24,
  "rtx 4060": 8,
  "rtx 4070": 12,
  "rtx 4080": 16,
  "rtx 4090": 24,
  "rtx 5090": 32,
  "rtx 2080 ti": 11,
  a100: 40,
  h100: 80,
  l40: 48,
  l4: 24,
  v100: 16,
  "rtx a6000": 48,
  "rx 7900 xtx": 24,
  "rx 7900 xt": 20,
  "rx 6900 xt": 16,
};

/** VRAM estimada (GB) de la GPU nombrada en `gpuRenderer`, por substring más largo. `undefined` si no hay match. Nunca lanza. */
function estimateVramGb(gpuRenderer?: string): number | undefined {
  if (typeof gpuRenderer !== "string") return undefined;
  const hay = gpuRenderer.trim().toLowerCase();
  if (!hay) return undefined;
  let bestKey = "";
  let bestValue: number | undefined;
  for (const [key, value] of Object.entries(GPU_VRAM_GB)) {
    if (key.length > bestKey.length && hay.includes(key)) {
      bestKey = key;
      bestValue = value;
    }
  }
  return bestValue;
}

/** Backend de inferencia probable según plataforma/GPU detectados. Heurística defensiva, nunca lanza. */
function guessBackend(caps: NeuronCapabilities): Backend {
  const platform = (caps?.platform || "").toLowerCase();
  const renderer = (caps?.gpuRenderer || "").toLowerCase();
  const vendor = (caps?.gpuVendor || "").toLowerCase();
  if (platform === "macos" || platform === "ios" || platform === "ipados" || renderer.includes("apple") || vendor.includes("apple")) {
    return "metal";
  }
  if (renderer.includes("nvidia") || vendor.includes("nvidia")) return "cuda";
  if (renderer.includes("amd") || renderer.includes("radeon") || vendor.includes("amd")) return "rocm";
  if (platform === "android") return "cpu-arm";
  if (caps?.webgpu) return "vulkan";
  return "cpu-x86";
}

/** Modo de ejecución asumido para una opción local, según su requisito de GPU y si hay VRAM estimable. */
function runModeFor(spec: ModelSpec, vramGb: number | undefined): RunMode {
  const gpuReq = spec.req.gpu;
  if (gpuReq === "requerida") return vramGb ? "gpu" : "cpu-offload";
  if (gpuReq === "recomendada") return vramGb ? "gpu" : "cpu-only";
  return "cpu-only";
}

/** Presupuesto de memoria (GB) + modo de ejecución para evaluar una opción local en esta neurona. */
function budgetFor(caps: NeuronCapabilities, spec: ModelSpec): { budgetGb: number; runMode: RunMode; vramGb?: number } {
  const ramGb = typeof caps?.memoryGb === "number" && caps.memoryGb > 0 ? caps.memoryGb : FALLBACK_RAM_GB;
  const vramGb = estimateVramGb(caps?.gpuRenderer);
  const runMode = runModeFor(spec, vramGb);
  const budgetGb = runMode === "gpu" && vramGb ? vramGb : ramGb;
  return { budgetGb, runMode, vramGb };
}

/* ────────────────────────── Construcción de una recomendación ────────────────────────── */

function buildRecommendation(caps: NeuronCapabilities, spec: ModelSpec, usedIds: Set<string>): ModelRecommendation {
  const isCurrentlyUsed = usedIds.has(spec.id);
  const fit = fitFor(caps, spec);

  // Servidor: sin requisito local, siempre "perfecto" (política de model-requirements.ts).
  if (spec.access !== "local") {
    return { spec, verdict: "perfecto", requiredGb: 0, isCurrentlyUsed, reasons: fit.reasons };
  }

  // Bloqueo DURO de plataforma (WebGPU/Chrome AI ausentes): ningún cálculo de
  // memoria arregla esto — se fuerza "no-cabe" pase lo que pase con el GB.
  const platformBlocked =
    (spec.req.webgpu === true && caps?.webgpu === false) || (spec.req.chromeAi === true && caps?.chromeAi === false);

  // Proxy HONESTO: `approxSizeGb` es un tamaño de descarga orientativo, no un
  // recuento real de parámetros — es el mejor dato disponible en el catálogo
  // curado (ver cabecera del archivo). Si falta, se asume un modelo pequeño.
  const paramsB = Math.max(0, spec.req.approxSizeGb ?? 0) || FALLBACK_PARAMS_B;
  const { budgetGb, runMode } = budgetFor(caps, spec);

  const chosen = bestQuantForBudget(paramsB, budgetGb, DEFAULT_ESTIMATION_CTX);
  const worstCase = estimateMemoryGb({ paramsB, quant: "Q2_K", ctx: 1024 });
  const requiredGb = chosen?.estimatedGb ?? worstCase;
  const quant = chosen?.quant ?? "Q2_K";

  // "Recomendado" = una cuantización de más calidad (Q6_K) a contexto completo:
  // si el equipo cubre incluso ESO con holgura, el encaje es "perfecto" de verdad.
  const recommendedGb = estimateMemoryGb({ paramsB, quant: "Q6_K", ctx: DEFAULT_ESTIMATION_CTX });
  const score = scoreFit({ requiredGb, availableGb: budgetGb, recommendedGb, runMode });
  const verdict: FitVerdict = platformBlocked ? "no-cabe" : score.verdict;

  const backend = guessBackend(caps);
  const bandwidth = gpuBandwidthGbps(caps?.gpuRenderer);
  const estTps = platformBlocked
    ? undefined
    : estimateTps({ bandwidthGbps: runMode === "gpu" ? bandwidth : undefined, modelSizeGb: requiredGb, runMode, backend });

  const reasons = [...fit.reasons];
  if (!platformBlocked) {
    reasons.push(
      verdict === "no-cabe"
        ? `No cabe ni en ${quant} (~${requiredGb.toFixed(1)} GB) con ${budgetGb.toFixed(1)} GB disponibles`
        : `${quant} · ~${requiredGb.toFixed(1)} GB de ${budgetGb.toFixed(1)} GB disponibles (contexto ${DEFAULT_ESTIMATION_CTX})`,
    );
  }

  return { spec, verdict, requiredGb, estTps, quant, isCurrentlyUsed, reasons };
}

/* ────────────────────────── Orden y delta ────────────────────────── */

/** Orden de recomendaciones: mejor veredicto primero; a igual veredicto, el modelo MÁS GRANDE que sí cabe (proxy de calidad/capacidad). */
function compareRecommendations(a: ModelRecommendation, b: ModelRecommendation): number {
  const v = VERDICT_RANK[b.verdict] - VERDICT_RANK[a.verdict];
  if (v) return v;
  return (b.requiredGb || 0) - (a.requiredGb || 0);
}

/** Descripción legible de la mejora (o no) de `candidate` frente a `current`. `undefined` si no hay diferencia relevante. */
function describeDelta(candidate: ModelRecommendation, current: ModelRecommendation): string | undefined {
  if (candidate.spec.id === current.spec.id) return undefined;
  const parts: string[] = [];
  const vDiff = VERDICT_RANK[candidate.verdict] - VERDICT_RANK[current.verdict];
  if (vDiff > 0) parts.push(`mejor ajuste (${candidate.verdict} vs ${current.verdict})`);
  else if (vDiff < 0) parts.push(`ajuste más justo (${candidate.verdict} vs ${current.verdict})`);
  if (typeof candidate.estTps === "number" && typeof current.estTps === "number" && current.estTps > 0.01) {
    const pct = Math.round(((candidate.estTps - current.estTps) / current.estTps) * 100);
    if (Math.abs(pct) >= 5) parts.push(`${pct > 0 ? "+" : ""}${pct}% velocidad estimada`);
  }
  return parts.length ? parts.join(" · ") : undefined;
}

/* ────────────────────────── Resumen en español ────────────────────────── */

function buildSummary(tier: DeviceTier, best: ModelRecommendation[], current: ModelRecommendation[], hasBetter: boolean): string {
  const tierTxt = tierLabel(tier);
  if (!best.length) {
    return `Tu equipo (${tierTxt}) — no se encontró ninguna opción del catálogo que encaje bien todavía.`;
  }
  const top = best[0];
  if (!current.length) {
    return `Tu equipo (${tierTxt}) puede con «${top.spec.label}» (${top.verdict}).`;
  }
  const usedTop = current[0];
  if (hasBetter && top.spec.id !== usedTop.spec.id) {
    const delta = top.deltaVsCurrent ? ` — ${top.deltaVsCurrent}` : "";
    return `Tu equipo (${tierTxt}) puede con «${top.spec.label}»; ahora usas «${usedTop.spec.label}» — «${top.spec.label}» rinde mejor${delta}.`;
  }
  return `Tu equipo (${tierTxt}) ya usa la mejor opción disponible: «${usedTop.spec.label}».`;
}

/* ────────────────────────── API principal ────────────────────────── */

/**
 * Compara el catálogo de Astraura (LLM) y/o OmniVoice (voz) contra el hardware
 * de `caps` y produce recomendaciones ordenadas, con delta frente a lo que ya
 * se usa (`usedModelIds`) cuando se provee. Nunca lanza: cualquier fallo
 * interno degrada a un resultado vacío pero válido.
 */
export function scoutModels(caps: NeuronCapabilities, opts?: ScoutOptions): ScoutResult {
  try {
    const o = opts ?? ({} as ScoutOptions);
    const usedIds = new Set((Array.isArray(o.usedModelIds) ? o.usedModelIds : []).map(String));
    const limit = Math.max(1, o.limit ?? DEFAULT_LIMIT);
    const tier = classifyDeviceTier(caps);

    const catalog: ModelSpec[] =
      o.kind === "llm" ? ALL_LLM_SPECS : o.kind === "voz" ? ALL_VOICE_SPECS : [...ALL_LLM_SPECS, ...ALL_VOICE_SPECS];

    const all = catalog.map((spec) => buildRecommendation(caps, spec, usedIds));

    const fits = all.filter((r) => r.verdict !== "no-cabe").sort(compareRecommendations);
    const best = fits.slice(0, limit);

    const current = all.filter((r) => r.isCurrentlyUsed).sort(compareRecommendations);
    const currentBest = current[0];
    if (currentBest) {
      for (const r of best) r.deltaVsCurrent = describeDelta(r, currentBest);
    }

    const currentBestRank = currentBest ? VERDICT_RANK[currentBest.verdict] : -1;
    const hasBetter =
      usedIds.size > 0 &&
      best.some(
        (r) => !r.isCurrentlyUsed && (r.verdict === "perfecto" || r.verdict === "bueno") && VERDICT_RANK[r.verdict] > currentBestRank,
      );

    const summary = buildSummary(tier, best, current, hasBetter);

    return { tier, best, current, hasBetter, summary };
  } catch {
    return { tier: "medio", best: [], current: [], hasBetter: false, summary: "No se pudo calcular la recomendación de modelos." };
  }
}

/* ────────────────────────── Firma de novedades (patrón startup-updates.ts) ────────────────────────── */

/** Clave localStorage de la última firma de scout VISTA por el usuario (viaja con la cuenta vía settings-sync). */
export const SCOUT_SIGNATURE_KEY = "starseed.astraura.scout.sig.v1";

/** Hash simple (djb2) — mismo algoritmo que `startup-updates.ts::hash` para consistencia de estilo. */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * Firma estable de "qué encontraría el scout ahora mismo" para ESTE hardware:
 * cambia si cambia el tamaño del catálogo (nuevos modelos) o las capacidades
 * relevantes del dispositivo (RAM/GPU/núcleos/WebGPU). No requiere ejecutar
 * `scoutModels` completo — es barata de llamar en cada arranque. Nunca lanza.
 */
export function scoutSignature(caps: NeuronCapabilities, catalogLen: number): string {
  try {
    const bits = [
      caps?.platform ?? "",
      caps?.gpuRenderer ?? "",
      String(caps?.memoryGb ?? ""),
      String(caps?.cores ?? ""),
      String(!!caps?.webgpu),
      String(Math.max(0, Math.trunc(catalogLen) || 0)),
    ].join("|");
    return `${Math.max(0, Math.trunc(catalogLen) || 0)}.${hash(bits)}`;
  } catch {
    return `0.${hash("")}`;
  }
}

/** ¿La firma actual es distinta de la última vista? (⇒ hay novedades de scout que anunciar). Nunca lanza. */
export function hasNewScoutFindings(sig: string): boolean {
  try {
    const last = safeGet(SCOUT_SIGNATURE_KEY);
    return last !== sig;
  } catch {
    return false;
  }
}

/** Marca `sig` como vista (no se volverá a anunciar hasta que cambie). Nunca lanza. */
export function markScoutSeen(sig: string): void {
  try {
    safeSet(SCOUT_SIGNATURE_KEY, sig);
  } catch {
    /* noop */
  }
}
