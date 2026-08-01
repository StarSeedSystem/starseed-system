"use client";

/**
 * StarSeed OS — RED SINÁPTICA · CIFRADO DEL RELÉ (Adenda 99 · llavero Adenda 120).
 * ============================================================================
 * Cuando la nube hace de PUENTE para datos privados (channel='relay'), el
 * payload viaja CIFRADO en cliente: el servidor solo transporta, no lee. Aquí
 * vive ese cifrado — AES-GCM 256 con una CLAVE DE CUENTA que se guarda SOLO en
 * la neurona (safe-storage), nunca se sube.
 *
 * ROTACIÓN (Adenda 120): en vez de una única clave, un LLAVERO `{kid, raw}[]` con
 * una clave ACTUAL (con la que se cifra) y claves PREVIAS retenidas SOLO para
 * descifrar (gracia). `rotateRelayKey()` introduce una clave nueva sin perder el
 * acceso a lo ya cifrado; el sobre lleva `kid` para elegir la clave correcta.
 * Ante compromiso, se rota y se re-vincula: lo nuevo va con la clave nueva.
 *
 * HONESTIDAD RADICAL: esto es E2E "en reposo" con una clave que vive en tus
 * neuronas. Para que una SEGUNDA neurona descifre lo que emitió la primera hay
 * que VINCULAR la misma clave (exportar/importar). No fingimos zero-knowledge con
 * reparto mágico de claves: el servidor guarda texto cifrado y punto; si no
 * tienes la clave, ves "cifrado (sin clave)". Tras rotar, hay que re-vincular
 * para que las otras neuronas lean lo nuevo (la clave previa sigue leyendo lo viejo).
 *
 * SSR-safe y defensivo: sin `crypto.subtle` todo degrada a null. NUNCA lanza.
 */

import { safeGet, safeSet } from "@/lib/safe-storage";
// Cifrado POR-DESTINATARIO (v:3, ECDH→HKDF→AES-GCM). DIRECCIÓN DE IMPORT: relay-crypto
// importa recipient-crypto (nunca al revés) para despachar los sobres v:3 sin ciclo.
import { decryptEnvelopeFor, type RecipientEnvelope } from "./recipient-crypto";

/** Clave única legada (Adenda 99): raw base64. Se migra al llavero al leerla. */
const RELAY_KEY_LS = "starseed.mesh.relay-key.v1";
/** Llavero (Adenda 120): JSON { keys:[{kid,raw}], cur }. */
const RELAY_RING_LS = "starseed.mesh.relay-keyring.v1";
/** Máximo de claves retenidas (gracia de descifrado); poda las más viejas. Generoso
 *  porque el llavero MEZCLA claves propias (rotación) e importadas (vinculación) y el
 *  contenido del relé caduca a las 24 h, así que rara vez se necesitan tantas. */
const MAX_RING = 32;

/** Sobre cifrado que viaja en la columna `payload` (jsonb) del relé. */
export interface EncEnvelope {
  /** Vector de inicialización (base64, 12 B). */
  iv: string;
  /** Texto cifrado + tag GCM (base64). */
  ct: string;
  /** Esquema: 1 = legado (sin kid); 2 = con kid del llavero. */
  v: 1 | 2;
  /** Identificador de la clave del llavero (solo v:2). */
  kid?: string;
}

interface KeyRing {
  keys: { kid: string; raw: string }[];
  cur: string;
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
    const buf = new ArrayBuffer(bin.length);
    const out = new Uint8Array(buf);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

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

/* ── Llavero en memoria (evita re-parsear/re-importar en cada operación) ─────── */
let ring: KeyRing | null = null;
const keyCache = new Map<string, CryptoKey>(); // kid → CryptoKey

function nextKid(r: KeyRing): string {
  let max = 0;
  for (const e of r.keys) {
    const n = Number(String(e.kid).replace(/^k/, ""));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return "k" + (max + 1);
}

function saveRing(r: KeyRing): void {
  try {
    safeSet(RELAY_RING_LS, JSON.stringify(r));
    // Compat: refleja la clave ACTUAL también en la clave legada, por si algo la lee.
    const cur = r.keys.find((k) => k.kid === r.cur);
    if (cur) safeSet(RELAY_KEY_LS, cur.raw);
  } catch {
    /* sin persistencia: el llavero vive en memoria esta sesión */
  }
}

function loadRing(): KeyRing {
  if (ring) return ring;
  // 1) Llavero nuevo.
  try {
    const raw = safeGet(RELAY_RING_LS);
    if (raw) {
      const r = JSON.parse(raw) as KeyRing;
      if (r && Array.isArray(r.keys) && typeof r.cur === "string") {
        ring = r;
        return r;
      }
    }
  } catch {
    /* corrupto: cae a migración/vacío */
  }
  // 2) Migrar la clave legada única.
  try {
    const legacy = safeGet(RELAY_KEY_LS);
    if (legacy) {
      ring = { keys: [{ kid: "k1", raw: legacy }], cur: "k1" };
      saveRing(ring);
      return ring;
    }
  } catch {
    /* */
  }
  // 3) Vacío.
  ring = { keys: [], cur: "" };
  return ring;
}

async function keyForKid(kid: string): Promise<CryptoKey | null> {
  const cached = keyCache.get(kid);
  if (cached) return cached;
  const r = loadRing();
  const entry = r.keys.find((k) => k.kid === kid);
  if (!entry) return null;
  const k = await importRaw(entry.raw);
  if (k) keyCache.set(kid, k);
  return k;
}

/** Asegura una clave ACTUAL (genera la primera si el llavero está vacío). */
async function ensureCurrentKey(): Promise<{ kid: string; key: CryptoKey } | null> {
  const s = subtle();
  if (!s) return null;
  const r = loadRing();
  if (r.cur) {
    const k = await keyForKid(r.cur);
    if (k) return { kid: r.cur, key: k };
  }
  try {
    const key = await s.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const raw = toB64(new Uint8Array(await s.exportKey("raw", key)));
    const kid = r.keys.length ? nextKid(r) : "k1";
    r.keys.push({ kid, raw });
    r.cur = kid;
    ring = r;
    saveRing(r);
    keyCache.set(kid, key);
    return { kid, key };
  } catch {
    return null;
  }
}

/** Clave AES-GCM ACTUAL de la cuenta (compat Adenda 99). Devuelve null sin WebCrypto. */
export async function getOrCreateRelayKey(): Promise<CryptoKey | null> {
  const c = await ensureCurrentKey();
  return c?.key ?? null;
}

/** Rota a una clave NUEVA (pasa a ser la actual). Conserva las previas para
 *  descifrar (gracia) hasta MAX_RING. Tras rotar, re-vincula tus otras neuronas
 *  para que lean lo NUEVO. Devuelve la nueva kid o null. */
export async function rotateRelayKey(): Promise<{ kid: string } | null> {
  const s = subtle();
  if (!s) return null;
  try {
    await ensureCurrentKey(); // migra el legado si hace falta
    const r = loadRing();
    const key = await s.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const raw = toB64(new Uint8Array(await s.exportKey("raw", key)));
    const kid = nextKid(r);
    r.keys.push({ kid, raw });
    r.cur = kid;
    if (r.keys.length > MAX_RING) r.keys = r.keys.slice(r.keys.length - MAX_RING);
    ring = r;
    saveRing(r);
    keyCache.set(kid, key);
    return { kid };
  } catch {
    return null;
  }
}

/** Info del llavero para la UI: nº de claves y kid actual. */
export function relayKeyInfo(): { count: number; cur: string } {
  const r = loadRing();
  return { count: r.keys.length, cur: r.cur };
}

/** Exporta la clave ACTUAL (base64) para VINCULAR otra neurona a lo que cifras ahora. */
export async function exportRelayKeyB64(): Promise<string | null> {
  try {
    await ensureCurrentKey();
    const r = loadRing();
    const cur = r.keys.find((k) => k.kid === r.cur);
    return cur?.raw ?? null;
  } catch {
    return null;
  }
}

/** Importa una clave y la fija como ACTUAL (vincula esta neurona a las demás). La
 *  clave se AÑADE al llavero: lo que ya tenías cifrado con otras claves sigue leyéndose. */
export async function importRelayKeyB64(b64: string): Promise<boolean> {
  try {
    const clean = (b64 || "").trim();
    const k = await importRaw(clean);
    if (!k) return false;
    const r = loadRing();
    let entry = r.keys.find((e) => e.raw === clean);
    if (!entry) {
      entry = { kid: r.keys.length ? nextKid(r) : "k1", raw: clean };
      r.keys.push(entry);
      if (r.keys.length > MAX_RING) r.keys = r.keys.slice(r.keys.length - MAX_RING);
    }
    r.cur = entry.kid;
    ring = r;
    saveRing(r);
    keyCache.set(entry.kid, k);
    return true;
  } catch {
    return false;
  }
}

/** ¿Hay alguna clave de relé disponible en esta neurona? */
export function hasRelayKey(): boolean {
  try {
    const raw = safeGet(RELAY_RING_LS);
    if (raw) {
      const r = JSON.parse(raw) as KeyRing;
      if (r?.keys?.length) return true;
    }
    return !!safeGet(RELAY_KEY_LS);
  } catch {
    return false;
  }
}

/** Cifra un objeto → sobre {iv,ct,v:2,kid}. Devuelve null si no hay WebCrypto/clave. */
export async function encryptEnvelope(obj: unknown): Promise<EncEnvelope | null> {
  const s = subtle();
  if (!s) return null;
  try {
    const cur = await ensureCurrentKey();
    if (!cur) return null;
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode(JSON.stringify(obj ?? null));
    const ctBuf = await s.encrypt({ name: "AES-GCM", iv }, cur.key, data);
    return { iv: toB64(iv), ct: toB64(new Uint8Array(ctBuf)), v: 2, kid: cur.kid };
  } catch {
    return null;
  }
}

/**
 * Descifra un sobre → objeto. Despacha por esquema:
 *   · v:3 → cifrado POR-DESTINATARIO (ECDH→HKDF→AES-GCM): delega en recipient-crypto,
 *     que descifra con la clave ECDH PROPIA. Solo el destinatario lo abre; tener el
 *     llavero COMPARTIDO no basta. Así los CUATRO puntos de recepción no cambian.
 *   · v:2 → elige la clave del llavero por `kid`.
 *   · v:1 (legado) o kid ausente/desconocido → PRUEBA todo el llavero (gracia).
 * null si ninguna clave valida el tag GCM o falta WebCrypto.
 */
export async function decryptEnvelope(env: EncEnvelope | RecipientEnvelope): Promise<unknown | null> {
  if (!env) return null;
  // v:3 = por-destinatario: NO usa el llavero compartido (E2E dirigido).
  if ((env as { v?: number }).v === 3) return decryptEnvelopeFor(env as RecipientEnvelope);
  const s = subtle();
  if (!s || (env.v !== 1 && env.v !== 2)) return null;
  try {
    const iv = fromB64(env.iv);
    const ct = fromB64(env.ct);
    if (!iv || !ct) return null;
    // El `kid` es solo una PISTA (se prueba primero por rendimiento). SIEMPRE se cae
    // al resto del llavero: los kid son locales por neurona, así que el kid del emisor
    // puede señalar un slot DISTINTO en el receptor tras vincular — sin este fallback,
    // contenido legítimo quedaría "sin clave" (bug detectado en revisión, Adenda 120).
    // El tag GCM (128 bits) evita falsos positivos, así que probar varias claves es seguro.
    const candidates: CryptoKey[] = [];
    const seen = new Set<string>();
    if (env.v === 2 && env.kid) {
      const k = await keyForKid(env.kid);
      if (k) { candidates.push(k); seen.add(env.kid); }
    }
    const r = loadRing();
    for (const e of r.keys) {
      if (seen.has(e.kid)) continue;
      const k = await keyForKid(e.kid);
      if (k) candidates.push(k);
    }
    for (const key of candidates) {
      try {
        const plain = await s.decrypt({ name: "AES-GCM", iv }, key, ct);
        return JSON.parse(new TextDecoder().decode(plain));
      } catch {
        /* clave equivocada: prueba la siguiente */
      }
    }
    return null; // ninguna clave valida → silencio honesto ("cifrado sin clave")
  } catch {
    return null;
  }
}

/** Reinicia el estado en memoria (solo para pruebas). */
export function _resetRelayKeys(): void {
  ring = null;
  keyCache.clear();
}
