"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ChatSurface — cuerpo COMPARTIDO del chat de Astraura (Adenda 76 · G1)
 * ---------------------------------------------------------------------------
 * Extrae íntegramente el pipeline y la interfaz del chat que antes vivían
 * inline en `/agent` (tab «Chats») para poder REUTILIZARLOS, sin duplicar, en:
 *   · el tab «Chats» de `/agent`         → variant "embedded"
 *   · la página a pantalla completa       → variant "fullscreen" (/agent/chat)
 *
 * Es autocontenido (posee su propia conversación unificada, proveedor y estado
 * de envío), así que funciona igual en ambas rutas (árboles React distintos).
 * Comparte el MISMO almacén unificado (`aurora_conversations` + carpetas) que el
 * orbe, el mini-reproductor y el Exocórtex: en tiempo real y entre dispositivos.
 *
 * Extras de esta adenda:
 *   · Botón «Abrir en pantalla completa» (Maximize2) en el tab «Chats».
 *   · En móvil, un botón hamburguesa abre un DRAWER lateral con el panel de
 *     navegación (Espacios + Folders + Chats). En ≥lg se mantiene la barra.
 *   · En pantalla completa, una barra lateral COLAPSABLE con ese mismo panel.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import VoiceProcessingIndicator from "@/components/aurora/voice-processing-indicator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Bot, Send, Square, Lock, Plus, Sparkles, LayoutDashboard, Maximize2, Menu, X,
  PanelLeftClose, PanelLeftOpen, ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";

import { MessageRenderer } from "@/components/aurora/message-renderer";
import { MessageActionBar } from "@/components/aurora/message-action-bar";
import { MessageProcessModal } from "@/components/aurora/message-process-modal";
import { VoiceNoteBar } from "@/components/aurora/voice-note-bar";
import { registerActiveAuroraChat, listPersonalityProfiles, getPersonalityProfile } from "@/lib/aurora/personalities";
import { initVoiceNotesCapture } from "@/lib/aurora/voice-notes";
import { useAurora } from "@/components/aurora/aurora-provider";
import { ChatHeaderOptions } from "@/components/aurora/chat-header-options";
import { ChatAttachButton, PendingAttachmentChips, MessageAttachmentChips } from "@/components/aurora/chat-attach-button";
import { ChatVoiceButtons } from "@/components/aurora/chat-voice-buttons";
import { ConfigChangeNotice, isConfigChangeMessage } from "@/components/aurora/config-change-notice";
import { ChatNeuralSidebar } from "@/components/agent/chat-neural-sidebar";
import { ChatNavPanel } from "@/components/agent/chat-nav-panel";
import { ChatMessageActions } from "@/components/agent/chat-message-actions";
import {
  ChatPersonalityTray,
  readAstraura158Selection,
  astraura158MentionHint,
  type Astraura158Selection,
} from "@/components/agent/chat-personality-tray";

import {
  useAiConversations,
  useAiMessages,
  appendMessage as appendUnifiedMessage,
  ensureActiveConversation,
  titleFromText,
  setActiveChatLogEnabled,
} from "@/lib/aurora/conversations";
import { astrauraChat, type RouteRecord } from "@/ai/astraura/router";
import { ProcessLine } from "@/components/aurora/process-line";
import { composeAuroraSystem, getChatConfig, resolveTurnPersona } from "@/lib/aurora/turn";
import { patchChatConfig } from "@/lib/aurora/config-change";
import { buildAttachmentsContext, summarizeAttachments, type UniversalAttachment } from "@/lib/aurora/attachments";
import type { AuroraMessageMeta } from "@/lib/aurora/engine";
import { parseDirectives } from "@/lib/aurora/actions";
import { loadConfigs, getActiveProviderId } from "@/ai/client/providerStore";
import { PROVIDERS } from "@/ai/providers";
import type { ProviderConfig, ChatMessage } from "@/ai/providers/types";
import { persona158For } from "@/ai/providers/astraura-158";
import { createStreamingVoice, type StreamingVoicePersona } from "@/lib/aurora/streaming-voice";
import { buildSystemContext, snapshotToSystemPrompt } from "@/hermes-integration/system-context";
import { getLivingGraphStore } from "@/hermes-integration/living-graph-store";
import { getOpenHumanEngine } from "@/hermes-integration/openhuman-bridge";
import { useCalendar, eventDateTimeMs } from "@/contexts/calendar-context";

// ─────────────────────────────────────────────────────────────────────────────
// Agente y reglas por defecto para el ENVÍO (antes eran datos mock editables en
// las pestañas Foundry/Reglas del estudio). El grueso del system prompt lo
// componen `composeAuroraSystem` + snapshot del sistema + personalidad, así que
// esta semilla es mínima. Se mantiene aquí para que la superficie sea
// autocontenida y funcione igual en `/agent` y en `/agent/chat`.
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_AGENT = {
  name: "Núcleo StarSeed",
  systemPrompt: "Eres el núcleo operativo de StarSeed...",
  temperature: 0.7,
};
const DEFAULT_RULES = [
  { name: "Código Abierto", content: "Todo código generado debe ser Open Source (MIT)." },
  { name: "Tono Pacífico", content: "Mantener un tono diplomático y constructivo." },
];

/**
 * Metadatos HONESTOS de una respuesta (Adenda 149 · ola 3 · idea 2.13:180).
 * Si el router adjuntó su `RouteRecord`, el chip de proceso dice la fuente y el
 * modelo que respondieron DE VERDAD (y si hubo failover, cuántos intentos).
 * Sin ruta —fuente directa del proveedor, error, respuesta cacheada…— se
 * conserva el comportamiento previo: el proveedor configurado.
 */
function metaFromRoute(
  route: RouteRecord | undefined,
  fallback: ProviderConfig | undefined,
  ms: number,
): AuroraMessageMeta {
  if (!route) {
    return { provider: fallback?.label, model: fallback?.defaultModel, ms };
  }
  return {
    provider: route.sourceLabel || fallback?.label,
    model: route.modelLabel || route.model || fallback?.defaultModel,
    free: route.free,
    local: route.local,
    attempts: route.attempts,
    ms: typeof route.ms === "number" && route.ms > 0 ? route.ms : ms,
    reason: route.reason,
    difficulty: route.difficulty,
    route,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// VOZ EN VIVO (Tarea 1) — helpers PUROS, sin estado de React, reutilizables
// tanto por un envío nuevo como por «Regenerar».
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normaliza un nombre de personalidad para comparar de forma tolerante: sin
 * tildes, sin mayúsculas, y sólo el nombre corto antes del paréntesis (p.ej.
 * "Aurora (Alma Viva)" compara como "aurora", igual que la cabecera
 * `### 🌸 Aurora (Alma Viva):` que puede traer el streaming).
 */
function foldPersonaName(raw: string): string {
  return raw
    .split("(")[0]
    // Diacríticos (tildes) sueltos tras NFD — referenciados por escape Unicode
    // (no como caracteres sueltos) para no dejar un combining character
    // ilegible en el código, mismo criterio que `streaming-voice.ts`.
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * `resolvePersona` de `createStreamingVoice`: resuelve el nombre de una
 * cabecera detectada a mitad de respuesta (`### 💬 [Nombre]:`) contra las
 * personalidades REALES del OS (`listPersonalityProfiles()`) — no contra el
 * catálogo del backend 1.58: son dos rosters distintos, y sólo el del OS
 * tiene voz configurada. Sin match ⇒ null: la cabecera se trata como texto
 * normal (no corta la voz esperando un cambio que no va a llegar).
 */
function resolveStreamingPersona(name: string): StreamingVoicePersona | null {
  const target = foldPersonaName(name);
  if (!target) return null;
  const hit = listPersonalityProfiles().find((p) => foldPersonaName(p.name) === target);
  return hit ? { id: hit.id, name: hit.name } : null;
}

/**
 * ¿Debe sonar la voz de este chat? Misma lógica que usaba `speakAuroraReply`
 * (retirada de aquí — ver el porqué en `runAssistantTurn`): si el chat
 * desactivó la voz a mano gana esa preferencia; si no dijo nada, suena sólo
 * si la personalidad efectiva del turno tiene voz configurada.
 */
function computeVoiceEnabled(convId: string | null | undefined): boolean {
  const cfg = getChatConfig(convId);
  if (cfg.voice === false) return false;
  if (cfg.voice === true) return true;
  const persona = resolveTurnPersona({ convId, route: "/agent" });
  return !!persona?.hasVoice;
}

// ─────────────────────────────────────────────────────────────────────────────
// PREFERENCIAS 1.58 (Tarea 3) — inyección en la petición + snapshot por turno
// (Tarea 2: lo que «Regenerar» necesita para conservarlas).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Añade la selección de la bandeja de personalidades al ÚLTIMO turno de
 * usuario como menciones `@id` (+ "coral" en síntesis coral): es el ÚNICO
 * canal que de verdad llega hasta `preferences.selected_personalities` /
 * `multi_personality_mode` en el proveedor 1.58 (`detectMentions158`,
 * `astraura-158.ts`) sin tocar ese fichero. Pura: devuelve un array nuevo: no
 * muta `messages` ni lo que ya se guardó/mostró (sólo lo que se ENVÍA).
 */
function withAstraura158Hint(messages: ChatMessage[], sel: Astraura158Selection | null): ChatMessage[] {
  const hint = astraura158MentionHint(sel);
  if (!hint) return messages;
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      lastUserIdx = i;
      break;
    }
  }
  if (lastUserIdx === -1) return messages;
  const next = messages.slice();
  next[lastUserIdx] = { ...next[lastUserIdx], content: `${next[lastUserIdx].content}\n\n${hint}` };
  return next;
}

/** Lee, sin `any`, el snapshot 1.58 guardado en `meta.astr158Turn` de un mensaje. */
function turnSelectionFromMeta(meta: AuroraMessageMeta | null | undefined): Astraura158Selection | null {
  return (meta as (AuroraMessageMeta & { astr158Turn?: Astraura158Selection }) | null | undefined)?.astr158Turn ?? null;
}

interface AgentRenderMsg {
  id: string;
  role: "agent" | "user" | "system";
  content: string;
  ts: number;
  meta?: AuroraMessageMeta | null;
  history: { role: string; text: string; ts: number }[];
  timestamp: string;
  pending?: boolean;
  configChange?: boolean;
  attachments?: unknown[] | null;
}

export interface ChatSurfaceProps {
  /** "embedded" = dentro del tab «Chats». "fullscreen" = página /agent/chat. */
  variant?: "embedded" | "fullscreen";
  className?: string;
  /** Conversación a activar al montar (deep-link `/agent/chat?id=…`). */
  initialConvId?: string | null;
}

export function ChatSurface({ variant = "embedded", className, initialConvId }: ChatSurfaceProps) {
  const fullscreen = variant === "fullscreen";
  const router = useRouter();
  const calendar = useCalendar();
  const aurora = useAurora();

  // Conversación unificada (misma que orbe/mini-reproductor/Exocórtex).
  const conv = useAiConversations();
  const cloudMessages = useAiMessages(conv.activeId);

  const [streamText, setStreamText] = useState("");
  const [inputValue, setInputValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Proveedor de IA (capa multi-proveedor).
  const [configs, setConfigs] = useState<ProviderConfig[]>([]);
  const [activeProviderId, setActiveProviderIdState] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const [process, setProcess] = useState<{ open: boolean; meta?: unknown }>({ open: false });
  const [streaming, setStreaming] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<UniversalAttachment[]>([]);
  const removeAttachment = useCallback((i: number) => {
    setPendingAttachments((prev) => prev.filter((_, idx) => idx !== i));
  }, []);

  // Navegación lateral: drawer móvil + colapso en pantalla completa.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);

  useEffect(() => {
    setConfigs(loadConfigs());
    setActiveProviderIdState(getActiveProviderId());
  }, []);

  // Captura de NOTAS DE VOZ (Adenda 87): instala UNA sola vez el oyente que guarda
  // el audio neural generado (evento `starseed:voice-note`) para adjuntarlo a cada
  // mensaje. Idempotente (guard interno): se queda vivo toda la sesión aunque se
  // navegue entre el chat embebido y el de pantalla completa (no se desinstala).
  useEffect(() => {
    initVoiceNotesCapture();
  }, []);

  // Registra la conversación ACTIVA como el chat de Aurora en curso (Adenda 93).
  // Sin esto, en /agent nadie llamaba a registerActiveAuroraChat → `emitVoiceNote`
  // recibía convId=null → `syncVoiceNote` NUNCA se disparaba → los audios de voz
  // no se guardaban ni sincronizaban. Mismo patrón que aurora-mini-player y el
  // Exocórtex. Defensivo: nunca lanza.
  useEffect(() => {
    try { registerActiveAuroraChat(conv.activeId ?? null); } catch { /* defensivo */ }
    return () => { try { registerActiveAuroraChat(null); } catch { /* defensivo */ } };
  }, [conv.activeId]);

  // Deep-link `/agent/chat?id=…`: activa la conversación indicada al montar.
  useEffect(() => {
    if (initialConvId && initialConvId !== conv.activeId) conv.setActive(initialConvId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConvId]);

  // Sincroniza el flag 'Registro' por chat (el grabador respeta el toggle).
  useEffect(() => {
    const cfg = (conv.conversations.find((c) => c.id === conv.activeId)?.meta as { config?: { log?: boolean } } | undefined)?.config;
    setActiveChatLogEnabled(cfg ? cfg.log !== false : true);
  }, [conv.activeId, conv.conversations]);

  const activeProviderConfig = useMemo(
    () => configs.find((c) => c.enabled && c.id === activeProviderId) ?? configs.find((c) => c.enabled),
    [configs, activeProviderId],
  );

  const activePersona = useMemo(() => {
    try {
      return resolveTurnPersona({ convId: conv.activeId, route: "/agent" })?.profile ?? null;
    } catch {
      return null;
    }
  }, [conv.activeId, conv.conversations]);

  // Personalidad 1.58 que se usaría HOY sin tocar la bandeja de la Tarea 3
  // (deriva de `activePersona`, igual que hace el router internamente). Es lo
  // que la bandeja muestra activo mientras el usuario no eligió nada explícito.
  const astr158DefaultPersonaId = useMemo(() => {
    try {
      return persona158For(activePersona);
    } catch {
      return "astraura_prime";
    }
  }, [activePersona]);

  /**
   * System prompt COMPLETO de un turno (agente + reglas + adjuntos + snapshot
   * del sistema + grafo vivo + calendario + extras del orbe). Compartido por
   * un envío nuevo y por «Regenerar» (mismas piezas; distinto historial).
   */
  async function buildSystemPieces(atts: UniversalAttachment[]): Promise<string[]> {
    const systemPieces: string[] = [DEFAULT_AGENT.systemPrompt];
    DEFAULT_RULES.forEach((r) => systemPieces.push(`Regla "${r.name}": ${r.content}`));

    if (atts.length) {
      try {
        const ac = await buildAttachmentsContext(atts);
        if (ac) systemPieces.push(ac);
      } catch { /* sin contexto: responde igual */ }
    }

    try {
      const upcomingEvents = calendar.items
        .filter((it) => eventDateTimeMs(it) >= Date.now())
        .sort((a, b) => eventDateTimeMs(a) - eventDateTimeMs(b))
        .slice(0, 10)
        .map((it) => `[${it.date}${it.time ? " " + it.time : ""}] (${it.layer}) ${it.title}`);
      const snapshot = buildSystemContext({ upcomingEvents });
      systemPieces.push(snapshotToSystemPrompt(snapshot));
      systemPieces.push(getLivingGraphStore().textualSummary());
      systemPieces.push(calendar.aiContextSnapshot());
      try {
        const extras = await composeAuroraSystem({
          route: typeof window !== "undefined" ? window.location.pathname : "/agent",
        });
        if (extras) systemPieces.push(extras);
      } catch { /* defensivo */ }
    } catch (e) {
      console.warn("[ChatSurface] No se pudo construir contexto completo:", e);
    }
    return systemPieces;
  }

  /**
   * `speak` de `createStreamingVoice`: resuelve el id de personalidad (si lo
   * hay) a su ficha completa y delega en el puente de Aurora — el MISMO
   * `aurora.speak(text, forcePersonality)` que ya usa `MessageActionBar`
   * ("leer con esta personalidad") y que acepta personalidad de sobra
   * (aurora-provider.tsx ~línea 617).
   */
  function speakStreamingClause(text: string, personaId?: string) {
    const profile = personaId ? getPersonalityProfile(personaId) : null;
    try {
      aurora?.speak?.(text, profile ?? undefined);
    } catch {
      /* la voz nunca debe romper el turno */
    }
  }

  /**
   * Núcleo COMPARTIDO de generación de una respuesta de Astraura: llama al
   * proveedor activo con streaming, alimenta la VOZ EN VIVO cláusula a
   * cláusula y persiste el resultado. Lo usan tanto un envío nuevo
   * (`handleSend`) como «Regenerar» (`handleRegenerate`) — mismo núcleo,
   * distinto historial de entrada — para que ambos se comporten igual.
   */
  async function runAssistantTurn(
    convId: string,
    messagesForModel: ChatMessage[],
    turnSel: Astraura158Selection | null,
  ) {
    const provider = activeProviderConfig;
    if (!provider) return; // defensivo: los llamantes ya lo comprueban antes de invocar esto

    // La bandeja de personalidades (Tarea 3) sólo tiene efecto con el
    // proveedor Astraura 1.58-bit activo: con cualquier otro se ignora sin
    // más (ni se inyecta la mención ni se guarda el snapshot del turno).
    const effectiveSel = provider.id === "astraura-158" ? turnSel : null;
    const messagesToSend = withAstraura158Hint(messagesForModel, effectiveSel);

    abortRef.current = new AbortController();
    setStreaming(true);
    setStreamText("");
    let acc = "";
    const startedAt = Date.now();

    // VOZ EN VIVO: antes `speakAuroraReply(acc, …)` se llamaba DESPUÉS de que
    // el streaming terminara — el mensaje aparecía entero y la voz arrancaba
    // a leerlo de un tirón («la voz se separa» del texto, el síntoma que
    // reportó el usuario). Ahora el motor recibe cada token EN VIVO
    // (`voice.feed` dentro de `onChunk`, abajo) y habla cláusula a cláusula
    // mientras Astraura sigue escribiendo, cambiando de personalidad al vuelo
    // si el texto trae una cabecera de diálogo/coral (`### 💬 [Nombre]:`) a
    // mitad de respuesta — igual que hacía el programa original.
    const voice = createStreamingVoice({
      speak: speakStreamingClause,
      resolvePersona: resolveStreamingPersona,
      enabled: computeVoiceEnabled(convId),
    });

    try {
      // El retorno de `astrauraChat` trae la RUTA REAL elegida por el router
      // (Adenda 149 · ola 3): antes se descartaba y el chip de proceso decía
      // siempre el proveedor configurado, respondiera quien respondiera.
      const res = await astrauraChat({
        chatId: convId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        chatConfig: (conv.conversations.find((c) => c.id === convId)?.meta as any)?.config,
        messages: messagesToSend,
        temperature: DEFAULT_AGENT.temperature,
        signal: abortRef.current.signal,
        onChunk: (delta) => {
          const match = delta.match(/\[\[(.*?)\]\]/);
          if (!match) setStreamText((prev) => prev + delta);
          acc += delta;
          // Alimenta la voz TOKEN A TOKEN: habla en cuanto se cierra una
          // cláusula hablable, sin esperar a que termine el mensaje completo.
          voice.feed(delta);
        },
      });

      // Vacía lo que quedó pendiente en el buffer (la última cláusula, que no
      // cerró con puntuación antes de que el stream terminara).
      voice.flush();

      const directives = parseDirectives(acc);
      if (directives.length > 0 && aurora) {
        await aurora.runDirectives(acc);
      }
      if (acc.trim()) {
        const meta = metaFromRoute(res?.route, provider, Date.now() - startedAt);
        // Snapshot de las preferencias 1.58 de ESTE turno (Tareas 2+3): así
        // «Regenerar» puede reproducir EXACTAMENTE esta selección más
        // adelante aunque la bandeja, para entonces, ya haya cambiado — el
        // bug del original era justo el contrario (regenerar la perdía).
        const metaToSave: AuroraMessageMeta & { astr158Turn?: Astraura158Selection } = {
          ...meta,
          ...(effectiveSel ? { astr158Turn: effectiveSel } : {}),
        };
        await appendUnifiedMessage({
          role: "assistant",
          text: acc,
          convId,
          kind: "aurora",
          surface: "agent",
          source: meta.provider ?? provider.label,
          meta: metaToSave,
        });
        // NOTA: aquí YA NO se llama a `speakAuroraReply(acc, …)`. La voz ya
        // sonó EN VIVO arriba (`voice.feed`/`voice.flush`); volver a leer el
        // texto completo ahora la duplicaría (y volvería a "separarse").
      }
    } catch (err) {
      // Se detuvo a mitad (botón «Detener») o falló: no se lee en voz alta un
      // mensaje roto o incompleto — se descarta lo que quedó en el buffer.
      voice.stop();
      const msg = (err as Error).message;
      if (acc.trim()) {
        await appendUnifiedMessage({
          role: "assistant",
          text: `${acc}\n\n⚠ ${msg}`,
          convId,
          kind: "aurora",
          surface: "agent",
          source: provider.label,
          meta: { provider: provider.label, model: provider.defaultModel },
        });
      } else {
        await appendUnifiedMessage({
          role: "assistant",
          text: `⚠ ${msg}`,
          convId,
          kind: "aurora",
          surface: "agent",
          meta: { local: true, provider: "Astraura (error)" },
        });
      }
      toast.error(`Error: ${msg}`);
    } finally {
      setStreaming(false);
      setStreamText("");
      abortRef.current = null;
    }
  }

  async function handleSend(override?: string) {
    const typed = (override ?? inputValue).trim();
    const atts = pendingAttachments;
    const text = typed || (atts.length ? summarizeAttachments(atts) : "");
    if (!text || streaming) return;

    setInputValue("");
    setPendingAttachments([]);

    let convId = conv.activeId;
    if (!convId) {
      const created = await ensureActiveConversation({
        title: titleFromText(text),
        kind: "aurora",
        surface: "agent",
      });
      convId = created.id;
      conv.setActive(created.id);
    }

    await appendUnifiedMessage({
      role: "user",
      text,
      convId,
      kind: "aurora",
      surface: "agent",
      attachments: atts.length ? atts : undefined,
    });

    if (!activeProviderConfig) {
      await appendUnifiedMessage({
        role: "assistant",
        text: "Aún no tienes un proveedor de IA configurado. Ve a Ajustes → IA & Modelos y añade Ollama (local) u otro proveedor con tu propia clave.",
        convId,
        kind: "aurora",
        surface: "agent",
        meta: { local: true, provider: "Astraura (respuesta local)" },
      });
      return;
    }

    const systemPieces = await buildSystemPieces(atts);
    try {
      getOpenHumanEngine().ingest(text, "chat", `chat-${Date.now()}`);
    } catch { /* defensivo: la ingesta nunca debe romper el envío */ }

    const history: ChatMessage[] = [
      { role: "system", content: systemPieces.join("\n\n---\n\n") },
      ...cloudMessages
        .filter((m) => m.role !== "system" && m.text.trim() && m.text !== text)
        .map<ChatMessage>((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.text,
        })),
      { role: "user", content: text },
    ];

    await runAssistantTurn(convId, history, readAstraura158Selection(convId));
  }

  /**
   * «Regenerar» (Tarea 2): vuelve a pedir la respuesta al MISMO mensaje de
   * usuario que disparó `msg`, con el MISMO historial previo — pero
   * conservando las preferencias 1.58 de AQUEL turno (`turnSelectionFromMeta`),
   * no las que estén activas ahora mismo en la bandeja. El bug del original
   * era justo el contrario: regenerar perdía la configuración del turno.
   */
  async function handleRegenerate(msg: AgentRenderMsg) {
    if (streaming) return;
    const convId = conv.activeId;
    if (!convId) return;

    // El turno de usuario que disparó ESTA respuesta: el último "user" antes
    // de ella en su propio historial (mismo criterio que ya usa
    // `MessageActionBar.handleRetry` para "Reintentar").
    const upto = msg.history.slice(0, -1);
    let userText = "";
    let cutIdx = upto.length;
    for (let i = upto.length - 1; i >= 0; i--) {
      if (upto[i].role === "user") {
        userText = upto[i].text;
        cutIdx = i;
        break;
      }
    }
    if (!userText) {
      toast.error("No se encontró el mensaje de usuario de este turno.");
      return;
    }
    if (!activeProviderConfig) {
      toast.error("Aún no tienes un proveedor de IA configurado.");
      return;
    }

    toast.success("Regenerando con las preferencias de aquel turno…");

    const systemPieces = await buildSystemPieces([]);
    const messagesForModel: ChatMessage[] = [
      { role: "system", content: systemPieces.join("\n\n---\n\n") },
      ...upto
        .slice(0, cutIdx)
        .filter((h) => h.text?.trim())
        .map<ChatMessage>((h) => ({ role: h.role === "aurora" ? "assistant" : "user", content: h.text })),
      { role: "user", content: userText },
    ];

    await runAssistantTurn(convId, messagesForModel, turnSelectionFromMeta(msg.meta));
  }

  /**
   * «Bifurcar en un chat nuevo» (Tarea 2): crea una conversación nueva con el
   * historial hasta `msg` incluido (ya viene así en `msg.history`) y navega a
   * ella. Reutiliza las funciones del OS para conversaciones — nada de
   * almacenamiento propio.
   */
  async function handleBranch(msg: AgentRenderMsg) {
    if (streaming) return;
    const entries = msg.history.filter((h) => h.text?.trim());
    if (!entries.length) return;
    const sourceConvId = conv.activeId;

    try {
      const firstUserText = entries.find((h) => h.role === "user")?.text || msg.content;
      const created = await conv.create({
        title: titleFromText(firstUserText),
        kind: "aurora",
        surface: "agent",
      });

      // Timestamps NUEVOS y crecientes — NO los originales: `client_id` sale
      // de (rol, ts, texto) SIN el id de conversación (`clientIdFor` en
      // conversations.ts); reusar el `ts` de origen generaría el MISMO
      // client_id que el mensaje de la conversación fuente, y el upsert
      // (`onConflict: user_id,client_id`) lo descartaría como "ya existe" —
      // nunca llegaría a guardarse en la rama nueva.
      const baseTs = Date.now();
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        // eslint-disable-next-line no-await-in-loop
        await appendUnifiedMessage({
          role: e.role === "aurora" ? "assistant" : "user",
          text: e.text,
          ts: baseTs + i,
          convId: created.id,
          kind: "aurora",
          surface: "agent",
        });
      }
      if (sourceConvId) await patchChatConfig(created.id, { branchedFrom: sourceConvId });

      toast.success("Chat bifurcado: continúas esta conversación en un hilo nuevo.");
    } catch (e) {
      toast.error(`No se pudo bifurcar el chat: ${(e as Error).message}`);
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [cloudMessages, streamText]);

  const messages = useMemo<AgentRenderMsg[]>(() => {
    const base: AgentRenderMsg[] = cloudMessages
      .filter((m) => m.role !== "system" || isConfigChangeMessage(m.role, m.text, m.meta))
      .map((m, i, arr) => {
        if (isConfigChangeMessage(m.role, m.text, m.meta)) {
          return { id: m.id, role: "system", content: m.text, ts: m.ts, meta: m.meta, history: [], timestamp: "", configChange: true };
        }
        return {
          id: m.id,
          role: (m.role === "assistant" ? "agent" : "user") as AgentRenderMsg["role"],
          content: m.text,
          ts: m.ts,
          meta: m.meta,
          attachments: m.attachments,
          history: arr.slice(0, i + 1).map((e) => ({ role: e.role === "assistant" ? "aurora" : "user", text: e.text, ts: e.ts })),
          timestamp: (() => {
            try { return new Date(m.ts).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }); }
            catch { return ""; }
          })(),
        };
      });
    if (base.length === 0 && !streaming) {
      base.push({
        id: "placeholder",
        role: "agent",
        content: "Sistemas neurales activos. Escribe aquí o háblale a Aurora desde el orbe: es la **misma conversación**. Elige un proveedor de IA en Ajustes → IA & Modelos para conversar de verdad.",
        timestamp: "Ahora",
        ts: Date.now(),
        meta: undefined,
        history: [],
      });
    }
    if (streaming) {
      base.push({ id: "streaming", role: "agent", content: streamText, timestamp: "", ts: Date.now(), pending: true, meta: undefined, history: [] });
    }
    return base;
  }, [cloudMessages, streaming, streamText]);

  const fullscreenHref = `/agent/chat${conv.activeId ? `?id=${conv.activeId}` : ""}`;

  // ── Interfaz del chat (idéntica en ambas variantes) ──
  const chatColumn = (
    <div className="flex-1 flex flex-col rounded-xl border bg-background/50 overflow-hidden shadow-sm relative min-w-0 w-full max-w-full box-border">
      {/* Indicador ANIMADO de procesamiento de voz (Adenda V2-VOZ): flota sobre el
          hilo mientras el sistema de voz da voz a la respuesta. */}
      <VoiceProcessingIndicator variant="float" />
      <div className="absolute top-3 right-3 left-3 sm:left-auto z-10 flex flex-wrap justify-end gap-2 max-w-[calc(100%-1.5rem)]">
        {fullscreen ? (
          <>
            {/* Volver al estudio */}
            <Button asChild variant="outline" size="icon" className="shrink-0 bg-card/60 backdrop-blur border-border/50 cursor-pointer" title="Volver al estudio Astraura">
              <Link href="/agent"><ArrowLeft className="w-4 h-4" /></Link>
            </Button>
            {/* Menú lateral en móvil */}
            <Button
              variant="outline"
              size="icon"
              className="shrink-0 bg-card/60 backdrop-blur border-border/50 cursor-pointer md:hidden"
              title="Navegación (espacios, folders y chats)"
              aria-label="Abrir navegación"
              onClick={() => setDrawerOpen(true)}
            >
              <Menu className="w-4 h-4" />
            </Button>
          </>
        ) : (
          <>
            {/* Móvil: hamburguesa → drawer (sustituye al selector de conversación). */}
            <Button
              variant="outline"
              size="icon"
              className="shrink-0 bg-card/60 backdrop-blur border-border/50 cursor-pointer lg:hidden"
              title="Navegación (espacios, folders y chats)"
              aria-label="Abrir navegación"
              onClick={() => setDrawerOpen(true)}
            >
              <Menu className="w-4 h-4" />
            </Button>
            {/* Nueva conversación (rápido, móvil). */}
            <Button
              variant="outline"
              size="icon"
              className="shrink-0 bg-card/60 backdrop-blur border-border/50 cursor-pointer lg:hidden"
              title="Nueva conversación"
              onClick={() => void conv.create({ kind: "aurora", surface: "agent" })}
            >
              <Plus className="w-4 h-4" />
            </Button>
            {/* Abrir en pantalla completa. */}
            <Button
              variant="outline"
              size="icon"
              className="shrink-0 bg-card/60 backdrop-blur border-border/50 cursor-pointer"
              title="Abrir el chat actual en pantalla completa"
              aria-label="Abrir en pantalla completa"
              onClick={() => router.push(fullscreenHref)}
            >
              <Maximize2 className="w-4 h-4" />
            </Button>
            {/* Ir al panel Nexus (uso del sistema). */}
            <Button asChild variant="outline" size="icon" className="shrink-0 bg-card/60 backdrop-blur border-border/50 cursor-pointer" title="Panel Nexus · uso del sistema">
              <Link href="/agent?tab=nexus"><LayoutDashboard className="w-4 h-4" /></Link>
            </Button>
          </>
        )}
        {activePersona && (
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-2.5 py-1 text-[11px] font-medium text-fuchsia-100" title="Personalidad activa de Astraura en este chat">
            <Sparkles className="h-3 w-3 text-fuchsia-300" /> {activePersona.name}
          </span>
        )}
        <ChatHeaderOptions context="astraura" convId={conv.activeId ?? null} />
      </div>

      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="flex flex-col gap-4 max-w-3xl mx-auto pt-16 sm:pt-12">
          {!conv.activeId ? (
            <div className="flex flex-col items-center justify-center text-center gap-4 py-14">
              <span className="grid place-items-center h-14 w-14 rounded-2xl bg-gradient-to-tr from-primary/25 to-fuchsia-500/25 border border-white/10">
                <Bot className="w-7 h-7 text-primary" />
              </span>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-white">Sin conversación activa</h3>
                <p className="max-w-md text-sm text-white/50">
                  Escribe abajo para empezar un chat nuevo con Astraura, o abre la navegación para elegir un espacio de trabajo, folder o chat.
                </p>
              </div>
              <Button variant="outline" className="gap-2 border-white/15 bg-white/[0.03] cursor-pointer" onClick={() => setDrawerOpen(true)}>
                <Menu className="w-4 h-4" /> Abrir navegación
              </Button>
            </div>
          ) : messages.map((msg, i) => (
            msg.configChange ? (
              <ConfigChangeNotice key={msg.id ?? i} text={msg.content} />
            ) : (
              <div key={msg.id ?? i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                <Avatar className="w-8 h-8 border border-white/10">
                  {msg.role === "agent" ? (
                    <AvatarFallback className="bg-primary/20 text-primary"><Bot className="w-4 h-4" /></AvatarFallback>
                  ) : (
                    <AvatarFallback className="bg-muted/40 text-xs">Tú</AvatarFallback>
                  )}
                </Avatar>
                <div className={`group relative p-3 rounded-2xl max-w-[80%] text-sm shadow-sm ${msg.role === "user" ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-card border rounded-tl-none"}`}>
                  <MessageRenderer text={msg.content} compact={msg.role === "user"} />
                  <MessageAttachmentChips attachments={msg.attachments} />
                  {msg.pending && <span className="inline-block w-2 h-4 ml-1 bg-primary/70 animate-pulse align-middle" />}
                  {/* Chip «proceso» honesto: qué fuente/modelo respondió de
                      verdad (llega del RouteRecord del router, no del proveedor
                      configurado). Solo en respuestas de Astraura. */}
                  {!msg.pending && msg.role === "agent" && msg.meta && (
                    <ProcessLine
                      meta={msg.meta}
                      onOpenFull={() => setProcess({ open: true, meta: msg.meta ?? undefined })}
                    />
                  )}
                  {!msg.pending && msg.meta && (
                    <MessageActionBar
                      payload={{
                        role: msg.role === "user" ? "user" : "aurora",
                        text: msg.content,
                        ts: msg.ts ?? Date.now(),
                        meta: msg.meta,
                        history: [],
                      }}
                      onViewProcess={(meta) => setProcess({ open: true, meta })}
                    />
                  )}
                  {/* Regenerar / bifurcar (Tarea 2): sólo en respuestas REALES de
                      Astraura (msg.meta descarta el placeholder de bienvenida y el
                      streaming en curso, igual que MessageActionBar arriba). */}
                  {!msg.pending && msg.role === "agent" && msg.meta && (
                    <ChatMessageActions
                      onRegenerate={() => void handleRegenerate(msg)}
                      onBranch={() => void handleBranch(msg)}
                      busy={streaming}
                      className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    />
                  )}
                  {/* Nota de voz (Adenda 87): mini reproductor del audio que sonó +
                      «Regenerar voz». Solo en respuestas de Astraura con contenido.
                      `convId` (Adenda 87-bis): permite encontrar el audio en la
                      nube si esta neurona no lo generó ella misma (sync en cuenta). */}
                  {!msg.pending && msg.role === "agent" && msg.content.trim() && (
                    <VoiceNoteBar text={msg.content} convId={conv.activeId} />
                  )}
                </div>
              </div>
            )
          ))}
        </div>
        <MessageProcessModal
          open={process.open}
          meta={process.meta as never}
          onOpenChange={(o) => setProcess((p) => ({ ...p, open: o }))}
        />
      </ScrollArea>

      <div className="p-4 border-t bg-background/40 backdrop-blur-md space-y-2">
        {activeProviderConfig?.encryptedKey && (
          <div className="flex gap-2 max-w-3xl mx-auto items-center">
            <Lock className="w-3 h-3 text-amber-400 shrink-0" />
            <Input
              type="password"
              placeholder="Frase de paso (descifra tu clave de API)"
              className="flex-1 bg-background/50 text-xs h-8"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
            />
          </div>
        )}
        {pendingAttachments.length > 0 && (
          <div className="max-w-3xl mx-auto">
            <PendingAttachmentChips items={pendingAttachments} onRemove={removeAttachment} />
          </div>
        )}
        {/* Bandeja de personalidades activas (Tarea 3): colapsable, sobre el
            cuadro de escritura. Su selección viaja como menciones ocultas al
            proveedor Astraura 1.58-bit (ver `withAstraura158Hint`); con
            cualquier otro proveedor activo simplemente no hace nada. */}
        <div className="max-w-3xl mx-auto w-full">
          <ChatPersonalityTray
            convId={conv.activeId}
            activeProviderId={activeProviderConfig?.id ?? null}
            defaultPersonaId={astr158DefaultPersonaId}
          />
        </div>
        <div className="flex gap-2 max-w-3xl mx-auto items-center">
          <ChatAttachButton
            onPick={(picked) => setPendingAttachments((prev) => [...prev, ...picked])}
            folder="aurora"
            className="shrink-0 size-9 rounded-full border border-white/12 bg-white/[0.03] text-white/70 hover:border-white/25 hover:text-white"
          />
          <ChatVoiceButtons
            convId={conv.activeId ?? null}
            onInterim={(t) => setInputValue(t)}
            onFinal={(t) => { setInputValue(""); void handleSend(t); }}
            className="shrink-0"
          />
          <Input
            placeholder={`Conversando con ${DEFAULT_AGENT.name}${activeProviderConfig ? ` vía ${activeProviderConfig.label}` : ""}...`}
            className="flex-1 bg-background/50"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !streaming && handleSend()}
            disabled={streaming}
          />
          {streaming ? (
            <Button onClick={handleStop} variant="destructive" className="shrink-0 gap-2">
              <Square className="w-4 h-4" /> Detener
            </Button>
          ) : (
            <Button onClick={() => handleSend()} className="shrink-0 gap-2" disabled={!inputValue.trim() && pendingAttachments.length === 0}>
              <Send className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  // ── Drawer lateral móvil (compartido por ambas variantes) ──
  const drawer = drawerOpen ? (
    <div className="fixed inset-0 z-[80] flex" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
      <div className="relative z-10 h-full w-[86vw] max-w-sm border-r border-white/10 bg-background/95 p-3 shadow-2xl flex flex-col">
        <div className="mb-2 flex items-center justify-between shrink-0">
          <span className="text-sm font-semibold text-white">Navegación</span>
          <button onClick={() => setDrawerOpen(false)} className="rounded-md p-1 text-white/50 hover:text-white" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <ChatNavPanel onNavigate={() => setDrawerOpen(false)} />
        </div>
      </div>
    </div>
  ) : null;

  // ── PANTALLA COMPLETA: barra lateral colapsable + chat ──
  if (fullscreen) {
    return (
      <div className={cn("flex h-full min-h-0 w-full gap-3", className)}>
        {navCollapsed ? (
          <button
            onClick={() => setNavCollapsed(false)}
            title="Mostrar navegación"
            aria-label="Mostrar navegación"
            className="hidden md:flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-lg border border-white/10 bg-white/[0.03] text-white/70 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        ) : (
          <div className="hidden md:flex w-72 shrink-0 flex-col gap-2 rounded-xl border border-white/10 bg-background/40 p-2 min-h-0">
            <div className="flex items-center justify-between px-1 shrink-0">
              <span className="text-xs font-semibold text-cyan-100">Navegación</span>
              <button
                onClick={() => setNavCollapsed(true)}
                title="Colapsar navegación"
                aria-label="Colapsar navegación"
                className="rounded-md p-1 text-white/50 hover:text-white cursor-pointer"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <ChatNavPanel />
            </div>
          </div>
        )}
        {chatColumn}
        {drawer}
      </div>
    );
  }

  // ── EMBEBIDO: barra fija (≥lg) + chat + drawer móvil ──
  return (
    <div className={cn("flex-1 flex flex-col md:flex-row gap-4 md:gap-6 min-h-0 w-full max-w-full box-border", className)}>
      <ChatNeuralSidebar />
      {chatColumn}
      {drawer}
    </div>
  );
}

export default ChatSurface;
