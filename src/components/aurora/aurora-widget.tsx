"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, X, Play, Pause, SkipForward, SkipBack, Square, Wand2,
  MessageSquare, EyeOff, Trash2, MicOff, Layout, LayoutGrid, Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAurora } from "./aurora-provider";
import { usePerimeter, type PerimeterEdge } from "@/context/perimeter-context";
import { AURORA_TRINITY_FLAG, AURORA_TRINITY_EVENT } from "@/components/layout/trinity-fab";
import { AuroraOrb } from "./aurora-orb";
import { AuroraSpeechBubble, type AuroraBubbleAnchor } from "./aurora-speech-bubble";
import {
  readOrbHidden,
  setOrbHidden as setOrbHiddenBus,
  subscribeOrbVisibility,
  readOrbPosition,
  writeOrbPosition,
  DEFAULT_ORB_POSITION,
  AURORA_EXOCORTEX_OPEN_EVENT,
  type AuroraOrbPosition,
} from "@/lib/aurora/aurora-orb-bus";

/**
 * AuroraWidget — el ORBE de Aurora (montado en el layout RAÍZ: presente en
 * TODAS las rutas, incluidas login/onboarding; defensivo sin sesión).
 *
 * Gestos del orbe (SOLO redondo, sin satélites):
 *   · TAP            → activar/parar la voz (o reintentar si quedó no disponible).
 *   · MANTENER       → MENÚ TRINITY CENTRADO en pantalla (backdrop cristalino):
 *     PULSADO          orbe grande al centro y las 4 opciones en cruz; SIN
 *                      SOLTAR, deslizar hacia una opción la resalta y al SOLTAR
 *                      se abre (usePerimeter().setActiveEdge). Soltar al centro
 *                      deja el menú abierto para tocar. Fuera/Escape cierra.
 *   · ARRASTRAR      → mover el orbe (persistido); zona superior = ocultarlo.
 *   · CLIC DERECHO   → abre el chat completo en el EXOCÓRTEX (cortina Zenith +
 *                      CustomEvent 'starseed:open-aurora-exocortex').
 *
 * Mini-popover anclado al orbe (aparece con la voz, descartable): estado +
 * transporte de voz + últimas 2 líneas + «Abrir chat en Exocórtex» / «Ocultar
 * orbe». El estado visual lleva DEBOUNCE ≥250ms: sin parpadeos on/off aunque
 * el reconocimiento reinicie por dentro.
 */

/**
 * Nodos cardinales Trinity del menú centrado. Mapa de la ESTRELLA del orbe:
 *   · arriba    = azul     → Zenith  (Guía IA · Exocórtex)
 *   · abajo     = rojo     → Anchor  (Dock)
 *   · izquierda = verde    → Horizon (Creación)
 *   · derecha   = amarillo → Logic   (Control)
 */
type Cardinal = "up" | "down" | "left" | "right";

const TRINITY_NODES: Array<{
  edge: Exclude<PerimeterEdge, null>;
  dir: Cardinal;
  label: string;
  sub: string;
  color: string;
  Icon: ComponentType<{ className?: string }>;
  dx: number; // vector unitario del cardinal
  dy: number;
}> = [
  { edge: "zenith",  dir: "up",    label: "Zenith",  sub: "Guía IA · Exocórtex", color: "#007FFF", Icon: Sparkles,   dx: 0,  dy: -1 },
  { edge: "anchor",  dir: "down",  label: "Anchor",  sub: "Dock",                color: "#DC143C", Icon: LayoutGrid, dx: 0,  dy: 1 },
  { edge: "horizon", dir: "left",  label: "Horizon", sub: "Creación",            color: "#39FF14", Icon: Layout,     dx: -1, dy: 0 },
  { edge: "logic",   dir: "right", label: "Logic",   sub: "Control",             color: "#FFBF00", Icon: Settings2,  dx: 1,  dy: 0 },
];

const ORB_PX = 60;                 // diámetro del orbe flotante
const TRINITY_ORB_PX = 108;        // orbe grande del menú centrado
const LONG_PRESS_MS = 480;         // umbral de pulsación prolongada
const DRAG_SLOP = 8;               // px antes de considerar arrastre
/**
 * Deslizar-para-abrir con HISTÉRESIS: hace falta pasar de DRAG_TO_OPEN_IN (~40px)
 * para ENGANCHAR una dirección, y caer por debajo de DRAG_TO_OPEN_OUT para
 * soltarla. Evita el parpadeo de resaltado cerca del umbral.
 */
const DRAG_TO_OPEN_IN = 40;        // px para enganchar una opción
const DRAG_TO_OPEN_OUT = 26;       // px para soltarla (histéresis)
/** Debounce del estado VISUAL (≥250ms): el apagado espera; nunca parpadea. */
const VISUAL_FALL_MS = 320;

/**
 * Flag booleano estabilizado para la luz del orbe: ENCIENDE al instante y solo
 * APAGA tras VISUAL_FALL_MS de calma. Los ciclos on/off rápidos del
 * reconocimiento (reinicios internos) se funden en un encendido continuo.
 */
function useStableFlag(value: boolean, fallMs: number = VISUAL_FALL_MS): boolean {
  const [stable, setStable] = useState(value);
  useEffect(() => {
    if (value) { setStable(true); return; }
    const t = setTimeout(() => setStable(false), fallMs);
    return () => clearTimeout(t);
  }, [value, fallMs]);
  return stable;
}

export function AuroraWidget() {
  const aurora = useAurora();
  const { activeEdge, setActiveEdge } = usePerimeter();

  // Mini-popover anclado al orbe.
  const [open, setOpen] = useState(false);
  // Menú Trinity CENTRADO en pantalla.
  const [trinityOpen, setTrinityOpen] = useState(false);
  // Opción cardinal resaltada durante el deslizar-para-abrir.
  const [aimDir, setAimDir] = useState<Cardinal | null>(null);
  // Distancia del centro a cada opción (se calcula al abrir, por viewport).
  const [crossDist, setCrossDist] = useState(128);

  // Visibilidad del orbe (arrastrable a la zona de descarte → se oculta;
  // se reactiva desde el Exocórtex). SSR-safe: arranca visible.
  const [hidden, setHidden] = useState(false);
  const [moving, setMoving] = useState(false);
  const [overTrash, setOverTrash] = useState(false);

  // Posición del orbe como fracción del viewport (movible + persistida).
  const [pos, setPos] = useState<AuroraOrbPosition>(DEFAULT_ORB_POSITION);

  // Píldora de estado de acción: descartable; reaparece con cada acción nueva.
  const [pillDismissed, setPillDismissed] = useState(false);
  const actionStatusLive = aurora?.actionStatus;
  useEffect(() => { setPillDismissed(false); }, [actionStatusLive]);

  // ── Gestos del orbe (puntero unificado ratón/táctil) ──
  const gesture = useRef<{
    id: number;
    startX: number;
    startY: number;
    longTimer: ReturnType<typeof setTimeout> | null;
    longFired: boolean;   // menú Trinity abierto en modo deslizar-para-abrir
    moved: boolean;       // superó el slop → arrastre de reposición
    aim: Cardinal | null; // dirección enganchada (con histéresis) al deslizar
    target: HTMLElement | null; // elemento con el pointer capture (para liberar)
  } | null>(null);

  // ¿Hay un deslizar-para-abrir EN CURSO? El overlay del menú Trinity se vuelve
  // pasivo (pointer-events:none) para que jamás robe la captura del orbe.
  const [draggingOpen, setDraggingOpen] = useState(false);

  // ── Sincronización de posición/visibilidad con localStorage + bus ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    setHidden(readOrbHidden());
    setPos(readOrbPosition());
    const unsub = subscribeOrbVisibility((h) => setHidden(h));
    return unsub;
  }, []);

  // Escape cierra popover y menú Trinity.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); setTrinityOpen(false); setAimDir(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Señaliza globalmente que el Orbe unificado Aurora + Trinidad está montado
  // (compatibilidad: otras superficies pueden leer el flag). El FAB clásico ya
  // cede SIEMPRE por defecto; esto queda como señal informativa.
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

  // El popover y el menú Trinity no conviven (una superficie a la vez).
  useEffect(() => { if (open) setTrinityOpen(false); }, [open]);
  useEffect(() => { if (trinityOpen) setOpen(false); }, [trinityOpen]);

  // ── Chat completo → EXOCÓRTEX (cortina Zenith) ──
  const openExocortexChat = useCallback(() => {
    setOpen(false);
    setTrinityOpen(false);
    try { setActiveEdge("zenith"); } catch { /* */ }
    try { window.dispatchEvent(new CustomEvent(AURORA_EXOCORTEX_OPEN_EVENT)); } catch { /* */ }
  }, [setActiveEdge]);

  // Traduce el delta del deslizamiento a una opción cardinal, con HISTÉRESIS:
  // si ya había una dirección enganchada (`prev`), se mantiene mientras no se
  // caiga por debajo de DRAG_TO_OPEN_OUT; para enganchar una nueva hace falta
  // superar DRAG_TO_OPEN_IN. El eje dominante decide arriba/abajo vs izq/der.
  const dirFromDelta = useCallback((dx: number, dy: number, prev: Cardinal | null): Cardinal | null => {
    const dist = Math.hypot(dx, dy);
    const axisDir: Cardinal = Math.abs(dx) > Math.abs(dy)
      ? (dx < 0 ? "left" : "right")
      : (dy < 0 ? "up" : "down");
    if (prev) {
      // Con dirección ya enganchada: soltar solo si se relaja mucho el gesto.
      if (dist < DRAG_TO_OPEN_OUT) return null;
      return axisDir; // permite re-apuntar a otro cardinal sin volver al centro
    }
    // Sin enganche previo: hace falta superar el umbral de entrada.
    if (dist < DRAG_TO_OPEN_IN) return null;
    return axisDir;
  }, []);

  // ── Puntero: tap = voz · mantener = menú centrado · arrastre = mover ──
  const onOrbPointerDown = useCallback((e: React.PointerEvent) => {
    if (gesture.current) return;
    const target = e.currentTarget as HTMLElement;
    // El MISMO pointer capture del long-press: todos los pointermove/up de este
    // puntero llegan al orbe aunque el overlay del menú se monte encima.
    try { target.setPointerCapture?.(e.pointerId); } catch { /* */ }
    const g = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      longTimer: null as ReturnType<typeof setTimeout> | null,
      longFired: false,
      moved: false,
      aim: null as Cardinal | null,
      target,
    };
    gesture.current = g;

    // Pulsación prolongada → MENÚ TRINITY CENTRADO + modo deslizar-para-abrir.
    g.longTimer = setTimeout(() => {
      if (!gesture.current || gesture.current.id !== e.pointerId) return;
      if (gesture.current.moved) return; // si ya arrastra para mover, no abre
      gesture.current.longFired = true;
      if (typeof window !== "undefined") {
        const vmin = Math.min(window.innerWidth, window.innerHeight);
        setCrossDist(Math.round(Math.max(104, Math.min(168, vmin * 0.3))));
        try { navigator?.vibrate?.(12); } catch { /* */ }
      }
      setOpen(false);
      setAimDir(null);
      // Deslizar-para-abrir armado: neutraliza el overlay para no perder captura.
      setDraggingOpen(true);
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
      // Deslizar-para-abrir (histéresis): resalta la opción hacia la que se
      // apunta. Guardamos la dirección enganchada en el gesto para que el mismo
      // valor se use al SOLTAR (no depende de un re-render de estado).
      const next = dirFromDelta(dx, dy, g.aim);
      if (next !== g.aim) {
        g.aim = next;
        setAimDir(next);
        if (next) { try { navigator?.vibrate?.(8); } catch { /* */ } }
      }
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
    try { g.target?.releasePointerCapture?.(e.pointerId); } catch { /* */ }
    gesture.current = null;

    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;

    if (g.longFired) {
      // Deslizó hacia una opción y SOLTÓ → se abre ese menú cardinal. Usamos la
      // dirección ENGANCHADA en el gesto (histéresis), no el delta crudo.
      const dir = g.aim ?? dirFromDelta(dx, dy, null);
      setAimDir(null);
      setDraggingOpen(false);
      if (dir) {
        const node = TRINITY_NODES.find((n) => n.dir === dir);
        if (node) {
          setActiveEdge(node.edge);
          setTrinityOpen(false);
          return;
        }
      }
      // Soltó al centro: el menú queda abierto para tocar una opción.
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

    // TAP simple → voz de Aurora (activar/parar/interrumpir · reintentar).
    if (!aurora) return;
    if (!aurora.supported) { setOpen((o) => !o); return; }
    if (aurora.voiceUnavailable) {
      // Estado visible «voz no disponible» → el toque REINTENTA (con backoff).
      aurora.retryVoice();
      setOpen(true);
      return;
    }
    aurora.toggle();
  }, [aurora, dirFromDelta, overTrash, setActiveEdge]);

  const cancelGesture = useCallback((e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    if (g.longTimer) { clearTimeout(g.longTimer); g.longTimer = null; }
    try { g.target?.releasePointerCapture?.(e.pointerId); } catch { /* */ }
    gesture.current = null;
    setMoving(false);
    setOverTrash(false);
    setAimDir(null);
    setDraggingOpen(false);
  }, []);

  // ── Estado VISUAL estabilizado (debounce ≥250ms: sin parpadeo on/off) ──
  const rawListening = !!aurora?.listening;
  const rawSpeaking = !!aurora?.speaking;
  const visListening = useStableFlag(rawListening);
  const visSpeaking = useStableFlag(rawSpeaking);

  // Sesión de voz activa: el GLOBO DE DIÁLOGO sobre el orbe es ahora la
  // superficie conversacional (habla / escucha / sugerencias). El mini-popover
  // completo YA NO se auto-abre con la voz — queda disponible bajo demanda
  // (voz no disponible al tocar, o desde el propio globo → «Abrir chat»).
  const voiceActive = visListening || visSpeaking;
  const hudDismissedRef = useRef(false);

  if (!aurora) return null;

  const {
    supported, enabled, paused, interim, actionStatus,
    pauseSpeech, resumeSpeech, skipForward, skipBack, interrupt,
    conversation, voiceUnavailable,
  } = aurora;

  const state = !supported
    ? "off"
    : voiceUnavailable
      ? "unavailable"
      : visSpeaking
        ? "speaking"
        : visListening
          ? "listening"
          : "idle";

  const stateLabel = !supported
    ? "Sin soporte de voz en este navegador"
    : voiceUnavailable
      ? "Voz no disponible · toca el orbe para reintentar"
      : visSpeaking
        ? (paused ? "En pausa" : "Hablando…")
        : visListening
          ? "Escuchando…"
          : "En reposo · toca el orbe para hablar";

  const stateDot = voiceUnavailable
    ? "bg-rose-400"
    : visSpeaking
      ? "bg-fuchsia-400"
      : visListening
        ? "bg-cyan-400"
        : "bg-white/30";

  // Posición absoluta del orbe (fracción → px), presente en TODAS las rutas.
  // dvh: viewport dinámico (respeta teclado/barras móviles), como el Café.
  const orbStyle: React.CSSProperties = {
    left: `calc(${(pos.xRatio * 100).toFixed(3)}vw - ${ORB_PX / 2}px)`,
    top: `calc(${(pos.yRatio * 100).toFixed(3)}dvh - ${ORB_PX / 2}px)`,
  };

  // ── Anclaje del popover y de la píldora AL ORBE ───────────────────────────
  const openUp = pos.yRatio >= 0.5;
  const openLeft = pos.xRatio >= 0.5;
  const ANCHOR_GAP = ORB_PX / 2 + 14;
  const vAnchor: React.CSSProperties = openUp
    ? { bottom: `calc(${((1 - pos.yRatio) * 100).toFixed(3)}dvh + ${ANCHOR_GAP}px)` }
    : { top: `calc(${(pos.yRatio * 100).toFixed(3)}dvh + ${ANCHOR_GAP}px)` };
  const hAnchor = (maxW: string): React.CSSProperties => (openLeft
    ? { right: `clamp(8px, calc(${((1 - pos.xRatio) * 100).toFixed(3)}vw - ${ORB_PX / 2}px), calc(100vw - ${maxW} - 8px))` }
    : { left: `clamp(8px, calc(${(pos.xRatio * 100).toFixed(3)}vw - ${ORB_PX / 2}px), calc(100vw - ${maxW} - 8px))` });
  const PANEL_W = "min(19rem, calc(100vw - 16px))";
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

  // ── Anclaje del GLOBO DE DIÁLOGO al orbe (se voltea arriba/abajo y clampa a
  //    los bordes en cualquier tamaño; el ancho lo pone el CSS del globo). ────
  const BUBBLE_MAX_W = "min(21rem, calc(100vw - 16px))";
  const bubbleAnchor: AuroraBubbleAnchor = {
    style: {
      ...vAnchor,
      ...hAnchor(BUBBLE_MAX_W),
    },
    openUp,
    openLeft,
  };
  // Aurora está "siendo mencionada" cuando se le está hablando (escucha activa
  // con transcripción parcial) → el globo aparece también en ese caso.
  const bubbleMentioned = visListening || !!interim;

  // Últimas 2 líneas de la conversación (usuario y Aurora, voz o texto).
  const lastLines = conversation.slice(-2);

  // Controles de transporte de voz (compactos, dentro del popover).
  const Transport = () => (
    <div className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-2 py-1.5">
      <button
        onClick={() => skipBack()}
        title="Retroceder (respuesta anterior)"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition cursor-pointer"
      >
        <SkipBack className="w-4 h-4" />
      </button>
      {paused ? (
        <button
          onClick={() => resumeSpeech()}
          title="Reproducir"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30 transition cursor-pointer"
        >
          <Play className="w-4 h-4" />
        </button>
      ) : (
        <button
          onClick={() => pauseSpeech()}
          title="Pausar"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30 transition cursor-pointer"
        >
          <Pause className="w-4 h-4" />
        </button>
      )}
      <button
        onClick={() => interrupt()}
        title="Interrumpir"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-rose-500/20 hover:text-rose-200 transition cursor-pointer"
      >
        <Square className="w-4 h-4" />
      </button>
      <button
        onClick={() => skipForward()}
        title="Adelantar (respuesta siguiente)"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition cursor-pointer"
      >
        <SkipForward className="w-4 h-4" />
      </button>
    </div>
  );

  // Si el orbe está oculto, no renderizamos NADA flotante.
  // La reactivación vive en el Exocórtex → sección "Chat de Aurora".
  if (hidden) return null;

  return (
    <>
      {/* ══════════════════════════════════════════════════════════════════
          GLOBO DE DIÁLOGO cristalino sobre el orbe — superficie conversacional
          principal: aparece cuando Aurora es mencionada, habla/responde, o
          ofrece una recomendación/notificación proactiva (texto sin voz). La voz
          solo suena a petición (hablar/▶); el chat completo sigue accesible.
      ══════════════════════════════════════════════════════════════════ */}
      {!trinityOpen && (
        <AuroraSpeechBubble
          anchor={bubbleAnchor}
          mentioned={bubbleMentioned}
          onOpenChat={openExocortexChat}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MINI-POPOVER anclado al orbe: estado + transporte + últimas 2 líneas
          + «Abrir chat en Exocórtex» / «Ocultar orbe». El chat completo vive
          en el Exocórtex (Zenith).
      ══════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {open && !trinityOpen && (
          <motion.div
            initial={{ opacity: 0, y: openUp ? 10 : -10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: openUp ? 10 : -10, scale: 0.92 }}
            transition={{ type: "spring", stiffness: 340, damping: 30 }}
            className="fixed z-[60] flex w-[19rem] max-w-[calc(100vw-16px)] select-none flex-col overflow-hidden rounded-[22px] border border-white/10 shadow-2xl shadow-black/50 backdrop-blur-2xl"
            style={panelStyle}
          >
            {/* Filo aurora superior (lenguaje del Café). */}
            <div
              aria-hidden
              className="h-[2px] w-full shrink-0 bg-gradient-to-r from-[#9FE870] via-[#6FE6D6] to-[#C9A8FF] opacity-80 shadow-[0_0_14px_rgba(111,230,214,0.55)]"
            />
            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3.5">
              {/* Estado */}
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-fuchsia-500 to-cyan-500 flex items-center justify-center shrink-0">
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-white leading-tight">Aurora</div>
                  <div className="flex items-center gap-1.5 text-[10px] text-white/50">
                    <span className={cn("h-1.5 w-1.5 rounded-full", stateDot, (visListening || visSpeaking) && "animate-pulse")} />
                    <span className={cn(voiceUnavailable && "text-rose-200/90")}>{stateLabel}</span>
                  </div>
                </div>
                <button
                  onClick={() => { hudDismissedRef.current = voiceActive; setOpen(false); }}
                  aria-label="Cerrar"
                  className="text-white/40 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Transporte de voz */}
              <Transport />

              {/* Últimas 2 líneas de la conversación */}
              {(lastLines.length > 0 || interim) && (
                <div className="space-y-1.5">
                  {lastLines.map((m, i) => (
                    <div
                      key={`${m.at}-${i}`}
                      className={cn(
                        "rounded-xl border px-2.5 py-1.5 text-[11px] leading-relaxed line-clamp-2",
                        m.role === "user"
                          ? "border-cyan-400/20 bg-cyan-500/10 text-cyan-50"
                          : "border-fuchsia-500/20 bg-fuchsia-950/40 text-fuchsia-50/90",
                      )}
                    >
                      <span className={cn(
                        "mr-1.5 font-mono text-[8px] uppercase tracking-widest",
                        m.role === "user" ? "text-cyan-300/60" : "text-fuchsia-300/60",
                      )}>
                        {m.role === "user" ? "Tú" : "Aurora"}
                      </span>
                      {m.text}
                    </div>
                  ))}
                  {interim && (
                    <div className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] italic text-white/50 line-clamp-2">
                      {interim}
                    </div>
                  )}
                </div>
              )}

              {/* Acciones */}
              <div className="flex items-center gap-2">
                <button
                  onClick={openExocortexChat}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1.5 text-[11px] text-cyan-100 hover:bg-cyan-500/20 transition cursor-pointer"
                  title="Abrir el chat completo de Aurora en el Exocórtex (Zenith)"
                >
                  <MessageSquare className="w-3.5 h-3.5" /> Abrir chat en Exocórtex
                </button>
                <button
                  onClick={() => { setOpen(false); setOrbHiddenBus(true); }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-white/55 hover:bg-white/10 hover:text-white/80 transition cursor-pointer"
                  title="Quitar el orbe de la pantalla. Podrás reactivarlo desde el Exocórtex."
                >
                  <EyeOff className="w-3.5 h-3.5" /> Ocultar orbe
                </button>
              </div>

              {!supported && (
                <div className="text-[10px] text-amber-300/70 text-center">
                  Tu navegador no soporta voz. Abre el chat en el Exocórtex para escribirle.
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Píldora de acción flotante ANCLADA al orbe, visible aunque el popover
          esté cerrado; descartable. */}
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
          MENÚ TRINITY CENTRADO — overlay cristalino a pantalla completa:
          orbe/estrella grande al centro y las 4 opciones en cruz. Sin soltar,
          DESLIZAR resalta (glow líquido + crecimiento); SOLTAR abre. Soltar al
          centro deja el menú abierto para tocar. Fuera / Escape cierran.
      ══════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {trinityOpen && (
          <motion.div
            key="trinity-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className={cn("fixed inset-0 z-[80]", draggingOpen && "pointer-events-none")}
          >
            {/* Backdrop cristalino (toca fuera para cerrar). Mientras el
                deslizar-para-abrir está EN CURSO se vuelve pasivo: así no roba
                la captura del orbe y el gesto continúo funciona en móvil y ratón. */}
            <button
              type="button"
              aria-label="Cerrar menú Trinity"
              onClick={() => setTrinityOpen(false)}
              className={cn(
                "absolute inset-0 h-full w-full cursor-default backdrop-blur-2xl",
                draggingOpen && "pointer-events-none",
              )}
              style={{
                background:
                  "radial-gradient(120% 120% at 50% 50%, rgba(8,12,20,0.36) 0%, rgba(4,7,13,0.68) 100%)",
              }}
            />

            {/* Orbe grande central (soltar aquí deja el menú abierto). */}
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <motion.div
                initial={{ scale: 0.55, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.7, opacity: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 22 }}
              >
                <div className="relative" style={{ width: TRINITY_ORB_PX, height: TRINITY_ORB_PX }}>
                  <AuroraOrb
                    size={TRINITY_ORB_PX}
                    speaking={visSpeaking}
                    listening={visListening}
                    paused={paused}
                    supported={supported}
                    unavailable={voiceUnavailable}
                  />
                </div>
              </motion.div>
            </div>

            {/* Las 4 opciones en cruz (nombre + subtítulo). */}
            {TRINITY_NODES.map((n, i) => {
              const aimed = aimDir === n.dir;
              const isActive = activeEdge === n.edge;
              const dist = n.dy !== 0 ? Math.round(crossDist * 1.24) : crossDist;
              return (
                <motion.button
                  key={n.edge}
                  type="button"
                  title={`${n.label} · ${n.sub}`}
                  aria-label={`${n.label} · ${n.sub}`}
                  onClick={() => {
                    setActiveEdge(activeEdge === n.edge ? null : n.edge);
                    setTrinityOpen(false);
                  }}
                  initial={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
                  animate={{
                    opacity: 1,
                    x: n.dx * dist,
                    y: n.dy * dist,
                    scale: aimed ? 1.16 : 1,
                  }}
                  exit={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
                  transition={{ type: "spring", stiffness: 380, damping: 26, delay: i * 0.03 }}
                  transformTemplate={(_t, generated) => `translate(-50%, -50%) ${generated}`}
                  className={cn(
                    "absolute left-1/2 top-1/2 z-10 flex cursor-pointer flex-col items-center gap-1.5",
                    // Durante el deslizar-para-abrir las opciones no capturan el
                    // puntero (la captura vive en el orbe); al soltar en el centro
                    // vuelven a ser tocables.
                    draggingOpen && "pointer-events-none",
                  )}
                >
                  <span
                    className="grid h-16 w-16 place-items-center rounded-full border backdrop-blur-xl transition-shadow duration-200"
                    style={{
                      color: n.color,
                      borderColor: `color-mix(in srgb, ${n.color} ${aimed || isActive ? 75 : 50}%, transparent)`,
                      // Cristal glass: highlight superior + tinte cardinal (glow líquido al apuntar).
                      background: `radial-gradient(120% 95% at 30% 18%, rgba(255,255,255,0.26), transparent 55%), color-mix(in srgb, ${n.color} ${aimed ? 46 : isActive ? 30 : 16}%, rgba(8,12,18,0.7))`,
                      boxShadow: (aimed || isActive)
                        ? `inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -8px 14px rgba(0,0,0,0.3), 0 10px 26px rgba(0,0,0,0.5), 0 0 34px color-mix(in srgb, ${n.color} 80%, transparent)`
                        : `inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -8px 14px rgba(0,0,0,0.3), 0 8px 20px rgba(0,0,0,0.45), 0 0 16px color-mix(in srgb, ${n.color} 38%, transparent)`,
                    }}
                  >
                    <n.Icon className="h-6 w-6" />
                  </span>
                  <span
                    className="text-[13px] font-semibold tracking-wide"
                    style={{
                      color: aimed || isActive ? "#ffffff" : "rgba(255,255,255,0.85)",
                      textShadow: `0 0 14px color-mix(in srgb, ${n.color} ${aimed ? 90 : 45}%, transparent)`,
                    }}
                  >
                    {n.label}
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/55">
                    {n.sub}
                  </span>
                  {isActive && (
                    <span
                      aria-hidden
                      className="absolute -top-1 right-2 h-2 w-2 animate-pulse rounded-full"
                      style={{ background: n.color, boxShadow: `0 0 8px ${n.color}` }}
                    />
                  )}
                </motion.button>
              );
            })}

            {/* Pista de uso. */}
            <div className="pointer-events-none absolute bottom-[max(20px,env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
              Desliza y suelta · o toca una opción
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════════
          ORBE — esfera de cristal 3D, SOLO redonda (sin satélites).
          Conserva aria-label="Aurora" + data-aurora-state + onContextMenu
          (contratos de open-aurora / AuroraMemoryPanel).
      ══════════════════════════════════════════════════════════════════ */}
      <div className="fixed z-50 select-none" style={orbStyle}>
        <div className="relative flex items-center justify-center" style={{ width: ORB_PX, height: ORB_PX }}>
          <button
            type="button"
            onPointerDown={onOrbPointerDown}
            onPointerMove={onOrbPointerMove}
            onPointerUp={finishGesture}
            onPointerCancel={cancelGesture}
            onContextMenu={(e) => { e.preventDefault(); openExocortexChat(); }}
            aria-label="Aurora"
            data-aurora-state={state}
            title={!supported
              ? "Tu navegador no soporta voz · toca para opciones · clic derecho abre el chat en el Exocórtex"
              : voiceUnavailable
                ? "Voz no disponible · toca para reintentar · mantén pulsado para el menú Trinity"
                : visSpeaking
                  ? "Hablando… (toca para interrumpir) · mantén pulsado para el menú Trinity · arrástrame para moverme"
                  : visListening
                    ? "Escuchando… (toca para parar) · mantén pulsado para el menú Trinity · arrástrame para moverme"
                    : "Hablar con Aurora (toca) · mantén pulsado para el menú Trinity · clic derecho abre el chat en el Exocórtex"}
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
              speaking={visSpeaking}
              listening={visListening}
              paused={paused}
              supported={supported}
              unavailable={voiceUnavailable}
            />
            {/* Indicador de "Aurora activa" (LED verde). */}
            {enabled && !voiceUnavailable && (
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 border-2 border-zinc-950" />
            )}
            {/* Estado visible: voz no disponible → insignia carmesí (reintenta al tocar). */}
            {voiceUnavailable && (
              <span
                className="absolute -bottom-1 -right-1 grid h-4.5 w-4.5 place-items-center rounded-full border border-rose-300/60 bg-rose-600/90 shadow-[0_0_10px_rgba(220,20,60,0.6)]"
                style={{ width: 18, height: 18 }}
                title="Voz no disponible · toca el orbe para reintentar"
              >
                <MicOff className="h-2.5 w-2.5 text-white" />
              </span>
            )}
          </button>
        </div>
      </div>
    </>
  );
}

export default AuroraWidget;
