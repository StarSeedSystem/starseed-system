import { NextRequest, NextResponse } from "next/server";

// ════════════════════════════════════════════════════════════════
// Proxy de metadatos de repositorios GitHub — lado servidor (Adenda 65, §17)
// ----------------------------------------------------------------
// GET-only, propósito único: "conectar" un repo de GitHub por URL en la
// Biblioteca (lectura pública, sin token). Combina en UNA respuesta lo que
// la ficha necesita: info del repo + README (decodificado de base64 en el
// servidor) + releases recientes. Evita CORS del navegador y centraliza el
// timeout/allowlist/caché en un único punto, mismo patrón que
// `api/huggingbay/[...path]/route.ts`.
//
// Uso: GET /api/github-repo/<owner>/<repo>
//
// SEGURIDAD:
//   · Host de destino FIJO (api.github.com) — sin parámetro de host
//     controlado por el cliente, sin superficie de SSRF.
//   · `owner`/`repo` validados con regex estricta antes de construir la URL.
//   · Sin token: nunca se acepta ni se reenvía ninguna credencial. Esto
//     implica el límite público de GitHub (60 peticiones/hora por IP) — el
//     mensaje de error lo explica si se agota.
//   · Timeout duro con AbortController. Caché corta en el edge (Vercel).
// ════════════════════════════════════════════════════════════════

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GITHUB_API = "https://api.github.com";
const TIMEOUT_MS = 10_000;
const CACHE_CONTROL = "public, s-maxage=120, stale-while-revalidate=300";
/** Nombres de usuario/repo de GitHub: alfanuméricos + ._- (sin barras). */
const NAME_RE = /^[A-Za-z0-9._-]{1,100}$/;

function jsonError(error: string, status = 200) {
  // status 200 a nivel HTTP: el cliente lee `ok:false`; el detalle real del
  // fallo viaja en el cuerpo (mismo patrón que el resto de proxies del repo).
  return NextResponse.json({ ok: false, error }, { status });
}

async function fetchJson(path: string, signal: AbortSignal): Promise<{ ok: boolean; status: number; data: unknown }> {
  try {
    const res = await fetch(`${GITHUB_API}${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "StarSeed-OS (+https://starseed-os.vercel.app)",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal,
      cache: "no-store",
    });
    const raw = await res.text();
    let data: unknown = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = raw;
    }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ owner: string; repo: string }> }) {
  const { owner, repo } = await ctx.params;

  if (!owner || !repo || !NAME_RE.test(owner) || !NAME_RE.test(repo)) {
    return jsonError("Owner/repo inválido (usa el formato github.com/owner/repo).", 400);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const [repoRes, readmeRes, releasesRes] = await Promise.all([
      fetchJson(`/repos/${owner}/${repo}`, controller.signal),
      fetchJson(`/repos/${owner}/${repo}/readme`, controller.signal),
      fetchJson(`/repos/${owner}/${repo}/releases?per_page=10`, controller.signal),
    ]);

    if (!repoRes.ok) {
      const status = repoRes.status;
      const msg =
        status === 404
          ? "Repositorio no encontrado (¿URL correcta y público?)."
          : status === 403
            ? "Límite de la API pública de GitHub agotado (60 peticiones/hora sin autenticar). Espera unos minutos e inténtalo de nuevo."
            : `GitHub respondió ${status || "error de red"}.`;
      return jsonError(msg);
    }

    const repoData = (repoRes.data ?? {}) as Record<string, unknown>;
    const ownerData = (repoData.owner ?? {}) as Record<string, unknown>;
    const licenseData = repoData.license as Record<string, unknown> | null | undefined;

    let readme: string | null = null;
    if (readmeRes.ok && readmeRes.data && typeof readmeRes.data === "object") {
      const rd = readmeRes.data as { content?: string; encoding?: string };
      if (rd.content && rd.encoding === "base64") {
        try {
          readme = Buffer.from(rd.content, "base64").toString("utf-8");
        } catch {
          readme = null;
        }
      }
    }

    const releases = releasesRes.ok && Array.isArray(releasesRes.data)
      ? (releasesRes.data as Record<string, unknown>[]).slice(0, 10).map((r) => ({
          tag: String(r.tag_name ?? ""),
          name: r.name ? String(r.name) : undefined,
          body: r.body ? String(r.body) : undefined,
          publishedAt: r.published_at ? String(r.published_at) : undefined,
          htmlUrl: r.html_url ? String(r.html_url) : undefined,
        }))
      : [];

    const licenseLabel =
      licenseData?.spdx_id && licenseData.spdx_id !== "NOASSERTION"
        ? String(licenseData.spdx_id)
        : licenseData?.name
          ? String(licenseData.name)
          : undefined;

    const data = {
      name: String(repoData.name ?? repo),
      fullName: String(repoData.full_name ?? `${owner}/${repo}`),
      description: repoData.description ? String(repoData.description) : undefined,
      htmlUrl: String(repoData.html_url ?? `https://github.com/${owner}/${repo}`),
      homepage: repoData.homepage ? String(repoData.homepage) : undefined,
      stars: Number(repoData.stargazers_count ?? 0),
      forks: Number(repoData.forks_count ?? 0),
      language: repoData.language ? String(repoData.language) : undefined,
      license: licenseLabel,
      topics: Array.isArray(repoData.topics) ? (repoData.topics as unknown[]).map((t) => String(t)) : [],
      defaultBranch: String(repoData.default_branch ?? "main"),
      ownerLogin: String(ownerData.login ?? owner),
      ownerAvatar: ownerData.avatar_url ? String(ownerData.avatar_url) : undefined,
      readme,
      releases,
    };

    return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": CACHE_CONTROL } });
  } catch (err: unknown) {
    const aborted = (err as Error)?.name === "AbortError";
    return jsonError(
      aborted
        ? `GitHub tardó demasiado en responder (${TIMEOUT_MS / 1000}s).`
        : `No se pudo contactar GitHub: ${(err as Error)?.message || "error de red"}.`,
    );
  } finally {
    clearTimeout(timer);
  }
}
