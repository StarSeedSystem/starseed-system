"use client";

/**
 * StarSeed OS — RED SINÁPTICA · CIFRADO DEL RELÉ (Adenda 99).
 * ============================================================================
 * Cuando la nube hace de PUENTE para datos privados (channel='relay'), el
 * payload viaja CIFRADO en cliente: el servidor solo transporta, no lee. Aquí
 * vive ese cifrado — AES-GCM 256 con una CLAVE DE CUENTA que se guarda SOLO en
 * la neurona (safe-storage), nunca se sube.
 *
 * HONESTIDAD RADICAL: esto es E2E "en reposo" con una clave que vive en tus
 * neuronas. Para que una SEGUNDA neurona descifre lo que emitió la primera, hay
 * que VINCULAR la misma clave (exportar/importar) — la UI lo dice claro. No
 * fingimos zero-knowledge con reparto mágico de claves: el servidor guarda
 * texto cifrado y punto; si no tienes la clave, ves "cifrado (sin clave)".
 *
 * SSR-safe y defensivo: sin `crypto.subtle` (SSR o navegador viejo) todo
 * degrada a null y el llamador cae a texto plano SOLO si el ámbito lo permite.
 * NUNCA lanza.
 */

import { safeGet, safeSet } from "@/lib/safe-storage";

const RELAY_KEY_LS = "starseed.mesh.relay-key.v1";

/** Sobre cifrado que viaja en la columna `payload` (jsonb) del relé. */
export interface EncEnvelope {
  /** Vector de inicialización (base64, 12 B). */
  iv: string;
  /** Texto cifrado + tag GCM (base64). */
  ct: string;
  /** Marca de esquema para futura rotación. */
  v: 1;
}

function subtle(): SubtleCrypto | null {
  try {
    const c = globalThis.crypto;
    return c && "subtle" in c ? c.subtle : null;
  } catch {
    return null;
  }
}

function toB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function fromB64(b64: string): Uint8Array<ArrayBuffer> | null {
  try {
    const bin = atob(b64);
    // Buffer explícito (ArrayBuffer, no ArrayBufferLike): WebCrypto exige
    // BufferSource respaldado por ArrayBuffer en TS 5.9 (typed arrays genéricos).
    const buf = new ArrayBuffer(bin.length);
    const out = new Uint8Array(buf);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** Clave AES-GCM en memoria (evita re-importar en cada operación). */
let cachedKey: CryptoKey | null = null;
let cachedRawB64: string | null = null;

async function importRaw(rawB64: string): Promise<CryptoKey | null> {
  const s = subtle();
  const raw = fromB64(rawB64);
  if (!s || !raw || raw.length !== 32) return null;
  try {
    return await s.importKey("raw", raw, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
  } catch {
    return null;
  }
}

/**
 * Obtiene (o crea una vez) la clave de cuenta del relé. Se persiste en
 * safe-storage como raw base64 — SOLO local. Devuelve null sin WebCrypto.
 */
export async function getOrCreateRelayKey(): Promise<CryptoKey | null> {
  const s = subtle();
  if (!s) return null;
  try {
    const stored = safeGet(RELAY_KEY_LS);
    if (stored) {
      if (cachedKey && cachedRawB64 === stored) return cachedKey;
      const k = await importRaw(stored);
      if (k) {
        cachedKey = k;
        cachedRawB64 = stored;
        return k;
      }
    }
    // Si el almacenamiento NO persiste (modo privado/cuota) safeGet devuelve null
    // en cada llamada; sin esto regeneraríamos una clave distinta cada vez y
    // cifrar/descifrar usarían claves diferentes → el relé jamás se leería.
    // Reutiliza la clave ya generada esta sesión antes de crear otra.
    if (cachedKey) return cachedKey;
    // Generar una clave nueva y persistir su raw.
    const key = await s.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const raw = new Uint8Array(await s.exportKey("raw", key));
    const b64 = toB64(raw);
    safeSet(RELAY_KEY_LS, b64);
    cachedKey = key;
    cachedRawB64 = b64;
    return key;
  } catch {
    return null;
  }
}

/** Exporta la clave de cuenta (base64) para VINCULAR otra neurona. */
export async function exportRelayKeyB64(): Promise<string | null> {
  try {
    await getOrCreateRelayKey();
    return cachedRawB64 ?? safeGet(RELAY_KEY_LS);
  } catch {
    return null;
  }
}

/** Importa una clave de cuenta (vincular esta neurona a las demás). */
export async function importRelayKeyB64(b64: string): Promise<boolean> {
  try {
    const clean = (b64 || "").trim();
    const k = await importRaw(clean);
    if (!k) return false;
    safeSet(RELAY_KEY_LS, clean);
    cachedKey = k;
    cachedRawB64 = clean;
    return true;
  } catch {
    return false;
  }
}

/** ¿Hay clave de relé disponible en esta neurona? */
export function hasRelayKey(): boolean {
  try {
    return !!safeGet(RELAY_KEY_LS);
  } catch {
    return false;
  }
}

/** Cifra un objeto → sobre {iv,ct}. Devuelve null si no hay WebCrypto/clave. */
export async function encryptEnvelope(obj: unknown): Promise<EncEnvelope | null> {
  const s = subtle();
  if (!s) return null;
  try {
    const key = await getOrCreateRelayKey();
    if (!key) return null;
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode(JSON.stringify(obj ?? null));
    const ctBuf = await s.encrypt({ name: "AES-GCM", iv }, key, data);
    return { iv: toB64(iv), ct: toB64(new Uint8Array(ctBuf)), v: 1 };
  } catch {
    return null;
  }
}

/** Descifra un sobre {iv,ct} → objeto. null si falta clave o el tag no valida. */
export async function decryptEnvelope(env: EncEnvelope): Promise<unknown | null> {
  const s = subtle();
  if (!s || !env || env.v !== 1) return null;
  try {
    const key = await getOrCreateRelayKey();
    if (!key) return null;
    const iv = fromB64(env.iv);
    const ct = fromB64(env.ct);
    if (!iv || !ct) return null;
    const plain = await s.decrypt({ name: "AES-GCM", iv }, key, ct);
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    return null; // clave equivocada / dato corrupto → silencio honesto
  }
}
