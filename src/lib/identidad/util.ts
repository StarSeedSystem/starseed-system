/**
 * (IDN1108A) Utilidades criptográficas mínimas de la identidad de cuenta sin servidor.
 * Contrato: architecture/red-sin-dependencias.md §5.1 y architecture/identidad-soberana-portatil.md.
 * Todo degrada a null/false sin lanzar; sin WebCrypto no hay identidad (honestidad radical).
 */

export function subtle(): SubtleCrypto | null {
  try {
    return globalThis.crypto?.subtle ?? null;
  } catch {
    return null;
  }
}

export function aB64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function deB64url(str: string): Uint8Array {
  const s = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s + pad);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** JSON canónico: claves ordenadas a cualquier profundidad, sin `undefined`. Estable entre módulos. */
export function canonico(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return "[" + v.map((x) => canonico(x)).join(",") + "]";
  const o = v as Record<string, unknown>;
  const claves = Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort();
  return "{" + claves.map((k) => JSON.stringify(k) + ":" + canonico(o[k])).join(",") + "}";
}

export function bytesDe(texto: string): Uint8Array {
  const u = new TextEncoder().encode(texto);
  const out = new Uint8Array(new ArrayBuffer(u.length));
  out.set(u);
  return out;
}

export async function sha256(texto: string): Promise<Uint8Array | null> {
  const s = subtle();
  if (!s) return null;
  try {
    return new Uint8Array(await s.digest("SHA-256", bytesDe(texto) as BufferSource));
  } catch {
    return null;
  }
}

export function aleatorio(n: number): string {
  const a = new Uint8Array(n);
  globalThis.crypto.getRandomValues(a);
  return aB64url(a);
}

/** Verifica una firma ECDSA P-256/SHA-256 de `mensaje` (texto canónico) con una clave pública JWK. */
export async function verificarFirma(pub: JsonWebKey, firma: string, mensaje: string): Promise<boolean> {
  const s = subtle();
  if (!s || !pub || !firma) return false;
  try {
    const k = await s.importKey("jwk", pub, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    return await s.verify({ name: "ECDSA", hash: "SHA-256" }, k, deB64url(firma) as BufferSource, bytesDe(mensaje) as BufferSource);
  } catch {
    return false;
  }
}

/** Firma `mensaje` (texto canónico) con una clave privada; devuelve la firma en base64url. */
export async function firmarTexto(priv: CryptoKey, mensaje: string): Promise<string | null> {
  const s = subtle();
  if (!s) return null;
  try {
    return aB64url(await s.sign({ name: "ECDSA", hash: "SHA-256" }, priv, bytesDe(mensaje) as BufferSource));
  } catch {
    return null;
  }
}

/** Huella de una clave pública de CUENTA (misma fórmula que `fpOfMaster`: `acct:` + 20). */
export async function huellaMaestra(pub: JsonWebKey): Promise<string> {
  const h = await sha256(`${pub?.x ?? ""}.${pub?.y ?? ""}`);
  return h ? "acct:" + aB64url(h).slice(0, 20) : "";
}

/** Huella de una clave pública de APARATO (misma fórmula que `mesh-identity.fpOf`: `id:` + 20). */
export async function huellaAparato(pub: JsonWebKey): Promise<string> {
  const h = await sha256(`${pub?.x ?? ""}.${pub?.y ?? ""}`);
  return h ? "id:" + aB64url(h).slice(0, 20) : "";
}

export function pubLimpia(p: JsonWebKey | undefined | null): JsonWebKey | null {
  if (!p || p.kty !== "EC" || p.crv !== "P-256" || typeof p.x !== "string" || typeof p.y !== "string") return null;
  return { kty: "EC", crv: "P-256", x: p.x, y: p.y };
}
