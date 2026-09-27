"use client";

/*
 * par-crypto — primitivas criptográficas del VÍNCULO ENTRE CUENTAS (Ola 370).
 * ---------------------------------------------------------------------------
 * Deriva un secreto de PAR (uno por vínculo) sin que viaje en claro:
 *
 *   ECDH P-256 (par por DISPOSITIVO, persistente)  →  HKDF-SHA256(sal)  →  claveParHex
 *
 *   · Cada dispositivo tiene UN par ECDH P-256 propio, generado una vez y
 *     reutilizado para TODOS sus vínculos (no uno por vínculo — la clave
 *     PRIVADA nunca sale de este dispositivo; lo que cambia por vínculo es
 *     la `sal`, que sí es distinta cada vez — ver la migración
 *     `20260926190000_os_mesh_vinculos.sql`). La pública (JWK) se publica en
 *     la fila del vínculo (`de_pub`/`a_pub`); la privada es NO EXTRAÍBLE
 *     (`extractable: false` en `generateKey`) y se guarda en IndexedDB (el
 *     único almacén del navegador que admite un `CryptoKey` no extraíble vía
 *     structured clone — `localStorage` exige JSON, que exigiría exportarla).
 *   · Con la pública del OTRO lado (`de_pub`/`a_pub`, leída de la fila una
 *     vez `estado='aceptado'`) + la sal de la fila, cada lado deriva EL MISMO
 *     secreto: `deriveBits(ECDH) → HKDF-SHA256(salt=sal, info fija) → 256
 *     bits` codificados en hex (`claveParHex`). Con esa clave: (a) se deriva
 *     el TOPIC del canal de señalización (`starseed-par-<hash>`, ver
 *     `par-signaling.ts`) y (b) se firma cada señal con HMAC-SHA256 para que
 *     un tercero que adivine o intercepte el topic no pueda inyectar señales.
 *
 * Documentado, fijo y con separación de dominio (mismo estilo que
 * `recipient-crypto.ts`, que resuelve el mismo problema para el relé — este
 * módulo es DELIBERADAMENTE independiente de aquel: el par de cifrado de
 * `recipient-crypto.ts` vive en `localStorage` como JWK EXTRAÍBLE porque su
 * amenaza es distinta — aquí, además, se pide explícitamente que la privada
 * de emparejamiento sea NO EXTRAÍBLE, un paso más fuerte).
 *
 * SSR-safe y defensivo: sin `crypto.subtle` (o sin IndexedDB) degrada — el
 * par de claves vive solo en memoria de esta sesión (se avisa una vez por
 * consola; nunca lanza). Sin persistencia, un recargue de página genera un
 * par NUEVO, así que un vínculo ya aceptado dejaría de derivar el mismo
 * secreto — es una degradación honesta (no fingida), documentada en
 * `architecture/vinculos-entre-cuentas.md` §6.
 */

/* ------------------------------------------------------------------ */
/* Constantes de dominio (no secretas; ver cabecera)                  */
/* ------------------------------------------------------------------ */

const HKDF_INFO = new TextEncoder().encode("starseed-mesh-vinculo-par-v1");
/** Longitud del prefijo de topic (hex) derivado de `claveParHex` (ver cabecera del módulo). */
const TOPIC_HEX_LEN = 24;

/* ------------------------------------------------------------------ */
/* Utilidades binarias                                                */
/* ------------------------------------------------------------------ */

function subtle(): SubtleCrypto | null {
  try {
    return globalThis.crypto?.subtle ?? null;
  } catch {
    return null;
  }
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!hex || hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/* ------------------------------------------------------------------ */
/* Par ECDH P-256 por dispositivo — almacén inyectable (IndexedDB por  */
/* defecto; en memoria si no hay IndexedDB — degradación honesta)     */
/* ------------------------------------------------------------------ */

/** Un almacén mínimo para el par ECDH de este dispositivo (inyectable para pruebas). */
export interface AlmacenParClaves {
  cargar(): Promise<CryptoKeyPair | null>;
  guardar(par: CryptoKeyPair): Promise<void>;
}

const DB_NAME = "starseed-mesh-par";
const STORE_NAME = "device-key";
const KEY_ID = "current";

/** Almacén en memoria (fallback sin IndexedDB): vive mientras dure la pestaña. */
function crearAlmacenEnMemoria(): AlmacenParClaves {
  let cache: CryptoKeyPair | null = null;
  return {
    async cargar() {
      return cache;
    },
    async guardar(par) {
      cache = par;
    },
  };
}

/** Abre (o crea) la base IndexedDB de este módulo. Null si IndexedDB no está disponible. */
function abrirDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const idb = typeof indexedDB !== "undefined" ? indexedDB : null;
      if (!idb) {
        resolve(null);
        return;
      }
      const req = idb.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        try {
          req.result.createObjectStore(STORE_NAME);
        } catch {
          /* si ya existe, noop */
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Almacén IndexedDB del par ECDH del dispositivo (la privada NO EXTRAÍBLE se
 * guarda como `CryptoKey` nativo vía structured clone — IndexedDB lo admite,
 * `localStorage` no). Degrada a `null` ante cualquier fallo (nunca lanza).
 */
function crearAlmacenIndexedDB(): AlmacenParClaves {
  return {
    async cargar() {
      try {
        const db = await abrirDB();
        if (!db) return null;
        return await new Promise((resolve) => {
          try {
            const tx = db.transaction(STORE_NAME, "readonly");
            const req = tx.objectStore(STORE_NAME).get(KEY_ID);
            req.onsuccess = () => resolve((req.result as CryptoKeyPair | undefined) ?? null);
            req.onerror = () => resolve(null);
          } catch {
            resolve(null);
          }
        });
      } catch {
        return null;
      }
    },
    async guardar(par) {
      try {
        const db = await abrirDB();
        if (!db) return;
        await new Promise<void>((resolve) => {
          try {
            const tx = db.transaction(STORE_NAME, "readwrite");
            tx.objectStore(STORE_NAME).put(par, KEY_ID);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
          } catch {
            resolve();
          }
        });
      } catch {
        /* sin persistencia: el llamador sigue con el par en memoria de esta sesión */
      }
    },
  };
}

let almacenPorDefecto: AlmacenParClaves | null = null;
function almacenParClavesPorDefecto(): AlmacenParClaves {
  if (!almacenPorDefecto) {
    almacenPorDefecto =
      typeof indexedDB !== "undefined" ? crearAlmacenIndexedDB() : crearAlmacenEnMemoria();
  }
  return almacenPorDefecto;
}

let cache: CryptoKeyPair | null = null;

/**
 * getOrCreateParKeyPair — obtiene (o crea y persiste) el par ECDH P-256 de
 * EMPAREJAMIENTO de este dispositivo. La privada es NO EXTRAÍBLE
 * (`extractable: false`): ni este módulo ni nadie puede volcarla a JWK — solo
 * sirve para `deriveBits`. Null sin WebCrypto. `store` es inyectable (tests);
 * en producción usa IndexedDB (o memoria si no hay IndexedDB). Nunca lanza.
 */
export async function getOrCreateParKeyPair(store: AlmacenParClaves = almacenParClavesPorDefecto()): Promise<CryptoKeyPair | null> {
  if (cache) return cache;
  const s = subtle();
  if (!s) return null;
  try {
    const existente = await store.cargar();
    if (existente?.privateKey && existente.publicKey) {
      cache = existente;
      return cache;
    }
  } catch {
    /* almacén corrupto/inaccesible: se genera uno nuevo abajo */
  }
  try {
    // `extractable: false` aquí se aplica SOLO a la privada (la pública de un
    // par asimétrico es siempre exportable, por diseño de WebCrypto — no
    // hace falta pedirla aparte): la privada de emparejamiento de este
    // dispositivo nunca puede salir como JWK, ni siquiera por un bug de este
    // módulo; la pública sí, y es la que viaja en `de_pub`/`a_pub`.
    const par = await s.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
    cache = par as CryptoKeyPair;
    try {
      await store.guardar(cache);
    } catch {
      /* sin persistencia: el par vive solo en memoria de esta sesión (degradación honesta) */
    }
    return cache;
  } catch {
    return null;
  }
}

/**
 * exportPubJwk — clave pública ECDH (JWK) de este dispositivo, para publicar
 * en `de_pub`/`a_pub`. Null si no hay par (sin WebCrypto). Nunca lanza.
 */
export async function exportPubJwk(store?: AlmacenParClaves): Promise<JsonWebKey | null> {
  const s = subtle();
  if (!s) return null;
  try {
    const par = await getOrCreateParKeyPair(store);
    if (!par) return null;
    return await s.exportKey("jwk", par.publicKey);
  } catch {
    return null;
  }
}

/** Reinicia el estado (memoria). Solo para pruebas. */
export function _resetParKeyCache(): void {
  cache = null;
  almacenPorDefecto = null;
}

/* ------------------------------------------------------------------ */
/* Derivación del secreto de PAR: ECDH → HKDF(sal) → claveParHex       */
/* ------------------------------------------------------------------ */

async function importarPublicaPeer(jwk: JsonWebKey): Promise<CryptoKey | null> {
  const s = subtle();
  if (!s || !jwk) return null;
  try {
    return await s.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, false, []);
  } catch {
    return null;
  }
}

/**
 * derivarClaveParHex — el secreto de PAR de este vínculo, como hex de 32
 * bytes (256 bits): `deriveBits(ECDH, miPriv, peerPub) → HKDF-SHA256(salt=sal
 * como bytes, info fija) → 256 bits`. AMBOS lados, con su propia privada +
 * la pública publicada del otro + la MISMA `sal` de la fila, obtienen el
 * MISMO resultado (propiedad ECDH). Null ante cualquier fallo — el llamador
 * cae a la señalización sin autenticar solo si decide degradar (no
 * recomendado; ver `par-signaling.ts`, que NUNCA envía sin esta clave).
 */
export async function derivarClaveParHex(peerPubJwk: JsonWebKey, salHex: string, store?: AlmacenParClaves): Promise<string | null> {
  const s = subtle();
  if (!s) return null;
  try {
    const par = await getOrCreateParKeyPair(store);
    if (!par) return null;
    const peer = await importarPublicaPeer(peerPubJwk);
    if (!peer) return null;
    const salBytes = new TextEncoder().encode(salHex); // la sal viaja como texto hex; se usa tal cual como salt de HKDF (no secreta, ver cabecera)
    const shared = await s.deriveBits({ name: "ECDH", public: peer }, par.privateKey, 256);
    const hkdf = await s.importKey("raw", shared, "HKDF", false, ["deriveBits"]);
    const bits = await s.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt: salBytes as BufferSource, info: HKDF_INFO as BufferSource },
      hkdf,
      256,
    );
    return bytesToHex(new Uint8Array(bits));
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Topic del canal (derivado, no adivinable sin claveParHex)          */
/* ------------------------------------------------------------------ */

/**
 * topicDePar — nombre de canal `starseed-par-<hash>` a partir de
 * `claveParHex`: primeros `TOPIC_HEX_LEN` caracteres hex de
 * SHA-256(claveParHex). Determinista (ambos lados llegan al MISMO topic con
 * la MISMA clave) y distinto por vínculo (la clave lo es, porque la sal lo
 * es). Null ante cualquier fallo.
 */
export async function topicDePar(claveParHex: string): Promise<string | null> {
  const s = subtle();
  if (!s || !claveParHex) return null;
  try {
    const digest = await s.digest("SHA-256", new TextEncoder().encode(claveParHex));
    return bytesToHex(new Uint8Array(digest)).slice(0, TOPIC_HEX_LEN);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* HMAC-SHA256 de señales (autentica el canal, ver par-signaling.ts)  */
/* ------------------------------------------------------------------ */

async function importarClaveHmac(claveParHex: string): Promise<CryptoKey | null> {
  const s = subtle();
  const bytes = hexToBytes(claveParHex);
  if (!s || !bytes) return null;
  try {
    return await s.importKey("raw", bytes as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  } catch {
    return null;
  }
}

/**
 * hmacFirmar — HMAC-SHA256(claveParHex, mensaje) en hex. Null ante cualquier
 * fallo (sin WebCrypto, clave inválida…). El mensaje debe ser la
 * serialización CANÓNICA de la señal (ver `par-signaling.ts::canonicalizar`),
 * nunca un objeto no serializado (el orden de propiedades de JSON.stringify
 * no está garantizado entre motores para objetos construidos de formas
 * distintas — `par-signaling.ts` fija el orden explícitamente).
 */
export async function hmacFirmar(claveParHex: string, mensaje: string): Promise<string | null> {
  const s = subtle();
  if (!s) return null;
  try {
    const key = await importarClaveHmac(claveParHex);
    if (!key) return null;
    const sig = await s.sign("HMAC", key, new TextEncoder().encode(mensaje));
    return bytesToHex(new Uint8Array(sig));
  } catch {
    return null;
  }
}

/**
 * hmacVerificar — ¿`firmaHex` es el HMAC-SHA256(claveParHex, mensaje)
 * válido? Usa `crypto.subtle.verify` (comparación en tiempo constante del
 * lado del motor) en vez de comparar strings a mano. `false` ante cualquier
 * fallo (nunca lanza) — una señal que no verifica se DESCARTA, nunca se
 * procesa "por si acaso".
 */
export async function hmacVerificar(claveParHex: string, mensaje: string, firmaHex: string): Promise<boolean> {
  const s = subtle();
  const firmaBytes = hexToBytes(firmaHex || "");
  if (!s || !firmaBytes) return false;
  try {
    const key = await importarClaveHmac(claveParHex);
    if (!key) return false;
    return await s.verify("HMAC", key, firmaBytes as BufferSource, new TextEncoder().encode(mensaje));
  } catch {
    return false;
  }
}
