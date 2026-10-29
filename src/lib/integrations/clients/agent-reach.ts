// ════════════════════════════════════════════════════════════════
// Agent-Reach — lectura pública para Aurora (CLI local + proxy)
// El cliente invoca /api/agent-reach/[capability]; si la CLI v1.6 está en la
// neurona la ejecuta; en Vercel degrada limpio. Canales con sesión (Reddit,
// X, LinkedIn) quedan apagados por R1. Contrato: repos-libreria-1025.md §3.1.
// ════════════════════════════════════════════════════════════════

import type { IntegrationConfig, IntegrationResult } from "../types";
import { CAPACIDADES } from "../agent-reach-comandos";

/** Resultado del proxy: conserva el código y la pista del origen tal cual vienen. */
export interface AgentReachResult extends IntegrationResult {
  code?: string;
  hint?: string;
  motivo?: string;
}

// Ids del cliente: los mismos que conoce el mapa de capacidades de la v1.6.
const IDS_CLIENTE = ["web-search", "read-web", "youtube-transcript", "github-read", "health"] as const;
type CapacidadCliente = (typeof IDS_CLIENTE)[number];
type CuerpoProxy = Record<string, unknown>;

const texto = (x: unknown): string => (typeof x === "string" ? x : "");
const esCapacidad = (id: string): id is CapacidadCliente =>
  (IDS_CLIENTE as readonly string[]).includes(id) && Object.prototype.hasOwnProperty.call(CAPACIDADES, id);

/** Traduce la respuesta del proxy sin inventar mensajes: code y hint salen tal cual. */
function falloDe(cuerpo: CuerpoProxy, status: number): AgentReachResult {
  const dentro = cuerpo.error && typeof cuerpo.error === "object" ? (cuerpo.error as CuerpoProxy) : {};
  const code = texto(cuerpo.code) || texto(cuerpo.codigo) || texto(dentro.code) || texto(cuerpo.motivo);
  const hint = texto(cuerpo.hint) || texto(dentro.hint);
  const error = texto(cuerpo.error) || hint || `HTTP ${status}`;
  return {
    ok: false, data: cuerpo, error,
    ...(code ? { code } : {}),
    ...(hint ? { hint } : {}),
    ...(texto(cuerpo.motivo) ? { motivo: texto(cuerpo.motivo) } : {}),
  };
}

async function callProxy(
  capability: CapacidadCliente,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
  method: "GET" | "POST" = "POST"
): Promise<AgentReachResult> {
  if (!esCapacidad(capability)) return { ok: false, error: `Capacidad no permitida: ${String(capability)}` };
  try {
    const res = await fetch(`/api/agent-reach/${capability}`, {
      method,
      ...(method === "POST"
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
        : {}),
      signal,
    });
    const cuerpo = (await res.json().catch(() => null)) as CuerpoProxy | null;
    if (!cuerpo) return { ok: false, error: `HTTP ${res.status}` };
    if (cuerpo.ok === true) return { ok: true, data: cuerpo };
    return falloDe(cuerpo, res.status);
  } catch (e: unknown) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}

// ── Tool: web_search (búsqueda web de Agent-Reach; busca con Exa) ────
export async function web_search(
  _cfg: IntegrationConfig,
  input: { q?: string; query?: string; limit?: number },
  signal?: AbortSignal
): Promise<AgentReachResult> {
  const q = input.q ?? input.query;
  if (!q || typeof q !== "string") return { ok: false, error: "Indica el término de búsqueda (q)." };
  return callProxy("web-search", { q, limit: input.limit ?? 5 }, signal);
}

const leerUrl = (capability: CapacidadCliente, input: { url: string }, falta: string, signal?: AbortSignal) =>
  input?.url && typeof input.url === "string"
    ? callProxy(capability, { url: input.url }, signal)
    : Promise.resolve({ ok: false, error: falta });

// ── Tool: read_web (lee una URL pública con Jina Reader) ─────────────
export const read_web = (_cfg: IntegrationConfig, input: { url: string }, signal?: AbortSignal) =>
  leerUrl("read-web", input, "Indica la URL a leer (url).", signal);

// ── Tool: read_youtube (subtítulos de YouTube) ───────────────────────
export const read_youtube = (_cfg: IntegrationConfig, input: { url: string }, signal?: AbortSignal) =>
  leerUrl("youtube-transcript", input, "Indica la URL de YouTube (url).", signal);

// ── Tool: read_github (lee archivo/repo público de GitHub) ───────────
export const read_github = (_cfg: IntegrationConfig, input: { url: string }, signal?: AbortSignal) =>
  leerUrl("github-read", input, "Indica la URL de GitHub (url).", signal);

// ── Tool: read_reddit (Reddit exige sesión: apagado por R1) ──────────
const MOTIVO_REDDIT =
  "Reddit exige iniciar sesión y está apagado (R1): solo se leen canales públicos sin sesión.";

export async function read_reddit(
  _cfg: IntegrationConfig,
  input: { url: string },
  _signal?: AbortSignal
): Promise<AgentReachResult> {
  const url = input?.url;
  if (!url || typeof url !== "string") return { ok: false, error: "Indica la URL de Reddit (url)." };
  // Fallo normal, no excepción: el proxy no abre canales con sesión.
  return {
    ok: false, error: MOTIVO_REDDIT, hint: MOTIVO_REDDIT,
    code: "NEED_LOGIN_BLOQUEADO", motivo: "NEED_LOGIN_BLOQUEADO",
  };
}

// ── Salud: GET a /api/agent-reach/health (degrada si no hay CLI) ─────
export async function health(_cfg: IntegrationConfig, signal?: AbortSignal): Promise<AgentReachResult> {
  return callProxy("health", {}, signal, "GET");
}
