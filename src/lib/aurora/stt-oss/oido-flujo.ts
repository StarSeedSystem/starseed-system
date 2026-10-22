"use client";

/**
 * Oído en flujo para Phonon-2 · cliente del WebSocket `/v1/audio/stream` (contrato
 * `architecture/voz-fusionada-astraura.md` §1 y §4). Entran tramas binarias PCM16 de
 * 16 kHz mono y salen JSON `partial`, `final` y `done`. UN flujo a la vez por servidor:
 * si la conexión se cierra, lo decimos por `alCerrar` y NUNCA reconectamos — el elector
 * de motores cae a tramos (`/v1/audio/transcriptions`). Siguiendo `aurora-voz-motores.md`,
 * nada de esta capa lanza: toda incidencia avisa y queda contenida.
 */

const READYSTATE_ABIERTO = 1; // readyState OPEN de un WebSocket

export interface OidoFlujoConfig {
  url: string;
  WebSocketImpl: typeof WebSocket;
  alParcial: (texto: string) => void;
  alFinal: (texto: string) => void;
  alCerrar: () => void;
}

/** Cliente de un flujo de oído con Phonon-2: enviar audio y terminar/cancelar. */
export interface OidoFlujo {
  enviar: (pcm: Int16Array) => void;
  terminar: () => void;
  cancelar: () => void;
}

/** Mensaje tolerante: el servidor puede enviar `type`+`text` o campos sueltos. */
export interface MensajeOidoFlujo {
  type?: string;
  text?: string;
  partial?: string;
  final?: string;
  transcript?: string;
  done?: boolean;
}

export type LecturaMensaje =
  | { tipo: "parcial"; texto: string }
  | { tipo: "final"; texto: string }
  | { tipo: "done" }
  | { tipo: "otro"; texto: string };

/** Interpretación tolerante de un mensaje del servidor (campos `type`/`text` o sueltos). */
export function interpretarMensaje(m: MensajeOidoFlujo): LecturaMensaje {
  if (m.done === true || m.type === "done") return { tipo: "done" };
  const texto = m.text ?? m.partial ?? m.final ?? m.transcript ?? "";
  const tipo: string = typeof m.type === "string" ? m.type : m.partial !== undefined ? "partial" : m.final !== undefined ? "final" : "";
  return tipo === "partial" ? { tipo: "parcial", texto } : tipo === "final" ? { tipo: "final", texto } : { tipo: "otro", texto };
}

/**
 * Convierte Float32 mono a PCM16 (con recorte a ±1) y remuestrea a 16 kHz por
 * decimación del vecino más próximo (remuestreo simple).
 */
export function prepararAudio(float32: Float32Array, sampleRate: number): Int16Array {
  const ratio = sampleRate / 16000;
  const nuevoLargo = Math.max(0, Math.floor(float32.length / ratio));
  const pcm = new Int16Array(nuevoLargo);
  for (let i = 0; i < nuevoLargo; i++) {
    const pos = Math.min(float32.length - 1, Math.floor(i * ratio));
    let muestra = float32[pos] || 0;
    if (muestra > 1) muestra = 1;
    else if (muestra < -1) muestra = -1;
    pcm[i] = muestra < 0 ? muestra * 0x8000 : muestra * 0x7fff;
  }
  return pcm;
}

export function abrirFlujoOido(config: OidoFlujoConfig): OidoFlujo {
  let ws: WebSocket | null = null;
  let cerrado = false;
  /** «El flujo se cerró»: avisamos UNA vez, sin reconexión automática. */
  const avisarCierre = () => {
    if (cerrado) return;
    cerrado = true;
    config.alCerrar();
  };
  /** Cierre deliberado (terminar/cancelar): no avisa, porque la decisión fue del llamante. */
  const cerrarDeliberado = () => {
    cerrado = true;
    try { ws?.close(); } catch { /* el socket ya no existía */ }
  };
  try {
    ws = new config.WebSocketImpl(config.url);
    ws.onmessage = (event) => {
      if (cerrado || typeof event.data !== "string") return;
      try {
        const lectura = interpretarMensaje(JSON.parse(event.data) as MensajeOidoFlujo);
        if (lectura.tipo === "parcial") config.alParcial(lectura.texto);
        else if (lectura.tipo === "final") config.alFinal(lectura.texto);
        else if (lectura.tipo === "done") {
          // El servidor dio por terminado el flujo: avisamos y cerramos, sin reconectar.
          avisarCierre();
          try { ws?.close(); } catch { /* ya cerrado */ }
        }
      } catch {
        // Un mensaje que no sea JSON no tumba el flujo (tolerancia).
      }
    };
    ws.onclose = () => avisarCierre();
    ws.onerror = () => avisarCierre();
  } catch {
    avisarCierre();
  }
  return {
    enviar: (pcm: Int16Array) => {
      if (cerrado || !ws || ws.readyState !== READYSTATE_ABIERTO) return;
      try {
        // Copiamos a un buffer propio: si `pcm` era una vista (subarray), manda solo sus muestras.
        ws.send(new Int16Array(pcm).buffer);
      } catch {
        // Una trama que no entre no tumba el flujo: la siguiente lo intenta.
      }
    },
    terminar: cerrarDeliberado,
    cancelar: cerrarDeliberado,
  };
}
