/**
 * Encrypted key storage for AI provider credentials.
 *
 * Threat model: the user's API keys NEVER leave their device, NEVER touch our
 * servers, and are encrypted at rest with a passphrase only they know. If the
 * user picks "no passphrase" mode we still obfuscate with a device-bound key
 * derived from a per-install random salt — this protects against casual
 * inspection of localStorage but not against a sophisticated local attacker.
 *
 * Built on the Web Crypto API. No external dependencies.
 */

const ENC_SALT_KEY = "starseed.ai.salt"; // base64
const PASSPHRASE_VERIFIER_KEY = "starseed.ai.verifier"; // base64 nonce + ciphertext over "ok"

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

// `Uint8Array` (y no el `Uint8Array<ArrayBufferLike>` por defecto):
// la Web Crypto API exige `BufferSource`, que excluye `SharedArrayBuffer`.
function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function getOrCreateSalt(): Uint8Array {
  if (typeof window === "undefined") return new Uint8Array(16);
  const existing = window.localStorage.getItem(ENC_SALT_KEY);
  if (existing) return fromB64(existing);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  window.localStorage.setItem(ENC_SALT_KEY, toB64(salt));
  return salt;
}

async function deriveKey(passphrase: string): Promise<CryptoKey> {
  // Empty passphrase uses a device-bound default so that we always have a key.
  // It is intentionally weaker but better than plaintext on disk.
  const material = passphrase || "starseed-default-passphrase";
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(material),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: getOrCreateSalt(),
      iterations: 250_000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** Encrypt a plaintext string with the user's passphrase. */
export async function encryptKey(plaintext: string, passphrase: string): Promise<string> {
  if (typeof window === "undefined") return "";
  if (!plaintext) return "";
  const key = await deriveKey(passphrase);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  // Package: base64(iv ++ ciphertext) for compact localStorage.
  const packed = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(ciphertext), iv.byteLength);
  return toB64(packed);
}

/** Decrypt a previously-encrypted string with the user's passphrase. */
export async function decryptKey(ciphertextB64: string, passphrase: string): Promise<string> {
  if (typeof window === "undefined") return "";
  if (!ciphertextB64) return "";
  const packed = fromB64(ciphertextB64);
  const iv = packed.slice(0, 12);
  const data = packed.slice(12);
  const key = await deriveKey(passphrase);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(decrypted);
}

/** Set the verifier so we can quickly check a passphrase later. */
export async function setPassphraseVerifier(passphrase: string): Promise<void> {
  if (typeof window === "undefined") return;
  const enc = await encryptKey("ok", passphrase);
  window.localStorage.setItem(PASSPHRASE_VERIFIER_KEY, enc);
}

/** Returns true if the verifier is unset OR the passphrase decrypts it. */
export async function verifyPassphrase(passphrase: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const enc = window.localStorage.getItem(PASSPHRASE_VERIFIER_KEY);
  if (!enc) return true; // nothing set yet — first time
  try {
    const got = await decryptKey(enc, passphrase);
    return got === "ok";
  } catch {
    return false;
  }
}

/** Whether the user has already set a passphrase verifier. */
export function hasPassphraseVerifier(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.localStorage.getItem(PASSPHRASE_VERIFIER_KEY));
}

/** Nuke all stored AI material (called from the Privacy panel "wipe" button). */
export function wipeAllKeyMaterial(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ENC_SALT_KEY);
  window.localStorage.removeItem(PASSPHRASE_VERIFIER_KEY);
}
