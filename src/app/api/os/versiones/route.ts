import { OS_VERSION, OS_FECHA, OS_NOTAS } from "@/lib/version/os-release";
import { desdeReleases, desdeReleasesFallback, type ReleaseGithub } from "@/lib/version/versiones-publicadas";
import {
  sanearCanalPruebas,
  URL_MANIFIESTO_PRUEBAS,
  URL_MANIFIESTO_PRUEBAS_ANDROID,
  type CanalPruebas,
} from "@/lib/actualizaciones/canal-pruebas";

const REPO = "StarSeedSystem/starseed-system";
const URL_RELEASES = `https://api.github.com/repos/${REPO}/releases?per_page=20`;

const CACHE_MS = 10 * 60 * 1000;
const CACHE_FALLBACK_MS = 60 * 1000;

interface CacheReleases {
  datos: ReleaseGithub[];
  generado: number;
  githubFallido: boolean;
}

let cache: CacheReleases | null = null;
let ultimaBuena: ReleaseGithub[] | null = null;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function obtenerReleases(): Promise<{ releases: ReleaseGithub[]; githubFallido: boolean }> {
  const ahora = Date.now();
  if (cache) {
    const duracion = cache.githubFallido ? CACHE_FALLBACK_MS : CACHE_MS;
    if (ahora - cache.generado < duracion) {
      return { releases: cache.datos, githubFallido: cache.githubFallido };
    }
  }

  try {
    const headers: HeadersInit = { Accept: "application/vnd.github+json" };
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `token ${process.env.GITHUB_TOKEN}`;
    }

    const resp = await fetch(URL_RELEASES, { headers });

    if (!resp.ok) {
      return guardarFallo(ahora);
    }

    const json = (await resp.json()) as unknown;
    if (!Array.isArray(json)) {
      return guardarFallo(ahora);
    }

    const releases = json as ReleaseGithub[];
    cache = { datos: releases, generado: ahora, githubFallido: false };
    ultimaBuena = releases;
    return { releases, githubFallido: false };
  } catch {
    return guardarFallo(ahora);
  }
}

function guardarFallo(ahora: number): { releases: ReleaseGithub[]; githubFallido: true } {
  const releases = ultimaBuena ?? [];
  cache = { datos: releases, generado: ahora, githubFallido: true };
  return { releases, githubFallido: true };
}

// (ACT1108A) Canal de pruebas de las apps nativas: los dos manifiestos de la prerelease fija
// `canal-pruebas` (sus enlaces de descarga, no la API: no gastan cuota). Solo lo usan las apps cuya
// versión lleva «-prueba.»; la lista `versiones` (oficial) no cambia. Contrato centro-versiones §9.
let cachePruebas: { datos: CanalPruebas | null; generado: number; ok: boolean } | null = null;

async function leerJsonPublico(url: string): Promise<unknown> {
  try {
    const r = await fetch(url, { headers: { Accept: "application/json, application/octet-stream" } });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

async function obtenerCanalPruebas(): Promise<CanalPruebas | null> {
  const ahora = Date.now();
  if (cachePruebas && ahora - cachePruebas.generado < (cachePruebas.ok ? CACHE_MS : CACHE_FALLBACK_MS)) return cachePruebas.datos;
  const [escritorio, android] = await Promise.all([leerJsonPublico(URL_MANIFIESTO_PRUEBAS), leerJsonPublico(URL_MANIFIESTO_PRUEBAS_ANDROID)]);
  const datos = sanearCanalPruebas(escritorio, android);
  cachePruebas = { datos, generado: ahora, ok: datos !== null };
  return datos;
}

export async function GET(): Promise<Response> {
  const [{ releases, githubFallido }, canalPruebas] = await Promise.all([obtenerReleases(), obtenerCanalPruebas()]);

  let versiones = desdeReleases(releases);
  let aviso: string | undefined;

  if (versiones.length === 0) {
    versiones = [desdeReleasesFallback(OS_VERSION, OS_FECHA, `${OS_NOTAS} (aviso: datos de fallback)`)];
    aviso = githubFallido
      ? "GitHub no disponible: se usó el fallback con la versión actual"
      : "No hay versiones publicadas: se usó el fallback con la versión actual";
  } else if (githubFallido) {
    aviso = "GitHub no disponible: se usó la última versión publicada conocida";
  }

  const respuesta = {
    versiones,
    generadoEn: new Date().toISOString(),
    canalPruebas,
    ...(aviso && { aviso }),
  };

  return new Response(JSON.stringify(respuesta, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${Math.floor((githubFallido ? CACHE_FALLBACK_MS : CACHE_MS) / 1000)}`,
    },
  });
}
