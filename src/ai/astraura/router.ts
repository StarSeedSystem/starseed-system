"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ASTRAURA · ROUTER INTELIGENTE (gratis-primero, transparente, con failover)
 * ---------------------------------------------------------------------------
 * `astrauraChat()` es el punto de entrada agéntico que Aurora usa para hablar
 * con la inteligencia: clasifica la tarea, elige AUTOMÁTICAMENTE el mejor
 * modelo disponible (gratis primero; los servicios del propio usuario tienen
 * prioridad), hace failover en cadena si algo falla, y REGISTRA cada ruta
 * (modelo usado, por qué, alternativas gratuitas y sugerencias de pago) para
 * que el usuario siempre pueda verlo y cambiarlo.
 *
 * Modos (Ajustes → Inteligencia):
 *   · "auto"   (predeterminado) — Aurora busca la mejor opción gratuita.
 *   · "manual" — se respeta el proveedor activo clásico (chat() de siempre).
 *
 * Aditivo: NO cambia chat()/chatSmart(); los llama. Defensivo y SSR-safe.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { chat, type ChatRequest } from "@/ai/client/chat";
import type { ChatMessage, ChatResponse } from "@/ai/providers/types";
import {
  FREE_CATALOG,
  TASK_LABELS,
  findSource,
  paidSuggestionsFor,
  scoreModelForTask,
  type CatalogModel,
  type CatalogSource,
  type TaskKind,
} from "./free-catalog";
import { detectAvailability, userConfigForSource, type SourceAvailability } from "./availability";
import { chromeAiChat, webllmChat, transformersChat } from "./builtin-engines";
import { noteUsage, isCoolingDown, markCooldown } from "./usage";

/* ───────────────────── Ajustes de Inteligencia ───────────────────── */

export const INTELLIGENCE_KEY = "starseed.astraura.intelligence.v1";
export const ROUTES_LOG_KEY = "starseed.astraura.routes.v1";
export const ROUTE_EVENT = "starseed:astraura-route";

export interface IntelligenceSettings {
  /** auto = Aurora elige (gratis primero) · manual = proveedor activo clásico. */
  mode: "auto" | "manual";
  /** Prioriza siempre lo gratuito (por defecto true). */
  freeFirst: boolean;
  /** Anunciar en voz el modelo elegido: al cambiar · siempre · nunca. */
  announce: "on-change" | "always" | "never";
  /** Overrides por tarea: taskKind → `${sourceId}::${modelId}`. */
  perTask: Partial<Record<TaskKind, string>>;
  /** Fuentes deshabilitadas por el usuario (ids del catálogo). */
  disabledSources: string[];
  /** Permitir que el failover use fuentes de pago YA configuradas por el usuario. */
  allowConfiguredPaid: boolean;
}

export const DEFAULT_INTELLIGENCE: IntelligenceSettings = {
  mode: "auto",
  freeFirst: true,
  announce: "on-change",
  perTask: {},
  disabledSources: [],
  allowConfiguredPaid: true,
};

export function getIntelligenceSettings(): IntelligenceSettings {
  if (typeof window === "undefined") return { ...DEFAULT_INTELLIGENCE };
  try {
    const raw = window.localStorage.getItem(INTELLIGENCE_KEY);
    if (!raw) return { ...DEFAULT_INTELLIGENCE };
    const p = JSON.parse(raw);
    return { ...DEFAULT_INTELLIGENCE, ...(p && typeof p === "object" ? p : {}) };
  } catch {
    return { ...DEFAULT_INTELLIGENCE };
  }
}

export function saveIntelligenceSettings(patch: Partial<IntelligenceSettings>): IntelligenceSettings {
  const next = { ...getIntelligenceSettings(), ...patch };
  try {
    window.localStorage.setItem(INTELLIGENCE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("starseed:astraura-intelligence"));
  } catch { /* */ }
  return next;
}

/* ───────────────────── Clasificación de tarea ───────────────────── */

export interface TaskProfile {
  kind: TaskKind;
  needsVision: boolean;
  /** Longitud total aproximada del contexto en caracteres. */
  chars: number;
}

const CODE_RX = /\b(código|codigo|code|función|funcion|script|typescript|javascript|python|css|html|bug|error de|refactor|programa|compil)/i;
const REASON_RX = /\b(razona|demuestra|paso a paso|matemát|matemat|calcula|lógica|logica|planifica|estrategia|analiza a fondo|compara en detalle)/i;
const CREATIVE_RX = /\b(poema|cuento|historia|canción|cancion|letra|guion|relato|imagina|escribe.*(art[íi]culo|ensayo|post))/i;
const TRANSLATE_RX = /\b(traduce|traducción|traduccion|translate|en inglés|al inglés|al francés|al alemán)/i;
const SUMMARY_RX = /\b(resume|resumen|sintetiza|síntesis|sintesis|tl;dr|puntos clave)/i;
const VISION_RX = /\b(imagen adjunta|esta imagen|la foto|captura|screenshot|qué ves|que ves)\b/i;

export function classifyTask(messages: ChatMessage[], hint?: TaskKind): TaskProfile {
  const user = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const chars = messages.reduce((n, m) => n + (m.content?.length ?? 0), 0);
  if (hint) return { kind: hint, needsVision: VISION_RX.test(user), chars };
  let kind: TaskKind = "chat";
  if (CODE_RX.test(user)) kind = "code";
  else if (REASON_RX.test(user)) kind = "reasoning";
  else if (SUMMARY_RX.test(user)) kind = "summary";
  else if (TRANSLATE_RX.test(user)) kind = "translate";
  else if (CREATIVE_RX.test(user)) kind = "creative";
  if (chars > 60_000) kind = "long";
  else if (user.length <= 80 && kind === "chat") kind = "fast";
  return { kind, needsVision: VISION_RX.test(user), chars };
}

/* ───────────────────── Ranking de candidatos ───────────────────── */

export interface RouteCandidate {
  source: CatalogSource;
  model: CatalogModel;
  score: number;
  /** Por qué está en la lista (transparencia). */
  reason: string;
  fromUser: boolean;
}

export function rankCandidates(
  profile: TaskProfile,
  avail: SourceAvailability[],
  prefs: IntelligenceSettings
): RouteCandidate[] {
  const out: RouteCandidate[] = [];
  const override = prefs.perTask[profile.kind];

  for (const a of avail) {
    if (!a.ready) continue;
    if (prefs.disabledSources.includes(a.source.id)) continue;
    if (a.source.tier === "paid" && !(prefs.allowConfiguredPaid && a.userConfig)) continue;
    for (const m of a.source.models) {
      const s = scoreModelForTask(a.source, m, profile.kind, profile.needsVision);
      if (s < 0) continue;
      const fromUser = !!a.userConfig;
      let score = s + (fromUser ? 2.5 : 0); // los servicios del usuario mandan
      if (prefs.freeFirst && a.source.tier === "paid") score -= 6;
      let reason = fromUser
        ? `Servicio que TÚ conectaste (${a.source.label})`
        : a.source.why;
      if (override === `${a.source.id}::${m.id}`) {
        score += 100;
        reason = `Elegido por ti para «${TASK_LABELS[profile.kind]}»`;
      }
      out.push({ source: a.source, model: m, score, reason, fromUser });
    }
  }
  return out.sort((x, y) => y.score - x.score);
}

/* ───────────────────── Registro de rutas (transparencia) ───────────────────── */

export interface RouteRecord {
  at: number;
  task: TaskKind;
  taskLabel: string;
  sourceId: string;
  sourceLabel: string;
  model: string;
  modelLabel: string;
  tier: string;
  free: boolean;
  reason: string;
  ok: boolean;
  ms: number;
  /** Alternativas gratuitas listas para usar (top-3). */
  alternatives: { sourceId: string; label: string; model: string }[];
  /** Sugerencias de pago (solo informativas). */
  paidSuggestions: { label: string; model: string; getKeyUrl?: string }[];
  /** Fallos previos de la cadena en esta llamada (si hubo failover). */
  failovers?: { sourceId: string; error: string }[];
}

export function readRouteLog(): RouteRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ROUTES_LOG_KEY);
    const p = raw ? JSON.parse(raw) : [];
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

export function lastRoute(): RouteRecord | null {
  const log = readRouteLog();
  return log.length ? log[log.length - 1] : null;
}

function pushRouteRecord(rec: RouteRecord): void {
  try {
    const log = readRouteLog();
    log.push(rec);
    window.localStorage.setItem(ROUTES_LOG_KEY, JSON.stringify(log.slice(-40)));
    window.dispatchEvent(new CustomEvent(ROUTE_EVENT, { detail: rec }));
  } catch { /* */ }
}

/* ───────────────────── astrauraChat ───────────────────── */

export interface AstrauraChatRequest {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  onChunk?: (delta: string) => void;
  /** Pista de tarea si el llamador ya la conoce (p.ej. "code" en el editor). */
  taskHint?: TaskKind;
  /** Cerebro activo (se propaga a chatSmart/manual). */
  brainId?: string;
  /** Estado para la UI ("Eligiendo modelo…", "Usando Groq…"). */
  onStatus?: (status: string) => void;
}

/** Ejecuta UNA fuente candidata. Lanza si falla (para el failover). */
async function runCandidate(c: RouteCandidate, req: AstrauraChatRequest): Promise<ChatResponse> {
  const base: Omit<ChatRequest, "providerOverride"> = {
    messages: req.messages,
    temperature: req.temperature,
    maxTokens: req.maxTokens,
    signal: req.signal,
    onChunk: req.onChunk,
  };
  if (c.source.baseUrl === "builtin://chrome-ai") {
    return chromeAiChat(req.messages, { signal: req.signal, onChunk: req.onChunk });
  }
  if (c.source.baseUrl === "builtin://webllm") {
    return webllmChat(c.model.id, req.messages, {
      temperature: req.temperature,
      signal: req.signal,
      onChunk: req.onChunk,
      onProgress: (p) => req.onStatus?.(p ? `Descargando modelo local… ${p}` : ""),
    });
  }
  if (c.source.baseUrl === "builtin://transformers") {
    return transformersChat(c.model.id, req.messages, {
      temperature: req.temperature,
      onChunk: req.onChunk,
      onProgress: (p) => req.onStatus?.(p ? `Cargando SmolLM3 en tu navegador… ${p}` : ""),
    });
  }
  // Config del usuario si existe (lleva su clave); si no, override sin clave
  // (Pollinations/locales). Las free-key sin config NO llegan aquí (ready=false).
  const cfg = userConfigForSource(c.source);
  if (cfg) {
    return chat({ ...base, providerId: cfg.id, model: c.model.id === "local-model" ? cfg.defaultModel : c.model.id });
  }
  return chat({
    ...base,
    providerOverride: {
      providerId: c.source.providerId,
      baseUrl: c.source.baseUrl,
      model: c.model.id,
      label: c.source.label,
    },
  });
}

/**
 * Punto de entrada agéntico. Gratis-primero + failover + transparencia.
 * En modo "manual" delega en el chat clásico (proveedor activo del usuario).
 */
export async function astrauraChat(req: AstrauraChatRequest): Promise<ChatResponse & { route?: RouteRecord }> {
  const prefs = getIntelligenceSettings();

  if (prefs.mode === "manual") {
    return chat({
      messages: req.messages,
      temperature: req.temperature,
      maxTokens: req.maxTokens,
      signal: req.signal,
      onChunk: req.onChunk,
    });
  }

  const profile = classifyTask(req.messages, req.taskHint);
  req.onStatus?.("Eligiendo la mejor inteligencia…");
  const avail = await detectAvailability();
  const candidates = rankCandidates(profile, avail, prefs);

  if (!candidates.length) {
    throw new Error(
      "No encontré ninguna fuente de inteligencia disponible (ni siquiera las gratuitas). Revisa tu conexión o Ajustes → Inteligencia."
    );
  }

  const failovers: { sourceId: string; error: string }[] = [];
  // Saltamos fuentes en cooldown (cuota agotada / 429 reciente): así Aurora
  // SIEMPRE sigue funcionando con la siguiente mejor opción disponible.
  const chain = candidates.filter((c) => !isCoolingDown(c.source.id)).slice(0, 5);
  // Si TODO estaba en cooldown, reintenta igualmente con la mejor (por si ya pasó).
  if (!chain.length && candidates.length) chain.push(candidates[0]);
  for (const c of chain) {
    const t0 = Date.now();
    try {
      req.onStatus?.(`Usando ${c.source.label} · ${c.model.label}…`);
      const res = await runCandidate(c, req);
      // Registra el uso (peticiones/tokens) para el panel de uso y límites.
      try { noteUsage(c.source.id, c.model.id, res?.usage); } catch { /* */ }
      const rec: RouteRecord = {
        at: Date.now(),
        task: profile.kind,
        taskLabel: TASK_LABELS[profile.kind],
        sourceId: c.source.id,
        sourceLabel: c.source.label,
        model: c.model.id,
        modelLabel: c.model.label,
        tier: c.source.tier,
        free: c.source.tier !== "paid",
        reason: c.reason,
        ok: true,
        ms: Date.now() - t0,
        alternatives: candidates
          .filter((x) => x !== c && x.source.tier !== "paid")
          .slice(0, 3)
          .map((x) => ({ sourceId: x.source.id, label: x.source.label, model: x.model.label })),
        paidSuggestions: paidSuggestionsFor(profile.kind).map((p) => ({
          label: p.source.label,
          model: p.model.label,
          getKeyUrl: p.source.getKeyUrl,
        })),
        ...(failovers.length ? { failovers } : {}),
      };
      pushRouteRecord(rec);
      req.onStatus?.("");
      return { ...res, route: rec };
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      // Cuota agotada / límite (429) o "insufficient" → enfría la fuente un rato
      // para que el failover no la reintente y pase a la siguiente gratuita.
      if (/\b429\b|rate.?limit|quota|exhaust|insufficient|too many/i.test(msg)) {
        try { markCooldown(c.source.id); } catch { /* */ }
      }
      failovers.push({ sourceId: c.source.id, error: msg.slice(0, 200) });
    }
  }

  // Toda la cadena falló: registra el último intento como fallido.
  const last = chain[chain.length - 1];
  pushRouteRecord({
    at: Date.now(),
    task: profile.kind,
    taskLabel: TASK_LABELS[profile.kind],
    sourceId: last.source.id,
    sourceLabel: last.source.label,
    model: last.model.id,
    modelLabel: last.model.label,
    tier: last.source.tier,
    free: last.source.tier !== "paid",
    reason: last.reason,
    ok: false,
    ms: 0,
    alternatives: [],
    paidSuggestions: [],
    failovers,
  });
  req.onStatus?.("");
  throw new Error(
    `No pude usar ninguna fuente (${failovers.map((f) => f.sourceId).join(" → ")}). ` +
    `Último error: ${failovers[failovers.length - 1]?.error ?? "desconocido"}`
  );
}

/**
 * Frase de transparencia para que Aurora ANUNCIE qué usó (según ajustes).
 * Devuelve "" si no toca anunciar.
 */
export function announceLine(rec: RouteRecord | null | undefined): string {
  if (!rec || !rec.ok) return "";
  const prefs = getIntelligenceSettings();
  if (prefs.announce === "never") return "";
  if (prefs.announce === "on-change") {
    const log = readRouteLog();
    const prev = log.length >= 2 ? log[log.length - 2] : null;
    if (prev && prev.sourceId === rec.sourceId && prev.model === rec.model) return "";
  }
  const alt = rec.alternatives[0] ? ` Alternativas gratis: ${rec.alternatives.map((a) => a.label).join(", ")}.` : "";
  return `He usado ${rec.sourceLabel} (${rec.modelLabel}, ${rec.free ? "gratis" : "de pago"}) para esta ${rec.taskLabel.toLowerCase()}.${alt} Puedes cambiarlo en Ajustes → Inteligencia.`;
}
