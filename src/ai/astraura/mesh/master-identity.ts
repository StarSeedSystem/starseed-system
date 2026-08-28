"use client";

/**
 * StarSeed OS — IDENTIDAD SOBERANA PORTÁTIL · CLAVE MAESTRA DE CUENTA (Adenda 121).
 * ============================================================================
 * La invariante §6 exige una identidad SOBERANA y PORTÁTIL. Hasta ahora cada
 * neurona tenía su propia identidad ECDSA independiente (`mesh-identity.ts`),
 * ligada a la cuenta solo por el uuid de Supabase — algo que cualquier dispositivo
 * podía reclamar. Aquí vive la CLAVE MAESTRA de la cuenta:
 *
 *   · Un par ECDSA P-256 de la CUENTA (huella `acct:…`), estable e independiente
 *     de cualquier dispositivo. Es la raíz de confianza soberana.
 *   · La maestra CERTIFICA cada subclave de dispositivo: firma `{deviceFp,account,iat}`.
 *     Un receptor verifica que un dispositivo es una subclave LEGÍTIMA de la cuenta
 *     comprobando ese certificado — cierra la suplantación de "reclamar una cuenta".
 *   · PORTABILIDAD: la maestra se EXPORTA cifrada con una passphrase (PBKDF2 →
 *     AES-GCM) y se IMPORTA en otra neurona. Así mueves tu identidad soberana entre
 *     dispositivos sin que la clave privada viaje jamás en claro.
 *
 * HONESTIDAD RADICAL: la maestra vive SOLO en tus neuronas (safe-storage), nunca se
 * sube. Para tener la MISMA identidad de cuenta en varias neuronas hay que exportar/
 * importar (la UI lo dirá). SSR-safe y defensivo: sin WebCrypto degrada a null.
 * NUNCA lanza.
 */

import { safeGet, safeSet } from "@/lib/safe-storage";

const MASTER_KEY_LS = "starseed.mesh.master-identity.v1"; // { pub, priv, fp }
/** Iteraciones PBKDF2 para derivar la clave de envoltura desde la passphrase. */
const KDF_ITERS = 600000; // PBKDF2-SHA256 (OWASP 2023 ≥600k: el blob es offline-crackable)
/** Longitud mínima de passphrase (se aplica en export E import). */
const MIN_PASSPHRASE = 12;
/** Cota de iteraciones aceptadas al IMPORTAR (anti-DoS: un blob hostil no dispara un PBKDF2 gigante). */
const KDF_ITERS_MIN = 100000;
const KDF_ITERS_MAX = 1000000;

/**
 * CADUCIDAD del certificado de dispositivo (seguimiento adversarial Adenda 126). `verifyDeviceCert`
 * FIRMABA `iat` pero nunca lo comprobaba: un cert publicado hace mucho podía re-inyectarse (replay)
 * indefinidamente. `registerIdentity` RE-FIRMA el cert en cada arranque (certs frescos son baratos),
 * así que esta cota apenas estorba al uso normal y sobre todo ACOTA el replay de certs muy viejos.
 * Un `iat` ausente/0/no-finito NO se rechaza (retrocompat con certs previos al sellado de tiempo).
 */
const MAX_DEVICE_CERT_AGE_MS = 180 * 24 * 60 * 60_000; // 180 días
/**
 * Tolerancia de reloj hacia el FUTURO: relojes desincronizados adelantan unos instantes el `iat`;
 * eso NO se penaliza. Pero un `iat` muy por delante (cert forjado con fecha adelantada para eludir
 * la caducidad) sí se rechaza.
 */
const DEVICE_CERT_FUTURE_SKEW_MS = 24 * 60 * 60_000; // 24 h

interface StoredMaster {
  pub: JsonWebKey;
  priv: JsonWebKey;
  fp: string;
}

/** Blob portátil cifrado de la clave maestra. El material público NO es secreto. */
export interface MasterBlob {
  v: 2;
  kdf: "PBKDF2-SHA256";
  iters: number;
  salt: string; // base64url
  iv: string; // base64url
  ct: string; // base64url (JWK privado cifrado)
  mfp: string;
  mpub: JsonWebKey;
}

/** Certificado que liga una subclave de dispositivo a la cuenta (firmado por la maestra). */
export interface DeviceCert {
  mfp: string; // huella de la maestra
  mpub: JsonWebKey; // clave pública de la maestra (para verificar sin registro previo)
  deviceFp: string; // huella de la identidad del dispositivo (id:…)
  account: string; // uuid de la cuenta
  /**
   * Id del dispositivo de RELÉ (federation.deviceId()) — Adenda 126. Es un namespace
   * DISTINTO de `deviceFp` (huella de la identidad soberana), por eso el cert debe
   * atarlo aparte para poder avalar el direccionamiento v:3 por-dispositivo. OPCIONAL
   * por retrocompatibilidad: los certs de la Adenda 121 no lo llevan.
   */
  relayDeviceId?: string;
  iat: number; // emitido en (epoch ms)
  sig: string; // firma de la maestra sobre {deviceFp,account,iat} (o {…,relayDeviceId,iat} si ata el relé)
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
  const buf = new ArrayBuffer(bin.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Huella estable de una clave pública maestra (prefijo `acct:` para no confundir con `id:`). */
export async function fpOfMaster(pub: JsonWebKey): Promise<string> {
  const s = subtle();
  if (!s) return "";
  try {
    const data = new TextEncoder().encode(`${pub.x ?? ""}.${pub.y ?? ""}`);
    const h = await s.digest("SHA-256", data);
    return "acct:" + b64url(h).slice(0, 20);
  } catch {
    return "";
  }
}

function persist(pub: JsonWebKey, priv: JsonWebKey, fp: string): void {
  try {
    safeSet(MASTER_KEY_LS, JSON.stringify({ pub, priv, fp } satisfies StoredMaster));
  } catch {
    /* sin persistencia: vive en memoria esta sesión */
  }
}

/** Obtiene (o crea y persiste) la clave maestra de la cuenta. Null sin WebCrypto. */
export async function getOrCreateMasterKey(): Promise<{ pub: JsonWebKey; privKey: CryptoKey; fp: string } | null> {
  if (cache) return cache;
  const s = subtle();
  if (!s) return null;
  const raw = safeGet(MASTER_KEY_LS);
  if (raw) {
    // EXISTE una maestra: cargarla. Si la carga FALLA (WebCrypto transitorio o
    // storage parcialmente corrupto) devolvemos null y NO regeneramos: sobrescribir
    // la raíz soberana con una clave nueva sería una pérdida de identidad silenciosa
    // e irrecuperable. El llamador puede reintentar.
    try {
      const st = JSON.parse(raw) as StoredMaster;
      if (st?.priv && st.pub && st.fp) {
        const privKey = await s.importKey("jwk", st.priv, { name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
        cache = { pub: st.pub, privKey, fp: st.fp };
        return cache;
      }
    } catch {
      return null; // presente pero no cargable: NO regenerar encima
    }
    return null; // presente pero incompleto: NO regenerar encima
  }
  // NO hay maestra: generar la primera.
  try {
    const kp = (await s.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const pub = await s.exportKey("jwk", kp.publicKey);
    const priv = await s.exportKey("jwk", kp.privateKey);
    const fp = await fpOfMaster(pub);
    persist(pub, priv, fp);
    cache = { pub, privKey: kp.privateKey, fp };
    return cache;
  } catch {
    return null;
  }
}

/** Huella de la clave maestra de la cuenta (o null). */
export async function masterFingerprint(): Promise<string | null> {
  const m = await getOrCreateMasterKey();
  return m?.fp ?? null;
}

/** ¿Hay clave maestra en esta neurona? */
export function hasMasterKey(): boolean {
  try {
    const raw = safeGet(MASTER_KEY_LS);
    if (!raw) return false;
    const st = JSON.parse(raw) as StoredMaster;
    return !!(st?.priv && st.pub && st.fp);
  } catch {
    return false;
  }
}

/** Mensaje canónico que firma/verifica un certificado de dispositivo (orden fijo).
 *  Retrocompatible: SIN `relayDeviceId` firma la forma histórica {deviceFp,account,iat}
 *  (Adenda 121); CON él ata además el id de dispositivo de relé →
 *  {deviceFp,account,relayDeviceId,iat} (Adenda 126). El orden de claves es FIJO (el
 *  literal preserva el orden de inserción), así que un `relayDeviceId` INYECTADO en un
 *  cert viejo produce un mensaje DISTINTO y su firma deja de validar.
 *  Devuelve un buffer respaldado por ArrayBuffer (BufferSource para WebCrypto). */
function certMessage(deviceFp: string, account: string, iat: number, relayDeviceId?: string): Uint8Array {
  const canonical = relayDeviceId
    ? { deviceFp, account, relayDeviceId, iat }
    : { deviceFp, account, iat };
  const u = new TextEncoder().encode(JSON.stringify(canonical));
  const buf = new ArrayBuffer(u.length);
  const out = new Uint8Array(buf);
  out.set(u);
  return out;
}

/**
 * La maestra CERTIFICA una subclave de dispositivo. Firma {deviceFp,account,iat} y, si
 * se pasa `relayDeviceId` (Adenda 126), ATA además el id de dispositivo de RELÉ
 * (federation.deviceId(), un namespace DISTINTO de `deviceFp`) → firma
 * {deviceFp,account,relayDeviceId,iat}. Esa atadura es lo que permite a un receptor
 * confiar en el direccionamiento v:3 POR-DISPOSITIVO sin la substitución de clave del
 * CRÍTICO de la Adenda 125. `relayDeviceId` es OPCIONAL por retrocompatibilidad.
 */
export async function signDeviceCert(deviceFp: string, account: string, relayDeviceId?: string): Promise<DeviceCert | null> {
  const s = subtle();
  const m = await getOrCreateMasterKey();
  if (!s || !m || !deviceFp || !account) return null;
  try {
    const iat = Date.now();
    const sig = await s.sign({ name: "ECDSA", hash: "SHA-256" }, m.privKey, certMessage(deviceFp, account, iat, relayDeviceId));
    const cert: DeviceCert = { mfp: m.fp, mpub: m.pub, deviceFp, account, iat, sig: b64url(sig) };
    if (relayDeviceId) cert.relayDeviceId = relayDeviceId; // solo si se ató (retrocompat)
    return cert;
  } catch {
    return null;
  }
}

/**
 * Verifica un certificado de dispositivo CONTRA la maestra ESPERADA de la cuenta
 * (`expectedMfp`, fijada out-of-band: TOFU/pin o registro account→mfp). Comprueba que
 * `cert.mfp === expectedMfp`, que `mfp` es la huella de `mpub`, y que la firma valida
 * sobre el mensaje canónico ({deviceFp,account,iat}, o {deviceFp,account,relayDeviceId,iat}
 * si el cert ata un id de relé · Adenda 126). Solo así el aval significa algo: sin la ancla de
 * confianza, cualquiera genera SU maestra y firma un cert que "reclama" una cuenta ajena.
 * CADUCIDAD: se rechaza un `iat` rancio o en el futuro implausible (ver más abajo). REVOCACIÓN
 * EXPLÍCITA (opcional, ADITIVA): si el llamador pasa `opts.isCertRevoked`, tras superar TODAS las
 * comprobaciones criptográficas se calcula el id de DISPOSITIVO estable del cert (`deviceCertId`:
 * relayDeviceId/deviceFp) y, si ese dispositivo está revocado, se rechaza — así se RETIRA el cert de
 * un dispositivo CONCRETO (aunque re-emita) sin tocar la identidad soberana ni la maestra. SIN `opts` el comportamiento es EXACTAMENTE
 * el histórico (retrocompat total). La revocación de la IDENTIDAD del dispositivo la sigue cruzando
 * el llamador aparte con la lista de revocación de identidad (`isRevoked(deviceFp)`).
 */
export async function verifyDeviceCert(
  cert: DeviceCert,
  expectedMfp: string,
  opts?: { isCertRevoked?: (certId: string) => boolean },
): Promise<boolean> {
  const s = subtle();
  if (!s || !cert || !cert.mpub || !cert.sig || !cert.deviceFp || !cert.account || !cert.mfp) return false;
  if (!expectedMfp || cert.mfp !== expectedMfp) return false; // ANCLA DE CONFIANZA imprescindible
  // CADUCIDAD (seguimiento adversarial Adenda 126): si el cert lleva un `iat` positivo y finito, se
  // rechaza si es DEMASIADO VIEJO (replay de un cert publicado hace mucho) o si cae en el FUTURO
  // más allá de la tolerancia de reloj (fecha adelantada). Un `iat` ausente/0/no-finito NO se
  // rechaza (retrocompat con certs de la Adenda 121 sin sellado fiable): en ese caso vale solo por
  // ancla + firma, como antes. `iat` va DENTRO del mensaje firmado, así que no se puede alterar sin
  // romper la firma; esta cota solo ataja el REPLAY de un cert genuinamente antiguo. Aritmética
  // pura (no lanza), por eso va fuera del try, tras la ancla y ANTES de la firma (fail-fast).
  const iat = cert.iat;
  if (typeof iat === "number" && Number.isFinite(iat) && iat > 0) {
    const now = Date.now();
    if (iat < now - MAX_DEVICE_CERT_AGE_MS) return false; // cert rancio (caducado)
    if (iat > now + DEVICE_CERT_FUTURE_SKEW_MS) return false; // cert en el futuro implausible
  }
  try {
    if ((await fpOfMaster(cert.mpub)) !== cert.mfp) return false; // mfp debe ser la huella de mpub
    const key = await s.importKey("jwk", cert.mpub, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const sig = fromB64url(cert.sig) as BufferSource;
    // Si el cert ATA un `relayDeviceId` se verifica sobre el mensaje EXTENDIDO
    // {deviceFp,account,relayDeviceId,iat}; los certs viejos (sin ese campo) siguen
    // verificando sobre {deviceFp,account,iat}. Un `relayDeviceId` INYECTADO a posteriori
    // en un cert viejo cambia el mensaje y la firma NO valida (retrocompat segura).
    const sigOk = await s.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      sig,
      certMessage(cert.deviceFp, cert.account, cert.iat, cert.relayDeviceId) as BufferSource,
    );
    if (!sigOk) return false;
    // REVOCACIÓN EXPLÍCITA (aditiva · retrocompat): tras superar TODAS las comprobaciones
    // criptográficas de arriba, si el llamador aporta el predicado y el id de DISPOSITIVO estable de
    // este cert (relayDeviceId/deviceFp) está revocado, se rechaza. Sin `opts` NO se ejecuta nada de
    // esto, así que el comportamiento por defecto es EXACTAMENTE el histórico.
    if (opts?.isCertRevoked) {
      const id = await deviceCertId(cert);
      if (id && opts.isCertRevoked(id) === true) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/* ── REVOCACIÓN EXPLÍCITA de un cert de dispositivo CONCRETO (almacén CRL en device-revocation.ts) ──
 * Complementa la CADUCIDAD por `iat`: permite RETIRAR una emisión concreta de device-cert SIN
 * revocar la identidad soberana del dispositivo ni la maestra. El `certId` es el id de DISPOSITIVO
 * estable (relayDeviceId/deviceFp), NO la firma: así la revocación PERSISTE aunque el dispositivo
 * RE-EMITA su cert en el próximo arranque (revisión adversarial Adenda 128). El acta es
 * AUTO-AUTENTICABLE: solo la maestra que emitió el cert puede firmar su revocación (Adenda 122).
 * ---------------------------------------------------------------------------- */

/** Id ESTABLE de un cert de dispositivo = su identificador de DISPOSITIVO estable: `relayDeviceId`
 *  si el cert ata un id de relé (Adenda 126); si no, la huella de la identidad soberana `deviceFp`.
 *  NO se clava en la FIRMA a propósito (revisión adversarial Adenda 128): `registerIdentity` RE-FIRMA
 *  el cert en cada arranque (firma nueva), y una revocación DEBE seguir aplicándose a ese MISMO
 *  dispositivo pese a la re-emisión — si se clavara en la firma, el dispositivo revocado evadiría la
 *  CRL con solo re-publicar. Con el id estable, revocar el cert de un dispositivo lo retira aunque
 *  re-emita. "" si el cert no aporta ningún id estable (ni relayDeviceId ni deviceFp). */
export async function deviceCertId(cert: DeviceCert): Promise<string> {
  if (!cert) return "";
  return cert.relayDeviceId || cert.deviceFp || "";
}

/** Acta de revocación de UN cert de dispositivo concreto, firmada por la maestra que lo emitió. */
export interface DeviceCertRevocation {
  certId: string; // `deviceCertId` del cert revocado
  mfp: string; // huella de la maestra firmante
  mpub: JsonWebKey; // pública de la maestra (para verificar sin registro previo)
  iat: number; // emitida en (epoch ms)
  sig: string; // firma de la maestra sobre `revokeDeviceCertMessage(certId)`
}

/** Mensaje canónico que firma/verifica un acta de revocación de cert de dispositivo (orden de
 *  claves FIJO, imita `revMessage`/`certMessage`). Devuelve el string canónico. */
export function revokeDeviceCertMessage(certId: string): string {
  return JSON.stringify({ revokeDeviceCert: certId });
}

/** Bytes (respaldados por ArrayBuffer, BufferSource para WebCrypto) del mensaje canónico. */
function revokeDeviceCertBytes(certId: string): Uint8Array {
  const u = new TextEncoder().encode(revokeDeviceCertMessage(certId));
  const buf = new ArrayBuffer(u.length);
  const out = new Uint8Array(buf);
  out.set(u);
  return out;
}

/** Firma el acta de revocación de UN cert de dispositivo (por su `certId`) con la privada maestra.
 *  Sella `iat = Date.now()` y devuelve el acta con `mfp`/`mpub` de la maestra. Tolerante a fallos:
 *  null si no hay maestra o WebCrypto. */
export async function signDeviceCertRevocation(certId: string): Promise<DeviceCertRevocation | null> {
  const s = subtle();
  const m = await getOrCreateMasterKey();
  if (!s || !m || !certId) return null;
  try {
    const iat = Date.now();
    const sig = await s.sign({ name: "ECDSA", hash: "SHA-256" }, m.privKey, revokeDeviceCertBytes(certId) as BufferSource);
    return { certId, mfp: m.fp, mpub: m.pub, iat, sig: b64url(sig) };
  } catch {
    return null;
  }
}

/** Verifica un acta de revocación de cert de dispositivo CONTRA la maestra ESPERADA de la cuenta
 *  (`expectedMfp`, ancla de confianza). Comprueba `rev.mfp === expectedMfp`, que `mfp` es la huella
 *  de `mpub`, y que la firma valida sobre `revokeDeviceCertMessage(rev.certId)`. Espejo de
 *  `verifyMasterRevocation`: solo la maestra ancla puede revocar SUS certs, así un tercero no puede
 *  forjar una revocación que retire (DoS) el cert de una víctima. */
export async function verifyDeviceCertRevocation(rev: DeviceCertRevocation, expectedMfp: string): Promise<boolean> {
  const s = subtle();
  if (!s || !rev || !rev.certId || !rev.mfp || !rev.mpub || !rev.sig) return false;
  if (!expectedMfp || rev.mfp !== expectedMfp) return false; // ANCLA DE CONFIANZA imprescindible
  try {
    if ((await fpOfMaster(rev.mpub)) !== rev.mfp) return false; // mfp debe ser la huella de mpub
    const key = await s.importKey("jwk", rev.mpub, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    return await s.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      fromB64url(rev.sig) as BufferSource,
      revokeDeviceCertBytes(rev.certId) as BufferSource,
    );
  } catch {
    return false;
  }
}

/** Deriva por PBKDF2 una clave AES-GCM de envoltura desde la passphrase + salt. */
async function deriveWrapKey(passphrase: string, salt: BufferSource, iters: number): Promise<CryptoKey | null> {
  const s = subtle();
  if (!s) return null;
  try {
    const base = await s.importKey("raw", new TextEncoder().encode(passphrase) as BufferSource, "PBKDF2", false, ["deriveKey"]);
    return await s.deriveKey(
      { name: "PBKDF2", salt, iterations: iters, hash: "SHA-256" },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } catch {
    return null;
  }
}

/**
 * Exporta la clave maestra CIFRADA con una passphrase (PBKDF2 → AES-GCM). El blob
 * lleva el material público en claro (no es secreto) y el JWK privado cifrado. Null
 * si la passphrase es corta o no hay WebCrypto. La clave privada NUNCA sale en claro.
 */
export async function exportMasterKeyEncrypted(passphrase: string): Promise<MasterBlob | null> {
  const s = subtle();
  if (!s || !passphrase || passphrase.length < MIN_PASSPHRASE) return null;
  try {
    const m = await getOrCreateMasterKey();
    if (!m) return null;
    const privJwk = await s.exportKey("jwk", m.privKey);
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const wrap = await deriveWrapKey(passphrase, salt, KDF_ITERS);
    if (!wrap) return null;
    const ctBuf = await s.encrypt(
      { name: "AES-GCM", iv },
      wrap,
      new TextEncoder().encode(JSON.stringify(privJwk)),
    );
    return {
      v: 2,
      kdf: "PBKDF2-SHA256",
      iters: KDF_ITERS,
      salt: b64url(salt.buffer),
      iv: b64url(iv.buffer),
      ct: b64url(ctBuf),
      mfp: m.fp,
      mpub: m.pub,
    };
  } catch {
    return null;
  }
}

/**
 * Importa una clave maestra desde un blob cifrado + passphrase, y la fija como la
 * maestra de esta neurona (identidad portátil). Devuelve {fp} o null (passphrase
 * incorrecta, blob corrupto o incoherente). Verifica que la huella coincide con la
 * clave pública del blob antes de aceptarla.
 */
export async function importMasterKeyEncrypted(blob: MasterBlob, passphrase: string): Promise<{ fp: string } | null> {
  const s = subtle();
  if (!s || !blob || blob.v !== 2 || !blob.ct || !blob.salt || !blob.iv || !blob.mpub) return null;
  if (!passphrase || passphrase.length < MIN_PASSPHRASE) return null; // simetría con export
  try {
    const salt = fromB64url(blob.salt);
    const iv = fromB64url(blob.iv);
    const ct = fromB64url(blob.ct);
    // Acota las iteraciones que dicta un blob NO confiable: sin cota, un `iters`
    // gigante congelaría la CPU al derivar (DoS barato, antes de autenticar nada).
    const iters = Math.min(KDF_ITERS_MAX, Math.max(KDF_ITERS_MIN, Number(blob.iters) || KDF_ITERS));
    const wrap = await deriveWrapKey(passphrase, salt, iters);
    if (!wrap) return null;
    const plain = await s.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, wrap, ct as BufferSource); // lanza si la passphrase es incorrecta
    const privJwk = JSON.parse(new TextDecoder().decode(plain)) as JsonWebKey;
    // La huella declarada debe casar con la clave pública del blob…
    const fp = await fpOfMaster(blob.mpub);
    if (!fp || fp !== blob.mfp) return null;
    // …y la PRIVADA descifrada debe CORRESPONDER a esa clave pública. El header
    // (mpub/mfp) no va autenticado por GCM; sin este chequeo, un blob con la mpub
    // intercambiada por la de otra identidad se aceptaría (confusión de identidad).
    if (privJwk.crv !== blob.mpub.crv || privJwk.x !== blob.mpub.x || privJwk.y !== blob.mpub.y) return null;
    const privKey = await s.importKey("jwk", privJwk, { name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
    persist(blob.mpub, privJwk, fp);
    cache = { pub: blob.mpub, privKey, fp };
    return { fp };
  } catch {
    return null; // passphrase incorrecta / blob corrupto → silencio honesto
  }
}

/* ── Rotación + auto-revocación de la maestra (Adenda 122) ───────────────────────
 * La maestra es la RAÍZ soberana: ante compromiso hay que poder rotarla y avisar a
 * la red de que la vieja ya no vale. La revocación es AUTO-AUTENTICABLE (solo quien
 * tiene la clave puede firmarla), como el acta de revocación de dispositivo.
 * ---------------------------------------------------------------------------- */

/** Mensaje canónico de un acta de revocación de maestra (orden fijo). */
function revMessage(mfp: string): Uint8Array {
  const u = new TextEncoder().encode(JSON.stringify({ revokeMaster: mfp }));
  const buf = new ArrayBuffer(u.length);
  const out = new Uint8Array(buf);
  out.set(u);
  return out;
}

/** Firma el acta de auto-revocación de la maestra ACTUAL → {mfp, mpub, sig}. */
export async function signMasterRevocation(): Promise<{ mfp: string; mpub: JsonWebKey; sig: string } | null> {
  const s = subtle();
  const m = await getOrCreateMasterKey();
  if (!s || !m) return null;
  try {
    const sig = await s.sign({ name: "ECDSA", hash: "SHA-256" }, m.privKey, revMessage(m.fp) as BufferSource);
    return { mfp: m.fp, mpub: m.pub, sig: b64url(sig) };
  } catch {
    return null;
  }
}

/** Verifica un acta de revocación de maestra: firma válida sobre {revokeMaster:mfp}
 *  por la clave cuya huella ES `mfp` (solo la propia maestra puede revocarse). */
export async function verifyMasterRevocation(mfp: string, sig: string, mpub: JsonWebKey): Promise<boolean> {
  const s = subtle();
  if (!s || !mfp || !sig || !mpub) return false;
  try {
    if ((await fpOfMaster(mpub)) !== mfp) return false; // la firma debe venir de la propia clave revocada
    const key = await s.importKey("jwk", mpub, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    return await s.verify({ name: "ECDSA", hash: "SHA-256" }, key, fromB64url(sig) as BufferSource, revMessage(mfp) as BufferSource);
  } catch {
    return false;
  }
}

/**
 * Rota la maestra: firma la revocación de la ACTUAL, genera una NUEVA y la persiste.
 * Devuelve {oldFp, newFp, revocation}. El llamador DEBE, para que la rotación surta
 * efecto en la red: (1) PUBLICAR la revocación, (2) RE-CERTIFICAR sus dispositivos con
 * la maestra nueva, y (3) RE-FIJAR el ancla `account→mfp` (a `newFp`). Los certificados
 * firmados por la maestra vieja dejan de verificar contra la huella esperada nueva.
 */
export async function regenerateMasterKey(): Promise<{ oldFp: string; newFp: string; revocation: { mfp: string; mpub: JsonWebKey; sig: string } | null } | null> {
  const s = subtle();
  if (!s) return null;
  try {
    // Precondiciones ATÓMICAS: solo se rota si YA hay una maestra CARGABLE y se logra
    // firmar su acta de revocación. Si no, se aborta SIN tocar el almacenamiento — no se
    // acuña-y-tira una maestra espuria, no se pisa una raíz quizá recuperable, y no se
    // rota "en silencio" dejando viva la vieja sin avisar a la red (hallazgo de revisión).
    if (!hasMasterKey()) return null;
    const m = await getOrCreateMasterKey();
    if (!m) return null;
    const revocation = await signMasterRevocation();
    if (!revocation) return null;
    const kp = (await s.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const pub = await s.exportKey("jwk", kp.publicKey);
    const priv = await s.exportKey("jwk", kp.privateKey);
    const newFp = await fpOfMaster(pub);
    persist(pub, priv, newFp);
    cache = { pub, privKey: kp.privateKey, fp: newFp };
    return { oldFp: m.fp, newFp, revocation };
  } catch {
    return null;
  }
}

/** Reinicia el estado (memoria + almacenamiento). Solo para pruebas. */
export function _resetMasterKey(): void {
  cache = null;
  try {
    safeSet(MASTER_KEY_LS, "");
  } catch {
    /* */
  }
}
