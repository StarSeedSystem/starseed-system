import { NextResponse } from "next/server";
import { desdeReleases, type VersionPublicada } from "@/lib/version/versiones-publicadas";
import { NATIVE_TAG, OS_VERSION, OS_FECHA, OS_NOTAS } from "@/lib/version/os-release";

const GH_URL = "https://api.github.com/repos/StarSeedSystem/starseed-system/releases?per_page=20";
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_ERROR_TTL_MS = 60 * 1000;

let cache: { data: VersionPublicada[]; ts: number } | null = null;
let lastGood: VersionPublicada[] | null = null;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function fetchFromGitHub(): Promise<VersionPublicada[]> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "StarSeed-OS",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(GH_URL, { headers, cache: "no-store" });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const json = await res.json();
  return desdeReleases(json);
}

function fallbackVersion(): VersionPublicada[] {
  return [
    {
      version: NATIVE_TAG,
      fecha: OS_FECHA,
      notas: OS_NOTAS,
      url: `https://github.com/StarSeedSystem/starseed-system/releases/tag/${NATIVE_TAG}`,
      archivos: { os: {}, nexus: {}, cafe: {} },
    },
  ];
}

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json({ versiones: cache.data });
  }
  try {
    const data = await fetchFromGitHub();
    cache = { data, ts: now };
    lastGood = data;
    return NextResponse.json({ versiones: data });
  } catch (e) {
    if (cache && now - cache.ts < CACHE_ERROR_TTL_MS) {
      return NextResponse.json({ versiones: cache.data, aviso: "usando caché por error de GitHub" });
    }
    if (lastGood && lastGood.length) {
      return NextResponse.json({ versiones: lastGood, aviso: "usando última respuesta válida" });
    }
    const fallback = fallbackVersion();
    return NextResponse.json({ versiones: fallback, aviso: "GitHub no disponible, usando versión local" });
  }
}
