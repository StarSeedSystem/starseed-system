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

import { avisoResuelto, estadoAviso, leerAvisos, marcarAviso } from "@/lib/sync/avisos-cuenta";
import { safeGet, safeSet } from "@/lib/safe-storage";
// (Ola 1021I) La unión de lo visto la hace la puerta común (función pura, sin
// efectos aquí): `unirVistas(local, cuenta)` de guia-acceso.ts.
import { unirVistas } from "@/lib/onboarding/guia-acceso";

/** Marca local histórica («1» = vista). Se conserva por compatibilidad hacia atrás. */
export const CLAVE_GUIA_VISTA_LOCAL = "starseed.guide.seen.v1";

/** Id del aviso en la cuenta. */
export const AVISO_GUIA_BIENVENIDA = "guia.bienvenida";

/**
 * (Ola 1021I) Lo VISTO de la guía en modo invitado, guardado en el APARATO:
 * sin cuenta no hay marca que viaje con nadie, así que los temas vistos se
 * anotan en esta clave local (JSON: lista de claves, acotada). Cuando aparece
 * una cuenta, `unirVistasInvitadoACuenta` las une a la marca de la cuenta con
 * `unirVistas` (guia-acceso.ts) y cada clave queda constando en la cuenta.
 */
export const CLAVE_GUIA_VISTAS_LOCAL = "starseed.guide.vistas.v1";

/** Prefijo del id de cada tema visto en la cuenta (avisos-cuenta). */
export const PREFIJO_GUIA_TEMA = "guia.tema.";

/** Tope de la lista: lo «visto» no puede crecer sin límite en el aparato. */
const TOPE_VISTAS = 60;

function vistaEnEsteMedio(): boolean {
  return safeGet(CLAVE_GUIA_VISTA_LOCAL) === "1";
}

function vistaEnCuenta(): boolean {
  return avisoResuelto(estadoAviso(AVISO_GUIA_BIENVENIDA));
}

/** Sanea CUALQUIER valor a una lista válida de claves vistas (sin duplicados, acotada). */
function clavesDeUnaLista(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  const salida: string[] = [];
  for (const elemento of valor) {
    if (typeof elemento === "string" && elemento && !salida.includes(elemento)) salida.push(elemento);
  }
  return salida.slice(0, TOPE_VISTAS);
}

/** Lo visto como invitado EN ESTE aparato. Nunca lanza; lista siempre válida. */
export function vistasInvitado(): string[] {
  try {
    const guardado = safeGet(CLAVE_GUIA_VISTAS_LOCAL);
    return clavesDeUnaLista(guardado ? JSON.parse(guardado) : []);
  } catch {
    return [];
  }
}

/**
 * (Ola 1021I) Una vista nueva en modo invitado: queda marcada en el aparato,
 * una sola vez. Devuelve si se anotó algo nuevo.
 */
export function recordarVistaInvitado(clave: string): boolean {
  try {
    const actuales = vistasInvitado();
    if (!clave || actuales.includes(clave)) return false;
    safeSet(CLAVE_GUIA_VISTAS_LOCAL, JSON.stringify(clavesDeUnaLista([...actuales, clave])));
    return true;
  } catch {
    return false;
  }
}

/** Lo que la cuenta ya tiene constado (ids `guia.tema.<clave>` de avisos-cuenta). */
function vistasDeCuenta(): string[] {
  const salida: string[] = [];
  try {
    for (const [id, registro] of Object.entries(leerAvisos().ids)) {
      if (!id.startsWith(PREFIJO_GUIA_TEMA) || registro.estado === "luego") continue;
      salida.push(id.slice(PREFIJO_GUIA_TEMA.length));
    }
  } catch {
    /* si la cuenta aún no sabe nada, no aporta nada */
  }
  return salida;
}

/**
 * (Ola 1021I) Al entrar con una cuenta, lo VISTO como invitado (aparato) se une
 * a la vista de la cuenta con `unirVistas` (guia-acceso.ts) y cada clave de la
 * unión queda constando en la cuenta (avisos-cuenta, id `guia.tema.<clave>`,
 * estado «visto»). Idempotente: lo que la cuenta ya tiene no se reescribe, y las
 * vistas del aparato se conservan para no perder nada nunca. Devuelve si se
 * añadieron vistas nuevas a la cuenta.
 */
export function unirVistasInvitadoACuenta(): boolean {
  try {
    const unidas = unirVistas(vistasInvitado(), vistasDeCuenta());
    let nuevas = 0;
    for (const clave of unidas) {
      const id = PREFIJO_GUIA_TEMA + clave;
      const registro = leerAvisos().ids[id];
      if (registro && avisoResuelto(estadoAviso(id))) continue;
      marcarAviso(id, "visto");
      nuevas++;
    }
    return nuevas > 0;
  } catch {
    return false;
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
    // (Ola 1021I) Este es el punto documentado de «local → cuenta»: además de la
    // marca antigua, lo VISTO como invitado se une a la marca de la cuenta
    // (unirVistasInvitadoACuenta, idempotente — sin daño llamarlo aquí).
    unirVistasInvitadoACuenta();
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
