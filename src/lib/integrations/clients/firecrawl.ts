// ════════════════════════════════════════════════════════════════
// Firecrawl — convierte webs en Markdown/datos estructurados (API)
// ----------------------------------------------------------------
// Self-host o nube. Endpoints v1:
//   • POST /v1/scrape { url, formats:["markdown"] }  → datos de una página
//   • POST /v1/crawl  { url }                          → rastreo de sitio (async)
// Auth: Bearer <api-key>. En self-host la clave puede no exigirse.
// Verificado vía docs.firecrawl.dev v1 (jun 2026).
// ════════════════════════════════════════════════════════════════

import type { IntegrationConfig, IntegrationResult } from "../types";
import { proxyFetch, pickText } from "./_proxy";

function urlOf(input: any): string {
  if (!input) return "";
  if (typeof input === "string") return input;
  if (typeof input === "object" && typeof input.url === "string") return input.url;
  return "";
}

/** Acción "scrape": una página → markdown + metadatos. */
export async function scrape(cfg: IntegrationConfig, input: any): Promise<IntegrationResult> {
  const url = urlOf(input);
  if (!url) return { ok: false, error: "Indica una URL para extraer." };
  const formats = Array.isArray(input?.formats) ? input.formats : ["markdown"];
  const res = await proxyFetch({
    id: "firecrawl",
    endpoint: cfg.endpoint!,
    apiKey: cfg.apiKey,
    auth: cfg.apiKey ? "bearer" : "none",
    method: "POST",
    path: "/v1/scrape",
    body: { url, formats },
  });
  if (!res.ok) return res;
  const data: any = res.data;
  const markdown = data?.data?.markdown || pickText(data?.data) || pickText(data);
  return { ok: true, data: { markdown, raw: data } };
}

/** Acción "crawl": rastreo de sitio (devuelve el id/job o resultados). */
export async function crawl(cfg: IntegrationConfig, input: any): Promise<IntegrationResult> {
  const url = urlOf(input);
  if (!url) return { ok: false, error: "Indica una URL raíz para rastrear." };
  const body: Record<string, unknown> = { url };
  if (typeof input?.limit === "number") body.limit = input.limit;
  return proxyFetch({
    id: "firecrawl",
    endpoint: cfg.endpoint!,
    apiKey: cfg.apiKey,
    auth: cfg.apiKey ? "bearer" : "none",
    method: "POST",
    path: "/v1/crawl",
    body,
  });
}

/** Salud: intenta un scrape mínimo de example.com (ligero y real). */
export async function health(cfg: IntegrationConfig): Promise<IntegrationResult> {
  return proxyFetch({
    id: "firecrawl",
    endpoint: cfg.endpoint!,
    apiKey: cfg.apiKey,
    auth: cfg.apiKey ? "bearer" : "none",
    method: "POST",
    path: "/v1/scrape",
    body: { url: "https://example.com", formats: ["markdown"] },
    timeoutMs: 12_000,
  });
}
