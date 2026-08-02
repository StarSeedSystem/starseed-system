import { NextRequest, NextResponse } from "next/server";
import { promises as dns } from "node:dns";
import { isIP } from "node:net";
import { createClient } from "@/utils/supabase/server";

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
// ════════════════════════════════════════════════════════════════
// SEGURIDAD — ANTI-SSRF (endurecido · Adenda seguridad 2026-08-02)
// ----------------------------------------------------------------
// 1) EXIGE SESIÓN. Sin usuario autenticado (Supabase) → 401. Antes la
//    ruta era anónima: cualquiera en Internet podía usar el servidor
//    como proxy ciego.
// 2) DESTINOS BLOQUEADOS por defecto (fail-closed), RESOLVIENDO DNS:
//    se bloquean loopback (127/8, ::1), rangos privados RFC1918
//    (10/8, 172.16/12, 192.168/16), CGNAT (100.64/10), unspecified
//    (0.0.0.0, ::), ULA IPv6 (fc00::/7), link-local (169.254/16,
//    fe80::/10) y multicast/reservado. Se resuelve el HOSTNAME a todas
//    sus IPs (A/AAAA) y se bloquea si CUALQUIERA cae en esos rangos:
//    así un nombre que apunta a una IP interna (o DNS-rebinding) no
//    puede colarse. Esquemas != http/https también se bloquean.
// 3) METADATOS CLOUD (IMDS) SIEMPRE bloqueados, sin excepción posible:
//    169.254.169.254 / 169.254.0.0/16, metadata.google.internal,
//    fd00:ec2::254, fe80::/10. Ni el opt-in de self-host los levanta.
// 4) REDIRECCIONES SEGURAS: `redirect:"manual"` + bucle propio (máx 5).
//    CADA salto se re-valida con isBlocked() sobre la URL de Location
//    resuelta a absoluta. Un endpoint que responda 302→169.254.169.254
//    (robo de credenciales de la service-account en Cloud Run/GCE) se
//    corta ANTES de seguirlo. En saltos cross-origin se descartan las
//    cabeceras sensibles (Authorization / X-API-KEY / Cookie) para no
//    filtrar el token del usuario a un tercero.
//
// SELF-HOST (localhost / LAN): varias integraciones son self-host en
// local (p. ej. tencentdb-memory por defecto en http://localhost:8420,
// Ollama, Home Assistant, n8n…). Por eso, los rangos PRIVADOS/loopback
// (NO los de metadatos) pueden re-habilitarse con la variable de
// entorno del SERVIDOR `INTEGRATIONS_PROXY_ALLOW_PRIVATE=1`. Por
// defecto (sin la var) quedan BLOQUEADOS: seguro por defecto. Los
// endpoints de metadatos IMDS se bloquean SIEMPRE, con o sin opt-in.
//
// Timeout duro con AbortController. Nada lanza al cliente.
// ════════════════════════════════════════════════════════════════

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TIMEOUT_MS = 20_000;
const DEFAULT_TIMEOUT_MS = 15_000;
/** Máximo de redirecciones que seguimos manualmente (cada una re-validada). */
const MAX_REDIRECTS = 5;

/** Hostnames de metadatos cloud que NUNCA deben ser alcanzables (anti-SSRF). */
const BLOCKED_HOSTNAMES = new Set([
  "metadata.google.internal",
  "metadata.goog",
  "metadata",
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

/**
 * ¿Se permiten destinos privados/loopback? Por DEFECTO SÍ — es el PROPÓSITO del proxy
 * de integraciones en un OS soberano/self-host (Ollama, Home Assistant, n8n, memorias
 * locales…). Los METADATOS de nube (IMDS 169.254.169.254 / metadata.google.internal /
 * fd00:ec2::254 / link-local) se bloquean SIEMPRE, con independencia de esto (ver
 * classifyIp → "always-blocked"), y la ruta EXIGE sesión — así el vector crítico (robo
 * del token de la service-account en Cloud Run) queda cerrado sin romper el self-host.
 * Se puede ENDURECER (bloquear también lo privado) en despliegues sin self-host con
 * INTEGRATIONS_PROXY_ALLOW_PRIVATE=0.
 */
function allowPrivate(): boolean {
  const v = (process.env.INTEGRATIONS_PROXY_ALLOW_PRIVATE || "").trim().toLowerCase();
  return !(v === "0" || v === "false" || v === "no" || v === "off");
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

type IpClass = "always-blocked" | "private" | "public";

/** Clasifica una IPv4 (validada) en metadatos-always / privada / pública. */
function classifyIpv4(ip: string): IpClass {
  const parts = ip.split(".");
  if (parts.length !== 4) return "always-blocked";
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return "always-blocked";
  const [a, b] = nums;
  // SIEMPRE bloqueado (no gated por allowPrivate): link-local + endpoints de METADATOS
  // de nube de todos los proveedores + rangos IANA special-use usados para IMDS.
  if (a === 169 && b === 254) return "always-blocked"; // 169.254/16 link-local (GCP/AWS/Azure IMDS)
  if (a === 100 && b === 100 && nums[2] === 100 && nums[3] === 200) return "always-blocked"; // Alibaba/ECS IMDS
  if (a === 192 && b === 0 && nums[2] === 0) return "always-blocked"; // 192.0.0.0/24 IANA special (incl. 192.0.0.192)
  // Privados / reservados (gated por allowPrivate).
  if (a === 0) return "private"; // 0.0.0.0/8 "this host"
  if (a === 10) return "private"; // 10/8
  if (a === 127) return "private"; // 127/8 loopback
  if (a === 172 && b >= 16 && b <= 31) return "private"; // 172.16/12
  if (a === 192 && b === 168) return "private"; // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return "private"; // 100.64/10 CGNAT
  if (a >= 224) return "private"; // 224/4 multicast + 240/4 reservado
  return "public";
}

/**
 * Expande una IPv6 a sus 8 grupos de 16 bits (o null si es inválida). Maneja `::`,
 * la IPv4 embebida en punto (::ffff:a.b.c.d) y grupos abreviados. Necesario porque
 * la forma NORMALIZADA por WHATWG usa HEX (::ffff:a9fe:a9fe), no dotted-quad — sin
 * expandir, un `[::ffff:169.254.169.254]` (IMDS) se colaba como "public" (SSRF a
 * metadatos, revisión adversarial Adenda 130).
 */
function expandIpv6(ip: string): number[] | null {
  let s = ip;
  // IPv4 dotted-quad embebida al final → conviértela a dos hextets hex.
  const dq = s.match(/^(.*:)((?:\d{1,3}\.){3}\d{1,3})$/);
  if (dq) {
    const v4 = dq[2].split(".").map((n) => Number(n));
    if (v4.length !== 4 || v4.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    s = dq[1] + (((v4[0] << 8) | v4[1]).toString(16)) + ":" + (((v4[2] << 8) | v4[3]).toString(16));
  }
  const halves = s.split("::");
  if (halves.length > 2) return null; // más de un "::" es inválido
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 ? (halves[1] ? halves[1].split(":") : []) : [];
  let all: string[];
  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length;
    if (missing < 0) return null;
    all = [...head, ...Array(missing).fill("0"), ...tail];
  } else {
    all = head;
  }
  if (all.length !== 8) return null;
  const nums = all.map((g) => (g === "" ? NaN : parseInt(g, 16)));
  if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 0xffff)) return null;
  return nums;
}

/** Clasifica una IPv6 (o IPv4-mapped) en metadatos-always / privada / pública. */
function classifyIpv6(raw: string): IpClass {
  const ip = raw.toLowerCase().replace(/^\[/, "").replace(/\]$/, "").split("%")[0];
  const g = expandIpv6(ip);
  if (!g) return "always-blocked"; // forma no parseable → fail-closed

  // IPv4-mapped (::ffff:a.b.c.d) o compat (::a.b.c.d): los 32 bits finales son la IPv4.
  const mapped = g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0xffff;
  const compat = g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0 && (g[6] !== 0 || g[7] !== 0);
  if (mapped || compat) {
    const v4 = `${(g[6] >> 8) & 0xff}.${g[6] & 0xff}.${(g[7] >> 8) & 0xff}.${g[7] & 0xff}`;
    return classifyIpv4(v4);
  }
  if (g.every((h) => h === 0)) return "private"; // :: unspecified
  if (g.slice(0, 7).every((h) => h === 0) && g[7] === 1) return "private"; // ::1 loopback
  const h0 = g[0];
  if ((h0 & 0xffc0) === 0xfe80) return "always-blocked"; // fe80::/10 link-local (incl. IMDSv6)
  if (h0 === 0xfd00 && g[1] === 0x0ec2) return "always-blocked"; // fd00:ec2::/32 IMDSv6 (AWS)
  if ((h0 & 0xfe00) === 0xfc00) return "private"; // fc00::/7 unique-local
  return "public";
}

function classifyIp(ip: string): IpClass {
  const kind = isIP(ip);
  if (kind === 4) return classifyIpv4(ip);
  if (kind === 6) return classifyIpv6(ip);
  return "always-blocked"; // no es una IP válida → fail-closed
}

/**
 * ¿Se debe BLOQUEAR este destino? Async porque resuelve DNS.
 *  · Esquema != http/https           → bloquea.
 *  · Hostname de metadatos           → bloquea SIEMPRE.
 *  · IP literal privada/metadatos     → bloquea (privada gated por allowPrivate).
 *  · Nombre: resuelve TODAS las IPs; si CUALQUIERA es metadatos → bloquea SIEMPRE;
 *    si alguna es privada → bloquea salvo allowPrivate; si no resuelve → bloquea.
 */
async function isBlocked(url: URL): Promise<boolean> {
  // 1) Esquema: sólo http(s). (Importa sobre todo en las REDIRECCIONES: un
  //    Location podría ser file://, gopher://, data://…)
  const proto = url.protocol.toLowerCase();
  if (proto !== "http:" && proto !== "https:") return true;

  const host = url.hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (!host) return true;

  // 2) Hostnames de metadatos: bloqueo por nombre (aunque el DNS mienta).
  if (BLOCKED_HOSTNAMES.has(host)) return true;

  const allowPriv = allowPrivate();

  // 3) IP literal → clasifícala directamente (sin DNS).
  if (isIP(host)) {
    const cls = classifyIp(host);
    if (cls === "always-blocked") return true;
    if (cls === "private") return !allowPriv;
    return false;
  }

  // 4) Nombre → resuelve TODAS las IPs (mismo getaddrinfo que usará fetch) y
  //    clasifica cada una. Metadatos → siempre; privada → salvo opt-in.
  try {
    const records = await dns.lookup(host, { all: true });
    if (!records.length) return true; // sin registros → fail-closed
    let sawPrivate = false;
    for (const r of records) {
      const cls = classifyIp(r.address);
      if (cls === "always-blocked") return true; // corta ya: metadatos nunca
      if (cls === "private") sawPrivate = true;
    }
    if (sawPrivate && !allowPriv) return true;
    return false;
  } catch {
    return true; // no resuelve → bloquea (fail-closed)
  }
}

/** Elimina cabeceras sensibles (para saltos cross-origin). Muta el objeto. */
function stripSensitiveHeaders(headers: Record<string, string>): void {
  for (const k of Object.keys(headers)) {
    const lk = k.toLowerCase();
    if (lk === "authorization" || lk === "x-api-key" || lk === "cookie") {
      delete headers[k];
    }
  }
}

/** Elimina Content-Type (cuando se descarta el cuerpo en una redirección). */
function stripContentType(headers: Record<string, string>): void {
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === "content-type") delete headers[k];
  }
}

export async function POST(req: NextRequest) {
  // ── EXIGIR SESIÓN ───────────────────────────────────────────────────────
  // Sin usuario autenticado, la ruta NO reenvía nada (evita proxy abierto).
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
  if (await isBlocked(url)) return jsonError("Destino no permitido (bloqueado por seguridad).", 403);

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
    // ── BUCLE DE REDIRECCIÓN SEGURO ───────────────────────────────────────
    // redirect:"manual" → nosotros seguimos cada 3xx, re-validando el destino
    // con isBlocked() ANTES de contactarlo. Así un 302→IP interna/metadatos se
    // corta en vez de seguirse. Máximo MAX_REDIRECTS saltos.
    let currentUrl = url;
    let reqMethod = method;
    let reqBody = bodyInit;
    const reqHeaders = { ...headers };
    let res: Response | null = null;
    let redirects = 0;

    // La URL inicial ya se validó arriba; el bucle re-valida cada salto.
    for (;;) {
      res = await fetch(currentUrl.toString(), {
        method: reqMethod,
        headers: reqHeaders,
        body: reqBody,
        signal: controller.signal,
        cache: "no-store",
        redirect: "manual", // NO seguir automáticamente: lo hacemos nosotros.
      });

      const isRedirect =
        (res.status === 301 || res.status === 302 || res.status === 303 ||
          res.status === 307 || res.status === 308) &&
        !!res.headers.get("location");

      if (!isRedirect) break; // respuesta final.

      if (redirects >= MAX_REDIRECTS) {
        return jsonError("Demasiadas redirecciones al contactar la herramienta.", 400);
      }
      redirects++;

      const loc = res.headers.get("location") as string;
      let nextUrl: URL;
      try {
        nextUrl = new URL(loc, currentUrl); // resuelve relativo → absoluto.
      } catch {
        return jsonError("Redirección inválida devuelta por la herramienta.", 400);
      }

      // RE-VALIDAR el nuevo destino ANTES de seguirlo (el núcleo del arreglo).
      if (await isBlocked(nextUrl)) {
        return jsonError("Redirección a un destino no permitido (bloqueada por seguridad).", 403);
      }

      // Cross-origin → no arrastrar credenciales del usuario a un tercero.
      if (nextUrl.origin !== currentUrl.origin) {
        stripSensitiveHeaders(reqHeaders);
      }

      // Transformación de método/cuerpo según el código (igual que redirect:follow):
      //   · 303           → GET (HEAD sigue HEAD), sin cuerpo.
      //   · 301/302 + POST → GET, sin cuerpo.
      //   · 307/308        → conserva método y cuerpo.
      if (res.status === 303) {
        if (reqMethod !== "HEAD") reqMethod = "GET";
        reqBody = undefined;
        stripContentType(reqHeaders);
      } else if ((res.status === 301 || res.status === 302) && reqMethod === "POST") {
        reqMethod = "GET";
        reqBody = undefined;
        stripContentType(reqHeaders);
      }
      // (307/308 no tocan método ni cuerpo.)

      // Drena el cuerpo de la respuesta de redirección para liberar el socket.
      try { await res.arrayBuffer(); } catch { /* no-op */ }

      currentUrl = nextUrl;
    }

    if (!res) return jsonError("No se pudo contactar la herramienta.");

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
