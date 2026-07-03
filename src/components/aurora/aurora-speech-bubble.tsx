"use client";

/**
 * AuroraSpeechBubble — GLOBO DE DIÁLOGO cristalino sobre el ORBE de Aurora.
 * ----------------------------------------------------------------------------
 * Sustituye al viejo mini-popover/panel para el caso conversacional: cuando
 * Aurora es MENCIONADA, está HABLANDO/respondiendo, o OFRECE una recomendación/
 * notificación proactiva, aparece un globo de texto flotante JUSTO ENCIMA del
 * orbe (relativo a él; se voltea ABAJO si no cabe arriba), con estilo Crystal
 * Liquid Glass (backdrop-blur, borde de luz, tinte cardinal muy sutil), como si
 * Aurora "hablara" en texto.
 *
 * ESTRUCTURA INTELIGENTE (la clave del diseño):
 *   · La VOZ solo suena cuando se SOLICITA — el usuario habla/menciona a Aurora,
 *     o pulsa ▶ (play/continuar). Nunca hablamos por una recomendación.
 *   · Una RECOMENDACIÓN/notificación proactiva NO habla en voz alta: solo
 *     aparece el texto en el globo, como diálogo natural. Si el usuario le habla
 *     (voz) o pulsa «continuar», ahí sí empieza a conversar de forma natural; o
 *     puede seguir SOLO por chat, sin voz.
 *   · Los controles de reproducción (▶/⏸ · ⏹ · continuar) solo aparecen si hay
 *     algo que reproducir (Aurora hablando/pausada) o una conversación activa.
 *
 * Eventos globales que escucha para el texto proactivo (aditivos; el bus no se
 * toca):
 *   · 'aurora:suggest'  detail { text?, context?, desktopName? } — recomendación
 *     proactiva. Si no trae `text`, se genera uno corto útil por `context`.
 *   · 'aurora:notify'   detail { text } — notificación breve.
 * Ambas aparecen SIN voz y se auto-ocultan (~10s) si no se atienden; descartable
 * con una X translúcida. `prefers-reduced-motion` respetado.
 *
 * El globo se ancla al orbe vía `anchor` (posición + apertura arriba/abajo,
 * calculadas por AuroraWidget contra la posición persistida del orbe).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Sparkles, X, Play, Pause, Square, CornerDownLeft, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAurora } from "./aurora-provider";
import { AURORA_EXOCORTEX_OPEN_EVENT } from "@/lib/aurora/aurora-orb-bus";
import styles from "./aurora-orb.module.css";

/**
 * Eventos proactivos (declarados aquí para no tocar el bus): superficies del OS
 * pueden `window.dispatchEvent(new CustomEvent('aurora:suggest', { detail }))`
 * para que Aurora "hable" en texto sobre el orbe sin sonar.
 */
export const AURORA_SUGGEST_EVENT = "aurora:suggest";
export const AURORA_NOTIFY_EVENT = "aurora:notify";

/** Cuánto permanece una sugerencia proactiva no atendida antes de auto-ocultarse. */
const SUGGEST_AUTOHIDE_MS = 10_000;

export interface AuroraBubbleAnchor {
  /** Estilo posicional del contenedor (anclado al orbe, se recalcula por viewport). */
  style: React.CSSProperties;
  /** true → el globo abre HACIA ARRIBA (orbe en la mitad inferior). */
  openUp: boolean;
  /** true → el orbe está en la mitad derecha (para elegir el lado de la colita). */
  openLeft: boolean;
}

interface AuroraSuggestDetail {
  text?: string;
  context?: string;
  desktopName?: string;
}

/**
 * Genera un texto corto y útil para una sugerencia proactiva cuando el evento
 * no trae `text`. Se apoya en `context`/`desktopName` (heurística ligera; el
 * texto real puede venir del motor cuando exista).
 */
function suggestionTextFor(detail: AuroraSuggestDetail): string {
  const t = detail.text?.trim();
  if (t) return t;
  const where = detail.desktopName?.trim();
  const ctx = detail.context?.trim().toLowerCase();
  if (ctx) {
    if (/(politic|gobern|votac|asamble)/.test(ctx))
      return "Hay decisiones abiertas en la Ontocracia. ¿Quieres que te resuma lo que está en juego?";
    if (/(educ|biblio|aprend|curso)/.test(ctx))
      return "Puedo prepararte una ruta de aprendizaje con lo que tienes a mano. ¿La vemos?";
    if (/(cultur|arte|multivers|event)/.test(ctx))
      return "Se está moviendo algo en la esfera cultural. ¿Te enseño lo más relevante?";
    if (/(cafe|café|elixir|barista)/.test(ctx))
      return "Tengo una recomendación para tu carta de elixires. ¿Te la cuento?";
    if (/(perfil|profile|cuenta)/.test(ctx))
      return "Puedo ayudarte a pulir tu perfil para que refleje mejor lo que haces.";
  }
  if (where) return `Estoy contigo en ${where}. Dime en qué te echo una mano.`;
  return "Tengo una idea que puede venirte bien. ¿Quieres que te la cuente?";
}

interface AuroraSpeechBubbleProps {
  anchor: AuroraBubbleAnchor;
  /** Abre el chat completo en el Exocórtex (delegado por el widget para cerrar sus superficies). */
  onOpenChat?: () => void;
  /**
   * Señal de "Aurora fue MENCIONADA / se le está hablando" — el widget la sube
   * cuando hay escucha activa/interim, para que el globo aparezca también en ese
   * caso (no solo al responder).
   */
  mentioned?: boolean;
}

type BubbleKind = "speaking" | "reply" | "suggest" | "notify" | "listening";

interface BubbleState {
  kind: BubbleKind;
  text: string;
  /** true → proactivo/silencioso: no habla; se auto-oculta si no se atiende. */
  proactive: boolean;
  /** Marca temporal para forzar reaparición aunque el texto se repita. */
  key: number;
}

export function AuroraSpeechBubble({ anchor, onOpenChat, mentioned = false }: AuroraSpeechBubbleProps) {
  const aurora = useAurora();
  const reduce = useReducedMotion();

  // Globo visible + su contenido. Un único globo a la vez (el más relevante).
  const [bubble, setBubble] = useState<BubbleState | null>(null);
  // Descartado manualmente: no reaparece hasta que llegue contenido nuevo.
  const dismissedKeyRef = useRef<number>(0);
  const autohideRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const speaking = !!aurora?.speaking;
  const paused = !!aurora?.paused;
  const listening = !!aurora?.listening;
  const interim = aurora?.interim || "";
  const lastReply = aurora?.lastReply || "";
  const conversation = aurora?.conversation || [];
  const hasConversation = conversation.length > 0;

  const clearAutohide = useCallback(() => {
    if (autohideRef.current) {
      clearTimeout(autohideRef.current);
      autohideRef.current = null;
    }
  }, []);

  const showBubble = useCallback(
    (next: Omit<BubbleState, "key">) => {
      const key = Date.now();
      clearAutohide();
      setBubble({ ...next, key });
      if (next.proactive) {
        // Sugerencias/notificaciones no atendidas se retiran solas (~10s).
        autohideRef.current = setTimeout(() => {
          setBubble((b) => (b && b.proactive && b.key === key ? null : b));
        }, SUGGEST_AUTOHIDE_MS);
      }
    },
    [clearAutohide],
  );

  const dismiss = useCallback(() => {
    clearAutohide();
    setBubble((b) => {
      if (b) dismissedKeyRef.current = b.key;
      return null;
    });
  }, [clearAutohide]);

  // ── Eventos PROACTIVOS: 'aurora:suggest' + 'aurora:notify' (texto sin voz) ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onSuggest = (e: Event) => {
      const detail = ((e as CustomEvent).detail || {}) as AuroraSuggestDetail;
      showBubble({ kind: "suggest", text: suggestionTextFor(detail), proactive: true });
    };
    const onNotify = (e: Event) => {
      const detail = ((e as CustomEvent).detail || {}) as { text?: string };
      const text = (detail.text || "").trim();
      if (!text) return;
      showBubble({ kind: "notify", text, proactive: true });
    };
    window.addEventListener(AURORA_SUGGEST_EVENT, onSuggest);
    window.addEventListener(AURORA_NOTIFY_EVENT, onNotify);
    return () => {
      window.removeEventListener(AURORA_SUGGEST_EVENT, onSuggest);
      window.removeEventListener(AURORA_NOTIFY_EVENT, onNotify);
    };
  }, [showBubble]);

  // ── Aurora HABLA/responde → el globo muestra lo que dice (con voz real). ──
  useEffect(() => {
    if (speaking && lastReply) {
      // Nunca "descartado" mientras habla activamente: la voz manda.
      showBubble({ kind: "speaking", text: lastReply, proactive: false });
    }
  }, [speaking, lastReply, showBubble]);

  // Al terminar de hablar, mantenemos la última respuesta un momento y luego
  // dejamos que se recoja (si no hay escucha ni conversación en curso).
  const prevSpeakingRef = useRef(false);
  useEffect(() => {
    const was = prevSpeakingRef.current;
    prevSpeakingRef.current = speaking;
    if (was && !speaking) {
      clearAutohide();
      const t = setTimeout(() => {
        setBubble((b) => (b && (b.kind === "speaking" || b.kind === "reply") ? null : b));
      }, 4200);
      return () => clearTimeout(t);
    }
  }, [speaking, clearAutohide]);

  // ── Aurora MENCIONADA / se le habla (escucha activa) → globo de "te escucho". ──
  useEffect(() => {
    if (!mentioned && !listening) return;
    if (speaking) return; // si ya habla, ese globo tiene prioridad
    const text = interim.trim();
    if (text) {
      showBubble({ kind: "listening", text, proactive: false });
    } else if (!bubble || bubble.proactive) {
      // Escuchando sin transcripción aún: invita a hablar (no pisa una respuesta).
      showBubble({ kind: "listening", text: "Te escucho…", proactive: false });
    }
    // `bubble` fuera de deps a propósito: solo reaccionamos a mención/escucha/interim.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentioned, listening, interim, speaking, showBubble]);

  // Limpieza del timer al desmontar.
  useEffect(() => () => clearAutohide(), [clearAutohide]);

  // ── Acciones de reproducción ──
  const play = useCallback(() => {
    if (!aurora) return;
    clearAutohide();
    if (paused) {
      aurora.resumeSpeech();
      return;
    }
    if (speaking) return; // ya suena
    // No hay voz sonando: la SOLICITAMOS → Aurora dice el texto del globo.
    const say = bubble?.text || lastReply;
    if (say) {
      // Convierte el globo (que era silencioso) en habla real.
      setBubble((b) => (b ? { ...b, kind: "speaking", proactive: false } : b));
      try {
        aurora.speak(say);
      } catch {
        /* degrada en silencio */
      }
    }
  }, [aurora, paused, speaking, bubble, lastReply, clearAutohide]);

  const stop = useCallback(() => {
    if (!aurora) return;
    try {
      aurora.interrupt();
    } catch {
      /* */
    }
  }, [aurora]);

  // "Responder / continuar": abre la voz para conversar de forma natural. Si la
  // voz no está disponible, cae al chat del Exocórtex (solo texto).
  const respond = useCallback(() => {
    if (!aurora) return;
    clearAutohide();
    if (aurora.voiceUnavailable) {
      onOpenChat?.();
      try {
        window.dispatchEvent(new CustomEvent(AURORA_EXOCORTEX_OPEN_EVENT));
      } catch {
        /* */
      }
      return;
    }
    if (aurora.speaking) {
      // Está hablando: "continuar" = escuchar la réplica del usuario.
      try {
        aurora.interrupt();
      } catch {
        /* */
      }
    }
    if (!aurora.listening) {
      try {
        aurora.toggle();
      } catch {
        /* */
      }
    }
  }, [aurora, onOpenChat, clearAutohide]);

  const openChat = useCallback(() => {
    clearAutohide();
    if (onOpenChat) {
      onOpenChat();
      return;
    }
    try {
      window.dispatchEvent(new CustomEvent(AURORA_EXOCORTEX_OPEN_EVENT));
    } catch {
      /* */
    }
  }, [onOpenChat, clearAutohide]);

  // ¿Mostrar el globo? No si fue descartado y no hay contenido nuevo.
  const visible = !!bubble && bubble.key !== dismissedKeyRef.current;

  // Los controles de reproducción solo aparecen si hay algo que reproducir
  // (Aurora habla/pausada) o una conversación activa.
  const showTransport = speaking || paused || hasConversation || (!!bubble && !bubble.proactive);

  // Tinte cardinal muy sutil según el estado (paleta del orbe).
  const accent = useMemo(() => {
    switch (bubble?.kind) {
      case "listening":
        return { rgb: "0 127 255", label: "Escuchando" }; // Zenith azul
      case "suggest":
        return { rgb: "159 232 112", label: "Sugerencia" }; // lime (Horizon)
      case "notify":
        return { rgb: "255 191 0", label: "Aviso" }; // Logic ámbar
      case "speaking":
      case "reply":
      default:
        return { rgb: "201 168 255", label: "Aurora" }; // lavanda del Café
    }
  }, [bubble?.kind]);

  const { openUp, openLeft } = anchor;

  return (
    <AnimatePresence>
      {visible && bubble && (
        <motion.div
          key={bubble.key}
          role="status"
          aria-live="polite"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: openUp ? 8 : -8, scale: 0.94 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: openUp ? 6 : -6, scale: 0.96 }}
          transition={reduce ? { duration: 0.15 } : { type: "spring", stiffness: 360, damping: 30 }}
          className={cn(styles.bubble, "fixed z-[62] flex select-none flex-col")}
          style={{
            ...anchor.style,
            ["--bubble-rgb" as string]: accent.rgb,
            transformOrigin: `${openLeft ? "right" : "left"} ${openUp ? "bottom" : "top"}`,
          }}
        >
          {/* Colita del globo apuntando al orbe (arriba/abajo según apertura). */}
          <span
            aria-hidden
            className={cn(styles.bubbleTail, openUp ? styles.bubbleTailDown : styles.bubbleTailUp, openLeft ? styles.bubbleTailRight : styles.bubbleTailLeft)}
          />

          {/* Filo de luz aurora superior. */}
          <span aria-hidden className={styles.bubbleEdge} />

          <div className="flex items-start gap-2 px-3.5 pt-3">
            <span
              className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full"
              style={{
                background:
                  "radial-gradient(120% 120% at 30% 20%, rgba(255,255,255,0.5), transparent 55%), linear-gradient(135deg, rgb(var(--bubble-rgb) / 0.9), rgba(201,168,255,0.65))",
                boxShadow: "0 0 12px rgb(var(--bubble-rgb) / 0.5)",
              }}
            >
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold tracking-wide text-white/90">Aurora</span>
                <span
                  className="font-mono text-[8px] uppercase tracking-[0.18em]"
                  style={{ color: "rgb(var(--bubble-rgb) / 0.85)" }}
                >
                  {accent.label}
                </span>
              </div>
              <p className="mt-1 max-h-[42vh] overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-white/90">
                {bubble.text}
              </p>
            </div>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Descartar"
              title="Descartar"
              className="ml-0.5 grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-white/80"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Controles cristalinos de reproducción + responder/continuar + chat. */}
          <div className="flex items-center gap-1.5 px-3 pb-3 pt-2.5">
            {showTransport && (
              <div className={cn(styles.bubbleControls, "flex items-center gap-1")}>
                {paused || !speaking ? (
                  <button
                    type="button"
                    onClick={play}
                    title={paused ? "Reanudar" : "Reproducir en voz"}
                    aria-label={paused ? "Reanudar" : "Reproducir en voz"}
                    className={cn(styles.bubbleCtrl, styles.bubbleCtrlPrimary)}
                  >
                    <Play className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => aurora?.pauseSpeech()}
                    title="Pausar"
                    aria-label="Pausar"
                    className={cn(styles.bubbleCtrl, styles.bubbleCtrlPrimary)}
                  >
                    <Pause className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={stop}
                  title="Detener"
                  aria-label="Detener"
                  className={styles.bubbleCtrl}
                >
                  <Square className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={respond}
              title={aurora?.voiceUnavailable ? "Responder por chat" : "Responder / continuar por voz"}
              className={cn(styles.bubbleRespond, "inline-flex items-center gap-1.5")}
            >
              <CornerDownLeft className="h-3.5 w-3.5" />
              <span className="text-[11px] font-medium">
                {aurora?.voiceUnavailable ? "Responder" : "Continuar"}
              </span>
            </button>

            <button
              type="button"
              onClick={openChat}
              title="Abrir el chat completo de Aurora en el Exocórtex"
              aria-label="Abrir chat en el Exocórtex"
              className={cn(styles.bubbleCtrl, "ml-auto")}
            >
              <MessageSquare className="h-3.5 w-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default AuroraSpeechBubble;
