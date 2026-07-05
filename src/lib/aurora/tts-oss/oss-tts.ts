"use client";

/**
 * StarSeed OS — VOZ de Aurora OPEN-SOURCE (Kokoro TTS por CDN).
 * ============================================================================
 * Voz alternativa de Aurora: síntesis de voz de alta calidad que corre 100% en
 * el navegador con Kokoro TTS (transformers.js / ONNX sobre WebAssembly), SIN
 * servidor y SIN enviar el texto a ningún sitio. Es aditiva y explícita: si el
 * usuario NO la activa (o si Kokoro no carga), Aurora sigue hablando con la voz
 * del navegador (window.speechSynthesis). Nunca sustituimos nada por defecto.
 *
 * CÓMO FUNCIONA (honesto sobre el coste)
 * --------------------------------------
 *   1) CARGA PEREZOSA POR CDN. `kokoro-js` NO es dependencia del proyecto ni se
 *      importa en el arranque. Se trae por `import()` dinámico desde jsDelivr
 *      SÓLO cuando el usuario pulsa "Activar y descargar voz". El modelo pesa
 *      ~80 MB la 1ª vez; luego el navegador lo cachea y corre local/offline.
 *   2) SÍNTESIS + REPRODUCCIÓN. `speakOss(text)` genera el audio con la voz
 *      elegida y lo reproduce por WebAudio (AudioContext). `stopOssTts()` corta.
 *   3) DEGRADACIÓN DIGNA. Todo está guardado: si falta WebAudio, o falla la CDN,
 *      devolvemos `false`/errores por callback y NUNCA lanzamos. La UI puede
 *      entonces caer a la voz del navegador sin enterarse el usuario.
 *
 * PUENTE A AURORA
 * ---------------
 * No cableamos este motor dentro del engine de Aurora (sería invasivo). En su
 * lugar, la UI puede usar `speakOssForAurora()` como "voz alternativa": intenta
 * hablar con Kokoro y, si no está listo/activo, degrada en silencio devolviendo
 * `false` para que quien llame use la voz nativa.
 *
 * SSR-safe, defensivo, sin dependencias nuevas (kokoro-js llega por CDN en
 * runtime; por eso los import dinámicos se tipan como `any`).
 */

import {
  KOKORO_MODEL_REPO,
  KOKORO_APPROX_SIZE,
  getOssTtsVoice,
  isOssTtsEnabled,
} from "@/lib/aurora/tts-oss/opt-in";

// ── CDN + configuración de bajo nivel ────────────────────────────────────────

/**
 * ESM de kokoro-js servido por jsDelivr. Se trae por `import(/* webpackIgnore *​/ URL)`
 * para que el bundler NO intente resolverlo en build (no es dependencia local).
 * kokoro-js ya trae dentro su propia copia de @huggingface/transformers.
 */
const KOKORO_CDN = "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1";

/**
 * dtype del modelo. "q8" es el equilibrio recomendado para web (~80 MB, buena
 * calidad). "fp32" suena algo mejor pero pesa/consume mucho más; lo evitamos por
 * defecto para que sea viable en portátiles y móviles de gama media.
 */
const KOKORO_DTYPE = "q8";

// ── Tipos públicos ───────────────────────────────────────────────────────────

/** Estado de la descarga/preparación del modelo (para la barra de progreso). */
export type OssTtsLoadStatus =
  | "idle"
  | "unsupported"
  | "loading"
  | "ready"
  | "error";

export interface OssTtsLoadProgress {
  status: OssTtsLoadStatus;
  /** 0..100 (agregado, best-effort: transformers.js reporta por fichero). */
  progress: number;
  /** Fichero que se está descargando (informativo). */
  file?: string;
  /** Mensaje honesto para la UI. */
  message: string;
}

export interface SpeakOssOptions {
  /** Voz Kokoro (p. ej. "ef_dora"). Por defecto, la persistida en el opt-in. */
  voice?: string;
  /** Velocidad de habla (1 = normal; 0.5..2 razonable). */
  speed?: number;
  /** Se llama justo antes de empezar a reproducir. */
  onStart?: () => void;
  /** Se llama al terminar (o al cortar/errores). Siempre se intenta llamar. */
  onEnd?: () => void;
  /** Se llama ante errores no fatales. */
  onError?: (message: string) => void;
}

// ── Detección de soporte (SSR-safe) ──────────────────────────────────────────

/**
 * ¿Es viable el TTS open-source aquí? Requiere WebAssembly (para ONNX runtime) y
 * WebAudio (AudioContext) para reproducir. No comprueba la CDN (eso se sabrá al
 * cargar). Nunca lanza.
 */
export function isOssTtsSupported(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const hasWasm =
      typeof WebAssembly === "object" &&
      typeof WebAssembly.instantiate === "function";
    const w = window as unknown as {
      AudioContext?: unknown;
      webkitAudioContext?: unknown;
    };
    const hasAudioCtx =
      typeof w.AudioContext !== "undefined" ||
      typeof w.webkitAudioContext !== "undefined";
    return hasWasm && hasAudioCtx;
  } catch {
    return false;
  }
}

// ── Carga PEREZOSA del modelo (kokoro-js por CDN) ─────────────────────────────

// Cacheamos módulo y modelo TTS entre llamadas (el modelo pesa; no re-descargar).
// Tipados como `any`: el paquete llega por CDN en runtime, no está en node_modules.
/* eslint-disable @typescript-eslint/no-explicit-any */
let kokoroModPromise: Promise<any> | null = null;
let ttsPromise: Promise<any> | null = null;

/** Importa kokoro-js desde la CDN una sola vez (memoizado). */
async function importKokoro(): Promise<any> {
  if (kokoroModPromise) return kokoroModPromise;
  kokoroModPromise = (async () => {
    // `@vite-ignore` / `webpackIgnore` para que ningún bundler intente resolver
    // esta URL en build: es un import de runtime puro.
    const mod: any = await import(
      /* webpackIgnore: true */ /* @vite-ignore */ KOKORO_CDN
    );
    return mod;
  })().catch((err) => {
    // Permite reintentar en una llamada posterior si la CDN falló puntualmente.
    kokoroModPromise = null;
    throw err;
  });
  return kokoroModPromise;
}

/**
 * loadTtsModel — Descarga/prepara el modelo de voz (perezoso, opt-in). Reporta
 * el avance por `onProgress` (agregado, best-effort). Devuelve `true` si el
 * modelo quedó listo; `false` si no hay soporte o algo falló. NUNCA lanza.
 *
 * Coste honesto: la 1ª vez descarga ~80 MB. Después el navegador lo sirve de su
 * caché y funciona sin conexión.
 */
export async function loadTtsModel(
  onProgress?: (p: OssTtsLoadProgress) => void,
): Promise<boolean> {
  const emit = (p: OssTtsLoadProgress) => {
    try {
      onProgress?.(p);
    } catch {
      /* la UI puede fallar; el motor no */
    }
  };

  if (!isOssTtsSupported()) {
    emit({
      status: "unsupported",
      progress: 0,
      message: "Este navegador no reúne los requisitos (WebAssembly / audio).",
    });
    return false;
  }

  // Si ya hay modelo listo, no re-descargamos.
  if (ttsPromise) {
    try {
      await ttsPromise;
      emit({ status: "ready", progress: 100, message: "Voz lista (ya descargada)." });
      return true;
    } catch {
      ttsPromise = null;
    }
  }

  emit({ status: "loading", progress: 1, message: "Preparando la voz de Aurora…" });

  // Progreso agregado por bytes (más honesto) con fallback a % por fichero.
  const fileProgress = new Map<string, number>();
  const fileBytes = new Map<string, { loaded: number; total: number }>();
  const shortFile = (file?: string) => {
    if (!file) return undefined;
    const parts = file.split("/");
    return parts[parts.length - 1] || file;
  };
  const reportAggregate = (file?: string) => {
    let loaded = 0;
    let total = 0;
    fileBytes.forEach((b) => {
      if (b.total > 0) {
        loaded += b.loaded;
        total += b.total;
      }
    });
    let pct: number;
    if (total > 0) {
      pct = Math.min(99, Math.round((loaded / total) * 100));
    } else {
      let sum = 0;
      let n = 0;
      fileProgress.forEach((v) => {
        sum += v;
        n += 1;
      });
      pct = n > 0 ? Math.min(99, Math.round(sum / n)) : 1;
    }
    const shown = shortFile(file);
    emit({
      status: "loading",
      progress: pct,
      file: shown,
      message: shown
        ? `Descargando la voz (${KOKORO_APPROX_SIZE}) · ${shown} — ${pct}%`
        : `Descargando la voz (${KOKORO_APPROX_SIZE}) — ${pct}%`,
    });
  };

  const progressCallback = (data: any) => {
    try {
      const file: string | undefined = data?.file;
      if (data?.status === "progress" && file) {
        const p = typeof data.progress === "number" ? data.progress : 0;
        fileProgress.set(file, p);
        const loaded = typeof data.loaded === "number" ? data.loaded : undefined;
        const totalB = typeof data.total === "number" ? data.total : undefined;
        if (typeof loaded === "number" && typeof totalB === "number" && totalB > 0) {
          fileBytes.set(file, { loaded, total: totalB });
        }
        reportAggregate(file);
      } else if (data?.status === "done" && file) {
        fileProgress.set(file, 100);
        const prev = fileBytes.get(file);
        if (prev && prev.total > 0) fileBytes.set(file, { loaded: prev.total, total: prev.total });
        reportAggregate(file);
      }
    } catch {
      /* callback informativo: nunca rompe la carga */
    }
  };

  ttsPromise = (async () => {
    const mod = await importKokoro();
    // kokoro-js expone la clase `KokoroTTS` con el estático `from_pretrained`.
    const KokoroTTS = mod?.KokoroTTS ?? mod?.default?.KokoroTTS ?? mod?.default;
    if (!KokoroTTS || typeof KokoroTTS.from_pretrained !== "function") {
      throw new Error("kokoro-js no expone KokoroTTS.from_pretrained().");
    }
    emit({ status: "loading", progress: 2, message: `Conectando con el Hub para la voz…` });
    const tts = await KokoroTTS.from_pretrained(KOKORO_MODEL_REPO, {
      dtype: KOKORO_DTYPE,
      // Deja que el runtime elija device (wasm/webgpu) según el navegador.
      progress_callback: progressCallback,
    });
    return tts;
  })().catch((err) => {
    ttsPromise = null;
    throw err;
  });

  try {
    await ttsPromise;
    emit({ status: "ready", progress: 100, message: "Voz lista. Funciona sin conexión." });
    return true;
  } catch (err) {
    const msg = (err as { message?: string })?.message || "No se pudo cargar la voz.";
    emit({
      status: "error",
      progress: 0,
      message: `Error al cargar la voz: ${msg}`,
    });
    return false;
  }
}

/** ¿Hay un modelo de voz ya cargado y listo? */
export function isTtsModelReady(): boolean {
  return !!ttsPromise;
}

// ── Síntesis + reproducción (WebAudio) ────────────────────────────────────────

// Reutilizamos un único AudioContext y controlamos la fuente en curso para poder
// cortar. Una reproducción a la vez (suficiente para una voz asistente).
let audioCtx: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;
let speaking = false;

/** Obtiene (o crea, perezosamente) el AudioContext. Nunca lanza. */
function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (audioCtx && audioCtx.state !== "closed") return audioCtx;
    const Ctx =
      (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
    return audioCtx;
  } catch {
    return null;
  }
}

/**
 * Convierte la salida de Kokoro a un AudioBuffer reproducible. kokoro-js devuelve
 * un objeto `RawAudio` con `{ audio: Float32Array, sampling_rate: number }` (o
 * expone `toWav()`). Soportamos ambas formas de manera defensiva.
 */
function toAudioBuffer(ctx: AudioContext, raw: any): AudioBuffer | null {
  try {
    // `data` viene de un módulo `any` (Kokoro por CDN). Lo tratamos como `any`
    // para evitar el choque de genéricos de TS entre Float32Array<ArrayBufferLike>
    // y Float32Array<ArrayBuffer> que exige copyToChannel/set; en runtime es un
    // Float32Array normal.
    const data: any =
      raw?.audio instanceof Float32Array
        ? raw.audio
        : raw?.data instanceof Float32Array
          ? raw.data
          : undefined;
    const rate: number =
      typeof raw?.sampling_rate === "number"
        ? raw.sampling_rate
        : typeof raw?.sampleRate === "number"
          ? raw.sampleRate
          : 24000; // Kokoro sintetiza a 24 kHz
    if (!data || data.length === 0) return null;
    const buffer = ctx.createBuffer(1, data.length as number, rate);
    // Copiamos a un Float32Array recién creado (respaldado por ArrayBuffer) para
    // garantizar compatibilidad de tipos y evitar sorpresas con buffers ajenos.
    const channel = buffer.getChannelData(0);
    channel.set(data as ArrayLike<number>);
    return buffer;
  } catch {
    return null;
  }
}

/**
 * speakOss — Sintetiza `text` con Kokoro y lo reproduce por WebAudio. Si el
 * modelo no está listo, intenta cargarlo primero (perezoso). Devuelve `true` si
 * llegó a reproducir; `false` si no se pudo (sin soporte, CDN caída, texto
 * vacío…). NUNCA lanza: los fallos van por `onError` y por el valor de retorno,
 * para que la UI pueda caer a la voz del navegador.
 */
export async function speakOss(
  text: string,
  opts: SpeakOssOptions = {},
): Promise<boolean> {
  const fireEnd = () => {
    try {
      opts.onEnd?.();
    } catch {
      /* */
    }
  };
  const fail = (message: string) => {
    try {
      opts.onError?.(message);
    } catch {
      /* */
    }
    fireEnd();
    return false;
  };

  const clean = (text || "").trim();
  if (!clean) {
    fireEnd();
    return false;
  }
  if (!isOssTtsSupported()) {
    return fail("Voz open-source no soportada en este navegador.");
  }

  // Cortamos cualquier reproducción anterior (una voz a la vez).
  stopOssTts();

  // Aseguramos modelo cargado (perezoso).
  if (!isTtsModelReady()) {
    const ok = await loadTtsModel();
    if (!ok) return fail("La voz no está lista. Descárgala primero desde Ajustes.");
  }

  const tts = ttsPromise ? await ttsPromise.catch(() => null) : null;
  if (!tts || typeof tts.generate !== "function") {
    return fail("El motor de voz no está disponible.");
  }

  const ctx = getAudioContext();
  if (!ctx) return fail("Este navegador no expone AudioContext.");
  // Algunos navegadores arrancan el contexto "suspended" hasta un gesto.
  try {
    if (ctx.state === "suspended") await ctx.resume();
  } catch {
    /* seguimos; puede requerir gesto del usuario */
  }

  const voice = opts.voice || getOssTtsVoice();
  const speed = typeof opts.speed === "number" && opts.speed > 0 ? opts.speed : 1;

  let raw: any;
  try {
    raw = await tts.generate(clean, { voice, speed });
  } catch (err) {
    const msg = (err as { message?: string })?.message || "fallo al sintetizar";
    return fail(`No se pudo sintetizar la voz (${msg}).`);
  }

  const buffer = toAudioBuffer(ctx, raw);
  if (!buffer) return fail("La voz sintetizada no se pudo reproducir.");

  return await new Promise<boolean>((resolve) => {
    let settled = false;
    const settle = (val: boolean) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };
    try {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      src.onended = () => {
        if (currentSource === src) currentSource = null;
        speaking = false;
        fireEnd();
        settle(true);
      };
      currentSource = src;
      speaking = true;
      try {
        opts.onStart?.();
      } catch {
        /* */
      }
      src.start(0);
    } catch (err) {
      speaking = false;
      currentSource = null;
      const msg = (err as { message?: string })?.message || "fallo de reproducción";
      try {
        opts.onError?.(`No se pudo reproducir la voz (${msg}).`);
      } catch {
        /* */
      }
      fireEnd();
      settle(false);
    }
  });
}

/** Detiene la reproducción de voz open-source en curso (si la hay). Idempotente. */
export function stopOssTts(): void {
  try {
    if (currentSource) {
      currentSource.onended = null;
      try {
        currentSource.stop(0);
      } catch {
        /* ya parada */
      }
      try {
        currentSource.disconnect();
      } catch {
        /* */
      }
    }
  } catch {
    /* */
  } finally {
    currentSource = null;
    speaking = false;
  }
}

/** ¿Se está reproduciendo voz open-source ahora mismo? */
export function isOssTtsSpeaking(): boolean {
  return speaking;
}

// ── Acceso de bajo nivel al modelo (para otros motores/Ut.) ───────────────────

/**
 * getLoadedTts — Devuelve la instancia de Kokoro ya cargada, cargándola de forma
 * perezosa si hiciera falta (respeta el memoizado; NO re-descarga). Devuelve
 * `null` si no hay soporte o algo falló. NUNCA lanza.
 *
 * Pensado para que `kokoro.ts` reutilice EXACTAMENTE el mismo modelo/caché que
 * `speakOss`, sin duplicar la lógica de import por CDN ni la descarga.
 */
export async function getLoadedTts(
  onProgress?: (p: OssTtsLoadProgress) => void,
): Promise<any | null> {
  if (!isOssTtsSupported()) return null;
  if (!isTtsModelReady()) {
    const ok = await loadTtsModel(onProgress);
    if (!ok) return null;
  }
  try {
    return ttsPromise ? await ttsPromise : null;
  } catch {
    return null;
  }
}

/**
 * generateOssRaw — Sintetiza `text` con Kokoro y devuelve el objeto `RawAudio`
 * crudo (con `{ audio: Float32Array, sampling_rate }` y, según versión, métodos
 * `toBlob()`/`toWav()`/`save()`). NO reproduce nada. Devuelve `null` si no se
 * pudo. NUNCA lanza. Base para producir un Blob/HTMLAudioElement en `kokoro.ts`.
 */
export async function generateOssRaw(
  text: string,
  opts: { voice?: string; speed?: number; onProgress?: (p: OssTtsLoadProgress) => void } = {},
): Promise<any | null> {
  const clean = (text || "").trim();
  if (!clean) return null;
  const tts = await getLoadedTts(opts.onProgress);
  if (!tts || typeof tts.generate !== "function") return null;
  const voice = opts.voice || getOssTtsVoice();
  const speed = typeof opts.speed === "number" && opts.speed > 0 ? opts.speed : 1;
  try {
    return await tts.generate(clean, { voice, speed });
  } catch {
    return null;
  }
}

/**
 * rawAudioToWavBlob — Convierte la salida de Kokoro (`RawAudio`) a un Blob WAV
 * reproducible por un elemento <audio>. Prefiere el método nativo del objeto
 * (`toBlob()`/`toWav()`) si existe; si no, codifica un WAV PCM16 a partir del
 * Float32Array de forma manual. Devuelve `null` si no hay datos. NUNCA lanza.
 */
export function rawAudioToWavBlob(raw: any): Blob | null {
  try {
    // 1) Método nativo del RawAudio (kokoro-js expone .toBlob() en versiones recientes).
    if (raw && typeof raw.toBlob === "function") {
      const b = raw.toBlob();
      if (b instanceof Blob) return b;
    }
    // 2) .toWav() → ArrayBuffer/Uint8Array con cabecera WAV completa.
    if (raw && typeof raw.toWav === "function") {
      const wav = raw.toWav();
      if (wav) return new Blob([wav], { type: "audio/wav" });
    }
    // 3) Codificación manual desde Float32Array (fallback robusto).
    const data: Float32Array | undefined =
      raw?.audio instanceof Float32Array
        ? raw.audio
        : raw?.data instanceof Float32Array
          ? raw.data
          : undefined;
    const rate: number =
      typeof raw?.sampling_rate === "number"
        ? raw.sampling_rate
        : typeof raw?.sampleRate === "number"
          ? raw.sampleRate
          : 24000;
    if (!data || data.length === 0) return null;
    return encodeWavPcm16(data, rate);
  } catch {
    return null;
  }
}

/** Codifica un Float32Array mono a un Blob WAV PCM 16-bit. Sin dependencias. */
function encodeWavPcm16(samples: Float32Array, sampleRate: number): Blob {
  const numSamples = samples.length;
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample; // 1 canal
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  // Cabecera RIFF/WAVE
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // subchunk1 size (PCM)
  view.setUint16(20, 1, true); // audio format = PCM
  view.setUint16(22, 1, true); // canales = 1 (mono)
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits por muestra
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  // Muestras PCM16 (clamp + escala)
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    let s = samples[i];
    if (s > 1) s = 1;
    else if (s < -1) s = -1;
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

// ── Helper para la UI: "voz alternativa de Aurora" ────────────────────────────

/**
 * speakOssForAurora — Intenta hablar `text` con la voz Kokoro SÓLO si el usuario
 * activó el opt-in Y el modelo está listo. Si no, NO hace nada y devuelve `false`
 * para que quien llame use la voz nativa del navegador (degradación en silencio).
 *
 * Pensado para que la UI de Aurora (o un puente futuro) pueda preferir la voz
 * open-source cuando esté disponible, sin arrancar descargas por sorpresa ni
 * romper si Kokoro no está.
 *
 *   const spoke = await speakOssForAurora(text);
 *   if (!spoke) speakWithBrowserVoice(text); // fallback nativo
 */
export async function speakOssForAurora(
  text: string,
  opts: SpeakOssOptions = {},
): Promise<boolean> {
  try {
    if (!isOssTtsEnabled()) return false; // el usuario no la activó
    if (!isOssTtsSupported()) return false;
    if (!isTtsModelReady()) return false; // no descargamos aquí por sorpresa
    return await speakOss(text, opts);
  } catch {
    return false;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
