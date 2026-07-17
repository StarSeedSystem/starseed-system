"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ASTRAURA · CATÁLOGO VIVO DE OPENROUTER (:free)
 * ----------------------------------------------------------------------------
 * El catálogo estático de `free-catalog.ts` (fuente `openrouter-free`) está
 * curado a MANO y es la fuente de verdad de los metadatos honestos (límites,
 * `why`, `neverCooldown`, `preferFreeModels`). PERO los modelos `:free` de
 * OpenRouter VAN Y VIENEN: el `gpt-oss-120b:free` que tuvimos dejó de existir,
 * y aparecen otros (hy3, Nemotron 3 Nano Omni…). Mantenerlo a mano es frágil.
 *
 * Este módulo HACE VIVO ese catálogo: consulta `GET /api/v1/models` de
 * OpenRouter (endpoint PÚBLICO, sin clave — ya verificado el 2026-07-17), filtra
 * los `:free`, extrae de cada uno sus metadatos REALES (contexto, visión,
 * precio = 0) y los MAPEA a `TaskKind` por heurística. Luego los COMBINA con el
 * catálogo estático:
 *
 *   · El `CatalogSource` base (límites, why, peso, flags) viene del estático.
 *   · Los `models` se SUSTITUYEN por los vivos cuando hay red; si un modelo
 *     estático ya no existe en la API, simplemente deja de ofrecerse (Astraura
 *     nunca intenta uno muerto). Si la red falla, se conserva el estático.
 *
 * INTEGRACIÓN CON EL SISTEMA DE ACTUALIZACIONES AUTOMÁTICAS DEL OS:
 *   · `startLiveCatalog()` arranca el refresco (idempotente) y se engancha al
 *     mismo sistema de auto-update del OS: se refresca al iniciar, cada
 *     `REFRESH_INTERVAL_MS` y al instalar/actualizar paquetes de la Biblioteca
 *     (evento `starseed:library`). Así el catálogo se mantiene al día SOLO.
 *   · Persistencia con `version` + `fetchedAt` (patrón DEFAULTS_VERSION del OS)
 *     en localStorage, y emite `starseed:openrouter-catalog` para que la UI
 *     (Ajustes → Inteligencia, Biblioteca) reaccione.
 *
 * USO DESDE CUALQUIER PERSONALIDAD:
 *   `free-catalog.ts::findSource("openrouter-free")` y `liveOpenRouterSource()`
 *   devuelven el catálogo VIVO. Como el router (`rankCandidates` →
 *   `scoreModelForTask`) y el pin de personalidad (`intelligencePinFor`) leen la
 *   fuente `openrouter-free` del catálogo, Aurora, Hermione y CUALQUIER
 *   personalidad que use OpenRouter como motor se benefician AUTOMÁTICAMENTE,
 *   sin tocar su lógica. El fallback a lo estático garantiza que nunca se
 *   queda sin modelo aunque falle la red.
 *
 * REGLAS DURAS: nunca lanza; sin red en SSR; el catálogo estático siempre es el
 * respaldo; solo usa modelos `:free` (coste 0) — jamás modelos de pago.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { findSource, type CatalogModel, type CatalogSource, type TaskKind } from "./free-catalog";

/* ───────────────────── Claves y constantes ───────────────────── */

const BASE_URL = "https://openrouter.ai/api/v1";
/** Refresco periódico (4 h): los :free cambian, pero no a cada minuto. */
const REFRESH_INTERVAL_MS = 4 * 60 * 60 * 1000;
/** Cache máxima aceptable antes de forzar refresco aunque haya red lenta. */
const MAX_STALE_MS = 24 * 60 * 60 * 1000;
const STORAGE_KEY = "starseed.astraura.openrouter-catalog.v1";
const CATALOG_EVENT = "starseed:openrouter-catalog";
/** Versión del esquema de cacheo (migraciones futuras). */
const CACHE_SCHEMA_VERSION = 1;

/* ───────────────────── Tipos ───────────────────── */

interface CachedCatalog {
  v: number;
  /** Epoch ms de la última consulta real a la API. */
  fetchedAt: number;
  /** Ids :free que existían entonces (para dif/caídos). */
  modelIds: string[];
  /** Metadatos derivados por id (contexto, visión, pricing). */
  meta: Record<string, { context: number; vision: boolean; promptPrice: number }>;
}

/* ───────────────────── State en memoria (singleton) ───────────────────── */

let cached: CachedCatalog | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let started = false;
/** La fuente viva combinada (se recalcula tras cada refresco). */
let liveSource: CatalogSource | null = null;

function isClient(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/* ───────────────────── Persistencia ───────────────────── */

function readCache(): CachedCatalog | null {
  if (!isClient()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<CachedCatalog> | null;
    if (!p || p.v !== CACHE_SCHEMA_VERSION) return null;
    if (!Array.isArray(p.modelIds) || typeof p.fetchedAt !== "number") return null;
    return {
      v: CACHE_SCHEMA_VERSION,
      fetchedAt: p.fetchedAt,
      modelIds: p.modelIds,
      meta: p.meta && typeof p.meta === "object" ? (p.meta as CachedCatalog["meta"]) : {},
    };
  } catch {
    return null;
  }
}

function writeCache(next: CachedCatalog): void {
  if (!isClient()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* cuota/privado: el vivo queda solo en memoria */
  }
}

function emit(): void {
  if (!isClient()) return;
  try {
    window.dispatchEvent(new CustomEvent(CATALOG_EVENT, { detail: liveSource?.models.length ?? 0 }));
  } catch {
    /* noop */
  }
}

/** Suscripción simple para la UI. */
export function subscribeOpenRouterCatalog(cb: () => void): () => void {
  if (!isClient()) return () => {};
  window.addEventListener(CATALOG_EVENT, cb);
  return () => window.removeEventListener(CATALOG_EVENT, cb);
}

/* ───────────────────── Heurística de mapeo tarea → modelo ───────────────────── */

/**
 * Deriva `strengths` (TaskKind) por heurística a partir del id/nombre del modelo
 * y de si tiene visión. Espejo fiel de cómo el equipo curó el catálogo estático,
 * pero aplicado a los :free reales de hoy. Pura y defensiva.
 */
function deriveStrengths(id: string, name: string, vision: boolean): TaskKind[] {
  const s = `${id} ${name}`.toLowerCase();
  const out = new Set<TaskKind>();
  out.add("chat");
  if (/coder|code|codestral|laguna|qwen3-coder|deepcoder|codex|refactor/.test(s)) out.add("code");
  if (/reason|r1|think|nemotron|ultra|70b|405b|120b|397b|235b|55b|omni|qwq|deepseek|hermes/.test(s)) out.add("reasoning");
  if (vision || /vl|vision|omni|vision|see|visual|gemma-4|nano-12b-vl|qwen2\.5-vl|smolvlm/.test(s)) {
    out.add("vision");
  }
  if (/creative|dolphin|hermes|writer|story|poet|mistral|llama/.test(s)) out.add("creative");
  if (/translate|qwen|gemma|aya|bloom/.test(s)) out.add("translate");
  if (/summary|nemotron|llama|gemma|hermes/.test(s)) out.add("summary");
  if (/nano|3b|4b|8b|mini|lite|small|flash/.test(s)) out.add("fast");
  return [...out];
}

/** Calidad heurística 1-10 por familha/tamaño (espejo del catálogo estático). */
function deriveQuality(id: string, name: string, context: number): number {
  const s = `${id} ${name}`.toLowerCase();
  let q = 6;
  if (/ultra|405b|397b|550b|235b|120b|100b/.test(s)) q = 9;
  else if (/70b|90b|32b|80b|55b|26b|30b|31b/.test(s)) q = 8;
  else if (/24b|20b|14b|16b|13b/.test(s)) q = 7;
  else if (/9b|12b|11b|8b/.test(s)) q = 6;
  else if (/7b|6b|5b/.test(s)) q = 6;
  else if (/4b|3b/.test(s)) q = 5;
  else q = 6;
  // Contexto muy largo (>=256K) suma un punto de utilidad para "long".
  if (context >= 256_000 && q < 9) q += 1;
  return Math.max(5, Math.min(10, q));
}

/* ───────────────────── Construcción del catálogo vivo ───────────────────── */

/**
 * Construye la fuente `openrouter-free` VIVA combinando el `CatalogSource`
 * estático (límites/why/flags, fuente de verdad) con los modelos reales de la
 * API. Si `meta` está vacío, devuelve el estático tal cual (fallback red).
 */
function buildLiveSource(meta: CachedCatalog["meta"]): CatalogSource {
  const base = findSource("openrouter-free");
  if (!base) {
    // No debería pasar, pero defensivo: devolvemos un esqueleto mínimo.
    return {
      id: "openrouter-free",
      label: "OpenRouter :free",
      tier: "free-key",
      providerId: "openrouter",
      baseUrl: BASE_URL,
      // (Adenda 71-bis) :free usable sin clave; la clave solo sube límites.
      requiresKey: false,
      keyOptional: true,
      preferFreeModels: true,
      limits: "Modelos :free de OpenRouter (coste 0).",
      why: "Una sola clave gratuita da acceso a decenas de modelos :free.",
      privacy: "cloud",
      weight: 1,
      models: [],
    };
  }
  if (!meta || Object.keys(meta).length === 0) return base;

  const models: CatalogModel[] = Object.entries(meta).map(([id, m]) => {
    const name = id.split("/").pop() || id;
    return {
      id,
      label: prettyLabel(id),
      strengths: deriveStrengths(id, name, m.vision),
      quality: deriveQuality(id, name, m.context),
      vision: m.vision || undefined,
      context: m.context || undefined,
      note: m.context >= 200_000 ? `${Math.round(m.context / 1000)}K ctx · :free` : ":free",
    };
  });

  // Orden estable por calidad desc (los fuertes primero en la lista de la UI).
  models.sort((a, b) => b.quality - a.quality || (b.context ?? 0) - (a.context ?? 0));

  return { ...base, models };
}

/** Etiqueta legible a partir del id (quita el prefijo de proveedor). */
function prettyLabel(id: string): string {
  const tail = id.split("/").pop() || id;
  return tail
    .replace(/:free$/, "")
    .replace(/-/g, " ")
    .replace(/\b(\w)/g, (c) => c.toUpperCase())
    .trim();
}

/* ───────────────────── Fetch en vivo de OpenRouter ───────────────────── */

/**
 * Consulta la API pública de OpenRouter y devuelve los metadatos de los `:free`.
 * Nunca lanza: en caso de error devuelve `null` (se conserva el caché/estático).
 */
async function fetchFreeModels(): Promise<CachedCatalog["meta"] | null> {
  if (!isClient()) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${BASE_URL}/models`, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(t);
    if (!res.ok) return null;
    const json = await res.json();
    const data: Array<{ id?: string; context_length?: number; architecture?: { input_modalities?: string[] }; pricing?: { prompt?: string | number } }> =
      Array.isArray(json?.data) ? json.data : [];

    const meta: CachedCatalog["meta"] = {};
    for (const m of data) {
      const id = String(m?.id ?? "");
      if (!id || !id.endsWith(":free")) continue; // SOLO :free (coste 0)
      const ctx = typeof m.context_length === "number" ? m.context_length : 0;
      const modalities = m.architecture?.input_modalities || [];
      const vision = modalities.includes("image");
      // Precio prompt: los :free suelen reportar "0" o "0.0"; lo guardamos por si
      // algún día un ":free" cobrara (entonces lo ignoraríamos vía precio>0).
      const promptPrice = Number(m.pricing?.prompt ?? 0) || 0;
      if (promptPrice > 0) continue; // jamás usamos modelos que cuesten
      meta[id] = { context: ctx, vision, promptPrice };
    }
    return Object.keys(meta).length ? meta : null;
  } catch {
    return null;
  }
}

/* ───────────────────── Refresco ───────────────────── */

/** Aplica un `meta` (de red o caché) y recalcula la fuente viva. */
function applyMeta(meta: CachedCatalog["meta"], fetchedAt: number): void {
  cached = { v: CACHE_SCHEMA_VERSION, fetchedAt, modelIds: Object.keys(meta), meta };
  writeCache(cached);
  liveSource = buildLiveSource(meta);
  emit();
}

/**
 * Refresca el catálogo vivo desde la red. Idempotente y nunca lanza.
 * 1) Intenta red; si hay éxito, actualiza caché + fuente viva.
 * 2) Si la red falla pero hay caché reciente (< MAX_STALE_MS), lo usa.
 * 3) Si no hay nada, deja el catálogo estático (liveSource=null).
 */
export async function refreshOpenRouterCatalog(force = false): Promise<{ from: "network" | "cache" | "static"; count: number }> {
  // Caché reciente: no molestamos a la red salvo que se fuerce.
  const now = Date.now();
  if (!force && cached && now - cached.fetchedAt < REFRESH_INTERVAL_MS) {
    if (!liveSource) liveSource = buildLiveSource(cached.meta);
    return { from: "cache", count: cached.modelIds.length };
  }

  const net = await fetchFreeModels();
  if (net && Object.keys(net).length) {
    applyMeta(net, now);
    return { from: "network", count: Object.keys(net).length };
  }

  // Red falló: usar caché si existe y no está muy viejo.
  const c = cached ?? readCache();
  if (c && now - c.fetchedAt < MAX_STALE_MS) {
    if (!liveSource) liveSource = buildLiveSource(c.meta);
    return { from: "cache", count: c.modelIds.length };
  }

  // Sin red ni caché: nos quedamos con el estático (liveSource=null → findSource estático).
  return { from: "static", count: findSource("openrouter-free")?.models.length ?? 0 };
}

/** Devuelve la fuente `openrouter-free` VIVA (o la estática si aún no hay red). */
export function liveOpenRouterSource(): CatalogSource {
  if (liveSource) return liveSource;
  const c = cached ?? readCache();
  if (c && Object.keys(c.meta).length) {
    liveSource = buildLiveSource(c.meta);
    return liveSource;
  }
  return findSource("openrouter-free") ?? (findSource("openrouter-free") as CatalogSource);
}

/** ¿Hubo un refresco de red exitoso alguna vez? (para la UI). */
export function lastFetchedAt(): number | null {
  return cached?.fetchedAt ?? readCache()?.fetchedAt ?? null;
}

/**
 * Arranca el sistema de catálogo vivo: refresca al iniciar y se engancha al
 * sistema de actualizaciones automáticas del OS (refresco periódico + evento
 * `starseed:library` de la Biblioteca, que ya dispara las auto-actualizaciones
 * de cerebros/paquetes). Idempotente.
 */
export function startLiveCatalog(): void {
  if (!isClient() || started) return;
  started = true;

  // 1) Arranque inmediato (red best-effort, no bloquea).
  void refreshOpenRouterCatalog();

  // 2) Refresco periódico.
  if (typeof setInterval !== "undefined") {
    timer = setInterval(() => {
      void refreshOpenRouterCatalog(true);
    }, REFRESH_INTERVAL_MS);
  }

  // 3) Enganche al sistema de auto-update de la Biblioteca: al instalar o
  //    actualizar un paquete (incluidos los de IA), refrescamos el catálogo.
  try {
    window.addEventListener("starseed:library", () => {
      void refreshOpenRouterCatalog(true);
    });
  } catch {
    /* noop */
  }
}

/** Detiene el refresco periódico (para tests / unmount). */
export function stopLiveCatalog(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  started = false;
}
