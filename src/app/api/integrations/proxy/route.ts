import { NextRequest, NextResponse } from "next/server";

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
//   {
//     id:       string,                 // id de la integración (telemetría)
//     endpoint: string,                 // base configurada por el usuario
//     apiKey?:  string,                 // token opcional
//     method?:  "GET" | "POST" | ...,   // por defecto POST
//     path?:    string,                 // ruta a concatenar al endpoint
//     body?:    any,                    // cuerpo JSON (si aplica)
//     query?:   Record<string,string>,  // querystring (para GET)
//     auth?:    "bearer" | "x-api-key" | "none", // cómo enviar la clave
//     headers?: Record<string,string>,  // cabeceras extra
//     timeoutMs?: number                // tope (acotado a 20s)
//   }
//
// Respuesta:
//   { ok, status, data }  ó  { ok:false, error }
//
// SEGURIDAD: solo reenvía a la URL que el usuario provee. Se PERMITE
// localhost / IPs privadas a propósito (los usuarios hacen self-host en
// local), PERO se BLOQUEAN los endpoints de metadatos cloud
// (169.254.169.254 y fd00:ec2::254) para evitar SSRF a credenciales de
// instancia. Timeout duro con AbortController. Nada lanza al cliente.
// ════════════════════════════════════════════════════════════════

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TIMEOUT_MS = 20_000;
const DEFAULT_TIMEOUT_MS = 15_000;

/** Hosts de metadatos cloud que NUNCA deben ser alcanzables (anti-SSRF). */
const BLOCKED_HOSTS = new Set([
  "169.254.169.254", // AWS / GCP / Azure IMDS
  "metadata.google.internal",
  "metadata.goog",
]);

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
  // status 200 a nivel HTTP: el cliente lee `ok:false`; así nunca rompemos
  // la cadena con throws. (Los errores reales viajan en el cuerpo.)
  return NextResponse.json({ ok: false, error }, { status });
}

/** Construye la URL final de forma segura. */
function buildUrl(endpoint: string, path?: string, query?: Record<string, string>): URL | null {
  try {
    let base = (endpoint || "").trim();
    if (!base) return null;
    if (!/^https?:\/\//i.test(base)) base = "http://" + base; // permite "localhost:8080"
    // Normaliza barras al concatenar la ruta.
    let full = base.replace(/\/+$/, "");
    if (path) {
      const p = String(path).trim();
      full += p.startsWith("/") ? p : "/" + p;
    }
    const url = new URL(full);
    if (query && typeof query === "object") {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }
    return url;
  } catch {
    return null;
  }
}

/** Rechaza únicamente endpoints de metadatos cloud (no IPs privadas). */
function isBlocked(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host)) return true;
  // Bloquea el rango link-local 169.254.0.0/16 (incluye IMDS).
  if (/^169\.254\./.test(host)) return true;
  // IMDSv6 de AWS.
  if (host === "fd00:ec2::254" || host === "[fd00:ec2::254]") return true;
  return false;
}

export async function POST(req: NextRequest) {
  let payload: ProxyRequest;
  try {
    payload = (await req.json()) as ProxyRequest;
  } catch {
    return jsonError("Petición inválida (JSON malformado).");
  }

  const url = buildUrl(payload.endpoint || "", payload.path, payload.query);
  if (!url) return jsonError("Endpoint no configurado o inválido.");
  if (isBlocked(url)) return jsonError("Destino no permitido (endpoint de metadatos bloqueado).");

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
    const res = await fetch(url.toString(), {
      method,
      headers,
      body: bodyInit,
      signal: controller.signal,
      // No seguimos credenciales; reenvío puro.
      cache: "no-store",
      redirect: "follow",
    });

    const status = res.status;
    const raw = await res.text();

    // Intenta parsear como JSON; si no, devuelve texto crudo.
    let data: unknown = raw;
    const ct = res.headers.get("content-type") || "";
    if (/application\/json/i.test(ct)) {
      try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
    } else if (raw && (raw.trim().startsWith("{") || raw.trim().startsWith("["))) {
      try { data = JSON.parse(raw); } catch { /* deja texto */ }
    }

    if (!res.ok) {
      const msg = typeof data === "object" && data && (data as any).message
        ? String((data as any).message)
        : `La herramienta respondió ${status}.`;
      return NextResponse.json({ ok: false, status, error: msg, data });
    }

    return NextResponse.json({ ok: true, status, data });
  } catch (err: unknown) {
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
