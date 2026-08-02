import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { buildUrl, safeFetch, SsrfError } from "@/lib/security/ssrf";

// ════════════════════════════════════════════════════════════════
// Proxy multipart de integraciones (lado servidor)
// ----------------------------------------------------------------
// Variante del proxy para herramientas que reciben FICHEROS por
// multipart/form-data (p.ej. Stirling-PDF: merge, extract-text, to-img).
// El cliente construye un FormData con los ficheros y AÑADE campos de
// control: __endpoint, __path, __apiKey?, __accept?. El resto se reenvía.
//
// Respuesta: binario → { ok, data:{ base64, contentType, filename } };
//            JSON/texto → { ok, data:<json|texto> }.
//
// ════════════════════════════════════════════════════════════════
// SEGURIDAD — ANTI-SSRF (Adenda 131 · 2026-08-02)
// ----------------------------------------------------------------
// Este gemelo multipart estaba MUY por detrás del proxy JSON: era anónimo,
// tenía una blocklist estática de 3 hosts SIN resolver DNS y usaba
// redirect:"follow" → seguía un 302→169.254.169.254 (robo del token de la
// service-account) y filtraba la X-API-KEY del usuario a un tercero. Ahora:
//   1) EXIGE SESIÓN (getUser → 401).
//   2) Usa la guarda compartida `@/lib/security/ssrf`: `safeFetch` resuelve
//      DNS, clasifica IPv4/IPv6 (IMDS SIEMPRE bloqueado), sigue redirecciones
//      manualmente re-validando cada salto y descarta X-API-KEY/Authorization/
//      Cookie en saltos cross-origin.
// Timeout duro con AbortController. Nada lanza al cliente.
// ════════════════════════════════════════════════════════════════

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TIMEOUT_MS = 20_000;
const DEFAULT_TIMEOUT_MS = 18_000;

function jsonError(error: string, status = 200) {
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

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("Petición inválida (no es multipart/form-data).");
  }

  const endpoint = String(form.get("__endpoint") || "").trim();
  const path = String(form.get("__path") || "").trim();
  const apiKey = String(form.get("__apiKey") || "").trim();
  const accept = String(form.get("__accept") || "").trim().toLowerCase();

  const url = buildUrl(endpoint, path);
  if (!url) return jsonError("Endpoint no configurado o inválido.");

  // Reconstruye un FormData de salida sin los campos de control.
  const out = new FormData();
  for (const [key, value] of form.entries()) {
    if (key.startsWith("__")) continue;
    out.append(key, value as string | Blob);
  }

  const headers: Record<string, string> = {};
  if (apiKey) headers["X-API-KEY"] = apiKey;
  // No fijamos Content-Type: fetch lo pone con el boundary correcto al pasar FormData.

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS));

  try {
    // safeFetch valida el destino y CADA salto de redirección (anti-SSRF) y
    // descarta la X-API-KEY en saltos cross-origin.
    const res = await safeFetch(url, {
      method: "POST",
      headers,
      body: out,
      signal: controller.signal,
      cache: "no-store",
    });

    const ct = res.headers.get("content-type") || "";
    const status = res.status;

    if (!res.ok) {
      let msg = `La herramienta respondió ${status}.`;
      try {
        const txt = await res.text();
        if (txt) msg = txt.slice(0, 500);
      } catch { /* noop */ }
      return NextResponse.json({ ok: false, status, error: msg });
    }

    // Respuesta JSON / texto.
    if (/application\/json/i.test(ct)) {
      const txt = await res.text();
      let data: unknown = txt;
      try { data = txt ? JSON.parse(txt) : null; } catch { /* deja texto */ }
      return NextResponse.json({ ok: true, status, data });
    }

    // Binario (PDF/imagen) → base64.
    const isBinary = accept === "binary" || /pdf|image|octet-stream|zip/i.test(ct) || accept !== "json";
    if (isBinary) {
      const buf = Buffer.from(await res.arrayBuffer());
      const filename = (() => {
        const cd = res.headers.get("content-disposition") || "";
        const m = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
        return m ? decodeURIComponent(m[1]) : "salida";
      })();
      return NextResponse.json({
        ok: true,
        status,
        data: { base64: buf.toString("base64"), contentType: ct || "application/octet-stream", filename },
      });
    }

    const txt = await res.text();
    return NextResponse.json({ ok: true, status, data: txt });
  } catch (err: unknown) {
    if (err instanceof SsrfError) return jsonError(err.message, err.httpStatus);
    const aborted = (err as Error)?.name === "AbortError";
    return jsonError(
      aborted
        ? "Tiempo de espera agotado al contactar la herramienta."
        : `No se pudo contactar la herramienta: ${(err as Error)?.message || "error de red"}.`,
    );
  } finally {
    clearTimeout(timer);
  }
}
