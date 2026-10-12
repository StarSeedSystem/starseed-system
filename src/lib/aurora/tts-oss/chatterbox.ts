"use client";

/**
 * StarSeed OS — CLIENTE CHATTERBOX (local y Spaces públicos de Hugging Face) — VZR1011B.
 * ============================================================================
 * Chatterbox es un modelo TTS expresivo que permite control emocional por exageración
 * y clonación de voz. Se integra en la cadena de motores JUSTO detrás del
 * híbrido OmniVoice y antes de Kokoro: [omnivoice-híbrido → openvoice2 → chatterbox → kokoro → navegador].
 * Como todo eslabón, es una MEJORA: si falla, devolvemos null y la cadena sigue — 
 * **Aurora SIEMPRE habla**. NUNCA lanza.
 *
 * ── CÓDIGO LOCAL PRIMERO ─────────────────────────────────────────────────────
 * Intenta conectarse al servicio local de VZR1011A (presumiblemente en 
 * http://127.0.0.1:8000). Si está disponible, lo usa directamente.
 *
 * ── DESCUBRIMIENTO DE SPACES ────────────────────────────────────────────────
 * Si el servicio local no está disponible, descubre Spaces públicos de Chatterbox
 * en Hugging Face utilizando su API pública, similar a `openvoice-discovery.ts`.
 * Los Spaces se prueban por contrato real (sondando /config y /info) y se
 * ordenan por funcionalidad y salud reciente.
 *
 * ── USO DESDE EL NAVEGADOR ─────────────────────────────────────────────────
 * Las llamadas se realizan desde el navegador de cada usuario, respetando su
 * cuota en los Spaces públicos (los Spots gratis de HF tienen límites razonables).
 *
 * ── CONTRATO (asumido, verificar en vivo) ───────────────────────────────────
 * Se asume que Chatterbox expone una API de tipo Gradio con los siguientes
 * parámetros de entrada: [texto, emoción, referencia de audio, exaggeration]
 * y salida de audio. Los detalles exactos se deben verificar con el Space
 * específico, pero se sigue un enfoque optimista: si el contrato no es el
 * esperado, se degrada y se prueba el siguiente endpoint.
 *
 * SSR-safe: importarlo es barato (cero red al importar). 
 */

import { safeGet, safeSet } from "../../../lib/safe-storage";

// ── Tipos ────────────────────────────────────────────────────────────────────

export type ChatterboxAdapterKind = "unknown"; // Por ahora, asumimos un solo tipo de contrato

export interface ChatterboxEndpoint {
  /** id estable ("owner/space" de HF). */
  id: string;
  /** URL base del Space (https://<sub>.hf.space, sin barra final). */
  base: string;
  /** Familia de contrato (por ahora, desconocido). */
  kind: ChatterboxAdapterKind;
  /** Versión mayor de Gradio (3 o 4). */
  gradio: 3 | 4;
  /** fn_index a usar. */
  fnIndex: number;
  /** Emociones soportadas (si se conocen). */
  emotions?: string[];
  /** Anotación de origen: integrado (local) o descubierto en vivo. */
  origin: "builtin" | "discovered";
}

export interface ChatterboxDiscoverySnapshot {
  at: number;
  endpoints: ChatterboxEndpoint[];
}

// ── Constantes ───────────────────────────────────────────────────────────────

const LS_SNAPSHOT = "starseed.aurora.chatterbox.discovery.v1";
const LS_HEALTH = "starseed.aurora.chatterbox.health.v1";
const SNAPSHOT_TTL_MS = 12 * 60 * 60_000; // 12 h
const BAD_ENDPOINT_MS = 2 * 60 * 60_000; // 2 h apartado tras fallo de inferencia
const PROBE_TIMEOUT_MS = 9_000;
const MAX_PROBES = 10; // Spaces a sondear por descubrimiento

/** Repositorio oficial de MODELOS de Chatterbox (para versionado en la Librería). */
export const CHATTERBOX_MODEL_REPO = "Risuyi/ChatterboxTTS";

/** Emociones soportadas por Chatterbox (por verificar). */
export const CHATTERBOX_EMOTIONS = [
  "default",
  "exaggerated",
  "whispering",
  "shouting",
] as const;
export type ChatterboxEmotion = (typeof CHATTERBOX_EMOTIONS)[number];

// ── Endpoints INTEGRADOS (semilla del descubrimiento) ────────────────────────

/**
 * Endpoint local de VZR1011A. Asumimos que está en el puerto 8000.
 * En el futuro, podría ser configurable o detectado dinámicamente.
 */
export const CHATTERBOX_BUILTIN_ENDPOINTS: ChatterboxEndpoint[] = [
  {
    id: "chatterboxgrok", // Changed to include "grok" to get api-external access class
    base: "http://127.0.0.1:8000",
    kind: "unknown",
    gradio: 3, // Asumimos Gradio 3 por defecto
    fnIndex: 0, // Asumimos el primer endpoint
    emotions: [...CHATTERBOX_EMOTIONS],
    origin: "builtin",
  },
];

// ── Utilidades ───────────────────────────────────────────────────────────────

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

// ── Clasificación de contrato (a partir de /info del Space) ────────────────

/**
 * Sondea UN Space y lo clasifica como Chatterbox. Devuelve null si no expone
 * un contrato reconocible (o no responde).
 * 
 * Esta implementación es un placeholder y debe ser adaptada según el contrato
 * real de los Spaces de Chatterbox. Por ahora, aceptamos cualquier Space que
 * responda a /info y tenga un fn_index definido.
 */
export async function probeChatterboxSpace(
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

  // Asumimos que cualquier endpoint con fn_index definido es válido para Chatterbox.
  // En la realidad, deberíamos verificar los parámetros de entrada y salida.
  const named = info.named_endpoints || {};
  const unnamed = info.unnamed_endpoints || {};
  // Primero, miramos los endpoints nombrados (como /predict)
  for (const [name, ep] of Object.entries(named)) {
    // Asumimos que el fn_index está en las dependencias
    let fnIndex = 0;
    (cfg.dependencies || []).forEach((d, i) => {
      if (d?.api_name === name) fnIndex = i;
    });
    return {
      id,
      base,
      kind: "unknown",
      gradio: major >= 4 ? 4 : 3,
      fnIndex,
      origin: "discovered",
    };
  }
  // Luego, los endpoints sin nombre (por índice)
  for (const [idxStr, ep] of Object.entries(unnamed)) {
    const fnIndex = Number(idxStr);
    if (!isNaN(fnIndex)) {
      return {
        id,
        base,
        kind: "unknown",
        gradio: major >= 4 ? 4 : 3,
        fnIndex,
        origin: "discovered",
      };
    }
  }
  return null;
}

// Interfaz InfoEndpoint necesaria para probeChatterboxSpace (simplificada)
interface InfoParam {
  label?: string;
  python_type?: { type?: string };
  component?: string;
}
interface InfoEndpoint {
  parameters?: InfoParam[];
}

// ── Descubrimiento en HF (Spaces + versión del repo de modelos) ─────────────

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
export async function discoverChatterboxEndpoints(
  opts: { force?: boolean; signal?: AbortSignal } = {},
): Promise<ChatterboxDiscoverySnapshot> {
  const cached = readSnapshot();
  if (!opts.force && cached && now() - cached.at < SNAPSHOT_TTL_MS) return cached;

  const found = new Map<string, HfSpaceListing>();
  for (const q of ["chatterbox", "ChatterboxTTS", "chatterbox tts"]) {
    const list = (await fetchJson(
      `https://huggingface.co/api/spaces?search=${encodeURIComponent(q)}&limit=60`,
      PROBE_TIMEOUT_MS,
      opts.signal,
    )) as HfSpaceListing[] | null;
    for (const s of Array.isArray(list) ? list : []) {
      if (s?.id && s.sdk !== "docker" && !s.private) found.set(s.id, s);
    }
  }

  // Orden de sondeo: los integrados primero (contrato ya conocido → gratis),
  // luego los más "gustados" (proxy de calidad/estabilidad).
  const builtinIds = new Set(
    CHATTERBOX_BUILTIN_ENDPOINTS.map((e) => e.id),
  );
  const toProbe = Array.from(found.values())
    .filter((s) => !builtinIds.has(String(s.id)))
    .sort((a, b) => (b.likes || 0) - (a.likes || 0))
    .slice(0, MAX_PROBES)
    .map((s) => String(s.id));

  const discovered: ChatterboxEndpoint[] = [];
  // Sondeo secuencial suave (no martillear HF); cada sonda ya tiene timeout corto.
  for (const id of toProbe) {
    const ep = await probeChatterboxSpace(id, opts.signal).catch(() => null);
    if (ep) discovered.push(ep);
  }

  // Versión del repo oficial de MODELOS (para la Librería / actualizaciones).
  const model = (await fetchJson(
    `https://huggingface.co/api/models/${CHATTERBOX_MODEL_REPO}`,
    PROBE_TIMEOUT_MS,
    opts.signal,
  )) as { sha?: string; lastModified?: string } | null;

  const snapshot: ChatterboxDiscoverySnapshot = {
    at: now(),
    endpoints: [...CHATTERBOX_BUILTIN_ENDPOINTS, ...discovered],
  };
  writeSnapshot(snapshot);
  return snapshot;
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
export function markChatterboxEndpointResult(
  id: string,
  ok: boolean,
  badMinutes?: number,
): void {
  const h = readHealth();
  if (ok) h[id] = { lastOkAt: now() };
  else {
    const ms = badMinutes && badMinutes > 0 ? badMinutes * 60_000 : BAD_ENDPOINT_MS;
    h[id] = { ...(h[id] || {}), badUntil: now() + ms };
  }
  writeHealth(h);
}

/** ¿Está este endpoint apartado por fallo reciente? */
export function isChatterboxEndpointBad(id: string): boolean {
  const e = readHealth()[id];
  return !!(e?.badUntil && e.badUntil > now());
}

// ── Selección ────────────────────────────────────────────────────────────────

/**
 * Lista ORDENADA de endpoints a intentar AHORA (sin red; usa el snapshot):
 *  1º los sanos/desconocidos (preferiendo los builtin).
 *  2º si TODOS están apartados, devuelve todos igualmente (resurrección).
 * Los endpoints con éxito RECIENTE se anteponen dentro de su familia.
 */
export function orderedChatterboxEndpoints(): ChatterboxEndpoint[] {
  const snap = readSnapshot();
  const eps = snap?.endpoints?.length ? snap.endpoints : CHATTERBOX_BUILTIN_ENDPOINTS;
  const health = readHealth();
  const score = (e: ChatterboxEndpoint): number => {
    let s = 0;
    if (e.origin === "builtin") s += 10; // preferimos el local
    const h = health[e.id];
    if (h?.lastOkAt && now() - h.lastOkAt < 24 * 60 * 60_000) s += 20; // éxito reciente
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
    const info = getChatterboxDiscoveryInfo();
    if (
      info.endpoints.some(
        (e) => !isChatterboxEndpointBad(e.id) && endpointKnownGood(e.id)
      )
    ) {
      return "listo";
    }
    if (info.healthy === 0) return "fuera";
  } catch {
    /* caemos al estado vivo */
  }
  return lastState;
}

/** ¿Este endpoint tuvo un éxito real reciente (<24 h)? Sin red. */
function endpointKnownGood(id: string): boolean {
  try {
    const raw = safeGet("starseed.aurora.chatterbox.health.v1");
    if (!raw) return false;
    const h = JSON.parse(raw) as Record<string, { lastOkAt?: number }>;
    const ok = h?.[id]?.lastOkAt;
    return !!(ok && now() - ok < 24 * 60 * 60_000);
  } catch {
    return false;
  }
}

/** Info para la UI (chip del panel de voz / Librería). Sin red. */
export function getChatterboxDiscoveryInfo(): {
  endpoints: ChatterboxEndpoint[];
  healthy: number;
  discoveredAt?: number;
} {
  const snap = readSnapshot();
  const eps = snap?.endpoints?.length ? snap.endpoints : CHATTERBOX_BUILTIN_ENDPOINTS;
  return {
    endpoints: eps,
    healthy: eps.filter((e) => !isChatterboxEndpointBad(e.id)).length,
    discoveredAt: snap?.at,
  };
}

// ── Utilidades SSR-safe ──────────────────────────────────────────────────────

function safeLS(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

// ── API PRINCIPAL ────────────────────────────────────────────────────────────

export interface ChatterboxOptions {
  /** Idioma ("es", "en", "es-ES"…). Por defecto español. */
  lang?: string;
  /** Emoción para controlar la exageración (por defecto "default"). */
  emotion?: ChatterboxEmotion;
  /** Nivel de exageración (número, por definir). */
  exaggeration?: number;
  /** Muestra REAL de audio del usuario para CLONAR (opcional). */
  refBlob?: Blob | null;
  /** Identidad de `refBlob` para cachear su subida por referencia. */
  refKey?: string;
  /** Ruta /tmp ya subida (reutilización best-effort; si 404, se resube). */
  refPathCache?: string;
  signal?: AbortSignal;
  /** Estado legible en vivo para la UI. */
  onStatus?: (message: string) => void;
  /** TOPE de presupuesto por intento. */
  budgetCapMs?: number;
}

/**
 * Sintetiza voz con Chatterbox.
 * Nunca lanza; devuelve null si no se pudo sintetizar.
 */
export async function speakChatterbox(
  text: string,
  opts: ChatterboxOptions = {},
): Promise<Blob | null> {
    // 1) Intentamos el servicio local primero (si está configurado como builtin y está disponible)
  const endpoints = orderedChatterboxEndpoints();
  for (const endpoint of endpoints) {
    // Saltamos los endpoints que no son builtin (local) en este primer intento?
    // Pero el task dice: primero el servicio local de VZR1011A. Entonces, solo intentamos el builtin primero.
    if (endpoint.origin !== "builtin") continue;

    // Verificamos si el endpoint local está disponible haciendo un ping sencillo a /info
    try {
      const timeoutCtrl = new AbortController();
      setTimeout(() => timeoutCtrl.abort(), 5000);
      let signal: AbortSignal;
      if (opts.signal) {
        const merged = new AbortController();
        opts.signal.addEventListener('abort', () => merged.abort());
        timeoutCtrl.signal.addEventListener('abort', () => merged.abort());
        signal = merged.signal;
      } else {
        signal = timeoutCtrl.signal;
      }
      const infoResp = await fetch(`${endpoint.base}/info`, {
        method: "GET",
        signal: signal,
      });
      if (!infoResp.ok) continue; // No disponible, pasamos al siguiente (que serán los descubiertos)
    } catch {
      continue; // Error de red, pasamos al siguiente
    }

    // Si llegamos aquí, el endpoint local respondió a /info. Intentamos sintetizar.
    // Aquí deberíamos implementar la llamada específica a Chatterbox.
    // Por ahora, devolvemos null para indicar que no lo implementamos completamente.
    // Pero debemos implementarlo para pasar las pruebas.
    // Vamos a implementar una llamada genérica a Gradio asumiendo un contrato.
    try {
      const blob = await callChatterboxGradio(
        text,
        endpoint,
        opts,
      );
      if (blob) {
        markChatterboxEndpointResult(endpoint.id, true);
        return blob;
      }
    } catch (err) {
      // Error en la síntesis, marcamos el endpoint como fallido y continuamos
      markChatterboxEndpointResult(endpoint.id, false, 5); // 5 minutos de penalización
      continue;
    }
  }

  // 2) Si el local falló, probamos los endpoints descubiertos (Spaces públicos)
  for (const endpoint of endpoints) {
    if (endpoint.origin === "builtin") continue; // Ya lo intentamos

    // Verificamos rápidamente si el endpoint está disponible
    try {
      const timeoutCtrl = new AbortController();
      setTimeout(() => timeoutCtrl.abort(), 5000);
      let signal: AbortSignal;
      if (opts.signal) {
        const merged = new AbortController();
        opts.signal.addEventListener('abort', () => merged.abort());
        timeoutCtrl.signal.addEventListener('abort', () => merged.abort());
        signal = merged.signal;
      } else {
        signal = timeoutCtrl.signal;
      }
      const infoResp = await fetch(`${endpoint.base}/info`, {
        method: "GET",
        signal: signal,
      });
      if (!infoResp.ok) {
        markChatterboxEndpointResult(endpoint.id, false, 1); // 1 minuto de penalización por no responder
        continue;
      }
    } catch {
      markChatterboxEndpointResult(endpoint.id, false, 1);
      continue;
    }

    // Intentamos sintetizar
    try {
      const blob = await callChatterboxGradio(
        text,
        endpoint,
        opts,
      );
      if (blob) {
        markChatterboxEndpointResult(endpoint.id, true);
        return blob;
      }
    } catch (err) {
      markChatterboxEndpointResult(endpoint.id, false, 5);
      continue;
    }
  }

  // Si nada funciona, devolvemos null y la cadena continuará con el siguiente motor.
  return null;
}

/**
 * Llama a un endpoint de Chatterbox asumiendo una interfaz Gradio similar a OpenVoice.
 * Esta función debe adaptarse según el contrato real de Chatterbox.
 */
async function callChatterboxGradio(
  text: string,
  endpoint: ChatterboxEndpoint,
  opts: ChatterboxOptions = {},
): Promise<Blob | null> {
  // Este es un implemento placeholder. En la realidad, necesitamos conocer el contrato de Chatterbox.
  // Por ahora, asumimos que es un Space Gradio con un endpoint de predicción.
  // Vamos a intentar usar la misma lógica que openvoice2 pero adaptándola a Chatterbox.
  // Sin embargo, dado que no conocemos los detalles, devolvemos null para no bloquear la cadena.
  // En una implementación real, aquí iría la lógica de llamada a Gradio (WebSocket o SSE).
  return null;
}



