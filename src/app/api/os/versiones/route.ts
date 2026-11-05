import { OS_VERSION, OS_FECHA, OS_NOTAS } from "@/lib/version/os-release";
import { desdeReleases, desdeReleasesFallback, type ReleaseGithub } from "@/lib/version/versiones-publicadas";

const REPO = "StarSeedSystem/starseed-system";
const URL_RELEASES = `https://api.github.com/repos/${REPO}/releases?per_page=20`;

const CACHE_MS = 10 * 60 * 1000;
const CACHE_FALLBACK_MS = 60 * 60 * 1000;

let cache: { datos: ReleaseGithub[] | null; generado: number } = { datos: null, generado: 0 };
let cacheFallido: { datos: ReleaseGithub[] | null; generado: number } | null = null;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    }

    const json = (await resp.json()) as unknown;
    if (!Array.isArray(json)) {
      if (cacheFallido && cacheFallido.datos) {
        return { releases: cacheFallido.datos, githubFallido: true };
      }
      return { releases: [], githubFallido: true };
    }

    const releases = json as ReleaseGithub[];
    cache = { datos: releases, generado: ahora };
    cacheFallido = null;
    return { releases, githubFallido: false };
  } catch {
    if (cacheFallido && cacheFallido.datos && ahora - cacheFallido.generado < CACHE_FALLBACK_MS) {
      return { releases: cacheFallido.datos, githubFallido: true };
    }
    return { releases: [], githubFallido: true };
  }
}

export async function GET(): Promise<Response> {
  const { releases, githubFallido } = await obtenerReleases();

  let versiones = desdeReleases(releases);
  let aviso: string | undefined;

  if (githubFallido || versiones.length === 0) {
    cacheFallido = { datos: releases, generado: Date.now() };
    versiones = [desdeReleasesFallback(OS_VERSION, OS_FECHA, `${OS_NOTAS} (aviso: datos de fallback)`)];
    aviso = "GitHub no disponible: se usó el fallback con la versión actual";
  }

  const respuesta = {
    versiones,
    generadoEn: new Date().toISOString(),
    ...(aviso && { aviso }),
  };

  return new Response(JSON.stringify(respuesta, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${Math.floor(CACHE_MS / 1000)}`,
    },
  });
}