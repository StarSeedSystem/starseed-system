/**
 * voz-datos/paquete — el empaquetado de la voz por enlace de datos (LLA1108E).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Puro. Los enlaces de la malla llevan TEXTO (el cifrado de punta a punta de cada enlace, CIF1108A, ya
 * se aplica abajo: aquí no hay segunda capa). Un paquete es un JSON corto con tramas consecutivas:
 *   {"t":"voz.p","s":<llamada>,"q":<seq de la 1.ª trama>,"ts":<ms>,"c":<códec>,"f":<ms/trama>,"d":<base64>}
 * `d` = tramas con prefijo de longitud de 2 bytes. Cada trama lleva su propio número (q, q+1, …).
 * Y un control: {"t":"voz.c","s":<llamada>,"k":"hola"|"fin"|"ping"|"pong",…}.
 * Ambos empiezan por `{"t":"voz.`: así cada enlace los reconoce barato y les da su cola propia.
 *
 * (VOZ1111J) Formato compacto «b1», solo si el otro lo anunció en su saludo (`fmt`): {"t":"voz.b","d":<base64>}. El
 * id de la llamada (36 letras), las claves y los números en texto pesaban ≈ 110 B por paquete: más que el audio de
 * Opus a 12 kb/s. Ahora todo va en una cabecera binaria de 14 B dentro de `d` (ver `armarPaqueteB`). Además cada
 * trama dice cuántas unidades de 20 ms dura (Opus de 40/60 ms) y los silencios se DECLARAN (no se mandan y no son
 * pérdida). Un aparato anterior (0.5.1-prueba.36) ignora `voz.b` y `fmt`: con él se sigue hablando `voz.p`.
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

export type KControl = "hola" | "fin" | "ping" | "pong" | "rep";

export interface ControlVoz {
  s: string;
  k: KControl;
  /** hola: códecs que entiendo. */
  codecs?: CodecVoz[];
  /** ping/pong: reloj del que pregunta. */
  ts?: number;
  /** fin: motivo. */
  m?: string;
  /** (VOZ1111J) hola: formatos de paquete que entiendo además de `voz.p` («b1»). Un aparato anterior no lo manda. */
  fmt?: string[];
  /** (VOZ1111J) rep: lo que me llega de ti en la última ventana: % perdido, % tarde (tras su turno), kb/s de texto. */
  perd?: number;
  tarde?: number;
  kbps?: number;
  /** (VOZ1111J) rep: 1 si con lo que me llega no se entiende la voz (estoy en silencio y aviso). */
  corte?: number;
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
    if (o.k !== "hola" && o.k !== "fin" && o.k !== "ping" && o.k !== "pong" && o.k !== "rep") return null;
    const c: ControlVoz = { s: o.s, k: o.k };
    if (Array.isArray(o.codecs)) c.codecs = o.codecs.filter(esCodecVoz).slice(0, 3);
    if (typeof o.ts === "number" && Number.isFinite(o.ts)) c.ts = o.ts;
    if (typeof o.m === "string") c.m = o.m.slice(0, 120);
    // VOZ1111J
    if (Array.isArray(o.fmt)) c.fmt = o.fmt.filter((x): x is string => typeof x === "string" && /^[a-z0-9]{1,8}$/.test(x)).slice(0, 4);
    const pct = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v * 10) / 10)) : undefined);
    if (o.k === "rep") {
      const perd = pct(o.perd);
      const tarde = pct(o.tarde);
      if (perd !== undefined) c.perd = perd;
      if (tarde !== undefined) c.tarde = tarde;
      if (typeof o.kbps === "number" && Number.isFinite(o.kbps)) c.kbps = Math.max(0, Math.min(10_000, Math.round(o.kbps)));
      if (o.corte === 1) c.corte = 1;
    }
    return c;
  } catch {
    return null;
  }
}


/* ═══════════════════════════ (VOZ1111J) Formato compacto «b1» ═══════════════════════════ */

export const PREFIJO_VOZ_B = '{"t":"voz.b"';
/** Formatos de paquete que entiende esta versión, además de `voz.p` (se anuncian en el saludo). */
export const FORMATOS_VOZ = ["b1"] as const;
export const VERSION_B1 = 1;
/** Unidad de numeración: 20 ms (una trama de captura). Una trama de Opus de 60 ms ocupa 3 unidades. */
export const MS_UNIDAD = 20;
/** Cabecera binaria: versión, códec|banderas, etiqueta (2), q (4), ts (4), cubre, nº de tramas|nº de redundantes. */
export const CABECERA_B1 = 14;
/** El envoltorio de texto: `{"t":"voz.b","d":""}`. */
export const ENVOLTORIO_B1 = 20;
const MAX_UNIDADES_TRAMA = 8;
const MAX_HUECO = 31;
const MAX_RED = 4;

const CODIGO_CODEC: Record<CodecVoz, number> = { opus: 0, adpcm: 1, mulaw: 2 };
const CODEC_DE_CODIGO: CodecVoz[] = ["opus", "adpcm", "mulaw"];

/** Una trama con su sitio: empieza en la unidad `q` y dura `n` unidades de 20 ms. */
export interface TramaVoz {
  q: number;
  n: number;
  bytes: Uint8Array;
}

export interface PaqueteVozB {
  /** Etiqueta de 16 bits del id de la llamada (`etiquetaLlamada`). */
  etiqueta: number;
  /** Primera unidad que cubre este paquete. */
  q: number;
  /** Unidades que cubre desde `q`: las que no tienen trama son SILENCIO declarado (no pérdida). */
  cubre: number;
  /** Reloj de quien manda (ms), en 32 bits (se rehace con `tsCompleto`). */
  ts: number;
  c: CodecVoz;
  /** Tramas nuevas, en orden y dentro de [q, q + cubre). */
  tramas: TramaVoz[];
  /** Tramas repetidas del paquete anterior (redundancia), todas antes de `q`. */
  red: TramaVoz[];
}

/** FNV-1a de 16 bits del id de la llamada: con el enlace ya ligado a una neurona basta para no mezclar llamadas. */
export function etiquetaLlamada(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ((h >>> 16) ^ h) & 0xffff;
}

function escribirLargo(o: number[], n: number): void {
  if (n < 128) o.push(n);
  else o.push(0x80 | ((n >> 8) & 0x7f), n & 0xff);
}

/** Bytes de texto de un paquete b1 con tramas de esos tamaños (sin construirlo): para el coste de cada escalón. */
export function bytesTextoB1(largos: readonly number[], largosRed: readonly number[] = []): number {
  let n = CABECERA_B1;
  for (const l of largos) n += 1 + (l < 128 ? 1 : 2) + l;
  for (const l of largosRed) n += 2 + (l < 128 ? 1 : 2) + l;
  return ENVOLTORIO_B1 + Math.ceil(n / 3) * 4;
}

/** Bytes de texto de un `voz.p` (el formato de antes) con tramas de esos tamaños y ese id de llamada. */
export function bytesTextoP(largos: readonly number[], idLlamada: string): number {
  const cuerpo = largos.reduce((a, l) => a + 2 + l, 0);
  // {"t":"voz.p","s":"…","q":1234567,"ts":1731300000000,"c":"opus","f":20,"d":"…"}
  return 70 + idLlamada.length + Math.ceil(cuerpo / 3) * 4;
}

/**
 * Arma un `voz.b`. Binario dentro de `d`:
 *   [0] versión (1) · [1] códec (bits 0-1) · [2-3] etiqueta · [4-7] q · [8-11] ts (ms, 32 bits) · [12] cubre ·
 *   [13] nº de tramas (bits 0-3) | nº de redundantes (bits 4-6) ·
 *   por trama: (hueco de silencio antes, en unidades) << 3 | (n − 1), largo (1 B, o 2 B con el bit alto), bytes ·
 *   por redundante: unidades ANTES de q donde empieza, n − 1, largo, bytes.
 * Las tramas deben ir en orden, sin solaparse, dentro de [q, q + cubre). Null si no cabe en el formato.
 */
export function armarPaqueteB(p: PaqueteVozB): string | null {
  if (p.tramas.length > 15 || p.red.length > MAX_RED || p.cubre < 1 || p.cubre > 255) return null;
  const o: number[] = [VERSION_B1, CODIGO_CODEC[p.c] & 3, (p.etiqueta >> 8) & 255, p.etiqueta & 255];
  const q = p.q >>> 0;
  const ts = Math.round(p.ts) >>> 0;
  o.push((q >>> 24) & 255, (q >>> 16) & 255, (q >>> 8) & 255, q & 255);
  o.push((ts >>> 24) & 255, (ts >>> 16) & 255, (ts >>> 8) & 255, ts & 255);
  o.push(p.cubre, (p.tramas.length & 15) | ((p.red.length & 7) << 4));
  let cursor = p.q;
  for (const t of p.tramas) {
    const hueco = t.q - cursor;
    if (hueco < 0 || hueco > MAX_HUECO || t.n < 1 || t.n > MAX_UNIDADES_TRAMA || t.bytes.length < 1 || t.bytes.length > 0x7fff) return null;
    o.push((hueco << 3) | (t.n - 1));
    escribirLargo(o, t.bytes.length);
    for (const b of t.bytes) o.push(b);
    cursor = t.q + t.n;
  }
  if (cursor - p.q > p.cubre) return null;
  for (const t of p.red) {
    const atras = p.q - t.q;
    if (atras < 1 || atras > 255 || t.n < 1 || t.n > MAX_UNIDADES_TRAMA || t.bytes.length < 1 || t.bytes.length > 0x7fff) return null;
    o.push(atras, t.n - 1);
    escribirLargo(o, t.bytes.length);
    for (const b of t.bytes) o.push(b);
  }
  if (o.length > MAX_BYTES_DATOS) return null;
  return `{"t":"voz.b","d":"${aBase64(Uint8Array.from(o))}"}`;
}

/** Lee un `voz.b`. Es DATO DEL OTRO APARATO: nada se da por bueno. Null si no es válido. */
export function leerPaqueteB(texto: string): PaqueteVozB | null {
  if (typeof texto !== "string" || !texto.startsWith(PREFIJO_VOZ_B) || texto.length > MAX_BYTES_DATOS * 2 + 40) return null;
  let d: unknown;
  try {
    const o = JSON.parse(texto) as Record<string, unknown>;
    if (o.t !== "voz.b") return null;
    d = o.d;
  } catch {
    return null;
  }
  if (typeof d !== "string") return null;
  const b = deBase64(d);
  if (!b || b.length < CABECERA_B1 || b[0] !== VERSION_B1) return null;
  const c = CODEC_DE_CODIGO[b[1] & 3];
  if (!c) return null;
  const etiqueta = (b[2] << 8) | b[3];
  const q = ((b[4] << 24) | (b[5] << 16) | (b[6] << 8) | b[7]) >>> 0;
  const ts = ((b[8] << 24) | (b[9] << 16) | (b[10] << 8) | b[11]) >>> 0;
  const cubre = b[12];
  const nT = b[13] & 15;
  const nR = (b[13] >> 4) & 7;
  if (cubre < 1 || nR > MAX_RED || q > 0x7fffffff) return null;
  let pos = CABECERA_B1;
  const largo = (): number | null => {
    if (pos >= b.length) return null;
    const x = b[pos++];
    if (!(x & 0x80)) return x;
    if (pos >= b.length) return null;
    return ((x & 0x7f) << 8) | b[pos++];
  };
  const tramas: TramaVoz[] = [];
  let cursor = q;
  for (let i = 0; i < nT; i++) {
    if (pos >= b.length) return null;
    const x = b[pos++];
    const tq = cursor + (x >> 3);
    const n = (x & 7) + 1;
    const l = largo();
    if (!l || pos + l > b.length) return null;
    tramas.push({ q: tq, n, bytes: b.subarray(pos, pos + l) });
    pos += l;
    cursor = tq + n;
  }
  if (cursor - q > cubre) return null;
  const red: TramaVoz[] = [];
  for (let i = 0; i < nR; i++) {
    if (pos + 2 > b.length) return null;
    const atras = b[pos++];
    const n = b[pos++] + 1;
    const l = largo();
    if (!atras || n > MAX_UNIDADES_TRAMA || !l || pos + l > b.length || atras > q) return null;
    red.push({ q: q - atras, n, bytes: b.subarray(pos, pos + l) });
    pos += l;
  }
  if (pos !== b.length) return null;
  return { etiqueta, q, cubre, ts, c, tramas, red };
}

/** El reloj completo del que manda a partir de sus 32 bits bajos y mi reloj (ida y vuelta < 24 días). */
export function tsCompleto(ts32: number, ahora: number): number {
  const d = ((Math.round(ahora) >>> 0) - (ts32 >>> 0)) >>> 0;
  return Math.round(ahora) - (d > 0x7fffffff ? d - 0x100000000 : d);
}

/**
 * Para el banco y el diagnóstico: las unidades de 20 ms que trae un paquete de voz de cualquier formato (las de las
 * tramas y, en «b1», también las de silencio declarado) y el reloj del que lo mandó. Null si no es un paquete de voz.
 */
export function unidadesPaqueteVoz(texto: string, ahora: number = Date.now()): { ts: number; unidades: number[] } | null {
  if (typeof texto !== "string") return null;
  if (texto.startsWith('{"t":"voz.p"')) {
    const p = leerPaquete(texto);
    return p ? { ts: p.ts, unidades: p.tramas.map((_, k) => p.q + k) } : null;
  }
  const b = leerPaqueteB(texto);
  if (!b) return null;
  const u = new Set<number>();
  for (let k = 0; k < b.cubre; k++) u.add(b.q + k);
  for (const t of [...b.tramas, ...b.red]) for (let k = 0; k < t.n; k++) u.add(t.q + k);
  return { ts: tsCompleto(b.ts, ahora), unidades: [...u].sort((x, y) => x - y) };
}