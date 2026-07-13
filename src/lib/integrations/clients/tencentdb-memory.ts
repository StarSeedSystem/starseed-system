// ════════════════════════════════════════════════════════════════
// TencentDB Agent Memory — MEMORIA de largo plazo por endpoint (P4-6)
// ----------------------------------------------------------------
// QUÉ ES: sistema de memoria para agentes (TypeScript, MIT) con dos piezas:
//   · memoria SIMBÓLICA de corto plazo (condensa logs de herramientas en un
//     lienzo Mermaid → menos tokens),
//   · memoria LARGA POR CAPAS: L0 Conversación → L1 Átomo → L2 Escena → L3 Persona.
// Es 100% local por defecto (SQLite + sqlite-vec), sin APIs externas.
//
// PIEZA CLAVE PARA NOSOTROS: trae un **Gateway HTTP** propio
// (`src/gateway/server.ts` del repo — verificado leyendo su código fuente):
//   · GET  /health                    (siempre abierta)
//   · POST /recall                    → recupera memoria para el turno actual
//   · POST /capture                   → captura la conversación/turno
//   · POST /search/memories           → busca en la memoria larga
//   · POST /search/conversations      → busca en las conversaciones crudas
//   · POST /session/end               → cierra la sesión (dispara la destilación)
//   · POST /seed                      → siembra memoria inicial
//   Auth: `Authorization: Bearer <TDAI_GATEWAY_API_KEY>` (OPCIONAL; si no se
//   define, todas las rutas quedan abiertas — su propio código emite un WARN).
//   CORS: allow-list configurable; hay que autorizar el origen del OS para
//   que el navegador pueda llamarlo. Puerto del Docker oficial: 8420.
//
// HONESTIDAD: sin endpoint configurado, este conector declina limpiamente. El OS
// NO levanta ningún servidor por su cuenta ni descarga nada.
// ════════════════════════════════════════════════════════════════

import type { IntegrationConfig, IntegrationResult } from "../types";
import { proxyFetch, extra } from "./_proxy";

const ID = "tencentdb-memory";

/** Puerto por defecto del gateway (imagen Docker oficial). */
export const TDAI_DEFAULT_ENDPOINT = "http://localhost:8420";

function ids(cfg: IntegrationConfig, input?: Record<string, unknown>) {
  return {
    userId: String(input?.userId ?? extra(cfg, "userId", "user") ?? "starseed"),
    sessionId: String(input?.sessionId ?? extra(cfg, "sessionId", "session") ?? "starseed-os"),
  };
}

/** Salud del gateway (`GET /health`, ruta siempre abierta). */
export async function health(cfg: IntegrationConfig): Promise<IntegrationResult> {
  return proxyFetch({
    id: ID,
    endpoint: cfg.endpoint || TDAI_DEFAULT_ENDPOINT,
    apiKey: cfg.apiKey,
    auth: cfg.apiKey ? "bearer" : "none",
    method: "GET",
    path: "/health",
    timeoutMs: 8_000,
  });
}

/** Recupera memoria relevante para el turno actual (`POST /recall`). */
export async function recall(cfg: IntegrationConfig, input: any): Promise<IntegrationResult> {
  const query = typeof input === "string" ? input : String(input?.query ?? input?.text ?? "");
  if (!query.trim()) return { ok: false, error: "Indica qué recordar." };
  const { userId, sessionId } = ids(cfg, input);
  return proxyFetch({
    id: ID,
    endpoint: cfg.endpoint || TDAI_DEFAULT_ENDPOINT,
    apiKey: cfg.apiKey,
    auth: cfg.apiKey ? "bearer" : "none",
    method: "POST",
    path: "/recall",
    body: { query, userId, sessionId },
    timeoutMs: 15_000,
  });
}

/** Guarda un turno/conversación en la memoria (`POST /capture`). */
export async function capture(cfg: IntegrationConfig, input: any): Promise<IntegrationResult> {
  const messages = Array.isArray(input?.messages) ? input.messages : null;
  const text = typeof input === "string" ? input : String(input?.text ?? "");
  if (!messages && !text.trim()) return { ok: false, error: "Nada que capturar." };
  const { userId, sessionId } = ids(cfg, input);
  return proxyFetch({
    id: ID,
    endpoint: cfg.endpoint || TDAI_DEFAULT_ENDPOINT,
    apiKey: cfg.apiKey,
    auth: cfg.apiKey ? "bearer" : "none",
    method: "POST",
    path: "/capture",
    body: messages ? { messages, userId, sessionId } : { messages: [{ role: "user", content: text }], userId, sessionId },
    timeoutMs: 15_000,
  });
}

/** Busca en la memoria de largo plazo (`POST /search/memories`). */
export async function searchMemories(cfg: IntegrationConfig, input: any): Promise<IntegrationResult> {
  const query = typeof input === "string" ? input : String(input?.query ?? "");
  if (!query.trim()) return { ok: false, error: "Indica qué buscar en la memoria." };
  const { userId } = ids(cfg, input);
  return proxyFetch({
    id: ID,
    endpoint: cfg.endpoint || TDAI_DEFAULT_ENDPOINT,
    apiKey: cfg.apiKey,
    auth: cfg.apiKey ? "bearer" : "none",
    method: "POST",
    path: "/search/memories",
    body: { query, userId, limit: Number(input?.limit) || 10 },
    timeoutMs: 15_000,
  });
}

/** Cierra la sesión → dispara la destilación por capas (`POST /session/end`). */
export async function endSession(cfg: IntegrationConfig, input: any): Promise<IntegrationResult> {
  const { userId, sessionId } = ids(cfg, input);
  return proxyFetch({
    id: ID,
    endpoint: cfg.endpoint || TDAI_DEFAULT_ENDPOINT,
    apiKey: cfg.apiKey,
    auth: cfg.apiKey ? "bearer" : "none",
    method: "POST",
    path: "/session/end",
    body: { userId, sessionId },
    timeoutMs: 20_000,
  });
}
