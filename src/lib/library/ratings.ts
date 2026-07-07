"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS — Biblioteca · VALORACIÓN LOCAL (estrellas) + CONTADOR DE USO
 * ---------------------------------------------------------------------------
 * Complemento honesto a la ficha rica de la Biblioteca (App Store / Play
 * Store): cada persona puede valorar 1–5 estrellas cualquier paquete
 * instalable, y el sistema lleva la cuenta de cuántas veces se ha ABIERTO
 * (acción real: "Abrir" en la ficha/tarjeta) desde que se instaló.
 *
 * HONESTIDAD RADICAL:
 *   · La valoración es SOLO local (tu opinión, en tu dispositivo/cuenta). No
 *     hay agregación social real todavía — no fingimos una media de "miles de
 *     usuarios"; mostramos exactamente lo que hay: tu propia estrella.
 *   · El contador de uso cuenta aperturas reales (abrir/instalar), nunca un
 *     número inventado.
 *
 * Persistencia (localStorage, soberana; SSR-safe y defensiva):
 *   · `starseed.library.ratings.v1` → { [packageId]: { stars, ratedAt } }
 *   · `starseed.library.usage.v1`   → { [packageId]: { count, lastUsedAt } }
 * Ambas claves viajan con la cuenta (SYNCED_KEYS en settings-sync.ts) para que
 * tu valoración y tu uso sigan a la misma cuenta soberana en cualquier
 * dispositivo (Identidad Soberana · CLAUDE.md §6).
 *
 * Emite el mismo evento `starseed:library` que el resto del motor de paquetes
 * para que toda la Biblioteca reaccione con un único listener.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const RATINGS_KEY = "starseed.library.ratings.v1";
export const USAGE_KEY = "starseed.library.usage.v1";
/** Mismo evento que packages.ts (LIBRARY_EVENT): un único canal para la UI. */
const LIBRARY_EVENT = "starseed:library";

export interface RatingEntry {
  /** 1–5 estrellas. */
  stars: number;
  /** Marca de tiempo de la última valoración. */
  ratedAt: number;
}

export interface UsageEntry {
  /** Nº de veces que se ha abierto/usado el paquete. */
  count: number;
  /** Marca de tiempo del último uso. */
  lastUsedAt: number;
}

function isClient(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readJson<T>(key: string): T | null {
  if (!isClient()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (!isClient()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* cuota / modo privado: degradamos en silencio */
  }
}

function emitLibraryEvent(): void {
  if (!isClient()) return;
  try {
    window.dispatchEvent(new Event(LIBRARY_EVENT));
  } catch {
    /* noop */
  }
}

/* ═══════════════════════════ Valoraciones ═══════════════════════════ */

function readRatingsMap(): Record<string, RatingEntry> {
  const raw = readJson<unknown>(RATINGS_KEY);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, RatingEntry> = {};
  for (const [id, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const stars = typeof e.stars === "number" ? Math.round(e.stars) : 0;
    if (stars < 1 || stars > 5) continue;
    out[id] = { stars, ratedAt: typeof e.ratedAt === "number" ? e.ratedAt : Date.now() };
  }
  return out;
}

/** Mapa completo de valoraciones (defensivo). */
export function getRatingsMap(): Record<string, RatingEntry> {
  return readRatingsMap();
}

/** Tu valoración (1–5) de un paquete, o `undefined` si aún no lo valoraste. */
export function getRating(id: string): number | undefined {
  return readRatingsMap()[id]?.stars;
}

/** Guarda/actualiza tu valoración (1–5 estrellas) de un paquete. */
export function setRating(id: string, stars: number): void {
  if (!isClient() || !id) return;
  const clamped = Math.max(1, Math.min(5, Math.round(stars)));
  const map = readRatingsMap();
  map[id] = { stars: clamped, ratedAt: Date.now() };
  writeJson(RATINGS_KEY, map);
  emitLibraryEvent();
}

/** Quita tu valoración de un paquete (vuelve a "sin valorar"). */
export function clearRating(id: string): void {
  if (!isClient() || !id) return;
  const map = readRatingsMap();
  if (!(id in map)) return;
  delete map[id];
  writeJson(RATINGS_KEY, map);
  emitLibraryEvent();
}

/* ═══════════════════════════ Contador de uso ═══════════════════════════ */

function readUsageMap(): Record<string, UsageEntry> {
  const raw = readJson<unknown>(USAGE_KEY);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, UsageEntry> = {};
  for (const [id, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    out[id] = {
      count: typeof e.count === "number" && e.count >= 0 ? e.count : 0,
      lastUsedAt: typeof e.lastUsedAt === "number" ? e.lastUsedAt : Date.now(),
    };
  }
  return out;
}

/** Mapa completo de uso (defensivo). */
export function getUsageMap(): Record<string, UsageEntry> {
  return readUsageMap();
}

/** Nº de veces que se ha abierto/usado un paquete (0 si nunca). */
export function getUsageCount(id: string): number {
  return readUsageMap()[id]?.count ?? 0;
}

/** Marca de tiempo del último uso, o `undefined` si nunca se usó. */
export function getLastUsedAt(id: string): number | undefined {
  return readUsageMap()[id]?.lastUsedAt;
}

/** Registra una apertura/uso real del paquete (incrementa el contador). */
export function recordUsage(id: string): void {
  if (!isClient() || !id) return;
  const map = readUsageMap();
  const prev = map[id];
  map[id] = { count: (prev?.count ?? 0) + 1, lastUsedAt: Date.now() };
  writeJson(USAGE_KEY, map);
  emitLibraryEvent();
}

/** Ids ordenados por uso descendente (para "Usados recientemente/más"). */
export function mostUsedIds(limit = 8): string[] {
  const map = readUsageMap();
  return Object.entries(map)
    .sort((a, b) => b[1].count - a[1].count || b[1].lastUsedAt - a[1].lastUsedAt)
    .slice(0, limit)
    .map(([id]) => id);
}
