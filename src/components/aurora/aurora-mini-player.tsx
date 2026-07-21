"use client";

/**
 * AuroraMiniPlayer — REPRODUCTOR RESUMIDO de la conversación de Aurora.
 * ============================================================================
 * Widget PEQUEÑO, translúcido (Crystal Liquid Glass) que aparece JUNTO al orbe
 * en cuanto ARRANCA una conversación (el usuario habla → hay `interim`, o Aurora
 * responde → `speaking`/`lastReply`). NO es el popover grande; es un mini-panel
 * no intrusivo pensado para el Sistema Operativo: te acompaña sin estorbar.
 *
 * QUÉ HACE (petición del usuario):
 *   · Muestra las últimas 1-2 líneas (Tú / Aurora) en modo resumido.
 *   · Controles de reproducción AMPLIADOS: play/pausa, parar, respuesta
 *     anterior/siguiente y micrófono on/off.
 *   · Se DESLIZA (arrastrar hacia arriba, o el asa ⌃) para EXPANDIR y ver el
 *     HISTORIAL de la sesión con scroll interno CONTENIDO dentro del widget.
 *   · ILUMINACIÓN reactiva a la voz — del usuario (escucha/interim) Y de Aurora
 *     (habla): un filo/aura de luz que respira con quien tiene el turno.
 *   · Botón «Abrir en Exocórtex» → CustomEvent 'starseed:open-aurora-exocortex'
 *     (la ventana COMPLETA de Aurora vive en el Exocórtex).
 *   · Botón «expandir» → abre el popover grande clásico (pestañas) bajo demanda.
 *   · Se AUTO-OCULTA tras ~10s sin actividad; descartable con la X.
 *
 * UN SOLO CANAL: este componente es la superficie conversacional resumida. El
 * widget decide mostrarlo (con la voz) en lugar del globo/popover para no
 * duplicar. No toca el bus, el engine ni el provider: solo consume `useAurora()`
 * y llama a callbacks del widget para abrir Exocórtex / el popover grande.
 *
 * SSR-safe · `prefers-reduced-motion` respetado · responsive (clamp + anclaje
 * relativo al orbe, calculado por AuroraWidget).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "framer-motion";
import {
  Sparkles, X, Play, Pause, Square, SkipForward, SkipBack,
  Mic, MicOff, MessageSquare, ChevronUp, Maximize2, History, Gauge,
  icons as lucideIcons, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAurora } from "./aurora-provider";
import { AURORA_EXOCORTEX_OPEN_EVENT } from "@/lib/aurora/aurora-orb-bus";
import { MessageRenderer } from "./message-renderer";
import VoiceProcessingIndicator from "./voice-processing-indicator";
import { RouteChip } from "./route-chip";
import {
  listPersonalityProfiles,
  setActivePersonality,
  resolvePersonalityForContext,
  registerActiveAuroraChat,
  HERMIONE_PERSONALITY_ID as HERMIONE_ID,
  PERSONALITY_CHANGED_EVENT,
  type PersonalityProfile,
} from "@/lib/aurora/personalities";
import styles from "./aurora-mini-player.module.css";
import { ChatConfigMenu } from "./chat-config-menu";
import { MiniPlayerOpenMenu } from "./mini-player-open-menu";
import { useAiConversations, useAiMessages, appendMessage } from "@/lib/aurora/conversations";
import { Settings, FolderOpen, Paperclip } from "lucide-react";
// Adjuntos + voz de chat compartidos (Agente S1): 📎, chips y altavoz.
import { summarizeAttachments, type UniversalAttachment } from "@/lib/aurora/attachments";
import { ChatAttachButton, MessageAttachmentChips } from "@/components/aurora/chat-attach-button";
import { ChatVoiceButtons } from "@/components/aurora/chat-voice-buttons";
import { UsageSummaryMini } from "@/components/agent/usage-panel";

/** Inactividad tras la cual el reproductor resumido se retira solo. */
const AUTOHIDE_MS = 10_000;

/* ── Feature A: arrastre del borde superior → ensancha + 2º arrastre = pantalla
 * completa. Al arrastrar hacia arriba para expandir, la ventana crece en
 * ANCHO además de alto (para que "Historial"/"Chats"/"Opciones"/"Nexus"/
 * "Completo" quepan enteros). Un SEGUNDO gesto de arrastre-hacia-arriba, ya en
 * el tamaño máximo, abre el chat completo en /agent/chat con una transición
 * fluida (crece hacia la página) antes de navegar. ── */
/** Ancho base (px) — coincide con el mínimo del clamp() CSS (16rem) de .player. */
const MINI_PLAYER_MIN_W = 256;
/** Ancho MÁXIMO (px) al expandir: cabe cómodo el texto completo de los botones
 *  del pie. Se acota luego al viewport (nunca se sale de la pantalla). */
const MINI_PLAYER_MAX_W = 480;
/** Recorrido (px) de arrastre hacia arriba para interpolar min→máx de ancho. */
const EXPAND_DRAG_RANGE = 150;
/** Margen (px) respecto al borde del viewport al acotar tamaño/posición. */
const EDGE_MARGIN = 8;
/** Duración (ms) de la transición "crece hacia la página completa" antes de navegar. */
const FULLSCREEN_TRANSITION_MS = 300;

export interface AuroraMiniPlayerAnchor {
  /** Estilo posicional del contenedor (anclado al orbe; lo calcula el widget). */
  style: React.CSSProperties;
  /** true → el reproductor abre HACIA ARRIBA (orbe en la mitad inferior). */
  openUp: boolean;
  /** true → el orbe está en la mitad derecha (lado de la colita/origen). */
  openLeft: boolean;
}

/**
 * Texto PROACTIVO de Aurora (`aurora:suggest` / `aurora:notify`). Antes lo
 * pintaba un GLOBO aparte (AuroraSpeechBubble) → salían DOS ventanas de Aurora a
 * la vez. Ahora vive DENTRO de este reproductor: una sola superficie.
 */
export interface AuroraProactive {
  kind: "suggest" | "notify";
  text: string;
  /** Marca temporal (fuerza reaparición aunque el texto se repita). */
  key: number;
}

export interface AuroraMiniPlayerProps {
  anchor: AuroraMiniPlayerAnchor;
  /** ¿Hay conversación activa? (el widget lo decide: interim o speaking o historial). */
  active: boolean;
  /** Texto proactivo pendiente (sugerencia/aviso), o null. Se pinta aquí dentro. */
  proactive?: AuroraProactive | null;
  /** Abre la ventana COMPLETA de Aurora en el Exocórtex (delegado por el widget). */
  onOpenExocortex?: () => void;
  /** Abre el popover grande clásico (pestañas Chat/Chats/Voz/Control) bajo demanda. */
  onExpandPanel?: () => void;
  /** El usuario descartó el reproductor (la X): el widget deja de pedirlo hasta nueva actividad. */
  onDismiss?: () => void;
}

type Speaker = "user" | "aurora";

interface Line {
  role: Speaker;
  text: string;
  at: number;
  /** (Agente S1) Adjuntos del mensaje (jsonb de `astraura_messages.attachments`). */
  attachments?: unknown[] | null;
}

export function AuroraMiniPlayer({
  anchor,
  active,
  proactive = null,
  onOpenExocortex,
  onExpandPanel,
  onDismiss,
}: AuroraMiniPlayerProps) {
  const aurora = useAurora();
  const reduce = useReducedMotion();
  const router = useRouter();

  const [expanded, setExpanded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const conv = useAiConversations();
  // Hilo desde la NUBE unificada (últimos ~20): así el reproductor de la orbe
  // muestra TAMBIÉN lo hablado/escrito en el Exocórtex y en /agent (Agente S1).
  const cloudMsgs = useAiMessages(conv.activeId);
  const [optsOpen, setOptsOpen] = useState(false);
  // Selector compacto de chats/carpetas + cerebros + nuevo chat (Adenda 71-ter).
  const [openMenuOpen, setOpenMenuOpen] = useState(false);
  // Popover compacto de uso del sistema (Nexus), en el pie (Adenda 76 · G1).
  const [nexusOpen, setNexusOpen] = useState(false);
  const personalities = useMemo(() => listPersonalityProfiles(), []);
  // Personalidad EFECTIVA de ESTE chat (prioridad chat > entidad > cerebro >
  // sección > global — resolvePersonalityForContext), NO solo la global: así
  // el título de la cabecera refleja la que Aurora usa de verdad al responder
  // aquí. Si el chat no tiene una propia asignada, cae a la que corresponda
  // (normalmente Aurora). Reacciona al cambio de chat y a cambios en caliente.
  const [activeProfile, setActiveProfile] = useState<PersonalityProfile | null>(() =>
    resolvePersonalityForContext({ chatId: conv.activeId ?? undefined }),
  );
  useEffect(() => {
    // Idempotente: solo re-renderiza si la personalidad activa cambió de verdad
    // (evita realimentar el ciclo lectura→normalización→evento; Adenda 74-bis).
    const sync = () =>
      setActiveProfile((prev) => {
        const next = resolvePersonalityForContext({ chatId: conv.activeId ?? undefined });
        return prev?.id === next?.id && prev?.name === next?.name ? prev : next;
      });
    sync();
    if (typeof window !== "undefined") {
      window.addEventListener(PERSONALITY_CHANGED_EVENT, sync);
      return () => window.removeEventListener(PERSONALITY_CHANGED_EVENT, sync);
    }
  }, [conv.activeId]);
  // Este chat se registra como "el chat activo de Aurora" mientras el
  // reproductor esté abierto (mismo patrón que aurora-chat-section.tsx en el
  // Exocórtex): así resolvePersonalityForContext()/los paneles que no reciben
  // chatId explícito (p.ej. el ajuste en caliente del estilo de voz) también
  // resuelven contra el chat correcto.
  useEffect(() => {
    if (!conv.activeId) return;
    try { registerActiveAuroraChat(conv.activeId); } catch { /* defensivo */ }
    return () => { try { registerActiveAuroraChat(null); } catch { /* defensivo */ } };
  }, [conv.activeId]);
  const activePersonalityId = activeProfile?.id;
  const autohideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyScrollRef = useRef<HTMLDivElement | null>(null);
  // Cierra el desplegable de personalidades al hacer click FUERA de él.
  const pickerRef = useRef<HTMLDivElement | null>(null);
  // Adenda 89: el menú de personalidades se pinta en un PORTAL (document.body)
  // anclado al botón, con posición fija y z-index alto — así NUNCA lo recorta el
  // overflow de la ventana de la orbe ni queda fuera de pantalla (bug del
  // desplegable que no aparecía). menuRef es el nodo del portal (para el
  // click-fuera); triggerBtnRef es el botón (para calcular su posición).
  const triggerBtnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; width: number; anchorY: number; dropUp: boolean } | null>(null);

  // ── Feature A: ensanchar en vivo con el arrastre + 2º arrastre = pantalla
  // completa. Ver constantes MINI_PLAYER_MIN_W/MAX_W arriba. ──
  const outerRef = useRef<HTMLDivElement | null>(null);
  const fullscreenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Progreso 0-1 del ancho EN VIVO durante el primer arrastre (0 = ancho base). */
  const [dragProgress, setDragProgress] = useState(0);
  /** Aviso visual: ya expandida y el usuario tira de nuevo hacia arriba. */
  const [pullingFullscreen, setPullingFullscreen] = useState(false);
  /** Dispara la animación de "crece hacia la página completa" antes de navegar. */
  const [transitioningFullscreen, setTransitioningFullscreen] = useState(false);
  /** Corrección left/right/top/bottom para que, al ensanchar/alargar, la
   *  ventana entera siga cabiendo en el viewport aunque el orbe esté pegado a
   *  un borde (el anclaje del padre asume el tamaño BASE, no el expandido). */
  const [edgeFix, setEdgeFix] = useState<React.CSSProperties>({});
  const [viewport, setViewport] = useState<{ w: number; h: number }>(() =>
    typeof window !== "undefined"
      ? { w: window.innerWidth, h: window.innerHeight }
      : { w: 1024, h: 768 },
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  // Mide el rectángulo REAL (tras crecer) y corrige la posición si se sale del
  // viewport. Se remide 260ms después (además de al instante) porque el alto
  // crece con SU PROPIA animación (revelado del historial, ~220ms) y así se
  // captura el tamaño final, no uno a medio animar.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const el = outerRef.current;
    const measure = () => {
      if (!el || (!expanded && dragProgress <= 0)) { setEdgeFix({}); return; }
      const rect = el.getBoundingClientRect();
      const fix: React.CSSProperties = {};
      if (rect.left < EDGE_MARGIN) { fix.left = EDGE_MARGIN; fix.right = "auto"; }
      else if (rect.right > window.innerWidth - EDGE_MARGIN) { fix.right = EDGE_MARGIN; fix.left = "auto"; }
      if (rect.top < EDGE_MARGIN) { fix.top = EDGE_MARGIN; fix.bottom = "auto"; }
      else if (rect.bottom > window.innerHeight - EDGE_MARGIN) { fix.bottom = EDGE_MARGIN; fix.top = "auto"; }
      setEdgeFix(fix);
    };
    measure();
    const t = setTimeout(measure, 260);
    return () => clearTimeout(t);
  }, [expanded, dragProgress, viewport]);
  useEffect(() => () => {
    if (fullscreenTimeoutRef.current) clearTimeout(fullscreenTimeoutRef.current);
  }, []);

  const listening = !!aurora?.listening;
  const speaking = !!aurora?.speaking;
  const paused = !!aurora?.paused;
  const interim = (aurora?.interim || "").trim();
  const conversation = useMemo<Line[]>(() => {
    const live = (aurora?.conversation as Line[] | undefined) ?? [];
    // Historia persistida (orbe + Exocórtex + /agent); los divisores 'system' no van aquí.
    const fromCloud: Line[] = cloudMsgs
      .filter((m) => m.role !== "system" && !!m.text.trim())
      .map((m) => ({
        role: m.role === "assistant" ? "aurora" : "user",
        text: m.text,
        at: m.ts,
        attachments: m.attachments,
      }));
    if (fromCloud.length === 0) return live.slice(-20);
    // Añadimos la COLA en vivo del ring del motor que aún no está en la nube
    // (respuesta en streaming del turno actual), sin duplicar.
    const lastAt = fromCloud[fromCloud.length - 1].at;
    const seen = new Set(fromCloud.map((m) => `${m.role}|${m.text.trim()}`));
    const tailLive = live.filter(
      (m) => !seen.has(`${m.role}|${(m.text ?? "").trim()}`) && (m.at ?? 0) >= lastAt,
    );
    return [...fromCloud, ...tailLive].slice(-20);
  }, [cloudMsgs, aurora?.conversation]);
  const voiceUnavailable = !!aurora?.voiceUnavailable;

  // ── ¿Quién tiene el turno? Define el color de la iluminación reactiva. ──
  //   · Aurora hablando  → lavanda del Café.
  //   · Usuario hablando → azul Zenith (escucha activa / interim).
  //   · En reposo        → tinte neutro tenue.
  const turn: "aurora" | "user" | "idle" = speaking
    ? "aurora"
    : listening || interim
      ? "user"
      : "idle";

  const accentRgb = turn === "aurora" ? "201 168 255" : turn === "user" ? "0 127 255" : "148 163 184";
  // La etiqueta de la cabecera. Con texto PROACTIVO y sin voz en curso, lo
  // anunciamos como «Sugerencia» / «Aviso» (antes esto abría un globo aparte).
  const turnLabel = speaking
    ? (paused ? "En pausa" : "Aurora habla")
    : listening || interim
      ? "Te escucho"
      : proactive
        ? (proactive.kind === "notify" ? "Aviso" : "Sugerencia")
        : conversation.length > 0
          ? "Conversación"
          : "Aurora";

  // Actividad viva: hay voz sonando/escuchando o transcripción parcial.
  const live = speaking || listening || !!interim;

  // ── Auto-ocultar tras AUTOHIDE_MS SIN actividad (se reinicia con cada señal). ──
  const clearAutohide = useCallback(() => {
    if (autohideRef.current) {
      clearTimeout(autohideRef.current);
      autohideRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Adenda 76 · G1: el orbe NO se auto-oculta por inactividad. Solo se cierra
    // con su botón de cerrar (onDismiss se dispara únicamente por acción del
    // usuario). Mantenemos clearAutohide por si quedara algún temporizador vivo.
    clearAutohide();
  }, [active, live, expanded, clearAutohide]);

  useEffect(() => () => clearAutohide(), [clearAutohide]);

  // Al colapsar de nuevo, deja el historial listo por abajo para la próxima vez.
  useEffect(() => {
    if (expanded && historyScrollRef.current) {
      const el = historyScrollRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [expanded, conversation.length]);

  // ── Acciones de transporte (delegan en el provider; degradan en silencio). ──
  const togglePlay = useCallback(() => {
    if (!aurora) return;
    clearAutohide();
    try {
      if (speaking && !paused) {
        aurora.pauseSpeech();
        return;
      }
      if (paused) {
        aurora.resumeSpeech();
        return;
      }
      // Nada sonando: reproduce la última respuesta de Aurora. Si lo que hay es
      // un texto PROACTIVO (sugerencia/aviso), ▶ lo dice en voz alta — la voz de
      // una recomendación SOLO suena si se pide (nunca por sorpresa).
      const say = aurora.lastReply?.trim() || proactive?.text?.trim() || "";
      if (say) aurora.speak(say);
    } catch { /* */ }
  }, [aurora, speaking, paused, proactive, clearAutohide]);

  const stop = useCallback(() => {
    if (!aurora) return;
    clearAutohide();
    try { aurora.interrupt(); } catch { /* */ }
  }, [aurora, clearAutohide]);

  const prev = useCallback(() => {
    if (!aurora) return;
    clearAutohide();
    try { aurora.skipBack(); } catch { /* */ }
  }, [aurora, clearAutohide]);

  const next = useCallback(() => {
    if (!aurora) return;
    clearAutohide();
    try { aurora.skipForward(); } catch { /* */ }
  }, [aurora, clearAutohide]);

  // Mic on/off: si la voz no está disponible, el toque REINTENTA; si no, toggle.
  const toggleMic = useCallback(() => {
    if (!aurora) return;
    clearAutohide();
    try {
      if (voiceUnavailable) { aurora.retryVoice(); return; }
      aurora.toggle();
    } catch { /* */ }
  }, [aurora, voiceUnavailable, clearAutohide]);

  const openExocortex = useCallback(() => {
    clearAutohide();
    if (onOpenExocortex) { onOpenExocortex(); return; }
    try { window.dispatchEvent(new CustomEvent(AURORA_EXOCORTEX_OPEN_EVENT)); } catch { /* */ }
  }, [onOpenExocortex, clearAutohide]);

  const dismiss = useCallback(() => {
    clearAutohide();
    setExpanded(false);
    onDismiss?.();
  }, [clearAutohide, onDismiss]);

  // Cierra el desplegable de personalidades al hacer click FUERA de él (elegir
  // una opción ya lo cierra desde choosePersonality).
  useEffect(() => {
    if (!pickerOpen || typeof document === "undefined") return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      // El menú vive en un PORTAL (fuera de pickerRef); cuenta como "dentro"
      // tanto el botón disparador como el propio menú del portal.
      if (triggerBtnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setPickerOpen(false);
    };
    const close = () => setPickerOpen(false);
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true); // se cierra al desplazar (posición fija)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [pickerOpen]);

  // Cambia la personalidad de ESTE chat "en caliente": si hay un chat activo
  // usamos el ámbito POR CHAT (máxima prioridad en resolvePersonalityForContext,
  // igual que hace personalities-panel.tsx con "Este chat"); si todavía no hay
  // chat (p.ej. antes del primer mensaje), cae a global — la función real de
  // cambio sigue siendo setActivePersonality en ambos casos.
  const choosePersonality = useCallback((id: string) => {
    if (conv.activeId) {
      setActivePersonality({ scope: "chat", chatId: conv.activeId }, id);
    } else {
      setActivePersonality({ scope: "global" }, id);
    }
    setPickerOpen(false);
    clearAutohide();
  }, [conv.activeId, clearAutohide]);

  // Adenda 89: abre el desplegable calculando la posición del PORTAL desde el
  // rect del botón (posición FIJA). Cae hacia ABAJO salvo que no quepa abajo y sí
  // arriba. Clampa al viewport para no salirse por los lados.
  const openPicker = useCallback(() => {
    if (typeof window !== "undefined" && triggerBtnRef.current) {
      const r = triggerBtnRef.current.getBoundingClientRect();
      const width = Math.max(220, Math.min(280, window.innerWidth - 16));
      let left = r.left;
      if (left + width > window.innerWidth - 8) left = window.innerWidth - 8 - width;
      if (left < 8) left = 8;
      const spaceBelow = window.innerHeight - r.bottom;
      const dropUp = spaceBelow < 260 && r.top > 260;
      setMenuPos({ left, width, anchorY: dropUp ? r.top : r.bottom, dropUp });
    }
    clearAutohide();
    setPickerOpen(true);
  }, [clearAutohide]);

  // 📎 (Agente S1): el picker universal ya subió el archivo (url real). Lo
  // persistimos como mensaje del usuario en la conversación ACTIVA (la misma de
  // todas las superficies); aparece en el hilo con su chip y el próximo turno lo ve.
  const handleMiniAttach = useCallback(async (picked: UniversalAttachment[]) => {
    if (!picked?.length) return;
    clearAutohide();
    try {
      await appendMessage({
        role: "user",
        text: summarizeAttachments(picked),
        convId: conv.activeId ?? undefined,
        surface: "mini",
        attachments: picked,
      });
    } catch { /* defensivo */ }
  }, [conv.activeId, clearAutohide]);

  // Ruta del chat completo — LA MISMA que usa hoy el botón «pantalla completa».
  const fullChatHref = `/agent/chat${conv.activeId ? `?id=${conv.activeId}` : ""}`;

  // 2º gesto de ampliar (ya al tamaño máximo): transición fluida — la ventana
  // "crece" hacia la página completa (escala+opacidad) y LUEGO navega, para
  // que se sienta como una transformación continua y no un corte brusco.
  const triggerFullscreenTransition = useCallback(() => {
    if (transitioningFullscreen) return;
    clearAutohide();
    setPullingFullscreen(false);
    setTransitioningFullscreen(true);
    if (fullscreenTimeoutRef.current) clearTimeout(fullscreenTimeoutRef.current);
    fullscreenTimeoutRef.current = setTimeout(() => {
      router.push(fullChatHref);
    }, FULLSCREEN_TRANSITION_MS);
  }, [transitioningFullscreen, clearAutohide, router, fullChatHref]);

  // Arrastre EN VIVO (mientras el dedo sigue abajo): si aún no está expandida,
  // el ancho interpola hacia MINI_PLAYER_MAX_W con la distancia arrastrada
  // (feedback inmediato, "fluido"). Si ya está expandida, un nuevo tirón hacia
  // arriba solo enciende el AVISO visual — el disparo real llega al soltar
  // (onDragEnd), para no navegar por accidente a mitad de gesto.
  const onDrag = useCallback((_e: unknown, info: PanInfo) => {
    if (transitioningFullscreen) return;
    const dy = info.offset.y;
    if (!expanded) {
      const progress = dy < 0 ? Math.min(1, -dy / EXPAND_DRAG_RANGE) : 0;
      setDragProgress(progress);
    } else {
      setPullingFullscreen(dy < -20);
    }
  }, [expanded, transitioningFullscreen]);

  // ── Deslizar dentro del widget: arriba = expandir (alto Y ancho); abajo =
  // colapsar; arriba OTRA VEZ ya expandida (segundo gesto) = abrir el chat
  // completo. ──
  const onDragEnd = useCallback((_e: unknown, info: PanInfo) => {
    const dy = info.offset.y;
    const vy = info.velocity.y;
    setDragProgress(0);
    setPullingFullscreen(false);
    // Deslizar hacia ARRIBA (dy negativo) expande; hacia ABAJO colapsa. El eje
    // "arriba" del gesto depende de si el widget abre hacia arriba o abajo, pero
    // usamos la convención natural: subir el dedo = ver más (expandir).
    if (dy < -34 || vy < -420) {
      if (expanded) { triggerFullscreenTransition(); return; }
      setExpanded(true);
      clearAutohide();
      return;
    }
    if (dy > 34 || vy > 420) { setExpanded(false); return; }
  }, [expanded, clearAutohide, triggerFullscreenTransition]);

  if (!aurora || !active) return null;

  const { openUp, openLeft } = anchor;

  // Última respuesta de Aurora → visor universal (imágenes/vídeo/audio/PDF/3D…).
  // Últimas líneas: 2 en resumido; en expandido mostramos todo el historial.
  const collapsedLines = conversation.slice(-2);
  const playIcon = speaking && !paused ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />;

  // Barras de iluminación reactiva (ecualizador cristalino) — reaccionan a quien
  // tiene el turno; en reposo quedan bajitas y quietas.
  const bars = [0, 1, 2, 3, 4];

  // Ancho MÁXIMO acotado al viewport actual (Feature A) — nunca se sale de la
  // pantalla, incluso en móviles estrechos.
  const maxPlayerW = Math.max(
    MINI_PLAYER_MIN_W,
    Math.min(MINI_PLAYER_MAX_W, viewport.w - EDGE_MARGIN * 2),
  );
  // Ancho EN VIVO: fijo al máximo si ya está expandida (alto Y ancho crecen
  // juntos); interpolado durante el primer arrastre; si no, undefined (manda
  // el clamp() del CSS — comportamiento idéntico al de siempre).
  const liveWidth = expanded
    ? maxPlayerW
    : dragProgress > 0
      ? Math.round(MINI_PLAYER_MIN_W + (maxPlayerW - MINI_PLAYER_MIN_W) * dragProgress)
      : undefined;

  return (
    <AnimatePresence>
      {/* ENVOLTORIO POSICIONAL (motion, para conservar la animación de salida) —
          fijo y anclado al orbe, pero pointer-events:none: NUNCA intercepta
          punteros. Así, aunque el rectángulo del resumido llegara a rozar el
          orbe, el mantener-pulsado (Trinity) y el resto de gestos del orbe
          SIEMPRE los recibe el orbe. Solo la TARJETA interior es interactiva. */}
      <motion.div
        key="aurora-mini-player"
        ref={outerRef}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: openUp ? 10 : -10, scale: 0.95 }}
        animate={
          transitioningFullscreen
            ? (reduce ? { opacity: 0 } : { opacity: 0, scale: 1.08 })
            : reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }
        }
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: openUp ? 8 : -8, scale: 0.96 }}
        transition={
          transitioningFullscreen
            ? { duration: reduce ? 0.15 : FULLSCREEN_TRANSITION_MS / 1000, ease: "easeOut" }
            : reduce ? { duration: 0.15 } : { type: "spring", stiffness: 360, damping: 30 }
        }
        className="pointer-events-none fixed z-[62] flex select-none flex-col"
        style={{
          ...anchor.style,
          // Feature A: corrige left/right/top/bottom si, al ensanchar/alargar
          // la ventana, se saldría del viewport (orbe pegado a un borde).
          ...edgeFix,
          transformOrigin: `${openLeft ? "right" : "left"} ${openUp ? "bottom" : "top"}`,
        }}
      >
      <motion.div
        role="group"
        aria-label="Reproductor de conversación de Astraura IA"
        drag={reduce || transitioningFullscreen ? false : "y"}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.14}
        dragMomentum={false}
        onDrag={onDrag}
        onDragEnd={onDragEnd}
        // La TARJETA sí captura el puntero (pointer-events:auto) para el swipe y
        // los botones; el envoltorio de arriba se mantiene inerte.
        className={cn(
          styles.player,
          "relative pointer-events-auto flex select-none flex-col",
          pullingFullscreen && !reduce && styles.playerPulling,
        )}
        style={{
          ["--mp-rgb" as string]: accentRgb,
          // Feature A: ancho EN VIVO (interpolado durante el arrastre, fijo al
          // máximo si ya está expandida). undefined ⇒ manda el clamp() del CSS.
          ...(liveWidth !== undefined ? { width: liveWidth } : null),
        }}
      >
        {/* Filo de luz aurora superior (reactivo al turno). */}
        <span aria-hidden className={cn(styles.edge, live && styles.edgeLive)} />
        {/* Indicador ANIMADO de procesamiento de voz (Adenda V2-VOZ). */}
        <VoiceProcessingIndicator variant="float" label="Dando voz…" />

        {/* Asa de deslizar (grabber) — pista visual de que se puede subir/bajar. */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Colapsar historial" : "Deslizar para ver el historial"}
          title={expanded ? "Colapsar" : "Desliza o toca para ver el historial de la sesión"}
          className={styles.grabber}
        >
          <span className={styles.grabberBar} />
        </button>

        {/* ── Cabecera: identidad + estado del turno + iluminación reactiva ── */}
        <div className="flex items-center gap-2 px-3 pt-0.5">
          <span
            className={cn(styles.avatar, live && styles.avatarLive)}
            style={{
              background:
                "radial-gradient(120% 120% at 30% 20%, rgba(255,255,255,0.5), transparent 55%), linear-gradient(135deg, rgb(var(--mp-rgb) / 0.92), rgba(201,168,255,0.6))",
            }}
          >
            <Sparkles className="h-3.5 w-3.5 text-white" />
          </span>

          <div className="min-w-0 flex-1" ref={pickerRef}>
            {/* Selector de personalidad: el nombre es la personalidad ACTIVA
                de ESTE chat (activeProfile ← resolvePersonalityForContext:
                chat > entidad > cerebro > sección > global), no solo la
                global. El cheurón abre la lista de personalidades DISPONIBLES
                para cambiarla en caliente sin salir del reproductor. */}
            <button
              ref={triggerBtnRef}
              type="button"
              onClick={() => { if (pickerOpen) setPickerOpen(false); else openPicker(); }}
              aria-label="Cambiar personalidad de Aurora en este chat"
              aria-expanded={pickerOpen}
              title="Personalidad activa en este chat — toca para cambiar"
              className="group flex cursor-pointer items-center gap-1.5 rounded-md px-1 -mx-1 transition-colors duration-200 hover:bg-white/10"
            >
              <PersonalityIcon name={activeProfile?.icon || "Sparkles"} className="h-3 w-3 shrink-0 text-white/55" />
              <span className="max-w-[8rem] truncate text-[11px] font-semibold tracking-wide text-white/90">
                {activeProfile?.name || (activePersonalityId === HERMIONE_ID ? "Hermione" : "Aurora")}
              </span>
              <ChevronUp className={cn("h-3 w-3 shrink-0 text-white/50 transition-transform duration-200", pickerOpen && "rotate-180")} />
            </button>
            <div className="flex items-center gap-1.5 text-[8px] font-mono uppercase tracking-[0.16em]" style={{ color: "rgb(var(--mp-rgb) / 0.9)" }}>
              {turnLabel}
            </div>

            {/* Menú de personalidades DISPONIBLES (icono + nombre + breve
                descriptor), cristalino. Elegir cambia la personalidad de ESTE
                chat en caliente (choosePersonality: por-chat si hay chat
                activo, si no global) y cierra; también se cierra al clicar
                fuera (ver el listener en pickerRef). */}
            {pickerOpen && menuPos && typeof document !== "undefined" && createPortal(
              <div
                ref={menuRef}
                role="listbox"
                aria-label="Personalidades disponibles"
                style={{
                  position: "fixed",
                  left: menuPos.left,
                  width: menuPos.width,
                  zIndex: 10001,
                  ...(menuPos.dropUp
                    ? { bottom: (typeof window !== "undefined" ? window.innerHeight : 0) - menuPos.anchorY + 6 }
                    : { top: menuPos.anchorY + 6 }),
                }}
                className="max-h-72 overflow-y-auto rounded-xl border border-white/12 bg-[#0b0f1c]/95 p-1 shadow-2xl shadow-black/60 backdrop-blur-2xl"
              >
                {personalities.length === 0 && (
                  <p className="px-2.5 py-2 text-[11px] italic text-white/40">
                    No hay personalidades guardadas todavía.
                  </p>
                )}
                {personalities.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="option"
                    aria-selected={p.id === activePersonalityId}
                    onClick={() => choosePersonality(p.id)}
                    className={cn(
                      "flex w-full cursor-pointer items-start gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors duration-150",
                      p.id === activePersonalityId
                        ? "bg-cyan-500/20 text-cyan-100"
                        : "text-white/75 hover:bg-white/10",
                    )}
                  >
                    <PersonalityIcon name={p.icon || "Sparkles"} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#7fb8ff]" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[11px]">{p.name}</span>
                        {p.id === HERMIONE_ID && (
                          <span className="shrink-0 text-[8px] uppercase tracking-wider text-emerald-300/80">Hermes</span>
                        )}
                        {p.id === activePersonalityId && (
                          <span className="shrink-0 text-[9px] text-cyan-300">●</span>
                        )}
                      </span>
                      {p.description && (
                        <span className="block truncate text-[9px] font-normal text-white/40">{p.description}</span>
                      )}
                    </span>
                  </button>
                ))}
              </div>,
              document.body,
            )}
          </div>

          {/* Ecualizador cristalino: iluminación reactiva a la voz (usuario/Aurora). */}
          <div aria-hidden className={styles.eq}>
            {bars.map((i) => (
              <span
                key={i}
                className={cn(styles.eqBar, live && styles.eqBarLive)}
                style={{ animationDelay: `${i * 90}ms` }}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={dismiss}
            aria-label="Cerrar reproductor"
            title="Cerrar"
            className={styles.iconGhost}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* ── Líneas de conversación: resumido (2) o historial completo (scroll) ── */}
        <div className="px-3 pt-2">
          <AnimatePresence initial={false} mode="wait">
            {expanded ? (
              <motion.div
                key="history"
                initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                animate={reduce ? { opacity: 1 } : { opacity: 1, height: "auto" }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                transition={{ duration: reduce ? 0.15 : 0.22 }}
                className="overflow-hidden"
              >
                <div className="mb-1.5 flex items-center gap-1.5 text-[8px] font-mono uppercase tracking-[0.18em] text-white/40">
                  <History className="h-3 w-3" /> Historial de la sesión
                </div>
                <div ref={historyScrollRef} className={styles.history}>
                  {conversation.length === 0 && !proactive && (
                    <p className="px-1 py-2 text-[11px] italic text-white/40">
                      Aún no hay mensajes en esta sesión.
                    </p>
                  )}
                  {conversation.map((m, i) => (
                    <LineRow key={`${m.at}-${i}`} line={m} />
                  ))}
                  {/* Texto proactivo: una línea más de Aurora (no otra ventana). */}
                  {proactive && (
                    <LineRow
                      key={`proactive-${proactive.key}`}
                      line={{ role: "aurora", text: proactive.text, at: proactive.key }}
                    />
                  )}
                  {interim && (
                    <div className={cn(styles.line, styles.lineUser, styles.lineInterim)}>
                      <span className={styles.lineTag}>Tú</span>
                      <span className="italic opacity-80">{interim}</span>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="collapsed"
                initial={reduce ? { opacity: 0 } : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="space-y-1"
              >
                {collapsedLines.length === 0 && !interim && !proactive && (
                  <p className="px-1 text-[11px] italic text-white/45">
                    {listening ? "Te escucho…" : "Conversación de Astraura IA"}
                  </p>
                )}
                {collapsedLines.map((m, i) => (
                  <LineRow key={`${m.at}-${i}`} line={m} clamp />
                ))}
                {/* Texto proactivo (sugerencia/aviso): una línea más de Aurora,
                    DENTRO del reproductor — nunca un globo aparte. */}
                {proactive && (
                  <LineRow
                    key={`proactive-${proactive.key}`}
                    line={{ role: "aurora", text: proactive.text, at: proactive.key }}
                    clamp
                  />
                )}
                {interim && (
                  <div className={cn(styles.line, styles.lineUser, styles.lineInterim, styles.lineClamp)}>
                    <span className={styles.lineTag}>Tú</span>
                    <span className="italic opacity-80">{interim}</span>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Transparencia del modelo: chip en la esquina del mini-panel.
              inlinePanel: la tarjeta abre EN FLUJO (la carta tiene overflow:hidden). */}
          <RouteChip compact inlinePanel className="mt-1.5" />
        </div>

        {/* ── Transporte AMPLIADO: prev · play/pausa · stop · next · mic · 📎 · voz ── */}
        <div className="flex flex-wrap items-center gap-1 px-2.5 pb-1.5 pt-2">
          <div className={styles.transport}>
            <button
              type="button"
              onClick={prev}
              title="Respuesta anterior"
              aria-label="Respuesta anterior"
              className={styles.ctrl}
            >
              <SkipBack className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={togglePlay}
              title={speaking && !paused ? "Pausar" : paused ? "Reanudar" : "Reproducir última respuesta"}
              aria-label={speaking && !paused ? "Pausar" : "Reproducir"}
              className={cn(styles.ctrl, styles.ctrlPrimary)}
            >
              {playIcon}
            </button>
            <button
              type="button"
              onClick={stop}
              title="Parar"
              aria-label="Parar"
              className={styles.ctrl}
            >
              <Square className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={next}
              title="Respuesta siguiente"
              aria-label="Respuesta siguiente"
              className={styles.ctrl}
            >
              <SkipForward className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Mic on/off — refleja el estado de escucha; iluminado si escucha. */}
          <button
            type="button"
            onClick={toggleMic}
            title={voiceUnavailable
              ? "Voz no disponible · toca para reintentar"
              : listening ? "Silenciar micrófono" : "Activar micrófono"}
            aria-label={listening ? "Silenciar micrófono" : "Activar micrófono"}
            aria-pressed={listening}
            className={cn(
              styles.ctrl, styles.ctrlMic,
              listening && styles.ctrlMicOn,
              voiceUnavailable && styles.ctrlMicOff,
            )}
          >
            {voiceUnavailable ? (
              <MicOff className="h-3.5 w-3.5" />
            ) : listening ? (
              <Mic className="h-3.5 w-3.5" />
            ) : (
              <MicOff className="h-3.5 w-3.5" />
            )}
          </button>

          {/* 📎 Adjuntar (persiste en el hilo unificado) — Agente S1 */}
          <ChatAttachButton
            onPick={(p) => void handleMiniAttach(p)}
            folder="aurora"
            title="Adjuntar archivo"
            className={cn(styles.ctrl, styles.ctrlMic)}
          >
            <Paperclip className="h-3.5 w-3.5" />
          </ChatAttachButton>

          {/* Altavoz: voz de respuesta on/off de ESTE chat (el mic es el del motor arriba). */}
          <ChatVoiceButtons
            convId={conv.activeId ?? null}
            showMic={false}
            buttonClassName="size-8"
          />
        </div>

        {/* ── Pie: expandir panel clásico · abrir en Exocórtex ── */}
        <div className="flex items-center gap-1.5 px-2.5 pb-2.5">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "Colapsar" : "Ver historial de la sesión"}
            aria-label={expanded ? "Colapsar historial" : "Expandir historial"}
            className={cn(styles.footBtn, styles.footBtnGhost, "min-w-0 flex-1")}
          >
            <ChevronUp className={cn("h-3.5 w-3.5 shrink-0 transition-transform", expanded && "rotate-180")} />
            <span className="text-[10px] font-medium">{expanded ? "Menos" : "Historial"}</span>
          </button>

          {/* Abrir cualquier chat de cualquier carpeta · cerebros · nuevo chat. */}
          <div className="relative min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setOpenMenuOpen((v) => !v)}
              title="Abrir chats, elegir cerebro o crear un chat nuevo"
              aria-label="Chats y cerebros"
              className={cn(styles.footBtn, styles.footBtnGhost, "w-full")}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              <span className="text-[10px] font-medium">Chats</span>
            </button>
            {openMenuOpen && typeof document !== "undefined" && createPortal(
              <div className="fixed bottom-24 right-4 z-[9999] max-w-[92vw]">
                <MiniPlayerOpenMenu onClose={() => setOpenMenuOpen(false)} />
              </div>,
              document.body,
            )}
          </div>

          <div className="relative min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setOptsOpen((v) => !v)}
              title="Opciones de configuración del chat (Astraura)"
              aria-label="Opciones de configuración del chat"
              className={cn(styles.footBtn, styles.footBtnGhost, "w-full")}
            >
              <Settings className="h-3.5 w-3.5" />
              <span className="text-[10px] font-medium">Opciones</span>
            </button>
            {optsOpen && typeof document !== "undefined" && createPortal(
              <div className="fixed bottom-24 right-4 z-[9999] max-w-[92vw]">
                <ChatConfigMenu convId={conv.activeId ?? null} context="orbe" onClose={() => setOptsOpen(false)} />
              </div>,
              document.body,
            )}
          </div>

          <button
            type="button"
            onClick={() => { clearAutohide(); router.push(fullChatHref); }}
            title="Abrir el chat actual en pantalla completa"
            aria-label="Abrir en pantalla completa"
            className={cn(
              styles.footBtn, styles.footBtnGhost,
              // Al ancho máximo (expandida) también muestra su etiqueta
              // completa, como el resto de botones del pie (Feature A).
              expanded ? "min-w-0 flex-1" : "shrink-0",
            )}
          >
            <Maximize2 className="h-3.5 w-3.5 shrink-0" />
            {expanded && <span className="text-[10px] font-medium">Completo</span>}
          </button>

          <div className="relative min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setNexusOpen((v) => !v)}
              title="Nexus — resumen gráfico del uso del sistema Astraura"
              aria-label="Nexus · resumen de uso"
              className={cn(styles.footBtn, styles.footBtnPrimary, "w-full")}
            >
              <Gauge className="h-3.5 w-3.5 shrink-0" />
              <span className="text-[10px] font-semibold">Nexus</span>
            </button>
            {nexusOpen && typeof document !== "undefined" && createPortal(
              <div className="fixed bottom-24 right-4 z-[9999] max-w-[92vw]">
                <UsageSummaryMini onNavigate={() => setNexusOpen(false)} />
              </div>,
              document.body,
            )}
          </div>
        </div>
      </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/** Icono Lucide del campo `icon` de una personalidad (fallback Sparkles). Nunca emojis. */
function PersonalityIcon({ name, className }: { name: string; className?: string }) {
  const Cmp = (lucideIcons as Record<string, LucideIcon>)[name] ?? Sparkles;
  return <Cmp className={className} />;
}

/** Una línea de conversación (Tú / Aurora) con tinte cardinal cristalino. */
function LineRow({ line, clamp = false }: { line: Line; clamp?: boolean }) {
  const isUser = line.role === "user";
  return (
    <div
      className={cn(
        styles.line,
        isUser ? styles.lineUser : styles.lineAurora,
        clamp && styles.lineClamp,
      )}
    >
      <span className={styles.lineTag}>{isUser ? "Tú" : "Aurora"}</span>
      {clamp ? (
        // Resumido (2 líneas, -webkit-line-clamp): texto plano — el recorte por
        // CSS necesita un único nodo de texto, no bloques de markdown anidados.
        <span>{line.text}</span>
      ) : (
        // Historial expandido (con scroll): renderizador universal completo
        // (markdown/código/tablas/JSON), con visor de medios + chips de adjuntos.
        <span className="min-w-0 flex-1">
          <MessageRenderer text={line.text} compact media={true} className="inline" />
          <MessageAttachmentChips attachments={line.attachments} />
        </span>
      )}
    </div>
  );
}

export default AuroraMiniPlayer;
