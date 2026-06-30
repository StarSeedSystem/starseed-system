// ════════════════════════════════════════════════════════════════
// Crawl4AI — crawler/scraper LLM-friendly (salida en Markdown)
// ----------------------------------------------------------------
// Servidor Docker self-host (puerto típico 11235). Endpoints:
//   • POST /crawl  { urls: string[] }           → resultados (markdown, html…)
//   • POST /md     { url: string, f?: "fit" }    → markdown directo (v0.6+)
// Auth: Bearer SOLO si el servidor tiene jwt_enabled; si no, sin clave.
// Verificado vía docs/quickstart de Crawl4AI (jun 2026).
// ════════════════════════════════════════════════════════════════

import type { IntegrationConfig, IntegrationResult } from "../types";
import { proxyFetch, pickText } from "./_proxy";

function urlsOf(input: any): string[] {
  if (!input) return [];
  if (typeof input === "string") return [input];
  if (Array.isArray(input)) return input.map(String).filter(Boolean);
  if (typeof input === "object") {
    if (typeof input.url === "string") return [input.url];
    if (Array.isArray(input.urls)) return input.urls.map(String).filter(Boolean);
  }
  return [];
}

/** Acción "crawl": rastrea una o varias URLs y devuelve markdown/contenido. */
export async function crawl(cfg: IntegrationConfig, input: any): Promise<IntegrationResult> {
  const urls = urlsOf(input);
  if (urls.length === 0) return { ok: false, error: "Indica al menos una URL para rastrear." };

  // Primero intenta /md (markdown directo, una URL) si solo hay una.
  if (urls.length === 1) {
    const md = await proxyFetch({
      id: "crawl4ai",
      endpoint: cfg.endpoint!,
      apiKey: cfg.apiKey,
      auth: cfg.apiKey ? "bearer" : "none",
      method: "POST",
      path: "/md",
      body: { url: urls[0] },
    });
    if (md.ok) {
      const text = pickText(md.data);
      return { ok: true, data: { markdown: text, raw: md.data } };
    }
    // si /md no existe (404) seguimos con /crawl.
  }

  const res = await proxyFetch({
    id: "crawl4ai",
    endpoint: cfg.endpoint!,
    apiKey: cfg.apiKey,
    auth: cfg.apiKey ? "bearer" : "none",
    method: "POST",
    path: "/crawl",
    body: { urls },
  });
  if (!res.ok) return res;

  // Normaliza: extrae markdown de results[].markdown (string o {raw_markdown}).
  const data: any = res.data;
  const results = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
  const docs = results.map((r: any) => ({
    url: r?.url,
    title: r?.metadata?.title || r?.title,
    markdown: typeof r?.markdown === "string" ? r.markdown : r?.markdown?.raw_markdown || r?.markdown?.fit_markdown || "",
    success: r?.success,
  }));
  const merged = docs.map((d: any) => d.markdown).filter(Boolean).join("\n\n---\n\n");
  return { ok: true, data: { markdown: merged, documents: docs, raw: data } };
}

/** Salud: ping a /health (el servidor Docker lo expone). */
export async function health(cfg: IntegrationConfig): Promise<IntegrationResult> {
  return proxyFetch({
    id: "crawl4ai",
    endpoint: cfg.endpoint!,
    apiKey: cfg.apiKey,
    auth: cfg.apiKey ? "bearer" : "none",
    method: "GET",
    path: "/health",
  });
}
