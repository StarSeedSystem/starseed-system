/**
 * destino-nube.ts — Resolución RESISTENTE del destino de la nube de Astraura
 * 1.58-bit (Ola 228 · Adenda N1).
 *
 * Antes la fuente «Astraura 1.58 (nube StarSeed)» dependía del túnel publicado
 * de UNA máquina concreta: si esa máquina se apagaba, TODOS los usuarios del OS
 * desplegado perdían la fuente. Ahora el destino se resuelve por ORDEN:
 *
 *   a) `ASTRAURA_CLOUD_URL` — despliegue propio permanente (Cloud Run, etc.).
 *   b) El túnel/publicado actual (`ASTRAURA_158_URL` o el upstream por defecto).
 *   c) `null` — no hay nube disponible ahora mismo.
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

/**
 * Devuelve el destino SANO de la nube 1.58 o `null` si ninguno responde.
 * Resultado cacheado 60 s; `invalidarDestino()` fuerza una nueva sonda.
 */
export async function destinoNube(): Promise<DestinoNube | null> {
  try {
    const ahora = Date.now();
    if (cache && ahora - cache.resueltoEn < CACHE_MS) return cache.destino;

    let destino: DestinoNube | null = null;
    // a) Despliegue propio permanente (prioridad máxima).
    const propia = limpiarBase(process.env.ASTRAURA_CLOUD_URL);
    if (propia) {
      const s = await sana(propia);
      if (s.ok) destino = { base: propia, via: "env", latenciaMs: s.latenciaMs };
    }
    // b) El túnel/publicado actual (lo que la ruta hacía a mano).
    if (!destino) {
      const tunel = limpiarBase(process.env.ASTRAURA_158_URL) || DEFAULT_UPSTREAM;
      const s = await sana(tunel);
      if (s.ok) destino = { base: tunel, via: "tunel", latenciaMs: s.latenciaMs };
    }

    cache = { resueltoEn: ahora, destino };
    return destino;
  } catch {
    return null;
  }
}
