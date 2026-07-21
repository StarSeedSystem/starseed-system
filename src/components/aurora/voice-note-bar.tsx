"use client";

/**
 * VoiceNoteBar — mini reproductor + "Regenerar voz" al pie de cada mensaje de
 * Astraura (Adenda 87 · Misión 1).
 * ---------------------------------------------------------------------------
 * · Si existe una NOTA DE VOZ guardada para el texto del mensaje (el audio real
 *   que sonó, capturado por `voice-notes.ts`), muestra un mini reproductor
 *   elegante: play/pause + duración estimada + icono Volume2.
 * · SIEMPRE ofrece «Regenerar voz» (visible al hover) con selector de motor
 *   (OpenVoice · OmniVoice · Kokoro · Navegador). Al elegir: borra la nota y
 *   pide al motor que hable — los motores NEURALES (OpenVoice/OmniVoice) emiten
 *   el evento `starseed:voice-note`, así que la nota se RE-CAPTURA y se RE-ADJUNTA
 *   sola. Kokoro y el navegador hablan en vivo (no dejan nota: honesto).
 *
 * La nota se liga al mensaje por `voiceTextHash(texto)` — sin ids, sin DDL.
 * SSR-safe, defensivo, nunca lanza al render.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Cloud, Cpu, Loader2, Monitor, Pause, Play, RefreshCw, Volume2, Waves } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  cleanTextForVoiceChain,
  deleteVoiceNote,
  getVoiceNote,
  getVoiceNoteCloud,
  getVoiceNoteDurationMs,
  playVoiceNote,
  stopVoiceNotePlayback,
  voiceNoteHashForMessage,
  VOICE_NOTE_EVENT,
  type VoiceNote,
  type VoiceNotePlayback,
} from "@/lib/aurora/voice-notes";

type RegenEngine = "openvoice2" | "omnivoice" | "kokoro" | "browser";

const ENGINE_OPTIONS: { id: RegenEngine; label: string; hint: string; Icon: typeof Cloud }[] = [
  { id: "openvoice2", label: "OpenVoice", hint: "web gratis + emociones", Icon: Cloud },
  { id: "omnivoice", label: "OmniVoice", hint: "híbrido local ↔ nube", Icon: Waves },
  { id: "kokoro", label: "Kokoro", hint: "local en el navegador", Icon: Cpu },
  { id: "browser", label: "Navegador", hint: "voz del sistema", Icon: Monitor },
];

/** "1:04", "12s" o "~8s" (estimada). */
function formatDur(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s <= 0) return "";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, "0")}`;
}

export interface VoiceNoteBarProps {
  /** Texto EXACTO del mensaje de Astraura (liga la nota por su hash). */
  text: string;
  className?: string;
  /**
   * Conversación a la que pertenece este mensaje (Adenda 87-bis · sync en
   * cuenta). Si el audio no está en ESTA neurona (IndexedDB local), se busca
   * en la nube (`aurora_conversations.meta.voiceNotes`) dentro de este chat —
   * así una neurona distinta de la MISMA CUENTA reproduce el MISMO audio.
   * Opcional: sin `convId` (p.ej. superficies que aún no lo pasan) el
   * comportamiento es el de siempre, solo local.
   */
  convId?: string | null;
}

export function VoiceNoteBar({ text, className, convId }: VoiceNoteBarProps) {
  // Hash CANÓNICO: misma limpieza que la cadena neural (engine.ts), para que la
  // nota case con el mensaje aunque éste lleve markdown.
  const hash = useMemo(() => voiceNoteHashForMessage(text), [text]);
  const spokenText = useMemo(() => cleanTextForVoiceChain(text), [text]);
  const [note, setNote] = useState<VoiceNote | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [regenerating, setRegenerating] = useState<RegenEngine | null>(null);
  const playbackRef = useRef<VoiceNotePlayback | null>(null);

  const reload = useCallback(async () => {
    try {
      let n = await getVoiceNote(hash);
      // Sin audio en ESTA neurona: prueba la referencia en la nube de este chat
      // (Adenda 87-bis). Silencioso si tampoco hay nada allí (mensaje sin voz).
      if (!n && convId) {
        n = await getVoiceNoteCloud(hash, convId);
      }
      setNote(n);
      if (n) {
        const d = await getVoiceNoteDurationMs(hash);
        setDurationMs(d);
      } else {
        setDurationMs(0);
      }
    } catch {
      /* */
    }
  }, [hash, convId]);

  // Carga inicial + re-carga cuando llega un trozo de voz de ESTE mensaje.
  useEffect(() => {
    let alive = true;
    void reload();
    if (typeof window === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onNote = (e: Event) => {
      try {
        const detail = (e as CustomEvent<{ textHash?: string }>).detail;
        if (!detail || detail.textHash !== hash) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          if (alive) void reload();
        }, 300);
      } catch {
        /* */
      }
    };
    window.addEventListener(VOICE_NOTE_EVENT, onNote as EventListener);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      window.removeEventListener(VOICE_NOTE_EVENT, onNote as EventListener);
    };
  }, [hash, reload]);

  // Al desmontar, corta la reproducción de esta barra.
  useEffect(() => {
    return () => {
      try {
        playbackRef.current?.stop();
      } catch {
        /* */
      }
    };
  }, []);

  const resetPlayback = useCallback(() => {
    playbackRef.current = null;
    setPlaying(false);
    setPaused(false);
  }, []);

  const togglePlay = useCallback(async () => {
    // Pausa/reanuda si ya hay reproducción de esta barra.
    if (playbackRef.current) {
      if (paused) {
        playbackRef.current.resume();
        setPaused(false);
      } else {
        playbackRef.current.pause();
        setPaused(true);
      }
      return;
    }
    stopVoiceNotePlayback();
    const ctrl = await playVoiceNote(hash, {
      onEnded: resetPlayback,
      onError: resetPlayback,
    });
    if (ctrl) {
      playbackRef.current = ctrl;
      setPlaying(true);
      setPaused(false);
    }
  }, [hash, paused, resetPlayback]);

  const speakBrowser = useCallback((t: string) => {
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(t);
      u.lang = "es-ES";
      synth.speak(u);
    } catch {
      /* */
    }
  }, []);

  const regenerate = useCallback(
    async (engine: RegenEngine) => {
      if (regenerating) return;
      setRegenerating(engine);
      // Corta lo que suene y borra la nota vieja (se re-adjunta sola si es neural).
      try {
        playbackRef.current?.stop();
      } catch {
        /* */
      }
      resetPlayback();
      stopVoiceNotePlayback();
      try {
        await deleteVoiceNote(hash);
        setNote(null);
        setDurationMs(0);
        // Habla el texto YA LIMPIO (igual que la cadena normal): así la nota que
        // el motor neural re-emite casa con el hash canónico de este mensaje.
        if (engine === "openvoice2" || engine === "omnivoice") {
          // Motor NEURAL: emite `starseed:voice-note` → la captura re-adjunta la nota.
          const { neuralSpeak } = await import("@/lib/aurora/tts-oss/neural-tts");
          await neuralSpeak(engine, spokenText);
        } else if (engine === "kokoro") {
          const { kokoroSpeak } = await import("@/lib/aurora/tts-oss/kokoro");
          await kokoroSpeak(spokenText, { autoDownload: true });
        } else {
          speakBrowser(spokenText);
        }
      } catch {
        /* la cadena de voz nunca debe romper la UI */
      } finally {
        setRegenerating(null);
        // Los trozos neurales pueden seguir llegando: refresca un momento después.
        setTimeout(() => void reload(), 1200);
      }
    },
    [hash, regenerating, resetPlayback, speakBrowser, spokenText, reload],
  );

  const hasAudio = !!note && note.chunks.length > 0;
  const durLabel = durationMs > 0 ? formatDur(durationMs) : "";

  return (
    <div
      className={cn(
        "mt-2 flex items-center gap-2 text-[11px] text-white/45 transition-opacity",
        // Con audio: el reproductor es SIEMPRE visible (el regenerar se revela al
        // pasar el ratón por el mensaje). Sin audio ni regeneración en curso: toda
        // la barra se oculta hasta el hover del mensaje (el burbuja tiene `group`).
        hasAudio || regenerating ? "opacity-100" : "opacity-0 focus-within:opacity-100 group-hover:opacity-100",
        className,
      )}
    >
      {hasAudio && (
        <button
          type="button"
          onClick={() => void togglePlay()}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-sky-400/25 bg-sky-500/10 px-2 py-0.5 text-sky-100/90 transition-colors hover:border-sky-400/45 hover:bg-sky-500/20"
          title={playing && !paused ? "Pausar la nota de voz" : "Reproducir la nota de voz que sonó"}
          aria-label={playing && !paused ? "Pausar nota de voz" : "Reproducir nota de voz"}
        >
          {playing && !paused ? (
            <Pause className="h-3 w-3" />
          ) : (
            <Play className="h-3 w-3" />
          )}
          <Volume2 className="h-3 w-3 text-sky-300/80" />
          {durLabel && <span className="tabular-nums">{durLabel}</span>}
        </button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={!!regenerating}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-white/50 transition-all hover:border-white/25 hover:text-white/80",
              // Con audio, se revela al hover del mensaje; sin audio la barra entera
              // ya está oculta hasta el hover, así que aquí va visible.
              hasAudio && !regenerating ? "opacity-0 group-hover:opacity-100 focus-visible:opacity-100" : "opacity-100",
            )}
            title="Regenerar la voz con otro motor"
          >
            {regenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            <span>{regenerating ? "Regenerando…" : "Regenerar voz"}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="border-white/10 bg-black/90 backdrop-blur-xl">
          <DropdownMenuLabel className="text-[11px] text-white/60">Regenerar voz con…</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-white/10" />
          {ENGINE_OPTIONS.map((opt) => (
            <DropdownMenuItem
              key={opt.id}
              className="cursor-pointer gap-2 text-xs"
              onClick={() => void regenerate(opt.id)}
            >
              <opt.Icon className="h-3.5 w-3.5 text-sky-300/80" />
              <span className="font-medium text-white/85">{opt.label}</span>
              <span className="ml-auto pl-3 text-[10px] text-white/40">{opt.hint}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default VoiceNoteBar;
