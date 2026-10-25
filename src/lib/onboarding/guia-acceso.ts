/**
 * Guía de introducción · la puerta común para abrirla (§5 de `architecture/guias-introduccion.md`).
 * ═══════════════════════════════════════════════════════════════════════════
 * «Una sola puerta»: la pantalla de acceso, la bienvenida, Ajustes, cada aviso «Inicia sesión
 * para…» o un botón suelto llaman a `abrirGuia({desde, temaInicial?})`, que lanza el evento de
 * siempre (`starseed:open-guide`, el que escucha `aurora-guide.tsx`) con de dónde se abre y, si
 * se quiere, el tema por el que empezar.
 *
 * Aquí viven también las reglas del modo invitado (GUI1021I): si hay sesión, qué acciones del
 * paso se ofrecen, en qué capa se pinta la guía y cómo se une lo visto sin cuenta a la marca de
 * la cuenta. Sus consumidores se cablean en la parte siguiente de esta cadena (GUI1021Id):
 * `aurora-guide.tsx` aplicará acciones y capa, `guia-vista.ts` unirá lo visto al entrar y los
 * botones de cada ventana de acceso son de GUI1021K–O.
 *
 * Módulo PURO: sin React ni `node:*`; el destino del evento es inyectable para probarlo.
 */

import type { TemaGuia } from "./guia-temas-sistema";

/** El evento que escucha la guía (mismo nombre que `OPEN_GUIDE_EVENT` de `aurora-guide.tsx`). */
export const EVENTO_ABRIR_GUIA = "starseed:open-guide";

/** Desde dónde se puede abrir la guía. */
export const ORIGENES_GUIA = ["login", "bienvenida", "ajustes", "aviso", "boton"] as const;
export type OrigenGuia = (typeof ORIGENES_GUIA)[number];

/** Lo que viaja en el evento: de dónde se abre y, opcionalmente, la clave del tema inicial. */
export interface PeticionGuia {
  desde: OrigenGuia;
  temaInicial?: TemaGuia["key"];
}

export type ModoGuia = "invitado" | "cuenta";

/** Lo que se ofrece en cada paso según el modo. */
export interface AccionesPaso {
  puedeIr: boolean;
  puedeHazloPorMi: boolean;
  etiqueta: string | null;
}

/** Etiqueta única para las acciones reservadas a la cuenta (con acentos). */
export const ETIQUETA_SOLO_CUENTA = "Disponible al entrar";

/** Orígenes que son ventanas de acceso encima de las que la guía se pinta. */
export const VENTANAS_ACCESO: readonly OrigenGuia[] = ["login", "bienvenida", "aviso"];

/** Altura de HOY del panel de la guía (`aurora-guide.tsx`, `z-[95]`). */
export const Z_GUIA_HOY = 95;
/** Por encima de AuthGate (z 200) y la bienvenida (z 210), con margen. */
export const Z_GUIA_SOBRE_ACCESO = 240;

/** Con sesión, guía de cuenta; sin ella, invitado (nunca hay tercera cosa). */
export function modoGuia(haySesion: boolean): ModoGuia {
  return haySesion ? "cuenta" : "invitado";
}

/**
 * Lo que se ofrece en CADA paso según el modo. En invitado «Ir» y «Hazlo por
 * mí» van detrás de la pantalla de acceso: no se ofrecen; se muestra la
 * etiqueta honesta «Disponible al entrar». Con cuenta, la guía de siempre.
 */
export function accionesDelPaso(modo: ModoGuia): AccionesPaso {
  if (modo === "cuenta") return { puedeIr: true, puedeHazloPorMi: true, etiqueta: null };
  return { puedeIr: false, puedeHazloPorMi: false, etiqueta: ETIQUETA_SOLO_CUENTA };
}

/**
 * Capa de la guía: desde una ventana de acceso, o sin sesión (el invitado
 * está AÚN más tapado), por encima de todo (240). Con sesión y abierta a mano
 * o desde Ajustes, la de hoy (95) para no ponerse por encima de nada que no toque.
 */
export function zGuia(desde: OrigenGuia, haySesion: boolean): number {
  const esVentanaAcceso = (VENTANAS_ACCESO as readonly string[]).includes(desde);
  return !haySesion || esVentanaAcceso ? Z_GUIA_SOBRE_ACCESO : Z_GUIA_HOY;
}

/**
 * Abre la guía. Devuelve `true` si el evento salió y `false` si no había dónde lanzarlo (servidor)
 * o el navegador lo impidió. Nunca lanza.
 */
export function abrirGuia(peticion: PeticionGuia, destino?: EventTarget | null): boolean {
  const objetivo = destino ?? (typeof window === "undefined" ? null : window);
  if (!objetivo || typeof CustomEvent === "undefined") return false;
  const detalle: PeticionGuia = { desde: peticion.desde };
  if (peticion.temaInicial) detalle.temaInicial = peticion.temaInicial;
  try {
    objetivo.dispatchEvent(new CustomEvent<PeticionGuia>(EVENTO_ABRIR_GUIA, { detail: detalle }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Une lo visto como INVITADO (claves guardadas en el aparato) a la marca de la
 * CUENTA, sin perder nada ni duplicar: primero lo de la cuenta y detrás lo
 * nuevo del aparato. Idempotente: unir dos veces lo mismo no repite claves.
 */
export function unirVistas(local: readonly string[], cuenta: readonly string[]): string[] {
  const unidas: string[] = [];
  for (const vista of [...cuenta, ...local]) {
    const clave = (vista ?? "").trim();
    if (clave && !unidas.includes(clave)) unidas.push(clave);
  }
  return unidas;
}
