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
/** Certificado de revocación pre-generado de la identidad actual (Adenda 115). */
const REVCERT_KEY = "starseed.mesh.revocation-cert.v1";

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

/** Nonce aleatorio de un solo uso (anti-replay). */
function randNonce(): string {
  try {
    const a = new Uint32Array(3);
    globalThis.crypto?.getRandomValues?.(a);
    if (a[0] || a[1] || a[2]) return a[0].toString(36) + a[1].toString(36) + a[2].toString(36);
  } catch {
    /* sin getRandomValues */
  }
  return "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Envuelve un contenido en un sobre FIRMADO v:2 (o el crudo si no hay firma).
 * v:2 firma `{b, ts, nonce}`: ata el contenido a un INSTANTE y a un USO ÚNICO,
 * para que un receptor pueda rechazar RE-INYECCIONES (replay) de contenido
 * firmado antiguo con un id/oid nuevo. Retrocompatible: unwrapSigned sigue
 * aceptando v:1 (firma solo sobre b) y v:0/plano.
 */
export async function wrapSigned(body: unknown): Promise<Record<string, unknown>> {
  const ts = Date.now();
  const nonce = randNonce();
  const sig = await signContent({ b: body ?? null, ts, nonce });
  if (!sig) return { v: 0, b: body ?? null };
  return { v: 2, b: body ?? null, ts, nonce, s: sig.s, k: sig.k, f: sig.f };
}

/**
 * Desenvuelve un sobre firmado → {body, verified, fp, ts?, nonce?}. Acepta v:2
 * (firma sobre {b,ts,nonce}), v:1 (firma sobre b) y crudo (verified=false). Los
 * campos ts/nonce (solo v:2) permiten al receptor aplicar la guarda anti-replay.
 */
export async function unwrapSigned(
  payload: unknown,
): Promise<{ body: unknown; verified: boolean; fp?: string; ts?: number; nonce?: string }> {
  const v = payload && typeof payload === "object" ? (payload as { v?: number }).v : undefined;
  if (v === 2 && payload && typeof payload === "object" && "b" in payload) {
    const p = payload as { b: unknown; ts?: number; nonce?: string; s?: string; k?: JsonWebKey; f?: string };
    let verified = false;
    if (p.s && p.k) {
      verified = await verifyContent({ b: p.b, ts: p.ts, nonce: p.nonce }, p.s, p.k);
      if (verified && p.f) verified = (await fpOf(p.k)) === p.f;
    }
    return { body: p.b, verified, fp: p.f, ts: typeof p.ts === "number" ? p.ts : undefined, nonce: p.nonce };
  }
  if (v === 1 && payload && typeof payload === "object" && "b" in payload) {
    const p = payload as { b: unknown; s?: string; k?: JsonWebKey; f?: string };
    let verified = false;
    if (p.s && p.k) {
      verified = await verifyContent(p.b, p.s, p.k);
      if (verified && p.f) verified = (await fpOf(p.k)) === p.f;
    }
    return { body: p.b, verified, fp: p.f };
  }
  if (v === 0 && payload && typeof payload === "object" && "b" in payload) {
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

/**
 * Certificado de revocación PRE-GENERADO de la identidad actual (Adenda 115): se
 * firma una vez al crear la identidad y se guarda. Permite que OTRA neurona de la
 * cuenta revoque este dispositivo aunque se pierda y ya no pueda firmar (autoridad
 * de cuenta) — como los certificados de revocación de PGP. Se regenera si la
 * huella cambió (rotación). Devuelve {fp, pub, sig} o null.
 */
export async function getRevocationCert(): Promise<{ fp: string; pub: JsonWebKey; sig: string } | null> {
  const id = await getIdentity();
  if (!id) return null;
  try {
    const raw = safeGet(REVCERT_KEY);
    if (raw) {
      const c = JSON.parse(raw) as { fp?: string; pub?: JsonWebKey; sig?: string };
      if (c?.fp === id.fp && c.pub && c.sig) return { fp: c.fp, pub: c.pub, sig: c.sig };
    }
  } catch {
    /* regenera abajo */
  }
  const cert = await signRevocation();
  if (!cert) return null;
  try { safeSet(REVCERT_KEY, JSON.stringify(cert)); } catch { /* */ }
  return cert;
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
