/**
 * Qué versión de cada capa tiene ESTE medio, medida (no supuesta).
 * ═══════════════════════════════════════════════════════════════════
 *   · interfaz → la versión del OS con la que se compiló esta página (`OS_VERSION`);
 *   · sw       → la caché del service worker activo (`starseed-precache-<versión>`);
 *   · nativa   → `window.__TAURI__.app.getVersion()` en la app nativa;
 *   · servidor → `servidor_local_estado` (web_corre / capa / version_paquete) en la app nativa;
 *   · datos, servicios y modelos → hoy no hay una versión única medible desde el navegador:
 *     se dejan SIN DATO en vez de inventar una (el panel lo dice así).
 *
 * SSR-safe (nada de `window` al importarse) y sin `node:*`. Nunca lanza.
 */

import { OS_VERSION } from "@/lib/version/os-release";
import type { VersionesPorCapa } from "./capas";
import { sanearVersionesCapa } from "./versiones-capa";

const PRECACHE = /^starseed-precache-(.+)$/;
const COMANDO_ESTADO_SERVIDOR = "servidor_local_estado";

/** Versión del SW a partir de los nombres de caché (la más reciente si hubiera varias). Pura. */
export function versionSwDeCaches(nombres: readonly string[]): string | null {
  const vs = nombres.map((n) => PRECACHE.exec(n)?.[1]).filter((v): v is string => !!v);
  if (!vs.length) return null;
  return vs.sort().at(-1) ?? null;
}

interface TauriApp {
  app?: { getVersion?: () => Promise<string> };
  core?: { invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
}

interface EstadoServidorLocalRaw {
  web_corre?: string | null;
  capa?: string | null;
  version_paquete?: string | null;
}

let cache: { t: number; v: VersionesPorCapa } | null = null;
const VIDA_MS = 60_000;

/** Versiones medidas en este medio (cacheadas 1 min: la presencia pregunta a menudo). */
export async function versionesDeEsteMedio(): Promise<VersionesPorCapa & { servidor?: { capaBuild: string; capa?: string; versionPaquete?: string } }> {
  if (cache && Date.now() - cache.t < VIDA_MS) return cache.v;
  const v: Record<string, string> = { interfaz: OS_VERSION };
  let servidor: { capaBuild: string; capa?: string; versionPaquete?: string } | undefined;
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
  try {
    const t = typeof window !== "undefined" ? (window as unknown as { __TAURI__?: TauriApp }).__TAURI__ : undefined;
    const invoke = t?.core?.invoke;
    if (invoke) {
      const raw = (await invoke(COMANDO_ESTADO_SERVIDOR)) as EstadoServidorLocalRaw | null;
      if (raw && typeof raw === "object") {
        if (raw.web_corre) {
          servidor = { capaBuild: raw.web_corre };
          if (raw.capa) servidor.capa = raw.capa;
          if (raw.version_paquete) servidor.versionPaquete = raw.version_paquete;
        }
      }
    }
  } catch {
    /* no es la app nativa o fallo en el comando */
  }
  const saneadas = sanearVersionesCapa(v);
  if (servidor) (saneadas as Record<string, unknown>).servidor = servidor;
  cache = { t: Date.now(), v: saneadas };
  return saneadas;
}

/** Olvida la medición (tras aplicar algo). */
export function olvidarVersionesMedidas(): void {
  cache = null;
}
