<<<<<<< HEAD
import { OS_VERSION, OS_FECHA, OS_NOTAS } from "@/lib/version/os-release";
import { desdeReleases, desdeReleasesFallback, type ReleaseGithub } from "@/lib/version/versiones-publicadas";
=======
import type { ReleaseGithub } from "@/lib/version/versiones-publicadas";
import { desdeReleases } from "@/lib/version/versiones-publicadas";
>>>>>>> 6898f8294 (salvavidas · VER1105F: trabajo del agente antes de las puertas (tsc / vitest))

const REPO = "StarSeedSystem/starseed-system";
const URL_RELEASES = `https://api.github.com/repos/${REPO}/releases?per_page=20`;

const CACHE_MS = 10 * 60 * 1000;
<<<<<<< HEAD
const CACHE_FALLBACK_MS = 60 * 60 * 1000;

let cache: { datos: ReleaseGithub[] | null; generado: number } = { datos: null, generado: 0 };
let cacheFallido: { datos: ReleaseGithub[] | null; generado: number } | null = null;
=======
const CACHE_FALLBACK_MS = 60 * 1000 * 1000;

let cache: { datos: ReleaseGithub[] | null; generado: number } = { datos: null, generado: 0 };
let errorAnterior: { datos: ReleaseGithub[] | null; generado: number } | null = null;
>>>>>>> 6898f8294 (salvavidas · VER1105F: trabajo del agente antes de las puertas (tsc / vitest))

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

<<<<<<< HEAD
async function obtenerReleases(): Promise<{ releases: ReleaseGithub[]; githubFallido: boolean }> {
  const ahora = Date.now();
  if (cache.datos && ahora - cache.generado < CACHE_MS) {
    return { releases: cache.datos, githubFallido: false };
  }

  try {
    const headers: HeadersInit = { Accept: "application/vnd.github+json" };
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `token ${process.env.GITHUB_TOKEN}`;
    }

    const resp = await fetch(URL_RELEASES, { headers });

    if (!resp.ok) {
      if (cacheFallido && ahora - cacheFallido.generado < CACHE_FALLBACK_MS && cacheFallido.datos) {
        return { releases: cacheFallido.datos, githubFallido: true };
      }
      return { releases: [], githubFallido: true };
=======
async function obtenerReleases(): Promise<ReleaseGithub[]> {
  const ahora = Date.now();
  if (cache.datos && ahora - cache.generado < CACHE_MS) {
    return cache.datos;
  }

  try {
    const resp = await fetch(URL_RELEASES, {
      headers: { Accept: "application/vnd.github+json" },
    });

    if (!resp.ok) {
      if (errorAnterior && ahora - errorAnterior.generado < CACHE_FALLBACK_MS) {
        return errorAnterior.datos ?? [];
      }
      return [];
>>>>>>> 6898f8294 (salvavidas · VER1105F: trabajo del agente antes de las puertas (tsc / vitest))
    }

    const json = (await resp.json()) as unknown;
    if (!Array.isArray(json)) {
<<<<<<< HEAD
      if (cacheFallido && cacheFallido.datos) {
        return { releases: cacheFallido.datos, githubFallido: true };
      }
      return { releases: [], githubFallido: true };
=======
      if (errorAnterior) return errorAnterior.datos ?? [];
      return [];
>>>>>>> 6898f8294 (salvavidas · VER1105F: trabajo del agente antes de las puertas (tsc / vitest))
    }

    const releases = json as ReleaseGithub[];
    cache = { datos: releases, generado: ahora };
<<<<<<< HEAD
    cacheFallido = null;
    return { releases, githubFallido: false };
  } catch {
    if (cacheFallido && cacheFallido.datos && ahora - cacheFallido.generado < CACHE_FALLBACK_MS) {
      return { releases: cacheFallido.datos, githubFallido: true };
    }
    return { releases: [], githubFallido: true };
=======
    errorAnterior = null;
    return releases;
  } catch {
    if (errorAnterior && ahora - errorAnterior.generado < CACHE_FALLBACK_MS) {
      return errorAnterior.datos ?? [];
    }
    return [];
>>>>>>> 6898f8294 (salvavidas · VER1105F: trabajo del agente antes de las puertas (tsc / vitest))
  }
}

export async function GET(): Promise<Response> {
<<<<<<< HEAD
  const { releases, githubFallido } = await obtenerReleases();

  let versiones = desdeReleases(releases);
  let aviso: string | undefined;

  if (githubFallido || versiones.length === 0) {
    cacheFallido = { datos: releases, generado: Date.now() };
    versiones = [desdeReleasesFallback(OS_VERSION, OS_FECHA, `${OS_NOTAS} (aviso: datos de fallback)`)];
    aviso = "GitHub no disponible: se usó el fallback con la versión actual";
  }
=======
  const fetchFn = process.env.GITHUB_TOKEN
    ? (url: string) =>
        fetch(url, {
          headers: { Accept: "application/vnd.github+json", Authorization: `token ${process.env.GITHUB_TOKEN}` },
        })
    : undefined;

  const releases = await obtenerReleases();
  const versiones = desdeReleases(releases);
>>>>>>> 6898f8294 (salvavidas · VER1105F: trabajo del agente antes de las puertas (tsc / vitest))

  const respuesta = {
    versiones,
    generadoEn: new Date().toISOString(),
<<<<<<< HEAD
    ...(aviso && { aviso }),
=======
>>>>>>> 6898f8294 (salvavidas · VER1105F: trabajo del agente antes de las puertas (tsc / vitest))
  };

  return new Response(JSON.stringify(respuesta, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${Math.floor(CACHE_MS / 1000)}`,
    },
  });
}