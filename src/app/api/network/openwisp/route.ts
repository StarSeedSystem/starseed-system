import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { buildUrl, safeFetch, SsrfError } from "@/lib/security/ssrf";

// ════════════════════════════════════════════════════════════════
// Proxy del controlador OpenWISP (lado servidor)
// ----------------------------------------------------------------
// Replica EXACTAMENTE el patrón de `src/app/api/integrations/proxy/route.ts`
// (mismo runtime, misma exigencia de sesión, misma guarda anti-SSRF
// compartida). Es un archivo INDEPENDIENTE (no importa nada del proxy de
// integraciones) porque habla un protocolo distinto: token Bearer emitido
// por `POST /api/v1/users/token/` de OpenWISP en vez de un `apiKey` genérico.
//
// Los navegadores no pueden llamar directo al controlador OpenWISP del
// usuario (CORS, y sería SSRF si lo hiciéramos sin guarda desde el server).
// Este proxy reenvía la petición desde el servidor de Next al controlador
// que el USUARIO configuró (`src/lib/network/neuron-network.ts` → owRequest),
// y devuelve la respuesta como JSON.
//
// Forma de la petición (POST application/json):
//   { controllerUrl, path, method?, token?, body? }
// Respuesta: { ok, status, data }  ó  { ok:false, error }
//
// ════════════════════════════════════════════════════════════════
// SEGURIDAD — ANTI-SSRF
// ----------------------------------------------------------------
// 1) EXIGE SESIÓN. Sin usuario autenticado (Supabase) → 401.
// 2) La guarda anti-SSRF vive en `@/lib/security/ssrf` (FUENTE ÚNICA,
//    compartida con `integrations/proxy` e `integrations/upload`). `safeFetch`
//    resuelve DNS, bloquea loopback/privados/CGNAT/ULA/link-local (privados
//    gated por INTEGRATIONS_PROXY_ALLOW_PRIVATE) y SIEMPRE los metadatos
//    cloud (IMDS), sigue las redirecciones manualmente re-validando cada
//    salto y descarta Authorization/Cookie en saltos cross-origin.
// 3) SELF-HOST (localhost/LAN) permitido por defecto — un controlador
//    OpenWISP casero en la red local del usuario es un caso de uso legítimo
//    (mismo espíritu que Ollama/CasaOS/n8n); metadatos IMDS bloqueados
//    SIEMPRE, con o sin opt-in.
//
// Timeout duro con AbortController. Nada lanza al cliente.
// ════════════════════════════════════════════════════════════════

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 20_000;

interface OpenWispRequest {
  controllerUrl?: string;
  path?: string;
  method?: string;
  token?: string;
  body?: unknown;
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
      return jsonError("Necesitas iniciar sesión para usar la integración con OpenWISP.", 401);
    }
  } catch {
    return jsonError("No se pudo verificar la sesión.", 401);
  }

  let payload: OpenWispRequest;
  try {
    payload = (await req.json()) as OpenWispRequest;
  } catch {
    return jsonError("Petición inválida (JSON malformado).");
  }

  const url = buildUrl(payload.controllerUrl || "", payload.path);
  if (!url) return jsonError("Controlador OpenWISP no configurado o inválido.");

  const method = (payload.method || "GET").toUpperCase();

  // Cabeceras.
  const headers: Record<string, string> = { Accept: "application/json" };
  if (payload.token && typeof payload.token === "string") {
    headers["Authorization"] = `Bearer ${payload.token}`;
  }

  // Cuerpo (solo si no es GET/HEAD).
  let bodyInit: BodyInit | undefined;
  if (method !== "GET" && method !== "HEAD" && payload.body !== undefined && payload.body !== null) {
    headers["Content-Type"] = "application/json";
    bodyInit = JSON.stringify(payload.body);
  }

  // Timeout duro.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

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
      // La API de OpenWISP (Django REST Framework) suele devolver `detail` en
      // errores de auth/permiso, o `non_field_errors`/campo→[mensajes] en
      // validación. Intentamos dar el mensaje más útil sin asumir su forma
      // (recasteamos en cada rama, igual que integrations/proxy/route.ts).
      const detail = (data as { detail?: unknown } | null)?.detail;
      const nonFieldErrors = (data as { non_field_errors?: unknown } | null)?.non_field_errors;
      const message = (data as { message?: unknown } | null)?.message;
      const msg =
        typeof detail === "string" ? detail
        : Array.isArray(nonFieldErrors) && nonFieldErrors.length ? String(nonFieldErrors[0])
        : typeof message === "string" ? message
        : `El controlador OpenWISP respondió ${status}.`;
      return NextResponse.json({ ok: false, status, error: msg, data });
    }

    return NextResponse.json({ ok: true, status, data });
  } catch (err: unknown) {
    if (err instanceof SsrfError) return jsonError(err.message, err.httpStatus);
    const aborted = (err as Error)?.name === "AbortError";
    return jsonError(
      aborted
        ? `Tiempo de espera agotado (${TIMEOUT_MS} ms) al contactar el controlador OpenWISP.`
        : `No se pudo contactar el controlador OpenWISP: ${(err as Error)?.message || "error de red"}.`,
    );
  } finally {
    clearTimeout(timer);
  }
}

// Salud del propio proxy (no del controlador OpenWISP concreto).
export async function GET() {
  return NextResponse.json({ ok: true, service: "starseed-network-openwisp-proxy" });
}
