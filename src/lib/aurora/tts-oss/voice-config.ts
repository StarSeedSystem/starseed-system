"use client";

/**
 * StarSeed OS — Configuración UNIFICADA de la VOZ de Aurora (multi-motor).
 * ============================================================================
 * Aurora puede hablar con distintos MOTORES de texto-a-voz, todos gratuitos:
 *
 *   · "browser"    → Web Speech API (window.speechSynthesis). SIEMPRE disponible,
 *                    cero descargas. Con RANKING de voces (browser-voices.ts) la
 *                    mejor voz neural del dispositivo se elige SOLA: es la VOZ
 *                    NATURAL por defecto, sin configurar nada.
 *   · "kokoro"     → Kokoro TTS (82M, Apache-2.0). Corre 100% en el navegador
 *                    (ONNX/WASM/WebGPU). MEJOR español local (`ef_dora`…).
 *                    Descarga ~80 MB la 1ª vez; luego local/offline.
 *   · "kitten"     → KittenTTS (25 MB int8, Apache-2.0, inglés). BETA (stub honesto).
 *   · "bark"       → suno-ai/bark por ENDPOINT (servidor Python en una neurona
 *                    propia/CasaOS u hospedado). TTS generativo EXPRESIVO:
 *                    entona, ríe ([laughs]) y suspira ([sighs]).
 *   · "gpt-sovits" → RVC-Boss/GPT-SoVITS por ENDPOINT. CLONACIÓN few-shot
 *                    (~5 s de muestra vía refAudio/refText). Simbiótico con
 *                    Bark: puede clonar/refinar la referencia elegida.
 *   · "omnivoice"  → k2-fsa/OmniVoice por ENDPOINT. Voz neural MULTILINGÜE.
 *
 * Los tres motores por endpoint viven en `neural-tts.ts` (cliente HTTP genérico
 * y tolerante + ping con caché). La cadena de fallback "Aurora SIEMPRE habla"
 * vive en `speak-router.ts`: motor elegido → Kokoro → voz del navegador mejor
 * rankeada. La modulación emocional vive en `voice-style.ts`.
 *
 * Este módulo sólo gestiona la PREFERENCIA persistida (motor + voz + endpoints
 * + estilo emocional). No carga NADA pesado: importar este archivo es barato.
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
 * TODA la config nueva (endpoints de motores, estilo, voz del navegador…) vive
 * DENTRO de esa MISMA clave — nada de claves nuevas — y VIAJA con la cuenta
 * soberana (misma voz en cualquier dispositivo). No viaja ningún dato pesado.
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
/**
 * Evento GLOBAL de estilo de voz EN VIVO (contrato con el sistema de
 * Personalidades, que lo emite; aquí solo se CONSUME y persiste):
 *   window.dispatchEvent(new CustomEvent("starseed:aurora-voice-style", {
 *     detail: { tone?, emotion?, rate?, pitch?, energy?, persona? }
 *   }))
 * El listener vive en `voice-style.ts::installVoiceStyleListener()`.
 */
export const AURORA_VOICE_STYLE_EVENT = "starseed:aurora-voice-style";

// ── Tipos ────────────────────────────────────────────────────────────────────

/** Motor de voz elegido para Aurora. */
export type AuroraVoiceEngine =
  | "browser"
  | "kokoro"
  | "kitten"
  | "bark"
  | "gpt-sovits"
  | "omnivoice";

/** Motores NEURALES por endpoint (servidores Python: neurona/CasaOS u hospedados). */
export type NeuralVoiceEngine = "bark" | "gpt-sovits" | "omnivoice";

/** Lista canónica de motores por endpoint (para iterar en UI/router). */
export const NEURAL_VOICE_ENGINES: readonly NeuralVoiceEngine[] = [
  "bark",
  "gpt-sovits",
  "omnivoice",
];

/** ¿Es un motor por endpoint? */
export function isNeuralEngine(e: unknown): e is NeuralVoiceEngine {
  return e === "bark" || e === "gpt-sovits" || e === "omnivoice";
}

/** Emociones soportadas por la modulación de voz (catálogo en voice-style.ts). */
export type AuroraVoiceEmotion =
  | "alegre"
  | "serena"
  | "dulce"
  | "seria"
  | "entusiasta"
  | "empatica"
  | "misteriosa"
  | "juguetona";

/**
 * Estilo de voz ACTUAL (persistido): modulación viva que llega del evento
 * `starseed:aurora-voice-style` (Personalidades), de la herramienta de voz de
 * Aurora ("habla más dulce") o de los sliders del panel. Los números son
 * multiplicadores/absolutos razonables (rate/pitch 0.5..2 · energy 0..100).
 */
export interface AuroraVoiceStyle {
  /** Emoción por defecto de la entrega. */
  emotion?: AuroraVoiceEmotion;
  /** Tono descriptivo libre (informativo, lo emite Personalidades). */
  tone?: string;
  /** Persona/personaje activo (informativo, lo emite Personalidades). */
  persona?: string;
  /** Velocidad (multiplicador 0.5..2; 1 = normal). */
  rate?: number;
  /** Tono/pitch (multiplicador 0.5..2; 1 = normal). */
  pitch?: number;
  /** Energía 0..100 (50 = neutra). Modula volumen/entrega. */
  energy?: number;
}

/**
 * Config de UN motor por endpoint. Todos los campos son opcionales: sin
 * `endpoint`, el motor se considera "sin configurar" y el router lo salta.
 */
export interface NeuralEngineSettings {
  /** URL del servidor (p.ej. http://192.168.1.40:8880 o https://mi-neurona.tld/tts). */
  endpoint?: string;
  /** Voz/preset del motor (Bark: "v2/es_speaker_1" · SoVITS/Omni: id de voz/sid). */
  voice?: string;
  /** Idioma preferente ("es", "en", "es-ES"…). */
  lang?: string;
  /** Velocidad propia del motor (multiplicador; si falta, se usa la del estilo). */
  rate?: number;
  /** Tono propio del motor (multiplicador; si falta, el del estilo). */
  pitch?: number;
  /** Energía propia 0..100 (si falta, la del estilo). */
  energy?: number;
  /** Emoción por defecto propia del motor (si falta, la del estilo). */
  emotion?: AuroraVoiceEmotion;
  /**
   * Solo gpt-sovits: audio de REFERENCIA para clonar (URL http(s) o ruta que el
   * servidor entienda, p.ej. "refs/aurora.wav"). ~5 s de muestra bastan.
   * Modo simbiótico: puede ser una muestra generada por Bark.
   */
  refAudio?: string;
  /** Solo gpt-sovits: transcripción del audio de referencia (prompt_text). */
  refText?: string;
}

export interface AuroraVoiceConfig {
  /** Motor activo. Por defecto "browser" (siempre disponible). */
  engine: AuroraVoiceEngine;
  /** Voz específica del motor activo (p. ej. Kokoro "ef_dora"). Opcional. */
  voice?: string;
  /**
   * Si es true, el motor OSS puede autodescargar su modelo la 1ª vez que Aurora
   * hable (sin pedir un clic extra). Por defecto false: descarga sólo bajo un
   * gesto explícito del usuario (botón "Probar voz" / "Activar").
   */
  autoDownload?: boolean;
  /** Config por motor de endpoint (bark · gpt-sovits · omnivoice). */
  engines?: Partial<Record<NeuralVoiceEngine, NeuralEngineSettings>>;
  /** Estilo emocional/tonal ACTUAL (persistido; lo actualiza el evento vivo). */
  style?: AuroraVoiceStyle;
  /**
   * Voz del navegador elegida (voiceURI). "" o ausente = AUTOMÁTICA: se usa la
   * mejor voz rankeada (browser-voices.ts) — recomendado.
   */
  browserVoiceURI?: string;
  /**
   * Modo SIMBIÓTICO Bark+SoVITS: si ambos tienen endpoint, la voz se enruta a
   * GPT-SoVITS usando la referencia elegida (`engines["gpt-sovits"].refAudio`,
   * que puede ser una muestra generada por Bark), con Bark como siguiente
   * eslabón del fallback. Ver speak-router.ts.
   */
  symbiotic?: boolean;
}

/** Config por defecto: navegador, sin voz forzada, sin autodescarga. */
export const DEFAULT_VOICE_CONFIG: AuroraVoiceConfig = {
  engine: "browser",
  autoDownload: false,
};

const VALID_ENGINES: readonly AuroraVoiceEngine[] = [
  "browser",
  "kokoro",
  "kitten",
  "bark",
  "gpt-sovits",
  "omnivoice",
];

function isValidEngine(v: unknown): v is AuroraVoiceEngine {
  return typeof v === "string" && (VALID_ENGINES as readonly string[]).includes(v);
}

const VALID_EMOTIONS: readonly AuroraVoiceEmotion[] = [
  "alegre",
  "serena",
  "dulce",
  "seria",
  "entusiasta",
  "empatica",
  "misteriosa",
  "juguetona",
];

/** Normaliza una emoción (acepta "empática" con tilde, mayúsculas…). Nunca lanza. */
export function normalizeEmotion(v: unknown): AuroraVoiceEmotion | undefined {
  if (typeof v !== "string") return undefined;
  const n = v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
  return (VALID_EMOTIONS as readonly string[]).includes(n)
    ? (n as AuroraVoiceEmotion)
    : undefined;
}

/** Clamp numérico defensivo (NaN/no-número → undefined). */
function num(v: unknown, min: number, max: number): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  if (!Number.isFinite(n)) return undefined;
  return Math.max(min, Math.min(max, n));
}

/** Saneado defensivo del estilo (cualquier basura → campos válidos o undefined). */
export function sanitizeStyle(raw: unknown): AuroraVoiceStyle | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const out: AuroraVoiceStyle = {};
  const emotion = normalizeEmotion(r.emotion ?? r.emocion);
  if (emotion) out.emotion = emotion;
  if (typeof r.tone === "string" && r.tone.trim()) out.tone = r.tone.trim().slice(0, 80);
  if (typeof r.persona === "string" && r.persona.trim()) out.persona = r.persona.trim().slice(0, 80);
  const rate = num(r.rate ?? r.velocidad, 0.5, 2);
  if (rate !== undefined) out.rate = rate;
  const pitch = num(r.pitch ?? r.tono, 0.5, 2);
  if (pitch !== undefined) out.pitch = pitch;
  const energy = num(r.energy ?? r.energia, 0, 100);
  if (energy !== undefined) out.energy = energy;
  return Object.keys(out).length ? out : undefined;
}

function sanitizeEngineSettings(raw: unknown): NeuralEngineSettings | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const out: NeuralEngineSettings = {};
  if (typeof r.endpoint === "string" && r.endpoint.trim()) out.endpoint = r.endpoint.trim();
  if (typeof r.voice === "string" && r.voice.trim()) out.voice = r.voice.trim();
  if (typeof r.lang === "string" && r.lang.trim()) out.lang = r.lang.trim();
  const rate = num(r.rate, 0.5, 2);
  if (rate !== undefined) out.rate = rate;
  const pitch = num(r.pitch, 0.5, 2);
  if (pitch !== undefined) out.pitch = pitch;
  const energy = num(r.energy, 0, 100);
  if (energy !== undefined) out.energy = energy;
  const emotion = normalizeEmotion(r.emotion);
  if (emotion) out.emotion = emotion;
  if (typeof r.refAudio === "string" && r.refAudio.trim()) out.refAudio = r.refAudio.trim();
  if (typeof r.refText === "string" && r.refText.trim()) out.refText = r.refText.trim();
  return Object.keys(out).length ? out : undefined;
}

function sanitizeEngines(
  raw: unknown,
): Partial<Record<NeuralVoiceEngine, NeuralEngineSettings>> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const out: Partial<Record<NeuralVoiceEngine, NeuralEngineSettings>> = {};
  for (const id of NEURAL_VOICE_ENGINES) {
    const s = sanitizeEngineSettings(r[id]);
    if (s) out[id] = s;
  }
  return Object.keys(out).length ? out : undefined;
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
      const engines = sanitizeEngines(parsed?.engines);
      const style = sanitizeStyle(parsed?.style);
      const browserVoiceURI =
        typeof parsed?.browserVoiceURI === "string" ? parsed.browserVoiceURI : undefined;
      const symbiotic = parsed?.symbiotic === true;
      return { engine, voice, autoDownload, engines, style, browserVoiceURI, symbiotic };
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
 * Los campos nuevos (`engines`, `style`, `browserVoiceURI`, `symbiotic`) se
 * fusionan en profundidad razonable y viven en la MISMA clave. NUNCA lanza.
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
    engines:
      "engines" in patch
        ? sanitizeEngines({ ...(current.engines ?? {}), ...(patch.engines ?? {}) })
        : current.engines,
    style:
      "style" in patch
        ? sanitizeStyle({ ...(current.style ?? {}), ...(patch.style ?? {}) })
        : current.style,
    browserVoiceURI:
      "browserVoiceURI" in patch
        ? (typeof patch.browserVoiceURI === "string" ? patch.browserVoiceURI : undefined)
        : current.browserVoiceURI,
    symbiotic: "symbiotic" in patch ? patch.symbiotic === true : current.symbiotic,
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

/** Config del motor de endpoint dado (o {} si no hay). Nunca lanza. */
export function getEngineSettings(id: NeuralVoiceEngine): NeuralEngineSettings {
  try {
    return { ...(getVoiceConfig().engines?.[id] ?? {}) };
  } catch {
    return {};
  }
}

/** Fusiona ajustes de UN motor de endpoint (misma clave persistida). */
export function setEngineSettings(
  id: NeuralVoiceEngine,
  patch: Partial<NeuralEngineSettings>,
): void {
  const current = getEngineSettings(id);
  setVoiceConfig({ engines: { [id]: { ...current, ...patch } } });
}

/** Estilo de voz actual (persistido). Nunca lanza. */
export function getVoiceStyle(): AuroraVoiceStyle {
  try {
    return { ...(getVoiceConfig().style ?? {}) };
  } catch {
    return {};
  }
}

/** Fusiona el estilo de voz actual y lo persiste (misma clave sincronizada). */
export function setVoiceStyle(patch: Partial<AuroraVoiceStyle>): void {
  setVoiceConfig({ style: patch });
}

/**
 * Restablece el estilo de voz a NEUTRO (borra emoción/velocidad/tono/energía).
 * `setVoiceStyle` fusiona (no puede quitar campos), así que aquí se escribe la
 * config SIN `style` directamente — misma clave, sin claves nuevas. Nunca lanza.
 */
export function resetVoiceStyle(): void {
  const ls = safeLocalStorage();
  const current = getVoiceConfig();
  const next: AuroraVoiceConfig = { ...current, style: undefined };
  if (ls) {
    try {
      ls.setItem(AURORA_VOICE_CONFIG_KEY, JSON.stringify(next));
    } catch {
      /* cuota / modo privado → seguimos, sin romper */
    }
  }
  emitChange();
}

/**
 * Devuelve la voz efectiva para el motor dado. Para Kokoro, cae al default de
 * su catálogo si no hay una elegida válida. Para motores por endpoint, usa la
 * voz/preset de su config propia (o la global como respaldo).
 */
export function getEffectiveVoice(engine: AuroraVoiceEngine): string | undefined {
  const cfg = getVoiceConfig();
  if (engine === "kokoro") {
    return cfg.voice && isKnownVoice(cfg.voice) ? cfg.voice : DEFAULT_OSS_TTS_VOICE;
  }
  if (isNeuralEngine(engine)) {
    return cfg.engines?.[engine]?.voice || cfg.voice;
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
