"use client";

/**
 * StarSeed OS — Barrel de la VOZ de Aurora (multi-motor, gratis-primero).
 * ----------------------------------------------------------------------------
 * Punto único de importación de TODO el sistema de voz. Importar este índice NO
 * carga nada pesado: los modelos/servidores solo se tocan cuando hay que hablar.
 *
 * ── API PARA EL CENTRO DE CONFIGURACIÓN (Adenda 67 · P2) ────────────────────
 * Todo lo que la pantalla de configuración necesita, desde aquí:
 *
 *   import {
 *     listVoiceEngines,            // motores + ficha + estado (sync, sin red)
 *     listVoiceEnginesWithStatus,  // idem, comprobando servidores (async)
 *     listVoicePresets,            // tipos de voz prediseñados
 *     listEngineVoices,            // voces reales de UN motor (async)
 *     testVoice,                   // prueba HONESTA de un motor (async)
 *     applyVoicePreset, setVoiceEngine, setEngineSettings,
 *   } from "@/lib/aurora/tts-oss";
 *
 * Motores: `browser` (defecto, siempre disponible) · `voxcpm` (PRINCIPAL cuando
 * tiene endpoint: el más realista) · `voicebox` · `gpt-sovits` · `bark` ·
 * `omnivoice` · `kokoro` (local) · `kitten` (beta).
 */

export {
  // Opt-in persistido + voces
  AURORA_OSS_TTS_KEY,
  AURORA_OSS_TTS_VOICE_KEY,
  AURORA_OSS_TTS_EVENT,
  KOKORO_MODEL_REPO,
  KOKORO_APPROX_SIZE,
  OSS_TTS_VOICES,
  DEFAULT_OSS_TTS_VOICE,
  isKnownVoice,
  isOssTtsEnabled,
  setOssTtsEnabled,
  getOssTtsVoice,
  setOssTtsVoice,
  subscribeOssTts,
  type OssTtsVoiceLang,
  type OssTtsVoiceSpec,
} from "@/lib/aurora/tts-oss/opt-in";

export {
  // Motor (bajo nivel: Kokoro por CDN + WebAudio)
  isOssTtsSupported,
  loadTtsModel,
  isTtsModelReady,
  speakOss,
  stopOssTts,
  isOssTtsSpeaking,
  speakOssForAurora,
  getLoadedTts,
  generateOssRaw,
  rawAudioToWavBlob,
  type OssTtsLoadStatus,
  type OssTtsLoadProgress,
  type SpeakOssOptions,
} from "@/lib/aurora/tts-oss/oss-tts";

export {
  // Config UNIFICADA de voz (motor + voz + autoDownload + endpoints + estilo)
  // — TODO dentro de la misma clave sincronizada con la cuenta
  AURORA_VOICE_CONFIG_KEY,
  AURORA_VOICE_CONFIG_EVENT,
  AURORA_VOICE_STYLE_EVENT,
  DEFAULT_VOICE_CONFIG,
  DEFAULT_VOICE_STYLE,
  VOICE_PRESETS,
  AURORA_ORGANIC_PRESET_ID,
  NEURAL_VOICE_ENGINES,
  isNeuralEngine,
  isVoiceEngineId,
  normalizeEmotion,
  sanitizeStyle,
  getVoiceConfig,
  getVoiceEngine,
  setVoiceConfig,
  setVoiceEngine,
  setVoiceName,
  getEngineSettings,
  setEngineSettings,
  getVoiceStyle,
  setVoiceStyle,
  resetVoiceStyle,
  getEffectiveVoice,
  ensureOrganicVoiceDefault,
  applyVoicePreset,
  getActiveVoicePreset,
  findVoicePreset,
  subscribeVoiceConfig,
  // OmniVoice híbrido (Adenda 77-voz)
  DEFAULT_ASTRAURA_VOICE,
  OMNI_GENDER_OPTIONS,
  OMNI_AGE_OPTIONS,
  OMNI_PITCH_OPTIONS,
  OMNI_STYLE_OPTIONS,
  OMNI_ACCENT_OPTIONS,
  getOmniConfig,
  setOmniConfig,
  sanitizeAstrauraVoice,
  sanitizeAstrauraVoicePartial,
  sanitizeDesignAttributes,
  mergeAstrauraVoice,
  mapDesignAttrsToSpace,
  type AuroraVoiceEngine,
  type NeuralVoiceEngine,
  type AuroraVoiceEmotion,
  type AuroraVoiceStyle,
  type AuroraVoicePreset,
  type NeuralEngineSettings,
  type AuroraVoiceConfig,
  type AstrauraVoiceConfig,
  type AstrauraDesignAttributes,
  type OmniPrivacyMode,
  type OmniGender,
  type OmniAge,
  type OmniPitch,
  type OmniStyle,
  type OmniAccent,
} from "@/lib/aurora/tts-oss/voice-config";

export {
  // REGISTRO DE MOTORES + selección automática (Adenda 67 · P2-3).
  // Es la API que consume el Centro de Configuración de Aurora.
  VOICE_ENGINE_REGISTRY,
  AUTO_ENDPOINT_ORDER,
  PRIMARY_VOICE_ENGINE,
  VOICE_TEST_PHRASE,
  listVoiceEngines,
  listVoiceEnginesWithStatus,
  listVoicePresets,
  listEngineVoices,
  testVoice,
  buildVoiceChain,
  resolveActiveVoiceEngine,
  personalityVoiceEnginePin,
  refreshPersonalityVoicePin,
  type VoiceEngineMeta,
  type VoiceEngineKind,
  type VoiceEngineStatus,
  type VoiceEngineAvailability,
  type VoiceChainLink,
  type EngineVoiceOption,
  type VoiceTestResult,
} from "@/lib/aurora/tts-oss/engine-registry";

export {
  // Estilo emocional (8 emociones → parámetros por motor + evento vivo)
  VOICE_EMOTIONS,
  emotionSpec,
  resolveVoiceParams,
  decorateTextForBark,
  decorateTextForVoxCPM,
  voiceDesignPrompt,
  deliveryInstruction,
  passthroughParams,
  installVoiceStyleListener,
  emitVoiceStyle,
  engineStyleOverrides,
  type EmotionSpec,
  type ResolvedVoiceParams,
} from "@/lib/aurora/tts-oss/voice-style";

export {
  // Ranking de voces del navegador (voz NATURAL por defecto, sin configurar)
  rankBrowserVoices,
  getBestBrowserVoice,
  resolveBrowserVoice,
  listBrowserVoices,
  scoreVoice,
  type RankedVoice,
} from "@/lib/aurora/tts-oss/browser-voices";

export {
  // Motores NEURALES por endpoint
  // (VoxCPM · Voicebox · Bark · GPT-SoVITS · OmniVoice)
  NEURAL_ENGINE_META,
  NEURAL_TTS_TIMEOUT_MS,
  ENGINE_TIMEOUT_MS,
  NEURAL_PING_TTL_MS,
  VOICEBOX_DEFAULT_ENDPOINT,
  VOXCPM_DEFAULT_MODEL,
  normalizeEndpoint,
  neuralSynthesize,
  neuralSpeak,
  stopNeural,
  isNeuralSpeaking,
  pingNeuralEngine,
  neuralEngineConfigured,
  listVoiceboxProfiles,
  type NeuralSpeakOptions,
  type NeuralPingState,
  type VoiceboxProfile,
} from "@/lib/aurora/tts-oss/neural-tts";

export {
  // OpenVoice (web gratis, automática — Adendas 78-82): estado para reportes.
  getOpenVoice2State,
  warmOpenVoice2,
  type OpenVoice2State,
} from "@/lib/aurora/tts-oss/openvoice2";

export {
  // OmniVoice HÍBRIDO (nube gratis ↔ daemon local): ruta viva para reportes.
  getOmniVoiceRouteState,
  refreshOmniRoute,
  type OmniRoute,
} from "@/lib/aurora/tts-oss/omnivoice-hybrid";

export {
  // Motor Kokoro (fachada de alto nivel: reproduce por <audio> desde blob)
  kokoroAvailable,
  kokoroModelReady,
  kokoroPreload,
  kokoroSpeak,
  stopKokoro,
  isKokoroSpeaking,
  KOKORO_SPANISH_VOICES,
  KOKORO_DEFAULT_SPANISH_VOICE,
  type KokoroSpeakOptions,
} from "@/lib/aurora/tts-oss/kokoro";

export {
  // Motor Kitten (stub honesto: beta/inglés, hoy no activo)
  kittenAvailable,
  kittenModelReady,
  kittenSpeak,
  stopKitten,
  isKittenSpeaking,
  KITTEN_STATUS,
  KITTEN_VOICES,
  type KittenSpeakOptions,
} from "@/lib/aurora/tts-oss/kitten";

export {
  // Enrutador multi-motor (lo usa el engine de Aurora)
  speakWithConfiguredEngine,
  isConfiguredOssEngineReady,
  stopConfiguredEngine,
  type ConfiguredSpeakOptions,
} from "@/lib/aurora/tts-oss/speak-router";
