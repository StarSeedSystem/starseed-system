"use client";

// ════════════════════════════════════════════════════════════════
// AuroraMultichatPanel — sesiones de chat PARALELAS de Aurora (#94)
// + selector de proveedor de IA por chat y auto-selección (#95).
// ----------------------------------------------------------------
// · Rail de pestañas: crear / cambiar / renombrar / cerrar sesiones.
// · Cada sesión muestra su proveedor y envía con SU propia config.
// · Selector por chat: Auto (Aurora elige) · Ollama local · API
//   custom · proveedor configurado · modelo del catálogo OSS.
// · Memorias e interconexión (referenciar otras sesiones) por chat.
//
// Envía a través de chatSmart() pasando el providerConfig del chat
// traducido a { moaMode, providerOverride } por providerConfigToRequest.
// Independiente del motor de voz: historiales separados por sesión.
// Estilo y español alineados con el resto del widget de Aurora.
// ════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, X, Send, Pencil, Check, Cpu, Sparkles, Server, Globe, Link2,
  BrainCircuit, ChevronDown, Loader2, Trash2, MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { chatSmart } from "@/ai/client/chat";
// Pipeline compartido (Adenda 71-ter · I1): personalidad + acciones + conocimiento
// en el prompt, y voz por personalidad. El failover gratis-primero ya lo aporta
// chatSmart()/runMoA(); aquí sumamos personalidad y voz sin cambiar la UI.
import { composeAuroraSystem, speakAuroraReply } from "@/lib/aurora/turn";
import type { ChatMessage } from "@/ai/providers/types";
import { PROVIDER_ORDER, getProvider } from "@/ai/providers";
import { loadConfigs } from "@/ai/client/providerStore";
import { getByCategory } from "@/lib/oss-library";
import {
  useAuroraMultichat,
  providerConfigToRequest,
  buildInterconnectContext,
  DEFAULT_OLLAMA_BASE_URL,
  type AuroraChat,
  type AuroraChatProviderConfig,
  type AuroraProviderMode,
} from "@/lib/aurora/multichat";

// Lectura defensiva de las raíces de memoria (mismo store que cerebros/memorias).
const MEMORY_ROOTS_KEY = "starseed.memory.roots.v1";
interface MemoryRootLite { id: string; name: string }
function loadMemoryRoots(): MemoryRootLite[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(MEMORY_ROOTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r): r is MemoryRootLite => !!r && typeof r.id === "string")
      .map((r) => ({ id: r.id, name: typeof r.name === "string" ? r.name : r.id }));
  } catch {
    return [];
  }
}

const MODE_META: Record<AuroraProviderMode, { label: string; icon: typeof Cpu; tone: string }> = {
  auto: { label: "Auto · Aurora elige", icon: Sparkles, tone: "text-fuchsia-300" },
  provider: { label: "Proveedor configurado", icon: Cpu, tone: "text-cyan-300" },
  ollama: { label: "Ollama local", icon: Server, tone: "text-emerald-300" },
  custom: { label: "API personalizada", icon: Globe, tone: "text-amber-300" },
  catalog: { label: "Modelo del catálogo", icon: BrainCircuit, tone: "text-violet-300" },
};

function providerSummary(pc: AuroraChatProviderConfig): string {
  if (pc.mode === "auto") return "Auto";
  if (pc.mode === "ollama") return `Ollama · ${pc.model || "modelo"}`;
  if (pc.mode === "custom") return `API · ${pc.model || "modelo"}`;
  if (pc.mode === "provider") return `${pc.providerId || "proveedor"}${pc.model ? ` · ${pc.model}` : ""}`;
  if (pc.mode === "catalog") return `Catálogo · ${pc.model || pc.catalogId || ""}`;
  return "Auto";
}

export function AuroraMultichatPanel() {
  const mc = useAuroraMultichat();
  const { chats, activeChatId, activeChat } = mc;

  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [showProvider, setShowProvider] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll al final cuando cambian los mensajes de la sesión activa.
  const msgLen = activeChat?.messages.length ?? 0;
  useEffect(() => {
    if (scrollRef.current) {
      try { scrollRef.current.scrollTop = scrollRef.current.scrollHeight; } catch { /* */ }
    }
  }, [msgLen, activeChatId]);

  // Cancela cualquier envío en curso al cambiar de sesión.
  useEffect(() => {
    return () => { try { abortRef.current?.abort(); } catch { /* */ } };
  }, [activeChatId]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !activeChat || busy) return;
    setDraft("");
    setError(null);
    mc.appendMessage(activeChat.id, { role: "user", text, at: Date.now() });
    // Placeholder de assistant que rellenamos por streaming.
    mc.appendMessage(activeChat.id, { role: "assistant", text: "", at: Date.now() });

    // Historial de la sesión (independiente) → mensajes para el modelo.
    const current = chats.find((c) => c.id === activeChat.id) || activeChat;
    const history: ChatMessage[] = current.messages
      .filter((m) => m.text.trim() && !(m.role === "assistant" && m.text === ""))
      .map((m) => ({ role: m.role, content: m.text }));
    // Aseguramos el último turno del usuario (el placeholder vacío se excluye).
    if (history[history.length - 1]?.content !== text) {
      history.push({ role: "user", content: text });
    }

    // Interconexión: contexto de otras sesiones referenciadas (#94).
    const interconnect = buildInterconnectContext(current, chats);
    // Pipeline compartido: personalidad (chatSmart NO la inyecta) + acciones del
    // OS + conocimiento del ecosistema + contexto de ruta. Defensivo.
    let preamble = "";
    try {
      preamble = await composeAuroraSystem({
        includePersona: true,
        route: typeof window !== "undefined" ? window.location.pathname : "/",
      });
    } catch { /* */ }
    const systemBlock = [preamble, interconnect].filter(Boolean).join("\n\n");
    const messages: ChatMessage[] = systemBlock
      ? [{ role: "system", content: systemBlock }, ...history]
      : history;

    // Selector por chat → modo MoA + override de proveedor (#95).
    const { moaMode, providerOverride } = providerConfigToRequest(current.providerConfig);

    abortRef.current = new AbortController();
    setBusy(true);
    let acc = "";
    try {
      const res = await chatSmart({
        messages,
        moaMode,
        providerOverride,
        memoryRootIds: current.memoryRootIds,
        signal: abortRef.current.signal,
        onChunk: (delta) => {
          acc += delta;
          mc.updateLastMessage(current.id, "assistant", acc);
        },
      });
      const finalText = (acc || res?.text || "").trim();
      mc.updateLastMessage(current.id, "assistant", finalText || "(sin respuesta)");
      // Voz según la personalidad activa (respeta su estilo). Sin convId no hay
      // toggle por chat: gobierna la voz global de la personalidad efectiva.
      if (finalText) speakAuroraReply(finalText, {});
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      const friendly = msg && !/abort/i.test(msg)
        ? `No pude responder: ${msg}`
        : "Envío cancelado o sin proveedor disponible.";
      mc.updateLastMessage(current.id, "assistant", acc.trim() || friendly);
      setError(friendly);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const startEdit = (c: AuroraChat) => { setEditingId(c.id); setEditTitle(c.title); };
  const commitEdit = () => {
    if (editingId) mc.renameChat(editingId, editTitle);
    setEditingId(null);
  };

  return (
    <div className="space-y-2.5">
      {/* Rail de sesiones paralelas */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {chats.map((c) => {
          const active = c.id === activeChatId;
          const Meta = MODE_META[c.providerConfig.mode];
          const Icon = Meta.icon;
          return (
            <div
              key={c.id}
              className={cn(
                "group flex items-center gap-1.5 rounded-lg border px-2 py-1.5 shrink-0 transition cursor-pointer",
                active
                  ? "border-fuchsia-500/40 bg-fuchsia-500/10"
                  : "border-white/10 bg-white/[0.03] hover:border-white/20",
              )}
              onClick={() => mc.setActiveChat(c.id)}
              title={`${c.title} · ${providerSummary(c.providerConfig)}`}
            >
              <Icon className={cn("h-3 w-3 shrink-0", Meta.tone)} />
              {editingId === c.id ? (
                <input
                  autoFocus
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  onBlur={commitEdit}
                  onClick={(e) => e.stopPropagation()}
                  className="w-24 bg-transparent text-[11px] text-white outline-none border-b border-white/30"
                />
              ) : (
                <span className={cn("text-[11px] max-w-[7rem] truncate", active ? "text-white" : "text-white/70")}>
                  {c.title}
                </span>
              )}
              {active && editingId !== c.id && (
                <button
                  onClick={(e) => { e.stopPropagation(); startEdit(c); }}
                  title="Renombrar"
                  className="text-white/40 hover:text-white"
                >
                  <Pencil className="h-2.5 w-2.5" />
                </button>
              )}
              {chats.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); mc.closeChat(c.id); }}
                  title="Cerrar sesión"
                  className="text-white/30 hover:text-rose-300"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
        <button
          onClick={() => mc.createChat()}
          title="Nueva sesión paralela"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {activeChat && (
        <>
          {/* Cabecera del proveedor de la sesión activa (#95) */}
          <button
            onClick={() => setShowProvider((v) => !v)}
            className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-left hover:border-white/20 transition"
          >
            {(() => { const I = MODE_META[activeChat.providerConfig.mode].icon; return <I className={cn("h-3.5 w-3.5", MODE_META[activeChat.providerConfig.mode].tone)} />; })()}
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-white/85">{MODE_META[activeChat.providerConfig.mode].label}</div>
              <div className="text-[9px] text-white/40 truncate">{providerSummary(activeChat.providerConfig)}</div>
            </div>
            <ChevronDown className={cn("h-3.5 w-3.5 text-white/40 transition", showProvider && "rotate-180")} />
          </button>

          {showProvider && (
            <ProviderEditor chat={activeChat} onClose={() => setShowProvider(false)} mc={mc} allChats={chats} />
          )}

          {/* Historial de la sesión activa (independiente) */}
          <div
            ref={scrollRef}
            className="h-48 overflow-y-auto rounded-xl border border-white/10 bg-black/30 px-3 py-2 space-y-2"
          >
            {activeChat.messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center gap-1 px-2">
                <MessageSquare className="w-5 h-5 text-white/25" />
                <div className="text-[11px] text-white/40 leading-relaxed">
                  Sesión independiente con su propio proveedor, contexto y memorias. Escríbele abajo.
                </div>
              </div>
            ) : (
              activeChat.messages.map((m, i) => {
                if (m.role === "system") return null;
                return (
                  <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3 py-1.5 text-xs leading-relaxed whitespace-pre-wrap",
                        m.role === "user"
                          ? "bg-cyan-500/15 border border-cyan-400/20 text-cyan-50"
                          : "bg-fuchsia-950/40 border border-fuchsia-500/20 text-fuchsia-50/90",
                      )}
                    >
                      {m.text === "" && busy ? (
                        <span className="inline-flex items-center gap-1 text-white/50">
                          <Loader2 className="h-3 w-3 animate-spin" /> pensando…
                        </span>
                      ) : (
                        m.text
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {error && <div className="text-[10px] text-rose-300/80 px-1">{error}</div>}

          {/* Entrada de texto */}
          <div className="flex items-center gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void send(); } }}
              placeholder="Mensaje a esta sesión…"
              disabled={busy}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-fuchsia-500/40 disabled:opacity-60"
            />
            {busy ? (
              <button
                onClick={() => { try { abortRef.current?.abort(); } catch { /* */ } }}
                title="Detener"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-rose-600/80 text-white hover:bg-rose-600 transition shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => void send()}
                title="Enviar"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-fuchsia-600/90 text-white hover:bg-fuchsia-600 transition shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>

          {activeChat.messages.length > 0 && (
            <button
              onClick={() => mc.clearMessages(activeChat.id)}
              className="inline-flex items-center gap-1 text-[10px] text-white/35 hover:text-white/60"
            >
              <Trash2 className="h-3 w-3" /> Vaciar esta sesión
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ── Editor de proveedor + memorias + interconexión por sesión ────

function ProviderEditor({
  chat,
  onClose,
  mc,
  allChats,
}: {
  chat: AuroraChat;
  onClose: () => void;
  mc: ReturnType<typeof useAuroraMultichat>;
  allChats: AuroraChat[];
}) {
  const pc = chat.providerConfig;
  const roots = useMemo(() => loadMemoryRoots(), []);
  // Proveedores ya configurados por el usuario (para el modo "provider").
  const configured = useMemo(() => {
    try { return loadConfigs().filter((c) => c.enabled); } catch { return []; }
  }, []);
  // Modelos del catálogo OSS (familias LLM + runtimes) para el modo "catalog".
  const catalogModels = useMemo(() => {
    try { return [...getByCategory("llm"), ...getByCategory("runtime")]; } catch { return []; }
  }, []);

  const set = (patch: Partial<AuroraChatProviderConfig>) => mc.updateProviderConfig(chat.id, patch);

  const MODES: AuroraProviderMode[] = ["auto", "provider", "ollama", "custom", "catalog"];

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5 space-y-2.5">
      {/* Selector de modo */}
      <div className="grid grid-cols-2 gap-1.5">
        {MODES.map((m) => {
          const Meta = MODE_META[m];
          const Icon = Meta.icon;
          const active = pc.mode === m;
          return (
            <button
              key={m}
              onClick={() => set({ mode: m, label: Meta.label })}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left transition",
                active ? "border-fuchsia-500/40 bg-fuchsia-500/10" : "border-white/10 bg-black/20 hover:border-white/20",
              )}
            >
              <Icon className={cn("h-3.5 w-3.5 shrink-0", Meta.tone)} />
              <span className="text-[10px] text-white/80 leading-tight">{Meta.label}</span>
            </button>
          );
        })}
      </div>

      {pc.mode === "auto" && (
        <p className="text-[10px] leading-relaxed text-white/45">
          Aurora elige por cada solicitud el mejor proveedor/modelo (router multi-agente). Recomendado.
        </p>
      )}

      {pc.mode === "provider" && (
        <div className="space-y-1.5">
          <label className="block text-[10px] text-white/50">
            Proveedor
            <select
              value={pc.providerId || ""}
              onChange={(e) => set({ providerId: e.target.value || undefined })}
              className="mt-1 w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[11px] text-white"
            >
              <option value="" className="bg-zinc-900">Activo del usuario</option>
              {PROVIDER_ORDER.map((id) => {
                let label: string = id;
                try { label = getProvider(id).info.label; } catch { /* */ }
                const isOn = configured.some((c) => c.id === id);
                return (
                  <option key={id} value={id} className="bg-zinc-900">
                    {label}{isOn ? "" : " (sin configurar)"}
                  </option>
                );
              })}
            </select>
          </label>
          <input
            value={pc.model || ""}
            onChange={(e) => set({ model: e.target.value || undefined })}
            placeholder="Modelo (opcional, usa el por defecto)"
            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[11px] text-white placeholder:text-white/30"
          />
        </div>
      )}

      {pc.mode === "ollama" && (
        <div className="space-y-1.5">
          <input
            value={pc.baseUrl ?? DEFAULT_OLLAMA_BASE_URL}
            onChange={(e) => set({ baseUrl: e.target.value })}
            placeholder={DEFAULT_OLLAMA_BASE_URL}
            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[11px] text-white placeholder:text-white/30"
          />
          <input
            value={pc.model || ""}
            onChange={(e) => set({ model: e.target.value || undefined })}
            placeholder="Modelo (p.ej. llama3.2, qwen2.5)"
            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[11px] text-white placeholder:text-white/30"
          />
          <p className="text-[10px] text-white/40">Endpoint Ollama local. Cero datos enviados a terceros.</p>
        </div>
      )}

      {pc.mode === "custom" && (
        <div className="space-y-1.5">
          <input
            value={pc.baseUrl || ""}
            onChange={(e) => set({ baseUrl: e.target.value })}
            placeholder="Base URL (p.ej. https://api.miservicio.com/v1)"
            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[11px] text-white placeholder:text-white/30"
          />
          <input
            value={pc.model || ""}
            onChange={(e) => set({ model: e.target.value || undefined })}
            placeholder="Modelo"
            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[11px] text-white placeholder:text-white/30"
          />
          <input
            type="password"
            value={pc.apiKey || ""}
            onChange={(e) => set({ apiKey: e.target.value || undefined })}
            placeholder="Clave API (opcional)"
            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[11px] text-white placeholder:text-white/30"
          />
          <p className="text-[10px] text-white/40">API compatible con OpenAI (/chat/completions). La clave se guarda solo en este equipo.</p>
        </div>
      )}

      {pc.mode === "catalog" && (
        <div className="space-y-1.5">
          <label className="block text-[10px] text-white/50">
            Modelo / runtime del catálogo
            <select
              value={pc.catalogId || ""}
              onChange={(e) => {
                const opt = catalogModels.find((o) => o.id === e.target.value);
                set({ catalogId: e.target.value || undefined, label: opt?.name, model: pc.model });
              }}
              className="mt-1 w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[11px] text-white"
            >
              <option value="" className="bg-zinc-900">Elige del catálogo OSS…</option>
              {catalogModels.map((o) => (
                <option key={o.id} value={o.id} className="bg-zinc-900">{o.name}</option>
              ))}
            </select>
          </label>
          <input
            value={pc.model || ""}
            onChange={(e) => set({ model: e.target.value || undefined })}
            placeholder="Etiqueta del modelo en tu runtime (p.ej. qwen2.5)"
            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[11px] text-white placeholder:text-white/30"
          />
          <input
            value={pc.baseUrl ?? DEFAULT_OLLAMA_BASE_URL}
            onChange={(e) => set({ baseUrl: e.target.value })}
            placeholder={DEFAULT_OLLAMA_BASE_URL}
            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[11px] text-white placeholder:text-white/30"
          />
          <p className="text-[10px] text-white/40">Se ejecuta vía runtime local (Ollama) por defecto. Ajusta la base si usas otro.</p>
        </div>
      )}

      {/* Memorias enlazadas a esta sesión */}
      <div className="border-t border-white/8 pt-2">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/40 mb-1.5">
          <BrainCircuit className="h-3 w-3" /> Memorias de esta sesión
        </div>
        {roots.length === 0 ? (
          <p className="text-[10px] text-white/35">No hay memorias conectadas. Conéctalas en Memorias.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {roots.map((r) => {
              const on = chat.memoryRootIds.includes(r.id);
              return (
                <button
                  key={r.id}
                  onClick={() => {
                    const next = on
                      ? chat.memoryRootIds.filter((x) => x !== r.id)
                      : [...chat.memoryRootIds, r.id];
                    mc.setMemoryRootIds(chat.id, next);
                  }}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] transition",
                    on ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200" : "border-white/15 text-white/55 hover:border-white/30",
                  )}
                >
                  {on && <Check className="inline h-2.5 w-2.5 mr-0.5" />}{r.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Interconexión: referenciar otras sesiones */}
      {allChats.length > 1 && (
        <div className="border-t border-white/8 pt-2">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/40 mb-1.5">
            <Link2 className="h-3 w-3" /> Conectar con otras sesiones
          </div>
          <div className="flex flex-wrap gap-1.5">
            {allChats.filter((c) => c.id !== chat.id).map((other) => {
              const on = chat.contextRefs.some((r) => r.chatId === other.id);
              return (
                <button
                  key={other.id}
                  onClick={() => mc.toggleContextRef(chat.id, other.id, "last")}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] transition",
                    on ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-200" : "border-white/15 text-white/55 hover:border-white/30",
                  )}
                  title="Comparte la última respuesta de esa sesión como contexto"
                >
                  {on && <Check className="inline h-2.5 w-2.5 mr-0.5" />}{other.title}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button
        onClick={onClose}
        className="w-full inline-flex items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[10px] text-white/70 hover:bg-white/10"
      >
        <Check className="h-3 w-3" /> Listo
      </button>
    </div>
  );
}

export default AuroraMultichatPanel;
