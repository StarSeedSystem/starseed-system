"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Mic, MicOff, Settings2, SlidersHorizontal, Sparkles, Volume2, Wand2, Puzzle, X,
  Play, Pause, SkipForward, SkipBack, Square, Send, History, ListChecks, MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAurora } from "./aurora-provider";
import { AuroraControlPanel } from "./aurora-control-panel";

type WidgetTab = "chat" | "voz" | "control";

export function AuroraWidget() {
  const aurora = useAurora();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<WidgetTab>("chat");
  const [draft, setDraft] = useState("");
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Cierra el popover al pulsar Escape.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Auto-scroll del historial de chat al fondo cuando llegan mensajes.
  const convoLen = aurora?.conversation?.length ?? 0;
  useEffect(() => {
    if (open && tab === "chat" && scrollRef.current) {
      try { scrollRef.current.scrollTop = scrollRef.current.scrollHeight; } catch { /* */ }
    }
  }, [convoLen, open, tab]);

  if (!aurora) return null;

  const {
    supported, enabled, listening, speaking, paused, transcript, interim, lastReply, actionStatus,
    activePersonality, personalities, toggle, speak, setEnabled, setActivePersonality,
    pauseSpeech, resumeSpeech, skipForward, skipBack, interrupt,
    conversation, actionLog, send,
  } = aurora;

  // ── Botón flotante: activar / pausar / interrumpir + long-press → chat ──
  const startPress = () => {
    longPressed.current = false;
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      setTab("chat");
      setOpen(true);
    }, 500);
  };
  const endPress = () => {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  };
  const onClick = () => {
    // Si fue long-press, ya abrimos el chat: no togglees la escucha.
    if (longPressed.current) { longPressed.current = false; return; }
    if (!supported) { setOpen((o) => !o); return; }
    // toggle() ya interrumpe si Aurora está hablando (activar/pausar/interrumpir).
    toggle();
  };

  const submitDraft = () => {
    const t = draft.trim();
    if (!t) return;
    setDraft("");
    void send(t);
  };

  const state = !supported ? "off" : speaking ? "speaking" : listening ? "listening" : "idle";

  // Controles de transporte de voz (reutilizados en el chat y en la pestaña Voz).
  const Transport = () => (
    <div className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-2 py-2">
      <button
        onClick={() => skipBack()}
        title="Retroceder (respuesta anterior)"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition"
      >
        <SkipBack className="w-4 h-4" />
      </button>
      {paused ? (
        <button
          onClick={() => resumeSpeech()}
          title="Reproducir"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30 transition"
        >
          <Play className="w-4 h-4" />
        </button>
      ) : (
        <button
          onClick={() => pauseSpeech()}
          title="Pausar"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30 transition"
        >
          <Pause className="w-4 h-4" />
        </button>
      )}
      <button
        onClick={() => interrupt()}
        title="Interrumpir"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-rose-500/20 hover:text-rose-200 transition"
      >
        <Square className="w-4 h-4" />
      </button>
      <button
        onClick={() => skipForward()}
        title="Adelantar (respuesta siguiente)"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition"
      >
        <SkipForward className="w-4 h-4" />
      </button>
    </div>
  );

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2 select-none">
      {open && (
        <div className="w-[22rem] max-w-[92vw] rounded-2xl border border-white/10 bg-zinc-950/95 backdrop-blur-xl shadow-2xl shadow-fuchsia-900/20 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-fuchsia-500 to-cyan-500 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white">Aurora</div>
              <div className="text-[10px] text-white/45">
                {speaking ? (paused ? "En pausa" : "Hablando…") : listening ? "Escuchando…" : "La voz de Astraura · control total del OS"}
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/40 hover:text-white"><X className="w-4 h-4" /></button>
          </div>

          {/* Pestañas: Chat (historial) / Voz / Control */}
          <div className="flex items-center gap-1 rounded-lg bg-white/5 p-0.5">
            <button
              onClick={() => setTab("chat")}
              className={cn(
                "flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition",
                tab === "chat" ? "bg-white/10 text-white" : "text-white/55 hover:text-white/80",
              )}
            >
              <MessageSquare className="w-3.5 h-3.5" /> Chat
            </button>
            <button
              onClick={() => setTab("voz")}
              className={cn(
                "flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition",
                tab === "voz" ? "bg-white/10 text-white" : "text-white/55 hover:text-white/80",
              )}
            >
              <Volume2 className="w-3.5 h-3.5" /> Voz
            </button>
            <button
              onClick={() => setTab("control")}
              className={cn(
                "flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition",
                tab === "control" ? "bg-white/10 text-white" : "text-white/55 hover:text-white/80",
              )}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" /> Control
            </button>
          </div>

          {/* Feedback de acción: qué está haciendo Aurora ahora mismo. */}
          {actionStatus && (
            <div className="flex items-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2">
              <Wand2 className="w-3.5 h-3.5 text-cyan-200 animate-pulse shrink-0" />
              <span className="text-xs text-cyan-50">{actionStatus}</span>
            </div>
          )}

          {tab === "control" ? (
            <AuroraControlPanel enabled={enabled} onSetEnabled={setEnabled} />
          ) : tab === "chat" ? (
            <>
              {/* Transporte de voz siempre visible en el chat. */}
              <Transport />

              {/* Historial de conversación. */}
              <div
                ref={scrollRef}
                className="h-56 overflow-y-auto rounded-xl border border-white/10 bg-black/30 px-3 py-2 space-y-2"
              >
                {conversation.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center gap-1 px-2">
                    <History className="w-5 h-5 text-white/25" />
                    <div className="text-[11px] text-white/40 leading-relaxed">
                      Aquí verás tu conversación con Aurora. Háblale o escríbele abajo: tiene control total del OS y sigue activa en segundo plano.
                    </div>
                  </div>
                ) : (
                  conversation.map((m, i) => (
                    <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "max-w-[85%] rounded-2xl px-3 py-1.5 text-xs leading-relaxed",
                          m.role === "user"
                            ? "bg-cyan-500/15 border border-cyan-400/20 text-cyan-50"
                            : "bg-fuchsia-950/40 border border-fuchsia-500/20 text-fuchsia-50/90",
                        )}
                      >
                        <div className={cn(
                          "text-[9px] uppercase tracking-widest mb-0.5",
                          m.role === "user" ? "text-cyan-300/50" : "text-fuchsia-300/50",
                        )}>
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

              {/* Entrada de texto para chatear por escrito. */}
              <div className="flex items-center gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitDraft(); } }}
                  placeholder="Escribe o pídele que abra/haga algo…"
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-fuchsia-500/40"
                />
                <button
                  onClick={submitDraft}
                  title="Enviar"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-fuchsia-600/90 text-white hover:bg-fuchsia-600 transition shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>

              {/* Registro de acciones ejecutadas por Aurora. */}
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

              {/* Accesos rápidos: ajustes de Aurora. */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTab("control")}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10 transition"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" /> Control y sentidos
                </button>
                <button
                  onClick={() => { setOpen(false); try { router.push("/aurora"); } catch { /* */ } }}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10 transition"
                >
                  <Settings2 className="w-3.5 h-3.5" /> Configurar
                </button>
              </div>

              {!supported && (
                <div className="text-[10px] text-amber-300/70 text-center">Tu navegador no soporta voz. Aún puedes escribirle aquí y gestionar sus sentidos en «Control».</div>
              )}
            </>
          ) : (
            <>
              {/* Transporte de voz. */}
              <Transport />

              <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                <span className="text-xs text-white/70">Aurora activa</span>
                <button
                  role="switch"
                  aria-checked={enabled}
                  onClick={() => setEnabled(!enabled)}
                  className={cn("relative inline-flex h-5 w-9 items-center rounded-full transition", enabled ? "bg-fuchsia-600" : "bg-white/15")}
                >
                  <span className={cn("inline-block h-4 w-4 transform rounded-full bg-white transition", enabled ? "translate-x-4" : "translate-x-0.5")} />
                </button>
              </div>

              {personalities.length > 0 && (
                <label className="block text-[11px] text-white/50">
                  Personalidad
                  <select
                    value={activePersonality.id || ""}
                    onChange={(e) => {
                      const p = personalities.find((x) => x.id === e.target.value);
                      if (p) setActivePersonality(p);
                    }}
                    className="mt-1 w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white"
                  >
                    {!activePersonality.id && <option value="" className="bg-zinc-900">{activePersonality.name}</option>}
                    {personalities.map((p) => (
                      <option key={p.id} value={p.id} className="bg-zinc-900">{p.name}</option>
                    ))}
                  </select>
                </label>
              )}

              {(interim || transcript) && (
                <div className="rounded-lg bg-black/40 border border-white/10 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-widest text-cyan-300/50 mb-0.5">Tú</div>
                  <div className="text-xs text-white/80">{interim || transcript}</div>
                </div>
              )}
              {lastReply && (
                <div className="rounded-lg bg-fuchsia-950/30 border border-fuchsia-500/20 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-widest text-fuchsia-300/50 mb-0.5">Aurora</div>
                  <div className="text-xs text-fuchsia-50/90">{lastReply}</div>
                </div>
              )}

              {/* Pista de lo que Aurora puede hacer (control real del OS). */}
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                <div className="text-[10px] uppercase tracking-widest text-white/35 mb-1">Aurora puede actuar</div>
                <div className="text-[11px] leading-relaxed text-white/55">
                  «Abre mis pizarras», «abre la Wikipedia en el navegador», «pon el tema oscuro», «lanza un agente», «busca en mis memorias», «abre el Café»… y sigue activa en segundo plano mientras lo hace.
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => speak(`Hola, soy ${activePersonality.name}. Estoy aquí para ayudarte en StarSeed.`)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-100 hover:bg-cyan-500/20 transition"
                >
                  <Volume2 className="w-3.5 h-3.5" /> Probar voz
                </button>
                <button
                  onClick={() => { setOpen(false); try { router.push("/aurora"); } catch { /* */ } }}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10 transition"
                >
                  <Settings2 className="w-3.5 h-3.5" /> Configurar Aurora
                </button>
              </div>

              {/* Nota: extensión de navegador (próximamente) para control directo. */}
              <div className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                <Puzzle className="w-3.5 h-3.5 text-white/35 mt-0.5 shrink-0" />
                <div className="text-[10px] leading-relaxed text-white/45">
                  Extensión de navegador (próximamente) para control directo de la página y el navegador. Hoy Aurora ya controla todo el OS desde aquí, sin extensión.
                </div>
              </div>

              {!supported && (
                <div className="text-[10px] text-amber-300/70 text-center">Tu navegador no soporta voz. Aún puedes activar Aurora y gestionar sus sentidos en «Control».</div>
              )}
            </>
          )}
        </div>
      )}

      {/* Píldora de acción flotante (visible aunque el panel esté cerrado). */}
      {!open && actionStatus && (
        <div className="flex items-center gap-2 rounded-full border border-cyan-400/30 bg-zinc-950/90 backdrop-blur-xl px-3 py-1.5 shadow-lg shadow-cyan-900/20">
          <Wand2 className="w-3.5 h-3.5 text-cyan-200 animate-pulse" />
          <span className="text-[11px] text-cyan-50 max-w-[60vw] truncate">{actionStatus}</span>
        </div>
      )}

      <button
        onMouseDown={startPress}
        onMouseUp={endPress}
        onMouseLeave={endPress}
        onTouchStart={startPress}
        onTouchEnd={endPress}
        onClick={onClick}
        onContextMenu={(e) => { e.preventDefault(); setTab("chat"); setOpen((o) => !o); }}
        title={!supported
          ? "Tu navegador no soporta voz · clic para opciones"
          : speaking
            ? "Hablando… (clic para interrumpir) · mantén pulsado para el chat"
            : listening
              ? "Escuchando… (clic para parar) · mantén pulsado para el chat"
              : "Hablar con Aurora (clic) · mantén pulsado para el chat e historial"}
        aria-label="Aurora"
        className={cn(
          "relative h-14 w-14 rounded-full flex items-center justify-center shadow-xl transition-transform active:scale-95",
          "bg-gradient-to-tr from-fuchsia-600 to-cyan-500",
          !supported && "opacity-50 grayscale",
          state === "listening" && "ring-4 ring-fuchsia-400/40",
          state === "speaking" && "ring-4 ring-cyan-400/40",
          actionStatus && "ring-4 ring-cyan-300/50",
        )}
      >
        {(state === "listening" || state === "speaking") && (
          <span className={cn(
            "absolute inset-0 rounded-full animate-ping",
            state === "listening" ? "bg-fuchsia-500/40" : "bg-cyan-500/40"
          )} />
        )}
        <span className="relative">
          {!supported
            ? <MicOff className="w-6 h-6 text-white" />
            : speaking
              ? (paused ? <Play className="w-6 h-6 text-white" /> : <Volume2 className="w-6 h-6 text-white" />)
              : <Mic className="w-6 h-6 text-white" />}
        </span>
        {enabled && (
          <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 border-2 border-zinc-950" />
        )}
      </button>
    </div>
  );
}

export default AuroraWidget;
