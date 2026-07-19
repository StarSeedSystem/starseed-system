"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ASTRAURA · AGREGACIÓN DE USO PARA EL PANEL NEXUS (Adenda 76 · G1)
 * ---------------------------------------------------------------------------
 * Reúne — a partir de las fuentes REALES ya existentes — la información de uso
 * del sistema Astraura para pintarla de forma gráfica en la pestaña «Nexus» y
 * en el resumen compacto del orbe. NO inventa datos: cuando una fuente no
 * existe todavía, el panel lo muestra como «sin datos aún».
 *
 * Fuentes reales:
 *   · Proveedores/modelos, tokens, límites gratis y enfriamientos →
 *     `src/ai/astraura/usage.ts` (allUsageToday, activeCooldowns, dailyPercent).
 *   · Ruteo reciente (qué modelo/proveedor ganó cada turno) →
 *     `src/ai/astraura/router.ts` (readRouteLog).
 *   · Personalidades y sus asignaciones → `src/lib/aurora/personalities.ts`.
 *   · Memoria/habilidades/conexiones → living-graph + skill-stack.
 *   · Cerebros → `src/lib/brains/brains.ts`. Almacenes → `src/lib/storage/*`.
 *   · Almacenamiento local (cuota) → `navigator.storage.estimate()`.
 *
 * Todo SSR-safe y defensivo (nunca lanza; degrada a vacío).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
  allUsageToday,
  activeCooldowns,
  dailyPercent,
} from "@/ai/astraura/usage";
import { readRouteLog } from "@/ai/astraura/router";
import {
  listPersonalityProfiles,
  getPersonalityAssignments,
  getActivePersonality,
} from "@/lib/aurora/personalities";
import { getSkillStack } from "@/hermes-integration/skill-stack";
import { getLivingGraphStore } from "@/hermes-integration/living-graph-store";
import { listBrains } from "@/lib/brains/brains";
import { listBackends } from "@/lib/storage/backends";
import { capacityInfo } from "@/lib/storage/router";

/** Estimación de tokens por longitud (≈ 4 chars/token) cuando no hay conteo real. */
export function estimateTokens(text: string | null | undefined): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

/* ─────────────────────────── Proveedores / modelos ─────────────────────── */

export interface ProviderUsageRow {
  sourceId: string;
  label: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  /** true si la fuente NO reporta tokens (solo peticiones). */
  tokensReported: boolean;
  lastModel?: string;
  lastAt?: number;
  limit?: number;
  note?: string;
  /** % del límite diario gratis (0-100) o null si la fuente no declara tope. */
  percent: number | null;
  /** Minutos restantes de enfriamiento (cuota agotada) o null. */
  coolingMinutes: number | null;
}

/** Uso REAL de hoy por fuente, con límites gratis y enfriamiento. */
export function providerUsageRows(): ProviderUsageRow[] {
  const today = safe(() => allUsageToday(), []);
  const cooling = new Map(
    safe(() => activeCooldowns(), []).map((c) => [c.sourceId, c.minutesLeft]),
  );
  return today.map((t) => {
    const tokens = t.usage.inputTokens + t.usage.outputTokens;
    return {
      sourceId: t.sourceId,
      label: t.label,
      requests: t.usage.requests,
      inputTokens: t.usage.inputTokens,
      outputTokens: t.usage.outputTokens,
      tokensReported: tokens > 0,
      lastModel: t.usage.lastModel,
      lastAt: t.usage.lastAt,
      limit: t.limit,
      note: t.note,
      percent: safe(() => dailyPercent(t.sourceId), null),
      coolingMinutes: cooling.get(t.sourceId) ?? null,
    };
  });
}

export interface CoolingRow {
  sourceId: string;
  label: string;
  minutesLeft: number;
  /** Momento estimado de reinicio (ms epoch). */
  resetAt: number;
}

/** Fuentes en enfriamiento con su hora estimada de reinicio de cuota. */
export function coolingRows(): CoolingRow[] {
  const now = Date.now();
  return safe(() => activeCooldowns(), []).map((c) => ({
    sourceId: c.sourceId,
    label: c.label,
    minutesLeft: c.minutesLeft,
    resetAt: now + c.minutesLeft * 60_000,
  }));
}

/**
 * Próximo reinicio de las cuotas DIARIAS gratis (00:00 UTC). El código de
 * `usage.ts` resetea el consumo comparando el día UTC almacenado con el actual,
 * así que la próxima medianoche UTC es la hora real de reinicio.
 */
export function nextDailyResetUTC(): number {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0);
}

export interface ModelUsageRow {
  key: string;
  model: string;
  provider: string;
  count: number;
  free: boolean;
  avgMs: number;
}

/** Uso por modelo/proveedor derivado del registro REAL de ruteo reciente. */
export function modelUsageFromRoutes(limit = 40): ModelUsageRow[] {
  const log = safe(() => readRouteLog(), []).slice(0, limit);
  const m = new Map<string, { model: string; provider: string; count: number; free: boolean; msSum: number }>();
  for (const r of log) {
    const model = r.modelLabel || r.model || "—";
    const provider = r.sourceLabel || r.sourceId || "—";
    const key = `${provider}|${model}`;
    const e = m.get(key) ?? { model, provider, count: 0, free: !!r.free, msSum: 0 };
    e.count += 1;
    e.msSum += typeof r.ms === "number" ? r.ms : 0;
    e.free = e.free || !!r.free;
    m.set(key, e);
  }
  return [...m.entries()]
    .map(([key, e]) => ({
      key,
      model: e.model,
      provider: e.provider,
      count: e.count,
      free: e.free,
      avgMs: e.count ? Math.round(e.msSum / e.count) : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

/* ─────────────────────────────── Personalidades ────────────────────────── */

export interface PersonalitySummary {
  id: string;
  name: string;
  icon?: string;
  /** Nº de contextos donde está asignada (global + sección + chat + cerebro). */
  assignmentCount: number;
  active: boolean;
}

/** Personalidades y en cuántos contextos están asignadas (uso real conocido). */
export function personalitySummaries(): PersonalitySummary[] {
  const profiles = safe(() => listPersonalityProfiles(), []);
  const assigns = safe(() => getPersonalityAssignments(), {
    global: null,
    porSeccion: {},
    porChat: {},
    porCerebro: {},
  });
  const activeId = safe(() => getActivePersonality()?.id ?? null, null);

  const counts = new Map<string, number>();
  const bump = (id?: string | null) => {
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  };
  bump(assigns.global);
  Object.values(assigns.porSeccion ?? {}).forEach(bump);
  Object.values(assigns.porChat ?? {}).forEach(bump);
  Object.values(assigns.porCerebro ?? {}).forEach(bump);

  return profiles
    .map((p) => ({
      id: p.id,
      name: p.name,
      icon: p.icon,
      assignmentCount: counts.get(p.id) ?? 0,
      active: p.id === activeId,
    }))
    .sort(
      (a, b) =>
        (b.active ? 1 : 0) - (a.active ? 1 : 0) ||
        b.assignmentCount - a.assignmentCount ||
        a.name.localeCompare(b.name),
    );
}

/* ──────────────────── Memoria · habilidades · conexiones ────────────────── */

export interface EcosystemCounts {
  memoryNodes: number;
  memoryEdges: number;
  nodesByKind: Record<string, number>;
  skillsEnabled: number;
  skillsTotal: number;
  skillInvocations: number;
  skillsByOrigin: Record<string, number>;
}

/** Recuentos del ecosistema (grafo vivo + stack de skills). Todo real. */
export function ecosystemCounts(): EcosystemCounts {
  const graph = safe(() => getLivingGraphStore(), null as ReturnType<typeof getLivingGraphStore> | null);
  const nodes = graph ? safe(() => graph.getNodes(), []) : [];
  const edges = graph ? safe(() => graph.getEdges(), []) : [];
  const nodesByKind: Record<string, number> = {};
  nodes.forEach((n) => {
    nodesByKind[n.kind] = (nodesByKind[n.kind] ?? 0) + 1;
  });
  const stats = safe(
    () => getSkillStack().stats(),
    { total: 0, enabled: 0, byOrigin: {} as Record<string, number>, byCategory: {}, totalInvocations: 0 },
  );
  return {
    memoryNodes: nodes.length,
    memoryEdges: edges.length,
    nodesByKind,
    skillsEnabled: stats.enabled,
    skillsTotal: stats.total,
    skillInvocations: stats.totalInvocations,
    skillsByOrigin: stats.byOrigin ?? {},
  };
}

/* ─────────────────────────────── Cerebros ──────────────────────────────── */

export interface BrainSummary {
  id: string;
  name: string;
  scope: string;
  memories: number;
  personalities: number;
  connections: number;
  runtimes: number;
  servers: number;
}

/** Lista de cerebros con sus recuentos de contenido (async, real). */
export async function brainsSummary(): Promise<BrainSummary[]> {
  const brains = await safeAsync(() => listBrains(), []);
  return brains.map((b) => ({
    id: b.id,
    name: b.name,
    scope: b.scope,
    memories: b.includes?.memories?.length ?? 0,
    personalities: b.includes?.personalities?.length ?? 0,
    connections: b.includes?.connections?.length ?? 0,
    runtimes: b.includes?.runtimes?.length ?? 0,
    servers: b.servers?.length ?? 0,
  }));
}

/* ─────────────────────────── Almacenamiento ────────────────────────────── */

export interface LocalStorageEstimate {
  usedBytes: number | null;
  quotaBytes: number | null;
  percent: number | null;
}

/** Cuota de almacenamiento LOCAL del dispositivo (navigator.storage). */
export async function localStorageEstimate(): Promise<LocalStorageEstimate> {
  try {
    if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      const usedBytes = est.usage ?? null;
      const quotaBytes = est.quota ?? null;
      const percent =
        usedBytes != null && quotaBytes
          ? Math.min(100, Math.round((usedBytes / quotaBytes) * 100))
          : null;
      return { usedBytes, quotaBytes, percent };
    }
  } catch {
    /* degrada a null */
  }
  return { usedBytes: null, quotaBytes: null, percent: null };
}

export interface CloudBackendSummary {
  id: string;
  name: string;
  kind: string;
  usedMb: number;
  quotaMb: number | null;
  pct: number | null;
  unlimited: boolean;
  enabled: boolean;
}

/** Almacenes en la nube configurados con su capacidad (async, real). */
export async function cloudBackendsSummary(): Promise<CloudBackendSummary[]> {
  const backends = await safeAsync(() => listBackends(), []);
  return backends.map((b) => {
    const cap = safe(() => capacityInfo(b), {
      usedMb: b.used_mb ?? 0,
      quotaMb: b.quota_mb ?? null,
      pct: null,
      unlimited: b.quota_mb == null,
      warning: false,
    });
    return {
      id: b.id,
      name: b.name,
      kind: String(b.kind),
      usedMb: cap.usedMb,
      quotaMb: cap.quotaMb,
      pct: cap.pct,
      unlimited: cap.unlimited,
      enabled: b.enabled !== false,
    };
  });
}

/* ─────────────────────── Resumen compacto (orbe) ───────────────────────── */

export interface UsageSnapshot {
  requestsToday: number;
  tokensToday: number;
  activeProviders: number;
  personalities: number;
  memoryNodes: number;
  skillsEnabled: number;
  topModel: ModelUsageRow | null;
  cooling: number;
}

/** Instantánea sincrónica para el resumen del orbe (todo de fuentes locales). */
export function usageSnapshot(): UsageSnapshot {
  const rows = providerUsageRows();
  const eco = ecosystemCounts();
  const models = modelUsageFromRoutes();
  return {
    requestsToday: rows.reduce((a, r) => a + r.requests, 0),
    tokensToday: rows.reduce((a, r) => a + r.inputTokens + r.outputTokens, 0),
    activeProviders: rows.filter((r) => r.requests > 0).length,
    personalities: safe(() => listPersonalityProfiles().length, 0),
    memoryNodes: eco.memoryNodes,
    skillsEnabled: eco.skillsEnabled,
    topModel: models[0] ?? null,
    cooling: safe(() => activeCooldowns().length, 0),
  };
}

/* ───────────────────────────── utilidades ──────────────────────────────── */

function safe<T>(fn: () => T, fallback: T): T {
  try {
    const v = fn();
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

async function safeAsync<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    const v = await fn();
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}
