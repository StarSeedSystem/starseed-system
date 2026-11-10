/**
 * firmas — ganchos de firma del Enjambre (ENJ1110A · 2026-11-10).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * El motor NO conoce `mesh-identity` ni los certificados de cuenta: recibe una función que firma bytes y otra
 * que los verifica (ENJ1110B enchufa `signContent`/`verifyContent` y `verificarCertificadoNeurona`).
 * Aquí van además las implementaciones ECDSA P-256 / SHA-256 con WebCrypto que usan las pruebas y que sirven
 * de respaldo: la firma es la P1363 cruda (64 bytes) en base64, como la que produce WebCrypto.
 */

import { aB64, aBytes, aHex, deB64, esObjeto, sha256, subtle } from "./util";

/** Quién firma y cómo se comprueba: huella, firma y, si hace falta, la clave pública y el certificado de cuenta. */
export interface FirmaEnj {
  /** Huella del firmante (la de su clave de aparato). */
  fp: string;
  /** Firma en base64. */
  sig: string;
  /** Clave pública del aparato (JWK). */
  pub?: JsonWebKey;
  /** Certificado de la neurona emitido por la cuenta (opaco para el motor; lo valida el verificador inyectado). */
  cert?: unknown;
}

export type FirmarBytes = (cuerpo: Uint8Array) => Promise<FirmaEnj | null>;
export type VerificarBytes = (cuerpo: Uint8Array, firma: FirmaEnj) => Promise<boolean>;

const MAX_JWK = 1024;

/** Saneado de una firma que llega de fuera. Null si no vale. */
export function leerFirma(x: unknown): FirmaEnj | null {
  if (!esObjeto(x)) return null;
  const { fp, sig, pub, cert } = x;
  if (typeof fp !== "string" || fp.length < 4 || fp.length > 128 || !/^[A-Za-z0-9:_.\-]+$/.test(fp)) return null;
  if (typeof sig !== "string" || sig.length < 8 || sig.length > 512 || deB64(sig) === null) return null;
  const out: FirmaEnj = { fp, sig };
  if (pub !== undefined) {
    if (!esObjeto(pub) || JSON.stringify(pub).length > MAX_JWK) return null;
    out.pub = pub as JsonWebKey;
  }
  if (cert !== undefined) {
    if (JSON.stringify(cert ?? null).length > 4096) return null;
    out.cert = cert;
  }
  return out;
}

/** Huella de una clave pública ECDSA P-256: «id:» + 32 hex del SHA-256 de su forma canónica. */
export async function huellaDeClave(pub: JsonWebKey): Promise<string> {
  const canon = JSON.stringify({ crv: pub.crv, kty: pub.kty, x: pub.x, y: pub.y });
  return "id:" + aHex(await sha256(aBytes(canon))).slice(0, 32);
}

export interface ParFirma {
  pub: JsonWebKey;
  priv: CryptoKey;
}

export async function generarParFirma(): Promise<ParFirma> {
  const k = await subtle().generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pub = (await subtle().exportKey("jwk", k.publicKey)) as JsonWebKey;
  return { pub: { crv: pub.crv, kty: pub.kty, x: pub.x, y: pub.y }, priv: k.privateKey };
}

export function crearFirmante(par: ParFirma, cert?: unknown): FirmarBytes {
  return async (cuerpo) => {
    try {
      const sig = new Uint8Array(await subtle().sign({ name: "ECDSA", hash: "SHA-256" }, par.priv, cuerpo as BufferSource));
      const out: FirmaEnj = { fp: await huellaDeClave(par.pub), sig: aB64(sig), pub: par.pub };
      if (cert !== undefined) out.cert = cert;
      return out;
    } catch {
      return null;
    }
  };
}

export interface OpcionesVerificador {
  /** ¿Se acepta a este firmante? (lista de editores de confianza, cuenta propia…). Por defecto, cualquiera. */
  aceptarFp?: (fp: string) => boolean;
  /** Validación del certificado de cuenta (ENJ1110B: `verificarCertificadoNeurona`). */
  verificarCert?: (cert: unknown, pub: JsonWebKey, fp: string) => Promise<boolean>;
  /** Si es true, la firma debe traer certificado. */
  exigirCert?: boolean;
}

/**
 * Verificador ECDSA: la huella tiene que ser la de la clave que viene en la firma, la firma tiene que casar y,
 * si se configura, el firmante tiene que estar aceptado y su certificado tiene que valer. Nunca lanza.
 */
export function crearVerificador(o: OpcionesVerificador = {}): VerificarBytes {
  return async (cuerpo, f) => {
    try {
      if (!f.pub || f.pub.kty !== "EC" || f.pub.crv !== "P-256") return false;
      if ((await huellaDeClave(f.pub)) !== f.fp) return false;
      if (o.aceptarFp && !o.aceptarFp(f.fp)) return false;
      const sig = deB64(f.sig);
      if (!sig || sig.length !== 64) return false;
      const k = await subtle().importKey("jwk", f.pub, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
      const ok = await subtle().verify({ name: "ECDSA", hash: "SHA-256" }, k, sig as BufferSource, cuerpo as BufferSource);
      if (!ok) return false;
      if (o.exigirCert && f.cert === undefined) return false;
      if (f.cert !== undefined && o.verificarCert) return await o.verificarCert(f.cert, f.pub, f.fp);
      return true;
    } catch {
      return false;
    }
  };
}

/** JSON con las claves en el orden dado: la base de todo cuerpo firmable (determinista, sin depender del motor). */
export function jsonCanonico(obj: Record<string, unknown>, orden: readonly string[]): string {
  const o: Record<string, unknown> = {};
  for (const k of orden) if (obj[k] !== undefined) o[k] = obj[k];
  return JSON.stringify(o);
}
