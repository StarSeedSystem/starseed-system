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
/** Clave de localStorage del idioma preferido de transcripción (default "es"). */
export const AURORA_OSS_STT_LANG_KEY = "starseed.aurora.oss-stt.lang";
/** Evento interno (mismo tab) emitido al cambiar el opt-in, el modelo o el idioma. */
export const AURORA_OSS_STT_EVENT = "starseed:aurora-oss-stt";

// ── Modelos disponibles ──────────────────────────────────────────────────────

/** Identificadores de modelo que exponemos en la UI (compactos, honestos). */
export type OssSttModelId = "tiny" | "base" | "small";

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
  small: {
    id: "small",
    repo: "Xenova/whisper-small",
    label: "Preciso (small)",
    approxSize: "~250 MB",
    note: "La mejor calidad. Descarga y CPU altas: recomendado sólo en equipos de sobremesa.",
  },
};

/** Modelo por defecto: el más ligero, para que el fallback sea viable en móviles. */
export const DEFAULT_OSS_STT_MODEL: OssSttModelId = "tiny";

// ── Idiomas de transcripción ─────────────────────────────────────────────────

/** Idioma preferido de transcripción. `"auto"` deja que Whisper lo detecte. */
export type OssSttLang = "auto" | "es" | "en" | "ca" | "fr" | "de" | "pt" | "it";

export interface OssSttLangSpec {
  id: OssSttLang;
  /** Código que se pasa a Whisper (undefined = autodetección). */
  code?: string;
  label: string;
}

/**
 * Idiomas ofrecidos en la UI. El español es el DEFAULT (fijar el idioma mejora
 * mucho la precisión frente a la autodetección, sobre todo en frases cortas).
 */
export const OSS_STT_LANGS: Record<OssSttLang, OssSttLangSpec> = {
  es: { id: "es", code: "es", label: "Español" },
  auto: { id: "auto", code: undefined, label: "Automático (detectar)" },
  en: { id: "en", code: "en", label: "Inglés" },
  ca: { id: "ca", code: "ca", label: "Catalán" },
  fr: { id: "fr", code: "fr", label: "Francés" },
  de: { id: "de", code: "de", label: "Alemán" },
  pt: { id: "pt", code: "pt", label: "Portugués" },
  it: { id: "it", code: "it", label: "Italiano" },
};

/** Idioma por defecto: español (mejora la calidad frente a autodetección). */
export const DEFAULT_OSS_STT_LANG: OssSttLang = "es";

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
    if (v === "tiny" || v === "base" || v === "small") return v;
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

/** Idioma de transcripción elegido (o el default español si no hay/valor inválido). */
export function getOssSttLang(): OssSttLang {
  const ls = safeLocalStorage();
  if (!ls) return DEFAULT_OSS_STT_LANG;
  try {
    const v = ls.getItem(AURORA_OSS_STT_LANG_KEY);
    if (v && Object.prototype.hasOwnProperty.call(OSS_STT_LANGS, v)) {
      return v as OssSttLang;
    }
  } catch {
    /* */
  }
  return DEFAULT_OSS_STT_LANG;
}

/** Fija el idioma de transcripción y notifica al mismo tab. */
export function setOssSttLang(lang: OssSttLang): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    ls.setItem(AURORA_OSS_STT_LANG_KEY, lang);
  } catch {
    /* */
  }
  emitChange();
}

/**
 * Devuelve el CÓDIGO de idioma que se pasa a Whisper (o `undefined` para que lo
 * autodetecte). Útil para el motor sin que tenga que conocer el catálogo.
 */
export function getOssSttLangCode(): string | undefined {
  return OSS_STT_LANGS[getOssSttLang()]?.code;
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
    if (
      e.key === AURORA_OSS_STT_KEY ||
      e.key === AURORA_OSS_STT_MODEL_KEY ||
      e.key === AURORA_OSS_STT_LANG_KEY
    )
      cb();
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
