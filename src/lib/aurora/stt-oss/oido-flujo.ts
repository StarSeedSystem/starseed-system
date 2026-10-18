"use client";

/**
 * StarSeed OS — Oído en flujo para Phonon-2 (WebSocket).
 * -----------------------------------------------------------------------------
 * Crea un cliente WebSocket para el endpoint `/v1/audio/stream` de Phonon-2.
 * Recibe audio en formato Float32 (mono) a 48 kHz (asumido), lo convierte a
 * PCM16 y lo remuestrea a 16 kHz mono antes de enviarlo por el WebSocket.
 * El servidor responde con JSON que contiene `partial`, `final` y `done`.
 */

/**
 * Convierte un buffer de Float32 (rango [-1, 1]) a PCM16 (rango [-32768, 32767]).
 * @param input Buffer de muestras en punto flotante.
 * @returns Buffer de enteros de 16 bits con signo.
 */
function float32ToPCM16(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    // Clamp to [-1, 1] and scale to 16-bit range.
    let s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return output;
}

/**
 * Remuestreo lineal simple de Float32 mono de `fromRate` a `toRate`.
 * Copiado de oss-stt.ts para evitar dependencias.
 */
function resampleLinear(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || input.length === 0) return input;
  const ratio = fromRate / toRate;
  const outLength = Math.max(1, Math.floor(input.length / ratio));
  const output = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = pos - i0;
    output[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return output;
}

/**
 * Parámetros para crear el flujo de oído.
 */
export interface OpcionesFlujoOido {
  /** URL del WebSocket de Phonon-2 (ej: wss://example.com/v1/audio/stream). */
  url: string;
  /** Implementación de WebSocket a usar (para inyección en tests). */
  WebSocketImpl: typeof WebSocket;
  /** Callback para recibir transcripciones parciales. */
  alParcial: (texto: string) => void;
  /** Callback para recibir transcripciones finales. */
  alFinal: (texto: string) => void;
  /** Callback para cuando se cierra la conexión. */
  alCerrar: () => void;
}

/**
 * Resultado de crear el flujo de oído.
 */
export interface FlujoOido {
  /** Envía una trama de audio PCM16 (Int16Array) al WebSocket. */
  enviar: (pcm: Int16Array) => void;
  /** Cierra el WebSocket de forma graceful. */
  terminar: () => void;
  /** Cancela la conexión inmediatamente. */
  cancelar: () => void;
}

/**
 * Crea un flujo de oído hacia el servidor de Phonon-2.
 * Asume que el audio de entrada es Float32 a 48 kHz (tasa común en WebRTC).
 * Convierte a PCM16 y remuestrea a 16 kHz antes de enviar.
 */
export function abrirFlujoOido({
  url,
  WebSocketImpl,
  alParcial,
  alFinal,
  alCerrar,
}: OpcionesFlujoOido): FlujoOido {
  let ws: WebSocket | null = null;
  let encerrado = false;

  // Función interna para cerrar el WebSocket y limpiar.
  const cerrar = () => {
    if (ws) {
      ws.close();
      ws = null;
    }
    encerrado = true;
    alCerrar();
  };

  // Crear la conexión WebSocket.
  ws = new WebSocketImpl(url);

  ws.binaryType = "arraybuffer";
  ws.onopen = () => {
    // Conexión establecida.
  };

  ws.onmessage = (event) => {
    if (encerrado) return;
    try {
      const data = event.data;
      if (typeof data === "string") {
        const mensaje = JSON.parse(data);
        if (mensaje.partial) {
          alParcial(mensaje.partial);
        }
        if (mensaje.final) {
          alFinal(mensaje.final);
        }
        if (mensaje.done) {
          // El servidor indica que ha terminado.
          cerrar();
        }
      }
    } catch (e) {
      // Ignorar mensajes malformados.
      console.error("Error al parsear mensaje de Phonon-2:", e);
    }
  };

  ws.onerror = (error) => {
    console.error("Error en WebSocket de Phonon-2:", error);
    cerrar();
  };

  ws.onclose = (event) => {
    if (!encerrado) {
      console.info(`WebSocket de Phonon-2 cerrado (code=${event.code}, reason=${event.reason})`);
      cerrar();
    }
  };

  return {
    /**
     * Envía una trama de audio PCM16 (Int16Array) al WebSocket.
     * Asume que el audio está en formato PCM16 mono a 16 kHz.
     * Si se recibe audio en otro formato, debe ser convertido previamente.
     */
    enviar: (pcm: Int16Array) => {
      if (encerrado || !ws || ws.readyState !== WebSocket.OPEN) {
        // No enviar si no estamos conectados.
        return;
      }
      ws.send(pcm.buffer);
    },
    /**
     * Cierra el WebSocket de forma graceful.
     */
    terminar: () => {
      cerrar();
    },
    /**
     * Cancela la conexión inmediatamente.
     */
    cancelar: () => {
      if (ws) {
        ws.close(1000, "Cancelado por el usuario");
      }
      cerrar();
    },
  };
}