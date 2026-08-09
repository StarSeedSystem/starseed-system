"use client";

/**
 * StarSeed OS — PIPELINE COMPARTIDO de turno de Aurora/Astraura (Adenda 71-ter · I1)
 * ============================================================================
 * `sendAuroraTurn()` encapsula TODO lo que hasta ahora sólo hacía bien el chat
 * de la orbe flotante (`engine.runCommand`), para que CUALQUIER superficie
 * (orbe, `/agent`, multichat, Exocórtex, mini-reproductor…) obtenga lo mismo sin
 * duplicar lógica:
 *
 *   1. Resolución de personalidad POR CONTEXTO — chat > entidad > cerebro >
 *      sección > global — (vía `resolvePersonalityForContext`, la MISMA que usa
 *      `astrauraChat` internamente, así que la personalidad se inyecta una sola
 *      vez y sin duplicados).
 *   2. System prompt COMPLETO del orbe: acciones `[[ACCION:…]]` + herramientas
 *      del cerebro activo + conocimiento del ecosistema + nota de contexto de
 *      ruta. La personalidad + contexto de usuario + skills los añade
 *      `astrauraChat` (no se repiten aquí).
 *   3. Lectura de `aurora_conversations.meta.config` del chat (proveedor fijado,
 *      skills, conexiones, sentidos, alcance de memoria, voz, personalidad).
 *   4. Llamada a `astrauraChat({ messages, brainId, chatId, chatConfig, onChunk })`
 *      — router gratis-primero con failover, streaming opcional.
 *   5. Ejecución de directivas `[[ACCION:…]]` (control real del OS) vía el puente
 *      global `window.STARSEED_AURORA` (sin reimplementar el motor de acciones).
 *   6. Persistencia del turno (usuario + respuesta) en la conversación unificada
 *      (`appendMessage`), idempotente y en tiempo real.
 *   7. Salida de VOZ opcional respetando el estilo de la personalidad y el toggle
 *      `meta.config.voice` del chat, reutilizando el TTS del engine vía el puente
 *      (NO se duplica el motor de voz).
 *
 * Todo es defensivo: si el puente no está montado, si falta sesión o si algo
 * falla, degrada con gracia y NUNCA lanza hacia el llamador (salvo abort).
 *
 * ── API pública ─────────────────────────────────────────────────────────────
 *   sendAuroraTurn(opts): Promise<AuroraTurnResult>
 *   composeAuroraSystem(opts): Promise<string>   — sólo los extras del orbe
 *   resolveTurnPersona(opts): TurnPersona | null — persona + voz + temperatura
 *   speakAuroraReply(text, opts): void           — voz por el puente, respeta cfg
 *   getChatConfig(convId): ChatConfig            — meta.config cacheada del chat
 */

import type { ChatMessage } from "@/ai/providers/types";
import { astrauraChat, getIntelligenceSettings } from "@/ai/astraura/router";
// Adenda 101: transmisión contextual del turno por la RED SINÁPTICA (fire-and-forget).
import { transmitForContext, normalizeConnectivityConfig } from "@/ai/astraura/mesh";
import {
  actionsSystemPromptSection,
  auroraToolsActionPromptSection,
  parseDirectives,
  stripDirectives,
} from "@/lib/aurora/actions";
import { buildSystemKnowledge } from "@/lib/aurora/system-knowledge";
import {
  resolvePersonalityForContext,
  compilePersonalityPrompt,
  sectionFromPath,
  type PersonalityProfile,
} from "@/lib/aurora/personalities";
import {
  appendMessage,
  cachedConversations,
  cachedMessages,
  ensureActiveConversation,
  getActiveConversationId,
  type AiSurface,
} from "@/lib/aurora/conversations";
import type { ChatConfig } from "@/components/aurora/chat-config-menu";
import type { AuroraMessageMeta } from "@/lib/aurora/engine";
import { buildAttachmentsContext, type UniversalAttachment } from "@/lib/aurora/attachments";
import { workspaceSystemExtra } from "@/lib/workspaces/workspaces";
import { describeUserVoiceEmotionForPrompt } from "@/lib/aurora/audio-emotion";

// ── Tipos ────────────────────────────────────────────────────────────────────

/** Puente global expuesto por AuroraProvider (aurora-provider.tsx). */
interface AuroraBridge {
  runDirectives?: (text: string) => Promise<unknown>;
  speak?: (text: string, forcePersonality?: unknown) => void;
}

function bridge(): AuroraBridge | null {
  if (typeof window === "undefined") return null;
  return ((window as unknown as { STARSEED_AURORA?: AuroraBridge }).STARSEED_AURORA) ?? null;
}

export interface SendAuroraTurnOptions {
  /** Texto del usuario para este turno (se recorta). */
  text: string;
  /** Conversación destino. Por defecto: la activa (creándola si hace falta). */
  convId?: string | null;
  /** Cerebro activo (herramientas + routing). */
  brainId?: string;
  /** Superficie de origen (para la conversación nueva y la transparencia). */
  surface?: AiSurface;
  /** Etiqueta de ruta actual (conocimiento + nota de contexto). Por defecto: URL. */
  route?: string;
  /**
   * Historial previo. Si se omite, se deriva de la conversación unificada
   * (caché) — así el turno ve TODO lo hablado en este hilo por voz o texto.
   */
  history?: ChatMessage[];
  /** Bloque de system prompt propio del llamador (persona de agente, reglas…). */
  systemExtra?: string;
  /** Temperatura. Por defecto se deriva de la personalidad activa. */
  temperature?: number;
  signal?: AbortSignal;
  /** Streaming: se llama con cada fragmento de texto (ya sin directivas). */
  onChunk?: (delta: string) => void;
  /** Estado para la UI ("Eligiendo modelo…", "Usando Groq…"). */
  onStatus?: (status: string) => void;
  /**
   * Voz. `undefined` → automático: activa si el chat no la desactivó
   * (`meta.config.voice !== false`) y la personalidad tiene voz. `true`/`false`
   * la fuerza.
   */
  speak?: boolean;
  /** Persistir el mensaje del usuario (por defecto true). */
  persistUser?: boolean;
  /** Persistir la respuesta del asistente (por defecto true). */
  persistAssistant?: boolean;
  /** Etiqueta de origen/proveedor para el mensaje persistido. */
  source?: string | null;
  /**
   * Adjuntos del turno (dispositivo/bibliotecas/neuronas/red). Se persisten con
   * el mensaje del usuario (`astraura_messages.attachments`) y su contexto se
   * inyecta al modelo: contenido de los legibles (≤64KB) o nombre+tipo si no.
   */
  attachments?: UniversalAttachment[] | null;
}

export interface AuroraTurnResult {
  /** Respuesta final (directivas ya extraídas). */
  text: string;
  /** Metadatos de proceso (proveedor/modelo/coste/herramientas). */
  meta: AuroraMessageMeta;
  /** Conversación en la que cayó el turno. */
  convId: string;
  /** Directivas ejecutadas (nombre + ok). */
  actions: { name: string; ok: boolean }[];
  /** Personalidad efectiva resuelta para este turno (o null). */
  persona: PersonalityProfile | null;
}

export interface TurnPersona {
  profile: PersonalityProfile;
  /** ¿Tiene voz configurada (género/idioma/tono)? */
  hasVoice: boolean;
  /** Temperatura derivada de la creatividad del perfil (0.4–1.0). */
  temperature: number;
}

// ── Config del chat (meta.config cacheada) ──────────────────────────────────

/**
 * Lee la config POR CHAT del menú unificado desde la caché de conversaciones
 * (mantenida en vivo por el sync realtime). Barato y síncrono. `{}` si no hay.
 */
export function getChatConfig(convId?: string | null): ChatConfig {
  if (!convId) return {};
  try {
    const conv = cachedConversations().find((c) => c.id === convId);
    const cfg = (conv?.meta as { config?: ChatConfig } | null | undefined)?.config;
    return cfg && typeof cfg === "object" ? cfg : {};
  } catch {
    return {};
  }
}

/** Subconjunto de `ChatConfig` que entiende `astrauraChat`. */
function toRouterChatConfig(cfg: ChatConfig): {
  provider?: string | null;
  skills?: string[];
  connections?: string[];
  senses?: Record<string, boolean>;
  memoryScope?: string;
} | undefined {
  const out = {
    provider: cfg.provider ?? undefined,
    skills: cfg.skills,
    connections: cfg.connections,
    senses: cfg.senses,
    memoryScope: cfg.memoryScope,
  };
  const has = out.provider || out.skills?.length || out.connections?.length ||
    (out.senses && Object.keys(out.senses).length) || out.memoryScope;
  return has ? out : undefined;
}

// ── Personalidad efectiva (persona + voz + temperatura) ─────────────────────

/**
 * Resuelve la personalidad efectiva del turno (misma prioridad que
 * `astrauraChat`: chat > entidad > cerebro > sección > global) y deriva de ella
 * si tiene voz y la temperatura recomendada. `null` si no hay ninguna activa.
 */
export function resolveTurnPersona(opts: {
  convId?: string | null;
  brainId?: string;
  route?: string;
}): TurnPersona | null {
  try {
    const section = opts.route
      ? sectionFromPath(opts.route)
      : typeof window !== "undefined"
        ? sectionFromPath(window.location.pathname)
        : undefined;
    const profile = resolvePersonalityForContext({
      section,
      chatId: opts.convId ?? undefined,
      brainId: opts.brainId,
    });
    if (!profile) return null;
    const creatividad = Number(profile.traits?.creatividad ?? 60);
    const temperature = Math.round((0.4 + (clamp01(creatividad / 100)) * 0.6) * 100) / 100;
    const hasVoice = !!(profile.generoVoz && profile.idioma);
    return { profile, hasVoice, temperature };
  } catch {
    return null;
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

// ── System prompt: SÓLO los extras del orbe ─────────────────────────────────

/**
 * Compone los "extras" del system prompt que hacen del chat del orbe el más
 * completo: acciones `[[ACCION:…]]`, herramientas del cerebro activo,
 * conocimiento del ecosistema y nota de contexto de ruta.
 *
 * NO incluye la personalidad ni el contexto de usuario/skills: eso lo inyecta
 * `astrauraChat` internamente (evitando doble inyección). Siempre defensivo.
 */
export async function composeAuroraSystem(opts: {
  brainId?: string;
  route?: string;
  autoTools?: boolean;
  /**
   * Incluir el bloque de PERSONALIDAD compilado. Por defecto false porque
   * `astrauraChat` ya lo inyecta (evita duplicados). Actívalo cuando el llamador
   * use `chatSmart`/`chat` directamente (p.ej. multichat), que NO lo inyectan.
   */
  includePersona?: boolean;
  /** Conversación (para resolver la personalidad POR CHAT si `includePersona`). */
  convId?: string | null;
}): Promise<string> {
  const routeLabel = opts.route
    || (typeof window !== "undefined" ? window.location.pathname : "/");
  const pieces: string[] = [];

  // 0) Personalidad (sólo si el llamador la pide: chatSmart/chat no la inyectan).
  if (opts.includePersona) {
    try {
      const persona = resolveTurnPersona({ convId: opts.convId, brainId: opts.brainId, route: opts.route });
      if (persona) pieces.push(compilePersonalityPrompt(persona.profile));
    } catch { /* sin personalidad: sigue igual */ }
  }

  // 0.5) Instrucciones del ESPACIO DE TRABAJO del chat (Adenda 76). Síncrono y
  // barato (lee la caché local). Si el chat no está en un espacio, devuelve "".
  try {
    const wx = workspaceSystemExtra(opts.convId);
    if (wx) pieces.push(wx);
  } catch { /* sin espacio: prompt idéntico */ }

  // 0.7) OÍDO EMOCIONAL (Adenda 77-voz): si el sentido está activo y la voz del
  // usuario trae un tono claro (alegre/tenso/triste…), se lo susurramos a
  // Astraura para que responda con tacto. Devuelve "" si es neutro o dudoso.
  try {
    const emo = describeUserVoiceEmotionForPrompt();
    if (emo) pieces.push(emo);
  } catch { /* sin oído emocional: prompt idéntico */ }

  // 1) Acciones del OS (control real). Determinista y barato.
  try { pieces.push(actionsSystemPromptSection()); } catch { /* */ }

  // 2) Herramientas del cerebro activo (selección automática si el toggle está on).
  const autoToolsOn = opts.autoTools ?? (getIntelligenceSettings().autoTools !== false);
  if (autoToolsOn) {
    try {
      const tools = await auroraToolsActionPromptSection(opts.brainId);
      if (tools) pieces.push(tools);
    } catch { /* sin herramientas: prompt idéntico */ }
  }

  // 3) Conocimiento del ecosistema (áreas, tríada, enlaces canónicos).
  try {
    const k = buildSystemKnowledge(routeLabel);
    if (k) pieces.push(k);
  } catch { /* */ }

  // 4) Nota de contexto de ruta + reafirmación del control total (como el orbe).
  pieces.push(
    `CONTEXTO ACTUAL — El usuario está en: ${routeLabel}. ` +
    "Sigues activa en segundo plano: navegar/operar NO te detiene. " +
    "Recuerda tu control total: si algo se hace en el OS, hazlo tú con [[ACCION:...]]; nunca le pidas al usuario que vaya él a otra parte.",
  );

  return pieces.filter(Boolean).join("\n\n");
}

// ── Voz por el puente (respeta el toggle del chat y la personalidad) ────────

/**
 * Hace hablar a Aurora por el TTS del engine (vía el puente global), respetando:
 *   · el toggle de voz del chat (`meta.config.voice !== false`), salvo override,
 *   · el estilo de voz de la personalidad efectiva (el engine ya escucha el
 *     evento `starseed:aurora-voice-style`).
 * No hace nada si no hay puente o la voz está desactivada. Nunca lanza.
 */
export function speakAuroraReply(
  text: string,
  opts: { convId?: string | null; brainId?: string; route?: string; force?: boolean } = {},
): void {
  const clean = (text || "").trim();
  if (!clean) return;
  const cfg = getChatConfig(opts.convId);
  const persona = resolveTurnPersona({ convId: opts.convId, brainId: opts.brainId, route: opts.route });
  // Automático: voz activa salvo que el chat la desactive; si el chat no dice
  // nada, se activa cuando la personalidad tiene voz.
  const enabled = opts.force ?? (cfg.voice === false ? false : (cfg.voice === true || !!persona?.hasVoice));
  if (!enabled) return;
  const b = bridge();
  try { b?.speak?.(clean); } catch { /* */ }
}

// ── Ejecución de directivas vía el puente ───────────────────────────────────

async function runDirectivesViaBridge(rawReply: string): Promise<{ name: string; ok: boolean }[]> {
  const directives = parseDirectives(rawReply);
  if (!directives.length) return [];
  const b = bridge();
  if (!b?.runDirectives) return directives.map((d) => ({ name: d.name, ok: false }));
  try {
    await b.runDirectives(rawReply);
    return directives.map((d) => ({ name: d.name, ok: true }));
  } catch {
    return directives.map((d) => ({ name: d.name, ok: false }));
  }
}

// ── Historial desde la conversación unificada ───────────────────────────────

function historyFromCache(convId: string, excludeText: string): ChatMessage[] {
  try {
    const msgs = cachedMessages(convId);
    const out: ChatMessage[] = [];
    for (const m of msgs) {
      if (!m.text?.trim()) continue;
      if (m.role === "system") continue; // los divisores/config-change no van al modelo
      if (m.role === "user" && m.text === excludeText) continue; // evita duplicar el turno actual
      out.push({ role: m.role === "assistant" ? "assistant" : "user", content: m.text });
    }
    return out;
  } catch {
    return [];
  }
}

// ── Entrada principal ────────────────────────────────────────────────────────

/**
 * Ejecuta un turno COMPLETO de Aurora/Astraura por el pipeline compartido.
 * Devuelve la respuesta final, sus metadatos y las acciones ejecutadas.
 * Persiste usuario + respuesta en la conversación unificada (salvo que se
 * desactive). Habla por voz si procede. Defensivo: sólo re-lanza en aborto.
 */
export async function sendAuroraTurn(opts: SendAuroraTurnOptions): Promise<AuroraTurnResult> {
  const text = (opts.text || "").trim();
  const surface: AiSurface = opts.surface ?? "other";

  // 1) Conversación destino (crea una si no hay ninguna).
  let convId = opts.convId || getActiveConversationId();
  if (!convId) {
    const conv = await ensureActiveConversation({ surface, kind: "aurora" });
    convId = conv.id;
  }

  // 2) Persistir el mensaje del usuario (optimista, en vivo) con sus adjuntos.
  const attachments = opts.attachments && opts.attachments.length ? opts.attachments : null;
  if (opts.persistUser !== false && text) {
    await appendMessage({ role: "user", text, convId, surface, attachments });
  }

  // 3) System prompt: extras del orbe + contexto de adjuntos + lo propio del llamador.
  const persona = resolveTurnPersona({ convId, brainId: opts.brainId, route: opts.route });
  const extras = await composeAuroraSystem({ brainId: opts.brainId, route: opts.route });
  let attachContext = "";
  if (attachments) {
    try { attachContext = await buildAttachmentsContext(attachments); } catch { /* sin contexto: sigue igual */ }
  }
  const system = [opts.systemExtra, attachContext, extras].filter(Boolean).join("\n\n");

  // 4) Historial (el REAL de la conversación unificada si no se pasó).
  const history = opts.history ?? historyFromCache(convId, text);

  const messages: ChatMessage[] = [
    ...(system ? [{ role: "system", content: system } as ChatMessage] : []),
    ...history,
    { role: "user", content: text },
  ];

  const chatConfig = toRouterChatConfig(getChatConfig(convId));
  const temperature = opts.temperature ?? persona?.temperature ?? 0.7;

  // 5) Router gratis-primero con failover (+ streaming si se pidió).
  let acc = "";
  const res = await astrauraChat({
    messages,
    temperature,
    brainId: opts.brainId,
    chatId: convId,
    chatConfig,
    onStatus: opts.onStatus,
    signal: opts.signal,
    onChunk: opts.onChunk
      ? (delta) => {
          acc += delta;
          // Filtra las directivas del stream visible (no ensucian la UI).
          if (!/\[\[/.test(delta)) opts.onChunk?.(delta);
        }
      : undefined,
  });

  const rawReply = (acc || res?.text || "").trim();

  // 6) Directivas [[ACCION:…]] — control real del OS, vía el puente.
  const actions = await runDirectivesViaBridge(rawReply);
  const finalText = stripDirectives(rawReply).trim() || "Hecho.";

  // 7) Metadatos de proceso.
  const meta: AuroraMessageMeta = {
    provider: res?.route?.sourceLabel,
    model: res?.route?.modelLabel,
    free: res?.route?.free,
    local: res?.route?.local,
    attempts: res?.route?.attempts,
    ms: res?.route?.ms,
    difficulty: res?.route?.difficulty,
    reason: res?.route?.reason,
    tools: actions.length
      ? actions.map((a) => ({ name: a.name, ok: a.ok, summary: "" }))
      : undefined,
    // Adenda 97: ruta completa para la barra de acciones (transparencia).
    route: res?.route ?? undefined,
  };

  // 8) Persistir la respuesta.
  if (opts.persistAssistant !== false && finalText) {
    await appendMessage({
      role: "assistant",
      text: finalText,
      convId,
      surface,
      source: opts.source ?? res?.route?.sourceLabel ?? null,
      meta,
    });

    // Adenda 101: transmite la respuesta por la red sináptica según la
    // conectividad del CHAT (privado → cuenta). No bloquea ni altera el
    // retorno (fire-and-forget; nunca lanza).
    // Adenda 149 · Ola 3 (cierre del pendiente del SOP §9): este turno SÍ sabe
    // QUIÉN emite (la personalidad efectiva ya resuelta en el paso 3), así que
    // la propaga: sus reglas de la pestaña «Señales» (puertas de antena +
    // ruta preferida) gobiernan este envío. Sin personalidad efectiva viaja
    // `undefined` y rigen los defaults «Todas» ("*") de la neurona — el
    // comportamiento exacto de antes.
    void transmitForContext(
      { kind: "config", config: normalizeConnectivityConfig(getChatConfig(convId)?.connectivity) },
      { scope: "private", type: "message", cls: "P3", target: "account", recipient: convId,
        body: { convId, role: "assistant", text: finalText }, personalityId: persona?.profile?.id },
    ).catch(() => {});
  }

  // 9) Voz opcional (respeta el toggle del chat + estilo de personalidad).
  speakAuroraReply(finalText, {
    convId,
    brainId: opts.brainId,
    route: opts.route,
    force: opts.speak,
  });

  return { text: finalText, meta, convId, actions, persona: persona?.profile ?? null };
}

export default sendAuroraTurn;
