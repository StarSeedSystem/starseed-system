// ════════════════════════════════════════════════════════════════
// Agent-Reach — sentidos web GRATIS para Aurora (CLI local + proxy)
// -----------------------------------------------------------------
// Capacidad "web-senses" ya mapeada en skills.ts → iatool-agent-reach
// Este cliente invoca el proxy /api/agent-reach/[capability] que,
// si el CLI agent-reach está instalado en la neurona, lo ejecuta;
// en Vercel degrada limpio (ok:false).
// ════════════════════════════════════════════════════════════════

import type { IntegrationConfig, IntegrationResult } from "../types";

const ALLOWED_CAPABILITIES = [
  "web-search",
  "read-web",
  "youtube-transcript",
  "github-read",
  "reddit-search",
] as const;

type AgentReachCapability = (typeof ALLOWED_CAPABILITIES)[number];

interface AgentReachError {
  ok: false;
  error: string;
  motivo?: string;
  hint?: string;
  codigo?: string;
}

async function callProxy(
  capability: AgentReachCapability,
  payload: Record<string, unknown>,
  signal?: AbortSignal
): Promise<IntegrationResult> {
  try {
    const res = await fetch(`/api/agent-reach/${capability}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
    const data = await res.json();
    if (!res.ok) {
      const err: AgentReachError = data;
      if (err.motivo === "NEED_LOGIN_BLOQUEADO") {
        return { ok: false, error: err.error || "Canal con sesión apagado (R1)", data: { code: err.codigo || "NEED_LOGIN", hint: err.hint } };
      }
      if (err.motivo === "DESCONOCIDA") {
        return { ok: false, error: err.error || "Capacidad no permitida", data: { code: err.codigo || "CAPACITY_UNKNOWN" } };
      }
      return { ok: false, error: err.error || `HTTP ${res.status}`, data: { code: err.codigo, hint: err.hint } };
    }
    return { ok: true, data: data.data || data.content || data };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

// ── Tool: web_search (buscar en la web multi-backend gratis) ─────────
export async function web_search(
  cfg: IntegrationConfig,
  input: { q?: string; query?: string; limit?: number },
  signal?: AbortSignal
): Promise<IntegrationResult> {
  const q = input.q ?? input.query;
  if (!q || typeof q !== "string") {
    return { ok: false, error: "Indica el término de búsqueda (q)." };
  }
  return callProxy("web-search", { q, limit: input.limit ?? 5 }, signal);
}

// ── Tool: read_web (leer página web / X / Reddit / GitHub / genérico) ─
export async function read_web(
  cfg: IntegrationConfig,
  input: { url: string },
  signal?: AbortSignal
): Promise<IntegrationResult> {
  const url = input?.url;
  if (!url || typeof url !== "string") {
    return { ok: false, error: "Indica la URL a leer (url)." };
  }
  return callProxy("read-web", { url }, signal);
}

// ── Tool: read_youtube (transcripción de YouTube) ────────────────────
export async function read_youtube(
  cfg: IntegrationConfig,
  input: { url: string },
  signal?: AbortSignal
): Promise<IntegrationResult> {
  const url = input?.url;
  if (!url || typeof url !== "string") {
    return { ok: false, error: "Indica la URL de YouTube (url)." };
  }
  return callProxy("youtube-transcript", { url }, signal);
}

// ── Tool: read_github (leer archivo/repo de GitHub) ──────────────────
export async function read_github(
  cfg: IntegrationConfig,
  input: { url: string },
  signal?: AbortSignal
): Promise<IntegrationResult> {
  const url = input?.url;
  if (!url || typeof url !== "string") {
    return { ok: false, error: "Indica la URL de GitHub (url)." };
  }
  return callProxy("github-read", { url }, signal);
}

// ── Tool: read_reddit (leer post/comentarios de Reddit) ──────────────
export async function read_reddit(
  cfg: IntegrationConfig,
  input: { url: string },
  signal?: AbortSignal
): Promise<IntegrationResult> {
  const url = input?.url;
  if (!url || typeof url !== "string") {
    return { ok: false, error: "Indica la URL de Reddit (url)." };
  }
  return callProxy("reddit-search", { url }, signal);
}

// ── Salud: ping al proxy (degrada si no hay CLI) ─────────────────────
export async function health(
  _cfg: IntegrationConfig,
  _signal?: AbortSignal
): Promise<IntegrationResult> {
  try {
    const res = await fetch("/api/agent-reach/health", { method: "GET", signal: _signal });
    if (!res.ok) return { ok: false, error: `Proxy health ${res.status}` };
    const data = await res.json().catch(() => ({}));
    return { ok: true, data: { service: data.service, version: data.version } };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}