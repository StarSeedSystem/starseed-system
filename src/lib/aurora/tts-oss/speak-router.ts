"use client";

/**
 * StarSeed OS — Enrutador de VOZ de Aurora (elige el motor OSS activo).
 * ============================================================================
 * Punto ÚNICO al que el engine de Aurora (`engine.ts`) delega el habla cuando el
 * usuario ha elegido un motor de voz open-source. Lee la config unificada
 * (`voice-config.ts`) y despacha al motor correspondiente:
 *
 *   · "kokoro" → kokoroSpeak (mejor español, local, gratis).
 *   · "kitten" → kittenSpeak (stub honesto: hoy resuelve null → cae al navegador).
 *   · "browser"/otro → devuelve false SIN hacer nada (el engine usa su voz nativa).
 *
 * Contrato de retorno pensado para un enganche NO invasivo:
 *   speakWithConfiguredEngine(...) → Promise<boolean>
 *     true  = el motor OSS habló (o al menos se hizo cargo del turno de voz).
 *     false = no aplica / no disponible / falló → el llamador usa el navegador.
 *
 * El engine llama a onStart/onEnd para mantener latiendo el orbe de Aurora
 * alrededor del audio OSS (bus de glow), igual que hace con speechSynthesis.
 *
 * SSR-safe, defensivo. NUNCA lanza.
 */

import { getVoiceConfig } from "@/lib/aurora/tts-oss/voice-config";

export interface ConfiguredSpeakOptions {
  /** Antes de reproducir (el engine enciende el glow y el anti-eco aquí). */
  onStart?: () => void;
  /** Al terminar/cortar (el engine apaga el glow y reanuda escucha aquí). */
  onEnd?: () => void;
  /** Impulso de latido del orbe mientras suena (best-effort, opcional). */
  onBoundary?: () => void;
  /** Errores no fatales (informativo). */
  onError?: (message: string) => void;
}

/**
 * ¿Hay un motor OSS activo Y disponible para hablar YA (sin descargar por
 * sorpresa)? Úsalo para decidir rápido si merece la pena delegar. NUNCA lanza.
 */
export async function isConfiguredOssEngineReady(): Promise<boolean> {
  try {
    const { engine } = getVoiceConfig();
    if (engine === "kokoro") {
      const { kokoroAvailable, kokoroModelReady } = await import(
        "@/lib/aurora/tts-oss/kokoro"
      );
      // "Listo para hablar ya" = soportado y con modelo descargado.
      return kokoroAvailable() && kokoroModelReady();
    }
    if (engine === "kitten") {
      const { kittenAvailable } = await import("@/lib/aurora/tts-oss/kitten");
      return kittenAvailable();
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * speakWithConfiguredEngine — Si el motor activo es OSS y puede hablar, sintetiza
 * y reproduce `text`, devolviendo `true` cuando termina. Si el motor es el
 * navegador, no aplica, no está disponible, o algo falla, devuelve `false` para
 * que el engine caiga a `window.speechSynthesis`. NUNCA lanza.
 *
 * IMPORTANTE (anti-descarga sorpresa): sólo autodescarga el modelo si el usuario
 * lo pidió (`autoDownload` en la config). Si no, y el modelo no está listo,
 * devuelve `false` de inmediato (el engine usa la voz del navegador esta vez).
 */
export async function speakWithConfiguredEngine(
  text: string,
  opts: ConfiguredSpeakOptions = {},
): Promise<boolean> {
  const clean = (text || "").trim();
  if (!clean) return false;

  let cfg;
  try {
    cfg = getVoiceConfig();
  } catch {
    return false;
  }
  if (!cfg || cfg.engine === "browser") return false;

  try {
    if (cfg.engine === "kokoro") {
      const { kokoroAvailable, kokoroModelReady, kokoroSpeak } = await import(
        "@/lib/aurora/tts-oss/kokoro"
      );
      if (!kokoroAvailable()) return false;
      // Sin autoDownload y sin modelo listo → no bloqueamos a Aurora; navegador.
      if (!kokoroModelReady() && !cfg.autoDownload) return false;

      const audio = await kokoroSpeak(clean, {
        voice: cfg.voice,
        autoDownload: !!cfg.autoDownload,
        onStart: () => {
          try {
            opts.onStart?.();
          } catch {
            /* */
          }
        },
        onEnd: () => {
          try {
            opts.onEnd?.();
          } catch {
            /* */
          }
        },
        onError: (m) => {
          try {
            opts.onError?.(m);
          } catch {
            /* */
          }
        },
      });
      // audio !== null ⇒ Kokoro se hizo cargo del turno (sonó y terminó).
      return audio !== null;
    }

    if (cfg.engine === "kitten") {
      const { kittenAvailable, kittenSpeak } = await import(
        "@/lib/aurora/tts-oss/kitten"
      );
      if (!kittenAvailable()) return false; // stub honesto: hoy siempre false
      const audio = await kittenSpeak(clean, {
        voice: cfg.voice,
        onStart: () => {
          try {
            opts.onStart?.();
          } catch {
            /* */
          }
        },
        onEnd: () => {
          try {
            opts.onEnd?.();
          } catch {
            /* */
          }
        },
        onError: (m) => {
          try {
            opts.onError?.(m);
          } catch {
            /* */
          }
        },
      });
      return audio !== null;
    }
  } catch {
    return false;
  }

  return false;
}

/** Corta cualquier reproducción OSS en curso (Kokoro/Kitten). NUNCA lanza. */
export async function stopConfiguredEngine(): Promise<void> {
  try {
    const { stopKokoro } = await import("@/lib/aurora/tts-oss/kokoro");
    stopKokoro();
  } catch {
    /* */
  }
  try {
    const { stopKitten } = await import("@/lib/aurora/tts-oss/kitten");
    stopKitten();
  } catch {
    /* */
  }
}
