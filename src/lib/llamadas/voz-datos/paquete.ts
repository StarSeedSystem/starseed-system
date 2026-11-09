/**
 * voz-datos/paquete — el empaquetado de la voz por enlace de datos (LLA1108E).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Puro. Los enlaces de la malla llevan TEXTO (el cifrado de punta a punta de cada enlace, CIF1108A, ya
 * se aplica abajo: aquí no hay segunda capa). Un paquete es un JSON corto con tramas consecutivas:
 *   {"t":"voz.p","s":<llamada>,"q":<seq de la 1.ª trama>,"ts":<ms>,"c":<códec>,"f":<ms/trama>,"d":<base64>}
 * `d` = tramas con prefijo de longitud de 2 bytes. Cada trama lleva su propio número (q, q+1, …).
 * Y un control: {"t":"voz.c","s":<llamada>,"k":"hola"|"fin"|"ping"|"pong",…}.
 * Ambos empiezan por `{"t":"voz.`: así cada enlace los reconoce barato y les da su cola propia.
 */
import { esCodecVoz, type CodecVoz } from "./codec";

export const PREFIJO_VOZ = '{"t":"voz.';
export const MAX_TRAMAS_PAQUETE = 8;
const MAX_BYTES_DATOS = 6000;

export function esTextoVoz(t: unknown): boolean {
  return typeof t === "string" && t.startsWith(PREFIJO_VOZ);
}

export interface PaqueteVoz {
  /** Id de la llamada. */
  s: string;
  /** Número de la primera trama; la i-ésima es q+i. */
  q: number;
  /** Reloj de quien manda (ms) cuando salió la primera trama. */
  ts: number;
  c: CodecVoz;
  /** ms de audio por trama. */
  f: number;
  tramas: Uint8Array[];
}

export type KControl = "hola" | "fin" | "ping" | "pong";

export interface ControlVoz {
  s: string;
  k: KControl;
  /** hola: códecs que entiendo. */
  codecs?: CodecVoz[];
  /** ping/pong: reloj del que pregunta. */
  ts?: number;
  /** fin: motivo. */
  m?: string;
}

/* base64 sin depender del entorno (btoa existe en navegador y Node ≥ 16, pero no en todos los motores de prueba) */
const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function aBase64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s += ABC[(n >> 18) & 63] + ABC[(n >> 12) & 63] + (i + 1 < b.length ? ABC[(n >> 6) & 63] : "=") + (i + 2 < b.length ? ABC[n & 63] : "=");
  }
  return s;
}

const INV: Record<string, number> = (() => {
  const o: Record<string, number> = {};
  for (let i = 0; i < ABC.length; i++) o[ABC[i]] = i;
  return o;
})();

export function deBase64(s: string): Uint8Array | null {
  if (typeof s !== "string" || s.length % 4 !== 0 || s.length > MAX_BYTES_DATOS * 2) return null;
  const pad = s.endsWith("==") ? 2 : s.endsWith("=") ? 1 : 0;
  const salida = new Uint8Array((s.length / 4) * 3 - pad);
  let pos = 0;
  for (let i = 0; i < s.length; i += 4) {
    const a = INV[s[i]];
    const b = INV[s[i + 1]];
    const c = s[i + 2] === "=" ? 0 : INV[s[i + 2]];
    const d = s[i + 3] === "=" ? 0 : INV[s[i + 3]];
    if (a === undefined || b === undefined || c === undefined || d === undefined) return null;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    if (pos < salida.length) salida[pos++] = (n >> 16) & 255;
    if (pos < salida.length) salida[pos++] = (n >> 8) & 255;
    if (pos < salida.length) salida[pos++] = n & 255;
  }
  return salida;
}

export function armarPaquete(p: PaqueteVoz): string {
  const tramas = p.tramas.slice(0, MAX_TRAMAS_PAQUETE);
  let largo = 0;
  for (const t of tramas) largo += 2 + t.length;
  const cuerpo = new Uint8Array(largo);
  let pos = 0;
  for (const t of tramas) {
    cuerpo[pos++] = (t.length >> 8) & 255;
    cuerpo[pos++] = t.length & 255;
    cuerpo.set(t, pos);
    pos += t.length;
  }
  return JSON.stringify({ t: "voz.p", s: p.s, q: p.q, ts: Math.round(p.ts), c: p.c, f: p.f, d: aBase64(cuerpo) });
}

function entero(v: unknown, max: number): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max && Math.floor(v) === v ? v : null;
}

/** Lee un paquete recibido. Es DATO DEL OTRO APARATO: nada se da por bueno. Null si no es válido. */
export function leerPaquete(texto: string): PaqueteVoz | null {
  if (!texto.startsWith('{"t":"voz.p"') || texto.length > MAX_BYTES_DATOS * 2 + 200) return null;
  try {
    const o = JSON.parse(texto) as Record<string, unknown>;
    const q = entero(o.q, 0x7fffffff);
    const f = entero(o.f, 120);
    if (o.t !== "voz.p" || typeof o.s !== "string" || !o.s || o.s.length > 80 || q === null || f === null || f < 5 || !esCodecVoz(o.c) || typeof o.d !== "string") return null;
    const ts = typeof o.ts === "number" && Number.isFinite(o.ts) ? o.ts : 0;
    const bytes = deBase64(o.d);
    if (!bytes) return null;
    const tramas: Uint8Array[] = [];
    let pos = 0;
    while (pos + 2 <= bytes.length && tramas.length < MAX_TRAMAS_PAQUETE) {
      const n = (bytes[pos] << 8) | bytes[pos + 1];
      pos += 2;
      if (n === 0 || pos + n > bytes.length) return null;
      tramas.push(bytes.subarray(pos, pos + n));
      pos += n;
    }
    if (!tramas.length) return null;
    return { s: o.s, q, ts, c: o.c, f, tramas };
  } catch {
    return null;
  }
}

export function armarControl(c: ControlVoz): string {
  return JSON.stringify({ t: "voz.c", ...c });
}

export function leerControl(texto: string): ControlVoz | null {
  if (!texto.startsWith('{"t":"voz.c"') || texto.length > 600) return null;
  try {
    const o = JSON.parse(texto) as Record<string, unknown>;
    if (o.t !== "voz.c" || typeof o.s !== "string" || !o.s || o.s.length > 80) return null;
    if (o.k !== "hola" && o.k !== "fin" && o.k !== "ping" && o.k !== "pong") return null;
    const c: ControlVoz = { s: o.s, k: o.k };
    if (Array.isArray(o.codecs)) c.codecs = o.codecs.filter(esCodecVoz).slice(0, 3);
    if (typeof o.ts === "number" && Number.isFinite(o.ts)) c.ts = o.ts;
    if (typeof o.m === "string") c.m = o.m.slice(0, 120);
    return c;
  } catch {
    return null;
  }
}
