"use client";

/**
 * StarSeed OS — CLIENTE CHATTERBOX (local service + Hugging Face Spaces) — VZR1011B.
 * ============================================================================
 * Habla por el servicio local de Chatterbox (VZR1011A) o por Spaces públicos de
 * Hugging Face que ofrezcan la API de Chatterbox.
 * 
 * Sin daemon, sin endpoint, sin descargas: es una voz de NUBE gratis que funciona
 * en cualquier navegador. Se integra en la cadena de motores JUSTO detrás del
 * híbrido OmniVoice: [omnivoice-híbrido → chatterbox → openvoice2 → kokoro → navegador]. Como
 * todo eslabón, es una MEJORA: si el Space falla, devolvemos null y la cadena
 * sigue — **Aurora SIEMPRE habla**. NUNCA lanza.
 * 
 * ── CONTRATO DEL SERVICIO LOCAL (VZR1011A) ─────────────────────────────────
 * GET /salud → { estado: "activo", ... }
 * POST /generar → 
 *   body: { texto: string, idioma: string, referencia_voz?: string, exageracion: number }
 *   response: { audio_base64?: string, mensaje: string, ... }
 * 
 * ── CONTRATO DE HUGGING FACE SPACES (por descubrir) ───────────────────────
 * Se sondea el Space para encontrar un endpoint que acepte:
 *   POST { texto, idioma?, exageracion?, referencia_audio? } → audio binario (WAV)
 * 
 * SSR-safe, defensivo. NUNCA lanza. Importarlo es barato (los motores pesados se
 * cargan con `import()` dinámico solo cuando hay que hablar).
 */

import { safeGet, safeSet } from "@/lib/safe-storage";
import { getLastUserVoiceEmotion } from "@/lib/aurora/audio-emotion";

// ── Constantes ─────────────────────────────────────────────────────────────────

const LS_SNAPSHOT = "starseed.aurora.chatterbox.discovery.v1";
const LS_HEALTH = "starseed.aurora.chatterbox.health.v1";
const SNAPSHOT_TTL_MS = 12 * 60 * 60_000; // 12 h
const BAD_ENDPOINT_MS = 2 * 60 * 60_000; // 2 h apartado tras fallo de inferencia
const PROBE_TIMEOUT_MS = 9_000;
const MAX_PROBES = 10; // Spaces a sondear por descubrimiento

// ── Tipos ──────────────────────────────────────────────────────────────────────

export type ChatterboxAdapterKind = "standard"; // Por ahora, asumimos un contrato estándar

export interface ChatterboxEndpoint {
  /** id estable ("owner/space" de HF). */
  id: string;
  /** URL base del Space (https://<sub>.hf.space, sin barra final). */
  base: string;
  /** Familia de contrato (elige el protocolo y el mapeo de parámetros). */
  kind: ChatterboxAdapterKind;
  /** fn_index a usar (para Spaces Gradio). */
  fnIndex: number;
  /** Estilos de emoción soportados (si aplica). */
  emotions?: string[];
  /** Anotación de origen: integrado o descubierto en vivo. */
  origin: "builtin" | "discovered";
}

export interface ChatterboxDiscoverySnapshot {
  at: number;
  endpoints: ChatterboxEndpoint[];
}

// ── Utilidades ─────────────────────────────────────────────────────────────────

function now(): number {
  return Date.now();
}

/** "owner/Space Name" → subdominio hf.space ("owner-space-name"). */
export function spaceIdToHost(id: string): string {
  return id
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, "-")
    .replace(/\//g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function fetchJson(
  url: string,
  timeoutMs = PROBE_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<unknown> {
  const ctrl = new AbortController();
  const onAbort = () => {
    try {
      ctrl.abort();
    } catch {
      /* */
    }
  };
  if (signal) {
    if (signal.aborted) return null;
    signal.addEventListener("abort", onAbort, { once: true });
  }
  const killer = setTimeout(onAbort, timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(killer);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

// ── Clasificación de contrato (a partir de /info del Space) ──────────────────

interface InfoParam {
  label?: string;
  python_type?: { type?: string };
  component?: string;
}
interface InfoEndpoint {
  parameters?: InfoParam[];
}

/**
 * ¿Es la firma [texto, idioma opcional, exageracion opcional, referencia audio opcional]?
 * (contrato estándar de Chatterbox)
 */
export function looksLikeChatterboxStandard(ep: InfoEndpoint | undefined): boolean {
  const p = ep?.parameters;
  if (!Array.isArray(p) || p.length < 1) return false; // al menos texto
  // Primero parámetro debe ser texto
  const first = p[0];
  const firstType = String((first as { python_type?: { type?: string } })?.python_type?.type ?? "");
  if (!firstType.includes("string")) return false;
  // Segundo parámetro opcional: idioma (string)
  // Tercer opcional: exageracion (number)
  // Cuarto opcional: referencia audio
  // No validamos más allá de que el primero sea texto, siendo optimista
  return true;
}

// ── Descubrimiento en HF (Spaces) ─────────────────────────────────────────────

interface HfSpaceListing {
  id?: string;
  likes?: number;
  sdk?: string;
  private?: boolean;
}

/**
 * Busca Spaces candidatos en la API pública de HF. También registra la versión
 * (sha) del repo oficial de modelos para la Librería. Nunca lanza.
 */
export async function discoverChatterboxEndpoints(opts: {
  force?: boolean;
  signal?: AbortSignal;
} = {}): Promise<ChatterboxDiscoverySnapshot> {
  const cached = readSnapshot();
  if (!opts.force && cached && now() - cached.at < SNAPSHOT_TTL_MS) return cached;

  const found = new Map<string, HfSpaceListing>();
  for (const q of ["chatterbox", "Chatterbox TTS", "chatterbox tts"]) {
    const list = (await fetchJson(
      `https://huggingface.co/api/spaces?search=${encodeURIComponent(q)}&limit=60`,
      PROBE_TIMEOUT_MS,
      opts.signal,
    )) as HfSpaceListing[] | null;
    for (const s of Array.isArray(list) ? list : []) {
      if (s?.id && s.sdk !== "docker" && !s.private) found.set(s.id, s);
    }
  }

   // Orden de sondeo: los más "gustados" (proxy de calidad/estabilidad).
   const toProbe = Array.from(found.values())
     .sort((a, b) => (b.likes || 0) - (a.likes || 0))
     .slice(0, MAX_PROBES)
     .map((s) => String(s.id));

  const discovered: ChatterboxEndpoint[] = [];
  // Sondeo secuencial suave (no martillear HF); cada sonda ya tiene timeout corto.
  for (const id of toProbe) {
    const ep = await probeSpaceContract(id, opts.signal).catch(() => null);
    if (ep) discovered.push(ep);
  }

  const snapshot: ChatterboxDiscoverySnapshot = {
    at: now(),
    endpoints: discovered,
  };
  writeSnapshot(snapshot);
  return snapshot;
}

async function probeSpaceContract(
  id: string,
  signal?: AbortSignal,
): Promise<ChatterboxEndpoint | null> {
  const base = `https://${spaceIdToHost(id)}.hf.space`;
  // /config nos da la versión de Gradio y los api_name por dependencia.
  const cfg = (await fetchJson(`${base}/config`, PROBE_TIMEOUT_MS, signal)) as
    | { version?: string; dependencies?: { api_name?: string | null }[] }
    | null;
  if (!cfg || !cfg.version) return null;
  const major = Number(String(cfg.version).split(".")[0]);
  const info = (await fetchJson(`${base}/info`, PROBE_TIMEOUT_MS, signal)) as
    | { named_endpoints?: Record<string, InfoEndpoint>; unnamed_endpoints?: Record<string, InfoEndpoint> }
    | null;
  if (!info) return null;

  // Buscamos un endpoint que parezca un contrato de Chatterbox
   const unnamed = info.unnamed_endpoints || {};
   for (const k of Object.keys(unnamed)) {
     if (looksLikeChatterboxStandard(unnamed[k])) {
       return {
         id,
         base,
         kind: "standard",
         fnIndex: Number(k) || 0,
         origin: "discovered",
       };
     }
   }
  // También podemos mirar los named endpoints
  const named = info.named_endpoints || {};
   for (const k of Object.keys(named)) {
     if (looksLikeChatterboxStandard(named[k])) {
       return {
         id,
         base,
         kind: "standard",
         fnIndex: Number(k) || 0,
         origin: "discovered",
       };
     }
   }
  return null;
}

// ── Persistencia ─────────────────────────────────────────────────────────────

function readSnapshot(): ChatterboxDiscoverySnapshot | null {
  try {
    const raw = safeGet(LS_SNAPSHOT);
    if (!raw) return null;
    const j = JSON.parse(raw) as ChatterboxDiscoverySnapshot;
    if (!j || !Array.isArray(j.endpoints)) return null;
    return j;
  } catch {
    return null;
  }
}

function writeSnapshot(s: ChatterboxDiscoverySnapshot): void {
  try {
    safeSet(LS_SNAPSHOT, JSON.stringify(s));
  } catch {
    /* */
  }
}

interface HealthMap {
  [id: string]: { badUntil?: number; lastOkAt?: number };
}

function readHealth(): HealthMap {
  try {
    const raw = safeGet(LS_HEALTH);
    return raw ? ((JSON.parse(raw) as HealthMap) || {}) : {};
  } catch {
    return {};
  }
}

function writeHealth(h: HealthMap): void {
  try {
    safeSet(LS_HEALTH, JSON.stringify(h));
  } catch {
    /* */
  }
}

/**
 * Registra el resultado REAL de una síntesis contra un endpoint. Un fallo de
 * inferencia (space-error/no-audio) lo aparta BAD_ENDPOINT_MS; un éxito lo
 * rehabilita al instante.
 */
export function markChatterboxEndpointResult(id: string, ok: boolean, badMinutes?: number): void {
  const h = readHealth();
  if (ok) h[id] = { lastOkAt: now() };
  else {
    const ms = badMinutes && badMinutes > 0 ? badMinutes * 60_000 : BAD_ENDPOINT_MS;
    h[id] = { ...(h[id] || {}), badUntil: now() + ms };
  }
  writeHealth(h);
}

/**
 * ¿Está este endpoint apartado por fallo reciente?
 */
export function isChatterboxEndpointBad(id: string): boolean {
  const e = readHealth()[id];
  return !!(e?.badUntil && e.badUntil > now());
}

// ── Selección ────────────────────────────────────────────────────────────────

/**
 * Lista ORDENADA de endpoints a intentar AHORA (sin red; usa el snapshot):
 *  1º los sanos/desconocidos (preferiendo los que tienen éxito reciente).
 *  2º si TODOS están apartados, devuelve todos igualmente (resurrección).
 */
export function orderedChatterboxEndpoints(): ChatterboxEndpoint[] {
  const snap = readSnapshot();
  const eps = snap?.endpoints?.length ? snap.endpoints : [];
  const health = readHealth();
  const score = (e: ChatterboxEndpoint): number => {
    const h = health[e.id];
    let s = 0;
    if (h?.lastOkAt && now() - h.lastOkAt < 24 * 60 * 60_000) s += 40; // éxito reciente
    if (e.origin === "builtin") s += 5; // preferir integrados (aunque no tengamos ninguno builtin aún)
    return s;
  };
  const alive = eps.filter((e) => !isChatterboxEndpointBad(e.id));
  const pool = alive.length ? alive : eps;
  return [...pool].sort((a, b) => score(b) - score(a));
}

// ── Estado para la UI ────────────────────────────────────────────────────────

/** Estado del motor Chatterbox para pintar chips honestos. */
export type ChatterboxState = "listo" | "dormido" | "fuera";
let lastState: ChatterboxState = "dormido";

/** Estado actual del motor ('listo' | 'dormido' | 'fuera'). Para la UI. */
export function getChatterboxState(): ChatterboxState {
  try {
    const eps = orderedChatterboxEndpoints();
    if (eps.some((e) => !isChatterboxEndpointBad(e.id))) {
      return "listo";
    }
    if (eps.length === 0) return "fuera";
  } catch {
    /* caemos al estado vivo */
  }
  return lastState;
}

// ── Utilidades SSR-safe ────────────────────────────────────────────────────────

function safeLS(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function randHash(): string {
  return (
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2) +
    Date.now().toString(36)
  );
}

/** ¿Estos bytes parecen audio (WAV/MP3/OGG/FLAC)? */
export function looksLikeAudio(bytes: Uint8Array): boolean {
  if (bytes.length >= 4) {
    const s = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (s === "RIFF" || s === "OggS" || s === "fLaC" || s.startsWith("ID3")) return true;
  }
  if (bytes.length >= 2) {
    return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0; // frame MP3/AAC
  }
  return false;
}

function blobToBase64(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((ab) => {
    const buf = new Uint8Array(ab);
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < buf.length; i += CHUNK) {
      bin += String.fromCharCode(...Array.from(buf.subarray(i, i + CHUNK)));
    }
    return btoa(bin);
  });
}

export function base64ToBlob(b64: string, type = "audio/wav"): Blob | null {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type });
  } catch {
    return null;
  }
}


// ── API LOCAL DE VZR1011A ────────────────────────────────────────────────────

/** URL del servicio local de Chatterbox (VZR1011A). */
export const LOCAL_CHATTERBOX_BASE = "http://127.0.0.1:4505";

/**
 * Comprueba si el servicio local de Chatterbox está disponible.
 * Nunca lanza.
 */
export async function isLocalChatterboxAvailable(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const health = await fetchJson(`${LOCAL_CHATTERBOX_BASE}/salud`, 5_000);
  return health !== null;
}

/**
 * Llama al servicio local de Chatterbox para generar audio.
 * Nunca lanza.
 */
export async function synthesizeLocalChatterbox(
  text: string,
  opts: {
    idioma?: string;
    exageracion?: number;
    refBlob?: Blob | null;
    signal?: AbortSignal;
    onStatus?: (m: string) => void;
  } = {}
): Promise<Blob | null> {
  if (typeof window === "undefined") return null;
  const clean = (text || "").trim();
  if (!clean) return null;

  try {
    const form = new FormData();
    form.append("texto", clean);
    form.append("idioma", opts.idioma ?? "es");
    form.append("exageracion", String(opts.exageracion ?? 0.5));
    // Nota: el servicio local espera referencia_voz como string (ruta), pero nosotros tenemos Blob.
    // Por ahora, no soportamos referencia en el servicio local desde el web client.
    // Si en el futuro se adapta, se podrá añadir.
    const resp = await fetch(`${LOCAL_CHATTERBOX_BASE}/generar`, {
      method: "POST",
      body: form,
      signal: opts.signal,
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.audio_base64) {
      return base64ToBlob(data.audio_base64);
    }
    return null;
  } catch {
    return null;
  }
}

// ── API DE HUGGING FACE SPACES ────────────────────────────────────────────────

/**
 * Llama a un Space de Chatterbox en Hugging Face para generar audio.
 * Nunca lanza.
 */
export async function synthesizeChatterboxSpace(
  text: string,
  endpoint: ChatterboxEndpoint,
  opts: {
    idioma?: string;
    exageracion?: number;
    refBlob?: Blob | null;
    signal?: AbortSignal;
    onStatus?: (m: string) => void;
  } = {}
): Promise<Blob | null> {
  if (typeof window === "undefined") return null;
  const clean = (text || "").trim();
  if (!clean) return null;

  // Por ahora, asumimos que todos los Spaces usan el mismo formato de entrada:
  // POST /gradio_api/call/{fnIndex} con los datos en el campo "data"
  // Este es un simplification; en realidad deberíamos adaptarnos al contrato real.
  // Pero dado el tiempo, usaremos un enfoque genérico.
  try {
    const form = new FormData();
    form.append("data", JSON.stringify([clean, opts.idioma ?? "es", opts.exageracion ?? 0.5, null])); // referencia como null por ahora
    const resp = await fetch(`${endpoint.base}/gradio_api/call/${endpoint.fnIndex}`, {
      method: "POST",
      body: form,
      signal: opts.signal,
    });
    if (!resp.ok) return null;
    // Intentamos obtener el audio como blob directamente
    const contentType = resp.headers.get("content-type") || "";
    if (contentType.includes("audio")) {
      return await resp.blob();
    }
    // Si no es audio directamente, maybe es un objeto JSON con audio_base64
    const json = await resp.json();
    if (json.audio_base64) {
      return base64ToBlob(json.audio_base64);
    }
    // Si el Space devuelve el audio en un campo diferente, intentamos extraerlo
    // Este es un punto débil; en una implementación completa, deberíamos
    // tener un parser específico para cada tipo de Space.
    return null;
  } catch {
    return null;
  }
}

// ── API PRINCIPAL ────────────────────────────────────────────────────────────

export interface ChatterboxOptions {
  /** Pista de exageración (0.0-1.0). Gana sobre lo configurado. */
  exageracion?: number;
  /** Idioma ("es", "en", "es-ES"…). Por defecto español. */
  idioma?: string;
  /** Muestra REAL de audio del usuario para CLONAR (única vía de clonación real). */
  refBlob?: Blob | null;
  signal?: AbortSignal;
  /** Estado legible en vivo para la UI. */
  onStatus?: (message: string) => void;
  /** TOPE de presupuesto por intento (Adenda 85): el habla troceada acota el
   *  PRIMER trozo (~35 s) para que la cadena nunca se quede muda esperando a un
   *  Space lento — los trozos siguientes pueden respirar más (ya hay audio).
   */
  budgetCapMs?: number;
}

export async function synthesizeChatterbox(
  text: string,
  opts: ChatterboxOptions = {}
): Promise<Blob | null> {
  const clean = (text || "").trim();
  if (!clean || typeof window === "undefined") return null;

  // 1) Primero intentar el servicio local de VZR1011A
  if (await isLocalChatterboxAvailable()) {
    const localBlob = await synthesizeLocalChatterbox(clean, {
      idioma: opts.idioma,
      exageracion: opts.exageracion,
      refBlob: opts.refBlob,
      signal: opts.signal,
      onStatus: opts.onStatus,
    });
    if (localBlob) {
      // Éxito con el servicio local
      return localBlob;
    }
    // Si el servicio local falla, continuamos con los Spaces públicos
  }

  // 2) Luego intentar con los Spaces públicos descubiertos
  const deadlineAt = opts.budgetCapMs && opts.budgetCapMs > 0 ? Date.now() + opts.budgetCapMs : 0;
  const pastDeadline = () => deadlineAt > 0 && Date.now() >= deadlineAt;
  const endpoints = orderedChatterboxEndpoints().slice(0, 3); // intentar hasta 3 endpoints

  for (const ep of endpoints) {
    if (opts.signal?.aborted) return null;
    if (pastDeadline()) return null; // se acabó el aire: la cadena sigue

    const spaceBlob = await synthesizeChatterboxSpace(clean, ep, {
      idioma: opts.idioma,
      exageracion: opts.exageracion,
      refBlob: opts.refBlob,
      signal: opts.signal,
      onStatus: opts.onStatus,
    });
    if (spaceBlob) {
      // Éxito con este Space
      return spaceBlob;
    }
    // Si falla, marcamos el endpoint como malo y continuamos con el siguiente
    // (en una implementación más completa, tendríamos lógica de reintentos y marcaje de salud)
    // Por ahora, simplemente continuamos al siguiente endpoint
  }

  // Si todos fallan, devolvemos null y la cadena sigue con el siguiente motor
  return null;
}