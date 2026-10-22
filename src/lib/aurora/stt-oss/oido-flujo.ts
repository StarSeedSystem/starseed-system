"use client";

/*
 * Oído en flujo · cliente del WebSocket de Phonon-2 (`GET /v1/audio/stream`).
 * Contrato: architecture/voz-fusionada-astraura.md §1 y §4. Entran tramas PCM16
 * de 16 kHz mono y salen JSON `partial`/`final`/`done`: un flujo a la vez y
 * reconexión NUNCA automática (al cerrarse, `alCerrar` lo dice). Nada lanza.
 */

/** OPEN = 1 según el protocolo; evita depender del global `WebSocket`. */
const ABIERTO = 1;

/** Tipos mínimos para inyectar un WebSocket real o falso sin `any`. */
export interface WebSocketOido {
  readyState: number;
  send: (datos: ArrayBuffer | ArrayBufferView) => void;
  close: (codigo?: number, motivo?: string) => void;
  onmessage: ((evento: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
}
export type FabricaWebSocket = new (url: string) => WebSocketOido;
export interface OidoFlujoConfig {
  url: string;
  WebSocketImpl: FabricaWebSocket;
  alParcial: (texto: string) => void;
  alFinal: (texto: string) => void;
  alCerrar: () => void;
}

/** El flujo vivo: `enviar` manda tramas PCM16 ya a 16 kHz; `terminar` cierra
 * por bien y `cancelar` suelta el socket al instante; ambos avisan una vez. */
export interface OidoFlujo {
  enviar: (pcm: Int16Array) => void;
  terminar: () => void;
  cancelar: () => void;
}
export type TextoEscuchado = { tipo: "parcial" | "final" | "fin"; texto: string };
const comoTexto = (valor: unknown): string => (typeof valor === "string" ? valor : "");

/** Interpreta mensajes con tolerancia: gana `type` (`partial`/`final`/`done`);
 * si falta lo deduce del campo y un `text` pelado cuenta como parcial. No lanza. */
export function interpretarMensajeOido(bruto: string): TextoEscuchado | null {
  if (!bruto) return null;
  let datos: Record<string, unknown>;
  try {
    const parseado: unknown = JSON.parse(bruto);
    if (parseado === null || typeof parseado !== "object") return null;
    datos = parseado as Record<string, unknown>;
  } catch { return null; }
  if (datos.done === true || datos.type === "done") return { tipo: "fin", texto: "" };
  const tipo = comoTexto(datos.type);
  let resuelto: "parcial" | "final" | null = null;
  if (tipo === "partial" || tipo === "parcial") resuelto = "parcial";
  else if (tipo === "final") resuelto = "final";
  else if (typeof datos.partial === "string") resuelto = "parcial";
  else if (typeof datos.final === "string") resuelto = "final";
  else if (typeof datos.text === "string") resuelto = "parcial";
  else if (typeof datos.transcript === "string") resuelto = "parcial";
  const texto =
    comoTexto(datos.text) || comoTexto(datos.partial) ||
    comoTexto(datos.final) || comoTexto(datos.transcript);
  return resuelto === null ? null : { tipo: resuelto, texto };
}

/** Float32 [-1, 1] → PCM16 a 16 kHz (remuestreo simple por vecino cercano,
 * recorta picos y las muestras inválidas cuentan como 0). */
export function prepararAudio(float32: Float32Array, sampleRate: number): Int16Array {
  const ratio = sampleRate / 16000;
  if (!Number.isFinite(ratio) || ratio <= 0 || float32.length === 0) return new Int16Array(0);
  const total = Math.floor(float32.length / ratio);
  const pcm16 = new Int16Array(total);
  for (let i = 0; i < total; i++) {
    const posicion = Math.min(float32.length - 1, Math.floor(i * ratio));
    const bruta = float32[posicion];
    if (!Number.isFinite(bruta)) continue;
    const muestra = Math.max(-1, Math.min(1, bruta));
    pcm16[i] = muestra < 0 ? muestra * 0x8000 : muestra * 0x7fff;
  }
  return pcm16;
}

/** Abre el flujo contra Phonon. Si el socket cierra o falla, `alCerrar` avisa
 * UNA vez y no hay reintentos: quien llame decide caer a tramos. Nada lanza. */
export function abrirFlujoOido(config: OidoFlujoConfig): OidoFlujo {
  let cerrado = false;
  let conectado: WebSocketOido | null = null;
  const decirCierre = () => {
    if (!cerrado) { cerrado = true; config.alCerrar(); }
  };
  const cerrarSocket = () => {
    decirCierre();
    try { conectado?.close(); } catch { /* el cierre ya está dicho */ }
  };
  try {
    const socket: WebSocketOido = new config.WebSocketImpl(config.url);
    conectado = socket;
    socket.onmessage = (evento) => {
      if (cerrado || typeof evento.data !== "string") return;
      const mensaje = interpretarMensajeOido(evento.data);
      if (!mensaje) return;
      if (mensaje.tipo === "fin") return cerrarSocket();
      if (mensaje.tipo === "parcial") config.alParcial(mensaje.texto);
      else config.alFinal(mensaje.texto);
    };
    socket.onerror = decirCierre;
    socket.onclose = decirCierre;
  } catch { conectado = null; decirCierre(); }
  return {
    enviar: (pcm: Int16Array) => {
      if (cerrado || !conectado || conectado.readyState !== ABIERTO) return;
      try {
        /* Copia exacta: el buffer de un subarray puede traer basura alrededor. */
        conectado.send(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength));
      } catch { /* una trama perdida no rompe el oído; la siguiente entra sola */ }
    },
    terminar: cerrarSocket,
    cancelar: cerrarSocket,
  };
}
