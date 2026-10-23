"use client";

/** Oído en flujo — cliente del WebSocket de Phonon-2 (`GET /v1/audio/stream`):
 * PCM16 16 kHz entra, JSON con `partial`/`final`/`done` sale. Nada lanza y la
 * reconexión NUNCA es automática: al cierre avisa una vez y el elector cae a tramos. */

const FRECUENCIA_OBJETIVO = 16000;
const ABIERTO = 1;

/** Zócalo mínimo de WebSocket que precisa el oído (el real lo cumple). */
export interface ZocaloFlujoOido {
  readyState: number;
  send: (data: ArrayBuffer) => void;
  close: (code?: number, reason?: string) => void;
  onmessage: ((ev: MessageEvent) => void) | null;
  onclose: ((ev: CloseEvent) => void) | null;
  onerror: ((ev: Event) => void) | null;
}
/** Constructor inyectable (WebSocket falso en pruebas; real en vivo). */
export type ImplWebSocketOido = new (url: string) => ZocaloFlujoOido;

export interface OidoFlujoConfig {
  url: string;
  WebSocketImpl: ImplWebSocketOido;
  alParcial: (texto: string) => void;
  alFinal: (texto: string) => void;
  alCerrar: () => void;
}

export interface OidoFlujo {
  enviar: (pcm: Int16Array) => void;
  terminar: () => void;
  cancelar: () => void;
}

export type TipoMensajeOido = "parcial" | "final" | "fin";
const TIPOS: Record<string, TipoMensajeOido | undefined> = {
  partial: "parcial",
  final: "final",
  done: "fin",
};

/** Interpreta un mensaje con tolerancia (`type`/`text` o sus campos sueltos);
 * devuelve `null` si no dice nada útil. Nunca lanza. */
export function leerMensajeOido(mensaje: string): { tipo: TipoMensajeOido; texto: string } | null {
  try {
    const contenido: unknown = JSON.parse(mensaje);
    if (typeof contenido !== "object" || contenido === null) return null;
    const datos = contenido as Record<string, unknown>;
    let tipo = typeof datos.type === "string" && datos.type ? datos.type.toLowerCase() : "";
    if (!tipo) {
      if (datos.done === true) tipo = "done";
      else if ("partial" in datos || "transcript" in datos) tipo = "partial";
      else if ("final" in datos) tipo = "final";
    }
    const crudo = [datos.text, datos.partial, datos.final, datos.transcript].find(
      (campo) => typeof campo === "string",
    );
    const texto = typeof crudo === "string" ? crudo : "";
    if (!TIPOS[tipo]) return null;
    return { tipo: TIPOS[tipo]!, texto };
  } catch {
    return null;
  }
}

/** Float32 (−1..1) → PCM16, remuestreado a 16 kHz por interpolación lineal
 * (simple y suficiente para voz); entrada rara → arreglo vacío, sin lanzar. */
export function prepararAudio(entrada: Float32Array, frecuencia: number): Int16Array {
  if (!Number.isFinite(frecuencia) || frecuencia <= 0 || entrada.length === 0) return new Int16Array(0);
  const relacion = frecuencia / FRECUENCIA_OBJETIVO;
  const destino = new Int16Array(Math.floor(entrada.length / relacion));
  for (let i = 0; i < destino.length; i++) {
    const pos = i * relacion;
    const a = Math.floor(pos);
    const b = Math.min(a + 1, entrada.length - 1);
    const peso = pos - a;
    let muestra = entrada[a] * (1 - peso) + entrada[b] * peso;
    muestra = Math.max(-1, Math.min(1, muestra));
    destino[i] = Math.round(muestra < 0 ? muestra * 0x8000 : muestra * 0x7fff);
  }
  return destino;
}

/** Abre el flujo. Un cierre del servidor (o un `done`) avisa UNA vez y no
 * hay reconexión; un zócalo que falla al construir no rompe la capa. */
export function abrirFlujoOido(config: OidoFlujoConfig): OidoFlujo {
  let cerrado = false;
  let sock: ZocaloFlujoOido | null = null;

  /** Cierra una sola vez; con `silencioso`, no llama a `alCerrar`. */
  const cerrar = (silencioso: boolean) => {
    if (cerrado) return;
    cerrado = true;
    try {
      sock?.close();
    } catch {
      // El zócalo ya estaba cerrado.
    }
    if (!silencioso) config.alCerrar();
  };

  try {
    sock = new config.WebSocketImpl(config.url);
    sock.onmessage = (ev) => {
      if (cerrado || typeof ev.data !== "string") return;
      const mensaje = leerMensajeOido(ev.data);
      if (!mensaje) return;
      if (mensaje.tipo === "parcial") config.alParcial(mensaje.texto);
      else if (mensaje.tipo === "final") config.alFinal(mensaje.texto);
      else cerrar(false); // `done`: el flujo acabó; el elector cae a tramos.
    };
    sock.onclose = () => cerrar(false);
    sock.onerror = () => cerrar(false);
  } catch {
    cerrar(false);
  }

  return {
    // Manda una copia del rango exacto: `pcm` puede ser vista parcial.
    enviar: (pcm: Int16Array) => {
      if (cerrado || !sock || sock.readyState !== ABIERTO) return;
      try {
        sock.send((pcm.buffer as ArrayBuffer).slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength));
      } catch {
        // Un fallo de envío no mata el flujo; la siguiente trama reintenta.
      }
    },
    terminar: () => cerrar(false),
    cancelar: () => cerrar(true),
  };
}