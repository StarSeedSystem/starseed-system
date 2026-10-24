"use client";

/**
 * voz-por-malla — oído y voz de Astraura a otra neurona (Ola 1015V · R).
 * Protocolo `oido.*` y `voz.*` sobre el canal P2P de la malla. Toma el modelo
 * de `ia-por-malla.ts` (id, cancelar, error, una petición por par) y de
 * `archivos-malla.ts` (trozos de 16 KB con sha256). El audio SOLO va a tus
 * neuronas o al servidor de la sesión de tu grupo; al resto de la red viaja
 * texto (§3 del contrato). Ninguna función de esta capa lanza.
 */

export const VOZ_MALLA_MAX_BYTES = 24 * 1024;
export const TROZO_AUDIO_BYTES = 16 * 1024;

/** De dónde es el destino del audio: propia, de la sesión de grupo, o ajena. */
export type ConfianzaVoz = "propia" | "grupo" | "ajena";

/** Destino del audio; `enSesion` = pertenece al grupo o llamada en curso. */
export interface DestinoVoz { dispositivo: string; confianza: ConfianzaVoz; enSesion?: boolean }

/** Un trozo de audio en base64, con su orden y su sha256. */
export interface TrozoAudio { i: number; total: number; datosB64: string; sha256: string }

export interface MsgOidoPedir {
  t: "oido.pedir"; id: string; idioma?: string; hotwords?: string[]; audio: TrozoAudio;
}
export interface MsgOidoTexto {
  t: "oido.texto"; id: string; texto: string; tipo: "parcial" | "final"; motor?: string;
}
export interface MsgVozPedir {
  t: "voz.pedir"; id: string; texto: string; idioma?: string;
  timbre: { id: string; nombre?: string; genero?: string };
}
export interface MsgVozTrozo { t: "voz.trozo"; id: string; audio: TrozoAudio }
export interface MsgVozCancelar { t: "oido.cancelar" | "voz.cancelar"; id: string }
export interface MsgVozError { t: "oido.error" | "voz.error"; id: string; estado: number; mensaje: string }

export type VozMallaMsg =
  | MsgOidoPedir | MsgOidoTexto | MsgVozPedir | MsgVozTrozo | MsgVozCancelar | MsgVozError;

export interface TransporteVozMalla { enviar(peerId: string, json: string): boolean }
/** Deps del despachador: transporte inyectado, privacidad y peticiones por par. */
export interface DepsDespachadorVoz {
  transporte: TransporteVozMalla;
  autorizar?: (destino: DestinoVoz) => boolean;
  enVuelo?: Map<string, string>;
}
function esObjeto(x: unknown): x is Record<string, unknown> { return !!x && typeof x === "object"; }
function esTrozo(x: unknown): x is TrozoAudio {
  return esObjeto(x) && Number.isInteger(x.i) && Number.isInteger(x.total) && typeof x.datosB64 === "string" && typeof x.sha256 === "string";
}
export function esMensajeVozMalla(x: unknown): x is VozMallaMsg {
  if (!esObjeto(x) || typeof x.id !== "string" || !x.id || typeof x.t !== "string") return false;
  switch (x.t) {
    case "oido.pedir": return esTrozo(x.audio) && (x.idioma === undefined || typeof x.idioma === "string") && (x.hotwords === undefined || (Array.isArray(x.hotwords) && x.hotwords.every((h) => typeof h === "string")));
    case "oido.texto": return typeof x.texto === "string" && (x.tipo === "parcial" || x.tipo === "final");
    case "voz.pedir": return typeof x.texto === "string" && esObjeto(x.timbre) && typeof x.timbre.id === "string";
    case "voz.trozo": return esTrozo(x.audio);
    case "oido.cancelar": case "voz.cancelar": return true;
    case "oido.error": case "voz.error": return typeof x.estado === "number" && typeof x.mensaje === "string";
    default: return false;
  }
}
export function bytesAB64(d: Uint8Array): string {
  let s = ""; for (const b of d) s += String.fromCharCode(b);
  try { return btoa(s); } catch { return ""; }
}
export function b64ABytes(b: string): Uint8Array {
  try { return Uint8Array.from(atob(b), (c) => c.charCodeAt(0)); } catch { return new Uint8Array(0); }
}
export async function sha256Hex(d: Uint8Array): Promise<string> {
  try {
    const h = await globalThis.crypto.subtle.digest("SHA-256", d.slice().buffer as ArrayBuffer);
    return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch { return ""; }
}
/** Trocea audio crudo en partes de 16 KB, cada una con su sha256. Nunca lanza. */
export async function trocearAudio(datos: Uint8Array): Promise<TrozoAudio[]> {
  const total = Math.max(1, Math.ceil(datos.length / TROZO_AUDIO_BYTES)), lista: TrozoAudio[] = [];
  for (let i = 0; i < total; i++) {
    const parte = datos.subarray(i * TROZO_AUDIO_BYTES, (i + 1) * TROZO_AUDIO_BYTES);
    lista.push({ i, total, datosB64: bytesAB64(parte), sha256: await sha256Hex(parte) });
  }
  return lista;
}
/** Rearma y valida ORDEN (i consecutivo, mismo total). `null` si no cuadra. Pura. */
export function rearmarAudio(trozos: TrozoAudio[]): Uint8Array | null {
  if (!trozos.length) return null;
  const total = trozos[0].total;
  if (total !== trozos.length || trozos.some((t, i) => !t || t.i !== i || t.total !== total)) return null;
  const partes = trozos.map((t) => b64ABytes(t.datosB64));
  const out = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of partes) { out.set(p, o); o += p.length; }
  return out;
}
/** Valida sha256 de cada trozo además del orden. `false` si algo no cuadra. */
export async function validarTrozos(trozos: TrozoAudio[]): Promise<boolean> {
  if (!rearmarAudio(trozos)) return false;
  for (const t of trozos) if ((await sha256Hex(b64ABytes(t.datosB64))) !== t.sha256) return false;
  return true;
}
/** §3: el audio solo va a tus neuronas (propia) o al servidor de tu sesión de grupo. */
export function puedeEnviarAudio(d: DestinoVoz): boolean {
  return d.confianza === "propia" || (d.confianza === "grupo" && d.enSesion === true);
}
const enVueloProduccion = new Map<string, string>();
/** Despacha un mensaje por el transporte inyectado. Valida privacidad, tamaño y 1 por par. */
export function despacharVozMalla(msg: VozMallaMsg, destino: DestinoVoz, deps: DepsDespachadorVoz): boolean {
  try {
    if (!esMensajeVozMalla(msg)) return false;
    if ((msg.t === "oido.pedir" || msg.t === "voz.trozo") && !(deps.autorizar ?? puedeEnviarAudio)(destino)) return false;
    const pide = msg.t === "oido.pedir" || msg.t === "voz.pedir";
    const enVuelo = deps.enVuelo ?? enVueloProduccion;
    if (pide && enVuelo.has(destino.dispositivo) && enVuelo.get(destino.dispositivo) !== msg.id) return false;
    if (pide) enVuelo.set(destino.dispositivo, msg.id); else enVuelo.delete(destino.dispositivo);
    const json = JSON.stringify(msg);
    return new TextEncoder().encode(json).length <= VOZ_MALLA_MAX_BYTES && deps.transporte.enviar(destino.dispositivo, json);
  } catch { return false; }
}
