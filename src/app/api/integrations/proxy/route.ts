import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { buildUrl, safeFetch, SsrfError } from "@/lib/security/ssrf";

// ════════════════════════════════════════════════════════════════
// Proxy genérico de integraciones (lado servidor)
// ----------------------------------------------------------------
// Los navegadores bloquean las llamadas cross-origin a endpoints
// self-host arbitrarios (CORS). Este proxy reenvía la petición desde
// el servidor de Next al endpoint que el USUARIO configuró, y devuelve
// la respuesta como JSON. Los clientes de `src/lib/integrations/clients`
// llaman aquí en vez de directamente a la herramienta.
//
// Forma de la petición (POST application/json):
//   { id, endpoint, apiKey?, method?, path?, body?, query?, auth?, headers?, timeoutMs? }
// Respuesta: { ok, status, data }  ó  { ok:false, error }
//
// ════════════════════════════════════════════════════════════════
// SEGURIDAD — ANTI-SSRF
// ----------------------------------------------------------------
// 1) EXIGE SESIÓN. Sin usuario autenticado (Supabase) → 401.
// 2) La guarda anti-SSRF vive en `@/lib/security/ssrf` (FUENTE ÚNICA,
//    compartida con `integrations/upload`). `safeFetch` resuelve DNS,
//    bloquea loopback/privados/CGNAT/ULA/link-local (privados gated por
//    INTEGRATIONS_PROXY_ALLOW_PRIVATE) y SIEMPRE los metadatos cloud (IMDS),
//    sigue las redirecciones manualmente re-validando cada salto y descarta
//    Authorization/X-API-KEY/Cookie en saltos cross-origin. Ver ese módulo.
// 3) SELF-HOST (localhost/LAN) permitido por defecto (Ollama, HA, n8n…);
//    metadatos IMDS bloqueados SIEMPRE, con o sin opt-in.
//
// Timeout duro con AbortController. Nada lanza al cliente.
// ════════════════════════════════════════════════════════════════

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TIMEOUT_MS = 20_000;
const DEFAULT_TIMEOUT_MS = 15_000;

interface ProxyRequest {
  id?: string;
  endpoint?: string;
  apiKey?: string;
  method?: string;
  path?: string;
  body?: unknown;
  query?: Record<string, string>;
  auth?: "bearer" | "x-api-key" | "none";
  headers?: Record<string, string>;
  timeoutMs?: number;
}

function jsonError(error: string, status = 200) {
  // status 200 a nivel HTTP por defecto: el cliente lee `ok:false`; así nunca
  // rompemos la cadena con throws. (Los bloqueos de seguridad sí usan 401/403.)
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: NextRequest) {
  // ── EXIGIR SESIÓN ───────────────────────────────────────────────────────
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return jsonError("Necesitas iniciar sesión para usar las integraciones.", 401);
    }
  } catch {
    return jsonError("No se pudo verificar la sesión.", 401);
  }

  let payload: ProxyRequest;
  try {
    payload = (await req.json()) as ProxyRequest;
  } catch {
    return jsonError("Petición inválida (JSON malformado).");
  }

  const url = buildUrl(payload.endpoint || "", payload.path, payload.query);
  if (!url) return jsonError("Endpoint no configurado o inválido.");

  const method = (payload.method || "POST").toUpperCase();
  const auth = payload.auth || "bearer";

  // Cabeceras.
  const headers: Record<string, string> = { Accept: "application/json" };
  if (payload.headers && typeof payload.headers === "object") {
    for (const [k, v] of Object.entries(payload.headers)) {
      if (typeof v === "string") headers[k] = v;
    }
  }
  if (payload.apiKey && auth !== "none") {
    if (auth === "x-api-key") headers["X-API-KEY"] = payload.apiKey;
    else headers["Authorization"] = `Bearer ${payload.apiKey}`;
  }

  // Cuerpo (solo si no es GET/HEAD).
  let bodyInit: BodyInit | undefined;
  if (method !== "GET" && method !== "HEAD" && payload.body !== undefined && payload.body !== null) {
    if (!headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }
    const ct = headers["Content-Type"] || headers["content-type"] || "";
    bodyInit = /application\/json/i.test(ct) ? JSON.stringify(payload.body) : String(payload.body);
  }

  // Timeout duro.
  const timeoutMs = Math.min(Math.max(Number(payload.timeoutMs) || DEFAULT_TIMEOUT_MS, 1000), MAX_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // safeFetch valida el destino y CADA salto de redirección (anti-SSRF).
    const res = await safeFetch(url, {
      method,
      headers,
      body: bodyInit,
      signal: controller.signal,
      cache: "no-store",
    });

    const status = res.status;
    const raw = await res.text();

    let data: unknown = raw;
    const ct = res.headers.get("content-type") || "";
    if (/application\/json/i.test(ct)) {
      try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
    } else if (raw && (raw.trim().startsWith("{") || raw.trim().startsWith("["))) {
      try { data = JSON.parse(raw); } catch { /* deja texto */ }
    }

    if (!res.ok) {
      const msg = typeof data === "object" && data && (data as { message?: unknown }).message
        ? String((data as { message?: unknown }).message)
        : `La herramienta respondió ${status}.`;
      return NextResponse.json({ ok: false, status, error: msg, data });
    }

    return NextResponse.json({ ok: true, status, data });
  } catch (err: unknown) {
    if (err instanceof SsrfError) return jsonError(err.message, err.httpStatus);
    const aborted = (err as Error)?.name === "AbortError";
    return jsonError(
      aborted
        ? `Tiempo de espera agotado (${timeoutMs} ms) al contactar la herramienta.`
        : `No se pudo contactar la herramienta: ${(err as Error)?.message || "error de red"}.`,
    );
  } finally {
    clearTimeout(timer);
  }
}

// Salud del propio proxy (no de una herramienta concreta).
export async function GET() {
  return NextResponse.json({ ok: true, service: "starseed-integrations-proxy" });
}
