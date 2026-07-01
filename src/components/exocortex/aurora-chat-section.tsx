"use client";

/**
 * StarSeed OS — Exocórtex · "Chat de Aurora"
 * ----------------------------------------------------------------------------
 * Integra el CHAT COMPLETO del widget de Aurora (con todas sus configuraciones y
 * su ventana) DENTRO del Exocórtex (Explorador Universal, menú Zenith de Trinity).
 *
 * IMPORTANTÍSIMO: el Explorador Universal (ZenithCurtain) se monta en el layout
 * RAÍZ, FUERA del árbol de AuroraProvider. Por eso NO usamos `useAurora()` aquí
 * (devolvería null): hablamos con la Aurora GLOBAL ya montada a través del puente
 * `window.STARSEED_AURORA` (helpers de `open-aurora.ts`). Así reutilizamos el
 * MISMO motor (voz, chat, acciones) sin instanciar una segunda Aurora.
 *
 * Reutiliza los paneles reales del widget:
 *   · AuroraMultichatPanel — sesiones paralelas + selector de proveedor por chat
 *     (autónomo, no depende del motor de voz).
 *   · AuroraControlPanel   — encender/apagar Aurora + sentidos (alimentado con el
 *     estado del puente).
 *
 * Incluye además una tarjeta para REACTIVAR el botón/orbe de Aurora cuando se
 * ocultó (arrastrándolo a la zona de descarte).
 *
 * Aditivo, defensivo y en español. SSR-safe.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Sparkles, Volume2, MessageSquare, Layers, SlidersHorizontal, Send,
  Play, Pause, SkipForward, SkipBack, Square, History, ListChecks, Wand2,
  Eye, Power, Bot, MicOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AuroraMultichatPanel } from "@/components/aurora/aurora-multichat-panel";
import { AuroraControlPanel } from "@/components/aurora/aurora-control-panel";
import {
  getAuroraState,
  subscribeAurora,
  sendToAurora,
  speakAurora,
  toggleAuroraVoice,
  setAuroraEnabled,
  auroraTransport,
  isAuroraReady,
  isAuroraOrbHidden,
  setAuroraOrbHidden,
  subscribeAuroraOrbVisibility,
  type AuroraStateSnapshot,
} from "@/lib/aurora/open-aurora";

type Tab = "chat" | "chats" | "voz" | "control";

export function AuroraChatSection({ className }: { className?: string }) {
  const [tab, setTab] = useState<Tab>("chat");
  const [snap, setSnap] = useState<AuroraStateSnapshot | null>(null);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState("");
  const [orbHidden, setOrbHiddenState] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Suscripción al estado en vivo de Aurora (voz/chat) vía el puente.
  useEffect(() => {
    const refresh = () => { setSnap(getAuroraState()); setReady(isAuroraReady()); };
    const unsub = subscribeAurora(refresh);
    refresh();
    return unsub;
  }, []);

  // Visibilidad del orbe (para la tarjeta de reactivación).
  useEffect(() => {
    if (typeof window === "undefined") return;
    setOrbHiddenState(isAuroraOrbHidden());
    const unsub = subscribeAuroraOrbVisibility((h) => setOrbHiddenState(h));
    return unsub;
  }, []);

  // Auto-scroll del historial al fondo cuando llegan mensajes.
  const convoLen = snap?.conversation?.length ?? 0;
  useEffect(() => {
    if (tab === "chat" && scrollRef.current) {
      try { scrollRef.current.scrollTop = scrollRef.current.scrollHeight; } catch { /* */ }
    }
  }, [convoLen, tab, snap?.interim]);

  const submitDraft = useCallback(async () => {
    const t = draft.trim();
    if (!t) return;
    setDraft("");
    await sendToAurora(t);
  }, [draft]);

  const supported = snap?.supported ?? false;
  const enabled = snap?.enabled ?? false;
  const listening = snap?.listening ?? false;
  const speaking = snap?.speaking ?? false;
  const paused = snap?.paused ?? false;
  const interim = snap?.interim ?? "";
  const lastReply = snap?.lastReply ?? "";
  const actionStatus = snap?.actionStatus ?? "";
  const conversation = snap?.conversation ?? [];
  const actionLog = snap?.actionLog ?? [];
  const personalities = snap?.personalities ?? [];
  const activePersonality = snap?.activePersonality ?? { name: "Aurora" };

  // ── Transporte de voz (passthrough al puente) ──
  const Transport = () => (
    <div className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-2 py-2">
      <button onClick={() => auroraTransport.skipBack()} title="Retroceder" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition">
        <SkipBack className="w-4 h-4" />
      </button>
      {paused ? (
        <button onClick={() => auroraTransport.resume()} title="Reproducir" className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30 transition">
          <Play className="w-4 h-4" />
        </button>
      ) : (
        <button onClick={() => auroraTransport.pause()} title="Pausar" className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30 transition">
          <Pause className="w-4 h-4" />
        </button>
      )}
      <button onClick={() => auroraTransport.interrupt()} title="Interrumpir" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-rose-500/20 hover:text-rose-200 transition">
        <Square className="w-4 h-4" />
      </button>
      <button onClick={() => auroraTransport.skipForward()} title="Adelantar" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition">
        <SkipForward className="w-4 h-4" />
      </button>
    </div>
  );

  return (
    <div className={cn("flex flex-col gap-3 text-white", className)}>
      {/* Cabecera de la sección */}
      <div className="flex items-center gap-2.5">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-tr from-fuchsia-600 to-cyan-500 shadow-md shrink-0">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-tight">Chat de Aurora</h3>
          <p className="text-[11px] text-white/45 truncate">
            {speaking ? (paused ? "En pausa" : "Hablando…") : listening ? "Escuchando…" : "La voz de Astraura · control total del OS · aquí en el Exocórtex"}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide shrink-0",
            ready ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-white/5 text-white/40 border border-white/10",
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", ready ? "bg-emerald-400 animate-pulse" : "bg-white/30")} />
          {ready ? "Conectada" : "En espera"}
        </span>
      </div>

      {/* Tarjeta de REACTIVACIÓN del orbe (si se ocultó de la pantalla) */}
      {orbHidden && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2.5">
          <MicOff className="h-4 w-4 text-amber-300 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-amber-100">El orbe de Aurora está oculto</p>
            <p className="text-[10px] text-amber-200/60 leading-relaxed">Lo quitaste de la pantalla. Reactívalo para tenerlo flotando en todas las rutas.</p>
          </div>
          <button
            onClick={() => setAuroraOrbHidden(false)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-50 hover:bg-amber-500/30 transition cursor-pointer shrink-0"
          >
            <Eye className="h-3.5 w-3.5" /> Reactivar
          </button>
        </div>
      )}

      {/* Puente no disponible: guía para activarlo */}
      {!ready && (
        <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5">
          <Bot className="mt-0.5 h-4 w-4 text-white/40 shrink-0" />
          <p className="text-[11px] leading-relaxed text-white/50">
            Aurora aún no está disponible en este contexto. Se activa desde su orbe flotante (visible en las secciones del OS). El chat multiagente de abajo funciona igualmente.
          </p>
        </div>
      )}

      {/* Pestañas: Chat / Chats / Voz / Control (idénticas al widget) */}
      <div className="flex items-center gap-1 rounded-lg bg-white/5 p-0.5">
        {([
          { id: "chat", label: "Chat", Icon: MessageSquare },
          { id: "chats", label: "Chats", Icon: Layers },
          { id: "voz", label: "Voz", Icon: Volume2 },
          { id: "control", label: "Control", Icon: SlidersHorizontal },
        ] as const).map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition cursor-pointer",
              tab === id ? "bg-white/10 text-white" : "text-white/55 hover:text-white/80",
            )}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* Feedback de acción en vivo */}
      {actionStatus && (
        <div className="flex items-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2">
          <Wand2 className="w-3.5 h-3.5 text-cyan-200 animate-pulse shrink-0" />
          <span className="text-xs text-cyan-50">{actionStatus}</span>
        </div>
      )}

      {tab === "control" ? (
        <AuroraControlPanel enabled={enabled} onSetEnabled={setAuroraEnabled} />
      ) : tab === "chats" ? (
        <AuroraMultichatPanel />
      ) : tab === "chat" ? (
        <>
          <Transport />

          <div ref={scrollRef} className="h-64 overflow-y-auto rounded-xl border border-white/10 bg-black/30 px-3 py-2 space-y-2">
            {conversation.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center gap-1 px-2">
                <History className="w-5 h-5 text-white/25" />
                <div className="text-[11px] text-white/40 leading-relaxed">
                  Aquí verás tu conversación con Aurora. Háblale desde el orbe o escríbele abajo: tiene control total del OS y sigue activa en segundo plano.
                </div>
              </div>
            ) : (
              conversation.map((m, i) => (
                <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-1.5 text-xs leading-relaxed",
                    m.role === "user"
                      ? "bg-cyan-500/15 border border-cyan-400/20 text-cyan-50"
                      : "bg-fuchsia-950/40 border border-fuchsia-500/20 text-fuchsia-50/90",
                  )}>
                    <div className={cn("text-[9px] uppercase tracking-widest mb-0.5", m.role === "user" ? "text-cyan-300/50" : "text-fuchsia-300/50")}>
                      {m.role === "user" ? "Tú" : "Aurora"}
                    </div>
                    {m.text}
                  </div>
                </div>
              ))
            )}
            {interim && (
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl px-3 py-1.5 text-xs text-white/50 italic border border-white/10 bg-white/5">
                  {interim}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void submitDraft(); } }}
              placeholder="Escribe o pídele que abra/haga algo…"
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-fuchsia-500/40"
            />
            <button
              onClick={() => void submitDraft()}
              title="Enviar"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-fuchsia-600/90 text-white hover:bg-fuchsia-600 transition shrink-0 cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

          {actionLog.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/35 mb-1">
                <ListChecks className="w-3 h-3" /> Acciones
              </div>
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {actionLog.slice(-6).reverse().map((a, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-[11px] leading-snug">
                    <span className={cn("mt-1 h-1.5 w-1.5 rounded-full shrink-0", a.ok ? "bg-emerald-400" : "bg-amber-400")} />
                    <span className="text-white/60"><span className="text-white/80 font-medium">{a.name}</span> · {a.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!supported && ready && (
            <div className="text-[10px] text-amber-300/70 text-center">Tu navegador no soporta voz. Aún puedes escribirle aquí y gestionar sus sentidos en «Control».</div>
          )}
        </>
      ) : (
        // ── Pestaña Voz ──
        <>
          <Transport />

          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <span className="inline-flex items-center gap-2 text-xs text-white/70">
              <Power className="h-3.5 w-3.5 text-fuchsia-300" /> Aurora activa
            </span>
            <button
              role="switch"
              aria-checked={enabled}
              onClick={() => setAuroraEnabled(!enabled)}
              className={cn("relative inline-flex h-5 w-9 items-center rounded-full transition", enabled ? "bg-fuchsia-600" : "bg-white/15")}
            >
              <span className={cn("inline-block h-4 w-4 transform rounded-full bg-white transition", enabled ? "translate-x-4" : "translate-x-0.5")} />
            </button>
          </div>

          {personalities.length > 0 && (
            <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest text-white/35 mb-1">Personalidad activa</div>
              <div className="text-xs text-white/80">{activePersonality.name}</div>
              <p className="mt-1 text-[10px] text-white/40 leading-relaxed">
                Cambia la personalidad, el carácter y los parámetros de voz en <a href="/aurora" className="text-cyan-300/80 hover:text-cyan-200 hover:underline">Configurar Aurora</a>.
              </p>
            </div>
          )}

          {(interim || lastReply) && (
            <div className="space-y-2">
              {interim && (
                <div className="rounded-lg bg-black/40 border border-white/10 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-widest text-cyan-300/50 mb-0.5">Tú</div>
                  <div className="text-xs text-white/80">{interim}</div>
                </div>
              )}
              {lastReply && (
                <div className="rounded-lg bg-fuchsia-950/30 border border-fuchsia-500/20 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-widest text-fuchsia-300/50 mb-0.5">Aurora</div>
                  <div className="text-xs text-fuchsia-50/90">{lastReply}</div>
                </div>
              )}
            </div>
          )}

          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <div className="text-[10px] uppercase tracking-widest text-white/35 mb-1">Aurora puede actuar</div>
            <div className="text-[11px] leading-relaxed text-white/55">
              «Abre mis pizarras», «pon el tema oscuro», «lanza un agente», «busca en mis memorias»… y sigue activa en segundo plano mientras lo hace.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { if (supported) toggleAuroraVoice(); }}
              disabled={!supported || !ready}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-1.5 text-xs text-fuchsia-100 hover:bg-fuchsia-500/20 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title={listening ? "Parar de escuchar" : "Empezar a escuchar"}
            >
              <Volume2 className="w-3.5 h-3.5" /> {listening ? "Parar escucha" : "Activar voz"}
            </button>
            <button
              onClick={() => speakAurora(`Hola, soy ${activePersonality.name}. Estoy aquí para ayudarte en StarSeed.`)}
              disabled={!supported || !ready}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-100 hover:bg-cyan-500/20 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles className="w-3.5 h-3.5" /> Probar voz
            </button>
          </div>

          {!supported && ready && (
            <div className="text-[10px] text-amber-300/70 text-center">Tu navegador no soporta voz. Aún puedes activar Aurora y gestionar sus sentidos en «Control».</div>
          )}
        </>
      )}
    </div>
  );
}

export default AuroraChatSection;
