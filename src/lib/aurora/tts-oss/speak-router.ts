"use client";

/**
 * StarSeed OS — Enrutador de VOZ de Aurora (elige el motor activo, con fallback).
 * ============================================================================
 * Punto ÚNICO al que el engine de Aurora (`engine.ts`) delega el habla. Lee la
 * config unificada (`voice-config.ts`, clave `starseed.aurora.voice.v1`), pide la
 * CADENA al registro de motores (`engine-registry.ts`) y la recorre hasta que
 * alguien habla. Regla de oro: **Aurora SIEMPRE habla**.
 *
 * La cadena la construye `buildVoiceChain()` (ver engine-registry.ts para el
 * orden completo y su porqué). En resumen:
 *
 *   pin de la personalidad activa (si fija motor de voz)
 *     → motor elegido por el usuario (si no es el navegador)
 *     → SELECCIÓN AUTOMÁTICA: el mejor motor CONFIGURADO por realismo
 *       (VoxCPM → Voicebox → GPT-SoVITS → Bark → OmniVoice)
 *     → Kokoro (local, si su modelo está listo o el usuario autorizó la descarga)
 *     → `false` ⇒ el engine usa la voz del NAVEGADOR (que a su vez elige la
 *       MEJOR RANKEADA vía browser-voices.ts). Este último eslabón NUNCA falla.
 *
 * La novedad de la Adenda 67 (P2-3) es que la selección automática ya no exige
 * que el usuario "cambie de motor": basta con que exista un endpoint. Si hay un
 * VoxCPM vivo, Aurora habla con VoxCPM aunque su config diga "navegador". Y si
 * ese VoxCPM se cae, la MISMA frase sale por el siguiente eslabón sin que el
 * usuario note nada. Quien no tiene ningún servidor no paga NADA: los motores
 * sin endpoint ni siquiera entran en la cadena (cero red, cero latencia).
 *
 * MODO SIMBIÓTICO (bark + gpt-sovits con endpoint): la voz se enruta primero a
 * GPT-SoVITS usando la referencia elegida (`engines["gpt-sovits"].refAudio`,
 * que puede ser una muestra generada por Bark — SoVITS la clona/refina), con
 * Bark como siguiente eslabón. Se activa con `symbiotic: true` en la config.
 *
 * Cada eslabón va envuelto en `Promise.resolve().then(...).catch(...)`: un
 * fallo en un motor NUNCA revienta la cadena (nunca lanzar sin capturar).
 *
 * Contrato de retorno pensado para un enganche NO invasivo:
 *   speakWithConfiguredEngine(...) → Promise<boolean>
 *     true  = un motor OSS/neural habló (o al menos se hizo cargo del turno).
 *     false = no aplica / nada disponible → el llamador usa el navegador.
 *
 * El engine llama a onStart/onEnd para mantener latiendo el orbe de Aurora
 * alrededor del audio (bus de glow), igual que hace con speechSynthesis. Solo
 * el eslabón que REALMENTE empieza a sonar dispara onStart/onEnd del llamador.
 *
 * SSR-safe, defensivo. NUNCA lanza.
 */

import {
  buildVoiceChain,
  refreshPersonalityVoicePin,
  resolveActiveVoiceEngine,
  type VoiceChainLink,
} from "@/lib/aurora/tts-oss/engine-registry";
import {
  getEngineSettings,
  getVoiceConfig,
  isNeuralEngine,
  type AuroraVoiceConfig,
  type NeuralEngineSettings,
} from "@/lib/aurora/tts-oss/voice-config";

/**
 * Evento global de PROCESAMIENTO DE VOZ (Adenda V2-VOZ). Lo pinta el
 * `VoiceProcessingIndicator` sobre cada chat: 'start' antes de intentar la cadena,
 * 'end' cuando el audio EMPIEZA a sonar o cuando la cadena se rinde.
 */
const VOICE_PROCESSING_EVENT = "starseed:voice-processing";

function emitVoiceProcessing(state: "start" | "end", engine?: string): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent(VOICE_PROCESSING_EVENT, { detail: { state, engine } }),
    );
  } catch {
    /* */
  }
}

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

// ── Auto-detección de idioma HABLADO (sin dependencias) ─────────────────────
//
// CAUSA RAÍZ del acento inglés al hablar español: `lang` salía SIEMPRE de la
// config persistida (o de su propio default), nunca del texto real que se iba
// a pronunciar — si el texto estaba en un idioma distinto al configurado, el
// código de idioma que viajaba al motor/daemon/Space no tenía nada que ver con
// lo que Aurora iba a decir. `detectSpokenLang` es una heurística LIGERA (cero
// paquetes npm, cero red) que mira el TEXTO FINAL antes de hablar y adivina su
// idioma por diacríticos/puntuación propios + stopwords frecuentes. Se usa en
// `speakWithConfiguredEngine` para anular el `lang` de cada motor SOLO cuando
// la detección es CONFIABLE (varias señales independientes apuntan al mismo
// idioma); ante duda, se respeta `settings.lang` tal cual antes. PURA y
// testeable — nunca lanza.

/** Idiomas que reconocemos por heurística (código ISO corto de 2 letras). */
export type DetectableSpokenLang = "es" | "en" | "pt" | "fr" | "it" | "de";

const DETECTABLE_LANGS: readonly DetectableSpokenLang[] = ["es", "en", "pt", "fr", "it", "de"];

/** Señal de un carácter/puntuación propio del idioma, con su peso. */
interface CharSignal {
  test: RegExp;
  weight: number;
}

/** Peso de CADA stopword distinta que aparece (no escala con repeticiones). */
const WORD_WEIGHT = 1;

/**
 * Diacríticos/puntuación distintivos por idioma. Los MUY exclusivos (ñ¿¡,
 * ção/ã/õ, ß) pesan más que los compartidos entre varias lenguas románicas
 * (á/é/í/ó/ú también existen en portugués; ä/ö/ü no son solo alemanas).
 */
const CHAR_SIGNALS: Record<DetectableSpokenLang, CharSignal[]> = {
  es: [
    { test: /[ñ¿¡]/i, weight: 3 },
    { test: /[áéíóú]/i, weight: 1 },
  ],
  en: [],
  pt: [
    { test: /ção\b/i, weight: 3 },
    { test: /[ãõ]/i, weight: 2 },
    { test: /[áéíóú]/i, weight: 1 },
  ],
  fr: [
    { test: /[çêœ]/i, weight: 2 },
    { test: /è/i, weight: 1 },
  ],
  it: [],
  de: [
    { test: /ß/i, weight: 3 },
    { test: /[äöü]/i, weight: 1 },
  ],
};

/** Stopwords frecuentes por idioma (límite de palabra, sin distinguir mayúsculas). */
const WORD_SIGNALS: Record<DetectableSpokenLang, RegExp[]> = {
  es: [
    /\bque\b/i, /\bde\b/i, /\bla\b/i, /\bel\b/i, /\by\b/i, /\bes\b/i, /\bun\b/i,
    /\buna\b/i, /\bcon\b/i, /\bpara\b/i, /\bporque\b/i, /\best[áa]\b/i, /\blos\b/i,
    /\blas\b/i, /\beste\b/i, /\besta\b/i, /\bmuy\b/i, /\bpero\b/i, /\bmás\b/i,
  ],
  en: [
    /\bthe\b/i, /\band\b/i, /\byou\b/i, /\bis\b/i, /\bare\b/i, /\bof\b/i, /\bto\b/i,
    /\bwith\b/i, /\bthat\b/i, /\bthis\b/i, /\bfor\b/i, /\bnot\b/i, /\bwhat\b/i,
    /\bhave\b/i, /\bwas\b/i,
  ],
  pt: [
    /\bnão\b/i, /\bvocê\b/i, /\best[áa]\b/i, /\bcom\b/i, /\bpara\b/i, /\bisso\b/i,
    /\bmuito\b/i, /\bmas\b/i, /\bsão\b/i, /\bobrigad[oa]\b/i,
  ],
  fr: [
    /\ble\b/i, /\bles\b/i, /\best\b/i, /\bpour\b/i, /\bavec\b/i, /\bque\b/i,
    /\bce\b/i, /\bcette\b/i, /\bnon\b/i, /\bmais\b/i, /\bdes\b/i, /\bmerci\b/i,
  ],
  it: [
    /\bche\b/i, /\bdi\b/i, /\bil\b/i, /\blo\b/i, /\bè\b/i, /\buna?\b/i, /\bcon\b/i,
    /\bper\b/i, /\bsono\b/i, /\bquesto\b/i, /\bcome\b/i, /\bgrazie\b/i, /\bmolto\b/i,
  ],
  de: [
    /\bder\b/i, /\bdie\b/i, /\bdas\b/i, /\bund\b/i, /\bist\b/i, /\bnicht\b/i,
    /\bmit\b/i, /\bf[üu]r\b/i, /\bich\b/i, /\bwir\b/i, /\beine?\b/i, /\bdanke\b/i,
  ],
};

export interface SpokenLangDetection {
  /** Mejor candidato (código ISO corto). */
  lang: DetectableSpokenLang;
  /** ¿Puntuación mínima Y margen claro sobre el segundo candidato? */
  confident: boolean;
}

/**
 * detectSpokenLang — adivina el idioma HABLADO de `text` combinando
 * diacríticos/puntuación propios de cada idioma con stopwords frecuentes.
 * Puntúa cada idioma candidato y exige un mínimo Y un margen claro sobre el
 * segundo para `confident:true`; textos cortos, ambiguos o sin señal
 * suficiente devuelven `confident:false` — el llamador debe entonces respetar
 * el idioma configurado en vez de forzar el detectado. Cobertura: es · en ·
 * pt · fr · it · de. SIN dependencias npm, SIN red. Nunca lanza.
 */
export function detectSpokenLang(text: string): SpokenLangDetection {
  const clean = (text || "").trim();
  // Sin letras suficientes (emoji, número suelto, "Ok.") → no hay base para decidir.
  if (clean.length < 8 || !/[A-Za-zÀ-ÖØ-öø-ÿ]{2,}/.test(clean)) {
    return { lang: "es", confident: false };
  }

  const scores: Record<DetectableSpokenLang, number> = { es: 0, en: 0, pt: 0, fr: 0, it: 0, de: 0 };
  for (const lang of DETECTABLE_LANGS) {
    for (const sig of CHAR_SIGNALS[lang]) {
      if (sig.test.test(clean)) scores[lang] += sig.weight;
    }
    for (const word of WORD_SIGNALS[lang]) {
      if (word.test(clean)) scores[lang] += WORD_WEIGHT;
    }
  }

  let best: DetectableSpokenLang = "es";
  let bestScore = -Infinity;
  let secondScore = -Infinity;
  for (const lang of DETECTABLE_LANGS) {
    const sc = scores[lang];
    if (sc > bestScore) {
      secondScore = bestScore;
      bestScore = sc;
      best = lang;
    } else if (sc > secondScore) {
      secondScore = sc;
    }
  }

  // CONFIABLE = puntuación mínima (no una única señal débil) Y margen claro
  // sobre el segundo candidato (evita decidir por una stopword ambigua
  // compartida entre idiomas, p.ej. "con"/"una" en español e italiano).
  const MIN_SCORE = 2;
  const MIN_MARGIN = 2;
  const confident = bestScore >= MIN_SCORE && bestScore - Math.max(secondScore, 0) >= MIN_MARGIN;
  return { lang: best, confident };
}

/** Resultado interno de un eslabón de la cadena. */
type LinkOutcome =
  | "spoke" // habló entero → cadena terminada con éxito
  | "started" // llegó a sonar pero se cortó → el turno YA se consumió (no re-hablar)
  | "declined"; // no pudo ni empezar → probar el siguiente eslabón

/**
 * ¿Hay un motor OSS/neural activo Y disponible para hablar YA (sin descargar
 * por sorpresa)? Úsalo para decidir rápido si merece la pena delegar.
 *
 * Mira el motor que Aurora usaría DE VERDAD ahora mismo (`resolveActiveVoiceEngine`:
 * pin de personalidad → elección explícita → selección automática), no solo el
 * que dice la config: si el usuario tiene "navegador" pero hay un VoxCPM vivo,
 * la respuesta correcta es `true`. Para motores por endpoint usa el ping
 * cacheado (60 s). NUNCA lanza.
 */
export async function isConfiguredOssEngineReady(): Promise<boolean> {
  try {
    await refreshPersonalityVoicePin();
    const cfg = getVoiceConfig();
    const engine = resolveActiveVoiceEngine(cfg);
    if (isNeuralEngine(engine)) {
      const { pingNeuralEngine } = await import("@/lib/aurora/tts-oss/neural-tts");
      return (await pingNeuralEngine(engine)) === "ok";
    }
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
 * Ejecuta UN eslabón de la cadena. Solo si el audio empieza de verdad se
 * disparan onStart/onEnd del llamador. Envuelto por el llamador en
 * Promise.resolve().then() — aquí además todo es defensivo. NUNCA lanza.
 */
async function runLink(
  link: VoiceChainLink,
  text: string,
  cfg: AuroraVoiceConfig,
  opts: ConfiguredSpeakOptions,
  /** Idioma REAL detectado en `text` (solo si `detectSpokenLang` fue CONFIABLE). */
  detectedLang?: string,
): Promise<LinkOutcome> {
  let started = false;
  const safe = {
    onStart: () => {
      started = true;
      try { opts.onStart?.(); } catch { /* */ }
    },
    onEnd: () => {
      if (!started) return; // los fallos silenciosos no cierran el turno del engine
      try { opts.onEnd?.(); } catch { /* */ }
    },
    onError: (m: string) => {
      try { opts.onError?.(m); } catch { /* */ }
    },
  };

  if (isNeuralEngine(link)) {
    const { neuralSpeak, neuralEngineConfigured } = await import(
      "@/lib/aurora/tts-oss/neural-tts"
    );
    if (!neuralEngineConfigured(link)) return "declined";
    // AUTO-DETECCIÓN DE IDIOMA: con detección CONFIABLE, anulamos aquí el
    // `lang` persistido de ESTE motor solo para esta locución (el timbre/voz
    // configurados no cambian; solo el código de idioma que viaja al
    // servidor/daemon/Space — así --lang/el estilo del Space SIEMPRE coincide
    // con el idioma real del texto). Dudosa → undefined → neuralSpeak lee la
    // config persistida de siempre (getEngineSettings dentro de neural-tts.ts).
    const settingsOverride: NeuralEngineSettings | undefined = detectedLang
      ? { ...getEngineSettings(link), lang: detectedLang }
      : undefined;
    const audio = await neuralSpeak(link, text, { ...safe, settings: settingsOverride });
    if (audio) return "spoke";
    return started ? "started" : "declined";
  }

  if (link === "kokoro") {
    const { kokoroAvailable, kokoroModelReady, kokoroSpeak } = await import(
      "@/lib/aurora/tts-oss/kokoro"
    );
    if (!kokoroAvailable()) return "declined";
    // Sin autoDownload y sin modelo listo → no bloqueamos a Aurora; siguiente.
    if (!kokoroModelReady() && !cfg.autoDownload) return "declined";
    // Velocidad desde el estilo emocional vivo (Kokoro acepta speed).
    let speed: number | undefined;
    try {
      const { resolveVoiceParams } = await import("@/lib/aurora/tts-oss/voice-style");
      speed = resolveVoiceParams().rate;
    } catch { /* estilo no disponible → velocidad por defecto */ }
    const audio = await kokoroSpeak(text, {
      voice: cfg.voice,
      speed,
      autoDownload: !!cfg.autoDownload,
      ...safe,
    });
    if (audio) return "spoke";
    return started ? "started" : "declined";
  }

  if (link === "kitten") {
    const { kittenAvailable, kittenSpeak } = await import("@/lib/aurora/tts-oss/kitten");
    if (!kittenAvailable()) return "declined"; // stub honesto: hoy siempre false
    const audio = await kittenSpeak(text, { voice: cfg.voice, ...safe });
    if (audio) return "spoke";
    return started ? "started" : "declined";
  }

  return "declined";
}

/**
 * speakWithConfiguredEngine — Sintetiza y reproduce `text` recorriendo la CADENA
 * de motores (registro + selección automática), devolviendo `true` cuando alguno
 * se hizo cargo del turno. Si no hay nada disponible o todo falla, devuelve
 * `false` para que el engine caiga a `window.speechSynthesis` (con la mejor voz
 * neural rankeada del dispositivo). NUNCA lanza.
 *
 * CAMBIO DE LA ADENDA 67 (P2-3): ya NO se sale de vacío cuando el motor de la
 * config es "browser". Ahora construye la cadena SIEMPRE: si hay un motor mejor
 * CONFIGURADO (VoxCPM el primero), lo usa aunque el usuario no haya tocado nada.
 * Si no hay ninguno, la cadena queda en [kokoro] y, sin modelo listo, declina al
 * instante → voz del navegador. Coste para quien no tiene servidores: CERO
 * (ningún fetch, ninguna espera; solo lecturas de localStorage).
 *
 * IMPORTANTE (anti-descarga sorpresa): Kokoro sólo autodescarga el modelo si el
 * usuario lo pidió (`autoDownload` en la config). Si no, y el modelo no está
 * listo, ese eslabón declina de inmediato (la voz del navegador cubre el turno).
 */
export async function speakWithConfiguredEngine(
  text: string,
  opts: ConfiguredSpeakOptions = {},
): Promise<boolean> {
  const clean = (text || "").trim();
  if (!clean) return false;

  let cfg: AuroraVoiceConfig;
  try {
    cfg = getVoiceConfig();
  } catch {
    return false;
  }
  if (!cfg) return false;

  // AUTO-DETECCIÓN DE IDIOMA (dependency-free): idioma REAL del texto que se
  // va a pronunciar AHORA. Solo se usa para anular `lang` cuando es CONFIABLE
  // (varias señales coincidentes) — ver detectSpokenLang() arriba y su uso en
  // runLink(). Dudosa → cada motor sigue leyendo su config persistida.
  const detection = detectSpokenLang(clean);
  const detectedLang = detection.confident ? detection.lang : undefined;

  // El pin de la personalidad activa se relee aquí (import dinámico cacheado):
  // así una personalidad que fija "VoxCPM para la voz" manda desde la 1ª frase.
  const pin = await refreshPersonalityVoicePin().catch(() => null);

  // INDICADOR DE PROCESAMIENTO DE VOZ (Adenda V2-VOZ): 'start' antes de intentar
  // la cadena; 'end' en cuanto el audio EMPIEZA a sonar o al rendirse. El motor
  // (para el detalle del evento) es el que Aurora usaría ahora mismo.
  let engineForEvent: string | undefined;
  try {
    engineForEvent = resolveActiveVoiceEngine(cfg);
  } catch {
    /* */
  }
  emitVoiceProcessing("start", engineForEvent);
  let processingEnded = false;
  const endProcessing = () => {
    if (processingEnded) return;
    processingEnded = true;
    emitVoiceProcessing("end", engineForEvent);
  };
  // El indicador es para el PROCESO (síntesis), no para la reproducción: en cuanto
  // un eslabón empieza a sonar, cerramos el indicador (ya no "procesa", ya "habla").
  const wrappedOpts: ConfiguredSpeakOptions = {
    ...opts,
    onStart: () => {
      endProcessing();
      try {
        opts.onStart?.();
      } catch {
        /* */
      }
    },
  };

  try {
    const chain = buildVoiceChain(cfg, pin);
    if (!chain.length) return false; // suelo: navegador
    for (const link of chain) {
      // Cada eslabón envuelto: nunca lanzar sin capturar en cadenas de failover.
      const outcome = await Promise.resolve()
        .then(() => runLink(link, clean, cfg, wrappedOpts, detectedLang))
        .catch((): LinkOutcome => "declined");
      if (outcome === "spoke") return true;
      if (outcome === "started") {
        // Llegó a sonar y se cortó: el turno YA se consumió; re-hablar el mismo
        // texto con otro motor duplicaría la locución. Turno cerrado con dignidad.
        return true;
      }
      // "declined" → siguiente eslabón de la cadena.
    }
    return false; // suelo garantizado: voz del navegador (mejor rankeada).
  } finally {
    // Red de seguridad: nunca dejar el indicador colgado (try/finally).
    endProcessing();
  }
}

/** Corta cualquier reproducción OSS/neural en curso. NUNCA lanza. */
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
  try {
    const { stopNeural } = await import("@/lib/aurora/tts-oss/neural-tts");
    stopNeural();
  } catch {
    /* */
  }
}
