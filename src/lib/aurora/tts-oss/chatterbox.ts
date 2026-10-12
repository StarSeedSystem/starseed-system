/**
 * chatterbox.ts — CLIENTE DE CHATTERBOX TTS (local y Spaces públicos de Hugging Face).
 * ============================================================================
 * Este módulo proporciona acceso a Chatterbox TTS mediante:
 *   1. Servicio local de VZR1011A (puerto 8000) si está disponible.
 *   2. Descubrimiento de Spaces públicos de Chatterbox en Hugging Face API,
 *      sondeando el contrato real y manteniendo memoria de salud.
 * 
 * Está diseñado para ser usado desde el motor de voz de Aurora, siguiendo el
 * patrón de `openvoice-discovery.ts` y `openvoice2` en el registro.
 * 
 * SSR-safe, nunca lanza, y usa almacenamiento seguro para caché.
 */

import { safeGet, safeSet } from "@/lib/safe-storage";

// ── Tipos ──────────────────────────────────────────────────────────────────────

export type ChatterboxAdapterKind = "predict"; // Asumimos un solo tipo de contrato por ahora

export interface ChatterboxEndpoint {
  /** id estable ("owner/space" de HF). */
  id: string;
  /** URL base del Space (https://<sub>.hf.space, sin barra final). */
  base: string;
  /** Familia de contrato (elige el protocolo y el mapeo de parámetros). */
  kind: ChatterboxAdapterKind;
  /** Versión mayor de Gradio (3 = cola WS, 4 = cola SSE). */
  gradio: 3 | 4;
  /** fn_index a usar (para /predict). */
  fnIndex: number;
  /** Anotación de origen: integrado o descubierto en vivo. */
  origin: "builtin" | "discovered";
}

export interface ChatterboxDiscoverySnapshot {
  at: number;
  endpoints: ChatterboxEndpoint[];
  /** sha del repo oficial de modelos (versión de la "última Chatterbox"). */
  modelSha?: string;
  modelUpdatedAt?: string;
}

// ── Constantes ────────────────────────────────────────────────────────────────

const LS_SNAPSHOT = "starseed.aurora.chatterbox.discovery.v1";
const LS_HEALTH = "starseed.aurora.chatterbox.health.v1";
const SNAPSHOT_TTL_MS = 12 * 60 * 60_000; // 12 h
const BAD_ENDPOINT_MS = 2 * 60 * 60_000; // 2 h apartado tras fallo de inferencia
const PROBE_TIMEOUT_MS = 9_000;
const MAX_PROBES = 10; // Spaces a sondear por descubrimiento

/** Repo oficial de MODELOS (versión canónica de la última Chatterbox). */
export const CHATTERBOX_MODEL_REPO = "resemble-ai/ChatterboxTTS";

/**
 * Endpoints INTEGRADOS (semilla del descubrimiento; verificados a mano).
 * El descubrimiento vivo puede añadir más por encima de estos.
 */
export const CHATTERBOX_BUILTIN_ENDPOINTS: ChatterboxEndpoint[] = [
  // TODO: Añadir endpoints builtin conocidos de Chatterbox en HF Spaces.
  // Por ahora, vacío; el descubrimiento encontrará espacios públicos.
];

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

async function fetchJson(url: string, timeoutMs = PROBE_TIMEOUT_MS, signal?: AbortSignal): Promise<unknown> {
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

// ── Clasificación de contrato (a partir de /info del Space) ────────────────────

interface InfoParam {
  label?: string;
  python_type?: { type?: string };
  component?: string;
}
interface InfoEndpoint {
  parameters?: InfoParam[];
}

/**
 * ¿Es la firma [texto, referencia_audio, emoción_opcional, ...]? 
 * Este es un contrato de ejemplo; debe ajustarse al contrato real de Chatterbox.
 */
export function looksLikeChatterboxContract(ep: InfoEndpoint | undefined): boolean {
  // TODO: Implementar basado en el contrato real de Chatterbox Spaces.
  // Por ahora, devolvemos false para evitar falsos positivos.
  return false;
}

// ── Descubrimiento en HF (Spaces + versión del repo de modelos) ────────────────

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
  // TODO: Implementar descubrimiento similar a openvoice-discovery.ts.
  // Por ahora, devolvemos un snapshot vacío o con los builtins.
  const cached = readSnapshot();
  if (!opts.force && cached && now() - cached.at < SNAPSHOT_TTL_MS) {
    return cached;
  }

  // Placeholder: en una implementación real, aquí buscaríamos Spaces de Chatterbox.
  const snapshot: ChatterboxDiscoverySnapshot = {
    at: now(),
    endpoints: [...CHATTERBOX_BUILTIN_ENDPOINTS],
    modelSha: undefined,
    modelUpdatedAt: undefined,
  };
  writeSnapshot(snapshot);
  return snapshot;
}

// ── Persistencia ───────────────────────────────────────────────────────────────

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

// ── Selección ────────────────────────────────────────────────────────────────

/**
 * Registra el resultado REAL de una síntesis contra un endpoint. Un fallo de
 * inferencia lo aparta BAD_ENDPOINT_MS; un éxito lo rehabilita al instante.
 */
export function markChatterboxEndpointResult(id: string, ok: boolean): void {
  const h = readHealth();
  if (ok) {
    h[id] = { lastOkAt: now() };
  } else {
    const ms = BAD_ENDPOINT_MS;
    h[id] = { ...(h[id] || {}), badUntil: now() + ms };
  }
  writeHealth(h);
}

/** ¿Está este endpoint apartado por fallo reciente? */
export function isChatterboxEndpointBad(id: string): boolean {
  const e = readHealth()[id];
  return !!(e?.badUntil && e.badUntil > now());
}

/**
 * Lista ORDENADA de endpoints a intentar AHORA (sin red; usa el snapshot):
 *  Los endpoints con éxito RECIENTE se anteponen dentro de su familia.
 */
export function orderedChatterboxEndpoints(): ChatterboxEndpoint[] {
  const snap = readSnapshot();
  const eps = snap?.endpoints?.length ? snap.endpoints : CHATTERBOX_BUILTIN_ENDPOINTS;
  const health = readHealth();
  const score = (e: ChatterboxEndpoint): number => {
    const h = health[e.id];
    let s = 0;
    if (e.origin === "builtin") s += 5; // preferimos los integrados
    if (h?.lastOkAt && now() - h.lastOkAt < 24 * 60 * 60_000) s += 40; // lo que FUNCIONA manda
    return s;
  };
  const alive = eps.filter((e) => !isChatterboxEndpointBad(e.id));
  const pool = alive.length ? alive : eps;
  return [...pool].sort((a, b) => score(b) - score(a));
}

// ── Info para la UI ────────────────────────────────────────────────────────────

export function getChatterboxDiscoveryInfo(): {
  endpoints: ChatterboxEndpoint[];
  healthy: number;
  modelSha?: string;
  modelUpdatedAt?: string;
  discoveredAt?: number;
} {
  const snap = readSnapshot();
  const eps = snap?.endpoints?.length ? snap.endpoints : CHATTERBOX_BUILTIN_ENDPOINTS;
  return {
    endpoints: eps,
    healthy: eps.filter((e) => !isChatterboxEndpointBad(e.id)).length,
    modelSha: snap?.modelSha,
    modelUpdatedAt: snap?.modelUpdatedAt,
    discoveredAt: snap?.at,
  };
}

// ── Funciones de motor ────────────────────────────────────────────────────────

/**
 * Comprueba si el servicio local de Chatterbox (VZR1011A) está disponible.
 * Asumimos que está en http://127.0.0.1:8000 y tiene un endpoint de salud.
 */
export const chatterboxLocalAvailable = async (): Promise<boolean> => {
  if (typeof window === "undefined") return false;
  try {
    const resp = await fetch("http://127.0.0.1:8000/health", { timeout: 2000 });
    return resp.ok;
  } catch {
    return false;
  }
};

/**
 * Sintetiza voz usando Chatterbox.
 * Primero intenta el servicio local; si falla, usa el primer endpoint disponible del descubrimiento.
 */
export const chatterboxSpeak = async (text: string): Promise<Blob | null> => {
  if (typeof window === "undefined") return null;

  // 1) Intentar servicio local
  if (await chatterboxLocalAvailable()) {
    try {
      const resp = await fetch("http://127.0.0.1:8000/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (resp.ok) {
        const blob = await resp.blob();
        return blob;
      }
    } catch {
      /* continuar con descubrimiento */
    }
  }

  // 2) Usar descubrimiento
  const endpoints = orderedChatterboxEndpoints();
  for (const ep of endpoints) {
    try {
      // Construir URL del endpoint de síntesis (asumimos /predict para Gradio)
      const url = new URL(`/api/predict/`, ep.base).toString();
      // TODO: Ajustar el payload según el contrato real de Chatterbox.
      const payload = {
        data: [text, /* otros parámetros según contrato */],
      };
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (resp.ok) {
        const result = await resp.json();
        // TODO: Extraer el audio del resultado según el formato de Gradio.
        // Por ahora, asumimos que el resultado contiene un blob URL o base64.
        // Esto es altamente dependiente de la implementación del Space.
        // Deberíamos adaptarlo al contrato real.
        return null; // Placeholder
      } else {
        markChatterboxEndpointResult(ep.id, false);
      }
    } catch {
      markChatterboxEndpointResult(ep.id, false);
    }
  }

  return null;
};