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

function vistaEnEsteMedio(): boolean {
  return safeGet(CLAVE_GUIA_VISTA_LOCAL) === "1";
}

function vistaEnCuenta(): boolean {
  return avisoResuelto(estadoAviso(AVISO_GUIA_BIENVENIDA));
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

/** La persona cerró o terminó la guía: consta en este medio y en la cuenta. */
export function marcarGuiaVista(): void {
  try {
    safeSet(CLAVE_GUIA_VISTA_LOCAL, "1");
  } catch {
    /* sin almacenamiento local: la cuenta basta */
  }
  try {
    if (!vistaEnCuenta()) marcarAviso(AVISO_GUIA_BIENVENIDA, "hecho");
  } catch {
    /* nunca rompe el cierre de la guía */
  }
}
