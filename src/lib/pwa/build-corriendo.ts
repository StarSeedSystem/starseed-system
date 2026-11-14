/**
 * ACT1113F · qué build de la web corre ESTE aparato (no la que dice el servidor ahora).
 * `next.config.ts` mete el id y el sha de `public/version.json` (que escribe `scripts/gen-version.mjs`
 * justo antes de compilar) en el código del cliente: `NEXT_PUBLIC_BUILD_ID` y `NEXT_PUBLIC_BUILD_SHA`.
 * Así la página sabe con qué código arrancó aunque `/version.json` ya diga otra cosa.
 * Puro, sin red. Nunca lanza.
 */

export interface BuildCorriendo {
  /** Id único de la build («mwfli3jt-ctfbyg»); null si este código no lo trae (desarrollo). */
  build: string | null;
  /** Sha corto (10 caracteres) o null. */
  sha: string | null;
}

const ID = /^[\w-]{3,64}$/;

/** Sanea lo que llega de `process.env` o de `/version.json`. Pura. */
export function leerBuild(build: unknown, sha: unknown): BuildCorriendo {
  const b = typeof build === "string" && ID.test(build.trim()) ? build.trim() : null;
  const s = typeof sha === "string" && /^[0-9a-f]{7,40}$/i.test(sha.trim()) ? sha.trim().slice(0, 10).toLowerCase() : null;
  return { build: b, sha: s };
}

/** La build con la que arrancó este código. */
export function buildCorriendo(): BuildCorriendo {
  return leerBuild(process.env.NEXT_PUBLIC_BUILD_ID, process.env.NEXT_PUBLIC_BUILD_SHA);
}

/** «mwfli3jt-ctfbyg/fbbcb6794a»; «desconocida» si el código no trae su id. Pura. */
export function etiquetaBuild(b: BuildCorriendo = buildCorriendo()): string {
  if (!b.build) return "desconocida";
  return b.sha ? `${b.build}/${b.sha}` : b.build;
}
