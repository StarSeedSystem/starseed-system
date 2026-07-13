// ════════════════════════════════════════════════════════════════
// Typesense — motor de BÚSQUEDA por endpoint (Adenda 67 · P4-5)
// ----------------------------------------------------------------
// QUÉ ES: servidor de búsqueda open source (GPL-3.0, C++), alternativa a
// Algolia/Elasticsearch. Tolerante a erratas, en memoria, milisegundos.
// NO corre en el navegador: es un SERVIDOR que el usuario levanta en su
// neurona/CasaOS (Docker, `typesense/typesense`) o en Typesense Cloud.
//
// API REAL (v0.25+ / v30, estable y documentada):
//   · GET  /health                                   → { ok: true }
//   · GET  /collections                              → [ {name, num_documents, …} ]
//   · GET  /collections/{c}/documents/search?q=&query_by=
//   · POST /multi_search   { searches: [ {collection, q, query_by, …} ] }
// AUTENTICACIÓN: cabecera `X-TYPESENSE-API-KEY` (NO es Bearer). Se recomienda
// una clave de SOLO BÚSQUEDA (search-only key), nunca la admin key.
//
// HONESTIDAD: si el usuario no lo tiene configurado, la búsqueda del OS sigue
// funcionando exactamente igual con Supabase (ver src/lib/search/unified-search.ts).
// Typesense es una MEJORA opcional, jamás un requisito.
// ════════════════════════════════════════════════════════════════

import type { IntegrationConfig, IntegrationResult } from "../types";
import { proxyFetch, extra } from "./_proxy";

const ID = "typesense";

/** Cabecera de autenticación propia de Typesense (no usa Bearer). */
function tsHeaders(cfg: IntegrationConfig): Record<string, string> {
  const key = (cfg.apiKey || "").trim();
  return key ? { "X-TYPESENSE-API-KEY": key } : {};
}

/** Salud del servidor: `GET /health` → `{ "ok": true }`. */
export async function health(cfg: IntegrationConfig): Promise<IntegrationResult> {
  const res = await proxyFetch({
    id: ID,
    endpoint: cfg.endpoint!,
    method: "GET",
    path: "/health",
    auth: "none",
    headers: tsHeaders(cfg),
    timeoutMs: 8_000,
  });
  if (!res.ok) return res;
  const ok = (res.data as { ok?: boolean } | null)?.ok === true;
  return ok
    ? { ok: true, data: res.data }
    : { ok: false, error: "El servidor respondió, pero no se declara saludable." };
}

/** Colecciones disponibles (para elegir cuál indexa personas/grupos/publicaciones). */
export async function collections(cfg: IntegrationConfig): Promise<IntegrationResult> {
  const res = await proxyFetch({
    id: ID,
    endpoint: cfg.endpoint!,
    method: "GET",
    path: "/collections",
    auth: "none",
    headers: tsHeaders(cfg),
    timeoutMs: 10_000,
  });
  if (!res.ok) return res;
  const list = Array.isArray(res.data) ? res.data : [];
  return {
    ok: true,
    data: list.map((c: any) => ({
      name: String(c?.name ?? ""),
      documents: Number(c?.num_documents ?? 0),
      fields: Array.isArray(c?.fields) ? c.fields.map((f: any) => String(f?.name ?? "")) : [],
    })),
  };
}

export interface TypesenseSearchInput {
  /** Texto a buscar. */
  q: string;
  /** Colección (por defecto la de `extra.collection`). */
  collection?: string;
  /** Campos donde buscar, separados por coma (por defecto `extra.queryBy`). */
  queryBy?: string;
  /** Nº de resultados. */
  perPage?: number;
  /** Filtro Typesense (`filter_by`), p.ej. `kind:=grupo`. */
  filterBy?: string;
}

/** Un hit normalizado (forma neutral: la capa de búsqueda del OS la mapea). */
export interface TypesenseHit {
  id: string;
  /** Documento crudo tal cual lo indexó el usuario. */
  doc: Record<string, unknown>;
  /** Puntuación textual devuelta por Typesense. */
  score?: number;
}

/**
 * Búsqueda real. Usa `GET /collections/{c}/documents/search`.
 * Devuelve `{ hits: TypesenseHit[], found, collection }`.
 */
export async function search(cfg: IntegrationConfig, input: TypesenseSearchInput | string): Promise<IntegrationResult> {
  const i: TypesenseSearchInput = typeof input === "string" ? { q: input } : input || { q: "" };
  const q = (i.q ?? "").trim();
  if (!q) return { ok: false, error: "Indica qué buscar." };

  const collection = (i.collection || extra(cfg, "collection") || "").trim();
  if (!collection) {
    return {
      ok: false,
      error: "Falta la colección de Typesense (Ajustes → Integraciones → Typesense → colección).",
    };
  }
  const queryBy = (i.queryBy || extra(cfg, "queryBy", "query_by") || "").trim();
  if (!queryBy) {
    return {
      ok: false,
      error: "Falta `query_by` (los campos donde buscar, p.ej. «name,username,bio»).",
    };
  }

  const query: Record<string, string> = {
    q,
    query_by: queryBy,
    per_page: String(Math.min(Math.max(i.perPage ?? 12, 1), 50)),
  };
  if (i.filterBy?.trim()) query.filter_by = i.filterBy.trim();

  const res = await proxyFetch({
    id: ID,
    endpoint: cfg.endpoint!,
    method: "GET",
    path: `/collections/${encodeURIComponent(collection)}/documents/search`,
    query,
    auth: "none",
    headers: tsHeaders(cfg),
    timeoutMs: 10_000,
  });
  if (!res.ok) return res;

  const raw = res.data as { hits?: any[]; found?: number } | null;
  const hits: TypesenseHit[] = (raw?.hits ?? []).map((h: any) => ({
    id: String(h?.document?.id ?? ""),
    doc: (h?.document ?? {}) as Record<string, unknown>,
    score: typeof h?.text_match === "number" ? h.text_match : undefined,
  }));
  return { ok: true, data: { hits, found: Number(raw?.found ?? hits.length), collection } };
}
