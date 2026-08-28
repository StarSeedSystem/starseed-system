"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ASTRAURA · AGENT REACH — acceso a la web externa para agentes (Adenda 172)
 * ---------------------------------------------------------------------------
 * Cliente tipado para Agent Reach (https://github.com/Panniantong/Agent-Reach):
 * da a los agentes Astraura ojos en TODA la web (Twitter/X, Reddit, YouTube,
 * GitHub, Bilibili, XiaoHongShu, búsqueda semántica, RSS) TODO GRATIS.
 *
 * Patrón (igual que huggingbay.ts): SIEMPRE vía proxy propio `/api/agent-reach`,
 * NUNCA se llama al CLI externo directo desde el navegador. El proxy (route.ts)
 * invoca el CLI de agent-reach SOLO si está instalado en la neurona del usuario;
 * si no, degrada a `{ ok:false }` sin romper nada. Defensivo y SSR-safe:
 * cualquier fallo devuelve `null`, NUNCA lanza.
 *
 * Rol en Astraura: herramienta `web-access`/`research` nativa por defecto
 * (integration-catalog.ts marca agent-reach como native+defaultOn). Los agentes
 * la usan para investigación en la red de StarSeed y en internet externa.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/* ───────────────────────────── Tipos ───────────────────────────── */

export interface AgentReachResult {
  ok: boolean;
  /** Texto/JSON normalizado que el agente puede consumir. */
  content?: string;
  /** Metadatos (fuente, url, etc.). */
  meta?: Record<string, unknown>;
  /** Razón si ok=false. */
  error?: string;
}

export type AgentReachCapability =
  | "web" // leer cualquier página web
  | "search" // búsqueda semántica en toda la web
  | "youtube" // transcripción de YouTube
  | "github" // leer repo público / buscar
  | "reddit" // buscar/leer Reddit
  | "twitter" // leer tweet (requiere config del usuario)
  | "rss" // leer feed RSS/Atom
  | "bilibili"; // buscar/detalle Bilibili

/* ───────────────────────────── Proxy + caché ───────────────────────────── */

const PROXY_BASE = "/api/agent-reach";
const FETCH_TIMEOUT_MS = 20_000;
const CACHE_PREFIX = "starseed.astraura.agentreach.cache.v1::";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min (la web cambia)

function isClient(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readCache(key: string): AgentReachResult | null {
  if (!isClient()) return null;
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const p = JSON.parse(raw) as { at?: number; data?: AgentReachResult };
    if (!p || typeof p.at !== "number" || Date.now() - p.at > CACHE_TTL_MS) return null;
    return p.data ?? null;
  } catch {
    return null;
  }
}

function writeCache(key: string, data: AgentReachResult): void {
  if (!isClient()) return;
  try {
    window.localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* silencioso */
  }
}

/** POST defensivo al proxy propio. Nunca lanza: devuelve resultado con ok=false. */
async function proxyPost(
  capability: AgentReachCapability,
  payload: Record<string, unknown>,
): Promise<AgentReachResult> {
  if (typeof fetch === "undefined") return { ok: false, error: "no-fetch" };
  const cacheKey = `${capability}::${JSON.stringify(payload)}`;
  const cached = readCache(cacheKey);
  if (cached) return cached;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(`${PROXY_BASE}/${capability}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(t);
    if (!res.ok) return { ok: false, error: `status-${res.status}` };
    const body = (await res.json()) as AgentReachResult;
    if (body?.ok) writeCache(cacheKey, body);
    return body;
  } catch {
    return { ok: false, error: "network" };
  }
}

/* ───────────────────────────── API pública (herramientas del agente) ───────────────────────────── */

/** Lee cualquier página web y devuelve texto legible. */
export async function readWeb(url: string): Promise<AgentReachResult> {
  return proxyPost("web", { url });
}

/** Búsqueda semántica en toda la web (gratis, multi-backend). */
export async function webSearch(q: string, limit = 5): Promise<AgentReachResult> {
  return proxyPost("search", { q, limit });
}

/** Transcripción de un video de YouTube. */
export async function youtubeTranscript(url: string): Promise<AgentReachResult> {
  return proxyPost("youtube", { url });
}

/** Lee un repo público de GitHub o busca en él. */
export async function githubRead(repo: string, query?: string): Promise<AgentReachResult> {
  return proxyPost("github", { repo, query });
}

/** Busca/lee en Reddit. */
export async function redditSearch(q: string): Promise<AgentReachResult> {
  return proxyPost("reddit", { q });
}

/** Lee un tweet (requiere que el usuario haya configurado Twitter en su neurona). */
export async function twitterRead(url: string): Promise<AgentReachResult> {
  return proxyPost("twitter", { url });
}

/** Lee un feed RSS/Atom. */
export async function readRss(feed: string): Promise<AgentReachResult> {
  return proxyPost("rss", { feed });
}

/** Busca/detalle en Bilibili. */
export async function bilibiliSearch(q: string): Promise<AgentReachResult> {
  return proxyPost("bilibili", { q });
}
