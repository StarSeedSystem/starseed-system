/**
 * video-datos/paquete — fragmentos de vídeo por enlace de datos y su reensamblado (LLA1108H).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Puro. Un fotograma codificado se parte en fragmentos que caben en el enlace:
 *   {"t":"voz.v","s":<llamada>,"q":<nº de fotograma>,"k":1|0,"i":<fragmento>,"n":<total>,"c":<códec>,"w":..,"h":..,"ts":<ms>,"d":<base64>}
 * y un control propio del vídeo (no se mezcla con el de la voz):
 *   {"t":"voz.w","s":<llamada>,"k":"hola"|"kf"|"fin","dec":[<códecs que sé decodificar>]}
 * Ambos empiezan por `{"t":"voz.`, así el Bluetooth y el hub los reconocen. El cifrado lo pone el enlace
 * (sesión por enlace, CIF1108A): aquí no hay segunda capa.
 * Pérdida: si falta un fragmento, el fotograma se descarta; los diferenciales siguientes no valen hasta el
 * próximo clave, así que el receptor lo pide (`kf`). Nunca se enseña una imagen a medias.
 */
import { aBase64, deBase64 } from "@/lib/llamadas/voz-datos/paquete";
import { esCodecVideo, type CodecVideo, type FrameCodificado } from "./tipos";

export const PREFIJO_VIDEO = '{"t":"voz.v"';
export const PREFIJO_CONTROL_VIDEO = '{"t":"voz.w"';
/** Bytes crudos por fragmento por defecto: ≈ 1,6 KB en texto, bastante por debajo del tope de trama del Bluetooth. */
export const MTU_VIDEO_DEFECTO = 1200;
const MTU_MIN = 200;
const MTU_MAX = 4000;
const MAX_FRAGMENTOS = 64;

export function esTextoVideo(t: unknown): boolean {
  return typeof t === "string" && (t.startsWith(PREFIJO_VIDEO) || t.startsWith(PREFIJO_CONTROL_VIDEO));
}

export interface FragmentoVideo {
  s: string;
  q: number;
  clave: boolean;
  i: number;
  n: number;
  c: CodecVideo;
  w: number;
  h: number;
  ts: number;
  datos: Uint8Array;
}

export function mtuSana(mtu: number | null | undefined): number {
  if (typeof mtu !== "number" || !Number.isFinite(mtu)) return MTU_VIDEO_DEFECTO;
  return Math.max(MTU_MIN, Math.min(MTU_MAX, Math.floor(mtu)));
}

/** Parte un fotograma en fragmentos de ≤ `mtu` bytes. Un fotograma que pasaría de 64 fragmentos se rechaza (null). */
export function fragmentar(s: string, q: number, c: CodecVideo, f: FrameCodificado, mtu?: number | null): FragmentoVideo[] | null {
  const m = mtuSana(mtu);
  const n = Math.max(1, Math.ceil(f.bytes.length / m));
  if (n > MAX_FRAGMENTOS || f.bytes.length === 0) return null;
  const out: FragmentoVideo[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ s, q, clave: f.clave, i, n, c, w: f.w, h: f.h, ts: Math.round(f.ts), datos: f.bytes.subarray(i * m, Math.min(f.bytes.length, (i + 1) * m)) });
  }
  return out;
}

export function armarFragmento(p: FragmentoVideo): string {
  return JSON.stringify({ t: "voz.v", s: p.s, q: p.q, k: p.clave ? 1 : 0, i: p.i, n: p.n, c: p.c, w: p.w, h: p.h, ts: p.ts, d: aBase64(p.datos) });
}

function entero(v: unknown, max: number): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max && Math.floor(v) === v ? v : null;
}

/** Lee un fragmento recibido. Es DATO DEL OTRO APARATO: nada se da por bueno. Null si no es válido. */
export function leerFragmento(texto: string): FragmentoVideo | null {
  if (!texto.startsWith(PREFIJO_VIDEO) || texto.length > 12_400) return null;
  try {
    const o = JSON.parse(texto) as Record<string, unknown>;
    const q = entero(o.q, 0x7fffffff);
    const i = entero(o.i, MAX_FRAGMENTOS - 1);
    const n = entero(o.n, MAX_FRAGMENTOS);
    const w = entero(o.w, 1920);
    const h = entero(o.h, 1080);
    if (o.t !== "voz.v" || typeof o.s !== "string" || !o.s || o.s.length > 80 || q === null || i === null || n === null || n < 1 || i >= n) return null;
    if (w === null || h === null || w < 16 || h < 16 || !esCodecVideo(o.c) || typeof o.d !== "string") return null;
    const datos = deBase64(o.d);
    if (!datos || !datos.length) return null;
    const ts = typeof o.ts === "number" && Number.isFinite(o.ts) ? o.ts : 0;
    return { s: o.s, q, clave: o.k === 1, i, n, c: o.c, w, h, ts, datos };
  } catch {
    return null;
  }
}

export type KControlVideo = "hola" | "kf" | "fin";

export interface ControlVideo {
  s: string;
  k: KControlVideo;
  /** hola: códecs que sé decodificar. */
  dec?: CodecVideo[];
}

export function armarControlVideo(c: ControlVideo): string {
  return JSON.stringify({ t: "voz.w", ...c });
}

export function leerControlVideo(texto: string): ControlVideo | null {
  if (!texto.startsWith(PREFIJO_CONTROL_VIDEO) || texto.length > 400) return null;
  try {
    const o = JSON.parse(texto) as Record<string, unknown>;
    if (o.t !== "voz.w" || typeof o.s !== "string" || !o.s || o.s.length > 80) return null;
    if (o.k !== "hola" && o.k !== "kf" && o.k !== "fin") return null;
    const c: ControlVideo = { s: o.s, k: o.k };
    if (Array.isArray(o.dec)) c.dec = o.dec.filter(esCodecVideo).slice(0, 3);
    return c;
  } catch {
    return null;
  }
}

/* ══════════════════════════ Reensamblado ══════════════════════════ */

export type ResultadoReensamblado =
  | { tipo: "nada" }
  | { tipo: "frame"; frame: FrameCodificado; codec: CodecVideo; q: number }
  /** Se perdió algo: hay que pedir un clave y no usar diferenciales hasta que llegue. */
  | { tipo: "perdida"; motivo: string };

/** Cuánto se espera a que lleguen los fragmentos que faltan de un fotograma antes de darlo por perdido. */
export const ESPERA_FRAGMENTOS_MS = 1500;

interface Parcial {
  n: number;
  clave: boolean;
  c: CodecVideo;
  w: number;
  h: number;
  ts: number;
  trozos: Array<Uint8Array | undefined>;
  cuenta: number;
  desde: number;
}

/**
 * Junta fragmentos en fotogramas. Entrega en orden: si llega completo un fotograma más nuevo que uno a medias,
 * el viejo se da por perdido. Tras una pérdida solo se entregan fotogramas CLAVE hasta que llega uno.
 */
export class ReensambladorVideo {
  private readonly parciales = new Map<number, Parcial>();
  private ultimoEntregado = -1;
  private esperandoClave = true;

  /** ¿Se está descartando todo hasta el próximo clave? */
  get necesitaClave(): boolean {
    return this.esperandoClave;
  }

  meter(f: FragmentoVideo, ahora: number): ResultadoReensamblado {
    if (f.q <= this.ultimoEntregado) return { tipo: "nada" };
    let p = this.parciales.get(f.q);
    if (!p) {
      p = { n: f.n, clave: f.clave, c: f.c, w: f.w, h: f.h, ts: f.ts, trozos: new Array(f.n), cuenta: 0, desde: ahora };
      this.parciales.set(f.q, p);
    }
    if (p.n !== f.n || f.i >= p.n) return { tipo: "nada" };
    if (!p.trozos[f.i]) {
      p.trozos[f.i] = f.datos;
      p.cuenta++;
    }
    if (p.cuenta < p.n) return { tipo: "nada" };
    // Completo.
    this.parciales.delete(f.q);
    let largo = 0;
    for (const t of p.trozos) largo += t?.length ?? 0;
    const bytes = new Uint8Array(largo);
    let pos = 0;
    for (const t of p.trozos) {
      if (!t) continue;
      bytes.set(t, pos);
      pos += t.length;
    }
    // Hueco de fotogramas enteros antes de este (o parciales viejos a medias): se perdió algo.
    let hueco = this.ultimoEntregado >= 0 && f.q > this.ultimoEntregado + 1;
    for (const q of Array.from(this.parciales.keys())) {
      if (q < f.q) {
        this.parciales.delete(q);
        hueco = true;
      }
    }
    this.ultimoEntregado = f.q;
    if (hueco && !p.clave) {
      this.esperandoClave = true;
      return { tipo: "perdida", motivo: "falta un fotograma antes de este diferencial" };
    }
    if (this.esperandoClave && !p.clave) return { tipo: "nada" };
    if (p.clave) this.esperandoClave = false;
    return { tipo: "frame", frame: { clave: p.clave, bytes, ts: p.ts, w: p.w, h: p.h }, codec: p.c, q: f.q };
  }

  /** Revisa fotogramas a medias que ya no van a completarse. Devuelve «perdida» si hay que pedir un clave. */
  caducar(ahora: number): ResultadoReensamblado {
    let perdido = false;
    for (const [q, p] of Array.from(this.parciales.entries())) {
      if (ahora - p.desde >= ESPERA_FRAGMENTOS_MS) {
        this.parciales.delete(q);
        perdido = true;
      }
    }
    if (!perdido) return { tipo: "nada" };
    this.esperandoClave = true;
    return { tipo: "perdida", motivo: "fragmentos sin llegar" };
  }

  /** El decodificador falló: hasta el próximo clave no se entrega nada. */
  exigirClave(): void {
    this.esperandoClave = true;
  }

  reiniciar(): void {
    this.parciales.clear();
    this.ultimoEntregado = -1;
    this.esperandoClave = true;
  }
}
