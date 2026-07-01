"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic, MicOff, Settings2, SlidersHorizontal, Sparkles, Volume2, Wand2, Puzzle, X,
  Play, Pause, SkipForward, SkipBack, Square, Send, History, ListChecks, MessageSquare, Layers,
  Layout, LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAurora } from "./aurora-provider";
import { AuroraControlPanel } from "./aurora-control-panel";
import { AuroraMultichatPanel } from "./aurora-multichat-panel";
import { usePerimeter, type PerimeterEdge } from "@/context/perimeter-context";
import { AURORA_TRINITY_FLAG, AURORA_TRINITY_EVENT } from "@/components/layout/trinity-fab";

type WidgetTab = "chat" | "chats" | "voz" | "control";

/**
 * Nodos cardinales Trinity para el Orbe unificado. Mismos edges/colores que el
 * TrinityFab (Zenith/Horizon/Logic/Anchor) — no se inventa nada nuevo: cada
 * pétalo togglea el MISMO `usePerimeter().setActiveEdge` que el resto del OS.
 * Se disponen en un cuarto de arco hacia arriba-izquierda para no chocar con el
 * borde inferior-derecho ni con el panel de Aurora.
 */
const TRINITY_NODES: Array<{
  edge: Exclude<PerimeterEdge, null>;
  label: string;
  sub: string;
  color: string;
  Icon: ComponentType<{ className?: string }>;
  /** Desplazamiento del pétalo respecto al centro del orbe (px). */
  x: number;
  y: number;
}> = [
  { edge: "zenith",  label: "Zenith",  sub: "Guía IA",   color: "#007FFF", Icon: Sparkles,   x: 0,   y: -86 },
  { edge: "logic",   label: "Logic",   sub: "Control",   color: "#FFBF00", Icon: Settings2,  x: -50, y: -70 },
  { edge: "horizon", label: "Horizon", sub: "Creación",  color: "#39FF14", Icon: Layout,     x: -78, y: -30 },
  { edge: "anchor",  label: "Anchor",  sub: "Dock",      color: "#DC143C", Icon: LayoutGrid, x: -86, y: 18 },
];

export function AuroraWidget() {
  const aurora = useAurora();
  const router = useRouter();
  const { activeEdge, setActiveEdge } = usePerimeter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<WidgetTab>("chat");
  const [draft, setDraft] = useState("");
  // Orbe unificado: despliegue de los 4 nodos cardinales Trinity.
  const [trinityOpen, setTrinityOpen] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Cierra el popover / los pétalos Trinity al pulsar Escape.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); setTrinityOpen(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Señaliza globalmente que el Orbe unificado Aurora + Trinidad está montado,
  // para que el TrinityFab independiente CEDA (no duplicar el lanzador Trinity).
  // Al desmontar, retira el flag y avisa para que el FAB reaparezca donde toque.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      (window as unknown as Record<string, unknown>)[AURORA_TRINITY_FLAG] = true;
      window.dispatchEvent(new CustomEvent(AURORA_TRINITY_EVENT));
    } catch { /* */ }
    return () => {
      try {
        (window as unknown as Record<string, unknown>)[AURORA_TRINITY_FLAG] = false;
        window.dispatchEvent(new CustomEvent(AURORA_TRINITY_EVENT));
      } catch { /* */ }
    };
  }, []);

  // Al abrir el chat de Aurora, cierra los pétalos Trinity (y viceversa) para
  // que el orbe no muestre dos superficies a la vez.
  useEffect(() => { if (open) setTrinityOpen(false); }, [open]);

  // Toggle de un nodo cardinal: MISMA API que sensores/FAB/atajos.
  const toggleEdge = (edge: Exclude<PerimeterEdge, null>) => {
    setActiveEdge(activeEdge === edge ? null : edge);
    setTrinityOpen(false);
  };

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

  // ── Glow "estilo Café": halo cálido (solar/ámbar + lima) reactivo a la voz ──
  // Pulsa/intensifica cuando Aurora habla o escucha; respiración suave en reposo.
  // Aditivo y puramente visual: no altera el comportamiento de Aurora.
  const active = state === "speaking" || state === "listening";

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
      {/* Estilos del glow "estilo Café" (warm solar/amber + lime). Inyectados
          como <style> plano (clases/keyframes con prefijo único `aurora-*`),
          aditivo y reversible; respeta prefers-reduced-motion. */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes aurora-breathe {
          0%, 100% { opacity: 0.55; transform: scale(0.96); }
          50%      { opacity: 0.9;  transform: scale(1.04); }
        }
        @keyframes aurora-breathe-strong {
          0%, 100% { opacity: 0.85; transform: scale(1); }
          50%      { opacity: 1;    transform: scale(1.12); }
        }
        @keyframes aurora-ripple {
          0%   { opacity: 0.7; transform: scale(0.85); }
          70%  { opacity: 0;   transform: scale(1.55); }
          100% { opacity: 0;   transform: scale(1.55); }
        }
        .aurora-glow-halo {
          z-index: 0;
          /* Resplandor cálido solar/ámbar con un toque de lima. */
          background:
            radial-gradient(circle at 50% 50%,
              rgba(250, 204, 21, 0.55) 0%,
              rgba(245, 158, 11, 0.40) 35%,
              rgba(132, 204, 22, 0.22) 60%,
              transparent 72%);
          filter: blur(7px);
          will-change: transform, opacity;
          animation: aurora-breathe 4.2s ease-in-out infinite;
        }
        .aurora-fab--active .aurora-glow-halo {
          background:
            radial-gradient(circle at 50% 50%,
              rgba(253, 224, 71, 0.85) 0%,
              rgba(251, 146, 60, 0.6) 30%,
              rgba(163, 230, 53, 0.4) 58%,
              transparent 74%);
          filter: blur(10px);
          animation: aurora-breathe-strong 1.5s ease-in-out infinite;
        }
        .aurora-glow-pulse {
          z-index: 0;
          background:
            radial-gradient(circle at 50% 50%,
              rgba(250, 204, 21, 0.5) 0%,
              rgba(132, 204, 22, 0.28) 55%,
              transparent 70%);
          will-change: transform, opacity;
          animation: aurora-ripple 1.5s ease-out infinite;
        }
        .aurora-fab--glow {
          /* Resplandor cálido proyectado (sombra) que acompaña al halo. */
          box-shadow:
            0 0 18px rgba(245, 158, 11, 0.35),
            0 8px 30px rgba(0, 0, 0, 0.45);
          transition: box-shadow 320ms ease;
        }
        .aurora-fab--glow.aurora-fab--active {
          box-shadow:
            0 0 26px rgba(250, 204, 21, 0.6),
            0 0 48px rgba(132, 204, 22, 0.35),
            0 8px 34px rgba(0, 0, 0, 0.5);
        }
        @media (prefers-reduced-motion: reduce) {
          .aurora-glow-halo,
          .aurora-fab--active .aurora-glow-halo,
          .aurora-glow-pulse {
            animation: none;
          }
        }
      ` }} />
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

          {/* Pestañas: Chat (voz) / Chats (multiagente) / Voz / Control */}
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
              onClick={() => setTab("chats")}
              className={cn(
                "flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition",
                tab === "chats" ? "bg-white/10 text-white" : "text-white/55 hover:text-white/80",
              )}
              title="Sesiones paralelas con su propio proveedor de IA"
            >
              <Layers className="w-3.5 h-3.5" /> Chats
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
          ) : tab === "chats" ? (
            <AuroraMultichatPanel />
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

      {/* ══════════════════════════════════════════════════════════════════
          ORBE UNIFICADO Aurora + Trinidad
          ------------------------------------------------------------------
          Un solo control (ancla/orbe) que reúne DOS superficies sin perder
          ninguna función:
            (a) Aurora — voz/chat con su glow cálido reactivo (el núcleo).
            (b) Trinidad — los 4 nodos cardinales (Zenith/Horizon/Logic/
                Anchor) que togglean el MISMO perímetro que el resto del OS.
          Lenguaje visual «Crystal Liquid Glass» + colores cardinales Trinity,
          animado con framer-motion. El núcleo mantiene TODOS los gestos de
          Aurora (tap = voz, mantener/clic derecho = chat).
      ══════════════════════════════════════════════════════════════════ */}
      <div className="relative flex items-center justify-center">
        {/* Scrim para cerrar los pétalos tocando fuera (no bloquea al orbe). */}
        <AnimatePresence>
          {trinityOpen && (
            <motion.button
              type="button"
              aria-label="Cerrar menú Trinidad"
              onClick={() => setTrinityOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 -z-10 cursor-default bg-transparent"
            />
          )}
        </AnimatePresence>

        {/* Pétalos cardinales Trinity (cuarto de arco arriba-izquierda). */}
        <AnimatePresence>
          {trinityOpen &&
            TRINITY_NODES.map((n, i) => {
              const isActive = activeEdge === n.edge;
              return (
                <motion.button
                  key={n.edge}
                  type="button"
                  title={`${n.label} · ${n.sub}`}
                  aria-label={`${n.label} · ${n.sub}`}
                  onClick={() => toggleEdge(n.edge)}
                  initial={{ opacity: 0, scale: 0.3, x: 0, y: 0 }}
                  animate={{ opacity: 1, scale: 1, x: n.x, y: n.y }}
                  exit={{ opacity: 0, scale: 0.3, x: 0, y: 0 }}
                  transition={{ type: "spring", stiffness: 420, damping: 26, delay: i * 0.04 }}
                  className={cn(
                    "absolute z-20 grid h-11 w-11 place-items-center rounded-full cursor-pointer",
                    "border backdrop-blur-xl transition-shadow duration-200",
                    isActive ? "ring-2 ring-white/40" : "ring-0",
                  )}
                  style={{
                    color: n.color,
                    borderColor: `color-mix(in srgb, ${n.color} 55%, transparent)`,
                    background: `radial-gradient(120% 95% at 30% 18%, rgba(255,255,255,0.20), transparent 55%), color-mix(in srgb, ${n.color} ${isActive ? 30 : 16}%, rgba(8,12,18,0.66))`,
                    boxShadow: isActive
                      ? `0 10px 24px rgba(0,0,0,0.45), 0 0 22px color-mix(in srgb, ${n.color} 65%, transparent)`
                      : `0 8px 20px rgba(0,0,0,0.4), 0 0 14px color-mix(in srgb, ${n.color} 35%, transparent)`,
                  }}
                >
                  <n.Icon className="h-5 w-5" />
                  {isActive && (
                    <span
                      aria-hidden
                      className="absolute -top-1 -right-1 h-2 w-2 animate-pulse rounded-full"
                      style={{ background: n.color }}
                    />
                  )}
                </motion.button>
              );
            })}
        </AnimatePresence>

        {/* Satélite «Trinidad»: abre/cierra los pétalos cardinales. Anclado al
            orbe (arriba-izquierda), con el sigil de 4 gemas cardinales. */}
        <button
          type="button"
          onClick={() => { setOpen(false); setTrinityOpen((v) => !v); }}
          aria-expanded={trinityOpen}
          aria-label={trinityOpen ? "Cerrar menú Trinidad" : "Abrir menú Trinidad"}
          title="Trinidad · Zenith · Horizon · Logic · Anchor"
          className={cn(
            "absolute -top-1 -left-1 z-30 grid h-7 w-7 place-items-center rounded-full cursor-pointer",
            "border border-white/20 bg-zinc-950/80 backdrop-blur-md shadow-lg",
            "transition-transform duration-200 hover:scale-110 active:scale-95",
            (trinityOpen || !!activeEdge) && "ring-2 ring-white/30",
          )}
        >
          <motion.svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            aria-hidden
            animate={{ rotate: trinityOpen ? 45 : 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <circle cx="12" cy="4.6" r="3" fill="#007FFF" />
            <circle cx="19.4" cy="12" r="3" fill="#FFBF00" />
            <circle cx="12" cy="19.4" r="3" fill="#DC143C" />
            <circle cx="4.6" cy="12" r="3" fill="#39FF14" />
            <circle cx="12" cy="12" r="1.6" fill="rgba(255,255,255,0.9)" />
          </motion.svg>
        </button>

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
        data-aurora-state={state}
        className={cn(
          "aurora-fab relative h-14 w-14 rounded-full flex items-center justify-center shadow-xl transition-transform active:scale-95",
          "bg-gradient-to-tr from-fuchsia-600 to-cyan-500",
          !supported && "opacity-50 grayscale",
          // Anillos finos existentes (acentos del OS) — se conservan.
          state === "listening" && "ring-4 ring-fuchsia-400/40",
          state === "speaking" && "ring-4 ring-cyan-400/40",
          actionStatus && "ring-4 ring-cyan-300/50",
          // Glow cálido "estilo Café" siempre activo (respira en reposo,
          // se intensifica al hablar/escuchar). Solo si hay soporte de voz.
          supported && "aurora-fab--glow",
          supported && active && "aurora-fab--active",
        )}
      >
        {/* ── Halo cálido "estilo Café" (solar/ámbar + lima) ──
            Capas puramente decorativas (z bajo, sin punteros): un resplandor
            base que respira y, al hablar/escuchar, una onda expansiva. */}
        {supported && (
          <>
            <span
              aria-hidden
              className="aurora-glow-halo pointer-events-none absolute -inset-2 rounded-full"
            />
            {active && (
              <span
                aria-hidden
                className="aurora-glow-pulse pointer-events-none absolute -inset-1 rounded-full"
              />
            )}
          </>
        )}
        {/* Onda original del OS (se conserva bajo el halo cálido). */}
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
    </div>
  );
}

export default AuroraWidget;
