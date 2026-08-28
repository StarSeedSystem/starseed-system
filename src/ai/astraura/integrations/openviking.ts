// ════════════════════════════════════════════════════════════════
// OpenViking — Base de datos de contexto para agentes (memoria L0/L1/L2)
// ------------------------------------------------------------...
// Adaptador SSR-safe: solo expone funciones puras + tipos. Nunca lanza.
// Cablea al servidor OpenViking local (openviking-server) vía HTTP.
// El servidor se autoalojan en neurona propia o CasaOS (endpoint configurable).
// ════════════════════════════════════════════════════════════════

import type { IntegrationConfig, IntegrationResult } from "../../../lib/integrations/types";

export interface OpenVikingConfig extends IntegrationConfig {
  /** URL base del servidor OpenViking (ej: "http://localhost:1933"). */
  baseUrl?: string;
  /** API key (user_key) para autenticación. */
  apiKey?: string;
  /** Agent ID para trazabilidad. */
  agentId?: string;
  /** Timeout en ms. */
  timeoutMs?: number;
}

export interface VikingUri {
  uri: string;          // ej: "viking://resources/", "viking://user/memories/", "viking://agent/skills/"
  name?: string;
  type?: "directory" | "file" | "resource" | "skill";
  size?: number;
  modifiedAt?: string;
  tags?: string[];
  abstract?: string;    // L0
  overview?: string;    // L1
  content?: string;     // L2 (contenido completo)
}

export interface SearchResult {
  uri: string;
  score: number;
  snippet?: string;
  abstract?: string;
  overview?: string;
}

export interface SessionMemory {
  sessionId: string;
  profile?: string;
  preferences?: string;
  entities?: string[];
  events?: string[];
  cases?: string[];
  patterns?: string[];
}

/** Verifica salud del servidor (no requiere auth). */
export async function healthCheck(config: OpenVikingConfig): Promise<IntegrationResult> {
  try {
    const baseUrl = config.baseUrl || "http://localhost:1933";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs || 5000);

    const res = await fetch(`${baseUrl}/health`, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      return { ok: true, data: { status: "healthy" } };
    }
    return { ok: false, error: `Health check failed: ${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Health check error" };
  }
}

/** Cliente HTTP genérico para OpenViking API v1. */
async function vikingFetch<T>(
  config: OpenVikingConfig,
  path: string,
  options: RequestInit = {}
): Promise<IntegrationResult<T>> {
  const baseUrl = config.baseUrl || "http://localhost:1933";
  const url = `${baseUrl}/api/v1${path}`;

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(config.apiKey && { "X-API-Key": config.apiKey }),
    ...options.headers,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs || 30000);

  try {
    const res = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `OpenViking ${res.status}: ${text || res.statusText}` };
    }

    const data = await res.json().catch(() => ({} as T));
    return { ok: true, data };
  } catch (e) {
    clearTimeout(timeout);
    return { ok: false, error: e instanceof Error ? e.message : "Request failed" };
  }
}

/* ────────────────────────────────────────────────────────────────
   FILESYSTEM (viking:// URIs)
   ──────────────────────────────────────────────────────────────── */

/** Lista un directorio viking:// */
export async function ls(
  config: OpenVikingConfig,
  uri: string
): Promise<IntegrationResult<VikingUri[]>> {
  return vikingFetch<VikingUri[]>(config, `/fs/ls?uri=${encodeURIComponent(uri)}`);
}

/** Árbol de directorio (recursivo). */
export async function tree(
  config: OpenVikingConfig,
  uri: string,
  depth = 3
): Promise<IntegrationResult<VikingUri[]>> {
  return vikingFetch<VikingUri[]>(config, `/fs/tree?uri=${encodeURIComponent(uri)}&depth=${depth}`);
}

/** Metadatos de un recurso. */
export async function stat(
  config: OpenVikingConfig,
  uri: string
): Promise<IntegrationResult<VikingUri>> {
  return vikingFetch<VikingUri>(config, `/fs/stat?uri=${encodeURIComponent(uri)}`);
}

/** Crea un directorio. */
export async function mkdir(
  config: OpenVikingConfig,
  uri: string
): Promise<IntegrationResult<VikingUri>> {
  return vikingFetch<VikingUri>(config, "/fs/mkdir", {
    method: "POST",
    body: JSON.stringify({ uri }),
  });
}

/** Mueve/renombra un recurso. */
export async function mv(
  config: OpenVikingConfig,
  fromUri: string,
  toUri: string
): Promise<IntegrationResult<VikingUri>> {
  return vikingFetch<VikingUri>(config, "/fs/mv", {
    method: "POST",
    body: JSON.stringify({ from: fromUri, to: toUri }),
  });
}

/** Elimina un recurso. */
export async function remove(
  config: OpenVikingConfig,
  uri: string
): Promise<IntegrationResult<{ deleted: boolean }>> {
  return vikingFetch<{ deleted: boolean }>(config, "/fs", {
    method: "DELETE",
    body: JSON.stringify({ uri }),
  });
}

/* ────────────────────────────────────────────────────────────────
   CONTENT (L0 abstract / L1 overview / L2 full)
   ──────────────────────────────────────────────────────────────── */

/** Lee contenido completo (L2). */
export async function readContent(
  config: OpenVikingConfig,
  uri: string
): Promise<IntegrationResult<{ uri: string; content: string }>> {
  return vikingFetch<{ uri: string; content: string }>(
    config,
    `/content/read?uri=${encodeURIComponent(uri)}`
  );
}

/** Lee abstracto (L0). */
export async function readAbstract(
  config: OpenVikingConfig,
  uri: string
): Promise<IntegrationResult<{ uri: string; abstract: string }>> {
  return vikingFetch<{ uri: string; abstract: string }>(
    config,
    `/content/abstract?uri=${encodeURIComponent(uri)}`
  );
}

/** Lee overview (L1). */
export async function readOverview(
  config: OpenVikingConfig,
  uri: string
): Promise<IntegrationResult<{ uri: string; overview: string }>> {
  return vikingFetch<{ uri: string; overview: string }>(
    config,
    `/content/overview?uri=${encodeURIComponent(uri)}`
  );
}

/* ────────────────────────────────────────────────────────────────
   SEARCH / RETRIEVAL
   ──────────────────────────────────────────────────────────────── */

/** Búsqueda semántica (returns assembled context-ready results). */
export async function semanticSearch(
  config: OpenVikingConfig,
  query: string,
  opts?: { limit?: number; uriScope?: string; mode?: "context" | "chunks" }
): Promise<IntegrationResult<SearchResult[]>> {
  return vikingFetch<SearchResult[]>(config, "/search/search", {
    method: "POST",
    body: JSON.stringify({
      query,
      mode: opts?.mode || "context",
      limit: opts?.limit || 10,
      uri_scope: opts?.uriScope,
    }),
  });
}

/** Búsqueda semántica simple (find). */
export async function find(
  config: OpenVikingConfig,
  query: string,
  limit = 10
): Promise<IntegrationResult<SearchResult[]>> {
  return vikingFetch<SearchResult[]>(config, "/search/find", {
    method: "POST",
    body: JSON.stringify({ query, limit }),
  });
}

/** Grep (patrón en contenido). */
export async function grep(
  config: OpenVikingConfig,
  pattern: string,
  uriScope?: string
): Promise<IntegrationResult<SearchResult[]>> {
  return vikingFetch<SearchResult[]>(config, "/search/grep", {
    method: "POST",
    body: JSON.stringify({ pattern, uri_scope: uriScope }),
  });
}

/** Glob (patrón de archivo). */
export async function glob(
  config: OpenVikingConfig,
  pattern: string,
  uriScope?: string
): Promise<IntegrationResult<SearchResult[]>> {
  return vikingFetch<SearchResult[]>(config, "/search/glob", {
    method: "POST",
    body: JSON.stringify({ pattern, uri_scope: uriScope }),
  });
}

/* ────────────────────────────────────────────────────────────────
   SESSIONS & MEMORY EXTRACTION (auto-evolución)
   ──────────────────────────────────────────────────────────────── */

/** Crea una sesión. */
export async function createSession(
  config: OpenVikingConfig,
  agentId?: string
): Promise<IntegrationResult<{ session_id: string }>> {
  return vikingFetch<{ session_id: string }>(config, "/sessions", {
    method: "POST",
    body: JSON.stringify({ agent_id: agentId || config.agentId }),
  });
}

/** Añade mensajes a una sesión. */
export async function addSessionMessages(
  config: OpenVikingConfig,
  sessionId: string,
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>
): Promise<IntegrationResult<{ added: number }>> {
  return vikingFetch<{ added: number }>(config, `/sessions/${sessionId}/messages/batch`, {
    method: "POST",
    body: JSON.stringify({ messages }),
  });
}

/** Obtiene contexto ensamblado de una sesión (injection-ready). */
export async function getSessionContext(
  config: OpenVikingConfig,
  sessionId: string
): Promise<IntegrationResult<{ context: string }>> {
  return vikingFetch<{ context: string }>(config, `/sessions/${sessionId}/context`);
}

/** Commitea sesión: archiva y extrae memoria (6 categorías). */
export async function commitSession(
  config: OpenVikingConfig,
  sessionId: string
): Promise<IntegrationResult<SessionMemory>> {
  return vikingFetch<SessionMemory>(config, `/sessions/${sessionId}/commit`, {
    method: "POST",
  });
}

/** Extrae memoria sin archivar. */
export async function extractMemory(
  config: OpenVikingConfig,
  sessionId: string
): Promise<IntegrationResult<SessionMemory>> {
  return vikingFetch<SessionMemory>(config, `/sessions/${sessionId}/extract`, {
    method: "POST",
  });
}

/* ────────────────────────────────────────────────────────────────
   RESOURCES & SKILLS
   ──────────────────────────────────────────────────────────────── */

/** Añade un recurso (URL o upload previo). */
export async function addResource(
  config: OpenVikingConfig,
  path: string,
  opts?: { tags?: string[]; uriScope?: string }
): Promise<IntegrationResult<{ uri: string }>> {
  return vikingFetch<{ uri: string }>(config, "/resources", {
    method: "POST",
    body: JSON.stringify({ path, tags: opts?.tags, uri_scope: opts?.uriScope }),
  });
}

/** Lista skills. */
export async function listSkills(
  config: OpenVikingConfig
): Promise<IntegrationResult<Array<{ name: string; description: string }>>> {
  return vikingFetch<Array<{ name: string; description: string }>>(config, "/skills");
}

/* ────────────────────────────────────────────────────────────────
   HIGH-LEVEL HELPERS para Aurora (exocortex, cerebros, orbe)
   ──────────────────────────────────────────────────────────────── */

/** Ingiere una URL/web/archivo al contexto del agente (viking://resources/). */
export async function ingestResource(
  config: OpenVikingConfig,
  url: string,
  tags?: string[]
): Promise<IntegrationResult<{ uri: string }>> {
  return addResource(config, url, { tags: tags || ["ingested", "external"] });
}

/** Recupera contexto relevante para una query (para inyectar en prompt de Aurora). */
export async function recallContext(
  config: OpenVikingConfig,
  query: string,
  opts?: { scope?: "resources" | "memories" | "skills" | "all"; limit?: number }
): Promise<IntegrationResult<{ context: string; sources: SearchResult[] }>> {
  const uriScope = opts?.scope === "all" ? undefined : `viking://${opts?.scope || "resources"}/`;
  const res = await semanticSearch(config, query, { limit: opts?.limit || 8, uriScope, mode: "context" });

  if (!res.ok) return { ok: false, error: res.error };

  const sources = res.data || [];
  const context = sources
    .map((s) => `[${s.uri}] ${s.overview || s.abstract || s.snippet || ""}`)
    .filter(Boolean)
    .join("\n\n");

  return { ok: true, data: { context, sources } };
}

/** Extrae memoria de la sesión actual del usuario (para persistir en exocortex). */
export async function persistSessionMemory(
  config: OpenVikingConfig,
  sessionId: string
): Promise<IntegrationResult<SessionMemory>> {
  return commitSession(config, sessionId);
}