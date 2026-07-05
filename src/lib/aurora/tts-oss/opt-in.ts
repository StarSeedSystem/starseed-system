"use client";

/**
 * StarSeed OS — Ajuste OPT-IN de la VOZ de Aurora OPEN-SOURCE (Kokoro TTS).
 * ----------------------------------------------------------------------------
 * La síntesis de voz nativa del navegador (window.speechSynthesis) funciona en
 * casi todas partes, pero suena robótica y varía mucho entre navegadores. Como
 * VOZ ALTERNATIVA ofrecemos Kokoro TTS: un modelo de texto-a-voz abierto y de
 * alta calidad que corre 100% en el navegador con transformers.js (ONNX/WASM),
 * SIN servidor y SIN enviar el texto a ningún sitio. Ese respaldo:
 *
 *   · Es EXPLÍCITO (opt-in): jamás se activa solo. El usuario lo enciende. Si no,
 *     Aurora sigue hablando con la voz del navegador.
 *   · Descarga un modelo (~80 MB) la PRIMERA vez; luego corre local/offline.
 *   · Consume más batería/CPU que la voz nativa → por eso es opcional.
 *
 * Este módulo sólo gestiona la PREFERENCIA persistida (encendido/apagado + qué
 * voz). No carga nada pesado: importar este archivo es barato. La carga real del
 * modelo vive en `oss-tts.ts` y sólo ocurre cuando el usuario lo pide.
 *
 * SSR-safe y defensivo: todo acceso a window/localStorage está guardado; nunca
 * lanza. Espeja el patrón del opt-in de STT (`stt-oss/opt-in.ts`): clave
 * `starseed.aurora.*` + evento interno del mismo tab para que la UI reaccione.
 */

// ── Claves y eventos ─────────────────────────────────────────────────────────

/** Clave de localStorage del opt-in del TTS open-source ("1"/"0", default OFF). */
export const AURORA_OSS_TTS_KEY = "starseed.aurora.oss-tts";
/** Clave de localStorage de la voz elegida (default la primera del catálogo). */
export const AURORA_OSS_TTS_VOICE_KEY = "starseed.aurora.oss-tts.voice";
/** Evento interno (mismo tab) emitido al cambiar el opt-in o la voz. */
export const AURORA_OSS_TTS_EVENT = "starseed:aurora-oss-tts";

// ── Modelo (Kokoro) ──────────────────────────────────────────────────────────

/**
 * Repo del modelo Kokoro cuantizado en formato ONNX (el que resuelve kokoro-js /
 * transformers.js desde el Hub). ~80 MB en la variante q8 recomendada para web.
 */
export const KOKORO_MODEL_REPO = "onnx-community/Kokoro-82M-v1.0-ONNX";
/** Tamaño aproximado de descarga la primera vez (para explicar el coste). */
export const KOKORO_APPROX_SIZE = "~80 MB";

// ── Voces disponibles ────────────────────────────────────────────────────────

/** Idioma de la voz (para agrupar/ordenar en la UI). */
export type OssTtsVoiceLang = "es" | "en";

export interface OssTtsVoiceSpec {
  /** ID interno de la voz que Kokoro espera (p. ej. "ef_dora"). */
  id: string;
  /** Etiqueta corta para la UI. */
  label: string;
  /** Idioma principal de la voz. */
  lang: OssTtsVoiceLang;
  /** Género (informativo, para la UI). */
  gender: "f" | "m";
}

/**
 * Catálogo curado de voces Kokoro. Priorizamos ESPAÑOL (Aurora habla español por
 * defecto) y añadimos algunas inglesas de alta calidad. Los IDs siguen la
 * convención de Kokoro v1.0: primer carácter = idioma (e=español, a=inglés US,
 * b=inglés UK…), segundo = género (f/m).
 *
 * Nota honesta: Kokoro reproduce cualquier texto con la voz elegida; el idioma
 * de la voz sólo marca su ACENTO/fonética. Para español, usa una voz `es`.
 */
export const OSS_TTS_VOICES: OssTtsVoiceSpec[] = [
  // Español (voces nativas de Kokoro v1.0: lang_code 'e', espeak-ng `es`)
  { id: "ef_dora", label: "Dora (español)", lang: "es", gender: "f" },
  { id: "em_alex", label: "Álex (español)", lang: "es", gender: "m" },
  { id: "em_santa", label: "Santa (español)", lang: "es", gender: "m" },
  // Inglés (US) — voces de referencia de Kokoro
  { id: "af_heart", label: "Heart (inglés US)", lang: "en", gender: "f" },
  { id: "af_bella", label: "Bella (inglés US)", lang: "en", gender: "f" },
  { id: "am_michael", label: "Michael (inglés US)", lang: "en", gender: "m" },
  // Inglés (UK)
  { id: "bf_emma", label: "Emma (inglés UK)", lang: "en", gender: "f" },
];

/** Voz por defecto: la primera del catálogo (español). */
export const DEFAULT_OSS_TTS_VOICE: string = OSS_TTS_VOICES[0]?.id ?? "ef_dora";

/** ¿Es un ID de voz que conocemos? */
export function isKnownVoice(id: string | null | undefined): id is string {
  if (!id) return false;
  return OSS_TTS_VOICES.some((v) => v.id === id);
}

// ── Utilidades SSR-safe ──────────────────────────────────────────────────────

function safeLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

// ── Lectura / escritura del opt-in ───────────────────────────────────────────

/** ¿El usuario activó la voz open-source (Kokoro) de Aurora? (default OFF). */
export function isOssTtsEnabled(): boolean {
  const ls = safeLocalStorage();
  if (!ls) return false;
  try {
    return ls.getItem(AURORA_OSS_TTS_KEY) === "1";
  } catch {
    return false;
  }
}

/** Enciende/apaga el opt-in y notifica al mismo tab (evento interno). */
export function setOssTtsEnabled(enabled: boolean): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    ls.setItem(AURORA_OSS_TTS_KEY, enabled ? "1" : "0");
  } catch {
    /* almacenamiento no disponible (modo privado, cuota) → no rompemos */
  }
  emitChange();
}

/** Voz elegida por el usuario (o el default si no hay/valor inválido). */
export function getOssTtsVoice(): string {
  const ls = safeLocalStorage();
  if (!ls) return DEFAULT_OSS_TTS_VOICE;
  try {
    const v = ls.getItem(AURORA_OSS_TTS_VOICE_KEY);
    if (isKnownVoice(v)) return v;
  } catch {
    /* */
  }
  return DEFAULT_OSS_TTS_VOICE;
}

/** Fija la voz elegida y notifica al mismo tab. */
export function setOssTtsVoice(voice: string): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    ls.setItem(AURORA_OSS_TTS_VOICE_KEY, voice);
  } catch {
    /* */
  }
  emitChange();
}

function emitChange(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(AURORA_OSS_TTS_EVENT));
  } catch {
    /* */
  }
}

/**
 * Suscribe a cambios del opt-in / voz (mismo tab vía evento interno + otras
 * pestañas vía `storage`). Devuelve la baja. SSR-safe.
 */
export function subscribeOssTts(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onLocal = () => cb();
  const onStorage = (e: StorageEvent) => {
    if (e.key === AURORA_OSS_TTS_KEY || e.key === AURORA_OSS_TTS_VOICE_KEY) cb();
  };
  try {
    window.addEventListener(AURORA_OSS_TTS_EVENT, onLocal);
    window.addEventListener("storage", onStorage);
  } catch {
    /* */
  }
  return () => {
    try {
      window.removeEventListener(AURORA_OSS_TTS_EVENT, onLocal);
      window.removeEventListener("storage", onStorage);
    } catch {
      /* */
    }
  };
}
