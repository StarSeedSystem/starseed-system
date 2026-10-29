"use client";

/**
 * Escudo para las escenas 3D del contenido vivo (CVV1028D).
 * ============================================================================
 * Un iframe 3D no debe atrapar la rueda ni el gesto de scroll de la página.
 * `ponerEscudo` coloca una capa transparente encima del iframe:
 *
 *  · Escenas propias (`my.spline.design` y el visor 3D del OS): la capa
 *    reenvía pointermove, pointerleave, pointerdown, pointerup y click por
 *    `postMessage` con coordenadas relativas (0–1), para que la escena siga
 *    reaccionando sin quedarse con el scroll.
 *  · Escenas ajenas: solo la capa. Sin píldoras, sin «haz clic para jugar».
 *
 * La rueda nunca se reenvía ni se cancela: siempre desplaza la página.
 * Devuelve una función para retirar la capa y sus oyentes.
 */

export type EventoReenviado = "pointermove" | "pointerleave" | "pointerdown" | "pointerup" | "click";

const EVENTOS: readonly EventoReenviado[] = [
  "pointermove",
  "pointerleave",
  "pointerdown",
  "pointerup",
  "click",
];

const HOSTS_PROPIOS = new Set(["my.spline.design"]);
const RUTAS_PROPIAS = ["/escena", "/sala-xr", "/red-3d", "/memorias-3d", "/mundo-avatares"];

/** ¿La escena es del OS o de nuestro estudio de Spline? */
export function esEscenaPropia(iframe: HTMLIFrameElement): boolean {
  return false;
}

/** Coordenadas del puntero dentro del iframe, siempre entre 0 y 1. */
export function coordenadasRelativas(
  evento: Pick<MouseEvent, "clientX" | "clientY">,
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
): { x: number; y: number } {
  return { x: 0, y: 0 };
}

/** Coloca el escudo y devuelve la función que lo retira. */
export function ponerEscudo(iframe: HTMLIFrameElement): () => void {
  return () => {};
}
