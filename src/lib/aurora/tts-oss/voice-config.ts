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
 *   · "voxcpm"     → OpenBMB/VoxCPM por ENDPOINT. **MOTOR PRINCIPAL** cuando
 *                    tiene endpoint: TTS tokenizer-free (difusión autoregresiva),
 *                    30 idiomas, 48 kHz, DISEÑO DE VOZ por descripción en
 *                    lenguaje natural y clonación controlable. Apache-2.0.
 *   · "voicebox"   → jamiepine/voicebox por ENDPOINT (app de escritorio local
 *                    con API REST en 127.0.0.1:17493). Estudio de voz: perfiles
 *                    clonados + 7 motores dentro (Qwen3-TTS, Kokoro…).
 *   · "bark"       → suno-ai/bark por ENDPOINT (servidor Python en una neurona
 *                    propia/CasaOS u hospedado). TTS generativo EXPRESIVO:
 *                    entona, ríe ([laughs]) y suspira ([sighs]).
 *   · "gpt-sovits" → RVC-Boss/GPT-SoVITS por ENDPOINT. CLONACIÓN few-shot
 *                    (~5 s de muestra vía refAudio/refText). Simbiótico con
 *                    Bark: puede clonar/refinar la referencia elegida.
 *   · "omnivoice"  → k2-fsa/OmniVoice por ENDPOINT. Voz neural MULTILINGÜE.
 *
 * Los cinco motores por endpoint viven en `neural-tts.ts` (cliente HTTP genérico
 * y tolerante + ping con caché). El REGISTRO de motores con sus metadatos
 * (realismo, idiomas, clonación, latencia…) y la SELECCIÓN AUTOMÁTICA del mejor
 * disponible viven en `engine-registry.ts`. La cadena de fallback "Aurora SIEMPRE
 * habla" vive en `speak-router.ts`: pin de personalidad → motor elegido → mejor
 * motor disponible → Kokoro → voz del navegador mejor rankeada. La modulación
 * emocional vive en `voice-style.ts`.
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
  | "voxcpm"
  | "voicebox"
  | "bark"
  | "gpt-sovits"
  | "omnivoice";

/** Motores NEURALES por endpoint (servidores Python: neurona/CasaOS u hospedados). */
export type NeuralVoiceEngine =
  | "voxcpm"
  | "voicebox"
  | "bark"
  | "gpt-sovits"
  | "omnivoice";

/**
 * Lista canónica de motores por endpoint (para iterar en UI/router), ORDENADA
 * por realismo/recomendación: VoxCPM primero (motor PRINCIPAL cuando tiene
 * endpoint), Voicebox después (estudio de voz local), y luego los históricos.
 */
export const NEURAL_VOICE_ENGINES: readonly NeuralVoiceEngine[] = [
  "voxcpm",
  "voicebox",
  "bark",
  "gpt-sovits",
  "omnivoice",
];

/** ¿Es un motor por endpoint? */
export function isNeuralEngine(e: unknown): e is NeuralVoiceEngine {
  return (
    e === "voxcpm" ||
    e === "voicebox" ||
    e === "bark" ||
    e === "gpt-sovits" ||
    e === "omnivoice"
  );
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
   * gpt-sovits · voxcpm: audio de REFERENCIA para CLONAR (URL http(s) o ruta que
   * el servidor entienda, p.ej. "refs/aurora.wav"). ~5 s de muestra bastan.
   * Modo simbiótico: puede ser una muestra generada por Bark.
   */
  refAudio?: string;
  /** gpt-sovits · voxcpm: transcripción del audio de referencia (prompt_text). */
  refText?: string;
  /**
   * Solo voxcpm: DISEÑO DE VOZ por descripción en lenguaje natural ("mujer joven,
   * voz cálida y serena"). VoxCPM2 crea la voz SIN audio de referencia: la
   * descripción viaja entre paréntesis al inicio del texto — `(descripción)Texto`.
   * Si además hay `refAudio`, la descripción actúa como guía de estilo sobre la
   * voz clonada (clonación controlable).
   */
  voiceDesign?: string;
  /**
   * Solo voicebox: id del PERFIL DE VOZ (uuid de `GET /profiles`). Es OBLIGATORIO
   * para su `POST /generate/stream` (sin él, el servidor responde 404).
   */
  profileId?: string;
  /**
   * Nombre del MODELO en el servidor. voxcpm servido por vLLM-Omni lo exige en el
   * cuerpo OpenAI-compatible (`/v1/audio/speech`, p.ej. "openbmb/VoxCPM2").
   * voicebox lo usa como motor interno ("qwen" · "kokoro" · "chatterbox_turbo"…).
   */
  model?: string;
  /**
   * Instrucción de ENTREGA en lenguaje natural ("habla despacio", "susurra").
   * La entiende voicebox (campo `instruct`, motores Qwen) y, como guía de estilo,
   * voxcpm. Si falta, se deriva de la emoción activa (voice-style.ts).
   */
  instruct?: string;
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
  /**
   * SELECCIÓN AUTOMÁTICA (por defecto TRUE — "Aurora elige sola").
   * Con `auto` encendido, aunque el motor sea el del navegador, si hay un motor
   * por endpoint CONFIGURADO y disponible (VoxCPM primero, luego Voicebox,
   * GPT-SoVITS, Bark, OmniVoice) Aurora lo usa sin que el usuario cambie nada;
   * si ninguno responde, cae a Kokoro y a la mejor voz neural del navegador.
   * Ponerlo a `false` fija EXACTAMENTE el motor elegido (sin auto-mejora).
   * La elección explícita de un motor (`engine !== "browser"`) SIEMPRE va primero
   * en la cadena: `auto` solo añade eslabones detrás, nunca pisa la decisión.
   * Ver engine-registry.ts::buildVoiceChain().
   */
  auto?: boolean;
  /**
   * Preset de voz aplicado por última vez (id de VOICE_PRESETS). Informativo:
   * permite que el panel marque cuál está activo. El estado real es `style`.
   */
  presetId?: string;
}

/**
 * ESTILO DE VOZ POR DEFECTO — "Aurora · orgánica" (petición 2026-07-13).
 * ----------------------------------------------------------------------------
 * Cálida y serena, con ritmo NATURAL (ni lento ni acelerado). Se aplica desde el
 * PRIMER arranque sin que el usuario configure nada: la mejor voz neural del
 * navegador (browser-voices.ts) + esta modulación emocional = Aurora ya suena
 * orgánica de fábrica. Los números explícitos MANDAN sobre los deltas de la
 * emoción (ver resolveVoiceParams): `rate:1` fuerza ritmo natural pese a que la
 * emoción "serena" tienda a frenar; `pitch` y `energy` dan la calidez.
 * Totalmente ajustable después (panel de Voz, personalidades, `ajustar_voz`).
 */
export const DEFAULT_VOICE_STYLE: AuroraVoiceStyle = {
  emotion: "serena",
  tone: "cálida",
  rate: 1,
  pitch: 1.03,
  energy: 52,
};

/**
 * Un preset de voz con nombre: aplica un `AuroraVoiceStyle` de un toque.
 *
 * Además del estilo (que vale para CUALQUIER motor), cada preset puede llevar:
 *   · `voiceDesign` → descripción en lenguaje natural para el DISEÑO DE VOZ de
 *     VoxCPM2 (crea la voz sin audio de referencia: `(descripción)Texto`).
 *   · `instruct`    → instrucción de ENTREGA para motores que la entienden
 *     (Voicebox/Qwen3-TTS: "habla despacio, con calidez").
 *   · `gender`      → preferencia de género (sesga el ranking de voces del
 *     navegador y la voz sugerida de Kokoro). Informativo, nunca un filtro duro.
 * Los tres son opcionales y ADITIVOS: un motor que no los soporte los ignora.
 */
export interface AuroraVoicePreset {
  id: string;
  label: string;
  hint: string;
  style: AuroraVoiceStyle;
  /** Descripción de voz para VoxCPM (Voice Design). */
  voiceDesign?: string;
  /** Instrucción de entrega en lenguaje natural (Voicebox/Qwen · guía VoxCPM). */
  instruct?: string;
  /** Preferencia suave de género para el ranking de voces. */
  gender?: "f" | "m" | "neutra";
}

/**
 * CATÁLOGO DE TIPOS DE VOZ PREDISEÑADOS (Adenda 67 · P2-4).
 * El primero es el DEFAULT de fábrica. No son motores: son modulaciones que
 * valen para CUALQUIER motor — y, donde el motor lo permite (VoxCPM/Voicebox),
 * viajan además como descripción de voz / instrucción de entrega, así que el
 * MISMO preset suena coherente en el navegador, en Kokoro y en VoxCPM.
 * Todo sigue siendo ajustable después (velocidad · tono · energía · emoción).
 */
export const AURORA_ORGANIC_PRESET_ID = "aurora-organica";
export const VOICE_PRESETS: readonly AuroraVoicePreset[] = [
  {
    id: AURORA_ORGANIC_PRESET_ID,
    label: "Aurora · orgánica",
    hint: "Cálida y serena, ritmo natural (por defecto)",
    style: DEFAULT_VOICE_STYLE,
    voiceDesign: "Voz femenina joven, cálida y serena, timbre natural y cercano, ritmo tranquilo",
    instruct: "Habla con calidez y serenidad, a ritmo natural",
    gender: "f",
  },
  {
    id: "aurora-dulce",
    label: "Cálida y cercana",
    hint: "Suave, dulce, acompaña",
    style: { emotion: "dulce", tone: "cálida", rate: 0.98, pitch: 1.08, energy: 50 },
    voiceDesign: "Voz femenina suave y dulce, muy cercana, como quien acompaña en voz baja",
    instruct: "Habla con dulzura y suavidad, muy cerca del oyente",
    gender: "f",
  },
  {
    id: "aurora-clara",
    label: "Serena y clara",
    hint: "Calmada, nítida, informativa",
    style: { emotion: "serena", tone: "clara", rate: 1, pitch: 1, energy: 46 },
    voiceDesign: "Voz clara y nítida, calmada y bien articulada, tono informativo",
    instruct: "Habla con calma y claridad, articulando bien",
    gender: "neutra",
  },
  {
    id: "aurora-vivaz",
    label: "Vivaz",
    hint: "Con chispa y energía",
    style: { emotion: "entusiasta", tone: "luminosa", rate: 1.06, pitch: 1.1, energy: 78 },
    voiceDesign: "Voz luminosa y enérgica, con chispa y entusiasmo contagioso",
    instruct: "Habla con energía y entusiasmo, con chispa",
    gender: "f",
  },
  {
    id: "aurora-seria",
    label: "Seria y profesional",
    hint: "Formal, precisa, con autoridad tranquila",
    style: { emotion: "seria", tone: "profesional", rate: 0.98, pitch: 0.94, energy: 52 },
    voiceDesign: "Voz adulta formal y precisa, con autoridad tranquila y sin dramatismo",
    instruct: "Habla de forma seria, precisa y profesional",
    gender: "neutra",
  },
  {
    id: "aurora-narradora",
    label: "Narradora",
    hint: "Pausada y envolvente, para leer y contar",
    style: { emotion: "serena", tone: "narrativa", rate: 0.92, pitch: 0.99, energy: 55 },
    voiceDesign: "Voz de narradora de audiolibro, pausada y envolvente, con buena respiración",
    instruct: "Narra con pausa, como un audiolibro, dejando respirar las frases",
    gender: "f",
  },
  {
    id: "aurora-empatica",
    label: "Empática",
    hint: "Comprensiva, sostiene y acompaña",
    style: { emotion: "empatica", tone: "empática", rate: 0.94, pitch: 1.02, energy: 44 },
    voiceDesign: "Voz comprensiva y empática, suave, que sostiene y acompaña sin invadir",
    instruct: "Habla con empatía y calidez, despacio, acompañando",
    gender: "f",
  },
  {
    id: "aurora-misteriosa",
    label: "Misteriosa",
    hint: "Grave, intrigante, casi susurrada",
    style: { emotion: "misteriosa", tone: "misteriosa", rate: 0.9, pitch: 0.88, energy: 38 },
    voiceDesign: "Voz grave e intrigante, casi susurrada, con aire enigmático",
    instruct: "Habla bajo y grave, con misterio, casi susurrando",
    gender: "neutra",
  },
  {
    id: "aurora-juguetona",
    label: "Juguetona",
    hint: "Traviesa, ligera, con sonrisa",
    style: { emotion: "juguetona", tone: "juguetona", rate: 1.1, pitch: 1.16, energy: 74 },
    voiceDesign: "Voz joven y traviesa, ligera, con una sonrisa permanente",
    instruct: "Habla con picardía y ligereza, como si sonrieras",
    gender: "f",
  },
  {
    id: "aurora-alegre",
    label: "Alegre",
    hint: "Luminosa y positiva",
    style: { emotion: "alegre", tone: "alegre", rate: 1.04, pitch: 1.12, energy: 72 },
    voiceDesign: "Voz alegre y luminosa, positiva, con energía amable",
    instruct: "Habla con alegría, luminosa y positiva",
    gender: "f",
  },
  {
    id: "aurora-grave",
    label: "Grave y cálida",
    hint: "Voz profunda, reposada",
    style: { emotion: "serena", tone: "grave", rate: 0.95, pitch: 0.85, energy: 50 },
    voiceDesign: "Voz masculina grave y cálida, profunda y reposada, timbre aterciopelado",
    instruct: "Habla grave y reposado, con calidez",
    gender: "m",
  },
  {
    id: "aurora-neutra",
    label: "Neutra",
    hint: "Sin modulación emocional",
    style: {},
    gender: "neutra",
  },
];

/**
 * Config por defecto: navegador + estilo ORGÁNICO (cálido/sereno), sin
 * autodescarga y con SELECCIÓN AUTOMÁTICA de motor encendida (si algún día
 * aparece un endpoint VoxCPM configurado, Aurora lo usa sola).
 */
export const DEFAULT_VOICE_CONFIG: AuroraVoiceConfig = {
  engine: "browser",
  autoDownload: false,
  auto: true,
  style: { ...DEFAULT_VOICE_STYLE },
  presetId: AURORA_ORGANIC_PRESET_ID,
};

const VALID_ENGINES: readonly AuroraVoiceEngine[] = [
  "browser",
  "kokoro",
  "kitten",
  "voxcpm",
  "voicebox",
  "bark",
  "gpt-sovits",
  "omnivoice",
];

/** ¿Es un id de motor de voz válido? (Útil para pins de personalidad.) */
export function isVoiceEngineId(v: unknown): v is AuroraVoiceEngine {
  return typeof v === "string" && (VALID_ENGINES as readonly string[]).includes(v);
}

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
  if (typeof r.voiceDesign === "string" && r.voiceDesign.trim()) {
    out.voiceDesign = r.voiceDesign.trim().slice(0, 300);
  }
  if (typeof r.profileId === "string" && r.profileId.trim()) out.profileId = r.profileId.trim();
  if (typeof r.model === "string" && r.model.trim()) out.model = r.model.trim();
  if (typeof r.instruct === "string" && r.instruct.trim()) {
    out.instruct = r.instruct.trim().slice(0, 500); // Voicebox: max 500 chars
  }
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
      // `auto` por defecto TRUE (configs viejas no lo traen: solo `false` lo apaga).
      const auto = parsed?.auto !== false;
      const presetId = typeof parsed?.presetId === "string" ? parsed.presetId : undefined;
      return {
        engine,
        voice,
        autoDownload,
        engines,
        style,
        browserVoiceURI,
        symbiotic,
        auto,
        presetId,
      };
    }
    // Sin config unificada: honra el opt-in histórico de Kokoro si estaba ON.
    if (isOssTtsEnabled()) {
      return {
        engine: "kokoro",
        autoDownload: false,
        auto: true,
        style: { ...DEFAULT_VOICE_STYLE },
      };
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
    auto: "auto" in patch ? patch.auto !== false : current.auto !== false,
    presetId:
      "presetId" in patch
        ? (typeof patch.presetId === "string" && patch.presetId ? patch.presetId : undefined)
        : current.presetId,
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

/**
 * SIEMBRA EL PRESET DE VOZ POR DEFECTO ("Aurora · orgánica") en el PRIMER
 * arranque, solo si el usuario no ha elegido nada. Idempotente y NO destructivo:
 *   · si ya existe `starseed.aurora.voice.v1` → no toca nada (respeta la elección);
 *   · si el opt-in histórico de Kokoro estaba ON → tampoco pisa (getVoiceConfig
 *     ya lo migra a `{engine:"kokoro"}` con estilo orgánico);
 *   · si no hay NADA → persiste el default (navegador + estilo cálido/sereno) para
 *     que aparezca visible y ajustable en el panel de Voz desde el minuto cero.
 * SSR-safe; nunca lanza. Se llama desde el arranque de Aurora (engine.ts).
 */
export function ensureOrganicVoiceDefault(): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    if (ls.getItem(AURORA_VOICE_CONFIG_KEY)) return; // ya hay config → respeta
    if (isOssTtsEnabled()) return; // Kokoro histórico → lo cubre getVoiceConfig
    const seeded: AuroraVoiceConfig = {
      engine: "browser",
      autoDownload: false,
      auto: true,
      style: { ...DEFAULT_VOICE_STYLE },
      presetId: AURORA_ORGANIC_PRESET_ID,
    };
    ls.setItem(AURORA_VOICE_CONFIG_KEY, JSON.stringify(seeded));
    emitChange();
  } catch {
    /* cuota / modo privado → Aurora sigue orgánica por el default de getVoiceConfig */
  }
}

/**
 * Aplica un preset de voz con nombre (reemplaza el estilo, no lo fusiona: un
 * preset "Neutra" con `{}` limpia la modulación) y recuerda cuál está activo
 * (`presetId`) para que los motores que entienden lenguaje natural (VoxCPM ·
 * Voicebox) puedan usar su `voiceDesign`/`instruct` sin pisar lo que el usuario
 * haya escrito a mano en la config del motor. Nunca lanza.
 */
export function applyVoicePreset(presetId: string): void {
  const preset = VOICE_PRESETS.find((p) => p.id === presetId);
  if (!preset) return;
  const ls = safeLocalStorage();
  const current = getVoiceConfig();
  const clean = sanitizeStyle(preset.style);
  const next: AuroraVoiceConfig = { ...current, style: clean, presetId: preset.id };
  if (ls) {
    try {
      ls.setItem(AURORA_VOICE_CONFIG_KEY, JSON.stringify(next));
    } catch {
      /* */
    }
  }
  emitChange();
}

/** Preset ACTIVO (el aplicado por última vez), o undefined. Nunca lanza. */
export function getActiveVoicePreset(): AuroraVoicePreset | undefined {
  try {
    const id = getVoiceConfig().presetId;
    if (!id) return undefined;
    return VOICE_PRESETS.find((p) => p.id === id);
  } catch {
    return undefined;
  }
}

/** Busca un preset por id (o undefined). Nunca lanza. */
export function findVoicePreset(id: string | undefined): AuroraVoicePreset | undefined {
  if (!id) return undefined;
  try {
    return VOICE_PRESETS.find((p) => p.id === id);
  } catch {
    return undefined;
  }
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
