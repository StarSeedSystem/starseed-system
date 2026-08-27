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
// Selección de idioma (locale BCP-47): catálogo + sugerencia por entorno.
// Este módulo solo SANEA/PERSISTE la preferencia; no decide nada por sí solo.
import { baseOf, findLocale, suggestLocalesFromEnvironment } from "@/lib/aurora/tts-oss/locales";

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
  | "omnivoice"
  | "openvoice2"
  // VibeVoice (Microsoft, comunidad) — TTS expresivo multi-locutor de larga
  // duración. Soporta hasta 4 speakers en un mismo guion (diálogos de
  // personalidades) y clonación de voz desde ~30 s de audio. Requiere GPU
  // (modelos diffusion + LLM). Local (servidor en la neurona) o nube.
  | "vibevoice"
  // xAI Voice Agent (grok-voice) — conversacional en tiempo real por WebSocket.
  | "xai";

/** Motores NEURALES por endpoint (servidores Python: neurona/CasaOS u hospedados). */
export type NeuralVoiceEngine =
  | "voxcpm"
  | "voicebox"
  | "bark"
  | "gpt-sovits"
  | "omnivoice"
  | "vibevoice"
  // OpenVoice V2 (web, sin instalar): Space público integrado (Adenda V2-VOZ).
  | "openvoice2"
  // xAI Voice Agent: WebSocket en tiempo real (no es un endpoint HTTP del
  // usuario — el server-side usa process.env.XAI_API_KEY). Siempre "configurado".
  | "xai";

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
  "openvoice2",
  // xAI Voice Agent — conversacional en tiempo real (WebSocket, server-side key).
  "xai",
];

/** ¿Es un motor por endpoint? */
export function isNeuralEngine(e: unknown): e is NeuralVoiceEngine {
  return (
    e === "voxcpm" ||
    e === "voicebox" ||
    e === "bark" ||
    e === "gpt-sovits" ||
    e === "omnivoice" ||
    e === "openvoice2" ||
    e === "xai"
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
  /** Voz/preset del motor (Bark: "v2/es_speaker_1" · SoVITS/Omni: id de voz/sid · xAI: eve/ara/rex/sal/leo o custom id). */
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
  /**
   * ── xAI Voice Agent (grok-voice, WebSocket en tiempo real) ──
   * Campos ADITIVOS. La API key server-side vive en process.env.XAI_API_KEY
   * (usada por /api/voice/xai/token) y NUNCA viaja al cliente. Estos campos
   * son OPCIONALES y solo rellenan el comportamiento por personalidad:
   *   · apiKey?     → API key PROPIA del usuario (opcional). Si está vacía, el
   *                   servidor usa la de StarSeed (gratuita, por defecto). El
   *                   cliente la pasa a /api/voice/xai/token vía body (jamás se
   *                   expone en el bundle ni se persiste en texto plano peligroso).
   *   · voice?      → voz xAI (eve | ara | rex | sal | leo, o un custom id).
   *   · instructions? → system prompt de la personalidad (lo lee XAI_PERSONA_VOICES
   *                   por defecto; aquí se puede sobreescribir por motor).
   *   · personaId?  → id de personalidad (astraura | council | moa | aurora |
   *                   hermione) para cargar voz+instrucciones por defecto de
   *                   XAI_PERSONA_VOICES cuando no se fijen arriba.
   */
  apiKey?: string;
  instructions?: string;
  personaId?: string;
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
  /**
   * MOTOR HÍBRIDO OMNIVOICE (Adenda 77-voz). Config del enrutado local↔nube +
   * diseño de voz por defecto de la cuenta. Siempre presente (CERO config).
   */
  omni?: AstrauraVoiceConfig;
  /**
   * SELECCIÓN DE IDIOMA — locale BCP-47 PRINCIPAL elegido por el usuario
   * (p.ej. "es-MX"). Al leer con `getVoiceConfig()`/`getPreferredLocale()`
   * SIEMPRE viene relleno: si no está fijado o ya no es válido, cae a
   * `suggestLocalesFromEnvironment()[0]` (catálogo en `locales.ts`). El
   * idioma BASE que usa la síntesis (`baseOf(primaryLocale)`) sale de aquí.
   */
  primaryLocale?: string;
  /**
   * Otros locales preferidos (además del principal) — p.ej. para mostrarlos
   * marcados en el selector o, en el futuro, como alternativas de reserva.
   * Lista de códigos BCP-47 saneados contra `locales.ts`. Solo persiste la
   * preferencia; no implica lógica de uso.
   */
  preferredLocales?: string[];
  /**
   * Locale por PERSONALIDAD (id de personalidad → código BCP-47), para el
   * ajuste "Variante regional de la voz" del editor de Personalidades. Vive
   * aquí (no en `personalities.ts`) porque este módulo es el dueño de toda
   * preferencia de voz. Ausente/sin entrada = esa personalidad hereda el
   * `primaryLocale` de la cuenta.
   */
  personalityLocales?: Record<string, string>;
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
 *   · `gender`      → preferencia de género. FUERTE (no solo informativa): la
 *     resuelve `preferredVoiceGender()`/`currentPreferredVoiceGender()` y la
 *     usan kokoro.ts/neural-tts.ts/openvoice2.ts para EXCLUIR voces del
 *     género contrario, no solo para sesgar un ranking.
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
  /**
   * Preferencia de género para elegir voz. FUERTE: ausente/"neutra" resuelve
   * a femenino (las personalidades incluidas en StarSeed son femeninas por
   * defecto — ver `preferredVoiceGender()`); solo "m" fuerza voz masculina.
   */
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
    gender: "f",
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
    gender: "f",
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
    gender: "f",
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
    gender: "f",
  },
];

// ── Preferencia de género de voz — FUERTE (Adenda voz-femenina) ─────────────

/** Preferencia de voz resuelta: femenina o masculina (nunca "neutra"). */
export type VoiceGenderPref = "f" | "m";

/**
 * Resuelve CUALQUIER señal de género — preset (`"f"|"m"|"neutra"`), literal
 * OmniGender (`"Male / 男"|"Female / 女"|"Auto"`), `PersonalityProfile.generoVoz`
 * (`"masculina"|"femenina"|"neutra"`) o cualquier otro valor/string — a la
 * preferencia de voz EFECTIVA. Es FUERTE, no informativa (a diferencia del
 * viejo uso de `AuroraVoicePreset.gender`, que solo sesgaba un ranking): las
 * personalidades incluidas en StarSeed son FEMENINAS por defecto, así que
 * CUALQUIER motor de respaldo (Kokoro, navegador, OpenVoice2…) debe elegir
 * voz femenina salvo que la señal declare EXPLÍCITAMENTE masculino. Cualquier
 * otra cosa — undefined, "neutra", "Auto", texto desconocido — resuelve a
 * femenino. Nunca lanza. PURA (sin red, sin storage): la reutilizan
 * kokoro.ts, neural-tts.ts y openvoice2.ts para no duplicar la regla.
 */
export function preferredVoiceGender(explicit?: unknown): VoiceGenderPref {
  const v = typeof explicit === "string" ? explicit.trim().toLowerCase() : "";
  const isExplicitlyMale =
    v === "m" ||
    v === "male" ||
    v === "masculino" ||
    v === "masculina" ||
    v.startsWith("male /") ||
    v.startsWith("male/");
  return isExplicitlyMale ? "m" : "f";
}

/** `preferredVoiceGender()` expresada como literal OmniGender (diseño de voz). */
export function preferredOmniGender(explicit?: unknown): "Male / 男" | "Female / 女" {
  return preferredVoiceGender(explicit) === "m" ? "Male / 男" : "Female / 女";
}

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
  // `omni` se rellena SIEMPRE a `DEFAULT_ASTRAURA_VOICE` en getVoiceConfig()/
  // getOmniConfig() (sanitizeAstrauraVoice(undefined) → defaults), así que no se
  // fija aquí para no depender del orden de declaración del bloque OmniVoice.
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
  "openvoice2",
  // xAI Voice Agent (WebSocket en tiempo real) — conversacional.
  "xai",
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
  // ── xAI Voice Agent: campos opcionales (key propia, voz, instrucciones, persona) ──
  if (typeof r.apiKey === "string" && r.apiKey.trim()) {
    // Se persiste tal cual; el servidor NUNCA la recibe salvo en el body del
    // token ephemeral (y solo si el usuario la escribe). No viaja en el bundle.
    out.apiKey = r.apiKey.trim().slice(0, 200);
  }
  if (typeof r.instructions === "string" && r.instructions.trim()) {
    out.instructions = r.instructions.trim().slice(0, 4000);
  }
  if (typeof r.personaId === "string" && r.personaId.trim()) {
    out.personaId = r.personaId.trim().slice(0, 80);
  }
  return Object.keys(out).length ? out : undefined;
}

// ═══════════════════════════════════════════════════════════════════════════
// MOTOR DE VOZ HÍBRIDO OMNIVOICE (Adenda 77-voz) — esquema `astraura_voice_config`
// ═══════════════════════════════════════════════════════════════════════════
/**
 * OmniVoice (k2-fsa) es el motor por DEFECTO de Aurora con CERO configuración:
 * habla por el DAEMON LOCAL (127.0.0.1:4444, si está vivo) o por la NUBE GRATIS
 * (HF Space `k2-fsa/OmniVoice`, Gradio 5) — ver `omnivoice-hybrid.ts`. Este
 * bloque es su PREFERENCIA persistida, tipada y saneada, y viaja DENTRO de la
 * MISMA clave `starseed.aurora.voice.v1` (SYNCED_KEYS) → misma voz en cualquier
 * dispositivo de la cuenta, sin claves nuevas.
 *
 * Los VALORES de diseño de voz son los LITERALES EXACTOS que exige el Space
 * (con su parte china incluida): así el mapeo a los parámetros posicionales de
 * `/_design_fn` es directo y sin ambigüedad (`mapDesignAttrsToSpace`).
 */

/** Género del diseño de voz (literal exacto del Space). */
export type OmniGender = "Auto" | "Male / 男" | "Female / 女";
/** Edad del diseño de voz (literal exacto del Space). */
export type OmniAge =
  | "Auto"
  | "Child / 儿童"
  | "Teenager / 少年"
  | "Young Adult / 青年"
  | "Middle-aged / 中年"
  | "Elderly / 老年";
/** Tono del diseño de voz (literal exacto del Space). */
export type OmniPitch =
  | "Auto"
  | "Very Low Pitch / 极低音调"
  | "Low Pitch / 低音调"
  | "Moderate Pitch / 中音调"
  | "High Pitch / 高音调"
  | "Very High Pitch / 极高音调";
/** Estilo del diseño de voz (literal exacto del Space). */
export type OmniStyle = "Auto" | "Whisper / 耳语";
/**
 * Acento inglés del diseño de voz (literal EXACTO del Space `english_accent`).
 * ⚠️ VERIFICADO EN VIVO (2026-07-20) contra `k2-fsa-omnivoice.hf.space`
 * `/gradio_api/info`: los literales llevan " Accent / <中文>" (no la palabra sola).
 */
export type OmniAccent =
  | "Auto"
  | "American Accent / 美式口音"
  | "Australian Accent / 澳大利亚口音"
  | "British Accent / 英国口音"
  | "Chinese Accent / 中国口音"
  | "Canadian Accent / 加拿大口音"
  | "Indian Accent / 印度口音"
  | "Korean Accent / 韩国口音"
  | "Portuguese Accent / 葡萄牙口音"
  | "Russian Accent / 俄罗斯口音"
  | "Japanese Accent / 日本口音";

/** Opciones para la UI (etiqueta en español → literal EXACTO del Space). */
export const OMNI_GENDER_OPTIONS: ReadonlyArray<{ value: OmniGender; label: string }> = [
  { value: "Auto", label: "Automático" },
  { value: "Female / 女", label: "Femenina" },
  { value: "Male / 男", label: "Masculina" },
];
export const OMNI_AGE_OPTIONS: ReadonlyArray<{ value: OmniAge; label: string }> = [
  { value: "Auto", label: "Automática" },
  { value: "Child / 儿童", label: "Infantil" },
  { value: "Teenager / 少年", label: "Adolescente" },
  { value: "Young Adult / 青年", label: "Joven adulta" },
  { value: "Middle-aged / 中年", label: "Adulta" },
  { value: "Elderly / 老年", label: "Mayor" },
];
export const OMNI_PITCH_OPTIONS: ReadonlyArray<{ value: OmniPitch; label: string }> = [
  { value: "Auto", label: "Automático" },
  { value: "Very Low Pitch / 极低音调", label: "Muy grave" },
  { value: "Low Pitch / 低音调", label: "Grave" },
  { value: "Moderate Pitch / 中音调", label: "Medio" },
  { value: "High Pitch / 高音调", label: "Agudo" },
  { value: "Very High Pitch / 极高音调", label: "Muy agudo" },
];
export const OMNI_STYLE_OPTIONS: ReadonlyArray<{ value: OmniStyle; label: string }> = [
  { value: "Auto", label: "Natural" },
  { value: "Whisper / 耳语", label: "Susurro" },
];
export const OMNI_ACCENT_OPTIONS: ReadonlyArray<{ value: OmniAccent; label: string }> = [
  { value: "Auto", label: "Automático" },
  { value: "American Accent / 美式口音", label: "Americano" },
  { value: "British Accent / 英国口音", label: "Británico" },
  { value: "Australian Accent / 澳大利亚口音", label: "Australiano" },
  { value: "Canadian Accent / 加拿大口音", label: "Canadiense" },
  { value: "Indian Accent / 印度口音", label: "Indio" },
  { value: "Chinese Accent / 中国口音", label: "Chino" },
  { value: "Korean Accent / 韩国口音", label: "Coreano" },
  { value: "Japanese Accent / 日本口音", label: "Japonés" },
  { value: "Portuguese Accent / 葡萄牙口音", label: "Portugués" },
  { value: "Russian Accent / 俄罗斯口音", label: "Ruso" },
];

const OMNI_GENDERS = OMNI_GENDER_OPTIONS.map((o) => o.value);
const OMNI_AGES = OMNI_AGE_OPTIONS.map((o) => o.value);
const OMNI_PITCHES = OMNI_PITCH_OPTIONS.map((o) => o.value);
const OMNI_STYLES = OMNI_STYLE_OPTIONS.map((o) => o.value);
const OMNI_ACCENTS = OMNI_ACCENT_OPTIONS.map((o) => o.value);

/** Atributos de DISEÑO de voz (literales exactos del Space). */
export interface AstrauraDesignAttributes {
  gender: OmniGender;
  age: OmniAge;
  pitch: OmniPitch;
  style: OmniStyle;
  /** `english_accent` en el Space. */
  accent: OmniAccent;
}

/** Modo de privacidad del enrutado híbrido (local ↔ nube). */
export type OmniPrivacyMode = "hybrid_allow_cloud" | "local_only" | "cloud_only";

/**
 * `astraura_voice_config` — configuración COMPLETA del motor híbrido OmniVoice.
 * Vive como `AuroraVoiceConfig.omni` (ámbito CUENTA) y también, en forma
 * Partial, como override por personalidad (`PersonalityVoiceStyle.omni`).
 */
export interface AstrauraVoiceConfig {
  /** Diseño de voz (por defecto) o clonación. */
  generation_mode: "voice_design" | "voice_cloning";
  /** Atributos del DISEÑO de voz. */
  voice_design_attributes: AstrauraDesignAttributes;
  /** Clonación de voz (referencia + transcripción). */
  voice_cloning: {
    enabled: boolean;
    /** Ruta/URL del audio de referencia (el daemon local la usa tal cual). */
    reference_prompt_path?: string;
    /** Transcripción del audio de referencia. */
    reference_transcript?: string;
  };
  /** Parámetros de reproducción/entrega. */
  playback_parameters: {
    /** Velocidad 0.5–1.5. */
    speed: number;
    /** Normalizar el texto antes de sintetizar. */
    normalize_text: boolean;
    /** Permitir símbolos no verbales ([risas], [suspiro]…) — passthrough. */
    allow_non_verbal_symbols: boolean;
  };
  /** Enrutado híbrido: local+nube · solo local · solo nube. */
  privacy_mode: OmniPrivacyMode;
  /**
   * Instrucción de ENTREGA en lenguaje natural ("voz cálida y serena"). El daemon
   * local y la clonación en nube la reciben; el diseño en nube la usa como guía.
   */
  instruct?: string;
  /**
   * BETA: comprensión profunda de sonidos (subir audio a un modelo multimodal
   * gratis). Off por defecto. Ver `audio-emotion.ts` / senses-panel.
   */
  deep_sound_understanding?: boolean;
  /**
   * OPENVOICE V2 (web, sin instalar) — Adenda V2-VOZ. Ajustes del motor de nube
   * `openvoice2.ts`. Todos opcionales (migración suave: al leer se aplican
   * defaults). `style` = un id de `OPENVOICE2_STYLES` (en_br, es_default…);
   * `use_seed` = usar la semilla sintética de identidad (por defecto true);
   * `seed_version` = versión de la semilla cacheada.
   */
  openvoice?: {
    style?: string;
    seed_version?: number;
    use_seed?: boolean;
  };
}

/**
 * DEFAULT del motor híbrido — la voz de AURORA de fábrica: femenina, joven,
 * LUMINOSA (tono agudo), cálida y serena, con reproducción normalizada y
 * símbolos no verbales permitidos. Enrutado híbrido (local si está, si no nube
 * gratis).
 *
 * El `pitch` agudo NO es un descuido: es el MISMO que llevan las semillas
 * curadas de Aurora y Hermione (`openvoice2.ts::OPENVOICE2_SEED_SPECS_BY_LANG`).
 * Si aquí pusiera "Moderate", el diseño de voz por defecto y la semilla que se
 * clona no casarían y Aurora sonaría distinta según la vía que la sintetice.
 */
export const DEFAULT_ASTRAURA_VOICE: AstrauraVoiceConfig = {
  generation_mode: "voice_design",
  voice_design_attributes: {
    gender: "Female / 女",
    age: "Young Adult / 青年",
    pitch: "High Pitch / 高音调",
    style: "Auto",
    accent: "Auto",
  },
  voice_cloning: { enabled: false },
  playback_parameters: { speed: 1.0, normalize_text: true, allow_non_verbal_symbols: true },
  privacy_mode: "hybrid_allow_cloud",
  instruct: "voz femenina joven, cálida, cercana y luminosa, con brillo suave y serenidad",
};

function inSet<T extends string>(v: unknown, set: readonly T[], fallback: T): T {
  return typeof v === "string" && (set as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** Estilos EXACTOS del Space OpenVoiceV2 (duplicados aquí para evitar ciclos). */
const OPENVOICE2_STYLE_VALUES: readonly string[] = [
  "en_default",
  "en_us",
  "en_br",
  "en_au",
  "en_in",
  "es_default",
  "fr_default",
  "jp_default",
  "zh_default",
  "kr_default",
];

/**
 * Sanea el sub-esquema `openvoice` (Adenda V2-VOZ). Campos opcionales: devuelve
 * solo los presentes y válidos (migración suave). undefined si no hay nada útil.
 * Nunca lanza. PURO (testeable sin red).
 */
export function sanitizeOpenVoiceConfig(
  raw: unknown,
): { style?: string; seed_version?: number; use_seed?: boolean } | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const out: { style?: string; seed_version?: number; use_seed?: boolean } = {};
  if (typeof r.style === "string" && OPENVOICE2_STYLE_VALUES.includes(r.style)) {
    out.style = r.style;
  }
  if (typeof r.seed_version === "number" && Number.isFinite(r.seed_version) && r.seed_version >= 0) {
    out.seed_version = Math.floor(r.seed_version);
  }
  if (typeof r.use_seed === "boolean") out.use_seed = r.use_seed;
  return Object.keys(out).length ? out : undefined;
}

/** Sanea atributos de diseño (cualquier basura → literal válido o "Auto"). */
export function sanitizeDesignAttributes(raw: unknown): AstrauraDesignAttributes {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    gender: inSet(r.gender, OMNI_GENDERS, "Auto"),
    age: inSet(r.age, OMNI_AGES, "Auto"),
    pitch: inSet(r.pitch, OMNI_PITCHES, "Auto"),
    style: inSet(r.style, OMNI_STYLES, "Auto"),
    accent: inSet(r.accent, OMNI_ACCENTS, "Auto"),
  };
}

/**
 * Sanea la config COMPLETA del motor híbrido (rellena defaults). Nunca lanza.
 * Úsalo para el ámbito CUENTA (`AuroraVoiceConfig.omni`).
 */
export function sanitizeAstrauraVoice(raw: unknown): AstrauraVoiceConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const clone = (r.voice_cloning && typeof r.voice_cloning === "object"
    ? r.voice_cloning
    : {}) as Record<string, unknown>;
  const pb = (r.playback_parameters && typeof r.playback_parameters === "object"
    ? r.playback_parameters
    : {}) as Record<string, unknown>;
  const out: AstrauraVoiceConfig = {
    generation_mode: r.generation_mode === "voice_cloning" ? "voice_cloning" : "voice_design",
    voice_design_attributes: sanitizeDesignAttributes(r.voice_design_attributes),
    voice_cloning: {
      enabled: clone.enabled === true,
      reference_prompt_path:
        typeof clone.reference_prompt_path === "string" && clone.reference_prompt_path.trim()
          ? clone.reference_prompt_path.trim().slice(0, 2048)
          : undefined,
      reference_transcript:
        typeof clone.reference_transcript === "string" && clone.reference_transcript.trim()
          ? clone.reference_transcript.trim().slice(0, 2000)
          : undefined,
    },
    playback_parameters: {
      speed: num(pb.speed, 0.5, 1.5) ?? 1.0,
      normalize_text: pb.normalize_text !== false,
      allow_non_verbal_symbols: pb.allow_non_verbal_symbols !== false,
    },
    privacy_mode:
      r.privacy_mode === "local_only"
        ? "local_only"
        : r.privacy_mode === "cloud_only"
          ? "cloud_only"
          : "hybrid_allow_cloud",
    deep_sound_understanding: r.deep_sound_understanding === true,
  };
  if (typeof r.instruct === "string" && r.instruct.trim()) {
    out.instruct = r.instruct.trim().slice(0, 500);
  }
  const ov = sanitizeOpenVoiceConfig(r.openvoice);
  if (ov) out.openvoice = ov;
  return out;
}

/**
 * Sanea un OVERRIDE parcial (por personalidad): solo devuelve los campos
 * presentes, para poder fusionarlo sobre la config de cuenta sin pisar el resto.
 * Nunca lanza; undefined si no hay nada útil.
 */
export function sanitizeAstrauraVoicePartial(raw: unknown): Partial<AstrauraVoiceConfig> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const out: Partial<AstrauraVoiceConfig> = {};
  if (r.generation_mode === "voice_design" || r.generation_mode === "voice_cloning") {
    out.generation_mode = r.generation_mode;
  }
  if (r.voice_design_attributes && typeof r.voice_design_attributes === "object") {
    out.voice_design_attributes = sanitizeDesignAttributes(r.voice_design_attributes);
  }
  if (r.voice_cloning && typeof r.voice_cloning === "object") {
    const full = sanitizeAstrauraVoice({ voice_cloning: r.voice_cloning });
    out.voice_cloning = full.voice_cloning;
  }
  if (r.playback_parameters && typeof r.playback_parameters === "object") {
    const full = sanitizeAstrauraVoice({ playback_parameters: r.playback_parameters });
    out.playback_parameters = full.playback_parameters;
  }
  if (r.privacy_mode === "local_only" || r.privacy_mode === "cloud_only" || r.privacy_mode === "hybrid_allow_cloud") {
    out.privacy_mode = r.privacy_mode;
  }
  if (typeof r.instruct === "string" && r.instruct.trim()) out.instruct = r.instruct.trim().slice(0, 500);
  if (r.deep_sound_understanding === true || r.deep_sound_understanding === false) {
    out.deep_sound_understanding = r.deep_sound_understanding;
  }
  const ov = sanitizeOpenVoiceConfig(r.openvoice);
  if (ov) out.openvoice = ov;
  return Object.keys(out).length ? out : undefined;
}

/** Fusiona un override (personalidad) sobre una base (cuenta). Nunca lanza. */
export function mergeAstrauraVoice(
  base: AstrauraVoiceConfig,
  over?: Partial<AstrauraVoiceConfig> | null,
): AstrauraVoiceConfig {
  if (!over) return base;
  return {
    generation_mode: over.generation_mode ?? base.generation_mode,
    voice_design_attributes: over.voice_design_attributes ?? base.voice_design_attributes,
    voice_cloning: over.voice_cloning ?? base.voice_cloning,
    playback_parameters: over.playback_parameters ?? base.playback_parameters,
    privacy_mode: over.privacy_mode ?? base.privacy_mode,
    instruct: over.instruct ?? base.instruct,
    deep_sound_understanding: over.deep_sound_understanding ?? base.deep_sound_understanding,
    // OpenVoice V2: fusiona campo a campo (el override de la personalidad gana).
    openvoice:
      over.openvoice || base.openvoice
        ? { ...(base.openvoice ?? {}), ...(over.openvoice ?? {}) }
        : undefined,
  };
}

/**
 * mapDesignAttrsToSpace — traduce los atributos de diseño a los 6 parámetros de
 * ENUM que el Space coloca en `/_design_fn` (posiciones 9–14), garantizando
 * LITERALES EXACTOS (con su parte china) y "Auto" ante cualquier valor inválido.
 * `chinese_dialect` se deja en "Auto" (no lo exponemos en la UI). Nunca lanza.
 */
export function mapDesignAttrsToSpace(attrs: Partial<AstrauraDesignAttributes> | undefined): {
  gender: OmniGender;
  age: OmniAge;
  pitch: OmniPitch;
  style: OmniStyle;
  english_accent: OmniAccent;
  chinese_dialect: "Auto";
} {
  const a = sanitizeDesignAttributes(attrs);
  return {
    gender: a.gender,
    age: a.age,
    pitch: a.pitch,
    style: a.style,
    english_accent: a.accent,
    chinese_dialect: "Auto",
  };
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

// ── Selección de idioma (locale) — saneado ───────────────────────────────────

/** Sanea un código de locale: válido solo si existe en el catálogo de locales.ts. */
function sanitizeLocale(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const norm = raw.trim();
  if (!norm) return undefined;
  return findLocale(norm)?.code;
}

/** Sanea una lista de locales preferidos: solo códigos válidos, sin duplicar. */
function sanitizeLocaleList(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: string[] = [];
  for (const v of raw) {
    const c = sanitizeLocale(v);
    if (c && !out.includes(c)) out.push(c);
  }
  return out.length ? out : undefined;
}

/** Sanea el mapa personalidad→locale: descarta entradas con código inválido. */
function sanitizePersonalityLocales(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of Object.keys(r)) {
    const c = sanitizeLocale(r[key]);
    if (c) out[key] = c;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Locale PRINCIPAL efectivo: el guardado si sigue siendo válido; si no, la
 * mejor sugerencia del entorno (`suggestLocalesFromEnvironment()`); si tampoco
 * hay ninguna, "es-ES". SIEMPRE devuelve un código conocido. Nunca lanza.
 */
function resolvePrimaryLocale(raw: unknown): string {
  const clean = sanitizeLocale(raw);
  if (clean) return clean;
  try {
    const suggested = suggestLocalesFromEnvironment()[0];
    if (suggested && findLocale(suggested)) return suggested;
  } catch {
    /* entorno no disponible → respaldo fijo */
  }
  return "es-ES";
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
  if (!ls) return { ...DEFAULT_VOICE_CONFIG, primaryLocale: resolvePrimaryLocale(undefined) };
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
      // OmniVoice híbrido: SIEMPRE presente y saneado (rellena defaults). CERO config.
      const omni = sanitizeAstrauraVoice(parsed?.omni);
      // Selección de idioma: `primaryLocale` SIEMPRE relleno (guardado válido o
      // sugerencia del entorno); preferredLocales/personalityLocales opcionales.
      const primaryLocale = resolvePrimaryLocale(parsed?.primaryLocale);
      const preferredLocales = sanitizeLocaleList(parsed?.preferredLocales);
      const personalityLocales = sanitizePersonalityLocales(parsed?.personalityLocales);
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
        omni,
        primaryLocale,
        preferredLocales,
        personalityLocales,
      };
    }
    // Sin config unificada: honra el opt-in histórico de Kokoro si estaba ON.
    if (isOssTtsEnabled()) {
      return {
        engine: "kokoro",
        autoDownload: false,
        auto: true,
        style: { ...DEFAULT_VOICE_STYLE },
        primaryLocale: resolvePrimaryLocale(undefined),
      };
    }
  } catch {
    /* corrupto o inaccesible → default */
  }
  return { ...DEFAULT_VOICE_CONFIG, primaryLocale: resolvePrimaryLocale(undefined) };
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
    // OmniVoice híbrido: fusión profunda (parche parcial) sobre la config actual.
    omni:
      "omni" in patch
        ? sanitizeAstrauraVoice({
            ...(current.omni ?? DEFAULT_ASTRAURA_VOICE),
            ...(patch.omni ?? {}),
          })
        : (current.omni ?? DEFAULT_ASTRAURA_VOICE),
    // Selección de idioma: `primaryLocale` se reemplaza (saneado, con caída a
    // la sugerencia del entorno); `preferredLocales` se reemplaza tal cual (la
    // UI manda la lista completa); `personalityLocales` se FUSIONA (cada
    // llamada suele tocar una sola personalidad, sin pisar el resto del mapa).
    primaryLocale:
      "primaryLocale" in patch ? resolvePrimaryLocale(patch.primaryLocale) : current.primaryLocale,
    preferredLocales:
      "preferredLocales" in patch
        ? sanitizeLocaleList(patch.preferredLocales)
        : current.preferredLocales,
    personalityLocales:
      "personalityLocales" in patch
        ? sanitizePersonalityLocales({
            ...(current.personalityLocales ?? {}),
            ...(patch.personalityLocales ?? {}),
          })
        : current.personalityLocales,
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

/** Config del motor híbrido OmniVoice (cuenta), siempre saneada. Nunca lanza. */
export function getOmniConfig(): AstrauraVoiceConfig {
  try {
    return sanitizeAstrauraVoice(getVoiceConfig().omni);
  } catch {
    return { ...DEFAULT_ASTRAURA_VOICE };
  }
}

/** Fusiona un parche en la config OmniVoice de cuenta y persiste. Nunca lanza. */
export function setOmniConfig(patch: Partial<AstrauraVoiceConfig>): void {
  setVoiceConfig({ omni: patch as AstrauraVoiceConfig });
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

// ── Selección de idioma (locale) — lectura/escritura ────────────────────────

/**
 * Locale PRINCIPAL preferido por el usuario (BCP-47, p.ej. "es-MX"). Si no hay
 * uno fijado (o el guardado ya no es válido), cae a la mejor sugerencia del
 * entorno (`suggestLocalesFromEnvironment()`, en `locales.ts`). SIEMPRE
 * devuelve un código conocido del catálogo. Nunca lanza.
 */
export function getPreferredLocale(): string {
  try {
    return getVoiceConfig().primaryLocale ?? resolvePrimaryLocale(undefined);
  } catch {
    return "es-ES";
  }
}

/**
 * Idioma BASE (p.ej. "es") derivado del locale preferido — lo que la síntesis
 * distingue con fiabilidad hoy (el matiz regional depende del soporte de cada
 * motor, ver `locales.ts`). Nunca lanza.
 */
export function getPreferredLangBase(): string {
  try {
    return baseOf(getPreferredLocale());
  } catch {
    return "es";
  }
}

/** Otros locales preferidos (además del principal), saneados. Nunca lanza. */
export function getPreferredLocales(): string[] {
  try {
    return [...(getVoiceConfig().preferredLocales ?? [])];
  } catch {
    return [];
  }
}

/** Locale fijado para UNA personalidad (override), o undefined si no hay. Nunca lanza. */
export function getPersonalityLocale(personalityId: string): string | undefined {
  if (!personalityId) return undefined;
  try {
    return getVoiceConfig().personalityLocales?.[personalityId];
  } catch {
    return undefined;
  }
}

/** Fija el locale de UNA personalidad (fusiona con el resto del mapa). Nunca lanza. */
export function setPersonalityLocale(personalityId: string, code: string): void {
  if (!personalityId) return;
  const clean = sanitizeLocale(code);
  if (!clean) return;
  setVoiceConfig({ personalityLocales: { [personalityId]: clean } });
}

/**
 * Quita el override de locale de UNA personalidad (vuelve a heredar el
 * `primaryLocale` de la cuenta). Escribe directo (como `resetVoiceStyle`)
 * porque `setVoiceConfig` solo fusiona/añade claves, no las borra. Nunca lanza.
 */
export function clearPersonalityLocale(personalityId: string): void {
  if (!personalityId) return;
  const ls = safeLocalStorage();
  const current = getVoiceConfig();
  const rest = { ...(current.personalityLocales ?? {}) };
  delete rest[personalityId];
  const next: AuroraVoiceConfig = {
    ...current,
    personalityLocales: Object.keys(rest).length ? rest : undefined,
  };
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

/**
 * Género de voz preferido AHORA MISMO (preset de voz activo + la regla
 * FUERTE femenina-por-defecto de `preferredVoiceGender()`). Cero argumentos a
 * propósito: los motores de respaldo (kokoro.ts, neural-tts.ts) lo llaman sin
 * depender de que quien los invoque sepa nada de género — así Aurora suena
 * femenina por defecto en cualquier motor sin tocar el código que orquesta la
 * cadena de voz. Nunca lanza.
 */
export function currentPreferredVoiceGender(): VoiceGenderPref {
  try {
    return preferredVoiceGender(getActiveVoicePreset()?.gender);
  } catch {
    return "f";
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
