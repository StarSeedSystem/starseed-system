import { NextRequest, NextResponse } from "next/server";

// ════════════════════════════════════════════════════════════════
// Proxy multipart de integraciones (lado servidor)
// ----------------------------------------------------------------
// Variante del proxy para herramientas que reciben FICHEROS por
// multipart/form-data (p.ej. Stirling-PDF: merge, extract-text, to-img).
// El cliente del navegador construye un FormData con los ficheros y los
// parámetros, y AÑADE estos campos de control:
//   __endpoint  (string)  — base configurada por el usuario
//   __path      (string)  — ruta del endpoint (p.ej. /api/v1/general/merge-pdfs)
//   __apiKey    (string?)  — token opcional (se envía como X-API-KEY)
//   __accept    (string?)  — "json" | "binary" (por defecto autodetecta)
// El resto de campos del FormData se reenvían tal cual a la herramienta.
//
// La respuesta:
//   • Si la herramienta devuelve binario (PDF/imagen) → lo devolvemos como
//     base64 en { ok:true, data:{ base64, contentType, filename } }.
//   • Si devuelve JSON/texto → { ok:true, data:<json|texto> }.
// Anti-SSRF: bloquea endpoints de metadatos cloud (igual que el proxy JSON).
// Timeout duro con AbortController. Nada lanza al cliente.
// ════════════════════════════════════════════════════════════════

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TIMEOUT_MS = 20_000;
const DEFAULT_TIMEOUT_MS = 18_000;

const BLOCKED_HOSTS = new Set([
  "169.254.169.254",
  "metadata.google.internal",
  "metadata.goog",
]);

function jsonError(error: string) {
  return NextResponse.json({ ok: false, error });
}

function buildUrl(endpoint: string, path?: string): URL | null {
  try {
    let base = (endpoint || "").trim();
    if (!base) return null;
    if (!/^https?:\/\//i.test(base)) base = "http://" + base;
    let full = base.replace(/\/+$/, "");
    if (path) {
      const p = String(path).trim();
      full += p.startsWith("/") ? p : "/" + p;
    }
    return new URL(full);
  } catch {
    return null;
  }
}

function isBlocked(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  if (host === "fd00:ec2::254" || host === "[fd00:ec2::254]") return true;
  return false;
}

export async function POST(req: NextRequest) {
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
  if (isBlocked(url)) return jsonError("Destino no permitido (endpoint de metadatos bloqueado).");

  // Reconstruye un FormData de salida sin los campos de control.
  const out = new FormData();
  for (const [key, value] of form.entries()) {
    if (key.startsWith("__")) continue;
    out.append(key, value as any);
  }

  const headers: Record<string, string> = {};
  if (apiKey) headers["X-API-KEY"] = apiKey;
  // No fijamos Content-Type: fetch lo pone con el boundary correcto al pasar FormData.

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS));

  try {
    const res = await fetch(url.toString(), {
      method: "POST",
      headers,
      body: out,
      signal: controller.signal,
      cache: "no-store",
      redirect: "follow",
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
