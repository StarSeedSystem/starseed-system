// ════════════════════════════════════════════════════════════════════════════
// Guarda anti-SSRF COMPARTIDA para los proxies de integraciones (lado servidor)
// (Adenda 131 · 2026-08-02)
// ----------------------------------------------------------------------------
// FUENTE ÚNICA DE VERDAD. Antes esta lógica vivía SOLO dentro de
// `api/integrations/proxy/route.ts` (endurecida en la Adenda 130) mientras su
// gemelo multipart `api/integrations/upload/route.ts` conservaba una blocklist
// estática de 3 hosts, sin resolver DNS y con `redirect:"follow"` → seguía un
// 302→169.254.169.254 y filtraba la X-API-KEY del usuario. Dos copias de la
// lógica de seguridad DIVERGEN; por eso se extrae aquí y AMBAS rutas la consumen.
//
// Qué protege:
//  · Esquemas != http/https                → bloqueados (Location file:// etc.).
//  · Hostnames de metadatos (metadata.*)   → bloqueados SIEMPRE por nombre.
//  · IP literal o RESUELTA por DNS a rango  → clasificada:
//      - metadatos cloud (IMDS)            → "always-blocked" (nunca, sin opt-in).
//      - loopback/privado/CGNAT/ULA/etc.   → "private" (gated por allowPrivate()).
//      - resto                              → "public".
//    Se resuelven TODAS las IPs (A/AAAA); si CUALQUIERA es interna → bloquea.
//    IPv6 se expande a 8 hextets (::ffff:a.b.c.d y `::` incluidos) para que un
//    `[::ffff:169.254.169.254]` no se cuele como público.
//  · safeFetch() sigue las redirecciones MANUALMENTE re-validando CADA salto y
//    descartando cabeceras sensibles (Authorization/X-API-KEY/Cookie) en saltos
//    cross-origin. Un 302→IP interna se corta ANTES de contactarla.
//
// SELF-HOST: los rangos privados/loopback se PERMITEN por defecto (es el
// propósito del proxy en un OS soberano: Ollama, Home Assistant, n8n, Stirling
// local…). Se pueden ENDURECER con INTEGRATIONS_PROXY_ALLOW_PRIVATE=0. Los
// metadatos IMDS se bloquean SIEMPRE, con o sin opt-in.
//
// ADENDA 141 (2026-08-04) — TOCTOU DE DNS-REBINDING (residual MEDIO, cerrado):
// isBlocked() resolvía el hostname por DNS y lo validaba, pero safeFetch()
// llamaba después a fetch(url), que vuelve a resolver el MISMO nombre POR SU
// CUENTA (undici) → dos resoluciones DNS independientes. Un atacante con
// control del DNS servido (TTL 0, respuestas alternas) puede devolver una IP
// pública en la validación y 169.254.169.254 (u otra interna) en el fetch real
// — requiere sesión + infraestructura DNS del atacante, por eso era MEDIO, no
// crítico, pero había que cerrarlo. FIX — IP PINNING: safeFetch() ahora
// resuelve cada destino UNA sola vez por salto (`resolveAndPin`, que isBlocked
// ahora reutiliza), clasifica TODAS las IPs devueltas con la MISMA lógica de
// siempre y, si el destino se permite, CONECTA a la IP ya validada mediante un
// `undici.Agent` cuyo `connect.lookup` está fijado a esa IP — nunca vuelve a
// preguntarle al DNS. El Host header y el SNI/certificado TLS siguen
// derivándose del HOSTNAME original (undici calcula `servername` a partir del
// host de la petición, no de la IP de conexión), así que vhosts por nombre y
// la validación de certificado siguen funcionando exactamente igual. Límite
// reconocido: se fija UNA sola IP por salto (la primera pública permitida, o
// la primera privada si solo hay privadas y allowPrivate); si el nombre
// resuelve a varias IPs válidas, el pinning no rota entre ellas. DEFENSA EN
// PROFUNDIDAD: si `undici` no está disponible o construir el dispatcher falla
// por cualquier motivo, se cae al fetch() normal (que sigue revalidando cada
// salto con resolveAndPin ANTES de contactarlo) — el pinning solo puede
// REFORZAR la petición, nunca romperla.
// ════════════════════════════════════════════════════════════════════════════

import { promises as dns } from "node:dns";
import type { LookupOptions, LookupAddress } from "node:dns";
import { isIP } from "node:net";

/** Hostnames de metadatos cloud que NUNCA deben ser alcanzables (anti-SSRF). */
export const BLOCKED_HOSTNAMES = new Set([
  "metadata.google.internal",
  "metadata.goog",
  "metadata",
]);

/** Máximo de redirecciones que seguimos manualmente (cada una re-validada). */
export const MAX_REDIRECTS = 5;

export type IpClass = "always-blocked" | "private" | "public";

/**
 * ¿Se permiten destinos privados/loopback? Por DEFECTO SÍ — es el PROPÓSITO del
 * proxy de integraciones en un OS soberano/self-host. Los METADATOS de nube se
 * bloquean SIEMPRE aparte de esto (classifyIp → "always-blocked"). Endurecible
 * con INTEGRATIONS_PROXY_ALLOW_PRIVATE=0 en despliegues sin self-host.
 */
export function allowPrivate(): boolean {
  const v = (process.env.INTEGRATIONS_PROXY_ALLOW_PRIVATE || "").trim().toLowerCase();
  return !(v === "0" || v === "false" || v === "no" || v === "off");
}

/** Construye la URL final de forma segura (acepta "localhost:8080" sin esquema). */
export function buildUrl(endpoint: string, path?: string, query?: Record<string, string>): URL | null {
  try {
    let base = (endpoint || "").trim();
    if (!base) return null;
    if (!/^https?:\/\//i.test(base)) base = "http://" + base;
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

/** Clasifica una IPv4 (validada) en metadatos-always / privada / pública. */
export function classifyIpv4(ip: string): IpClass {
  const parts = ip.split(".");
  if (parts.length !== 4) return "always-blocked";
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return "always-blocked";
  const [a, b] = nums;
  // SIEMPRE bloqueado (no gated por allowPrivate): link-local + IMDS de todos los proveedores.
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
 * expandir, un `[::ffff:169.254.169.254]` (IMDS) se colaba como "public".
 */
export function expandIpv6(ip: string): number[] | null {
  let s = ip;
  const dq = s.match(/^(.*:)((?:\d{1,3}\.){3}\d{1,3})$/);
  if (dq) {
    const v4 = dq[2].split(".").map((n) => Number(n));
    if (v4.length !== 4 || v4.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    s = dq[1] + (((v4[0] << 8) | v4[1]).toString(16)) + ":" + (((v4[2] << 8) | v4[3]).toString(16));
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
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
  // Cada grupo debe ser 1-4 dígitos hex; así "12345::", "gggg::" o un dotted-quad
  // mal formado ("::ffff:1.2.3.4.5") → null en vez de un número truncado por parseInt.
  if (all.some((grp) => !/^[0-9a-fA-F]{1,4}$/.test(grp))) return null;
  return all.map((grp) => parseInt(grp, 16));
}

/** Clasifica una IPv6 (o IPv4-mapped) en metadatos-always / privada / pública. */
export function classifyIpv6(raw: string): IpClass {
  const ip = raw.toLowerCase().replace(/^\[/, "").replace(/\]$/, "").split("%")[0];
  const g = expandIpv6(ip);
  if (!g) return "always-blocked"; // forma no parseable → fail-closed

  // Direcciones especiales primero (antes de mapped/compat, que si no capturarían ::1).
  if (g.every((h) => h === 0)) return "private"; // :: unspecified
  if (g.slice(0, 7).every((h) => h === 0) && g[7] === 1) return "private"; // ::1 loopback

  // Formas que EMBEBEN una IPv4 → clasifícala por su IPv4 (así IMDS/privados no se
  // cuelan como "public"). Cubre: mapped ::ffff:a.b.c.d, compat ::a.b.c.d, NAT64
  // 64:ff9b::/96 y 6to4 2002::/16 (revisión adversarial Adenda 131).
  const mapped = g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0xffff;
  const compat = g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0 && (g[6] !== 0 || g[7] !== 0);
  const v4FromLow32 = () => `${(g[6] >> 8) & 0xff}.${g[6] & 0xff}.${(g[7] >> 8) & 0xff}.${g[7] & 0xff}`;
  if (mapped || compat) return classifyIpv4(v4FromLow32());
  // NAT64 well-known prefix 64:ff9b::/96 → IPv4 en los últimos 32 bits.
  if (g[0] === 0x0064 && g[1] === 0xff9b && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0) {
    return classifyIpv4(v4FromLow32());
  }
  // 6to4 2002::/16 → IPv4 en los bits 16..48 (g[1], g[2]).
  if (g[0] === 0x2002) {
    return classifyIpv4(`${(g[1] >> 8) & 0xff}.${g[1] & 0xff}.${(g[2] >> 8) & 0xff}.${g[2] & 0xff}`);
  }

  const h0 = g[0];
  if ((h0 & 0xffc0) === 0xfe80) return "always-blocked"; // fe80::/10 link-local (incl. IMDSv6)
  if (h0 === 0xfd00 && g[1] === 0x0ec2) return "always-blocked"; // fd00:ec2::/32 IMDSv6 (AWS)
  if ((h0 & 0xfe00) === 0xfc00) return "private"; // fc00::/7 unique-local
  return "public";
}

export function classifyIp(ip: string): IpClass {
  const kind = isIP(ip);
  if (kind === 4) return classifyIpv4(ip);
  if (kind === 6) return classifyIpv6(ip);
  return "always-blocked"; // no es una IP válida → fail-closed
}

// ────────────────────────────────────────────────────────────────────────────
// IP PINNING (Adenda 141) — cierra el TOCTOU de DNS-rebinding entre la
// validación y el fetch() real. Ver la cabecera del archivo para el problema
// completo; aquí solo la mecánica.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Firma exacta que `net.connect`/`tls.connect` (y por tanto `connect.lookup`
 * de un `undici.Agent`) exigen para sustituir su resolución DNS interna —
 * igual que `dns.lookup(hostname, options, callback)`.
 */
type NodeLookupFunction = (
  hostname: string,
  options: LookupOptions,
  callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
) => void;

/** Normaliza `LookupOptions.family` (puede llegar como 4/6/"IPv4"/"IPv6"/undefined) a 0|4|6. */
function normalizeFamily(f: LookupOptions["family"]): number {
  if (f === "IPv4") return 4;
  if (f === "IPv6") return 6;
  return typeof f === "number" ? f : 0;
}

/**
 * Construye una función `lookup` que responde SIEMPRE con `pinnedIp`/`pinnedFamily`,
 * sin importar qué hostname se le pregunte — así el connect interno de undici
 * nunca dispara una SEGUNDA resolución DNS independiente (exactamente el TOCTOU
 * que cerramos). Respeta la familia: si el llamante pide explícitamente la
 * familia contraria a la fijada, no hay nada seguro que devolver → error tipo
 * ENOTFOUND (fail-closed) en vez de inventar una IP de otra familia o dejar
 * que se resuelva de verdad.
 */
function makeFixedLookup(pinnedIp: string, pinnedFamily: 4 | 6): NodeLookupFunction {
  return function fixedLookup(hostname, options, callback) {
    const wantFamily = normalizeFamily(options?.family);
    if (wantFamily && wantFamily !== pinnedFamily) {
      const err: NodeJS.ErrnoException = Object.assign(
        new Error(`Sin IP fijada de familia ${wantFamily} para ${hostname} (se fijó IPv${pinnedFamily}).`),
        { code: "ENOTFOUND", hostname },
      );
      callback(err, "");
      return;
    }
    if (options?.all) {
      callback(null, [{ address: pinnedIp, family: pinnedFamily }]);
    } else {
      callback(null, pinnedIp, pinnedFamily);
    }
  };
}

/**
 * Módulo `undici` cargado de forma perezosa y defensiva. `import()` dinámico,
 * a diferencia de un `import` estático, NUNCA lanza de forma síncrona si el
 * paquete faltara en algún entorno atípico (build raro, runtime recortado) —
 * el `.catch` deja `null` como señal de "sin pinning disponible" y el
 * llamante cae al fetch() normal (ver buildPinnedDispatcher). Se memoiza: el
 * import solo se dispara una vez por proceso.
 */
type UndiciModule = typeof import("undici");
const undiciModulePromise: Promise<UndiciModule | null> = import("undici").catch(() => null);

/**
 * Crea (si es posible) un dispatcher de undici que fija la conexión TCP/TLS
 * de ESTE salto a `ip`/`family`. El Host header y el SNI/certificado TLS
 * siguen derivándose del hostname ORIGINAL de la URL (undici calcula
 * `servername` a partir del host de la petición, no de la IP de conexión —
 * verificado empíricamente en la Adenda 141), así que los vhosts por nombre y
 * la validación de certificado por hostname NO se rompen.
 *
 * Devuelve `null` si `undici` no está disponible o si construir el Agent
 * falla por cualquier motivo — defensa en profundidad: el llamante SIEMPRE
 * debe tratar `null` cayendo al fetch() sin `dispatcher` (sigue protegido por
 * resolveAndPin() en cada salto; solo se reabre la ventana TOCTOU descrita en
 * la cabecera del archivo, nunca se rompe la petición por el pinning).
 */
async function buildPinnedDispatcher(ip: string, family: 4 | 6): Promise<import("undici").Dispatcher | null> {
  try {
    const mod = await undiciModulePromise;
    if (!mod) return null;
    return new mod.Agent({ connect: { lookup: makeFixedLookup(ip, family) } });
  } catch {
    return null;
  }
}

/** Resultado de resolver+clasificar+elegir la IP a fijar para un destino. */
export type PinResult =
  | { blocked: true }
  | { blocked: false; ip: null } // host ya era una IP literal: fetch() conecta directo sin DNS de por medio → sin TOCTOU posible, nada que fijar.
  | { blocked: false; ip: string; family: 4 | 6 }; // host por nombre: IP ya validada y elegida para fijar.

/**
 * Resuelve+clasifica+elige la IP a fijar para un destino, en UNA sola
 * resolución DNS — así safeFetch() no necesita una segunda resolución (que
 * sería exactamente el TOCTOU de la Adenda 141). Misma lógica de bloqueo
 * EXACTA que la `isBlocked()` original (que ahora delega aquí, ver abajo):
 *  · Esquema != http/https           → bloquea.
 *  · Hostname de metadatos           → bloquea SIEMPRE.
 *  · IP literal privada/metadatos    → bloquea (privada gated por allowPrivate).
 *  · Nombre: resuelve TODAS las IPs; si CUALQUIERA es metadatos → bloquea
 *    SIEMPRE (aunque haya también públicas — una respuesta DNS mixta con una
 *    IP de metadatos es señal de manipulación, fail-closed); si alguna es
 *    privada → bloquea salvo allowPrivate (TODO el host, mismo motivo); si no
 *    resuelve → bloquea.
 * Si se permite, elige la primera IP pública devuelta; si solo hay privadas
 * (y allowPrivate), elige la primera privada.
 */
export async function resolveAndPin(url: URL): Promise<PinResult> {
  const proto = url.protocol.toLowerCase();
  if (proto !== "http:" && proto !== "https:") return { blocked: true };

  const host = url.hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (!host) return { blocked: true };

  if (BLOCKED_HOSTNAMES.has(host)) return { blocked: true };

  const allowPriv = allowPrivate();

  if (isIP(host)) {
    const cls = classifyIp(host);
    if (cls === "always-blocked") return { blocked: true };
    if (cls === "private" && !allowPriv) return { blocked: true };
    return { blocked: false, ip: null }; // IP literal: nada que resolver ni fijar.
  }

  let records: LookupAddress[];
  try {
    records = await dns.lookup(host, { all: true });
  } catch {
    return { blocked: true }; // no resuelve → bloquea (fail-closed)
  }
  if (!records.length) return { blocked: true }; // sin registros → fail-closed

  let sawPrivate = false;
  let publicPick: LookupAddress | null = null;
  let privatePick: LookupAddress | null = null;
  for (const r of records) {
    const cls = classifyIp(r.address);
    if (cls === "always-blocked") return { blocked: true }; // metadatos: nunca
    if (cls === "private") {
      sawPrivate = true;
      if (!privatePick) privatePick = r;
    } else if (!publicPick) {
      publicPick = r;
    }
  }
  if (sawPrivate && !allowPriv) return { blocked: true };

  const chosen = publicPick || privatePick;
  if (!chosen) return { blocked: true }; // defensivo: no debería ocurrir (todo registro cae en una de las dos ramas de arriba)

  return { blocked: false, ip: chosen.address, family: chosen.family === 6 ? 6 : 4 };
}

/**
 * ¿Se debe BLOQUEAR este destino? Async porque resuelve DNS. Delega en
 * resolveAndPin() (Adenda 141) para no duplicar la lógica de clasificación —
 * misma decisión exacta, solo descarta la IP elegida. Quien SÍ la necesita
 * (safeFetch(), para el pinning) llama a resolveAndPin() directamente y así
 * evita pagar una segunda resolución DNS por el mismo host.
 */
export async function isBlocked(url: URL): Promise<boolean> {
  return (await resolveAndPin(url)).blocked;
}

/** Elimina cabeceras sensibles (para saltos cross-origin). Muta el objeto. */
export function stripSensitiveHeaders(headers: Record<string, string>): void {
  for (const k of Object.keys(headers)) {
    const lk = k.toLowerCase();
    if (lk === "authorization" || lk === "x-api-key" || lk === "cookie") delete headers[k];
  }
}

/** Elimina Content-Type (cuando se descarta el cuerpo en una redirección). */
export function stripContentType(headers: Record<string, string>): void {
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === "content-type") delete headers[k];
  }
}

/** Códigos de error de safeFetch → el llamante los mapea a su formato de error. */
export type SsrfErrorCode = "blocked" | "too-many-redirects" | "invalid-redirect" | "no-response";

/** Error de la guarda SSRF (bloqueo o redirección inválida). No filtra detalles internos. */
export class SsrfError extends Error {
  code: SsrfErrorCode;
  httpStatus: number;
  constructor(code: SsrfErrorCode, message: string, httpStatus: number) {
    super(message);
    this.name = "SsrfError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export interface SafeFetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit;
  signal?: AbortSignal;
  cache?: RequestCache;
  maxRedirects?: number;
}

/**
 * fetch() ENDURECIDO: valida el destino (y CADA salto de redirección) con
 * resolveAndPin() antes de contactarlo, sigue las redirecciones manualmente
 * (redirect:"manual"), descarta cabeceras sensibles en saltos cross-origin y
 * transforma método/cuerpo igual que redirect:"follow" (303 y 301/302+POST→GET;
 * 307/308 conservan). Lanza SsrfError si un destino está bloqueado o hay exceso
 * de redirecciones. Devuelve la Response FINAL (el llamante lee status/cuerpo).
 *
 * Adenda 141 — IP PINNING: cada salto llama a resolveAndPin() UNA vez (no a
 * isBlocked() + un fetch() que re-resuelve por su cuenta — eso es justo el
 * TOCTOU que cerramos, ver cabecera del archivo) y, si el host se resolvió por
 * NOMBRE, conecta a la IP ya validada con un dispatcher de undici propio de
 * ESE salto (nunca se reutiliza la IP de un salto anterior para un host
 * distinto — la resolución+fijación es siempre por salto/host). Si el host ya
 * era una IP literal, o si el pinning no se puede construir (undici no
 * disponible, error), se hace fetch() normal sin `dispatcher` — sigue
 * protegido por la revalidación de resolveAndPin en cada salto.
 */
export async function safeFetch(initialUrl: URL, init: SafeFetchInit = {}): Promise<Response> {
  const maxRedirects = init.maxRedirects ?? MAX_REDIRECTS;
  let currentUrl = initialUrl;
  let reqMethod = (init.method || "GET").toUpperCase();
  let reqBody = init.body;
  const reqHeaders = { ...(init.headers || {}) };
  let redirects = 0;

  for (;;) {
    // Resuelve + clasifica + (si aplica) FIJA una IP para el destino ACTUAL —
    // una sola resolución DNS por salto, reutilizada tanto para validar como
    // para conectar. Misma decisión de bloqueo que antes (isBlocked delega
    // aquí ahora): NO se llama también a isBlocked() por separado, porque eso
    // pagaría una segunda resolución DNS independiente y reabriría el TOCTOU.
    const pin = await resolveAndPin(currentUrl);
    if (pin.blocked) {
      throw new SsrfError("blocked", "Destino no permitido (bloqueado por seguridad).", 403);
    }

    // pin.ip === null → el host YA era una IP literal: fetch() conecta directo
    // sin resolución DNS de por medio, nada que fijar (sin TOCTOU posible).
    // pin.ip !== null → host por nombre: intenta fijar la conexión a la IP ya
    // validada arriba. `buildPinnedDispatcher` es defensivo (nunca lanza): si
    // undici no está disponible o el Agent no se puede construir, devuelve
    // `null` y caemos al fetch() normal (defensa en profundidad).
    const dispatcher = pin.ip ? await buildPinnedDispatcher(pin.ip, pin.family) : null;

    const fetchInit: RequestInit & { dispatcher?: import("undici").Dispatcher } = {
      method: reqMethod,
      headers: reqHeaders,
      body: reqBody,
      signal: init.signal,
      cache: init.cache ?? "no-store",
      redirect: "manual",
    };
    if (dispatcher) fetchInit.dispatcher = dispatcher;

    const res = await fetch(currentUrl.toString(), fetchInit);

    const isRedirect =
      (res.status === 301 || res.status === 302 || res.status === 303 ||
        res.status === 307 || res.status === 308) &&
      !!res.headers.get("location");

    // Respuesta FINAL: el llamante todavía necesita leer su cuerpo a través de
    // este socket, así que NO cerramos `dispatcher` aquí — undici lo libera
    // solo (timeout de keep-alive) en cuanto nada vuelve a referenciarlo,
    // igual que ocurriría con el dispatcher global por defecto.
    if (!isRedirect) return res;

    if (redirects >= maxRedirects) {
      throw new SsrfError("too-many-redirects", "Demasiadas redirecciones al contactar la herramienta.", 400);
    }
    redirects++;

    const loc = res.headers.get("location") as string;
    let nextUrl: URL;
    try {
      nextUrl = new URL(loc, currentUrl); // relativo → absoluto
    } catch {
      throw new SsrfError("invalid-redirect", "Redirección inválida devuelta por la herramienta.", 400);
    }

    // Cross-origin → no arrastrar credenciales del usuario a un tercero.
    if (nextUrl.origin !== currentUrl.origin) stripSensitiveHeaders(reqHeaders);

    // Transformación de método/cuerpo (igual que redirect:"follow").
    if (res.status === 303) {
      if (reqMethod !== "HEAD") reqMethod = "GET";
      reqBody = undefined;
      stripContentType(reqHeaders);
    } else if ((res.status === 301 || res.status === 302) && reqMethod === "POST") {
      reqMethod = "GET";
      reqBody = undefined;
      stripContentType(reqHeaders);
    }
    // (307/308 conservan método y cuerpo.)

    try { await res.arrayBuffer(); } catch { /* libera el socket */ }
    // Este salto queda atrás (el siguiente, si lo hay, es un salto NUEVO que
    // fijará SU PROPIA IP más arriba en la próxima vuelta) — cierra el Agent
    // fijado de este salto; best-effort, nunca debe romper el bucle.
    if (dispatcher) { try { await dispatcher.close(); } catch { /* limpieza best-effort */ } }
    currentUrl = nextUrl;
  }
}
