"use client";

/**
 * StarSeed OS — IDENTIDAD FIRMADA de la neurona (Adenda 106).
 * ============================================================================
 * Par de claves ECDSA P-256 (WebCrypto) por neurona, persistido. Firma el
 * contenido PÚBLICO que emite y permite VERIFICAR en recepción que:
 *   · el contenido no fue manipulado (integridad), y
 *   · lo emitió quien controla esa identidad (autenticidad), cuya huella (fp)
 *     es el fingerprint de la clave pública.
 *
 * El relé PRIVADO ya va autenticado por AES-GCM (relay-crypto.ts); esta capa
 * añade autenticidad al feed público, donde el texto viaja en claro.
 *
 * Todo es best-effort y SSR-safe: si no hay WebCrypto, se degrada (sin firma /
 * verificación=false) y el sistema sigue funcionando. NUNCA lanza.
 */

import { safeGet, safeSet } from "@/lib/safe-storage";

const ID_KEY = "starseed.mesh.identity.v1";

interface StoredId {
  pub: JsonWebKey;
  priv: JsonWebKey;
  fp: string;
}

let cache: { pub: JsonWebKey; privKey: CryptoKey; fp: string } | null = null;

function subtle(): SubtleCrypto | null {
  try {
    return globalThis.crypto?.subtle ?? null;
  } catch {
    return null;
  }
}

function b64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(str: string): Uint8Array {
  const s = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Fingerprint estable de una clave pública JWK (identidad soberana). */
export async function fpOf(pub: JsonWebKey): Promise<string> {
  const s = subtle();
  if (!s) return "";
  try {
    const data = new TextEncoder().encode(`${pub.x ?? ""}.${pub.y ?? ""}`);
    const h = await s.digest("SHA-256", data);
    return "id:" + b64url(h).slice(0, 20);
  } catch {
    return "";
  }
}

/** Obtiene (o crea y persiste) la identidad de esta neurona. */
export async function getIdentity(): Promise<{ pub: JsonWebKey; privKey: CryptoKey; fp: string } | null> {
  if (cache) return cache;
  const s = subtle();
  if (!s) return null;
  try {
    const raw = safeGet(ID_KEY);
    if (raw) {
      const st = JSON.parse(raw) as StoredId;
      const privKey = await s.importKey("jwk", st.priv, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
      cache = { pub: st.pub, privKey, fp: st.fp };
      return cache;
    }
  } catch {
    /* clave corrupta: se regenera abajo */
  }
  try {
    const kp = (await s.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const pub = await s.exportKey("jwk", kp.publicKey);
    const priv = await s.exportKey("jwk", kp.privateKey);
    const fp = await fpOf(pub);
    try {
      safeSet(ID_KEY, JSON.stringify({ pub, priv, fp }));
    } catch {
      /* */
    }
    cache = { pub, privKey: kp.privateKey, fp };
    return cache;
  } catch {
    return null;
  }
}

/** Fingerprint de esta neurona (identidad verificable). */
export async function myFingerprint(): Promise<string | null> {
  const id = await getIdentity();
  return id?.fp ?? null;
}

/** Firma un contenido: devuelve {s:firma, k:clave pública, f:fingerprint}. */
export async function signContent(body: unknown): Promise<{ s: string; k: JsonWebKey; f: string } | null> {
  const id = await getIdentity();
  const sub = subtle();
  if (!id || !sub) return null;
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(body ?? null));
    const sig = await sub.sign({ name: "ECDSA", hash: "SHA-256" }, id.privKey, bytes);
    return { s: b64url(sig), k: id.pub, f: id.fp };
  } catch {
    return null;
  }
}

/** Verifica que `sig` sobre `body` corresponde a la clave pública `pub`. */
export async function verifyContent(body: unknown, sigB64: string, pub: JsonWebKey): Promise<boolean> {
  const sub = subtle();
  if (!sub) return false;
  try {
    const key = await sub.importKey("jwk", pub, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const bytes = new TextEncoder().encode(JSON.stringify(body ?? null));
    const sig = fromB64url(sigB64);
    return await sub.verify({ name: "ECDSA", hash: "SHA-256" }, key, sig as BufferSource, bytes as BufferSource);
  } catch {
    return false;
  }
}

/** Envuelve un contenido en un sobre FIRMADO (o el crudo si no hay firma). */
export async function wrapSigned(body: unknown): Promise<Record<string, unknown>> {
  const sig = await signContent(body);
  if (!sig) return { v: 0, b: body ?? null };
  return { v: 1, b: body ?? null, s: sig.s, k: sig.k, f: sig.f };
}

/** Desenvuelve un sobre firmado → {body, verified, fp}. Acepta crudo (verified=false). */
export async function unwrapSigned(payload: unknown): Promise<{ body: unknown; verified: boolean; fp?: string }> {
  if (payload && typeof payload === "object" && (payload as { v?: number }).v === 1 && "b" in payload) {
    const p = payload as { b: unknown; s?: string; k?: JsonWebKey; f?: string };
    let verified = false;
    if (p.s && p.k) {
      verified = await verifyContent(p.b, p.s, p.k);
      if (verified && p.f) verified = (await fpOf(p.k)) === p.f;
    }
    return { body: p.b, verified, fp: p.f };
  }
  if (payload && typeof payload === "object" && (payload as { v?: number }).v === 0 && "b" in payload) {
    return { body: (payload as { b: unknown }).b, verified: false };
  }
  return { body: payload, verified: false };
}

/* ── Revocación de identidad (Adenda 108) ──────────────────────────────────────
 * Una identidad firma su PROPIA "acta de revocación" (como un certificado de
 * revocación PGP): la firma sobre {revoke:<fp>} solo la puede producir quien
 * controla la clave de <fp>, así la revocación es AUTO-AUTENTICABLE — cualquier
 * receptor la verifica sin confiar en el transporte. Al revocar se rota a una
 * clave nueva; el contenido firmado con la clave vieja deja de ser de fiar.
 * ---------------------------------------------------------------------------- */

/** Firma el acta de revocación de la identidad ACTUAL → {fp, pub, sig}. */
export async function signRevocation(): Promise<{ fp: string; pub: JsonWebKey; sig: string } | null> {
  const id = await getIdentity();
  if (!id) return null;
  const sig = await signContent({ revoke: id.fp });
  if (!sig) return null;
  return { fp: sig.f, pub: sig.k, sig: sig.s };
}

/** Verifica un acta de revocación: firma válida sobre {revoke:fp} por la clave cuya huella ES fp. */
export async function verifyRevocation(fp: string, sigB64: string, pub: JsonWebKey): Promise<boolean> {
  if (!fp || !sigB64 || !pub) return false;
  try {
    if (!(await verifyContent({ revoke: fp }, sigB64, pub))) return false;
    return (await fpOf(pub)) === fp; // la firma debe venir de la propia clave revocada
  } catch {
    return false;
  }
}

/** Rota a una identidad NUEVA (genera y persiste un par nuevo). Devuelve la nueva huella. */
export async function regenerateIdentity(): Promise<{ fp: string } | null> {
  const s = subtle();
  if (!s) return null;
  try {
    const kp = (await s.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const pub = await s.exportKey("jwk", kp.publicKey);
    const priv = await s.exportKey("jwk", kp.privateKey);
    const fp = await fpOf(pub);
    try {
      safeSet(ID_KEY, JSON.stringify({ pub, priv, fp }));
    } catch {
      /* */
    }
    cache = { pub, privKey: kp.privateKey, fp };
    return { fp };
  } catch {
    return null;
  }
}
