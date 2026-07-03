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
  // Motor
  isOssTtsSupported,
  loadTtsModel,
  isTtsModelReady,
  speakOss,
  stopOssTts,
  isOssTtsSpeaking,
  speakOssForAurora,
  type OssTtsLoadStatus,
  type OssTtsLoadProgress,
  type SpeakOssOptions,
} from "@/lib/aurora/tts-oss/oss-tts";
