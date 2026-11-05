export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { desdeReleases, VersionPublicada } from "@/lib/version/versiones-publicadas";
import { NATIVE_VERSION, NATIVE_TAG, OS_VERSION, OS_FECHA, OS_NOTAS, nativeInstallerAssets, SistemaNativo } from "@/lib/version/os-release";

const GITHUB_URL = "https://api.github.com/repos/StarSeedSystem/starseed-system/releases?per_page=20";
const CACHE_OK_MS = 10 * 60 * 1000;
const CACHE_ERR_MS = 1 * 60 * 1000;

type CacheEntry = {
  data: VersionPublicada[];
  ts: number;
  aviso?: string;
};

let cache: CacheEntry | null = null;
let lastErrorTs = 0;

function fallbackVersion(): VersionPublicada[] {
  const archivosVacio = { macos: [], windows: [], linux: [], android: [], ios: [] };
  const archivos: Record<SistemaNativo, typeof archivosVacio> = {
    os: archivosVacio,
    nexus: archivosVacio,
    cafe: archivosVacio,
  };
  return [{
    version: NATIVE_VERSION,
    fecha: OS_FECHA,
    notas: OS_NOTAS + " — aviso: datos de versión desde caché local",
    url: "",
    archivos,
  }];
}

export async function GET() {
  const now = Date.now();

  if (cache && now - cache.ts < CACHE_OK_MS) {
    return Response.json({ versiones: cache.data, aviso: cache.aviso });
  }

  const headers: Record<string, string> = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "StarSeed-OS",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(GITHUB_URL, { headers, cache: "no-store" });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const json = await res.json();
    const versiones = desdeReleases(json);
    cache = { data: versiones, ts: now };
    lastErrorTs = 0;
    return Response.json({ versiones });
  } catch {
    if (cache && now - lastErrorTs < CACHE_ERR_MS) {
      return Response.json({ versiones: cache.data, aviso: "usando caché tras error de GitHub" });
    }
    if (cache) {
      return Response.json({ versiones: cache.data, aviso: "GitHub no responde, última versión conocida" });
    }
    const versiones = fallbackVersion();
    cache = { data: versiones, ts: now, aviso: "GitHub no responde, versión local desde os-release" };
    lastErrorTs = now;
    return Response.json({ versiones: cache.data, aviso: cache.aviso });
  }
}
