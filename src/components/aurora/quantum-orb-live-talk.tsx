"use client";

/**
 * StarSeed OS — Charla en Directo de la Orbe Cuántica (QuantumOrbLiveTalk)
 * ============================================================================
 * QUÉ ES: un panel compacto, anclado a la orbe GLOBAL de Aurora, que sostiene
 * una conversación CONTINUA y MANOS LIBRES — escucha, transcribe, responde
 * (voz + texto) y vuelve a escuchar sola, sin que el usuario pulse nada entre
 * turnos. Es la reconstrucción — mejorada — de la «charla en directo» que el
 * Astraura original ofrecía desde su orbe (`QuantumVoiceOrbWidget.jsx`): modo
 * conversación manos libres con medio-dúplex real (Aurora nunca se autoescucha).
 *
 * DE DÓNDE VIENE: el original mezclaba UI, reconocimiento y síntesis en un
 * único componente. Aquí NO se reescribe nada de eso: StarSeed OS ya tiene, en
 * `src/lib/aurora/engine.ts`, un motor de voz supervisado con el MISMO bucle
 * manos-libres y un medio-dúplex REAL (mientras Aurora habla, el reconocimiento
 * se DETIENE, no solo se ignora — ver `markTtsSpeaking`/`pausedForTtsRef`/
 * `finishTts`), más guardas anti-bucle (backoff, watchdog, singleton de
 * reconocimiento) en `aurora-provider.tsx`. Este panel es SOLO una superficie
 * nueva sobre ese motor: no crea un segundo `SpeechRecognition` ni un segundo
 * `speechSynthesis` — usa exclusivamente `useAurora()`, el mismo puente
 * supervisado que ya usan `aurora-widget.tsx` y el chat completo del Exocórtex.
 *
 * QUÉ SE REUTILIZA (en vez de reinventarse):
 *   · Reconocimiento + síntesis + medio-dúplex → `useAurora()` (engine.ts vía
 *     aurora-provider.tsx): `start/stop/engage/disengage/interrupt/speak`.
 *     `engage()+start()` YA implementan el ciclo escuchar→transcribir→
 *     responder→hablar→volver a escuchar; este panel no orquesta turnos, solo
 *     los REFLEJA con honestidad.
 *   · Micrófono para el VISUALIZADOR de la orbe (nivel real, no inventado) →
 *     el analizador COMPARTIDO con refcount de `aurora-orb-bus.ts`
 *     (`acquireMicAnalyser`), el mismo que ya usa `aurora-orb.tsx` — nunca un
 *     `getUserMedia` paralelo (eso es justo lo que rompía el reconocimiento en
 *     el pasado, según los propios comentarios del bus).
 *   · Pulso de habla, para animar la orbe mientras Aurora suena (el `<audio>`/
 *     TTS no expone amplitud) → `subscribeAuroraSpeak` (evento `aurora:speak`,
 *     fases start/boundary/end), también de `aurora-orb-bus.ts`.
 *   · Detección de cambio de personalidad A MITAD de una respuesta (diálogo
 *     coral del enjambre 1.58-bit) → `createStreamingVoice`/`onPersonaChange`
 *     de `streaming-voice.ts`, aplicado al texto YA recibido (el audio ya lo
 *     reprodujo `engine.ts` con su propio medio-dúplex; aquí se usa SOLO para
 *     detectar y reflejar el cambio — nunca para volver a hablar).
 *   · Colores/nombre por personalidad → `resolveQuantumOrbTheme`
 *     (`quantum-orb-theme.ts`), el mismo vocabulario que pinta `<QuantumOrb>`.
 *   · Lenguaje visual y honestidad de fuente («ninguna IA real respondió») →
 *     ideas de `astraura/window/live-talk.tsx` («Hablar en Vivo» por entidad),
 *     adaptadas aquí a la orbe GLOBAL: sin forzar ninguna personalidad ni
 *     fuente — usa el mismo enrutado que el resto de Aurora.
 *
 * QUÉ SE MEJORA respecto al original:
 *   · Estado SIEMPRE honesto y con motivo accionable: sin micrófono, permiso
 *     denegado, navegador sin reconocimiento, o ninguna fuente de IA real
 *     respondiendo — nunca se finge que escucha si no puede.
 *   · La orbe CUÁNTICA (`<QuantumOrb>`) reacciona con nivel de audio REAL (mic
 *     mientras escucha, pulso de habla mientras suena) y con el color de quien
 *     esté hablando — y además emite ese estado por `quantum-orb-bus.ts`
 *     (`emitQuantumOrbState/Level/Persona`), el canal ya pensado para que
 *     cualquier otra superficie lo refleje también, sin inventar uno nuevo.
 *   · Silenciar la voz sin cortar la conversación: el texto sigue llegando y
 *     el ciclo manos-libres continúa; solo se calla el audio.
 *   · «Cállate y escúchame»: interrumpe la respuesta actual sin cerrar el
 *     panel ni perder la sesión.
 *
 * LIMPIEZA: cada efecto que abre un temporizador/intervalo/suscripción se
 * cierra en su propio `return`. Al desmontar se suelta el analizador de
 * micrófono, se cancela el intervalo del nivel, se da de baja `aurora:speak` y
 * se emite un último `idle`/`0` al bus para no dejar a ningún oyente pensando
 * que la orbe sigue activa. Cerrar el panel NO apaga la voz global de Aurora
 * (igual que el popover del orbe): solo «Detener conversación» lo hace,
 * exactamente como distingue el propio encargo entre ambos controles.
 */

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  X,
  PhoneCall,
  PhoneOff,
  Square,
  Volume2,
  VolumeX,
  Loader2,
  AlertTriangle,
  RotateCcw,
  Mic,
  MessageSquare,
  AudioLines,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAurora } from "./aurora-provider";
import { QuantumOrb } from "./quantum-orb";
import { MessageRenderer } from "./message-renderer";
import { getCapabilities, voiceModeChipLabel } from "@/lib/aurora/capabilities";
import { usePerimeter } from "@/context/perimeter-context";
import {
  AURORA_EXOCORTEX_OPEN_EVENT,
  acquireMicAnalyser,
  subscribeAuroraSpeak,
  type MicAnalyser,
} from "@/lib/aurora/aurora-orb-bus";
import { resolveQuantumOrbTheme } from "@/lib/aurora/quantum-orb-theme";
import {
  emitQuantumOrbLevel,
  emitQuantumOrbPersona,
  emitQuantumOrbState,
  type QuantumOrbVoiceState,
} from "@/lib/aurora/quantum-orb-bus";
import { createStreamingVoice, type StreamingVoicePersona } from "@/lib/aurora/streaming-voice";
import type { AuroraMessageMeta, ConversationEntry, SttFatal } from "@/lib/aurora/engine";

export interface QuantumOrbLiveTalkProps {
  /** Cierra el panel. NO detiene la sesión de voz (ver cabecera): eso es «Detener conversación». */
  onClose: () => void;
}

// ── Referencia estable (evita que efectos dependientes de `conversation` se
//    re-disparen por una nueva referencia de array vacío en cada render). ──
const EMPTY_CONVERSATION: ConversationEntry[] = [];

const BASE_BTN =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-[12px] font-medium transition cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300/80";
const ICON_BTN =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-white/70 transition hover:bg-white/10 hover:text-white cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300/80 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-white/[0.03] disabled:hover:text-white/70";

const TONE_CLASS: Record<"cyan" | "amber" | "violet", string> = {
  cyan: "border-cyan-400/30 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20",
  amber: "border-amber-400/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20",
  violet: "border-violet-400/30 bg-violet-500/10 text-violet-100 hover:bg-violet-500/20",
};

type LiveTalkPhase =
  | "unsupported"
  | "unavailable"
  | "needs-mic"
  | "no-stt"
  | "idle"
  | "listening"
  | "user-speaking"
  | "thinking"
  | "speaking";

/** Traduce el estado honesto del panel al vocabulario del bus de la orbe cuántica. */
function busStateFor(phase: LiveTalkPhase): QuantumOrbVoiceState {
  switch (phase) {
    case "unsupported":
    case "unavailable":
      return "error";
    case "listening":
      return "listening";
    case "user-speaking":
      return "user_speaking";
    case "thinking":
      return "thinking";
    case "speaking":
      return "speaking";
    default:
      return "idle";
  }
}

/** Motivo humano y honesto del fallo fatal del reconocimiento (ver `engine.ts::SttFatal`). */
function sttFatalReason(fatal: SttFatal | null): string {
  switch (fatal) {
    case "not-allowed":
    case "service-not-allowed":
      return "El navegador denegó (o aún no concedió) el permiso de micrófono.";
    case "audio-capture":
      return "El micrófono está ocupado por otra aplicación o pestaña, o no se encuentra.";
    case "failed":
      return "El reconocimiento de voz falló varias veces seguidas y se detuvo para no quedarse en bucle.";
    default:
      return "La voz dejó de responder por un motivo que no pudimos identificar.";
  }
}

function replyNotice(meta: AuroraMessageMeta | undefined): string | null {
  if (meta?.local) {
    return "Ninguna fuente de inteligencia real respondió esta vez: es una respuesta local honesta (sin IA).";
  }
  return null;
}

function providerCaption(meta: AuroraMessageMeta | undefined): string | null {
  if (!meta || meta.local || !meta.provider) return null;
  return meta.model ? `vía ${meta.provider} · ${meta.model}` : `vía ${meta.provider}`;
}

/** Quita acentos/símbolos para comparar nombres de cabecera con temas de personalidad. */
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Resuelve el nombre de una cabecera (`### 💬 [Nombre]:`) a una personalidad
 * SOLO si de verdad se reconoce (comparado contra `resolveQuantumOrbTheme`,
 * que ya conoce todas las personalidades e alias reales). Un título de sección
 * cualquiera («### Instalación: pasos») cae en el "aurora" por defecto de
 * `resolveQuantumOrbTheme`, pero al no PARECERSE a "aurora" se rechaza aquí —
 * así nunca se lee como un cambio de personalidad fantasma.
 */
function resolvePersonaFromHeader(rawName: string): StreamingVoicePersona | null {
  const target = normalizeForMatch(rawName);
  if (target.length < 3) return null;
  const theme = resolveQuantumOrbTheme(rawName);
  const candidates = [theme.id, theme.name, theme.shortName].map(normalizeForMatch);
  const matches = candidates.some((c) => c.length > 0 && (c.includes(target) || target.includes(c)));
  if (!matches) return null;
  return { id: theme.id, name: theme.shortName || theme.name };
}

function dedupeConsecutivePersonas(list: StreamingVoicePersona[]): StreamingVoicePersona[] {
  const out: StreamingVoicePersona[] = [];
  for (const p of list) {
    if (out.length === 0 || out[out.length - 1].id !== p.id) out.push(p);
  }
  return out;
}

/** Una burbuja de la transcripción (turno de usuario o de Aurora). */
function TurnBubble({ entry, personaId }: { entry: ConversationEntry; personaId: string }) {
  const isUser = entry.role === "user";
  const notice = isUser ? null : replyNotice(entry.meta);
  const caption = isUser ? null : providerCaption(entry.meta);
  return (
    <div
      className={cn(
        "max-w-[90%] rounded-2xl border px-3 py-2 text-[12px] leading-relaxed",
        isUser
          ? "ml-auto rounded-tr-sm border-white/10 bg-white/[0.06] text-white/90"
          : "mr-auto rounded-tl-sm border-cyan-400/20 bg-cyan-500/[0.05] text-white/90",
      )}
    >
      <MessageRenderer text={entry.text} compact={isUser} personalityId={isUser ? undefined : personaId} />
      {caption && <p className="mt-1 text-[9px] uppercase tracking-wide text-white/30">{caption}</p>}
      {notice && (
        <p className="mt-1.5 flex items-start gap-1 border-t border-amber-400/20 pt-1.5 text-[10px] leading-snug text-amber-200/85">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" /> {notice}
        </p>
      )}
    </div>
  );
}

export function QuantumOrbLiveTalk({ onClose }: QuantumOrbLiveTalkProps) {
  const aurora = useAurora();
  const { setActiveEdge } = usePerimeter();
  const reduced = useReducedMotion();

  const [muted, setMuted] = useState(false);
  const [level, setLevel] = useState(0);
  const [replyPersonas, setReplyPersonas] = useState<StreamingVoicePersona[]>([]);

  const lastProcessedAuroraAtRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // ── Derivados defensivos: `aurora` puede ser null si no hay provider montado
  //    (no debería pasar nunca dentro del árbol de AuroraWidget, pero el propio
  //    `aurora-widget.tsx` degrada igual — se replica el mismo cuidado aquí). ──
  const supported = aurora?.supported ?? false;
  const capabilities = aurora?.capabilities ?? getCapabilities();
  const engaged = aurora?.engaged ?? false;
  const speaking = aurora?.speaking ?? false;
  const thinking = aurora?.thinking ?? false;
  const interim = aurora?.interim ?? "";
  const voiceUnavailable = aurora?.voiceUnavailable ?? false;
  const conversation = aurora?.conversation ?? EMPTY_CONVERSATION;
  const sttFatal = aurora?.sttFatal ?? null;
  const basePersonaId = (aurora?.activePersonality as { id?: string; name?: string } | undefined)?.id || "aurora";

  const noStt = !capabilities.hasSpeechRecognition;
  const needsMic =
    !voiceUnavailable &&
    capabilities.hasSpeechRecognition &&
    capabilities.isSecureContext &&
    (capabilities.voiceMode !== "full" || (capabilities.isMobile && capabilities.micPermission !== "granted"));

  // Estado honesto del panel. Se apoya en `engaged` (modo activo del motor,
  // estable) y NO en el `listening` crudo (que parpadea internamente durante
  // los reinicios del reconocimiento) — el mismo motivo por el que
  // `aurora-widget.tsx` estabiliza sus propios flags visuales.
  const phase: LiveTalkPhase = !supported
    ? "unsupported"
    : voiceUnavailable
      ? "unavailable"
      : speaking
        ? "speaking"
        : thinking
          ? "thinking"
          : engaged
            ? (interim ? "user-speaking" : "listening")
            : needsMic
              ? "needs-mic"
              : noStt
                ? "no-stt"
                : "idle";

  const effectivePersonaId = replyPersonas.length > 0 ? replyPersonas[replyPersonas.length - 1].id : basePersonaId;
  const theme = resolveQuantumOrbTheme(effectivePersonaId);
  const levelSource: "mic" | "speak-pulse" | "none" =
    phase === "listening" || phase === "user-speaking" ? "mic" : phase === "speaking" ? "speak-pulse" : "none";

  // ── Medio-dúplex "silenciar": el motor no tiene un mute nativo (siempre
  //    empareja `pushReply`+`speak`), así que interceptamos aquí en cuanto
  //    `speaking` se enciende y cancelamos con `aurora.interrupt()` — la MISMA
  //    función saneada que usa el resto del OS para el barge-in, que además
  //    reanuda la escucha sola (medio-dúplex intacto). Puede sonar una
  //    fracción de segundo antes de cortar: es el límite honesto de no tocar
  //    el motor de voz. El texto sigue llegando igual. ──
  useEffect(() => {
    if (!aurora) return;
    if (muted && speaking) {
      try {
        aurora.interrupt();
      } catch {
        /* defensivo */
      }
    }
  }, [aurora, muted, speaking]);

  // ── Detecta cambios de personalidad A MITAD de la última respuesta de
  //    Aurora, reutilizando streaming-voice.ts (onPersonaChange) sobre el
  //    texto YA recibido — no se vuelve a hablar aquí, el motor ya lo hizo. ──
  useEffect(() => {
    const last = conversation[conversation.length - 1];
    if (!last || last.role !== "aurora") return;
    if (lastProcessedAuroraAtRef.current === last.at) return;
    lastProcessedAuroraAtRef.current = last.at;

    const seen: StreamingVoicePersona[] = [];
    const sv = createStreamingVoice({
      speak: () => {
        /* no-op deliberado: el audio de esta respuesta ya sonó vía engine.ts */
      },
      onPersonaChange: (persona) => seen.push(persona),
      resolvePersona: resolvePersonaFromHeader,
    });
    sv.feed(last.text);
    sv.flush();
    setReplyPersonas(seen);
  }, [conversation]);

  // Un turno nuevo empieza: suelta la insignia de personalidad de la respuesta anterior.
  useEffect(() => {
    if (thinking) setReplyPersonas([]);
  }, [thinking]);

  // ── Nivel real para la orbe: mic compartido (refcount) mientras escucha,
  //    pulso decreciente sobre `aurora:speak` mientras habla. Ambos, cero
  //    getUserMedia nuevo — reutiliza exactamente lo que ya expone el bus. ──
  useEffect(() => {
    let cancelled = false;
    let micHandle: MicAnalyser | null = null;
    let unsubSpeak: (() => void) | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;

    const publish = (v: number) => {
      if (cancelled) return;
      setLevel(v);
      emitQuantumOrbLevel(v);
    };

    if (levelSource === "mic") {
      void acquireMicAnalyser().then((handle) => {
        if (cancelled) {
          handle?.stop();
          return;
        }
        micHandle = handle;
        if (!micHandle) {
          publish(0); // degradado con gracia: sin analizador disponible, nivel plano honesto
          return;
        }
        const active = micHandle;
        timer = setInterval(() => publish(active.read().level), 80);
      });
    } else if (levelSource === "speak-pulse") {
      let target = 0.55;
      let current = 0;
      unsubSpeak = subscribeAuroraSpeak((p) => {
        if (p === "start") target = 0.62;
        else if (p === "boundary") target = 0.4 + Math.random() * 0.35;
        else target = 0;
      });
      timer = setInterval(() => {
        current += (target - current) * 0.35;
        publish(Math.max(0, Math.min(1, current)));
      }, 80);
    } else {
      publish(0);
    }

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      micHandle?.stop();
      unsubSpeak?.();
    };
  }, [levelSource]);

  // ── Bus de la orbe cuántica: estado + personalidad activa (el nivel ya se
  //    emite arriba, junto a su propio muestreo). Canal existente, aditivo. ──
  useEffect(() => {
    emitQuantumOrbState(busStateFor(phase));
  }, [phase]);
  useEffect(() => {
    emitQuantumOrbPersona(effectivePersonaId);
  }, [effectivePersonaId]);
  useEffect(
    () => () => {
      // Cortesía al desmontar: que ningún oyente del bus quede pensando que la orbe sigue activa.
      emitQuantumOrbState("idle");
      emitQuantumOrbLevel(0);
    },
    [],
  );

  // Escape cierra el panel; el foco entra en el diálogo al abrirse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Autoscroll de la transcripción con cada turno/parcial nuevo.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [conversation, interim, thinking]);

  // ── Controles ──
  const startSession = useCallback(() => {
    if (!aurora) return;
    if (voiceUnavailable) {
      aurora.retryVoice();
      aurora.engage();
      return;
    }
    if (needsMic) {
      void aurora.requestAccess().then(() => {
        try {
          aurora.engage();
        } catch {
          /* defensivo */
        }
      });
      return;
    }
    try {
      aurora.start();
    } catch {
      /* defensivo */
    }
    try {
      aurora.engage();
    } catch {
      /* defensivo */
    }
  }, [aurora, voiceUnavailable, needsMic]);

  const stopSession = useCallback(() => {
    if (!aurora) return;
    try {
      aurora.disengage();
    } catch {
      /* defensivo */
    }
  }, [aurora]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      if (next && aurora?.speaking) {
        try {
          aurora.interrupt();
        } catch {
          /* defensivo */
        }
      }
      toast(next ? "Voz de Aurora silenciada — sigue respondiendo por texto." : "Voz de Aurora activada de nuevo.");
      return next;
    });
  }, [aurora]);

  const interruptNow = useCallback(() => {
    if (!aurora) return;
    try {
      aurora.interrupt();
    } catch {
      /* defensivo */
    }
  }, [aurora]);

  const openTextChatFallback = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      setActiveEdge("zenith");
    } catch {
      /* defensivo */
    }
    try {
      window.dispatchEvent(new CustomEvent(AURORA_EXOCORTEX_OPEN_EVENT));
    } catch {
      /* defensivo */
    }
    onClose();
  }, [setActiveEdge, onClose]);

  if (!aurora) return null;

  // ── Render-prep: solo usados en el JSX, ningún efecto depende de ellos ──
  interface PrimaryAction {
    label: string;
    Icon: ComponentType<{ className?: string }>;
    onClick: () => void;
    tone: "cyan" | "amber" | "violet";
  }
  const primaryAction: PrimaryAction =
    phase === "unsupported" || phase === "no-stt"
      ? { label: "Escríbeme por el chat", Icon: MessageSquare, onClick: openTextChatFallback, tone: "violet" }
      : phase === "unavailable"
        ? { label: "Reintentar la voz", Icon: RotateCcw, onClick: startSession, tone: "amber" }
        : phase === "needs-mic"
          ? { label: "Dar permiso de micrófono", Icon: Mic, onClick: startSession, tone: "amber" }
          : engaged
            ? { label: "Detener conversación", Icon: PhoneOff, onClick: stopSession, tone: "amber" }
            : { label: "Iniciar conversación", Icon: PhoneCall, onClick: startSession, tone: "cyan" };

  const honestyMessage: string | null =
    phase === "unsupported"
      ? `Tu navegador no soporta reconocimiento de voz.${capabilities.note ? ` ${capabilities.note}` : ""}`
      : phase === "no-stt"
        ? capabilities.note || "Este navegador no reconoce voz; puedo seguir hablándote y escribiéndote."
        : phase === "unavailable"
          ? sttFatalReason(sttFatal)
          : phase === "needs-mic"
            ? "Falta el permiso del micrófono para escucharte — sin él no puedo iniciar la escucha."
            : null;

  const statusLabel =
    phase === "unsupported"
      ? "Voz no soportada en este navegador"
      : phase === "unavailable"
        ? "Voz no disponible"
        : phase === "needs-mic"
          ? "Falta el permiso de micrófono"
          : phase === "no-stt"
            ? "Solo texto · te hablo"
            : phase === "speaking"
              ? muted
                ? "Hablando (silenciada)…"
                : "Hablando…"
              : phase === "thinking"
                ? "Pensando…"
                : phase === "user-speaking"
                  ? "Te escucho…"
                  : phase === "listening"
                    ? "Escuchando…"
                    : "Sesión detenida";

  const visiblePersonas = dedupeConsecutivePersonas(replyPersonas);
  const recentTurns = conversation.slice(-8);

  return (
    <>
      <motion.button
        type="button"
        aria-label="Cerrar charla en directo"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduced ? 0 : 0.18 }}
        className="fixed inset-0 z-[92] cursor-default backdrop-blur-sm"
        style={{
          background: "radial-gradient(120% 120% at 50% 60%, rgba(8,12,20,0.45) 0%, rgba(4,7,13,0.72) 100%)",
        }}
      />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quantum-orb-live-talk-title"
        ref={panelRef}
        tabIndex={-1}
        initial={{ opacity: 0, y: reduced ? 0 : 24, scale: reduced ? 1 : 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: reduced ? 0 : 16, scale: 0.97 }}
        transition={
          reduced
            ? { duration: 0.12 }
            : { type: "spring", stiffness: 320, damping: 30 }
        }
        className="fixed inset-x-3 bottom-3 z-[93] mx-auto flex max-h-[min(34rem,86dvh)] w-[min(26rem,calc(100vw-24px))] flex-col overflow-hidden rounded-[26px] border border-white/10 shadow-2xl shadow-black/50 backdrop-blur-2xl outline-none sm:inset-x-auto sm:bottom-6 sm:right-6"
        style={{
          background:
            "radial-gradient(140% 80% at 18% -8%, rgba(159,232,112,0.10), transparent 60%), radial-gradient(150% 90% at 110% 0%, rgba(201,168,255,0.10), transparent 55%), rgba(9,13,18,0.94)",
        }}
      >
        {/* Filo aurora superior (lenguaje del resto del orbe). */}
        <div
          aria-hidden="true"
          className="h-[2px] w-full shrink-0 bg-gradient-to-r from-[#9FE870] via-[#6FE6D6] to-[#C9A8FF] opacity-80 shadow-[0_0_14px_rgba(111,230,214,0.55)]"
        />

        {/* Cabecera */}
        <div className="flex items-center gap-2.5 border-b border-white/10 p-3.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-tr from-fuchsia-500 to-cyan-500">
            <AudioLines className="h-4 w-4 text-white" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="quantum-orb-live-talk-title" className="text-[13px] font-semibold leading-tight text-white">
              Charla en directo
            </h2>
            <p aria-live="polite" className="truncate text-[10.5px] text-white/55">
              {statusLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar charla en directo"
            title="Cerrar"
            className={cn(ICON_BTN, "h-8 w-8")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Orbe + personalidad activa */}
        <div className="flex flex-col items-center gap-2 px-4 py-4">
          <div className="relative grid place-items-center" style={{ width: 92, height: 92 }}>
            <div
              aria-hidden="true"
              className="absolute inset-0 rounded-full blur-xl transition-opacity duration-500"
              style={{
                background: theme.glow,
                opacity: phase === "speaking" || phase === "listening" || phase === "user-speaking" ? 0.55 : 0.2,
              }}
            />
            <QuantumOrb
              personaId={effectivePersonaId}
              state={busStateFor(phase)}
              level={level}
              size={92}
              trail={!reduced}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: theme.primary, boxShadow: `0 0 6px ${theme.primary}` }}
              aria-hidden="true"
            />
            <span className="text-[11px] font-medium text-white/80">{theme.shortName || theme.name}</span>
          </div>
          {visiblePersonas.length > 1 && (
            <p className="flex flex-wrap items-center justify-center gap-1 px-2 text-center text-[10px] text-white/45">
              <span className="uppercase tracking-wide text-white/35">Cambió de voz en esta respuesta:</span>
              {visiblePersonas.map((p, i) => {
                const t = resolveQuantumOrbTheme(p.id);
                return (
                  <span key={`${p.id}-${i}`} className="inline-flex items-center gap-1">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: t.primary, boxShadow: `0 0 6px ${t.primary}` }}
                      aria-hidden="true"
                    />
                    {t.shortName || t.name}
                    {i < visiblePersonas.length - 1 && <span className="text-white/25">→</span>}
                  </span>
                );
              })}
            </p>
          )}
          {capabilities.voiceMode !== "full" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[9px] uppercase tracking-wide text-white/45">
              {voiceModeChipLabel(capabilities.voiceMode)}
            </span>
          )}
        </div>

        {honestyMessage && (
          <div className="mx-3.5 mb-2 flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-500/[0.06] px-3 py-2 text-[11px] leading-relaxed text-amber-100/90">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{honestyMessage}</span>
          </div>
        )}

        {/* Transcripción en vivo */}
        <div
          ref={scrollRef}
          role="log"
          aria-live="polite"
          aria-atomic="false"
          aria-label="Transcripción de la conversación en vivo"
          className="mx-3.5 mb-3 min-h-[160px] flex-1 space-y-2 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-2.5"
        >
          {recentTurns.length === 0 && !interim && !thinking && !honestyMessage && (
            <p className="py-6 text-center text-[11px] text-white/35">
              {engaged
                ? "Aún no ha empezado la conversación. Habla cuando quieras — no hace falta pulsar nada."
                : "Aún no ha empezado la conversación. Pulsa «Iniciar conversación» y habla cuando quieras."}
            </p>
          )}
          {recentTurns.map((entry, i) => (
            <TurnBubble key={`${entry.at}-${entry.role}-${i}`} entry={entry} personaId={effectivePersonaId} />
          ))}
          {interim && (
            <div className="ml-auto max-w-[90%] rounded-2xl rounded-tr-sm border border-cyan-400/10 bg-cyan-500/[0.03] px-3 py-2 text-[12px] italic text-white/50">
              {interim}
            </div>
          )}
          {thinking && (
            <div className="mr-auto flex max-w-[90%] items-center gap-1.5 rounded-2xl rounded-tl-sm border border-cyan-400/20 bg-cyan-500/[0.05] px-3 py-2 text-[12px] text-white/55">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Pensando…
            </div>
          )}
        </div>

        {/* Controles */}
        <div className="flex items-center gap-2 border-t border-white/10 p-3">
          <button
            type="button"
            onClick={primaryAction.onClick}
            className={cn(BASE_BTN, "flex-1", TONE_CLASS[primaryAction.tone])}
          >
            <primaryAction.Icon className="h-4 w-4" />
            {primaryAction.label}
          </button>

          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? "Activar la voz de Aurora" : "Silenciar la voz de Aurora"}
            aria-pressed={muted}
            title={muted ? "Sonido silenciado — el texto sigue llegando" : "Silenciar la voz (el texto sigue llegando)"}
            className={cn(ICON_BTN, muted && "border-violet-400/40 bg-violet-500/15 text-violet-100")}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={interruptNow}
            disabled={!speaking}
            aria-label="Interrumpir la respuesta actual"
            title="Cállate y escúchame"
            className={cn(ICON_BTN, speaking && "border-rose-400/40 text-rose-200 hover:bg-rose-500/20")}
          >
            <Square className="h-4 w-4" />
          </button>
        </div>
      </motion.div>
    </>
  );
}

export default QuantumOrbLiveTalk;
