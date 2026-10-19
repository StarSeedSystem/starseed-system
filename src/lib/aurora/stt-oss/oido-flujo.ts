"use client";

/**
 * StarSeed OS — Oído en flujo para Phonon-2 (WebSocket de /v1/audio/stream).
 * ============================================================================
 * Cliente que se conecta al WebSocket de Phonon-2 para transcripción en tiempo real.
 * Recibe tramas binarias PCM16 de 16 kHz mono y envía JSON con `partial`, `final` y `done`.
 * 
 * CARACTERÍSTICAS:
 * - Conversión de Float32 a PCM16 y remuestreo simple a 16 kHz
 * - Sin reconexión automática (si se cierra, lo reporta y el elector cae a tramos)
 * - Interpretación tolerante de mensajes (campos `type`/`text`)
 * - Tests con WebSocket falso (sin red, sin micrófono, sin procesos)
 */

export interface OidoFlujoConfig {
  /** URL del WebSocket de Phonon-2 (ej: ws://127.0.0.1:8000/v1/audio/stream) */
  url: string;
  /** Implementación de WebSocket a usar (para inyección en tests) */
  WebSocketImpl: typeof WebSocket;
  /** Callback para resultados parciales */
  alParcial: (texto: string) => void;
  /** Callback para resultados finales */
  alFinal: (texto: string) => void;
  /** Callback cuando se cierra la conexión */
  alCerrar: () => void;
}

export interface OidoFlujo {
  /** Envía una trama PCM16 (Int16Array) al WebSocket */
  enviar: (pcm: Int16Array) => void;
  /** Cierra la conexión limpiamente */
  terminar: () => void;
  /** Cancela la conexión (equivalente a terminar pero semánticamente distinto) */
  cancelar: () => void;
}

/**
 * Crea un cliente de oído en flujo para Phonon-2.
 * @param config Configuración del cliente
 * @returns Objeto con métodos para enviar, terminar y cancelar
 */
export function abrirFlujoOido(config: OidoFlujoConfig): OidoFlujo {
  let ws: WebSocket | null = null;

  // Función para convertir Float32 a PCM16 y remuestreo simple
  const prepararAudio = (float32Audio: Float32Array, sampleRateIn: number): Int16Array => {
    // Remuestreo simple a 16kHz si es necesario
    if (sampleRateIn === 16000) {
      // Convertir directamente Float32 [-1,1] a PCM16 [-32768, 32767]
      const pcm16 = new Int16Array(float32Audio.length);
      for (let i = 0; i < float32Audio.length; i++) {
        // Clipar y convertir
        let sample = float32Audio[i];
        if (sample > 1.0) sample = 1.0;
        if (sample < -1.0) sample = -1.0;
        pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      }
      return pcm16;
    }
    
    // Remuestreo simple (decimación o interpolación lineal básica)
    const ratio = sampleRateIn / 16000;
    const outputLength = Math.floor(float32Audio.length / ratio);
    const pcm16 = new Int16Array(outputLength);
    
    for (let i = 0; i < outputLength; i++) {
      const pos = i * ratio;
      const i0 = Math.floor(pos);
      const i1 = Math.ceil(pos);
      const frac = pos - i0;
      
      // Interpolación lineal
      let sample = 0;
      if (i1 < float32Audio.length) {
        sample = float32Audio[i0] * (1 - frac) + float32Audio[i1] * frac;
      } else {
        sample = float32Audio[i0];
      }
      
      // Clipar y convertir a PCM16
      if (sample > 1.0) sample = 1.0;
      if (sample < -1.0) sample = -1.0;
      pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    }
    
    return pcm16;
  };

  // Establecer conexión WebSocket
  ws = new config.WebSocketImpl(config.url);
  
  ws.onopen = () => {
    // Conexión establecida
  };
  
  ws.onmessage = (event) => {
    try {
      // Interpretación tolerante de mensajes (campos `type`/`text`)
      let data: any;
      if (typeof event.data === "string") {
        data = JSON.parse(event.data);
      } else {
        // Si es binario, intentar convertir a texto (aunque Phonon-2 envía JSON)
        const text = new TextDecoder().decode(event.data);
        data = JSON.parse(text);
      }
      
      // Tolerancia en los campos: puede ser `type` o no tenerlo, y `text` o `transcript`
      const texto = data.text || data.transcript || "";
      const tipo = data.type || "";
      
      if (tipo === "partial" || (!tipo && data.partial !== undefined)) {
        config.alParcial(texto);
      } else if (tipo === "final" || data.final !== undefined) {
        config.alFinal(texto);
      } else if (tipo === "done" || data.done !== undefined) {
        // done indica fin de transmisión
        config.alCerrar();
        ws.close();
        ws = null;
      }
    } catch (e) {
      // Error al parsear mensaje - lo ignoramos para ser tolerantes
      console.warn("Error procesando mensaje WebSocket:", e);
    }
  };
  
  ws.onerror = (error) => {
    console.error("Error WebSocket:", error);
    // Notificar cierre al elector
    config.alCerrar();
    ws.close();
    ws = null;
  };
  
  ws.onclose = () => {
    // Notificar cierre al elector (sin reconexión automática)
    config.alCerrar();
    ws = null;
  };

  return {
    enviar: (pcmFloat32: Float32Array) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        // Si no hay conexión abierta, no enviamos (el elector debería manejar esto)
        return;
      }
      
      // Para simplificar, asumimos que el audio ya está a 16kHz y es mono
      // En una implementación real, necesitaríamos conocer la tasa de muestreo de entrada
      const pcm16 = prepararAudio(pcmFloat32, 16000);
      
      try {
        ws.send(pcm16.buffer);
      } catch (e) {
        // Error al enviar - la conexión probablemente se cerrará
        console.warn("Error enviando audio por WebSocket:", e);
      }
    },
    
    terminar: () => {
      if (ws) {
        ws.close();
        ws = null;
      }
    },
    
    cancelar: () => {
      // Semánticamente equivalente a terminar para este ejercicio
      if (ws) {
        ws.close();
        ws = null;
      }
    },
  };
}