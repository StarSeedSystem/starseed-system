"use client";

/**
 * StarSeed OS — Ajuste OPT-IN del reconocimiento de voz OPEN-SOURCE (fallback).
 * ----------------------------------------------------------------------------
 * El reconocimiento de voz nativo (Web Speech API / SpeechRecognition) NO existe
 * en Firefox ni en algunos WebView. Para esos casos ofrecemos un respaldo
 * open-source que corre en el navegador con transformers.js (Whisper/Moonshine
 * ONNX). Ese respaldo:
 *
 *   · Es EXPLÍCITO (opt-in): jamás se activa solo. El usuario lo enciende.
 *   · Descarga un modelo (~40-80 MB) la PRIMERA vez; luego corre local/offline.
 *   · Consume más batería/CPU que el motor nativo → por eso es opcional.
 *
 * Este módulo sólo gestiona la PREFERENCIA persistida (encendido/apagado + qué
 * modelo). No carga nada pesado: importar este archivo es barato. La carga real
 * del modelo vive en `oss-stt.ts` y sólo ocurre cuando el usuario lo pide.
 *
 * SSR-safe y defensivo: todo acceso a window/localStorage está guardado; nunca
 * lanza. Espeja el patrón de `wake-word.ts` (clave `starseed.aurora.*` + evento
 * interno del mismo tab para que la UI reaccione).
 */

// ── Claves y eventos ─────────────────────────────────────────────────────────

/** Clave de localStorage del opt-in del STT open-source ("1"/"0", default OFF). */
export const AURORA_OSS_STT_KEY = "starseed.aurora.oss-stt";
/** Clave de localStorage del modelo elegido (default "tiny"). */
export const AURORA_OSS_STT_MODEL_KEY = "starseed.aurora.oss-stt.model";
/** Evento interno (mismo tab) emitido al cambiar el opt-in o el modelo. */
export const AURORA_OSS_STT_EVENT = "starseed:aurora-oss-stt";

// ── Modelos disponibles ──────────────────────────────────────────────────────

/** Identificadores de modelo que exponemos en la UI (compactos, honestos). */
export type OssSttModelId = "tiny" | "base";

export interface OssSttModelSpec {
  id: OssSttModelId;
  /** Repo Hugging Face que transformers.js resuelve desde el Hub. */
  repo: string;
  /** Etiqueta corta para la UI. */
  label: string;
  /** Tamaño aproximado de descarga (para explicar el coste con honestidad). */
  approxSize: string;
  /** Nota de compromiso velocidad/precisión. */
  note: string;
}

/**
 * Catálogo de modelos. Usamos Whisper cuantizado de Xenova (ONNX), pensado para
 * correr en el navegador con WebAssembly. "tiny" es el más ligero (mejor para
 * móviles/equipos modestos); "base" es algo más preciso a cambio de peso/CPU.
 */
export const OSS_STT_MODELS: Record<OssSttModelId, OssSttModelSpec> = {
  tiny: {
    id: "tiny",
    repo: "Xenova/whisper-tiny",
    label: "Ligero (tiny)",
    approxSize: "~40 MB",
    note: "El más rápido y ligero. Ideal en móviles y equipos modestos.",
  },
  base: {
    id: "base",
    repo: "Xenova/whisper-base",
    label: "Equilibrado (base)",
    approxSize: "~80 MB",
    note: "Más preciso a cambio de más descarga, batería y CPU.",
  },
};

/** Modelo por defecto: el más ligero, para que el fallback sea viable en móviles. */
export const DEFAULT_OSS_STT_MODEL: OssSttModelId = "tiny";

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

/** ¿El usuario activó el reconocimiento de voz open-source? (default OFF). */
export function isOssSttEnabled(): boolean {
  const ls = safeLocalStorage();
  if (!ls) return false;
  try {
    return ls.getItem(AURORA_OSS_STT_KEY) === "1";
  } catch {
    return false;
  }
}

/** Enciende/apaga el opt-in y notifica al mismo tab (evento interno). */
export function setOssSttEnabled(enabled: boolean): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    ls.setItem(AURORA_OSS_STT_KEY, enabled ? "1" : "0");
  } catch {
    /* almacenamiento no disponible (modo privado, cuota) → no rompemos */
  }
  emitChange();
}

/** Modelo elegido por el usuario (o el default si no hay/valor inválido). */
export function getOssSttModel(): OssSttModelId {
  const ls = safeLocalStorage();
  if (!ls) return DEFAULT_OSS_STT_MODEL;
  try {
    const v = ls.getItem(AURORA_OSS_STT_MODEL_KEY);
    if (v === "tiny" || v === "base") return v;
  } catch {
    /* */
  }
  return DEFAULT_OSS_STT_MODEL;
}

/** Fija el modelo elegido y notifica al mismo tab. */
export function setOssSttModel(model: OssSttModelId): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    ls.setItem(AURORA_OSS_STT_MODEL_KEY, model);
  } catch {
    /* */
  }
  emitChange();
}

function emitChange(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(AURORA_OSS_STT_EVENT));
  } catch {
    /* */
  }
}

/**
 * Suscribe a cambios del opt-in / modelo (mismo tab vía evento interno + otras
 * pestañas vía `storage`). Devuelve la baja. SSR-safe.
 */
export function subscribeOssStt(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onLocal = () => cb();
  const onStorage = (e: StorageEvent) => {
    if (e.key === AURORA_OSS_STT_KEY || e.key === AURORA_OSS_STT_MODEL_KEY) cb();
  };
  try {
    window.addEventListener(AURORA_OSS_STT_EVENT, onLocal);
    window.addEventListener("storage", onStorage);
  } catch {
    /* */
  }
  return () => {
    try {
      window.removeEventListener(AURORA_OSS_STT_EVENT, onLocal);
      window.removeEventListener("storage", onStorage);
    } catch {
      /* */
    }
  };
}
