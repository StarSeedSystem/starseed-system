"use client";

/**
 * StarSeed OS — Aurora · Wake-word ACÚSTICO LOCAL (open-source, opt-in)
 * ============================================================================
 * Detector de palabra de activación ("Aurora") que corre 100% en el navegador,
 * SIN mantener el reconocimiento de voz completo (STT) encendido y SIN enviar
 * audio a ningún servidor. Es la alternativa/complemento eficiente y privada al
 * modo de `wake-word.ts`, que observa el TRANSCRIPT del STT nativo (Web Speech)
 * y por tanto obliga a tener corriendo todo el reconocimiento.
 *
 * DOS MOTORES (configurable, honesto sobre el coste)
 * --------------------------------------------------
 *   1) PORCUPINE (preciso) — si el usuario pega un AccessKey de Picovoice.
 *      Porcupine es un motor de wake-word open-source que corre por WebAssembly.
 *      Es GRATIS para uso PERSONAL con un AccessKey que se saca gratis en
 *      https://picovoice.ai (consola). El SDK web `@picovoice/porcupine-web` se
 *      trae por CDN con `import()` dinámico SÓLO al activar (NO es dependencia
 *      del proyecto). Usamos la keyword incorporada más cercana disponible como
 *      "Aurora"; si Picovoice cambia el catálogo, degradamos a `PICOVOICE`/`JARVIS`
 *      u otra builtin sin romper. (Una keyword "Aurora" 100% custom requiere un
 *      fichero .ppn entrenado en la consola; se puede añadir después por URL.)
 *   2) RESPALDO SIMPLE (sin clave) — un detector por ENERGÍA de voz sostenida
 *      (RMS con umbral adaptativo al ruido de fondo, como el VAD de `oss-stt.ts`).
 *      No reconoce la palabra "Aurora": despierta a Aurora cuando detecta que el
 *      usuario ha hablado de forma sostenida (~0.7 s de voz por encima del ruido).
 *      Es MENOS preciso (cualquier voz sostenida la despierta) pero no necesita
 *      clave ni descarga. Útil como "manos libres aproximado".
 *
 * CÓMO DESPIERTA A AURORA
 * -----------------------
 * Al detectar la palabra/voz sostenida se dispara `onWake()`. Por defecto (y
 * además del callback) activamos la voz de Aurora por el puente global
 * `window.STARSEED_AURORA` (start()/toggle()) y emitimos un CustomEvent
 * (`ACOUSTIC_WAKE_FIRED_EVENT`) por si otra superficie quiere reaccionar. Nunca
 * instanciamos otra Aurora ni tocamos su motor/provider.
 *
 * INVARIANTES
 * -----------
 *   · SSR-safe: todo acceso a window/navigator/localStorage está guardado.
 *   · Defensivo: si falta micrófono, WebAssembly, o falla la CDN, degrada por
 *     callback `onError` y NUNCA lanza.
 *   · Carga PEREZOSA por CDN: nada se importa en el arranque; Porcupine sólo se
 *     baja al activar con AccessKey. Sin dependencias nuevas en package.json (el
 *     SDK llega por CDN en runtime; por eso los import dinámicos se tipan `any`).
 *   · Opt-in persistido `starseed.aurora.wake.acoustic` (default OFF).
 *   · AccessKey persistido `starseed.aurora.wake.porcupine.key`.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Claves de persistencia ───────────────────────────────────────────────────
/** Opt-in del wake-word acústico local (independiente del "always-on" del STT). */
export const ACOUSTIC_WAKE_KEY = "starseed.aurora.wake.acoustic";
/** AccessKey de Picovoice (para el motor Porcupine). Vacío ⇒ respaldo simple. */
export const PORCUPINE_KEY_KEY = "starseed.aurora.wake.porcupine.key";
/** Evento (mismo tab) emitido al cambiar el opt-in acústico. */
export const ACOUSTIC_WAKE_EVENT = "starseed:aurora-wake-acoustic";
/** Evento (mismo tab) emitido cuando el detector acústico DESPIERTA a Aurora. */
export const ACOUSTIC_WAKE_FIRED_EVENT = "starseed:aurora-acoustic-wake";

/** Enlace a la consola de Picovoice para conseguir un AccessKey gratuito. */
export const PICOVOICE_CONSOLE_URL = "https://console.picovoice.ai/";
/** Enlace a la web de Picovoice (info del proyecto Porcupine). */
export const PICOVOICE_HOME_URL = "https://picovoice.ai/";

// ── CDN del SDK web de Porcupine (open-source; se trae en runtime, no en build) ─
/**
 * ESM de `@picovoice/porcupine-web` por jsDelivr. Se importa con
 * `import(/* webpackIgnore *​/ URL)` para que ningún bundler intente resolverlo
 * en build (no es dependencia local). Sólo se baja al activar con AccessKey.
 */
const PORCUPINE_CDN =
  "https://cdn.jsdelivr.net/npm/@picovoice/porcupine-web@3.0.3/dist/esm/index.js";

// ── VAD del respaldo simple (mismos principios que oss-stt.ts) ────────────────
/** Tasa objetivo de análisis (no crítica para energía; 16 kHz basta). */
const FALLBACK_SAMPLE_RATE = 16000;
/** Suelo de ruido mínimo asumido (evita umbral 0 en micrófonos perfectos). */
const VAD_NOISE_FLOOR_MIN = 0.004;
/** Suelo de ruido máximo asumido (por si el entorno es muy ruidoso). */
const VAD_NOISE_FLOOR_MAX = 0.08;
/** Cuánto por encima del suelo de ruido tiene que estar el RMS para ser "voz". */
const VAD_SPEECH_MULT = 2.4;
/** Margen absoluto extra sobre el suelo (protege micrófonos silenciosos). */
const VAD_SPEECH_MARGIN = 0.006;
/** Suavizado exponencial del suelo de ruido (0..1; alto = se adapta despacio). */
const VAD_NOISE_SMOOTHING = 0.995;
/** Bloques de calibración inicial (~85 ms cada uno a 4096 muestras). */
const VAD_CALIBRATION_BLOCKS = 10;
/** Voz sostenida (ms) requerida para "despertar" en el respaldo simple. */
const FALLBACK_SUSTAINED_MS = 700;
/** Refractario (ms) tras un despertar antes de poder disparar otra vez. */
const FALLBACK_REFRACTORY_MS = 2500;
/** Tamaño del bloque de análisis del ScriptProcessor. */
const ANALYSER_BLOCK = 4096;

// ── Tipos públicos ────────────────────────────────────────────────────────────

/** Motor efectivo que quedó activo tras `startAcousticWake`. */
export type AcousticWakeEngine = "porcupine" | "energy";

export interface StartAcousticWakeOptions {
  /**
   * Se dispara al detectar la palabra/voz sostenida. Recibe el motor que la
   * detectó. Por defecto TAMBIÉN activamos la voz de Aurora por el puente
   * global (ver `wakeAurora` / `autoWakeAurora`).
   */
  onWake: (engine: AcousticWakeEngine) => void;
  /**
   * AccessKey de Picovoice. Si se omite, se lee de localStorage; si tampoco hay,
   * se usa el RESPALDO SIMPLE por energía (sin clave).
   */
  accessKey?: string;
  /** Se llama ante errores no fatales (permiso, CDN, WebAssembly…). */
  onError?: (message: string) => void;
  /** Cambios de estado del detector (para reflejar en la UI). */
  onStatus?: (status: AcousticWakeStatus) => void;
  /**
   * Si `false`, NO activamos la voz de Aurora automáticamente al despertar (sólo
   * llamamos `onWake`). Por defecto `true`.
   */
  autoWakeAurora?: boolean;
}

/** Estado del detector acústico (para la UI). */
export type AcousticWakeStatus =
  | "idle"
  | "unsupported"
  | "starting"
  | "listening"
  | "error";

export interface AcousticWakeSession {
  /** Detiene el detector y libera el micrófono. Idempotente. */
  stop: () => void;
  /** ¿Sigue escuchando la palabra? */
  isActive: () => boolean;
  /** Motor efectivo en uso ("porcupine" o "energy"). */
  engine: () => AcousticWakeEngine;
}

// ── Persistencia (SSR-safe) ───────────────────────────────────────────────────

/** ¿Está activado el wake-word acústico local? (default OFF). */
export function readAcousticWake(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(ACOUSTIC_WAKE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Activa/desactiva el opt-in y avisa a los suscriptores (mismo tab + storage). */
export function setAcousticWake(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACOUSTIC_WAKE_KEY, on ? "1" : "0");
  } catch {
    /* defensivo */
  }
  try {
    window.dispatchEvent(new CustomEvent<boolean>(ACOUSTIC_WAKE_EVENT, { detail: on }));
  } catch {
    /* defensivo */
  }
}

/** Suscribe a los cambios del opt-in (mismo tab vía evento, otros vía storage). */
export function subscribeAcousticWake(cb: (on: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onCustom = (e: Event) => cb(!!(e as CustomEvent<boolean>).detail);
  const onStorage = (e: StorageEvent) => {
    if (e.key === ACOUSTIC_WAKE_KEY) cb(readAcousticWake());
  };
  window.addEventListener(ACOUSTIC_WAKE_EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(ACOUSTIC_WAKE_EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}

/** Lee el AccessKey de Picovoice persistido (o cadena vacía). SSR-safe. */
export function readPorcupineKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return (window.localStorage.getItem(PORCUPINE_KEY_KEY) || "").trim();
  } catch {
    return "";
  }
}

/** Guarda (o borra, si vacío) el AccessKey de Picovoice. SSR-safe / defensivo. */
export function setPorcupineKey(key: unknown): void {
  if (typeof window === "undefined") return;
  const k = typeof key === "string" ? key.trim() : "";
  try {
    if (k) window.localStorage.setItem(PORCUPINE_KEY_KEY, k);
    else window.localStorage.removeItem(PORCUPINE_KEY_KEY);
  } catch {
    /* defensivo */
  }
}

// ── Soporte (SSR-safe) ────────────────────────────────────────────────────────

/**
 * ¿Es viable el wake-word acústico aquí? Requiere micrófono (getUserMedia) y
 * AudioContext. Porcupine además usa WebAssembly (comprobado, pero el respaldo
 * simple no lo necesita, así que basta con mic + AudioContext). Nunca lanza.
 */
export function isAcousticWakeSupported(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const md = (navigator as any)?.mediaDevices;
    const hasMic = !!md && typeof md.getUserMedia === "function";
    const w = window as unknown as { AudioContext?: unknown; webkitAudioContext?: unknown };
    const hasAudioCtx =
      typeof w.AudioContext !== "undefined" || typeof w.webkitAudioContext !== "undefined";
    return hasMic && hasAudioCtx;
  } catch {
    return false;
  }
}

/** ¿Hay WebAssembly (necesario para el motor Porcupine)? SSR-safe. */
export function hasWebAssembly(): boolean {
  try {
    return typeof WebAssembly === "object" && typeof WebAssembly.instantiate === "function";
  } catch {
    return false;
  }
}

// ── Puente a Aurora (activar la voz al despertar) ─────────────────────────────

/**
 * Activa la voz de Aurora por el puente global (best-effort, defensivo). Si la
 * escucha ya estaba viva, `start()` es idempotente por el supervisor; si no,
 * la arranca. También emitimos un CustomEvent para superficies que escuchen.
 */
export function wakeAurora(engine: AcousticWakeEngine): void {
  if (typeof window === "undefined") return;
  try {
    const api = (window as any).STARSEED_AURORA as
      | { start?: () => void; toggle?: () => void; setEnabled?: (v: boolean) => void }
      | undefined;
    if (api) {
      // Preferimos start() (arranca la escucha supervisada sin apagarla si ya va);
      // si no existe, caemos a toggle() como último recurso.
      if (typeof api.start === "function") api.start();
      else if (typeof api.toggle === "function") api.toggle();
    }
  } catch {
    /* defensivo: si Aurora no está montada, no rompemos */
  }
  try {
    window.dispatchEvent(
      new CustomEvent<AcousticWakeEngine>(ACOUSTIC_WAKE_FIRED_EVENT, { detail: engine }),
    );
  } catch {
    /* defensivo */
  }
}

// ── Estado de la sesión activa (una a la vez) ─────────────────────────────────
let activeSession: AcousticWakeSession | null = null;

/** Detiene la sesión de wake-word acústico activa (si la hay). Idempotente. */
export function stopAcousticWake(): void {
  try {
    activeSession?.stop();
  } catch {
    /* */
  }
  activeSession = null;
}

/** ¿Hay un detector acústico activo ahora mismo? */
export function isAcousticWakeActive(): boolean {
  return !!activeSession && activeSession.isActive();
}

/**
 * Arranca el detector de palabra de activación acústico. Elige motor según haya
 * o no AccessKey de Picovoice:
 *   · Con AccessKey (arg o persistido) + WebAssembly ⇒ intenta PORCUPINE por CDN.
 *     Si la carga/creación falla, DEGRADA al respaldo simple (no rompe).
 *   · Sin AccessKey ⇒ RESPALDO SIMPLE por energía de voz sostenida.
 *
 * Reemplaza cualquier sesión previa (sólo una a la vez). Devuelve la sesión con
 * `stop()`. SSR-safe / defensivo: ante fallo llama `onError` y devuelve una
 * sesión inerte.
 */
export async function startAcousticWake(
  opts: StartAcousticWakeOptions,
): Promise<AcousticWakeSession> {
  const { onWake, onError, onStatus, autoWakeAurora = true } = opts;
  const key = (opts.accessKey ?? readPorcupineKey()).trim();

  const emitStatus = (s: AcousticWakeStatus) => {
    try {
      onStatus?.(s);
    } catch {
      /* */
    }
  };
  const emitError = (m: string) => {
    try {
      onError?.(m);
    } catch {
      /* */
    }
  };

  // Fija/despierta: dispara onWake + (opcional) activa la voz de Aurora.
  const fire = (engine: AcousticWakeEngine) => {
    try {
      onWake(engine);
    } catch {
      /* defensivo */
    }
    if (autoWakeAurora) wakeAurora(engine);
  };

  // Cierra cualquier sesión anterior antes de abrir otra.
  stopAcousticWake();

  if (typeof window === "undefined") {
    return inertSession("energy");
  }
  if (!isAcousticWakeSupported()) {
    emitStatus("unsupported");
    emitError("Este navegador no admite captura de micrófono para el wake-word acústico.");
    return inertSession("energy");
  }

  emitStatus("starting");

  // 1) Intento PORCUPINE si hay AccessKey + WebAssembly.
  if (key && hasWebAssembly()) {
    try {
      const session = await startPorcupine(key, fire, emitStatus, emitError);
      if (session) {
        activeSession = session;
        emitStatus("listening");
        return session;
      }
      // startPorcupine devolvió null ⇒ degradamos al respaldo simple.
    } catch (e: any) {
      emitError(
        `No se pudo iniciar Porcupine (${String(e?.message || e || "error")}). ` +
          "Usando el detector simple de respaldo.",
      );
    }
  }

  // 2) RESPALDO SIMPLE por energía (sin clave o si Porcupine falló).
  try {
    const session = await startEnergyDetector(fire, emitStatus, emitError);
    activeSession = session;
    emitStatus("listening");
    return session;
  } catch (e: any) {
    emitStatus("error");
    emitError(`No se pudo iniciar el detector acústico (${String(e?.message || e || "error")}).`);
    return inertSession("energy");
  }
}

/** Sesión inerte (para degradación silenciosa). */
function inertSession(engine: AcousticWakeEngine): AcousticWakeSession {
  return { stop: () => {}, isActive: () => false, engine: () => engine };
}

// ── Motor 1: Porcupine (CDN, opt-in con AccessKey) ────────────────────────────

// Cacheamos el módulo del SDK entre llamadas (no re-descargar el ESM por CDN).
let porcupineModPromise: Promise<any> | null = null;

/** Importa `@picovoice/porcupine-web` desde la CDN una sola vez (memoizado). */
async function importPorcupine(): Promise<any> {
  if (porcupineModPromise) return porcupineModPromise;
  porcupineModPromise = (async () => {
    // `webpackIgnore` / `@vite-ignore`: import de runtime puro, no lo resuelve el bundler.
    const mod: any = await import(/* webpackIgnore: true */ /* @vite-ignore */ PORCUPINE_CDN);
    return mod;
  })();
  return porcupineModPromise;
}

/**
 * Arranca el motor Porcupine con una keyword incorporada cercana a "Aurora".
 * Devuelve la sesión, o `null` si el catálogo de builtins no permitió crear el
 * worker (para que el llamante degrade al respaldo simple). Defensivo: nunca
 * lanza por causas recuperables; propaga sólo errores realmente inesperados.
 */
async function startPorcupine(
  accessKey: string,
  fire: (engine: AcousticWakeEngine) => void,
  emitStatus: (s: AcousticWakeStatus) => void,
  emitError: (m: string) => void,
): Promise<AcousticWakeSession | null> {
  const mod = await importPorcupine();

  // El SDK exporta `PorcupineWorker` (v3) con `.create(...)`. Y las keywords
  // incorporadas viven en `BuiltInKeyword` (enum). Somos defensivos ante cambios.
  const PorcupineWorker: any = mod?.PorcupineWorker ?? mod?.default?.PorcupineWorker;
  const BuiltInKeyword: any = mod?.BuiltInKeyword ?? mod?.default?.BuiltInKeyword ?? {};

  if (!PorcupineWorker || typeof PorcupineWorker.create !== "function") {
    emitError(
      "El SDK de Porcupine no se cargó correctamente desde la CDN. " +
        "Usando el detector simple de respaldo.",
    );
    return null;
  }

  // Elegimos la keyword incorporada más cercana a "Aurora". Picovoice ofrece un
  // set de builtins (varía por versión). Preferimos algo evocador; si "Aurora"
  // no existe como builtin (habitual: requiere .ppn custom), usamos una cercana.
  // El orden es de preferencia; tomamos la primera que exista en el enum.
  const preferredNames = [
    "AURORA",
    "PICOVOICE",
    "PORCUPINE",
    "COMPUTER",
    "JARVIS",
    "ALEXA",
    "HEY_GOOGLE",
    "OK_GOOGLE",
    "HEY_SIRI",
    "GRASSHOPPER",
    "BUMBLEBEE",
    "BLUEBERRY",
    "TERMINATOR",
  ];
  let keyword: any = null;
  for (const name of preferredNames) {
    if (BuiltInKeyword && BuiltInKeyword[name] != null) {
      keyword = BuiltInKeyword[name];
      break;
    }
  }
  // Último recurso: primer valor cualquiera del enum.
  if (keyword == null) {
    const vals = Object.values(BuiltInKeyword || {}).filter((v) => typeof v === "string");
    keyword = vals[0] ?? null;
  }
  if (keyword == null) {
    emitError(
      "El catálogo de palabras incorporadas de Porcupine no está disponible. " +
        "Usando el detector simple de respaldo.",
    );
    return null;
  }

  // El worker necesita el modelo Porcupine (parámetros del idioma) por URL. El
  // SDK web resuelve el .pv incorporado si le damos el objeto modelo por defecto
  // apuntando a su CDN de assets (parámetros EN por defecto).
  const modelPublicPath =
    "https://cdn.jsdelivr.net/npm/@picovoice/porcupine-web@3.0.3/dist/pv_porcupine_params.pv";

  let worker: any = null;
  let refractoryUntil = 0;

  const keywordCallback = (_detection: any) => {
    const now = Date.now();
    if (now < refractoryUntil) return; // evita ráfagas de detecciones seguidas
    refractoryUntil = now + FALLBACK_REFRACTORY_MS;
    fire("porcupine");
  };

  try {
    // Firma v3: PorcupineWorker.create(accessKey, keywords, keywordCallback, model)
    worker = await PorcupineWorker.create(
      accessKey,
      keyword,
      keywordCallback,
      { publicPath: modelPublicPath, forceWrite: true },
    );
  } catch (e: any) {
    emitError(
      `Porcupine rechazó el arranque (${String(e?.message || e || "error")}). ` +
        "Comprueba tu AccessKey. Usando el detector simple de respaldo.",
    );
    try {
      worker?.terminate?.();
    } catch {
      /* */
    }
    return null;
  }

  // Conectamos el micrófono al worker mediante el módulo de audio web de Picovoice
  // si está disponible; si no, usamos nuestro propio pump con WebAudio.
  const WebVoiceProcessor: any =
    mod?.WebVoiceProcessor ?? mod?.default?.WebVoiceProcessor ?? null;

  let detachAudio: (() => void) | null = null;
  let active = true;

  if (WebVoiceProcessor && typeof WebVoiceProcessor.subscribe === "function") {
    try {
      await WebVoiceProcessor.subscribe(worker);
      detachAudio = () => {
        try {
          void WebVoiceProcessor.unsubscribe(worker);
        } catch {
          /* */
        }
      };
    } catch (e: any) {
      // Si el VoiceProcessor de Picovoice falla (permiso, etc.), degradamos.
      emitError(
        `No se pudo conectar el micrófono a Porcupine (${String(
          e?.message || e || "error",
        )}). Usando el detector simple de respaldo.`,
      );
      try {
        worker?.release?.();
        worker?.terminate?.();
      } catch {
        /* */
      }
      return null;
    }
  } else {
    // Sin VoiceProcessor: alimentamos el worker con frames PCM int16 a 16 kHz.
    try {
      detachAudio = await pumpMicToWorker(worker);
    } catch (e: any) {
      emitError(
        `No se pudo capturar el micrófono para Porcupine (${String(
          e?.message || e || "error",
        )}). Usando el detector simple de respaldo.`,
      );
      try {
        worker?.release?.();
        worker?.terminate?.();
      } catch {
        /* */
      }
      return null;
    }
  }

  const stop = () => {
    if (!active) return;
    active = false;
    try {
      detachAudio?.();
    } catch {
      /* */
    }
    try {
      worker?.release?.();
    } catch {
      /* */
    }
    try {
      worker?.terminate?.();
    } catch {
      /* */
    }
    emitStatus("idle");
  };

  return {
    stop,
    isActive: () => active,
    engine: () => "porcupine",
  };
}

/**
 * Alimenta un `PorcupineWorker` con frames PCM int16 (frameLength del worker,
 * típicamente 512 muestras) a 16 kHz, capturados por WebAudio. Devuelve una
 * función para desconectar/liberar el micrófono. Sólo se usa si el
 * `WebVoiceProcessor` del SDK no está disponible.
 */
async function pumpMicToWorker(worker: any): Promise<() => void> {
  const frameLength: number = Number(worker?.frameLength) > 0 ? Number(worker.frameLength) : 512;
  const { ctx, source, stream } = await openMic();

  const processor = ctx.createScriptProcessor(ANALYSER_BLOCK, 1, 1);
  let acc: number[] = [];

  processor.onaudioprocess = (ev: AudioProcessingEvent) => {
    let input: Float32Array;
    try {
      input = ev.inputBuffer.getChannelData(0);
    } catch {
      return;
    }
    const resampled = resampleLinear(input, ctx.sampleRate, FALLBACK_SAMPLE_RATE);
    // Acumula y trocea en frames de `frameLength` int16.
    for (let i = 0; i < resampled.length; i++) {
      const s = Math.max(-1, Math.min(1, resampled[i]));
      acc.push(s < 0 ? s * 0x8000 : s * 0x7fff);
    }
    while (acc.length >= frameLength) {
      const frame = Int16Array.from(acc.slice(0, frameLength));
      acc = acc.slice(frameLength);
      try {
        worker?.process?.(frame);
      } catch {
        /* */
      }
    }
  };

  source.connect(processor);
  // Conectamos a un nodo mudo para que el grafo procese (sin salida audible).
  const sink = ctx.createGain();
  sink.gain.value = 0;
  processor.connect(sink);
  sink.connect(ctx.destination);

  return () => {
    try {
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
      sink.disconnect();
    } catch {
      /* */
    }
    stopStream(stream);
    try {
      void ctx.close();
    } catch {
      /* */
    }
  };
}

// ── Motor 2: Respaldo simple por ENERGÍA de voz sostenida ─────────────────────

/**
 * Detector sin clave: escucha el micrófono y despierta a Aurora cuando detecta
 * VOZ SOSTENIDA (RMS por encima de un umbral adaptativo al ruido de fondo,
 * durante ~FALLBACK_SUSTAINED_MS). No reconoce la palabra "Aurora"; es un
 * "manos libres aproximado". Mismos principios de VAD que `oss-stt.ts`.
 */
async function startEnergyDetector(
  fire: (engine: AcousticWakeEngine) => void,
  emitStatus: (s: AcousticWakeStatus) => void,
  _emitError: (m: string) => void,
): Promise<AcousticWakeSession> {
  const { ctx, source, stream } = await openMic();

  const processor = ctx.createScriptProcessor(ANALYSER_BLOCK, 1, 1);

  // Estado del VAD adaptativo.
  let noiseFloor = VAD_NOISE_FLOOR_MIN;
  let calibrated = 0;
  let voiceMs = 0; // acumulado de voz continua
  let refractoryUntil = 0;
  const blockMs = (ANALYSER_BLOCK / (ctx.sampleRate || 44100)) * 1000;

  let active = true;

  processor.onaudioprocess = (ev: AudioProcessingEvent) => {
    if (!active) return;
    let input: Float32Array;
    try {
      input = ev.inputBuffer.getChannelData(0);
    } catch {
      return;
    }

    // RMS del bloque.
    let sum = 0;
    for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
    const rms = Math.sqrt(sum / Math.max(1, input.length));

    // Calibración inicial: fija el suelo de ruido con los primeros bloques.
    if (calibrated < VAD_CALIBRATION_BLOCKS) {
      noiseFloor = calibrated === 0 ? rms : noiseFloor * 0.6 + rms * 0.4;
      calibrated++;
      noiseFloor = Math.min(VAD_NOISE_FLOOR_MAX, Math.max(VAD_NOISE_FLOOR_MIN, noiseFloor));
      return;
    }

    // Umbral de voz por encima del suelo de ruido (con margen absoluto).
    const speechThreshold = Math.max(
      noiseFloor * VAD_SPEECH_MULT,
      noiseFloor + VAD_SPEECH_MARGIN,
    );

    const isVoice = rms > speechThreshold;

    if (isVoice) {
      voiceMs += blockMs;
      const now = Date.now();
      if (voiceMs >= FALLBACK_SUSTAINED_MS && now >= refractoryUntil) {
        refractoryUntil = now + FALLBACK_REFRACTORY_MS;
        voiceMs = 0;
        fire("energy");
      }
    } else {
      // Silencio: relaja el acumulador y adapta lentamente el suelo de ruido.
      voiceMs = Math.max(0, voiceMs - blockMs);
      noiseFloor =
        noiseFloor * VAD_NOISE_SMOOTHING + rms * (1 - VAD_NOISE_SMOOTHING);
      noiseFloor = Math.min(VAD_NOISE_FLOOR_MAX, Math.max(VAD_NOISE_FLOOR_MIN, noiseFloor));
    }
  };

  source.connect(processor);
  const sink = ctx.createGain();
  sink.gain.value = 0;
  processor.connect(sink);
  sink.connect(ctx.destination);

  const stop = () => {
    if (!active) return;
    active = false;
    try {
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
      sink.disconnect();
    } catch {
      /* */
    }
    stopStream(stream);
    try {
      void ctx.close();
    } catch {
      /* */
    }
    emitStatus("idle");
  };

  return {
    stop,
    isActive: () => active,
    engine: () => "energy",
  };
}

// ── Utilidades de captura WebAudio (compartidas) ──────────────────────────────

interface MicHandles {
  ctx: AudioContext;
  source: MediaStreamAudioSourceNode;
  stream: MediaStream;
}

/** Abre el micrófono y crea un AudioContext + source. Lanza si falla el permiso. */
async function openMic(): Promise<MicHandles> {
  const w = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const AC = w.AudioContext || w.webkitAudioContext;
  if (!AC) throw new Error("AudioContext no disponible");

  const md = (navigator as any).mediaDevices;
  const stream: MediaStream = await md.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });

  const ctx = new AC();
  // Algunos navegadores arrancan el contexto suspendido; lo reanudamos.
  try {
    if (ctx.state === "suspended") await ctx.resume();
  } catch {
    /* */
  }
  const source = ctx.createMediaStreamSource(stream);
  return { ctx, source, stream };
}

/** Detiene todas las pistas de un MediaStream. Defensivo. */
function stopStream(stream: MediaStream | null): void {
  try {
    stream?.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        /* */
      }
    });
  } catch {
    /* */
  }
}

/**
 * Remuestreo lineal simple de Float32 mono de `fromRate` a `toRate`. Suficiente
 * para VAD/wake-word; evita traer una dependencia de resampling. Defensivo.
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
