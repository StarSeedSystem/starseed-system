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
  // Esqueleto inicial - se completará en ediciones sucesivas
  return {
    enviar: () => {},
    terminar: () => {},
    cancelar: () => {},
  };
}