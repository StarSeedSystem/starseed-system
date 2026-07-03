"use client";

/**
 * aurora-guide-voice — puente DEFENSIVO a Aurora para la guía + comandos de voz.
 * ----------------------------------------------------------------------------
 * NO importa el provider ni el motor de Aurora. Habla con ella únicamente por el
 * puente global `window.STARSEED_AURORA` (que el provider ya publica) y degrada
 * en silencio si aún no está montado. El motor de voz ya arranca solo en 2º
 * plano; aquí SOLO usamos:
 *   · speak(text)      → narrar un paso (si el usuario eligió modo voz).
 *   · setEnabled(bool) → encender/apagar Aurora globalmente (mute duro).
 *   · getState()       → leer { transcript, speaking, enabled } para detectar
 *                        comandos de voz simples ("siguiente"/"continúa"/…).
 *   · requestAccess()  → pedir micrófono desde un gesto (modo voz).
 *   · start()          → asegurar la escucha continua en modo voz.
 *
 * Todo pasa por try/catch y comprobaciones de tipo: si el método no existe,
 * simplemente no se hace nada.
 */

// Forma mínima del puente que consumimos (subconjunto de la API v5 del provider).
type AuroraBridgeLite = {
  speak?: (text: string) => void;
  toggle?: () => void;
  start?: () => void;
  stop?: () => void;
  setEnabled?: (v: boolean) => void;
  interrupt?: () => void;
  pauseSpeech?: () => void;
  resumeSpeech?: () => void;
  requestAccess?: (opts?: { wantFullscreen?: boolean }) => unknown;
  getState?: () => {
    enabled?: boolean;
    speaking?: boolean;
    listening?: boolean;
    transcript?: string;
    interim?: string;
  } | null;
};

/** Devuelve el puente global de Aurora, o null si no está disponible. */
export function auroraBridge(): AuroraBridgeLite | null {
  if (typeof window === "undefined") return null;
  try {
    const api = (window as unknown as { STARSEED_AURORA?: AuroraBridgeLite }).STARSEED_AURORA;
    return api && typeof api === "object" ? api : null;
  } catch {
    return null;
  }
}

/** ¿Está el puente listo para hablar? */
export function auroraCanSpeak(): boolean {
  const api = auroraBridge();
  return !!api && typeof api.speak === "function";
}

/** Hace hablar a Aurora (TTS). No-op defensivo si no hay puente. */
export function auroraSpeak(text: string): void {
  const t = (text ?? "").trim();
  if (!t) return;
  try {
    const api = auroraBridge();
    api?.speak?.(t);
  } catch {
    /* fail-open */
  }
}

/** Corta de inmediato lo que Aurora esté diciendo (para el "mute"). */
export function auroraStopSpeaking(): void {
  try {
    auroraBridge()?.interrupt?.();
  } catch {
    /* */
  }
  // Refuerzo por si el motor no expusiera interrupt: cancela la síntesis nativa.
  try {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  } catch {
    /* */
  }
}

/** Enciende/apaga Aurora globalmente (mute duro que persiste en el motor). */
export function auroraSetEnabled(v: boolean): void {
  try {
    auroraBridge()?.setEnabled?.(v);
  } catch {
    /* */
  }
}

/** Pausa/reanuda la síntesis sin perder la sesión (mute suave). */
export function auroraPauseSpeech(pause: boolean): void {
  try {
    const api = auroraBridge();
    if (pause) api?.pauseSpeech?.();
    else api?.resumeSpeech?.();
  } catch {
    /* */
  }
}

/**
 * Pide micrófono (desde un gesto) y asegura la escucha en modo voz. Es
 * best-effort: si Aurora no expone requestAccess, intenta start(); si tampoco,
 * no hace nada. Nunca lanza.
 */
export function auroraEnsureListening(): void {
  try {
    const api = auroraBridge();
    if (api?.requestAccess) {
      api.requestAccess({ wantFullscreen: false });
    } else if (api?.start) {
      api.start();
    }
  } catch {
    /* */
  }
}

/** Lee el transcript actual de la escucha de voz (o "" si no hay puente). */
export function auroraTranscript(): string {
  try {
    const s = auroraBridge()?.getState?.();
    return (s?.transcript ?? "") + " " + (s?.interim ?? "");
  } catch {
    return "";
  }
}

/** ¿Aurora está actualmente encendida (enabled) según su estado? */
export function auroraIsEnabled(): boolean {
  try {
    return auroraBridge()?.getState?.()?.enabled === true;
  } catch {
    return false;
  }
}

// ── Detección de comandos de voz simples ─────────────────────────────────────

/** Palabras que hacen AVANZAR al siguiente paso. */
const NEXT_WORDS = ["siguiente", "continua", "continúa", "avanza", "next", "sigue", "adelante"];
/** Palabras que RETROCEDEN. */
const PREV_WORDS = ["anterior", "atras", "atrás", "vuelve", "previo", "back", "retrocede"];
/** Palabras que CIERRAN la guía. */
const CLOSE_WORDS = ["cerrar", "cierra", "salir", "termina", "terminar", "listo", "entendido"];

export type VoiceCommand = "next" | "prev" | "close" | null;

/** Normaliza (minúsculas + sin tildes) para comparar de forma robusta. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/**
 * Interpreta un fragmento de transcript en un comando simple. Sólo mira el final
 * del texto (las últimas palabras dichas) para no re-disparar frases antiguas.
 */
export function parseVoiceCommand(transcript: string): VoiceCommand {
  const t = norm(transcript);
  if (!t) return null;
  // Nos quedamos con la cola del transcript (lo más reciente).
  const tail = t.split(/\s+/).slice(-4).join(" ");
  const has = (words: string[]) => words.some((w) => tail.includes(norm(w)));
  // Prioridad: cerrar > anterior > siguiente (para no avanzar al querer cerrar).
  if (has(CLOSE_WORDS)) return "close";
  if (has(PREV_WORDS)) return "prev";
  if (has(NEXT_WORDS)) return "next";
  return null;
}
