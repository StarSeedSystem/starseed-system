// ════════════════════════════════════════════════════════════════
// SearXNG — metabuscador privado self-host
// ----------------------------------------------------------------
// Endpoint de búsqueda JSON:
//   GET /search?q=<query>&format=json[&categories=&language=&pageno=]
// Requiere que la instancia tenga `formats: [json]` habilitado en su
// settings.yml (por defecto solo html). No usa clave. Verificado vía
// docs de SearXNG (search API). Sin clave por defecto.
// ════════════════════════════════════════════════════════════════

import type { IntegrationConfig, IntegrationResult } from "../types";
import { proxyFetch } from "./_proxy";

function queryOf(input: any): string {
  if (!input) return "";
  if (typeof input === "string") return input;
  if (typeof input === "object") return String(input.q || input.query || input.consulta || input.texto || "");
  return "";
}

/** Acción "search": búsqueda web → lista de resultados normalizada. */
export async function search(cfg: IntegrationConfig, input: any): Promise<IntegrationResult> {
  const q = queryOf(input);
  if (!q) return { ok: false, error: "Indica una consulta de búsqueda." };
  const query: Record<string, string> = { q, format: "json" };
  if (typeof input?.categories === "string") query.categories = input.categories;
  if (typeof input?.language === "string") query.language = input.language;
  if (typeof input?.pageno === "number") query.pageno = String(input.pageno);

  const res = await proxyFetch({
    id: "searxng",
    endpoint: cfg.endpoint!,
    apiKey: cfg.apiKey,
    auth: "none",
    method: "GET",
    path: "/search",
    query,
  });
  if (!res.ok) return res;
  const data: any = res.data;
  const results = Array.isArray(data?.results) ? data.results : [];
  const items = results.slice(0, 20).map((r: any) => ({
    title: r?.title,
    url: r?.url,
    content: r?.content,
    engine: r?.engine,
  }));
  return { ok: true, data: { results: items, answers: data?.answers, raw: data } };
}

/** Salud: una búsqueda mínima ("starseed") en formato JSON. */
export async function health(cfg: IntegrationConfig): Promise<IntegrationResult> {
  return proxyFetch({
    id: "searxng",
    endpoint: cfg.endpoint!,
    auth: "none",
    method: "GET",
    path: "/search",
    query: { q: "starseed", format: "json" },
    timeoutMs: 10_000,
  });
}
