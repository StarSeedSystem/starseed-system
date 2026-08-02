import crypto from "node:crypto";

// ════════════════════════════════════════════════════════════════════════════
// Helpers de SEGURIDAD del servidor: rate-limit en memoria + hash de OTP.
// (Ambos viven aquí porque un `route.ts` de Next NO puede exportar símbolos que
//  no sean handlers — el typecheck de rutas lo prohíbe — y ambas rutas OTP
//  necesitan compartir el MISMO hash. Módulo SÓLO de servidor: usa node:crypto.)
// ----------------------------------------------------------------------------
// Rate-limit EN MEMORIA (por instancia) — defensa básica anti-abuso
// ----------------------------------------------------------------------------
// Ventana fija con un Map<clave, {count, resetAt}>. Se usa para frenar fuerza
// bruta y ráfagas en endpoints sensibles (p. ej. /api/auth/otp/*).
//
// ⚠️ LÍMITE CONOCIDO Y DELIBERADO — NO ES DISTRIBUIDO.
//   El contador vive en la MEMORIA del proceso Node. En despliegues con varias
//   instancias (Vercel serverless / Cloud Run min>1) cada instancia cuenta por
//   su lado, y un cold start reinicia los contadores. Por tanto:
//     · Es una PRIMERA barrera (frena scripts triviales y ráfagas por-instancia).
//     · NO garantiza un tope global exacto entre instancias.
//   La defensa DURA de un solo uso y del nº de intentos por código vive en la
//   base de datos (tabla ss_otp: columnas `attempts` y `consumed`). Este módulo
//   es complementario. Para un límite global real haría falta un backend
//   compartido (Supabase RPC atómico / Upstash / Redis). Migración futura.
// ════════════════════════════════════════════════════════════════════════════

interface Bucket {
  count: number;
  resetAt: number; // epoch ms en que la ventana se reinicia
}

const BUCKETS = new Map<string, Bucket>();
let lastSweep = 0;

/** Purga oportunista de cubos vencidos (evita crecimiento no acotado del Map). */
function sweep(now: number): void {
  // Barre como mucho una vez por minuto, salvo que el Map ya sea grande.
  if (now - lastSweep < 60_000 && BUCKETS.size < 10_000) return;
  lastSweep = now;
  for (const [k, b] of BUCKETS) {
    if (b.resetAt <= now) BUCKETS.delete(k);
  }
}

export interface RateLimitResult {
  /** true si la petición está DENTRO del límite. */
  allowed: boolean;
  limit: number;
  /** peticiones restantes en la ventana actual (0 si se superó). */
  remaining: number;
  retryAfterMs: number;
  /** segundos hasta poder reintentar (para cabecera Retry-After). */
  retryAfterSec: number;
}

/**
 * Contabiliza UNA petición para `key` y dice si está dentro del límite.
 * Ventana fija: `limit` peticiones cada `windowMs`.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  let b = BUCKETS.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    BUCKETS.set(key, b);
  }
  b.count += 1;

  const allowed = b.count <= limit;
  const retryAfterMs = allowed ? 0 : Math.max(0, b.resetAt - now);
  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - b.count),
    retryAfterMs,
    retryAfterSec: Math.ceil(retryAfterMs / 1000),
  };
}

/**
 * IP del cliente a partir de las cabeceras de proxy (Vercel / Cloud Run ponen
 * `x-forwarded-for`). Se toma el PRIMER salto (el cliente real). Fallback a
 * `x-real-ip` y, si no hay nada, a "unknown" (nunca lanza).
 */
export function clientIp(req: { headers: Headers }): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip")?.trim();
  return real || "unknown";
}

// ════════════════════════════════════════════════════════════════════════════
// Hash del código OTP (para almacenarlo en ss_otp, nunca en claro)
// ----------------------------------------------------------------------------
// Defensa en profundidad: si `ss_otp` se filtrara, no se guarda el código en
// claro. HMAC-SHA256 con un secreto de servidor. El código sólo son 6 dígitos,
// así que el hash NO es la defensa principal (lo son los intentos + expiración +
// un solo uso), pero evita que un lector casual de la BD obtenga códigos
// directamente usables. LO USAN AMBAS rutas OTP (request y verify): deben
// coincidir, por eso vive aquí compartido.
// ════════════════════════════════════════════════════════════════════════════
export function hashOtp(email: string, code: string): string {
  const secret =
    process.env.OTP_HASH_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "starseed-otp-fallback-secret";
  return crypto
    .createHmac("sha256", secret)
    .update(`${email.trim().toLowerCase()}:${code}`)
    .digest("hex");
}
