// ════════════════════════════════════════════════════════════════
// Agent-Reach — sentidos web GRATIS para Aurora (CLI local + proxy)
// -----------------------------------------------------------------
// Capacidad "web-senses" ya mapeada en skills.ts → iatool-agent-reach
// Este cliente invoca el proxy /api/agent-reach/<capacidad> con los ids
// EXACTOS de agent-reach-comandos.ts (fuente única, no copiados). El
// proxy ejecuta el CLI si está en la neurona o degrada limpio (Vercel).
// El error del CLI ({error:{code,hint}}) llega TAL CUAL y
// NEED_LOGIN_BLOQUEADO (R1, canales con sesión) es un fallo normal.
// ════════════════════════════════════════════════════════════════

import type { IntegrationConfig, IntegrationResult } from "../types";
import type { CapacidadId } from "../agent-reach-comandos";

interface RespuestaProxy {
  ok?: boolean;
  error?: string;
  hint?: string;
  codigo?: string;
  motivo?: string;
  content?: unknown;
  items?: unknown;
  service?: string;
  version?: unknown;
}

const objeto = (v: unknown): RespuestaProxy | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as RespuestaProxy) : null;

/**
 * Traduce la respuesta del proxy a IntegrationResult (puro, sin red).
 * code y hint pasan tal cual vienen; el fallo es normal, nunca lanza.
 */
export function interpretarRespuestaProxy(
  status: number,
  cuerpo: unknown,
): IntegrationResult {
  const body = objeto(cuerpo);
  if (!body) return { ok: false, error: `Respuesta inválida del proxy (HTTP ${status}).` };
  if (body.ok === true) {
    return { ok: true, data: { content: body.content, items: body.items } };
  }
  return {
    ok: false,
    error: body.error || `HTTP ${status}`,
    data: { code: body.codigo, hint: body.hint, motivo: body.motivo },
  };
}

async function callProxy(
  capacidad: CapacidadId,
  payload: Record<string, unknown>,
  signal?: AbortSignal
): Promise<IntegrationResult> {
  try {
    const res = await fetch(`/api/agent-reach/${capacidad}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
    const cuerpo: unknown = await res.json().catch(() => null);
    return interpretarRespuestaProxy(res.status, cuerpo);
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
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

// ── Salud: GET al proxy; respeta el ok que el proxy devuelve ─────────
export function interpretarSalud(cuerpo: unknown): IntegrationResult {
  const body = objeto(cuerpo);
  if (!body || body.ok !== true) {
    return { ok: false, error: body?.error || "agent-reach no está disponible en esta neurona." };
  }
  return { ok: true, data: { service: body.service, version: body.version } };
}

export async function health(
  _cfg: IntegrationConfig,
  signal?: AbortSignal
): Promise<IntegrationResult> {
  try {
    const res = await fetch("/api/agent-reach/health", { method: "GET", signal });
    const cuerpo: unknown = await res.json().catch(() => null);
    return interpretarSalud(cuerpo);
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}