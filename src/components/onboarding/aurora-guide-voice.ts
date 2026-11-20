"use client";

/**
 * aurora-guide-voice — puente DEFENSIVO a Aurora para la guía + comandos de voz.
 * ----------------------------------------------------------------------------
 * NO importa el provider ni el motor de Aurora. Voz fusionada (VZF1015J): pasa
 * por `hablar()` de `voz-unica.ts` con contexto 'guia'. Conserva la API pública
 * (`auroraBridge`, `auroraCanSpeak`, etc.) para no tocar a quien la consuma.
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

import { callar as callarUnica, hablar as hablarUnica } from "@/lib/aurora/voz-unica";

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
  try {
    return true;
  } catch {
    return false;
  }
}

/** Hace hablar a Aurora (TTS) por la puerta única con contexto 'guia'. */
export function auroraSpeak(text: string): void {
  const t = (text ?? "").trim();
  if (!t) return;
  try {
    void hablarUnica(t, { contexto: "guia" });
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

/**
 * Junta lo ya dicho (`transcript`) y lo que se está diciendo (`interim`) en un
 * solo texto para los comandos de voz, sin espacios de sobra.
 */
export function componerTranscript(
  transcript?: string | null,
  interim?: string | null,
): string {
  return [transcript, interim]
    .map((parte) => (parte ?? "").trim())
    .filter((parte) => parte.length > 0)
    .join(" ");
}

/**
 * Lee el transcript actual de la escucha de voz.
 * Devuelve `null` si el puente FALLÓ al leerlo — distinto de no tener transcript,
 * que es `""`. Así el llamador puede avisar y seguir en texto en vez de quedarse
 * callado en un modo voz que ya no responde (nunca en bucle).
 */
export function auroraTranscript(): string | null {
  try {
    const s = auroraBridge()?.getState?.();
    return componerTranscript(s?.transcript, s?.interim);
  } catch {
    return null;
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
