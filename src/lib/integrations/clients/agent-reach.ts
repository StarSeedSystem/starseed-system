// ════════════════════════════════════════════════════════════════
// Agent-Reach v1.6 — sentidos web GRATIS para Aurora (CLI local + proxy)
// Los ids salen del catálogo único agent-reach-comandos.ts, así cliente y
// ruta no pueden divergir (INV1025B). En Vercel el proxy degrada (ok:false).
// ════════════════════════════════════════════════════════════════

import type { IntegrationConfig, IntegrationResult } from "../types";
import { CAPACIDADES, type ItemReach } from "../agent-reach-comandos";

const IDS_CLIENTE = ["web-search", "read-web", "youtube-transcript", "github-read", "reddit-search"] as const;
export type AgentReachCapability = (typeof IDS_CLIENTE)[number];
const DEL_CATALOGO = new Set<string>(Object.keys(CAPACIDADES));
const MOTIVO_REDDIT = "Canal con sesión apagado (R1): solo canales públicos sin iniciar sesión.";

export interface AgentReachResult extends IntegrationResult {
  content?: string;
  items?: ItemReach[];
  meta?: Record<string, unknown>;
  codigo?: string;
  hint?: string;
}

const texto = (x: unknown): string | undefined => (typeof x === "string" && x.trim() ? x : undefined);
const mensaje = (e: unknown): string => (e instanceof Error ? e.message : String(e));

async function leerCuerpo(res: Response): Promise<Record<string, unknown>> {
  try {
    const b: unknown = await res.json();
    return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Conserva error.code y hint tal cual llegan (objeto o campos planos). */
function camposError(cuerpo: Record<string, unknown>): Pick<AgentReachResult, "error" | "codigo" | "hint"> {
  const crudo = cuerpo.error;
  const obj = crudo && typeof crudo === "object" && !Array.isArray(crudo) ? (crudo as Record<string, unknown>) : {};
  const hint = texto(obj.hint) ?? texto(cuerpo.hint) ?? texto(crudo);
  return { error: hint, codigo: texto(obj.code) ?? texto(cuerpo.codigo) ?? texto(cuerpo.motivo), hint };
}

function normalizar(cuerpo: Record<string, unknown>): AgentReachResult {
  return {
    ok: cuerpo.ok === true,
    content: texto(cuerpo.content),
    items: Array.isArray(cuerpo.items) ? (cuerpo.items as ItemReach[]) : undefined,
    meta: cuerpo.meta && typeof cuerpo.meta === "object" ? (cuerpo.meta as Record<string, unknown>) : undefined,
    data: cuerpo,
    ...camposError(cuerpo),
  };
}

async function callProxy(
  capability: AgentReachCapability,
  payload: Record<string, unknown>,
  signal?: AbortSignal
): Promise<AgentReachResult> {
  if (!DEL_CATALOGO.has(capability)) return { ok: false, error: `Capacidad no permitida: ${capability}` };
  try {
    const res = await fetch(`/api/agent-reach/${capability}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
    const r = normalizar(await leerCuerpo(res));
    return res.ok ? r : { ...r, ok: false };
  } catch (e) {
    return { ok: false, error: mensaje(e) };
  }
}

/** POST con una única URL; valida antes de salir a la red. */
function conUrl(cap: AgentReachCapability, input: { url?: string }, falta: string, signal?: AbortSignal) {
  const url = input?.url;
  if (!url || typeof url !== "string") return Promise.resolve<AgentReachResult>({ ok: false, error: falta });
  return callProxy(cap, { url }, signal);
}
// ── web_search: busca con Exa; la consulta sale hacia ese tercero ────
export async function web_search(
  _cfg: IntegrationConfig,
  input: { q?: string; query?: string; limit?: number },
  signal?: AbortSignal
): Promise<AgentReachResult> {
  const q = input.q ?? input.query;
  if (!q || typeof q !== "string") return { ok: false, error: "Indica el término de búsqueda (q)." };
  return callProxy("web-search", { q, limit: input.limit ?? 5 }, signal);
}
// ── read_web: lee con Jina Reader; la URL sale hacia ese tercero ─────
export function read_web(_cfg: IntegrationConfig, input: { url: string }, signal?: AbortSignal) {
  return conUrl("read-web", input, "Indica la URL a leer (url).", signal);
}

// ── read_youtube: subtítulos públicos, sin clave ─────────────────────
export function read_youtube(_cfg: IntegrationConfig, input: { url: string }, signal?: AbortSignal) {
  return conUrl("youtube-transcript", input, "Indica la URL de YouTube (url).", signal);
}

// ── read_github: lee archivo o repo público ──────────────────────────
export function read_github(_cfg: IntegrationConfig, input: { url: string }, signal?: AbortSignal) {
  return conUrl("github-read", input, "Indica la URL de GitHub (url).", signal);
}

// ── read_reddit: R1, con sesión y apagado; fallo normal, no excepción ─
export function read_reddit(_cfg: IntegrationConfig, input: { url: string }): Promise<AgentReachResult> {
  const url = input?.url;
  if (!url || typeof url !== "string") return Promise.resolve({ ok: false, error: "Indica la URL de Reddit (url)." });
  return Promise.resolve({ ok: false, error: MOTIVO_REDDIT, codigo: "NEED_LOGIN_BLOQUEADO", hint: MOTIVO_REDDIT });
}
// ── Salud: GET /api/agent-reach/health (degrada si no hay CLI) ───────
export async function health(_cfg: IntegrationConfig, signal?: AbortSignal): Promise<AgentReachResult> {
  try {
    const res = await fetch("/api/agent-reach/health", { method: "GET", signal });
    const r = normalizar(await leerCuerpo(res));
    return res.ok ? r : { ...r, ok: false };
  } catch (e) {
    return { ok: false, error: mensaje(e) };
  }
}
