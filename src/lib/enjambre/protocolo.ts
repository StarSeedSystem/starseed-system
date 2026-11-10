/**
 * protocolo — mensajes tipados del Enjambre y su validación estricta (ENJ1110A · 2026-11-10). Contrato: §6.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Todo mensaje es un objeto JSON con `t: "enj.*"`, `v: 1` y el id del enjambre (`id`, 64 hex; en ámbitos no
 * públicos es un HMAC que no revela la raíz). Lo que llega de la red es hostil: `leerMensajeEnj` devuelve un
 * objeto NUEVO con solo los campos conocidos, ya decodificados (binarios como `Uint8Array`) y acotados; ante la
 * menor irregularidad devuelve null. `escribirMensajeEnj` hace el camino inverso (a JSON con base64).
 *
 *   enj.anuncio  quién soy en este enjambre (rol, si estoy completo, si tengo la capa, semilla opcional)
 *   enj.tengo    qué piezas tengo: «todo», mapa de bits o rangos; `inc` = se suma a lo dicho antes
 *   enj.pide     pido la pieza `i` (con `prueba` pido además los hashes hermanos hasta la raíz)
 *   enj.trozo    la pieza `i` (y su prueba, si la pidieron)
 *   enj.no       no te la doy: motivo
 *   enj.cancela  ya no la quiero (final de partida: llegó por otra vía)
 *   enj.pares    intercambio de pares (PEX): otras neuronas del enjambre que conozco
 *   enj.capa     pide / da un rango de la capa de piezas con su prueba (estilo BEP 52 «hashes»)
 *   enj.canal    un registro de canal firmado (cotilleo)
 */

import { BYTES_HASH, MAX_HASHES_RANGO, MAX_TAMANO_PIEZA } from "./arbol";
import { leerRegistroCanal, type RegistroCanal } from "./canal";
import { leerSemilla, type Semilla } from "./semilla";
import { aB64, deB64, entero, esObjeto, hex64 } from "./util";

export const LIM = {
  /** Piezas máximas en un mapa (con 1 MiB de pieza = 8 TiB: más que el tope de contenido). */
  maxPiezas: 1 << 22,
  maxRangos: 64,
  maxPares: 16,
  maxPrueba: 40,
  maxTrozoB64: Math.ceil(((MAX_TAMANO_PIEZA + 64) * 4) / 3) + 8,
  maxId: 64,
} as const;

export type RolEnj = "sembradora" | "recolectora" | "relevo";
export const ROLES: readonly RolEnj[] = ["sembradora", "recolectora", "relevo"];

export type MotivoNo = "no-tengo" | "ocupada" | "no-autorizado" | "sin-prueba" | "limite" | "no-ofrecida" | "invalido";
export const MOTIVOS_NO: readonly MotivoNo[] = ["no-tengo", "ocupada", "no-autorizado", "sin-prueba", "limite", "no-ofrecida", "invalido"];

export interface MsgAnuncio {
  t: "enj.anuncio";
  id: string;
  rol: RolEnj;
  /** Tengo todas las piezas. */
  completo: boolean;
  /** Tengo la capa de piezas completa y verificada (puedo dar pruebas). */
  capa: boolean;
  /** Capacidad de subida que declaro (kbit/s), solo orientativa. */
  kbps?: number;
  semilla?: Semilla;
}

export interface MsgTengo {
  t: "enj.tengo";
  id: string;
  total: number;
  forma: "todo" | "mapa" | "rangos";
  /** Piezas (ya expandidas) si la forma es mapa o rangos. */
  piezas: number[];
  inc: boolean;
}

export interface MsgPide {
  t: "enj.pide";
  id: string;
  rq: number;
  i: number;
  prueba: boolean;
}

export interface MsgTrozo {
  t: "enj.trozo";
  id: string;
  rq: number;
  i: number;
  d: Uint8Array;
  prueba?: Uint8Array[];
}

export interface MsgNo {
  t: "enj.no";
  id: string;
  rq: number;
  motivo: MotivoNo;
}

export interface MsgCancela {
  t: "enj.cancela";
  id: string;
  rq: number;
}

export interface ParEnj {
  /** Id de neurona. */
  n: string;
}

export interface MsgPares {
  t: "enj.pares";
  id: string;
  pares: ParEnj[];
}

export interface MsgCapa {
  t: "enj.capa";
  id: string;
  rq: number;
  op: "pide" | "da";
  desde: number;
  cuantas: number;
  hashes?: Uint8Array[];
  prueba?: Uint8Array[];
}

export interface MsgCanal {
  t: "enj.canal";
  id: string;
  reg: RegistroCanal;
}

export type MensajeEnj = MsgAnuncio | MsgTengo | MsgPide | MsgTrozo | MsgNo | MsgCancela | MsgPares | MsgCapa | MsgCanal;

const RE_NEURONA = /^[A-Za-z0-9][A-Za-z0-9_:.\-]{0,63}$/;

export function idNeuronaValido(x: unknown): x is string {
  return typeof x === "string" && RE_NEURONA.test(x);
}

/* ───────────────────────── Mapas de bits y rangos ───────────────────────── */

/** Bitfield estilo BitTorrent (bit más significativo = pieza 0). */
export function mapaDePiezas(piezas: Iterable<number>, total: number): Uint8Array {
  const m = new Uint8Array(Math.ceil(total / 8));
  for (const p of piezas) if (Number.isInteger(p) && p >= 0 && p < total) m[p >> 3] |= 0x80 >> (p & 7);
  return m;
}

/** Piezas de un bitfield. Null si el largo no casa o los bits de relleno no son cero. */
export function piezasDeMapa(m: Uint8Array, total: number): number[] | null {
  if (m.length !== Math.ceil(total / 8)) return null;
  const out: number[] = [];
  for (let p = 0; p < total; p++) if (m[p >> 3] & (0x80 >> (p & 7))) out.push(p);
  const sobran = m.length * 8 - total;
  if (sobran > 0 && (m[m.length - 1] & ((1 << sobran) - 1)) !== 0) return null;
  return out;
}

/** Rangos [desde, hasta) consecutivos de un conjunto de piezas. */
export function rangosDePiezas(piezas: Iterable<number>): Array<[number, number]> {
  const v = [...new Set(piezas)].sort((a, b) => a - b);
  const out: Array<[number, number]> = [];
  for (const p of v) {
    const u = out[out.length - 1];
    if (u && u[1] === p) u[1] = p + 1;
    else out.push([p, p + 1]);
  }
  return out;
}

function piezasDeRangos(r: unknown, total: number): number[] | null {
  if (!Array.isArray(r) || r.length > LIM.maxRangos) return null;
  const out: number[] = [];
  let previo = -1;
  for (const x of r) {
    if (!Array.isArray(x) || x.length !== 2) return null;
    const a = entero(x[0], 0, total);
    const b = entero(x[1], 0, total);
    if (a === null || b === null || a >= b || a < previo) return null;
    for (let p = a; p < b; p++) out.push(p);
    previo = b;
  }
  return out;
}

/* ───────────────────────── Lectura ───────────────────────── */

function hashesDe(x: unknown, max: number): Uint8Array[] | null {
  if (!Array.isArray(x) || x.length > max) return null;
  const out: Uint8Array[] = [];
  for (const h of x) {
    const b = typeof h === "string" && h.length === 44 ? deB64(h) : null;
    if (!b || b.length !== BYTES_HASH) return null;
    out.push(b);
  }
  return out;
}

export function leerMensajeEnj(x: unknown): MensajeEnj | null {
  if (!esObjeto(x) || x.v !== 1 || typeof x.t !== "string") return null;
  const id = hex64(x.id);
  if (!id) return null;
  switch (x.t) {
    case "enj.anuncio": {
      if (typeof x.rol !== "string" || !(ROLES as readonly string[]).includes(x.rol)) return null;
      if (typeof x.completo !== "boolean" || typeof x.capa !== "boolean") return null;
      const m: MsgAnuncio = { t: "enj.anuncio", id, rol: x.rol as RolEnj, completo: x.completo, capa: x.capa };
      if (x.kbps !== undefined) {
        const k = entero(x.kbps, 0, 100_000_000);
        if (k === null) return null;
        m.kbps = k;
      }
      if (x.semilla !== undefined) {
        const s = leerSemilla(x.semilla);
        if (!s) return null;
        m.semilla = s;
      }
      return m;
    }
    case "enj.tengo": {
      const total = entero(x.total, 1, LIM.maxPiezas);
      if (total === null || typeof x.inc !== "boolean") return null;
      if (x.forma === "todo") return { t: "enj.tengo", id, total, forma: "todo", piezas: [], inc: x.inc };
      if (x.forma === "mapa") {
        const b = typeof x.mapa === "string" && x.mapa.length <= Math.ceil(total / 8) * 2 + 8 ? deB64(x.mapa) : null;
        const p = b ? piezasDeMapa(b, total) : null;
        return p ? { t: "enj.tengo", id, total, forma: "mapa", piezas: p, inc: x.inc } : null;
      }
      if (x.forma === "rangos") {
        const p = piezasDeRangos(x.rangos, total);
        return p ? { t: "enj.tengo", id, total, forma: "rangos", piezas: p, inc: x.inc } : null;
      }
      return null;
    }
    case "enj.pide": {
      const rq = entero(x.rq, 0, 0xffffffff);
      const i = entero(x.i, 0, LIM.maxPiezas);
      if (rq === null || i === null || typeof x.prueba !== "boolean") return null;
      return { t: "enj.pide", id, rq, i, prueba: x.prueba };
    }
    case "enj.trozo": {
      const rq = entero(x.rq, 0, 0xffffffff);
      const i = entero(x.i, 0, LIM.maxPiezas);
      if (rq === null || i === null || typeof x.d !== "string" || x.d.length > LIM.maxTrozoB64) return null;
      const d = deB64(x.d);
      if (!d) return null;
      const m: MsgTrozo = { t: "enj.trozo", id, rq, i, d };
      if (x.prueba !== undefined) {
        const p = hashesDe(x.prueba, LIM.maxPrueba);
        if (!p) return null;
        m.prueba = p;
      }
      return m;
    }
    case "enj.no": {
      const rq = entero(x.rq, 0, 0xffffffff);
      if (rq === null || typeof x.motivo !== "string" || !(MOTIVOS_NO as readonly string[]).includes(x.motivo)) return null;
      return { t: "enj.no", id, rq, motivo: x.motivo as MotivoNo };
    }
    case "enj.cancela": {
      const rq = entero(x.rq, 0, 0xffffffff);
      return rq === null ? null : { t: "enj.cancela", id, rq };
    }
    case "enj.pares": {
      if (!Array.isArray(x.pares) || x.pares.length > LIM.maxPares) return null;
      const pares: ParEnj[] = [];
      for (const p of x.pares) {
        if (!esObjeto(p) || !idNeuronaValido(p.n)) return null;
        pares.push({ n: p.n });
      }
      return { t: "enj.pares", id, pares };
    }
    case "enj.capa": {
      const rq = entero(x.rq, 0, 0xffffffff);
      const desde = entero(x.desde, 0, LIM.maxPiezas);
      const cuantas = entero(x.cuantas, 1, MAX_HASHES_RANGO);
      if (rq === null || desde === null || cuantas === null) return null;
      if (x.op === "pide") return { t: "enj.capa", id, rq, op: "pide", desde, cuantas };
      if (x.op === "da") {
        const hashes = hashesDe(x.hashes, MAX_HASHES_RANGO);
        const prueba = hashesDe(x.prueba, LIM.maxPrueba);
        return hashes && prueba ? { t: "enj.capa", id, rq, op: "da", desde, cuantas, hashes, prueba } : null;
      }
      return null;
    }
    case "enj.canal": {
      const reg = leerRegistroCanal(x.reg);
      return reg ? { t: "enj.canal", id, reg } : null;
    }
    default:
      return null;
  }
}

/* ───────────────────────── Escritura ───────────────────────── */

export function escribirMensajeEnj(m: MensajeEnj): Record<string, unknown> {
  const base = { v: 1, t: m.t, id: m.id };
  switch (m.t) {
    case "enj.anuncio":
      return { ...base, rol: m.rol, completo: m.completo, capa: m.capa, ...(m.kbps !== undefined ? { kbps: m.kbps } : {}), ...(m.semilla ? { semilla: m.semilla } : {}) };
    case "enj.tengo": {
      if (m.forma === "todo") return { ...base, total: m.total, forma: "todo", inc: m.inc };
      if (m.forma === "mapa") return { ...base, total: m.total, forma: "mapa", mapa: aB64(mapaDePiezas(m.piezas, m.total)), inc: m.inc };
      return { ...base, total: m.total, forma: "rangos", rangos: rangosDePiezas(m.piezas), inc: m.inc };
    }
    case "enj.pide":
      return { ...base, rq: m.rq, i: m.i, prueba: m.prueba };
    case "enj.trozo":
      return { ...base, rq: m.rq, i: m.i, d: aB64(m.d), ...(m.prueba ? { prueba: m.prueba.map(aB64) } : {}) };
    case "enj.no":
      return { ...base, rq: m.rq, motivo: m.motivo };
    case "enj.cancela":
      return { ...base, rq: m.rq };
    case "enj.pares":
      return { ...base, pares: m.pares };
    case "enj.capa":
      return m.op === "pide"
        ? { ...base, rq: m.rq, op: "pide", desde: m.desde, cuantas: m.cuantas }
        : { ...base, rq: m.rq, op: "da", desde: m.desde, cuantas: m.cuantas, hashes: (m.hashes ?? []).map(aB64), prueba: (m.prueba ?? []).map(aB64) };
    case "enj.canal":
      return { ...base, reg: m.reg };
  }
}
