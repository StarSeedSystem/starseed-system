import { NextRequest, NextResponse } from "next/server";

// ════════════════════════════════════════════════════════════════
// Proxy de THE HUGGING BAY (https://huggingbay.xyz) — lado servidor
// ----------------------------------------------------------------
// Registro verificado de modelos IA open-source con API pública
// agent-friendly (GET, JSON, sin token). Este proxy evita problemas de
// CORS desde el navegador y centraliza el timeout/caché/allowlist en
// un único punto. TODO el cliente (src/ai/astraura/huggingbay.ts) pasa
// por aquí — nunca se llama a huggingbay.xyz directamente desde el
// navegador.
//
// GET-only a propósito: Hugging Bay es un catálogo de LECTURA para
// agentes; no hay ninguna acción de escritura que este proxy deba
// habilitar. Sin claves: la API pública no las requiere y este proxy
// nunca acepta ni reenvía credenciales.
//
// Uso: /api/huggingbay/<ruta-tras-huggingbay.xyz>?query...
//   p.ej. /api/huggingbay/api/recommender?useCase=chat&limit=12
//         /api/huggingbay/api/v1/artifacts/hf-model-xxx
//
// SEGURIDAD:
//   · Allowlist estricta de PREFIJOS de ruta (ver ALLOWED_PREFIXES):
//     solo lectura de catálogo/recomendador/búsqueda/kits locales.
//   · Host de destino FIJO (huggingbay.xyz) — no hay parámetro de host
//     controlado por el cliente, así que no hay superficie de SSRF.
//   · Timeout duro con AbortController.
//   · Cache HTTP corto (s-maxage) para aliviar la API pública sin
//     servir datos obsoletos por mucho tiempo.
// ════════════════════════════════════════════════════════════════

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HUGGING_BAY_ORIGIN = "https://huggingbay.xyz";
const TIMEOUT_MS = 10_000;
/** Cache breve en el edge/CDN de Vercel: el catálogo cambia poco a poco. */
const CACHE_CONTROL = "public, s-maxage=120, stale-while-revalidate=300";

/**
 * Prefijos de ruta permitidos (tras "/api/huggingbay/"), según las reglas del
 * sitio para agentes: recomendador, búsqueda (semántica + estable), catálogo,
 * trending, rankings, artefactos (detalle/bundle/card), modelos locales
 * alojados y kits locales copiables. Cualquier otra ruta se rechaza (404).
 */
const ALLOWED_PREFIXES = [
  "api/recommender",
  "api/search",
  "api/v1",
  "api/artifacts",
  "api/trending",
  "api/hosted-local-models",
  "api/local-kits",
  "api/mcp", // MCP alojado (JSON-RPC) — solo se permite GET aquí (tools/list); tools/call real usa POST desde el cliente MCP, no este proxy.
] as const;

function isAllowedPath(pathSegments: string[]): boolean {
  const joined = pathSegments.join("/");
  return ALLOWED_PREFIXES.some((p) => joined === p || joined.startsWith(`${p}/`) || joined.startsWith(`${p}?`));
}

function jsonError(error: string, status = 200) {
  // status 200 a nivel HTTP para que el cliente lea `ok:false` sin excepciones
  // de red; el detalle real del fallo viaja en el cuerpo (mismo patrón que
  // integrations/proxy/route.ts).
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const segments = Array.isArray(path) ? path : [];

  if (!segments.length || !isAllowedPath(segments)) {
    return jsonError("Ruta no permitida por el proxy de Hugging Bay.", 404);
  }

  const search = req.nextUrl.search || "";
  const targetUrl = `${HUGGING_BAY_ORIGIN}/${segments.join("/")}${search}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(targetUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
      redirect: "follow",
    });

    const raw = await res.text();
    let data: unknown = raw;
    const ct = res.headers.get("content-type") || "";
    if (/application\/json/i.test(ct)) {
      try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
    } else if (raw && (raw.trim().startsWith("{") || raw.trim().startsWith("["))) {
      try { data = JSON.parse(raw); } catch { /* deja texto */ }
    }

    if (!res.ok) {
      const msg = typeof data === "object" && data && (data as { error?: string }).error
        ? String((data as { error?: string }).error)
        : `Hugging Bay respondió ${res.status}.`;
      return NextResponse.json({ ok: false, status: res.status, error: msg, data }, { status: 200 });
    }

    return NextResponse.json(
      { ok: true, status: res.status, data },
      { headers: { "Cache-Control": CACHE_CONTROL } },
    );
  } catch (err: unknown) {
    const aborted = (err as Error)?.name === "AbortError";
    return jsonError(
      aborted
        ? `Hugging Bay tardó demasiado en responder (${TIMEOUT_MS / 1000}s).`
        : `No se pudo contactar Hugging Bay: ${(err as Error)?.message || "error de red"}.`,
    );
  } finally {
    clearTimeout(timer);
  }
}

// Salud del propio proxy (no de Hugging Bay).
export async function HEAD() {
  return NextResponse.json({ ok: true, service: "starseed-huggingbay-proxy" });
}
