"use client";

/**
 * StarSeed OS — Motor de VOZ Kokoro para Aurora (fachada de alto nivel).
 * ============================================================================
 * Envoltorio delgado y honesto sobre `oss-tts.ts` (que ya carga kokoro-js por
 * CDN, cachea el modelo ONNX y sabe generar audio). Aquí exponemos la API que el
 * orquestador multi-motor (`voice-config.ts`) y el panel de ajustes esperan:
 *
 *   · kokoroAvailable()              → ¿es viable Kokoro en este navegador?
 *   · kokoroModelReady()             → ¿está el modelo ya descargado/listo?
 *   · kokoroPreload(onProgress?)     → descarga/prepara el modelo (perezoso).
 *   · kokoroSpeak(text, opts)        → sintetiza y REPRODUCE por <audio>, resuelve
 *                                       al terminar; devuelve el HTMLAudioElement.
 *   · stopKokoro()                   → corta la reproducción en curso.
 *
 * ¿Por qué reutilizar `oss-tts.ts` en lugar de reimplementar?  Porque ya resuelve
 * lo difícil (import por CDN con `webpackIgnore`, memoización del modelo, progreso
 * agregado, detección de soporte). Aquí sólo añadimos la forma de salida que pide
 * el diseño nuevo: un Blob WAV reproducido con un elemento <audio> (blob URL), que
 * encaja mejor con el enganche del engine de Aurora y libera bien la memoria.
 *
 * Kokoro = MEJOR ESPAÑOL entre los motores OSS. Voces españolas nativas:
 * `ef_dora` (fem.), `em_alex` (masc.), `em_santa` (masc.). El resto del catálogo
 * (inglés US/UK) vive en `opt-in.ts::OSS_TTS_VOICES`.
 *
 * SSR-safe, defensivo, sin dependencias nuevas. NUNCA lanza: los fallos se
 * reportan por callback y por el valor de retorno para que Aurora pueda caer a la
 * voz del navegador sin que el usuario lo note.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  isOssTtsSupported,
  isTtsModelReady,
  loadTtsModel,
  generateOssRaw,
  rawAudioToWavBlob,
  type OssTtsLoadProgress,
} from "@/lib/aurora/tts-oss/oss-tts";
import {
  DEFAULT_OSS_TTS_VOICE,
  OSS_TTS_VOICES,
  isKnownVoice,
} from "@/lib/aurora/tts-oss/opt-in";
import {
  currentPreferredVoiceGender,
  preferredVoiceGender,
  type VoiceGenderPref,
} from "@/lib/aurora/tts-oss/voice-config";

// ── Voces recomendadas para español ──────────────────────────────────────────

/**
 * Voces Kokoro con acento/fonética ESPAÑOL (las que rinden mejor cuando Aurora
 * habla en español, su idioma por defecto). Derivadas del catálogo curado.
 */
export const KOKORO_SPANISH_VOICES = OSS_TTS_VOICES.filter((v) => v.lang === "es");

/**
 * Voces españolas FEMENINAS de Kokoro (`ef_dora`…). Las personalidades
 * incluidas en StarSeed son femeninas por defecto (`preferredVoiceGender()`):
 * cuando la preferencia es femenina, tanto el default como cualquier voz
 * masculina guardada (`em_alex`/`em_santa`) se ignoran a favor de esta lista.
 */
export const KOKORO_SPANISH_FEMALE_VOICES = KOKORO_SPANISH_VOICES.filter((v) => v.gender === "f");

/** Voz española MASCULINA por defecto (solo para preferencia "m" explícita). */
const KOKORO_DEFAULT_SPANISH_MALE_VOICE: string =
  KOKORO_SPANISH_VOICES.find((v) => v.gender === "m")?.id ?? DEFAULT_OSS_TTS_VOICE;

/**
 * Voz española recomendada por defecto para Kokoro — SIEMPRE FEMENINA
 * (`ef_dora` si existe): se filtra `KOKORO_SPANISH_VOICES` por `gender==="f"`
 * porque las personalidades incluidas son femeninas por defecto. Solo cae a
 * cualquier voz española si el catálogo no tuviera ninguna femenina (Aurora
 * sigue hablando antes que quedarse muda).
 */
export const KOKORO_DEFAULT_SPANISH_VOICE: string =
  KOKORO_SPANISH_FEMALE_VOICES[0]?.id ?? KOKORO_SPANISH_VOICES[0]?.id ?? DEFAULT_OSS_TTS_VOICE;

// ── Disponibilidad ───────────────────────────────────────────────────────────

/** ¿Puede Kokoro funcionar aquí? (WebAssembly + WebAudio; SSR-safe). Nunca lanza. */
export function kokoroAvailable(): boolean {
  try {
    return isOssTtsSupported();
  } catch {
    return false;
  }
}

/** ¿Está el modelo Kokoro ya cargado y listo (sin descargas pendientes)? */
export function kokoroModelReady(): boolean {
  try {
    return isTtsModelReady();
  } catch {
    return false;
  }
}

/**
 * kokoroPreload — Descarga/prepara el modelo Kokoro (perezoso, opt-in). Reporta
 * el avance por `onProgress`. Devuelve `true` si quedó listo. NUNCA lanza.
 * Reutiliza el memoizado de `oss-tts.ts`: no re-descarga si ya está.
 */
export async function kokoroPreload(
  onProgress?: (p: OssTtsLoadProgress) => void,
): Promise<boolean> {
  try {
    return await loadTtsModel(onProgress);
  } catch {
    return false;
  }
}

// ── Reproducción por elemento <audio> (blob URL) ─────────────────────────────

// Una reproducción a la vez (suficiente para una voz asistente). Guardamos la
// referencia para poder cortarla y liberar su blob URL.
let currentAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;

export interface KokoroSpeakOptions {
  /** Voz Kokoro (p. ej. "ef_dora"). Por defecto, la española recomendada. */
  voice?: string;
  /** Velocidad de habla (1 = normal; 0.5..2 razonable). */
  speed?: number;
  /**
   * Si true, descarga el modelo la 1ª vez sin exigir que ya esté listo. Si false
   * (por defecto) y el modelo NO está cargado, resolvemos `null` para que quien
   * llame caiga a la voz del navegador en vez de disparar ~80 MB por sorpresa.
   */
  autoDownload?: boolean;
  /** Progreso de descarga del modelo (sólo si hubo que descargarlo). */
  onProgress?: (p: OssTtsLoadProgress) => void;
  /** Se llama justo antes de empezar a reproducir (para el glow del orbe). */
  onStart?: () => void;
  /** Se llama al terminar/cortar (para el glow del orbe). */
  onEnd?: () => void;
  /** Se llama ante errores no fatales. */
  onError?: (message: string) => void;
  /**
   * Preferencia de género de la personalidad activa. FUERTE (Adenda voz-
   * femenina): con "f" (el default — ver `currentPreferredVoiceGender()`),
   * SIEMPRE se habla con una voz española femenina, ignorando `voice` si
   * apunta a una masculina (`em_alex`/`em_santa`) guardada o pasada por
   * error. Solo "m" explícito respeta una voz masculina. Si se omite, se
   * resuelve SOLA con el preset de voz activo: ningún llamador necesita saber
   * de género para que Kokoro suene femenino por defecto.
   */
  gender?: VoiceGenderPref;
}

/**
 * kokoroSpeak — Sintetiza `text` con Kokoro y lo REPRODUCE con un <audio> desde
 * un blob URL, resolviendo cuando termina de sonar. Devuelve el HTMLAudioElement
 * usado (para control externo) o `null` si no se pudo (sin soporte, modelo no
 * listo y sin autoDownload, CDN caída, texto vacío…). NUNCA lanza.
 *
 * Corta cualquier reproducción Kokoro anterior antes de empezar. Libera el blob
 * URL al terminar. Llama a onStart/onEnd alrededor del audio para que el orbe de
 * Aurora siga latiendo aunque el TTS no exponga amplitud.
 */
export async function kokoroSpeak(
  text: string,
  opts: KokoroSpeakOptions = {},
): Promise<HTMLAudioElement | null> {
  const fireEnd = () => {
    try {
      opts.onEnd?.();
    } catch {
      /* */
    }
  };
  const fail = (message: string): null => {
    try {
      opts.onError?.(message);
    } catch {
      /* */
    }
    fireEnd();
    return null;
  };

  const clean = (text || "").trim();
  if (!clean) {
    fireEnd();
    return null;
  }
  if (!kokoroAvailable()) return fail("Kokoro no está soportado en este navegador.");

  // Una voz a la vez.
  stopKokoro();

  // Si el modelo no está listo, sólo descargamos con permiso explícito.
  if (!kokoroModelReady()) {
    if (!opts.autoDownload) {
      return fail("La voz Kokoro no está descargada. Actívala en Ajustes.");
    }
    const ok = await kokoroPreload(opts.onProgress);
    if (!ok) return fail("No se pudo preparar la voz Kokoro.");
  }

  // GÉNERO FEMENINO — preferencia FUERTE (Adenda voz-femenina): con
  // preferencia femenina (el default de toda personalidad incluida)
  // IGNORAMOS cualquier voz masculina guardada o pasada por el llamador
  // (`em_alex`/`em_santa`) y forzamos la española femenina — así ningún turno
  // de Kokoro suena masculino aunque hubiera una voz masculina persistida de
  // una sesión anterior. Con preferencia "m" explícita, se respeta la voz
  // pedida (o la masculina por defecto si no se pidió ninguna).
  const wantGender = opts.gender ? preferredVoiceGender(opts.gender) : currentPreferredVoiceGender();
  const requestedVoice = opts.voice && isKnownVoice(opts.voice) ? opts.voice : undefined;
  const requestedGender = requestedVoice
    ? OSS_TTS_VOICES.find((v) => v.id === requestedVoice)?.gender
    : undefined;
  const voice =
    wantGender === "f"
      ? requestedVoice && requestedGender !== "m"
        ? requestedVoice
        : KOKORO_DEFAULT_SPANISH_VOICE
      : requestedVoice ?? KOKORO_DEFAULT_SPANISH_MALE_VOICE;

  // Sintetiza (reutiliza el modelo cargado de oss-tts.ts).
  const raw = await generateOssRaw(clean, {
    voice,
    speed: opts.speed,
    onProgress: opts.onProgress,
  });
  if (!raw) return fail("No se pudo sintetizar la voz Kokoro.");

  const blob = rawAudioToWavBlob(raw);
  if (!blob) return fail("La voz Kokoro sintetizada no se pudo convertir a audio.");

  // Reproduce por <audio> desde blob URL y resuelve al terminar.
  return await new Promise<HTMLAudioElement | null>((resolve) => {
    let settled = false;
    let url: string | null = null;
    let audio: HTMLAudioElement | null = null;

    const cleanup = () => {
      if (url) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* */
        }
      }
      if (currentAudio === audio) {
        currentAudio = null;
        currentUrl = null;
      }
    };
    const settle = (val: HTMLAudioElement | null) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };

    try {
      url = URL.createObjectURL(blob);
      audio = new Audio(url);
      currentAudio = audio;
      currentUrl = url;

      audio.onended = () => {
        cleanup();
        fireEnd();
        settle(audio);
      };
      audio.onerror = () => {
        cleanup();
        try {
          opts.onError?.("Fallo al reproducir la voz Kokoro.");
        } catch {
          /* */
        }
        fireEnd();
        settle(null);
      };

      try {
        opts.onStart?.();
      } catch {
        /* */
      }

      const p = audio.play();
      // `play()` devuelve una promesa en navegadores modernos: puede rechazar si
      // no hay gesto de usuario. Lo tratamos como fallo suave (fallback nativo).
      if (p && typeof (p as Promise<void>).catch === "function") {
        (p as Promise<void>).catch(() => {
          cleanup();
          try {
            opts.onError?.("El navegador bloqueó la reproducción (requiere gesto).");
          } catch {
            /* */
          }
          fireEnd();
          settle(null);
        });
      }
    } catch (err) {
      cleanup();
      const msg = (err as { message?: string })?.message || "fallo de reproducción";
      try {
        opts.onError?.(`No se pudo reproducir la voz Kokoro (${msg}).`);
      } catch {
        /* */
      }
      fireEnd();
      settle(null);
    }
  });
}

/** Detiene la reproducción Kokoro en curso (si la hay). Idempotente. Nunca lanza. */
export function stopKokoro(): void {
  try {
    if (currentAudio) {
      try {
        currentAudio.pause();
        currentAudio.onended = null;
        currentAudio.onerror = null;
        currentAudio.src = "";
      } catch {
        /* */
      }
    }
    if (currentUrl) {
      try {
        URL.revokeObjectURL(currentUrl);
      } catch {
        /* */
      }
    }
  } catch {
    /* */
  } finally {
    currentAudio = null;
    currentUrl = null;
  }
}

/** ¿Se está reproduciendo voz Kokoro ahora mismo? */
export function isKokoroSpeaking(): boolean {
  return !!currentAudio && !currentAudio.paused;
}
