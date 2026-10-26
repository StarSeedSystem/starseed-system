/**
 * Guía de introducción · la puerta común para abrirla (§5 de `architecture/guias-introduccion.md`).
 * ═══════════════════════════════════════════════════════════════════════════
 * «Una sola puerta»: quien quiera abrir la guía (la pantalla de acceso, la bienvenida, Ajustes,
 * cada aviso «Inicia sesión para…», un botón suelto) llama a `abrirGuia({desde, temaInicial?})`,
 * que lanza el evento de siempre (`starseed:open-guide`, el que escucha `aurora-guide.tsx`) con de
 * dónde se abre y, si se quiere, el tema por el que empezar.
 *
 * (Ola 1025U · GUIA1025U) La guía que abre este evento recorre el catálogo único de pasos
 * (`guia-completa.ts`, el mismo que la introducción de la ventana de acceso): `temaInicial` es el id de
 * cualquiera de esos pasos y `desde` decide qué hace el final de la guía sin cuenta (en `/login` y
 * `/bienvenida` el formulario ya está detrás; desde cualquier otro sitio se abre la ventana de acceso).
 * Sin `temaInicial`, la guía retoma por donde se quedó (`guia-progreso.ts`) o empieza desde el principio.
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

/* ─────────── Lo que pide la guía al terminar sin cuenta (solo en /login y /bienvenida) ─────────── */

/** El evento con el que la guía le dice a la ventana de acceso de la PÁGINA que vaya al formulario. */
export const EVENTO_ACCION_GUIA = "starseed:guia-accion";

/** Qué pidió quien terminó la guía sin cuenta. */
export type AccionGuia = "crear-cuenta" | "entrar";

/**
 * La guía (que va por encima de la página de acceso) pide ir al formulario en la pestaña que toque.
 * Devuelve `true` si el evento salió. Nunca lanza.
 */
export function pedirAccesoDesdeGuia(accion: AccionGuia, destino?: EventTarget | null): boolean {
  const objetivo = destino ?? (typeof window === "undefined" ? null : window);
  if (!objetivo || typeof CustomEvent === "undefined") return false;
  try {
    objetivo.dispatchEvent(new CustomEvent<{ accion: AccionGuia }>(EVENTO_ACCION_GUIA, { detail: { accion } }));
    return true;
  } catch {
    return false;
  }
}
