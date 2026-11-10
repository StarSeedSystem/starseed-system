/**
 * puerta/binario — trama binaria del túnel (PTA1110A · 2026-11-10).
 * Contrato: `architecture/red-sin-dependencias.md` §5.3.
 *
 * El JSON con base64 de las tramas `dat` cuesta un tercio del enlace (más el sobre de cada mensaje). Si el transporte
 * lleva bytes crudos (el canal rápido L2CAP, TCP), los trozos del túnel viajan así:
 *
 *   byte 0      tipo: 1 = datos, 2 = acuse acumulado
 *   byte 1      longitud L del id de túnel (1..40)
 *   L bytes     id de túnel (ASCII)
 *   4 bytes     n (uint32, big endian): número de trozo (datos) o último trozo recibido (acuse)
 *   resto       carga (solo en datos)
 *
 * Son 7 + L bytes de cabecera por trozo (≈ 23) frente a ≈ 60 del JSON más el 33 % de base64. Se negocia por túnel en
 * `abrir`/`ok` (`f: ["bin"]`); un par antiguo no contesta `f` y se sigue con JSON. Puro: sin red ni DOM.
 */

export const BIN_DATOS = 1;
export const BIN_ACUSE = 2;
export const MAX_ID_BIN = 40;

export type TramaBin = { tipo: typeof BIN_DATOS; s: string; n: number; b: Uint8Array } | { tipo: typeof BIN_ACUSE; s: string; n: number };

const enc = new TextEncoder();
const dec = new TextDecoder("ascii");

export function codificarBin(t: TramaBin): Uint8Array {
  const id = enc.encode(t.s);
  if (!id.length || id.length > MAX_ID_BIN) throw new Error("id-no-valido");
  const carga = t.tipo === BIN_DATOS ? t.b : new Uint8Array(0);
  const o = new Uint8Array(6 + id.length + carga.length);
  o[0] = t.tipo;
  o[1] = id.length;
  o.set(id, 2);
  const dv = new DataView(o.buffer);
  dv.setUint32(2 + id.length, t.n >>> 0, false);
  o.set(carga, 6 + id.length);
  return o;
}

/** Null si la trama no es válida. Nunca lanza. */
export function decodificarBin(b: Uint8Array): TramaBin | null {
  if (!(b instanceof Uint8Array) || b.length < 8) return null;
  const tipo = b[0];
  const l = b[1];
  if ((tipo !== BIN_DATOS && tipo !== BIN_ACUSE) || l < 1 || l > MAX_ID_BIN || b.length < 6 + l) return null;
  const s = dec.decode(b.subarray(2, 2 + l));
  if (!/^[\w-]{1,40}$/.test(s)) return null;
  const n = new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(2 + l, false);
  if (tipo === BIN_ACUSE) return b.length === 6 + l ? { tipo, s, n } : null;
  return { tipo, s, n, b: b.subarray(6 + l) };
}
