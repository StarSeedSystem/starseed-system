/**
 * StarSeed OS — RECOMENDADOR INTELIGENTE DE MODELOS POR NEURONA (Adenda 109).
 * ============================================================================
 * Dadas las capacidades detectadas de una neurona, sugiere el MEJOR modelo de
 * LLM y de voz para ella, por vía de acceso (local · servidor StarSeed · propio),
 * con su nivel de encaje y un porqué legible. Aplica la política local-vs-servidor:
 *
 *   · Si la app del OS está instalada Y el dispositivo es capaz → recomienda LOCAL
 *     (privado, offline) por defecto.
 *   · Si no → recomienda SERVIDOR (StarSeed oficial), que funciona en cualquier
 *     neurona donde entre la cuenta sin instalar nada.
 *
 * Lógica PURA (sin React/Supabase). Nunca lanza. Todo configurable después por el
 * usuario en cada chat, personalidad y cerebro.
 */

import type { NeuronCapabilities } from "@/lib/neurons/neurons";
import {
  fitFor,
  specsFor,
  classifyDeviceTier,
  runsRemotely,
  tierLabel,
  type ModelSpec,
  type ModelKind,
  type FitLevel,
  type DeviceTier,
} from "./model-requirements";

export interface Recommendation {
  spec: ModelSpec;
  fit: { level: FitLevel; fits: boolean; reasons: string[] };
  /** ¿Ejecutable AHORA en esta neurona (plataforma/servidor local presente)? */
  availableNow: boolean;
  rationale: string;
}

export interface KindRecommendation {
  best: Recommendation;
  bestLocal?: Recommendation;
  bestServer: Recommendation;
  ranked: Recommendation[];
}

export interface NeuronRecommendation {
  tier: DeviceTier;
  strategy: "local" | "servidor";
  llm: KindRecommendation;
  voz: KindRecommendation;
  summary: string;
}

export interface RecommendOptions {
  /** ¿La app del OS está instalada en esta neurona? (habilita modelos locales por defecto). */
  osInstalled?: boolean;
  /** ¿Hay sesión de cuenta? (los servidores necesitan cuenta/conexión). Por defecto true. */
  hasAccount?: boolean;
  /** ¿Hay conexión a internet? Por defecto navigator.onLine (o true en SSR). */
  online?: boolean;
}

const FIT_SCORE: Record<FitLevel, number> = { ideal: 3, suficiente: 2, justo: 1, insuficiente: 0 };

/** Capacidad/calidad relativa de cada opción (para elegir "la mejor que encaje"). */
const CAPABILITY_RANK: Record<string, number> = {
  // LLM
  "ollama-large": 6, "ollama-mid": 5, webllm: 4, "smollm3-webgpu": 3, "ollama-small": 3,
  "chrome-ai": 2, "smolvlm2-webgpu": 1,
  "starseed-llm": 7, "openrouter-llm": 6, "custom-llm-api": 4, "custom-llm-mcp": 4,
  // Voz
  coqui: 6, gptsovits: 6, openvoice: 5, kokoro: 4, bark: 3, piper: 2,
  "starseed-voice": 7, "xai-voice": 6, "custom-voice-api": 4,
};

function capRank(spec: ModelSpec): number {
  return CAPABILITY_RANK[spec.id] ?? 1;
}

/** ¿La opción es ejecutable ahora mismo en esta neurona? */
export function availableNow(
  caps: NeuronCapabilities,
  spec: ModelSpec,
  osInstalled: boolean,
  ctx?: { hasAccount?: boolean; online?: boolean },
): boolean {
  if (runsRemotely(spec)) {
    // Servidor: necesita CONEXIÓN; StarSeed y servidores propios además SESIÓN de
    // cuenta. OpenRouter :free solo requiere conexión (Adenda 118: failover real).
    const online = ctx?.online ?? true;
    if (!online) return false;
    if (spec.access === "openrouter") return true;
    return ctx?.hasAccount ?? true;
  }
  if (spec.req.chromeAi) return !!caps.chromeAi;
  if (spec.req.webgpu) return !!caps.webgpu;
  if (spec.engine === "Ollama") return !!caps.ollama || !!caps.lmstudio;
  // (Adenda 155) Sistema primario soberano: disponible si el backend 1.58 de esta
  // neurona responde (lo detecta `detectCapabilities` sondeando su endpoint).
  if (spec.engine === "Astraura 1.58") return !!caps.astraura158?.online;
  // Motores de voz locales y demás: necesitan la app del OS instalada (stack local).
  return osInstalled || !!caps.installedApp;
}

function rationaleFor(caps: NeuronCapabilities, spec: ModelSpec, fit: { level: FitLevel; reasons: string[] }, avail: boolean): string {
  if (runsRemotely(spec)) {
    if (!avail) return "Servidor: necesita conexión y sesión de cuenta para usarse ahora.";
    if (spec.access === "starseed") return "Servidor oficial StarSeed: sin instalar nada, disponible en toda neurona con tu cuenta.";
    if (spec.access === "openrouter") return "En la nube por OpenRouter: modelos :free sin clave, premium con clave.";
    return "Tu propio servidor (API/MCP): corre fuera del dispositivo, disponible en cualquier neurona.";
  }
  const base = fit.level === "ideal" ? "Corre con holgura en local" : fit.level === "suficiente" ? "Corre en local" : fit.level === "justo" ? "Corre justo en local" : "No alcanza para local fluido";
  if (!avail) return `${base}; requiere ${spec.req.chromeAi ? "Chrome AI" : spec.req.webgpu ? "WebGPU" : spec.engine === "Ollama" ? "Ollama activo" : spec.engine === "Astraura 1.58" ? "el backend Astraura 1.58 encendido en esta neurona" : "instalar la app del OS"} para usarlo.`;
  return `${base}, privado y sin conexión.`;
}

function rankKind(caps: NeuronCapabilities, kind: ModelKind, osInstalled: boolean, ctx: { hasAccount?: boolean; online?: boolean }): Recommendation[] {
  const recs = specsFor(kind).map((spec): Recommendation => {
    const fit = fitFor(caps, spec);
    const avail = availableNow(caps, spec, osInstalled, ctx);
    return { spec, fit, availableNow: avail, rationale: rationaleFor(caps, spec, fit, avail) };
  });
  // Orden: encaje ↓ · disponible ahora ↓ · capacidad ↓.
  return recs.sort((a, b) => {
    const f = FIT_SCORE[b.fit.level] - FIT_SCORE[a.fit.level];
    if (f) return f;
    if (a.availableNow !== b.availableNow) return a.availableNow ? -1 : 1;
    return capRank(b.spec) - capRank(a.spec);
  });
}

function bestServerOf(ranked: Recommendation[]): Recommendation {
  const servers = ranked.filter((r) => runsRemotely(r.spec));
  // Preferir StarSeed oficial; si no, el de mayor capacidad.
  const starseed = servers.find((r) => r.spec.access === "starseed");
  return starseed ?? servers.sort((a, b) => capRank(b.spec) - capRank(a.spec))[0] ?? ranked[0];
}

function bestLocalOf(caps: NeuronCapabilities, ranked: Recommendation[]): Recommendation | undefined {
  const locals = ranked.filter((r) => !runsRemotely(r.spec) && r.fit.fits);
  if (!locals.length) return undefined;
  // Preferir el de MAYOR capacidad que encaje al menos "suficiente" y esté disponible.
  const strong = locals
    .filter((r) => FIT_SCORE[r.fit.level] >= 2)
    .sort((a, b) => (Number(b.availableNow) - Number(a.availableNow)) || (capRank(b.spec) - capRank(a.spec)));
  if (strong.length) return strong[0];
  // Si ninguno llega a "suficiente", el mejor "justo" disponible.
  return locals.sort((a, b) => (Number(b.availableNow) - Number(a.availableNow)) || (capRank(b.spec) - capRank(a.spec)))[0];
}

function recommendKind(caps: NeuronCapabilities, kind: ModelKind, opts: RecommendOptions, tier: DeviceTier): KindRecommendation {
  const osInstalled = !!opts.osInstalled || !!caps.installedApp;
  const ctx = { hasAccount: opts.hasAccount ?? true, online: opts.online ?? true };
  const ranked = rankKind(caps, kind, osInstalled, ctx);
  const bestServer = bestServerOf(ranked);
  const bestLocal = bestLocalOf(caps, ranked);
  // Estrategia por defecto: local si hay app instalada, dispositivo no-mínimo y un
  // local decente y DISPONIBLE; si no, servidor.
  const localViable = !!bestLocal && bestLocal.availableNow && FIT_SCORE[bestLocal.fit.level] >= 2 && tier !== "minimo";
  // FAILOVER (Adenda 118): si el servidor NO está disponible ahora (sin cuenta o
  // sin conexión) y hay un local disponible, se recomienda el local aunque la app
  // no esté "instalada" — así la recomendación funciona de verdad sin conexión.
  const best =
    osInstalled && localViable
      ? (bestLocal as Recommendation)
      : !bestServer.availableNow && bestLocal?.availableNow
        ? (bestLocal as Recommendation)
        : bestServer;
  return { best, bestLocal, bestServer, ranked };
}

/** Recomendación completa (LLM + voz) para una neurona. */
export function recommendModels(caps: NeuronCapabilities, opts: RecommendOptions = {}): NeuronRecommendation {
  const online = opts.online ?? (typeof navigator !== "undefined" ? navigator.onLine !== false : true);
  const opts2: RecommendOptions = { ...opts, online };
  const tier = classifyDeviceTier(caps);
  const llm = recommendKind(caps, "llm", opts2, tier);
  const voz = recommendKind(caps, "voz", opts2, tier);
  const strategy: "local" | "servidor" =
    (!runsRemotely(llm.best.spec) || !runsRemotely(voz.best.spec)) ? "local" : "servidor";
  const summary =
    strategy === "local"
      ? `${tierLabel(tier)}: se recomienda LLM «${llm.best.spec.label}» y voz «${voz.best.spec.label}» en local. Todo ajustable por chat, personalidad y cerebro.`
      : `${tierLabel(tier)}: se recomienda usar el servidor — LLM «${llm.best.spec.label}» y voz «${voz.best.spec.label}». Funciona en cualquier neurona sin instalar. Ajustable en todo momento.`;
  return { tier, strategy, llm, voz, summary };
}
