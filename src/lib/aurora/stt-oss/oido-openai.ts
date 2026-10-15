/**
 * OÍDO OpenAI-compatible — Cliente para servidores de reconocimiento de voz
 * que expongan la API `/v1/audio/transcriptions` compatible con Whisper
 * (Phonon-2, Parakeet, etc.).
 * ─────────────────────────────────────────────────────────────────────────────
 * Ola 1015V · Voz fusionada de Astraura: un oído, una voz y una plática en directo
 */

/**
 * Resultado exitoso de la transcripción.
 */
export interface TranscripcionExitosa {
  /** Indica que la operación fue exitosa. */
  ok: true;
  /** Texto transcrito. */
  texto: string;
  /** Idioma detectado o proporcionado (opcional). */
  idioma?: string;
  /** Motor que realizó la transcripción (p. ej. "phonon-2", "parakeet-v3"). */
  motor: string;
  /** Tiempo transcurrido en milisegundos. */
  ms: number;
}

/**
 * Resultado fallido de la transcripción.
 */
export interface TranscripcionFallida {
  /** Indica que la operación falló. */
  ok: false;
  /** Motivo corto del error (sin URL ni clave). */
  motivo: string;
}

/**
 * Tipo de retorno de la función.
 */
export type ResultadoTranscripcion = TranscripcionExitosa | TranscripcionFallida;

/**
 * Construye la URL local del oír para el motor dado.
 * @param motor - Identificador del motor ("phonon-2" o "parakeet-v3").
 * @returns Ruta base del daemon local para ese motor.
 */
export function urlOidoLocal(motor: string): string {
  switch (motor) {
    case "phonon-2":
      return "/api/voz-local/oido/phonon";
    case "parakeet-v3":
      return "/api/voz-local/oido/parakeet";
    default:
      // Por defecto, asumimos que es una ruta relativa al daemon.
      return `/api/voz-local/oido/${motor}`;
  }
}

/**
 * Transcribe un blob de audio usando un servidor OpenAI-compatible.
 * @param audio - Blob de audio a transcribir.
 * @param config - Configuración de la petición.
 * @returns Promesa con el resultado de la transcripción.
 */
export async function transcribirOpenAI(
  audio: Blob,
  config: {
    /** URL base del servidor (p. ej. "http://localhost:8000"). */
    base: string;
    /** Modelo a utilizar (p. ej. "whisper-1"). */
    modelo: string;
    /** Idioma opcional (p. ej. "es", "en"). */
    idioma?: string;
    /** Palabras clave para mejorar el reconocimiento (se unen por coma en el prompt). */
    hotwords?: string[];
    /** Token Bearer para autorización (opcional). */
    claveBearer?: string;
    /** Timeout en milisegundos (por defecto 20000). */
    timeoutMs?: number;
    /** Implementación de fetch a utilizar (por defecto global fetch). */
    fetchImpl?: typeof fetch;
  }
): Promise<ResultadoTranscripcion> {
  // TODO: Implementar
  return { ok: false, motivo: "Not implemented" };
}