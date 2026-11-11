/**
 * voz-datos/decision — qué medio lleva la voz y cuándo se da la llamada por perdida (LLA1108E).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Puro. La voz normal va por WebRTC, que necesita una ruta IP (ICE). Un enlace Bluetooth directo lleva
 * datos pero no IP, y ICE no puede conectar nunca. Reglas:
 *  1. Sin ruta IP hacia ese par (solo BLE u otro enlace sin IP) → «enlace de datos» desde el primer momento.
 *  2. Con ruta IP, si ICE no conecta en ESPERA_ICE_MS (6 s) y hay enlace de datos → se pasa a él, sin colgar.
 *  3. (LLA1110D) Si luego WebRTC conecta, la voz que ya funciona por datos SE QUEDA (WebRTC lleva el vídeo); solo vuelve
 *     a WebRTC si la voz por datos se degrada de forma sostenida (`carriles.ts`).
 *  4. Si a los LIMITE_CONECTANDO_MS (15 s) ni WebRTC ni datos suenan → la llamada acaba con motivo claro.
 * Nunca «conectando» para siempre.
 */

export const ESPERA_ICE_MS = 6_000;
export const LIMITE_CONECTANDO_MS = 15_000;

export type EstadoWebrtcPar = "conectando" | "conectado" | "reconectando" | "fallida";
/** «sin-enlace»: no hay enlace de datos con ese par · «disponible»: lo hay, aún sin voz · «activo»: ya va la voz. */
export type EstadoDatosPar = "sin-enlace" | "disponible" | "activo";

export interface EntradaDecision {
  /** ms desde que el par está en la llamada (o desde que se contestó). */
  transcurridoMs: number;
  webrtc: EstadoWebrtcPar;
  datos: EstadoDatosPar;
  /** ¿Hay alguna ruta IP hacia ese par? true/false; null si no se sabe (se espera a ICE). */
  hayRutaIp: boolean | null;
  /**
   * (LLA1110D) ¿La voz por el enlace de datos va bien? Solo `false` (degradada de forma sostenida, lo mide el selector de
   * carriles) la devuelve a WebRTC. Antes bastaba con que WebRTC conectara: la voz que funcionaba se cortaba y el
   * otro extremo la rearrancaba (el salto de dos veces por segundo de la prueba 33).
   */
  datosSana?: boolean;
}

export type AccionMedio = "esperar" | "usar-datos" | "volver-webrtc" | "mantener" | "fallar";

export function decidirAccionMedio(e: EntradaDecision): AccionMedio {
  if (e.webrtc === "conectado") return e.datos === "activo" && e.datosSana === false ? "volver-webrtc" : "mantener";
  if (e.datos === "activo") return "mantener";
  if (e.datos === "disponible") {
    if (e.hayRutaIp === false) return "usar-datos";
    if (e.webrtc === "fallida") return "usar-datos";
    if (e.transcurridoMs >= ESPERA_ICE_MS) return "usar-datos";
  }
  if (e.transcurridoMs >= LIMITE_CONECTANDO_MS) return "fallar";
  if (e.webrtc === "fallida" && e.datos === "sin-enlace") return "fallar";
  return "esperar";
}

/** Tipos de enlace de la malla y si llevan IP (WebRTC puede usarlos). */
export function enlaceTieneIp(tipo: string): boolean {
  return tipo === "local" || tipo === "nativo" || tipo === "wifi-directo" || tipo === "cuenta";
}

export function etiquetaMedioDatos(tipo: string): string {
  switch (tipo) {
    case "ble":
      return "Bluetooth directo";
    case "nativo":
      return "red local";
    case "wifi-directo":
      return "Wi-Fi directo";
    case "local":
      return "enlace directo";
    default:
      return "enlace de datos";
  }
}

export const MOTIVO_SIN_AUDIO =
  "No se pudo establecer el audio: ni WebRTC ni la voz por el enlace de datos conectaron en 15 s. Comprueba que el otro aparato está cerca y vuelve a intentarlo.";

export const TEXTO_CONTESTADA_CONECTANDO = "Contestada · conectando audio…";

export const TEXTO_VIDEO_BLE = "El vídeo no cabe por Bluetooth directo. Sigues con la voz; con Wi-Fi directo o la misma red local, el vídeo funciona.";

export interface CalidadVoz {
  rttMs: number | null;
  perdidaPct: number;
  codec: string;
  jitterMs: number;
  /** (VOZ1111J) kb/s del escalón de Opus en uso (se enseña junto al códec). */
  kbps?: number;
  /** (VOZ1111J) Bajo el suelo: la verdad en palabras («La señal no alcanza para la voz…»). */
  aviso?: string | null;
}

export type NivelCalidadVoz = "buena" | "regular" | "mala";

export function nivelCalidadVoz(c: CalidadVoz): NivelCalidadVoz {
  if (c.aviso) return "mala"; // VOZ1111J
  if (c.perdidaPct >= 15 || (c.rttMs ?? 0) >= 1200) return "mala";
  if (c.perdidaPct >= 5 || (c.rttMs ?? 0) >= 500) return "regular";
  return "buena";
}

/** «Voz por Bluetooth directo · cifrada». */
export function textoMedioVoz(medio: { tipo: string; cifrada: boolean }): string {
  return `Voz por ${etiquetaMedioDatos(medio.tipo)} · ${medio.cifrada ? "cifrada" : "sin cifrar"}`;
}

/** «Latencia 180 ms · pérdida 2 % · ADPCM». */
export function textoCalidadVoz(c: CalidadVoz): string {
  const lat = c.rttMs === null ? "latencia sin medir" : `latencia ${Math.round(c.rttMs / 2)} ms`;
  const cod = c.codec === "adpcm" ? "ADPCM" : c.codec === "mulaw" ? "μ-law" : typeof c.kbps === "number" ? `Opus ${c.kbps} kb/s` : "Opus";
  const base = `${lat} · pérdida ${Math.round(c.perdidaPct)} % · ${cod}`;
  // VOZ1111J: bajo el suelo, la verdad primero (la ventana de la llamada ya pinta esta línea de estado).
  return c.aviso ? `${c.aviso} · ${base}` : base;
}
