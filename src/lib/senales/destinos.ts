// src/lib/senales/destinos.ts
/**
 * Destinos de navegación de Señales y de la red social (FEED1108A · 2026-11-08).
 * ============================================================================
 * Alex retiró la sección «Feed de red» (`/red-feed`): su contenido (la bandeja de
 * lo recibido de otras neuronas) vive ahora en el panel «Actividad de red recibida»
 * de Señales, y la idea de fondo (mensajes entre neuronas) en Mensajes › Neuronas.
 * Módulo PURO (sin React): lo comparten la redirección de `/red-feed`, el panel y
 * los widgets que antes apuntaban a la sección retirada.
 */

/** Señales con el panel «Actividad de red recibida» abierto y a la vista. */
export const RUTA_SENALES_LLEGADAS = "/senales?vista=llegadas";

/** Valor de `?vista=` que abre el panel de llegadas en Señales. */
export const VISTA_LLEGADAS = "llegadas";

/** Mensajes, pestaña «Neuronas» (chats con las neuronas por la malla o el servidor). */
export const RUTA_MENSAJES_NEURONAS = "/messages?vista=neuronas";

/** La red social (publicaciones de la gente, grupos, páginas): sección «Red» del Hub. */
export const RUTA_RED_SOCIAL = "/hub?tab=red";

/** ¿La cadena de búsqueda (`location.search`) pide el panel de llegadas abierto? */
export function pideVistaLlegadas(search: string | null | undefined): boolean {
  if (!search) return false;
  try {
    return new URLSearchParams(search).get("vista") === VISTA_LLEGADAS;
  } catch {
    return false;
  }
}
