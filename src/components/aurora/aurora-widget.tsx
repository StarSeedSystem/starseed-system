"use client";

import { useEffect, useRef, useState, useCallback, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic, MicOff, Settings2, SlidersHorizontal, Sparkles, Volume2, Wand2, Puzzle, X,
  Play, Pause, SkipForward, SkipBack, Square, Send, History, ListChecks, MessageSquare, Layers,
  Layout, LayoutGrid, EyeOff, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAurora } from "./aurora-provider";
import { AuroraControlPanel } from "./aurora-control-panel";
import { AuroraMultichatPanel } from "./aurora-multichat-panel";
import { usePerimeter, type PerimeterEdge } from "@/context/perimeter-context";
import { AURORA_TRINITY_FLAG, AURORA_TRINITY_EVENT } from "@/components/layout/trinity-fab";
import { AuroraOrb } from "./aurora-orb";
import {
  readOrbHidden,
  setOrbHidden as setOrbHiddenBus,
  subscribeOrbVisibility,
  readOrbPosition,
  writeOrbPosition,
  DEFAULT_ORB_POSITION,
  type AuroraOrbPosition,
} from "@/lib/aurora/aurora-orb-bus";

type WidgetTab = "chat" | "chats" | "voz" | "control";

/**
 * Nodos cardinales Trinity para el Orbe unificado. Mismos edges/colores que el
 * TrinityFab (Zenith/Horizon/Logic/Anchor) — no se inventa nada nuevo: cada
 * pétalo togglea el MISMO `usePerimeter().setActiveEdge` que el resto del OS.
 *
 * Mapa de la ESTRELLA de 4 puntas del orbe (petición de diseño):
 *   · abajo   = rojo    → Anchor (Dock)
 *   · arriba  = azul    → Zenith (Guía IA / Explorador)
 *   · izquierda = verde → Horizon (Creación)
 *   · derecha = amarillo→ Logic  (Control)
 */
type Cardinal = "up" | "down" | "left" | "right";

const TRINITY_NODES: Array<{
  edge: Exclude<PerimeterEdge, null>;
  dir: Cardinal;
  label: string;
  sub: string;
  color: string;
  Icon: ComponentType<{ className?: string }>;
  /** Desplazamiento del pétalo respecto al centro del orbe (px), en su cardinal. */
  x: number;
  y: number;
}> = [
  { edge: "zenith",  dir: "up",    label: "Zenith",  sub: "Guía IA",   color: "#007FFF", Icon: Sparkles,   x: 0,   y: -92 },
  { edge: "anchor",  dir: "down",  label: "Anchor",  sub: "Dock",      color: "#DC143C", Icon: LayoutGrid, x: 0,   y: 92 },
  { edge: "horizon", dir: "left",  label: "Horizon", sub: "Creación",  color: "#39FF14", Icon: Layout,     x: -92, y: 0 },
  { edge: "logic",   dir: "right", label: "Logic",   sub: "Control",   color: "#FFBF00", Icon: Settings2,  x: 92,  y: 0 },
];

const ORB_PX = 60;                // diámetro del núcleo del orbe
const LONG_PRESS_MS = 480;        // umbral para desplegar los pétalos
const DRAG_SLOP = 8;              // px antes de considerar arrastre
const DRAG_TO_OPEN_DIST = 46;     // px de arrastre hacia una punta para abrir su menú

export function AuroraWidget() {
  const aurora = useAurora();
  const router = useRouter();
  const { activeEdge, setActiveEdge } = usePerimeter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<WidgetTab>("chat");
  const [draft, setDraft] = useState("");

  // Orbe unificado: despliegue de los 4 nodos cardinales Trinity.
  const [trinityOpen, setTrinityOpen] = useState(false);
  // Punta cardinal resaltada durante un arrastre-para-abrir (drag-to-open).
  const [aimDir, setAimDir] = useState<Cardinal | null>(null);

  // Visibilidad del orbe (arrastrable a la zona de descarte → se oculta;
  // se reactiva desde el Exocórtex). SSR-safe: arranca visible.
  const [hidden, setHidden] = useState(false);
  // ¿Está el orbe arrastrándose para reposicionarse? (muestra la zona de descarte).
  const [moving, setMoving] = useState(false);
  const [overTrash, setOverTrash] = useState(false);

  // Posición del orbe como fracción del viewport (movible + persistida).
  const [pos, setPos] = useState<AuroraOrbPosition>(DEFAULT_ORB_POSITION);

  // Píldora de estado de acción: descartable; reaparece con cada acción nueva.
  const [pillDismissed, setPillDismissed] = useState(false);
  const actionStatusLive = aurora?.actionStatus;
  useEffect(() => { setPillDismissed(false); }, [actionStatusLive]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const orbWrapRef = useRef<HTMLDivElement | null>(null);

  // ── Gestos del orbe (puntero unificado ratón/táctil) ──
  const gesture = useRef<{
    id: number;
    startX: number;
    startY: number;
    longTimer: ReturnType<typeof setTimeout> | null;
    longFired: boolean;   // ya se desplegaron los pétalos (modo drag-to-open)
    moved: boolean;       // superó el slop → arrastre de reposición
    handled: boolean;     // ya se resolvió (evita doble acción)
  } | null>(null);

  // ── Sincronización de posición/visibilidad con localStorage + bus ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    setHidden(readOrbHidden());
    setPos(readOrbPosition());
    const unsub = subscribeOrbVisibility((h) => setHidden(h));
    return unsub;
  }, []);

  // Cierra el popover / los pétalos Trinity al pulsar Escape.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); setTrinityOpen(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Señaliza globalmente que el Orbe unificado Aurora + Trinidad está montado,
  // para que el TrinityFab independiente CEDA (no duplicar el lanzador Trinity).
  // Si el orbe se OCULTA, retira el flag para que el FAB táctil reaparezca y el
  // usuario conserve acceso a los 4 menús cardinales.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      (window as unknown as Record<string, unknown>)[AURORA_TRINITY_FLAG] = !hidden;
      window.dispatchEvent(new CustomEvent(AURORA_TRINITY_EVENT));
    } catch { /* */ }
    return () => {
      try {
        (window as unknown as Record<string, unknown>)[AURORA_TRINITY_FLAG] = false;
        window.dispatchEvent(new CustomEvent(AURORA_TRINITY_EVENT));
      } catch { /* */ }
    };
  }, [hidden]);

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

  // Traduce un delta de arrastre a una punta cardinal (para el drag-to-open).
  const dirFromDelta = useCallback((dx: number, dy: number): Cardinal | null => {
    const dist = Math.hypot(dx, dy);
    if (dist < DRAG_TO_OPEN_DIST) return null;
    if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? "left" : "right";
    return dy < 0 ? "up" : "down";
  }, []);

  // ── Puntero: tap = voz · long-press = pétalos + drag-to-open · arrastre = mover ──
  const onOrbPointerDown = useCallback((e: React.PointerEvent) => {
    if (gesture.current) return;
    // No robamos gestos sobre el botón satélite de Trinidad (tiene su propio onClick).
    const el = e.target as HTMLElement;
    if (el.closest("[data-aurora-trinity-toggle]")) return;

    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const g = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      longTimer: null as ReturnType<typeof setTimeout> | null,
      longFired: false,
      moved: false,
      handled: false,
    };
    gesture.current = g;

    // Programa el long-press: despliega los pétalos y entra en modo drag-to-open.
    g.longTimer = setTimeout(() => {
      if (!gesture.current || gesture.current.id !== e.pointerId) return;
      if (gesture.current.moved) return; // si ya arrastra para mover, no despliega
      gesture.current.longFired = true;
      setOpen(false);
      setTrinityOpen(true);
    }, LONG_PRESS_MS);
  }, []);

  const onOrbPointerMove = useCallback((e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    const dist = Math.hypot(dx, dy);

    if (g.longFired) {
      // Modo drag-to-open: resalta la punta hacia la que se apunta.
      setAimDir(dirFromDelta(dx, dy));
      return;
    }

    if (!g.moved && dist > DRAG_SLOP) {
      g.moved = true;
      if (g.longTimer) { clearTimeout(g.longTimer); g.longTimer = null; }
      setMoving(true);
    }

    if (g.moved && typeof window !== "undefined") {
      // Reposición: mueve el orbe con el puntero (persistimos al soltar).
      const x = Math.max(0, Math.min(1, e.clientX / window.innerWidth));
      const y = Math.max(0, Math.min(1, e.clientY / window.innerHeight));
      setPos({ xRatio: x, yRatio: y });
      // Zona de descarte: mitad superior-central de la pantalla.
      const inTrash = e.clientY < 120 && Math.abs(e.clientX - window.innerWidth / 2) < 170;
      setOverTrash(inTrash);
    }
  }, [dirFromDelta]);

  const finishGesture = useCallback((e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    if (g.longTimer) { clearTimeout(g.longTimer); g.longTimer = null; }
    gesture.current = null;

    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;

    if (g.longFired) {
      // Drag-to-open: si se soltó apuntando a una punta, abre ese menú.
      const dir = dirFromDelta(dx, dy);
      setAimDir(null);
      if (dir) {
        const node = TRINITY_NODES.find((n) => n.dir === dir);
        if (node) { toggleEdge(node.edge); return; }
      }
      // Soltó en el centro: deja los pétalos abiertos para pulsarlos.
      return;
    }

    if (g.moved) {
      setMoving(false);
      if (overTrash) {
        // Arrastrado a la zona de descarte → ocultar el orbe.
        setOverTrash(false);
        setOrbHiddenBus(true);
        return;
      }
      setOverTrash(false);
      // Persistir la nueva posición.
      if (typeof window !== "undefined") {
        const next = {
          xRatio: Math.max(0.04, Math.min(0.96, e.clientX / window.innerWidth)),
          yRatio: Math.max(0.06, Math.min(0.95, e.clientY / window.innerHeight)),
        };
        setPos(next);
        writeOrbPosition(next);
      }
      return;
    }

    // TAP simple → activar/pausar/interrumpir la voz de Aurora (cualquier disp.).
    if (!aurora) return;
    if (!aurora.supported) { setOpen((o) => !o); return; }
    aurora.toggle();
  }, [aurora, dirFromDelta, overTrash]);

  const cancelGesture = useCallback((e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    if (g.longTimer) { clearTimeout(g.longTimer); g.longTimer = null; }
    gesture.current = null;
    setMoving(false);
    setOverTrash(false);
    setAimDir(null);
  }, []);

  if (!aurora) return null;

  const {
    supported, enabled, listening, speaking, paused, transcript, interim, lastReply, actionStatus,
    activePersonality, personalities, speak, setEnabled, setActivePersonality,
    pauseSpeech, resumeSpeech, skipForward, skipBack, interrupt,
    conversation, actionLog, send,
  } = aurora;

  const submitDraft = () => {
    const t = draft.trim();
    if (!t) return;
    setDraft("");
    void send(t);
  };

  const state = !supported ? "off" : speaking ? "speaking" : listening ? "listening" : "idle";

  // Posición absoluta del orbe (fracción → px), presente en TODAS las rutas.
  // dvh: viewport dinámico (respeta teclado/barras móviles), como el Café.
  const orbStyle: React.CSSProperties = {
    left: `calc(${(pos.xRatio * 100).toFixed(3)}vw - ${ORB_PX / 2}px)`,
    top: `calc(${(pos.yRatio * 100).toFixed(3)}dvh - ${ORB_PX / 2}px)`,
  };

  // ── Anclaje del panel y de la píldora AL ORBE ─────────────────────────────
  // Se abren hacia el lado con más espacio según el cuadrante del orbe, con
  // transform-origin mirando al orbe y clamps (100dvh + safe-areas) para no
  // salirse nunca del viewport — mismo criterio que el panel del Café.
  const openUp = pos.yRatio >= 0.5;   // orbe en mitad inferior → abre hacia arriba
  const openLeft = pos.xRatio >= 0.5; // orbe en mitad derecha → crece hacia la izquierda
  const ANCHOR_GAP = ORB_PX / 2 + 14; // separación desde el centro del orbe
  const vAnchor: React.CSSProperties = openUp
    ? { bottom: `calc(${((1 - pos.yRatio) * 100).toFixed(3)}dvh + ${ANCHOR_GAP}px)` }
    : { top: `calc(${(pos.yRatio * 100).toFixed(3)}dvh + ${ANCHOR_GAP}px)` };
  const hAnchor = (maxW: string): React.CSSProperties => (openLeft
    ? { right: `clamp(8px, calc(${((1 - pos.xRatio) * 100).toFixed(3)}vw - ${ORB_PX / 2}px), calc(100vw - ${maxW} - 8px))` }
    : { left: `clamp(8px, calc(${(pos.xRatio * 100).toFixed(3)}vw - ${ORB_PX / 2}px), calc(100vw - ${maxW} - 8px))` });
  const PANEL_W = "min(22rem, calc(100vw - 16px))";
  const panelStyle: React.CSSProperties = {
    ...vAnchor,
    ...hAnchor(PANEL_W),
    maxHeight: openUp
      ? `calc(${(pos.yRatio * 100).toFixed(3)}dvh - ${ANCHOR_GAP + 10}px - env(safe-area-inset-top, 0px))`
      : `calc(${((1 - pos.yRatio) * 100).toFixed(3)}dvh - ${ANCHOR_GAP + 10}px - env(safe-area-inset-bottom, 0px))`,
    transformOrigin: `${openLeft ? "right" : "left"} ${openUp ? "bottom" : "top"}`,
    // Glass fuerte del Café: tintes aurora (lime + lavanda) sobre cristal oscuro.
    background:
      "radial-gradient(140% 80% at 18% -8%, rgba(159,232,112,0.10), transparent 60%), radial-gradient(150% 90% at 110% 0%, rgba(201,168,255,0.10), transparent 55%), rgba(9,13,18,0.9)",
  };

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

  // Si el orbe está oculto, no renderizamos NADA flotante (ni panel ni orbe).
  // La reactivación vive en el Exocórtex → sección "Chat de Aurora".
  if (hidden) return null;

  return (
    <>
      {/* ══════════════════════════════════════════════════════════════════
          PANEL DE AURORA (chat / chats / voz / control)
          Anclado cerca del orbe; se abre con long-press o clic derecho.
          Contiene TODA la funcionalidad actual de Aurora sin cambios.
      ══════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: openUp ? 10 : -10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: openUp ? 10 : -10, scale: 0.92 }}
            transition={{ type: "spring", stiffness: 340, damping: 30 }}
            className="fixed z-[60] flex w-[22rem] max-w-[calc(100vw-16px)] select-none flex-col overflow-hidden rounded-[26px] border border-white/10 shadow-2xl shadow-black/50 backdrop-blur-2xl"
            style={panelStyle}
          >
          {/* Filo aurora superior (lenguaje del Café): lime → cyan → lavanda. */}
          <div
            aria-hidden
            className="h-[2px] w-full shrink-0 bg-gradient-to-r from-[#9FE870] via-[#6FE6D6] to-[#C9A8FF] opacity-80 shadow-[0_0_14px_rgba(111,230,214,0.55)]"
          />
          {/* Contenido con scroll interno: el panel nunca se sale del viewport. */}
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
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

              {/* Ocultar el orbe (se reactiva desde el Exocórtex). */}
              <button
                onClick={() => { setOpen(false); setOrbHiddenBus(true); }}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5 text-[11px] text-white/55 hover:bg-white/10 hover:text-white/80 transition"
                title="Quitar el orbe de la pantalla. Podrás reactivarlo desde el Exocórtex."
              >
                <EyeOff className="w-3.5 h-3.5" /> Quitar orbe de la pantalla
              </button>

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
          </motion.div>
        )}
      </AnimatePresence>

      {/* Píldora de acción flotante ANCLADA al orbe (encima o debajo según el
          cuadrante), visible aunque el panel esté cerrado; descartable. */}
      {!open && actionStatus && !pillDismissed && (
        <div
          className="fixed z-[55] flex items-center gap-2 rounded-full border border-cyan-400/30 bg-zinc-950/90 px-3 py-1.5 shadow-lg shadow-cyan-900/20 backdrop-blur-xl"
          style={{ ...vAnchor, ...hAnchor("min(20rem, 70vw)") }}
        >
          <Wand2 className="w-3.5 h-3.5 shrink-0 animate-pulse text-cyan-200" />
          <span className="max-w-[min(16rem,55vw)] truncate text-[11px] text-cyan-50">{actionStatus}</span>
          <button
            type="button"
            onClick={() => setPillDismissed(true)}
            aria-label="Descartar aviso de acción"
            title="Descartar"
            className="grid h-4 w-4 shrink-0 cursor-pointer place-items-center rounded-full text-cyan-200/60 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Zona de descarte: aparece al arrastrar el orbe para reposicionarlo. */}
      <AnimatePresence>
        {moving && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={cn(
              "fixed top-4 left-1/2 -translate-x-1/2 z-[70] pointer-events-none",
              "flex items-center gap-2 rounded-full border px-5 py-2.5 backdrop-blur-xl transition-colors duration-150",
              overTrash
                ? "border-rose-400/70 bg-rose-500/25 text-rose-50 scale-110"
                : "border-white/15 bg-zinc-950/80 text-white/60",
            )}
          >
            <Trash2 className={cn("w-4 h-4", overTrash && "animate-pulse")} />
            <span className="text-xs font-medium">
              {overTrash ? "Suelta para quitar el orbe" : "Arrastra aquí para quitar el orbe"}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════════
          ORBE UNIFICADO Aurora + Trinidad (esfera + estrella de 4 puntas)
          ------------------------------------------------------------------
          · Movible por toda la pantalla (persistido), presente en TODAS las
            rutas y tamaños.
          · TAP → activa la voz de Aurora.
          · MANTENER PULSADO → despliega los 4 menús Trinidad alrededor; ARRASTRAR
            hacia una punta y soltar → abre ese menú (drag-to-open).
          · Clic derecho / long-press del panel → abre el chat completo.
          · El núcleo es una esfera reactiva a la voz (color/luz/forma).
      ══════════════════════════════════════════════════════════════════ */}
      <div
        ref={orbWrapRef}
        className="fixed z-50 select-none"
        style={orbStyle}
      >
        <div className="relative flex items-center justify-center" style={{ width: ORB_PX, height: ORB_PX }}>
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

          {/* Pétalos cardinales Trinity (estrella de 4 puntas por color). */}
          <AnimatePresence>
            {trinityOpen &&
              TRINITY_NODES.map((n, i) => {
                const isActive = activeEdge === n.edge;
                const aimed = aimDir === n.dir;
                return (
                  <motion.button
                    key={n.edge}
                    type="button"
                    title={`${n.label} · ${n.sub}`}
                    aria-label={`${n.label} · ${n.sub}`}
                    onClick={() => toggleEdge(n.edge)}
                    initial={{ opacity: 0, scale: 0.3, x: 0, y: 0 }}
                    animate={{ opacity: 1, scale: aimed ? 1.18 : 1, x: n.x, y: n.y }}
                    exit={{ opacity: 0, scale: 0.3, x: 0, y: 0 }}
                    transition={{ type: "spring", stiffness: 420, damping: 24, delay: i * 0.04 }}
                    className={cn(
                      "absolute z-20 grid h-12 w-12 place-items-center rounded-full cursor-pointer",
                      "border backdrop-blur-xl transition-shadow duration-200",
                      (isActive || aimed) ? "ring-2 ring-white/50" : "ring-0",
                    )}
                    style={{
                      color: n.color,
                      borderColor: `color-mix(in srgb, ${n.color} 55%, transparent)`,
                      // Cristal glass del Café: highlight superior + tinte cardinal.
                      background: `radial-gradient(120% 95% at 30% 18%, rgba(255,255,255,0.26), transparent 55%), color-mix(in srgb, ${n.color} ${aimed ? 46 : isActive ? 30 : 16}%, rgba(8,12,18,0.66))`,
                      boxShadow: (isActive || aimed)
                        ? `inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -8px 14px rgba(0,0,0,0.3), 0 10px 24px rgba(0,0,0,0.45), 0 0 26px color-mix(in srgb, ${n.color} 75%, transparent)`
                        : `inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -8px 14px rgba(0,0,0,0.3), 0 8px 20px rgba(0,0,0,0.4), 0 0 14px color-mix(in srgb, ${n.color} 35%, transparent)`,
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
                    {/* Etiqueta bajo el pétalo (Zenith/Anchor/Horizon/Logic). */}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-full border px-2 py-[3px] font-mono text-[8px] uppercase tracking-[0.16em] backdrop-blur-md transition-all duration-200"
                      style={{
                        borderColor: `color-mix(in srgb, ${n.color} ${aimed || isActive ? 70 : 40}%, transparent)`,
                        background: "rgba(8,12,18,0.72)",
                        color: aimed || isActive ? "#ffffff" : "rgba(255,255,255,0.72)",
                        boxShadow: aimed
                          ? `0 0 12px color-mix(in srgb, ${n.color} 65%, transparent)`
                          : "0 4px 10px rgba(0,0,0,0.35)",
                      }}
                    >
                      {n.label}
                    </span>
                  </motion.button>
                );
              })}
          </AnimatePresence>

          {/* Satélite «Trinidad»: abre/cierra los pétalos cardinales. */}
          <button
            type="button"
            data-aurora-trinity-toggle
            onClick={() => { setOpen(false); setTrinityOpen((v) => !v); }}
            aria-expanded={trinityOpen}
            aria-label={trinityOpen ? "Cerrar menú Trinidad" : "Abrir menú Trinidad"}
            title="Trinidad · Zenith · Horizon · Logic · Anchor"
            className={cn(
              "absolute -top-1 -left-1 z-30 grid h-7 w-7 place-items-center rounded-full cursor-pointer",
              "border border-white/20 backdrop-blur-md shadow-lg",
              "transition-transform duration-200 hover:scale-110 active:scale-95",
              (trinityOpen || !!activeEdge) && "ring-2 ring-white/30",
            )}
            style={{
              // Mismo cristal oscuro del orbe, con highlight especular.
              background:
                "radial-gradient(circle at 32% 26%, rgba(255,255,255,0.16), transparent 46%), rgba(9,13,20,0.85)",
              boxShadow:
                "inset 0 1px 0 rgba(255,255,255,0.18), 0 4px 12px rgba(0,0,0,0.45)",
            }}
          >
            {/* Mini-estrella ✦ de 4 gemas: mismo lenguaje que la estrella del orbe. */}
            <motion.svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              aria-hidden
              animate={{ rotate: trinityOpen ? 45 : 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              style={{ filter: "drop-shadow(0 0 2px rgba(255,255,255,0.45))" }}
            >
              <path d="M12 12 C10.9 8.8 11 5.8 12 2.4 C13 5.8 13.1 8.8 12 12 Z" fill="#007FFF" />
              <path d="M12 12 C13.1 15.2 13 18.2 12 21.6 C11 18.2 10.9 15.2 12 12 Z" fill="#DC143C" />
              <path d="M12 12 C8.8 13.1 5.8 13 2.4 12 C5.8 11 8.8 10.9 12 12 Z" fill="#39FF14" />
              <path d="M12 12 C15.2 10.9 18.2 11 21.6 12 C18.2 13 15.2 13.1 12 12 Z" fill="#FFBF00" />
              <circle cx="12" cy="12" r="1.7" fill="#FFFFFF" />
            </motion.svg>
          </button>

          {/* NÚCLEO: esfera reactiva a la voz con estrella de 4 puntas.
              Conserva aria-label="Aurora" + data-aurora-state + onContextMenu
              (necesarios para open-aurora / AuroraMemoryPanel). */}
          <button
            type="button"
            onPointerDown={onOrbPointerDown}
            onPointerMove={onOrbPointerMove}
            onPointerUp={finishGesture}
            onPointerCancel={cancelGesture}
            onContextMenu={(e) => { e.preventDefault(); setTab("chat"); setOpen((o) => !o); }}
            aria-label="Aurora"
            data-aurora-state={state}
            title={!supported
              ? "Tu navegador no soporta voz · toca para opciones"
              : speaking
                ? "Hablando… (toca para interrumpir) · mantén pulsado para los menús · arrástrame para moverme"
                : listening
                  ? "Escuchando… (toca para parar) · mantén pulsado para los menús · arrástrame para moverme"
                  : "Hablar con Aurora (toca) · mantén pulsado para los 4 menús · clic derecho para el chat"}
            className={cn(
              "relative rounded-full flex items-center justify-center touch-none cursor-pointer",
              "transition-transform active:scale-95",
              moving && "scale-110",
              !supported && "opacity-60",
            )}
            style={{ width: ORB_PX, height: ORB_PX }}
          >
            <AuroraOrb
              size={ORB_PX}
              speaking={speaking}
              listening={listening}
              paused={paused}
              supported={supported}
            />
            {/* Indicador de "Aurora activa" (LED verde), como antes. */}
            {enabled && (
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 border-2 border-zinc-950" />
            )}
          </button>
        </div>
      </div>
    </>
  );
}

export default AuroraWidget;
