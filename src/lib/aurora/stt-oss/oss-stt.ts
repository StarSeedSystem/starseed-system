"use client";

/**
 * StarSeed OS — Motor de reconocimiento de voz OPEN-SOURCE (respaldo por lotes).
 * ============================================================================
 * Respaldo para navegadores SIN reconocimiento de voz nativo (Firefox, algunos
 * WebView), donde `capabilities.ts` deja el entorno en 'text-only'. Aquí el
 * reconocimiento corre 100% en el navegador con transformers.js (Whisper ONNX)
 * sobre WebAssembly, SIN servidor y SIN enviar audio a ningún sitio.
 *
 * CÓMO FUNCIONA (honesto sobre el coste)
 * --------------------------------------
 *   1) CARGA PEREZOSA POR CDN. El paquete de transformers.js NO es dependencia
 *      del proyecto ni se importa en el arranque. Se trae por `import()` dinámico
 *      desde jsDelivr SÓLO cuando el usuario pulsa "Activar y descargar modelo".
 *      El modelo pesa (~40-250 MB la 1ª vez según tiny/base/small); luego el
 *      navegador lo cachea y corre local/offline. El progreso de descarga se
 *      reporta por fichero y agregado, con mensaje honesto.
 *   2) RECONOCIMIENTO POR LOTES + VAD ADAPTATIVO. No hay streaming nativo en
 *      Whisper web; grabamos del micrófono y con un VAD por energía (RMS) que se
 *      CALIBRA al ruido de fondo detectamos el FIN de cada frase (silencio
 *      ~800 ms). Guardamos un pre-roll para no cortar la 1ª sílaba y NO partimos
 *      frases largas (hasta 30 s). Cerrado el segmento lo transcribimos (con
 *      reintento defensivo) y emitimos el texto FINAL. `onInterim` (opcional)
 *      sólo informa de que hay voz/energía; no produce texto parcial real.
 *   3) IDIOMA. Por defecto ES (español): fijar el idioma mejora mucho la calidad
 *      frente a la autodetección. Se lee del opt-in y puede sobreescribirse por
 *      llamada con `lang`.
 *   4) DEGRADACIÓN DIGNA. Todo está guardado: si falta WebAssembly, el micrófono,
 *      o falla la CDN, devolvemos errores por callback y NUNCA lanzamos.
 *
 * PUENTE A AURORA
 * ---------------
 * No cableamos este motor dentro del engine de Aurora (sería invasivo). En su
 * lugar, `pipeOssSttToAurora()` envuelve `onResult` para enviar el texto final a
 * Aurora por el puente global `window.STARSEED_AURORA.send(text)`.
 *
 * SSR-safe, defensivo, sin dependencias nuevas (transformers.js llega por CDN en
 * runtime; por eso los import dinámicos se tipan como `any`).
 */

import {
  OSS_STT_MODELS,
  getOssSttModel,
  getOssSttLangCode,
  type OssSttModelId,
} from "@/lib/aurora/stt-oss/opt-in";

// ── CDN + configuración de bajo nivel ────────────────────────────────────────

/**
 * ESM de transformers.js servido por jsDelivr. Se trae por `import(/* webpackIgnore *​/ URL)`
 * para que el bundler NO intente resolverlo en build (no es dependencia local).
 */
const TRANSFORMERS_CDN =
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2";

/** Tasa de muestreo que espera Whisper. */
const TARGET_SAMPLE_RATE = 16000;

// VAD (detección de actividad de voz) por energía RMS — con UMBRAL ADAPTATIVO.
// -----------------------------------------------------------------------------
// El umbral fijo antiguo (0.012) fallaba en dos direcciones: en entornos ruidosos
// (ventilador, calle, cafetería) disparaba voz sin parar; en micrófonos flojos o
// habitaciones muy silenciosas se perdía el habla suave. Ahora medimos el RUIDO
// DE FONDO al arrancar (calibración) y seguimos un suelo de ruido móvil; el
// umbral de voz vive SIEMPRE por encima de ese suelo (histéresis).
/** Suelo de ruido mínimo asumido (evita umbral 0 en micrófonos perfectos). */
const VAD_NOISE_FLOOR_MIN = 0.004;
/** Suelo de ruido máximo asumido (por si el entorno es muy ruidoso). */
const VAD_NOISE_FLOOR_MAX = 0.08;
/** Cuánto por encima del suelo de ruido tiene que estar el RMS para ser "voz". */
const VAD_SPEECH_MULT = 2.4;
/** Margen absoluto extra sobre el suelo (protege micrófonos silenciosos). */
const VAD_SPEECH_MARGIN = 0.006;
/** Factor de histéresis: para SEGUIR hablando basta con superar ~60% del umbral. */
const VAD_RELEASE_RATIO = 0.6;
/** Suavizado exponencial del suelo de ruido (0..1; alto = se adapta despacio). */
const VAD_NOISE_SMOOTHING = 0.995;
/** Bloques de calibración inicial (a 4096 muestras/~85 ms cada uno ≈ 0.85 s). */
const VAD_CALIBRATION_BLOCKS = 10;
/** Silencio (ms) tras el cual cerramos un segmento y lo transcribimos. */
const VAD_SILENCE_MS = 800;
/** Duración mínima (ms) de voz para molestarnos en transcribir (evita clics). */
const VAD_MIN_SPEECH_MS = 350;
/**
 * Duración máxima (ms) de un segmento: lo cerramos aunque no haya silencio. Se
 * sube a 30 s (el `chunk_length_s` de Whisper) para NO cortar frases largas por
 * la mitad; antes 12 s partía monólogos y perdía contexto.
 */
const VAD_MAX_SEGMENT_MS = 30000;
/** Pre-roll (ms) de audio a conservar ANTES del inicio de voz (evita cortar la 1ª sílaba). */
const VAD_PREROLL_MS = 300;
/** Reintentos de transcripción de un segmento ante fallo transitorio. */
const TRANSCRIBE_RETRIES = 1;

// ── Tipos públicos ───────────────────────────────────────────────────────────

/** Estado de la descarga/preparación del modelo (para la barra de progreso). */
export type OssSttLoadStatus =
  | "idle"
  | "unsupported"
  | "loading"
  | "ready"
  | "error";

export interface OssSttLoadProgress {
  status: OssSttLoadStatus;
  /** 0..100 (agregado, best-effort: transformers.js reporta por fichero). */
  progress: number;
  /** Fichero que se está descargando (informativo). */
  file?: string;
  /** Mensaje honesto para la UI. */
  message: string;
}

export interface StartOssSttOptions {
  /** Se llama con cada transcripción FINAL de un segmento. */
  onResult: (text: string) => void;
  /**
   * Opcional. Se llama cuando hay voz en curso (energía) — NO es texto parcial
   * real (Whisper por lotes no lo da), sólo una señal de "te estoy oyendo".
   */
  onInterim?: (hint: string) => void;
  /** Se llama ante errores no fatales (permiso, decodificación, CDN…). */
  onError?: (message: string) => void;
  /** Idioma preferido (p. ej. "es", "en"). Por defecto autodetección. */
  lang?: string;
}

export interface OssSttSession {
  /** Detiene la captura y libera el micrófono. Idempotente. */
  stop: () => void;
  /** ¿Sigue capturando? */
  isActive: () => boolean;
}

// ── Detección de soporte (SSR-safe) ──────────────────────────────────────────

/**
 * ¿Es viable el STT open-source aquí? Requiere WebAssembly (para ONNX runtime)
 * y captura de micrófono (getUserMedia). No comprueba la CDN (eso se sabrá al
 * cargar). Nunca lanza.
 */
export function isOssSttSupported(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const hasWasm = typeof WebAssembly === "object" && typeof WebAssembly.instantiate === "function";
    const md = navigator?.mediaDevices;
    const hasMic = !!md && typeof md.getUserMedia === "function";
    // Audio decoding + análisis: necesitamos AudioContext (o el prefijo webkit).
    const w = window as unknown as { AudioContext?: unknown; webkitAudioContext?: unknown };
    const hasAudioCtx = typeof w.AudioContext !== "undefined" || typeof w.webkitAudioContext !== "undefined";
    return hasWasm && hasMic && hasAudioCtx;
  } catch {
    return false;
  }
}

// ── Carga PEREZOSA del pipeline (transformers.js por CDN) ─────────────────────

// Cacheamos módulo y pipeline entre llamadas (el modelo pesa; no re-descargar).
// Tipados como `any`: el paquete llega por CDN en runtime, no está en node_modules.
/* eslint-disable @typescript-eslint/no-explicit-any */
let transformersModPromise: Promise<any> | null = null;
let pipelinePromise: Promise<any> | null = null;
let pipelineModelId: OssSttModelId | null = null;

/** Importa transformers.js desde la CDN una sola vez (memoizado). */
async function importTransformers(): Promise<any> {
  if (transformersModPromise) return transformersModPromise;
  transformersModPromise = (async () => {
    // `@vite-ignore` / `webpackIgnore` para que ningún bundler intente resolver
    // esta URL en build: es un import de runtime puro.
    const mod: any = await import(
      /* webpackIgnore: true */ /* @vite-ignore */ TRANSFORMERS_CDN
    );
    // Config defensiva: permitir modelos remotos del Hub, desactivar los locales.
    try {
      if (mod?.env) {
        mod.env.allowLocalModels = false;
        mod.env.allowRemoteModels = true;
        if (mod.env.backends?.onnx?.wasm) {
          // Deja que el runtime elija hilos según el dispositivo; no forzamos.
          mod.env.backends.onnx.wasm.proxy = false;
        }
      }
    } catch {
      /* si la forma del módulo difiere, seguimos: pipeline() es lo esencial */
    }
    return mod;
  })().catch((err) => {
    // Permite reintentar en una llamada posterior si la CDN falló puntualmente.
    transformersModPromise = null;
    throw err;
  });
  return transformersModPromise;
}

/**
 * loadModel — Descarga/prepara el modelo de reconocimiento (perezoso, opt-in).
 * Reporta el avance por `onProgress` (agregado, best-effort). Devuelve `true` si
 * el pipeline quedó listo; `false` si no hay soporte o algo falló. NUNCA lanza.
 *
 * Coste honesto: la 1ª vez descarga ~40-80 MB (según el modelo). Después el
 * navegador lo sirve de su caché y funciona sin conexión.
 */
export async function loadModel(
  onProgress?: (p: OssSttLoadProgress) => void,
  modelId: OssSttModelId = getOssSttModel(),
): Promise<boolean> {
  const emit = (p: OssSttLoadProgress) => {
    try {
      onProgress?.(p);
    } catch {
      /* la UI puede fallar; el motor no */
    }
  };

  if (!isOssSttSupported()) {
    emit({
      status: "unsupported",
      progress: 0,
      message: "Este navegador no reúne los requisitos (WebAssembly / micrófono).",
    });
    return false;
  }

  // Si ya hay pipeline listo para ESTE modelo, no re-descargamos.
  if (pipelinePromise && pipelineModelId === modelId) {
    try {
      await pipelinePromise;
      emit({ status: "ready", progress: 100, message: "Modelo listo (ya descargado)." });
      return true;
    } catch {
      pipelinePromise = null;
      pipelineModelId = null;
    }
  }

  const spec = OSS_STT_MODELS[modelId] ?? OSS_STT_MODELS.tiny;

  emit({ status: "loading", progress: 1, message: `Preparando ${spec.label}…` });

  // Progreso agregado: transformers.js llama por CADA fichero; promediamos.
  // Guardamos también bytes (loaded/total) cuando llegan, para un % más honesto
  // que ponderar por fichero (los pesos difieren mucho de tamaño).
  const fileProgress = new Map<string, number>();
  const fileBytes = new Map<string, { loaded: number; total: number }>();
  /** Nombre corto y legible del fichero en curso (sin la ruta del Hub). */
  const shortFile = (file?: string) => {
    if (!file) return undefined;
    const parts = file.split("/");
    return parts[parts.length - 1] || file;
  };
  const reportAggregate = (file?: string) => {
    // Preferimos el % ponderado por bytes si tenemos totales fiables.
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
      // Fallback: media simple de los porcentajes por fichero.
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
        ? `Descargando ${spec.label} (${spec.approxSize}) · ${shown} — ${pct}%`
        : `Descargando ${spec.label} (${spec.approxSize}) — ${pct}%`,
    });
  };

  pipelineModelId = modelId;
  pipelinePromise = (async () => {
    const mod = await importTransformers();
    if (typeof mod?.pipeline !== "function") {
      throw new Error("El módulo de transformers.js no expone pipeline().");
    }
    emit({ status: "loading", progress: 2, message: `Conectando con el Hub para ${spec.label}…` });
    const progressCallback = (data: any) => {
      try {
        const file: string | undefined = data?.file;
        // status: 'initiate' | 'download' | 'progress' | 'done' | 'ready'
        if (data?.status === "progress" && file) {
          const p = typeof data.progress === "number" ? data.progress : 0;
          fileProgress.set(file, p);
          // Bytes, si los reporta (para un % agregado ponderado más honesto).
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
    // Tarea 'automatic-speech-recognition' con el modelo Whisper del Hub.
    const asr = await mod.pipeline("automatic-speech-recognition", spec.repo, {
      progress_callback: progressCallback,
    });
    return asr;
  })().catch((err) => {
    // Deja re-intentar; propaga para el emit de error de abajo.
    pipelinePromise = null;
    pipelineModelId = null;
    throw err;
  });

  try {
    await pipelinePromise;
    emit({ status: "ready", progress: 100, message: "Modelo listo. Funciona sin conexión." });
    return true;
  } catch (err) {
    const msg = (err as { message?: string })?.message || "No se pudo cargar el modelo.";
    emit({
      status: "error",
      progress: 0,
      message: `Error al cargar el modelo: ${msg}`,
    });
    return false;
  }
}

/** ¿Hay un pipeline ya cargado y listo (para el modelo indicado o cualquiera)? */
export function isModelReady(modelId?: OssSttModelId): boolean {
  if (!pipelinePromise) return false;
  if (modelId && pipelineModelId !== modelId) return false;
  return true;
}

// ── Captura + VAD + transcripción por segmentos ──────────────────────────────

// Estado de la sesión de captura activa (una a la vez; simple y suficiente).
let activeSession: OssSttSession | null = null;

/**
 * startOssStt — Arranca la captura del micrófono y transcribe por segmentos.
 * Devuelve una sesión con `stop()`. Si el modelo aún no está cargado, intenta
 * cargarlo primero (perezoso). NUNCA lanza: los fallos van por `onError`.
 */
export async function startOssStt(opts: StartOssSttOptions): Promise<OssSttSession> {
  const noop: OssSttSession = { stop: () => {}, isActive: () => false };
  const fail = (message: string) => {
    try {
      opts.onError?.(message);
    } catch {
      /* */
    }
    return noop;
  };

  if (!isOssSttSupported()) {
    return fail("Reconocimiento open-source no soportado en este navegador.");
  }

  // Si ya había una sesión, la cerramos (sólo una captura a la vez).
  try {
    activeSession?.stop();
  } catch {
    /* */
  }

  const modelId = getOssSttModel();
  if (!isModelReady(modelId)) {
    const ok = await loadModel(undefined, modelId);
    if (!ok) return fail("El modelo no está listo. Descárgalo primero desde Ajustes.");
  }

  // Pedimos el micrófono (stream propio de la sesión; lo liberamos al parar).
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch (err) {
    const name = (err as { name?: string })?.name || "";
    const denied = name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError";
    return fail(
      denied
        ? "Sin permiso de micrófono. Concédelo para escuchar."
        : "No se pudo abrir el micrófono.",
    );
  }

  // AudioContext para analizar energía (VAD) y acumular muestras del segmento.
  const Ctx =
    (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
      .AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!Ctx) {
    try {
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      /* */
    }
    return fail("Este navegador no expone AudioContext.");
  }

  const audioCtx: AudioContext = new Ctx();
  // Nota: el sampleRate del contexto puede no ser 16k; remuestreamos al transcribir.
  const inputRate = audioCtx.sampleRate || 48000;
  const source = audioCtx.createMediaStreamSource(stream);
  // ScriptProcessor está deprecado pero es el camino más compatible (Firefox
  // incluido) sin AudioWorklet extra; lo usamos de forma acotada y defensiva.
  const BUFFER = 4096;
  const processor = audioCtx.createScriptProcessor
    ? audioCtx.createScriptProcessor(BUFFER, 1, 1)
    : null;

  if (!processor) {
    try {
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      void audioCtx.close();
    } catch {
      /* */
    }
    return fail("Este navegador no permite el análisis de audio necesario.");
  }

  let stopped = false;
  let speaking = false;
  let speechStartAt = 0;
  let lastVoiceAt = 0;
  let segmentChunks: Float32Array[] = [];
  let segmentLength = 0;
  let interimNotifiedAt = 0;

  // ── Estado del VAD adaptativo ──────────────────────────────────────────────
  // Suelo de ruido móvil (RMS). Empieza en el mínimo; se calibra al arrancar y
  // luego se adapta lentamente durante los silencios.
  let noiseFloor = VAD_NOISE_FLOOR_MIN;
  let calibrationBlocks = 0;
  let calibrationSum = 0;

  // Ring buffer de PRE-ROLL: guarda los últimos bloques ANTES de detectar voz,
  // para no cortar la primera sílaba de la frase. Tamaño según VAD_PREROLL_MS.
  const prerollMaxBlocks = Math.max(
    1,
    Math.ceil((VAD_PREROLL_MS / 1000) * inputRate / BUFFER),
  );
  let preroll: Float32Array[] = [];

  /** Umbral de INICIO de voz derivado del suelo de ruido actual (histéresis). */
  const speechThreshold = () =>
    Math.min(
      VAD_NOISE_FLOOR_MAX * VAD_SPEECH_MULT,
      noiseFloor * VAD_SPEECH_MULT + VAD_SPEECH_MARGIN,
    );

  const resetSegment = () => {
    segmentChunks = [];
    segmentLength = 0;
    speaking = false;
    speechStartAt = 0;
  };

  // Idioma efectivo: prioriza el pasado por llamada; si no, la preferencia
  // persistida (español por defecto). undefined ⇒ Whisper autodetecta.
  const effectiveLang = opts.lang || getOssSttLangCode();

  // Post-proceso ligero del texto de Whisper: recorta y filtra alucinaciones
  // típicas del modelo en silencios/ruido (etiquetas y muletillas de subtítulos).
  const HALLUCINATION_RE =
    /^(?:\s*[\[(][^\])]*[\])]\s*|gracias(?: por ver(?:me)?)?\.?|subt[íi]tulos[^.]*\.?|thanks for watching\.?|you\.?|\.|\s)+$/i;
  const cleanTranscript = (raw: string): string => {
    let t = raw.trim();
    // Quita etiquetas entre corchetes/paréntesis al inicio (p. ej. "[Música]").
    t = t.replace(/^\s*[\[(][^\])]*[\])]\s*/g, "").trim();
    return t;
  };

  // Transcribe un buffer PCM (Float32, mono, a inputRate) — remuestrea a 16k.
  // Con reintento defensivo ante fallos transitorios (WASM ocupado, GC…).
  const transcribeSegment = async (pcm: Float32Array) => {
    const asr = pipelinePromise ? await pipelinePromise.catch(() => null) : null;
    if (!asr) return;
    let audio = pcm;
    if (inputRate !== TARGET_SAMPLE_RATE) {
      try {
        audio = resampleLinear(pcm, inputRate, TARGET_SAMPLE_RATE);
      } catch {
        audio = pcm; // si el remuestreo falla, probamos con el original
      }
    }
    let lastErr: unknown = null;
    for (let attempt = 0; attempt <= TRANSCRIBE_RETRIES; attempt++) {
      if (stopped) return;
      try {
        const out: any = await asr(audio, {
          language: effectiveLang || undefined,
          task: "transcribe",
          chunk_length_s: 30,
          stride_length_s: 5,
          // Sin muestreo aleatorio: salidas estables/repetibles.
          do_sample: false,
        });
        const raw = typeof out?.text === "string" ? out.text : "";
        const text = cleanTranscript(raw);
        if (text && !HALLUCINATION_RE.test(raw) && !stopped) {
          try {
            opts.onResult(text);
          } catch {
            /* la UI/consumidor puede fallar; el motor no */
          }
        }
        return; // éxito (aunque el texto quedara vacío tras limpiar)
      } catch (err) {
        lastErr = err;
        // Pequeña espera antes de reintentar (deja respirar al runtime WASM).
        if (attempt < TRANSCRIBE_RETRIES) {
          await new Promise((r) => setTimeout(r, 120));
        }
      }
    }
    // Agotados los reintentos: segmento no decodificable → seguimos escuchando.
    void lastErr;
    try {
      opts.onError?.("No se pudo transcribir un fragmento; sigo escuchando.");
    } catch {
      /* */
    }
  };

  const flushIfSpeech = () => {
    if (segmentLength === 0) return;
    const durMs = (segmentLength / inputRate) * 1000;
    if (durMs < VAD_MIN_SPEECH_MS) {
      resetSegment();
      return;
    }
    // Concatena los chunks en un único Float32Array.
    const merged = new Float32Array(segmentLength);
    let offset = 0;
    for (const c of segmentChunks) {
      merged.set(c, offset);
      offset += c.length;
    }
    resetSegment();
    // Transcribe sin bloquear el hilo de audio (fire-and-forget defensivo).
    void transcribeSegment(merged);
  };

  processor.onaudioprocess = (ev: AudioProcessingEvent) => {
    if (stopped) return;
    let input: Float32Array;
    try {
      input = ev.inputBuffer.getChannelData(0);
    } catch {
      return;
    }
    // RMS del bloque para el VAD.
    let sumSq = 0;
    for (let i = 0; i < input.length; i++) {
      const s = input[i];
      sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / (input.length || 1));
    const now = performance.now();

    // ── Calibración inicial del suelo de ruido (primeros ~0.85 s) ────────────
    if (calibrationBlocks < VAD_CALIBRATION_BLOCKS) {
      calibrationBlocks += 1;
      calibrationSum += rms;
      if (calibrationBlocks === VAD_CALIBRATION_BLOCKS) {
        const avg = calibrationSum / VAD_CALIBRATION_BLOCKS;
        noiseFloor = Math.min(
          VAD_NOISE_FLOOR_MAX,
          Math.max(VAD_NOISE_FLOOR_MIN, avg),
        );
      }
      // Durante la calibración guardamos pre-roll pero no detectamos voz aún.
      preroll.push(new Float32Array(input));
      if (preroll.length > prerollMaxBlocks) preroll.shift();
      return;
    }

    const startTh = speechThreshold();
    // Para SEGUIR hablando basta un umbral menor (histéresis anti-parpadeo).
    const continueTh = startTh * VAD_RELEASE_RATIO;
    const isVoice = speaking ? rms >= continueTh : rms >= startTh;

    if (isVoice) {
      // Hay voz.
      if (!speaking) {
        speaking = true;
        speechStartAt = now;
        // Prepend del PRE-ROLL para no perder la primera sílaba.
        for (const b of preroll) {
          segmentChunks.push(b);
          segmentLength += b.length;
        }
        preroll = [];
      }
      lastVoiceAt = now;
      // Copiamos el bloque (el buffer se reutiliza) y lo acumulamos.
      segmentChunks.push(new Float32Array(input));
      segmentLength += input.length;
      // Señal de "te oigo" (throttled) — no es texto real.
      if (opts.onInterim && now - interimNotifiedAt > 400) {
        interimNotifiedAt = now;
        try {
          opts.onInterim("…");
        } catch {
          /* */
        }
      }
      // Corte por segmento demasiado largo (evita OOM en monólogos infinitos).
      if (now - speechStartAt >= VAD_MAX_SEGMENT_MS) {
        flushIfSpeech();
      }
    } else if (speaking) {
      // Silencio tras voz: seguimos acumulando un poco (cola de la frase)…
      segmentChunks.push(new Float32Array(input));
      segmentLength += input.length;
      // …y si el silencio persiste, cerramos el segmento.
      if (now - lastVoiceAt >= VAD_SILENCE_MS) {
        flushIfSpeech();
      }
    } else {
      // Silencio real: adaptamos MUY lentamente el suelo de ruido (sólo baja o
      // sube poco a poco) y mantenemos el ring de pre-roll al día.
      noiseFloor =
        VAD_NOISE_SMOOTHING * noiseFloor + (1 - VAD_NOISE_SMOOTHING) * rms;
      if (noiseFloor < VAD_NOISE_FLOOR_MIN) noiseFloor = VAD_NOISE_FLOOR_MIN;
      if (noiseFloor > VAD_NOISE_FLOOR_MAX) noiseFloor = VAD_NOISE_FLOOR_MAX;
      preroll.push(new Float32Array(input));
      if (preroll.length > prerollMaxBlocks) preroll.shift();
    }
  };

  try {
    source.connect(processor);
    // Conexión "muda" al destino para que el nodo procese (ganancia 0).
    const sink = audioCtx.createGain();
    sink.gain.value = 0;
    processor.connect(sink);
    sink.connect(audioCtx.destination);
  } catch {
    // Aun sin conectar al destino, en algunos navegadores procesa; seguimos.
  }

  const session: OssSttSession = {
    isActive: () => !stopped,
    stop: () => {
      if (stopped) return;
      stopped = true;
      try {
        processor.onaudioprocess = null as unknown as (ev: AudioProcessingEvent) => void;
        processor.disconnect();
      } catch {
        /* */
      }
      try {
        source.disconnect();
      } catch {
        /* */
      }
      try {
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        /* */
      }
      try {
        void audioCtx.close();
      } catch {
        /* */
      }
      if (activeSession === session) activeSession = null;
    },
  };

  activeSession = session;
  return session;
}

/** Detiene la sesión de captura activa (si la hay). Idempotente / SSR-safe. */
export function stopOssStt(): void {
  try {
    activeSession?.stop();
  } catch {
    /* */
  }
  activeSession = null;
}

/** ¿Hay una sesión de captura open-source activa ahora mismo? */
export function isOssSttListening(): boolean {
  return !!activeSession && activeSession.isActive();
}

// ── Puente a Aurora (no invasivo) ─────────────────────────────────────────────

/**
 * pipeOssSttToAurora — Arranca el STT open-source y envía cada texto FINAL a
 * Aurora por el puente global `window.STARSEED_AURORA.send(text)`. Así el
 * fallback alimenta a Aurora SIN tocar su motor.
 *
 * Devuelve la misma `OssSttSession` (con `stop()`). Si el puente no está listo,
 * el texto se ignora en silencio (no rompe). Se puede componer con un `onResult`
 * propio del llamante (p. ej. para reflejar el texto en la UI del panel).
 */
export async function pipeOssSttToAurora(
  opts: Omit<StartOssSttOptions, "onResult"> & {
    /** Callback opcional adicional con cada texto final (además de enviarlo a Aurora). */
    onResult?: (text: string) => void;
  } = {},
): Promise<OssSttSession> {
  const { onResult, ...rest } = opts;
  return startOssStt({
    ...rest,
    onResult: (text: string) => {
      // 1) Enviar a Aurora por el puente global (defensivo).
      try {
        const api = (window as unknown as {
          STARSEED_AURORA?: { send?: (t: string) => unknown };
        }).STARSEED_AURORA;
        if (api && typeof api.send === "function") {
          void api.send(text);
        }
      } catch {
        /* si Aurora no está montada, no rompemos: el fallback sigue */
      }
      // 2) Reflejo opcional para el llamante.
      try {
        onResult?.(text);
      } catch {
        /* */
      }
    },
  });
}

// ── Utilidades internas ───────────────────────────────────────────────────────

/**
 * Remuestreo lineal simple de Float32 mono de `fromRate` a `toRate`. Suficiente
 * para VAD/transcripción; evita traer una dependencia de resampling. Defensivo.
 */
function resampleLinear(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || input.length === 0) return input;
  const ratio = fromRate / toRate;
  const outLength = Math.max(1, Math.floor(input.length / ratio));
  const output = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = pos - i0;
    output[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return output;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
