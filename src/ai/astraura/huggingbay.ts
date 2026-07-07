"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ASTRAURA · THE HUGGING BAY — descubrimiento inteligente de modelos
 * ---------------------------------------------------------------------------
 * Cliente tipado para https://huggingbay.xyz (registro verificado de modelos
 * IA open-source con API pública agent-friendly), SIEMPRE a través del proxy
 * propio (`/api/huggingbay/...`, ver route.ts): nunca se llama al dominio
 * externo directamente desde el navegador.
 *
 * Rol en Astraura: Hugging Bay es una fuente de DESCUBRIMIENTO de catálogo,
 * no de inferencia — no sirve chat. Da a Aurora la capacidad de responder
 * "¿cuál es el mejor modelo para X?" con datos reales (licencia, señales de
 * confianza, tamaño, comando de instalación local) y, si el usuario lo
 * autoriza, registrar el resultado como candidato del router/instalados.
 *
 * Todo defensivo y SSR-safe: cualquier fallo de red/parseo degrada a
 * []/null, NUNCA lanza. Caché en localStorage con TTL corto (~1h) para no
 * golpear la API en cada interacción y para que la UI cargue al instante en
 * visitas repetidas.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { TaskKind } from "./free-catalog";

/* ───────────────────────────── Tipos del catálogo ───────────────────────────── */

/** Fila normalizada de artefacto (modelo/dataset/espacio) de Hugging Bay. */
export interface HuggingBayArtifact {
  id: string;
  name: string;
  owner: string;
  repo: string;
  type: string;
  summary: string;
  license: string;
  sourceUrl: string;
  webUrl: string;
  verificationStatus: string;
  hostingStatus: string;
  downloadCount: number;
  stars: number;
  worksWith: string[];
  fitScore?: number;
  fitReasons: string[];
  trustScore: number;
  trustLevel: string;
  sizeLabel: string;
  sizeBytes: number;
  sizeKnown: boolean;
  recommendedAction?: string;
  actionLabel?: string;
}

export interface RecommenderResult {
  useCase: string;
  profileLabel: string;
  rows: HuggingBayArtifact[];
}

export interface LocalKitCommand {
  id: string;
  tool: string;
  label: string;
  command: string;
  detail: string;
  safe: boolean;
}

export interface LocalKitResult {
  artifactId: string;
  tool: string;
  hosted: boolean;
  commands: LocalKitCommand[];
  warnings: string[];
}

export interface ArtifactCard {
  id: string;
  name: string;
  license: string;
  summary: string;
  webUrl: string;
  sourceUrl: string;
}

/* ───────────────────────────── Proxy + caché ───────────────────────────── */

const PROXY_BASE = "/api/huggingbay";
const FETCH_TIMEOUT_MS = 9_000;
const CACHE_PREFIX = "starseed.astraura.huggingbay.cache.v1::";
const CACHE_TTL_MS = 60 * 60 * 1000; // ~1h

function isClient(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readCache<T>(key: string): T | null {
  if (!isClient()) return null;
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const p = JSON.parse(raw) as { at?: number; data?: T };
    if (!p || typeof p.at !== "number" || Date.now() - p.at > CACHE_TTL_MS) return null;
    return p.data ?? null;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, data: T): void {
  if (!isClient()) return;
  try {
    window.localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* cuota / modo privado: degradamos en silencio, no es crítico */
  }
}

/** GET defensivo a través del proxy propio. Nunca lanza: devuelve `null` si algo falla. */
async function proxyGet<T = unknown>(path: string, params?: Record<string, string | number>): Promise<T | null> {
  if (typeof fetch === "undefined") return null;
  try {
    const qs = new URLSearchParams();
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
      }
    }
    const url = `${PROXY_BASE}/${path}${qs.toString() ? `?${qs.toString()}` : ""}`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    clearTimeout(t);
    if (!res.ok) return null;
    const body = (await res.json()) as { ok?: boolean; data?: unknown };
    if (!body || body.ok !== true) return null;
    return (body.data ?? null) as T | null;
  } catch {
    return null;
  }
}

/* ───────────────────────────── Normalización defensiva ───────────────────────────── */

function asStr(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function asNum(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function asStrArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** Convierte una fila cruda del recomendador/búsqueda/trending a nuestro shape estable. */
function normalizeArtifact(raw: unknown): HuggingBayArtifact | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = asStr(r.id).trim();
  if (!id) return null;
  const urls = (r.urls && typeof r.urls === "object" ? r.urls : {}) as Record<string, unknown>;
  const signals = (r.signals && typeof r.signals === "object" ? r.signals : {}) as Record<string, unknown>;
  const trust = (signals.trust && typeof signals.trust === "object" ? signals.trust : {}) as Record<string, unknown>;
  const size = (signals.size && typeof signals.size === "object" ? signals.size : {}) as Record<string, unknown>;
  return {
    id,
    name: asStr(r.name, id),
    owner: asStr(r.owner),
    repo: asStr(r.repo),
    type: asStr(r.type),
    summary: asStr(r.summary),
    license: asStr(r.license, "sin licencia declarada"),
    sourceUrl: asStr(r.sourceUrl) || asStr(urls.upstream),
    webUrl: asStr(urls.web) || asStr(r.sourceUrl),
    verificationStatus: asStr(r.verificationStatus, "pending"),
    hostingStatus: asStr(r.hostingStatus, "external"),
    downloadCount: asNum(r.downloadCount),
    stars: asNum(r.stars),
    worksWith: asStrArr(r.worksWith),
    fitScore: typeof r.fitScore === "number" ? r.fitScore : undefined,
    fitReasons: asStrArr(r.fitReasons),
    trustScore: asNum(trust.score),
    trustLevel: asStr(trust.level, "needs-review"),
    sizeLabel: asStr(size.label, asStr(r.sizeLabel, "desconocido")),
    sizeBytes: asNum(size.bytes ?? r.sizeBytes),
    sizeKnown: trust ? Boolean(size.known) : false,
    recommendedAction: asStr(r.recommendedAction) || undefined,
    actionLabel: asStr(r.actionLabel) || undefined,
  };
}

function normalizeRows(raw: unknown): HuggingBayArtifact[] {
  const arr = Array.isArray((raw as Record<string, unknown>)?.rows)
    ? (raw as Record<string, unknown>).rows
    : Array.isArray(raw)
      ? raw
      : [];
  return (arr as unknown[]).map(normalizeArtifact).filter((a): a is HuggingBayArtifact => !!a);
}

/* ───────────────────────────── Mapeo TAREA → useCase ───────────────────────────── */

/**
 * Vocabulario de "useCase" que expone el recomendador de Hugging Bay (jul-2026):
 * rag · coding · vision · audio · agents · datasets-evals · commercial-safe ·
 * global-model-labs (+ "chat"/genérico, que Hugging Bay re-mapea a su perfil
 * "local-llm" por defecto). Traducimos desde el vocabulario de Astraura
 * (`TaskKind` de free-catalog.ts) y el de capacidades (`skills.ts`) para que
 * cualquier punto del sistema pueda pedir "el mejor modelo para esta tarea".
 */
export const TASK_TO_USE_CASE: Record<TaskKind, string> = {
  chat: "chat",
  fast: "chat",
  code: "coding",
  reasoning: "coding",
  vision: "vision",
  long: "rag",
  creative: "chat",
  translate: "chat",
  summary: "rag",
};

/** Capacidades (skills.ts) → useCase de Hugging Bay, para "dame un modelo para X". */
export const CAPABILITY_TO_USE_CASE: Record<string, string> = {
  vision: "vision",
  voice: "audio",
  research: "rag",
  "web-senses": "agents",
  "web-access": "agents",
  taste: "chat",
  pm: "agents",
};

/** Traduce una tarea de Astraura o una capacidad conocida a un useCase de Hugging Bay. */
export function useCaseFor(taskOrCapability: string): string {
  const key = String(taskOrCapability || "").trim();
  return TASK_TO_USE_CASE[key as TaskKind] ?? CAPABILITY_TO_USE_CASE[key] ?? "chat";
}

/* ───────────────────────────── API pública del cliente ───────────────────────────── */

/**
 * Recomendador por caso de uso: modelos rankeados con fit reasons, comandos de
 * herramienta y acciones de descarga. Regla del sitio: `limit` acotado.
 */
export async function recommend(useCase: string, limit = 12): Promise<RecommenderResult> {
  const uc = String(useCase || "chat").trim() || "chat";
  const cacheKey = `recommend::${uc}::${limit}`;
  const cached = readCache<RecommenderResult>(cacheKey);
  if (cached) return cached;

  const data = await proxyGet<Record<string, unknown>>("api/recommender", { useCase: uc, limit });
  const result: RecommenderResult = {
    useCase: asStr(data?.useCase, uc),
    profileLabel: asStr((data?.profile as Record<string, unknown> | undefined)?.label, uc),
    rows: normalizeRows(data ?? {}),
  };
  if (result.rows.length) writeCache(cacheKey, result);
  return result;
}

/** Búsqueda semántica en lenguaje natural (regla del sitio: `summary=1` + `limit`). */
export async function semanticSearch(q: string, limit = 20): Promise<HuggingBayArtifact[]> {
  const query = String(q || "").trim();
  if (!query) return [];
  const cacheKey = `semantic::${query.toLowerCase()}::${limit}`;
  const cached = readCache<HuggingBayArtifact[]>(cacheKey);
  if (cached) return cached;
  const data = await proxyGet<Record<string, unknown>>("api/search/semantic", { q: query, limit });
  const rows = normalizeRows(data ?? {});
  if (rows.length) writeCache(cacheKey, rows);
  return rows;
}

/** Búsqueda estable por palabras clave (fallback si la semántica no da resultados). */
export async function stableSearch(q: string, limit = 20): Promise<HuggingBayArtifact[]> {
  const query = String(q || "").trim();
  if (!query) return [];
  const data = await proxyGet<Record<string, unknown>>("api/v1/search", { q: query, limit });
  return normalizeRows(data ?? {});
}

/** Catálogo general (para "explorar todo"), siempre con `summary=1` (regla del sitio). */
export async function browseArtifacts(q = "", limit = 24): Promise<HuggingBayArtifact[]> {
  const data = await proxyGet<Record<string, unknown>>("api/artifacts", { summary: 1, q, limit });
  return normalizeRows(data ?? {});
}

/** Trending reciente (ventana por defecto: 7 días). */
export async function trending(window = "7d", limit = 25): Promise<HuggingBayArtifact[]> {
  const cacheKey = `trending::${window}::${limit}`;
  const cached = readCache<HuggingBayArtifact[]>(cacheKey);
  if (cached) return cached;
  const data = await proxyGet<Record<string, unknown>>("api/trending", { window, limit });
  const rows = normalizeRows(data ?? {});
  if (rows.length) writeCache(cacheKey, rows);
  return rows;
}

/**
 * Rankings canónicos "Top open-source LLMs". Usa el endpoint estable de
 * búsqueda ordenado por relevancia como aproximación agent-friendly (los
 * rankings HTML de /models/top-open-source-llms no son JSON); mantiene la
 * misma forma `HuggingBayArtifact[]` para no duplicar UI.
 */
export async function topOpenModels(limit = 20): Promise<HuggingBayArtifact[]> {
  const cacheKey = `top-open-models::${limit}`;
  const cached = readCache<HuggingBayArtifact[]>(cacheKey);
  if (cached) return cached;
  const data = await proxyGet<Record<string, unknown>>("api/v1/search", { q: "top open source llm", limit });
  const rows = normalizeRows(data ?? {});
  if (rows.length) writeCache(cacheKey, rows);
  return rows;
}

/** Ficha normalizada de un artefacto concreto (nombre, licencia, resumen, enlaces). */
export async function artifactCard(id: string): Promise<ArtifactCard | null> {
  const artifactId = String(id || "").trim();
  if (!artifactId) return null;
  const data = await proxyGet<Record<string, unknown>>(`api/artifacts/${encodeURIComponent(artifactId)}/card`);
  if (!data) return null;
  return {
    id: asStr(data.id, artifactId),
    name: asStr(data.name, artifactId),
    license: asStr(data.license, "sin licencia declarada"),
    summary: asStr(data.summary),
    webUrl: asStr(data.webUrl) || asStr((data.urls as Record<string, unknown> | undefined)?.web),
    sourceUrl: asStr(data.sourceUrl) || asStr((data.urls as Record<string, unknown> | undefined)?.upstream),
  };
}

/**
 * Kit local copiable: comando(s) listos para instalar el modelo con la
 * herramienta elegida (ollama/lmstudio/comfyui/transformers/llama.cpp).
 * Nunca ejecuta nada — solo devuelve el texto para que el usuario copie.
 */
export async function localKit(id: string, tool = "ollama"): Promise<LocalKitResult | null> {
  const artifactId = String(id || "").trim();
  if (!artifactId) return null;
  const data = await proxyGet<Record<string, unknown>>(`api/local-kits/${encodeURIComponent(artifactId)}`, { tool });
  if (!data) return null;
  const rawCommands = Array.isArray(data.commands) ? data.commands : [];
  return {
    artifactId,
    tool: asStr(data.tool, tool),
    hosted: Boolean(data.hosted),
    commands: rawCommands
      .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
      .map((c) => ({
        id: asStr(c.id),
        tool: asStr(c.tool, tool),
        label: asStr(c.label, tool),
        command: asStr(c.command),
        detail: asStr(c.detail),
        safe: c.safe !== false,
      }))
      .filter((c) => !!c.command),
    warnings: asStrArr(data.warnings),
  };
}

/* ───────────────────────────── Selección inteligente ───────────────────────────── */

export type PermissiveLicense =
  | "mit" | "apache-2.0" | "apache 2.0" | "bsd" | "bsd-3-clause" | "bsd-2-clause"
  | "cc0-1.0" | "cc-by-4.0" | "openrail" | "gemma" | "llama3" | "llama3.1" | "llama3.2" | "llama3.3";

/** ¿Es una licencia razonablemente permisiva/comercial-friendly? Heurística por texto. */
export function isPermissiveLicense(license: string): boolean {
  const l = String(license || "").toLowerCase().trim();
  if (!l || l === "sin licencia declarada" || l === "unknown" || l === "other") return false;
  const denyMarkers = ["non-commercial", "nc-", "cc-by-nc", "research-only", "no-derivatives", "proprietary"];
  if (denyMarkers.some((d) => l.includes(d))) return false;
  const allowMarkers = [
    "mit", "apache", "bsd", "cc0", "cc-by-4", "openrail", "gemma", "llama", "mpl", "unlicense", "isc",
  ];
  return allowMarkers.some((a) => l.includes(a));
}

export interface RankedModel extends HuggingBayArtifact {
  /** Puntuación final calculada por rankHuggingBayFor (mayor = mejor). */
  rankScore: number;
  /** Razones EN ESPAÑOL de por qué se eligió (transparencia, como el resto de Astraura). */
  reasons: string[];
}

export interface RankOptions {
  limit?: number;
  /** Solo licencias permisivas (por defecto true — regla de oro). */
  permissiveOnly?: boolean;
  /** Solo filas hosted/verificadas (por defecto false — Hugging Bay aún mirrorea poco). */
  hostedOnly?: boolean;
  /** Tier de dispositivo ya calculado (evita recalcular si el llamador ya lo tiene). */
  deviceTier?: "high" | "mid" | "low";
}

/** Heurística: ¿el modelo parece pequeño/cuantizado (bueno para dispositivos modestos)? */
function looksSmallOrQuantized(a: HuggingBayArtifact): boolean {
  const hay = `${a.name} ${a.sizeLabel} ${a.worksWith.join(" ")}`.toLowerCase();
  return /\bq[2-6]\b|gguf|quantiz|small|mini|lite|1b|2b|3b|4b|7b|8b/.test(hay);
}

/** Heurística: ¿el modelo parece muy grande (requiere hardware potente)? */
function looksLarge(a: HuggingBayArtifact): boolean {
  const hay = `${a.name} ${a.sizeLabel}`.toLowerCase();
  return /\b(30|32|34|40|65|70|72|120|140|175|235|400)b\b/.test(hay);
}

/**
 * Selección INTELIGENTE del mejor modelo de Hugging Bay para una tarea/capacidad
 * de Astraura. Filtra por licencia permisiva y (opcional) solo-hosted, puntúa
 * por `fitScore` + confianza + adecuación al dispositivo, y devuelve el top-N
 * con razones en español. Nunca lanza: sin resultados devuelve `[]`.
 */
export async function rankHuggingBayFor(taskOrCapability: string, opts: RankOptions = {}): Promise<RankedModel[]> {
  const useCase = useCaseFor(taskOrCapability);
  const { rows } = await recommend(useCase, Math.max(opts.limit ?? 8, 8) * 2);
  if (!rows.length) return [];

  const permissiveOnly = opts.permissiveOnly !== false; // default true
  const hostedOnly = !!opts.hostedOnly;

  let tier = opts.deviceTier;
  if (!tier) {
    try {
      const mod = await import("@/lib/perf/device-tier");
      tier = mod.detectTier();
    } catch {
      tier = "high";
    }
  }

  const scored: RankedModel[] = [];
  for (const a of rows) {
    if (permissiveOnly && !isPermissiveLicense(a.license)) continue;
    if (hostedOnly && a.hostingStatus !== "hosted" && a.verificationStatus !== "verified") continue;

    const reasons: string[] = [];
    let score = (a.fitScore ?? 0) / 40; // normaliza el fitScore (~300-400) a un rango manejable

    if (isPermissiveLicense(a.license)) {
      score += 3;
      reasons.push(`Licencia permisiva (${a.license})`);
    }
    if (a.hostingStatus === "hosted") {
      score += 4;
      reasons.push("Alojado por Hugging Bay (descarga directa)");
    } else if (a.verificationStatus === "verified") {
      score += 2;
      reasons.push("Verificado por la comunidad");
    }
    if (a.trustScore >= 60) {
      score += 2;
      reasons.push(`Confianza alta (${a.trustScore}/100)`);
    } else if (a.trustScore > 0) {
      reasons.push(`Confianza ${a.trustScore}/100`);
    }
    if (a.downloadCount >= 100_000) {
      score += 1.5;
      reasons.push(`${Math.round(a.downloadCount / 1000)}K descargas upstream`);
    } else if (a.downloadCount > 0) {
      reasons.push(`${a.downloadCount.toLocaleString("es-ES")} descargas upstream`);
    }

    // Adecuación al dispositivo: en tiers modestos, premia lo pequeño/cuantizado
    // y penaliza lo claramente grande; en tier alto no penaliza nada.
    if (tier === "low") {
      if (looksSmallOrQuantized(a)) { score += 2.5; reasons.push("Tamaño adecuado para este equipo"); }
      else if (looksLarge(a)) { score -= 3; reasons.push("Puede ser pesado para este equipo"); }
    } else if (tier === "mid") {
      if (looksSmallOrQuantized(a)) { score += 1; reasons.push("Tamaño cómodo para este equipo"); }
      else if (looksLarge(a)) { score -= 1.5; }
    }

    if (a.fitReasons.length) {
      reasons.push(...a.fitReasons.slice(0, 2));
    }

    scored.push({ ...a, rankScore: score, reasons: Array.from(new Set(reasons)).slice(0, 5) });
  }

  scored.sort((x, y) => y.rankScore - x.rankScore);
  return scored.slice(0, opts.limit ?? 8);
}
