/**
 * destino-nube.ts — Resolución RESISTENTE del destino de la nube de Astraura
 * 1.58-bit (Ola 228 · Adenda N1).
 *
 * Antes la fuente «Astraura 1.58 (nube StarSeed)» dependía del túnel publicado
 * de UNA máquina concreta: si esa máquina se apagaba, TODOS los usuarios del OS
 * desplegado perdían la fuente. Ahora el destino se resuelve por ORDEN:
 *
 *   a) `ASTRAURA_CLOUD_URL` — despliegue propio permanente (Cloud Run, etc.).
 *   b) El servidor fijo del registro publicado en Supabase (`astraura_state`,
 *      clave `destino_fijo`) por `publicar_destino_astraura.py` — Oracle Always
 *      Free (contrato `architecture/oracle-nube.md` §6): manda antes que el
 *      túnel de la Mac.
 *   c) El túnel que la neurona publica en Supabase (`astraura_state`, clave
 *      `tunel_publico`) — ver abajo.
 *   d) `ASTRAURA_158_URL` — override fijo por entorno, si está declarado.
 *   e) `null` — no hay nube disponible ahora mismo.
 *
 * (G2 · 2026-09-26) Ya NO hay upstream de Cloud Run por defecto: el proyecto
 * quedó SIN facturación de Google Cloud (ver abajo) y ese candidato fijo
 * estaba MUERTO — un candidato muerto en la lista solo añade una sonda que
 * siempre falla. Sin ninguno de (a)/(b)/(c), la función devuelve `null` y punto.
 *
 * (2026-09-25) Alex desactivó la facturación de Google Cloud tras un cargo de 4.000 este
 * mes y pidió alternativas GRATUITAS: sin Cloud Run, la web y la app se quedaban sin
 * Astraura. La Mac ya expone su backend por un túnel rápido de Cloudflare cuya URL cambia en
 * cada arranque; `scripts/puente/publicar_tunel_astraura.py` la deja en `astraura_state`
 * (solo la escribe el service_role) y aquí se lee con la clave de servicio. Solo se acepta
 * https en `*.trycloudflare.com` (o los hosts de `ASTRAURA_TUNEL_HOSTS`). Las sondas de
 * salud van EN PARALELO: un destino caído ya no suma 2,5 s a los demás.
 *
 * Con CACHÉ (las sondas de salud no se repiten en cada petición): 60 s cuando
 * se encontró un destino sano, y solo 10 s cuando NO se encontró ninguno (G2 ·
 * 2026-09-26) — así un túnel que acaba de publicarse (o vuelve tras una caída)
 * tarda como mucho 10 s en notarse, en vez de hasta un minuto entero sin nube.
 * COMPROBACIÓN DE SALUD (`GET <base>/api/ping`, timeout 2,5 s). Nunca lanza.
 *
 * Módulo de SERVIDOR (solo lo usa la ruta proxy del OS): toca `process.env`.
 */

export interface DestinoNube {
  /** Base URL limpia (sin barra final). */
  base: string;
  /** De dónde salió el destino. */
  via: "env" | "fijo" | "tunel";
  /** Latencia real de la sonda `/api/status`. */
  latenciaMs: number;
}

const SALUD_TIMEOUT_MS = 2_500;
/** Caché cuando SÍ se encontró un destino sano (G2 · 2026-09-26). */
const CACHE_MS_OK = 60_000;
/** Caché cuando NO se encontró ninguno: se reintenta pronto, no al minuto. */
const CACHE_MS_NULO = 10_000;

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

async function pedir(url: string): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), SALUD_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
      cache: "no-store",
    });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Sonda de salud con timeout duro. Nunca lanza.
 *
 * (2026-09-25, MEDIDO) `/api/ping` y no `/api/status`:
 * - `/api/status` calcula el estado de todo el motor y tardó 8,7 s por el túnel de la Mac
 *   (tope 2,5 s): un backend vivo pasaba por caído. `/api/ping` respondió en 0,9 s.
 * - Y es la prueba de que detrás hay un backend 1.58 COMPLETO: el destino de nube
 *   configurado en producción contestaba `/api/status` (200) pero `/api/ping`, `/api/chat`,
 *   `/api/chat/stream` y `/api/starseed/chat` con 404. Se elegía por estar «sano» y todo
 *   mensaje acababa en 404: Astraura «no respondía» en la web ni en la app.
 */
async function sana(base: string): Promise<{ ok: boolean; latenciaMs: number }> {
  const t0 = Date.now();
  const ping = await pedir(`${base}/api/ping`);
  return { ok: Boolean(ping?.ok), latenciaMs: Date.now() - t0 };
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

/**
 * PURA: ¿es una URL de destino fijo aceptable? La misma lista blanca del túnel
 * MÁS los hosts `*.sslip.io` (los subdominios de Oracle del contrato
 * `architecture/oracle-nube.md` §3): https obligatorio, sin usuario, sin ruta,
 * sin consulta y sin fragmento.
 */
export function destinoFijoAceptable(url: unknown, hostsExtra: string[] = []): boolean {
  try {
    const u = new URL(String(url ?? ""));
    const host = u.hostname.toLowerCase();
    return (
      u.protocol === "https:" &&
      (host.endsWith(".trycloudflare.com") || host.endsWith(".sslip.io") || hostsExtra.includes(host)) &&
      !u.username && !u.password &&
      (u.pathname === "/" || u.pathname === "") &&
      !u.search && !u.hash
    );
  } catch {
    return false;
  }
}

function hostsPermitidos(): string[] {
  return String(process.env.ASTRAURA_TUNEL_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/** Lee en `astraura_state` la URL publicada bajo `key` si pasa la validación. Nunca lanza. */
async function publicadoEnSupabase(
  key: string,
  aceptable: (url: unknown, extra: string[]) => boolean,
): Promise<string | null> {
  const base = limpiarBase(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL);
  const clave = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!base || !clave) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), SALUD_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/rest/v1/astraura_state?key=eq.${key}&select=data`, {
      headers: { apikey: clave, Authorization: `Bearer ${clave}`, Accept: "application/json" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const filas = (await res.json()) as { data?: { url?: string } }[];
    const url = limpiarBase(filas?.[0]?.data?.url);
    return aceptable(url, hostsPermitidos()) ? url : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** El túnel que la neurona publicó en Supabase, o `null`. Nunca lanza. */
export async function tunelPublicado(): Promise<string | null> {
  return publicadoEnSupabase("tunel_publico", tunelAceptable);
}

/** El servidor fijo del registro publicado en Supabase (Oracle), o `null`. Nunca lanza. */
export async function destinoFijoPublicado(): Promise<string | null> {
  return publicadoEnSupabase("destino_fijo", destinoFijoAceptable);
}

/**
 * Devuelve el destino SANO de la nube 1.58 o `null` si ninguno responde.
 * Resultado cacheado 60 s; `invalidarDestino()` fuerza una nueva sonda.
 */
export async function destinoNube(): Promise<DestinoNube | null> {
  try {
    const ahora = Date.now();
    if (cache) {
      const ttl = cache.destino ? CACHE_MS_OK : CACHE_MS_NULO;
      if (ahora - cache.resueltoEn < ttl) return cache.destino;
    }

    // Candidatos por prioridad; se sondean todos a la vez y gana el primero sano.
    const propia = limpiarBase(process.env.ASTRAURA_CLOUD_URL);
    const [publicadoFijo, publicado] = await Promise.all([destinoFijoPublicado(), tunelPublicado()]);
    const fijo = limpiarBase(process.env.ASTRAURA_158_URL);
    const candidatos: { base: string; via: DestinoNube["via"] }[] = [];
    if (propia) candidatos.push({ base: propia, via: "env" });
    if (publicadoFijo && !candidatos.some((c) => c.base === publicadoFijo)) {
      candidatos.push({ base: publicadoFijo, via: "fijo" });
    }
    if (publicado && !candidatos.some((c) => c.base === publicado)) {
      candidatos.push({ base: publicado, via: "tunel" });
    }
    if (fijo && !candidatos.some((c) => c.base === fijo)) candidatos.push({ base: fijo, via: "tunel" });
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
