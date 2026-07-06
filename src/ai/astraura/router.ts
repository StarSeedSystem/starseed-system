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
  toProviderModel,
  type CatalogModel,
  type CatalogSource,
  type TaskKind,
} from "./free-catalog";
import { detectAvailability, userConfigForSource, type SourceAvailability } from "./availability";
import { chromeAiChat, webllmChat, transformersChat } from "./builtin-engines";
import { noteUsage, isCoolingDown, markCooldown } from "./usage";
import { skillsSystemPrompt, skillsRoutingBias } from "./skills";
import { systemContextPrompt, screenContextLine } from "./context";

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
  /**
   * Enrutado por dificultad (patrón RouteLLM): estima lo difícil que es la
   * petición y sube el peso de los modelos FUERTES para lo difícil y de los
   * RÁPIDOS/baratos para lo trivial. Siempre respeta freeFirst. (Por defecto on.)
   */
  difficultyRouting: boolean;
  /** Umbral 0..1 a partir del cual una tarea se considera "difícil". */
  strongThreshold: number;
}

export const DEFAULT_INTELLIGENCE: IntelligenceSettings = {
  mode: "auto",
  freeFirst: true,
  announce: "on-change",
  perTask: {},
  disabledSources: [],
  allowConfiguredPaid: true,
  difficultyRouting: true,
  strongThreshold: 0.6,
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
  /** Dificultad estimada 0..1 (0 = trivial, 1 = muy difícil). Informativa. */
  difficulty: number;
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
  const difficulty = estimateDifficulty(messages);
  if (hint) return { kind: hint, needsVision: VISION_RX.test(user), chars, difficulty };
  let kind: TaskKind = "chat";
  if (CODE_RX.test(user)) kind = "code";
  else if (REASON_RX.test(user)) kind = "reasoning";
  else if (SUMMARY_RX.test(user)) kind = "summary";
  else if (TRANSLATE_RX.test(user)) kind = "translate";
  else if (CREATIVE_RX.test(user)) kind = "creative";
  if (chars > 60_000) kind = "long";
  else if (user.length <= 80 && kind === "chat") kind = "fast";
  return { kind, needsVision: VISION_RX.test(user), chars, difficulty };
}

/* ───────────────────── Estimación de dificultad (patrón RouteLLM) ───────────────────── */

// Señales de razonamiento profundo / multi-paso (además de REASON_RX).
const DIFFICULTY_REASON_RX = /\b(demuestra|paso a paso|analiza a fondo|matemát|matemat|razona|deduce|optimiza|arquitectura|diseña un|compleja|complejo|teorema|integral|derivada|algoritmo|complejidad|prueba que)\b/i;

/**
 * Estima 0..1 lo difícil que es una petición mediante heurísticas BARATAS
 * (sin red, sin modelo): longitud total, presencia de código, señales de
 * razonamiento, número de pasos/preguntas y contexto largo. 0 = trivial,
 * 1 = muy difícil. Pura y defensiva: nunca lanza.
 *
 * Inspirado en RouteLLM: dirigir lo difícil a modelos fuertes y lo trivial a
 * modelos rápidos/baratos, ahorrando cuota gratuita para cuando importa.
 */
export function estimateDifficulty(messages: ChatMessage[]): number {
  try {
    const user = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const totalChars = messages.reduce((n, m) => n + (m.content?.length ?? 0), 0);
    let d = 0;

    // 1) Longitud del turno del usuario (peticiones largas suelen pedir más).
    const len = user.length;
    if (len > 1200) d += 0.3;
    else if (len > 500) d += 0.2;
    else if (len > 200) d += 0.1;

    // 2) Contexto total muy largo (documentos, memorias, hilos extensos).
    if (totalChars > 20_000) d += 0.2;
    else if (totalChars > 8_000) d += 0.1;

    // 3) Código o depuración → suele requerir capacidad.
    if (CODE_RX.test(user) || /```|\bstack ?trace\b|traceback/i.test(user)) d += 0.25;

    // 4) Razonamiento profundo / matemáticas / diseño.
    if (REASON_RX.test(user) || DIFFICULTY_REASON_RX.test(user)) d += 0.25;

    // 5) Multi-paso / listas de requisitos / muchas preguntas.
    const questions = (user.match(/\?/g) || []).length;
    if (questions >= 3) d += 0.15;
    else if (questions === 2) d += 0.08;
    const steps = (user.match(/\b(\d+[.)]\s|primero|luego|después|despues|finalmente|además|ademas)\b/gi) || []).length;
    if (steps >= 4) d += 0.15;
    else if (steps >= 2) d += 0.08;
    if (/\b(y también|and also|paso a paso|uno por uno|para cada|todos los)\b/i.test(user)) d += 0.05;

    return Math.max(0, Math.min(1, d));
  } catch {
    return 0.4; // neutro-medio si algo raro pasa
  }
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

/** ¿Es un modelo "fuerte" (para tareas difíciles)? Heurística por calidad. */
function isStrongModel(m: CatalogModel): boolean {
  return (m.quality ?? 0) >= 8;
}

/** ¿Es un modelo rápido/barato (ideal para tareas triviales)? */
function isFastModel(source: CatalogSource, m: CatalogModel): boolean {
  if (m.strengths.includes("fast")) return true;
  const id = m.id.toLowerCase();
  if (source.id.startsWith("groq") && /8b|instant/.test(id)) return true; // Groq 8B
  if (/flash-lite|gemini-nano|gemma/.test(id)) return true;                // Gemini flash-lite / Gemma / Nano
  if (/8b|3b|4b|mini|lite|nano|small/.test(id)) return true;              // modelos pequeños en general
  return false;
}

/**
 * Ajuste de puntuación por DIFICULTAD (patrón RouteLLM), aditivo sobre el score
 * base. Difícil (>= strongThreshold) favorece modelos fuertes; trivial
 * (< ~strongThreshold/1.7) favorece modelos rápidos/baratos. Zona media: neutral.
 * Nunca penaliza tanto como para invertir la prioridad de los servicios del
 * usuario o los overrides. Devuelve el delta a sumar y una etiqueta opcional.
 */
export function difficultyAdjustment(
  source: CatalogSource,
  m: CatalogModel,
  difficulty: number,
  strongThreshold: number
): { delta: number; note?: string } {
  const hi = Math.max(0.3, Math.min(0.95, strongThreshold));
  const lo = hi / 1.7; // umbral "trivial" derivado del umbral "difícil"
  if (difficulty >= hi) {
    if (isStrongModel(m)) return { delta: 4, note: "tarea difícil → modelo fuerte" };
    if (isFastModel(source, m)) return { delta: -3 }; // desincentiva lo flojo en lo difícil
    return { delta: 0 };
  }
  if (difficulty <= lo) {
    if (isFastModel(source, m)) return { delta: 3, note: "tarea sencilla → modelo rápido" };
    if (isStrongModel(m)) return { delta: -2 }; // ahorra cuota de los fuertes en lo trivial
    return { delta: 0 };
  }
  return { delta: 0 };
}

export function rankCandidates(
  profile: TaskProfile,
  avail: SourceAvailability[],
  prefs: IntelligenceSettings
): RouteCandidate[] {
  const out: RouteCandidate[] = [];
  const override = prefs.perTask[profile.kind];
  const difficultyOn = prefs.difficultyRouting !== false;
  const strongThreshold = typeof prefs.strongThreshold === "number" ? prefs.strongThreshold : 0.6;

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
      // Capa RouteLLM: reordena por dificultad estimada (aditivo, defensivo).
      if (difficultyOn) {
        const adj = difficultyAdjustment(a.source, m, profile.difficulty, strongThreshold);
        if (adj.delta) score += adj.delta;
        if (adj.note && !fromUser) reason = `${reason} · ${adj.note}`;
      }
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
  /** Nombre "provider/model" estilo LiteLLM (etiqueta/telemetría). */
  providerModel?: string;
  tier: string;
  free: boolean;
  reason: string;
  ok: boolean;
  ms: number;
  /** Dificultad estimada de la petición 0..1 (informativa). */
  difficulty?: number;
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

/** Tiempo máximo por candidato antes de pasar al siguiente (nunca cuelga). */
function candidateTimeoutMs(c: RouteCandidate): number {
  // Modelos de navegador ya instalados pueden tardar más en la 1ª carga tras un
  // reinicio; el resto (nube/local HTTP) debe responder rápido o cedemos el turno.
  if (c.source.privacy === "browser") return 90_000;
  if (c.source.privacy === "local") return 20_000;
  return 30_000;
}

/** Antepone/mezcla un bloque de system prompt (Capacidades de Aurora) sin
 *  duplicar: si ya hay un mensaje `system`, se le añade al final; si no, se
 *  inserta uno al inicio. Devuelve una copia (no muta el original). */
function mergeSystemPrompt(messages: ChatMessage[], extra: string): ChatMessage[] {
  if (!extra) return messages;
  const idx = messages.findIndex((m) => m.role === "system");
  if (idx >= 0) {
    const copy = messages.slice();
    copy[idx] = { ...copy[idx], content: `${copy[idx].content}\n\n${extra}` };
    return copy;
  }
  return [{ role: "system", content: extra } as ChatMessage, ...messages];
}

/** Envuelve una promesa con un timeout que rechaza (para el failover). */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout ${label} (${Math.round(ms / 1000)}s)`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
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

  // ── Capacidades vivas de Aurora (skills instaladas desde la Biblioteca) ──
  // Se inyectan SIEMPRE (manual o auto): (1) system prompt en el cerebro y
  // (2) sesgo de routing. Defensivo: sin skills, `capText`="" y nada cambia.
  // Cerebro contextual: (1) conocimiento del sistema/secciones/enlaces (context.ts),
  // (2) resumen de la pantalla actual, (3) capacidades activas (skills.ts). Todo
  // se antepone al system prompt para que Aurora sepa DÓNDE está y qué puede hacer.
  const capText = skillsSystemPrompt();
  let ctxText = "";
  try { ctxText = [systemContextPrompt(), screenContextLine()].filter(Boolean).join("\n\n"); } catch { /* defensivo */ }
  const brainExtra = [ctxText, capText].filter(Boolean).join("\n\n");
  const messages = brainExtra ? mergeSystemPrompt(req.messages, brainExtra) : req.messages;
  const reqX: AstrauraChatRequest = brainExtra ? { ...req, messages } : req;

  if (prefs.mode === "manual") {
    return chat({
      messages,
      temperature: req.temperature,
      maxTokens: req.maxTokens,
      signal: req.signal,
      onChunk: req.onChunk,
    });
  }

  const profile = classifyTask(messages, req.taskHint);
  // Sesgo de routing por capacidad: preferStrong/planning suben la dificultad
  // (RouteLLM → modelo más capaz); vision marca necesidad de visión.
  const capBias = skillsRoutingBias();
  if (capBias.preferStrong || capBias.planning) {
    profile.difficulty = Math.min(1, profile.difficulty + 0.25);
  }
  if (capBias.vision) profile.needsVision = true;
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
  const chain = candidates.filter((c) => !isCoolingDown(c.source.id)).slice(0, 8);
  // Si TODO estaba en cooldown, reintenta igualmente con la mejor (por si ya pasó).
  if (!chain.length && candidates.length) chain.push(candidates[0]);
  // ÚLTIMO RECURSO garantizado: Pollinations (gratis, SIN clave, siempre disponible).
  // Así Aurora casi NUNCA tiene que decir "hubo un error": si por lo que sea no
  // quedó en la cadena, lo añadimos al final para que SIEMPRE haya una IA que
  // responda antes de rendirse.
  if (!chain.some((c) => c.source.id === "pollinations-text")) {
    const fb = candidates.find((c) => c.source.id === "pollinations-text");
    if (fb) chain.push(fb);
  }
  for (const c of chain) {
    const t0 = Date.now();
    try {
      req.onStatus?.(`Usando ${c.source.label} · ${c.model.label}…`);
      const res = await withTimeout(runCandidate(c, reqX), candidateTimeoutMs(c), c.source.label);
      // Respuesta vacía = fallo real: NO la mostramos, pasamos a la siguiente IA.
      if (!res || !String(res.text ?? "").trim()) throw new Error("respuesta vacía");
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
        providerModel: toProviderModel(c.source, c.model),
        tier: c.source.tier,
        free: c.source.tier !== "paid",
        reason: c.reason,
        ok: true,
        ms: Date.now() - t0,
        difficulty: profile.difficulty,
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
    providerModel: toProviderModel(last.source, last.model),
    tier: last.source.tier,
    free: last.source.tier !== "paid",
    reason: last.reason,
    ok: false,
    ms: 0,
    difficulty: profile.difficulty,
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
