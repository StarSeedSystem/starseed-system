"use client";

/**
 * StarSeed OS — Motor de VOZ KittenTTS para Aurora (STUB HONESTO · beta/inglés).
 * ============================================================================
 * KittenTTS es un modelo TTS diminuto (~25 MB int8, Apache-2.0, 8 voces) pensado
 * para INGLÉS. En el navegador correría vía onnxruntime-web con un port web
 * comunitario. A día de hoy ese port es incierto/inestable, así que — siguiendo
 * la regla del proyecto "mejor honesto que roto" — este archivo es un STUB:
 *
 *   · `kittenAvailable()` devuelve SIEMPRE `false` → el orquestador y el engine
 *     de Aurora NUNCA delegan aquí; caen al motor por defecto (navegador/Kokoro).
 *   · `kittenSpeak()` no intenta nada: informa "próximamente" y resuelve `null`.
 *
 * La UI PUEDE mostrar Kitten como opción marcada "beta · inglés · próximamente",
 * pero deshabilitada, para comunicar la intención sin prometer algo que no está.
 * Cuando exista un port web fiable, se sustituye este stub por la implementación
 * real (mismo contrato: `kittenAvailable`/`kittenSpeak`/`stopKitten`).
 *
 * SSR-safe y defensivo. NUNCA lanza.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Estado declarado del motor Kitten (para que la UI lo explique con honestidad). */
export const KITTEN_STATUS = {
  /** ¿Hay implementación real activa? (hoy no). */
  implemented: false,
  /** Idioma objetivo del modelo. */
  lang: "en" as const,
  /** Tamaño aproximado del modelo (int8). */
  approxSize: "~25 MB",
  /** Etiqueta para la UI. */
  label: "KittenTTS (beta · inglés)",
  /** Mensaje honesto para la UI. */
  message:
    "KittenTTS (inglés) llegará próximamente. Por ahora usa Kokoro (mejor español) o la voz del navegador.",
} as const;

/** IDs de las 8 voces de KittenTTS (documentadas), para cuando exista el port. */
export const KITTEN_VOICES: readonly string[] = [
  "expr-voice-2-f",
  "expr-voice-2-m",
  "expr-voice-3-f",
  "expr-voice-3-m",
  "expr-voice-4-f",
  "expr-voice-4-m",
  "expr-voice-5-f",
  "expr-voice-5-m",
];

/**
 * ¿Está KittenTTS disponible para usarse AHORA? Hoy: no (stub honesto). Devolver
 * `false` garantiza que Aurora nunca intente hablar con un motor inexistente.
 */
export function kittenAvailable(): boolean {
  return false;
}

/** ¿Modelo Kitten listo? Nunca (aún no implementado). */
export function kittenModelReady(): boolean {
  return false;
}

export interface KittenSpeakOptions {
  voice?: string;
  speed?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
}

/**
 * kittenSpeak — STUB. No sintetiza nada: informa "próximamente" por `onError` y
 * resuelve `null` para que quien llame use otro motor. NUNCA lanza.
 */
export async function kittenSpeak(
  _text: string,
  opts: KittenSpeakOptions = {},
): Promise<HTMLAudioElement | null> {
  try {
    opts.onError?.(KITTEN_STATUS.message);
  } catch {
    /* */
  }
  try {
    opts.onEnd?.();
  } catch {
    /* */
  }
  return null;
}

/** Detiene la reproducción Kitten (no-op: no hay reproducción). Idempotente. */
export function stopKitten(): void {
  /* no-op: stub */
}

/** ¿Se está reproduciendo voz Kitten? Nunca (stub). */
export function isKittenSpeaking(): boolean {
  return false;
}
