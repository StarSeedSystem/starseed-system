"use client";

/**
 * StarSeed OS — Barrel de la VOZ de Aurora OPEN-SOURCE (Kokoro TTS por CDN).
 * ----------------------------------------------------------------------------
 * Punto único de importación para la voz alternativa (kokoro-js por CDN).
 * Importar este índice NO carga nada pesado: el modelo sólo se descarga cuando
 * el usuario llama a `loadTtsModel()` / `speakOss()`.
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
  // Config UNIFICADA de voz (motor + voz + autoDownload) — viaja con la cuenta
  AURORA_VOICE_CONFIG_KEY,
  AURORA_VOICE_CONFIG_EVENT,
  DEFAULT_VOICE_CONFIG,
  getVoiceConfig,
  getVoiceEngine,
  setVoiceConfig,
  setVoiceEngine,
  setVoiceName,
  getEffectiveVoice,
  subscribeVoiceConfig,
  type AuroraVoiceEngine,
  type AuroraVoiceConfig,
} from "@/lib/aurora/tts-oss/voice-config";

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
