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
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "framer-motion";
import {
  Sparkles, X, Play, Pause, Square, SkipForward, SkipBack,
  Mic, MicOff, MessageSquare, ChevronUp, Maximize2, History,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAurora } from "./aurora-provider";
import { AURORA_EXOCORTEX_OPEN_EVENT } from "@/lib/aurora/aurora-orb-bus";
import { MessageRenderer } from "./message-renderer";
import { RouteChip } from "./route-chip";
import styles from "./aurora-mini-player.module.css";

/** Inactividad tras la cual el reproductor resumido se retira solo. */
const AUTOHIDE_MS = 10_000;

export interface AuroraMiniPlayerAnchor {
  /** Estilo posicional del contenedor (anclado al orbe; lo calcula el widget). */
  style: React.CSSProperties;
  /** true → el reproductor abre HACIA ARRIBA (orbe en la mitad inferior). */
  openUp: boolean;
  /** true → el orbe está en la mitad derecha (lado de la colita/origen). */
  openLeft: boolean;
}

export interface AuroraMiniPlayerProps {
  anchor: AuroraMiniPlayerAnchor;
  /** ¿Hay conversación activa? (el widget lo decide: interim o speaking o historial). */
  active: boolean;
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
}

export function AuroraMiniPlayer({
  anchor,
  active,
  onOpenExocortex,
  onExpandPanel,
  onDismiss,
}: AuroraMiniPlayerProps) {
  const aurora = useAurora();
  const reduce = useReducedMotion();

  const [expanded, setExpanded] = useState(false);
  const autohideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyScrollRef = useRef<HTMLDivElement | null>(null);

  const listening = !!aurora?.listening;
  const speaking = !!aurora?.speaking;
  const paused = !!aurora?.paused;
  const interim = (aurora?.interim || "").trim();
  const conversation = useMemo<Line[]>(
    () => (aurora?.conversation as Line[] | undefined) ?? [],
    [aurora?.conversation],
  );
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
  const turnLabel = speaking
    ? (paused ? "En pausa" : "Aurora habla")
    : listening || interim
      ? "Te escucho"
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
    clearAutohide();
    if (!active) return;
    // Mientras haya actividad viva, o el panel esté expandido (el usuario lo
    // está mirando), no arrancamos el temporizador de auto-ocultado.
    if (live || expanded) return;
    autohideRef.current = setTimeout(() => {
      onDismiss?.();
    }, AUTOHIDE_MS);
    return clearAutohide;
  }, [active, live, expanded, clearAutohide, onDismiss]);

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
      // Nada sonando: reproduce la última respuesta de Aurora, si la hay.
      const say = aurora.lastReply?.trim();
      if (say) aurora.speak(say);
    } catch { /* */ }
  }, [aurora, speaking, paused, clearAutohide]);

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

  // ── Deslizar dentro del widget: arriba = expandir historial; abajo = colapsar. ──
  const onDragEnd = useCallback((_e: unknown, info: PanInfo) => {
    const dy = info.offset.y;
    const vy = info.velocity.y;
    // Deslizar hacia ARRIBA (dy negativo) expande; hacia ABAJO colapsa. El eje
    // "arriba" del gesto depende de si el widget abre hacia arriba o abajo, pero
    // usamos la convención natural: subir el dedo = ver más (expandir).
    if (dy < -34 || vy < -420) { setExpanded(true); clearAutohide(); return; }
    if (dy > 34 || vy > 420) { setExpanded(false); return; }
  }, [clearAutohide]);

  if (!aurora || !active) return null;

  const { openUp, openLeft } = anchor;

  // Última respuesta de Aurora → visor universal (imágenes/vídeo/audio/PDF/3D…).
  const say = (aurora.lastReply ?? "").trim();
  const lastMsg = conversation[conversation.length - 1];
  const sayIsLastMsg = lastMsg?.role === "aurora" && lastMsg?.text.trim() === say;
  
  const displayConversation = sayIsLastMsg ? conversation.slice(0, -1) : conversation;

  // Últimas líneas: 2 en resumido; en expandido mostramos todo el historial.
  const collapsedLines = displayConversation.slice(-2);
  const playIcon = speaking && !paused ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />;

  // Barras de iluminación reactiva (ecualizador cristalino) — reaccionan a quien
  // tiene el turno; en reposo quedan bajitas y quietas.
  const bars = [0, 1, 2, 3, 4];

  return (
    <AnimatePresence>
      {/* ENVOLTORIO POSICIONAL (motion, para conservar la animación de salida) —
          fijo y anclado al orbe, pero pointer-events:none: NUNCA intercepta
          punteros. Así, aunque el rectángulo del resumido llegara a rozar el
          orbe, el mantener-pulsado (Trinity) y el resto de gestos del orbe
          SIEMPRE los recibe el orbe. Solo la TARJETA interior es interactiva. */}
      <motion.div
        key="aurora-mini-player"
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: openUp ? 10 : -10, scale: 0.95 }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: openUp ? 8 : -8, scale: 0.96 }}
        transition={reduce ? { duration: 0.15 } : { type: "spring", stiffness: 360, damping: 30 }}
        className="pointer-events-none fixed z-[62] flex select-none flex-col"
        style={{
          ...anchor.style,
          transformOrigin: `${openLeft ? "right" : "left"} ${openUp ? "bottom" : "top"}`,
        }}
      >
      <motion.div
        role="group"
        aria-label="Reproductor de conversación de Aurora"
        drag={reduce ? false : "y"}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.14}
        dragMomentum={false}
        onDragEnd={onDragEnd}
        // La TARJETA sí captura el puntero (pointer-events:auto) para el swipe y
        // los botones; el envoltorio de arriba se mantiene inerte.
        className={cn(styles.player, "pointer-events-auto flex select-none flex-col")}
        style={{
          ["--mp-rgb" as string]: accentRgb,
        }}
      >
        {/* Filo de luz aurora superior (reactivo al turno). */}
        <span aria-hidden className={cn(styles.edge, live && styles.edgeLive)} />

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

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold tracking-wide text-white/90">Aurora</span>
              <span
                className="truncate font-mono text-[8px] uppercase tracking-[0.16em]"
                style={{ color: "rgb(var(--mp-rgb) / 0.9)" }}
              >
                {turnLabel}
              </span>
            </div>
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
                  {displayConversation.length === 0 && (
                    <p className="px-1 py-2 text-[11px] italic text-white/40">
                      Aún no hay mensajes en esta sesión.
                    </p>
                  )}
                  {displayConversation.map((m, i) => (
                    <LineRow key={`${m.at}-${i}`} line={m} />
                  ))}
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
                {collapsedLines.length === 0 && !interim && (
                  <p className="px-1 text-[11px] italic text-white/45">
                    {listening ? "Te escucho…" : "Conversación de Aurora"}
                  </p>
                )}
                {collapsedLines.map((m, i) => (
                  <LineRow key={`${m.at}-${i}`} line={m} clamp />
                ))}
                {interim && (
                  <div className={cn(styles.line, styles.lineUser, styles.lineInterim, styles.lineClamp)}>
                    <span className={styles.lineTag}>Tú</span>
                    <span className="italic opacity-80">{interim}</span>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Renderizador universal bajo la última respuesta (compacto, alturas
              reducidas): markdown, código, tablas, JSON, SVG y el visor de
              medios (imágenes/vídeo/audio/PDF/3D…) en un único paso. */}
          {say.length > 0 && <MessageRenderer text={say} compact />}

          {/* Transparencia del modelo: chip en la esquina del mini-panel.
              inlinePanel: la tarjeta abre EN FLUJO (la carta tiene overflow:hidden). */}
          <RouteChip compact inlinePanel className="mt-1.5" />
        </div>

        {/* ── Transporte AMPLIADO: prev · play/pausa · stop · next · mic ── */}
        <div className="flex items-center gap-1 px-2.5 pb-1.5 pt-2">
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
        </div>

        {/* ── Pie: expandir panel clásico · abrir en Exocórtex ── */}
        <div className="flex items-center gap-1.5 px-2.5 pb-2.5">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "Colapsar" : "Ver historial de la sesión"}
            aria-label={expanded ? "Colapsar historial" : "Expandir historial"}
            className={cn(styles.footBtn, styles.footBtnGhost)}
          >
            <ChevronUp className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />
            <span className="text-[10px] font-medium">{expanded ? "Menos" : "Historial"}</span>
          </button>

          {onExpandPanel && (
            <button
              type="button"
              onClick={() => { clearAutohide(); onExpandPanel(); }}
              title="Abrir el panel completo (Chat · Voz · Control)"
              aria-label="Abrir panel completo"
              className={cn(styles.footBtn, styles.footBtnGhost)}
            >
              <Maximize2 className="h-3.5 w-3.5" />
              <span className="text-[10px] font-medium">Panel</span>
            </button>
          )}

          <button
            type="button"
            onClick={openExocortex}
            title="Abrir la ventana completa de Aurora en el Exocórtex"
            aria-label="Abrir en Exocórtex"
            className={cn(styles.footBtn, styles.footBtnPrimary, "ml-auto")}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span className="text-[10px] font-semibold">Exocórtex</span>
          </button>
        </div>
      </motion.div>
      </motion.div>
    </AnimatePresence>
  );
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
        // (markdown/código/tablas/JSON), sin duplicar el visor de medios.
        <MessageRenderer text={line.text} compact media={false} className="inline" />
      )}
    </div>
  );
}

export default AuroraMiniPlayer;
