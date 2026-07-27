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
import { decryptKey } from "@/ai/client/keyStorage";
import type { ChatMessage, ChatResponse } from "@/ai/providers/types";
import {
  FREE_CATALOG,
  TASK_LABELS,
  findSource,
  keylessCloudSources,
  paidSuggestionsFor,
  scoreModelForTask,
  toProviderModel,
  type CatalogModel,
  type CatalogSource,
  type TaskKind,
} from "./free-catalog";
import { detectAvailabilitySafe, userConfigForSource, type SourceAvailability } from "./availability";
import { chromeAiChat, chromeAiReadyNow, webllmChat, transformersChat } from "./builtin-engines";
import { noteUsage, isCoolingDown, markCooldown } from "./usage";
import { skillsSystemPrompt, skillsRoutingBias } from "./skills";
import { findOssService } from "@/lib/services/oss-services";
// Personalidad activa (Adenda 63 §11): bloque de system prompt compilado desde
// la personalidad resuelta por contexto (chat > cerebro > sección > global).
// Aditivo y tolerante: sin personalidad activa, no cambia NADA.
// Adenda 67 §P3: además de la voz y el estilo, la personalidad puede FIJAR la
// fuente/modelo de inteligencia por sentido (`intelligencePinFor`).
import {
  resolvePersonalityForContext,
  compilePersonalityPrompt,
  sectionFromPath,
} from "@/lib/aurora/personalities";
import { astrauraMultiContrast } from "@/ai/astraura/astraura-multi";
import {
  intelligencePinFor,
  type AuroraSense,
} from "@/lib/aurora/personalities";
import { systemContextPrompt, screenContextLine, activeProvidersLine } from "./context";
import { buildUserContext, getUserContextSettings } from "./user-context";
import { modeForCategory } from "./provider-resolution";
// Red Mesh Meshtastic (Adenda 97): estado de la malla para la respuesta local
// honesta (SSR-safe: el store no toca window al importarse).
import { getMeshState } from "./mesh/store";
// Estado REAL de la voz (Adenda 87 · anti-alucinación de voz): función pura
// que reutiliza la misma lógica que la tool `estado_voz` y la comprime a una
// línea para el contexto. Aditivo y defensivo: nunca lanza.
import { describeVoiceStateForPrompt } from "@/lib/integrations/aurora-tools";

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
  /**
   * THE HUGGING BAY (jul-2026): descubrimiento inteligente de modelos reales
   * (licencia, confianza, comando de instalación local). Aditivo: nunca
   * descarga ni activa nada por su cuenta, solo sugiere/registra candidatos.
   * Ver architecture/astraura-inteligencia.md §14.
   */
  huggingBay: {
    /** Activa toda la capa de descubrimiento (recomendador/búsqueda/trending). */
    enabled: boolean;
    /** Aurora propone modelos sin que se le pregunte, al detectar una capacidad ausente. */
    autoSuggest: boolean;
    /** Herramienta para la que se genera el "kit local" copiable. */
    preferredTool: "ollama" | "lmstudio" | "comfyui" | "transformers" | "llama.cpp";
    /** Solo licencias permisivas (MIT/Apache-2.0/…) al rankear. */
    permissiveOnly: boolean;
    /** Solo filas hosted/verificadas por Hugging Bay (más fiable, menos resultados). */
    hostedOnly: boolean;
  };
  /**
   * OmniRoute (jul-2026): proxy LOCAL OpenAI-compatible que el usuario corre en su
   * propio equipo (https://github.com/diegosouzapw/OmniRoute) con fallback entre 40+
   * proveedores y compresión de tokens. Astraura NO lo instala ni lo lanza: solo
   * lo considera como una fuente más si `enabled` y responde en `endpoint`.
   * Ver architecture/astraura-inteligencia.md §15.4.
   */
  omniRoute: {
    /** Por defecto false: requiere que el usuario ya lo tenga corriendo. */
    enabled: boolean;
    /** Endpoint OpenAI-compatible local (default puerto habitual del proyecto). */
    endpoint: string;
    /** Bandera ligera: avisa al proxy de que puede aplicar SU compresión de contexto. */
    compressionHint: boolean;
  };
  /**
   * SELECCIÓN AUTOMÁTICA DE HERRAMIENTAS (jul-2026, "Aurora siempre responde"):
   * cuando está ON (por defecto), cada turno evalúa e inyecta en el system
   * prompt las herramientas relevantes por contexto (pantalla, integraciones,
   * generar/usar contenido, contexto de usuario — `aurora-tools.ts`), y Aurora
   * decide sola cuándo invocarlas. Con OFF, Aurora conversa sin ofrecer/usar
   * ninguna tool (chat más predecible). Ver architecture/astraura-inteligencia.md §17.5.
   */
  autoTools: boolean;
  /**
   * MODO MULTI-AGENTE (subagentes OpenRouter :free en paralelo). Cuando está ON,
   * Astraura contrasta cada respuesta con varios subagentes que corren en modelos
   * GRATUITOS distintos de OpenRouter (proxy /api/ai/openrouter, coste 0). Ver
   * astraura-multi.ts. Defensivo: si el proxy no está configurado o fallan los
   * subagentes, la respuesta principal queda intacta.
   */
  multiAgent: boolean;
  /** Nº de subagentes de contraste (2–5). */
  multiAgentWorkers: number;
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
  huggingBay: {
    enabled: true,
    autoSuggest: true,
    preferredTool: "ollama",
    permissiveOnly: true,
    hostedOnly: false,
  },
  omniRoute: {
    enabled: true,
    endpoint: "http://localhost:20128",
    compressionHint: false,
  },
  autoTools: true,
  multiAgent: false,
  multiAgentWorkers: 3,
};

/** Fusiona `IntelligenceSettings` respetando el merge ANIDADO de `huggingBay` y
 *  `omniRoute` (objetos nuevos aditivos): así, ajustes guardados antes de estas
 *  olas —o un patch parcial como `{ huggingBay: { enabled: false } }`— nunca
 *  pierden las subclaves con default seguro que no vinieran en el objeto
 *  persistido. */
function mergeIntelligence(base: IntelligenceSettings, patch: unknown): IntelligenceSettings {
  const p = patch && typeof patch === "object" ? (patch as Partial<IntelligenceSettings>) : {};
  const merged: IntelligenceSettings = { ...base, ...p };
  merged.huggingBay = {
    ...DEFAULT_INTELLIGENCE.huggingBay,
    ...(base.huggingBay && typeof base.huggingBay === "object" ? base.huggingBay : {}),
    ...(p.huggingBay && typeof p.huggingBay === "object" ? p.huggingBay : {}),
  };
  merged.omniRoute = {
    ...DEFAULT_INTELLIGENCE.omniRoute,
    ...(base.omniRoute && typeof base.omniRoute === "object" ? base.omniRoute : {}),
    ...(p.omniRoute && typeof p.omniRoute === "object" ? p.omniRoute : {}),
  };
  return merged;
}

export function getIntelligenceSettings(): IntelligenceSettings {
  if (typeof window === "undefined") return { ...DEFAULT_INTELLIGENCE };
  try {
    const raw = window.localStorage.getItem(INTELLIGENCE_KEY);
    if (!raw) return { ...DEFAULT_INTELLIGENCE };
    const p = JSON.parse(raw);
    return mergeIntelligence(DEFAULT_INTELLIGENCE, p);
  } catch {
    return { ...DEFAULT_INTELLIGENCE };
  }
}

export function saveIntelligenceSettings(patch: Partial<IntelligenceSettings>): IntelligenceSettings {
  const next = mergeIntelligence(getIntelligenceSettings(), patch);
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
  // Modo GLOBAL de conectores por categoría (ai/astraura/provider-resolution.ts,
  // categoría "llm-chat"): capa ADITIVA sobre el gratis-primero de siempre.
  //   · "only-free"  → descarta cualquier fuente de pago aunque esté configurada.
  //   · "prefer-own" → un servicio que el usuario conectó (fromUser) se prioriza
  //     de verdad (sin la penalización freeFirst), en vez de competir en igualdad.
  //   · "auto" (por defecto) → SIN CAMBIOS: el comportamiento gratis-primero de
  //     siempre, exactamente como antes de esta capa.
  let connectorsMode: "auto" | "prefer-own" | "only-free" = "auto";
  try {
    connectorsMode = modeForCategory("llm-chat");
  } catch {
    connectorsMode = "auto";
  }

  for (const a of avail) {
    if (!a.ready) continue;
    if (prefs.disabledSources.includes(a.source.id)) continue;
    if (a.source.tier === "paid" && connectorsMode === "only-free") continue;
    if (a.source.tier === "paid" && !(prefs.allowConfiguredPaid && a.userConfig)) continue;
    for (const m of a.source.models) {
      const s = scoreModelForTask(a.source, m, profile.kind, profile.needsVision);
      if (s < 0) continue;
      const fromUser = !!a.userConfig;
      const preferOwnBoost = connectorsMode === "prefer-own" && fromUser;
      let score = s + (fromUser ? 2.5 : 0); // los servicios del usuario mandan
      if (prefs.freeFirst && a.source.tier === "paid" && !preferOwnBoost) score -= 6;
      if (preferOwnBoost) score += 8; // "usar mi cuenta": gana de verdad, no solo compite
      let reason = fromUser
        ? `Servicio que TÚ conectaste (${a.source.label})`
        : a.source.why;
      if (preferOwnBoost) reason = `${reason} · priorizado (modo "usar mi cuenta" activo)`;
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
  /**
   * true = NINGUNA fuente real respondió y esto es la respuesta LOCAL honesta
   * (plantilla sin red, "Aurora siempre responde"). `ok` sigue en true porque
   * Aurora SÍ contestó — con transparencia — en vez de fallar en seco.
   */
  local?: boolean;
  /** Nº de fuentes probadas en esta llamada (incluye la que ganó, si ganó alguna). */
  attempts?: number;
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
  /** Chat activo (op opcional): permite resolver la personalidad POR CHAT. */
  chatId?: string;
  /**
   * Configuración POR CHAT del menú unificado de Astraura (Adenda 71-bis).
   * Leída de aurora_conversations.meta.config por el llamador y pasada aquí
   * para que las opciones elegidas (modelo, skills, conexiones, sentidos,
   * memorias) afecten de verdad la generación de este chat. Campos opcionales;
   * si falta alguno, el router degrada a su comportamiento normal.
   */
  chatConfig?: {
    provider?: string | null;
    skills?: string[];
    connections?: string[];
    senses?: Record<string, boolean>;
    memoryScope?: string;
  };
  /** Estado para la UI ("Eligiendo modelo…", "Usando Groq…"). */
  onStatus?: (status: string) => void;
  /**
   * FUERZA una fuente/modelo concreto SOLO para esta llamada (lo usa
   * "Reintentar" del menú contextual de mensajes, con un proveedor elegido a
   * mano). Si esa fuente no está disponible ahora mismo, degrada al ranking
   * normal (nunca falla en seco por un forceSource obsoleto).
   */
  forceSource?: { sourceId: string; modelId: string };
}

/**
 * Tiempo máximo por candidato antes de pasar al siguiente (nunca cuelga).
 *
 * (Adenda 67 · P0-2) Los timeouts son GENEROSOS a propósito: con 30 s fijos,
 * Pollinations —que en horas punta encola y puede tardar ~40 s— se declaraba
 * "fallida" cuando en realidad iba a responder. Al ser la única fuente del
 * invitado, cada timeout prematuro se traducía en "no conseguí respuesta".
 * Cada fuente puede declarar su propio `timeoutMs` en el catálogo.
 */
function candidateTimeoutMs(c: RouteCandidate): number {
  if (typeof c.source.timeoutMs === "number" && c.source.timeoutMs > 0) return c.source.timeoutMs;
  // Modelos de navegador ya instalados pueden tardar más en la 1ª carga tras un
  // reinicio; el resto (nube/local HTTP) debe responder rápido o cedemos el turno.
  if (c.source.privacy === "browser") return 90_000;
  if (c.source.privacy === "local") return 20_000;
  return 40_000;
}

/** Sentido de Aurora al que corresponde una clase de tarea (para el pin de personalidad). */
export function senseForTask(kind: TaskKind): AuroraSense {
  switch (kind) {
    case "fast": return "voz";
    case "vision": return "vision";
    case "code": return "codigo";
    case "reasoning": return "razonamiento";
    default: return "texto";
  }
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
  // ── OmniRoute (proxy local): usa el endpoint CONFIGURADO por el usuario en
  //    Ajustes → Inteligencia (no el baseUrl fijo del catálogo), y si
  //    `compressionHint` está activo, avisa al proxy con una línea ligera de
  //    system prompt (no reimplementamos su algoritmo de compresión). ────────
  if (c.source.id === "omniroute-local") {
    let endpoint = c.source.baseUrl;
    let compressionHint = false;
    try {
      const settings = getIntelligenceSettings();
      if (settings.omniRoute?.endpoint) {
        const base = settings.omniRoute.endpoint.replace(/\/+$/, "");
        endpoint = /\/v1$/.test(base) ? base : `${base}/v1`;
      }
      compressionHint = !!settings.omniRoute?.compressionHint;
    } catch { /* defensivo: usa el default del catálogo */ }
    const msgs = compressionHint
      ? mergeSystemPrompt(base.messages, "[OmniRoute] Si tu proxy soporta compresión de contexto, aplícala a esta petición.")
      : base.messages;
    return chat({
      ...base,
      messages: msgs,
      providerOverride: {
        providerId: "openai-compatible",
        baseUrl: endpoint,
        model: c.model.id,
        label: c.source.label,
      },
    });
  }
  // Motores de navegador que NO tienen adaptador HTTP: si llegaran aquí por el
  // camino genérico se enviaría un POST a "builtin://…" (fallo opaco). Fallamos
  // rápido y con un mensaje claro → el failover pasa a la siguiente fuente.
  if (c.source.baseUrl.startsWith("builtin://")) {
    throw new Error(`Motor local "${c.source.label}" no disponible en este contexto.`);
  }

  // ── Resolución de credencial y endpoint (Adenda 67 · P0-2) ────────────────
  // Antes: `chat({ providerId: cfg.id })` → el camino de config guardada busca
  // la PRIMERA config habilitada con ese id. Con varios servicios distintos bajo
  // el mismo id "openai-compatible" (LM Studio, Cerebras, OpenRouter, LLM7…) eso
  // podía mandar la petición al ENDPOINT EQUIVOCADO con la CLAVE equivocada.
  // Ahora resolvemos explícitamente: adaptador del catálogo + baseUrl y clave de
  // la config concreta que sirve a ESTA fuente.
  const cfg = userConfigForSource(c.source);
  const modelId = c.model.id === "local-model" && cfg?.defaultModel ? cfg.defaultModel : c.model.id;
  let apiKey = "";
  if (cfg?.encryptedKey) {
    // Passphrase por defecto ("") — la misma que usa chat() cuando no se le pasa.
    try { apiKey = await decryptKey(cfg.encryptedKey, ""); } catch { apiKey = ""; }
  }
  if (c.source.requiresKey && !apiKey) {
    throw new Error(`${c.source.label}: falta la clave (conéctala en Ajustes → Inteligencia).`);
  }
  return chat({
    ...base,
    providerOverride: {
      providerId: c.source.providerId,
      baseUrl: cfg?.baseUrl || c.source.baseUrl,
      model: modelId,
      // Fuentes `keyOptional` (LLM7, OVH): si el usuario puso clave, sube sus
      // límites; si no, se llama sin ella y funciona igual.
      apiKey,
      label: c.source.label,
    },
  });
}

/* ───────────────────── Garantía de respuesta ("Aurora siempre responde") ───────────────────── */

/**
 * Construye, SIN red, una respuesta final HONESTA cuando ninguna fuente de
 * inteligencia pudo atender la petición: explica qué se intentó y ofrece
 * alternativas ACCIONABLES (conectar una clave gratis, encender un modelo
 * local, reintentar). Pura y defensiva: nunca lanza. NO es una IA real — el
 * `RouteRecord` que la acompaña se marca `local:true` para que la UI (línea de
 * "proceso" / modal "Ver proceso") lo muestre con transparencia total.
 * Ver architecture/astraura-inteligencia.md §17.1.
 */
function buildHonestFallback(
  profile: TaskProfile,
  failovers: { sourceId: string; error: string }[],
  avail: SourceAvailability[],
): string {
  const triedLabels = failovers
    .map((f) => findSource(f.sourceId)?.label ?? f.sourceId)
    .filter(Boolean);
  const uniqueTried = Array.from(new Set(triedLabels));
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const lines: string[] = [
    uniqueTried.length
      ? `No conseguí respuesta de ninguna fuente de inteligencia ahora mismo (probé ${uniqueTried.length}: ${uniqueTried.join(", ")}).`
      : "No conseguí respuesta de ninguna fuente de inteligencia ahora mismo (no encontré ninguna disponible).",
    offline
      ? "Tu dispositivo está SIN CONEXIÓN: ninguna fuente de red puede responder. En cuanto vuelva internet, Aurora funciona sola."
      : "Fallaron incluso las fuentes gratuitas que no necesitan clave, así que lo más probable es un corte de red o un cortafuegos — no es que no quiera ayudarte; te lo digo con honestidad en vez de fingir una respuesta.",
  ];

  const actions: string[] = [];
  const missingFreeKey = avail
    .filter((a) => !a.ready && a.source.tier === "free-key" && a.source.getKeyUrl)
    .slice(0, 2);
  for (const a of missingFreeKey) {
    actions.push(`conecta una clave gratuita de ${a.source.label} en Ajustes → Inteligencia`);
  }
  const localReady = avail.some((a) => a.source.tier === "local" && a.ready);
  if (!localReady) actions.push("enciende Ollama o LM Studio en este equipo (Aurora los detecta solos)");
  actions.push("vuelve a intentarlo en un momento");
  if (actions.length) lines.push(`Puedes: ${actions.join("; ")}.`);
  // ── Red Mesh (Adenda 97) ──: si la malla LoRa de esta neurona está VIVA,
  // la respuesta local lo dice — sin internet, la mensajería corta, la
  // presencia y las alertas comunitarias SIGUEN viajando por radio. La malla
  // es el último transporte de la regla "Astraura siempre funciona".
  try {
    const mesh = getMeshState();
    if (mesh.status === "ready" || mesh.status === "degraded") {
      const nodos = mesh.nodes.filter((n) => !n.isSelf && n.presence === "online").length;
      lines.push(
        `La Red Mesh LoRa está ACTIVA (${nodos} nodo${nodos === 1 ? "" : "s"} al alcance): mensajería corta, presencia y alertas comunitarias siguen funcionando fuera de internet — pestaña «Red Mesh» de Astraura IA.`,
      );
    }
  } catch {
    /* sin subsistema mesh: nada que añadir */
  }
  lines.push(`Petición detectada: ${TASK_LABELS[profile.kind]}. El detalle completo queda en Ajustes → Inteligencia (registro de rutas) y en "Ver proceso" de este mensaje.`);
  return lines.join("\n\n");
}

/** RouteRecord que acompaña a `buildHonestFallback` (mismo contrato que uno real, marcado `local:true`). */
function honestFallbackRecord(
  profile: TaskProfile,
  failovers: { sourceId: string; error: string }[],
  avail: SourceAvailability[],
  lastTried: RouteCandidate | undefined,
): RouteRecord {
  return {
    at: Date.now(),
    task: profile.kind,
    taskLabel: TASK_LABELS[profile.kind],
    sourceId: "local-honest-fallback",
    sourceLabel: "Aurora (respuesta local)",
    model: "template",
    modelLabel: "plantilla honesta",
    providerModel: "local/honest-fallback",
    tier: "local",
    free: true,
    reason: lastTried
      ? `Todas las fuentes probadas fallaron (última: ${lastTried.source.label}).`
      : "No había ninguna fuente de inteligencia disponible (ni siquiera las gratuitas).",
    ok: true,
    local: true,
    ms: 0,
    difficulty: profile.difficulty,
    alternatives: [],
    paidSuggestions: paidSuggestionsFor(profile.kind).map((p) => ({
      label: p.source.label,
      model: p.model.label,
      getKeyUrl: p.source.getKeyUrl,
    })),
    ...(failovers.length ? { failovers } : {}),
    attempts: failovers.length,
  };
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
  // ── Config POR CHAT del menú unificado (Adenda 71-bis) ──────────────────
  // Se lee aquí para poder filtrar capacidades/habilidades por chat abajo.
  const cc = req.chatConfig;
  // ── Capacidades activas (skills.ts) ──
  // Filtro POR CHAT del menú unificado (Adenda 71-bis fix-20): si este chat
  // eligió habilidades concretas, el LLM solo recibe esas (no todas globales).
  const capText = skillsSystemPrompt(cc?.skills && cc.skills.length ? cc.skills : undefined);
  // ── Personalidad activa (Adenda 63 §11) ── resuelta por contexto con
  // prioridad chat > cerebro > sección (ruta de red actual) > global, y
  // compilada a un bloque en español. Tolerante: si nada está activo o algo
  // falla, personaText="" y el prompt queda EXACTAMENTE igual que antes.
  let personaText = "";
  // `persona` se eleva al ámbito de la función: además del prompt, la Adenda 67
  // la usa para el PIN de inteligencia (fuente/modelo fijados por sentido).
  let persona: ReturnType<typeof resolvePersonalityForContext> = null;
  try {
    const section = typeof window !== "undefined" ? sectionFromPath(window.location.pathname) : undefined;
    persona = resolvePersonalityForContext({ section, chatId: req.chatId, brainId: req.brainId });
    if (persona) personaText = compilePersonalityPrompt(persona);
  } catch { /* defensivo: sin personalidad, Aurora sigue igual */ }
  let ctxText = "";
  try {
    const provLine = await activeProvidersLine().catch(() => "");
    ctxText = [systemContextPrompt(), screenContextLine(), provLine].filter(Boolean).join("\n\n");
  } catch { /* defensivo */ }
  // Estado REAL de la voz (Adenda 87 · anti-alucinación de voz): una línea que
  // dice qué motor habla AHORA de verdad (OpenVoice/OmniVoice por defecto,
  // motores manuales solo si están configurados). Sin esto el LLM inventaba
  // motores ("uso VoxCPM con Bark/Kokoro") porque casi nunca invoca la tool
  // `estado_voz`. Defensivo con timeout corto (la función ya tiene el suyo
  // interno; este es un cinturón extra) para NUNCA bloquear la respuesta.
  let voiceStateText = "";
  try {
    voiceStateText = await withTimeout(describeVoiceStateForPrompt(), 2000, "estado de voz").catch(() => "");
  } catch { /* defensivo: sin estado de voz, Aurora sigue igual */ }
  // Contexto TOTAL del usuario (perfiles, grupos, archivos, publicaciones, mensajes
  // sin cuerpo, notificaciones, recordatorios, escritorios, espacios) — SOLO si el
  // usuario lo activó (Ajustes → Aurora e IA; por defecto ON) y hay sesión. Con
  // timeout corto para que una red lenta NUNCA bloquee la respuesta de Aurora.
  let userCtxText = "";
  try {
    const ucSettings = getUserContextSettings();
    if (ucSettings.enabled) {
      userCtxText = await withTimeout(buildUserContext(ucSettings.defaultLevel), 3500, "contexto de usuario").catch(() => "");
    }
  } catch { /* defensivo: Aurora sigue funcionando sin contexto */ }
  // ── Config POR CHAT del menú unificado (Adenda 71-bis) ──────────────────
  // Hace operativas las opciones elegidas en ChatConfigMenu: inyecta las
  // habilidades / conexiones / sentidos / memorias activas de ESTE chat en el
  // system prompt. El PIN de modelo se aplica más abajo (tras rankCandidates).
  let chatCfgNote = "";
  if (cc) {
    const parts: string[] = [];
    if (cc.skills?.length) parts.push(`Habilidades preferidas para este chat: ${cc.skills.join(", ")}.`);
    if (cc.connections?.length) {
      // Resuelve los ids a servicios REALES del catálogo (filtra phantoms) y
      // los lista de forma autoritativa: el LLM solo puede usar esas conexiones.
      const real = cc.connections
        .map((id) => findOssService(id))
        .filter((s): s is NonNullable<typeof s> => !!s)
        .map((s) => s.name || s.id);
      if (real.length) {
        parts.push(`SOLO tienes disponibles estas conexiones para este chat: ${real.join(", ")}. No asumas otras conexiones ni intentes usar servicios externos no listados.`);
      }
    }
    const sensesOn = cc.senses ? Object.keys(cc.senses).filter((k) => cc.senses![k]) : [];
    if (sensesOn.length) parts.push(`Sentidos activos en este chat: ${sensesOn.join(", ")}.`);
    if (cc.memoryScope) parts.push(`Alcance de memoria para este chat: ${cc.memoryScope}.`);
    if (parts.length) chatCfgNote = "CONFIGURACIÓN DE ESTE CHAT (Astraura):\n" + parts.join("\n");
  }
  // `voiceStateText` va ANTES que `capText` (capacidades/skills): así la
  // verdad del estado de voz tiene prioridad sobre el texto de las skills de
  // voz (que ahora hablan en general de motores opcionales, nunca del activo).
  const brainExtra = [personaText, ctxText, voiceStateText, capText, userCtxText, chatCfgNote]
    .filter(Boolean)
    .join("\n\n");
  const messages = brainExtra ? mergeSystemPrompt(req.messages, brainExtra) : req.messages;
  let reqX: AstrauraChatRequest = brainExtra ? { ...req, messages } : req;

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
  // BLINDADO (Adenda 67 · P0-2): `detectAvailability()` se llamaba a pelo, fuera
  // de todo try/catch. Un throw aquí (localStorage corrupto, sonda colgada) mataba
  // la respuesta ANTES de entrar al failover. `detectAvailabilitySafe` nunca lanza
  // y, en el peor caso, devuelve las fuentes SIN CLAVE como listas.
  const avail = await detectAvailabilitySafe();
  const candidates = rankCandidates(profile, avail, prefs);

  // PIN de MODELO por chat (Adenda 71-bis): si el menú fijó un proveedor para
  // este chat y hay un candidato con esa fuente, lo antepone vía forceSource
  // (degrada al ranking normal si esa fuente no está disponible ahora).
  if (req.chatConfig?.provider && !req.forceSource) {
    const pinned = candidates.find((c) => c.source.id === req.chatConfig!.provider);
    if (pinned) reqX = { ...reqX, forceSource: { sourceId: pinned.source.id, modelId: pinned.model.id } };
  }

  const failovers: { sourceId: string; error: string }[] = [];

  // ── Cadena de failover ────────────────────────────────────────────────────
  // Saltamos fuentes en cooldown (cuota agotada / 429 reciente): así Aurora
  // SIEMPRE sigue funcionando con la siguiente mejor opción disponible.
  //
  // DIVERSIDAD DE FUENTES (fix "11 intentos, 8 en la misma fuente muerta"):
  // como máximo 2 modelos por fuente en la cadena principal. Si una fuente está
  // rota (p.ej. clave inválida → 401 en TODOS sus modelos), antes monopolizaba
  // 8 eslabones y dejaba solo 3 huecos para alternativas REALES; ahora la
  // cadena siempre mezcla proveedores distintos.
  const perSource: Record<string, number> = {};
  let chain = candidates
    .filter((c) => !isCoolingDown(c.source.id))
    .filter((c) => {
      const n = perSource[c.source.id] ?? 0;
      if (n >= 2) return false;
      perSource[c.source.id] = n + 1;
      return true;
    })
    .slice(0, 8);
  // Si TODO estaba en cooldown, reintenta igualmente con la mejor (por si ya pasó).
  if (!chain.length && candidates.length) chain.push(candidates[0]);

  // PIN DE PERSONALIDAD (Adenda 67 · P3): si la personalidad activa FIJA una
  // fuente/modelo para este sentido, va PRIMERA. No es exclusiva: si falla, la
  // cadena automática sigue detrás (autocorrección silenciosa — el usuario nunca
  // se queda sin respuesta por un pin obsoleto).
  const pin = intelligencePinFor(persona, senseForTask(profile.kind));
  let pinnedFirst: RouteCandidate | undefined;
  if (pin) {
    pinnedFirst = candidates.find(
      (c) =>
        (!pin.fuente || c.source.id === pin.fuente) &&
        (!pin.modelo || c.model.id === pin.modelo),
    );
    if (pinnedFirst) {
      const p = pinnedFirst;
      chain = [p, ...chain.filter((c) => c !== p)];
    }
  }

  // REINTENTAR con proveedor elegido a mano (menú contextual de mensajes,
  // "Reintentar"): si sigue disponible AHORA se prueba en solitario; si ya no
  // lo está, degradamos con normalidad al ranking automático de arriba (nunca
  // falla en seco por un forceSource obsoleto).
  if (req.forceSource) {
    const forced = candidates.find(
      (c) => c.source.id === req.forceSource!.sourceId && c.model.id === req.forceSource!.modelId,
    );
    if (forced) chain = [forced];
  }

  // ÚLTIMOS RECURSOS GARANTIZADOS (la raíz del bug P0-2).
  // Antes solo se añadía Pollinations al final… y Pollinations era, además, la
  // ÚNICA fuente sin clave del catálogo: la "cadena de failover" de un invitado
  // era una cadena de UN eslabón. Si Pollinations encolaba, daba 404 en un modelo
  // muerto o se enfriaba por un 429, Aurora se quedaba SIN CEREBRO.
  // Ahora garantizamos que TODAS las fuentes gratis-SIN-CLAVE (OVHcloud anónimo,
  // LLM7.io, Pollinations) estén al final de la cadena, en orden de calidad, y
  // Pollinations SIEMPRE la última (nunca se enfría, es la red de seguridad final).
  for (const src of keylessCloudSources()) {
    if (prefs.disabledSources.includes(src.id)) continue;
    if (chain.some((c) => c.source.id === src.id)) continue;
    const fb = candidates.find((c) => c.source.id === src.id);
    if (fb) chain.push(fb);
  }
  // Pollinations SIEMPRE la última (red de seguridad final: nunca se enfría, pero
  // es la más lenta y la de menor calidad). `sort` es estable en JS ⇒ el resto de
  // la cadena conserva su orden de ranking.
  // EXCEPCIONES: si el usuario forzó una fuente a mano (`forceSource`) o la
  // personalidad la fijó (`pinnedFirst`), su elección MANDA — no la degradamos.
  const respectExplicitChoice = !!req.forceSource || !!pinnedFirst;
  if (!respectExplicitChoice) {
    chain.sort(
      (a, b) =>
        Number(a.source.id === "pollinations-text") - Number(b.source.id === "pollinations-text"),
    );
  }

  // Fuentes declaradas MUERTAS durante ESTA petición (fallo de autenticación:
  // 401/403/clave inválida). Un fallo de clave es DETERMINISTA — si un modelo
  // de la fuente lo da, lo darán todos — así que no se reintenta ni una vez más.
  const deadSources = new Set<string>();

  for (const c of chain) {
    if (deadSources.has(c.source.id)) continue; // clave rota: ni lo intentamos
    const t0 = Date.now();
    try {
      req.onStatus?.(`Usando ${c.source.label} · ${c.model.label}…`);
      // REGLA DURA DEL PROYECTO: `Promise.resolve().then(step)`. Si `runCandidate`
      // lanzara de forma SÍNCRONA (antes del primer await — p.ej. `getProvider()`
      // con un id desconocido), el throw escaparía del `try` y ROMPERÍA todo el
      // failover en vez de pasar a la siguiente fuente.
      const res = await withTimeout(
        Promise.resolve().then(() => runCandidate(c, reqX)),
        candidateTimeoutMs(c),
        c.source.label,
      );
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
        attempts: failovers.length + 1,
      };
      pushRouteRecord(rec);
      req.onStatus?.("");
      // ── MODO MULTI-AGENTE (subagentes OpenRouter :free) ─────────────────────
      // Si el usuario lo activó, contrastamos la respuesta principal con varios
      // subagentes que corren en modelos :free distintos (proxy /api/ai/openrouter,
      // coste 0). Defensivo: cualquier fallo deja `res` intacta (SAFETY CONTRACT).
      if (prefs.multiAgent && res?.text?.trim()) {
        try {
          const enriched = await astrauraMultiContrast({
            messages: reqX.messages,
            primary: res,
            signal: req.signal,
            workers: Math.max(1, Math.min(5, prefs.multiAgentWorkers || 3)),
          });
          if (enriched.enriched && enriched.text) {
            return { ...res, text: enriched.text, route: rec };
          }
        } catch {
          /* contraste falló → devolvemos la respuesta principal sin tocar */
        }
      }
      return { ...res, route: rec };
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      // Cuota agotada / límite (429) o "insufficient" → enfría la fuente. Si el
      // proveedor DICE cuánto ("Retry after 4851 seconds" · "retry in 2h"), le
      // hacemos caso EXACTO (Adenda 87) — ni martillear antes de tiempo ni
      // castigar de más una fuente que vuelve en minutos.
      if (/\b429\b|rate.?limit|quota|exhaust|insufficient|too many/i.test(msg)) {
        let mins: number | undefined;
        const mSec = msg.match(/retry(?:\s+it)?\s+(?:after|in)\s+(\d+)\s*s/i);
        const mMin = msg.match(/retry(?:\s+it)?\s+(?:after|in)\s+(\d+)\s*m/i);
        const mHor = msg.match(/retry(?:\s+it)?\s+(?:after|in)\s+(\d+)\s*h/i);
        if (mSec) mins = Math.max(1, Math.ceil(Number(mSec[1]) / 60));
        else if (mMin) mins = Math.max(1, Number(mMin[1]));
        else if (mHor) mins = Math.max(1, Number(mHor[1]) * 60);
        // "free-models-per-day" = cupo DIARIO agotado → hasta ~medianoche UTC.
        if (!mins && /per.?day|daily/i.test(msg)) {
          const now = new Date();
          const midnightUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
          mins = Math.max(10, Math.ceil((midnightUtc - now.getTime()) / 60_000));
        }
        try { markCooldown(c.source.id, mins); } catch { /* */ }
      }
      // CLAVE INVÁLIDA (401/403/unauthorized): fallo DETERMINISTA de toda la
      // fuente. La declaramos muerta para esta petición (no quemamos más
      // eslabones en ella) y la enfriamos 30 min para los próximos turnos —
      // así el primer mensaje falla UNA vez por fuente rota y los siguientes
      // van directos a las alternativas vivas. El aviso de la clave sigue
      // visible en el registro de rutas y en la respuesta honesta.
      if (/\b401\b|\b403\b|unauthorized|forbidden|clave no válida|invalid.{0,12}key|api.?key/i.test(msg)) {
        deadSources.add(c.source.id);
        try { markCooldown(c.source.id, 30); } catch { /* */ }
      }
      failovers.push({ sourceId: c.source.id, error: msg.slice(0, 200) });
    }
  }

  // ── ÚLTIMO RECURSO REAL: el modelo del PROPIO NAVEGADOR ───────────────────
  // Toda la cadena de red falló (offline, cortafuegos, todas las cuotas
  // agotadas…). Antes de rendirnos: si este navegador trae la Prompt API con un
  // modelo YA LISTO (Gemini Nano descargado), Aurora responde con él. Es IA de
  // verdad, sin red y sin coste. Solo si está "available"/"readily" — jamás
  // dispara una descarga de GB sin permiso — y siempre topado con timeout.
  try {
    if (await chromeAiReadyNow()) {
      req.onStatus?.("Usando la IA de tu navegador (sin red)…");
      const t0 = Date.now();
      const res = await withTimeout(
        Promise.resolve().then(() => chromeAiChat(reqX.messages, { signal: req.signal, onChunk: req.onChunk })),
        60_000,
        "IA del navegador",
      );
      if (res && String(res.text ?? "").trim()) {
        const src = findSource("chrome-ai");
        const rec: RouteRecord = {
          at: Date.now(),
          task: profile.kind,
          taskLabel: TASK_LABELS[profile.kind],
          sourceId: "chrome-ai",
          sourceLabel: src?.label ?? "IA del navegador",
          model: "gemini-nano",
          modelLabel: "Gemini Nano (integrado)",
          providerModel: "browser/gemini-nano",
          tier: "instant",
          free: true,
          reason: "Ninguna fuente de red respondió; usé el modelo local de tu navegador.",
          ok: true,
          ms: Date.now() - t0,
          difficulty: profile.difficulty,
          alternatives: [],
          paidSuggestions: [],
          failovers,
          attempts: failovers.length + 1,
        };
        try { noteUsage("chrome-ai", "gemini-nano"); } catch { /* */ }
        pushRouteRecord(rec);
        req.onStatus?.("");
        return { ...res, route: rec };
      }
    }
  } catch (e: any) {
    failovers.push({ sourceId: "chrome-ai", error: String(e?.message ?? e).slice(0, 200) });
  }

  // ── SEGUNDA OPORTUNIDAD AUTOMÁTICA (Adenda 89) ────────────────────────────
  // La cadena ENTERA falló. El usuario observa que "reintentar (o probar en otra
  // neurona) suele funcionar" → casi siempre es TRANSITORIO: un 429 momentáneo,
  // Pollinations encolando, un microcorte de red. Antes de rendirnos, Aurora
  // reintenta SOLA y en silencio las fuentes SIN CLAVE (que nunca se enfrían)
  // tras una breve espera. Así responde sin que el usuario tenga que reintentar
  // a mano. Acotado (2 pasadas, timeouts recortados) para no colgarse.
  {
    const retrySources = keylessCloudSources()
      .filter((src) => !prefs.disabledSources.includes(src.id))
      .map((src) => candidates.find((c) => c.source.id === src.id))
      .filter((c): c is RouteCandidate => !!c)
      .slice(0, 3);
    for (let pass = 0; pass < 2 && retrySources.length; pass++) {
      req.onStatus?.("Reintentando automáticamente…");
      await new Promise((r) => setTimeout(r, 1200 + pass * 1600));
      for (const c of retrySources) {
        if (req.signal?.aborted) break;
        const t0 = Date.now();
        try {
          const res = await withTimeout(
            Promise.resolve().then(() => runCandidate(c, reqX)),
            Math.min(candidateTimeoutMs(c), 22_000),
            c.source.label,
          );
          if (!res || !String(res.text ?? "").trim()) throw new Error("respuesta vacía");
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
            reason: "Toda la cadena falló por un corte transitorio; Aurora reintentó sola y esta fuente sin clave respondió.",
            ok: true,
            ms: Date.now() - t0,
            difficulty: profile.difficulty,
            alternatives: [],
            paidSuggestions: [],
            ...(failovers.length ? { failovers } : {}),
            attempts: failovers.length + 1,
          };
          pushRouteRecord(rec);
          req.onStatus?.("");
          return { ...res, route: rec };
        } catch (e: any) {
          failovers.push({ sourceId: c.source.id, error: "reintento: " + String(e?.message ?? e).slice(0, 180) });
        }
      }
    }
  }

  // Toda la cadena falló: GARANTÍA DE RESPUESTA — NUNCA un error crudo. En vez
  // de lanzar, Aurora contesta con una respuesta LOCAL honesta (sin red) que
  // explica qué probó y qué puede hacer el usuario. Ver §17.1 de la doc.
  const last = chain[chain.length - 1];
  const rec = honestFallbackRecord(profile, failovers, avail, last);
  pushRouteRecord(rec);
  req.onStatus?.("");
  return { text: buildHonestFallback(profile, failovers, avail), route: rec };
}

/**
 * Frase de transparencia para que Aurora ANUNCIE qué usó (según ajustes).
 * Devuelve "" si no toca anunciar.
 */
export function announceLine(rec: RouteRecord | null | undefined): string {
  if (!rec || !rec.ok) return "";
  // La respuesta LOCAL honesta (§17.1) ya se explica sola: anunciarla encima
  // ("He usado Aurora (respuesta local)…") sería ruido, no transparencia.
  if (rec.local) return "";
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
