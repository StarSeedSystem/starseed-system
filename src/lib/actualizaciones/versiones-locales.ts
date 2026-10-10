/**
 * Qué versión de cada capa tiene ESTE medio, medida (no supuesta).
 * ═══════════════════════════════════════════════════════════════════
 *   · interfaz → la versión del OS con la que se compiló esta página (`OS_VERSION`);
 *   · sw       → la caché del service worker activo (`starseed-precache-<versión>`);
 *   · nativa   → `window.__TAURI__.app.getVersion()` en la app nativa;
 *   · datos, servicios y modelos → hoy no hay una versión única medible desde el navegador:
 *     se dejan SIN DATO en vez de inventar una (el panel lo dice así).
 *
 * SSR-safe (nada de `window` al importarse) y sin `node:*`. Nunca lanza.
 */

import { OS_VERSION } from "@/lib/version/os-release";
import type { VersionesPorCapa } from "./capas";
import { sanearVersionesCapa } from "./versiones-capa";

const PRECACHE = /^starseed-precache-(.+)$/;

/** Versión del SW a partir de los nombres de caché (la más reciente si hubiera varias). Pura. */
export function versionSwDeCaches(nombres: readonly string[]): string | null {
  const vs = nombres.map((n) => PRECACHE.exec(n)?.[1]).filter((v): v is string => !!v);
  if (!vs.length) return null;
  return vs.sort().at(-1) ?? null;
}

interface TauriApp {
  app?: { getVersion?: () => Promise<string> };
}

let cache: { t: number; v: VersionesPorCapa } | null = null;
const VIDA_MS = 60_000;

/** Versiones medidas en este medio (cacheadas 1 min: la presencia pregunta a menudo). */
export async function versionesDeEsteMedio(): Promise<VersionesPorCapa> {
  if (cache && Date.now() - cache.t < VIDA_MS) return cache.v;
  const v: Record<string, string> = { interfaz: OS_VERSION };
  try {
    if (typeof caches !== "undefined" && typeof caches.keys === "function") {
      const sw = versionSwDeCaches(await caches.keys());
      if (sw) v.sw = sw;
    }
  } catch {
    /* sin Cache API */
  }
  try {
    const t = typeof window !== "undefined" ? (window as unknown as { __TAURI__?: TauriApp }).__TAURI__ : undefined;
    const nativa = t?.app?.getVersion ? await t.app.getVersion().catch(() => null) : null;
    if (nativa) v.nativa = nativa;
  } catch {
    /* no es la app nativa */
  }
  const saneadas = sanearVersionesCapa(v);
  cache = { t: Date.now(), v: saneadas };
  return saneadas;
}

/** Olvida la medición (tras aplicar algo). */
export function olvidarVersionesMedidas(): void {
  cache = null;
}
