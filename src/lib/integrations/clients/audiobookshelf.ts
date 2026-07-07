// ════════════════════════════════════════════════════════════════
// Audiobookshelf — servidor self-host de audiolibros y podcasts
// ----------------------------------------------------------------
// Conector DELIBERADAMENTE de solo lectura (nunca sube/borra/edita nada):
//   GET {endpoint}/api/libraries                → tus bibliotecas de audio
//   GET {endpoint}/api/libraries/{id}/items      → audiolibros/episodios de una
// Auth: Bearer <token> (API token del propio usuario, generado en su instancia).
// El libraryId puede venir en el input o en cfg.extra.libraryId (biblioteca por
// defecto). Verificado vía api.audiobookshelf.org (jul-2026).
// ════════════════════════════════════════════════════════════════

import type { IntegrationConfig, IntegrationResult } from "../types";
import { proxyFetch, extra } from "./_proxy";

interface AbsLibrary {
  id?: string;
  name?: string;
  mediaType?: string;
  icon?: string;
}

interface AbsItem {
  id?: string;
  media?: { metadata?: { title?: string; authorName?: string; author?: string } };
}

function libraryIdOf(cfg: IntegrationConfig, input: any): string {
  if (input && typeof input === "object" && (input.libraryId || input.id)) {
    return String(input.libraryId || input.id);
  }
  return extra(cfg, "libraryId", "library_id", "library");
}

/** Acción "libraries": lista las bibliotecas de audio del usuario. */
export async function libraries(cfg: IntegrationConfig): Promise<IntegrationResult> {
  const res = await proxyFetch({
    id: "audiobookshelf",
    endpoint: cfg.endpoint!,
    apiKey: cfg.apiKey,
    auth: cfg.apiKey ? "bearer" : "none",
    method: "GET",
    path: "/api/libraries",
  });
  if (!res.ok) return res;
  const data: any = res.data;
  const list: AbsLibrary[] = Array.isArray(data?.libraries) ? data.libraries : [];
  const out = list.map((l) => ({ id: l?.id, name: l?.name, mediaType: l?.mediaType }));
  return { ok: true, data: { libraries: out, raw: data } };
}

/** Acción "items": lista los audiolibros/episodios de UNA biblioteca. */
export async function items(cfg: IntegrationConfig, input: any): Promise<IntegrationResult> {
  const libraryId = libraryIdOf(cfg, input);
  if (!libraryId) {
    return { ok: false, error: "Indica el libraryId (o configúralo en extra.libraryId): usa antes la acción «libraries»." };
  }
  const limit = (typeof input === "object" && Number(input?.limit)) || 25;
  const res = await proxyFetch({
    id: "audiobookshelf",
    endpoint: cfg.endpoint!,
    apiKey: cfg.apiKey,
    auth: cfg.apiKey ? "bearer" : "none",
    method: "GET",
    path: `/api/libraries/${encodeURIComponent(libraryId)}/items`,
    query: { limit: String(Math.min(Math.max(limit, 1), 100)) },
  });
  if (!res.ok) return res;
  const data: any = res.data;
  const rows: AbsItem[] = Array.isArray(data?.results) ? data.results : [];
  const out = rows.map((it) => ({
    id: it?.id,
    title: it?.media?.metadata?.title,
    author: it?.media?.metadata?.authorName || it?.media?.metadata?.author,
  }));
  return { ok: true, data: { items: out, total: data?.total, raw: data } };
}

/** Salud: lista de bibliotecas (endpoint barato y siempre disponible). */
export async function health(cfg: IntegrationConfig): Promise<IntegrationResult> {
  return proxyFetch({
    id: "audiobookshelf",
    endpoint: cfg.endpoint!,
    apiKey: cfg.apiKey,
    auth: cfg.apiKey ? "bearer" : "none",
    method: "GET",
    path: "/api/libraries",
    timeoutMs: 10_000,
  });
}
