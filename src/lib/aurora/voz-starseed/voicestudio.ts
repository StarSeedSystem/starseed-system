// src/lib/aurora/voz-starseed/voicestudio.ts
/**
 * CLIENTE DE VOICESTUDIO — API compatible con OpenAI, descubrimiento y voz en flujo por frases
 * (Ola 1018V · Voz de Astraura + VoiceStudio: motores libres, licencia por contexto,
 * clonación con permiso e instantánea en cada neurona)
 *
 * Este módulo proporciona funciones para interactuar con un servidor VoiceStudio local o remoto.
 * Todas las funciones son puras en cuanto a sus efectos secundarios (solo red) y están diseñadas
 * para ser inyectables en tests (se puede pasar una implementación personalizada de fetch y
 * WebSocket).
 */

/** Resultado del descubrimiento del servicio VoiceStudio. */
export interface DescubrimientoResult {
  /** Indica si el servicio está vivo y responde. */
  vivo: boolean;
  /** Versión del servicio (opcional). */
  version?: string;
  /** Array de capacidades que el servicio ofrece (ej. ["voz", "transcripcion"]). */
  ofrece?: string[];
  /** Motivo por el cual el servicio no está vivo (solo cuando vivo es false). */
  motivo?: string;
}

/** Parámetros para la función de síntesis de voz. */
export interface HablarParams {
  /** Texto a convertir en voz. */
  texto: string;
  /** ID de la voz a utilizar (según el listado de `/v1/audio/voices`). */
  voz: string;
  /** Formato de audio de salida (ej. "mp3", "opus", "wav"). */
  formato?: string;
}

/** Parámetros para la función de transcripción. */
export interface TranscribirParams {
  /** Blob o ArrayBuffer con los datos de audio a transcribir. */
  audio: Blob | ArrayBuffer;
  /** Idioma del audio (código ISO 639-1, ej. "es", "en"). */
  idioma: string;
}

/**
 * Descubre si hay un servicio VoiceStudio disponible en la base dada.
 * @param base URL base del servicio (por defecto: http://127.0.0.1:3900)
 * @param fetchImpl Implementación de fetch a utilizar (para testing)
 * @returns Promesa que resuelve con el resultado del descubrimiento.
 */
export async function descubrir(
  base: string = "http://127.0.0.1:3900",
  fetchImpl: typeof fetch = fetch
): Promise<DescubrimientoResult> {
  const url = `${base.replace(/\/+$/, "")}/.well-known/voicestudio-speech`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 800);
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      return {
        vivo: false,
        motivo: `HTTP ${response.status}: ${response.statusText}`,
      };
    }
    const data = (await response.json()) as {
      vivo?: boolean;
      version?: string;
      ofrece?: string[];
      motivo?: string;
    };
    return {
      vivo: data.vivo ?? false,
      version: data.version,
      ofrece: data.ofrece,
      motivo: data.motivo,
    };
  } catch (err: any) {
    if (err.name === "AbortError") {
      return { vivo: false, motivo: "Timeout de conexión (800 ms)" };
    }
    // Error de red o de otro tipo
    if (err.name === "TypeError" && err.message === "Failed to fetch") {
      return {
        vivo: false,
        motivo: "Error de red: no se pudo conectar al servicio",
      };
    }
    return {
      vivo: false,
      motivo: err.message ?? "Error desconocido",
    };
  }
}

/**
 * Obtiene la lista de voces disponibles en el servicio VoiceStudio.
 * @param base URL base del servicio (por defecto: http://127.0.0.1:3900)
 * @param fetchImpl Implementación de fetch a utilizar (para testing)
 * @returns Promesa que resuelve con un array de strings (IDs de voz).
 * @throws Error si la petición falla o la respuesta no es válida.
 */
export async function voces(
  base: string = "http://127.0.0.1:3900",
  fetchImpl: typeof fetch = fetch
): Promise<string[]> {
  const url = `${base.replace(/\/+$/, "")}/v1/audio/voices`;
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }
    const data = (await response.json()) as { voices: Array<{ id: string }> };
    if (!Array.isArray(data.voices)) {
      throw new Error("Formato de respuesta inesperado: se esperaba un array de voces");
    }
    return data.voices.map(v => v.id);
  } catch (err: any) {
    if (err.name === "TypeError" && err.message === "Failed to fetch") {
      throw new Error("Error de red: no se pudo conectar al servicio");
    }
    throw err;
  }
}

/**
 * Sintetiza voz a partir de texto utilizando el servicio VoiceStudio.
 * @param base URL base del servicio (por defecto: http://127.0.0.1:3900)
 * @param params Parámetros de síntesis (texto, voz, formato)
 * @param fetchImpl Implementación de fetch a utilizar (para testing)
 * @returns Promesa que resuelve con los bytes de audio sintetizado (Uint8Array).
 * @throws Error si la petición falla o la respuesta no es válida.
 */
export async function hablar(
  base: string = "http://127.0.0.1:3900",
  params: HablarParams,
  fetchImpl: typeof fetch = fetch
): Promise<Uint8Array> {
  const url = `${base.replace(/\/+$/, "")}/v1/audio/speech`;
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: params.texto,
        voice: params.voz,
        response_format: params.formato,
      }),
    });
    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }
    const bytes = await response.arrayBuffer();
    return new Uint8Array(bytes);
  } catch (err: any) {
    if (err.name === "TypeError" && err.message === "Failed to fetch") {
      throw new Error("Error de red: no se pudo conectar al servicio");
    }
    throw err;
  }
}

/**
 * Transcribe audio a texto utilizando el servicio VoiceStudio.
 * @param base URL base del servicio (por defecto: http://127.0.0.1:3900)
 * @param params Parámetros de transcripción (audio y idioma)
 * @param fetchImpl Implementación de fetch a utilizar (para testing)
 * @returns Promesa que resuelve con el texto transcrito.
 * @throws Error si la petición falla o la respuesta no es válida.
 */
export async function transcribir(
  base: string = "http://127.0.0.1:3900",
  params: TranscribirParams,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const url = `${base.replace(/\/+$/, "")}/v1/audio/transcriptions`;
  try {
    const formData = new FormData();
    // Convert Blob or ArrayBuffer to a File-like object for FormData
    const fileName = "audio.wav"; // We don't have the original filename, so we use a placeholder
    const blob = params.audio instanceof Blob ? params.audio : new Blob([params.audio]);
    formData.append("file", blob, fileName);
    formData.append("language", params.idioma);
    // Optional: model, but we omit it to use the default
    const response = await fetchImpl(url, {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }
    const data = (await response.json()) as { text: string };
    return data.text;
  } catch (err: any) {
    if (err.name === "TypeError" && err.message === "Failed to fetch") {
      throw new Error("Error de red: no se pudo conectar al servicio");
    }
    throw err;
  }
}