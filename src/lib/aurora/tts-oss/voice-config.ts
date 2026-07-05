"use client";

/**
 * StarSeed OS — Configuración UNIFICADA de la VOZ de Aurora (multi-motor).
 * ============================================================================
 * Aurora puede hablar con distintos MOTORES de texto-a-voz, todos gratuitos:
 *
 *   · "browser"  → Web Speech API (window.speechSynthesis). SIEMPRE disponible,
 *                  cero descargas, pero suena robótica y varía entre navegadores.
 *                  Es el motor por defecto (comportamiento histórico intacto).
 *   · "kokoro"   → Kokoro TTS (82M, Apache-2.0). Corre 100% en el navegador con
 *                  transformers.js (ONNX/WASM/WebGPU). MEJOR calidad y el mejor
 *                  español (voces `ef_dora`, `em_alex`, `em_santa`). Descarga
 *                  ~80 MB la 1ª vez; luego local/offline. Es el recomendado.
 *   · "kitten"   → KittenTTS (25 MB int8, Apache-2.0, inglés). BETA: pensado para
 *                  nombres/frases en inglés. Puede no estar disponible (stub honesto).
 *
 * Este módulo sólo gestiona la PREFERENCIA persistida (qué motor + qué voz +
 * si autodescargar). No carga NADA pesado: importar este archivo es barato. La
 * carga real de cada motor vive en su propio archivo (`kokoro.ts`, `kitten.ts`)
 * y sólo ocurre cuando el usuario elige ese motor y lo prueba/activa.
 *
 * DISEÑO ADITIVO Y RETROCOMPATIBLE
 * --------------------------------
 * Convive con el opt-in booleano histórico de Kokoro (`opt-in.ts`,
 * `starseed.aurora.oss-tts`). Cuando el usuario elige "kokoro" aquí, además
 * encendemos ese opt-in por debajo para que el motor existente lo reconozca;
 * y si detectamos que el opt-in histórico está encendido pero aún no hay config
 * unificada, migramos a `{engine:"kokoro"}`. Nunca perdemos la elección previa.
 *
 * La clave `starseed.aurora.voice.v1` está en SYNCED_KEYS (settings-sync.ts):
 * la elección de voz VIAJA con la cuenta soberana (misma voz en cualquier
 * dispositivo). No viaja ningún dato pesado: sólo el nombre del motor y la voz.
 *
 * SSR-safe y defensivo: todo acceso a window/localStorage está guardado; nunca
 * lanza. Espeja el patrón de eventos del resto de opt-ins de Aurora.
 */

import {
  AURORA_OSS_TTS_KEY,
  DEFAULT_OSS_TTS_VOICE,
  isKnownVoice,
  isOssTtsEnabled,
  setOssTtsEnabled,
  setOssTtsVoice,
} from "@/lib/aurora/tts-oss/opt-in";

// ── Clave y evento ───────────────────────────────────────────────────────────

/** Clave de localStorage de la config unificada de voz (viaja con la cuenta). */
export const AURORA_VOICE_CONFIG_KEY = "starseed.aurora.voice.v1";
/** Evento interno (mismo tab) emitido al cambiar la config de voz. */
export const AURORA_VOICE_CONFIG_EVENT = "starseed:aurora-voice-config";

// ── Tipos ────────────────────────────────────────────────────────────────────

/** Motor de voz elegido para Aurora. */
export type AuroraVoiceEngine = "browser" | "kokoro" | "kitten";

export interface AuroraVoiceConfig {
  /** Motor activo. Por defecto "browser" (siempre disponible). */
  engine: AuroraVoiceEngine;
  /** Voz específica del motor (p. ej. Kokoro "ef_dora"). Opcional. */
  voice?: string;
  /**
   * Si es true, el motor OSS puede autodescargar su modelo la 1ª vez que Aurora
   * hable (sin pedir un clic extra). Por defecto false: descarga sólo bajo un
   * gesto explícito del usuario (botón "Probar voz" / "Activar").
   */
  autoDownload?: boolean;
}

/** Config por defecto: navegador, sin voz forzada, sin autodescarga. */
export const DEFAULT_VOICE_CONFIG: AuroraVoiceConfig = {
  engine: "browser",
  autoDownload: false,
};

const VALID_ENGINES: readonly AuroraVoiceEngine[] = ["browser", "kokoro", "kitten"];

function isValidEngine(v: unknown): v is AuroraVoiceEngine {
  return typeof v === "string" && (VALID_ENGINES as readonly string[]).includes(v);
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

// ── Lectura / escritura ──────────────────────────────────────────────────────

/**
 * Lee la config de voz unificada. Si no existe pero el opt-in HISTÓRICO de
 * Kokoro está encendido, devuelve `{engine:"kokoro"}` (migración suave, sin
 * escribir todavía). Ante cualquier problema, devuelve el default (navegador).
 * NUNCA lanza.
 */
export function getVoiceConfig(): AuroraVoiceConfig {
  const ls = safeLocalStorage();
  if (!ls) return { ...DEFAULT_VOICE_CONFIG };
  try {
    const raw = ls.getItem(AURORA_VOICE_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AuroraVoiceConfig>;
      const engine = isValidEngine(parsed?.engine) ? parsed.engine : "browser";
      const voice = typeof parsed?.voice === "string" ? parsed.voice : undefined;
      const autoDownload = parsed?.autoDownload === true;
      return { engine, voice, autoDownload };
    }
    // Sin config unificada: honra el opt-in histórico de Kokoro si estaba ON.
    if (isOssTtsEnabled()) {
      return { engine: "kokoro", autoDownload: false };
    }
  } catch {
    /* corrupto o inaccesible → default */
  }
  return { ...DEFAULT_VOICE_CONFIG };
}

/** ¿Qué motor está activo ahora mismo? Atajo cómodo. */
export function getVoiceEngine(): AuroraVoiceEngine {
  return getVoiceConfig().engine;
}

/**
 * Escribe la config de voz (merge parcial sobre la actual) y notifica al tab.
 * Además, mantiene sincronizado el opt-in booleano histórico de Kokoro:
 *   · engine === "kokoro" → enciende `starseed.aurora.oss-tts` (para que el
 *     motor y las UIs antiguas lo reconozcan) y persiste la voz elegida allí.
 *   · engine !== "kokoro" → apaga ese opt-in (Aurora ya no usa Kokoro por defecto).
 * NUNCA lanza.
 */
export function setVoiceConfig(patch: Partial<AuroraVoiceConfig>): void {
  const ls = safeLocalStorage();
  const current = getVoiceConfig();
  const next: AuroraVoiceConfig = {
    engine: isValidEngine(patch.engine) ? patch.engine : current.engine,
    voice:
      "voice" in patch
        ? (typeof patch.voice === "string" && patch.voice ? patch.voice : undefined)
        : current.voice,
    autoDownload:
      "autoDownload" in patch ? patch.autoDownload === true : current.autoDownload,
  };

  if (ls) {
    try {
      ls.setItem(AURORA_VOICE_CONFIG_KEY, JSON.stringify(next));
    } catch {
      /* cuota / modo privado → seguimos, sin romper */
    }
  }

  // Puente con el opt-in histórico de Kokoro (retrocompatibilidad).
  try {
    if (next.engine === "kokoro") {
      if (!isOssTtsEnabled()) setOssTtsEnabled(true);
      if (next.voice && isKnownVoice(next.voice)) setOssTtsVoice(next.voice);
    } else {
      if (isOssTtsEnabled()) setOssTtsEnabled(false);
    }
  } catch {
    /* el puente es best-effort; nunca bloquea el guardado principal */
  }

  emitChange();
}

/** Atajo: fija sólo el motor. */
export function setVoiceEngine(engine: AuroraVoiceEngine): void {
  setVoiceConfig({ engine });
}

/** Atajo: fija sólo la voz (dentro del motor actual). */
export function setVoiceName(voice: string | undefined): void {
  setVoiceConfig({ voice });
}

/**
 * Devuelve la voz efectiva para el motor dado. Para Kokoro, cae al default de
 * su catálogo si no hay una elegida válida.
 */
export function getEffectiveVoice(engine: AuroraVoiceEngine): string | undefined {
  const cfg = getVoiceConfig();
  if (engine === "kokoro") {
    return cfg.voice && isKnownVoice(cfg.voice) ? cfg.voice : DEFAULT_OSS_TTS_VOICE;
  }
  return cfg.voice;
}

function emitChange(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(AURORA_VOICE_CONFIG_EVENT));
  } catch {
    /* */
  }
}

/**
 * Suscribe a cambios de la config de voz (mismo tab vía evento interno + otras
 * pestañas y sync-de-cuenta vía `storage`). Devuelve la baja. SSR-safe.
 */
export function subscribeVoiceConfig(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onLocal = () => cb();
  const onStorage = (e: StorageEvent) => {
    // Reacciona a la clave unificada Y al opt-in histórico (por si otra UI lo togglea).
    if (e.key === AURORA_VOICE_CONFIG_KEY || e.key === AURORA_OSS_TTS_KEY) cb();
  };
  try {
    window.addEventListener(AURORA_VOICE_CONFIG_EVENT, onLocal);
    window.addEventListener("storage", onStorage);
  } catch {
    /* */
  }
  return () => {
    try {
      window.removeEventListener(AURORA_VOICE_CONFIG_EVENT, onLocal);
      window.removeEventListener("storage", onStorage);
    } catch {
      /* */
    }
  };
}
