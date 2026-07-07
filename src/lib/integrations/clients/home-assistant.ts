// ════════════════════════════════════════════════════════════════
// Home Assistant — automatización del hogar (IoT), self-host
// ----------------------------------------------------------------
// Conector DELIBERADAMENTE de solo lectura: SOLO llama a /api/states (GET).
// Nunca llama a /api/services/* ni a nada que actúe sobre un dispositivo real
// — por diseño, para no arriesgar el hogar del usuario desde un chat.
//   GET {endpoint}/api/states                → estado de TODAS las entidades
//   GET {endpoint}/api/states/{entity_id}     → estado de UNA entidad
// Auth: Bearer <long-lived access token> (lo genera el propio usuario en su
// perfil de Home Assistant). Verificado vía developers.home-assistant.io/docs/api/rest
// (jul-2026).
// ════════════════════════════════════════════════════════════════

import type { IntegrationConfig, IntegrationResult } from "../types";
import { proxyFetch, extra } from "./_proxy";

interface HaState {
  entity_id?: string;
  state?: string;
  attributes?: { friendly_name?: string };
}

function slim(row: HaState) {
  return {
    entity_id: row?.entity_id,
    state: row?.state,
    name: row?.attributes?.friendly_name,
  };
}

function domainOf(input: any): string {
  if (input && typeof input === "object" && typeof input.domain === "string") return input.domain.trim();
  return "";
}

function entityIdOf(cfg: IntegrationConfig, input: any): string {
  if (typeof input === "string") return input.trim();
  if (input && typeof input === "object" && typeof input.entity_id === "string") return input.entity_id.trim();
  return extra(cfg, "entity_id", "entityId", "entity");
}

/** Acción "states": estado de todas las entidades (opcionalmente filtra por dominio, p.ej. "light"). */
export async function states(cfg: IntegrationConfig, input: any): Promise<IntegrationResult> {
  const res = await proxyFetch({
    id: "home-assistant",
    endpoint: cfg.endpoint!,
    apiKey: cfg.apiKey,
    auth: cfg.apiKey ? "bearer" : "none",
    method: "GET",
    path: "/api/states",
  });
  if (!res.ok) return res;
  const rows: HaState[] = Array.isArray(res.data) ? res.data : [];
  const domain = domainOf(input);
  const filtered = domain ? rows.filter((r) => String(r?.entity_id || "").startsWith(`${domain}.`)) : rows;
  return { ok: true, data: { states: filtered.slice(0, 200).map(slim), total: filtered.length, raw: undefined } };
}

/** Acción "state": estado de UNA entidad concreta por entity_id. */
export async function state(cfg: IntegrationConfig, input: any): Promise<IntegrationResult> {
  const entityId = entityIdOf(cfg, input);
  if (!entityId) return { ok: false, error: "Indica el entity_id de la entidad (p.ej. «light.salon»)." };
  const res = await proxyFetch({
    id: "home-assistant",
    endpoint: cfg.endpoint!,
    apiKey: cfg.apiKey,
    auth: cfg.apiKey ? "bearer" : "none",
    method: "GET",
    path: `/api/states/${encodeURIComponent(entityId)}`,
  });
  if (!res.ok) return res;
  return { ok: true, data: { ...slim(res.data as HaState), raw: res.data } };
}

/** Salud: raíz de la API (`{"message":"API running."}`). */
export async function health(cfg: IntegrationConfig): Promise<IntegrationResult> {
  return proxyFetch({
    id: "home-assistant",
    endpoint: cfg.endpoint!,
    apiKey: cfg.apiKey,
    auth: cfg.apiKey ? "bearer" : "none",
    method: "GET",
    path: "/api/",
    timeoutMs: 10_000,
  });
}
