/**
 * relevo/sobre — las tramas del relevo, el sello de punta a punta y la supresión de duplicados (REL1111I · 2026-11-11).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Contrato: `architecture/red-sin-dependencias.md` §14.3 y §14.4. Módulo PURO: el cifrado y la firma se inyectan.
 *
 * Todas las tramas empiezan por `{"t":"tu.rv`, así que cualquier carril que ya entrega `{"t":"tu.` al transporte universal
 * (Bluetooth, red local nativa, enlace local, malla de la cuenta) las lleva sin tocar su motor, y una app anterior las
 * descarta en silencio (no son `tu.msg` ni `tu.ack`).
 *
 *   tu.rvd  datos: {id, o (origen), d (destino), r (neuronas por las que pasó, el origen primero), ttl, k, p}
 *           k = "m" mensaje sellado para d · "a" acuse sellado para el origen · "f" trama de archivo (ya sellada por
 *               `canal-sellado`) · "fa" acuse de una trama de archivo (solo su id).
 *   tu.rvn  negativa de un relevo a quien le pasó la trama: {id, d, n (quién dice que no), m (motivo)}.
 *
 * Qué ve el relevo (y nada más): origen, destino, la cuenta del origen, el tipo de trama, el id, el tamaño y la hora. Un
 * mensaje va dentro de un sobre ECDH P‑256 → HKDF → AES‑256‑GCM para la clave de cifrado de la neurona destino (el
 * mismo `recipient-crypto` v:3 que la oferta de un archivo), con la firma ECDSA del remitente dentro: el relevo no puede
 * leerlo, ni cambiarlo, ni inventarse uno «de A». El acuse va igual, sellado para el origen y firmado por el destino: un
 * relevo no puede fingir una entrega. Los trozos de archivo ya llegan sellados (AES‑256‑GCM por trozo, oferta en sobre).
 * Nunca lanza.
 */

import type { SobreMensaje } from "@/lib/malla/transporte-universal";

export const T_DATOS = "tu.rvd";
export const T_NEGATIVA = "tu.rvn";
export const PREFIJO_RELEVO = '{"t":"tu.rv';
/** Saltos como mucho (fase 1: origen → relevo → destino). */
export const MAX_SALTOS = 2;
/** Tope de una trama de datos (texto) por relevo. */
export const MAX_TRAMA = 160 * 1024;

export type ClaseTrama = "m" | "a" | "f" | "fa";

export interface TramaDatos {
  t: typeof T_DATOS;
  v: 1;
  id: string;
  o: string;
  d: string;
  /** Cuenta del origen (el relevo la usa para decidir; no es secreta para él). */
  u?: string;
  r: string[];
  ttl: number;
  k: ClaseTrama;
  p: string;
}

export interface TramaNegativa {
  t: typeof T_NEGATIVA;
  v: 1;
  id: string;
  d: string;
  n: string;
  m: string;
}

export function esTramaRelevo(texto: unknown): texto is string {
  return typeof texto === "string" && texto.startsWith(PREFIJO_RELEVO);
}

function corto(x: unknown, n: number): string | null {
  return typeof x === "string" && x.length > 0 && x.length <= n ? x : null;
}

export function leerTramaDatos(x: unknown): TramaDatos | null {
  const o = x as Record<string, unknown> | null;
  if (!o || typeof o !== "object" || o.t !== T_DATOS || o.v !== 1) return null;
  const id = corto(o.id, 100);
  const origen = corto(o.o, 120);
  const d = corto(o.d, 120);
  const k = o.k === "m" || o.k === "a" || o.k === "f" || o.k === "fa" ? o.k : null;
  if (!id || !origen || !d || !k || typeof o.p !== "string" || o.p.length > MAX_TRAMA) return null;
  if (!Array.isArray(o.r) || o.r.length < 1 || o.r.length > MAX_SALTOS + 1 || !o.r.every((n) => corto(n, 120))) return null;
  if (o.r[0] !== origen) return null;
  if (typeof o.ttl !== "number" || !Number.isInteger(o.ttl) || o.ttl < 0 || o.ttl > MAX_SALTOS) return null;
  const u = corto(o.u, 120);
  return { t: T_DATOS, v: 1, id, o: origen, d, ...(u ? { u } : {}), r: o.r as string[], ttl: o.ttl, k, p: o.p };
}

export function leerNegativa(x: unknown): TramaNegativa | null {
  const o = x as Record<string, unknown> | null;
  if (!o || typeof o !== "object" || o.t !== T_NEGATIVA || o.v !== 1) return null;
  const id = corto(o.id, 100);
  const d = corto(o.d, 120);
  const n = corto(o.n, 120);
  if (!id || !d || !n) return null;
  return { t: T_NEGATIVA, v: 1, id, d, n, m: corto(o.m, 200) ?? "sin motivo" };
}

export function parsear(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

/* ───────── duplicados ───────── */

/** Conjunto acotado de ids vistos (por cantidad y por edad). Lo que sale por la cola puede volver a entrar: el tope es amplio. */
export class VistosAcotados {
  private mapa = new Map<string, number>();
  constructor(
    private max = 4096,
    private ttlMs = 10 * 60_000,
  ) {}
  /** true si ya estaba (y no lo vuelve a añadir); false si es nuevo (y lo anota). */
  visto(id: string, ahora: number): boolean {
    const t = this.mapa.get(id);
    if (t !== undefined && ahora - t <= this.ttlMs) return true;
    this.mapa.set(id, ahora);
    if (this.mapa.size > this.max) {
      const primero = this.mapa.keys().next().value as string | undefined;
      if (primero !== undefined) this.mapa.delete(primero);
    }
    return false;
  }
  tiene(id: string, ahora: number): boolean {
    const t = this.mapa.get(id);
    return t !== undefined && ahora - t <= this.ttlMs;
  }
  get tamano(): number {
    return this.mapa.size;
  }
}

/* ───────── sello de punta a punta ───────── */

export interface FirmaRelevo {
  s: string;
  k: JsonWebKey;
  f: string;
}

export interface CriptoRelevo {
  /** Sella `obj` para la pública ECDH de un destinatario (sobre v:3). Null si no puede. */
  cifrar(pub: JsonWebKey, obj: unknown): Promise<unknown | null>;
  /** Abre un sobre con la privada de ESTA neurona. Null si no es para mí o está roto. */
  abrir(sobre: unknown): Promise<unknown | null>;
  firmar(cuerpo: unknown): Promise<FirmaRelevo | null>;
  /** Comprueba la firma Y que la huella es la que conozco para `neurona` (cuenta → neurona). */
  verificar(cuerpo: unknown, firma: FirmaRelevo, neurona: string): Promise<boolean>;
}

interface PaqueteMensaje {
  v: 1;
  o: string;
  d: string;
  m: SobreMensaje;
  f?: FirmaRelevo;
}
interface PaqueteAcuse {
  v: 1;
  o: string;
  d: string;
  a: string;
  f?: FirmaRelevo;
}

const lo_firmado_mensaje = (o: string, d: string, m: SobreMensaje) => ({ rv: "m", o, d, id: m.id, c: m.c, b: m.b ?? null });
const lo_firmado_acuse = (o: string, d: string, a: string) => ({ rv: "a", o, d, a });

/** Sella un `tu.msg` para el destino. Null si no hay forma (sin clave o sin firma): nunca se manda en claro. */
export async function sellarMensaje(c: CriptoRelevo, pubDestino: JsonWebKey, o: string, d: string, m: SobreMensaje): Promise<string | null> {
  try {
    const f = await c.firmar(lo_firmado_mensaje(o, d, m));
    if (!f) return null;
    const sobre = await c.cifrar(pubDestino, { v: 1, o, d, m, f } satisfies PaqueteMensaje);
    return sobre ? JSON.stringify(sobre) : null;
  } catch {
    return null;
  }
}

/** Abre el mensaje de una trama `m` dirigida a mí. Comprueba origen, destino, firma y huella. */
export async function abrirMensaje(c: CriptoRelevo, t: TramaDatos, yo: string): Promise<SobreMensaje | null> {
  try {
    const paq = (await c.abrir(parsear(t.p))) as PaqueteMensaje | null;
    if (!paq || paq.v !== 1 || paq.o !== t.o || paq.d !== yo || t.d !== yo || !paq.m || paq.m.t !== "tu.msg" || typeof paq.m.id !== "string" || !paq.f) return null;
    if (!(await c.verificar(lo_firmado_mensaje(paq.o, paq.d, paq.m), paq.f, paq.o))) return null;
    return paq.m;
  } catch {
    return null;
  }
}

export async function sellarAcuse(c: CriptoRelevo, pubOrigen: JsonWebKey, yo: string, origen: string, idMensaje: string): Promise<string | null> {
  try {
    const f = await c.firmar(lo_firmado_acuse(yo, origen, idMensaje));
    if (!f) return null;
    const sobre = await c.cifrar(pubOrigen, { v: 1, o: yo, d: origen, a: idMensaje, f } satisfies PaqueteAcuse);
    return sobre ? JSON.stringify(sobre) : null;
  } catch {
    return null;
  }
}

/** Abre un acuse dirigido a mí; devuelve el id del mensaje acusado. */
export async function abrirAcuse(c: CriptoRelevo, t: TramaDatos, yo: string): Promise<string | null> {
  try {
    const paq = (await c.abrir(parsear(t.p))) as PaqueteAcuse | null;
    if (!paq || paq.v !== 1 || paq.o !== t.o || paq.d !== yo || typeof paq.a !== "string" || !paq.f) return null;
    if (!(await c.verificar(lo_firmado_acuse(paq.o, paq.d, paq.a), paq.f, paq.o))) return null;
    return paq.a;
  } catch {
    return null;
  }
}
