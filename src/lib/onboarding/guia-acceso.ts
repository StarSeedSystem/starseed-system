/**
 * Guía de introducción · puerta común y reglas del modo invitado
 * (§5 de `architecture/guias-introduccion.md`).
 * ═══════════════════════════════════════════════════════════════════════════
 * UNA sola puerta para abrir la guía desde cualquier ventana de acceso
 * (`login`, `bienvenida`, `aviso`), desde Ajustes o desde un botón, con o sin
 * cuenta. Lanza el MISMO evento de siempre (`starseed:open-guide`), el que ya
 * escucha `aurora-guide.tsx`; aquí viven además las reglas del modo invitado,
 * para que no queden al criterio de cada pantalla.
 *
 * Módulo PURO: sin React, sin `node:*`, sin red ni Supabase. Si no hay
 * `window` (SSR, Node), `abrirGuia` no hace nada y no lanza: la guía nunca se
 * queda en bucle por un medio sin DOM.
 */

/** Mismo valor que `OPEN_GUIDE_EVENT` de `aurora-guide.tsx` (la prueba compara el texto). */
export const EVENTO_ABRIR_GUIA = "starseed:open-guide";

/** Desde dónde se puede abrir la guía. */
export const ORIGENES_GUIA = ["login", "bienvenida", "ajustes", "aviso", "boton"] as const;
export type OrigenGuia = (typeof ORIGENES_GUIA)[number];

/** Lo que viaja en el evento: de dónde se abre y, si se quiere, el tema inicial. */
export interface PeticionGuia {
  desde: OrigenGuia;
  temaInicial?: string;
}

/** Con sesión, guía de cuenta; sin ella, invitado (nunca hay tercera cosa). */
export type ModoGuia = "invitado" | "cuenta";

/** Lo que se ofrece en cada paso según el modo (en invitado, detrás del acceso). */
export interface AccionesPaso {
  puedeIr: boolean;
  puedeHazloPorMi: boolean;
  etiqueta: string | null;
}

/** Etiqueta honesta que sustituye a «Ir» y «Hazlo por mí» sin cuenta. */
export const ETIQUETA_SOLO_CUENTA = "Disponible al entrar";

/** Ventanas de acceso sobre las que la guía se pinta (AuthGate, bienvenida, avisos). */
export const VENTANAS_ACCESO: readonly OrigenGuia[] = ["login", "bienvenida", "aviso"];

/** Capa de HOY del panel de la guía (`aurora-guide.tsx`, `z-[95]`). */
export const Z_GUIA_HOY = 95;
/** Por encima de AuthGate (z 200) y la bienvenida (z 210), con margen. */
export const Z_GUIA_SOBRE_ACCESO = 240;

/**
 * La PUERTA: un solo evento, el de siempre, con `desde` y el tema inicial si lo
 * hay. Sin `window` (o sin `CustomEvent`) devuelve `false` y no lanza.
 * `destino` permite inyectar otro `EventTarget` en las pruebas.
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

/** Con sesión, guía de cuenta; sin ella, invitado. */
export function modoGuia(haySesion: boolean): ModoGuia {
  return haySesion ? "cuenta" : "invitado";
}

/** Acciones del paso según el modo: en invitado se reservan a la cuenta. */
export function accionesDelPaso(modo: ModoGuia): AccionesPaso {
  if (modo === "cuenta") return { puedeIr: true, puedeHazloPorMi: true, etiqueta: null };
  return { puedeIr: false, puedeHazloPorMi: false, etiqueta: ETIQUETA_SOLO_CUENTA };
}

/**
 * Capa de la guía: desde una ventana de acceso, o sin sesión (el invitado está
 * aún más tapado), por encima de todo (240); con sesión y abierta a mano o
 * desde Ajustes, la de hoy (95) para no tapar nada.
 */
export function zGuia(desde: OrigenGuia, haySesion: boolean): number {
  const esVentanaAcceso = VENTANAS_ACCESO.includes(desde);
  return !haySesion || esVentanaAcceso ? Z_GUIA_SOBRE_ACCESO : Z_GUIA_HOY;
}

/**
 * Une lo visto como INVITADO (guardado en el aparato) a la marca de la CUENTA
 * sin perder nada ni duplicar: primero lo que la cuenta ya sabía y detrás,
 * nuevo, lo del aparato. Idempotente: unir dos veces no repite claves.
 */
export function unirVistas(local: readonly string[], cuenta: readonly string[]): string[] {
  const unidas: string[] = [];
  for (const vista of [...cuenta, ...local]) {
    const clave = (vista ?? "").trim();
    if (clave && !unidas.includes(clave)) unidas.push(clave);
  }
  return unidas;
}
