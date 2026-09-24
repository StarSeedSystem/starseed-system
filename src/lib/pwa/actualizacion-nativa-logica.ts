/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Lógica PURA del listener de actualización nativa (src/components/pwa/
 * actualizacion-nativa.tsx). Módulo SSR-safe: nada de `window`/`navigator`/
 * `fetch`/`localStorage` aquí — el componente hace ese trabajo "sucio" y le
 * pasa datos ya obtenidos a estas funciones, así todo esto se prueba con
 * Vitest sin mockear el DOM ni la red.
 *
 * Cubre las DOS mitades del aviso de actualización nativa:
 *   · Escritorio: interpretar el payload del evento `starseed://actualizacion`
 *     que emite el Rust de native/src-tauri/src/lib.rs (fase, versión,
 *     progreso) y componer el texto/porcentaje a mostrar.
 *   · Android (Tauri móvil): decidir si el .apk instalado está desactualizado
 *     frente al último Release de GitHub, y elegir el asset .apk correcto —
 *     reutilizando el comparador de semver de os-release.ts (una sola fuente
 *     de verdad para "qué versión es más nueva").
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { esVersionMasNueva } from "@/lib/version/os-release";

/* ─────────────────────── Escritorio: evento de progreso ─────────────────────── */

export type FaseActualizacion =
  | "buscando"
  | "descargando"
  | "instalando"
  | "lista"
  | "error"
  | "al-dia"
  | "";

/** Forma del payload que emite Rust en `starseed://actualizacion` (ver lib.rs). */
export interface EstadoActualizacionNativa {
  fase: FaseActualizacion;
  version?: string | null;
  descargado?: number | null;
  total?: number | null;
  mensaje?: string | null;
}

const FASES_VALIDAS: readonly FaseActualizacion[] = [
  "buscando",
  "descargando",
  "instalando",
  "lista",
  "error",
  "al-dia",
];

/**
 * Normaliza (y valida honestamente) lo que llegó por el evento de Tauri: el
 * payload cruza el puente IPC como JSON arbitrario, así que nunca asumimos su
 * forma. Devuelve `null` si no es reconocible (el componente entonces no
 * actualiza su estado, en vez de mostrar algo inventado).
 */
export function normalizarEstadoActualizacion(raw: unknown): EstadoActualizacionNativa | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const fase = typeof r.fase === "string" && (FASES_VALIDAS as string[]).includes(r.fase) ? (r.fase as FaseActualizacion) : "";
  if (!fase) return null;
  return {
    fase,
    version: typeof r.version === "string" ? r.version : null,
    descargado: typeof r.descargado === "number" ? r.descargado : null,
    total: typeof r.total === "number" ? r.total : null,
    mensaje: typeof r.mensaje === "string" ? r.mensaje : null,
  };
}

/** Porcentaje 0-100 de la descarga, o `null` si no hay datos suficientes. */
export function porcentajeDescarga(estado: EstadoActualizacionNativa): number | null {
  const { descargado, total } = estado;
  if (typeof descargado !== "number" || typeof total !== "number" || total <= 0) return null;
  const pct = Math.round((descargado / total) * 100);
  return Math.max(0, Math.min(100, pct));
}

/** Texto en español para el toast, listo para pintar. "" = no mostrar nada. */
export function textoEstadoActualizacion(estado: EstadoActualizacionNativa): string {
  const version = estado.version ? ` ${estado.version}` : "";
  switch (estado.fase) {
    case "buscando":
      return "Buscando actualizaciones…";
    case "descargando": {
      const pct = porcentajeDescarga(estado);
      return `Descargando StarSeed OS${version}…${pct !== null ? ` ${pct}%` : ""}`;
    }
    case "instalando":
      return `Instalando StarSeed OS${version}…`;
    case "lista":
      return `Lista: reinicia para aplicar la actualización${version}.`;
    case "error":
      return estado.mensaje && estado.mensaje.trim() ? estado.mensaje : "No se pudo comprobar actualizaciones.";
    case "al-dia":
    default:
      return "";
  }
}

/** ¿Este estado merece un toast visible? ("al-dia" y "" son silenciosos). */
export function debeMostrarToast(estado: EstadoActualizacionNativa): boolean {
  return estado.fase !== "" && estado.fase !== "al-dia";
}

/* ─────────────────────── Android: comparación con GitHub Releases ─────────────────────── */

export interface GithubReleaseAssetMin {
  name: string;
  browser_download_url: string;
}

export interface GithubReleaseMin {
  tag_name: string;
  assets: GithubReleaseAssetMin[];
}

export interface ApkElegido {
  /** Versión limpia (sin "v"), tal como la lleva el tag del Release. */
  version: string;
  href: string;
  nombre: string;
}

/** Elige, de un Release de GitHub, el .apk del sistema OS (`StarSeed-os-*.apk`). */
export function elegirApkAndroid(release: GithubReleaseMin | null | undefined): ApkElegido | null {
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
 * ¿Hay una versión más nueva instalable en este Android? Compara la versión
 * instalada (de `window.__TAURI__.app.getVersion()`) contra el .apk del
 * último Release. `null`/`""` de instalada → false (honesto: sin versión
 * instalada conocida, no afirmamos nada).
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

/* ─────────────────────── Detección + caché (funciones puras) ─────────────────────── */

/** ¿Este `userAgent` + presencia de `window.__TAURI__` es Android/Tauri móvil? */
export function esAndroidTauri(userAgent: string, tieneTauri: boolean): boolean {
  return tieneTauri && /android/i.test(userAgent || "");
}

/** Forma cacheada en localStorage (TTL de 6h, ver el componente). */
export interface CacheReleaseAndroid {
  guardadoEn: number;
  release: GithubReleaseMin | null;
}

/** ¿Sigue siendo válida (dentro del TTL) una entrada de caché? Tolera relojes raros. */
export function cacheReleaseValida(
  cache: CacheReleaseAndroid | null | undefined,
  ahoraMs: number,
  ttlMs: number = 6 * 60 * 60 * 1000,
): boolean {
  if (!cache || typeof cache.guardadoEn !== "number") return false;
  const edad = ahoraMs - cache.guardadoEn;
  return edad >= 0 && edad < ttlMs;
}
