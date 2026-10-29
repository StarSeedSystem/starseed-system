// Agent-Reach v1.6 — sentidos web GRATIS para Aurora (CLI local + proxy).
// Ids desde `agent-reach-comandos.ts`. Búsqueda con Exa y lectura con Jina
// Reader (terceros): solo fuentes públicas. Reddit, X y LinkedIn piden
// sesión y quedan apagados (R1). Nunca lanza: un fallo es un resultado.

import type { IntegrationConfig, IntegrationResult } from "../types";
import { CAPACIDADES } from "../agent-reach-comandos";

/** Subconjunto EXACTO de capacidades de `agent-reach-comandos.ts`. */
const CAPS_CLIENTE = {
  "web-search": CAPACIDADES["web-search"],
  "read-web": CAPACIDADES["read-web"],
  "youtube-transcript": CAPACIDADES["youtube-transcript"],
  "github-read": CAPACIDADES["github-read"],
  "reddit-search": CAPACIDADES["reddit-search"],
  health: CAPACIDADES.health,
} as const;

type AgentReachCapability = keyof typeof CAPS_CLIENTE;

/** Resultado con el `code` y el `hint` del fallo tal cual los da la v1.6. */
export interface AgentReachResult extends IntegrationResult {
  code?: string;
  hint?: string;
}

type Cuerpo = Record<string, unknown>;
const texto = (valor: unknown): string => (typeof valor === "string" ? valor : "");

/** Devuelve `code` y `hint` sin inventar; un fallo es un resultado, no una excepción. */
function fallo(body: Cuerpo | null, status: number): AgentReachResult {
  const error = body?.error;
  const anidado = error && typeof error === "object" ? (error as Cuerpo) : {};
  const code = texto(anidado.code) || texto(body?.codigo) || texto(body?.motivo) || `HTTP_${status}`;
  const hint = texto(anidado.hint) || texto(body?.hint) || texto(error) || `El proxy respondió ${status}.`;
  return { ok: false, error: hint, code, hint };
}

async function callProxy(
  capability: AgentReachCapability,
  payload: Cuerpo,
  signal?: AbortSignal
): Promise<AgentReachResult> {
  try {
    const res = await fetch(`/api/agent-reach/${capability}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
    const body = (await res.json().catch(() => null)) as Cuerpo | null;
    if (!body) return fallo(null, res.status);
    if (!res.ok || body.ok === false) return fallo(body, res.status);
    return { ok: true, data: body };
  } catch (e: unknown) {
    const mensaje = e instanceof Error ? e.message : String(e);
    return { ok: false, error: mensaje, code: "RED", hint: mensaje };
  }
}

const falta = (mensaje: string): AgentReachResult => ({ ok: false, error: mensaje, code: "BAD_INPUT", hint: mensaje });

/** Busca en la web (Exa, tercero) y devuelve los resultados normalizados. */
export async function web_search(_cfg: IntegrationConfig, input: { q?: string; query?: string; limit?: number }, signal?: AbortSignal): Promise<AgentReachResult> {
  const q = input.q ?? input.query;
  if (!q || typeof q !== "string") return falta("Indica el término de búsqueda (q).");
  return callProxy("web-search", { q, limit: input.limit ?? 5 }, signal);
}

/** Lee una página pública con Jina Reader (tercero) → Markdown. */
export async function read_web(_cfg: IntegrationConfig, input: { url: string }, signal?: AbortSignal): Promise<AgentReachResult> {
  const url = input?.url;
  if (!url || typeof url !== "string") return falta("Indica la URL a leer (url).");
  return callProxy("read-web", { url }, signal);
}

/** Extrae los subtítulos de un vídeo de YouTube. */
export async function read_youtube(_cfg: IntegrationConfig, input: { url: string }, signal?: AbortSignal): Promise<AgentReachResult> {
  const url = input?.url;
  if (!url || typeof url !== "string") return falta("Indica la URL de YouTube (url).");
  return callProxy("youtube-transcript", { url }, signal);
}

/** Lee un archivo o repo público de GitHub. */
export async function read_github(_cfg: IntegrationConfig, input: { url: string }, signal?: AbortSignal): Promise<AgentReachResult> {
  const url = input?.url;
  if (!url || typeof url !== "string") return falta("Indica la URL de GitHub (url).");
  return callProxy("github-read", { url }, signal);
}

/** Reddit pide sesión: se queda devolviendo el motivo de R1, sin llamar al proxy. */
export async function read_reddit(_cfg: IntegrationConfig, input: { url: string }, _signal?: AbortSignal): Promise<AgentReachResult> {
  const url = input?.url;
  if (!url || typeof url !== "string") return falta("Indica la URL de Reddit (url).");
  const hint = "Canal con sesión apagado (R1): Reddit pide iniciar sesión y solo se leen canales públicos.";
  return { ok: false, error: hint, code: "NEED_LOGIN_BLOQUEADO", hint };
}

/** Salud del proxy: GET a `/api/agent-reach/health` (degrada si no hay CLI). */
export async function health(_cfg: IntegrationConfig, signal?: AbortSignal): Promise<AgentReachResult> {
  try {
    const res = await fetch("/api/agent-reach/health", { method: "GET", signal });
    const body = (await res.json().catch(() => null)) as Cuerpo | null;
    if (!body) return fallo(null, res.status);
    if (!res.ok || body.ok === false) return fallo(body, res.status);
    return { ok: true, data: body };
  } catch (e: unknown) {
    const mensaje = e instanceof Error ? e.message : String(e);
    return { ok: false, error: mensaje, code: "RED", hint: mensaje };
  }
}
