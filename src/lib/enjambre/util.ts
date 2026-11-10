/**
 * util — utilidades puras del Enjambre de datos (ENJ1110A · 2026-11-10).
 * Contrato: `architecture/enjambre-datos.md`. Solo WebCrypto: sin red, sin DOM, sin dependencias.
 */

const ENC = new TextEncoder();

/** WebCrypto o error claro: el Enjambre no tiene sentido sin SHA-256. */
export function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error("enjambre: sin WebCrypto");
  return s;
}

export function aBytes(texto: string): Uint8Array {
  return ENC.encode(texto);
}

export function concatenar(partes: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of partes) total += p.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of partes) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export async function sha256(...partes: Uint8Array[]): Promise<Uint8Array> {
  const d = partes.length === 1 ? partes[0] : concatenar(partes);
  return new Uint8Array(await subtle().digest("SHA-256", d as BufferSource));
}

export async function hmacSha256(clave: Uint8Array, mensaje: Uint8Array): Promise<Uint8Array> {
  const k = await subtle().importKey("raw", clave as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await subtle().sign("HMAC", k, mensaje as BufferSource));
}

export function aHex(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += (b[i] < 16 ? "0" : "") + b[i].toString(16);
  return s;
}

/** Hex estricto (solo 0-9a-fA-F, longitud par). Null si no vale. */
export function deHex(s: string): Uint8Array | null {
  if (typeof s !== "string" || s.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(s)) return null;
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function aB64(b: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...Array.from(b.subarray(i, Math.min(b.length, i + 0x8000))));
  return btoa(bin);
}

/** Base64 estricto (alfabeto estándar con relleno). Null si no vale. */
export function deB64(s: string): Uint8Array | null {
  if (typeof s !== "string" || s.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) return null;
  try {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export function igualesBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

export function esObjeto(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Entero seguro dentro de [min, max], o null. */
export function entero(x: unknown, min: number, max: number): number | null {
  return typeof x === "number" && Number.isSafeInteger(x) && x >= min && x <= max ? x : null;
}

export const RE_HEX64 = /^[0-9a-f]{64}$/;

/** Hex de 64 caracteres (32 bytes), normalizado a minúsculas, o null. */
export function hex64(x: unknown): string | null {
  if (typeof x !== "string" || x.length !== 64) return null;
  const m = x.toLowerCase();
  return RE_HEX64.test(m) ? m : null;
}

/** Generador pseudoaleatorio determinista (mulberry32): desempates reproducibles, nunca criptografía. */
export function crearAzar(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash rápido de texto a entero de 32 bits (FNV-1a), para desempates. */
export function hashTexto32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function potenciaDeDos(n: number): boolean {
  return Number.isInteger(n) && n > 0 && n <= 0x40000000 && (n & (n - 1)) === 0;
}

export function log2Entero(n: number): number {
  let k = 0;
  while (2 ** (k + 1) <= n) k++;
  return k;
}
