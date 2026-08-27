"use client";

/**
 * StarSeed OS — RED SINÁPTICA · CIFRADO POR-DESTINATARIO del relé (Adenda 124 · #mesh4).
 * ============================================================================
 * El relé compartido (relay-crypto.ts) cifra con un LLAVERO de cuenta: cualquiera
 * que tenga ese llavero (todas tus neuronas vinculadas) descifra. Eso basta para
 * SINCRONIZAR entre TUS dispositivos, pero NO es E2E dirigido: un mensaje privado
 * "solo para B" no debería poder abrirlo nadie más que B, ni siquiera otra neurona
 * de la misma cuenta que comparte el llavero.
 *
 * Aquí vive ese cifrado POR-DESTINATARIO (v:3), verdadero extremo a extremo:
 *
 *   ECDH P-256  →  HKDF-SHA256  →  AES-GCM-256
 *
 *   · Cada identidad tiene un par ECDH P-256 PROPIO y persistido (SEPARADO del par
 *     ECDSA de mesh-identity.ts: WebCrypto NO permite reutilizar una clave ECDSA
 *     para ECDH — son algoritmos distintos). La pública se PUBLICA firmada por la
 *     identidad soberana (ver mesh-identity.signIdentityClaim), la privada NUNCA sale.
 *   · Para cifrar a B: se genera un par ECDH EFÍMERO (uno por mensaje), se deriva un
 *     secreto compartido con la pública de B (deriveBits, 256 bits), del que HKDF saca
 *     una clave AES-GCM de un solo uso. El sobre lleva la pública EFÍMERA (`epk`);
 *     la privada efímera se descarta. Así cada mensaje tiene forward secrecy de emisor.
 *   · Para descifrar: B combina SU privada ECDH con la `epk` del sobre → mismo secreto
 *     → misma clave AES-GCM. Solo B (dueño de la privada) puede: quien solo tenga el
 *     llavero compartido NO abre un sobre v:3.
 *
 * KDF (documentado, fijo y con separación de dominio):
 *   · Curva: P-256 (ECDH).  Secreto compartido: 256 bits (deriveBits).
 *   · HKDF-SHA256 con SALT FIJO y INFO FIJA (etiqueta de dominio). El sobre NO
 *     transmite salt: no hace falta, porque el SECRETO de entrada (IKM) ya es único
 *     por mensaje (par efímero fresco) — un salt fijo con IKM variable sigue dando
 *     una clave distinta cada vez. La INFO ata la clave a ESTE uso ("recipient-v3").
 *   · AES-GCM-256, IV aleatorio de 12 bytes por mensaje (el tag de 128 bits autentica).
 *
 * IMPORTANTE (dirección de import): este módulo NO importa relay-crypto (evita ciclo).
 * Es relay-crypto quien importa de aquí para despachar los sobres v:3.
 *
 * SSR-safe y defensivo: sin `crypto.subtle` todo degrada a null. NUNCA lanza.
 */

import { safeGet, safeSet } from "@/lib/safe-storage";

/** Par ECDH P-256 de cifrado de esta identidad (JWK pública + privada). */
const ENC_KEY_LS = "starseed.mesh.enc-identity.v1";

/** SALT FIJO de HKDF (no secreto; separación de dominio). Ver cabecera. */
const HKDF_SALT = new TextEncoder().encode("starseed-mesh-recipient-salt-v3");
/** INFO FIJA de HKDF: etiqueta de propósito (ata la clave derivada a ESTE uso). */
const HKDF_INFO = new TextEncoder().encode("starseed-mesh-recipient-v3");

/**
 * Sobre cifrado POR-DESTINATARIO que viaja en la columna `payload` (jsonb) del relé.
 * Comparte los campos {iv,ct} con EncEnvelope para que los puntos de recepción que
 * detectan cifrado por presencia de iv/ct sigan enrutándolo sin cambios.
 */
export interface RecipientEnvelope {
  /** Esquema 3 = cifrado por-destinatario (ECDH→HKDF→AES-GCM). */
  v: 3;
  /** Vector de inicialización (base64, 12 B). */
  iv: string;
  /** Texto cifrado + tag GCM (base64). */
  ct: string;
  /** Clave pública EFÍMERA del emisor (JWK) para rederivar el secreto ECDH. */
  epk: JsonWebKey;
  /** PISTA opcional: huella de la clave de cifrado del destinatario (selección; no seguridad). */
  rfp?: string;
}

interface StoredEnc {
  pub: JsonWebKey;
  priv: JsonWebKey;
}

let cache: { pub: JsonWebKey; privKey: CryptoKey } | null = null;

function subtle(): SubtleCrypto | null {
  try {
    return globalThis.crypto?.subtle ?? null;
  } catch {
    return null;
  }
}

function toB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function fromB64(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64);
    const buf = new ArrayBuffer(bin.length);
    const out = new Uint8Array(buf);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** Importa una clave pública ECDH P-256 desde JWK (uso vacío: las públicas ECDH no llevan usos). */
async function importPub(jwk: JsonWebKey): Promise<CryptoKey | null> {
  const s = subtle();
  if (!s || !jwk) return null;
  try {
    return await s.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, false, []);
  } catch {
    return null;
  }
}

/**
 * Deriva la clave AES-GCM de un solo uso a partir del secreto ECDH compartido.
 * `myPriv` × `peerPub` → 256 bits → HKDF-SHA256(salt fijo, info fija) → AES-GCM-256.
 * Devuelve null ante cualquier fallo (nunca lanza).
 */
async function deriveAesKey(myPriv: CryptoKey, peerPub: CryptoKey): Promise<CryptoKey | null> {
  const s = subtle();
  if (!s) return null;
  try {
    const shared = await s.deriveBits({ name: "ECDH", public: peerPub }, myPriv, 256);
    const hkdf = await s.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
    return await s.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: HKDF_SALT as BufferSource, info: HKDF_INFO as BufferSource },
      hkdf,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } catch {
    return null;
  }
}

/**
 * Obtiene (o crea y persiste) el par ECDH P-256 de cifrado de esta identidad.
 * Si YA existe pero la carga FALLA (WebCrypto transitorio o almacenamiento corrupto)
 * devuelve null y NO regenera: sobrescribir la clave con una nueva perdería el acceso
 * a todo lo cifrado para la vieja de forma SILENCIOSA e irrecuperable (misma cautela
 * que master-identity.ts). El llamador puede reintentar. Null sin WebCrypto.
 */
export async function getOrCreateEncryptionKey(): Promise<{ pub: JsonWebKey; privKey: CryptoKey } | null> {
  if (cache) return cache;
  const s = subtle();
  if (!s) return null;
  const raw = safeGet(ENC_KEY_LS);
  if (raw) {
    // EXISTE: cargar. Ante fallo, null SIN regenerar (no pisar la identidad de cifrado).
    try {
      const st = JSON.parse(raw) as StoredEnc;
      if (st?.priv && st.pub) {
        const privKey = await s.importKey("jwk", st.priv, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
        cache = { pub: st.pub, privKey };
        return cache;
      }
    } catch {
      return null; // presente pero no cargable: NO regenerar encima
    }
    return null; // presente pero incompleto: NO regenerar encima
  }
  // NO hay clave: generar la primera.
  try {
    const kp = (await s.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
    const pub = await s.exportKey("jwk", kp.publicKey);
    const priv = await s.exportKey("jwk", kp.privateKey);
    try {
      safeSet(ENC_KEY_LS, JSON.stringify({ pub, priv } satisfies StoredEnc));
    } catch {
      /* sin persistencia: vive en memoria esta sesión */
    }
    cache = { pub, privKey: kp.privateKey };
    return cache;
  } catch {
    return null;
  }
}

/** Clave pública de cifrado ECDH (JWK) de esta identidad, para publicarla firmada. Null si no hay. */
export async function myEncryptionPublicKey(): Promise<JsonWebKey | null> {
  const id = await getOrCreateEncryptionKey();
  return id?.pub ?? null;
}

/** PISTA (no seguridad) de la clave de cifrado del destinatario: huella corta de la pública. */
async function encFp(pub: JsonWebKey): Promise<string> {
  const s = subtle();
  if (!s) return "";
  try {
    const data = new TextEncoder().encode(`${pub.x ?? ""}.${pub.y ?? ""}`);
    const h = await s.digest("SHA-256", data);
    return "enc:" + toB64(new Uint8Array(h)).replace(/[+/=]/g, "").slice(0, 18);
  } catch {
    return "";
  }
}

/**
 * Cifra `obj` PARA un destinatario dado su pública ECDH (`recipientPub`). Genera un
 * par EFÍMERO, deriva la clave (ECDH→HKDF→AES-GCM) y devuelve un sobre v:3 con la
 * pública efímera (`epk`). El destinatario es el ÚNICO que puede descifrar (tiene la
 * privada que casa con su pública). Null ante cualquier fallo. Nunca lanza.
 */
export async function encryptEnvelopeFor(recipientPub: JsonWebKey, obj: unknown): Promise<RecipientEnvelope | null> {
  const s = subtle();
  if (!s || !recipientPub) return null;
  try {
    const peer = await importPub(recipientPub);
    if (!peer) return null;
    // Par EFÍMERO por mensaje (extractable: hay que EXPORTAR su pública al sobre).
    const eph = (await s.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
    const aes = await deriveAesKey(eph.privateKey, peer);
    if (!aes) return null;
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode(JSON.stringify(obj ?? null));
    const ctBuf = await s.encrypt({ name: "AES-GCM", iv }, aes, data);
    const epk = await s.exportKey("jwk", eph.publicKey);
    const env: RecipientEnvelope = { v: 3, iv: toB64(iv), ct: toB64(new Uint8Array(ctBuf)), epk };
    const rfp = await encFp(recipientPub);
    if (rfp) env.rfp = rfp;
    return env;
  } catch {
    return null;
  }
}

/**
 * FAN-OUT v:3 (Adenda 127): cifra `obj` para VARIOS destinatarios devolviendo UN sobre
 * v:3 ESTÁNDAR por destinatario (reutiliza `encryptEnvelopeFor` en bucle). Cada sobre es
 * INDEPENDIENTE (par efímero y clave AES-GCM propios), así el lado receptor NO cambia:
 * cada destinatario abre EL SUYO y un NO-destinatario no abre ninguno. Un destinatario que
 * falle (sin `pub`, WebCrypto transitorio…) se OMITE con aviso — entrega parcial mejor que
 * abortar todo. La ruta de un solo destinatario (`encryptEnvelopeFor`) queda intacta. Nunca lanza.
 */
export async function encryptEnvelopeForMany(
  recipients: Array<{ pub: JsonWebKey; rfp?: string }>,
  obj: unknown,
): Promise<RecipientEnvelope[]> {
  const out: RecipientEnvelope[] = [];
  if (!Array.isArray(recipients)) return out;
  for (const r of recipients) {
    if (!r || !r.pub) continue;
    const env = await encryptEnvelopeFor(r.pub, obj);
    if (!env) {
      // Un destinatario que no cifra NO aborta el fan-out: se omite con aviso y el resto sigue.
      if (typeof console !== "undefined") {
        console.warn("[mesh] encryptEnvelopeForMany: destinatario omitido (cifrado v:3 falló)");
      }
      continue;
    }
    // Si el emisor aportó una PISTA `rfp` y `encFp` no la fijó, se conserva (solo
    // selección, no seguridad — el tag GCM es quien autentica el sobre).
    if (!env.rfp && r.rfp) env.rfp = r.rfp;
    out.push(env);
  }
  return out;
}

/**
 * Descifra un sobre v:3 con la privada ECDH de ESTA identidad y la `epk` del sobre.
 * Mismo secreto ECDH → misma clave HKDF → AES-GCM. Null ante cualquier fallo (tag
 * inválido = clave equivocada / manipulación, `epk` corrupta, sin clave propia…).
 * Nunca lanza. El `rfp` es solo pista: la seguridad la da el tag GCM, no ese campo.
 */
export async function decryptEnvelopeFor(env: RecipientEnvelope): Promise<unknown | null> {
  const s = subtle();
  if (!s || !env || env.v !== 3 || !env.epk || !env.iv || !env.ct) return null;
  try {
    const id = await getOrCreateEncryptionKey();
    if (!id) return null;
    const epk = await importPub(env.epk);
    if (!epk) return null;
    const aes = await deriveAesKey(id.privKey, epk);
    if (!aes) return null;
    const iv = fromB64(env.iv);
    const ct = fromB64(env.ct);
    if (!iv || !ct) return null;
    const plain = await s.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, aes, ct as BufferSource);
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    return null; // clave equivocada / manipulado → silencio honesto
  }
}

/** Reinicia el estado (memoria + almacenamiento). Solo para pruebas. */
export function _resetEncryptionKeys(): void {
  cache = null;
  try {
    safeSet(ENC_KEY_LS, "");
  } catch {
    /* */
  }
}
