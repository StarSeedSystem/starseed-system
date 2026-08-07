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
import { registerActiveAuroraChat } from "@/lib/aurora/personalities";
import { initVoiceNotesCapture } from "@/lib/aurora/voice-notes";
import { useAurora } from "@/components/aurora/aurora-provider";
import { ChatHeaderOptions } from "@/components/aurora/chat-header-options";
import { ChatAttachButton, PendingAttachmentChips, MessageAttachmentChips } from "@/components/aurora/chat-attach-button";
import { ChatVoiceButtons } from "@/components/aurora/chat-voice-buttons";
import { ConfigChangeNotice, isConfigChangeMessage } from "@/components/aurora/config-change-notice";
import { ChatNeuralSidebar } from "@/components/agent/chat-neural-sidebar";
import { ChatNavPanel } from "@/components/agent/chat-nav-panel";

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
import { composeAuroraSystem, speakAuroraReply, resolveTurnPersona } from "@/lib/aurora/turn";
import { buildAttachmentsContext, summarizeAttachments, type UniversalAttachment } from "@/lib/aurora/attachments";
import type { AuroraMessageMeta } from "@/lib/aurora/engine";
import { parseDirectives } from "@/lib/aurora/actions";
import { loadConfigs, getActiveProviderId } from "@/ai/client/providerStore";
import { PROVIDERS } from "@/ai/providers";
import type { ProviderConfig, ChatMessage } from "@/ai/providers/types";
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
      getOpenHumanEngine().ingest(text, "chat", `chat-${Date.now()}`);
    } catch (e) {
      console.warn("[ChatSurface] No se pudo construir contexto completo:", e);
    }

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

    abortRef.current = new AbortController();
    setStreaming(true);
    setStreamText("");
    let acc = "";
    const startedAt = Date.now();
    try {
      // El retorno de `astrauraChat` trae la RUTA REAL elegida por el router
      // (Adenda 149 · ola 3): antes se descartaba y el chip de proceso decía
      // siempre el proveedor configurado, respondiera quien respondiera.
      const res = await astrauraChat({
        chatId: convId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        chatConfig: (conv.conversations.find((c) => c.id === convId)?.meta as any)?.config,
        messages: history,
        temperature: DEFAULT_AGENT.temperature,
        signal: abortRef.current.signal,
        onChunk: (delta) => {
          const match = delta.match(/\[\[(.*?)\]\]/);
          if (!match) setStreamText((prev) => prev + delta);
          acc += delta;
        },
      });

      const directives = parseDirectives(acc);
      if (directives.length > 0 && aurora) {
        await aurora.runDirectives(acc);
      }
      if (acc.trim()) {
        const meta = metaFromRoute(res?.route, activeProviderConfig, Date.now() - startedAt);
        await appendUnifiedMessage({
          role: "assistant",
          text: acc,
          convId,
          kind: "aurora",
          surface: "agent",
          source: meta.provider ?? activeProviderConfig.label,
          meta,
        });
        speakAuroraReply(acc, { convId });
      }
    } catch (err) {
      const msg = (err as Error).message;
      if (acc.trim()) {
        await appendUnifiedMessage({
          role: "assistant",
          text: `${acc}\n\n⚠ ${msg}`,
          convId,
          kind: "aurora",
          surface: "agent",
          source: activeProviderConfig.label,
          meta: { provider: activeProviderConfig.label, model: activeProviderConfig.defaultModel },
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
