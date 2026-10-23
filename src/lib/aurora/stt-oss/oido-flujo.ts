"use client";

/**
 * StarSeed OS — Oído en flujo para Phonon-2 (WebSocket de /v1/audio/stream).
 * Contrato: architecture/voz-fusionada-astraura.md §4 («Flujo de audio»).
 *
 * Entran tramas PCM16 de 16 kHz mono; salen mensajes JSON con `partial`,
 * `final` y `done` (tolerante a los campos `type`/`text`). El servidor
 * atiende UN solo flujo a la vez, así que NUNCA reconecta: si se cierra,
 * lo dice (`alCerrar`, una vez sola) y el elector cae a tramos por POST.
 * El WebSocket es inyectable para probar en seco (sin red, sin disco).
 */

export interface OidoFlujoConfig {
  url: string;
  /** Constructor de WebSocket inyectado: el real, o un falso en pruebas. */
  WebSocketImpl: typeof WebSocket;
  alParcial: (texto: string) => void;
  alFinal: (texto: string) => void;
  alCerrar: () => void;
}

export interface OidoFlujo {
  /** Envía una trama de audio PCM16 al servidor. */
  enviar: (pcm: Int16Array) => void;
  /** Cierra el flujo avisando a quien escucha (alCerrar, una sola vez). */
  terminar: () => void;
  /** Cierra el flujo sin esperar respuesta del servidor. */
  cancelar: () => void;
}

export type TipoMensajeOido = "partial" | "final" | "done" | "otro";

/** Interpreta un mensaje del servidor con tolerancia (type/text/partial/final/done). */
export function interpretarMensaje(data: unknown): { tipo: TipoMensajeOido; texto: string } {
  if (typeof data !== "object" || data === null) return { tipo: "otro", texto: "" };
  const m = data as Record<string, unknown>;
  if (m.type === "partial" || m.type === "final" || m.type === "done") {
    return { tipo: m.type, texto: typeof m.text === "string" ? m.text : "" };
  }
  if (typeof m.partial === "string") return { tipo: "partial", texto: m.partial };
  if (typeof m.final === "string") return { tipo: "final", texto: m.final };
  if (m.done === true) {
    return { tipo: "done", texto: typeof m.text === "string" ? m.text : "" };
  }
  return { tipo: "otro", texto: "" };
}

/**
 * Convierte Float32 (−1…1) a PCM16 con recorte de amplitud, y remuestrea por
 * decimación simple al ritmo pedido → 16 kHz (lo que Phonon-2 espera).
 */
export function prepararAudio(float32: Float32Array, sampleRate: number): Int16Array {
  const ratio = sampleRate / 16000;
  const nuevoLargo = Math.max(0, Math.floor(float32.length / ratio));
  const pcm16 = new Int16Array(nuevoLargo);
  for (let i = 0; i < nuevoLargo; i++) {
    const pos = Math.min(float32.length - 1, Math.floor(i * ratio));
    let muestra = float32[pos];
    if (muestra > 1) muestra = 1;
    if (muestra < -1) muestra = -1;
    pcm16[i] = muestra < 0 ? muestra * 0x8000 : muestra * 0x7fff;
  }
  return pcm16;
}

export function abrirFlujoOido(config: OidoFlujoConfig): OidoFlujo {
  let ws: WebSocket | null = null;
  let cerrado = false;
  const ABIERTO = config.WebSocketImpl.OPEN;

  // El aviso de cierre es ÚNICO: done/close/error, o terminar/cancelar — el
  // primero que ocurra lo dice, y ni el socket ni nadie lo repite después.
  const avisarCierre = () => {
    if (!cerrado) {
      cerrado = true;
      config.alCerrar();
    }
  };

  try {
    ws = new config.WebSocketImpl(config.url);
    ws.onmessage = (event) => {
      if (cerrado || typeof event.data !== "string") return;
      let data: unknown;
      try {
        data = JSON.parse(event.data);
      } catch {
        return; // mensaje que no es JSON: ignóralo sin romper el flujo
      }
      const { tipo, texto } = interpretarMensaje(data);
      if (tipo === "partial") config.alParcial(texto);
      else if (tipo === "final") config.alFinal(texto);
      else if (tipo === "done") {
        cerrado = true;
        config.alCerrar();
        ws?.close();
      }
    };
    ws.onclose = avisarCierre;
    ws.onerror = avisarCierre;
  } catch {
    cerrado = true;
    config.alCerrar();
  }

  return {
    enviar: (pcm: Int16Array) => {
      if (cerrado || !ws || ws.readyState !== ABIERTO || pcm.length === 0) return;
      try {
        ws.send(pcm.buffer);
      } catch {
        // Un envío roto no tumba el flujo: el servidor responderá o cerrará.
      }
    },
    terminar: () => {
      avisarCierre();
      ws?.close();
    },
    cancelar: () => {
      avisarCierre();
      ws?.close();
    },
  };
}
