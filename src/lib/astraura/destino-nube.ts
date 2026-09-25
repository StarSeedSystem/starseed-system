/**
 * destino-nube.ts — Resolución RESISTENTE del destino de la nube de Astraura
 * 1.58-bit (Ola 228 · Adenda N1).
 *
 * Antes la fuente «Astraura 1.58 (nube StarSeed)» dependía del túnel publicado
 * de UNA máquina concreta: si esa máquina se apagaba, TODOS los usuarios del OS
 * desplegado perdían la fuente. Ahora el destino se resuelve por ORDEN:
 *
 *   a) `ASTRAURA_CLOUD_URL` — despliegue propio permanente (Cloud Run, etc.).
 *   b) El túnel que la neurona publica en Supabase (`astraura_state`, clave
 *      `tunel_publico`) — ver abajo.
 *   c) El túnel/publicado actual (`ASTRAURA_158_URL` o el upstream por defecto).
 *   d) `null` — no hay nube disponible ahora mismo.
 *
 * (2026-09-25) Alex desactivó la facturación de Google Cloud tras un cargo de 4.000 este
 * mes y pidió alternativas GRATUITAS: sin Cloud Run, la web y la app se quedaban sin
 * Astraura. La Mac ya expone su backend por un túnel rápido de Cloudflare cuya URL cambia en
 * cada arranque; `scripts/puente/publicar_tunel_astraura.py` la deja en `astraura_state`
 * (solo la escribe el service_role) y aquí se lee con la clave de servicio. Solo se acepta
 * https en `*.trycloudflare.com` (o los hosts de `ASTRAURA_TUNEL_HOSTS`). Las sondas de
 * salud van EN PARALELO: un destino caído ya no suma 2,5 s a los demás.
 *
 * Con CACHÉ de 60 s (las sondas de salud no se repiten en cada petición) y
 * COMPROBACIÓN DE SALUD (`GET <base>/api/status`, timeout 2,5 s). Nunca lanza.
 *
 * Módulo de SERVIDOR (solo lo usa la ruta proxy del OS): toca `process.env`.
 */

export interface DestinoNube {
  /** Base URL limpia (sin barra final). */
  base: string;
  /** De dónde salió el destino. */
  via: "env" | "tunel";
  /** Latencia real de la sonda `/api/status`. */
  latenciaMs: number;
}

const DEFAULT_UPSTREAM = "https://astraura-backend-334237619848.us-central1.run.app";
const SALUD_TIMEOUT_MS = 2_500;
const CACHE_MS = 60_000;

interface CacheEntrada {
  resueltoEn: number;
  destino: DestinoNube | null;
}

let cache: CacheEntrada | null = null;

/** Borra la caché: la próxima llamada vuelve a sondear. */
export function invalidarDestino(): void {
  cache = null;
}

function limpiarBase(v: string | undefined | null): string {
  return String(v ?? "").trim().replace(/\/+$/, "");
}

/** Sonda de salud: `GET <base>/api/status` con timeout duro. Nunca lanza. */
async function sana(base: string): Promise<{ ok: boolean; latenciaMs: number }> {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), SALUD_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/api/status`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    return { ok: res.ok, latenciaMs: Date.now() - t0 };
  } catch {
    return { ok: false, latenciaMs: Date.now() - t0 };
  } finally {
    clearTimeout(t);
  }
}

/** PURA: ¿es una URL de túnel aceptable? https, host de Cloudflare (o permitido), sin ruta. */
export function tunelAceptable(url: unknown, hostsExtra: string[] = []): boolean {
  try {
    const u = new URL(String(url ?? ""));
    const host = u.hostname.toLowerCase();
    return (
      u.protocol === "https:" &&
      (host.endsWith(".trycloudflare.com") || hostsExtra.includes(host)) &&
      (u.pathname === "/" || u.pathname === "") &&
      !u.search
    );
  } catch {
    return false;
  }
}

/** El túnel que la neurona publicó en Supabase, o `null`. Nunca lanza. */
export async function tunelPublicado(): Promise<string | null> {
  const base = limpiarBase(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL);
  const clave = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!base || !clave) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), SALUD_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/rest/v1/astraura_state?key=eq.tunel_publico&select=data`, {
      headers: { apikey: clave, Authorization: `Bearer ${clave}`, Accept: "application/json" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const filas = (await res.json()) as { data?: { url?: string } }[];
    const url = limpiarBase(filas?.[0]?.data?.url);
    const extra = String(process.env.ASTRAURA_TUNEL_HOSTS ?? "")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);
    return tunelAceptable(url, extra) ? url : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Devuelve el destino SANO de la nube 1.58 o `null` si ninguno responde.
 * Resultado cacheado 60 s; `invalidarDestino()` fuerza una nueva sonda.
 */
export async function destinoNube(): Promise<DestinoNube | null> {
  try {
    const ahora = Date.now();
    if (cache && ahora - cache.resueltoEn < CACHE_MS) return cache.destino;

    // Candidatos por prioridad; se sondean todos a la vez y gana el primero sano.
    const propia = limpiarBase(process.env.ASTRAURA_CLOUD_URL);
    const publicado = await tunelPublicado();
    const fijo = limpiarBase(process.env.ASTRAURA_158_URL) || DEFAULT_UPSTREAM;
    const candidatos: { base: string; via: DestinoNube["via"] }[] = [];
    if (propia) candidatos.push({ base: propia, via: "env" });
    if (publicado) candidatos.push({ base: publicado, via: "tunel" });
    if (!candidatos.some((c) => c.base === fijo)) candidatos.push({ base: fijo, via: "tunel" });
    const sondas = await Promise.all(candidatos.map((c) => sana(c.base)));
    let destino: DestinoNube | null = null;
    for (let i = 0; i < candidatos.length; i++) {
      if (sondas[i].ok) {
        destino = { base: candidatos[i].base, via: candidatos[i].via, latenciaMs: sondas[i].latenciaMs };
        break;
      }
    }

    cache = { resueltoEn: ahora, destino };
    return destino;
  } catch {
    return null;
  }
}
