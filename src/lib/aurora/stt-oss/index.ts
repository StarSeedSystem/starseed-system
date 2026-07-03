"use client";

/**
 * StarSeed OS — Barrel del respaldo de reconocimiento de voz OPEN-SOURCE.
 * ----------------------------------------------------------------------------
 * Punto único de importación para el fallback STT (transformers.js por CDN).
 * Importar este índice NO carga nada pesado: el modelo sólo se descarga cuando
 * el usuario llama a `loadModel()` / `startOssStt()`.
 */

export {
  // Opt-in persistido + modelos
  AURORA_OSS_STT_KEY,
  AURORA_OSS_STT_MODEL_KEY,
  AURORA_OSS_STT_EVENT,
  OSS_STT_MODELS,
  DEFAULT_OSS_STT_MODEL,
  isOssSttEnabled,
  setOssSttEnabled,
  getOssSttModel,
  setOssSttModel,
  subscribeOssStt,
  type OssSttModelId,
  type OssSttModelSpec,
} from "@/lib/aurora/stt-oss/opt-in";

export {
  // Motor
  isOssSttSupported,
  loadModel,
  isModelReady,
  startOssStt,
  stopOssStt,
  isOssSttListening,
  pipeOssSttToAurora,
  type OssSttLoadStatus,
  type OssSttLoadProgress,
  type StartOssSttOptions,
  type OssSttSession,
} from "@/lib/aurora/stt-oss/oss-stt";
