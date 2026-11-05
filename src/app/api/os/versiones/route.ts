import type { ReleaseGithub } from "@/lib/version/versiones-publicadas";
import { desdeReleases } from "@/lib/version/versiones-publicadas";

const REPO = "StarSeedSystem/starseed-system";
const URL_RELEASES = `https://api.github.com/repos/${REPO}/releases?per_page=20`;

const CACHE_MS = 10 * 60 * 1000;
const CACHE_FALLBACK_MS = 60 * 1000 * 1000;

let cache: { datos: ReleaseGithub[] | null; generado: number } = { datos: null, generado: 0 };
let errorAnterior: { datos: ReleaseGithub[] | null; generado: number } | null = null;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    }

    const json = (await resp.json()) as unknown;
    if (!Array.isArray(json)) {
      if (errorAnterior) return errorAnterior.datos ?? [];
      return [];
    }

    const releases = json as ReleaseGithub[];
    cache = { datos: releases, generado: ahora };
    errorAnterior = null;
    return releases;
  } catch {
    if (errorAnterior && ahora - errorAnterior.generado < CACHE_FALLBACK_MS) {
      return errorAnterior.datos ?? [];
    }
    return [];
  }
}

export async function GET(): Promise<Response> {
  const fetchFn = process.env.GITHUB_TOKEN
    ? (url: string) =>
        fetch(url, {
          headers: { Accept: "application/vnd.github+json", Authorization: `token ${process.env.GITHUB_TOKEN}` },
        })
    : undefined;

  const releases = await obtenerReleases();
  const versiones = desdeReleases(releases);

  const respuesta = {
    versiones,
    generadoEn: new Date().toISOString(),
  };

  return new Response(JSON.stringify(respuesta, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${Math.floor(CACHE_MS / 1000)}`,
    },
  });
}