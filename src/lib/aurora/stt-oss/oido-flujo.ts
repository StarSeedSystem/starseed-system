"use client";

/**
 * StarSeed OS — Cliente WebSocket para el oído en flujo de Phonon-2.
 * Contrato: architecture/voz-fusionada-astraura.md (§1, §3, §4, §6).
 * Módulo PURO (sin DOM, sin fetch, sin procesos lanzados).
 */

interface PhononMessage {
  partial?: string;
  final?: string;
  done?: boolean;
  type?: string;
  text?: string;
}

interface AbrirFlujoOidoOptions {
  url: string;
  WebSocketImpl: { new (url: string): WebSocket };
  alParcial: (texto: string) => void;
  alFinal: (texto: string) => void;
  alCerrar: (event: CloseEvent) => void;
}

interface FlujoOido {
  enviar: (pcm: Int16Array) => void;
  terminar: () => void;
  cancelar: () => void;
}

/**
 * Abre un flujo de oído WebSocket con Phonon-2.
 * @param opts - Configuración de conexión y callbacks.
 * @returns Objeto con métodos para enviar audio y cerrar/cancelar.
 */
export function abrirFlujoOido(opts: AbrirFlujoOidoOptions): FlujoOido {
  const { url, WebSocketImpl, alParcial, alFinal, alCerrar } = opts;
  let ws: WebSocket | null = null;
  let encerrado = false;

  const cerrar = (codigo: number, motivo: string) => {
    if (encerrado) return;
    encerrado = true;
    try { ws?.close(codigo, motivo); } catch {}
    ws = null;
  };

  ws = new WebSocketImpl(url);
  ws.binaryType = "arraybuffer";

  ws.onopen = () => {};

  ws.onmessage = (event) => {
    if (encerrado) return;
    try {
      const data = event.data;
      if (typeof data !== "string") return;
      const mensaje: PhononMessage = JSON.parse(data);
      const texto = mensaje.partial ?? mensaje.final ?? mensaje.text;
      if (mensaje.partial !== undefined) alParcial(mensaje.partial);
      else if (mensaje.final !== undefined) alFinal(mensaje.final);
      else if (texto !== undefined) alFinal(texto);
      if (mensaje.done === true) cerrar(1000, "Servidor indicó fin del flujo");
    } catch (e) {
      console.warn("Mensaje WebSocket no reconocido:", event.data);
    }
  };

  ws.onclose = (event) => {
    if (!encerrado) {
      encerrado = true;
      ws = null;
      alCerrar(event);
    }
  };

  ws.onerror = (error) => {
    console.error("Error WebSocket:", error);
  };

  return {
    enviar: (pcm: Int16Array) => {
      if (encerrado || !ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(pcm.buffer);
    },
    terminar: () => cerrar(1000, "Cierre explícito del cliente"),
    cancelar: () => cerrar(1001, "Cancelación explícita del cliente"),
  };
}

/**
 * Convierte audio Float32 (mono) a PCM16 Int16Array.
 * Asume que las muestras están en el rango [-1, 1].
 * @param float32Array - Audio en formato Float32.
 * @returns Int16Array con muestras PCM16.
 */
export function float32ToPcm16(float32Array: Float32Array): Int16Array {
  const pcm16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    let s = float32Array[i];
    if (s > 1) s = 1;
    if (s < -1) s = -1;
    pcm16[i] = Math.round(s < 0 ? s * 0x8000 : s * 0x7fff);
  }
  return pcm16;
}

/**
 * Remuestreo lineal simple de audio PCM16 de una tasa a otra.
 * @param pcm16 - Audio en formato PCM16 (Int16Array).
 * @param fromRate - Tasa de muestreo original (Hz).
 * @param toRate - Tasa de muestreo objetivo (Hz).
 * @returns Nuevo Int16Array remuestreado.
 */
export function resamplePcm16(pcm16: Int16Array, fromRate: number, toRate: number): Int16Array {
  if (fromRate === toRate || pcm16.length === 0) return pcm16;
  const ratio = fromRate / toRate;
  const outLength = Math.max(1, Math.floor(pcm16.length / ratio));
  const output = new Int16Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, pcm16.length - 1);
    const frac = pos - i0;
    const sample = pcm16[i0] * (1 - frac) + pcm16[i1] * frac;
    output[i] = Math.round(sample);
  }
  return output;
}