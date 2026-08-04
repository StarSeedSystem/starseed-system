/**
 * StarSeed OS — ASTRAURA · MOTOR DE «FIT» DE HARDWARE (Adenda 138 · llmfit).
 * ============================================================================
 * Fórmulas y constantes de estimación de memoria/velocidad PORTADAS a TypeScript
 * desde **llmfit** (github.com/AlexsJones/llmfit, licencia MIT) — la calculadora
 * de referencia para saber si un modelo GGUF/cuantizado CABE en un equipo y a
 * qué velocidad correría aproximadamente. Este módulo NO decide nada por sí
 * mismo: es la CAPA MATEMÁTICA pura que usa `model-scout.ts` (el recomendador)
 * para comparar el catálogo de Astraura/OmniVoice contra el hardware real de
 * cada neurona.
 *
 * QUÉ RESUELVE ESTE MÓDULO (que `model-requirements.ts` no cubre):
 *   · `model-requirements.ts` es CUALITATIVO: mínimos declarados a MANO por
 *     opción del catálogo curado (`minRamGb`, `gpu: "requerida"`…) → nivel
 *     "ideal/suficiente/justo/insuficiente" (`fitFor`). Perfecto para las ~20
 *     opciones fijas de Astraura/OmniVoice.
 *   · `model-fit.ts` (este archivo) es CUANTITATIVO: a partir de los
 *     PARÁMETROS de un modelo (miles de millones) y su CUANTIZACIÓN
 *     (GGUF/AWQ/GPTQ/MLX), calcula los GB EXACTOS de RAM/VRAM que hacen falta
 *     (pesos + caché KV + margen fijo), la MEJOR cuantización que cabe en un
 *     presupuesto dado, y una estimación de tokens/segundo por roofline (ancho
 *     de banda de memoria del GPU). Sirve para CUALQUIER modelo con
 *     params+cuantización conocidos (Hugging Bay, Ollama, HuggingFace release),
 *     no solo el catálogo curado — es el motor que hace posible comparar
 *     "¿qué tan grande/qué cuantización puedo permitirme?" en vez de solo
 *     "¿esta opción concreta encaja sí/no?".
 *
 * Módulo PURO: solo constantes + funciones puras (sin React, sin `window`, sin
 * I/O de red ni de almacenamiento). Todas las funciones son TOTALES (dominio
 * completo) y NUNCA lanzan: cualquier entrada fuera de rango o mal tipada se
 * sanea con `Math.max`/valores por defecto en vez de lanzar una excepción, para
 * que un dato sucio de catálogo (o de una API externa) jamás rompa la UI.
 *
 * CALIBRACIÓN: los bytes-por-parámetro (`QUANT_BPP`) y las penalizaciones de
 * calidad (`quantQualityPenalty`) están calibrados por el equipo de llmfit
 * contra el tamaño REAL de archivo GGUF de cientos de modelos publicados (no
 * son la aproximación teórica ingenua "bits/8 × parámetros"). Se citan aquí
 * TAL CUAL — StarSeed no las recalibra, solo las porta a TypeScript con el
 * mismo criterio defensivo del resto del OS.
 * ============================================================================
 */

/* ────────────────────────── 1. Bytes por parámetro (GGUF/AWQ/GPTQ/MLX) ────────────────────────── */

/**
 * Bytes-por-parámetro (bpp) de cada cuantización, calibrados por llmfit contra
 * el tamaño REAL de archivo (no la aproximación teórica). Cubre precisión
 * completa (F32/F16/BF16), la familia K-quants de GGUF (Q8_0…Q2_K) y los
 * formatos de cuantización de servidores de inferencia (AWQ/GPTQ) y Apple MLX.
 */
export const QUANT_BPP: Record<string, number> = {
  F32: 4.0,
  F16: 2.0,
  BF16: 2.0,
  Q8_0: 1.05,
  Q6_K: 0.8,
  Q5_K_M: 0.68,
  Q4_K_M: 0.58,
  Q4_0: 0.58,
  Q3_K_M: 0.48,
  Q2_K: 0.37,
  "AWQ-4bit": 0.5,
  "GPTQ-Int4": 0.5,
  "AWQ-8bit": 1.0,
  "GPTQ-Int8": 1.0,
  "mlx-4bit": 0.55,
  "mlx-8bit": 1.0,
};

/** bpp por defecto para una cuantización desconocida (≈ Q4_K_M/Q4_0: el término medio real del ecosistema). */
const DEFAULT_QUANT_BPP = 0.58;

/** Bytes-por-parámetro de una cuantización. Coincidencia EXACTA (case-sensitive, como los nombres GGUF reales); desconocida ⇒ default. Nunca lanza. */
export function quantBpp(q: string): number {
  if (typeof q !== "string") return DEFAULT_QUANT_BPP;
  const key = q.trim();
  return key in QUANT_BPP ? QUANT_BPP[key] : DEFAULT_QUANT_BPP;
}

/* ────────────────────────── 2. Jerarquía de calidad ────────────────────────── */

/** Cuantizaciones GGUF habituales, de MEJOR a PEOR calidad (para `bestQuantForBudget`). */
export const QUANT_HIERARCHY: readonly string[] = ["Q8_0", "Q6_K", "Q5_K_M", "Q4_K_M", "Q3_K_M", "Q2_K"];

/** Penalización de calidad (perplejidad relativa, negativo = peor) por cuantización de la jerarquía. */
const QUANT_QUALITY_PENALTY: Record<string, number> = {
  Q8_0: 0,
  Q6_K: -1,
  Q5_K_M: -2,
  Q4_K_M: -5,
  Q3_K_M: -8,
  Q2_K: -12,
};

/** Penalización por defecto para cuantizaciones fuera de la jerarquía (≈ Q4_K_M: term medio). */
const DEFAULT_QUALITY_PENALTY = QUANT_QUALITY_PENALTY.Q4_K_M;

/** Penalización de calidad de una cuantización (0 = sin pérdida perceptible, más negativo = más pérdida). Nunca lanza. */
export function quantQualityPenalty(q: string): number {
  if (typeof q !== "string") return DEFAULT_QUALITY_PENALTY;
  const key = q.trim();
  return key in QUANT_QUALITY_PENALTY ? QUANT_QUALITY_PENALTY[key] : DEFAULT_QUALITY_PENALTY;
}

/* ────────────────────────── 3. Caché KV ────────────────────────── */

/** Tipo de cuantización de la caché KV (independiente de la cuantización de los PESOS). */
export type KvCacheType = "fp16" | "fp8" | "q8_0" | "q4_0";

const KV_BYTES_PER_ELEMENT: Record<KvCacheType, number> = {
  fp16: 2,
  fp8: 1,
  q8_0: 1,
  q4_0: 0.5,
};

/** Bytes por elemento de la caché KV según su cuantización. Desconocida ⇒ fp16 (conservador). Nunca lanza. */
export function kvBytesPerElement(kv: KvCacheType): number {
  return KV_BYTES_PER_ELEMENT[kv] ?? KV_BYTES_PER_ELEMENT.fp16;
}

/** Factor multiplicador del fallback aproximado de `kvCacheGb` cuando no hay arquitectura real (nLayers/headDim). */
const KV_FALLBACK_FACTOR: Record<string, number> = { fp16: 1, fp8: 0.5, q8_0: 0.5, q4_0: 0.25 };

export interface KvCacheOpts {
  /** Longitud de contexto (tokens). */
  ctx: number;
  /** Nº de capas del modelo (si se conoce la arquitectura real ⇒ cálculo exacto). */
  nLayers?: number;
  /** Cabezas KV (GQA/MQA); por defecto 8 si hay `nLayers`+`headDim` pero falta este dato. */
  nKvHeads?: number;
  /** Dimensión de cada cabeza. */
  headDim?: number;
  /** Tamaño del modelo en miles de millones de parámetros (para el fallback aproximado). */
  paramsB: number;
  /** Cuantización de la caché KV. Por defecto fp16. */
  kv?: KvCacheType;
}

/**
 * Tamaño (GB) de la caché KV para una longitud de contexto dada.
 *   · Con arquitectura real (`nLayers` + `headDim`): fórmula EXACTA
 *     `2 · nKvHeads · headDim · ctx · bytesPorElemento · nLayers / 2^30`
 *     (el 2 es por K+V; `nKvHeads` por defecto 8 si falta).
 *   · Sin arquitectura real: fallback aproximado por tamaño del modelo,
 *     `0.000008 · paramsB · ctx · factor(kv)` — mismo orden de magnitud, útil
 *     cuando solo se conoce "cuántos B de parámetros" (catálogo curado, Hugging
 *     Bay sin ficha completa…).
 * Nunca lanza.
 */
export function kvCacheGb(opts: KvCacheOpts): number {
  const o = opts ?? ({} as KvCacheOpts);
  const ctx = Math.max(0, Number(o.ctx) || 0);
  const paramsB = Math.max(0, Number(o.paramsB) || 0);
  const kv: KvCacheType = o.kv ?? "fp16";

  if (o.nLayers && o.headDim) {
    const nKvHeads = o.nKvHeads ?? 8;
    const bytesPerElem = kvBytesPerElement(kv);
    const bytes = 2 * nKvHeads * o.headDim * ctx * bytesPerElem * o.nLayers;
    return bytes / 2 ** 30;
  }

  const factor = KV_FALLBACK_FACTOR[kv] ?? 1;
  return 0.000008 * paramsB * ctx * factor;
}

/* ────────────────────────── 4. Estimación de memoria total ────────────────────────── */

/**
 * Contexto por defecto usado para ESTIMAR memoria cuando no se fija uno menor:
 * los modelos anuncian ventanas enormes (128K, 1M…) que casi nadie usa a
 * tope; estimar siempre al máximo sobreestimaría brutalmente el requisito
 * real. `estimateMemoryGb` SIEMPRE usa `min(ctx pedido, DEFAULT_ESTIMATION_CTX)`.
 */
export const DEFAULT_ESTIMATION_CTX = 8192;

/** Margen fijo (GB) por overhead de runtime (buffers, activaciones, el propio proceso). */
const FIXED_OVERHEAD_GB = 0.5;

export interface EstimateMemoryOpts {
  /** Tamaño del modelo en miles de millones de parámetros. */
  paramsB: number;
  /** Cuantización de los PESOS (ver `QUANT_BPP`). */
  quant: string;
  /** Longitud de contexto pedida (se recorta a `DEFAULT_ESTIMATION_CTX`). */
  ctx: number;
  kv?: KvCacheType;
  nLayers?: number;
  nKvHeads?: number;
  headDim?: number;
}

/**
 * Memoria total estimada (GB) para cargar y ejecutar un modelo:
 * `pesos (paramsB × bpp) + caché KV + margen fijo (0.5 GB)`.
 * Nunca lanza; entradas negativas o no numéricas se sanean a 0.
 */
export function estimateMemoryGb(opts: EstimateMemoryOpts): number {
  const o = opts ?? ({} as EstimateMemoryOpts);
  const paramsB = Math.max(0, Number(o.paramsB) || 0);
  const requestedCtx = Number(o.ctx) > 0 ? Number(o.ctx) : DEFAULT_ESTIMATION_CTX;
  const ctx = Math.min(requestedCtx, DEFAULT_ESTIMATION_CTX);

  const weightsGb = paramsB * quantBpp(o.quant);
  const kvGb = kvCacheGb({
    ctx,
    nLayers: o.nLayers,
    nKvHeads: o.nKvHeads,
    headDim: o.headDim,
    paramsB,
    kv: o.kv,
  });
  return weightsGb + kvGb + FIXED_OVERHEAD_GB;
}

/* ────────────────────────── 5. Mixture-of-Experts (MoE) ────────────────────────── */

/**
 * VRAM necesaria para mantener los expertos ACTIVOS de un modelo MoE en GPU
 * (el resto de expertos se puede offloadear a RAM con `moeOffloadRamGb`).
 * El ×1.1 es margen por el router/gate y activaciones de los expertos activos.
 * Mínimo 0.5 GB (nunca "cabe gratis"). Nunca lanza.
 */
export function moeActiveVramGb(activeParamsB: number, quant: string): number {
  const active = Math.max(0, Number(activeParamsB) || 0);
  return Math.max(0.5, active * quantBpp(quant) * 1.1);
}

/**
 * RAM de sistema necesaria para offloadear los expertos NO activos de un MoE
 * (`total − activos`) a la cuantización dada. Se combina con
 * `moeActiveVramGb` para el presupuesto completo de un MoE en modo
 * `runMode: "moe-offload"`. Nunca lanza.
 */
export function moeOffloadRamGb(totalB: number, activeB: number, quant: string): number {
  const total = Math.max(0, Number(totalB) || 0);
  const active = Math.max(0, Number(activeB) || 0);
  const offloaded = Math.max(0, total - active);
  return offloaded * quantBpp(quant);
}

/* ────────────────────────── 6. Mejor cuantización para un presupuesto ────────────────────────── */

export interface BestQuantOpts {
  kv?: KvCacheType;
  nLayers?: number;
  nKvHeads?: number;
  headDim?: number;
}

export interface BestQuantResult {
  /** Mejor cuantización de `QUANT_HIERARCHY` que cabe en el presupuesto. */
  quant: string;
  /** Memoria estimada (GB) con esa cuantización. */
  estimatedGb: number;
  /** Contexto efectivamente usado (puede ser menor al pedido si hubo que recortarlo). */
  ctx: number;
}

/**
 * Recorre `QUANT_HIERARCHY` de MEJOR a PEOR calidad y devuelve la primera que
 * cabe en `budgetGb` al contexto pedido. Si ninguna cabe, reintenta con la
 * mitad del contexto (mientras siga siendo ≥ 1024) — a veces el problema es el
 * contexto, no el modelo. Si aun así nada cabe, devuelve `null` (honesto: este
 * modelo no cabe en este presupuesto con ninguna cuantización razonable).
 * Nunca lanza.
 */
export function bestQuantForBudget(
  paramsB: number,
  budgetGb: number,
  ctx: number,
  opts?: BestQuantOpts,
): BestQuantResult | null {
  const p = Math.max(0, Number(paramsB) || 0);
  const budget = Number(budgetGb) || 0;
  const o = opts ?? {};

  const tryAt = (c: number): BestQuantResult | null => {
    for (const quant of QUANT_HIERARCHY) {
      const estimatedGb = estimateMemoryGb({ paramsB: p, quant, ctx: c, ...o });
      if (estimatedGb <= budget) return { quant, estimatedGb, ctx: c };
    }
    return null;
  };

  const startCtx = Math.max(0, Number(ctx) || 0);
  const atFullCtx = tryAt(startCtx);
  if (atFullCtx) return atFullCtx;

  const halved = Math.floor(startCtx / 2);
  if (halved >= 1024) return tryAt(halved);
  return null;
}

/* ────────────────────────── 7. Veredicto de encaje ────────────────────────── */

/** Veredicto de encaje en español (el que ve el usuario en la UI). */
export type FitVerdict = "perfecto" | "bueno" | "justo" | "no-cabe";

/** Modo de ejecución asumido para el veredicto y la estimación de velocidad. */
export type RunMode = "gpu" | "moe-offload" | "cpu-offload" | "cpu-only" | "tensor-parallel";

/** Margen de seguridad universal de llmfit: por debajo de `requerido × 1.2` el encaje es "justo", no "bueno". */
export const FIT_SAFETY_MARGIN = 1.2;

export interface ScoreFitOpts {
  /** GB necesarios (p.ej. de `estimateMemoryGb`/`bestQuantForBudget`). */
  requiredGb: number;
  /** GB disponibles en el dispositivo (RAM o VRAM, según `runMode`). */
  availableGb: number;
  /** GB para una experiencia CÓMODA (p.ej. una cuantización de más calidad a contexto completo). Opcional. */
  recommendedGb?: number;
  runMode: RunMode;
}

export interface FitScore {
  verdict: FitVerdict;
  /** `availableGb − requiredGb`: positivo = margen libre, negativo = déficit. */
  headroom: number;
}

/**
 * Veredicto de encaje (regla llmfit):
 *   1. `requerido > disponible` ⇒ **no-cabe**, sin excepción (pase lo que pase).
 *   2. GPU/tensor-parallel: `recomendadoGb ≤ disponible` ⇒ **perfecto**;
 *      si no, `disponible ≥ requerido × 1.2` ⇒ **bueno**; si no, **justo**.
 *   3. MoE-offload/CPU-offload/CPU-only: NUNCA "perfecto" (siempre hay un
 *      compromiso de velocidad al repartir entre RAM/CPU) — `disponible ≥
 *      requerido × 1.2` ⇒ **bueno**; si no, **justo**.
 * Nunca lanza.
 */
export function scoreFit(opts: ScoreFitOpts): FitScore {
  const o = opts ?? ({} as ScoreFitOpts);
  const required = Math.max(0, Number(o.requiredGb) || 0);
  const available = Math.max(0, Number(o.availableGb) || 0);
  const headroom = available - required;

  if (required > available) return { verdict: "no-cabe", headroom };

  const gpuLike = o.runMode === "gpu" || o.runMode === "tensor-parallel";
  if (gpuLike) {
    if (typeof o.recommendedGb === "number" && o.recommendedGb <= available) {
      return { verdict: "perfecto", headroom };
    }
    return { verdict: available >= required * FIT_SAFETY_MARGIN ? "bueno" : "justo", headroom };
  }

  // moe-offload / cpu-offload / cpu-only: nunca "perfecto" (honesto sobre el compromiso de velocidad).
  return { verdict: available >= required * FIT_SAFETY_MARGIN ? "bueno" : "justo", headroom };
}

/* ────────────────────────── 8. Ancho de banda de GPU y tokens/segundo ────────────────────────── */

/**
 * Ancho de banda de memoria (GB/s) por GPU — subconjunto útil (~40 tarjetas
 * habituales en equipos que corren IA local: Apple Silicon, NVIDIA GeForce/
 * datacenter, AMD Radeon). `gpuBandwidthGbps` empareja por SUBSTRING sobre la
 * cadena `gpuRenderer` (WEBGL_debug_renderer_info), así que las claves usan la
 * forma MÁS CONTIGUA y distintiva posible dentro de esas cadenas reales.
 *
 * Nota AMD: las cadenas reales suelen ser "AMD Radeon RX 7900 XTX" — "Radeon"
 * se interpone entre "AMD" y el número, así que la clave usa el prefijo "RX"
 * (contiguo con el modelo) en vez de "AMD", para que el substring SÍ empareje.
 */
export const GPU_BANDWIDTH_GBPS: Record<string, number> = {
  // Apple Silicon (memoria unificada; "Apple M1 Pro" etc. es literal en la cadena real).
  "Apple M1": 68,
  "Apple M1 Pro": 200,
  "Apple M1 Max": 400,
  "Apple M1 Ultra": 800,
  "Apple M2": 100,
  "Apple M2 Pro": 200,
  "Apple M2 Max": 400,
  "Apple M2 Ultra": 800,
  "Apple M3": 100,
  "Apple M3 Pro": 150,
  "Apple M3 Max": 400,
  "Apple M4": 120,
  "Apple M4 Pro": 273,
  "Apple M4 Max": 546,
  // NVIDIA GeForce RTX (consumo).
  "RTX 3050": 224,
  "RTX 3060 Ti": 448,
  "RTX 3060": 360,
  "RTX 3070": 448,
  "RTX 3080 Ti": 912,
  "RTX 3080": 760,
  "RTX 3090": 936,
  "RTX 4060": 272,
  "RTX 4070": 504,
  "RTX 4080": 717,
  "RTX 4090": 1008,
  "RTX 5090": 1792,
  "RTX 2080 Ti": 616,
  "GTX 1080 Ti": 484,
  // NVIDIA datacenter / workstation.
  A100: 1555,
  H100: 3350,
  "RTX A6000": 768,
  L40: 864,
  L4: 300,
  V100: 900,
  T4: 320,
  // AMD Radeon (ver nota de claves arriba).
  "RX 7900 XTX": 960,
  "RX 7900 XT": 800,
  "RX 6900 XT": 512,
  "RX 6800 XT": 512,
};

/**
 * Ancho de banda (GB/s) de la GPU cuyo nombre aparece dentro de `name`
 * (substring, case-insensitive; se queda con la coincidencia MÁS LARGA para
 * que "RTX 3060 Ti" gane a "RTX 3060" en vez de al revés). `undefined` si no
 * hay coincidencia — nunca lanza.
 */
export function gpuBandwidthGbps(name?: string): number | undefined {
  if (typeof name !== "string") return undefined;
  const hay = name.trim().toLowerCase();
  if (!hay) return undefined;
  let bestKey = "";
  let bestValue: number | undefined;
  for (const [key, value] of Object.entries(GPU_BANDWIDTH_GBPS)) {
    const needle = key.toLowerCase();
    if (needle.length > bestKey.length && hay.includes(needle)) {
      bestKey = needle;
      bestValue = value;
    }
  }
  return bestValue;
}

/** Motor/backend de inferencia asumido cuando no hay ancho de banda de GPU conocido. */
export type Backend = "cuda" | "metal" | "rocm" | "vulkan" | "cpu-x86" | "cpu-arm";

/** Tokens/segundo aproximados por backend cuando NO se conoce el ancho de banda del GPU (suelo razonable, no roofline). */
const BACKEND_TPS: Record<Backend, number> = {
  cuda: 220,
  metal: 250,
  rocm: 180,
  vulkan: 150,
  "cpu-x86": 70,
  "cpu-arm": 90,
};

/** Factor del modo de ejecución sobre el roofline teórico (1 = sin penalización, GPU dedicada pura). */
const RUN_MODE_FACTOR: Record<RunMode, number> = {
  gpu: 1,
  "tensor-parallel": 0.9,
  "moe-offload": 0.8,
  "cpu-offload": 0.5,
  "cpu-only": 0.3,
};

/** Eficiencia real del roofline de memoria frente al ancho de banda teórico de pico (llmfit: 55%). */
const ROOFLINE_EFFICIENCY = 0.55;

export interface EstimateTpsOpts {
  /** Ancho de banda de memoria del GPU (GB/s), p.ej. de `gpuBandwidthGbps`. */
  bandwidthGbps?: number;
  /** Tamaño del modelo cargado (GB), p.ej. de `estimateMemoryGb`. */
  modelSizeGb: number;
  runMode: RunMode;
  /** Backend de inferencia, solo se usa si NO hay `bandwidthGbps`. */
  backend?: Backend;
}

/**
 * Estimación de tokens/segundo:
 *   · CON ancho de banda de GPU: roofline de memoria —
 *     `(bandwidthGbps / modelSizeGb) × 0.55 × factor(runMode)`.
 *   · SIN ancho de banda (CPU o GPU desconocida): constante por `backend`
 *     (cuda 220 · metal 250 · rocm 180 · vulkan 150 · cpu-x86 70 · cpu-arm 90).
 * Nunca lanza; siempre devuelve un número positivo.
 */
export function estimateTps(opts: EstimateTpsOpts): number {
  const o = opts ?? ({} as EstimateTpsOpts);
  const runMode: RunMode = o.runMode ?? "cpu-only";

  if (typeof o.bandwidthGbps === "number" && o.bandwidthGbps > 0) {
    const size = Math.max(0.05, Number(o.modelSizeGb) || 0.05); // evita división por ~0 en modelos diminutos
    const factor = RUN_MODE_FACTOR[runMode] ?? RUN_MODE_FACTOR["cpu-only"];
    return (o.bandwidthGbps / size) * ROOFLINE_EFFICIENCY * factor;
  }

  const backend = o.backend ?? "cpu-x86";
  return BACKEND_TPS[backend] ?? BACKEND_TPS["cpu-x86"];
}
