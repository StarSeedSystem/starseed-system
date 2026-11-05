/**
 * ════════════════════════════════════════════════════════════════════════════
 * Lógica PURA para actualizaciones nativas en Android (Tauri móvil).
 *
 * Cubre la mitad de ActualizacionNativa que corresponde a Android:
 *   · Comparar la versión instalada contra el último Release de GitHub
 *   · Elegir el asset .apk correcto (StarSeed-os-*.apk)
 *   · Determinar si hay versión nueva instalable
 * ════════════════════════════════════════════════════════════════════════════
 */

import { esVersionMasNueva } from "@/lib/version/os-release";

/** Asset mínimo de un Release de GitHub para Android. */
export interface GithubReleaseAssetMin {
  name: string;
  browser_download_url: string;
}

/** Release mínimo de GitHub con assets. */
export interface GithubReleaseMin {
  tag_name: string;
  assets: GithubReleaseAssetMin[];
}

/** Resultado de la decisión de si hay versión nueva para Android. */
export interface DecisionAndroid {
  /** `true` si hay una versión nueva instalable. */
  hayNuevaVersion: boolean;
  /** URL directa al .apk si hay versión nueva, `null` si no. */
  href: string | null;
  /** Nombre del archivo .apk si hay versión nueva, `null` si no. */
  nombre: string | null;
  /** Versión del .apk disponible, `null` si no hay. */
  version: string | null;
}

/** Elige, de un Release de GitHub, el .apk del sistema OS (`StarSeed-os-*.apk`). */
export function elegirApkAndroid(release: GithubReleaseMin | null | undefined): { version: string; href: string; nombre: string } | null {
  if (!release || !Array.isArray(release.assets)) return null;
  const apk = release.assets.find(
    (a) => a && typeof a.name === "string" && /^StarSeed-os-.*\.apk$/i.test(a.name) && typeof a.browser_download_url === "string",
  );
  if (!apk) return null;
  const version = typeof release.tag_name === "string" ? release.tag_name.replace(/^v/i, "") : "";
  if (!version) return null;
  return { version, href: apk.browser_download_url, nombre: apk.name };
}

/**
 * Determina si hay una versión nueva instalable en este Android.
 * Compara la versión instalada contra el último Release.
 * Retorna `true` solo cuando la versión del release es estrictamente mayor.
 */
export function hayNuevaVersionAndroid(
  instalada: string | null | undefined,
  release: GithubReleaseMin | null | undefined,
): boolean {
  if (!instalada) return false;
  const apk = elegirApkAndroid(release);
  if (!apk) return false;
  return esVersionMasNueva(apk.version, instalada);
}

/**
 * Toma la versión instalada y el release de GitHub y decide si hay versión nueva.
 * Retorna un objeto con la decisión completa (útil para el panel de actualizaciones).
 */
export function decidirActualizacionAndroid(
  instalada: string | null | undefined,
  release: GithubReleaseMin | null | undefined,
): DecisionAndroid {
  if (!instalada || !release) {
    return { hayNuevaVersion: false, href: null, nombre: null, version: null };
  }
  const apk = elegirApkAndroid(release);
  if (!apk) {
    return { hayNuevaVersion: false, href: null, nombre: null, version: null };
  }
  const nueva = esVersionMasNueva(apk.version, instalada);
  return {
    hayNuevaVersion: nueva,
    href: nueva ? apk.href : null,
    nombre: nueva ? apk.nombre : null,
    version: nueva ? apk.version : null,
  };
}

