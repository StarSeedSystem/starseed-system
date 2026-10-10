/**
 * cripto-estacion — firma, identidad y cifrado de las estaciones EN VIVO (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════
 * SOP: `architecture/estaciones-en-vivo-parametricas.md` (§3).
 *
 * Por qué hace falta: una estación en vivo viaja por un canal de difusión (Supabase Realtime o
 * un enlace local) donde cualquiera que conozca el tema puede escribir. Sin firma, cualquier
 * oyente podría «pausar para todos» o falsear el reloj común. Por eso:
 *
 *   · La sesión nace con un par de llaves ECDSA P-256 del anfitrión. Su id ES la huella de la
 *     llave pública (`idDeLlave`), así que el enlace se autocertifica: quien recibe una orden
 *     comprueba que la llave que la firma da ese mismo id, sin consultar a nadie.
 *   · Solo quien tiene la llave privada (el anfitrión, en cualquiera de sus medios) firma
 *     acciones, estados y respuestas del reloj. Los oyentes solo verifican.
 *   · Las estaciones privadas usan un token que solo tienen los invitados: de él salen el tema
 *     del canal (imposible de adivinar) y una clave AES-GCM que cifra todo lo que pasa por él.
 *
 * Todo con WebCrypto (navegador y Node ≥ 20). Sin dependencias. Nunca se imprime una llave.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

function sutil(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error("Este medio no tiene WebCrypto: no puede firmar ni verificar estaciones.");
  return s;
}

/* ─────────────────────────── base64url ─────────────────────────── */

export function aBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function deBase64Url(texto: string): Uint8Array {
  const limpio = texto.replace(/-/g, "+").replace(/_/g, "/");
  const relleno = limpio + "===".slice((limpio.length + 3) % 4);
  const s = atob(relleno);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Texto UTF-8 → base64url (para meter JSON en un enlace). */
export function textoABase64Url(texto: string): string {
  return aBase64Url(enc.encode(texto));
}

export function base64UrlATexto(b64: string): string {
  return dec.decode(deBase64Url(b64));
}

async function sha256(texto: string | Uint8Array): Promise<Uint8Array> {
  const datos = typeof texto === "string" ? enc.encode(texto) : texto;
  return new Uint8Array(await sutil().digest("SHA-256", datos as BufferSource));
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/* ─────────────────────────── llaves e identidad ─────────────────────────── */

const ALG = { name: "ECDSA", namedCurve: "P-256" } as const;
const FIRMA = { name: "ECDSA", hash: "SHA-256" } as const;

export interface LlavesSesion {
  /** Llave pública en crudo (65 bytes), en base64url: viaja en la ficha de la sesión. */
  publica: string;
  privada: CryptoKey;
}

/** Crea el par de llaves de una sesión nueva (la privada es exportable para el enlace de control). */
export async function crearLlaves(): Promise<LlavesSesion> {
  const par = (await sutil().generateKey(ALG, true, ["sign", "verify"])) as CryptoKeyPair;
  const crudo = await sutil().exportKey("raw", par.publicKey);
  return { publica: aBase64Url(crudo), privada: par.privateKey };
}

/** Id de la sesión = huella SHA-256 de la llave pública (22 caracteres, 132 bits). */
export async function idDeLlave(publicaB64: string): Promise<string> {
  return aBase64Url(await sha256(deBase64Url(publicaB64))).slice(0, 22);
}

/** ¿Esta llave pública corresponde a este id de sesión? */
export async function llaveCasaConId(publicaB64: string, id: string): Promise<boolean> {
  try {
    return (await idDeLlave(publicaB64)) === id;
  } catch {
    return false;
  }
}

/** Exporta la llave privada (JWK en base64url) para controlar la sesión desde otro aparato. */
export async function exportarPrivada(privada: CryptoKey): Promise<string> {
  const jwk = await sutil().exportKey("jwk", privada);
  return textoABase64Url(JSON.stringify(jwk));
}

export async function importarPrivada(b64: string): Promise<CryptoKey | null> {
  try {
    const jwk = JSON.parse(base64UrlATexto(b64)) as JsonWebKey;
    if (jwk.kty !== "EC" || jwk.crv !== "P-256" || typeof jwk.d !== "string") return null;
    return await sutil().importKey("jwk", jwk, ALG, true, ["sign"]);
  } catch {
    return null;
  }
}

/** Saca la llave pública (base64url) de una privada importada, para comprobar que es de la sesión. */
export async function publicaDePrivada(privada: CryptoKey): Promise<string | null> {
  try {
    const jwk = await sutil().exportKey("jwk", privada);
    const pub: JsonWebKey = { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y, ext: true };
    const k = await sutil().importKey("jwk", pub, ALG, true, ["verify"]);
    return aBase64Url(await sutil().exportKey("raw", k));
  } catch {
    return null;
  }
}

const cachePublicas = new Map<string, Promise<CryptoKey | null>>();

function llavePublica(b64: string): Promise<CryptoKey | null> {
  let p = cachePublicas.get(b64);
  if (!p) {
    p = sutil()
      .importKey("raw", deBase64Url(b64) as BufferSource, ALG, false, ["verify"])
      .catch(() => null);
    cachePublicas.set(b64, p);
    if (cachePublicas.size > 64) cachePublicas.delete(cachePublicas.keys().next().value as string);
  }
  return p;
}

export async function firmar(privada: CryptoKey, texto: string): Promise<string> {
  return aBase64Url(await sutil().sign(FIRMA, privada, enc.encode(texto)));
}

export async function verificar(publicaB64: string, texto: string, firmaB64: string): Promise<boolean> {
  try {
    const k = await llavePublica(publicaB64);
    if (!k) return false;
    return await sutil().verify(FIRMA, k, deBase64Url(firmaB64) as BufferSource, enc.encode(texto));
  } catch {
    return false;
  }
}

/* ─────────────────────────── estaciones privadas ─────────────────────────── */

/** Token de invitación: 128 bits aleatorios en base64url. */
export function crearToken(): string {
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  return aBase64Url(b);
}

/** Tema público del canal de una estación pública. */
export function temaPublico(id: string): string {
  return `estacion-vivo:${id}`;
}

/** Tema de una estación privada: solo lo puede calcular quien tiene el token. */
export async function temaPrivado(id: string, token: string): Promise<string> {
  return `estacion-p:${hex(await sha256(`tema:${id}:${token}`)).slice(0, 32)}`;
}

const cacheCifrado = new Map<string, Promise<CryptoKey>>();

function claveCifrado(id: string, token: string): Promise<CryptoKey> {
  const k = `${id}:${token}`;
  let p = cacheCifrado.get(k);
  if (!p) {
    p = sha256(`cifrado:${id}:${token}`).then((bruto) =>
      sutil().importKey("raw", bruto as BufferSource, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]),
    );
    cacheCifrado.set(k, p);
  }
  return p;
}

/** Cifra un texto para una estación privada: base64url(iv ‖ texto cifrado). */
export async function cifrar(id: string, token: string, texto: string): Promise<string> {
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);
  const ct = new Uint8Array(
    await sutil().encrypt({ name: "AES-GCM", iv }, await claveCifrado(id, token), enc.encode(texto)),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return aBase64Url(out);
}

/** Descifra; null si el token no es el de la estación o el mensaje está roto. */
export async function descifrar(id: string, token: string, b64: string): Promise<string | null> {
  try {
    const bruto = deBase64Url(b64);
    if (bruto.length < 13) return null;
    const pt = await sutil().decrypt(
      { name: "AES-GCM", iv: bruto.slice(0, 12) },
      await claveCifrado(id, token),
      bruto.slice(12),
    );
    return dec.decode(pt);
  } catch {
    return null;
  }
}
