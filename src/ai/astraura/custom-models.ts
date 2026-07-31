"use client";

/**
 * StarSeed OS — MODELOS PROPIOS INTEGRABLES (Adenda 113).
 * ============================================================================
 * Registro de modelos que el usuario añade con CUALQUIER tipo de acceso:
 *   · "local" → un modelo/servidor local del propio dispositivo (endpoint/host).
 *   · "api"   → un servicio externo por URL + clave (referencia a la credencial).
 *   · "mcp"   → un servidor externo vía MCP.
 * Sirven tanto para LLM como para voz. Los del servidor StarSeed NO se registran
 * aquí (los ofrece el servidor oficial). Persistencia local-first por cuenta.
 * Módulo LIVIANO (datos + helpers). SSR-safe. Nunca lanza.
 */

import { safeGet, safeSet } from "@/lib/safe-storage";

export const CUSTOM_MODELS_KEY = "starseed.astraura.custom-models.v1";
export const CUSTOM_MODELS_EVENT = "starseed:astraura-custom-models";

export type CustomModelAccess = "local" | "api" | "mcp";
export type CustomModelKind = "llm" | "voice";

export interface CustomModel {
  id: string;
  name: string;
  kind: CustomModelKind;
  access: CustomModelAccess;
  /** URL del endpoint (local o API). */
  endpoint?: string;
  /** Referencia/nombre de la credencial (no se guarda la clave en claro aquí). */
  apiKeyRef?: string;
  /** Servidor MCP (nombre o URL). */
  mcpServer?: string;
  /** Id/nombre del modelo dentro del servicio. */
  model?: string;
  notes?: string;
  at: number;
}

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return `cm-${crypto.randomUUID().slice(0, 8)}`;
  } catch { /* */ }
  return `cm-${Math.random().toString(36).slice(2, 10)}`;
}

function read(): CustomModel[] {
  try {
    const raw = safeGet(CUSTOM_MODELS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
      .map((x): CustomModel => ({
        id: String(x.id ?? newId()),
        name: String(x.name ?? "Modelo"),
        kind: x.kind === "voice" ? "voice" : "llm",
        access: x.access === "api" ? "api" : x.access === "mcp" ? "mcp" : "local",
        endpoint: typeof x.endpoint === "string" ? x.endpoint : undefined,
        apiKeyRef: typeof x.apiKeyRef === "string" ? x.apiKeyRef : undefined,
        mcpServer: typeof x.mcpServer === "string" ? x.mcpServer : undefined,
        model: typeof x.model === "string" ? x.model : undefined,
        notes: typeof x.notes === "string" ? x.notes : undefined,
        at: typeof x.at === "number" ? x.at : 0,
      }))
      .filter((m) => m.id);
  } catch {
    return [];
  }
}

function write(list: CustomModel[]): void {
  try {
    safeSet(CUSTOM_MODELS_KEY, JSON.stringify(list));
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CUSTOM_MODELS_EVENT, { detail: { models: list } }));
  } catch { /* */ }
}

export function listCustomModels(): CustomModel[] {
  return read();
}

export function customModelsByKind(kind: CustomModelKind): CustomModel[] {
  return read().filter((m) => m.kind === kind);
}

export function addCustomModel(input: {
  name: string;
  kind: CustomModelKind;
  access: CustomModelAccess;
  endpoint?: string;
  apiKeyRef?: string;
  mcpServer?: string;
  model?: string;
  notes?: string;
}): CustomModel {
  const m: CustomModel = {
    id: newId(),
    name: input.name.trim() || "Modelo",
    kind: input.kind === "voice" ? "voice" : "llm",
    access: input.access === "api" ? "api" : input.access === "mcp" ? "mcp" : "local",
    endpoint: (input.endpoint ?? "").trim() || undefined,
    apiKeyRef: (input.apiKeyRef ?? "").trim() || undefined,
    mcpServer: (input.mcpServer ?? "").trim() || undefined,
    model: (input.model ?? "").trim() || undefined,
    notes: (input.notes ?? "").trim() || undefined,
    at: (() => { try { return Date.now(); } catch { return 0; } })(),
  };
  write([...read(), m]);
  return m;
}

export function updateCustomModel(id: string, patch: Partial<Omit<CustomModel, "id" | "at">>): void {
  const list = read().map((m): CustomModel => (m.id === id ? { ...m, ...patch, name: (patch.name ?? m.name).trim() || m.name } : m));
  write(list);
}

export function removeCustomModel(id: string): void {
  write(read().filter((m) => m.id !== id));
}

export function subscribeCustomModels(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const h = () => cb();
  window.addEventListener(CUSTOM_MODELS_EVENT, h);
  return () => window.removeEventListener(CUSTOM_MODELS_EVENT, h);
}

/** Alcanzabilidad best-effort de una URL (no-cors → sabe si RESPONDE, sin leer). */
async function probeUrl(url: string): Promise<{ ok: boolean; msg: string }> {
  try {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return { ok: false, msg: "Sin conexión" };
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const t = ctrl ? setTimeout(() => ctrl.abort(), 4000) : null;
    const res = await fetch(url, { method: "GET", mode: "no-cors", signal: ctrl?.signal }).catch(() => null);
    if (t) clearTimeout(t);
    return res ? { ok: true, msg: "Responde (alcanzable)" } : { ok: false, msg: "No responde (endpoint/CORS)" };
  } catch {
    return { ok: false, msg: "No responde" };
  }
}

/**
 * Prueba funcional de un modelo propio: local/API → alcanza el endpoint; MCP →
 * alcanza la URL si la tiene, o queda registrado (se valida al usarlo). Best-effort.
 */
export async function probeCustomModel(m: CustomModel): Promise<{ ok: boolean; msg: string }> {
  try {
    if (m.access === "mcp") {
      if (!m.mcpServer) return { ok: false, msg: "Falta el servidor MCP" };
      if (/^https?:\/\//i.test(m.mcpServer)) return probeUrl(m.mcpServer);
      return { ok: true, msg: "Registrado · la conexión MCP se valida al usarlo" };
    }
    if (!m.endpoint) return { ok: false, msg: "Falta el endpoint" };
    return probeUrl(m.endpoint);
  } catch {
    return { ok: false, msg: "No se pudo probar" };
  }
}
