/**
 * OÍDO OpenAI-compatible — Cliente para servidores de reconocimiento de voz
 * que expongan la API `/v1/audio/transcriptions` compatible con Whisper
 * (Phonon-2, Parakeet, etc.).
 * ─────────────────────────────────────────────────────────────────────────────
 * Ola 1015V · Voz fusionada de Astraura: un oído, una voz y una plática en directo
 */

import { corregirConGlosario, glosarioBase } from "./glosario-oido";

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
   const fetchFn = config.fetchImpl ?? fetch;
   const controller = new AbortController();
   const timeoutId = config.timeoutMs ? setTimeout(() => controller.abort(), config.timeoutMs) : undefined;

   // Helper to get current time in milliseconds with high resolution if available
   const now = () => {
     if (typeof performance !== 'undefined' && performance.now) {
       return performance.now();
     }
     return Date.now();
   };

   const startTime = now();

   try {
     const url = `${config.base}/v1/audio/transcriptions`;
     const formData = new FormData();
     formData.append("model", config.modelo);
     formData.append("file", audio, "file");

     if (config.idioma) {
       formData.append("language", config.idioma);
     }

     if (config.hotwords && config.hotwords.length > 0) {
       formData.append("prompt", config.hotwords.join(","));
     }

     const headers: Record<string, string> = {};
     if (config.claveBearer) {
       headers.Authorization = `Bearer ${config.claveBearer}`;
     }

     const response = await fetchFn(url, {
       method: "POST",
       body: formData,
       headers,
       signal: controller.signal,
     });

     clearTimeout(timeoutId);
     const endTime = now();
     const ms = endTime - startTime;

     if (!response.ok) {
       return {
         ok: false,
         motivo: response.statusText || "Error HTTP",
       };
     }

      const data = await response.json();
      const textoRaw = typeof data.text === "string" ? data.text : "";
      const idiomaEfectivo = config.idioma || data.language || "es";
      const glosario = glosarioBase(config.hotwords);
      const corregido = corregirConGlosario(textoRaw, glosario, idiomaEfectivo);
      return {
        ok: true,
        texto: corregido.texto,
        idioma: data.language,
        motor: "openai",
        ms: Math.max(0, ms),
      };
   } catch (err) {
     clearTimeout(timeoutId);
     const endTime = now();
     const ms = endTime - startTime; // Not used in error cases, but we compute for completeness

     if (err instanceof Error && err.name === "AbortError") {
       return {
         ok: false,
         motivo: "Timeout",
       };
     }
     return {
       ok: false,
       motivo: "Error de red",
     };
   }
 }