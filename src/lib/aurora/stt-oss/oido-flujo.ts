"use client";

/**
 * StarSeed OS — Oído en flujo para Phonon-2 (WebSocket de /v1/audio/stream).
 * ============================================================================
 * Cliente WebSocket para transcripción en tiempo real con Phonon-2.
 */

export interface OidoFlujoConfig {
  url: string;
  WebSocketImpl: typeof WebSocket;
  alParcial: (texto: string) => void;
  alFinal: (texto: string) => void;
  alCerrar: () => void;
}

export interface OidoFlujo {
  /** Envía audio PCM16 al flujo */
  enviar: (pcm: Int16Array) => void;
  /** Cierra la conexión */
  terminar: () => void;
  /** Cancela el flujo */
  cancelar: () => void;
}

/**
 * Convierte audio Float32 a PCM16 y remuestrea a 16kHz de forma simple.
 */
export function prepararAudio(float32: Float32Array, sampleRate: number): Int16Array {
  const ratio = sampleRate / 16000;
  const nuevoLargo = Math.floor(float32.length / ratio);
  const pcm16 = new Int16Array(nuevoLargo);
  
  for (let i = 0; i < nuevoLargo; i++) {
    const pos = Math.floor(i * ratio);
    let muestra = float32[pos];
    // Clipping
    muestra = Math.max(-1, Math.min(1, muestra));
    // Conversión a Int16
    pcm16[i] = muestra < 0 ? muestra * 0x8000 : muestra * 0x7FFF;
  }
  
  return pcm16;
}

export function abrirFlujoOido(config: OidoFlujoConfig): OidoFlujo {
  let ws: WebSocket | null = null;
  let cerrado = false;

  try {
    ws = new config.WebSocketImpl(config.url);
    ws.onmessage = (event) => {
      if (cerrado) return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : {};
        const texto = data.text || data.partial || data.final || data.transcript || "";
        const tipo = data.type || (data.partial !== undefined ? "partial" : data.final !== undefined ? "final" : "");

        if (tipo === "partial" && config.alParcial) {
          config.alParcial(texto);
        } else if (tipo === "final" && config.alFinal) {
          config.alFinal(texto);
        } else if (tipo === "done" || data.done) {
          cerrado = true;
          config.alCerrar();
          ws?.close();
        }
      } catch {
        // Ignorar errores de parseo por tolerancia
      }
    };

    ws.onclose = () => {
      if (!cerrado) {
        cerrado = true;
        config.alCerrar();
      }
    };

    ws.onerror = () => {
      if (!cerrado) {
        cerrado = true;
        config.alCerrar();
      }
    };
  } catch {
    cerrado = true;
    config.alCerrar();
  }

  return {
    enviar: (pcm: Int16Array) => {
      if (cerrado || !ws || ws.readyState !== WebSocket.OPEN) return;
      try {
        ws.send(pcm.buffer);
      } catch {
        // Error de envío
      }
    },
    terminar: () => {
      if (!cerrado) {
        cerrado = true;
        ws?.close();
        config.alCerrar();
      }
    },
    cancelar: () => {
      if (!cerrado) {
        cerrado = true;
        ws?.close();
        config.alCerrar();
      }
    },
  };
}
