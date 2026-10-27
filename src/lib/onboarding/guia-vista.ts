/**
 * Guía de bienvenida vista — con la cuenta (2026-09-29, persistencia entre medios).
 * ═══════════════════════════════════════════════════════════════════════════
 * «Hay ventanas que reaparecen al reiniciar». La guía (`aurora-guide.tsx`) se abría sola la
 * primera vez y recordaba «ya la vi» en `starseed.guide.seen.v1`, una clave que NO viaja con la
 * cuenta: cada medio (localhost:9002, starseed-os.vercel.app, la PWA, la app Tauri) la volvía a
 * abrir como si nunca la hubieras visto.
 *
 * Ahora «vista» es una marca de la CUENTA (`avisos-cuenta`, id `guia.bienvenida`, estado «hecho»),
 * y la marca local antigua se sigue respetando y se copia a la cuenta la primera vez que se lee.
 * Reabrir la guía a demanda no depende de nada de esto (evento `starseed:open-guide`).
 *
 * Sin React: se prueba en Node/jsdom. Nunca lanza.
 */

import { avisoResuelto, estadoAviso, marcarAviso } from "@/lib/sync/avisos-cuenta";
import { safeGet, safeSet } from "@/lib/safe-storage";

/** Marca local histórica («1» = vista). Se conserva por compatibilidad hacia atrás. */
export const CLAVE_GUIA_VISTA_LOCAL = "starseed.guide.seen.v1";

/** Id del aviso en la cuenta. */
export const AVISO_GUIA_BIENVENIDA = "guia.bienvenida";

/** Versión actual de la guía: súbela al añadir temas nuevos (§2 de `architecture/guias-introduccion.md`). */
export const GUIA_VERSION = 2;

/** Los diez temas que entraron en la versión 2, en el orden del catálogo único. */
export const TEMAS_NUEVOS_V2 = [
  "protomolecula",
  "malla",
  "capas-conciencia",
  "neuronas-cerebro",
  "pilar-politica",
  "pilar-educacion",
  "pilar-cultura",
  "libreria-biblioteca",
  "genesis",
  "personalizacion-segura",
] as const;

/** Id de la marca de la cuenta para una versión concreta: `guia.bienvenida.v2`, `…v3`… */
function avisoVersion(version: number): string {
  return `${AVISO_GUIA_BIENVENIDA}.v${version}`;
}

/**
 * Temas que le faltan a una cuenta que vio la guía en `versionVista`. Puro: sin almacén.
 * `null`/`undefined` = nunca la vio (entonces la guía entera la espera; esto no son «novedades»).
 * Una cuenta de la versión 1 tiene pendientes los diez temas de §3.
 */
export function temasNuevosPara(versionVista: number | null | undefined): readonly string[] {
  if (versionVista === null || versionVista === undefined) return [];
  if (!Number.isFinite(versionVista) || versionVista >= GUIA_VERSION) return [];
  return TEMAS_NUEVOS_V2;
}

function vistaEnEsteMedio(): boolean {
  return safeGet(CLAVE_GUIA_VISTA_LOCAL) === "1";
}

function vistaEnCuenta(): boolean {
  return avisoResuelto(estadoAviso(AVISO_GUIA_BIENVENIDA));
}

/**
 * Versión de la guía que consta en la CUENTA (llega a todos sus medios), o `null` si nunca la vio.
 * Las cuentas anteriores a las versiones con marca propia valen como versión 1.
 */
export function versionGuiaVistaEnCuenta(): number | null {
  try {
    for (let v = GUIA_VERSION; v >= 2; v--) {
      if (avisoResuelto(estadoAviso(avisoVersion(v)))) return v;
    }
    return vistaEnCuenta() ? 1 : null;
  } catch {
    return null;
  }
}

/** ¿Ya se vio la guía, en este medio o en cualquier otro de la cuenta? */
export function guiaVistaAqui(): boolean {
  try {
    return vistaEnEsteMedio() || vistaEnCuenta();
  } catch {
    return false;
  }
}

/**
 * Si este medio ya la vio pero la cuenta no lo sabe, se lo cuenta (para que los demás medios la
 * hereden). Idempotente. Devuelve si la guía consta como vista.
 */
export function copiarGuiaLocalACuenta(): boolean {
  try {
    const local = vistaEnEsteMedio();
    if (local && !vistaEnCuenta()) marcarAviso(AVISO_GUIA_BIENVENIDA, "hecho");
    return local || vistaEnCuenta();
  } catch {
    return false;
  }
}

/**
 * La persona cerró o terminó la guía: consta en este medio y en la cuenta, con la versión vista.
 * La versión viaja en una marca más de la MISMA cuenta (`guia.bienvenida.vN`), así que llega a
 * todos sus medios y el aviso de novedades no vuelve a salir en ninguno.
 */
export function marcarGuiaVista(version: number = GUIA_VERSION): void {
  try {
    safeSet(CLAVE_GUIA_VISTA_LOCAL, "1");
  } catch {
    /* sin almacenamiento local: la cuenta basta */
  }
  try {
    if (!vistaEnCuenta()) marcarAviso(AVISO_GUIA_BIENVENIDA, "hecho");
    const v = Math.min(version, GUIA_VERSION);
    if (v >= 2 && !avisoResuelto(estadoAviso(avisoVersion(v)))) {
      marcarAviso(avisoVersion(v), "hecho");
    }
  } catch {
    /* nunca rompe el cierre de la guía */
  }
}
