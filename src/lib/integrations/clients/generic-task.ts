// ════════════════════════════════════════════════════════════════
// Cliente genérico de "tarea" — OpenHands y Browser Use (EXPERIMENTAL)
// ----------------------------------------------------------------
// OpenHands y Browser Use exponen servidores cuyo API REST varía entre
// versiones (y a menudo es por sesión/WebSocket). En lugar de fijar un
// contrato frágil, ofrecemos un POST genérico de "tarea":
//   POST {endpoint}{path}   { task, ...input }
// El usuario configura la RUTA exacta en cfg.extra.path (p.ej.
// "/api/conversations" para OpenHands o "/api/v1/run/task" para un
// servidor Browser-Use). Si no la da, probamos rutas razonables por
// defecto. Marcado EXPERIMENTAL en el descriptor: si la API no encaja,
// devuelve un error honesto sin romper nada.
// ════════════════════════════════════════════════════════════════

import type { IntegrationConfig, IntegrationResult } from "../types";
import { proxyFetch, extra, pickText } from "./_proxy";

function taskOf(input: any): string {
  if (typeof input === "string") return input;
  if (input && typeof input === "object") return String(input.task || input.instruction || input.prompt || input.query || input.text || "");
  return "";
}

const DEFAULT_PATHS: Record<string, string[]> = {
  openhands: ["/api/conversations", "/api/tasks", "/api/v1/tasks"],
  "browser-use": ["/api/v1/run/task", "/api/run", "/run", "/task"],
};

/** Acción "run-task": envía una tarea en lenguaje natural al servidor. */
export async function runTask(id: string, cfg: IntegrationConfig, input: any): Promise<IntegrationResult> {
  const task = taskOf(input);
  if (!task) return { ok: false, error: "Indica una tarea/instrucción a ejecutar." };

  const configured = extra(cfg, "path", "route", "endpointPath");
  const candidates = configured ? [configured] : (DEFAULT_PATHS[id] || ["/task"]);

  const baseBody: Record<string, unknown> = (input && typeof input === "object") ? { ...input } : {};
  baseBody.task = task;
  if (!("instruction" in baseBody)) baseBody.instruction = task; // alias defensivo

  let lastErr = "No se pudo contactar el servidor.";
  for (const path of candidates) {
    const res = await proxyFetch({
      id,
      endpoint: cfg.endpoint!,
      apiKey: cfg.apiKey,
      auth: cfg.apiKey ? "bearer" : "none",
      method: "POST",
      path,
      body: baseBody,
      timeoutMs: 18_000,
    });
    if (res.ok) {
      return { ok: true, data: { text: pickText(res.data), path, raw: res.data } };
    }
    lastErr = res.error || lastErr;
    // Si fue un error claramente NO-404 (p.ej. 401/422), no insistas con otras rutas.
    if (/respondió 4(0[13]|22)/.test(lastErr)) break;
  }
  return {
    ok: false,
    error: configured
      ? lastErr
      : `${lastErr} (Configura la ruta exacta en extra.path; este conector es experimental.)`,
  };
}

/** Salud: GET a la raíz / a un /health típico. */
export async function health(id: string, cfg: IntegrationConfig): Promise<IntegrationResult> {
  const res = await proxyFetch({
    id,
    endpoint: cfg.endpoint!,
    apiKey: cfg.apiKey,
    auth: cfg.apiKey ? "bearer" : "none",
    method: "GET",
    path: "/health",
    timeoutMs: 8_000,
  });
  if (res.ok) return res;
  // Fallback: raíz.
  return proxyFetch({
    id,
    endpoint: cfg.endpoint!,
    apiKey: cfg.apiKey,
    auth: cfg.apiKey ? "bearer" : "none",
    method: "GET",
    path: "/",
    timeoutMs: 8_000,
  });
}
