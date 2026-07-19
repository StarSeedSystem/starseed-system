"use client";

/**
 * StarSeed OS — BOTONES de VOZ de chat (Agente S1)
 * ============================================================================
 * Dos botones COMPARTIDOS por las tres superficies de chat de Astraura
 * (Exocórtex, `/agent` Nexus y mini-reproductor de la orbe):
 *
 *   · Micrófono (dictado) — reutiliza `startDictation` (el MISMO STT que la
 *     orbe, con corrección fonética de términos StarSeed). Rellena el campo por
 *     `onInterim` y entrega la frase final por `onFinal` (la superficie decide
 *     si envía). Estado visual activo mientras escucha.
 *   · Altavoz (voz de respuesta) — TOGGLE de `meta.config.voice` del chat vía
 *     `patchChatConfig`. `speakAuroraReply` (pipeline compartido) ya lo respeta:
 *     al activarlo, la PRÓXIMA respuesta se lee en voz alta con la personalidad.
 *
 * Es el punto ÚNICO de "mic + voz" del chat: `/agent` unifica aquí su mic propio.
 * Filosofía del repo: cursor-pointer, sin emojis-icono (lucide-react),
 * transiciones 150–300ms, SSR-safe, nunca lanza.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Mic, Square, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  startDictation,
  isDictationSupported,
  type DictationHandle,
} from "@/lib/aurora/dictation";
import { getChatConfig } from "@/lib/aurora/turn";
import { patchChatConfig } from "@/lib/aurora/config-change";
import { AI_CONV_CHANGE_EVENT } from "@/lib/aurora/conversations";

export interface ChatVoiceButtonsProps {
  /** Chat activo (para leer/escribir `meta.config.voice`). */
  convId?: string | null;
  /** Texto parcial del dictado (previsualización en el campo). */
  onInterim?: (text: string) => void;
  /** Frase final del dictado (la superficie decide si envía o sólo rellena). */
  onFinal?: (text: string) => void;
  /** Mostrar el botón de micrófono (por defecto true). */
  showMic?: boolean;
  /** Mostrar el toggle de voz de respuesta (por defecto true). */
  showSpeaker?: boolean;
  /** Idioma BCP-47 del dictado (por defecto "es-ES"). */
  lang?: string;
  className?: string;
  /** Clase de cada botón (para encajar en cada composer). */
  buttonClassName?: string;
}

export function ChatVoiceButtons({
  convId,
  onInterim,
  onFinal,
  showMic = true,
  showSpeaker = true,
  lang,
  className,
  buttonClassName,
}: ChatVoiceButtonsProps) {
  const [listening, setListening] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const dictRef = useRef<DictationHandle | null>(null);

  // Refleja el estado de voz del chat (menú, otros dispositivos, config-change).
  useEffect(() => {
    const read = () => {
      try { setVoiceOn(getChatConfig(convId).voice !== false); } catch { setVoiceOn(true); }
    };
    read();
    if (typeof window === "undefined") return;
    window.addEventListener(AI_CONV_CHANGE_EVENT, read);
    return () => window.removeEventListener(AI_CONV_CHANGE_EVENT, read);
  }, [convId]);

  // Detiene el dictado al desmontar (evita reconocedores colgados).
  useEffect(() => () => { try { dictRef.current?.stop(); } catch { /* */ } }, []);

  const toggleMic = useCallback(() => {
    if (dictRef.current?.active()) {
      try { dictRef.current.stop(); } catch { /* */ }
      dictRef.current = null;
      setListening(false);
      return;
    }
    if (!isDictationSupported()) {
      toast.error("Tu navegador no soporta dictado por voz.");
      return;
    }
    setListening(true);
    dictRef.current = startDictation({
      lang,
      onInterim: (t) => onInterim?.(t),
      onFinal: (t) => {
        setListening(false);
        dictRef.current = null;
        onFinal?.(t);
      },
      onEnd: () => { setListening(false); dictRef.current = null; },
      onError: (m) => { setListening(false); dictRef.current = null; toast.error(m); },
    });
  }, [lang, onInterim, onFinal]);

  const toggleSpeaker = useCallback(() => {
    const next = !voiceOn;
    setVoiceOn(next); // optimista
    void patchChatConfig(convId, { voice: next });
    toast.success(
      next
        ? "Voz activada: la próxima respuesta se leerá en voz alta."
        : "Voz desactivada para este chat.",
    );
  }, [voiceOn, convId]);

  const baseBtn =
    "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors duration-200";
  // `buttonClassName` REEMPLAZA el tamaño/estilo por defecto (evita conflicto de
  // utilidades size-*). Sin él, botones de 36px (size-9).
  const sizeCls = buttonClassName || "size-9";

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {showMic && (
        <button
          type="button"
          onClick={toggleMic}
          title={listening ? "Detener dictado" : "Dictar por voz"}
          aria-label={listening ? "Detener dictado" : "Dictar por voz"}
          aria-pressed={listening}
          className={cn(
            baseBtn,
            sizeCls,
            listening
              ? "animate-pulse border-cyan-400/50 bg-cyan-500/20 text-cyan-200"
              : "border-white/12 bg-white/[0.03] text-white/70 hover:border-white/25 hover:text-white",
          )}
        >
          {listening ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>
      )}
      {showSpeaker && (
        <button
          type="button"
          onClick={toggleSpeaker}
          title={voiceOn ? "Voz de respuesta activada — silenciar" : "Voz de respuesta silenciada — activar"}
          aria-label={voiceOn ? "Silenciar voz de respuesta" : "Activar voz de respuesta"}
          aria-pressed={voiceOn}
          className={cn(
            baseBtn,
            sizeCls,
            voiceOn
              ? "border-fuchsia-400/40 bg-fuchsia-500/15 text-fuchsia-100"
              : "border-white/12 bg-white/[0.03] text-white/45 hover:border-white/25 hover:text-white/70",
          )}
        >
          {voiceOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}

export default ChatVoiceButtons;
