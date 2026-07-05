"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ASTRAURA · USO, LÍMITES Y ENFRIAMIENTO (que Aurora nunca deje de funcionar)
 * ---------------------------------------------------------------------------
 * Registra cuánto se usa cada fuente (peticiones y tokens por día) para que el
 * usuario VEA su consumo y sus límites en Ajustes → Inteligencia, y para que
 * el router sepa cuándo una fuente se ha agotado.
 *
 * Cuando una fuente devuelve 429 / cuota agotada, se marca en COOLDOWN: el
 * router la salta y usa automáticamente la siguiente mejor opción (local /
 * gratuita), de modo que Aurora sigue respondiendo pase lo que pase.
 *
 * Todo en localStorage (por dispositivo), SSR-safe y defensivo. Los límites
 * declarados son los del tier gratis (informativos, se resetean por día UTC).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { findSource } from "./free-catalog";

export const USAGE_KEY = "starseed.astraura.usage.v1";
export const COOLDOWN_KEY = "starseed.astraura.cooldown.v1";
export const USAGE_EVENT = "starseed:astraura-usage";

/** Minutos de enfriamiento por defecto al agotar una fuente. */
const DEFAULT_COOLDOWN_MIN = 60;

/** Límites gratuitos aproximados por fuente (peticiones/día). Informativos. */
export const FREE_DAILY_LIMITS: Record<string, { reqPerDay?: number; note?: string }> = {
  "groq-free": { reqPerDay: 1000, note: "~30/min · varía por modelo" },
  "cerebras-free": { reqPerDay: undefined, note: "1M tokens/día" },
  "openrouter-free": { reqPerDay: 50, note: "1.000/día con recarga única de $10" },
  "gemini-free": { reqPerDay: 250, note: "flash-lite ~1.000/día" },
  "mistral-free": { note: "~1B tokens/mes" },
  "nvidia-nim-free": { reqPerDay: 1000 },
  "github-models-free": { reqPerDay: 150 },
  "pollinations-text": { note: "sin clave · puede haber colas" },
};

export interface DayUsage {
  /** Fecha UTC YYYY-MM-DD. */
  day: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  lastModel?: string;
  lastAt?: number;
}

type UsageStore = Record<string, DayUsage>; // sourceId → uso del día en curso

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function readUsage(): UsageStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(USAGE_KEY);
    const p = raw ? JSON.parse(raw) : {};
    return p && typeof p === "object" ? p : {};
  } catch {
    return {};
  }
}

function writeUsage(store: UsageStore): void {
  try {
    window.localStorage.setItem(USAGE_KEY, JSON.stringify(store));
    window.dispatchEvent(new CustomEvent(USAGE_EVENT));
  } catch { /* */ }
}

/** Registra una petición exitosa a una fuente (suma tokens si se conocen). */
export function noteUsage(
  sourceId: string,
  model: string,
  usage?: { inputTokens?: number; outputTokens?: number }
): void {
  if (typeof window === "undefined") return;
  const store = readUsage();
  const day = todayUTC();
  const cur = store[sourceId];
  const base: DayUsage = cur && cur.day === day
    ? cur
    : { day, requests: 0, inputTokens: 0, outputTokens: 0 };
  base.requests += 1;
  base.inputTokens += usage?.inputTokens ?? 0;
  base.outputTokens += usage?.outputTokens ?? 0;
  base.lastModel = model;
  base.lastAt = Date.now();
  store[sourceId] = base;
  writeUsage(store);
}

/** Uso del día en curso de una fuente (o cero). */
export function usageFor(sourceId: string): DayUsage {
  const store = readUsage();
  const u = store[sourceId];
  const day = todayUTC();
  return u && u.day === day ? u : { day, requests: 0, inputTokens: 0, outputTokens: 0 };
}

/** Uso de TODAS las fuentes con actividad hoy (para el panel). */
export function allUsageToday(): { sourceId: string; label: string; usage: DayUsage; limit?: number; note?: string }[] {
  const store = readUsage();
  const day = todayUTC();
  const out: { sourceId: string; label: string; usage: DayUsage; limit?: number; note?: string }[] = [];
  for (const [sourceId, usage] of Object.entries(store)) {
    if (usage.day !== day) continue;
    const lim = FREE_DAILY_LIMITS[sourceId];
    out.push({
      sourceId,
      label: findSource(sourceId)?.label ?? sourceId,
      usage,
      limit: lim?.reqPerDay,
      note: lim?.note,
    });
  }
  return out.sort((a, b) => b.usage.requests - a.usage.requests);
}

/**
 * Porcentaje de consumo del límite diario gratis (0-100) o null si la fuente
 * no tiene un tope de peticiones/día declarado.
 */
export function dailyPercent(sourceId: string): number | null {
  const lim = FREE_DAILY_LIMITS[sourceId]?.reqPerDay;
  if (!lim) return null;
  const u = usageFor(sourceId);
  return Math.min(100, Math.round((u.requests / lim) * 100));
}

/* ───────────────────── Enfriamiento (cooldown) ───────────────────── */

type CooldownStore = Record<string, number>; // sourceId → timestamp de fin (ms)

function readCooldown(): CooldownStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(COOLDOWN_KEY);
    const p = raw ? JSON.parse(raw) : {};
    return p && typeof p === "object" ? p : {};
  } catch {
    return {};
  }
}

function writeCooldown(store: CooldownStore): void {
  try {
    window.localStorage.setItem(COOLDOWN_KEY, JSON.stringify(store));
    window.dispatchEvent(new CustomEvent(USAGE_EVENT));
  } catch { /* */ }
}

/** ¿La fuente está enfriándose ahora mismo (cuota agotada recientemente)? */
export function isCoolingDown(sourceId: string): boolean {
  const store = readCooldown();
  const until = store[sourceId];
  return typeof until === "number" && Date.now() < until;
}

/** Marca una fuente como agotada durante `minutes` (por defecto 60). */
export function markCooldown(sourceId: string, minutes = DEFAULT_COOLDOWN_MIN): void {
  const store = readCooldown();
  store[sourceId] = Date.now() + minutes * 60_000;
  writeCooldown(store);
}

/** Limpia el enfriamiento de una fuente (el usuario fuerza reintento). */
export function clearCooldown(sourceId: string): void {
  const store = readCooldown();
  if (sourceId in store) {
    delete store[sourceId];
    writeCooldown(store);
  }
}

/** Fuentes actualmente en cooldown con su tiempo restante (para el panel). */
export function activeCooldowns(): { sourceId: string; label: string; minutesLeft: number }[] {
  const store = readCooldown();
  const now = Date.now();
  const out: { sourceId: string; label: string; minutesLeft: number }[] = [];
  for (const [sourceId, until] of Object.entries(store)) {
    if (typeof until === "number" && now < until) {
      out.push({
        sourceId,
        label: findSource(sourceId)?.label ?? sourceId,
        minutesLeft: Math.ceil((until - now) / 60_000),
      });
    }
  }
  return out;
}
